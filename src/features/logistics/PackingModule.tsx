import { useAtom, useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom, TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import {
    Package,
    CheckCircle2,
    Grid,
    List,
    ChevronRight,
    Filter,
    CheckSquare,
    Square,
    FileSpreadsheet,
    FileJson,
    Maximize2,
    Send,
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';

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
const buildBatchJSON = (items: any[], workbookPrefix: string, activeLabelSize: string) => {
    const [wStr, hStr] = activeLabelSize.split('x');
    const width = parseInt(wStr) || 50;
    const height = parseInt(hStr) || 30;

    // Build one record per item, then expand by QUANTITY for print batch
    const baseRecords = items.map(item => {
        const d = item.normData;
        const c = item.codes;
        const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
        const retailStr = String(c.bookRetail || '0').padStart(4, '0');
        return {
            "TAG ID": c.bookBardcode || '',
            "DESCRIPTION": `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim().toUpperCase() || 'ONYX PIECE',
            "MATERIAL COLOR": `${d.material || 'ONYX'} ${d.color || ''}`.trim().toUpperCase(),
            "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`,
            "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
            "QUANTITY": d.quantity || 1,
            "LANDED CODE": c.bookLandCode,
            "ACQ CODE": c.bookAqCode,
            "QR URL": `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBardcode}`
        };
    });

    // Expand by QUANTITY — designer prints one label per templateData record
    const templateData = baseRecords.flatMap(r =>
        Array.from({ length: Number(r["QUANTITY"]) || 1 }, () => ({ ...r }))
    );

    return {
        ...ONYX_MASTER_TEMPLATE(width, height),
        name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
        exportedAt: new Date().toISOString(),
        templateData   // ← 'templateData' is the key importDesign() reads
    };
};

/* ─── Main Module ─── */

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);
    const deferredSearch = React.useDeferredValue(globalSearchTerm);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExportingXLSX, setIsExportingXLSX] = useState(false);
    const [isSendingToDesigner, setIsSendingToDesigner] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '50x80'>('50x30');
    const [isConfigExpanded, setIsConfigExpanded] = useState(false);
    const [vendorFilter, setVendorFilter] = useState<string | null>(null);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [activeItemIndex, setActiveItemIndex] = useState(0);

    useEffect(() => {
        if (!db) return;
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map((x: any) => ({ ...x.toJSON(), source: 'inventory', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'inventory');
                    return [...filtered, ...mapped] as any;
                });
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map((x: any) => ({ ...x.toJSON(), source: 'production', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'production');
                    return [...filtered, ...mapped] as any;
                });
            }),
        ];
        return () => subs.forEach(s => s.unsubscribe());
    }, [db, setInventory]);

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
                    const searchStr = [normData.itemId, normData.itemNumber, normData.description, normData.shape, normData.itemType, codes.bookBardcode]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!searchStr.includes(term)) return false;
                }

                if (vendorFilter) {
                    const vendorCode = String(codes.bookBardcode || '').substring(0, 2);
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
            const code = String(codes.bookBardcode || '').substring(0, 2);
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
                const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBardcode}`;
                return [c.bookBardcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
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

    /* ── Send to Designer ── */
    const handleSendToDesigner = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        setIsSendingToDesigner(true);
        const tid = toast.loading('Preparing batch for OnyxLabels...');
        try {
            const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize);

            // 1. Store in localStorage so the designer can read on load
            localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));

            // 2. Send to embedded iframe using native LOAD_DESIGN protocol
            const iframe = iframeRef.current;
            if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'LOAD_DESIGN',
                    payload: {
                        elements: batchProject.elements,
                        labelSize: batchProject.labelSize,
                        templateData: batchProject.templateData
                    }
                }, '*');
            }

            // 3. Also export XLSX simultaneously
            await handleExportXLSX();

            toast.success(`${selectedItems.length} items sent to OnyxLabels`, { id: tid });
        } catch (e: any) {
            toast.error(`Send failed: ${e.message}`, { id: tid });
        } finally {
            setIsSendingToDesigner(false);
        }
    };

    /* ── Open Designer full screen with batch ── */
    const openDesignerFullscreen = () => {
        const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize);
        localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
        window.open('https://jouhayerk-cloud.github.io/phomemo-designer/index.html', '_blank');
    };

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">

            {/* ── SLIM TOOLBAR (no title/search — those live in global topbar) ── */}
            <div className="shrink-0 flex items-center justify-between px-8 py-3 border-b border-white/5 bg-black/20 backdrop-blur-xl z-40">
                {/* Status cluster */}
                <div className="flex items-center gap-5 text-[8px] font-black uppercase tracking-widest">
                    <span className="text-white/25">{processedItems.length} artifacts</span>
                    <div className="w-px h-3 bg-white/8" />
                    <span className={selectedIds.size > 0 ? 'text-(--main-color)' : 'text-white/15'}>
                        {selectedIds.size} selected
                    </span>
                    {vendorFilter && (
                        <>
                            <div className="w-px h-3 bg-white/8" />
                            <button
                                onClick={() => setVendorFilter(null)}
                                className="flex items-center gap-1.5 text-(--main-color)/80 hover:text-(--main-color) transition-colors"
                            >
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (vendors as any)[vendorFilter]?.color || '#FFF' }} />
                                {vendorFilter} ×
                            </button>
                        </>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/8">
                        <button
                            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
                            className="p-1.5 rounded-lg text-white/25 hover:text-white hover:bg-white/5 transition-all"
                            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
                        >
                            {viewMode === 'grid' ? <List size={15} /> : <Grid size={15} />}
                        </button>
                        <div className="w-px h-3.5 bg-white/8" />
                        <button
                            onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                            className={`p-1.5 rounded-lg transition-all ${isConfigExpanded ? 'bg-(--main-color) text-black' : 'text-white/25 hover:text-white'}`}
                            title="Filters"
                        >
                            <Filter size={15} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── FILTER DRAWER ── */}
            <div className={`shrink-0 z-40 overflow-hidden transition-all duration-500 bg-black/60 backdrop-blur-3xl border-b border-white/5 ${isConfigExpanded ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0 border-none'}`}>
                <div className="px-8 py-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={selectAll}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all"
                            >
                                {selectedIds.size === processedItems.length ? <CheckSquare size={13} className="text-(--main-color)" /> : <Square size={13} />}
                                {selectedIds.size === processedItems.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <select
                            value={labelSize}
                            onChange={e => setLabelSize(e.target.value as any)}
                            className="bg-white/5 border border-white/8 px-4 py-2 rounded-xl text-[9px] font-black text-white outline-none uppercase tracking-widest cursor-pointer"
                        >
                            <option value="40x30">40×30 mm Pocket</option>
                            <option value="50x30">50×30 mm Industrial</option>
                            <option value="50x80">50×80 mm Elite Wide</option>
                        </select>
                    </div>

                    {/* Vendor chips */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setVendorFilter(null)}
                            className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border ${!vendorFilter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
                        >All</button>
                        {availableVendors.map(v => (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5 ${vendorFilter === v ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
                            >
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (vendors as any)[v]?.color || '#FFF' }} />
                                {v}
                            </button>
                        ))}
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
                        <div className="flex flex-col gap-2 content-start">
                            {processedItems.map(item => (
                                <LogisticsRow
                                    key={item.row}
                                    item={item}
                                    isSelected={selectedIds.has(String(item.row))}
                                    onToggle={() => toggleSelect(String(item.row))}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT: Glass Sidebar — Designer + Actions */}
                <div className="hidden md:flex flex-col w-[400px] xl:w-[440px] shrink-0 border-l border-white/5 bg-black/40 backdrop-blur-3xl overflow-y-auto custom-scrollbar z-30">
                    <div className="p-7 flex flex-col gap-6">

                        {/* Batch stat */}
                        <div className="bg-white/2 border border-white/5 rounded-3xl px-6 py-4 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/3 blur-3xl -mr-10 -mt-10 rounded-full" />
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Batch Selected</span>
                            <span className="text-3xl font-black text-white italic tracking-tighter">{selectedIds.size}</span>
                        </div>

                        {/* ── LABEL DESIGNER ── */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] italic">Label Designer</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={openDesignerFullscreen}
                                        className="text-[8px] font-black text-(--main-color)/50 hover:text-(--main-color) italic uppercase tracking-[0.2em] transition-colors flex items-center gap-1"
                                        title="Open full designer with current batch"
                                    >
                                        <Maximize2 size={9} /> Full Screen
                                    </button>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">
                                        {activeItem ? `${activeItemIndex + 1} / ${selectedItems.length}` : '— / —'}
                                    </span>
                                </div>
                            </div>

                            {/* iframe */}
                            <div className="aspect-video rounded-3xl bg-black/60 border border-white/8 overflow-hidden relative shadow-2xl">
                                {activeItem ? (
                                    <iframe
                                        ref={iframeRef}
                                        src="/phomemo-designer/index.html?mini=true"
                                        className="w-full h-full border-none"
                                        title="OnyxLabels Designer"
                                        allow="bluetooth"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-4 text-white/8">
                                        <Package size={56} strokeWidth={1} />
                                        <span className="text-[9px] font-black uppercase tracking-[0.5em] italic">Select artifacts to preview</span>
                                    </div>
                                )}
                            </div>

                            {/* Item navigator */}
                            {selectedItems.length > 1 && (
                                <div className="flex gap-2">
                                    <button
                                        disabled={activeItemIndex === 0}
                                        onClick={() => setActiveItemIndex(i => Math.max(0, i - 1))}
                                        className="flex-1 py-2.5 rounded-2xl bg-white/3 border border-white/5 text-[9px] font-black text-white/30 hover:text-white disabled:opacity-10 disabled:cursor-not-allowed transition-all"
                                    >‹ Prev</button>
                                    <button
                                        disabled={activeItemIndex >= selectedItems.length - 1}
                                        onClick={() => setActiveItemIndex(i => Math.min(selectedItems.length - 1, i + 1))}
                                        className="flex-1 py-2.5 rounded-2xl bg-white/3 border border-white/5 text-[9px] font-black text-white/30 hover:text-white disabled:opacity-10 disabled:cursor-not-allowed transition-all"
                                    >Next ›</button>
                                </div>
                            )}
                        </div>

                        {/* ── SEND TO DESIGNER (primary CTA) ── */}
                        <div className="flex flex-col gap-3">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] italic flex items-center gap-2">
                                <Send size={10} /> Export Pipeline
                            </span>

                            {/* Primary: Send to Designer */}
                            <button
                                onClick={handleSendToDesigner}
                                disabled={selectedIds.size === 0 || isSendingToDesigner}
                                className="w-full group relative flex items-center justify-center gap-3 py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-[0.25em] hover:bg-white/95 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                            >
                                <Send size={15} strokeWidth={2.5} />
                                {isSendingToDesigner ? 'Sending...' : `Send ${selectedIds.size > 0 ? selectedIds.size + ' items' : ''} to OnyxLabels`}
                            </button>
                            <p className="text-[7px] font-black text-white/15 uppercase tracking-widest text-center">
                                Generates XLSX + JSON · Loads batch into OnyxLabels
                            </p>

                            {/* Secondary: individual exports */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleExportXLSX}
                                    disabled={selectedIds.size === 0 || isExportingXLSX}
                                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/3 border border-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest hover:bg-white/8 hover:text-white active:scale-95 transition-all disabled:opacity-20"
                                >
                                    <FileSpreadsheet size={13} />
                                    {isExportingXLSX ? '...' : 'XLSX'}
                                </button>
                                <button
                                    onClick={handleExportJSON}
                                    disabled={selectedIds.size === 0}
                                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/3 border border-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest hover:bg-white/8 hover:text-white active:scale-95 transition-all disabled:opacity-20"
                                >
                                    <FileJson size={13} /> JSON
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
            `}</style>
        </div>
    );
};

/* ─── CARD VIEW ─── */
const LogisticsCard = ({ item, isSelected, onToggle }: any) => {
    const vendorCode = (item.codes.bookBardcode || '').split('-')[0];
    const vendorColor = (vendors as any)[vendorCode]?.color || 'transparent';

    return (
        <div
            onClick={onToggle}
            className={`group relative bg-white/2 border rounded-4xl p-4 transition-all duration-700 cursor-pointer overflow-hidden ${isSelected ? 'border-(--main-color)/40 bg-(--main-color)/5 scale-[1.02] shadow-2xl shadow-(--main-color)/10' : 'border-white/5 hover:bg-white/5 hover:border-white/10'}`}
        >
            <div className="aspect-square rounded-3xl overflow-hidden bg-black/40 mb-4 relative">
                {item.imageUrl
                    ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 group-hover:scale-105 transition-all duration-[1.5s] ease-out" alt="" />
                    : <div className="w-full h-full flex items-center justify-center opacity-5"><Package size={40} /></div>
                }
                {/* Selection indicator */}
                <div className="absolute top-3 right-3 z-10">
                    <div className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-500 ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'bg-black/60 border-white/10 backdrop-blur-md opacity-0 group-hover:opacity-100'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-black" strokeWidth={3} />}
                    </div>
                </div>
                {/* Vendor ribbon */}
                <div className="absolute top-0 left-0 px-2 py-1 rounded-br-2xl -translate-x-full group-hover:translate-x-0 transition-transform duration-500" style={{ backgroundColor: vendorColor }}>
                    <span className="text-[8px] font-black text-black tracking-widest uppercase">{vendorCode}</span>
                </div>
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] block mb-1">{item.codes.bookBardcode}</span>
                    <h3 className="text-[11px] font-black text-white/60 uppercase tracking-widest line-clamp-1 group-hover:text-white transition-colors duration-500 font-mono">
                        {item.normData.description || `${item.normData.shape || ''} ${item.normData.itemType || item.normData.type || ''}`.trim() || 'ONYX PIECE'}
                    </h3>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-[8px] font-bold text-white/25 uppercase tracking-widest italic">{item.normData.widthCm}×{item.normData.heightCm} CM</span>
                    <span className="text-sm font-black text-white font-mono tracking-tighter">${item.codes.bookRetail}</span>
                </div>
            </div>
        </div>
    );
};

/* ─── ROW VIEW ─── */
const LogisticsRow = ({ item, isSelected, onToggle }: any) => {
    const vendorCode = (item.codes.bookBardcode || '').split('-')[0];
    const vendorColor = (vendors as any)[vendorCode]?.color || 'transparent';

    return (
        <div
            onClick={onToggle}
            className={`flex items-center gap-5 p-4 rounded-2xl border transition-all duration-300 cursor-pointer group ${isSelected ? 'bg-(--main-color)/5 border-(--main-color)/30' : 'bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10'}`}
        >
            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'bg-black/40 border-white/10 opacity-40 group-hover:opacity-100'}`}>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
            </div>

            <div className="w-12 h-12 rounded-xl bg-black/60 shrink-0 overflow-hidden border border-white/5 relative group-hover:scale-105 transition-transform duration-500">
                {item.imageUrl
                    ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" alt="" />
                    : <Package className="w-full h-full p-3 opacity-5" />
                }
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: vendorColor }} />
            </div>

            <div className="flex-1 grid grid-cols-12 gap-4 items-center min-w-0">
                <div className="col-span-3 flex flex-col min-w-0">
                    <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em] leading-none mb-1 italic truncate">{item.normData.itemId}</span>
                    <span className="text-[10px] font-black text-white uppercase tracking-tight truncate font-mono">{item.codes.bookBardcode}</span>
                </div>
                <div className="col-span-6 flex flex-col min-w-0">
                    <span className="text-[11px] font-bold text-white/50 uppercase tracking-wide truncate group-hover:text-white transition-colors duration-300">{item.normData.description}</span>
                    <span className="text-[7px] font-black text-(--main-color)/50 uppercase tracking-[0.3em] mt-0.5 italic">{item.normData.material} · {item.normData.widthCm}×{item.normData.heightCm} CM</span>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-3">
                    <span className="text-sm font-black text-white font-mono tracking-tighter italic">${item.codes.bookRetail}</span>
                    <ChevronRight size={13} className="text-white/10 group-hover:text-(--main-color) group-hover:translate-x-1 transition-all duration-300 shrink-0" />
                </div>
            </div>
        </div>
    );
};
