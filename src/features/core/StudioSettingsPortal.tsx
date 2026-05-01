
import React from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { 
    isStudioSettingsOpenAtom, 
    studioSettingsViewModeAtom, 
    themeAtom, 
    performanceModeAtom, 
    userAtom
} from '../../lib/atoms';
import { 
    X, AlertCircle, LogOut, 
    Shield, Activity, Palette, Zap, Terminal
} from 'lucide-react';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { THEME_ASSETS } from '../../lib/themes-assets';
import { useTranslation, useLogout } from '../../lib/hooks';
import changelogText from '../../assets/CHANGELOG.md?raw';

declare const __APP_VERSION__: string;

const LIGHT_THEMES = ['nacar', 'aqua'];

const themes = [
    { name: 'talan',    swatch: THEME_ASSETS.talan.swatch },
    { name: 'fluorite', swatch: THEME_ASSETS.fluorite.swatch },
    { name: 'nacar',    swatch: THEME_ASSETS.nacar.swatch },
    { name: 'aqua',     swatch: THEME_ASSETS.aqua.swatch },
];

export const StudioSettingsPortal: React.FC = () => {
    const [isOpen, setIsOpen]             = useAtom(isStudioSettingsOpenAtom);
    const [viewMode, setViewMode]         = useAtom(studioSettingsViewModeAtom);
    const [theme, setTheme]               = useAtom(themeAtom);
    const [performanceMode, setPerf]      = useAtom(performanceModeAtom);
    const [user]                          = useAtom(userAtom);
    const logout                          = useLogout();
    const { t }                           = useTranslation();

    if (!isOpen) return null;

    const L = LIGHT_THEMES.includes(theme); // true = light theme

    const handleClose   = () => setIsOpen(false);

    const renderMarkdown = (text: string) => {
        if (!text || text.trim().length === 0) {
            return (
                <div className={`flex flex-col items-center justify-center py-20 gap-4 ${L ? 'text-black/30' : 'text-white/30'}`}>
                    <AlertCircle size={40} strokeWidth={1} />
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Documentation Offline</p>
                </div>
            );
        }
        const lines = text.replace(/<!--[\s\S]*?-->/g, '').trim().split('\n');
        const rendered: React.ReactNode[] = [];
        lines.forEach((line, i) => {
            if (!line.trim()) { rendered.push(<div key={i} className="h-4" />); return; }
            if (line.startsWith('### ')) {
                rendered.push(<h3 key={i} className="text-blue-500 font-black mt-8 mb-4 text-[10px] tracking-[0.4em] uppercase flex items-center gap-3"><Terminal size={12} /> {line.replace('### ', '')}</h3>);
            } else if (line.startsWith('## ')) {
                rendered.push(<h2 key={i} className={`font-black mt-12 mb-6 text-2xl tracking-tighter ${L ? 'text-black' : 'text-white'}`}>{line.replace('## ', '')}</h2>);
            } else if (line.startsWith('- **')) {
                const parts = line.split('**');
                rendered.push(<div key={i} className="flex gap-4 mb-4 select-text"><span className="text-blue-500/50 mt-1.5 shrink-0">•</span><p className={`text-[13px] leading-relaxed tracking-tight ${L ? 'text-black/80' : 'text-white/80'}`}><strong className={`font-black uppercase tracking-wider mr-2 ${L ? 'text-black' : 'text-white'}`}>{parts[1]||''}</strong><span className={L ? 'text-black/60' : 'text-white/60'}>{parts.slice(2).join('')}</span></p></div>);
            } else if (line.startsWith('- ')) {
                rendered.push(<div key={i} className="flex gap-4 mb-4 select-text"><span className={`mt-1.5 shrink-0 ${L ? 'text-black/30' : 'text-white/30'}`}>•</span><p className={`text-[13px] leading-relaxed tracking-tight ${L ? 'text-black/60' : 'text-white/60'}`}>{line.replace('- ', '')}</p></div>);
            } else if (line.includes('---')) {
                rendered.push(<hr key={i} className={`my-12 ${L ? 'border-black/10' : 'border-white/10'}`} />);
            } else if (!line.startsWith('# ')) {
                rendered.push(<p key={i} className={`text-[12px] leading-relaxed mb-4 select-text ${L ? 'text-black/50' : 'text-white/50'}`}>{line.trim()}</p>);
            }
        });
        return rendered;
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[5000] flex items-center justify-center animate-in fade-in duration-700 overflow-hidden">
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[80px]" onClick={handleClose} />

                <div className="relative w-full h-full md:w-[95vw] md:h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-700">

                    {/* ── HEADER ─────────────────────────────────────────── */}
                    <div className="flex items-center justify-between p-6 md:p-12 z-20">
                        <div className="flex items-center gap-6 md:gap-8">
                            <div className="relative cursor-pointer group" onClick={() => setViewMode(viewMode === 'settings' ? 'about' : 'settings')}>
                                <OnyxMiniLogo className={`w-8 h-8 md:w-10 md:h-10 transition-all duration-700 group-hover:rotate-180 ${L ? 'text-black' : 'text-white'}`} />
                            </div>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3 mb-1">
                                    <h1 className={`text-lg md:text-3xl font-black uppercase tracking-[0.4em] leading-none ${L ? 'text-black' : 'text-white'}`}>Onyx.mx</h1>
                                    <span className={`h-[1px] w-8 ${L ? 'bg-black/40' : 'bg-white/40'}`} />
                                    <span className="text-[9px] font-black text-blue-500 tracking-[0.3em] uppercase">Settings</span>
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/40' : 'text-white/40'}`}>V{__APP_VERSION__}</span>
                            </div>
                        </div>
                        <button onClick={handleClose} className={`p-2 md:p-4 transition-all duration-150 transform hover:rotate-90 active:scale-75 ${L ? 'text-black/30 hover:text-black' : 'text-white/30 hover:text-white'}`}>
                            <X className="w-6 h-6 md:w-8 md:h-8" strokeWidth={1.5} />
                        </button>
                    </div>

                    {/* ── MAIN CONTENT ───────────────────────────────────── */}
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden px-8 md:px-12 pb-4">

                        {/* Left brand watermark */}
                        {viewMode === 'settings' && (
                            <div className="hidden xl:flex w-1/4 flex-col justify-center items-start pr-16 animate-in slide-in-from-left-12 duration-700">
                                <div className="relative group">
                                    <OnyxLogo className={`w-56 h-56 transition-all duration-700 group-hover:scale-110 ${L ? 'text-black/15 group-hover:text-black/30' : 'text-white/15 group-hover:text-white/30'}`} />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--main-color)_0%,transparent_70%)] opacity-30 blur-3xl animate-pulse" />
                                </div>
                            </div>
                        )}

                        {/* Scrollable panel */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 select-none">
                            {viewMode === 'settings' ? (
                                <div className="space-y-24 pb-20">

                                    {/* ── ROW 1: Theme grid + Color swatches ── */}
                                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-16">

                                        {/* Theme selector — no label */}
                                        <div className="xl:col-span-1 pt-2">
                                            <div className="grid grid-cols-2 gap-8">
                                                {themes.map(th => {
                                                    const themeData = THEME_ASSETS[th.name as keyof typeof THEME_ASSETS];
                                                    const colors    = themeData?.hexInfo;
                                                    const isSel     = theme === th.name;
                                                    return (
                                                        <div
                                                            key={th.name}
                                                            onClick={() => setTheme(th.name)}
                                                            className={`group relative aspect-square transition-all duration-150 cursor-pointer ${isSel ? 'opacity-100' : 'opacity-20 hover:opacity-100 grayscale hover:grayscale-0'}`}
                                                        >
                                                            {isSel && <div className="absolute -inset-3 border border-blue-500/30 rounded-2xl animate-pulse" />}
                                                            <div
                                                                className={`w-full h-full rounded-2xl bg-cover bg-center transition-all duration-150 ${isSel ? 'scale-100 rotate-0' : 'scale-90 -rotate-2 group-hover:rotate-0 group-hover:scale-100'}`}
                                                                style={{ backgroundImage: `url(${th.swatch})` }}
                                                            />
                                                            <div className="absolute inset-x-0 -bottom-8 flex flex-col items-center gap-1.5 transition-all duration-150">
                                                                <span className={`text-[8px] font-black uppercase tracking-[0.6em] transition-colors duration-150 ${isSel ? (L ? 'text-black' : 'text-white') : (L ? 'text-black/20 group-hover:text-black' : 'text-white/20 group-hover:text-white')}`}>
                                                                    {th.name}
                                                                </span>
                                                                <div className="flex gap-1">
                                                                    {colors?.accents.map((c, i) => (
                                                                        <div key={i} className="w-2 h-2 rounded-full border border-black/20" style={{ backgroundColor: c }} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Color tokens */}
                                        <div className="space-y-6 xl:col-span-2">
                                            <div className={`flex items-center gap-3 border-b pb-4 ${L ? 'border-black/10' : 'border-white/10'}`}>
                                                <Palette size={14} className="text-cyan-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>Colors</h3>
                                            </div>
                                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {[
                                                    { label: 'Surface',  key: '--app-bg-solid' },
                                                    { label: 'Neural',   key: '--main-color' },
                                                    { label: 'Static',   key: '--secondary-color' },
                                                    { label: 'Text P',   key: '--text-color-primary' },
                                                    { label: 'Text S',   key: '--text-color-secondary' },
                                                    { label: 'Boundary', key: '--border-color' },
                                                    { label: 'Input',    key: '--input-color' },
                                                    { label: 'Sidebar',  key: '--sidebar-bg' },
                                                    { label: 'Portal',   key: '--app-bg' },
                                                    { label: 'Glass',    key: '--glass-bg' },
                                                    { label: 'Base',     key: '--bg-color' },
                                                    { label: 'Accent',   key: '--accent-color' },
                                                ].map((token) => (
                                                    <div key={`${token.key}-${theme}`} className="group flex flex-col gap-0">
                                                        {/* Hex above */}
                                                        <span className={`text-[8px] font-mono uppercase tracking-tighter truncate mb-1 transition-colors duration-150 ${L ? 'text-black/50 group-hover:text-black' : 'text-white/50 group-hover:text-white'}`}>
                                                            {getComputedStyle(document.documentElement).getPropertyValue(token.key).trim() || '#---'}
                                                        </span>
                                                        {/* Swatch */}
                                                        <div
                                                            className={`w-full aspect-square rounded-lg border transition-all duration-150 group-hover:scale-105 group-hover:border-blue-400/50 ${L ? 'border-black/10' : 'border-white/10'}`}
                                                            style={{ backgroundColor: `var(${token.key})` }}
                                                        />
                                                        {/* Label below */}
                                                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] truncate mt-1.5 transition-colors duration-150 ${L ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'}`}>
                                                            {token.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── ROW 2: Performance + Identity ── */}
                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-24 pt-12 border-t ${L ? 'border-black/5' : 'border-white/5'}`}>

                                        {/* Performance */}
                                        <div className="space-y-12">
                                            <div className={`flex items-center gap-4 border-b pb-6 ${L ? 'border-black/10' : 'border-white/10'}`}>
                                                <Zap size={14} className="text-yellow-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>System Performance</h3>
                                            </div>
                                            <div className="space-y-12">
                                                <div className="group cursor-pointer" onClick={() => setPerf(!performanceMode)}>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h4 className={`text-sm font-black uppercase tracking-[0.2em] group-hover:text-yellow-500 transition-colors duration-150 ${L ? 'text-black' : 'text-white'}`}>Dynamic Throttling</h4>
                                                        <div className={`text-[9px] font-black px-2 py-0.5 rounded border transition-all duration-150 ${performanceMode ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-500' : L ? 'bg-black/5 border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}>
                                                            {performanceMode ? 'ENABLED' : 'DISABLED'}
                                                        </div>
                                                    </div>
                                                    <p className={`text-[10px] uppercase tracking-[0.3em] leading-relaxed ${L ? 'text-black/40' : 'text-white/40'}`}>
                                                        Optimization of rendering cycles and animation frequency for complex workspace viewports.
                                                    </p>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className={`text-sm font-black uppercase tracking-[0.2em] ${L ? 'text-black' : 'text-white'}`}>Interface Density</h4>
                                                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Maximum</span>
                                                    </div>
                                                    <div className={`h-[1px] w-full relative ${L ? 'bg-black/10' : 'bg-white/10'}`}>
                                                        <div className={`absolute inset-y-0 left-0 w-full ${L ? 'bg-black/50' : 'bg-white/50'}`} />
                                                        <div className={`absolute right-0 -top-1.5 w-3 h-3 rounded-full ${L ? 'bg-black shadow-black/30' : 'bg-white shadow-white/30'} shadow-[0_0_12px]`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Identity */}
                                        <div className="space-y-12">
                                            <div className={`flex items-center gap-4 border-b pb-6 ${L ? 'border-black/10' : 'border-white/10'}`}>
                                                <Shield size={14} className="text-purple-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>Neural Identity</h3>
                                            </div>
                                            <div className="space-y-10">
                                                <div className="flex flex-col gap-3">
                                                    <span className={`text-[8px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/40' : 'text-white/40'}`}>Authorized Operator</span>
                                                    <span className={`text-2xl font-black uppercase tracking-widest ${L ? 'text-black' : 'text-white'}`}>{user?.name || 'ROOT'}</span>
                                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{user?.email}</span>
                                                </div>
                                                <div className={`pt-8 border-t flex flex-wrap gap-10 ${L ? 'border-black/10' : 'border-white/10'}`}>
                                                    <button onClick={logout} className="flex items-center gap-4 text-red-500/60 hover:text-red-500 transition-all duration-150 group">
                                                        <LogOut size={14} className="group-hover:-translate-x-1 transition-transform duration-150" />
                                                        <span className="text-[9px] font-black uppercase tracking-[0.4em]">TERMINATE LINK</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto py-12 animate-in slide-in-from-bottom-12 duration-700 select-text">
                                    <div className={`flex items-center gap-6 mb-16 ${L ? 'opacity-40' : 'opacity-30'}`}>
                                        <h2 className={`text-[10px] font-black uppercase tracking-[1em] ${L ? 'text-black' : 'text-white'}`}>System Logs</h2>
                                        <div className={`h-[1px] flex-1 ${L ? 'bg-black/20' : 'bg-white/20'}`} />
                                    </div>
                                    {renderMarkdown(changelogText)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── STATUS BAR ─────────────────────────────────────── */}
                    <div className={`mt-auto px-12 pb-12 pt-8 flex items-center justify-between border-t animate-in slide-in-from-bottom-8 duration-700 ${L ? 'border-black/10' : 'border-white/10'}`}>
                        <div className="flex items-center gap-16">
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Neural Latency</span>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>14MS</span>
                                    <div className="flex gap-0.5">
                                        {[1,2,3,4,5].map(i => <div key={i} className={`w-0.5 h-3 ${i < 4 ? 'bg-blue-500' : L ? 'bg-black/20' : 'bg-white/20'}`} />)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Memory Load</span>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>1.2GB</span>
                                    <div className={`w-12 h-1 rounded-full overflow-hidden ${L ? 'bg-black/15' : 'bg-white/15'}`}>
                                        <div className="w-2/3 h-full bg-purple-500" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-16 text-right">
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Workspace Sync</span>
                                <div className="flex items-center gap-3 justify-end">
                                    <span className="text-xl font-black text-green-600 tracking-tighter uppercase italic">Active</span>
                                    <Activity size={14} className="text-green-600 animate-pulse" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Regional Hub</span>
                                <span className={`text-xl font-black tracking-tighter uppercase ${L ? 'text-black' : 'text-white'}`}>MX-North</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.45); }
                `}} />
            </div>
        </>,
        document.body
    );
};
