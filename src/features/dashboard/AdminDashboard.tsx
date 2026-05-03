import React, { useMemo, useState, useEffect } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, showFinancialsAtom, financeDataAtom, activeViewAtom, userAtom,
    liveExchangeRateAtom, inventoryAtom, logisticsDataAtom,
    inventoryArtifactConfigAtom, currencyModeAtom, paymentsArtifactConfigAtom,
    financeSubTabAtom, paymentCategoryFilterAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, toTitleCase } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Package, DollarSign, Users, TrendingUp, Layers, Shapes,
    BarChart3, PieChart, LayoutGrid, User, Activity,
    RefreshCcw, Wallet, ShoppingCart, CreditCard, ArrowUpRight, ChevronDown, ChevronUp,
    AlertCircle, Grid, Calendar, Archive, Cpu, Box, Zap, LogOut, X,
    Truck, Wrench, FlaskConical, HandCoins, Receipt, PackageCheck
} from 'lucide-react';
import { EChart } from '../../components/EChart';
import type { EChartsOption } from 'echarts';
import { destinationsConfig } from '../../lib/paymentConfig';
import { pendingCardIcon } from './paymentsIcons.svg';
import { PaymentDestination } from '../../lib/Types';

// ── Shared Sub-components ──────────────────────────────────────────
const getContrastColor = (hexcolor: string) => {
    if (!hexcolor) return '#FFFFFF';
    const r = parseInt(hexcolor.substring(1, 3), 16);
    const g = parseInt(hexcolor.substring(3, 5), 16);
    const b = parseInt(hexcolor.substring(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const SectionHeader = ({ icon: Icon, title, badge, color = 'var(--main-color)', right, preTitleContent }: {
    icon: React.FC<any>; title: string; badge?: string; color?: string; right?: React.ReactNode; 
    preTitleContent?: React.ReactNode;
}) => (
    <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
            <div style={{ color: color }}>
                <Icon size={16} strokeWidth={2.5} />
            </div>
            {preTitleContent && (
                <div className="flex items-center h-full">
                    {preTitleContent}
                </div>
            )}
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{title}</h2>
                    {badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-(--text-color-secondary)">{badge}</span>
                    )}
                </div>
            </div>
        </div>
        {right}
    </div>
);

const CurrencyTag = ({ type, amount, className = "", size = "normal" }: { type: 'USD' | 'MXN'; amount: number | string; className?: string; size?: 'normal' | 'small' }) => {
    const isUSD = type === 'USD';
    const isSmall = size === 'small';
    const displayAmount = typeof amount === 'number' ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
    return (
        <div className={`inline-flex items-center gap-1 ${isSmall ? 'px-1 py-0' : 'px-1.5 py-0.5'} ${className}`}>
            <span className={`${isSmall ? 'text-[7px]' : 'text-[8px]'} font-black uppercase tracking-widest ${isUSD ? 'text-emerald-400' : 'text-sky-400'}`}>{type}</span>
            <span className={`${isSmall ? 'text-[9px]' : 'text-[11px]'} font-mono font-black text-(--text-color)`}>{displayAmount}</span>
        </div>
    );
};

const FinancialDonutChart = ({ 
    metrics, currentExchangeRate, mode 
}: { 
    metrics: { 
        paidAcq: number;
        paidExp: number;
        reqMerch: number;
        reqExp: number;
        pending: number;
    };
    currentExchangeRate: number;
    mode: 'USD' | 'MXN';
}) => {
    const chartRef = React.useRef<any>(null);

    const data = [
        { name: 'Paid Acq.', value: metrics.paidAcq, itemStyle: { color: '#22c55e' } },
        { name: 'Req. Merch.', value: metrics.reqMerch, itemStyle: { color: '#eab308' } },
        { name: 'Pending', value: metrics.pending, itemStyle: { color: '#ef4444' } },
        { name: 'Req. Exp.', value: metrics.reqExp, itemStyle: { color: '#d946ef' } },
        { name: 'Paid Exp.', value: metrics.paidExp, itemStyle: { color: '#3b82f6' } },
    ].filter(d => d.value > 0);

    const total = data.reduce((acc, d) => acc + d.value, 0);
    const displayTotal = mode === 'USD' ? total / currentExchangeRate : total;

    const option: EChartsOption = {
        tooltip: {
            trigger: 'item',
            backgroundColor: '#050505',
            borderColor: '#333',
            textStyle: { color: '#fff', fontSize: 10, fontFamily: 'monospace' },
            formatter: (params: any) => {
                const val = mode === 'USD' ? params.value / currentExchangeRate : params.value;
                return `${params.name}: ${mode} ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            }
        },
        series: [{
            type: 'pie',
            radius: ['65%', '90%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 0, borderColor: '#000', borderWidth: 2 },
            label: { show: false },
            emphasis: { label: { show: false } },
            data: data
        }],
        graphic: [{
            type: 'text',
            left: 'center',
            top: 'center',
            style: {
                text: `${mode}\n${displayTotal >= 1000000 ? (displayTotal/1000000).toFixed(1)+'M' : (displayTotal/1000).toFixed(0)+'K'}`,
                textAlign: 'center',
                fill: 'var(--text-color)',
                fontSize: 14,
                fontWeight: '900',
                fontFamily: 'monospace'
            }
        }]
    };

    return (
        <div className="w-full aspect-square max-w-[180px] relative animate-in fade-in zoom-in duration-700">
            <EChart option={option} className="w-full h-full" />
        </div>
    );
};

const LargeCrateWireframe: React.FC<{ w?: number; l?: number; h?: number; type?: string; size?: number; color?: string; fillPercent?: number }> = ({
    w = 60, l = 60, h = 60, type = 'crate', size = 130, color = 'var(--main-color)', fillPercent = 0
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

    const fillH = Math.round(dh * (fillPercent / 100));
    const fillY = y2 - fillH;

    return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ filter: `drop-shadow(0 0 10px ${color})`, overflow: 'visible' }}>
            {/* Hidden Back Edges */}
            <line x1={x0+dx} y1={y0+dy} x2={x0+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />
            <line x1={x0+dx} y1={y0+dy} x2={x1+dx} y2={y0+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />
            <line x1={x0+dx} y1={y2+dy} x2={x1+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />

            {/* Internal Fill (Cargo Block) */}
            {fillPercent > 0 && (
                <g opacity={0.6}>
                    {/* Side Fill */}
                    <polygon points={`${x1},${y2} ${x1+dx},${y2+dy} ${x1+dx},${fillY+dy} ${x1},${fillY}`} fill={color} />
                    {/* Top Fill (Liquid/Surface Level) */}
                    <polygon points={`${x0},${fillY} ${x0+dx},${fillY+dy} ${x1+dx},${fillY+dy} ${x1},${fillY}`} fill={color} filter="brightness(1.3)" />
                    {/* Front Fill */}
                    <rect x={x0} y={fillY} width={dw} height={fillH} fill={color} filter="brightness(1.1)" />
                    {/* Glow Highlight on surface */}
                    <line x1={x0} y1={fillY} x2={x1} y2={fillY} stroke="white" strokeWidth="0.5" opacity="0.3" />
                </g>
            )}

            {/* Main Wireframe Structure */}
            <polygon points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y0+dy} ${x1},${y0}`} fill="none" stroke={color} strokeWidth="1" />
            <polygon points={`${x1},${y0} ${x1+dx},${y0+dy} ${x1+dx},${y2+dy} ${x1},${y2}`} fill="none" stroke={color} strokeWidth="1" />
            <rect x={x0} y={y0} width={dw} height={dh} fill="none" stroke={color} strokeWidth="1.2" />
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
    <div className="flex flex-col gap-3 p-6 transition-all group">
        <div className="flex items-center justify-between">
            <div style={{ color }}>
                <Icon size={28} strokeWidth={1.5} />
            </div>
            {subtitle && <span className="text-[10px] font-mono font-bold text-(--text-color-secondary)">{subtitle}</span>}
        </div>
        <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary) mb-1">{label}</p>
            <p className="text-3xl font-black font-mono text-(--text-color) leading-none tracking-tighter">{value}</p>
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
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(t);
    }, []);

    const items = useMemo(() => {
        return allInventoryItems.filter(i => i.data?.status !== 'Pending Deletion');
    }, [allInventoryItems]);

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

        const packedItems = items.filter(i => {
            const data = i.data as any;
            return data.logisticsId || data.logistics_id || data.crateId || data.crate_id || data.pallet_id || data.palletId || data.container_id || data.containerId;
        }).reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0);
        
        const packedCrateCount = logisticsData.filter(d => (d.inventoryItems?.length || 0) > 0 || d.inventory_ids || d.inventoryIds).length;

        // --- LOGISTICS CONSOLIDATION ENGINE ---
        const displayLogistics: any[] = [];
        const emptyGroups: Record<string, any> = {};

        logisticsData.forEach(d => {
            const packedCount = d.inventoryItems?.length || (d.inventory_ids || d.inventoryIds ? 1 : 0);
            const isPacked = packedCount > 0;
            const type = (d.type || 'crate').toLowerCase();
            const w = d.width_cm || d.w || 0, h = d.height_cm || d.h || 0, l = d.length_cm || d.d || 0;

            if (!isPacked) {
                // Consolidate empty items by size/type
                const key = `${type}-${w}-${h}-${l}`;
                if (!emptyGroups[key]) {
                    emptyGroups[key] = { type, w, h, l, count: 0, packed: 0, isGroup: true };
                }
                emptyGroups[key].count++;
            } else {
                // Individual entry for packed/partial
                displayLogistics.push({
                    type, w, h, l, 
                    count: 1, 
                    packed: 1, // Normalized for individual display fill
                    isIndividual: true,
                    originalId: d.id,
                    shortId: String(d.id || '').split('-').pop()?.toUpperCase().slice(-4) || 'P-1'
                });
            }
        });

        // Combine and sort: Prioritize Empty (Consolidated) first, then sort by Volume
        const finalLogistics = [
            ...displayLogistics, // Individual packed ones
            ...Object.values(emptyGroups) // Consolidated empty ones
        ].sort((a, b) => {
            if (a.isGroup && !b.isGroup) return -1;
            if (!a.isGroup && b.isGroup) return 1;
            return (b.w * b.h * b.l) - (a.w * a.h * a.l);
        });

        return {
            totalItems: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            totalAcqValueUsd,
            packedCrates: packedCrateCount,
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
            totalAcqValueMxn: vendorSummaries.reduce((acc, v) => acc + v.totalAcqMxn, 0),
            groupedLogistics: finalLogistics
        };
    }, [vendorSummaries, logisticsData, opsBreakdown, items, financeData, currentExchangeRate]);

    const attributeStats = useMemo(() => {
        const colorMatMap: Record<string, { label: string, value: number }> = {};
        const shapeDescMap: Record<string, { label: string, value: number }> = {};
        
        items.forEach(i => {
            const norm = normalizeInventoryData(i.data);
            const qty = parseInt(norm?.quantity || '1') || 1;
            
            // Normalize Color + Material key
            const color = (norm?.color || 'Unknown').trim();
            const material = (norm?.material || 'Unknown').trim();
            const colorUpper = color.toUpperCase();
            const materialUpper = material.toUpperCase();
            const cmKey = `${colorUpper} ${materialUpper}`;
            
            if (!colorMatMap[cmKey]) {
                const rawLabel = `${color} ${material}`.trim();
                colorMatMap[cmKey] = { label: toTitleCase(rawLabel) || 'Unknown', value: 0 };
            }
            colorMatMap[cmKey].value += qty;
            
            // Normalize Shape + Description key
            const desc = (norm?.description || norm?.shortDescription || norm?.item_description || norm?.generatedDescription || '').trim() || 'No Description';
            const shape = (norm?.shape || 'Unknown').trim();
            const descUpper = desc.toUpperCase();
            const shapeUpper = shape.toUpperCase();
            const sdKey = `${shapeUpper} - ${descUpper}`;
            
            if (!shapeDescMap[sdKey]) {
                const rawLabel = `${shape} - ${desc}`;
                shapeDescMap[sdKey] = { label: toTitleCase(rawLabel), value: 0 };
            }
            shapeDescMap[sdKey].value += qty;
        });

        return { 
            topCM: Object.values(colorMatMap)
                .sort((a,b) => b.value - a.value)
                .slice(0, 12)
                .sort((a,b) => {
                    // Normalize labels for reliable sorting by Material (last word)
                    const matA = a.label.split(/\s+/).pop() || '';
                    const matB = b.label.pop ? b.label.split(/\s+/).pop() : (b.label as string).split(/\s+/).pop() || ''; // Safety
                    
                    // Note: b.label is definitely string here, but TypeScript might want reassurance or my split logic is fine.
                    const labelA = a.label;
                    const labelB = b.label;
                    const mNameA = labelA.split(/\s+/).pop() || '';
                    const mNameB = labelB.split(/\s+/).pop() || '';
                    
                    if (mNameA !== mNameB) return mNameA.localeCompare(mNameB);
                    return labelA.localeCompare(labelB);
                })
                .map(v => [v.label, v.value]),
            topSD: Object.values(shapeDescMap)
                .sort((a,b) => b.value - a.value)
                .slice(0, 15) // Increased slice to allow for more clusters in the list
                .sort((a,b) => {
                    // label format is "Shape - Description"
                    const partsA = a.label.split(' - ');
                    const partsB = b.label.split(' - ');
                    
                    const descA = partsA[1] || '';
                    const descB = partsB[1] || '';
                    
                    // Core noun is usually the last word
                    const nounA = descA.split(/\s+/).pop() || '';
                    const nounB = descB.split(/\s+/).pop() || '';
                    
                    if (nounA !== nounB) return nounA.localeCompare(nounB);
                    if (descA !== descB) return descA.localeCompare(descB);
                    return partsA[0].localeCompare(partsB[0]);
                })
                .map(v => [v.label, v.value])
        };
    }, [items]);

    const fmtUSD = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD' : '***';
    const fmtMXN = (v: number) => showFinancials ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN' : '***';

    // Chart options
    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'var(--border-color)' } }, axisLabel: { color: 'var(--text-color-secondary)', fontSize: 10, formatter: (val: any) => currencyMode === 'MXN' ? `$${(val/1000).toFixed(0)}k` : `$${(val/1).toFixed(0)}` } },
        yAxis: { type: 'category', data: vendorSummaries.map(v => v.vendorId), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-color)', fontWeight: 'bold' } },
        series: [{
            name: currencyMode === 'MXN' ? 'Value MXN' : 'Value USD', 
            type: 'bar', 
            data: vendorSummaries.map(v => currencyMode === 'MXN' ? v.totalAcqMxn : v.totalAcqUsd),
            itemStyle: { color: (params: any) => vendorSummaries[params.dataIndex].color, borderRadius: [0, 8, 8, 0] }
        }],
        backgroundColor: 'transparent'
    }), [vendorSummaries, currencyMode]);

    const pieOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie', radius: ['40%', '70%'],
            data: attributeStats.topCM.map(([label, count]) => ({ name: label, value: count })),
            itemStyle: { borderRadius: 10, borderColor: '#000', borderWidth: 5 },
            label: { show: false }
        }],
        color: ['#A78BFA', '#34D399', '#00AEEF', '#FBBF24', '#F87171'],
        backgroundColor: 'transparent'
    }), [attributeStats]);

    const vendorValuePieOption = useMemo<EChartsOption>(() => ({
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

    const categoriesOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: attributeStats.topSD.slice(0, 8).map(([label]) => label.split(' - ')[0]), axisLabel: { rotate: 45, color: 'var(--text-color-secondary)', fontSize: 8 } },
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
            <div className="h-full flex items-center justify-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary)">Synchronizing Intelligence...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative animate-in fade-in duration-500">
            {/* Main Content */}
            <div className="grow min-h-0 overflow-y-auto custom-scrollbar px-10 space-y-12 pt-6 pb-8">

                      <div className="space-y-12">
                    <SectionHeader 
                        icon={Wallet} 
                        title="Expenses & Financials" 
                        badge="Management" 
                        color="var(--main-color)"
                    />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start bg-white/[0.03] backdrop-blur-2xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                        {/* Donut Chart - Capital Distribution */}
                        <div className="lg:col-span-5 flex flex-col items-center gap-6">
                            <div className="flex flex-col items-center w-full">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-(--text-color-secondary) mb-4">Capital Allocation Ecosystem</span>
                                <div className="w-full flex justify-center">
                                    <FinancialDonutChart 
                                        metrics={{ 
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
                            </div>
                            
                            {/* Distribution Labels */}
                            <div className="grid grid-cols-1 gap-4 w-full">
                                {([
                                    { label: 'Inventory', val: globalTotals.paidAcqMxn + globalTotals.reqMerchMxn, color: '#22c55e', sub: 'Capital Assets' },
                                    { label: 'Operations', val: globalTotals.paidExpMxn + globalTotals.reqExpMxn, color: '#3b82f6', sub: 'Burn Rate' },
                                    { label: 'Liability', val: globalTotals.pendingMxn, color: '#ef4444', sub: 'Outstanding' },
                                ] as const).map(g => (
                                    <div key={g.label} className="flex flex-col gap-1 border-l-4 pl-4 bg-white/[0.05] backdrop-blur-md p-3 border border-white/5" style={{ borderColor: g.color }}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color)">{g.label}</span>
                                            <span className="text-[12px] font-mono font-black" style={{ color: g.color }}>
                                                {((g.val / (globalTotals.paidAcqMxn + globalTotals.reqMerchMxn + globalTotals.paidExpMxn + globalTotals.reqExpMxn + globalTotals.pendingMxn)) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <p className="text-[8px] text-(--text-color-secondary) font-bold uppercase tracking-[0.2em]">{g.sub}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Financial Pillars & Breakdown */}
                        <div className="lg:col-span-7 space-y-12">
                            {/* Primary Payment Pillars */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                {([
                                    { label: 'Paid Acq.', val: globalTotals.paidAcqMxn, sub: 'Inventory Settled', color: '#22c55e', Icon: PackageCheck },
                                    { label: 'Req. Merch.', val: globalTotals.reqMerchMxn, sub: 'Awaiting Trans.', color: '#eab308', Icon: ShoppingCart },
                                    { label: 'Pending Payment', val: globalTotals.pendingMxn, sub: 'Active Liability', color: '#ef4444', Icon: Receipt },
                                    { label: 'Operations Paid', val: globalTotals.paidExpMxn, sub: 'Logistics/Supp.', color: '#3b82f6', Icon: Wrench },
                                ] as const).map(pillar => (
                                    <div key={pillar.label} className="flex flex-col gap-2 group cursor-default">
                                        <div className="flex items-center gap-2">
                                            <pillar.Icon size={12} style={{ color: pillar.color }} strokeWidth={2.5} />
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: pillar.color }}>{pillar.label}</p>
                                        </div>
                                        <p className="text-2xl font-mono font-black text-(--text-color) tracking-tighter">
                                            <span className="text-[10px] text-(--text-color-secondary) mr-1">{currencyMode}</span>
                                            {showFinancials
                                                ? (currencyMode === 'MXN' ? pillar.val : pillar.val / currentExchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })
                                                : '***'
                                            }
                                        </p>
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-(--text-color-secondary)">{pillar.sub}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Operational Breakdown - Unified Colors */}
                            <div className="pt-8 border-t border-white/10">
                                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary) mb-8">Operational Allocation Breakdown</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                                    {([
                                        { label: 'Monthly', val: opsBreakdown.Monthly, color: '#4f46e5', Icon: Calendar },
                                        { label: 'Supplies', val: opsBreakdown.Supplies, color: '#0891b2', Icon: FlaskConical },
                                        { label: 'Labor/Fees', val: opsBreakdown.Labor, color: '#9333ea', Icon: HandCoins },
                                        { label: 'Logistics/Pack', val: opsBreakdown.Packing, color: '#6366f1', Icon: Truck },
                                        { label: 'Operations', val: opsBreakdown.Operations, color: '#2563eb', Icon: Wrench },
                                    ] as const).map(cat => (
                                        <div key={cat.label} className="flex flex-col gap-2 border-l border-white/10 pl-4 hover:border-l-2 transition-all" style={{ borderLeftColor: cat.color }}>
                                            <div className="flex items-center gap-2">
                                                <cat.Icon size={11} style={{ color: cat.color }} strokeWidth={2.5} />
                                                <p className="text-[9px] font-black uppercase tracking-widest text-(--text-color)">{cat.label}</p>
                                            </div>
                                            <p className="text-lg font-mono font-black text-(--text-color) tracking-tight">
                                                <span className="text-[9px] text-(--text-color-secondary) mr-1">{currencyMode}</span>
                                                {(currencyMode === 'MXN' ? cat.val.mxn : cat.val.usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Liability Ledger - Granular Detail */}
                            <div className="pt-8 border-t border-white/10">
                                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary) mb-6">Liability Ledger: Top Pending Vendors</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {vendorSummaries.slice(0, 4).map(v => (
                                        <div key={v.vendorId} className="flex items-center justify-between p-4 bg-white/[0.05] backdrop-blur-sm border border-white/5 border-l-2 hover:bg-white/10 transition-all" style={{ borderLeftColor: v.color }}>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-(--text-color)">{v.vendorId}</span>
                                                <span className="text-[12px] font-mono font-black text-(--text-color)">
                                                    {currencyMode === 'MXN' ? fmtMXN(v.totalAcqMxn) : fmtUSD(v.totalAcqUsd)}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[8px] font-bold uppercase tracking-widest text-(--text-color-secondary)">ITEM EQUITY</span>
                                                <p className="text-[11px] font-mono font-black text-(--text-color)">{v.itemCount} UNITS</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── STORAGE & LOGISTICS PANEL (Moved from Overview) ─────────────────────────────────── */}
                {/* ── STORAGE & LOGISTICS SECTION ─────────────────────────────────── */}
                <div className="space-y-12">
                    <SectionHeader 
                        icon={Package} 
                        title="Storage & Logistics" 
                        badge="Warehouse" 
                    />

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                        {/* Warehouse Map / Crate View - REDESIGNED: Compact, Modern, Containerless */}
                        <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-16 gap-y-20">
                            {globalTotals.groupedLogistics.map((log: any, idx: number) => {
                                const isPacked = log.packed >= log.count;
                                const statusColor = isPacked ? 'var(--main-color)' : 'var(--text-color-secondary)';
                                return (
                                    <div key={idx} className="flex flex-col items-center gap-6 group/box transition-all cursor-default relative">
                                        {/* Floating Shelf Base */}
                                        <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                        
                                        <div className="relative h-32 w-full flex items-center justify-center transition-transform group-hover/box:-translate-y-4">
                                            <LargeCrateWireframe 
                                                w={log.w} l={log.l} h={log.h} 
                                                type={log.type} 
                                                color={statusColor} 
                                                size={130} 
                                                fillPercent={(log.packed / log.count) * 100}
                                            />
                                            {log.packed > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/box:scale-125 transition-transform">
                                                    <Zap size={20} className={isPacked ? "text-(--main-color) animate-pulse" : "text-white"} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="w-full text-center space-y-2 relative z-10 p-2">
                                            <div className="flex flex-col items-center">
                                                <span className="text-[10px] font-black text-(--text-color) tracking-[0.4em] uppercase mb-2">{log.type}</span>
                                                <p className="text-2xl font-black text-(--text-color) tracking-tighter leading-none group-hover/box:scale-110 transition-transform">
                                                    {log.isIndividual ? (
                                                        <span className="text-[10px] font-mono border-b border-dashed border-white pb-1">ID: #{log.shortId}</span>
                                                    ) : (
                                                        <>{log.count} <span className="text-[11px] font-bold text-(--text-color-secondary) tracking-widest uppercase ml-1">Units</span></>
                                                    )}
                                                </p>
                                                <p className="text-[10px] font-mono font-bold text-(--text-color-secondary) mt-2">@{log.w}x{log.h}x{log.l}</p>
                                            </div>
                                            {!log.isIndividual && (
                                                <div className="flex items-center justify-center gap-3 mt-3">
                                                    <div className="h-[3px] w-16 bg-white/10 overflow-hidden rounded-full shadow-inner">
                                                        <div className="h-full transition-all duration-700" style={{ width: `${(log.packed/log.count)*100}%`, backgroundColor: statusColor }} />
                                                    </div>
                                                    <span className="text-[10px] font-mono font-black" style={{ color: statusColor }}>{Math.round((log.packed/log.count)*100)}%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Metrics & Accumulation - Grouped into a Floating Module */}
                        <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-12 pt-16 border-t border-white/5">
                            {[
                                { label: 'Inventory Packed', val: globalTotals.packedItems, total: globalTotals.totalItems, unit: 'Items', color: '#6BCEBB', icon: PackageCheck },
                                { label: 'Crate Occupancy', val: globalTotals.packedCrates, total: globalTotals.totalCratesAndPallets, unit: 'Crates', color: '#00AEEF', icon: LayoutGrid }
                            ].map(m => (
                                <div key={m.label} className="flex items-start gap-8 group/stat p-6 hover:bg-white/[0.03] rounded-3xl transition-all border border-transparent hover:border-white/10">
                                    <div className="p-4 bg-white/[0.04] border border-white/20 rounded-2xl group-hover/stat:rotate-12 transition-transform shadow-2xl" style={{ color: m.color }}>
                                        <m.icon size={28} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex flex-col flex-1 gap-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[11px] font-black uppercase text-(--text-color) tracking-[0.3em] group-hover/stat:text-(--text-color) transition-colors">{m.label}</span>
                                            <span className="text-2xl font-mono font-black" style={{ color: m.color }}>
                                                {m.val}<span className="text-[12px] text-(--text-color-secondary) mx-2">/</span>{m.total}
                                            </span>
                                        </div>
                                        <div className="h-[4px] bg-white/10 overflow-hidden rounded-full shadow-inner">
                                            <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${(m.val/m.total)*100}%`, backgroundColor: m.color }} />
                                        </div>
                                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-(--text-color-secondary)">{m.unit} Strategy Coefficient</p>
                                    </div>
                                </div>
                            ))}

                            {/* Logistics Spend Accumulation - Redesigned Floating Summary */}
                            <div className="flex items-center gap-10 pl-10 border-l border-white/10 group/spend hover:bg-white/[0.03] p-6 rounded-3xl transition-all border border-transparent hover:border-r-white/10">
                                <div className="p-6 bg-white/[0.1] border border-white/20 rounded-full group-hover/spend:scale-125 transition-transform flex items-center justify-center">
                                    <DollarSign size={32} className="text-[#6BCEBB]" strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-[#6BCEBB]">Logistics Ledger Accumulation</p>
                                    <p className="text-4xl font-mono font-black text-(--text-color) tracking-tighter leading-none group-hover/spend:translate-x-2 transition-transform">
                                        <span className="text-[14px] text-(--text-color-secondary) mr-3 font-black h-fit mb-auto">{currencyMode}</span>
                                        {currencyMode === 'MXN' ? globalTotals.logisticsSpendMxn.toLocaleString('en-US', { maximumFractionDigits: 0 }) : globalTotals.logisticsSpendUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--text-color-secondary) mt-2 leading-tight">Comprehensive Overhead Strategy</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ANALYTICS GRID SECTION ─────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-12 border-t border-white/10">
                    {/* Main Bar Chart */}
                    <div className="lg:col-span-2 space-y-12">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <BarChart3 size={20} className="text-(--main-color)" />
                                <h2 className="text-[12px] font-black uppercase tracking-[0.4em] text-(--text-color)">Acquisition Portfolio by Vendor</h2>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-bold text-(--text-color-secondary) uppercase tracking-widest">Global Assets</span>
                                    <span className="text-[12px] font-mono font-black text-(--text-color)">
                                        {currencyMode === 'MXN' ? fmtMXN(globalTotals.totalAcqValueMxn) : fmtUSD(globalTotals.totalAcqValueUsd)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <EChart option={vendorChartOption} style={{ height: '600px' }} />
                    </div>

                    {/* Secondary Analytics */}
                    <div className="flex flex-col gap-12">
                        {/* Material Pie */}
                        <div className="flex-1 flex flex-col gap-8">
                            <div className="flex items-center gap-4 px-2">
                                <PieChart size={18} className="text-blue-400" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-(--text-color)">Material Concentration</h3>
                            </div>
                            <EChart option={pieOption} style={{ height: '320px' }} />
                        </div>

                        {/* Category Stats */}
                        <div className="flex-1 flex flex-col gap-8">
                            <div className="flex items-center gap-4 px-2">
                                <Shapes size={18} className="text-[#6BCEBB]" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-(--text-color)">Category Distribution</h3>
                            </div>
                            <EChart option={categoriesOption} style={{ height: '320px' }} />
                        </div>
                    </div>
                </div>

                {/* ── GLOBAL DISTRIBUTION ANALYSIS (Moved from Overview) ─────────────────────────────────── */}
                <div className="space-y-12 pt-12 border-t border-white/10">
                    <SectionHeader 
                        icon={TrendingUp} 
                        title="Global Distribution Analysis" 
                        badge="Network Intelligence" 
                        right={
                            <div className="hidden sm:flex gap-4">
                                <span className="text-[10px] font-black text-(--text-color)/20 uppercase tracking-[0.3em]">Acq. Balance: {showFinancials ? '$' + globalTotals.totalAcqValueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '***'}</span>
                            </div>
                        }
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        {/* Acquisitions Concentration (Value) */}
                        <div className="flex flex-col col-span-1 lg:col-span-2 border-b border-white/5 pb-10">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color)/20 mb-6">Acquisitions Concentration (Value)</span>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                                <div className="w-full sm:w-1/2 h-56">
                                    <EChart option={vendorValuePieOption} style={{ height: '100%' }} />
                                </div>
                                <div className="w-full sm:w-1/2 space-y-4 px-4 overflow-y-auto max-h-[220px] custom-scrollbar">
                                    {vendorSummaries.slice(0, 8).map(v => (
                                        <div key={v.vendorId} 
                                            onClick={() => setPaymentsArtifactConfig({ isOpen: true, vendor: v.vendorId, title: `${v.vendorId} Payments` })}
                                            className="flex flex-col border-b border-white/5 pb-2 group cursor-pointer hover:bg-white/5 px-2 -mx-2 rounded-md transition-all"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                                                    <span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest group-hover:text-(--text-color)/60">{v.vendorId}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[12px] font-mono font-black text-(--text-color)/80">
                                                        {currencyMode === 'MXN' ? fmtMXN(v.totalAcqUsd * currentExchangeRate) : fmtUSD(v.totalAcqUsd)}
                                                    </span>
                                                    <span className={`text-[7px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                        {currencyMode}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full group-hover:brightness-125 transition-all" style={{ width: `${(v.totalAcqUsd / (globalTotals.totalAcqValueUsd || 1) * 100)}%`, backgroundColor: v.color }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Units Share by Vendor */}
                        <div className="flex flex-col col-span-1 lg:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color)/20 mb-4 ">Units Share by Vendor</span>
                            <div className="flex flex-col gap-4">
                                <div className="h-3 w-full rounded-2xl overflow-hidden flex shadow-2xl bg-white/5 border border-white/5">
                                    {vendorSummaries.map((v, idx) => {
                                        const share = (v.itemCount / (globalTotals.totalItems || 1)) * 100;
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
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 bg-(--sidebar-bg)/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap z-50 pointer-events-none font-mono border border-white/10 shadow-2xl text-(--text-color)">
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
                    </div>
                </div>

                {/* ── ATTR & DESC ANALYSIS (Moved from Overview) ─────────────────────────────────── */}
                {/* ── ATTR & DESC ANALYSIS SECTION ─────────────────────────────────── */}
                <div className="space-y-12 pt-12 border-t border-white/10">
                    <SectionHeader 
                        icon={Shapes} 
                        title="Compositional Analysis" 
                        badge="Detailed Stats" 
                    />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        <div className="space-y-10">
                            <div className="flex items-center gap-4 text-(--main-color) px-2">
                                <Layers size={18} />
                                <h3 className="text-[12px] font-black uppercase tracking-[0.3em]">Material + Color Attribution</h3>
                            </div>
                            <div className="space-y-6">
                                {attributeStats.topCM.map(([label, count]) => (
                                    <div key={label} className="group flex flex-col gap-3">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) group-hover:text-(--text-color) transition-colors">{label}</span>
                                            <span className="text-[11px] font-mono font-black text-(--text-color-secondary) group-hover:text-(--main-color) transition-colors">{count} UNITS</span>
                                        </div>
                                        <div className="h-0.5 bg-white/10 overflow-hidden group-hover:bg-(--main-color) transition-all">
                                            <div className="h-full bg-(--main-color) transition-all duration-1000" style={{ width: `${(count / items.length) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-10">
                            <div className="flex items-center gap-4 text-sky-400 px-2">
                                <BarChart3 size={18} />
                                <h3 className="text-[12px] font-black uppercase tracking-[0.3em]">Shape + Description Distribution</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {attributeStats.topSD.map(([label, count]) => (
                                    <div key={label} className="group p-6 flex items-center justify-between border-b border-white/10 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.08] transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className="text-[12px] font-mono font-black text-(--text-color-secondary) group-hover:text-(--main-color) transition-colors">
                                                {count}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary)">{label.split(' - ')[0]}</span>
                                                <span className="text-[11px] font-black text-(--text-color) line-clamp-1 italic tracking-tight">{label.split(' - ')[1]}</span>
                                            </div>
                                        </div>
                                        <ArrowUpRight size={18} className="text-(--text-color-secondary) group-hover:text-(--main-color) transition-all" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="h-32" /> {/* Spacer */}
            </div>
        </div>
    );
}
