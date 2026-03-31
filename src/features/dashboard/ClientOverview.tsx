import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom,
    financeSubTabAtom, paymentCategoryFilterAtom, liveExchangeRateAtom, inventoryAtom, storeInventoryAtom, logisticsDataAtom,
    inventoryArtifactConfigAtom, currencyModeAtom, paymentsArtifactConfigAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import {
    RefreshCcw, DollarSign, Wallet, Activity,
    ShoppingCart, CreditCard, Package, ArrowUpRight, ChevronDown, ChevronUp,
    TrendingUp, AlertCircle, Grid, Layers, Calendar, Users, Archive, Cpu, Box
} from 'lucide-react';
import { destinationsConfig } from '../../lib/paymentConfig';
import { PaymentDestination } from '../../lib/Types';
import { default as toast } from 'react-hot-toast';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
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
        className={`group flex flex-col gap-1 p-3 rounded-xl border border-(--border-color) bg-(--sidebar-bg) hover:bg-(--app-bg-solid) hover:border-(--main-color)/30 hover:shadow-lg transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
    >
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-(--text-color-secondary) opacity-40 leading-none group-hover:opacity-100 transition-opacity">{label}</span>
        <span className="text-[20px] font-mono font-black text-(--text-color) leading-none drop-shadow-sm" style={{ color: accent !== 'var(--main-color)' ? accent : undefined }}>{value}</span>
        {sub && <span className="text-[10px] font-mono font-bold text-(--text-color-secondary) opacity-30 leading-none mt-0.5">{sub}</span>}
    </div>
);

// ── Section Header ───────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, badge, color = 'var(--main-color)', right, onToggle, isCollapsed, compactSummary, preTitleContent }: {
    icon: React.FC<any>; title: string; badge?: string; color?: string; right?: React.ReactNode; 
    onToggle?: () => void; isCollapsed?: boolean; compactSummary?: React.ReactNode;
    preTitleContent?: React.ReactNode;
}) => (
    <div className={`flex items-center justify-between ${isCollapsed ? '' : 'mb-3'}`}>
        <div className="flex items-center gap-2 cursor-pointer group/header" onClick={onToggle}>
            <div className={`p-1.5 rounded-lg transition-colors ${isCollapsed ? 'bg-white/5' : ''}`} style={{ color: isCollapsed ? '#fff' : color }}>
                <Icon size={14} strokeWidth={2.5} />
            </div>
            {preTitleContent && (
                <div className="flex items-center h-full">
                    {preTitleContent}
                </div>
            )}
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color) opacity-80 group-hover/header:opacity-100 transition-opacity">{title}</h2>
                    {badge && (
                        <span className="px-1.5 py-0.5 rounded bg-(--text-color)/5 text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary)">{badge}</span>
                    )}
                    {onToggle && (
                        <div className="text-white/20 group-hover/header:text-white/60 transition-colors">
                            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </div>
                    )}
                </div>
                {isCollapsed && compactSummary && (
                    <div className="mt-0.5 animate-in fade-in slide-in-from-top-1 duration-300">
                        {compactSummary}
                    </div>
                )}
            </div>
        </div>
        {!isCollapsed && right}
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

// ── Compact Financials Graph ──────────────────────────────────────
const CompactFinancialsGraph = ({ 
    metrics, currentExchangeRate, mode, hideLegend = false, fullWidth = false
}: { 
    metrics: { 
        mexTotal: number; 
        paidAcq: number;
        paidExp: number;
        reqMerch: number;
        reqExp: number;
        pending: number;
    };
    currentExchangeRate: number;
    mode: 'USD' | 'MXN';
    hideLegend?: boolean;
    fullWidth?: boolean;
}) => {
    const max = metrics.mexTotal || 1;
    const getPercent = (v: number) => (v / max) * 100;

    const fmt = (v: number) => {
        const value = mode === 'USD' ? v / currentExchangeRate : v;
        if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
        if (value >= 1_000) return (value / 1_000).toFixed(0) + 'K';
        return value.toFixed(0);
    };

    const paidExpWidth = getPercent(metrics.paidExp);
    const paidAcqWidth = getPercent(metrics.paidAcq);
    const reqExpWidth = getPercent(metrics.reqExp);
    const reqMerchWidth = getPercent(metrics.reqMerch);
    const pendingWidth = getPercent(metrics.pending);

    const sections = [
        { label: 'GREEN (PAID ACQ.)', val: metrics.paidAcq, color: '#22c55e', width: paidAcqWidth },
        { label: 'YELLOW (REQ MERCH.)', val: metrics.reqMerch, color: '#eab308', width: reqMerchWidth },
        { label: 'RED (PENDING)', val: metrics.pending, color: '#ef4444', width: pendingWidth },
        { label: 'MAGENTA (REQ EXP.)', val: metrics.reqExp, color: '#d946ef', width: reqExpWidth },
        { label: 'BLUE (PAID EXP.)', val: metrics.paidExp, color: '#3b82f6', width: paidExpWidth },
    ];
    return (
        <div className={`flex flex-col ${hideLegend ? (fullWidth ? 'w-full' : '') : 'mt-1 min-w-[340px]'}`}>
            {/* Unified 5-Segment Stacked Bar */}
            <div className={`relative ${fullWidth ? 'h-6 w-full' : (hideLegend ? 'h-5 w-[140px]' : 'h-6 w-full')} bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner flex`}>
                {sections.map((s, i) => (
                    s.width > 0 && (
                        <div 
                            key={s.label}
                            className={`h-full transition-all duration-1000 relative overflow-hidden ${i > 0 ? 'border-l border-white/10' : ''}`}
                            style={{ width: `${s.width}%`, backgroundColor: s.color }}
                        >
                            <div className="absolute inset-0 bg-linear-to-r from-white/10 to-transparent" />
                        </div>
                    )
                ))}
            </div>

            {/* Segment Tags Underneath */}
            <div className="flex w-full mt-1.5 px-1">
                {sections.map((s, i) => (
                    s.width > 2 && (
                        <div 
                            key={`tag-${s.label}`}
                            className="flex flex-col items-center justify-start overflow-hidden px-0.5"
                            style={{ width: `${s.width}%` }}
                        >
                            <span 
                                className="text-[7px] font-black uppercase tracking-tighter truncate w-full text-center leading-none opacity-80"
                                style={{ color: s.color }}
                            >
                                {s.label.includes('(') ? s.label.match(/\((.*?)\)/)?.[1].replace('.', '') : s.label}
                            </span>
                        </div>
                    )
                ))}
            </div>
            
            {/* Legend & Amount Tags */}
            {!hideLegend && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-3 pt-2 border-t border-white/5">
                    {sections.map(s => (
                        <div key={s.label} className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="text-[7px] font-black text-white/40 uppercase tracking-widest">{s.label.split(' (')[0]}</span>
                            <span className="text-[9px] font-mono font-black text-white/90">
                                <span className="text-[7px] mr-1 opacity-40">{mode}</span>
                                {fmt(s.val)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Large Crate Wireframe ──────────────────────────────────────
const LargeCrateWireframe: React.FC<{ w?: number; l?: number; h?: number; type?: string; size?: number; color?: string }> = ({
    w = 60, l = 60, h = 60, type = 'crate', size = 130, color = 'var(--main-color)'
}) => {
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale  = (size * 0.33) / maxDim;
    const dw = Math.round(w    * scale);
    const dh = Math.round(visH * scale);
    const depth = Math.round(l * scale * 0.4);
    const svgW = dw + depth + 8, svgH = dh + depth + 8;
    const x0 = 4, y0 = depth + 4, x1 = x0 + dw, y2 = y0 + dh;
    const dx = depth, dy = -depth;
    return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ filter: `drop-shadow(0 0 10px ${color})`, overflow: 'visible' }}>
            <line x1={x0+dx} y1={y0+dy} x2={x0+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            <line x1={x0+dx} y1={y0+dy} x2={x1+dx} y2={y0+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            <line x1={x0+dx} y1={y2+dy} x2={x1+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            <polygon points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y0+dy} ${x1},${y0}`} fill="rgba(255,255,255,0.05)" stroke={color} strokeWidth="1" />
            <polygon points={`${x1},${y0} ${x1+dx},${y0+dy} ${x1+dx},${y2+dy} ${x1},${y2}`} fill="rgba(255,255,255,0.02)" stroke={color} strokeWidth="1" />
            <rect x={x0} y={y0} width={dw} height={dh} fill="rgba(255,255,255,0.04)" stroke={color} strokeWidth="1.2" />
            {type !== 'pallet' && (
                <>
                    <line x1={x0} y1={y0} x2={x1} y2={y2} stroke={color} strokeWidth="0.5" opacity="0.3" />
                    <line x1={x1} y1={y0} x2={x0} y2={y2} stroke={color} strokeWidth="0.5" opacity="0.3" />
                </>
            )}
        </svg>
    );
};

export const ClientOverview: React.FC = () => {
    const db = useDatabase();
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const currentExchangeRate = liveExchangeRate || exchangeRate;
    const [showFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);
    const allInventoryItems = useAtomValue(inventoryAtom);
    const availableItems = useAtomValue(storeInventoryAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const setFinanceSubTab = useSetAtom(financeSubTabAtom);
    const setPaymentCategoryFilter = useSetAtom(paymentCategoryFilterAtom);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const [isLogisticsCollapsed, setIsLogisticsCollapsed] = useState(false);
    const [isFinancialsCollapsed, setIsFinancialsCollapsed] = useState(false);
    const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
    const [isPaymentsCollapsed, setIsPaymentsCollapsed] = useState(false);
    const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [expandedDests, setExpandedDests] = useState<Record<string, boolean>>({});

    const toggleDest = (k: string) => setExpandedDests(prev => ({ ...prev, [k]: !prev[k] }));

    const getVendorIdFromItem = (data: any) => {
        const itemIdStr = String(data.item_id || data.itemId || '');
        let vid = data.vendor_id || data.vendorId;

        if (!vid) {
            if (itemIdStr.includes('-')) {
                vid = itemIdStr.split('-')[0];
            } else {
                // Try to match against known prefixes (sorted by length descending to match longest)
                const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
                const prefix = vKeys.find(v => itemIdStr.startsWith(v));
                if (prefix) vid = prefix;
            }
        }
        return vid || 'Unknown';
    };

    const items = useMemo(() =>
        allInventoryItems.filter(i => i.data.status !== 'Pending Deletion'),
        [allInventoryItems]
    );
    const storeItems = useMemo(() =>
        availableItems,
        [availableItems]
    );

    useEffect(() => { 
        // Initial Panel States based on screen size
        const isSmall = typeof window !== 'undefined' && window.innerWidth <= 1024;
        if (isSmall) {
            setIsLogisticsCollapsed(true);
            setIsFinancialsCollapsed(true);
            setIsPaymentsCollapsed(true);
        } else {
            setIsLogisticsCollapsed(false);
            setIsFinancialsCollapsed(false);
            setIsPaymentsCollapsed(false);
            setIsQueueCollapsed(false);
            setIsAnalysisCollapsed(false);
        }
        const t = setTimeout(() => setIsLoading(false), 800); 
        return () => clearTimeout(t); 
    }, []);


    const vendorSummaries = useMemo<ClientVendorSummary[]>(() => {
        const map: Record<string, ClientVendorSummary> = {};
        for (const item of items) {
            const data = item.data;
            const vid = getVendorIdFromItem(data);
            if (!map[vid]) map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            const price = parseFloat(String(data?.price_mxn || data?.price || 0));
            const qty = parseInt(String(data?.quantity || 1)) || 1;
            const totalPrice = price * qty;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += totalPrice / currentExchangeRate;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, currentExchangeRate]);

    const logisticsData = useAtomValue(logisticsDataAtom);

    const opsBreakdown = useMemo(() => {
        const cats = { 
            Monthly: { mxn: 0, usd: 0, tag: 'MONTHLY' as const }, 
            Supplies: { mxn: 0, usd: 0, tag: 'SPPL' as const }, 
            Labor: { mxn: 0, usd: 0, tag: 'LABR' as const }, 
            Packing: { mxn: 0, usd: 0, tag: 'PACK' as const }, 
            Operations: { mxn: 0, usd: 0, tag: 'OPRT' as const } 
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

    const activeDestPendingRecords = useMemo(() =>
        financeData.filter(d => (d.status === 'Requested' || !d.status) && d.destination),
        [financeData]);

    const activeDestReqNetMXN = useMemo(() =>
        activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0),
        [activeDestPendingRecords]);

    const requisitions = useMemo(() => {
        const groups: { key: string; cfg: any; docs: any[]; type: 'grouped' | 'independent'; vendorId?: string; progress?: number }[] = [];
        Object.entries(destinationsConfig).forEach(([key, cfg]) => {
            const docs = activeDestPendingRecords.filter(d => d.destination === key);
            if (docs.length === 0) return;
            const getProgress = (records: any[]) => {
                const firstPartial = records.find(r => r.description?.includes('%') || r.notes?.includes('%'));
                if (firstPartial) {
                    const match = (firstPartial.description + firstPartial.notes).match(/(\d+)%/);
                    if (match) return parseInt(match[1]);
                }
                return 0;
            };
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
                        vendorId: vid,
                        progress: getProgress(vDocs)
                    });
                });
            } else {
                groups.push({ key, cfg, docs, type: 'grouped', progress: getProgress(docs) });
            }
        });
        return groups.sort((a,b) => {
            const sumA = a.docs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
            const sumB = b.docs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
            return sumB - sumA;
        });
    }, [activeDestPendingRecords]);

    const pendingItems = useMemo(() => items.filter(i => {
        const data = i.data as any;
        const status = (data?.status || data?.item_status || '').toLowerCase();
        const payReqStr = String(data?.payReq || data?.pay_req || '').toLowerCase();
        
        // Exclude items already Requested or Paid
        const isExcluded = payReqStr === 'true' || payReqStr === 'paid' || payReqStr === 'requested';
        
        return ['acquired', 'acquisition', 'acquisitions', 'production'].includes(status) && !isExcluded;
    }), [items]);

    const comingPaymentsByVendor = useMemo(() => {
        const groups: Record<string, { total: number; totalPaid: number; totalPossible: number; partials: string[] }> = {};
        for (const item of pendingItems) {
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            const vid = getVendorIdFromItem(data);

            if (!groups[vid]) groups[vid] = { total: 0, totalPaid: 0, totalPossible:0, partials: [] };
            
            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseInt(String(data.quantity || '1')) || 1;
            const itemTotal = price * qty;
            const payReqStr = String(data.payReq || (data as any).pay_req || '').toLowerCase();

            if (payReqStr.includes('%')) {
                const match = payReqStr.match(/(\d+)%/);
                if (match) { 
                    const perc = parseInt(match[1]);
                    const paid = itemTotal * (perc / 100);
                    groups[vid].total += (itemTotal - paid); 
                    groups[vid].totalPaid += paid;
                    groups[vid].totalPossible += itemTotal;
                    groups[vid].partials.push(`${match[1]}% paid on ${itemIdStr}`); 
                }
            } else {
                groups[vid].total += itemTotal;
                groups[vid].totalPossible += itemTotal;
            }
        }
        return Object.entries(groups).map(([vid, data]) => ({ vendorId: vid, ...data })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
    }, [pendingItems]);

    const globalTotals = useMemo(() => {
        const totalAcqValueUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);
        const requestedUnpaidMxn = activeDestReqNetMXN;
        const pendingToRequestMxn = comingPaymentsByVendor.reduce((sum, g) => sum + g.total, 0);
        
        const crates = logisticsData.filter(d => (d.type || '').toLowerCase().includes('crate'));
        const pallets = logisticsData.filter(d => (d.type || '').toLowerCase().includes('pallet'));
        const packedCrates = crates.filter(c => (c as any).inventoryItems?.length > 0).length;
        
        const dimensionCounts: Record<string, number> = {};
        logisticsData.forEach(d => {
            if (d.type === 'crate' || d.type === 'pallet') {
                const s = `${d.width_cm || d.w || 0}x${d.height_cm || d.h || 0}x${d.length_cm || d.d || 0}`;
                if (s !== '0x0x0') dimensionCounts[s] = (dimensionCounts[s] || 0) + 1;
            }
        });
        const dims = Object.entries(dimensionCounts).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([size, count]) => `${size} (${count})`).join(', ');

        // NEW: Calculate Logistics Spend specifically for Crates & Pallets
        let logisticsSpendMxn = 0;
        let logisticsSpendUsd = 0;
        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            const desc = String(d.description || '').toLowerCase();
            if (sub.includes('crate') || sub.includes('pallet') || desc.includes('crate') || desc.includes('pallet')) {
                const amtMxn = (d.amount || 0) + (d.commission || 0);
                logisticsSpendMxn += amtMxn;
                logisticsSpendUsd += amtMxn / (d.exchange_rate || currentExchangeRate || 20);
            }
        });

        const totalOpsUsd = Object.values(opsBreakdown).reduce((acc, c) => acc + c.usd, 0);
        const totalOpsMxn = Object.values(opsBreakdown).reduce((acc, c) => acc + c.mxn, 0);

        // NEW: Specific Pillars for Stacked Bar (RGB Red Green Blue Yellow Magenta Mapping)
        let paidAcqMxn = 0, paidExpMxn = 0, reqMerchMxn = 0, reqExpMxn = 0;
        
        // 1. From Finance Records (Source of Truth for Transactions)
        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            const cat = String(d.category || '').toLowerCase();
            const type = String(d.type || '').toLowerCase();
            const isMerch = sub.includes('acq') || sub.includes('prod') || cat.includes('acquisition') || cat.includes('merchandise');
            const isExp = !isMerch && (type === 'expense' || sub.includes('month') || sub.includes('suppl') || sub.includes('sppl') || sub.includes('labr') || sub.includes('labor') || sub.includes('pack') || sub.includes('oprt') || sub.includes('operation'));

            const amtMxn = (d.amount || 0) + (d.commission || 0);
            const isPaid = d.status === 'Paid';

            if (isPaid) {
                if (isMerch) paidAcqMxn += amtMxn;
                else if (isExp) paidExpMxn += amtMxn;
            } else {
                if (isMerch) reqMerchMxn += amtMxn;
                else if (isExp) reqExpMxn += amtMxn;
            }
        });

        // 2. Fallback for Inventory Items marked 'Requested' but without finance records yet
        // We only count them if they are NOT already linked to a finance record to avoid double counting
        const financeItemIds = new Set(financeData.flatMap(d => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            if (Array.isArray(rel)) return rel.map(id => String(id));
            if (typeof rel === 'string') return rel.split(',').map(s => s.trim()).filter(Boolean);
            return [];
        }));
        
        items.forEach(item => {
            const data = item.data;
            const payReqStr = String(data.payReq || data.pay_req || '').toLowerCase();
            const isRequested = (payReqStr === 'true' || payReqStr === 'requested' || payReqStr === 'partial') && !financeItemIds.has(String(item.row));
            
            if (isRequested) {
                const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
                const qty = parseInt(String(data.quantity || '1')) || 1;
                reqMerchMxn += (price * qty);
            }
        });

        const packedItems = items.filter(i => (i.data as any).logisticsId || (i.data as any).logistics_id).reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0);

        // Grouped Crates/Pallets
        const groupedLogistics: Record<string, { type: string, w: number, h: number, l: number, count: number, packed: number }> = {};
        logisticsData.forEach(d => {
            const type = (d.type || 'crate').toLowerCase();
            const w = d.width_cm || d.w || 0;
            const h = d.height_cm || d.h || 0;
            const l = d.length_cm || d.d || 0;
            const key = `${type}-${w}-${h}-${l}`;
            if (!groupedLogistics[key]) groupedLogistics[key] = { type, w, h, l, count: 0, packed: 0 };
            groupedLogistics[key].count++;
            if ((d.inventoryItems?.length || 0) > 0 || d.inventory_ids) groupedLogistics[key].packed++;
        });

        return {
            totalItems: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            totalAcqValueUsd,
            requestedUnpaidUsd: requestedUnpaidMxn / currentExchangeRate,
            requestedUnpaidMxn,
            pendingToRequestUsd: pendingToRequestMxn / currentExchangeRate,
            pendingToRequestMxn,
            totalUnpaidUsd: (requestedUnpaidMxn + pendingToRequestMxn) / currentExchangeRate,
            totalUnpaidMxn: requestedUnpaidMxn + pendingToRequestMxn,
            packedCrates,
            freeCrates: crates.length - packedCrates,
            packedItems,
            logisticsDims: dims,
            totalCratesAndPallets: crates.length + pallets.length,
            totalPallets: pallets.length,
            totalCrates: crates.length,
            logisticsSpendMxn,
            logisticsSpendUsd,
            totalOpsUsd,
            totalOpsMxn,
            paidAcqMxn,
            paidExpMxn,
            reqMerchMxn,
            reqExpMxn,
            totalLiabilityMxn: (requestedUnpaidMxn + pendingToRequestMxn),
            groupedLogistics: Object.values(groupedLogistics).sort((a,b) => b.count - a.count)
        };
    }, [vendorSummaries, activeDestReqNetMXN, currentExchangeRate, comingPaymentsByVendor, logisticsData, opsBreakdown, items, financeData]);

    const attributeStats = useMemo(() => {
        const colorMatMap: Record<string, number> = {};
        const shapeDescMap: Record<string, number> = {};
        items.forEach(i => {
            const norm = normalizeInventoryData(i.data);
            const qty = parseInt(norm?.quantity || '1') || 1;
            const cm = `${norm?.color || 'Unknown'} ${norm?.material || 'Unknown'}`.trim();
            colorMatMap[cm] = (colorMatMap[cm] || 0) + qty;
            
            const rawDesc = (norm?.description || norm?.shortDescription || norm?.item_description || norm?.generatedDescription || '').trim();
            const desc = rawDesc || 'No Description';
            const sd = `${norm?.shape || 'Unknown'} - ${desc}`;
            shapeDescMap[sd] = (shapeDescMap[sd] || 0) + qty;
        });
        return { 
            topCM: Object.entries(colorMatMap).sort((a,b) => b[1]-a[1]).slice(0, 8),
            topSD: Object.entries(shapeDescMap).sort((a,b) => b[1]-a[1]).slice(0, 10)
        };
    }, [items]);

    const fmtUSD = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD' : '***';
    const fmtMXN = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN' : '***';
    const fmtUSDCompact = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '***';

    const pieChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { 
            trigger: 'item', 
            formatter: (p: any) => `${p.name}: ${currencyMode === 'MXN' ? fmtMXN(p.value * currentExchangeRate) : fmtUSD(p.value)} (${p.percent}%)` 
        },
        series: [{
            name: 'Acq Value', type: 'pie', radius: ['45%', '72%'], center: ['35%', '50%'],
            data: vendorSummaries.map(v => ({ name: v.vendorId, value: v.totalAcqUsd })),
            label: { show: false },
            itemStyle: { borderRadius: 6, borderColor: 'rgba(0,0,0,0.4)', borderWidth: 1 }
        }],
        color: vendorSummaries.map(v => v.color),
        backgroundColor: 'transparent',
    }), [vendorSummaries, currencyMode, currentExchangeRate]);
    
    const shapeDescPieOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${p.value} units (${p.percent}%)` },
        series: [{
            name: 'Shape + Desc', type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'],
            data: attributeStats.topSD.map(([name, value], idx) => ({ 
                name, 
                value,
                itemStyle: { color: `hsla(${(idx * 37) % 360}, 75%, 60%, 0.8)` }
            })),
            label: { show: false },
            itemStyle: { borderRadius: 8, borderColor: 'rgba(0,0,0,0.5)', borderWidth: 2 }
        }],
        backgroundColor: 'transparent',
    }), [attributeStats]);

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
                const rel = req.related_ids || req.related_inventory_ids || '';
                const ids = Array.isArray(rel) ? rel.map(id => String(id)) : (typeof rel === 'string' ? rel.split(',').map(s => s.trim()).filter(Boolean) : []);
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

    const CurrencyTag = ({ type, amount, className = "", size = "normal" }: { type: 'USD' | 'MXN'; amount: number | string; className?: string; size?: 'normal' | 'small' }) => {
        const isUSD = type === 'USD';
        const isSmall = size === 'small';
        const displayAmount = typeof amount === 'number' ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
        return (
            <div className={`inline-flex items-center gap-1 ${isSmall ? 'px-1 py-0' : 'px-1.5 py-0.5'} rounded bg-white/5 border border-white/10 ${className}`}>
                <span className={`${isSmall ? 'text-[7px]' : 'text-[8px]'} font-black uppercase tracking-widest ${isUSD ? 'text-emerald-400' : 'text-sky-400'}`}>{type}</span>
                <span className={`${isSmall ? 'text-[9px]' : 'text-[11px]'} font-mono font-black text-white/90`}>{displayAmount}</span>
            </div>
        );
    };

    const getContrastColor = (hexcolor: string) => {
        if (!hexcolor) return '#FFFFFF';
        const r = parseInt(hexcolor.substring(1, 3), 16);
        const g = parseInt(hexcolor.substring(3, 5), 16);
        const b = parseInt(hexcolor.substring(5, 7), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#000000' : '#FFFFFF';
    };

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
        <div className="flex-1 overflow-hidden relative flex flex-col h-full bg-(--app-bg)">
            <div className="grow min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 pb-24">
                <div className="max-w-[1700px] mx-auto space-y-4">
                    
                    {/* ROW 1: Logistics & Financials */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={`lg:col-span-2 p-4 rounded-xl border border-(--border-color) transition-all duration-300 ${isFinancialsCollapsed ? 'bg-white/2' : 'bg-(--sidebar-bg) shadow-lg'}`}>
                            {(() => {
                                const totalPortfolioUsd = globalTotals.totalOpsUsd + globalTotals.totalAcqValueUsd;
                                const totalPortfolioMxn = globalTotals.totalOpsMxn + (globalTotals.totalAcqValueUsd * currentExchangeRate);
                                return (
                                    <>
                                        <SectionHeader 
                                            icon={CreditCard} title="Expenses & Financials" color="#00AEEF" 
                                            onToggle={() => setIsFinancialsCollapsed(!isFinancialsCollapsed)} isCollapsed={isFinancialsCollapsed}
                                            compactSummary={
                                                <div className="flex flex-col gap-2 mt-1 min-w-[340px]">
                                                    {isFinancialsCollapsed && (
                                                        <div className="w-full animate-in fade-in slide-in-from-top-1 duration-500">
                                                            <CompactFinancialsGraph 
                                                                hideLegend={true}
                                                                fullWidth={true}
                                                                mode={currencyMode}
                                                                currentExchangeRate={currentExchangeRate}
                                                                metrics={{
                                                                    mexTotal: totalPortfolioMxn,
                                                                    paidAcq: globalTotals.paidAcqMxn,
                                                                    paidExp: globalTotals.paidExpMxn,
                                                                    reqMerch: globalTotals.reqMerchMxn,
                                                                    reqExp: globalTotals.reqExpMxn,
                                                                    pending: globalTotals.pendingToRequestMxn
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-3 items-center opacity-60">
                                                        <span className="text-[10px] font-black font-mono text-white/40 uppercase">MX Total</span>
                                                        <CurrencyTag type="MXN" amount={totalPortfolioMxn} size="small" />
                                                        <CurrencyTag type="USD" amount={totalPortfolioUsd} size="small" className="opacity-40" />
                                                    </div>
                                                </div>
                                            }
                                        />
                                        {!isFinancialsCollapsed && (
                                            <>
                                                <div className="mt-4 mb-6 animate-in fade-in duration-500">
                                                    <CompactFinancialsGraph 
                                                        hideLegend={false}
                                                        fullWidth={true}
                                                        mode={currencyMode}
                                                        currentExchangeRate={currentExchangeRate}
                                                        metrics={{
                                                            mexTotal: totalPortfolioMxn,
                                                            paidAcq: globalTotals.paidAcqMxn,
                                                            paidExp: globalTotals.paidExpMxn,
                                                            reqMerch: globalTotals.reqMerchMxn,
                                                            reqExp: globalTotals.reqExpMxn,
                                                            pending: globalTotals.pendingToRequestMxn
                                                        }}
                                                    />
                                                </div>
                                                <div className="mt-2 animate-in fade-in duration-300">
                                                    <div className="group relative flex flex-col p-2.5 mb-3 rounded-xl bg-white/5 border border-white/10 shadow-inner overflow-hidden">
                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-(--main-color)/5 blur-2xl -mr-16 -mt-16 rounded-full" />
                                                        <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.4em] mb-1 relative z-10">Mexico Total:</span>
                                                        
                                                        <div className="flex items-end justify-between relative z-10 leading-none gap-4">
                                                            <div className="flex items-baseline gap-2.5">
                                                                <span className="text-[22px] font-black font-mono text-(--main-color) tracking-tighter drop-shadow-lg">
                                                                    {currencyMode === 'MXN' ? fmtMXN(totalPortfolioMxn) : fmtUSD(totalPortfolioUsd)}
                                                                </span>
                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                                    {currencyMode}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl mb-0.5 shadow-lg">
                                                                <span className="text-[9px] font-black text-(--main-color) opacity-30 uppercase tracking-[0.2em]">Rate</span>
                                                                <div className="w-px h-3 bg-white/10" />
                                                                <span className="text-[12px] font-mono font-black text-(--main-color) opacity-80">1 USD = {currentExchangeRate.toFixed(2)} MXN</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                                        {[
                                                            { label: 'TOTAL EXPENSES', v: { usd: globalTotals.totalOpsUsd, mxn: globalTotals.totalOpsMxn }, color: '#6BCEBB', icon: null, isTotal: true, standout: true },
                                                            { label: 'Monthly', v: opsBreakdown.Monthly, color: '#38bdf8', icon: Calendar },
                                                            { label: 'Supplies', v: opsBreakdown.Supplies, color: '#34d399', icon: Box },
                                                            { label: 'Labor', v: opsBreakdown.Labor, color: '#fbbf24', icon: Users },
                                                            { label: 'Packing', v: opsBreakdown.Packing, color: '#fb7185', icon: Archive },
                                                            { label: 'Operations', v: opsBreakdown.Operations, color: '#818cf8', icon: Cpu },
                                                        ].map(c => (
                                                            <div key={c.label} 
                                                                onClick={() => { 
                                                                    if (c.label === 'TOTAL EXPENSES') {
                                                                        setActiveView('finance'); 
                                                                        setFinanceSubTab('payments');
                                                                    } else {
                                                                        setPaymentsArtifactConfig({ 
                                                                            isOpen: true, 
                                                                            paymentType: (c.v as any).tag, 
                                                                            title: `${c.label} Payments` 
                                                                        }); 
                                                                    }
                                                                }}
                                                                className={`group relative flex flex-col p-2 rounded-lg border transition-all cursor-pointer ${c.standout ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg scale-[1.02]' : c.isTotal ? 'bg-(--main-color)/5 border-(--main-color)/20 shadow-inner' : 'bg-white/2 hover:bg-white/5 border-white/5 hover:border-(--main-color)/20'}`}
                                                            >
                                                                {c.icon && <div className="absolute top-1.5 right-1.5 opacity-30 group-hover:opacity-100 transition-opacity"><c.icon size={18} style={{ color: c.color }} /></div>}
                                                                <span className={`${c.standout ? 'text-[11px]' : c.isTotal ? 'text-[8.5px]' : 'text-[10px]'} font-black uppercase tracking-[0.2em] mb-1.5 block w-fit`} style={{ color: c.color }}>{c.label}</span>
                                                                <div className="flex flex-col leading-none">
                                                                    <span className={`${c.standout ? 'text-[18px]' : 'text-[14px]'} font-black font-mono text-white tracking-tighter`}>
                                                                        {currencyMode === 'MXN' ? fmtMXN(c.v.mxn) : fmtUSD(c.v.usd)}
                                                                    </span>
                                                                    <span className={`text-[7px] font-black px-1 rounded w-fit mt-1.5 ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                                        {currencyMode}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-3 border-t border-white/5">
                                                        {[
                                                            { label: 'Units', v: globalTotals.totalItems, sub: '', color: '#6BCEBB', icon: Layers, size: 'text-[22px]', action: () => setArtifactConfig({ isOpen: true, itemIds: items.map(i => i.data.id), title: 'All Active Units' }) },
                                                            { label: 'Acquisitions Value', v: globalTotals.totalAcqValueUsd, sub: fmtMXN(globalTotals.totalAcqValueUsd * currentExchangeRate).replace(' MXN',''), color: '#34d399', icon: DollarSign, isCurrency: true, size: 'text-[18px]', action: () => setPaymentsArtifactConfig({ isOpen: true, paymentType: 'ACQUISITION', title: 'Merchandise Acquisitions' }) },
                                                            { label: 'Req Unpaid', v: globalTotals.requestedUnpaidUsd, sub: fmtMXN(globalTotals.requestedUnpaidMxn).replace(' MXN',''), color: '#fbbf24', icon: Activity, isCurrency: true, size: 'text-[18px]', action: () => setPaymentsArtifactConfig({ isOpen: true, status: 'Requested', title: 'Requested Unpaid Payments' }) },
                                                            { label: 'Total Unpaid', v: globalTotals.totalUnpaidUsd, sub: fmtMXN(globalTotals.totalUnpaidMxn).replace(' MXN',''), color: '#f43f5e', icon: Wallet, isCurrency: true, size: 'text-[18px]', action: () => setPaymentsArtifactConfig({ isOpen: true, status: 'Requested', title: 'Total Outstanding Liabilities' }) },
                                                        ].map(stat => (
                                                            <div key={stat.label} onClick={stat.action} className={`group relative flex flex-col p-3.5 rounded-xl bg-white/2 border border-white/5 hover:border-white/10 transition-all ${stat.action ? 'cursor-pointer active:scale-95' : ''}`}>
                                                                <div className="absolute top-3 right-3 opacity-30 group-hover:opacity-100 transition-opacity"><stat.icon size={18} style={{ color: stat.color }} /></div>
                                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">{stat.label}</span>
                                                                <div className="flex flex-col leading-none">
                                                                    <span className={`font-black font-mono tracking-tighter ${stat.size || 'text-[18px]'}`} style={{ color: stat.color }}>
                                                                        {stat.isCurrency 
                                                                            ? (currencyMode === 'MXN' ? fmtMXN(stat.v as number * currentExchangeRate) : fmtUSD(stat.v as number))
                                                                            : (stat.v as number).toLocaleString()}
                                                                    </span>
                                                                    {stat.isCurrency && (
                                                                        <span className={`text-[8px] font-black px-1 rounded w-fit mt-1.5 ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                                            {currencyMode}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        <div className={`p-4 rounded-xl border border-(--border-color) transition-all duration-300 ${isLogisticsCollapsed ? 'bg-white/2' : 'bg-(--sidebar-bg) shadow-lg'}`}>
                            <SectionHeader 
                                icon={Package} title="Storage & Logistics" color="#6BCEBB" 
                                onToggle={() => setIsLogisticsCollapsed(!isLogisticsCollapsed)} isCollapsed={isLogisticsCollapsed}
                                compactSummary={
                                    <div className="flex flex-col gap-2 mt-1 min-w-[280px]">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[12px] font-black text-white">{globalTotals.totalCratesAndPallets}</span>
                                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Units</span>
                                            </div>
                                            <div className="h-3 w-px bg-white/10" />
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[12px] font-black text-(--main-color)">{globalTotals.packedCrates}</span>
                                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Packed</span>
                                            </div>
                                            <div className="ml-auto flex gap-2">
                                                <CurrencyTag type="USD" amount={globalTotals.logisticsSpendUsd} size="small" className="scale-90" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden flex">
                                                <div 
                                                    className="h-full bg-(--main-color) transition-all duration-1000 shadow-[0_0_8px_var(--main-color)]" 
                                                    style={{ width: `${(globalTotals.packedCrates / Math.max(1, globalTotals.totalCratesAndPallets)) * 100}%` }} 
                                                />
                                            </div>
                                            <span className="text-[9px] font-black font-mono text-(--main-color)">{Math.round((globalTotals.packedCrates / Math.max(1, globalTotals.totalCratesAndPallets)) * 100)}%</span>
                                        </div>
                                    </div>
                                }
                            />
                            {!isLogisticsCollapsed && (
                                <div className="mt-4 animate-in fade-in duration-300 space-y-6">
                                    {/* Crate/Pallet Types Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {globalTotals.groupedLogistics.map((g, idx) => (
                                            <div key={idx} className="group relative flex flex-col p-3 rounded-xl bg-white/2 border border-white/5 hover:border-(--main-color)/30 transition-all overflow-hidden">
                                                <div className="absolute top-2 right-2 flex flex-col items-end">
                                                    <span className="text-[14px] font-black text-white leading-none">{g.count}</span>
                                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mt-0.5">Stock</span>
                                                </div>
                                                
                                                <div className="flex justify-center py-2 mb-2 group-hover:scale-110 transition-transform duration-500">
                                                    <LargeCrateWireframe 
                                                        w={g.w} h={g.h} l={g.l} 
                                                        type={g.type} 
                                                        size={80} 
                                                        color={g.packed === g.count ? 'var(--main-color)' : g.packed > 0 ? '#fbbf24' : '#6BCEBB'}
                                                    />
                                                </div>

                                                <div className="space-y-1 relative z-10">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{g.type}</span>
                                                        <span className="text-[10px] font-mono font-black text-white/80">{g.w}x{g.h}x{g.l}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between pt-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase italic">Packed: {g.packed}</span>
                                                        <div className="flex-1 max-w-[40px] h-1 bg-white/5 rounded-full overflow-hidden ml-2">
                                                            <div className="h-full bg-(--main-color)" style={{ width: `${(g.packed / g.count) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Detailed Logistics Stats */}
                                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                                        <div className="flex flex-col p-3 rounded-xl bg-white/2 border border-white/5">
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Item Packing Fill</span>
                                            <div className="flex items-end justify-between leading-none">
                                                <span className="text-[22px] font-black font-mono text-white">{globalTotals.packedItems}</span>
                                                <span className="text-[12px] font-black text-(--main-color)">{Math.round((globalTotals.packedItems / Math.max(1, globalTotals.totalItems)) * 100)}%</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3">
                                                <div className="h-full bg-(--main-color) transition-all duration-1000" style={{ width: `${(globalTotals.packedItems / Math.max(1, globalTotals.totalItems)) * 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col p-3 rounded-xl bg-white/2 border border-white/5">
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Logistics Investment</span>
                                            <div className="space-y-2 mt-auto">
                                                <CurrencyTag type="USD" amount={globalTotals.logisticsSpendUsd} />
                                                <CurrencyTag type="MXN" amount={globalTotals.logisticsSpendMxn} className="opacity-40" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ROW 2: Queue & Upcoming */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className={`md:col-span-9 p-4 rounded-xl border border-(--border-color) transition-all duration-300 ${isQueueCollapsed ? 'bg-white/2' : 'bg-(--sidebar-bg) shadow-lg'}`}>
                            <SectionHeader 
                                icon={Activity} title="Active Request Queue" color="#F43F5E" 
                                onToggle={() => setIsQueueCollapsed(!isQueueCollapsed)} isCollapsed={isQueueCollapsed}
                                compactSummary={
                                    <div className="flex flex-wrap gap-3 items-center">
                                        <span className="text-[12px] font-black text-rose-500">{requisitions.length} <span className="opacity-30 text-[8px] uppercase">Dests</span></span>
                                        <div className="h-3 w-px bg-white/10" />
                                        <CurrencyTag type="USD" amount={activeDestReqNetMXN / currentExchangeRate} className="scale-90 origin-left" />
                                        <CurrencyTag type="MXN" amount={activeDestReqNetMXN} className="opacity-40 scale-90 origin-left" />
                                    </div>
                                }
                            />
                            {!isQueueCollapsed && (
                                <div className="mt-4 space-y-2 animate-in fade-in duration-300">
                                    {requisitions.length === 0 ? <p className="text-[10px] font-black text-white/20 uppercase text-center py-6">Queue Empty</p> : requisitions.map((req) => {
                                        const destReqMXN = req.docs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                                        const destReqUSD = destReqMXN / currentExchangeRate;
                                        const isExpanded = !!expandedDests[req.key];
                                        const vendorId = req.vendorId || req.docs[0]?.vendor_id;
                                        const vendorColor = (vendors as any)[vendorId]?.color || '#888';
                                        return (
                                            <div key={req.key} className="group rounded-lg bg-white/2 hover:bg-white/5 border border-white/5 transition-all overflow-hidden">
                                                <div className="flex items-center gap-4 p-3 cursor-pointer" onClick={() => toggleDest(req.key)}>
                                                    <div className="w-14 h-10 flex items-center justify-center shrink-0">
                                                        <img src={req.cfg.icon} alt={req.cfg.name} className="max-w-full max-h-full object-contain opacity-100 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 pointer-events-auto hover:bg-white/5 transition-colors p-1 rounded-md" onClick={(e) => {
                                                        e.stopPropagation();
                                                        const docIds = req.docs.flatMap(d => {
                                                            const r = d.related_ids || d.related_inventory_ids || [];
                                                            return Array.isArray(r) ? r : (typeof r === 'string' ? r.split(',').filter(Boolean) : []);
                                                        });
                                                        if (docIds.length) setArtifactConfig({ isOpen: true, itemIds: docIds, title: `${req.cfg.name} items` });
                                                    }}>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-black" style={{ backgroundColor: vendorColor }}>{vendorId || 'Mixed'}</div>
                                                            <p className="text-[11px] font-black text-white/80 uppercase truncate tracking-widest">{req.cfg.name}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <p className="text-[9px] font-mono text-white/30 truncate max-w-[300px]">{req.docs[0]?.description || 'Multiple units'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0 px-2 min-w-[100px]">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[14px] font-black font-mono text-white tracking-tighter">
                                                                {currencyMode === 'MXN' ? fmtMXN(destReqMXN) : fmtUSD(destReqUSD)}
                                                            </span>
                                                            <span className={`text-[8px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                                {currencyMode}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button onClick={e => { e.stopPropagation(); handleMarkAsPaid(req.key, destReqMXN, req.docs); }} className="px-3 py-1.5 h-full rounded-lg bg-(--main-color) text-black font-black text-[9px] uppercase tracking-widest ml-1 self-stretch shadow-lg">Paid</button>
                                                </div>
                                                {isExpanded && (
                                                    <div className="px-3 pb-3 pt-1 space-y-1 border-t border-white/5">
                                                        {req.docs.map(d => {
                                                            const rowMxn = (d.amount || 0) + (d.commission || 0);
                                                            const rowUsd = rowMxn / (d.exchange_rate || currentExchangeRate || 20);
                                                            return (
                                                                <div key={d.id} className="flex justify-between items-center py-2 text-[9px] font-mono border-b border-white/2 last:border-0">
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-white/40 truncate max-w-[400px] mb-1">{d.description || 'Payment'}</span>
                                                                        {(() => {
                                                                            const rawIds = d.related_ids || d.related_inventory_ids;
                                                                            const ids = Array.isArray(rawIds) ? rawIds : (typeof rawIds === 'string' ? rawIds.split(',').filter(Boolean) : []);
                                                                            const tagIds = ids.map((id: any) => {
                                                                                const item = allInventoryItems.find(i => String(i.data?.id) === String(id));
                                                                                if (!item) return null;
                                                                                const norm = { ...item.data };
                                                                                const calculated = calculateCodesAndPrices(norm, exchangeRate, norm.workbook || '326');
                                                                                return calculated.bookBardcode || item?.data?.book_aq_code || item?.data?.book_barcode || item?.data?.itemId;
                                                                            }).filter(Boolean);
                                                                            if (!tagIds.length) return null;
                                                                            return (
                                                                                <div className="flex flex-wrap gap-1 mt-1 mb-1">
                                                                                    {tagIds.map((tid: string, idx: number) => (
                                                                                        <span 
                                                                                            key={`${tid}-${idx}`} 
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setArtifactConfig({ isOpen: true, itemIds: [ids[idx]], title: `Item ${tid}` });
                                                                                            }}
                                                                                            className="text-[7.5px] font-mono font-black border border-white/10 bg-white/5 hover:bg-(--main-color)/20 hover:border-(--main-color)/30 cursor-pointer transition-all px-1 py-0.5 rounded-sm text-(--main-color) uppercase tracking-tighter shadow-sm"
                                                                                        >
                                                                                            {tid}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                    <div className="flex gap-4">
                                                                        <CurrencyTag type="MXN" amount={rowMxn} />
                                                                        <CurrencyTag type="USD" amount={rowUsd} className="opacity-40" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className={`md:col-span-3 p-4 rounded-xl border border-(--border-color) transition-all duration-300 ${isPaymentsCollapsed ? 'bg-white/2' : 'bg-(--sidebar-bg) shadow-lg'}`}>
                            <SectionHeader 
                                icon={Wallet} title="Upcoming Payments" color="#FBBF24" 
                                onToggle={() => setIsPaymentsCollapsed(!isPaymentsCollapsed)} isCollapsed={isPaymentsCollapsed}
                                compactSummary={<div className="flex gap-4"><span className="text-[12px] font-black text-amber-500">{comingPaymentsByVendor.length} <span className="opacity-30 text-[8px] uppercase">Vendors</span></span></div>}
                            />
                            {!isPaymentsCollapsed && (
                                <div className="mt-4 grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2 animate-in fade-in duration-300">
                                    {comingPaymentsByVendor.map(group => {
                                        const vendorColor = (vendors as any)[group.vendorId]?.color || '#888';
                                        const contrastColor = getContrastColor(vendorColor);
                                        const progress = (group.totalPaid / Math.max(1, group.totalPossible)) * 100;
                                        return (
                                            <div key={group.vendorId} onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); }} 
                                                className="group p-3 rounded-lg border border-white/10 relative overflow-hidden cursor-pointer hover:shadow-xl transition-all"
                                                style={{ backgroundColor: vendorColor }}
                                            >
                                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="relative z-10 flex flex-col h-full justify-between gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none" style={{ color: contrastColor }}>
                                                            {(vendors as any)[group.vendorId]?.name || group.vendorId}
                                                        </span>
                                                        <span className="text-[8px] font-black opacity-40 uppercase" style={{ color: contrastColor }}>{group.partials.length ? `Part.` : 'Full'}</span>
                                                    </div>
                                                    
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between overflow-hidden">
                                                            <span className="text-[16px] font-mono font-black" style={{ color: contrastColor }}>
                                                                {currencyMode === 'MXN' ? fmtMXN(group.total) : fmtUSD(group.total / currentExchangeRate)}
                                                            </span>
                                                            <span className="text-[8px] font-black px-1 rounded border border-black/10" style={{ color: contrastColor, backgroundColor: `${contrastColor}10` }}>{currencyMode}</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
                                                            <div className="h-full bg-white/40 transition-all duration-1000" style={{ width: `${progress}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`p-8 rounded-xl border border-(--border-color) transition-all duration-300 ${isAnalysisCollapsed ? 'bg-white/2' : 'bg-(--sidebar-bg) shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-8">
                            <SectionHeader 
                                icon={TrendingUp} title="Global Distribution Analysis" color="#6BCEBB" 
                                onToggle={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)} isCollapsed={isAnalysisCollapsed}
                                compactSummary={
                                    <div className="flex flex-wrap gap-4 items-center">
                                        <span className="text-[12px] font-black text-(--main-color)">{globalTotals.totalItems} <span className="opacity-30 text-[8px] uppercase whitespace-nowrap">Units Total</span></span>
                                        <div className="h-3 w-px bg-white/10" />
                                        <CurrencyTag type="USD" amount={globalTotals.totalAcqValueUsd} className="scale-90 origin-left" />
                                        <CurrencyTag type="MXN" amount={globalTotals.totalAcqValueUsd * currentExchangeRate} className="opacity-40 scale-90 origin-left" />
                                    </div>
                                }
                            />
                            {!isAnalysisCollapsed && (
                                <div className="hidden sm:flex gap-4">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Acq. Balance: {fmtUSDCompact(globalTotals.totalAcqValueUsd)}</span>
                                </div>
                            )}
                        </div>

                        {!isAnalysisCollapsed && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">

                        {/* Acquisitions Concentration (Value) - Pie Chart - TOP */}
                        <div className="flex flex-col col-span-1 lg:col-span-2 border-b border-white/5 pb-10 mb-6">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-6">Acquisitions Concentration (Value)</span>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                                <div className="w-full sm:w-1/2 h-56">
                                    <EChart option={pieChartOption} style={{ height: '100%' }} />
                                </div>
                                <div className="w-full sm:w-1/2 space-y-4 px-4 overflow-y-auto max-h-[220px] custom-scrollbar">
                                    {vendorSummaries.slice(0, 8).map(v => (
                                        <div key={v.vendorId} 
                                            onClick={() => setPaymentsArtifactConfig({ isOpen: true, vendor: v.vendorId, title: `${v.vendorId} Payments` })}
                                            className="flex flex-col border-b border-white/2 pb-2 group cursor-pointer hover:bg-white/5 px-2 -mx-2 rounded-md transition-all"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest group-hover:text-white/60">{v.vendorId}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[12px] font-mono font-black text-white/80">
                                                        {currencyMode === 'MXN' ? fmtMXN(v.totalAcqUsd * currentExchangeRate) : fmtUSD(v.totalAcqUsd)}
                                                    </span>
                                                    <span className={`text-[7px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                        {currencyMode}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full group-hover:brightness-125 transition-all" style={{ width: `${(v.totalAcqUsd / globalTotals.totalAcqValueUsd * 100)}%`, backgroundColor: v.color }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Units by Vendor - Horizontal Segmented Bar - SECOND */}
                        <div className="flex flex-col col-span-1 lg:col-span-2 border-b border-white/5 pb-10 mb-6">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 ">Units Share by Vendor</span>
                            <div className="flex flex-col gap-4">
                                <div className="h-3 w-full rounded-2xl overflow-hidden flex shadow-2xl bg-white/5 border border-white/5">
                                    {vendorSummaries.map((v, idx) => {
                                        const share = (v.itemCount / globalTotals.totalItems) * 100;
                                        return (
                                            <div key={v.vendorId} 
                                                onClick={() => setArtifactConfig({ 
                                                    isOpen: true, 
                                                    itemIds: items.filter(i => {
                                                        const norm = normalizeInventoryData(i.data);
                                                        return (norm.vendorId || norm.vendor_id || '') === v.vendorId;
                                                    }).map(i => i.data.id),
                                                    title: `Items for ${v.vendorId}`
                                                })}
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
                                        <div key={v.vendorId} 
                                            onClick={() => setArtifactConfig({ 
                                                isOpen: true, 
                                                itemIds: items.filter(i => {
                                                    const norm = normalizeInventoryData(i.data);
                                                    return (norm.vendorId || norm.vendor_id || '') === v.vendorId;
                                                }).map(i => i.data.id),
                                                title: `Items for ${v.vendorId}`
                                            })}
                                            className="flex items-center gap-2 group cursor-pointer hover:bg-white/5 p-1 rounded transition-all"
                                        >
                                            <div className="w-2 h-2 rounded-sm group-hover:scale-125 transition-all shadow-lg shadow-black/40" style={{ backgroundColor: v.color }} />
                                            <span className="text-[10px] font-black text-(--text-color) opacity-30 group-hover:opacity-100 uppercase tracking-widest truncate">{v.vendorId}</span>
                                            <span className="text-[10px] font-mono font-black text-(--text-color) opacity-60 ml-auto group-hover:opacity-100">{v.itemCount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Material & Color Analysis */}
                        <div className="flex flex-col col-span-1 lg:col-span-2 mt-4">
                            <SectionHeader icon={Layers} title="Material + Color Attribution" color="#EF4444" />
                            <div className="mt-8 flex flex-col gap-6">
                                <div className="h-2 w-full rounded-full overflow-hidden flex bg-white/5">
                                    {attributeStats.topCM.map(([label, count], idx) => {
                                        const share = (count / globalTotals.totalItems) * 100;
                                        const hue = (idx * 45) % 360;
                                        return (
                                            <div key={label} style={{ width: `${share}%`, backgroundColor: `hsla(${hue}, 70%, 50%, 0.8)` }} className="h-full hover:brightness-125 transition-all cursor-pointer group relative">
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap z-50 pointer-events-none font-mono border border-white/10 shadow-2xl">{label}: {count} units</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                    {attributeStats.topCM.slice(0, 8).map(([label, count], idx) => {
                                        const hue = (idx * 45) % 360;
                                        return (
                                            <div key={label} 
                                                onClick={() => setArtifactConfig({ 
                                                    isOpen: true, 
                                                    itemIds: items.filter(i => {
                                                        const norm = normalizeInventoryData(i.data);
                                                        return `${norm.color || ''} ${norm.material || ''}`.trim() === label;
                                                    }).map(i => i.data.id),
                                                    title: `${label} Items`
                                                })}
                                                className="flex flex-col group p-2 rounded bg-white/2 hover:bg-(--main-color)/10 hover:border-(--main-color)/20 border border-transparent transition-all cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsla(${hue}, 80%, 60%, 1)` }} />
                                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate group-hover:text-white">{label}</span>
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-[14px] font-mono font-black text-white/20 group-hover:text-(--main-color) transition-colors">{count}</span>
                                                    <span className="text-[8px] font-black text-white/10 uppercase">Units</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Shape + Description Analysis Distribution */}
                        <div className="flex flex-col col-span-1 lg:col-span-2 pt-10 border-t border-white/5 mt-4">
                            <SectionHeader icon={Grid} title="Shape + Description Distribution" color="#818cf8" />
                            <div className="mt-8 flex flex-col lg:flex-row items-center gap-8">
                                <div className="w-full lg:w-1/2 h-64 relative">
                                    <EChart option={shapeDescPieOption} style={{ height: '100%' }} />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[20px] font-black text-white/90 leading-none">{attributeStats.topSD.length}</span>
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">Categories</span>
                                    </div>
                                </div>
                                <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 px-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {attributeStats.topSD.map(([label, count], idx) => {
                                        const share = (count / globalTotals.totalItems) * 100;
                                        const hue = (idx * 37) % 360;
                                        return (
                                            <div key={label} 
                                                onClick={() => setArtifactConfig({ 
                                                    isOpen: true, 
                                                    itemIds: items.filter(i => {
                                                        const norm = normalizeInventoryData(i.data);
                                                        const desc = norm.description || norm.shortDescription || norm.name || '';
                                                        return `${norm.shape || ''} - ${desc}`.trim() === label;
                                                    }).map(i => i.data.id),
                                                    title: `${label} Items`
                                                })}
                                                className="flex flex-col border-b border-white/2 pb-2 group hover:bg-(--main-color)/5 transition-all p-1 rounded cursor-pointer"
                                            >
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsla(${hue}, 80%, 60%, 1)` }} />
                                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate group-hover:text-white max-w-[150px]">{label}</span>
                                                    </div>
                                                    <span className="text-[12px] font-mono font-black text-white/80">{count}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                     <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full group-hover:brightness-125 transition-all" style={{ width: `${share}%`, backgroundColor: `hsla(${hue}, 80%, 60%, 1)` }} />
                                                    </div>
                                                    <span className="text-[8px] font-black text-white/20 uppercase w-8 text-right group-hover:text-(--main-color)">{share.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
</div>
    );
};
export default ClientOverview;

