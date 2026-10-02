/**
 * Compatibility shim. New code uses generateJson / generateText from
 * lib/ai/client, which add JSON mode, retry, cancellation, the shared limiter
 * and typed errors.
 *
 * Two things changed under the old exports: the key comes from
 * lib/ai/keys.ts (so a key saved anywhere works here too, including the
 * legacy onyxApiKey this lookup used to ignore), and it travels in the
 * x-goog-api-key header instead of the URL, where it landed in browser
 * history and devtools.
 */
import { getGeminiKey } from './ai/keys';
import { AI_MODELS } from './ai/models';

/** @deprecated Use getGeminiKey from lib/ai/keys. */
export const getApiKey = (): string => getGeminiKey();

/** @deprecated Use generateJson / generateText from lib/ai/client. Returns the raw response body. */
export const callGemini = async (
    prompt: string,
    imgData: string | null,
    timeoutMs: number = 40000,
    modelId: string = AI_MODELS.content.model,
    responseSchema?: any,
) => {
    const API_KEY = getGeminiKey();
    if (!API_KEY) throw new Error('API Key missing');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        ...(imgData ? [{ inlineData: { mimeType: 'image/jpeg', data: imgData } }] : []),
                    ]
                }],
                generationConfig: responseSchema ? {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema
                } : undefined
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${res.statusText} - ${errBody}`);
        }

        return await res.json();
    } finally {
        clearTimeout(timeoutId);
    }
};
