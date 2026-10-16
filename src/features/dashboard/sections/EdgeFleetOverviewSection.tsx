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
} from 'lucide-react';
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
        <div className={`acc-device-card ${accent}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-(--text-color)">
                        {icon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-(--text-color)">{configured ? node.name : tr(node.name)}</h4>
                            <span className="acc-badge acc-badge-mesh">{tr(badge)}</span>
                        </div>
                        <p className="text-[11px] font-mono text-(--text-color-secondary)">
                            {configured ? `${node.ip}:${node.colibriPort}` : tr("Not configured")}
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-3">
                <span className="text-white/50">{tr("Ping Latency")}:</span>
                <span className="font-mono font-bold">
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

export const EdgeFleetOverviewSection: React.FC = () => {
    // Pico Fleet Telemetry
    const { devices, source, error: picoError } = useDeviceFleet();

    // Mesh Nodes Ping States
    const [pingResults, setPingResults] = useState<Record<string, NodePingResult>>({});
    const [isPingingAll, setIsPingingAll] = useState<boolean>(false);
    const [relayTestStatus, setRelayTestStatus] = useState<{ testing: boolean; message?: string; ok?: boolean } | null>(null);
    const [, setMeshTick] = useState(0);

    // Colibrì server status: only what the server really reports (GET /health and GET /v1/models)
    const [colibri, setColibri] = useState<ColibriStatus | null>(null);

    const refreshColibri = useCallback(async () => {
        try {
            setColibri(await getColibriStatus(getProviderConfig('colibri')));
        } catch {
            setColibri(null);
        }
    }, []);

    // Execute Ping to all configured mesh nodes (none by default)
    const handlePingAllMeshNodes = useCallback(async () => {
        setIsPingingAll(true);
        const results: Record<string, NodePingResult> = {};
        for (const node of MESH_NODES) {
            results[node.id] = await pingMeshNode(node);
        }
        setPingResults(results);
        await refreshColibri();
        setIsPingingAll(false);
    }, [refreshColibri]);

    // Test the configured relay node
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

    // Export Telemetry JSON
    const handleExportTelemetry = useCallback(() => {
        const payload = {
            exportTimestamp: new Date().toISOString(),
            topology: ONYX_MESH_TOPOLOGY,
            meshPingResults: pingResults,
            colibriStatus: colibri,
            picoFleet: {
                source,
                devicesCount: devices.length,
                devices,
            },
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `onyx-edge-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [pingResults, colibri, source, devices]);

    // Initial check on mount
    useEffect(() => {
        void handlePingAllMeshNodes();
    }, [handlePingAllMeshNodes]);

    // ...and again when the mesh list or the Colibrì address changes
    useEffect(() => {
        const onChange = () => { setMeshTick(t => t + 1); void handlePingAllMeshNodes(); };
        window.addEventListener(MESH_NODES_EVENT, onChange);
        window.addEventListener(AI_CONFIG_EVENT, onChange);
        return () => {
            window.removeEventListener(MESH_NODES_EVENT, onChange);
            window.removeEventListener(AI_CONFIG_EVENT, onChange);
        };
    }, [handlePingAllMeshNodes]);

    // Pico devices exactly as the fleet reports them: when there are none, say so (no invented controllers)
    const now = Date.now();
    const effectivePicoDevices = useMemo<DeviceState[]>(() => devices, [devices]);

    const host = ONYX_MESH_TOPOLOGY.g7;
    const relay = ONYX_MESH_TOPOLOGY.second_laptop;
    const client = ONYX_MESH_TOPOLOGY.phone;
    const colibriOnline = Boolean(colibri?.ok);

    return (
        <section aria-label="Edge Fleet & Colibrì Overview" className="space-y-8 animate-in fade-in duration-300">
            {/* Header: Edge Fleet HUD with Quick Action Buttons */}
            <div className="acc-glass-panel p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                            <Cpu size={24} />
                            {colibriOnline && <span className="absolute -top-1 -right-1 acc-dot acc-dot-cyan acc-pulse-cyan" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-black tracking-wide text-(--text-color) uppercase">
                                    {tr("Edge & Colibrì Fleet Overview")}
                                </h2>
                                <span className="acc-badge acc-badge-mesh">
                                    <Zap size={10} />
                                    {tr("Local model")}
                                </span>
                            </div>
                            <p className="text-xs text-(--text-color-secondary) mt-0.5">
                                {tr("Local Colibrì model server, optional LAN nodes, and RP2040 Pico controllers")}
                            </p>
                        </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void handlePingAllMeshNodes()}
                            disabled={isPingingAll}
                            className="acc-action-btn acc-action-btn-primary"
                            title={tr("Check Colibrì and ping the configured nodes")}
                        >
                            <RefreshCw size={14} className={isPingingAll ? 'animate-spin' : ''} />
                            <span>{isPingingAll ? tr("Pinging...") : tr("Ping Mesh Nodes")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleTestRelay()}
                            disabled={relayTestStatus?.testing}
                            className="acc-action-btn hover:border-purple-500/40"
                            title={tr("Test the configured relay node")}
                        >
                            <Share2 size={14} className="text-purple-400" />
                            <span>{relayTestStatus?.testing ? tr("Testing...") : tr("Test Colibrì Relay")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleExportTelemetry}
                            className="acc-action-btn"
                            title={tr("Download complete telemetry JSON file")}
                        >
                            <Download size={14} className="text-emerald-400" />
                            <span>{tr("Export Telemetry JSON")}</span>
                        </button>
                    </div>
                </div>

                {/* Relay Test Alert Banner if executed */}
                {relayTestStatus && !relayTestStatus.testing && (
                    <div className={`mt-4 p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
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

                {/* Fast Overview Metric Cards: every number comes from the server or from the list, never a constant */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                    <div className="acc-hud-card">
                        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                            {tr("Colibrì server")}
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-2xl font-black font-mono ${colibriOnline ? 'text-cyan-400' : 'text-(--text-color-secondary)'}`}>
                                {colibri === null ? '…' : colibriOnline ? tr("Online") : tr("Offline")}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50 truncate" title={colibri?.baseUrl}>
                            {colibri?.baseUrl || '—'}
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                            {tr("Loaded model")}
                        </span>
                        <div className="mt-1">
                            <span className="text-base font-black font-mono text-(--text-color) break-all">
                                {colibri?.modelId || '—'}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50 font-mono">
                            {colibri?.inputModalities ? `${tr("Input")}: ${colibri.inputModalities.join(', ')}` : tr("Text only")}
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                            {tr("Queue")}
                        </span>
                        <div className="mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {colibri?.active !== undefined ? `${colibri.active} / ${colibri.queued ?? 0}` : '—'}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50 font-mono">
                            {colibri?.completed !== undefined ? trf('{n} answered', { n: colibri.completed }) : tr("Active / queued")}
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                            {tr("Active Pico Hardware")}
                        </span>
                        <div className="mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {effectivePicoDevices.length} <span className="text-sm font-normal text-white/50">{tr("Units")}</span>
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50 font-mono">
                            {picoError ? tr("Fleet unavailable") : tr("As reported by the fleet")}
                        </span>
                    </div>
                </div>
                {colibri && !colibri.ok && (
                    <p className="mt-4 text-[11px] font-mono text-amber-300">{colibri.message}</p>
                )}
                <MeshNodeEditor onSaved={() => { setMeshTick(t => t + 1); void handlePingAllMeshNodes(); }} />
            </div>

            {/* Interactive Hairline 3D Edge Hardware Studio */}
            <HairlineDeviceGallery />

            {/* Mesh nodes: only the ones the person configured have an address */}
            <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-4 px-1 flex items-center gap-2">
                    <Zap size={14} className="text-cyan-400" />
                    {tr("LAN Mesh Nodes")}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <MeshNodeCard node={host} badge="Host" icon={<Laptop size={20} />} accent="border-cyan-500/20 bg-cyan-950/10" ping={pingResults['g7']} />
                    <MeshNodeCard node={relay} badge="Relay" icon={<Radio size={20} />} accent="border-purple-500/20 bg-purple-950/10" ping={pingResults['second_laptop']} />
                    <MeshNodeCard node={client} badge="Mobile" icon={<Smartphone size={20} />} accent="border-blue-500/20 bg-blue-950/10" ping={pingResults['phone']} />
                </div>
            </div>

            {/* Hardware Pico Controllers Section */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) flex items-center gap-2">
                        <Radio size={14} className="text-emerald-400" />
                        {tr("Hardware Pico Microcontroller Fleet")} ({effectivePicoDevices.length})
                    </h3>
                    <button
                        type="button"
                        onClick={() => void handlePingAllMeshNodes()}
                        className="text-[10px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
                    >
                        <RefreshCw size={10} className={isPingingAll ? 'animate-spin' : ''} />
                        {tr("Refresh")}
                    </button>
                </div>

                {effectivePicoDevices.length === 0 && (
                    <p className="px-1 text-xs text-(--text-color-secondary)">
                        {picoError ? tr("The Pico fleet could not be read") : tr("No Pico controllers have reported yet")}
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {effectivePicoDevices.map((pico) => {
                        const conn = connectivity(pico, now);
                        const isOnline = conn === 'online';
                        const isStale = conn === 'stale';

                        return (
                            <div key={pico.device_id} className="acc-device-card">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
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
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5">
                                            {pico.battery_pct !== null ? `${pico.battery_pct}%` : 'DC Power'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                                            <Wifi size={10} className="text-blue-400" />
                                            RSSI
                                        </span>
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5">
                                            {pico.rssi !== null ? `${pico.rssi} dBm` : '—'}
                                        </span>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider flex items-center gap-1">
                                            <Thermometer size={10} className="text-amber-400" />
                                            {tr("Core Temp")}
                                        </span>
                                        <span className="text-sm font-bold text-(--text-color) mt-0.5">
                                            {pico.temp_c !== null ? `${pico.temp_c}°C` : '—'}
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom Info Row */}
                                <div className="flex items-center justify-between text-[11px] text-white/50 pt-1 font-mono">
                                    <span>
                                        Workflow: <strong className="text-white/80">{pico.active_workflow || 'None'}</strong>
                                    </span>
                                    <span>
                                        Heap: {pico.heap_free ? `${Math.round(pico.heap_free / 1024)} KB free` : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
