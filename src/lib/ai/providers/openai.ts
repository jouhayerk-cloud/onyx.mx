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

export const OPENAI_INFO: ProviderInfo = {
    id: 'openai',
    label: 'OpenAI',
    keyHint: 'sk-...',
    needsBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: { vision: true, json: true, image: false, video: false },
    docsUrl: 'https://platform.openai.com',
};

const sanitize = (text: string, secretKey?: string): string => {
    if (!secretKey) return text;
    return text.split(secretKey).join('[REDACTED]');
};

async function parseOpenAiError(res: Response, secretKey?: string): Promise<never> {
    const status = res.status;
    let raw = '';
    try {
        raw = await res.text();
    } catch {
        /* empty */
    }

    let detail = raw;
    try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.message || raw;
    } catch {
        /* keep raw text */
    }

    detail = sanitize(detail, secretKey);

    if (status === 401 || status === 403) {
        throw new AiProviderError('API key is invalid or unauthorized', status, 'auth');
    }
    if (status === 429) {
        throw new AiProviderError('Rate limit exceeded; try again in a minute', status, 'rate');
    }
    if (status === 400 || status === 404) {
        const message = detail ? `${detail}` : (status === 404 ? 'Not found: check the model name and the base URL (it should end in /v1)' : 'Bad request');
        throw new AiProviderError(message, status, 'bad_request');
    }
    if (status >= 500) {
        throw new AiProviderError(`AI provider server error (${status})`, status, 'server');
    }
    throw new AiProviderError(detail || `AI provider request failed (${status})`, status, 'server');
}

function handleFetchFailure(err: unknown, timedOut: boolean): never {
    if (err instanceof AiProviderError) throw err;
    const isAbort = (err as any)?.name === 'AbortError' || String(err).includes('aborted');
    if (isAbort || timedOut) {
        throw new AiProviderError('AI request timed out', undefined, 'timeout');
    }
    throw new AiProviderError('The browser blocked the call (CORS or network error)', undefined, 'cors');
}

function resolveBaseUrl(info: ProviderInfo, cfg: ProviderConfig): string {
    if (info.needsBaseUrl && !cfg.baseUrl) {
        throw new AiProviderError('Base URL is required for OpenAI-compatible provider', undefined, 'config');
    }
    const raw = cfg.baseUrl || info.defaultBaseUrl || 'https://api.openai.com/v1';
    return raw.replace(/\/+$/, '');
}

function buildHeaders(key?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (key) {
        headers['Authorization'] = `Bearer ${key}`;
    }
    return headers;
}

function buildMessages(req: AiRequest, promptOverride?: string) {
    const textPart = promptOverride !== undefined ? promptOverride : req.prompt;
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: textPart },
        ...(req.images || []).map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
    ];

    const messages: Array<{ role: string; content: any }> = [];
    if (req.system) {
        messages.push({ role: 'system', content: req.system });
    }
    messages.push({ role: 'user', content: userContent });
    return messages;
}

function parseJsonContent(rawContent: string): unknown {
    let cleaned = (rawContent || '').trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    try {
        return JSON.parse(cleaned);
    } catch (cause) {
        throw new AiProviderError('AI provider returned malformed JSON', undefined, 'server');
    }
}

/** Reasoning models (DeepSeek-R1, Qwen3 on Ollama) can inline their thoughts in content. */
let callCounter = 0;
const nextCallId = () => `call_${++callCounter}`;

function stripThink(text: string): string {
    let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (/<\/think>/i.test(out)) out = out.replace(/^[\s\S]*?<\/think>/i, '');
    return out === text ? text : out.trim();
}

function stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') return result;
    return JSON.stringify(result) ?? 'null';
}

function buildChatMessages(req: ChatRequest) {
    const messages: Array<Record<string, unknown>> = [];
    if (req.system) {
        messages.push({ role: 'system', content: req.system });
    }
    for (const turn of req.turns) {
        if (turn.role === 'user') {
            messages.push({ role: 'user', content: turn.text });
        } else if (turn.role === 'assistant') {
            const calls = turn.toolCalls || [];
            const message: Record<string, unknown> = {
                role: 'assistant',
                content: turn.text ? turn.text : (calls.length > 0 ? null : ''),
            };
            if (calls.length > 0) {
                message.tool_calls = calls.map(call => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
                }));
            }
            messages.push(message);
        } else {
            messages.push({
                role: 'tool',
                tool_call_id: turn.callId,
                content: stringifyToolResult(turn.result),
            });
        }
    }
    return messages;
}

function buildChatTools(req: ChatRequest) {
    return (req.tools || []).map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters ?? { type: 'object', properties: {} },
        },
    }));
}

/** OpenAI sends arguments as a JSON string, Ollama often as an object; anything unreadable becomes {}. */
function parseToolArguments(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

function parseChatMessage(message: any): { text: string; toolCalls: ChatToolCall[] } {
    const content = message?.content;
    let text = '';
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('');
    }

    const toolCalls: ChatToolCall[] = [];
    const rawCalls: any[] = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    rawCalls.forEach((call, index) => {
        const name = call?.function?.name;
        if (typeof name !== 'string' || !name) return;
        toolCalls.push({
            id: typeof call.id === 'string' && call.id ? call.id : nextCallId(),
            name,
            args: parseToolArguments(call.function.arguments),
        });
    });

    return { text: stripThink(text), toolCalls };
}

export function createOpenAiProvider(info: ProviderInfo): AiProviderImpl {
    return {
        info,

        async generateText(cfg: ProviderConfig, req: AiRequest): Promise<AiTextResult> {
            if (!cfg.model) {
                throw new AiProviderError('Pick a model in Settings', undefined, 'config');
            }
            if (!info.needsBaseUrl && !cfg.key) {
                throw new AiProviderError('API key is required for OpenAI', undefined, 'auth');
            }

            const baseUrl = resolveBaseUrl(info, cfg);
            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, req.timeoutMs);

            const onExternalAbort = () => controller.abort();
            req.signal?.addEventListener('abort', onExternalAbort, { once: true });

            const body: Record<string, unknown> = {
                model: cfg.model,
                messages: buildMessages(req),
            };
            if (req.temperature !== undefined) body.temperature = req.temperature;
            if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: buildHeaders(cfg.key),
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    await parseOpenAiError(res, cfg.key);
                }

                const data = await res.json();
                const text = data.choices?.[0]?.message?.content ?? '';
                return {
                    text,
                    model: data.model || cfg.model || '',
                    usage: {
                        inputTokens: data.usage?.prompt_tokens,
                        outputTokens: data.usage?.completion_tokens,
                    },
                };
            } catch (err) {
                handleFetchFailure(err, timedOut);
            } finally {
                clearTimeout(timer);
                req.signal?.removeEventListener('abort', onExternalAbort);
            }
        },

        async generateJson(cfg: ProviderConfig, req: AiRequest): Promise<AiJsonResult> {
            if (!cfg.model) {
                throw new AiProviderError('Pick a model in Settings', undefined, 'config');
            }
            if (!info.needsBaseUrl && !cfg.key) {
                throw new AiProviderError('API key is required for OpenAI', undefined, 'auth');
            }

            const baseUrl = resolveBaseUrl(info, cfg);
            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, req.timeoutMs);

            const onExternalAbort = () => controller.abort();
            req.signal?.addEventListener('abort', onExternalAbort, { once: true });

            const baseBody: Record<string, unknown> = {
                model: cfg.model,
                messages: buildMessages(req),
            };
            if (req.temperature !== undefined) baseBody.temperature = req.temperature;
            if (req.maxTokens !== undefined) baseBody.max_tokens = req.maxTokens;

            // First try with json_schema
            const firstBody = {
                ...baseBody,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'answer',
                        schema: req.schema || {},
                        strict: false,
                    },
                },
            };

            try {
                let res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: buildHeaders(cfg.key),
                    body: JSON.stringify(firstBody),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    let errText = '';
                    try { errText = await res.text(); } catch { /* ignore */ }

                    // If API answers 400 mentioning response_format or json_schema, retry once with json_object
                    if (res.status === 400 && /response_format|json_schema/i.test(errText)) {
                        const promptWithSchema = `${req.prompt}\n\nAnswer with one JSON object matching this JSON schema: ${JSON.stringify(req.schema || {})}`;
                        const retryBody = {
                            ...baseBody,
                            messages: buildMessages(req, promptWithSchema),
                            response_format: { type: 'json_object' },
                        };

                        res = await fetch(`${baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: buildHeaders(cfg.key),
                            body: JSON.stringify(retryBody),
                            signal: controller.signal,
                        });
                    } else {
                        const mockResponse = new Response(errText, { status: res.status, headers: res.headers });
                        await parseOpenAiError(mockResponse, cfg.key);
                    }
                }

                if (!res.ok) {
                    await parseOpenAiError(res, cfg.key);
                }

                const data = await res.json();
                const rawContent = data.choices?.[0]?.message?.content ?? '';
                const json = parseJsonContent(rawContent);

                return {
                    text: rawContent,
                    json,
                    model: data.model || cfg.model || '',
                    usage: {
                        inputTokens: data.usage?.prompt_tokens,
                        outputTokens: data.usage?.completion_tokens,
                    },
                };
            } catch (err) {
                handleFetchFailure(err, timedOut);
            } finally {
                clearTimeout(timer);
                req.signal?.removeEventListener('abort', onExternalAbort);
            }
        },

        async chat(cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult> {
            if (!cfg.model) {
                throw new AiProviderError('Pick a model in Settings', undefined, 'config');
            }
            if (!info.needsBaseUrl && !cfg.key) {
                throw new AiProviderError('API key is required for OpenAI', undefined, 'auth');
            }

            const baseUrl = resolveBaseUrl(info, cfg);
            const body: Record<string, unknown> = {
                model: cfg.model,
                messages: buildChatMessages(req),
            };
            const tools = buildChatTools(req);
            if (tools.length > 0) body.tools = tools;
            if (req.temperature !== undefined) body.temperature = req.temperature;
            if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;

            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, req.timeoutMs);

            const onExternalAbort = () => controller.abort();
            req.signal?.addEventListener('abort', onExternalAbort, { once: true });
            if (req.signal?.aborted) controller.abort();

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: buildHeaders(cfg.key),
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    await parseOpenAiError(res, cfg.key);
                }

                const data = await res.json();
                const { text, toolCalls } = parseChatMessage(data.choices?.[0]?.message);
                return { text, toolCalls, model: cfg.model };
            } catch (err) {
                handleFetchFailure(err, timedOut);
            } finally {
                clearTimeout(timer);
                req.signal?.removeEventListener('abort', onExternalAbort);
            }
        },

        async test(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
            if (info.needsBaseUrl && !cfg.baseUrl) {
                return { ok: false, message: 'Base URL is required' };
            }
            if (!info.needsBaseUrl && !cfg.key) {
                return { ok: false, message: 'API key is missing' };
            }
            const baseUrl = resolveBaseUrl(info, cfg);
            try {
                const res = await fetch(`${baseUrl}/models`, {
                    method: 'GET',
                    headers: buildHeaders(cfg.key),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    let msg = `HTTP ${res.status}`;
                    try {
                        msg = JSON.parse(text)?.error?.message || msg;
                    } catch {
                        /* ignore */
                    }
                    msg = sanitize(msg, cfg.key);
                    return { ok: false, message: msg };
                }
                return { ok: true, message: 'OK' };
            } catch (err: any) {
                const msg = sanitize(err?.message || 'The browser blocked the call (CORS or network error)', cfg.key);
                return { ok: false, message: msg };
            }
        },

        async listModels(cfg: ProviderConfig): Promise<string[]> {
            if (info.needsBaseUrl && !cfg.baseUrl) {
                throw new AiProviderError('Base URL is required for OpenAI-compatible provider', undefined, 'config');
            }
            const baseUrl = resolveBaseUrl(info, cfg);
            try {
                const res = await fetch(`${baseUrl}/models`, {
                    method: 'GET',
                    headers: buildHeaders(cfg.key),
                });
                if (!res.ok) {
                    await parseOpenAiError(res, cfg.key);
                }
                const data = await res.json();
                const ids = Array.isArray(data.data) ? data.data.map((m: any) => String(m.id)).sort() : [];
                return ids;
            } catch (err) {
                handleFetchFailure(err, false);
            }
        },
    };
}

export const openaiProvider: AiProviderImpl = createOpenAiProvider(OPENAI_INFO);

export default openaiProvider;
