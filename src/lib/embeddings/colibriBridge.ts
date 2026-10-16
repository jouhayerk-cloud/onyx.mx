import { type Embedder, formatDocument, formatQuery, PROMPTS } from './bridge';
import { COLIBRI_INFO, colibriProvider } from '../ai/providers/colibri';

export { formatDocument, formatQuery, PROMPTS };
export { COLIBRI_INFO, colibriProvider };

/**
 * Colibrì has NO embeddings endpoint (checked in C:\colibri\docs\api.md: only /v1/models, /v1/chat/completions,
 * /v1/completions, /v1/systemone, /v1/messages and image generation). The embedder tier that used to live here called
 * POST /v1/embeddings with an invented model id and only ever worked against the mock server, whose vectors were
 * sin/cos hashes. Mixing such vectors with EmbeddingGemma vectors in item_embeddings would rank garbage with no error,
 * so the tier is switched off: nothing in the app can produce a Colibrì embedding.
 *
 * The exports stay so that existing imports compile. If Colibrì ever serves a real embedding model, bring this back
 * only with its own model_version (see syncRunner.ts, which refuses to write vectors from a different model) and a
 * migration that makes match_item_embeddings filter by model_version.
 */
export const COLIBRI_EMBEDDINGS_SUPPORTED = false;

/** Always null: there is no Colibrì embedder. */
export function getColibriEmbedder(): Embedder | null {
    return null;
}

/** No state to reset; kept for callers that reset every embedder. */
export function resetColibriEmbedder(): void {
    /* nothing cached */
}

/** Always false, without any network call, so embedding availability never waits on Colibrì. */
export async function isColibriEmbedderAvailable(_baseUrl?: string): Promise<boolean> {
    return false;
}
