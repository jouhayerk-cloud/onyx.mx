
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MaskEditor, toMask } from 'react-canvas-masker';
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
    resizeImage,
    cropImage
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
    Check,
    CheckCircle2,
    AlertCircle,
    Zap,
    Activity,
    FolderKanban,
    Terminal,
    Bug,
    Target
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
    scale: number;
    zIndex: number;
    position: { x: number, y: number };
    includeInOutput?: boolean;
    maskData?: string; 
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

const getApiKey = () => {
    const key = localStorage.getItem('ONYX_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const clean = String(key).trim().replace(/['"]/g, '');
    return (clean === 'null' || clean === 'undefined') ? '' : clean;
};

/* --- Aesthetic Components --- */

const StitchCard = ({ children, className = "", noPadding = false }: { children: React.ReactNode, className?: string, noPadding?: boolean }) => (
    <div className={`bg-(--stitch-card-bg)/40 backdrop-blur-xl border border-white/5 rounded-xl ${noPadding ? '' : 'p-4'} ${className}`}>
        {children}
    </div>
);

const SectionTitle = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="flex items-center gap-3">
        {Icon && (
            <div className="text-(--main-color)">
                <Icon size={18} />
            </div>
        )}
        <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">{title}</h3>
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
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    // Global Atoms
    const [tool, setTool] = useAtom(processToolAtom);
    const [showTerminal, setShowTerminal] = useAtom(processShowTerminalAtom);
    const [showVault, setShowVault] = useAtom(processShowVaultAtom);
    const [showBatchList, setShowBatchList] = useAtom(processShowBatchListAtom);
    const analyzeTrigger = useAtomValue(processTriggerAnalyzeAtom);
    const batchTrigger = useAtomValue(processTriggerBatchAtom);
    const [activeStepLabel, setActiveStepLabel] = useAtom(processActiveStepLabelAtom);
    const [isProcessingGlobal, setIsProcessingGlobal] = useAtom(processIsProcessingAtom);
    const [engineStatus, setEngineStatus] = useState<'idle' | 'analyzing' | 'vectorizing' | 'committing' | 'completed' | 'error'>('idle');
    const [refiningLayerId, setRefiningLayerId] = useState<string | null>(null);
    const maskEditorRef = useRef<any>(null);
    
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
    const [refinePoints, setRefinePoints] = useState<{ x: number, y: number, type: 'pos' | 'neg' }[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<ProcessLayer[]>([]);
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        setInventoryItems(inventory.map(item => ({ 
            ...normalizeInventoryData(item.data), 
            id: item.data.id || item.row, // Prefer Supabase UUID
            row: item.row, 
            source: item.source 
        })));
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
                    position: { x: 50, y: 50 },
                    scale: 1,
                    zIndex: 0
                };
                
                // Parse existing spatial masks if they exist
                const savedMasks = item.spatialMasks || item.spatial_masks || [];
                const savedLayers: ProcessLayer[] = (Array.isArray(savedMasks) ? savedMasks : []).map((m: any, i: number) => ({
                    id: `MASK-${i}-${m.label || 'layer'}`,
                    type: 'mask',
                    data: { mask: m, color: '#6BCEBB' },
                    visible: true,
                    includeInOutput: true,
                    opacity: 0.8,
                    rotation: 0,
                    scale: 1,
                    zIndex: i + 1,
                    position: { x: 50, y: 50 }
                }));

                setLayers([newLayer, ...savedLayers]);
                setActiveLayerId(newLayer.id);
                addLog(`WORKSPACE LOAD: ${item.itemId} (${savedLayers.length} masks found)`, 'success');
            }).catch(err => {
                addLog(`Workspace load error: ${err.message}`, 'error');
            });
        }
    }, [addLog]);

    const addToBatch = useCallback((item: any) => {
        const urls = item.mediaUrls?.split(',').map((u: string) => u.trim()).filter(Boolean) || [];
        const baseImageUrl = getCleanImageUrl(item.generatedPngUrl || (urls.length > 0 ? urls[0] : null));
        
        // If the item has multiple images, add EACH one to the batch
        urls.forEach((url: string, idx: number) => {
            const opId = `OP-${item.id}-${idx}-${Math.random().toString(36).substr(2, 2).toUpperCase()}`;
            if (batchQueue.some(op => op.id === opId)) return;
            
            setBatchQueue(prev => [...prev, {
                id: opId,
                item: { ...item, activeImageUrl: getCleanImageUrl(url) },
                status: 'idle',
                progress: 0,
                stepLabel: idx === 0 ? 'Primary' : `Image ${idx + 1}`
            }]);
        });
        
        addLog(`Vault sync: ${urls.length} images queued for ${item.itemId}.`, 'info');
    }, [batchQueue, addLog]);

    const addSelectedToBatch = () => {
        const selectedItems = inventoryItems.filter(item => selectedIds.has(item.row));
        selectedItems.forEach(item => addToBatch(item));
        setSelectedIds(new Set());
        setShowVault(false);
        setShowBatchList(true);
        toast.success(`Enqueued ${selectedItems.length} items for processing`);
    };

    const toggleSelection = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleClearResult = async (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Clear all AI-generated masks and PNG assets for ${item.itemId}?`)) return;
        try {
            const { error } = await supabase
                .from('inventory')
                .update({ 
                    spatial_masks: null, 
                    generated_png_url: null, 
                    description: `Resetted for re-processing.` 
                })
                .eq('id', item.id);
            if (error) throw error;
            addLog(`Purged assets for ${item.itemId}`, 'warn');
            setInventoryVersion(v => v + 1);
        } catch (err: any) {
            addLog(`Database error on purge: ${err.message}`, 'error');
        }
    };

    const handleManualCommit = async () => {
        if (!selectedItem) return;
        setEngineStatus('committing');
        addLog(`Synchronizing selected layers to database...`, 'info');
        try {
            const selectedMasks = layers.filter(l => l.type === 'mask' && l.includeInOutput).map(l => l.data.mask);
            const baseImg = layers.find(l => l.type === 'image');
            if (selectedMasks.length === 0 || !baseImg) throw new Error("Nothing selected for build.");
            
            const imageUrl = baseImg.data.src;
            const imgImg = await loadImage(imageUrl);
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageUrl, { width: imgImg.width, height: imgImg.height }, selectedMasks);
            
            const { error } = await supabase.from('inventory').update({
                spatial_masks: selectedMasks,
                generated_png_url: pngData,
                description: `Production Commit: ${selectedMasks.length} layers.`
            }).eq('id', selectedItem.id);
            
            if (error) throw error;
            addLog(`Success: Production data synced.`, 'success');
            setInventoryVersion(v => v + 1);
            setEngineStatus('completed');
            toast.success("Database Updated");
        } catch (e: any) {
            addLog(`Sync error: ${e.message}`, 'error');
            setEngineStatus('error');
            toast.error(e.message);
        }
    };

    /* --- AI Pipeline --- */

    const processItem = async (opId: string | 'single', forcedPoints: any[] = []) => {
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
            const API_KEY = getApiKey();
            if (!API_KEY) {
                addLog("Gemini API Key missing! Set it in browser storage: localStorage.setItem('ONYX_GEMINI_KEY', 'YOUR_KEY')", "error");
                throw new Error("API Key missing");
            }
            addLog(`Using Model: gemini-3.1-flash (March 2026 Release)`, 'info');

            const imageUrl = item.activeImageUrl || getCleanImageUrl(item.mediaUrls?.split(',')[0]);
            if (!imageUrl) throw new Error("Missing source image");

            updateOp({ progress: 15, stepLabel: 'Resizing...' });
            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];

            updateOp({ progress: 30, stepLabel: 'Analyzing...' });
            setEngineStatus('analyzing');
            let instruction = `Give the segmentation masks for this ${item.shape} Onyx artifact. Instructions: If it's a mirror, create separate masks for the 'frame' and 'glass'. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "string"}]`;
            
            if (forcedPoints.length > 0) {
                 const pStr = forcedPoints.map(p => `[${Math.round(p.y * 10)}, ${Math.round(p.x * 10)}, ${p.type === 'pos' ? 'POSITIVE' : 'NEGATIVE'}]`).join(', ');
                 instruction = `REFINEMENT MODE: Use these guidance points: ${pStr}. Extract the mask for the object associated with POSITIVE points and EXCLUDE areas with NEGATIVE points. Output JSON: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "refined"}]`;
            }
            
            // Raw Fetch Diagnostic Conduit (to unmask 400 errors)
            let resultText = '';
            let usedModelName = '';
            const modelsToTry = [
                "gemini-3.1-pro",
                "gemini-3.1-flash",
                "gemini-3.1-pro-001",
                "gemini-3.1-flash-001",
                "gemini-2.5-pro",
                "gemini-2.5-flash"
            ];

            const callGemini = async (modelId: string, prompt: string, imgData: string, timeoutMs: number = 20000) => {
                for (const version of ['v1', 'v1beta']) {
                    const url = `https://generativelanguage.googleapis.com/${version}/models/${modelId}:generateContent?key=${API_KEY}`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                    try {
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: controller.signal,
                            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imgData } }] }] })
                        });
                        clearTimeout(timeoutId);
                        if (res.ok) return await res.json();
                        // If 404, we'll try the next version
                        if (res.status === 404) continue;
                        const err = await res.json().catch(() => ({}));
                        addLog(`${modelId} (${version}) Rejected: ${res.status} (${err.error?.message || ''})`, 'warn');
                    } catch (e: any) {
                        clearTimeout(timeoutId);
                        if (e.name === 'AbortError') addLog(`${modelId} timed out after ${timeoutMs/1000}s.`, 'warn');
                    }
                }
                return null;
            };

            for (const modelId of modelsToTry) {
                addLog(`Requesting Trace: ${modelId}...`, 'info');
                const data = await callGemini(modelId, instruction, base64);
                if (data && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    resultText = data.candidates[0].content.parts[0].text;
                    usedModelName = modelId;
                    break;
                }
            }

            if (!resultText) throw new Error("All AI conduits rejected the payload. Check console for exact reasons.");
            addLog(`Success via ${usedModelName}. Unpacking layers...`, 'success');

            const rawOutput = resultText;
            if (!rawOutput) throw new Error("Empty response from Engine");
            
            // Handle markdown-wrapped JSON if present
            let cleanedJson = rawOutput.trim();
            if (cleanedJson.includes('```')) {
                const match = cleanedJson.match(/```(?:json)?([\s\S]*?)```/);
                if (match) cleanedJson = match[1].trim();
                else cleanedJson = cleanedJson.replace(/```(json)?|```/g, '').trim();
            }
            
            const processed = JSON.parse(cleanedJson);
            addLog(`Engine found ${processed.length} segmentation layers.`, 'success');

            updateOp({ progress: 60, stepLabel: 'Refining Piece Edges (High-Res)...' });
            setEngineStatus('vectorizing');

            const img = await loadImage(imageUrl);
            const originalWidth = img.width;
            const originalHeight = img.height;
            const targetSize = 1024;
            
            let drawW, drawH;
            if (originalWidth > originalHeight) { drawW = targetSize; drawH = Math.round(originalHeight * (targetSize / originalWidth)); } 
            else { drawH = targetSize; drawW = Math.round(originalWidth * (targetSize / originalHeight)); }
            const offsetX = (targetSize - drawW) / 2;
            const offsetY = (targetSize - drawH) / 2;

            // --- DOUBLE PASS REFINEMENT ENGINE ---
            const masks: any[] = await Promise.all(processed.map(async (m: any, idx: number) => {
                const box = m.box_2d;
                addLog(`Refining piece ${idx+1} [${m.label}] via high-res crop...`, 'info');
                
                const bx_x = box[1] / 1000; const bx_y = box[0] / 1000;
                const bx_w = (box[3] - box[1]) / 1000; const bx_h = (box[2] - box[0]) / 1000;
                
                const cropUrl = await cropImage(imageUrl, bx_x, bx_y, bx_w, bx_h, 1024);
                const cropBase64 = cropUrl.split(',')[1];
                
                const refInstruction = `Edge Segmenter: Extract a highly precise binary mask (grayscale PNG) for the artifact in this crop. Return JSON: {"mask": "base64_png"}`;
                let refinedMaskData = '';
                
                const refData = await callGemini(usedModelName, refInstruction, cropBase64, 15000);
                if (refData && refData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    let refContent = refData.candidates[0].content.parts[0].text.trim();
                    if (refContent.includes('```')) refContent = refContent.match(/```(?:json)?([\s\S]*?)```/)?.[1] || refContent;
                    try {
                        const parsed = JSON.parse(refContent.trim());
                        refinedMaskData = parsed.mask.startsWith('data:image') ? parsed.mask : `data:image/png;base64,${parsed.mask}`;
                    } catch (e) {
                         addLog(`Vectorization failed for piece ${idx+1}, using base mask.`, 'warn');
                         refinedMaskData = m.mask.startsWith('data:image') ? m.mask : `data:image/png;base64,${m.mask}`;
                    }
                } else {
                    addLog(`Refinement pass ${idx+1} failed, falling back to base mask.`, 'warn');
                    refinedMaskData = m.mask.startsWith('data:image') ? m.mask : `data:image/png;base64,${m.mask}`;
                }

                const maskImg = await loadImage(refinedMaskData);
                const rcv = document.createElement('canvas');
                rcv.width = maskImg.width; rcv.height = maskImg.height;
                const rctx = rcv.getContext('2d', { willReadFrequently: true })!;
                rctx.drawImage(maskImg, 0, 0);
                const iData = rctx.getImageData(0, 0, rcv.width, rcv.height);
                const contour = findContour(iData);
                const simplified = simplifyContour(contour, 0.8);

                const x_pad = (box[1] / 1000) * targetSize; const y_pad = (box[0] / 1000) * targetSize;
                const w_pad = ((box[3] - box[1]) / 1000) * targetSize; const h_pad = ((box[2] - box[0]) / 1000) * targetSize;
                const x_orig = (x_pad - offsetX) * (originalWidth / drawW);
                const y_orig = (y_pad - offsetY) * (originalHeight / drawH);
                const w_orig = w_pad * (originalWidth / drawW);
                const h_orig = h_pad * (originalHeight / drawH);

                return {
                    x: x_orig / originalWidth, y: y_orig / originalHeight, 
                    width: w_orig / originalWidth, height: h_orig / originalHeight,
                    label: m.label,
                    maskWidth: maskImg.width, maskHeight: maskImg.height,
                    path: createCurvePath(simplified), points: simplified
                };
            }));
            
            updateOp({ progress: 90, stepLabel: 'Finalizing...' });
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks);
            const colorsResult = await extractGradientFromMask(imageUrl, masks[0], { width: img.width, height: img.height });

            updateOp({ progress: 95, stepLabel: 'Committing...' });
            setEngineStatus('committing');
            
            // Push to Supabase Persistence
            try {
                const { error } = await supabase
                    .from('inventory')
                    .update({
                        spatial_masks: masks, 
                        generated_png_url: pngData,
                        description: `Auto-segmented via Gemini: ${masks.length} layers found.`
                    })
                    .eq('id', item.id); // Use the UUID 'id' column for Supabase matching
                
                if (error) throw error;
                addLog(`Item ${item.itemId} persisted to Inventory DB.`, 'success');
            } catch (dbErr: any) {
                addLog(`Database Sync Error: ${dbErr.message}`, 'warn');
            }

            updateOp({ 
                status: 'completed', 
                progress: 100, 
                stepLabel: 'Success',
                result: { pngData, svgData, masks, colors: colorsResult }
            });
            setEngineStatus('completed');
            const newMaskLayers: ProcessLayer[] = masks.map((mask, i) => ({
                id: `MASK-${i}-${Math.random().toString(36).substr(2, 2).toUpperCase()}`,
                type: 'mask',
                data: { mask, color: colorsResult || '#6BCEBB' },
                visible: true,
                opacity: 0.8, // Increased opacity for better overlay representation
                rotation: 0,
                position: { x: 50, y: 50 },
                scale: 1,
                zIndex: i + 1
            }));
            
            if (opId === 'single') {
                setLayers(prev => [...prev.filter(l => l.type === 'image'), ...newMaskLayers]);
                addLog(`Engine found ${masks.length} segmentation layers. Applied to workspace center.`, 'success');
            }

            setInventoryVersion(v => v + 1);

        } catch (e: any) {
            setEngineStatus('error');
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
            addLog(`Engine Throttling: Waiting 2.5s for session stability...`, 'info');
            await new Promise(r => setTimeout(r, 2500));
        }
        updateProgress("BATCH COMPLETE", false);
        toast.success("Batch Sequence Finalized");
    };

    useEffect(() => {
        const key = getApiKey();
        addLog(`Inventory Processing Engine v1.27.1 Initialized`, 'success');
        addLog(`API Key Detect: ${key ? 'ACTIVE' : 'MISSING'}`, key ? 'info' : 'error');
        
        // Auto-Discovery Call
        const discoverModels = async () => {
             const currentKey = getApiKey();
             if (!currentKey || currentKey.length < 10) return;
             if (currentKey.startsWith('Alza')) {
                 addLog(`Security: API Key likely has a typo ('Alza' should be 'AIza'). Check capital 'I'.`, 'error');
             }
             try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentKey}`);
                if (!res.ok) {
                    const err = await res.json();
                    const msg = err.error?.message || 'Check Key Alignment';
                    addLog(`Library scan: ${res.status} ${msg}`, 'warn');
                    if (msg.includes('expired')) addLog(`Status: Your key is reported as EXPIRED. Re-generate in AI Studio.`, 'error');
                    return;
                }
                const data = await res.json();
                const modelNames = data.models?.map((m: any) => m.name.replace('models/', '')) || [];
                if (modelNames.length) addLog(`Engine Library Discovered: ${modelNames.slice(0, 4).join(', ')}...`, 'info');
             } catch (e) {
                addLog(`Library scan offline.`, 'warn');
             }
        };
        discoverModels();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowVault(false);
                setShowBatchList(false);
                setShowTerminal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
        // Sort by Z-Index
        [...layers].sort((a, b) => a.zIndex - b.zIndex).forEach(l => {
            if (!l.visible) return;
            ctx.save();
            ctx.translate(cv.width / 2, cv.height / 2);
            ctx.rotate((l.rotation || 0) * Math.PI / 180);
            
            const tx = (l.position.x - 50) * (cv.width / 100);
            const ty = (l.position.y - 50) * (cv.height / 100);
            ctx.translate(tx, ty);
            ctx.scale(l.scale || 1, l.scale || 1);

            if (l.type === 'image') {
                const { img } = l.data;
                const aspect = img.width / img.height;
                const h = cv.height * 0.7;
                const w = h * aspect;
                ctx.globalAlpha = l.opacity;
                ctx.drawImage(img, -w/2, -h/2, w, h);
            } else if (l.type === 'mask') {
                const { mask, color } = l.data;
                const baseLayer = layers.find(pl => pl.type === 'image');
                if (!baseLayer) { ctx.restore(); return; }
                
                const { img: baseImg } = baseLayer.data;
                const imgAspect = baseImg.width / baseImg.height;
                const h_display = cv.height * 0.7;
                const w_display = h_display * imgAspect;
                
                const maskDisplayX = (mask.x * w_display) - (w_display / 2);
                const maskDisplayY = (mask.y * h_display) - (h_display / 2);
                
                const path = new Path2D(mask.path);
                const scaleX = (mask.width * w_display) / mask.maskWidth;
                const scaleY = (mask.height * h_display) / mask.maskHeight;
                
                ctx.save();
                ctx.globalAlpha = l.opacity;
                ctx.translate(maskDisplayX, maskDisplayY);
                ctx.scale(scaleX, scaleY);
                ctx.fillStyle = color;
                ctx.fill(path);
                
                // Active stroke
                if (activeLayerId === l.id) {
                    ctx.strokeStyle = '(---main-color)';
                    ctx.lineWidth = 3 / scaleX;
                    ctx.stroke(path);
                } else {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1 / scaleX;
                    ctx.stroke(path);
                }
                ctx.restore();
            }
            ctx.restore();
        });

        // Render Refine Points
        refinePoints.forEach(p => {
             ctx.save();
             const px = (p.x * cv.width) / 100;
             const py = (p.y * cv.height) / 100;
             ctx.beginPath();
             ctx.arc(px, py, 6, 0, Math.PI * 2);
             ctx.fillStyle = p.type === 'pos' ? '#10b981' : '#f43f5e';
             ctx.fill();
             ctx.strokeStyle = 'white';
             ctx.lineWidth = 2;
             ctx.stroke();
             ctx.restore();
        });
    }, [layers, activeLayerId, refinePoints]);

    return (
        <div className="flex flex-col w-full h-full bg-transparent gap-4 overflow-hidden font-sans">
            {/* Autonomous Internal Header */}
            <header className="h-20 shrink-0 border-b border-white/5 flex items-center justify-between px-8 bg-black/20">
                <div className="flex flex-col">
                    <h1 className="text-[14px] font-black uppercase tracking-[0.4em]">Inventory Processing Engine</h1>
                    <span className="text-[8px] font-bold text-white/20 tracking-[0.2em]">STABLE GEN V1.2.9 · LOW LATENCY PIPELINE</span>
                </div>
                
                <div className="flex items-center gap-6">
                    <button onClick={() => setShowVault(true)} className="flex items-center gap-2 group transition-all">
                        <Library size={18} className="text-white/40 group-hover:text-(--main-color)" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20 group-hover:text-white">Inventory Vault</span>
                    </button>
                    <button onClick={() => setShowBatchList(true)} className="flex items-center gap-2 group transition-all">
                        <FolderKanban size={18} className="text-white/40 group-hover:text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20 group-hover:text-white">Batch Engine</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 flex gap-4 overflow-hidden relative">
                {/* Free-Floating Vertical Toolbar */}
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-8 z-20">
                    <button 
                        onClick={() => processItem('single')} 
                        disabled={!selectedItem || isProcessingGlobal}
                        className={`transition-all duration-500 ${isProcessingGlobal ? 'text-amber-400 animate-pulse' : 'text-(--main-color) hover:scale-125 hover:drop-shadow-[0_0_15px_var(--main-color)] active:scale-95'}`}
                        title="Analyze Artifact"
                    >
                        <Sparkles size={28} />
                    </button>
                    <button 
                        onClick={() => setTool('move')} 
                        className={`transition-all duration-300 ${tool === 'move' ? 'text-white drop-shadow-[0_0_10px_white]' : 'text-white/20 hover:text-white'}`}
                        title="Move Workspace"
                    >
                        <MousePointer2 size={24} />
                    </button>
                    <button 
                        onClick={() => setTool('mask')} 
                        className={`transition-all duration-300 ${tool === 'mask' ? 'text-white drop-shadow-[0_0_10px_white]' : 'text-white/20 hover:text-white'}`}
                        title="Segmentation Mask"
                    >
                        <Scissors size={24} />
                    </button>
                    <button 
                        onClick={() => setTool('point')} 
                        className={`transition-all duration-300 ${tool === 'point' ? 'text-(--main-color) drop-shadow-[0_0_10px_var(--main-color)]' : 'text-white/20 hover:text-white'}`}
                        title="AI Point Refinement (Click: Pos, Right-Click: Neg)"
                    >
                        <Target size={24} />
                    </button>
                    <div className="h-10 w-px bg-white/5 mx-auto" />
                    <button 
                        onClick={() => setLayers([])} 
                        className="text-rose-500/30 hover:text-rose-500 hover:scale-110 transition-all"
                        title="Clear Workspace"
                    >
                        <Trash2 size={24} />
                    </button>
                    <button 
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`transition-all duration-300 ${showTerminal ? 'text-emerald-400 drop-shadow-[0_0_10px_emerald-400]' : 'text-white/20 hover:text-white'}`}
                        title="Engine Terminal"
                    >
                        <Terminal size={24} />
                    </button>
                </div>

                <div className="flex-1 min-w-0 flex items-center justify-center bg-black/20 rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <canvas
                        ref={canvasRef} 
                        width={1600} 
                        height={1600}
                        onContextMenu={(e) => {
                            if (tool === 'point') {
                                e.preventDefault();
                                const r = canvasRef.current?.getBoundingClientRect();
                                if (r) {
                                    setRefinePoints(prev => [...prev, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, type: 'neg' }]);
                                }
                            }
                        }}
                        onMouseDown={(e) => { 
                            const r = canvasRef.current?.getBoundingClientRect();
                            if (!r) return;
                            const cx = ((e.clientX - r.left) / r.width) * 100;
                            const cy = ((e.clientY - r.top) / r.height) * 100;

                            if (tool === 'point') {
                                setRefinePoints(prev => [...prev, { x: cx, y: cy, type: 'pos' }]);
                                return;
                            }

                            if (tool === 'move') {
                                // Hit detection for layers (Front to Back)
                                const canvas = canvasRef.current!;
                                const ctx = canvas.getContext('2d')!;
                                const hitLayer = [...layers].sort((a,b) => b.zIndex - a.zIndex).find(l => {
                                    if (!l.visible || l.type !== 'mask') return false;
                                    const path = new Path2D(l.data.mask.path);
                                    
                                    // Translate coordinates to check hit in local space
                                    const mx = (cx - 50) * (canvas.width / 100);
                                    const my = (cy - 50) * (canvas.height / 100);
                                    
                                    const baseLayer = layers.find(pl => pl.type === 'image');
                                    if (!baseLayer) return false;
                                    const { img: baseImg } = baseLayer.data;
                                    const imgAspect = baseImg.width / baseImg.height;
                                    const h_disp = canvas.height * 0.7;
                                    const w_disp = h_disp * imgAspect;
                                    
                                    const mX = (l.data.mask.x * w_disp) - (w_disp / 2);
                                    const mY = (l.data.mask.y * h_disp) - (h_disp / 2);
                                    
                                    const sX = (l.data.mask.width * w_disp) / l.data.mask.maskWidth;
                                    const sY = (l.data.mask.height * h_disp) / l.data.mask.maskHeight;
                                    
                                    const localX = (mx - mX) / (sX * l.scale);
                                    const localY = (my - mY) / (sY * l.scale);
                                    
                                    return ctx.isPointInPath(path, localX, localY);
                                });

                                if (hitLayer) {
                                    setActiveLayerId(hitLayer.id);
                                }
                                
                                if (activeLayerId) {
                                    setIsDragging(true); 
                                    setDragStart({ x: e.clientX, y: e.clientY }); 
                                }
                            } 
                        }}
                        onMouseMove={(e) => {
                            if (!isDragging || !activeLayerId || tool !== 'move') return;
                            const r = canvasRef.current?.getBoundingClientRect();
                            if (!r) return;
                            const dx = ((e.clientX - dragStart.x) / r.width) * 100;
                            const dy = ((e.clientY - dragStart.y) / r.height) * 100;
                            setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, position: { x: l.position.x + dx, y: l.position.y + dy } } : l));
                            setDragStart({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        style={{ width: 'min(76vh, 76vw)', height: 'min(76vh, 76vw)', display: refiningLayerId ? 'none' : 'block' }}
                        className="bg-black/40 rounded-xl shadow-2xl z-10"
                    />

                    {refiningLayerId && (
                        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-8 overflow-hidden">
                             <div className="w-full max-w-4xl h-full flex flex-col gap-4">
                                 <div className="flex items-center justify-between">
                                     <SectionTitle title="Manual Edge Refinement" icon={Pipette} />
                                     <div className="flex items-center gap-3">
                                         <button 
                                            onClick={() => setRefiningLayerId(null)}
                                            className="px-4 py-2 rounded-lg bg-white/5 text-[10px] font-black uppercase hover:bg-white/10"
                                         >Cancel</button>
                                         <button 
                                            onClick={() => {
                                                if (maskEditorRef.current?.maskCanvas) {
                                                    const mask = toMask(maskEditorRef.current.maskCanvas);
                                                    setLayers(ls => ls.map(l => l.id === refiningLayerId ? { ...l, maskData: mask } : l));
                                                    setRefiningLayerId(null);
                                                    addLog(`Refined mask applied to layer ${refiningLayerId}`, 'success');
                                                }
                                            }}
                                            className="px-6 py-2 rounded-lg bg-(--main-color) text-black text-[10px] font-black uppercase"
                                         >Apply Changes</button>
                                     </div>
                                 </div>
                                 <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-white/10 relative">
                                    <MaskEditor 
                                        src={layers.find(l => l.type === 'image')?.data.src || ''}
                                        canvasRef={maskEditorRef}
                                        initialMask={layers.find(l => l.id === refiningLayerId)?.maskData}
                                        maskColor="#6BCEBB"
                                        maskOpacity={0.6}
                                        onDrawingChange={() => {}}
                                    />
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* Engine Telemetry Overlay */}
                    {isProcessingGlobal && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-500">
                             <div className="relative">
                                 <div className="w-32 h-32 rounded-full border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin" />
                                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-full backdrop-blur-md border border-white/5 shadow-2xl">
                                     <Activity size={24} className="text-(--main-color) animate-pulse mb-1" />
                                     <span className="text-[8px] font-black uppercase text-white tracking-[0.2em]">{engineStatus}</span>
                                 </div>
                             </div>
                             <div className="mt-8 px-6 py-2 bg-black/60 rounded-full border border-white/5 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-1">
                                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-(--main-color)">{activeStepLabel}</span>
                                 <div className="w-32 h-0.5 bg-white/5 rounded-full overflow-hidden">
                                     <div className="h-full bg-(--main-color) transition-all duration-500" style={{ 
                                         width: engineStatus === 'analyzing' ? '30%' : engineStatus === 'vectorizing' ? '70%' : engineStatus === 'committing' ? '90%' : '5%' 
                                     }} />
                                 </div>
                             </div>
                        </div>
                    )}
                </div>
                <aside className="w-80 h-full shrink-0 flex flex-col gap-4 relative overflow-hidden pr-2">
                    {/* Layer Properties Panel (Conditional) */}
                    {activeLayerId && (
                        <StitchCard className="shrink-0 flex flex-col gap-3 p-3 bg-black/40 border-white/5 overflow-hidden">
                            <SectionTitle title="Properties" icon={Palette} />
                            <div className="flex flex-col gap-3 mt-1">
                                {layers.find(l => l.id === activeLayerId)?.type === 'mask' && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Color</label>
                                        <div className="flex gap-2">
                                            {['#6BCEBB', '#F7941D', '#F36F21', '#a78bfa', '#FFFFFF'].map(c => (
                                                <button 
                                                    key={c}
                                                    onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, data: { ...l.data, color: c } } : l))}
                                                    className={`w-5 h-5 rounded-full border-2 ${layers.find(l => l.id === activeLayerId)?.data.color === c ? 'border-white' : 'border-transparent'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {refinePoints.length > 0 && (
                                     <div className="flex flex-col gap-2 p-2 bg-black/40 rounded-lg border border-(--main-color)/20">
                                         <button 
                                             onClick={() => processItem('single', refinePoints)}
                                             className="w-full py-2 bg-(--main-color) text-black text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-(--main-color)/20 active:scale-95 transition-all"
                                         >Refine via {refinePoints.length} Points</button>
                                         <button 
                                             onClick={() => setRefinePoints([])}
                                             className="w-full py-1 text-white/20 text-[8px] font-black uppercase hover:text-rose-400 transition-colors"
                                         >Reset Points</button>
                                     </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Opacity</label>
                                        <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={layers.find(l => l.id === activeLayerId)?.opacity || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, opacity: parseFloat(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Scale</label>
                                        <input 
                                            type="range" min="0.1" max="3" step="0.01" 
                                            value={layers.find(l => l.id === activeLayerId)?.scale || 1}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, scale: parseFloat(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Rotate</label>
                                        <input 
                                            type="range" min="-180" max="180" step="1" 
                                            value={layers.find(l => l.id === activeLayerId)?.rotation || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, rotation: parseInt(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Z-Order</label>
                                        <div className="flex gap-2">
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: Math.max(0, l.zIndex - 1) } : l))} className="flex-1 bg-white/5 hover:bg-white/10 rounded py-1 text-[8px] font-black">BACK</button>
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: l.zIndex + 1 } : l))} className="flex-1 bg-white/5 hover:bg-white/10 rounded py-1 text-[8px] font-black">FRONT</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </StitchCard>
                    )}
                    <StitchCard className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Layers</span>
                            <Badge>{layers.length}</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {layers.map(l => (
                                <div key={l.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${activeLayerId === l.id ? 'bg-white/5 border-(--main-color)/40 shadow-xl' : 'bg-transparent border-transparent hover:bg-white/2'}`}>
                                    <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button 
                                            onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, visible: !layer.visible } : layer))}
                                            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${l.visible ? 'text-(--main-color)' : 'text-white/10'}`}
                                            title="Toggle Visibility"
                                        >
                                            <Layers size={14} />
                                        </button>
                                        {l.type === 'mask' && (
                                            <button 
                                                onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, includeInOutput: !layer.includeInOutput } : layer))}
                                                className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${l.includeInOutput ? 'text-amber-400' : 'text-white/10'}`}
                                                title="Include in Output"
                                            >
                                                <Check size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div onClick={() => setActiveLayerId(l.id)} className="flex-1 flex items-center gap-3 cursor-pointer min-w-0">
                                        <div className="w-8 h-8 rounded-md bg-black/40 shrink-0 border border-white/5 overflow-hidden flex items-center justify-center relative">
                                            {l.type === 'image' && <img src={l.data.src} className="w-full h-full object-cover opacity-60" />}
                                            {l.type === 'mask' && <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: l.data.color }} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black text-white/80 uppercase italic truncate tracking-widest">{l.id.split('-').pop()}</p>
                                            <p className="text-[7px] text-white/20 uppercase font-bold">{l.type}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {l.type === 'mask' && (
                                            <button 
                                                onClick={() => setRefiningLayerId(l.id)}
                                                className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-white/20 hover:text-(--main-color) transition-all"
                                                title="Refine Edges"
                                            >
                                                <Pipette size={14} />
                                            </button>
                                        )}
                                        {activeLayerId === l.id && <div className="w-1 h-1 rounded-full bg-(--main-color) shadow-[0_0_5px_var(--main-color)]" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                            <button 
                                onClick={handleManualCommit}
                                disabled={isProcessingGlobal || layers.filter(l => l.type === 'mask' && l.includeInOutput).length === 0}
                                className="w-full py-2.5 rounded-lg bg-(--main-color)/10 text-(--main-color) text-[10px] font-black uppercase tracking-widest hover:bg-(--main-color) hover:text-black transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                            >
                                <Save size={12} />
                                Sync Selection
                            </button>
                        </div>
                    </StitchCard>

                    {showTerminal && (
                        <div className="absolute inset-0 z-10 flex flex-col">
                            <StitchCard className="flex-1 bg-black/90 backdrop-blur-3xl border-(--main-color)/20 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col p-4">
                                <div className="flex items-center justify-between mb-3 text-emerald-500">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">Engine Console</span>
                                            <button 
                                                onClick={() => {
                                                    const val = window.prompt("Enter Gemini API Key (Case-Sensitive):", getApiKey());
                                                    if (val !== null) {
                                                        localStorage.setItem('ONYX_GEMINI_KEY', val.trim());
                                                        window.location.reload();
                                                    }
                                                }}
                                                className="text-white/20 hover:text-(--main-color) transition-colors"
                                                title="Configure API Key"
                                            >
                                                <Bug size={10} />
                                            </button>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const text = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
                                                navigator.clipboard.writeText(text);
                                                toast.success("Logs copied to clipboard");
                                            }}
                                            className="w-6 h-6 flex items-center justify-center rounded-md bg-white/5 text-white/40 hover:text-white transition-all"
                                            title="Copy Logs"
                                        >
                                            <Download size={12} />
                                        </button>
                                    </div>
                                    <button onClick={() => setShowTerminal(false)} className="text-white/20 hover:text-white transition-all"><X size={14} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto pr-1 flex flex-col-reverse gap-2 text-[11px] font-mono leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    {logs.map(log => (
                                        <div key={log.id} className="group border-b border-white/5 pb-1 last:border-0 break-words">
                                            <span className="text-white/10 group-hover:text-white/30 mr-2 text-[9px]">[{log.time}]</span>
                                            <span className={
                                                log.type === 'error' ? 'text-rose-400 font-bold' : 
                                                log.type === 'success' ? 'text-emerald-400 font-bold' : 
                                                log.type === 'warn' ? 'text-amber-400' : 'text-white/60'
                                            }>
                                                {log.msg}
                                            </span>
                                        </div>
                                    ))}
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
                <div className="fixed inset-0 z-100 p-8 bg-[--app-bg]/95 backdrop-blur-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95">
                    <div className="w-full max-w-6xl flex flex-col h-full bg-[--stitch-card-bg] border border-white/5 rounded-2xl p-8">
                        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-8">
                                <SectionTitle title="Inventory Vault" icon={Library} />
                                <div className="flex bg-black/40 rounded-xl border border-white/5 p-1 gap-1">
                                    <input 
                                        type="text" 
                                        placeholder="Filter by Tag ID or Shape..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="bg-transparent text-[10px] font-bold text-white px-4 py-2 focus:outline-none w-64 uppercase tracking-widest placeholder:text-white/10"
                                    />
                                    {selectedIds.size > 0 && (
                                        <button 
                                            onClick={addSelectedToBatch}
                                            className="bg-[--main-color] text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <Play size={10} fill="black" />
                                            Add {selectedIds.size} to Batch
                                        </button>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setShowVault(false)} className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-white transition-all"><X size={24} /></button>
                        </div>

                        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                            {filteredItems.map(item => {
                                const isSelected = selectedIds.has(item.row);
                                return (
                                    <div 
                                        key={item.id} 
                                        className={`group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${isSelected ? 'border-[--main-color] ring-4 ring-[--main-color]/20 shadow-xl' : 'border-white/5 hover:border-white/20'}`}
                                    >
                                        <div 
                                            className="w-full h-full"
                                            onClick={() => {
                                                handleSelectItem(item);
                                            }}
                                        >
                                            <img 
                                                src={getCleanImageUrl(item.generatedPngUrl || item.mediaUrls?.split(',')[0])!} 
                                                className={`w-full h-full object-cover transition-all duration-500 ${isSelected ? 'scale-110' : 'grayscale group-hover:grayscale-0 group-hover:scale-105 opacity-40 group-hover:opacity-100'}`} 
                                            />
                                            
                                            {/* Status Badge */}
                                            {item.generatedPngUrl && (
                                                <div className="absolute top-2 left-2 z-10 flex gap-1 items-center">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse" />
                                                    <button 
                                                        onClick={(e) => handleClearResult(item, e)}
                                                        className="w-5 h-5 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                                                        title="Clear Result"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            )}
                                            
                                            {/* Tag Overlay */}
                                            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black via-black/40 to-transparent pointer-events-none group-hover:h-full transition-all duration-700" />
                                            <div className="absolute inset-x-0 bottom-0 p-2">
                                                <span className={`text-[8px] font-black uppercase tracking-tighter truncate block ${isSelected ? 'text-[--main-color]' : 'text-white/40 group-hover:text-white'}`}>
                                                    {item.itemId || `ID-${item.row}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Selection Indicator Area (Top Right) */}
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); toggleSelection(item.row); }}
                                            className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'bg-black/40 border-white/20 opacity-0 group-hover:opacity-100'}`}
                                        >
                                            {isSelected ? <Check size={12} className="text-black font-black" /> : <Box size={10} className="text-white/20" />}
                                        </div>

                                        {/* Quick Action Zap (Bottom Left) -- Only on Hover */}
                                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <div className="bg-(--main-color) text-black p-1 rounded-md shadow-lg">
                                                <Zap size={10} fill="black" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
