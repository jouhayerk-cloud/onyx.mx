import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';
import { AlertCircle, X, Check, Copy, Loader2 } from 'lucide-react';
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

    useEffect(() => {
        if (!confirmRevokeId) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setConfirmRevokeId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmRevokeId]);

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
        <div className={`sa-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* Header Section */}
            <div className="sa-section-header">
                <div className="sa-section-caption">
                    {tr("Siri Shortcuts")}
                </div>
                <p className="sa-section-desc">
                    {tr("Manage personal tokens for iPhone Shortcuts and Siri voice actions.")}
                </p>
            </div>

            {/* Error banner */}
            {errorMessage && (
                <div role="alert" className="sa-error-banner">
                    <div className="sa-error-content">
                        <AlertCircle size={16} className="sa-error-icon" aria-hidden="true" />
                        <span className="sa-error-text">{errorMessage}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        aria-label={tr("Dismiss")}
                        title={tr("Dismiss")}
                        className="sa-dismiss-btn"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
            )}

            {/* Newly Created Token Callout Card */}
            {createdToken && (
                <div role="status" className="sa-callout">
                    <div className="sa-callout-header">
                        <h3 className="sa-callout-title">
                            {tr("Copy your token now")}
                        </h3>
                        <p className="sa-callout-desc">
                            {tr("It is shown only once")}
                        </p>
                    </div>
                    <div className="sa-callout-code">
                        {createdToken}
                    </div>
                    <div className="sa-callout-actions">
                        <button
                            type="button"
                            onClick={handleCopyToken}
                            className="sa-btn-secondary"
                        >
                            {copied ? (
                                <>
                                    <Check size={16} aria-hidden="true" />
                                    <span>{tr("Copied")}</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={16} aria-hidden="true" />
                                    <span>{tr("Copy")}</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreatedToken(null)}
                            className="sa-btn-plain"
                        >
                            {tr("Done")}
                        </button>
                    </div>
                </div>
            )}

            {/* Creation Row Card */}
            <div className="sa-card">
                <form onSubmit={handleCreate} className="sa-create-form">
                    <div className="sa-field-wrap">
                        <input
                            id="siri-token-label"
                            type="text"
                            maxLength={40}
                            placeholder="iPhone"
                            aria-label={tr("Token Label")}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            disabled={isBusy}
                            className="sa-input"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isBusy || !label.trim()}
                        className="sa-btn-primary"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 size={16} className="sa-spinner" aria-hidden="true" />
                                <span>{tr("Creating...")}</span>
                            </>
                        ) : (
                            <span>{tr("Create token")}</span>
                        )}
                    </button>
                </form>
            </div>

            {/* Token List Section */}
            <div className="sa-section">
                <div className="sa-section-caption">
                    {tr("Personal Tokens")}
                </div>
                <div className="sa-card">
                    {isLoading && tokens.length === 0 ? (
                        <div className="sa-empty-row">
                            {tr("Loading tokens...")}
                        </div>
                    ) : tokens.length === 0 ? (
                        <div className="sa-empty-row">
                            {tr("No Siri tokens created yet.")}
                        </div>
                    ) : (
                        tokens.map((token) => {
                            const isRevoked = Boolean(token.revoked_at);
                            const isExpired = !isRevoked && Boolean(token.expires_at) && new Date(token.expires_at).getTime() <= Date.now();
                            const isActive = !isRevoked && !isExpired;

                            if (confirmRevokeId === token.id) {
                                return (
                                    <div key={token.id} className="sa-token-row sa-confirm-mode">
                                        <span className="sa-confirm-text">
                                            {tr("Revoke this token?")}
                                        </span>
                                        <div className="sa-confirm-actions">
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => setConfirmRevokeId(null)}
                                                className="sa-btn-cancel"
                                            >
                                                {tr("Cancel")}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => handleRevoke(token.id)}
                                                className="sa-btn-danger"
                                            >
                                                {revokingId === token.id ? (
                                                    <Loader2 size={14} className="sa-spinner" aria-hidden="true" />
                                                ) : (
                                                    tr("Revoke")
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={token.id} className="sa-token-row">
                                    <div className="sa-token-info">
                                        <div className="sa-token-label-row">
                                            <span className="sa-token-label">{token.label}</span>
                                            <span className={`sa-token-prefix ${isRevoked ? 'sa-revoked-dim' : ''}`}>
                                                {token.prefix}
                                            </span>
                                        </div>
                                        <div className="sa-token-meta">
                                            <span>{tr("Created")}: {formatDate(token.created_at)}</span>
                                            <span className="sa-meta-sep" aria-hidden="true">·</span>
                                            <span>{tr("Last used")}: {token.last_used_at ? formatDate(token.last_used_at) : tr("never")}</span>
                                            <span className="sa-meta-sep" aria-hidden="true">·</span>
                                            <span>{tr("Expires")}: {formatDate(token.expires_at)}</span>
                                        </div>
                                    </div>

                                    <div className="sa-token-actions">
                                        <span className={`sa-status-badge ${isActive ? 'sa-status-active' : isExpired ? 'sa-status-warn' : 'sa-status-revoked'} ${isRevoked ? 'sa-revoked-dim' : ''}`}>
                                            {isActive && <Check size={12} className="sa-status-icon" aria-hidden="true" />}
                                            {isExpired && <AlertCircle size={12} className="sa-status-icon" aria-hidden="true" />}
                                            {isRevoked && <X size={12} className="sa-status-icon" aria-hidden="true" />}
                                            <span>{isActive ? tr("Active") : isExpired ? tr("Expired") : tr("Revoked")}</span>
                                        </span>

                                        {isActive && (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => setConfirmRevokeId(token.id)}
                                                className="sa-btn-revoke"
                                            >
                                                {tr("Revoke")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
