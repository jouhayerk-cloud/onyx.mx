import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Printer, CheckSquare, Square, Bluetooth } from 'lucide-react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { generateAxonometricDataUrl } from '../lib/axonometric';

interface PreviewLabelsProps {
    items: any[];
    quantities: Record<string, number>;
    onClose: () => void;
    onLaunchIframe: (selectedIndices: Set<number>, allLabelInstances: any[]) => void;
}

const LABEL_WIDTH = 384;
const LABEL_HEIGHT = 230;

export const PreviewLabels: React.FC<PreviewLabelsProps> = ({ items, quantities, onClose, onLaunchIframe }) => {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [axoCache, setAxoCache] = useState<Record<string, string>>({});
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Flatten items by quantity
    const labelInstances = useMemo(() => {
        const instances: { item: any; index: number; globalIndex: number }[] = [];
        let globalIndex = 0;
        
        items.forEach(item => {
            const count = quantities[String(item.row)] || 1;
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
        const loadAxo = async () => {
            const cache: Record<string, string> = {};
            for (const item of items) {
                const tag = item.codes?.bookBarcode || '';
                if (!cache[tag]) {
                    const norm = item.normData || {};
                    const w = parseFloat(norm.w || '0');
                    const h = parseFloat(norm.h || '0');
                    const d = parseFloat(norm.d || '0');
                    const svg = await generateAxonometricDataUrl(w, h, d, norm.shape, norm.shortDescription, 'black');
                    cache[tag] = svg;
                }
            }
            setAxoCache(cache);
        };
        loadAxo();
    }, [items]);

    const toggleSelection = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    return (
        <div className="flex-1 flex flex-col bg-transparent relative h-full">
            {/* Header */}
            <div className="shrink-0 relative z-10 flex items-center justify-between px-8 py-6 bg-black/50 border-b border-white/5">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Preview Labels</h2>
                    <p className="text-white/40 text-sm mt-1">{labelInstances.length} labels - Click to select/deselect</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onLaunchIframe(selectedIndices, labelInstances)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white text-sm font-bold tracking-wide transition-all active:scale-95 border border-white/10"
                    >
                        <Printer size={16} />
                        EDIT
                    </button>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Grid Container */}
            <div className="flex-1 overflow-y-auto p-8 relative" ref={containerRef}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto pb-32">
                    {labelInstances.map((instance) => {
                        const { item, globalIndex } = instance;
                        const tag = item.codes?.bookBarcode || '';
                        const norm = item.normData || {};
                        const isSelected = selectedIndices.has(globalIndex);
                        const axoSvg = axoCache[tag];

                        return (
                            <div 
                                key={globalIndex}
                                onClick={() => toggleSelection(globalIndex)}
                                className={`group flex flex-col gap-3 p-4 rounded-3xl cursor-pointer transition-all ${isSelected ? 'bg-white/5 border border-white/20' : 'bg-transparent border border-white/5 opacity-40 hover:opacity-100 hover:bg-white/5'}`}
                            >
                                {/* Render Label Card wrapper */}
                                <div className="bg-white rounded-xl shadow-md overflow-hidden relative" style={{ paddingBottom: '60%' /* 30/50 aspect */ }}>
                                    
                                    {/* Actual DOM for rendering */}
                                    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center overflow-hidden">
                                        <div 
                                            id={`label-render-${globalIndex}`}
                                            className="bg-white flex relative text-black"
                                            style={{ 
                                                width: LABEL_WIDTH, 
                                                height: LABEL_HEIGHT,
                                                transformOrigin: 'top left'
                                            }}
                                            ref={(el) => {
                                                if (el && el.parentElement) {
                                                    const scale = el.parentElement.clientWidth / LABEL_WIDTH;
                                                    el.style.transform = `scale(${scale})`;
                                                }
                                            }}
                                        >
                                            {/* Left Text */}
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-bold tracking-widest uppercase whitespace-nowrap opacity-60">
                                                MADE IN MEXICO
                                            </div>

                                            {/* Axometric Icon */}
                                            {axoSvg && (
                                                <div className="absolute left-8 top-4 w-12 h-12 flex items-center justify-center">
                                                    <img src={axoSvg} alt="axo" className="w-full h-full object-contain mix-blend-multiply" />
                                                </div>
                                            )}

                                            {/* QR Code */}
                                            <div className="absolute right-4 top-4">
                                                <QRCodeSVG value={tag} size={48} level="M" />
                                            </div>

                                            {/* Center Content */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-start pt-6 text-center">
                                                <h1 className="text-xl font-black tracking-tight">{tag}</h1>
                                                <h2 className="text-[13px] font-bold mt-1 max-w-[200px] truncate leading-tight">{norm.shortDescription || norm.type}</h2>
                                                <h3 className="text-[11px] font-semibold text-black/60 max-w-[200px] truncate leading-tight">{norm.material}</h3>
                                                <p className="text-[9px] font-bold mt-1 text-black/80">
                                                    {norm.widthCm || 0}x{norm.lengthCm || 0}x{norm.heightCm || 0} CM  WT {norm.weightKg || 0} KG
                                                </p>

                                                {/* Barcode */}
                                                <div className="mt-2 flex justify-center">
                                                    <Barcode 
                                                        value={tag} 
                                                        width={1.6} 
                                                        height={45} 
                                                        displayValue={false} 
                                                        margin={0}
                                                        background="transparent"
                                                    />
                                                </div>
                                                <p className="text-[10px] font-bold tracking-[0.3em] mt-1">{tag.split('').join(' ')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Label Meta */}
                                <div className="flex flex-col items-center">
                                    <span className="text-white font-bold tracking-wide">{tag}</span>
                                    <span className="text-white/30 text-xs font-black">#{instance.index}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Sticky Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none flex justify-center md:justify-end items-end z-20">
                <div className="flex items-center gap-4 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-2 pl-6 rounded-full shadow-2xl pointer-events-auto">
                    <button
                        onClick={() => onLaunchIframe(selectedIndices, labelInstances)}
                        disabled={selectedIndices.size === 0}
                        className="flex items-center gap-2 px-8 py-3 rounded-full text-black font-black tracking-widest transition-all active:scale-95 disabled:opacity-50"
                        style={{ backgroundColor: 'var(--main-color)', boxShadow: '0 0 30px var(--main-color)' }}
                    >
                        <Printer size={18} />
                        START BATCH
                    </button>
                </div>
            </div>
        </div>
    );
};
