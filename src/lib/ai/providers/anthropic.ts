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

export const ANTHROPIC_INFO: ProviderInfo = {
    id: 'anthropic',
    label: 'Anthropic Claude',
    keyHint: 'sk-ant-...',
    needsBaseUrl: false,
    capabilities: { vision: true, json: true, image: false, video: false },
    docsUrl: 'https://docs.anthropic.com',
};

const sanitize = (text: string, secretKey?: string): string => {
    if (!secretKey) return text;
    return text.split(secretKey).join('[REDACTED]');
};

async function parseAnthropicError(res: Response, secretKey?: string): Promise<never> {
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
    if (status === 400) {
        const message = detail ? `${detail}` : 'Bad request';
        throw new AiProviderError(message, status, 'bad_request');
    }
    if (status >= 500) {
        throw new AiProviderError(`Anthropic server error (${status})`, status, 'server');
    }
    throw new AiProviderError(detail || `Anthropic request failed (${status})`, status, 'server');
}

function handleFetchFailure(err: unknown, timedOut: boolean): never {
    if (err instanceof AiProviderError) throw err;
    const isAbort = (err as any)?.name === 'AbortError' || String(err).includes('aborted');
    if (isAbort || timedOut) {
        throw new AiProviderError('AI request timed out', undefined, 'timeout');
    }
    throw new AiProviderError('The browser blocked the call (CORS or network error)', undefined, 'cors');
}

function buildHeaders(key: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
    };
}

function buildMessages(req: AiRequest) {
    const contentParts: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

    // Image parts first, then the text instruction
    for (const img of req.images || []) {
        contentParts.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: img.mimeType,
                data: img.base64,
            },
        });
    }

    contentParts.push({
        type: 'text',
        text: req.prompt,
    });

    return [{ role: 'user', content: contentParts }];
}

function stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') return result;
    return JSON.stringify(result) ?? 'null';
}

/** Turns the provider-neutral history into Anthropic messages; consecutive tool turns become one user message of tool_result blocks. */
function buildChatMessages(req: ChatRequest) {
    const messages: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = [];
    let pendingResults: Array<Record<string, unknown>> = [];
    const flushResults = () => {
        if (pendingResults.length === 0) return;
        messages.push({ role: 'user', content: pendingResults });
        pendingResults = [];
    };

    for (const turn of req.turns) {
        if (turn.role === 'tool') {
            pendingResults.push({
                type: 'tool_result',
                tool_use_id: turn.callId,
                content: stringifyToolResult(turn.result),
            });
            continue;
        }
        flushResults();
        if (turn.role === 'user') {
            messages.push({ role: 'user', content: [{ type: 'text', text: turn.text }] });
        } else {
            const content: Array<Record<string, unknown>> = [];
            if (turn.text && turn.text.trim()) {
                content.push({ type: 'text', text: turn.text });
            }
            for (const call of turn.toolCalls || []) {
                content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args ?? {} });
            }
            // Anthropic rejects an empty content list; an assistant turn with nothing in it carries no information.
            if (content.length > 0) {
                messages.push({ role: 'assistant', content });
            }
        }
    }
    flushResults();
    return messages;
}

function buildChatTools(req: ChatRequest) {
    return (req.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters ?? { type: 'object', properties: {} },
    }));
}

async function postAnthropic(
    cfg: ProviderConfig,
    body: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<any> {
    if (!cfg.model) {
        throw new AiProviderError('Pick a model in Settings', undefined, 'config');
    }
    if (!cfg.key) {
        throw new AiProviderError('API key is required', undefined, 'auth');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    if (signal?.aborted) controller.abort();

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: buildHeaders(cfg.key),
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            await parseAnthropicError(res, cfg.key);
        }

        return await res.json();
    } catch (err) {
        handleFetchFailure(err, timedOut);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onExternalAbort);
    }
}

async function executeAnthropicCall(cfg: ProviderConfig, req: AiRequest, extraBody: Record<string, unknown> = {}): Promise<any> {
    const body: Record<string, unknown> = {
        model: cfg.model,
        max_tokens: req.maxTokens ?? 2048,
        messages: buildMessages(req),
        ...extraBody,
    };
    if (req.system) {
        body.system = req.system;
    }
    if (req.temperature !== undefined) {
        body.temperature = req.temperature;
    }
    return postAnthropic(cfg, body, req.timeoutMs, req.signal);
}

export const anthropicProvider: AiProviderImpl = {
    info: ANTHROPIC_INFO,

    async generateText(cfg: ProviderConfig, req: AiRequest): Promise<AiTextResult> {
        const data = await executeAnthropicCall(cfg, req);
        const textBlocks = (data.content || [])
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text || '');
        const text = textBlocks.join('');
        return {
            text,
            model: data.model || cfg.model || '',
            usage: {
                inputTokens: data.usage?.input_tokens,
                outputTokens: data.usage?.output_tokens,
            },
        };
    },

    async generateJson(cfg: ProviderConfig, req: AiRequest): Promise<AiJsonResult> {
        const extraBody = {
            tools: [
                {
                    name: 'return_json',
                    description: 'Return structured JSON matching the schema',
                    input_schema: req.schema || {},
                },
            ],
            tool_choice: { type: 'tool', name: 'return_json' },
        };
        const data = await executeAnthropicCall(cfg, req, extraBody);
        const toolUseBlock = (data.content || []).find((b: any) => b.type === 'tool_use');
        if (!toolUseBlock || toolUseBlock.input === undefined) {
            throw new AiProviderError('No tool_use block found in Anthropic response', undefined, 'server');
        }
        const json = toolUseBlock.input;
        const text = JSON.stringify(json);
        return {
            text,
            json,
            model: data.model || cfg.model || '',
            usage: {
                inputTokens: data.usage?.input_tokens,
                outputTokens: data.usage?.output_tokens,
            },
        };
    },

    async chat(cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult> {
        const body: Record<string, unknown> = {
            model: cfg.model,
            max_tokens: req.maxTokens ?? 2048,
            messages: buildChatMessages(req),
        };
        if (req.system) {
            body.system = req.system;
        }
        const tools = buildChatTools(req);
        if (tools.length > 0) {
            body.tools = tools;
        }
        if (req.temperature !== undefined) {
            body.temperature = req.temperature;
        }

        const data = await postAnthropic(cfg, body, req.timeoutMs, req.signal);
        const blocks: any[] = Array.isArray(data.content) ? data.content : [];
        const text = blocks
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('');
        const toolCalls: ChatToolCall[] = blocks
            .filter(b => b.type === 'tool_use' && typeof b.name === 'string' && b.name)
            .map((b, index) => ({
                id: typeof b.id === 'string' && b.id ? b.id : `call_${Date.now().toString(36)}_${index}`,
                name: b.name,
                args: b.input && typeof b.input === 'object' && !Array.isArray(b.input) ? b.input : {},
            }));
        if (data.stop_reason === 'max_tokens' && toolCalls.length > 0) {
            throw new AiProviderError('The answer was cut off before the tool call finished', undefined, 'server');
        }
        return { text, toolCalls, model: data.model || cfg.model || '' };
    },

    async test(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
        if (!cfg.key) {
            return { ok: false, message: 'API key is missing' };
        }
        try {
            const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
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
        if (!cfg.key) {
            throw new AiProviderError('API key is required', undefined, 'config');
        }
        try {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                method: 'GET',
                headers: buildHeaders(cfg.key),
            });
            if (!res.ok) {
                await parseAnthropicError(res, cfg.key);
            }
            const data = await res.json();
            const ids = Array.isArray(data.data) ? data.data.map((m: any) => String(m.id)).sort() : [];
            return ids;
        } catch (err) {
            handleFetchFailure(err, false);
        }
    },
};

export default anthropicProvider;
