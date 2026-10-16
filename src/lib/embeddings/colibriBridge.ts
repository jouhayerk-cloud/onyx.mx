import {
    type Embedder,
    type EmbedderInfo,
    formatDocument,
    formatQuery,
    PROMPTS,
} from './bridge';
import { truncateAndNormalize } from './vectorMath';
import {
    COLIBRI_INFO,
    colibriProvider,
    isColibriAvailable,
} from '../ai/providers/colibri';

export { formatDocument, formatQuery, PROMPTS };
export { COLIBRI_INFO, colibriProvider };

const isNumberArray = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every(x => typeof x === 'number');

/**
 * Extracts raw embedding number arrays from OpenAI-compatible or direct Colibri API response formats.
 */
export function extractEmbeddingVectors(json: unknown): number[][] {
    if (!json || typeof json !== 'object') {
        throw new Error('Empty or invalid response from Colibri embeddings API');
    }

    const payload = json as Record<string, unknown>;

    // Case 1: Standard OpenAI format { data: [{ embedding: number[], index?: number }, ...] }
    if (Array.isArray(payload.data)) {
        if (
            payload.data.length > 0 &&
            typeof payload.data[0] === 'object' &&
            payload.data[0] !== null &&
            'embedding' in (payload.data[0] as Record<string, unknown>)
        ) {
            const sorted = [...payload.data].sort(
                (a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)
            );
            return sorted.map((d: any) => d.embedding);
        }
        // Case 2: Array of arrays { data: [[...], [...]] }
        if (payload.data.length > 0 && Array.isArray(payload.data[0])) {
            return payload.data as number[][];
        }
    }

    // Case 3: Direct single embedding { embedding: number[] }
    if (Array.isArray(payload.embedding)) {
        return [payload.embedding as number[]];
    }

    // Case 4: Plural property { embeddings: number[][] }
    if (Array.isArray(payload.embeddings)) {
        return payload.embeddings as number[][];
    }

    // Case 5: Direct array [number[]] or number[]
    if (Array.isArray(json)) {
        if (json.length > 0 && typeof json[0] === 'number') {
            return [json as number[]];
        }
        if (json.length > 0 && Array.isArray(json[0])) {
            return json as number[][];
        }
    }

    throw new Error('Unexpected embedding response format from Colibri API');
}

/**
 * Colibri on-device / local embedding model implementation.
 * Connects to the local Colibri daemon listening at http://127.0.0.1:8082.
 */
export class ColibriEmbedder implements Embedder {
    readonly baseUrl: string;

    constructor(baseUrl: string = 'http://127.0.0.1:8082') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    /**
     * Reports Colibri embedding model metadata.
     */
    async info(): Promise<EmbedderInfo> {
        return {
            model: 'colibri-embed-v1',
            dims: 768,
            version: '1.0.0',
            modalities: ['text'],
        };
    }

    /**
     * Embeds a single query string with formatting, dimension truncation, and L2 normalization.
     */
    async embedQuery(text: string, dims: number = 768): Promise<Float32Array> {
        const formatted = formatQuery(text);
        const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: formatted,
                model: 'colibri-embed-v1',
            }),
        });

        if (!res.ok) {
            throw new Error(`Colibri embedQuery failed with HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        const vectors = extractEmbeddingVectors(json);
        if (!vectors.length || !vectors[0]) {
            throw new Error('Colibri embeddings returned empty response for query');
        }

        const raw = vectors[0];
        if (!isNumberArray(raw)) {
            throw new Error('Colibri embeddings returned non-numeric vector');
        }

        const targetDims = dims > 0 && dims <= raw.length ? dims : raw.length;
        return truncateAndNormalize(new Float32Array(raw), targetDims);
    }

    /**
     * Embeds a batch of titled/untitled documents with dimension truncation and L2 normalization.
     */
    async embedDocuments(
        items: Array<{ title: string; text: string }>,
        dims: number = 768,
    ): Promise<Float32Array[]> {
        if (items.length === 0) return [];

        const formattedTexts = items.map(i => formatDocument(i.title, i.text));
        const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: formattedTexts,
                model: 'colibri-embed-v1',
            }),
        });

        if (!res.ok) {
            throw new Error(`Colibri embedDocuments failed with HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        const vectors = extractEmbeddingVectors(json);
        if (vectors.length !== items.length) {
            throw new Error(
                `Colibri embeddings returned ${vectors.length} vectors, expected ${items.length}`
            );
        }

        return vectors.map((raw, idx) => {
            if (!isNumberArray(raw)) {
                throw new Error(`Colibri embeddings returned non-numeric vector at index ${idx}`);
            }
            const targetDims = dims > 0 && dims <= raw.length ? dims : raw.length;
            return truncateAndNormalize(new Float32Array(raw), targetDims);
        });
    }

    /**
     * Rejects image modality embeddings gracefully (Colibri embedding model is text-only).
     */
    async embedImage(
        _base64: string,
        _mimeType: string,
        _dims: number = 768,
    ): Promise<Float32Array> {
        throw new Error('ColibriEmbedder does not support image embeddings (text only)');
    }

    /**
     * Rejects audio modality embeddings gracefully (Colibri embedding model is text-only).
     */
    async embedAudio(
        _base64: string,
        _mimeType: string,
        _dims: number = 768,
    ): Promise<Float32Array> {
        throw new Error('ColibriEmbedder does not support audio embeddings (text only)');
    }
}

let colibriSingleton: ColibriEmbedder | null = null;

/**
 * Returns the ColibriEmbedder singleton instance.
 */
export function getColibriEmbedder(): Embedder | null {
    if (!colibriSingleton) {
        colibriSingleton = new ColibriEmbedder();
    }
    return colibriSingleton;
}

/**
 * Resets the ColibriEmbedder singleton (useful for test resets).
 */
export function resetColibriEmbedder(): void {
    colibriSingleton = null;
}

/**
 * Checks if the local Colibri daemon is reachable via /health or /v1/models with a 300ms timeout.
 */
export async function isColibriEmbedderAvailable(
    baseUrl: string = 'http://127.0.0.1:8082',
): Promise<boolean> {
    return isColibriAvailable(baseUrl);
}
