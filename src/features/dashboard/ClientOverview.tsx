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
    TrendingUp, AlertCircle, Grid, Layers, Calendar, Users, Archive, Cpu, Box
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
        className={`group flex flex-col gap-1.5 p-4 rounded-2xl border border-white/10 bg-[#1C212D]/80 hover:bg-[#1C212D] hover:border-white/20 hover:scale-[1.02] transform transition-all duration-300 shadow-xl shadow-black/20 ${onClick ? 'cursor-pointer' : ''}`}
    >
        <span className="text-[9px] font-black uppercase tracking-widest text-white/20 leading-none group-hover:text-white/40 transition-colors">{label}</span>
        <span className="text-[18px] font-mono font-black text-white leading-none drop-shadow-sm" style={{ color: accent !== 'var(--main-color)' ? accent : undefined }}>{value}</span>
        {sub && <span className="text-[9px] font-mono font-bold text-white/20 leading-none mt-1">{sub}</span>}
    </div>
);

// ── Section Header ───────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, badge, color = '#00AEEF', right }: {
    icon: React.FC<any>; title: string; badge?: string; color?: string; right?: React.ReactNode;
}) => (
    <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
            <Icon size={14} strokeWidth={2.5} style={{ color }} />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-white/80">{title}</h2>
            {badge && (
                <span className="px-2 py-0.5 rounded-full bg-white/8 text-[9px] font-black uppercase tracking-widest text-white/40">{badge}</span>
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
        const cats = { 
            Monthly: { mxn: 0, usd: 0 }, 
            Supplies: { mxn: 0, usd: 0 }, 
            Labor: { mxn: 0, usd: 0 }, 
            Packing: { mxn: 0, usd: 0 }, 
            Operations: { mxn: 0, usd: 0 } 
        };
        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            const amtMxn = (d.amount || 0) + (d.commission || 0);
            const amtUsd = amtMxn / (d.exchange_rate || currentExchangeRate || 20);
            
            if (sub.includes('month') || sub.includes('mo-exp')) { cats.Monthly.mxn += amtMxn; cats.Monthly.usd += amtUsd; }
            else if (sub.includes('suppl') || sub.includes('sppl')) { cats.Supplies.mxn += amtMxn; cats.Supplies.usd += amtUsd; }
            else if (sub.includes('labr') || sub.includes('labor')) { cats.Labor.mxn += amtMxn; cats.Labor.usd += amtUsd; }
            else if (sub.includes('pack')) { cats.Packing.mxn += amtMxn; cats.Packing.usd += amtUsd; }
            else if (sub.includes('oprt') || sub.includes('operation')) { cats.Operations.mxn += amtMxn; cats.Operations.usd += amtUsd; }
        });
        return cats;
    }, [financeData, currentExchangeRate]);

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
            
            // For partials, we track the disbursed amount vs total
            if (payReqStr.includes('%')) {
                const match = payReqStr.match(/(\d+)%/);
                if (match) {
                    const perc = parseInt(match[1]);
                    stats.Partial += (price * (perc / 100));
                }
            }
        });
        return stats;
    }, [items]);

    // ── Attribute Breakdowns ────────────────────────────────────────
    const attributeStats = useMemo(() => {
        const shapeTypeMap: Record<string, number> = {};
        const colorMatMap: Record<string, number> = {};
        
        items.forEach(i => {
            const qty = parseInt(i.data?.quantity || '1') || 1;
            const st = `${i.data?.shape || ''} ${i.data?.description || i.data?.category || 'Item'}`.trim();
            const cm = `${i.data?.color || 'Unknown'} ${i.data?.material || 'Unknown'}`.trim();
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
        
        const crates = logisticsData.filter(d => (d.type || '').toLowerCase().includes('crate'));
        const packedCrates = crates.filter(c => (c as any).inventoryItems?.length > 0).length;
        const freeCrates = crates.length - packedCrates;
        
        // Find most unique dimensions
        const dims = Array.from(new Set(logisticsData.map(d => `${d.w || 0}x${d.h || 0}x${d.d || 0}`))).slice(0, 3).join(', ');

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
            packedCrates,
            freeCrates,
            logisticsDims: dims
        };
    }, [vendorSummaries, storeItems, activeDestReqNetMXN, currentExchangeRate, comingPaymentsByVendor, logisticsData]);

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

                {/* ── TOP LOGISTICS & KPI STRIP ────────────────────────────────── */}
                <div className="flex flex-col gap-4 mb-6">
                    {/* Standalone Logistics Status Panel */}
                    <div className="flex flex-col p-6 rounded-3xl bg-[#1C212D] backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Package size={120} strokeWidth={1} />
                        </div>
                        <SectionHeader icon={Package} title="Storage & Logistics" color="#6BCEBB" right={
                            <div className="text-[9px] font-black text-white/20 uppercase tracking-widest">Active Units Telemetry</div>
                        } />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mt-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Total Crates</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-white leading-none">{logisticsData.filter(d => d.type === 'crate').length}</span>
                                    <span className="text-[14px] font-black text-[#6BCEBB] uppercase">Verified</span>
                                </div>
                            </div>
                            <div className="flex flex-col border-l border-white/5 pl-8">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Inventory Status</span>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-mono font-black text-white/40">Packed</span>
                                        <span className="text-[11px] font-mono font-black text-emerald-400">{globalTotals.packedCrates}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-mono font-black text-white/20">Free (Empty)</span>
                                        <span className="text-[11px] font-mono font-black text-white/40">{globalTotals.freeCrates}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col border-l border-white/5 pl-8">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Common Sizes</span>
                                <p className="text-[11px] font-mono font-black text-white/40 leading-relaxed uppercase">{globalTotals.logisticsDims || 'Calculating...'}</p>
                            </div>
                            <div className="flex flex-col border-l border-white/5 pl-8">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Fleet layer</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white leading-none">{logisticsData.filter(d => d.type === 'pallet').length}</span>
                                    <span className="text-[11px] font-black text-white/20 uppercase tracking-widest">Pallets</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* High-Density Financial KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <KpiStat label="Units" value={globalTotals.totalItems.toLocaleString()} accent="#6BCEBB" onClick={() => setActiveView('inventory')} />
                        <KpiStat label="Acq Value" value={fmtUSDCompact(globalTotals.totalAcqValueUsd)} accent="#6BCEBB" />
                        <KpiStat label="Requested" value={fmtUSDCompact(globalTotals.requestedUnpaidUsd)} sub={showFinancials ? fmtMXN(globalTotals.requestedUnpaidMxn) : undefined} accent="#FBBF24" />
                        <KpiStat label="Pending Req" value={fmtUSDCompact(globalTotals.pendingToRequestUsd)} sub={showFinancials ? fmtMXN(globalTotals.pendingToRequestMxn) : undefined} accent="#F97316" />
                        <KpiStat label="Total Unpaid" value={fmtUSDCompact(globalTotals.totalUnpaidUsd)} accent="#EF4444" onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); }} />
                    </div>

                    {/* Expenses Panel */}
                    <div className="flex flex-col p-6 rounded-3xl bg-[#1C212D]/60 backdrop-blur-xl border border-white/10 col-span-1 lg:col-span-2">
                        <SectionHeader icon={CreditCard} title="Expenses" color="#00AEEF" />
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4">
                                {[
                                    { label: 'Monthly', v: opsBreakdown.Monthly, color: 'text-sky-400', icon: Calendar },
                                    { label: 'Supplies', v: opsBreakdown.Supplies, color: 'text-emerald-400', icon: Box },
                                    { label: 'Labor', v: opsBreakdown.Labor, color: 'text-amber-400', icon: Users },
                                    { label: 'Packing', v: opsBreakdown.Packing, color: 'text-rose-400', icon: Archive },
                                    { label: 'Operations', v: opsBreakdown.Operations, color: 'text-indigo-400', icon: Cpu },
                                ].map(c => (
                                    <div key={c.label} className="group flex flex-col p-2 transition-all">
                                        <div className="flex items-center gap-2 mb-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                            <c.icon size={10} className={c.color} />
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white grow">{c.label}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`text-xl font-mono font-black ${c.color} flex items-baseline gap-1`}>
                                                {fmtUSDCompact(c.v.usd).replace('$','')}
                                                <span className="text-[8px] opacity-40 font-black uppercase tracking-[0.4em]">USD</span>
                                            </span>
                                            <span className="text-[11px] font-mono font-bold text-white/20 flex items-baseline gap-1">
                                                {fmtMXN(c.v.mxn).replace(' MXN','').replace('$','')}
                                                <span className="text-[7px] opacity-40 uppercase tracking-widest">MXN</span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                </div>

                {/* ── UNIFIED PRIORITY QUEUE ───────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <SectionHeader 
                                icon={RefreshCcw} 
                                title="Active Request Queue" 
                                badge={requisitions.length > 0 ? `${requisitions.length} elements` : undefined}
                            />
                            <div className="text-[10px] font-mono font-black text-white/20">1 USD = {currentExchangeRate.toFixed(2)} MXN</div>
                        </div>

                        <div className="flex flex-col gap-2">
                            {requisitions.map((req) => {
                                const { key, cfg, docs: destDocs, type, vendorId } = req;
                                const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                                const isExpanded = !!expandedDests[key];
                                const vendorIdsForDest = type === 'independent' ? [vendorId] : Array.from(new Set(
                                    destDocs.map(d => d.vendor_id || d.description?.match(/from (\w+)$/)?.[1])
                                )).filter(Boolean);

                                return (
                                    <div key={key} className="group relative rounded-4xl bg-white/3 hover:bg-white/6 transition-all duration-500 overflow-hidden">
                                        <div className="flex items-center gap-5 p-5 cursor-pointer" onClick={() => toggleDest(key)}>
                                            <div className="w-16 h-10 flex items-center justify-center overflow-hidden shrink-0">
                                                <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain brightness-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform" />
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
                                                className="px-3 py-1.5 rounded-xl bg-(--main-color) text-black font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all ml-4"
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
                        </div>
                    </div>

                    {/* Upcoming (To be requested) */}
                    {comingPaymentsByVendor.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between px-2">
                                <SectionHeader 
                                    icon={ArrowUpRight} 
                                    title="Upcoming Payments" 
                                    badge={`${comingPaymentsByVendor.length} sources`}
                                    color="#FBBF24"
                                />
                            </div>
                             <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {comingPaymentsByVendor.map(group => {
                                    const color = (vendors as any)[group.vendorId]?.color || '#888';
                                    return (
                                        <div key={group.vendorId} className="group flex flex-col p-4 rounded-3xl bg-white/[0.02] hover:bg-white/5 transition-all border border-white/5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <VendorDot vendorId={group.vendorId} color={color} size="w-6 h-6" textSize="text-[8px]" />
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest truncate">{(vendors as any)[group.vendorId]?.name || group.vendorId}</span>
                                            </div>
                                            <div className="flex flex-col grow justify-end">
                                                <p className="text-[15px] font-mono font-black text-white leading-none">{fmtMXN(group.total).replace(' MXN','')}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500/80 text-[8px] font-black uppercase tracking-widest">Pending</span>
                                                    <span className="text-[10px] font-mono font-bold text-sky-400 group-hover:text-sky-300 transition-colors">{fmtUSD(group.total / currentExchangeRate).replace(' USD','')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── DISTRIBUTION ANALYSIS ───────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-8 rounded-3xl bg-[#1C212D] backdrop-blur-xl border border-white/10 shadow-2xl">
                    <div className="col-span-1 lg:col-span-2">
                        <SectionHeader icon={TrendingUp} title="Global Distribution Analysis" color="#6BCEBB" />
                    </div>

                    {/* Units by Vendor - Horizontal Segmented Bar - FULL WIDTH */}
                    <div className="flex flex-col col-span-1 lg:col-span-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Units Share by Vendor</span>
                        <div className="flex flex-col gap-4">
                            <div className="h-4 w-full rounded-2xl overflow-hidden flex shadow-2xl bg-white/5">
                                {vendorSummaries.map((v, idx) => {
                                    const share = (v.itemCount / globalTotals.totalItems) * 100;
                                    return (
                                        <div 
                                            key={v.vendorId} 
                                            style={{ width: `${share}%`, backgroundColor: v.color }} 
                                            className="h-full hover:brightness-125 transition-all cursor-pointer group relative"
                                        >
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap z-50 pointer-events-none font-mono border border-white/10 shadow-2xl">
                                                {v.vendorId}: {v.itemCount} units ({share.toFixed(1)}%)
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                                {vendorSummaries.map(v => (
                                    <div key={v.vendorId} className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: v.color }} />
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest truncate">{v.vendorId}</span>
                                        <span className="text-[10px] font-mono font-bold text-white/60 ml-auto">{v.itemCount}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Value Distribution - Integrated Pie + Context */}
                    <div className="flex flex-col col-span-1 lg:col-span-2 pt-12 border-t border-white/5 mt-4">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Portfolio Concentration Analysis</span>
                        <div className="flex flex-row items-center gap-12">
                            <div className="w-1/2">
                                <EChart option={pieChartOption} style={{ height: '240px' }} />
                            </div>
                            <div className="w-1/2 grid grid-cols-2 gap-8">
                                {vendorSummaries.slice(0, 6).map(v => (
                                    <div key={v.vendorId} className="flex flex-col border-b border-white/5 pb-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{v.vendorId}</span>
                                            <span className="text-[11px] font-mono font-black text-white">{fmtUSDCompact(v.totalAcqUsd)}</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full" style={{ width: `${(v.totalAcqUsd / globalTotals.totalAcqValueUsd * 100)}%`, backgroundColor: v.color }} />
                                        </div>
                                    </div>
                                ))}
                                <div className="col-span-2 pt-4 flex items-center justify-between">
                                    <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.4em]">Total Portfolio Value</span>
                                    <div className="text-right">
                                        <span className="text-[20px] font-mono font-black text-emerald-400 block">{fmtUSDCompact(globalTotals.totalAcqValueUsd)}</span>
                                        <span className="text-[10px] font-mono text-white/20">{fmtMXN(globalTotals.totalAcqValueUsd * currentExchangeRate)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Material & Color Analysis Graph */}
                    <div className="flex flex-col p-8 rounded-3xl bg-[#1C212D] backdrop-blur-xl col-span-1 lg:col-span-2 border border-white/10 shadow-2xl">
                        <SectionHeader icon={Layers} title="Material + Color Attribution" color="#EF4444" />
                        <div className="mt-6 flex flex-col gap-6">
                            {/* Segmented Horizontal Bar */}
                            <div className="h-2 w-full rounded-full overflow-hidden flex bg-white/5">
                                {attributeStats.topCM.map(([label, count], idx) => {
                                    const share = (count / globalTotals.totalItems) * 100;
                                    const hue = (idx * 45) % 360;
                                    return (
                                        <div 
                                            key={label}
                                            style={{ width: `${share}%`, backgroundColor: `hsla(${hue}, 70%, 50%, 0.8)` }}
                                            className="h-full hover:brightness-125 transition-all cursor-pointer group relative"
                                        >
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap z-50 pointer-events-none font-mono border border-white/10 shadow-2xl">
                                                {label}: {count} units
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Detailed Grid Map */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                                {attributeStats.topCM.map(([label, count], idx) => {
                                    const hue = (idx * 45) % 360;
                                    return (
                                        <div key={label} className="flex flex-col group">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `hsla(${hue}, 80%, 60%, 1)` }} />
                                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate group-hover:text-white/60 transition-colors">{label}</span>
                                            </div>
                                            <span className="text-[12px] font-mono font-black text-white/10 group-hover:text-white/40">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
