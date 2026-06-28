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
    X, Printer, Nfc, FileSpreadsheet, FileText, Download, Sheet, ListChecks, 
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
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                >
                    <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                </button>

                {/* Left Panel: Primary Artifact Visual */}
                <div className="w-full lg:w-[50%] h-[40vh] md:h-[50vh] lg:h-full flex items-center justify-center p-4 md:p-12 lg:p-16 relative group overflow-hidden bg-black/20 lg:bg-transparent">
                    {mediaUrls.length > 1 ? (
                        <div className={`grid gap-2 md:gap-4 w-full h-full max-h-[85%] ${mediaUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                            {mediaUrls.slice(0, 4).map((url, i) => (
                                <div key={i} className="relative overflow-hidden rounded-sm bg-white/[0.02] border border-white/5 shadow-2xl transition-all duration-700 hover:scale-[1.02]">
                                    <img 
                                        src={getCleanImageUrl(url)} 
                                        className="w-full h-full object-contain" 
                                        alt={`View ${i + 1}`}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <img 
                            src={getCleanImageUrl(mediaUrls[0])} 
                            className="max-w-[90%] max-h-[90%] object-contain drop-shadow-[0_0_100px_rgba(255,255,255,0.05)] transition-all duration-1000 group-hover:scale-105" 
                        />
                    )}
                    <div className="absolute bottom-4 right-6 md:bottom-6 md:right-8 opacity-40 pointer-events-none flex items-center gap-3">
                        <Layers size={12} className="text-white" />
                        <span className="text-lg md:text-xl font-black text-white tracking-tighter tabular-nums">{currentIndex + 1} / {selectedItems.length}</span>
                    </div>
                </div>

                {/* Right Panel: Adaptive Tactical HUB */}
                <div className="w-full lg:w-[50%] min-h-[60vh] lg:h-full flex flex-col p-6 md:p-10 lg:p-12 pt-12 md:pt-24 pb-32 md:pb-10 lg:pb-12 bg-black/40 backdrop-blur-3xl lg:border-l border-white/5 relative">
                    
                    {/* Top Protocol Header - Studio Style */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-6 md:gap-8 mb-12 md:mb-16">
                        <div className="flex flex-col gap-5 flex-1 w-full">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                                    <Terminal size={20} strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-2xl font-black text-white tracking-[0.3em] uppercase leading-none">NFC</h2>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.8em] mt-2">SYSTEM_NFC_PROTOCOL</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-full">
                                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-none break-all" style={{ color: vendorColor }}>
                                    {currentItem?.codes.bookBarcode}
                                </h1>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {[
                                        { label: 'LND', value: currentItem?.codes.bookLandCode },
                                        { label: 'ACQ', value: currentItem?.codes.bookAqCode },
                                        { label: 'BOOK', value: cleanBookV }
                                    ].map((t, i) => (
                                        <div key={i} className="flex items-center gap-2 md:gap-3 bg-white/[0.04] px-2 md:px-3 py-1.5 md:py-2 rounded-sm border border-white/10">
                                            <span className="text-[7px] md:text-[9px] font-black text-white/40 uppercase tracking-widest">{t.label}</span>
                                            <span className="text-[12px] md:text-[18px] font-black text-white uppercase tracking-tighter">{t.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white p-0.5 rounded-sm shadow-2xl w-[60%] md:w-[35%] h-6 md:h-7 flex items-center justify-center overflow-hidden border-b border-black/10 transition-all hover:scale-[1.01]">
                                    <img src={barcodeUrl} className="w-full h-full object-fill mix-blend-multiply" alt="Barcode" />
                                </div>
                            </div>
                        </div>

                        {/* QR Protocol - Adaptive Size */}
                        <div className="flex flex-col items-center gap-10 shrink-0 mt-2 sm:mt-12 lg:mt-16 self-end sm:self-start">
                            <div className="relative group/qr">
                                <div className="bg-white p-2 rounded-sm shadow-2xl w-24 h-24 md:w-32 md:h-32 flex items-center justify-center overflow-hidden transition-all group-hover/qr:scale-105 border-4 border-white relative">
                                    <img src={qrUrl} className="max-w-full max-h-full object-contain" alt="QR" />
                                    {isVerified && (
                                        <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-500">
                                            <ShieldCheck size={48} className="text-emerald-500 drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                                        </div>
                                    )}
                                </div>
                                
                                {/* Verify Button Overlay */}
                                <button 
                                    onClick={() => setIsQRScannerOpen(true)}
                                    className={`absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full border backdrop-blur-xl transition-all flex items-center gap-2 shadow-2xl whitespace-nowrap group-hover/qr:scale-110 ${
                                        isVerified 
                                            ? 'bg-emerald-500 border-emerald-400 text-black font-black' 
                                            : 'bg-black/60 border-white/20 text-white/60 hover:text-white hover:border-white/40'
                                    }`}
                                >
                                    {isVerified ? (
                                        <><ShieldCheck size={14} /> <span className="text-[10px] uppercase tracking-widest">Verified</span></>
                                    ) : (
                                        <><QrCode size={14} /> <span className="text-[10px] uppercase tracking-widest">Verify QR</span></>
                                    )}
                                </button>
                            </div>

                            <button 
                                onClick={handleWrite}
                                disabled={isWriting}
                                className={`w-24 h-24 md:w-32 md:h-32 rounded-2xl flex flex-col items-center justify-center gap-1 group transition-all relative overflow-hidden backdrop-blur-3xl border border-white/10 ${
                                    status === 'success' ? 'bg-green-500 shadow-[0_0_100px_rgba(34,197,94,0.3)]' : 'bg-(--main-color)/10 hover:bg-(--main-color)/20 shadow-inner'
                                }`}
                            >
                                {!isSupported && status !== 'success' && status !== 'writing' ? (
                                    <>
                                        <ZapOff size={20} className="md:w-[24px] md:h-[24px] text-white/20" />
                                        <span className="text-[6px] md:text-[8px] font-black text-white/40 uppercase tracking-[0.2em] leading-none">NO_HW</span>
                                    </>
                                ) : status === 'success' ? (
                                    <><CheckCircle size={28} className="md:w-[32px] md:h-[32px] text-black" /><span className="text-[9px] font-black text-black uppercase tracking-[0.2em]">LOCKED</span></>
                                ) : (
                                    <>
                                        <Nfc size={28} className={`md:w-[36px] md:h-[36px] transition-all duration-700 ${isWriting ? 'animate-pulse scale-110 text-white' : 'text-(--main-color) group-hover:scale-110'}`} />
                                        <span className={`text-[6px] md:text-[8px] font-black uppercase tracking-[0.3em] mt-2 ${isWriting ? 'text-white' : 'text-(--main-color) opacity-60'}`}>
                                            {isWriting ? 'ENCODING' : 'WRITE'}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Specification Matrix */}
                    <div className="grid grid-cols-2 gap-y-6 md:gap-y-8 gap-x-8 md:gap-x-12 mb-8 md:mb-10 border-t border-white/5 pt-8 md:pt-10">
                        <div className="flex flex-col">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">CORE_SPEC</span>
                            <div className="flex flex-col">
                                <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.color || 'CLR_NULL'}</span>
                                <span className="text-[10px] md:text-base font-bold text-white/40 uppercase tracking-widest leading-none mt-0.5">{currentItem?.normData.material || 'MAT_NULL'}</span>
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">DESCRIPTOR</span>
                            <div className="flex flex-col">
                                <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.shape || 'SHAPE_NULL'}</span>
                                <span className="text-[10px] md:text-base font-medium text-white/30 uppercase tracking-tight truncate">{currentItem?.normData.shortDescription || '---'}</span>
                            </div>
                        </div>

                        <div className="flex flex-col col-span-2 group">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">GEOMETRY_PROTO</span>
                            <div className="flex items-center justify-between">
                                <div className="flex items-baseline gap-2 md:gap-5">
                                    <span className="text-2xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none group-hover:text-(--main-color) transition-colors">{currentItem?.normData.dims || '0×0×0'}</span>
                                    <span className="text-sm md:text-2xl font-black text-(--main-color) uppercase tracking-tighter opacity-30">CM</span>
                                </div>
                                <div className="flex flex-col items-end border-l border-white/10 pl-4 md:pl-6">
                                    <span className="text-[7px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">WEIGHT</span>
                                    <span className="text-xl md:text-4xl font-black text-white tabular-nums tracking-tighter">{currentItem?.normData.weightKg || 0}KG</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Zone */}
                    <div className="mt-auto pt-8 flex flex-col sm:flex-row items-center gap-4 lg:gap-6 pb-6 lg:pb-0">
                        <div className="flex gap-2 w-full">
                            <button onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} disabled={currentIndex === 0} className="flex-1 sm:h-20 h-14 flex items-center justify-center bg-white/[0.03] hover:bg-white/10 transition-all disabled:opacity-0 border border-white/5 rounded-sm">
                                <ChevronLeft size={24} className="text-white/20" />
                            </button>
                            <button onClick={() => setCurrentIndex(p => Math.min(selectedItems.length - 1, p + 1))} disabled={currentIndex === selectedItems.length - 1} className="flex-1 sm:h-20 h-14 flex items-center justify-center bg-white/[0.03] hover:bg-white/10 transition-all disabled:opacity-0 border border-white/5 rounded-sm">
                                <ChevronRight size={24} className="text-white/20" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* QR Verification Overlay */}
            {isQRScannerOpen && (
                <ScannerCenter 
                    initialMode="qr"
                    onVerify={(id) => {
                        return id === currentItem?.codes.bookBarcode;
                    }}
                    onComplete={(ids) => {
                        setVerifiedTags(prev => new Set([...prev, ...ids]));
                        setTimeout(() => setIsQRScannerOpen(false), 800);
                    }}
                    onClose={() => setIsQRScannerOpen(false)}
                    title="Verify Artifact"
                    subtitle={`Authenticating ${currentItem?.codes.bookBarcode}`}
                />
            )}
        </div>
    );
};

/* ─── Printables Engine HUB Sub-component (LARGE Mode) ─── */
export const LabelWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const theme = useAtomValue(themeAtom);

    const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);
    const [includeImages, setIncludeImages] = useState(true);
    const [catalogMethod, setCatalogMethod] = useState<'grid' | 'single'>('grid');
    const [progress, setProgress] = useState({ xlsx: -1, pdf: -1, catalog: -1, printer: -1 });
    const [urls, setUrls] = useState({ xlsx: '', pdf: '', catalog: '' });

    const [isPrintWorkflowOpen, setIsPrintWorkflowOpen] = useState(false);
    const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const pendingBatchRef = React.useRef<any>(null);

    const handlePreviewClick = (row: string) => {
        setActivePreviewId(row);
        
        let currentIndex = 0;
        for (const item of selectedItems) {
            if (String(item.row) === row) {
                break;
            }
            currentIndex += quantities[String(item.row)] ?? (Number(item.normData.quantity) || 1);
        }
        
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'SET_PREVIEW_RECORD', payload: { index: currentIndex } },
            '*'
        );
    };

    

    const handleLaunchIframe = async (indices: Set<number>, instances: any[]) => {
        if (indices.size > 0 && iframeRef.current?.contentWindow) {
            const filteredInstances = instances.filter(inst => indices.has(inst.globalIndex));
            const records = await Promise.all(filteredInstances.map(async inst => {
                const item = inst.item;
                const d = item.normData || {};
                const c = item.codes || {};
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                
                const wCm = parseFloat(d.widthCm) || 10;
                const hCm = parseFloat(d.heightCm) || 10;
                const dCm = parseFloat(d.lengthCm) || wCm;
                
                const axoBase64 = await generateAxonometricDataUrl(
                    wCm, hCm, dCm,
                    d.shape || '', d.itemType || d.type || d.shortDescription || d.description || '',
                    '#111111'
                );

                return {
                    "TAG ID": c.bookBarcode || '',
                    "DESCRIPTION": `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece',
                    "COLOR MATERIAL": `${d.color || ''} ${d.material || 'Onyx'}`.trim(),
                    "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM${d.weightKg ? '  WT ' + d.weightKg + ' KG' : ''}`,
                    "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
                    "QUANTITY": 1,
                    "LANDED CODE": c.bookLandCode || '',
                    "ACQ CODE": c.bookAqCode || '',
                    "QR DATA": c.bookBarcode || '',
                    "AXO_IMAGE": axoBase64
                };
            }));
            iframeRef.current.contentWindow.postMessage(
                { type: 'UPDATE_DATA', payload: { templateData: records } },
                '*'
            );
        }
    };

    const ONYX_MASTER_TEMPLATE_V4 = (width: number, height: number) => ({
        name: "OnyxLabels_V4",
        version: 4,
        isTemplate: true,
        labelSize: { width, height },
        templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "COLOR MATERIAL", "QR DATA", "AXO_IMAGE"],
        elements: [
            {
                id: "el_side",
                type: "text",
                zone: 0,
                x: -95, y: 107.2, width: 220, height: 23.6,
                rotation: 90,
                text: "MADE IN MEXICO",
                fontSize: 15,
                fontFamily: "Inter, sans-serif",
                align: "justify",
                fontWeight: "bold"
            },
            {
                id: "el_retail",
                type: "text",
                zone: 0,
                x: 78.7, y: 0, width: 215, height: 28.6,
                rotation: 0,
                align: "center",
                text: "{{BOOK RETAIL}}",
                fontSize: 15,
                fontFamily: "Inter, sans-serif",
                fontWeight: "bold",
                autoScale: true,
                noWrap: true
            },
            {
                id: "el_desc",
                type: "text",
                zone: 0,
                x: 78.7, y: 22, width: 220, height: 36,
                rotation: 0,
                align: "center",
                text: "{{DESCRIPTION}}",
                fontSize: 23,
                fontFamily: "Inter, sans-serif",
                fontWeight: "bold",
                autoScale: true,
                noWrap: true
            },
            {
                id: "el_mat",
                type: "text",
                zone: 0,
                x: 75.6, y: 49.8, width: 220, height: 35.1,
                rotation: 0,
                align: "center",
                text: "{{COLOR MATERIAL}}",
                fontSize: 23,
                fontFamily: "Inter, sans-serif",
                autoScale: true,
                noWrap: true
            },
            {
                id: "el_sizes",
                type: "text",
                zone: 0,
                x: 77, y: 79.6, width: 218.6, height: 25.3,
                rotation: 0,
                align: "center",
                text: "{{SIZES}}",
                fontSize: 15,
                fontFamily: "Inter, sans-serif",
                fontWeight: "bold",
                autoScale: true,
                noWrap: true
            },
            {
                id: "el_axo",
                type: "image",
                zone: 0,
                x: 24, y: 12, width: 73, height: 73,
                rotation: 0,
                imageData: "{{AXO_IMAGE}}"
            },
            {
                id: "el_qr",
                type: "qr",
                zone: 0,
                x: 291.2, y: 5, width: 95, height: 95,
                rotation: 0,
                qrData: "{{QR DATA}}"
            },
            {
                id: "el_barcode",
                type: "barcode",
                zone: 0,
                x: 24.4, y: 101.6, width: 361.9, height: 138.4,
                rotation: 0,
                barcodeData: "{{TAG ID}}",
                barcodeFormat: "CODE128",
                format: "CODE128",
                textFontSize: 15,
                textBold: true,
                showText: true
            }
        ]
    });

    const buildBatchJSONAsync = async (items: any[], workbookPrefix: string, activeLabelSize: string = '50x30') => {
        const [wStr, hStr] = activeLabelSize.split('x');
        const width = parseInt(wStr) || 50;
        const height = parseInt(hStr) || 30;

        const baseRecords = await Promise.all(items.map(async item => {
            const d = item.normData;
            const c = item.codes;
            const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
            const retailStr = String(c.bookRetail || '0').padStart(4, '0');
            
            const wCm = parseFloat(d.widthCm) || 10;
            const hCm = parseFloat(d.heightCm) || 10;
            const dCm = parseFloat(d.lengthCm) || wCm;

            const axoBase64 = await generateAxonometricDataUrl(
                wCm, hCm, dCm,
                d.shape || '', d.itemType || d.type || d.shortDescription || d.description || '',
                '#111111'
            );

            return {
                "TAG ID": c.bookBarcode || '',
                "DESCRIPTION": `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece',
                "COLOR MATERIAL": `${d.color || ''} ${d.material || 'Onyx'}`.trim(),
                "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM${d.weightKg ? '  WT ' + d.weightKg + ' KG' : ''}`,
                "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
                "QUANTITY": quantities[String(item.row)] ?? (d.quantity || 1),
                "LANDED CODE": c.bookLandCode,
                "ACQ CODE": c.bookAqCode,
                "QR DATA": c.bookBarcode || '',
                "AXO_IMAGE": axoBase64
            };
        }));

        const templateData = baseRecords.flatMap(r =>
            Array.from({ length: (Number(r["QUANTITY"]) || 1) }, () => ({ ...r }))
        );

        return {
            ...ONYX_MASTER_TEMPLATE_V4(width, height),
            name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
            exportedAt: new Date().toISOString(),
            records: templateData,
            templateData
        };
    };

    const handlePrintBluetooth = async () => {
        setProgress(p => ({ ...p, printer: 5 }));
        const tid = toast.loading('Generating dynamic 3D structures for labels...');
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix);
            try {
                localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            } catch (storageError) {
                console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
            }
            pendingBatchRef.current = batchProject;
            setProgress(p => ({ ...p, printer: 100 }));
            toast.success('Batch Prepared! Launching Print Engine', { id: tid });
            setIsPrintWorkflowOpen(true);
            setActiveSlide(1);
        } catch (e: any) {
            console.error(e);
            setProgress(p => ({ ...p, printer: -1 }));
            toast.error(`Print setup failed: ${e.message}`, { id: tid });
        }
    };

    const selectedItems = useMemo(() => {
        const items = inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            const normData = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
            return { ...item, normData, codes };
        });

        // Sort by bookBarcode (TAGID) descending
        return items.sort((a, b) => {
            const tagA = String(a.codes.bookBarcode || '');
            const tagB = String(b.codes.bookBarcode || '');
            return tagB.localeCompare(tagA, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [inventory, selectedIds, exchangeRate, workbookPrefix]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'CLOSE_WIZARD') {
                  setIsPrintWorkflowOpen(false);
              }
              if (event.data?.type === 'DESIGNER_READY') {
                  if (pendingBatchRef.current && iframeRef.current?.contentWindow) {
                      iframeRef.current.contentWindow.postMessage(
                          { type: 'LOAD_DESIGN', payload: pendingBatchRef.current },
                          '*'
                      );
                      setTimeout(() => {
                           iframeRef.current?.contentWindow?.postMessage(
                               { type: 'UPDATE_DATA', payload: { templateData: pendingBatchRef.current.templateData } },
                               '*'
                           );
                      }, 300);
                      pendingBatchRef.current = null;
                  }
              }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setProgress({ xlsx: -1, pdf: -1, catalog: -1, printer: -1 });
            setUrls({ xlsx: '', pdf: '', catalog: '' });
            setIsPrintWorkflowOpen(false);
            setActiveSlide(0);

            const initialQ: Record<string, number> = {};
            selectedItems.forEach(item => {
                initialQ[String(item.row)] = 1; // Default to 1 label per item
            });
            setQuantities(initialQ);
        }
    }, [isOpen, selectedIds.length]);

    useEffect(() => {
        if (isPrintWorkflowOpen && iframeRef.current?.contentWindow && !pendingBatchRef.current) {
            const timer = setTimeout(async () => {
                try {
                    const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix);
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'UPDATE_DATA', payload: { templateData: batchProject.templateData } },
                        '*'
                    );
                } catch (e) {
                    console.error('Failed to update quantities in iframe', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [quantities, isPrintWorkflowOpen, selectedItems, workbookPrefix]);

    const handleGenerateXLSX = async () => {
        setProgress(p => ({ ...p, xlsx: 10 }));
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
                const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBarcode}`;
                return [c.bookBarcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
            });

            const blob = await exportToXLSX(`Labels_${name}`, [{
                name: 'Packing List',
                data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }], {}, 'blob');
            
            if (blob instanceof Blob) {
                setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
                setProgress(p => ({ ...p, xlsx: 100 }));
                toast.success('XLSX generated');
            } else {
                throw new Error('XLSX generation failed');
            }
        } catch (error: any) {
            toast.error(`XLSX failed: ${error.message}`);
            setProgress(p => ({ ...p, xlsx: -1 }));
        }
    };

    const handleGeneratePDF = async () => {
        setProgress(p => ({ ...p, pdf: 5 }));
        try {
            const manifestoItems: ManifestoItem[] = selectedItems.map((item, idx) => {
                const d = item.normData;
                const c = item.codes;
                const vendorPrefix = String(d.itemId || c.bookBarcode || '').split('-')[0].toUpperCase();
                
                return {
                    index: idx + 1,
                    vendorPrefix,
                    qty: Number(d.quantity) || 1,
                    itemId: c.bookBarcode || '', 
                    rowId: String(item.row),
                    name: `${d.shape || ''} ${d.shortDescription || ''}`.trim() || 'Artifact',
                    material: d.material || '', 
                    color: d.color || '',
                    dims: [d.lengthCm, d.widthCm, d.heightCm].filter(Boolean).join('×'),
                    weightKg: parseFloat(d.weightKg) || 0,
                    costMxn: 0, 
                    costUsd: 0, 
                    imageUrls: includeImages ? collectAllImages(d) : [],
                    tagColor: (vendors as any)[vendorPrefix]?.color || '#333', 
                    dbItemCount: Number(d.quantity || 1)
                };
            });

            const blob = await exportCrateManifesto(manifestoItems, {
                dynamicId: name, 
                crateId: `LBL-${Date.now()}`, 
                crateDims: 'N/A',
                crateType: 'Labels Batch', 
                fillPct: 100, 
                exportedAt: new Date().toLocaleString(),
                customTitle: 'CONTROL PAGE MANIFESTO',
                excludeImages: !includeImages,
                excludeHeader: true,
                sortByTagDesc: true
            }, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob');
            
            if (blob instanceof Blob) {
                setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
                setProgress(p => ({ ...p, pdf: 100 }));
                toast.success('Control Page generated');
            } else {
                throw new Error('PDF generation failed to produce a valid file');
            }
        } catch (e) {
            console.error(e);
            setProgress(p => ({ ...p, pdf: -1 }));
            toast.error('Control Page failed');
        }
    };

    const handleGenerateCatalog = async () => {
        setProgress(p => ({ ...p, catalog: 5 }));
        try {
            const results: CatalogArtifact[] = selectedItems.map(item => ({
                data: item.data,
                codes: item.codes,
                images: collectAllImages(item.normData),
                exportType: 'catalog'
            }));

            const blob = await exportCatalogPdf(results, {
                title: name,
                method: catalogMethod,
                exportType: 'catalog'
            }, (pct) => {
                setProgress(p => ({ ...p, catalog: pct }));
            }, 'blob');

            if (blob instanceof Blob) {
                setUrls(u => ({ ...u, catalog: URL.createObjectURL(blob) }));
                setProgress(p => ({ ...p, catalog: 100 }));
                toast.success('Catalog generated');
            } else {
                throw new Error('Catalog generation failed');
            }
        } catch (e) {
            console.error(e);
            setProgress(p => ({ ...p, catalog: -1 }));
            toast.error('Catalog generation failed');
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[5000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[80px] pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-hidden pointer-events-auto p-8 md:p-12 lg:p-16 max-w-7xl mx-auto animate-in zoom-in-95 duration-700 bg-transparent">
                
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
                                </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-8 mb-20 shrink-0 max-w-4xl">
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-5xl md:text-6xl font-black text-white uppercase tracking-tighter placeholder:text-white/5 focus:text-(--main-color) transition-all"
                        placeholder="ID_NULL"
                    />
                    <div className="text-6xl md:text-7xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)] shrink-0">
                        {selectedItems.length}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
                    {/* Bluetooth Print Module */}
                    <div className="flex flex-col items-center gap-6 group">
                        <button 
                            onClick={handlePrintBluetooth} 
                            disabled={progress.printer > 0 && progress.printer < 100} 
                            className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Printer size={64} fill="currentColor" strokeWidth={1} className={`transition-all duration-500 ${progress.printer === 100 ? 'text-(--main-color) drop-shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-(--main-color)/20 group-hover:text-(--main-color)'}`} />
                            {progress.printer > 0 && progress.printer < 100 && (
                                <div className="absolute -inset-4 border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
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
                            <Sheet size={64} fill="currentColor" strokeWidth={1} className={`transition-all duration-500 ${progress.xlsx === 100 ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]' : 'text-emerald-500/20 group-hover:text-emerald-400'}`} />
                            {progress.xlsx > 0 && progress.xlsx < 100 && (
                                <div className="absolute -inset-4 border-2 border-emerald-500/20 border-t-emerald-500 animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
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
                            <ListChecks size={64} fill="currentColor" strokeWidth={1} className={`transition-all duration-500 ${progress.pdf === 100 ? 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]' : 'text-red-500/20 group-hover:text-red-400'}`} />
                            {progress.pdf > 0 && progress.pdf < 100 && (
                                <div className="absolute -inset-4 border-2 border-red-500/20 border-t-red-500 animate-spin rounded-full" />
                            )}
                        </button>
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[200px]">
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
                                <BookOpen size={64} fill="currentColor" strokeWidth={1} className={`transition-all duration-500 ${progress.catalog === 100 ? 'text-blue-400 drop-shadow-[0_0_20px_rgba(96,165,250,0.4)]' : 'text-blue-500/20 group-hover:text-blue-400'}`} />
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
                        className="flex-1 min-h-0 w-full flex flex-col transition-transform duration-700 ease-out"
                        style={{ transform: `translateY(-${activeSlide * 100}%)` }}
                    >
                        {/* ----------------------------------------------------- */}
                        {/* SLIDE 0: Print Quantities & Preview Labels Grid         */}
                        {/* ----------------------------------------------------- */}
                        <div className="w-full h-full shrink-0 flex overflow-hidden">
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
                        <div className="w-full h-full shrink-0 flex flex-col relative bg-transparent overflow-hidden">
                            <div className="flex-1 relative overflow-hidden bg-transparent">
                                <iframe
                                    ref={iframeRef}
                                    src={`phomemo-designer/index.html?v=${selectedIds.length}&theme=${theme}`}
                                    className="w-full h-full border-none bg-transparent"
                                    title="OnyxLabels Designer"
                                    allow="bluetooth"
                                    
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
