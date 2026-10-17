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
    logisticsSubTabAtom,
    userAtom
} from '../../lib/atoms';
import { 
    X, Printer, Nfc, FileSpreadsheet, FileText, Download, Sheet, ListChecks, 
    CheckCircle2, ChevronRight, ChevronLeft, Zap, Info, Package,
    ShieldAlert, CheckCircle, Edit3, Check, BookOpen, Layers,
    Sparkles, ArrowRight, Activity, Terminal, ExternalLink,
    Smartphone, Cpu, Waves, QrCode, Tag, DollarSign, Barcode,
    Maximize2, Search, ZapOff, History, Eye, ShieldCheck
} from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import { RareEarthLogoBase64 } from './RareEarthLogoBase64';
import { ART_OF_DECOR_LOGO } from '../../lib/artOfDecorLogo';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, collectAllImages, collectExportImages, toTitleCase } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { exportCatalogPdf, prewarmCatalogImages, beginImageSession, endImageSession, CatalogArtifact } from '../../lib/pdfExport';
// The catalogue splits on exactly what the Shopify sheet splits on, so the
// two PDFs and the workbook's two sheets can never disagree about an item.
import { isShopifyReady } from '../../lib/aiContent';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { vendors } from '../../lib/consts';
import { generateAxonometricDataUrl } from '../../lib/axonometric';
import { NFCTagCard } from '../../components/LabelVisuals';
import { PdfPreview, PdfDocumentSource } from '../../components/PdfPreview';
import { supabase } from '../../lib/supabase';

/* ─── NFC Tags HUD Component ─── */
import { ScannerCenter } from '../../components/ScannerCenter';
import { PreviewLabels } from '../../components/PreviewLabels';
import { tr } from '../../lib/i18n';
import { trackDocumentJob, recordExport } from '../print/jobTracking';
import { LabelPrintStudio } from '../print/LabelPrintStudio';

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
                const tag = String(item.data?.itemId || '');
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
        <div className="absolute inset-0 z-[100000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div 
                className="absolute inset-0 backdrop-blur-xl bg-black/40 pointer-events-auto" 
                onClick={() => setIsOpen(false)} 
            />
            
            <div className="label-wizard nfc-wizard relative w-full h-full flex flex-col lg:flex-row pointer-events-auto overflow-y-auto bg-black/10 backdrop-blur-3xl">
                
                {/* Floating Close Button - Studio Standard */}
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="fixed top-6 right-6 md:top-10 md:right-10 z-[100002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
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
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.8em] mt-2">{tr("SYSTEM_NFC_PROTOCOL")}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-full">
                                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-none break-all" style={{ color: vendorColor }}>
                                    {currentItem?.codes.bookBarcode}
                                </h1>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {[
                                        { label: 'LND', value: currentItem?.codes.bookLandCode },
                                        { label: tr("ACQ"), value: currentItem?.codes.bookAqCode },
                                        { label: tr("BOOK"), value: cleanBookV }
                                    ].map((t, i) => (
                                        <div key={i} className="flex items-center gap-2 md:gap-3 bg-white/[0.04] px-2 md:px-3 py-1.5 md:py-2 rounded-sm border border-white/10">
                                            <span className="text-[7px] md:text-[9px] font-black text-white/40 uppercase tracking-widest">{t.label}</span>
                                            <span className="text-[12px] md:text-[18px] font-black text-white uppercase tracking-tighter">{t.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white p-0.5 rounded-sm shadow-2xl w-[60%] md:w-[35%] h-6 md:h-7 flex items-center justify-center overflow-hidden border-b border-black/10 transition-all hover:scale-[1.01]">
                                    <img src={barcodeUrl} className="w-full h-full object-fill mix-blend-multiply" alt={tr("Barcode")} />
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
                                        <><ShieldCheck size={14} /> <span className="text-[10px] uppercase tracking-widest">{tr("Verified")}</span></>
                                    ) : (
                                        <><QrCode size={14} /> <span className="text-[10px] uppercase tracking-widest">{tr("Verify QR")}</span></>
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
                                        <span className="text-[6px] md:text-[8px] font-black text-white/40 uppercase tracking-[0.2em] leading-none">{tr("NO_HW")}</span>
                                    </>
                                ) : status === 'success' ? (
                                    <><CheckCircle size={28} className="md:w-[32px] md:h-[32px] text-black" /><span className="text-[9px] font-black text-black uppercase tracking-[0.2em]">{tr("LOCKED")}</span></>
                                ) : (
                                    <>
                                        <Nfc size={28} className={`md:w-[36px] md:h-[36px] transition-all duration-700 ${isWriting ? 'animate-pulse scale-110 text-white' : 'text-(--main-color) group-hover:scale-110'}`} />
                                        <span className={`text-[6px] md:text-[8px] font-black uppercase tracking-[0.3em] mt-2 ${isWriting ? 'text-white' : 'text-(--main-color) opacity-60'}`}>
                                            {isWriting ? tr("ENCODING") : tr("WRITE")}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Specification Matrix */}
                    <div className="grid grid-cols-2 gap-y-6 md:gap-y-8 gap-x-8 md:gap-x-12 mb-8 md:mb-10 border-t border-white/5 pt-8 md:pt-10">
                        <div className="flex flex-col">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("CORE_SPEC")}</span>
                            <div className="flex flex-col">
                                <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.color || tr("CLR_NULL")}</span>
                                <span className="text-[10px] md:text-base font-bold text-white/40 uppercase tracking-widest leading-none mt-0.5">{currentItem?.normData.material || tr("MAT_NULL")}</span>
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("DESCRIPTOR")}</span>
                            <div className="flex flex-col">
                                <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.shape || tr("SHAPE_NULL")}</span>
                                <span className="text-[10px] md:text-base font-medium text-white/30 uppercase tracking-tight truncate">{currentItem?.normData.shortDescription || '---'}</span>
                            </div>
                        </div>

                        <div className="flex flex-col col-span-2 group">
                            <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("GEOMETRY_PROTO")}</span>
                            <div className="flex items-center justify-between">
                                <div className="flex items-baseline gap-2 md:gap-5">
                                    <span className="text-2xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none group-hover:text-(--main-color) transition-colors">{currentItem?.normData.dims || '0×0×0'}</span>
                                    <span className="text-sm md:text-2xl font-black text-(--main-color) uppercase tracking-tighter opacity-30">CM</span>
                                </div>
                                <div className="flex flex-col items-end border-l border-white/10 pl-4 md:pl-6">
                                    <span className="text-[7px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">{tr("WEIGHT")}</span>
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
                    title={tr("Verify Artifact")}
                    subtitle={`Authenticating ${currentItem?.codes.bookBarcode}`}
                />
            )}
        </div>
    );
};

export { LabelPrintStudio } from '../print/LabelPrintStudio';

/* ─── Unified Phomemo Label Print Studio (Replaces Print Wizard) ─── */
export const LabelWizard: React.FC = () => {
    return <LabelPrintStudio />;
};
