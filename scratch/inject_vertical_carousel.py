import os

path = 'src/features/logistics/LabelWizard.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

end_pattern = """                <div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>
            </div>
        </div>
    );
};"""

carousel_jsx = """                <div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>
            </div>

            {/* UNIFIED PRINT WORKFLOW - VERTICAL CAROUSEL */}
            {isPrintWorkflowOpen && (
                <div className="absolute inset-0 z-[2000] flex flex-col pointer-events-auto bg-zinc-950/60 backdrop-blur-3xl overflow-hidden">
                    {/* Header / Nav */}
                    <div className="absolute top-6 right-6 z-[2010] flex gap-4">
                        <button
                            onClick={() => setIsPrintWorkflowOpen(false)}
                            className="p-3 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all bg-black/50 backdrop-blur-xl border border-white/10"
                        >
                            <X size={24} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Vertical Carousel Container */}
                    <div 
                        className="flex-1 w-full flex flex-col transition-transform duration-700 ease-in-out h-full"
                        style={{ transform: `translateY(-${activeSlide * 100}%)` }}
                    >
                        {/* ----------------------------------------------------- */}
                        {/* SLIDE 0: Print Quantities & Preview Labels Grid         */}
                        {/* ----------------------------------------------------- */}
                        <div className="w-full h-full shrink-0 flex">
                            {/* Left: Quantity Selector Panel */}
                            <div className="flex flex-col w-80 border-r border-white/10 bg-black/40 p-6 overflow-y-auto shrink-0 relative z-20">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xs font-black text-white/40 tracking-[0.3em] uppercase">Print Quantities</h3>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {selectedItems.map((item) => (
                                        <div 
                                            key={item.row} 
                                            onClick={() => handlePreviewClick(String(item.row))}
                                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${activePreviewId === String(item.row) ? 'bg-(--main-color)/20 border-(--main-color)' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                        >
                                            <div className="flex flex-col min-w-0 mr-4">
                                                <span className={`text-xs font-bold truncate ${activePreviewId === String(item.row) ? 'text-(--main-color)' : 'text-white'}`}>{item.codes.bookBarcode}</span>
                                                <span className="text-[10px] text-white/50 truncate">{item.normData.shortDescription || item.normData.type}</span>
                                            </div>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                max="99" 
                                                value={quantities[String(item.row)] || 1}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => setQuantities(prev => ({ ...prev, [String(item.row)]: parseInt(e.target.value) || 1 }))}
                                                className="w-16 bg-black/50 border border-white/20 rounded px-2 py-1 text-white text-center font-bold outline-none focus:border-(--main-color)"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Native Preview Labels Component */}
                            <div className="flex-1 relative bg-transparent flex flex-col">
                                <PreviewLabels 
                                    items={selectedItems} 
                                    quantities={quantities} 
                                    onClose={() => setIsPrintWorkflowOpen(false)}
                                    onLaunchIframe={(indices, instances) => {
                                        handleLaunchIframe(indices, instances);
                                        setActiveSlide(1);
                                    }}
                                />
                            </div>
                        </div>

                        {/* ----------------------------------------------------- */}
                        {/* SLIDE 1: Phomemo Designer Iframe                        */}
                        {/* ----------------------------------------------------- */}
                        <div className="w-full h-full shrink-0 flex flex-col relative bg-transparent">
                            {/* Slide up back button */}
                            <div className="absolute top-6 left-6 z-[2010]">
                                <button
                                    onClick={() => setActiveSlide(0)}
                                    className="px-4 py-2 rounded-xl bg-black/50 backdrop-blur-xl hover:bg-white/10 text-white font-bold flex items-center gap-2 border border-white/10 transition-all"
                                >
                                    &larr; Back to Preview
                                </button>
                            </div>
                            
                            <div className="flex-1 relative overflow-hidden bg-transparent">
                                <iframe
                                    ref={iframeRef}
                                    src={`phomemo-designer/index.html?v=${selectedIds.length}`}
                                    className="w-full h-full border-none bg-transparent"
                                    title="OnyxLabels Designer"
                                    allow="bluetooth"
                                    onLoad={handleIframeLoad}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};"""

if end_pattern in content:
    content = content.replace(end_pattern, carousel_jsx)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Vertical carousel injected successfully!")
else:
    print("Could not find end pattern in LabelWizard.tsx!")
