import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Printer, ChevronLeft, ChevronRight, Check, ZoomIn } from 'lucide-react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { generateAxonometricDataUrl } from '../lib/axonometric';
import { tr, trf } from '../lib/i18n';

export interface PreviewLabelsProps {
    items: any[];
    quantities: Record<string, number>;
    onClose?: () => void;
    onLaunchIframe?: (selectedIndices: Set<number>, allLabelInstances: any[]) => void;
    activeLabelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    onQuantityChange?: (row: string, qty: number) => void;
    showChrome?: boolean;
}

export const LABEL_WIDTH_50x30 = 384;
export const LABEL_HEIGHT_50x30 = 230;
export const LABEL_WIDTH_50x50 = 384;
export const LABEL_HEIGHT_50x50 = 384;

export interface PixelLabelViewProps {
    instance: { item: any; index: number; globalIndex: number };
    activeLabelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    axoSvg?: string;
    is1Bit?: boolean;
    scale?: number;
    className?: string;
}

/**
 * PixelLabelView: High-fidelity, crisp, pixel-perfect label preview
 * rendered identically to the Phomemo M110 designer/print engine.
 * Supports 1-bit monochrome thermal appearance with crisp pixelated scaling.
 */
export const PixelLabelView: React.FC<PixelLabelViewProps> = ({
    instance,
    activeLabelSize = '50x30',
    logoVariant = 'ArtOfDecor',
    axoSvg,
    is1Bit = true,
    scale,
    className = ''
}) => {
    const { item } = instance;
    const tag = item.codes?.bookBarcode || '';
    const norm = item.normData || {};
    const codes = item.codes || {};
    const isSquare = activeLabelSize === '50x50';
    const targetWidth = isSquare ? LABEL_WIDTH_50x50 : LABEL_WIDTH_50x30;
    const targetHeight = isSquare ? LABEL_HEIGHT_50x50 : LABEL_HEIGHT_50x30;

    const bookv = String(norm.workbook || '326').replace(/v/gi, '');
    const retailStr = String(codes.bookRetail || '0').padStart(4, '0');
    const retail = `${codes.bookAqCode || ''}-${bookv}${retailStr}`;
    const desc = `${norm.shape || ''} ${norm.itemType || norm.type || norm.shortDescription || norm.description || ''}`.trim() || 'Onyx Piece';
    const matColor = `${norm.color || ''} ${norm.material || 'Onyx'}`.trim();
    const lengthVal = norm.lengthCm ?? norm.widthCm ?? 0;
    const dimsStr = `${norm.widthCm || 0}*${lengthVal}*${norm.heightCm || 0} CM${norm.weightKg ? `  WT ${norm.weightKg} KG` : ''}`;

    const logoSrc = logoVariant === 'RareEarth' 
        ? `${import.meta.env.BASE_URL}REG_LogoGrayscale.png` 
        : `${import.meta.env.BASE_URL}ArtOfDecorLogo.png`;

    return (
        <div 
            className={`pixel-label-surface select-none relative bg-white text-black font-sans overflow-hidden border border-black/10 shadow-sm ${is1Bit ? 'pixel-label-1bit' : ''} ${className}`}
            style={{
                width: targetWidth,
                height: targetHeight,
                transform: scale ? `scale(${scale})` : undefined,
                transformOrigin: 'top left',
                imageRendering: 'pixelated',
            }}
        >
            {isSquare ? (
                /* 50x50 mm square layout (matches ONYX_MASTER_TEMPLATE_50x50) */
                <div className="w-full h-full p-4 flex flex-col justify-between relative bg-white text-black">
                    <div className="flex gap-3">
                        <div className="w-20 h-20 border-[3px] border-black p-1 flex items-center justify-center shrink-0 bg-white">
                            <QRCodeSVG value={tag} size={68} level="M" />
                        </div>
                        <div className="flex-1 flex flex-col justify-start min-w-0 pt-0.5">
                            <h1 className="text-[17px] font-black leading-tight truncate text-black">{desc}</h1>
                            <h2 className="text-[14px] text-black/80 font-bold leading-tight mt-1 truncate">{matColor}</h2>
                            <p className="text-[11px] font-black text-black mt-1">
                                {dimsStr}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="flex flex-col">
                            <span className="text-[15px] font-black tracking-tight text-black">{retail}</span>
                            <span className="text-[11px] text-black/70 font-bold mt-0.5">{tr('Made in Mexico For')}</span>
                            <div className="h-7 flex items-center mt-1">
                                <img 
                                    src={logoSrc} 
                                    alt="Brand" 
                                    className="max-h-6 max-w-[140px] object-contain filter grayscale contrast-200" 
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            </div>
                        </div>
                        {axoSvg && (
                            <div className="w-20 h-20 flex items-center justify-center shrink-0">
                                <img src={axoSvg} alt="axo" className="w-full h-full object-contain filter grayscale contrast-200" style={{ imageRendering: 'pixelated' }} />
                            </div>
                        )}
                    </div>

                    <div className="mt-2 flex flex-col items-center">
                        <div className="w-full flex justify-center">
                            <Barcode 
                                value={tag || "000"} 
                                width={1.6} 
                                height={50} 
                                displayValue={false} 
                                margin={0} 
                                background="transparent"
                                lineColor="#000000"
                            />
                        </div>
                        <span className="text-[13px] font-black tracking-[0.2em] mt-1 text-black font-mono">{tag}</span>
                    </div>
                </div>
            ) : (
                /* 50x30 mm landscape layout (matches ONYX_MASTER_TEMPLATE_V4) */
                <div className="w-full h-full p-2.5 flex flex-col justify-between relative bg-white text-black">
                    <div className="flex flex-1 gap-2 items-start">
                        {/* Vertical text */}
                        <div className="w-4 h-24 flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-black -rotate-90 whitespace-nowrap uppercase tracking-widest text-black">
                                {tr('MADE IN MEXICO')}
                            </span>
                        </div>

                        {/* Axo icon */}
                        {axoSvg && (
                            <div className="w-12 h-16 flex items-center justify-center shrink-0">
                                <img src={axoSvg} alt="axo" className="w-full h-full object-contain filter grayscale contrast-200" style={{ imageRendering: 'pixelated' }} />
                            </div>
                        )}

                        {/* Info stack */}
                        <div className="flex-1 flex flex-col justify-start min-w-0 pt-0.5 text-center">
                            <div className="text-[10px] font-black tracking-tight leading-none truncate text-black">{retail}</div>
                            <div className="text-[13px] font-black leading-tight mt-1 truncate text-black">{desc}</div>
                            <div className="text-[11px] text-black/80 font-bold leading-none mt-1 truncate">{matColor}</div>
                            <div className="text-[9px] font-black text-black mt-1 leading-none truncate">
                                {dimsStr}
                            </div>
                        </div>

                        {/* QR code */}
                        <div className="w-14 h-14 border-[2px] border-black p-0.5 flex items-center justify-center shrink-0 bg-white">
                            <QRCodeSVG value={tag} size={48} level="M" />
                        </div>
                    </div>

                    {/* Barcode */}
                    <div className="flex flex-col items-center mt-1">
                        <Barcode 
                            value={tag || "000"} 
                            width={1.5} 
                            height={40} 
                            displayValue={false} 
                            margin={0} 
                            background="transparent"
                            lineColor="#000000"
                        />
                        <span className="text-[10px] font-black tracking-[0.25em] mt-0.5 text-black font-mono">{tag}</span>
                    </div>
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
    onQuantityChange,
    showChrome = true
}) => {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [axoCache, setAxoCache] = useState<Record<string, string>>({});
    const [inspectIndex, setInspectIndex] = useState<number | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
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
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5 pb-24">
                    {labelInstances.map((instance) => {
                        const { item, globalIndex } = instance;
                        const tag = item.codes?.bookBarcode || '';
                        const isSelected = selectedIndices.has(globalIndex);
                        const axoSvg = axoCache[tag];

                        return (
                            <div 
                                key={globalIndex}
                                onClick={() => setInspectIndex(globalIndex)}
                                className={`group flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all border relative ${isSelected ? 'border-[var(--main-color,#7FBBFF)] bg-[var(--lq-fill-panel,rgba(255,255,255,0.06))] shadow-[0_0_15px_rgba(var(--main-color-rgb,127,187,255),0.15)]' : 'border-[var(--border-color,rgba(255,255,255,0.08))] bg-[var(--lq-fill-panel,rgba(255,255,255,0.02))] opacity-75 hover:opacity-100'}`}
                            >
                                {/* Quick select check button in top right of tile */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelection(globalIndex);
                                    }}
                                    className={`absolute top-4 right-4 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'bg-black/50 text-white/50 hover:text-white border border-white/20'}`}
                                    title={isSelected ? 'Deselect from print run' : 'Select for print run'}
                                    aria-label="Toggle Selection"
                                >
                                    {isSelected && <Check size={14} strokeWidth={3} />}
                                </button>

                                {/* Render Label Card wrapper */}
                                <div 
                                    className="bg-white rounded-xl shadow-md overflow-hidden relative w-full group-hover:ring-2 group-hover:ring-[var(--main-color,#7FBBFF)] transition-all" 
                                    style={{ paddingBottom: isSquare ? '100%' : '60%' }}
                                >
                                    {/* Unclipped absolute container for accurate scale mapping */}
                                    <div className="absolute inset-0 overflow-hidden">
                                        <div 
                                            id={`label-render-${globalIndex}`}
                                            className="bg-white absolute top-0 left-0 text-black font-sans select-none"
                                            style={{ 
                                                width: targetWidth, 
                                                height: targetHeight,
                                                transformOrigin: 'top left'
                                            }}
                                            ref={(el) => {
                                                if (el && el.parentElement) {
                                                    const scale = el.parentElement.clientWidth / targetWidth;
                                                    el.style.transform = `scale(${scale})`;
                                                }
                                            }}
                                        >
                                            <PixelLabelView 
                                                instance={instance}
                                                activeLabelSize={activeLabelSize}
                                                logoVariant={logoVariant}
                                                axoSvg={axoSvg}
                                                is1Bit={false}
                                            />
                                        </div>
                                    </div>

                                    {/* Subtle hover inspect prompt overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white text-xs font-bold transition-opacity backdrop-blur-[2px]">
                                        <ZoomIn size={14} />
                                        <span>Inspect 1-Bit</span>
                                    </div>
                                </div>
                                
                                {/* Label Meta */}
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[var(--text-color,#fff)] text-xs font-black tracking-wide truncate">{tag}</span>
                                    <span className="text-[var(--secondary-text-color,rgba(255,255,255,0.4))] text-[10px] font-bold">#{instance.index}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Interactive Pixel-Perfect 1-Bit Large Label Preview Modal */}
            {inspectedInstance && inspectIndex !== null && (
                <div className="fixed inset-0 z-[100030] flex items-center justify-center p-3 sm:p-6">
                    {/* Backdrop Scrim */}
                    <div 
                        className="lps-scrim absolute inset-0 cursor-pointer"
                        onClick={() => setInspectIndex(null)}
                    />

                    {/* Modal Window Sheet */}
                    <div className="lps-modal-sheet liquid-panel relative z-10 flex flex-col max-w-3xl w-full max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl border border-[var(--lq-rim)] bg-[var(--lq-fill-panel,rgba(14,18,28,0.92))] backdrop-blur-2xl">
                        {/* Header Bar */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--lq-rim-subtle)] shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black tracking-wider text-[var(--lq-ink,#fff)] truncate font-mono">
                                            {inspectedInstance.item.codes?.bookBarcode || 'LABEL PREVIEW'}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold liquid-control text-[var(--main-color,#7FBBFF)] uppercase tracking-wider">
                                            1-BIT PIXEL-PERFECT
                                        </span>
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

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(prev => (prev !== null && prev > 0 ? prev - 1 : labelInstances.length - 1))}
                                    className="w-8 h-8 rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Previous label (Left arrow)"
                                    aria-label="Previous label"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(prev => (prev !== null && prev < labelInstances.length - 1 ? prev + 1 : 0))}
                                    className="w-8 h-8 rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Next label (Right arrow)"
                                    aria-label="Next label"
                                >
                                    <ChevronRight size={18} />
                                </button>
                                <div className="w-px h-5 bg-[var(--lq-rim-subtle)] mx-1" />
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(null)}
                                    className="w-8 h-8 rounded-full liquid-control flex items-center justify-center text-[var(--lq-ink,#fff)] hover:bg-[var(--lq-fill-control-hover)] transition-all cursor-pointer"
                                    title="Close (Escape)"
                                    aria-label="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: Center Stage with Integer Scaling Container */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center min-h-0 bg-black/20">
                            <div className="lps-pixel-frame relative p-2 sm:p-4 rounded-xl bg-[var(--lq-fill-control,rgba(255,255,255,0.04))] border border-[var(--lq-rim-subtle)] flex flex-col items-center shadow-2xl">
                                {/* Crisp 1-bit monochrome rendering with exact proportions */}
                                <div 
                                    className="relative overflow-hidden bg-white rounded shadow-lg"
                                    style={{
                                        width: targetWidth,
                                        height: targetHeight,
                                        imageRendering: 'pixelated',
                                    }}
                                >
                                    <PixelLabelView 
                                        instance={inspectedInstance}
                                        activeLabelSize={activeLabelSize}
                                        logoVariant={logoVariant}
                                        axoSvg={axoCache[inspectedInstance.item.codes?.bookBarcode || '']}
                                        is1Bit={true}
                                    />
                                </div>

                                {/* Spec chip bar under preview */}
                                <div className="flex items-center justify-between w-full mt-3 px-1 text-[10px] text-[var(--lq-ink-muted,rgba(255,255,255,0.5))] font-mono uppercase tracking-wider">
                                    <span>{activeLabelSize === '50x50' ? '50 × 50 mm (384 × 384 px)' : '50 × 30 mm (384 × 230 px)'}</span>
                                    <span>203 DPI · 1-BIT DITHERED</span>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Actions Bar */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--lq-rim-subtle)] shrink-0 bg-[var(--lq-fill-surface,rgba(10,14,22,0.4))]">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleSelection(inspectIndex)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${selectedIndices.has(inspectIndex) ? 'bg-[var(--main-color,#7FBBFF)] text-black' : 'liquid-control text-[var(--lq-ink)]'}`}
                                >
                                    <Check size={14} strokeWidth={selectedIndices.has(inspectIndex) ? 3 : 2} />
                                    <span>{selectedIndices.has(inspectIndex) ? 'Included in Batch' : 'Include in Batch'}</span>
                                </button>
                                <span className="text-[11px] text-[var(--lq-ink-muted)]">
                                    {quantities[String(inspectedInstance.item.row)] ?? 1} copies configured
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--lq-ink-muted)] hidden sm:inline">Use ← / → keys to browse</span>
                                <button
                                    type="button"
                                    onClick={() => setInspectIndex(null)}
                                    className="px-4 py-1.5 rounded-lg liquid-control text-xs font-bold uppercase cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
