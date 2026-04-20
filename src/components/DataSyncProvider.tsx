
import React, { useEffect, useState } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { 
    inventoryAtom, 
    storeInventoryAtom,
    financeDataAtom, 
    logisticsDataAtom,
    isSyncingAtom,
    InventoryVersionAtom
} from '../lib/atoms';
import { useDatabase } from '../lib/hooks';
import { normalizeInventoryData } from '../lib/utils';
import { supabase } from '../lib/supabase';

/**
 * DataSyncProvider
 * Centralizes all RxDB subscriptions to ensure data is fetched once
 * and kept in sync across the entire application.
 */
export const DataSyncProvider: React.FC = () => {
    const db = useDatabase();
    const setInventory = useSetAtom(inventoryAtom);
    const setStoreInventory = useSetAtom(storeInventoryAtom);
    const setFinance = useSetAtom(financeDataAtom);
    const setLogistics = useSetAtom(logisticsDataAtom);
    const setIsSyncing = useSetAtom(isSyncingAtom);
    const inventoryVersion = useAtomValue(InventoryVersionAtom);

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
            const allRecords = [
                ...currentInventoryDocs.map(x => ({
                    ...x,
                    source: 'inventory',
                    row: x.id,
                    data: normalizeInventoryData(x)
                })),
                ...currentProductionDocs.map(x => ({
                    ...x,
                    source: 'production',
                    row: x.id,
                    data: normalizeInventoryData(x)
                }))
            ];

            const storeStatuses = ['available', 'avaiable', 'catalog', 'store', 'market'];
            const wipItems = allRecords.filter(r => {
                const status = (r.data.status || '').trim().toLowerCase();
                const isStoreStatus = storeStatuses.includes(status);
                const payReq = String(r.data.payReq || r.data.pay_req || '').toLowerCase();
                const hasPaymentReq = payReq !== '' && payReq !== 'false' && payReq !== 'undefined' && payReq !== 'null';
                
                // Inventory (WIP) includes items with payment activity or items NOT in store statuses
                return hasPaymentReq || !isStoreStatus;
            });

            const storeItems = allRecords.filter(r => {
                const status = (r.data.status || '').trim().toLowerCase();
                const isStoreStatus = storeStatuses.includes(status);
                const payReq = String(r.data.payReq || r.data.pay_req || '').toLowerCase();
                const hasPaymentReq = payReq !== '' && payReq !== 'false' && payReq !== 'undefined' && payReq !== 'null';

                // Store only includes items in store statuses WITHOUT payment activity
                return isStoreStatus && !hasPaymentReq;
            });

            setInventory(wipItems);
            setStoreInventory(storeItems);
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

        // 2. Finance - Direct Supabase Sync (Bypassing RxDB for reliability)
        let currentFinanceData: any[] = [];
        const fetchInitialFinance = async () => {
            try {
                const { data, error } = await supabase.from('finance').select('*');
                if (!error && data) {
                    currentFinanceData = data;
                    setFinance(currentFinanceData);
                }
            } catch (err) {
                console.error('[DataSync] Failed to fetch initial finance data:', err);
            }
        };
        fetchInitialFinance();

        // 3. Logistics
        subscriptions.push(
            db.logistics.find().$.subscribe((docs: any[]) => {
                const data = docs.map(d => d.toJSON());
                setLogistics(data);
            })
        );

        // 4. Supabase Real-Time Subscriptions
        const applyRealtimeChange = async (collection: any, payload: any) => {
            if (!collection) return;
            try {
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const docInfo = { ...payload.new, id: String(payload.new.id) };
                    if (docInfo.workbook !== undefined && docInfo.workbook !== null) {
                        docInfo.workbook = String(docInfo.workbook);
                    }
                    await collection.upsert(docInfo);
                } else if (payload.eventType === 'DELETE') {
                    const id = String(payload.old.id);
                    const doc = await collection.findOne({ selector: { id } }).exec();
                    if (doc) await doc.remove();
                }
            } catch (err) {
                console.error(`[DataSync] Realtime merge error in ${payload.table}:`, err);
            }
        };

        const realtimeChannel = supabase.channel('global-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, payload => applyRealtimeChange(db.inventory, payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'production' }, payload => applyRealtimeChange(db.production, payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics' }, payload => applyRealtimeChange(db.logistics, payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'finance' }, payload => {
                // Direct memory update for Finance
                if (payload.eventType === 'INSERT') {
                    currentFinanceData = [...currentFinanceData, payload.new];
                } else if (payload.eventType === 'UPDATE') {
                    currentFinanceData = currentFinanceData.map(d => String(d.id) === String(payload.new.id) ? payload.new : d);
                } else if (payload.eventType === 'DELETE') {
                    currentFinanceData = currentFinanceData.filter(d => String(d.id) !== String(payload.old.id));
                }
                setFinance(currentFinanceData);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('📡 [DataSync] Real-time multiplayer synchronization established.');
                }
            });

        return () => {
            console.log('🔌 [DataSync] Cleaning up global subscriptions.');
            subscriptions.forEach(sub => sub.unsubscribe());
            supabase.removeChannel(realtimeChannel);
        };
    }, [db, setInventory, setFinance, setLogistics]);

    // 5. Manual Sync Trigger (Version-based)
    // When inventoryVersion increments (e.g. after a save or delete),
    // we perform an explicit poll to ensure the UI is perfectly in sync.
    useEffect(() => {
        if (!db || inventoryVersion === 0) return;
        
        const forceSync = async () => {
            console.log(`📡 [DataSync] Explicit sync triggered (v${inventoryVersion})`);
            try {
                // Fetch latest from BOTH tables
                const [invRes, prodRes] = await Promise.all([
                    supabase.from('inventory').select('*').eq('is_hidden', false),
                    supabase.from('production').select('*').eq('is_hidden', false)
                ]);

                if (invRes.data) {
                    await Promise.all(invRes.data.map(d => db.inventory.upsert({ ...d, id: String(d.id) })));
                }
                if (prodRes.data) {
                    await Promise.all(prodRes.data.map(d => db.production.upsert({ ...d, id: String(d.id) })));
                }
                console.log('✅ [DataSync] Explicit manual poll complete.');
            } catch (err) {
                console.error('[DataSync] Manual sync failed:', err);
            }
        };

        forceSync();
    }, [db, inventoryVersion]);

    // This component renders nothing, it just manages side-effects
    return null;
};
