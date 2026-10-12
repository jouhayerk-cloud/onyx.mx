// Locked acceptance checks for evaluation harness. The model must make these pass; it may not edit this file.
// Run: npx tsx scripts/check-eval.ts
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
    const { evaluateRanking } = (want('eval') ? await import('../src/lib/embeddings/evalHarness') : {}) as any;

    if (want('eval')) {
        await test('empty cases list returns zeros and empty perQuery', async () => {
            const res = await evaluateRanking([], async () => ['a']);
            assert.deepEqual(res, { recallAtK: 0, mrr: 0, perQuery: [] });
        });

        await test('skips cases where relevant is empty array without calling search', async () => {
            let called = false;
            const cases = [{ query: 'tray', relevant: [] }];
            const res = await evaluateRanking(cases, async () => { called = true; return ['tray-1']; });
            assert.equal(called, false);
            assert.deepEqual(res, { recallAtK: 0, mrr: 0, perQuery: [] });
        });

        await test('all cases having empty relevant returns zeros and empty perQuery', async () => {
            const cases = [
                { query: 'q1', relevant: [] },
                { query: 'q2', relevant: [] }
            ];
            const res = await evaluateRanking(cases, async () => ['x']);
            assert.deepEqual(res, { recallAtK: 0, mrr: 0, perQuery: [] });
        });

        await test('perfect rank 1 hit gives recall 1 and rr 1', async () => {
            const cases = [{ query: 'green onyx', relevant: ['item-1'] }];
            const search = async () => ['item-1', 'item-2', 'item-3'];
            const res = await evaluateRanking(cases, search);
            assert.equal(res.perQuery.length, 1);
            near(res.perQuery[0].recall, 1.0);
            near(res.perQuery[0].rr, 1.0);
            near(res.recallAtK, 1.0);
            near(res.mrr, 1.0);
        });

        await test('relevant hit at rank 2 gives rr 0.5', async () => {
            const cases = [{ query: 'lamp', relevant: ['item-lamp'] }];
            const search = async () => ['other', 'item-lamp', 'another'];
            const res = await evaluateRanking(cases, search);
            near(res.perQuery[0].rr, 0.5);
            near(res.perQuery[0].recall, 1.0);
            near(res.mrr, 0.5);
        });

        await test('relevant hit at rank 3 gives rr 1/3', async () => {
            const cases = [{ query: 'vase', relevant: ['item-vase'] }];
            const search = async () => ['x1', 'x2', 'item-vase', 'x4'];
            const res = await evaluateRanking(cases, search);
            near(res.perQuery[0].rr, 1 / 3);
            near(res.mrr, 1 / 3);
        });

        await test('partial recall with multiple relevant items (1 of 2 found gives recall 0.5)', async () => {
            const cases = [{ query: 'bowls', relevant: ['b1', 'b2'] }];
            const search = async () => ['b1', 'other', 'another'];
            const res = await evaluateRanking(cases, search);
            near(res.perQuery[0].recall, 0.5);
            near(res.perQuery[0].rr, 1.0);
            near(res.recallAtK, 0.5);
        });

        await test('zero recall and zero rr when no relevant hits are returned', async () => {
            const cases = [{ query: 'plate', relevant: ['target'] }];
            const search = async () => ['miss-1', 'miss-2'];
            const res = await evaluateRanking(cases, search);
            assert.equal(res.perQuery[0].recall, 0);
            assert.equal(res.perQuery[0].rr, 0);
            assert.equal(res.recallAtK, 0);
            assert.equal(res.mrr, 0);
        });

        await test('recall cutoff respects default k=10 (hit at index 11 is outside top 10)', async () => {
            const cases = [{ query: 'stone', relevant: ['late-hit'] }];
            const hits = Array.from({ length: 11 }, (_, i) => `miss-${i}`).concat(['late-hit']);
            const res = await evaluateRanking(cases, async () => hits);
            assert.equal(res.perQuery[0].recall, 0);
            near(res.perQuery[0].rr, 1 / 12);
        });

        await test('custom k parameter restricts candidate window for recall', async () => {
            const cases = [{ query: 'stone', relevant: ['hit-at-4'] }];
            const hits = ['m0', 'm1', 'm2', 'hit-at-4'];
            const res3 = await evaluateRanking(cases, async () => hits, 3);
            assert.equal(res3.perQuery[0].recall, 0);

            const res5 = await evaluateRanking(cases, async () => hits, 5);
            assert.equal(res5.perQuery[0].recall, 1.0);
        });

        await test('rr selects first relevant hit index when multiple relevant items are returned', async () => {
            const cases = [{ query: 'set', relevant: ['rel-a', 'rel-b'] }];
            const search = async () => ['m1', 'rel-b', 'm2', 'rel-a'];
            const res = await evaluateRanking(cases, search);
            near(res.perQuery[0].rr, 1 / 2);
            near(res.perQuery[0].recall, 1.0);
        });

        await test('arithmetic means are correctly averaged across multiple evaluated queries', async () => {
            const cases = [
                { query: 'q1', relevant: ['r1'] },
                { query: 'q2', relevant: [] },
                { query: 'q3', relevant: ['r3'] },
                { query: 'q4', relevant: ['r4'] }
            ];
            const search = async (q: string) => {
                if (q === 'q1') return ['r1'];
                if (q === 'q3') return ['miss', 'r3'];
                return ['miss', 'miss'];
            };
            const res = await evaluateRanking(cases, search);
            assert.equal(res.perQuery.length, 3);
            near(res.recallAtK, 2 / 3);
            near(res.mrr, 0.5);
        });

        await test('perQuery records query string and preserves evaluation order', async () => {
            const cases = [
                { query: 'alpha', relevant: ['a'] },
                { query: 'beta', relevant: ['b'] }
            ];
            const res = await evaluateRanking(cases, async (q) => [q === 'alpha' ? 'a' : 'b']);
            assert.equal(res.perQuery[0].query, 'alpha');
            assert.equal(res.perQuery[1].query, 'beta');
        });

        await test('handles relevant list with duplicate ids without inflating recall denominator', async () => {
            const cases = [{ query: 'dups', relevant: ['a', 'a'] }];
            const res = await evaluateRanking(cases, async () => ['a']);
            near(res.perQuery[0].recall, 1.0);
        });
    }

    console.log(failed ? `\n${failed} check(s) failed` : '\nevaluation harness checks passed');
    process.exit(failed ? 1 : 0);
})();
