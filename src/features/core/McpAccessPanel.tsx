import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { themeAtom, languageAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';
import { AlertCircle, X, Check, Copy, Loader2, ChevronDown } from 'lucide-react';
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

export const McpAccessPanel: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const L = theme === 'aqua';

    const [tokens, setTokens] = useState<McpTokenItem[]>([]);
    const [label, setLabel] = useState<string>('Claude Code');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const setTokenPending = useSetAtom(siriTokenPendingAtom);
    const [language] = useAtom(languageAtom);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [copiedToken, setCopiedToken] = useState<boolean>(false);
    const [copiedCommand, setCopiedCommand] = useState<boolean>(false);
    const [copiedHelpCommand, setCopiedHelpCommand] = useState<boolean>(false);
    const [copiedPsVariant, setCopiedPsVariant] = useState<boolean>(false);

    const [showTokenFallback, setShowTokenFallback] = useState<boolean>(false);
    const [showCommandFallback, setShowCommandFallback] = useState<boolean>(false);
    const [showHelpFallback, setShowHelpFallback] = useState<boolean>(false);
    const [showPsFallback, setShowPsFallback] = useState<boolean>(false);

    const [isHistoryDisclosureOpen, setIsHistoryDisclosureOpen] = useState<boolean>(false);

    const tokenFallbackRef = useRef<HTMLTextAreaElement>(null);
    const commandFallbackRef = useRef<HTMLTextAreaElement>(null);
    const helpFallbackRef = useRef<HTMLTextAreaElement>(null);
    const psFallbackRef = useRef<HTMLTextAreaElement>(null);

    const copyTokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copyCommandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copyHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copyPsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isBusy = isLoading || isCreating || revokingId !== null;

    const copyFallback = (text: string): boolean => {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.top = '-9999px';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch {
            return false;
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

    // Escape cancels inline revoke confirmation in capture phase
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

    // Keep settings dialog open while a created one-time token is on screen
    useEffect(() => {
        setTokenPending(createdToken !== null);
    }, [createdToken, setTokenPending]);

    useEffect(() => {
        return () => {
            setTokenPending(false);
            if (copyTokenTimerRef.current) clearTimeout(copyTokenTimerRef.current);
            if (copyCommandTimerRef.current) clearTimeout(copyCommandTimerRef.current);
            if (copyHelpTimerRef.current) clearTimeout(copyHelpTimerRef.current);
            if (copyPsTimerRef.current) clearTimeout(copyPsTimerRef.current);
        };
    }, [setTokenPending]);

    useEffect(() => {
        if (showTokenFallback && tokenFallbackRef.current) {
            tokenFallbackRef.current.focus();
            tokenFallbackRef.current.select();
        }
    }, [showTokenFallback]);

    useEffect(() => {
        if (showCommandFallback && commandFallbackRef.current) {
            commandFallbackRef.current.focus();
            commandFallbackRef.current.select();
        }
    }, [showCommandFallback]);

    useEffect(() => {
        if (showHelpFallback && helpFallbackRef.current) {
            helpFallbackRef.current.focus();
            helpFallbackRef.current.select();
        }
    }, [showHelpFallback]);

    useEffect(() => {
        if (showPsFallback && psFallbackRef.current) {
            psFallbackRef.current.focus();
            psFallbackRef.current.select();
        }
    }, [showPsFallback]);

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
                setShowTokenFallback(false);
                setShowCommandFallback(false);
                setShowPsFallback(false);
                setIsHistoryDisclosureOpen(false);
                setLabel('Claude Code');
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

    const handleCopyToken = async () => {
        if (!createdToken) return;
        try {
            await navigator.clipboard.writeText(createdToken);
            setCopiedToken(true);
            setShowTokenFallback(false);
            if (copyTokenTimerRef.current) clearTimeout(copyTokenTimerRef.current);
            copyTokenTimerRef.current = setTimeout(() => setCopiedToken(false), 2000);
        } catch {
            const ok = copyFallback(createdToken);
            if (ok) {
                setCopiedToken(true);
                setShowTokenFallback(false);
                if (copyTokenTimerRef.current) clearTimeout(copyTokenTimerRef.current);
                copyTokenTimerRef.current = setTimeout(() => setCopiedToken(false), 2000);
            } else {
                setShowTokenFallback(true);
            }
        }
    };

    const mcpEndpoint = resolveMcpEndpoint(import.meta.env.VITE_SUPABASE_URL);

    const readyCommand = createdToken
        ? `claude mcp add --transport http --scope user onyx ${mcpEndpoint} --header "Authorization: Bearer ${createdToken}"`
        : '';

    const psVariantCommand = [
        '$t = Read-Host "MCP token" -AsSecureString',
        "[Environment]::SetEnvironmentVariable('ONYX_MCP_TOKEN', [System.Net.NetworkCredential]::new('', $t).Password, 'User')",
        `claude mcp add --transport http --scope user onyx ${mcpEndpoint} --header 'Authorization: Bearer \${ONYX_MCP_TOKEN}'`
    ].join('\n');

    const handleCopyCommand = async () => {
        if (!readyCommand) return;
        try {
            await navigator.clipboard.writeText(readyCommand);
            setCopiedCommand(true);
            setShowCommandFallback(false);
            if (copyCommandTimerRef.current) clearTimeout(copyCommandTimerRef.current);
            copyCommandTimerRef.current = setTimeout(() => setCopiedCommand(false), 2000);
        } catch {
            const ok = copyFallback(readyCommand);
            if (ok) {
                setCopiedCommand(true);
                setShowCommandFallback(false);
                if (copyCommandTimerRef.current) clearTimeout(copyCommandTimerRef.current);
                copyCommandTimerRef.current = setTimeout(() => setCopiedCommand(false), 2000);
            } else {
                setShowCommandFallback(true);
            }
        }
    };

    const handleCopyPsVariant = async () => {
        try {
            await navigator.clipboard.writeText(psVariantCommand);
            setCopiedPsVariant(true);
            setShowPsFallback(false);
            if (copyPsTimerRef.current) clearTimeout(copyPsTimerRef.current);
            copyPsTimerRef.current = setTimeout(() => setCopiedPsVariant(false), 2000);
        } catch {
            const ok = copyFallback(psVariantCommand);
            if (ok) {
                setCopiedPsVariant(true);
                setShowPsFallback(false);
                if (copyPsTimerRef.current) clearTimeout(copyPsTimerRef.current);
                copyPsTimerRef.current = setTimeout(() => setCopiedPsVariant(false), 2000);
            } else {
                setShowPsFallback(true);
            }
        }
    };

    const helpCommand =
        `claude mcp add --transport http --scope user onyx ${mcpEndpoint} --header "Authorization: Bearer <your MCP token>"`;

    const handleCopyHelpCommand = async () => {
        try {
            await navigator.clipboard.writeText(helpCommand);
            setCopiedHelpCommand(true);
            setShowHelpFallback(false);
            if (copyHelpTimerRef.current) clearTimeout(copyHelpTimerRef.current);
            copyHelpTimerRef.current = setTimeout(() => setCopiedHelpCommand(false), 2000);
        } catch {
            const ok = copyFallback(helpCommand);
            if (ok) {
                setCopiedHelpCommand(true);
                setShowHelpFallback(false);
                if (copyHelpTimerRef.current) clearTimeout(copyHelpTimerRef.current);
                copyHelpTimerRef.current = setTimeout(() => setCopiedHelpCommand(false), 2000);
            } else {
                setShowHelpFallback(true);
            }
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

    return (
        <div className={`sa-panel ma-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* Header Section */}
            <div className="sa-section-header">
                <div className="sa-section-caption">
                    {tr("MCP access")}
                </div>
                <p className="sa-section-desc">
                    {tr("Personal tokens let Claude Code or another MCP client read Onyx data with your role. They last 180 days and you can revoke them here.")}
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
                <div role="status" className="sa-callout ma-callout">
                    <div className="sa-callout-header">
                        <h3 className="sa-callout-title">
                            {tr("Copy your token now")}
                        </h3>
                        <p className="sa-callout-desc">
                            {tr("It is shown only once")}
                        </p>
                    </div>

                    {/* Token block */}
                    <div className="sa-callout-code ma-code-block">
                        {createdToken}
                    </div>

                    <div className="sa-callout-actions">
                        <button
                            type="button"
                            onClick={handleCopyToken}
                            className="sa-btn-secondary"
                            aria-live="polite"
                        >
                            {copiedToken ? (
                                <>
                                    <Check size={16} aria-hidden="true" />
                                    <span>{tr("Copied")}</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={16} aria-hidden="true" />
                                    <span>{tr("Copy token")}</span>
                                </>
                            )}
                        </button>
                    </div>

                    {showTokenFallback && (
                        <div className="ma-fallback-wrap">
                            <textarea
                                ref={tokenFallbackRef}
                                readOnly
                                value={createdToken}
                                className="ma-fallback-textarea"
                                rows={3}
                                aria-label={tr("Copy token")}
                                onFocus={(e) => e.currentTarget.select()}
                            />
                        </div>
                    )}

                    {/* Ready command block */}
                    <div className="sa-callout-code ma-code-block">
                        {readyCommand}
                    </div>

                    <div className="sa-callout-actions">
                        <button
                            type="button"
                            onClick={handleCopyCommand}
                            className="sa-btn-secondary"
                            aria-live="polite"
                        >
                            {copiedCommand ? (
                                <>
                                    <Check size={16} aria-hidden="true" />
                                    <span>{tr("Copied")}</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={16} aria-hidden="true" />
                                    <span>{tr("Copy command")}</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCreatedToken(null);
                                setShowTokenFallback(false);
                                setShowCommandFallback(false);
                                setShowPsFallback(false);
                                setIsHistoryDisclosureOpen(false);
                            }}
                            className="sa-btn-plain"
                        >
                            {tr("Done")}
                        </button>
                    </div>

                    {showCommandFallback && (
                        <div className="ma-fallback-wrap">
                            <textarea
                                ref={commandFallbackRef}
                                readOnly
                                value={readyCommand}
                                className="ma-fallback-textarea"
                                rows={4}
                                aria-label={tr("Copy command")}
                                onFocus={(e) => e.currentTarget.select()}
                            />
                        </div>
                    )}

                    {/* Disclosure: Keep token out of command history (P1) */}
                    <div className="ma-disclosure-wrap">
                        <button
                            type="button"
                            aria-expanded={isHistoryDisclosureOpen}
                            aria-controls="mcp-history-disclosure-body"
                            onClick={() => setIsHistoryDisclosureOpen((prev) => !prev)}
                            className="ma-disclosure-btn"
                        >
                            <ChevronDown
                                size={14}
                                className={isHistoryDisclosureOpen ? 'ma-disclosure-icon-open' : 'ma-disclosure-icon'}
                                aria-hidden="true"
                            />
                            <span>{tr("Keep the token out of your command history")}</span>
                        </button>

                        {isHistoryDisclosureOpen && (
                            <div id="mcp-history-disclosure-body" className="ma-disclosure-body">
                                <pre className="sa-callout-code ma-code-block ma-code-multiline">
                                    {psVariantCommand}
                                </pre>

                                <div className="sa-callout-actions">
                                    <button
                                        type="button"
                                        onClick={handleCopyPsVariant}
                                        className="sa-btn-secondary"
                                        aria-live="polite"
                                    >
                                        {copiedPsVariant ? (
                                            <>
                                                <Check size={16} aria-hidden="true" />
                                                <span>{tr("Copied")}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={16} aria-hidden="true" />
                                                <span>{tr("Copy commands")}</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {showPsFallback && (
                                    <div className="ma-fallback-wrap">
                                        <textarea
                                            ref={psFallbackRef}
                                            readOnly
                                            value={psVariantCommand}
                                            className="ma-fallback-textarea"
                                            rows={4}
                                            aria-label={tr("Copy commands")}
                                            onFocus={(e) => e.currentTarget.select()}
                                        />
                                    </div>
                                )}

                                <p className="sa-prompt-note ma-callout-note">
                                    {tr("Open a new terminal before starting Claude Code.")}
                                </p>
                            </div>
                        )}
                    </div>

                    <p className="sa-prompt-note ma-callout-note">
                        {tr("If onyx is already added, run: claude mcp remove onyx --scope user first. Then start a new Claude Code session.")}
                    </p>
                    <p className="sa-prompt-note ma-callout-note">
                        {tr("Check with: claude mcp get onyx")}
                    </p>
                </div>
            )}

            {/* Creation Row Card */}
            <div className="sa-card">
                <form onSubmit={handleCreate} className="sa-create-form">
                    <div className="sa-field-wrap">
                        <input
                            id="mcp-token-label"
                            type="text"
                            maxLength={40}
                            placeholder="Claude Code"
                            aria-label={tr("Token Label")}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            disabled={isBusy || createdToken !== null}
                            className="sa-input"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isBusy || !label.trim() || createdToken !== null}
                        className="sa-btn-primary"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 size={16} className="sa-spinner" aria-hidden="true" />
                                <span>{tr("Creating...")}</span>
                            </>
                        ) : (
                            <span>{tr("Create MCP token")}</span>
                        )}
                    </button>
                </form>
            </div>

            {/* Help Card when no token is active */}
            {!createdToken && (
                <div className="sa-section">
                    <div className="sa-section-caption">
                        {tr("Connect Claude Code")}
                    </div>
                    <div className="sa-card ma-help-card">
                        <div className="sa-callout-code ma-code-block">
                            {helpCommand}
                        </div>
                        <div className="sa-prompt-actions ma-help-actions">
                            <button
                                type="button"
                                onClick={handleCopyHelpCommand}
                                className="sa-btn-secondary"
                                aria-live="polite"
                            >
                                {copiedHelpCommand ? (
                                    <>
                                        <Check size={16} aria-hidden="true" />
                                        <span>{tr("Copied")}</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={16} aria-hidden="true" />
                                        <span>{tr("Copy command")}</span>
                                    </>
                                )}
                            </button>
                        </div>
                        {showHelpFallback && (
                            <div className="ma-fallback-wrap">
                                <textarea
                                    ref={helpFallbackRef}
                                    readOnly
                                    value={helpCommand}
                                    className="ma-fallback-textarea"
                                    rows={4}
                                    aria-label={tr("Copy command")}
                                    onFocus={(e) => e.currentTarget.select()}
                                />
                            </div>
                        )}
                        <p className="sa-prompt-note ma-help-note">
                            {tr("Check it with: claude mcp list")}
                        </p>
                    </div>
                </div>
            )}

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
                            {tr("No MCP tokens created yet.")}
                        </div>
                    ) : (
                        tokens.map((token) => {
                            const isRevoked = Boolean(token.revoked_at);
                            const isExpired = !isRevoked && Boolean(token.expires_at) && new Date(token.expires_at).getTime() <= Date.now();
                            const isActive = !isRevoked && !isExpired;
                            const prefix = token.token_prefix || token.prefix || '';

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
                                            {prefix && (
                                                <span className={`sa-token-prefix ${isRevoked ? 'sa-revoked-dim' : ''}`}>
                                                    {prefix}
                                                </span>
                                            )}
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
                <p className="sa-prompt-note ma-tokens-note">
                    {tr("Revoking a token stops it working. Also run: claude mcp remove onyx --scope user")}
                </p>
            </div>
        </div>
    );
};
