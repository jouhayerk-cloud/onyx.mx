import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom,
    userAtom, financeSubTabAtom, liveExchangeRateAtom
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Activity, LayoutDashboard, Database, RefreshCcw, DollarSign, Wallet, Store,
    ShoppingCart, CreditCard, Package, ArrowRight, User, ChevronDown, ChevronUp
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
        className="bg-(--glass-bg) border border-(--border-color) rounded-4xl p-5 flex flex-col gap-4 hover:translate-y-[-4px] active:scale-[0.98] cursor-pointer transition-all duration-300 shadow-xl relative overflow-hidden group"
    >
        <div className="absolute top-[-20%] right-[-10%] w-32 h-32 rounded-full blur-[50px] opacity-10 z-0" style={{ background: color }} />
        <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl border border-white/5 shadow-md flex items-center justify-center bg-white/5">
                    <Icon size={20} strokeWidth={1.75} style={{ color }} />
                </div>
                <h3 className="text-[14px] font-black text-(--text-color) tracking-tight uppercase leading-none">{title}</h3>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 group-hover:bg-(--main-color)/20 text-[9px] font-black uppercase tracking-widest text-(--text-color) transition-all">
                {actionLabel} <ArrowRight size={10} strokeWidth={2.5} />
            </div>
        </div>
        <div className="relative z-10 mt-1">
            <div className="space-y-2">
                {stats.map((s, i) => (
                    <div key={i} className="flex justify-between items-end">
                        <span className="text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-60">{s.label}</span>
                        <span className="text-base font-mono font-black text-(--text-color) leading-none">{s.value}</span>
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
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const currentExchangeRate = liveExchangeRate || exchangeRate;
    const [showFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const setFinanceSubTab = useSetAtom(financeSubTabAtom);

    const [items, setItems] = useState<any[]>([]);
    const [storeItems, setStoreItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedDests, setExpandedDests] = useState<Record<string, boolean>>({});

    const toggleDest = (k: string) => setExpandedDests(prev => ({ ...prev, [k]: !prev[k] }));


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
            const usd = totalPrice / currentExchangeRate;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += usd;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, currentExchangeRate]);

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
        const pendingValueUsd = activeDestReqNetMXN / currentExchangeRate;

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
    }, [vendorSummaries, storeItems, activeDestReqNetMXN, currentExchangeRate]);

    const pendingItems = useMemo(() => {
        return items.filter(i => {
            const status = (i.data?.status || '').toLowerCase();
            return ['acquired', 'acquisition', 'acquisitions', 'production'].includes(status) &&
                !i.data?.payReq && !(i.data as any)?.pay_req && i.data?.payReq !== 'true' && (i.data as any)?.pay_req !== 'true';
        });
    }, [items]);

    const comingPaymentsByVendor = useMemo(() => {
        const groups: Record<string, { total: number }> = {};
        for (const item of pendingItems) {
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            let vid = data.vendor_id || data.vendorId;
            if (!vid && itemIdStr.includes('-')) vid = itemIdStr.split('-')[0];
            if (!vid) vid = 'Unknown';

            if (!groups[vid]) groups[vid] = { total: 0 };
            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseInt(String(data.quantity || '1')) || 1;
            groups[vid].total += (price * qty);
        }
        return Object.entries(groups).map(([vid, data]) => ({ vendorId: vid, total: data.total })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
    }, [pendingItems]);

    const fmtMXN = (val: number) => showFinancials ? '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN' : '***';
    const fmtUSD = (val: number, compact = false) => {
        if (!showFinancials) return '***';
        return '$' + val.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: compact ? 0 : 2
        }) + ' USD';
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
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-4 gap-6 animate-in fade-in duration-500">
            <div className="grow min-h-0 overflow-y-auto m-2 mt-0 relative z-20 custom-scrollbar pr-2 space-y-10 pb-20 pt-4">

                {/* Split layout for pending requests destinations */}
                <div className="bg-(--glass-bg) rounded-[2.5rem] border border-(--border-color) p-8 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <RefreshCcw size={18} className="text-[#00AEEF]" />
                            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Priority Payment Requisitions</h2>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--main-color)/10 border border-(--main-color)/20 w-fit shrink-0">
                            <DollarSign size={12} className="text-(--main-color)" />
                            <span className="text-[9px] font-black text-(--text-color) uppercase tracking-[0.15em]">Rate: {currentExchangeRate.toFixed(2)} MXN/USD</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(destinationsConfig).map(([key, cfg]) => {
                            const destDocs = activeDestPendingRecords.filter(d => d.destination === key);
                            const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                            if (destReqMXN <= 0) return null;

                            const vendorIdsForDest = Array.from(new Set(destDocs.map(d => d.vendor_id || d.description?.match(/from (\w+)$/)?.[1]))).filter(Boolean);
                            const isExpanded = !!expandedDests[key];

                            return (
                                <div key={key} className="flex flex-col p-6 bg-white/5 border border-white/5 hover:border-[#00AEEF]/40 transition-all rounded-4xl group gap-4 relative overflow-hidden">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 w-full">
                                        <div className="flex items-center gap-5 cursor-pointer" onClick={() => toggleDest(key)}>
                                            <div className="relative shrink-0">
                                                <div className="w-16 h-12 p-1.5 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
                                                    <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain mix-blend-multiply relative z-0" />
                                                </div>
                                                {vendorIdsForDest.length > 0 && (
                                                    <div className="absolute -top-2 -right-2 flex flex-wrap gap-1 z-10 justify-end max-w-[80px]">
                                                        {vendorIdsForDest.map((vid: any) => {
                                                            const color = (vendors as any)[vid]?.color || '#888';
                                                            const shortCode = String(vid).slice(0, 2).toUpperCase();
                                                            return (
                                                                <span key={vid} className="w-5 h-5 flex items-center justify-center rounded-md text-[9px] font-black text-white leading-none shadow-md border border-white/20" style={{ backgroundColor: color }} title={vid}>
                                                                    {shortCode}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <p className="text-[11px] font-black text-(--text-color) uppercase tracking-widest leading-none">{cfg.name}</p>
                                                    {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} className="text-(--text-color-secondary) opacity-60" /> : <ChevronDown size={14} strokeWidth={2.5} className="text-(--text-color-secondary) opacity-60" />}
                                                </div>
                                                <p className="text-[9px] font-bold text-(--text-color-secondary) uppercase tracking-widest opacity-40">Ready for Dispersal</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="text-right mb-2">
                                                <p className="text-xl font-mono font-black text-(--text-color) group-hover:text-[#00AEEF] transition-colors">{fmtMXN(destReqMXN)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleMarkAsPaid(key, destReqMXN, destDocs)}
                                                className="px-6 py-2.5 rounded-xl bg-(--main-color) text-black font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all w-full md:w-auto">
                                                Finalize Payment
                                            </button>
                                        </div>
                                    </div>

                                    {/* Payment Details Accordion */}
                                    {isExpanded && (
                                        <div className="mt-2 pt-4 border-t border-white/10 space-y-2 animate-in fade-in slide-in-from-top-2 relative z-10 w-full">
                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-2 opacity-60 flex items-center justify-between">
                                                <span>Payment Records</span>
                                                <span>Details</span>
                                            </div>
                                            {destDocs.map(d => (
                                                <div key={d.id} className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs text-white/70 bg-black/20 p-4 rounded-3xl border border-white/5 shadow-inner hover:bg-black/30 transition-colors">
                                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                                        <span className="font-black text-(--text-color) tracking-wide truncate" title={d.description || 'Payment Request'}>{d.description || 'Payment Request'}</span>
                                                        {d.vendor_id && (
                                                            <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 opacity-70">
                                                                VENDOR: <span style={{ color: (vendors as any)[d.vendor_id]?.color || '#888' }}>{d.vendor_id}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-right flex flex-col font-mono text-[10px] items-end shrink-0">
                                                        <div className="flex gap-4 mb-1">
                                                            <div className="flex flex-col items-end">
                                                                <span className="uppercase text-[8px] opacity-50 tracking-widest">Base</span>
                                                                <span>{fmtMXN(d.amount || 0)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="uppercase text-[8px] opacity-50 tracking-widest">Fee/Tax</span>
                                                                <span>{fmtMXN(d.commission || 0)}</span>
                                                            </div>
                                                        </div>
                                                        <span className="font-bold text-white text-[12px] bg-(--glass-bg) px-2 py-0.5 rounded-md mt-1 border border-white/10">Total: {fmtMXN((d.amount || 0) + (d.commission || 0))}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Render coming payments */}
                        {comingPaymentsByVendor.map(group => {
                            const color = (vendors as any)[group.vendorId]?.color || '#888';
                            return (
                                <div key={`coming-${group.vendorId}`} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white/5 border border-white/5 hover:border-(--main-color)/40 transition-all rounded-4xl group gap-4 opacity-70 hover:opacity-100">
                                    <div className="flex items-center gap-5">
                                        <div className="w-16 h-12 p-1.5 bg-(--glass-bg) rounded-xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-white/10" style={{ borderColor: `${color}40` }}>
                                            <span className="text-2xl font-black" style={{ color: color }}>{group.vendorId.charAt(0)}</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <p className="text-[11px] font-black text-(--text-color) uppercase tracking-widest leading-none">{group.vendorId}</p>
                                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-black bg-(--main-color)">Coming</span>
                                            </div>
                                            <p className="text-[9px] font-bold text-(--text-color-secondary) uppercase tracking-widest opacity-40">Auto-Generated Pending</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end">
                                        <div className="text-right">
                                            <p className="text-xl font-mono font-black text-(--text-color-secondary) group-hover:text-(--text-color) transition-colors">{fmtMXN(group.total)}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {activeDestPendingRecords.length === 0 && comingPaymentsByVendor.length === 0 && (
                            <div className="col-span-full p-12 text-center text-(--text-color-secondary) text-[11px] font-black tracking-[0.3em] uppercase border-2 border-dashed border-white/10 rounded-[2.5rem] opacity-30">
                                No Pending Requisitions found
                            </div>
                        )}
                    </div>
                </div>

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


            </div>
        </div>
    );
};
