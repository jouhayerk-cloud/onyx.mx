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
    Smartphone,
    Terminal,
} from 'lucide-react';
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

    // PC testing login session token
    const loginTokenRef = useRef<string | null>(null);
    const [loginCopied, setLoginCopied] = useState<boolean>(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [copiedToken, setCopiedToken] = useState<boolean>(false);
    const [promptCopied, setPromptCopied] = useState<boolean>(false);
    const [showGuide, setShowGuide] = useState<boolean>(false);
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
                body: { action: 'list' }
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
                id?: string;
                prefix?: string;
                label?: string;
                expires_at?: string;
                error?: string;
                status?: number;
            }>('siri-token', {
                body: { action: 'create', label: trimmedLabel }
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
                setLabel('iPhone');
                await fetchTokens();
            } else if (data?.status === 409 || data?.error?.includes('409')) {
                setErrorMessage(tr("You already have 5 active tokens. Revoke one first."));
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

    const promptText = buildSiriSetupPrompt({
        endpoint: resolveSiriEndpoint(import.meta.env.VITE_SUPABASE_URL),
        lang: language,
    });

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(promptText);
            setPromptCopied(true);
            setTimeout(() => setPromptCopied(false), 2000);
        } catch {
            // fallback handled gracefully
        }
    };

    const handleCopyToken = async () => {
        if (!createdToken) return;
        try {
            await navigator.clipboard.writeText(createdToken);
            setCopiedToken(true);
            setTimeout(() => setCopiedToken(false), 2000);
        } catch {
            // ignore
        }
    };

    const handleCopyLogin = () => {
        const t = loginTokenRef.current;
        if (!t) {
            setLoginError(tr("No active session. Sign in again."));
            return;
        }
        setLoginError(null);
        try {
            void navigator.clipboard.writeText(t).then(() => {
                setLoginCopied(true);
                setTimeout(() => setLoginCopied(false), 2000);
            });
        } catch {
            setLoginError(tr("Could not copy to clipboard."));
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

    const activeTokens = tokens.filter(
        (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now())
    );

    return (
        <div className={`sa-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* Header */}
            <div className="sa-section-header">
                <div className="flex items-center justify-between">
                    <div className="sa-section-caption">
                        {tr("Apple Siri Shortcuts Integration")}
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                        {tr("iOS Voice Actions")}
                    </span>
                </div>
                <p className="sa-section-desc">
                    {tr("Search inventory, count minerals, or inspect item details hands-free from iPhone or Apple Watch.")}
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

            {/* 1. Hero Setup Card (1-Click Prompt Copy) */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-white/15 flex items-center justify-center text-cyan-400 shrink-0">
                            <Mic size={20} />
                        </div>
                        <div>
                            <div className="text-[14px] font-semibold text-white">
                                {tr("1-Click Siri Shortcuts Setup")}
                            </div>
                            <div className="text-[11px] text-white/60">
                                {tr("Paste prompt directly into iOS Shortcuts (Describe a Shortcut)")}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="h-10 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-[12px] flex items-center gap-1.5 transition-all shadow-sm shadow-cyan-500/20 shrink-0 active:scale-95"
                    >
                        {promptCopied ? (
                            <>
                                <Check size={14} />
                                <span>{tr("Copied Prompt!")}</span>
                            </>
                        ) : (
                            <>
                                <Copy size={14} />
                                <span>{tr("Copy Setup Prompt")}</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/50 pt-1 border-t border-white/5">
                    <span>{tr("Actions: Search Inventory · Total Counts · Item Spec Lookup")}</span>
                    <button
                        type="button"
                        onClick={() => setShowGuide((prev) => !prev)}
                        className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                    >
                        {showGuide ? tr("Hide steps") : tr("How it works")}
                    </button>
                </div>

                {/* Step-by-Step Guide Drawer */}
                {showGuide && (
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-[11px] text-white/80 animate-fadeIn">
                        <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5">1</span>
                            <span>{tr("Open iOS Shortcuts app, tap + then tap 'Describe a Shortcut'.")}</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5">2</span>
                            <span>{tr("Paste the copied prompt. Shortcuts builds the workflow automatically.")}</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5">3</span>
                            <span>{tr("Create a token below and replace '<PASTE YOUR SIRI TOKEN HERE>'.")}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. One-Time Token Callout (when newly created) */}
            {createdToken && (
                <div role="status" className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-emerald-400" />
                            <span className="text-[13px] font-semibold text-emerald-300">
                                {tr("One-Time Siri Token Created")}
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
                            onClick={handleCopyToken}
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

            {/* 3. Token Creation Row */}
            <form onSubmit={handleCreate} className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/5 border border-white/10">
                <input
                    type="text"
                    maxLength={40}
                    placeholder={tr("Device label (e.g. iPhone 16 Pro, iPad)")}
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

            {/* 4. Collapsible Token History & Revocation */}
            <div className="pt-1">
                <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
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
                            showHistory ? 'rotate-180' : ''
                        }`}
                    />
                </button>

                {showHistory && (
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
                                                {token.prefix && (
                                                    <span className="font-mono text-[9px] text-white/40">
                                                        ({token.prefix}...)
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

            {/* 5. Developer Session Token Helper (if admin/developer) */}
            {canCopyLogin && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-[11px] text-white/60">
                    <div className="flex items-center gap-2">
                        <Terminal size={13} className="text-cyan-400" />
                        <span>{tr("Developer Session Token (PC Smoke Testing)")}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleCopyLogin}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-medium transition-colors"
                    >
                        {loginCopied ? tr("Copied Session Token") : tr("Copy Token")}
                    </button>
                </div>
            )}
        </div>
    );
};
