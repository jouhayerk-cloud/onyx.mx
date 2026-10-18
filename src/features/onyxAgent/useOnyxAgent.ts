import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { userAtom, languageAtom, inventoryArtifactConfigAtom } from '../../lib/atoms';
import { getGeminiKey } from '../../lib/ai/keys';
import { requestGeminiKey } from '../../lib/ai/keyPrompt';
import { supabase } from '../../lib/supabase';
import { onyxToolDefinitions, onyxToolHandlers } from '../onyx/onyxTools';
import { mergeToolPacks } from './tools/mergeToolPacks';
import { 
    onyxAgentPhaseAtom, 
    onyxAgentActivityAtom, 
    pushActivity, 
    type AgentPhase,
    type AgentActivityKind
} from './agentState';
import { tr, trf } from '../../lib/i18n';
import { onyxAgentMessagesAtom, onyxAgentHistoryOwnerAtom, saveHistory, clearHistory } from './agentHistory';
import { getRoute, type Route } from '../../lib/ai/routing';
import { getProviderConfig, hasProviderKey } from '../../lib/ai/providerKeys';
import { getProvider, isColibriAvailable } from '../../lib/ai/providers';
import type { AiProviderImpl, ChatResult, ChatToolCall, ChatToolDef, ChatTurn, ProviderConfig } from '../../lib/ai/providers/types';
import { aiErrorMessage } from '../../lib/ai/errors';

export type Message = { 
    id: string; 
    role: 'user' | 'model' | 'tool'; 
    text: string; 
    t: number; 
    toolName?: string; 
    toolCallId?: string; 
    result?: unknown; 
};
export type PendingConfirm = { id: string; tool: string; args: Record<string, unknown>; summary: string; risk?: string; detail?: string };

export interface AgentToolPack {
    source: 'onyx' | 'app' | 'island' | 'print' | 'robot-direct' | 'robot-mcp';
    definitions: unknown[];
    handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
    risk: Record<string, 'read' | 'navigate' | 'robot' | 'write'>;
    confirm?: Record<string, boolean>;
    describe?: (name: string, args: Record<string, unknown>) => string | undefined;
}

export interface OnyxAgentOptions {
    extraTools?: Array<Omit<AgentToolPack, 'source'> & { source?: AgentToolPack['source'] }>;
    systemPrompt?: string;
}

// ---- Non-Gemini chat route -------------------------------------------------------------------------
// The loop below reads Gemini-shaped responses and keeps its history as Gemini `contents`. For another provider these helpers
// convert the history to ChatTurn[] on the way out and the ChatResult back to a Gemini-shaped response on the way in.

const CHAT_TIMEOUT_MS = 180000;   // a local model (Ollama) can need a minute just to load and read the prompt

interface GeminiPart {
    text?: string;
    functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
    functionResponse?: { name?: string; id?: string; response?: { content?: unknown } };
}
interface GeminiContent { role?: string; parts?: GeminiPart[] }

/** Gemini `contents` -> provider turns. Tool results pair with the preceding model turn's calls by order. */
export function geminiContentsToChatTurns(contents: readonly GeminiContent[]): ChatTurn[] {
    const turns: ChatTurn[] = [];
    let ordinal = 0;                         // 1-based position of each function call, for calls that come without an id
    let lastCalls: ChatToolCall[] = [];
    const joinText = (parts: readonly GeminiPart[]) => parts.filter(p => typeof p.text === 'string' && p.text).map(p => p.text).join('\n');

    for (const content of contents) {
        const parts = content?.parts ?? [];
        if (content?.role === 'model') {
            const toolCalls: ChatToolCall[] = [];
            for (const p of parts) {
                if (!p.functionCall) continue;
                ordinal++;
                toolCalls.push({ id: p.functionCall.id || `call_${ordinal}`, name: p.functionCall.name, args: p.functionCall.args ?? {} });
            }
            lastCalls = toolCalls;
            const text = joinText(parts);
            if (!text && toolCalls.length === 0) continue;
            const turn: ChatTurn = { role: 'assistant' };
            if (text) turn.text = text;
            if (toolCalls.length > 0) turn.toolCalls = toolCalls;
            turns.push(turn);
        } else if (content?.role === 'function') {
            let i = 0;
            for (const p of parts) {
                const fr = p.functionResponse;
                if (!fr) continue;
                const call = lastCalls[i++];
                turns.push({ role: 'tool', callId: call?.id ?? fr.id ?? `call_${++ordinal}`, name: fr.name || call?.name || '', result: fr.response?.content ?? null });
            }
        } else if (content?.role === 'user') {
            const text = joinText(parts);
            if (text) turns.push({ role: 'user', text });
        }
    }
    // a conversation has to open with the user (the 10-message window can cut it mid-exchange)
    while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
    return turns;
}

/** Gemini function_declarations use upper-case schema types (OBJECT, STRING) in some packs; providers want JSON Schema. */
const lowerSchemaTypes = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(lowerSchemaTypes);
    if (node && typeof node === 'object') {
        return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(
            ([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerSchemaTypes(v)]
        ));
    }
    return node;
};

export function geminiToolsToChatTools(defs: readonly unknown[]): ChatToolDef[] {
    const out: ChatToolDef[] = [];
    for (const d of defs) {
        const def = d as { name?: unknown; description?: unknown; parameters?: unknown };
        if (!def || typeof def.name !== 'string') continue;
        const tool: ChatToolDef = { name: def.name };
        if (typeof def.description === 'string') tool.description = def.description;
        if (def.parameters && typeof def.parameters === 'object') tool.parameters = lowerSchemaTypes(def.parameters) as object;
        out.push(tool);
    }
    return out;
}

/** ChatResult -> the response shape the agent loop already reads from Gemini. */
export function chatResultToGeminiResponse(res: ChatResult) {
    const parts: GeminiPart[] = [];
    if (res.text) parts.push({ text: res.text });
    for (const tc of res.toolCalls) {
        parts.push({ functionCall: { name: tc.name, args: tc.args ?? {}, ...(tc.id ? { id: tc.id } : {}) } });
    }
    return { candidates: [{ content: { role: 'model', parts } }] };
}

type ChatRouteSetup =
    | { ok: true; impl: AiProviderImpl; cfg: ProviderConfig }
    | { ok: false; message: string };

/** Provider, saved config and model for the agent chat, or the message to show when it cannot run. */
function resolveChatRoute(route: Route): ChatRouteSetup {
    const impl = getProvider(route.provider);
    if (!impl?.chat) return { ok: false, message: tr('This provider cannot run the agent chat') };
    if (!hasProviderKey(route.provider)) {
        if (route.provider === 'companion') {
            return { ok: false, message: tr('Onyx iOS Companion shell not detected') };
        }
        return { ok: false, message: tr('Set up the agent chat provider in Settings') };
    }
    const saved = getProviderConfig(route.provider);
    const model = route.model || saved.model || (route.provider === 'companion' ? 'qwen2.5-1.5b-instruct' : undefined);
    if (!model) return { ok: false, message: tr('Pick a model for the agent chat in Settings') };
    return { ok: true, impl, cfg: { ...saved, model } };
}

export function useOnyxAgent(options: OnyxAgentOptions = {}) {
    const user = useAtomValue(userAtom);
    const appLanguage = useAtomValue(languageAtom);
    const userName = user?.name || 'Operator';
    
    const setGlobalPhase = useSetAtom(onyxAgentPhaseAtom);
    const setActivity = useSetAtom(onyxAgentActivityAtom);
    const activity = useAtomValue(onyxAgentActivityAtom);
    const setInventoryArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    
    // the conversation lives in an atom, so closing the drawer or compacting the island does not lose it
    const [messages, setMessages] = useAtom(onyxAgentMessagesAtom);
    const [historyOwner, setHistoryOwner] = useAtom(onyxAgentHistoryOwnerAtom);
    const userId = user?.id != null ? String(user.id) : null;

    useEffect(() => {
        // another person logged in on this tab: start from an empty log
        if (userId && historyOwner !== userId) {
            if (historyOwner !== null || messages.length > 0) { setMessages([]); clearHistory(); }
            setHistoryOwner(userId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    useEffect(() => {
        const h = setTimeout(() => saveHistory(userId, messages), 500);   // streaming rewrites the last message every few ms
        return () => clearTimeout(h);
    }, [messages, userId]);
    const [phase, setLocalPhase] = useState<AgentPhase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const confirmResolverRef = useRef<((approved: boolean) => void) | null>(null);
    const pendingIdRef = useRef<string | null>(null);   // read by confirm() so a memoised caller never sees a stale pendingConfirm
    
    const setPhase = useCallback((p: AgentPhase) => {
        setLocalPhase(p);
        setGlobalPhase(p);
    }, [setGlobalPhase]);

    useEffect(() => {
        return () => {
            // unmount (navigation, StrictMode double mount): stop the run and never leave the global phase stuck on acting/speaking
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            if (confirmResolverRef.current) {
                confirmResolverRef.current(false);
                confirmResolverRef.current = null;
            }
            setGlobalPhase('idle');
        };
    }, [setGlobalPhase]);

    const { allDefinitions, allHandlers, allRisks, allConfirms, allDescribes } = useMemo(() => {
        const basePack: AgentToolPack = {
            source: 'onyx',
            definitions: onyxToolDefinitions,
            handlers: onyxToolHandlers,
            risk: Object.fromEntries(onyxToolDefinitions.map((d: any) => [d.name, 'read'] as const))
        };
        
        const packs: AgentToolPack[] = [basePack];
        if (options.extraTools) {
            for (const extra of options.extraTools) {
                packs.push({
                    source: extra.source || 'app',
                    definitions: extra.definitions,
                    handlers: extra.handlers,
                    risk: extra.risk,
                    confirm: extra.confirm,
                    describe: extra.describe
                });
            }
        }
        
        const merged = mergeToolPacks(packs);
        return { 
            allDefinitions: merged.definitions, 
            allHandlers: merged.handlers, 
            allRisks: merged.risk,
            allConfirms: merged.confirm,
            allDescribes: merged.describe
        };
    }, [options.extraTools]);

    const systemPrompt = useMemo(() => {
        const systemBase = `You are Onyx Intelligence, a sentient warehouse asset discovery engine. You are communicating with ${userName}. Respond in ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}.
TRANSLATION RULE: The core database is in English. If responding in Spanish, automatically translate item descriptions, categories, and details from the search results into natural Spanish for the user.
DOMAIN CONTEXT: Terms like 'Talan' (e.g., Green Talan) and 'Tehuacan' are common COLORS in the inventory database. If a user asks about these terms without specifying "color", treat them as color search parameters in your tool calls.
OPERATIONAL STATUSES: The database uses 'Production', 'Acquisition', 'Available', and 'Requested' for the inventory pipeline. Use these for operational discovery.
FINANCIAL STATUSES: 'PAID' items are typically those in Workbook 825 (v825) or with a pay_date. 'UNPAID' items are often those with status 'Requested' or 'Acquisition'. 
CRITICAL: Never tell the user 'PAID' or 'GREEN' are unrecognized. Instead, search using Workbook 825 or operational filters to find the relevant assets.
CRITICAL IDENTIFIER RULE: DO NOT read out 'book_barcode' (Tag IDs like DH3261HFNN) in your conversational text.
Instead, give a short, helpful verbal summary of what you found (e.g., "I've found two items from Gerardo, deploying the manifest for you now.") along with the artifact deployment.
Use Tag IDs ONLY in tool calls. 
When deploying artifacts via 'deploy_inventory_artifact', you MUST use the database 'id' field if available to ensure reliable manifest resolution. 
Real items (Fluorite) = 65. Deploy artifacts for all inventory lookups.
CRITICAL ACTION RULE: Never claim, narrate, or pretend to execute an action or tool in text (e.g. never write 'Executing search_in_app...'). You MUST call the real tool function directly. If you cannot execute a tool, state clearly that you could not run it.`;
        return options.systemPrompt ? `${systemBase}\n\n${options.systemPrompt}` : systemBase;
    }, [userName, appLanguage, options.systemPrompt]);

    const callGemini = async (apiKey: string, contents: any[], tools: any[], model: string, signal: AbortSignal) => {
        const payload = {
            contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            tools: tools.length > 0 ? [{ function_declarations: tools }] : undefined
        };
        
        if (import.meta.env.VITE_ONYX_AI_MODE === 'edge') {
            const res = await supabase.functions.invoke('onyx-ai', {
                body: { messages: payload, model }
            });
            if (signal.aborted) throw new Error('aborted');
            if (res.error) throw new Error(res.error.message || 'Edge Function Error');
            return res.data;
        } else {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(payload),
                signal
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }
            return await res.json();
        }
    };

    // Non-Gemini route: one model turn through the provider's chat(), returned in the Gemini shape the loop in send() reads.
    const callModel = async (impl: AiProviderImpl, cfg: ProviderConfig, contents: any[], tools: any[], signal: AbortSignal) => {
        const result = await impl.chat!(cfg, {
            system: systemPrompt,
            turns: geminiContentsToChatTurns(contents),
            tools: geminiToolsToChatTools(tools),
            timeoutMs: CHAT_TIMEOUT_MS,
            maxTokens: 4096,
            signal
        });
        if (signal.aborted) throw new Error('aborted');
        return chatResultToGeminiResponse(result);
    };

    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (confirmResolverRef.current) {
            confirmResolverRef.current(false);
            confirmResolverRef.current = null;
            setPendingConfirm(null);
        }
        setPhase('idle');
    }, [setPhase]);

    const reset = useCallback(() => {
        stop();
        setMessages([]);
        clearHistory();
    }, [stop]);

    const confirm = useCallback((id: string, approved: boolean) => {
        if (pendingIdRef.current === id && confirmResolverRef.current) {
            confirmResolverRef.current(approved);
            confirmResolverRef.current = null;
            pendingIdRef.current = null;
            setPendingConfirm(null);
        }
    }, []);

    const send = useCallback(async (text: string) => {
        const finalInput = text.trim();
        if (!finalInput) return;
        
        if (phase !== 'idle' && phase !== 'error') {
            console.warn("Onyx is currently processing another query.");
            return;
        }
        // a second send before React re-renders (double click) would still see phase 'idle': the abort controller marks a run in flight
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) return;

        // Gemini (the default) keeps its own caller and its own key; any other route goes through that provider's chat()
        const route = getRoute('chat');
        let effectiveViaGemini = route.provider === 'gemini';
        let fallbackNotice: string | null = null;
        let chatSetup = effectiveViaGemini ? null : resolveChatRoute(route);

        if (!effectiveViaGemini) {
            if (chatSetup && chatSetup.ok === false) {
                fallbackNotice = `${chatSetup.message}. ${tr('Falling back to Gemini for this turn.')}`;
                effectiveViaGemini = true;
            } else if (route.provider === 'colibri') {
                const isUp = await isColibriAvailable(chatSetup?.ok ? chatSetup.cfg.baseUrl : undefined);
                if (!isUp) {
                    fallbackNotice = `${tr('Colibrì is not running on this PC.')} ${tr('Falling back to Gemini for this turn.')}`;
                    effectiveViaGemini = true;
                }
            }
        }

        let apiKey = getGeminiKey();
        if (effectiveViaGemini && !apiKey && await requestGeminiKey()) apiKey = getGeminiKey();
        if (effectiveViaGemini && !apiKey) {
            setError(tr("Neural link credentials missing."));
            setPhase('error');
            setTimeout(() => { setPhase('idle'); setError(null); }, 4000);
            return;
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const signal = abortController.signal;

        setMessages(prev => {
            const next = [...prev, { id: Math.random().toString(36).slice(2), role: 'user' as const, text: finalInput, t: Date.now() }];
            return next;
        });
        
        setPhase('thinking');
        setError(null);

        const currentMessages = [...messages, { id: 'temp', role: 'user' as const, text: finalInput, t: Date.now() }];
        const contents: any[] = currentMessages.slice(-10).filter(m => m.text.trim()).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));

        try {
            // route model first (user choice), then 2.5 Flash primary, 3.8 Flash fallback; offline provider falls back to Gemini for that turn
            const modelsToTry = effectiveViaGemini
                ? Array.from(new Set([...(route.model && route.provider === 'gemini' ? [route.model] : []), "gemini-2.5-flash", "gemini-3.8-flash"]))
                : [];
            let resp = null;
            let usedModel = "";
            let lastAttemptError = "";

            if (chatSetup?.ok && !effectiveViaGemini) {
                try {
                    resp = await callModel(chatSetup.impl, chatSetup.cfg, contents, allDefinitions, signal);
                } catch (e: any) {
                    if (signal.aborted) throw e;
                    console.warn(`[onyxAgent] ${route.provider} call failed, falling back to Gemini:`, e);
                    const providerLabel = chatSetup.impl.info?.label || route.provider;
                    fallbackNotice = `${providerLabel} ${tr('is offline or unreachable. Falling back to Gemini for this turn.')}`;
                    effectiveViaGemini = true;
                }
            }

            if (effectiveViaGemini && !resp) {
                if (!apiKey) {
                    throw new Error(tr("Neural link credentials missing."));
                }
                for (const m of modelsToTry) {
                    try {
                        resp = await callGemini(apiKey, contents, allDefinitions, m, signal);
                        usedModel = m;
                        break;
                    } catch (e: any) {
                        if (e.message === 'aborted') throw e;
                        lastAttemptError = e.message;
                    }
                }
            }

            if (!resp) {
                const errMsg = lastAttemptError.toLowerCase();
                const isInvalidKey = errMsg.includes('key') || errMsg.includes('404') || errMsg.includes('api_key_invalid') || errMsg.includes('unauthorized');
                throw new Error(isInvalidKey ? tr("Neural Link Denied. Verify API credentials in settings.") : (lastAttemptError || tr("Neural core unreachable.")));
            }

            let iter = 0;
            let hasReprompted = false;
            const executedTools = new Set<string>();

            while (iter < 6 && !signal.aborted) {
                const parts = resp.candidates?.[0]?.content?.parts || [];
                const calls = parts.filter((p: any) => p.functionCall);
                const textParts = parts.filter((p: any) => typeof p.text === 'string' && p.text).map((p: any) => p.text);
                let modelText: string | undefined = textParts.length > 0 ? textParts.join('\n') : undefined;

                if (calls.length === 0 && modelText) {
                    const unexecutedTool = allDefinitions.find((d: any) =>
                        d?.name && !executedTools.has(d.name) && new RegExp(`\\b${d.name}\\b`).test(modelText!)
                    );

                    if (unexecutedTool) {
                        if (!hasReprompted) {
                            hasReprompted = true;
                            if (resp.candidates?.[0]?.content) {
                                contents.push(resp.candidates[0].content);
                            }
                            contents.push({
                                role: 'user',
                                parts: [{
                                    text: `You mentioned '${(unexecutedTool as any).name}' without calling it. Do not narrate tool calls. You must invoke the tool as a function call. Tool schema:\n${JSON.stringify(unexecutedTool)}`
                                }]
                            });
                            setPhase('thinking');
                            resp = chatSetup?.ok && !effectiveViaGemini
                                ? await callModel(chatSetup.impl, chatSetup.cfg, contents, allDefinitions, signal)
                                : await callGemini(apiKey, contents, allDefinitions, usedModel || 'gemini-2.5-flash', signal);
                            continue;
                        } else {
                            modelText = tr("I could not run that.");
                        }
                    }
                }

                if (fallbackNotice && (modelText || calls.length === 0)) {
                    modelText = modelText ? `${fallbackNotice}\n\n${modelText}` : fallbackNotice;
                    fallbackNotice = null;
                }

                if (modelText) {
                    setPhase('speaking');
                    const msgId = Math.random().toString(36).slice(2);
                    setMessages(prev => [...prev, { id: msgId, role: 'model', text: '', t: Date.now() }]);
                    
                    const maxChunks = Math.floor(4000 / 24);
                    const chunkSize = Math.max(1, Math.ceil(modelText.length / maxChunks));
                    let currentIndex = 0;
                    
                    await new Promise<void>(resolve => {
                        const timer = setInterval(() => {
                            if (signal.aborted) {
                                clearInterval(timer);
                                resolve();
                                return;
                            }
                            currentIndex += chunkSize;
                            if (currentIndex >= modelText.length) {
                                currentIndex = modelText.length;
                                clearInterval(timer);
                            }
                            const currentSlice = modelText.substring(0, currentIndex);
                            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: currentSlice } : m));
                            if (currentIndex === modelText.length) resolve();
                        }, 24);
                    });
                }

                if (calls.length === 0) {
                    if (!modelText && !effectiveViaGemini) throw new Error(tr('The model returned an empty answer'));
                    setPhase('idle');
                    break;
                }

                contents.push(resp.candidates[0].content);
                if (signal.aborted) break;

                const resps = [];
                for (const c of calls) {
                    if (signal.aborted) break;   // Stop pressed: do not run the remaining queued tool calls
                    setPhase('thinking');
                    executedTools.add(c.functionCall.name);
                    const risk = allRisks[c.functionCall.name] || 'read';
                    const needsConfirm = risk === 'write' || allConfirms[c.functionCall.name] === true;
                    let result;
                    
                    if (needsConfirm) {
                        const approved = await new Promise<boolean>(resolve => {
                            const pendingId = Math.random().toString(36).slice(2);
                            const describer = allDescribes[c.functionCall.name];
                            const detail = describer ? describer(c.functionCall.name, c.functionCall.args) : undefined;
                            
                            setPendingConfirm({
                                id: pendingId,
                                tool: c.functionCall.name,
                                args: c.functionCall.args,
                                summary: detail || trf('{name} requires confirmation', { name: c.functionCall.name }),
                                risk: risk,
                                detail: detail
                            });
                            confirmResolverRef.current = resolve;
                            pendingIdRef.current = pendingId;
                        });
                        if (signal.aborted) break;
                        
                        if (!approved) {
                            result = { ok: false, error: 'declined by user' };
                            pushActivity(setActivity, {
                                kind: 'tool',
                                label: `Declined ${c.functionCall.name}`,
                                ok: false
                            });
                            resps.push({
                                functionResponse: {
                                    name: c.functionCall.name,
                                    ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
                                    response: { content: result }
                                }
                            });
                            setMessages(prev => [...prev, {
                                id: Math.random().toString(36).slice(2),
                                role: 'tool',
                                text: JSON.stringify(result),
                                t: Date.now(),
                                toolName: c.functionCall.name,
                                toolCallId: c.functionCall.id,
                                result
                            }]);
                            continue;
                        }
                    }

                    try {
                        const handler = allHandlers[c.functionCall.name];
                        if (!handler) throw new Error(`Tool ${c.functionCall.name} not found`);
                        
                        let timer: ReturnType<typeof setTimeout> | undefined;
                        try {
                            result = await Promise.race([
                                handler(c.functionCall.args),
                                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); })
                            ]);
                        } finally {
                            if (timer) clearTimeout(timer);   // do not leave a 15 s timer behind every tool call
                        }
                        
                        const risk = allRisks[c.functionCall.name] || 'read';
                        const kind = (risk === 'navigate' || risk === 'robot' || risk === 'write') ? risk : 'tool';
                        const summaryArgs = JSON.stringify(c.functionCall.args).substring(0, 30);
                        
                        pushActivity(setActivity, {
                            kind: kind as AgentActivityKind,
                            label: `${c.functionCall.name}(${summaryArgs})`,
                            ok: true
                        });
                    } catch (e: any) {
                        result = { ok: false, error: e.message };
                        pushActivity(setActivity, {
                            kind: 'error',
                            label: `${c.functionCall.name} failed`,
                            ok: false
                        });
                    }

                    if (
                        c.functionCall.name === 'deploy_inventory_artifact' ||
                        (result && typeof result === 'object' && ((result as any).action === 'DEPLOY_INVENTORY' || (result as any).artifactType === 'inventory'))
                    ) {
                        const rawIds = (result as any)?.ids || (result as any)?.item_ids || (result as any)?.itemIds || (c.functionCall.args as any)?.item_ids || (c.functionCall.args as any)?.itemIds;
                        const itemIds: (string | number)[] = Array.isArray(rawIds) ? rawIds : (rawIds != null ? [rawIds] : []);
                        const title = (result as any)?.title || (c.functionCall.args as any)?.title || tr('Inventory Artifact');
                        const rawViewMode = (result as any)?.viewMode || (c.functionCall.args as any)?.viewMode;
                        const viewMode = (rawViewMode === 'sidebar' || rawViewMode === 'embedded') ? rawViewMode : 'modal';
                        
                        setInventoryArtifactConfig({
                            isOpen: true,
                            itemIds,
                            title,
                            viewMode,
                            displayMode: 'gallery'
                        });

                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('onyx:artifact-deployed', {
                                detail: { itemIds, title, viewMode }
                            }));
                        }
                    }

                    resps.push({
                        functionResponse: {
                            name: c.functionCall.name,
                            ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
                            response: { content: result }
                        }
                    });

                    const stringifiedResult = typeof result === 'string' ? result : JSON.stringify(result);
                    setMessages(prev => [...prev, {
                        id: Math.random().toString(36).slice(2),
                        role: 'tool',
                        text: stringifiedResult,
                        t: Date.now(),
                        toolName: c.functionCall.name,
                        toolCallId: c.functionCall.id,
                        result
                    }]);
                }
                
                contents.push({ role: 'function', parts: resps });
                
                if (!signal.aborted) {
                    setPhase('thinking');
                    if (chatSetup?.ok && !effectiveViaGemini) {
                        try {
                            resp = await callModel(chatSetup.impl, chatSetup.cfg, contents, allDefinitions, signal);
                        } catch (e: any) {
                            if (signal.aborted) throw e;
                            console.warn(`[onyxAgent] ${route.provider} mid-turn call failed, falling back to Gemini:`, e);
                            const providerLabel = chatSetup.impl.info?.label || route.provider;
                            fallbackNotice = `${providerLabel} ${tr('is offline or unreachable. Falling back to Gemini for this turn.')}`;
                            effectiveViaGemini = true;
                            resp = await callGemini(apiKey, contents, allDefinitions, usedModel || 'gemini-2.5-flash', signal);
                        }
                    } else {
                        resp = await callGemini(apiKey, contents, allDefinitions, usedModel || 'gemini-2.5-flash', signal);
                    }
                }
                iter++;
                
                if (iter >= 6 && !signal.aborted) {
                    setPhase('idle');
                }
            }
        } catch (e: any) {
            if (signal.aborted) return;
            const errMsg = e?.message?.toLowerCase() || '';
            const isKeyError = errMsg.includes('key') || errMsg.includes('api') || errMsg.includes('404') || errMsg.includes('unauthorized');
            const safeError = !effectiveViaGemini
                ? aiErrorMessage(e)
                : isKeyError
                ? tr('Neural Link Denied. Verify API credentials in settings.')
                : tr('Neural core unreachable.');
            setError(safeError);
            setPhase('error');
            setTimeout(() => { setPhase('idle'); setError(null); }, 4000);
        } finally {
            if (abortControllerRef.current === abortController) abortControllerRef.current = null;
        }
    }, [phase, messages, allDefinitions, allHandlers, allRisks, systemPrompt, setPhase, setActivity]);

    return {
        messages,
        send,
        phase,
        busy: phase !== 'idle' && phase !== 'error',
        error,
        activity,
        pendingConfirm,
        confirm,
        reset,
        stop
    };
}
