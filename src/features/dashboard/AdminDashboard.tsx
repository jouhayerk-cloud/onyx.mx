import React, { useMemo, useState, useEffect } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import { exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom, userAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Package, DollarSign, Users, TrendingUp, Layers, Shapes,
    BarChart3, PieChart, LayoutGrid, User, Activity
} from 'lucide-react';
import { EChart } from '../../components/EChart';
import type { EChartsOption } from 'echarts';

interface VendorSummary {
    vendorId: string;
    itemCount: number;
    totalAcqMxn: number;
    totalAcqUsd: number;
    color: string;
}

const StatCard = ({ icon: Icon, label, value, subtitle, color = 'var(--main-color)' }: {
    icon: React.FC<any>; label: string; value: string; subtitle?: string; color?: string;
}) => (
    <div className="bg-(--glass-bg) border border-(--border-color) rounded-4xl p-6 flex flex-col gap-3 hover:translate-y-[-2px] transition-all group shadow-sm">
        <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner" style={{ background: `${color}15` }}>
                <Icon size={24} strokeWidth={1.5} style={{ color }} />
            </div>
            {subtitle && <span className="text-[10px] font-mono font-bold text-(--text-color-secondary) opacity-40">{subtitle}</span>}
        </div>
        <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-1">{label}</p>
            <p className="text-2xl font-black font-mono text-(--text-color) leading-none tracking-tight">{value}</p>
        </div>
    </div>
);

export function AdminDashboard() {
    const db = useDatabase();
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [showFinancials, setShowFinancials] = useAtom(showFinancialsAtom);

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
        setTimeout(() => setIsLoading(false), 800);
        return () => subs.forEach(s => s.unsubscribe());
    }, [db]);

    const vendorSummaries = useMemo(() => {
        const map: Record<string, VendorSummary> = {};
        items.forEach(item => {
            const vPrefix = item.data.itemId?.split('-')[0] || 'UNK';
            const priceVal = parseFloat(item.data.priceMx || item.data.priceMxn || item.data.price || 0);
            const qty = parseInt(item.data.quantity) || 1;
            const acqMxn = priceVal * qty;
            const acqUsd = acqMxn / exchangeRate;

            if (!map[vPrefix]) {
                const vConfig = (vendors as any)[vPrefix];
                map[vPrefix] = {
                    vendorId: vPrefix,
                    itemCount: 0,
                    totalAcqMxn: 0,
                    totalAcqUsd: 0,
                    color: vConfig?.color || '#FFFFFF'
                };
            }
            map[vPrefix].itemCount += qty;
            map[vPrefix].totalAcqMxn += acqMxn;
            map[vPrefix].totalAcqUsd += acqUsd;
        });
        return Object.values(map).sort((a, b) => b.totalAcqUsd - a.totalAcqUsd);
    }, [items, exchangeRate]);

    const shapeTypeSummaries = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(item => {
            const label = `${item.data.shape || 'OBJ'} · ${item.data.shortDescription || 'ITEM'}`;
            counts[label] = (counts[label] || 0) + (parseInt(item.data.quantity) || 1);
        });
        return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    }, [items]);

    const materialSummaries = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(item => {
            const label = item.data.material || 'N/A';
            counts[label] = (counts[label] || 0) + (parseInt(item.data.quantity) || 1);
        });
        return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    }, [items]);

    const financeData = useAtomValue(financeDataAtom);
    const expenseCategories = useMemo(() => {
        const cats: Record<string, { total: number; count: number }> = {};
        financeData.forEach(d => {
            const cat = d.category || 'Uncategorized';
            if (!cats[cat]) cats[cat] = { total: 0, count: 0 };
            cats[cat].total += (d.amount || 0) + (d.commission || 0);
            cats[cat].count += 1;
        });
        return Object.entries(cats).map(([label, stats]) => ({ label, total: stats.total, count: stats.count })).sort((a, b) => b.total - a.total);
    }, [financeData]);

    const totals = useMemo(() => {
        const totalItems = vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0);
        const totalAcqMxn = vendorSummaries.reduce((acc, v) => acc + v.totalAcqMxn, 0);
        const totalAcqUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);
        const totalExpenses = financeData.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
        const paidExpenses = financeData.filter(d => d.status === 'Paid').reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);

        return { totalItems, totalAcqMxn, totalAcqUsd, totalExpenses, paidExpenses };
    }, [vendorSummaries, financeData]);

    const fmt = (n: number) => showFinancials ? `$${Math.ceil(n).toLocaleString()}` : '***';

    // Chart options
    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 } },
        yAxis: { type: 'category', data: vendorSummaries.map(v => v.vendorId), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold' } },
        series: [{
            name: 'Value USD', type: 'bar', data: vendorSummaries.map(v => v.totalAcqUsd),
            itemStyle: { color: (params: any) => vendorSummaries[params.dataIndex].color + 'BB', borderRadius: [0, 8, 8, 0] }
        }],
        backgroundColor: 'transparent'
    }), [vendorSummaries]);

    const pieOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie', radius: ['40%', '70%'],
            data: materialSummaries.map(m => ({ name: m.label, value: m.count })),
            itemStyle: { borderRadius: 10, borderColor: 'rgba(0,0,0,0.5)', borderWidth: 5 },
            label: { show: false }
        }],
        color: ['#A78BFA', '#34D399', '#00AEEF', '#FBBF24', '#F87171'],
        backgroundColor: 'transparent'
    }), [materialSummaries]);

    const categoriesOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: shapeTypeSummaries.slice(0, 8).map(s => s.label.split(' · ')[0]), axisLabel: { rotate: 45, color: 'rgba(255,255,255,0.4)', fontSize: 8 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [{
            type: 'pictorialBar', symbol: 'roundRect',
            data: shapeTypeSummaries.slice(0, 8).map(s => s.count),
            itemStyle: { color: '#6BCEBB' }
        }],
        backgroundColor: 'transparent'
    }), [shapeTypeSummaries]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center opacity-40">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Synchronizing Intelligence...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-6 animate-in fade-in duration-500">
            {/* Greeting Top */}
            <div className="flex items-center px-4 py-8 mx-2 shrink-0 z-10 relative">
                <div className="flex-1 flex flex-col gap-1.5">
                    <h2 className="text-[12px] font-black uppercase tracking-[0.4em] text-[#6BCEBB] leading-none">Management Console</h2>
                    <h1 className="text-4xl font-black text-(--text-color) tracking-tighter leading-none">Global Analytics</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFinancials(!showFinancials)}
                        className={`flex items-center gap-3 border rounded-2xl px-6 py-3 transition-all ${showFinancials ? 'bg-red-500/10 border-red-500/20 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'bg-green-500/10 border-green-500/20 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.1)]'}`}
                    >
                        <DollarSign size={16} strokeWidth={2.5} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">{showFinancials ? 'Lock Financials' : 'Unlock Financials'}</span>
                    </button>
                    <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-end">
                        <span className="text-[9px] font-black opacity-20 uppercase tracking-widest leading-none mb-1">Active Index</span>
                        <span className="text-sm font-mono font-black text-(--text-color)">{items.length.toLocaleString()} <span className="text-[10px] opacity-20">REC</span></span>
                    </div>
                </div>
            </div>

            {/* Content Body */}
            <div className="grow min-h-0 overflow-y-auto m-2 mt-0 relative z-20 custom-scrollbar pr-2 space-y-8 pb-20">
                {/* ── KPI Cards ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={Package} label="Total Assets" value={totals.totalItems.toLocaleString()} color="#6BCEBB" />
                    <StatCard icon={Users} label="Vendor Base" value={String(vendorSummaries.length)} color="#00AEEF" />
                    <StatCard icon={DollarSign} label="Acq Portfolio" value={fmt(totals.totalAcqUsd)} subtitle={`≈ ${fmt(totals.totalAcqMxn)} MXN`} color="#A78BFA" />
                    <StatCard icon={TrendingUp} label="Dispersals" value={fmt(totals.paidExpenses)} subtitle={`Budget: ${fmt(totals.totalExpenses)}`} color="#FBBF24" />
                </div>

                {/* ── Analytics Grid ─────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Bar Chart */}
                    <div className="lg:col-span-2 bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <BarChart3 size={18} className="text-(--main-color)" />
                            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Acquisition Portfolio by Vendor</h2>
                        </div>
                        <EChart option={vendorChartOption} style={{ height: '400px' }} />
                    </div>

                    {/* Secondary Analytics */}
                    <div className="flex flex-col gap-6">
                        {/* Material Pie */}
                        <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 flex-1 flex flex-col gap-6">
                            <div className="flex items-center gap-3">
                                <PieChart size={16} className="text-blue-400" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-(--text-color)">Material Concentration</h3>
                            </div>
                            <EChart option={pieOption} style={{ height: '220px' }} />
                        </div>

                        {/* Category Stats */}
                        <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 flex-1 flex flex-col gap-6">
                            <div className="flex items-center gap-3">
                                <Shapes size={16} className="text-[#6BCEBB]" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-(--text-color)">Category Distribution</h3>
                            </div>
                            <EChart option={categoriesOption} style={{ height: '220px' }} />
                        </div>
                    </div>
                </div>

                {/* ── Dispersal Analysis ─────────────────────────────────── */}
                <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <DollarSign size={18} strokeWidth={1.75} className="text-white/30" />
                        <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Expense Allocation by Category</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {expenseCategories.map(e => (
                            <div key={e.label} className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-(--main-color)/30 transition-all flex flex-col gap-2 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity"><DollarSign className="w-10 h-10" /></div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">{e.label}</p>
                                <p className="text-xl font-mono font-black text-(--text-color)">{showFinancials ? `$${e.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '***'}</p>
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-(--main-color)" style={{ width: `${Math.round((e.total / totals.totalExpenses) * 100)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
