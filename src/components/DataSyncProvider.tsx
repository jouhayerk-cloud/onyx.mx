
import React, { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { 
    inventoryAtom, 
    financeDataAtom, 
    logisticsDataAtom,
    isSyncingAtom
} from '../lib/atoms';
import { useDatabase } from '../lib/hooks';
import { normalizeInventoryData } from '../lib/utils';

/**
 * DataSyncProvider
 * Centralizes all RxDB subscriptions to ensure data is fetched once
 * and kept in sync across the entire application.
 */
export const DataSyncProvider: React.FC = () => {
    const db = useDatabase();
    const setInventory = useSetAtom(inventoryAtom);
    const setFinance = useSetAtom(financeDataAtom);
    const setLogistics = useSetAtom(logisticsDataAtom);
    const setIsSyncing = useSetAtom(isSyncingAtom);

    const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);

    useEffect(() => {
        if (!db) return;

        console.log('🔄 [DataSync] Centralized synchronization active.');

        const subscriptions: any[] = [];

        // 1. Unified Inventory (Inventory + Production)
        // We observe both collections and combine them into a single inventoryAtom
        let currentInventoryDocs: any[] = [];
        let currentProductionDocs: any[] = [];

        const updateInventoryAtom = () => {
            const mappedInv = currentInventoryDocs.map(x => ({
                ...x,
                source: 'inventory',
                row: x.id,
                data: normalizeInventoryData(x)
            }));
            const mappedProd = currentProductionDocs.map(x => ({
                ...x,
                source: 'production',
                row: x.id,
                data: normalizeInventoryData(x)
            }));
            setInventory([...mappedInv, ...mappedProd]);
        };

        subscriptions.push(
            db.inventory.find({ 
                selector: { 
                    status: { $ne: 'Pending Deletion' }, 
                    is_hidden: { $ne: true } 
                } 
            }).$.subscribe((docs: any[]) => {
                currentInventoryDocs = docs.map(d => d.toJSON());
                updateInventoryAtom();
                setIsInitialSyncComplete(true);
                setIsSyncing(false);
            })
        );

        subscriptions.push(
            db.production.find({ 
                selector: { 
                    is_hidden: { $ne: true } 
                } 
            }).$.subscribe((docs: any[]) => {
                currentProductionDocs = docs.map(d => d.toJSON());
                updateInventoryAtom();
            })
        );

        // 2. Finance
        subscriptions.push(
            db.finance.find().$.subscribe((docs: any[]) => {
                const data = docs.map(d => d.toJSON());
                setFinance(data);
            })
        );

        // 3. Logistics
        subscriptions.push(
            db.logistics.find().$.subscribe((docs: any[]) => {
                const data = docs.map(d => d.toJSON());
                setLogistics(data);
            })
        );

        return () => {
            console.log('🔌 [DataSync] Cleaning up global subscriptions.');
            subscriptions.forEach(sub => sub.unsubscribe());
        };
    }, [db, setInventory, setFinance, setLogistics]);

    // This component renders nothing, it just manages side-effects
    return null;
};
