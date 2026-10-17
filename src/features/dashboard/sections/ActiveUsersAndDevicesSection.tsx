import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
    Bot,
    UserCheck,
    Cpu,
    Filter,
    SquarePen,
    Mail,
    UserX,
    ChevronDown,
    Check,
    X,
    AlertCircle,
    Download,
    Zap,
} from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { userAtom, localStatusOpenAtom } from '../../../lib/atoms';
import { useUserPresence, UserActiveSession } from '../../../lib/presence/useUserPresence';
import { ONYX_MESH_TOPOLOGY } from '../../../lib/network/localMeshMap';
import { colibriRealtimeBridge } from '../../../lib/ai/colibriRealtimeBridge';
import { getColibriStatus } from '../../../lib/ai/providers/colibri';
import { getProviderConfig } from '../../../lib/ai/providerKeys';
import { useDeviceFleet } from '../../pico/surfaces/useDeviceFleet';
import { connectivity, DeviceState } from '../../pico/surfaces/types';
import { EdgeControllersGrid, probeLayaStatus } from './EdgeFleetOverviewSection';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../lib/i18n';
import toast from 'react-hot-toast';

interface AppUser {
    id: string;
    email: string;
    role: string;
    display_name: string | null;
    notes: string | null;
    created_at: string;
    is_active: boolean | null;
    last_submit_at: string | null;
    total_submits: number | null;
}

function formatTimeAgo(timestampStr: string): string {
    const timeMs = Date.parse(timestampStr);
    if (Number.isNaN(timeMs)) return 'just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
    if (diffSec < 15) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMo = Math.floor(diffDays / 30);
    return `${diffMo}mo ago`;
}

function formatDate(ts: string | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: '2-digit',
    });
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
    const dev = (session.device_name || '').toLowerCase();
    const ip = (session.ip_address || '').trim();

    const g7Ip = (ONYX_MESH_TOPOLOGY.g7.ip || '').trim();
    if ((ip && g7Ip && ip === g7Ip) || dev.includes('g7')) {
        return {
            isMesh: true,
            label: 'G7 Host Node',
            ip: ONYX_MESH_TOPOLOGY.g7.ip,
            color: 'acc-badge-mesh',
            roleDesc: 'Primary Colibrì MoE Host',
        };
    }
    const relayIp = (ONYX_MESH_TOPOLOGY.second_laptop.ip || '').trim();
    if ((ip && relayIp && ip === relayIp) || dev.includes('martha')) {
        return {
            isMesh: true,
            label: 'Second Relay Node',
            ip: ONYX_MESH_TOPOLOGY.second_laptop.ip,
            color: 'acc-badge-relay',
            roleDesc: 'Mesh Relay Gateway',
        };
    }
    const phoneIp = (ONYX_MESH_TOPOLOGY.phone.ip || '').trim();
    if ((ip && phoneIp && ip === phoneIp) || dev.includes('phone') || dev.includes('iphone')) {
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

function resolveRoleBadge(roleStr?: string | null, email?: string | null, userName?: string | null) {
    const mail = (email || '').toLowerCase();
    const name = (userName || '').toLowerCase();
    const r = (roleStr || '').toLowerCase();

    if (mail.includes('ramses') || mail === 'ramses@jouhayerk.com' || name.includes('ramses') || r === 'developer') {
        return { label: 'ROOT / DEV', badgeClass: 'acc-badge-root' };
    }
    if (mail.includes('martha') || name.includes('martha') || r === 'admin') {
        return { label: 'ADMIN', badgeClass: 'acc-badge-admin' };
    }
    if (r === 'clientboss') {
        return { label: 'CLIENT BOSS', badgeClass: 'acc-badge-admin' };
    }
    if (r === 'clientaccounting') {
        return { label: 'ACCOUNTING', badgeClass: 'acc-badge-operator' };
    }
    if (r === 'clientviewer' || r === 'client') {
        return { label: 'VIEWER', badgeClass: 'acc-badge-view' };
    }
    if (r === 'vendor') {
        return { label: 'VENDOR', badgeClass: 'acc-badge-operator' };
    }
    return { label: (roleStr || 'OPERATOR').toUpperCase(), badgeClass: 'acc-badge-operator' };
}

/**
 * The roles an operator can be given. The values are the exact strings that NAV_BY_ROLE (navAccess.ts) and the RLS
 * policies (get_my_app_role()) compare against: any other spelling leaves the user without navigation and data.
 */
const ASSIGNABLE_ROLES: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'Developer', label: 'DEVELOPER (Root Clearance)' },
    { value: 'Admin', label: 'ADMIN (Executive Clearance)' },
    { value: 'ClientBoss', label: 'CLIENT BOSS (Corporate Oversight)' },
    { value: 'ClientAccounting', label: 'ACCOUNTING (Commercial Core)' },
    { value: 'ClientViewer', label: 'VIEWER (Read-Only Observer)' },
    { value: 'Vendor', label: 'VENDOR (Acquisitions)' },
];

interface UserFleetGroup {
    key: string;
    id?: string;
    email: string;
    name: string;
    role: string;
    /** app_users.role exactly as stored ('' when the user has no app_users row). */
    rawRole: string;
    roleBadgeClass: string;
    initials: string;
    totalSubmits: number;
    lastSubmitAt: string | null;
    isRegistered: boolean;
    isActiveOnline: boolean;
    isActiveAccount: boolean;
    latestSeenAt: string;
    sessions: UserActiveSession[];
    savedDevices: any[];
}

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;

export const ActiveUsersAndDevicesSection: React.FC = () => {
    const currentUser = useAtomValue(userAtom);
    const currentEmail = (currentUser?.email || '').toLowerCase();
    // Only Developer and Admin may change roles or suspend accounts (the DB enforces the same rule).
    const canManageUsers = currentUser?.role === 'Developer' || currentUser?.role === 'Admin';
    const {
        sessions,
        loading: presenceLoading,
        refetch: refetchPresence,
        mySessionId,
    } = useUserPresence({ pollIntervalMs: 15_000 });

    const { devices: savedFleetDevices } = useDeviceFleet();
    const effectivePicoDevices = useMemo<DeviceState[]>(() => (savedFleetDevices as DeviceState[]) || [], [savedFleetDevices]);
    const setLocalStatusOpen = useSetAtom(localStatusOpenAtom);
    const [colibriHostOnline, setColibriHostOnline] = useState<boolean>(() => colibriRealtimeBridge.isHostOnline());
    const [layaOnline, setLayaOnline] = useState<boolean>(false);
    const [registeredUsers, setRegisteredUsers] = useState<AppUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
    const [filterOnlyOnline, setFilterOnlyOnline] = useState<boolean>(false);

    // Inline edit modal state
    const [editingUser, setEditingUser] = useState<UserFleetGroup | null>(null);
    const [editName, setEditName] = useState<string>('');
    const [editRole, setEditRole] = useState<string>('');
    const [editIsActive, setEditIsActive] = useState<boolean>(true);
    const [isSavingUser, setIsSavingUser] = useState<boolean>(false);

    const refreshLocalAi = useCallback(async () => {
        try {
            const [c, l] = await Promise.all([
                getColibriStatus(getProviderConfig('colibri')).catch(() => null),
                probeLayaStatus().catch(() => null),
            ]);
            setColibriHostOnline(Boolean(c?.ok || colibriRealtimeBridge.isHostOnline()));
            setLayaOnline(Boolean(l?.ok));
        } catch {
            setColibriHostOnline(colibriRealtimeBridge.isHostOnline());
            setLayaOnline(false);
        }
    }, []);

    useEffect(() => {
        void refreshLocalAi();
    }, [refreshLocalAi]);

    // Listen to Colibri MoE host status
    useEffect(() => {
        const unsub = colibriRealtimeBridge.onHostStatusChange((online) => {
            setColibriHostOnline(online);
        });
        return unsub;
    }, []);

    // Fetch registered users from app_users
    const fetchRegisteredUsers = useCallback(async () => {
        try {
            setLoadingUsers(true);
            const { data, error } = await supabase
                .from('app_users')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error && data) {
                setRegisteredUsers(data as AppUser[]);
            }
        } catch (e) {
            console.error('Failed to fetch app_users:', e);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    useEffect(() => {
        fetchRegisteredUsers();
    }, [fetchRegisteredUsers]);

    const handleRefreshAll = useCallback(async () => {
        await Promise.all([refetchPresence(), fetchRegisteredUsers(), refreshLocalAi()]);
    }, [refetchPresence, fetchRegisteredUsers, refreshLocalAi]);

    // Open edit dialog for an operative
    const handleOpenEdit = (u: UserFleetGroup) => {
        setEditingUser(u);
        setEditName(u.name || '');
        setEditRole(u.rawRole);
        setEditIsActive(u.isActiveAccount);
    };

    const isSelf = (u: { email: string }) => !!currentEmail && u.email.toLowerCase() === currentEmail;

    // Role and account status are only editable by Developer/Admin, never on one's own row, and an Admin cannot touch a Developer.
    const canEditRoleOf = (u: UserFleetGroup) =>
        canManageUsers && u.isRegistered && !isSelf(u) && !(currentUser?.role === 'Admin' && u.rawRole === 'Developer');

    // Save edited operative identity. Only the fields that changed are sent: a name edit never rewrites the role.
    const handleSaveUser = async () => {
        if (!editingUser || !canManageUsers) return;
        const allowRoleEdit = canEditRoleOf(editingUser);
        const nextName = editName.trim() || null;
        const updatePayload: { display_name?: string | null; role?: string; is_active?: boolean } = {};
        const stored = registeredUsers.find(
            (r) => (editingUser.id && r.id === editingUser.id) || r.email.toLowerCase() === editingUser.email.toLowerCase()
        );
        if (nextName !== ((stored?.display_name || '').trim() || null)) {
            updatePayload.display_name = nextName;
        }
        if (allowRoleEdit && editRole && editRole !== editingUser.rawRole) {
            updatePayload.role = editRole;
        }
        if (allowRoleEdit && editIsActive !== editingUser.isActiveAccount) {
            updatePayload.is_active = editIsActive;
        }
        if (Object.keys(updatePayload).length === 0) {
            setEditingUser(null);
            return;
        }
        try {
            setIsSavingUser(true);
            const { error } = await supabase
                .from('app_users')
                .update(updatePayload)
                .eq(editingUser.id ? 'id' : 'email', editingUser.id || editingUser.email);

            if (error) {
                toast.error(`Update failed: ${error.message}`);
            } else {
                toast.success(tr("Operative Identity Updated"));
                setRegisteredUsers((prev) =>
                    prev.map((u) => {
                        if (
                            (editingUser.id && u.id === editingUser.id) ||
                            u.email.toLowerCase() === editingUser.email.toLowerCase()
                        ) {
                            return { ...u, ...updatePayload };
                        }
                        return u;
                    })
                );
                setEditingUser(null);
            }
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setIsSavingUser(false);
        }
    };

    // Quick dispatch invitation credentials email
    const sendInvite = (u: { name: string; email: string; role: string }) => {
        const appUrl = 'https://jouhayerk-cloud.github.io/onyx.mx/';
        const name = u.name || u.email.split('@')[0];
        const subject = encodeURIComponent('Invitation to Onyx.mx Enterprise Central');
        const body = encodeURIComponent(
            `Hello ${name},\n\nAccess credentials provisioned for Onyx Central Management.\nRole: ${u.role}\nEmail: ${u.email}\nApp: ${appUrl}\n\nAuthenticate via the partner portal to link your device fleet.`
        );
        window.open(`mailto:${u.email}?subject=${subject}&body=${body}`, '_blank');
    };

    // Quick toggle account active / suspended
    const handleToggleActive = async (u: UserFleetGroup) => {
        if (!canEditRoleOf(u)) return;
        const nextActive = !u.isActiveAccount;
        const { error } = await supabase
            .from('app_users')
            .update({ is_active: nextActive })
            .eq(u.id ? 'id' : 'email', u.id || u.email);
        if (!error) {
            toast.success(nextActive ? tr("Operative Activated") : tr("Operative Suspended"));
            setRegisteredUsers((prev) =>
                prev.map((r) => {
                    if ((u.id && r.id === u.id) || r.email.toLowerCase() === u.email.toLowerCase()) {
                        return { ...r, is_active: nextActive };
                    }
                    return r;
                })
            );
        } else {
            toast.error(`Failed to update status: ${error.message}`);
        }
    };

    // Live sessions strictly from presence (no fabricated fallback sessions)
    const displaySessions = useMemo<UserActiveSession[]>(() => {
        // The public Realtime channel carries no identity, so this device's own live session is labelled from the login.
        const live = sessions.map((s) =>
            s.session_id === mySessionId && !s.user_email && currentUser
                ? { ...s, user_id: s.user_id || currentUser.id, user_email: currentUser.email, user_name: s.user_name || currentUser.name }
                : s
        );

        // Deduplicate multiple browser tabs on the same hardware
        const deviceMap = new Map<string, { session: UserActiveSession; hasMySession: boolean }>();

        for (const s of live) {
            const who = s.user_email || s.user_id;
            const key = who
                ? `${who.toLowerCase()}::${s.device_name.toLowerCase()}::${s.client_platform.toLowerCase()}`
                : `session::${s.session_id}`;
            const existing = deviceMap.get(key);
            const isMine = s.session_id === mySessionId;

            if (!existing) {
                deviceMap.set(key, { session: s, hasMySession: isMine });
            } else {
                if (isMine) existing.hasMySession = true;
                const existingTime = Date.parse(existing.session.last_seen_at) || 0;
                const newTime = Date.parse(s.last_seen_at) || 0;
                if (newTime >= existingTime) {
                    existing.session = {
                        ...s,
                        session_id: isMine || existing.hasMySession ? mySessionId : s.session_id,
                    };
                }
            }
        }

        return Array.from(deviceMap.values())
            .map(({ session, hasMySession }) => ({
                ...session,
                session_id: hasMySession ? mySessionId : session.session_id,
            }))
            .sort((a, b) => (Date.parse(b.last_seen_at) || 0) - (Date.parse(a.last_seen_at) || 0));
    }, [sessions, mySessionId, currentUser]);

    // Unified Master Fleet Map (Ingesting all active sessions + registered database users)
    const allUserGroups = useMemo<UserFleetGroup[]>(() => {
        const map = new Map<string, UserFleetGroup>();

        // 1. Ingest all active hardware sessions
        for (const s of displaySessions) {
            // Sessions that arrive without identity (Realtime-only) stay separate instead of piling into one 'anon' card
            const emailKey = (s.user_email || s.user_id || s.user_name || `session:${s.session_id}`).toLowerCase().trim();
            const existing = map.get(emailKey);
            const roleInfo = resolveRoleBadge(undefined, s.user_email, s.user_name);

            if (!existing) {
                map.set(emailKey, {
                    key: emailKey,
                    email: s.user_email || '',
                    name: s.user_name || s.user_email?.split('@')[0] || tr('Unidentified session'),
                    role: roleInfo.label,
                    rawRole: '',
                    roleBadgeClass: roleInfo.badgeClass,
                    initials: getInitials(s.user_name, s.user_email),
                    totalSubmits: 0,
                    lastSubmitAt: null,
                    isRegistered: false,
                    isActiveOnline: true,
                    isActiveAccount: true,
                    latestSeenAt: s.last_seen_at,
                    sessions: [s],
                    savedDevices: [],
                });
            } else {
                existing.sessions.push(s);
                if (Date.parse(s.last_seen_at) > Date.parse(existing.latestSeenAt)) {
                    existing.latestSeenAt = s.last_seen_at;
                }
            }
        }

        // 2. Cross-reference with all registered users from database
        for (const reg of registeredUsers) {
            const emailKey = (reg.email || reg.id || '').toLowerCase().trim();
            const existing = map.get(emailKey);
            const roleInfo = resolveRoleBadge(reg.role, reg.email, reg.display_name);

            if (existing) {
                existing.id = reg.id;
                existing.isRegistered = true;
                existing.isActiveAccount = reg.is_active !== false;
                existing.totalSubmits = reg.total_submits || 0;
                existing.lastSubmitAt = reg.last_submit_at;
                if (reg.display_name) existing.name = reg.display_name;
                existing.role = roleInfo.label;
                existing.rawRole = (reg.role || '').trim();
                existing.roleBadgeClass = roleInfo.badgeClass;
            } else {
                // Registered user, currently offline
                map.set(emailKey, {
                    key: emailKey,
                    id: reg.id,
                    email: reg.email,
                    name: reg.display_name || reg.email.split('@')[0],
                    role: roleInfo.label,
                    rawRole: (reg.role || '').trim(),
                    roleBadgeClass: roleInfo.badgeClass,
                    initials: getInitials(reg.display_name, reg.email),
                    totalSubmits: reg.total_submits || 0,
                    lastSubmitAt: reg.last_submit_at,
                    isRegistered: true,
                    isActiveOnline: false,
                    isActiveAccount: reg.is_active !== false,
                    latestSeenAt: reg.last_submit_at || reg.created_at || '',
                    sessions: [],
                    savedDevices: [],
                });
            }
        }

        // 3. Link any paired saved IoT devices from Pico fleet
        if (savedFleetDevices && savedFleetDevices.length > 0) {
            for (const dev of savedFleetDevices) {
                const devAny = dev as any;
                const assignedEmail = (
                    devAny.assignedEmail ||
                    devAny.assigned_user ||
                    devAny.extra?.assignedEmail ||
                    devAny.extra?.assigned_user ||
                    ''
                )
                    .toLowerCase()
                    .trim();
                if (assignedEmail && map.has(assignedEmail)) {
                    map.get(assignedEmail)!.savedDevices.push(dev);
                }
            }
        }

        return Array.from(map.values());
    }, [displaySessions, registeredUsers, savedFleetDevices]);

    // Categorize into the Three-Tier User Architecture
    const { tier1ActiveUsers, tier2InactiveUsers, tier3NoLogUsers } = useMemo(() => {
        const nowMs = Date.now();
        const tier1: UserFleetGroup[] = [];
        const tier2: UserFleetGroup[] = [];
        const tier3: UserFleetGroup[] = [];

        for (const u of allUserGroups) {
            const hasLoginHistory = Boolean(u.lastSubmitAt) || u.totalSubmits > 0;
            const lastActivityTime = u.latestSeenAt ? Date.parse(u.latestSeenAt) : 0;
            const isRecentlyActive = lastActivityTime > 0 && nowMs - lastActivityTime <= TWO_MONTHS_MS;

            if (u.isActiveOnline || (isRecentlyActive && hasLoginHistory)) {
                // Tier 1: Connected live or active within the last 2 months
                tier1.push(u);
            } else if (!hasLoginHistory && !u.isActiveOnline) {
                // Tier 3: Zero login history (previously hidden accounts)
                tier3.push(u);
            } else {
                // Tier 2: Inactive > 2 Months with historical login activity
                tier2.push(u);
            }
        }

        // Sort Tier 1: online first, then by latest timestamp
        tier1.sort((a, b) => {
            if (a.isActiveOnline && !b.isActiveOnline) return -1;
            if (!a.isActiveOnline && b.isActiveOnline) return 1;
            return (Date.parse(b.latestSeenAt) || 0) - (Date.parse(a.latestSeenAt) || 0);
        });

        // Sort Tier 2: by last active timestamp descending
        tier2.sort((a, b) => (Date.parse(b.latestSeenAt) || 0) - (Date.parse(a.latestSeenAt) || 0));

        // Sort Tier 3: by alphabetical name
        tier3.sort((a, b) => a.name.localeCompare(b.name));

        return {
            tier1ActiveUsers: filterOnlyOnline ? tier1.filter((u) => u.isActiveOnline) : tier1,
            tier2InactiveUsers: filterOnlyOnline ? [] : tier2,
            tier3NoLogUsers: filterOnlyOnline ? [] : tier3,
        };
    }, [allUserGroups, filterOnlyOnline]);

    const onlineUsersCount = allUserGroups.filter((u) => u.isActiveOnline).length;
    const now = Date.now();
    const picoOnlineCount = useMemo(() => {
        return effectivePicoDevices.filter((d) => connectivity(d, now) === 'online').length;
    }, [effectivePicoDevices, now]);

    const handleExportTelemetry = useCallback(() => {
        const payload = {
            exportTimestamp: new Date().toISOString(),
            topology: ONYX_MESH_TOPOLOGY,
            colibriOnline: colibriHostOnline,
            layaOnline,
            sessions: displaySessions,
            registeredUsers: registeredUsers.length,
            onlineUsersCount,
            picoDevices: effectivePicoDevices,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `onyx-fleet-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [colibriHostOnline, layaOnline, displaySessions, registeredUsers.length, onlineUsersCount, effectivePicoDevices]);

    return (
        <section aria-label="Active Users & Devices Fleet" className="space-y-8 animate-in fade-in duration-300">
            {/* Unified Telemetry Strip (.liquid-panel, single row) */}
            <div className="liquid-panel p-4 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* 4 non-overlapping tabular counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                        {/* 1. Online Operatives */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-(--text-color-secondary)">
                                {tr("Online Operatives")}
                            </span>
                            <span className="text-base font-black font-mono text-(--text-color) tabular-figures">
                                <span className="text-emerald-400">{onlineUsersCount}</span> / {registeredUsers.length}
                            </span>
                        </div>

                        {/* 2. Live Sessions */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-(--text-color-secondary)">
                                {tr("Live Sessions")}
                            </span>
                            <span className="text-base font-black font-mono text-emerald-400 tabular-figures">
                                {displaySessions.length}
                            </span>
                        </div>

                        {/* 3. Edge Hardware */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-(--text-color-secondary)">
                                {tr("Edge Hardware")}
                            </span>
                            <span className="text-base font-black font-mono text-cyan-400 tabular-figures">
                                {picoOnlineCount} / {effectivePicoDevices.length} <span className="text-[10px] font-normal text-(--text-color-secondary)">{tr("up")}</span>
                            </span>
                        </div>

                        {/* 4. Local AI */}
                        <button
                            type="button"
                            onClick={() => setLocalStatusOpen((v) => !v)}
                            className="liquid-control flex flex-col min-w-0 p-2 cursor-pointer hover:border-cyan-500/40 text-left"
                            title={tr("Click to toggle Local AI & Mesh Drawer")}
                        >
                            <span className="text-[9px] font-black uppercase tracking-wider text-(--text-color-secondary) flex items-center gap-1">
                                <Zap size={10} className="text-cyan-400" />
                                {tr("Local AI")}
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono font-bold mt-0.5">
                                <span className="flex items-center gap-1 text-(--text-color)">
                                    :8000 <span className={`acc-dot ${colibriHostOnline ? 'acc-dot-cyan acc-pulse-cyan' : 'bg-white/20'}`} />
                                </span>
                                <span className="text-white/20">|</span>
                                <span className="flex items-center gap-1 text-(--text-color)">
                                    :8001 <span className={`acc-dot ${layaOnline ? 'acc-dot-emerald' : 'bg-white/20'}`} />
                                </span>
                            </div>
                        </button>
                    </div>

                    {/* Action cluster */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setFilterOnlyOnline(!filterOnlyOnline)}
                            className={`liquid-control px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[28px] ${
                                filterOnlyOnline ? 'text-emerald-300 border-emerald-400/50' : 'text-(--text-color-secondary)'
                            }`}
                        >
                            <Filter size={12} />
                            <span>{filterOnlyOnline ? tr("Filtered: Online Only") : tr("All Operatives")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleRefreshAll}
                            disabled={presenceLoading || loadingUsers}
                            className="liquid-control px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[28px] hover:border-emerald-500/40 text-(--text-color)"
                            title={tr("Refresh active session heartbeats & identity registry")}
                        >
                            <RefreshCw
                                size={12}
                                className={presenceLoading || loadingUsers ? 'animate-spin text-emerald-400' : 'text-(--text-color-secondary)'}
                            />
                            <span>{presenceLoading || loadingUsers ? tr("Syncing...") : tr("Refresh Fleet")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleExportTelemetry}
                            className="liquid-control px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer min-h-[36px] sm:min-h-[28px] hover:border-cyan-500/40 text-(--text-color)"
                            title={tr("Download complete telemetry JSON file")}
                        >
                            <Download size={12} className="text-cyan-400" />
                            <span>{tr("Export JSON")}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                TIER 1: CONNECTED OPERATORS & RECENTLY ACTIVE (< 2 MONTHS)
                Single panel per user with full device container & recent summary
                ════════════════════════════════════════════════════════════════════ */}
            <div>
                <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) flex items-center gap-2">
                        <Users size={13} />
                        {tr("Connected Operators & Recent Operatives")} ({tier1ActiveUsers.length})
                    </h3>
                    <span className="text-[10px] font-mono text-(--text-color-secondary)">
                        {tr("Active Live or Connected within last 60 days")}
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {tier1ActiveUsers.map((u) => {
                        const totalNodes = u.sessions.length + u.savedDevices.length;

                        return (
                            <div key={u.key} className="acc-user-container liquid-panel">
                                {/* User Header Row */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-(--border-color)">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-(--slab-glass-hi) border border-(--border-color) flex items-center justify-center font-mono font-bold text-sm text-(--text-color) shadow-inner">
                                                {u.initials}
                                            </div>
                                            {u.isActiveOnline && (
                                                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-(--app-bg) acc-pulse-emerald" />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="text-sm font-bold text-(--text-color) truncate">
                                                    {u.name}
                                                </h4>
                                                <span className={`acc-badge ${u.roleBadgeClass}`}>{u.role}</span>
                                                {u.isRegistered && (
                                                    <span className="acc-badge bg-(--slab-glass-lo) text-(--text-color-secondary) border border-(--border-color) text-[9px]">
                                                        {tr("Verified Account")}
                                                    </span>
                                                )}
                                                {canManageUsers && u.isRegistered && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEdit(u)}
                                                        className="p-1 rounded hover:bg-(--slab-glass-hi) text-(--text-color-secondary) hover:text-(--text-color) transition-all cursor-pointer"
                                                        title={tr("Edit Operative Designation & Role")}
                                                    >
                                                        <SquarePen size={12} />
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-mono text-(--text-color-secondary) truncate">
                                                {u.email}
                                            </p>
                                        </div>
                                    </div>

                                    {/* User Presence & Submission Badges */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {u.isActiveOnline ? (
                                            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                                                <span className="acc-dot acc-dot-emerald acc-pulse-emerald" />
                                                <span className="text-[10px] font-mono font-bold text-emerald-400">
                                                    {tr("Active")} • {u.sessions.length} {u.sessions.length === 1 ? 'Node' : 'Nodes'} • {formatTimeAgo(u.latestSeenAt)}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 bg-(--slab-glass-lo) border border-(--border-color) px-2.5 py-1 rounded-full">
                                                <span className="acc-dot bg-amber-400/80" />
                                                <span className="text-[10px] font-mono text-(--text-color-secondary)">
                                                    {tr("Recent")} • {u.lastSubmitAt ? formatDate(u.lastSubmitAt) : tr("Verified")}
                                                </span>
                                            </div>
                                        )}

                                        {u.totalSubmits > 0 && (
                                            <span
                                                className="text-[10px] font-mono text-(--text-color-secondary) flex items-center gap-1 bg-(--slab-glass-lo) px-2 py-1 rounded-md border border-(--border-color) tabular-figures"
                                                title={`${u.totalSubmits} recorded submissions in registry`}
                                            >
                                                <Activity size={10} className="text-(--main-color)" />
                                                {u.totalSubmits} {tr("logs")}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Single Container of All Devices for this User */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-(--text-color-secondary) px-0.5">
                                        <span>
                                            {tr("Connected & Saved Hardware Nodes")} ({totalNodes})
                                        </span>
                                        {u.isActiveOnline && (
                                            <span className="text-emerald-400 font-semibold">{tr("Live Mesh Sync")}</span>
                                        )}
                                    </div>

                                    {/* 1. Live Connected Hardware Sessions */}
                                    {u.sessions.map((session) => {
                                        const isThisDevice = session.session_id === mySessionId;
                                        const meshBadge = resolveMeshBadge(session);
                                        const DeviceIcon = getDeviceIcon(session.device_type, session.client_platform);

                                        return (
                                            <div
                                                key={session.session_id}
                                                className={`acc-device-row liquid-control ${isThisDevice ? 'acc-device-row-this' : ''}`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <DeviceIcon size={14} className="text-(--main-color) shrink-0" />
                                                    <span className="text-xs font-bold text-(--text-color) truncate">
                                                        {session.device_name}
                                                    </span>
                                                    {isThisDevice && (
                                                        <span className="text-[9px] font-black uppercase text-(--main-color) bg-(--main-color)/10 px-1.5 py-0.5 rounded border border-(--main-color)/20">
                                                            {tr("This Node")}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-mono text-(--text-color-secondary) hidden sm:inline">
                                                        {session.client_platform} • {session.browser || 'App'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                                    <span className="text-[10px] font-mono text-(--text-color-secondary)">
                                                        {session.ip_address || '127.0.0.1'}
                                                    </span>
                                                    {meshBadge && (
                                                        <span className={`acc-badge ${meshBadge.color}`} title={meshBadge.roleDesc}>
                                                            <Wifi size={9} />
                                                            {meshBadge.label}
                                                        </span>
                                                    )}
                                                    <span className="acc-badge acc-badge-view text-[9px]">
                                                        VIEW: {session.current_view?.toUpperCase() || 'ACTIVE'}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-emerald-400 font-semibold tabular-figures">
                                                        {formatTimeAgo(session.last_seen_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* 2. Saved / Paired IoT Devices (Pico/StackChan) */}
                                    {u.savedDevices.map((dev: any) => (
                                        <div
                                            key={dev.id || dev.name}
                                            className="acc-device-row liquid-control border-purple-500/20 bg-purple-500/5"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Bot size={14} className="text-purple-400 shrink-0" />
                                                <span className="text-xs font-bold text-purple-300 truncate">
                                                    {dev.name || 'Hardware IoT Node'}
                                                </span>
                                                <span className="text-[10px] font-mono text-(--text-color-secondary) hidden sm:inline">
                                                    {dev.preset_id || 'ESP32 / Pico'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[9px] font-mono text-(--text-color-secondary)">
                                                    {dev.mac || 'BLE/Mesh'}
                                                </span>
                                                <span className="acc-badge border-purple-500/30 bg-purple-500/10 text-purple-300 text-[9px]">
                                                    {dev.is_active ? 'Paired Active' : 'Registered Device'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* 3. Offline recent operative notice */}
                                    {!u.isActiveOnline && u.sessions.length === 0 && u.savedDevices.length === 0 && (
                                        <div className="acc-device-row liquid-control opacity-80">
                                            <div className="flex items-center gap-2">
                                                <Shield size={13} className="text-(--text-color-secondary) shrink-0" />
                                                <span className="text-xs text-(--text-color)">
                                                    {tr("Verified Account • Hardware Node Offline")}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono text-(--text-color-secondary)">
                                                    {u.lastSubmitAt ? `Last Sync: ${formatDate(u.lastSubmitAt)}` : tr("Registered")}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                EDGE HARDWARE FLEET
                ════════════════════════════════════════════════════════════════════ */}
            <EdgeControllersGrid onRefresh={handleRefreshAll} isRefreshing={presenceLoading} />

            {/* ════════════════════════════════════════════════════════════════════
                TIER 2: INACTIVE OPERATIVES (> 2 MONTHS INACTIVE)
                Rendered in a compact panel mode showing last activity summary
                ════════════════════════════════════════════════════════════════════ */}
            {tier2InactiveUsers.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) flex items-center gap-2">
                            <Clock size={13} className="text-amber-400" />
                            {tr("Inactive Operatives (> 2 Months)")} ({tier2InactiveUsers.length})
                        </h3>
                        <span className="text-[10px] font-mono text-(--text-color-secondary)">
                            {tr("Compact panel mode with last activity summary")}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {tier2InactiveUsers.map((u) => (
                            <div key={u.key} className="acc-user-compact-panel liquid-panel">
                                {/* Left: Operative info */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-(--slab-glass-hi) border border-(--border-color) flex items-center justify-center font-mono font-bold text-xs text-(--text-color) shrink-0">
                                        {u.initials}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-(--text-color) truncate">
                                                {u.name}
                                            </span>
                                            <span className={`acc-badge ${u.roleBadgeClass}`}>{u.role}</span>
                                            {!u.isActiveAccount && (
                                                <span className="acc-badge bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px]">
                                                    {tr("Suspended")}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-mono text-(--text-color-secondary) truncate">
                                            {u.email}
                                        </p>
                                    </div>
                                </div>

                                {/* Center: Activity summary */}
                                <div className="flex items-center gap-2 text-[10px] font-mono text-(--text-color-secondary) bg-(--slab-glass) px-2.5 py-1 rounded-lg border border-(--border-color)">
                                    <Clock size={11} className="text-amber-400 shrink-0" />
                                    <span className="tabular-figures">
                                        {tr("Inactive > 2mo")} • {tr("Last active")}: {formatDate(u.latestSeenAt)} ({formatTimeAgo(u.latestSeenAt)}) • {u.totalSubmits} {tr("logs")}
                                    </span>
                                </div>

                                {/* Right: Quick Action Buttons */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {canManageUsers && u.isRegistered && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEdit(u)}
                                            className="acc-action-btn text-[10px] py-1 px-2 min-h-[26px]"
                                            title={tr("Edit Designation & Role")}
                                        >
                                            <SquarePen size={11} />
                                            <span>{tr("Edit")}</span>
                                        </button>
                                    )}

                                    {canEditRoleOf(u) && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggleActive(u)}
                                            className={`acc-action-btn text-[10px] py-1 px-2 min-h-[26px] ${
                                                u.isActiveAccount
                                                    ? 'hover:border-rose-500/40'
                                                    : 'text-emerald-400 border-emerald-500/30'
                                            }`}
                                            title={u.isActiveAccount ? tr("Suspend Operative Account") : tr("Activate Operative Account")}
                                        >
                                            <Shield size={11} />
                                            <span>{u.isActiveAccount ? tr("Active") : tr("Inactive")}</span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => sendInvite(u)}
                                        className="acc-action-btn text-[10px] py-1 px-2 min-h-[26px]"
                                        title={tr("Send Invitation Email & Credentials")}
                                    >
                                        <Mail size={11} />
                                        <span>{tr("Invite")}</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════════
                TIER 3: REGISTERED OPERATIVES WITH NO LOGIN HISTORY
                Compacted bubbles / Name Badges and inline edit buttons
                ════════════════════════════════════════════════════════════════════ */}
            {tier3NoLogUsers.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-(--text-color-secondary) flex items-center gap-2">
                            <UserCheck size={13} className="text-(--main-color)" />
                            {tr("Registered Operatives • Awaiting Initial Login")} ({tier3NoLogUsers.length})
                        </h3>
                        <span className="text-[10px] font-mono text-(--text-color-secondary)">
                            {tr("Compacted Name Badges • Click Edit to designate role")}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {tier3NoLogUsers.map((u) => (
                            <div key={u.key} className="acc-user-bubble liquid-control">
                                <div className="w-5 h-5 rounded-full bg-(--slab-glass-hi) border border-(--border-color) flex items-center justify-center font-mono font-bold text-[9px] text-(--text-color) shrink-0">
                                    {u.initials}
                                </div>

                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-(--text-color) truncate max-w-[130px]">
                                        {u.name}
                                    </span>
                                    <span className={`acc-badge ${u.roleBadgeClass} text-[8.5px] py-0 px-1.5`}>
                                        {u.role}
                                    </span>
                                    <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded border border-amber-400/20">
                                        0 {tr("logins")}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 ml-1 border-l border-(--border-color) pl-1.5">
                                    {canManageUsers && u.isRegistered && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEdit(u)}
                                            className="p-1 rounded hover:bg-white/10 text-(--text-color-secondary) hover:text-(--text-color) transition-all cursor-pointer"
                                            title={tr("Edit Operative Designation & Role")}
                                        >
                                            <SquarePen size={11} />
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => sendInvite(u)}
                                        className="p-1 rounded hover:bg-white/10 text-(--text-color-secondary) hover:text-(--text-color) transition-all cursor-pointer"
                                        title={tr("Dispatch Invitation Email")}
                                    >
                                        <Mail size={11} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════════
                INLINE EDIT OPERATIVE MODAL / DIALOG
                ════════════════════════════════════════════════════════════════════ */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-(--app-bg) border border-(--border-color) rounded-2xl p-6 shadow-2xl space-y-5 text-(--text-color) ui-root">
                        <div className="flex items-center justify-between border-b border-(--border-color) pb-3">
                            <div className="flex items-center gap-2.5">
                                <SquarePen size={18} className="text-(--main-color)" />
                                <h3 className="text-sm font-bold uppercase tracking-wider">
                                    {tr("Edit Operative Identity")}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                className="p-1 rounded hover:bg-white/10 text-(--text-color-secondary) hover:text-(--text-color) cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-mono uppercase tracking-wider text-(--text-color-secondary) mb-1.5">
                                    {tr("Email Address (Immutable ID)")}
                                </label>
                                <input
                                    type="text"
                                    value={editingUser.email}
                                    disabled
                                    className="w-full px-3 py-2 rounded-xl bg-(--slab-glass-lo) border border-(--border-color) text-xs font-mono text-(--text-color-secondary) opacity-70 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-mono uppercase tracking-wider text-(--text-color) mb-1.5">
                                    {tr("Operative Name / Call-Sign")}
                                </label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="e.g. Ramses Jouhayerk"
                                    className="w-full px-3 py-2 rounded-xl bg-(--slab-glass) border border-(--border-color) text-xs font-medium text-(--text-color) focus:border-(--main-color) focus:outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-mono uppercase tracking-wider text-(--text-color) mb-1.5">
                                    {tr("Security & Access Role")}
                                </label>
                                <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    disabled={!canEditRoleOf(editingUser)}
                                    className="w-full px-3 py-2 rounded-xl bg-(--slab-glass) border border-(--border-color) text-xs font-mono text-(--text-color) focus:border-(--main-color) focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {/* A stored value that is not canonical (old lowercase save, typo) stays visible so it can be repaired */}
                                    {editingUser.rawRole && !ASSIGNABLE_ROLES.some((r) => r.value === editingUser.rawRole) && (
                                        <option value={editingUser.rawRole}>{`${editingUser.rawRole} (${tr("not a valid role")})`}</option>
                                    )}
                                    {ASSIGNABLE_ROLES.filter((r) => r.value !== 'Developer' || currentUser?.role === 'Developer' || editingUser.rawRole === 'Developer').map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                {isSelf(editingUser) && (
                                    <p className="mt-1.5 text-[10px] text-(--text-color-secondary)">{tr("You cannot change your own role or status.")}</p>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-xl bg-(--slab-glass-lo) border border-(--border-color)">
                                <div>
                                    <span className="text-xs font-bold block text-(--text-color)">
                                        {tr("Account Authorization Status")}
                                    </span>
                                    <span className="text-[10px] text-(--text-color-secondary)">
                                        {editIsActive ? tr("Account enabled for mesh access") : tr("Account access suspended")}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditIsActive(!editIsActive)}
                                    disabled={!canEditRoleOf(editingUser)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                        editIsActive
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                >
                                    {editIsActive ? tr("Active") : tr("Suspended")}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-(--border-color)">
                            <button
                                type="button"
                                onClick={() => sendInvite(editingUser)}
                                className="acc-action-btn text-xs py-2 px-3 text-(--text-color-secondary) hover:text-(--text-color)"
                            >
                                <Mail size={13} />
                                <span>{tr("Send Credentials")}</span>
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    className="acc-action-btn text-xs py-2 px-4"
                                >
                                    {tr("Cancel")}
                                </button>

                                <button
                                    type="button"
                                    disabled={isSavingUser}
                                    onClick={handleSaveUser}
                                    className="acc-action-btn acc-action-btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                                >
                                    {isSavingUser ? (
                                        <RefreshCw size={13} className="animate-spin" />
                                    ) : (
                                        <Check size={13} />
                                    )}
                                    <span>{tr("Save Changes")}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
