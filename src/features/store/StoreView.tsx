
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    storeSearchTermAtom, 
    storeActiveVendorFilterAtom, 
    storeViewModeAtom,
    storeShoppingBagAtom,
    isStoreBagOpenAtom,
    activeViewAtom,
    storeInventoryAtom,
    dashboardStatusFilterAtom,
    liveExchangeRateAtom,
    exchangeRateAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { 
    ShoppingBag, Search, Filter, LayoutGrid, LayoutList, Layout, 
    ChevronRight, ArrowRight, X, Heart, Star, Info, Trash2, Box, PackageSearch,
    ChevronLeft, ChevronRight as ChevronRightIcon, Plus, Check, Minus, Maximize2, Zap
} from 'lucide-react';
import { useTranslation } from '../../lib/hooks';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { ShoppingBagDrawer } from './ShoppingBagDrawer';
import { atom } from 'jotai';

// --- Atoms for Fullscreen Gallery State ---
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

export function StoreView() {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
    const storeItems = useAtomValue(storeInventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom);
    const setView = useSetAtom(activeViewAtom);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    const filteredItems = useMemo(() => {
        return storeItems.filter(item => {
            const n = normalizeInventoryData(item.data);
            const matchesVendor = vendorFilter === 'All' || n.itemId?.startsWith(vendorFilter);
            const searchStr = `${n.itemId} ${n.shortDescription} ${n.color} ${n.material}`.toLowerCase();
            const matchesSearch = !search || searchStr.includes(search.toLowerCase());
            return matchesVendor && matchesSearch;
        });
    }, [storeItems, vendorFilter, search]);

    const toggleBag = (item: any) => {
        const isInBag = bag.some(b => b.row === item.row);
        if (isInBag) {
            setBag(prev => prev.filter(b => b.row !== item.row));
            toast.success("Removed from bag");
        } else {
            setBag(prev => [...prev, item]);
            toast.success("Added to bag", {
                icon: '🛍️',
                style: { background: 'black', color: 'var(--main-color)', border: '1px solid var(--main-color)' }
            });
        }
    };

    const handleRemoveFromStore = async (item: any) => {
        const tableName = item.table_name || 'inventory_v2';
        const { error } = await supabase.from(tableName).delete().eq('id', item.id);
        if (error) {
            toast.error(`Remove failed: ${error.message}`);
        } else {
            toast.success("Item removed from store");
            setSelectedItem(null);
        }
    };

    const handleAcquireItem = async (item: any) => {
        const tid = toast.loading("Updating status...");
        try {
            const tableName = item.table_name || 'inventory_v2';
            const { error } = await supabase.from(tableName).update({ 
                status: 'Acquired',
                updated_at: new Date().toISOString()
            }).eq('id', item.id);
            if (error) throw error;
            toast.success("Item Acquired!", { id: tid });
            setSelectedItem(null);
        } catch (err: any) {
            toast.error(err.message, { id: tid });
        }
    };

    const handleBatchAcquire = async () => {
        if (bag.length === 0) return;
        const tid = toast.loading(`Processing ${bag.length} acquisitions...`);
        try {
            for (const item of bag) {
                const tableName = item.table_name || 'inventory_v2';
                const { error } = await supabase.from(tableName).update({ 
                    status: 'Acquired',
                    updated_at: new Date().toISOString()
                }).eq('id', item.id);
                if (error) throw error;
            }
            toast.success("Batch Acquisition Complete!", { id: tid });
            setBag([]);
            setIsBagOpen(false);
        } catch (err: any) {
            toast.error(`Batch failed: ${err.message}`, { id: tid });
        }
    };

    const handleUpdateRating = async (item: any, rating: number) => {
        if (!item?.id) return;
        try {
            const tableName = item.table_name || 'inventory_v2';
            const { error } = await supabase.from(tableName).update({ rating }).eq('id', item.id);
            if (error) throw error;
        } catch (err: any) {
            console.error("Rating update failed:", err);
        }
    };

    return (
        <div className="h-full overflow-hidden bg-transparent animate-in fade-in duration-1000" style={{ fontFamily: 'Inter, sans-serif' }}>
            <main className="h-full overflow-hidden relative flex flex-col">
                {/* View Modes */}
                <div className="flex-1 overflow-hidden relative">
                    {viewMode === 'grid' && (
                        <div className="h-full overflow-y-auto custom-scrollbar scroll-smooth p-6">
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 xxl:grid-cols-10 gap-4">
                                {filteredItems.map((item, idx) => (
                                    <ArtifactCard 
                                        key={item.row} 
                                        item={item} 
                                        onClick={() => setSelectedItem(item)} 
                                        delay={idx % 20}
                                    />
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-40 opacity-20 gap-8 text-center">
                                    <Box size={100} strokeWidth={0.5} />
                                    <p className="text-xl font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'list' && (
                        <div className="h-full overflow-y-auto custom-scrollbar scroll-smooth p-8">
                            <div className="flex flex-col gap-2 max-w-7xl mx-auto">
                                {filteredItems.map((item, idx) => (
                                    <StoreListItem 
                                        key={item.row} 
                                        item={item} 
                                        onClick={() => setSelectedItem(item)}
                                        onToggleBag={() => toggleBag(item)}
                                        inBag={bag.some(b => b.row === item.row)}
                                        exchangeRate={liveRate || exchangeRate}
                                    />
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-40 opacity-20 gap-8 text-center">
                                    <Box size={100} strokeWidth={0.5} />
                                    <p className="text-xl font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'gallery' && (
                        <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar">
                            {filteredItems.map((item) => (
                                <div key={item.row} className="h-full w-full snap-start shrink-0">
                                    <GalleryFullItem 
                                        item={item} 
                                        onOpenDetails={() => setSelectedItem(item)} 
                                    />
                                </div>
                            ))}
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-40 opacity-20 gap-8 text-center">
                                    <Box size={100} strokeWidth={0.5} />
                                    <p className="text-xl font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Selection Panel Overlay */}
            {selectedItem && (
                <DetailPanel 
                    item={selectedItem} 
                    exchangeRate={liveRate || exchangeRate}
                    onClose={() => setSelectedItem(null)}
                    inBag={bag.some(b => b.row === selectedItem.row)}
                    onToggleBag={() => toggleBag(selectedItem)}
                    onRemove={handleRemoveFromStore}
                    onAcquire={handleAcquireItem}
                    onUpdateRating={(r: number) => handleUpdateRating(selectedItem, r)}
                />
            )}

            <style>{`
                @keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .animate-loading-bar { animation: loading-bar 1.5s infinite cubic-bezier(0.7, 0, 0.3, 1); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
}


/* ─── Compact Elements ─── */

const ArtifactCard = ({ item, onClick, delay }: { item: any, onClick: () => void, delay: number }) => {
    const n = normalizeInventoryData(item.data);
    const rawUrls = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
    const mainImg = n.generatedPngUrl || (rawUrls.length > 0 ? rawUrls[0] : '');
    const vPrefix = n.itemId?.split('-')[0];
    const vColor = vendors[vPrefix as keyof typeof vendors]?.color || 'var(--main-color)';

    return (
        <button 
            onClick={onClick}
            className="aspect-card bg-black/40 border border-white/5 relative group overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500"
            style={{ animationDelay: `${delay * 30}ms` }}
        >
            <div className="absolute top-2 left-2 z-10">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vColor, boxShadow: `0 0 8px ${vColor}` }} />
            </div>
            
            <div className="flex-1 relative overflow-hidden bg-black/20">
                {mainImg ? (
                    <img 
                        src={getCleanImageUrl(mainImg)} 
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 grayscale-[0.2] group-hover:grayscale-0"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10">
                        <PackageSearch size={40} />
                    </div>
                )}
            </div>
            <div className="p-2 flex flex-col gap-0.5 bg-black/60 backdrop-blur-md">
                <div className="flex justify-between items-center gap-2">
                    <span className="text-[9px] font-black text-white italic truncate tracking-tighter uppercase">{n.shape} {n.shortDescription}</span>
                    <span className="text-[8px] font-black text-(--main-color) font-mono">${(Number(n.price_mxn || n.price || 0) / 1000).toFixed(1)}K</span>
                </div>
            </div>
        </button>
    );
};

const StoreListItem = ({ item, onClick, onToggleBag, inBag, exchangeRate }: any) => {
    const n = normalizeInventoryData(item.data);
    const vendorPrefix = n.itemId?.split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';
    const rawUrls = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
    const mainImg = n.generatedPngUrl || (rawUrls.length > 0 ? rawUrls[0] : '');

    return (
        <div className="group flex items-center gap-8 p-6 bg-black/20 hover:bg-black/40 border border-white/5 hover:border-white/10 transition-all rounded-3xl animate-in fade-in slide-in-from-left duration-500">
            {/* Thumbnail */}
            <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group/thumb">
                {mainImg ? (
                    <img src={getCleanImageUrl(mainImg)} className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity group-hover/thumb:scale-110 duration-700" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><PackageSearch size={28} /></div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
            </div>

            {/* Core Info */}
            <div className="flex-1 min-w-0 grid grid-cols-4 gap-12 items-center">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vendorColor, boxShadow: `0 0 8px ${vendorColor}` }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] italic" style={{ color: vendorColor }}>{n.itemId}</span>
                    </div>
                    <h3 className="text-base font-black text-white uppercase italic truncate tracking-tighter leading-none">{n.shape} {n.shortDescription}</h3>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">Material Specs</span>
                    <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 bg-white/5 rounded text-[9px] font-black text-white/40 uppercase tracking-widest">{n.color || 'N/A'}</span>
                        <span className="px-2 py-0.5 bg-white/5 rounded text-[9px] font-black text-white/40 uppercase tracking-widest">{n.material || 'N/A'}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">Valuation</span>
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-(--main-color) font-mono leading-none">${(Number(n.price_mxn || n.price || 0) / 1000).toFixed(1)}K <span className="text-[8px] opacity-40 ml-0.5">MXN</span></span>
                        <span className="text-[10px] font-black text-white/30 font-mono mt-1">${(Number(n.price_mxn || n.price || 0) / (exchangeRate || 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="opacity-40">USD EST.</span></span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end items-center gap-4">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${inBag ? 'bg-(--main-color) text-black rotate-12 shadow-lg shadow-(--main-color)/20' : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20 hover:text-white'}`}
                    >
                        {inBag ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={2} />}
                    </button>
                    <button onClick={onClick} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all group/info">
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const DetailPanel = ({ item, exchangeRate, onClose, inBag, onToggleBag, onRemove, onAcquire, onUpdateRating }: any) => {
    const n = normalizeInventoryData(item.data);
    const [rating, setRating] = useState(n.rating || 0);
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const setGalleryMedia = useSetAtom(ActiveGalleryMediaAtom);
    const setGalleryIndex = useSetAtom(ActiveGalleryIndexAtom);

    const mediaList = useMemo(() => {
        const raw = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = n.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [n.generatedPngUrl, n.mediaUrls]);

    const activeMediaUrl = mediaList[activeMediaIndex] || '';
    const activeIsVideo = isVideoFile(activeMediaUrl);

    useEffect(() => {
        setGalleryMedia(mediaList);
    }, [mediaList, setGalleryMedia]);

    const handleUpdateRating = (val: number) => {
        setRating(val);
        onUpdateRating(val);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const scrollIndex = Math.round(container.scrollLeft / container.clientWidth);
        if (scrollIndex !== activeMediaIndex && scrollIndex >= 0 && scrollIndex < mediaList.length) {
            setActiveMediaIndex(scrollIndex);
        }
    };

    const [showConfirmRemove, setShowConfirmRemove] = useState(false);

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-black shadow-2xl z-50 flex flex-col border-l border-white/5 animate-in slide-in-from-right duration-500 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Header / Nav */}
            <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-white/5 bg-black/40 backdrop-blur-xl z-20">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mb-1">Store / Artifact</span>
                    <span className="text-xs font-black text-white uppercase italic tracking-tighter leading-none">{n.itemId}</span>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={onToggleBag} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${inBag ? 'bg-(--main-color) text-black rotate-12' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                        {inBag ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={2} />}
                    </button>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Scroll Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                
                {/* Hero Feature Section */}
                <div className="relative w-full aspect-4/5 md:aspect-video flex items-center justify-center bg-black overflow-hidden group/hero">
                    <div 
                        className="h-full w-full overflow-x-auto snap-x snap-mandatory no-scrollbar flex scroll-smooth" 
                        onScroll={handleScroll}
                    >
                        {mediaList.map((url, idx) => (
                            <div key={idx} className="h-full w-full snap-center shrink-0 flex items-center justify-center relative bg-black/20">
                                {isVideoFile(url) ? (
                                    <video src={url} className="h-full w-full object-contain" autoPlay muted loop />
                                ) : (
                                    <img src={getCleanImageUrl(url)} className="h-full w-full object-contain" />
                                )}
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={() => { setGalleryIndex(activeMediaIndex); setShowFullscreen(true); }}
                        className="absolute bottom-6 right-6 w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:scale-110 active:scale-90 transition-all opacity-0 group-hover/hero:opacity-100"
                    >
                        <Maximize2 size={18} />
                    </button>

                    {/* Progress indicators */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                        {mediaList.map((_, idx) => (
                            <div key={idx} className={`h-1 rounded-full transition-all duration-500 ${idx === activeMediaIndex ? 'bg-(--main-color) w-6' : 'bg-white/10 w-1'}`} />
                        ))}
                    </div>
                </div>

                <div className="p-8 flex flex-col gap-10">
                    {/* Primary Info */}
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-start gap-4">
                            <h2 className="text-4xl font-black text-white italic tracking-tighter leading-none uppercase">{n.shape} {n.shortDescription}</h2>
                            <div className="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-end">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Asking</span>
                                <span className="text-2xl font-black text-(--main-color) font-mono">${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1">Curation</span>
                                <StarRating rating={rating} onChange={handleUpdateRating} size={14} />
                            </div>
                            <div className="w-px h-8 bg-white/5" />
                            <div className="flex flex-col">
                                <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1">USD Estimate</span>
                                <span className="text-sm font-black text-white/60 font-mono">${(Number(n.price_mxn || n.price || 0) / exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Meta Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-white/2 border border-white/5 rounded-3xl flex flex-col gap-2">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Specs</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                                <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-white/60 uppercase tracking-widest">{n.color}</span>
                                <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-white/60 uppercase tracking-widest">{n.material}</span>
                                <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-white/60 uppercase tracking-widest">{n.weightKg}KG</span>
                            </div>
                        </div>
                        <div className="p-6 bg-white/2 border border-white/5 rounded-3xl flex flex-col gap-2">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Dimensions</span>
                            <span className="text-sm font-black text-white/60 uppercase italic tracking-tighter mt-1">{n.width} x {n.length} x {n.height} <span className="text-[9px] opacity-40 ml-1">CM</span></span>
                        </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="p-8 bg-(--main-color)/5 border border-(--main-color)/10 rounded-[40px] flex flex-col gap-4 relative overflow-hidden group/actions">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/actions:opacity-20 transition-opacity">
                            <Zap size={100} strokeWidth={0.5} />
                        </div>
                        <div className="flex flex-col text-center gap-2 mb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-(--main-color)">Workforce Dispatch</span>
                            <p className="text-[9px] font-bold text-white/30 uppercase leading-relaxed max-w-[240px] mx-auto">Move this artifact from catalog status to the acquisition pipeline.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={() => onAcquire(item)}
                                className="py-5 bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] rounded-none hover:bg-(--main-color) transition-all flex items-center justify-center gap-2"
                            >
                                Fast Acquire <ArrowRight size={14} />
                            </button>
                            <button 
                                onClick={() => setShowConfirmRemove(true)}
                                className="py-5 bg-black text-rose-500 text-[10px] font-black uppercase tracking-[0.3em] rounded-none border border-rose-500/20 hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2"
                            >
                                <Trash2 size={14} /> Remove Item
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            </div>

            {showFullscreen && <FullscreenImageViewer src={activeMediaUrl!} isVideo={activeIsVideo} rating={rating} onUpdateRating={(r: number) => handleUpdateRating(r)} onClose={() => setShowFullscreen(false)} />}
        </div>
    );
};


/* ─── Gallery Full Item ─── */

const GalleryFullItem = ({ item, onOpenDetails }: { item: any; onOpenDetails: () => void }) => {
    const n = normalizeInventoryData(item.data);
    const mediaUrls = useMemo(() => {
        const raw = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = n.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [n.generatedPngUrl, n.mediaUrls]);

    const primaryMedia = mediaUrls[0] || '';
    const isVideo = primaryMedia.toLowerCase().endsWith('.mp4') || primaryMedia.toLowerCase().endsWith('.mov');
    const vendorPrefix = n.itemId?.split('-')[0];
    const vColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';

    return (
        <div className="h-full w-full bg-black relative flex flex-col justify-center items-center overflow-hidden">
            {/* Immersive Background */}
            <div className="absolute inset-0 z-0">
                {primaryMedia ? (
                    isVideo ? (
                        <video src={primaryMedia} className="w-full h-full object-cover grayscale-[0.2]" autoPlay muted loop />
                    ) : (
                        <img src={getCleanImageUrl(primaryMedia)} className="w-full h-full object-cover grayscale-[0.2]" />
                    )
                ) : (
                   <div className="w-full h-full bg-black/40 flex items-center justify-center">
                       <PackageSearch size={160} className="text-white/5" strokeWidth={1} />
                   </div>
                )}
                <div className="absolute inset-0 bg-linear-to-b from-black/40 via-transparent to-black/90" />
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
            </div>

            {/* UI Overlay */}
            <div className="absolute inset-0 z-10 p-10 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top duration-700">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: vColor, boxShadow: `0 0 10px ${vColor}` }} />
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.5em]">{vendorPrefix}</span>
                        </div>
                        <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-none max-w-xl">{n.shape} {n.shortDescription}</h2>
                    </div>
                    
                    <div className="pointer-events-auto flex flex-col gap-4 animate-in slide-in-from-right duration-700">
                        <button 
                            onClick={onOpenDetails}
                            className="w-16 h-16 flex items-center justify-center text-white/40 hover:text-white transition-all"
                        >
                            <Info size={28} strokeWidth={1.5} />
                        </button>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom duration-700">
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black text-white tracking-tighter italic">${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">MXN</span>
                        </div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">{n.color} | {n.material} | {n.weightKg}KG</p>
                    </div>

                    <div className="pointer-events-auto mb-4 animate-in slide-in-from-bottom duration-700" style={{ animationDelay: '200ms' }}>
                        <button 
                            onClick={onOpenDetails}
                            className="flex items-center gap-6 text-white group/acq"
                        >
                            <span className="text-xs font-black uppercase tracking-[0.5em] group-hover/acq:mr-2 transition-all">Acquire Artifact</span>
                            <ArrowRight size={24} strokeWidth={2} className="group-hover/acq:text-(--main-color) transition-colors" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Hint for vertical scroll */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-20 flex flex-col items-center gap-2">
                 <div className="w-px h-10 bg-white" />
                 <span className="text-[8px] font-black uppercase tracking-[1em] rotate-90 ml-2">Scroll</span>
            </div>
        </div>
    );
};

/* ─── Fullscreen Image Viewer ─── */

const FullscreenImageViewer = ({ src, isVideo, rating, onUpdateRating, onClose }: { src: string; isVideo: boolean; rating: number; onUpdateRating: (r: number) => void; onClose: () => void }) => {
    const mediaUrls = useAtomValue(ActiveGalleryMediaAtom);
    const [activeIndex, setActiveIndex] = useAtom(ActiveGalleryIndexAtom);

    // Zoom State
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [startDist, setStartDist] = useState(0);
    const [lastScale, setLastScale] = useState(1);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (scale !== 1) return; // Disable gallery swiping when zoomed
        const container = e.currentTarget;
        const scrollIndex = Math.round(container.scrollLeft / container.clientWidth);
        if (scrollIndex !== activeIndex && scrollIndex >= 0 && scrollIndex < mediaUrls.length) {
            setActiveIndex(scrollIndex);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' && (e as any).nativeEvent.touches.length === 2) {
            const t = (e as any).nativeEvent.touches;
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            setStartDist(dist);
            setLastScale(scale);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' && (e as any).nativeEvent.touches.length === 2) {
            const t = (e as any).nativeEvent.touches;
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const factor = dist / startDist;
            const newScale = Math.min(Math.max(lastScale * factor, 1), 5);
            setScale(newScale);
        }
    };

    const resetZoom = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-100000 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500 overflow-hidden flex flex-col items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
        >
            {/* Top Navigation / Progress */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-50">
                <div className="flex gap-2">
                    {mediaUrls.map((_, idx) => (
                        <div 
                            key={idx} 
                            className={`w-1 h-1 rounded-full transition-all duration-500 ${idx === activeIndex ? 'bg-(--main-color) w-8' : 'bg-white/10'}`} 
                        />
                    ))}
                </div>
            </div>

            {/* Scale Indicator */}
            {scale > 1 && (
                <div className="absolute top-24 px-4 py-1 bg-white/10 rounded-full text-[10px] font-black text-white/40 uppercase tracking-widest z-50">
                    Zoom: {scale.toFixed(1)}x
                </div>
            )}

            {/* Main scrollable gallery */}
            <div 
                className={`w-full h-full flex scroll-smooth ${scale === 1 ? 'overflow-x-auto snap-x snap-mandatory no-scrollbar' : 'overflow-hidden'}`}
                onScroll={handleScroll}
            >
                {mediaUrls.map((url, idx) => (
                    <div key={idx} className="h-full w-full snap-start shrink-0 relative flex items-center justify-center p-4 overflow-hidden">
                        {isVideoFile(url) ? (
                            <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" />
                        ) : (
                            <div 
                                style={{ 
                                    transform: `scale(${idx === activeIndex ? scale : 1}) translate(${offset.x}px, ${offset.y}px)`,
                                    transition: startDist === 0 ? 'transform 0.1s ease-out' : 'none'
                                }}
                                className="w-full h-full flex items-center justify-center touch-none"
                            >
                                <img 
                                    src={getCleanImageUrl(url)} 
                                    className="max-h-full max-w-full object-contain select-none shadow-2xl" 
                                    alt="" 
                                    onDoubleClick={() => scale === 1 ? setScale(2.5) : resetZoom()}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 inset-x-0 px-20 flex items-center justify-between z-50 pointer-events-none">
                <div className="bg-black/40 backdrop-blur-xl border border-white/5 px-6 py-3 rounded-full pointer-events-auto">
                    <StarRating rating={rating} onChange={onUpdateRating} size={14} />
                </div>
                
                <div className="flex gap-4 pointer-events-auto">
                    {scale > 1 && (
                        <button 
                            onClick={resetZoom}
                            className="w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-all uppercase text-[8px] font-black tracking-tighter"
                        >
                            Reset
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="group w-14 h-14 bg-white/5 hover:bg-white text-white hover:text-black border border-white/10 transition-all rounded-full flex items-center justify-center"
                    >
                        <X size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default StoreView;
