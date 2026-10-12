import { getEmbedder, type Embedder } from '../embeddings/bridge';

const AVAILABILITY_TTL_MS = 10000;
const QUERY_CACHE_MAX = 50;

let availabilityCache: { value: boolean; at: number } | null = null;
const queryCache = new Map<string, Float32Array>();

/** Returns the on-device (companion app) embedder, or null when the native bridge is absent. */
export function getOnDeviceEmbedder(): Embedder | null {
    return getEmbedder();
}

/** Clears the availability and query caches (mainly for tests). */
export function resetEmbeddingsCache(): void {
    availabilityCache = null;
    queryCache.clear();
}

/** True when the native embedder exists and info() resolves. Result is cached for 10 seconds. */
export async function isCompanionAvailable(): Promise<boolean> {
    const now = Date.now();
    if (availabilityCache && now - availabilityCache.at < AVAILABILITY_TTL_MS) {
        return availabilityCache.value;
    }
    let value = false;
    const embedder = getOnDeviceEmbedder();
    if (embedder !== null) {
        try {
            await embedder.info();
            value = true;
        } catch {
            value = false;
        }
    }
    availabilityCache = { value, at: Date.now() };
    return value;
}

/** Embeds a search query (Matryoshka-truncated to dims). Returns null when empty or unavailable. */
export async function embedSearchQuery(query: string, dims: number = 256): Promise<Float32Array | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const key = dims + ':' + trimmed;
    const cached = queryCache.get(key);
    if (cached) return cached;

    if (!(await isCompanionAvailable())) return null;
    const embedder = getOnDeviceEmbedder();
    if (embedder === null) return null;

    const vector = await embedder.embedQuery(trimmed, dims);
    if (queryCache.size >= QUERY_CACHE_MAX) {
        const oldest = queryCache.keys().next();
        if (!oldest.done) queryCache.delete(oldest.value);
    }
    queryCache.set(key, vector);
    return vector;
}

/** Embeds a batch of documents. Returns null when the companion is unavailable. */
export async function embedDocumentBatch(
    items: Array<{ title: string; text: string }>,
    dims: number = 768,
): Promise<Float32Array[] | null> {
    if (!(await isCompanionAvailable())) return null;
    const embedder = getOnDeviceEmbedder();
    if (embedder === null) return null;
    return embedder.embedDocuments(items, dims);
}
