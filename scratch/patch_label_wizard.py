import os

path = 'src/features/logistics/LabelWizard.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add PreviewLabels import
import_str = "import { ScannerCenter } from '../../components/ScannerCenter';"
content = content.replace(import_str, import_str + "\nimport { PreviewLabels } from '../../components/PreviewLabels';")

# 2. Replace state variables
state_str = """    const [isPrinterOverlayOpen, setIsPrinterOverlayOpen] = useState(false);
    const [isPreviewOverlayOpen, setIsPreviewOverlayOpen] = useState(false);"""
new_state_str = """    const [isPrintWorkflowOpen, setIsPrintWorkflowOpen] = useState(false);
    const [activeSlide, setActiveSlide] = useState<0 | 1>(0);"""
content = content.replace(state_str, new_state_str)

# 3. Update handlePrintBluetooth
print_bt_str = """            toast.success('Batch Prepared! Launching Print Engine', { id: tid });
            setIsPrinterOverlayOpen(true);"""
new_print_bt_str = """            toast.success('Batch Prepared! Launching Print Engine', { id: tid });
            setIsPrintWorkflowOpen(true);
            setActiveSlide(0);"""
content = content.replace(print_bt_str, new_print_bt_str)

# 4. Update useEffect resets
reset_str = """            setUrls({ xlsx: '', pdf: '', catalog: '' });
            setIsPrinterOverlayOpen(false);"""
new_reset_str = """            setUrls({ xlsx: '', pdf: '', catalog: '' });
            setIsPrintWorkflowOpen(false);
            setActiveSlide(0);"""
content = content.replace(reset_str, new_reset_str)

# 5. Update useEffect iframe load
iframe_effect_str = """    useEffect(() => {
        if (isPrinterOverlayOpen && iframeRef.current?.contentWindow && !pendingBatchRef.current) {"""
new_iframe_effect_str = """    useEffect(() => {
        if (isPrintWorkflowOpen && iframeRef.current?.contentWindow && !pendingBatchRef.current) {"""
content = content.replace(iframe_effect_str, new_iframe_effect_str)

iframe_effect_dep_str = """    }, [quantities, isPrinterOverlayOpen, selectedItems, workbookPrefix]);"""
new_iframe_effect_dep_str = """    }, [quantities, isPrintWorkflowOpen, selectedItems, workbookPrefix]);"""
content = content.replace(iframe_effect_dep_str, new_iframe_effect_dep_str)

# 6. Add handleLaunchIframe
handle_load_str = """            pendingBatchRef.current = null;
        }
    };"""
new_handle_load_str = """            pendingBatchRef.current = null;
        }
    };

    const handleLaunchIframe = async (indices: Set<number>, instances: any[]) => {
        if (indices.size > 0 && iframeRef.current?.contentWindow) {
            const filteredInstances = instances.filter(inst => indices.has(inst.globalIndex));
            const records = filteredInstances.map(inst => {
                const item = inst.item;
                const norm = item.normData || {};
                return {
                    "TAG ID": item.codes?.bookBarcode || '',
                    "DESCRIPTION": norm.shortDescription || norm.type || '',
                    "SIZES": `${norm.widthCm || ''}*${norm.lengthCm || ''}*${norm.heightCm || ''} CM  WT ${norm.weightKg || ''} KG`,
                    "BOOK RETAIL": item.codes?.bookRetail || '',
                    "COLOR MATERIAL": `${norm.color || ''} ${norm.material || ''}`,
                    "QR DATA": `https://app.onyx.com/item/${item.codes?.bookBarcode || ''}`,
                    "AXO_IMAGE": ''
                };
            });
            iframeRef.current.contentWindow.postMessage(
                { type: 'UPDATE_DATA', payload: { templateData: records } },
                '*'
            );
        }
    };"""
content = content.replace(handle_load_str, new_handle_load_str)

# 7. Replace the entire bottom section starting from NEW NATIVE PREVIEW LABELS
start_idx = content.find("                        {/* ── NEW NATIVE PREVIEW LABELS ── */}")
end_idx = content.find("        </div>,\n        document.body")

if start_idx != -1 and end_idx != -1:
    old_block = content[start_idx:end_idx]
    
    new_block = """            {/* UNIFIED PRINT WORKFLOW - VERTICAL CAROUSEL */}
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
\n"""
    content = content.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully.")
