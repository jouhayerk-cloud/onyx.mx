import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom,
    financeSubTabAtom, liveExchangeRateAtom, inventoryAtom, logisticsDataAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import {
    RefreshCcw, DollarSign, Wallet,
    ShoppingCart, CreditCard, Package, ArrowUpRight, ChevronDown, ChevronUp,
    TrendingUp, AlertCircle, Grid, Layers
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
            const vid = String(norm?.itemId || norm?.item_id || '').split('-')[0] || '?';
            if (!map[vid]) map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            const price = parseFloat(String(norm?.price_mxn || norm?.price || 0));
            const qty = parseInt(String(norm?.quantity || 1)) || 1;
            const totalPrice = price * qty;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += totalPrice / currentExchangeRate;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, currentExchangeRate]);

    const logisticsData = useAtomValue(logisticsDataAtom);

    // ── Non-Merchandise Breakdown ───────────────────────────────────
    const opsBreakdown = useMemo(() => {
        const cats = { Monthly: 0, Supplies: 0, Labor: 0, Packing: 0, Operations: 0 };
        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            if (sub.includes('month') || sub.includes('mo-exp')) cats.Monthly += (d.amount || 0);
            else if (sub.includes('suppl') || sub.includes('sppl')) cats.Supplies += (d.amount || 0);
            else if (sub.includes('labr') || sub.includes('labor')) cats.Labor += (d.amount || 0);
            else if (sub.includes('pack')) cats.Packing += (d.amount || 0);
            else if (sub.includes('oprt') || sub.includes('operation')) cats.Operations += (d.amount || 0);
        });
        return cats;
    }, [financeData]);

    // ── Merchandise Breakdown ───────────────────────────────────────
    const merchBreakdown = useMemo(() => {
        const stats = { Acquisitions: 0, Production: 0, Partial: 0 };
        items.forEach(i => {
            const status = (i.data?.status || '').toLowerCase();
            const price = parseFloat(String(i.data?.price_mxn || i.data?.price || 0)) * (parseInt(i.data?.quantity || '1') || 1);
            const data = i.data as any;
            const payReqStr = String(data?.payReq || data?.pay_req || '').toLowerCase();
            
            if (status.includes('acq')) stats.Acquisitions += price;
            if (status.includes('prod')) stats.Production += price;
            if (payReqStr.includes('%')) stats.Partial += price;
        });
        return stats;
    }, [items]);

    // ── Attribute Breakdowns ────────────────────────────────────────
    const attributeStats = useMemo(() => {
        const shapeTypeMap: Record<string, number> = {};
        const colorMatMap: Record<string, number> = {};
        
        items.forEach(i => {
            const qty = parseInt(i.data?.quantity || '1') || 1;
            const st = `${i.data?.shape || 'Unknown'} ${i.data?.category || 'Item'}`;
            const cm = `${i.data?.color || 'Unknown'} ${i.data?.material || 'Unknown'}`;
            shapeTypeMap[st] = (shapeTypeMap[st] || 0) + qty;
            colorMatMap[cm] = (colorMatMap[cm] || 0) + qty;
        });

        const topST = Object.entries(shapeTypeMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
        const topCM = Object.entries(colorMatMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
        return { topST, topCM };
    }, [items]);


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

                {/* ── TOP TRACKING & KPI STRIP ────────────────────────────────── */}
                <div className="flex flex-col gap-6 mb-6">
                    {/* High-Level Overview Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        <div className="flex flex-col p-4 rounded-[2rem] bg-white/[0.03] backdrop-blur-3xl">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Crates</span>
                            <span className="text-2xl font-black text-white leading-none">{logisticsData.filter(d => d.type === 'crate').length}</span>
                            <span className="text-[9px] font-bold text-white/20 mt-1 uppercase tracking-widest">{logisticsData.filter(d => d.type === 'pallet').length} Pallets</span>
                        </div>
                        <KpiStat label="Units" value={globalTotals.totalItems.toLocaleString()} accent="#6BCEBB" onClick={() => setActiveView('inventory')} />
                        <KpiStat label="Acq Value" value={fmtUSDCompact(globalTotals.totalAcqValueUsd)} accent="#6BCEBB" />
                        <KpiStat label="Catalog" value={globalTotals.storeCount.toLocaleString()} accent="#34D399" onClick={() => setActiveView('store')} />
                        <KpiStat label="Requested" value={fmtUSDCompact(globalTotals.requestedUnpaidUsd)} sub={showFinancials ? fmtMXN(globalTotals.requestedUnpaidMxn) : undefined} accent="#FBBF24" />
                        <KpiStat label="Pending Req" value={fmtUSDCompact(globalTotals.pendingToRequestUsd)} sub={showFinancials ? fmtMXN(globalTotals.pendingToRequestMxn) : undefined} accent="#F97316" />
                        <KpiStat label="Total Unpaid" value={fmtUSDCompact(globalTotals.totalUnpaidUsd)} accent="#EF4444" onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); }} />
                    </div>

                    {/* Non-Merch vs Merch Breakdown Panel */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Non-Merchandise Tracking */}
                        <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl">
                            <SectionHeader icon={CreditCard} title="Non-Merchandise Tracking" color="#00AEEF" />
                            <div className="grid grid-cols-5 gap-4 mt-2">
                                {[
                                    { label: 'Monthly', val: opsBreakdown.Monthly, color: 'text-sky-400' },
                                    { label: 'Supplies', val: opsBreakdown.Supplies, color: 'text-emerald-400' },
                                    { label: 'Labor', val: opsBreakdown.Labor, color: 'text-amber-400' },
                                    { label: 'Packing', val: opsBreakdown.Packing, color: 'text-rose-400' },
                                    { label: 'Ops', val: opsBreakdown.Operations, color: 'text-indigo-400' },
                                ].map(c => (
                                    <div key={c.label} className="flex flex-col gap-1">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20">{c.label}</span>
                                        <span className={`text-[12px] font-mono font-black ${c.color}`}>{fmtUSDCompact(c.val / currentExchangeRate)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Merchandise Summary */}
                        <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl px-2">
                            <SectionHeader icon={Package} title="Merchandise Status" color="#6BCEBB" />
                            <div className="grid grid-cols-3 gap-4 mt-2 px-4">
                                <div>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Acquisitions</span>
                                    <p className="text-[12px] font-mono font-black text-white">{fmtUSDCompact(merchBreakdown.Acquisitions / currentExchangeRate)}</p>
                                </div>
                                <div>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Production</span>
                                    <p className="text-[12px] font-mono font-black text-white">{fmtUSDCompact(merchBreakdown.Production / currentExchangeRate)}</p>
                                </div>
                                <div className="border-l border-white/5 pl-4">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-rose-400/50">Partial Pymts</span>
                                    <p className="text-[12px] font-mono font-black text-rose-400">{fmtUSDCompact(merchBreakdown.Partial / currentExchangeRate)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── UNIFIED PRIORITY QUEUE ───────────────────────────────── */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                        <SectionHeader 
                            icon={RefreshCcw} 
                            title="Active Request Queue" 
                            badge={requisitions.length + comingPaymentsByVendor.length > 0 ? `${requisitions.length + comingPaymentsByVendor.length} elements` : undefined}
                        />
                        <div className="text-[10px] font-mono font-black text-white/20">1 USD = {currentExchangeRate.toFixed(2)} MXN</div>
                    </div>

                    <div className="flex flex-col gap-2">
                        {/* Requisitions (Paid soon) */}
                        {requisitions.map((req) => {
                            const { key, cfg, docs: destDocs, type, vendorId } = req;
                            const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                            const isExpanded = !!expandedDests[key];
                            const vendorIdsForDest = type === 'independent' ? [vendorId] : Array.from(new Set(
                                destDocs.map(d => d.vendor_id || d.description?.match(/from (\w+)$/)?.[1])
                            )).filter(Boolean);

                            return (
                                <div key={key} className="group relative rounded-[2rem] bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-500 overflow-hidden">
                                    <div className="flex items-center gap-5 p-5 cursor-pointer" onClick={() => toggleDest(key)}>
                                        <div className="w-12 h-9 bg-white rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                                            <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain mix-blend-multiply" />
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            {vendorIdsForDest.slice(0, 3).map((vid: any) => (
                                                <VendorDot key={vid} vendorId={vid} color={(vendors as any)[vid]?.color || '#888'} size="w-6 h-6" />
                                            ))}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-black text-white uppercase tracking-widest truncate">{cfg.name} {type === 'independent' ? `· ${vendorId}` : ''}</p>
                                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">{destDocs.length} units</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[16px] font-mono font-black text-white leading-none">{fmtMXN(destReqMXN)}</p>
                                            <p className="text-[11px] font-mono font-bold text-sky-400 mt-1">{fmtUSD(destReqMXN / currentExchangeRate)}</p>
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleMarkAsPaid(key, destReqMXN, destDocs); }}
                                            className="px-4 py-2 rounded-xl bg-(--main-color) text-black font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all ml-4"
                                        >
                                            Mark Paid
                                        </button>
                                        {isExpanded ? <ChevronUp size={16} className="text-white/20" /> : <ChevronDown size={16} className="text-white/20" />}
                                    </div>

                                    {isExpanded && (
                                        <div className="px-6 pb-6 pt-2 space-y-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                                            {destDocs.map(d => (
                                                <div key={d.id} className="flex items-center justify-between py-3 px-4 rounded-2xl bg-black/20 text-[11px] font-mono">
                                                    <span className="text-white/60 truncate max-w-[200px]">{d.description || 'Payment'}</span>
                                                    <div className="flex gap-4">
                                                        <span className="text-white/30">{fmtMXN(d.amount || 0)}</span>
                                                        <span className="text-white/20">+{fmtMXN(d.commission || 0)}</span>
                                                        <span className="font-bold text-white">{fmtMXN((d.amount || 0) + (d.commission || 0))}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Upcoming (To be requested) */}
                        {comingPaymentsByVendor.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 px-2 mb-3">Upcoming Requests</p>
                                <div className="flex flex-col gap-2">
                                    {comingPaymentsByVendor.map(group => {
                                        const color = (vendors as any)[group.vendorId]?.color || '#888';
                                        return (
                                            <div key={group.vendorId} className="flex items-center gap-4 px-5 py-4 rounded-[2rem] bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                                                <VendorDot vendorId={group.vendorId} color={color} size="w-8 h-8" textSize="text-[10px]" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-black text-white uppercase tracking-widest truncate">{(vendors as any)[group.vendorId]?.name || group.vendorId}</p>
                                                    <p className="text-[9px] font-bold text-amber-400 mt-1 uppercase tracking-widest opacity-60">Pending Request</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[14px] font-mono font-black text-white/50 leading-none">{fmtMXN(group.total)}</p>
                                                    <p className="text-[10px] font-mono text-amber-500/50 mt-1">{fmtUSD(group.total / currentExchangeRate)}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── VISUALIZATION GRID ───────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Units by Vendor - Horizontal Segmented Bar */}
                    <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl">
                        <SectionHeader icon={TrendingUp} title="Units Share" color="#6BCEBB" />
                        <div className="mt-4 flex flex-col gap-4">
                            <div className="h-6 w-full rounded-2xl overflow-hidden flex shadow-2xl">
                                {vendorSummaries.map((v, idx) => {
                                    const share = (v.itemCount / globalTotals.totalItems) * 100;
                                    return (
                                        <div 
                                            key={v.vendorId} 
                                            style={{ width: `${share}%`, backgroundColor: v.color }} 
                                            className="h-full hover:brightness-125 transition-all cursor-pointer group relative"
                                        >
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 bg-black/80 backdrop-blur-md px-2 py-1 rounded text-[10px] whitespace-nowrap z-10 pointer-events-none font-mono">
                                                {v.vendorId}: {v.itemCount} units ({share.toFixed(1)}%)
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                {vendorSummaries.slice(0, 8).map(v => (
                                    <div key={v.vendorId} className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: v.color }} />
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest truncate">{v.vendorId}</span>
                                        <span className="text-[10px] font-mono font-bold text-white/20 ml-auto">{v.itemCount}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Quality & Type Breakdown */}
                    <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl">
                        <SectionHeader icon={Grid} title="Shape + Category" color="#F97316" />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4">
                            {attributeStats.topST.map(([label, count]) => (
                                <div key={label} className="flex items-center justify-between border-b border-white/5 pb-1">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest truncate max-w-[120px]">{label}</span>
                                    <span className="text-[10px] font-mono font-black text-white">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Color & Material Analysis */}
                    <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl">
                        <SectionHeader icon={Layers} title="Material + Color" color="#EF4444" />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4">
                            {attributeStats.topCM.map(([label, count]) => (
                                <div key={label} className="flex items-center justify-between border-b border-white/5 pb-1">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest truncate max-w-[120px]">{label}</span>
                                    <span className="text-[10px] font-mono font-black text-white">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Value Distribution - Integrated Pie + Context */}
                    <div className="flex flex-col p-6 rounded-[2.5rem] bg-white/[0.02] backdrop-blur-2xl">
                        <SectionHeader icon={DollarSign} title="Value Concentration" color="#FBBF24" />
                        <div className="flex flex-row items-center gap-4 mt-2">
                            <div className="w-1/2">
                                <EChart option={pieChartOption} style={{ height: '180px' }} />
                            </div>
                            <div className="w-1/2 flex flex-col gap-3">
                                {vendorSummaries.slice(0, 4).map(v => (
                                    <div key={v.vendorId} className="flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{v.vendorId}</span>
                                            <span className="text-[10px] font-mono font-black text-white">{fmtUSDCompact(v.totalAcqUsd)}</span>
                                        </div>
                                        <div className="h-0.5 w-full bg-white/5 mt-1">
                                            <div className="h-full" style={{ width: `${(v.totalAcqUsd / globalTotals.totalAcqValueUsd * 100)}%`, backgroundColor: v.color }} />
                                        </div>
                                    </div>
                                ))}
                                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Total Value</span>
                                    <span className="text-[14px] font-mono font-black text-emerald-400">{fmtUSDCompact(globalTotals.totalAcqValueUsd)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>


            </div>
        </div>
    );
};
