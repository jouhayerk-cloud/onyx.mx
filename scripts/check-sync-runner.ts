import { runItemEmbeddingSync } from '../src/lib/embeddings/syncRunner';
import { sourceHashOf } from '../src/lib/embeddings/syncPlan';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

async function main(): Promise<void> {
    const items = [1, 2, 3, 4, 5].map((n) => ({ id: 'item-' + n, title: 'Title ' + n, text: 'Text ' + n }));
    const model = 'm1';
    const stored = [
        { id: 'item-1', sourceHash: sourceHashOf('Title 1', 'Text 1'), modelVersion: model },
        { id: 'item-2', sourceHash: 'stale000', modelVersion: model },
        { id: 'gone-1', sourceHash: 'abcd1234', modelVersion: model },
    ];

    // Batching, hash preservation, deletion tracking.
    const batchSizes: number[] = [];
    const result = await runItemEmbeddingSync({
        items,
        stored,
        modelVersion: model,
        batchSize: 2,
        embedBatchFn: async (docs) => {
            batchSizes.push(docs.length);
            return docs.map(() => new Float32Array([0.5, 0.25]));
        },
    });
    assert(result.completed, 'run should complete');
    assert(result.planned.toEmbed.join(',') === 'item-2,item-3,item-4,item-5', 'plan toEmbed');
    assert(batchSizes.join(',') === '2,2', 'batches of 2: ' + batchSizes.join(','));
    assert(result.recordsToUpsert.length === 4, 'four records');
    assert(result.idsToDelete.join(',') === 'gone-1', 'deletion tracked');
    for (const record of result.recordsToUpsert) {
        const item = items.find((i) => i.id === record.item_id)!;
        assert(record.source_hash === sourceHashOf(item.title, item.text), 'hash preserved for ' + record.item_id);
        assert(record.model_version === model, 'model version');
        assert(record.modality === 'text', 'modality');
        assert(Array.isArray(record.embedding) && record.embedding[0] === 0.5, 'embedding is number[]');
    }

    // Default batch size of 10 yields a single batch for 5 items.
    const sizes: number[] = [];
    await runItemEmbeddingSync({
        items,
        stored: [],
        modelVersion: model,
        embedBatchFn: async (docs) => {
            sizes.push(docs.length);
            return docs.map(() => new Float32Array([1]));
        },
    });
    assert(sizes.join(',') === '5', 'default batch size');

    // Failure on second batch keeps first batch's records, completed=false.
    let calls = 0;
    const partial = await runItemEmbeddingSync({
        items,
        stored: [],
        modelVersion: model,
        batchSize: 2,
        embedBatchFn: async (docs) => {
            calls++;
            return calls === 1 ? docs.map(() => new Float32Array([1])) : null;
        },
    });
    assert(!partial.completed, 'partial run incomplete');
    assert(partial.recordsToUpsert.length === 2, 'first batch kept');

    // Up-to-date input: nothing to do, embedder never called.
    let called = false;
    const noop = await runItemEmbeddingSync({
        items: [items[0]],
        stored: [stored[0]],
        modelVersion: model,
        embedBatchFn: async () => {
            called = true;
            return [];
        },
    });
    assert(noop.completed && noop.recordsToUpsert.length === 0 && !called, 'noop run');

    console.log('sync runner checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
