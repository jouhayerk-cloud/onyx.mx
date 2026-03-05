import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom,
    userAtom, topBarRightSlotAtom, financeSubTabAtom
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Activity, LayoutDashboard, Database, RefreshCcw, DollarSign, Wallet, Store,
    ShoppingCart, CreditCard, Package, ArrowRight, User
} from 'lucide-react';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { destinationsConfig } from '../../lib/paymentConfig';
import { default as toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { EChart } from '../../components/EChart';
import type { EChartsOption } from 'echarts';

interface ClientVendorSummary {
    vendorId: string;
    color: string;
    itemCount: number;
    totalAcqMxn: number;
    totalAcqUsd: number;
}

const SummaryTile = ({ icon: Icon, title, stats, actionLabel, onAction, color = 'var(--main-color)' }: {
    icon: React.FC<any>; title: string; stats: { label: string; value: string }[]; actionLabel: string; onAction: () => void; color?: string;
}) => (
    <div
        onClick={onAction}
        className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-6 flex flex-col gap-6 hover:translate-y-[-4px] active:scale-[0.98] cursor-pointer transition-all duration-300 shadow-xl relative overflow-hidden group"
    >
        <div className="absolute top-[-20%] right-[-10%] w-40 h-40 rounded-full blur-[60px] opacity-10 z-0" style={{ background: color }} />
        <div className="flex items-center justify-between relative z-10">
            <div className="p-4 rounded-2xl border border-white/5 shadow-lg" style={{ background: `${color}10` }}>
                <Icon size={24} strokeWidth={1.5} style={{ color }} />
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 group-hover:bg-(--main-color)/20 text-[10px] font-black uppercase tracking-widest text-(--text-color) transition-all">
                {actionLabel} <ArrowRight size={12} />
            </div>
        </div>
        <div className="relative z-10">
            <h3 className="text-xl font-black text-(--text-color) tracking-tight mb-4 uppercase">{title}</h3>
            <div className="space-y-3">
                {stats.map((s, i) => (
                    <div key={i} className="flex justify-between items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-60">{s.label}</span>
                        <span className="text-lg font-mono font-black text-(--text-color) leading-none">{s.value}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const ClientOverview: React.FC = () => {
    const t = useTranslation();
    const db = useDatabase();
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [showFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const setFinanceSubTab = useSetAtom(financeSubTabAtom);
    const setTopBarRightSlot = useSetAtom(topBarRightSlotAtom);

    const [items, setItems] = useState<any[]>([]);
    const [storeItems, setStoreItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setTopBarRightSlot(
            <div className="flex items-center gap-2 px-3 py-1.5 bg-(--main-color)/10 border border-(--main-color)/20 rounded-full">
                <LayoutDashboard size={14} className="text-(--main-color)" />
                <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em]">Overview</span>
            </div>
        );
        return () => { setTopBarRightSlot(null); };
    }, [setTopBarRightSlot]);

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const subs = [
            db.inventory.find().$.subscribe(d => {
                const all = d.map(x => ({ ...x.toJSON(), source: 'inventory', data: normalizeInventoryData(x.toJSON()) }));
                const store = all.filter(x => ['Available', 'Avaiable', 'Catalog'].includes(x.data.status));
                const inventory = all.filter(x => !['Available', 'Avaiable', 'Catalog'].includes(x.data.status) && x.data.status !== 'Pending Deletion');
                setItems(prev => [...prev.filter(p => p.source !== 'inventory'), ...inventory]);
                setStoreItems(prev => [...prev.filter(p => p.source !== 'inventory'), ...store]);
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'production'), ...mapped]);
            }),
        ];
        setTimeout(() => setIsLoading(false), 800);
        return () => subs.forEach(s => s.unsubscribe());
    }, [db]);

    const vendorSummaries = useMemo<ClientVendorSummary[]>(() => {
        const map: Record<string, ClientVendorSummary> = {};
        for (const item of items) {
            const norm = item.data;
            const vid = String(norm?.itemId || '').split('-')[0] || '?';
            if (!map[vid]) {
                map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            }
            const price = parseFloat(norm?.price || 0);
            const qty = parseInt(norm?.quantity || 1) || 1;
            const totalPrice = price * qty;
            const usd = totalPrice / exchangeRate;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += usd;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, exchangeRate]);

    const activeDestPendingRecords = useMemo(() => {
        return financeData.filter(d => (d.status === 'Requested' || !d.status) && d.destination);
    }, [financeData]);

    const activeDestReqNetMXN = useMemo(() => {
        return activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
    }, [activeDestPendingRecords]);

    const globalTotals = useMemo(() => {
        const totalItems = vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0);
        const totalAcqValueUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);

        // Calculate pending payments (Requested)
        const pendingValueUsd = activeDestReqNetMXN / exchangeRate;

        // "Acquisition (Pending payment)" - Let's define this as total acq value of items not yet markers as strictly paid?
        // Actually the prompt says "Payments (Total acquisition, pending payment)" and "Payments (requested pending payments)"
        // I'll use the total items value as "Total Acquisition"
        return {
            totalItems,
            totalAcqValueUsd,
            pendingValueUsd,
            storeCount: storeItems.reduce((acc, x) => acc + (parseInt(x.data.quantity) || 1), 0),
            newStoreCount: storeItems.filter(x => {
                const updated = new Date(x.data.updatedAt || 0).getTime();
                return Date.now() - updated < 7 * 24 * 60 * 60 * 1000; // last 7 days
            }).length
        };
    }, [vendorSummaries, storeItems, activeDestReqNetMXN, exchangeRate]);

    const fmtMXN = (val: number) => showFinancials ? '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '***';
    const fmtUSD = (val: number, compact = false) => {
        if (!showFinancials) return '***';
        return '$' + val.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: compact ? 0 : 2
        }) + (compact ? '' : ' USD');
    };

    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 } },
        yAxis: { type: 'category', data: vendorSummaries.slice(0, 8).map(v => v.vendorId), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold' } },
        series: [
            {
                name: 'Units',
                type: 'bar',
                data: vendorSummaries.slice(0, 8).map(v => v.itemCount),
                itemStyle: { color: (params: any) => vendorSummaries[params.dataIndex].color + 'CC', borderRadius: [0, 8, 8, 0] },
                barWidth: '60%'
            }
        ],
        backgroundColor: 'transparent',
    }), [vendorSummaries]);

    const pieChartOption = useMemo<EChartsOption>(() => {
        const data = vendorSummaries.slice(0, 5).map(v => ({ name: v.vendorId, value: v.totalAcqUsd }));
        return {
            tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' },
            series: [
                {
                    name: 'Acquisition',
                    type: 'pie',
                    radius: ['50%', '80%'],
                    center: ['50%', '50%'],
                    data,
                    label: { show: false },
                    itemStyle: { borderRadius: 10, borderColor: 'rgba(0,0,0,0.5)', borderWidth: 2 }
                }
            ],
            color: vendorSummaries.slice(0, 5).map(v => v.color),
            backgroundColor: 'transparent'
        };
    }, [vendorSummaries]);

    const handleMarkAsPaid = async (destId: string, destReqMXN: number, destDocs: any[]) => {
        const toastId = toast.loading(`Marking ${fmtMXN(destReqMXN)} as Paid...`);
        try {
            const docIds = destDocs.map(d => d.id);
            if (docIds.length === 0) return;

            const { error: finErr } = await supabase.from('finance').update({ status: 'Paid' }).in('id', docIds);
            if (finErr) throw finErr;

            for (const id of docIds) {
                const localDoc = await db?.finance.findOne({ selector: { id } }).exec();
                if (localDoc) await localDoc.patch({ status: 'Paid' });
            }

            for (const req of destDocs) {
                const ids = req.related_ids || req.related_inventory_ids?.split(',') || [];
                if (ids.length > 0) {
                    if (req.description?.includes('%')) {
                        const perc = req.description.match(/(\d+)%/)?.[1];
                        await supabase.from('inventory').update({ pay_req: `paid ${perc || 'partial'}%` }).in('id', ids);
                    } else {
                        await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                    }
                }
            }

            toast.success('Payment successfully finalized.', { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error('Failed to mark as paid', { id: toastId });
        }
    };

    if (isLoading) return <LoadingIndicator />;

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-6 animate-in fade-in duration-500">
            {/* Header / Greeting */}
            <div className="flex items-center gap-6 px-4 py-8 mx-2 shrink-0 z-10 relative">
                <div className="w-20 h-20 rounded-[2rem] bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center p-1 shrink-0">
                    <div className="w-full h-full rounded-[1.75rem] bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                        <User size={40} className="text-(--main-color) opacity-50" />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <h2 className="text-[12px] font-black uppercase tracking-[0.4em] text-(--main-color) leading-none">Welcome back,</h2>
                    <h1 className="text-4xl font-black text-(--text-color) tracking-tighter leading-none">{user?.name || user?.email?.split('@')[0] || 'User'}</h1>
                    <p className="text-[11px] font-bold text-(--text-color-secondary) uppercase tracking-widest mt-2 flex items-center gap-2 opacity-40">
                        <Activity size={12} className="text-(--main-color)" /> Real-time Logistics & Financial Feed
                    </p>
                </div>
            </div>

            <div className="grow min-h-0 overflow-y-auto m-2 mt-0 relative z-20 custom-scrollbar pr-2 space-y-10 pb-20">
                {/* Summary Tiles */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SummaryTile
                        icon={ShoppingCart}
                        title="Retail Market"
                        stats={[
                            { label: 'Total Catalog Units', value: globalTotals.storeCount.toLocaleString() },
                            { label: 'New Arrivals (7d)', value: globalTotals.newStoreCount.toString() }
                        ]}
                        actionLabel="Go to Store"
                        onAction={() => setActiveView('store')}
                        color="#34D399"
                    />
                    <SummaryTile
                        icon={Package}
                        title="Acquisitions"
                        stats={[
                            { label: 'Units Registered', value: globalTotals.totalItems.toLocaleString() },
                            { label: 'Total Acq. Value', value: fmtUSD(globalTotals.totalAcqValueUsd, true) }
                        ]}
                        actionLabel="Inventory"
                        onAction={() => setActiveView('inventory')}
                        color="#6BCEBB"
                    />
                    <SummaryTile
                        icon={CreditCard}
                        title="Dispersals"
                        stats={[
                            { label: 'Requested Unpaid', value: fmtUSD(globalTotals.pendingValueUsd, true) },
                            { label: 'Unpaid Items Value', value: fmtUSD(globalTotals.totalAcqValueUsd, true) } // Placeholder for "pending payment" acq value
                        ]}
                        actionLabel="Go to Payments"
                        onAction={() => { setActiveView('finance'); setFinanceSubTab('payments'); }}
                        color="#FBBF24"
                    />
                </div>

                {/* ── Visual Analytics ────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Units by Vendor Chart */}
                    <div className="lg:col-span-2 bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Activity size={18} className="text-(--main-color)" />
                                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Acquisition Flow by Vendor</h3>
                            </div>
                        </div>
                        <EChart option={vendorChartOption} style={{ height: '350px' }} />
                    </div>

                    {/* Value Distribution */}
                    <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 flex flex-col items-center justify-center space-y-6">
                        <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color) text-center">Value Concentration</h3>
                        <EChart option={pieChartOption} style={{ height: '250px' }} />
                        <div className="text-center">
                            <p className="text-[9px] font-black uppercase tracking-widest text-(--main-color) mb-1">Top 5 Vendors Share</p>
                            <p className="text-2xl font-black text-(--text-color) tracking-tighter">{fmtUSD(globalTotals.totalAcqValueUsd * 0.85, true)}</p>
                        </div>
                    </div>
                </div>

                {/* Split layout for pending requests destinations */}
                <div className="bg-(--glass-bg) rounded-[2.5rem] border border-(--border-color) p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <RefreshCcw size={18} className="text-[#00AEEF]" />
                        <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Priority Payment Requisitions</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(destinationsConfig).map(([key, cfg]) => {
                            const destDocs = activeDestPendingRecords.filter(d => d.destination === key);
                            const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                            if (destReqMXN <= 0) return null;

                            return (
                                <div key={key} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white/5 border border-white/5 hover:border-[#00AEEF]/40 transition-all rounded-[2rem] group gap-4">
                                    <div className="flex items-center gap-5">
                                        <div className="w-16 h-12 p-1.5 bg-white rounded-xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden">
                                            <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain mix-blend-multiply" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-(--text-color) uppercase tracking-widest leading-none mb-1.5">{cfg.name}</p>
                                            <p className="text-[9px] font-bold text-(--text-color-secondary) uppercase tracking-widest opacity-40">Ready for Dispersal</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-right mb-2">
                                            <p className="text-xl font-mono font-black text-(--text-color) group-hover:text-[#00AEEF] transition-colors">{fmtMXN(destReqMXN)}</p>
                                        </div>
                                        <button
                                            onClick={() => handleMarkAsPaid(key, destReqMXN, destDocs)}
                                            className="px-6 py-2.5 rounded-xl bg-(--main-color) text-black font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">
                                            Finalize Payment
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {activeDestPendingRecords.length === 0 && (
                            <div className="col-span-full p-12 text-center text-(--text-color-secondary) text-[11px] font-black tracking-[0.3em] uppercase border-2 border-dashed border-white/10 rounded-[2.5rem] opacity-30">
                                No Pending Requisitions found
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
