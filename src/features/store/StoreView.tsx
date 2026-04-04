import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { createPortal } from 'react-dom';
import { 
    inventoryAtom, 
    exchangeRateAtom, 
    storeShoppingBagAtom as shoppingBagAtom, 
    workbookVersionAtom, 
    storeSearchTermAtom,
    storeInventoryAtom,
    ActiveGalleryMediaAtom,
    ActiveGalleryIndexAtom,
    ImageSrcAtom,
    isDetailsPanelOpenAtom,
    isStoreBagOpenAtom,
    workflowStepAtom,
} from '../../lib/atoms';
import { 
    calculateCodesAndPrices, 
    normalizeInventoryData,
    getCleanImageUrl,
    extractFileId,
    imageCache,
    fetchImageBatch,
    resizeImage,
    generateVideoThumbnail
} from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { useItemImage } from '../../lib/hooks';
import { 
    ShoppingBag, 
    ArrowRight, 
    Search, 
    PackageSearch, 
    Tag, 
    Plus, 
    Check, 
    X, 
    Filter,
    Layers,
    Box,
    Sparkles,
    Star,
    Trash2,
    MessageSquare,
    Maximize2,
    Play,
    ChevronLeft,
    ChevronRight,
    Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── Premium Components ─── */

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl ${className}`} style={{ fontFamily: 'Inter, sans-serif' }}>
        {children}
    </div>
);

const Badge = ({ children, color = "var(--main-color)" }: { children: React.ReactNode, color?: string }) => (
    <span
        style={{ borderColor: `${color}30`, color: color }}
        className="px-3 py-1 text-[8.5px] font-black uppercase tracking-[0.2em] border self-start backdrop-blur-md bg-black/40"
    >
        {children}
    </span>
);

const FullscreenImageViewer = ({ src, isVideo, rating, onUpdateRating, onClose }: { src: string; isVideo?: boolean; rating: number; onUpdateRating?: (r: number) => void; onClose: () => void }) => {
    const [galleryMedia] = useAtom(ActiveGalleryMediaAtom);
    const [galleryIndex, setGalleryIndex] = useAtom(ActiveGalleryIndexAtom);
    const [imageSrc, setImageSrc] = useAtom(ImageSrcAtom);
    const [isNavigating, setIsNavigating] = useState(false);

    const activeSrc = src || imageSrc;
    const activeIsVideo = activeSrc?.startsWith('data:video/') || activeSrc?.toLowerCase().includes('.mov') || activeSrc?.toLowerCase().includes('.mp4');

    const handleNavigate = async (dir: number) => {
        if (isNavigating || galleryMedia.length <= 1) return;
        const newIndex = (galleryIndex + dir + galleryMedia.length) % galleryMedia.length;
        const urlToLoad = galleryMedia[newIndex];
        if (!urlToLoad) return;

        setIsNavigating(true);
        setGalleryIndex(newIndex);

        const fileId = extractFileId(urlToLoad);
        if (!fileId) {
            setImageSrc(urlToLoad);
            setIsNavigating(false);
            return;
        }

        if (imageCache.has(fileId)) {
            setImageSrc(imageCache.get(fileId)!);
            setIsNavigating(false);
            return;
        }

        try {
            const res = await fetchImageBatch(fileId);
            const mime = res.mimeType;
            const dataUrl = `data:${mime};base64,${res.base64}`;
            imageCache.set(fileId, dataUrl);
            setImageSrc(dataUrl);
        } catch (err) {
            console.error("Gallery nav failed", err);
        } finally {
            setIsNavigating(false);
        }
    };

    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    return createPortal(
        <div className="fixed inset-0 z-1000 bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300 overflow-hidden"
            onClick={onClose} onWheel={handleWheel}>
            <button onClick={onClose} className="absolute top-10 right-10 z-10 w-14 h-14 rounded-none bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all border border-white/10">
                <X className="w-6 h-6" />
            </button>

            {/* Rating UI in Fullscreen */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 px-8 py-4 bg-black/60 backdrop-blur-3xl border border-white/10 flex flex-col items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-1">Rate this Artifact</span>
                <StarRating rating={rating} onChange={onUpdateRating} />
            </div>

            {activeIsVideo ? (
                <video 
                    src={activeSrc} 
                    controls 
                    autoPlay 
                    muted
                    playsInline
                    loop 
                    className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl"
                />
            ) : (
                <img src={activeSrc} alt="" draggable={false}
                    className="max-w-[95vw] max-h-[95vh] object-contain select-none transition-transform duration-100"
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />
            )}

            {/* Navigation Controls */}
            {galleryMedia.length > 1 && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-10">
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNavigate(-1); }}
                        disabled={isNavigating}
                        className="w-16 h-16 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-white/40 hover:text-white transition-all pointer-events-auto disabled:opacity-20"
                    >
                        <ChevronLeft size={32} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNavigate(1); }}
                        disabled={isNavigating}
                        className="w-16 h-16 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-white/40 hover:text-white transition-all pointer-events-auto disabled:opacity-20"
                    >
                        <ChevronRight size={32} />
                    </button>
                    
                    {/* Counter Indicator */}
                    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-4 text-[10px] font-black tracking-widest text-white/40 uppercase">
                        <span>{galleryIndex + 1} / {galleryMedia.length}</span>
                        {isNavigating && <Loader2 className="w-3 h-3 text-(--main-color) animate-spin" />}
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

const StarRating = ({ rating, onChange, readonly = false, size = 10, fullWidth = false }: { rating: number; onChange?: (r: number) => void; readonly?: boolean; size?: number; fullWidth?: boolean }) => {
    const [hover, setHover] = useState(0);
    return (
        <div className={`flex items-center ${fullWidth ? 'justify-between w-full' : 'gap-1.5'}`}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    disabled={readonly}
                    onMouseEnter={() => !readonly && setHover(star)}
                    onMouseLeave={() => !readonly && setHover(0)}
                    onClick={(e) => { e.stopPropagation(); onChange?.(star); }}
                    className={`transition-all duration-300 ${readonly ? 'cursor-default' : 'hover:scale-125 active:scale-90 cursor-pointer'}`}
                >
                    <Star 
                        size={size} 
                        strokeWidth={3}
                        className={((hover || rating) >= star) 
                            ? (hover >= star ? "fill-white text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" : "fill-(--main-color) text-(--main-color)") 
                            : "text-white/10"} 
                    />
                </button>
            ))}
        </div>
    );
};

/* ─── Main Module ─── */

export const StoreView = () => {
    const inventory = useAtomValue(storeInventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [shoppingBag, setShoppingBag] = useAtom(shoppingBagAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const [globalSearchTerm, setGlobalSearchTerm] = useAtom(storeSearchTermAtom);
    const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);

    const [activeVendor, setActiveVendor] = useState('All');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

    const vendorOptions = useMemo(() => {
        const availableItems = inventory;
        const set = new Set(availableItems.map(i => normalizeInventoryData(i.data).itemId?.split('-')[0]).filter(Boolean));
        return ['All', ...Array.from(set)];
    }, [inventory]);

    const filteredItems = useMemo(() => {
        const items = inventory.filter(item => {
            const n = normalizeInventoryData(item.data);
            
            // Hide if marked as hidden in database
            if (n.is_hidden) return false;

            if (activeVendor !== 'All') {
                const vendorPrefix = n.itemId?.split('-')[0];
                if (vendorPrefix !== activeVendor) return false;
            }

            if (globalSearchTerm) {
                const terms = globalSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                const norm = n;
                const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                const searchableFields = [
                    norm.itemId,
                    norm.itemNumber,
                    norm.color,
                    norm.material,
                    norm.shape,
                    norm.shortDescription,
                    norm.description,
                    norm.widthCm,
                    norm.heightCm,
                    norm.lengthCm,
                    norm.weightKg,
                    calculated.bookAqCode,
                    calculated.bookLandCode,
                    norm.status,
                    norm.workbook,
                ].map(v => String(v || '').toLowerCase());
                const searchableString = searchableFields.join(' ');
                return terms.every(term => searchableString.includes(term));
            }
            return true;
        });
        return items;
    }, [inventory, activeVendor, globalSearchTerm, exchangeRate]);

    const toggleBag = (item: any) => {
        const inBag = shoppingBag.some(b => b.row === item.row);
        if (inBag) {
            setShoppingBag(shoppingBag.filter(b => b.row !== item.row));
            toast.success("Removed from bag");
        } else {
            setShoppingBag([...shoppingBag, item]);
            toast.success("Added to bag");
        }
    };

    const handleUpdateRating = async (originalItem: any, rating: number) => {
        // originalItem is from the inventory atom, managed by RxDB in UnifiedInventoryView
        const rowId = originalItem.row || originalItem.id;
        const tableName = originalItem.source === 'production' ? 'production' : 'inventory';
        
        console.log(`[Rating] Updating ${tableName} ID ${rowId} to rating ${rating}`);

        const { error } = await supabase
            .from(tableName)
            .update({ rating })
            .eq('id', rowId);

        if (error) {
            console.error("Rating update error:", error);
            toast.error(`Rating failed: ${error.message}`);
        } else {
            toast.success("Rating updated");
        }
    };

    const handleRemoveFromStore = async (item: any, reason: string) => {
        const id = item.row || item.id;
        const tableName = item.source === 'production' ? 'production' : 'inventory';
        const { error } = await supabase.from(tableName).update({ 
            is_hidden: true, 
            hidden_reason: reason 
        }).eq('id', id);
        
        if (error) {
            toast.error("Failed to remove item");
        } else {
            toast.success("Item removed from store");
            setSelectedItem(null);
        }
    };

    const handleAcquireItem = async (item: any) => {
        const id = item.row || item.id;
        const tableName = item.source === 'production' ? 'production' : 'inventory';
        const tid = toast.loading("Acquiring Artifact...");
        try {
            const { error } = await supabase.from(tableName).update({ 
                status: 'Acquired',
                updated_at: new Date().toISOString()
            }).eq('id', id);
            
            if (error) throw error;
            toast.success("Artifact Acquired!", { id: tid });
            setSelectedItem(null);
        } catch (err: any) {
            toast.error(`Acquisition failed: ${err.message}`, { id: tid });
        }
    };

    const handleBatchAcquire = async () => {
        if (shoppingBag.length === 0) return;
        const tid = toast.loading(`Acquiring ${shoppingBag.length} Artifacts...`);
        try {
            for (const item of shoppingBag) {
                const id = item.row || item.id;
                const tableName = item.source === 'production' ? 'production' : 'inventory';
                const { error } = await supabase.from(tableName).update({ 
                    status: 'Acquired',
                    updated_at: new Date().toISOString()
                }).eq('id', id);
                if (error) throw error;
            }
            toast.success("Batch Acquisition Complete!", { id: tid });
            setShoppingBag([]);
        } catch (err: any) {
            toast.error(`Batch failed: ${err.message}`, { id: tid });
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-full overflow-hidden bg-transparent animate-in fade-in duration-1000" style={{ fontFamily: 'Inter, sans-serif' }}>
            {/* Bag Toggle Button (Floating) */}
            <button 
                onClick={() => setIsBagOpen(true)} 
                className="fixed bottom-10 right-10 z-50 px-10 py-6 rounded-full bg-white text-black shadow-[0_30px_90px_-20px_rgba(255,255,255,0.5)] hover:scale-105 active:scale-95 transition-all group overflow-hidden"
            >
                <div className="relative z-10 flex items-center gap-4">
                    <ShoppingBag size={24} strokeWidth={2.5} />
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{shoppingBag.length} Items</span>
                        <span className="text-[8px] font-bold text-black/40 uppercase mt-1 tracking-widest">Open Bag</span>
                    </div>
                </div>
            </button>

            {/* Collection Feed */}
            <main className="flex-1 overflow-y-auto px-10 py-16 custom-scrollbar relative z-10 scroll-smooth">
                {/* Filter Chips */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-20 fade-in-item">
                    {vendorOptions.map(v => (
                        <button
                            key={v}
                            onClick={() => setActiveVendor(String(v))}
                            className={`px-10 py-4 rounded-none text-[10px] font-black uppercase tracking-[0.3em] transition-all border ${activeVendor === v ? 'bg-(--main-color) border-(--main-color) text-black shadow-2xl shadow-(--main-color)/20' : 'bg-white/5 text-white/40 hover:text-white border-white/5 hover:bg-white/10'}`}
                        >
                            {String(v)}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-8">
                        <div className="w-24 h-[2px] bg-white/5 relative overflow-hidden">
                            <div className="absolute inset-0 bg-(--main-color) animate-loading-bar" />
                        </div>
                        <span className="text-[9px] font-black text-white/10 uppercase tracking-[0.5em] text-center">Synchronizing Collection</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-20 gap-8 text-center">
                        <Box size={100} strokeWidth={0.5} />
                        <div>
                            <p className="text-xl font-black uppercase tracking-widest mb-2">No artifacts in this sector</p>
                            <p className="text-[10px] font-bold tracking-[0.2em]">Refine filters or check other status pipelines</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-12 max-w-[2100px] mx-auto pb-40">
                        {filteredItems.map((item, idx) => (
                            <ArtifactCard 
                                key={item.row || item.id} 
                                item={item} 
                                index={idx}
                                inBag={shoppingBag.some(b => b.row === item.row)}
                                onClick={() => setSelectedItem(item)}
                                onUpdateRating={(r: number) => handleUpdateRating(item, r)}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Selection Panel Overlay */}
            {selectedItem && (
                <DetailPanel 
                    item={selectedItem} 
                    exchangeRate={exchangeRate}
                    onClose={() => setSelectedItem(null)}
                    inBag={shoppingBag.some(b => b.row === selectedItem.row)}
                    onToggleBag={() => toggleBag(selectedItem)}
                    onRemove={handleRemoveFromStore}
                    onAcquire={handleAcquireItem}
                    onUpdateRating={(r: number) => handleUpdateRating(selectedItem, r)}
                />
            )}

            {/* Shopping Bag Drawer */}
            <ShoppingBagDrawer 
                isOpen={isBagOpen} 
                onClose={() => setIsBagOpen(false)} 
                items={shoppingBag}
                onRemoveItem={(item) => setShoppingBag(prev => prev.filter(b => b.row !== item.row))}
                onAcquireAll={handleBatchAcquire}
            />

            <style>{`
                @keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .animate-loading-bar { animation: loading-bar 1.5s infinite cubic-bezier(0.7, 0, 0.3, 1); }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
                .fade-in-item { animation: itemReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
                @keyframes itemReveal { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

/* ─── Premium Artifact Card ─── */

const ArtifactCard = ({ item, index, inBag, onClick, onUpdateRating }: any) => {
    const n = normalizeInventoryData(item.data);
    const vendorPrefix = n.itemId?.split('-')[0];
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';
    
    const mediaUrls = useMemo(() => {
        const raw = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = n.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [n.generatedPngUrl, n.mediaUrls]);

    const [showViewer, setShowViewer] = useState(false);
    const [viewerIdx, setViewerIdx] = useState(0);

    const renderGalleryMedia = () => {
        const total = mediaUrls.length;
        if (total === 0) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/5 gap-4 bg-neutral-950/40">
                    <PackageSearch size={80} strokeWidth={0.5} />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">Imagery Pending</span>
                </div>
            );
        }

        if (total === 1) {
            return (
                <div className="relative w-full h-full bg-neutral-950/40 overflow-hidden group/galimg" onClick={(e) => { e.stopPropagation(); setViewerIdx(0); setShowViewer(true); }}>
                    <img 
                        src={getCleanImageUrl(mediaUrls[0])} 
                        className={`w-full h-full object-cover opacity-60 group-hover/card:opacity-100 group-hover/card:scale-110 transition-all duration-[3s] cubic-bezier(0.16, 1, 0.3, 1) ${n.generatedPngUrl ? 'p-12 drop-shadow-[0_30px_60px_rgba(0,0,0,0.8)]' : ''}`} 
                        alt=""
                        style={n.generatedPngUrl ? { backgroundColor: n.dominantColor || n.vibeColor || 'rgba(255,255,255,0.02)' } : {}}
                    />
                    {isVideoFile(mediaUrls[0]) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover/card:scale-125 transition-transform duration-500">
                                <Play className="w-6 h-6 text-white fill-white ml-1" strokeWidth={3} />
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // Multiple images - Dynamic Grid
        const displayCount = 6;
        const visibleUrls = mediaUrls.slice(0, displayCount);
        const remaining = total - displayCount;
        const gridCols = total <= 2 ? 'grid-cols-2' : 'grid-cols-3';

        return (
            <div className={`grid gap-px bg-black/40 h-full w-full ${gridCols}`}>
                {visibleUrls.map((url, i) => (
                    <div key={i} className={`relative overflow-hidden group/galimg aspect-square cursor-pointer`}
                         onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}>
                        <img 
                            src={getCleanImageUrl(url)} 
                            className="w-full h-full object-cover opacity-40 group-hover/card:opacity-80 transition-all duration-700 hover:scale-110" 
                            alt=""
                        />
                        {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={16} className="text-white/60" /></div>}
                        {i === visibleUrls.length - 1 && remaining > 0 && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                <div className="flex flex-col items-center">
                                    <span className="text-xl font-black text-white">+{remaining}</span>
                                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">More</span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {/* Visual filler for odd grids */}
                {visibleUrls.length === 2 && <div className="bg-white/2" />}
            </div>
        );
    };

    return (
        <div 
            onClick={onClick}
            className="group/card relative flex flex-col bg-white/[0.03] backdrop-blur-3xl border border-white/[0.05] rounded-[2.5rem] overflow-hidden transition-all duration-700 hover:scale-[1.02] hover:border-white/20 hover:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] cursor-pointer fade-in-item"
            style={{ animationDelay: `${index * 40}ms`, position: 'relative', fontFamily: 'Inter, sans-serif' }}
        >
            {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} rating={n.rating || 0} onUpdateRating={(r: number) => onUpdateRating(r)} onClose={() => setShowViewer(false)} />}
            
            {/* Gallery Content Area */}
            <div className="relative aspect-[4/5] overflow-hidden">
                {renderGalleryMedia()}

                {/* Badges Overlay */}
                <div className="absolute top-8 left-8 flex items-start justify-between right-8 z-10">
                    <div className="flex flex-col gap-2">
                         <div className="px-4 py-1.5 bg-black/60 backdrop-blur-xl border border-white/10 text-[10px] font-black text-(--main-color) uppercase tracking-widest rounded-full">{vendorPrefix}</div>
                    </div>
                    {inBag && (
                        <div className="w-12 h-12 bg-(--main-color) flex items-center justify-center shadow-3xl animate-in zoom-in duration-500 rounded-2xl">
                            <Check className="w-6 h-6 text-black" strokeWidth={4} />
                        </div>
                    )}
                </div>

                {/* Bottom Scrim */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black via-black/40 to-transparent pointer-events-none" />
            </div>

            {/* Combined Details Footer */}
            <div className="p-10 flex flex-col gap-8">
                <div className="flex flex-col gap-6">
                    <div className="w-full flex justify-between items-center -mb-2">
                        <StarRating rating={n.rating || 0} onChange={onUpdateRating} fullWidth={true} size={12} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-tight group-hover/card:text-(--main-color) transition-colors drop-shadow-md">
                            {n.shape} <span className="opacity-40">{n.shortDescription || 'Artifact'}</span>
                        </h3>
                        <p className="text-[11px] font-bold text-white/20 uppercase tracking-[0.4em]">{n.color} {n.material}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-white/5 mt-auto">
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-3 leading-none">
                            <span className="text-4xl font-black text-white tracking-tighter italic" style={{ fontFamily: 'Outfit, sans-serif' }}>${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">MXN</span>
                        </div>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover/card:border-(--main-color)/50 group-hover/card:bg-(--main-color)/10 transition-all opacity-0 group-hover/card:opacity-100">
                        <ArrowRight className="w-6 h-6 text-(--main-color)" />
                    </div>
                </div>
            </div>
            
            {/* Interactive Border Highlight */}
            <div className="absolute inset-0 border border-white/0 group-hover/card:border-(--main-color)/20 transition-all pointer-events-none rounded-[2.5rem]" />
        </div>
    );
};

/* ─── Premium Detail Panel Overlay ─── */

const DetailPanel = ({ item, exchangeRate, onClose, inBag, onToggleBag, onRemove, onAcquire, onUpdateRating }: any) => {
    const n = normalizeInventoryData(item.data);
    const codes = calculateCodesAndPrices(item.data, exchangeRate, 'v326');
    const vendorPrefix = n.itemId?.split('-')[0];
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';
    
    const [showConfirmRemove, setShowConfirmRemove] = useState(false);
    const [removeReason, setRemoveReason] = useState('');
    const [showFullscreen, setShowFullscreen] = useState(false);
    
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
    const [activeIsVideo, setActiveIsVideo] = useState(false);
    const [isMediaLoading, setIsMediaLoading] = useState(false);

    const setActiveGalleryMedia = useSetAtom(ActiveGalleryMediaAtom);
    const setActiveGalleryIndex = useSetAtom(ActiveGalleryIndexAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);

    const mediaUrls = useMemo(() => {
        const urls = [n.generatedPngUrl, ...(n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [])];
        return urls.filter(Boolean);
    }, [n.generatedPngUrl, n.mediaUrls]);

    useEffect(() => {
        const urlToLoad = mediaUrls[activeMediaIndex];
        if (!urlToLoad) {
            setActiveMediaUrl(null);
            return;
        }

        let isActive = true;
        setIsMediaLoading(true);

        const fileId = extractFileId(urlToLoad);
        if (!fileId) {
            setActiveMediaUrl(urlToLoad);
            setActiveIsVideo(urlToLoad.toLowerCase().includes('.mov') || urlToLoad.toLowerCase().includes('.mp4'));
            setIsMediaLoading(false);
            return;
        }

        if (imageCache.has(fileId)) {
            const cached = imageCache.get(fileId)!;
            const isVid = cached.startsWith('data:video/') || urlToLoad.toLowerCase().includes('.mov') || urlToLoad.toLowerCase().includes('.mp4');
            setActiveMediaUrl(cached);
            setActiveIsVideo(isVid);
            setIsMediaLoading(false);
            return;
        }

        fetchImageBatch(fileId)
            .then(async (res) => {
                if (!isActive) return;
                const dataUrl = `data:${res.mimeType};base64,${res.base64}`;
                let finalUrl = dataUrl;
                const isVid = res.mimeType.startsWith('video/');
                if (!isVid) {
                    try { finalUrl = await resizeImage(dataUrl, 1200); } catch (e) {}
                }
                imageCache.set(fileId, finalUrl);
                setActiveMediaUrl(finalUrl);
                setActiveIsVideo(isVid);
            })
            .catch(() => {
                if (isActive) setActiveMediaUrl(null);
            })
            .finally(() => {
                if (isActive) setIsMediaLoading(false);
            });

        return () => { isActive = false; };
    }, [activeMediaIndex, mediaUrls]);

    const handleOpenFullscreen = () => {
        setActiveGalleryMedia(mediaUrls);
        setActiveGalleryIndex(activeMediaIndex);
        setImageSrc(activeMediaUrl || mediaUrls[activeMediaIndex]);
        setShowFullscreen(true);
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-500" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-2xl" onClick={onClose} />
             
             <div className="relative w-full max-w-7xl h-full max-h-[900px] flex flex-col md:flex-row bg-[#080808] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_80px_200px_-40px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-700 focus:outline-none">
                 
                 {/* Visual Area */}
                 <div className="w-full md:w-1/2 h-[45vh] md:h-full relative bg-neutral-900/50 overflow-hidden group/detailimg">
                    {/* Liquid Background Effect */}
                    <div className="absolute inset-0 opacity-20 transition-opacity group-hover/detailimg:opacity-30 duration-700">
                        <div className="absolute top-0 -left-1/4 w-full h-full bg-(--main-color) rounded-full mix-blend-screen filter blur-[120px] animate-pulse" />
                        <div className="absolute bottom-0 -right-1/4 w-full h-full bg-white/10 rounded-full mix-blend-screen filter blur-[120px]" />
                    </div>

                    {activeMediaUrl ? (
                        activeIsVideo ? (
                            <div className="w-full h-full bg-black">
                                <video 
                                    src={activeMediaUrl} 
                                    controls 
                                    autoPlay 
                                    muted 
                                    playsInline
                                    loop 
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        ) : (
                            <img 
                                src={activeMediaUrl} 
                                onClick={() => setShowFullscreen(true)}
                                className="w-full h-full object-cover opacity-60 hover:opacity-80 transition-all duration-700 cursor-zoom-in scale-100 hover:scale-105"
                                alt=""
                            />
                        )
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/5 gap-4">
                            {isMediaLoading ? <div className="w-16 h-16 border-4 border-white/10 border-t-(--main-color) rounded-full animate-spin" /> : <PackageSearch size={120} strokeWidth={0.5} />}
                            <span className="text-sm font-black uppercase tracking-[0.5em]">{isMediaLoading ? 'Loading Visuals' : 'No Media'}</span>
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black via-transparent to-transparent pointer-events-none" />

                    {/* Navigation Overlays */}
                    {mediaUrls.length > 1 && (
                        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 flex justify-between px-6 opacity-0 group-hover/detailimg:opacity-100 transition-opacity z-20 pointer-events-none">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setActiveMediaIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length); }}
                                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black pointer-events-auto shadow-2xl"
                            >
                                <ChevronLeft size={24} strokeWidth={3} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setActiveMediaIndex((prev) => (prev + 1) % mediaUrls.length); }}
                                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black pointer-events-auto shadow-2xl"
                            >
                                <ChevronRight size={24} strokeWidth={3} />
                            </button>
                        </div>
                    )}
                    
                    <div className="absolute inset-0 bg-linear-to-r from-black/20 via-transparent to-[#080808] pointer-events-none" />

                    {/* Gallery Thumb Strip */}
                    {mediaUrls.length > 1 && (
                        <div className="absolute bottom-40 left-16 right-16 flex gap-4 overflow-x-auto pb-4 scrollbar-none pointer-events-auto">
                            {mediaUrls.map((url, idx) => {
                                const fid = extractFileId(url);
                                const thumbKey = fid ? fid + '_thumb' : null;
                                const cached = thumbKey ? imageCache.get(thumbKey) : (fid ? imageCache.get(fid) : null);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveMediaIndex(idx)}
                                        className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 bg-black/40 backdrop-blur-md ${
                                            activeMediaIndex === idx ? 'border-(--main-color) scale-110 shadow-3xl' : 'border-white/5 opacity-40 hover:opacity-100 hover:border-white/20'
                                        }`}
                                    >
                                        {cached ? (
                                            <img src={cached} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/20">
                                                {idx + 1}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    
                    <button 
                        onClick={onClose}
                        className="absolute top-10 left-10 w-14 h-14 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-white/40 hover:text-white hover:bg-black/60 transition-all group/close"
                    >
                        <X size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>

                    <div className="absolute bottom-16 left-16 right-16 flex flex-col gap-6 pointer-events-none">
                        <div className="pointer-events-auto w-fit bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/5">
                            <StarRating rating={n.rating || 0} onChange={onUpdateRating} size={14} />
                        </div>
                        <div>
                            <h1 className="text-6xl font-black text-white italic tracking-tighter uppercase leading-[0.8] mb-4 drop-shadow-2xl">{n.shape} {n.shortDescription}</h1>
                            <p className="text-xs font-black text-white/40 uppercase tracking-[0.5em]">{n.color} | {n.material} | {vendorPrefix}</p>
                        </div>
                    </div>

                    <div className="absolute top-10 right-10 flex gap-4">
                         <button onClick={handleOpenFullscreen} className="w-14 h-14 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-white/40 hover:text-white transition-all">
                             <Maximize2 size={24} />
                         </button>
                    </div>
                 </div>

                 {/* Content Area */}
                 <div className="flex-1 p-24 flex flex-col justify-between overflow-y-auto custom-scrollbar bg-black/20">
                    <div className="flex flex-col gap-16">
                         <div className="flex gap-4">
                                <div className="px-6 py-3 border border-white/5 bg-white/2 flex flex-col items-center min-w-[100px]">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Weight</span>
                                    <span className="text-sm font-mono font-black text-white tracking-widest">{n.weightKg}KG</span>
                                </div>
                                <div className="px-6 py-3 border border-white/5 bg-white/2 flex flex-col items-center min-w-[100px]">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Scale</span>
                                    <span className="text-sm font-mono font-black text-white tracking-widest">{n.widthCm}X{n.heightCm}CM</span>
                                </div>
                         </div>

                         <div className="grid grid-cols-2 gap-10">
                            <div className="p-10 bg-white/2 border border-white/5 rounded-4xl flex flex-col gap-2 relative overflow-hidden group">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">ACQ Artifact Code</span>
                                <span className="text-4xl font-black text-(--main-color) font-mono tracking-[0.2em] uppercase leading-none drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]">{codes.bookAqCode}</span>
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Sparkles size={16} className="text-(--main-color)/40" />
                                </div>
                            </div>
                            <div className="p-10 bg-white/2 border border-white/5 rounded-4xl flex flex-col gap-2 relative overflow-hidden group">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">LND Landed Code</span>
                                <span className="text-4xl font-black text-emerald-400 font-mono tracking-[0.2em] uppercase leading-none drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">{codes.bookLandCode}</span>
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Layers size={16} className="text-emerald-400/40" />
                                </div>
                            </div>
                         </div>

                         <div className="flex flex-col gap-8">
                            <div className="flex flex-col gap-4">
                                <StarRating rating={n.rating || 0} onChange={onUpdateRating} />
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">{n.shape} {n.shortDescription}</h4>
                                    <p className="text-xl font-bold text-white/30 uppercase tracking-[0.2em]">{n.color} {n.material}</p>
                                </div>
                            </div>
                            <div className="w-16 h-1 bg-(--main-color) opacity-20" />
                         </div>
                    </div>

                    <div className="pt-20 border-t border-white/5">
                        {showConfirmRemove ? (
                            <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-5 duration-500">
                                <div className="flex flex-col gap-2">
                                    <h5 className="text-xl font-black text-white uppercase italic tracking-tighter">Tell us why you didn’t like this</h5>
                                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Optional feedback for collection pruning</p>
                                </div>
                                <div className="relative">
                                    <MessageSquare className="absolute top-6 left-6 text-white/10" size={18} />
                                    <textarea 
                                        value={removeReason}
                                        onChange={e => setRemoveReason(e.target.value)}
                                        placeholder="Add your comments here..."
                                        className="w-full h-32 bg-white/5 border border-white/10 p-6 pl-16 text-sm text-white focus:outline-none focus:border-white/20 transition-all resize-none font-mono"
                                    />
                                </div>
                                <div className="flex gap-4">
                                     <button onClick={() => setShowConfirmRemove(false)} className="flex-1 h-20 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Cancel</button>
                                     <button onClick={() => onRemove(item, removeReason)} className="flex-1 h-20 bg-red-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all font-mono">Confirm Removal</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between gap-12">
                                <div className="flex flex-col">
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-7xl font-black text-white tracking-tighter italic" style={{ fontFamily: 'Outfit, sans-serif' }}>${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-6">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onAcquire(item); }}
                                        className="h-28 px-16 flex items-center justify-center gap-8 bg-white text-black border border-white transition-all active:scale-95 shadow-[0_40px_100px_rgba(255,255,255,0.1)] hover:bg-(--main-color) hover:border-(--main-color) rounded-3xl group/btn"
                                    >
                                        <div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center group-hover/btn:bg-black/10 transition-all">
                                            <Check className="w-6 h-6" strokeWidth={4} />
                                        </div>
                                        <div className="flex flex-col items-start leading-none gap-1">
                                            <span className="text-xs font-black uppercase tracking-[0.4em]">Acquire Artifact</span>
                                            <span className="text-[8px] font-bold text-black/40 uppercase tracking-widest mt-0.5">Migrate to inventory stack</span>
                                        </div>
                                    </button>

                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                                        className={`h-20 px-16 flex items-center justify-center gap-6 transition-all active:scale-95 border rounded-3xl ${inBag ? 'bg-white/5 border-white/10 text-white' : 'bg-transparent border-white/20 text-white/40 hover:text-white hover:border-white'}`}
                                    >
                                        {inBag ? <Check className="w-5 h-5 text-(--main-color)" strokeWidth={3} /> : <Plus className="w-5 h-5" strokeWidth={3} />}
                                        <span className="text-xs font-black uppercase tracking-[0.3em]">{inBag ? 'In Shopping Bag' : 'Add to Shopping Bag'}</span>
                                    </button>
                                    
                                    <button 
                                        onClick={() => setShowConfirmRemove(true)}
                                        className="h-12 px-16 flex items-center justify-center gap-4 text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-all text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-red-400/20 rounded-xl"
                                    >
                                        <Trash2 size={16} />
                                        Remove from Collection
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
             </div>

             {showFullscreen && <FullscreenImageViewer src={activeMediaUrl!} isVideo={activeIsVideo} rating={n.rating || 0} onUpdateRating={(r: number) => onUpdateRating(r)} onClose={() => setShowFullscreen(false)} />}
        </div>
    );
};

/* ─── Shopping Bag Drawer ─── */

const ShoppingBagDrawer = ({ isOpen, onClose, items, onRemoveItem, onAcquireAll }: { isOpen: boolean; onClose: () => void; items: any[]; onRemoveItem: (i: any) => void; onAcquireAll: () => void }) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-10000 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose} />
            
            <div className="absolute top-0 right-0 bottom-0 w-full max-w-xl bg-[#0a0a0a] border-l border-white/10 shadow-[-50px_0_100px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-700 ease-out">
                {/* Header */}
                <div className="p-12 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                            <ShoppingBag className="text-(--main-color)" size={28} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Acquisition Bag</h2>
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-2 leading-none">{items.length} Selected Artifacts</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar flex flex-col gap-6">
                    {items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 gap-6 text-center">
                            <Box size={60} strokeWidth={0.5} />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Bag is currently empty</p>
                        </div>
                    ) : (
                        items.map((item, idx) => {
                            const n = normalizeInventoryData(item.data);
                            return (
                                <div key={item.row} className="p-3 bg-white/2 border border-white/5 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group flex flex-col gap-2" style={{ animationDelay: `${idx * 50}ms` }}>
                                    <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/5">
                                        <img src={getCleanImageUrl(n.generatedPngUrl || (n.mediaUrls ? String(n.mediaUrls).split(',')[0] : ''))} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center min-w-0">
                                        <h4 className="text-sm font-black text-white uppercase italic tracking-tighter truncate">{n.shape} {n.shortDescription}</h4>
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{n.color} {n.material}</p>
                                        <div className="mt-3 text-xs font-black text-(--main-color) font-mono tracking-widest">${Number(n.price_mxn || n.price || 0).toLocaleString()} <span className="text-[8px] opacity-40 ml-1">MXN</span></div>
                                    </div>
                                    <button onClick={() => onRemoveItem(item)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/10 hover:text-red-500 hover:bg-red-500/10 transition-all self-center">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Action */}
                {items.length > 0 && (
                    <div className="p-12 border-t border-white/5 bg-black/40 backdrop-blur-3xl shrink-0">
                        <button 
                            onClick={onAcquireAll}
                            className="w-full h-24 bg-(--main-color) text-black rounded-none flex items-center justify-center gap-6 group hover:scale-[1.02] shadow-[0_20px_60px_-10px_rgba(var(--main-color-rgb),0.3)] transition-all"
                        >
                            <span className="text-sm font-black uppercase tracking-[0.5em] ml-12">Commit Acquisition →</span>
                            <div className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center group-hover:bg-black/20 transition-all">
                                <ArrowRight size={20} />
                            </div>
                        </button>
                        <p className="text-[10px] font-bold text-white/10 uppercase tracking-[0.2em] text-center mt-6">These items will be migrated to the Inventory Workforce</p>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
