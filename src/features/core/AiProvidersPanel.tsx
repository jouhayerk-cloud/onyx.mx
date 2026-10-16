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
        companion: hasProviderKey('companion'),
        colibri: hasProviderKey('colibri'),
    }));

    // Local drafts for editable inputs
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
        colibri: getProviderConfig('colibri').baseUrl || 'http://127.0.0.1:8082',
    }));

    const [draftModels, setDraftModels] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
        anthropic: getProviderConfig('anthropic').model || '',
        openai: getProviderConfig('openai').model || '',
        compat: getProviderConfig('compat').model || '',
        companion: getProviderConfig('companion').model || 'qwen2.5-1.5b-instruct',
        colibri: getProviderConfig('colibri').model || 'colibri-glm-5.2-moe',
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
        anthropic: [],
        openai: [],
        compat: [],
        companion: ['qwen2.5-1.5b-instruct', 'gemma-2-2b-it'],
        colibri: ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'],
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
            companion: hasProviderKey('companion'),
            colibri: hasProviderKey('colibri'),
        });

        setRoutes({
            content: getRoute('content'),
            segmentation: getRoute('segmentation'),
            translate: getRoute('translate'),
            chat: getRoute('chat'),
        });

        // Sync stored baseUrl and model if not currently dirty in draft
        const compatCfg = getProviderConfig('compat');
        const colibriCfg = getProviderConfig('colibri');
        setDraftBaseUrls((prev) => ({
            ...prev,
            compat: prev.compat || compatCfg.baseUrl || '',
            colibri: prev.colibri || colibriCfg.baseUrl || 'http://127.0.0.1:8082',
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
            colibri: prev.colibri || colibriCfg.model || 'colibri-glm-5.2-moe',
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
        if (info?.needsBaseUrl || id === 'colibri') {
            patch.baseUrl = baseVal || (id === 'colibri' ? 'http://127.0.0.1:8082' : '');
        }
        if (id !== 'gemini') {
            patch.model = modelVal || (id === 'colibri' ? 'colibri-glm-5.2-moe' : '');
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
                baseUrl: draftBase || currentCfg.baseUrl || (id === 'colibri' ? 'http://127.0.0.1:8082' : undefined),
                model: draftModel || currentCfg.model || (id === 'colibri' ? 'colibri-glm-5.2-moe' : undefined),
            };

            if (!cfg.key && id !== 'compat' && id !== 'companion' && id !== 'colibri') {
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
                baseUrl: draftBase || currentCfg.baseUrl || (id === 'colibri' ? 'http://127.0.0.1:8082' : undefined),
                model: draftModel || currentCfg.model || (id === 'colibri' ? 'colibri-glm-5.2-moe' : undefined),
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

    const [selectedProvider, setSelectedProvider] = useState<ProviderId>('gemini');
    const [showAdvancedPrompts, setShowAdvancedPrompts] = useState<boolean>(false);

    // Active Chat engine info
    const activeChatRoute = routes.chat || { provider: 'gemini' };
    const activeChatInfo = PROVIDER_INFOS.find((p) => p.id === activeChatRoute.provider) || PROVIDER_INFOS[0];
    const activeChatModel = activeChatRoute.model || draftModels[activeChatRoute.provider] || (activeChatRoute.provider === 'colibri' ? 'colibri-glm-5.2-moe' : 'Default Model');
    const activeIsOnline = configuredKeys[activeChatRoute.provider] || activeChatRoute.provider === 'colibri' || activeChatRoute.provider === 'companion';

    const currentSelectedInfo = PROVIDER_INFOS.find((p) => p.id === selectedProvider) || PROVIDER_INFOS[0];

    return (
        <div className={`sa-panel ap-panel ${L ? 'sa-theme-aqua' : ''}`}>
            {/* 1. Active AI Engine Summary Pill */}
            <div className="p-3.5 rounded-2xl bg-(--ss-fill) border border-(--ss-sep) flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeIsOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400'}`} />
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[14px] font-[600] text-(--ss-fg) truncate">
                                {activeChatInfo.label}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-(--ss-field) text-(--ss-fg2) shrink-0">
                                {activeChatRoute.provider.toUpperCase()}
                            </span>
                        </div>
                        <span className="text-[11px] font-mono text-(--ss-fg2) truncate">
                            {activeChatModel} • {activeChatRoute.provider === 'colibri' ? tr("Local NVMe MoE") : tr("Cloud Inference")}
                        </span>
                    </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    {tr("Active Engine")}
                </span>
            </div>

            {/* 2. Compact Provider Selector Grid (2x3) */}
            <div className="sa-section">
                <div className="sa-section-caption flex items-center justify-between">
                    <span>{tr("AI Engine Hub")}</span>
                    <span className="text-[11px] text-(--ss-fg2) lowercase font-normal">{otherConfigured.length + 1} {tr("configured")}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROVIDER_INFOS.map((info) => {
                        const isSelected = selectedProvider === info.id;
                        const hasKey = configuredKeys[info.id];
                        const isColibri = info.id === 'colibri';
                        const isCompanion = info.id === 'companion';

                        return (
                            <button
                                key={info.id}
                                type="button"
                                onClick={() => setSelectedProvider(info.id)}
                                className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden ${
                                    isSelected
                                        ? 'bg-cyan-500/15 border-cyan-400/60 shadow-sm shadow-cyan-500/10 ring-1 ring-cyan-400/30'
                                        : 'bg-(--ss-fill) border-(--ss-sep) hover:bg-(--ss-fill-hover)'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-1.5">
                                    <span className={`text-[12px] font-[600] truncate ${isSelected ? 'text-cyan-400 font-bold' : 'text-(--ss-fg)'}`}>
                                        {info.label.split(' ')[0]}
                                    </span>
                                    <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                            hasKey || isColibri || isCompanion
                                                ? 'bg-emerald-400 shadow-xs shadow-emerald-400/50'
                                                : 'bg-(--ss-fg3)'
                                        }`}
                                        title={hasKey ? tr("Key saved") : tr("Not configured")}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1 text-[10px] text-(--ss-fg2)">
                                    <span className="truncate">
                                        {isColibri
                                            ? 'Local MoE'
                                            : isCompanion
                                                ? 'iOS Native'
                                                : hasKey
                                                    ? tr("Saved")
                                                    : tr("Setup")}
                                    </span>
                                    {activeChatRoute.provider === info.id && (
                                        <span className="text-cyan-400 font-semibold">• {tr("Chat")}</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 3. Single Compact Inspector Card for Selected Provider */}
            {(() => {
                const info = currentSelectedInfo;
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
                    info.id === 'companion' ||
                    info.id === 'colibri' ||
                    keyDraft.trim().length > 0 ||
                    hasKey ||
                    (info.needsBaseUrl && baseUrlDraft.trim().length > 0);

                const canTest =
                    info.id === 'gemini' ||
                    info.id === 'companion' ||
                    info.id === 'colibri' ||
                    hasKey ||
                    keyDraft.trim().length > 0 ||
                    (info.needsBaseUrl && baseUrlDraft.trim().length > 0);

                return (
                    <div className="sa-section">
                        <div className="sa-section-caption flex items-center justify-between">
                            <span>{info.label} {tr("Configuration")}</span>
                            {info.docsUrl && (
                                <a
                                    href={info.docsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                                >
                                    <span>{tr("Docs")}</span>
                                    <ExternalLink size={11} aria-hidden="true" />
                                </a>
                            )}
                        </div>

                        <div className="ap-card p-4 space-y-3">
                            {/* Base URL Input (compat and colibri) */}
                            {(info.needsBaseUrl || info.id === 'colibri') && (
                                <Field
                                    label={tr("Base URL")}
                                    hint={info.id === 'colibri' ? tr("Local daemon endpoint (default: http://127.0.0.1:8082)") : tr("Endpoint for compatible API")}
                                >
                                    <div className="flex flex-col gap-1.5 w-full">
                                        <Input
                                            type="url"
                                            value={baseUrlDraft}
                                            onChange={(e) =>
                                                setDraftBaseUrls((prev) => ({
                                                    ...prev,
                                                    [info.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={info.defaultBaseUrl || (info.id === 'colibri' ? "http://127.0.0.1:8082" : "http://localhost:11434/v1")}
                                            aria-label={`${info.label} ${tr("Base URL")}`}
                                            mono
                                        />
                                        {info.id === 'colibri' && (
                                            <div className="flex items-center gap-1.5 pt-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setDraftBaseUrls((prev) => ({ ...prev, colibri: 'http://127.0.0.1:8082' }))}
                                                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-(--ss-field) hover:bg-(--ss-fill) text-(--ss-fg) border border-(--ss-sep)"
                                                >
                                                    🏠 127.0.0.1:8082
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDraftBaseUrls((prev) => ({ ...prev, colibri: 'http://192.0.2.71:8082' }))}
                                                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30"
                                                >
                                                    🌐 G7 (192.0.2.71)
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </Field>
                            )}

                            {/* Key Field */}
                            {info.id === 'companion' ? (
                                <div className="ap-key-saved-row py-1">
                                    <span className="ap-key-saved flex items-center gap-1.5 text-[12px]">
                                        <Check size={14} className="ap-check-icon" aria-hidden="true" />
                                        <span>{hasKey ? tr("On-Device Native Bridge Active (A17 Pro / LiteRT-LM)") : tr("Requires running inside OnyxCompanion iOS app")}</span>
                                    </span>
                                </div>
                            ) : info.id === 'colibri' ? (
                                <div className="ap-key-saved-row py-1">
                                    <span className="ap-key-saved flex items-center gap-1.5 text-[12px]">
                                        <Check size={14} className="ap-check-icon" aria-hidden="true" />
                                        <span>{tr("Zero Cloud Latency • Direct NVMe Model Streaming (No API key needed)")}</span>
                                    </span>
                                </div>
                            ) : hasKey && !isReplacing ? (
                                <div className="ap-key-saved-row flex items-center justify-between py-1">
                                    <span className="ap-key-saved flex items-center gap-1.5 text-[12px]">
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
                                    <div className="ap-key-input-row flex items-center gap-2">
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
                                    <div className="ap-model-row flex items-center gap-2">
                                        {info.id === 'colibri' ? (
                                            <Select
                                                value={modelDraft || 'colibri-glm-5.2-moe'}
                                                onChange={(e) =>
                                                    setDraftModels((prev) => ({
                                                        ...prev,
                                                        colibri: e.target.value,
                                                    }))
                                                }
                                                aria-label={`${info.label} ${tr("Model")}`}
                                            >
                                                {models.map((m) => (
                                                    <option key={m} value={m}>
                                                        {m}
                                                    </option>
                                                ))}
                                            </Select>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
                                        {getProvider(info.id)?.listModels && (
                                            <Key
                                                size="sm"
                                                variant="default"
                                                busy={isLoadingMods}
                                                onClick={() => handleLoadModels(info.id)}
                                            >
                                                {info.id === 'colibri' ? tr("Refresh") : tr("Load")}
                                            </Key>
                                        )}
                                    </div>
                                </Field>
                            )}

                            {/* Action Buttons: Save, Test, Remove */}
                            <div className="ap-actions-row flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2">
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
                                        {info.id === 'colibri' ? tr("Test Connection") : tr("Test")}
                                    </Key>
                                </div>
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
                                        <Check size={14} className="ap-check-icon shrink-0" aria-hidden="true" />
                                    ) : (
                                        <AlertCircle size={14} className="ap-warning-icon shrink-0" aria-hidden="true" />
                                    )}
                                    <span className="text-[12px]">{testResult.message}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* 4. Compact Task Routing Hub */}
            <div className="sa-section">
                <div className="sa-section-caption">
                    {tr("Task Routing")}
                </div>
                <div className="ap-card p-3 space-y-2.5">
                    {ROUTABLE_JOBS.map((job) => {
                        const currentRoute = routes[job] || { provider: 'gemini' };

                        return (
                            <div key={job} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-xl bg-(--ss-field) border border-(--ss-sep)">
                                <div className="flex flex-col min-w-[130px]">
                                    <span className="text-[13px] font-[600] text-(--ss-fg)">
                                        {job === 'chat' ? tr("Agent Chat") : job === 'content' ? tr("Content & Copy") : job === 'segmentation' ? tr("Segmentation") : tr("Translation")}
                                    </span>
                                    <span className="text-[11px] text-(--ss-fg2) truncate">
                                        {job === 'chat' ? tr("Tools & Orchestration") : tr("Structured JSON")}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-1 max-w-[320px]">
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
                                        <option value="gemini">{tr("Gemini (Default)")}</option>
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
                                        placeholder={tr("Model (optional)")}
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

                    <p className="ap-quiet-note text-[11px] text-(--ss-fg2) pt-1">
                        {tr("Image and video jobs always use Gemini. Agent chat routes dynamically to the selected engine.")}
                    </p>
                </div>
            </div>

            {/* 5. Collapsible Disclosure: Advanced Prompts & Token Limits */}
            <div className="sa-section">
                <button
                    type="button"
                    onClick={() => setShowAdvancedPrompts(!showAdvancedPrompts)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-(--ss-fill) hover:bg-(--ss-fill-hover) border border-(--ss-sep) transition-colors text-left"
                >
                    <span className="text-[13px] font-[600] text-(--ss-fg)">
                        {tr("Advanced Prompts & Token Budgets")}
                    </span>
                    <span className="text-[11px] text-(--ss-accent) font-medium">
                        {showAdvancedPrompts ? tr("Hide") : tr("Show")}
                    </span>
                </button>

                {showAdvancedPrompts && (
                    <div className="mt-2 p-3.5 rounded-xl bg-(--ss-fill) border border-(--ss-sep) space-y-2 text-[12px] text-(--ss-fg2)">
                        <div className="flex items-center justify-between">
                            <span>{tr("System Prompt Persona")}</span>
                            <span className="font-mono text-[11px] text-(--ss-fg)">Onyx Studio Master v2.4</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{tr("Max Output Tokens")}</span>
                            <span className="font-mono text-[11px] text-(--ss-fg)">4096 (Auto-budgeted)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{tr("Safety & Filter Settings")}</span>
                            <span className="font-mono text-[11px] text-emerald-400">Strict Safety Active</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
