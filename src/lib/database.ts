import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { supabase } from './supabase';

// Add plugins
if (import.meta.env.DEV) {
    addRxPlugin(RxDBDevModePlugin);
}
addRxPlugin(RxDBQueryBuilderPlugin);

const financeSchema = {
    title: 'finance schema',
    version: 4,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        category: { type: ['string', 'null'] },
        amount: { type: ['number', 'null'] },
        commission: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        bank_account: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        requested_by: { type: ['string', 'null'] },
        sent_at: { type: ['string', 'null'] },
        dispersed_at: { type: ['string', 'null'] },
        destination: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        related_ids: { type: ['array', 'null'], items: { type: 'string' } },
        notes: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] }
    }
};

const logisticsSchema = {
    title: 'logistics schema',
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        type: { type: ['string', 'null'] },
        vendors: { type: ['string', 'null'] },
        length_cm: { type: ['number', 'null'] },
        width_cm: { type: ['number', 'null'] },
        height_cm: { type: ['number', 'null'] },
        weight_kg: { type: ['number', 'null'] },
        truck_id: { type: ['string', 'null'] },
        truck_position: { type: ['string', 'null'] },
        ship_date: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
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
    version: 4,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        timestamp: { type: ['string', 'null'] },
        item_id: { type: ['string', 'null'] },
        item_number: { type: ['number', 'null'] },
        created_by: { type: ['string', 'null'] },
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
        detailed_description: { type: ['string', 'null'] },
        generated_png_url: { type: ['string', 'null'] },
        generated_svg_url: { type: ['string', 'null'] },
        spatial_boxes_2d: { type: ['object', 'array', 'null'] },
        spatial_points: { type: ['object', 'array', 'null'] },
        spatial_masks: { type: ['object', 'array', 'null'] },
        pay_req: { type: ['boolean', 'null'] },
        pay_date: { type: ['string', 'null'] },
        shipped: { type: ['boolean', 'null'] },
        workbook: { type: ['string', 'null'] },
        crate_id: { type: ['string', 'null'] },
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
        const chunk = docs.slice(i, i + chunkSize);
        try {
            await collection.bulkUpsert(chunk);
        } catch (err) {
            console.error(`[DB] bulkUpsert error in ${collection.name}:`, err);
        }
        // Throttled delay to keep Chrome responsive
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

const createDatabase = async () => {
    try {
        const db = await createRxDatabase<OnyxDatabase>({
            name: 'onyxdb',
            storage: getRxStorageDexie()
        });

        await db.addCollections({
            inventory: { schema: inventorySchema },
            finance: { schema: financeSchema },
            logistics: { schema: logisticsSchema },
            production: { schema: productionSchema }
        });

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

                // PHASE 1: ACTIVE DATA (Workbook 326)
                console.log('[DB] Paging active items (326)...');
                const activeData = await fetchPaginated('inventory', 'workbook', '326');
                if (activeData.length > 0) {
                    console.log(`✅ [DB] Syncing ${activeData.length} active items...`);
                    await bulkUpsertChunked(db.inventory, activeData, 50, 50);
                } else {
                    console.warn('⚠️ [DB] No items found for workbook 326. checking for raw data...');
                    const raw = await supabase.from('inventory').select('*').limit(50);
                    if (raw.data) await bulkUpsertChunked(db.inventory, raw.data, 50, 50);
                }

                // PHASE 2: ARCHIVE DATA (Workbook 825)
                console.log('[DB] Paging archive items (825)...');
                const archiveData = await fetchPaginated('inventory', 'workbook', '825');
                if (archiveData.length > 0) {
                    console.log(`✅ [DB] Syncing ${archiveData.length} archive records (background)...`);
                    await bulkUpsertChunked(db.inventory, archiveData, 20, 150);
                }

                // Finance
                const finData = await fetchPaginated('finance');
                if (finData.length > 0) await bulkUpsertChunked(db.finance, finData, 50, 50);

                // Logistics
                const logData = await fetchPaginated('logistics');
                if (logData.length > 0) await bulkUpsertChunked(db.logistics, logData, 50, 50);

                // Production
                const prodData = await fetchPaginated('production');
                if (prodData.length > 0) await bulkUpsertChunked(db.production, prodData, 50, 50);

                console.log('🏁 [DB] Prioritized paginated sync complete.');
            } catch (err) {
                console.error('🔥 [DB] Fatal Sync Crash:', err);
            }
        };

        pullReplication();
        return db;
    } catch (err) {
        console.error('❌ [DB] Creation failed (possibly version mismatch). Wiping and retrying...', err);
        // If version mismatch or corruption, wipe Dexie and reload
        const dbName = 'onyxdb';
        const Dexie = (await import('dexie')).default;
        await new Dexie(dbName).delete();
        window.location.reload();
        throw err;
    }
};

export const getDatabase = () => {
    if (!dbPromise) dbPromise = createDatabase();
    return dbPromise;
};
