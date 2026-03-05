import React, { useMemo } from 'react';
import { useAtomValue, useAtom } from 'jotai/react';
import { exchangeRateAtom, showFinancialsAtom, financeDataAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { normalizeInventoryData, calculateCodesAndPrices } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useState, useEffect } from 'react';
import {
    Package, DollarSign, Users, TrendingUp, Layers, Shapes,
    BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';

interface VendorSummary {
    vendorId: string;
    color: string;
    itemCount: number;
    totalAcqMxn: number;
    totalAcqUsd: number;
    totalLandedUsd: number;
    totalRetailUsd: number;
}

interface CategorySummary {
    label: string;
    count: number;
    totalMxn: number;
    totalUsd: number;
}

const StatCard = ({ icon: Icon, label, value, subtitle, color = 'var(--main-color)', trend }: {
    icon: React.FC<any>; label: string; value: string; subtitle?: string; color?: string; trend?: 'up' | 'down' | 'flat';
}) => (
    <div className="bg-(--glass-bg) border border-(--border-color) rounded-2xl p-5 flex flex-col gap-3 hover:border-(--border-color) transition-all group">
        <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10" style={{ background: `${color}15` }}>
                <Icon size={17} strokeWidth={1.75} style={{ color }} />
            </div>
            {trend && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${trend === 'up' ? 'bg-green-500/10 text-green-400' : trend === 'down' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-white/30'}`}>
                    {trend === 'up' ? <ArrowUpRight size={10} /> : trend === 'down' ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                    {trend}
                </div>
            )}
        </div>
        <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-1">{label}</p>
            <p className="text-xl font-black font-mono text-(--text-color) leading-none tracking-tight">{value}</p>
            {subtitle && <p className="text-[10px] font-mono text-(--text-color-secondary) mt-1">{subtitle}</p>}
        </div>
    </div>
);

const BarRow = ({ label, value, max, color, count, showValue }: {
    label: string; value: number; max: number; color: string; count: number; showValue: boolean;
}) => (
    <div className="flex items-center gap-3 group/bar">
        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) w-10 shrink-0 text-right">{label}</span>
        <div className="flex-1 h-7 bg-(--glass-bg) rounded-lg overflow-hidden relative border border-(--border-color)">
            <div
                className="h-full rounded-lg transition-all duration-700 ease-out flex items-center px-3 gap-2"
                style={{ width: `${max > 0 ? Math.max((value / max) * 100, 2) : 0}%`, backgroundColor: `${color}40` }}
            >
                <span className="text-[10px] font-black text-(--text-color-secondary) whitespace-nowrap">{count} items</span>
            </div>
            {showValue && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black text-(--text-color-secondary)">
                    ${Math.ceil(value).toLocaleString()}
                </span>
            )}
        </div>
    </div>
);

export function AdminDashboard() {
    const db = useDatabase();
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [showFinancials, setShowFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);
    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'inventory', data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'inventory'), ...mapped]);
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'production'), ...mapped]);
            }),
        ];
        setTimeout(() => setIsLoading(false), 600);
        return () => subs.forEach(s => s.unsubscribe());
    }, [db]);

    const vendorSummaries = useMemo<VendorSummary[]>(() => {
        const map: Record<string, VendorSummary> = {};
        for (const item of items) {
            const norm = item.data;
            const vid = String(norm?.itemId || '').split('-')[0] || '?';
            if (!map[vid]) {
                map[vid] = {
                    vendorId: vid,
                    color: (vendors as any)[vid]?.color || '#888',
                    itemCount: 0,
                    totalAcqMxn: 0,
                    totalAcqUsd: 0,
                    totalLandedUsd: 0,
                    totalRetailUsd: 0,
                };
            }
            const price = parseFloat(norm?.price || 0);
            const qty = parseInt(norm?.quantity || 1) || 1;
            const totalPrice = price * qty;
            const usd = totalPrice / exchangeRate;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += usd;
            map[vid].totalLandedUsd += usd * 1.4;
            map[vid].totalRetailUsd += usd * 1.4 * 12;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, exchangeRate]);

    const shapeTypeSummaries = useMemo<CategorySummary[]>(() => {
        const map: Record<string, CategorySummary> = {};
        for (const item of items) {
            const norm = item.data;
            const shape = (norm?.shape || 'Unknown').toUpperCase();
            const type = (norm?.shortDescription || 'Unknown').toUpperCase();
            const key = `${shape} · ${type}`;
            if (!map[key]) map[key] = { label: key, count: 0, totalMxn: 0, totalUsd: 0 };
            const qty = parseInt(norm?.quantity || 1) || 1;
            const price = parseFloat(norm?.price || 0) * qty;
            map[key].count += qty;
            map[key].totalMxn += price;
            map[key].totalUsd += price / exchangeRate;
        }
        return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 15);
    }, [items, exchangeRate]);

    const materialSummaries = useMemo<CategorySummary[]>(() => {
        const map: Record<string, CategorySummary> = {};
        for (const item of items) {
            const norm = item.data;
            const mat = (norm?.material || 'Unknown').toUpperCase();
            if (!map[mat]) map[mat] = { label: mat, count: 0, totalMxn: 0, totalUsd: 0 };
            const qty = parseInt(norm?.quantity || 1) || 1;
            const price = parseFloat(norm?.price || 0) * qty;
            map[mat].count += qty;
            map[mat].totalMxn += price;
            map[mat].totalUsd += price / exchangeRate;
        }
        return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
    }, [items, exchangeRate]);

    const expenseCategories = useMemo(() => {
        const map: Record<string, { label: string; total: number; count: number }> = {};
        for (const doc of financeData) {
            const cat = (doc as any).category || 'Uncategorized';
            const displayCat = cat === 'Mo-Exp' ? 'Monthly' : cat;
            if (!map[displayCat]) map[displayCat] = { label: displayCat, total: 0, count: 0 };
            map[displayCat].total += (doc.amount || 0);
            map[displayCat].count += 1;
        }
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [financeData]);

    const totals = useMemo(() => {
        const totalItems = vendorSummaries.reduce((a, v) => a + v.itemCount, 0);
        const totalAcqMxn = vendorSummaries.reduce((a, v) => a + v.totalAcqMxn, 0);
        const totalAcqUsd = vendorSummaries.reduce((a, v) => a + v.totalAcqUsd, 0);
        const totalLandedUsd = vendorSummaries.reduce((a, v) => a + v.totalLandedUsd, 0);
        const totalRetailUsd = vendorSummaries.reduce((a, v) => a + v.totalRetailUsd, 0);
        const totalExpenses = financeData.reduce((a, b) => a + (b.amount || 0), 0);
        const paidExpenses = financeData.filter((d: any) => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0);
        return { totalItems, totalAcqMxn, totalAcqUsd, totalLandedUsd, totalRetailUsd, totalExpenses, paidExpenses };
    }, [vendorSummaries, financeData]);

    const fmt = (n: number) => showFinancials ? `$${Math.ceil(n).toLocaleString()}` : '***';
    const maxVendorAcq = Math.max(...vendorSummaries.map(v => v.totalAcqUsd), 1);
    const maxShapeCount = Math.max(...shapeTypeSummaries.map(s => s.count), 1);
    const maxMatCount = Math.max(...materialSummaries.map(m => m.count), 1);
    const maxExpense = Math.max(...expenseCategories.map(e => e.total), 1);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-white/10 border-t-(--main-color) rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Loading Dashboard</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden p-6 gap-6">
            {/* Top Actions */}
            <div className="flex items-center justify-end shrink-0 gap-2">
                <button
                    onClick={() => setShowFinancials(!showFinancials)}
                    title="Toggle Financials Display"
                    className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 hover:brightness-125 transition-all w-fit ${showFinancials ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}
                >
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">{showFinancials ? 'Lock Financial Info' : 'Unlock Financial Info'}</span>
                </button>
                <div className="flex items-center gap-1.5 bg-(--main-color)/10 border border-(--main-color)/20 rounded-full px-3 py-1.5 w-fit">
                    <div className="w-1.5 h-1.5 rounded-full bg-(--main-color) animate-pulse" />
                    <span className="text-[9px] font-black text-(--main-color) uppercase tracking-widest leading-none">Live</span>
                </div>
                <span className="text-[9px] font-mono font-bold text-(--text-color-secondary) hidden sm:block px-2">{items.length} records</span>
            </div>

            {/* Scrollable content */}
            <div className="grow min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                {/* ── KPI Cards ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon={Package} label="Total Items" value={totals.totalItems.toLocaleString()} color="#6BCEBB" />
                    <StatCard icon={Users} label="Vendors" value={String(vendorSummaries.length)} color="#00AEEF" />
                    <StatCard icon={DollarSign} label="Acquisition MXN" value={fmt(totals.totalAcqMxn)} subtitle={`≈ ${fmt(totals.totalAcqUsd)} USD`} color="#A78BFA" />
                    <StatCard icon={DollarSign} label="Total Expenses" value={fmt(totals.totalExpenses)} subtitle={`Paid: ${fmt(totals.paidExpenses)}`} color="#F87171" />
                </div>

                {/* ── Vendor Acquisition Breakdown ──────────────────────── */}
                <div className="bg-(--glass-bg) border border-(--border-color) rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <PieChart size={14} strokeWidth={1.75} className="text-(--text-color-secondary)" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">Acquisition by Vendor</h2>
                    </div>
                    <div className="space-y-2">
                        {vendorSummaries.map(v => (
                            <BarRow
                                key={v.vendorId}
                                label={v.vendorId}
                                value={v.totalAcqUsd}
                                max={maxVendorAcq}
                                color={v.color}
                                count={v.itemCount}
                                showValue={showFinancials}
                            />
                        ))}
                    </div>
                </div>

                {/* Two-column grid for Shape/Type and Material */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ── Shape × Type ─────────────────────────────────── */}
                    <div className="bg-(--glass-bg) border border-(--border-color) rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Shapes size={14} strokeWidth={1.75} className="text-(--text-color-secondary)" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">By Shape · Type</h2>
                        </div>
                        <div className="space-y-1.5">
                            {shapeTypeSummaries.map(s => (
                                <div key={s.label} className="flex items-center gap-3">
                                    <div className="flex-1 h-6 bg-(--glass-bg) rounded-lg overflow-hidden relative border border-(--border-color)">
                                        <div
                                            className="h-full rounded-lg bg-(--main-color)/20 flex items-center px-3"
                                            style={{ width: `${Math.max((s.count / maxShapeCount) * 100, 5)}%` }}
                                        >
                                            <span className="text-[9px] font-black text-(--text-color-secondary) truncate">{s.label}</span>
                                        </div>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono font-black text-(--text-color-secondary)">{s.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Material ──────────────────────────────────────── */}
                    <div className="bg-(--glass-bg) border border-(--border-color) rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Layers size={14} strokeWidth={1.75} className="text-(--text-color-secondary)" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">By Material</h2>
                        </div>
                        <div className="space-y-1.5">
                            {materialSummaries.map(m => (
                                <div key={m.label} className="flex items-center gap-3">
                                    <div className="flex-1 h-6 bg-(--glass-bg) rounded-lg overflow-hidden relative border border-(--border-color)">
                                        <div
                                            className="h-full rounded-lg bg-blue-500/20 flex items-center px-3"
                                            style={{ width: `${Math.max((m.count / maxMatCount) * 100, 5)}%` }}
                                        >
                                            <span className="text-[9px] font-black text-(--text-color-secondary) truncate">{m.label}</span>
                                        </div>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono font-black text-white/20">{m.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Expense Categories ─────────────────────────────────── */}
                <div className="bg-white/2 border border-white/6 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign size={14} strokeWidth={1.75} className="text-white/30" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Expenses by Category</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {expenseCategories.map(e => (
                            <div key={e.label} className="flex items-center gap-3 p-3 bg-white/2 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                <div className="flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50">{e.label}</p>
                                    <p className="text-sm font-mono font-black text-white mt-0.5">{showFinancials ? `$${e.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '***'}</p>
                                </div>
                                <span className="text-[9px] font-mono text-white/20">{e.count} entries</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
