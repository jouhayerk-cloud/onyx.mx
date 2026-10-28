import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, Download, FileText, LayoutGrid, LayoutDashboard, Layers, X, ChevronRight, ExternalLink, Sparkles } from 'lucide-react';
import { tr } from '../lib/i18n';

export interface ExportConfig {
    title: string;
    method: 'grid' | 'single' | 'list' | 'compact' | 'compactGrid' | 'largeColor';
    includeImages: boolean;
    notes: string;
    bruteWeight?: string;
    branding?: 'MultiBrand' | 'ArtOfDecor' | 'RareEarth';
}

export interface ExportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onStart: (config: ExportConfig) => void;
    progress: number;
    status: string;
    moduleName: string;
    showBruteWeight?: boolean;
    initialBruteWeight?: string;
    pdfBlobUrl?: string | null;
}

export const ExportWizard: React.FC<ExportWizardProps> = ({
    isOpen,
    onClose,
    onStart,
    progress,
    status,
    moduleName,
    showBruteWeight = false,
    initialBruteWeight = '',
    pdfBlobUrl = null
}) => {
    const [step, setStep] = useState<'config' | 'progress' | 'complete'>('config');
    const [config, setConfig] = useState<ExportConfig>({
        title: moduleName.toLowerCase().includes('catalog') ? (moduleName.toLowerCase() === 'catalog' ? 'Onyx Collection' : moduleName) : `${moduleName} Catalog`,
        method: 'grid',
        includeImages: true,
        notes: '',
        bruteWeight: initialBruteWeight,
        branding: 'MultiBrand'
    });

    React.useEffect(() => {
        if (isOpen) {
            setStep('config');
            setConfig(prev => ({ ...prev, bruteWeight: initialBruteWeight }));
        }
    }, [isOpen, initialBruteWeight]);

    const handleStart = () => {
        setStep('progress');
        onStart(config);
    };

    React.useEffect(() => {
        if (progress === 100 || pdfBlobUrl) {
            setTimeout(() => setStep('complete'), 400);
        }
    }, [progress, pdfBlobUrl]);

    if (!isOpen) return null;

    const handleDownload = () => {
        if (!pdfBlobUrl) return;
        const a = document.createElement('a');
        a.href = pdfBlobUrl;
        const safeName = (config.title || 'Onyx_Catalog').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-2xl animate-in fade-in duration-300">
            {/* Liquid Onyx Glass Modal Container */}
            <div className={`w-[min(96vw,860px)] ${step === 'complete' && pdfBlobUrl ? 'h-[92vh]' : 'max-h-[92vh]'} rounded-[36px] bg-[rgba(12,16,26,0.80)] backdrop-blur-3xl border border-white/[0.14] shadow-[0_32px_100px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.22)] flex flex-col relative overflow-hidden text-white transition-all duration-300`}>
                
                {/* Specular Liquid Edge Line */}
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-(--main-color)/70 to-transparent shadow-[0_0_20px_rgba(var(--main-color),0.5)] pointer-events-none" />

                {/* Top Action Bar: Free-Floating Brand Icons & Close Button (NO heavy titles) */}
                <div className="pt-5 px-7 pb-3 flex items-center justify-between shrink-0">
                    {/* Embedded free-floating brand icons */}
                    <div className="flex items-center gap-5 sm:gap-6">
                        <img 
                            src={`${import.meta.env.BASE_URL}REG_Logo.png`} 
                            alt="Rare Earth Gallery" 
                            className="h-6.5 object-contain opacity-75 hover:opacity-100 transition-opacity filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.12)]" 
                        />
                        <div className="w-[1px] h-3.5 bg-white/15" />
                        <img 
                            src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} 
                            alt="Art Of Decor" 
                            className="h-6 object-contain opacity-75 hover:opacity-100 transition-opacity filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.12)]" 
                        />
                        <div className="w-[1px] h-3.5 bg-white/15" />
                        <img 
                            src={`${import.meta.env.BASE_URL}OnyxLogo.png`} 
                            alt="Onyx-mx" 
                            className="h-5.5 object-contain opacity-75 hover:opacity-100 transition-opacity filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.12)]" 
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {step === 'complete' && pdfBlobUrl && (
                            <button
                                onClick={handleDownload}
                                className="h-9 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-bold text-white flex items-center gap-2 transition-all active:scale-95 shadow-md"
                            >
                                <Download size={14} /> {tr("Download PDF")}
                            </button>
                        )}
                        {step !== 'progress' && (
                            <button 
                                onClick={onClose} 
                                className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.14] border border-white/[0.1] flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-md active:scale-95"
                                aria-label={tr("Close")}
                            >
                                <X size={17} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-7 pb-7 custom-scrollbar flex flex-col">
                    {step === 'config' && (
                        <div className="flex flex-col gap-5 animate-in slide-in-from-bottom-3 duration-400">
                            
                            {/* Export Title Input */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">{tr("Export Title")}</label>
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={config.title} 
                                    onChange={e => setConfig({ ...config, title: e.target.value })}
                                    className="w-full h-13 px-5 bg-white/[0.04] backdrop-blur-xl border border-white/[0.1] rounded-2xl text-sm font-semibold text-white outline-none focus:border-(--main-color)/60 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(var(--main-color),0.15)] transition-all placeholder:text-white/20"
                                    placeholder={tr("Enter catalog title...")}
                                />
                            </div>

                            {/* Layout Methodology (Glass Cards) */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">{tr("Layout Format")}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                    <button 
                                        type="button"
                                        onClick={() => setConfig({ ...config, method: 'grid' })}
                                        className={`group relative flex flex-col p-4.5 rounded-2xl border transition-all text-left backdrop-blur-xl ${
                                            config.method === 'grid' 
                                                ? 'bg-(--main-color)/14 border-(--main-color)/50 shadow-[0_0_30px_rgba(var(--main-color),0.22),inset_0_1px_1px_rgba(255,255,255,0.22)]' 
                                                : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                                config.method === 'grid' 
                                                    ? 'bg-(--main-color)/25 border-(--main-color)/40 text-(--main-color)' 
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <LayoutGrid size={18} />
                                            </div>
                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                config.method === 'grid'
                                                    ? 'bg-(--main-color)/20 border-(--main-color)/40 text-white font-bold'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-white/30'
                                            }`}>
                                                Landscape A4
                                            </span>
                                        </div>
                                        <p className={`text-xs font-black uppercase tracking-wider ${config.method === 'grid' ? 'text-white' : 'text-white/70'}`}>{tr("Catalog Grid")}</p>
                                        <p className="text-[10px] font-medium text-white/35 mt-0.5">{tr("Horizontal landscape · Multiple clean room images per sheet")}</p>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setConfig({ ...config, method: 'single' })}
                                        className={`group relative flex flex-col p-4.5 rounded-2xl border transition-all text-left backdrop-blur-xl ${
                                            config.method === 'single' 
                                                ? 'bg-(--main-color)/14 border-(--main-color)/50 shadow-[0_0_30px_rgba(var(--main-color),0.22),inset_0_1px_1px_rgba(255,255,255,0.22)]' 
                                                : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                                config.method === 'single' 
                                                    ? 'bg-(--main-color)/25 border-(--main-color)/40 text-(--main-color)' 
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <FileText size={18} />
                                            </div>
                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                config.method === 'single'
                                                    ? 'bg-(--main-color)/20 border-(--main-color)/40 text-white font-bold'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-white/30'
                                            }`}>
                                                Portrait A4
                                            </span>
                                        </div>
                                        <p className={`text-xs font-black uppercase tracking-wider ${config.method === 'single' ? 'text-white' : 'text-white/70'}`}>{tr("Per Image")}</p>
                                        <p className="text-[10px] font-medium text-white/35 mt-0.5">{tr("Vertical portrait · One single clean room image per sheet")}</p>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setConfig({ ...config, method: 'compact' })}
                                        className={`group relative flex flex-col p-4.5 rounded-2xl border transition-all text-left backdrop-blur-xl ${
                                            config.method === 'compact' 
                                                ? 'bg-(--main-color)/14 border-(--main-color)/50 shadow-[0_0_30px_rgba(var(--main-color),0.22),inset_0_1px_1px_rgba(255,255,255,0.22)]' 
                                                : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                                config.method === 'compact' 
                                                    ? 'bg-(--main-color)/25 border-(--main-color)/40 text-(--main-color)' 
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <Layers size={18} />
                                            </div>
                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                config.method === 'compact'
                                                    ? 'bg-(--main-color)/20 border-(--main-color)/40 text-white font-bold'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-white/30'
                                            }`}>
                                                9 Per Page
                                            </span>
                                        </div>
                                        <p className={`text-xs font-black uppercase tracking-wider ${config.method === 'compact' ? 'text-white' : 'text-white/70'}`}>{tr("Ribbon Labels")}</p>
                                        <p className="text-[10px] font-medium text-white/35 mt-0.5">{tr("Multiple items per page · Cutout PNGs & Axo · Barcode & Retail")}</p>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setConfig({ ...config, method: 'compactGrid' })}
                                        className={`group relative flex flex-col p-4.5 rounded-2xl border transition-all text-left backdrop-blur-xl ${
                                            config.method === 'compactGrid' 
                                                ? 'bg-(--main-color)/14 border-(--main-color)/50 shadow-[0_0_30px_rgba(var(--main-color),0.22),inset_0_1px_1px_rgba(255,255,255,0.22)]' 
                                                : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                                config.method === 'compactGrid' 
                                                    ? 'bg-(--main-color)/25 border-(--main-color)/40 text-(--main-color)' 
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <LayoutDashboard size={18} />
                                            </div>
                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                config.method === 'compactGrid'
                                                    ? 'bg-(--main-color)/20 border-(--main-color)/40 text-white font-bold'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-white/30'
                                            }`}>
                                                6 Per Page
                                            </span>
                                        </div>
                                        <p className={`text-xs font-black uppercase tracking-wider ${config.method === 'compactGrid' ? 'text-white' : 'text-white/70'}`}>{tr("Color Labels")}</p>
                                        <p className="text-[10px] font-medium text-white/35 mt-0.5">{tr("Landscape A4 · Packing-label panels · Stone colours, axo & codes")}</p>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setConfig({ ...config, method: 'largeColor' })}
                                        className={`group relative flex flex-col p-4.5 rounded-2xl border transition-all text-left backdrop-blur-xl ${
                                            config.method === 'largeColor' 
                                                ? 'bg-(--main-color)/14 border-(--main-color)/50 shadow-[0_0_30px_rgba(var(--main-color),0.22),inset_0_1px_1px_rgba(255,255,255,0.22)]' 
                                                : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                                config.method === 'largeColor' 
                                                    ? 'bg-(--main-color)/25 border-(--main-color)/40 text-(--main-color)' 
                                                    : 'bg-white/[0.04] border-white/[0.08] text-white/40'
                                            }`}>
                                                <LayoutDashboard size={18} />
                                            </div>
                                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                config.method === 'largeColor'
                                                    ? 'bg-(--main-color)/20 border-(--main-color)/40 text-white font-bold'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-white/30'
                                            }`}>
                                                4 Per Page
                                            </span>
                                        </div>
                                        <p className={`text-xs font-black uppercase tracking-wider ${config.method === 'largeColor' ? 'text-white' : 'text-white/70'}`}>{tr("Large Color")}</p>
                                        <p className="text-[10px] font-medium text-white/35 mt-0.5">{tr("Portrait A4 · Large cutout PNG labels · Stone colours, axo & codes")}</p>
                                    </button>
                                </div>
                            </div>

                            {/* Additional Options */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">{tr("Manifest Notes")}</label>
                                    <textarea 
                                        value={config.notes} 
                                        onChange={e => setConfig({ ...config, notes: e.target.value })}
                                        className="w-full h-20 p-3.5 bg-white/[0.04] backdrop-blur-xl border border-white/[0.1] rounded-2xl text-xs font-medium text-white outline-none focus:border-(--main-color)/50 focus:bg-white/[0.07] transition-all resize-none placeholder:text-white/20"
                                        placeholder={tr("Optional catalogue notes...")}
                                    />
                                </div>

                                <div className="flex flex-col justify-between gap-2.5">
                                    {showBruteWeight && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">{tr("Brute Weight (KG)")}</label>
                                            <input 
                                                type="text" 
                                                value={config.bruteWeight} 
                                                onChange={e => setConfig({ ...config, bruteWeight: e.target.value })}
                                                placeholder={tr("Cargo mass...")}
                                                className="w-full h-10 px-4 bg-white/[0.04] border border-white/[0.1] rounded-xl text-xs font-medium text-white outline-none focus:border-(--main-color)/50 transition-all"
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                                        <input 
                                            type="checkbox" 
                                            id="includeImages"
                                            checked={config.includeImages}
                                            onChange={e => setConfig({ ...config, includeImages: e.target.checked })}
                                            className="w-4 h-4 rounded border border-white/20 bg-white/5 checked:bg-(--main-color) checked:border-(--main-color) transition-all cursor-pointer accent-(--main-color)"
                                        />
                                        <label htmlFor="includeImages" className="text-xs font-semibold text-white/70 cursor-pointer select-none">
                                            {tr("Export Clean Room Images Only")}
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Action Button */}
                            <button 
                                type="button"
                                onClick={handleStart}
                                className="w-full h-14 mt-1 rounded-2xl bg-gradient-to-r from-(--main-color) to-[#60d5f8] text-[#04161e] text-xs font-black uppercase tracking-[0.25em] hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_8px_30px_rgba(var(--main-color),0.35)] flex items-center justify-center gap-3"
                            >
                                <Sparkles size={16} /> {tr("Generate PDF Catalog")} <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {step === 'progress' && (
                        <div className="flex-1 flex flex-col justify-center items-center py-12 gap-8 animate-in fade-in duration-500">
                            {/* Larger Progress Visual */}
                            <div className="relative flex items-center justify-center">
                                <div className="w-32 h-32 rounded-full bg-(--main-color)/10 border border-(--main-color)/30 flex items-center justify-center shadow-[0_0_50px_rgba(var(--main-color),0.25)] animate-pulse">
                                    <Loader2 size={54} className="text-(--main-color) animate-spin" />
                                </div>
                                <div className="absolute inset-0 rounded-full border-2 border-(--main-color)/20 animate-ping duration-[2500ms]" />
                            </div>

                            <div className="w-full max-w-md space-y-3 text-center">
                                <div className="flex justify-between items-baseline px-1">
                                    <span className="text-xs font-black text-(--main-color) uppercase tracking-[0.25em]">{tr("Generating Catalog")}</span>
                                    <span className="text-3xl font-black text-white font-mono">{Math.round(progress)}%</span>
                                </div>
                                <div className="h-2.5 w-full bg-white/[0.04] rounded-full p-0.5 border border-white/[0.08] relative overflow-hidden">
                                    <div 
                                        className="h-full rounded-full bg-gradient-to-r from-(--main-color) to-[#9ce4f9] transition-all duration-300 shadow-[0_0_20px_rgba(var(--main-color),0.5)]"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="text-xs font-medium text-white/50 pt-1">
                                    {status || tr("Warming clean room images and building vector layout...")}
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="flex-1 flex flex-col gap-4 animate-in zoom-in duration-300">
                            {pdfBlobUrl ? (
                                /* Embedded PDF Viewer */
                                <div className="flex-1 flex flex-col min-h-[460px] relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
                                    <iframe 
                                        src={`${pdfBlobUrl}#toolbar=0&navpanes=0`} 
                                        className="w-full h-full min-h-[480px] rounded-2xl border-0" 
                                        title={config.title || "Catalog PDF"} 
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center py-10 gap-6 text-center">
                                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                        <Check size={40} className="text-emerald-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-black text-white uppercase tracking-wider">{tr("Catalog Ready")}</h3>
                                        <p className="text-xs text-white/40">{tr("The document was compiled and downloaded successfully.")}</p>
                                    </div>
                                    <button 
                                        onClick={onClose}
                                        className="h-12 px-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.1] text-xs font-black uppercase tracking-widest text-white transition-all"
                                    >
                                        {tr("Dismiss")}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
