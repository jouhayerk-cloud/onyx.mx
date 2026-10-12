import { useEffect, useMemo, useRef, useState } from 'react';
import { hybridSearch } from './hybridSearch';
import type { HybridSearchResult as BlendedHit, SearchSource, VectorHit } from './hybridSearch';
import type { VectorIndex } from './vectorIndex';

/** Debounce delay applied before embedding the query. */
export const QUERY_DEBOUNCE_MS = 150;

/** Expected query embedding dimensionality. */
export const QUERY_VECTOR_DIMS = 256;

/**
 * Embeds a search query into a vector. Resolves null when the embedding
 * companion is unavailable (the hook then falls back to keyword ordering).
 * Wire this to `embedSearchQuery` (256 dims) from the embeddings client.
 */
export type QueryEmbedder = (query: string) => Promise<Float32Array | null>;

export interface HybridSearchParams<T extends { id: string }> {
    query: string;
    items: T[];
    keywordMatchIds: string[];
    vectorIndex?: VectorIndex | null;
    filter?: (item: T) => boolean;
    limit?: number;
    minVectorScore?: number;
    /** Query embedder; when omitted no vector search is performed. */
    embedQuery?: QueryEmbedder;
}

export interface HybridSearchResult<T extends { id: string }> {
    results: T[];
    isVectorActive: boolean;
    isSearching: boolean;
    hitSources: Map<string, Array<'keyword' | 'vector'>>;
}

/**
 * Orders items by keywordMatchIds (deduplicated), applying filter and limit.
 * Ids that do not match any item are skipped.
 */
export function orderByKeywordIds<T extends { id: string }>(
    items: T[],
    keywordMatchIds: string[],
    filter?: (item: T) => boolean,
    limit: number = 20,
): { results: T[]; hitSources: Map<string, SearchSource[]> } {
    const byId = new Map<string, T>();
    for (const item of items) {
        byId.set(item.id, item);
    }
    const results: T[] = [];
    const hitSources = new Map<string, SearchSource[]>();
    const max = Math.max(0, limit);
    for (const id of keywordMatchIds) {
        if (results.length >= max) {
            break;
        }
        const item = byId.get(id);
        if (!item || hitSources.has(id)) {
            continue;
        }
        if (filter && !filter(item)) {
            continue;
        }
        results.push(item);
        hitSources.set(id, ['keyword']);
    }
    return { results, hitSources };
}

/**
 * Maps blended hits back to item objects preserving blended rank order.
 * Hits whose id is not in items are dropped.
 */
export function mapBlendedToItems<T extends { id: string }>(
    blended: BlendedHit[],
    items: T[],
): { results: T[]; hitSources: Map<string, SearchSource[]> } {
    const byId = new Map<string, T>();
    for (const item of items) {
        byId.set(item.id, item);
    }
    const results: T[] = [];
    const hitSources = new Map<string, SearchSource[]>();
    for (const hit of blended) {
        const item = byId.get(hit.id);
        if (!item) {
            continue;
        }
        results.push(item);
        hitSources.set(hit.id, hit.sources.slice());
    }
    return { results, hitSources };
}

/**
 * Fuses keyword ids and vector hits with RRF and maps the result to items.
 * The item filter is applied by id inside the fusion, before the limit.
 */
export function fuseAndMap<T extends { id: string }>(
    items: T[],
    keywordMatchIds: string[],
    vectorHits: VectorHit[],
    options: {
        filter?: (item: T) => boolean;
        limit?: number;
        minVectorScore?: number;
    } = {},
): { results: T[]; hitSources: Map<string, SearchSource[]> } {
    const byId = new Map<string, T>();
    for (const item of items) {
        byId.set(item.id, item);
    }
    const userFilter = options.filter;
    const blended = hybridSearch({
        keywordIds: keywordMatchIds,
        vectorHits,
        limit: options.limit ?? 20,
        minVectorScore: options.minVectorScore ?? 0.3,
        filter: (id: string): boolean => {
            const item = byId.get(id);
            if (!item) {
                return false;
            }
            return userFilter ? userFilter(item) : true;
        },
    });
    return mapBlendedToItems(blended, items);
}

/**
 * Hybrid keyword + vector search over local items. Debounces query embedding,
 * and falls back to keyword ordering when vector search is unavailable.
 */
export function useHybridSearch<T extends { id: string }>(
    params: HybridSearchParams<T>,
): HybridSearchResult<T> {
    const {
        query,
        items,
        keywordMatchIds,
        vectorIndex,
        filter,
        embedQuery,
    } = params;
    const limit = params.limit ?? 20;
    const minVectorScore = params.minVectorScore ?? 0.3;

    const [vectorHits, setVectorHits] = useState<VectorHit[] | null>(null);
    const [isSearching, setIsSearching] = useState<boolean>(false);

    const embedRef = useRef<QueryEmbedder | undefined>(embedQuery);
    embedRef.current = embedQuery;

    useEffect(() => {
        const trimmed = query.trim();
        const embed = embedRef.current;
        if (!vectorIndex || !embed || trimmed.length === 0) {
            setVectorHits(null);
            setIsSearching(false);
            return undefined;
        }

        let cancelled = false;
        setIsSearching(true);
        const timer = setTimeout(() => {
            embed(trimmed)
                .then((vec) => {
                    if (cancelled) {
                        return;
                    }
                    if (!vec || vec.length !== vectorIndex.dims) {
                        setVectorHits(null);
                    } else {
                        setVectorHits(vectorIndex.search(vec, Math.max(50, limit * 3)));
                    }
                    setIsSearching(false);
                })
                .catch(() => {
                    if (cancelled) {
                        return;
                    }
                    setVectorHits(null);
                    setIsSearching(false);
                });
        }, QUERY_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, vectorIndex, limit]);

    const fused = useMemo(() => {
        if (!vectorIndex || vectorHits === null) {
            return orderByKeywordIds(items, keywordMatchIds, filter, limit);
        }
        return fuseAndMap(items, keywordMatchIds, vectorHits, { filter, limit, minVectorScore });
    }, [items, keywordMatchIds, vectorIndex, vectorHits, filter, limit, minVectorScore]);

    return {
        results: fused.results,
        isVectorActive: Boolean(vectorIndex) && vectorHits !== null,
        isSearching,
        hitSources: fused.hitSources,
    };
}
