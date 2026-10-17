import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { generateAxonometricDataUrl } from '../lib/axonometric';
import { tr, trf } from '../lib/i18n';

interface PreviewLabelsProps {
    items: any[];
    quantities: Record<string, number>;
    onClose?: () => void;
    onLaunchIframe?: (selectedIndices: Set<number>, allLabelInstances: any[]) => void;
    activeLabelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    onQuantityChange?: (row: string, qty: number) => void;
    showChrome?: boolean;
}

const LABEL_WIDTH_50x30 = 384;
const LABEL_HEIGHT_50x30 = 230;
const LABEL_WIDTH_50x50 = 384;
const LABEL_HEIGHT_50x50 = 384;

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

    return (
        <div className="flex-1 flex flex-col bg-transparent relative h-full min-h-0">
            {/* Header (only when showChrome is true) */}
            {showChrome && (
                <div className="shrink-0 relative z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-color,rgba(255,255,255,0.1))] bg-[var(--lq-fill-surface,rgba(10,10,10,0.5))] backdrop-blur-md">
                    <div>
                        <h2 className="text-xl font-black text-[var(--text-color,#fff)] tracking-tight">{tr('Preview Labels')}</h2>
                        <p className="text-[var(--secondary-text-color,rgba(255,255,255,0.5))] text-xs mt-0.5">{trf('{n} labels - Click to select/deselect', { n: labelInstances.length })}</p>
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
                        const norm = item.normData || {};
                        const codes = item.codes || {};
                        const isSelected = selectedIndices.has(globalIndex);
                        const axoSvg = axoCache[tag];
                        const bookv = String(norm.workbook || '326').replace(/v/gi, '');
                        const retailStr = String(codes.bookRetail || '0').padStart(4, '0');
                        const retail = `${codes.bookAqCode || ''}-${bookv}${retailStr}`;
                        const desc = `${norm.shape || ''} ${norm.itemType || norm.type || norm.shortDescription || norm.description || ''}`.trim() || 'Onyx Piece';
                        const matColor = `${norm.color || ''} ${norm.material || 'Onyx'}`.trim();
                        const lengthVal = norm.lengthCm ?? norm.widthCm ?? 0;
                        const dimsStr = `${norm.widthCm || 0}*${lengthVal}*${norm.heightCm || 0} CM${norm.weightKg ? `  WT ${norm.weightKg} KG` : ''}`;

                        return (
                            <div 
                                key={globalIndex}
                                onClick={() => toggleSelection(globalIndex)}
                                className={`group flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all border ${isSelected ? 'border-[var(--main-color,#7FBBFF)] bg-[var(--lq-fill-panel,rgba(255,255,255,0.06))] shadow-[0_0_15px_rgba(var(--main-color-rgb,127,187,255),0.15)]' : 'border-[var(--border-color,rgba(255,255,255,0.08))] bg-[var(--lq-fill-panel,rgba(255,255,255,0.02))] opacity-60 hover:opacity-100'}`}
                            >
                                {/* Render Label Card wrapper */}
                                <div 
                                    className="bg-white rounded-xl shadow-md overflow-hidden relative w-full" 
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
                                            {isSquare ? (
                                                /* 50x50 mm square preview */
                                                <div className="w-full h-full p-4 flex flex-col justify-between">
                                                    <div className="flex gap-3">
                                                        <div className="w-20 h-20 border-[3px] border-black p-1 flex items-center justify-center shrink-0">
                                                            <QRCodeSVG value={tag} size={68} level="M" />
                                                        </div>
                                                        <div className="flex-1 flex flex-col justify-start min-w-0 pt-0.5">
                                                            <h1 className="text-[17px] font-black leading-tight truncate">{desc}</h1>
                                                            <h2 className="text-[14px] text-gray-700 leading-tight mt-1 truncate">{matColor}</h2>
                                                            <p className="text-[11px] font-black text-black/80 mt-1">
                                                                {dimsStr}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-2 mt-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[15px] font-black tracking-tight">{retail}</span>
                                                            <span className="text-[11px] text-gray-500 font-semibold mt-0.5">{tr('Made in Mexico For')}</span>
                                                            <div className="h-7 flex items-center mt-1">
                                                                <img 
                                                                    src={logoVariant === 'RareEarth' ? `${import.meta.env.BASE_URL}REG_LogoGrayscale.png` : `${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} 
                                                                    alt="Brand" 
                                                                    className="max-h-6 max-w-[140px] object-contain" 
                                                                />
                                                            </div>
                                                        </div>
                                                        {axoSvg && (
                                                            <div className="w-20 h-20 flex items-center justify-center shrink-0">
                                                                <img src={axoSvg} alt="axo" className="w-full h-full object-contain mix-blend-multiply" />
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
                                                            />
                                                        </div>
                                                        <span className="text-[13px] font-black tracking-[0.2em] mt-1">{tag}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* 50x30 mm landscape preview */
                                                <div className="w-full h-full p-2.5 flex flex-col justify-between">
                                                    <div className="flex flex-1 gap-2 items-start">
                                                        {/* Vertical text */}
                                                        <div className="w-4 h-24 flex items-center justify-center shrink-0">
                                                            <span className="text-[8px] font-black -rotate-90 whitespace-nowrap uppercase tracking-widest text-black/70">
                                                                {tr('MADE IN MEXICO')}
                                                            </span>
                                                        </div>

                                                        {/* Axo icon */}
                                                        {axoSvg && (
                                                            <div className="w-12 h-16 flex items-center justify-center shrink-0">
                                                                <img src={axoSvg} alt="axo" className="w-full h-full object-contain mix-blend-multiply" />
                                                            </div>
                                                        )}

                                                        {/* Info stack */}
                                                        <div className="flex-1 flex flex-col justify-start min-w-0 pt-0.5 text-center">
                                                            <div className="text-[10px] font-black tracking-tight leading-none truncate">{retail}</div>
                                                            <div className="text-[13px] font-black leading-tight mt-1 truncate">{desc}</div>
                                                            <div className="text-[11px] text-gray-700 leading-none mt-1 truncate">{matColor}</div>
                                                            <div className="text-[9px] font-black text-black/80 mt-1 leading-none truncate">
                                                                {dimsStr}
                                                            </div>
                                                        </div>

                                                        {/* QR code */}
                                                        <div className="w-14 h-14 border-[2px] border-black p-0.5 flex items-center justify-center shrink-0">
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
                                                        />
                                                        <span className="text-[10px] font-black tracking-[0.25em] mt-0.5">{tag}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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

            {/* Sticky Footer (only when showChrome is true) */}
            {showChrome && onLaunchIframe && (
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-[var(--bg-color,#000)] via-[var(--bg-color,#000)]/80 to-transparent pointer-events-none flex justify-end items-end z-20">
                    <div className="flex items-center gap-3 p-2 bg-[var(--lq-fill-surface,rgba(20,20,20,0.85))] backdrop-blur-xl border border-[var(--border-color,rgba(255,255,255,0.1))] rounded-full shadow-2xl pointer-events-auto">
                        <button
                            onClick={() => onLaunchIframe(selectedIndices, labelInstances)}
                            disabled={selectedIndices.size === 0}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-black font-black tracking-widest text-xs transition-all active:scale-95 disabled:opacity-50"
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
