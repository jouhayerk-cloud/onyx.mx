import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { usePinchZoomRegion } from '../../lib/usePinchZoomRegion';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    storeSearchTermAtom, 
    storeActiveVendorFilterAtom, 
    storeViewModeAtom,
    storeShoppingBagAtom,
    isStoreBagOpenAtom,
    activeViewAtom,
    liveExchangeRateAtom,
    exchangeRateAtom,
    userAtom,
    isStoreSelectionModeAtom,
    selectedStoreIdsAtom,
    showroomTabAtom
} from '../../lib/atoms';
import { vendors, DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import { normalizeInventoryData, getCleanImageUrl, calculateCodesAndPrices, cmToImperial } from '../../lib/utils';
import { 
    ShoppingBag, Search, Filter, LayoutGrid, LayoutList, Layout, 
    ChevronRight, ArrowRight, X, Heart, Star, Info, Trash2, Box, PackageSearch,
    ChevronLeft, Plus, Check, Minus, Maximize2, Zap,
    Edit3, Ruler, Layers, CloudUpload, Pencil, Tag, FileText, Upload, Video, Share2, ScanBarcode, Download, CheckCircle,
    Store, Send, RotateCcw, PackagePlus, Archive, RefreshCw, Loader2
} from 'lucide-react';
import { exportCatalogPdf } from '../../lib/pdfExport';
import { ExportWizard } from '../../components/ExportWizard';
import { useTranslation } from '../../lib/hooks';
import toast from '../onyxIsland/notify/toast';
import { ShoppingBagDrawer } from '../store/ShoppingBagDrawer';
import { atom } from 'jotai';
import { tr } from '../../lib/i18n';
import { islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { 
    fetchShowroomItems, 
    transferShowroomItemToInventory, 
    discardShowroomItem, 
    restoreShowroomItem,
    type ShowroomItem 
} from '../../lib/showroomService';
import { AddShow } from './AddShow';

// Fullscreen gallery state
const ActiveGalleryIndexAtom = atom(0);
const ActiveGalleryMediaAtom = atom<string[]>([]);

const isVideoFile = (url: string) => {
    const u = url.toLowerCase();
    return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm');
};

const StarRating = ({ rating, onChange, size = 12 }: { rating: number; onChange: (r: number) => void; size?: number }) => (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => onChange(s)} className="transition-all hover:scale-125 group">
                <Star
                    size={size}
                    fill={s <= rating ? 'var(--main-color)' : 'none'}
                    className={s <= rating ? 'text-(--main-color) drop-shadow-[0_0_5px_var(--main-color)]' : 'text-white/10 group-hover:text-white/40'}
                    strokeWidth={s <= rating ? 0 : 2}
                />
            </button>
        ))}
    </div>
);

export function ShowroomView() {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
    const [tab, setTab] = useAtom(showroomTabAtom);
    
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom);
    const setView = useSetAtom(activeViewAtom);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    const user = useAtomValue(userAtom);
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const isVendor = user?.role === 'Vendor';
    const isClient = user?.role?.startsWith('Client');
    const isAdminOrDev = user?.role === 'Admin' || user?.role === 'Developer';

    // Showroom database state
    const [showroomItems, setShowroomItems] = useState<ShowroomItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    // Selection & Export
    const [isSelectionMode, setIsSelectionMode] = useAtom(isStoreSelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedStoreIdsAtom);
    const [isExporting, setIsExporting] = useState(false);
    const [showExportConfig, setShowExportConfig] = useState(false);
    const [exportTitle, setExportTitle] = useState("Showroom Catalog");
    const [exportMethod, setExportMethod] = useState<'grid' | 'single'>('grid');
    const [exportType, setExportType] = useState<'regular' | 'catalog'>('regular');
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');

    // Fetch items from dedicated showroom_items table
    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchShowroomItems({
                role: user?.role,
                vendorName: user?.name,
                statusFilter: tab === 'archive' ? 'discarded' : 'active',
                vendorFilter: vendorFilter,
                search: search,
            });
            setShowroomItems(data);
        } catch (err: any) {
            console.warn('[Showroom] Error loading items:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.role, user?.name, tab, vendorFilter, search]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    // Format showroom items into unified store cards structure
    const formattedItems = useMemo(() => {
        return showroomItems.map(it => {
            const mediaList = it.media_urls ? it.media_urls.split(',').map(s => s.trim()).filter(Boolean) : [];
            const primaryImg = it.img_clean || mediaList[0] || '';
            const rate = liveRate || exchangeRate || DEFAULT_EXCHANGE_RATE;
            const costMxn = it.cost_mxn || 0;
            const costUsd = it.cost_usd || (costMxn > 0 ? Math.round(costMxn / rate) : 0);
            const retail = it.retail_price || (costMxn > 0 ? Math.round(costMxn * 2.5) : 0);

            return {
                id: it.id,
                row: it.id,
                raw: it,
                data: {
                    id: it.id,
                    itemId: it.item_id || `${it.vendor_id}-SHOW`,
                    vendorId: it.vendor_id,
                    vendor_id: it.vendor_id,
                    status: it.status,
                    shape: it.shape || 'Unknown',
                    type: it.type || '',
                    shortDescription: it.type || it.shape || 'Piece',
                    description: it.description || '',
                    material: it.material || '',
                    color: it.color || '',
                    widthCm: it.width_cm || 0,
                    lengthCm: it.length_cm || 0,
                    heightCm: it.height_cm || 0,
                    weightKg: it.weight_kg || 0,
                    price: costMxn,
                    price_mxn: costMxn,
                    costUsd: costUsd,
                    landedPrice: it.landed_cost,
                    retailPrice: retail,
                    mediaUrls: it.media_urls,
                    generatedPngUrl: it.img_clean,
                    bookBarcode: it.book_barcode || '',
                    bookAqCode: it.book_aq_code || '',
                    bookLandCode: it.book_land_code || '',
                }
            };
        });
    }, [showroomItems, liveRate, exchangeRate]);

    const activeVendors = useMemo(() => {
        return Array.from(new Set(showroomItems.map(i => i.vendor_id).filter(Boolean))).sort();
    }, [showroomItems]);

    // Handle moving item to main inventory (Lot pass)
    const handleMoveToInventory = async (item: any) => {
        if (!item?.raw) return;
        const tid = toast.loading(tr("Passing lot to Main Inventory..."));
        setActionInProgress(item.id);
        try {
            const res = await transferShowroomItemToInventory(item.raw, 'v826', user);
            toast.success(tr(`Passed to Inventory! Tag: ${res.barcode}`), { id: tid });
            setSelectedItem(null);
            await loadItems();
        } catch (err: any) {
            toast.error(err.message || tr("Transfer failed"), { id: tid });
        } finally {
            setActionInProgress(null);
        }
    };

    // Discard item from live view
    const handleDiscard = async (item: any) => {
        const tid = toast.loading(tr("Discarding from Showroom..."));
        setActionInProgress(item.id);
        try {
            await discardShowroomItem(item.id);
            toast.success(tr("Item discarded without deletion"), { id: tid });
            setSelectedItem(null);
            await loadItems();
        } catch (err: any) {
            toast.error(err.message || tr("Discard failed"), { id: tid });
        } finally {
            setActionInProgress(null);
        }
    };

    // Restore item back to active showroom
    const handleRestore = async (item: any) => {
        const tid = toast.loading(tr("Restoring to active Showroom..."));
        setActionInProgress(item.id);
        try {
            await restoreShowroomItem(item.id);
            toast.success(tr("Item restored to active Showroom"), { id: tid });
            setSelectedItem(null);
            await loadItems();
        } catch (err: any) {
            toast.error(err.message || tr("Restore failed"), { id: tid });
        } finally {
            setActionInProgress(null);
        }
    };

    const toggleSelection = (item: any) => {
        const id = item.row ?? item.data?.id;
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleSelectAll = () => {
        if (formattedItems.length > 0 && formattedItems.every(i => selectedIds.includes(i.row))) {
            setSelectedIds([]);
        } else {
            setSelectedIds(formattedItems.map(i => i.row));
        }
    };

    const toggleBag = (item: any) => {
        const isInBag = bag.some(b => b.row === item.row);
        if (isInBag) {
            setBag(prev => prev.filter(b => b.row !== item.row));
            toast.success(tr("Removed from bag"));
        } else {
            setBag(prev => [...prev, item]);
            toast.success(tr("Added to bag"), {
                icon: '🛍️',
                style: { background: 'black', color: 'var(--main-color)', border: '1px solid var(--main-color)' }
            });
        }
    };

    const handleStartExport = async (cfg: any) => {
        if (selectedIds.length === 0) return toast.error(tr("No items selected for PDF."));
        setIsExporting(true);
        try {
            const itemsToExport = selectedIds.map(id => {
                const item = formattedItems.find(i => i.row === id);
                if (!item) return null;
                const norm = item.data;
                const raw = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                const main = norm.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
                let imgs = [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];

                const priceMxn = Number(norm.price || 0);
                const priceUsd = Number(norm.costUsd || 0);

                return {
                    data: norm,
                    codes: {
                        bookBarcode: norm.bookBarcode || norm.itemId,
                        bookAqCode: norm.bookAqCode,
                        bookLandCode: norm.bookLandCode,
                        bookRetail: norm.retailPrice,
                        primaryPriceLabel: exportType === 'catalog' ? 'USD RETAIL' : 'ACQUISITION COST',
                        primaryPriceValue: exportType === 'catalog' ? `$${norm.retailPrice} USD` : `$${priceMxn} MXN / $${priceUsd} USD`
                    },
                    images: imgs,
                    exportType
                };
            }).filter(Boolean);

            setExportStatus("Generating PDF...");
            setExportProgress(10);

            await exportCatalogPdf(itemsToExport as any, { 
                title: cfg.title || "Showroom Catalog", 
                method: cfg.method, 
                includeSummary: cfg.includeSummary,
                exportType 
            }, (p: number, msg: string) => {
                setExportProgress(p);
                setExportStatus(msg);
            });

            toast.success(tr("PDF generated successfully!"), { id: "showroom_pdf" });
        } catch (e: any) {
            toast.error("Export failed: " + e.message, { id: "showroom_pdf" });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="h-full w-full overflow-hidden bg-transparent flex flex-col animate-in fade-in duration-700" style={{ fontFamily: 'Inter, sans-serif' }}>
            {/* Showroom Header & Navigation Bar: transparent glass, free floating */}
            <header className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-white/5 bg-transparent shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center text-(--main-color) shrink-0 shadow-lg">
                        <Store size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-black tracking-widest uppercase text-white">
                                {tr("SHOWROOM")}
                            </h1>
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-[9px] font-mono text-white/70 uppercase">
                                {isVendor ? `VENDOR: ${user?.name}` : tr("LIVE VENDOR INTAKE")}
                            </span>
                        </div>
                        <p className="text-[10px] text-white/40 tracking-wider">
                            {tab === 'add' ? tr("Add Show Intake · On-device Staging") : tab === 'archive' ? tr("Archived Showroom Items") : tr("Dynamic vendor intake & live showcase")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Mode Tabs (shown in bar only if island commands are disabled) */}
                    {!islandEnabled && (
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => setTab('live')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${tab === 'live' ? 'bg-(--main-color) text-black font-black' : 'bg-white/5 text-white/60 hover:text-white'}`}
                            >
                                <LayoutGrid size={14} />
                                {tr("Live Showroom")} ({formattedItems.length})
                            </button>

                            {!isClient && (
                                <button
                                    onClick={() => setTab('add')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${tab === 'add' ? 'bg-(--main-color) text-black font-black' : 'bg-white/5 text-white/60 hover:text-white'}`}
                                >
                                    <Plus size={14} />
                                    {tr("Add Show")}
                                </button>
                            )}

                            {isAdminOrDev && (
                                <button
                                    onClick={() => setTab('archive')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${tab === 'archive' ? 'bg-(--main-color) text-black font-black' : 'bg-white/5 text-white/60 hover:text-white'}`}
                                >
                                    <Archive size={14} />
                                    {tr("Archive")}
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        onClick={() => void loadItems()}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all shrink-0"
                        title={tr("Refresh")}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-(--main-color)' : ''} />
                    </button>
                </div>
            </header>

            {/* Sub Bar: Search, Vendor Filter & View Mode (when on Live or Archive tabs) */}
            {tab !== 'add' && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 border-b border-white/5 bg-transparent shrink-0">
                        {/* Search & Vendors */}
                        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                            <div className="relative flex-1 max-w-xs">
                                <Search size={14} className="absolute left-3 top-2.5 text-white/40" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={tr("SEARCH SHOWROOM...")}
                                    className="w-full h-8 pl-8 pr-3 bg-white/5 border border-white/10 rounded-lg text-white text-xs outline-none focus:border-(--main-color)"
                                />
                            </div>

                            {/* Vendor filter pills */}
                            {!isVendor && activeVendors.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                    <button
                                        onClick={() => setVendorFilter('All')}
                                        className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border ${vendorFilter === 'All' ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 text-white/40 border-white/5 hover:text-white'}`}
                                    >
                                        ALL
                                    </button>
                                    {activeVendors.map(v => {
                                        const vCol = (vendors as any)[v]?.color || 'var(--main-color)';
                                        const isSel = vendorFilter === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => setVendorFilter(v)}
                                                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border`}
                                                style={{
                                                    borderColor: isSel ? vCol : `${vCol}30`,
                                                    backgroundColor: isSel ? vCol : 'transparent',
                                                    color: isSel ? 'black' : vCol
                                                }}
                                            >
                                                {v}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* View Switcher & Selection */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
                                    title={tr("Grid View")}
                                >
                                    <LayoutGrid size={14} />
                                </button>
                                <button
                                    onClick={() => setViewMode('gallery')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'gallery' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
                                    title={tr("Gallery View")}
                                >
                                    <Layout size={14} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
                                    title={tr("List View")}
                                >
                                    <LayoutList size={14} />
                                </button>
                            </div>

                            {/* Selection Toggle */}
                            <button
                                onClick={() => { setIsSelectionMode(!isSelectionMode); if (!isSelectionMode) setSelectedIds([]); }}
                                className={`p-1.5 rounded-lg border transition-all ${isSelectionMode ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                                title={isSelectionMode ? tr("Exit selection") : tr("Select items")}
                            >
                                <Check size={14} />
                            </button>

                            {/* PDF Export button */}
                            {isSelectionMode && selectedIds.length > 0 && (
                                <button
                                    onClick={() => setShowExportConfig(true)}
                                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-(--main-color)/20 border border-(--main-color)/40 text-(--main-color) text-[10px] font-black uppercase tracking-wider hover:bg-(--main-color) hover:text-black transition-all"
                                >
                                    <Download size={12} />
                                    {selectedIds.length} PDF
                                </button>
                            )}

                            {/* Shopping Bag Button */}
                            <button
                                onClick={() => setIsBagOpen(true)}
                                className="relative p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white transition-all ml-1"
                                title={tr("Shopping Bag")}
                            >
                                <ShoppingBag size={16} />
                                {bag.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-(--main-color) text-black text-[9px] font-black flex items-center justify-center">
                                        {bag.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Body */}
                <div className="flex-1 overflow-hidden relative">
                    {/* TAB: Add Show (Single & Batch XLSX upload) */}
                    {tab === 'add' && (
                        <div className="h-full overflow-y-auto custom-scrollbar p-2 sm:p-6 pb-28 sm:pb-12">
                            <AddShow
                                onSaved={() => {
                                    setTab('live');
                                    void loadItems();
                                }}
                                onCancel={() => setTab('live')}
                            />
                        </div>
                    )}

                    {/* TAB: Live Showroom or Archive */}
                    {tab !== 'add' && (
                        <div className="h-full overflow-y-auto custom-scrollbar scroll-smooth p-4 md:p-8 pb-28 sm:pb-12">
                            {loading ? (
                                <div className="h-full flex flex-col items-center justify-center py-32 text-center gap-3">
                                    <Loader2 className="animate-spin text-(--main-color)" size={40} />
                                    <span className="text-xs font-mono text-white/50 uppercase tracking-widest">
                                        {tr("Accessing Showroom Database...")}
                                    </span>
                                </div>
                            ) : formattedItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center py-32 text-center gap-4 max-w-md mx-auto">
                                    <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 shadow-xl">
                                        <Box size={40} strokeWidth={1} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white uppercase tracking-wider">
                                            {tab === 'archive' ? tr("Archive is Empty") : tr("No Showroom Items Found")}
                                        </h3>
                                        <p className="text-xs text-white/40 mt-1">
                                            {tab === 'archive' 
                                                ? tr("Discarded and transferred items will appear here.") 
                                                : tr("Add single items or upload vendor spreadsheets using Add Show.")}
                                        </p>
                                    </div>
                                    {!isClient && tab === 'live' && (
                                        <button
                                            onClick={() => setTab('add')}
                                            className="mt-2 px-5 py-2.5 rounded-xl bg-(--main-color) text-black text-xs font-black uppercase tracking-wider hover:scale-105 transition-all shadow-xl"
                                        >
                                            {tr("Add First Showroom Item")}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Grid View */}
                                    {viewMode === 'grid' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xxl:grid-cols-5 gap-4 md:gap-8 max-w-[2400px] mx-auto">
                                            {formattedItems.map((item, idx) => (
                                                <ShowroomCard
                                                    key={item.row}
                                                    item={item}
                                                    isClient={isClient}
                                                    isAdminOrDev={isAdminOrDev}
                                                    isArchive={tab === 'archive'}
                                                    onClick={() => {
                                                        if (isSelectionMode) toggleSelection(item);
                                                        else setSelectedItem(item);
                                                    }}
                                                    onToggleBag={() => toggleBag(item)}
                                                    inBag={bag.some(b => b.row === item.row)}
                                                    isSelected={selectedIds.includes(item.row)}
                                                    isSelectionMode={isSelectionMode}
                                                    onMoveToInventory={() => handleMoveToInventory(item)}
                                                    onDiscard={() => handleDiscard(item)}
                                                    onRestore={() => handleRestore(item)}
                                                    actionLoading={actionInProgress === item.id}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Gallery View */}
                                    {viewMode === 'gallery' && (
                                        <div className="flex flex-col gap-8 max-w-[1400px] mx-auto">
                                            {formattedItems.map((item) => (
                                                <div
                                                    key={item.row}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="w-full h-96 rounded-3xl overflow-hidden border border-white/10 bg-black/40 relative cursor-pointer group hover:border-(--main-color)/40 transition-all shadow-2xl flex flex-col justify-end p-8"
                                                >
                                                    {item.data.generatedPngUrl || item.data.mediaUrls ? (
                                                        <img
                                                            src={getCleanImageUrl(item.data.generatedPngUrl || String(item.data.mediaUrls).split(',')[0])}
                                                            alt={item.data.itemId}
                                                            className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
                                                        />
                                                    ) : null}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                                                    <div className="relative z-10 flex items-end justify-between">
                                                        <div>
                                                            <span className="text-[10px] font-mono uppercase tracking-widest text-(--main-color) font-black">
                                                                {item.data.vendorId} • {item.data.itemId}
                                                            </span>
                                                            <h3 className="text-2xl font-black text-white italic uppercase tracking-wider">
                                                                {item.data.shape} {item.data.type}
                                                            </h3>
                                                            <p className="text-xs text-white/60 mt-1">
                                                                {[item.data.lengthCm, item.data.widthCm, item.data.heightCm].filter(Boolean).join('×')} cm • {item.data.color} • {item.data.material}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-2xl font-black font-mono text-(--main-color)">
                                                                ${item.data.retailPrice || 0} <span className="text-xs text-white/40">USD</span>
                                                            </span>
                                                            {isAdminOrDev && (
                                                                <span className="text-[11px] font-mono text-white/50 block">
                                                                    Cost: ${item.data.price || 0} MXN
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* List View */}
                                    {viewMode === 'list' && (
                                        <div className="flex flex-col divide-y divide-white/5 border border-white/10 rounded-2xl bg-black/30 overflow-hidden max-w-[1800px] mx-auto">
                                            {formattedItems.map((item) => (
                                                <div
                                                    key={item.row}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                                            {item.data.generatedPngUrl || item.data.mediaUrls ? (
                                                                <img
                                                                    src={getCleanImageUrl(item.data.generatedPngUrl || String(item.data.mediaUrls).split(',')[0])}
                                                                    alt=""
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <Box size={20} className="text-white/20" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-mono font-bold text-(--main-color)">{item.data.itemId}</span>
                                                                <span className="text-xs font-bold text-white uppercase">{item.data.shape} {item.data.type}</span>
                                                            </div>
                                                            <span className="text-[11px] text-white/40 block mt-0.5">
                                                                {item.data.color} • {item.data.material} • {[item.data.lengthCm, item.data.widthCm, item.data.heightCm].filter(Boolean).join('×')} cm
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right font-mono">
                                                            <span className="block text-sm font-black text-(--main-color)">
                                                                ${item.data.retailPrice || 0} USD
                                                            </span>
                                                            {isAdminOrDev && (
                                                                <span className="text-[10px] text-white/40 block">
                                                                    Cost: ${item.data.price || 0} MXN
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Action Buttons */}
                                                        {isAdminOrDev && tab === 'live' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); void handleMoveToInventory(item); }}
                                                                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black transition-all text-xs font-bold flex items-center gap-1.5"
                                                                title={tr("Move to Inventory")}
                                                            >
                                                                <PackagePlus size={14} />
                                                                {tr("To Inventory")}
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleBag(item); }}
                                                            className={`p-2 rounded-xl transition-all ${bag.some(b => b.row === item.row) ? 'bg-(--main-color) text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
                                                        >
                                                            <ShoppingBag size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Export Wizard Portal */}
                <ExportWizard
                    isOpen={showExportConfig}
                    onClose={() => { setShowExportConfig(false); setExportProgress(0); }}
                    onStart={handleStartExport}
                    progress={exportProgress}
                    status={exportStatus}
                    moduleName="Showroom"
                />

                {/* Shopping Bag Drawer */}
                <ShoppingBagDrawer
                    isOpen={isBagOpen}
                    onClose={() => setIsBagOpen(false)}
                    bag={bag}
                    onRemove={(it) => toggleBag(it)}
                    onClear={() => setBag([])}
                    exchangeRate={liveRate || exchangeRate || DEFAULT_EXCHANGE_RATE}
                />

                {/* Selected Item Detail Inspector Drawer */}
                {selectedItem && (
                    <ShowroomDetailDrawer
                        item={selectedItem}
                        isClient={isClient}
                        isAdminOrDev={isAdminOrDev}
                        isArchive={tab === 'archive'}
                        onClose={() => setSelectedItem(null)}
                        onMoveToInventory={() => handleMoveToInventory(selectedItem)}
                        onDiscard={() => handleDiscard(selectedItem)}
                        onRestore={() => handleRestore(selectedItem)}
                        onToggleBag={() => toggleBag(selectedItem)}
                        inBag={bag.some(b => b.row === selectedItem.row)}
                    />
                )}
            </div>
    );
}

// ─── Showroom Card Component ──────────────────────────────────────────────────
function ShowroomCard({ 
    item, 
    isClient, 
    isAdminOrDev, 
    isArchive, 
    onClick, 
    onToggleBag, 
    inBag, 
    isSelected, 
    isSelectionMode,
    onMoveToInventory,
    onDiscard,
    onRestore,
    actionLoading
}: any) {
    const d = item.data;
    const vendorCol = (vendors as any)[d.vendorId]?.color || 'var(--main-color)';
    const mediaUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [];
    const imageSrc = d.generatedPngUrl || mediaUrls[0];

    return (
        <div
            onClick={onClick}
            className={`group rounded-3xl overflow-hidden border transition-all duration-300 relative flex flex-col bg-white/[0.02] hover:bg-white/[0.04] backdrop-blur-md cursor-pointer ${isSelected ? 'border-(--main-color) shadow-[0_0_30px_color-mix(in_srgb,var(--main-color)_25%,transparent)]' : 'border-white/10 hover:border-white/20'}`}
        >
            {/* Image Stage */}
            <div className="relative aspect-4/3 w-full bg-black/40 overflow-hidden flex items-center justify-center p-4">
                {imageSrc ? (
                    <img
                        src={getCleanImageUrl(imageSrc)}
                        alt={d.itemId}
                        className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <Box size={48} className="text-white/20" />
                )}

                {/* Vendor Pill */}
                <div 
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider text-black shadow-lg"
                    style={{ backgroundColor: vendorCol }}
                >
                    {d.vendorId}
                </div>

                {/* Selection Checkbox */}
                {isSelectionMode && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-black/60 border border-white/20 flex items-center justify-center">
                        {isSelected && <Check size={14} className="text-(--main-color)" strokeWidth={3} />}
                    </div>
                )}

                {/* Bag toggle button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                    className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all ${inBag ? 'bg-(--main-color) text-black shadow-lg' : 'bg-black/60 text-white/50 hover:text-white border border-white/10'}`}
                >
                    <ShoppingBag size={14} />
                </button>
            </div>

            {/* Information */}
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-white/40 tracking-wider uppercase font-bold">
                        {d.itemId}
                    </span>
                    <span className="text-xs font-mono font-black text-(--main-color)">
                        ${d.retailPrice || 0} USD
                    </span>
                </div>

                <h4 className="text-sm font-black text-white uppercase italic truncate">
                    {d.shape} {d.type}
                </h4>

                <div className="flex items-center gap-2 text-[10px] text-white/50">
                    <span>{d.color || 'Natural'}</span>
                    <span>•</span>
                    <span>{[d.lengthCm, d.widthCm, d.heightCm].filter(Boolean).join('×')} cm</span>
                </div>

                {/* Financial detail for Admin / Dev */}
                {isAdminOrDev && (
                    <div className="mt-auto pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/40">
                        <span>Cost: ${d.price || 0} MXN</span>
                        <span>{d.bookBarcode || d.bookLandCode || ''}</span>
                    </div>
                )}

                {/* Quick Action Footer */}
                {isAdminOrDev && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5" onClick={e => e.stopPropagation()}>
                        {!isArchive ? (
                            <>
                                <button
                                    onClick={onMoveToInventory}
                                    disabled={actionLoading}
                                    className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-black transition-all text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                                    title={tr("Pass lot to Main Inventory")}
                                >
                                    <PackagePlus size={12} />
                                    {tr("Pass Lot")}
                                </button>
                                <button
                                    onClick={onDiscard}
                                    disabled={actionLoading}
                                    className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 transition-all"
                                    title={tr("Discard (Hide without deletion)")}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={onRestore}
                                disabled={actionLoading}
                                className="w-full py-1.5 px-2 rounded-xl bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-black transition-all text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                            >
                                <RotateCcw size={12} />
                                {tr("Restore to Showroom")}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Detail Drawer Component ──────────────────────────────────────────────────
function ShowroomDetailDrawer({ 
    item, 
    isClient, 
    isAdminOrDev, 
    isArchive, 
    onClose, 
    onMoveToInventory, 
    onDiscard, 
    onRestore, 
    onToggleBag, 
    inBag 
}: any) {
    const d = item.data;
    const mediaUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [];
    const images = [d.generatedPngUrl, ...mediaUrls].filter(Boolean) as string[];
    const [activeIdx, setActiveIdx] = useState(0);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex justify-end animate-in fade-in">
            <div className="w-full max-w-xl h-full bg-black/90 border-l border-white/10 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div>
                        <span className="text-[10px] font-mono text-(--main-color) uppercase font-black">
                            {d.vendorId} • {d.itemId}
                        </span>
                        <h2 className="text-xl font-black text-white italic uppercase">
                            {d.shape} {d.type}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Primary Media Preview */}
                <div className="my-6 aspect-4/3 rounded-2xl bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center p-4 relative">
                    {images[activeIdx] ? (
                        <img src={getCleanImageUrl(images[activeIdx])} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                        <Box size={60} className="text-white/20" />
                    )}
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
                        {images.map((src, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveIdx(i)}
                                className={`w-16 h-16 rounded-xl overflow-hidden border shrink-0 ${i === activeIdx ? 'border-(--main-color)' : 'border-white/10 opacity-60'}`}
                            >
                                <img src={getCleanImageUrl(src)} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5 my-4 text-xs">
                    <div>
                        <span className="text-[10px] uppercase text-white/40 block font-mono">{tr("Material")}</span>
                        <span className="font-bold text-white">{d.material || '—'}</span>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase text-white/40 block font-mono">{tr("Color")}</span>
                        <span className="font-bold text-white">{d.color || '—'}</span>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase text-white/40 block font-mono">{tr("Dimensions")}</span>
                        <span className="font-bold text-white">{[d.lengthCm, d.widthCm, d.heightCm].filter(Boolean).join(' × ')} cm</span>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase text-white/40 block font-mono">{tr("Weight")}</span>
                        <span className="font-bold text-white">{d.weightKg ? `${d.weightKg} kg` : '—'}</span>
                    </div>
                </div>

                {/* Pricing & Cyphers */}
                <div className="p-4 rounded-2xl bg-(--main-color)/10 border border-(--main-color)/20 my-2 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] uppercase tracking-wider text-(--main-color) font-black block">
                            {tr("Retail Price")}
                        </span>
                        <span className="text-2xl font-black font-mono text-white">
                            ${d.retailPrice || 0} <span className="text-xs text-white/40">USD</span>
                        </span>
                    </div>
                    {isAdminOrDev && (
                        <div className="text-right font-mono text-xs">
                            <span className="text-white/50 block">Cost: ${d.price || 0} MXN</span>
                            <span className="text-(--main-color) text-[11px] font-bold block">{d.bookBarcode || '—'}</span>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="mt-auto pt-6 flex flex-col gap-3">
                    <button
                        onClick={onToggleBag}
                        className={`w-full py-3.5 rounded-2xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition-all ${inBag ? 'bg-(--main-color) text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                        <ShoppingBag size={16} />
                        {inBag ? tr("Remove from Bag") : tr("Add to Bag")}
                    </button>

                    {isAdminOrDev && !isArchive && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={onMoveToInventory}
                                className="py-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black border border-emerald-500/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                            >
                                <PackagePlus size={16} />
                                {tr("Move to Inventory")}
                            </button>
                            <button
                                onClick={onDiscard}
                                className="py-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                            >
                                <Trash2 size={16} />
                                {tr("Discard Item")}
                            </button>
                        </div>
                    )}

                    {isAdminOrDev && isArchive && (
                        <button
                            onClick={onRestore}
                            className="w-full py-3.5 rounded-2xl bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-black border border-purple-500/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                        >
                            <RotateCcw size={16} />
                            {tr("Restore to Active Showroom")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
