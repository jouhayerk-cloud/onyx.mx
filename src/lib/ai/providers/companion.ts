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
import { tr } from '../../i18n';

export const COMPANION_INFO: ProviderInfo = {
    id: 'companion',
    label: 'Onyx iOS Companion (LiteRT-LM)',
    keyHint: 'No key required (On-Device)',
    needsBaseUrl: false,
    // LiteRT-LM is text-only for now; photo jobs routed here fall back to Gemini in client.ts
    capabilities: { vision: false, json: true, image: false, video: false },
    docsUrl: 'https://github.com/google-ai-edge/LiteRT-LM',
};

interface StreamListener {
    onToken?: (text: string) => void;
    onDone: (result: ChatResult) => void;
    onError: (err: Error) => void;
}

const activeStreams = new Map<string, StreamListener>();

// Global callback receiver invoked by native webView.evaluateJavaScript
if (typeof window !== 'undefined') {
    (window as any).__onyxStreamDispatcher = (event: {
        streamId: string;
        type: 'token' | 'tool_call' | 'done' | 'error';
        text?: string;
        toolCalls?: ChatToolCall[];
        result?: ChatResult;
        error?: string;
    }) => {
        const listener = activeStreams.get(event.streamId);
        if (!listener) return;

        switch (event.type) {
            case 'token':
                if (event.text && listener.onToken) {
                    listener.onToken(event.text);
                }
                break;
            case 'done':
                if (event.result) {
                    listener.onDone(event.result);
                } else {
                    listener.onDone({
                        text: event.text || '',
                        toolCalls: event.toolCalls || [],
                        model: 'qwen2.5-1.5b-instruct',
                    });
                }
                activeStreams.delete(event.streamId);
                break;
            case 'error':
                listener.onError(new Error(event.error || 'Native on-device SLM error'));
                activeStreams.delete(event.streamId);
                break;
        }
    };
}

export function isCompanionAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as any;
    return Boolean(w.webkit?.messageHandlers?.onyxChat);
}

function postToNative(op: string, payload: Record<string, unknown> = {}): Promise<any> {
    if (!isCompanionAvailable()) {
        return Promise.reject(
            new AiProviderError(
                tr('Onyx iOS Companion native bridge not found. Run inside the OnyxCompanion iOS app.'),
                undefined,
                'config'
            )
        );
    }
    const handler = (window as any).webkit.messageHandlers.onyxChat;
    return handler.postMessage({ op, ...payload });
}

export const companionProvider: AiProviderImpl = {
    info: COMPANION_INFO,

    async generateText(cfg: ProviderConfig, req: AiRequest): Promise<AiTextResult> {
        const chatReq: ChatRequest = {
            system: req.system,
            turns: [{ role: 'user', text: req.prompt }],
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            timeoutMs: req.timeoutMs,
            signal: req.signal,
        };
        const result = await this.chat!(cfg, chatReq);
        return {
            text: result.text,
            model: result.model || 'qwen2.5-1.5b-instruct',
        };
    },

    async generateJson(cfg: ProviderConfig, req: AiRequest): Promise<AiJsonResult> {
        let jsonPrompt = req.prompt;
        if (req.schema) {
            jsonPrompt = `${jsonPrompt}\n\n${tr('Respond with a JSON object conforming to this schema:')}\n${JSON.stringify(req.schema)}`;
        }
        jsonPrompt = `${jsonPrompt}\n\n${tr('IMPORTANT: Respond with pure, valid JSON only. Do not include markdown code block backticks.')}`;
        const textRes = await this.generateText(cfg, { ...req, prompt: jsonPrompt });
        let raw = textRes.text.trim();
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        try {
            const parsed = JSON.parse(raw);
            return {
                text: textRes.text,
                json: parsed,
                model: textRes.model,
            };
        } catch {
            throw new AiProviderError(tr('On-device model did not return valid JSON'), undefined, 'server');
        }
    },

    async test(_cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
        if (!isCompanionAvailable()) {
            return {
                ok: false,
                message: tr('Companion not detected (available on iOS Companion shell)'),
            };
        }
        try {
            const info = await postToNative('info');
            const modelName = info?.model || 'Qwen 2.5 1.5B';
            return {
                ok: true,
                message: `On-device SLM active (${modelName})`,
            };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : tr('Companion bridge failed'),
            };
        }
    },

    async listModels(_cfg: ProviderConfig): Promise<string[]> {
        if (!isCompanionAvailable()) return ['qwen2.5-1.5b-instruct', 'gemma-2-2b-it'];
        try {
            const res = await postToNative('models_list');
            if (Array.isArray(res?.models) && res.models.length > 0) {
                return res.models;
            }
        } catch {
            /* ignore */
        }
        return ['qwen2.5-1.5b-instruct', 'gemma-2-2b-it'];
    },

    async chat(_cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult> {
        if (!isCompanionAvailable()) {
            throw new AiProviderError(
                tr('Onyx iOS Companion native bridge not found. Open Onyx inside the iOS Companion shell to use on-device models.'),
                undefined,
                'config'
            );
        }

        const streamId = 'stream_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

        return new Promise<ChatResult>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;
            if (req.timeoutMs > 0) {
                timer = setTimeout(() => {
                    activeStreams.delete(streamId);
                    postToNative('chat_abort', { streamId }).catch(() => {});
                    reject(new AiProviderError(tr('On-device inference timed out'), undefined, 'timeout'));
                }, req.timeoutMs);
            }

            const onAbort = () => {
                activeStreams.delete(streamId);
                postToNative('chat_abort', { streamId }).catch(() => {});
                if (timer) clearTimeout(timer);
                reject(new AiProviderError(tr('Inference aborted'), undefined, 'timeout'));
            };

            if (req.signal?.aborted) {
                onAbort();
                return;
            }
            req.signal?.addEventListener('abort', onAbort, { once: true });

            activeStreams.set(streamId, {
                onDone: (result) => {
                    if (timer) clearTimeout(timer);
                    req.signal?.removeEventListener('abort', onAbort);
                    resolve(result);
                },
                onError: (err) => {
                    if (timer) clearTimeout(timer);
                    req.signal?.removeEventListener('abort', onAbort);
                    reject(new AiProviderError(err.message, undefined, 'server'));
                },
            });

            // Start streaming from native LiteRT-LM
            postToNative('chat_stream', {
                streamId,
                system: req.system,
                turns: req.turns,
                tools: req.tools,
                temperature: req.temperature,
                maxTokens: req.maxTokens,
            }).catch((err) => {
                activeStreams.delete(streamId);
                if (timer) clearTimeout(timer);
                req.signal?.removeEventListener('abort', onAbort);
                reject(new AiProviderError(err?.message || tr('Failed to dispatch chat_stream'), undefined, 'server'));
            });
        });
    },
};

export default companionProvider;
