import React, { useState, useMemo } from 'react';
import { 
    Scissors, 
    Download, 
    Layers, 
    Copy, 
    Check, 
    ExternalLink, 
    Maximize2, 
    Cpu, 
    X
} from 'lucide-react';
import { useSetAtom } from 'jotai';
import { 
    generateProceduralCrateSvg, 
    formatBoxesCliCommand, 
    CrateDimensions 
} from '../../../lib/logistics/boxesBridge';
import { 
    downloadLaserCutfileSvg, 
    downloadLightBurnProject, 
    generateLightBurnProjectXml 
} from '../../../lib/logistics/boxesCliBridge';
import { 
    isCratePackingManagerOpenAtom, 
    packingManagerTargetCrateIdAtom, 
    activeViewAtom, 
    logisticsSubTabAtom 
} from '../../../lib/atoms';
import { tr } from '../../../lib/i18n';

export interface LaserCutfileCardProps {
    crateId: string;
    dimensionsMm: { x: number; y: number; h: number };
    materialThicknessMm: number;
    burnMm: number;
    generator: string;
    cliCommand: string;
    svgSnippet?: string;
    fullSvg?: string;
    onOpenStencil?: (crateId: string) => void;
}

export const LaserCutfileCard: React.FC<LaserCutfileCardProps> = ({
    crateId,
    dimensionsMm,
    materialThicknessMm = 6,
    burnMm = 0.1,
    generator = 'UniversalBox',
    cliCommand = '',
    svgSnippet,
    fullSvg,
    onOpenStencil
}) => {
    const [copied, setCopied] = useState(false);
    const [showZoomModal, setShowZoomModal] = useState(false);

    const setIsPackingManagerOpen = useSetAtom(isCratePackingManagerOpenAtom);
    const setTargetCrateId = useSetAtom(packingManagerTargetCrateIdAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);

    const safeCrateId = crateId || 'Crate';
    const safeBaseName = safeCrateId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    // Generate or use provided SVG markup
    const svgMarkup = useMemo(() => {
        if (fullSvg && fullSvg.startsWith('<svg') && fullSvg.includes('</svg>')) {
            return fullSvg;
        }
        if (svgSnippet && svgSnippet.startsWith('<svg') && svgSnippet.includes('</svg>')) {
            return svgSnippet;
        }

        const dims: CrateDimensions = {
            widthCm: (dimensionsMm?.x || 600) / 10,
            lengthCm: (dimensionsMm?.y || 600) / 10,
            heightCm: (dimensionsMm?.h || 400) / 10,
            thicknessMm: materialThicknessMm || 6,
            burnMm: burnMm || 0.1
        };

        return generateProceduralCrateSvg(dims, [], { bedWidthMm: 1200, bedHeightMm: 800 });
    }, [fullSvg, svgSnippet, dimensionsMm, materialThicknessMm, burnMm]);

    const handleDownloadSvg = (e: React.MouseEvent) => {
        e.stopPropagation();
        const filename = `${safeBaseName}-laser-cutfile-${materialThicknessMm || 6}mm.svg`;
        downloadLaserCutfileSvg(filename, svgMarkup);
    };

    const handleDownloadLightBurn = (e: React.MouseEvent) => {
        e.stopPropagation();
        const filename = `${safeBaseName}-lightburn-${materialThicknessMm || 6}mm.lbrn2`;
        const lbrnXml = generateLightBurnProjectXml(svgMarkup, {
            materialThickness: materialThicknessMm || 6,
            cutSpeed: 20,
            cutPower: 85
        });
        downloadLightBurnProject(filename, lbrnXml);
    };

    const handleCopyCli = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const cmd = cliCommand || formatBoxesCliCommand({
                generator: (generator as any) || 'UniversalBox',
                x: dimensionsMm?.x || 600,
                y: dimensionsMm?.y || 600,
                h: dimensionsMm?.h || 400,
                thickness: materialThicknessMm || 6,
                burn: burnMm || 0.1
            }, `${safeBaseName}_cutfile.svg`);

            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy CLI command:', err);
        }
    };

    const handleOpenStencil = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onOpenStencil) {
            onOpenStencil(crateId);
            return;
        }

        // Navigate to logistics packing workspace
        setTargetCrateId(crateId);
        setIsPackingManagerOpen(true);
        setActiveView('logistics');
        setLogisticsSubTab('crates');

        // Dispatch window event for 2D stencil synchronization
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('onyx:open-crate-stencil', {
                detail: {
                    crateId,
                    dimensionsMm,
                    materialThicknessMm,
                    burnMm
                }
            }));
        }
    };

    return (
        <div className="w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#0a0f1d]/90 backdrop-blur-xl overflow-hidden shadow-2xl liquid-glass text-white my-1 select-none">
            {/* Top glowing laser red / amber accent bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-rose-500 via-amber-400 to-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.7)]" />

            {/* Header: Laser Cut Stencil badge, Crate ID, generator type */}
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-black uppercase tracking-wider shadow-sm shrink-0">
                        <Scissors className="w-3 h-3 text-rose-400" />
                        <span>{tr("Laser Stencil")}</span>
                    </div>
                    <span className="font-mono font-bold text-xs text-white truncate" title={safeCrateId}>
                        {safeCrateId}
                    </span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-white/80 font-mono text-[10px] shrink-0">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>{generator || 'UniversalBox'}</span>
                </div>
            </div>

            {/* Dimension HUD: Width × Length × Height in mm, Material Thickness, Kerf Burn */}
            <div className="grid grid-cols-3 gap-2 px-3.5 py-2 bg-black/30 border-b border-white/5 text-center">
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{tr("Dimensions")}</span>
                    <span className="font-mono text-[11px] font-bold text-white/90">
                        {dimensionsMm?.x ?? 600}×{dimensionsMm?.y ?? 600}×{dimensionsMm?.h ?? 400} <span className="text-[9px] text-white/40">mm</span>
                    </span>
                </div>
                <div className="flex flex-col items-center border-x border-white/5">
                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{tr("Thickness")}</span>
                    <span className="font-mono text-[11px] font-bold text-amber-300">
                        {materialThicknessMm ?? 6} <span className="text-[9px] text-white/40">mm</span>
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{tr("Kerf Burn")}</span>
                    <span className="font-mono text-[11px] font-bold text-rose-300">
                        {burnMm ?? 0.1} <span className="text-[9px] text-white/40">mm</span>
                    </span>
                </div>
            </div>

            {/* Mini SVG Preview Viewport */}
            <div className="relative px-2 py-2 bg-[#050811] flex flex-col items-center justify-center border-b border-white/5 overflow-hidden group min-h-[120px] max-h-[145px]">
                {/* Blueprint grid background */}
                <div 
                    className="absolute inset-0 pointer-events-none opacity-30"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)',
                        backgroundSize: '12px 12px'
                    }}
                />
                
                {/* Embedded SVG Blueprint */}
                <div 
                    className="w-full flex items-center justify-center pointer-events-none overflow-hidden [&_svg]:max-w-full [&_svg]:max-h-[130px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:drop-shadow-md"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />

                {/* Stencil Watermark Tag */}
                <div className="absolute top-2 left-2 text-[8px] font-mono text-white/50 uppercase tracking-wider flex items-center gap-1.5 bg-black/60 px-1.5 py-0.5 rounded-md border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                    <span>2D STENCIL</span>
                </div>

                {/* Fullscreen Vector Zoom Trigger */}
                <button
                    type="button"
                    onClick={() => setShowZoomModal(true)}
                    title={tr("Enlarge Vector Blueprint")}
                    className="absolute bottom-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 border border-white/20 rounded-lg text-white/70 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg cursor-pointer"
                >
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* CLI Recipe Row with copy feedback */}
            {cliCommand && (
                <div className="px-3 py-1.5 bg-black/50 border-b border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-[9px] font-mono text-cyan-400 font-bold shrink-0">CLI:</span>
                        <span className="text-[10px] font-mono text-white/60 truncate" title={cliCommand}>
                            {cliCommand}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleCopyCli}
                        className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all border cursor-pointer ${
                            copied 
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border-white/10'
                        }`}
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? tr("Copied") : tr("Copy")}</span>
                    </button>
                </div>
            )}

            {/* Action Buttons: Download SVG, Download LightBurn, Open in Stencil View */}
            <div className="p-2.5 bg-black/40 flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleDownloadSvg}
                    title={tr("Download 2D Laser SVG Cutfile")}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                    <Download className="w-3.5 h-3.5" />
                    <span>{tr("SVG")}</span>
                </button>

                <button
                    type="button"
                    onClick={handleDownloadLightBurn}
                    title={tr("Download LightBurn .lbrn2 Project")}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{tr("LightBurn")}</span>
                </button>

                <button
                    type="button"
                    onClick={handleOpenStencil}
                    title={tr("Open Interactive 2D Stencil View in Logistics")}
                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-95 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] cursor-pointer"
                >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{tr("Stencil View")}</span>
                </button>
            </div>

            {/* Modal for full vector zoom */}
            {showZoomModal && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 sm:p-8 animate-in fade-in duration-200"
                    onClick={() => setShowZoomModal(false)}
                >
                    <div 
                        className="relative w-full max-w-4xl max-h-[90vh] bg-[#070b14] border border-white/20 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
                            <div className="flex items-center gap-2">
                                <Scissors className="w-4 h-4 text-rose-400" />
                                <span className="font-mono font-bold text-white text-sm">{safeCrateId} — Laser Stencil Blueprint</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowZoomModal(false)}
                                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:border [&_svg]:border-white/10 [&_svg]:rounded-xl [&_svg]:bg-[#090d16] [&_svg]:shadow-2xl">
                            <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
