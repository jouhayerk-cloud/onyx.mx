import { supabase } from '../supabase';
import { planEmbeddingSync } from './syncPlan';
import type { StoredEmbeddingRow } from './syncPlan';
import { runItemEmbeddingSync } from './syncRunner';
import type { EmbeddingRecord, EmbedBatchFn, SyncItem, SyncResult, SyncPlan } from './syncRunner';
import { getActiveEmbedder } from '../ai/embeddings';
import { VectorIndex } from './vectorIndex';
import { truncateAndNormalize } from './vectorMath';
import { QUERY_VECTOR_DIMS } from './useHybridSearch';

export interface SyncProgressUpdate {
    current: number;
    total: number;
    stage: 'loading' | 'planning' | 'embedding' | 'writing' | 'done';
}

export interface SyncToSupabaseOptions {
    modelVersion?: string;
    batchSize?: number;
    embedBatchFn?: EmbedBatchFn;
    onProgress?: (progress: SyncProgressUpdate) => void;
}

export interface SyncToSupabaseResult extends SyncResult {
    upsertedCount: number;
    deletedCount: number;
}

/**
 * Builds a normalized SyncItem (id, title, text) from an inventory row.
 * Uses short_description + detailed_description + generated_description per Onyx conventions.
 */
export function buildSyncItem(item: any): SyncItem {
    const d = item.data ?? item;
    const title = (
        d.detailed_description ||
        d.detailedDescription ||
        d.short_description ||
        d.shortDescription ||
        d.description ||
        d.item_id ||
        d.itemId ||
        ''
    ).trim();

    const descParts = [
        d.short_description || d.shortDescription,
        d.detailed_description || d.detailedDescription,
        d.generated_description || d.generatedDescription,
    ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

    if (descParts.length === 0 && d.description && typeof d.description === 'string' && d.description.trim().length > 0) {
        descParts.push(d.description.trim());
    }

    const text = descParts.join(' ').trim();
    const id = String(d.id ?? item.id ?? item.row ?? '');

    return {
        id,
        title,
        text: text || title,
    };
}

/**
 * Loads existing item_embeddings rows for the given item ids into StoredEmbeddingRow[].
 */
export async function fetchStoredEmbeddingRows(itemIds: string[]): Promise<StoredEmbeddingRow[]> {
    if (itemIds.length === 0) return [];
    const CHUNK_SIZE = 100;
    const stored: StoredEmbeddingRow[] = [];

    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
        const chunk = itemIds.slice(i, i + CHUNK_SIZE);
        let res = await (supabase as any)
            .from('item_embeddings')
            .select('item_id, source_hash, model_version')
            .in('item_id', chunk);

        if (res.error && res.error.message?.includes('item_id')) {
            res = await (supabase as any)
                .from('item_embeddings')
                .select('id, source_hash, model_version')
                .in('id', chunk);
        }

        if (res.error) {
            console.error('[syncToSupabase] Error reading item_embeddings:', res.error);
            throw new Error(`Failed to read existing embeddings: ${res.error.message}`);
        }

        if (res.data && Array.isArray(res.data)) {
            for (const row of res.data) {
                stored.push({
                    id: String(row.item_id ?? row.id),
                    sourceHash: String(row.source_hash ?? ''),
                    modelVersion: String(row.model_version ?? ''),
                });
            }
        }
    }

    return stored;
}

const DB_WRITE_BATCH_SIZE = 50;

/**
 * Upserts recordsToUpsert into item_embeddings in batches (50 rows per batch).
 */
export async function writeEmbeddingRecords(records: EmbeddingRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    let written = 0;

    for (let i = 0; i < records.length; i += DB_WRITE_BATCH_SIZE) {
        const batch = records.slice(i, i + DB_WRITE_BATCH_SIZE);
        let res = await (supabase as any)
            .from('item_embeddings')
            .upsert(batch);

        if (res.error && res.error.message?.includes('item_id') && res.error.message?.includes('does not exist')) {
            const idBatch = batch.map(({ item_id, ...rest }) => ({ id: item_id, ...rest }));
            res = await (supabase as any).from('item_embeddings').upsert(idBatch);
        }

        if (res.error && (res.error.message?.includes('conflict') || res.error.code === '42P10')) {
            res = await (supabase as any)
                .from('item_embeddings')
                .upsert(batch, { onConflict: 'item_id' });
        }

        if (res.error) {
            console.error('[syncToSupabase] Error upserting into item_embeddings:', res.error);
            throw new Error(`Failed to write embeddings: ${res.error.message}`);
        }
        written += batch.length;
    }

    return written;
}

/**
 * Deletes idsToDelete from item_embeddings in batches (50 rows per batch).
 */
export async function deleteEmbeddingRecords(idsToDelete: string[]): Promise<number> {
    if (idsToDelete.length === 0) return 0;
    let deleted = 0;

    for (let i = 0; i < idsToDelete.length; i += DB_WRITE_BATCH_SIZE) {
        const chunk = idsToDelete.slice(i, i + DB_WRITE_BATCH_SIZE);
        let res = await (supabase as any)
            .from('item_embeddings')
            .delete()
            .in('item_id', chunk);

        if (res.error && res.error.message?.includes('item_id')) {
            res = await (supabase as any)
                .from('item_embeddings')
                .delete()
                .in('id', chunk);
        }

        if (res.error) {
            console.error('[syncToSupabase] Error deleting from item_embeddings:', res.error);
            throw new Error(`Failed to delete old embeddings: ${res.error.message}`);
        }
        deleted += chunk.length;
    }

    return deleted;
}

/**
 * Runs item embedding sync against live inventory rows and writes results to Supabase.
 * Read-only on all other tables.
 */
export async function syncItemEmbeddingsToSupabase(
    rawItems: any[],
    options: SyncToSupabaseOptions = {}
): Promise<SyncToSupabaseResult> {
    const syncItems = rawItems.map(buildSyncItem).filter(i => Boolean(i.id));

    let modelVersion = options.modelVersion;
    if (!modelVersion) {
        const embedder = await getActiveEmbedder();
        if (embedder) {
            try {
                const info = await embedder.info();
                modelVersion = info.model;
            } catch {
                // Ignore embedder info error
            }
        }
    }
    if (!modelVersion) {
        modelVersion = 'embeddinggemma';
    }

    // 1. Load stored embeddings
    options.onProgress?.({
        current: 0,
        total: syncItems.length,
        stage: 'loading',
    });
    const itemIds = syncItems.map(i => i.id);
    const stored = await fetchStoredEmbeddingRows(itemIds);

    // 2. Plan sync
    options.onProgress?.({
        current: 0,
        total: syncItems.length,
        stage: 'planning',
    });
    const planned = planEmbeddingSync(
        syncItems.map(i => ({ id: i.id, title: i.title, text: i.text, updatedAt: '' })),
        stored,
        modelVersion
    );

    const totalToEmbed = planned.toEmbed.length;

    // If nothing to embed or delete, sync is complete
    if (totalToEmbed === 0 && planned.toDelete.length === 0) {
        options.onProgress?.({
            current: syncItems.length,
            total: syncItems.length,
            stage: 'done',
        });
        return {
            planned,
            recordsToUpsert: [],
            idsToDelete: [],
            completed: true,
            upsertedCount: 0,
            deletedCount: 0,
        };
    }

    // 3. Wrap embedBatchFn with progress tracking
    let embeddedCount = 0;
    const baseEmbedBatch: EmbedBatchFn = options.embedBatchFn ?? (async (docs) => {
        const { embedDocumentBatchTagged } = await import('../ai/embeddings');
        return embedDocumentBatchTagged(docs, 768);
    });

    const trackingEmbedBatch: EmbedBatchFn = async (docs) => {
        const out = await baseEmbedBatch(docs);
        embeddedCount += docs.length;
        options.onProgress?.({
            current: Math.min(embeddedCount, totalToEmbed),
            total: totalToEmbed,
            stage: 'embedding',
        });
        return out;
    };

    // 4. Run sync runner
    const syncResult = await runItemEmbeddingSync({
        items: syncItems,
        stored,
        modelVersion,
        batchSize: options.batchSize,
        embedBatchFn: trackingEmbedBatch,
    });

    // 5. Write to Supabase (batched, 50 rows per batch)
    options.onProgress?.({
        current: 0,
        total: syncResult.recordsToUpsert.length + syncResult.idsToDelete.length,
        stage: 'writing',
    });

    const upsertedCount = await writeEmbeddingRecords(syncResult.recordsToUpsert);
    const deletedCount = await deleteEmbeddingRecords(syncResult.idsToDelete);

    // Invalidate cached session vector index so subsequent searches see fresh embeddings
    resetSessionVectorIndex();

    options.onProgress?.({
        current: totalToEmbed,
        total: totalToEmbed,
        stage: 'done',
    });

    return {
        ...syncResult,
        upsertedCount,
        deletedCount,
    };
}

let cachedSessionIndex: VectorIndex | null = null;
let sessionIndexLoaded = false;
let sessionIndexPromise: Promise<VectorIndex | null> | null = null;

function parseVector(raw: unknown): Float32Array | null {
    if (!raw) return null;
    if (raw instanceof Float32Array) return raw;
    if (Array.isArray(raw)) return new Float32Array(raw);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return new Float32Array(parsed);
        } catch {
            const cleaned = raw.replace(/[\[\]]/g, '').trim();
            if (!cleaned) return null;
            const parts = cleaned.split(',').map(s => Number(s.trim()));
            if (parts.some(isNaN)) return null;
            return new Float32Array(parts);
        }
    }
    return null;
}

/**
 * Loads a VectorIndex from item_embeddings once per session (lazy, on first search, cached).
 * Silently returns null if the table has 0 rows or the fetch fails.
 */
export async function loadSessionVectorIndex(): Promise<VectorIndex | null> {
    if (sessionIndexLoaded) return cachedSessionIndex;
    if (sessionIndexPromise) return sessionIndexPromise;

    sessionIndexPromise = (async () => {
        try {
            let res = await (supabase as any)
                .from('item_embeddings')
                .select('item_id, embedding, model_version');

            if (res.error && res.error.message?.includes('item_id')) {
                res = await (supabase as any)
                    .from('item_embeddings')
                    .select('id, embedding, model_version');
            }

            if (res.error || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
                cachedSessionIndex = null;
                sessionIndexLoaded = true;
                return null;
            }

            const modelVersion = String(res.data[0]?.model_version || 'unknown');
            const index = new VectorIndex(QUERY_VECTOR_DIMS, modelVersion);

            for (const row of res.data) {
                const id = String(row.item_id ?? row.id ?? '');
                if (!id) continue;
                const vec = parseVector(row.embedding);
                if (vec && vec.length >= QUERY_VECTOR_DIMS) {
                    const truncated = truncateAndNormalize(vec, QUERY_VECTOR_DIMS);
                    index.upsert(id, truncated);
                }
            }

            cachedSessionIndex = index.size > 0 ? index : null;
            sessionIndexLoaded = true;
            return cachedSessionIndex;
        } catch {
            cachedSessionIndex = null;
            sessionIndexLoaded = true;
            return null;
        } finally {
            sessionIndexPromise = null;
        }
    })();

    return sessionIndexPromise;
}

/**
 * Resets the cached session VectorIndex so it re-fetches from Supabase on next search.
 */
export function resetSessionVectorIndex(): void {
    cachedSessionIndex = null;
    sessionIndexLoaded = false;
    sessionIndexPromise = null;
}
