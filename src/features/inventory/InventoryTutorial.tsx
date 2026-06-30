import React, { useState } from 'react';
import { X, ChevronRight, Lightbulb } from 'lucide-react';

export function InventoryTutorial({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);
    
    const steps = [
        {
            title: "Welcome to Inventory",
            content: "This is your central hub for tracking all your items and assets. Let's take a quick tour of the features available to you.",
        },
        {
            title: "Main Top Bar & Tools",
            content: "The top bar contains your primary navigation and tools. Use it to search, filter your inventory by status, vendor, or category, and switch between different modules like logistics and finance.",
        },
        {
            title: "Inventory View Modes",
            content: "You can visualize your inventory in three ways:\n- List View: A compact, detailed table of all items.\n- Grid View: Visual cards focusing on item thumbnails.\n- Studio View: An immersive 3D/Axonometric experience for spatial tracking.",
        },
        {
            title: "Selected Items Toolbar",
            content: "When you select one or more items using the checkboxes, a bottom toolbar will appear. This allows you to perform batch actions like printing labels, generating manifests, or moving items in bulk.",
        },
        {
            title: "Inventory Details",
            content: "Click on any item to open its details panel. Here you can edit item data, update the status, attach media, and view its full lifecycle history.",
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[32px] p-8 w-full max-w-lg shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200 relative">
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
                >
                    <X size={24} />
                </button>
                
                <div className="flex items-center gap-4 mb-6 text-(--main-color)">
                    <div className="p-3 bg-(--main-color)/10 rounded-2xl">
                        <Lightbulb size={28} />
                    </div>
                    <h2 className="text-2xl font-bold text-white">{steps[step].title}</h2>
                </div>
                
                <p className="text-white/70 mb-10 min-h-[80px] text-lg leading-relaxed whitespace-pre-wrap">
                    {steps[step].content}
                </p>
                
                <div className="flex items-center justify-between">
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
                                className="px-5 py-3 rounded-xl text-white/70 hover:bg-white/5 transition-colors font-medium"
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
    );
}
