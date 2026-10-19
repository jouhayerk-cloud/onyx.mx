import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import {
    AlertCircle,
    Check,
    ChevronRight,
    ExternalLink,
    RefreshCw,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import { geminiKeyStatus } from '../../lib/ai/keyPrompt';
import { PROVIDER_INFOS, getProvider } from '../../lib/ai/providers';
import { COLIBRI_DEFAULT_BASE_URL, COLIBRI_TAILSCALE_URL } from '../../lib/ai/providers/colibri';
import { COLIBRI_MODELS } from '../../lib/ai/models';
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
    providerAllowedForJob,
    type RouteJob,
    type Route,
} from '../../lib/ai/routing';
import './settingsKit.css';

interface TestStatus {
    ok: boolean;
    message: string;
}

const SHORT_NAMES: Record<ProviderId, string> = {
    gemini: 'Gemini',
    anthropic: 'Claude',
    openai: 'OpenAI',
    compat: 'Compat',
    companion: 'iOS A17',
    colibri: 'Colibrì',
};

const UI_JOBS: RouteJob[] = ['chat', 'content', 'translate', 'segmentation'];

const JOB_META: Partial<Record<RouteJob, { label: string; tag: string }>> = {
    chat: { label: 'Chan chat', tag: 'Tools' },
    content: { label: 'Content', tag: 'Copy' },
    translate: { label: 'Translate', tag: 'ES/EN' },
    segmentation: { label: 'Segment', tag: 'Vision' },
};

export const AiProvidersPanel: React.FC = () => {
    const [user] = useAtom(userAtom);
    const isDevOrAdmin = user?.role === 'Developer' || user?.role === 'Admin';

    const [configuredKeys, setConfiguredKeys] = useState<Record<ProviderId, boolean>>(() => ({
        gemini: hasProviderKey('gemini'),
        anthropic: hasProviderKey('anthropic'),
        openai: hasProviderKey('openai'),
        compat: hasProviderKey('compat'),
        companion: hasProviderKey('companion'),
        colibri: hasProviderKey('colibri'),
    }));

    const [draftKeys, setDraftKeys] = useState<Record<ProviderId, string>>({
        gemini: '',
        anthropic: '',
        openai: '',
        compat: '',
        companion: '',
        colibri: '',
    });

    const [draftBaseUrls, setDraftBaseUrls] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
        anthropic: '',
        openai: '',
        compat: getProviderConfig('compat').baseUrl || '',
        companion: '',
        colibri: getProviderConfig('colibri').baseUrl || COLIBRI_DEFAULT_BASE_URL,
    }));

    const [draftModels, setDraftModels] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
        anthropic: getProviderConfig('anthropic').model || '',
        openai: getProviderConfig('openai').model || '',
        compat: getProviderConfig('compat').model || '',
        companion: getProviderConfig('companion').model || 'qwen2.5-1.5b-instruct',
        colibri: getProviderConfig('colibri').model || 'auto',
    }));

    const [savedModels, setSavedModels] = useState<Record<ProviderId, string>>(() => ({
        gemini: getProviderConfig('gemini').model || 'gemini-2.5-flash',
        anthropic: getProviderConfig('anthropic').model || '',
        openai: getProviderConfig('openai').model || '',
        compat: getProviderConfig('compat').model || '',
        companion: getProviderConfig('companion').model || 'qwen2.5-1.5b-instruct',
        colibri: getProviderConfig('colibri').model || 'auto',
    }));

    const [replacingKey, setReplacingKey] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
        companion: false,
        colibri: false,
    });

    const [availableModels, setAvailableModels] = useState<Record<ProviderId, string[]>>({
        gemini: [],
        anthropic: ['claude-sonnet-4-5', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
        openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
        compat: [],
        companion: ['qwen2.5-1.5b-instruct', 'gemma-2-2b-it'],
        colibri: [...COLIBRI_MODELS],
    });

    const [loadingModels, setLoadingModels] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
        companion: false,
        colibri: false,
    });

    const [testing, setTesting] = useState<Record<ProviderId, boolean>>({
        gemini: false,
        anthropic: false,
        openai: false,
        compat: false,
        companion: false,
        colibri: false,
    });

    const [testStatus, setTestStatus] = useState<Record<ProviderId, TestStatus | null>>({
        gemini: null,
        anthropic: null,
        openai: null,
        compat: null,
        companion: null,
        colibri: null,
    });

    const [routes, setRoutes] = useState<Partial<Record<RouteJob, Route>>>(() => ({
        content: getRoute('content'),
        segmentation: getRoute('segmentation'),
        translate: getRoute('translate'),
        chat: getRoute('chat'),
    }));

    const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>('gemini');

    const refreshState = useCallback(() => {
        setConfiguredKeys({
            gemini: hasProviderKey('gemini'),
            anthropic: hasProviderKey('anthropic'),
            openai: hasProviderKey('openai'),
            compat: hasProviderKey('compat'),
            companion: hasProviderKey('companion'),
            colibri: hasProviderKey('colibri'),
        });

        setRoutes({
            content: getRoute('content'),
            segmentation: getRoute('segmentation'),
            translate: getRoute('translate'),
            chat: getRoute('chat'),
        });

        const compatCfg = getProviderConfig('compat');
        const colibriCfg = getProviderConfig('colibri');
        setDraftBaseUrls((prev) => ({
            ...prev,
            compat: prev.compat || compatCfg.baseUrl || '',
            colibri: colibriCfg.baseUrl || COLIBRI_DEFAULT_BASE_URL,
        }));

        const anthropicCfg = getProviderConfig('anthropic');
        const openaiCfg = getProviderConfig('openai');
        const companionCfg = getProviderConfig('companion');
        setDraftModels((prev) => ({
            ...prev,
            anthropic: prev.anthropic || anthropicCfg.model || '',
            openai: prev.openai || openaiCfg.model || '',
            compat: prev.compat || compatCfg.model || '',
            companion: prev.companion || companionCfg.model || 'qwen2.5-1.5b-instruct',
            colibri: prev.colibri || colibriCfg.model || 'auto',
        }));

        setSavedModels({
            gemini: getProviderConfig('gemini').model || 'gemini-2.5-flash',
            anthropic: getProviderConfig('anthropic').model || '',
            openai: getProviderConfig('openai').model || '',
            compat: getProviderConfig('compat').model || '',
            companion: getProviderConfig('companion').model || 'qwen2.5-1.5b-instruct',
            colibri: getProviderConfig('colibri').model || 'auto',
        });
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
        if (keyVal) patch.key = keyVal;
        if (info?.needsBaseUrl || id === 'colibri') {
            patch.baseUrl = baseVal || (id === 'colibri' ? COLIBRI_DEFAULT_BASE_URL : '');
        }
        if (id !== 'gemini') {
            patch.model = modelVal || (id === 'colibri' ? 'auto' : '');
        }

        setProviderConfig(id, patch);
        setDraftKeys((prev) => ({ ...prev, [id]: '' }));
        setReplacingKey((prev) => ({ ...prev, [id]: false }));
        setTestStatus((prev) => ({ ...prev, [id]: { ok: true, message: tr("Saved") } }));

        const savedModelVal =
            id === 'gemini'
                ? (getProviderConfig('gemini').model || 'gemini-2.5-flash')
                : id === 'colibri'
                ? (modelVal || 'auto')
                : id === 'companion'
                ? (modelVal || 'qwen2.5-1.5b-instruct')
                : modelVal;
        setSavedModels((prev) => ({ ...prev, [id]: savedModelVal }));
    };

    const handleTest = async (id: ProviderId) => {
        setTesting((prev) => ({ ...prev, [id]: true }));
        setTestStatus((prev) => ({ ...prev, [id]: null }));

        try {
            if (id === 'gemini') {
                const hasKey = hasProviderKey('gemini');
                setTestStatus((prev) => ({
                    ...prev,
                    gemini: hasKey
                        ? { ok: true, message: tr("Gemini key active") }
                        : { ok: false, message: tr("Using default env key / none saved") },
                }));
                return;
            }

            const impl = getProvider(id);
            if (!impl) {
                setTestStatus((prev) => ({
                    ...prev,
                    [id]: { ok: false, message: tr("Unavailable") },
                }));
                return;
            }

            const currentCfg = getProviderConfig(id);
            const cfg: ProviderConfig = {
                key: (draftKeys[id] ?? '').trim() || currentCfg.key,
                baseUrl:
                    (draftBaseUrls[id] ?? '').trim() ||
                    currentCfg.baseUrl ||
                    (id === 'colibri' ? COLIBRI_DEFAULT_BASE_URL : undefined),
                model:
                    (draftModels[id] ?? '').trim() ||
                    currentCfg.model ||
                    (id === 'colibri' ? 'auto' : undefined),
            };

            const res = await impl.test(cfg);
            setTestStatus((prev) => ({
                ...prev,
                [id]: {
                    ok: res.ok,
                    message: res.message || (res.ok ? tr("Connected") : tr("Failed")),
                },
            }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Failed");
            setTestStatus((prev) => ({ ...prev, [id]: { ok: false, message: msg } }));
        } finally {
            setTesting((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleLoadModels = async (id: ProviderId) => {
        setLoadingModels((prev) => ({ ...prev, [id]: true }));
        try {
            const impl = getProvider(id);
            if (!impl?.listModels) return;
            const currentCfg = getProviderConfig(id);
            const cfg: ProviderConfig = {
                key: (draftKeys[id] ?? '').trim() || currentCfg.key,
                baseUrl:
                    (draftBaseUrls[id] ?? '').trim() ||
                    currentCfg.baseUrl ||
                    (id === 'colibri' ? COLIBRI_DEFAULT_BASE_URL : undefined),
                model: (draftModels[id] ?? '').trim() || currentCfg.model,
            };
            const list = await impl.listModels(cfg);
            if (Array.isArray(list) && list.length > 0) {
                setAvailableModels((prev) => ({ ...prev, [id]: list }));
                setTestStatus((prev) => ({ ...prev, [id]: { ok: true, message: `${list.length} models` } }));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : tr("Load error");
            setTestStatus((prev) => ({ ...prev, [id]: { ok: false, message: msg } }));
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
        setSavedModels((prev) => ({
            ...prev,
            [id]: id === 'gemini'
                ? 'gemini-2.5-flash'
                : id === 'colibri'
                ? 'auto'
                : id === 'companion'
                ? 'qwen2.5-1.5b-instruct'
                : '',
        }));
    };

    const configuredProviderIds = listConfigured();
    const otherConfigured = configuredProviderIds.filter((p) => p !== 'gemini');
    const activeChatRoute = routes.chat || { provider: 'gemini' };

    const orderedJobs: RouteJob[] = UI_JOBS;

    return (
        <>
            {/* 1. Routing section */}
            {isDevOrAdmin && (
                <section className="sk-section">
                    <div className="sk-section-head">
                        <span className="sk-eyebrow">{tr("Routing")}</span>
                    </div>
                    <div className="sk-group">
                        {orderedJobs.map((job) => {
                            const currentRoute = routes[job] || { provider: 'gemini' };
                            const meta = JOB_META[job] || { label: job, tag: '' };

                            return (
                                <div key={job} className="sk-row">
                                    <div className="sk-row-label">
                                        <span className="sk-row-title">{tr(meta.label)}</span>
                                        {meta.tag && (
                                            <span className="sk-row-sub">{tr(meta.tag)}</span>
                                        )}
                                    </div>
                                    <div className="sk-row-value">
                                        <div className="sk-field">
                                            <select
                                                value={currentRoute.provider}
                                                onChange={(e) => {
                                                    const nextProv = e.target.value as ProviderId;
                                                    if (nextProv === 'gemini') {
                                                        setRoute(job, null);
                                                    } else {
                                                        setRoute(job, { provider: nextProv });
                                                    }
                                                }}
                                                aria-label={tr(meta.label)}
                                            >
                                                <option value="gemini">Gemini</option>
                                                {providerAllowedForJob('colibri', job) && (
                                                    <option value="colibri">Colibrì MoE</option>
                                                )}
                                                <option value="companion">iOS A17</option>
                                                {otherConfigured
                                                    .filter((p) => p !== 'colibri' && p !== 'companion')
                                                    .map((pId) => (
                                                        <option key={pId} value={pId}>
                                                            {SHORT_NAMES[pId] || pId}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* 2. Providers section */}
            <section className="sk-section sk-span-2">
                <div className="sk-section-head">
                    <span className="sk-eyebrow">{tr("Providers")}</span>
                    <span className="sk-badge" data-tone="accent">
                        {tr("Chat")}: {SHORT_NAMES[activeChatRoute.provider] || activeChatRoute.provider}
                    </span>
                </div>
                <div className="sk-group">
                    {PROVIDER_INFOS.map((p) => {
                        const isSelected = selectedProvider === p.id;
                        const hasKey = configuredKeys[p.id];
                        const isKeylessAvailable =
                            p.id === 'colibri' ||
                            (p.id === 'companion' && hasProviderKey('companion')) ||
                            (p.id === 'compat' && hasProviderKey('compat') && !draftKeys[p.id]);
                        const isOk = Boolean(hasKey || isKeylessAvailable);

                        const savedModel = savedModels[p.id];
                        const modelDraft = draftModels[p.id] ?? '';

                        const isReplacing = replacingKey[p.id];
                        const keyDraft = draftKeys[p.id] ?? '';
                        const baseUrlDraft = draftBaseUrls[p.id] ?? '';
                        const isTesting = testing[p.id];
                        const isLoadingMods = loadingModels[p.id];
                        const testResult = testStatus[p.id];
                        const models = availableModels[p.id] || [];

                        return (
                            <React.Fragment key={p.id}>
                                <button
                                    type="button"
                                    className="sk-row sk-row-button"
                                    aria-expanded={isSelected}
                                    onClick={() =>
                                        setSelectedProvider((prev) => (prev === p.id ? null : p.id))
                                    }
                                >
                                    <span
                                        className="sk-dot"
                                        data-state={isOk ? 'ok' : undefined}
                                    />
                                    <span className="sk-row-label">
                                        <span className="sk-row-title">
                                            {SHORT_NAMES[p.id] || p.label}
                                        </span>
                                    </span>
                                    <span className="sk-row-value">
                                        {p.id === 'colibri' || p.id === 'companion' ? (
                                            <span className="sk-badge">{tr("On device")}</span>
                                        ) : hasKey ? (
                                            <span className="sk-badge" data-tone="ok">
                                                {tr("Key saved")}
                                            </span>
                                        ) : (
                                            <span className="sk-badge">{tr("No key")}</span>
                                        )}
                                        <span
                                            className={`${savedModel ? 'sk-mono ' : ''}sk-truncate`}
                                            style={{ maxWidth: 160 }}
                                        >
                                            {savedModel || tr("No model")}
                                        </span>
                                        <ChevronRight
                                            size={14}
                                            className="sk-chevron"
                                            style={{
                                                transform: isSelected ? 'rotate(90deg)' : undefined,
                                            }}
                                        />
                                    </span>
                                </button>

                                {isSelected && (
                                    <div
                                        className="sk-row-editor"
                                        style={{ borderBottom: '1px solid var(--ss-sep)' }}
                                    >
                                        {/* Key field */}
                                        {p.id === 'companion' || p.id === 'colibri' ? (
                                            <div className="sk-field sk-mono">
                                                <Check
                                                    size={12}
                                                    style={{ color: 'var(--ss-ok)', flex: 'none' }}
                                                />
                                                {p.id === 'colibri' ? (
                                                    <span className="sk-seg" role="radiogroup" aria-label={tr("Colibrì link")}>
                                                        {([['local', tr("Local"), COLIBRI_DEFAULT_BASE_URL], ['tailscale', tr("Tailscale"), COLIBRI_TAILSCALE_URL]] as const).map(([key, label, url]) => {
                                                            const current = (draftBaseUrls.colibri || COLIBRI_DEFAULT_BASE_URL).replace(/\/+$/, '');
                                                            return (
                                                                <button
                                                                    key={key}
                                                                    type="button"
                                                                    role="radio"
                                                                    aria-checked={current === url}
                                                                    title={url}
                                                                    className="sk-seg-btn"
                                                                    onClick={() => {
                                                                        setDraftBaseUrls((prev) => ({ ...prev, colibri: url }));
                                                                        setProviderConfig('colibri', { baseUrl: url });
                                                                    }}
                                                                >
                                                                    <span className="sk-seg-label">{label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </span>
                                                ) : (
                                                    <span className="sk-truncate">{tr("iOS A17 Native Bridge")}</span>
                                                )}
                                            </div>
                                        ) : hasKey && !isReplacing ? (
                                            <div className="sk-field">
                                                <span
                                                    className="sk-mono"
                                                    style={{
                                                        flex: '1 1 auto',
                                                        color: 'var(--ss-ok)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                    }}
                                                >
                                                    <Check size={12} /> {p.id === 'gemini' ? geminiKeyStatus() : '••••••••'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="sk-btn"
                                                    data-variant="plain"
                                                    style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                                                    onClick={() =>
                                                        setReplacingKey((prev) => ({
                                                            ...prev,
                                                            [p.id]: true,
                                                        }))
                                                    }
                                                >
                                                    {tr("Change")}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="sk-field">
                                                <input
                                                    type="password"
                                                    autoComplete="off"
                                                    placeholder={p.id === 'gemini' ? `${geminiKeyStatus()} - ${p.keyHint || tr("API key")}` : (p.keyHint || tr("API key"))}
                                                    value={keyDraft}
                                                    onChange={(e) =>
                                                        setDraftKeys((prev) => ({
                                                            ...prev,
                                                            [p.id]: e.target.value,
                                                        }))
                                                    }
                                                    aria-label={tr("API key")}
                                                />
                                                {isReplacing && (
                                                    <button
                                                        type="button"
                                                        className="sk-btn"
                                                        data-variant="plain"
                                                        data-icon-only
                                                        style={{ width: 20, height: 20 }}
                                                        onClick={() =>
                                                            setReplacingKey((prev) => ({
                                                                ...prev,
                                                                [p.id]: false,
                                                            }))
                                                        }
                                                        aria-label={tr("Cancel")}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Base URL (Compat / needsBaseUrl) */}
                                        {p.needsBaseUrl && (
                                            <div className="sk-field" style={{ flexBasis: '100%' }}>
                                                <input
                                                    type="url"
                                                    value={baseUrlDraft}
                                                    onChange={(e) =>
                                                        setDraftBaseUrls((prev) => ({
                                                            ...prev,
                                                            [p.id]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder={
                                                        p.defaultBaseUrl || 'http://localhost:11434/v1'
                                                    }
                                                    aria-label={tr("Base URL")}
                                                />
                                            </div>
                                        )}

                                        {/* Model field */}
                                        <div className="sk-field">
                                            <input
                                                list={`ap-models-${p.id}`}
                                                value={modelDraft}
                                                disabled={p.id === 'gemini'}
                                                onChange={(e) =>
                                                    setDraftModels((prev) => ({
                                                        ...prev,
                                                        [p.id]: e.target.value,
                                                    }))
                                                }
                                                placeholder={
                                                    p.id === 'gemini'
                                                        ? tr("gemini-2.5-flash (Auto)")
                                                        : p.id === 'colibri'
                                                        ? tr("auto (MoE Routing)")
                                                        : tr("Model ID")
                                                }
                                                aria-label={tr("Model ID")}
                                            />
                                            <datalist id={`ap-models-${p.id}`}>
                                                {models.map((mItem) => (
                                                    <option
                                                        key={mItem}
                                                        value={mItem}
                                                        label={
                                                            mItem === 'auto' && p.id === 'colibri'
                                                                ? tr("auto (MoE Routing)")
                                                                : mItem
                                                        }
                                                    />
                                                ))}
                                            </datalist>
                                            {getProvider(p.id)?.listModels && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleLoadModels(p.id)}
                                                    disabled={isLoadingMods}
                                                    title={tr("Fetch models")}
                                                    aria-label={tr("Fetch models")}
                                                    className="sk-btn"
                                                    data-variant="plain"
                                                    data-icon-only
                                                    style={{ width: 22, height: 22 }}
                                                >
                                                    <RefreshCw
                                                        size={12}
                                                        className={
                                                            isLoadingMods ? 'animate-spin' : undefined
                                                        }
                                                    />
                                                </button>
                                            )}
                                        </div>

                                        {/* Action buttons */}
                                        <button
                                            type="button"
                                            onClick={() => handleSave(p.id)}
                                            className="sk-btn"
                                            data-variant="primary"
                                        >
                                            {tr("Save")}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleTest(p.id)}
                                            disabled={isTesting}
                                            className="sk-btn"
                                        >
                                            {isTesting ? '…' : tr("Test")}
                                        </button>

                                        {hasKey && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemove(p.id)}
                                                className="sk-btn"
                                                data-variant="danger"
                                                data-icon-only
                                                aria-label={tr("Delete key")}
                                                title={tr("Delete key")}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}

                                        {p.docsUrl && (
                                            <a
                                                href={p.docsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="sk-btn"
                                                data-variant="plain"
                                            >
                                                <span>{tr("Get key")}</span>
                                                <ExternalLink size={11} />
                                            </a>
                                        )}

                                        {/* Colibri MoE Hint */}
                                        {p.id === 'colibri' && (modelDraft === 'auto' || !modelDraft) && (
                                            <div
                                                className="sk-footnote"
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    color: 'var(--ss-fg2)',
                                                    marginTop: 2,
                                                }}
                                            >
                                                <Sparkles
                                                    size={12}
                                                    style={{ color: 'var(--ss-accent)', flex: 'none' }}
                                                />
                                                <span className="sk-truncate">
                                                    <strong style={{ color: 'var(--ss-fg)' }}>
                                                        {tr("Auto MoE")}:
                                                    </strong>{' '}
                                                    {tr("Chat -> GLM-5.2 · Translate -> Qwen-2.5 · Content/JSON -> Kimi-K3")}
                                                </span>
                                            </div>
                                        )}

                                        {/* Test Status Feedback */}
                                        {testResult && (
                                            <div
                                                className="sk-footnote"
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    color: testResult.ok
                                                        ? 'var(--ss-ok)'
                                                        : 'var(--ss-warn)',
                                                    marginTop: 2,
                                                }}
                                            >
                                                {testResult.ok ? (
                                                    <Check size={12} />
                                                ) : (
                                                    <AlertCircle size={12} />
                                                )}
                                                <span className="sk-truncate">
                                                    {testResult.message}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </section>
        </>
    );
};
