// Locked acceptance checks for hybrid search. The model must make these pass; it may not edit this file.
// Run: npx tsx scripts/check-hybrid.ts
import assert from 'node:assert/strict';

const ONLY = process.env.ONLY || '';
const want = (name: string) => !ONLY || ONLY.split(',').includes(name);

const near = (a: number, b: number, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
let failed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
        await fn();
        console.log('ok   ' + name);
    } catch (e: any) {
        failed++;
        console.log('FAIL ' + name + ': ' + (e?.message || e));
    }
};

(async () => {
    const { hybridSearch } = (want('hybrid') ? await import('../src/lib/embeddings/hybridSearch') : {}) as any;

    if (want('hybrid')) {
        await test('empty inputs return empty array', () => {
            const res = hybridSearch({ keywordIds: [], vectorHits: [] });
            assert.deepEqual(res, []);
        });

        await test('keyword-only search returns hits tagged with keyword source', () => {
            const res = hybridSearch({ keywordIds: ['item-a', 'item-b'], vectorHits: [] });
            assert.equal(res.length, 2);
            assert.equal(res[0].id, 'item-a');
            assert.deepEqual(res[0].sources, ['keyword']);
            near(res[0].score, 1 / 61);
            assert.equal(res[1].id, 'item-b');
            assert.deepEqual(res[1].sources, ['keyword']);
            near(res[1].score, 1 / 62);
        });

        await test('vector-only search returns hits tagged with vector source', () => {
            const res = hybridSearch({
                keywordIds: [],
                vectorHits: [{ id: 'vec-1', score: 0.9 }, { id: 'vec-2', score: 0.8 }]
            });
            assert.equal(res.length, 2);
            assert.equal(res[0].id, 'vec-1');
            assert.deepEqual(res[0].sources, ['vector']);
            near(res[0].score, 1 / 61);
            assert.equal(res[1].id, 'vec-2');
            assert.deepEqual(res[1].sources, ['vector']);
            near(res[1].score, 1 / 62);
        });

        await test('combined search fuses ranks and tags both sources', () => {
            const res = hybridSearch({
                keywordIds: ['shared', 'kw-only'],
                vectorHits: [
                    { id: 'shared', score: 0.95 },
                    { id: 'vec-only', score: 0.85 }
                ]
            });
            assert.equal(res.length, 3);
            const top = res[0];
            assert.equal(top.id, 'shared');
            assert.deepEqual(top.sources, ['keyword', 'vector']);
            near(top.score, 1 / 61 + 1 / 61);
        });

        await test('drops vector hits below minVectorScore default 0.3 before fusion', () => {
            const res = hybridSearch({
                keywordIds: [],
                vectorHits: [
                    { id: 'good', score: 0.35 },
                    { id: 'borderline', score: 0.30 },
                    { id: 'poor', score: 0.29 },
                    { id: 'very-poor', score: 0.05 }
                ]
            });
            assert.equal(res.length, 2);
            assert.deepEqual(res.map((r: any) => r.id), ['good', 'borderline']);
        });

        await test('dropped vector hit below threshold does not get vector source tag when matched by keyword', () => {
            const res = hybridSearch({
                keywordIds: ['item-x'],
                vectorHits: [{ id: 'item-x', score: 0.25 }]
            });
            assert.equal(res.length, 1);
            assert.equal(res[0].id, 'item-x');
            assert.deepEqual(res[0].sources, ['keyword']);
            near(res[0].score, 1 / 61);
        });

        await test('custom minVectorScore threshold applies correctly', () => {
            const res = hybridSearch({
                keywordIds: [],
                vectorHits: [
                    { id: 'high', score: 0.85 },
                    { id: 'mid', score: 0.70 }
                ],
                minVectorScore: 0.80
            });
            assert.equal(res.length, 1);
            assert.equal(res[0].id, 'high');
        });

        await test('deduplicates keywordIds preserving first appearance', () => {
            const res = hybridSearch({
                keywordIds: ['dup', 'unique', 'dup'],
                vectorHits: []
            });
            assert.equal(res.length, 2);
            assert.equal(res[0].id, 'dup');
            assert.equal(res[1].id, 'unique');
            near(res[0].score, 1 / 61);
            near(res[1].score, 1 / 62);
        });

        await test('deduplicates vectorHits preserving first appearance', () => {
            const res = hybridSearch({
                keywordIds: [],
                vectorHits: [
                    { id: 'dup-v', score: 0.9 },
                    { id: 'other-v', score: 0.85 },
                    { id: 'dup-v', score: 0.7 }
                ]
            });
            assert.equal(res.length, 2);
            assert.equal(res[0].id, 'dup-v');
            assert.equal(res[1].id, 'other-v');
        });

        await test('ties keep keyword order first over vector-only hits', () => {
            const res = hybridSearch({
                keywordIds: ['kw-first'],
                vectorHits: [{ id: 'vec-first', score: 0.9 }]
            });
            assert.equal(res.length, 2);
            near(res[0].score, res[1].score);
            assert.equal(res[0].id, 'kw-first');
            assert.equal(res[1].id, 'vec-first');
        });

        await test('ties among keyword items preserve keyword rank order', () => {
            const res = hybridSearch({
                keywordIds: ['first-kw', 'second-kw'],
                vectorHits: []
            });
            assert.equal(res[0].id, 'first-kw');
            assert.equal(res[1].id, 'second-kw');
            assert.ok(res[0].score >= res[1].score);
        });

        await test('filter is applied after fusion and removes matching items', () => {
            const res = hybridSearch({
                keywordIds: ['allow-1', 'blocked', 'allow-2'],
                vectorHits: [{ id: 'blocked', score: 0.9 }],
                filter: (id: string) => id !== 'blocked'
            });
            assert.equal(res.length, 2);
            assert.deepEqual(res.map((r: any) => r.id), ['allow-1', 'allow-2']);
        });

        await test('filter is applied before limit slicing so subsequent valid hits fill limit', () => {
            const res = hybridSearch({
                keywordIds: ['drop-me', 'keep-1', 'keep-2'],
                vectorHits: [],
                filter: (id: string) => id !== 'drop-me',
                limit: 2
            });
            assert.equal(res.length, 2);
            assert.deepEqual(res.map((r: any) => r.id), ['keep-1', 'keep-2']);
        });

        await test('default limit of 20 items', () => {
            const manyKeywordIds = Array.from({ length: 30 }, (_, i) => `item-${i}`);
            const res = hybridSearch({ keywordIds: manyKeywordIds, vectorHits: [] });
            assert.equal(res.length, 20);
        });

        await test('custom limit and limit of zero', () => {
            const ids = ['a', 'b', 'c', 'd', 'e'];
            const res3 = hybridSearch({ keywordIds: ids, vectorHits: [], limit: 3 });
            assert.equal(res3.length, 3);
            assert.deepEqual(res3.map((r: any) => r.id), ['a', 'b', 'c']);

            const res0 = hybridSearch({ keywordIds: ids, vectorHits: [], limit: 0 });
            assert.deepEqual(res0, []);
        });
    }

    console.log(failed ? `\n${failed} check(s) failed` : '\nhybrid search checks passed');
    process.exit(failed ? 1 : 0);
})();
