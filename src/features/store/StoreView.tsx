import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { userAtom, storeShoppingBagAtom, storeSearchTermAtom, exchangeRateAtom, liveExchangeRateAtom } from '../../lib/atoms';
import { extractFileId, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { InventoryItemData, InventoryItem } from '../../lib/Types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Search, X, ChevronLeft, ChevronRight, Play, ShoppingBag, ZoomIn, Tag, PackageSearch, Filter, ArrowRight, Grid3X3, List, ChevronDown, Check, Trash2, Download, ExternalLink } from 'lucide-react';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollToPlugin);

/* ─── Premium Glassmorphism UI Components ────────────────────────── */

const GlassCard = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-500 hover:border-white/20 hover:bg-white/10 ${className}`}
    >
        {children}
    </div>
);

const Badge = ({ children, color = 'var(--main-color)' }: { children: React.ReactNode, color?: string }) => (
    <span
        className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 shadow-lg"
        style={{
            backgroundColor: `${color}20`,
            color: color,
            borderColor: `${color}40`
        }}
    >
        {children}
    </span>
);

/* ─── Fullscreen Zoomable Image Viewer ─────────────────────────────── */
const FullscreenImageViewer = ({ src, onClose }: { src: string; onClose: () => void }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const imgRef = useRef<HTMLImageElement>(null);

    return (
        <div className="fixed inset-0 z-1000 bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-500" onClick={onClose}>
            <button onClick={onClose} className="absolute top-8 right-8 z-50 p-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all scale-100 hover:scale-110">
                <X className="w-6 h-6" />
            </button>
            <div className="absolute top-8 left-8 flex flex-col gap-1">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Advanced Viewer</span>
                <span className="text-[10px] font-medium text-white/20">Scroll to Zoom • Drag to Pan</span>
            </div>
            <img
                ref={imgRef}
                src={src}
                alt=""
                className="max-w-[95vw] max-h-[95vh] object-contain transition-transform duration-200 cursor-zoom-in"
                style={{ transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)` }}
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.001)))}
            />
        </div>
    );
};

/* ─── Poster Detail View ─────────────────────────────────────────────── */
const StorePoster = ({ item, onClose, onAddToCart }: { item: InventoryItem, onClose: () => void, onAddToCart: (item: InventoryItem) => void }) => {
    const posterRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);
    const [galleryIdx, setGalleryIdx] = useState(0);
    const [showFullImage, setShowFullImage] = useState(false);

    const norm = normalizeInventoryData(item.data);
    const exchangeRate = useAtomValue(liveExchangeRateAtom) || useAtomValue(exchangeRateAtom) || 18;
    const calc = calculateCodesAndPrices({ ...norm, price: norm.price_mxn || norm.price }, exchangeRate, '326');
    const mediaList = (item.data as any)._allMedia || [];
    const currentMedia = mediaList[galleryIdx] || item.imageUrl;
    const isVideo = currentMedia?.match(/\.(mp4|webm|ogg|mov)$/i);

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.from(".poster-entrance", {
                y: 100,
                opacity: 0,
                duration: 1,
                stagger: 0.1,
                ease: "expo.out"
            });
            gsap.from(".bg-zoom", {
                scale: 1.5,
                duration: 2,
                ease: "power2.out"
            });
        }, posterRef);
        return () => ctx.revert();
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const top = e.currentTarget.scrollTop;
        const height = e.currentTarget.scrollHeight - e.currentTarget.clientHeight;
        const progress = top / height;

        if (bgRef.current) {
            gsap.to(bgRef.current, {
                y: top * 0.5,
                scale: 1 + progress * 0.2,
                opacity: 1 - progress * 0.8,
                duration: 0.1
            });
        }
    };

    return (
        <div ref={posterRef} className="fixed inset-0 z-500 flex items-center justify-center bg-black animate-in fade-in duration-500">
            {/* Parallax Background */}
            <div ref={bgRef} className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/40 to-black z-10" />
                {item.imageUrl && !isVideo ? (
                    <img src={item.imageUrl} className="w-full h-full object-cover bg-zoom" alt="" />
                ) : (
                    <div className="w-full h-full bg-linear-to-br from-neutral-900 to-black" />
                )}
            </div>

            <div
                className="relative z-20 w-full h-full overflow-y-auto overflow-x-hidden custom-scrollbar"
                onScroll={handleScroll}
            >
                <div className="max-w-6xl mx-auto min-h-screen px-6 py-20 flex flex-col justify-end">
                    {/* Header Info */}
                    <div className="flex flex-col gap-6 mb-12">
                        <div className="flex items-center gap-4 poster-entrance">
                            <Badge color={vendors[norm.itemId?.split('-')[0] as keyof typeof vendors]?.color}>{norm.itemId}</Badge>
                            <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em]">Inventory Item #{norm.itemNumber}</span>
                        </div>

                        <h1 className="text-6xl md:text-8xl font-black text-white poster-entrance leading-[0.9] tracking-tighter" style={{ fontFamily: 'Playfair Display, serif' }}>
                            {norm.shape}
                        </h1>

                        <div className="flex flex-wrap items-center gap-8 poster-entrance">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Material</span>
                                <span className="text-xl font-medium text-white/80">{norm.material || 'Natural Element'}</span>
                            </div>
                            <div className="h-10 w-px bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Color Palette</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: norm.color }} />
                                    <span className="text-xl font-medium text-white/80">{norm.color || 'Prismatic'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start mt-20">
                        {/* Left: Description & Specs */}
                        <div className="lg:col-span-12 space-y-16">
                            <div className="max-w-3xl poster-entrance">
                                <h2 className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.5em] mb-6">Discovery & Purpose</h2>
                                <p className="text-2xl md:text-3xl text-white/90 leading-relaxed font-light" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {norm.shortDescription || "A masterfully crafted piece that captures the raw essence of natural beauty through form and texture."}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 poster-entrance">
                                <GlassCard className="p-8 flex flex-col gap-4">
                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Length</span>
                                    <span className="text-2xl font-bold text-white">{norm.lengthCm || '-'} <span className="text-sm opacity-30">CM</span></span>
                                    <span className="text-xs text-white/30 font-mono">{(Number(norm.lengthCm) / 2.54).toFixed(1)} IN</span>
                                </GlassCard>
                                <GlassCard className="p-8 flex flex-col gap-4">
                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Width</span>
                                    <span className="text-2xl font-bold text-white">{norm.widthCm || '-'} <span className="text-sm opacity-30">CM</span></span>
                                    <span className="text-xs text-white/30 font-mono">{(Number(norm.widthCm) / 2.54).toFixed(1)} IN</span>
                                </GlassCard>
                                <GlassCard className="p-8 flex flex-col gap-4">
                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Height</span>
                                    <span className="text-2xl font-bold text-white">{norm.heightCm || '-'} <span className="text-sm opacity-30">CM</span></span>
                                    <span className="text-xs text-white/30 font-mono">{(Number(norm.heightCm) / 2.54).toFixed(1)} IN</span>
                                </GlassCard>
                                <GlassCard className="p-8 flex flex-col gap-4">
                                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Weight</span>
                                    <span className="text-2xl font-bold text-white">{norm.weightKg || '-'} <span className="text-sm opacity-30">KG</span></span>
                                    <span className="text-xs text-white/30 font-mono">{(Number(norm.weightKg) * 2.20462).toFixed(1)} LBS</span>
                                </GlassCard>
                            </div>

                            {/* Gallery Section */}
                            <div className="poster-entrance">
                                <h2 className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.5em] mb-12 text-center">Visual Narrative</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {mediaList.map((url: string, idx: number) => {
                                        const isVid = url.match(/\.(mp4|webm|ogg|mov)$/i);
                                        return (
                                            <div
                                                key={idx}
                                                className={`relative rounded-3xl overflow-hidden cursor-pointer aspect-square bg-white/5 border border-white/10 group active:scale-95 transition-all duration-500 ${idx === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}
                                                onClick={() => { setGalleryIdx(idx); if (!isVid) setShowFullImage(true); }}
                                            >
                                                {isVid ? (
                                                    <video src={url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" muted loop playsInline autoPlay />
                                                ) : (
                                                    <img src={url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" alt="" />
                                                )}
                                                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-8">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">View Perspective {idx + 1}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bottom CTA Section */}
                            <div className="py-40 flex flex-col items-center gap-12 poster-entrance">
                                <div className="text-center">
                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.5em] mb-6 block">Investment</span>
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-7xl md:text-9xl font-black text-white tracking-tighter" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                            ${(Number(norm.price_mxn || norm.price || 0)).toLocaleString()}
                                        </span>
                                        <span className="text-2xl font-black text-white/30 tracking-widest uppercase">MXN</span>
                                    </div>
                                    <div className="text-white/20 text-sm font-bold mt-4 tracking-widest uppercase">
                                        Approx. ${(Number(norm.price_mxn || norm.price || 0) / exchangeRate).toFixed(2)} USD
                                    </div>
                                </div>

                                <button
                                    onClick={() => { onAddToCart(item); onClose(); }}
                                    className="group relative px-12 py-6 rounded-full bg-(--main-color) text-black font-black text-xl tracking-widest transition-all hover:scale-105 active:scale-95 shadow-2xl"
                                >
                                    <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
                                    ADD TO COLLECTION
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Overlays */}
            <button
                onClick={onClose}
                className="absolute top-8 right-8 z-600 p-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all scale-100 hover:scale-110 backdrop-blur-md"
            >
                <X className="w-6 h-6" />
            </button>

            {showFullImage && <FullscreenImageViewer src={mediaList[galleryIdx]} onClose={() => setShowFullImage(false)} />}
        </div>
    );
};

/* ─── Main Store Component ──────────────────────────────────────────── */

export function StoreView() {
    const [user] = useAtom(userAtom);
    const [shoppingBag, setShoppingBag] = useAtom(storeShoppingBagAtom);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isBagOpen, setIsBagOpen] = useState(false);
    const [storeLogo, setStoreLogo] = useState('');
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [search, setSearch] = useState('');
    const [activeVendor, setActiveVendor] = useState('all');

    const isClient = user?.role === 'Client';
    const isVendor = user?.role === 'Vendor';
    const exchangeRate = useAtomValue(liveExchangeRateAtom) || useAtomValue(exchangeRateAtom) || 18;

    const mainContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function fetchStoreItems() {
            setLoading(true);
            const { data, error } = await supabase.from('inventory').select('*').in('status', ['Available', 'Avaiable', 'Catalog']).order('timestamp', { ascending: false });
            if (!error && data) {
                const mappedItems: InventoryItem[] = data.map(d => {
                    let mediaList: string[] = [];
                    if (Array.isArray(d.image_urls)) mediaList.push(...d.image_urls);
                    else if (d.image_urls) {
                        try { const p = JSON.parse(d.image_urls); if (Array.isArray(p)) mediaList.push(...p); else mediaList.push(d.image_urls); } catch { mediaList.push(d.image_urls); }
                    }
                    if (d.media_urls) mediaList.push(...d.media_urls.split(',').map((u: string) => u.trim()).filter(Boolean));
                    if (d.generatedPngUrl && !mediaList.includes(d.generatedPngUrl)) mediaList.push(d.generatedPngUrl);

                    mediaList = mediaList.map(url => {
                        const clean = url.trim();
                        const fileId = extractFileId(clean);
                        if (fileId && clean.toLowerCase().includes('drive.google.com') && !clean.match(/\.(mp4|webm|ogg|mov)$/i)) {
                            return `https://lh3.googleusercontent.com/d/${fileId}`;
                        }
                        return clean;
                    }).filter(Boolean);

                    return {
                        row: d.id,
                        label: d.name || d.item_id || 'Item',
                        imageUrl: mediaList[0] || null,
                        data: { ...d, itemId: d.item_id, itemNumber: d.item_number, _allMedia: mediaList } as InventoryItemData
                    };
                });
                setItems(isVendor && user?.name ? mappedItems.filter(m => m.data.itemId?.toUpperCase().startsWith(user.name.toUpperCase())) : mappedItems);
            }
            setLoading(false);
        }

        async function fetchUserStoreSettings() {
            if (user?.id) {
                const { data } = await supabase.from('app_users').select('*').eq('id', user.id).single();
                if (data) setStoreLogo(data.store_logo || '');
            }
        }

        if (user) { fetchStoreItems(); fetchUserStoreSettings(); }
    }, [user, isVendor]);

    useEffect(() => {
        if (mainContainerRef.current) {
            gsap.from(".fade-in-item", {
                y: 30,
                opacity: 0,
                duration: 0.8,
                stagger: 0.05,
                ease: "power3.out"
            });
        }
    }, [items, search, activeVendor]);

    const handleAddToCart = (item: InventoryItem) => {
        if (!shoppingBag.find(b => b.row === item.row)) setShoppingBag(prev => [...prev, item]);
    };

    const handleCheckout = async () => {
        if (shoppingBag.length === 0) return;
        const itemIds = shoppingBag.map(i => i.data.itemId || i.row);
        if (isVendor) {
            await supabase.from('inventory').update({ status: 'Delete Requested' }).in('item_id', itemIds);
            alert('Selection finalized. Inventory update requested.');
        } else {
            await supabase.from('inventory').update({ status: 'Acquisition', acquired_by: user?.id }).in('item_id', itemIds);
            alert('Collection acquisition confirmed!');
        }
        setShoppingBag([]); setIsBagOpen(false);
    };

    const filteredItems = items.filter(item => {
        const s = search.toLowerCase();
        const matchesSearch = !search ||
            (item.data.shape || '').toLowerCase().includes(s) ||
            (item.data.material || '').toLowerCase().includes(s) ||
            (item.data.itemNumber || '').toString().includes(s) ||
            (item.data.itemId || '').toLowerCase().includes(s);

        const matchesVendor = activeVendor === 'all' || item.data.itemId?.split('-')[0] === activeVendor;
        return matchesSearch && matchesVendor;
    });

    const vendorOptions = ['all', ...Array.from(new Set(items.map(i => i.data.itemId?.split('-')[0]).filter(Boolean)))];

    return (
        <div ref={mainContainerRef} className="flex flex-col h-full bg-black overflow-hidden relative selection:bg-(--main-color) selection:text-black">

            {/* Elegant Header */}
            <header className="fixed top-0 left-0 right-0 z-100 px-8 py-6 flex items-center justify-between pointer-events-none">
                <div className="flex flex-col gap-1 pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-2xl flex items-center justify-center p-1.5 overflow-hidden">
                            {storeLogo ? <img src={storeLogo} className="w-full h-full object-contain" alt="Logo" /> : <div className="w-full h-full bg-(--main-color)/20 rounded-lg animate-pulse" />}
                        </div>
                        <span className="text-xl font-black text-white tracking-widest uppercase" style={{ fontFamily: 'Playfair Display, serif' }}>ONYX <span className="text-(--main-color)">OS</span></span>
                    </div>
                    <span className="text-[9px] font-black text-white/30 tracking-[0.4em] uppercase ml-1">Rare Earth Gallery Collection</span>
                </div>

                <div className="flex items-center gap-4 pointer-events-auto">
                    {/* Search Pill */}
                    <GlassCard className="hidden md:flex items-center px-4 py-2 gap-3 h-12 w-64 border-white/5 transition-all focus-within:w-80 focus-within:border-white/20">
                        <Search className="w-4 h-4 text-white/30" />
                        <input
                            type="text"
                            placeholder="Explore collection..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-white/20"
                        />
                    </GlassCard>

                    <button
                        onClick={() => setIsBagOpen(true)}
                        className="relative p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center group active:scale-95 backdrop-blur-2xl"
                    >
                        <ShoppingBag className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" strokeWidth={2.5} />
                        {shoppingBag.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-(--main-color) text-black text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-4 border-black shadow-2xl">
                                {shoppingBag.length}
                            </span>
                        )}
                    </button>

                    {/* User profile / vendor display hidden for space */}
                </div>
            </header>

            {/* Collection Feed */}
            <main className="flex-1 overflow-y-auto px-8 pt-32 pb-20 custom-scrollbar scroll-smooth">
                {/* Visual Header / Featured */}
                <div className="max-w-7xl mx-auto mb-20 fade-in-item">
                    <h2 className="text-[10px] font-black text-white/20 uppercase tracking-[0.8em] mb-4 text-center">Curated Selection</h2>
                    <h3 className="text-5xl md:text-7xl font-bold text-white text-center tracking-tighter" style={{ fontFamily: 'Playfair Display, serif' }}>
                        Ephemeral <span className="italic text-(--main-color)/60">Treasures</span>
                    </h3>
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-12 fade-in-item">
                    {vendorOptions.map(v => (
                        <button
                            key={v}
                            onClick={() => setActiveVendor(v)}
                            className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeVendor === v ? 'bg-white text-black scale-110 shadow-lg' : 'bg-white/5 text-white/40 hover:text-white border border-white/5 hover:bg-white/10'}`}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
                        <div className="w-16 h-px bg-white/10 relative overflow-hidden">
                            <div className="absolute inset-0 bg-(--main-color) animate-loading-bar" />
                        </div>
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em]">Synchronizing Collection</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] opacity-30 gap-6">
                        <PackageSearch size={80} strokeWidth={1} />
                        <span className="text-xl font-light uppercase tracking-widest">No artifacts found</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 max-w-[1900px] mx-auto">
                        {filteredItems.map(item => {
                            const n = normalizeInventoryData(item.data);
                            const inBag = shoppingBag.some(b => b.row === item.row);
                            const vendorColor = vendors[n.itemId?.split('-')[0] as keyof typeof vendors]?.color || 'var(--main-color)';

                            return (
                                <div
                                    key={item.row}
                                    onClick={() => setSelectedItem(item)}
                                    className="fade-in-item group relative flex flex-col gap-4 cursor-pointer"
                                >
                                    <div className="relative aspect-3/4 rounded-[2.5rem] overflow-hidden bg-neutral-900 border border-white/5 transition-all duration-700 group-hover:scale-[1.02] group-hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]">
                                        {/* Luxury Image Preview */}
                                        {item.imageUrl ? (
                                            <img
                                                src={item.imageUrl}
                                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-[2s] ease-out"
                                                alt={item.label}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/5"><PackageSearch size={64} /></div>
                                        )}

                                        {/* Overlay Gradients */}
                                        <div className="absolute inset-0 bg-linear-to-t from-black via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-700" />

                                        {/* In-Bag Marker */}
                                        {inBag && (
                                            <div className="absolute top-6 right-6 w-10 h-10 rounded-full bg-(--main-color) flex items-center justify-center shadow-2xl animate-in zoom-in duration-300">
                                                <Check className="w-5 h-5 text-black" strokeWidth={3} />
                                            </div>
                                        )}

                                        {/* Meta Tags - Floating bottom */}
                                        <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                                            <div className="flex flex-col gap-2">
                                                <Badge color={vendorColor}>{n.itemId}</Badge>
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-white/50" />
                                                    <span className="text-xs font-mono font-bold text-white uppercase">{n.itemNumber}</span>
                                                </div>
                                            </div>
                                            <GlassCard className="p-3 border-white/10 backdrop-blur-2xl">
                                                <ArrowRight className="w-5 h-5 text-white opacity-40 group-hover:opacity-100 transition-opacity" />
                                            </GlassCard>
                                        </div>
                                    </div>

                                    {/* Text Info */}
                                    <div className="px-4 flex flex-col gap-1">
                                        <div className="flex items-center justify-between gap-4">
                                            <h4 className="text-lg font-bold text-white/90 truncate group-hover:text-white transition-colors">{n.shape}</h4>
                                            <span className="text-lg font-black text-(--main-color)" style={{ fontFamily: 'Outfit, sans-serif' }}>${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/30 uppercase tracking-widest font-black leading-none">{n.material} • {n.color}</span>
                                            <span className="text-[10px] text-white/10 font-bold uppercase tracking-tighter">MXN COLLECTION</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Luxury Detail View Overlay */}
            {selectedItem && (
                <StorePoster
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onAddToCart={handleAddToCart}
                />
            )}

            {/* Refined Bag Sidebar */}
            {isBagOpen && (
                <div className="fixed inset-0 z-1000 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500" onClick={() => setIsBagOpen(false)} />
                    <div className="relative w-full sm:w-[500px] h-full bg-[#0a0a0a] border-l border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-right duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]">

                        <div className="p-10 flex items-center justify-between border-b border-white/5">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-3xl font-black text-white tracking-widest uppercase italic" style={{ fontFamily: 'Playfair Display, serif' }}>Acquisition <span className="text-(--main-color)">Bag</span></h2>
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Reviewing {shoppingBag.length} Selection{shoppingBag.length !== 1 ? 's' : ''}</span>
                            </div>
                            <button onClick={() => setIsBagOpen(false)} className="p-4 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all scale-100 hover:scale-110">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-6 custom-scrollbar">
                            {shoppingBag.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-8 opacity-10">
                                    <ShoppingBag size={120} strokeWidth={1} />
                                    <span className="text-xl font-light uppercase tracking-[0.5em]">Inventory clear</span>
                                </div>
                            ) : shoppingBag.map(item => {
                                const n = normalizeInventoryData(item.data);
                                return (
                                    <div key={item.row} className="group relative flex items-center gap-6 p-6 rounded-3xl bg-white/2 border border-white/5 hover:bg-white/4 hover:border-white/10 transition-all">
                                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-black/40 border border-white/5 shrink-0 shadow-lg">
                                            {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" alt="" /> : <PackageSearch className="w-full h-full p-6 text-white/5" />}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <Badge color={vendors[n.itemId?.split('-')[0] as keyof typeof vendors]?.color}>{n.itemId}</Badge>
                                                <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest italic truncate">{n.material}</span>
                                            </div>
                                            <h4 className="text-lg font-bold text-white group-hover:text-(--main-color) transition-colors truncate">{n.shape}</h4>
                                            <div className="flex items-center gap-1.5 mt-2">
                                                <span className="text-lg font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                                                <span className="text-[9px] font-black text-white/20 uppercase">MXN</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShoppingBag(prev => prev.filter(b => b.row !== item.row))}
                                            className="p-3 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all scale-90 hover:scale-100 opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer Summary */}
                        <div className="p-10 border-t border-white/5 bg-black/40 backdrop-blur-3xl">
                            <div className="space-y-4 mb-10">
                                <div className="flex justify-between items-center opacity-40">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Base Value</span>
                                    <span className="text-lg font-medium">${shoppingBag.reduce((sum, item) => sum + Number(item.data.price_mxn || item.data.price || 0), 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-(--main-color)">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Aggregate Total</span>
                                    <div className="flex flex-col items-end">
                                        <span className="text-4xl font-black italic tracking-tighter" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                            ${shoppingBag.reduce((sum, item) => sum + Number(item.data.price_mxn || item.data.price || 0), 0).toLocaleString()}
                                        </span>
                                        <span className="text-[9px] font-black opacity-40 uppercase tracking-widest mt-1">
                                            Approx. ${(shoppingBag.reduce((sum, item) => sum + Number(item.data.price_mxn || item.data.price || 0), 0) / exchangeRate).toFixed(2)} USD
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    disabled={shoppingBag.length === 0}
                                    onClick={handleCheckout}
                                    className="w-full py-6 rounded-full bg-(--main-color) text-black font-black text-lg tracking-[0.2em] shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed uppercase"
                                >
                                    {isVendor ? 'EXECUTE DISPERSAL' : 'CONFIRM ACQUISITION'}
                                </button>
                                <div className="flex justify-center">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Official Transaction Protocol v2.5</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Background Texture/Noise */}
            <div className="fixed inset-0 z-0 opacity-20 pointer-events-none mix-blend-overlay contrast-150 saturate-0"
                style={{ backgroundImage: `url('https://grainy-gradients.vercel.app/noise.svg')` }} />

            <style>{`
                @keyframes loading-bar {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-loading-bar {
                    animation: loading-bar 1.5s infinite ease-in-out;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: var(--main-color);
                }
            `}</style>
        </div>
    );
}
