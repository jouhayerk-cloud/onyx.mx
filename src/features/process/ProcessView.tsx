import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { userAtom, inventoryAtom, InventoryVersionAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import {
    normalizeInventoryData,
    getCleanImageUrl,
    loadImage,
    extractGradientFromMask,
    generatePngAndSvgFromMasks,
    findContour,
    simplifyContour,
    createCurvePath,
    resizeImage
} from '../../lib/utils';
import {
    Pipette,
    Download,
    Trash2,
    Layers,
    MousePointer2,
    Search,
    Image as ImageIcon,
    Palette,
    Undo2,
    Save,
    Scissors,
    Sparkles,
    CheckSquare,
    Loader2,
    ChevronRight,
    Library,
    X,
    Maximize2,
    Box,
    Play,
    Pause,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Fingerprint,
    Cpu,
    Zap,
    History,
    FileJson,
    Settings2,
    ChevronDown,
    Activity,
    FolderKanban,
    Terminal,
    Bug
} from 'lucide-react';
import toast from 'react-hot-toast';
import { gsap } from 'gsap';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface ProcessLayer {
    id: string;
    type: 'image' | 'mask';
    data: any;
    visible: boolean;
    opacity: number;
    rotation: number;
    position: { x: number, y: number };
}

interface BatchOperation {
    id: string;
    item: any;
    status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    stepLabel: string;
    error?: string;
    result?: {
        pngData?: string;
        svgData?: string;
        masks?: any[];
        colors?: string;
    };
}

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

/* ─── Aesthetic Components ─── */

const StitchCard = ({ children, className = "", noPadding = false }: { children: React.ReactNode, className?: string, noPadding?: boolean }) => (
    <div className={`bg-(--stitch-card-bg) border border-white/5 rounded-xl shadow-lg ${noPadding ? '' : 'p-4'} ${className}`}>
        {children}
    </div>
);

const SectionTitle = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="flex items-center gap-3">
        {Icon && (
            <div className="w-9 h-9 rounded-lg bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                <Icon size={18} />
            </div>
        )}
        <h2 className="text-base font-bold text-white uppercase tracking-tight leading-none">{title}</h2>
    </div>
);

const Badge = ({ children, color = "main" }: { children: React.ReactNode, color?: "main" | "green" | "red" | "blue" }) => {
    const colors = {
        main: "bg-(--main-color)/10 text-(--main-color) border-(--main-color)/20",
        green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        red: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        blue: "bg-sky-500/10 text-sky-400 border-sky-500/20"
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${colors[color]}`}>
            {children}
        </span>
    );
};

export const ProcessView: React.FC = () => {
    const [user] = useAtom(userAtom);
    const inventory = useAtomValue(inventoryAtom);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [batchQueue, setBatchQueue] = useState<BatchOperation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessingBatch, setIsProcessingBatch] = useState(false);
    const [showVault, setShowVault] = useState(false);
    
    // Debug Logs
    const [logs, setLogs] = useState<{ id: string, msg: string, time: string, type: 'info' | 'error' | 'success' | 'warn' }[]>([]);
    const addLog = useCallback((msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
        setLogs(prev => [{ id: Math.random().toString(), msg, time: new Date().toLocaleTimeString(), type }, ...prev.slice(0, 49)]);
        console.log(`[AI-Process] ${msg}`);
    }, []);

    // UI State
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const [tool, setTool] = useState<'move' | 'mask'>('move');
    const [showBatchList, setShowBatchList] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    
    // Canvas State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<ProcessLayer[]>([]);
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        setInventoryItems(inventory.map(item => ({ ...normalizeInventoryData(item.data), id: item.row, row: item.row, source: item.source })));
    }, [inventory]);

    const filteredItems = useMemo(() => {
        const s = searchTerm.toLowerCase();
        return inventoryItems.filter(item => !s || item.itemId?.toLowerCase().includes(s) || item.shape?.toLowerCase().includes(s));
    }, [inventoryItems, searchTerm]);

    /* ─── Handlers ─── */

    const handleSelectItem = useCallback((item: any) => {
        setSelectedItem(item);
        setShowVault(false);
        const imageUrl = getCleanImageUrl(item.generatedPngUrl || (item.mediaUrls ? item.mediaUrls.split(',')[0].trim() : null));
        if (imageUrl) {
            addLog(`Loading artifact image into workspace: ${item.itemId}`, 'info');
            loadImage(imageUrl).then(img => {
                const newLayer: ProcessLayer = {
                    id: `L-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
                    type: 'image',
                    data: { img, src: imageUrl },
                    visible: true,
                    opacity: 1,
                    rotation: 0,
                    position: { x: 50, y: 50 }
                };
                setLayers([newLayer]);
                setActiveLayerId(newLayer.id);
                addLog(`Layer ${newLayer.id} initialized at 1:1 scale.`, 'success');
            }).catch(err => {
                addLog(`Workspace load error: ${err.message}`, 'error');
            });
        }
    }, [addLog]);

    const addToBatch = useCallback((item: any) => {
        if (batchQueue.some(op => op.item.id === item.id)) return;
        addLog(`Item ${item.itemId} added to deployment queue.`, 'info');
        setBatchQueue(prev => [...prev, {
            id: `OP-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
            item: item,
            status: 'idle',
            progress: 0,
            stepLabel: 'Ready'
        }]);
    }, [batchQueue, addLog]);

    /* ─── AI Pipeline ─── */

    const processItem = async (opId: string) => {
        const updateOp = (updates: Partial<BatchOperation>) => {
            setBatchQueue(prev => prev.map(op => op.id === opId ? { ...op, ...updates } : op));
        };

        const currentOp = batchQueue.find(o => o.id === opId);
        if (!currentOp) {
            addLog(`Error: Operation ${opId} not found in state.`, 'error');
            return;
        }

        try {
            const item = currentOp.item;
            addLog(`Pipeline started for artifact: ${item.itemId}`, 'info');
            updateOp({ status: 'processing', progress: 5, stepLabel: 'Initalizing AI...' });
            
            if (!API_KEY) {
                addLog("Gemini API Key missing! Check VITE_GEMINI_API_KEY environment variable.", "error");
                throw new Error("API Key missing");
            }

            const imageUrl = getCleanImageUrl(item.mediaUrls?.split(',')[0]);
            if (!imageUrl) throw new Error("Missing source image");

            addLog(`Image Source: ${imageUrl.substring(0, 60)}...`, 'info');
            
            // 1. Image Pre-processing
            updateOp({ progress: 15, stepLabel: 'Resizing Image...' });
            addLog("Resizing image for AI compliance (1024px limit)...", "info");
            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];
            addLog(`Encoded image size: ${Math.round(base64.length / 1024)} KB`, "info");

            updateOp({ progress: 30, stepLabel: 'Analyzing...' });
            addLog(`Requesting segmentation from Gemini 1.5 Flash...`, 'info');
            
            const prompt = `Give the segmentation masks for this ${item.shape} Onyx artifact. Instructions: If it's a mirror, create separate masks for the 'frame' and 'glass'. Remove background completely. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "string"}]`;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                })
            });

            if (!response.ok) throw new Error(`AI Gateway Error: ${response.status}`);
            const resData = await response.json();
            const rawOutput = resData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!rawOutput) throw new Error("Empty response from AI engine");
            const processed = JSON.parse(rawOutput);
            addLog(`Engine found ${processed.length} segmentation layers.`, 'success');

            updateOp({ progress: 60, stepLabel: 'Tracing Contours...' });
            addLog(`Simplifying polygons and finding contours...`, 'info');

            const masks: any[] = await Promise.all(processed.map(async (m: any, idx: number) => {
                addLog(`Vectorizing component ${idx+1}: ${m.label}`, 'info');
                const maskData = m.mask.startsWith('data:image') ? m.mask : `data:image/png;base64,${m.mask}`;
                const maskImg = await loadImage(maskData);
                const cv = document.createElement('canvas');
                cv.width = maskImg.width; cv.height = maskImg.height;
                const ctx = cv.getContext('2d', { willReadFrequently: true })!;
                ctx.drawImage(maskImg, 0, 0);
                const iData = ctx.getImageData(0, 0, cv.width, cv.height);
                const contour = findContour(iData);
                const simplified = simplifyContour(contour, 1.2);
                return {
                    x: m.box_2d[1] / 1000, 
                    y: m.box_2d[0] / 1000, 
                    width: (m.box_2d[3] - m.box_2d[1]) / 1000, 
                    height: (m.box_2d[2] - m.box_2d[0]) / 1000,
                    label: m.label,
                    maskWidth: maskImg.width,
                    maskHeight: maskImg.height,
                    path: createCurvePath(simplified),
                    points: simplified
                };
            }));

            updateOp({ progress: 85, stepLabel: 'Generating Assets...' });
            addLog(`Rendering final PNG composition and SVG paths...`, 'info');

            const img = await loadImage(imageUrl);
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks);
            const colors = await extractGradientFromMask(imageUrl, masks[0], { width: img.width, height: img.height });

            updateOp({ progress: 95, stepLabel: 'Committing to Cloud...' });
            addLog(`Saving binary assets to Supabase registry...`, 'info');

            const tableName = item.source === 'production' ? 'production' : 'inventory';
            const { error: dbError } = await supabase.from(tableName).update({
                generated_png_url: pngData,
                vector_svg: svgData,
                spatial_masks: JSON.stringify(masks),
                dominant_color: colors
            }).eq('id', item.row);
            
            if (dbError) throw dbError;

            updateOp({ status: 'completed', progress: 100, stepLabel: 'Success', result: { pngData, svgData, masks, colors } });
            addLog(`Deployment finalized for ${item.itemId}`, 'success');
            setInventoryVersion(v => v + 1);

        } catch (e: any) {
            updateOp({ status: 'failed', error: e.message, stepLabel: 'Error' });
            addLog(`CRITICAL ERROR during ${opId}: ${e.message}`, 'error');
            toast.error(`Processing Error: ${currentOp.item.itemId}`);
        }
    };

    const runBatchSequence = async () => {
        setIsProcessingBatch(true);
        addLog("Batch Execution triggered.", "warn");
        const queue = batchQueue.filter(op => op.status !== 'completed');
        for (const op of queue) {
            await processItem(op.id);
            await new Promise(r => setTimeout(r, 800));
        }
        setIsProcessingBatch(false);
        addLog("Batch Sequence reached end-of-queue.", "success");
        toast.success("Batch Sequence Finalized");
    };

    /* ─── Canvas Render ─── */

    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        layers.forEach(l => {
            if (!l.visible) return;
            ctx.save();
            ctx.globalAlpha = l.opacity;
            ctx.translate((l.position.x / 100) * cv.width, (l.position.y / 100) * cv.height);
            ctx.rotate((l.rotation * Math.PI) / 180);
            if (l.type === 'image') {
                const { img } = l.data;
                const aspect = img.width / img.height;
                const h = cv.height * 0.7;
                const w = h * aspect;
                ctx.drawImage(img, -w/2, -h/2, w, h);
            }
            ctx.restore();
        });
        if (currentPath.length > 1) {
            ctx.beginPath(); ctx.strokeStyle = 'var(--main-color)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
            ctx.moveTo((currentPath[0].x / 100) * cv.width, (currentPath[0].y / 100) * cv.height);
            currentPath.forEach(p => ctx.lineTo((p.x / 100) * cv.width, (p.y / 100) * cv.height));
            ctx.stroke();
        }
    }, [layers, currentPath]);

    const activeOp = useMemo(() => batchQueue.find(op => op.status === 'processing'), [batchQueue]);

    return (
        <div className="flex flex-col w-full h-full bg-(--app-bg) p-4 gap-4 overflow-hidden font-sans">
            
            {/* Main Aesthetic Top Bar */}
            <header className="h-[72px] shrink-0 flex items-center justify-between px-6 bg-(--stitch-card-bg) border border-white/5 rounded-xl shadow-xl z-50">
                <div className="flex items-center gap-6">
                    <SectionTitle title="AI PROCESSOR" icon={Fingerprint} />
                    
                    <div className="h-8 w-px bg-white/5" />
                    
                    {/* Visual Tools */}
                    <div className="flex items-center gap-1 bg-white/3 p-1 rounded-lg border border-white/5">
                        <button onClick={() => setTool('move')} className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${tool === 'move' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
                            <MousePointer2 size={16} />
                        </button>
                        <button onClick={() => setTool('mask')} className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${tool === 'mask' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
                            <Scissors size={16} />
                        </button>
                    </div>

                    {/* Hierarchy Action */}
                    <button onClick={() => setShowVault(true)} className="flex items-center gap-2 h-10 px-4 rounded-lg bg-white/3 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/6 transition-all">
                        <Library size={16} /> Artifact Vault
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {/* Live Pipeline Status */}
                    <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg border border-white/5">
                        <Activity size={14} className={activeOp ? 'text-emerald-400 animate-pulse' : 'text-white/10'} />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 truncate max-w-[120px]">
                            {activeOp ? activeOp.stepLabel : 'ENGINE READY'}
                        </span>
                    </div>

                    <div className="h-8 w-px bg-white/5" />

                    <button 
                        onClick={() => selectedItem && processItem(batchQueue.find(op => op.item.id === selectedItem.id)?.id || 'single')} 
                        disabled={!selectedItem || activeOp !== undefined}
                        className="h-10 px-6 rounded-lg bg-white/5 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2.5 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-20"
                    >
                        {activeOp ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Analyze
                    </button>
                    
                    <button 
                        onClick={runBatchSequence} 
                        disabled={isProcessingBatch || batchQueue.length === 0} 
                        className="h-10 px-6 rounded-lg bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 hover:shadow-lg hover:shadow-(--main-color)/20 active:scale-95 transition-all disabled:opacity-20"
                    >
                        <Play size={14} /> Run Batch
                    </button>

                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setShowTerminal(!showTerminal)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${showTerminal ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'}`}
                        >
                            <Terminal size={18} />
                        </button>
                        <button 
                            onClick={() => setShowBatchList(!showBatchList)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${showBatchList ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'}`}
                        >
                            <FolderKanban size={18} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Workplace Content Area */}
            <main className="flex-1 flex gap-4 overflow-hidden relative">
                
                {/* Visual Workspace (Center) */}
                <div className="flex-1 flex items-center justify-center bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden">
                    {/* Stitch Subtle Grid */}
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    
                    <canvas
                        ref={canvasRef} 
                        width={1600} 
                        height={1600}
                        onClick={(e) => {
                            if (tool !== 'mask') return;
                            const r = canvasRef.current?.getBoundingClientRect();
                            if (!r) return;
                            setCurrentPath([...currentPath, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }]);
                        }}
                        onMouseDown={(e) => { if (tool === 'move' && activeLayerId) { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); } }}
                        onMouseMove={(e) => {
                            if (!isDragging || !activeLayerId) return;
                            const dx = ((e.clientX - dragStart.x) / (canvasRef.current?.offsetWidth || 1)) * 100;
                            const dy = ((e.clientY - dragStart.y) / (canvasRef.current?.offsetHeight || 1)) * 100;
                            setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, position: { x: l.position.x + dx, y: l.position.y + dy } } : l));
                            setDragStart({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        style={{ width: 'min(76vh, 76vw)', height: 'min(76vh, 76vw)' }}
                        className="bg-black/60 rounded-xl shadow-2xl z-10"
                    />

                    {/* Floating Controls Overlay */}
                    {activeLayerId && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-3 bg-(--stitch-card-bg)/80 backdrop-blur-md border border-white/10 rounded-xl z-20 shadow-2xl">
                            <div className="flex items-center gap-3">
                                <span className="text-[9px] font-bold uppercase text-white/30">Alpha</span>
                                <input type="range" min="0" max="1" step="0.01" value={layers.find(l => l.id === activeLayerId)?.opacity || 0} onChange={e => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, opacity: parseFloat(e.target.value) } : l))} className="w-24 h-1 bg-white/10 rounded-full appearance-none accent-(--main-color)" />
                            </div>
                            <div className="w-px h-5 bg-white/10" />
                            <div className="flex items-center gap-3">
                                <span className="text-[9px] font-bold uppercase text-white/30">Angle</span>
                                <input type="range" min="0" max="360" value={layers.find(l => l.id === activeLayerId)?.rotation || 0} onChange={e => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, rotation: parseInt(e.target.value) } : l))} className="w-24 h-1 bg-white/10 rounded-full appearance-none accent-(--main-color)" />
                            </div>
                            <div className="w-px h-5 bg-white/10" />
                            <button onClick={() => { setLayers(prev => prev.filter(x => x.id !== activeLayerId)); setActiveLayerId(null); }} className="text-white/20 hover:text-red-400 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Sub-Panels (Right) */}
                <aside className="w-72 flex flex-col gap-4 relative">
                    {/* Layer Explorer */}
                    <StitchCard className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Layers</span>
                            <Badge>{layers.length}</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {layers.map(l => (
                                <div key={l.id} onClick={() => setActiveLayerId(l.id)} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${activeLayerId === l.id ? 'bg-white/4 border-(--main-color)/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-white/2'}`}>
                                    <div className="w-10 h-10 rounded-md bg-black/40 flex-shrink-0 border border-white/5 overflow-hidden">
                                        {l.type === 'image' && <img src={l.data.src} className="w-full h-full object-cover opacity-50" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-white uppercase italic truncate tracking-tight">{l.id}</p>
                                        <p className="text-[8px] text-white/30 uppercase mt-0.5">{l.type} layer</p>
                                    </div>
                                    {activeLayerId === l.id && <div className="w-1.5 h-1.5 rounded-full bg-(--main-color)" />}
                                </div>
                            ))}
                        </div>
                    </StitchCard>
                    
                    {/* Terminal Window (Conditional Overlay in Sandbox Mode) */}
                    {showTerminal && (
                        <div className="absolute inset-0 z-10 flex flex-col">
                            <StitchCard className="flex-1 bg-black/90 backdrop-blur-3xl border-(--main-color)/20 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Live Engine Console</span>
                                    </div>
                                    <button onClick={() => setShowTerminal(false)} className="text-white/20 hover:text-white">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col-reverse gap-2 pr-1">
                                    {logs.map(log => (
                                        <div key={log.id} className="text-[9px] font-mono leading-relaxed border-l-2 pl-2 flex flex-col gap-0.5" style={{ 
                                            borderColor: log.type === 'error' ? '#fb7185' : log.type === 'success' ? '#34d399' : log.type === 'warn' ? '#fbbf24' : '#ffffff20',
                                            color: log.type === 'error' ? '#fee2e2' : log.type === 'success' ? '#d1fae5' : log.type === 'warn' ? '#fef3c7' : '#ffffff60'
                                        }}>
                                            <div className="flex items-center gap-2 opacity-40">
                                                <span>[{log.time}]</span>
                                                <span className="uppercase">{log.type}</span>
                                            </div>
                                            <p className="font-semibold">{log.msg}</p>
                                        </div>
                                    ))}
                                    {logs.length === 0 && <span className="text-[9px] text-white/10 italic text-center py-10 uppercase tracking-widest">Listening for events...</span>}
                                </div>
                                <button onClick={() => setLogs([])} className="mt-4 w-full py-2 bg-white/5 rounded-lg text-[8px] font-bold uppercase tracking-widest text-white/30 hover:bg-white/10 transition-all">Clear Terminal</button>
                            </StitchCard>
                        </div>
                    )}
                    
                    {selectedItem && (
                        <StitchCard className="h-44 flex flex-col gap-3">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-2">
                                <Box size={16} className="text-(--main-color)" />
                                <span className="text-[10px] font-black uppercase text-white/60 truncate">{selectedItem.itemId}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <div className="p-2 bg-black/20 rounded-lg border border-white/5 flex flex-col">
                                    <span className="text-[8px] font-bold text-white/20 uppercase">Shape</span>
                                    <span className="text-[10px] text-white font-medium truncate uppercase">{selectedItem.shape}</span>
                                </div>
                                <div className="p-2 bg-black/20 rounded-lg border border-white/5 flex flex-col">
                                    <span className="text-[8px] font-bold text-white/20 uppercase">Mat</span>
                                    <span className="text-[10px] text-white font-medium truncate uppercase">{selectedItem.material}</span>
                                </div>
                            </div>
                        </StitchCard>
                    )}
                </aside>

                {/* Batch Drawer (Bottom Layer) */}
                {showBatchList && (
                    <div className="absolute inset-x-0 bottom-0 top-0 bg-(--app-bg)/60 backdrop-blur-md flex flex-col p-4 animate-in slide-in-from-bottom-full duration-500 z-60">
                         <StitchCard className="w-full max-w-4xl mx-auto flex-1 flex flex-col gap-6 shadow-3xl">
                             <div className="flex items-center justify-between">
                                 <SectionTitle title="Batch Workflow" icon={FolderKanban} />
                                 <button onClick={() => setShowBatchList(false)} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white">
                                     <X size={20} />
                                 </button>
                             </div>
                             
                             <div className="grid grid-cols-4 gap-4 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                 {batchQueue.map(op => (
                                     <div key={op.id} className="p-3 bg-black/20 rounded-xl border border-white/5 flex flex-col gap-3 group relative hover:border-white/10 transition-all">
                                         <div className="aspect-square rounded-lg bg-black overflow-hidden border border-white/5">
                                             <img src={getCleanImageUrl(op.item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover opacity-30 group-hover:opacity-100 transition-opacity" />
                                             {op.status === 'processing' && (
                                                 <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                                     <div className="flex flex-col items-center gap-2">
                                                         <div className="w-8 h-8 rounded-full border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin" />
                                                         <span className="text-[8px] font-black uppercase text-(--main-color) animate-pulse">{op.progress}%</span>
                                                     </div>
                                                 </div>
                                             )}
                                         </div>
                                         <div className="flex flex-col gap-1">
                                              <span className="text-[10px] font-black text-white italic truncate uppercase">{op.item.itemId}</span>
                                              <div className="flex items-center justify-between text-[8px] font-bold text-white/30 uppercase">
                                                   <span className={op.status === 'processing' ? 'text-(--main-color)' : ''}>{op.stepLabel}</span>
                                                   <span>{op.progress}%</span>
                                              </div>
                                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                   <div className={`h-full transition-all duration-300 ${op.status === 'completed' ? 'bg-emerald-400' : op.status === 'failed' ? 'bg-rose-500' : 'bg-(--main-color)'}`} style={{ width: `${op.progress}%` }} />
                                              </div>
                                         </div>
                                         {op.status === 'completed' && <CheckCircle2 size={16} className="absolute top-4 right-4 text-emerald-400 drop-shadow-lg" />}
                                         {op.status === 'failed' && <AlertCircle size={16} className="absolute top-4 right-4 text-rose-500 drop-shadow-lg" />}
                                     </div>
                                 ))}
                             </div>

                             <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                 <button onClick={() => setBatchQueue([])} className="h-10 px-6 rounded-lg bg-red-400/10 text-red-400 text-[10px] font-bold uppercase tracking-widest border border-red-400/20 hover:bg-red-400/20 transition-all">Clear All</button>
                                 <button onClick={runBatchSequence} disabled={isProcessingBatch || batchQueue.length === 0} className="h-10 px-8 rounded-lg bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Start Execution</button>
                             </div>
                         </StitchCard>
                    </div>
                )}
            </main>

            {/* Vault Overlay */}
            {showVault && (
                <div 
                    className="fixed inset-0 z-100 p-8 bg-(--app-bg)/95 backdrop-blur-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500"
                >
                    <div className="w-full max-w-6xl flex flex-col h-full bg-(--stitch-card-bg) border border-white/5 rounded-2xl p-8 shadow-3xl">
                        <div className="flex items-center justify-between mb-8">
                            <SectionTitle title="Deployment Registry" icon={Library} />
                            <div className="flex items-center gap-4">
                                <div className="relative w-72">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search ID..." className="w-full bg-black/40 border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-(--main-color)/30" />
                                </div>
                                <button onClick={() => setShowVault(false)} className="w-10 h-10 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                            {filteredItems.map(item => {
                                const inBatch = batchQueue.some(op => op.item.id === item.id);
                                return (
                                    <div 
                                        key={item.id} 
                                        onClick={() => handleSelectItem(item)}
                                        className={`group relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer ${selectedItem?.id === item.id ? 'border-(--main-color) ring-4 ring-(--main-color)/10' : 'border-white/5 hover:border-white/20'}`}
                                    >
                                        <img src={getCleanImageUrl(item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" alt="" />
                                        <div className="absolute inset-0 bg-linear-to-t from-black via-transparent opacity-60" />
                                        
                                        <div className="absolute top-2 right-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); inBatch ? null : addToBatch(item); }}
                                                className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all ${inBatch ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-black/60 border-white/10 text-white/30 hover:text-white hover:border-white/30'}`}
                                            >
                                                {inBatch ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                                            </button>
                                        </div>

                                        <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-0.5">
                                            <span className="text-[10px] font-black text-white italic truncate uppercase tracking-tight">{item.itemId}</span>
                                            <span className="text-[8px] font-bold text-(--main-color) uppercase tracking-widest">{item.shape}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.04); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #60a5fa); }
            `}</style>
        </div>
    );
};
