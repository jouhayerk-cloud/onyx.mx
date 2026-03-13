import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { userAtom, inventoryAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import {
    normalizeInventoryData,
    getCleanImageUrl,
    loadImage,
    extractGradientFromMask,
    generatePngAndSvgFromMasks,
    findContour,
    simplifyContour,
    createCurvePath
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
    Box
} from 'lucide-react';
import toast from 'react-hot-toast';

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

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

/* ─── Premium Components ─── */

const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden ${className}`}>
        {children}
    </div>
);

const SectionTitle = ({ title, subtitle }: { title: string, subtitle?: string }) => (
    <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">{title}</h2>
        {subtitle && <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em]">{subtitle}</p>}
    </div>
);

export const ProcessView: React.FC = () => {
    const [user] = useAtom(userAtom);
    const inventory = useAtomValue(inventoryAtom);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showVault, setShowVault] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<ProcessLayer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const [tool, setTool] = useState<'move' | 'mask'>('move');
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);
    const [gradientColors, setGradientColors] = useState(['#FFD700', '#FF4500']);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        // Sync local display items with global atom
        setInventoryItems(inventory.map(item => ({ ...item.data, id: item.row, source: item.source })));
    }, [inventory]);

    const filteredItems = inventoryItems.filter(item => {
        const s = searchTerm.toLowerCase();
        return !s || item.item_id?.toLowerCase().includes(s) || item.shape?.toLowerCase().includes(s);
    });

    const handleSelectItem = useCallback((item: any) => {
        setSelectedItem(item);
        setShowVault(false);
        const imageUrl = getCleanImageUrl(item.generatedPngUrl || (item.media_urls ? item.media_urls.split(',')[0].trim() : null));
        if (imageUrl) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = imageUrl;
            img.onload = () => {
                const newLayer: ProcessLayer = {
                    id: Math.random().toString(36).substr(2, 6).toUpperCase(),
                    type: 'image',
                    data: { img, src: imageUrl },
                    visible: true,
                    opacity: 1,
                    rotation: 0,
                    position: { x: 50, y: 50 }
                };
                setLayers([newLayer]);
                setActiveLayerId(newLayer.id);
            };
        }
    }, []);

    const smartSegment = async (item: any) => {
        if (!API_KEY) return toast.error("Gemini API Key missing");
        setIsProcessing(true);
        const tid = toast.loading("Executing Vector Segmentation...");
        try {
            const imageUrl = getCleanImageUrl(item.media_urls?.split(',')[0]);
            if (!imageUrl) throw new Error("No source image");

            const img = await loadImage(imageUrl);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            const maxDim = 1000;
            const scale = Math.min(maxDim / img.width, maxDim / img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

            const prompt = `Segment and trace the main object. Return accurate bounding boxes [ymin, xmin, ymax, xmax]. If it's a mirror, trace only the frame. Return JSON: { "masks": [[ymin, xmin, ymax, xmax]] }`;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }]
                })
            });

            const resData = await response.json();
            const textResult = resData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            const processed = JSON.parse(textResult.replace(/```json|```/g, '').trim());

            if (processed.masks) {
                const maskData = processed.masks.map((m: number[]) => ({
                    ymin: m[0], xmin: m[1], ymax: m[2], xmax: m[3],
                    x: m[1] / 1000, y: m[0] / 1000, 
                    width: (m[3] - m[1]) / 1000, height: (m[2] - m[0]) / 1000,
                    label: 'Object',
                    path: `M 0 0 H 1000 V 1000 H 0 Z`, // Placeholder rect path
                    maskWidth: 1000, maskHeight: 1000
                }));

                const colors = await extractGradientFromMask(imageUrl, maskData[0], { width: 1000, height: 1000 });
                const { pngData, svgData } = await generatePngAndSvgFromMasks(imageUrl, { width: 1000, height: 1000 }, maskData);
                
                await supabase.from('inventory').update({
                    spatial_masks: JSON.stringify(maskData),
                    dominant_color: colors,
                    generated_png_url: pngData,
                    vector_svg: svgData
                }).eq('id', item.id);

                setInventoryItems(prev => prev.map(p => p.id === item.id ? { ...p, spatial_masks: JSON.stringify(maskData), dominant_color: colors, generatedPngUrl: pngData } : p));
                toast.success("Artifact Vectorized Successfully", { id: tid });
            }
        } catch (e: any) {
            toast.error(`Segmentation Error: ${e.message}`, { id: tid });
        } finally {
            setIsProcessing(false);
        }
    };

    const runBatchExport = async () => {
        if (batchSelection.size === 0) return toast.error("Select items in Vault first");
        const tid = toast.loading(`Batch Processing ${batchSelection.size} Artifacts...`);
        try {
            for (const id of Array.from(batchSelection)) {
                const item = inventoryItems.find(i => i.id === id);
                if (item) await smartSegment(item);
            }
            toast.success("Batch Sequence Complete", { id: tid });
        } catch (e) { toast.error("Batch Failure", { id: tid }); }
    };

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
            ctx.beginPath();
            ctx.strokeStyle = '#7FBBFF';
            ctx.lineWidth = 4;
            ctx.moveTo((currentPath[0].x / 100) * cv.width, (currentPath[0].y / 100) * cv.height);
            currentPath.forEach(p => ctx.lineTo((p.x / 100) * cv.width, (p.y / 100) * cv.height));
            ctx.stroke();
        }
    }, [layers, currentPath]);

    return (
        <div className="flex w-full h-full bg-transparent overflow-hidden border border-white/5 rounded-[4rem] perspective-1000 shadow-3xl animate-in fade-in duration-1000">
            {/* Viewport Area */}
            <div className="flex-1 flex flex-col relative bg-black/20 backdrop-blur-3xl overflow-hidden">
                {/* Visual Toolbar */}
                <header className="px-12 py-8 flex items-center justify-between border-b border-white/5 bg-black/10">
                    <SectionTitle title="Advanced Processor" subtitle="Visual Segmentation Hub" />
                    
                    <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-2xl border border-white/10">
                        <button onClick={() => setTool('move')} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${tool === 'move' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
                            <MousePointer2 size={18} />
                        </button>
                        <button onClick={() => setTool('mask')} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${tool === 'mask' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
                            <Scissors size={18} />
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-2" />
                        <button onClick={() => setShowVault(true)} className="px-6 h-11 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white hover:bg-white/5 transition-all flex items-center gap-3">
                            <Library size={16} /> Open Vault
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                         <button onClick={() => smartSegment(selectedItem)} disabled={!selectedItem || isProcessing} className="px-10 h-14 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-4 hover:bg-(--main-color) hover:text-white transition-all shadow-2xl disabled:opacity-20 active:scale-95">
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            Auto Trace
                         </button>
                         <button onClick={runBatchExport} className="w-14 h-14 rounded-full bg-white/5 border border-white/10 text-white/30 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all">
                            <Download size={20} />
                         </button>
                    </div>
                </header>

                <div className="flex-1 flex items-center justify-center relative group">
                    <div className="relative transform hover:scale-[1.02] transition-transform duration-700">
                        <canvas
                            ref={canvasRef} width={1200} height={1200}
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
                            style={{ width: 'min(78vh, 78vw)', height: 'min(78vh, 78vw)' }}
                            className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[5rem] shadow-2xl transition-all"
                        />
                        {activeLayerId && <div className="absolute inset-0 pointer-events-none border-4 border-(--main-color)/20 rounded-[5rem] animate-pulse" />}
                    </div>
                    
                    {/* Floating Selection Info */}
                    {selectedItem && (
                        <div className="absolute top-10 left-10 p-5 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-3xl flex items-center gap-5 shadow-3xl">
                             <div className="w-10 h-10 rounded-2xl bg-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                                 <Box size={20} />
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-[10px] font-black text-white uppercase tracking-widest">{selectedItem.item_id}</span>
                                 <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em]">{selectedItem.shape} · {selectedItem.material}</span>
                             </div>
                        </div>
                    )}
                </div>

                {/* Vault Overlay */}
                {showVault && (
                    <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl p-20 flex flex-col animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
                        <div className="flex items-center justify-between mb-16">
                            <SectionTitle title="Artifact Vault" subtitle="Pipeline Collection" />
                            <button onClick={() => setShowVault(false)} className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="relative mb-12 max-w-2xl">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search Repository..." className="w-full bg-white/5 border border-white/10 rounded-3xl pl-16 pr-8 py-5 text-sm text-white focus:outline-none focus:border-(--main-color)/50 transition-all font-mono" />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-6 overflow-y-auto custom-scrollbar flex-1 pb-10">
                            {filteredItems.map(item => (
                                <div key={item.id} onClick={() => handleSelectItem(item)} className={`group relative aspect-square rounded-[2rem] overflow-hidden border transition-all cursor-pointer ${selectedItem?.id === item.id ? 'border-(--main-color) ring-2 ring-(--main-color)/20' : 'border-white/5 hover:border-white/20'}`}>
                                    <img src={getCleanImageUrl(item.media_urls?.split(',')[0])!} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-[2s]" alt="" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                                    <div className="absolute top-4 right-4">
                                        <button onClick={(e) => { e.stopPropagation(); setBatchSelection(p => { const n = new Set(p); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); }} className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${batchSelection.has(item.id) ? 'bg-(--main-color) border-(--main-color) text-black' : 'bg-black/40 border-white/10'}`}>
                                            {batchSelection.has(item.id) && <CheckSquare size={14} />}
                                        </button>
                                    </div>
                                    <div className="absolute bottom-4 left-4 right-4 flex flex-col">
                                        <span className="text-[10px] font-black text-white tracking-widest truncate">{item.item_id}</span>
                                        <span className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] mt-0.5 truncate">{item.shape}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Properties Panel (Integrated Sidebar) */}
            <div className="w-[450px] flex flex-col bg-black/40 backdrop-blur-3xl border-l border-white/5 p-16 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-4 mb-20">
                    <div className="w-12 h-12 rounded-2xl bg-(--main-color)/10 flex items-center justify-center text-(--main-color) border border-(--main-color)/20">
                        <Layers size={20} />
                    </div>
                    <SectionTitle title="Architecture" subtitle="Properties & Layers" />
                </div>

                <div className="space-y-12">
                     <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Alpha Channel</label>
                            <span className="text-[10px] font-mono text-(--main-color) font-black">{activeLayerId ? Math.round((layers.find(l => l.id === activeLayerId)?.opacity || 0) * 100) : 0}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={layers.find(l => l.id === activeLayerId)?.opacity || 0} onChange={e => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, opacity: parseFloat(e.target.value) } : l))} className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-(--main-color)" />
                    </div>

                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Spatial Rotation</label>
                            <span className="text-[10px] font-mono text-(--main-color) font-black">{layers.find(l => l.id === activeLayerId)?.rotation || 0}°</span>
                        </div>
                        <input type="range" min="0" max="360" value={layers.find(l => l.id === activeLayerId)?.rotation || 0} onChange={e => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, rotation: parseInt(e.target.value) } : l))} className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-(--main-color)" />
                    </div>

                    <div className="space-y-8">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 block">Active Segments</label>
                        <div className="space-y-4">
                            {layers.map(l => (
                                <div key={l.id} onClick={() => setActiveLayerId(l.id)} className={`group relative flex items-center gap-6 p-6 rounded-3xl border transition-all cursor-pointer ${activeLayerId === l.id ? 'bg-white/5 border-white/20 shadow-2xl scale-[1.02]' : 'bg-transparent border-white/5 hover:bg-white/2'}`}>
                                    <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10 shadow-inner group-hover:scale-110 transition-transform overflow-hidden">
                                        {l.type === 'image' ? (
                                            <img src={l.data.src} className="w-full h-full object-cover opacity-30" />
                                        ) : <Pipette size={20} className="text-white/30" />}
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Segment {l.id}</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[8px] font-mono text-white/20 uppercase">{l.type}</span>
                                            <div className="w-1 h-1 rounded-full bg-white/10" />
                                            <span className="text-[8px] font-mono text-white/20 uppercase">{Math.round(l.opacity * 100)}% API</span>
                                        </div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setLayers(prev => prev.filter(x => x.id !== l.id)); }} className="w-10 h-10 rounded-xl bg-white/0 hover:bg-red-500/10 flex items-center justify-center text-white/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                                </div>
                            )).reverse()}
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-16 grid grid-cols-2 gap-6">
                    <button onClick={() => setLayers([])} className="h-20 rounded-3xl bg-white/3 border border-white/5 hover:border-white/20 transition-all font-black text-[10px] uppercase tracking-widest text-white/20 hover:text-white flex items-center justify-center gap-3"><Undo2 size={18} /> Clear</button>
                    <button className="h-20 rounded-3xl bg-(--main-color) text-black font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl shadow-(--main-color)/20 flex items-center justify-center gap-3"><Save size={18} /> Commit</button>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
            `}</style>
        </div>
    );
};
