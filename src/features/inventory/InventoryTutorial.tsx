import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, Lightbulb } from 'lucide-react';
import { tr } from '../../lib/i18n';

export function InventoryTutorial({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);
    const basePath = import.meta.env.BASE_URL;
    
    const steps = [
        {
            title: "Compact View",
            content: "Use the Compact view for a high-density table of all items. Perfect for quick scanning and bulk actions.",
            image: `${basePath}tutorial/F/1.jpg`
        },
        {
            title: "Standard View",
            content: "The Standard view offers a balanced layout with clear item thumbnails alongside their key data.",
            image: `${basePath}tutorial/F/2.jpg`
        },
        {
            title: "Spacious View",
            content: "Switch to Spacious view when you need large, clear images of your items and more breathing room.",
            image: `${basePath}tutorial/F/3.jpg`
        },
        {
            title: "Powerful Filters",
            content: "Use the comprehensive Filters menu to drill down into your inventory by specific categories, vendors, or attributes.",
            image: `${basePath}tutorial/F/4.jpg`
        },
        {
            title: "Global Search",
            content: "The Search bar allows you to instantly find items across your entire inventory using names, codes, or tags.",
            image: `${basePath}tutorial/F/5.jpg`
        }
    ];

    return createPortal(
        <div className="fixed inset-0 z-[5000] flex items-center justify-center animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[80px]" onClick={onClose} />

            <div className="relative w-full h-[100dvh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-700">
                
                {/* ── HEADER ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between p-6 md:p-12 z-20 shrink-0">
                    <div className="flex items-center gap-6 md:gap-8">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-lg md:text-3xl font-black uppercase tracking-[0.4em] leading-none text-white">Onyx.mx</h1>
                                <span className="h-[1px] w-8 bg-white/40" />
                                <span className="text-[9px] font-black text-(--main-color) tracking-[0.3em] uppercase">{tr("Tutorial")}</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* ── CONTENT ────────────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden relative px-6 md:px-12 pb-6 md:pb-12 gap-6">
                    
                    {/* Top: Image Viewer */}
                    <div className="w-full relative flex items-center justify-center flex-1 overflow-hidden">
                        <div className="w-full h-full relative overflow-hidden flex items-center justify-center rounded-[32px] shadow-2xl">
                            <img 
                                src={steps[step].image} 
                                alt={steps[step].title}
                                className="w-full h-full object-cover opacity-100 transition-opacity duration-500 rounded-[32px]"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.classList.add('bg-gradient-to-br', 'from-(--main-color)/10', 'to-transparent');
                                }}
                            />
                        </div>
                    </div>

                    {/* Bottom: Text & Controls (Glassmorphic Window) */}
                    <div className="w-full shrink-0 p-8 md:p-10 flex flex-col relative z-10 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden">
                        
                        <div className="mb-8 flex flex-col">
                            <div className="flex items-center gap-4 mb-4 text-(--main-color)">
                                <div className="p-3 bg-(--main-color)/10 border border-(--main-color)/20 rounded-2xl">
                                    <Lightbulb size={24} />
                                </div>
                                <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white leading-tight">
                                    {steps[step].title}
                                </h2>
                            </div>
                            <p className="text-white/60 text-lg md:text-xl leading-relaxed font-medium max-w-5xl">
                                {steps[step].content}
                            </p>
                        </div>

                        {/* Navigation Footer */}
                        <div className="flex items-center justify-between mt-auto pt-8 border-t border-white/10 shrink-0">
                            <div className="flex gap-2">
                                {steps.map((_, i) => (
                                    <div 
                                        key={i} 
                                        className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-12 bg-(--main-color)' : 'w-3 bg-white/20'}`}
                                    />
                                ))}
                            </div>
                            
                            <div className="flex gap-3">
                                {step > 0 && (
                                    <button 
                                        onClick={() => setStep(s => s - 1)}
                                        className="px-6 py-4 rounded-xl text-white/50 hover:bg-white/5 transition-colors font-bold tracking-widest uppercase text-xs"
                                    >
                                        {tr("Back")}
                                    </button>
                                )}
                                <button 
                                    onClick={() => {
                                        if (step < steps.length - 1) setStep(s => s + 1);
                                        else onClose();
                                    }}
                                    className="flex items-center gap-3 px-8 py-4 bg-(--main-color)/20 hover:bg-(--main-color) text-(--main-color) hover:text-white rounded-xl transition-all duration-300 font-bold tracking-widest uppercase text-xs shadow-lg border border-(--main-color)/30 hover:border-transparent"
                                >
                                    {step < steps.length - 1 ? tr("Next Step") : tr("Get Started")}
                                    {step < steps.length - 1 && <ChevronRight size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
}
