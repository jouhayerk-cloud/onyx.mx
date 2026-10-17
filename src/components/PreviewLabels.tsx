import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Printer, ChevronLeft, ChevronRight, Check, ZoomIn } from 'lucide-react';
import { generateAxonometricDataUrl } from '../lib/axonometric';
import { tr, trf } from '../lib/i18n';
import { renderItemLabelToRaster, labelRasterCache } from '../features/print/renderers/labelRenderer';
import { ItemTag } from './ui/ItemTag';

export interface PreviewLabelsProps {
    items: any[];
    quantities: Record<string, number>;
    onClose?: () => void;
    onLaunchIframe?: (selectedIndices: Set<number>, allLabelInstances: any[]) => void;
    activeLabelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    template?: 'standard' | 'barkod';
    onQuantityChange?: (row: string, qty: number) => void;
    showChrome?: boolean;
    designerRasters?: Record<string, string>;
}

export const LABEL_WIDTH_50x30 = 384;
export const LABEL_HEIGHT_50x30 = 240;
export const LABEL_WIDTH_50x50 = 384;
export const LABEL_HEIGHT_50x50 = 384;

export { labelRasterCache };

export interface PixelLabelViewProps {
    instance: { item: any; index: number; globalIndex: number };
    activeLabelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    template?: 'standard' | 'barkod';
    axoSvg?: string;
    is1Bit?: boolean;
    scale?: number;
    className?: string;
    dataUrl?: string;
}

/**
 * PixelLabelView: Renders exact 1-bit printer raster at 203 DPI.
 * Pixel-for-pixel parity with virtual printer tray and Phomemo M110 printhead.
 * Displayed with integer scaling and image-rendering: pixelated (no separate HTML/CSS re-layout).
 */
export const PixelLabelView: React.FC<PixelLabelViewProps> = ({
    instance,
    activeLabelSize = '50x30',
    logoVariant = 'ArtOfDecor',
    template = 'standard',
    axoSvg,
    scale,
    className = '',
    dataUrl: propDataUrl
}) => {
    const { item } = instance;
    const tag = item?.codes?.bookBarcode || '';
    const isSquare = activeLabelSize === '50x50';
    const targetWidth = isSquare ? LABEL_WIDTH_50x50 : LABEL_WIDTH_50x30;
    const targetHeight = isSquare ? LABEL_HEIGHT_50x50 : LABEL_HEIGHT_50x30;

    const cacheKey = `${tag}_${activeLabelSize}_${template}_${logoVariant}_${axoSvg ? 'axo' : 'noaxo'}`;
    const initialRaster = propDataUrl || labelRasterCache.get(tag) || labelRasterCache.get(cacheKey) || '';
    const [rasterUrl, setRasterUrl] = useState<string>(() => initialRaster);

    useEffect(() => {
        const resolved = propDataUrl || labelRasterCache.get(tag) || labelRasterCache.get(cacheKey);
        if (resolved) {
            setRasterUrl(resolved);
            return;
        }

        // Standard batch labels must come from designer print engine (public/phomemo-designer)
        // Fall back to local canvas generator only for non-standard (e.g. barkod) templates
        if (template === 'barkod') {
            let isCurrent = true;
            renderItemLabelToRaster(item, {
                tagId: tag,
                labelSize: activeLabelSize,
                logoVariant,
                template,
                axoSvg
            }).then(url => {
                labelRasterCache.set(cacheKey, url);
                if (isCurrent) setRasterUrl(url);
            }).catch(err => {
                console.warn('[PixelLabelView] Raster render failed:', err);
            });

            return () => { isCurrent = false; };
        }
    }, [item, tag, activeLabelSize, logoVariant, template, axoSvg, propDataUrl, cacheKey]);

    const displayWidth = scale ? targetWidth * scale : undefined;
    const displayHeight = scale ? targetHeight * scale : undefined;

    return (
        <div 
            className={`pixel-label-surface select-none relative bg-white text-black overflow-hidden border border-black/10 shadow-sm flex items-center justify-center max-w-full ${className}`}
            style={{
                width: displayWidth,
                height: displayHeight,
                imageRendering: 'pixelated',
                maxWidth: '100%',
            }}
        >
            {rasterUrl ? (
                <img
                    src={rasterUrl}
                    alt={`Label ${tag}`}
                    width={displayWidth || targetWidth}
                    height={displayHeight || targetHeight}
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ imageRendering: 'pixelated' }}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-white text-black/40 text-[10px] font-mono animate-pulse">
                    Rendering 1-Bit...
                </div>
            )}
        </div>
    );
};

export const PreviewLabels: React.FC<PreviewLabelsProps> = ({ 
    items, 
    quantities, 
    onClose, 
    onLaunchIframe,
    activeLabelSize = '50x30',
    logoVariant = 'ArtOfDecor',
    template = 'standard',
    onQuantityChange,
    showChrome = true,
    designerRasters
}) => {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [axoCache, setAxoCache] = useState<Record<string, string>>({});
    const [rasterMap, setRasterMap] = useState<Record<string, string>>({});
    const [inspectIndex, setInspectIndex] = useState<number | null>(null);
    const [integerScale, setIntegerScale] = useState<number>(() => {
        if (typeof window !== 'undefined' && window.innerHeight < 700) return 1;
        return 2;
    });
    
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef<number | null>(null);
    const touchCurrentY = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        touchCurrentY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = () => {
        if (touchStartY.current !== null && touchCurrentY.current !== null) {
            if (touchCurrentY.current - touchStartY.current > 75) {
                setInspectIndex(null);
            }
        }
        touchStartY.current = null;
        touchCurrentY.current = null;
    };

    const isSquare = activeLabelSize === '50x50';
    const targetWidth = isSquare ? LABEL_WIDTH_50x50 : LABEL_WIDTH_50x30;
    const targetHeight = isSquare ? LABEL_HEIGHT_50x50 : LABEL_HEIGHT_50x30;

    // Flatten items by quantity
    const labelInstances = useMemo(() => {
        const instances: { item: any; index: number; globalIndex: number }[] = [];
        let globalIndex = 0;
        
        items.forEach(item => {
            const count = quantities[String(item.row)] ?? (Number(item.normData?.quantity) || 1);
            for (let i = 0; i < count; i++) {
                instances.push({ item, index: i + 1, globalIndex });
                globalIndex++;
            }
        });
        return instances;
    }, [items, quantities]);

    // Initialize all selected by default
    useEffect(() => {
        setSelectedIndices(new Set(labelInstances.map(l => l.globalIndex)));
    }, [labelInstances]);

    // Keyboard navigation for modal inspection
    useEffect(() => {
        if (inspectIndex === null) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setInspectIndex(null);
            } else if (e.key === 'ArrowLeft') {
                setInspectIndex(prev => (prev !== null && prev > 0 ? prev - 1 : labelInstances.length - 1));
            } else if (e.key === 'ArrowRight') {
                setInspectIndex(prev => (prev !== null && prev < labelInstances.length - 1 ? prev + 1 : 0));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [inspectIndex, labelInstances.length]);

    // Pre-generate axometric SVGs
    useEffect(() => {
        let active = true;
        const loadAxo = async () => {
            const cache: Record<string, string> = {};
            for (const item of items) {
                const tag = item.codes?.bookBarcode || '';
                if (!cache[tag]) {
                    const norm = item.normData || {};
                    const w = parseFloat(norm.widthCm || norm.w || '10');
                    const h = parseFloat(norm.heightCm || norm.h || '10');
                    const d = parseFloat(norm.lengthCm || norm.d || String(w));
                    try {
                        const svg = await generateAxonometricDataUrl(w, h, d, norm.shape, norm.shortDescription || norm.type, '#111111', true);
                        cache[tag] = svg;
                    } catch {
                        // ignore axo error
                    }
                }
            }
            if (active) setAxoCache(cache);
        };
        loadAxo();
        return () => { active = false; };
    }, [items]);

    // Merged rasters: priority is designerRasters > labelRasterCache > local rasterMap
    const effectiveRasters = useMemo(() => {
        const merged: Record<string, string> = { ...rasterMap };
        if (designerRasters) {
            for (const [k, v] of Object.entries(designerRasters)) {
                if (v) merged[k] = v;
            }
        }
        for (const item of items) {
            const tag = item.codes?.bookBarcode || '';
            if (!merged[tag] && labelRasterCache.has(tag)) {
                merged[tag] = labelRasterCache.get(tag)!;
            }
        }
        return merged;
    }, [rasterMap, designerRasters, items]);

    // Pre-generate true 1-bit printer rasters for unique items
    useEffect(() => {
        let active = true;
        const generateBatchRasters = async () => {
            const map: Record<string, string> = {};
            for (const item of items) {
                const tag = item.codes?.bookBarcode || '';
                if (designerRasters?.[tag]) {
                    map[tag] = designerRasters[tag];
                    continue;
                }
                if (labelRasterCache.has(tag)) {
                    map[tag] = labelRasterCache.get(tag)!;
                    continue;
                }
                const axoSvg = axoCache[tag];
                const key = `${tag}_${activeLabelSize}_${template}_${logoVariant}_${axoSvg ? 'axo' : 'noaxo'}`;
                if (labelRasterCache.has(key)) {
                    map[tag] = labelRasterCache.get(key)!;
                } else if (template === 'barkod') {
                    try {
                        const url = await renderItemLabelToRaster(item, {
                            tagId: tag,
                            labelSize: activeLabelSize,
                            logoVariant,
                            template,
                            axoSvg
                        });
                        labelRasterCache.set(key, url);
                        map[tag] = url;
                    } catch (err) {
                        console.warn('[PreviewLabels] Raster pre-render failed:', err);
                    }
                }
            }
            if (active) setRasterMap(map);
        };
        generateBatchRasters();
        return () => { active = false; };
    }, [items, activeLabelSize, template, logoVariant, axoCache, designerRasters]);

    const toggleSelection = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    const inspectedInstance = inspectIndex !== null ? labelInstances[inspectIndex] : null;

    return (
        <div className="flex-1 flex flex-col bg-transparent relative h-full min-h-0">
            {/* Header (only when showChrome is true) */}
            {showChrome && (
                <div className="shrink-0 relative z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-color,rgba(255,255,255,0.1))] bg-[var(--lq-fill-surface,rgba(10,10,10,0.5))] backdrop-blur-md">
                    <div>
                        <h2 className="text-xl font-black text-[var(--text-color,#fff)] tracking-tight">{tr('Preview Labels')}</h2>
                        <p className="text-[var(--secondary-text-color,rgba(255,255,255,0.5))] text-xs mt-0.5">{trf('{n} labels - Click tile to inspect pixel-perfect preview', { n: labelInstances.length })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {onLaunchIframe && (
                            <button
                                onClick={() => onLaunchIframe(selectedIndices, labelInstances)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-95 border border-[var(--border-color,rgba(255,255,255,0.1))] bg-[var(--lq-fill-control,rgba(255,255,255,0.06))] hover:bg-[var(--lq-fill-control-hover,rgba(255,255,255,0.12))] text-[var(--text-color,#fff)]"
                            >
                                <Printer size={15} />
                                {tr('EDIT')}
                            </button>
                        )}
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--secondary-text-color,rgba(255,255,255,0.4))] hover:text-[var(--text-color,#fff)] hover:bg-[var(--lq-fill-control,rgba(255,255,255,0.1))] transition-all"
                            >
                                <X size={20} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Grid Container */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 relative min-h-0" ref={containerRef}>
                <div className="grid grid-cols-1 min-[431px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5 pb-24">
                    {labelInstances.map((instance) => {
                        const { item, globalIndex } = instance;
                        const tag = item.codes?.bookBarcode || '';
                        const isSelected = selectedIndices.has(globalIndex);
                        const axoSvg = axoCache[tag];

                        return (
                            <div 
                                key={globalIndex}
                                onClick={() => setInspectIndex(globalIndex)}
                                className={`group flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all border relative w-full ${isSelected ? 'border-[var(--main-color,#7FBBFF)] bg-[var(--lq-fill-panel,rgba(255,255,255,0.06))] shadow-[0_0_15px_rgba(var(--main-color-rgb,127,187,255),0.15)]' : 'border-[var(--border-color,rgba(255,255,255,0.08))] bg-[var(--lq-fill-panel,rgba(255,255,255,0.02))] opacity-75 hover:opacity-100'}`}
                            >
                                {/* Quick select check button in top right of tile with >= 44px touch target */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelection(globalIndex);
                                    }}
                                    className="absolute top-2 right-2 z-10 w-11 h-11 flex items-center justify-center cursor-pointer"
                                    title={isSelected ? 'Deselect from print run' : 'Select for print run'}
                                    aria-label="Toggle Selection"
                                >
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'bg-black/50 text-white/50 hover:text-white border border-white/20'}`}>
                                        {isSelected && <Check size={14} strokeWidth={3} />}
                                    </div>
                                </button>

                                {/* Render Label Card wrapper */}
                                <div 
                                    className="bg-white rounded-xl shadow-md overflow-hidden relative w-full group-hover:ring-2 group-hover:ring-[var(--main-color,#7FBBFF)] transition-all" 
                                    style={{ paddingBottom: isSquare ? '100%' : '62.5%' }}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center p-1 bg-white">
                                        <PixelLabelView 
                                            instance={instance}
                                            activeLabelSize={activeLabelSize}
                                            logoVariant={logoVariant}
                                            axoSvg={axoSvg}
                                            template={template}
                                            className="w-full h-full border-none shadow-none"
                                            dataUrl={effectiveRasters[tag]}
                                        />
                                    </div>

                                    {/* Subtle hover inspect prompt overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white text-xs font-bold transition-opacity backdrop-blur-[2px]">
                                        <ZoomIn size={14} />
                                        <span>Inspect 1-Bit</span>
                                    </div>
                                </div>
                                
                                {/* Label Meta: Tag ID with ItemTag + Copy Index */}
                                <div className="flex items-center justify-between gap-1.5 px-1 min-w-0">
                                    <div className="min-w-0 overflow-hidden flex-shrink">
                                        <ItemTag
                                            item={item.data ? { ...item.data, book_barcode: tag || item.data.book_barcode } : item}
                                            size="md"
                                        />
                                    </div>
                                    <span className="text-[var(--secondary-text-color,rgba(255,255,255,0.5))] text-[10px] font-bold font-mono shrink-0 tabular-nums">#{instance.index}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Interactive Pixel-Perfect 1-Bit Large Label Preview Modal */}
            {inspectedInstance && inspectIndex !== null && (() => {
                const inspectedTag = inspectedInstance.item.codes?.bookBarcode || '';
                const isTrulyEngineRaster = Boolean(
                    effectiveRasters[inspectedTag] || labelRasterCache.has(inspectedTag)
                );

                return (
                <div className="lps-inspect-overlay fixed inset-0 z-[100030] flex items-center justify-center p-0 min-[821px]:p-6">
                    {/* Backdrop Scrim */}
                    <div 
                        className="lps-scrim absolute inset-0 cursor-pointer"
                        onClick={() => setInspectIndex(null)}
                    />

                    {/* Modal Window Sheet (Full-Screen on Mobile with Swipe Down to Close) */}
                    <div 
                        className="lps-modal-sheet liquid-panel relative z-10 flex flex-col w-full overflow-hidden shadow-2xl"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="lps-sheet-grabber" />

                        {/* Header Bar */}
                        <div className="flex items-center justify-between px-3 sm:px-5 py-2 sm:py-3.5 border-b border-[var(--lq-rim-subtle)] shrink-0 min-h-[48px]">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <ItemTag
                                            item={inspectedInstance.item.data ? { ...inspectedInstance.item.data, book_barcode: inspectedInstance.item.codes?.bookBarcode || inspectedInstance.item.data.book_barcode } : inspectedInstance.item}
                                            size="md"
                                        />
                                        {isTrulyEngineRaster ? (
                                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold liquid-control text-[var(--main-color,#7FBBFF)] uppercase tracking-wider shrink-0">
                                                1-BIT PIXEL-PERFECT
                                            </span>
                                        ) : (
                                            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold liquid-control text-[var(--lq-ink-muted,rgba(255,255,255,0.4))] uppercase tracking-wider shrink-0 animate-pulse">
                                                GENERATING RASTER...
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-[var(--lq-ink-muted,rgba(255,255,255,0.5))] mt-0.5 truncate">
                                        {trf('Label {current} of {total} · Copy #{copy}', {
                                            current: inspectIndex + 1,
                                            total: labelInstances.length,
                                            copy: inspectedInstance.index
                                        })}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(prev => (prev !== null && prev > 0 ? prev - 1 : labelInstances.length - 1))}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Previous label (Left arrow)"
                                    aria-label="Previous label"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(prev => (prev !== null && prev < labelInstances.length - 1 ? prev + 1 : 0))}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Next label (Right arrow)"
                                    aria-label="Next label"
                                >
                                    <ChevronRight size={18} />
                                </button>
                                <div className="w-px h-5 bg-[var(--lq-rim-subtle)] mx-0.5 sm:mx-1" />
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(null)}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Close (Escape)"
                                    aria-label="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: Center Stage with Integer Scaling Container */}
                        <div className="flex-1 overflow-y-auto p-2 sm:p-8 flex flex-col items-center justify-center min-h-0 bg-black/20 w-full">
                            <div className="lps-pixel-frame relative p-2 sm:p-4 rounded-xl bg-[var(--lq-fill-control,rgba(255,255,255,0.04))] border border-[var(--lq-rim-subtle)] flex flex-col items-center shadow-2xl max-w-full">
                                {/* Crisp 1-bit monochrome rendering with exact proportions and integer scaling */}
                                <PixelLabelView 
                                    instance={inspectedInstance}
                                    activeLabelSize={activeLabelSize}
                                    logoVariant={logoVariant}
                                    axoSvg={axoCache[inspectedTag]}
                                    scale={integerScale}
                                    template={template}
                                    dataUrl={effectiveRasters[inspectedTag]}
                                    className="rounded shadow-lg"
                                />

                                {/* Spec chip bar under preview */}
                                <div className="flex items-center justify-between w-full mt-3 px-1 text-[10px] text-[var(--lq-ink-muted,rgba(255,255,255,0.5))] font-mono uppercase tracking-wider flex-wrap gap-1">
                                    <span>{activeLabelSize === '50x50' ? '50 × 50 mm (384 × 384 px)' : '50 × 30 mm (384 × 240 px)'}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-black/30 rounded px-1 py-0.5 border border-white/10">
                                            <button 
                                                type="button"
                                                onClick={() => setIntegerScale(1)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold min-h-[32px] min-w-[32px] transition-all flex items-center justify-center ${integerScale === 1 ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'text-white/60 hover:text-white'}`}
                                            >
                                                1X
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setIntegerScale(2)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold min-h-[32px] min-w-[32px] transition-all flex items-center justify-center ${integerScale === 2 ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'text-white/60 hover:text-white'}`}
                                            >
                                                2X
                                            </button>
                                        </div>
                                        <span>203 DPI · 1-BIT DITHERED</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Actions Bar */}
                        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-t border-[var(--lq-rim-subtle)] shrink-0 bg-[var(--lq-fill-surface,rgba(10,14,22,0.4))] pb-[max(0.625rem,env(safe-area-inset-bottom,0px))]">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleSelection(inspectIndex)}
                                    className={`px-3.5 py-2 min-h-[44px] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${selectedIndices.has(inspectIndex) ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'liquid-control text-[var(--lq-ink)]'}`}
                                >
                                    <Check size={14} strokeWidth={selectedIndices.has(inspectIndex) ? 3 : 2} />
                                    <span>{selectedIndices.has(inspectIndex) ? 'Included in Batch' : 'Include in Batch'}</span>
                                </button>
                                <span className="text-[11px] text-[var(--lq-ink-muted)] hidden sm:inline">
                                    {quantities[String(inspectedInstance.item.row)] ?? 1} copies configured
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--lq-ink-muted)] hidden sm:inline">Use ← / → keys to browse</span>
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(null)}
                                    className="px-5 py-2 min-h-[44px] rounded-lg liquid-control text-xs font-bold uppercase cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Sticky Footer (only when showChrome is true) */}
            {showChrome && onLaunchIframe && (
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-[var(--bg-color,#000)] via-[var(--bg-color,#000)]/80 to-transparent pointer-events-none flex justify-end items-end z-20">
                    <div className="flex items-center gap-3 p-2 bg-[var(--lq-fill-surface,rgba(20,20,20,0.85))] backdrop-blur-xl border border-[var(--border-color,rgba(255,255,255,0.1))] rounded-full shadow-2xl pointer-events-auto">
                        <button
                            onClick={() => onLaunchIframe(selectedIndices, labelInstances)}
                            disabled={selectedIndices.size === 0}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-black font-black tracking-widest text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            style={{ backgroundColor: 'var(--main-color, #7FBBFF)', boxShadow: '0 0 20px var(--main-color, #7FBBFF)' }}
                        >
                            <Printer size={16} />
                            {tr('EDIT')} ({selectedIndices.size})
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
