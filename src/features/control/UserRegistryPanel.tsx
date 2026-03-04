
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

type UserRole = 'Developer' | 'Admin' | 'Client' | 'Vendor';

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

const ROLE_COLORS: Record<UserRole, string> = {
    Developer: 'bg-transparent text-purple-400 border-purple-500/30',
    Admin: 'bg-transparent text-blue-400 border-blue-500/30',
    Vendor: 'bg-transparent text-amber-400 border-amber-500/30',
    Client: 'bg-transparent text-green-400 border-green-500/30',
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
    const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

    const toggleUser = (id: string) => setExpandedUsers(prev => ({ ...prev, [id]: !prev[id] }));
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
        }
        setSubmitting(false);
    };

    const handleToggleActive = async (user: AppUser) => {
        await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id);
        fetchUsers();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this user from app access? This cannot be undone.')) return;
        await supabase.from('app_users').delete().eq('id', id);
        fetchUsers();
    };

    const sendInvite = (user: AppUser) => {
        const appUrl = 'https://jouhayerk-cloud.github.io/onyx.mx/';
        const name = user.display_name || user.email.split('@')[0];
        const subject = encodeURIComponent('You have been invited to Onyx.mx');
        const body = encodeURIComponent(
            `Hello ${name},

You have been granted access to Onyx.mx — an enterprise inventory and logistics platform for cross-border commerce between Mexico and the United States.

Your access details:
  Role: ${user.role}
  Email: ${user.email}

To get started:
1. Visit ${appUrl}
2. Click "Need partner access? Request Registration"
3. Create your account using this email address: ${user.email}
4. Once registered, you will have immediate access.

If you have any questions, contact your system administrator.

Onyx.mx — Enterprise Inventory Management
${appUrl}`
        );
        window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, '_blank');
    };


    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-(--text-color-secondary) font-bold uppercase tracking-widest">
                        USERS ({users.length})
                    </span>
                    <button
                        onClick={fetchUsers}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-(--text-color-secondary) hover:text-white"
                        title="SYNC"
                    >
                        <svg className="w-4 h-4"><use href="#refresh" /></svg>
                    </button>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="button py-2! px-4! text-xs font-black tracking-widest flex items-center gap-2"
                >
                    <svg className="w-4 h-4"><use href="#plus" /></svg>
                    REG
                </button>
            </div>

            {/* Add User Form */}
            {showAddForm && (
                <form onSubmit={handleAdd} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 animate-in slide-in-from-top-4 duration-200">
                    <h3 className="text-xs font-black uppercase tracking-widest text-(--main-color)">NEW</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Mail *</label>
                            <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@company.com" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-(--main-color)" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Role *</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="bg-(--glass-bg) border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-(--main-color)">
                                {(['Developer', 'Admin', 'Vendor', 'Client'] as UserRole[]).map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Name</label>
                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full Name" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-(--main-color)" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Notes</label>
                            <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notes" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-(--main-color)" />
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button type="button" onClick={() => setShowAddForm(false)} className="button bg-transparent! border border-white/20 py-2! px-4! text-xs font-black tracking-widest">CANCEL</button>
                        <button type="submit" disabled={submitting} className="button py-2! px-6! text-xs font-black tracking-widest">
                            {submitting ? 'ADD…' : 'ADD'}
                        </button>
                    </div>
                </form>
            )}

            {/* Error */}
            {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

            {/* Users Table */}
            {loading ? (
                <div className="flex items-center justify-center h-40 text-(--text-color-secondary)">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-(--main-color) border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm uppercase font-black tracking-widest">Loading…</span>
                    </div>
                </div>
            ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-(--text-color-secondary)">
                    <svg className="w-10 h-10 opacity-30"><use href="#users" /></svg>
                    <p className="text-sm font-black uppercase tracking-widest opacity-30">No Users</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {users.map(user => {
                        const isExpanded = !!expandedUsers[user.id];
                        return (
                            <div key={user.id} className={`bg-white/3 border transition-all overflow-hidden ${user.is_active ? 'border-b-white/5 border-transparent hover:bg-white/5' : 'border-transparent opacity-60'} first:rounded-t-xl last:rounded-b-xl border-x-transparent`}>
                                <div className="flex items-center justify-between gap-4 py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleUser(user.id)}>
                                    {/* Left: identity */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-(--glass-bg) border border-white/10 flex items-center justify-center text-base font-bold text-white shrink-0">
                                            {(user.display_name || user.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-base text-white truncate">{user.display_name || user.email}</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${ROLE_COLORS[user.role]}`}>{user.role}</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${user.is_active ? 'bg-transparent text-green-400 border-green-500/30' : 'bg-transparent text-red-400 border-red-500/30'}`}>
                                                    {user.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${user.last_submit_at ? 'bg-transparent text-blue-400 border-blue-500/30' : 'bg-transparent text-amber-400 border-amber-500/30'}`}>
                                                    {user.last_submit_at ? 'REG' : 'PEND'}
                                                </span>
                                            </div>
                                            {!user.display_name ? null : <p className="text-xs text-(--text-color-secondary) truncate mt-[2px]">{user.email}</p>}
                                        </div>
                                    </div>

                                    {/* Right: Expand Icon */}
                                    <button className="p-1 rounded-full text-white/30 hover:text-white/80 transition-all">
                                        <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                </div>

                                {/* Collapsible Content */}
                                {isExpanded && (
                                    <div className="px-3 pb-4 pt-1 border-t border-white/5 bg-white/2">
                                        {user.notes && <p className="text-xs text-white/40 mb-3 ml-[48px] italic">"{user.notes}"</p>}

                                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-end">
                                            {/* Activity Info */}
                                            <div className="flex gap-6 ml-[48px]">
                                                <div>
                                                    <p className="text-[9px] uppercase font-black tracking-widest text-white/30">Submits</p>
                                                    <p className="text-sm font-mono font-bold text-white mt-1">{user.total_submits?.toLocaleString() || '0'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] uppercase font-black tracking-widest text-white/30">Active</p>
                                                    <p className="text-xs text-(--text-color-secondary) mt-1">{formatDate(user.last_submit_at)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] uppercase font-black tracking-widest text-white/30">Date</p>
                                                    <p className="text-xs text-(--text-color-secondary) mt-1">{formatDate(user.created_at)}</p>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); sendInvite(user); }}
                                                    className="text-[10px] px-3 py-1.5 rounded-lg border border-(--main-color)/40 text-(--main-color) hover:bg-(--main-color)/10 transition-all font-black tracking-widest flex items-center gap-1.5"
                                                    title={`INVITE ${user.email}`}
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                    </svg>
                                                    INV
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleToggleActive(user); }} className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all font-black tracking-widest ${user.is_active ? 'border-white/20 hover:border-red-400/50 hover:text-red-300 text-white/40' : 'border-green-400/40 text-green-400 hover:bg-green-500/10'}`}>
                                                    {user.is_active ? 'OFF' : 'ON'}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }} className="text-[10px] px-3 py-1.5 rounded-lg border border-white/10 text-white/20 hover:border-red-500/40 hover:text-red-400 transition-all font-black tracking-widest">
                                                    DEL
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
