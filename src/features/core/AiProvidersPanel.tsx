import React, { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { themeAtom, userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { AlertCircle, Check, ExternalLink, RefreshCw, Trash2, Sparkles, Sliders } from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
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

const SHORT_NAMES: Record<ProviderId, string> = {
    gemini: 'Gemini',
    anthropic: 'Claude',
    openai: 'OpenAI',
    compat: 'Compat',
    companion: 'iOS A17',
    colibri: 'Colibrì',
};

const JOB_META: Record<RouteJob, { label: string; tag: string }> = {
    chat: { label: 'Chan Chat', tag: 'Tools' },
    content: { label: 'Content', tag: 'Copy' },
    segmentation: { label: 'Segment', tag: 'Vision' },
    translate: { label: 'Translate', tag: 'ES/EN' },
};

export const AiProvidersPanel: React.FC = () => {
    const [theme] = useAtom(themeAtom);
    const [user] = useAtom(userAtom);
    const L = theme === 'aqua';
    const isDevOrAdmin = !user?.role || user.role === 'Developer' || user.role === 'Admin';

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
        colibri: getProviderConfig('colibri').baseUrl || 'http://127.0.0.1:8082',
    }));

    const [draftModels, setDraftModels] = useState<Record<ProviderId, string>>(() => ({
        gemini: '',
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
        colibri: ['auto', 'colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'],
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

    const [routes, setRoutes] = useState<Record<RouteJob, Route>>(() => ({
        content: getRoute('content'),
        segmentation: getRoute('segmentation'),
        translate: getRoute('translate'),
        chat: getRoute('chat'),
    }));

    const [selectedProvider, setSelectedProvider] = useState<ProviderId>('gemini');
    const [showRouting, setShowRouting] = useState<boolean>(true);

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
            colibri: prev.colibri || colibriCfg.model || 'auto',
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
        if (keyVal) patch.key = keyVal;
        if (info?.needsBaseUrl || id === 'colibri') {
            patch.baseUrl = baseVal || (id === 'colibri' ? 'http://127.0.0.1:8082' : '');
        }
        if (id !== 'gemini') {
            patch.model = modelVal || (id === 'colibri' ? 'auto' : '');
        }

        setProviderConfig(id, patch);
        setDraftKeys((prev) => ({ ...prev, [id]: '' }));
        setReplacingKey((prev) => ({ ...prev, [id]: false }));
        setTestStatus((prev) => ({ ...prev, [id]: { ok: true, message: tr("Saved") } }));
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
                    (id === 'colibri' ? 'http://127.0.0.1:8082' : undefined),
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
                    (id === 'colibri' ? 'http://127.0.0.1:8082' : undefined),
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
    };

    const configuredProviderIds = listConfigured();
    const otherConfigured = configuredProviderIds.filter((p) => p !== 'gemini');
    const activeChatRoute = routes.chat || { provider: 'gemini' };
    const info = PROVIDER_INFOS.find((p) => p.id === selectedProvider) || PROVIDER_INFOS[0];

    const hasKey = configuredKeys[info.id];
    const isReplacing = replacingKey[info.id];
    const keyDraft = draftKeys[info.id] ?? '';
    const baseUrlDraft = draftBaseUrls[info.id] ?? '';
    const modelDraft = draftModels[info.id] ?? '';
    const isTesting = testing[info.id];
    const isLoadingMods = loadingModels[info.id];
    const testResult = testStatus[info.id];
    const models = availableModels[info.id] || [];

    return (
        <LazyMotion features={domMax}>
            <div className={`sa-panel ap-panel space-y-2.5 ${L ? 'sa-theme-aqua' : ''}`}>
                {/* 1. Compact 6-Pill Provider Selector Strip + Inline Inspector */}
                <div className="ss-card p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                            <Sparkles size={12} className="text-cyan-400" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-(--ss-fg2)">
                                {tr("AI Providers")}
                            </span>
                        </div>
                        <span className="text-[10.5px] font-mono text-(--ss-fg2)">
                            Chat: <strong className="text-cyan-400">{SHORT_NAMES[activeChatRoute.provider]}</strong>
                        </span>
                    </div>

                    {/* 6-Pill Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {PROVIDER_INFOS.map((p) => {
                            const isSelected = selectedProvider === p.id;
                            const isReady =
                                configuredKeys[p.id] || p.id === 'colibri' || p.id === 'companion';
                            const isChatActive = activeChatRoute.provider === p.id;

                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setSelectedProvider(p.id)}
                                    className={`ss-glass-pill relative h-8 px-2 rounded-xl border text-[11px] font-semibold flex items-center justify-between gap-1 transition-all ${
                                        isSelected
                                            ? 'bg-cyan-500/18 border-cyan-400/60 text-cyan-300 shadow-xs'
                                            : 'bg-(--ss-field) border-(--ss-sep) text-(--ss-fg2) hover:text-(--ss-fg)'
                                    }`}
                                >
                                    <span className="truncate">{SHORT_NAMES[p.id]}</span>
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            isChatActive
                                                ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]'
                                                : isReady
                                                ? 'bg-emerald-400'
                                                : 'bg-(--ss-fg3)/40'
                                        }`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {/* Animated Inline Provider Bar */}
                    <AnimatePresence mode="wait">
                        <m.div
                            key={info.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            className="p-2.5 rounded-xl bg-(--ss-field) border border-(--ss-sep) space-y-2"
                        >
                            {/* Header line: Provider Name + Status + Docs */}
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold text-(--ss-fg) truncate">
                                        {info.label}
                                    </span>
                                    {hasKey && (
                                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                            {tr("Key Saved")}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {info.docsUrl && (
                                        <a
                                            href={info.docsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10.5px] text-cyan-400 hover:underline flex items-center gap-0.5"
                                        >
                                            <span>{tr("Key")}</span>
                                            <ExternalLink size={10} />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Compact Inputs Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center">
                                {/* API Key or Native Status */}
                                {info.id === 'companion' || info.id === 'colibri' ? (
                                    <div className="sm:col-span-6 h-8 px-2.5 rounded-lg bg-black/20 border border-(--ss-sep) flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono truncate">
                                        <Check size={12} className="shrink-0" />
                                        <span className="truncate">
                                            {info.id === 'colibri'
                                                ? 'Local NVMe / WSS Bridge'
                                                : 'iOS A17 Native Bridge'}
                                        </span>
                                    </div>
                                ) : hasKey && !isReplacing ? (
                                    <div className="sm:col-span-6 h-8 px-2.5 rounded-lg bg-black/20 border border-(--ss-sep) flex items-center justify-between gap-1.5 text-[11px]">
                                        <span className="text-emerald-400 font-mono flex items-center gap-1 truncate">
                                            <Check size={12} /> ••••••••
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setReplacingKey((prev) => ({
                                                    ...prev,
                                                    [info.id]: true,
                                                }))
                                            }
                                            className="text-[10.5px] text-cyan-400 hover:underline shrink-0"
                                        >
                                            {tr("Change")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="sm:col-span-6 flex items-center gap-1">
                                        <input
                                            type="password"
                                            autoComplete="off"
                                            placeholder={info.keyHint || tr("API Key")}
                                            value={keyDraft}
                                            onChange={(e) =>
                                                setDraftKeys((prev) => ({
                                                    ...prev,
                                                    [info.id]: e.target.value,
                                                }))
                                            }
                                            className="w-full h-8 px-2.5 rounded-lg bg-black/30 border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400"
                                        />
                                        {isReplacing && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setReplacingKey((prev) => ({
                                                        ...prev,
                                                        [info.id]: false,
                                                    }))
                                                }
                                                className="h-8 px-2 rounded-lg text-[10px] text-(--ss-fg2) hover:text-(--ss-fg)"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Model Input / Select */}
                                <div className="sm:col-span-4 flex items-center gap-1">
                                    <input
                                        list={`ap-models-${info.id}`}
                                        value={modelDraft}
                                        disabled={info.id === 'gemini'}
                                        onChange={(e) =>
                                            setDraftModels((prev) => ({
                                                ...prev,
                                                [info.id]: e.target.value,
                                            }))
                                        }
                                        placeholder={
                                            info.id === 'gemini'
                                                ? 'gemini-2.5-flash (Auto)'
                                                : info.id === 'colibri'
                                                ? 'auto (Smart MoE Routing)'
                                                : tr("Model ID")
                                        }
                                        className="w-full h-8 px-2.5 rounded-lg bg-black/30 border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-60"
                                    />
                                    <datalist id={`ap-models-${info.id}`}>
                                        {models.map((mItem) => (
                                            <option
                                                key={mItem}
                                                value={mItem}
                                                label={
                                                    mItem === 'auto' && info.id === 'colibri'
                                                        ? '✨ auto (Smart MoE Routing)'
                                                        : mItem
                                                }
                                            />
                                        ))}
                                    </datalist>
                                    {getProvider(info.id)?.listModels && (
                                        <button
                                            type="button"
                                            onClick={() => handleLoadModels(info.id)}
                                            disabled={isLoadingMods}
                                            title={tr("Fetch models")}
                                            className="h-8 w-8 rounded-lg bg-(--ss-fill) hover:bg-(--ss-fill-hover) border border-(--ss-sep) flex items-center justify-center text-(--ss-fg2) shrink-0"
                                        >
                                            <RefreshCw
                                                size={11}
                                                className={isLoadingMods ? 'animate-spin' : ''}
                                            />
                                        </button>
                                    )}
                                </div>

                                {/* Actions: Save + Test + Delete */}
                                <div className="sm:col-span-2 flex items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleSave(info.id)}
                                        className="ss-glass-pill h-8 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-semibold"
                                    >
                                        {tr("Save")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleTest(info.id)}
                                        disabled={isTesting}
                                        className="ss-glass-pill h-8 px-2 rounded-lg bg-(--ss-fill) hover:bg-(--ss-fill-hover) border border-(--ss-sep) text-(--ss-fg) text-[11px] font-medium"
                                    >
                                        {isTesting ? '…' : tr("Test")}
                                    </button>
                                    {hasKey && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(info.id)}
                                            className="h-8 w-7 rounded-lg text-red-400 hover:bg-red-500/15 flex items-center justify-center shrink-0"
                                            title={tr("Remove key")}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Auto Model Selecting Info Pill for Colibrì */}
                            {info.id === 'colibri' && (modelDraft === 'auto' || !modelDraft) && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10.5px] text-cyan-300">
                                    <Sparkles size={11} className="text-cyan-400 shrink-0" />
                                    <span className="font-semibold text-cyan-200">Auto MoE:</span>
                                    <span className="text-cyan-300/80 truncate">
                                        Chat ➔ GLM-5.2 · Translate ➔ Qwen-2.5 · Content/JSON ➔ Kimi-K3
                                    </span>
                                </div>
                            )}

                            {/* Base URL input if Compat */}
                            {info.needsBaseUrl && (
                                <input
                                    type="url"
                                    value={baseUrlDraft}
                                    onChange={(e) =>
                                        setDraftBaseUrls((prev) => ({
                                            ...prev,
                                            [info.id]: e.target.value,
                                        }))
                                    }
                                    placeholder={info.defaultBaseUrl || 'http://localhost:11434/v1'}
                                    className="w-full h-7 px-2.5 rounded-lg bg-black/30 border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400"
                                />
                            )}

                            {/* Test feedback micro-pill */}
                            {testResult && (
                                <div
                                    className={`px-2 py-1 rounded-md text-[10.5px] flex items-center gap-1.5 ${
                                        testResult.ok
                                            ? 'bg-emerald-500/15 text-emerald-300'
                                            : 'bg-amber-500/15 text-amber-300'
                                    }`}
                                >
                                    {testResult.ok ? <Check size={11} /> : <AlertCircle size={11} />}
                                    <span className="truncate">{testResult.message}</span>
                                </div>
                            )}
                        </m.div>
                    </AnimatePresence>
                </div>

                {/* 2. Data-Dense 2x2 Task Routing Matrix */}
                {isDevOrAdmin && (
                    <div className="ss-card p-2.5">
                        <button
                            type="button"
                            onClick={() => setShowRouting(!showRouting)}
                            className="w-full flex items-center justify-between px-1 py-0.5 text-left"
                        >
                            <div className="flex items-center gap-1.5">
                                <Sliders size={12} className="text-cyan-400" />
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-(--ss-fg2)">
                                    {tr("Task Routing Matrix")}
                                </span>
                            </div>
                            <span className="text-[10.5px] text-(--ss-accent) font-medium">
                                {showRouting ? tr("Hide") : tr("Configure")}
                            </span>
                        </button>

                        <AnimatePresence initial={false}>
                            {showRouting && (
                                <m.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2">
                                        {ROUTABLE_JOBS.map((job) => {
                                            const currentRoute = routes[job] || { provider: 'gemini' };
                                            const meta = JOB_META[job];

                                            return (
                                                <div
                                                    key={job}
                                                    className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-(--ss-field) border border-(--ss-sep)"
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-[11.5px] font-semibold text-(--ss-fg) truncate">
                                                            {meta.label}
                                                        </span>
                                                        <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-white/5 text-(--ss-fg3)">
                                                            {meta.tag}
                                                        </span>
                                                    </div>

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
                                                        aria-label={meta.label}
                                                        className="h-6.5 px-2 rounded-lg bg-black/35 border border-(--ss-sep) text-(--ss-fg) text-[11px] font-mono focus:outline-none focus:border-cyan-400"
                                                    >
                                                        <option value="gemini">Gemini</option>
                                                        <option value="colibri">Colibrì MoE</option>
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
                                            );
                                        })}
                                    </div>
                                </m.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </LazyMotion>
    );
};
