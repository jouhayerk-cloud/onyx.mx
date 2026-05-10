import { atom } from 'jotai';
import { inventoryAtom, financeDataAtom, exchangeRateAtom } from './atoms';
import { normalizeInventoryData } from './utils';

export interface InventoryStatusSets {
    partialPayIds: Set<string>;
    fullPayIds: Set<string>;
    requestedAcqIds: Set<string>;
}

export const inventoryStatusSetsAtom = atom<InventoryStatusSets>((get) => {
    const items = get(inventoryAtom);
    const financeDocs = get(financeDataAtom);
    
    const pIds = new Set<string>();
    const fIds = new Set<string>();
    const rAcqIds = new Set<string>();

    const paidMap = new Map<string, number>();
    const requestedMap = new Map<string, number>();

    financeDocs.forEach((d: any) => {
        const status = String(d.status || '').toLowerCase();
        const subcategory = String(d.subcategory || '').toLowerCase();
        const amount = Number(d.amount || 0);
        if (amount <= 0) return;

        const rel = d.related_ids || d.related_inventory_ids || '';
        let relArray: string[] = [];
        if (Array.isArray(rel)) relArray = rel.map((id: any) => String(id));
        else if (typeof rel === 'string') relArray = rel.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (relArray.length === 0) return;

        if (status === 'paid' || status === 'partial') {
            relArray.forEach(id => paidMap.set(id, (paidMap.get(id) || 0) + amount));
            relArray.forEach(id => requestedMap.set(id, (requestedMap.get(id) || 0) + amount));
        }
        if (status === 'requested' && (subcategory === 'prod' || subcategory === 'packing')) {
            relArray.forEach(id => requestedMap.set(id, (requestedMap.get(id) || 0) + amount));
        }
        if (status === 'requested' && subcategory === 'acq') {
            relArray.forEach(id => rAcqIds.add(id));
        }
    });

    items.forEach((item: any) => {
        const id = String(item.data?.id || item.row);
        const totalPaid = paidMap.get(id) || 0;
        const totalRequested = requestedMap.get(id) || 0;
        
        const norm = normalizeInventoryData(item.data);
        const price = parseFloat(String(norm.price || 0));
        const qty = parseInt(String(norm.quantity || 1));
        const totalCost = price * qty;
        
        const payReqStr = String(norm.payReq || '').toLowerCase();

        // 0. Book 825 / Prepaid Override
        // We only auto-mark as full if:
        // 1. It's in book 825 or marked prepaid
        // 2. It's NOT in production
        // 3. AND we have NO payment activity (actual or requested) in the finance records
        const is825 = norm.workbook === 'v825' || norm.workbook === '825' || payReqStr === 'prepaid';
        const isProduction = String(norm.status || item.status || item.source || '').toLowerCase().includes('production');
        
        if (is825 && !isProduction && totalPaid === 0 && totalRequested === 0) {
            fIds.add(id);
            return;
        }

        // 1. Precise Payment Tracking
        // We track against the MAXIMUM of calculated cost or total requested across finance records
        // This ensures production items with requests higher than acquisition price stay RED/YELLOW
        const targetCost = Math.max(totalCost, totalRequested);
        
        if (targetCost > 0 && totalPaid >= targetCost && !isProduction) {
            fIds.add(id);
            return;
        }

        const hasActivity = totalRequested > 0 || (payReqStr && payReqStr !== 'false');
        if (hasActivity) {
            const isRequestedAcq = String(norm.status || '').toLowerCase() === 'acquisition' && totalPaid === 0 && (totalRequested > 0 || payReqStr === 'requested');
            if (!isRequestedAcq) {
                pIds.add(id);
            }
        }
    });

    return { partialPayIds: pIds, fullPayIds: fIds, requestedAcqIds: rAcqIds };
});
