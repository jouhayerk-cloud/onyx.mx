
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    exchangeRateAtom,
    workbookVersionAtom,
    themeAtom
} from '../../lib/atoms';
import { 
    X, Printer, Nfc, FileSpreadsheet, FileText, Download, 
    CheckCircle2, ChevronRight, ChevronLeft, Zap, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import ExcelJS from 'exceljs';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

/* ─── NFC Wizard Sub-component ─── */
export const NFCWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingNFCWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isWriting, setIsWriting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'writing' | 'success' | 'error'>('idle');

    const selectedItems = useMemo(() => {
        return inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            const normData = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
            return { ...item, normData, codes };
        });
    }, [inventory, selectedIds, exchangeRate, workbookPrefix]);

    const currentItem = selectedItems[currentIndex];
    const isSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

    const handleWrite = async () => {
        if (!isSupported) {
            toast.error("Web NFC is not supported on this browser.");
            return;
        }

        setIsWriting(true);
        setStatus('writing');

        try {
            const { normData, codes } = currentItem;
            const tagId = codes.bookBarcode;
            const materialColor = `${normData.color || ''} ${normData.material || ''}`.trim();
            const description = `${normData.shape || ''} ${normData.shortDescription || ''}`.trim();
            const wbStr = String(normData.workbook || '').replace(/v/gi, '');
            const retailTag = `${codes.bookAqCode || ''}${wbStr}${codes.bookRetail || ''}`;
            
            const nfcData = `${tagId}|${materialColor}|${description}|${retailTag}`;

            // @ts-ignore
            const ndef = new NDEFReader();
            await ndef.write(nfcData);
            
            setStatus('success');
            toast.success(`NFC Tag Written: ${tagId}`);
            
            // Auto-advance after success
            if (currentIndex < selectedItems.length - 1) {
                setTimeout(() => {
                    setCurrentIndex(prev => prev + 1);
                    setStatus('idle');
                }, 1500);
            }
        } catch (error: any) {
            console.error(error);
            setStatus('error');
            toast.error(`Write Failed: ${error.message}`);
        } finally {
            setIsWriting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-lg glass-panel p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase">NFC Provisioning</h3>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mt-1">Item {currentIndex + 1} of {selectedItems.length}</p>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"><X size={20} /></button>
                </div>

                {!currentItem ? (
                    <div className="text-center py-12">
                        <p className="text-white/40 text-sm font-bold uppercase tracking-widest">No items selected for provisioning</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Item Card Preview */}
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-6">
                            <div className="w-20 h-20 rounded-2xl bg-black/40 overflow-hidden shrink-0">
                                <img src={getCleanImageUrl(currentItem.normData.generatedPngUrl || currentItem.normData.mediaUrls?.split(',')[0])} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-1 block">{currentItem.codes.bookBarcode}</span>
                                <h4 className="text-lg font-black text-white truncate">{currentItem.normData.shape} {currentItem.normData.shortDescription}</h4>
                                <p className="text-xs text-white/40 font-bold uppercase tracking-widest">{currentItem.normData.color} {currentItem.normData.material}</p>
                            </div>
                        </div>

                        {/* Status Hub */}
                        <div className="flex flex-col items-center justify-center py-12 gap-6 relative">
                            <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-700 ${
                                status === 'writing' ? 'bg-sky-500/20 animate-pulse scale-110' : 
                                status === 'success' ? 'bg-green-500/20 scale-100' : 
                                status === 'error' ? 'bg-red-500/20' : 'bg-white/5'
                            }`}>
                                <Nfc size={48} className={status === 'writing' ? 'text-sky-400' : status === 'success' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-white/20'} />
                            </div>
                            
                            <div className="text-center">
                                <p className="text-sm font-black text-white uppercase tracking-widest">
                                    {status === 'writing' ? 'Place Tag Near Device' : 
                                     status === 'success' ? 'Provisioning Complete' : 
                                     status === 'error' ? 'Error Writing Tag' : 'Ready to Write'}
                                </p>
                                <p className="text-[10px] text-white/30 uppercase font-bold tracking-tighter mt-1">
                                    {isSupported ? 'Hardware Interface Active' : 'Web NFC Unsupported'}
                                </p>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setCurrentIndex(p => Math.max(0, p - 1))}
                                disabled={currentIndex === 0}
                                className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-0 transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            
                            <button 
                                onClick={handleWrite}
                                disabled={isWriting || !isSupported}
                                className={`flex-1 h-14 rounded-full font-black uppercase tracking-[0.2em] transition-all shadow-xl ${
                                    status === 'success' ? 'bg-green-500 text-white' : 'bg-(--main-color) text-black'
                                }`}
                            >
                                {isWriting ? 'Writing...' : status === 'success' ? 'Rewrite Tag' : 'Write NFC Tag'}
                            </button>

                            <button 
                                onClick={() => setCurrentIndex(p => Math.min(selectedItems.length - 1, p + 1))}
                                disabled={currentIndex === selectedItems.length - 1}
                                className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-0 transition-all"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    </div>
                )}
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
