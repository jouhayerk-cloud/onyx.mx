import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom, userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import {
    RefreshCw,
    Cloud,
    Laptop,
    Network,
    Settings2,
    ChevronRight,
    Copy,
    Check,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { colibriProvider, isColibriAvailable } from '../../lib/ai/providers/colibri';
import { colibriRealtimeBridge } from '../../lib/ai/colibriRealtimeBridge';
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

interface TransportModeItem {
    id: ConnectionMode;
    label: string;
    fullName: string;
    icon: LucideIcon;
}

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
    const isDevOrAdmin = !user?.role || user.role === 'Developer' || user.role === 'Admin';

    const isIOSDevice =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    const [endpoint, setEndpoint] = useState<string>(() => {
        return getProviderConfig('colibri').baseUrl || detectDefaultUrl();
    });
    const [model, setModel] = useState<string>(() => {
        return getProviderConfig('colibri').model || 'auto';
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
        setModel(cfg.model || 'auto');
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

        // Live host presence tracking from Supabase Realtime Bridge
        const unsub = colibriRealtimeBridge.onHostStatusChange((isOnline, host) => {
            if (activeMode === 'cloud' || endpoint === SUPABASE_RELAY_URL) {
                setOnlineStatus(isOnline);
                if (isOnline) {
                    setTelemetry(host?.tps ? `WSS Cloud • ${host.tps} t/s` : 'WSS Cloud Bridge');
                } else {
                    setTelemetry(null);
                }
            }
        });

        window.addEventListener(AI_CONFIG_EVENT, refreshConfig);
        return () => {
            window.removeEventListener(AI_CONFIG_EVENT, refreshConfig);
            unsub();
        };
    }, [refreshConfig, pingDaemon, endpoint, activeMode]);

    const handleSave = (newEndpoint?: string, newModel?: string) => {
        const ep = (newEndpoint ?? endpoint).trim() || detectDefaultUrl();
        const mod = (newModel ?? model).trim() || 'auto';
        const patch: Partial<ProviderConfig> = {
            baseUrl: ep,
            model: mod,
        };
        setProviderConfig('colibri', patch);
        pingDaemon(ep);
    };

    const handleSelectMode = (mode: ConnectionMode) => {
        if (mode === 'cloud') return;
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
            setRoute('chat', { provider: 'colibri', model: model || 'auto' });
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
                model: model || 'auto',
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

    const relayLaunchCmd = 'node scripts/colibri-supabase-relay.cjs';

    const transportModes: TransportModeItem[] = [
        {
            id: 'cloud',
            label: tr("Relay"),
            fullName: tr("WSS Cloud Relay"),
            icon: Cloud,
        },
        {
            id: 'localhost',
            label: tr("Local"),
            fullName: tr("Local G7 :8082"),
            icon: Laptop,
        },
        {
            id: 'mesh',
            label: tr("LAN"),
            fullName: tr("LAN Mesh"),
            icon: Network,
        },
        {
            id: 'custom',
            label: tr("Custom"),
            fullName: tr("Custom Endpoint"),
            icon: Settings2,
        },
    ];

    return (
        <section className="sk-section" data-theme={theme}>
            {/* Section head with eyebrow and Ping action */}
            <div className="sk-section-head">
                <span className="sk-eyebrow">{tr("Local engine")}</span>
                <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="sk-btn"
                    aria-label={tr("Ping")}
                >
                    <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
                    <span>{tr("Ping")}</span>
                </button>
            </div>

            <div className="sk-group">
                {/* (a) Status row: connection dot, title, state word, Chan toggle */}
                <div className="sk-row">
                    <span
                        className="sk-dot"
                        data-state={
                            isTesting || onlineStatus === null
                                ? 'warn'
                                : onlineStatus
                                ? 'ok'
                                : 'error'
                        }
                    />
                    <div className="sk-row-label">
                        <span className="sk-row-title">{tr("Colibri")}</span>
                        <span className="sk-row-sub">
                            {isTesting
                                ? tr("Connecting")
                                : onlineStatus === true
                                ? telemetry || tr("Online")
                                : onlineStatus === false
                                ? tr("Offline")
                                : isIOSDevice
                                ? tr("iOS WSS")
                                : tr("Standby")}
                        </span>
                    </div>
                    <div className="sk-row-value">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isChanActive}
                            aria-label={tr("Use in Chan")}
                            onClick={() => handleToggleChanChat(!isChanActive)}
                            className="sk-switch"
                        />
                    </div>
                </div>

                {/* Ping connection result row (if tested) */}
                {testResult && (
                    <div className="sk-row">
                        <span
                            className="sk-dot"
                            data-state={testResult.ok ? 'ok' : 'error'}
                        />
                        <div className="sk-row-label">
                            <span className="sk-row-title">
                                {testResult.ok ? tr("Connected") : tr("Connection failed")}
                            </span>
                            <span className="sk-row-sub" title={testResult.message}>
                                {testResult.message}
                            </span>
                        </div>
                        <div className="sk-row-value">
                            <button
                                type="button"
                                onClick={() => setTestResult(null)}
                                className="sk-btn"
                                data-icon-only=""
                                aria-label={tr("Dismiss")}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {/* (b) Link row: transport mode radiogroup */}
                <div className="sk-row">
                    <div className="sk-row-label">
                        <span className="sk-row-title">{tr("Link")}</span>
                        <span className="sk-row-sub">{tr("Off until secured")}</span>
                    </div>
                    <div className="sk-row-value">
                        <div className="sk-seg" role="radiogroup" aria-label={tr("Transport mode")}>
                            {transportModes.map((item) => {
                                const Icon = item.icon;
                                const isChecked = activeMode === item.id;
                                const isDisabled = item.id === 'cloud';
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={isChecked}
                                        aria-disabled={isDisabled ? 'true' : undefined}
                                        disabled={isDisabled}
                                        aria-label={
                                            isDisabled
                                                ? `${item.fullName} (${tr("Off until secured")})`
                                                : item.fullName
                                        }
                                        title={
                                            isDisabled
                                                ? `${item.fullName} (${tr("Off until secured")})`
                                                : item.fullName
                                        }
                                        onClick={() => {
                                            if (!isDisabled) {
                                                handleSelectMode(item.id);
                                            }
                                        }}
                                        className="sk-seg-btn"
                                        style={isDisabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                    >
                                        <Icon size={13} />
                                        <span className="sk-seg-label">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Custom Endpoint URL row rendered in main group when activeMode === 'custom' */}
                {activeMode === 'custom' && (
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">{tr("Endpoint URL")}</span>
                        </div>
                        <div className="sk-row-value">
                            <div className="sk-field">
                                <input
                                    type="url"
                                    value={endpoint}
                                    onChange={(e) => setEndpoint(e.target.value)}
                                    onBlur={() => handleSave()}
                                    placeholder="http://127.0.0.1:8082"
                                    aria-label={tr("Endpoint URL")}
                                    className="sk-mono"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleSave()}
                                className="sk-btn"
                            >
                                {tr("Save")}
                            </button>
                        </div>
                    </div>
                )}

                {/* (c) Model row: model selector in mono */}
                <div className="sk-row">
                    <div className="sk-row-label">
                        <span className="sk-row-title">{tr("Model")}</span>
                    </div>
                    <div className="sk-row-value">
                        <div className="sk-field">
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
                                aria-label={tr("Model")}
                                className="sk-mono"
                            >
                                <option value="auto">{tr("Auto (Task / MoE Routing)")}</option>
                                <option value="colibri-glm-5.2-moe">glm-5.2-moe ({tr("Fast Chat")})</option>
                                <option value="colibri-kimi-k3-moe">kimi-k3-moe ({tr("Deep Context")})</option>
                                <option value="colibri-qwen-2.5-3b">qwen-2.5-3b ({tr("Dense / Translate")})</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* (d) Advanced disclosure */}
                <details
                    className="sk-disclosure"
                    open={relayDrawerOpen}
                    onToggle={(e) => {
                        const isOpen = e.currentTarget.open;
                        setRelayDrawerOpen(isOpen);
                        if (isOpen) {
                            void handlePingAllNodes();
                        }
                    }}
                >
                    <summary className="sk-row">
                        <span className="sk-row-label">
                            <span className="sk-row-title">{tr("Advanced")}</span>
                        </span>
                        <ChevronRight size={14} className="sk-chevron" />
                    </summary>

                    {isDevOrAdmin && (
                        <>
                            {/* Mesh nodes section action */}
                            <div className="sk-row">
                                <div className="sk-row-label">
                                    <span className="sk-row-title">{tr("Mesh nodes")}</span>
                                </div>
                                <div className="sk-row-value">
                                    <button
                                        type="button"
                                        onClick={handlePingAllNodes}
                                        disabled={pingingNodes}
                                        className="sk-btn"
                                        aria-label={tr("Ping mesh nodes")}
                                    >
                                        <RefreshCw size={12} className={pingingNodes ? 'animate-spin' : ''} />
                                        <span>{tr("Ping nodes")}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Mesh nodes list */}
                            {MESH_NODES.map((node) => {
                                const ping = nodePings[node.id];
                                const dotState = ping === undefined ? 'warn' : ping.ok ? 'ok' : 'error';
                                return (
                                    <div key={node.id} className="sk-row">
                                        <span className="sk-dot" data-state={dotState} />
                                        <div className="sk-row-label">
                                            <span className="sk-row-title">{node.name}</span>
                                            <span className="sk-row-sub sk-mono">{node.ip}:{node.colibriPort}</span>
                                        </div>
                                        <div className="sk-row-value">
                                            {ping ? (
                                                <span className="sk-mono">
                                                    {ping.ok ? `${ping.latencyMs} ms` : ping.status}
                                                </span>
                                            ) : (
                                                <span className="sk-row-sub sk-mono">:{node.colibriPort}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Relay daemon command */}
                            <div className="sk-row">
                                <div className="sk-row-label">
                                    <span className="sk-row-title">{tr("Relay daemon")}</span>
                                    <span className="sk-row-sub sk-mono">{relayLaunchCmd}</span>
                                </div>
                                <div className="sk-row-value">
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(relayLaunchCmd, 'relay')}
                                        className="sk-btn"
                                        data-icon-only=""
                                        aria-label={copiedCmd === 'relay' ? tr("Copied") : tr("Copy relay command")}
                                        title={copiedCmd === 'relay' ? tr("Copied") : tr("Copy relay command")}
                                    >
                                        {copiedCmd === 'relay' ? <Check size={13} /> : <Copy size={13} />}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </details>
            </div>
        </section>
    );
};
