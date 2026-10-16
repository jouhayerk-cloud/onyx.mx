import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { themeAtom, languageAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';
import {
    AlertCircle,
    X,
    Check,
    Copy,
    Loader2,
    ChevronDown,
    Globe,
    Key,
    Sparkles,
    Code2,
} from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
import { siriTokenPendingAtom } from './siriState';
import { resolveMcpEndpoint } from './mcpEndpoint';
import './siriAccess.css';
import './mcpAccess.css';

interface McpTokenItem {
    id: string;
    label: string;
    token_prefix?: string;
    prefix?: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string;
    revoked_at: string | null;
}

type McpClientTab = 'cursor' | 'claude' | 'colibri';

export const McpAccessPanel: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const L = theme === 'aqua';

    const [tokens, setTokens] = useState<McpTokenItem[]>([]);
    const [label, setLabel] = useState<string>('Cursor / Antigravity');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const setTokenPending = useSetAtom(siriTokenPendingAtom);
    const [language] = useAtom(languageAtom);

    const [clientTab, setClientTab] = useState<McpClientTab>('cursor');
    const [showSnippetPreview, setShowSnippetPreview] = useState<boolean>(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [copiedToken, setCopiedToken] = useState<boolean>(false);
    const [copiedEndpoint, setCopiedEndpoint] = useState<boolean>(false);
    const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
    const [showFallback, setShowFallback] = useState<string | null>(null);
    const fallbackRef = useRef<HTMLTextAreaElement>(null);

    const isBusy = isLoading || isCreating || revokingId !== null;
    const mcpEndpoint = resolveMcpEndpoint(import.meta.env.VITE_SUPABASE_URL);

    const copyText = async (text: string, onSuccess: () => void) => {
        try {
            await navigator.clipboard.writeText(text);
            onSuccess();
            setShowFallback(null);
        } catch {
            setShowFallback(text);
        }
    };

    const fetchTokens = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                tokens?: McpTokenItem[];
                error?: string;
            }>('siri-token', {
                body: { action: 'list', kind: 'mcp' },
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
        if (!confirmRevokeId) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                setConfirmRevokeId(null);
            }
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [confirmRevokeId]);

    useEffect(() => {
        setTokenPending(createdToken !== null);
    }, [createdToken, setTokenPending]);

    useEffect(() => {
        return () => setTokenPending(false);
    }, [setTokenPending]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedLabel = label.trim();
        if (!trimmedLabel || isBusy || createdToken !== null) return;

        setIsCreating(true);
        setErrorMessage(null);

        try {
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                token?: string;
                error?: string;
                status?: number;
            }>('siri-token', {
                body: { action: 'create', kind: 'mcp', label: trimmedLabel },
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
            } else {
                setErrorMessage(data?.error || tr("Failed to revoke token."));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed to revoke token.");
            setErrorMessage(msg);
        } finally {
            setRevokingId(null);
        }
    };

    const formatDate = (isoString?: string | null): string => {
        if (!isoString) return tr("never");
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            return d.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return isoString;
        }
    };

    const tokenDisplay = createdToken || '<YOUR_MCP_TOKEN>';

    const getSnippetForTab = (tab: McpClientTab): string => {
        switch (tab) {
            case 'cursor':
                return JSON.stringify(
                    {
                        mcpServers: {
                            onyx: {
                                url: mcpEndpoint,
                                headers: { Authorization: `Bearer ${tokenDisplay}` },
                            },
                        },
                    },
                    null,
                    2
                );
            case 'claude':
                return `claude mcp add --transport http --scope user onyx ${mcpEndpoint} --header "Authorization: Bearer ${tokenDisplay}"`;
            case 'colibri':
                return `node scripts/colibri-mcp-server.cjs`;
        }
    };

    const activeSnippet = getSnippetForTab(clientTab);
    const activeTokens = tokens.filter(
        (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now())
    );

    return (
        <LazyMotion features={domMax}>
            <div className={`sa-panel ma-panel space-y-2 ${L ? 'sa-theme-aqua' : ''}`}>
                {errorMessage && (
                    <div
                        role="alert"
                        className="px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] flex items-center justify-between gap-2"
                    >
                        <div className="flex items-center gap-1.5 truncate">
                            <AlertCircle size={13} className="shrink-0" />
                            <span className="truncate">{errorMessage}</span>
                        </div>
                        <button type="button" onClick={() => setErrorMessage(null)}>
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* 1. Compact Endpoint + Client Config Copy Strip */}
                <div className="ss-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
                                <Globe size={13} />
                            </div>
                            <span className="text-[11px] font-mono text-(--ss-fg) truncate">
                                {mcpEndpoint}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                copyText(mcpEndpoint, () => {
                                    setCopiedEndpoint(true);
                                    setTimeout(() => setCopiedEndpoint(false), 1800);
                                })
                            }
                            className="ss-glass-pill h-7 px-2.5 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg) text-[10.5px] font-semibold flex items-center gap-1 shrink-0"
                        >
                            {copiedEndpoint ? (
                                <Check size={11} className="text-emerald-400" />
                            ) : (
                                <Copy size={11} />
                            )}
                            <span>{copiedEndpoint ? tr("Copied") : tr("URL")}</span>
                        </button>
                    </div>

                    {/* Client Preset Switcher + 1-Click Copy Config */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center p-0.5 rounded-xl bg-(--ss-field) border border-(--ss-sep)">
                            {(
                                [
                                    { id: 'cursor', label: 'Cursor / AGY' },
                                    { id: 'claude', label: 'Claude CLI' },
                                    { id: 'colibri', label: 'Colibrì STDIO' },
                                ] as { id: McpClientTab; label: string }[]
                            ).map((t) => {
                                const active = clientTab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setClientTab(t.id)}
                                        className={`relative h-6.5 px-2.5 rounded-lg text-[10.5px] font-semibold transition-colors z-10 ${
                                            active
                                                ? 'text-(--ss-on-accent)'
                                                : 'text-(--ss-fg2) hover:text-(--ss-fg)'
                                        }`}
                                    >
                                        {active && (
                                            <m.span
                                                layoutId="mcp-client-pill"
                                                className="ss-top-tab-pill rounded-lg"
                                                transition={{
                                                    type: 'spring',
                                                    stiffness: 420,
                                                    damping: 32,
                                                }}
                                            />
                                        )}
                                        <span className="relative z-10">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setShowSnippetPreview((v) => !v)}
                                className="h-7 px-2 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg2) text-[10.5px] flex items-center gap-1"
                                title={tr("Toggle snippet preview")}
                            >
                                <Code2 size={11} />
                                <span>{showSnippetPreview ? tr("Hide") : tr("JSON")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    copyText(activeSnippet, () => {
                                        setCopiedSnippet(true);
                                        setTimeout(() => setCopiedSnippet(false), 1800);
                                    })
                                }
                                className="ss-glass-pill h-7 px-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/35 text-cyan-300 text-[10.5px] font-semibold flex items-center gap-1"
                            >
                                {copiedSnippet ? <Check size={11} /> : <Copy size={11} />}
                                <span>{copiedSnippet ? tr("Copied") : tr("Copy Config")}</span>
                            </button>
                        </div>
                    </div>

                    <AnimatePresence initial={false}>
                        {showSnippetPreview && (
                            <m.pre
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-2 rounded-xl bg-black/55 border border-(--ss-sep) text-cyan-300 font-mono text-[10px] overflow-x-auto select-all max-h-28 custom-scrollbar"
                            >
                                {activeSnippet}
                            </m.pre>
                        )}
                    </AnimatePresence>
                </div>

                {/* 2. Newly Created One-Time Token Callout */}
                <AnimatePresence initial={false}>
                    {createdToken && (
                        <m.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            role="status"
                            className="p-2.5 rounded-xl bg-emerald-500/12 border border-emerald-500/35 space-y-2"
                        >
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                                    <Sparkles size={13} /> {tr("One-Time MCP Token")}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            copyText(createdToken, () => {
                                                setCopiedToken(true);
                                                setTimeout(() => setCopiedToken(false), 1800);
                                            })
                                        }
                                        className="h-6 px-2 rounded-md bg-emerald-500 text-black font-semibold text-[10.5px] flex items-center gap-1"
                                    >
                                        {copiedToken ? <Check size={10} /> : <Copy size={10} />}
                                        <span>{copiedToken ? tr("Copied") : tr("Copy")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCreatedToken(null)}
                                        className="h-6 px-2 rounded-md bg-white/10 text-white text-[10.5px]"
                                    >
                                        {tr("Done")}
                                    </button>
                                </div>
                            </div>
                            <div className="p-1.5 rounded-lg bg-black/60 border border-emerald-500/25 text-emerald-300 font-mono text-[10px] break-all select-all">
                                {createdToken}
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>

                {/* 3. Inline Token Generator + Collapsible Active Tokens */}
                <div className="ss-card p-2 space-y-1.5">
                    <form onSubmit={handleCreate} className="flex items-center gap-1.5">
                        <input
                            type="text"
                            maxLength={40}
                            placeholder={tr("Token label (e.g. Cursor, Claude)")}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            disabled={isBusy || createdToken !== null}
                            className="flex-1 h-7.5 px-2.5 rounded-lg bg-(--ss-field) border border-(--ss-sep) text-(--ss-fg) text-[11px] focus:outline-none focus:border-cyan-400"
                        />
                        <button
                            type="submit"
                            disabled={isBusy || !label.trim() || createdToken !== null}
                            className="ss-glass-pill h-7.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold text-[11px] flex items-center gap-1 shrink-0"
                        >
                            {isCreating ? <Loader2 size={11} className="animate-spin" /> : '+'}
                            <span>{tr("New Token")}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsHistoryOpen((prev) => !prev)}
                            className="h-7.5 px-2 rounded-lg bg-(--ss-field) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg2) text-[10.5px] font-mono flex items-center gap-1 shrink-0"
                        >
                            <Key size={11} className="text-cyan-400" />
                            <span>{activeTokens.length}/5</span>
                            <ChevronDown
                                size={11}
                                className={`transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </form>

                    <AnimatePresence initial={false}>
                        {isHistoryOpen && (
                            <m.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-1 space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                                    {tokens.length === 0 ? (
                                        <div className="py-2 text-center text-[10.5px] text-(--ss-fg3)">
                                            {isLoading ? tr("Loading...") : tr("No MCP tokens")}
                                        </div>
                                    ) : (
                                        tokens.map((token) => {
                                            const isRevoked = Boolean(token.revoked_at);
                                            const isExpired =
                                                !isRevoked &&
                                                Boolean(token.expires_at) &&
                                                new Date(token.expires_at).getTime() <= Date.now();
                                            const isActive = !isRevoked && !isExpired;
                                            const prefix = token.token_prefix || token.prefix || '';

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
                                                        {prefix && (
                                                            <span className="font-mono text-[9.5px] text-(--ss-fg3)">
                                                                {prefix}…
                                                            </span>
                                                        )}
                                                        <span className="text-[9.5px] text-(--ss-fg3)">
                                                            {formatDate(token.created_at)}
                                                        </span>
                                                    </div>

                                                    {confirmRevokeId === token.id ? (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmRevokeId(null)}
                                                                className="px-1.5 py-0.5 text-[9.5px] text-(--ss-fg2)"
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
                                                            {isExpired ? tr("Exp") : tr("Revoked")}
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

                {showFallback && (
                    <textarea
                        ref={fallbackRef}
                        readOnly
                        value={showFallback}
                        className="w-full h-12 p-1.5 rounded-lg bg-black text-cyan-300 font-mono text-[10px]"
                        onFocus={(e) => e.currentTarget.select()}
                    />
                )}
            </div>
        </LazyMotion>
    );
};
