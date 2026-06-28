import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { createPortal } from 'react-dom';
import { 
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    exchangeRateAtom,
    workbookVersionAtom,
    themeAtom,
    packingSelectedIdsAtom,
    activeViewAtom,
    logisticsSubTabAtom
} from '../../lib/atoms';
import { 
    X, Printer, Nfc, FileSpreadsheet, FileText, Download, 
    CheckCircle2, ChevronRight, ChevronLeft, Zap, Info, Package,
    ShieldAlert, CheckCircle, Edit3, Check, BookOpen, Layers,
    Sparkles, ArrowRight, Activity, Terminal, ExternalLink,
    Smartphone, Cpu, Waves, QrCode, Tag, DollarSign, Barcode,
    Maximize2, Search, ZapOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, collectAllImages } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { vendors } from '../../lib/consts';
import { generateAxonometricDataUrl } from '../../lib/axonometric';
import { NFCTagCard } from '../../components/LabelVisuals';

/* ─── NFC Tags HUD Component ─── */
import { ScannerCenter } from '../../components/ScannerCenter';
import { PreviewLabels } from '../../components/PreviewLabels';

export const NFCWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingNFCWizardOpenAtom);
    const invIds = useAtomValue(selectedInventoryIdsAtom);
    const packingIds = useAtomValue(packingSelectedIdsAtom);
    const activeView = useAtomValue(activeViewAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isWriting, setIsWriting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'writing' | 'success' | 'error'>('idle');
    const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
    const [verifiedTags, setVerifiedTags] = useState<Set<string>>(new Set());

    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setStatus('idle');
            setVerifiedTags(new Set());
        }
    }, [isOpen]);

    const selectedItems = useMemo(() => {
        const usePacking = activeView === 'logistics' && logisticsSubTab === 'packing';
        const idsArray = usePacking 
            ? Array.from(packingIds) 
            : (invIds.length > 0 ? invIds : Array.from(packingIds));
        
        const idStrings = new Set(idsArray.map(String));

        return inventory
            .filter(item => {
                const row = String(item.row);
                const id = String(item.data?.id);
                const tag = String(item.data?.tag_id || item.data?.itemId || '');
                return idStrings.has(row) || idStrings.has(id) || (tag && idStrings.has(tag));
            })
            .map(item => {
                const normData = normalizeInventoryData(item.data);
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                return { ...item, normData, codes };
            });
    }, [inventory, invIds, packingIds, activeView, logisticsSubTab, exchangeRate, workbookPrefix]);

    const currentItem = selectedItems[currentIndex];
    const isSupported = typeof window !== 'undefined' && 'NDEFReader' in window;
    const isVerified = currentItem && verifiedTags.has(currentItem.codes.bookBarcode);

    const mediaUrls = collectAllImages(currentItem?.normData);

    const vendorPrefix = currentItem ? String(currentItem.normData.itemId || currentItem.codes.bookBarcode || '').split('-')[0].toUpperCase() : '';
    const vendorColor = (vendors as any)[vendorPrefix]?.color || '#FFFFFF';
    
    const qrUrl = currentItem ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentItem.codes.bookBarcode}&color=000000&bgcolor=FFFFFF` : '';
    const barcodeUrl = currentItem ? `https://bwipjs-api.metafloor.com/?bcid=code128&text=${currentItem.codes.bookBarcode}&scale=3&rotate=N&includetext=false&backgroundcolor=FFFFFF` : '';

    const handleSimulate = () => {
        setIsWriting(true);
        setStatus('writing');
        setTimeout(() => {
            setStatus('success');
            setIsWriting(false);
            if (currentIndex < selectedItems.length - 1) {
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                }, 1000);
            }
        }, 1500);
    };

    const handleWrite = async () => {
        if (!isSupported) {
            handleSimulate();
            return;
        }

        setIsWriting(true);
        setStatus('writing');

        try {
            if (!currentItem) throw new Error("No item selected for writing");
            
            const { normData, codes } = currentItem;
            const tagId = codes.bookBarcode || normData.itemId || normData.tag_id || 'UNKNOWN';
            const materialColor = `${normData.color || ''} ${normData.material || ''}`.trim();
            const description = `${normData.shape || ''} ${normData.shortDescription || ''}`.trim();
            const wbStr = String(normData.workbook || '').replace(/v/gi, '');
            const retailTag = `${codes.bookAqCode || ''}${wbStr}${codes.bookRetail || ''}`;
            
            const nfcData = `${tagId}|${materialColor}|${description}|${retailTag}`;

            // @ts-ignore
            const ndef = new NDEFReader();
            await ndef.write({
                records: [{ recordType: "text", data: nfcData }]
            });
            
            setStatus('success');
            toast.success(`NFC Tag Written: ${tagId}`);
            
            if (currentIndex < selectedItems.length - 1) {
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                }, 2000);
            }
        } catch (error: any) {
            setStatus('error');
            toast.error(`Write Failed: ${error.message || 'Unknown Error'}`);
        } finally {
            setIsWriting(false);
        }
    };

    if (!isOpen) return null;

    const bookV = String(currentItem?.normData.workbook || workbookPrefix || '326').toLowerCase();
    const cleanBookV = bookV.startsWith('v') ? bookV : `v${bookV}`;

    return (
        <div className="absolute inset-0 z-[1000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div 
                className="absolute inset-0 backdrop-blur-xl bg-black/40 pointer-events-auto" 
                onClick={() => setIsOpen(false)} 
            />
            
            <div className="relative w-full h-full flex flex-col lg:flex-row pointer-events-auto overflow-y-auto bg-black/10 backdrop-blur-3xl">
                
                {/* Floating Close Button - Studio Standard */}
                {!isPrintWorkflowOpen && (
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                    >
                        <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                    </button>
                )}

                <div className="flex justify-between items-start mb-16 shrink-0">
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                                <Terminal size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase leading-none">PRINT</h2>
                                <span className="text-[10px] font-black text-white/20 tracking-[1em] uppercase mt-3">SYSTEM_TACTICAL_OUTPUT_HUB</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[12px] font-black text-white/40 uppercase tracking-[1em] mb-4">BUFFER_COUNT</span>
                        <span className="text-8xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">{selectedItems.length}</span>
                    </div>
                </div>

                <div className="flex flex-col mb-20 shrink-0 max-w-2xl">
                    <div className="flex items-center gap-3 mb-4 opacity-30">
                        <Activity size={12} className="text-(--main-color)" />
                        <span className="text-[10px] font-black uppercase tracking-[0.8em]">MANIFEST_ID_PROTOCOL</span>
                    </div>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-5xl font-black text-white uppercase tracking-tighter placeholder:text-white/5 focus:text-(--main-color) transition-all"
                        placeholder="ID_NULL"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
                    {/* Bluetooth Print Module */}
                    <div className="flex flex-col items-center gap-6 group">
                        <button 
                            onClick={handlePrintBluetooth} 
                            disabled={progress.printer > 0 && progress.printer < 100} 
                            className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Printer size={64} strokeWidth={1} className={`transition-all duration-500 ${progress.printer === 100 ? 'text-(--main-color) drop-shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-(--main-color)/20 group-hover:text-(--main-color)'}`} />
                            {progress.printer > 0 && progress.printer < 100 && (
                                <div className="absolute -inset-4 border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">THERMAL_BT</span>
                            <span className="text-2xl font-black text-white uppercase tracking-[0.2em] group-hover:text-(--main-color) transition-colors">Printer</span>
                            
                            {/* Progress Bar */}
                            {progress.printer > 0 && (
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3 relative">
                                    <div 
                                        className={`h-full transition-all duration-500 ${progress.printer === 100 ? 'bg-(--main-color) shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]' : 'bg-(--main-color)/50'}`} 
                                        style={{ width: `${progress.printer}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    {/* XLSX Export Module */}
                    <div className="flex flex-col items-center gap-6 group">
                        <button 
                            onClick={handleGenerateXLSX} 
                            disabled={progress.xlsx > 0 && progress.xlsx < 100} 
                            className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                        >
                            <FileSpreadsheet size={64} strokeWidth={1} className={`transition-all duration-500 ${progress.xlsx === 100 ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]' : 'text-emerald-500/20 group-hover:text-emerald-400'}`} />
                            {progress.xlsx > 0 && progress.xlsx < 100 && (
                                <div className="absolute -inset-4 border-2 border-emerald-500/20 border-t-emerald-500 animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">CSV_BUFFER</span>
                            <span className="text-2xl font-black text-white uppercase tracking-[0.2em] group-hover:text-emerald-400 transition-colors">Labels</span>
                            
                            {/* Progress Bar */}
                            {progress.xlsx > 0 && (
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3 relative">
                                    <div 
                                        className={`h-full transition-all duration-500 ${progress.xlsx === 100 ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-emerald-500/50'}`} 
                                        style={{ width: `${progress.xlsx}%` }}
                                    />
                                </div>
                            )}

                            {/* Download Trigger */}
                            {progress.xlsx === 100 && urls.xlsx && (
                                <button 
                                    onClick={() => { const a = document.createElement('a'); a.href = urls.xlsx; a.download = `Labels_${name}.xlsx`; a.click(); }}
                                    className="mt-4 w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Download size={12} />
                                    RETRIEVE_FILE
                                </button>
                            )}
                        </div>
                    </div>

                    {/* PDF Control Page Module */}
                    <div className="flex flex-col items-center gap-6 group">
                        <button 
                            onClick={handleGeneratePDF} 
                            disabled={progress.pdf > 0 && progress.pdf < 100} 
                            className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                        >
                            <FileText size={64} strokeWidth={1} className={`transition-all duration-500 ${progress.pdf === 100 ? 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]' : 'text-red-500/20 group-hover:text-red-400'}`} />
                            {progress.pdf > 0 && progress.pdf < 100 && (
                                <div className="absolute -inset-4 border-2 border-red-500/20 border-t-red-500 animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">PDF_RENDER</span>
                            <span className="text-2xl font-black text-white uppercase tracking-[0.2em] group-hover:text-red-400 transition-colors">Control</span>
                            
                            {/* Progress Bar */}
                            {progress.pdf > 0 && (
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3 relative">
                                    <div 
                                        className={`h-full transition-all duration-500 ${progress.pdf === 100 ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.5)]' : 'bg-red-500/50'}`} 
                                        style={{ width: `${progress.pdf}%` }}
                                    />
                                </div>
                            )}

                            {/* Download Trigger */}
                            {progress.pdf === 100 && urls.pdf && (
                                <button 
                                    onClick={() => { const a = document.createElement('a'); a.href = urls.pdf; a.download = `ControlPage_${name}.pdf`; a.click(); }}
                                    className="mt-4 w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Download size={12} />
                                    RETRIEVE_FILE
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sales Catalog Module */}
                    <div className="flex flex-col items-center gap-6 group">
                        <div className="flex flex-col items-center gap-4">
                            <button 
                                onClick={handleGenerateCatalog} 
                                disabled={progress.catalog > 0 && progress.catalog < 100} 
                                className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                            >
                                <BookOpen size={64} strokeWidth={1} className={`transition-all duration-500 ${progress.catalog === 100 ? 'text-blue-400 drop-shadow-[0_0_20px_rgba(96,165,250,0.4)]' : 'text-blue-500/20 group-hover:text-blue-400'}`} />
                                {progress.catalog > 0 && progress.catalog < 100 && (
                                    <div className="absolute -inset-4 border-2 border-blue-500/20 border-t-blue-500 animate-spin rounded-full" />
                                )}
                            </button>
                            <div className="flex gap-4">
                                {['grid', 'single'].map(m => (
                                    <button 
                                        key={m} 
                                        onClick={() => setCatalogMethod(m as any)} 
                                        className={`text-[8px] font-black uppercase tracking-[0.4em] transition-all px-2 py-1 rounded-sm border ${catalogMethod === m ? 'text-blue-400 border-blue-500/40 bg-blue-500/10' : 'text-white/10 border-transparent hover:text-white/30'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">CATALOG_ENGINE</span>
                            <span className="text-2xl font-black text-white uppercase tracking-[0.2em] group-hover:text-blue-400 transition-colors">Catalog</span>
                            
                            {/* Progress Bar */}
                            {progress.catalog > 0 && (
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3 relative">
                                    <div 
                                        className={`h-full transition-all duration-500 ${progress.catalog === 100 ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]' : 'bg-blue-500/50'}`} 
                                        style={{ width: `${progress.catalog}%` }}
                                    />
                                </div>
                            )}

                            {/* Download Trigger */}
                            {progress.catalog === 100 && urls.catalog && (
                                <button 
                                    onClick={() => { const a = document.createElement('a'); a.href = urls.catalog; a.download = `Catalog_${name}.pdf`; a.click(); }}
                                    className="mt-4 w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Download size={12} />
                                    RETRIEVE_FILE
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>
            </div>

            {/* UNIFIED PRINT WORKFLOW - VERTICAL CAROUSEL */}
            {isPrintWorkflowOpen && (
                <div 
                    className="absolute inset-0 z-[5010] flex flex-col pointer-events-auto bg-transparent overflow-hidden"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsPrintWorkflowOpen(false);
                    }}
                    tabIndex={-1}
                >
                    {/* Vertical Carousel Container */}
                    <div 
                        className="flex-1 w-full flex flex-col transition-transform duration-700 ease-out"
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
                            <div className="flex-1 relative overflow-hidden bg-transparent">
                                <iframe
                                    ref={iframeRef}
                                    src={`phomemo-designer/index.html?v=${selectedIds.length}&theme=${theme}`}
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
        </div>,
        document.body
    );
};
