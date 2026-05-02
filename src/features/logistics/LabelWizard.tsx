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
    ShieldAlert, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import ExcelJS from 'exceljs';
import { vendors } from '../../lib/consts';
import { NFCTagCard } from '../../components/LabelVisuals';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

/* ─── NFC Wizard Sub-component ─── */
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

    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setStatus('idle');
        }
    }, [isOpen]);

    const selectedItems = useMemo(() => {
        // Context-aware selection source
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

    const handleSimulate = () => {
        setIsWriting(true);
        setStatus('writing');
        setTimeout(() => {
            setStatus('success');
            toast.success(`SIMULATED: Tag Written`);
            setIsWriting(false);
            if (currentIndex < selectedItems.length - 1) {
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                }, 1000);
            }
        }, 2000);
    };

    const handleWrite = async () => {
        console.log('[NFC] Initializing Write sequence...');
        if (!isSupported) {
            console.error('[NFC] NDEFReader not found in window');
            toast.error("Web NFC is not supported on this browser.");
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
            console.log(`[NFC] Preparing payload for ${tagId}:`, nfcData);

            // @ts-ignore
            const ndef = new NDEFReader();
            console.log('[NFC] Calling ndef.write()...');
            await ndef.write({
                records: [{ recordType: "text", data: nfcData }]
            });
            
            console.log('[NFC] Write successful!');
            setStatus('success');
            toast.success(`NFC Tag Written: ${tagId}`);
            
            if (currentIndex < selectedItems.length - 1) {
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                }, 2000);
            }
        } catch (error: any) {
            console.error('[NFC] Write Error:', error);
            setStatus('error');
            toast.error(`Write Failed: ${error.message || 'Unknown Error'}`);
        } finally {
            setIsWriting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[20000] flex justify-end pointer-events-none animate-in fade-in duration-500 overflow-hidden">
            <div className="relative w-full max-w-[1400px] flex flex-col bg-black/60 backdrop-blur-[120px] pointer-events-auto shadow-[-80px_0_150px_rgba(0,0,0,0.8)] border-l border-white/5">
                {/* Header HUD - Minimal & Precise */}
                <div className="flex justify-between items-center px-6 sm:px-8 py-4 sm:py-6 border-b border-white/5 shrink-0 bg-white/[0.02] backdrop-blur-3xl">
                    <div className="flex items-center gap-4 sm:gap-6">
                        <Nfc size={24} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                        <div className="flex flex-col">
                            <h3 className="text-sm sm:text-xl font-black text-white tracking-[0.2em] sm:tracking-[0.3em] uppercase leading-none">NFC CORE</h3>
                            <span className="text-[7px] sm:text-[8px] font-black text-white/20 tracking-[0.5em] uppercase mt-1">Tactical Provisioning</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-10">
                        {/* Navigation Pulse (Hidden on mobile header if space is tight, or just small) */}
                        <div className="hidden sm:flex items-center gap-4 px-6 py-2 bg-white/5 rounded-full border border-white/5 backdrop-blur-md">
                            <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.3em]">PRC_UNIT_01</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                            <span className="text-[10px] font-mono text-white/40 tracking-widest ml-4">{currentIndex + 1} / {selectedItems.length}</span>
                        </div>
                        
                        {/* Mobile Close Button */}
                        <button onClick={() => setIsOpen(false)} className="sm:hidden w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* LARGE FLOATING CLOSE BUTTON (Desktop only) */}
                <div className="hidden sm:block absolute top-8 right-8 z-[20050]">
                    <button onClick={() => setIsOpen(false)} className="flex items-center justify-center group cursor-pointer">
                        <X size={64} strokeWidth={1} className="text-white/20 group-hover:text-white group-hover:rotate-90 transition-all duration-500 drop-shadow-xl" />
                    </button>
                </div>

                {/* NAVIGATION CHEVRONS (Desktop only) */}
                <div className="hidden sm:flex absolute inset-y-0 left-8 items-center z-[20050] pointer-events-none">
                    <button 
                        onClick={() => setCurrentIndex(p => Math.max(0, p - 1))}
                        disabled={currentIndex === 0}
                        className="pointer-events-auto group cursor-pointer w-20 h-40 flex items-center justify-center text-(--main-color) hover:text-white disabled:opacity-0 transition-all duration-500 hover:scale-105 bg-(--main-color)/5 hover:bg-(--main-color)/20 rounded-3xl border border-(--main-color)/20 hover:border-(--main-color)/50 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
                        <ChevronLeft size={64} strokeWidth={1.5} className="relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform duration-500" />
                    </button>
                </div>
                <div className="hidden sm:flex absolute inset-y-0 right-8 items-center z-[20050] pointer-events-none">
                    <button 
                        onClick={() => setCurrentIndex(p => Math.min(selectedItems.length - 1, p + 1))}
                        disabled={currentIndex === selectedItems.length - 1}
                        className="pointer-events-auto group cursor-pointer w-20 h-40 flex items-center justify-center text-(--main-color) hover:text-white disabled:opacity-0 transition-all duration-500 hover:scale-105 bg-(--main-color)/5 hover:bg-(--main-color)/20 rounded-3xl border border-(--main-color)/20 hover:border-(--main-color)/50 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
                        <ChevronRight size={64} strokeWidth={1.5} className="relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform duration-500" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-y-auto custom-scrollbar">
                    {/* TACTICAL ENGINE VIEW */}
                    <div className="flex-1 flex flex-col relative bg-white/[0.01]">
                        {/* HUD Overlays (Desktop only or adjusted) */}
                        <div className="absolute top-4 sm:top-8 left-4 sm:left-8 flex flex-col gap-1 sm:gap-2">
                            <span className="text-[6px] sm:text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">ARTIFACT_VISUAL_0{currentIndex + 1}</span>
                            <div className="h-px w-12 sm:w-24 bg-(--main-color)/30" />
                        </div>
                        
                        <div className="absolute top-4 sm:top-28 right-4 sm:right-12 flex flex-col items-end gap-1 sm:gap-2">
                            <span className="text-[6px] sm:text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">PROTOCOL_IDENT_S3</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] sm:text-[10px] font-mono text-white/40">{currentItem.codes.bookBarcode}</span>
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: currentItem.codes.vendorColor }} />
                            </div>
                        </div>

                        {/* Main Interaction Plane */}
                        <div className="flex-1 flex flex-col items-center p-4 sm:p-20 gap-8 sm:gap-16">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-16 items-center w-full max-w-7xl animate-in fade-in zoom-in duration-700">
                                {/* Left: Large Focused Image */}
                                <div className="aspect-square flex items-center justify-center relative group bg-black/20 border border-white/5 backdrop-blur-3xl overflow-hidden shadow-2xl rounded-sm w-full max-w-[500px] mx-auto lg:max-w-none">
                                    <img 
                                        src={getCleanImageUrl(currentItem.normData.generatedPngUrl || currentItem.normData.mediaUrls?.split(',')[0])} 
                                        className="max-h-[90%] max-w-[90%] object-contain drop-shadow-[0_0_120px_rgba(255,255,255,0.1)] transition-all duration-1000 group-hover:scale-110" 
                                    />
                                    <div className="absolute inset-0 bg-linear-to-tr from-black/40 via-transparent to-white/5 pointer-events-none" />
                                </div>

                                {/* Right: High-Density Label & Metrics */}
                                <div className="flex flex-col gap-6 sm:gap-10">
                                    {/* Color Coded Tag ID Card */}
                                    <div className="relative group flex justify-center">
                                        <NFCTagCard item={currentItem} scale={window.innerWidth < 640 ? 0.7 : 1.0} className="!bg-transparent !text-white !p-0 shadow-[0_40px_120px_rgba(0,0,0,0.6)]" />
                                    </div>

                                    {/* Inline Metrics */}
                                    <div className="grid grid-cols-3 gap-4 sm:gap-8 p-4 sm:p-8 bg-white/[0.02] border border-white/5 backdrop-blur-3xl rounded-sm">
                                        {[
                                            { label: 'LAND_CODE', value: currentItem.codes.bookLandCode },
                                            { label: 'WORKBOOK', value: `VV${currentItem.normData.workbook}` },
                                            { label: 'MATERIAL', value: currentItem.normData.material }
                                        ].map((m, i) => (
                                            <div key={i} className="flex flex-col gap-1">
                                                <span className="text-[6px] sm:text-[8px] font-black text-white/20 uppercase tracking-[0.2em] sm:tracking-[0.4em]">{m.label}</span>
                                                <span className="text-[10px] sm:text-base font-black text-white uppercase tracking-tight truncate leading-tight">{m.value || '---'}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Mobile Navigation Controls */}
                                    <div className="flex sm:hidden items-center justify-between gap-4 h-16">
                                        <button 
                                            onClick={() => setCurrentIndex(p => Math.max(0, p - 1))}
                                            disabled={currentIndex === 0}
                                            className="flex-1 h-full rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 disabled:opacity-10 active:scale-95 transition-all"
                                        >
                                            <ChevronLeft size={32} />
                                        </button>
                                        <div className="flex flex-col items-center min-w-[60px]">
                                            <span className="text-[10px] font-mono text-(--main-color) font-black">{currentIndex + 1}</span>
                                            <div className="h-px w-4 bg-white/10 my-1" />
                                            <span className="text-[8px] font-mono text-white/20">{selectedItems.length}</span>
                                        </div>
                                        <button 
                                            onClick={() => setCurrentIndex(p => Math.min(selectedItems.length - 1, p + 1))}
                                            disabled={currentIndex === selectedItems.length - 1}
                                            className="flex-1 h-full rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 disabled:opacity-10 active:scale-95 transition-all"
                                        >
                                            <ChevronRight size={32} />
                                        </button>
                                    </div>

                                    {/* WRITE NFC BUTTON */}
                                    <button 
                                        onClick={isSupported ? handleWrite : handleSimulate}
                                        disabled={isWriting}
                                        className="group relative w-full h-20 sm:h-24 overflow-hidden transition-all duration-500 hover:scale-[1.02] active:scale-95 disabled:opacity-30 rounded-xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.6)] cursor-pointer">
                                        <div className="absolute inset-0 bg-white/5 backdrop-blur-3xl group-hover:bg-white/10 transition-colors" />
                                        {status === 'success' ? (
                                            <div className="absolute inset-0 bg-green-500/10" />
                                        ) : (
                                            <div className="absolute inset-0 bg-(--main-color)/10" />
                                        )}
                                        <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                        
                                        <span className={`relative z-10 text-lg sm:text-2xl font-black uppercase tracking-[0.2em] sm:tracking-[0.5em] flex items-center justify-center gap-4 sm:gap-6 ${
                                            status === 'success' ? 'text-green-400' : 'text-white'
                                        }`}>
                                            {isWriting ? 'PENDING...' : status === 'success' ? 'SUCCESS' : 'WRITE TAG'}
                                            <Nfc size={window.innerWidth < 640 ? 24 : 36} className={status === 'success' ? 'text-green-400' : 'text-(--main-color)'} />
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Printables Wizard Sub-component ─── */
export const LabelWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);

    const [name, setName] = useState(`ONYX_LABELS_${new Date().toISOString().split('T')[0]}`);
    const [includeImages, setIncludeImages] = useState(true);
    const [progress, setProgress] = useState({ xlsx: -1, pdf: -1 });
    const [urls, setUrls] = useState({ xlsx: '', pdf: '' });

    const selectedItems = useMemo(() => {
        return inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            const normData = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
            return { ...item, normData, codes };
        });
    }, [inventory, selectedIds, exchangeRate, workbookPrefix]);

    useEffect(() => {
        setProgress({ xlsx: -1, pdf: -1 });
        setUrls({ xlsx: '', pdf: '' });
    }, [selectedIds.length]);

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

            await exportToXLSX(name, [{
                name: 'Packing List',
                data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }]);
            
            setProgress(p => ({ ...p, xlsx: 100 }));
            toast.success('XLSX generated');
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
                customTitle: 'LABELS PACKING LIST',
                excludeImages: !includeImages,
                excludeHeader: true
            }, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) }))) as Blob;
            
            setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, pdf: 100 }));
            toast.success('PDF generated');
        } catch (e) {
            console.error(e);
            setProgress(p => ({ ...p, pdf: -1 }));
            toast.error('PDF generation failed');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-lg glass-panel p-10 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Label Wizard</h3>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mt-1">Batch generation for {selectedItems.length} items</p>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"><X size={24} /></button>
                </div>

                <div className="space-y-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Batch Identifier</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-(--main-color)/50 transition-all font-mono font-bold"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {/* XLSX Option */}
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-6 group hover:bg-white/10 transition-all">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shadow-inner">
                                <FileSpreadsheet size={28} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-black text-white uppercase tracking-tight">Excel Spreadsheet</h4>
                                <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Master packing list data</p>
                                {progress.xlsx >= 0 && progress.xlsx < 100 && (
                                    <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress.xlsx}%` }} />
                                    </div>
                                )}
                            </div>
                            {progress.xlsx === 100 ? (
                                <CheckCircle2 className="text-emerald-400" size={24} />
                            ) : (
                                <button 
                                    onClick={handleGenerateXLSX}
                                    disabled={progress.xlsx >= 0}
                                    className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                                >
                                    {progress.xlsx >= 0 ? 'Building...' : 'Generate'}
                                </button>
                            )}
                        </div>

                        {/* PDF Option */}
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-6 group hover:bg-white/10 transition-all">
                            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400 shadow-inner">
                                <FileText size={28} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-black text-white uppercase tracking-tight">PDF Manifest</h4>
                                <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter">Visual catalog with labels</p>
                                {progress.pdf >= 0 && progress.pdf < 100 && (
                                    <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${progress.pdf}%` }} />
                                    </div>
                                )}
                            </div>
                            {progress.pdf === 100 ? (
                                <button 
                                    onClick={() => {
                                        const a = document.createElement('a'); a.href = urls.pdf; a.download = `${name}.pdf`; a.click();
                                    }}
                                    className="p-3 rounded-full bg-red-500 text-white hover:scale-110 transition-all"
                                >
                                    <Download size={20} />
                                </button>
                            ) : (
                                <button 
                                    onClick={handleGeneratePDF}
                                    disabled={progress.pdf >= 0}
                                    className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                                >
                                    {progress.pdf >= 0 ? 'Rendering...' : 'Generate'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 text-center">
                        <p className="text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">Onyx Intelligence Logistics Engine</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
