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
} from 'lucide-react';
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
    const [label, setLabel] = useState<string>('Claude Code');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const setTokenPending = useSetAtom(siriTokenPendingAtom);
    const [language] = useAtom(languageAtom);

    const [clientTab, setClientTab] = useState<McpClientTab>('cursor');
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
                body: { action: 'list', kind: 'mcp' }
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
        return () => {
            setTokenPending(false);
        };
    }, [setTokenPending]);

    useEffect(() => {
        if (showFallback && fallbackRef.current) {
            fallbackRef.current.focus();
            fallbackRef.current.select();
        }
    }, [showFallback]);

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
                id?: string;
                prefix?: string;
                label?: string;
                expires_at?: string;
                error?: string;
                status?: number;
            }>('siri-token', {
                body: { action: 'create', kind: 'mcp', label: trimmedLabel }
            });

            if (error) {
                const anyErr = error as { status?: number; context?: { status?: number }; message?: string };
                const is409 =
                    anyErr.status === 409 ||
                    anyErr.context?.status === 409 ||
                    Boolean(anyErr.message && anyErr.message.includes('409'));

                if (is409) {
                    setErrorMessage(tr("You already have 5 active tokens. Revoke one first."));
                } else {
                    setErrorMessage(error.message || tr("Failed to create token."));
                }
                return;
            }

            if (data?.ok && data.token) {
                setCreatedToken(data.token);
                await fetchTokens();
            } else {
                setErrorMessage(data?.error || tr("Failed to create token."));
            }
        } catch (err: unknown) {
            const anyErr = err as { status?: number; message?: string };
            if (anyErr?.status === 409 || anyErr?.message?.includes('409')) {
                setErrorMessage(tr("You already have 5 active tokens. Revoke one first."));
            } else {
                const msg = err instanceof Error ? err.message : tr("Failed to create token.");
                setErrorMessage(msg);
            }
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
                body: { action: 'revoke', id }
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
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return isoString;
        }
    };

    // Generate config snippet based on selected tab and active or placeholder token
    const tokenDisplay = createdToken || '<YOUR_MCP_TOKEN>';

    const getSnippetForTab = (tab: McpClientTab): string => {
        switch (tab) {
            case 'cursor':
                return JSON.stringify(
                    {
                        mcpServers: {
                            onyx: {
                                url: mcpEndpoint,
                                headers: {
                                    Authorization: `Bearer ${tokenDisplay}`
                                }
                            }
                        }
                    },
                    null,
                    2
                );
            case 'claude':
                return `claude mcp add --transport http --scope user onyx ${mcpEndpoint} --header "Authorization: Bearer ${tokenDisplay}"`;
            case 'colibri':
                return `colibri mcp connect --endpoint "${mcpEndpoint}" --token "${tokenDisplay}"`;
        }
    };

    const activeSnippet = getSnippetForTab(clientTab);

    const activeTokens = tokens.filter(
        (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now())
    );

    return (
        <div className={`sa-panel ma-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* Header */}
            <div className="sa-section-header">
                <div className="flex items-center justify-between">
                    <div className="sa-section-caption">
                        {tr("Model Context Protocol (MCP) Access")}
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                        {tr("HTTP SSE Stream")}
                    </span>
                </div>
                <p className="sa-section-desc">
                    {tr("Connect Antigravity, Cursor, Claude Code, or Colibrì MoE to live Onyx ERP data.")}
                </p>
            </div>

            {/* Error banner */}
            {errorMessage && (
                <div role="alert" className="sa-error-banner">
                    <div className="sa-error-content">
                        <AlertCircle size={15} className="sa-error-icon" aria-hidden="true" />
                        <span className="sa-error-text">{errorMessage}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        aria-label={tr("Dismiss")}
                        className="sa-dismiss-btn"
                    >
                        <X size={15} aria-hidden="true" />
                    </button>
                </div>
            )}

            {/* 1. Active Endpoint Bar */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
                        <Globe size={16} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                            {tr("MCP Live Gateway Endpoint")}
                        </div>
                        <div className="text-[12px] font-mono text-white/90 truncate max-w-[280px] sm:max-w-md">
                            {mcpEndpoint}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() =>
                        copyText(mcpEndpoint, () => {
                            setCopiedEndpoint(true);
                            setTimeout(() => setCopiedEndpoint(false), 2000);
                        })
                    }
                    className="h-8 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors border border-white/10 shrink-0"
                >
                    {copiedEndpoint ? (
                        <>
                            <Check size={12} className="text-emerald-400" />
                            <span>{tr("Copied")}</span>
                        </>
                    ) : (
                        <>
                            <Copy size={12} />
                            <span>{tr("Copy Endpoint")}</span>
                        </>
                    )}
                </button>
            </div>

            {/* 2. One-Time Token Callout (when token newly created) */}
            {createdToken && (
                <div role="status" className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-emerald-400" />
                            <span className="text-[13px] font-semibold text-emerald-300">
                                {tr("One-Time MCP Token Created")}
                            </span>
                        </div>
                        <span className="text-[10px] text-emerald-400/70 font-mono">
                            {tr("Shown once only")}
                        </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/60 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] break-all select-all">
                        {createdToken}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                copyText(createdToken, () => {
                                    setCopiedToken(true);
                                    setTimeout(() => setCopiedToken(false), 2000);
                                })
                            }
                            className="h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
                        >
                            {copiedToken ? (
                                <>
                                    <Check size={12} />
                                    <span>{tr("Copied")}</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    <span>{tr("Copy Token")}</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreatedToken(null)}
                            className="h-8 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium transition-colors border border-white/10"
                        >
                            {tr("Done")}
                        </button>
                    </div>
                </div>
            )}

            {/* 3. Client Config Snippets Card with 3-Pill Selector */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
                        {tr("Quick Client Integration")}
                    </span>

                    {/* 3-Pill Segmented Tab */}
                    <div className="flex items-center p-0.5 rounded-xl bg-black/40 border border-white/15">
                        <button
                            type="button"
                            onClick={() => setClientTab('cursor')}
                            className={`h-7 px-3 rounded-lg text-[11px] font-medium transition-all ${
                                clientTab === 'cursor'
                                    ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                    : 'text-white/70 hover:text-white'
                            }`}
                        >
                            {tr("Antigravity / Cursor")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setClientTab('claude')}
                            className={`h-7 px-3 rounded-lg text-[11px] font-medium transition-all ${
                                clientTab === 'claude'
                                    ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                    : 'text-white/70 hover:text-white'
                            }`}
                        >
                            {tr("Claude Code")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setClientTab('colibri')}
                            className={`h-7 px-3 rounded-lg text-[11px] font-medium transition-all ${
                                clientTab === 'colibri'
                                    ? 'bg-cyan-500 text-black font-semibold shadow-sm'
                                    : 'text-white/70 hover:text-white'
                            }`}
                        >
                            {tr("Colibrì MoE")}
                        </button>
                    </div>
                </div>

                {/* Code Block */}
                <div className="relative group">
                    <pre className="p-3 rounded-xl bg-black/60 border border-white/15 text-cyan-300 font-mono text-[11px] overflow-x-auto select-all max-h-40 custom-scrollbar">
                        {activeSnippet}
                    </pre>
                    <button
                        type="button"
                        onClick={() =>
                            copyText(activeSnippet, () => {
                                setCopiedSnippet(true);
                                setTimeout(() => setCopiedSnippet(false), 2000);
                            })
                        }
                        className="absolute top-2 right-2 h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors border border-white/10"
                        title={tr("Copy code")}
                    >
                        {copiedSnippet ? (
                            <>
                                <Check size={11} className="text-emerald-400" />
                                <span>{tr("Copied")}</span>
                            </>
                        ) : (
                            <>
                                <Copy size={11} />
                                <span>{tr("Copy")}</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="text-[10px] text-white/50">
                    {clientTab === 'cursor' &&
                        tr("Paste into ~/.cursor/mcp.json or Antigravity MCP settings.")}
                    {clientTab === 'claude' &&
                        tr("Run in terminal to register Onyx tools directly with Claude Code.")}
                    {clientTab === 'colibri' &&
                        tr("Allows local MoE models to invoke ERP inventory and production tools.")}
                </div>
            </div>

            {/* 4. Token Creation Row */}
            <form onSubmit={handleCreate} className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/5 border border-white/10">
                <input
                    type="text"
                    maxLength={40}
                    placeholder={tr("Token label (e.g. Cursor Mac, Claude CLI)")}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={isBusy || createdToken !== null}
                    className="flex-1 h-9 px-3 rounded-xl bg-black/30 border border-white/10 text-white text-[12px] focus:outline-none focus:border-cyan-400"
                />
                <button
                    type="submit"
                    disabled={isBusy || !label.trim() || createdToken !== null}
                    className="h-9 px-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold text-[11px] flex items-center gap-1.5 transition-all shrink-0"
                >
                    {isCreating ? (
                        <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>{tr("Creating...")}</span>
                        </>
                    ) : (
                        <span>{tr("Create Token")}</span>
                    )}
                </button>
            </form>

            {/* 5. Collapsible Token History & Revocation */}
            <div className="pt-1">
                <button
                    type="button"
                    onClick={() => setIsHistoryOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Key size={13} className="text-cyan-400" />
                        <span className="text-[12px] font-semibold text-white">
                            {tr("Token History & Revocation")} ({activeTokens.length} {tr("active")})
                        </span>
                    </div>
                    <ChevronDown
                        size={14}
                        className={`text-white/60 transition-transform ${
                            isHistoryOpen ? 'rotate-180' : ''
                        }`}
                    />
                </button>

                {isHistoryOpen && (
                    <div className="mt-2 p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5 text-[11px] animate-fadeIn">
                        {isLoading && tokens.length === 0 ? (
                            <div className="p-3 text-center text-white/50">{tr("Loading tokens...")}</div>
                        ) : tokens.length === 0 ? (
                            <div className="p-3 text-center text-white/50">{tr("No tokens created yet.")}</div>
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
                                        className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5 gap-2"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]">
                                                    {token.label}
                                                </span>
                                                {prefix && (
                                                    <span className="font-mono text-[9px] text-white/40">
                                                        ({prefix}...)
                                                    </span>
                                                )}
                                                <span
                                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                                                        isActive
                                                            ? 'bg-emerald-500/20 text-emerald-300'
                                                            : isExpired
                                                            ? 'bg-amber-500/20 text-amber-300'
                                                            : 'bg-white/10 text-white/40'
                                                    }`}
                                                >
                                                    {isActive ? tr("Active") : isExpired ? tr("Expired") : tr("Revoked")}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-white/40 truncate">
                                                {tr("Created")}: {formatDate(token.created_at)} · {tr("Expires")}: {formatDate(token.expires_at)}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            {confirmRevokeId === token.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmRevokeId(null)}
                                                        className="px-2 py-0.5 rounded text-[10px] text-white/60 hover:text-white"
                                                    >
                                                        {tr("Cancel")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRevoke(token.id)}
                                                        className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-400 text-white text-[10px] font-medium"
                                                    >
                                                        {revokingId === token.id ? (
                                                            <Loader2 size={10} className="animate-spin" />
                                                        ) : (
                                                            tr("Confirm")
                                                        )}
                                                    </button>
                                                </div>
                                            ) : isActive ? (
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => setConfirmRevokeId(token.id)}
                                                    className="px-2 py-1 rounded-md text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
                                                >
                                                    {tr("Revoke")}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Fallback textarea when clipboard write fails */}
            {showFallback && (
                <div className="p-2 rounded-xl bg-black/60 border border-white/10 space-y-1">
                    <div className="text-[10px] text-white/60">{tr("Select and copy:")}</div>
                    <textarea
                        ref={fallbackRef}
                        readOnly
                        value={showFallback}
                        className="w-full h-16 p-2 rounded-lg bg-black text-cyan-300 font-mono text-[10px]"
                        onFocus={(e) => e.currentTarget.select()}
                    />
                </div>
            )}
        </div>
    );
};
