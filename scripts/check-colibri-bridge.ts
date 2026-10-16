/**
 * scripts/check-colibri-bridge.ts
 * Standalone test harness for Colibrì local vector embeddings bridge,
 * provider properties, query/document formatting, and Matryoshka vector normalization.
 *
 * Run via: npx tsx scripts/check-colibri-bridge.ts
 */

import assert from 'node:assert/strict';
import {
    COLIBRI_INFO,
    colibriProvider,
    getColibriEmbedder,
    ColibriEmbedder,
    isColibriEmbedderAvailable,
    formatQuery,
    formatDocument,
    PROMPTS,
    extractEmbeddingVectors,
    resetColibriEmbedder,
} from '../src/lib/embeddings/colibriBridge';
import {
    embedDocumentBatch,
    embedSearchQuery,
    isCompanionAvailable,
    resetEmbeddingsCache,
} from '../src/lib/ai/embeddings';

const near = (a: number, b: number, eps = 1e-5): void => {
    assert.ok(Math.abs(a - b) <= eps, `${a} is not approximately ${b} (diff: ${Math.abs(a - b)})`);
};

const norm = (v: Float32Array): number =>
    Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));

async function runTests(): Promise<void> {
    console.log('Running Colibrì bridge verification harness...');

    // ---------------------------------------------------------
    // 1. Basic Provider Properties & Capabilities
    // ---------------------------------------------------------
    console.log('  [1/6] Verifying COLIBRI_INFO and colibriProvider...');
    assert.strictEqual(COLIBRI_INFO.id, 'colibri', 'Provider ID must be "colibri"');
    assert.ok(COLIBRI_INFO.label.includes('Colibrì'), 'Label must mention Colibrì');
    assert.strictEqual(COLIBRI_INFO.defaultBaseUrl, 'http://127.0.0.1:8082');
    assert.strictEqual(COLIBRI_INFO.needsBaseUrl, false);
    assert.strictEqual(COLIBRI_INFO.capabilities.json, true);
    assert.strictEqual(COLIBRI_INFO.capabilities.vision, false);
    assert.strictEqual(typeof (colibriProvider as any).streamChat, 'function');

    assert.strictEqual(colibriProvider.info, COLIBRI_INFO);
    assert.strictEqual(typeof colibriProvider.test, 'function');
    assert.strictEqual(typeof colibriProvider.generateText, 'function');
    assert.strictEqual(typeof colibriProvider.generateJson, 'function');

    // ---------------------------------------------------------
    // 2. ColibriEmbedder Class & Singleton Mechanics
    // ---------------------------------------------------------
    console.log('  [2/6] Verifying ColibriEmbedder signatures & singleton...');
    resetColibriEmbedder();
    const embedder = getColibriEmbedder();
    assert.ok(embedder, 'getColibriEmbedder() should return an embedder instance');
    assert.ok(embedder instanceof ColibriEmbedder, 'Should be an instance of ColibriEmbedder');

    const embedder2 = getColibriEmbedder();
    assert.strictEqual(embedder, embedder2, 'getColibriEmbedder() must return singleton instance');

    // Method signatures
    assert.strictEqual(typeof embedder.info, 'function');
    assert.strictEqual(typeof embedder.embedQuery, 'function');
    assert.strictEqual(typeof embedder.embedDocuments, 'function');
    assert.strictEqual(typeof embedder.embedImage, 'function');
    assert.strictEqual(typeof embedder.embedAudio, 'function');
    assert.strictEqual(typeof isColibriEmbedderAvailable, 'function');

    // Metadata contract
    const info = await embedder.info();
    assert.strictEqual(info.model, 'colibri-embed-v1');
    assert.strictEqual(info.dims, 768);
    assert.strictEqual(info.version, '1.0.0');
    assert.deepStrictEqual(info.modalities, ['text']);

    // Modality guards
    await assert.rejects(
        () => embedder.embedImage('QUJD', 'image/png'),
        /does not support image embeddings/i
    );
    await assert.rejects(
        () => embedder.embedAudio('QUJD', 'audio/mp3'),
        /does not support audio embeddings/i
    );

    // ---------------------------------------------------------
    // 3. Prompt and Document Formatting
    // ---------------------------------------------------------
    console.log('  [3/6] Verifying query and document prompt formatting...');
    assert.strictEqual(
        formatQuery('aviation fastener 1/4"'),
        PROMPTS.query + 'aviation fastener 1/4"'
    );
    assert.strictEqual(
        formatDocument('Fastener Specs', 'Corrosion resistant stainless steel'),
        PROMPTS.documentTitled('Fastener Specs') + 'Corrosion resistant stainless steel'
    );
    assert.strictEqual(
        formatDocument('', 'Untitled description'),
        PROMPTS.documentUntitled + 'Untitled description'
    );
    assert.strictEqual(
        formatDocument('   ', 'Whitespace title only'),
        PROMPTS.documentUntitled + 'Whitespace title only'
    );

    // ---------------------------------------------------------
    // 4. Response Parsing Utility
    // ---------------------------------------------------------
    console.log('  [4/6] Verifying extractEmbeddingVectors across API shapes...');
    // Standard OpenAI list format
    const openAiShape = {
        data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
        ],
    };
    const extracted1 = extractEmbeddingVectors(openAiShape);
    assert.deepStrictEqual(extracted1, [[0.1, 0.2], [0.3, 0.4]]);

    // Array of arrays
    assert.deepStrictEqual(
        extractEmbeddingVectors({ data: [[1, 2], [3, 4]] }),
        [[1, 2], [3, 4]]
    );

    // Single embedding
    assert.deepStrictEqual(
        extractEmbeddingVectors({ embedding: [5, 6, 7] }),
        [[5, 6, 7]]
    );

    // ---------------------------------------------------------
    // 5. Mock Vector HTTP Handling & Normalization
    // ---------------------------------------------------------
    console.log('  [5/6] Verifying vector math, truncation & L2 normalization...');
    const originalFetch = globalThis.fetch;
    let mockServerUp = true;
    let receivedUrls: string[] = [];
    let receivedBodies: any[] = [];

    // Synthesize a 768-dim mock vector with known head [3, 4, 0, 0, ...]
    const mock768 = new Array(768).fill(0);
    mock768[0] = 3;
    mock768[1] = 4;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        receivedUrls.push(urlStr);

        if (!mockServerUp) {
            throw new Error('fetch failed (ECONNREFUSED)');
        }

        let bodyObj: any = null;
        if (init?.body && typeof init.body === 'string') {
            try {
                bodyObj = JSON.parse(init.body);
                receivedBodies.push(bodyObj);
            } catch {
                // not json
            }
        }

        if (urlStr.endsWith('/health')) {
            return new Response(JSON.stringify({ ok: true, status: 'healthy', cache_hit: 0.88 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (urlStr.endsWith('/v1/models')) {
            return new Response(
                JSON.stringify({
                    object: 'list',
                    data: [
                        { id: 'colibri-embed-v1' },
                        { id: 'colibri-glm-5.2-moe' },
                    ],
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        if (urlStr.endsWith('/v1/embeddings')) {
            const inputVal = bodyObj?.input;
            if (Array.isArray(inputVal)) {
                return new Response(
                    JSON.stringify({
                        object: 'list',
                        data: inputVal.map((_, i) => ({
                            object: 'embedding',
                            index: i,
                            embedding: mock768,
                        })),
                        model: 'colibri-embed-v1',
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            }

            return new Response(
                JSON.stringify({
                    object: 'list',
                    data: [{ object: 'embedding', index: 0, embedding: mock768 }],
                    model: 'colibri-embed-v1',
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        return new Response('Not Found', { status: 404 });
    };

    globalThis.fetch = mockFetch as any;

    try {
        // Availability test when server is UP
        mockServerUp = true;
        const available = await isColibriEmbedderAvailable();
        assert.strictEqual(available, true, 'isColibriEmbedderAvailable() should be true when daemon is UP');

        // Test colibriProvider.test()
        const testRes = await colibriProvider.test({ key: '' });
        assert.strictEqual(testRes.ok, true);
        assert.ok(testRes.message.includes('active') || testRes.message.includes('online'));

        // Query embedding with Matryoshka truncation to 2 dims
        receivedBodies = [];
        const qVec2 = await embedder.embedQuery('test hardware query', 2);
        assert.strictEqual(qVec2.length, 2, 'Vector length must match requested dims=2');
        near(norm(qVec2), 1.0);
        near(qVec2[0], 0.6); // 3 / 5
        near(qVec2[1], 0.8); // 4 / 5

        // Verify sent body was properly formatted with query prefix
        assert.strictEqual(receivedBodies.length, 1);
        assert.strictEqual(
            receivedBodies[0].input,
            PROMPTS.query + 'test hardware query'
        );
        assert.strictEqual(receivedBodies[0].model, 'colibri-embed-v1');

        // Query embedding with full 768 dims
        const qVec768 = await embedder.embedQuery('test hardware query 2', 768);
        assert.strictEqual(qVec768.length, 768);
        near(norm(qVec768), 1.0);
        near(qVec768[0], 0.6);
        near(qVec768[1], 0.8);

        // Document batch embedding
        receivedBodies = [];
        const docs = await embedder.embedDocuments(
            [
                { title: 'Crate X', text: 'Telemetry unit' },
                { title: '', text: 'Sensors only' },
            ],
            4
        );
        assert.strictEqual(docs.length, 2);
        assert.strictEqual(docs[0].length, 4);
        assert.strictEqual(docs[1].length, 4);
        near(norm(docs[0]), 1.0);
        near(norm(docs[1]), 1.0);

        // Verify documents payload prefixing
        assert.strictEqual(receivedBodies.length, 1);
        assert.deepStrictEqual(receivedBodies[0].input, [
            PROMPTS.documentTitled('Crate X') + 'Telemetry unit',
            PROMPTS.documentUntitled + 'Sensors only',
        ]);

        // Empty documents batch should return [] without invoking network
        receivedBodies = [];
        const emptyDocs = await embedder.embedDocuments([]);
        assert.deepStrictEqual(emptyDocs, []);
        assert.strictEqual(receivedBodies.length, 0);

        // ---------------------------------------------------------
        // 6. Cascade Integration with src/lib/ai/embeddings.ts
        // ---------------------------------------------------------
        console.log('  [6/6] Verifying AI cascade priority (iOS companion -> Colibri -> Cloud)...');
        resetEmbeddingsCache();

        // Ensure global window webkit handler is absent (simulating Windows Desktop)
        const globalWithWindow = globalThis as any;
        const savedWindow = globalWithWindow.window;
        delete globalWithWindow.window;

        // When daemon is UP, isCompanionAvailable() should return true via Colibri
        const companionAvailable = await isCompanionAvailable();
        assert.strictEqual(companionAvailable, true, 'isCompanionAvailable should resolve true via Colibri');

        // embedSearchQuery should route to Colibri
        const searchVec = await embedSearchQuery('laser stencil bed', 2);
        assert.ok(searchVec);
        assert.strictEqual(searchVec.length, 2);
        near(norm(searchVec), 1.0);
        near(searchVec[0], 0.6);
        near(searchVec[1], 0.8);

        // Repeated identical query should hit memory cache
        const cachedSearchVec = await embedSearchQuery('laser stencil bed', 2);
        assert.strictEqual(cachedSearchVec, searchVec, 'Cached query must return identical vector reference');

        // Document batch should route to Colibri
        const batchVecs = await embedDocumentBatch(
            [{ title: 'Birch Plywood', text: '6mm 600x600' }],
            4
        );
        assert.ok(batchVecs);
        assert.strictEqual(batchVecs.length, 1);
        assert.strictEqual(batchVecs[0].length, 4);
        near(norm(batchVecs[0]), 1.0);

        // When daemon is DOWN and bridge is absent, isCompanionAvailable() returns false
        mockServerUp = false;
        resetEmbeddingsCache();
        const availableDown = await isColibriEmbedderAvailable();
        assert.strictEqual(availableDown, false, 'isColibriEmbedderAvailable should be false when down');

        const testResDown = await colibriProvider.test({ key: '' });
        assert.strictEqual(testResDown.ok, false);
        assert.ok(testResDown.message.includes('unreachable') || testResDown.message.includes('not reachable'));

        const companionDown = await isCompanionAvailable();
        assert.strictEqual(companionDown, false, 'isCompanionAvailable should be false when down');

        const searchDown = await embedSearchQuery('laser stencil bed', 2);
        assert.strictEqual(searchDown, null, 'embedSearchQuery should return null when unavailable');

        const batchDown = await embedDocumentBatch([{ title: 'A', text: 'B' }], 4);
        assert.strictEqual(batchDown, null, 'embedDocumentBatch should return null when unavailable');

        // Restore window if any
        if (savedWindow) {
            globalWithWindow.window = savedWindow;
        }
    } finally {
        globalThis.fetch = originalFetch;
    }

    console.log('colibri-bridge checks passed');
}

runTests().catch(err => {
    console.error('❌ Check failed with error:', err);
    process.exit(1);
});
