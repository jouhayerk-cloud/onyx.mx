import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import {
    Package, Loader2, ChevronLeft, ChevronRight, X,
    ZoomIn, Share2, Maximize2, Maximize
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
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all pointer-events-auto active:scale-90">
                    <X size={18} />
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
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all active:scale-90">
                        <ChevronLeft size={24} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p + 1) % images.length); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all active:scale-90">
                        <ChevronRight size={24} />
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
        const fetchStandalone = async () => {
            if (!tagId) return;
            setLoading(true);
            try {
                const { data: directData } = await supabase.from('inventory').select('*').eq('book_barcode', tagId).maybeSingle();
                if (directData) { setFetchedItem({ data: directData }); return; }

                const match = tagId.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
                if (match) {
                    const [_, vendorPrefix, wbStr, itemNumStr] = match;
                    const { data: parsedData } = await supabase.from('inventory').select('*')
                        .or(`workbook.eq.${wbStr},workbook.eq.V${wbStr},workbook.eq.v${wbStr}`)
                        .eq('item_number', parseInt(itemNumStr, 10));
                    const found = parsedData?.find(d => String(d.item_id || d.itemId || d.id || '').toUpperCase().startsWith(vendorPrefix.toUpperCase()));
                    if (found) { setFetchedItem({ data: found }); return; }
                }

                const { data: prodData } = await supabase.from('production').select('*').eq('tag_id', tagId).maybeSingle();
                if (prodData) setFetchedItem({ data: prodData, source: 'production' });
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchStandalone();
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
        navigator.clipboard.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

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
                <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em] max-w-xs">{tagId} · Artifact trace could not be resolved</p>
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
    const weightStr = norm.weightKg ? `${norm.weightKg} kg` : null;

    const materialLabel = [norm.color, norm.material].filter(Boolean).join(' ') || 'Natural Stone';
    const typeLabel = [norm.shape, norm.shortDescription].filter(Boolean).join(' ') || 'Stone Artifact';

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="h-screen overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white selection:bg-white/20 selection:text-white">
            {showViewer && (
                <FullscreenViewer images={item.images} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />
            )}

            {/* ── TOP NAV BAR ── */}
            <div className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 h-14 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5">
                {/* Logo + back */}
                <div className="flex items-center gap-3">
                    {onBack ? (
                        <button onClick={onBack} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                            <ChevronLeft size={16} />
                        </button>
                    ) : null}
                    <OnyxLogo width={20} height={20} className="opacity-60" />
                </div>

                {/* Tag ID badge */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vendorColor }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">{tagId}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button onClick={handleShare}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                        <Share2 size={12} />
                        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
                    </button>
                    {item.images.length > 0 && (
                        <button onClick={() => openViewer(0)}
                            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                            <Maximize size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── MAIN CARD ── gallery-card style, full width ── */}
            <div className="max-w-5xl mx-auto w-full">

                {/* ── IMAGE GRID ── */}
                <div className="overflow-hidden bg-[#111] border-b border-white/5">
                    <ImageGrid images={item.images} onOpenViewer={openViewer} />
                </div>

                {/* ── DETAILS PANEL ── */}
                <div className="p-5 sm:p-8 flex flex-col gap-6 bg-[#111] border-b border-white/5">
                    {/* Row 1: Barcode tag + codes + title */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Vendor barcode tag */}
                            <div className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight text-black" style={{ backgroundColor: vendorColor }}>
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
                        <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.25em]">
                            {materialLabel}
                        </p>
                    </div>

                    {/* Row 2: Specs horizontal strip */}
                    <div className="flex items-start gap-6 flex-nowrap py-4 border-y border-white/5 overflow-x-auto no-scrollbar">
                        {dimensionsStr && (
                            <div className="flex flex-col gap-1 shrink-0">
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Dimensions</span>
                                <span className="text-[11px] font-mono text-white/60">{dimensionsStr} cm</span>
                            </div>
                        )}
                        {weightStr && (
                            <>
                                <div className="w-px h-8 bg-white/5 shrink-0" />
                                <div className="flex flex-col gap-1 shrink-0">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Weight</span>
                                    <span className="text-[11px] font-mono text-white/60">{weightStr}</span>
                                </div>
                            </>
                        )}
                        {norm.quantity && Number(norm.quantity) > 1 && (
                            <>
                                <div className="w-px h-8 bg-white/5 shrink-0" />
                                <div className="flex flex-col gap-1 shrink-0">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Quantity</span>
                                    <span className="text-[11px] font-mono text-white/60">× {norm.quantity}</span>
                                </div>
                            </>
                        )}
                        {item.images.length > 0 && (
                            <>
                                <div className="w-px h-8 bg-white/5 shrink-0" />
                                <div className="flex flex-col gap-1 shrink-0">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Images</span>
                                    <span className="text-[11px] font-mono text-white/60">{item.images.length} files</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Row 3: Retail price (public, no financials gate) */}
                    {codes.bookRetail && (
                        <div className="flex items-baseline gap-3">
                            <span className="text-4xl font-black text-white font-mono">${codes.bookRetail}</span>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">USD · Retail</span>
                        </div>
                    )}
                </div>

                {/* ── IMAGE THUMBNAIL STRIP (clickable, accessible on mobile) ── */}
                {item.images.length > 1 && (
                    <div className="p-4 sm:p-6 bg-[#0f0f0f] border-b border-white/5">
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-3">{item.images.length} Images — Tap to View</p>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {item.images.map((src, i) => (
                                <div key={i} onClick={() => openViewer(i)}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 cursor-zoom-in transition-all hover:ring-2 hover:ring-white/30 active:scale-95">
                                    <img src={src} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
