// Locked acceptance checks for embedding sync plan. The model must make these pass; it may not edit this file.
// Run: npx tsx scripts/check-syncplan.ts
import assert from 'node:assert/strict';

const ONLY = process.env.ONLY || '';
const want = (name: string) => !ONLY || ONLY.split(',').includes(name);

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
    const { sourceHashOf, planEmbeddingSync } = (want('syncplan') ? await import('../src/lib/embeddings/syncPlan') : {}) as any;

    if (want('syncplan')) {
        await test('sourceHashOf returns deterministic 8-char lowercase hex string', () => {
            const h1 = sourceHashOf('Lámpara de Ónix', 'Hecha a mano en Puebla');
            const h2 = sourceHashOf('Lámpara de Ónix', 'Hecha a mano en Puebla');
            assert.equal(h1, h2);
            assert.match(h1, /^[0-9a-f]{8}$/);
        });

        await test('sourceHashOf hashes empty strings without throwing', () => {
            const h = sourceHashOf('', '');
            assert.match(h, /^[0-9a-f]{8}$/);
        });

        await test('sourceHashOf delimiter separates title and text avoiding boundary collisions', () => {
            const hA = sourceHashOf('ab', 'c');
            const hB = sourceHashOf('a', 'bc');
            assert.notEqual(hA, hB);
        });

        await test('sourceHashOf produces distinct hashes on near strings', () => {
            const h1 = sourceHashOf('Onyx Bowl 1', 'Green onyx');
            const h2 = sourceHashOf('Onyx Bowl 2', 'Green onyx');
            const h3 = sourceHashOf('Onyx Bowl 1', 'White onyx');
            assert.notEqual(h1, h2);
            assert.notEqual(h1, h3);
            assert.notEqual(h2, h3);
        });

        await test('sourceHashOf handles Spanish accents and UTF-8 characters deterministically', () => {
            const str1 = 'Cajetilla de Ónix Café con Vetas';
            const str2 = 'Diseño artesanal de Tehuacán, México, tamaño pequeño: 15cm x 10cm';
            const hashA = sourceHashOf(str1, str2);
            const hashB = sourceHashOf(str1, str2);
            assert.equal(hashA, hashB);
            assert.match(hashA, /^[0-9a-f]{8}$/);
            assert.notEqual(hashA, sourceHashOf(str1, 'Sin acento'));
        });

        await test('sourceHashOf is case sensitive', () => {
            const hLower = sourceHashOf('charola', 'mármol');
            const hUpper = sourceHashOf('Charola', 'Mármol');
            assert.notEqual(hLower, hUpper);
        });

        await test('planEmbeddingSync on empty inputs returns zeros and empty arrays', () => {
            const plan = planEmbeddingSync([], [], 'gemma2@256');
            assert.deepEqual(plan, { toEmbed: [], toDelete: [], upToDate: 0 });
        });

        await test('planEmbeddingSync with all new items marks all for embed in item order', () => {
            const items = [
                { id: 'item-1', title: 'T1', text: 'Txt1', updatedAt: '2026-10-01' },
                { id: 'item-2', title: 'T2', text: 'Txt2', updatedAt: '2026-10-02' }
            ];
            const plan = planEmbeddingSync(items, [], 'gemma2@256');
            assert.deepEqual(plan.toEmbed, ['item-1', 'item-2']);
            assert.deepEqual(plan.toDelete, []);
            assert.equal(plan.upToDate, 0);
        });

        await test('planEmbeddingSync with all up-to-date items produces empty toEmbed and toDelete', () => {
            const items = [
                { id: 'item-1', title: 'T1', text: 'Txt1', updatedAt: '2026-10-01' },
                { id: 'item-2', title: 'T2', text: 'Txt2', updatedAt: '2026-10-02' }
            ];
            const stored = [
                { id: 'item-1', sourceHash: sourceHashOf('T1', 'Txt1'), modelVersion: 'gemma2@256' },
                { id: 'item-2', sourceHash: sourceHashOf('T2', 'Txt2'), modelVersion: 'gemma2@256' }
            ];
            const plan = planEmbeddingSync(items, stored, 'gemma2@256');
            assert.deepEqual(plan.toEmbed, []);
            assert.deepEqual(plan.toDelete, []);
            assert.equal(plan.upToDate, 2);
        });

        await test('planEmbeddingSync detects content changes (hash mismatch)', () => {
            const items = [
                { id: 'item-1', title: 'T1 Updated', text: 'Txt1', updatedAt: '2026-10-05' }
            ];
            const stored = [
                { id: 'item-1', sourceHash: sourceHashOf('T1 Old', 'Txt1'), modelVersion: 'gemma2@256' }
            ];
            const plan = planEmbeddingSync(items, stored, 'gemma2@256');
            assert.deepEqual(plan.toEmbed, ['item-1']);
            assert.equal(plan.upToDate, 0);
            assert.deepEqual(plan.toDelete, []);
        });

        await test('planEmbeddingSync detects modelVersion change even when content hash matches', () => {
            const items = [
                { id: 'item-1', title: 'T1', text: 'Txt1', updatedAt: '2026-10-01' }
            ];
            const stored = [
                { id: 'item-1', sourceHash: sourceHashOf('T1', 'Txt1'), modelVersion: 'old-model@128' }
            ];
            const plan = planEmbeddingSync(items, stored, 'new-model@256');
            assert.deepEqual(plan.toEmbed, ['item-1']);
            assert.equal(plan.upToDate, 0);
            assert.deepEqual(plan.toDelete, []);
        });

        await test('planEmbeddingSync detects deleted items no longer present in inventory', () => {
            const items = [
                { id: 'item-keep', title: 'Keep', text: 'Text', updatedAt: '2026-10-01' }
            ];
            const stored = [
                { id: 'item-keep', sourceHash: sourceHashOf('Keep', 'Text'), modelVersion: 'v1' },
                { id: 'item-removed', sourceHash: 'hash-abc', modelVersion: 'v1' }
            ];
            const plan = planEmbeddingSync(items, stored, 'v1');
            assert.deepEqual(plan.toEmbed, []);
            assert.deepEqual(plan.toDelete, ['item-removed']);
            assert.equal(plan.upToDate, 1);
        });

        await test('planEmbeddingSync preserves items order in toEmbed', () => {
            const items = [
                { id: 'c', title: 'C', text: 'C', updatedAt: '2026-10-01' },
                { id: 'a', title: 'A', text: 'A', updatedAt: '2026-10-01' },
                { id: 'b', title: 'B', text: 'B', updatedAt: '2026-10-01' }
            ];
            const plan = planEmbeddingSync(items, [], 'v1');
            assert.deepEqual(plan.toEmbed, ['c', 'a', 'b']);
        });

        await test('planEmbeddingSync preserves stored order in toDelete without duplicates', () => {
            const items = [{ id: 'live', title: 'Live', text: 'Live', updatedAt: '2026-10-01' }];
            const stored = [
                { id: 'ghost-2', sourceHash: 'h2', modelVersion: 'v1' },
                { id: 'live', sourceHash: sourceHashOf('Live', 'Live'), modelVersion: 'v1' },
                { id: 'ghost-1', sourceHash: 'h1', modelVersion: 'v1' },
                { id: 'ghost-2', sourceHash: 'h2-dup', modelVersion: 'v1' }
            ];
            const plan = planEmbeddingSync(items, stored, 'v1');
            assert.deepEqual(plan.toDelete, ['ghost-2', 'ghost-1']);
            assert.equal(plan.upToDate, 1);
        });

        await test('planEmbeddingSync mixed complex scenario', () => {
            const items = [
                { id: 'same', title: 'Same', text: 'Same', updatedAt: '1' },
                { id: 'changed-text', title: 'Title', text: 'New Text', updatedAt: '2' },
                { id: 'new-item', title: 'New', text: 'New', updatedAt: '3' },
                { id: 'old-version', title: 'V', text: 'V', updatedAt: '4' }
            ];
            const stored = [
                { id: 'same', sourceHash: sourceHashOf('Same', 'Same'), modelVersion: 'v2' },
                { id: 'changed-text', sourceHash: sourceHashOf('Title', 'Old Text'), modelVersion: 'v2' },
                { id: 'old-version', sourceHash: sourceHashOf('V', 'V'), modelVersion: 'v1' },
                { id: 'orphan', sourceHash: 'xyz', modelVersion: 'v2' }
            ];
            const plan = planEmbeddingSync(items, stored, 'v2');
            assert.deepEqual(plan.toEmbed, ['changed-text', 'new-item', 'old-version']);
            assert.deepEqual(plan.toDelete, ['orphan']);
            assert.equal(plan.upToDate, 1);
        });
    }

    console.log(failed ? `\n${failed} check(s) failed` : '\nsync plan checks passed');
    process.exit(failed ? 1 : 0);
})();
