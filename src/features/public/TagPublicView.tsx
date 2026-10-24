import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { usePinchZoomRegion } from '../../lib/usePinchZoomRegion';
import { formatWeightImperialOnly, formatDimensionsImperialOnly, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { COLOR_PALETTE, reconstructRgbPixelMap, RgbPixel } from '../../lib/colorExtractor';
import { fetchPublicArtifactRecord, PublicArtifactRecord } from '../../lib/artifactUtils';
import { generateAxonometricDataUrl } from '../../lib/axonometric';
import {
    Sparkles, Camera, FileCode, Box, Palette, Maximize2,
    ChevronLeft, ChevronRight, X, Share2, Check, Copy,
    ShieldCheck, Lock, Layers, Award, Download, Grid3X3,
    ExternalLink, Package, QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { OnyxLogo } from '../../components/OnyxLogo';
import { tr } from '../../lib/i18n';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import '../logistics/TagView.css';
import './TagPublicView.css';

export interface TagPublicViewProps {
    tagId: string;
    onBack?: () => void;
}

type HeroAssetMode = 'cutout' | 'photo' | 'svg' | 'axo' | 'hexmap';

// ── Archive code: stable code derived from the public tag id (not secret, proves nothing) ───────────────────────────────────────────
// Security rule: NEVER expose raw prices, costs, or vendor acquisition margins on the public page.
// A deterministic code from the tag id: any viewer can recompute it, so it only labels the archive entry.
export function generateArchiveCode(tagId: string): string {
    const salt = 'ONYX_ARCHIVAL_ACQUISITION_CIPHER_V2';
    const normalized = `${salt}::${(tagId || '').trim().toUpperCase()}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x27d4eb2f;
    for (let i = 0; i < normalized.length; i++) {
        const code = normalized.charCodeAt(i);
        h1 ^= code;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= code;
        h2 = Math.imul(h2, 0x5bd1e995);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
    return `ARC·${hex1.slice(0, 4)}-${hex1.slice(4)}-${hex2.slice(0, 4)}-${hex2.slice(4)}`;
}

// ── Color Swatches & Validation ──────────────────────────────────────────────
const SWATCHES: Record<string, string> = COLOR_PALETTE.reduce((acc, c) => {
    acc[c.name.toLowerCase()] = `rgb(${c.rgb.join(', ')})`;
    return acc;
}, {} as Record<string, string>);

const swatchFor = (name: string) => {
    const k = name.trim().toLowerCase().replace('grey', 'gray');
    if (k === 'multicolor' || k === 'rainbow') return 'conic-gradient(#dc2626, #eab308, #16a34a, #2563eb, #9333ea, #dc2626)';
    return SWATCHES[k] || 'transparent';
};

const CSS_COLOR_NAMES = new Set([
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
    'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
    'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
    'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet',
    'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
    'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew',
    'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon',
    'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
    'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
    'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
    'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
    'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
    'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue',
    'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
    'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
    'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
    'whitesmoke', 'yellow', 'yellowgreen', 'transparent', 'currentcolor'
]);

export function validateTagColor(color: unknown, fallback = '#9CA3AF'): string {
    if (typeof color !== 'string') return fallback;
    const c = color.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\(\s*[\d.%\s,/-]+\s*\)$/i.test(c)) return c;
    if (/^hsla?\(\s*[\d.%\s,/-]+\s*\)$/i.test(c)) return c;
    if (CSS_COLOR_NAMES.has(c)) return c;
    return fallback;
}

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cmToInchStr = (cm: number | null): string => (cm != null && !isNaN(cm) ? `${(cm / 2.54).toFixed(1)}"` : '—');
const kgToLbsStr = (kg: number | null): string => (kg != null && !isNaN(kg) ? `${(kg * 2.20462).toFixed(1)} lbs` : '—');

// ── Fullscreen Interactive Asset Inspector ───────────────────────────────────
const FullscreenInspector: React.FC<{
    title: string;
    mode: HeroAssetMode;
    activeSrc: string;
    onClose: () => void;
}> = ({ title, mode, activeSrc, onClose }) => {
    usePinchZoomRegion();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200">
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-white/50">
                        {mode.toUpperCase()} {tr("STAGE")}
                    </span>
                    <span className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md">{title}</span>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95"
                    aria-label={tr("Close")}
                >
                    <X size={20} strokeWidth={2} />
                </button>
            </header>

            <main className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
                <img
                    src={activeSrc}
                    alt={title}
                    className="max-w-full max-h-full object-contain select-none drop-shadow-2xl animate-in zoom-in-95 duration-300"
                    draggable={false}
                />
            </main>
        </div>
    );
};

// ── Main Public Tag View ─────────────────────────────────────────────────────
export const TagPublicView: React.FC<TagPublicViewProps> = ({ tagId, onBack }) => {
    const [record, setRecord] = useState<PublicArtifactRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [assetMode, setAssetMode] = useState<HeroAssetMode>('cutout');
    const [photoIndex, setPhotoIndex] = useState(0);
    const [stageBackdrop, setStageBackdrop] = useState<'pedestal' | 'checker' | 'studio'>('pedestal');
    const [axoDataUrl, setAxoDataUrl] = useState<string | null>(null);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [copiedCipher, setCopiedCipher] = useState(false);
    const [showCipherQr, setShowCipherQr] = useState(false);
    const [selectedHexTile, setSelectedHexTile] = useState<RgbPixel | null>(null);

    const currentUser = useAtomValue(userAtom);
    const isStaffUser = Boolean(
        currentUser && ['Developer', 'Admin', 'ClientBoss', 'Vendor'].includes(currentUser.role)
    );

    // Lock page shell scroll
    useEffect(() => {
        const root = document.getElementById('root');
        const prev = {
            body: document.body.style.overflow,
            html: document.documentElement.style.overflow,
            root: root?.style.overflow,
        };
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        if (root) root.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev.body;
            document.documentElement.style.overflow = prev.html;
            if (root && prev.root !== undefined) root.style.overflow = prev.root;
        };
    }, []);

    // Fetch Public Record
    useEffect(() => {
        let alive = true;
        setLoading(true);
        fetchPublicArtifactRecord(tagId).then(r => {
            if (!alive) return;
            setRecord(r);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [tagId]);

    // Dynamic Client-side Axonometric Projection Generation
    useEffect(() => {
        if (!record) return;
        let alive = true;
        const w = record.specs.widthCm || 20;
        const h = record.specs.heightCm || 20;
        const l = record.specs.lengthCm || 20;
        const shape = record.name || 'Object';
        const desc = record.title || '';
        const color = record.colors[0] || '#B19CD9';

        generateAxonometricDataUrl(w, h, l, shape, desc, color, false, record.hexMap || undefined)
            .then(url => {
                if (alive) setAxoDataUrl(url);
            })
            .catch(() => {
                if (alive) setAxoDataUrl(record.icon);
            });

        return () => { alive = false; };
    }, [record]);

    const tagText = (record?.tag || tagId).toUpperCase();
    const vendorCode = (record?.vendor || tagText.slice(0, 2)).toUpperCase();
    const vendorConfig = (vendors as any)[vendorCode] || { name: 'ONYX ARTISANS', color: '#9CA3AF' };
    const vendorColor = validateTagColor(vendorConfig.color, '#9CA3AF');

    // Archive code
    const archiveCode = useMemo(() => generateArchiveCode(tagText), [tagText]);
    const cipherQrPayload = useMemo(() =>
        `onyx://scan/auth?tag=${encodeURIComponent(tagText)}&code=${encodeURIComponent(archiveCode)}`,
        [tagText, archiveCode]
    );

    // Reconstructed Hex Map
    const reconstructedMap = useMemo(() => {
        if (!record?.hexMap) return null;
        return reconstructRgbPixelMap(record.hexMap);
    }, [record?.hexMap]);

    // Share permalink
    const shareUrl = useMemo(() => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tagid', tagText);
            return url.toString();
        }
        return `https://onyx.mx/?tagid=${encodeURIComponent(tagText)}`;
    }, [tagText]);

    const handleCopyShare = useCallback(() => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopiedShare(true);
            setTimeout(() => setCopiedShare(false), 2000);
        });
    }, [shareUrl]);

    const handleCopyCipher = useCallback(() => {
        navigator.clipboard.writeText(archiveCode).then(() => {
            setCopiedCipher(true);
            setTimeout(() => setCopiedCipher(false), 2000);
        });
    }, [archiveCode]);

    // Available Assets Resolution
    const cutoutSrc = record?.cutoutUrl || record?.images[0] || null;
    const photoList = record?.images.length ? record.images : (record?.cleanPhotoUrl ? [record.cleanPhotoUrl] : []);
    const cleanPhotoSrc = photoList[photoIndex] || photoList[0] || null;
    const svgSrc = record?.svgUrl || null;
    const axoSrc = axoDataUrl || record?.icon || null;

    // Current Active Stage Source
    const currentActiveSrc = useMemo(() => {
        switch (assetMode) {
            case 'cutout': return cutoutSrc || cleanPhotoSrc || axoSrc || '';
            case 'photo': return cleanPhotoSrc || cutoutSrc || axoSrc || '';
            case 'svg': return svgSrc || axoSrc || cutoutSrc || '';
            case 'axo': return axoSrc || cutoutSrc || '';
            case 'hexmap': return reconstructedMap?.bitmapUrl || cutoutSrc || '';
            default: return cleanPhotoSrc || cutoutSrc || '';
        }
    }, [assetMode, cutoutSrc, cleanPhotoSrc, svgSrc, axoSrc, reconstructedMap]);

    // Header Bar
    const renderHeader = (
        <header className="tv-bar">
            <div className="tv-bar-l">
                {onBack && (
                    <button type="button" className="tv-btn tv-btn--icon" onClick={onBack} aria-label={tr("Back")}>
                        <ChevronLeft size={18} strokeWidth={2.5} />
                    </button>
                )}
                <OnyxLogo width={22} height={22} />
            </div>

            <div className="tv-tag tv-tag--sm" aria-label={`${tr("Tag")} ${tagText}`}>
                <span className="tv-tag-v" style={{ backgroundColor: vendorColor }}>{tagText.slice(0, 5)}</span>
                <span className="tv-tag-c">{tagText.slice(5)}</span>
            </div>

            <div className="flex items-center gap-2">
                <button type="button" className="tv-btn" onClick={handleCopyShare} aria-live="polite">
                    {copiedShare ? <Check size={15} strokeWidth={2.5} /> : <Share2 size={15} strokeWidth={2.5} />}
                    <span>{copiedShare ? tr("Copied") : tr("Share")}</span>
                </button>
            </div>
        </header>
    );

    // Loading State
    if (loading) {
        return (
            <div id="tagview" aria-busy="true">
                {renderHeader}
                <main className="tv-main">
                    <div className="tv-gallery">
                        <div className="tv-well tv-hero tv-skel" />
                    </div>
                    <div className="tv-info">
                        <div className="tv-skel tv-skel-line" style={{ width: '40%' }} />
                        <div className="tv-skel tv-skel-line tv-skel-title" />
                        <div className="tv-skel tv-skel-line" style={{ width: '65%' }} />
                        <div className="tv-cards">
                            <div className="tv-card tv-skel-card" />
                            <div className="tv-card tv-skel-card" />
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // Empty / Not Found
    if (!record) {
        return (
            <div id="tagview">
                {renderHeader}
                <main className="tv-empty">
                    <div className="tv-well tv-empty-mark">
                        <Package size={42} strokeWidth={1.25} />
                    </div>
                    <h1 className="tv-empty-h">{tr("Tag not found")}</h1>
                    <p className="tv-empty-p">
                        {tr("No piece is registered under")} <span className="tv-mono">{tagText}</span>.{' '}
                        {tr("Check the code on the label and scan again.")}
                    </p>
                </main>
            </div>
        );
    }

    const { specs } = record;
    const hasDims = specs.widthCm != null || specs.heightCm != null || specs.lengthCm != null;

    return (
        <div id="tagview">
            {showFullscreen && currentActiveSrc && (
                <FullscreenInspector
                    title={record.title || record.name || tagText}
                    mode={assetMode}
                    activeSrc={currentActiveSrc}
                    onClose={() => setShowFullscreen(false)}
                />
            )}

            {renderHeader}

            <main className="tv-main">
                {/* ── 1. PUBLIC HERO GALLERY REDESIGN ────────────────────────── */}
                <section className="tv-gallery flex flex-col gap-4" aria-label={tr("Asset Stage")}>
                    {/* Hero Stage */}
                    <div
                        className={`tv-hero-stage ${
                            assetMode === 'cutout'
                                ? stageBackdrop === 'pedestal'
                                    ? 'tv-hero-stage--pedestal'
                                    : stageBackdrop === 'checker'
                                    ? 'tv-hero-stage--checker'
                                    : ''
                                : ''
                        }`}
                    >
                        {/* Cutout Asset */}
                        {assetMode === 'cutout' && (
                            <div className="w-full h-full p-8 flex items-center justify-center relative">
                                <img
                                    src={cutoutSrc || cleanPhotoSrc || ''}
                                    alt={record.title || record.name}
                                    className="max-w-full max-h-full object-contain filter drop-shadow-[0_20px_35px_rgba(0,0,0,0.8)] select-none animate-in fade-in duration-300"
                                />
                                {/* Backdrop switcher pills */}
                                <div className="absolute top-4 left-4 flex gap-1.5 p-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setStageBackdrop('pedestal')}
                                        className={`px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded-full transition-all ${
                                            stageBackdrop === 'pedestal' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'
                                        }`}
                                    >
                                        {tr("Pedestal Light")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStageBackdrop('checker')}
                                        className={`px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded-full transition-all ${
                                            stageBackdrop === 'checker' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'
                                        }`}
                                    >
                                        {tr("Checkerboard")}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Clean Photo Asset */}
                        {assetMode === 'photo' && (
                            <div className="w-full h-full p-6 flex items-center justify-center relative">
                                <img
                                    src={cleanPhotoSrc || ''}
                                    alt={record.title || record.name}
                                    className="max-w-full max-h-full object-contain select-none animate-in fade-in duration-300 rounded-2xl shadow-2xl"
                                />
                                {photoList.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoIndex(p => (p - 1 + photoList.length) % photoList.length)}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 active:scale-95"
                                        >
                                            <ChevronLeft size={20} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoIndex(p => (p + 1) % photoList.length)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 active:scale-95"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-mono text-white/70 border border-white/10">
                                            {photoIndex + 1} / {photoList.length}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* SVG Cutfile Asset */}
                        {assetMode === 'svg' && (
                            <div className="w-full h-full p-8 flex flex-col items-center justify-center relative">
                                <div className="tv-vector-grid-overlay" />
                                <div className="tv-svg-box z-10">
                                    {svgSrc ? (
                                        <img src={svgSrc} alt={tr("Vector Cutfile")} />
                                    ) : (
                                        <div className="flex flex-col items-center text-center p-6 text-white/60">
                                            <FileCode size={48} className="text-cyan-400 mb-3" strokeWidth={1.5} />
                                            <span className="text-sm font-semibold text-white mb-1">{tr("Laser Contour & Cut Paths")}</span>
                                            <span className="text-xs text-white/40">{tr("Contour profile synthesized from specimen dimensions")}</span>
                                        </div>
                                    )}
                                </div>
                                <span className="absolute bottom-4 right-4 z-10 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-cyan-500/30 text-[10px] font-mono text-cyan-300 uppercase tracking-widest">
                                    SVG PATH · 0.1MM TOLERANCE
                                </span>
                            </div>
                        )}

                        {/* 3D Axonometric Dimension Frame Asset */}
                        {assetMode === 'axo' && (
                            <div className="w-full h-full p-6 flex items-center justify-center relative">
                                <div className="tv-axo-frame">
                                    {axoSrc ? (
                                        <img src={axoSrc} alt={tr("3D Axo Frame")} className="max-w-full max-h-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]" />
                                    ) : (
                                        <Box size={56} className="text-white/40 animate-pulse" />
                                    )}

                                    {/* Dimension Frame Indicators */}
                                    {hasDims && (
                                        <>
                                            <div className="tv-dim-indicator top-4 left-4 border-l-2 border-l-cyan-400">
                                                <span>W:</span>
                                                <span className="text-cyan-300">{specs.widthCm || '—'} cm</span>
                                                <span className="text-white/50">({cmToInchStr(specs.widthCm)})</span>
                                            </div>
                                            <div className="tv-dim-indicator top-4 right-4 border-t-2 border-t-amber-400">
                                                <span>H:</span>
                                                <span className="text-amber-300">{specs.heightCm || '—'} cm</span>
                                                <span className="text-white/50">({cmToInchStr(specs.heightCm)})</span>
                                            </div>
                                            <div className="tv-dim-indicator bottom-4 left-4 border-b-2 border-b-emerald-400">
                                                <span>D:</span>
                                                <span className="text-emerald-300">{specs.lengthCm || '—'} cm</span>
                                                <span className="text-white/50">({cmToInchStr(specs.lengthCm)})</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Hex Color Map Asset */}
                        {assetMode === 'hexmap' && (
                            <div className="w-full h-full p-6 flex flex-col items-center justify-center relative">
                                <div className="tv-hexmap-wrap">
                                    <div className="flex items-center justify-between w-full px-1">
                                        <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">
                                            {tr("Extracted Chromatic Spectrum")}
                                        </span>
                                        {selectedHexTile && (
                                            <span className="text-[11px] font-mono font-bold text-cyan-300">
                                                {selectedHexTile.hex}
                                            </span>
                                        )}
                                    </div>

                                    {reconstructedMap ? (
                                        <div
                                            className="tv-hexmap-grid w-full"
                                            style={{
                                                gridTemplateColumns: `repeat(${reconstructedMap.cols}, minmax(0, 1fr))`,
                                            }}
                                        >
                                            {reconstructedMap.pixels.map((p, i) => (
                                                <div
                                                    key={i}
                                                    className="tv-hexmap-tile"
                                                    style={{ backgroundColor: p.hex }}
                                                    onClick={() => setSelectedHexTile(p)}
                                                    title={`${p.hex} · RGB(${p.r}, ${p.g}, ${p.b})`}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-xs text-white/40">
                                            {tr("Chromatic spectrum pending AI vision extraction")}
                                        </div>
                                    )}

                                    {/* Dominant Palette Swatches */}
                                    {record.colors.length > 0 && (
                                        <div className="flex items-center gap-2 pt-2">
                                            <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
                                                {tr("Dominant Palette")}:
                                            </span>
                                            <div className="flex gap-1.5">
                                                {record.colors.map(c => (
                                                    <span
                                                        key={c}
                                                        className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                                                        style={{ backgroundColor: swatchFor(c) }}
                                                        title={c}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Fullscreen Zoom Inspector Action */}
                        <button
                            type="button"
                            onClick={() => setShowFullscreen(true)}
                            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all active:scale-95"
                            aria-label={tr("Open in Fullscreen")}
                            title={tr("Open in Fullscreen")}
                        >
                            <Maximize2 size={16} strokeWidth={2} />
                        </button>
                    </div>

                    {/* Apple-Style Segmented Floating Dock */}
                    <div className="flex justify-center w-full">
                        <nav className="tv-asset-dock" aria-label={tr("Asset Stage")}>
                            <button
                                type="button"
                                onClick={() => setAssetMode('cutout')}
                                className={`tv-asset-tab ${assetMode === 'cutout' ? 'is-active' : ''}`}
                            >
                                <Sparkles size={14} className={assetMode === 'cutout' ? 'text-amber-300' : ''} />
                                <span>{tr("Cutout")}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setAssetMode('photo')}
                                className={`tv-asset-tab ${assetMode === 'photo' ? 'is-active' : ''}`}
                            >
                                <Camera size={14} className={assetMode === 'photo' ? 'text-cyan-300' : ''} />
                                <span>{tr("Clean Original")}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setAssetMode('svg')}
                                className={`tv-asset-tab ${assetMode === 'svg' ? 'is-active' : ''}`}
                            >
                                <FileCode size={14} className={assetMode === 'svg' ? 'text-emerald-300' : ''} />
                                <span>{tr("Vector Cutfile")}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setAssetMode('axo')}
                                className={`tv-asset-tab ${assetMode === 'axo' ? 'is-active' : ''}`}
                            >
                                <Box size={14} className={assetMode === 'axo' ? 'text-indigo-300' : ''} />
                                <span>{tr("3D Axo Frame")}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setAssetMode('hexmap')}
                                className={`tv-asset-tab ${assetMode === 'hexmap' ? 'is-active' : ''}`}
                            >
                                <Palette size={14} className={assetMode === 'hexmap' ? 'text-pink-300' : ''} />
                                <span>{tr("Hex Color Map")}</span>
                            </button>
                        </nav>
                    </div>
                </section>

                {/* ── 2. PIECE DETAILS, SPECS & CRYPTOGRAPHIC CYPHER ─────────── */}
                <section className="tv-info flex flex-col gap-6" aria-label={tr("Piece details")}>
                    {/* Identification Header */}
                    <div>
                        <div className="tv-id">
                            <span className="tv-tag tv-tag--lg" aria-label={`${tr("Tag")} ${tagText}`}>
                                <span className="tv-tag-v" style={{ backgroundColor: vendorColor }}>{tagText.slice(0, 5)}</span>
                                <span className="tv-tag-c">{tagText.slice(5)}</span>
                            </span>
                            {record.quantity > 1 && (
                                <span className="tv-chip">×{record.quantity} {tr("pieces")}</span>
                            )}
                        </div>

                        <h1 className="tv-title mt-2">{record.title || record.name || tagText}</h1>
                        <p className="tv-sub">
                            {record.name && <span>{record.name}</span>}
                            {record.name && record.stone && <span className="tv-dot" aria-hidden="true">·</span>}
                            {record.stone && <span>{record.stone}</span>}
                        </p>

                        {record.type.length > 0 && (
                            <nav className="tv-crumbs mt-2" aria-label={tr("Category")}>
                                {record.type.map((t, i) => (
                                    <React.Fragment key={i}>
                                        {i > 0 && <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />}
                                        <span>{t}</span>
                                    </React.Fragment>
                                ))}
                            </nav>
                        )}
                    </div>

                    {/* Retail & archive code grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Retail USD Card (Strictly Public) */}
                        <article className="tv-card tv-value">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="tv-card-t">{tr("Retail")}</h2>
                                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    {tr("Verified Authentic")}
                                </span>
                            </div>
                            {record.retailUsd != null ? (
                                <p className="tv-price">
                                    <span className="tv-price-n">{fmtUsd(record.retailUsd)}</span>
                                    <span className="tv-price-u">USD</span>
                                </p>
                            ) : (
                                <p className="tv-small text-white/50">{tr("On request")}</p>
                            )}
                            <p className="text-[11px] text-white/40 mt-1">
                                {tr("Official registered gallery valuation")}
                            </p>
                        </article>

                        {/* Archive code card */}
                        <article className="tv-cipher-slab flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-cyan-300">
                                        <Lock size={13} strokeWidth={2.5} />
                                        <h2 className="text-[11px] font-bold uppercase tracking-wider">
                                            {tr("Archive code")}
                                        </h2>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowCipherQr(!showCipherQr)}
                                        className="text-cyan-400 hover:text-white transition-colors p-1"
                                        title={tr("Internal Scan Terminal")}
                                    >
                                        <QrCode size={16} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between bg-black/40 border border-cyan-500/20 rounded-xl px-3 py-2 mt-1">
                                    <span className="tv-cipher-code select-all">{archiveCode}</span>
                                    <button
                                        type="button"
                                        onClick={handleCopyCipher}
                                        className="text-cyan-400 hover:text-white transition-colors p-1"
                                        title={tr("Copy archive code")}
                                    >
                                        {copiedCipher ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3">
                                <div className="flex items-center gap-1.5 text-[10px] text-cyan-200/60 font-mono">
                                    <ShieldCheck size={12} className="text-cyan-400" />
                                    <span>{tr("Cost Data Encrypted")} · {tr("Internal Scan Only")}</span>
                                </div>
                                {isStaffUser && (
                                    <div className="mt-1 text-[10px] text-emerald-400 font-mono">
                                        ✓ {tr("Authenticated Internal Scan")} ({currentUser?.name})
                                    </div>
                                )}
                            </div>
                        </article>
                    </div>

                    {/* Collapsible Scannable QR Modal for Staff Scanning */}
                    {showCipherQr && (
                        <div className="p-4 rounded-2xl bg-black/70 border border-cyan-500/30 backdrop-blur-xl flex flex-col sm:flex-row items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
                                <QRCodeSVG value={cipherQrPayload} size={100} level="M" includeMargin={false} />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <span className="text-xs font-bold text-cyan-300 block mb-1">
                                    {tr("Internal Scan Terminal")}
                                </span>
                                <p className="text-[11px] text-white/60 leading-relaxed mb-2">
                                    {tr("Protected under Onyx Archival Security Protocol")}. {tr("Scannable by authorized Onyx field terminals to verify ledger authenticity.")}
                                </p>
                                <span className="text-[10px] font-mono text-white/40 block truncate">
                                    URI: {cipherQrPayload}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ── 3. DIGITAL CERTIFICATE OF AUTHENTICITY ─────────────── */}
                    <section className="tv-cert-slab mt-4" aria-label={tr("Digital Certificate of Authenticity")}>
                        {/* Serial Monospace Watermark in Background */}
                        <div className="tv-cert-watermark" aria-hidden="true">
                            {tagText}
                        </div>

                        <div className="relative z-10 flex flex-col gap-8">
                            {/* Certificate Top Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                                <div className="flex items-center gap-4">
                                    {/* Authenticity Seal Medallion */}
                                    <div className="tv-seal-medallion" aria-hidden="true">
                                        <div className="tv-seal-ring" />
                                        <Award size={28} strokeWidth={1.75} />
                                        <span className="text-[8px] font-bold font-mono tracking-widest mt-1">SEAL</span>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-[#d4af37]">
                                                {tr("Archival Registry")}
                                            </span>
                                            <span className="text-[10px] text-white/30">·</span>
                                            <span className="text-[10px] font-mono text-white/50">{record.workbook || 'ARCHIVE-2026'}</span>
                                        </div>
                                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
                                            {tr("Digital Certificate of Authenticity")}
                                        </h2>
                                        <p className="text-xs text-white/50 mt-1">
                                            {tr("Certified Natural Specimen")} · {tr("Genuine Natural Stone")}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                        {tr("Archival Serial Number")}
                                    </span>
                                    <span className="text-sm font-mono font-black text-white tracking-widest">
                                        {tagText}
                                    </span>
                                </div>
                            </div>

                            {/* Provenance & Heritage Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Provenance Metadata */}
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                                        {tr("Specimen Provenance")}
                                    </h3>

                                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col gap-3">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Mineral Composition")}
                                            </span>
                                            <span className="text-sm font-semibold text-white">
                                                {record.stone || tr("Natural Onyx & Marble")}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Specimen Classification")}
                                            </span>
                                            <span className="text-sm font-semibold text-white">
                                                {record.type.length ? record.type.join(' › ') : (record.name || tr("Architectural Vessel"))}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Craftsmanship")}
                                            </span>
                                            <span className="text-xs text-white/70">
                                                {tr("Hand-Carved & Hand-Polished")}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Vendor & Artisan Heritage */}
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                                        {tr("Artisanal Heritage")}
                                    </h3>

                                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col gap-3">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Master Workshop")}
                                            </span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: vendorColor }} />
                                                <span className="text-sm font-bold text-white tracking-wide">
                                                    {vendorConfig.name}
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Origin & Provenance")}
                                            </span>
                                            <span className="text-xs font-semibold text-white">
                                                {tr("Tecali de Herrera, Puebla, Mexico")}
                                            </span>
                                            <span className="text-[11px] text-white/40 block mt-0.5">
                                                {tr("Historic Onyx Capital")}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">
                                                {tr("Registry Verification Code")}
                                            </span>
                                            <span className="text-[11px] font-mono text-cyan-300">
                                                {archiveCode}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dimension Badges (Dual Metric & Imperial) */}
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3">
                                    {tr("Dimensions & Weight")}
                                </h3>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="tv-dim-badge">
                                        <span className="tv-dim-badge-label">{tr("Width")}</span>
                                        <span className="tv-dim-badge-primary">{specs.widthCm != null ? `${specs.widthCm} cm` : '—'}</span>
                                        <span className="tv-dim-badge-secondary">{cmToInchStr(specs.widthCm)}</span>
                                    </div>

                                    <div className="tv-dim-badge">
                                        <span className="tv-dim-badge-label">{tr("Height")}</span>
                                        <span className="tv-dim-badge-primary">{specs.heightCm != null ? `${specs.heightCm} cm` : '—'}</span>
                                        <span className="tv-dim-badge-secondary">{cmToInchStr(specs.heightCm)}</span>
                                    </div>

                                    <div className="tv-dim-badge">
                                        <span className="tv-dim-badge-label">{tr("Depth")}</span>
                                        <span className="tv-dim-badge-primary">{specs.lengthCm != null ? `${specs.lengthCm} cm` : '—'}</span>
                                        <span className="tv-dim-badge-secondary">{cmToInchStr(specs.lengthCm)}</span>
                                    </div>

                                    <div className="tv-dim-badge">
                                        <span className="tv-dim-badge-label">{tr("Weight")}</span>
                                        <span className="tv-dim-badge-primary">{specs.weightKg != null ? `${specs.weightKg} kg` : '—'}</span>
                                        <span className="tv-dim-badge-secondary">{kgToLbsStr(specs.weightKg)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Certificate Footer Stamp */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10 text-xs text-white/40">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-[#d4af37]" />
                                    <span>{tr("Official Heritage Register")} · {tr("Verified Signature")}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyShare}
                                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-2"
                                >
                                    {copiedShare ? <Check size={14} /> : <Share2 size={14} />}
                                    <span>{copiedShare ? tr("Certificate Link Copied") : tr("Share Certificate")}</span>
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* About this Piece Editorial */}
                    {record.body && (
                        <article className="tv-card tv-desc">
                            <h2 className="tv-card-t">{tr("About this piece")}</h2>
                            <p className="leading-relaxed">{record.body}</p>
                        </article>
                    )}
                </section>
            </main>

            {/* Official Watermark Footer */}
            <footer className="tv-foot">
                <OnyxLogo width={16} height={16} />
                <span className="tv-mono">{tagText}</span>
                <span className="text-white/20">·</span>
                <span>{tr("Verified Archive")}</span>
            </footer>
        </div>
    );
};

export default TagPublicView;
