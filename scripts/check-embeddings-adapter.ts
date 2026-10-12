import assert from 'node:assert';
import {
    embedDocumentBatch,
    embedSearchQuery,
    isCompanionAvailable,
    resetEmbeddingsCache,
} from '../src/lib/ai/embeddings';

interface MockMessage {
    op: string;
    kind?: string;
    texts?: string[];
}

interface MockWindow {
    webkit?: { messageHandlers: { onyxEmbed: { postMessage(msg: MockMessage): Promise<unknown> } } };
}

const globalWithWindow = globalThis as unknown as { window?: MockWindow };

let embedCalls = 0;
let infoCalls = 0;

const RAW = [3, 4, 0, 0, 12, 0, 0, 0];

function installBridge(): void {
    globalWithWindow.window = {
        webkit: {
            messageHandlers: {
                onyxEmbed: {
                    async postMessage(msg: MockMessage): Promise<unknown> {
                        if (msg.op === 'info') {
                            infoCalls++;
                            return { model: 'mock', dims: RAW.length, version: '1', modalities: ['text'] };
                        }
                        if (msg.op === 'embed') {
                            embedCalls++;
                            const texts = msg.texts ?? [];
                            return { vectors: texts.map(() => RAW) };
                        }
                        throw new Error('unsupported op');
                    },
                },
            },
        },
    };
}

function norm(v: Float32Array): number {
    return Math.sqrt(v.reduce((a, x) => a + x * x, 0));
}

async function main(): Promise<void> {
    // Bridge absent: fallback to null / false.
    delete globalWithWindow.window;
    resetEmbeddingsCache();
    assert.strictEqual(await isCompanionAvailable(), false);
    assert.strictEqual(await embedSearchQuery('hello'), null);
    assert.strictEqual(await embedDocumentBatch([{ title: 't', text: 'x' }]), null);

    // Bridge present.
    installBridge();
    resetEmbeddingsCache();
    assert.strictEqual(await isCompanionAvailable(), true);
    assert.strictEqual(await isCompanionAvailable(), true);
    assert.strictEqual(infoCalls, 1, 'availability should be cached');

    // Empty query.
    assert.strictEqual(await embedSearchQuery('   '), null);

    // Matryoshka truncation + normalisation + caching.
    const v1 = await embedSearchQuery('  hello  ', 2);
    assert.ok(v1);
    assert.strictEqual(v1.length, 2);
    assert.ok(Math.abs(norm(v1) - 1) < 1e-6);
    assert.ok(Math.abs(v1[0] - 0.6) < 1e-6 && Math.abs(v1[1] - 0.8) < 1e-6);
    const v2 = await embedSearchQuery('hello', 2);
    assert.strictEqual(v2, v1);
    assert.strictEqual(embedCalls, 1, 'identical query should hit cache');

    // Documents.
    const docs = await embedDocumentBatch([{ title: 'a', text: 'b' }, { title: '', text: 'c' }], 4);
    assert.ok(docs);
    assert.strictEqual(docs.length, 2);
    assert.strictEqual(docs[0].length, 4);

    delete globalWithWindow.window;
    console.log('embeddings adapter checks passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
