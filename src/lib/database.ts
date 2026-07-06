import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { supabase } from './supabase';
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
    version: 4,
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
        updated_at: { type: ['string', 'null'] },
        parent_id: { type: ['string', 'null'] }
    }
};

const productionSchema = {
    title: 'production schema',
    version: 4,
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
        pay_req: { type: ['string', 'boolean', 'null'] },
        notes: { type: ['string', 'null'] },
        rating: { type: ['number', 'null'] },
        is_hidden: { type: ['boolean', 'null'] },
        hidden_reason: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

const shipmentsSchema = {
    title: 'shipments schema',
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        manifest_id: { type: 'string' },
        metadata: { type: 'object' },
        payload: { type: 'object' },
        timestamp: { type: 'string' },
        updated_at: { type: 'string' }
    }
};

const inventorySchema = {
    title: 'inventory schema',
    version: 13,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        timestamp: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        item_id: { type: ['string', 'null'] },
        item_number: { type: ['number', 'null'] },
        created_by: { type: ['string', 'null'] },
        created_at: { type: ['string', 'null'] },
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
        pay_req: { type: ['string', 'boolean', 'null'] },
        pay_date: { type: ['string', 'null'] },
        sent_notes: { type: ['string', 'null'] },
        sent_pack: { type: ['string', 'null'] },
        sent_date: { type: ['string', 'null'] },
        shipped: { type: ['boolean', 'null'] },
        workbook: { type: ['string', 'null'] },
        crate_id: { type: ['string', 'null'] },
        packing_status: { type: ['string', 'null'] },
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
        rating: { type: ['number', 'null'] },
        is_hidden: { type: ['boolean', 'null'] },
        hidden_reason: { type: ['string', 'null'] },
        payment_ids: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

export type OnyxDatabase = RxDatabase<{
    inventory: RxCollection<any>;
    finance: RxCollection<any>;
    logistics: RxCollection<any>;
    production: RxCollection<any>;
    shipments: RxCollection<any>;
}>;

let dbPromise: Promise<OnyxDatabase> | null = null;

async function bulkUpsertChunked(collection: RxCollection<any>, docs: any[], chunkSize = 150, delay = 10) {
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
        // Very short delay to keep event loop breathing
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    }
}

const createDatabase = async () => {
    // Check for Secure Context (Required for RxDB's Crypto/Subtle functionalities)
    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
        console.error('❌ [DB] Insecure Context Detected. RxDB requires a secure context (HTTPS or localhost) to use the Web Crypto API.');
        console.error('👉 Please access the app via https://192.168.1.71:1001/ or http://localhost:1001/');
        throw new Error('RxDB Initialization Failed: Insecure Context');
    }

    try {
        const db = await createRxDatabase<OnyxDatabase>({
            name: 'onyxdb18', // Forced clean start for mobile stability
            storage: getRxStorageDexie()
        });

        await db.addCollections({
            inventory: {
                schema: inventorySchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null, 5: () => null, 6: () => null, 7: () => null, 8: () => null, 9: () => null, 10: () => null, 11: (oldDoc) => oldDoc, 12: (oldDoc) => oldDoc,
                }
            },
            finance: {
                schema: financeSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null, 5: () => null, 6: () => null,
                }
            },
            logistics: {
                schema: logisticsSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null,
                }
            },
            production: { 
                schema: productionSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null,
                }
            },
            shipments: {
                schema: shipmentsSchema,
                migrationStrategies: {
                    1: () => null,
                }
            }
        });

        const pullReplication = async () => {
            try {
                console.log('🚀 [DB] Starting prioritized paginated sync...');
                const fetchPaginated = async (table: string, filterField?: string, filterVal?: any) => {
                    let page = 0;
                    const pageSize = 1000;
                    const allData: any[] = [];
                    let success = true;

                    try {
                        while (true) {
                            let query = supabase.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
                            
                            // Filter out hidden items for main app sync
                            if (['inventory', 'production'].includes(table)) {
                                query = query.or('is_hidden.is.null,is_hidden.eq.false');
                            }

                            if (filterField && filterVal !== undefined) {
                                query = query.eq(filterField, filterVal);
                            }

                            const { data, error } = await query;
                            if (error) {
                                // Gracefully handle missing shipments table (PGRST204)
                                if (error.code === 'PGRST204' || error.message.includes('not found')) {
                                    if (table === 'shipments') {
                                        console.warn('ℹ️ [DB] Shipment Registry table not found. Run the SQL setup to enable the 3D Digital Mirror.');
                                    } else {
                                        console.error(`❌ [DB] ${table} not found:`, error.message);
                                    }
                                } else {
                                    console.error(`❌ [DB] ${table} fetch page ${page} error:`, error.message);
                                }
                                success = false;
                                break;
                            }
                            if (!data || data.length === 0) break;

                            allData.push(...data);
                            if (data.length < pageSize) break;
                            page++;
                        }
                    } catch (e) {
                        console.error(`🔥 [DB] ${table} fetch timeout/error:`, e);
                        success = false;
                    }
                    return { data: allData, success };
                };

                const syncCollection = async (table: string, collection: RxCollection<any>) => {
                    const { data, success } = await fetchPaginated(table);
                    if (!success) return; // Skip if fetch failed to avoid accidental wiping

                    // 1. Upsert new/updated records
                    if (data.length > 0) {
                        await bulkUpsertChunked(collection, data);
                    }

                    // 2. Prune stale records (items deleted from Supabase)
                    // We only prune if we have a successful fetch, treating it as the source of truth
                    const remoteIds = new Set(data.map(d => String(d.id)));
                    const localDocs = await collection.find().exec();
                    const staleDocs = localDocs.filter((doc: any) => !remoteIds.has(doc.id));
                    
                    if (staleDocs.length > 0) {
                        console.log(`[DB] Pruning ${staleDocs.length} stale records from ${table}`);
                        // Use sequential removal to avoid blocking the event loop on mobile
                        for (const doc of staleDocs) {
                            await doc.remove();
                        }
                    }
                };

                // Sync all collections sequentially
                await syncCollection('inventory', db.inventory);
                await syncCollection('finance', db.finance);
                await syncCollection('logistics', db.logistics);
                await syncCollection('production', db.production);
                await syncCollection('shipments', db.shipments);

                console.log('🏁 [DB] Prioritized paginated sync complete.');
            } catch (err) {
                console.error('🔥 [DB] Fatal Sync Crash:', err);
            }
        };
        console.log('✅ [DB] Collections Created. Initiating Sync...');
        pullReplication().catch(e => console.error('🔥 [DB] Background Sync Failure:', e));

        return db;
    } catch (err) {
        console.error('❌ [DB] Creation failed:', err);

        const lastReload = parseInt(localStorage.getItem('onyx_last_reload') || '0');
        const now = Date.now();

        if (now - lastReload > 15000) { // Increased to 15s for mobile stability
            console.warn('⚠️ [DB] Wiping all onyxdb* stores and reloading...');
            localStorage.setItem('onyx_last_reload', now.toString());
            setTimeout(async () => {
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
