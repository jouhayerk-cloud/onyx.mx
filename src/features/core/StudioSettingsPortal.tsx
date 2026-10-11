import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import {
    isStudioSettingsOpenAtom,
    studioSettingsViewModeAtom,
    themeAtom,
    appStyleAtom,
    APP_STYLES,
    performanceModeAtom,
    userAtom,
    languageAtom,
    isOfflineModeAtom
} from '../../lib/atoms';
import type { AppStyle } from '../../lib/atoms';
import { useSyncEngine } from '../../lib/syncEngine';
import {
    X, AlertCircle, LogOut,
    Shield, Palette, Zap,
    Wifi, WifiOff, Layers, Box, Languages,
    Check, ChevronRight, ChevronLeft
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { THEME_ASSETS } from '../../lib/themes-assets';
import { useTranslation, useLogout } from '../../lib/hooks';
import changelogText from '../../assets/CHANGELOG.md?raw';
import { SiriAccessPanel } from './SiriAccessPanel';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';
import './studioSettings.css';

declare const __APP_VERSION__: string;

const STYLE_META: Record<AppStyle, { label: string; icon: LucideIcon }> = {
    rock: { label: 'ROCK', icon: Layers },
    slab: { label: 'SLAB', icon: Box },
};

const parseChangelog = (text: string) => {
    const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
    const versions: { version: string; date: string; sections: { title: string; items: { lead: string; body: string }[] }[] }[] = [];
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

export const StudioSettingsPortal: React.FC = () => {
    const [isOpen, setIsOpen]             = useAtom(isStudioSettingsOpenAtom);
    const [viewMode, setViewMode]         = useAtom(studioSettingsViewModeAtom);
    const [theme, setTheme]               = useAtom(themeAtom);
    const [appStyle, setAppStyle]         = useAtom(appStyleAtom);
    const [performanceMode, setPerf]      = useAtom(performanceModeAtom);
    const [user]                          = useAtom(userAtom);
    const [isOffline]                     = useAtom(isOfflineModeAtom);
    const [language, setLanguage]         = useAtom(languageAtom);
    
    const { goOffline, goOnline }         = useSyncEngine();
    const logout                          = useLogout();
    useTranslation();

    const [colorsOpen, setColorsOpen]     = useState(false);
    const [colorValues, setColorValues]   = useState<Record<string, string>>({});
    
    const [logsExpanded, setLogsExpanded] = useState<Record<string, boolean>>({});
    const [showAllLogs, setShowAllLogs]   = useState(false);

    const themeRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const versions = useMemo(() => parseChangelog(changelogText), []);

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
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen]);

    if (!isOpen) return null;

    const handleClose = () => setIsOpen(false);

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
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-0 md:p-6">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[24px]" onClick={handleClose} />
            <div 
                role="dialog" 
                aria-modal="true" 
                aria-labelledby="ss-title" 
                className={`ui-root ss-sheet ${viewMode === 'about' ? 'ss-sheet--logs' : ''}`}
            >
                {/* Header */}
                <div className="h-[56px] flex items-center justify-between px-4 shrink-0">
                    {viewMode === 'settings' ? (
                        <button aria-label={tr("System logs")} onClick={() => setViewMode('about')} className="ss-icon-btn w-[44px] h-[44px]">
                            <OnyxMiniLogo className="w-7 h-7 text-(--ss-fg)" />
                        </button>
                    ) : (
                        <button onClick={() => setViewMode('settings')} className="flex items-center text-(--ss-accent) text-[15px] h-[44px] px-2 rounded-xl hover:bg-(--ss-fill) transition-colors">
                            <ChevronLeft size={20} className="mr-1" />
                            {tr("Settings")}
                        </button>
                    )}
                    <div className="flex flex-col items-center flex-1">
                        <span id="ss-title" className="text-[20px] font-[600] text-(--ss-fg) leading-tight">
                            {viewMode === 'settings' ? tr("Settings") : tr("System logs")}
                        </span>
                        <span className="text-[11px] text-(--ss-fg2)">V{__APP_VERSION__}</span>
                    </div>
                    <button aria-label={tr("Close")} onClick={handleClose} className="ss-icon-btn w-[44px] h-[44px]">
                        <X size={24} className="text-(--ss-fg)" />
                    </button>
                </div>

                {/* Settings View */}
                {viewMode === 'settings' && (
                    <div className="ss-body">
                    <aside className="ss-brand" aria-hidden="true">
                        <div className="ss-brand-mark">
                            <OnyxLogo className="ss-brand-logo" />
                        </div>
                        <span className="ss-brand-name">Onyx.mx</span>
                        <span className="ss-brand-version">V{__APP_VERSION__}</span>
                    </aside>
                    <div className="ss-scroll overflow-y-auto px-4 py-6 custom-scrollbar">
                        <div className="max-w-[500px] mx-auto space-y-8 pb-12">
                            
                            {/* Account */}
                            <div className="ss-card">
                                <div className="ss-row py-2">
                                    <div className="w-[44px] h-[44px] rounded-full bg-(--ss-field) flex items-center justify-center mr-4 shrink-0">
                                        {initials ? <span className="text-[17px] font-[600] text-(--ss-fg)">{initials}</span> : <Shield size={24} className="text-(--ss-fg3)" />}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[17px] font-[600] text-(--ss-fg) leading-tight">{user?.name || tr("ROOT")}</span>
                                        <span className="text-[13px] text-(--ss-fg2) leading-tight mt-0.5">{user?.email?.toLowerCase()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Appearance */}
                            <div className="flex flex-col">
                                <span className="ss-section-caption">{tr("Appearance")}</span>
                                <div className="ss-card">
                                    <div className="ss-row" style={{ height: 'auto', padding: '20px 16px', flexDirection: 'column', alignItems: 'center' }}>
                                        <div className="flex gap-8" role="radiogroup" aria-label={tr("Theme")}>
                                            {/* Dark */}
                                            <div className="flex flex-col items-center gap-2">
                                                <button 
                                                    className="ss-theme-btn group" 
                                                    role="radio" 
                                                    aria-checked={theme === 'talan'} 
                                                    onClick={() => setTheme('talan')}
                                                    tabIndex={theme === 'talan' ? 0 : -1}
                                                    ref={el => themeRefs.current[0] = el}
                                                    onKeyDown={(e) => handleThemeKeyDown(e, 0)}
                                                >
                                                    <div className="ss-theme-miniature" style={{backgroundImage: `url(${THEME_ASSETS.talan.swatch})`}}>
                                                        <div className="w-[24px] h-full bg-[rgba(0,0,0,0.4)] backdrop-blur-[10px] border-r border-[rgba(255,255,255,0.1)]" />
                                                        <div className="flex-1 flex flex-col items-center pt-2 gap-2">
                                                            <div className="w-[32px] h-[6px] rounded-full bg-[rgba(0,0,0,0.4)] backdrop-blur-[10px]" />
                                                            <div className="w-[48px] h-[16px] rounded-md bg-[rgba(255,255,255,0.1)] backdrop-blur-[10px]" />
                                                            <div className="w-[48px] h-[16px] rounded-md bg-[rgba(255,255,255,0.1)] backdrop-blur-[10px]" />
                                                        </div>
                                                        {theme === 'talan' && (
                                                            <div className="ss-theme-badge">
                                                                <Check size={12} strokeWidth={3} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[13px] text-(--ss-fg)">{tr("Dark")}</span>
                                                    <span className="text-[11px] text-(--ss-fg2)">TALAN</span>
                                                </div>
                                            </div>
                                            {/* Light */}
                                            <div className="flex flex-col items-center gap-2">
                                                <button 
                                                    className="ss-theme-btn group" 
                                                    role="radio" 
                                                    aria-checked={theme === 'aqua'} 
                                                    onClick={() => setTheme('aqua')}
                                                    tabIndex={theme === 'aqua' ? 0 : -1}
                                                    ref={el => themeRefs.current[1] = el}
                                                    onKeyDown={(e) => handleThemeKeyDown(e, 1)}
                                                >
                                                    <div className="ss-theme-miniature" style={{backgroundImage: `url(${THEME_ASSETS.aqua.swatch})`}}>
                                                        <div className="w-[24px] h-full bg-[rgba(255,255,255,0.7)] backdrop-blur-[10px] border-r border-[rgba(0,0,0,0.1)]" />
                                                        <div className="flex-1 flex flex-col items-center pt-2 gap-2">
                                                            <div className="w-[32px] h-[6px] rounded-full bg-[rgba(255,255,255,0.7)] backdrop-blur-[10px]" />
                                                            <div className="w-[48px] h-[16px] rounded-md bg-[rgba(255,255,255,0.5)] backdrop-blur-[10px]" />
                                                            <div className="w-[48px] h-[16px] rounded-md bg-[rgba(255,255,255,0.5)] backdrop-blur-[10px]" />
                                                        </div>
                                                        {theme === 'aqua' && (
                                                            <div className="ss-theme-badge">
                                                                <Check size={12} strokeWidth={3} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[13px] text-(--ss-fg)">{tr("Light")}</span>
                                                    <span className="text-[11px] text-(--ss-fg2)">AQUA</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ss-separator" />
                                    <div className="ss-row justify-between">
                                        <span className="text-[16px] text-(--ss-fg)">{tr("Interface style")}</span>
                                        <div className="ss-segmented" role="radiogroup" aria-label={tr("Interface style")}>
                                            {APP_STYLES.map(s => {
                                                const meta = STYLE_META[s] ?? STYLE_META.rock;
                                                const Icon = meta.icon;
                                                return (
                                                    <button 
                                                        key={s}
                                                        role="radio" 
                                                        aria-pressed={appStyle === s}
                                                        className="ss-segment"
                                                        onClick={() => setAppStyle(s)}
                                                    >
                                                        <Icon size={14} className="mr-1.5 opacity-70" />
                                                        {meta.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* General */}
                            <div className="flex flex-col">
                                <span className="ss-section-caption">{tr("General")}</span>
                                <div className="ss-card">
                                    <div className="ss-row justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="ss-icon-tile bg-blue-500/10 text-blue-500"><Languages size={16}/></div>
                                            <span className="text-[16px] text-(--ss-fg)">{tr("Language")}</span>
                                        </div>
                                        <div className="ss-segmented">
                                            <button className="ss-segment" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
                                            <button className="ss-segment" aria-pressed={language === 'es'} onClick={() => setLanguage('es')}>ES</button>
                                        </div>
                                    </div>
                                    <div className="ss-separator ss-separator--icon" />
                                    <div className="ss-row justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="ss-icon-tile bg-yellow-500/10 text-yellow-500"><Zap size={16}/></div>
                                            <div className="flex flex-col">
                                                <span className="text-[16px] text-(--ss-fg) leading-tight">{tr("Performance")}</span>
                                                <span className="text-[13px] text-(--ss-fg2) leading-tight mt-0.5">{performanceMode ? tr("Maximum") : tr("Standard")}</span>
                                            </div>
                                        </div>
                                        <TactileSwitch active={performanceMode} onChange={setPerf} width={51} height={31} aria-label={tr("Performance")} />
                                    </div>
                                    <div className="ss-separator ss-separator--icon" />
                                    <div className="ss-row justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="ss-icon-tile bg-amber-500/10 text-amber-500">{isOffline ? <WifiOff size={16}/> : <Wifi size={16}/>}</div>
                                            <div className="flex flex-col">
                                                <span className="text-[16px] text-(--ss-fg) leading-tight">{tr("Offline mode")}</span>
                                                <span className="text-[13px] text-(--ss-fg2) leading-tight mt-0.5">{isOffline ? tr("Offline") : tr("Online")}</span>
                                            </div>
                                        </div>
                                        <TactileSwitch active={isOffline} onChange={v => v ? goOffline() : goOnline()} width={51} height={31} aria-label={tr("Offline mode")} />
                                    </div>
                                </div>
                            </div>

                            {/* Color Tokens */}
                            <div className="flex flex-col">
                                <div className="ss-card">
                                    <div className="ss-row ss-row-clickable justify-between" onClick={() => setColorsOpen(!colorsOpen)} aria-expanded={colorsOpen}>
                                        <div className="flex items-center gap-4">
                                            <div className="ss-icon-tile bg-cyan-500/10 text-cyan-500"><Palette size={16}/></div>
                                            <span className="text-[16px] text-(--ss-fg)">{tr("Color tokens")}</span>
                                        </div>
                                        <ChevronRight size={20} className={`text-(--ss-fg3) transition-transform ${colorsOpen ? 'rotate-90' : ''}`} />
                                    </div>
                                    {colorsOpen && (
                                        <>
                                            <div className="ss-separator ml-0" />
                                            <div className="p-4 grid grid-cols-4 sm:grid-cols-6 gap-4">
                                                {[
                                                    { label: tr("Surface"),  key: '--app-bg-solid' },
                                                    { label: tr("Neural"),   key: '--main-color' },
                                                    { label: tr("Static"),   key: '--secondary-color' },
                                                    { label: tr("Text P"),   key: '--text-color-primary' },
                                                    { label: tr("Text S"),   key: '--text-color-secondary' },
                                                    { label: tr("Boundary"), key: '--border-color' },
                                                    { label: tr("Input"),    key: '--input-color' },
                                                    { label: tr("Sidebar"),  key: '--sidebar-bg' },
                                                    { label: tr("Portal"),   key: '--app-bg' },
                                                    { label: tr("Glass"),    key: '--glass-bg' },
                                                    { label: tr("Base"),     key: '--bg-color' },
                                                    { label: tr("Accent"),   key: '--accent-color' },
                                                ].map((t) => (
                                                    <div key={t.key} className="flex flex-col items-center gap-1.5">
                                                        <div className="w-[28px] h-[28px] rounded-full border border-(--ss-sep)" style={{backgroundColor: colorValues[t.key] || `var(${t.key})`}} />
                                                        <span className="text-[11px] text-(--ss-fg2) truncate w-full text-center">{t.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Siri Shortcuts */}
                            {import.meta.env.VITE_SIRI_TOKENS === 'true' && (
                                <div className="ss-siri">
                                    <SiriAccessPanel />
                                </div>
                            )}

                            {/* Sign Out */}
                            <div className="ss-card mt-8">
                                <div className="ss-row ss-row-clickable justify-center" onClick={logout}>
                                    <LogOut size={20} className="text-(--ss-danger) mr-2" />
                                    <span className="text-[16px] text-(--ss-danger)">{tr("Sign out")}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                )}

                {/* System Logs View */}
                {viewMode === 'about' && (
                    <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                        {versions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 text-(--ss-fg3)">
                                <AlertCircle size={40} strokeWidth={1} />
                                <p className="text-[11px] font-[600] uppercase tracking-wider">{tr("Documentation Offline")}</p>
                            </div>
                        ) : (
                            <div className="ss-card">
                                {displayedVersions.map((v, i) => {
                                    const isOpen = logsExpanded[v.version];
                                    return (
                                        <div key={v.version}>
                                            {i > 0 && <div className="ss-separator ml-0" />}
                                            <div className="ss-row ss-row-clickable justify-between" style={{ minHeight: '44px' }} onClick={() => setLogsExpanded({...logsExpanded, [v.version]: !isOpen})}>
                                                <span className="text-[16px] font-[600] text-(--ss-fg)">{v.version}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] text-(--ss-fg2)">{v.date}</span>
                                                    <ChevronRight size={16} className={`text-(--ss-fg3) transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                                </div>
                                            </div>
                                            {isOpen && (
                                                <div className="px-4 pb-4">
                                                    {v.sections.map((sec: any, si: number) => (
                                                        <div key={si} className="mt-4 first:mt-2">
                                                            <span className="block text-[11px] uppercase text-(--ss-fg2) mb-2 font-medium tracking-wide">{sec.title}</span>
                                                            <ul className="space-y-2">
                                                                {sec.items.map((item: any, ii: number) => (
                                                                    <li key={ii} className="text-[13px] leading-[1.45] text-(--ss-fg2) flex">
                                                                        <span className="text-(--ss-fg3) mr-2 mt-[2px] shrink-0">•</span>
                                                                        <span>
                                                                            {item.lead && <strong className="text-(--ss-accent) font-[600] mr-1">{item.lead}:</strong>}
                                                                            {item.body}
                                                                        </span>
                                                                    </li>
                                                                ))}
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
                            <button className="w-full mt-4 text-[15px] text-(--ss-accent) h-[44px] hover:bg-(--ss-fill) rounded-xl transition-colors font-[500]" onClick={() => setShowAllLogs(true)}>
                                {tr("Show older versions")}
                            </button>
                        )}
                    </div>
                )}

                {/* Footer Status Strip */}
                {viewMode === 'settings' && (
                    <div className="h-auto min-h-[36px] border-t border-(--ss-sep) px-4 py-2 flex flex-wrap items-center justify-center sm:justify-start text-[12px] tabular-nums text-(--ss-fg2) shrink-0 gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-(--ss-fg3)">{tr("Latency")}</span>
                            <span className="text-(--ss-fg)">{tr("14MS")}</span>
                        </div>
                        <div className="w-[1px] h-[12px] bg-(--ss-sep) hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-(--ss-fg3)">{tr("Memory")}</span>
                            <span className="text-(--ss-fg)">{tr("1.2GB")}</span>
                        </div>
                        <div className="w-[1px] h-[12px] bg-(--ss-sep) hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-(--ss-fg3)">{tr("Sync")}</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-(--ss-ok)" />
                            <span className="text-(--ss-fg)">{tr("ACTIVE")}</span>
                        </div>
                        <div className="w-[1px] h-[12px] bg-(--ss-sep) hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-(--ss-fg3)">{tr("Regional Hub")}</span>
                            <span className="text-(--ss-fg)">{tr("MX-NORTH")}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
