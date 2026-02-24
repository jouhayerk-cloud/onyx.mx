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
        related_ids: { type: 'array', items: { type: 'string' } },
        updated_at: { type: 'string' }
    }
};

const cratesSchema = {
    title: 'crates schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        label: { type: 'string' },
        dimensions: {
            type: 'object',
            properties: {
                width: { type: 'number' },
                height: { type: 'number' },
                depth: { type: 'number' }
            }
        },
        position: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' }
            }
        },
        color: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
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
        itemId: { type: 'string' },
        itemNumber: { type: 'string' },
        timestamp: { type: 'string' },
        createdBy: { type: 'string' },
        status: { type: 'string' },
        shape: { type: 'string' },
        material: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string' },
        quantity: { type: 'string' },
        price: { type: 'string' },
        weightKg: { type: 'string' },
        heightCm: { type: 'string' },
        widthCm: { type: 'string' },
        lengthCm: { type: 'string' },
        mediaUrls: { type: 'string' },
        generatedPngUrl: { type: 'string' },
        payDate: { type: 'string' },
        payReq: { type: 'string' },
        sentDate: { type: 'string' },
        workbook: { type: 'string' },
        updatedAt: { type: 'string' }
    },
    required: ['itemId', 'itemNumber']
};

export type InventoryCollection = RxCollection<any>;
export type FinanceCollection = RxCollection<any>;
export type CratesCollection = RxCollection<any>;

export type OnyxDatabase = RxDatabase<{
    inventory: InventoryCollection;
    finance: FinanceCollection;
    crates: CratesCollection;
}>;

let dbPromise: Promise<OnyxDatabase> | null = null;

// Helper to chunk arrays for paginated upserts — prevents Chrome IndexedDB transaction timeouts
async function bulkUpsertChunked(collection: RxCollection<any>, docs: any[], chunkSize = 100) {
    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        await collection.bulkUpsert(chunk);
        // Yield to the event loop between chunks so other UI work can proceed
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
        crates: { schema: cratesSchema }
    });

    // Non-blocking background sync — does NOT block DB initialization
    const pullReplication = async () => {
        try {
            // Pull Inventory in pages to avoid large single-transaction locks
            let page = 0;
            const pageSize = 500;
            while (true) {
                const { data, error } = await supabase
                    .from('inventory')
                    .select('*')
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) { console.error('[DB] Inventory pull error:', error); break; }
                if (!data || data.length === 0) break;

                await bulkUpsertChunked(db.inventory, data, 100);
                if (data.length < pageSize) break;
                page++;
            }

            // Pull Finance
            const { data: finData, error: finError } = await supabase.from('finance').select('*');
            if (!finError && finData) await db.finance.bulkUpsert(finData);

            // Pull logistics/crates
            const { data: cratesData, error: cratesError } = await supabase.from('logistics').select('*');
            if (!cratesError && cratesData) await db.crates.bulkUpsert(cratesData);

            console.log('[DB] Background sync complete');
        } catch (err) {
            console.error('[DB] Background sync failed:', err);
        }
    };

    // Fire-and-forget — DB is returned immediately, data syncs in background
    pullReplication();
    return db;
};

export const getDatabase = () => {
    if (!dbPromise) {
        dbPromise = createDatabase();
    }
    return dbPromise;
};
