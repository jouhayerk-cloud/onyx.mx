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

/**
 * What an embedder returns for a batch. The tagged form names the model that actually produced the vectors; the
 * runner then refuses to write them under a different model_version (vectors of two models must never mix).
 * A bare array (a test double) is trusted to match options.modelVersion.
 */
export type EmbedBatchOutput = Float32Array[] | { vectors: Float32Array[]; model: string } | null;
export type EmbedBatchFn = (docs: Array<{ title: string; text: string }>) => Promise<EmbedBatchOutput>;

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
    /** Set when the active embedder is not the model the index is built with; nothing from it was kept. */
    modelMismatch?: { expected: string; actual: string };
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DIMS = 768;

/** Default embedder: on-device companion, loaded lazily so tests with a mock never touch the bridge. Reports its model. */
async function defaultEmbedBatch(docs: Array<{ title: string; text: string }>): Promise<EmbedBatchOutput> {
    const { embedDocumentBatchTagged } = await import('../ai/embeddings');
    return embedDocumentBatchTagged(docs, DEFAULT_DIMS);
}

/**
 * Plans and executes an embedding sync pass. Does not write to Supabase; returns
 * the records to upsert and ids to delete. Stops at the first failed batch
 * (null, thrown error, or length mismatch) and reports completed=false, keeping
 * records from batches that already succeeded.
 *
 * model_version of each record is the model the embedder reports for those very vectors. If it is not the
 * index's modelVersion, the run stops with modelMismatch and keeps nothing from that batch.
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
    let modelMismatch: SyncResult['modelMismatch'];

    for (let start = 0; start < planned.toEmbed.length; start += batchSize) {
        const batchItems: SyncItem[] = [];
        for (const id of planned.toEmbed.slice(start, start + batchSize)) {
            const item = itemsById.get(id);
            if (item) batchItems.push(item);
        }
        if (batchItems.length === 0) continue;

        let vectors: Float32Array[] | null = null;
        let reportedModel: string | undefined;
        try {
            const out = await embedBatch(batchItems.map((item) => ({ title: item.title, text: item.text })));
            if (Array.isArray(out)) {
                vectors = out;
            } else if (out) {
                vectors = out.vectors;
                reportedModel = out.model;
            }
        } catch {
            vectors = null;
        }

        if (!vectors || vectors.length !== batchItems.length) {
            completed = false;
            break;
        }
        if (reportedModel !== undefined && reportedModel !== modelVersion) {
            completed = false;
            modelMismatch = { expected: modelVersion, actual: reportedModel };
            break;
        }

        batchItems.forEach((item, index) => {
            recordsToUpsert.push({
                item_id: item.id,
                modality: 'text',
                embedding: Array.from(vectors![index]),
                model_version: reportedModel ?? modelVersion,
                source_hash: sourceHashOf(item.title, item.text),
            });
        });
    }

    return {
        planned,
        recordsToUpsert,
        idsToDelete: [...planned.toDelete],
        completed,
        ...(modelMismatch ? { modelMismatch } : {}),
    };
}
