/**
 * scripts/check-colibri-bridge.ts
 *
 * Checks the Colibri integration against the REAL server contract (colibri v2, measured on the owner's PC):
 *   - OpenAI API on http://127.0.0.1:8000, text only
 *   - ONE model at a time; GET /v1/models returns it; any other model id -> 404 model_not_found (so no 'auto')
 *   - no /v1/embeddings endpoint
 *   - the Supabase Realtime relay is disabled
 *
 * The stub fetch below enforces exactly those rules (it rejects the old invented ids, like the real engine).
 *
 * Run:        npx tsx scripts/check-colibri-bridge.ts
 * Live check: COLIBRI_LIVE=1 npx tsx scripts/check-colibri-bridge.ts
 *             (needs the real server on 127.0.0.1:8000; sends ONE tiny chat request, slow: about a minute.
 *              COLIBRI_BASE_URL overrides the address.)
 */

import assert from 'node:assert/strict';
import {
    COLIBRI_INFO,
    colibriProvider,
    COLIBRI_DEFAULT_BASE_URL,
    resolveColibriModel,
    shouldUseBridge,
    isColibriAvailable,
    fetchColibriModels,
    resetColibriCache,
    getColibriStatus,
} from '../src/lib/ai/providers/colibri';
import { COLIBRI_MODELS, COLIBRI_MODEL_SPECS } from '../src/lib/ai/models';
import { AiProviderError } from '../src/lib/ai/providers/types';
import { colibriRealtimeBridge } from '../src/lib/ai/colibriRealtimeBridge';
import {
    getColibriEmbedder,
    isColibriEmbedderAvailable,
    COLIBRI_EMBEDDINGS_SUPPORTED,
    formatQuery,
    formatDocument,
    PROMPTS,
} from '../src/lib/embeddings/colibriBridge';
import {
    embedDocumentBatch,
    embedSearchQuery,
    isCompanionAvailable,
    resetEmbeddingsCache,
} from '../src/lib/ai/embeddings';
import { runItemEmbeddingSync } from '../src/lib/embeddings/syncRunner';
import {
    ONYX_MESH_TOPOLOGY,
    MESH_NODES,
    MESH_UNSET,
    isMeshNodeConfigured,
    pingMeshNode,
    saveMeshNodeConfigs,
    getColibriNetworkPresets,
    reloadMeshNodes,
} from '../src/lib/network/localMeshMap';

const LOADED_MODEL = 'qwen3.6-colibri';
const OLD_INVENTED_IDS = ['glm-5.2-moe', 'kimi-k3-moe', 'qwen-2.5-3b'];

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function runStubChecks(): Promise<void> {
    const originalFetch = globalThis.fetch;
    let serverUp = true;
    let calls: Array<{ url: string; method: string; body: any }> = [];

    // The real server's rules, in a stub.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        let body: any = null;
        if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
        calls.push({ url, method: (init?.method || 'GET').toUpperCase(), body });
        if (!serverUp) throw new TypeError('fetch failed (ECONNREFUSED)');
        if (url.endsWith('/health')) {
            return json(200, { status: 'ok', arch: 'qwen36', scheduler: { active: 0, queued: 2, capacity: 1, completed: 5, failed: 0 }, input_modalities: ['text'] });
        }
        if (url.endsWith('/v1/models')) {
            return json(200, { object: 'list', data: [{ id: LOADED_MODEL, object: 'model', input_modalities: ['text'] }] });
        }
        if (url.endsWith('/v1/chat/completions')) {
            if (body?.model !== LOADED_MODEL) {
                return json(404, { error: { message: `The model \`${body?.model}\` does not exist`, code: 'model_not_found' } });
            }
            if (body?.stream) {
                const sse = [
                    `data: ${JSON.stringify({ model: LOADED_MODEL, choices: [{ delta: { content: 'Hel' } }] })}\n\n`,
                    `data: ${JSON.stringify({ model: LOADED_MODEL, choices: [{ delta: { content: 'lo' } }] })}\n\n`,
                    'data: [DONE]\n\n',
                ].join('');
                return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
            }
            const wantsJson = body?.response_format?.type === 'json_object';
            return json(200, {
                model: LOADED_MODEL,
                choices: [{ message: { role: 'assistant', content: wantsJson ? '{"ok":true}' : 'hello' } }],
                usage: { prompt_tokens: 5, completion_tokens: 2 },
            });
        }
        return json(404, { error: { message: 'not found', code: 'not_found' } });   // /v1/embeddings included
    }) as typeof fetch;

    try {
        // ── 1. Provider properties ──
        console.log('  [1/7] Provider properties and honest model constants...');
        assert.strictEqual(COLIBRI_INFO.id, 'colibri');
        assert.ok(COLIBRI_INFO.label.includes('Colibrì'));
        assert.strictEqual(COLIBRI_DEFAULT_BASE_URL, 'http://127.0.0.1:8000', 'default port is the real server port');
        assert.strictEqual(COLIBRI_INFO.defaultBaseUrl, 'http://127.0.0.1:8000');
        assert.strictEqual(COLIBRI_INFO.needsBaseUrl, false);
        assert.strictEqual(COLIBRI_INFO.capabilities.json, true);
        assert.strictEqual(COLIBRI_INFO.capabilities.vision, false, 'Colibri is text only');
        assert.strictEqual(typeof (colibriProvider as any).streamChat, 'function');
        assert.strictEqual(typeof colibriProvider.chat, 'function');
        for (const id of COLIBRI_MODELS) {
            for (const bad of OLD_INVENTED_IDS) assert.ok(!id.includes(bad), `COLIBRI_MODELS must not contain the invented id ${bad}`);
        }
        assert.ok(COLIBRI_MODELS.includes('auto'), "'auto' stays as an alias for the loaded model");
        assert.ok(COLIBRI_MODEL_SPECS.auto.name.toLowerCase().includes('loaded'));
        assert.strictEqual(shouldUseBridge('supabase://colibri-relay'), false, 'no relay: never use the bridge');

        // ── 2. Model resolution ──
        console.log('  [2/7] Model resolution against /v1/models...');
        assert.strictEqual(resolveColibriModel('auto', undefined, [LOADED_MODEL]), LOADED_MODEL);
        assert.strictEqual(resolveColibriModel(undefined, undefined, [LOADED_MODEL]), LOADED_MODEL);
        assert.strictEqual(resolveColibriModel(LOADED_MODEL, undefined, [LOADED_MODEL]), LOADED_MODEL);
        assert.strictEqual(resolveColibriModel('colibri-glm-5.2-moe', undefined, [LOADED_MODEL]), LOADED_MODEL, 'a stale id falls back to the loaded model');
        assert.strictEqual(resolveColibriModel('auto'), 'qwen3.6-colibri', 'without a live list, auto is the default local model');

        // ── 3. Provider calls against the real contract ──
        console.log('  [3/7] generateText / generateJson / streamChat / test / listModels...');
        resetColibriCache();
        serverUp = true;
        calls = [];
        const text = await colibriProvider.generateText({ key: '', model: 'auto' }, { prompt: 'hi', timeoutMs: 1000 });
        assert.strictEqual(text.text, 'hello');
        assert.strictEqual(text.model, LOADED_MODEL);
        const chatCall = calls.find(c => c.url.endsWith('/v1/chat/completions'));
        assert.ok(chatCall, 'a chat call was made');
        assert.strictEqual(chatCall!.url, 'http://127.0.0.1:8000/v1/chat/completions');
        assert.strictEqual(chatCall!.body.model, LOADED_MODEL, "'auto' is resolved before sending; the server never sees it");

        const stale = await colibriProvider.generateText({ key: '', model: 'colibri-kimi-k3-moe' }, { prompt: 'hi', timeoutMs: 1000 });
        assert.strictEqual(stale.text, 'hello', 'a saved invented id does not 404: it falls back to the loaded model');

        const js = await colibriProvider.generateJson({ key: '', model: 'auto' }, { prompt: 'x', schema: { type: 'object' }, timeoutMs: 1000 });
        assert.deepStrictEqual(js.json, { ok: true });

        const tokens: string[] = [];
        const chat = await colibriProvider.chat!({ key: '', model: 'auto' }, { turns: [{ role: 'user', text: 'hi' }], timeoutMs: 1000 });
        void tokens;
        assert.strictEqual(chat.text, 'Hello');
        assert.strictEqual(chat.model, LOADED_MODEL);

        // images are refused, never silently dropped
        await assert.rejects(
            () => colibriProvider.generateJson({ key: '', model: 'auto' }, { prompt: 'x', schema: {}, timeoutMs: 1000, images: [{ mimeType: 'image/jpeg', base64: 'AAA' }] }),
            (err: unknown) => err instanceof AiProviderError && err.kind === 'config' && /text only/i.test(err.message),
        );

        const tested = await colibriProvider.test({ key: '' });
        assert.strictEqual(tested.ok, true);
        assert.ok(tested.message.includes(LOADED_MODEL), 'test() names the loaded model');
        assert.ok(!/MB\/s|tps|NVMe/i.test(tested.message), 'no telemetry the server did not report');

        assert.deepStrictEqual(await colibriProvider.listModels!({ key: '' }), ['auto', LOADED_MODEL]);
        const status = await getColibriStatus({ key: '' });
        assert.strictEqual(status.ok, true);
        assert.strictEqual(status.modelId, LOADED_MODEL);
        assert.strictEqual(status.queued, 2, 'queue counters come from /health');

        // ── 4. Server down: fast, clear, no relay fallback ──
        console.log('  [4/7] Server down fails fast with a clear message...');
        resetColibriCache();
        serverUp = false;
        const t0 = Date.now();
        await assert.rejects(
            () => colibriProvider.generateText({ key: '', model: 'auto' }, { prompt: 'hi', timeoutMs: 1000 }),
            (err: unknown) => err instanceof AiProviderError && err.kind === 'config' && /not reachable/i.test(err.message),
        );
        assert.ok(Date.now() - t0 < 5000, 'fails in seconds, not after the job timeout');
        assert.strictEqual(await isColibriAvailable(), false);
        assert.strictEqual(await fetchColibriModels({ key: '' }, true), null);
        const testDown = await colibriProvider.test({ key: '' });
        assert.strictEqual(testDown.ok, false);
        assert.deepStrictEqual(await colibriProvider.listModels!({ key: '' }), ['auto']);
        serverUp = true;

        // ── 5. Relay is inert ──
        console.log('  [5/7] The Realtime relay is disabled...');
        assert.strictEqual(colibriRealtimeBridge.isHostOnline(), false);
        assert.strictEqual(colibriRealtimeBridge.getHostInfo(), null);
        assert.strictEqual(await colibriRealtimeBridge.waitForHost(10), false);
        assert.strictEqual(await colibriRealtimeBridge.ensureSubscribed(10), false);
        await assert.rejects(() => colibriRealtimeBridge.request('/health'), /disabled/i);
        await assert.rejects(() => colibriRealtimeBridge.streamChat({}), /disabled/i);
        assert.strictEqual((await colibriRealtimeBridge.test()).ok, false);

        // ── 6. Embeddings: no Colibri tier, rows carry the real model ──
        console.log('  [6/7] No Colibri embedder; sync refuses a batch from another model...');
        assert.strictEqual(COLIBRI_EMBEDDINGS_SUPPORTED, false);
        assert.strictEqual(getColibriEmbedder(), null);
        calls = [];
        assert.strictEqual(await isColibriEmbedderAvailable(), false);
        assert.strictEqual(calls.length, 0, 'no network call for a tier that cannot exist');
        resetEmbeddingsCache();
        const globalWithWindow = globalThis as any;
        const savedWindow = globalWithWindow.window;
        delete globalWithWindow.window;
        assert.strictEqual(await isCompanionAvailable(), false, 'a running Colibri server is not an embedder');
        assert.strictEqual(await embedSearchQuery('laser stencil bed', 2), null);
        assert.strictEqual(await embedDocumentBatch([{ title: 'A', text: 'B' }], 4), null);
        if (savedWindow) globalWithWindow.window = savedWindow;
        assert.strictEqual(formatQuery('q'), PROMPTS.query + 'q');
        assert.strictEqual(formatDocument('', 'x'), PROMPTS.documentUntitled + 'x');

        const items = [{ id: 'i1', title: 'T1', text: 'x1' }, { id: 'i2', title: 'T2', text: 'x2' }];
        const wrong = await runItemEmbeddingSync({
            items, stored: [], modelVersion: 'embeddinggemma-v1',
            embedBatchFn: async (docs) => ({ vectors: docs.map(() => new Float32Array([1, 0])), model: 'some-other-model' }),
        });
        assert.strictEqual(wrong.completed, false, 'a batch from another model is refused');
        assert.strictEqual(wrong.recordsToUpsert.length, 0, 'and nothing from it is kept');
        assert.deepStrictEqual(wrong.modelMismatch, { expected: 'embeddinggemma-v1', actual: 'some-other-model' });
        const right = await runItemEmbeddingSync({
            items, stored: [], modelVersion: 'embeddinggemma-v1',
            embedBatchFn: async (docs) => ({ vectors: docs.map(() => new Float32Array([1, 0])), model: 'embeddinggemma-v1' }),
        });
        assert.strictEqual(right.completed, true);
        assert.ok(right.recordsToUpsert.every(r => r.model_version === 'embeddinggemma-v1'));

        // ── 7. Mesh map holds no addresses, names or hardware ids ──
        console.log('  [7/7] Mesh map: empty by default, configurable, validated...');
        reloadMeshNodes();
        assert.strictEqual(MESH_NODES.length, 0, 'no nodes by default');
        for (const node of Object.values(ONYX_MESH_TOPOLOGY)) {
            assert.strictEqual(node.ip, MESH_UNSET);
            assert.strictEqual(isMeshNodeConfigured(node), false);
            assert.ok(!('mac' in node), 'no MAC addresses');
            // the slot ids (g7, second_laptop, phone) are legacy keys other modules still read; nothing else may carry a name or address
            const { id: _slot, ...visible } = node;
            assert.ok(!/192\.168|martha|ramses|iphone/i.test(JSON.stringify(visible)), 'no addresses or names baked in');
        }
        assert.deepStrictEqual(await pingMeshNode(ONYX_MESH_TOPOLOGY.g7), { ok: false, latencyMs: 0, status: 'Not configured' });
        assert.deepStrictEqual(getColibriNetworkPresets().map(p => p.url), ['http://127.0.0.1:8000']);

        const store = new Map<string, string>();
        globalWithWindow.window = {
            localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } },
            dispatchEvent: () => true,
        };
        saveMeshNodeConfigs([
            { role: 'primary_host', name: 'Studio PC', ip: '10.0.0.5', colibriPort: 8000 },
            { role: 'relay_node', name: 'bad', ip: 'http://evil.example/x' },
        ]);
        assert.strictEqual(MESH_NODES.length, 1, 'an invalid entry is dropped');
        assert.strictEqual(ONYX_MESH_TOPOLOGY.g7.ip, '10.0.0.5');
        assert.strictEqual(ONYX_MESH_TOPOLOGY.second_laptop.ip, MESH_UNSET);
        assert.ok(getColibriNetworkPresets().some(p => p.url === 'http://10.0.0.5:8000'));
        saveMeshNodeConfigs([]);
        assert.strictEqual(MESH_NODES.length, 0);
        if (savedWindow) globalWithWindow.window = savedWindow; else delete globalWithWindow.window;
    } finally {
        globalThis.fetch = originalFetch;
    }
}

/** Opt-in: talks to the real server. One tiny chat request; the model answers at about half a token per second. */
async function runLiveChecks(): Promise<void> {
    const base = (process.env.COLIBRI_BASE_URL || COLIBRI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    console.log(`  [live] ${base}`);
    resetColibriCache();

    const modelsRes = await fetch(`${base}/v1/models`);
    assert.ok(modelsRes.ok, `GET /v1/models failed: HTTP ${modelsRes.status} (is the server running, and is this origin allowed?)`);
    const models = await modelsRes.json() as { data: Array<{ id: string; input_modalities?: string[] }> };
    assert.ok(models.data.length >= 1, '/v1/models lists the loaded model');
    assert.deepStrictEqual(models.data[0].input_modalities, ['text'], 'the real server is text only');
    const loaded = models.data[0].id;
    console.log(`  [live] loaded model: ${loaded}`);

    // an id the server did not load must fail exactly like our stub says
    const bad = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'colibri-glm-5.2-moe', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    });
    assert.strictEqual(bad.status, 404, 'an invented model id is rejected with 404');

    // the real server has no embeddings endpoint
    const emb = await fetch(`${base}/v1/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: loaded, input: 'x' }),
    });
    assert.ok(emb.status === 404 || emb.status === 405, `/v1/embeddings must not exist (got HTTP ${emb.status})`);

    // one real chat through the provider with 'auto' resolved to the loaded model
    const started = Date.now();
    const res = await colibriProvider.generateText(
        { key: '', baseUrl: base, model: 'auto' },
        { prompt: 'Reply with the single word: ok', maxTokens: 8, timeoutMs: 10 * 60 * 1000 },
    );
    console.log(`  [live] answer in ${Math.round((Date.now() - started) / 1000)} s: ${JSON.stringify(res.text.slice(0, 60))} (model ${res.model})`);
    assert.strictEqual(res.model, loaded, "'auto' resolved to the loaded model");
    assert.ok(res.text.length > 0, 'the model answered');
}

async function main(): Promise<void> {
    console.log('Running Colibri contract checks...');
    await runStubChecks();
    if (process.env.COLIBRI_LIVE === '1') {
        await runLiveChecks();
    } else {
        console.log('  (live checks skipped: set COLIBRI_LIVE=1 with the real server running)');
    }
    console.log('colibri-bridge checks passed');
}

main().catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
});
