import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection, removeRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { supabase } from './supabase';
import { resolveSeason, type Season } from './seasons';
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);

const financeSchema = {
    title: 'finance schema',
    version: 7,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        season: { type: ['string', 'null'] },
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
    version: 5,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        season: { type: ['string', 'null'] },
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
    version: 18,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        season: { type: ['string', 'null'] },
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
        processed_media_urls: { type: ['string', 'null'] },
        generated_color: { type: ['string', 'null'] },
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
        // Processing stamps. pack_date is new; sent_manifest_id existed in the
        // client's read path but never as a column, which is why every dispatch
        // silently failed to record a ship date.
        pack_date: { type: ['string', 'null'] },
        sent_manifest_id: { type: ['string', 'null'] },
        // Print provenance: a checksum means the tag physically printed, as
        // opposed to a date which only means the wizard ran.
        print_job_checksum: { type: ['string', 'null'] },
        print_job_id: { type: ['string', 'null'] },
        payment_requested_at: { type: ['string', 'null'] },
        // Derived server-side and read-only. Synced so the client can filter
        // on them without recomputing the ladder in a dozen components.
        lifecycle_status: { type: ['string', 'null'] },
        payment_status: { type: ['string', 'null'] },
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
        updated_at: { type: ['string', 'null'] },
        video_gen: { type: ['string', 'null'] }
    }
};

/**
 * Unsaved form state, kept locally so a half-filled entry survives a reload, a
 * crash or a tab switch.
 *
 * Deliberately NOT part of the sync loop below: pullReplication prunes any local
 * row missing from Supabase, so a draft parked in a synced collection would be
 * deleted the moment the next sync ran. Keeping drafts in their own collection
 * makes them structurally immune to that.
 *
 * `data` is free-form on purpose — forms change shape often and a draft should
 * never fail to save because a field was added.
 */
const draftsSchema = {
    title: 'drafts schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        kind: { type: 'string', maxLength: 40 },
        season: { type: ['string', 'null'] },
        created_by: { type: ['string', 'null'] },
        created_at: { type: ['string', 'null'] },
        updated_at: { type: ['string', 'null'] },
        data: { type: 'object' }
    },
    required: ['id', 'kind'],
    indexes: ['kind']
};

export type OnyxDatabase = RxDatabase<{
    inventory: RxCollection<any>;
    finance: RxCollection<any>;
    logistics: RxCollection<any>;
    production: RxCollection<any>;
    shipments: RxCollection<any>;
    drafts: RxCollection<any>;
}>;

let dbPromise: Promise<OnyxDatabase> | null = null;

async function bulkUpsertChunked(collection: RxCollection<any>, docs: any[], chunkSize = 150, delay = 10) {
    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize).map(doc => ({
            ...doc,
            id: String(doc.id),
            workbook: doc.workbook != null ? String(doc.workbook) : null,
            season: doc.season != null ? String(doc.season) : null
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

/**
 * Local store name.
 *
 * Bumping this is the established way to recover from a migration that cannot
 * complete: the local store is a CACHE and Supabase is the source of truth, so
 * a clean name costs one re-sync and is far safer than repairing migration
 * state. That has been needed twice — once when an incomplete 13→14 inventory
 * migration left RxDB awaiting a step that never finished and the whole
 * database promise hung, and again at 17→18.
 *
 * Names retired so far, wiped on failure below to reclaim the space. Keep this
 * list append-only; a browser can hold any of them.
 */
const DB_NAME = 'onyxdb20';
const RETIRED_DB_NAMES = ['onyxdb18', 'onyxdb19'];

const createDatabase = async () => {
    // Check for Secure Context (Required for RxDB's Crypto/Subtle functionalities)
    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
        console.error('❌ [DB] Insecure Context Detected. RxDB requires a secure context (HTTPS or localhost) to use the Web Crypto API.');
        console.error('👉 Please access the app via https://192.168.1.71:1001/ or http://localhost:1001/');
        throw new Error('RxDB Initialization Failed: Insecure Context');
    }

    let db: OnyxDatabase | undefined;

    try {
        db = await createRxDatabase<OnyxDatabase>({
            name: DB_NAME,
            storage: getRxStorageDexie()
        });

        await db.addCollections({
            inventory: {
                schema: inventorySchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null, 5: () => null, 6: () => null, 7: () => null, 8: () => null, 9: () => null, 10: () => null, 11: (oldDoc) => oldDoc, 12: (oldDoc) => oldDoc, 13: (oldDoc) => oldDoc, 14: (oldDoc) => oldDoc,
                    // 15: season stamp added — left unset here, the next sync fills it in
                    // and rowSeason() infers from workbook until then.
                    15: (oldDoc) => oldDoc,
                    // 16: pack_date + sent_manifest_id added. Both are nullable
                    // and back-filled by the next sync, so existing docs pass
                    // through untouched.
                    16: (oldDoc) => oldDoc,
                    // 17: print provenance + the two derived status columns.
                    // All nullable and server-populated, so docs pass through.
                    17: (oldDoc) => oldDoc,
                    // 18: processed_media_urls + generated_color. Both were
                    // already coming down from Supabase — select('*') fetches
                    // every column — and were being discarded here, which is
                    // why nothing client-side could tell whether an item had
                    // been through image cleanup. Nullable and server-owned,
                    // so existing docs pass through and the next sync fills
                    // them in.
                    18: (oldDoc) => oldDoc,
                }
            },
            finance: {
                schema: financeSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null, 5: () => null, 6: () => null,
                    7: (oldDoc) => oldDoc,
                }
            },
            logistics: {
                schema: logisticsSchema,
                migrationStrategies: {
                    1: () => null, 2: () => null, 3: () => null, 4: () => null,
                    5: (oldDoc) => oldDoc,
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
            },
            // Local-only — never added to the sync loop below.
            drafts: {
                schema: draftsSchema
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

                // The _826 tables are retired: everything lives in the legacy tables and
                // the season is carried by the `workbook` column (v326 / v825 / v826),
                // which resolveSeason() reads. One source per collection.
                //
                // This also removes a trap in the old dual-load: once the _826 tables are
                // dropped, fetching them fails, allSourcesOk goes false, and the prune
                // below would never run again — so deleted rows would linger locally
                // forever.
                const getSeasonSources = (table: string): { name: string; season: Season }[] =>
                    [{ name: table, season: 'legacy' }];

                const syncCollection = async (table: string, collection: RxCollection<any>) => {
                    const sources = getSeasonSources(table);
                    const merged: any[] = [];
                    let allSourcesOk = true;

                    for (const source of sources) {
                        const { data, success } = await fetchPaginated(source.name);
                        if (!success) {
                            // A missing or erroring table must not make the rows it would have
                            // returned look deleted, so remember it and skip the prune below.
                            allSourcesOk = false;
                            continue;
                        }
                        for (const row of data) {
                            merged.push({ ...row, season: resolveSeason(row, source.season) });
                        }
                    }

                    // 1. Upsert new/updated records
                    if (merged.length > 0) {
                        await bulkUpsertChunked(collection, merged);
                    }

                    // 2. Prune stale records (items deleted from Supabase).
                    // Only safe when every source responded — otherwise a transient failure
                    // would wipe locally cached rows that still exist remotely.
                    if (!allSourcesOk) {
                        console.warn(`[DB] ${table}: skipping prune, not all season sources responded`);
                        return;
                    }

                    const localDocs = await collection.find().exec();

                    // An empty remote against a populated cache is far more likely to be a
                    // misconfigured season than a genuine mass delete — refuse to wipe.
                    if (merged.length === 0 && localDocs.length > 0) {
                        console.warn(`[DB] ${table}: remote returned 0 rows, keeping ${localDocs.length} cached records`);
                        return;
                    }

                    const remoteIds = new Set(merged.map(d => String(d.id)));
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

        localStorage.removeItem('onyx_last_reload');
        return db;
    } catch (err) {
        console.error('❌ [DB] Creation failed:', err);

        const lastReload = parseInt(localStorage.getItem('onyx_last_reload') || '0');
        const now = Date.now();

        if (now - lastReload > 15000) { // Increased to 15s for mobile stability
            console.warn(`⚠️ [DB] Wiping ${DB_NAME} and reloading...`);
            localStorage.setItem('onyx_last_reload', now.toString());

            setTimeout(async () => {
                try {
                    if (db) await db.destroy().catch(() => {});
                    // DB_NAME, not a literal. This previously named a store the
                    // app had already stopped using, so recovery wiped nothing,
                    // reloaded into the same failure, and the second pass hit
                    // the loop guard below — leaving the app on its skeleton
                    // with no way out.
                    await removeRxDatabase(DB_NAME, getRxStorageDexie());
                    for (const stale of RETIRED_DB_NAMES) {
                        await removeRxDatabase(stale, getRxStorageDexie()).catch(() => {});
                    }
                } catch (_) { /* Ignore wipe errors */ }
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
