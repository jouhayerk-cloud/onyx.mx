/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface InventoryStats {
    total: number;
    byStatus: Record<string, number>;
    byVendor: Record<string, number>;
    byCategory: Record<string, number>;
    recentlyAdded: { item_id: string; name: string; created_at: string }[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl py-4 px-5 flex flex-col gap-1">
            <p className="text-[11px] uppercase font-bold tracking-widest text-white/50">{label}</p>
            <p className={`text-4xl font-black tabular-nums mt-1 ${color || 'text-white'}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {sub && <p className="text-sm text-[var(--text-color-secondary)]">{sub}</p>}
        </div>
    );
}

function BreakdownBar({ data, title }: { data: Record<string, number>; title: string }) {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length === 0) return null;

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl py-4 px-5 flex flex-col gap-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">{title}</p>
            <div className="flex flex-col gap-2.5">
                {sorted.map(([key, count]) => {
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                        <div key={key} className="flex items-center gap-3">
                            <span className="text-sm text-white/80 w-28 truncate flex-shrink-0">{key || '—'}</span>
                            <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[var(--main-color)] transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="text-sm font-mono text-white/60 w-12 text-right flex-shrink-0">{count}</span>
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
            const recentlyAdded: { item_id: string; name: string; created_at: string }[] = [];

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
                recentlyAdded: recentlyAdded.slice(0, 5),
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
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .eq('status', 'Pending Deletion');
        if (!error) setDelRequests(data || []);
    }, []);

    const handleAuthorize = async (id: string) => {
        if (!confirm("Hard delete this item permanently?")) return;
        setIsActing(id);
        try {
            const { error } = await supabase.from('inventory').delete().eq('id', id);
            if (error) throw error;
            fetchDelRequests();
            fetchStats();
        } catch (err: any) { alert(err.message); }
        setIsActing(null);
    };

    const handleRestore = async (id: string) => {
        setIsActing(id);
        try {
            const { error } = await supabase.from('inventory').update({ status: 'Catalog' }).eq('id', id);
            if (error) throw error;
            fetchDelRequests();
            fetchStats();
        } catch (err: any) { alert(err.message); }
        setIsActing(null);
    };

    useEffect(() => { fetchStats(); fetchDelRequests(); }, [fetchStats, fetchDelRequests]);

    if (loading) return (
        <div className="flex items-center justify-center h-40 text-(--text-color-secondary)">
            <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-(--main-color) border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading database stats…</span>
            </div>
        </div>
    );

    if (error) return (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
    );

    if (!stats) return null;

    const activeCount = stats.byStatus['YES'] || stats.byStatus['Active'] || stats.byStatus['active'] || stats.byStatus['Catalog'] || 0;
    const vendorCount = Object.keys(stats.byVendor).length;

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-(--text-color-secondary)">
                    {lastRefreshed && `Refreshed ${lastRefreshed.toLocaleTimeString()}`}
                </p>
                <div className="flex gap-2">
                    <button onClick={() => { fetchStats(); fetchDelRequests(); }} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5 transition-all text-(--text-color-secondary) hover:text-white">
                        <svg className="w-4 h-4"><use href="#refresh" /></svg>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Items" value={stats.total} color="text-white" />
                <StatCard label="Active Items" value={activeCount} color="text-green-400" sub={stats.total > 0 ? `${Math.round(activeCount / stats.total * 100)}% of total` : undefined} />
                <StatCard label="Vendors" value={vendorCount} color="text-(--main-color)" />
                <StatCard label="Categories" value={Object.keys(stats.byCategory).length} />
            </div>

            {/* Deletion Requests Table */}
            {delRequests.length > 0 && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5 flex flex-col gap-4 mt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs uppercase font-bold tracking-widest text-orange-400 flex items-center gap-2">
                            Deletion Requests ({delRequests.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead>
                                <tr className="border-b border-white/5 text-white/30 uppercase tracking-tighter">
                                    <th className="pb-2 font-black">Item ID</th>
                                    <th className="pb-2 font-black">Shape</th>
                                    <th className="pb-2 font-black">Requested By</th>
                                    <th className="pb-2 font-black text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {delRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-white/5">
                                        <td className="py-2 text-white/80 font-mono">{req.item_id}</td>
                                        <td className="py-2 text-white/60">{req.shape}</td>
                                        <td className="py-2 text-white/40">{req.marked_by || 'Unknown'}</td>
                                        <td className="py-2 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleRestore(req.id)}
                                                    className="bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded text-[10px] hover:bg-green-500/40"
                                                    disabled={!!isActing}
                                                >
                                                    Restore
                                                </button>
                                                <button
                                                    onClick={() => handleAuthorize(req.id)}
                                                    className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-1 rounded text-[10px] hover:bg-red-600 hover:text-white"
                                                    disabled={!!isActing}
                                                >
                                                    {isActing === req.id ? 'Deleting...' : 'Hard Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Breakdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <BreakdownBar data={stats.byStatus} title="By Status" />
                <BreakdownBar data={stats.byVendor} title="By Vendor" />
            </div>
            <BreakdownBar data={stats.byCategory} title="By Category" />

            {/* Developer Actions */}
            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-3 pb-8">
                <h3 className="text-xs uppercase font-bold tracking-widest text-[var(--main-color)] flex items-center gap-2">
                    <svg className="w-4 h-4"><use href="#shield" /></svg> Danger Zone
                </h3>
                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-bold text-red-400">Clear Cloud Inventory</p>
                        <p className="text-xs text-[var(--text-color-secondary)] mt-1">
                            This will PERMANENTLY delete all records from the 'inventory' table in Supabase. This action cannot be undone.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (!confirm("Are you SURE you want to DELETE ALL ITEMS from the cloud database?")) return;
                            if (!confirm("FINAL WARNING: This will erase all inventory data. Proceed?")) return;
                            try {
                                const { error } = await supabase.from('inventory').delete().neq('item_id', 'FORCE_DELETE_ALL');
                                if (error) throw error;
                                alert("Cloud database cleared.");
                                fetchStats();
                            } catch (err: any) {
                                alert("Failed to clear cloud database: " + err.message);
                            }
                        }}
                        className="button hover:!bg-red-600 !bg-red-500/20 !text-red-300 border border-red-500/50 whitespace-nowrap !py-2"
                    >
                        Clear Cloud Database
                    </button>
                </div>

                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-bold text-red-400">Wipe Local Database Cache</p>
                        <p className="text-xs text-[var(--text-color-secondary)] mt-1">
                            This will completely destroy your browser's local IndexedDB file segments. The application will immediately hard-refresh and spend significant time rebuilding the cache from the Cloud. Do this only if the database is corrupt or out-of-sync.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (!confirm("Are you SURE you want to drop all local database tables? This will trigger an immediate system restart.")) return;
                            try {
                                const dbs = await window.indexedDB.databases();
                                await Promise.all(
                                    dbs.filter((d: any) => d.name?.startsWith('onyxdb'))
                                        .map((d: any) => new Promise<void>(resolve => {
                                            const req = window.indexedDB.deleteDatabase(d.name!);
                                            req.onsuccess = () => resolve();
                                            req.onerror = () => resolve();
                                        }))
                                );
                            } catch (_) { } // Firefox lacks .databases() handling
                            window.location.reload();
                        }}
                        className="button hover:!bg-red-600 !bg-red-500/20 !text-red-300 border border-red-500/50 whitespace-nowrap !py-2"
                    >
                        Nuke Cache & Restart
                    </button>
                </div>
            </div>
        </div>
    );
}
