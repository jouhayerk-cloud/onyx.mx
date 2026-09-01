import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';

interface StoreUser {
    id: string;
    email: string;
    role: string;
    display_name: string | null;
    is_active: boolean;
    store_enabled?: boolean;
    store_logo?: string;
}

export function StoreSettingsPanel() {
    const [users, setUsers] = useState<StoreUser[]>([]);
    const [loading, setLoading] = useState(true);

    async function fetchUsers() {
        setLoading(true);
        const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && data) {
            setUsers(data as StoreUser[]);
        }
        setLoading(false);
    }

    useEffect(() => {
        fetchUsers();
    }, []);

    const toggleStoreAccess = async (user: StoreUser) => {
        const newVal = !user.store_enabled;
        await supabase.from('app_users').update({ store_enabled: newVal }).eq('id', user.id);
        fetchUsers();
    };

    const updateStoreLogo = async (user: StoreUser) => {
        const url = prompt('Enter Logo URL for user ' + (user.display_name || user.email), user.store_logo || '');
        if (url !== null) {
            await supabase.from('app_users').update({ store_logo: url }).eq('id', user.id);
            fetchUsers();
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-color-secondary) font-bold uppercase tracking-widest">
                    {tr("ACTIVATE STORE / CATALOG")}
                </span>
                <button
                    onClick={fetchUsers}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-(--text-color-secondary) hover:text-white"
                    title={tr("SYNC")}
                >
                    <svg className="w-4 h-4"><use href="#refresh" /></svg>
                </button>
            </div>
            {/* The catalog settings for each user */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <p className="text-xs text-white/50 mb-4">{tr("Select users to activate their store catalog and add a custom logo.")}</p>
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <span className="text-sm font-bold text-white/50 tracking-widest uppercase">{tr("Loading users...")}</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {users.map(u => (
                            <div key={u.id} className="flex items-center justify-between p-3 border border-white/10 rounded-xl bg-white/2 transition-colors hover:bg-white/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center p-1 overflow-hidden">
                                        {u.store_logo ? (
                                            <img src={u.store_logo} alt={tr("Logo")} className="w-full h-full object-contain" />
                                        ) : (
                                            <svg className="w-5 h-5 opacity-20"><use href="#image" /></svg>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-white font-bold">{u.display_name || u.email}</p>
                                        <div className="flex gap-2 items-center text-xs mt-0.5">
                                            <span className="text-white/40 uppercase tracking-wider">{u.role}</span>
                                            {u.store_enabled && (
                                                <span className="text-[9px] font-bold text-(--main-color) border border-(--main-color)/30 bg-(--main-color)/10 px-1.5 py-0.5 rounded uppercase tracking-widest">STORE ON</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateStoreLogo(u)}
                                        className="button py-1.5! px-3! bg-transparent! border! border-white/20 hover:bg-white/5! text-[10px] font-black tracking-widest flex items-center gap-1.5"
                                    >
                                        <svg className="w-3.5 h-3.5"><use href="#image" /></svg>
                                        {tr("LOGO")}
                                    </button>
                                    <button
                                        onClick={() => toggleStoreAccess(u)}
                                        className={`button py-1.5! px-3! bg-transparent! border! text-[10px] font-black tracking-widest flex items-center gap-1.5 ${u.store_enabled ? 'border-green-500/50 text-green-400 hover:bg-green-500/10!' : 'border-white/20 text-white/50 hover:border-white/40 hover:text-white hover:bg-white/5!'}`}
                                    >
                                        {u.store_enabled ? 'DEACTIVATE' : 'ACTIVATE'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
