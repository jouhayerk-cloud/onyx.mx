
import React, { useState, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { uploadItemDataAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { Database, RefreshCw, AlertTriangle, Activity, PieChart, Users, ChevronRight, History } from 'lucide-react';
import { tr } from '../../lib/i18n';

interface InventoryStats {
    total: number;
    byStatus: Record<string, number>;
    byVendor: Record<string, number>;
    byCategory: Record<string, number>;
    recentlyAdded: { item_id: string; name: string; created_at: string }[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <div className="group flex flex-col gap-1 transition-all">
            <p className="text-[10px] uppercase font-black tracking-[0.3em] text-white/10 group-hover:text-white/30 transition-all">{label}</p>
            <div className="flex items-baseline gap-3">
                <p className={`text-4xl font-black tabular-nums tracking-tighter ${color || 'text-white'}`}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </p>
                {sub && <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{sub}</p>}
            </div>
            <div className="h-px w-8 bg-white/5 group-hover:w-full group-hover:bg-(--main-color)/20 transition-all duration-700 mt-1" />
        </div>
    );
}

function BreakdownBar({ data, title, icon: Icon }: { data: Record<string, number>; title: string; icon: any }) {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length === 0) return null;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <Icon size={12} className="text-(--main-color)/40" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">{title}</p>
            </div>
            <div className="flex flex-col gap-4">
                {sorted.map(([key, count]) => {
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                        <div key={key} className="group relative flex flex-col gap-1.5 transition-all">
                            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tight">
                                <span className={`${key ? 'text-white/60' : 'text-white/20'} group-hover:text-white transition-all`}>{key || 'UNDEFINED'}</span>
                                <span className="text-white/20 group-hover:text-(--main-color) font-mono transition-all">{count}</span>
                            </div>
                            <div className="w-full bg-white/2 h-[2px] relative overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-(--main-color)/40 group-hover:bg-(--main-color) transition-all duration-1000"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function DatabaseStatsPanel() {
    const [stats, setStats] = useState<InventoryStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const user = useAtomValue(userAtom);
    const isDev = user?.role === 'Developer';

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { data, error } = await supabase
                .from('inventory')
                .select('id, item_id, status, shape');

            if (error) throw error;

            const rows = (data || []) as { id: string; item_id: string; status: string; shape: string }[];

            const byStatus: Record<string, number> = {};
            const byVendor: Record<string, number> = {};
            const byCategory: Record<string, number> = {};

            for (const row of rows) {
                const status = row.status || 'Unknown';
                const vendor = row.item_id ? String(row.item_id).split('-')[0] : 'Unknown';
                const category = row.shape || 'Uncategorized';

                byStatus[status] = (byStatus[status] || 0) + 1;
                byVendor[vendor] = (byVendor[vendor] || 0) + 1;
                byCategory[category] = (byCategory[category] || 0) + 1;
            }

            setStats({
                total: rows.length,
                byStatus,
                byVendor,
                byCategory,
                recentlyAdded: [],
            });
            setLastRefreshed(new Date());
        } catch (err: any) {
            setError(err.message || 'Failed to fetch inventory stats.');
        }
        setLoading(false);
    }, []);

    const [delRequests, setDelRequests] = useState<any[]>([]);
    const [isActing, setIsActing] = useState<string | null>(null);

    const fetchDelRequests = useCallback(async () => {
        const { data: invData, error: invError } = await supabase
            .from('inventory')
            .select('*')
            .eq('is_hidden', true);
        
        const { data: prodData, error: prodError } = await supabase
            .from('production')
            .select('*')
            .eq('is_hidden', true);

        const all = [...(invData || []), ...(prodData || [])].map(item => ({
            ...item,
            source: invData?.find(i => i.id === item.id) ? 'inventory' : 'production'
        }));
        
        if (!invError && !prodError) setDelRequests(all);
    }, []);

    const handleAuthorize = async (id: string, source: string) => {
        if (!confirm(tr("Expunge this record from core storage permanently?"))) return;
        setIsActing(id);
        try {
            const { error } = await supabase.from(source).delete().eq('id', id);
            if (error) throw error;
            fetchDelRequests();
            fetchStats();
        } catch (err: any) { alert(err.message); }
        setTimeout(() => setIsActing(null), 500);
    };

    const handleRestore = async (id: string, source: string) => {
        setIsActing(id);
        try {
            const { error } = await supabase.from(source).update({ is_hidden: false, hidden_reason: null }).eq('id', id);
            if (error) throw error;
            fetchDelRequests();
            fetchStats();
        } catch (err: any) { alert(err.message); }
        setIsActing(null);
    };

    const handleSetBook = () => {
        const newV = prompt("Sync Override - WorkBook ID:", itemData.workbook || 'v326');
        if (newV) {
            setItemData(prev => ({ ...prev, workbook: newV }));
        }
    };

    useEffect(() => { fetchStats(); fetchDelRequests(); }, [fetchStats, fetchDelRequests]);

    if (loading) return (
        <div className="flex items-center justify-center h-64 opacity-20 scale-90">
            <div className="flex flex-col items-center gap-6">
                <Database size={40} className="animate-pulse text-(--main-color)" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">{tr("Querying Nexus...")}</span>
            </div>
        </div>
    );

    if (error) return (
        <div className="p-10 border border-red-500/20 bg-red-500/5 rounded-2xl">
            <p className="text-red-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2 flex items-center gap-3">
                <AlertTriangle size={14} /> {tr("Critical Data Exception")}
            </p>
            <p className="text-white/40 text-xs font-mono">{error}</p>
        </div>
    );

    if (!stats) return null;

    const activeCount = stats.byStatus['YES'] || stats.byStatus['Active'] || stats.byStatus['active'] || stats.byStatus['Catalog'] || 0;
    const vendorCount = Object.keys(stats.byVendor).length;

    return (
        <div className="flex flex-col gap-20">
            {/* Minimalist Sub-Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-1">{tr("Nexus Metadata")}</span>
                        <div className="flex items-center gap-3">
                            <History size={12} className="text-white/20" />
                            <span className="text-[11px] font-black text-white uppercase tracking-tighter">
                                {tr("Last Sync:")} {lastRefreshed?.toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                    {isDev && (
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20 mb-1">{tr("Workbook Index")}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black text-(--main-color) uppercase tracking-tighter">{itemData.workbook || 'V000'}</span>
                                <button onClick={handleSetBook} className="text-white/10 hover:text-white transition-all"><ChevronRight size={12} /></button>
                            </div>
                        </div>
                    )}
                </div>
                <button 
                    onClick={() => { fetchStats(); fetchDelRequests(); }}
                    className="flex items-center gap-3 group"
                >
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 group-hover:text-white transition-all">{tr("Re-Sync Nexus")}</span>
                    <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center group-hover:border-(--main-color)/40 transition-all duration-700">
                        <RefreshCw size={12} className={`text-white/20 group-hover:text-(--main-color) transition-all ${loading && 'animate-spin'}`} />
                    </div>
                </button>
            </div>

            {/* Frameless KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-16">
                <StatCard label={tr("Infrastructure Store")} value={stats.total} />
                <StatCard label={tr("Availability Rate")} value={activeCount} sub={stats.total > 0 ? `${Math.round(activeCount / stats.total * 100)}%` : undefined} color="text-green-500/80" />
                <StatCard label={tr("Vendor Nodes")} value={vendorCount} color="text-(--main-color)" />
                <StatCard label={tr("Classification Types")} value={Object.keys(stats.byCategory).length} />
            </div>

            {/* Pending expungements */}
            {delRequests.length > 0 && (
                <div className="animate-in slide-in-from-left-4 duration-1000">
                    <div className="flex items-center gap-4 mb-8">
                        <AlertTriangle size={14} className="text-orange-500" />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-orange-500/80">{tr("Quarantined records for deletion")}</h3>
                        <div className="h-px grow bg-linear-to-r from-orange-500/20 to-transparent" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {delRequests.map(req => (
                            <div key={req.id} className="group relative flex items-center justify-between py-4 border-b border-white/3 hover:border-orange-500/30 transition-all">
                                <div className="flex flex-col gap-1 min-w-0 pr-10">
                                    <span className="text-[10px] font-black text-white/70 uppercase tracking-tighter truncate">{req.item_id || req.itemId}</span>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{req.source} / {req.shape || tr("Unknown")}</span>
                                </div>
                                <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                                    <button 
                                        onClick={() => handleRestore(req.id, req.source)}
                                        className="text-[9px] font-black uppercase tracking-widest text-green-500/50 hover:text-green-400 px-3 py-1 border border-green-500/20 rounded-full hover:bg-green-500/5 transition-all"
                                    >{tr("Restore")}</button>
                                    <button 
                                        onClick={() => handleAuthorize(req.id, req.source)}
                                        className="text-[9px] font-black uppercase tracking-widest text-red-500/50 hover:text-red-400 px-3 py-1 border border-red-500/20 rounded-full hover:bg-red-500/5 transition-all"
                                    >{tr("Authorize Purge")}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Distribution Matrices */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
                <BreakdownBar data={stats.byStatus} title={tr("Status Distribution")} icon={Activity} />
                <BreakdownBar data={stats.byVendor} title={tr("Node Distribution")} icon={Users} />
                <BreakdownBar data={stats.byCategory} title={tr("Morphology Grid")} icon={PieChart} />
            </div>

            {/* Danger Zone: Extreme Override */}
            {isDev && (
                <div className="mt-20 pt-20 border-t border-white/3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-red-500/40 mb-12 flex items-center gap-4">
                        <AlertTriangle size={14} /> {tr("System Core Override")}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="group flex flex-col gap-6 p-8 border border-white/3 rounded-3xl hover:border-red-500/30 transition-all duration-700">
                            <div>
                                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white mb-2">{tr("Expunge Nexus Cloud")}</h4>
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 leading-relaxed">{tr("Permanently terminate all satellite inventory nodes strictly from central cloud storage. Non-reversible procedure.")}</p>
                            </div>
                            <button 
                                onClick={async () => {
                                    if (!confirm(tr("EXPUNGE CLOUD?"))) return;
                                    try {
                                        const { error } = await supabase.from('inventory').delete().neq('item_id', 'FORCE');
                                        if (error) throw error;
                                        fetchStats();
                                    } catch (err: any) { alert(err.message); }
                                }}
                                className="w-full bg-red-500/5 border border-red-500/10 py-3 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-red-500/60 hover:bg-red-500 hover:text-black transition-all duration-500"
                            >{tr("Wipe Satellite Data")}</button>
                        </div>

                        <div className="group flex flex-col gap-6 p-8 border border-white/3 rounded-3xl hover:border-red-500/30 transition-all duration-700">
                            <div>
                                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white mb-2">{tr("Local Nexus Nuke")}</h4>
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 leading-relaxed">{tr("Invalidate all local cached data streams. Forces an immediate core restart and primary nexus re-sync.")}</p>
                            </div>
                            <button 
                                onClick={async () => {
                                    const dbs = await window.indexedDB.databases();
                                    await Promise.all(dbs.filter((d: any) => d.name?.startsWith('onyxdb')).map((d: any) => window.indexedDB.deleteDatabase(d.name!)));
                                    window.location.reload();
                                }}
                                className="w-full bg-red-500/5 border border-red-500/10 py-3 rounded-full text-[9px] font-black uppercase tracking-[0.4em] text-red-500/60 hover:bg-red-500 hover:text-black transition-all duration-500"
                            >{tr("Initiate Terminal Wipe")}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
