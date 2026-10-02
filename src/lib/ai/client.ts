/**
 * The Gemini client every AI feature goes through.
 *
 * REST generateContent, with the key in the x-goog-api-key HEADER. Four of the
 * old clients put it in the URL (?key=), where it lands in browser history,
 * devtools and any proxy log on the way.
 *
 * What a call gets for free here, and used to get nowhere:
 * - JSON mode with a response schema, so the model cannot answer in prose and
 *   enum fields (colours, product types) are enforced by the API, not by hope.
 * - A timeout and an external AbortSignal, so cancelling an op actually stops
 *   waiting on its request.
 * - One retry with backoff on 429 and 5xx, honouring the server's RetryInfo.
 *   A single 429 used to fail the op outright.
 * - finishReason / blockReason checks, so a truncated or blocked answer says
 *   so instead of surfacing as a JSON.parse crash.
 * - A slot from the shared limiter, whichever screen made the call.
 * - Typed errors (errors.ts) with messages fit for a toast or the run log.
 *
 * When the server proxy lands, `endpointFor` and the header are the only
 * things that change.
 */
import { GoogleGenAI } from '@google/genai';
import { getGeminiKey } from './keys';
import { AI_MODELS, type AiJob } from './models';
import { withAiSlot } from './limiter';
import {
    AiCancelledError,
    AiError,
    AiKeyMissingError,
    AiQuotaError,
    AiResponseError,
    AiTimeoutError,
} from './errors';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** A bare base64 JPEG (what resizeImage().split(',')[1] gives), a data: URL,
 *  or explicit bytes and type. */
export type AiImage = string | { data: string; mimeType: string };

export interface GenerateOptions {
    job: Exclude<AiJob, 'bgReplace' | 'video'>;
    prompt: string;
    system?: string;
    images?: AiImage[];
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Overrides the job's model, for one-off comparisons. Prefer models.ts. */
    model?: string;
    temperature?: number;
}

export interface GenerateJsonOptions extends GenerateOptions {
    /** Gemini responseSchema (OpenAPI subset). */
    schema: object;
}

const endpointFor = (model: string) =>
    `${API_BASE}/${model.startsWith('models/') ? model : `models/${model}`}:generateContent`;

const toInlineData = (img: AiImage): { mimeType: string; data: string } => {
    if (typeof img !== 'string') return img;
    const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(img);
    if (m) return { mimeType: m[1], data: m[2] };
    return { mimeType: 'image/jpeg', data: img };
};

/** Waits, unless the signal aborts first. Shared with bgReplace's retry. */
export const aiSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AiCancelledError());
    const onAbort = () => { clearTimeout(t); reject(new AiCancelledError()); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
});

/** The server's own suggestion, from a 429 body's RetryInfo ("13s"), capped. */
export const retryDelayFrom = (body: string): number | null => {
    const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body || '');
    return m ? Math.min(30000, Math.round(parseFloat(m[1]) * 1000)) : null;
};

/** Backoff before the single retry: the server's hint, else 2-3.5 s. */
export const backoffMs = (err: unknown): number =>
    ((err as any)?.retryAfterMs as number | null | undefined) ?? 2000 + Math.round(Math.random() * 1500);

const isRetryable = (err: unknown): boolean =>
    err instanceof AiQuotaError
    || (err instanceof AiResponseError && !!err.status && err.status >= 500)
    // fetch() rejects with a TypeError on a dropped connection.
    || err instanceof TypeError;

/** One HTTP attempt. Returns the parsed response body. */
async function postOnce(model: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    const key = getGeminiKey();
    if (!key) throw new AiKeyMissingError();
    if (signal?.aborted) throw new AiCancelledError();

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
        const res = await fetch(endpointFor(model), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (res.status === 429) {
                const err = new AiQuotaError(text);
                (err as any).retryAfterMs = retryDelayFrom(text);
                throw err;
            }
            // The body is JSON with an error.message worth showing; the rest
            // of it is noise in a toast.
            let detail = text;
            try { detail = JSON.parse(text)?.error?.message || text; } catch { /* keep raw */ }
            throw new AiResponseError(
                `Gemini returned HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 160)}` : ''}`,
                { status: res.status, detail: text },
            );
        }
        return await res.json();
    } catch (err: any) {
        if (err instanceof AiError) throw err;
        if (err?.name === 'AbortError') {
            if (timedOut) throw new AiTimeoutError(timeoutMs);
            throw new AiCancelledError();
        }
        throw err;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

/** postOnce, plus the one retry, inside a limiter slot. */
async function post(job: AiJob, model: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    return withAiSlot(AI_MODELS[job].jobClass, async () => {
        try {
            return await postOnce(model, body, timeoutMs, signal);
        } catch (err) {
            if (!isRetryable(err)) throw err;
            await aiSleep(backoffMs(err), signal);
            return postOnce(model, body, timeoutMs, signal);
        }
    }, signal);
}

function buildBody(opts: GenerateOptions, schema?: object) {
    const spec = AI_MODELS[opts.job];
    const generationConfig: Record<string, unknown> = {};
    if (schema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = schema;
    }
    if (spec.thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = { thinkingBudget: spec.thinkingBudget };
    }
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;

    return {
        // Image first, then the instruction: Google's guidance for single-image
        // prompts, and the order bgReplace already used.
        contents: [{
            role: 'user',
            parts: [
                ...(opts.images || []).filter(Boolean).map(img => ({ inlineData: toInlineData(img) })),
                { text: opts.prompt },
            ],
        }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    };
}

/** The answer's text, or a typed error saying why there is none. */
function extractText(data: any): string {
    const blocked = data?.promptFeedback?.blockReason;
    if (blocked) throw new AiResponseError(`Gemini blocked the request (${blocked})`, { detail: JSON.stringify(data?.promptFeedback) });

    const cand = data?.candidates?.[0];
    const finish: string | undefined = cand?.finishReason;
    const text = (cand?.content?.parts || [])
        .filter((p: any) => typeof p?.text === 'string' && !p.thought)
        .map((p: any) => p.text)
        .join('')
        .trim();

    if (finish === 'MAX_TOKENS') throw new AiResponseError('Gemini answer was cut off (too long)', { detail: finish });
    if (finish && finish !== 'STOP' && !text) throw new AiResponseError(`Gemini returned no answer (${finish})`, { detail: finish });
    if (!text) throw new AiResponseError('Gemini returned an empty answer');
    return text;
}

export async function generateText(opts: GenerateOptions): Promise<string> {
    const spec = AI_MODELS[opts.job];
    const data = await post(opts.job, opts.model || spec.model, buildBody(opts), opts.timeoutMs ?? spec.timeoutMs, opts.signal);
    return extractText(data);
}

export async function generateJson<T = unknown>(opts: GenerateJsonOptions): Promise<T> {
    const spec = AI_MODELS[opts.job];
    const data = await post(opts.job, opts.model || spec.model, buildBody(opts, opts.schema), opts.timeoutMs ?? spec.timeoutMs, opts.signal);
    let text = extractText(data);
    // JSON mode should make fences impossible; older models occasionally add
    // them anyway, and stripping costs nothing.
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
        return JSON.parse(text) as T;
    } catch (cause) {
        throw new AiResponseError('Gemini returned malformed JSON', { detail: text.slice(0, 500), cause });
    }
}

/**
 * The SDK instance, for the one job that still uses it: image generation in
 * bgReplace.ts. Its key comes from keys.ts like everything else, and it is
 * rebuilt when the key changes.
 */
let sdk: GoogleGenAI | null = null;
let sdkKey: string | null = null;
export function getGenAiSdk(): GoogleGenAI {
    const key = getGeminiKey();
    if (!sdk || sdkKey !== key) {
        sdk = new GoogleGenAI({ apiKey: key });
        sdkKey = key;
    }
    return sdk;
}
