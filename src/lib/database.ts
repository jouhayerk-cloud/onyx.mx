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
        amount: { type: 'number' },
        currency: { type: 'string' },
        type: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        pay_date: { type: 'string' },
        destination: { type: 'string' },
        vendor_id: { type: 'string' },
        related_ids: { type: 'array', items: { type: 'string' } },
        updated_at: { type: 'string' }
    }
};

const logisticsSchema = {
    title: 'logistics schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        vendor_id: { type: 'string' },
        item_type: { type: 'string' },
        description: { type: 'string' },
        quantity: { type: 'number' },
        weight_kg: { type: 'number' },
        weight_lbs: { type: 'number' },
        l_cm: { type: 'number' },
        w_cm: { type: 'number' },
        d_cm: { type: 'number' },
        dims_info: { type: 'string' },
        cost_mxn: { type: 'number' },
        tracking_number: { type: 'string' },
        carrier: { type: 'string' },
        status: { type: 'string' },
        inventory_ids: { type: 'array', items: { type: 'string' } },
        updated_at: { type: 'string' }
    }
};

const productionSchema = {
    title: 'production schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        vendor_id: { type: 'string' },
        tag_id: { type: 'string' },
        description: { type: 'string' },
        price_unit: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number' },
        advance: { type: 'number' },
        progress: { type: 'number' },
        ready_date: { type: 'string' },
        status: { type: 'string' },
        updated_at: { type: 'string' }
    }
};

const inventorySchema = {
    title: 'inventory schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        item_id: { type: 'string' },
        item_number: { type: 'string' },
        timestamp: { type: 'string' },
        created_by: { type: 'string' },
        description: { type: 'string' },
        short_description: { type: 'string' },
        detailed_description: { type: 'string' },
        shape: { type: 'string' },
        material: { type: 'string' },
        color: { type: 'string' },
        width_cm: { type: 'number' },
        height_cm: { type: 'number' },
        length_cm: { type: 'number' },
        weight_kg: { type: 'number' },
        price_mxn: { type: 'number' },
        media_urls: { type: 'string' },
        generated_png_url: { type: 'string' },
        spatial_boxes_2d: { type: 'object' },
        spatial_points: { type: 'object' },
        spatial_masks: { type: 'object' },
        status: { type: 'string' },
        workbook: { type: 'string' },
        in_production: { type: 'boolean' },
        ready: { type: 'boolean' },
        paid: { type: 'boolean' },
        shipped: { type: 'boolean' },
        pay_req: { type: 'boolean' },
        pay_date: { type: 'string' },
        updated_at: { type: 'string' }
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
