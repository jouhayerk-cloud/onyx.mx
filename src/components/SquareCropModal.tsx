import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Check, Move, Maximize2, Palette, Sparkles, Sliders, Layers } from 'lucide-react';
import { cropImage, extractEdgeColor, PixelStretchConfig, getCleanImageUrl } from '../lib/utils';
import { tr } from '../lib/i18n';

interface SquareCropModalProps {
    isOpen: boolean;
    imageSrc: string;
    onClose: () => void;
    onCropComplete: (croppedDataUrl: string) => void;
}

export const SquareCropModal: React.FC<SquareCropModalProps> = ({
    isOpen,
    imageSrc,
    onClose,
    onCropComplete
}) => {
    // Sanitize image URL to handle drive links, CORS, and saved PNGs cleanly
    const activeImageSrc = useMemo(() => {
        if (!imageSrc) return '';
        return getCleanImageUrl(imageSrc) || imageSrc;
    }, [imageSrc]);

    // Crop box in container pixels: { x: number, y: number, size: number }
    const [cropPx, setCropPx] = useState<{ x: number; y: number; size: number }>({ x: 20, y: 20, size: 220 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [cropStart, setCropStart] = useState<{ x: number; y: number; size: number }>({ x: 20, y: 20, size: 220 });
    
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [bgColor, setBgColor] = useState<string>('#121212');
    const [extractedEdgeColor, setExtractedEdgeColor] = useState<string>('#121212');

    // Pixel Stretch Effect State
    const [bgMode, setBgMode] = useState<'solid' | 'pixel-stretch'>('solid');
    const [stretchPosition, setStretchPosition] = useState<'top' | 'bottom' | 'left' | 'right' | 'center-h' | 'center-v'>('center-v');
    const [stretchBlur, setStretchBlur] = useState<number>(0);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);

    // Calculate exact bounding rectangle of the rendered image inside the container
    const getImageBounds = () => {
        if (!containerRef.current || !imgRef.current) return { x: 0, y: 0, w: 1, h: 1 };
        const cRect = containerRef.current.getBoundingClientRect();
        const iRect = imgRef.current.getBoundingClientRect();
        return {
            x: iRect.left - cRect.left,
            y: iRect.top - cRect.top,
            w: iRect.width || 1,
            h: iRect.height || 1
        };
    };

    // Initial setup: Extract Edge Color and initialize crop box centered in viewport
    useEffect(() => {
        if (!activeImageSrc || !isOpen) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Extract edge color
            const edgeCol = extractEdgeColor(img);
            setExtractedEdgeColor(edgeCol);
            setBgColor(edgeCol);

            // Container size initialization
            setTimeout(() => {
                if (containerRef.current) {
                    const cw = containerRef.current.clientWidth;
                    const ch = containerRef.current.clientHeight;
                    const sqSize = Math.round(Math.min(cw, ch) * 0.7);
                    const initX = Math.round((cw - sqSize) / 2);
                    const initY = Math.round((ch - sqSize) / 2);
                    setCropPx({ x: Math.max(10, initX), y: Math.max(10, initY), size: sqSize });
                }
            }, 100);
        };
        img.src = activeImageSrc;
    }, [activeImageSrc, isOpen]);

    // Live background visualization in main viewport canvas
    useEffect(() => {
        if (!activeImageSrc || !isOpen || !bgCanvasRef.current || !imgRef.current) return;
        const canvas = bgCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cw = containerRef.current?.clientWidth || 500;
        const ch = containerRef.current?.clientHeight || 500;
        canvas.width = cw;
        canvas.height = ch;

        const img = imgRef.current;

        if (bgMode === 'solid') {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, cw, ch);
        } else {
            // Render Live Pixel Stretch Background in Viewport
            let srcX = 0, srcY = 0, srcW = img.naturalWidth || 500, srcH = img.naturalHeight || 500;
            const pos = stretchPosition;
            if (pos === 'top') { srcX = 0; srcY = 0; srcW = img.naturalWidth; srcH = 1; }
            else if (pos === 'bottom') { srcX = 0; srcY = img.naturalHeight - 1; srcW = img.naturalWidth; srcH = 1; }
            else if (pos === 'left') { srcX = 0; srcY = 0; srcW = 1; srcH = img.naturalHeight; }
            else if (pos === 'right') { srcX = img.naturalWidth - 1; srcY = 0; srcW = 1; srcH = img.naturalHeight; }
            else if (pos === 'center-h') { srcX = 0; srcY = Math.floor(img.naturalHeight / 2); srcW = img.naturalWidth; srcH = 1; }
            else if (pos === 'center-v') { srcX = Math.floor(img.naturalWidth / 2); srcY = 0; srcW = 1; srcH = img.naturalHeight; }

            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, srcX, srcY, Math.max(1, srcW), Math.max(1, srcH), 0, 0, cw, ch);

            if (stretchBlur > 0) {
                ctx.filter = `blur(${stretchBlur}px)`;
                ctx.drawImage(canvas, 0, 0);
                ctx.filter = 'none';
            }
        }
    }, [activeImageSrc, bgMode, stretchPosition, stretchBlur, bgColor, isOpen, cropPx]);

    // Live preview generator for right-side preview card
    useEffect(() => {
        if (!activeImageSrc || !isOpen || !containerRef.current || !imgRef.current) return;
        let isCurrent = true;
        
        const imgBounds = getImageBounds();

        // Convert crop box position relative to image bounds into normalized coordinates
        const normX = (cropPx.x - imgBounds.x) / imgBounds.w;
        const normY = (cropPx.y - imgBounds.y) / imgBounds.h;
        const normW = cropPx.size / imgBounds.w;
        const normH = cropPx.size / imgBounds.h;

        const stretchConfig: PixelStretchConfig | undefined = bgMode === 'pixel-stretch' ? {
            enabled: true,
            linePosition: stretchPosition,
            blur: stretchBlur
        } : undefined;

        cropImage(activeImageSrc, normX, normY, normW, normH, 512, bgColor, stretchConfig).then((url) => {
            if (isCurrent) setPreviewUrl(url);
        });
        return () => { isCurrent = false; };
    }, [activeImageSrc, cropPx, bgColor, bgMode, stretchPosition, stretchBlur, isOpen]);

    if (!isOpen) return null;

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
        e.preventDefault();
        e.stopPropagation();
        setDragStart({ x: e.clientX, y: e.clientY });
        setCropStart({ ...cropPx });
        if (type === 'move') setIsDragging(true);
        if (type === 'resize') setIsResizing(true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging && !isResizing) return;
        if (!containerRef.current) return;

        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;

        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;

        if (isDragging) {
            const rawX = cropStart.x + deltaX;
            const rawY = cropStart.y + deltaY;

            // Clamp crop box inside the large left viewport panel (allows moving past image edges freely!)
            const maxX = Math.max(0, cw - cropStart.size);
            const maxY = Math.max(0, ch - cropStart.size);
            const clampedX = Math.max(0, Math.min(maxX, rawX));
            const clampedY = Math.max(0, Math.min(maxY, rawY));

            setCropPx({
                ...cropStart,
                x: clampedX,
                y: clampedY
            });
        } else if (isResizing) {
            // Clamp size inside the large left viewport panel
            const maxAllowedSize = Math.max(40, Math.min(cw - cropStart.x, ch - cropStart.y));
            const deltaSize = Math.max(deltaX, deltaY);
            const rawSize = cropStart.size + deltaSize;
            const clampedSize = Math.max(40, Math.min(maxAllowedSize, rawSize));

            setCropPx({
                ...cropStart,
                size: clampedSize
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsResizing(false);
    };

    const handleSave = async () => {
        if (!containerRef.current || !imgRef.current) return;
        const imgBounds = getImageBounds();

        const normX = (cropPx.x - imgBounds.x) / imgBounds.w;
        const normY = (cropPx.y - imgBounds.y) / imgBounds.h;
        const normW = cropPx.size / imgBounds.w;
        const normH = cropPx.size / imgBounds.h;

        const stretchConfig: PixelStretchConfig | undefined = bgMode === 'pixel-stretch' ? {
            enabled: true,
            linePosition: stretchPosition,
            blur: stretchBlur
        } : undefined;

        const finalUrl = await cropImage(activeImageSrc, normX, normY, normW, normH, 1024, bgColor, stretchConfig);
        onCropComplete(finalUrl);
        onClose();
    };

    const presetColors = [
        { label: 'Auto Edge', hex: extractedEdgeColor, badge: true },
        { label: 'Studio Off-Black', hex: '#121212' },
        { label: 'Dark Charcoal', hex: '#1C1C1E' },
        { label: 'Pure White', hex: '#FFFFFF' },
        { label: 'Warm Neutral', hex: '#F4F0EA' },
    ];

    const stretchLines = [
        { id: 'top', label: 'Top Line' },
        { id: 'bottom', label: 'Bottom Line' },
        { id: 'left', label: 'Left Line' },
        { id: 'right', label: 'Right Line' },
        { id: 'center-h', label: 'Center H-Line' },
        { id: 'center-v', label: 'Center V-Line' },
    ] as const;

    const imgBounds = getImageBounds();

    return (
        <div 
            className="fixed inset-2 md:inset-4 z-50 flex flex-col bg-[#121215] border border-white/10 rounded-2xl shadow-2xl overflow-hidden select-none animate-in fade-in"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Fullscreen Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 shrink-0">
                <div className="flex items-center gap-2.5">
                    <Maximize2 className="w-5 h-5 text-purple-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{tr("1:1 Crop Studio & Pixel Stretch Background Generator")}</h3>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Main Fullscreen Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 overflow-hidden min-h-0">
                
                {/* Large Viewport Panel (containerRef covers entire left 2/3 column, allowing drawing outside image!) */}
                <div 
                    ref={containerRef}
                    className="md:col-span-2 flex flex-col items-center justify-center bg-black/90 rounded-xl p-6 relative overflow-hidden border border-white/5 h-full cursor-crosshair"
                >
                    {/* Live Background Visualization Layer (Solid or Pixel Stretch across entire panel) */}
                    <canvas 
                        ref={bgCanvasRef} 
                        className="absolute inset-0 w-full h-full object-cover rounded pointer-events-none opacity-90"
                    />

                    {/* Prominent Product Image Layer */}
                    <img 
                        ref={imgRef}
                        src={activeImageSrc} 
                        alt={tr("Crop target")} 
                        className="relative z-10 max-w-[85%] max-h-[65vh] object-contain pointer-events-none rounded drop-shadow-2xl"
                    />

                    {/* Pixel Stretch Sample Line Indicator */}
                    {bgMode === 'pixel-stretch' && (
                        <div 
                            style={{
                                left: `${imgBounds.x}px`,
                                top: `${imgBounds.y}px`,
                                width: `${imgBounds.w}px`,
                                height: `${imgBounds.h}px`,
                            }}
                            className="absolute pointer-events-none z-20"
                        >
                            <div 
                                className={`absolute inset-0 border-purple-400/80 ${
                                    stretchPosition === 'top' ? 'border-t-2' :
                                    stretchPosition === 'bottom' ? 'border-b-2' :
                                    stretchPosition === 'left' ? 'border-l-2' :
                                    stretchPosition === 'right' ? 'border-r-2' :
                                    stretchPosition === 'center-h' ? 'top-1/2 border-t-2 -translate-y-1/2' :
                                    'left-1/2 border-l-2 -translate-x-1/2'
                                }`}
                            >
                                <span className="absolute left-2 -top-5 text-[9px] font-bold text-purple-200 bg-purple-950/90 px-2 py-0.5 rounded border border-purple-400/50 shadow-md">
                                    Sample Line ({stretchPosition.toUpperCase()})
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 1:1 Square Crop Overlay Box (Moves ANYWHERE across large viewport panel!) */}
                    <div
                        style={{
                            left: `${cropPx.x}px`,
                            top: `${cropPx.y}px`,
                            width: `${cropPx.size}px`,
                            height: `${cropPx.size}px`,
                        }}
                        className="absolute z-30 border-2 border-purple-400 bg-purple-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] cursor-move rounded-sm"
                        onMouseDown={(e) => handleMouseDown(e, 'move')}
                    >
                        {/* Grid lines */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                            <div className="border-r border-b border-white"></div>
                            <div className="border-r border-b border-white"></div>
                            <div className="border-b border-white"></div>
                            <div className="border-r border-b border-white"></div>
                            <div className="border-r border-b border-white"></div>
                            <div className="border-b border-white"></div>
                            <div className="border-r border-white"></div>
                            <div className="border-r border-white"></div>
                            <div></div>
                        </div>

                        {/* Size badge */}
                        <div className="absolute top-1 left-1 bg-black/80 text-[9px] font-mono font-bold text-purple-300 px-1.5 py-0.5 rounded border border-white/10 pointer-events-none">
                            {Math.round(cropPx.size)}×{Math.round(cropPx.size)} {tr("px (1:1 Square)")}
                        </div>

                        {/* Resize handle bottom-right */}
                        <div
                            className="absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-purple-500 border-2 border-white rounded-full cursor-se-resize shadow-xl flex items-center justify-center hover:scale-125 transition-transform"
                            onMouseDown={(e) => handleMouseDown(e, 'resize')}
                        >
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                    </div>

                    <p className="absolute bottom-2 left-4 text-xs text-white/60 bg-black/70 px-3 py-1 rounded-lg border border-white/10 flex items-center gap-1.5 z-40">
                        <Move className="w-3.5 h-3.5 text-purple-400" /> {tr("Drag crop box freely anywhere across panel (allows extended background margins!).")}
                    </p>
                </div>

                {/* Right Control Sidebar Column */}
                <div className="flex flex-col justify-between bg-black/40 rounded-xl p-5 border border-white/10 overflow-y-auto min-h-0 gap-4">
                    
                    <div className="flex flex-col gap-4">
                        {/* Background Generator Controls Side Panel */}
                        <div className="p-3.5 bg-black/60 border border-white/10 rounded-xl flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                                <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-purple-400" /> {tr("Background Fill Mode")}
                                </span>
                                <div className="flex items-center bg-black/80 rounded-lg p-0.5 border border-white/10">
                                    <button
                                        onClick={() => setBgMode('solid')}
                                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                                            bgMode === 'solid' ? 'bg-purple-600 text-white shadow-sm' : 'text-white/50 hover:text-white'
                                        }`}
                                    >
                                        {tr("Solid Color")}
                                    </button>
                                    <button
                                        onClick={() => setBgMode('pixel-stretch')}
                                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${
                                            bgMode === 'pixel-stretch' ? 'bg-purple-600 text-white shadow-sm' : 'text-white/50 hover:text-white'
                                        }`}
                                    >
                                        <Sparkles className="w-3 h-3 text-amber-300" /> {tr("Pixel Stretch")}
                                    </button>
                                </div>
                            </div>

                            {bgMode === 'solid' ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {presetColors.map((p, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setBgColor(p.hex)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border ${
                                                bgColor.toLowerCase() === p.hex.toLowerCase()
                                                    ? 'border-purple-400 bg-purple-500/20 text-white shadow-sm'
                                                    : 'border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <span 
                                                className="w-3 h-3 rounded-full border border-white/30" 
                                                style={{ backgroundColor: p.hex }} 
                                            />
                                            {p.badge && <Sparkles className="w-3 h-3 text-amber-400" />}
                                            {p.label}
                                        </button>
                                    ))}

                                    <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 cursor-pointer transition-all">
                                        <input 
                                            type="color" 
                                            value={bgColor} 
                                            onChange={(e) => setBgColor(e.target.value)} 
                                            className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer rounded"
                                        />
                                        <span>{tr("Custom Color")}</span>
                                    </label>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    <span className="text-[10px] uppercase font-bold text-white/50">{tr("Select Sample Line:")}</span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {stretchLines.map((line) => (
                                            <button
                                                key={line.id}
                                                onClick={() => setStretchPosition(line.id)}
                                                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border text-center ${
                                                    stretchPosition === line.id 
                                                        ? 'border-purple-400 bg-purple-500/30 text-white shadow-sm' 
                                                        : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                                                }`}
                                            >
                                                {line.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 bg-black/40 p-2.5 rounded-lg border border-white/5 mt-1">
                                        <span className="text-[10px] uppercase font-bold text-white/50 flex items-center gap-1">
                                            <Sliders className="w-3 h-3 text-purple-400" /> {tr("Soft Studio Blur:")}
                                        </span>
                                        <input 
                                            type="range"
                                            min="0"
                                            max="20"
                                            value={stretchBlur}
                                            onChange={(e) => setStretchBlur(Number(e.target.value))}
                                            className="w-24 accent-purple-500 cursor-pointer"
                                        />
                                        <span className="text-[10px] font-mono text-purple-300 w-6 text-right">{stretchBlur}px</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 1:1 Output Preview Card */}
                        <div className="flex flex-col gap-2.5">
                            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">{tr("1:1 Square Output Preview")}</span>
                            <div 
                                className="w-full aspect-square max-h-[220px] rounded-lg overflow-hidden border border-white/10 shadow-lg flex items-center justify-center transition-colors bg-black/60"
                            >
                                {previewUrl ? (
                                    <img src={previewUrl} alt={tr("1:1 Preview")} className="w-full h-full object-contain" />
                                ) : (
                                    <span className="text-xs text-white/40">{tr("Generating preview...")}</span>
                                )}
                            </div>
                            <div className="text-[10px] text-white/50 space-y-1 mt-1">
                                <p className="flex items-center justify-between">
                                    <span>{tr("Aspect Ratio:")}</span>
                                    <strong className="text-purple-400 font-bold">{tr("1:1 Square (100%)")}</strong>
                                </p>
                                <p className="flex items-center justify-between">
                                    <span>{tr("Output Resolution:")}</span>
                                    <strong className="text-white font-mono">{tr("1024 × 1024 px")}</strong>
                                </p>
                                <p className="flex items-center justify-between">
                                    <span>{tr("Proportion Stretching:")}</span>
                                    <strong className="text-emerald-400 font-bold">{tr("0% (Zero Distortion)")}</strong>
                                </p>
                                <p className="flex items-center justify-between">
                                    <span>{tr("Background Mode:")}</span>
                                    <strong className="text-purple-300 uppercase font-bold">
                                        {bgMode === 'solid' ? tr("Solid Color") : `Pixel Stretch (${stretchPosition})`}
                                    </strong>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 font-medium text-xs transition-colors"
                        >
                            {tr("Cancel")}
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all"
                        >
                            <Check className="w-4 h-4" /> {tr("Apply 1:1 Crop")}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
