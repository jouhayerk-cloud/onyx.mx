import { truncateAndNormalize } from './vectorMath';

/** Prompt prefixes the embedding model expects. */
export const PROMPTS = {
    query: 'task: search result | query: ',
    documentUntitled: 'title: none | text: ',
    documentTitled: (title: string) => 'title: ' + title + ' | text: ',
};

/** Prefixes a search query with the query prompt. */
export function formatQuery(text: string): string {
    return PROMPTS.query + text;
}

/** Prefixes a document with its title prompt, or the untitled prompt when the title is blank. */
export function formatDocument(title: string, text: string): string {
    const prefix = title && title.trim() ? PROMPTS.documentTitled(title) : PROMPTS.documentUntitled;
    return prefix + text;
}

export interface EmbedderInfo {
    model: string;
    dims: number;
    version: string;
    modalities: string[];
}

export interface Embedder {
    info(): Promise<EmbedderInfo>;
    embedQuery(text: string, dims: number): Promise<Float32Array>;
    embedDocuments(items: Array<{ title: string; text: string }>, dims: number): Promise<Float32Array[]>;
    embedImage(base64: string, mimeType: string, dims: number): Promise<Float32Array>;
    embedAudio(base64: string, mimeType: string, dims: number): Promise<Float32Array>;
}

const BAD_REPLY = 'Bad reply from the native embedder';

const badReply = (): Error => new Error(BAD_REPLY);

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(x => typeof x === 'number');

/** Converts a native number array to a truncated, L2-normalised Float32Array. */
const toVector = (raw: unknown, dims: number): Float32Array => {
    if (!isNumberArray(raw)) throw badReply();
    return truncateAndNormalize(new Float32Array(raw), dims);
};

/**
 * Returns an Embedder backed by window.webkit.messageHandlers.onyxEmbed, or null
 * when that native handler does not exist. Does not touch window at import time.
 */
export function getEmbedder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    win: any = typeof window !== 'undefined' ? window : undefined,
): Embedder | null {
    const handler = win?.webkit?.messageHandlers?.onyxEmbed;
    if (!handler || typeof handler.postMessage !== 'function') return null;

    const send = async (msg: Record<string, unknown>): Promise<Record<string, unknown>> => {
        let reply: unknown;
        try {
            reply = await handler.postMessage(msg);
        } catch (e) {
            throw new Error(e instanceof Error ? e.message : String(e));
        }
        if (!reply || typeof reply !== 'object') throw badReply();
        return reply as Record<string, unknown>;
    };

    const embedTexts = async (kind: 'query' | 'document', texts: string[], dims: number): Promise<Float32Array[]> => {
        const reply = await send({ op: 'embed', kind, texts });
        const vectors = reply.vectors;
        if (!Array.isArray(vectors) || vectors.length !== texts.length) throw badReply();
        return vectors.map(v => toVector(v, dims));
    };

    const embedMedia = async (op: 'embed_image' | 'embed_audio', base64: string, mimeType: string, dims: number): Promise<Float32Array> => {
        const reply = await send({ op, base64, mimeType });
        return toVector(reply.vector, dims);
    };

    return {
        /** Asks the native side which model, dimensions, version and modalities it offers. */
        async info(): Promise<EmbedderInfo> {
            const r = await send({ op: 'info' });
            if (
                typeof r.model !== 'string' ||
                typeof r.dims !== 'number' ||
                typeof r.version !== 'string' ||
                !Array.isArray(r.modalities)
            ) {
                throw badReply();
            }
            return { model: r.model, dims: r.dims, version: r.version, modalities: r.modalities.map(String) };
        },
        /** Embeds one search query, truncated to dims and normalised. */
        async embedQuery(text: string, dims: number): Promise<Float32Array> {
            const [v] = await embedTexts('query', [formatQuery(text)], dims);
            return v;
        },
        /** Embeds documents (title + text) in one native call; an empty list makes no call. */
        async embedDocuments(items: Array<{ title: string; text: string }>, dims: number): Promise<Float32Array[]> {
            if (items.length === 0) return [];
            return embedTexts('document', items.map(i => formatDocument(i.title, i.text)), dims);
        },
        /** Embeds a base64 image, truncated to dims and normalised. */
        embedImage(base64: string, mimeType: string, dims: number): Promise<Float32Array> {
            return embedMedia('embed_image', base64, mimeType, dims);
        },
        /** Embeds a base64 audio clip, truncated to dims and normalised. */
        embedAudio(base64: string, mimeType: string, dims: number): Promise<Float32Array> {
            return embedMedia('embed_audio', base64, mimeType, dims);
        },
    };
}
