
import React from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { 
    isStudioSettingsOpenAtom, 
    studioSettingsViewModeAtom, 
    themeAtom, 
    appStyleAtom,
    performanceModeAtom, 
    userAtom,
    isOfflineModeAtom
} from '../../lib/atoms';
import { useSyncEngine } from '../../lib/syncEngine';
import { 
    X, AlertCircle, LogOut, 
    Shield, Activity, Palette, Zap, Terminal,
    Wifi, WifiOff, Layout
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
    const [appStyle, setAppStyle]         = useAtom(appStyleAtom);
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
                                <div className="space-y-8 md:space-y-16 pb-20">

                                    {/* ── NEURAL IDENTITY PANEL (NEW TOP POSITION) ── */}
                                    <div className={`p-4 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12 animate-in slide-in-from-top-4 duration-700`}>
                                        <div className="flex items-center gap-6 md:gap-8 w-full md:w-auto">
                                            <Shield size={32} strokeWidth={2} className="text-purple-500" />
                                            <div className="flex flex-col">
                                                <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.6em] mb-1 ${L ? 'text-black' : 'text-white'}`}>Operator</span>
                                                <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4">
                                                    <span className={`text-xl md:text-2xl font-black uppercase tracking-widest leading-none ${L ? 'text-black' : 'text-white'}`}>{user?.name || 'ROOT'}</span>
                                                    <span className="text-[10px] md:text-[11px] font-black text-blue-500 lowercase tracking-[0.2em] opacity-60">{user?.email?.toLowerCase()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 md:gap-8 w-full md:w-auto justify-end border-t md:border-t-0 pt-6 md:pt-0 border-white/5">
                                            {/* Style Toggle (Rock/Paper) */}
                                            <button 
                                                onClick={() => setAppStyle(appStyle === 'rock' ? 'paper' : 'rock')} 
                                                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-150 ${appStyle === 'paper' ? 'text-blue-500 hover:bg-blue-500/10' : 'text-white/20 hover:bg-white/10'}`}
                                                title={appStyle === 'paper' ? 'PAPER STYLE' : 'ROCK STYLE'}
                                            >
                                                <Layout size={20} />
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded transition-all duration-150 ${appStyle === 'paper' ? 'bg-blue-500 text-white' : L ? 'bg-black/10 text-black' : 'bg-white/10 text-white'} uppercase tracking-wider`}>
                                                    {appStyle === 'paper' ? 'PAPER' : 'ROCK'}
                                                </span>
                                            </button>

                                            {/* Performance Toggle */}
                                            <button 
                                                onClick={() => setPerf(!performanceMode)} 
                                                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-150 ${performanceMode ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-white/20 hover:bg-white/10'}`}
                                                title={performanceMode ? 'MAX PERFORMANCE' : 'STANDARD PERFORMANCE'}
                                            >
                                                <Zap size={20} />
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded transition-all duration-150 ${performanceMode ? 'bg-yellow-500 text-black' : L ? 'bg-black/10 text-black' : 'bg-white/10 text-white'}`}>
                                                    {performanceMode ? 'MAX' : 'STD'}
                                                </span>
                                            </button>

                                            <button 
                                                onClick={isOffline ? goOnline : goOffline} 
                                                className={`p-3 rounded-xl transition-all duration-150 ${isOffline ? 'text-green-500 hover:bg-green-500/10' : 'text-amber-500 hover:bg-amber-500/10'}`}
                                                title={isOffline ? 'GO ONLINE' : 'GO OFFLINE'}
                                            >
                                                {isOffline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                            </button>

                                            <button 
                                                onClick={logout} 
                                                className="p-3 rounded-xl text-red-500 hover:bg-red-500/10 transition-all duration-150"
                                                title="TERMINATE SESSION"
                                            >
                                                <LogOut size={20} />
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
                                                                <span className={`text-[12px] md:text-[14px] font-black uppercase tracking-[0.6em] transition-colors duration-150 ${isSel ? (L ? 'text-black' : 'text-white') : (L ? 'text-black/30 group-hover:text-black' : 'text-white/30 group-hover:text-white')}`}>
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
                                                         <span className={`text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] truncate mt-2 transition-colors duration-150 ${L ? 'text-black' : 'text-white'}`}>
                                                             {token.label}
                                                         </span>
                                                    </div>
                                                ))}
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
                    <div className={`mt-auto px-6 py-6 md:px-12 md:pb-16 md:pt-12 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-20 animate-in slide-in-from-bottom-8 duration-700 shrink-0`}>
                        <div className="flex items-center justify-between w-full md:w-auto md:gap-24">
                            <div className="flex flex-col gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-[0.5em] ${L ? 'text-black' : 'text-white'}`}>Latency</span>
                                <div className="flex items-center gap-4">
                                    <span className={`text-3xl md:text-5xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>14MS</span>
                                    <div className="flex gap-1">
                                        {[1,2,3,4,5].map(i => <div key={i} className={`w-1 h-4 md:h-6 ${i < 4 ? 'bg-blue-500' : L ? 'bg-black/20' : 'bg-white/20'}`} />)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-[0.5em] ${L ? 'text-black' : 'text-white'}`}>Memory</span>
                                <div className="flex items-center gap-4">
                                    <span className={`text-3xl md:text-5xl font-black tracking-tighter ${L ? 'text-black' : 'text-white'}`}>1.2GB</span>
                                    <div className={`w-12 md:w-20 h-2 rounded-full overflow-hidden ${L ? 'bg-black/15' : 'bg-white/15'}`}>
                                        <div className="w-2/3 h-full bg-purple-500" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between w-full md:w-auto md:gap-24 text-right">
                            <div className="flex flex-col gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-[0.5em] ${L ? 'text-black' : 'text-white'}`}>Sync</span>
                                <div className="flex items-center gap-4 justify-end">
                                    <span className="text-3xl md:text-5xl font-black text-green-500 tracking-tighter uppercase">ACTIVE</span>
                                    <Activity size={24} className="text-green-500 animate-pulse" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-[0.5em] ${L ? 'text-black' : 'text-white'}`}>Regional Hub</span>
                                <span className={`text-3xl md:text-5xl font-black tracking-tighter uppercase ${L ? 'text-black' : 'text-white'}`}>MX-NORTH</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.45); }
                    @keyframes loading {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(300%); }
                    }
                `}} />
            </div>
        </>,
        document.body
    );
};
