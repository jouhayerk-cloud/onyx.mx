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
import { AI_MODELS, type AiJob, type AiModelSpec } from './models';
import { withAiSlot } from './limiter';
import {
    AiCancelledError,
    AiError,
    AiKeyMissingError,
    AiQuotaError,
    AiResponseError,
    AiTimeoutError,
    providerErrorMessage,
} from './errors';
import { getRoute, providerAllowedForJob, ROUTABLE_JOBS, type RouteJob } from './routing';
import { getProviderConfig, hasProviderKey } from './providerKeys';
import { getProvider } from './providers';
import { isCompanionAvailable } from './providers/companion';
import { isColibriAvailable, COLIBRI_MIN_TIMEOUT_MS } from './providers/colibri';
import { AiProviderError, type ProviderConfig, type AiRequest, type ProviderInfo, type ProviderId } from './providers/types';
import { tr, trf } from '../i18n';


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

/** A provider without vision (Colibrì is text only, Companion vision pending) must not get a photo it would silently ignore. */
function assertCanSendImages(info: ProviderInfo, images: readonly AiImage[] | undefined): void {
    if (info.capabilities.vision) return;
    if ((images || []).some(Boolean)) {
        throw new AiProviderError(
            trf('{label} cannot read images; route this job to a provider with vision', { label: info.label }),
            undefined,
            'config'
        );
    }
}

const toAiImagePart = (img: AiImage) => {
    const inline = toInlineData(img);
    return { mimeType: inline.mimeType, base64: inline.data };
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

const isProviderRetryable = (err: unknown): boolean => {
    if (err instanceof AiProviderError) {
        return err.kind === 'rate' || err.kind === 'server';
    }
    return isRetryable(err);
};

/** Shares retry and backoff across all providers on transient 429 and 5xx errors. */
export async function runWithRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        if (!isProviderRetryable(err)) throw err;
        await aiSleep(backoffMs(err), signal);
        return await fn();
    }
}

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
                trf('Gemini returned HTTP {status}{detail}', {
                    status: res.status,
                    detail: detail ? `: ${String(detail).slice(0, 160)}` : '',
                }),
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
    return withAiSlot(AI_MODELS[job].jobClass, () => runWithRetry(() => postOnce(model, body, timeoutMs, signal), signal), signal);
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
    if (blocked) throw new AiResponseError(trf('Gemini blocked the request ({blocked})', { blocked }), { detail: JSON.stringify(data?.promptFeedback) });

    const cand = data?.candidates?.[0];
    const finish: string | undefined = cand?.finishReason;
    const text = (cand?.content?.parts || [])
        .filter((p: any) => typeof p?.text === 'string' && !p.thought)
        .map((p: any) => p.text)
        .join('')
        .trim();

    if (finish === 'MAX_TOKENS') throw new AiResponseError(tr('Gemini answer was cut off (too long)'), { detail: finish });
    if (finish && finish !== 'STOP' && !text) throw new AiResponseError(trf('Gemini returned no answer ({finish})', { finish }), { detail: finish });
    if (!text) throw new AiResponseError(tr('Gemini returned an empty answer'));
    return text;
}

export interface LayaTriageResult {
    complexity?: 'simple' | 'complex';
    tier?: string;
    route?: string;
    confidence?: number;
    [key: string]: unknown;
}

/**
 * Laya (:8001) /v1/systemone fast decision classifier.
 * Unused by default; called for instant routing/triage when enabled.
 */
export async function layaTriage(
    payload: { prompt?: string; text?: string; job?: string },
    baseUrl: string = 'http://127.0.0.1:8001',
    timeoutMs: number = 2000,
    signal?: AbortSignal,
): Promise<LayaTriageResult | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/systemone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

let fallbackCascadeEnabled = false;

export function isFallbackCascadeEnabled(): boolean {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem('ONYX_AI_FALLBACK_CASCADE') === 'true' || fallbackCascadeEnabled;
        }
    } catch { /* storage blocked */ }
    return fallbackCascadeEnabled;
}

export function setFallbackCascadeEnabled(enabled: boolean): void {
    fallbackCascadeEnabled = enabled;
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('ONYX_AI_FALLBACK_CASCADE', enabled ? 'true' : 'false');
        }
    } catch { /* storage blocked */ }
}

async function callProviderText(
    providerId: ProviderId,
    opts: GenerateOptions,
    spec: AiModelSpec,
    modelOverride?: string,
): Promise<string> {
    const provider = getProvider(providerId);
    if (!provider) throw new AiProviderError(trf('Unknown AI provider: {provider}', { provider: providerId }), undefined, 'config');
    if (!hasProviderKey(providerId)) {
        throw new AiProviderError(trf('No API key configured for {label}', { label: provider.info.label }), undefined, 'config');
    }
    assertCanSendImages(provider.info, opts.images);
    const savedCfg = getProviderConfig(providerId);
    // Colibrì serves one model and 'auto' means "the loaded one"; every other provider needs a chosen model
    const model = modelOverride || savedCfg.model || (providerId === 'colibri' ? 'auto' : undefined);
    if (!model && providerId !== 'companion') {
        throw new AiProviderError(tr('Pick a model in Settings'), undefined, 'config');
    }
    const cfg: ProviderConfig = {
        ...savedCfg,
        model: model || 'qwen2.5-1.5b-instruct',
    };
    const req: AiRequest & { job?: string } = {
        prompt: opts.prompt,
        system: opts.system,
        images: (opts.images || []).map(toAiImagePart),
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs ?? (providerId === 'colibri' ? COLIBRI_MIN_TIMEOUT_MS : spec.timeoutMs),
        signal: opts.signal,
        job: opts.job,
    };
    console.log(`[ai] ${providerId}: ${model}`);
    const execute = async () => {
        try {
            const result = await provider.generateText(cfg, req);
            return result.text;
        } catch (err) {
            if (err instanceof AiProviderError) {
                err.message = providerErrorMessage(err);
                throw err;
            }
            throw err;
        }
    };
    return withAiSlot(
        spec.jobClass,
        () => (isFallbackCascadeEnabled() ? runWithRetry(execute, opts.signal) : execute()),
        opts.signal
    );
}

async function callProviderJson<T>(
    providerId: ProviderId,
    opts: GenerateJsonOptions,
    spec: AiModelSpec,
    modelOverride?: string,
): Promise<T> {
    const provider = getProvider(providerId);
    if (!provider) throw new AiProviderError(trf('Unknown AI provider: {provider}', { provider: providerId }), undefined, 'config');
    if (!hasProviderKey(providerId)) {
        throw new AiProviderError(trf('No API key configured for {label}', { label: provider.info.label }), undefined, 'config');
    }
    assertCanSendImages(provider.info, opts.images);
    const savedCfg = getProviderConfig(providerId);
    // Colibrì serves one model and 'auto' means "the loaded one"; every other provider needs a chosen model
    const model = modelOverride || savedCfg.model || (providerId === 'colibri' ? 'auto' : undefined);
    if (!model && providerId !== 'companion') {
        throw new AiProviderError(tr('Pick a model in Settings'), undefined, 'config');
    }
    const cfg: ProviderConfig = {
        ...savedCfg,
        model: model || 'qwen2.5-1.5b-instruct',
    };
    const req: AiRequest & { job?: string } = {
        prompt: opts.prompt,
        system: opts.system,
        images: (opts.images || []).map(toAiImagePart),
        schema: opts.schema,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs ?? (providerId === 'colibri' ? COLIBRI_MIN_TIMEOUT_MS : spec.timeoutMs),
        signal: opts.signal,
        job: opts.job,
    };
    console.log(`[ai] ${providerId}: ${model}`);
    const execute = async () => {
        try {
            const result = await provider.generateJson(cfg, req);
            return result.json as T;
        } catch (err) {
            if (err instanceof AiProviderError) {
                err.message = providerErrorMessage(err);
                throw err;
            }
            throw err;
        }
    };
    return withAiSlot(
        spec.jobClass,
        () => (isFallbackCascadeEnabled() ? runWithRetry(execute, opts.signal) : execute()),
        opts.signal
    );
}

export async function generateText(opts: GenerateOptions): Promise<string> {
    const spec = AI_MODELS[opts.job];
    const isRoutable = ROUTABLE_JOBS.includes(opts.job as RouteJob);
    const hasImages = (opts.images || []).some(Boolean);
    let effectiveRoute = isRoutable ? getRoute(opts.job as RouteJob) : { provider: 'gemini' as ProviderId };

    if (isRoutable && effectiveRoute.provider !== 'gemini') {
        const prov = getProvider(effectiveRoute.provider);
        // When request has images and routed provider lacks vision, fall back to gemini route
        if (hasImages && (!prov || !prov.info.capabilities.vision)) {
            console.warn(`[ai] ${effectiveRoute.provider} lacks vision; falling back to gemini route`);
            effectiveRoute = { provider: 'gemini' };
        } else {
            return callProviderText(effectiveRoute.provider, opts, spec, opts.model || effectiveRoute.model);
        }
    }

    if (isFallbackCascadeEnabled() && isRoutable && effectiveRoute.provider === 'gemini') {
        // Tier 1: On-device (companion)
        if (!hasImages && isCompanionAvailable() && providerAllowedForJob('companion', opts.job as RouteJob)) {
            try {
                return await callProviderText('companion', opts, spec);
            } catch (err) {
                console.warn('[ai] cascade fallback from on-device:', err);
            }
        }
        // Tier 2: Local network (colibri)
        if (!hasImages && providerAllowedForJob('colibri', opts.job as RouteJob)) {
            const colibriBase = getProviderConfig('colibri').baseUrl;
            if (await isColibriAvailable(colibriBase)) {
                try {
                    return await callProviderText('colibri', opts, spec);
                } catch (err) {
                    console.warn('[ai] cascade fallback from colibri:', err);
                }
            }
        }
        // Tier 3: Cloud API (Gemini)
    }

    const model = opts.model || (isRoutable && effectiveRoute.provider === 'gemini' ? effectiveRoute.model : undefined) || spec.model;
    const data = await post(opts.job, model, buildBody(opts), opts.timeoutMs ?? spec.timeoutMs, opts.signal);
    return extractText(data);
}

export async function generateJson<T = unknown>(opts: GenerateJsonOptions): Promise<T> {
    const spec = AI_MODELS[opts.job];
    const isRoutable = ROUTABLE_JOBS.includes(opts.job as RouteJob);
    const hasImages = (opts.images || []).some(Boolean);
    let effectiveRoute = isRoutable ? getRoute(opts.job as RouteJob) : { provider: 'gemini' as ProviderId };

    if (isRoutable && effectiveRoute.provider !== 'gemini') {
        const prov = getProvider(effectiveRoute.provider);
        // When request has images and routed provider lacks vision, fall back to gemini route
        if (hasImages && (!prov || !prov.info.capabilities.vision)) {
            console.warn(`[ai] ${effectiveRoute.provider} lacks vision; falling back to gemini route`);
            effectiveRoute = { provider: 'gemini' };
        } else {
            return callProviderJson<T>(effectiveRoute.provider, opts, spec, opts.model || effectiveRoute.model);
        }
    }

    if (isFallbackCascadeEnabled() && isRoutable && effectiveRoute.provider === 'gemini') {
        // Tier 1: On-device (companion)
        if (!hasImages && isCompanionAvailable() && providerAllowedForJob('companion', opts.job as RouteJob)) {
            try {
                return await callProviderJson<T>('companion', opts, spec);
            } catch (err) {
                console.warn('[ai] cascade fallback from on-device:', err);
            }
        }
        // Tier 2: Local network (colibri)
        if (!hasImages && providerAllowedForJob('colibri', opts.job as RouteJob)) {
            const colibriBase = getProviderConfig('colibri').baseUrl;
            if (await isColibriAvailable(colibriBase)) {
                try {
                    return await callProviderJson<T>('colibri', opts, spec);
                } catch (err) {
                    console.warn('[ai] cascade fallback from colibri:', err);
                }
            }
        }
        // Tier 3: Cloud API (Gemini)
    }

    const model = opts.model || (isRoutable && effectiveRoute.provider === 'gemini' ? effectiveRoute.model : undefined) || spec.model;
    const data = await post(opts.job, model, buildBody(opts, opts.schema), opts.timeoutMs ?? spec.timeoutMs, opts.signal);
    let text = extractText(data);
    // JSON mode should make fences impossible; older models occasionally add
    // them anyway, and stripping costs nothing.
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
        return JSON.parse(text) as T;
    } catch (cause) {
        throw new AiResponseError(tr('Gemini returned malformed JSON'), { detail: text.slice(0, 500), cause });
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
