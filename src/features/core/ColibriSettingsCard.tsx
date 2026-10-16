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
    COLIBRI_NETWORK_PRESETS,
    pingMeshNode,
    type MeshDeviceNode,
} from '../../lib/network/localMeshMap';

interface TestStatus {
    ok: boolean;
    message: string;
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

    // Live daemon status
    const [onlineStatus, setOnlineStatus] = useState<boolean | null>(null);
    const [telemetry, setTelemetry] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [testResult, setTestResult] = useState<TestStatus | null>(null);

    // Expandable LAN Relay Drawer
    const [relayDrawerOpen, setRelayDrawerOpen] = useState<boolean>(false);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    // Live Mesh Nodes Ping Status
    const [nodePings, setNodePings] = useState<Record<string, { ok: boolean; latencyMs: number; status: string }>>({});
    const [pingingNodes, setPingingNodes] = useState<boolean>(false);

    // Sync with global config events
    const refreshConfig = useCallback(() => {
        const cfg = getProviderConfig('colibri');
        setEndpoint(cfg.baseUrl || 'http://127.0.0.1:8082');
        setModel(cfg.model || 'colibri-glm-5.2-moe');
        setIsChanActive(getRoute('chat').provider === 'colibri');
    }, []);

    const pingDaemon = useCallback(async (targetUrl: string) => {
        try {
            const ok = await isColibriAvailable(targetUrl);
            setOnlineStatus(ok);
            if (ok) {
                // Fetch telemetry details
                const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/health`, {
                    headers: { 'Accept': 'application/json' },
                }).catch(() => null);
                if (res && res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.telemetry?.nvmeReadMBps) {
                        setTelemetry(`${data.telemetry.nvmeReadMBps} MB/s NVMe • ${data.telemetry.tokensPerSecond || 26} tok/s`);
                    } else if (data.relayGateway?.active) {
                        setTelemetry(`Mesh Relay via ${data.relayGateway.upstreamHost}`);
                    }
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

    const handleToggleChanChat = (active: boolean) => {
        setIsChanActive(active);
        if (active) {
            setRoute('chat', { provider: 'colibri', model: model || 'colibri-glm-5.2-moe' });
        } else {
            setRoute('chat', null); // restores default Gemini
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
            {/* Top Bar: Icon, Title, Live Status Dot */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shadow-sm">
                        <Cpu size={20} className={onlineStatus ? "animate-pulse" : ""} />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-[16px] font-[600] text-white tracking-wide">
                                {tr("Colibrì Local MoE")}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-[600] uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                {tr("NVMe Sparse Engine")}
                            </span>
                        </div>
                        <span className="text-[12px] text-white/60">
                            {tr("Windows Desktop & LAN Mesh Streaming")}
                        </span>
                    </div>
                </div>

                {/* Live Dot & Telemetry Status */}
                <div className="flex items-center gap-2">
                    <div
                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                            onlineStatus === true
                                ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                                : onlineStatus === false
                                ? 'bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                                : 'bg-white/30 animate-pulse'
                        }`}
                    />
                    <span className="text-[12px] font-medium text-white/80">
                        {onlineStatus === true
                            ? tr("Online")
                            : onlineStatus === false
                            ? tr("Offline")
                            : tr("Checking...")}
                    </span>
                </div>
            </div>

            {/* Active Telemetry Sub-bar if connected */}
            {onlineStatus === true && telemetry && (
                <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
                    <span className="flex items-center gap-1.5 font-mono">
                        <Zap size={12} className="text-emerald-400" />
                        {telemetry}
                    </span>
                    <span className="text-emerald-400/70 font-sans">{tr("Zero cloud latency")}</span>
                </div>
            )}

            {/* Main Interactive Controls */}
            <div className="p-4 space-y-4">
                {/* 1. Primary Route Switch: Chan Chat */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex flex-col pr-4">
                        <span className="text-[14px] font-[600] text-white">
                            {tr("Activate for Chan Chat & Agent")}
                        </span>
                        <span className="text-[12px] text-white/60 mt-0.5">
                            {isChanActive
                                ? tr("Active: Chat queries use local Colibrì MoE streaming")
                                : tr("Inactive: Chat currently routes to default cloud model")}
                        </span>
                    </div>
                    <TactileSwitch
                        active={isChanActive}
                        onChange={handleToggleChanChat}
                        width={50}
                        height={30}
                        aria-label={tr("Enable Colibrì for Chan Chat")}
                    />
                </div>

                {/* 2. Model Selection */}
                <div className="space-y-1.5">
                    <label className="text-[12px] font-[600] text-white/80 uppercase tracking-wider">
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
                        className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/15 text-white text-[13px] font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                    >
                        <option value="colibri-glm-5.2-moe">
                            colibri-glm-5.2-moe (General MoE 5.2 • High Speed)
                        </option>
                        <option value="colibri-kimi-k3-moe">
                            colibri-kimi-k3-moe (Long Context MoE • Deep Reasoning)
                        </option>
                        <option value="colibri-qwen-2.5-3b">
                            colibri-qwen-2.5-3b (Dense 3B • Fast Local SLM)
                        </option>
                    </select>
                </div>

                {/* 3. Endpoint Configuration & G7 Mesh Presets */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[12px] font-[600] text-white/80 uppercase tracking-wider">
                            {tr("Endpoint URL & Network Mode")}
                        </label>
                    </div>

                    {/* Mesh Presets Grid */}
                    <div className="grid grid-cols-2 gap-1.5 pb-1">
                        {COLIBRI_NETWORK_PRESETS.map((p) => {
                            const isSelected = endpoint === p.url;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        setEndpoint(p.url);
                                        handleSave(p.url, undefined);
                                    }}
                                    className={`p-2 rounded-xl text-left border transition-all ${
                                        isSelected
                                            ? 'bg-cyan-500/20 border-cyan-400/50 shadow-sm shadow-cyan-500/10'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[12px] font-medium ${isSelected ? 'text-cyan-300 font-semibold' : 'text-white'}`}>
                                            {p.label}
                                        </span>
                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-white/60">
                                            {p.badge}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-white/50 block truncate mt-0.5 font-mono">
                                        {p.url}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="url"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            onBlur={() => handleSave()}
                            placeholder="http://127.0.0.1:8082"
                            className="flex-1 h-10 px-3 rounded-xl bg-black/40 border border-white/15 text-white text-[13px] font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                        />
                        <button
                            type="button"
                            onClick={() => handleSave()}
                            className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium transition-colors border border-white/10 shrink-0"
                        >
                            {tr("Save")}
                        </button>
                    </div>
                </div>

                {/* 4. Action Row: Test Connection & Daemon Status */}
                <div className="flex items-center gap-3 pt-1">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="flex-1 h-11 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-[600] text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={15} className={isTesting ? "animate-spin" : ""} />
                        <span>{isTesting ? tr("Testing Connection...") : tr("Test Connection")}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => pingDaemon(endpoint)}
                        className="h-11 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                        title={tr("Refresh Status")}
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>

                {/* 5. Live Test Result Banner */}
                {testResult && (
                    <div
                        className={`p-3 rounded-xl text-[12px] flex items-start gap-2.5 transition-all ${
                            testResult.ok
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                        }`}
                    >
                        {testResult.ok ? (
                            <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-relaxed">{testResult.message}</span>
                    </div>
                )}

                {/* 6. Expandable LAN Mesh Relay & Device Map Drawer */}
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={() => {
                            const nextState = !relayDrawerOpen;
                            setRelayDrawerOpen(nextState);
                            if (nextState) handlePingAllNodes();
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                    >
                        <div className="flex items-center gap-2.5">
                            <Network size={16} className="text-cyan-400" />
                            <div className="flex flex-col">
                                <span className="text-[13px] font-[600] text-white">
                                    {tr("G7 Local Network Topology & Relay Surface")}
                                </span>
                                <span className="text-[11px] text-white/60">
                                    {tr("Device address map: G7 Laptop, Second Laptop & Ramses iPhone")}
                                </span>
                            </div>
                        </div>
                        <ChevronDown
                            size={16}
                            className={`text-white/60 transition-transform ${
                                relayDrawerOpen ? 'rotate-180' : ''
                            }`}
                        />
                    </button>

                    {relayDrawerOpen && (
                        <div className="mt-2 p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-4 text-[12px]">
                            {/* Device Address Map Table */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-white/60 font-semibold uppercase tracking-wider">
                                    <span>{tr("G7 Wi-Fi Device Map")}</span>
                                    <button
                                        type="button"
                                        onClick={handlePingAllNodes}
                                        disabled={pingingNodes}
                                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-sans capitalize"
                                    >
                                        <RefreshCw size={11} className={pingingNodes ? "animate-spin" : ""} />
                                        {tr("Ping All Devices")}
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {/* G7 Laptop */}
                                    <div className="p-2.5 rounded-lg bg-black/40 border border-cyan-500/30 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Laptop size={16} className="text-cyan-400" />
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-white">G7 (Ramses Laptop)</span>
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-mono">HOST</span>
                                                </div>
                                                <span className="text-[11px] text-white/50 font-mono">
                                                    IP: 192.0.2.71 • MAC: 02:00:00:00:00:01
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] font-mono text-emerald-400 font-medium">
                                                {nodePings.g7?.status || (onlineStatus ? "Online" : "Port 8082")}
                                            </span>
                                            {nodePings.g7?.latencyMs !== undefined && (
                                                <span className="text-[10px] text-white/40 block">
                                                    {nodePings.g7.latencyMs}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Second Laptop */}
                                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Radio size={16} className="text-purple-400" />
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-white">Second_Laptop</span>
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/20 text-purple-300 font-mono">RELAY</span>
                                                </div>
                                                <span className="text-[11px] text-white/50 font-mono">
                                                    IP: 192.0.2.67 • MAC: 02:00:00:00:00:02
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] font-mono text-white/60">
                                                {nodePings.second_laptop?.status || "Relay Node"}
                                            </span>
                                            {nodePings.second_laptop?.latencyMs !== undefined && (
                                                <span className="text-[10px] text-white/40 block">
                                                    {nodePings.second_laptop.latencyMs}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone (Ramses iPhone) */}
                                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Smartphone size={16} className="text-amber-400" />
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-white">Ramses iPhone</span>
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-mono">MOBILE</span>
                                                </div>
                                                <span className="text-[11px] text-white/50 font-mono">
                                                    IP: 192.0.2.100 • MAC: 02:00:00:00:00:03
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] font-mono text-white/60">
                                                Safari / Companion
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Relay Deploy Instructions for Second Laptop */}
                            <div className="space-y-1.5 pt-1 border-t border-white/10">
                                <div className="flex items-center justify-between text-white/70">
                                    <span className="flex items-center gap-1.5 font-mono text-[11px]">
                                        <Terminal size={12} className="text-cyan-400" />
                                        {tr("Second Laptop Relay Command (PowerShell):")}
                                    </span>
                                    {copiedCmd === 'relay' && (
                                        <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                                            <Check size={11} /> {tr("Copied")}
                                        </span>
                                    )}
                                </div>
                                <div className="relative group">
                                    <pre className="p-2.5 rounded-lg bg-black/70 border border-white/15 text-cyan-300 font-mono text-[11px] overflow-x-auto select-all custom-scrollbar">
                                        {relayLaunchCmd}
                                    </pre>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(relayLaunchCmd, 'relay')}
                                        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                                        title={tr("Copy command")}
                                    >
                                        <Copy size={13} />
                                    </button>
                                </div>
                            </div>

                            <p className="text-[11px] text-white/50 leading-relaxed">
                                {tr("Tip: second laptop can also double-click ")}
                                <code className="text-cyan-300">scripts/deploy-second-relay.bat</code>
                                {tr(" to start the relay instantly.")}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
