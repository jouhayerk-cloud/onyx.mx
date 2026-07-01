import React, { useState } from 'react';
import { X, ChevronRight, Lightbulb } from 'lucide-react';

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
        },
        {
            title: "Batch Actions",
            content: "When you select items, a bottom toolbar appears. This active selection bar lets you perform bulk actions like packing crates, generating labels, or updating statuses all at once.",
            image: `${basePath}tutorial/F/6.jpg`
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[32px] overflow-hidden w-full max-w-4xl shadow-[0_20px_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 relative flex flex-col">
                
                {/* Top: Image */}
                <div className="w-full bg-[#0a0a0a] relative min-h-[120px] md:min-h-[180px] p-6 md:p-10 flex items-center justify-center border-b border-white/10 overflow-hidden">
                    <img 
                        src={steps[step].image} 
                        alt={steps[step].title}
                        className="w-full h-auto max-h-[300px] object-contain opacity-95"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.classList.add('bg-gradient-to-br', 'from-(--main-color)/20', 'to-transparent');
                        }}
                    />
                </div>

                {/* Bottom: Content */}
                <div className="w-full p-8 flex flex-col justify-between relative">
                    <button 
                        onClick={onClose}
                        className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full z-10"
                    >
                        <X size={24} />
                    </button>
                    
                    <div className="mt-8">
                        <div className="flex items-center gap-4 mb-6 text-(--main-color)">
                            <div className="p-3 bg-(--main-color)/10 rounded-2xl">
                                <Lightbulb size={28} />
                            </div>
                            <h2 className="text-3xl font-bold text-white">{steps[step].title}</h2>
                        </div>
                        
                        <p className="text-white/70 mb-10 text-lg leading-relaxed whitespace-pre-wrap font-medium">
                            {steps[step].content}
                        </p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto pt-8 border-t border-white/10">
                        <div className="flex gap-2">
                            {steps.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-2 rounded-full transition-all ${i === step ? 'w-8 bg-(--main-color)' : 'w-2 bg-white/20'}`}
                                />
                            ))}
                        </div>
                        
                        <div className="flex gap-3">
                            {step > 0 && (
                                <button 
                                    onClick={() => setStep(s => s - 1)}
                                    className="px-5 py-3 rounded-xl text-white/70 hover:bg-white/5 transition-colors font-semibold"
                                >
                                    Back
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    if (step < steps.length - 1) setStep(s => s + 1);
                                    else onClose();
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-(--main-color) hover:brightness-110 text-white rounded-xl transition-all font-bold shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)] hover:shadow-[0_0_25px_rgba(var(--main-color-rgb),0.5)]"
                            >
                                {step < steps.length - 1 ? 'Next' : 'Got it!'}
                                {step < steps.length - 1 && <ChevronRight size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
