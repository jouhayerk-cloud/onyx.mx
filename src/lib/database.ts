import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { supabase } from './supabase';

// Add plugins
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);

const financeSchema = {
    title: 'finance schema',
    version: 6,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        category: { type: ['string', 'null'] },
        subcategory: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        amount: { type: ['number', 'null'] },
        commission: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        bank_account: { type: ['string', 'null'] },
        payment_method: { type: ['string', 'null'] },
        pay_date: { type: ['string', 'null'] },
        reference: { type: ['string', 'null'] },
        exchange_rate: { type: ['number', 'null'] },
        status: { type: ['string', 'null'] },
        requested_by: { type: ['string', 'null'] },
        approved_by: { type: ['string', 'null'] },
        sent_at: { type: ['string', 'null'] },
        dispersed_at: { type: ['string', 'null'] },
        destination: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        related_ids: { type: ['array', 'null'], items: { type: 'string' } },
        related_inventory_ids: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        recurring: { type: ['boolean', 'null'] },
        recurring_day: { type: ['number', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

const logisticsSchema = {
    title: 'logistics schema',
    version: 3,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        type: { type: ['string', 'null'] },
        vendors: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        length_cm: { type: ['number', 'null'] },
        width_cm: { type: ['number', 'null'] },
        height_cm: { type: ['number', 'null'] },
        weight_kg: { type: ['number', 'null'] },
        truck_id: { type: ['string', 'null'] },
        truck_position: { type: ['string', 'null'] },
        ship_date: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        origin: { type: ['string', 'null'] },
        destination_address: { type: ['string', 'null'] },
        contents_summary: { type: ['string', 'null'] },
        insurance_value: { type: ['number', 'null'] },
        customs_status: { type: ['string', 'null'] },
        pallet_count: { type: ['number', 'null'] },
        crate_count: { type: ['number', 'null'] },
        freight_cost: { type: ['number', 'null'] },
        description: { type: ['string', 'null'] },
        tracking_number: { type: ['string', 'null'] },
        carrier: { type: ['string', 'null'] },
        inventory_ids: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] },
        cost_mxn: { type: ['number', 'null'] },
        date: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

const productionSchema = {
    title: 'production schema',
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        vendor_id: { type: ['string', 'null'] },
        tag_id: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        price_unit: { type: ['number', 'null'] },
        quantity: { type: ['number', 'null'] },
        total: { type: ['number', 'null'] },
        advance: { type: ['number', 'null'] },
        progress: { type: ['number', 'null'] },
        ready_date: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

const inventorySchema = {
    title: 'inventory schema',
    version: 7,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        timestamp: { type: ['string', 'null'] },
        item_id: { type: ['string', 'null'] },
        item_number: { type: ['number', 'null'] },
        created_by: { type: ['string', 'null'] },
        marked_by: { type: ['string', 'null'] },
        acquired_by: { type: ['string', 'null'] },
        acquired_at: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        shape: { type: ['string', 'null'] },
        material: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        color: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] },
        price_mxn: { type: ['number', 'null'] },
        weight_kg: { type: ['number', 'null'] },
        height_cm: { type: ['number', 'null'] },
        width_cm: { type: ['number', 'null'] },
        length_cm: { type: ['number', 'null'] },
        media_urls: { type: ['string', 'null'] },
        short_description: { type: ['string', 'null'] },
        generated_description: { type: ['string', 'null'] },
        detailed_description: { type: ['string', 'null'] },
        generated_image_urls: { type: ['string', 'null'] },
        generated_png_url: { type: ['string', 'null'] },
        generated_svg_url: { type: ['string', 'null'] },
        spatial_boxes_2d: { type: ['array', 'null'], items: { type: 'object' } },
        spatial_points: { type: ['array', 'null'], items: { type: 'object' } },
        spatial_masks: { type: ['array', 'null'], items: { type: 'object' } },
        spatial_boxes_3d: { type: ['array', 'null'], items: { type: 'object' } },
        invoice_id: { type: ['string', 'null'] },
        print_date: { type: ['string', 'null'] },
        pay_req: { type: ['boolean', 'null'] },
        pay_date: { type: ['string', 'null'] },
        sent_notes: { type: ['string', 'null'] },
        sent_pack: { type: ['string', 'null'] },
        sent_date: { type: ['string', 'null'] },
        shipped: { type: ['boolean', 'null'] },
        workbook: { type: ['string', 'null'] },
        crate_id: { type: ['string', 'null'] },
        book_landed: { type: ['number', 'null'] },
        book_retail: { type: ['number', 'null'] },
        book_barcode: { type: ['string', 'null'] },
        book_aq_code: { type: ['string', 'null'] },
        box_land_code: { type: ['string', 'null'] },
        dispersal_status: { type: ['string', 'null'] },
        bank_account: { type: ['string', 'null'] },
        sent_at: { type: ['string', 'null'] },
        dispersed_at: { type: ['string', 'null'] },
        requested_by: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

export type OnyxDatabase = RxDatabase<{
    inventory: RxCollection<any>;
    finance: RxCollection<any>;
    logistics: RxCollection<any>;
    production: RxCollection<any>;
}>;

let dbPromise: Promise<OnyxDatabase> | null = null;

async function bulkUpsertChunked(collection: RxCollection<any>, docs: any[], chunkSize = 20, delay = 150) {
    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize).map(doc => ({
            ...doc,
            id: String(doc.id),
            workbook: doc.workbook != null ? String(doc.workbook) : null
        }));
        try {
            await collection.bulkUpsert(chunk);
        } catch (err) {
            console.error(`[DB] bulkUpsert error in ${collection.name}:`, err);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

const createDatabase = async () => {
    try {
        const db = await createRxDatabase<OnyxDatabase>({
            name: 'onyxdb7',
            storage: getRxStorageDexie()
        });

        await db.addCollections({
            inventory: {
                schema: inventorySchema,
                migrationStrategies: {
                    // Return null = DELETE old local docs during migration.
                    // This is the safest approach: old docs are cleared and
                    // pullReplication re-syncs fresh data from Supabase.
                    // Avoids DM4 "storage closed" race condition.
                    1: () => null,
                    2: () => null,
                    3: () => null,
                    4: () => null,
                    5: () => null,
                    6: () => null,
                    7: () => null,
                }
            },
            finance: {
                schema: financeSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null,
                    4: () => null, 5: () => null, 6: () => null,
                }
            },
            logistics: {
                schema: logisticsSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null,
                }
            },
            production: { schema: productionSchema }
        });

        // CRITICAL: Wait for migration to fully complete before starting pullReplication.
        // Without this, pullReplication's bulkUpsert conflicts with the ongoing migration
        // and causes DM4 "RxStorageInstanceDexie is closed" error.
        try {
            await db.inventory.migratePromise(50);
            console.log('✅ [DB] Migration complete.');
        } catch (migErr) {
            console.warn('⚠️ [DB] Migration error (non-fatal, will resync):', migErr);
        }

        const pullReplication = async () => {
            try {
                console.log('🚀 [DB] Starting prioritized paginated sync...');

                // Helper for paginated fetch
                const fetchPaginated = async (table: string, filterField?: string, filterVal?: any) => {
                    let page = 0;
                    const pageSize = 500;
                    const allData: any[] = [];

                    while (true) {
                        let query = supabase.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
                        if (filterField && filterVal !== undefined) {
                            query = query.eq(filterField, filterVal);
                        }

                        const { data, error } = await query;
                        if (error) {
                            console.error(`❌ [DB] ${table} fetch page ${page} error:`, error.message);
                            break;
                        }
                        if (!data || data.length === 0) break;

                        allData.push(...data);
                        if (data.length < pageSize) break;
                        page++;
                    }
                    return allData;
                };

                // PHASE 1 & 2: ALL INVENTORY
                console.log('[DB] Paging all inventory items...');
                const invData = await fetchPaginated('inventory');

                const activeData = invData.filter(d => String(d.workbook) !== '825');
                const archiveData = invData.filter(d => String(d.workbook) === '825');

                console.log(`[DB] Fetched ${invData.length} total inventory items (${activeData.length} active, ${archiveData.length} archive).`);

                if (activeData.length > 0) await bulkUpsertChunked(db.inventory, activeData, 50, 50);
                if (archiveData.length > 0) await bulkUpsertChunked(db.inventory, archiveData, 50, 50);

                // PRUNE STALE LOCAL INVENTORY
                const remoteInvIds = new Set(invData.map(d => String(d.id)));
                const localInvDocs = await db.inventory.find().exec();
                const staleInv = localInvDocs.filter((doc: any) => !remoteInvIds.has(doc.id));
                if (staleInv.length > 0) {
                    await Promise.all(staleInv.map((doc: any) => doc.remove()));
                    console.log(`🗑️ [DB] Pruned ${staleInv.length} stale inventory records.`);
                }

                // Finance
                const finData = await fetchPaginated('finance');
                console.log(`[DB] Fetched ${finData.length} finance items.`);
                if (finData.length > 0) await bulkUpsertChunked(db.finance, finData, 50, 50);
                const remoteFinIds = new Set(finData.map((d: any) => String(d.id)));
                const localFinDocs = await db.finance.find().exec();
                const staleFin = localFinDocs.filter((doc: any) => !remoteFinIds.has(doc.id));
                if (staleFin.length > 0) await Promise.all(staleFin.map((doc: any) => doc.remove()));

                // Logistics
                const logData = await fetchPaginated('logistics');
                console.log(`[DB] Fetched ${logData.length} logistics items.`);
                if (logData.length > 0) await bulkUpsertChunked(db.logistics, logData, 50, 50);
                const remoteLogIds = new Set(logData.map((d: any) => String(d.id)));
                const localLogDocs = await db.logistics.find().exec();
                const staleLog = localLogDocs.filter((doc: any) => !remoteLogIds.has(doc.id));
                if (staleLog.length > 0) await Promise.all(staleLog.map((doc: any) => doc.remove()));

                // Production
                const prodData = await fetchPaginated('production');
                console.log(`[DB] Fetched ${prodData.length} production items.`);
                if (prodData.length > 0) await bulkUpsertChunked(db.production, prodData, 50, 50);
                const remoteProdIds = new Set(prodData.map((d: any) => String(d.id)));
                const localProdDocs = await db.production.find().exec();
                const staleProd = localProdDocs.filter((doc: any) => !remoteProdIds.has(doc.id));
                if (staleProd.length > 0) await Promise.all(staleProd.map((doc: any) => doc.remove()));

                console.log('🏁 [DB] Prioritized paginated sync with pruning complete.');
            } catch (err) {
                console.error('🔥 [DB] Fatal Sync Crash:', err);
            }
        };

        // Initiation: DO NOT await sync, only collect initial data check
        console.log('✅ [DB] Collections Created. Initiating Sync...');
        pullReplication().catch(e => console.error('🔥 [DB] Background Sync Failure:', e));

        return db;
    } catch (err) {
        console.error('❌ [DB] Creation failed:', err);

        const lastReload = parseInt(localStorage.getItem('onyx_last_reload') || '0');
        const now = Date.now();

        if (now - lastReload > 5000) {
            console.warn('⚠️ [DB] Wiping all onyxdb* stores and reloading...');
            localStorage.setItem('onyx_last_reload', now.toString());
            setTimeout(async () => {
                // Delete ALL IndexedDB databases that start with 'onyxdb'
                // (RxDB/Dexie uses names like 'onyxdb-rxdb-5-inventory')
                try {
                    const dbs = await window.indexedDB.databases();
                    await Promise.all(
                        dbs
                            .filter(d => d.name?.startsWith('onyxdb'))
                            .map(d => new Promise<void>(resolve => {
                                const req = window.indexedDB.deleteDatabase(d.name!);
                                req.onsuccess = () => resolve();
                                req.onerror = () => resolve();
                            }))
                    );
                } catch (_) { /* indexedDB.databases() not supported in all browsers */ }
                window.location.reload();
            }, 1000);
        } else {
            console.error('🛑 [DB] Multiple failures detected. Stopping reload loop.');
        }
        throw err;
    }
};

export const getDatabase = () => {
    if (!dbPromise) dbPromise = createDatabase();
    return dbPromise;
};
