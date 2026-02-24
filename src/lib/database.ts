import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { supabase } from './supabase';

// Add plugins
if (import.meta.env.DEV) {
    addRxPlugin(RxDBDevModePlugin);
}
addRxPlugin(RxDBQueryBuilderPlugin);
// addRxPlugin(RxDBReplicationPlugin); // Removed as it might be wrong import

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

    const pullReplication = async () => {
        // Pull Inventory
        const inv = await supabase.from('inventory').select('*');
        if (inv.data) await db.inventory.bulkUpsert(inv.data);

        // Pull Finance
        const fin = await supabase.from('finance').select('*');
        if (fin.data) await db.finance.bulkUpsert(fin.data);

        // Pull Crates (if table exists)
        const crates = await supabase.from('logistics').select('*');
        if (crates.data) await db.crates.bulkUpsert(crates.data);
    };

    pullReplication();
    return db;
};

export const getDatabase = () => {
    if (!dbPromise) {
        dbPromise = createDatabase();
    }
    return dbPromise;
};
