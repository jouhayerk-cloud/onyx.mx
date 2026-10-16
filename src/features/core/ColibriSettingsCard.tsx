import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import {
    Cpu,
    Check,
    AlertCircle,
    RefreshCw,
    Network,
    Copy,
    ChevronDown,
    Zap,
    Terminal,
    Laptop,
    Smartphone,
    Radio,
} from 'lucide-react';
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

function resolveMode(url: string): ConnectionMode {
    if (url === PRESET_URLS.cloud) return 'cloud';
    if (url === PRESET_URLS.localhost || url === 'http://localhost:8082') return 'localhost';
    if (url === PRESET_URLS.mesh) return 'mesh';
    return 'custom';
}

export const ColibriSettingsCard: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const isAqua = theme === 'aqua';

    // Colibri configuration
    const [endpoint, setEndpoint] = useState<string>(() => {
        return getProviderConfig('colibri').baseUrl || 'http://127.0.0.1:8082';
    });
    const [model, setModel] = useState<string>(() => {
        return getProviderConfig('colibri').model || 'colibri-glm-5.2-moe';
    });

    // Routing status for Chan Chat
    const [isChanActive, setIsChanActive] = useState<boolean>(() => {
        return getRoute('chat').provider === 'colibri';
    });

    // Live daemon status & telemetry
    const [onlineStatus, setOnlineStatus] = useState<boolean | null>(null);
    const [telemetry, setTelemetry] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [testResult, setTestResult] = useState<TestStatus | null>(null);

    // Expandable Developer CLI / Mesh Drawer
    const [relayDrawerOpen, setRelayDrawerOpen] = useState<boolean>(false);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    // Live Mesh Nodes Ping Status
    const [nodePings, setNodePings] = useState<Record<string, { ok: boolean; latencyMs: number; status: string }>>({});
    const [pingingNodes, setPingingNodes] = useState<boolean>(false);

    // Selected connection mode
    const [activeMode, setActiveMode] = useState<ConnectionMode>(() => resolveMode(endpoint));

    // Sync with global config events
    const refreshConfig = useCallback(() => {
        const cfg = getProviderConfig('colibri');
        const ep = cfg.baseUrl || 'http://127.0.0.1:8082';
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
                const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/health`, {
                    headers: { 'Accept': 'application/json' },
                }).catch(() => null);
                if (res && res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.telemetry?.nvmeReadMBps) {
                        setTelemetry(`${data.telemetry.nvmeReadMBps} MB/s NVMe • ${data.telemetry.tokensPerSecond || 26} tok/s`);
                    } else if (data.relayGateway?.active) {
                        setTelemetry(`Mesh Relay via ${data.relayGateway.upstreamHost}`);
                    } else {
                        setTelemetry(tr("Zero cloud latency • Local NVMe"));
                    }
                } else {
                    setTelemetry(tr("Zero cloud latency"));
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
        const ep = (newEndpoint ?? endpoint).trim() || 'http://127.0.0.1:8082';
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
                baseUrl: endpoint.trim() || 'http://127.0.0.1:8082',
                model: model || 'colibri-glm-5.2-moe',
            };
            const res = await colibriProvider.test(cfg);
            setTestResult(res);
            setOnlineStatus(res.ok);
            if (res.ok) {
                pingDaemon(cfg.baseUrl || 'http://127.0.0.1:8082');
            }
        } catch (err: any) {
            setTestResult({
                ok: false,
                message: err?.message || tr("Failed to reach Colibrì daemon"),
            });
            setOnlineStatus(false);
        } finally {
            setIsTesting(false);
        }
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedCmd(label);
        setTimeout(() => setCopiedCmd(null), 2500);
    };

    const relayLaunchCmd = `powershell -ExecutionPolicy Bypass -File .\\scripts\\start-colibri-relay.ps1 -Upstream "http://192.0.2.71:8082"`;

    return (
        <div className={`colibri-settings-card ${isAqua ? 'colibri-settings-card--aqua' : ''}`}>
            {/* Top Bar: Title, Engine Badge, Status & Telemetry */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                        <Cpu size={20} className={onlineStatus ? "animate-pulse" : ""} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-[600] text-white tracking-tight">
                                {tr("Colibrì Local MoE")}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-[600] uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                {tr("Sparse MoE")}
                            </span>
                        </div>
                        <span className="text-[12px] text-white/60 truncate">
                            {tr("Desktop NVMe & LAN Mesh Streaming")}
                        </span>
                    </div>
                </div>

                {/* Status Badge & Telemetry Pill */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] font-medium">
                        <span
                            className={`w-2 h-2 rounded-full transition-all ${
                                onlineStatus === true
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                    : onlineStatus === false
                                    ? 'bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                                    : 'bg-white/30 animate-pulse'
                            }`}
                        />
                        <span className="text-white/80">
                            {onlineStatus === true
                                ? tr("Online")
                                : onlineStatus === false
                                ? tr("Standby")
                                : tr("Checking...")}
                        </span>
                    </div>
                    {onlineStatus === true && telemetry && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400/90">
                            <Zap size={10} className="text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[200px]">{telemetry}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Interactive Controls */}
            <div className="p-4 space-y-3.5">
                {/* 1. Primary Route Switch: Chan Chat */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex flex-col pr-4">
                        <span className="text-[13px] font-[600] text-white">
                            {tr("Route Chan Chat to Colibrì")}
                        </span>
                        <span className="text-[11px] text-white/60 mt-0.5">
                            {isChanActive
                                ? tr("Active: Chat queries use local MoE NVMe streaming")
                                : tr("Standby: Chat routes to default cloud provider")}
                        </span>
                    </div>
                    <TactileSwitch
                        active={isChanActive}
                        onChange={handleToggleChanChat}
                        width={46}
                        height={26}
                        aria-label={tr("Enable Colibrì for Chan Chat")}
                    />
                </div>

                {/* 2. Model & Connection Controls (2-column on desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Model Selector */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-[600] text-white/70 uppercase tracking-wider">
                            {tr("Active Local Model")}
                        </label>
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
                            className="w-full h-9 px-3 rounded-xl bg-black/40 border border-white/15 text-white text-[12px] font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                        >
                            <option value="colibri-glm-5.2-moe">
                                colibri-glm-5.2-moe (General MoE • High Speed)
                            </option>
                            <option value="colibri-kimi-k3-moe">
                                colibri-kimi-k3-moe (Long Context • Deep Reasoning)
                            </option>
                            <option value="colibri-qwen-2.5-3b">
                                colibri-qwen-2.5-3b (Dense 3B • Fast SLM)
                            </option>
                        </select>
                    </div>

                    {/* Connection Mode Segmented Control */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-[600] text-white/70 uppercase tracking-wider">
                            {tr("Connection Mode")}
                        </label>
                        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-black/40 border border-white/15 h-9 items-center">
                            <button
                                type="button"
                                onClick={() => handleSelectMode('cloud')}
                                className={`h-7 px-1.5 rounded-lg text-[11px] font-medium transition-all truncate ${
                                    activeMode === 'cloud'
                                        ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                        : 'text-white/70 hover:text-white'
                                }`}
                                title={tr("Cloud Relay (Supabase)")}
                            >
                                {tr("Cloud")}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectMode('localhost')}
                                className={`h-7 px-1.5 rounded-lg text-[11px] font-medium transition-all truncate ${
                                    activeMode === 'localhost'
                                        ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                        : 'text-white/70 hover:text-white'
                                }`}
                                title="http://127.0.0.1:8082"
                            >
                                {tr("Local G7")}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectMode('mesh')}
                                className={`h-7 px-1.5 rounded-lg text-[11px] font-medium transition-all truncate ${
                                    activeMode === 'mesh'
                                        ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                        : 'text-white/70 hover:text-white'
                                }`}
                                title={`http://${ONYX_MESH_TOPOLOGY.g7.ip}:8082`}
                            >
                                {tr("LAN Mesh")}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectMode('custom')}
                                className={`h-7 px-1.5 rounded-lg text-[11px] font-medium transition-all truncate ${
                                    activeMode === 'custom'
                                        ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                        : 'text-white/70 hover:text-white'
                                }`}
                                title={tr("Custom Endpoint")}
                            >
                                {tr("Custom")}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Custom Endpoint Input (shown if Custom mode is active) */}
                {activeMode === 'custom' && (
                    <div className="flex items-center gap-2 pt-1 animate-fadeIn">
                        <input
                            type="url"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            onBlur={() => handleSave()}
                            placeholder="http://127.0.0.1:8082"
                            className="flex-1 h-9 px-3 rounded-xl bg-black/40 border border-white/15 text-white text-[12px] font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                        />
                        <button
                            type="button"
                            onClick={() => handleSave()}
                            className="h-9 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[12px] font-medium transition-colors border border-white/10 shrink-0"
                        >
                            {tr("Save")}
                        </button>
                    </div>
                )}

                {/* Action Row: Test Connection & Refresh */}
                <div className="flex items-center gap-2 pt-1">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="flex-1 h-9 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-[600] text-[12px] flex items-center justify-center gap-2 shadow-sm shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isTesting ? "animate-spin" : ""} />
                        <span>{isTesting ? tr("Testing Connection...") : tr("Test Connection")}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => pingDaemon(endpoint)}
                        className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5 text-[12px]"
                        title={tr("Refresh Status")}
                    >
                        <RefreshCw size={13} />
                        <span className="hidden sm:inline">{tr("Ping")}</span>
                    </button>
                </div>

                {/* Test Result Banner */}
                {testResult && (
                    <div
                        className={`p-2.5 rounded-xl text-[12px] flex items-start gap-2 transition-all ${
                            testResult.ok
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                        }`}
                    >
                        {testResult.ok ? (
                            <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                            <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-tight">{testResult.message}</span>
                    </div>
                )}

                {/* Collapsible Disclosure: Developer CLI & G7 Host Setup */}
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => {
                            const nextState = !relayDrawerOpen;
                            setRelayDrawerOpen(nextState);
                            if (nextState) handlePingAllNodes();
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Terminal size={14} className="text-cyan-400" />
                            <span className="text-[12px] font-[600] text-white">
                                {tr("Developer CLI & G7 Host Setup")}
                            </span>
                        </div>
                        <ChevronDown
                            size={14}
                            className={`text-white/60 transition-transform ${
                                relayDrawerOpen ? 'rotate-180' : ''
                            }`}
                        />
                    </button>

                    {relayDrawerOpen && (
                        <div className="mt-2 p-3 rounded-xl bg-black/40 border border-white/10 space-y-3 text-[11px]">
                            {/* Device Map Header & Ping All */}
                            <div className="flex items-center justify-between text-white/60 font-semibold uppercase tracking-wider">
                                <span>{tr("G7 Wi-Fi Mesh Devices")}</span>
                                <button
                                    type="button"
                                    onClick={handlePingAllNodes}
                                    disabled={pingingNodes}
                                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-sans capitalize text-[11px]"
                                >
                                    <RefreshCw size={10} className={pingingNodes ? "animate-spin" : ""} />
                                    {tr("Ping All")}
                                </button>
                            </div>

                            {/* Compact Device Row List */}
                            <div className="grid grid-cols-1 gap-1.5">
                                {/* G7 Laptop */}
                                <div className="p-2 rounded-lg bg-black/30 border border-cyan-500/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Laptop size={14} className="text-cyan-400" />
                                        <div>
                                            <span className="font-semibold text-white">G7 (Host)</span>
                                            <span className="text-white/50 font-mono ml-2">192.0.2.71:8082</span>
                                        </div>
                                    </div>
                                    <span className="font-mono text-emerald-400 font-medium">
                                        {nodePings.g7?.status || (onlineStatus ? "Online" : "Port 8082")}
                                    </span>
                                </div>

                                {/* Second Laptop */}
                                <div className="p-2 rounded-lg bg-black/30 border border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Radio size={14} className="text-purple-400" />
                                        <div>
                                            <span className="font-semibold text-white">Second_Laptop</span>
                                            <span className="text-white/50 font-mono ml-2">192.0.2.67:8082</span>
                                        </div>
                                    </div>
                                    <span className="font-mono text-white/60">
                                        {nodePings.second_laptop?.status || "Relay Node"}
                                    </span>
                                </div>

                                {/* Phone */}
                                <div className="p-2 rounded-lg bg-black/30 border border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Smartphone size={14} className="text-amber-400" />
                                        <div>
                                            <span className="font-semibold text-white">Ramses iPhone</span>
                                            <span className="text-white/50 font-mono ml-2">192.0.2.100</span>
                                        </div>
                                    </div>
                                    <span className="font-mono text-white/60">
                                        Companion App
                                    </span>
                                </div>
                            </div>

                            {/* Second Relay CLI Launch Command */}
                            <div className="space-y-1 pt-1 border-t border-white/10">
                                <div className="flex items-center justify-between text-white/70">
                                    <span className="font-mono text-[10px]">
                                        {tr("PowerShell Relay Launcher:")}
                                    </span>
                                    {copiedCmd === 'relay' && (
                                        <span className="text-emerald-400 text-[10px] font-medium flex items-center gap-0.5">
                                            <Check size={10} /> {tr("Copied")}
                                        </span>
                                    )}
                                </div>
                                <div className="relative group">
                                    <pre className="p-2 rounded-lg bg-black/60 border border-white/10 text-cyan-300 font-mono text-[10px] overflow-x-auto select-all custom-scrollbar">
                                        {relayLaunchCmd}
                                    </pre>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(relayLaunchCmd, 'relay')}
                                        className="absolute top-1.5 right-1.5 p-1 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                                        title={tr("Copy command")}
                                    >
                                        <Copy size={11} />
                                    </button>
                                </div>
                            </div>

                            <p className="text-[10px] text-white/40">
                                {tr("Tip: second laptop can also run ")}
                                <code className="text-cyan-300">scripts/deploy-second-relay.bat</code>
                                {tr(" to start the relay service.")}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
