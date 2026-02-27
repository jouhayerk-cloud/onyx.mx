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

    useEffect(() => { fetchStats(); }, [fetchStats]);

    if (loading) return (
        <div className="flex items-center justify-center h-40 text-[var(--text-color-secondary)]">
            <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-[var(--main-color)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading database stats…</span>
            </div>
        </div>
    );

    if (error) return (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
    );

    if (!stats) return null;

    const activeCount = stats.byStatus['YES'] || stats.byStatus['Active'] || stats.byStatus['active'] || 0;
    const vendorCount = Object.keys(stats.byVendor).length;

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text-color-secondary)]">
                    {lastRefreshed && `Refreshed ${lastRefreshed.toLocaleTimeString()}`}
                </p>
                <button onClick={fetchStats} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5 transition-all text-[var(--text-color-secondary)] hover:text-white">
                    <svg className="w-4 h-4"><use href="#refresh" /></svg>
                    Refresh
                </button>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Items" value={stats.total} color="text-white" />
                <StatCard label="Active Items" value={activeCount} color="text-green-400" sub={stats.total > 0 ? `${Math.round(activeCount / stats.total * 100)}% of total` : undefined} />
                <StatCard label="Vendors" value={vendorCount} color="text-[var(--main-color)]" />
                <StatCard label="Categories" value={Object.keys(stats.byCategory).length} />
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <BreakdownBar data={stats.byStatus} title="By Status" />
                <BreakdownBar data={stats.byVendor} title="By Vendor" />
            </div>
            <BreakdownBar data={stats.byCategory} title="By Category" />
        </div>
    );
}
