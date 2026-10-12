import { reciprocalRankFusion } from './vectorMath';

/**
 * A candidate search hit from vector similarity search.
 */
export interface VectorHit {
    id: string;
    score: number;
}

/**
 * Origin source for a retrieved hybrid search result.
 */
export type SearchSource = 'keyword' | 'vector';

/**
 * A combined search result with rank fusion score and matching sources.
 */
export interface HybridSearchResult {
    id: string;
    score: number;
    sources: SearchSource[];
}

/**
 * Options configuring hybrid search fusion and filtering.
 */
export interface HybridSearchOptions {
    keywordIds: string[];
    vectorHits: VectorHit[];
    filter?: (id: string) => boolean;
    limit?: number;
    minVectorScore?: number;
}

/**
 * Combines keyword and vector search results using Reciprocal Rank Fusion (RRF).
 *
 * @param options - Configuration options for the hybrid search.
 * @returns Sorted and filtered hybrid search results.
 */
export function hybridSearch(options: HybridSearchOptions): HybridSearchResult[] {
    const minVectorScore = options.minVectorScore ?? 0.3;

    // 1 & 2. Deduplicate keywordIds preserving first appearance
    const cleanKeywordIds: string[] = [];
    const seenKeywordIds = new Set<string>();
    const keywordIndexMap = new Map<string, number>();

    for (const id of options.keywordIds ?? []) {
        if (!seenKeywordIds.has(id)) {
            keywordIndexMap.set(id, cleanKeywordIds.length);
            seenKeywordIds.add(id);
            cleanKeywordIds.push(id);
        }
    }

    // 1 & 2. Filter vectorHits by minVectorScore and deduplicate preserving first appearance
    const cleanVectorIds: string[] = [];
    const seenVectorIds = new Set<string>();
    const vectorIndexMap = new Map<string, number>();

    for (const hit of options.vectorHits ?? []) {
        if (hit.score >= minVectorScore) {
            if (!seenVectorIds.has(hit.id)) {
                vectorIndexMap.set(hit.id, cleanVectorIds.length);
                seenVectorIds.add(hit.id);
                cleanVectorIds.push(hit.id);
            }
        }
    }

    // 3. Prepare candidate lists for fusion; if both are empty return []
    const lists: string[][] = [];
    if (cleanKeywordIds.length > 0) {
        lists.push(cleanKeywordIds);
    }
    if (cleanVectorIds.length > 0) {
        lists.push(cleanVectorIds);
    }

    if (lists.length === 0) {
        return [];
    }

    // Fuse remaining keywordIds and vectorIds using reciprocalRankFusion(lists, 60)
    const fused = reciprocalRankFusion(lists, 60);

    // 4. Determine sources for each fused result
    const results: HybridSearchResult[] = fused.map(({ id, score }) => {
        const sources: SearchSource[] = [];
        if (seenKeywordIds.has(id)) {
            sources.push('keyword');
        }
        if (seenVectorIds.has(id)) {
            sources.push('vector');
        }
        return {
            id,
            score,
            sources,
        };
    });

    // 5. Sort results by score descending, breaking ties (within 1e-9)
    results.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 1e-9) {
            return scoreDiff;
        }

        const aKwIdx = keywordIndexMap.get(a.id);
        const bKwIdx = keywordIndexMap.get(b.id);
        const aInKw = aKwIdx !== undefined;
        const bInKw = bKwIdx !== undefined;

        if (aInKw && !bInKw) {
            return -1;
        }
        if (!aInKw && bInKw) {
            return 1;
        }
        if (aInKw && bInKw) {
            return aKwIdx - bKwIdx;
        }

        const aVecIdx = vectorIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bVecIdx = vectorIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aVecIdx - bVecIdx;
    });

    // 6. Apply filter AFTER fusion and ranking
    let filteredResults = results;
    if (options.filter) {
        filteredResults = filteredResults.filter(item => options.filter!(item.id));
    }

    // 7. Apply limit (default 20, clamp minimum 0)
    const limit = Math.max(0, options.limit ?? 20);
    return filteredResults.slice(0, limit);
}
