import { planEmbeddingSync, sourceHashOf } from './syncPlan';
import type { StoredEmbeddingRow, SyncPlanResult } from './syncPlan';

export type SyncPlan = SyncPlanResult;

export interface SyncItem {
    id: string;
    title: string;
    text: string;
}

export interface EmbeddingRecord {
    item_id: string;
    modality: 'text' | 'image' | 'audio';
    embedding: number[];
    model_version: string;
    source_hash: string;
}

export type EmbedBatchFn = (docs: Array<{ title: string; text: string }>) => Promise<Float32Array[] | null>;

export interface SyncOptions {
    items: SyncItem[];
    stored: StoredEmbeddingRow[];
    modelVersion: string;
    batchSize?: number;
    embedBatchFn?: EmbedBatchFn;
}

export interface SyncResult {
    planned: SyncPlan;
    recordsToUpsert: EmbeddingRecord[];
    idsToDelete: string[];
    completed: boolean;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DIMS = 768;

/** Default embedder: on-device companion, loaded lazily so tests with a mock never touch the bridge. */
async function defaultEmbedBatch(docs: Array<{ title: string; text: string }>): Promise<Float32Array[] | null> {
    const { embedDocumentBatch } = await import('../ai/embeddings');
    return embedDocumentBatch(docs, DEFAULT_DIMS);
}

/**
 * Plans and executes an embedding sync pass. Does not write to Supabase; returns
 * the records to upsert and ids to delete. Stops at the first failed batch
 * (null, thrown error, or length mismatch) and reports completed=false, keeping
 * records from batches that already succeeded.
 */
export async function runItemEmbeddingSync(options: SyncOptions): Promise<SyncResult> {
    const { items, stored, modelVersion } = options;
    const requested = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const batchSize = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_BATCH_SIZE;
    const embedBatch: EmbedBatchFn = options.embedBatchFn ?? defaultEmbedBatch;

    const planned = planEmbeddingSync(
        items.map((item) => ({ id: item.id, title: item.title, text: item.text, updatedAt: '' })),
        stored,
        modelVersion,
    );

    const itemsById = new Map<string, SyncItem>();
    for (const item of items) {
        if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    }

    const recordsToUpsert: EmbeddingRecord[] = [];
    let completed = true;

    for (let start = 0; start < planned.toEmbed.length; start += batchSize) {
        const batchItems: SyncItem[] = [];
        for (const id of planned.toEmbed.slice(start, start + batchSize)) {
            const item = itemsById.get(id);
            if (item) batchItems.push(item);
        }
        if (batchItems.length === 0) continue;

        let vectors: Float32Array[] | null = null;
        try {
            vectors = await embedBatch(batchItems.map((item) => ({ title: item.title, text: item.text })));
        } catch {
            vectors = null;
        }

        if (!vectors || vectors.length !== batchItems.length) {
            completed = false;
            break;
        }

        batchItems.forEach((item, index) => {
            recordsToUpsert.push({
                item_id: item.id,
                modality: 'text',
                embedding: Array.from(vectors![index]),
                model_version: modelVersion,
                source_hash: sourceHashOf(item.title, item.text),
            });
        });
    }

    return {
        planned,
        recordsToUpsert,
        idsToDelete: [...planned.toDelete],
        completed,
    };
}
