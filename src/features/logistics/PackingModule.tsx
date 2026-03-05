
import { useAtom, useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom, TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import { Package, CheckCircle2, Printer, Grid, List, ChevronRight, QrCode, ClipboardList, Info, Settings2, Download, Layers } from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n || 0);

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isReviewMode, setIsReviewMode] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '50x80'>('40x30');
    const [isConfigExpanded, setIsConfigExpanded] = useState(true);

    // Fetch ALL inventory/production items directly to ensure module is always populated
    useEffect(() => {
        if (!db) return;
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'inventory', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'inventory');
                    return [...filtered, ...mapped] as any;
                });
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'production');
                    return [...filtered, ...mapped] as any;
                });
            }),
        ];
        return () => subs.forEach(s => s.unsubscribe());
    }, [db, setInventory]);

    const processedItems = useMemo(() => {
        return inventory.filter(item => {
            const data = normalizeInventoryData(item.data);

            if (globalSearchTerm) {
                const term = globalSearchTerm.toLowerCase().trim();
                const calculated = calculateCodesAndPrices(data, exchangeRate, workbookPrefix);
                return (
                    (data.itemId || '').toLowerCase().includes(term) ||
                    (data.itemNumber || '').toLowerCase().includes(term) ||
                    (data.description || '').toLowerCase().includes(term) ||
                    (data.vendorId || '').toLowerCase().includes(term) ||
                    (calculated.bookBardcode || '').toLowerCase().includes(term) ||
                    (String(item.row)).includes(term)
                );
            }
            return true;
        }).map(item => {
            const codes = calculateCodesAndPrices(item.data, exchangeRate, workbookPrefix);
            const normData = normalizeInventoryData(item.data);
            const baseImg = normData.generatedPngUrl || (normData.mediaUrls ? String(normData.mediaUrls).split(',')[0].trim() : null);
            const imageUrl = getCleanImageUrl(baseImg);

            return {
                ...item,
                codes,
                normData,
                imageUrl
            };
        });
    }, [inventory, globalSearchTerm, exchangeRate, workbookPrefix]);

    const totalQty = useMemo(() => {
        return processedItems.reduce((acc, it) => acc + (parseInt(it.normData.quantity) || 1), 0);
    }, [processedItems]);

    const toggleSelect = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === processedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(processedItems.map(d => String(d.row))));
        }
    };

    const generatePhomemoSheet = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        setIsGenerating(true);
        const toastId = toast.loading('Preparing Label Sheet...');

        try {
            const items = processedItems.filter(d => selectedIds.has(String(d.row)));
            for (const item of items) {
                const element = document.getElementById(`phomemo-sheet-${item.row}`);
                if (element) {
                    const canvas = await html2canvas(element, {
                        scale: 3,
                        useCORS: true,
                        backgroundColor: '#f5f5f7'
                    });
                    const link = document.createElement('a');
                    link.download = `Label_${item.normData.itemId || item.row}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    link.remove();
                }
            }
            toast.success(`${items.length} label sheets ready!`, { id: toastId });
        } catch (e) {
            toast.error('Failed to generate sheets', { id: toastId });
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const generatePhomemoExcel = async () => {
        if (selectedIds.size === 0) return toast.error('No items selected');
        const items = processedItems.filter(d => selectedIds.has(String(d.row)));
        const data = [
            ['V', 'ACQ', 'DESCRIPTION', 'Barcode', 'Q', 'KG', 'H CM', 'W CM', 'D CM', 'RETAIL', 'SPECS', 'RTCODE', 'COPIES']
        ];
        items.forEach(item => {
            const d = item.normData;
            const c = item.codes;
            data.push([
                d.vendorId || '',
                c.bookAqCode,
                d.description || '',
                c.bookBardcode,
                d.quantity || 1,
                d.weightKg || '',
                d.heightCm || '',
                d.widthCm || '',
                d.lengthCm || '',
                c.bookRetail,
                `${d.lengthCm || 0}X${d.widthCm || 0}CM`,
                c.bookLandCode,
                d.quantity || 1
            ]);
        });
        try {
            await exportToXLSX(`Phomemo_Upload_${new Date().toISOString().split('T')[0]}`, [{ name: 'Sheet1', data }]);
            toast.success('Phomemo XLSX ready!');
        } catch (error) {
            toast.error('Error generating Phomemo Excel.');
        }
    };

    const generateExcel = async () => {
        if (selectedIds.size === 0) return toast.error('No items selected');
        const items = processedItems.filter(d => selectedIds.has(String(d.row)));
        const data = [
            ['Item ID', 'TAG ID', 'Description', 'Vendor', 'Price MXN', 'Landed USD', 'Weight (kg)', 'Dimensions', 'Status']
        ];
        items.forEach(item => {
            const d = item.normData;
            data.push([
                d.itemId || item.row,
                item.codes.bookBardcode,
                d.description || '',
                d.vendorId || '',
                d.price || 0,
                item.codes.bookLanded,
                d.weightKg || 0,
                `${d.lengthCm || 0}x${d.widthCm || 0}x${d.heightCm || 0}`,
                d.status || ''
            ]);
        });
        try {
            await exportToXLSX(`Onyx_PackingList_${new Date().toISOString().split('T')[0]}`, [{ name: 'Packing List', data }]);
            toast.success('Excel generated!');
        } catch (error) {
            toast.error('Error generating Excel.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent text-(--text-color) overflow-hidden animate-in fade-in duration-700 relative">
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.02] z-0">
                <Package className="absolute top-[15%] left-[5%] w-72 h-72 -rotate-12" />
                <QrCode className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rotate-12" />
                <Printer className="absolute top-[40%] right-[5%] w-56 h-56 -rotate-6" />
            </div>

            {/* NEW: Horizontal Stackable Config Panel at Top */}
            <div className="relative z-20 flex flex-col border-b border-white/5 bg-black/20 backdrop-blur-md">
                <div className="px-10 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex gap-6 items-center">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-0.5">Types</span>
                                <span className="text-sm font-mono font-black text-white leading-none">{processedItems.length.toLocaleString('en-US')}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#6BCEBB]/60 mb-0.5">Count</span>
                                <span className="text-sm font-mono font-black text-[#6BCEBB] leading-none">{totalQty.toLocaleString('en-US')}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-(--main-color)/60 mb-0.5">Selected</span>
                                <span className="text-sm font-mono font-black text-(--main-color) leading-none">{selectedIds.size.toLocaleString('en-US')}</span>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div className="flex items-center gap-4">
                            <button onClick={handleSelectAll} className="flex items-center gap-2 group">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedIds.size === processedItems.length && processedItems.length > 0 ? 'bg-(--main-color) border-(--main-color)' : 'border-white/20 group-hover:border-white/40'}`}>
                                    {selectedIds.size === processedItems.length && processedItems.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">Select All</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View Switchers */}
                        <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 mr-4">
                            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-(--main-color) text-white shadow-lg' : 'text-white/30 hover:text-white'}`}>
                                <Grid size={16} />
                            </button>
                            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-(--main-color) text-white shadow-lg' : 'text-white/30 hover:text-white'}`}>
                                <List size={16} />
                            </button>
                            <div className="w-px h-4 bg-white/10 mx-1 self-center" />
                            <button onClick={() => setIsReviewMode(!isReviewMode)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isReviewMode ? 'bg-(--main-color) text-white shadow-lg' : 'text-white/30 hover:text-white'}`}>
                                {isReviewMode ? 'EXIT PREVIEW' : 'PREVIEW LABELS'}
                            </button>
                        </div>

                        <button onClick={() => setIsConfigExpanded(!isConfigExpanded)} className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110">
                            <Settings2 size={20} className={isConfigExpanded ? 'text-(--main-color)' : ''} />
                        </button>
                    </div>
                </div>

                {/* Collapsible Config & Actions Drawer */}
                {isConfigExpanded && (
                    <div className="px-10 pb-6 pt-2 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex flex-wrap items-end gap-10">
                            {/* Label Config */}
                            <div className="flex flex-col gap-3 min-w-[240px]">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <Layers size={12} /> STICKER ARCHITECTURE
                                </label>
                                <select
                                    value={labelSize}
                                    onChange={(e) => setLabelSize(e.target.value as any)}
                                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-(--main-color)/50 transition-all cursor-pointer w-full uppercase tracking-widest"
                                >
                                    <option value="40x30">40mm x 30m (M110 Standard)</option>
                                    <option value="50x30">50mm x 30mm (Classic)</option>
                                    <option value="50x80">50mm x 80mm (Large Label)</option>
                                </select>
                            </div>

                            <div className="w-px h-10 bg-white/5 self-end mb-1" />

                            {/* Export Actions */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={generatePhomemoSheet}
                                    disabled={selectedIds.size === 0 || isGenerating}
                                    className="h-11 px-8 rounded-xl bg-white text-black font-black uppercase tracking-[0.2em] text-[11px] flex items-center gap-3 hover:bg-(--main-color) hover:text-white transition-all disabled:opacity-20 shadow-xl active:scale-95"
                                >
                                    <Printer size={16} />
                                    {isGenerating ? 'RENDERING...' : 'PRINT PNGS'}
                                </button>

                                <button
                                    onClick={generatePhomemoExcel}
                                    disabled={selectedIds.size === 0}
                                    className="h-11 px-6 rounded-xl bg-white/5 border border-white/10 text-[#00AEEF] font-black uppercase tracking-[0.15em] text-[10px] flex items-center gap-2 hover:bg-white/10 transition-all disabled:opacity-20"
                                >
                                    <Download size={15} /> BULK XLSX
                                </button>

                                <button
                                    onClick={generateExcel}
                                    disabled={selectedIds.size === 0}
                                    className="h-11 px-6 rounded-xl bg-white/5 border border-white/10 text-white/50 font-black uppercase tracking-[0.15em] text-[10px] flex items-center gap-2 hover:bg-white/10 transition-all disabled:opacity-20"
                                >
                                    <ClipboardList size={15} /> PACKING LIST
                                </button>
                            </div>

                            <div className="ml-auto flex items-center gap-3 bg-(--main-color)/5 border border-(--main-color)/10 rounded-xl px-4 py-2.5">
                                <Info size={14} className="text-(--main-color)" />
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest leading-none">
                                    Store PNGs in downloads. Open <span className="text-(--main-color)">Print Master</span> app and select <span className="text-(--main-color)">Scan</span> mode.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-10 pt-8 pb-32 relative z-10">
                {isReviewMode ? (
                    <div className="flex flex-wrap justify-center gap-12 mt-6">
                        {selectedIds.size === 0 ? (
                            <div className="flex flex-col items-center justify-center py-40 opacity-20">
                                <QrCode size={80} strokeWidth={1} className="mb-6" />
                                <p className="text-sm font-black uppercase tracking-[0.3em]">Select items to preview</p>
                            </div>
                        ) : (
                            processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                                <div key={item.row} className="scale-75 -m-20 origin-top bg-white rounded-[40px] shadow-2xl border border-white/20 overflow-hidden transition-all hover:scale-[0.78]">
                                    <PhomemoSheetTemplate item={item} size={labelSize} />
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <>
                        {processedItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-40 opacity-20">
                                <Package size={80} strokeWidth={1} className="mb-6" />
                                <p className="text-sm font-black uppercase tracking-[0.3em]">Inventory Pipeline Empty</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                                {processedItems.map(item => (
                                    <ItemCard key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e) => toggleSelect(String(item.row), e)} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 max-w-6xl mx-auto">
                                {processedItems.map(item => (
                                    <ItemRow key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e) => toggleSelect(String(item.row), e)} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Hidden Templates for html2canvas */}
            <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none" style={{ transform: 'translateX(-200%)' }}>
                {processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                    <PhomemoSheetTemplate key={item.row} item={item} size={labelSize} />
                ))}
            </div>
        </div>
    );
};

const ItemCard: React.FC<{ item: any; isSelected: boolean; onToggle: (e: React.MouseEvent) => void }> = ({ item, isSelected, onToggle }) => {
    const d = item.normData;
    const vendorColor = vendors[d.vendorId as keyof typeof vendors]?.color || 'var(--main-color)';
    return (
        <div onClick={onToggle} className={`group relative flex flex-col bg-white/5 border rounded-[24px] overflow-hidden transition-all duration-500 cursor-pointer backdrop-blur-md ${isSelected ? 'border-(--main-color) bg-(--main-color)/5 shadow-lg shadow-(--main-color)/10 ring-1 ring-(--main-color)/20' : 'border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
            <div className="aspect-square w-full relative overflow-hidden bg-black/40">
                {item.imageUrl ? <img src={item.imageUrl} alt={d.itemId} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={48} /></div>}
                <div className="absolute top-3 right-3">
                    <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color) scale-110' : 'bg-black/60 border-white/20 group-hover:border-white/40'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                </div>
                <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <span style={{ backgroundColor: vendorColor }} className="px-2.5 py-0.5 rounded-md text-[8px] font-black text-white uppercase tracking-widest shadow-lg">{d.vendorId}</span>
                </div>
                <div className="absolute top-3 left-3">
                    <span className="bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-mono text-(--main-color) border border-(--main-color)/30">{item.codes.bookBardcode}</span>
                </div>
            </div>
            <div className="p-4 flex-1 flex flex-col">
                <p className="text-[11px] font-black text-white/30 uppercase tracking-widest mb-1">{d.itemId}</p>
                <p className="text-[13px] font-black text-white leading-tight line-clamp-2 uppercase flex-1 mb-4">{d.description}</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-[12px] font-black text-(--main-color)">{fmtMXN(d.price)}</span>
                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{d.status}</span>
                </div>
            </div>
        </div>
    );
};

const ItemRow: React.FC<{ item: any; isSelected: boolean; onToggle: (e: React.MouseEvent) => void }> = ({ item, isSelected, onToggle }) => {
    const d = item.normData;
    const vendorColor = vendors[d.vendorId as keyof typeof vendors]?.color || 'var(--main-color)';
    return (
        <div onClick={onToggle} className={`flex items-center gap-6 p-3 rounded-xl border transition-all cursor-pointer backdrop-blur-sm ${isSelected ? 'bg-(--main-color)/10 border-(--main-color)/30 shadow-lg' : 'bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10'}`}>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'border-white/10 group-hover:border-white/30'}`}>{isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}</div>
            <div className="w-12 h-12 rounded-lg bg-black/40 shrink-0 overflow-hidden border border-white/10">
                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-3 opacity-10" />}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-10">
                <div className="w-32">
                    <span className="text-[11px] font-black text-(--main-color) tracking-widest">{d.itemId}</span>
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{d.status}</p>
                </div>
                <div className="flex-1">
                    <p className="text-[13px] text-white font-black truncate uppercase tracking-tight">{d.description}</p>
                </div>
                <div className="w-24">
                    <span style={{ backgroundColor: vendorColor }} className="text-[9px] font-black text-white uppercase tracking-widest px-2.5 py-0.5 rounded-md">{d.vendorId}</span>
                </div>
            </div>
            <div className="text-right shrink-0 px-6">
                <p className="text-[12px] font-mono font-black text-(--main-color) tracking-widest">{item.codes.bookBardcode}</p>
                <p className="text-[10px] font-bold text-white/30">{fmtMXN(d.price)}</p>
            </div>
        </div>
    );
};

const PhomemoSheetTemplate: React.FC<{ item: any, size: string }> = ({ item, size }) => {
    const d = item.normData;
    const tagId = item.codes?.bookBardcode || '';

    // Safety guard: if no tag ID or calculation failed, don't attempt to render the sheet
    if (!tagId || tagId === '-' || tagId === 'N/A') {
        return <div className="p-10 text-white/20 text-[10px] uppercase font-black">Data Missing for {item.row}</div>;
    }

    const [wStr, hStr] = (size || '40x30').split('x');
    const widthMm = parseInt(wStr) || 40;
    const heightMm = parseInt(hStr) || 30;
    const vendorId = d.vendorId || 'ONYX';

    // Ensure tagId is long enough before substring
    const workbookPrefix = tagId.length > 5 ? tagId.substring(2, 5) : '000';
    const itemNum = String(d.itemNumber || '00');
    const priceCents = Math.floor((parseFloat(String(d.price)) || 0) % 100).toString().padStart(2, '0');
    const topCode = `${workbookPrefix}${itemNum.padStart(2, '0')}${priceCents}0`;

    return (
        <div
            id={`phomemo-sheet-${item.row}`}
            style={{
                width: '600px',
                minHeight: '1000px',
                backgroundColor: '#f5f5f7',
                padding: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontFamily: 'sans-serif',
                position: 'relative'
            }}
        >
            <div style={{ width: '520px', height: `${(heightMm / widthMm) * 520}px`, backgroundColor: '#fff', borderRadius: '24px', padding: '45px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', marginBottom: '80px', marginTop: '100px', boxShadow: '0 4px 40px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '90px', fontWeight: 900 }}>{vendorId}</span>
                        <span style={{ fontSize: '40px', fontWeight: 600 }}>MMA</span>
                    </div>
                    <div style={{ fontSize: '50px', fontWeight: 700 }}>{topCode}</div>
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, margin: '20px 0', textTransform: 'uppercase' }}>{d.description}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Barcode value={tagId} width={4} height={120} displayValue={false} margin={0} />
                    <div style={{ fontSize: '38px', fontWeight: 900, letterSpacing: '8px', marginTop: '20px' }}>{tagId}</div>
                </div>
            </div>
            <div style={{ width: '100%', padding: '0 20px', marginBottom: '40px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div style={{ fontSize: '16px' }}>Label: 40*30 xls</div>
                    <div style={{ fontSize: '16px' }}>Model: M110</div>
                </div>
            </div>
            <div style={{ width: '100%', padding: '0 20px', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>Save & Scan in Print Master</div>
                <QRCodeSVG value={`https://onyx.mx/item/${tagId}`} size={120} />
            </div>
        </div>
    );
};
