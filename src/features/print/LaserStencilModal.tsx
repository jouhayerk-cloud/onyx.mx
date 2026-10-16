import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, 
    Scissors, 
    Download, 
    Layers, 
    Printer, 
    Check, 
    Box, 
    CheckCircle,
    Sliders,
    Maximize2,
    RefreshCw
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import { recordExport } from './jobTracking';
import { 
    CrateCutfileStencilView, 
    BED_OPTIONS, 
    THICKNESS_OPTIONS, 
    BURN_OPTIONS,
    LaserBedOption 
} from '../logistics/CrateCutfileStencilView';
import { 
    generateProceduralCrateSvg, 
    CrateDimensions, 
    PackedItemSpec 
} from '../../lib/logistics/boxesBridge';
import { 
    downloadLaserCutfileSvg, 
    downloadLightBurnProject, 
    generateLightBurnProjectXml 
} from '../../lib/logistics/boxesCliBridge';
import { normalizeInventoryData } from '../../lib/utils';

export interface LaserStencilModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTemplateId?: string; // 'fmt-crate-lasercut-svg' | 'fmt-crate-stencil-lbrn2' | 'fmt-crate-dividers-svg'
    initialWidth?: number;  // default 60 cm
    initialLength?: number; // default 60 cm
    initialHeight?: number; // default 40 cm
    crateName?: string;     // default 'Standard_Crate'
    items?: { item: any; position: any }[];
    separators?: any[];
    onJobRecorded?: () => void;
}

interface CratePreset {
    id: string;
    label: string;
    w: number;
    l: number;
    h: number;
}

const CRATE_PRESETS: CratePreset[] = [
    { id: '60x60x40', label: '60 × 60 × 40 cm (Standard)', w: 60, l: 60, h: 40 },
    { id: '80x60x50', label: '80 × 60 × 50 cm (Master)', w: 80, l: 60, h: 50 },
    { id: '120x80x60', label: '120 × 80 × 60 cm (Pallet)', w: 120, l: 80, h: 60 },
    { id: '40x40x30', label: '40 × 40 × 30 cm (Compact)', w: 40, l: 40, h: 30 },
];

export const LaserStencilModal: React.FC<LaserStencilModalProps> = ({
    isOpen,
    onClose,
    initialTemplateId = 'fmt-crate-lasercut-svg',
    initialWidth = 60,
    initialLength = 60,
    initialHeight = 40,
    crateName: initialCrateName = 'Standard_Crate',
    items = [],
    separators = [],
    onJobRecorded
}) => {
    // Dimension state
    const [width, setWidth] = useState<number>(initialWidth);
    const [length, setLength] = useState<number>(initialLength);
    const [height, setHeight] = useState<number>(initialHeight);
    const [crateName, setCrateName] = useState<string>(initialCrateName);
    const [activePreset, setActivePreset] = useState<string>('60x60x40');

    // Laser fabrication parameters
    const [thickness, setThickness] = useState<number>(6);
    const [burn, setBurn] = useState<number>(0.1);
    const [bedSize, setBedSize] = useState<LaserBedOption>(BED_OPTIONS[2]); // 1200x600 default

    // UI state
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(true);
    const modalContainerRef = useRef<HTMLDivElement>(null);

    // Sync initial dimensions if modal re-opens
    useEffect(() => {
        if (isOpen) {
            setWidth(initialWidth);
            setLength(initialLength);
            setHeight(initialHeight);
            setCrateName(initialCrateName);
        }
    }, [isOpen, initialWidth, initialLength, initialHeight, initialCrateName]);

    // Handle Escape key dismissal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Normalized packed item specifications
    const packedItemSpecs: PackedItemSpec[] = useMemo(() => {
        if (!items || items.length === 0) return [];
        return items.map((it: any, idx: number) => {
            const itemObj = it.item || {};
            const pos = it.position || { x: 0, y: 0, z: 0 };
            const norm = itemObj.data ? normalizeInventoryData(itemObj.data) : {};
            const padding = 3;
            const iw = (Number(norm.widthCm) || Number(itemObj.widthCm) || 10) + padding;
            const il = (Number(norm.lengthCm) || Number(itemObj.lengthCm) || 10) + padding;
            const ih = (Number(norm.heightCm) || Number(itemObj.heightCm) || 10) + padding;
            return {
                id: String(itemObj.row || itemObj.id || idx),
                name: String(
                    norm.name || 
                    itemObj.name || 
                    (itemObj.data && (itemObj.data.name || itemObj.data.title)) || 
                    `Item ${idx + 1}`
                ),
                xCm: Number(pos.x) || 0,
                yCm: Number(pos.y) || 0,
                zCm: Number(pos.z) || 0,
                widthCm: iw,
                lengthCm: il,
                heightCm: ih
            };
        });
    }, [items]);

    const crateDimensions: CrateDimensions = useMemo(() => ({
        widthCm: width || 60,
        lengthCm: length || 60,
        heightCm: height || 40,
        thicknessMm: thickness,
        burnMm: burn
    }), [width, length, height, thickness, burn]);

    const currentSvgString = useMemo(() => {
        return generateProceduralCrateSvg(crateDimensions, packedItemSpecs, {
            bedWidthMm: bedSize.width,
            bedHeightMm: bedSize.height
        });
    }, [crateDimensions, packedItemSpecs, bedSize]);

    const safeBaseName = useMemo(() => {
        return (crateName || 'crate').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }, [crateName]);

    const volumeLiters = useMemo(() => {
        return ((width * length * height) / 1000).toFixed(1);
    }, [width, length, height]);

    const handleSelectPreset = (preset: CratePreset) => {
        setWidth(preset.w);
        setLength(preset.l);
        setHeight(preset.h);
        setActivePreset(preset.id);
        setCrateName(`Crate_${preset.w}x${preset.l}x${preset.h}`);
    };

    // Direct Export Actions
    const handleDownloadSvg = useCallback(() => {
        const filename = `${safeBaseName}-laser-cutfile-${thickness}mm.svg`;
        downloadLaserCutfileSvg(filename, currentSvgString);
        
        const templateId = initialTemplateId === 'fmt-crate-dividers-svg' 
            ? 'fmt-crate-dividers-svg' 
            : 'fmt-crate-lasercut-svg';

        recordExport({
            templateId,
            kind: 'label',
            fileName: filename,
            season: '826',
            channel: 'browser-download',
            crateLogisticsId: safeBaseName,
            params: {
                studio: 'laser-studio',
                widthCm: width,
                lengthCm: length,
                heightCm: height,
                thicknessMm: thickness,
                burnMm: burn,
                bedSize: bedSize.label,
                crateName
            }
        }, currentSvgString);

        setToastMessage(tr(`Downloaded SVG & recorded to queue: ${filename}`));
        setTimeout(() => setToastMessage(null), 3500);
        onJobRecorded?.();
    }, [safeBaseName, thickness, currentSvgString, initialTemplateId, width, length, height, burn, bedSize, crateName, onJobRecorded]);

    const handleDownloadLightBurn = useCallback(() => {
        const filename = `${safeBaseName}-lightburn-${thickness}mm.lbrn2`;
        const lbrnXml = generateLightBurnProjectXml(currentSvgString, {
            materialThickness: thickness,
            cutSpeed: 20,
            cutPower: 85
        });
        downloadLightBurnProject(filename, lbrnXml);

        recordExport({
            templateId: 'fmt-crate-stencil-lbrn2',
            kind: 'label',
            fileName: filename,
            season: '826',
            channel: 'browser-download',
            crateLogisticsId: safeBaseName,
            params: {
                studio: 'laser-studio',
                widthCm: width,
                lengthCm: length,
                heightCm: height,
                thicknessMm: thickness,
                burnMm: burn,
                bedSize: bedSize.label,
                crateName
            }
        }, lbrnXml);

        setToastMessage(tr(`Downloaded LightBurn project & queued: ${filename}`));
        setTimeout(() => setToastMessage(null), 3500);
        onJobRecorded?.();
    }, [safeBaseName, thickness, currentSvgString, width, length, height, burn, bedSize, crateName, onJobRecorded]);

    const handleRecordQueue = useCallback((meta?: { filename?: string; svgContent?: string; thickness?: number; burn?: number; bedSize?: string }) => {
        const finalThickness = meta?.thickness ?? thickness;
        const finalBurn = meta?.burn ?? burn;
        const finalBed = meta?.bedSize ?? bedSize.label;
        const finalFileName = meta?.filename ?? `${safeBaseName}-laser-cutfile-${finalThickness}mm.svg`;
        const finalSvg = meta?.svgContent ?? currentSvgString;

        const templateId = initialTemplateId || 'fmt-crate-lasercut-svg';

        recordExport({
            templateId,
            kind: 'label',
            fileName: finalFileName,
            season: '826',
            channel: 'print-dialog',
            crateLogisticsId: safeBaseName,
            params: {
                studio: 'laser-studio',
                widthCm: width,
                lengthCm: length,
                heightCm: height,
                thicknessMm: finalThickness,
                burnMm: finalBurn,
                bedSize: finalBed,
                crateName
            }
        }, finalSvg);

        setToastMessage(tr(`Job recorded to Print Center Queue: ${finalFileName}`));
        setTimeout(() => setToastMessage(null), 3500);
        onJobRecorded?.();
    }, [thickness, burn, bedSize, safeBaseName, currentSvgString, initialTemplateId, width, length, height, crateName, onJobRecorded]);

    const handleExportFromChild = useCallback((type: 'svg' | 'lbrn2', filename: string, content: string, meta: { thickness: number; burn: number; bedSize: string }) => {
        const templateId = type === 'lbrn2' 
            ? 'fmt-crate-stencil-lbrn2' 
            : (initialTemplateId === 'fmt-crate-dividers-svg' ? 'fmt-crate-dividers-svg' : 'fmt-crate-lasercut-svg');

        recordExport({
            templateId,
            kind: 'label',
            fileName: filename,
            season: '826',
            channel: 'browser-download',
            crateLogisticsId: safeBaseName,
            params: {
                studio: 'laser-studio',
                widthCm: width,
                lengthCm: length,
                heightCm: height,
                thicknessMm: meta.thickness,
                burnMm: meta.burn,
                bedSize: meta.bedSize,
                crateName
            }
        }, content);

        setToastMessage(tr(`Exported ${type.toUpperCase()} and registered in queue: ${filename}`));
        setTimeout(() => setToastMessage(null), 3500);
        onJobRecorded?.();
    }, [initialTemplateId, safeBaseName, width, length, height, crateName, onJobRecorded]);

    if (!isOpen) return null;

    const modalContent = (
        <div 
            className="fixed inset-0 z-[10050] flex flex-col items-center justify-end md:justify-center p-0 md:p-6 bg-black/80 backdrop-blur-md transition-all duration-300 animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="laser-stencil-modal-title"
        >
            {/* Sheet Modal Container */}
            <div 
                ref={modalContainerRef}
                className="relative w-full max-w-6xl h-[95vh] md:h-[90vh] max-h-[960px] flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden bg-black/80 backdrop-blur-2xl border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(6,182,212,0.15)] liquid-glass select-none"
            >
                {/* Grabber Handle (Apple HIG Sheets Guidance) */}
                <div 
                    className="w-12 h-1.5 rounded-full bg-white/20 hover:bg-white/40 cursor-grab mx-auto mt-2.5 mb-1 shrink-0 transition-colors" 
                    title={tr("Sheet Grabber")}
                />

                {/* Primary Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/10 shrink-0 bg-white/[0.02]">
                    {/* Leading: Studio Title and Badge */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                            <Scissors className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h2 id="laser-stencil-modal-title" className="text-base md:text-lg font-black text-white tracking-tight">
                                    {tr("Laser Stencil Studio")}
                                </h2>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                                    {initialTemplateId === 'fmt-crate-stencil-lbrn2' 
                                        ? 'LightBurn' 
                                        : initialTemplateId === 'fmt-crate-dividers-svg' 
                                            ? 'Dividers' 
                                            : 'Boxes.py SVG'}
                                </span>
                            </div>
                            <span className="text-[11px] text-white/50 font-medium">
                                {tr("Finger-Joint Crate Fabrication & Print Center Queue")}
                            </span>
                        </div>
                    </div>

                    {/* Center: Quick Presets */}
                    <div className="hidden lg:flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
                        {CRATE_PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleSelectPreset(preset)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                                    activePreset === preset.id
                                        ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 shadow-sm font-semibold'
                                        : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Trailing: Direct Export Actions & Close */}
                    <div className="flex items-center gap-2">
                        {/* Record to Queue Button */}
                        <button
                            type="button"
                            onClick={() => handleRecordQueue()}
                            title={tr("Record fabrication job in Print Center Queue immediately")}
                            className="isl-btn isl-btn--primary flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-500/30 to-amber-500/30 hover:from-cyan-500/40 hover:to-amber-500/40 text-cyan-200 border border-cyan-400/40 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] active:scale-95"
                        >
                            <Printer className="w-3.5 h-3.5 text-cyan-300" />
                            <span>{tr("Record to Queue")}</span>
                        </button>

                        {/* Download SVG */}
                        <button
                            type="button"
                            onClick={handleDownloadSvg}
                            title={tr("Download 2D Laser SVG and register in queue")}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                            <Download className="w-3.5 h-3.5 text-rose-400" />
                            <span>{tr("SVG")}</span>
                        </button>

                        {/* Download LightBurn */}
                        <button
                            type="button"
                            onClick={handleDownloadLightBurn}
                            title={tr("Download LightBurn (.lbrn2) project and register in queue")}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            <span>{tr(".lbrn2")}</span>
                        </button>

                        <div className="h-5 w-px bg-white/10 mx-1 hidden sm:block" />

                        {/* Dismiss Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                            aria-label={tr("Close Laser Studio")}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Progressive Disclosure Ribbon: Dimensions & Laser Parameters */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-white/10 shrink-0 bg-black/40 text-xs">
                    {/* Dimension Controls */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5 text-white/40" />
                            <span className="font-semibold text-white/70 uppercase tracking-wider text-[11px]">{tr("Crate")}:</span>
                        </div>

                        {/* Width */}
                        <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                            <span className="text-[10px] uppercase font-bold text-white/40 font-mono">W</span>
                            <input
                                type="number"
                                min="10"
                                max="250"
                                step="1"
                                value={width}
                                onChange={(e) => {
                                    setWidth(Math.max(10, Number(e.target.value) || 10));
                                    setActivePreset('custom');
                                }}
                                className="w-12 bg-transparent text-right text-white font-mono font-bold focus:outline-none focus:text-cyan-300"
                            />
                            <span className="text-[10px] text-white/40 font-mono">cm</span>
                        </div>

                        <span className="text-white/30 font-mono">×</span>

                        {/* Length */}
                        <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                            <span className="text-[10px] uppercase font-bold text-white/40 font-mono">L</span>
                            <input
                                type="number"
                                min="10"
                                max="250"
                                step="1"
                                value={length}
                                onChange={(e) => {
                                    setLength(Math.max(10, Number(e.target.value) || 10));
                                    setActivePreset('custom');
                                }}
                                className="w-12 bg-transparent text-right text-white font-mono font-bold focus:outline-none focus:text-cyan-300"
                            />
                            <span className="text-[10px] text-white/40 font-mono">cm</span>
                        </div>

                        <span className="text-white/30 font-mono">×</span>

                        {/* Height */}
                        <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                            <span className="text-[10px] uppercase font-bold text-white/40 font-mono">H</span>
                            <input
                                type="number"
                                min="10"
                                max="200"
                                step="1"
                                value={height}
                                onChange={(e) => {
                                    setHeight(Math.max(10, Number(e.target.value) || 10));
                                    setActivePreset('custom');
                                }}
                                className="w-12 bg-transparent text-right text-white font-mono font-bold focus:outline-none focus:text-cyan-300"
                            />
                            <span className="text-[10px] text-white/40 font-mono">cm</span>
                        </div>

                        {/* Volume Badge */}
                        <div className="hidden sm:flex items-center px-2 py-0.5 rounded bg-white/5 text-[11px] font-mono text-white/60">
                            <span>{volumeLiters} L</span>
                        </div>
                    </div>

                    {/* Laser Tuning Controls */}
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Thickness */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                {tr("Thickness")}:
                            </span>
                            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
                                {THICKNESS_OPTIONS.map(th => (
                                    <button
                                        key={th}
                                        type="button"
                                        onClick={() => setThickness(th)}
                                        className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                                            thickness === th
                                                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40 shadow-sm'
                                                : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {th}mm
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Kerf / Burn */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                {tr("Kerf")}:
                            </span>
                            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
                                {BURN_OPTIONS.map(b => (
                                    <button
                                        key={b}
                                        type="button"
                                        onClick={() => setBurn(b)}
                                        className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                                            burn === b
                                                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-400/40 shadow-sm'
                                                : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {b}mm
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bed Size */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                {tr("Bed")}:
                            </span>
                            <select
                                value={bedSize.id}
                                onChange={e => {
                                    const found = BED_OPTIONS.find(opt => opt.id === e.target.value);
                                    if (found) setBedSize(found);
                                }}
                                className="bg-black/70 border border-white/10 rounded-lg text-[11px] font-mono text-white/90 px-2 py-1 outline-none focus:border-cyan-400/50 cursor-pointer"
                            >
                                {BED_OPTIONS.map(opt => (
                                    <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Main Viewport Container */}
                <div className="flex-1 w-full h-full relative overflow-hidden bg-[#070b14]">
                    <CrateCutfileStencilView
                        width={width}
                        length={length}
                        height={height}
                        thickness={thickness}
                        onThicknessChange={setThickness}
                        burn={burn}
                        onBurnChange={setBurn}
                        bedSize={bedSize}
                        onBedSizeChange={setBedSize}
                        crateName={crateName}
                        items={items}
                        separators={separators}
                        onExport={handleExportFromChild}
                        onRecordQueue={handleRecordQueue}
                        showRecordQueueBtn={true}
                    />
                </div>

                {/* Floating Feedback Notification */}
                {toastMessage && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold rounded-full shadow-[0_0_25px_rgba(16,185,129,0.35)] backdrop-blur-2xl animate-fade-in pointer-events-none">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{toastMessage}</span>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
