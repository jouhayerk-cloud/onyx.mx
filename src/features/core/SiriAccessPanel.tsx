import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { themeAtom, languageAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';
import {
    AlertCircle,
    X,
    Check,
    Copy,
    Loader2,
    Mic,
    ChevronDown,
    Key,
    Sparkles,
    Terminal,
} from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
import { buildSiriSetupPrompt, resolveSiriEndpoint } from './siriPrompt';
import { siriTokenPendingAtom } from './siriState';
import './siriAccess.css';

interface SiriTokenItem {
    id: string;
    label: string;
    prefix: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string;
    revoked_at: string | null;
}

export const SiriAccessPanel: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const L = theme === 'aqua';

    const [tokens, setTokens] = useState<SiriTokenItem[]>([]);
    const [label, setLabel] = useState<string>('iPhone');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const setTokenPending = useSetAtom(siriTokenPendingAtom);
    const [user] = useAtom(userAtom);
    const canCopyLogin = user?.role === 'Developer' || user?.role === 'Admin';

    const loginTokenRef = useRef<string | null>(null);
    const [loginCopied, setLoginCopied] = useState<boolean>(false);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [copiedToken, setCopiedToken] = useState<boolean>(false);
    const [promptCopied, setPromptCopied] = useState<boolean>(false);
    const [showHistory, setShowHistory] = useState<boolean>(false);

    const [language] = useAtom(languageAtom);
    const isBusy = isLoading || isCreating || revokingId !== null;

    const fetchTokens = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                tokens?: SiriTokenItem[];
                error?: string;
            }>('siri-token', {
                body: { action: 'list' },
            });

            if (error) {
                setErrorMessage(error.message || tr("Failed to load tokens."));
                return;
            }
            if (data?.ok && Array.isArray(data.tokens)) {
                setTokens(data.tokens);
            } else if (data?.error) {
                setErrorMessage(data.error);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed to load tokens.");
            setErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTokens();
    }, [fetchTokens]);

    useEffect(() => {
        setTokenPending(createdToken !== null);
    }, [createdToken, setTokenPending]);

    useEffect(() => {
        return () => setTokenPending(false);
    }, [setTokenPending]);

    useEffect(() => {
        if (!canCopyLogin) return;
        let active = true;
        void supabase.auth.getSession().then(({ data }) => {
            if (active) loginTokenRef.current = data.session?.access_token ?? null;
        });
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            loginTokenRef.current = session?.access_token ?? null;
        });
        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, [canCopyLogin]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedLabel = label.trim();
        if (!trimmedLabel || isBusy) return;

        setIsCreating(true);
        setErrorMessage(null);

        try {
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                token?: string;
                error?: string;
                status?: number;
            }>('siri-token', {
                body: { action: 'create', label: trimmedLabel },
            });

            if (error) {
                const anyErr = error as { status?: number; context?: { status?: number }; message?: string };
                const is409 =
                    anyErr.status === 409 ||
                    anyErr.context?.status === 409 ||
                    Boolean(anyErr.message && anyErr.message.includes('409'));
                setErrorMessage(
                    is409
                        ? tr("Max 5 active tokens reached. Revoke one first.")
                        : error.message || tr("Failed to create token.")
                );
                return;
            }

            if (data?.ok && data.token) {
                setCreatedToken(data.token);
                setLabel('iPhone');
                await fetchTokens();
            } else {
                setErrorMessage(data?.error || tr("Failed to create token."));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed to create token.");
            setErrorMessage(msg);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        if (isBusy) return;
        setRevokingId(id);
        setErrorMessage(null);

        try {
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                error?: string;
            }>('siri-token', {
                body: { action: 'revoke', id },
            });

            if (error) {
                setErrorMessage(error.message || tr("Failed to revoke token."));
                return;
            }
            if (data?.ok) {
                setConfirmRevokeId(null);
                await fetchTokens();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed to revoke token.");
            setErrorMessage(msg);
        } finally {
            setRevokingId(null);
        }
    };

    const promptText = buildSiriSetupPrompt({
        endpoint: resolveSiriEndpoint(import.meta.env.VITE_SUPABASE_URL),
        lang: language,
    });

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(promptText);
            setPromptCopied(true);
            setTimeout(() => setPromptCopied(false), 1800);
        } catch {
            // ignore
        }
    };

    const handleCopyToken = async () => {
        if (!createdToken) return;
        try {
            await navigator.clipboard.writeText(createdToken);
            setCopiedToken(true);
            setTimeout(() => setCopiedToken(false), 1800);
        } catch {
            // ignore
        }
    };

    const handleCopyLogin = () => {
        const t = loginTokenRef.current;
        if (!t) return;
        void navigator.clipboard.writeText(t).then(() => {
            setLoginCopied(true);
            setTimeout(() => setLoginCopied(false), 1800);
        });
    };

    const activeTokens = tokens.filter(
        (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now())
    );

    return (
        <LazyMotion features={domMax}>
            <div className={`sa-panel space-y-2 ${L ? 'sa-theme-aqua' : ''}`}>
                {errorMessage && (
                    <div
                        role="alert"
                        className="px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] flex items-center justify-between gap-2"
                    >
                        <span className="truncate">{errorMessage}</span>
                        <button type="button" onClick={() => setErrorMessage(null)}>
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* 1. Compact Siri Prompt Bar */}
                <div className="ss-card p-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-400/25 flex items-center justify-center text-purple-300 shrink-0">
                                <Mic size={14} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-(--ss-fg) truncate">
                                    {tr("iOS Siri & Watch Shortcuts")}
                                </div>
                                <div className="text-[10px] text-(--ss-fg2) truncate">
                                    {tr("Voice inventory search & spec lookup")}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {canCopyLogin && (
                                <button
                                    type="button"
                                    onClick={handleCopyLogin}
                                    className="ss-glass-pill h-7 px-2 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg2) text-[10px] font-mono flex items-center gap-1"
                                    title={tr("Copy Developer Session JWT")}
                                >
                                    <Terminal size={10} className="text-cyan-400" />
                                    <span>{loginCopied ? tr("JWT Copied") : 'JWT'}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleCopyPrompt}
                                className="ss-glass-pill h-7 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-[11px] flex items-center gap-1"
                            >
                                {promptCopied ? <Check size={11} /> : <Copy size={11} />}
                                <span>{promptCopied ? tr("Copied!") : tr("Copy Siri Prompt")}</span>
                            </button>
                        </div>
                    </div>

                    {/* Newly Created Token Banner */}
                    <AnimatePresence initial={false}>
                        {createdToken && (
                            <m.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="p-2 rounded-xl bg-emerald-500/12 border border-emerald-500/35 space-y-1.5"
                            >
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-emerald-300 flex items-center gap-1">
                                        <Sparkles size={12} /> {tr("One-Time Siri Token")}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={handleCopyToken}
                                            className="h-6 px-2 rounded bg-emerald-500 text-black font-semibold text-[10px]"
                                        >
                                            {copiedToken ? tr("Copied") : tr("Copy")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCreatedToken(null)}
                                            className="h-6 px-2 rounded bg-white/10 text-white text-[10px]"
                                        >
                                            {tr("Done")}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-1.5 rounded bg-black/60 text-emerald-300 font-mono text-[10px] break-all select-all">
                                    {createdToken}
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>

                    {/* Token Form + History Toggle */}
                    <form onSubmit={handleCreate} className="flex items-center gap-1.5">
                        <input
                            type="text"
                            maxLength={40}
                            placeholder={tr("Device (e.g. Ramses iPhone)")}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            disabled={isBusy || createdToken !== null}
                            className="flex-1 h-7.5 px-2.5 rounded-lg bg-(--ss-field) border border-(--ss-sep) text-(--ss-fg) text-[11px] focus:outline-none focus:border-cyan-400"
                        />
                        <button
                            type="submit"
                            disabled={isBusy || !label.trim() || createdToken !== null}
                            className="ss-glass-pill h-7.5 px-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/35 text-cyan-300 font-semibold text-[11px] flex items-center gap-1 shrink-0"
                        >
                            {isCreating ? <Loader2 size={11} className="animate-spin" /> : '+'}
                            <span>{tr("Token")}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowHistory((prev) => !prev)}
                            className="h-7.5 px-2 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg2) text-[10.5px] font-mono flex items-center gap-1 shrink-0"
                        >
                            <Key size={11} className="text-purple-400" />
                            <span>{activeTokens.length}/5</span>
                            <ChevronDown
                                size={11}
                                className={`transition-transform ${showHistory ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </form>

                    {/* Collapsible Token History */}
                    <AnimatePresence initial={false}>
                        {showHistory && (
                            <m.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-1 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                    {tokens.length === 0 ? (
                                        <div className="py-1.5 text-center text-[10.5px] text-(--ss-fg3)">
                                            {isLoading ? tr("Loading...") : tr("No Siri tokens")}
                                        </div>
                                    ) : (
                                        tokens.map((token) => {
                                            const isRevoked = Boolean(token.revoked_at);
                                            const isExpired =
                                                !isRevoked &&
                                                Boolean(token.expires_at) &&
                                                new Date(token.expires_at).getTime() <= Date.now();
                                            const isActive = !isRevoked && !isExpired;

                                            return (
                                                <div
                                                    key={token.id}
                                                    className="flex items-center justify-between px-2 py-1 rounded-lg bg-(--ss-field) border border-(--ss-sep) text-[10.5px]"
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span
                                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                                isActive ? 'bg-emerald-400' : 'bg-white/25'
                                                            }`}
                                                        />
                                                        <span className="font-semibold text-(--ss-fg) truncate">
                                                            {token.label}
                                                        </span>
                                                        {token.prefix && (
                                                            <span className="font-mono text-[9.5px] text-(--ss-fg3)">
                                                                {token.prefix}…
                                                            </span>
                                                        )}
                                                    </div>

                                                    {confirmRevokeId === token.id ? (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmRevokeId(null)}
                                                                className="px-1 text-[9.5px] text-(--ss-fg2)"
                                                            >
                                                                ✕
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRevoke(token.id)}
                                                                className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9.5px] font-semibold"
                                                            >
                                                                {revokingId === token.id ? '…' : tr("Revoke")}
                                                            </button>
                                                        </div>
                                                    ) : isActive ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmRevokeId(token.id)}
                                                            className="text-[10px] text-red-400 hover:underline shrink-0"
                                                        >
                                                            {tr("Revoke")}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[9.5px] text-(--ss-fg3)">
                                                            {tr("Revoked")}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </LazyMotion>
    );
};
