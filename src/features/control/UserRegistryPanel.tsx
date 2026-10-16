
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../onyxIsland/notify/toast';
import { UserRegistrySkeleton } from './UserRegistrySkeleton';
import { tr } from '../../lib/i18n';
import { 
    UserCog, UserKey, UserPen, UserStar, UserSearch, UserPlus, 
    Trash2, Mail, CheckCircle2, History, Info, SquarePen,
    Shield, Activity
} from 'lucide-react';

type UserRole = 'Developer' | 'Admin' | 'ClientBoss' | 'ClientAccounting' | 'ClientViewer' | 'Vendor';

interface AppUser {
    id: string;
    email: string;
    role: UserRole;
    display_name: string | null;
    notes: string | null;
    created_at: string;
    is_active: boolean;
    last_submit_at: string | null;
    total_submits: number;
}

const ROLE_COLORS: Record<string, string> = {
    Developer: 'text-purple-400 border-purple-500/30',
    Admin: 'text-blue-400 border-blue-500/30',
    Vendor: 'text-amber-400 border-amber-500/30',
    ClientBoss: 'text-green-400 border-green-500/30',
    ClientAccounting: 'text-emerald-400 border-emerald-500/30',
    ClientViewer: 'text-slate-400 border-slate-500/30',
    Client: 'text-slate-400 border-slate-500/30',
};

const ROLE_ICONS: Record<string, React.ComponentType<any>> = {
    Admin: UserCog,
    Developer: UserKey,
    ClientAccounting: UserPen,
    ClientBoss: UserStar,
    ClientViewer: UserSearch,
    Vendor: UserPlus,
    Client: UserSearch,
};

function formatDate(ts: string | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

export function UserRegistryPanel() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('Vendor');
    const [newName, setNewName] = useState('');
    const [newNotes, setNewNotes] = useState('');

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            setError(error.message);
        } else {
            setUsers(data as AppUser[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const { error } = await supabase.from('app_users').insert({
            email: newEmail.trim().toLowerCase(),
            role: newRole,
            display_name: newName.trim() || null,
            notes: newNotes.trim() || null,
        });
        if (error) {
            setError(error.message);
        } else {
            setNewEmail(''); setNewRole('Vendor'); setNewName(''); setNewNotes('');
            setShowAddForm(false);
            fetchUsers();
            toast.success(tr("Registration Finalized"));
        }
        setSubmitting(false);
    };

    const handleUpdateName = async (id: string) => {
        const user = users.find(u => u.id === id);
        if (!user) return;
        
        setUsers(prev => prev.map(u => u.id === id ? { ...u, display_name: editName.trim() || null } : u));
        const { error } = await supabase.from('app_users').update({ display_name: editName.trim() || null }).eq('id', id);
        if (error) {
            setUsers(prev => prev.map(u => u.id === id ? { ...u, display_name: user.display_name } : u));
            toast.error(tr("Failed to update name"));
        } else {
            toast.success(tr("Identity Updated"));
            setEditingUserId(null);
        }
    };

    const handleUpdateRole = async (id: string, role: UserRole) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
        const { error } = await supabase.from('app_users').update({ role }).eq('id', id);
        if (error) {
            toast.error(`Update Failed: ${error.message}`);
            fetchUsers(); 
        } else {
            toast.success(tr("Hierarchy Updated"));
        }
    };

    const handleToggleActive = async (user: AppUser) => {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
        const { error } = await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id);
        if (error) {
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: user.is_active } : u));
            toast.error(tr("Failed to update status"));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(tr("Purge this identity from the central registry? This action is irreversible."))) return;
        const snapshot = users.find(u => u.id === id);
        setUsers(prev => prev.filter(u => u.id !== id));
        const { error } = await supabase.from('app_users').delete().eq('id', id);
        if (error) {
            if (snapshot) setUsers(prev => [snapshot, ...prev.filter(u => u.id !== id)]);
            toast.error(tr("Failed to purge user"));
        } else {
            toast.success(tr("Identity Purged"));
        }
    };

    const sendInvite = (user: AppUser) => {
        const appUrl = 'https://jouhayerk-cloud.github.io/onyx.mx/';
        const name = user.display_name || user.email.split('@')[0];
        const subject = encodeURIComponent('Invitation to Onyx.mx Enterprise');
        const body = encodeURIComponent(
            `Hello ${name},\n\nAccess has been provisioned for the Onyx.mx central management platform.\n\nRole: ${user.role}\nEmail: ${user.email}\n\nVisit: ${appUrl}\n\nFinalize enrollment via the partner access request portal.`
        );
        window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, '_blank');
    };

    const [filterOnlyActiveWithLog, setFilterOnlyActiveWithLog] = useState<boolean>(true);

    const displayUsers = useMemo(() => {
        if (!filterOnlyActiveWithLog) return users;
        return users.filter(u => u.is_active !== false && (Boolean(u.last_submit_at) || Number(u.total_submits) > 0));
    }, [users, filterOnlyActiveWithLog]);

    const hiddenNoLogCount = useMemo(() => {
        return users.length - displayUsers.length;
    }, [users, displayUsers]);

    return (
        <div className="flex flex-col gap-8">
            {/* Minimal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/8">
                <div className="flex items-center gap-4 flex-wrap">
                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white flex items-center gap-3">
                        {tr("Identity Registry")}
                        <span className="text-[10px] font-mono text-cyan-400 bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                            {displayUsers.length}
                        </span>
                    </h2>

                    <button
                        type="button"
                        onClick={() => setFilterOnlyActiveWithLog(!filterOnlyActiveWithLog)}
                        className={`acc-badge cursor-pointer transition-all ${
                            filterOnlyActiveWithLog
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/40'
                                : 'bg-white/5 text-white/60 hover:text-white border-white/10'
                        }`}
                        title="Toggle hiding accounts with no login history"
                    >
                        <span>{filterOnlyActiveWithLog ? tr("Filtered: Active with Login Record") : tr("Show All Accounts")}</span>
                    </button>

                    {hiddenNoLogCount > 0 && filterOnlyActiveWithLog && (
                        <span className="text-[10px] font-mono text-white/40">
                            ({hiddenNoLogCount} {tr("accounts with no login history hidden")})
                        </span>
                    )}

                    <button 
                        onClick={() => fetchUsers()} 
                        className={`p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-cyan-400 transition-all ${loading ? 'animate-spin text-cyan-400' : ''}`}
                        title={tr("SYNC REGISTRY")}
                    >
                        <History size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/12 text-white/70 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all self-start sm:self-auto"
                >
                    <UserPlus size={13} className="text-cyan-400" />
                    <span>{tr("Enrollment")}</span>
                </button>
            </div>

            {/* Add User Form - Liquid Onyx HUD Style */}
            {showAddForm && (
                <form onSubmit={handleAdd} className="animate-in fade-in slide-in-from-top-4 duration-500 max-w-2xl p-6 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-px grow bg-gradient-to-r from-cyan-500 to-transparent" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400">{tr("Identity Provisioning")}</h3>
                        <div className="h-px w-16 bg-cyan-500/30" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] uppercase font-black tracking-[0.2em] text-white/50">{tr("Protocol Address")}</label>
                            <input 
                                type="email" required value={newEmail} 
                                onChange={e => setNewEmail(e.target.value)} 
                                placeholder={tr("USER@DOMAIN.COM")} 
                                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-white/20 uppercase font-mono" 
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] uppercase font-black tracking-[0.2em] text-white/50">{tr("Access Tier")}</label>
                            <select 
                                value={newRole} 
                                onChange={e => setNewRole(e.target.value as UserRole)} 
                                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-all cursor-pointer uppercase font-mono"
                            >
                                {(['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor'] as UserRole[]).map(r => (
                                    <option key={r} value={r} className="bg-neutral-900 text-white font-mono">{r.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] uppercase font-black tracking-[0.2em] text-white/50">{tr("Display handle")}</label>
                            <input 
                                type="text" value={newName} 
                                onChange={e => setNewName(e.target.value)} 
                                placeholder={tr("OPERATIVE DESIGNATION")} 
                                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-white/20 uppercase font-mono" 
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] uppercase font-black tracking-[0.2em] text-white/50">{tr("Internal observations")}</label>
                            <input 
                                type="text" value={newNotes} 
                                onChange={e => setNewNotes(e.target.value)} 
                                placeholder={tr("OPTIONAL METADATA...")} 
                                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-white/20 uppercase font-mono" 
                            />
                        </div>
                    </div>
                    <div className="flex gap-4 justify-end mt-8">
                        <button type="button" onClick={() => setShowAddForm(false)} className="text-[9px] font-black tracking-[0.2em] text-white/50 hover:text-white transition-all uppercase px-4 py-2">{tr("Abort")}</button>
                        <button 
                            type="submit" disabled={submitting} 
                            className="bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-2 rounded-full text-[10px] font-black tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,174,239,0.3)] uppercase"
                        >
                            {submitting ? tr("Encrypting…") : tr("Finalize Registry")}
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="text-red-400 text-[10px] font-black uppercase tracking-widest bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3 animate-pulse">{error}</p>}

            {/* Liquid Onyx Translucent Grid */}
            {loading ? (
                <UserRegistrySkeleton />
            ) : displayUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-40">
                    <UserSearch size={40} strokeWidth={1} className="text-white/40" />
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">{tr("No Matching Active Operatives")}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayUsers.map(user => {
                        const RoleIcon = ROLE_ICONS[user.role] || UserSearch;
                        const lastActive = user.last_submit_at ? new Date(user.last_submit_at).getTime() : 0;
                        const isOnline = Date.now() - lastActive < 10 * 60 * 1000;
                        
                        return (
                            <div key={user.id} className={`group relative p-4 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/8 hover:border-white/16 hover:bg-white/[0.05] transition-all flex flex-col justify-between gap-4 shadow-xl ${!user.is_active ? 'opacity-30 grayscale' : ''}`}>
                                {/* Main Content */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative shrink-0">
                                            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-cyan-400 shadow-inner">
                                                <RoleIcon size={20} strokeWidth={1.5} />
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-black flex items-center justify-center ${isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/20'}`}>
                                                {isOnline && <div className="w-1 h-1 rounded-full bg-white animate-ping" />}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col min-w-0 grow">
                                            {editingUserId === user.id ? (
                                                <div className="flex items-center gap-1.5 border-b border-cyan-400/50 pb-1">
                                                    <input 
                                                        type="text" value={editName} 
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="bg-transparent border-none p-0 text-xs font-bold text-white focus:ring-0 w-full uppercase"
                                                        placeholder={tr("NEW DESIGNATION")}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleUpdateName(user.id)} className="text-cyan-400 hover:scale-110 transition-all">
                                                        <CheckCircle2 size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h4 className="text-xs font-bold text-white truncate uppercase">
                                                    {user.display_name || tr("UNIDENTIFIED UNIT")}
                                                </h4>
                                            )}
                                            <p className="text-[10px] font-mono text-white/50 truncate">{user.email}</p>
                                        </div>
                                    </div>

                                    {/* Data Matrix */}
                                    <div className="space-y-2 pt-2 border-t border-white/5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">{tr("Hierarchy")}</span>
                                            <select 
                                                value={user.role} 
                                                onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)}
                                                className="bg-transparent border-none p-0 text-[10px] font-bold uppercase tracking-wider text-cyan-400 hover:text-white cursor-pointer transition-all"
                                            >
                                                {(['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor'] as UserRole[]).map(r => (
                                                    <option key={r} value={r} className="bg-neutral-900 text-white font-mono">{r.toUpperCase()}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div>
                                                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/40 block">{tr("Last Sync")}</span>
                                                <span className="text-[10px] font-mono text-white/60">
                                                    {user.last_submit_at ? new Date(user.last_submit_at).toLocaleDateString(tr("en-US"), { month: 'short', day: 'numeric', year: '2-digit' }) : tr("NONE")}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/40 block">{tr("Log History")}</span>
                                                <span className="text-[10px] font-mono text-cyan-400 font-bold flex items-center gap-1 justify-end">
                                                    <Activity size={9} />
                                                    {user.total_submits || 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Floating Action Bar at Card Bottom */}
                                <div className="pt-2 border-t border-white/5 flex items-center justify-between opacity-50 group-hover:opacity-100 transition-all">
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => { setEditingUserId(editingUserId === user.id ? null : user.id); setEditName(user.display_name || ''); }}
                                            className="text-white/40 hover:text-cyan-400 transition-all"
                                            title={tr("Modify Designation")}
                                        >
                                            <SquarePen size={13} />
                                        </button>
                                        <button 
                                            onClick={() => handleToggleActive(user)}
                                            className={`transition-all ${user.is_active ? 'text-emerald-400/60 hover:text-red-400' : 'text-red-400/60 hover:text-emerald-400'}`}
                                            title={user.is_active ? 'Decommission' : 'Restore'}
                                        >
                                            <Shield size={13} />
                                        </button>
                                        <button 
                                            onClick={() => sendInvite(user)}
                                            className="text-white/40 hover:text-purple-300 transition-all"
                                            title={tr("Dispatch Creds")}
                                        >
                                            <Mail size={13} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => handleDelete(user.id)}
                                        className="text-red-400/40 hover:text-red-400 transition-all"
                                        title={tr("Purge")}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
