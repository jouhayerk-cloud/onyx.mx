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
    ChevronRight,
    ChevronLeft,
    Cpu,
    Smartphone,
    Laptop,
    Mic,
    Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LazyMotion, domMax, m, AnimatePresence } from 'framer-motion';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { useTranslation, useLogout } from '../../lib/hooks';
import changelogText from '../../assets/CHANGELOG.md?raw';
import { SiriAccessPanel } from './SiriAccessPanel';
import { McpAccessPanel } from './McpAccessPanel';
import { AiProvidersPanel } from './AiProvidersPanel';
import { ColibriSettingsCard } from './ColibriSettingsCard';
import { siriTokenPendingAtom } from './siriState';
import { tr } from '../../lib/i18n';
import './settingsKit.css';
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
            return { label: 'Node', isIOS: false, transport: 'Web' };
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

        const transport = isLocal && !isIOS ? 'Loopback' : 'Remote';
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

    const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
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
    ];

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
                                        <Smartphone size={11} className="text-(--ss-accent) shrink-0" />
                                    ) : (
                                        <Laptop size={11} className="text-(--ss-accent) shrink-0" />
                                    )}
                                    <span className="text-(--ss-fg) font-semibold">
                                        {deviceCtx.label}
                                    </span>
                                    {user?.role && (
                                        <>
                                            <span className="opacity-40">•</span>
                                            <span className="text-(--ss-accent)">
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
                                    {tabs.map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                role="tab"
                                                id={`ss-tab-${tab.id}`}
                                                aria-selected={isActive}
                                                aria-controls={`ss-panel-${tab.id}`}
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
                                <nav aria-label={tr("Settings sections")} className="ss-sidebar">
                                    <div role="tablist" aria-orientation="vertical" className="ss-sidebar-nav">
                                        {tabs.map((tab) => {
                                            const Icon = tab.icon;
                                            const isActive = activeTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    role="tab"
                                                    id={`ss-sidebar-tab-${tab.id}`}
                                                    aria-selected={isActive}
                                                    aria-controls={`ss-panel-${tab.id}`}
                                                    className={`ss-sidebar-item ${isActive ? 'is-active' : ''}`}
                                                    onClick={() => setActiveTab(tab.id)}
                                                >
                                                    <Icon size={15} className={`ss-sidebar-icon ${isActive ? 'text-(--ss-accent)' : ''}`} />
                                                    <span className="ss-sidebar-label">{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </nav>

                                <div className="ss-scroll sk-scroll overflow-y-auto px-3.5 py-2 custom-scrollbar">
                                    <div className="max-w-[880px] mx-auto pb-8">
                                        <AnimatePresence mode="wait">
                                            {/* ── TAB 1: GENERAL & APPEARANCE ── */}
                                            {activeTab === 'general' && (
                                                <m.div
                                                    key="tab-general"
                                                    id="ss-panel-general"
                                                    role="tabpanel"
                                                    aria-labelledby="ss-tab-general"
                                                    initial={{ opacity: 0, y: 6, scale: 0.99 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                                                    transition={{
                                                        duration: 0.18,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                >
                                                    <div className="sk-grid">
                                                        {/* 1. Account Section */}
                                                        <section className="sk-section sk-span-2">
                                                            <div className="sk-section-head">
                                                                <span className="sk-eyebrow">{tr("Account")}</span>
                                                            </div>
                                                            <div className="sk-group">
                                                                <div className="sk-row">
                                                                    <div className="sk-row-icon">
                                                                        {initials ? (
                                                                            <span className="text-[12px] font-bold text-(--ss-fg)">
                                                                                {initials}
                                                                            </span>
                                                                        ) : (
                                                                            <Shield size={15} />
                                                                        )}
                                                                    </div>
                                                                    <div className="sk-row-label">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="sk-row-title font-medium">
                                                                                {user?.name || tr("ROOT")}
                                                                            </span>
                                                                            {user?.role && (
                                                                                <span className="sk-badge" data-tone="accent">
                                                                                    {user.role}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {user?.email && (
                                                                            <span className="sk-row-sub font-mono">
                                                                                {user.email.toLowerCase()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => logout()}
                                                                            className="sk-btn"
                                                                            data-variant="danger"
                                                                        >
                                                                            <LogOut size={13} />
                                                                            <span>{tr("Sign out")}</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </section>

                                                        {/* 2. Appearance Section */}
                                                        <section className="sk-section">
                                                            <div className="sk-section-head">
                                                                <span className="sk-eyebrow">{tr("Appearance")}</span>
                                                            </div>
                                                            <div className="sk-group">
                                                                {/* Theme Row */}
                                                                <div className="sk-row">
                                                                    <div className="sk-row-label">
                                                                        <span className="sk-row-title">{tr("Theme")}</span>
                                                                        <span className="sk-row-sub">
                                                                            {theme === 'talan'
                                                                                ? tr("Talan Obsidian")
                                                                                : tr("Aqua Daylight")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <div
                                                                            className="sk-seg sk-seg-keep"
                                                                            role="radiogroup"
                                                                            aria-label={tr("Theme")}
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                role="radio"
                                                                                aria-checked={theme === 'talan'}
                                                                                aria-label={tr("Talan")}
                                                                                className="sk-seg-btn"
                                                                                onClick={() => setTheme('talan')}
                                                                                ref={(el) => {
                                                                                    themeRefs.current[0] = el;
                                                                                }}
                                                                                onKeyDown={(e) =>
                                                                                    handleThemeKeyDown(e, 0)
                                                                                }
                                                                            >
                                                                                <span className="sk-seg-label">{tr("Talan")}</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                role="radio"
                                                                                aria-checked={theme === 'aqua'}
                                                                                aria-label={tr("Aqua")}
                                                                                className="sk-seg-btn"
                                                                                onClick={() => setTheme('aqua')}
                                                                                ref={(el) => {
                                                                                    themeRefs.current[1] = el;
                                                                                }}
                                                                                onKeyDown={(e) =>
                                                                                    handleThemeKeyDown(e, 1)
                                                                                }
                                                                            >
                                                                                <span className="sk-seg-label">{tr("Aqua")}</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Surface Style Row */}
                                                                <div className="sk-row">
                                                                    <div className="sk-row-label">
                                                                        <span className="sk-row-title">{tr("Surface style")}</span>
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <div
                                                                            className="sk-seg"
                                                                            role="radiogroup"
                                                                            aria-label={tr("Surface style")}
                                                                        >
                                                                            {APP_STYLES.map((s) => {
                                                                                const meta =
                                                                                    STYLE_META[s] ?? STYLE_META.rock;
                                                                                const Icon = meta.icon;
                                                                                const isChecked = appStyle === s;
                                                                                return (
                                                                                    <button
                                                                                        key={s}
                                                                                        type="button"
                                                                                        role="radio"
                                                                                        aria-checked={isChecked}
                                                                                        aria-label={meta.label}
                                                                                        className="sk-seg-btn"
                                                                                        onClick={() => setAppStyle(s)}
                                                                                    >
                                                                                        <Icon size={12} />
                                                                                        <span className="sk-seg-label">
                                                                                            {meta.label}
                                                                                        </span>
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Color Tokens Disclosure */}
                                                                <details
                                                                    className="sk-disclosure"
                                                                    open={colorsOpen}
                                                                    onToggle={(e) =>
                                                                        setColorsOpen(
                                                                            (e.target as HTMLDetailsElement).open
                                                                        )
                                                                    }
                                                                >
                                                                    <summary className="sk-row">
                                                                        <span className="sk-row-icon">
                                                                            <Palette size={14} />
                                                                        </span>
                                                                        <span className="sk-row-label">
                                                                            <span className="sk-row-title">
                                                                                {tr("Color tokens")}
                                                                            </span>
                                                                        </span>
                                                                        <span className="sk-row-value">
                                                                            <ChevronRight
                                                                                size={14}
                                                                                className="sk-chevron"
                                                                            />
                                                                        </span>
                                                                    </summary>
                                                                    <div className="p-3 grid grid-cols-6 gap-2 bg-(--ss-field) border-t border-(--ss-sep)">
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
                                                                                    className="w-[20px] h-[20px] rounded-full border border-(--ss-sep)"
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
                                                                </details>
                                                            </div>
                                                        </section>

                                                        {/* 3. System & Network Section */}
                                                        <section className="sk-section">
                                                            <div className="sk-section-head">
                                                                <span className="sk-eyebrow">{tr("System")}</span>
                                                            </div>
                                                            <div className="sk-group">
                                                                {/* Language Row */}
                                                                <div className="sk-row">
                                                                    <span className="sk-row-icon">
                                                                        <Languages size={14} />
                                                                    </span>
                                                                    <div className="sk-row-label">
                                                                        <span className="sk-row-title">
                                                                            {tr("Language")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <div
                                                                            className="sk-seg sk-seg-keep"
                                                                            role="radiogroup"
                                                                            aria-label={tr("Language")}
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                role="radio"
                                                                                aria-checked={language === 'en'}
                                                                                aria-label={tr("English")}
                                                                                className="sk-seg-btn"
                                                                                onClick={() => setLanguage('en')}
                                                                            >
                                                                                <span className="sk-seg-label">EN</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                role="radio"
                                                                                aria-checked={language === 'es'}
                                                                                aria-label={tr("Spanish")}
                                                                                className="sk-seg-btn"
                                                                                onClick={() => setLanguage('es')}
                                                                            >
                                                                                <span className="sk-seg-label">ES</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Performance Row */}
                                                                <div className="sk-row">
                                                                    <span className="sk-row-icon">
                                                                        <Zap size={14} />
                                                                    </span>
                                                                    <div className="sk-row-label">
                                                                        <span className="sk-row-title">
                                                                            {tr("Performance")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <span className="sk-mono text-[12px]">
                                                                            {performanceMode
                                                                                ? tr("Max")
                                                                                : tr("Std")}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            role="switch"
                                                                            aria-checked={performanceMode}
                                                                            className="sk-switch"
                                                                            onClick={() => setPerf(!performanceMode)}
                                                                            aria-label={tr("Performance")}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Offline Mode Row */}
                                                                <div className="sk-row">
                                                                    <span className="sk-row-icon">
                                                                        {isOffline ? (
                                                                            <WifiOff size={14} />
                                                                        ) : (
                                                                            <Wifi size={14} />
                                                                        )}
                                                                    </span>
                                                                    <div className="sk-row-label">
                                                                        <span className="sk-row-title">
                                                                            {tr("Offline mode")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="sk-row-value">
                                                                        <span className="sk-mono text-[12px]">
                                                                            {isOffline
                                                                                ? tr("Local")
                                                                                : tr("Live Sync")}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            role="switch"
                                                                            aria-checked={isOffline}
                                                                            className="sk-switch"
                                                                            onClick={() =>
                                                                                isOffline
                                                                                    ? goOnline()
                                                                                    : goOffline()
                                                                            }
                                                                            aria-label={tr("Offline mode")}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="sk-footnote">
                                                                {tr("Offline changes are stored locally and will sync when reconnected.")}
                                                            </div>
                                                        </section>
                                                    </div>
                                                </m.div>
                                            )}

                                            {/* ── TAB 2: AI, MODELS & MCP ── */}
                                            {activeTab === 'ai' && (
                                                <m.div
                                                    key="tab-ai-mcp"
                                                    id="ss-panel-ai"
                                                    role="tabpanel"
                                                    aria-labelledby="ss-tab-ai"
                                                    initial={{ opacity: 0, y: 6, scale: 0.99 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                                                    transition={{
                                                        duration: 0.18,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                >
                                                    <div className="sk-grid">
                                                        {/* 1. Colibrì Local MoE Section */}
                                                        <ColibriSettingsCard />

                                                        {/* 2. AI Providers Panel & Task Routing */}
                                                        <AiProvidersPanel />

                                                        {/* 3. Connectors Section */}
                                                        <section className="sk-section sk-span-2">
                                                            <div className="sk-section-head">
                                                                <span className="sk-eyebrow">
                                                                    {tr("Connectors")}
                                                                </span>
                                                                <div
                                                                    className="sk-seg"
                                                                    role="radiogroup"
                                                                    aria-label={tr("Connectors")}
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        role="radio"
                                                                        aria-checked={connectorMode === 'mcp'}
                                                                        className="sk-seg-btn"
                                                                        onClick={() => setConnectorMode('mcp')}
                                                                        aria-label={tr("MCP")}
                                                                    >
                                                                        <Plug size={14} />
                                                                        <span className="sk-seg-label">
                                                                            {tr("MCP")}
                                                                        </span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        role="radio"
                                                                        aria-checked={connectorMode === 'siri'}
                                                                        className="sk-seg-btn"
                                                                        onClick={() => setConnectorMode('siri')}
                                                                        aria-label={tr("Siri & iOS")}
                                                                    >
                                                                        <Mic size={14} />
                                                                        <span className="sk-seg-label">
                                                                            {tr("Siri & iOS")}
                                                                        </span>
                                                                    </button>
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
                                                        </section>
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

                    {/* Footer */}
                    {viewMode === 'settings' && (
                        <div className="h-[32px] border-t border-(--ss-sep) px-3.5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-1.5 text-[11px]">
                                <span
                                    className="sk-dot"
                                    data-state={isOffline ? 'warn' : 'ok'}
                                />
                                <span className="text-(--ss-fg2)">
                                    {isOffline ? tr("Offline") : tr("Synced")}
                                </span>
                            </div>
                            <div className="sk-mono text-[11px] text-(--ss-fg2)">
                                V{APP_VERSION_LABEL}
                            </div>
                        </div>
                    )}
                </m.div>
            </div>
        </LazyMotion>,
        document.body
    );
};
