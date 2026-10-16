import { useState, useMemo, useRef, useEffect } from 'react';
import type { FC, MouseEvent } from 'react';
import { 
    Download, 
    ZoomIn, 
    ZoomOut, 
    Maximize2, 
    Layers, 
    Cpu, 
    Scissors, 
    Check, 
    Copy,
    Play,
    Pause,
    Gauge,
    Clock,
    ExternalLink,
    Terminal,
    Box,
    Grid,
    Sliders,
    Sparkles,
    CheckCircle2
} from 'lucide-react';
import { 
    generateProceduralCrateSvg, 
    CrateDimensions, 
    PackedItemSpec, 
    computeBoxesParams, 
    computeCutTelemetry,
    getToolpathSegments
} from '../../lib/logistics/boxesBridge';
import { 
    downloadLaserCutfileSvg, 
    downloadLightBurnProject, 
    generateLightBurnProjectXml,
    getBoxesCliRecipe,
    BOXES_RUNTIME,
    BOXES_GENERATORS,
    BOXES_MATERIAL_PRESETS,
    BoxesGeneratorType,
    BoxesMaterialPreset
} from '../../lib/logistics/boxesCliBridge';
import { tr } from '../../lib/i18n';
import { normalizeInventoryData } from '../../lib/utils';

export interface LaserBedOption {
    id: string;
    width: number;
    height: number;
    label: string;
}

export const BED_OPTIONS: LaserBedOption[] = [
    { id: '600x400', width: 600, height: 400, label: '600 × 400 mm' },
    { id: '900x600', width: 900, height: 600, label: '900 × 600 mm' },
    { id: '1200x600', width: 1200, height: 600, label: '1200 × 600 mm' },
    { id: '2440x1220', width: 2440, height: 1220, label: '2440 × 1220 mm (4×8ft)' },
];

export const THICKNESS_OPTIONS = [3, 5, 6, 9, 12];
export const BURN_OPTIONS = [0.07, 0.09, 0.13, 0.15, 0.18];

// Re-export MaterialPreset for backwards compatibility
export type MaterialPreset = BoxesMaterialPreset;
export const MATERIAL_PRESETS = BOXES_MATERIAL_PRESETS;

export interface WarehouseContainerOption {
    id: string;
    name: string;
    type: 'crate' | 'pallet' | 'cardboard' | 'custom';
    widthCm: number;
    lengthCm: number;
    heightCm: number;
    status?: string;
    inventoryCount?: number;
}

export interface CrateCutfileStencilViewProps {
    width?: number; // in cm
    length?: number; // in cm
    height?: number; // in cm
    items?: { item: any; position: any }[];
    separators?: any[];
    crateName?: string;
    highlightedItemId?: string;
    onHoverItem?: (id: string | null) => void;
    onSelectItem?: (id: string | null) => void;
    thickness?: number;
    onThicknessChange?: (th: number) => void;
    burn?: number;
    onBurnChange?: (b: number) => void;
    bedSize?: LaserBedOption;
    onBedSizeChange?: (bed: LaserBedOption) => void;
    generator?: BoxesGeneratorType;
    onGeneratorChange?: (gen: BoxesGeneratorType) => void;
    availableContainers?: WarehouseContainerOption[];
    selectedContainerId?: string;
    onSelectContainer?: (id: string) => void;
    onExport?: (type: 'svg' | 'lbrn2', filename: string, content: string, meta: { thickness: number; burn: number; bedSize: string }) => void;
    onRecordQueue?: (meta: { filename: string; svgContent: string; thickness: number; burn: number; bedSize: string }) => void;
    showRecordQueueBtn?: boolean;
}

export function getContainerClassification(type?: string | null, width?: number, length?: number, height?: number): {
    badge: 'WOOD CRATE' | 'FREIGHT PALLET' | 'BOXES.PY LASER BOX';
    label: string;
    color: string;
    border: string;
    bg: string;
    icon: string;
} {
    if (type === 'pallet') {
        return {
            badge: 'FREIGHT PALLET',
            label: 'Freight Pallet',
            color: 'text-cyan-300',
            border: 'border-cyan-500/30',
            bg: 'bg-cyan-500/10',
            icon: '▤'
        };
    }
    if (type === 'cardboard' || (width === 38 && length === 41 && height === 38) || type === 'boxes_py') {
        return {
            badge: 'BOXES.PY LASER BOX',
            label: 'Boxes.py Laser Box',
            color: 'text-amber-300',
            border: 'border-amber-500/30',
            bg: 'bg-amber-500/10',
            icon: '⚡'
        };
    }
    return {
        badge: 'WOOD CRATE',
        label: 'Wood Crate',
        color: 'text-emerald-300',
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-500/10',
        icon: '🪵'
    };
}

export const CrateCutfileStencilView: FC<CrateCutfileStencilViewProps> = ({
    width: propWidth = 60,
    length: propLength = 60,
    height: propHeight = 60,
    items = [],
    separators = [],
    crateName: propCrateName = 'Crate',
    highlightedItemId,
    onHoverItem,
    onSelectItem,
    thickness: propThickness,
    onThicknessChange,
    burn: propBurn,
    onBurnChange,
    bedSize: propBedSize,
    onBedSizeChange,
    generator: propGenerator,
    onGeneratorChange,
    availableContainers,
    selectedContainerId: propSelectedContainerId,
    onSelectContainer,
    onExport,
}) => {
    // Container Selection State
    const [selectedContainerId, setSelectedContainerId] = useState<string>(propSelectedContainerId || 'active');
    const [customWidth, setCustomWidth] = useState<number>(propWidth);
    const [customLength, setCustomLength] = useState<number>(propLength);
    const [customHeight, setCustomHeight] = useState<number>(propHeight);
    const [activeGenerator, setActiveGenerator] = useState<BoxesGeneratorType>(propGenerator || 'TypeTray');

    // Sync external props
    useEffect(() => {
        if (propGenerator) setActiveGenerator(propGenerator);
    }, [propGenerator]);

    useEffect(() => {
        if (propSelectedContainerId) setSelectedContainerId(propSelectedContainerId);
    }, [propSelectedContainerId]);

    useEffect(() => {
        setCustomWidth(propWidth);
        setCustomLength(propLength);
        setCustomHeight(propHeight);
    }, [propWidth, propLength, propHeight]);

    // Built-in container options if none provided
    const containersList: WarehouseContainerOption[] = useMemo(() => {
        if (availableContainers && availableContainers.length > 0) {
            return [
                ...availableContainers,
                { id: 'custom', name: 'Custom Dimensions', type: 'custom', widthCm: customWidth, lengthCm: customLength, heightCm: customHeight }
            ];
        }
        return [
            { id: 'active', name: `${propCrateName} (${propWidth}×${propLength}×${propHeight} cm)`, type: 'crate', widthCm: propWidth, lengthCm: propLength, heightCm: propHeight },
            { id: 'pallet-std', name: 'Euro Freight Pallet (120×80×14 cm)', type: 'pallet', widthCm: 120, lengthCm: 80, heightCm: 14 },
            { id: 'box-laser-std', name: 'Boxes.py Laser Box (38×41×38 cm)', type: 'cardboard', widthCm: 38, lengthCm: 41, heightCm: 38 },
            { id: 'tray-compact', name: 'Organizer Tray (40×30×15 cm)', type: 'cardboard', widthCm: 40, lengthCm: 30, heightCm: 15 },
            { id: 'custom', name: 'Custom Dimensions', type: 'custom', widthCm: customWidth, lengthCm: customLength, heightCm: customHeight }
        ];
    }, [availableContainers, propCrateName, propWidth, propLength, propHeight, customWidth, customLength, customHeight]);

    const activeContainer = useMemo(() => {
        return containersList.find(c => c.id === selectedContainerId) || containersList[0];
    }, [containersList, selectedContainerId]);

    const effectiveWidth = activeContainer.id === 'custom' ? customWidth : activeContainer.widthCm;
    const effectiveLength = activeContainer.id === 'custom' ? customLength : activeContainer.lengthCm;
    const effectiveHeight = activeContainer.id === 'custom' ? customHeight : activeContainer.heightCm;
    const effectiveCrateName = activeContainer.id === 'custom' ? 'Custom_Box' : (activeContainer.name || propCrateName);

    const classification = useMemo(() => {
        return getContainerClassification(activeContainer.type, effectiveWidth, effectiveLength, effectiveHeight);
    }, [activeContainer.type, effectiveWidth, effectiveLength, effectiveHeight]);

    // Laser settings state
    const [internalThickness, setInternalThickness] = useState<number>(3);
    const [internalBurn, setInternalBurn] = useState<number>(0.09);
    const [internalBedSize, setInternalBedSize] = useState<LaserBedOption>(BED_OPTIONS[2]); // 1200x600 default
    const [copiedCli, setCopiedCli] = useState<boolean>(false);
    const [copiedServer, setCopiedServer] = useState<boolean>(false);

    const thickness = propThickness ?? internalThickness;
    const burn = propBurn ?? internalBurn;
    const bedSize = propBedSize ?? internalBedSize;

    const setThickness = (val: number) => {
        setInternalThickness(val);
        onThicknessChange?.(val);
    };

    const setBurn = (val: number) => {
        setInternalBurn(val);
        onBurnChange?.(val);
    };

    const setBedSize = (val: LaserBedOption) => {
        setInternalBedSize(val);
        onBedSizeChange?.(val);
    };

    const handleSelectGenerator = (gen: BoxesGeneratorType) => {
        setActiveGenerator(gen);
        onGeneratorChange?.(gen);
    };

    // Active material preset calculation
    const activePreset = useMemo(() => {
        return BOXES_MATERIAL_PRESETS.find(
            p => p.thicknessMm === thickness && Math.abs(p.burnMm - burn) < 0.005
        ) || null;
    }, [thickness, burn]);

    const handleSelectPreset = (presetId: string) => {
        const found = BOXES_MATERIAL_PRESETS.find(p => p.id === presetId);
        if (found) {
            setThickness(found.thicknessMm);
            setBurn(found.burnMm);
        }
    };

    // Pan & Zoom state
    const [scale, setScale] = useState<number>(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const dragStartRef = useRef<{ startX: number; startY: number; panX: number; panY: number }>({
        startX: 0,
        startY: 0,
        panX: 0,
        panY: 0
    });
    const viewportRef = useRef<HTMLDivElement>(null);

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

    const highlightedItem = useMemo(() => {
        if (!highlightedItemId) return null;
        return packedItemSpecs.find(p => p.id === String(highlightedItemId)) || null;
    }, [highlightedItemId, packedItemSpecs]);

    // Crate parameters for Boxes.py
    const crateDimensions: CrateDimensions = useMemo(() => ({
        widthCm: effectiveWidth || 60,
        lengthCm: effectiveLength || 60,
        heightCm: effectiveHeight || 60,
        thicknessMm: thickness,
        burnMm: burn
    }), [effectiveWidth, effectiveLength, effectiveHeight, thickness, burn]);

    const boxesParams = useMemo(() => {
        const params = computeBoxesParams(crateDimensions, packedItemSpecs);
        params.generator = activeGenerator as any;
        return params;
    }, [crateDimensions, packedItemSpecs, activeGenerator]);

    const svgString = useMemo(() => {
        return generateProceduralCrateSvg(crateDimensions, packedItemSpecs, {
            bedWidthMm: bedSize.width,
            bedHeightMm: bedSize.height,
            highlightedItemId
        });
    }, [crateDimensions, packedItemSpecs, bedSize, highlightedItemId]);

    // Telemetry computation (Perimeter, Area, Efficiency, Est Cut Time, Panel Count)
    const telemetry = useMemo(() => {
        return computeCutTelemetry(crateDimensions, packedItemSpecs, bedSize.width, bedSize.height);
    }, [crateDimensions, packedItemSpecs, bedSize]);

    // CNC Toolpath Segments for Laser Trace Simulation
    const toolpathSegments = useMemo(() => {
        return getToolpathSegments(crateDimensions, packedItemSpecs);
    }, [crateDimensions, packedItemSpecs]);

    const totalSimDistance = useMemo(() => {
        return toolpathSegments.reduce((sum, s) => sum + s.lengthMm, 0);
    }, [toolpathSegments]);

    // Laser Trace Simulation state
    const [isSimulating, setIsSimulating] = useState<boolean>(false);
    const [laserHead, setLaserHead] = useState<{ x: number; y: number; isCut: boolean; panelId?: string }>({
        x: 10,
        y: 10,
        isCut: false
    });
    const animFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const distanceTraveledRef = useRef<number>(0);

    const toggleSimulation = () => {
        const prefersReducedMotion = typeof window !== 'undefined'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReducedMotion) {
            setIsSimulating(prev => !prev);
            setLaserHead({ x: 50, y: 50, isCut: true, panelId: 'reduced-motion' });
            return;
        }

        setIsSimulating(prev => {
            const next = !prev;
            if (!next) {
                if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
                lastTimestampRef.current = null;
            }
            return next;
        });
    };

    useEffect(() => {
        if (!isSimulating || toolpathSegments.length === 0 || totalSimDistance === 0) {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            lastTimestampRef.current = null;
            return;
        }

        const prefersReducedMotion = typeof window !== 'undefined'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        // Fluid CNC preview feed rate: ~350 mm/s
        const simSpeedMmPerSec = 350;

        const tick = (timestamp: number) => {
            if (lastTimestampRef.current === null) {
                lastTimestampRef.current = timestamp;
            }
            const deltaSec = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.1);
            lastTimestampRef.current = timestamp;

            distanceTraveledRef.current = (distanceTraveledRef.current + deltaSec * simSpeedMmPerSec) % totalSimDistance;

            let accumulated = 0;
            let activeSegment = toolpathSegments[0];
            let segT = 0;

            for (const seg of toolpathSegments) {
                if (distanceTraveledRef.current <= accumulated + seg.lengthMm) {
                    activeSegment = seg;
                    segT = seg.lengthMm > 0 ? (distanceTraveledRef.current - accumulated) / seg.lengthMm : 0;
                    break;
                }
                accumulated += seg.lengthMm;
            }

            const currentX = activeSegment.x1 + segT * (activeSegment.x2 - activeSegment.x1);
            const currentY = activeSegment.y1 + segT * (activeSegment.y2 - activeSegment.y1);

            setLaserHead({
                x: currentX,
                y: currentY,
                isCut: activeSegment.isCut,
                panelId: activeSegment.panelId
            });

            animFrameRef.current = requestAnimationFrame(tick);
        };

        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isSimulating, toolpathSegments, totalSimDistance]);

    // Wheel zoom handling with non-passive event listener
    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 0.89;
            setScale(prev => Math.min(Math.max(0.2, prev * factor), 5.0));
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', onWheel);
        };
    }, []);

    // Mouse drag pan handlers
    const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        setIsDragging(true);
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y
        };
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.startX;
        const dy = e.clientY - dragStartRef.current.startY;
        setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleZoomIn = () => {
        setScale(prev => Math.min(prev * 1.2, 5.0));
    };

    const handleZoomOut = () => {
        setScale(prev => Math.max(prev / 1.2, 0.2));
    };

    const handleResetZoom = () => {
        setScale(1);
        setPan({ x: 0, y: 0 });
    };

    // Export Handlers
    const safeBaseName = useMemo(() => {
        return (effectiveCrateName || 'crate').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }, [effectiveCrateName]);

    const handleDownloadSvg = () => {
        const filename = `${safeBaseName}-laser-${activeGenerator}-${thickness}mm.svg`;
        downloadLaserCutfileSvg(filename, svgString);
        onExport?.('svg', filename, svgString, { thickness, burn, bedSize: bedSize.id });
    };

    const handleDownloadLightBurn = () => {
        const filename = `${safeBaseName}-lightburn-${activeGenerator}-${thickness}mm.lbrn2`;
        const lbrnXml = generateLightBurnProjectXml(svgString, {
            materialThickness: thickness,
            cutSpeed: 20,
            cutPower: 85
        });
        downloadLightBurnProject(filename, lbrnXml);
        onExport?.('lbrn2', filename, lbrnXml, { thickness, burn, bedSize: bedSize.id });
    };

    // PowerShell CLI recipe with $env:PYTHONUTF8=1
    const cliRecipeCommand = useMemo(() => {
        const isTray = activeGenerator === 'TypeTray';
        const args: Record<string, any> = {
            x: Math.round(effectiveWidth * 10 * 100) / 100,
            y: Math.round(effectiveLength * 10 * 100) / 100,
            h: Math.round(effectiveHeight * 10 * 100) / 100,
            thickness,
            burn,
            outside: 1
        };
        if (isTray && (boxesParams.sx || boxesParams.sy)) {
            if (boxesParams.sx) args.sx = boxesParams.sx;
            if (boxesParams.sy) args.sy = boxesParams.sy;
        }
        return getBoxesCliRecipe(activeGenerator, args, `${safeBaseName}_cutfile.svg`);
    }, [activeGenerator, effectiveWidth, effectiveLength, effectiveHeight, thickness, burn, boxesParams, safeBaseName]);

    const handleCopyCliCommand = async () => {
        try {
            await navigator.clipboard.writeText(cliRecipeCommand);
            setCopiedCli(true);
            setTimeout(() => setCopiedCli(false), 2500);
        } catch (err) {
            console.error('Failed to copy CLI command:', err);
        }
    };

    const handleLaunchWebServer = async () => {
        try {
            await navigator.clipboard.writeText(BOXES_RUNTIME.serverCommand);
            setCopiedServer(true);
            setTimeout(() => setCopiedServer(false), 3000);
            window.open(BOXES_RUNTIME.serverUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            window.open(BOXES_RUNTIME.serverUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const panelCountText = useMemo(() => {
        const base = '5 Panels';
        if (boxesParams.sx || boxesParams.sy) {
            return `${base} + Grid`;
        }
        return `${base} (${activeGenerator})`;
    }, [boxesParams, activeGenerator]);

    return (
        <div className="ui-root w-full h-full relative overflow-hidden flex flex-col bg-[#070b14] select-none text-white font-sans">
            {/* ─── Top Boxes.py Software & Generator Header Ribbon ─── */}
            <header className="z-30 w-full bg-black/85 backdrop-blur-2xl border-b border-white/10 px-4 py-2.5 flex flex-col gap-2 shadow-2xl">
                {/* Upper Tier: Installed Engine Status, Container Selector & Web Server Launcher */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Left: Engine Status & Container Classification */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Boxes.py Installed Engine Badge */}
                        <div 
                            className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-400/30 rounded-xl text-emerald-300 font-mono text-[11px] shadow-sm"
                            title={`Installed executable: ${BOXES_RUNTIME.cliPath}\nPython Environment: ${BOXES_RUNTIME.pythonVersion}\nUTF-8 Guard: Active`}
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="font-bold tracking-tight">
                                {BOXES_RUNTIME.statusPillText}
                            </span>
                        </div>

                        {/* Classification Badge (WOOD CRATE / FREIGHT PALLET / BOXES.PY LASER BOX) */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${classification.bg} ${classification.border} ${classification.color}`}>
                            <span>{classification.icon}</span>
                            <span>{classification.badge}</span>
                        </div>
                    </div>

                    {/* Center / Right: Warehouse Container Switcher & Web Server Action */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Container Selector */}
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1">
                            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                {tr("Container")}:
                            </span>
                            <select
                                value={selectedContainerId}
                                onChange={e => {
                                    const nextId = e.target.value;
                                    setSelectedContainerId(nextId);
                                    onSelectContainer?.(nextId);
                                }}
                                className="bg-transparent text-white font-mono text-[11px] outline-none cursor-pointer"
                            >
                                {containersList.map(c => (
                                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* If custom, inline dimension inputs */}
                        {activeContainer.id === 'custom' && (
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-[11px] font-mono">
                                <input
                                    type="number"
                                    min="5"
                                    max="300"
                                    value={customWidth}
                                    onChange={e => setCustomWidth(Math.max(5, Number(e.target.value)))}
                                    className="w-10 bg-transparent text-center text-cyan-300 font-bold outline-none"
                                    title="Width in cm"
                                />
                                <span className="text-white/30">×</span>
                                <input
                                    type="number"
                                    min="5"
                                    max="300"
                                    value={customLength}
                                    onChange={e => setCustomLength(Math.max(5, Number(e.target.value)))}
                                    className="w-10 bg-transparent text-center text-cyan-300 font-bold outline-none"
                                    title="Length in cm"
                                />
                                <span className="text-white/30">×</span>
                                <input
                                    type="number"
                                    min="5"
                                    max="300"
                                    value={customHeight}
                                    onChange={e => setCustomHeight(Math.max(5, Number(e.target.value)))}
                                    className="w-10 bg-transparent text-center text-cyan-300 font-bold outline-none"
                                    title="Height in cm"
                                />
                                <span className="text-white/40 text-[9px]">CM</span>
                            </div>
                        )}

                        {/* Launch Local Boxes.py Web Server Button */}
                        <button
                            type="button"
                            onClick={handleLaunchWebServer}
                            title={`${tr("Launch local interactive web server and copy PowerShell command to clipboard")}: ${BOXES_RUNTIME.serverCommand}`}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all border active:scale-95 shadow-sm ${
                                copiedServer
                                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                    : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/15'
                            }`}
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{copiedServer ? tr("Server :8080 (Copied)") : tr("Boxes.py Web Server (:8080)")}</span>
                        </button>
                    </div>
                </div>

                {/* Lower Tier: Generator Selector Pills Ribbon */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                    {/* Generator Selector Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mr-1 hidden sm:inline">
                            {tr("Generator")}:
                        </span>
                        {(['TypeTray', 'UniversalBox', 'ABox', 'ClosedBox', 'FlexBox'] as BoxesGeneratorType[]).map(genKey => {
                            const meta = BOXES_GENERATORS[genKey];
                            const isSelected = activeGenerator === genKey;
                            return (
                                <button
                                    key={genKey}
                                    type="button"
                                    onClick={() => handleSelectGenerator(genKey)}
                                    title={meta.description}
                                    className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border cursor-pointer ${
                                        isSelected
                                            ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                                            : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'
                                    }`}
                                >
                                    {genKey === 'TypeTray' ? <Grid className="w-3 h-3 text-cyan-400" /> : <Box className="w-3 h-3 text-amber-400" />}
                                    <span>{meta.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Active generator note */}
                    <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono text-white/40">
                        <span className="text-cyan-300 font-bold">[{BOXES_GENERATORS[activeGenerator].badge}]</span>
                        <span>{BOXES_GENERATORS[activeGenerator].recommendedFor}</span>
                    </div>
                </div>
            </header>

            {/* ─── Floating Laser Configuration & Export Toolbar ─── */}
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-black/75 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-[96%]">
                {/* Quick-Select Material Presets */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {tr("Material")}:
                    </span>
                    <select
                        value={activePreset?.id || 'custom'}
                        onChange={e => {
                            if (e.target.value !== 'custom') {
                                handleSelectPreset(e.target.value);
                            }
                        }}
                        className="bg-black/70 border border-white/10 rounded-lg text-[11px] font-mono text-white/90 px-2 py-1 outline-none focus:border-white/30 cursor-pointer min-h-[28px]"
                    >
                        {BOXES_MATERIAL_PRESETS.map(preset => (
                            <option key={preset.id} value={preset.id} className="bg-slate-900 text-white">
                                {preset.name} (burn {preset.burnMm}mm)
                            </option>
                        ))}
                        <option value="custom" className="bg-slate-900 text-white/60">
                            {tr("Custom Settings")}
                        </option>
                    </select>
                </div>

                {/* Thickness Selector */}
                <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider hidden sm:inline">
                        {tr("Thick")}:
                    </span>
                    <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
                        {THICKNESS_OPTIONS.map(th => (
                            <button
                                key={th}
                                type="button"
                                onClick={() => setThickness(th)}
                                className={`px-1.5 sm:px-2 py-0.5 text-[11px] font-mono rounded transition-colors min-w-[28px] min-h-[28px] sm:min-w-0 sm:min-h-0 flex items-center justify-center ${
                                    thickness === th
                                        ? 'bg-white/20 text-white font-bold border border-white/30 shadow-sm'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {th}mm
                            </button>
                        ))}
                    </div>
                </div>

                {/* Kerf / Burn Selector */}
                <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider hidden sm:inline">
                        {tr("Kerf")}:
                    </span>
                    <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
                        {BURN_OPTIONS.map(b => (
                            <button
                                key={b}
                                type="button"
                                onClick={() => setBurn(b)}
                                className={`px-1.5 sm:px-2 py-0.5 text-[11px] font-mono rounded transition-colors min-w-[28px] min-h-[28px] sm:min-w-0 sm:min-h-0 flex items-center justify-center ${
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

                {/* Laser Bed Selector */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider hidden md:inline">
                        {tr("Bed")}:
                    </span>
                    <select
                        value={bedSize.id}
                        onChange={e => {
                            const found = BED_OPTIONS.find(opt => opt.id === e.target.value);
                            if (found) setBedSize(found);
                        }}
                        className="bg-black/70 border border-white/10 rounded-lg text-[11px] font-mono text-white/90 px-2 py-1 outline-none focus:border-white/30 cursor-pointer min-h-[28px]"
                    >
                        {BED_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="h-4 w-px bg-white/10 mx-0.5 hidden sm:block" />

                {/* Simulation & One-Click Export Actions */}
                <div className="flex items-center gap-1.5">
                    {/* Laser Trace Simulation Toggle */}
                    <button
                        type="button"
                        onClick={toggleSimulation}
                        title={isSimulating ? tr("Pause Laser Trace Simulation") : tr("Start Animated Laser Trace Simulation")}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm border active:scale-95 min-h-[28px] ${
                            isSimulating
                                ? 'bg-rose-500/25 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                                : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/10'
                        }`}
                    >
                        {isSimulating ? <Pause className="w-3.5 h-3.5 text-rose-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
                        <span>{isSimulating ? tr("Pause Trace") : tr("Trace Sim")}</span>
                    </button>

                    {/* SVG Download */}
                    <button
                        type="button"
                        onClick={handleDownloadSvg}
                        title={tr("Download 2D Laser SVG Cutfile")}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-white/5 hover:bg-white/10 text-white/90 border border-white/15 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 min-h-[28px]"
                    >
                        <Download className="w-3.5 h-3.5 text-rose-400" />
                        <span>{tr("SVG Cutfile")}</span>
                    </button>

                    {/* LightBurn Download */}
                    <button
                        type="button"
                        onClick={handleDownloadLightBurn}
                        title={tr("Download LightBurn .lbrn2 Project with Cut & Engrave layers")}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-white/5 hover:bg-white/10 text-white/90 border border-white/15 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 min-h-[28px]"
                    >
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>{tr("LightBurn (.lbrn2)")}</span>
                    </button>

                    {/* Copy C:\boxes PowerShell CLI Command */}
                    <button
                        type="button"
                        onClick={handleCopyCliCommand}
                        title={`Copy Windows PowerShell command line:\n${cliRecipeCommand}`}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm border active:scale-95 min-h-[28px] ${
                            copiedCli
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/10'
                        }`}
                    >
                        {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Terminal className="w-3.5 h-3.5 text-cyan-400" />}
                        <span>{copiedCli ? tr("Copied C:\\boxes") : tr("Copy C:\\boxes CLI")}</span>
                    </button>
                </div>
            </div>

            {/* Synchronized Spatial Highlight Pill */}
            {highlightedItem && (
                <div className="absolute top-44 left-6 z-20 flex items-center gap-2.5 px-3.5 py-1.5 bg-black/80 backdrop-blur-xl border border-cyan-400/40 rounded-xl shadow-xl shadow-cyan-950/40 transition-all pointer-events-auto">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-cyan-300">
                        {highlightedItem.name}
                    </span>
                    <span className="text-[10px] font-mono text-white/40 border-l border-white/10 pl-2">
                        {Math.round(highlightedItem.widthCm)}×{Math.round(highlightedItem.lengthCm)}×{Math.round(highlightedItem.heightCm)} cm
                    </span>
                </div>
            )}

            {/* Real-time Simulation Status HUD */}
            {isSimulating && (
                <div className="absolute top-44 right-6 z-20 flex items-center gap-2.5 px-3.5 py-1.5 bg-black/80 backdrop-blur-xl border border-rose-500/30 rounded-xl shadow-xl shadow-rose-950/40 font-mono text-[11px] pointer-events-auto">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <span className={laserHead.isCut ? "text-rose-400 font-bold" : "text-amber-400 font-bold"}>
                        {laserHead.isCut ? "LASER ACTIVE 85% [CUT]" : "RAPID TRAVERSE [G00]"}
                    </span>
                    <span className="text-white/40 border-l border-white/10 pl-2">
                        X:{laserHead.x.toFixed(1)} Y:{laserHead.y.toFixed(1)} mm
                    </span>
                </div>
            )}

            {/* Floating Zoom & Pan Controls */}
            <div className="absolute right-4 top-56 z-20 flex flex-col items-center gap-1 p-1 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl">
                <button
                    type="button"
                    onClick={handleZoomIn}
                    title={tr("Zoom In")}
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center cursor-pointer"
                >
                    <ZoomIn className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={handleZoomOut}
                    title={tr("Zoom Out")}
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center cursor-pointer"
                >
                    <ZoomOut className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={handleResetZoom}
                    title={tr("Fit / Reset View")}
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center cursor-pointer"
                >
                    <Maximize2 className="w-4 h-4" />
                </button>
                <div className="px-1 py-0.5 text-[9px] font-mono text-white/40">
                    {Math.round(scale * 100)}%
                </div>
            </div>

            {/* Interactive SVG Viewport with Drag Pan & Zoom */}
            <div
                ref={viewportRef}
                className={`w-full flex-1 flex items-center justify-center overflow-hidden cursor-${isDragging ? 'grabbing' : 'grab'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: 'center center',
                        transition: isDragging ? 'none' : 'transform 0.12s ease-out'
                    }}
                    className="pointer-events-none drop-shadow-2xl flex items-center justify-center relative w-[960px] h-auto rounded-xl shadow-2xl border border-white/10 bg-[#090d16] overflow-hidden"
                >
                    <div
                        className="w-full h-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-w-none [&_svg]:block"
                        dangerouslySetInnerHTML={{ __html: svgString }}
                    />

                    {/* Animated Laser Head Beam Path Trace Simulation Overlay */}
                    {isSimulating && (
                        <svg
                            viewBox={`0 0 ${bedSize.width} ${bedSize.height}`}
                            className="absolute inset-0 w-full h-full pointer-events-none z-10"
                            style={{ overflow: 'visible' }}
                        >
                            <defs>
                                <radialGradient id="simLaserGlowRed" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.95" />
                                    <stop offset="30%" stopColor="#ef4444" stopOpacity="0.5" />
                                    <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                                </radialGradient>
                                <radialGradient id="simLaserGlowCyan" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.95" />
                                    <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                                </radialGradient>
                                <filter id="simLaserGlowFilter" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Glowing Laser Reticle Spot */}
                            <g transform={`translate(${laserHead.x}, ${laserHead.y})`}>
                                <circle
                                    r={laserHead.isCut ? 24 : 14}
                                    fill={laserHead.isCut ? "url(#simLaserGlowRed)" : "url(#simLaserGlowCyan)"}
                                    opacity={0.8}
                                />
                                <circle
                                    r="12"
                                    fill="none"
                                    stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"}
                                    strokeWidth="1.2"
                                    strokeDasharray={laserHead.isCut ? "4 2" : "2 2"}
                                    opacity={0.9}
                                />
                                <line x1="-16" y1="0" x2="-6" y2="0" stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"} strokeWidth="1.4" />
                                <line x1="6" y1="0" x2="16" y2="0" stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"} strokeWidth="1.4" />
                                <line x1="0" y1="-16" x2="0" y2="-6" stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"} strokeWidth="1.4" />
                                <line x1="0" y1="6" x2="0" y2="16" stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"} strokeWidth="1.4" />
                                <circle
                                    r={laserHead.isCut ? 3.5 : 2}
                                    fill="#ffffff"
                                    stroke={laserHead.isCut ? "#ef4444" : "#06b6d4"}
                                    strokeWidth="1.5"
                                    filter="url(#simLaserGlowFilter)"
                                />
                            </g>
                        </svg>
                    )}
                </div>
            </div>

            {/* ─── FUI Telemetry HUD Bar ─── */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-3 sm:gap-6 px-4 sm:px-6 py-2.5 bg-black/75 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-xs max-w-[96%]">
                {/* Nesting Efficiency with Color-coded Gauge */}
                <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {tr("Nesting")}:
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                        <span className={`font-bold ${
                            telemetry.nestingEfficiencyPct >= 60 
                                ? 'text-cyan-400' 
                                : telemetry.nestingEfficiencyPct >= 40 
                                    ? 'text-amber-400' 
                                    : 'text-rose-400'
                        }`}>
                            {telemetry.nestingEfficiencyPct.toFixed(1)}%
                        </span>
                        <div 
                            className="w-12 sm:w-16 h-1.5 bg-white/10 rounded-full overflow-hidden flex"
                            title={`${telemetry.totalAreaMm2.toLocaleString()} mm² / ${telemetry.bedAreaMm2.toLocaleString()} mm²`}
                        >
                            <div
                                style={{ width: `${Math.min(100, Math.max(5, telemetry.nestingEfficiencyPct))}%` }}
                                className={`h-full rounded-full transition-all duration-300 ${
                                    telemetry.nestingEfficiencyPct >= 60 
                                        ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]' 
                                        : telemetry.nestingEfficiencyPct >= 40 
                                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]' 
                                            : 'bg-rose-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                }`}
                            />
                        </div>
                    </div>
                </div>

                <div className="h-3 w-px bg-white/10" />

                {/* Cut Perimeter */}
                <div className="flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {tr("Perimeter")}:
                    </span>
                    <span className="font-mono text-white/90 font-semibold">
                        {(telemetry.totalPerimeterMm / 1000).toFixed(2)} m
                    </span>
                </div>

                <div className="h-3 w-px bg-white/10" />

                {/* Est. Cut Time */}
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {tr("Est. Time")}:
                    </span>
                    <span className="font-mono text-white/90 font-semibold">
                        {Math.floor(telemetry.estCutTimeSec / 60)}:{String(telemetry.estCutTimeSec % 60).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-white/30 font-mono hidden sm:inline">(@20mm/s)</span>
                </div>

                <div className="h-3 w-px bg-white/10" />

                {/* Panel Breakdown */}
                <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                        {tr("Panels")}:
                    </span>
                    <span className="font-mono text-white/90 font-bold">
                        {telemetry.panelCount}
                    </span>
                    <span className="text-[10px] text-white/40 hidden md:inline">
                        ({panelCountText})
                    </span>
                </div>

                <div className="h-3 w-px bg-white/10 hidden lg:block" />

                {/* Material & Bed Status */}
                <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-white/50">
                    <Cpu className="w-3 h-3 text-white/40" />
                    <span>{thickness}mm</span>
                    <span>•</span>
                    <span>kerf {burn}mm</span>
                    <span>•</span>
                    <span>{bedSize.label}</span>
                </div>
            </div>
        </div>
    );
};
