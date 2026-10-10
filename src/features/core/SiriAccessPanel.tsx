import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';
import { Shield, AlertCircle, X, Terminal } from 'lucide-react';

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
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

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

    const handleCopyToken = async () => {
        if (!createdToken) return;
        try {
            await navigator.clipboard.writeText(createdToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Ignore clipboard errors; never log token
        }
    };

    const formatDate = (isoString?: string | null): string => {
        if (!isoString) return tr("never");
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            return d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return isoString;
        }
    };

    return (
        <div className={`p-4 md:p-8 space-y-6 ${L ? 'text-black' : 'text-white'}`}>
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <Terminal size={20} className="text-blue-500" />
                <div>
                    <h2 className={`text-base md:text-lg font-black uppercase tracking-[0.2em] ${L ? 'text-black' : 'text-white'}`}>
                        {tr("Siri Shortcuts")}
                    </h2>
                    <p className={`text-xs ${L ? 'text-black/60' : 'text-white/60'}`}>
                        {tr("Manage personal tokens for iPhone Shortcuts and Siri voice actions.")}
                    </p>
                </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="shrink-0 text-red-400" />
                        <span>{errorMessage}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        aria-label={tr("Dismiss")}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Newly Created Token Display */}
            {createdToken && (
                <div className={`p-4 md:p-5 rounded-2xl border transition-all ${
                    L
                        ? 'bg-blue-50/80 border-blue-200 text-black'
                        : 'bg-blue-950/40 border-blue-500/40 text-white'
                }`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                            <Shield size={18} className="text-blue-400 shrink-0" />
                            <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                                {tr("New Token Created")}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCreatedToken(null)}
                            aria-label={tr("Dismiss")}
                            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                L ? 'text-black/50 hover:text-black hover:bg-black/5' : 'text-white/50 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <p className={`text-xs mb-3 ${L ? 'text-black/80' : 'text-white/80'}`}>
                        {tr("This token is shown only now. Paste it into your Shortcut.")}
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl border font-mono text-xs md:text-sm select-all break-all flex items-center ${
                            L ? 'bg-white border-black/10 text-black' : 'bg-black/40 border-white/15 text-blue-200'
                        }`}>
                            {createdToken}
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyToken}
                            className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 shrink-0"
                        >
                            {copied ? tr("Copied") : tr("Copy")}
                        </button>
                    </div>
                </div>
            )}

            {/* Creation Form */}
            <form onSubmit={handleCreate} className={`p-4 md:p-6 rounded-2xl border ${L ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                    <div className="flex-1 flex flex-col">
                        <label htmlFor="siri-token-label" className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ${L ? 'text-black/70' : 'text-white/70'}`}>
                            {tr("Token Label")}
                        </label>
                        <input
                            id="siri-token-label"
                            type="text"
                            maxLength={40}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            disabled={isBusy}
                            className={`min-h-[44px] px-4 rounded-xl border text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                                L
                                    ? 'bg-white border-black/15 text-black placeholder:text-black/40'
                                    : 'bg-black/30 border-white/15 text-white placeholder:text-white/40'
                            }`}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isBusy || !label.trim()}
                        className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 shrink-0"
                    >
                        {isCreating ? tr("Creating...") : tr("Create")}
                    </button>
                </div>
            </form>

            {/* Token List */}
            <div className="space-y-3">
                <div className="flex items-center justify-between pb-2">
                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${L ? 'text-black/70' : 'text-white/70'}`}>
                        {tr("Personal Tokens")}
                    </h3>
                </div>

                {isLoading && tokens.length === 0 ? (
                    <div className={`p-8 text-center text-xs font-black uppercase tracking-wider ${L ? 'text-black/40' : 'text-white/40'}`}>
                        {tr("Loading tokens...")}
                    </div>
                ) : tokens.length === 0 ? (
                    <div className={`p-8 text-center text-xs rounded-2xl border ${L ? 'border-black/10 text-black/40 bg-black/5' : 'border-white/10 text-white/40 bg-white/5'}`}>
                        {tr("No Siri tokens created yet.")}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tokens.map((token) => {
                            const isRevoked = Boolean(token.revoked_at);
                            const isExpired = !isRevoked && Boolean(token.expires_at) && new Date(token.expires_at).getTime() <= Date.now();
                            const isInactive = isRevoked || isExpired;

                            return (
                                <div
                                    key={token.id}
                                    className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-opacity ${
                                        isInactive ? 'opacity-50' : 'opacity-100'
                                    } ${
                                        L ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'
                                    }`}
                                >
                                    <div className="space-y-1.5 min-w-0">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className={`text-sm font-black uppercase tracking-wide truncate ${L ? 'text-black' : 'text-white'}`}>
                                                {token.label}
                                            </span>
                                            <span className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
                                                L ? 'bg-black/10 border-black/20 text-black/80' : 'bg-white/10 border-white/20 text-white/80'
                                            }`}>
                                                {token.prefix}
                                            </span>
                                        </div>
                                        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${L ? 'text-black/60' : 'text-white/60'}`}>
                                            <span>
                                                <strong className={L ? 'text-black/80' : 'text-white/80'}>{tr("Created")}:</strong>{' '}
                                                {formatDate(token.created_at)}
                                            </span>
                                            <span>
                                                <strong className={L ? 'text-black/80' : 'text-white/80'}>{tr("Last used")}:</strong>{' '}
                                                {token.last_used_at ? formatDate(token.last_used_at) : tr("never")}
                                            </span>
                                            <span>
                                                <strong className={L ? 'text-black/80' : 'text-white/80'}>{tr("Expires")}:</strong>{' '}
                                                {formatDate(token.expires_at)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end shrink-0">
                                        {isInactive ? (
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                                                isRevoked
                                                    ? 'text-red-400 border-red-500/30 bg-red-500/10'
                                                    : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                            }`}>
                                                {isRevoked ? tr("Revoked") : tr("Expired")}
                                            </span>
                                        ) : confirmRevokeId === token.id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => handleRevoke(token.id)}
                                                    className="min-h-[44px] px-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
                                                >
                                                    {tr("Confirm revoke")}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => setConfirmRevokeId(null)}
                                                    className={`min-h-[44px] px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50 ${
                                                        L ? 'bg-black/10 hover:bg-black/20 text-black/70' : 'bg-white/10 hover:bg-white/20 text-white/70'
                                                    }`}
                                                >
                                                    {tr("Cancel")}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => setConfirmRevokeId(token.id)}
                                                className="min-h-[44px] px-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
                                            >
                                                {tr("Revoke")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
