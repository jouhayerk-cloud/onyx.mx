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
import { colibriRealtimeBridge } from '../colibriRealtimeBridge';
import { SUPABASE_RELAY_URL } from '../../network/localMeshMap';

export const COLIBRI_INFO: ProviderInfo = {
    id: 'colibri',
    label: 'Colibrì Local MoE (Windows Desktop)',
    keyHint: 'No key required (Local NVMe Streaming)',
    needsBaseUrl: false,
    defaultBaseUrl: 'http://127.0.0.1:8082',
    capabilities: { vision: false, json: true, image: false, video: false },
    docsUrl: 'https://github.com/JustVugg/colibri',
};

export const DEFAULT_COLIBRI_MODEL = 'colibri-glm-5.2-moe';

export function shouldUseBridge(baseUrl: string): boolean {
    if (baseUrl === SUPABASE_RELAY_URL || baseUrl.startsWith('supabase://')) {
        return true;
    }
    if (typeof window !== 'undefined') {
        const isHttps = window.location.protocol === 'https:';
        const isLocalClient = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        // On HTTPS devices (like iPhone, second laptop visiting GitHub Pages or remote LAN),
        // direct HTTP to private IP fails due to iOS Safari Mixed Content & Private Network Access.
        if (isHttps && (!isLocalClient || baseUrl.includes('192.168.'))) {
            return true;
        }
    }
    return false;
}

export async function isColibriAvailable(baseUrl: string = COLIBRI_INFO.defaultBaseUrl || 'http://127.0.0.1:8082'): Promise<boolean> {
    if (shouldUseBridge(baseUrl)) {
        if (colibriRealtimeBridge.isHostOnline()) return true;
        return await colibriRealtimeBridge.waitForHost(1500);
    }

    const base = (baseUrl || 'http://127.0.0.1:8082').replace(/\/+$/, '');
    const checkEndpoint = async (path: string): Promise<boolean> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300);
        try {
            const res = await fetch(`${base}${path}`, {
                method: 'GET',
                signal: controller.signal,
            });
            return res.status === 200;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    };

    if (await checkEndpoint('/health')) {
        return true;
    }
    if (await checkEndpoint('/v1/models')) {
        return true;
    }

    // Fallback: check if host is online on the Supabase Realtime Bridge
    if (colibriRealtimeBridge.isHostOnline()) return true;
    return await colibriRealtimeBridge.waitForHost(1500);
}

function resolveBaseUrl(cfg: ProviderConfig): string {
    const raw = cfg.baseUrl || COLIBRI_INFO.defaultBaseUrl || 'http://127.0.0.1:8082';
    return raw.replace(/\/+$/, '');
}

export async function generateText(cfg: ProviderConfig, req: AiRequest): Promise<AiTextResult> {
    const baseUrl = resolveBaseUrl(cfg);
    const model = cfg.model || DEFAULT_COLIBRI_MODEL;
    const controller = new AbortController();
    let timedOut = false;
    const timer = req.timeoutMs ? setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, req.timeoutMs) : null;

    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) {
        messages.push({ role: 'system', content: req.system });
    }
    messages.push({ role: 'user', content: req.prompt });

    const body: Record<string, unknown> = {
        model,
        messages,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

    if (shouldUseBridge(baseUrl)) {
        try {
            const data = await colibriRealtimeBridge.request<any>('/v1/chat/completions', {
                method: 'POST',
                body,
                timeoutMs: req.timeoutMs,
                signal: req.signal,
            });
            const text = data.choices?.[0]?.message?.content ?? '';
            return {
                text,
                model: data.model || model,
                usage: {
                    inputTokens: data.usage?.prompt_tokens,
                    outputTokens: data.usage?.completion_tokens,
                },
            };
        } catch (err: any) {
            throw new AiProviderError(`Colibrì Realtime Bridge error: ${err?.message || err}`, undefined, 'server');
        } finally {
            if (timer) clearTimeout(timer);
            req.signal?.removeEventListener('abort', onAbort);
        }
    }

    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new AiProviderError(`Colibrì request failed: ${res.status} ${errText}`, res.status, 'server');
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        return {
            text,
            model: data.model || model,
            usage: {
                inputTokens: data.usage?.prompt_tokens,
                outputTokens: data.usage?.completion_tokens,
            },
        };
    } catch (err: any) {
        if (colibriRealtimeBridge.isHostOnline()) {
            try {
                const data = await colibriRealtimeBridge.request<any>('/v1/chat/completions', {
                    method: 'POST',
                    body,
                    timeoutMs: req.timeoutMs,
                    signal: req.signal,
                });
                const text = data.choices?.[0]?.message?.content ?? '';
                return {
                    text,
                    model: data.model || model,
                    usage: {
                        inputTokens: data.usage?.prompt_tokens,
                        outputTokens: data.usage?.completion_tokens,
                    },
                };
            } catch {
                // Ignore bridge fallback error and proceed to handle original error
            }
        }
        if (err instanceof AiProviderError) throw err;
        if (timedOut || err?.name === 'AbortError' || String(err).includes('aborted')) {
            throw new AiProviderError('Colibrì request timed out', undefined, 'timeout');
        }
        throw new AiProviderError(err?.message || 'Colibrì network error', undefined, 'server');
    } finally {
        if (timer) clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
    }
}

export async function generateJson(cfg: ProviderConfig, req: AiRequest): Promise<AiJsonResult> {
    const baseUrl = resolveBaseUrl(cfg);
    const model = cfg.model || DEFAULT_COLIBRI_MODEL;
    const controller = new AbortController();
    let timedOut = false;
    const timer = req.timeoutMs ? setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, req.timeoutMs) : null;

    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) {
        messages.push({ role: 'system', content: req.system });
    }
    let prompt = req.prompt;
    if (req.schema) {
        prompt = `${prompt}\n\nRespond with a JSON object conforming to this schema:\n${JSON.stringify(req.schema)}`;
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
        model,
        messages,
        response_format: { type: 'json_object' },
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

    if (shouldUseBridge(baseUrl)) {
        try {
            const data = await colibriRealtimeBridge.request<any>('/v1/chat/completions', {
                method: 'POST',
                body,
                timeoutMs: req.timeoutMs,
                signal: req.signal,
            });
            const text = data.choices?.[0]?.message?.content ?? '';
            let raw = text.trim();
            if (raw.startsWith('```')) {
                raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            }

            let json: unknown;
            try {
                json = JSON.parse(raw);
            } catch {
                throw new AiProviderError('Colibrì MoE did not return valid JSON', undefined, 'server');
            }

            return {
                text,
                json,
                model: data.model || model,
                usage: {
                    inputTokens: data.usage?.prompt_tokens,
                    outputTokens: data.usage?.completion_tokens,
                },
            };
        } catch (err: any) {
            throw new AiProviderError(`Colibrì Realtime Bridge JSON error: ${err?.message || err}`, undefined, 'server');
        } finally {
            if (timer) clearTimeout(timer);
            req.signal?.removeEventListener('abort', onAbort);
        }
    }

    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new AiProviderError(`Colibrì JSON request failed: ${res.status} ${errText}`, res.status, 'server');
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        let raw = text.trim();
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }

        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            throw new AiProviderError('Colibrì MoE did not return valid JSON', undefined, 'server');
        }

        return {
            text,
            json,
            model: data.model || model,
            usage: {
                inputTokens: data.usage?.prompt_tokens,
                outputTokens: data.usage?.completion_tokens,
            },
        };
    } catch (err: any) {
        if (colibriRealtimeBridge.isHostOnline()) {
            try {
                const data = await colibriRealtimeBridge.request<any>('/v1/chat/completions', {
                    method: 'POST',
                    body,
                    timeoutMs: req.timeoutMs,
                    signal: req.signal,
                });
                const text = data.choices?.[0]?.message?.content ?? '';
                let raw = text.trim();
                if (raw.startsWith('```')) {
                    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
                }

                let json: unknown;
                try {
                    json = JSON.parse(raw);
                } catch {
                    throw new AiProviderError('Colibrì MoE did not return valid JSON', undefined, 'server');
                }

                return {
                    text,
                    json,
                    model: data.model || model,
                    usage: {
                        inputTokens: data.usage?.prompt_tokens,
                        outputTokens: data.usage?.completion_tokens,
                    },
                };
            } catch {
                // Ignore bridge fallback error and proceed to handle original error
            }
        }
        if (err instanceof AiProviderError) throw err;
        if (timedOut || err?.name === 'AbortError' || String(err).includes('aborted')) {
            throw new AiProviderError('Colibrì request timed out', undefined, 'timeout');
        }
        throw new AiProviderError(err?.message || 'Colibrì network error', undefined, 'server');
    } finally {
        if (timer) clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
    }
}

export async function streamChat(
    cfg: ProviderConfig,
    req: ChatRequest,
    onToken?: (token: string) => void
): Promise<ChatResult> {
    const baseUrl = resolveBaseUrl(cfg);
    const model = cfg.model || DEFAULT_COLIBRI_MODEL;

    const messages: Array<Record<string, unknown>> = [];
    if (req.system) {
        messages.push({ role: 'system', content: req.system });
    }
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

    const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
    };
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

    if (shouldUseBridge(baseUrl)) {
        try {
            const result = await colibriRealtimeBridge.streamChat(body, {
                onToken,
                timeoutMs: req.timeoutMs,
                signal: req.signal,
            });
            return {
                text: result.text || '',
                toolCalls: [],
                model: result.model || model,
            };
        } catch (err: any) {
            throw new AiProviderError(`Colibrì Realtime stream error: ${err?.message || err}`, undefined, 'server');
        }
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = req.timeoutMs ? setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, req.timeoutMs) : null;

    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });

    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new AiProviderError(`Colibrì stream failed: ${res.status} ${errText}`, res.status, 'server');
        }

        if (!res.body) {
            throw new AiProviderError('No response body returned from Colibrì stream', undefined, 'server');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedText = '';
        let resolvedModel = model;

        interface ToolCallAcc {
            id: string;
            name: string;
            arguments: string;
        }
        const toolCallsMap = new Map<number, ToolCallAcc>();

        const processLine = (lineStr: string) => {
            const trimmed = lineStr.trim();
            if (!trimmed || trimmed.startsWith(':')) return;
            if (trimmed.startsWith('data:')) {
                const dataStr = trimmed.slice(5).trim();
                if (dataStr === '[DONE]') return;
                try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.model) resolvedModel = parsed.model;
                    const choice = parsed.choices?.[0];
                    const delta = choice?.delta;
                    if (delta) {
                        if (delta.content) {
                            accumulatedText += delta.content;
                            onToken?.(delta.content);
                        }
                        if (Array.isArray(delta.tool_calls)) {
                            for (const tc of delta.tool_calls) {
                                const idx = typeof tc.index === 'number' ? tc.index : 0;
                                let acc = toolCallsMap.get(idx);
                                if (!acc) {
                                    acc = {
                                        id: tc.id || `call_${idx}_${Date.now()}`,
                                        name: tc.function?.name || '',
                                        arguments: '',
                                    };
                                    toolCallsMap.set(idx, acc);
                                }
                                if (tc.id) acc.id = tc.id;
                                if (tc.function?.name) acc.name += tc.function.name;
                                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
                            }
                        }
                    }
                } catch {
                    // Ignore malformed chunk
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
                for (const line of lines) {
                    processLine(line);
                }
            }
            if (buffer.trim()) {
                processLine(buffer);
            }
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
            toolCalls.push({
                id: acc.id,
                name: acc.name,
                args: parsedArgs,
            });
        }

        return {
            text: accumulatedText,
            toolCalls,
            model: resolvedModel,
        };
    } catch (err: any) {
        if (colibriRealtimeBridge.isHostOnline()) {
            try {
                const result = await colibriRealtimeBridge.streamChat(body, {
                    onToken,
                    timeoutMs: req.timeoutMs,
                    signal: req.signal,
                });
                return {
                    text: result.text || '',
                    toolCalls: [],
                    model: result.model || model,
                };
            } catch {
                // Ignore bridge fallback error and proceed to handle original error
            }
        }
        if (err instanceof AiProviderError) throw err;
        if (timedOut || err?.name === 'AbortError' || String(err).includes('aborted')) {
            throw new AiProviderError('Colibrì stream timed out', undefined, 'timeout');
        }
        throw new AiProviderError(err?.message || 'Colibrì stream network error', undefined, 'server');
    } finally {
        if (timer) clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
    }
}

export interface ColibriProviderImpl extends AiProviderImpl {
    streamChat(
        cfg: ProviderConfig,
        req: ChatRequest,
        onToken?: (token: string) => void
    ): Promise<ChatResult>;
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
        const baseUrl = resolveBaseUrl(cfg);

        // If explicitly configured for Supabase Relay or remote HTTPS device, run bridge test directly
        if (shouldUseBridge(baseUrl)) {
            const bridgeRes = await colibriRealtimeBridge.test();
            return {
                ok: bridgeRes.ok,
                message: bridgeRes.message,
            };
        }

        const start = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
            const res = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);

            const latency = Math.round(performance.now() - start);

            if (res && res.status === 200) {
                const data = await res.json().catch(() => ({}));
                const isRelay = Boolean(data.relayGateway?.active || data.relay);
                const engine = data.engine || 'Colibrì MoE';
                const nvmeSpeed = data.telemetry?.nvmeReadMBps ? ` • ${data.telemetry.nvmeReadMBps} MB/s NVMe` : '';
                
                if (isRelay) {
                    const upstream = data.relayGateway?.upstreamHost || 'LAN Upstream';
                    return {
                        ok: true,
                        message: `Connected via LAN Mesh Relay (Upstream: ${upstream}) [online] • Latency: ${latency}ms${nvmeSpeed}`,
                    };
                }
                return {
                    ok: true,
                    message: `Connected to ${engine} (${baseUrl}) [online] • Latency: ${latency}ms${nvmeSpeed} • Streaming Ready`,
                };
            }

            // Fallback check /v1/models
            const modelsRes = await fetch(`${baseUrl}/v1/models`, {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);

            const latencyModels = Math.round(performance.now() - start);

            if (modelsRes && modelsRes.status === 200) {
                const data = await modelsRes.json().catch(() => ({}));
                const count = Array.isArray(data?.data) ? data.data.length : 3;
                return {
                    ok: true,
                    message: `Connected to Colibrì (${baseUrl}) [online] • ${count} models ready • Latency: ${latencyModels}ms`,
                };
            }

            // If direct endpoint failed, check if Host is online via Supabase Realtime Relay
            if (colibriRealtimeBridge.isHostOnline()) {
                const bridgeRes = await colibriRealtimeBridge.test();
                if (bridgeRes.ok) {
                    return {
                        ok: true,
                        message: `${bridgeRes.message} (Direct LAN ${baseUrl} unreachable; auto-routed via Supabase Relay)`,
                    };
                }
            }

            return {
                ok: false,
                message: `Colibrì daemon unreachable on ${baseUrl}. Start it via: powershell -ExecutionPolicy Bypass -File .\\scripts\\start-colibri-daemon.ps1 -DevMock (or select Supabase Realtime Relay preset on iPhone/Safari).`,
            };
        } catch (err: any) {
            if (colibriRealtimeBridge.isHostOnline()) {
                const bridgeRes = await colibriRealtimeBridge.test();
                if (bridgeRes.ok) {
                    return {
                        ok: true,
                        message: `${bridgeRes.message} (Direct LAN failed; auto-routed via Supabase Relay)`,
                    };
                }
            }
            return {
                ok: false,
                message: `Connection error: ${err?.message || 'Unreachable on ' + baseUrl}`,
            };
        } finally {
            clearTimeout(timer);
        }
    },

    async listModels(cfg: ProviderConfig): Promise<string[]> {
        const baseUrl = resolveBaseUrl(cfg);

        if (shouldUseBridge(baseUrl)) {
            try {
                const data = await colibriRealtimeBridge.request<any>('/v1/models', { timeoutMs: 3000 });
                if (Array.isArray(data?.data) && data.data.length > 0) {
                    return data.data.map((m: any) => m.id || m.name).filter(Boolean);
                }
            } catch {
                /* ignore fallback */
            }
            return ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'];
        }

        try {
            const res = await fetch(`${baseUrl}/v1/models`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.data) && data.data.length > 0) {
                    return data.data.map((m: any) => m.id || m.name).filter(Boolean);
                }
            }
        } catch {
            // Check bridge if direct fetch failed
            if (colibriRealtimeBridge.isHostOnline()) {
                try {
                    const data = await colibriRealtimeBridge.request<any>('/v1/models', { timeoutMs: 3000 });
                    if (Array.isArray(data?.data) && data.data.length > 0) {
                        return data.data.map((m: any) => m.id || m.name).filter(Boolean);
                    }
                } catch {
                    /* ignore */
                }
            }
        }
        return ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'];
    },
};

export default colibriProvider;
