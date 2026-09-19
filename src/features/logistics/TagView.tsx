import React, { useEffect, useState, useCallback } from 'react';
import { formatWeightImperialOnly, formatDimensionsImperialOnly } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { COLOR_PALETTE } from '../../lib/colorExtractor';
import { fetchPublicArtifactRecord, PublicArtifactRecord } from '../../lib/artifactUtils';
import { Package, ChevronLeft, ChevronRight, X, Share2, Maximize2, Check } from 'lucide-react';
import { OnyxLogo } from '../../components/OnyxLogo';
import { tr } from '../../lib/i18n';
import './TagView.css';

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
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const minSwipeDistance = 50;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIdx(p => (p + 1) % images.length);
            if (e.key === 'ArrowLeft') setIdx(p => (p - 1 + images.length) % images.length);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length, onClose]);

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe) setIdx(p => (p + 1) % images.length);
        if (isRightSwipe) setIdx(p => (p - 1 + images.length) % images.length);
    };

    return (
        <div 
            className="fixed inset-0 z-[9999] bg-black flex flex-col" 
            onClick={onClose}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
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
                    key={idx}
                    src={images[idx]}
                    className="max-w-full max-h-full object-contain select-none animate-in fade-in zoom-in-95 duration-300"
                    draggable={false}
                />
            </div>

            {/* Chevrons */}
            {images.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p - 1 + images.length) % images.length); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white/20 hover:text-white transition-all active:scale-95 hidden sm:flex">
                        <ChevronLeft size={48} strokeWidth={1} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p + 1) % images.length); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white/20 hover:text-white transition-all active:scale-95 hidden sm:flex">
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

// ── The public tag page ─────────────────────────────────────────────────────
//
// What someone sees when they scan the QR on a piece. It renders ONE thing: the
// curated public record the `artifact` edge function assembles on the server
// (fetchPublicArtifactRecord) — for every visitor, signed in or not. That record
// carries processed photographs only, the AI title / body / classification /
// colours, the specs, the AQ and LD codes and USD retail, and nothing else: no
// MXN figure, no acquisition or landed cost, no raw upload. Signed-in visitors
// used to reach this page through resolveArtifact's `select('*')`, which put the
// whole row — cost included — in the browser; they now get the same record as
// everyone else, because a printed tag is public however it is opened.
//
// Neumorphic: one warm stone surface, raised and pressed forms lit from the top
// left, a hairline on every control for contrast. The page's own styles live in
// TagView.css, scoped to #tagview.

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const imperialDims = (w: number | null, h: number | null, l: number | null) =>
    formatDimensionsImperialOnly(w, h, l).split(' x ').map(p => p.replace(/ /g, ' ')).join(' × ');
const metricDims = (w: number | null, h: number | null, l: number | null) =>
    [w, h, l].filter(v => v != null).join(' × ');

const SWATCHES: Record<string, string> = COLOR_PALETTE.reduce((acc, c) => {
    acc[c.name.toLowerCase()] = `rgb(${c.rgb.join(', ')})`;
    return acc;
}, {} as Record<string, string>);
const swatchFor = (name: string) => {
    const k = name.trim().toLowerCase().replace('grey', 'gray');
    if (k === 'multicolor' || k === 'rainbow') return 'conic-gradient(#dc2626, #eab308, #16a34a, #2563eb, #9333ea, #dc2626)';
    return SWATCHES[k] || 'transparent';
};

export const TagView: React.FC<TagViewProps> = ({ tagId, onBack }) => {
    const [record, setRecord] = useState<PublicArtifactRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(0);
    const [showViewer, setShowViewer] = useState(false);
    const [copied, setCopied] = useState(false);

    // The page scrolls itself; the app shell underneath must not.
    useEffect(() => {
        const root = document.getElementById('root');
        const prev = { body: document.body.style.overflow, html: document.documentElement.style.overflow, root: root?.style.overflow };
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        if (root) root.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev.body;
            document.documentElement.style.overflow = prev.html;
            if (root && prev.root !== undefined) root.style.overflow = prev.root;
        };
    }, []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setActive(0);
        fetchPublicArtifactRecord(tagId).then(r => {
            if (!alive) return;
            setRecord(r);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [tagId]);

    const share = useCallback(() => {
        const url = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${encodeURIComponent(tagId)}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [tagId]);

    const vendorColor = (vendors as any)[(record?.vendor || tagId.slice(0, 2)).toUpperCase()]?.color || '#9CA3AF';
    const tagText = (record?.tag || tagId).toUpperCase();

    // The tag key — the printed label, rendered: vendor colour block, then the code.
    const tagKey = (size: 'lg' | 'sm') => (
        <span className={`tv-tag tv-tag--${size}`} aria-label={`${tr("Tag")} ${tagText}`}>
            <span className="tv-tag-v" style={{ backgroundColor: vendorColor }}>{tagText.slice(0, 5)}</span>
            <span className="tv-tag-c">{tagText.slice(5)}</span>
        </span>
    );

    const bar = (
        <header className="tv-bar">
            <div className="tv-bar-l">
                {onBack && (
                    <button type="button" className="tv-btn tv-btn--icon" onClick={onBack} aria-label={tr("Back")}>
                        <ChevronLeft size={18} strokeWidth={2.5} />
                    </button>
                )}
                <OnyxLogo width={22} height={22} />
            </div>
            {tagKey('sm')}
            <button type="button" className="tv-btn" onClick={share} aria-live="polite">
                {copied ? <Check size={15} strokeWidth={2.5} /> : <Share2 size={15} strokeWidth={2.5} />}
                <span>{copied ? tr("Copied") : tr("Copy link")}</span>
            </button>
        </header>
    );

    // ── Loading ──────────────────────────────────────────────────────────────
    if (loading) return (
        <div id="tagview" aria-busy="true">
            {bar}
            <main className="tv-main">
                <div className="tv-gallery"><div className="tv-well tv-hero tv-skel" /></div>
                <div className="tv-info">
                    <div className="tv-skel tv-skel-line" style={{ width: '40%' }} />
                    <div className="tv-skel tv-skel-line tv-skel-title" />
                    <div className="tv-skel tv-skel-line" style={{ width: '65%' }} />
                    <div className="tv-cards"><div className="tv-card tv-skel-card" /><div className="tv-card tv-skel-card" /></div>
                </div>
            </main>
        </div>
    );

    // ── Not found ────────────────────────────────────────────────────────────
    if (!record) return (
        <div id="tagview">
            {bar}
            <main className="tv-empty">
                <div className="tv-well tv-empty-mark"><Package size={40} strokeWidth={1.25} /></div>
                <h1 className="tv-empty-h">{tr("Tag not found")}</h1>
                <p className="tv-empty-p">{tr("No piece is registered under")} <span className="tv-mono">{tagText}</span>. {tr("Check the code on the label and scan again.")}</p>
            </main>
        </div>
    );

    // ── The piece ────────────────────────────────────────────────────────────
    const { specs, codes, images } = record;
    const hasDims = specs.widthCm != null || specs.heightCm != null || specs.lengthCm != null;
    const heroSrc = images[active] || images[0];

    return (
        <div id="tagview">
            {showViewer && images.length > 0 && (
                <FullscreenViewer images={images} initialIdx={active} onClose={() => setShowViewer(false)} />
            )}
            {bar}

            <main className="tv-main">
                {/* Photographs — processed only. Without any, the piece's
                    axonometric render stands in, and says that it is one. */}
                <section className="tv-gallery" aria-label={tr("Photographs")}>
                    {images.length > 0 ? (
                        <>
                            <button type="button" className="tv-well tv-hero" onClick={() => setShowViewer(true)} aria-label={tr("Open photographs full screen")}>
                                <img src={heroSrc} alt={record.title || record.name} />
                                <span className="tv-hero-zoom" aria-hidden="true"><Maximize2 size={14} strokeWidth={2.5} /></span>
                                {images.length > 1 && <span className="tv-hero-count">{active + 1} / {images.length}</span>}
                            </button>
                            {images.length > 1 && (
                                <div className="tv-thumbs" role="tablist" aria-label={tr("Choose a photograph")}>
                                    {images.map((src, i) => (
                                        <button key={src} type="button" role="tab" aria-selected={i === active}
                                            className={`tv-thumb${i === active ? ' is-on' : ''}`} onClick={() => setActive(i)}>
                                            <img src={src} alt="" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="tv-well tv-hero tv-hero--render">
                            {record.icon
                                ? <img src={record.icon} alt={tr("Proportional render of the piece")} />
                                : <Package size={56} strokeWidth={1} />}
                            <span className="tv-render-note">{record.icon ? tr("Proportional render · photographs in processing") : tr("Photographs in processing")}</span>
                        </div>
                    )}
                </section>

                <section className="tv-info" aria-label={tr("Piece details")}>
                    <div className="tv-id">
                        {tagKey('lg')}
                        {record.quantity > 1 && <span className="tv-chip">×{record.quantity} {tr("pieces")}</span>}
                    </div>

                    <h1 className="tv-title">{record.title || record.name || tagText}</h1>
                    <p className="tv-sub">
                        {record.name && <span>{record.name}</span>}
                        {record.name && record.stone && <span className="tv-dot" aria-hidden="true">·</span>}
                        {record.stone && <span>{record.stone}</span>}
                    </p>

                    {record.type.length > 0 && (
                        <nav className="tv-crumbs" aria-label={tr("Category")}>
                            {record.type.map((t, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />}
                                    <span>{t}</span>
                                </React.Fragment>
                            ))}
                        </nav>
                    )}

                    <div className="tv-cards">
                        {/* SPECS */}
                        <article className="tv-card tv-specs">
                            <h2 className="tv-card-t">{tr("Specs")}</h2>
                            <div className="tv-specs-body">
                                {record.icon && (
                                    <div className="tv-well tv-axo" aria-hidden="true"><img src={record.icon} alt="" /></div>
                                )}
                                <dl className="tv-measures">
                                    {hasDims && (
                                        <div>
                                            <dt>{tr("Size")}</dt>
                                            <dd>
                                                <span className="tv-mono tv-big">{imperialDims(specs.widthCm, specs.heightCm, specs.lengthCm)}</span>
                                                <span className="tv-mono tv-small">{metricDims(specs.widthCm, specs.heightCm, specs.lengthCm)} cm</span>
                                            </dd>
                                        </div>
                                    )}
                                    {specs.weightKg != null && (
                                        <div>
                                            <dt>{tr("Weight")}</dt>
                                            <dd>
                                                <span className="tv-mono tv-big">{formatWeightImperialOnly(specs.weightKg)}</span>
                                                <span className="tv-mono tv-small">{specs.weightKg} kg</span>
                                            </dd>
                                        </div>
                                    )}
                                    {!hasDims && specs.weightKg == null && <div><dd className="tv-small">{tr("Measurements pending")}</dd></div>}
                                </dl>
                            </div>
                        </article>

                        {/* RETAIL + CODES — the only figures this page carries. */}
                        <article className="tv-card tv-value">
                            <h2 className="tv-card-t">{tr("Retail")}</h2>
                            {record.retailUsd != null
                                ? <p className="tv-price"><span className="tv-price-n">{fmtUsd(record.retailUsd)}</span><span className="tv-price-u">USD</span></p>
                                : <p className="tv-small">{tr("On request")}</p>}
                            {(codes.aq || codes.ld) && (
                                <div className="tv-codes" aria-label={tr("Codes")}>
                                    {codes.aq && <span className="tv-code"><span className="tv-code-k">AQ</span><span className="tv-mono">{codes.aq}</span></span>}
                                    {codes.ld && <span className="tv-code"><span className="tv-code-k">LD</span><span className="tv-mono">{codes.ld}</span></span>}
                                </div>
                            )}
                        </article>
                    </div>

                    {record.colors.length > 0 && (
                        <div className="tv-colors" aria-label={tr("Colours")}>
                            {record.colors.map(c => (
                                <span key={c} className="tv-color"><span className="tv-sw" style={{ background: swatchFor(c) }} aria-hidden="true" />{c}</span>
                            ))}
                        </div>
                    )}

                    {record.body && (
                        <article className="tv-card tv-desc">
                            <h2 className="tv-card-t">{tr("About this piece")}</h2>
                            <p>{record.body}</p>
                        </article>
                    )}
                </section>
            </main>

            <footer className="tv-foot">
                <OnyxLogo width={16} height={16} />
                <span className="tv-mono">{tagText}</span>
            </footer>
        </div>
    );
};
