import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    inventoryAtom, storeInventoryAtom, exchangeRateAtom, workbookVersionAtom, 
    TOP_BAR_SEARCH_ATOM, inventoryArtifactConfigAtom, isDummyModeAtom,
    packingViewModeAtom, packingVendorFilterAtom, packingLabelSizeAtom,
    isPackingPrintWizardOpenAtom, packingExportPDFTriggerAtom, 
    packingExportXLSXTriggerAtom, packingExportJSONTriggerAtom,
    isPackingFiltersOpenAtom, isPackingNFCWizardOpenAtom
} from '../../lib/atoms';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import { 
    Package, CheckCircle2, Grid, List, ChevronRight, Filter, CheckSquare, Square, 
    FileSpreadsheet, FileJson, Maximize2, Send, Eye, Download, X, Edit, Printer, 
    Video, Hash, Copy, FileText, ArrowUpRight, Nfc, ChevronLeft, Zap, ShieldAlert
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Barcode from 'react-barcode';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile } from '../../lib/utils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

/* ─── ONYX MASTER TEMPLATE (V3) ─── */
const ONYX_MASTER_TEMPLATE = (width: number, height: number) => ({
    name: "OnyxLabels",
    version: 3,
    isTemplate: true,
    labelSize: { width, height },
    templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "MATERIAL COLOR"],
    elements: [
        {
            id: "el_barcode",
            type: "barcode",
            zone: 0,
            x: 19.74, y: 93.19, width: 380.26, height: 146.81,
            rotation: 0,
            barcodeData: "{{TAG ID}}",
            barcodeFormat: "CODE39",
            textFontSize: 25,
            textBold: true,
            showText: true
        },
        {
            id: "el_desc",
            type: "text",
            zone: 0,
            x: 29.72, y: 30.69, width: 350.6, height: 32.7,
            rotation: 0,
            text: "{{DESCRIPTION}}",
            fontSize: 29,
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold",
            align: "left",
            color: "white",
            background: "black"
        },
        {
            id: "el_sizes",
            type: "text",
            zone: 0,
            x: 210.55, y: 2.18, width: 176.1, height: 33.4,
            rotation: 0,
            text: "{{SIZES}}",
            fontSize: 20,
            fontFamily: "Inter, sans-serif",
            align: "right"
        },
        {
            id: "el_retail",
            type: "text",
            zone: 0,
            x: 29.72, y: 6.53, width: 254.65, height: 24.7,
            rotation: 0,
            text: "{{BOOK RETAIL}}",
            fontSize: 22,
            fontFamily: "Inter, sans-serif",
            align: "left",
            fontWeight: "bold"
        },
        {
            id: "el_mat",
            type: "text",
            zone: 0,
            x: 29.72, y: 63.39, width: 370.2, height: 29.8,
            rotation: 0,
            text: "{{MATERIAL COLOR}}",
            fontSize: 23,
            fontFamily: "Inter, sans-serif",
            align: "left",
            fontWeight: "bold"
        },
        {
            id: "el_side",
            type: "text",
            zone: 0,
            x: -100.24, y: 110.0, width: 233.59, height: 20.0,
            rotation: 90,
            text: "MADE IN MEXICO",
            fontSize: 21,
            color: "black",
            background: "transparent",
            align: "center",
            fontWeight: "bold",
            autoScale: false,
            clipOverflow: false,
            noWrap: true
        }
    ]
});

/* ─── JSON Project Generator (V3 Batch) ─── */
const buildBatchJSON = (items: any[], workbookPrefix: string, activeLabelSize: string, multiplier: number = 1) => {
    const [wStr, hStr] = activeLabelSize.split('x');
    const width = parseInt(wStr) || 50;
    const height = parseInt(hStr) || 30;

    // Build one record per item, then expand by (QUANTITY * multiplier) for print batch
    const baseRecords = items.map(item => {
        const d = item.normData;
        const c = item.codes;
        const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
        const retailStr = String(c.bookRetail || '0').padStart(4, '0');
        return {
            "TAG ID": c.bookBarcode || '',
            "DESCRIPTION": `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim().toUpperCase() || 'ONYX PIECE',
            "MATERIAL COLOR": `${d.material || 'ONYX'} ${d.color || ''}`.trim().toUpperCase(),
            "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`,
            "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
            "QUANTITY": d.quantity || 1,
            "LANDED CODE": c.bookLandCode,
            "ACQ CODE": c.bookAqCode,
            "QR URL": `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`
        };
    });

    // Expand by QUANTITY * multiplier — designer prints one label per templateData record
    const templateData = baseRecords.flatMap(r =>
        Array.from({ length: (Number(r["QUANTITY"]) || 1) * multiplier }, () => ({ ...r }))
    );

    return {
        ...ONYX_MASTER_TEMPLATE(width, height),
        name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
        exportedAt: new Date().toISOString(),
        templateData   // ← 'templateData' is the key importDesign() reads
    };
};

/* ─── NFC Tag Writing Wizard ─── */
const NFCWizard = ({ items, isOpen, onClose }: { items: any[], isOpen: boolean, onClose: () => void }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isWriting, setIsWriting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'writing' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const currentItem = items[currentIndex];
    const isSupported = 'NDEFReader' in window;

    const handleWrite = async () => {
        if (!isSupported) {
            toast.error("Web NFC is not supported on this browser.");
            return;
        }

        setIsWriting(true);
        setStatus('writing');
        setError(null);

        try {
            const reader = new (window as any).NDEFReader();
            // Start scanning/writing
            await reader.write({
                records: [{ recordType: "text", data: currentItem.codes.bookBarcode }]
            });
            
            setStatus('success');
            toast.success(`Tag Written: ${currentItem.codes.bookBarcodeDisplay}`);
            
            // Auto-advance after success
            setTimeout(() => {
                if (currentIndex < items.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                } else {
                    onClose();
                    toast.success("Batch Completed!");
                }
            }, 1000);
        } catch (err: any) {
            console.error('NFC Write Error:', err);
            setStatus('error');
            setError(err.name === 'NotAllowedError' ? 'Permission Denied' : err.message || "Failed to write tag");
            toast.error(`NFC Error: ${err.message}`);
        } finally {
            setIsWriting(false);
        }
    };

    if (!isOpen) return null;
    if (!currentItem) return null;

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-(--main-color)/10 text-(--main-color)">
                        <Nfc size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-widest">NFC Writing Batch</h2>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
                            Item {currentIndex + 1} of {items.length} · {items.length - currentIndex - 1} remaining
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-3 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-4xl mx-auto w-full">
                {!isSupported && (
                    <div className="flex flex-col items-center gap-6 p-12 rounded-3xl bg-red-500/10 border border-red-500/20 text-center animate-in zoom-in duration-500">
                        <ShieldAlert size={64} className="text-red-500" />
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase mb-2">Web NFC Not Supported</h3>
                            <p className="text-sm text-white/60 leading-relaxed max-w-md">
                                Your browser does not support the Web NFC API. Please use Chrome on Android or a compatible desktop version with NFC hardware.
                            </p>
                        </div>
                    </div>
                )}

                {isSupported && (
                    <div className="w-full flex flex-col items-center gap-12">
                        {/* Item Card Preview */}
                        <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-700">
                            <div className="aspect-square relative bg-black/40">
                                {currentItem.imageUrl ? (
                                    <img src={currentItem.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={80} /></div>
                                )}
                                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
                                <div className="absolute bottom-6 left-6 right-6">
                                    <div className="inline-flex px-3 py-1.5 rounded-lg bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest mb-3 shadow-xl">
                                        {currentItem.codes.bookBarcodeDisplay}
                                    </div>
                                    <h3 className="text-2xl font-black text-white uppercase leading-tight truncate">
                                        {currentItem.normData.shape || 'PIECE'}
                                    </h3>
                                    <p className="text-xs font-bold text-white/50 uppercase tracking-widest mt-1">
                                        {currentItem.normData.color} · {currentItem.normData.material}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Status & Action */}
                        <div className="flex flex-col items-center gap-8 w-full max-w-sm">
                            <div className="flex flex-col items-center text-center gap-3">
                                {status === 'idle' && (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 animate-pulse">
                                            <Zap size={32} />
                                        </div>
                                        <h4 className="text-lg font-black text-white uppercase tracking-widest">Ready to Program</h4>
                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Click below to start writing</p>
                                    </>
                                )}
                                {status === 'writing' && (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-(--main-color)/10 border border-(--main-color)/30 flex items-center justify-center text-(--main-color) animate-spin-slow">
                                            <Nfc size={32} />
                                        </div>
                                        <h4 className="text-lg font-black text-(--main-color) uppercase tracking-widest">Approaching Tag...</h4>
                                        <p className="text-[10px] font-bold text-(--main-color)/50 uppercase tracking-[0.2em] animate-pulse">Hold tag near device</p>
                                    </>
                                )}
                                {status === 'success' && (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-500 animate-in zoom-in">
                                            <CheckCircle2 size={32} />
                                        </div>
                                        <h4 className="text-lg font-black text-green-500 uppercase tracking-widest">Successfully Written</h4>
                                        <p className="text-[10px] font-bold text-green-500/50 uppercase tracking-[0.2em]">Advancing to next item...</p>
                                    </>
                                )}
                                {status === 'error' && (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
                                            <X size={32} />
                                        </div>
                                        <h4 className="text-lg font-black text-red-500 uppercase tracking-widest">Write Failed</h4>
                                        <p className="text-[10px] font-bold text-red-500/50 uppercase tracking-[0.2em]">{error}</p>
                                    </>
                                )}
                            </div>

                            <button
                                disabled={isWriting || status === 'success'}
                                onClick={handleWrite}
                                className={`w-full py-6 rounded-[2rem] text-xl font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-4 shadow-2xl
                                    ${status === 'writing' ? 'bg-white/10 text-white/50 cursor-wait' : 
                                      status === 'success' ? 'bg-green-500 text-black' :
                                      'bg-white text-black hover:bg-(--main-color) hover:scale-[1.02]'}`}
                            >
                                {status === 'writing' ? (
                                    <>SCANNING...</>
                                ) : (
                                    <>
                                        <Zap size={24} strokeWidth={3} />
                                        WRITE TAG
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Navigation */}
            <div className="p-8 border-t border-white/10 bg-white/2 flex items-center justify-between">
                <button 
                    disabled={currentIndex === 0}
                    onClick={() => { setCurrentIndex(prev => prev - 1); setStatus('idle'); }}
                    className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all disabled:opacity-0"
                >
                    <ChevronLeft size={20} />
                    <span className="text-xs font-black uppercase tracking-widest">Previous</span>
                </button>

                <div className="flex gap-4">
                    <button 
                        onClick={() => {
                            if (currentIndex < items.length - 1) {
                                setCurrentIndex(prev => prev + 1);
                                setStatus('idle');
                            } else {
                                onClose();
                            }
                        }}
                        className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <span className="text-xs font-black uppercase tracking-widest">Skip Item</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Main Module ─── */

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const wipInventory = useAtomValue(inventoryAtom);
    const storeInventory = useAtomValue(storeInventoryAtom);
    const inventory = useMemo(() => [...wipInventory, ...storeInventory], [wipInventory, storeInventory]);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const deferredSearch = React.useDeferredValue(globalSearchTerm);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isExportingXLSX, setIsExportingXLSX] = useState(false);
    const [isSendingToDesigner, setIsSendingToDesigner] = useState(false);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    
    // Global State from Top Bar
    const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
    const [labelSize, setLabelSize] = useAtom(packingLabelSizeAtom);
    const [isConfigExpanded, setIsConfigExpanded] = useAtom(isPackingFiltersOpenAtom);
    const [vendorFilter, setVendorFilter] = useAtom(packingVendorFilterAtom);
    const [isPrintWizardOpen, setIsPrintWizardOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const [exportPDFTrigger, setExportPDFTrigger] = useAtom(packingExportPDFTriggerAtom);
    const [exportXLSXTrigger, setExportXLSXTrigger] = useAtom(packingExportXLSXTriggerAtom);
    const [exportJSONTrigger, setExportJSONTrigger] = useAtom(packingExportJSONTriggerAtom);
    const [isNFCWizardOpen, setIsNFCWizardOpen] = useAtom(isPackingNFCWizardOpenAtom);
    const [showPreviewOverlay, setShowPreviewOverlay] = useState(false);
    const [lastPrintedIds, setLastPrintedIds] = useState<string[]>([]);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const pendingBatchRef = useRef<any>(null);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const processedItems = useMemo(() => {
        try {
            return inventory.map(item => {
                const normData = normalizeInventoryData(item?.data || {});
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                const baseImg = normData.generatedPngUrl || (normData.mediaUrls ? String(normData.mediaUrls).split(',')[0].trim() : null);
                return { ...item, codes, normData, imageUrl: getCleanImageUrl(baseImg) };
            }).filter(item => {
                const { normData, codes } = item;
                if (!normData || !codes) return false;

                const term = (deferredSearch || '').toLowerCase().trim();
                if (term) {
                    const fields = [
                        normData.itemId, normData.itemNumber, normData.color, normData.material,
                        normData.shape, normData.shortDescription, normData.description,
                        normData.widthCm, normData.heightCm, normData.lengthCm, normData.weightKg,
                        codes.bookAqCode, codes.bookLandCode, codes.bookBarcode,
                        normData.status, normData.workbook,
                    ].map(v => String(v || '').toLowerCase());
                    const haystack = fields.join(' ');
                    const terms = term.split(/\s+/).filter(Boolean);
                    if (!terms.every(t => haystack.includes(t))) return false;
                }

                if (vendorFilter) {
                    const vendorCode = String(codes.bookBarcode || '').substring(0, 2);
                    if (vendorCode !== vendorFilter) return false;
                }

                return true;
            });
        } catch (e) {
            console.error('processedItems error:', e);
            return [];
        }
    }, [inventory, deferredSearch, exchangeRate, workbookPrefix, vendorFilter]);

    const availableVendors = useMemo(() => {
        const vendorSet = new Set<string>();
        inventory.forEach(item => {
            const codes = calculateCodesAndPrices(normalizeInventoryData(item.data), exchangeRate, workbookPrefix);
            const code = String(codes.bookBarcode || '').substring(0, 2);
            if (code && (vendors as any)[code]) vendorSet.add(code);
        });
        return Array.from(vendorSet).sort();
    }, [inventory, exchangeRate, workbookPrefix]);

    // Selected items for the designer sidebar
    const selectedItems = useMemo(
        () => processedItems.filter(item => selectedIds.has(String(item.row))),
        [processedItems, selectedIds]
    );
    const activeItem = selectedItems[activeItemIndex] || null;

    // Clamp index when selection changes
    useEffect(() => {
        if (activeItemIndex >= selectedItems.length && selectedItems.length > 0) {
            setActiveItemIndex(selectedItems.length - 1);
        }
    }, [selectedItems.length, activeItemIndex]);

    // Sync active item to designer iframe
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !activeItem) return;
        const timer = setTimeout(() => {
            const batch = buildBatchJSON([activeItem], workbookPrefix, labelSize);
            iframe.contentWindow?.postMessage({
                type: 'LOAD_DESIGN',
                payload: {
                    elements: batch.elements,
                    labelSize: batch.labelSize,
                    templateData: batch.templateData
                }
            }, '*');
        }, 500);
        return () => clearTimeout(timer);
    }, [activeItem, activeItemIndex, workbookPrefix, labelSize]);

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === processedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(processedItems.map(i => String(i.row))));
        }
    };

    /* ── Export XLSX ── */
    const handleExportXLSX = async () => {
        if (isExportingXLSX || selectedIds.size === 0) return;
        setIsExportingXLSX(true);
        const tid = toast.loading('Building XLSX...');
        try {
            const rows = selectedItems.map(item => {
                const d = item.normData;
                const c = item.codes;
                const desc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
                const matColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
                const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
                const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
                return [c.bookBarcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
            });

            await exportToXLSX(`Packing_List_${new Date().toISOString().split('T')[0]}`, [{
                name: 'Packing List',
                data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }]);
            toast.success('XLSX exported', { id: tid });
        } catch (error: any) {
            toast.error(`XLSX failed: ${error.message}`, { id: tid });
        } finally {
            setIsExportingXLSX(false);
        }
    };

    /* ── Export JSON ── */
    const handleExportJSON = () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize);
        const blob = new Blob([JSON.stringify(batchProject, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Onyx_Batch_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`JSON exported — ${selectedItems.length} items`);
    };

    /* ── Export PDF (Manifesto Style) ── */
    const handleExportPDF = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        const tid = toast.loading('Generating Manifesto PDF...');
        try {
            const manifestoItems: ManifestoItem[] = selectedItems.map((item, idx) => {
                const d = item.normData;
                const c = item.codes;
                const vendorPrefix = String(c.bookBarcode || '').substring(0, 2);
                const rawUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [item.imageUrl];
                const imageUrls = rawUrls.map(u => getCleanImageUrl(u));
                
                return {
                    index: idx + 1,
                    vendorPrefix,
                    qty: Number(d.quantity) || 1,
                    itemId: c.bookBarcode,
                    rowId: item.id || String(item.row),
                    name: `${d.shape || ''} ${d.shortDescription || ''}`.trim() || 'ONYX PIECE',
                    material: d.material || 'ONYX',
                    color: d.color || '',
                    dims: `${d.widthCm || 0}×${d.lengthCm || 0}×${d.heightCm || 0} cm`,
                    weightKg: Number(d.weightKg) || 0,
                    costMxn: Number(d.price) || 0,
                    costUsd: Number(c.bookAcquisition) || 0,
                    imageUrls,
                    tagColor: (vendors as any)[vendorPrefix]?.color || '#555',
                    dbItemCount: Number(d.quantity) || 0 // Assuming current qty as stock for manifesto
                };
            });

            await exportCrateManifesto(manifestoItems, {
                dynamicId: `BATCH-${new Date().toISOString().slice(0, 10)}`,
                crateId: 'INTERNAL-PACKING',
                crateDims: 'N/A',
                crateType: 'BATCH',
                fillPct: 0,
                exportedAt: new Date().toLocaleString(),
                exportNotes: `PACKING LIST — ${selectedIds.size} ITEMS`,
                excludeHeader: true
            }, (pct) => {
                toast.loading(`Generating Manifesto: ${pct}%`, { id: tid });
            });
            
            toast.success('Manifesto PDF Downloaded', { id: tid });
        } catch (e) {
            console.error('Manifesto Export Error:', e);
            toast.error('Failed to generate PDF', { id: tid });
        }
    };

    /* ── Print Labels (The Wizard) ── */
    const handlePrintLabels = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        
        const timestamp = new Date().toISOString();
        const ids = Array.from(selectedIds);
        setLastPrintedIds(ids);

        const tid = toast.loading('Initializing Multi-Step Print Wizard...');
        try {
            // STEP 1: Generate XLSX (tracks filePrintDate)
            await handleExportXLSX();
            
            // STEP 2: Build JSON Project (Multiplier = 2)
            const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 2);
            localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            pendingBatchRef.current = batchProject; // stash for postMessage after DESIGNER_READY
            
            // STEP 3: Open Overlay PREVIEW
            setShowPreviewOverlay(true);
            
            toast.success('Wizard Step 1 Complete: XLSX generated. Step 2: Verification Ready.', { id: tid });
        } catch (e: any) {
            toast.error(`Wizard Failed: ${e.message}`, { id: tid });
        }
    };

    /* ── Handle Messages from iframe ── */
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            const { type, timestamp } = event.data || {};

            if (type === 'ONYX_PRINT_JOB_STARTED' && lastPrintedIds.length > 0 && db) {
                const toastId = toast.loading('Recording Print Event...');
                try {
                    if (isDummyMode) {
                        await new Promise(r => setTimeout(r, 1000));
                        toast.success('Print job simulated (Demo Mode)', { id: toastId, icon: '🧪' });
                        return;
                    }
                    const updatePromises = lastPrintedIds.map(async (id) => {
                        const doc = await db.inventory.findOne(id).exec();
                        if (doc) {
                            await doc.patch({
                                filePrintDate: new Date().toISOString(),
                                labelPrintDate: timestamp || new Date().toISOString()
                            });
                        }
                    });
                    await Promise.all(updatePromises);
                    toast.success('Print dates recorded to database', { id: toastId });
                } catch (e: any) {
                    console.error('Failed to update print dates:', e);
                    toast.error('Failed to save print tracking data', { id: toastId });
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [db, lastPrintedIds]);

    /* ── Called when iframe fully loads — post batch data ── */
    const handleIframeLoad = () => {
        if (pendingBatchRef.current && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                { type: 'LOAD_BATCH_PREVIEW', payload: pendingBatchRef.current },
                '*'
            );
            pendingBatchRef.current = null;
        }
    };

    /* ── Open Designer full screen with batch ── */
    const openDesignerFullscreen = () => {
        const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize);
        localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
        window.open('https://jouhayerk-cloud.github.io/phomemo-designer/index.html', '_blank');
    };

    // Listen for triggers from Top Bar
    useEffect(() => {
        if (isPrintWizardOpen) {
            if (selectedIds.size > 0) {
                handlePrintLabels();
            } else {
                toast.error('Please select items to print');
                setIsPrintWizardOpen(false);
            }
        }
    }, [isPrintWizardOpen]);

    // Open NFC Wizard effect
    useEffect(() => {
        if (isNFCWizardOpen && selectedItems.length === 0) {
            toast.error("Select items first to write NFC tags");
            setIsNFCWizardOpen(false);
        }
    }, [isNFCWizardOpen, selectedItems, setIsNFCWizardOpen]);

    useEffect(() => {
        if (exportPDFTrigger > 0) {
            if (selectedIds.size > 0) handleExportPDF();
            else toast.error('Please select items to export');
            setExportPDFTrigger(0);
        }
    }, [exportPDFTrigger]);

    useEffect(() => {
        if (exportXLSXTrigger > 0) {
            if (selectedIds.size > 0) handleExportXLSX();
            else toast.error('Please select items to export');
            setExportXLSXTrigger(0);
        }
    }, [exportXLSXTrigger]);

    useEffect(() => {
        if (exportJSONTrigger > 0) {
            if (selectedIds.size > 0) handleExportJSON();
            else toast.error('Please select items to export');
            setExportJSONTrigger(0);
        }
    }, [exportJSONTrigger]);

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">

            {/* ── SELECTION OVERLAY (Only shows when items selected) ── */}
            {selectedIds.size > 0 && (
                <div className="shrink-0 flex items-center justify-between px-8 py-2 bg-(--main-color) text-black animate-in slide-in-from-top duration-300 z-50">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.size} ARTIFACTS SELECTED</span>
                        <button onClick={() => setSelectedIds(new Set())} className="text-[9px] font-bold underline uppercase tracking-tighter opacity-50 hover:opacity-100 transition-opacity">Clear Selection</button>
                    </div>
                    <div className="flex items-center gap-3">
                         <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Ready for studio actions in top bar</span>
                         <ArrowUpRight size={14} className="opacity-40" />
                    </div>
                </div>
            )}

            {/* ── FILTER DRAWER ── */}
            <div className={`shrink-0 z-40 overflow-hidden transition-all duration-500 bg-black/60 backdrop-blur-3xl border-b border-white/5 ${isConfigExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 border-none'}`}>
                <div className="px-4 sm:px-8 py-5 flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={selectAll}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all flex-1 sm:flex-none justify-center"
                            >
                                {selectedIds.size === processedItems.length ? <CheckSquare size={13} className="text-(--main-color)" /> : <Square size={13} />}
                                {selectedIds.size === processedItems.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="relative group">
                            <select
                                value={labelSize}
                                onChange={e => setLabelSize(e.target.value as any)}
                                className="bg-white/5 border border-white/8 px-4 py-2.5 rounded-xl text-[9px] font-black text-white outline-none uppercase tracking-widest cursor-pointer w-full sm:w-auto appearance-none pr-10"
                            >
                                <option value="40x30">40×30 mm Pocket</option>
                                <option value="50x30">50×30 mm Industrial</option>
                                <option value="50x80">50×80 mm Elite Wide</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                                <ChevronRight size={12} className="rotate-90" />
                            </div>
                        </div>
                    </div>

                    {/* Vendor chips */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20 ml-1">Filter by Vendor</span>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setVendorFilter(null)}
                                className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border ${!vendorFilter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
                            >All Vendors</button>
                            {availableVendors.map(v => (
                                <button
                                    key={v}
                                    onClick={() => setVendorFilter(v)}
                                    className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${vendorFilter === v ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
                                >
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: (vendors as any)[v]?.color || '#FFF' }} />
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MAIN SPLIT LAYOUT ── */}
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* LEFT: Item grid / list */}
                <div className="flex-1 overflow-y-auto px-8 py-7 custom-scrollbar">
                    {processedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-white/10">
                            <div className="w-24 h-24 rounded-full border border-dashed border-white/8 flex items-center justify-center">
                                <Package size={36} strokeWidth={1} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] italic">No Artifacts Found</span>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 content-start">
                            {processedItems.map(item => (
                                <LogisticsCard
                                    key={item.row}
                                    item={item}
                                    isSelected={selectedIds.has(String(item.row))}
                                    onToggle={() => toggleSelect(String(item.row))}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 content-start">
                            {processedItems.map(item => (
                                <LogisticsRow
                                    key={item.row}
                                    item={item}
                                    isSelected={selectedIds.has(String(item.row))}
                                    isExpanded={expandedIds.has(String(item.row))}
                                    onToggle={() => toggleSelect(String(item.row))}
                                    onToggleExpand={() => toggleExpand(String(item.row))}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── LABEL PREVIEW OVERLAY — Fullscreen Glass Panel ── */}
            {showPreviewOverlay && (
                <div className="absolute inset-0 z-100 flex flex-col animate-in fade-in duration-200">

                    {/* ━━ Floating glass top bar ━━ */}
                    <div className="relative z-10 flex items-center justify-between px-6 py-3 bg-black/70 backdrop-blur-2xl border-b border-white/8">
                        {/* Left: mode label */}
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-(--main-color)/15 border border-(--main-color)/20">
                                <Eye size={15} strokeWidth={2.5} className="text-(--main-color)" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mb-0.5">OnyxLabels Engine</p>
                                <p className="text-xs font-black text-white uppercase tracking-widest leading-none">
                                    Batch Preview
                                    <span className="text-(--main-color) ml-1.5">— {selectedIds.size} Labels</span>
                                </p>
                            </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    const editProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 1);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: 'SHOW_EDITOR', payload: editProject },
                                        '*'
                                    );
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-widest hover:bg-white/10 hover:text-(--main-color) hover:border-(--main-color)/30 transition-all"
                            >
                                <Edit size={13} /> Edit Labels
                            </button>
                            <button
                                onClick={() => {
                                    // Re-send batch to re-open preview grid
                                    const batch = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 2);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: 'LOAD_BATCH_PREVIEW', payload: batch },
                                        '*'
                                    );
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-widest hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                                title="Back to Preview Grid"
                            >
                                <Eye size={13} /> Preview
                            </button>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <button
                                onClick={() => setShowPreviewOverlay(false)}
                                className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/8 transition-all"
                            >
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {/* ━━ Full-height iframe (no border, no padding) ━━ */}
                    <div className="flex-1 relative">
                        <iframe
                            ref={iframeRef}
                            src={`/phomemo-designer/index.html?mini=true&v=${selectedIds.size}`}
                            className="w-full h-full border-none"
                            title="OnyxLabels Designer"
                            allow="bluetooth"
                            onLoad={handleIframeLoad}
                        />
                    </div>

                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
            `}</style>

            <NFCWizard 
                items={selectedItems}
                isOpen={isNFCWizardOpen}
                onClose={() => setIsNFCWizardOpen(false)}
            />
        </div>
    );
};

/* ─── CARD VIEW (Gallery) ─── */
const LogisticsCard = ({ item, isSelected, onToggle }: any) => {
    const vendorColor = item.codes.vendorColor || 'transparent';
    const d = item.normData;
    const isVid = item.imageUrl ? isVideoFile(item.imageUrl) : false;
    const dimsCm = [d.widthCm, d.heightCm, d.lengthCm].filter(Boolean).join('×');

    return (
        <div
            onClick={onToggle}
            className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer border transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--main-color)/10 ${isSelected ? 'bg-(--main-color)/8 border-(--main-color)/35 shadow-xl shadow-(--main-color)/10 scale-[1.01]' : 'bg-white/5 border-white/10 hover:border-(--main-color)/30'}`}
        >
            {/* Image */}
            <div className="aspect-4/3 relative overflow-hidden bg-black/30">
                {item.imageUrl ? (
                    <>
                        <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                        {isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Video className="w-8 h-8 text-white" /></div>}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <OnyxMiniLogo className="w-12 h-12 opacity-10" />
                    </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {/* Tag ID */}
                <div className="absolute top-2 left-2 z-10">
                    {item.codes.bookBarcode && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.codes.bookBarcode); toast.success(`Copied: ${item.codes.bookBarcode}`, { icon: '📋' }); }}
                            className="px-2 py-1 rounded text-[10px] font-black uppercase text-black shadow-lg hover:scale-105 active:scale-95 transition-all" 
                            style={{ backgroundColor: vendorColor }}
                        >
                            {item.codes.bookBarcodeDisplay}
                        </button>
                    )}
                </div>
                {/* Selection */}
                <div className="absolute top-2 right-2 z-10">
                    <div className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/50 border-white/15 opacity-0 group-hover:opacity-100 backdrop-blur-md'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-black" strokeWidth={3.5} />}
                    </div>
                </div>
            </div>

            {/* Card body */}
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div>
                    <div className="font-bold text-sm text-white leading-tight truncate">
                        {d.shape || 'OBJ'}
                        <span className="opacity-40 font-black text-[10px] uppercase tracking-widest ml-2">{d.shortDescription || ''}</span>
                    </div>
                    {[d.color, d.material].some(Boolean) && (
                        <div className="text-[10px] text-(--text-color)/60 uppercase tracking-[0.2em] font-black mt-1 truncate">
                            {[d.color, d.material].filter(Boolean).join(' · ')}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest mb-0.5 leading-none">DIMS</span>
                        <span className="text-[10px] font-bold text-white/70 font-mono truncate">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] font-black text-white/25 uppercase tracking-[0.2em] mb-0.5 leading-none">AQ</span>
                            <span className="text-[10px] font-mono font-black text-(--main-color)/90">{item.codes.bookAqCode || '—'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] font-black text-white/25 uppercase tracking-[0.2em] mb-0.5 leading-none">LD</span>
                            <span className="text-[10px] font-mono font-black text-yellow-500/90">{item.codes.bookLandCode || '—'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-white/8">
                    <div className="flex flex-col">
                        <span className="text-[13px] font-black text-(--main-color)">${Math.ceil(Number(d.price || 0))}</span>
                        <span className="text-[8px] font-bold text-white/25 tracking-widest uppercase mt-0.5">COST MXN</span>
                    </div>
                    <span className="text-[10px] font-black text-white/30 bg-white/5 px-2 py-1 rounded-md font-mono">×{d.quantity || 1}</span>
                </div>
            </div>
        </div>
    );
};

/* ─── ROW VIEW (Inventory List style) ─── */
const LogisticsRow = ({ item, isSelected, isExpanded, onToggle, onToggleExpand }: any) => {
    const vendorColor = item.codes.vendorColor || '#555';
    const d = item.normData;
    const isVid = item.imageUrl ? isVideoFile(item.imageUrl) : false;
    const dimsCm = [d.widthCm, d.heightCm, d.lengthCm].filter(Boolean).join('×');
    const itemPriceMXN = Math.ceil(Number(d.price || 0));
    const itemQuantity = Number(d.quantity || 1);
    const weightKg = d.weightKg ? parseFloat(String(d.weightKg)) : null;

    return (
        <div className="flex flex-col gap-0">
            <div
                className={`flex flex-col sm:flex-row items-stretch overflow-hidden border rounded-2xl transition-all group shadow-sm ${
                    isSelected
                        ? 'bg-(--main-color)/8 border-(--main-color)/30 ring-1 ring-(--main-color)/20'
                        : 'bg-white/3 border-white/6 hover:border-white/12 hover:bg-white/5'
                }`}
            >
                {/* Select checkbox */}
                <div
                    onClick={onToggle}
                    className="w-10 shrink-0 flex items-center justify-center border-r border-white/5 cursor-pointer"
                >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all border ${
                        isSelected
                            ? 'bg-(--main-color) border-(--main-color) shadow-md shadow-(--main-color)/30'
                            : 'border-white/15 group-hover:border-white/30'
                    }`}>
                        {isSelected && <CheckCircle2 size={8} className="text-black" strokeWidth={3} />}
                    </div>
                </div>

                {/* Image thumb */}
                <div onClick={onToggle} className="w-14 h-14 shrink-0 bg-black/40 relative cursor-pointer">
                    {item.imageUrl ? (
                        <>
                            <img src={item.imageUrl} className="w-full h-full object-cover" />
                            {isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video className="w-3 h-3" /></div>}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20">
                            <OnyxMiniLogo className="w-7 h-7 object-contain" />
                        </div>
                    )}
                </div>

                {/* Scrollable data columns */}
                <div onClick={onToggle} className="flex-1 overflow-x-auto no-scrollbar flex items-center px-4 sm:px-3 gap-4 sm:gap-3 min-w-0 cursor-pointer py-3 sm:py-0">
                    {/* Name cluster */}
                    <div className="flex flex-col justify-center min-w-[140px] max-w-[240px] shrink-0 sm:border-r border-white/5 sm:pr-3 h-full">
                        <h3 className="text-xs font-black text-white truncate leading-tight">
                            {(d.shape || '') + ' ' + (d.shortDescription || d.description || '')}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-(--text-color)/60 font-black uppercase tracking-wider mt-1">
                            {d.color && <span className="truncate">{d.color}</span>}
                            {d.material && <><span className="text-white/20">·</span><span className="truncate">{d.material}</span></>}
                        </div>
                    </div>

                    {/* Tag ID Cluster (already updated in previous turn, but ensuring consistency) */}
                    <div className="flex flex-col min-w-[100px] shrink-0 sm:border-r border-white/5 sm:pr-4 justify-center h-full gap-1 group/tag">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Tag ID</span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.codes.bookBarcode); toast.success(`Copied: ${item.codes.bookBarcode}`, { icon: '📋' }); }}
                                className="inline-flex items-center px-2 py-1 rounded text-black text-[11px] font-black uppercase shadow-md w-fit hover:scale-105 active:scale-95 transition-all"
                                style={{ backgroundColor: vendorColor }}
                            >
                                {item.codes.bookBarcodeDisplay || 'N/A'}
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(`https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${item.codes.bookBarcode}`);
                                    toast.success('Trace Link Copied');
                                }}
                                className="p-1 -m-1 text-white/20 hover:text-(--main-color) transition-all opacity-0 group-hover/tag:opacity-100"
                                title="Copy Trace Link"
                            >
                                <Copy size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Desktop-only Columns (hidden on mobile, moved to expanded panel) */}
                    <div className="hidden lg:flex flex-col min-w-[72px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Price / Qty</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-[12px] font-bold text-white">${itemPriceMXN}</span>
                            <span className="text-[10px] text-white/40 font-mono">×{itemQuantity}</span>
                        </div>
                    </div>

                    <div className="hidden sm:flex flex-col min-w-[56px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">AQ / LD</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/70 font-mono">{item.codes.bookAqCode || '—'}</span>
                            <span className="text-[11px] text-yellow-400/80 font-mono">{item.codes.bookLandCode || '—'}</span>
                        </div>
                    </div>

                    <div className="hidden md:flex flex-col min-w-[60px] shrink-0 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Dims / Wt</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/50 font-mono">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                            {weightKg && <span className="text-[10px] text-white/50 font-mono">{weightKg}kg</span>}
                        </div>
                    </div>
                </div>

                {/* Expand button */}
                <div className="flex items-center px-2 py-2 shrink-0 bg-white/2 border-l border-white/5">
                    <button
                        onClick={e => { e.stopPropagation(); onToggleExpand(); }}
                        className={`p-1.5 hover:text-white hover:bg-white/10 rounded-md transition-colors ${isExpanded ? 'text-(--main-color)' : 'text-white/25'}`}
                    >
                        <Maximize2 className={`w-3.5 h-3.5 stroke-2 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Expanded Detail Panel */}
            {isExpanded && (
                <div className="ml-4 sm:ml-[94px] mr-1 px-4 pb-4 pt-3 bg-black/40 border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                        <div className="sm:hidden flex flex-col gap-1 col-span-2 pb-2 border-b border-white/5 mb-2">
                             <span className="text-[7px] font-black text-white/25 uppercase tracking-widest">Price / Qty</span>
                             <div className="flex items-baseline gap-2">
                                <span className="text-[14px] font-black text-(--main-color)">${itemPriceMXN}</span>
                                <span className="text-[11px] text-white/40 font-mono">×{itemQuantity}</span>
                             </div>
                        </div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Material</p><p className="text-[11px] font-black text-(--text-color)/80 uppercase tracking-wide">{d.material || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Dimensions</p><p className="text-[11px] font-mono font-black text-white/70">{dimsCm ? `${dimsCm}cm` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Weight</p><p className="text-[11px] font-mono font-black text-white/70">{weightKg ? `${weightKg}kg` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Quantity</p><p className="text-[11px] font-mono font-black text-white/70">{d.quantity || 1}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Status</p><p className="text-[11px] font-black text-white/70 uppercase tracking-wide">{d.status || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Book Retail</p><p className="text-[12px] font-mono font-black text-emerald-400">${item.codes.bookRetail || '—'}</p></div>
                    </div>
                    {/* Consolidated Artifact Identity Hub */}
                    <div className="mt-8 max-w-2xl mx-auto">
                        <div className="flex flex-col lg:flex-row items-center gap-8">
                            {/* Barcode Panel - High Density White */}
                            <div className="w-full lg:flex-1 bg-white rounded-none p-1.5 shadow-2xl border border-black/10 flex flex-col gap-2 overflow-hidden relative group/hub hover:shadow-[0_0_40px_rgba(255,255,255,0.05)] transition-all duration-500">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-none bg-black/20" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.codes.bookBarcode); toast.success(`Copied: ${item.codes.bookBarcode}`, { icon: '📋' }); }}
                                            className="px-2 py-1 rounded-none text-black text-[10px] font-black uppercase tracking-widest shadow-sm border border-black/5 hover:scale-105 active:scale-95 transition-all" 
                                            style={{ backgroundColor: vendorColor }}
                                        >
                                            {item.codes.bookBarcodeDisplay}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center p-2 bg-white border border-black/5 rounded-none transition-all grayscale group-hover/hub:grayscale-0 overflow-hidden w-full">
                                    <Barcode 
                                        value={item.codes.bookBarcode || 'N/A'} 
                                        format="CODE39" 
                                        width={2.0} 
                                        height={65} 
                                        displayValue={false}
                                        margin={0}
                                    />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-(--main-color) opacity-20" />
                            </div>

                            {/* Free-Floating QR - Theme Colored */}
                            <div className="flex-none p-2 relative group/qr">
                                <QRCodeSVG 
                                    value={`https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${item.codes.bookBarcode}`}
                                    size={140}
                                    level="H"
                                    includeMargin={false}
                                    fgColor="var(--main-color)"
                                    bgColor="transparent"
                                />
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.3em]">Logistics Trace</div>
                            </div>
                        </div>
                    </div>
                    {d.description && (
                        <p className="text-[10px] text-white/40 mt-2 italic leading-relaxed border-t border-white/5 pt-2">{d.description}</p>
                    )}
                </div>
            )}
        </div>
    );
};
