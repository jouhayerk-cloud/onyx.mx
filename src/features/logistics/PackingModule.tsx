import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    inventoryAtom, storeInventoryAtom, exchangeRateAtom, workbookVersionAtom, 
    TOP_BAR_SEARCH_ATOM, inventoryArtifactConfigAtom, isDummyModeAtom,
    packingViewModeAtom, packingVendorFilterAtom, packingLabelSizeAtom,
    isPackingPrintWizardOpenAtom, packingExportPDFTriggerAtom, 
    packingExportXLSXTriggerAtom, packingExportJSONTriggerAtom,
    isPackingFiltersOpenAtom, isPackingNFCWizardOpenAtom,
    packingSortKeyAtom, packingSortOrderAtom, packingSelectedIdsAtom
} from '../../lib/atoms';
import { exportToXLSX } from '../../lib/xlsxUtils';
import ExcelJS from 'exceljs';
import toast from 'react-hot-toast';
import { 
    Package, CheckCircle2, Grid, List, ChevronRight, Filter, CheckSquare, Square, 
    FileSpreadsheet, FileJson, Maximize2, Send, Eye, Download, X, Edit, Printer, 
    Video, Hash, Copy, FileText, ArrowUpRight, Nfc, ChevronLeft, Zap, ShieldAlert
} from 'lucide-react';
import { NFCTagCard } from '../../components/LabelVisuals';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Barcode from 'react-barcode';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, collectAllImages } from '../../lib/utils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { ImageOff, LayoutGrid, CheckCircle } from 'lucide-react';
import { ExportWizard } from '../../components/ExportWizard';
import { tr } from '../../lib/i18n';

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
const getContrastColorHex = (hex: string): string => {
    if (!hex || hex.length < 7) return '#ffffff';
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#ffffff' : '#000000';
};

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



/* ─── Printables Export Wizard ─── */
const PrintablesWizard = ({ items, isOpen, onClose, workbookPrefix, progress, setProgress, urls, setUrls }: any) => {
    const [name, setName] = useState(`Onyx_Labels_${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })}`);
    const [includeImages, setIncludeImages] = useState(false);

    const handleGenerateXLSX = async () => {
        setProgress((p: any) => ({ ...p, xlsx: 10 }));
        try {
            const data = items.map((item: any) => {
                const d = item.normData;
                const c = item.codes;
                
                const desc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
                const matColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
                const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
                const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
                
                return [
                    c.bookBarcode, 
                    desc, 
                    matColor, 
                    sizes, 
                    d.quantity || 1, 
                    c.bookLandCode || '', 
                    c.bookAqCode || '', 
                    bookRetailTag, 
                    qrUrl
                ];
            });
            
            setProgress((p: any) => ({ ...p, xlsx: 50 }));
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Packing List');
            
            const headers = ['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'];
            ws.addRow(headers);
            data.forEach((r: any) => ws.addRow(r));
            
            ws.getRow(1).font = { bold: true };
            ws.columns = headers.map(() => ({ width: 22 }));

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            setUrls((u: any) => ({ ...u, xlsx: URL.createObjectURL(blob) }));
            setProgress((p: any) => ({ ...p, xlsx: 100 }));
        } catch (e) {
            console.error(e);
            setProgress((p: any) => ({ ...p, xlsx: -1 }));
            toast.error('XLSX Generation Failed');
        }
    };

    const handleGeneratePDF = async () => {
        setProgress((p: any) => ({ ...p, pdf: 5 }));
        try {
            const manifestoItems: ManifestoItem[] = items.map((item: any, idx: number) => {
                const d = item.normData;
                const c = item.codes;
                return {
                    index: idx, 
                    vendorPrefix: c.vendorPrefix || '', 
                    qty: Number(d.quantity || 1),
                    itemId: c.bookBarcode || '', 
                    rowId: String(item.row),
                    name: `${d.shape || ''} ${d.shortDescription || ''}`.trim() || 'Artifact',
                    material: d.material || '', 
                    color: d.color || '',
                    dims: [d.lengthCm, d.widthCm, d.heightCm].filter(Boolean).join('×'),
                    weightKg: parseFloat(d.weightKg) || 0,
                    costMxn: 0, 
                    costUsd: 0, 
                    imageUrls: includeImages ? (item.imageUrls || []) : [],
                    tagColor: c.vendorColor || '#333', 
                    dbItemCount: Number(d.quantity || 1),
                    packetIn: ''
                };
            });

            const meta = {
                dynamicId: name, 
                crateId: `LBL-${Date.now()}`, 
                crateDims: 'N/A',
                crateType: 'Labels Batch', 
                fillPct: 100, 
                exportedAt: new Date().toLocaleString(),
                customTitle: 'LABELS PACKING LIST',
                excludeImages: !includeImages,
                excludeHeaderQr: true,
                excludeHeaderWireframe: true
            };

            const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress((p: any) => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), true) as Blob;
            setUrls((u: any) => ({ ...u, pdf: URL.createObjectURL(blob) }));
            setProgress((p: any) => ({ ...p, pdf: 100 }));
        } catch (e) {
            console.error(e);
            setProgress((p: any) => ({ ...p, pdf: -1 }));
            toast.error('PDF Generation Failed');
        }
    };

    const triggerDownload = (url: string, filename: string) => {
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-white/[0.05] backdrop-blur-2xl" />
            <div className="relative z-10 w-full max-w-md mx-4 rounded-[3rem] border border-white/10 p-10 flex flex-col gap-8 shadow-2xl bg-white/[0.01] backdrop-blur-3xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-500"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter text-white">{tr("Printables Wizard")}</h3>
                        <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-bold">Generate Assets for {items.length} {tr("Labels")}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{tr("Batch Identity")}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-(--main-color)/50 transition-all font-bold"
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{tr("Include Visuals")}</span>
                            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tighter">{tr("Add images to PDF catalog")}</span>
                        </div>
                        <button 
                            onClick={() => setIncludeImages(!includeImages)}
                            className={`w-12 h-6 rounded-full transition-all relative ${includeImages ? 'bg-(--main-color)' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${includeImages ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    {/* XLSX Option */}
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.05] transition-all">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="block text-sm font-black text-white uppercase tracking-tight">{tr("inventory.xlsx")}</span>
                            <span className="block text-[9px] text-white/30 uppercase font-bold tracking-widest mt-0.5">{tr("Master spreadsheet (Legacy)")}</span>
                            {progress.xlsx >= 0 && (
                                <div className="mt-3 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress.xlsx}%` }} />
                                </div>
                            )}
                        </div>
                        {progress.xlsx === 100 ? (
                            <button onClick={() => triggerDownload(urls.xlsx, `${name}.xlsx`)} className="px-4 py-2 bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">{tr("Download")}</button>
                        ) : (
                            <button onClick={handleGenerateXLSX} disabled={progress.xlsx >= 0} className="px-4 py-2 bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                {progress.xlsx >= 0 ? tr("Building...") : tr("Generate")}
                            </button>
                        )}
                    </div>

                    {/* PDF Option */}
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.05] transition-all">
                        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                            <FileText size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="block text-sm font-black text-white uppercase tracking-tight">{tr("catalog.pdf")}</span>
                            <span className="block text-[9px] text-white/30 uppercase font-bold tracking-widest mt-0.5">{tr("Packing list manifest")}</span>
                            {progress.pdf >= 0 && (
                                <div className="mt-3 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${progress.pdf}%` }} />
                                </div>
                            )}
                        </div>
                        {progress.pdf === 100 ? (
                            <button onClick={() => triggerDownload(urls.pdf, `${name}.pdf`)} className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">{tr("Download")}</button>
                        ) : (
                            <button onClick={handleGeneratePDF} disabled={progress.pdf >= 0} className="px-4 py-2 bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                {progress.pdf >= 0 ? tr("Rendering...") : tr("Generate")}
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-center">
                    <p className="text-[8px] font-black text-white/10 uppercase tracking-[0.4em]">{tr("OnyxLabels Printables Engine v2.5")}</p>
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

    const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isExportingXLSX, setIsExportingXLSX] = useState(false);
    const [isSendingToDesigner, setIsSendingToDesigner] = useState(false);
    const [isPrintablesWizardOpen, setIsPrintablesWizardOpen] = useState(false);
    
    // Wizard Persistence State
    const [printablesProgress, setPrintablesProgress] = useState({ xlsx: -1, pdf: -1 });
    const [printablesUrls, setPrintablesUrls] = useState({ xlsx: '', pdf: '' });
    
    // Reset wizard when selection changes
    useEffect(() => {
        setPrintablesProgress({ xlsx: -1, pdf: -1 });
        setPrintablesUrls({ xlsx: '', pdf: '' });
    }, [selectedIds.size]); // Use size to trigger reset on selection change

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
    const [sortKey, setSortKey] = useAtom(packingSortKeyAtom);
    const [sortOrder, setSortOrder] = useAtom(packingSortOrderAtom);
    const [showPreviewOverlay, setShowPreviewOverlay] = useState(false);
    const [lastPrintedIds, setLastPrintedIds] = useState<string[]>([]);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [isExportProgressOpen, setIsExportProgressOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [exportMethod, setExportMethod] = useState<'images' | 'no-images'>('images');
    const [exportNotes, setExportNotes] = useState('');
    const [exportBruteWeight, setExportBruteWeight] = useState('');
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
            const items = inventory.map(item => {
                const normData = normalizeInventoryData(item?.data || {});
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                
                // Standardized robust image collection (including legacy fields)
                const imageUrls = collectAllImages(normData);
                const imageUrl = imageUrls[0] || null;
                
                return { ...item, codes, normData, imageUrl, imageUrls };
            }).filter(item => {
                const { normData, codes } = item;
                if (!normData || !codes) return false;

                const term = (deferredSearch || '').toLowerCase().trim();
                if (term) {
                    const barcode = String(codes.bookBarcode || '').toLowerCase();
                    const terms = term.split(/\s+/).filter(Boolean);
                    
                    // If any search term matches the barcode EXACTLY, we include this item (Batch Search)
                    if (terms.some(t => barcode === t)) return true;

                    const fields = [
                        normData.itemId, normData.itemNumber, normData.color, normData.material,
                        normData.shape, normData.shortDescription, normData.description,
                        normData.widthCm, normData.heightCm, normData.lengthCm, normData.weightKg,
                        codes.bookAqCode, codes.bookLandCode, codes.bookBarcode,
                        normData.status, normData.workbook,
                    ].map(v => String(v || '').toLowerCase());
                    const haystack = fields.join(' ');
                    
                    // Standard multi-term search (AND logic)
                    if (!terms.every(t => haystack.includes(t))) return false;
                }

                if (vendorFilter) {
                    const vendorCode = String(codes.bookBarcode || '').substring(0, 2);
                    if (vendorCode !== vendorFilter) return false;
                }

                return true;
            });

            return items.sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                if (sortKey === 'Date') {
                    valA = a.data?.timestamp || a.created_at || a.data?.created_at || '';
                    valB = b.data?.timestamp || b.created_at || b.data?.created_at || '';
                } else if (sortKey === 'Status') {
                    valA = a.normData.status || '';
                    valB = b.normData.status || '';
                } else if (sortKey === 'Vendor') {
                    valA = a.codes.bookBarcode?.substring(0, 2) || '';
                    valB = b.codes.bookBarcode?.substring(0, 2) || '';
                } else if (sortKey === '#') {
                    valA = Number(a.normData.quantity) || 0;
                    valB = Number(b.normData.quantity) || 0;
                }

                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        } catch (e) {
            console.error('processedItems error:', e);
            return [];
        }
    }, [inventory, deferredSearch, exchangeRate, workbookPrefix, vendorFilter, sortKey, sortOrder]);

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

    /* ── Export PDF (Manifesto Style) ── */
    const handleStartExport = async (cfg: any) => {
        if (selectedIds.size === 0) return toast.error(tr("Select items first"));
        const tid = toast.loading(tr("Generating Manifesto PDF..."));
        try {
            const manifestoItems: ManifestoItem[] = selectedItems.map((item, idx) => {
                const d = item.normData;
                const c = item.codes;
                
                // Properly derive vendor prefix for color coding (e.g. "EM" from "EM-001-T" or "R" from "R-001-T")
                const vendorPrefix = String(d.itemId || c.bookBarcode || '').split('-')[0].toUpperCase();
                
                const imageUrls = item.imageUrls || [];
                
                return {
                    index: idx + 1,
                    vendorPrefix,
                    qty: Number(d.quantity) || 1,
                    itemId: d.itemId || c.bookBarcode, // Use the BOOK barcode tag ID (e.g. EM-001-T)
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
                    dbItemCount: Number(d.quantity) || 0
                };
            });

            await exportCrateManifesto(manifestoItems, {
                dynamicId: `BATCH-${new Date().toISOString().slice(0, 10)}`,
                crateId: 'INTERNAL-PACKING',
                crateDims: 'N/A',
                crateType: 'BATCH',
                fillPct: 0,
                exportedAt: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }),
                exportNotes: cfg.notes?.trim() || `PACKING LIST — ${selectedIds.size} ITEMS`,
                exportBruteWeight: cfg.bruteWeight?.trim() || undefined,
                branding: cfg.branding,
                excludeImages: !cfg.includeImages,
                excludeHeader: true,
                customTitle: cfg.title
            }, (pct) => {
                setExportProgress(pct);
                setExportStatus(`Assembling page vectors: ${pct}%`);
            });
            
            toast.success(tr("Manifesto PDF Downloaded"), { id: tid });
        } catch (e) {
            console.error('Manifesto Export Error:', e);
            toast.error(tr("Failed to generate PDF"), { id: tid });
            setIsExportProgressOpen(false);
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
            try {
                localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            } catch (storageError) {
                console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
            }
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
                const toastId = toast.loading(tr("Recording Print Event..."));
                try {
                    if (isDummyMode) {
                        await new Promise(r => setTimeout(r, 1000));
                        toast.success(tr("Print job simulated (Demo Mode)"), { id: toastId, icon: '🧪' });
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
                    toast.success(tr("Print dates recorded to database"), { id: toastId });
                } catch (e: any) {
                    console.error('Failed to update print dates:', e);
                    toast.error(tr("Failed to save print tracking data"), { id: toastId });
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
        try {
            localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            window.open('https://jouhayerk-cloud.github.io/phomemo-designer/index.html', '_blank');
        } catch(storageError) {
            toast.error(tr("Batch is too large for Fullscreen Mode. Please use the Print Wizard internal view instead."));
        }
    };

    // Listen for triggers from Top Bar
    useEffect(() => {
        if (isPrintWizardOpen) {
            if (selectedIds.size > 0) {
                handlePrintLabels();
            } else {
                toast.error(tr("Please select items to print"));
                setIsPrintWizardOpen(false);
            }
        }
    }, [isPrintWizardOpen]);

    // Open NFC Wizard effect
    useEffect(() => {
        if (isNFCWizardOpen && selectedItems.length === 0) {
            toast.error(tr("Select items first to write NFC tags"));
            setIsNFCWizardOpen(false);
        }
    }, [isNFCWizardOpen, selectedItems, setIsNFCWizardOpen]);

    useEffect(() => {
        if (exportPDFTrigger > 0) {
            if (selectedIds.size > 0) setIsExportProgressOpen(true);
            else toast.error(tr("Select items to export PDF"));
            setExportPDFTrigger(0);
        }
    }, [exportPDFTrigger]);

    useEffect(() => {
        if (exportXLSXTrigger > 0) {
            if (selectedIds.size > 0) handleExportXLSX();
            else toast.error(tr("Please select items to export"));
            setExportXLSXTrigger(0);
        }
    }, [exportXLSXTrigger]);

    useEffect(() => {
        if (exportJSONTrigger > 0) {
            if (selectedIds.size > 0) handleExportJSON();
            else toast.error(tr("Please select items to export"));
            setExportJSONTrigger(0);
        }
    }, [exportJSONTrigger]);

    return (
        <div className="flex-1 flex flex-col relative bg-transparent">
            
            {/* ── UNIFIED EXPORT WIZARD ── */}
            <ExportWizard 
                isOpen={isExportProgressOpen}
                onClose={() => { setIsExportProgressOpen(false); setExportProgress(0); }}
                onStart={handleStartExport}
                progress={exportProgress}
                status={exportStatus}
                moduleName="Packing"
                showBruteWeight={true}
            />


            {/* INDUSTRIAL CONFIG DRAWER - Redesigned as Sticky Glassmorphic Toolbars */}
            <div className={`sticky top-24 sm:top-28 z-[90] overflow-hidden transition-all duration-700 bg-black/40 backdrop-blur-3xl border-b border-white/10 ${isConfigExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <div className="flex flex-col">
                    
                    {/* Toolbar 1: Bulk Selection + Sort Parameters */}
                    <div className="flex items-center gap-10 px-8 py-5 border-b border-white/5 overflow-x-auto no-scrollbar">
                        
                        {/* Bulk Selection */}
                        <div className="flex items-center gap-4 shrink-0">
                            <button
                                onClick={selectAll}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-3 w-fit ${
                                    selectedIds.size === processedItems.length 
                                        ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' 
                                        : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {selectedIds.size === processedItems.length ? <CheckSquare size={14} /> : <Square size={14} />}
                                {selectedIds.size === processedItems.length ? tr("Deselect All") : tr("Select All")}
                            </button>
                        </div>

                        <div className="w-px h-8 bg-white/10 shrink-0" />

                        {/* Sort Parameters */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex items-center gap-2">
                                {['Date', 'Status', 'Vendor', '#'].map((key) => {
                                    const isActive = sortKey === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                if (isActive) {
                                                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortKey(key as any);
                                                }
                                            }}
                                            className={`px-6 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                                                isActive 
                                                    ? 'bg-(--main-color) text-black border-transparent shadow-[0_0_20px_rgba(var(--main-rgb),0.3)]' 
                                                    : 'bg-white/5 text-white/20 border-white/5 hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {key}
                                            {isActive && (
                                                <div className="flex flex-col -space-y-1">
                                                    <ChevronRight size={8} className={`-rotate-90 ${sortOrder === 'asc' ? 'text-black' : 'text-black/40'}`} />
                                                    <ChevronRight size={8} className={`rotate-90 ${sortOrder === 'desc' ? 'text-black' : 'text-black/40'}`} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Toolbar 2: Source Vendor Identity (Horizontally Scrollable) */}
                    <div className="flex items-center gap-8 px-8 py-5 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setVendorFilter(null)}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
                                    !vendorFilter ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                }`}
                            >{tr("ALL VENDORS")}</button>
                            {availableVendors.map(v => {
                                const vColor = vendors[v as keyof typeof vendors]?.color || 'white';
                                const isActive = vendorFilter === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => setVendorFilter(v)}
                                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-3 ${
                                            isActive 
                                                ? 'bg-white text-black border-white shadow-xl' 
                                                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        <div 
                                            className="w-2.5 h-2.5 rounded-full" 
                                            style={{ backgroundColor: vColor, boxShadow: isActive ? `0 0 10px ${vColor}` : 'none' }} 
                                        />
                                        {v}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MAIN SPLIT LAYOUT ── */}
            <div className="flex-1 flex min-h-0">

                {/* LEFT: Item grid / list */}
                <div className={`flex-1 px-8 pt-0 pb-32 transition-all duration-500`}>
                    {processedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5 text-white/10">
                            <div className="w-24 h-24 rounded-full border border-dashed border-white/8 flex items-center justify-center">
                                <Package size={36} strokeWidth={1} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] italic">{tr("No Artifacts Found")}</span>
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
                                <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mb-0.5">{tr("OnyxLabels Engine")}</p>
                                <p className="text-xs font-black text-white uppercase tracking-widest leading-none">
                                    {tr("Batch Preview")}
                                    <span className="text-(--main-color) ml-1.5">— {selectedIds.size} {tr("Labels")}</span>
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
                                <Edit size={13} /> {tr("Edit Labels")}
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
                                title={tr("Back to Preview Grid")}
                            >
                                <Eye size={13} /> {tr("Preview")}
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
                            src={`phomemo-designer/index.html?mini=true&v=${selectedIds.size}`}
                            className="w-full h-full border-none"
                            title={tr("OnyxLabels Designer")}
                            allow="bluetooth"
                            onLoad={handleIframeLoad}
                        />
                    </div>

                </div>
            )}


            {/* ── MINIMAL FIXED BOTTOM ACTION BAR ── */}
            {selectedIds.size > 0 && (
                <div className="sticky bottom-0 left-0 right-0 z-[100] animate-in slide-in-from-bottom duration-500 mt-auto pointer-events-none">
                    <div className="bg-white/[0.02] backdrop-blur-3xl border-t border-white/5 px-8 py-3 flex items-center justify-around shadow-2xl relative overflow-hidden pointer-events-auto">
                        <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent opacity-20 pointer-events-none" />
                        
                        <button 
                            onClick={() => setIsPrintablesWizardOpen(true)}
                            className="relative z-10 flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all active:scale-90 hover:scale-110 shadow-lg cursor-pointer"
                            style={{ background: 'var(--secondary-color)', color: 'black' }}
                            title={tr("Print Labels")}
                        >
                            <Printer size={28} strokeWidth={2} />
                        </button>

                        <div className="w-px h-8 bg-white/5 relative z-10" />

                        <button 
                            onClick={() => setIsNFCWizardOpen(true)}
                            className="relative z-10 flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all active:scale-95 hover:scale-110 shadow-xl cursor-pointer"
                            style={{ background: 'var(--main-color)', color: 'black' }}
                            title={tr("NFC Wizard")}
                        >
                            <Nfc size={30} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
            `}</style>



            <PrintablesWizard
                items={selectedItems}
                isOpen={isPrintablesWizardOpen}
                onClose={() => setIsPrintablesWizardOpen(false)}
                workbookPrefix={workbookPrefix}
                progress={printablesProgress}
                setProgress={setPrintablesProgress}
                urls={printablesUrls}
                setUrls={setPrintablesUrls}
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
            className={`group relative flex flex-col rounded-3xl overflow-hidden cursor-pointer border transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${isSelected ? 'bg-(--main-color)/10 border-(--main-color)/40 shadow-2xl shadow-(--main-color)/20 scale-[1.02]' : 'bg-white/[0.03] border-white/10 hover:border-(--main-color)/40 backdrop-blur-xl'}`}
        >
            {/* Image Section */}
            <div className="aspect-[5/4] relative overflow-hidden bg-black/40">
                {item.imageUrl ? (
                    <>
                        <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                        {isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"><Video className="w-10 h-10 text-white drop-shadow-lg" /></div>}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <OnyxMiniLogo className="w-16 h-16 opacity-5" />
                    </div>
                )}
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
                
                {/* Selection Indicator */}
                <div className="absolute top-3 right-3 z-20">
                    <div className={`w-8 h-8 rounded-2xl border flex items-center justify-center transition-all duration-500 ${isSelected ? 'bg-(--main-color) border-(--main-color) shadow-[0_0_20px_rgba(var(--main-rgb),0.4)] rotate-0' : 'bg-black/40 border-white/20 opacity-0 group-hover:opacity-100 backdrop-blur-xl rotate-12'}`}>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-black" strokeWidth={3.5} />}
                    </div>
                </div>

                {/* Price Tag Floating */}
                <div className="absolute bottom-3 left-3 z-20">
                    <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl">
                         <span className="text-sm font-black text-white leading-none">${Math.ceil(Number(d.price || 0)).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Header: Title & Tag */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="font-black text-sm text-white leading-tight tracking-tight flex-1">
                            {d.shape || tr("OBJ")}
                            <span className="block text-[9px] font-bold text-(--text-color)/40 uppercase tracking-[0.2em] mt-0.5">{d.shortDescription || tr("Artifact")}</span>
                        </h3>
                        {item.codes.bookBarcode && (
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const wbStr = String(d.workbook || '').replace(/v/gi, '');
                                    const fullText = `${item.codes.bookBarcode}|${(d.color || '')} ${(d.material || '')}`.trim() + `|${(d.shape || '')} ${(d.shortDescription || d.description || '')}`.trim() + `|${item.codes.bookAqCode || ''}${wbStr}${item.codes.bookRetail || ''}`;
                                    navigator.clipboard.writeText(fullText); 
                                    toast.success(tr("Full Metadata Copied"), { icon: '📋' }); 
                                }}
                                className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shadow-lg hover:scale-110 active:scale-90 transition-all border border-black/10" 
                                style={{ 
                                    backgroundColor: vendorColor,
                                    color: getContrastColorHex(vendorColor)
                                }}
                            >
                                {item.codes.bookBarcodeDisplay}
                            </button>
                        )}
                    </div>
                    
                    {/* Material & Color - High Contrast */}
                    <div className="flex flex-wrap items-center gap-2">
                        {d.material && (
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[9px] font-black text-white/60 uppercase tracking-widest">{d.material}</span>
                        )}
                        {d.color && (
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[9px] font-black text-white/40 uppercase tracking-widest">{d.color}</span>
                        )}
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4 border-t border-white/5">
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Dimensions")}</span>
                        <span className="text-xs font-mono font-bold text-white/80">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Weight")}</span>
                        <span className="text-xs font-mono font-bold text-(--main-color)/80">{d.weightKg ? `${d.weightKg}kg` : '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Acquisition")}</span>
                        <span className="text-xs font-mono font-black text-white/60">{item.codes.bookAqCode || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Landed")}</span>
                        <span className="text-xs font-mono font-black text-yellow-500/80">{item.codes.bookLandCode || '—'}</span>
                    </div>
                </div>

                {/* Footer Quantity */}
                <div className="mt-auto pt-3 flex items-center justify-between border-t border-white/5">
                     <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{tr("Stock Level")}</span>
                     <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[11px] font-black font-mono text-white/60 tracking-tighter">{tr("QTY")}</span>
                        <span className="text-[13px] font-black font-mono text-(--main-color)">{d.quantity || 1}</span>
                     </div>
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
                className={`flex flex-row items-center h-14 sm:h-12 overflow-hidden border rounded-2xl transition-all group shadow-sm ${
                    isSelected
                        ? 'bg-(--main-color)/8 border-(--main-color)/30 ring-1 ring-(--main-color)/20'
                        : 'bg-white/3 border-white/6 hover:border-white/12 hover:bg-white/5'
                }`}
            >
                {/* Select checkbox */}
                <div
                    onClick={onToggle}
                    className="w-12 h-full shrink-0 flex items-center justify-center border-r border-white/5 cursor-pointer"
                >
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all border ${
                        isSelected
                            ? 'bg-(--main-color) border-(--main-color) shadow-md shadow-(--main-color)/30'
                            : 'border-white/15 group-hover:border-white/30 bg-white/2'
                    }`}>
                        {isSelected && <CheckCircle2 size={10} className="text-black" strokeWidth={3.5} />}
                    </div>
                </div>

                {/* Image thumb */}
                <div onClick={onToggle} className="w-16 h-full shrink-0 bg-black/40 relative cursor-pointer group-hover:scale-105 transition-transform duration-500 overflow-hidden">
                    {item.imageUrl ? (
                        <>
                            <img src={item.imageUrl} className="w-full h-full object-cover" />
                            {isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video className="w-4 h-4" /></div>}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20">
                            <OnyxMiniLogo className="w-8 h-8 object-contain" />
                        </div>
                    )}
                </div>

                {/* Scrollable data columns */}
                <div onClick={onToggle} className="flex-1 overflow-x-auto no-scrollbar flex items-center h-full px-4 gap-4 min-w-0 cursor-pointer">
                    {/* Name cluster */}
                    <div className="flex flex-col justify-center min-w-[140px] max-w-[240px] shrink-0 border-r border-white/5 pr-4 h-full">
                        <h3 className="text-[12px] font-black text-white truncate leading-none mb-1">
                            {(d.shape || '') + ' ' + (d.shortDescription || d.description || '')}
                        </h3>
                        <div className="flex items-center gap-2 text-[9px] text-(--text-color)/40 font-black uppercase tracking-widest leading-none">
                            {d.color && <span className="truncate">{d.color}</span>}
                            {d.material && <><span className="text-white/10">•</span><span className="truncate">{d.material}</span></>}
                        </div>
                    </div>

                    {/* Tag ID Cluster */}
                    <div className="flex flex-col min-w-[110px] shrink-0 border-r border-white/5 pr-6 justify-center h-full gap-1 group/tag">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Tag ID")}</span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const wbStr = String(d.workbook || '').replace(/v/gi, '');
                                    const fullText = `${item.codes.bookBarcode}|${(d.color || '')} ${(d.material || '')}`.trim() + `|${(d.shape || '')} ${(d.shortDescription || d.description || '')}`.trim() + `|${item.codes.bookAqCode || ''}${wbStr}${item.codes.bookRetail || ''}`;
                                    navigator.clipboard.writeText(fullText); 
                                    toast.success(tr("Full Metadata Copied"), { icon: '📋' }); 
                                }}
                                className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-black uppercase shadow-lg w-fit hover:scale-105 active:scale-95 transition-all border border-black/10"
                                style={{ 
                                    backgroundColor: vendorColor,
                                    color: getContrastColorHex(vendorColor)
                                }}
                            >
                                {item.codes.bookBarcodeDisplay || 'N/A'}
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(`https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${item.codes.bookBarcode}`);
                                    toast.success(tr("Trace Link Copied"));
                                }}
                                className="p-1.5 text-white/10 hover:text-(--main-color) transition-all opacity-0 group-hover/tag:opacity-100"
                                title={tr("Copy Trace Link")}
                            >
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Price / Qty */}
                    <div className="flex flex-col min-w-[85px] shrink-0 border-r border-white/5 pr-6 justify-center h-full gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Value / Qty")}</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[14px] font-black text-white leading-none">${itemPriceMXN.toLocaleString()}</span>
                            <span className="text-[11px] text-white/40 font-mono font-bold">×{itemQuantity}</span>
                        </div>
                    </div>

                    {/* AQ / LD */}
                    <div className="flex flex-col min-w-[70px] shrink-0 border-r border-white/5 pr-6 justify-center h-full gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Codes")}</span>
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] text-white/80 font-mono font-black">{item.codes.bookAqCode || '—'}</span>
                            <span className="text-[12px] text-yellow-500 font-mono font-black">{item.codes.bookLandCode || '—'}</span>
                        </div>
                    </div>

                    {/* Dims / Wt */}
                    <div className="flex flex-col min-w-[120px] shrink-0 justify-center h-full gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none">{tr("Specs")}</span>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] text-white/60 font-mono font-bold whitespace-nowrap">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                            {weightKg && <span className="text-[11px] text-(--main-color)/80 font-mono font-bold whitespace-nowrap">{weightKg}kg</span>}
                        </div>
                    </div>
                </div>

                {/* Expand button */}
                <div className="flex items-center h-full px-3 shrink-0 bg-white/[0.01] border-l border-white/5">
                    <button
                        onClick={e => { e.stopPropagation(); onToggleExpand(); }}
                        className={`w-10 h-10 flex items-center justify-center hover:text-white hover:bg-white/8 rounded-xl transition-all ${isExpanded ? 'text-(--main-color) bg-(--main-color)/5 shadow-inner' : 'text-white/15'}`}
                    >
                        <Maximize2 className={`w-4 h-4 stroke-[2.5] transition-transform duration-500 ${isExpanded ? 'rotate-180 scale-110' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Expanded Detail Panel */}
            {isExpanded && (
                <div className="ml-4 sm:ml-[94px] mr-1 px-4 pb-4 pt-3 bg-black/40 border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                        <div className="sm:hidden flex flex-col gap-1 col-span-2 pb-2 border-b border-white/5 mb-2">
                             <span className="text-[7px] font-black text-white/25 uppercase tracking-widest">{tr("Price / Qty")}</span>
                             <div className="flex items-baseline gap-2">
                                <span className="text-[14px] font-black text-(--main-color)">${itemPriceMXN}</span>
                                <span className="text-[11px] text-white/40 font-mono">×{itemQuantity}</span>
                             </div>
                        </div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Material")}</p><p className="text-[11px] font-black text-(--text-color)/80 uppercase tracking-wide">{d.material || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Dimensions")}</p><p className="text-[11px] font-mono font-black text-white/70">{dimsCm ? `${dimsCm}cm` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Weight")}</p><p className="text-[11px] font-mono font-black text-white/70">{weightKg ? `${weightKg}kg` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Quantity")}</p><p className="text-[11px] font-mono font-black text-white/70">{d.quantity || 1}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Status")}</p><p className="text-[11px] font-black text-white/70 uppercase tracking-wide">{d.status || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{tr("Book Retail")}</p><p className="text-[12px] font-mono font-black text-emerald-400">${item.codes.bookRetail || '—'}</p></div>
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
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                const wbStr = String(d.workbook || '').replace(/v/gi, '');
                                                const fullText = `${item.codes.bookBarcode}|${(d.color || '')} ${(d.material || '')}`.trim() + `|${(d.shape || '')} ${(d.shortDescription || d.description || '')}`.trim() + `|${item.codes.bookAqCode || ''}${wbStr}${item.codes.bookRetail || ''}`;
                                                navigator.clipboard.writeText(fullText); 
                                                toast.success(tr("Full Metadata Copied"), { icon: '📋' }); 
                                            }}
                                            className="px-2 py-1 rounded-none text-[9px] font-black uppercase tracking-widest shadow-sm border border-black/10 hover:scale-105 active:scale-95 transition-all" 
                                            style={{ 
                                                backgroundColor: vendorColor,
                                                color: getContrastColorHex(vendorColor)
                                            }}
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
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.3em]">{tr("Logistics Trace")}</div>
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
