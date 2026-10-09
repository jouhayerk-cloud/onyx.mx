import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { userAtom, languageAtom } from '../../lib/atoms';
import { getGeminiKey } from '../../lib/ai/keys';
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

export type Message = { id: string; role: 'user' | 'model' | 'tool'; text: string; t: number };
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

export function useOnyxAgent(options: OnyxAgentOptions = {}) {
    const user = useAtomValue(userAtom);
    const appLanguage = useAtomValue(languageAtom);
    const userName = user?.name || 'Operator';
    
    const setGlobalPhase = useSetAtom(onyxAgentPhaseAtom);
    const setActivity = useSetAtom(onyxAgentActivityAtom);
    const activity = useAtomValue(onyxAgentActivityAtom);
    
    const [messages, setMessages] = useState<Message[]>([]);
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
Real items (Fluorite) = 65. Deploy artifacts for all inventory lookups.`;
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

        const apiKey = getGeminiKey();
        if (!apiKey) {
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
            const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
            let resp = null;
            let usedModel = "";
            let lastAttemptError = "";

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

            if (!resp) {
                const errMsg = lastAttemptError.toLowerCase();
                const isInvalidKey = errMsg.includes('key') || errMsg.includes('404') || errMsg.includes('api_key_invalid') || errMsg.includes('unauthorized');
                throw new Error(isInvalidKey ? tr("Neural Link Denied. Verify API credentials in settings.") : (lastAttemptError || tr("Neural core unreachable.")));
            }

            let iter = 0;
            while (iter < 6 && !signal.aborted) {
                const parts = resp.candidates?.[0]?.content?.parts || [];
                const calls = parts.filter((p: any) => p.functionCall);
                const modelText = parts.find((p: any) => p.text)?.text;

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
                    setPhase('idle');
                    break;
                }

                contents.push(resp.candidates[0].content);
                if (signal.aborted) break;

                const resps = [];
                for (const c of calls) {
                    if (signal.aborted) break;   // Stop pressed: do not run the remaining queued tool calls
                    setPhase('thinking');
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
                            resps.push({ functionResponse: { name: c.functionCall.name, response: { content: result } } });
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
                    resps.push({ functionResponse: { name: c.functionCall.name, response: { content: result } } });
                }
                
                contents.push({ role: 'function', parts: resps });
                
                if (!signal.aborted) {
                    setPhase('thinking');
                    resp = await callGemini(apiKey, contents, allDefinitions, usedModel, signal);
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
            const safeError = isKeyError
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
