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
        description: { type: 'string' },
        shape: { type: 'string' },
        material: { type: 'string' },
        color: { type: 'string' },
        price_mxn: { type: 'number' },
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

async function bulkUpsertChunked(collection: RxCollection<any>, docs: any[], chunkSize = 100) {
    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        await collection.bulkUpsert(chunk);
        await new Promise(resolve => setTimeout(resolve, 0));
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
            // Inventory
            let page = 0;
            while (true) {
                const { data, error } = await supabase.from('inventory').select('*').range(page * 500, (page + 1) * 500 - 1);
                if (error || !data || data.length === 0) break;
                await bulkUpsertChunked(db.inventory, data);
                if (data.length < 500) break;
                page++;
            }
            // Finance
            const { data: fin } = await supabase.from('finance').select('*');
            if (fin) await bulkUpsertChunked(db.finance, fin);
            // Logistics
            const { data: log } = await supabase.from('logistics').select('*');
            if (log) await bulkUpsertChunked(db.logistics, log);
            // Production
            const { data: prod } = await supabase.from('production').select('*');
            if (prod) await bulkUpsertChunked(db.production, prod);
        } catch (e) { console.error('Sync error:', e); }
    };

    pullReplication();
    return db;
};

export const getDatabase = () => {
    if (!dbPromise) dbPromise = createDatabase();
    return dbPromise;
};
