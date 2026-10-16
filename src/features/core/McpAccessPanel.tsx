import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { languageAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr, trf } from '../../lib/i18n';
import {
    AlertCircle,
    X,
    Check,
    Copy,
    Loader2,
    ChevronRight,
    Globe,
} from 'lucide-react';
import { siriTokenPendingAtom } from './siriState';
import { resolveMcpEndpoint } from './mcpEndpoint';

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
    const [tokens, setTokens] = useState<McpTokenItem[]>([]);
    const [label, setLabel] = useState<string>('Cursor / Antigravity');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const setTokenPending = useSetAtom(siriTokenPendingAtom);
    const [language] = useAtom(languageAtom);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [copiedToken, setCopiedToken] = useState<boolean>(false);
    const [copiedEndpoint, setCopiedEndpoint] = useState<boolean>(false);
    const [copiedCursor, setCopiedCursor] = useState<boolean>(false);
    const [copiedClaude, setCopiedClaude] = useState<boolean>(false);
    const [copiedColibri, setCopiedColibri] = useState<boolean>(false);
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

                {/* 1. Endpoint row */}
                <div className="sk-row">
                    <div className="sk-row-icon">
                        <Globe size={14} />
                    </div>
                    <div className="sk-row-label">
                        <span className="sk-row-title">{tr("Endpoint")}</span>
                    </div>
                    <div className="sk-row-value">
                        <span className="sk-mono sk-truncate" title={mcpEndpoint}>
                            {mcpEndpoint}
                        </span>
                        <button
                            type="button"
                            className="sk-btn"
                            data-icon-only
                            aria-label={tr("Copy URL")}
                            title={tr("Copy URL")}
                            onClick={() =>
                                copyText(mcpEndpoint, () => {
                                    setCopiedEndpoint(true);
                                    setTimeout(() => setCopiedEndpoint(false), 1800);
                                })
                            }
                        >
                            {copiedEndpoint ? <Check size={14} /> : <Copy size={14} />}
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
                                placeholder={tr("Token label (e.g. Cursor, Claude)")}
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
                            disabled={isBusy || !label.trim() || createdToken !== null || activeTokens.length >= 5}
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
                                onClick={() =>
                                    copyText(createdToken, () => {
                                        setCopiedToken(true);
                                        setTimeout(() => setCopiedToken(false), 1800);
                                    })
                                }
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
                            const prefix = token.token_prefix || token.prefix || '';

                            return (
                                <div key={token.id} className="sk-row">
                                    <div className="sk-row-label">
                                        <span className="sk-row-title">{token.label}</span>
                                        <span className="sk-row-sub">
                                            {prefix ? `${prefix}… · ` : ''}{formatDate(token.created_at)}
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

                {/* 4. Client setup disclosure */}
                <details className="sk-disclosure">
                    <summary className="sk-row">
                        <ChevronRight size={14} className="sk-chevron" />
                        <span className="sk-row-label">
                            <span className="sk-row-title">{tr("Client setup")}</span>
                            <span className="sk-row-sub">{tr("Cursor, Claude and Colibrì config")}</span>
                        </span>
                    </summary>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">Cursor / Antigravity</span>
                            <span className="sk-row-sub sk-mono sk-truncate">{tr("JSON configuration")}</span>
                        </div>
                        <div className="sk-row-value">
                            <button
                                type="button"
                                className="sk-btn"
                                onClick={() =>
                                    copyText(getSnippetForTab('cursor'), () => {
                                        setCopiedCursor(true);
                                        setTimeout(() => setCopiedCursor(false), 1800);
                                    })
                                }
                                aria-label={tr("Copy Cursor config")}
                            >
                                {copiedCursor ? <Check size={12} /> : <Copy size={12} />}
                                <span>{copiedCursor ? tr("Copied") : tr("Copy")}</span>
                            </button>
                        </div>
                    </div>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">Claude CLI</span>
                            <span className="sk-row-sub sk-mono sk-truncate">{getSnippetForTab('claude')}</span>
                        </div>
                        <div className="sk-row-value">
                            <button
                                type="button"
                                className="sk-btn"
                                onClick={() =>
                                    copyText(getSnippetForTab('claude'), () => {
                                        setCopiedClaude(true);
                                        setTimeout(() => setCopiedClaude(false), 1800);
                                    })
                                }
                                aria-label={tr("Copy Claude command")}
                            >
                                {copiedClaude ? <Check size={12} /> : <Copy size={12} />}
                                <span>{copiedClaude ? tr("Copied") : tr("Copy")}</span>
                            </button>
                        </div>
                    </div>
                    <div className="sk-row">
                        <div className="sk-row-label">
                            <span className="sk-row-title">Colibrì STDIO</span>
                            <span className="sk-row-sub sk-mono sk-truncate">{getSnippetForTab('colibri')}</span>
                        </div>
                        <div className="sk-row-value">
                            <button
                                type="button"
                                className="sk-btn"
                                onClick={() =>
                                    copyText(getSnippetForTab('colibri'), () => {
                                        setCopiedColibri(true);
                                        setTimeout(() => setCopiedColibri(false), 1800);
                                    })
                                }
                                aria-label={tr("Copy Colibri command")}
                            >
                                {copiedColibri ? <Check size={12} /> : <Copy size={12} />}
                                <span>{copiedColibri ? tr("Copied") : tr("Copy")}</span>
                            </button>
                        </div>
                    </div>
                </details>

                {showFallback && (
                    <div className="sk-row-editor">
                        <textarea
                            ref={fallbackRef}
                            readOnly
                            value={showFallback}
                            className="sk-mono"
                            style={{
                                width: '100%',
                                height: '48px',
                                padding: '6px',
                                fontSize: '11px',
                                background: 'transparent',
                                border: '1px solid var(--ss-sep)',
                                borderRadius: '6px',
                                color: 'var(--ss-fg)',
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                    </div>
                )}
            </div>

            {createdToken && (
                <div className="sk-footnote" role="alert">
                    {tr("Copy your token before closing. It is shown only once.")}
                </div>
            )}
        </>
    );
};
