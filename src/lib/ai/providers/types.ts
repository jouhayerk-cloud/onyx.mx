/**
 * Provider contract for bring-your-own-key AI (owner direction, 11 Oct 2026: API keys instead of OAuth).
 * Gemini stays the default and keeps its own caller (client.ts); other providers implement AiProviderImpl.
 * Text and vision JSON jobs (content, segmentation, translate) can be routed to any provider; image and video jobs stay Gemini only.
 */
export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'compat' | 'companion' | 'colibri';

export interface ProviderInfo {
    id: ProviderId;
    label: string;
    /** Shown under the key field, for example "sk-ant-..." */
    keyHint: string;
    /** compat only: the user supplies the base URL (OpenRouter, Groq, Together, DeepSeek, Mistral, Ollama, LM Studio). */
    needsBaseUrl: boolean;
    defaultBaseUrl?: string;
    capabilities: { vision: boolean; json: boolean; image: boolean; video: boolean };
    docsUrl: string;
}

/** What the user saved for one provider (see providerKeys.ts). */
export interface ProviderConfig {
    key: string;
    baseUrl?: string;
    model?: string;
}

export interface AiImagePart { mimeType: string; base64: string }

export interface AiRequest {
    system?: string;
    prompt: string;
    images?: readonly AiImagePart[];
    /** JSON Schema of the answer, for generateJson. */
    schema?: object;
    temperature?: number;
    maxTokens?: number;
    timeoutMs: number;
    signal?: AbortSignal;
}

export interface AiTextResult {
    text: string;
    model: string;
    usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiJsonResult extends AiTextResult {
    json: unknown;
}

/** Tool-calling chat (the Onyx agent). The agent keeps its history in Gemini shape; useOnyxAgent converts to ChatTurn[] for providers. */
export interface ChatToolDef { name: string; description?: string; parameters?: object }
export interface ChatToolCall { id: string; name: string; args: Record<string, unknown> }
export type ChatTurn =
    | { role: 'user'; text: string }
    | { role: 'assistant'; text?: string; toolCalls?: ChatToolCall[] }
    | { role: 'tool'; callId: string; name: string; result: unknown };
export interface ChatRequest {
    system?: string;
    turns: readonly ChatTurn[];
    tools?: readonly ChatToolDef[];
    temperature?: number;
    maxTokens?: number;
    timeoutMs: number;
    signal?: AbortSignal;
}
export interface ChatResult { text: string; toolCalls: ChatToolCall[]; model: string }

export interface AiProviderImpl {
    info: ProviderInfo;
    generateText(cfg: ProviderConfig, req: AiRequest): Promise<AiTextResult>;
    generateJson(cfg: ProviderConfig, req: AiRequest): Promise<AiJsonResult>;
    /** A cheap call that proves the key (and base URL) work. Never throws: returns the reason in message. */
    test(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }>;
    /** Model ids the key can use, when the provider has a list endpoint. */
    listModels?(cfg: ProviderConfig): Promise<string[]>;
    /** One model turn of a tool-calling conversation: text and/or tool calls. Throws AiProviderError. */
    chat?(cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult>;
}

/** Thrown by providers; message is safe to show (never contains the key). */
export class AiProviderError extends Error {
    status?: number;
    kind: 'auth' | 'rate' | 'cors' | 'timeout' | 'bad_request' | 'server' | 'config';
    constructor(message: string, status?: number, kind: 'auth' | 'rate' | 'cors' | 'timeout' | 'bad_request' | 'server' | 'config' = 'server') {
        super(message);
        this.name = 'AiProviderError';
        this.status = status;
        this.kind = kind;
    }
}
