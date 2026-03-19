
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    userAtom,
    inventoryAtom,
    InventoryVersionAtom,
    processToolAtom,
    processShowTerminalAtom,
    processShowVaultAtom,
    processShowBatchListAtom,
    processTriggerAnalyzeAtom,
    processTriggerBatchAtom,
    processActiveStepLabelAtom,
    processIsProcessingAtom,
    processLogsAtom,
    SelectedItemDataAtom
} from '../../lib/atoms';
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
    Library,
    X,
    Box,
    Play,
    CheckCircle2,
    AlertCircle,
    Zap,
    Activity,
    FolderKanban,
    Terminal,
    Bug
} from 'lucide-react';
import toast from 'react-hot-toast';

/* --- Types --- */
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

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

/* --- Aesthetic Components --- */

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
    const selectedItemData = useAtomValue(SelectedItemDataAtom);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [batchQueue, setBatchQueue] = useState<BatchOperation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Global Atoms
    const [tool, setTool] = useAtom(processToolAtom);
    const [showTerminal, setShowTerminal] = useAtom(processShowTerminalAtom);
    const [showVault, setShowVault] = useAtom(processShowVaultAtom);
    const [showBatchList, setShowBatchList] = useAtom(processShowBatchListAtom);
    const analyzeTrigger = useAtomValue(processTriggerAnalyzeAtom);
    const batchTrigger = useAtomValue(processTriggerBatchAtom);
    const [activeStepLabel, setActiveStepLabel] = useAtom(processActiveStepLabelAtom);
    const [isProcessingGlobal, setIsProcessingGlobal] = useAtom(processIsProcessingAtom);
    
    // System Console Logs
    const [logs, setLogs] = useAtom(processLogsAtom);
    const addLog = useCallback((msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
        setLogs(prev => [{ id: Math.random().toString(), msg, time: new Date().toLocaleTimeString(), type }, ...prev.slice(0, 49)]);
    }, [setLogs]);

    const updateProgress = (step: string, processing = true) => {
        setActiveStepLabel(step);
        setIsProcessingGlobal(processing);
    };

    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
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

    /* --- Handlers --- */

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
                addLog(`Layer ${newLayer.id} initialized.`, 'success');
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

    /* --- AI Pipeline --- */

    const processItem = async (opId: string | 'single') => {
        const updateOp = (updates: Partial<BatchOperation>) => {
            if (opId === 'single') {
                if (updates.stepLabel) updateProgress(updates.stepLabel || '');
                return;
            }
            setBatchQueue(prev => prev.map(op => op.id === opId ? { ...op, ...updates } : op));
        };

        let item = null;
        if (opId === 'single') {
            item = selectedItem;
        } else {
            const currentOp = batchQueue.find(o => o.id === opId);
            if (!currentOp) return;
            item = currentOp.item;
        }

        if (!item) return;

        try {
            updateOp({ status: 'processing', progress: 5, stepLabel: 'Initalizing AI...' });
            if (!API_KEY) {
                addLog("Gemini API Key missing! Make sure VITE_GEMINI_API_KEY is in your .env.local", "error");
                throw new Error("API Key missing");
            }

            const imageUrl = getCleanImageUrl(item.mediaUrls?.split(',')[0]);
            if (!imageUrl) throw new Error("Missing source image");

            updateOp({ progress: 15, stepLabel: 'Resizing...' });
            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];

            updateOp({ progress: 30, stepLabel: 'Analyzing...' });
            const instruction = `Give the segmentation masks for this ${item.shape} Onyx artifact. Instructions: If it's a mirror, create separate masks for the 'frame' and 'glass'. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "string"}]`;
            
            const genAI = new GoogleGenerativeAI(API_KEY);
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash", 
                generationConfig: { responseMimeType: "application/json" }
            });

            updateOp({ progress: 40, stepLabel: 'Processing AI...' });
            const result = await model.generateContent([
                instruction,
                { inlineData: { mimeType: 'image/jpeg', data: base64 } }
            ]);

            const rawOutput = result.response.text();
            if (!rawOutput) throw new Error("Empty response from Flash Engine");
            
            // Handle markdown-wrapped JSON if present
            let cleanedJson = rawOutput.trim();
            if (cleanedJson.includes('```')) {
                const match = cleanedJson.match(/```(?:json)?([\s\S]*?)```/);
                if (match) cleanedJson = match[1].trim();
                else cleanedJson = cleanedJson.replace(/```(json)?|```/g, '').trim();
            }
            
            const processed = JSON.parse(cleanedJson);
            addLog(`Engine found ${processed.length} segmentation layers.`, 'success');

            updateOp({ progress: 60, stepLabel: 'Vectorizing...' });
            const masks: any[] = await Promise.all(processed.map(async (m: any, idx: number) => {
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

            updateOp({ progress: 85, stepLabel: 'Rendering...' });
            const img = await loadImage(imageUrl);
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks);
            const colorsResult = await extractGradientFromMask(imageUrl, masks[0], { width: img.width, height: img.height });

            updateOp({ progress: 95, stepLabel: 'Committing...' });
            const tableName = item.source === 'production' ? 'production' : 'inventory';
            await supabase.from(tableName).update({
                generated_png_url: pngData,
                vector_svg: svgData,
                spatial_masks: JSON.stringify(masks),
                dominant_color: colorsResult
            }).eq('id', item.row);
            
            updateOp({ status: 'completed', progress: 100, stepLabel: 'Success' });
            addLog(`Deployment finalized for ${item.itemId}`, 'success');
            if (opId === 'single') updateProgress('DEPLOYMENT SUCCESS', false);
            setInventoryVersion(v => v + 1);

        } catch (e: any) {
            updateOp({ status: 'failed', error: e.message, stepLabel: 'Error' });
            if (opId === 'single') updateProgress('ENGINE ERROR', false);
            toast.error(`Processing Error`);
        }
    };

    const runBatchSequence = async () => {
        updateProgress("BATCH STARTING");
        const queue = batchQueue.filter(op => op.status !== 'completed');
        for (const op of queue) {
            await processItem(op.id);
            await new Promise(r => setTimeout(r, 500));
        }
        updateProgress("BATCH COMPLETE", false);
        toast.success("Batch Sequence Finalized");
    };

    useEffect(() => {
        if (selectedItemData && selectedItemData.itemId !== selectedItem?.itemId) {
            handleSelectItem({ ...selectedItemData, id: (selectedItemData as any).id || (selectedItemData as any).row });
        }
    }, [selectedItemData]);

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
    }, [layers]);

    return (
        <div className="flex flex-col w-full h-full bg-transparent gap-4 overflow-hidden font-sans">
            {/* Autonomous Internal Header */}
            <header className="h-20 shrink-0 bg-(--stitch-card-bg)/80 backdrop-blur-xl border border-white/5 rounded-2xl px-6 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-6">
                    <SectionTitle title="Aesthetic AI Studio" icon={Sparkles} />
                    <div className="h-8 w-px bg-white/5" />
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowVault(true)} className="h-10 px-4 rounded-xl bg-white/5 border border-white/5 hover:border-(--main-color)/40 text-white/60 hover:text-white flex items-center gap-2 transition-all">
                            <Library size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Artifact Vault</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                        <Activity size={14} className={isProcessingGlobal ? "text-(--main-color) animate-pulse" : "text-white/10"} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 truncate max-w-[140px]">
                            {activeStepLabel || "ENGINE READY"}
                        </span>
                    </div>

                    <div className="h-8 w-px bg-white/5" />

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => processItem('single')} 
                            disabled={isProcessingGlobal || !selectedItem}
                            className="h-10 px-5 rounded-xl bg-(--main-color) text-black flex items-center gap-2 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-(--main-color)/20 active:scale-95 disabled:opacity-20 disabled:grayscale transition-all"
                        >
                            <Zap size={14} />
                            Analyze
                        </button>
                        <button 
                            onClick={() => setShowBatchList(true)}
                            className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                        >
                            <FolderKanban size={18} />
                        </button>
                        <button 
                            onClick={() => setShowTerminal(!showTerminal)}
                            className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all ${showTerminal ? 'bg-(--main-color)/10 border-(--main-color)/40 text-(--main-color)' : 'bg-white/5 border-white/5 text-white/40'}`}
                        >
                            <Terminal size={18} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex gap-4 overflow-hidden relative">
                <div className="flex-1 flex items-center justify-center bg-black/20 rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <canvas
                        ref={canvasRef} 
                        width={1600} 
                        height={1600}
                        onMouseDown={(e) => { if (tool === 'move' && activeLayerId) { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); } }}
                        onMouseMove={(e) => {
                            if (!isDragging || !activeLayerId) return;
                            const r = canvasRef.current?.getBoundingClientRect();
                            if (!r) return;
                            const dx = ((e.clientX - dragStart.x) / r.width) * 100;
                            const dy = ((e.clientY - dragStart.y) / r.height) * 100;
                            setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, position: { x: l.position.x + dx, y: l.position.y + dy } } : l));
                            setDragStart({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        style={{ width: 'min(76vh, 76vw)', height: 'min(76vh, 76vw)' }}
                        className="bg-black/40 rounded-xl shadow-2xl z-10"
                    />
                </div>

                <aside className="w-72 flex flex-col gap-4 relative">
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
                    
                    {showTerminal && (
                        <div className="absolute inset-0 z-10 flex flex-col">
                            <StitchCard className="flex-1 bg-black/90 backdrop-blur-3xl border-(--main-color)/20 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col p-4">
                                <div className="flex items-center justify-between mb-3 text-emerald-500">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Engine Console</span>
                                    <button onClick={() => setShowTerminal(false)}><X size={14} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col-reverse gap-2 text-[9px] font-mono">
                                    {logs.map(log => <div key={log.id} className="opacity-60">[{log.time}] {log.msg}</div>)}
                                </div>
                            </StitchCard>
                        </div>
                    )}
                </aside>

                {showBatchList && (
                    <div className="absolute inset-x-0 bottom-0 top-0 bg-(--app-bg)/60 backdrop-blur-md flex p-4 z-60 animate-in slide-in-from-bottom-full overflow-hidden">
                         <div className="flex gap-4 w-full max-w-7xl mx-auto flex-1 h-full">
                             <StitchCard className="flex-1 flex flex-col gap-6 overflow-hidden">
                                 <div className="flex items-center justify-between">
                                     <SectionTitle title="Batch Pipeline" icon={FolderKanban} />
                                     <div className="flex items-center gap-3">
                                         <button onClick={() => setBatchQueue([])} className="px-4 py-2 border border-white/5 rounded-lg text-[10px] font-bold text-white/30 hover:text-red-400">Clear Queue</button>
                                         <button onClick={() => setShowBatchList(false)} className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white">
                                              <X size={20} />
                                         </button>
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                     {batchQueue.map(op => (
                                         <div key={op.id} className="p-2 bg-black/20 rounded-xl border border-white/5 flex flex-col gap-2 relative group hover:border-white/10">
                                             <div className="aspect-video rounded-lg bg-black overflow-hidden border border-white/5 relative">
                                                 <img src={getCleanImageUrl(op.item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity" />
                                                 {op.status === 'processing' && (
                                                     <div className="absolute inset-0 flex items-center justify-center bg-black/60 shadow-inner">
                                                         <div className="w-8 h-8 rounded-full border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin" />
                                                     </div>
                                                 )}
                                                 {op.status === 'completed' && <CheckCircle2 size={16} className="absolute top-2 right-2 text-emerald-400 drop-shadow-lg" />}
                                                 {op.status === 'failed' && <AlertCircle size={16} className="absolute top-2 right-2 text-rose-500 drop-shadow-lg" />}
                                             </div>
                                             <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] font-black text-white italic truncate uppercase">{op.item.itemId}</span>
                                                  <div className="flex items-center justify-between text-[7px] font-bold text-white/25 uppercase">
                                                       <span>{op.stepLabel}</span>
                                                       <span className={op.progress > 0 ? 'text-(--main-color)' : ''}>{op.progress}%</span>
                                                  </div>
                                                  <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                                                       <div className={`h-full transition-all duration-300 ${op.status === 'completed' ? 'bg-emerald-400' : 'bg-(--main-color)'}`} style={{ width: `${op.progress}%` }} />
                                                  </div>
                                             </div>
                                         </div>
                                     ))}
                                     {batchQueue.length === 0 && <div className="col-span-full h-full flex items-center justify-center text-[10px] font-black uppercase text-white/10 tracking-[0.2em]">Queue Empty</div>}
                                 </div>

                                 <button onClick={runBatchSequence} disabled={isProcessingGlobal || batchQueue.length === 0} className="w-full py-5 rounded-2xl bg-(--main-color) text-black text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-(--main-color)/20 disabled:grayscale disabled:opacity-20 active:scale-[0.98] transition-all">Execute Batch Sequence</button>
                             </StitchCard>

                             {/* Shared Terminal in Sidebar */}
                             <aside className="w-72 flex flex-col gap-4">
                                 <StitchCard className="flex-1 bg-black/40 flex flex-col gap-4 overflow-hidden">
                                     <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                         <div className="flex items-center gap-2 text-emerald-400">
                                            <Terminal size={14} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Live Engine</span>
                                         </div>
                                         <button onClick={() => setLogs([])} className="text-[8px] font-black uppercase text-white/20 hover:text-white transition-colors">Clear</button>
                                     </div>
                                     <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col-reverse gap-3 pr-1 text-[9px] font-mono">
                                         {logs.map(log => (
                                             <div key={log.id} className="opacity-60 flex gap-2">
                                                 <span className="shrink-0 text-white/20">[{log.time}]</span>
                                                 <span className={log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-white/60'}>{log.msg}</span>
                                             </div>
                                         ))}
                                     </div>
                                 </StitchCard>
                             </aside>
                         </div>
                    </div>
                )}
            </main>

            {showVault && (
                <div className="fixed inset-0 z-100 p-8 bg-(--app-bg)/95 backdrop-blur-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95">
                    <div className="w-full max-w-6xl flex flex-col h-full bg-(--stitch-card-bg) border border-white/5 rounded-2xl p-8">
                        <div className="flex items-center justify-between mb-8">
                            <SectionTitle title="Artifact Vault" icon={Library} />
                            <button onClick={() => setShowVault(false)} className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center"><X size={24} /></button>
                        </div>
                        <div className="grid grid-cols-8 gap-4 overflow-y-auto pr-2">
                            {filteredItems.map(item => (
                                <div key={item.id} onClick={() => handleSelectItem(item)} className="aspect-square rounded-xl overflow-hidden border border-white/5 hover:border-(--main-color) transition-all cursor-pointer">
                                    <img src={getCleanImageUrl(item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover grayscale opacity-40 hover:grayscale-0 hover:opacity-100" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
