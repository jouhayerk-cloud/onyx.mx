import { getEmbedder, type Embedder } from '../embeddings/bridge';
import {
    getColibriEmbedder,
    isColibriEmbedderAvailable,
    resetColibriEmbedder,
} from '../embeddings/colibriBridge';

export { getColibriEmbedder, isColibriEmbedderAvailable };

const AVAILABILITY_TTL_MS = 10000;
const QUERY_CACHE_MAX = 50;

let availabilityCache: { value: boolean; at: number } | null = null;
let activeEmbedderKind: 'onDevice' | null = null;
/** info().model of the embedder that answered the last availability check; part of every cache key. */
let activeEmbedderModel: string | null = null;
const queryCache = new Map<string, Float32Array>();

/** Returns the on-device (companion app) embedder, or null when the native bridge is absent. */
export function getOnDeviceEmbedder(): Embedder | null {
    return getEmbedder();
}

/** Clears the availability and query caches (mainly for tests). */
export function resetEmbeddingsCache(): void {
    availabilityCache = null;
    activeEmbedderKind = null;
    activeEmbedderModel = null;
    queryCache.clear();
    resetColibriEmbedder();
}

/**
 * True when the on-device embedder (iOS companion) is available and responds. Result is cached for 10 seconds.
 * Colibrì is not a tier: it has no embeddings endpoint (see colibriBridge.ts), so vectors from different models
 * can never mix in item_embeddings.
 */
export async function isCompanionAvailable(): Promise<boolean> {
    const now = Date.now();
    if (availabilityCache && now - availabilityCache.at < AVAILABILITY_TTL_MS) {
        return availabilityCache.value;
    }
    let value = false;
    activeEmbedderKind = null;
    activeEmbedderModel = null;

    const onDevice = getOnDeviceEmbedder();
    if (onDevice !== null) {
        try {
            const info = await onDevice.info();
            value = true;
            activeEmbedderKind = 'onDevice';
            activeEmbedderModel = info?.model ? String(info.model) : null;
        } catch {
            value = false;
        }
    }

    availabilityCache = { value, at: Date.now() };
    return value;
}

/** Resolves the active embedder: the iOS companion embedder, or null (cloud fallback). */
export async function getActiveEmbedder(): Promise<Embedder | null> {
    return getOnDeviceEmbedder();
}

/** Embeds a search query (Matryoshka-truncated to dims). Returns null when empty or unavailable. */
export async function embedSearchQuery(query: string, dims: number = 256): Promise<Float32Array | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    if (!(await isCompanionAvailable())) return null;

    // keyed by the model that produces the vector, so a cached vector is never reused after the embedder changes
    const key = (activeEmbedderModel ?? '?') + ':' + dims + ':' + trimmed;
    const cached = queryCache.get(key);
    if (cached) return cached;

    const embedder = await getActiveEmbedder();
    if (embedder === null) return null;

    const vector = await embedder.embedQuery(trimmed, dims);
    if (queryCache.size >= QUERY_CACHE_MAX) {
        const oldest = queryCache.keys().next();
        if (!oldest.done) queryCache.delete(oldest.value);
    }
    queryCache.set(key, vector);
    return vector;
}

/** Embeds a batch of documents. Returns null when no embedder is available. */
export async function embedDocumentBatch(
    items: Array<{ title: string; text: string }>,
    dims: number = 768,
): Promise<Float32Array[] | null> {
    const tagged = await embedDocumentBatchTagged(items, dims);
    return tagged === null ? null : tagged.vectors;
}

/**
 * Like embedDocumentBatch, but also names the model that produced the vectors (the embedder's own info().model),
 * so a writer can tag rows with the real model instead of the caller's guess. Null when no embedder is available.
 */
export async function embedDocumentBatchTagged(
    items: Array<{ title: string; text: string }>,
    dims: number = 768,
): Promise<{ vectors: Float32Array[]; model: string } | null> {
    if (items.length === 0) return { vectors: [], model: activeEmbedderModel ?? '' };
    if (!(await isCompanionAvailable())) return null;
    const embedder = await getActiveEmbedder();
    if (embedder === null) return null;
    const info = await embedder.info();
    const vectors = await embedder.embedDocuments(items, dims);
    return { vectors, model: String(info.model) };
}
