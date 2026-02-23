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

const inventorySchema = {
    title: 'inventory schema',
    version: 0,
    description: 'describes an inventory item',
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
        expires: { type: 'string' },
        mediaUrls: { type: 'string' },
        shortDescription: { type: 'string' },
        generatedDescription: { type: 'string' },
        detailedDescription: { type: 'string' },
        generatedImageUrls: { type: 'string' },
        generatedPngUrl: { type: 'string' },
        generatedSvgUrl: { type: 'string' },
        spatialBoxes2d: { type: 'string' },
        spatialPoints: { type: 'string' },
        spatialMasks: { type: 'string' },
        spatialBoxes3d: { type: 'string' },
        isClientVisible: { type: ['string', 'boolean'] },
        printDate: { type: 'string' },
        payDate: { type: 'string' },
        payReq: { type: 'string' },
        sentDate: { type: 'string' },
        bookLanded: { type: 'string' },
        bookRetail: { type: 'string' },
        bookBardcode: { type: 'string' },
        bookAqCode: { type: 'string' },
        bookLandCode: { type: 'string' },
        crateId: { type: 'string' },
        updatedAt: { type: 'string' }
    },
    required: ['itemId', 'itemNumber']
};

export type InventoryCollection = RxCollection<any>;
export type OnyxDatabase = RxDatabase<{
    inventory: InventoryCollection;
}>;

let dbPromise: Promise<OnyxDatabase> | null = null;

const createDatabase = async () => {
    const db = await createRxDatabase<OnyxDatabase>({
        name: 'onyxdb',
        storage: getRxStorageDexie()
    });

    await db.addCollections({
        inventory: {
            schema: inventorySchema
        }
    });

    // Simple pull replication from Supabase
    // In a real app, this would be more complex (using checkpoints, etc.)
    const pullReplication = async () => {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .order('updatedAt', { ascending: true });

        if (!error && data) {
            await db.inventory.bulkUpsert(data);
        }
    };

    // Initial pull
    pullReplication();

    return db;
};

export const getDatabase = () => {
    if (!dbPromise) {
        dbPromise = createDatabase();
    }
    return dbPromise;
};
