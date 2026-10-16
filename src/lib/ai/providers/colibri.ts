import {
    AiProviderError,
    type AiJsonResult,
    type AiProviderImpl,
    type AiRequest,
    type AiTextResult,
    type ChatRequest,
    type ChatResult,
    type ChatToolCall,
    type ProviderConfig,
    type ProviderInfo,
} from './types';
import { tr, trf } from '../../i18n';
import { COLIBRI_AUTO_MODEL, COLIBRI_DEFAULT_MODEL_ID } from '../models';

/**
 * Colibrì (https://github.com/JustVugg/colibri) as an AI provider.
 *
 * The contract is the real server's (colibri v2, `coli web` / `coli serve`), measured on the owner's PC:
 * - OpenAI API at http://127.0.0.1:8000/v1, text only (input_modalities ["text"]).
 * - It serves ONE model at a time. GET /v1/models returns that model (for example "qwen3.6-colibri"), and a request
 *   naming any other model id fails with 404 model_not_found. So the model list is read at runtime and 'auto' only
 *   means "the loaded model".
 * - About 0.5 tokens per second on this PC: every call here uses a long timeout, and the chat UI warns about it.
 * - No /v1/embeddings endpoint (see src/lib/embeddings/colibriBridge.ts).
 * - The browser must be allowed by the server's CORS list: see docs/ai/COLIBRI_WINDOWS_SETUP.md.
 *
 * The Supabase Realtime relay that used to carry iPhone traffic is disabled until it is secured
 * (colibriRealtimeBridge.ts is inert), so there is no fallback to it: Colibrì works only when the server is
 * reachable directly from this browser.
 */

export const COLIBRI_DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

export const COLIBRI_INFO: ProviderInfo = {
    id: 'colibri',
    label: 'Colibrì (local model, Windows)',
    keyHint: 'No key needed (runs on this PC)',
    needsBaseUrl: false,
    defaultBaseUrl: COLIBRI_DEFAULT_BASE_URL,
    // Text only: never route image jobs (segmentation, vision) here. routing.ts and client.ts check this flag.
    capabilities: { vision: false, json: true, image: false, video: false },
    docsUrl: 'https://github.com/JustVugg/colibri',
};

export const DEFAULT_COLIBRI_MODEL = COLIBRI_AUTO_MODEL;

/** Generation is about 0.5 tokens per second here, so no job timeout from models.ts (30 to 60 s) can ever fit. */
export const COLIBRI_MIN_TIMEOUT_MS = 600_000;
/** How long the "is it running?" probes wait before the call fails fast with a clear message. */
const PROBE_TIMEOUT_MS = 2_000;
const MODELS_TTL_MS = 15_000;
const AVAILABILITY_TTL_MS = 4_000;

const isAutoModel = (m: string | undefined): boolean => !m || m === 'auto' || m === 'colibri-auto';

/**
 * Picks the model id to send. `liveModels` is what GET /v1/models returned. The server rejects every other id, so a
 * saved id that is not loaded (an old choice, or the other of the two models on disk) falls back to the loaded one.
 * Pure: no network.
 */
export function resolveColibriModel(
    requestedModel: string | undefined,
    _taskContext?: { job?: string; isJson?: boolean; isChat?: boolean; prompt?: string },
    liveModels?: readonly string[],
): string {
    const live = (liveModels || []).filter(m => !isAutoModel(m));
    if (live.length > 0) {
        return !isAutoModel(requestedModel) && live.includes(requestedModel as string) ? (requestedModel as string) : live[0];
    }
    return isAutoModel(requestedModel) ? COLIBRI_DEFAULT_MODEL_ID : (requestedModel as string);
}

/** The relay is disabled: Colibrì is always called directly. Kept because other modules import it. */
export function shouldUseBridge(_baseUrl: string): boolean {
    return false;
}

function resolveBaseUrl(cfg: ProviderConfig | undefined): string {
    const raw = (cfg?.baseUrl || COLIBRI_DEFAULT_BASE_URL).trim();
    // a stale 'supabase://' preset from the relay days points nowhere now
    return (raw.startsWith('supabase://') ? COLIBRI_DEFAULT_BASE_URL : raw).replace(/\/+$/, '');
}

function authHeaders(cfg: ProviderConfig | undefined, json: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (cfg?.key) h.Authorization = `Bearer ${cfg.key}`;
    return h;
}

const isLoopback = (url: string): boolean => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(url);

/** Why a direct call from this page cannot work at all, or null. Saves a pointless wait. */
export function colibriBlockedReason(baseUrl: string): string | null {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
        return tr('Colibrì runs only on the Windows PC; it is not available on iPhone or iPad');
    }
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && baseUrl.startsWith('http:') && !isLoopback(baseUrl)) {
        return tr('This page is HTTPS, so the browser blocks a plain HTTP address on the network. Use http://127.0.0.1:8000 on the PC that runs Colibrì');
    }
    return null;
}

function notReachableMessage(baseUrl: string): string {
    return `${trf('Colibrì is not reachable at {url}', { url: baseUrl })}. ${tr('Start it on this PC (START-HERE.bat or "coli web"). If it is running, allow this site in its CORS list with --cors-origin')}`;
}

async function probe(url: string, headers: Record<string, string>, timeoutMs = PROBE_TIMEOUT_MS): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { method: 'GET', headers, signal: controller.signal });
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

let modelsCache: { baseUrl: string; ids: string[]; at: number } | null = null;
let lastOkAt = 0;
const SEEN_TTL_MS = 10 * 60_000;

/** True when a probe of the server succeeded in the last ten minutes (providerKeys.ts uses it for "configured"). */
export function colibriSeenRecently(): boolean {
    return lastOkAt > 0 && Date.now() - lastOkAt < SEEN_TTL_MS;
}

/** Drops the cached model list (after a 404 model_not_found, or when the user changes the address). */
export function resetColibriCache(): void {
    modelsCache = null;
    availabilityCache = null;
}

/**
 * The ids GET /v1/models reports (normally exactly one), cached for a few seconds. Returns null when the server
 * cannot be reached, which is also the fast health check: it fails in two seconds, not after the job timeout.
 */
export async function fetchColibriModels(cfg?: ProviderConfig, force = false): Promise<string[] | null> {
    const baseUrl = resolveBaseUrl(cfg);
    const now = Date.now();
    if (!force && modelsCache && modelsCache.baseUrl === baseUrl && now - modelsCache.at < MODELS_TTL_MS) return modelsCache.ids;
    if (colibriBlockedReason(baseUrl)) return null;
    const res = await probe(`${baseUrl}/v1/models`, authHeaders(cfg, false));
    if (!res || !res.ok) return null;
    try {
        const data = await res.json();
        const ids: string[] = Array.isArray(data?.data)
            ? data.data.map((m: any) => (typeof m?.id === 'string' ? m.id : '')).filter(Boolean)
            : [];
        modelsCache = { baseUrl, ids, at: now };
        lastOkAt = now;
        return ids;
    } catch {
        return null;
    }
}

let availabilityCache: { baseUrl: string; value: boolean; at: number } | null = null;

/** True when the Colibrì server answers /health or /v1/models. No relay fallback. */
export async function isColibriAvailable(baseUrl: string = COLIBRI_DEFAULT_BASE_URL): Promise<boolean> {
    const base = resolveBaseUrl({ key: '', baseUrl });
    if (colibriBlockedReason(base)) return false;
    const now = Date.now();
    if (availabilityCache && availabilityCache.baseUrl === base && now - availabilityCache.at < AVAILABILITY_TTL_MS) return availabilityCache.value;
    let ok = false;
    const health = await probe(`${base}/health`, {});
    if (health && health.status === 200) ok = true;
    else {
        const models = await probe(`${base}/v1/models`, {});
        ok = Boolean(models && models.status === 200);
    }
    availabilityCache = { baseUrl: base, value: ok, at: Date.now() };
    if (ok) lastOkAt = Date.now();
    return ok;
}

/** What /health really reports. Nothing here is invented: a field the server does not send stays undefined. */
export interface ColibriStatus {
    ok: boolean;
    baseUrl: string;
    latencyMs?: number;
    modelId?: string;
    arch?: string;
    active?: number;
    queued?: number;
    completed?: number;
    failed?: number;
    inputModalities?: string[];
    message: string;
}

export async function getColibriStatus(cfg?: ProviderConfig): Promise<ColibriStatus> {
    const baseUrl = resolveBaseUrl(cfg);
    const blocked = colibriBlockedReason(baseUrl);
    if (blocked) return { ok: false, baseUrl, message: blocked };
    const start = performance.now();
    const res = await probe(`${baseUrl}/health`, authHeaders(cfg, false), 3_000);
    if (!res || res.status !== 200) {
        const models = await fetchColibriModels(cfg, true);
        if (!models) return { ok: false, baseUrl, message: notReachableMessage(baseUrl) };
        return { ok: true, baseUrl, latencyMs: Math.round(performance.now() - start), modelId: models[0], message: tr('Connected') };
    }
    const latencyMs = Math.round(performance.now() - start);
    const h: any = await res.json().catch(() => ({}));
    const models = await fetchColibriModels(cfg, true);
    const sched = h?.scheduler || {};
    return {
        ok: true,
        baseUrl,
        latencyMs,
        modelId: models?.[0],
        arch: typeof h?.arch === 'string' ? h.arch : undefined,
        active: typeof sched.active === 'number' ? sched.active : undefined,
        queued: typeof sched.queued === 'number' ? sched.queued : undefined,
        completed: typeof sched.completed === 'number' ? sched.completed : undefined,
        failed: typeof sched.failed === 'number' ? sched.failed : undefined,
        inputModalities: Array.isArray(h?.input_modalities) ? h.input_modalities : undefined,
        message: tr('Connected'),
    };
}

/** Tokens per second of the last non-streaming answer on this browser: measured here, or undefined. Never a constant. */
let lastSpeed: { tokensPerSecond: number; at: number } | null = null;
export function getLastColibriSpeed(): { tokensPerSecond: number; at: number } | null {
    return lastSpeed;
}
function noteSpeed(outputTokens: number | undefined, startedAt: number): void {
    const seconds = (performance.now() - startedAt) / 1000;
    if (outputTokens && outputTokens > 0 && seconds > 0) lastSpeed = { tokensPerSecond: Math.round((outputTokens / seconds) * 100) / 100, at: Date.now() };
}

interface Prepared {
    baseUrl: string;
    model: string;
}

/** Fast health check plus model resolution. Throws a clear, immediate error when the server is down. */
async function prepare(cfg: ProviderConfig): Promise<Prepared> {
    const baseUrl = resolveBaseUrl(cfg);
    const blocked = colibriBlockedReason(baseUrl);
    if (blocked) throw new AiProviderError(blocked, undefined, 'config');
    const live = await fetchColibriModels(cfg);
    if (live === null) throw new AiProviderError(notReachableMessage(baseUrl), undefined, 'config');
    if (live.length === 0) throw new AiProviderError(tr('Colibrì is running but has no model loaded'), undefined, 'config');
    return { baseUrl, model: resolveColibriModel(cfg.model, undefined, live) };
}

/** Maps a non-2xx answer of the Colibrì server to a typed error. */
async function httpError(res: Response, what: string): Promise<AiProviderError> {
    const text = await res.text().catch(() => '');
    let detail = text;
    let code = '';
    try {
        const j = JSON.parse(text);
        detail = j?.error?.message || text;
        code = j?.error?.code || '';
    } catch { /* keep raw */ }
    detail = String(detail).slice(0, 200);
    if (res.status === 404 && code === 'model_not_found') {
        resetColibriCache();
        return new AiProviderError(`${tr('The model is not loaded in Colibrì')}: ${detail}`, 404, 'config');
    }
    if (res.status === 401 || res.status === 403) return new AiProviderError(detail, res.status, 'auth');
    if (res.status === 429) return new AiProviderError(tr('Colibrì is busy (queue full or waited too long); try again'), 429, 'rate');
    if (res.status === 400) return new AiProviderError(detail || tr('Bad request'), 400, 'bad_request');
    return new AiProviderError(`Colibrì ${what}: HTTP ${res.status}${detail ? ` ${detail}` : ''}`, res.status, 'server');
}

/** Wraps fetch with the long timeout, the caller's signal, and the typed error mapping. */
async function callServer<T>(
    cfg: ProviderConfig,
    req: { timeoutMs?: number; signal?: AbortSignal },
    run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    if (req.signal?.aborted) throw new AiProviderError(tr('Cancelled'), undefined, 'timeout');
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = Math.max(req.timeoutMs ?? 0, COLIBRI_MIN_TIMEOUT_MS);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });
    try {
        return await run(controller.signal);
    } catch (err: any) {
        if (err instanceof AiProviderError) throw err;
        if (req.signal?.aborted) throw new AiProviderError(tr('Cancelled'), undefined, 'timeout');
        if (timedOut) throw new AiProviderError(tr('Colibrì did not answer within the timeout'), undefined, 'timeout');
        if (err?.name === 'AbortError') throw new AiProviderError(tr('Cancelled'), undefined, 'timeout');
        // a TypeError from fetch: the daemon died mid-call or the browser blocked it (CORS)
        throw new AiProviderError(notReachableMessage(resolveBaseUrl(cfg)), undefined, 'config');
    } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
    }
}

const stripFence = (text: string): string => {
    let raw = text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return raw;
};

/** Text-only provider: a request that carries images is a caller bug, so say so instead of dropping them silently. */
function refuseImages(req: AiRequest): void {
    if (req.images && req.images.length > 0) {
        throw new AiProviderError(tr('Colibrì is text only and cannot read images; choose another provider for this job'), undefined, 'config');
    }
}

async function completion(
    cfg: ProviderConfig,
    req: AiRequest,
    body: Record<string, unknown>,
    what: string,
): Promise<{ text: string; model: string; usage: AiTextResult['usage'] }> {
    const { baseUrl, model } = await prepare(cfg);
    const payload = { ...body, model };
    const startedAt = performance.now();
    return callServer(cfg, req, async (signal) => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: authHeaders(cfg, true),
            body: JSON.stringify(payload),
            signal,
        });
        if (!res.ok) throw await httpError(res, what);
        const data = await res.json();
        const text: string = data.choices?.[0]?.message?.content ?? '';
        noteSpeed(data.usage?.completion_tokens, startedAt);
        return {
            text,
            model: data.model || model,
            usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
        };
    });
}

export async function generateText(cfg: ProviderConfig, req: AiRequest & { job?: string }): Promise<AiTextResult> {
    refuseImages(req);
    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });
    const body: Record<string, unknown> = { messages };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    return completion(cfg, req, body, 'request failed');
}

export async function generateJson(cfg: ProviderConfig, req: AiRequest & { job?: string }): Promise<AiJsonResult> {
    refuseImages(req);
    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    let prompt = req.prompt;
    if (req.schema) prompt = `${prompt}\n\nRespond with a JSON object conforming to this schema:\n${JSON.stringify(req.schema)}`;
    messages.push({ role: 'user', content: prompt });
    const body: Record<string, unknown> = { messages, response_format: { type: 'json_object' } };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    const out = await completion(cfg, req, body, 'JSON request failed');
    let json: unknown;
    try {
        json = JSON.parse(stripFence(out.text));
    } catch {
        throw new AiProviderError(tr('Colibrì did not return valid JSON'), undefined, 'server');
    }
    return { ...out, json };
}

export async function streamChat(
    cfg: ProviderConfig,
    req: ChatRequest & { job?: string },
    onToken?: (token: string) => void,
): Promise<ChatResult> {
    const { baseUrl, model } = await prepare(cfg);

    const messages: Array<Record<string, unknown>> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const turn of req.turns) {
        if (turn.role === 'user') {
            messages.push({ role: 'user', content: turn.text });
        } else if (turn.role === 'assistant') {
            const calls = turn.toolCalls || [];
            const msg: Record<string, unknown> = {
                role: 'assistant',
                content: turn.text ? turn.text : (calls.length > 0 ? null : ''),
            };
            if (calls.length > 0) {
                msg.tool_calls = calls.map(c => ({
                    id: c.id,
                    type: 'function',
                    function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
                }));
            }
            messages.push(msg);
        } else if (turn.role === 'tool') {
            messages.push({
                role: 'tool',
                tool_call_id: turn.callId,
                content: typeof turn.result === 'string' ? turn.result : JSON.stringify(turn.result) ?? 'null',
            });
        }
    }

    const body: Record<string, unknown> = { model, messages, stream: true };
    if (req.tools && req.tools.length > 0) {
        body.tools = req.tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters ?? { type: 'object', properties: {} },
            },
        }));
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

    return callServer(cfg, req, async (signal) => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: authHeaders(cfg, true),
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) throw await httpError(res, 'stream failed');
        if (!res.body) throw new AiProviderError(tr('Colibrì sent no response body'), undefined, 'server');

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedText = '';
        let resolvedModel = model;

        interface ToolCallAcc { id: string; name: string; arguments: string }
        const toolCallsMap = new Map<number, ToolCallAcc>();

        const processLine = (lineStr: string) => {
            const trimmed = lineStr.trim();
            if (!trimmed || trimmed.startsWith(':')) return;
            if (!trimmed.startsWith('data:')) return;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') return;
            let parsed: any;
            try {
                parsed = JSON.parse(dataStr);
            } catch {
                return;   // malformed chunk
            }
            if (parsed?.error) {
                throw new AiProviderError(String(parsed.error?.message || parsed.error).slice(0, 200), undefined, 'server');
            }
            if (parsed.model) resolvedModel = parsed.model;
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) return;
            if (delta.content) {
                accumulatedText += delta.content;
                onToken?.(delta.content);
            }
            if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === 'number' ? tc.index : 0;
                    let acc = toolCallsMap.get(idx);
                    if (!acc) {
                        acc = { id: tc.id || `call_${idx}_${Date.now()}`, name: tc.function?.name || '', arguments: '' };
                        toolCallsMap.set(idx, acc);
                    }
                    if (tc.id) acc.id = tc.id;
                    if (tc.function?.name) acc.name += tc.function.name;
                    if (tc.function?.arguments) acc.arguments += tc.function.arguments;
                }
            }
        };

        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) processLine(line);
            }
            if (buffer.trim()) processLine(buffer);
        } finally {
            reader.releaseLock();
        }

        const toolCalls: ChatToolCall[] = [];
        for (const acc of toolCallsMap.values()) {
            if (!acc.name) continue;
            let parsedArgs: Record<string, unknown> = {};
            try {
                parsedArgs = acc.arguments ? JSON.parse(acc.arguments) : {};
            } catch {
                parsedArgs = {};
            }
            toolCalls.push({ id: acc.id, name: acc.name, args: parsedArgs });
        }
        return { text: accumulatedText, toolCalls, model: resolvedModel };
    });
}

export interface ColibriProviderImpl extends AiProviderImpl {
    streamChat(cfg: ProviderConfig, req: ChatRequest, onToken?: (token: string) => void): Promise<ChatResult>;
}

export const colibriProvider: ColibriProviderImpl = {
    info: COLIBRI_INFO,

    generateText,
    generateJson,

    async chat(cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult> {
        return streamChat(cfg, req);
    },

    streamChat,

    async test(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
        try {
            resetColibriCache();
            const st = await getColibriStatus(cfg);
            if (!st.ok) return { ok: false, message: st.message };
            const parts = [
                `${tr('Connected to Colibrì')} (${st.baseUrl})`,
                st.modelId ? `${tr('model')}: ${st.modelId}` : tr('no model loaded'),
                st.latencyMs !== undefined ? `${tr('latency')}: ${st.latencyMs} ms` : '',
                st.queued ? `${tr('queued')}: ${st.queued}` : '',
            ].filter(Boolean);
            return { ok: Boolean(st.modelId), message: parts.join(' • ') };
        } catch (err: any) {
            return { ok: false, message: `${tr('Connection error')}: ${err?.message || resolveBaseUrl(cfg)}` };
        }
    },

    /** 'auto' (the loaded model) plus whatever GET /v1/models reports. Just 'auto' while the server is down. */
    async listModels(cfg: ProviderConfig): Promise<string[]> {
        const live = (await fetchColibriModels(cfg, true)) || [];
        return [COLIBRI_AUTO_MODEL, ...live.filter(m => !isAutoModel(m))];
    },
};

export default colibriProvider;
