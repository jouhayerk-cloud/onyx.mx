import React, { useState } from 'react';
import { X, ChevronRight, Lightbulb } from 'lucide-react';

export function InventoryTutorial({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);
    
    const steps = [
        {
            title: "Welcome to Inventory",
            content: "This is your central hub for tracking all your items and assets. Let's take a quick tour of the features available to you.",
            image: "/tutorial/1_blurred.png"
        },
        {
            title: "Main Top Bar & Tools",
            content: "The top bar contains your primary navigation and tools. Use it to search, filter your inventory by status, vendor, or category, and switch between different modules like logistics and finance.",
            image: "/tutorial/1_blurred.png"
        },
        {
            title: "Inventory View Modes",
            content: "You can visualize your inventory in three ways:\n- List View: A compact, detailed table of all items.\n- Grid View: Visual cards focusing on item thumbnails.\n- Studio View: An immersive 3D/Axonometric experience for spatial tracking.",
            image: "/tutorial/1_blurred.png"
        },
        {
            title: "Selected Items Toolbar",
            content: "When you select one or more items using the checkboxes, a bottom toolbar will appear. This allows you to perform batch actions like printing labels, generating manifests, or moving items in bulk.",
            image: "/tutorial/1_blurred.png"
        },
        {
            title: "Inventory Details",
            content: "Click on any item to open its details panel. Here you can edit item data, update the status, attach media, and view its full lifecycle history.",
            image: "/tutorial/1_blurred.png"
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-[32px] overflow-hidden w-full max-w-4xl shadow-[0_20px_80px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 relative flex flex-col md:flex-row">
                
                {/* Left side: Image */}
                <div className="w-full md:w-1/2 bg-black/50 relative min-h-[300px] md:min-h-[500px] flex items-center justify-center border-b md:border-b-0 md:border-r border-white/10 overflow-hidden">
                    <img 
                        src={steps[step].image} 
                        alt={steps[step].title}
                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.classList.add('bg-gradient-to-br', 'from-(--main-color)/20', 'to-transparent');
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Right side: Content */}
                <div className="w-full md:w-1/2 p-8 flex flex-col justify-between relative">
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
