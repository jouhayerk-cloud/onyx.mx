import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { usePinchZoomRegion } from '../../lib/usePinchZoomRegion';
import { getProductCategoryAndType, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { fetchPublicArtifactRecord, PublicArtifactRecord } from '../../lib/artifactUtils';
import {
    getAdvancedAxoDataUrl,
    getItemExtractedColors,
    generateNormalizedHexSquareDataUrl,
    getItemImages,
    ExtractedColorInfo
} from '../../lib/pdfExport';
import { ART_OF_DECOR_LOGO } from '../../lib/artOfDecorLogo';
import { RARE_EARTH_LOGO } from '../../lib/rareEarthLogo';
import {
    Maximize2,
    ChevronLeft,
    Share2,
    Check,
    Copy,
    Package,
    ShieldCheck,
    X,
    Lock,
    QrCode,
    Sparkles,
    Eye
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
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

// ── Archival acquisition cipher (proves provenance, zero cost leakage) ────────
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
export function validateTagColor(color: unknown, fallback = '#9CA3AF'): string {
    if (typeof color !== 'string') return fallback;
    const c = color.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\(\s*[\d.%\s,/-]+\s*\)$/i.test(c)) return c;
    if (/^hsla?\(\s*[\d.%\s,/-]+\s*\)$/i.test(c)) return c;
    return fallback;
}

const toImpStr = (val: any, type: 'in' | 'lbs' = 'in'): string => {
    if (val == null || isNaN(parseFloat(val))) return '—';
    const num = parseFloat(val);
    if (type === 'in') return `${(num / 2.54).toFixed(1)}"`;
    if (type === 'lbs') return `${(num * 2.20462).toFixed(1)} lbs`;
    return '—';
};

// ── Fullscreen Interactive Asset Inspector ───────────────────────────────────
const FullscreenInspector: React.FC<{
    title: string;
    activeSrc: string;
    onClose: () => void;
}> = ({ title, activeSrc, onClose }) => {
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
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-cyan-400">
                        HIGH RESOLUTION INSPECTION
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

// ── Main Luxury Catalog Public View ──────────────────────────────────────────
export const TagPublicView: React.FC<TagPublicViewProps> = ({ tagId, onBack }) => {
    const [record, setRecord] = useState<PublicArtifactRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeHeroIndex, setActiveHeroIndex] = useState(0);
    const [axoDataUrl, setAxoDataUrl] = useState<string | null>(null);
    const [hexSquareDataUrl, setHexSquareDataUrl] = useState<string | null>(null);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [copiedCipher, setCopiedCipher] = useState(false);
    const [showCipherQr, setShowCipherQr] = useState(false);

    const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

    const tagText = (record?.tag || tagId).toUpperCase();
    const vendorCode = (record?.vendor || tagText.slice(0, 2)).toUpperCase();
    const vendorConfig = (vendors as any)[vendorCode] || { name: 'ONYX ARTISANS', color: '#9CA3AF' };
    const vendorColor = validateTagColor(vendorConfig.color, '#9CA3AF');

    // Archive provenance code
    const archiveCode = useMemo(() => generateArchiveCode(tagText), [tagText]);
    const cipherQrPayload = useMemo(() =>
        `onyx://scan/auth?tag=${encodeURIComponent(tagText)}&code=${encodeURIComponent(archiveCode)}`,
        [tagText, archiveCode]
    );

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

    // ── 1. Uploaded Main Title & Classification ──────────────────────────────
    const rawItem = record?.rawItem || {};
    const shape = (rawItem.shape || record?.name || '').trim();
    const shortDesc = (rawItem.short_description && rawItem.short_description !== shape ? rawItem.short_description : '').trim();
    const color = (rawItem.color || '').trim();
    const material = (rawItem.material || '').trim();

    const mainTitleParts: string[] = [];
    if (shape || color || material) {
        if (shape) mainTitleParts.push(shape);
        if (shortDesc) mainTitleParts.push(shortDesc);
        if (color) mainTitleParts.push(color);
        if (material) mainTitleParts.push(material);
    } else if (record) {
        if (record.name) mainTitleParts.push(record.name);
        if (record.stone) mainTitleParts.push(record.stone);
    }

    const mainTitleStr = useMemo(() => {
        const rawTokens = mainTitleParts.join(' · ').split(/\s*·\s*/).filter(Boolean);
        const uniqueTokens = Array.from(new Set(rawTokens));
        return uniqueTokens.join(' · ').replace(/\s+/g, ' ').trim().toUpperCase() || tagText;
    }, [mainTitleParts, tagText]);

    const classificationStr = useMemo(() => {
        if (!record) return 'ARCHITECTURAL VESSEL';
        const catAndType = getProductCategoryAndType({
            shortDescription: rawItem.short_description || record.name,
            short_description: rawItem.short_description || record.name,
            shape: rawItem.shape || record.name,
            type: record.type,
            description: record.title || record.body
        });
        const categoryStr = (catAndType.category || (record.type[0] ?? 'HOME DECOR')).toUpperCase();
        const typeStr = (catAndType.type || (record.type[1] ?? record.type[0] ?? 'ACCENTS')).toUpperCase();
        return `${categoryStr}  ›  ${typeStr}`;
    }, [record, rawItem]);

    // Subtitle & Marketing Description
    const shopifyOrInvoiceTitle = useMemo(() => {
        if (!record) return '';
        const raw = rawItem.shopify_title ||
            rawItem.shopifyTitle ||
            rawItem.invoice_title ||
            rawItem.invoiceTitle ||
            rawItem.detailed_description ||
            rawItem.title ||
            record.title ||
            rawItem.generated_title ||
            rawItem.generatedTitle ||
            rawItem.description ||
            '';
        return String(raw).replace(/\s+/g, ' ').trim().toUpperCase();
    }, [record, rawItem]);

    const marketingHtml = useMemo(() => {
        if (!record) return '';
        return record.marketingHtml || rawItem.generated_description || rawItem.marketing_description || '';
    }, [record, rawItem]);

    // ── 2. Image Ordering & Hierarchy (Studio Hero First, PNG Cutouts Second) ───
    const resolvedImages = useMemo(() => {
        if (!record) return [];
        const itemForImages = {
            data: rawItem || {
                ...record,
                shape: record.name,
                color: record.stone,
                processed_media_urls: record.hexMap ? { _pixel_map_hex: record.hexMap } : undefined,
                generated_png_url: record.cutoutUrl,
                media_urls: record.images.join(',')
            },
            images: record.images,
            generatedPngUrl: record.cutoutUrl,
            maskUrl: record.cutoutUrl,
            cleanPhotoUrl: record.cleanPhotoUrl
        };
        const list = getItemImages(itemForImages).filter(u => Boolean(u) && !u.includes('hex_map') && !u.includes('pixel_map'));
        if (list.length > 0) return list;
        const fallback = [record.cleanPhotoUrl, ...record.images, record.cutoutUrl].filter(Boolean) as string[];
        return Array.from(new Set(fallback));
    }, [record, rawItem]);

    const activeHeroSrc = resolvedImages[activeHeroIndex] || resolvedImages[0] || record?.cleanPhotoUrl || record?.cutoutUrl || '';

    // ── 3. Extracted Color Palette Bubbles ─────────────────────────────────────
    const extractedColors: ExtractedColorInfo[] = useMemo(() => {
        if (!record) return [];
        const norm = {
            dominantColors: record.colors,
            generatedColor: record.colors,
            color: record.stone,
            shape: record.name
        };
        const colors = getItemExtractedColors(norm, rawItem || norm);
        if (colors.length > 0) return colors;
        return (record.colors || []).slice(0, 5).map(c => ({
            name: c.toUpperCase(),
            rgb: [160, 160, 160] as [number, number, number]
        }));
    }, [record, rawItem]);

    // ── 4. Normalized Hex Map Square (Stretched to square, no empty white space) ──
    useEffect(() => {
        if (!record) return;
        const itemData = {
            hexString: record.hexMap,
            hex_string: record.hexMap,
            processed_media_urls: record.hexMap ? { _pixel_map_hex: record.hexMap } : undefined,
            dominant_colors: record.colors,
            ...rawItem
        };
        const norm = {
            color: record.stone,
            dominantColors: record.colors,
            widthCm: record.specs.widthCm,
            heightCm: record.specs.heightCm,
            lengthCm: record.specs.lengthCm
        };
        const sq = generateNormalizedHexSquareDataUrl(itemData, norm, 140);
        setHexSquareDataUrl(sq);
    }, [record, rawItem]);

    // ── 5. Barcode (Code128 with NO retail price) ─────────────────────────────
    useEffect(() => {
        if (barcodeCanvasRef.current && tagText) {
            try {
                JsBarcode(barcodeCanvasRef.current, tagText.replace(/\s+/g, ''), {
                    format: 'CODE128',
                    displayValue: false,
                    margin: 0,
                    height: 32,
                    width: 1.5,
                    lineColor: '#0f172a',
                    background: '#ffffff'
                });
            } catch (e) {
                console.warn('[barcode] generation error:', e);
            }
        }
    }, [tagText, record]);

    // ── 6. Advanced 3D Axonometric Model Generation ───────────────────────────
    useEffect(() => {
        if (!record) return;
        let alive = true;
        const norm = {
            widthCm: record.specs.widthCm || 20,
            heightCm: record.specs.heightCm || 20,
            lengthCm: record.specs.lengthCm || 20,
            shape: rawItem.shape || record.name || 'Object',
            shortDescription: rawItem.short_description || record.name || '',
            color: rawItem.color || record.colors[0] || record.stone || ''
        };
        const itemData = {
            hexString: record.hexMap,
            hex_string: record.hexMap,
            processed_media_urls: record.hexMap ? { _pixel_map_hex: record.hexMap } : undefined,
            ...rawItem
        };

        getAdvancedAxoDataUrl(norm, itemData, { hairlineColor: '#64748b' })
            .then(url => {
                if (alive) setAxoDataUrl(url);
            })
            .catch(() => {
                if (alive) setAxoDataUrl(record.icon);
            });

        return () => { alive = false; };
    }, [record, rawItem]);

    // Dimensions metric & imperial strings
    const specsDimsMetric = useMemo(() => {
        if (!record) return '';
        const parts = [record.specs.lengthCm, record.specs.widthCm, record.specs.heightCm].filter(Boolean);
        return parts.length ? parts.join('×') + 'cm' : '';
    }, [record]);

    const specsWeightMetric = record?.specs.weightKg ? `${record.specs.weightKg}kg` : '';
    const specsDimsWeightStr = useMemo(() => {
        return [specsDimsMetric, specsWeightMetric].filter(Boolean).join(' · ') || 'Custom Dimensions';
    }, [specsDimsMetric, specsWeightMetric]);

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
                <main className="tv-main tv-catalog-container">
                    <div className="tv-catalog-sheet animate-pulse p-8">
                        <div className="h-8 bg-white/10 rounded-lg w-3/4 mb-4" />
                        <div className="h-4 bg-white/10 rounded-md w-1/3 mb-6" />
                        <div className="h-48 bg-white/10 rounded-2xl w-full mb-6" />
                        <div className="h-24 bg-white/10 rounded-xl w-full" />
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
    const wImp = toImpStr(specs.widthCm, 'in');
    const hImp = toImpStr(specs.heightCm, 'in');
    const dImp = toImpStr(specs.lengthCm, 'in');
    const wtImp = toImpStr(specs.weightKg, 'lbs');
    const ovImp = [specs.lengthCm, specs.widthCm, specs.heightCm]
        .filter(Boolean)
        .map(v => toImpStr(v, 'in'))
        .join(' × ') || '—';

    return (
        <div id="tagview">
            {showFullscreen && activeHeroSrc && (
                <FullscreenInspector
                    title={mainTitleStr}
                    activeSrc={activeHeroSrc}
                    onClose={() => setShowFullscreen(false)}
                />
            )}

            {renderHeader}

            <main className="tv-main tv-catalog-container">
                <article className="tv-catalog-sheet">
                    {/* ── 1. TITLE & CLASSIFICATION BLOCK ─────────────────────────── */}
                    <div className="tv-catalog-title-block">
                        <div className="flex items-start justify-between gap-4">
                            <h1 className="tv-catalog-main-title flex-1">
                                {mainTitleStr}
                            </h1>
                            <div className="tv-catalog-qty-badge shrink-0">
                                <span>QTY: {record.quantity || 1}</span>
                            </div>
                        </div>

                        <div className="tv-catalog-classification mt-1.5">
                            {classificationStr}
                        </div>
                    </div>

                    {/* Hairline Divider */}
                    <div className="tv-hairline my-4" />

                    {/* ── 2. HEADER SPECS BAR ─────────────────────────────────────── */}
                    <div className="tv-header-specs-bar flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        {/* Left Side: Extracted Color Palette Indicators */}
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                                EXTRACTED COLOR PALETTE
                            </span>
                            <div className="flex flex-wrap items-center gap-3">
                                {extractedColors.length > 0 ? (
                                    extractedColors.map((c, i) => (
                                        <div key={i} className="flex items-center gap-1.5" title={`RGB(${c.rgb.join(', ')})`}>
                                            <span
                                                className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                                                style={{
                                                    backgroundColor: `rgb(${c.rgb.join(',')})`,
                                                    border: '1px solid rgba(255, 255, 255, 0.4)'
                                                }}
                                            />
                                            <span className="text-[11px] font-mono font-bold text-slate-200 tracking-wide uppercase">
                                                {c.name}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <span className="text-xs text-slate-400">Natural Mineral Tone</span>
                                )}
                            </div>
                        </div>

                        {/* Right Side: Normalized Hex Square · Hairline · Barcode + Tag + Dims · QR */}
                        <div className="flex items-center gap-3 shrink-0 self-stretch md:self-auto justify-between md:justify-end">
                            {/* Normalized Hex Map Square (no white spaces) */}
                            {hexSquareDataUrl && (
                                <div className="relative group shrink-0" title="Normalized Mineral Spectrum (24×24 Texture)">
                                    <img
                                        src={hexSquareDataUrl}
                                        alt="Normalized Mineral Hex Spectrum"
                                        className="w-12 h-12 rounded-lg object-cover border border-slate-700/60 shadow-md"
                                    />
                                </div>
                            )}

                            {/* Vertical Hairline Element */}
                            <div className="w-px h-10 bg-slate-700/60 shrink-0" />

                            {/* Barcode (Code128 with NO retail price) + Tag Code + Dims/Weight */}
                            <div className="flex flex-col items-center justify-center min-w-[125px]">
                                <div className="bg-white px-2 py-0.5 rounded-md flex items-center justify-center shadow-xs">
                                    <canvas ref={barcodeCanvasRef} className="h-6 max-w-[130px] object-contain" />
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span
                                        className="text-[9px] font-bold font-mono px-1 py-0.2 rounded text-white"
                                        style={{ backgroundColor: vendorColor }}
                                    >
                                        {tagText.slice(0, 2)}
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-slate-100 tracking-wider">
                                        {tagText.slice(2)}
                                    </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                                    {specsDimsWeightStr}
                                </span>
                            </div>

                            {/* QR Code with Vendor Color Bubble in Center */}
                            <div className="relative inline-flex items-center justify-center p-1 bg-white rounded-lg shadow-md shrink-0">
                                <QRCodeSVG value={shareUrl} size={48} level="H" includeMargin={false} />
                                <div className="absolute w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow-xs">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: vendorColor }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Hairline Divider */}
                    <div className="tv-hairline my-5" />

                    {/* ── 3. IMAGE HIERARCHY: CLEAN ROOM STUDIO HERO & SECONDARY GRID ── */}
                    <section className="tv-images-section flex flex-col gap-3" aria-label={tr("Product Visuals")}>
                        {/* Large Hero Clean Room Studio Photo */}
                        <div className="tv-hero-clean-room relative">
                            {activeHeroSrc ? (
                                <img
                                    src={activeHeroSrc}
                                    alt={mainTitleStr}
                                    className="tv-hero-clean-img"
                                    onClick={() => setShowFullscreen(true)}
                                    title={tr("Click to enlarge")}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-500">
                                    <Package size={48} strokeWidth={1.5} />
                                </div>
                            )}

                            {/* Fullscreen zoom action */}
                            <button
                                type="button"
                                onClick={() => setShowFullscreen(true)}
                                className="tv-hero-zoom-btn"
                                aria-label={tr("Open in Fullscreen")}
                                title={tr("Open in Fullscreen")}
                            >
                                <Maximize2 size={16} strokeWidth={2} />
                            </button>
                        </div>

                        {/* Secondary Photo Angles & Transparent PNG Cutouts in Smaller Hairline Grid */}
                        {resolvedImages.length > 1 && (
                            <div className="tv-secondary-grid">
                                {resolvedImages.map((imgUrl, idx) => {
                                    const isActive = idx === activeHeroIndex;
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setActiveHeroIndex(idx)}
                                            className={`tv-secondary-thumb ${isActive ? 'is-active' : ''}`}
                                            title={`View angle ${idx + 1}`}
                                        >
                                            <img
                                                src={imgUrl}
                                                alt={`${mainTitleStr} angle ${idx + 1}`}
                                                className="w-full h-full object-contain"
                                                loading="lazy"
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Hairline Divider */}
                    <div className="tv-hairline my-6" />

                    {/* ── 4. BELOW IMAGE GRID: SUBTITLE & MARKETING DESCRIPTION ─────── */}
                    <section className="tv-description-section flex flex-col gap-3">
                        {shopifyOrInvoiceTitle && (
                            <h2 className="tv-catalog-subtitle">
                                {shopifyOrInvoiceTitle}
                            </h2>
                        )}

                        {marketingHtml ? (
                            <div
                                className="tv-marketing-html text-xs sm:text-sm text-slate-300 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: marketingHtml }}
                            />
                        ) : record.body ? (
                            <p className="tv-marketing-html text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                                {record.body}
                            </p>
                        ) : null}
                    </section>

                    {/* Hairline Divider */}
                    <div className="tv-hairline my-6" />

                    {/* ── 5. BOTTOM SPECIFICATIONS: 3D AXONOMETRIC & DIMS TABLE ───── */}
                    <section className="tv-bottom-specs-grid" aria-label={tr("Technical Specifications")}>
                        {/* Large 3D Axonometric Element with Authentic Hex Colors & Mineral Strata */}
                        <div className="tv-bottom-axo-container">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                                    3D AXONOMETRIC SPECIFICATION
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                    BOUNDING BOX · TICKS · STRATA
                                </span>
                            </div>

                            <div className="tv-bottom-axo-view">
                                {axoDataUrl ? (
                                    <img
                                        src={axoDataUrl}
                                        alt={tr("3D Axonometric Projection")}
                                        className="max-w-full max-h-[260px] object-contain drop-shadow-xl"
                                    />
                                ) : (
                                    <div className="p-8 text-center text-xs text-slate-500">
                                        Synthesizing axonometric projection...
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Dimensions & Specifications Table (NO RETAIL PRICE) */}
                        <div className="tv-dimensions-panel flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-4 pb-2 border-b border-white/10">
                                    DIMENSIONS & PHYSICAL ATTRIBUTES
                                </h3>

                                <div className="grid grid-cols-2 gap-3.5">
                                    <div className="tv-spec-cell">
                                        <span className="tv-spec-label">WIDTH</span>
                                        <span className="tv-spec-value-imp">{wImp}</span>
                                        <span className="tv-spec-value-metric">{specs.widthCm != null ? `${specs.widthCm} cm` : '—'}</span>
                                    </div>

                                    <div className="tv-spec-cell">
                                        <span className="tv-spec-label">HEIGHT</span>
                                        <span className="tv-spec-value-imp">{hImp}</span>
                                        <span className="tv-spec-value-metric">{specs.heightCm != null ? `${specs.heightCm} cm` : '—'}</span>
                                    </div>

                                    <div className="tv-spec-cell">
                                        <span className="tv-spec-label">DEPTH</span>
                                        <span className="tv-spec-value-imp">{dImp}</span>
                                        <span className="tv-spec-value-metric">{specs.lengthCm != null ? `${specs.lengthCm} cm` : '—'}</span>
                                    </div>

                                    <div className="tv-spec-cell">
                                        <span className="tv-spec-label">WEIGHT</span>
                                        <span className="tv-spec-value-imp">{wtImp}</span>
                                        <span className="tv-spec-value-metric">{specs.weightKg != null ? `${specs.weightKg} kg` : '—'}</span>
                                    </div>
                                </div>

                                <div className="tv-spec-cell mt-3.5">
                                    <span className="tv-spec-label">OVERALL DIMENSIONS</span>
                                    <span className="tv-spec-value-imp text-sm sm:text-base">{ovImp}</span>
                                </div>
                            </div>

                            {/* Provenance Cipher Bar */}
                            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <div className="flex items-center gap-1.5 text-cyan-300">
                                    <Lock size={12} strokeWidth={2} />
                                    <span>{archiveCode}</span>
                                </div>
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                                    VERIFIED PROVENANCE
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Hairline Divider Across Footer */}
                    <div className="tv-hairline mt-8 mb-5" />

                    {/* ── 6. FOOTER: MADE IN MEXICO & ALL THREE LOGOS ─────────────── */}
                    <footer className="tv-catalog-footer flex flex-col sm:flex-row items-center justify-between gap-4">
                        {/* Left Side: MADE IN MEXICO */}
                        <div className="flex items-center gap-2">
                            <span className="tv-catalog-mim">MADE IN MEXICO</span>
                            <span className="text-white/20">·</span>
                            <span className="text-[11px] font-mono text-slate-400">HISTORIC ONYX CAPITAL</span>
                        </div>

                        {/* Right Side: Rare Earth Gallery · Art of Decor · Onyx Icon */}
                        <div className="flex items-center gap-5 shrink-0">
                            {/* Rare Earth Gallery */}
                            <img
                                src={RARE_EARTH_LOGO}
                                alt="Rare Earth Gallery"
                                className="h-5 sm:h-6 object-contain opacity-80 hover:opacity-100 transition-opacity"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />

                            {/* Art of Decor */}
                            <img
                                src={ART_OF_DECOR_LOGO}
                                alt="Art of Decor"
                                className="h-5 sm:h-6 object-contain opacity-80 hover:opacity-100 transition-opacity"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />

                            {/* Onyx Icon / Favicon */}
                            <img
                                src="/favicon.png"
                                alt="Onyx"
                                className="h-5 sm:h-6 w-auto object-contain opacity-85 hover:opacity-100 transition-opacity"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = '/onyxmini.webp';
                                }}
                            />
                        </div>
                    </footer>
                </article>
            </main>
        </div>
    );
};

export default TagPublicView;
