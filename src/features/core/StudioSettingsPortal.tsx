import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai';
import {
    isStudioSettingsOpenAtom,
    studioSettingsViewModeAtom,
    themeAtom,
    appStyleAtom,
    APP_STYLES,
    performanceModeAtom,
    userAtom,
    languageAtom,
    isOfflineModeAtom,
} from '../../lib/atoms';
import type { AppStyle } from '../../lib/atoms';
import { useSyncEngine } from '../../lib/syncEngine';
import {
    X,
    AlertCircle,
    LogOut,
    Shield,
    Palette,
    Zap,
    Wifi,
    WifiOff,
    Layers,
    Box,
    Languages,
    Check,
    ChevronRight,
    ChevronLeft,
    Cpu,
    Smartphone,
    Laptop,
    Globe,
    Mic,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { THEME_ASSETS } from '../../lib/themes-assets';
import { useTranslation, useLogout } from '../../lib/hooks';
import changelogText from '../../assets/CHANGELOG.md?raw';
import { SiriAccessPanel } from './SiriAccessPanel';
import { McpAccessPanel } from './McpAccessPanel';
import { AiProvidersPanel } from './AiProvidersPanel';
import { ColibriSettingsCard } from './ColibriSettingsCard';
import { siriTokenPendingAtom } from './siriState';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';
import './studioSettings.css';

import { APP_VERSION_LABEL } from '../../lib/appVersion';

const STYLE_META: Record<AppStyle, { label: string; icon: LucideIcon }> = {
    rock: { label: 'ROCK', icon: Layers },
    slab: { label: 'SLAB', icon: Box },
};

const parseChangelog = (text: string) => {
    const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
    const versions: {
        version: string;
        date: string;
        sections: { title: string; items: { lead: string; body: string }[] }[];
    }[] = [];
    let currentVersion: any = null;
    let currentSection: any = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('# ')) continue;

        if (line.startsWith('## [')) {
            const match = line.match(/## \[([^\]]+)\](?: - (.*))?/);
            if (match) {
                currentVersion = { version: match[1], date: match[2] || '', sections: [] };
                versions.push(currentVersion);
                currentSection = null;
            }
        } else if (line.startsWith('### ')) {
            if (currentVersion) {
                currentSection = { title: line.replace('### ', ''), items: [] };
                currentVersion.sections.push(currentSection);
            }
        } else if (line.startsWith('- ')) {
            if (currentSection) {
                let body = line.replace('- ', '');
                let lead = '';
                const boldMatch = body.match(/^\*\*([^*]+)\*\*:\s*(.*)/);
                if (boldMatch) {
                    lead = boldMatch[1];
                    body = boldMatch[2];
                }
                currentSection.items.push({ lead, body });
            }
        }
    }
    return versions;
};

export type SettingsTab = 'general' | 'ai';

function useDeviceContext() {
    return useMemo(() => {
        if (typeof window === 'undefined') {
            return { label: 'Node', isIOS: false, transport: 'WSS' };
        }
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
        const isWin = /Windows/i.test(ua);
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');

        const label = isIOS
            ? 'iOS Safari'
            : isWin && isLocal
            ? 'G7 Host'
            : isMac
            ? 'macOS'
            : isWin
            ? 'Windows'
            : 'Web Node';

        const transport = isLocal && !isIOS ? 'Loopback :8082' : 'Cloud WSS';
        return { label, isIOS, transport };
    }, []);
}

export const StudioSettingsPortal: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isStudioSettingsOpenAtom);
    const [viewMode, setViewMode] = useAtom(studioSettingsViewModeAtom);
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [connectorMode, setConnectorMode] = useState<'mcp' | 'siri'>('mcp');
    const [theme, setTheme] = useAtom(themeAtom);
    const [appStyle, setAppStyle] = useAtom(appStyleAtom);
    const [performanceMode, setPerf] = useAtom(performanceModeAtom);
    const [user] = useAtom(userAtom);
    const [isOffline] = useAtom(isOfflineModeAtom);
    const [language, setLanguage] = useAtom(languageAtom);

    const { goOffline, goOnline } = useSyncEngine();
    const logout = useLogout();
    useTranslation();
    const deviceCtx = useDeviceContext();

    const [colorsOpen, setColorsOpen] = useState(false);
    const [colorValues, setColorValues] = useState<Record<string, string>>({});

    const [logsExpanded, setLogsExpanded] = useState<Record<string, boolean>>({});
    const [showAllLogs, setShowAllLogs] = useState(false);

    const themeRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const siriTokenPending = useAtomValue(siriTokenPendingAtom);
    const [closeWarn, setCloseWarn] = useState(false);

    const versions = useMemo(() => parseChangelog(changelogText), []);

    // Smart device-aware default connector sub-tab (Siri on iOS, MCP on desktop)
    useEffect(() => {
        if (deviceCtx.isIOS) {
            setConnectorMode('siri');
        }
    }, [deviceCtx.isIOS]);

    useEffect(() => {
        if (versions.length > 0 && Object.keys(logsExpanded).length === 0) {
            setLogsExpanded({ [versions[0].version]: true });
        }
    }, [versions]);

    useEffect(() => {
        if (colorsOpen) {
            const style = getComputedStyle(document.documentElement);
            setColorValues({
                '--app-bg-solid': style.getPropertyValue('--app-bg-solid').trim(),
                '--main-color': style.getPropertyValue('--main-color').trim(),
                '--secondary-color': style.getPropertyValue('--secondary-color').trim(),
                '--text-color-primary': style.getPropertyValue('--text-color-primary').trim(),
                '--text-color-secondary': style.getPropertyValue('--text-color-secondary').trim(),
                '--border-color': style.getPropertyValue('--border-color').trim(),
                '--input-color': style.getPropertyValue('--input-color').trim(),
                '--sidebar-bg': style.getPropertyValue('--sidebar-bg').trim(),
                '--app-bg': style.getPropertyValue('--app-bg').trim(),
                '--glass-bg': style.getPropertyValue('--glass-bg').trim(),
                '--bg-color': style.getPropertyValue('--bg-color').trim(),
                '--accent-color': style.getPropertyValue('--accent-color').trim(),
            });
        }
    }, [colorsOpen, theme, appStyle]);

    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement as HTMLElement | null;
        sheetRef.current?.focus();
        return () => {
            opener?.focus?.();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!siriTokenPending) setCloseWarn(false);
    }, [siriTokenPending]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (e.defaultPrevented) return;
                if (siriTokenPending) {
                    setCloseWarn(true);
                    return;
                }
                setIsOpen(false);
                return;
            }
            if (e.key === 'Tab' && sheetRef.current) {
                const nodes = Array.from(
                    sheetRef.current.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                    )
                );
                if (nodes.length === 0) {
                    e.preventDefault();
                    return;
                }
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                const active = document.activeElement;
                if (!sheetRef.current.contains(active)) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && (active === first || active === sheetRef.current)) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && active === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen, siriTokenPending]);

    if (!isOpen) return null;

    const handleClose = () => {
        if (siriTokenPending) {
            setCloseWarn(true);
            return;
        }
        setIsOpen(false);
    };

    const handleThemeKeyDown = (e: React.KeyboardEvent, index: number) => {
        let nextIndex = index;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            nextIndex = (index + 1) % 2;
            e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            nextIndex = (index - 1 + 2) % 2;
            e.preventDefault();
        }
        if (nextIndex !== index) {
            themeRefs.current[nextIndex]?.focus();
            setTheme(nextIndex === 0 ? 'talan' : 'aqua');
        }
    };

    const initials = user?.name ? user.name.substring(0, 2).toUpperCase() : '';
    const displayedVersions = showAllLogs ? versions : versions.slice(0, 6);

    return createPortal(
        <LazyMotion features={domMax}>
            <div className="fixed inset-0 z-[5000] flex items-center justify-center p-0 md:p-6">
                <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/30 backdrop-blur-[24px]"
                    onClick={handleClose}
                />
                <m.div
                    initial={{ opacity: 0, y: 14, scale: 0.975 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ss-title"
                    tabIndex={-1}
                    ref={sheetRef}
                    className={`ui-root ss-sheet ${viewMode === 'about' ? 'ss-sheet--logs' : ''}`}
                >
                    {/* Header with Live Device & User Telemetry Pill */}
                    <div className="h-[48px] flex items-center justify-between px-3.5 shrink-0">
                        {viewMode === 'settings' ? (
                            <button
                                aria-label={tr("System logs")}
                                onClick={() => setViewMode('about')}
                                className="ss-icon-btn w-[38px] h-[38px]"
                                title={tr("Changelog & System Logs")}
                            >
                                <OnyxMiniLogo className="w-6 h-6 text-(--ss-fg)" />
                            </button>
                        ) : (
                            <button
                                onClick={() => setViewMode('settings')}
                                className="flex items-center text-(--ss-accent) text-[13px] font-semibold h-[36px] px-2 rounded-xl hover:bg-(--ss-fill) transition-colors"
                            >
                                <ChevronLeft size={18} className="mr-0.5" />
                                {tr("Settings")}
                            </button>
                        )}

                        <div className="flex items-center justify-center flex-1 min-w-0 px-2">
                            <span
                                id="ss-title"
                                className={
                                    viewMode === 'settings'
                                        ? 'sr-only'
                                        : 'text-[16px] font-[600] text-(--ss-fg) leading-tight'
                                }
                            >
                                {viewMode === 'settings' ? tr("Settings") : tr("System logs")}
                            </span>

                            {viewMode === 'settings' && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-(--ss-field) border border-(--ss-sep) text-[10.5px] font-mono text-(--ss-fg2) truncate">
                                    {deviceCtx.isIOS ? (
                                        <Smartphone size={11} className="text-cyan-400 shrink-0" />
                                    ) : (
                                        <Laptop size={11} className="text-cyan-400 shrink-0" />
                                    )}
                                    <span className="text-(--ss-fg) font-semibold">
                                        {deviceCtx.label}
                                    </span>
                                    <span className="opacity-40">•</span>
                                    <span className="text-cyan-400">{deviceCtx.transport}</span>
                                    {user?.role && (
                                        <>
                                            <span className="opacity-40 hidden sm:inline">•</span>
                                            <span className="text-emerald-400 hidden sm:inline">
                                                {user.role}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            aria-label={tr("Close")}
                            onClick={handleClose}
                            className="ss-icon-btn w-[38px] h-[38px]"
                        >
                            <X size={20} className="text-(--ss-fg)" />
                        </button>
                    </div>

                    {closeWarn && (
                        <div role="alert" className="ss-closewarn">
                            {tr("Copy your token before closing. It is shown only once.")}
                        </div>
                    )}

                    {/* Settings View: 2 Unified Top Tabs */}
                    {viewMode === 'settings' && (
                        <>
                            <div className="ss-top-segmented-wrap px-3.5 pb-2 shrink-0">
                                <div
                                    className="ss-top-segmented"
                                    role="tablist"
                                    aria-label={tr("Settings category")}
                                >
                                    {(
                                        [
                                            {
                                                id: 'general',
                                                label: tr("General & Appearance"),
                                                icon: Palette,
                                            },
                                            {
                                                id: 'ai',
                                                label: tr("AI, Models & MCP"),
                                                icon: Cpu,
                                            },
                                        ] as { id: SettingsTab; label: string; icon: LucideIcon }[]
                                    ).map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                role="tab"
                                                aria-selected={isActive}
                                                className={`ss-top-tab ${isActive ? 'is-active' : ''}`}
                                                onClick={() => setActiveTab(tab.id)}
                                            >
                                                {isActive && (
                                                    <m.span
                                                        layoutId="ss-top-tab-pill"
                                                        className="ss-top-tab-pill"
                                                        transition={{
                                                            type: 'spring',
                                                            stiffness: 420,
                                                            damping: 32,
                                                        }}
                                                    />
                                                )}
                                                <Icon size={13.5} className="relative z-10 opacity-90" />
                                                <span className="relative z-10">{tab.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="ss-body">
                                <aside className="ss-brand" aria-hidden="true">
                                    <div className="ss-brand-mark">
                                        <OnyxLogo className="ss-brand-logo" />
                                    </div>
                                    <span className="ss-brand-name">Onyx-mx</span>
                                    <span className="ss-brand-version">V{APP_VERSION_LABEL}</span>
                                </aside>

                                <div className="ss-scroll overflow-y-auto px-3.5 py-2 custom-scrollbar">
                                    <div className="max-w-[540px] mx-auto pb-8">
                                        <AnimatePresence mode="wait">
                                            {/* ── TAB 1: GENERAL & APPEARANCE (CONDENSED) ── */}
                                            {activeTab === 'general' && (
                                                <m.div
                                                    key="tab-general"
                                                    initial={{ opacity: 0, y: 6, scale: 0.99 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                                                    transition={{
                                                        duration: 0.18,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                    className="space-y-2.5"
                                                >
                                                    {/* 1. Compact Account + Inline Sign Out */}
                                                    <div className="ss-card">
                                                        <div className="ss-row py-2 justify-between gap-2">
                                                            <div className="flex items-center min-w-0">
                                                                <div className="w-[34px] h-[34px] rounded-full bg-(--ss-field) flex items-center justify-center mr-2.5 shrink-0 border border-(--ss-sep)">
                                                                    {initials ? (
                                                                        <span className="text-[13px] font-bold text-(--ss-fg)">
                                                                            {initials}
                                                                        </span>
                                                                    ) : (
                                                                        <Shield
                                                                            size={16}
                                                                            className="text-(--ss-fg3)"
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[13.5px] font-semibold text-(--ss-fg) truncate">
                                                                            {user?.name || tr("ROOT")}
                                                                        </span>
                                                                        {user?.role && (
                                                                            <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-mono font-semibold bg-(--ss-field) text-(--ss-accent) border border-(--ss-sep)">
                                                                                {user.role}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[11px] text-(--ss-fg2) truncate">
                                                                        {user?.email?.toLowerCase()}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => logout()}
                                                                className="ss-glass-pill h-7 px-2.5 rounded-lg bg-red-500/12 hover:bg-red-500/20 border border-red-500/25 text-(--ss-danger) text-[11px] font-semibold flex items-center gap-1 shrink-0"
                                                            >
                                                                <LogOut size={12} />
                                                                <span>{tr("Sign out")}</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* 2. Appearance Card: Theme + Surface Style + Palette Drawer */}
                                                    <div className="ss-card">
                                                        {/* Compact Theme Row */}
                                                        <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                                                            <div className="flex flex-col">
                                                                <span className="text-[13px] font-semibold text-(--ss-fg)">
                                                                    {tr("Theme")}
                                                                </span>
                                                                <span className="text-[10.5px] text-(--ss-fg2)">
                                                                    {theme === 'talan'
                                                                        ? 'Talan Obsidian'
                                                                        : 'Aqua Daylight'}
                                                                </span>
                                                            </div>

                                                            <div
                                                                className="flex items-center gap-2.5"
                                                                role="radiogroup"
                                                                aria-label={tr("Theme")}
                                                            >
                                                                {/* Dark Talan */}
                                                                <button
                                                                    type="button"
                                                                    className="ss-theme-btn flex items-center gap-1.5"
                                                                    role="radio"
                                                                    aria-checked={theme === 'talan'}
                                                                    onClick={() => setTheme('talan')}
                                                                    ref={(el) =>
                                                                        (themeRefs.current[0] = el)
                                                                    }
                                                                    onKeyDown={(e) =>
                                                                        handleThemeKeyDown(e, 0)
                                                                    }
                                                                >
                                                                    <div
                                                                        className="ss-theme-miniature"
                                                                        style={{
                                                                            backgroundImage: `url(${THEME_ASSETS.talan.swatch})`,
                                                                        }}
                                                                    >
                                                                        <div className="w-[16px] h-full bg-black/45 border-r border-white/10" />
                                                                        {theme === 'talan' && (
                                                                            <div className="ss-theme-badge">
                                                                                <Check
                                                                                    size={10}
                                                                                    strokeWidth={3}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </button>

                                                                {/* Light Aqua */}
                                                                <button
                                                                    type="button"
                                                                    className="ss-theme-btn flex items-center gap-1.5"
                                                                    role="radio"
                                                                    aria-checked={theme === 'aqua'}
                                                                    onClick={() => setTheme('aqua')}
                                                                    ref={(el) =>
                                                                        (themeRefs.current[1] = el)
                                                                    }
                                                                    onKeyDown={(e) =>
                                                                        handleThemeKeyDown(e, 1)
                                                                    }
                                                                >
                                                                    <div
                                                                        className="ss-theme-miniature"
                                                                        style={{
                                                                            backgroundImage: `url(${THEME_ASSETS.aqua.swatch})`,
                                                                        }}
                                                                    >
                                                                        <div className="w-[16px] h-full bg-white/70 border-r border-black/10" />
                                                                        {theme === 'aqua' && (
                                                                            <div className="ss-theme-badge">
                                                                                <Check
                                                                                    size={10}
                                                                                    strokeWidth={3}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="ss-separator" />

                                                        {/* Surface Material Row */}
                                                        <div className="ss-row justify-between">
                                                            <span className="text-[13px] font-medium text-(--ss-fg)">
                                                                {tr("Surface style")}
                                                            </span>
                                                            <div
                                                                className="ss-segmented"
                                                                role="group"
                                                                aria-label={tr("Interface style")}
                                                            >
                                                                {APP_STYLES.map((s) => {
                                                                    const meta =
                                                                        STYLE_META[s] ?? STYLE_META.rock;
                                                                    const Icon = meta.icon;
                                                                    return (
                                                                        <button
                                                                            key={s}
                                                                            type="button"
                                                                            aria-pressed={appStyle === s}
                                                                            className="ss-segment"
                                                                            onClick={() => setAppStyle(s)}
                                                                        >
                                                                            <Icon
                                                                                size={12}
                                                                                className="mr-1 opacity-75"
                                                                            />
                                                                            {meta.label}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        <div className="ss-separator" />

                                                        {/* Collapsible Color Tokens Row */}
                                                        <button
                                                            type="button"
                                                            className="ss-row ss-row-clickable justify-between w-full text-left"
                                                            onClick={() => setColorsOpen(!colorsOpen)}
                                                            aria-expanded={colorsOpen}
                                                        >
                                                            <span className="flex items-center gap-2.5">
                                                                <span className="ss-icon-tile bg-cyan-500/10 text-cyan-500">
                                                                    <Palette size={14} />
                                                                </span>
                                                                <span className="text-[13px] font-medium text-(--ss-fg)">
                                                                    {tr("Color tokens")}
                                                                </span>
                                                            </span>
                                                            <ChevronRight
                                                                size={16}
                                                                className={`text-(--ss-fg3) transition-transform duration-200 ${
                                                                    colorsOpen ? 'rotate-90' : ''
                                                                }`}
                                                            />
                                                        </button>

                                                        <AnimatePresence initial={false}>
                                                            {colorsOpen && (
                                                                <m.div
                                                                    initial={{ opacity: 0, height: 0 }}
                                                                    animate={{
                                                                        opacity: 1,
                                                                        height: 'auto',
                                                                    }}
                                                                    exit={{ opacity: 0, height: 0 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    <div className="ss-separator ml-0" />
                                                                    <div className="p-3 grid grid-cols-6 gap-2.5">
                                                                        {[
                                                                            {
                                                                                label: tr("Surface"),
                                                                                key: '--app-bg-solid',
                                                                            },
                                                                            {
                                                                                label: tr("Neural"),
                                                                                key: '--main-color',
                                                                            },
                                                                            {
                                                                                label: tr("Static"),
                                                                                key: '--secondary-color',
                                                                            },
                                                                            {
                                                                                label: tr("Text P"),
                                                                                key: '--text-color-primary',
                                                                            },
                                                                            {
                                                                                label: tr("Text S"),
                                                                                key: '--text-color-secondary',
                                                                            },
                                                                            {
                                                                                label: tr("Border"),
                                                                                key: '--border-color',
                                                                            },
                                                                            {
                                                                                label: tr("Input"),
                                                                                key: '--input-color',
                                                                            },
                                                                            {
                                                                                label: tr("Sidebar"),
                                                                                key: '--sidebar-bg',
                                                                            },
                                                                            {
                                                                                label: tr("Portal"),
                                                                                key: '--app-bg',
                                                                            },
                                                                            {
                                                                                label: tr("Glass"),
                                                                                key: '--glass-bg',
                                                                            },
                                                                            {
                                                                                label: tr("Base"),
                                                                                key: '--bg-color',
                                                                            },
                                                                            {
                                                                                label: tr("Accent"),
                                                                                key: '--accent-color',
                                                                            },
                                                                        ].map((t) => (
                                                                            <div
                                                                                key={t.key}
                                                                                className="flex flex-col items-center gap-1"
                                                                            >
                                                                                <div
                                                                                    className="w-[22px] h-[22px] rounded-full border border-(--ss-sep)"
                                                                                    style={{
                                                                                        backgroundColor:
                                                                                            colorValues[
                                                                                                t.key
                                                                                            ] ||
                                                                                            `var(${t.key})`,
                                                                                    }}
                                                                                />
                                                                                <span className="text-[9.5px] text-(--ss-fg2) truncate w-full text-center">
                                                                                    {t.label}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </m.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* 3. System & Network Card */}
                                                    <div className="ss-card">
                                                        <div className="ss-row justify-between">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="ss-icon-tile bg-blue-500/10 text-blue-500">
                                                                    <Languages size={14} />
                                                                </div>
                                                                <span className="text-[13px] font-medium text-(--ss-fg)">
                                                                    {tr("Language")}
                                                                </span>
                                                            </div>
                                                            <div className="ss-segmented">
                                                                <button
                                                                    type="button"
                                                                    className="ss-segment"
                                                                    aria-pressed={language === 'en'}
                                                                    onClick={() => setLanguage('en')}
                                                                >
                                                                    EN
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="ss-segment"
                                                                    aria-pressed={language === 'es'}
                                                                    onClick={() => setLanguage('es')}
                                                                >
                                                                    ES
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="ss-separator ss-separator--icon" />

                                                        <div className="ss-row justify-between">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="ss-icon-tile bg-yellow-500/10 text-yellow-500">
                                                                    <Zap size={14} />
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[13px] font-medium text-(--ss-fg)">
                                                                        {tr("Performance")}
                                                                    </span>
                                                                    <span className="text-[10.5px] font-mono text-(--ss-fg2)">
                                                                        {performanceMode
                                                                            ? tr("Max")
                                                                            : tr("Std")}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <TactileSwitch
                                                                active={performanceMode}
                                                                onChange={setPerf}
                                                                width={42}
                                                                height={24}
                                                                aria-label={tr("Performance")}
                                                            />
                                                        </div>

                                                        <div className="ss-separator ss-separator--icon" />

                                                        <div className="ss-row justify-between">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="ss-icon-tile bg-amber-500/10 text-amber-500">
                                                                    {isOffline ? (
                                                                        <WifiOff size={14} />
                                                                    ) : (
                                                                        <Wifi size={14} />
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[13px] font-medium text-(--ss-fg)">
                                                                        {tr("Offline mode")}
                                                                    </span>
                                                                    <span className="text-[10.5px] font-mono text-(--ss-fg2)">
                                                                        {isOffline
                                                                            ? tr("Local")
                                                                            : tr("Live Sync")}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <TactileSwitch
                                                                active={isOffline}
                                                                onChange={(v) =>
                                                                    v ? goOffline() : goOnline()
                                                                }
                                                                width={42}
                                                                height={24}
                                                                aria-label={tr("Offline mode")}
                                                            />
                                                        </div>
                                                    </div>
                                                </m.div>
                                            )}

                                            {/* ── TAB 2: AI, MODELS & MCP (UNIFIED SINGLE TAB) ── */}
                                            {activeTab === 'ai' && (
                                                <m.div
                                                    key="tab-ai-mcp"
                                                    initial={{ opacity: 0, y: 6, scale: 0.99 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                                                    transition={{
                                                        duration: 0.18,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                    className="space-y-2.5"
                                                >
                                                    {/* 1. Colibrì Local MoE Strip */}
                                                    <ColibriSettingsCard />

                                                    {/* 2. AI Provider Matrix & Task Routing */}
                                                    <AiProvidersPanel />

                                                    {/* 3. Unified Connectors Strip (MCP Gateway + Siri Shortcuts) */}
                                                    <div className="space-y-1.5 pt-0.5">
                                                        <div className="flex items-center justify-between px-1">
                                                            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-(--ss-fg2)">
                                                                {tr("External Bridges & Voice")}
                                                            </span>

                                                            <div className="flex items-center p-0.5 rounded-full bg-(--ss-field) border border-(--ss-sep)">
                                                                {(
                                                                    [
                                                                        {
                                                                            id: 'mcp',
                                                                            label: '🔌 MCP Bridge',
                                                                            icon: Globe,
                                                                        },
                                                                        {
                                                                            id: 'siri',
                                                                            label: '🎙️ Siri & iOS',
                                                                            icon: Mic,
                                                                        },
                                                                    ] as const
                                                                ).map((c) => {
                                                                    const active =
                                                                        connectorMode === c.id;
                                                                    return (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setConnectorMode(c.id)
                                                                            }
                                                                            className={`relative h-6 px-2.5 rounded-full text-[10.5px] font-semibold transition-colors z-10 ${
                                                                                active
                                                                                    ? 'text-(--ss-on-accent)'
                                                                                    : 'text-(--ss-fg2) hover:text-(--ss-fg)'
                                                                            }`}
                                                                        >
                                                                            {active && (
                                                                                <m.span
                                                                                    layoutId="connector-sub-pill"
                                                                                    className="ss-top-tab-pill"
                                                                                    transition={{
                                                                                        type: 'spring',
                                                                                        stiffness: 420,
                                                                                        damping: 32,
                                                                                    }}
                                                                                />
                                                                            )}
                                                                            <span className="relative z-10">
                                                                                {c.label}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        <AnimatePresence mode="wait">
                                                            {connectorMode === 'mcp' ? (
                                                                <m.div
                                                                    key="conn-mcp"
                                                                    initial={{ opacity: 0, y: 4 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: -4 }}
                                                                    transition={{ duration: 0.15 }}
                                                                >
                                                                    <McpAccessPanel />
                                                                </m.div>
                                                            ) : (
                                                                <m.div
                                                                    key="conn-siri"
                                                                    initial={{ opacity: 0, y: 4 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: -4 }}
                                                                    transition={{ duration: 0.15 }}
                                                                >
                                                                    <SiriAccessPanel />
                                                                </m.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </m.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* System Logs View */}
                    {viewMode === 'about' && (
                        <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
                            {versions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3 text-(--ss-fg3)">
                                    <AlertCircle size={32} strokeWidth={1.2} />
                                    <p className="text-[11px] font-[600] uppercase tracking-wider">
                                        {tr("Documentation Offline")}
                                    </p>
                                </div>
                            ) : (
                                <div className="ss-card">
                                    {displayedVersions.map((v, i) => {
                                        const isOpenVer = logsExpanded[v.version];
                                        return (
                                            <div key={v.version}>
                                                {i > 0 && <div className="ss-separator ml-0" />}
                                                <button
                                                    type="button"
                                                    className="ss-row ss-row-clickable justify-between w-full text-left"
                                                    aria-expanded={!!isOpenVer}
                                                    onClick={() =>
                                                        setLogsExpanded({
                                                            ...logsExpanded,
                                                            [v.version]: !isOpenVer,
                                                        })
                                                    }
                                                >
                                                    <span className="text-[14px] font-[600] text-(--ss-fg)">
                                                        {v.version}
                                                    </span>
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-[11px] text-(--ss-fg2)">
                                                            {v.date}
                                                        </span>
                                                        <ChevronRight
                                                            size={15}
                                                            className={`text-(--ss-fg3) transition-transform ${
                                                                isOpenVer ? 'rotate-90' : ''
                                                            }`}
                                                        />
                                                    </span>
                                                </button>
                                                {isOpenVer && (
                                                    <div className="px-4 pb-3">
                                                        {v.sections.map((sec: any, si: number) => (
                                                            <div
                                                                key={si}
                                                                className="mt-3 first:mt-1"
                                                            >
                                                                <span className="block text-[10px] uppercase text-(--ss-fg2) mb-1.5 font-semibold tracking-wider">
                                                                    {sec.title}
                                                                </span>
                                                                <ul className="space-y-1.5">
                                                                    {sec.items.map(
                                                                        (
                                                                            item: any,
                                                                            ii: number
                                                                        ) => (
                                                                            <li
                                                                                key={ii}
                                                                                className="text-[12px] leading-[1.4] text-(--ss-fg2) flex"
                                                                            >
                                                                                <span className="text-(--ss-fg3) mr-2 mt-[1px] shrink-0">
                                                                                    •
                                                                                </span>
                                                                                <span>
                                                                                    {item.lead && (
                                                                                        <strong className="text-(--ss-accent) font-[600] mr-1">
                                                                                            {
                                                                                                item.lead
                                                                                            }
                                                                                            :
                                                                                        </strong>
                                                                                    )}
                                                                                    {item.body}
                                                                                </span>
                                                                            </li>
                                                                        )
                                                                    )}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {!showAllLogs && versions.length > 6 && (
                                <button
                                    className="w-full mt-3 text-[13px] text-(--ss-accent) h-[38px] hover:bg-(--ss-fill) rounded-xl transition-colors font-[600]"
                                    onClick={() => setShowAllLogs(true)}
                                >
                                    {tr("Show older versions")}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Compact Footer Telemetry Strip */}
                    {viewMode === 'settings' && (
                        <div className="h-[32px] border-t border-(--ss-sep) px-3.5 flex items-center justify-between text-[11px] tabular-nums text-(--ss-fg2) shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1.5">
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                            isOffline ? 'bg-(--ss-warn)' : 'bg-(--ss-ok)'
                                        }`}
                                    />
                                    <span className="font-mono text-(--ss-fg)">
                                        {isOffline ? tr("OFFLINE") : tr("SYNC LIVE")}
                                    </span>
                                </span>
                                <span className="opacity-40">•</span>
                                <span className="font-mono">{deviceCtx.label}</span>
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[10.5px]">
                                <span>MX-NORTH</span>
                                <span className="text-(--ss-fg)">V{APP_VERSION_LABEL}</span>
                            </div>
                        </div>
                    )}
                </m.div>
            </div>
        </LazyMotion>,
        document.body
    );
};
