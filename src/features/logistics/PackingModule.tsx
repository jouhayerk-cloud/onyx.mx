import { useAtom, useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom, TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import {
    Package,
    CheckCircle2,
    Printer,
    Grid,
    List,
    ChevronRight,
    Download,
    Bluetooth,
    Activity,
    Filter,
    CheckSquare,
    Square,
    Search,
    X,
    FileSpreadsheet,
    Smartphone,
    Monitor,
    Maximize2,
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { M110Driver } from '../../utils/PhomemoM110';

/* ─── Main Module ─── */

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);
    const deferredSearch = React.useDeferredValue(globalSearchTerm);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExportingXLSX, setIsExportingXLSX] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '50x80'>('50x30');
    const [isConfigExpanded, setIsConfigExpanded] = useState(false);
    const [vendorFilter, setVendorFilter] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [isConnectingBLE, setIsConnectingBLE] = useState(false);
    const m110Driver = useRef<M110Driver>(new M110Driver());
    const [isConnectedBLE, setIsConnectedBLE] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [activeItemIndex, setActiveItemIndex] = useState(0);

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
        try {
            return inventory.map(item => {
                const normData = normalizeInventoryData(item?.data || {});
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                const baseImg = normData.generatedPngUrl || (normData.mediaUrls ? String(normData.mediaUrls).split(',')[0].trim() : null);
                return { ...item, codes, normData, imageUrl: getCleanImageUrl(baseImg) };
            }).filter(item => {
                const { normData, codes } = item;
                if (!normData || !codes) return false;

                const combinedSearch = (deferredSearch || search || '').toLowerCase().trim();
                if (combinedSearch) {
                    const searchStr = [normData.itemId, normData.itemNumber, normData.description, normData.shape, normData.itemType, codes.bookBardcode]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!searchStr.includes(combinedSearch)) return false;
                }

                if (vendorFilter) {
                    const vendorCode = String(codes.bookBardcode || '').substring(0, 2);
                    if (vendorCode !== vendorFilter) return false;
                }

                return true;
            });
        } catch (e) {
            console.error('Critical processedItems error:', e);
            return [];
        }
    }, [inventory, deferredSearch, exchangeRate, workbookPrefix, vendorFilter, search]);

    const availableVendors = useMemo(() => {
        const vendorSet = new Set<string>();
        inventory.forEach(item => {
            const codes = calculateCodesAndPrices(normalizeInventoryData(item.data), exchangeRate, workbookPrefix);
            const code = String(codes.bookBardcode || '').substring(0, 2);
            if (code && (vendors as any)[code]) vendorSet.add(code);
        });
        return Array.from(vendorSet).sort();
    }, [inventory, exchangeRate, workbookPrefix]);

    // Items selected for designer / print
    const filteredItems = useMemo(
        () => processedItems.filter(item => selectedIds.has(String(item.row))),
        [processedItems, selectedIds]
    );
    const activeItem = filteredItems[activeItemIndex] || null;

    // Clamp index
    useEffect(() => {
        if (activeItemIndex >= filteredItems.length && filteredItems.length > 0) {
            setActiveItemIndex(filteredItems.length - 1);
        }
    }, [filteredItems.length, activeItemIndex]);

    // Sync active item data to designer iframe
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !activeItem) return;
        const timer = setTimeout(() => {
            iframe.contentWindow?.postMessage({
                type: 'UPDATE_DATA',
                payload: { templateData: [{ ...activeItem.normData, ...activeItem.codes }] }
            }, '*');
        }, 600);
        return () => clearTimeout(timer);
    }, [activeItem, activeItemIndex]);

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

    const handleBLEConnect = async () => {
        setIsConnectingBLE(true);
        try {
            const name = await m110Driver.current.connect();
            setIsConnectedBLE(true);
            toast.success(`Connected to ${name}`);
        } catch (e: any) {
            setIsConnectedBLE(false);
            if (e.name !== 'NotFoundError') toast.error(`BLE Connection Failed: ${e.message}`);
        } finally {
            setIsConnectingBLE(false);
        }
    };

    const handlePrintBLE = async () => {
        if (!isConnectedBLE || !m110Driver.current.isConnected())
            return toast.error('Printer not connected. Connect via Bluetooth first.');
        if (selectedIds.size === 0) return toast.error('Select items first');

        setIsGenerating(true);
        const tid = toast.loading(`Printing ${selectedIds.size} labels...`);
        try {
            const items = processedItems.filter(d => selectedIds.has(String(d.row)));
            for (const item of items) {
                const element = document.getElementById(`phomemo-sheet-${item.row}`);
                if (element) {
                    const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#fff' });
                    await m110Driver.current.printCanvas(canvas);
                    toast.loading(`Printing ${item.codes.bookBardcode}...`, { id: tid });
                }
            }
            toast.success('Batch Print Complete!', { id: tid });
        } catch (e: any) {
            toast.error(`Print Error: ${e.message}`, { id: tid });
        } finally {
            setIsGenerating(false);
        }
    };

    const downloadLabels = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        setIsGenerating(true);
        const tid = toast.loading('Exporting High-Fidelity Artifacts...');
        try {
            const items = processedItems.filter(d => selectedIds.has(String(d.row)));
            for (const item of items) {
                const element = document.getElementById(`phomemo-sheet-${item.row}`);
                if (element) {
                    const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
                    const link = document.createElement('a');
                    link.download = `OnyxLabel_${item.normData.itemId}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
            toast.success(`${items.length} stickers saved`, { id: tid });
        } catch (e) {
            toast.error('Render failed', { id: tid });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExportXLSX = async () => {
        if (isExportingXLSX || selectedIds.size === 0) return;
        setIsExportingXLSX(true);
        const tid = toast.loading('Generating Export Artifact...');
        try {
            const itemsToExport = processedItems.filter(item => selectedIds.has(String(item.row)));
            const rows = itemsToExport.map(item => {
                const d = item.normData;
                const c = item.codes;
                const combinedDesc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
                const combinedMatColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
                const combinedSizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                const combinedRetail = `${c.bookAqCode}-${bookv}${retailStr}`;
                const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBardcode}`;
                return [c.bookBardcode, combinedDesc, combinedMatColor, combinedSizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, combinedRetail, qrUrl];
            });

            const sheets = [{
                name: 'Packing List',
                data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }];

            await exportToXLSX(`Packing_List_${new Date().toISOString().split('T')[0]}`, sheets);
            toast.success('XLSX generated successfully', { id: tid });
        } catch (error: any) {
            toast.error(`Export failed: ${error.message}`, { id: tid });
        } finally {
            setIsExportingXLSX(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">

            {/* ── GLASS NAV ── */}
            <nav className="z-50 shrink-0 px-8 py-5 flex items-center justify-between bg-black/40 backdrop-blur-3xl border-b border-white/5 sticky top-0">
                <div className="flex items-center gap-8">
                    {/* Brand */}
                    <div className="flex items-center gap-4">
                        <div className="relative group cursor-pointer">
                            <div className="absolute -inset-2 bg-(--main-color)/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <div className="relative w-11 h-11 rounded-2xl bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                                <Package size={20} />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-lg font-black text-white uppercase tracking-tighter leading-none italic">
                                Packing <span className="text-(--main-color)/60">Module</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[8px] font-black text-(--main-color) uppercase tracking-[0.3em] font-mono">Logistics Hub v1.17</span>
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] font-mono">{processedItems.length} artifacts</span>
                            </div>
                        </div>
                    </div>

                    {/* Liquid glass search */}
                    <div className="hidden lg:flex items-center group relative min-w-[260px]">
                        <div className="absolute left-4 text-white/20 group-focus-within:text-(--main-color) transition-colors z-10 pointer-events-none">
                            <Search size={13} />
                        </div>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="SCAN OR SEARCH..."
                            className="w-full h-10 bg-white/5 border border-white/5 focus:border-(--main-color)/40 focus:bg-white/10 rounded-2xl pl-10 pr-8 text-[9px] font-black uppercase tracking-widest text-white placeholder:text-white/10 transition-all outline-none"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 p-1 text-white/20 hover:text-white transition-colors">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Live status pills */}
                    <div className="hidden xl:flex items-center bg-white/2 rounded-2xl border border-white/5 overflow-hidden text-[8px] font-black uppercase tracking-widest">
                        <div className="flex items-center gap-2 px-3 py-2 border-r border-white/5">
                            <div className={`w-1.5 h-1.5 rounded-full transition-all ${isConnectedBLE ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-white/10'}`} />
                            <span className={isConnectedBLE ? 'text-green-400' : 'text-white/20'}>BLE</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 border-r border-white/5">
                            <span className={selectedIds.size > 0 ? 'text-(--main-color)' : 'text-white/20'}>{selectedIds.size} ready</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2">
                            <span className="text-white/20">{processedItems.length} total</span>
                        </div>
                    </div>

                    {/* Action icons */}
                    <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/8">
                        <button
                            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
                            className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all"
                            title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                        >
                            {viewMode === 'grid' ? <List size={16} /> : <Grid size={16} />}
                        </button>
                        <div className="w-px h-4 bg-white/10" />
                        <button
                            onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                            className={`p-2 rounded-xl transition-all ${isConfigExpanded ? 'bg-(--main-color) text-black shadow-lg' : 'text-white/30 hover:text-white'}`}
                            title="Filters & Config"
                        >
                            <Filter size={16} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── FILTER DRAWER ── */}
            <div className={`shrink-0 z-40 overflow-hidden transition-all duration-500 bg-black/60 backdrop-blur-3xl border-b border-white/5 ${isConfigExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 border-none'}`}>
                <div className="px-8 py-6 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={selectAll}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all"
                            >
                                {selectedIds.size === processedItems.length ? <CheckSquare size={13} className="text-(--main-color)" /> : <Square size={13} />}
                                {selectedIds.size === processedItems.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{selectedIds.size} selected</span>
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
                            className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${!vendorFilter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
                        >All Vendors</button>
                        {availableVendors.map(v => (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${vendorFilter === v ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20'}`}
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
                <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
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
                        <div className="flex flex-col gap-2.5 content-start">
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

                {/* RIGHT: Glass sidebar — designer + execution */}
                <div className="hidden md:flex flex-col w-[400px] xl:w-[440px] shrink-0 border-l border-white/5 bg-black/40 backdrop-blur-3xl overflow-y-auto custom-scrollbar shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-30">
                    <div className="p-7 flex flex-col gap-7">

                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/2 border border-white/5 rounded-3xl p-5 flex flex-col gap-2 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-14 h-14 bg-white/5 blur-2xl -mr-7 -mt-7 rounded-full" />
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Batch</span>
                                <span className="text-3xl font-black text-white italic tracking-tighter">{selectedIds.size}</span>
                            </div>
                            <div className="bg-white/2 border border-white/5 rounded-3xl p-5 flex flex-col gap-2 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-14 h-14 bg-(--main-color)/5 blur-2xl -mr-7 -mt-7 rounded-full" />
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Est. Value</span>
                                <span className="text-2xl font-black text-(--main-color) italic tracking-tighter">
                                    ${filteredItems.reduce((acc, i) => acc + parseFloat(i.codes.bookRetail || '0'), 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Phomymo Designer iframe */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] italic">Label Designer</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => window.open('/phomemo-designer/index.html', '_blank')}
                                        className="text-[8px] font-black text-(--main-color)/50 hover:text-(--main-color) italic uppercase tracking-[0.2em] transition-colors flex items-center gap-1"
                                    >
                                        <Maximize2 size={9} /> Full Screen
                                    </button>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">
                                        {activeItem ? `${activeItemIndex + 1} / ${filteredItems.length}` : '— / —'}
                                    </span>
                                </div>
                            </div>

                            {/* iframe container */}
                            <div className="aspect-video rounded-3xl bg-black border border-white/8 overflow-hidden relative shadow-2xl">
                                {activeItem ? (
                                    <iframe
                                        ref={iframeRef}
                                        src="/phomemo-designer/index.html?mini=true"
                                        className="w-full h-full border-none"
                                        title="Phomymo Label Designer"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-4 text-white/10">
                                        <Package size={48} strokeWidth={1} />
                                        <span className="text-[9px] font-black uppercase tracking-[0.5em] italic">Select an Artifact</span>
                                    </div>
                                )}
                            </div>

                            {/* Item nav */}
                            <div className="flex gap-2">
                                <button
                                    disabled={!activeItem || activeItemIndex === 0}
                                    onClick={() => setActiveItemIndex(i => Math.max(0, i - 1))}
                                    className="flex-1 py-3 rounded-2xl bg-white/3 border border-white/5 text-[9px] font-black text-white/30 hover:text-white disabled:opacity-10 disabled:cursor-not-allowed transition-all"
                                >‹ Prev</button>
                                <button
                                    disabled={!activeItem || activeItemIndex >= filteredItems.length - 1}
                                    onClick={() => setActiveItemIndex(i => Math.min(filteredItems.length - 1, i + 1))}
                                    className="flex-1 py-3 rounded-2xl bg-white/3 border border-white/5 text-[9px] font-black text-white/30 hover:text-white disabled:opacity-10 disabled:cursor-not-allowed transition-all"
                                >Next ›</button>
                            </div>
                        </div>

                        {/* BLE connect */}
                        <button
                            onClick={handleBLEConnect}
                            className={`w-full py-3.5 rounded-2xl border flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.25em] transition-all ${isConnectedBLE ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-white/2 border-white/5 text-white/20 hover:text-white/60 hover:border-white/15'}`}
                        >
                            <Smartphone size={14} />
                            {isConnectingBLE ? 'Scanning...' : isConnectedBLE ? 'Sync Stable · M110' : 'Initialize BLE Printer'}
                        </button>

                        {/* Execution zone */}
                        <div className="flex flex-col gap-3">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] italic flex items-center gap-2">
                                <Monitor size={11} /> Execution
                            </span>

                            <button
                                onClick={handlePrintBLE}
                                disabled={selectedIds.size === 0 || !isConnectedBLE}
                                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-[0.25em] hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Bluetooth size={15} strokeWidth={3} />
                                {isGenerating ? 'Printing...' : 'Print Batch · BLE'}
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleExportXLSX}
                                    disabled={selectedIds.size === 0 || isExportingXLSX}
                                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/3 border border-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest hover:bg-white/8 hover:text-white active:scale-95 transition-all disabled:opacity-20"
                                >
                                    <FileSpreadsheet size={13} /> XLSX
                                </button>
                                <button
                                    onClick={downloadLabels}
                                    disabled={selectedIds.size === 0 || isGenerating}
                                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/3 border border-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest hover:bg-white/8 hover:text-white active:scale-95 transition-all disabled:opacity-20"
                                >
                                    <Download size={13} /> PNG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden html2canvas scratchpad */}
            <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none" style={{ width: '4000px', height: '4000px' }}>
                {processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                    <PhomemoSheetTemplate key={item.row} item={item} size={labelSize} />
                ))}
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
                {/* Vendor tag */}
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

/* ─── PHOMEMO LABEL TEMPLATE (html2canvas render target — hidden) ─── */
const PhomemoSheetTemplate: React.FC<{ item: any; size: string }> = ({ item, size }) => {
    const d = item.normData;
    const tagId = item.codes?.bookBardcode || 'ONYX-VOID';
    const tagUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagId}`;

    const [wStr, hStr] = (size || '50x30').split('x');
    const widthMm = parseFloat(wStr) || 50;
    const heightMm = parseFloat(hStr) || 30;
    const baseW = 600;
    const baseH = Math.round((heightMm / widthMm) * baseW);
    const spacedTagId = tagId.split('').join('  ');
    const dims = `${d.widthCm || 0}×${d.lengthCm || 0}×${d.heightCm || 0} CM`;

    return (
        <div
            id={`phomemo-sheet-${item.row}`}
            style={{ width: `${baseW}px`, height: `${baseH}px`, backgroundColor: '#FFF', display: 'flex', color: '#000', overflow: 'hidden', position: 'relative', fontFamily: 'Outfit, "DM Sans", system-ui, sans-serif' }}
        >
            {/* Sidebar */}
            <div style={{ width: '48px', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontSize: '20px', fontWeight: 900, letterSpacing: '0.4em', color: '#FFF' }}>
                    MADE IN MEXICO
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '18px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '22px', fontStyle: 'italic', fontWeight: 800, opacity: 0.6 }}>{tagId}</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, opacity: 0.8 }}>{dims}</span>
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '20px', fontWeight: 800, textTransform: 'uppercase', opacity: 0.9 }}>{d.material || 'ONYX'} · {d.color || 'NATURAL'}</div>
                            <div style={{ fontSize: '16px', fontWeight: 800, opacity: 0.5 }}>MASS: {d.weightKg || '--'} KG</div>
                        </div>
                        <div style={{ width: '72px', height: '72px', padding: '5px', border: '3px solid #000', borderRadius: '10px', backgroundColor: '#FFF' }}>
                            <QRCodeSVG value={tagUrl} size={62} level="H" />
                        </div>
                    </div>
                </div>

                {/* Barcode zone */}
                <div style={{ height: '45%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', borderTop: '3px solid #000', paddingTop: '12px' }}>
                    <div style={{ transform: 'scale(1.5)', transformOrigin: 'bottom', marginBottom: '22px' }}>
                        <Barcode value={tagId} width={2.2} height={65} displayValue={false} margin={0} background="transparent" lineColor="#000" />
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '0.4em', textTransform: 'uppercase', width: '100%', textAlign: 'center', lineHeight: 1 }}>
                        {spacedTagId}
                    </div>
                </div>
            </div>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
        </div>
    );
};
