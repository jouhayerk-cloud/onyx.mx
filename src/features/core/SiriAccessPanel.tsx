import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { languageAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr, trf } from '../../lib/i18n';
import {
    AlertCircle,
    X,
    Check,
    Copy,
    Loader2,
    Mic,
    ChevronRight,
    Terminal,
} from 'lucide-react';
import { buildSiriSetupPrompt, resolveSiriEndpoint } from './siriPrompt';
import { siriTokenPendingAtom } from './siriState';

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

    const handleCreate = async () => {
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

    const promptText = buildSiriSetupPrompt({
        endpoint: resolveSiriEndpoint(import.meta.env.VITE_SUPABASE_URL),
        lang: language === 'es' ? 'es' : 'en',
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
    const hasActiveToken = activeTokens.length > 0;

    return (
        <>
            <div className="sk-group">
                {errorMessage && (
                    <div className="sk-row" role="alert">
                        <AlertCircle size={14} className="sk-row-icon" style={{ color: 'var(--ss-danger)' }} />
                        <div className="sk-row-label">
                            <span className="sk-row-title" style={{ color: 'var(--ss-danger)' }}>
                                {errorMessage}
                            </span>
                        </div>
                        <div className="sk-row-value">
                            <button
                                type="button"
                                className="sk-btn"
                                data-icon-only
                                aria-label={tr("Dismiss")}
                                onClick={() => setErrorMessage(null)}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {/* 1. Voice shortcuts row */}
                <div className="sk-row">
                    <div className="sk-row-icon">
                        <Mic size={14} />
                    </div>
                    <div className="sk-row-label">
                        <span className="sk-row-title">{tr("Voice shortcuts")}</span>
                        <span className="sk-row-sub">
                            {tr("Voice inventory search & spec lookup")}
                        </span>
                    </div>
                    <div className="sk-row-value">
                        {canCopyLogin && (
                            <button
                                type="button"
                                className="sk-btn"
                                onClick={handleCopyLogin}
                                title={tr("Copy Developer Session JWT")}
                                aria-label={tr("Copy Developer Session JWT")}
                            >
                                <Terminal size={12} />
                                <span>{loginCopied ? tr("Copied") : 'JWT'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="sk-btn"
                            data-variant="primary"
                            onClick={() => void handleCopyPrompt()}
                        >
                            {promptCopied ? <Check size={12} /> : <Copy size={12} />}
                            <span>{promptCopied ? tr("Copied") : tr("Copy prompt")}</span>
                        </button>
                    </div>
                </div>

                {/* 2. Token creation row */}
                <div className="sk-row">
                    <div className="sk-row-label" style={{ flex: '0 0 auto' }}>
                        <span className="sk-row-title">{tr("Token")}</span>
                        <span className="sk-row-sub">
                            {hasActiveToken
                                ? (activeTokens.length > 1 ? trf("{n} active", { n: activeTokens.length }) : tr("1 active"))
                                : tr("No active token")}
                        </span>
                    </div>
                    <div className="sk-row-value" style={{ flex: '1 1 auto' }}>
                        <div className="sk-field">
                            <input
                                type="text"
                                maxLength={40}
                                placeholder={tr("Device (e.g. Ramses iPhone)")}
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleCreate();
                                    }
                                }}
                                disabled={isBusy || createdToken !== null}
                                aria-label={tr("Token label")}
                            />
                        </div>
                        <button
                            type="button"
                            className="sk-btn"
                            data-variant={hasActiveToken ? undefined : 'primary'}
                            onClick={() => void handleCreate()}
                            disabled={isBusy || createdToken !== null || !label.trim() || activeTokens.length >= 5}
                            title={activeTokens.length >= 5 ? tr("Max 5 active tokens reached. Revoke one first.") : undefined}
                        >
                            {isCreating ? <Loader2 size={12} className="animate-spin" /> : null}
                            <span>{hasActiveToken ? tr("New token") : tr("Create")}</span>
                        </button>
                    </div>
                </div>

                {/* One-time token reveal flow */}
                {createdToken && (
                    <div className="sk-row-editor" role="status">
                        <div className="sk-row-label" style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="sk-badge" data-tone="ok">
                                    {tr("New token")}
                                </span>
                                <span className="sk-row-sub">
                                    {tr("Copy now — will not be shown again")}
                                </span>
                            </div>
                        </div>
                        <div className="sk-row-value" style={{ gap: '6px' }}>
                            <button
                                type="button"
                                className="sk-btn"
                                data-variant="primary"
                                onClick={() => void handleCopyToken()}
                            >
                                {copiedToken ? <Check size={12} /> : <Copy size={12} />}
                                <span>{copiedToken ? tr("Copied") : tr("Copy token")}</span>
                            </button>
                            <button
                                type="button"
                                className="sk-btn"
                                onClick={() => setCreatedToken(null)}
                            >
                                {tr("Done")}
                            </button>
                        </div>
                        <div
                            className="sk-field sk-mono"
                            style={{ width: '100%', flex: '1 1 100%', marginTop: '4px' }}
                        >
                            <input
                                type="text"
                                readOnly
                                value={createdToken}
                                className="sk-mono"
                                onFocus={(e) => e.currentTarget.select()}
                                aria-label={tr("Generated token")}
                            />
                        </div>
                    </div>
                )}

                {/* 3. Token history disclosure */}
                <details className="sk-disclosure">
                    <summary className="sk-row">
                        <ChevronRight size={14} className="sk-chevron" />
                        <span className="sk-row-label">
                            <span className="sk-row-title">{tr("Tokens")}</span>
                            <span className="sk-row-sub">{tr("Active and past tokens")}</span>
                        </span>
                        <span className="sk-row-value">
                            <span className="sk-badge" data-tone={activeTokens.length >= 5 ? 'warn' : undefined}>
                                {activeTokens.length}/5
                            </span>
                        </span>
                    </summary>
                    {tokens.length === 0 ? (
                        <div className="sk-row">
                            <div className="sk-row-label">
                                <span className="sk-row-sub">
                                    {isLoading ? tr("Loading...") : tr("No tokens")}
                                </span>
                            </div>
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
                                <div key={token.id} className="sk-row">
                                    <div className="sk-row-label">
                                        <span className="sk-row-title">{token.label}</span>
                                        <span className="sk-row-sub">
                                            {token.prefix ? `${token.prefix}… · ` : ''}{formatDate(token.created_at)}
                                        </span>
                                    </div>
                                    <div className="sk-row-value">
                                        <span
                                            className="sk-badge"
                                            data-tone={isActive ? 'ok' : isExpired ? 'warn' : undefined}
                                        >
                                            {isActive ? tr("Active") : isExpired ? tr("Expired") : tr("Revoked")}
                                        </span>
                                        {isActive && (
                                            confirmRevokeId === token.id ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="sk-btn"
                                                        data-variant="danger"
                                                        onClick={() => void handleRevoke(token.id)}
                                                        disabled={isBusy}
                                                    >
                                                        {revokingId === token.id ? (
                                                            <Loader2 size={12} className="animate-spin" />
                                                        ) : (
                                                            tr("Confirm")
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="sk-btn"
                                                        data-variant="plain"
                                                        onClick={() => setConfirmRevokeId(null)}
                                                        disabled={isBusy}
                                                    >
                                                        {tr("Cancel")}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="sk-btn"
                                                    data-variant="danger"
                                                    onClick={() => setConfirmRevokeId(token.id)}
                                                    disabled={isBusy}
                                                >
                                                    <span>{tr("Revoke")}</span>
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </details>

                {/* 4. Instructions disclosure */}
                <details className="sk-disclosure">
                    <summary className="sk-row">
                        <ChevronRight size={14} className="sk-chevron" />
                        <span className="sk-row-label">
                            <span className="sk-row-title">{tr("How to set up")}</span>
                            <span className="sk-row-sub">{tr("4 steps to configure iOS Shortcuts")}</span>
                        </span>
                    </summary>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">{tr("1. Generate token")}</span>
                            <span className="sk-row-sub">{tr("Create a Siri token above and copy it.")}</span>
                        </div>
                    </div>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">{tr("2. Copy setup prompt")}</span>
                            <span className="sk-row-sub">{tr("Tap 'Copy prompt' to get shortcut actions.")}</span>
                        </div>
                    </div>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">{tr("3. Open Shortcuts")}</span>
                            <span className="sk-row-sub">{tr("In Apple Shortcuts, create shortcut from prompt.")}</span>
                        </div>
                    </div>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">{tr("4. Paste token")}</span>
                            <span className="sk-row-sub">{tr("Replace the auth placeholder with your token.")}</span>
                        </div>
                    </div>
                </details>
            </div>

            {createdToken && (
                <div className="sk-footnote" role="alert">
                    {tr("Copy your token before closing. It is shown only once.")}
                </div>
            )}
        </>
    );
};
