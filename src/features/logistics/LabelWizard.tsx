import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
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
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { vendors } from '../../lib/consts';
import { NFCTagCard } from '../../components/LabelVisuals';

/* ─── NFC Tags HUD Component ─── */
import { ScannerCenter } from '../../components/ScannerCenter';

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

    const mediaUrls = currentItem?.normData.mediaUrls?.split(',').filter(Boolean) || [];

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
        <div className="fixed inset-0 z-[20000] flex flex-col pointer-events-none animate-in fade-in duration-500 overflow-hidden">
            <div 
                className="absolute inset-0 backdrop-blur-xl bg-black/60 pointer-events-auto" 
                onClick={() => setIsOpen(false)} 
            />
            
            <div className="relative w-full h-full flex flex-col lg:flex-row pointer-events-auto overflow-y-auto bg-black/40 backdrop-blur-2xl">
                
                {/* Floating Close Button */}
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="fixed top-4 right-4 md:top-8 md:right-8 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/10 backdrop-blur-2xl rounded-full border border-white/20 text-white/40 hover:text-white hover:bg-white/20 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_50px_rgba(0,0,0,0.5)] group"
                >
                    <X size={28} className="md:w-[40px] md:h-[40px] group-hover:rotate-90 transition-transform duration-500" strokeWidth={1} />
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
                    
                    {/* Top Protocol Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-6 md:gap-8 mb-8 md:mb-10">
                        <div className="flex flex-col gap-3 flex-1 w-full">
                            <div className="flex items-center gap-3 mb-1 opacity-20">
                                <Terminal size={12} className="text-(--main-color)" />
                                <span className="text-[8px] md:text-[10px] font-black text-white uppercase tracking-[1em]">ENCODE_PROTOCOL</span>
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
                        <div className="flex flex-col items-center gap-4 shrink-0 mt-2 sm:mt-12 lg:mt-16 self-end sm:self-start">
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
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} disabled={currentIndex === 0} className="flex-1 sm:h-20 sm:w-16 h-14 flex items-center justify-center bg-white/[0.03] hover:bg-white/10 transition-all disabled:opacity-0 border border-white/5 rounded-sm">
                                <ChevronLeft size={24} className="text-white/20" />
                            </button>
                            <button onClick={() => setCurrentIndex(p => Math.min(selectedItems.length - 1, p + 1))} disabled={currentIndex === selectedItems.length - 1} className="flex-1 sm:h-20 sm:w-16 h-14 flex items-center justify-center bg-white/[0.03] hover:bg-white/10 transition-all disabled:opacity-0 border border-white/5 rounded-sm">
                                <ChevronRight size={24} className="text-white/20" />
                            </button>
                        </div>

                        <button 
                            onClick={handleWrite}
                            disabled={isWriting}
                            className={`w-full sm:flex-1 h-20 md:h-28 rounded-sm flex flex-col items-center justify-center gap-2 group transition-all relative overflow-hidden backdrop-blur-3xl border border-white/10 ${
                                status === 'success' ? 'bg-green-500 shadow-[0_0_100px_rgba(34,197,94,0.3)]' : 'bg-(--main-color)/10 hover:bg-(--main-color)/20 shadow-inner'
                            }`}
                        >
                            {!isSupported && status !== 'success' && status !== 'writing' ? (
                                <>
                                    <ZapOff size={32} className="md:w-[44px] md:h-[44px] text-white/20 mb-1" />
                                    <span className="text-[8px] md:text-[10px] font-black text-white/40 uppercase tracking-[1em]">NO_HARDWARE</span>
                                </>
                            ) : status === 'success' ? (
                                <><CheckCircle size={32} className="md:w-[36px] md:h-[36px] text-black" /><span className="text-[10px] font-black text-black uppercase tracking-[1em]">LOCKED</span></>
                            ) : (
                                <>
                                    <Nfc size={32} className={`md:w-[44px] md:h-[44px] transition-all duration-700 ${isWriting ? 'animate-pulse scale-110 text-white' : 'text-(--main-color) group-hover:scale-110'}`} />
                                    <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-[1.5em] mt-2 ${isWriting ? 'text-white' : 'text-(--main-color) opacity-60'}`}>
                                        {isWriting ? 'ENCODING...' : 'WRITE_TAG'}
                                    </span>
                                </>
                            )}
                        </button>
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

    const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);
    const [includeImages, setIncludeImages] = useState(true);
    const [catalogMethod, setCatalogMethod] = useState<'grid' | 'single'>('grid');
    const [progress, setProgress] = useState({ xlsx: -1, pdf: -1, catalog: -1 });
    const [urls, setUrls] = useState({ xlsx: '', pdf: '', catalog: '' });

    const selectedItems = useMemo(() => {
        return inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            const normData = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
            return { ...item, normData, codes };
        });
    }, [inventory, selectedIds, exchangeRate, workbookPrefix]);

    useEffect(() => {
        if (isOpen) {
            setProgress({ xlsx: -1, pdf: -1, catalog: -1 });
            setUrls({ xlsx: '', pdf: '', catalog: '' });
        }
    }, [isOpen, selectedIds.length]);

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
                    dims: [d.widthCm, d.heightCm, d.lengthCm].filter(Boolean).join('×'),
                    weightKg: parseFloat(d.weightKg) || 0,
                    costMxn: 0, 
                    costUsd: 0, 
                    imageUrls: includeImages ? [getCleanImageUrl(d.mediaUrls?.split(',')[0])].filter(Boolean) : [],
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
                excludeHeader: true
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
                images: item.normData.mediaUrls?.split(',').filter(Boolean) || [],
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

    return (
        <div className="fixed inset-0 z-[20000] flex flex-col pointer-events-none animate-in fade-in duration-500 overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-xl bg-black/60 pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-full flex flex-col pointer-events-auto p-8 md:p-12 lg:p-16 overflow-y-auto no-scrollbar max-w-7xl mx-auto bg-black/40 backdrop-blur-2xl border border-white/5 shadow-2xl">
                
                {/* Floating LARGE Close Button */}
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="fixed top-8 right-8 z-[20002] flex items-center justify-center w-24 h-24 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_60px_rgba(0,0,0,0.6)] group"
                >
                    <X size={48} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                </button>

                <div className="flex justify-between items-start mb-16 shrink-0">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-6">
                            <Terminal size={24} className="text-(--main-color)" />
                            <h3 className="text-2xl font-black text-white tracking-[0.5em] uppercase leading-none">PRINT_ENGINE</h3>
                        </div>
                        <span className="text-[10px] font-black text-white/10 tracking-[1em] uppercase ml-12">SYSTEM_TACTICAL_OUTPUT_HUB</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[1em] mb-2">BUFFER_COUNT</span>
                        <span className="text-6xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter">{selectedItems.length}</span>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
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
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[160px]">
                            <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.6em]">CSV_BUFFER</span>
                            <span className="text-sm font-black text-white uppercase tracking-[0.2em] group-hover:text-emerald-400 transition-colors">Export Labels</span>
                            
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
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[160px]">
                            <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.6em]">PDF_RENDER</span>
                            <span className="text-sm font-black text-white uppercase tracking-[0.2em] group-hover:text-red-400 transition-colors">Control Page</span>
                            
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
                        
                        <div className="flex flex-col items-center gap-1 w-full max-w-[160px]">
                            <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.6em]">CATALOG_ENGINE</span>
                            <span className="text-sm font-black text-white uppercase tracking-[0.2em] group-hover:text-blue-400 transition-colors">Sales Catalog</span>
                            
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
        </div>
    );
};
