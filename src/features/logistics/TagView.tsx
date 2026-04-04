import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import {
    Package, Loader2, ChevronLeft, ChevronRight, X,
    ZoomIn, Share2, Maximize2, Maximize, Ruler, Scale, Layers
} from 'lucide-react';
import { OnyxLogo } from '../../components/OnyxLogo';

interface TagViewProps {
    tagId: string;
    onBack?: () => void;
}

// ── Fullscreen Image Viewer (matches inventory viewer) ─────────────────────
const FullscreenViewer: React.FC<{
    images: string[];
    initialIdx: number;
    onClose: () => void;
}> = ({ images, initialIdx, onClose }) => {
    const [idx, setIdx] = useState(initialIdx);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIdx(p => (p + 1) % images.length);
            if (e.key === 'ArrowLeft') setIdx(p => (p - 1 + images.length) % images.length);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length, onClose]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col" onClick={onClose}>
            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-4 z-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                    {idx + 1} / {images.length}
                </span>
                <button onClick={onClose} className="w-12 h-12 flex items-center justify-center text-white/40 hover:text-white transition-all pointer-events-auto active:scale-95">
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            {/* Main image */}
            <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
                <img
                    src={images[idx]}
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                />
            </div>

            {/* Chevrons */}
            {images.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p - 1 + images.length) % images.length); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white/20 hover:text-white transition-all active:scale-95">
                        <ChevronLeft size={48} strokeWidth={1} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p + 1) % images.length); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white/20 hover:text-white transition-all active:scale-95">
                        <ChevronRight size={48} strokeWidth={1} />
                    </button>
                </>
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
                <div className="flex gap-1.5 px-6 py-4 bg-gradient-to-t from-black/60 to-transparent overflow-x-auto no-scrollbar" onClick={e => e.stopPropagation()}>
                    {images.map((src, i) => (
                        <div key={i} onClick={() => setIdx(i)}
                            className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all border-2 ${i === idx ? 'border-white scale-110' : 'border-transparent opacity-40 hover:opacity-80'}`}>
                            <img src={src} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Dynamic Image Grid (mirrored from gallery card) ─────────────────────────
const ImageGrid: React.FC<{ images: string[]; onOpenViewer: (idx: number) => void }> = ({ images, onOpenViewer }) => {
    const total = images.length;
    const MAX_DISPLAY = 24;
    const visibleUrls = images.slice(0, MAX_DISPLAY);
    const remaining = total - MAX_DISPLAY;

    if (total === 0) return (
        <div className="w-full aspect-video bg-black/40 flex items-center justify-center">
            <Package size={80} strokeWidth={0.5} className="opacity-10 text-white" />
        </div>
    );

    if (total === 1) return (
        <div className="relative w-full bg-black/40 cursor-zoom-in overflow-hidden" onClick={() => onOpenViewer(0)}>
            <img src={visibleUrls[0]} className="w-full h-auto max-h-[85vh] object-contain transition-transform duration-700 hover:scale-[1.02]" />
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <ZoomIn size={14} className="text-white/60" />
            </div>
        </div>
    );

    if (total <= 3) return (
        <div className={`grid gap-px bg-black/60 ${total === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {visibleUrls.map((url, i) => (
                <div key={i} className="relative overflow-hidden bg-black/20 cursor-zoom-in group/img" onClick={() => onOpenViewer(i)}>
                    <img src={url} className="w-full h-auto max-h-[70vh] object-contain transition-transform duration-700 group-hover/img:scale-105" />
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                </div>
            ))}
        </div>
    );

    // Dense grid for 4+ images
    const gridCols = total <= 6 ? 'grid-cols-3' : total <= 12 ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-6';
    const aspectRatio = total > 18 ? 'auto' : total > 6 ? '16/9' : '4/3';

    return (
        <div className={`grid gap-px bg-black/60 ${gridCols}`} style={{ aspectRatio }}>
            {visibleUrls.map((url, i) => (
                <div key={i} className="relative overflow-hidden aspect-square cursor-zoom-in group/img" onClick={() => onOpenViewer(i)}>
                    <img src={url} className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                    {i === visibleUrls.length - 1 && remaining > 0 && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-2xl font-black text-white">+{remaining}</span>
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">More</span>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ── Main TagView ────────────────────────────────────────────────────────────
export const TagView: React.FC<TagViewProps> = ({ tagId, onBack }) => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);

    const [fetchedItem, setFetchedItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [showViewer, setShowViewer] = useState(false);
    const [copied, setCopied] = useState(false);

    // Unlock body scroll
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;
        const root = document.getElementById('root');
        const originalRootOverflow = root?.style.overflow;

        document.body.style.overflow = 'hidden'; // Lock body, scroll via TagView root
        document.documentElement.style.overflow = 'hidden';
        if (root) root.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
            if (root && originalRootOverflow !== undefined) root.style.overflow = originalRootOverflow;
        };
    }, []);

    // Fetch item
    useEffect(() => {
        const resolveItem = async () => {
            if (!tagId) return;
            setLoading(true);
            try {
                // 1. Try exact match on book_barcode (User's preferred style SU32615EE)
                const { data: directData } = await supabase.from('inventory')
                    .select('*')
                    .eq('book_barcode', tagId)
                    .maybeSingle();
                
                if (directData) { 
                    setFetchedItem({ data: directData }); 
                    return; 
                }

                // 2. Fallback: Parse barcode style (SU + 326 + 15 + EE)
                const match = tagId.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
                if (match) {
                    const [_, vendorPrefix, wbStr, itemNumStr] = match;
                    const { data: parsedData } = await supabase.from('inventory').select('*')
                        .or(`workbook.eq.${wbStr},workbook.eq.V${wbStr},workbook.eq.v${wbStr}`)
                        .eq('item_number', parseInt(itemNumStr, 10));
                    
                    if (parsedData && parsedData.length > 0) {
                        const found = parsedData.find(d => 
                            String(d.item_id || d.itemId || d.id || '').toUpperCase().startsWith(vendorPrefix.toUpperCase())
                        ) || parsedData[0];
                        setFetchedItem({ data: found }); 
                        return; 
                    }
                }

                // 3. Fallback: Production table
                const { data: prodData } = await supabase.from('production')
                    .select('*')
                    .eq('tag_id', tagId)
                    .maybeSingle();
                if (prodData) {
                    setFetchedItem({ data: prodData, source: 'production' });
                    return;
                }

                // 4. Last resort: Try as item_id (legacy SU-...)
                const { data: legacyData } = await supabase.from('inventory')
                    .select('*')
                    .eq('item_id', tagId)
                    .maybeSingle();
                if (legacyData) {
                    setFetchedItem({ data: legacyData });
                    return;
                }

            } catch (err) { 
                console.error("Artifact resolution error:", err); 
            } finally { 
                setLoading(false); 
            }
        };
        resolveItem();
    }, [tagId]);

    const item = useMemo(() => {
        if (!fetchedItem) return null;
        const data = normalizeInventoryData(fetchedItem.data);
        const codes = calculateCodesAndPrices(data, exchangeRate || 20, workbookPrefix || '326');

        const images: string[] = [];
        if (data.generatedPngUrl) images.push(data.generatedPngUrl);
        if (data.mediaUrls) String(data.mediaUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });
        if (data.generatedImageUrls) String(data.generatedImageUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });

        const uniqueImages = Array.from(new Set(images.filter(Boolean))).map(url => getCleanImageUrl(url));
        return { ...fetchedItem, data, codes, images: uniqueImages };
    }, [fetchedItem, exchangeRate, workbookPrefix]);

    const openViewer = useCallback((idx: number) => { setViewerIdx(idx); setShowViewer(true); }, []);

    const handleShare = useCallback(() => {
        // Use the Unified Hub for social previews and direct access
        const hubUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${tagId}`;
        
        navigator.clipboard.writeText(hubUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [tagId]);

    // ── Loading ─────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] gap-4">
            <Loader2 className="animate-spin text-white/20" size={36} />
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em]">Resolving Artifact</span>
        </div>
    );

    // ── Not Found ────────────────────────────────────────────────────────────
    if (!item) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] p-12 text-center gap-8">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                <Package size={48} strokeWidth={0.75} />
            </div>
            <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Trace Lost</h1>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em] max-w-xs">{String(tagId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()} · Artifact trace could not be resolved</p>
            </div>
        </div>
    );

    // ── Computed values ──────────────────────────────────────────────────────
    const vendorCode = tagId.substring(0, 2).toUpperCase();
    const vendorConfig = (vendors as any)[vendorCode];
    const vendorColor: string = vendorConfig?.color || '#6BCEBB';

    const norm = item.data;
    const codes = item.codes;

    const dimensionsStr = [
        norm.lengthCm ? `L ${norm.lengthCm}` : '',
        norm.widthCm ? `W ${norm.widthCm}` : '',
        norm.heightCm ? `H ${norm.heightCm}` : '',
    ].filter(Boolean).join(' · ') || null;

    const dimensionsInchStr = [
        norm.lengthCm ? `${(Number(norm.lengthCm) * 0.3937).toFixed(1)}"` : '',
        norm.widthCm ? `${(Number(norm.widthCm) * 0.3937).toFixed(1)}"` : '',
        norm.heightCm ? `${(Number(norm.heightCm) * 0.3937).toFixed(1)}"` : '',
    ].filter(Boolean).join(' × ') || null;

    const weightStr = norm.weightKg ? `${norm.weightKg} kg` : null;
    const weightLbs = norm.weightKg ? (Number(norm.weightKg) * 2.2046).toFixed(1) : null;

    const materialLabel = [norm.color, norm.material].filter(Boolean).join(' ') || 'Natural Stone';
    const typeLabel = [norm.shape, norm.shortDescription].filter(Boolean).join(' ') || 'Stone Artifact';

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="h-screen overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white selection:bg-white/20 selection:text-white">
            {showViewer && (
                <FullscreenViewer images={item.images} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />
            )}

            {/* ── TOP NAV BAR ── */}
            <div className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 h-16 bg-[#0a0a0a]/80 backdrop-blur-xl">
                {/* Logo + back */}
                <div className="flex items-center gap-3">
                    {onBack ? (
                        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90">
                            <ChevronLeft size={20} strokeWidth={2.5} />
                        </button>
                    ) : null}
                    <OnyxLogo width={20} height={20} className="opacity-60" />
                </div>

                {/* Tag ID badge */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vendorColor }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">{codes.bookBardcode}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4">
                    <button onClick={handleShare}
                        className="flex items-center gap-2 h-10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all active:scale-95">
                        <Share2 size={14} strokeWidth={2.5} />
                        <span className="hidden sm:inline">{copied ? 'COPIED' : 'SHARE'}</span>
                    </button>
                    {item.images.length > 0 && (
                        <button onClick={() => openViewer(0)}
                            className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95">
                            <Maximize2 size={18} strokeWidth={2} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── MAIN CARD ── gallery-card style, full width ── */}
            <div className="max-w-5xl mx-auto w-full px-4 sm:px-0">
                {/* ── IMAGE GRID ── */}
                <div className="overflow-hidden">
                    <ImageGrid images={item.images} onOpenViewer={openViewer} />
                </div>

                {/* ── DETAILS PANEL ── */}
                <div className="py-12 sm:py-20 flex flex-col gap-12">
                    {/* Row 1: Barcode tag + codes + title */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Vendor barcode tag */}
                            <div className="px-6 py-3 rounded-2xl text-base font-black uppercase tracking-tight text-black" style={{ backgroundColor: vendorColor }}>
                                {codes.bookBardcode || vendorCode}
                            </div>
                            {/* AQ / LD codes */}
                            {codes.bookAqCode && (
                                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                                    AQ {codes.bookAqCode}
                                </div>
                            )}
                            {codes.bookLandCode && (
                                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                                    LD {codes.bookLandCode}
                                </div>
                            )}
                        </div>

                        <h1 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tighter leading-tight break-words">
                            {typeLabel}
                        </h1>
                        <p className="text-lg font-bold text-white/60 uppercase tracking-[0.25em]">
                            {materialLabel}
                        </p>
                    </div>

                    {/* Row 2: Specs horizontal strip - BORDERLESS / LARGE TAGS / FLOATING ICONS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 py-4">
                        {dimensionsStr && (
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                                    <Ruler size={22} strokeWidth={1.5} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em] mb-0.5">Dimensions</span>
                                    <span className="text-xl font-black text-white font-mono leading-tight">{dimensionsInchStr} <span className="text-[10px] text-white/40 ml-1">IN</span></span>
                                    <span className="text-xs font-black text-white/30 font-mono mt-1">{dimensionsStr} <span className="text-[9px] opacity-60 uppercase">CM</span></span>
                                </div>
                            </div>
                        )}
                        {weightStr && (
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                                    <Scale size={22} strokeWidth={1.5} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em] mb-0.5">Weight</span>
                                    <span className="text-xl font-black text-white font-mono leading-tight">{weightLbs} <span className="text-[10px] text-white/40 ml-1">LBS</span></span>
                                    <span className="text-xs font-black text-white/30 font-mono mt-1">{weightStr.replace(' kg', '')} <span className="text-[9px] opacity-60 uppercase">KG</span></span>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                                <Package size={22} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em] mb-0.5">Quantity</span>
                                <span className="text-xl font-black text-white font-mono leading-tight">{norm.quantity || 1} <span className="text-[10px] text-white/40 ml-1">Items</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Retail price - HIDDEN PER USER REQUEST */}
                    {/* {codes.bookRetail && (
                        <div className="flex items-baseline gap-3">
                            <span className="text-4xl font-black text-white font-mono">${codes.bookRetail}</span>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">USD · Retail</span>
                        </div>
                    )} */}
                </div>


                {/* ── FOOTER ── */}
                <div className="px-6 py-8 sm:px-8 flex items-center justify-center bg-[#0a0a0a]">
                    <OnyxLogo width={18} height={18} className="opacity-20" />
                </div>
            </div>

            <style>{`
                :root { color-scheme: dark; }
                * { box-sizing: border-box; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
