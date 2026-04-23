import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Check, Download, FileText, LayoutGrid, Tag, Share2, X, ChevronRight, AlertCircle } from 'lucide-react';

interface ExportConfig {
    title: string;
    method: 'grid' | 'single' | 'list';
    includeImages: boolean;
    notes: string;
    bruteWeight?: string;
}

interface ExportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onStart: (config: ExportConfig) => void;
    progress: number;
    status: string;
    moduleName: string;
    showBruteWeight?: boolean;
}

export const ExportWizard: React.FC<ExportWizardProps> = ({
    isOpen,
    onClose,
    onStart,
    progress,
    status,
    moduleName,
    showBruteWeight = false
}) => {
    const [step, setStep] = useState<'config' | 'progress' | 'complete'>('config');
    const [config, setConfig] = useState<ExportConfig>({
        title: `${moduleName} Export`,
        method: 'grid',
        includeImages: true,
        notes: '',
        bruteWeight: ''
    });

    // Reset step when opened
    React.useEffect(() => {
        if (isOpen) {
            setStep('config');
        }
    }, [isOpen]);

    // Transition to progress step when start is called
    const handleStart = () => {
        setStep('progress');
        onStart(config);
    };

    // Transition to complete when progress hits 100
    React.useEffect(() => {
        if (progress === 100) {
            setTimeout(() => setStep('complete'), 500);
        }
    }, [progress]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
            <div className="w-[520px] max-h-[90vh] overflow-hidden rounded-[48px] bg-white/[0.03] border border-white/10 flex flex-col shadow-2xl relative">
                {/* Top accent line */}
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-(--main-color) to-transparent shadow-[0_0_15px_rgba(var(--main-color),0.3)]" />
                
                {/* Header */}
                <div className="p-10 pb-6 flex justify-between items-start shrink-0">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                            {step === 'config' ? 'Export Configuration' : step === 'progress' ? 'Generating PDF' : 'Export Complete'}
                        </h2>
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">
                            {step === 'config' ? `Preparing ${moduleName} Manifest` : step === 'progress' ? status : 'Process finished successfully'}
                        </p>
                    </div>
                    {step !== 'progress' && (
                        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all">
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
                    {step === 'config' && (
                        <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4 duration-500">
                            {/* Title Input */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">Export Title</label>
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={config.title} 
                                    onChange={e => setConfig({ ...config, title: e.target.value })}
                                    className="w-full h-14 px-6 bg-white/[0.04] border border-white/10 rounded-2xl text-sm font-bold text-white outline-none focus:border-(--main-color)/30 focus:bg-white/5 transition-all"
                                />
                            </div>

                            {/* Method Selection */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">Layout Methodology</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setConfig({ ...config, method: 'grid' })}
                                        className={`flex flex-col gap-4 p-5 rounded-3xl border transition-all text-left ${config.method === 'grid' ? 'bg-(--main-color)/10 border-(--main-color)/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${config.method === 'grid' ? 'bg-(--main-color)/20 border-(--main-color)/30' : 'bg-white/5 border-white/10'}`}>
                                            <LayoutGrid size={20} className={config.method === 'grid' ? 'text-(--main-color)' : 'text-white/40'} />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black uppercase tracking-widest ${config.method === 'grid' ? 'text-white' : 'text-white/40'}`}>Catalog Grid</p>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-wider mt-1">Multi-image rows</p>
                                        </div>
                                    </button>
                                    <button 
                                        onClick={() => setConfig({ ...config, method: 'single' })}
                                        className={`flex flex-col gap-4 p-5 rounded-3xl border transition-all text-left ${config.method === 'single' ? 'bg-(--main-color)/10 border-(--main-color)/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${config.method === 'single' ? 'bg-(--main-color)/20 border-(--main-color)/30' : 'bg-white/5 border-white/10'}`}>
                                            <FileText size={20} className={config.method === 'single' ? 'text-(--main-color)' : 'text-white/40'} />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black uppercase tracking-widest ${config.method === 'single' ? 'text-white' : 'text-white/40'}`}>Per Image</p>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-wider mt-1">High fidelity cards</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Additional Fields */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">Notes</label>
                                    <textarea 
                                        value={config.notes} 
                                        onChange={e => setConfig({ ...config, notes: e.target.value })}
                                        className="w-full h-28 p-5 bg-white/[0.04] border border-white/10 rounded-2xl text-xs font-bold text-white outline-none focus:border-(--main-color)/30 focus:bg-white/5 transition-all resize-none"
                                        placeholder="Add manifest notes..."
                                    />
                                </div>
                                <div className="flex flex-col gap-8">
                                    {showBruteWeight && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">Brute Weight (KG)</label>
                                            <input 
                                                type="text" 
                                                value={config.bruteWeight} 
                                                onChange={e => setConfig({ ...config, bruteWeight: e.target.value })}
                                                placeholder="Total cargo mass..."
                                                className="w-full h-14 px-6 bg-white/[0.04] border border-white/10 rounded-2xl text-sm font-bold text-white outline-none focus:border-(--main-color)/30 focus:bg-white/5 transition-all"
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-4 p-5 rounded-3xl bg-white/2 border border-white/5">
                                        <input 
                                            type="checkbox" 
                                            id="includeImages"
                                            checked={config.includeImages}
                                            onChange={e => setConfig({ ...config, includeImages: e.target.checked })}
                                            className="w-5 h-5 rounded-lg border-2 border-white/20 bg-transparent checked:bg-(--main-color) checked:border-(--main-color) transition-all cursor-pointer"
                                        />
                                        <label htmlFor="includeImages" className="text-xs font-black uppercase tracking-widest text-white/60 cursor-pointer">Include Images</label>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleStart}
                                className="w-full h-16 rounded-[24px] bg-(--main-color) text-black text-sm font-black uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl flex items-center justify-center gap-4"
                            >
                                Start Generation <ChevronRight size={20} />
                            </button>
                        </div>
                    )}

                    {step === 'progress' && (
                        <div className="flex flex-col gap-10 py-10 animate-in fade-in duration-500 items-center">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-[32px] bg-(--main-color)/10 flex items-center justify-center border border-(--main-color)/20">
                                    <Loader2 size={40} className="text-(--main-color) animate-spin" />
                                </div>
                            </div>

                            <div className="w-full space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em]">Processing Assets</span>
                                    <span className="text-2xl font-black text-white font-mono">{Math.round(progress)}%</span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full p-1 border border-white/5 relative overflow-hidden">
                                    <div 
                                        className="h-full rounded-full bg-gradient-to-r from-(--main-color) to-[#AEE6F5] transition-all duration-300 shadow-[0_0_15px_rgba(var(--main-color),0.4)]"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 px-8 py-6 rounded-[32px] bg-white/2 border border-white/5 w-full">
                                <div className="p-3 rounded-xl bg-(--main-color)/10 text-(--main-color)">
                                    <AlertCircle size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                                        High-Res Assembly
                                    </span>
                                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-wider mt-1">
                                        Optimizing vector layouts and image layers...
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="flex flex-col gap-10 py-10 animate-in zoom-in duration-500 items-center text-center">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-[32px] bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                    <Check size={40} className="text-green-500" />
                                </div>
                                <div className="absolute -inset-4 rounded-[48px] border border-green-500/20 animate-ping duration-[3000ms]" />
                            </div>

                            <div className="flex flex-col gap-2">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Manifest Ready</h3>
                                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">Your export has been successfully generated</p>
                            </div>

                            <div className="w-full flex gap-4 pt-4">
                                <button 
                                    onClick={onClose}
                                    className="flex-1 h-14 rounded-full bg-white/5 border border-white/5 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] hover:bg-white/10 transition-all"
                                >
                                    Dismiss
                                </button>
                                <button 
                                    onClick={onClose}
                                    className="flex-[2] h-14 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Download size={16} /> Open Document
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
