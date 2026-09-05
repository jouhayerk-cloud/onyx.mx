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
    Maximize2, Search, ZapOff, History
} from 'lucide-react';
import toast from 'react-hot-toast';
import { RareEarthLogoBase64 } from './RareEarthLogoBase64';
import { ART_OF_DECOR_LOGO } from '../../lib/artOfDecorLogo';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, collectAllImages, collectExportImages, toTitleCase } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
// The catalogue splits on exactly what the Shopify sheet splits on, so the
// two PDFs and the workbook's two sheets can never disagree about an item.
import { isShopifyReady } from '../../lib/aiContent';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { vendors } from '../../lib/consts';
import { generateAxonometricDataUrl } from '../../lib/axonometric';
import { NFCTagCard } from '../../components/LabelVisuals';
import { supabase } from '../../lib/supabase';

/* ─── NFC Tags HUD Component ─── */
import { ScannerCenter } from '../../components/ScannerCenter';
import { PreviewLabels } from '../../components/PreviewLabels';
import { tr } from '../../lib/i18n';

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
            
            <div className="label-wizard nfc-wizard relative w-full h-full flex flex-col lg:flex-row pointer-events-auto overflow-y-auto bg-black/10 backdrop-blur-3xl">
                
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

const fmtDuration = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
};

/* ─── Printables Engine HUB Sub-component (LARGE Mode) ─── */
export const LabelWizard: React.FC = () => {
    const user = useAtomValue(userAtom);
    const [isOpen, setIsOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const theme = useAtomValue(themeAtom);

    const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);
    const [activeWizardTab, setActiveWizardTab] = useState<'printer' | 'documents'>('printer');
    const [isNameInputFocused, setIsNameInputFocused] = useState(false);
    const [includeImages, setIncludeImages] = useState(true);
    const [catalogMethod, setCatalogMethod] = useState<'grid' | 'single'>('grid');
    const [progress, setProgress] = useState({ xlsx: -1, pdf: -1, catalog: -1, printer: -1 });
    const [urls, setUrls] = useState({ xlsx: '', pdf: '', catalogReady: '', catalogNotReady: '' });

    // Verbose catalogue telemetry. exportCatalogPdf has always reported a stage
    // string alongside the percentage -- it was being dropped on the floor, so a
    // multi-minute export showed nothing but a spinner and read as a hang.
    const [catalogStatus, setCatalogStatus] = useState<{
        label: string; error: string | null; startedAt: number | null; updatedAt: number; bytes: number;
        imagesTotal: number; imagesFailed: number;
    }>({ label: '', error: null, startedAt: null, updatedAt: 0, bytes: 0, imagesTotal: 0, imagesFailed: 0 });
    const [nowTs, setNowTs] = useState(() => Date.now());

    const catalogRunning = progress.catalog > 0 && progress.catalog < 100;
    // The export never reports backwards, so a long gap means one image source
    // is sitting on its timeout. Say so instead of leaving a frozen-looking bar.
    const catalogStalled = catalogRunning && catalogStatus.updatedAt > 0 && nowTs - catalogStatus.updatedAt > 15000;

    useEffect(() => {
        if (!catalogRunning) return;
        const id = window.setInterval(() => setNowTs(Date.now()), 250);
        return () => window.clearInterval(id);
    }, [catalogRunning]);

    const [isPrintWorkflowOpen, setIsPrintWorkflowOpen] = useState(false);
    const [showJobLog, setShowJobLog] = useState(false);
    // Tracks activeLabelSize, which is declared further down; commitPrintJob
    // reads it through this so the callback does not depend on declaration order.
    const labelSizeRef = React.useRef<string>('50x30');

    // A print job that has been handed to the engine but not yet confirmed.
    const pendingPrintJobRef = React.useRef<{ ids: string[]; tagById: Record<string, string>; checksum: string; jobId: string; isReprint: boolean } | null>(null);

    /**
     * SHA-256 of the exact label payload sent to the printer. Stored per item
     * so a tag can be traced back to the job that produced it, and so a
     * reprint is distinguishable from the original rather than just bumping a
     * date. Deterministic: the same batch yields the same checksum.
     */
    const computeJobChecksum = async (batch: any): Promise<string> => {
        try {
            const bytes = new TextEncoder().encode(JSON.stringify(batch));
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch {
            return '';
        }
    };

    // The last completed job, so the operator can reprint or review it without
    // rebuilding the batch.
    const [lastPrintJob, setLastPrintJob] = React.useState<{
        jobId: string; labelCount: number; itemCount: number; at: string; isReprint: boolean;
    } | null>(null);

    /**
     * Records a completed job. Called only from the designer's PRINT_COMPLETE,
     * which fires inside its !isPrintCancelled() guard — so a row here means
     * labels physically came out of the printer, not that a wizard was opened.
     *
     * Counts come from the designer rather than from inventory.quantity: the
     * batch expands one label per unit, and an operator can add doubles at the
     * end of a run, so the printer's own tally is the only accurate one.
     */
    const commitPrintJob = React.useCallback(async (detail: any, reason: string) => {
        const job = pendingPrintJobRef.current;
        if (!job || job.ids.length === 0) return;
        pendingPrintJobRef.current = null;

        const printedTags: string[] = Array.isArray(detail?.printedTags) ? detail.printedTags : [];
        const labelCount: number = Number(detail?.totalRecords) || printedTags.length || job.ids.length;
        const stamp = detail?.finishedAt || new Date().toISOString();
        const isReprint = !!job.isReprint;

        // How many labels each tag actually received. A tag appearing twice in
        // the run is two labels, which is exactly the double-label case.
        const perTag = new Map<string, number>();
        printedTags.forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1));

        try {
            const { error: jobErr } = await supabase.from('print_jobs').insert({
                id: job.jobId,
                checksum: job.checksum,
                printed_at: stamp,
                printed_by: user?.email || user?.name || null,
                label_count: labelCount,
                item_count: job.ids.length,
                is_reprint: isReprint,
                label_size: labelSizeRef.current,
                source: detail?.source || 'batch',
            });
            if (jobErr) throw jobErr;

            // One row per item in the job, carrying its own label count. The
            // inventory running totals are maintained by trigger from these.
            const rows = job.ids.map((id: string) => {
                const tag = job.tagById?.[id] || '';
                return {
                    job_id: job.jobId,
                    inventory_id: id,
                    tag_id: tag,
                    labels_printed: perTag.get(tag) ?? 1,
                };
            });
            for (let i = 0; i < rows.length; i += 100) {
                const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
                if (itemErr) throw itemErr;
            }

            // A reprint must not rewrite the original print date — that is the
            // moment the tag first existed. Only the job log grows.
            if (!isReprint) {
                for (let i = 0; i < job.ids.length; i += 50) {
                    const { error } = await supabase.from('inventory').update({
                        print_date: stamp,
                        print_job_checksum: job.checksum,
                        print_job_id: job.jobId,
                        updated_at: stamp,
                    }).in('id', job.ids.slice(i, i + 50));
                    if (error) throw error;
                }
            }

            setLastPrintJob({ jobId: job.jobId, labelCount, itemCount: job.ids.length, at: stamp, isReprint });
            toast.success(`Logged ${labelCount} label${labelCount !== 1 ? 's' : ''} across ${job.ids.length} item${job.ids.length !== 1 ? 's' : ''}`);
            console.log(`[LabelWizard] print job ${job.jobId} recorded (${reason})`);
        } catch (e: any) {
            console.error('[LabelWizard] print job log failed:', e);
            toast.error('Labels printed, but the job was not logged: ' + (e?.message || 'unknown error'));
        }
    }, [user]);

    const [activeLabelSize, setActiveLabelSize] = useState<'50x30' | '50x50'>('50x30');
    React.useEffect(() => { labelSizeRef.current = activeLabelSize; }, [activeLabelSize]);
    const [isPrintHelperOpen, setIsPrintHelperOpen] = useState(false);
    const [logoVariant, setLogoVariant] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');
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
                    '#111111', true
                );

                return {
                    "TAG ID": c.bookBarcode || '',
                    "DESCRIPTION": toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece'),
                    "COLOR MATERIAL": toTitleCase(`${d.color || ''} ${d.material || 'Onyx'}`.trim()),
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
    const ONYX_MASTER_TEMPLATE_50x50 = (width: number, height: number, logoChoice: string) => ({
        name: "OnyxLabels_50x50",
        version: 6,
        isTemplate: true,
        labelSize: { width, height },
        templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "COLOR MATERIAL", "QR DATA", "AXO_IMAGE"],
        elements: [
            { id: "el_axo", type: "image", zone: 0, x: 255, y: 93, width: 155, height: 155, rotation: 0, imageData: "{{AXO_IMAGE}}" },
            { id: "el_qr", type: "qr", zone: 0, x: 20, y: 12.32, width: 106.4, height: 106.4, rotation: 0, qrData: "{{QR DATA}}" },
            { id: "el_desc", type: "text", zone: 0, x: 130, y: 12.32, width: 250, height: 35, rotation: 0, align: "left", text: "{{DESCRIPTION}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_mat", type: "text", zone: 0, x: 130, y: 47.32, width: 250, height: 35.33, rotation: 0, align: "left", text: "{{COLOR MATERIAL}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "normal", autoScale: true, noWrap: true },
            { id: "el_sizes", type: "text", zone: 0, x: 130, y: 82.65, width: 250, height: 35.01, rotation: 0, align: "left", text: "{{SIZES}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_retail", type: "text", zone: 0, x: 20, y: 132.8, width: 250, height: 35, rotation: 0, align: "left", text: "{{BOOK RETAIL}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_madein", type: "text", zone: 0, x: 20, y: 175.8, width: 161.44, height: 26.4, rotation: 0, align: "left", text: "Made in Mexico For", fontSize: 18, fontFamily: "Inter, sans-serif", fontWeight: "normal", autoScale: false, noWrap: true },
            { id: "el_logo", type: "image", zone: 0, x: 20, y: logoChoice === 'RareEarth' ? 193 : 202, width: logoChoice === 'RareEarth' ? 198 : 174, height: logoChoice === 'RareEarth' ? 47 : 30, rotation: 0, imageData: logoChoice === 'RareEarth' ? RareEarthLogoBase64 : ART_OF_DECOR_LOGO },
            { id: "el_barcode", type: "barcode", zone: 0, x: 18.48, y: 240.1, width: 368.16, height: 146.48, rotation: 0, barcodeData: "{{TAG ID}}", barcodeFormat: "CODE128", format: "CODE128", textFontSize: 22, textBold: true, showText: true }
        ]
    });

    const buildBatchJSONAsync = async (items: any[], workbookPrefix: string, activeLabelSize: string = '50x30', logoVariant: string = 'ArtOfDecor') => {
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
                '#111111', true
            );

            return {
                "TAG ID": c.bookBarcode || '',
                "DESCRIPTION": toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece'),
                "COLOR MATERIAL": toTitleCase(`${d.color || ''} ${d.material || 'Onyx'}`.trim()),
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
            ...(activeLabelSize === '50x50' ? ONYX_MASTER_TEMPLATE_50x50(width, height, logoVariant) : ONYX_MASTER_TEMPLATE_V4(width, height)),
            name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
            exportedAt: new Date().toISOString(),
            records: templateData,
            templateData
        };
    };

    const handlePrintBluetooth = async (isReprint = false) => {
        setProgress(p => ({ ...p, printer: 5 }));
        const tid = toast.loading(tr("Generating dynamic 3D structures for labels..."));
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
            try {
                localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            } catch (storageError) {
                console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
            }
            pendingBatchRef.current = batchProject;
            setProgress(p => ({ ...p, printer: 100 }));
            toast.success(tr("Batch Prepared! Launching Print Engine"), { id: tid });

            // Hold the job until the engine confirms it printed. Stamping here
            // would record every opened wizard as a printed tag, which is the
            // opposite of what the checksum is for.
            const tagById: Record<string, string> = {};
            selectedItems.forEach((it: any) => {
                const id = it.row ?? it.data?.id ?? it.id;
                if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
            });
            pendingPrintJobRef.current = {
                ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
                tagById,
                checksum: await computeJobChecksum(batchProject),
                jobId: `PJ-${Date.now().toString(36).toUpperCase()}`,
                isReprint,
            };

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

    // Counted from the same predicate the export uses, so the preview and the
    // two produced files always agree.
    const shopifySplit = useMemo(() => {
        const ready = selectedItems.reduce((n, i) => n + (isShopifyReady(i.normData) ? 1 : 0), 0);
        return { ready, notReady: selectedItems.length - ready };
    }, [selectedItems]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // The engine reports a finished job. This is the confident path:
            // a checksum written from here means tags physically printed.
            if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
                  commitPrintJob(event.data.payload || {}, 'designer reported PRINT_COMPLETE');
              }
            if (event.data?.type === 'CLOSE_WIZARD') {
                  // Fallback: the current print engine emits no completion
                  // message, so closing after a job is the only other evidence
                  // available. Ask rather than assume — silently stamping an
                  // abandoned job is exactly the false positive the checksum
                  // exists to prevent.
                  // The designer now reports PRINT_COMPLETE itself, so a job
                  // still pending at close was abandoned. Dropping it is
                  // correct: recording it would be the false positive the
                  // checksum exists to prevent.
                  pendingPrintJobRef.current = null;
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
    }, [commitPrintJob]);

    useEffect(() => {
        if (isOpen) {
            setProgress({ xlsx: -1, pdf: -1, catalog: -1, printer: -1 });
            setUrls({ xlsx: '', pdf: '', catalogReady: '', catalogNotReady: '' });
            setIsPrintWorkflowOpen(false);
            setActiveSlide(0);

            const initialQ: Record<string, number> = {};
            selectedItems.forEach(item => {
                initialQ[String(item.row)] = Number(item.normData.quantity) || 1; // Default to inventory quantity
            });
            setQuantities(initialQ);
        }
    }, [isOpen, selectedIds.length]);

    useEffect(() => {
        if (isPrintWorkflowOpen && iframeRef.current?.contentWindow && !pendingBatchRef.current) {
            const timer = setTimeout(async () => {
                try {
                    const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
                    
                    try {
                        localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
                    } catch (storageError) {}
                    
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
                const desc = toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece');
                const matColor = toTitleCase(`${d.material || 'Onyx'} ${d.color || ''}`.trim());
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
                toast.success(tr("XLSX generated"));
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
                    imageUrls: includeImages ? collectExportImages(d) : [],
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
                toast.success(tr("Control Page generated"));
            } else {
                throw new Error('PDF generation failed to produce a valid file');
            }
        } catch (e) {
            console.error(e);
            setProgress(p => ({ ...p, pdf: -1 }));
            toast.error(tr("Control Page failed"));
        }
    };

    const handleGenerateCatalog = async () => {
        const startedAt = Date.now();
        setCatalogStatus({ label: tr("Preparing Catalog..."), error: null, startedAt, updatedAt: startedAt, bytes: 0, imagesTotal: 0, imagesFailed: 0 });
        setNowTs(startedAt);
        setProgress(p => ({ ...p, catalog: 5 }));
        try {
            // Same split as the Shopify workbook: isShopifyReady is literally
            // missingShopifyFields(d).length === 0, which is what the sheet
            // partition computes, so an item cannot land in the "ready" PDF and
            // the "Not Shopify Ready (V2)" sheet at the same time.
            const ready = selectedItems.filter(i => isShopifyReady(i.normData));
            const notReady = selectedItems.filter(i => !isShopifyReady(i.normData));

            const jobs = [
                { key: 'catalogReady' as const, suffix: 'ShopifyReady', label: tr("Shopify ready"), items: ready },
                { key: 'catalogNotReady' as const, suffix: 'NotShopifyReady', label: tr("Not Shopify ready"), items: notReady },
            ].filter(j => j.items.length > 0);

            if (jobs.length === 0) throw new Error(tr("No items selected"));

            // One progress bar across both documents, so the percentage still
            // means "how much of what I asked for is done".
            const span = 95 / jobs.length;
            let base = 5;
            let totalBytes = 0;
            let imgTotal = 0;
            let imgFailed = 0;

            for (const job of jobs) {
                const results: CatalogArtifact[] = job.items.map(item => ({
                    data: item.data,
                    codes: item.codes,
                    images: collectExportImages(item.normData),
                    exportType: 'catalog'
                }));

                const jobBase = base;
                const blob = await exportCatalogPdf(results, {
                    title: `${name} — ${job.label}`,
                    method: catalogMethod,
                    logo: logoVariant,
                    exportType: 'catalog'
                }, (pct, stage) => {
                    setProgress(p => ({ ...p, catalog: Math.min(99, Math.round(jobBase + (pct / 100) * span)) }));
                    setCatalogStatus(s => ({
                        ...s,
                        label: `${job.label} (${job.items.length}) — ${stage || s.label}`,
                        updatedAt: Date.now(),
                    }));
                }, 'blob', (stats) => {
                    // Accumulate across both documents rather than overwrite.
                    imgTotal += stats.imagesTotal;
                    imgFailed += stats.imagesFailed;
                    setCatalogStatus(s => ({ ...s, imagesTotal: imgTotal, imagesFailed: imgFailed }));
                });

                if (!(blob instanceof Blob)) throw new Error(`${job.label}: catalogue generation failed`);

                totalBytes += blob.size;
                const url = URL.createObjectURL(blob);
                setUrls(u => ({ ...u, [job.key]: url }));
                base += span;
            }

            setProgress(p => ({ ...p, catalog: 100 }));
            const parts = jobs.map(j => `${j.items.length} ${j.label.toLowerCase()}`).join(', ');
            setCatalogStatus(s => ({
                ...s,
                label: imgFailed > 0
                    ? `${jobs.length} ${tr("PDFs ready")} — ${imgFailed}/${imgTotal} ${tr("images missing")}`
                    : `${jobs.length} ${tr("PDFs ready")} — ${parts}`,
                error: null, updatedAt: Date.now(), bytes: totalBytes,
            }));
            toast.success(`${tr("Catalog generated")} — ${parts}`);
        } catch (e) {
            console.error(e);
            setProgress(p => ({ ...p, catalog: -1 }));
            // Surface the real reason in the panel; the toast only ever said
            // "failed", which is what sent people looking at a frozen spinner.
            setCatalogStatus(s => ({
                ...s,
                label: '',
                error: (e as any)?.message ? String((e as any).message) : String(e),
                updatedAt: Date.now(),
            }));
            toast.error(tr("Catalog generation failed"));
        }
    };

    if (!isOpen) return null;


    return createPortal(
        <>
            {/* Print Helper Modal */}
            {isPrintHelperOpen && (
<div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 pointer-events-auto">
                    <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                            <div className="flex items-center gap-3">
                                <Printer className="text-(--main-color)" size={24} />
                                <h3 className="text-xl font-black text-white tracking-wider">PRINT SETTINGS</h3>
                            </div>
                            <button 
                                onClick={() => setIsPrintHelperOpen(false)}
                                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-8 flex flex-col md:flex-row gap-8">
                            <div className="flex-1 space-y-8">
                                <div>
                                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Label Size</h4>
                                    <div className="flex bg-black/40 border border-white/5 rounded-full p-1">
                                        <button 
                                            onClick={() => setActiveLabelSize('50x30')}
                                            className={`flex-1 px-4 py-3 text-[12px] font-black tracking-widest rounded-full transition-all ${activeLabelSize === '50x30' ? 'bg-(--main-color) text-black shadow-[0_0_15px_var(--main-color)] scale-105' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                                        >
                                            50x30
                                        </button>
                                        <button 
                                            onClick={() => setActiveLabelSize('50x50')}
                                            className={`flex-1 px-4 py-3 text-[12px] font-black tracking-widest rounded-full transition-all ${activeLabelSize === '50x50' ? 'bg-(--main-color) text-black shadow-[0_0_15px_var(--main-color)] scale-105' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                                        >
                                            50x50
                                        </button>
                                    </div>
                                </div>
                                
                                <div className={`transition-all duration-300 ${activeLabelSize === '50x50' ? 'opacity-100 max-h-[200px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
                                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Logo Variant (50x50 Only)</h4>
                                    <div className="flex justify-center gap-6 mt-2">
                                        <button 
                                            onClick={() => setLogoVariant('ArtOfDecor')}
                                            className={`transition-all duration-300 ${logoVariant === 'ArtOfDecor' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                        >
                                            <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art Of Decor" className="h-10 object-contain" />
                                        </button>
                                        <button 
                                            onClick={() => setLogoVariant('RareEarth')}
                                            className={`transition-all duration-300 ${logoVariant === 'RareEarth' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                        >
                                            <img src={`${import.meta.env.BASE_URL}REG_LogoGrayscale.png`} alt="Rare Earth Gallery" className="h-10 object-contain" />
                                        </button>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={() => {
                                        setIsPrintHelperOpen(false);
                                        handlePrintBluetooth();
                                    }}
                                    disabled={progress.printer > 0 && progress.printer < 100}
                                    className="w-full py-4 bg-(--main-color) text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl hover:shadow-[0_0_30px_var(--main-color)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Printer size={18} />
                                    {progress.printer > 0 && progress.printer < 100 ? tr("GENERATING...") : tr("LAUNCH PRINT ENGINE")}
                                </button>
                            </div>
                            
                            <div className="flex-[1.5] bg-black/30 border border-white/5 rounded-2xl p-6 flex items-center justify-center min-h-[300px]">
                                {activeLabelSize === '50x30' ? (
                                    <div className="w-[300px] h-[180px] bg-white rounded-md shadow-lg p-3 flex flex-col relative pointer-events-none overflow-hidden text-black font-sans">
                                        <div className="flex flex-1 gap-2">
                                            {/* Vertical Text */}
                                            <div className="w-4 flex flex-col justify-between items-center py-1">
                                                {Array.from(tr("MADE IN MEXICO")).map((char, i) => (
                                                    <span key={i} className="text-[6px] font-black leading-none">{char}</span>
                                                ))}
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-10 h-16 flex items-center justify-center">
                                                <div className="w-6 h-12 border border-gray-600 flex items-center justify-center skew-y-12"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-[2px] pt-1">
                                                <div className="text-[9px] font-black leading-none">ABC-123ABCDE</div>
                                                <div className="text-[14px] font-black leading-none mt-1">Shape Type</div>
                                                <div className="text-[12px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[8px] font-black leading-none mt-1">12*12*12 CM 12Kg</div>
                                            </div>
                                            {/* QR Code */}
                                            <div className="w-16 h-16 border-[4px] border-black p-1 flex items-center justify-center">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-14 w-full mt-2 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-3 flex justify-between items-center px-2 text-[7px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-[300px] h-[300px] bg-white rounded-md shadow-lg p-4 flex flex-col relative overflow-hidden pointer-events-none text-black font-sans">
                                        <div className="flex gap-4">
                                            {/* QR Code */}
                                            <div className="w-20 h-20 border-[4px] border-black p-1 flex items-center justify-center shrink-0">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-1 pt-1">
                                                <div className="text-[16px] font-black leading-none">Shape Type</div>
                                                <div className="text-[14px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[10px] font-black leading-none mt-1">12*12*12 CM WT 12KG</div>
                                            </div>
                                        </div>
                                        <div className="flex mt-6 gap-2 flex-1">
                                            <div className="flex-1 flex flex-col pt-2 gap-1">
                                                <div className="text-[14px] font-black leading-none">ABC-123456</div>
                                                <div className="text-[11px] text-gray-600 leading-none mt-2">Made in Mexico For</div>
                                                {/* Logo Placeholder */}
                                                <div className="mt-4 w-[120px] h-[30px] flex items-center justify-start">
                                                    <img src={logoVariant === 'ArtOfDecor' ? `${import.meta.env.BASE_URL}ArtOfDecorLogo.png` : `${import.meta.env.BASE_URL}REG_LogoGrayscale.png`} alt="Logo" className="max-h-full object-contain" />
                                                </div>
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-16 h-24 mr-4 mt-2 flex items-center justify-center">
                                                <div className="w-10 h-20 border-[1.5px] border-gray-800 flex items-center justify-center skew-y-12 shrink-0">
                                                    <div className="w-8 h-16 border border-gray-300"></div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-20 w-full mt-4 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-4 flex justify-between items-center px-4 text-[9px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

        <div className="label-wizard fixed inset-0 z-[5000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[80px] pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-y-auto overflow-x-hidden no-scrollbar pointer-events-auto p-8 md:p-12 lg:p-16 max-w-7xl mx-auto animate-in zoom-in-95 duration-700 bg-transparent">
                
                {/* Floating Close Button - Studio Standard */}
                {!isPrintWorkflowOpen && (
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                    >
                        <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                    </button>
                )}

                <div className="flex justify-between items-start mb-8 shrink-0">
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                                <Terminal size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase leading-none">PRINT WIZARD</h2>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-8 mb-12 shrink-0 max-w-4xl relative">
                    <div className="flex-1">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2 block">BATCH NAME</span>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onFocus={() => setIsNameInputFocused(true)}
                            onBlur={() => setIsNameInputFocused(false)}
                            className={`bg-transparent border-none outline-none w-full font-black text-white uppercase tracking-tighter placeholder:text-white/5 focus:text-(--main-color) transition-all duration-300 ${isNameInputFocused ? 'text-6xl md:text-7xl py-2' : 'text-5xl md:text-6xl'}`}
                            placeholder="ID_NULL"
                        />
                    </div>
                    <div className="wizard-readout flex gap-8 shrink-0">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">TYPES</span>
                            <div className="text-4xl md:text-5xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">
                                {selectedItems.length}
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">TOTAL ITEMS</span>
                            <div className="text-4xl md:text-5xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">
                                {selectedItems.reduce((acc, item) => acc + (quantities[String(item.row)] ?? (Number(item.normData.quantity) || 1)), 0)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Selectors */}
                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setActiveWizardTab('printer')}
                        className={`px-8 py-4 flex items-center gap-3 rounded-xl text-lg font-black uppercase tracking-[0.2em] transition-all ${activeWizardTab === 'printer' ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)] scale-[1.02]' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                    >
                        <Printer size={20} />
                        Printer
                    </button>
                    <button
                        onClick={() => setActiveWizardTab('documents')}
                        className={`px-8 py-4 flex items-center gap-3 rounded-xl text-lg font-black uppercase tracking-[0.2em] transition-all ${activeWizardTab === 'documents' ? 'bg-blue-400 text-black shadow-[0_0_20px_rgba(96,165,250,0.4)] scale-[1.02]' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                    >
                        <FileText size={20} />
                        Documents
                    </button>
                </div>

                <div className="flex-1 pr-4">
                    {activeWizardTab === 'printer' && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 lg:gap-16">
                            <div className="flex flex-col gap-6 md:col-span-3">
                                {/* Print Settings */}
                                <div className="bg-black/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
                                    <div className="flex flex-col gap-2">
                                        <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Print Settings</h3>
                                        <p className="text-white/40 text-sm font-medium">Configure labels and export manifesting files.</p>
                                    </div>
                                    
                                    {/* Format Selectors */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="flex flex-col gap-4">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Label Size</label>
                                            <div className="flex gap-4">
                                                {['50x30', '50x50'].map(size => (
                                                    <button
                                                        key={size}
                                                        onClick={() => setActiveLabelSize(size as any)}
                                                        className={`px-6 py-3 rounded-xl border ${activeLabelSize === size ? 'bg-(--main-color) text-black font-black border-(--main-color)' : 'bg-transparent text-white/40 font-bold border-white/10 hover:bg-white/5 hover:text-white'} transition-all uppercase tracking-widest text-xs flex-1`}
                                                    >
                                                        {size} mm
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col gap-4">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Branding Logo</label>
                                            <div className="flex gap-4 h-[46px] items-center">
                                                <button
                                                    onClick={() => setLogoVariant('ArtOfDecor')}
                                                    className={`transition-all duration-300 flex-1 flex justify-center ${logoVariant === 'ArtOfDecor' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                                >
                                                    <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art of Decor" className="max-h-[30px] object-contain invert" />
                                                </button>
                                                <button
                                                    onClick={() => setLogoVariant('RareEarth')}
                                                    className={`transition-all duration-300 flex-1 flex justify-center ${logoVariant === 'RareEarth' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                                >
                                                    <img src={`${import.meta.env.BASE_URL}REG_Logo.png`} alt="Rare Earth Gallery" className="max-h-[30px] object-contain" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons Container */}
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        {/* Control PDF */}
                                        <div className="flex flex-col gap-2">
                                            <button 
                                                onClick={handleGeneratePDF} 
                                                disabled={progress.pdf > 0 && progress.pdf < 100} 
                                                className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-black uppercase tracking-[0.1em] text-xs rounded-xl hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {progress.pdf > 0 && progress.pdf < 100 ? <div className="w-4 h-4 border-2 border-red-500/20 border-t-red-500 animate-spin rounded-full" /> : <ListChecks size={16} />}
                                                {progress.pdf === 100 ? tr("RE-GENERATE PDF") : tr("CONTROL PDF")}
                                            </button>
                                            {progress.pdf === 100 && urls.pdf && (
                                                <button 
                                                    onClick={() => { const a = document.createElement('a'); a.href = urls.pdf; a.download = `ControlPage_${name}.pdf`; a.click(); }}
                                                    className="w-full py-2 bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-red-500/30 transition-all"
                                                >
                                                    <Download size={12} /> RETRIEVE PDF
                                                </button>
                                            )}
                                        </div>

                                        {/* XLS Labels */}
                                        <div className="flex flex-col gap-2">
                                            <button 
                                                onClick={handleGenerateXLSX} 
                                                disabled={progress.xlsx > 0 && progress.xlsx < 100} 
                                                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black uppercase tracking-[0.1em] text-xs rounded-xl hover:bg-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {progress.xlsx > 0 && progress.xlsx < 100 ? <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 animate-spin rounded-full" /> : <Sheet size={16} />}
                                                {progress.xlsx === 100 ? tr("RE-GENERATE XLS") : tr("XLS LABELS")}
                                            </button>
                                            {progress.xlsx === 100 && urls.xlsx && (
                                                <button 
                                                    onClick={() => { const a = document.createElement('a'); a.href = urls.xlsx; a.download = `Labels_${name}.xlsx`; a.click(); }}
                                                    className="w-full py-2 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-emerald-500/30 transition-all"
                                                >
                                                    <Download size={12} /> RETRIEVE XLS
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4">
                                        <button
                                            onClick={() => handlePrintBluetooth()}
                                            disabled={progress.printer > 0 && progress.printer < 100}
                                            className="w-full py-4 bg-(--main-color) text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl hover:shadow-[0_0_30px_rgba(var(--main-color-rgb),0.6)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {progress.printer > 0 && progress.printer < 100 ? <div className="w-4 h-4 border-2 border-black/20 border-t-black animate-spin rounded-full" /> : <Printer size={18} />}
                                            {progress.printer > 0 && progress.printer < 100 ? tr("GENERATING...") : tr("LAUNCH PRINT ENGINE")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Preview Label */}
                            <div className="flex flex-col md:col-span-2 bg-black/30 border border-white/5 rounded-3xl p-6 items-center justify-center min-h-[300px]">
                                {activeLabelSize === '50x30' ? (
                                    <div className="w-[300px] h-[180px] bg-white rounded-md shadow-lg p-3 flex flex-col relative pointer-events-none overflow-hidden text-black font-sans">
                                        <div className="flex flex-1 gap-2">
                                            {/* Vertical Text */}
                                            <div className="w-4 flex flex-col justify-between items-center py-1">
                                                {Array.from(tr("MADE IN MEXICO")).map((char, i) => (
                                                    <span key={i} className="text-[6px] font-black leading-none">{char}</span>
                                                ))}
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-10 h-16 flex items-center justify-center">
                                                <div className="w-6 h-12 border border-gray-600 flex items-center justify-center skew-y-12"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-[2px] pt-1">
                                                <div className="text-[9px] font-black leading-none">ABC-123ABCDE</div>
                                                <div className="text-[14px] font-black leading-none mt-1">Shape Type</div>
                                                <div className="text-[12px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[8px] font-black leading-none mt-1">12*12*12 CM 12Kg</div>
                                            </div>
                                            {/* QR Code */}
                                            <div className="w-16 h-16 border-[4px] border-black p-1 flex items-center justify-center">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-14 w-full mt-2 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-3 flex justify-between items-center px-2 text-[7px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-[300px] h-[300px] bg-white rounded-md shadow-lg p-4 flex flex-col relative overflow-hidden pointer-events-none text-black font-sans">
                                        <div className="flex gap-4">
                                            {/* QR Code */}
                                            <div className="w-20 h-20 border-[4px] border-black p-1 flex items-center justify-center shrink-0">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-1 pt-1">
                                                <div className="text-[16px] font-black leading-none">Shape Type</div>
                                                <div className="text-[14px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[10px] font-black leading-none mt-1">12*12*12 CM WT 12KG</div>
                                            </div>
                                        </div>
                                        <div className="flex mt-6 gap-2 flex-1">
                                            <div className="flex-1 flex flex-col pt-2 gap-1">
                                                <div className="text-[14px] font-black leading-none">ABC-123456</div>
                                                <div className="text-[11px] text-gray-600 leading-none mt-2">Made in Mexico For</div>
                                                {/* Logo Placeholder */}
                                                <div className="mt-4 w-[120px] h-[30px] flex items-center justify-start">
                                                    <img src={logoVariant === 'ArtOfDecor' ? `${import.meta.env.BASE_URL}ArtOfDecorLogo.png` : `${import.meta.env.BASE_URL}REG_LogoGrayscale.png`} alt="Logo" className="max-h-full object-contain" />
                                                </div>
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-16 h-24 mr-4 mt-2 flex items-center justify-center">
                                                <div className="w-10 h-20 border-[1.5px] border-gray-800 flex items-center justify-center skew-y-12 shrink-0">
                                                    <div className="w-8 h-16 border border-gray-300"></div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-20 w-full mt-4 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-4 flex justify-between items-center px-4 text-[9px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeWizardTab === 'documents' && (
                        <div className="flex flex-col gap-6 max-w-2xl">
                            <div className="bg-black/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Document Settings</h3>
                                    <p className="text-white/40 text-sm font-medium">Configure branded catalogs.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Layout Format</label>
                                        <div className="flex gap-4">
                                            {['grid', 'single'].map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setCatalogMethod(m as any)}
                                                    className={`px-6 py-3 rounded-xl border ${catalogMethod === m ? 'bg-blue-500/20 text-blue-400 font-black border-blue-500/50' : 'bg-transparent text-white/40 font-bold border-white/10 hover:bg-white/5 hover:text-white'} transition-all uppercase tracking-widest text-xs flex-1`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Branding Logo</label>
                                        <div className="flex gap-4 h-[46px] items-center">
                                            <button
                                                onClick={() => setLogoVariant('ArtOfDecor')}
                                                className={`transition-all duration-300 flex-1 flex justify-center ${logoVariant === 'ArtOfDecor' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art of Decor" className="max-h-[30px] object-contain invert" />
                                            </button>
                                            <button
                                                onClick={() => setLogoVariant('RareEarth')}
                                                className={`transition-all duration-300 flex-1 flex justify-center ${logoVariant === 'RareEarth' ? 'opacity-100 scale-110 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'opacity-40 grayscale hover:opacity-70 hover:scale-105'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}REG_Logo.png`} alt="Rare Earth Gallery" className="max-h-[30px] object-contain" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-white/30">{tr("Will produce")}</span>
                                    <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 tabular-nums">
                                        {shopifySplit.ready} {tr("Shopify ready")}
                                    </span>
                                    <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 tabular-nums">
                                        {shopifySplit.notReady} {tr("not ready")}
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    <button 
                                        onClick={handleGenerateCatalog} 
                                        disabled={progress.catalog > 0 && progress.catalog < 100} 
                                        className="w-full py-4 bg-blue-500 border border-blue-400 text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {catalogRunning ? <div className="w-4 h-4 border-2 border-black/20 border-t-black animate-spin rounded-full" /> : <BookOpen size={18} />}
                                        {catalogRunning
                                            ? `${tr("GENERATING")} ${Math.max(0, Math.min(100, progress.catalog))}%`
                                            : progress.catalog === 100 ? tr("RE-GENERATE CATALOG") : tr("GENERATE CATALOG")}
                                    </button>
                                    
                                    {(catalogRunning || progress.catalog === 100 || catalogStatus.error) && (
                                        <div className="mt-3 flex flex-col gap-3 bg-black/40 border border-white/5 rounded-2xl p-5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {catalogRunning && <div className="w-3 h-3 border-2 border-blue-400/20 border-t-blue-400 animate-spin rounded-full shrink-0" />}
                                                    {!catalogRunning && progress.catalog === 100 && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
                                                    {!catalogRunning && catalogStatus.error && <ShieldAlert size={14} className="text-red-400 shrink-0" />}
                                                    <span className="text-[11px] font-black uppercase tracking-widest text-white/70 truncate">
                                                        {catalogStatus.error ? tr("Generation failed") : (catalogStatus.label || tr("Working..."))}
                                                    </span>
                                                </div>
                                                <span className={`text-[11px] font-black tabular-nums shrink-0 ${catalogStatus.error ? 'text-red-400' : progress.catalog === 100 ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                    {Math.max(0, Math.min(100, progress.catalog))}%
                                                </span>
                                            </div>

                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ease-out ${catalogStatus.error ? 'bg-red-500' : progress.catalog === 100 ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.6)]' : 'bg-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.6)]'}`}
                                                    style={{ width: `${Math.max(0, Math.min(100, progress.catalog))}%` }}
                                                />
                                            </div>

                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{tr("Items")}</span>
                                                    <span className="text-[12px] font-black tabular-nums text-white/80">{selectedItems.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{tr("Elapsed")}</span>
                                                    <span className="text-[12px] font-black tabular-nums text-white/80">
                                                        {catalogStatus.startedAt ? fmtDuration((catalogRunning ? nowTs : catalogStatus.updatedAt) - catalogStatus.startedAt) : '--'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{tr("Size")}</span>
                                                    <span className="text-[12px] font-black tabular-nums text-white/80">
                                                        {catalogStatus.bytes ? `${(catalogStatus.bytes / 1048576).toFixed(1)} MB` : '--'}
                                                    </span>
                                                </div>
                                            </div>

                                            {catalogStalled && (
                                                <div className="flex items-start gap-2 text-[10px] font-bold text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                                    <Activity size={12} className="mt-[1px] shrink-0" />
                                                    <span>{tr("No progress for")} {fmtDuration(nowTs - catalogStatus.updatedAt)} — {tr("the Drive image proxy is slow. Images are fetched in batches, so one slow batch pauses the whole count. It continues on its own; anything that does fail is counted below.")}</span>
                                                </div>
                                            )}

                                            {catalogStatus.imagesFailed > 0 && !catalogStatus.error && (
                                                <div className="flex items-start gap-2 text-[10px] font-bold text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                                    <ShieldAlert size={12} className="mt-[1px] shrink-0" />
                                                    <span>
                                                        {catalogStatus.imagesFailed}/{catalogStatus.imagesTotal} {tr("images could not be loaded — those pages are blank in the PDF.")}
                                                    </span>
                                                </div>
                                            )}

                                            {catalogStatus.error && (
                                                <div className="flex items-start gap-2 text-[10px] font-bold text-red-400/90 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 break-words">
                                                    <ShieldAlert size={12} className="mt-[1px] shrink-0" />
                                                    <span>{catalogStatus.error}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {progress.catalog === 100 && urls.catalogReady && (
                                        <button
                                            onClick={() => { const a = document.createElement('a'); a.href = urls.catalogReady; a.download = `Catalog_${name}_ShopifyReady.pdf`; a.click(); }}
                                            className="w-full py-2 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-emerald-500/30 transition-all"
                                        >
                                            <Download size={12} /> {tr("RETRIEVE")} — {tr("SHOPIFY READY")} ({shopifySplit.ready})
                                        </button>
                                    )}

                                    {progress.catalog === 100 && urls.catalogNotReady && (
                                        <button
                                            onClick={() => { const a = document.createElement('a'); a.href = urls.catalogNotReady; a.download = `Catalog_${name}_NotShopifyReady.pdf`; a.click(); }}
                                            className="w-full py-2 bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-amber-500/30 transition-all"
                                        >
                                            <Download size={12} /> {tr("RETRIEVE")} — {tr("NOT SHOPIFY READY")} ({shopifySplit.notReady})
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
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

                            {/* End-of-job bar. Appears only once a run has actually
                                completed, because it is driven by the designer's
                                PRINT_COMPLETE rather than by opening the wizard.
                                Doubles are handled here: reprinting a job logs a
                                second set of labels against the same items without
                                touching the original print date. */}
                            {lastPrintJob && (
                                <div className="print-job-bar shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-white/10">
                                    <div className="flex items-center gap-6">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Job</span>
                                            <span className="text-[12px] font-black tabular-nums leading-none">{lastPrintJob.jobId}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Labels</span>
                                            <span className="text-[12px] font-black tabular-nums leading-none text-(--main-color)">{lastPrintJob.labelCount}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Items</span>
                                            <span className="text-[12px] font-black tabular-nums leading-none">{lastPrintJob.itemCount}</span>
                                        </div>
                                        {lastPrintJob.isReprint && (
                                            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-400">Reprint</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => { setLastPrintJob(null); handlePrintBluetooth(true); }}
                                            className="flex items-center gap-2 px-4 h-11 rounded-xl text-[9px] font-black uppercase tracking-[0.16em] transition-all"
                                            title="Send the same batch again — logs a second set of labels, keeps the original print date"
                                        >
                                            <Printer size={16} strokeWidth={2.5} />
                                            Reprint Batch
                                        </button>
                                        <button
                                            onClick={() => setShowJobLog(v => !v)}
                                            aria-pressed={showJobLog}
                                            className="flex items-center gap-2 px-4 h-11 rounded-xl text-[9px] font-black uppercase tracking-[0.16em] transition-all"
                                            title="Print job history for this batch"
                                        >
                                            <History size={16} strokeWidth={2.5} />
                                            Job Log
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div></>,
        document.body
    );
};
