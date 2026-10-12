// Locked acceptance checks for the embeddings modules. The model must make these pass; it may not edit this file.
// Run: npx tsx scripts/check-embeddings.ts   (needs no extra dependency)
import assert from 'node:assert/strict';
// ONLY=vectorMath|vectorIndex|bridge runs one section (modules are built one at a time); no ONLY runs all.
const ONLY = process.env.ONLY || '';
const want = (name: string) => !ONLY || ONLY.split(',').includes(name);

const near = (a: number, b: number, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
let failed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
    try { await fn(); console.log('ok   ' + name); } catch (e: any) { failed++; console.log('FAIL ' + name + ': ' + (e?.message || e)); }
};

(async () => {
    const { l2Normalize, truncateAndNormalize, dot, topK, reciprocalRankFusion } = (await import('../src/lib/embeddings/vectorMath')) as any;
    const { VectorIndex } = (want('vectorIndex') ? await import('../src/lib/embeddings/vectorIndex') : {}) as any;
    const { PROMPTS, formatQuery, formatDocument, getEmbedder } = (want('bridge') ? await import('../src/lib/embeddings/bridge') : {}) as any;
    if (want('vectorMath')) {
    await test('l2Normalize gives unit length and keeps direction', () => {
        const v = l2Normalize(new Float32Array([3, 4]));
        near(v[0], 0.6); near(v[1], 0.8); near(norm(v), 1);
    });
    await test('l2Normalize of a zero vector returns zeros, not NaN', () => {
        const v = l2Normalize(new Float32Array([0, 0, 0]));
        assert.deepEqual(Array.from(v), [0, 0, 0]);
    });
    await test('l2Normalize does not mutate its input', () => {
        const a = new Float32Array([3, 4]); l2Normalize(a); assert.deepEqual(Array.from(a), [3, 4]);
    });
    await test('truncateAndNormalize keeps the first dims and re-normalises (Matryoshka)', () => {
        const v = truncateAndNormalize(new Float32Array([3, 4, 12, 0]), 2);
        assert.equal(v.length, 2); near(v[0], 0.6); near(v[1], 0.8);
    });
    await test('truncateAndNormalize throws when dims exceeds the vector length', () => {
        assert.throws(() => truncateAndNormalize(new Float32Array([1, 2]), 3));
    });
    await test('dot product', () => {
        near(dot(new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])), 32);
    });
    await test('topK ranks a flat matrix by dot product, best first, with indexes', () => {
        const m = new Float32Array([1, 0, 0, 1, 0.6, 0.8, -1, 0]); // 4 rows x 2 dims
        const r = topK(new Float32Array([1, 0]), m, 2, 3);
        assert.deepEqual(r.map(x => x.index), [0, 2, 1]);
        near(r[0].score, 1); near(r[1].score, 0.6); near(r[2].score, 0);
    });
    await test('topK with k larger than rows returns all rows; k=0 returns []', () => {
        const m = new Float32Array([1, 0, 0, 1]);
        assert.equal(topK(new Float32Array([1, 0]), m, 2, 10).length, 2);
        assert.deepEqual(topK(new Float32Array([1, 0]), m, 2, 0), []);
    });
    await test('reciprocalRankFusion fuses lists (k=60) and sorts by score', () => {
        const r = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'a', 'd']]);
        assert.deepEqual(r.map(x => x.id).slice(0, 2).sort(), ['a', 'b']);
        near(r.find(x => x.id === 'a')!.score, 1 / 61 + 1 / 62);
        near(r.find(x => x.id === 'd')!.score, 1 / 63);
        assert.equal(r.length, 4);
        for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
    });
    await test('reciprocalRankFusion of an empty input is empty; a single list keeps its order', () => {
        assert.deepEqual(reciprocalRankFusion([]), []);
        assert.deepEqual(reciprocalRankFusion([['x', 'y']]).map(r => r.id), ['x', 'y']);
    });

    }
    if (want('vectorIndex')) {
    const mk = (a: number[]) => l2Normalize(new Float32Array(a));
    await test('VectorIndex upsert, search, replace and remove', () => {
        const ix = new VectorIndex(2, 'gemma2-270m@256');
        ix.upsert('red', mk([1, 0])); ix.upsert('green', mk([0, 1])); ix.upsert('mix', mk([1, 1]));
        assert.equal(ix.size, 3);
        const r = ix.search(mk([1, 0.1]), 2);
        assert.equal(r[0].id, 'red'); assert.equal(r[1].id, 'mix');
        ix.upsert('red', mk([0, 1]));
        assert.equal(ix.size, 3);
        assert.equal(ix.search(mk([1, 0]), 1)[0].id, 'mix');
        ix.remove('mix'); assert.equal(ix.size, 2); assert.equal(ix.has('mix'), false);
    });
    await test('VectorIndex rejects a vector of the wrong dimension', () => {
        const ix = new VectorIndex(2, 'v1');
        assert.throws(() => ix.upsert('a', new Float32Array([1, 2, 3])));
    });
    await test('VectorIndex serialize/deserialize round-trips and carries the model version', () => {
        const ix = new VectorIndex(2, 'v1');
        ix.upsert('a', mk([1, 0])); ix.upsert('b', mk([0, 1]));
        const blob = ix.serialize();
        assert.ok(blob.vectors instanceof ArrayBuffer || ArrayBuffer.isView(blob.vectors));
        const back = VectorIndex.deserialize(blob);
        assert.equal(back.size, 2); assert.equal(back.modelVersion, 'v1'); assert.equal(back.dims, 2);
        assert.equal(back.search(mk([0, 1]), 1)[0].id, 'b');
    });
    await test('VectorIndex search on an empty index returns []', () => {
        assert.deepEqual(new VectorIndex(2, 'v1').search(mk([1, 0]), 5), []);
    });
    await test('VectorIndex.isCompatible compares model versions', () => {
        const ix = new VectorIndex(2, 'v1');
        assert.equal(ix.isCompatible('v1'), true); assert.equal(ix.isCompatible('v2'), false);
    });

    }
    if (want('bridge')) {
    await test('prompt formatting uses the PROMPTS constants', () => {
        assert.equal(formatQuery('green tray'), PROMPTS.query + 'green tray');
        assert.equal(formatDocument('Green tray', 'Round decorative tray'), PROMPTS.documentTitled('Green tray') + 'Round decorative tray');
        assert.equal(formatDocument('', 'text only'), PROMPTS.documentUntitled + 'text only');
        assert.ok(PROMPTS.query.startsWith('task: search result | query: '));
        assert.ok(PROMPTS.documentUntitled.startsWith('title: none | text: '));
    });
    await test('getEmbedder returns null when no native bridge exists', () => {
        assert.equal(getEmbedder({} as any), null);
        assert.equal(getEmbedder({ webkit: {} } as any), null);
    });
    await test('getEmbedder talks to webkit.messageHandlers.onyxEmbed and applies the prefixes', async () => {
        const calls: any[] = [];
        const win: any = { webkit: { messageHandlers: { onyxEmbed: { postMessage: async (msg: any) => {
            calls.push(msg);
            if (msg.op === 'info') return { model: 'embeddinggemma-2-740m', dims: 768, version: 'litert-740m', modalities: ['text', 'image', 'audio'] };
            if (msg.op === 'embed_image' || msg.op === 'embed_audio') return { vector: [0, 3, 4, 0] };
            return { vectors: msg.texts.map(() => [3, 4, 0, 0]) };
        } } } } };
        const e = getEmbedder(win)!;
        assert.ok(e);
        const info = await e.info();
        assert.equal(info.dims, 768); assert.equal(info.version, 'litert-740m'); assert.deepEqual(info.modalities, ['text', 'image', 'audio']);
        const q = await e.embedQuery('green tray', 2);
        assert.equal(q.length, 2); near(q[0], 0.6); near(q[1], 0.8);
        const sent = calls.find(c => c.op === 'embed');
        assert.equal(sent.texts[0], PROMPTS.query + 'green tray');
        const d = await e.embedDocuments([{ title: 'Green tray', text: 'Round' }, { title: '', text: 'Vase' }], 4);
        assert.equal(d.length, 2); assert.equal(d[0].length, 4);
        const im = await e.embedImage('QUJD', 'image/jpeg', 4);
        assert.equal(im.length, 4); near(im[1], 0.6); near(im[2], 0.8);
        const imSent = calls.find(c => c.op === 'embed_image');
        assert.equal(imSent.base64, 'QUJD'); assert.equal(imSent.mimeType, 'image/jpeg');
        const au = await e.embedAudio('QUJD', 'audio/m4a', 2);
        assert.equal(au.length, 2); near(au[0], 0); near(au[1], 1);
        assert.equal(calls.find(c => c.op === 'embed_audio').mimeType, 'audio/m4a');
        const sent2 = calls.filter(c => c.op === 'embed')[1];
        assert.equal(sent2.texts[0], PROMPTS.documentTitled('Green tray') + 'Round');
        assert.equal(sent2.texts[1], PROMPTS.documentUntitled + 'Vase');
    });
    await test('getEmbedder surfaces a native error as a rejected promise', async () => {
        const win: any = { webkit: { messageHandlers: { onyxEmbed: { postMessage: async () => { throw new Error('model not downloaded'); } } } } };
        await assert.rejects(() => getEmbedder(win)!.embedQuery('x', 4), /model not downloaded/);
    });

    }

    console.log(failed ? `\n${failed} check(s) failed` : '\nembedding checks passed');
    process.exit(failed ? 1 : 0);
})();
