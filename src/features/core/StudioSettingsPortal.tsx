
import React from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { 
    isStudioSettingsOpenAtom, 
    studioSettingsViewModeAtom, 
    themeAtom, 
    performanceModeAtom, 
    userAtom,
    isOfflineModeAtom
} from '../../lib/atoms';
import { useSyncEngine } from '../../lib/syncEngine';
import { 
    X, AlertCircle, LogOut, 
    Shield, Activity, Palette, Zap, Terminal,
    Wifi, WifiOff
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
    const [isOffline]                     = useAtom(isOfflineModeAtom);
    const { goOffline, goOnline }         = useSyncEngine();
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

                <div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-700">

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
                                <div className="space-y-12 md:space-y-24 pb-20">

                                    {/* ── NEURAL IDENTITY PANEL (NEW TOP POSITION) ── */}
                                    <div className={`p-4 md:p-8 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12 animate-in slide-in-from-top-4 duration-700 ${L ? 'bg-black/[0.03]' : 'bg-white/[0.03]'}`}>
                                        <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                                            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center transition-all ${L ? 'bg-black/5 text-black/40' : 'bg-white/5 text-white/40'}`}>
                                                <Shield size={24} strokeWidth={1.5} className="text-purple-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-[0.5em] mb-1 ${L ? 'text-black/40' : 'text-white/40'}`}>Authorized Operator</span>
                                                <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4">
                                                    <span className={`text-lg md:text-2xl font-black uppercase tracking-widest leading-none ${L ? 'text-black' : 'text-white'}`}>{user?.name || 'ROOT'}</span>
                                                    <span className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] opacity-60">{user?.email}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-6 md:gap-10 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0 border-white/5">
                                            <button 
                                                onClick={isOffline ? goOnline : goOffline} 
                                                className={`flex items-center gap-3 transition-all duration-150 group ${isOffline ? 'text-green-500' : 'text-amber-500/60 hover:text-amber-500'}`}
                                            >
                                                {isOffline ? <Wifi size={14} /> : <WifiOff size={14} />}
                                                <span className="text-[9px] font-black uppercase tracking-[0.4em]">
                                                    {isOffline ? 'ESTABLISH LINK' : 'FORCE OFFLINE'}
                                                </span>
                                            </button>

                                            <button onClick={logout} className="flex items-center gap-3 text-red-500/60 hover:text-red-500 transition-all duration-150 group">
                                                <LogOut size={14} className="group-hover:-translate-x-1 transition-transform duration-150" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.4em]">TERMINATE</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── VISUAL CALIBRATION: Theme + Color integration ── */}
                                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 md:gap-16">

                                        {/* Theme selector */}
                                        <div className="xl:col-span-4">
                                            <div className="flex items-center gap-3 pb-4 mb-8">
                                                <Palette size={14} className="text-blue-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>Themes</h3>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-4 md:gap-6">
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
                                                            {isSel && <div className="absolute -inset-3 rounded-2xl bg-blue-500/5 animate-pulse" />}
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
                                                                        <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Color tokens */}
                                        <div className="xl:col-span-8 space-y-8">
                                            <div className="flex items-center gap-3 pb-4">
                                                <Palette size={14} className="text-cyan-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>Colors</h3>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 md:gap-4">
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
                                                            className={`w-full aspect-square rounded-lg transition-all duration-150 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]`}
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

                                    {/* ── ROW 2: Performance + Additional ── */}
                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 pt-12 ${L ? 'opacity-100' : 'opacity-100'}`}>

                                        {/* Performance */}
                                        <div className="space-y-10">
                                            <div className="flex items-center gap-4 pb-6">
                                                <Zap size={14} className="text-yellow-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>
                                                    <span className="hidden sm:inline">System </span>Performance
                                                </h3>
                                            </div>
                                            <div className="space-y-10">
                                                <div className="group cursor-pointer" onClick={() => setPerf(!performanceMode)}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <Zap size={14} className={performanceMode ? 'text-yellow-500' : 'text-white/20'} />
                                                            <h4 className={`text-sm font-black uppercase tracking-[0.2em] group-hover:text-yellow-500 transition-colors duration-150 ${L ? 'text-black' : 'text-white'}`}>Performance</h4>
                                                        </div>
                                                        <div className={`text-[9px] font-black px-2 py-0.5 rounded transition-all duration-150 ${performanceMode ? 'bg-yellow-500/20 text-yellow-500' : L ? 'bg-black/5 text-black/40' : 'bg-white/5 text-white/40'}`}>
                                                            {performanceMode ? 'MAX' : 'STD'}
                                                        </div>
                                                    </div>
                                                    <p className={`text-[10px] uppercase tracking-[0.3em] leading-relaxed opacity-60 ${L ? 'text-black' : 'text-white'}`}>
                                                        Optimization of rendering cycles and animation frequency.
                                                    </p>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${L ? 'text-black/60' : 'text-white/60'}`}>Interface Density</h4>
                                                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Maximum</span>
                                                    </div>
                                                    <div className={`h-[1px] w-full relative ${L ? 'bg-black/10' : 'bg-white/10'}`}>
                                                        <div className={`absolute inset-y-0 left-0 w-full ${L ? 'bg-black/50' : 'bg-white/50'}`} />
                                                        <div className={`absolute right-0 -top-1.5 w-3 h-3 rounded-full ${L ? 'bg-black shadow-black/30' : 'bg-white shadow-white/30'} shadow-[0_0_12px]`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Additional Stats / Placeholder */}
                                        <div className="space-y-12 hidden md:block">
                                            <div className="flex items-center gap-4 pb-6">
                                                <Terminal size={14} className="text-blue-500" />
                                                <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${L ? 'text-black' : 'text-white'}`}>System Node</h3>
                                            </div>
                                            <div className={`p-8 rounded-[32px] ${L ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="flex flex-col gap-4 opacity-30">
                                                    <div className="h-2 w-2/3 bg-current rounded-full" />
                                                    <div className="h-2 w-1/2 bg-current rounded-full" />
                                                    <div className="h-2 w-3/4 bg-current rounded-full" />
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
                    <div className={`mt-auto px-6 py-4 md:px-12 md:pb-12 md:pt-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-bottom-8 duration-700 shrink-0`}>
                        <div className="flex items-center justify-between w-full md:w-auto md:gap-16">
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Neural Latency</span>
                                <div className="flex items-center gap-2 md:gap-3">
                                    <span className={`text-base md:text-xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>14MS</span>
                                    <div className="flex gap-0.5">
                                        {[1,2,3,4,5].map(i => <div key={i} className={`w-0.5 h-2 md:h-3 ${i < 4 ? 'bg-blue-500' : L ? 'bg-black/20' : 'bg-white/20'}`} />)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Memory Load</span>
                                <div className="flex items-center gap-2 md:gap-3">
                                    <span className={`text-base md:text-xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>1.2GB</span>
                                    <div className={`w-8 md:w-12 h-1 rounded-full overflow-hidden ${L ? 'bg-black/15' : 'bg-white/15'}`}>
                                        <div className="w-2/3 h-full bg-purple-500" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between w-full md:w-auto md:gap-16 text-right">
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Workspace Sync</span>
                                <div className="flex items-center gap-2 md:gap-3 justify-end">
                                    <span className="text-sm md:text-xl font-black text-green-600 tracking-tighter uppercase italic">Active</span>
                                    <Activity size={12} className="text-green-600 animate-pulse md:w-[14px] md:h-[14px]" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className={`text-[7px] font-black uppercase tracking-[0.5em] ${L ? 'text-black/50' : 'text-white/50'}`}>Regional Hub</span>
                                <span className={`text-sm md:text-xl font-black tracking-tighter uppercase ${L ? 'text-black' : 'text-white'}`}>MX-North</span>
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
