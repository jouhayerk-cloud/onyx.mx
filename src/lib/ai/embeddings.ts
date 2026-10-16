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
let activeEmbedderKind: 'onDevice' | 'colibri' | null = null;
const queryCache = new Map<string, Float32Array>();

/** Returns the on-device (companion app) embedder, or null when the native bridge is absent. */
export function getOnDeviceEmbedder(): Embedder | null {
    return getEmbedder();
}

/** Clears the availability and query caches (mainly for tests). */
export function resetEmbeddingsCache(): void {
    availabilityCache = null;
    activeEmbedderKind = null;
    queryCache.clear();
    resetColibriEmbedder();
}

/**
 * True when an on-device embedder (iOS companion) or Windows Desktop Colibri local embedder
 * is available and responds. Result is cached for 10 seconds.
 */
export async function isCompanionAvailable(): Promise<boolean> {
    const now = Date.now();
    if (availabilityCache && now - availabilityCache.at < AVAILABILITY_TTL_MS) {
        return availabilityCache.value;
    }
    let value = false;
    activeEmbedderKind = null;

    // Priority 1: Check iOS on-device companion embedder
    const onDevice = getOnDeviceEmbedder();
    if (onDevice !== null) {
        try {
            await onDevice.info();
            value = true;
            activeEmbedderKind = 'onDevice';
        } catch {
            value = false;
        }
    }

    // Priority 2: Fallback to Windows Desktop Colibri local embedder
    if (!value) {
        try {
            const colibriOk = await isColibriEmbedderAvailable();
            if (colibriOk) {
                value = true;
                activeEmbedderKind = 'colibri';
            }
        } catch {
            value = false;
        }
    }

    availabilityCache = { value, at: Date.now() };
    return value;
}

/**
 * Resolves the active embedder following cascade priority:
 * 1) iOS companion embedder (getOnDeviceEmbedder())
 * 2) Windows Colibri embedder (getColibriEmbedder())
 * 3) null (for cloud fallback)
 */
export async function getActiveEmbedder(): Promise<Embedder | null> {
    if (activeEmbedderKind === 'onDevice') {
        const embedder = getOnDeviceEmbedder();
        if (embedder !== null) return embedder;
    } else if (activeEmbedderKind === 'colibri') {
        const embedder = getColibriEmbedder();
        if (embedder !== null) return embedder;
    }

    // If cache not populated or kind unknown, evaluate cascade directly:
    const onDevice = getOnDeviceEmbedder();
    if (onDevice !== null) {
        return onDevice;
    }

    const colibriAvailable = await isColibriEmbedderAvailable();
    if (colibriAvailable) {
        return getColibriEmbedder();
    }

    return null;
}

/** Embeds a search query (Matryoshka-truncated to dims). Returns null when empty or unavailable. */
export async function embedSearchQuery(query: string, dims: number = 256): Promise<Float32Array | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const key = dims + ':' + trimmed;
    const cached = queryCache.get(key);
    if (cached) return cached;

    if (!(await isCompanionAvailable())) return null;
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

/** Embeds a batch of documents. Returns null when companion and Colibri are unavailable. */
export async function embedDocumentBatch(
    items: Array<{ title: string; text: string }>,
    dims: number = 768,
): Promise<Float32Array[] | null> {
    if (items.length === 0) return [];
    if (!(await isCompanionAvailable())) return null;
    const embedder = await getActiveEmbedder();
    if (embedder === null) return null;
    return embedder.embedDocuments(items, dims);
}
