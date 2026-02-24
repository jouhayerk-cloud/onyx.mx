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
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        amount: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        category: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        pay_date: { type: ['string', 'null'] },
        destination: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        related_ids: { type: ['array', 'null'], items: { type: 'string' } },
        updated_at: { type: ['string', 'null'] }
    }
};

const logisticsSchema = {
    title: 'logistics schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: ['string', 'null'] },
        vendor_id: { type: ['string', 'null'] },
        item_type: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] },
        weight_kg: { type: ['number', 'null'] },
        weight_lbs: { type: ['number', 'null'] },
        l_cm: { type: ['number', 'null'] },
        w_cm: { type: ['number', 'null'] },
        d_cm: { type: ['number', 'null'] },
        dims_info: { type: ['string', 'null'] },
        cost_mxn: { type: ['number', 'null'] },
        tracking_number: { type: ['string', 'null'] },
        carrier: { type: ['string', 'null'] },
        status: { type: ['string', 'null'] },
        inventory_ids: { type: ['array', 'null'], items: { type: 'string' } },
        updated_at: { type: ['string', 'null'] }
    }
};

const productionSchema = {
    title: 'production schema',
    version: 0,
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
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        item_id: { type: ['string', 'null'] },
        item_number: { type: ['string', 'null'] },
        timestamp: { type: ['string', 'null'] },
        created_by: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        short_description: { type: ['string', 'null'] },
        detailed_description: { type: ['string', 'null'] },
        shape: { type: ['string', 'null'] },
        material: { type: ['string', 'null'] },
        color: { type: ['string', 'null'] },
        width_cm: { type: ['number', 'null'] },
        height_cm: { type: ['number', 'null'] },
        length_cm: { type: ['number', 'null'] },
        weight_kg: { type: ['number', 'null'] },
        price_mxn: { type: ['number', 'null'] },
        media_urls: { type: ['string', 'null'] },
        generated_png_url: { type: ['string', 'null'] },
        spatial_boxes_2d: { type: ['object', 'array', 'null'] },
        spatial_points: { type: ['object', 'array', 'null'] },
        spatial_masks: { type: ['object', 'array', 'null'] },
        status: { type: ['string', 'null'] },
        workbook: { type: ['string', 'null'] },
        in_production: { type: ['boolean', 'null'] },
        ready: { type: ['boolean', 'null'] },
        paid: { type: ['boolean', 'null'] },
        shipped: { type: ['boolean', 'null'] },
        pay_req: { type: ['boolean', 'null'] },
        pay_date: { type: ['string', 'null'] },
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
            console.log('[DB] Starting prioritized background sync...');

            // PHASE 1: ACTIVE DATA (Workbook 326) - Higher priority
            const { data: activeData, error: activeErr } = await supabase
                .from('inventory')
                .select('*')
                .eq('workbook', '326');

            if (!activeErr && activeData) {
                console.log(`[DB] Syncing ${activeData.length} active items...`);
                await bulkUpsertChunked(db.inventory, activeData, 50, 50); // Faster for active
            }

            // PHASE 2: ARCHIVE DATA (Workbook 825) - Lower priority, throttled
            const { data: archiveData, error: archiveErr } = await supabase
                .from('inventory')
                .select('*')
                .eq('workbook', '825');

            if (!archiveErr && archiveData) {
                console.log(`[DB] Syncing ${archiveData.length} archive items (background)...`);
                // Very slow sync for archive to prevent any UI lag
                await bulkUpsertChunked(db.inventory, archiveData, 20, 150);
            }

            // Finance
            const { data: finData, error: finErr } = await supabase.from('finance').select('*');
            if (!finErr && finData) await bulkUpsertChunked(db.finance, finData, 50, 50);

            // Logistics
            const { data: logData, error: logErr } = await supabase.from('logistics').select('*');
            if (!logErr && logData) await bulkUpsertChunked(db.logistics, logData, 50, 50);

            // Production
            const { data: prodData, error: prodErr } = await supabase.from('production').select('*');
            if (!prodErr && prodData) await bulkUpsertChunked(db.production, prodData, 50, 50);

            console.log('[DB] Prioritized sync complete.');
        } catch (err) {
            console.error('[DB] Sync failed:', err);
        }
    };

    pullReplication();
    return db;
};

export const getDatabase = () => {
    if (!dbPromise) dbPromise = createDatabase();
    return dbPromise;
};
