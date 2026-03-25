import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom,
    financeSubTabAtom, liveExchangeRateAtom, inventoryAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import {
    RefreshCcw, DollarSign, Wallet,
    ShoppingCart, CreditCard, Package, ArrowUpRight, ChevronDown, ChevronUp,
    TrendingUp, AlertCircle
} from 'lucide-react';
import { destinationsConfig } from '../../lib/paymentConfig';
import { pendingCardIcon } from './paymentsIcons.svg';
import { PaymentDestination } from '../../lib/Types';
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

// ── Compact KPI Stat ─────────────────────────────────────────────
const KpiStat = ({ label, value, sub, accent = 'var(--main-color)', onClick }: {
    label: string; value: string; sub?: string; accent?: string; onClick?: () => void;
}) => (
    <div
        onClick={onClick}
        className={`flex flex-col gap-1 p-3 rounded-2xl border border-white/5 bg-white/3 ${onClick ? 'cursor-pointer hover:bg-white/5 hover:border-white/10 transition-all' : ''}`}
    >
        <span className="text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-50 leading-none">{label}</span>
        <span className="text-[15px] font-mono font-black text-(--text-color) leading-none" style={{ color: accent !== 'var(--main-color)' ? accent : undefined }}>{value}</span>
        {sub && <span className="text-[9px] font-mono font-bold text-(--text-color-secondary) opacity-40 leading-none">{sub}</span>}
    </div>
);

// ── Section Header ───────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, badge, color = '#00AEEF', right }: {
    icon: React.FC<any>; title: string; badge?: string; color?: string; right?: React.ReactNode;
}) => (
    <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
            <Icon size={14} strokeWidth={2} style={{ color }} />
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-(--text-color)">{title}</h2>
            {badge && (
                <span className="px-2 py-0.5 rounded-full bg-white/8 text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary)">{badge}</span>
            )}
        </div>
        {right}
    </div>
);

// ── Vendor Dot ───────────────────────────────────────────────────
const VendorDot = ({ vendorId, color, size = 'w-5 h-5', textSize = 'text-[8px]' }: { 
    vendorId: string; color: string; size?: string; textSize?: string;
}) => (
    <span
        className={`inline-flex items-center justify-center ${size} rounded-md ${textSize} font-black text-black shadow-sm border border-black/20 shrink-0`}
        style={{ backgroundColor: color }}
        title={vendorId}
    >
        {String(vendorId).slice(0, 2).toUpperCase()}
    </span>
);

export const ClientOverview: React.FC = () => {
    const db = useDatabase();
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const currentExchangeRate = liveExchangeRate || exchangeRate;
    const [showFinancials] = useAtom(showFinancialsAtom);
    // Read-only — DataSyncProvider is the single writer for financeDataAtom
    const financeData = useAtomValue(financeDataAtom);
    // Read-only — DataSyncProvider drives inventoryAtom via Supabase realtime
    const allInventoryItems = useAtomValue(inventoryAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const setFinanceSubTab = useSetAtom(financeSubTabAtom);

    const [isLoading, setIsLoading] = useState(true);
    const [expandedDests, setExpandedDests] = useState<Record<string, boolean>>({});
    const [isComingExpanded, setIsComingExpanded] = useState(true);

    const toggleDest = (k: string) => setExpandedDests(prev => ({ ...prev, [k]: !prev[k] }));

    // Derive items and storeItems from the centralized inventoryAtom
    const items = useMemo(() =>
        allInventoryItems.filter(i => !['Available', 'Avaiable', 'Catalog'].includes(i.data.status ?? '') && i.data.status !== 'Pending Deletion'),
        [allInventoryItems]
    );
    const storeItems = useMemo(() =>
        allInventoryItems.filter(i => ['Available', 'Avaiable', 'Catalog'].includes(i.data.status ?? '')),
        [allInventoryItems]
    );

    // Show skeleton only on first load
    useEffect(() => { const t = setTimeout(() => setIsLoading(false), 800); return () => clearTimeout(t); }, []);

    const vendorSummaries = useMemo<ClientVendorSummary[]>(() => {
        const map: Record<string, ClientVendorSummary> = {};
        for (const item of items) {
            const norm = item.data;
            const vid = String(norm?.itemId || '').split('-')[0] || '?';
            if (!map[vid]) map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            const price = parseFloat(String(norm?.price || 0));
            const qty = parseInt(String(norm?.quantity || 1)) || 1;
            const totalPrice = price * qty;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += totalPrice / currentExchangeRate;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, currentExchangeRate]);

    const activeDestPendingRecords = useMemo(() =>
        financeData.filter(d => (d.status === 'Requested' || !d.status) && d.destination),
        [financeData]);

    const activeDestReqNetMXN = useMemo(() =>
        activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0),
        [activeDestPendingRecords]);

    const requisitions = useMemo(() => {
        const groups: { key: string; cfg: any; docs: any[]; type: 'grouped' | 'independent'; vendorId?: string }[] = [];
        
        Object.entries(destinationsConfig).forEach(([key, cfg]) => {
            const docs = activeDestPendingRecords.filter(d => d.destination === key);
            if (docs.length === 0) return;

            if (key === PaymentDestination.Fast_Cash_Wire) {
                const byVendor: Record<string, any[]> = {};
                docs.forEach(d => {
                    const vid = d.vendor_id || d.description?.match(/from (\w+)$/)?.[1] || 'Unknown';
                    if (!byVendor[vid]) byVendor[vid] = [];
                    byVendor[vid].push(d);
                });
                Object.entries(byVendor).forEach(([vid, vDocs]) => {
                    groups.push({
                        key: `${key}-${vid}`,
                        cfg: { ...cfg, name: `${cfg.name}` },
                        docs: vDocs,
                        type: 'independent',
                        vendorId: vid
                    });
                });
            } else {
                groups.push({ key, cfg, docs, type: 'grouped' });
            }
        });
        
        return groups.sort((a,b) => {
            const sumA = a.docs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
            const sumB = b.docs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
            return sumB - sumA;
        });
    }, [activeDestPendingRecords]);

    const pendingItems = useMemo(() => items.filter(i => {
        const status = (i.data?.status || '').toLowerCase();
        const payReqStr = String(i.data?.payReq || (i.data as any)?.pay_req || '').toLowerCase();
        return ['acquired', 'acquisition', 'acquisitions', 'production'].includes(status)
            && payReqStr !== 'true' && payReqStr !== 'paid';
    }), [items]);

    const comingPaymentsByVendor = useMemo(() => {
        const groups: Record<string, { total: number; partials: string[] }> = {};
        for (const item of pendingItems) {
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            let vid = data.vendor_id || data.vendorId;
            if (!vid && itemIdStr.includes('-')) vid = itemIdStr.split('-')[0];
            if (!vid) vid = 'Unknown';
            if (!groups[vid]) groups[vid] = { total: 0, partials: [] };
            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseInt(String(data.quantity || '1')) || 1;
            let ratio = 1;
            const payReqStr = String(data.payReq || (data as any).pay_req || '').toLowerCase();
            if (payReqStr.includes('%')) {
                const match = payReqStr.match(/(\d+)%/);
                if (match) { ratio = Math.max(0, (100 - parseInt(match[1])) / 100); groups[vid].partials.push(`${match[1]}% paid on ${itemIdStr}`); }
            }
            groups[vid].total += price * ratio * qty;
        }
        return Object.entries(groups).map(([vid, data]) => ({ vendorId: vid, ...data })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
    }, [pendingItems]);

    const globalTotals = useMemo(() => {
        const totalAcqValueUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);
        const requestedUnpaidMxn = activeDestReqNetMXN;
        const pendingToRequestMxn = comingPaymentsByVendor.reduce((sum, g) => sum + g.total, 0);
        return {
            totalItems: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            totalAcqValueUsd,
            requestedUnpaidUsd: requestedUnpaidMxn / currentExchangeRate,
            requestedUnpaidMxn,
            pendingToRequestUsd: pendingToRequestMxn / currentExchangeRate,
            pendingToRequestMxn,
            totalUnpaidUsd: (requestedUnpaidMxn + pendingToRequestMxn) / currentExchangeRate,
            totalUnpaidMxn: requestedUnpaidMxn + pendingToRequestMxn,
            storeCount: storeItems.reduce((acc, x) => acc + (parseInt(x.data.quantity) || 1), 0),
            newStoreCount: storeItems.filter(x => Date.now() - new Date((x.data as any).updatedAt || (x.data as any).updated_at || 0).getTime() < 7 * 864e5).length,
        };
    }, [vendorSummaries, storeItems, activeDestReqNetMXN, currentExchangeRate, comingPaymentsByVendor]);

    const fmtMXN = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN' : '***';
    const fmtUSD = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD' : '***';
    const fmtUSDCompact = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '***';

    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${p.value} units (${p.percent}%)` },
        legend: {
            orient: 'vertical', right: '0%', top: 'center',
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'inherit' },
            itemWidth: 8, itemHeight: 8,
            formatter: (name: string) => {
                const v = vendorSummaries.find(x => x.vendorId === name);
                return `${name}  ${v?.itemCount ?? ''}`;
            }
        },
        series: [{
            name: 'Units by Vendor', type: 'pie',
            radius: ['40%', '68%'], center: ['35%', '50%'],
            data: vendorSummaries.map(v => ({ name: v.vendorId, value: v.itemCount })),
            label: { show: false },
            itemStyle: { borderRadius: 6, borderColor: 'rgba(0,0,0,0.4)', borderWidth: 1 }
        }],
        color: vendorSummaries.map(v => v.color),
        backgroundColor: 'transparent',
    }), [vendorSummaries]);

    const pieChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: $${p.value.toFixed(0)} USD (${p.percent}%)` },
        legend: {
            orient: 'vertical', right: '0%', top: 'center',
            textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'inherit' },
            itemWidth: 8, itemHeight: 8,
        },
        series: [{
            name: 'Acq Value', type: 'pie',
            radius: ['45%', '72%'], center: ['35%', '50%'],
            data: vendorSummaries.map(v => ({ name: v.vendorId, value: v.totalAcqUsd })),
            label: { show: false },
            itemStyle: { borderRadius: 6, borderColor: 'rgba(0,0,0,0.4)', borderWidth: 1 }
        }],
        color: vendorSummaries.map(v => v.color),
        backgroundColor: 'transparent',
    }), [vendorSummaries]);

    const handleMarkAsPaid = async (destId: string, destReqMXN: number, destDocs: any[]) => {
        const toastId = toast.loading(`Marking ${fmtMXN(destReqMXN)} as Paid...`);
        try {
            const docIds = destDocs.map(d => d.id);
            if (!docIds.length) return;
            const { error: finErr } = await supabase.from('finance').update({ status: 'Paid' }).in('id', docIds);
            if (finErr) throw finErr;
            for (const id of docIds) {
                const localDoc = await db?.finance.findOne({ selector: { id } }).exec();
                if (localDoc) await localDoc.patch({ status: 'Paid' });
            }
            for (const req of destDocs) {
                const ids = req.related_ids || req.related_inventory_ids?.split(',') || [];
                if (ids.length > 0) {
                    const perc = req.description?.match(/(\d+)%/)?.[1];
                    await supabase.from('inventory').update({ pay_req: perc ? `paid ${perc}%` : true }).in('id', ids);
                }
            }
            toast.success('Payment finalized.', { id: toastId });
        } catch (err) {
            console.error(err);
            toast.error('Failed to mark as paid', { id: toastId });
        }
    };

    // ── Skeleton ─────────────────────────────────────────────────
    if (isLoading) return (
        <div className="flex flex-col gap-4 p-4 animate-pulse">
            <div className="grid grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/5 skeleton" />)}
            </div>
            <div className="h-40 rounded-2xl bg-white/5 skeleton" />
            <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/5 skeleton" />)}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            <div className="grow min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 space-y-4 pb-20">

                {/* ── KPI Strip ──────────────────────────────────────────── */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <KpiStat
                        label="Units"
                        value={globalTotals.totalItems.toLocaleString()}
                        accent="#6BCEBB"
                        onClick={() => setActiveView('inventory')}
                    />
                    <KpiStat
                        label="Acq Value"
                        value={fmtUSDCompact(globalTotals.totalAcqValueUsd)}
                        sub={showFinancials ? '$' + globalTotals.totalAcqValueUsd.toFixed(0) + ' USD' : undefined}
                        accent="#6BCEBB"
                    />
                    <KpiStat
                        label="Catalog"
                        value={globalTotals.storeCount.toLocaleString()}
                        sub={globalTotals.newStoreCount > 0 ? `+${globalTotals.newStoreCount} new` : undefined}
                        accent="#34D399"
                        onClick={() => setActiveView('store')}
                    />
                    <KpiStat
                        label="Requested"
                        value={fmtUSDCompact(globalTotals.requestedUnpaidUsd)}
                        sub={showFinancials ? fmtMXN(globalTotals.requestedUnpaidMxn) : undefined}
                        accent="#FBBF24"
                    />
                    <KpiStat
                        label="Pending Req"
                        value={fmtUSDCompact(globalTotals.pendingToRequestUsd)}
                        sub={showFinancials ? fmtMXN(globalTotals.pendingToRequestMxn) : undefined}
                        accent="#F97316"
                    />
                    <KpiStat
                        label="Total Unpaid"
                        value={fmtUSDCompact(globalTotals.totalUnpaidUsd)}
                        sub={showFinancials ? fmtMXN(globalTotals.totalUnpaidMxn) : undefined}
                        accent="#EF4444"
                        onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); }}
                    />
                </div>

                {/* ── Priority Requisitions ───────────────────────────────── */}
                <div>
                    <SectionHeader
                        icon={RefreshCcw}
                        title="Priority Requisitions"
                        badge={requisitions.length > 0 ? `${requisitions.length} entities` : undefined}
                        right={
                            <div className="flex items-center gap-1 text-[9px] font-black text-(--text-color-secondary) opacity-50">
                                <DollarSign size={10} />
                                {currentExchangeRate.toFixed(2)} MXN/USD
                            </div>
                        }
                    />

                    {requisitions.length === 0 ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-(--text-color-secondary) opacity-30">
                            <AlertCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">No Pending Requisitions</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {requisitions.map((req) => {
                                const { key, cfg, docs: destDocs, type, vendorId } = req;
                                const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                                const isExpanded = !!expandedDests[key];
                                const vendorIdsForDest = type === 'independent' ? [vendorId] : Array.from(new Set(
                                    destDocs.map(d => d.vendor_id || d.description?.match(/from (\w+)$/)?.[1])
                                )).filter(Boolean);

                                return (
                                    <div key={key} className={`rounded-3xl border ${type === 'independent' ? 'border-(--main-color)/20 bg-(--main-color)/5 shadow-lg' : 'border-white/10 bg-white/4 shadow-sm'} overflow-hidden transition-all duration-300`}>
                                        {/* Row header - Larger sizing */}
                                        <div className="flex items-center gap-5 p-5 cursor-pointer hover:bg-white/5 transition-all" onClick={() => toggleDest(key)}>
                                            {/* Bank logo */}
                                            <div className="w-14 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                                                <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain mix-blend-multiply" />
                                            </div>

                                            {/* Vendor dots - Larger sizing */}
                                            <div className="flex gap-1.5 shrink-0">
                                                {vendorIdsForDest.slice(0, 4).map((vid: any) => (
                                                    <VendorDot key={vid} vendorId={vid} color={(vendors as any)[vid]?.color || '#888'} size="w-7 h-7" textSize="text-[11px]" />
                                                ))}
                                                {vendorIdsForDest.length > 4 && (
                                                    <span className="text-[10px] font-black text-(--text-color-secondary) opacity-40 self-center">+{vendorIdsForDest.length - 4}</span>
                                                )}
                                            </div>

                                            {/* Name */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[13px] font-black text-(--text-color) uppercase tracking-[0.1em] leading-none truncate">{cfg.name}</p>
                                                    {type === 'independent' && <span className="text-[10px] font-black text-(--main-color) uppercase">{vendorId}</span>}
                                                </div>
                                                <p className="text-[10px] font-bold text-(--text-color-secondary) opacity-40 uppercase tracking-widest mt-1">{destDocs.length} unit{destDocs.length !== 1 ? 's' : ''} in request</p>
                                            </div>

                                            {/* Amounts */}
                                            <div className="text-right shrink-0">
                                                <p className="text-[18px] font-mono font-black text-(--text-color) leading-none">{fmtMXN(destReqMXN)}</p>
                                                <p className="text-[12px] font-mono font-bold text-[#00AEEF] opacity-80 mt-1">{fmtUSD(destReqMXN / currentExchangeRate)}</p>
                                            </div>

                                            {/* Expand + pay */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleMarkAsPaid(key, destReqMXN, destDocs); }}
                                                    className="px-5 py-2.5 rounded-2xl bg-(--main-color) text-black font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md"
                                                >
                                                    Report Payment
                                                </button>
                                                {isExpanded
                                                    ? <ChevronUp size={20} strokeWidth={2.5} className="text-(--text-color-secondary) opacity-40" />
                                                    : <ChevronDown size={20} strokeWidth={2.5} className="text-(--text-color-secondary) opacity-40" />
                                                }
                                            </div>
                                        </div>

                                        {/* Accordion detail rows - Larger sizing */}
                                        {isExpanded && (
                                            <div className="border-t border-white/10 px-6 py-5 space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                                                <div className="grid grid-cols-2 text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) opacity-50 px-2 mb-2">
                                                    <span>Documentation & Description</span><span className="text-right">Net · Commission · Total</span>
                                                </div>
                                                {destDocs.map(d => (
                                                    <div key={d.id} className="flex items-center justify-between gap-5 py-4 px-5 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors shadow-inner">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-bold text-(--text-color) truncate mb-1">{d.description || 'Payment Request'}</p>
                                                            <div className="flex items-center gap-2">
                                                                <VendorDot vendorId={d.vendor_id || '?'} color={(vendors as any)[d.vendor_id]?.color || '#888'} size="w-5 h-5" textSize="text-[8px]" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: (vendors as any)[d.vendor_id]?.color || '#888' }}>{d.vendor_id}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6 text-[12px] font-mono shrink-0">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] opacity-40 uppercase">Net</span>
                                                                <span className="text-(--text-color-secondary) opacity-70">{fmtMXN(d.amount || 0)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] opacity-40 uppercase">Fee</span>
                                                                <span className="text-(--text-color-secondary) opacity-50">+{fmtMXN(d.commission || 0)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end pl-4 border-l border-white/5">
                                                                <span className="text-[8px] opacity-40 uppercase">Total</span>
                                                                <span className="font-bold text-(--text-color) text-[14px]">{fmtMXN((d.amount || 0) + (d.commission || 0))}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Coming Payments ─────────────────────────────────────── */}
                {comingPaymentsByVendor.length > 0 && (
                    <div>
                        <div
                            className="flex items-center justify-between mb-3 cursor-pointer group"
                            onClick={() => setIsComingExpanded(!isComingExpanded)}
                        >
                            <div className="flex items-center gap-2">
                                <Wallet size={14} strokeWidth={2} className="text-[#F97316]" />
                                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-(--text-color) group-hover:text-[#F97316] transition-colors">
                                    To Be Requested
                                </h2>
                                <span className="px-2 py-0.5 rounded-full bg-white/8 text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary)">{comingPaymentsByVendor.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono font-black text-[#F97316]">{fmtUSDCompact(globalTotals.pendingToRequestUsd)}</span>
                                {isComingExpanded
                                    ? <ChevronUp size={14} strokeWidth={2} className="text-(--text-color-secondary) opacity-40" />
                                    : <ChevronDown size={14} strokeWidth={2} className="text-(--text-color-secondary) opacity-40" />
                                }
                            </div>
                        </div>

                        {isComingExpanded && (
                            <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                {comingPaymentsByVendor.map(group => {
                                    const color = (vendors as any)[group.vendorId]?.color || '#888';
                                    return (
                                        <div key={group.vendorId} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-white/6 bg-white/3 hover:bg-white/5 transition-colors">
                                            <VendorDot vendorId={group.vendorId} color={color} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-black text-(--text-color) uppercase tracking-widest leading-none truncate">
                                                    {(vendors as any)[group.vendorId]?.name || group.vendorId}
                                                </p>
                                                {group.partials.length > 0 && (
                                                    <p className="text-[8px] font-bold text-[#f7d666] mt-0.5 truncate opacity-70">{group.partials[0]}{group.partials.length > 1 ? ` +${group.partials.length - 1}` : ''}</p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[12px] font-mono font-black text-(--text-color-secondary) leading-none">{fmtMXN(group.total)}</p>
                                                <p className="text-[9px] font-mono text-[#F97316] mt-0.5">{fmtUSD(group.total / currentExchangeRate)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Charts ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Units by Vendor */}
                    <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                        <SectionHeader icon={TrendingUp} title="Units by Vendor" color="var(--main-color)" />
                        <EChart option={vendorChartOption} style={{ height: '200px' }} />
                    </div>

                    {/* Value Concentration */}
                    <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <SectionHeader icon={TrendingUp} title="Acquisition Value" color="#FBBF24" />
                        </div>
                        <EChart option={pieChartOption} style={{ height: '160px' }} />
                        <div className="mt-2 pt-2 border-t border-white/6 flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40">Total</span>
                            <span className="text-[13px] font-mono font-black text-(--text-color)">{fmtUSD(globalTotals.totalAcqValueUsd)}</span>
                        </div>
                    </div>
                </div>

                {/* ── Vendor Table ────────────────────────────────────────── */}
                {vendorSummaries.length > 0 && (
                    <div className="rounded-2xl border border-white/6 bg-white/3 overflow-hidden">
                        <div className="px-3 pt-3 pb-2">
                            <SectionHeader icon={Package} title="Vendor Breakdown" color="#6BCEBB" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-t border-white/6">
                                        <th className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40">Vendor</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40 text-right">Units</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40 text-right">Acq MXN</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40 text-right">Acq USD</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary) opacity-40 text-right">Share</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vendorSummaries.map(v => {
                                        const totalItems = globalTotals.totalItems || 1;
                                        const share = ((v.itemCount / totalItems) * 100).toFixed(1);
                                        return (
                                            <tr key={v.vendorId} className="border-t border-white/4 hover:bg-white/3 transition-colors group">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <VendorDot vendorId={v.vendorId} color={v.color} />
                                                        <span className="text-[11px] font-black text-(--text-color) uppercase">{v.vendorId}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-right text-[11px] font-mono font-black text-(--text-color)">{v.itemCount.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right text-[10px] font-mono text-(--text-color-secondary) opacity-60">
                                                    {showFinancials ? '$' + v.totalAcqMxn.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '***'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-[11px] font-mono font-black text-[#6BCEBB]">
                                                    {showFinancials ? '$' + v.totalAcqUsd.toFixed(0) : '***'}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="h-1 w-16 rounded-full bg-white/10 overflow-hidden hidden sm:block">
                                                            <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: v.color }} />
                                                        </div>
                                                        <span className="text-[10px] font-mono font-black text-(--text-color-secondary)">{share}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
