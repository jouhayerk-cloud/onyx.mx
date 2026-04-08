import React, { useMemo, useState, useEffect } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom, userAtom,
    liveExchangeRateAtom, inventoryAtom, storeInventoryAtom, logisticsDataAtom,
    inventoryArtifactConfigAtom, currencyModeAtom, paymentsArtifactConfigAtom,
    financeSubTabAtom, paymentCategoryFilterAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Package, DollarSign, Users, TrendingUp, Layers, Shapes,
    BarChart3, PieChart, LayoutGrid, User, Activity,
    RefreshCcw, Wallet, ShoppingCart, CreditCard, ArrowUpRight, ChevronDown, ChevronUp,
    AlertCircle, Grid, Calendar, Archive, Cpu, Box, Zap, LogOut, X
} from 'lucide-react';
import { EChart } from '../../components/EChart';
import type { EChartsOption } from 'echarts';

// ── Shared Sub-components ──────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, badge, color = 'var(--main-color)', right, onToggle, isCollapsed, compactSummary, preTitleContent }: {
    icon: React.FC<any>; title: string; badge?: string; color?: string; right?: React.ReactNode; 
    onToggle?: () => void; isCollapsed?: boolean; compactSummary?: React.ReactNode;
    preTitleContent?: React.ReactNode;
}) => (
    <div className={`flex items-center justify-between ${isCollapsed ? '' : 'mb-3'}`}>
        <div className="flex items-center gap-2 cursor-pointer group/header" onClick={onToggle}>
            <div className={`p-1.5 rounded-lg transition-colors ${isCollapsed ? 'bg-(--text-color)/5' : ''}`} style={{ color: isCollapsed ? 'var(--text-color)' : color }}>
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
                        <div className="text-(--text-color)/20 group-hover/header:text-(--text-color)/60 transition-colors">
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

const CurrencyTag = ({ type, amount, className = "", size = "normal" }: { type: 'USD' | 'MXN'; amount: number | string; className?: string; size?: 'normal' | 'small' }) => {
    const isUSD = type === 'USD';
    const isSmall = size === 'small';
    const displayAmount = typeof amount === 'number' ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
    return (
        <div className={`inline-flex items-center gap-1 ${isSmall ? 'px-1 py-0' : 'px-1.5 py-0.5'} rounded bg-(--text-color)/5 border border-(--text-color)/10 ${className}`}>
            <span className={`${isSmall ? 'text-[7px]' : 'text-[8px]'} font-black uppercase tracking-widest ${isUSD ? 'text-emerald-400' : 'text-sky-400'}`}>{type}</span>
            <span className={`${isSmall ? 'text-[9px]' : 'text-[11px]'} font-mono font-black text-(--text-color)/90`}>{displayAmount}</span>
        </div>
    );
};

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

    const sections = [
        { label: 'GREEN (PAID ACQ.)', val: metrics.paidAcq, color: '#22c55e', width: getPercent(metrics.paidAcq) },
        { label: 'YELLOW (REQ MERCH.)', val: metrics.reqMerch, color: '#eab308', width: getPercent(metrics.reqMerch) },
        { label: 'RED (PENDING)', val: metrics.pending, color: '#ef4444', width: getPercent(metrics.pending) },
        { label: 'MAGENTA (REQ EXP.)', val: metrics.reqExp, color: '#d946ef', width: getPercent(metrics.reqExp) },
        { label: 'BLUE (PAID EXP.)', val: metrics.paidExp, color: '#3b82f6', width: getPercent(metrics.paidExp) },
    ];
    return (
        <div className={`flex flex-col ${hideLegend ? (fullWidth ? 'w-full' : '') : 'mt-1 min-w-[340px]'}`}>
            <div className={`relative ${fullWidth ? 'h-6 w-full' : (hideLegend ? 'h-5 w-[140px]' : 'h-6 w-full')} bg-(--text-color)/5 rounded-full overflow-hidden border border-(--text-color)/5 shadow-inner flex`}>
                {sections.map((s, i) => (
                    s.width > 0 && (
                        <div key={s.label} className={`h-full transition-all duration-1000 relative overflow-hidden ${i > 0 ? 'border-l border-(--border-color)' : ''}`}
                            style={{ width: `${s.width}%`, backgroundColor: s.color }}>
                            <div className="absolute inset-0 bg-linear-to-r from-(--text-color)/10 to-transparent" />
                        </div>
                    )
                ))}
            </div>
            {!hideLegend && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-3 pt-2 border-t border-(--text-color)/5">
                    {sections.map(s => (
                        <div key={s.label} className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="text-[7px] font-black text-(--text-color)/40 uppercase tracking-widest">{s.label.split(' (')[0]}</span>
                            <span className="text-[9px] font-mono font-black text-(--text-color)/90">
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
            <polygon points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y0+dy} ${x1},${y0}`} fill="var(--text-color)" fillOpacity="0.05" stroke={color} strokeWidth="1" />
            <polygon points={`${x1},${y0} ${x1+dx},${y0+dy} ${x1+dx},${y2+dy} ${x1},${y2}`} fill="var(--text-color)" fillOpacity="0.02" stroke={color} strokeWidth="1" />
            <rect x={x0} y={y0} width={dw} height={dh} fill="var(--text-color)" fillOpacity="0.04" stroke={color} strokeWidth="1.2" />
        </svg>
    );
};

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
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border border-(--text-color)/5 shadow-inner" style={{ background: `${color}15` }}>
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
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const currentExchangeRate = liveExchangeRate || exchangeRate;
    const [showFinancials, setShowFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);
    const allInventoryItems = useAtomValue(inventoryAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const setFinanceSubTab = useSetAtom(financeSubTabAtom);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const currencyMode = useAtomValue(currencyModeAtom);
    const logisticsData = useAtomValue(logisticsDataAtom);

    const [isLogisticsCollapsed, setIsLogisticsCollapsed] = useState(false);
    const [isFinancialsCollapsed, setIsFinancialsCollapsed] = useState(false);
    const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const isSmall = typeof window !== 'undefined' && window.innerWidth <= 1024;
        if (isSmall) {
            setIsLogisticsCollapsed(true);
            setIsFinancialsCollapsed(true);
        }
        const t = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(t);
    }, []);

    const items = useMemo(() =>
        allInventoryItems.filter(i => i.data.status !== 'Pending Deletion'),
        [allInventoryItems]
    );

    const getVendorIdFromItem = (data: any) => {
        const itemIdStr = String(data.item_id || data.itemId || '');
        let vid = data.vendor_id || data.vendorId;
        if (!vid) {
            if (itemIdStr.includes('-')) vid = itemIdStr.split('-')[0];
            else {
                const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
                const prefix = vKeys.find(v => itemIdStr.startsWith(v));
                if (prefix) vid = prefix;
            }
        }
        return vid || 'Unknown';
    };

    const vendorSummaries = useMemo<VendorSummary[]>(() => {
        const map: Record<string, VendorSummary> = {};
        for (const item of items) {
            const vid = getVendorIdFromItem(item.data);
            if (!map[vid]) map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            const price = parseFloat(String(item.data?.price_mxn || item.data?.price || 0));
            const qty = parseInt(String(item.data?.quantity || 1)) || 1;
            const totalPrice = price * qty;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += totalPrice / currentExchangeRate;
        }
        return Object.values(map).sort((a, b) => b.totalAcqUsd - a.totalAcqUsd);
    }, [items, currentExchangeRate]);

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

    const globalTotals = useMemo(() => {
        const totalAcqValueUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);
        const crates = logisticsData.filter(d => (d.type || '').toLowerCase().includes('crate'));
        const pallets = logisticsData.filter(d => (d.type || '').toLowerCase().includes('pallet'));
        const packedCrates = crates.filter(c => (c as any).inventoryItems?.length > 0).length;
        
        let logisticsSpendMxn = 0, logisticsSpendUsd = 0;
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

        let paidAcqMxn = 0, paidExpMxn = 0, reqMerchMxn = 0, reqExpMxn = 0, pendingMxn = 0;
        
        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            const cat = String(d.category || '').toLowerCase();
            const type = String(d.type || '').toLowerCase();
            const isMerch = sub.includes('acq') || sub.includes('prod') || cat.includes('acquisition') || cat.includes('merchandise');
            const isExp = !isMerch && (type === 'expense' || sub.includes('month') || sub.includes('suppl') || sub.includes('sppl') || sub.includes('labr') || sub.includes('labor') || sub.includes('pack') || sub.includes('oprt') || sub.includes('operation'));
            const amtMxn = (d.amount || 0) + (d.commission || 0);
            if (d.status === 'Paid') {
                if (isMerch) paidAcqMxn += amtMxn;
                else if (isExp) paidExpMxn += amtMxn;
            } else {
                if (isMerch) reqMerchMxn += amtMxn;
                else if (isExp) reqExpMxn += amtMxn;
            }
        });

        const financeItemIds = new Set(financeData.flatMap(d => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            return Array.isArray(rel) ? rel.map(id => String(id)) : (typeof rel === 'string' ? rel.split(',').map(s => s.trim()).filter(Boolean) : []);
        }));
        
        items.forEach(item => {
            const data = item.data;
            const payReqStr = String(data.payReq || data.pay_req || '').toLowerCase();
            const isRequested = (payReqStr === 'true' || payReqStr === 'requested' || payReqStr === 'partial') && !financeItemIds.has(String(item.row));
            const isPending = !isRequested && payReqStr !== 'paid' && !financeItemIds.has(String(item.row));
            
            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseInt(String(data.quantity || '1')) || 1;
            const rowValue = price * qty;

            if (isRequested) reqMerchMxn += rowValue;
            else if (isPending) pendingMxn += rowValue;
        });

        const packedItems = items.filter(i => (i.data as any).logisticsId || (i.data as any).logistics_id).reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0);
        const groupedLogistics: Record<string, any> = {};
        logisticsData.forEach(d => {
            const type = (d.type || 'crate').toLowerCase();
            const w = d.width_cm || d.w || 0, h = d.height_cm || d.h || 0, l = d.length_cm || d.d || 0;
            const key = `${type}-${w}-${h}-${l}`;
            if (!groupedLogistics[key]) groupedLogistics[key] = { type, w, h, l, count: 0, packed: 0 };
            groupedLogistics[key].count++;
            if ((d.inventoryItems?.length || 0) > 0 || d.inventory_ids) groupedLogistics[key].packed++;
        });

        return {
            totalItems: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            totalAcqValueUsd,
            packedCrates,
            packedItems,
            totalCratesAndPallets: crates.length + pallets.length,
            logisticsSpendMxn,
            logisticsSpendUsd,
            totalOpsUsd,
            totalOpsMxn,
            paidAcqMxn,
            paidExpMxn,
            reqMerchMxn,
            reqExpMxn,
            pendingMxn,
            totalLiabilityMxn: (reqMerchMxn + reqExpMxn + pendingMxn),
            groupedLogistics: Object.values(groupedLogistics).sort((a,b) => b.count - a.count)
        };
    }, [vendorSummaries, logisticsData, opsBreakdown, items, financeData, currentExchangeRate]);

    const attributeStats = useMemo(() => {
        const colorMatMap: Record<string, number> = {};
        const shapeDescMap: Record<string, number> = {};
        items.forEach(i => {
            const norm = normalizeInventoryData(i.data);
            const qty = parseInt(norm?.quantity || '1') || 1;
            const cm = `${norm?.color || 'Unknown'} ${norm?.material || 'Unknown'}`.trim();
            colorMatMap[cm] = (colorMatMap[cm] || 0) + qty;
            const desc = (norm?.description || norm?.shortDescription || norm?.item_description || norm?.generatedDescription || '').trim() || 'No Description';
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

    // Chart options
    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-color)', opacity: 0.3, fontSize: 10 } },
        yAxis: { type: 'category', data: vendorSummaries.map(v => v.vendorId), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-color)', opacity: 0.6, fontWeight: 'bold' } },
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
            data: attributeStats.topCM.map(([label, count]) => ({ name: label, value: count })),
            itemStyle: { borderRadius: 10, borderColor: 'rgba(0,0,0,0.5)', borderWidth: 5 },
            label: { show: false }
        }],
        color: ['#A78BFA', '#34D399', '#00AEEF', '#FBBF24', '#F87171'],
        backgroundColor: 'transparent'
    }), [attributeStats]);

    const categoriesOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: attributeStats.topSD.slice(0, 8).map(([label]) => label.split(' - ')[0]), axisLabel: { rotate: 45, color: 'var(--text-color)', opacity: 0.4, fontSize: 8 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-color)' } } },
        series: [{
            type: 'pictorialBar', symbol: 'roundRect',
            data: attributeStats.topSD.slice(0, 8).map(([, count]) => count),
            itemStyle: { color: '#6BCEBB' }
        }],
        backgroundColor: 'transparent'
    }), [attributeStats]);

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
                    <div className="px-6 py-3 bg-(--text-color)/5 border border-(--text-color)/10 rounded-2xl flex flex-col items-end">
                        <span className="text-[9px] font-black opacity-20 uppercase tracking-widest leading-none mb-1">Active Index</span>
                        <span className="text-sm font-mono font-black text-(--text-color)">{items.length.toLocaleString()} <span className="text-[10px] opacity-20">REC</span></span>
                    </div>
                </div>
            </div>

            {/* Content Body */}
            <div className="grow min-h-0 overflow-y-auto m-2 mt-0 relative z-20 custom-scrollbar pr-2 space-y-8 pb-20">
                {/* ── KPI Cards ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={Package} label="Total Assets" value={globalTotals.totalItems.toLocaleString()} color="#6BCEBB" />
                    <StatCard icon={Users} label="Vendor Base" value={String(vendorSummaries.length)} color="#00AEEF" />
                    <StatCard icon={DollarSign} label="Acq Portfolio" value={fmtUSD(globalTotals.totalAcqValueUsd)} subtitle={`≈ ${fmtMXN(globalTotals.totalAcqValueUsd * currentExchangeRate)}`} color="#A78BFA" />
                    <StatCard icon={TrendingUp} label="Total Liability" value={fmtMXN(globalTotals.totalLiabilityMxn)} subtitle={`Paid: ${fmtMXN(globalTotals.paidAcqMxn + globalTotals.paidExpMxn)}`} color="#FBBF24" />
                </div>

                {/* ── EXPENSES & FINANCIALS PANEL (Moved from Overview) ─────────────────────────────────── */}
                <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 space-y-8">
                    <SectionHeader 
                        icon={Wallet} 
                        title="Expenses & Financials" 
                        badge="Management" 
                        onToggle={() => setIsFinancialsCollapsed(!isFinancialsCollapsed)}
                        isCollapsed={isFinancialsCollapsed}
                        compactSummary={
                            <div className="flex items-center gap-4">
                                <CompactFinancialsGraph metrics={{ mexTotal: globalTotals.reqMerchMxn + globalTotals.reqExpMxn + globalTotals.pendingMxn + globalTotals.paidAcqMxn + globalTotals.paidExpMxn, paidAcq: globalTotals.paidAcqMxn, paidExp: globalTotals.paidExpMxn, reqMerch: globalTotals.reqMerchMxn, reqExp: globalTotals.reqExpMxn, pending: globalTotals.pendingMxn }} currentExchangeRate={currentExchangeRate} mode={currencyMode} hideLegend fullWidth />
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black opacity-30 uppercase tracking-widest">Liability:</span>
                                    <CurrencyTag type={currencyMode} amount={currencyMode === 'MXN' ? globalTotals.totalLiabilityMxn : globalTotals.totalLiabilityMxn / currentExchangeRate} size="small" />
                                </div>
                            </div>
                        }
                    />
                    
                    {!isFinancialsCollapsed && (
                        <>
                            <div className="flex flex-col lg:flex-row gap-8 items-start">
                                <div className="flex-1 space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-(--text-color)/40">Resource Distribution Pillar</h3>
                                    <CompactFinancialsGraph 
                                        metrics={{ 
                                            mexTotal: globalTotals.reqMerchMxn + globalTotals.reqExpMxn + globalTotals.pendingMxn + globalTotals.paidAcqMxn + globalTotals.paidExpMxn, 
                                            paidAcq: globalTotals.paidAcqMxn, 
                                            paidExp: globalTotals.paidExpMxn, 
                                            reqMerch: globalTotals.reqMerchMxn, 
                                            reqExp: globalTotals.reqExpMxn, 
                                            pending: globalTotals.pendingMxn 
                                        }} 
                                        currentExchangeRate={currentExchangeRate} 
                                        mode={currencyMode} 
                                    />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {[
                                        { label: 'Monthly Exp.', val: opsBreakdown.Monthly, color: '#6366f1' },
                                        { label: 'Supplies', val: opsBreakdown.Supplies, color: '#06b6d4' },
                                        { label: 'Labor/Fees', val: opsBreakdown.Labor, color: '#f43f5e' },
                                        { label: 'Logistics/Pack', val: opsBreakdown.Packing, color: '#8b5cf6' },
                                        { label: 'Operations', val: opsBreakdown.Operations, color: '#f59e0b' },
                                    ].map(cat => (
                                        <div key={cat.label} className="p-4 rounded-3xl bg-(--text-color)/5 border border-(--text-color)/5 hover:border-(--main-color)/20 transition-all flex flex-col gap-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary)">{cat.label}</p>
                                            <p className="text-sm font-mono font-black text-(--text-color)">
                                                <span className="text-[8px] opacity-30 mr-1">{currencyMode}</span>
                                                {(currencyMode === 'MXN' ? cat.val.mxn : cat.val.usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Paid Acquisition', val: globalTotals.paidAcqMxn, sub: 'Inventory settled', color: '#22c55e' },
                                    { label: 'Requested Merch.', val: globalTotals.reqMerchMxn, sub: 'Awaiting transfer', color: '#eab308' },
                                    { label: 'Pending Payment', val: globalTotals.pendingMxn, sub: 'Active liability', color: '#ef4444' },
                                    { label: 'Operations Paid', val: globalTotals.paidExpMxn, sub: 'Logistics/Supplies', color: '#3b82f6' },
                                ].map(pillar => (
                                    <div key={pillar.label} className="group p-6 rounded-[2rem] bg-linear-to-br from-(--text-color)/5 to-transparent border border-(--text-color)/5 hover:translate-y-[-2px] transition-all flex flex-col gap-3 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <CreditCard size={40} />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-1">{pillar.label}</p>
                                            <CurrencyTag type={currencyMode} amount={currencyMode === 'MXN' ? pillar.val : pillar.val / currentExchangeRate} />
                                        </div>
                                        <p className="text-[10px] text-(--text-color-secondary) opacity-40">{pillar.sub}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ── STORAGE & LOGISTICS PANEL (Moved from Overview) ─────────────────────────────────── */}
                <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 space-y-8">
                    <SectionHeader 
                        icon={Package} 
                        title="Storage & Logistics" 
                        badge="Warehouse" 
                        onToggle={() => setIsLogisticsCollapsed(!isLogisticsCollapsed)}
                        isCollapsed={isLogisticsCollapsed}
                        compactSummary={
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black opacity-30 uppercase tracking-widest">Capacity:</span>
                                    <span className="text-sm font-mono font-black text-(--text-color)">{globalTotals.totalCratesAndPallets} <span className="text-[10px] opacity-20 uppercase">Units</span></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black opacity-30 uppercase tracking-widest">Utilization:</span>
                                    <span className="text-sm font-mono font-black text-(--main-color)">{Math.round((globalTotals.packedCrates / (globalTotals.totalCratesAndPallets || 1)) * 100)}%</span>
                                </div>
                            </div>
                        }
                    />

                    {!isLogisticsCollapsed && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Warehouse Map / Crate View */}
                            <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {globalTotals.groupedLogistics.map((log: any, idx: number) => (
                                    <div key={idx} className="bg-(--text-color)/5 border border-(--border-color) rounded-3xl p-4 flex flex-col items-center gap-4 group/box hover:border-(--main-color)/30 transition-all cursor-default relative overflow-hidden">
                                        <div className="absolute top-2 right-3 text-[8px] font-black opacity-20 group-hover/box:opacity-40">{log.type.toUpperCase()}</div>
                                        <div className="relative h-20 w-full flex items-center justify-center">
                                            <LargeCrateWireframe 
                                                w={log.w} l={log.l} h={log.h} 
                                                type={log.type} 
                                                color={log.packed >= log.count ? 'var(--main-color)' : 'var(--text-color)'} 
                                                size={80} 
                                            />
                                            {log.packed > 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover/box:opacity-100 transition-opacity"><Zap size={14} className="text-(--main-color) animate-pulse" /></div>}
                                        </div>
                                        <div className="w-full text-center space-y-1">
                                            <p className="text-[10px] font-black text-(--text-color)">{log.count} UNITS <span className="opacity-20">@{log.w}x{log.h}</span></p>
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="h-1 flex-1 bg-(--text-color)/10 rounded-full overflow-hidden max-w-[60px]">
                                                    <div className="h-full bg-(--main-color)" style={{ width: `${(log.packed/log.count)*100}%` }} />
                                                </div>
                                                <span className="text-[8px] font-bold opacity-40">{Math.round((log.packed/log.count)*100)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Metrics Sidebar */}
                            <div className="lg:col-span-4 space-y-6">
                                <div className="p-6 rounded-4xl bg-(--text-color)/5 border border-(--text-color)/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-(--text-color)/40">Resource Utilization</h4>
                                        <Activity size={14} className="text-(--main-color)" />
                                    </div>
                                    <div className="space-y-4">
                                        {[
                                            { label: 'Inventory Packed', val: globalTotals.packedItems, total: globalTotals.totalItems, unit: 'Items', color: '#6BCEBB' },
                                            { label: 'Crate Occupancy', val: globalTotals.packedCrates, total: globalTotals.totalCratesAndPallets, unit: 'Crates', color: '#00AEEF' }
                                        ].map(m => (
                                            <div key={m.label} className="space-y-1.5">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[9px] font-black uppercase text-(--text-color-secondary)">{m.label}</span>
                                                    <span className="text-[10px] font-mono font-black">{m.val}/{m.total} <span className="opacity-40">{m.unit}</span></span>
                                                </div>
                                                <div className="h-2 bg-(--text-color)/10 rounded-full overflow-hidden">
                                                    <div className="h-full transition-all duration-1000" style={{ width: `${(m.val/m.total)*100}%`, backgroundColor: m.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-6 rounded-4xl bg-linear-to-br from-[#6BCEBB]15 to-transparent border border-[#6BCEBB]10 flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-[#6BCEBB]20 text-[#6BCEBB]"><DollarSign size={16} /></div>
                                        <div className="flex flex-col">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-[#6BCEBB]">Logistics Overhead</p>
                                            <p className="text-lg font-mono font-black text-(--text-color)">{fmtUSD(globalTotals.logisticsSpendUsd)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-(--text-color-secondary) opacity-50 font-medium leading-relaxed">Cumulative expenditure on storage units, packing materials, and palletizing labor across all vendors.</p>
                                </div>
                            </div>
                        </div>
                    )}
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

                {/* ── ATTR & DESC ANALYSIS (Moved from Overview) ─────────────────────────────────── */}
                <div className="bg-(--glass-bg) border border-(--border-color) rounded-[2.5rem] p-8 space-y-8">
                    <SectionHeader 
                        icon={Shapes} 
                        title="Compositional Analysis" 
                        badge="Detailed Stats" 
                        onToggle={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)}
                        isCollapsed={isAnalysisCollapsed}
                    />
                    
                    {!isAnalysisCollapsed && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 text-(--main-color)">
                                    <Layers size={16} />
                                    <h3 className="text-[11px] font-black uppercase tracking-widest">Material + Color Attribution</h3>
                                </div>
                                <div className="space-y-3">
                                    {attributeStats.topCM.map(([label, count]) => (
                                        <div key={label} className="group flex flex-col gap-1.5">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-(--text-color)/60 group-hover:text-(--text-color) transition-colors">{label}</span>
                                                <span className="text-[10px] font-mono font-black text-(--text-color)/40 group-hover:text-(--main-color) transition-colors">{count} UNITS</span>
                                            </div>
                                            <div className="h-2.5 bg-(--text-color)/5 rounded-full overflow-hidden border border-(--text-color)/5 group-hover:border-(--main-color)/20 transition-all">
                                                <div className="h-full bg-linear-to-r from-(--main-color) to-(--main-color)/40 transition-all duration-1000" style={{ width: `${(count / items.length) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 text-sky-400">
                                    <BarChart3 size={16} />
                                    <h3 className="text-[11px] font-black uppercase tracking-widest">Shape + Description Distribution</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {attributeStats.topSD.map(([label, count]) => (
                                        <div key={label} className="group p-4 rounded-2.5xl bg-(--text-color)/5 border border-(--text-color)/5 flex items-center justify-between hover:bg-(--text-color)/10 hover:border-(--text-color)/10 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-xl bg-(--text-color)/5 border border-(--text-color)/5 flex items-center justify-center text-[10px] font-mono font-black group-hover:bg-(--main-color)/10 group-hover:text-(--main-color) transition-colors">
                                                    {count}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary)/60">{label.split(' - ')[0]}</span>
                                                    <span className="text-[10px] font-black text-(--text-color)/80 line-clamp-1 italic opacity-70 group-hover:opacity-100">{label.split(' - ')[1]}</span>
                                                </div>
                                            </div>
                                            <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-30 transition-opacity" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-20" /> {/* Spacer */}
            </div>
        </div>
    );
}
