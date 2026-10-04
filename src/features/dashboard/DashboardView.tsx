import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    exchangeRateAtom, liveExchangeRateAtom, showFinancialsAtom,
    financeDataAtom, inventoryAtom, storeInventoryAtom, logisticsDataAtom,
    activeViewAtom, financeTotalsAtom, currencyModeAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { vendors, DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';
import { PaymentDestination } from '../../lib/Types';
import { normalizeInventoryData, toTitleCase } from '../../lib/utils';
import { Grid, ChevronDown } from 'lucide-react';
import { tr } from '../../lib/i18n';

// Sections
import { KpiStrip } from './sections/KpiStrip';
import { FinanceSummarySection } from './sections/FinanceSummarySection';
import { InventoryStatusSection } from './sections/InventoryStatusSection';
import { VendorAcquisitionSection } from './sections/VendorAcquisitionSection';
import { MaterialBreakdownSection } from './sections/MaterialBreakdownSection';
import { ExpenseSection } from './sections/ExpenseSection';
import { DeviceFleetTile } from './sections/DeviceFleetTile';

export default function DashboardView() {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const currentExchangeRate = liveExchangeRate || exchangeRate;
    
    const financeData = useAtomValue(financeDataAtom);
    const allInventoryItems = useAtomValue(inventoryAtom);
    const logisticsData = useAtomValue(logisticsDataAtom);
    const setFinanceTotals = useSetAtom(financeTotalsAtom);
    
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(t);
    }, []);

    const items = useMemo(() => allInventoryItems.filter(i => i.data?.status !== 'Pending Deletion'), [allInventoryItems]);

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

    const vendorSummaries = useMemo(() => {
        const map: Record<string, any> = {};
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
        return Object.values(map).sort((a: any, b: any) => b.totalAcqUsd - a.totalAcqUsd);
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
            const amtUsd = amtMxn / (d.exchange_rate || currentExchangeRate || DEFAULT_EXCHANGE_RATE);
            if (sub.includes('month') || sub.includes('mo-exp')) { cats.Monthly.mxn += amtMxn; cats.Monthly.usd += amtUsd; }
            else if (sub.includes('suppl') || sub.includes('sppl')) { cats.Supplies.mxn += amtMxn; cats.Supplies.usd += amtUsd; }
            else if (sub.includes('labr') || sub.includes('labor')) { cats.Labor.mxn += amtMxn; cats.Labor.usd += amtUsd; }
            else if (sub.includes('pack')) { cats.Packing.mxn += amtMxn; cats.Packing.usd += amtUsd; }
            else if (sub.includes('oprt') || sub.includes('operation')) { cats.Operations.mxn += amtMxn; cats.Operations.usd += amtUsd; }
        });
        return cats;
    }, [financeData, currentExchangeRate]);

    // ClientOverview Finance Logistics
    const activeDestPendingRecords = useMemo(() => financeData.filter(d => (d.status === 'Requested' || !d.status) && d.destination), [financeData]);
    const activeDestReqNetMXN = useMemo(() => activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0), [activeDestPendingRecords]);
    
    const requisitions = useMemo(() => {
        const groups: any[] = [];
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
                    groups.push({ key: `${key}-${vid}`, cfg, docs: vDocs, type: 'independent', vendorId: vid });
                });
            } else {
                groups.push({ key, cfg, docs, type: 'grouped' });
            }
        });
        return groups.sort((a,b) => {
            const sumA = a.docs.reduce((acc: number, d: any) => acc + (d.amount || 0) + (d.commission || 0), 0);
            const sumB = b.docs.reduce((acc: number, d: any) => acc + (d.amount || 0) + (d.commission || 0), 0);
            return sumB - sumA;
        });
    }, [activeDestPendingRecords]);

    const pendingItems = useMemo(() => items.filter(i => {
        const data = i.data as any;
        const status = (data?.status || data?.item_status || '').toLowerCase();
        const payReqStr = String(data?.payReq || data?.pay_req || '').toLowerCase();
        const workbook = String(data?.workbook || '').toLowerCase();
        if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid') return false;
        const isExcluded = payReqStr === 'true' || payReqStr === 'paid' || payReqStr === 'requested';
        return ['acquired', 'acquisition', 'acquisitions', 'production'].includes(status) && !isExcluded;
    }), [items]);

    const comingPaymentsByVendor = useMemo(() => {
        const groups: Record<string, any> = {};
        for (const item of pendingItems) {
            const data = item.data;
            const vid = getVendorIdFromItem(data);
            if (!groups[vid]) groups[vid] = { total: 0 };
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
                }
            } else {
                groups[vid].total += itemTotal;
            }
        }
        return Object.entries(groups).map(([vid, data]) => ({ vendorId: vid, ...data })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
    }, [pendingItems]);

    // Admin Dashboard Global Totals
    const globalTotals = useMemo(() => {
        const totalAcqValueUsd = vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0);
        let logisticsSpendMxn = 0, logisticsSpendUsd = 0;
        let paidAcqMxn = 0, paidExpMxn = 0, reqMerchMxn = 0, reqExpMxn = 0, pendingMxn = 0;

        financeData.forEach(d => {
            const sub = String(d.subcategory || '').toLowerCase();
            const cat = String(d.category || '').toLowerCase();
            const type = String(d.type || '').toLowerCase();
            const desc = String(d.description || '').toLowerCase();
            
            const amtMxn = (d.amount || 0) + (d.commission || 0);
            const amtUsd = amtMxn / (d.exchange_rate || currentExchangeRate || DEFAULT_EXCHANGE_RATE);

            if (sub.includes('crate') || sub.includes('pallet') || desc.includes('crate') || desc.includes('pallet')) {
                logisticsSpendMxn += amtMxn;
                logisticsSpendUsd += amtUsd;
            }

            const isMerch = sub.includes('acq') || sub.includes('prod') || cat.includes('acquisition') || cat.includes('merchandise');
            const isExp = !isMerch && (type === 'expense' || sub.includes('month') || sub.includes('suppl') || sub.includes('sppl') || sub.includes('labr') || sub.includes('labor') || sub.includes('pack') || sub.includes('oprt') || sub.includes('operation'));
            
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

        // Logistics rendering logic
        const displayLogistics: any[] = [];
        const emptyGroups: Record<string, any> = {};

        logisticsData.forEach(d => {
            const packedCount = d.inventoryItems?.length || (d.inventory_ids || d.inventoryIds ? 1 : 0);
            const isPacked = packedCount > 0;
            const type = (d.type || 'crate').toLowerCase();
            const w = d.width_cm || d.w || 0, h = d.height_cm || d.h || 0, l = d.length_cm || d.d || 0;

            if (!isPacked) {
                const key = `${type}-${w}-${h}-${l}`;
                if (!emptyGroups[key]) emptyGroups[key] = { type, w, h, l, count: 0, packed: 0, isGroup: true };
                emptyGroups[key].count++;
            } else {
                displayLogistics.push({
                    type, w, h, l, count: 1, packed: 1, isIndividual: true,
                    originalId: d.id, shortId: String(d.id || '').split('-').pop()?.toUpperCase().slice(-4) || 'P-1'
                });
            }
        });

        const finalLogistics = [...displayLogistics, ...Object.values(emptyGroups)].sort((a, b) => {
            if (a.isGroup && !b.isGroup) return -1;
            if (!a.isGroup && b.isGroup) return 1;
            return (b.w * b.h * b.l) - (a.w * a.h * a.l);
        });

        return {
            totalItems: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            totalAcqValueUsd,
            totalAcqValueMxn: vendorSummaries.reduce((acc, v) => acc + v.totalAcqMxn, 0),
            logisticsSpendMxn, logisticsSpendUsd,
            paidAcqMxn, paidExpMxn, reqMerchMxn, reqExpMxn, pendingMxn,
            totalLiabilityMxn: (reqMerchMxn + reqExpMxn + pendingMxn),
            groupedLogistics: finalLogistics
        };
    }, [vendorSummaries, logisticsData, financeData, items, currentExchangeRate]);

    const attributeStats = useMemo(() => {
        const colorMatMap: Record<string, { label: string, value: number }> = {};
        const shapeDescMap: Record<string, { label: string, value: number }> = {};
        items.forEach(i => {
            const norm = normalizeInventoryData(i.data);
            const qty = parseInt(norm?.quantity || '1') || 1;
            const color = (norm?.color || 'Unknown').trim();
            const material = (norm?.material || 'Unknown').trim();
            const cmKey = `${color.toUpperCase()} ${material.toUpperCase()}`;
            if (!colorMatMap[cmKey]) colorMatMap[cmKey] = { label: toTitleCase(`${color} ${material}`.trim()) || 'Unknown', value: 0 };
            colorMatMap[cmKey].value += qty;
            
            const desc = (norm?.description || norm?.shortDescription || norm?.item_description || norm?.generatedDescription || '').trim() || 'No Description';
            const shape = (norm?.shape || 'Unknown').trim();
            const sdKey = `${shape.toUpperCase()} - ${desc.toUpperCase()}`;
            if (!shapeDescMap[sdKey]) shapeDescMap[sdKey] = { label: toTitleCase(`${shape} - ${desc}`), value: 0 };
            shapeDescMap[sdKey].value += qty;
        });

        return { 
            topCM: Object.values(colorMatMap).sort((a,b) => b.value - a.value).slice(0, 12).map(v => [v.label, v.value] as [string, number]),
            topSD: Object.values(shapeDescMap).sort((a,b) => b.value - a.value).slice(0, 15).map(v => [v.label, v.value] as [string, number])
        };
    }, [items]);

    useEffect(() => {
        setFinanceTotals(prev => ({
            ...prev,
            queueLength: requisitions.length,
            queueMxn: Number(activeDestReqNetMXN) || 0,
            upcomingLength: comingPaymentsByVendor.length,
            upcomingMxn: comingPaymentsByVendor.reduce((sum: number, g: any) => sum + g.total, 0),
        }));
    }, [requisitions.length, activeDestReqNetMXN, comingPaymentsByVendor, setFinanceTotals]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary)">{tr("Synchronizing Intelligence...")}</p>
            </div>
        );
    }

    const totalOpsUsd = Object.values(opsBreakdown).reduce((acc, c) => acc + c.usd, 0);
    const totalOpsMxn = Object.values(opsBreakdown).reduce((acc, c) => acc + c.mxn, 0);

    return (
        <div className="flex flex-col h-full overflow-hidden relative animate-in fade-in duration-500 bg-(--app-bg)">
            {/* Header / Global Filter Row */}
            <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-(--app-bg) z-20">
                <div className="flex items-center gap-3">
                    <Grid className="text-(--text-color)" size={20} />
                    <h1 className="text-xl font-black uppercase tracking-widest text-(--text-color)">{tr("Dashboard")}</h1>
                </div>
            </div>

            <div className="grow min-h-0 overflow-y-auto custom-scrollbar px-10 space-y-12 pt-6 pb-24">
                {/* KPI Strip */}
                <KpiStrip 
                    totalItems={globalTotals.totalItems}
                    totalAcqUsd={globalTotals.totalAcqValueUsd}
                    totalAcqMxn={globalTotals.totalAcqValueMxn}
                    totalLiabilityMxn={globalTotals.totalLiabilityMxn}
                    totalLiabilityUsd={globalTotals.totalLiabilityMxn / currentExchangeRate}
                    logisticsSpendMxn={globalTotals.logisticsSpendMxn}
                    logisticsSpendUsd={globalTotals.logisticsSpendUsd}
                    opsSpendMxn={totalOpsMxn}
                    opsSpendUsd={totalOpsUsd}
                    currentExchangeRate={currentExchangeRate}
                />

                {/* Finance Summary Section */}
                <FinanceSummarySection 
                    globalTotals={globalTotals}
                    currentExchangeRate={currentExchangeRate}
                    requisitions={requisitions}
                    comingPaymentsByVendor={comingPaymentsByVendor}
                    activeDestReqNetMXN={activeDestReqNetMXN}
                />

                {/* Inventory Status Section */}
                <InventoryStatusSection groupedLogistics={globalTotals.groupedLogistics} />

                {/* Vendor Acquisition Section */}
                <VendorAcquisitionSection vendorSummaries={vendorSummaries} currentExchangeRate={currentExchangeRate} />

                {/* Material Breakdown Section */}
                <MaterialBreakdownSection attributeStats={attributeStats} />

                {/* Expense Section */}
                <ExpenseSection opsBreakdown={opsBreakdown} />

                {/* Device Fleet Tile */}
                <div className="flex justify-end mt-12">
                    <DeviceFleetTile />
                </div>
            </div>
        </div>
    );
}
