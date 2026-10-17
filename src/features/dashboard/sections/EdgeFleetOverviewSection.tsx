import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Cpu,
    Wifi,
    Radio,
    Download,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Zap,
    Battery,
    Thermometer,
    Share2,
    Laptop,
    Smartphone,
    X,
} from 'lucide-react';
import { useSetAtom } from 'jotai';
import { localStatusOpenAtom } from '../../../lib/atoms';
import { useDeviceFleet } from '../../pico/surfaces/useDeviceFleet';
import { connectivity, DeviceState } from '../../pico/surfaces/types';
import {
    ONYX_MESH_TOPOLOGY,
    MESH_NODES,
    MESH_NODES_EVENT,
    getMeshNodeConfigs,
    isMeshNodeConfigured,
    pingMeshNode,
    saveMeshNodeConfigs,
    type MeshDeviceNode,
    type MeshNodeConfig,
    type MeshNodeRole,
} from '../../../lib/network/localMeshMap';
import { getColibriStatus, type ColibriStatus } from '../../../lib/ai/providers/colibri';
import { getProviderConfig, AI_CONFIG_EVENT } from '../../../lib/ai/providerKeys';
import { tr, trf } from '../../../lib/i18n';
import {
    HairlineDeviceGallery,
    HairlineStackChan,
    HairlineM5StickS3,
    HairlineM5StickCPlus2,
} from '../hairline';

interface NodePingResult {
    ok: boolean;
    latencyMs: number;
    status: string;
}

export interface LayaStatus {
    ok: boolean;
    latencyMs?: number;
    modelId?: string;
    baseUrl: string;
    message?: string;
}

export async function probeLayaStatus(timeoutMs = 2000): Promise<LayaStatus> {
    const baseUrl = 'http://127.0.0.1:8001';
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl}/health`, { method: 'GET', signal: controller.signal });
        const latencyMs = Math.round(performance.now() - start);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
                ok: true,
                latencyMs,
                baseUrl,
                modelId: data.model || data.modelId || 'laya-v1-edge',
                message: tr('Online'),
            };
        }
        return { ok: false, baseUrl, message: tr('Offline') };
    } catch {
        return { ok: false, baseUrl, message: tr('Offline') };
    } finally {
        clearTimeout(timer);
    }
}

const ROLE_ROWS: Array<{ role: MeshNodeRole; label: string }> = [
    { role: 'primary_host', label: 'Colibrì host' },
    { role: 'relay_node', label: 'Relay node' },
    { role: 'mobile_client', label: 'Mobile client' },
];

/** Small form for the mesh list. The list lives in this browser only (localStorage); nothing is sent anywhere. */
const MeshNodeEditor: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
    const [rows, setRows] = useState<Record<MeshNodeRole, { name: string; ip: string; port: string }>>(() => {
        const saved = getMeshNodeConfigs();
        const pick = (role: MeshNodeRole) => {
            const c = saved.find(x => x.role === role);
            return { name: c?.name || '', ip: c?.ip || '', port: c?.colibriPort ? String(c.colibriPort) : '' };
        };
        return { primary_host: pick('primary_host'), relay_node: pick('relay_node'), mobile_client: pick('mobile_client') };
    });

    const save = () => {
        const list: MeshNodeConfig[] = [];
        for (const { role } of ROLE_ROWS) {
            const r = rows[role];
            if (!r.ip.trim()) continue;
            const port = Number(r.port);
            list.push({ role, name: r.name, ip: r.ip.trim(), colibriPort: Number.isFinite(port) && port > 0 ? port : undefined });
        }
        saveMeshNodeConfigs(list);
        onSaved();
    };

    return (
        <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-(--text-color-secondary) font-mono">{tr("Configure mesh nodes")}</summary>
            <div className="mt-3 space-y-2">
                <p className="text-[11px] text-(--text-color-secondary)">
                    {tr("Optional. Addresses stay in this browser only. Leave the address empty to skip a node.")}
                </p>
                {ROLE_ROWS.map(({ role, label }) => (
                    <div key={role} className="grid grid-cols-[110px_1fr_1fr_80px] gap-2 items-center">
                        <span className="text-(--text-color-secondary)">{tr(label)}</span>
                        <input
                            className="px-2 py-1 rounded-md bg-black/20 border border-white/10 font-mono"
                            placeholder={tr("Name")}
                            aria-label={`${tr(label)}: ${tr("Name")}`}
                            value={rows[role].name}
                            onChange={(e) => setRows(prev => ({ ...prev, [role]: { ...prev[role], name: e.target.value } }))}
                        />
                        <input
                            className="px-2 py-1 rounded-md bg-black/20 border border-white/10 font-mono"
                            placeholder={tr("IP or hostname")}
                            aria-label={`${tr(label)}: ${tr("IP or hostname")}`}
                            value={rows[role].ip}
                            onChange={(e) => setRows(prev => ({ ...prev, [role]: { ...prev[role], ip: e.target.value } }))}
                        />
                        <input
                            className="px-2 py-1 rounded-md bg-black/20 border border-white/10 font-mono"
                            placeholder="8000"
                            inputMode="numeric"
                            aria-label={`${tr(label)}: ${tr("Port")}`}
                            value={rows[role].port}
                            onChange={(e) => setRows(prev => ({ ...prev, [role]: { ...prev[role], port: e.target.value } }))}
                        />
                    </div>
                ))}
                <button type="button" onClick={save} className="acc-action-btn">
                    <span>{tr("Save nodes")}</span>
                </button>
            </div>
        </details>
    );
};

/** One mesh slot: the configured node with its real ping, or a quiet "not configured" card. */
const MeshNodeCard: React.FC<{
    node: MeshDeviceNode;
    badge: string;
    icon: React.ReactNode;
    accent: string;
    ping?: NodePingResult;
}> = ({ node, badge, icon, accent, ping }) => {
    const configured = isMeshNodeConfigured(node);
    return (
        <div className={`liquid-control p-3.5 space-y-2 border ${accent}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-(--text-color)">
                        {icon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-(--text-color)">{configured ? node.name : tr(node.name)}</h4>
                            <span className="acc-badge acc-badge-mesh">{tr(badge)}</span>
                        </div>
                        <p className="text-[10px] font-mono text-(--text-color-secondary)">
                            {configured ? `${node.ip}:${node.colibriPort}` : tr("Not configured")}
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                <span className="text-white/50">{tr("Ping Latency")}:</span>
                <span className="font-mono font-bold tabular-figures">
                    {!configured
                        ? '—'
                        : ping
                            ? `${ping.ok ? `${ping.latencyMs}ms ` : ''}(${tr(ping.status)})`
                            : tr("Not checked yet")}
                </span>
            </div>
        </div>
    );
};

/**
 * Local AI & Mesh Drawer/Sheet (.liquid-surface)
 * Triggered by the Island "Local" button.
 * Dual-endpoint health cards for Qwen3.6 (:8000) and Laya (:8001), plus LAN Mesh nodes.
 */
export const LocalMeshColibriSheet: React.FC = () => {
    const setLocalStatusOpen = useSetAtom(localStatusOpenAtom);

    // Mesh Nodes Ping States
    const [pingResults, setPingResults] = useState<Record<string, NodePingResult>>({});
    const [isPingingAll, setIsPingingAll] = useState<boolean>(false);
    const [relayTestStatus, setRelayTestStatus] = useState<{ testing: boolean; message?: string; ok?: boolean } | null>(null);
    const [, setMeshTick] = useState(0);

    // Colibrì Qwen3.6 :8000 status
    const [colibri, setColibri] = useState<ColibriStatus | null>(null);
    // Laya :8001 status
    const [laya, setLaya] = useState<LayaStatus | null>(null);

    const refreshLocalModels = useCallback(async () => {
        try {
            const [c, l] = await Promise.all([
                getColibriStatus(getProviderConfig('colibri')).catch(() => null),
                probeLayaStatus().catch(() => null),
            ]);
            setColibri(c);
            setLaya(l);
        } catch {
            setColibri(null);
            setLaya(null);
        }
    }, []);

    const handlePingAllMeshNodes = useCallback(async () => {
        setIsPingingAll(true);
        const results: Record<string, NodePingResult> = {};
        for (const node of MESH_NODES) {
            results[node.id] = await pingMeshNode(node);
        }
        setPingResults(results);
        await refreshLocalModels();
        setIsPingingAll(false);
    }, [refreshLocalModels]);

    const handleTestRelay = useCallback(async () => {
        const relayNode = ONYX_MESH_TOPOLOGY.second_laptop;
        if (!isMeshNodeConfigured(relayNode)) {
            setRelayTestStatus({ testing: false, ok: false, message: tr("No relay node is configured") });
            return;
        }
        setRelayTestStatus({ testing: true });
        try {
            const res = await pingMeshNode(relayNode);
            setRelayTestStatus(res.ok
                ? { testing: false, ok: true, message: trf('Relay online • {ms}ms', { ms: res.latencyMs }) }
                : { testing: false, ok: false, message: trf('Relay unreachable ({status}) • start it on {ip}', { status: res.status, ip: relayNode.ip }) });
        } catch (err: any) {
            setRelayTestStatus({
                testing: false,
                ok: false,
                message: `${tr("Relay test error")}: ${err?.message || tr("Connection refused")}`,
            });
        }
    }, []);

    useEffect(() => {
        void handlePingAllMeshNodes();
    }, [handlePingAllMeshNodes]);

    useEffect(() => {
        const onChange = () => { setMeshTick(t => t + 1); void handlePingAllMeshNodes(); };
        window.addEventListener(MESH_NODES_EVENT, onChange);
        window.addEventListener(AI_CONFIG_EVENT, onChange);
        return () => {
            window.removeEventListener(MESH_NODES_EVENT, onChange);
            window.removeEventListener(AI_CONFIG_EVENT, onChange);
        };
    }, [handlePingAllMeshNodes]);

    const host = ONYX_MESH_TOPOLOGY.g7;
    const relay = ONYX_MESH_TOPOLOGY.second_laptop;
    const client = ONYX_MESH_TOPOLOGY.phone;
    const colibriOnline = Boolean(colibri?.ok);
    const layaOnline = Boolean(laya?.ok);

    return (
        <aside aria-label="Local AI and Mesh Status" className="liquid-surface acc-local-sheet-enter p-5 sm:p-6 mb-8 border border-white/10 shadow-2xl relative">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Radio size={20} />
                        {(colibriOnline || layaOnline) && (
                            <span className="absolute -top-1 -right-1 acc-dot acc-dot-cyan acc-pulse-cyan" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black tracking-wide text-(--text-color) uppercase">
                                {tr("Local AI & Mesh Status")}
                            </h3>
                            <span className="acc-badge acc-badge-mesh">
                                <Zap size={10} />
                                {tr("Local models")}
                            </span>
                        </div>
                        <p className="text-[11px] text-(--text-color-secondary)">
                            {tr("Dual-endpoint local intelligence and LAN peer topology")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handlePingAllMeshNodes()}
                        disabled={isPingingAll}
                        className="liquid-control px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[28px] hover:border-cyan-500/40 text-(--text-color)"
                        title={tr("Check Colibrì, Laya, and ping configured mesh nodes")}
                    >
                        <RefreshCw size={12} className={isPingingAll ? 'animate-spin text-cyan-400' : 'text-(--text-color-secondary)'} />
                        <span>{isPingingAll ? tr("Pinging...") : tr("Ping All")}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleTestRelay()}
                        disabled={relayTestStatus?.testing}
                        className="liquid-control px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[28px] hover:border-purple-500/40 text-(--text-color)"
                        title={tr("Test configured relay node")}
                    >
                        <Share2 size={12} className="text-purple-400" />
                        <span>{relayTestStatus?.testing ? tr("Testing...") : tr("Test Relay")}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setLocalStatusOpen(false)}
                        className="liquid-control p-1.5 text-(--text-color-secondary) hover:text-(--text-color) cursor-pointer min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] flex items-center justify-center rounded-lg"
                        title={tr("Close local drawer")}
                        aria-label={tr("Close local drawer")}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Relay test alert banner */}
            {relayTestStatus && !relayTestStatus.testing && (
                <div className={`mt-3 p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
                    relayTestStatus.ok
                        ? 'bg-purple-950/20 border-purple-500/30 text-purple-300'
                        : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                }`}>
                    <div className="flex items-center gap-2">
                        {relayTestStatus.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{relayTestStatus.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setRelayTestStatus(null)}
                        className="text-white/40 hover:text-white px-2 py-0.5"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Section A — Colibrì Local Models (Dual-Endpoint) */}
            <div className="pt-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) block mb-3">
                    {tr("Colibrì Local Models")}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Qwen3.6 :8000 */}
                    <div className="liquid-panel p-4 border border-cyan-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-black uppercase tracking-wider text-(--text-color)">
                                    Qwen3.6 • :8000
                                </h4>
                                <span className="acc-badge acc-badge-mesh">MoE Primary</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase">
                                <span className={`acc-dot ${colibriOnline ? 'acc-dot-cyan acc-pulse-cyan' : 'acc-dot-rose'}`} />
                                <span className={colibriOnline ? 'text-cyan-400' : 'text-rose-400'}>
                                    {colibri === null ? '…' : colibriOnline ? tr("Online") : tr("Offline")}
                                </span>
                            </div>
                        </div>
                        <div className="text-xs font-mono text-(--text-color) break-all">
                            {colibri?.modelId || 'qwen3.6-35b-a3b'}
                            <span className="text-[10px] text-(--text-color-secondary) ml-2">
                                ({colibri?.inputModalities ? colibri.inputModalities.join(', ') : 'Text, Vision'})
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-(--text-color-secondary) pt-1 border-t border-white/5">
                            <span>
                                Queue: <strong className="text-(--text-color) tabular-figures">{colibri?.active ?? 0} active / {colibri?.queued ?? 0} queued</strong>
                                {colibri?.completed !== undefined && ` • ${colibri.completed} served`}
                            </span>
                            <span className="text-cyan-400 font-bold tabular-figures">
                                {colibri?.latencyMs ? `${colibri.latencyMs}ms` : '—'}
                            </span>
                        </div>
                    </div>

                    {/* Laya :8001 */}
                    <div className="liquid-panel p-4 border border-emerald-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-black uppercase tracking-wider text-(--text-color)">
                                    Laya • :8001
                                </h4>
                                <span className="acc-badge text-emerald-400 border-emerald-500/30">Companion</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase">
                                <span className={`acc-dot ${layaOnline ? 'acc-dot-emerald' : 'acc-dot-rose'}`} />
                                <span className={layaOnline ? 'text-emerald-400' : 'text-rose-400'}>
                                    {laya === null ? '…' : layaOnline ? tr("Online") : tr("Offline")}
                                </span>
                            </div>
                        </div>
                        <div className="text-xs font-mono text-(--text-color)">
                            {laya?.modelId || 'laya-v1-edge'}
                            <span className="text-[10px] text-(--text-color-secondary) ml-2">
                                (Local Service)
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-(--text-color-secondary) pt-1 border-t border-white/5">
                            <span>
                                Queue: <strong className="text-(--text-color) tabular-figures">0 active / 0 queued</strong>
                            </span>
                            <span className="text-emerald-400 font-bold tabular-figures">
                                {laya?.latencyMs ? `${laya.latencyMs}ms` : '—'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section B — LAN Mesh Nodes */}
            <div className="pt-5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) block mb-3">
                    {tr("LAN Mesh Nodes")}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <MeshNodeCard node={host} badge="Host" icon={<Laptop size={18} />} accent="border-cyan-500/20" ping={pingResults['g7']} />
                    <MeshNodeCard node={relay} badge="Relay" icon={<Radio size={18} />} accent="border-purple-500/20" ping={pingResults['second_laptop']} />
                    <MeshNodeCard node={client} badge="Mobile" icon={<Smartphone size={18} />} accent="border-blue-500/20" ping={pingResults['phone']} />
                </div>
                <MeshNodeEditor onSaved={() => { setMeshTick(t => t + 1); void handlePingAllMeshNodes(); }} />
            </div>
        </aside>
    );
};

/**
 * Edge Hardware Fleet component (.liquid-panel)
 * Embedded directly into People & Devices view.
 */
export const EdgeControllersGrid: React.FC<{ onRefresh?: () => void; isRefreshing?: boolean }> = ({ onRefresh, isRefreshing }) => {
    const { devices, source, error: picoError } = useDeviceFleet();
    const effectivePicoDevices = useMemo<DeviceState[]>(() => devices, [devices]);
    const now = Date.now();

    return (
        <div className="space-y-6">
            {/* Interactive Hairline 3D Edge Hardware Studio */}
            <HairlineDeviceGallery />

            {/* Hardware Pico Controllers Section */}
            <div className="liquid-panel p-5">
                <div className="flex items-center justify-between mb-4 px-1">
                    <div className="flex items-center gap-2">
                        <Radio size={16} className="text-cyan-400" />
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color)">
                            {tr("Edge Hardware Fleet")}
                        </h3>
                        <span className="acc-badge acc-badge-mesh tabular-figures">
                            {effectivePicoDevices.length} {tr("Units")}
                        </span>
                    </div>
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="liquid-control text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 px-2.5 py-1 cursor-pointer min-h-[36px] sm:min-h-[28px]"
                        >
                            <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                            <span>{tr("Refresh")}</span>
                        </button>
                    )}
                </div>

                {effectivePicoDevices.length === 0 && (
                    <p className="px-1 text-xs text-(--text-color-secondary) py-4">
                        {picoError ? tr("The Pico fleet could not be read") : tr("No Pico controllers have reported yet")}
                    </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {effectivePicoDevices.map((pico) => {
                        const conn = connectivity(pico, now);
                        const isOnline = conn === 'online';
                        const isStale = conn === 'stale';

                        return (
                            <div key={pico.device_id} className="acc-device-card liquid-control">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
                                            <Radio size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-(--text-color) font-mono">
                                                    {pico.device_id}
                                                </h4>
                                                <span className="acc-badge acc-badge-view">
                                                    RP2040
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-(--text-color-secondary)">
                                                {pico.fw_version || 'Firmware v1.0'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Connectivity Pill */}
                                    <div className="flex items-center gap-1.5 bg-black/30 px-2.5 py-1 rounded-full border border-white/5">
                                        {isOnline ? (
                                            <>
                                                <span className="acc-dot acc-dot-emerald acc-pulse-emerald" />
                                                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">
                                                    {tr("Online")}
                                                </span>
                                            </>
                                        ) : isStale ? (
                                            <>
                                                <span className="acc-dot acc-dot-amber" />
                                                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">
                                                    {tr("Stale")}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="acc-dot acc-dot-rose" />
                                                <span className="text-[10px] font-mono font-bold text-rose-400 uppercase">
                                                    {tr("Offline")}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Interactive Hairline Microcontroller Figure */}
                                <div className="py-1">
                                    {pico.device_id.includes('onyxchan') ? (
                                        <HairlineStackChan
                                            title="StackChan Companion"
                                            botName={pico.device_id}
                                            batteryPct={pico.battery_pct ?? 0}
                                            className="max-h-[160px]"
                                        />
                                    ) : pico.device_id.includes('scale') ? (
                                        <HairlineM5StickCPlus2
                                            title="M5StickC Plus 2"
                                            nodeId={pico.device_id}
                                            batteryPct={pico.battery_pct ?? 0}
                                            tempC={pico.temp_c ?? 0}
                                            className="max-h-[160px]"
                                        />
                                    ) : (
                                        <HairlineM5StickS3
                                            title="M5StickS3 Controller"
                                            nodeId={pico.device_id}
                                            heapFree={pico.heap_free}
                                            rssi={pico.rssi ?? -100}
                                            className="max-h-[160px]"
                                        />
                                    )}
                                </div>

                                {/* Controller Telemetry Strip */}
                                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-black/25 border border-white/5 text-center font-mono text-xs">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                                            <Battery size={10} className="text-emerald-400" />
                                            {tr("Battery")}
                                        </span>
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5 tabular-figures">
                                            {pico.battery_pct !== null ? `${pico.battery_pct}%` : 'DC Power'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                                            <Wifi size={10} className="text-blue-400" />
                                            RSSI
                                        </span>
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5 tabular-figures">
                                            {pico.rssi !== null ? `${pico.rssi} dBm` : '—'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                                            <Thermometer size={10} className="text-amber-400" />
                                            {tr("Core Temp")}
                                        </span>
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5 tabular-figures">
                                            {pico.temp_c !== null ? `${pico.temp_c}°C` : '—'}
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom Info Row */}
                                <div className="flex items-center justify-between text-[11px] text-white/50 pt-1 font-mono">
                                    <span>
                                        Workflow: <strong className="text-white/80">{pico.active_workflow || 'None'}</strong>
                                    </span>
                                    <span className="tabular-figures">
                                        Heap: {pico.heap_free ? `${Math.round(pico.heap_free / 1024)} KB free` : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const EdgeFleetOverviewSection: React.FC = () => {
    return (
        <section aria-label="Edge Fleet & Colibrì Overview" className="space-y-8 animate-in fade-in duration-300">
            <LocalMeshColibriSheet />
            <EdgeControllersGrid />
        </section>
    );
};
