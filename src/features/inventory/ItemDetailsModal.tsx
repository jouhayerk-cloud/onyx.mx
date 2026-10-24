import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue } from 'jotai/react';
import {
    X,
    ChevronLeft,
    ChevronRight,
    Layers,
    Box,
    Sparkles,
    Copy,
    Check,
    ExternalLink,
    Maximize2,
    Info,
    Tag as TagIcon
} from 'lucide-react';
import {
    generateAxonometricDataUrl,
    resolveItemColor,
    type AxoBoundingBoxOptions
} from '../../lib/axonometric';
import { loadSegmentations } from '../../lib/segmentationStore';
import {
    extractItemHexString,
    getCleanImageUrl,
    cmToImperial,
    formatWeightImperialOnly
} from '../../lib/utils';
import { exchangeRateAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import toast from '../onyxIsland/notify/toast';

export interface ItemDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: any;
    onEdit?: (item: any) => void;
    initialCutoutIndex?: number;
}

/**
 * Extracts and normalises all valid PNG cutouts from any inventory item record.
 * Inspects `item.cutouts`, `item.cutoutUrls`, `item.images`, `item.generatedPngUrl`,
 * `item.processedMediaUrls`, and raw `.png` references.
 */
export function extractAllCutoutUrls(rawItem: any): string[] {
    if (!rawItem) return [];
    const item = (rawItem.data ? { ...rawItem.data, ...rawItem } : rawItem) || {};
    const results: string[] = [];

    const addUrl = (url: unknown) => {
        if (!url || typeof url !== 'string') return;
        const clean = getCleanImageUrl(url) || url.trim();
        if (clean && !results.includes(clean)) {
            results.push(clean);
        }
    };

    // 1. Primary generated PNG URL
    const genPng = item.generatedPngUrl || item.generated_png_url;
    if (genPng) addUrl(genPng);

    // 2. Direct cutout fields
    const singleCutout = item.cutoutUrl || item.cutout_url || item.cutout;
    if (singleCutout) addUrl(singleCutout);

    // 3. Array or list of cutouts (item.cutouts or item.cutoutUrls)
    const cutoutsList = item.cutouts || item.cutoutUrls || item.cutout_urls;
    if (Array.isArray(cutoutsList)) {
        for (const entry of cutoutsList) {
            if (typeof entry === 'string') {
                addUrl(entry);
            } else if (entry && typeof entry === 'object') {
                const u = entry.url || entry.src || entry.cutoutUrl || entry.cutout || entry.png;
                if (u) addUrl(u);
            }
        }
    } else if (typeof cutoutsList === 'string' && cutoutsList.trim()) {
        const trimmed = cutoutsList.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    parsed.forEach(addUrl);
                }
            } catch {}
        } else {
            trimmed.split(',').forEach(addUrl);
        }
    }

    // 4. item.images array
    if (Array.isArray(item.images)) {
        for (const img of item.images) {
            if (typeof img === 'string') {
                if (img.toLowerCase().includes('.png') || img.toLowerCase().includes('cutout')) {
                    addUrl(img);
                }
            } else if (img && typeof img === 'object') {
                const u = img.cutoutUrl || img.cutout || img.pngUrl || img.png || img.url || img.src;
                const isPngOrCutout =
                    img.kind === 'cutout' ||
                    img.kind === 'png' ||
                    img.isCutout ||
                    (typeof u === 'string' && (u.toLowerCase().includes('.png') || u.toLowerCase().includes('cutout')));
                if (isPngOrCutout && u) {
                    addUrl(u);
                }
            }
        }
    }

    // 5. processed_media_urls (JSON map or CSV)
    const procMedia = item.processedMediaUrls || item.processed_media_urls;
    if (procMedia) {
        if (typeof procMedia === 'object') {
            for (const [k, v] of Object.entries(procMedia)) {
                if (k.startsWith('_') || k.startsWith('videoGen')) continue;
                if (typeof v === 'string') addUrl(v);
            }
        } else if (typeof procMedia === 'string' && procMedia.trim()) {
            const pStr = procMedia.trim();
            if (pStr.startsWith('{') && pStr.endsWith('}')) {
                try {
                    const parsed = JSON.parse(pStr);
                    for (const [k, v] of Object.entries(parsed)) {
                        if (k.startsWith('_') || k.startsWith('videoGen')) continue;
                        if (typeof v === 'string') addUrl(v);
                    }
                } catch {}
            } else {
                pStr.split(',').forEach(addUrl);
            }
        }
    }

    // 6. spatial_masks or spatialMasks
    const spMasks = item.spatialMasks || item.spatial_masks;
    if (spMasks) {
        let masksObj = spMasks;
        if (typeof spMasks === 'string') {
            try { masksObj = JSON.parse(spMasks); } catch {}
        }
        if (Array.isArray(masksObj)) {
            for (const m of masksObj) {
                if (m && typeof m === 'object') {
                    if (m.cutoutUrl || m.pngUrl) addUrl(m.cutoutUrl || m.pngUrl);
                }
            }
        } else if (typeof masksObj === 'object' && masksObj) {
            for (const v of Object.values(masksObj)) {
                if (typeof v === 'string' && v.toLowerCase().includes('.png')) addUrl(v);
            }
        }
    }

    // 7. Fallback: inspect raw mediaUrls for any .png assets
    const mediaRaw = item.mediaUrls || item.media_urls;
    if (typeof mediaRaw === 'string') {
        mediaRaw.split(',').forEach(u => {
            const s = u.trim();
            if (s.toLowerCase().includes('.png') || s.toLowerCase().includes('cutout')) {
                addUrl(s);
            }
        });
    }

    return results;
}

export const ItemDetailsModal: React.FC<ItemDetailsModalProps> = ({
    isOpen,
    onClose,
    item,
    onEdit,
    initialCutoutIndex = 0
}) => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [activeCutoutIdx, setActiveCutoutIdx] = useState(initialCutoutIndex);
    const [activeTab, setActiveTab] = useState<'gallery' | 'axo'>('gallery');
    const [dynamicCutouts, setDynamicCutouts] = useState<string[]>([]);
    const [axoDataUrl, setAxoDataUrl] = useState<string | null>(null);
    const [isGeneratingAxo, setIsGeneratingAxo] = useState(false);
    const [copied, setCopied] = useState(false);

    const rawData = (item && typeof item === 'object' && 'data' in item ? item.data : item) || {};
    const itemId = rawData.itemId || rawData.item_id || item?.itemId || item?.id || '';
    const itemNumber = rawData.itemNumber || rawData.item_number || '';
    const title = rawData.title || rawData.name || rawData.shortDescription || rawData.short_description || tr('Untitled Item');
    const stone = rawData.color || rawData.variety || rawData.material || '';
    const shape = rawData.shape || '';
    const desc = rawData.description || rawData.shortDescription || rawData.short_description || '';

    const widthCm = parseFloat(rawData.widthCm || rawData.width_cm) || 0;
    const heightCm = parseFloat(rawData.heightCm || rawData.height_cm) || 0;
    const lengthCm = parseFloat(rawData.lengthCm || rawData.length_cm || rawData.depthCm || rawData.depth_cm) || 0;
    const weightKg = parseFloat(rawData.weightKg || rawData.weight_kg) || 0;
    const priceMxn = parseFloat(rawData.price || rawData.price_mxn) || 0;
    const priceUsd = exchangeRate > 0 ? (priceMxn / exchangeRate) : 0;

    // Dimensions formatted string
    const metricDims = [widthCm, heightCm, lengthCm].filter(Boolean).map(n => `${n} cm`).join(' × ');
    const imperialDims = [widthCm, heightCm, lengthCm]
        .filter(Boolean)
        .map(cm => cmToImperial(cm))
        .filter(Boolean)
        .join(' × ');
    const imperialWeight = formatWeightImperialOnly(weightKg);

    // Initial cutouts extracted from record
    const baseCutouts = useMemo(() => extractAllCutoutUrls(item), [item]);

    // Load additional angle cutouts from Supabase item_segmentation if available
    useEffect(() => {
        let isMounted = true;
        if (!itemId) {
            setDynamicCutouts(baseCutouts);
            return;
        }

        loadSegmentations(itemId)
            .then(segments => {
                if (!isMounted) return;
                const segUrls: string[] = [];
                for (const seg of segments) {
                    if (seg.cutout_png_file_id) {
                        const u = getCleanImageUrl(seg.cutout_png_file_id);
                        if (u && !segUrls.includes(u)) segUrls.push(u);
                    }
                }
                const combined = [...baseCutouts];
                for (const u of segUrls) {
                    if (!combined.includes(u)) combined.push(u);
                }
                setDynamicCutouts(combined);
            })
            .catch(() => {
                if (isMounted) setDynamicCutouts(baseCutouts);
            });

        return () => { isMounted = false; };
    }, [itemId, baseCutouts]);

    const cutouts = dynamicCutouts.length > 0 ? dynamicCutouts : baseCutouts;
    const activeCutoutUrl = cutouts[activeCutoutIdx] || cutouts[0] || rawData.imageUrl || null;

    // Reset or bound active cutout index when list changes
    useEffect(() => {
        if (activeCutoutIdx >= cutouts.length && cutouts.length > 0) {
            setActiveCutoutIdx(0);
        }
    }, [cutouts.length, activeCutoutIdx]);

    // Generate Axonometric projection with Hex Map texture & 3D dimension bounding frame
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setIsGeneratingAxo(true);

        const hexMap = extractItemHexString(rawData);
        const wireColor = resolveItemColor(rawData);
        const bboxOptions: AxoBoundingBoxOptions = {
            showBoundingBox: true,
            showDimensionLabels: true,
            showMeasurementTicks: true,
            unit: 'cm',
        };

        generateAxonometricDataUrl(
            widthCm,
            heightCm,
            lengthCm,
            shape,
            desc,
            wireColor,
            false,
            hexMap,
            bboxOptions
        )
            .then(url => {
                if (isMounted) {
                    setAxoDataUrl(url);
                    setIsGeneratingAxo(false);
                }
            })
            .catch(err => {
                console.error('[ItemDetailsModal] Axo generation error:', err);
                if (isMounted) setIsGeneratingAxo(false);
            });

        return () => { isMounted = false; };
    }, [isOpen, widthCm, heightCm, lengthCm, shape, desc, rawData]);

    // Cycling controls
    const stepCutout = useCallback((direction: number) => {
        if (cutouts.length <= 1) return;
        setActiveCutoutIdx(prev => (prev + direction + cutouts.length) % cutouts.length);
    }, [cutouts.length]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowLeft') {
                stepCutout(-1);
            } else if (e.key === 'ArrowRight') {
                stepCutout(1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, stepCutout]);

    const handleCopyUrl = () => {
        if (!activeCutoutUrl) return;
        navigator.clipboard.writeText(activeCutoutUrl);
        setCopied(true);
        toast.success(tr('Link copied'));
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen || !item) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9990] bg-black/65 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200 select-none"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={tr('Item Details')}
        >
            <div
                className="liquid-surface w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden bg-slate-900/90 text-slate-100 border border-white/15 rounded-3xl shadow-2xl relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Bar */}
                <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5 backdrop-blur-md">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold tracking-wider bg-white/10 text-sky-300 border border-white/10">
                                {itemId || (itemNumber ? `#${itemNumber}` : 'INV')}
                            </span>
                            {stone && (
                                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
                                    {stone}
                                </span>
                            )}
                        </div>
                        <h2 className="text-sm sm:text-base font-semibold text-white truncate max-w-[200px] sm:max-w-[340px]">
                            {title}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Tab Toggle: Cutouts Gallery vs 3D Axo */}
                        <div className="flex items-center p-1 rounded-xl bg-black/40 border border-white/10">
                            <button
                                type="button"
                                onClick={() => setActiveTab('gallery')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    activeTab === 'gallery'
                                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title={tr('Cutout Gallery')}
                            >
                                <Layers size={13} strokeWidth={2.2} />
                                <span>{tr('Cutouts')}</span>
                                {cutouts.length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-200">
                                        {cutouts.length}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('axo')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    activeTab === 'axo'
                                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title={tr('Axo 3D Frame')}
                            >
                                <Box size={13} strokeWidth={2.2} />
                                <span>{tr('Axo 3D Frame')}</span>
                            </button>
                        </div>

                        {/* Close button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label={tr('Close')}
                            title={`${tr('Close')} (Esc)`}
                        >
                            <X size={18} strokeWidth={2.2} />
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto flex flex-col p-4 sm:p-6 gap-4">
                    {activeTab === 'gallery' ? (
                        <>
                            {/* Hero Cutout Stage */}
                            <div className="relative rounded-2xl bg-black/40 border border-white/10 overflow-hidden shadow-inner flex items-center justify-center min-h-[340px] sm:min-h-[420px] p-6 group">
                                {/* Precision Transparency Grid Backing */}
                                <div
                                    className="absolute inset-0 opacity-20 pointer-events-none"
                                    style={{
                                        backgroundImage:
                                            'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)',
                                        backgroundSize: '16px 16px',
                                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                                    }}
                                />

                                {/* Subtle glass radial glow behind stone cutout */}
                                <div className="absolute inset-0 bg-radial from-sky-500/10 via-transparent to-transparent pointer-events-none" />

                                {activeCutoutUrl ? (
                                    <img
                                        key={activeCutoutUrl}
                                        src={activeCutoutUrl}
                                        alt={`${title} - Cutout ${activeCutoutIdx + 1}`}
                                        className="relative z-10 max-h-[360px] sm:max-h-[420px] w-auto max-w-full object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.7)] animate-in fade-in duration-300"
                                    />
                                ) : (
                                    <div className="relative z-10 flex flex-col items-center justify-center text-slate-500 gap-2">
                                        <Layers size={36} strokeWidth={1.5} />
                                        <p className="text-xs font-medium uppercase tracking-wider">
                                            {tr('No cutouts available')}
                                        </p>
                                    </div>
                                )}

                                {/* Top Left Badge: Cutout indicator */}
                                {cutouts.length > 0 && (
                                    <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 text-xs text-slate-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span>
                                            {tr('Cutout')} {activeCutoutIdx + 1} / {cutouts.length}
                                        </span>
                                    </div>
                                )}

                                {/* Top Right Toolbar */}
                                {activeCutoutUrl && (
                                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={handleCopyUrl}
                                            className="p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:bg-white/15 transition-all"
                                            title={tr('Copy image link')}
                                        >
                                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        </button>
                                        <a
                                            href={activeCutoutUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:bg-white/15 transition-all"
                                            title={tr('Open in Fullscreen')}
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    </div>
                                )}

                                {/* Cycle Navigation Arrows */}
                                {cutouts.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); stepCutout(-1); }}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:scale-110 active:scale-95 transition-all shadow-xl"
                                            aria-label={tr('Previous cutout')}
                                            title={`${tr('Previous cutout')} (←)`}
                                        >
                                            <ChevronLeft size={20} strokeWidth={2.5} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); stepCutout(1); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:scale-110 active:scale-95 transition-all shadow-xl"
                                            aria-label={tr('Next cutout')}
                                            title={`${tr('Next cutout')} (→)`}
                                        >
                                            <ChevronRight size={20} strokeWidth={2.5} />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Sleek Thumbnail Strip */}
                            {cutouts.length > 1 && (
                                <div className="rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 p-2.5 flex items-center gap-2.5 overflow-x-auto scrollbar-thin">
                                    {cutouts.map((url, idx) => {
                                        const isSelected = idx === activeCutoutIdx;
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setActiveCutoutIdx(idx)}
                                                className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all duration-200 border ${
                                                    isSelected
                                                        ? 'ring-2 ring-sky-400 border-sky-300 scale-105 shadow-md shadow-sky-500/20 bg-sky-500/10'
                                                        : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/30 hover:scale-102 bg-white/5'
                                                }`}
                                                aria-label={`${tr('Cutout')} ${idx + 1}`}
                                                aria-current={isSelected || undefined}
                                            >
                                                {/* Checkerboard tile backing */}
                                                <div
                                                    className="absolute inset-0 opacity-15"
                                                    style={{
                                                        backgroundImage:
                                                            'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)',
                                                        backgroundSize: '8px 8px'
                                                    }}
                                                />
                                                <img
                                                    src={url}
                                                    alt={`Thumb ${idx + 1}`}
                                                    className="relative z-10 w-full h-full object-contain p-1"
                                                    loading="lazy"
                                                />
                                                <span className="absolute bottom-1 right-1 z-20 text-[9px] font-mono font-bold px-1 rounded bg-black/70 text-slate-300">
                                                    #{idx + 1}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        /* 3D Axonometric Projection with Hex Map Texture & 3D Bounding Cube */
                        <div className="flex flex-col md:flex-row gap-5 items-stretch">
                            {/* Axo Canvas Container */}
                            <div className="flex-1 rounded-2xl bg-black/40 border border-white/10 p-5 flex flex-col items-center justify-center relative min-h-[360px] shadow-inner overflow-hidden">
                                <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                                        {tr('3D Bounding Frame')}
                                    </span>
                                    {shape && (
                                        <span className="text-xs uppercase tracking-wider text-slate-400">
                                            {shape}
                                        </span>
                                    )}
                                </div>

                                {isGeneratingAxo ? (
                                    <div className="flex flex-col items-center gap-3 text-slate-400">
                                        <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                                        <p className="text-xs font-mono">{tr('Preparing…')}</p>
                                    </div>
                                ) : axoDataUrl ? (
                                    <img
                                        src={axoDataUrl}
                                        alt={`${title} - Axonometric 3D`}
                                        className="max-h-[360px] w-auto max-w-full object-contain filter drop-shadow-2xl animate-in zoom-in-95 duration-200"
                                    />
                                ) : (
                                    <p className="text-xs text-slate-500">{tr('No axo preview available')}</p>
                                )}
                            </div>

                            {/* Stone Spec Sheet Card */}
                            <div className="w-full md:w-72 rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3.5 backdrop-blur-md">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 pb-2 border-b border-white/10">
                                    <Info size={14} className="text-sky-400" />
                                    <span>{tr('Stone Geometry')}</span>
                                </h3>

                                <div className="space-y-2.5 text-xs">
                                    <div>
                                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                                            {tr('Dimensions')}
                                        </span>
                                        <span className="text-white font-mono font-medium">{metricDims || '—'}</span>
                                        {imperialDims && (
                                            <span className="text-slate-400 block text-[11px] font-mono">{imperialDims}</span>
                                        )}
                                    </div>

                                    {weightKg > 0 && (
                                        <div>
                                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                                                {tr('Weight')}
                                            </span>
                                            <span className="text-white font-mono font-medium">
                                                {weightKg} kg {imperialWeight ? `· ${imperialWeight}` : ''}
                                            </span>
                                        </div>
                                    )}

                                    {stone && (
                                        <div>
                                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                                                {tr('Color')} / {tr('Material')}
                                            </span>
                                            <span className="text-white font-medium">{stone}</span>
                                        </div>
                                    )}

                                    {priceMxn > 0 && (
                                        <div className="pt-2 border-t border-white/10">
                                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                                                {tr('Price')}
                                            </span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-emerald-400 font-mono text-sm font-bold">
                                                    ${priceMxn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                                </span>
                                                {priceUsd > 0 && (
                                                    <span className="text-slate-400 font-mono text-xs">
                                                        (${priceUsd.toFixed(2)} USD)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <footer className="px-5 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                        <TagIcon size={13} className="text-slate-500" />
                        <span className="font-mono">{itemId}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {onEdit && (
                            <button
                                type="button"
                                onClick={() => onEdit(item)}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
                            >
                                {tr('Edit')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold transition-all shadow-md shadow-sky-500/20"
                        >
                            {tr('Close')}
                        </button>
                    </div>
                </footer>
            </div>
        </div>,
        document.body
    );
};
