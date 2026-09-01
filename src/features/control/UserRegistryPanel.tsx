
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
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

    return (
        <div className="flex flex-col gap-12">
            {/* Minimal Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <h2 className="text-[14px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-4">
                        {tr("Registry")}
                        <span className="text-[10px] font-mono text-(--main-color) bg-neutral-900 px-3 py-1 rounded-full border border-(--main-color)/30 tracking-normal leading-none">{users.length}</span>
                    </h2>
                    <button 
                        onClick={() => fetchUsers()} 
                        className={`p-2 rounded-full hover:bg-white/10 text-neutral-500 hover:text-(--main-color) transition-all ${loading ? 'animate-spin text-(--main-color)' : ''}`}
                        title={tr("SYNC REGISTRY")}
                    >
                        <History size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-3 group"
                >
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:border-(--main-color)/40 group-hover:bg-(--main-color)/5 transition-all duration-500">
                        <UserPlus size={14} className="text-neutral-500 group-hover:text-(--main-color) transition-all transform group-hover:rotate-12" />
                    </div>
                    <span className="text-[9px] font-black tracking-[0.3em] text-neutral-500 group-hover:text-white transition-all uppercase">{tr("Enrollment")}</span>
                </button>
            </div>

            {/* Add User Form - HUD Style */}
            {showAddForm && (
                <form onSubmit={handleAdd} className="animate-in fade-in slide-in-from-top-4 duration-700 max-w-2xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="h-px grow bg-gradient-to-r from-(--main-color) to-transparent" />
                        <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-(--main-color)">{tr("Identity Provisioning")}</h3>
                        <div className="h-px w-16 bg-(--main-color)/30" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
                        <div className="flex flex-col gap-2">
                            <label className="text-[8px] uppercase font-black tracking-[0.25em] text-neutral-500">{tr("Protocol Address")}</label>
                            <input 
                                type="email" required value={newEmail} 
                                onChange={e => setNewEmail(e.target.value)} 
                                placeholder={tr("USER@DOMAIN.COM")} 
                                className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/50 transition-all placeholder:text-white/5 uppercase tracking-tight" 
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[8px] uppercase font-black tracking-[0.25em] text-neutral-500">{tr("Access Tier")}</label>
                            <select 
                                value={newRole} 
                                onChange={e => setNewRole(e.target.value as UserRole)} 
                                className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/50 transition-all cursor-pointer uppercase tracking-tight"
                            >
                                {(['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor'] as UserRole[]).map(r => (
                                    <option key={r} value={r} className="bg-neutral-900 border-none">{r.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[8px] uppercase font-black tracking-[0.25em] text-neutral-500">{tr("Display handle")}</label>
                            <input 
                                type="text" value={newName} 
                                onChange={e => setNewName(e.target.value)} 
                                placeholder={tr("OPERATIVE DESIGNATION")} 
                                className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/50 transition-all placeholder:text-white/5 uppercase tracking-tight" 
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[8px] uppercase font-black tracking-[0.25em] text-neutral-500">{tr("Internal observations")}</label>
                            <input 
                                type="text" value={newNotes} 
                                onChange={e => setNewNotes(e.target.value)} 
                                placeholder={tr("OPTIONAL METADATA...")} 
                                className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/50 transition-all placeholder:text-white/5 uppercase tracking-tight" 
                            />
                        </div>
                    </div>
                    <div className="flex gap-8 justify-end mt-12">
                        <button type="button" onClick={() => setShowAddForm(false)} className="text-[9px] font-black tracking-[0.3em] text-neutral-500 hover:text-white transition-all uppercase">{tr("Abort")}</button>
                        <button 
                            type="submit" disabled={submitting} 
                            className="bg-(--main-color) text-black px-10 py-2.5 rounded-full text-[10px] font-black tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(var(--main-color-rgb),0.2)] uppercase"
                        >
                            {submitting ? 'Encrypting…' : 'Finalize Registry'}
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="text-red-400 text-[10px] font-black uppercase tracking-widest bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3 animate-pulse">{error}</p>}

            {/* Frameless Content Grid */}
            {loading ? (
                <UserRegistrySkeleton />
            ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-10">
                    <UserSearch size={48} strokeWidth={1} />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em]">{tr("Empty Registry")}</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-12 gap-y-16">
                    {users.map(user => {
                        const RoleIcon = ROLE_ICONS[user.role] || UserSearch;
                        const lastActive = user.last_submit_at ? new Date(user.last_submit_at).getTime() : 0;
                        const isOnline = Date.now() - lastActive < 10 * 60 * 1000;
                        
                        return (
                            <div key={user.id} className={`group relative flex flex-col gap-4 transition-all duration-700 ${!user.is_active ? 'opacity-20 grayscale' : ''}`}>
                                {/* HUD Actions: Free Floating at Bottom */}
                                <div className="mt-auto pt-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-700 translate-y-2 group-hover:translate-y-0">
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => { setEditingUserId(editingUserId === user.id ? null : user.id); setEditName(user.display_name || ''); }}
                                            className="text-neutral-500 hover:text-(--main-color) transition-all"
                                            title={tr("Modify Designation")}
                                        >
                                            <SquarePen size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleToggleActive(user)}
                                            className={`transition-all ${user.is_active ? 'text-green-500/50 hover:text-red-500' : 'text-red-500/50 hover:text-green-500'}`}
                                            title={user.is_active ? 'Decommission' : 'Restore'}
                                        >
                                            <Shield size={14} />
                                        </button>
                                        <button 
                                            onClick={() => sendInvite(user)}
                                            className="text-neutral-500 hover:text-blue-400 transition-all"
                                            title={tr("Dispatch Creds")}
                                        >
                                            <Mail size={14} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => handleDelete(user.id)}
                                        className="text-red-500/40 hover:text-red-500 transition-all"
                                        title={tr("Purge")}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                {/* Main HUD Content */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/5 group-hover:border-(--main-color)/20 transition-all duration-1000 shadow-2xl ${ROLE_COLORS[user.role] || ROLE_COLORS.ClientViewer}`}>
                                                <RoleIcon size={28} strokeWidth={1} />
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-black flex items-center justify-center ${isOnline ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-white/10'}`}>
                                                {isOnline && <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col min-w-0 grow pt-1">
                                            {editingUserId === user.id ? (
                                                <div className="flex items-center gap-2 border-b border-(--main-color)/50 pb-1 animate-in zoom-in-95 duration-300">
                                                    <input 
                                                        type="text" value={editName} 
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="bg-transparent border-none p-0 text-[11px] font-black text-white focus:ring-0 w-full uppercase tracking-tight"
                                                        placeholder={tr("NEW DESIGNATION")}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleUpdateName(user.id)} className="text-(--main-color) hover:scale-125 transition-all">
                                                        <CheckCircle2 size={16} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h4 className="text-[12px] font-black text-white truncate tracking-tight uppercase leading-none mb-1.5">
                                                    {user.display_name || 'UNIDENTIFIED UNIT'}
                                                </h4>
                                            )}
                                            <p className="text-[9px] font-mono text-neutral-500 truncate tracking-widest uppercase">{user.email}</p>
                                        </div>
                                    </div>

                                    {/* HUD Data Matrix */}
                                    <div className="space-y-4 pt-1">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-neutral-600">{tr("Hierarchy Control")}</span>
                                            <select 
                                                value={user.role} 
                                                onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)}
                                                className="bg-transparent border-none p-0 text-[10px] font-black uppercase tracking-[0.15em] text-(--main-color) hover:text-white focus:ring-0 cursor-pointer transition-all appearance-none"
                                            >
                                                {(['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor'] as UserRole[]).map(r => (
                                                    <option key={r} value={r} className="bg-neutral-900 text-white font-black">{r.toUpperCase()}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[7px] font-black uppercase tracking-[0.3em] text-neutral-600">{tr("Last Sync")}</span>
                                                <span className="text-[9px] font-black text-neutral-500 uppercase tracking-tighter">
                                                    {user.last_submit_at ? new Date(user.last_submit_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : 'NONE'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1 items-end text-right">
                                                <span className="text-[7px] font-black uppercase tracking-[0.3em] text-neutral-600">{tr("Log History")}</span>
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <Activity size={10} className="text-neutral-600" />
                                                    <span className="text-[9px] font-mono text-neutral-500 font-bold">{user.total_submits || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
