import { fuseAndMap, mapBlendedToItems, orderByKeywordIds } from '../src/lib/embeddings/useHybridSearch';

function check(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`Check failed: ${message}`);
    }
}

function ids(list: Array<{ id: string }>): string {
    return list.map((x) => x.id).join(',');
}

const items = [
    { id: 'a', name: 'A', hidden: false },
    { id: 'b', name: 'B', hidden: false },
    { id: 'c', name: 'C', hidden: true },
    { id: 'd', name: 'D', hidden: false },
    { id: 'e', name: 'E', hidden: false },
];

// Keyword fallback: order follows keywordMatchIds, unknown/duplicate ids skipped.
const kw = orderByKeywordIds(items, ['d', 'zzz', 'a', 'd', 'b']);
check(ids(kw.results) === 'd,a,b', 'keyword fallback order');
check(kw.hitSources.get('d')?.join() === 'keyword', 'keyword fallback source');

// Keyword fallback respects filter and limit.
const kwFiltered = orderByKeywordIds(items, ['c', 'a', 'b'], (i) => !i.hidden, 1);
check(ids(kwFiltered.results) === 'a', 'keyword fallback filter and limit');

// Fusion: item in both lists ranks first and has both sources.
const fused = fuseAndMap(items, ['a', 'b'], [
    { id: 'b', score: 0.9 },
    { id: 'e', score: 0.8 },
]);
check(fused.results[0].id === 'b', 'item in both lists ranks first');
check(fused.hitSources.get('b')?.join() === 'keyword,vector', 'both sources for b');
check(fused.hitSources.get('e')?.join() === 'vector', 'vector-only source for e');
check(fused.hitSources.get('a')?.join() === 'keyword', 'keyword-only source for a');
check(ids(fused.results) === 'b,a,e', 'blended order');

// Low-score vector hits are dropped.
const lowScore = fuseAndMap(items, ['a'], [{ id: 'e', score: 0.1 }]);
check(ids(lowScore.results) === 'a', 'low vector score filtered');

// Item filter applies by id, ids missing from items are dropped.
const filtered = fuseAndMap(items, ['c', 'a'], [{ id: 'ghost', score: 0.95 }, { id: 'd', score: 0.7 }], {
    filter: (i) => !i.hidden,
});
check(ids(filtered.results) === 'a,d', 'filter and unknown ids dropped');

// Limit applies after fusion.
const limited = fuseAndMap(items, ['a', 'b'], [{ id: 'b', score: 0.9 }, { id: 'e', score: 0.8 }], { limit: 2 });
check(limited.results.length === 2, 'limit applied');

// mapBlendedToItems preserves rank order and drops unknown ids.
const mapped = mapBlendedToItems(
    [
        { id: 'e', score: 0.5, sources: ['vector'] },
        { id: 'x', score: 0.4, sources: ['keyword'] },
        { id: 'a', score: 0.3, sources: ['keyword', 'vector'] },
    ],
    items,
);
check(ids(mapped.results) === 'e,a', 'mapBlendedToItems order');
check(!mapped.hitSources.has('x'), 'unknown id has no sources');

console.log('hybrid search hook checks passed');
