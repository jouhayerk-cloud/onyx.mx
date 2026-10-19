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
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { colibriProvider, isColibriAvailable, COLIBRI_DEFAULT_BASE_URL } from '../../lib/ai/providers/colibri';
import { COLIBRI_RELAY_DISABLED_REASON } from '../../lib/ai/colibriRealtimeBridge';
import { COLIBRI_MODELS, COLIBRI_MODEL_SPECS } from '../../lib/ai/models';
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
    isMeshNodeConfigured,
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

/** Read at click time: the mesh list can change after this module loads. Null until the host node has an address. */
function meshPresetUrl(): string | null {
    const g7 = ONYX_MESH_TOPOLOGY.g7;
    return isMeshNodeConfigured(g7) ? `http://${g7.ip}:${g7.colibriPort || 8000}` : null;
}

function detectDefaultUrl(): string {
    return COLIBRI_DEFAULT_BASE_URL;
}

function resolveMode(url: string): ConnectionMode {
    if (
        url === COLIBRI_DEFAULT_BASE_URL ||
        url === 'http://localhost:8000' ||
        url.startsWith('supabase://')
    )
        return 'localhost';
    if (url === meshPresetUrl()) return 'mesh';
    return 'custom';
}

export const ColibriSettingsCard: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const [user] = useAtom(userAtom);
    const isDevOrAdmin = user?.role === 'Developer' || user?.role === 'Admin';

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
                const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/health`, {
                    headers: { Accept: 'application/json' },
                }).catch(() => null);
                if (res && res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.telemetry?.nvmeReadMBps) {
                        const tps = data.telemetry.tokensPerSecond;
                        setTelemetry(
                            typeof tps === 'number' && tps > 0
                                ? `${data.telemetry.nvmeReadMBps} MB/s • ${tps} t/s`
                                : `${data.telemetry.nvmeReadMBps} MB/s`
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

    // Load the saved config on open and when another screen changes it. This used to depend on `endpoint`,
    // so every keystroke in the Custom field reloaded the saved URL over the typed one and flipped the mode back.
    useEffect(() => {
        refreshConfig();
        window.addEventListener(AI_CONFIG_EVENT, refreshConfig);
        return () => {
            window.removeEventListener(AI_CONFIG_EVENT, refreshConfig);
        };
    }, [refreshConfig]);

    // Ping the address being edited, after typing pauses
    useEffect(() => {
        const t = setTimeout(() => pingDaemon(endpoint), 600);
        return () => clearTimeout(t);
    }, [pingDaemon, endpoint]);

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
        const newUrl = mode === 'localhost' ? COLIBRI_DEFAULT_BASE_URL : mode === 'mesh' ? meshPresetUrl() : null;
        if (mode !== 'custom' && !newUrl) return;
        setActiveMode(mode);
        if (newUrl) {
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

    const transportModes: TransportModeItem[] = [
        {
            id: 'cloud',
            label: tr("Relay"),
            fullName: tr("Relay"),
            icon: Cloud,
        },
        {
            id: 'localhost',
            label: tr("Local"),
            fullName: tr("Local Host :8000"),
            icon: Laptop,
        },
        ...(isMeshNodeConfigured(ONYX_MESH_TOPOLOGY.g7)
            ? [
                  {
                      id: 'mesh' as const,
                      label: tr("LAN"),
                      fullName: tr("LAN Mesh"),
                      icon: Network,
                  },
              ]
            : []),
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
                                                ? `${item.fullName} (${tr(COLIBRI_RELAY_DISABLED_REASON)})`
                                                : item.fullName
                                        }
                                        title={
                                            isDisabled
                                                ? `${item.fullName} (${tr(COLIBRI_RELAY_DISABLED_REASON)})`
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
                                    placeholder="https://g7.tail2a809e.ts.net"
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
                                {COLIBRI_MODELS.filter((id) => id !== 'auto').map((id) => (
                                    <option key={id} value={id}>{COLIBRI_MODEL_SPECS[id].name}</option>
                                ))}
                                {model !== 'auto' && !(COLIBRI_MODELS as readonly string[]).includes(model) && (
                                    <option value={model}>{model}</option>
                                )}
                            </select>
                        </div>
                    </div>
                </div>

                {/* (d) Advanced disclosure */}
                {isDevOrAdmin && (
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
                    </>
                </details>
                )}
            </div>
        </section>
    );
};
