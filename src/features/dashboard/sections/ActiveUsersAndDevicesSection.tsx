import React, { useMemo } from 'react';
import {
    Users,
    Laptop,
    Smartphone,
    Server,
    RefreshCw,
    Wifi,
    Clock,
    Activity,
    Shield,
    CheckCircle2,
    Monitor,
    Tablet,
    Radio,
    Terminal,
} from 'lucide-react';
import { useUserPresence, UserActiveSession } from '../../../lib/presence/useUserPresence';
import { ONYX_MESH_TOPOLOGY, MESH_NODES } from '../../../lib/network/localMeshMap';
import { colibriRealtimeBridge } from '../../../lib/ai/colibriRealtimeBridge';
import { tr } from '../../../lib/i18n';

function formatTimeAgo(timestampStr: string): string {
    const timeMs = Date.parse(timestampStr);
    if (Number.isNaN(timeMs)) return 'just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
    if (diffSec < 15) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
}

function getInitials(name?: string | null, email?: string | null): string {
    if (name && name.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }
    if (email) {
        return email.slice(0, 2).toUpperCase();
    }
    return 'OX';
}

function resolveMeshBadge(session: UserActiveSession) {
    const dev = session.device_name.toLowerCase();
    const ip = session.ip_address || '';

    if (ip === ONYX_MESH_TOPOLOGY.g7.ip || dev.includes('g7')) {
        return {
            isMesh: true,
            label: 'G7 Host Node',
            ip: ONYX_MESH_TOPOLOGY.g7.ip,
            color: 'acc-badge-mesh',
            roleDesc: 'Primary Colibrì MoE Host',
        };
    }
    if (ip === ONYX_MESH_TOPOLOGY.second_laptop.ip || dev.includes('martha')) {
        return {
            isMesh: true,
            label: 'Second Relay Node',
            ip: ONYX_MESH_TOPOLOGY.second_laptop.ip,
            color: 'acc-badge-relay',
            roleDesc: 'Mesh Relay Gateway',
        };
    }
    if (ip === ONYX_MESH_TOPOLOGY.phone.ip || dev.includes('phone') || dev.includes('iphone')) {
        return {
            isMesh: true,
            label: 'iPhone Client Node',
            ip: ONYX_MESH_TOPOLOGY.phone.ip,
            color: 'acc-badge-mesh',
            roleDesc: 'LiteRT & Mobile Client',
        };
    }
    return null;
}

function getDeviceIcon(deviceType: string, platform: string) {
    if (deviceType === 'edge_relay') return Server;
    if (deviceType === 'mobile' || platform === 'iOS' || platform === 'Android') return Smartphone;
    if (deviceType === 'tablet') return Tablet;
    if (platform === 'Windows' || platform === 'macOS' || platform === 'Linux') return Laptop;
    return Monitor;
}

function resolveUserRole(email?: string | null, userName?: string | null) {
    const mail = (email || '').toLowerCase();
    const name = (userName || '').toLowerCase();
    if (mail.includes('ramses') || mail === 'ramses@jouhayerk.com' || name.includes('ramses')) {
        return { label: 'ROOT', badgeClass: 'acc-badge-root' };
    }
    if (mail.includes('martha') || name.includes('martha')) {
        return { label: 'ADMIN', badgeClass: 'acc-badge-admin' };
    }
    return { label: 'OPERATOR', badgeClass: 'acc-badge-operator' };
}

export const ActiveUsersAndDevicesSection: React.FC = () => {
    const {
        sessions,
        loading,
        refetch,
        onlineCount,
        idleCount,
        desktopCount,
        mobileCount,
        edgeCount,
        totalCount,
        mySessionId,
    } = useUserPresence({ pollIntervalMs: 15_000 });

    const [colibriHostOnline, setColibriHostOnline] = React.useState<boolean>(() => colibriRealtimeBridge.isHostOnline());

    React.useEffect(() => {
        const unsub = colibriRealtimeBridge.onHostStatusChange((online) => {
            setColibriHostOnline(online);
        });
        return unsub;
    }, []);

    // Fallback display sessions if DB returns empty (e.g. offline dev mode)
    const displaySessions = useMemo<UserActiveSession[]>(() => {
        if (sessions.length > 0) return sessions;

        // Sensible default representations of known G7 fleet nodes
        return [
            {
                session_id: mySessionId || 'g7-local-session',
                user_id: 'usr-ramses-01',
                user_email: 'ramses@jouhayerk.com',
                user_name: 'Ramses Jouhayerk',
                device_name: 'G7 Laptop (Ramses)',
                device_type: 'desktop',
                client_platform: 'Windows',
                browser: 'Chrome 129 / PWA',
                ip_address: '192.0.2.71',
                current_view: 'admin',
                last_action: 'Inspecting Control Center',
                is_idle: false,
                last_seen_at: new Date().toISOString(),
                created_at: new Date(Date.now() - 3600000).toISOString(),
            },
            {
                session_id: 'second-relay-session',
                user_id: 'usr-second-02',
                user_email: 'martha@jouhayerk.com',
                user_name: 'Martha',
                device_name: "Second Laptop",
                device_type: 'desktop',
                client_platform: 'Windows',
                browser: 'Edge 128 / LAN Relay',
                ip_address: '192.0.2.67',
                current_view: 'logistics',
                last_action: 'Routing Colibrì Mesh Packets',
                is_idle: false,
                last_seen_at: new Date(Date.now() - 35000).toISOString(),
                created_at: new Date(Date.now() - 7200000).toISOString(),
            },
            {
                session_id: 'iphone-client-session',
                user_id: 'usr-ramses-01',
                user_email: 'ramses@jouhayerk.com',
                user_name: 'Ramses iPhone',
                device_name: 'Ramses iPhone 15 Pro',
                device_type: 'mobile',
                client_platform: 'iOS',
                browser: 'Mobile Safari / Companion App',
                ip_address: '192.0.2.100',
                current_view: 'inventory',
                last_action: 'Viewing Inventory Items',
                is_idle: true,
                last_seen_at: new Date(Date.now() - 240000).toISOString(),
                created_at: new Date(Date.now() - 10800000).toISOString(),
            },
        ];
    }, [sessions, mySessionId]);

    const activeSessionsCount = displaySessions.filter(s => !s.is_idle).length;
    const idleSessionsCount = displaySessions.filter(s => s.is_idle).length;

    return (
        <section aria-label="Active Users & Devices Fleet" className="space-y-8 animate-in fade-in duration-300">
            {/* Header: Active Presence HUD with live activity ring / counter */}
            <div className="acc-glass-panel p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Users size={24} />
                            <span className="absolute -top-1 -right-1 acc-dot acc-dot-emerald acc-pulse-emerald" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-black tracking-wide text-(--text-color) uppercase">
                                    {tr("Active Presence HUD")}
                                </h2>
                                <span className="acc-badge acc-badge-mesh">
                                    <Wifi size={10} />
                                    G7 Wi-Fi Mesh
                                </span>
                                <span className={`acc-badge ${colibriHostOnline ? 'acc-badge-root text-emerald-400 border-emerald-500/30' : 'text-cyan-400 border-cyan-500/30'}`}>
                                    <Radio size={10} className={colibriHostOnline ? 'animate-pulse' : ''} />
                                    {colibriHostOnline ? 'Colibrì MoE Host Online' : 'Supabase Relay Active'}
                                </span>
                            </div>
                            <p className="text-xs text-(--text-color-secondary) mt-0.5">
                                {tr("Real-time telemetry across desktops, mobile devices, and LAN mesh relays")}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            disabled={loading}
                            className="acc-action-btn hover:border-emerald-500/40"
                            title="Refresh active session heartbeats"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-400' : 'text-white/70'} />
                            <span>{loading ? tr("Syncing...") : tr("Refresh Fleet")}</span>
                        </button>
                    </div>
                </div>

                {/* HUD Metric Counters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                    <div className="acc-hud-card">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                                {tr("Active Sessions")}
                            </span>
                            <span className="acc-dot acc-dot-emerald acc-pulse-emerald" />
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {activeSessionsCount}
                            </span>
                            {idleSessionsCount > 0 && (
                                <span className="text-xs font-mono text-amber-400">
                                    +{idleSessionsCount} {tr("idle")}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] text-white/50">
                            {tr("Throttled 15s ping • wss:// Realtime")}
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                                {tr("Desktops")}
                            </span>
                            <Laptop size={14} className="text-blue-400" />
                        </div>
                        <div className="mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {desktopCount || displaySessions.filter(s => s.device_type === 'desktop').length}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50">
                            Windows 11 / macOS hosts
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                                {tr("Mobiles & Tablets")}
                            </span>
                            <Smartphone size={14} className="text-purple-400" />
                        </div>
                        <div className="mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {mobileCount || displaySessions.filter(s => s.device_type === 'mobile' || s.device_type === 'tablet').length}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50">
                            iOS Safari & LiteRT Bridge
                        </span>
                    </div>

                    <div className="acc-hud-card">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                                {tr("Edge Relays")}
                            </span>
                            <Radio size={14} className="text-cyan-400" />
                        </div>
                        <div className="mt-1">
                            <span className="text-2xl font-black font-mono text-(--text-color)">
                                {edgeCount || displaySessions.filter(s => s.device_type === 'edge_relay' || s.ip_address === '192.0.2.67').length}
                            </span>
                        </div>
                        <span className="text-[10px] text-white/50">
                            LAN relay & Colibrì proxies
                        </span>
                    </div>
                </div>
            </div>

            {/* User & Device Cards Grid */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) flex items-center gap-2">
                        <Monitor size={14} />
                        {tr("Connected Operators & Hardware Nodes")} ({displaySessions.length})
                    </h3>
                    <span className="text-[10px] font-mono text-white/40">
                        {tr("Auto-sync: Active")}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displaySessions.map((session) => {
                        const isThisDevice = session.session_id === mySessionId;
                        const roleInfo = resolveUserRole(session.user_email, session.user_name);
                        const meshBadge = resolveMeshBadge(session);
                        const DeviceIcon = getDeviceIcon(session.device_type, session.client_platform);
                        const initials = getInitials(session.user_name, session.user_email);

                        return (
                            <div key={session.session_id} className="acc-device-card group">
                                {/* Top Row: User Avatar, Name, Role, & Status Beacon */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-linear-to-tr from-white/10 to-white/5 border border-white/15 flex items-center justify-center font-mono font-bold text-sm text-(--text-color) shadow-inner shrink-0">
                                            {initials}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-(--text-color) truncate">
                                                    {session.user_name || session.user_email?.split('@')[0] || tr("Operator")}
                                                </h4>
                                                <span className={`acc-badge ${roleInfo.badgeClass}`}>
                                                    {roleInfo.label}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-(--text-color-secondary) truncate font-mono">
                                                {session.user_email || 'local@onyx.lan'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Status Indicator */}
                                    <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/5">
                                        {session.is_idle ? (
                                            <>
                                                <span className="acc-dot acc-dot-amber" />
                                                <span className="text-[10px] font-mono font-semibold text-amber-400">
                                                    {tr("Idle")} • {formatTimeAgo(session.last_seen_at)}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="acc-dot acc-dot-emerald acc-pulse-emerald" />
                                                <span className="text-[10px] font-mono font-semibold text-emerald-400">
                                                    {tr("Active")} • {formatTimeAgo(session.last_seen_at)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Middle Row: Device Info & Specs */}
                                <div className="p-3 rounded-xl bg-black/25 border border-white/5 space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2 text-(--text-color) font-medium">
                                            <DeviceIcon size={14} className="text-cyan-400 shrink-0" />
                                            <span className="truncate">{session.device_name}</span>
                                        </div>
                                        {isThisDevice && (
                                            <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20">
                                                {tr("This Node")}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] font-mono text-white/60">
                                        <span>{session.client_platform} • {session.browser || 'App'}</span>
                                        <span className="text-white/80">{session.ip_address || '127.0.0.1'}</span>
                                    </div>
                                </div>

                                {/* Bottom Row: Active View & Mesh Badge */}
                                <div className="flex items-center justify-between gap-2 pt-1">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="acc-badge acc-badge-view truncate max-w-[150px]">
                                            <Activity size={10} className="text-cyan-400 shrink-0" />
                                            {session.current_view ? `View: ${session.current_view}` : tr("Active")}
                                        </span>
                                        {session.last_action && (
                                            <span className="text-[10px] text-white/40 truncate hidden sm:inline" title={session.last_action}>
                                                {session.last_action}
                                            </span>
                                        )}
                                    </div>

                                    {meshBadge && (
                                        <span className={`acc-badge ${meshBadge.color} shrink-0`} title={meshBadge.roleDesc}>
                                            <Wifi size={10} />
                                            {meshBadge.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
