import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom, userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import {
    Cpu,
    Check,
    AlertCircle,
    RefreshCw,
    Copy,
    ChevronDown,
    Zap,
    Terminal,
    Laptop,
    Smartphone,
    Radio,
    Cloud,
} from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
import { TactileSwitch } from '../../components/TactileSwitch';
import { colibriProvider, isColibriAvailable } from '../../lib/ai/providers/colibri';
import {
    getProviderConfig,
    setProviderConfig,
    AI_CONFIG_EVENT,
} from '../../lib/ai/providerKeys';
import { getRoute, setRoute } from '../../lib/ai/routing';
import type { ProviderConfig } from '../../lib/ai/providers/types';
import {
    ONYX_MESH_TOPOLOGY,
    MESH_NODES,
    SUPABASE_RELAY_URL,
    pingMeshNode,
} from '../../lib/network/localMeshMap';

interface TestStatus {
    ok: boolean;
    message: string;
}

type ConnectionMode = 'cloud' | 'localhost' | 'mesh' | 'custom';

const PRESET_URLS: Record<'cloud' | 'localhost' | 'mesh', string> = {
    cloud: SUPABASE_RELAY_URL,
    localhost: 'http://127.0.0.1:8082',
    mesh: `http://${ONYX_MESH_TOPOLOGY.g7.ip}:8082`,
};

function detectDefaultUrl(): string {
    if (typeof window === 'undefined') return 'http://127.0.0.1:8082';
    const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (isIOS || (isHttps && !isLocalhost)) {
        return SUPABASE_RELAY_URL;
    }
    return 'http://127.0.0.1:8082';
}

function resolveMode(url: string): ConnectionMode {
    if (url === PRESET_URLS.cloud) return 'cloud';
    if (url === PRESET_URLS.localhost || url === 'http://localhost:8082') return 'localhost';
    if (url === PRESET_URLS.mesh) return 'mesh';
    return 'custom';
}

export const ColibriSettingsCard: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const [user] = useAtom(userAtom);
    const isAqua = theme === 'aqua';
    const isDevOrAdmin = !user?.role || user.role === 'Developer' || user.role === 'Admin';

    // Device detection for smart UI context
    const isIOSDevice =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    const [endpoint, setEndpoint] = useState<string>(() => {
        return getProviderConfig('colibri').baseUrl || detectDefaultUrl();
    });
    const [model, setModel] = useState<string>(() => {
        return getProviderConfig('colibri').model || 'colibri-glm-5.2-moe';
    });

    const [isChanActive, setIsChanActive] = useState<boolean>(() => {
        return getRoute('chat').provider === 'colibri';
    });

    const [onlineStatus, setOnlineStatus] = useState<boolean | null>(null);
    const [telemetry, setTelemetry] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [testResult, setTestResult] = useState<TestStatus | null>(null);

    const [relayDrawerOpen, setRelayDrawerOpen] = useState<boolean>(false);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    const [nodePings, setNodePings] = useState<
        Record<string, { ok: boolean; latencyMs: number; status: string }>
    >({});
    const [pingingNodes, setPingingNodes] = useState<boolean>(false);

    const [activeMode, setActiveMode] = useState<ConnectionMode>(() => resolveMode(endpoint));

    const refreshConfig = useCallback(() => {
        const cfg = getProviderConfig('colibri');
        const ep = cfg.baseUrl || detectDefaultUrl();
        setEndpoint(ep);
        setActiveMode(resolveMode(ep));
        setModel(cfg.model || 'colibri-glm-5.2-moe');
        setIsChanActive(getRoute('chat').provider === 'colibri');
    }, []);

    const pingDaemon = useCallback(async (targetUrl: string) => {
        try {
            const ok = await isColibriAvailable(targetUrl);
            setOnlineStatus(ok);
            if (ok) {
                if (targetUrl === SUPABASE_RELAY_URL) {
                    setTelemetry('WSS Cloud Bridge');
                    return;
                }
                const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/health`, {
                    headers: { Accept: 'application/json' },
                }).catch(() => null);
                if (res && res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.telemetry?.nvmeReadMBps) {
                        setTelemetry(
                            `${data.telemetry.nvmeReadMBps} MB/s • ${data.telemetry.tokensPerSecond || 26} t/s`
                        );
                    } else if (data.relayGateway?.active) {
                        setTelemetry(`Relay ${data.relayGateway.upstreamHost}`);
                    } else {
                        setTelemetry('NVMe Direct');
                    }
                } else {
                    setTelemetry('NVMe Ready');
                }
            } else {
                setTelemetry(null);
            }
        } catch {
            setOnlineStatus(false);
            setTelemetry(null);
        }
    }, []);

    const handlePingAllNodes = useCallback(async () => {
        setPingingNodes(true);
        const results: Record<string, { ok: boolean; latencyMs: number; status: string }> = {};
        for (const node of MESH_NODES) {
            results[node.id] = await pingMeshNode(node);
        }
        setNodePings(results);
        setPingingNodes(false);
    }, []);

    useEffect(() => {
        refreshConfig();
        pingDaemon(endpoint);
        window.addEventListener(AI_CONFIG_EVENT, refreshConfig);
        return () => window.removeEventListener(AI_CONFIG_EVENT, refreshConfig);
    }, [refreshConfig, pingDaemon, endpoint]);

    const handleSave = (newEndpoint?: string, newModel?: string) => {
        const ep = (newEndpoint ?? endpoint).trim() || detectDefaultUrl();
        const mod = (newModel ?? model).trim() || 'colibri-glm-5.2-moe';
        const patch: Partial<ProviderConfig> = {
            baseUrl: ep,
            model: mod,
        };
        setProviderConfig('colibri', patch);
        pingDaemon(ep);
    };

    const handleSelectMode = (mode: ConnectionMode) => {
        setActiveMode(mode);
        if (mode !== 'custom') {
            const newUrl = PRESET_URLS[mode];
            setEndpoint(newUrl);
            handleSave(newUrl, undefined);
        }
    };

    const handleToggleChanChat = (active: boolean) => {
        setIsChanActive(active);
        if (active) {
            setRoute('chat', { provider: 'colibri', model: model || 'colibri-glm-5.2-moe' });
        } else {
            setRoute('chat', null);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const cfg: ProviderConfig = {
                key: '',
                baseUrl: endpoint.trim() || detectDefaultUrl(),
                model: model || 'colibri-glm-5.2-moe',
            };
            const res = await colibriProvider.test(cfg);
            setTestResult(res);
            setOnlineStatus(res.ok);
            if (res.ok) {
                pingDaemon(cfg.baseUrl || detectDefaultUrl());
            }
        } catch (err: any) {
            setTestResult({
                ok: false,
                message: err?.message || tr("Unreachable"),
            });
            setOnlineStatus(false);
        } finally {
            setIsTesting(false);
        }
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedCmd(label);
        setTimeout(() => setCopiedCmd(null), 2000);
    };

    const relayLaunchCmd = `node scripts/colibri-supabase-relay.cjs`;

    return (
        <LazyMotion features={domMax}>
            <div className={`colibri-settings-card ${isAqua ? 'colibri-settings-card--aqua' : ''}`}>
                {/* Row 1: Compact Header + Live Status + Chan Chat Switch */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-(--ss-sep) gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
                            <Cpu size={14} className={onlineStatus ? 'animate-pulse' : ''} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-(--ss-fg) truncate">
                                    Colibrì MoE
                                </span>
                                <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        onlineStatus === true
                                            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                                            : onlineStatus === false
                                            ? 'bg-amber-400'
                                            : 'bg-white/30 animate-pulse'
                                    }`}
                                />
                                <span className="text-[10px] font-mono text-(--ss-fg2) truncate">
                                    {onlineStatus === true
                                        ? telemetry || tr("Online")
                                        : isIOSDevice
                                        ? 'iOS WSS Ready'
                                        : tr("Standby")}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Inline Chan Chat Toggle + Ping */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-(--ss-field) border border-(--ss-sep)">
                            <span className="text-[10.5px] font-medium text-(--ss-fg2)">
                                {tr("Chan")}
                            </span>
                            <TactileSwitch
                                active={isChanActive}
                                onChange={handleToggleChanChat}
                                width={36}
                                height={20}
                                aria-label={tr("Route Chan Chat to Colibrì")}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="ss-glass-pill h-7 px-2.5 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-[11px] font-semibold flex items-center gap-1"
                            title={tr("Test Colibrì Bridge")}
                        >
                            <RefreshCw size={11} className={isTesting ? 'animate-spin' : ''} />
                            <span>{tr("Ping")}</span>
                        </button>
                    </div>
                </div>

                {/* Row 2: Transport Mode Segmented Bar + Model Pill */}
                <div className="p-2.5 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        {/* 4-Mode Transport Switcher with Sliding Pill */}
                        <div className="sm:col-span-7 flex items-center p-0.5 rounded-xl bg-(--ss-field) border border-(--ss-sep) h-8">
                            {(
                                [
                                    { id: 'cloud', label: '☁️ WSS Relay' },
                                    { id: 'localhost', label: '💻 G7 :8082' },
                                    { id: 'mesh', label: '🌐 LAN' },
                                    { id: 'custom', label: '⚙️ URL' },
                                ] as { id: ConnectionMode; label: string }[]
                            ).map((mItem) => {
                                const active = activeMode === mItem.id;
                                return (
                                    <button
                                        key={mItem.id}
                                        type="button"
                                        onClick={() => handleSelectMode(mItem.id)}
                                        className={`relative flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-semibold transition-colors truncate z-10 ${
                                            active
                                                ? 'text-(--ss-on-accent)'
                                                : 'text-(--ss-fg2) hover:text-(--ss-fg)'
                                        }`}
                                    >
                                        {active && (
                                            <m.span
                                                layoutId="colibri-mode-pill"
                                                className="ss-top-tab-pill rounded-lg"
                                                transition={{
                                                    type: 'spring',
                                                    stiffness: 420,
                                                    damping: 32,
                                                }}
                                            />
                                        )}
                                        <span className="relative z-10">{mItem.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Compact Model Select */}
                        <div className="sm:col-span-5">
                            <select
                                value={model}
                                onChange={(e) => {
                                    const newModel = e.target.value;
                                    setModel(newModel);
                                    handleSave(undefined, newModel);
                                    if (isChanActive) {
                                        setRoute('chat', { provider: 'colibri', model: newModel });
                                    }
                                }}
                                aria-label={tr("Colibrì Model")}
                                className="w-full h-8 px-2.5 rounded-xl bg-(--ss-field) border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400"
                            >
                                <option value="colibri-glm-5.2-moe">glm-5.2-moe (Fast)</option>
                                <option value="colibri-kimi-k3-moe">kimi-k3-moe (Deep)</option>
                                <option value="colibri-qwen-2.5-3b">qwen-2.5-3b (Dense)</option>
                            </select>
                        </div>
                    </div>

                    {/* Custom URL Input (Animated) */}
                    <AnimatePresence initial={false}>
                        {activeMode === 'custom' && (
                            <m.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-center gap-1.5 pt-0.5">
                                    <input
                                        type="url"
                                        value={endpoint}
                                        onChange={(e) => setEndpoint(e.target.value)}
                                        onBlur={() => handleSave()}
                                        placeholder="http://127.0.0.1:8082"
                                        className="flex-1 h-7 px-2.5 rounded-lg bg-(--ss-field) border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleSave()}
                                        className="h-7 px-2.5 rounded-lg bg-(--ss-fill) hover:bg-(--ss-fill-hover) text-(--ss-fg) text-[10.5px] font-semibold border border-(--ss-sep)"
                                    >
                                        {tr("Save")}
                                    </button>
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>

                    {/* Compact Test Result Micro-Strip */}
                    <AnimatePresence initial={false}>
                        {testResult && (
                            <m.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-2 ${
                                    testResult.ok
                                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                        : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {testResult.ok ? (
                                        <Check size={12} className="text-emerald-400 shrink-0" />
                                    ) : (
                                        <AlertCircle size={12} className="text-amber-400 shrink-0" />
                                    )}
                                    <span className="truncate">{testResult.message}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setTestResult(null)}
                                    className="text-[10px] opacity-70 hover:opacity-100 shrink-0"
                                >
                                    ✕
                                </button>
                            </m.div>
                        )}
                    </AnimatePresence>

                    {/* Role-Aware Micro Mesh & CLI Drawer */}
                    {isDevOrAdmin && (
                        <div>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !relayDrawerOpen;
                                    setRelayDrawerOpen(next);
                                    if (next) handlePingAllNodes();
                                }}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-left transition-colors"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-(--ss-fg2)">
                                    <Terminal size={11} className="text-cyan-400" />
                                    <span>Mesh Nodes (G7 · Laptop 2 · iOS) & CLI</span>
                                </div>
                                <ChevronDown
                                    size={12}
                                    className={`text-(--ss-fg3) transition-transform duration-200 ${
                                        relayDrawerOpen ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>

                            <AnimatePresence initial={false}>
                                {relayDrawerOpen && (
                                    <m.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-1.5 p-2 rounded-xl bg-(--ss-field) border border-(--ss-sep) space-y-1.5 text-[10.5px]">
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <div className="px-2 py-1.5 rounded-lg bg-black/25 border border-cyan-500/25 flex items-center justify-between">
                                                    <span className="flex items-center gap-1 font-medium text-(--ss-fg) truncate">
                                                        <Laptop size={11} className="text-cyan-400 shrink-0" />
                                                        G7
                                                    </span>
                                                    <span className="font-mono text-[9.5px] text-emerald-400">
                                                        {nodePings.g7?.ok ? `${nodePings.g7.latencyMs}ms` : ':8082'}
                                                    </span>
                                                </div>
                                                <div className="px-2 py-1.5 rounded-lg bg-black/25 border border-(--ss-sep) flex items-center justify-between">
                                                    <span className="flex items-center gap-1 font-medium text-(--ss-fg) truncate">
                                                        <Radio size={11} className="text-purple-400 shrink-0" />
                                                        Martha
                                                    </span>
                                                    <span className="font-mono text-[9.5px] text-(--ss-fg2)">
                                                        {nodePings.second_laptop?.ok ? `${nodePings.second_laptop.latencyMs}ms` : '.1.67'}
                                                    </span>
                                                </div>
                                                <div className="px-2 py-1.5 rounded-lg bg-black/25 border border-(--ss-sep) flex items-center justify-between">
                                                    <span className="flex items-center gap-1 font-medium text-(--ss-fg) truncate">
                                                        <Smartphone size={11} className="text-amber-400 shrink-0" />
                                                        iPhone
                                                    </span>
                                                    <span className="font-mono text-[9.5px] text-cyan-400">
                                                        WSS
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-black/40 border border-(--ss-sep)">
                                                <code className="text-[10px] font-mono text-cyan-300 truncate select-all">
                                                    {relayLaunchCmd}
                                                </code>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={handlePingAllNodes}
                                                        disabled={pingingNodes}
                                                        className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/15 text-(--ss-fg2) text-[9.5px]"
                                                        title={tr("Ping Nodes")}
                                                    >
                                                        <RefreshCw size={10} className={pingingNodes ? 'animate-spin' : ''} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(relayLaunchCmd, 'relay')}
                                                        className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[9.5px] flex items-center gap-1"
                                                    >
                                                        {copiedCmd === 'relay' ? <Check size={10} /> : <Copy size={10} />}
                                                        <span>{copiedCmd === 'relay' ? tr("Copied") : tr("CLI")}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </m.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </LazyMotion>
    );
};
