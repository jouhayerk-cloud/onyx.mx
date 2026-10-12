import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { AlertCircle, Check, ExternalLink } from 'lucide-react';
import { Field, Input, Select, Key, cx } from '../../components/ui';
import { PROVIDER_INFOS, getProvider } from '../../lib/ai/providers';
import type { ProviderConfig, ProviderId } from '../../lib/ai/providers/types';
import {
    getProviderConfig,
    setProviderConfig,
    hasProviderKey,
    listConfigured,
    AI_CONFIG_EVENT,
} from '../../lib/ai/providerKeys';
import {
    getRoute,
    setRoute,
    ROUTABLE_JOBS,
    type RouteJob,
    type Route,
} from '../../lib/ai/routing';
import './aiProviders.css';

interface TestStatus {
    ok: boolean;
    message: string;
}

export const AiProvidersPanel: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const L = theme === 'aqua';

    // Provider configuration presence
    const [configuredKeys, setConfiguredKeys] = useState<Record<ProviderId, boolean>>(() => ({
        gemini: hasProviderKey('gemini'),
        anthropic: hasProviderKey('anthropic'),
        openai: hasProviderKey('openai'),
        compat: hasProviderKey('compat'),
    }));

    // Local drafts for editable inputs
    const [draftKeys, setDraftKeys] = useState<Record<ProviderId, string>>({
        gemini: '',
        anthropic: '',
        openai: '',
        compat: '',
    });

    const [draftBaseUrls, setDraftBaseUrls] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
        anthropic: '',
        openai: '',
        compat: getProviderConfig('compat').baseUrl || '',
    }));

    const [draftModels, setDraftModels] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
        anthropic: getProviderConfig('anthropic').model || '',
        openai: getProviderConfig('openai').model || '',
        compat: getProviderConfig('compat').model || '',
    }));

    const [replacingKey, setReplacingKey] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
    });

    const [availableModels, setAvailableModels] = useState<Record<ProviderId, string[]>>({
        gemini: [],
        anthropic: [],
        openai: [],
        compat: [],
    });

    const [loadingModels, setLoadingModels] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
    });

    const [testing, setTesting] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
    });

    const [testStatus, setTestStatus] = useState<Record<ProviderId, TestStatus | null>>({
        gemini: null,
        anthropic: null,
        openai: null,
        compat: null,
    });

    // Current routes for each routable job
    const [routes, setRoutes] = useState<Record<RouteJob, Route>>(() => ({
        content: getRoute('content'),
        segmentation: getRoute('segmentation'),
        translate: getRoute('translate'),
        chat: getRoute('chat'),
    }));

    const refreshState = useCallback(() => {
        setConfiguredKeys({
            gemini: hasProviderKey('gemini'),
            anthropic: hasProviderKey('anthropic'),
            openai: hasProviderKey('openai'),
            compat: hasProviderKey('compat'),
        });

        setRoutes({
            content: getRoute('content'),
            segmentation: getRoute('segmentation'),
            translate: getRoute('translate'),
            chat: getRoute('chat'),
        });

        // Sync stored baseUrl and model if not currently dirty in draft
        const compatCfg = getProviderConfig('compat');
        setDraftBaseUrls((prev) => ({
            ...prev,
            compat: prev.compat || compatCfg.baseUrl || '',
        }));

        const anthropicCfg = getProviderConfig('anthropic');
        const openaiCfg = getProviderConfig('openai');
        setDraftModels((prev) => ({
            ...prev,
            anthropic: prev.anthropic || anthropicCfg.model || '',
            openai: prev.openai || openaiCfg.model || '',
            compat: prev.compat || compatCfg.model || '',
        }));
    }, []);

    useEffect(() => {
        refreshState();
        window.addEventListener(AI_CONFIG_EVENT, refreshState);
        return () => window.removeEventListener(AI_CONFIG_EVENT, refreshState);
    }, [refreshState]);

    const handleSave = (id: ProviderId) => {
        const info = PROVIDER_INFOS.find((p) => p.id === id);
        const keyVal = (draftKeys[id] ?? '').trim();
        const baseVal = (draftBaseUrls[id] ?? '').trim();
        const modelVal = (draftModels[id] ?? '').trim();

        const patch: Partial<ProviderConfig> = {};
        if (keyVal) {
            patch.key = keyVal;
        }
        if (info?.needsBaseUrl) {
            patch.baseUrl = baseVal;
        }
        if (id !== 'gemini') {
            patch.model = modelVal;
        }

        setProviderConfig(id, patch);

        // Never keep the draft key in state after saving
        setDraftKeys((prev) => ({ ...prev, [id]: '' }));
        setReplacingKey((prev) => ({ ...prev, [id]: false }));
        setTestStatus((prev) => ({ ...prev, [id]: null }));
    };

    const handleTest = async (id: ProviderId) => {
        setTesting((prev) => ({ ...prev, [id]: true }));
        setTestStatus((prev) => ({ ...prev, [id]: null }));

        try {
            if (id === 'gemini') {
                // Gemini test: a short generateText is not available here, so show whether a key is saved
                const hasKey = hasProviderKey('gemini');
                setTestStatus((prev) => ({
                    ...prev,
                    gemini: hasKey
                        ? { ok: true, message: tr("Gemini key is saved.") }
                        : { ok: false, message: tr("No Gemini key saved.") },
                }));
                return;
            }

            const impl = getProvider(id);
            if (!impl) {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("Provider implementation not available.") },
                }));
                return;
            }

            const currentCfg = getProviderConfig(id);
            const draftKey = (draftKeys[id] ?? '').trim();
            const draftBase = (draftBaseUrls[id] ?? '').trim();
            const draftModel = (draftModels[id] ?? '').trim();

            const cfg: ProviderConfig = {
                key: draftKey || currentCfg.key,
                baseUrl: draftBase || currentCfg.baseUrl,
                model: draftModel || currentCfg.model,
            };

            if (!cfg.key && id !== 'compat') {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("Please enter an API key to test.") },
                }));
                return;
            }

            if (id === 'compat' && !cfg.baseUrl) {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("Please enter a base URL to test.") },
                }));
                return;
            }

            const res = await impl.test(cfg);
            setTestStatus((prev) => ({
                ...prev,
                [id]: {
                    ok: res.ok,
                    message: res.message || (res.ok ? tr("Connected successfully.") : tr("Connection failed.")),
                },
            }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Connection failed.");
            setTestStatus((prev) => ({
                ...prev,
                [id]: { ok: false, message: msg },
            }));
        } finally {
            setTesting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleLoadModels = async (id: ProviderId) => {
        setLoadingModels((prev) => ({ ...prev, [id]: true }));
        try {
            const impl = getProvider(id);
            if (!impl?.listModels) {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("Model listing not supported for this provider.") },
                }));
                return;
            }

            const currentCfg = getProviderConfig(id);
            const draftKey = (draftKeys[id] ?? '').trim();
            const draftBase = (draftBaseUrls[id] ?? '').trim();
            const draftModel = (draftModels[id] ?? '').trim();

            const cfg: ProviderConfig = {
                key: draftKey || currentCfg.key,
                baseUrl: draftBase || currentCfg.baseUrl,
                model: draftModel || currentCfg.model,
            };

            const list = await impl.listModels(cfg);
            if (Array.isArray(list) && list.length > 0) {
                setAvailableModels((prev) => ({ ...prev, [id]: list }));
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: true, message: tr("Models loaded.") },
                }));
            } else {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("No models found.") },
                }));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed to load models.");
            setTestStatus((prev) => ({
                ...prev,
                [id]: { ok: false, message: msg },
            }));
        } finally {
            setLoadingModels((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleRemove = (id: ProviderId) => {
        setProviderConfig(id, null);
        setDraftKeys((prev) => ({ ...prev, [id]: '' }));
        setDraftBaseUrls((prev) => ({ ...prev, [id]: '' }));
        setDraftModels((prev) => ({ ...prev, [id]: '' }));
        setReplacingKey((prev) => ({ ...prev, [id]: false }));
        setTestStatus((prev) => ({ ...prev, [id]: null }));
    };

    const configuredProviderIds = listConfigured();
    const otherConfigured = configuredProviderIds.filter((p) => p !== 'gemini');

    const jobLabels: Record<RouteJob, string> = {
        content: tr("Content generation"),
        segmentation: tr("Image segmentation"),
        translate: tr("Translation"),
        chat: tr("Agent chat (needs a model with tool calling)"),
    };

    return (
        <div className={`sa-panel ap-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* Header Section */}
            <div className="sa-section-header">
                <div className="sa-section-caption">
                    {tr("AI providers")}
                </div>
                <p className="sa-section-desc">
                    {tr("Configure API keys for external AI providers and choose which provider serves each job.")}
                </p>
            </div>

            {/* Warning banner about browser keys and CORS rules */}
            <div className="ap-warning-banner" role="note">
                <AlertCircle size={16} className="ap-warning-icon" aria-hidden="true" />
                <p className="ap-warning-text">
                    {tr("Keys stay in this browser only, and a browser call to a provider can be blocked by that provider's CORS rules (Anthropic is allowed with the direct browser header).")}
                </p>
            </div>

            {/* Providers Card */}
            <div className="sa-section">
                <div className="sa-section-caption">
                    {tr("Configured providers")}
                </div>
                <div className="ap-card">
                    {PROVIDER_INFOS.map((info) => {
                        const hasKey = configuredKeys[info.id];
                        const isReplacing = replacingKey[info.id];
                        const keyDraft = draftKeys[info.id] ?? '';
                        const baseUrlDraft = draftBaseUrls[info.id] ?? '';
                        const modelDraft = draftModels[info.id] ?? '';
                        const isTesting = testing[info.id];
                        const isLoadingMods = loadingModels[info.id];
                        const testResult = testStatus[info.id];
                        const models = availableModels[info.id] || [];

                        const canSave =
                            keyDraft.trim().length > 0 ||
                            hasKey ||
                            (info.needsBaseUrl && baseUrlDraft.trim().length > 0);

                        const canTest =
                            info.id === 'gemini' ||
                            hasKey ||
                            keyDraft.trim().length > 0 ||
                            (info.needsBaseUrl && baseUrlDraft.trim().length > 0);

                        return (
                            <div key={info.id} className="ap-provider-row">
                                {/* Provider header: status dot, name, docs link */}
                                <div className="ap-provider-header">
                                    <div className="ap-provider-title-wrap">
                                        <span
                                            className={cx(
                                                'ap-status-dot',
                                                hasKey ? 'ap-status-dot--active' : 'ap-status-dot--inactive'
                                            )}
                                            aria-label={hasKey ? tr("Key saved") : tr("Not configured")}
                                            title={hasKey ? tr("Key saved") : tr("Not configured")}
                                        />
                                        <span className="ap-provider-name">{info.label}</span>
                                        {info.docsUrl && (
                                            <a
                                                href={info.docsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ap-docs-link"
                                                title={tr("Documentation")}
                                                aria-label={`${info.label} ${tr("Documentation")}`}
                                            >
                                                <ExternalLink size={13} aria-hidden="true" />
                                            </a>
                                        )}
                                    </div>
                                    <div className="ap-provider-meta">
                                        <span className="ap-provider-badge">
                                            {hasKey ? tr("Key saved") : tr("Not configured")}
                                        </span>
                                    </div>
                                </div>

                                {/* Base URL Input (compat only) */}
                                {info.needsBaseUrl && (
                                    <Field
                                        label={tr("Base URL")}
                                        hint={tr("Endpoint for compatible API")}
                                    >
                                        <Input
                                            type="url"
                                            value={baseUrlDraft}
                                            onChange={(e) =>
                                                setDraftBaseUrls((prev) => ({
                                                    ...prev,
                                                    [info.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={info.defaultBaseUrl || "http://localhost:11434/v1"}
                                            aria-label={`${info.label} ${tr("Base URL")}`}
                                            mono
                                        />
                                    </Field>
                                )}

                                {/* Key Field: password input or "Key saved" + "Replace key" */}
                                {hasKey && !isReplacing ? (
                                    <div className="ap-key-saved-row">
                                        <span className="ap-key-saved">
                                            <Check size={14} className="ap-check-icon" aria-hidden="true" />
                                            <span>{tr("Key saved")}</span>
                                        </span>
                                        <Key
                                            size="sm"
                                            variant="quiet"
                                            onClick={() =>
                                                setReplacingKey((prev) => ({
                                                    ...prev,
                                                    [info.id]: true,
                                                }))
                                            }
                                        >
                                            {tr("Replace key")}
                                        </Key>
                                    </div>
                                ) : (
                                    <Field
                                        label={tr("API key")}
                                        hint={info.keyHint ? tr(info.keyHint) : undefined}
                                    >
                                        <div className="ap-key-input-row">
                                            <Input
                                                type="password"
                                                autoComplete="off"
                                                mono
                                                placeholder={info.keyHint}
                                                value={keyDraft}
                                                onChange={(e) =>
                                                    setDraftKeys((prev) => ({
                                                        ...prev,
                                                        [info.id]: e.target.value,
                                                    }))
                                                }
                                                aria-label={`${info.label} ${tr("API key")}`}
                                            />
                                            {isReplacing && (
                                                <Key
                                                    size="sm"
                                                    variant="quiet"
                                                    onClick={() => {
                                                        setReplacingKey((prev) => ({
                                                            ...prev,
                                                            [info.id]: false,
                                                        }));
                                                        setDraftKeys((prev) => ({
                                                            ...prev,
                                                            [info.id]: '',
                                                        }));
                                                    }}
                                                >
                                                    {tr("Cancel")}
                                                </Key>
                                            )}
                                        </div>
                                    </Field>
                                )}

                                {/* Model Field (only for non-Gemini providers) */}
                                {info.id !== 'gemini' && (
                                    <Field
                                        label={tr("Model")}
                                        hint={tr("Default model identifier")}
                                    >
                                        <div className="ap-model-row">
                                            <Input
                                                list={`ap-models-${info.id}`}
                                                value={modelDraft}
                                                onChange={(e) =>
                                                    setDraftModels((prev) => ({
                                                        ...prev,
                                                        [info.id]: e.target.value,
                                                    }))
                                                }
                                                placeholder={tr("Model name")}
                                                aria-label={`${info.label} ${tr("Model")}`}
                                                mono
                                            />
                                            <datalist id={`ap-models-${info.id}`}>
                                                {models.map((m) => (
                                                    <option key={m} value={m} />
                                                ))}
                                            </datalist>
                                            {getProvider(info.id)?.listModels && (
                                                <Key
                                                    size="sm"
                                                    variant="default"
                                                    busy={isLoadingMods}
                                                    onClick={() => handleLoadModels(info.id)}
                                                >
                                                    {tr("Load models")}
                                                </Key>
                                            )}
                                        </div>
                                    </Field>
                                )}

                                {/* Action Buttons: Save, Test, Remove */}
                                <div className="ap-actions-row">
                                    <Key
                                        size="sm"
                                        variant="go"
                                        disabled={!canSave}
                                        onClick={() => handleSave(info.id)}
                                    >
                                        {tr("Save")}
                                    </Key>
                                    <Key
                                        size="sm"
                                        variant="default"
                                        busy={isTesting}
                                        disabled={!canTest}
                                        onClick={() => handleTest(info.id)}
                                    >
                                        {tr("Test")}
                                    </Key>
                                    {hasKey && (
                                        <Key
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleRemove(info.id)}
                                        >
                                            {tr("Remove")}
                                        </Key>
                                    )}
                                </div>

                                {/* Test Status Message */}
                                {testResult && (
                                    <div
                                        className={cx(
                                            'ap-test-banner',
                                            testResult.ok ? 'ap-test-banner--ok' : 'ap-test-banner--err'
                                        )}
                                        role="status"
                                    >
                                        {testResult.ok ? (
                                            <Check size={14} className="ap-check-icon" aria-hidden="true" />
                                        ) : (
                                            <AlertCircle size={14} className="ap-warning-icon" aria-hidden="true" />
                                        )}
                                        <span>{testResult.message}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Which provider serves what */}
            <div className="sa-section">
                <div className="sa-section-caption">
                    {tr("Which provider serves what")}
                </div>
                <div className="ap-card ap-routing-card">
                    {ROUTABLE_JOBS.map((job) => {
                        const currentRoute = routes[job] || { provider: 'gemini' };

                        return (
                            <div key={job} className="ap-route-row">
                                <div className="ap-route-label">
                                    <span className="ap-route-title">{jobLabels[job]}</span>
                                </div>
                                <div className="ap-route-controls">
                                    <Select
                                        value={currentRoute.provider}
                                        onChange={(e) => {
                                            const newProvider = e.target.value as ProviderId;
                                            if (newProvider === 'gemini') {
                                                setRoute(job, null);
                                            } else {
                                                setRoute(job, { provider: newProvider });
                                            }
                                        }}
                                        aria-label={`${jobLabels[job]} ${tr("Model")}`}
                                    >
                                        <option value="gemini">{tr("Google Gemini (default)")}</option>
                                        {otherConfigured.map((pId) => {
                                            const info = PROVIDER_INFOS.find((p) => p.id === pId);
                                            return (
                                                <option key={pId} value={pId}>
                                                    {info?.label || pId}
                                                </option>
                                            );
                                        })}
                                        {currentRoute.provider !== 'gemini' &&
                                            !otherConfigured.includes(currentRoute.provider) && (
                                                <option value={currentRoute.provider}>
                                                    {PROVIDER_INFOS.find((p) => p.id === currentRoute.provider)
                                                        ?.label || currentRoute.provider}
                                                </option>
                                            )}
                                    </Select>
                                    <Input
                                        type="text"
                                        mono
                                        placeholder={tr("Default model")}
                                        value={currentRoute.model || ''}
                                        disabled={job === 'chat' && currentRoute.provider === 'gemini'}
                                        onChange={(e) => {
                                            const nextModel = e.target.value.trim();
                                            if (currentRoute.provider === 'gemini' && !nextModel) {
                                                setRoute(job, null);
                                            } else {
                                                setRoute(job, {
                                                    provider: currentRoute.provider,
                                                    model: nextModel || undefined,
                                                });
                                            }
                                        }}
                                        aria-label={`${jobLabels[job]} ${tr("Default model")}`}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    <p className="ap-quiet-note">
                        {tr("Image and video jobs always use Gemini. The agent chat uses Gemini unless you route it above.")}
                    </p>
                </div>
            </div>
        </div>
    );
};
