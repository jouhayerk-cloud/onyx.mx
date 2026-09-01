
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
    SelectedItemDataAtom,
    isDummyModeAtom,
    storeInventoryAtom,
    processActiveTabAtom,
    activeViewAtom
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
    Copy,
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
    Terminal,
    Upload,
    Target,
    Zap,
    Activity,
    FolderKanban,
    Bug
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tr } from '../../lib/i18n';

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
    selected?: boolean;
    retryCount?: number;
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
    const storeInventory = useAtomValue(storeInventoryAtom);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const selectedItemData = useAtomValue(SelectedItemDataAtom);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [batchQueue, setBatchQueue] = useState<BatchOperation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [vaultFilter, setVaultFilter] = useState<'ALL' | 'STORE' | 'INVENTORY'>('ALL');
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);
    const [showTerminal, setShowTerminal] = useAtom(processShowTerminalAtom);

    const analyzeTrigger = useAtomValue(processTriggerAnalyzeAtom);
    const batchTrigger = useAtomValue(processTriggerBatchAtom);
    const [activeStepLabel, setActiveStepLabel] = useAtom(processActiveStepLabelAtom);
    const [isProcessingGlobal, setIsProcessingGlobal] = useAtom(processIsProcessingAtom);
    const [engineStatus, setEngineStatus] = useState<'idle' | 'analyzing' | 'vectorizing' | 'committing' | 'completed' | 'error'>('idle');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isAborted, setIsAborted] = useState(false);
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
    const [activeAngleIndex, setActiveAngleIndex] = useState(0);
    const [workspaceViewMode, setWorkspaceViewMode] = useState<'editor' | 'gallery'>('editor');
    const [refinePoints, setRefinePoints] = useState<{ x: number, y: number, type: 'pos' | 'neg' }[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<ProcessLayer[]>([]);
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const combined = [...inventory, ...storeInventory];
        const unique = Array.from(new Map(combined.map(item => [item.id || item.row, item])).values());
        
        // Sort newest first (by row ID descending)
        unique.sort((a, b) => (Number(b.row) || 0) - (Number(a.row) || 0));

        setInventoryItems(unique.map(item => ({ 
            ...normalizeInventoryData(item.data || item), 
            id: item.data?.id || item.id || item.row,
            row: item.row, 
            source: item.source || 'inventory'
        })));
    }, [inventory, storeInventory]);

    const filteredItems = useMemo(() => {
        const s = searchTerm.toLowerCase();
        let items = inventoryItems;
        if (vaultFilter === 'STORE') {
            items = items.filter(i => ['AVAILABLE', 'SOLD', 'RESERVED'].includes(i.status?.toUpperCase() || '') || i.source === 'production');
        } else if (vaultFilter === 'INVENTORY') {
            items = items.filter(i => !['AVAILABLE', 'SOLD', 'RESERVED'].includes(i.status?.toUpperCase() || '') && i.source !== 'production');
        }
        return items.filter(item => !s || item.itemId?.toLowerCase().includes(s) || item.shape?.toLowerCase().includes(s));
    }, [inventoryItems, searchTerm, vaultFilter]);

    /* --- Handlers --- */

    const switchAngle = useCallback(async (angleIndex: number, itemToUse?: any) => {
        const item = itemToUse || selectedItem;
        if (!item) return;

        const urls = item.mediaUrls?.split(',').map((u: string) => u.trim()).filter(Boolean) || [];
        const imageUrl = getCleanImageUrl(urls[angleIndex] || item.generatedPngUrl);

        if (imageUrl) {
            updateProgress(`Loading Angle ${angleIndex + 1}...`, true);
            setActiveAngleIndex(angleIndex);
            
            try {
                const img = await loadImage(imageUrl);
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
                let currentAngleMasks = [];
                
                if (Array.isArray(savedMasks)) {
                    // Legacy support: Only apply to angle 0 if it's an array
                    currentAngleMasks = angleIndex === 0 ? savedMasks : [];
                } else if (typeof savedMasks === 'object') {
                    // Modern support: Object keyed by angle_N
                    currentAngleMasks = savedMasks[`angle_${angleIndex}`] || [];
                }

                const savedLayers: ProcessLayer[] = currentAngleMasks.map((m: any, i: number) => ({
                    id: `MASK-${angleIndex}-${i}-${m.label || 'layer'}`,
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
                updateProgress('Ready', false);
                addLog(`Engine Workspace: Angle ${angleIndex + 1} Loaded (${savedLayers.length} masks)`, 'success');
            } catch (err: any) {
                addLog(`Angle load error: ${err.message}`, 'error');
                updateProgress('Idle', false);
            }
        }
    }, [selectedItem, addLog]);

    const handleSelectItem = useCallback((item: any) => {
        setSelectedItem(item);
        setActiveTab('workspace');
        switchAngle(0, item);
    }, [switchAngle]);

    const addToBatch = useCallback(async (item: any) => {
        let urls = item.mediaUrls?.split(',').map((u: string) => u.trim()).filter(Boolean) || [];
        
        // Fetch fresh status to check for persistence if we don't have it
        const savedMasks = item.spatialMasks || item.spatial_masks || {};
        const masksByAngle = typeof savedMasks === 'object' && !Array.isArray(savedMasks) ? savedMasks : { angle_0: Array.isArray(savedMasks) ? savedMasks : [] };

        urls.forEach((url: string, idx: number) => {
            const opId = `OP-${item.id}-${idx}-${Math.random().toString(36).substr(2, 2).toUpperCase()}`;
            if (batchQueue.some(op => op.id === opId)) return;
            
            const isDone = !!(masksByAngle[`angle_${idx}`] && masksByAngle[`angle_${idx}`].length > 0);
            
            setBatchQueue(prev => [...prev, {
                id: opId,
                item: { ...item, activeImageUrl: getCleanImageUrl(url) },
                status: isDone ? 'completed' : 'idle',
                progress: isDone ? 100 : 0,
                selected: !isDone, // Auto-deselect if already done
                stepLabel: isDone ? 'Verified: Done' : (idx === 0 ? 'Primary Angle' : `Angle ${idx + 1}`)
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

    const toggleBatchItemSelection = (opId: string) => {
        setBatchQueue(prev => prev.map(op => op.id === opId ? { ...op, selected: !op.selected } : op));
    };

    const toggleAllBatchSelection = (selected: boolean) => {
        setBatchQueue(prev => prev.map(op => ({ ...op, selected })));
    };

    const handleClearResult = async (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Clear all AI-generated masks and PNG assets for ${item.itemId}?`)) return;
        try {
            if (isDummyMode) {
                addLog(`Asset purge simulated for ${item.itemId} (Demo Mode)`, 'warn');
                toast.success(tr("Assets cleared (Demo Mode)"), { icon: '🧪' });
                return;
            }
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
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1200));
                addLog(`Commit simulated for workspace (Demo Mode)`, 'success');
                setInventoryVersion(v => v + 1);
                setEngineStatus('completed');
                toast.success(tr("Design Saved (Demo Mode)"), { icon: '🧪' });
                return;
            }
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
            toast.success(tr("Database Updated"));
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
            addLog(`Using Model: Hybrid Trace (v1/v1beta Fallback Engaged)`, 'info');

            const imageUrl = item.activeImageUrl || getCleanImageUrl(item.mediaUrls?.split(',')[0]);
            if (!imageUrl) throw new Error("Missing source image");

            updateOp({ progress: 15, stepLabel: 'Resizing...' });
            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];

            updateOp({ progress: 30, stepLabel: 'Analyzing...' });
            setEngineStatus('analyzing');
            let instruction = `Give the segmentation masks for this ${item.shape} Onyx artifact. Instructions: If it is a bowl or basin, strictly extract and separate the 'rim', 'interior' (inside depth), and 'exterior' (outer wall) as separate masks. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "string"}]`;
            
            if (forcedPoints.length > 0) {
                 const pStr = forcedPoints.map(p => `[${Math.round(p.y * 10)}, ${Math.round(p.x * 10)}, ${p.type === 'pos' ? 'POSITIVE' : 'NEGATIVE'}]`).join(', ');
                 instruction = `REFINEMENT MODE: Use these guidance points: ${pStr}. Extract the mask for the object associated with POSITIVE points and EXCLUDE areas with NEGATIVE points. Output JSON: [{"box_2d": [ymin, xmin, ymax, xmax], "mask": "base64_png", "label": "refined"}]`;
            }
            
            // Raw Fetch Diagnostic Conduit (to unmask 400 errors)
            let resultText = '';
            let usedModelName = '';

            const callGemini = async (modelId: string, prompt: string, imgData: string, timeoutMs: number = 40000) => {
                if (isAborted) return null;
                
                // Optimized conduit: prioritize known versions, fallback to v1beta for newer models
                const versions = availableModels.length > 0 ? ['v1beta', 'v1'] : ['v1beta', 'v1']; 
                
                for (const version of versions) {
                    if (isAborted) return null;
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
                        
                        // Detect and report 404 (Model naming/version mismatch)
                        if (res.status === 404) continue;

                        // Handle Model Overload (503) or Rate Limits (429) - require backoff
                        if (res.status === 503 || res.status === 429) {
                            addLog(`${modelId} busy (${res.status}). Cooling down...`, 'warn');
                            await new Promise(r => setTimeout(r, 2000));
                            continue;
                        }
                        
                        const err = await res.json().catch(() => ({}));
                        addLog(`${modelId} Rejected: ${res.status}`, 'warn');
                    } catch (e: any) {
                        clearTimeout(timeoutId);
                        if (e.name === 'AbortError') {
                            addLog(`${modelId} timed out (${timeoutMs/1000}s).`, 'warn');
                        }
                    }
                }
                return null;
            };

            // Intelligent Fallback: Only try models likely to succeed based on discovery or stability
            const modelsToTry = [
                ...availableModels.filter(m => m.includes('flash') || m.includes('pro')).slice(0, 3),
                "gemini-2.0-flash", 
                "gemini-1.5-flash",
                "gemini-1.5-pro"
            ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

            for (const modelId of modelsToTry) {
                if (isAborted) break;
                addLog(`Requesting Trace: ${modelId}...`, 'info');
                
                // Faster initial timeout for fallback attempts to avoid long "hang"
                const data = await callGemini(modelId, instruction, base64, 25000);
                
                if (data && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    resultText = data.candidates[0].content.parts[0].text;
                    usedModelName = modelId;
                    break;
                }
                await new Promise(r => setTimeout(r, 1000));
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
                
                const refData = await callGemini(usedModelName, refInstruction, cropBase64, 60000);
                if (refData && refData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    let refContent = refData.candidates[0].content.parts[0].text.trim();
                    if (refContent.includes('```')) refContent = refContent.match(/```(?:json)?([\s\S]*?)```/)?.[1] || refContent;
                    try {
                        const parsed = JSON.parse(refContent.trim());
                        refinedMaskData = parsed.mask.startsWith('data:image') ? parsed.mask : `data:image/png;base64,${parsed.mask}`;
                    } catch (e) {
                         addLog(`Vectorization truncated for piece ${idx+1}.`, 'warn');
                    }
                }

                if (!refinedMaskData || refinedMaskData.length < 1000) {
                     addLog(`Invalid refinement for piece ${idx+1}, using base mask.`, 'warn');
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
                if (isDummyMode) {
                    await new Promise(r => setTimeout(r, 1000));
                    addLog(`Item ${item.itemId} persistence simulated (Demo Mode).`, 'success');
                } else {
                    // Detect if this is part of a multi-angle batch
                    const angleMatch = opId.match(/-(\d+)-[A-Z0-9]+$/);
                    const angleIdx = angleMatch ? parseInt(angleMatch[1], 10) : 0;
                    
                    // Fetch existing spatial_masks so we don't overwrite other angles
                    const { data: dbData } = await supabase.from('inventory').select('spatial_masks').eq('id', item.id).single();
                    let currentMasks = dbData?.spatial_masks || {};
                    if (Array.isArray(currentMasks)) {
                        // Inherit old single-array masks to angle 0
                        currentMasks = { angle_0: currentMasks };
                    }
                    
                    currentMasks[`angle_${angleIdx}`] = masks;

                    const { error } = await supabase
                        .from('inventory')
                        .update({
                            spatial_masks: currentMasks, 
                            generated_png_url: pngData, // This will be the last processed image
                            description: `Auto-segmented multi-angle via Gemini: Angle ${angleIdx} committed.`
                        })
                        .eq('id', item.id);
                    
                    if (error) throw error;
                    addLog(`Item ${item.itemId} (Angle ${angleIdx}) persisted to Inventory DB.`, 'success');
                }
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
            toast.error(tr("Processing Error"));
        }
    };

    const runBatchSequence = async () => {
        setIsAborted(false);
        updateProgress("BATCH STARTING");
        const queue = batchQueue.filter(op => op.selected && op.status !== 'completed');
        
        for (const op of queue) {
            if (isAborted) {
                addLog("Batch Sequence Aborted by user.", "warn");
                break;
            }

            let attempts = 0;
            const maxAttempts = 3;
            let currentSuccess = false;
            
            while (!currentSuccess && attempts < maxAttempts) {
                if (isAborted) break;
                attempts++;
                if (attempts > 1) addLog(`Retry ${attempts-1} for ${op.item.itemId}...`, 'info');
                
                await processItem(op.id);
                
                // Verify success by checking the atom state (must be set in processItem)
                // Since processItem updates batchQueue atom, we check the result in place
                const latestOp = batchQueue.find(o => o.id === op.id);
                if (latestOp?.status === 'completed') {
                    currentSuccess = true;
                } else {
                    await new Promise(r => setTimeout(r, 3000)); // Backoff before retry
                }
            }

            if (isAborted) break;
            addLog(`Engine Cooling: Waiting for session stability...`, 'info');
            await new Promise(r => setTimeout(r, 2000));
        }
        
        updateProgress(isAborted ? "TERMINATED" : "BATCH COMPLETE", false);
        toast[isAborted ? 'error' : 'success'](isAborted ? "Sequence Stopped" : "Batch Sequence Finalized");
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
                if (modelNames.length) {
                    setAvailableModels(modelNames);
                    addLog(`Engine Library Discovered: ${modelNames.slice(0, 4).join(', ')}...`, 'info');
                }
             } catch (e) {
                addLog(`Library scan offline.`, 'warn');
             }
        };
        discoverModels();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Handled by global navigation or specific modal logic if needed
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

    // --- GALLERY COMPONENT ---
    const MultiAngleGallery = () => {
        if (!selectedItem) return (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/10 gap-4">
                <ImageIcon size={64} strokeWidth={1} />
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">{tr("Initialize Workspace First")}</span>
            </div>
        );

        const images = selectedItem.mediaUrls?.split(',').map((u: string) => u.trim()).filter(Boolean) || [selectedItem.image_url].filter(Boolean);
        
        return (
            <div className="w-full h-full p-8 overflow-y-auto no-scrollbar bg-black/20">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {images.map((url: string, idx: number) => {
                        const angleKey = `angle_${idx}`;
                        const savedMasks = selectedItem.spatialMasks || selectedItem.spatial_masks || {};
                        const angleMasks = (typeof savedMasks === 'object' && !Array.isArray(savedMasks)) 
                            ? (savedMasks[angleKey] || []) 
                            : (idx === 0 ? (Array.isArray(savedMasks) ? savedMasks : []) : []);
                        
                        return (
                            <div 
                                key={idx}
                                onClick={() => {
                                    switchAngle(idx);
                                    setWorkspaceViewMode('editor');
                                }}
                                className="group relative aspect-square bg-white/5 rounded-2xl overflow-hidden border border-white/5 hover:border-amber-400/50 transition-all cursor-pointer"
                            >
                                <img src={url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                
                                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    {angleMasks.map((m: any, mIdx: number) => (
                                        <polygon key={mIdx} points={m.points.map((p: any) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="currentColor" className="text-amber-400" />
                                    ))}
                                </svg>

                                <div className="absolute bottom-4 left-4 flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Angle")} {(idx + 1).toString().padStart(2, '0')}</span>
                                    <span className="text-[14px] font-black text-white uppercase tracking-tight">{angleMasks.length} {tr("Masks")}</span>
                                </div>
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="px-3 py-1.5 bg-amber-400 text-black text-[9px] font-black uppercase tracking-widest rounded-full">{tr("Open Editor")}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="process-view-container w-full h-full bg-transparent flex flex-col relative overflow-hidden">
             {/* Unified Tools Header (Minimal floating HUD for Engine Workspace) */}
             {activeTab === 'workspace' && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1 bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 shadow-2xl z-50 animate-in slide-in-from-top-4 duration-500">
                    <button 
                        onClick={() => setWorkspaceViewMode(workspaceViewMode === 'editor' ? 'gallery' : 'editor')}
                        className={`h-9 px-4 flex items-center gap-2 font-black text-[9px] uppercase tracking-widest rounded-lg transition-all duration-300 ${workspaceViewMode === 'gallery' ? 'bg-amber-400 text-black' : 'text-white/30 hover:text-white hover:bg-white/5 border border-white/5'}`}
                        title={tr("Toggle Gallery/Editor")}
                    >
                        {workspaceViewMode === 'gallery' ? <Target size={12} /> : <ImageIcon size={12} />}
                        {workspaceViewMode === 'gallery' ? tr("Editor") : tr("Gallery")}
                    </button>
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    {[
                        { id: 'move', icon: MousePointer2, title: tr("Move Workspace") },
                        { id: 'mask', icon: Scissors, title: tr("Segmentation Match") },
                        { id: 'point', icon: Target, title: tr("AI Refinement") }
                    ].map(t => (
                        <button key={t.id} onClick={() => setTool(t.id as any)} className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${tool === t.id ? 'bg-white text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`} title={t.title}>
                            <t.icon size={16} />
                        </button>
                    ))}
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button onClick={handleManualCommit} className="h-9 px-4 flex items-center gap-2 text-green-400 font-black text-[9px] uppercase tracking-widest hover:bg-green-400/10 rounded-lg transition-all">
                        <Upload size={12} strokeWidth={2.5} />
                        {tr("Sync")}
                    </button>
                </div>
            )}

            <main className="flex-1 overflow-hidden relative">
                {activeTab === 'workspace' && (
                    <div className="absolute inset-0 flex gap-4 p-4 overflow-hidden">
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
                        className="max-w-full max-h-full shadow-2xl hdr-vibrant bg-black/40 rounded-xl z-10"
                    />

                    {/* Angle Navigator Strip */}
                    {selectedItem && (selectedItem.mediaUrls?.split(',').length || 0) > 1 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl z-40 animate-in slide-in-from-bottom-10 fade-in duration-700">
                             {selectedItem.mediaUrls.split(',').map((u: string, i: number) => {
                                 const isActive = activeAngleIndex === i;
                                 const cleanUrl = getCleanImageUrl(u);
                                 return (
                                     <button 
                                        key={i}
                                        onClick={() => switchAngle(i)}
                                        className={`group relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all duration-500 scale-vibrant ${isActive ? 'border-(--main-color) ring-4 ring-(--main-color)/20' : 'border-white/5 opacity-40 hover:opacity-100'}`}
                                     >
                                         <img src={cleanUrl!} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                         <div className={`absolute inset-0 bg-(--main-color)/10 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                                         <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[8px] font-black text-white uppercase tracking-tighter shadow-lg">#{i+1}</div>
                                     </button>
                                 );
                             })}
                        </div>
                    )}

                    {refiningLayerId && (
                        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-8 overflow-hidden">
                             <div className="w-full max-w-4xl h-full flex flex-col gap-4">
                                 <div className="flex items-center justify-between">
                                     <SectionTitle title={tr("Manual Edge Refinement")} icon={Pipette} />
                                     <div className="flex items-center gap-3">
                                         <button 
                                            onClick={() => setRefiningLayerId(null)}
                                            className="px-4 py-2 rounded-lg bg-white/5 text-[10px] font-black uppercase hover:bg-white/10"
                                         >{tr("Cancel")}</button>
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
                                         >{tr("Apply Changes")}</button>
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
                            <SectionTitle title={tr("Properties")} icon={Palette} />
                            <div className="flex flex-col gap-3 mt-1">
                                {layers.find(l => l.id === activeLayerId)?.type === 'mask' && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">{tr("Color")}</label>
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
                                         >{tr("Refine via")} {refinePoints.length} {tr("Points")}</button>
                                         <button 
                                             onClick={() => setRefinePoints([])}
                                             className="w-full py-1 text-white/20 text-[8px] font-black uppercase hover:text-rose-400 transition-colors"
                                         >{tr("Reset Points")}</button>
                                     </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">{tr("Opacity")}</label>
                                        <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={layers.find(l => l.id === activeLayerId)?.opacity || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, opacity: parseFloat(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">{tr("Scale")}</label>
                                        <input 
                                            type="range" min="0.1" max="3" step="0.01" 
                                            value={layers.find(l => l.id === activeLayerId)?.scale || 1}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, scale: parseFloat(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">{tr("Rotate")}</label>
                                        <input 
                                            type="range" min="-180" max="180" step="1" 
                                            value={layers.find(l => l.id === activeLayerId)?.rotation || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, rotation: parseInt(e.target.value) } : l))}
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none accent-(--main-color)"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20">{tr("Z-Order")}</label>
                                        <div className="flex gap-2">
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: Math.max(0, l.zIndex - 1) } : l))} className="flex-1 bg-white/5 hover:bg-white/10 rounded py-1 text-[8px] font-black">{tr("BACK")}</button>
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: l.zIndex + 1 } : l))} className="flex-1 bg-white/5 hover:bg-white/10 rounded py-1 text-[8px] font-black">{tr("FRONT")}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </StitchCard>
                    )}
                    <StitchCard className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{tr("Layers")}</span>
                            <Badge>{layers.length}</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {layers.map(l => (
                                <div key={l.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${activeLayerId === l.id ? 'bg-white/5 border-(--main-color)/40 shadow-xl' : 'bg-transparent border-transparent hover:bg-white/2'}`}>
                                    <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button 
                                            onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, visible: !layer.visible } : layer))}
                                            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${l.visible ? 'text-(--main-color)' : 'text-white/10'}`}
                                            title={tr("Toggle Visibility")}
                                        >
                                            <Layers size={14} />
                                        </button>
                                        {l.type === 'mask' && (
                                            <button 
                                                onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, includeInOutput: !layer.includeInOutput } : layer))}
                                                className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${l.includeInOutput ? 'text-amber-400' : 'text-white/10'}`}
                                                title={tr("Include in Output")}
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
                                            <div className="text-[10px] text-white/40 line-clamp-2 wrap-break-word px-1 mt-auto">{l.type}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {l.type === 'mask' && (
                                            <button 
                                                onClick={() => setRefiningLayerId(l.id)}
                                                className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-white/20 hover:text-(--main-color) transition-all"
                                                title={tr("Refine Edges")}
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
                                {tr("Sync Selection")}
                            </button>
                        </div>
                    </StitchCard>

                    {showTerminal && (
                        <div className="absolute inset-0 z-10 flex flex-col">
                            <StitchCard className="flex-1 bg-black/90 backdrop-blur-3xl border-(--main-color)/20 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col p-4">
                                <div className="flex items-center justify-between mb-3 text-emerald-500">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest">{tr("Engine Console")}</span>
                                            <button 
                                                onClick={() => {
                                                    const val = window.prompt("Enter Gemini API Key (Case-Sensitive):", getApiKey());
                                                    if (val !== null) {
                                                        localStorage.setItem('ONYX_GEMINI_KEY', val.trim());
                                                        window.location.reload();
                                                    }
                                                }}
                                                className="text-white/20 hover:text-(--main-color) transition-colors"
                                                title={tr("Configure API Key")}
                                            >
                                                <Bug size={10} />
                                            </button>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const text = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
                                                navigator.clipboard.writeText(text);
                                                toast.success(tr("Logs copied to clipboard"));
                                            }}
                                            className="w-6 h-6 flex items-center justify-center rounded-md bg-white/5 text-white/40 hover:text-white transition-all"
                                            title={tr("Copy Logs")}
                                        >
                                            <Download size={12} />
                                        </button>
                                    </div>
                                    <button onClick={() => setShowTerminal(false)} className="text-white/20 hover:text-white transition-all"><X size={14} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto pr-1 flex flex-col-reverse gap-2 text-[11px] font-mono leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    {logs.map(log => (
                                        <div key={log.id} className="group border-b border-white/5 pb-1 last:border-0 wrap-break-word">
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
                </div>
                )}

                {activeTab === 'batch' && (
                    <div className="absolute inset-x-0 bottom-0 top-0 bg-(--app-bg)/60 backdrop-blur-md flex p-4 z-60 animate-in slide-in-from-bottom-full overflow-hidden">
                         <div className="flex gap-4 w-full max-w-7xl mx-auto flex-1 h-full">
                             <StitchCard className="flex-1 flex flex-col gap-6 overflow-hidden">
                                 <div className="flex items-center justify-between">
                                     <SectionTitle title={tr("Batch Pipeline")} icon={FolderKanban} />
                                     <div className="flex items-center gap-3">
                                         <button onClick={() => setBatchQueue([])} className="px-4 py-2 border border-white/5 rounded-lg text-[10px] font-bold text-white/30 hover:text-red-400">{tr("Clear Queue")}</button>
                                         <button onClick={() => setShowBatchList(false)} className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white">
                                              <X size={20} />
                                         </button>
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-4 lg:grid-cols-5 gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                     {batchQueue.map(op => (
                                         <div 
                                             key={op.id} 
                                             onClick={() => toggleBatchItemSelection(op.id)}
                                             className={`p-2 bg-black/20 rounded-xl border flex flex-col gap-2 relative group hover:border-white/20 transition-all cursor-pointer ${op.selected ? 'border-(--main-color)/40 ring-1 ring-(--main-color)/10 shadow-[0_0_15px_rgba(107,206,187,0.05)]' : 'border-white/5 opacity-50 gray-scale hover:opacity-80'}`}
                                         >
                                             <div className="aspect-video rounded-lg bg-black overflow-hidden border border-white/5 relative">
                                                 <img src={getCleanImageUrl(op.item.activeImageUrl || op.item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700 hdr-vibrant" />
                                                 
                                                 {/* Interactive Selection Checkbox */}
                                                 <div className="absolute top-2 left-2 z-20">
                                                     <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${op.selected ? 'bg-(--main-color) border-(--main-color)' : 'bg-black/40 border-white/20'}`}>
                                                         {op.selected && <Check size={10} className="text-black" strokeWidth={4} />}
                                                     </div></div>
                                                 
                                                 {op.status === 'processing' && (
                                                     <div className="absolute inset-0 flex items-center justify-center bg-black/60 shadow-inner">
                                                         <div className="w-8 h-8 rounded-full border-2 border-(--main-color)/20 border-t-(--main-color) animate-spin" />
                                                     </div>
                                                 )}
                                                 {op.status === 'completed' && (
                                                     <div className="absolute top-2 right-2 bg-emerald-500 rounded-full p-1 shadow-lg shadow-emerald-500/20">
                                                         <CheckCircle2 size={12} className="text-white" />
                                                     </div>
                                                 )}
                                                 {op.status === 'failed' && <AlertCircle size={16} className="absolute top-2 right-2 text-rose-500 drop-shadow-lg" />}
                                             </div>
                                             <div className="flex flex-col gap-1">
                                                  <div className="flex items-center justify-between">
                                                       <span className="text-[9px] font-black text-white italic truncate uppercase">{op.item.itemId}</span>
                                                       {op.status === 'completed' && <span className="text-[7px] font-black text-emerald-400 uppercase tracking-tighter ml-2">{tr("DONE")}</span>}
                                                  </div>
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
                                     {batchQueue.length === 0 && <div className="col-span-full h-full flex items-center justify-center text-[10px] font-black uppercase text-white/10 tracking-[0.2em]">{tr("Queue Empty")}</div>}
                                 </div>

                                 <div className="flex gap-4">
                                      {!isProcessingGlobal || isAborted ? (
                                          <button 
                                              onClick={runBatchSequence} 
                                              disabled={isProcessingGlobal || batchQueue.length === 0} 
                                              className="flex-1 py-5 rounded-2xl bg-(--main-color) text-black text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-(--main-color)/20 disabled:grayscale disabled:opacity-20 active:scale-[0.98] transition-all"
                                          >{tr("Execute Batch Sequence")}</button>
                                      ) : (
                                          <button 
                                              onClick={() => {
                                                  setIsAborted(true);
                                                  addLog("Termination signal sent to engine...", "warn");
                                              }} 
                                              className="flex-1 py-5 rounded-2xl bg-rose-500 text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-rose-500/20 active:scale-[0.98] transition-all animate-pulse"
                                          >{tr("Stop Batch Sequence")}</button>
                                      )}
                                  </div>
                             </StitchCard>

                             {/* Shared Terminal in Sidebar */}
                             <aside className="w-72 flex flex-col gap-4">
                                 <StitchCard className="flex-1 bg-black/40 flex flex-col gap-4 overflow-hidden">
                                     <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                         <div className="flex items-center gap-2 text-emerald-400">
                                            <Terminal size={14} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">{tr("Live Engine")}</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                              <button 
                                                  onClick={() => {
                                                      const text = (logs || []).map((l: any) => `[${l.time}] ${l.msg}`).join('\n');
                                                      navigator.clipboard.writeText(text);
                                                      toast.success(tr("Telemetry logs copied"));
                                                  }}
                                                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-(--main-color) transition-all"
                                                  title={tr("Copy All Progress Logs")}
                                              >
                                                  <Copy size={12} />
                                              </button>
                                              <button onClick={() => setLogs([])} className="text-[8px] font-black uppercase text-white/20 hover:text-white transition-colors">{tr("Clear")}</button>
                                          </div>
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

                {activeTab === 'vault' && (
                    <div className="w-full flex flex-col h-full overflow-hidden p-6 lg:p-10">
                        <div className="flex flex-col gap-6 h-full max-w-[1800px] mx-auto w-full">
                            <div className="flex items-center justify-between border-b border-white/5 pb-6">
                                <div className="flex bg-black/40 rounded-xl border border-white/5 p-1 gap-1">
                                    <button 
                                        onClick={() => setVaultFilter('ALL')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${vaultFilter === 'ALL' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                    >{tr("All Data")}</button>
                                    <button 
                                        onClick={() => setVaultFilter('STORE')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${vaultFilter === 'STORE' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                    >{tr("Store List")}</button>
                                    <button 
                                        onClick={() => setVaultFilter('INVENTORY')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${vaultFilter === 'INVENTORY' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                    >{tr("Inventory Tracker")}</button>
                                    
                                    <div className="w-px h-6 bg-white/10 mx-2 self-center" />
                                    
                                    <div className="relative group">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-(--main-color) transition-colors" />
                                        <input 
                                            type="text" 
                                            placeholder={tr("FILTER TAG ID...")} 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="bg-transparent text-[10px] font-bold text-white pl-9 pr-4 py-2 focus:outline-none w-64 uppercase tracking-widest placeholder:text-white/10 border-0"
                                        />
                                    </div>
                                    
                                    {selectedIds.size > 0 && (
                                        <button 
                                            onClick={addSelectedToBatch}
                                            className="ml-auto bg-(--main-color) text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <Play size={10} fill="black" />
                                            {tr("Add")} {selectedIds.size} to Batch
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-1">
                                {filteredItems.map(item => {
                                    const isSelected = selectedIds.has(item.row);
                                    let dim = '—';
                                    if (item.widthCm && item.heightCm && item.lengthCm) {
                                      dim = `${item.widthCm}x${item.heightCm}x${item.lengthCm}CM`;
                                    }
                                    let wg = '—';
                                    if (item.weightKg) wg = `${item.weightKg}KG`;
                                    const hasData = item.generatedPngUrl || item.spatial_masks || item.spatialMasks || item.glbUrl;

                                    return (
                                        <div 
                                            key={item.id} 
                                            className={`flex items-stretch shrink-0 min-h-[90px] overflow-hidden bg-(--sidebar-bg) border rounded-md hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isSelected ? 'ring-1 ring-(--main-color)/30 border-(--main-color)/30' : 'border-white/5'}`}
                                        >
                                            {/* Selection Checkbox */}
                                            <div 
                                                className="w-12 shrink-0 flex items-center justify-center border-r border-white/5 bg-white/2 hover:bg-white/5 transition-all"
                                                onClick={(e) => { e.stopPropagation(); toggleSelection(item.row); }}
                                            >
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'border-white/20'}`}>
                                                    {isSelected && <Check size={14} className="text-black" strokeWidth={4} />}
                                                </div>
                                            </div>

                                            <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-black/40 relative overflow-hidden" 
                                                onClick={() => handleSelectItem(item)}>
                                                <img 
                                                    src={getCleanImageUrl(item.mediaUrls?.split(',')[0] || item.generatedPngUrl)!} 
                                                    className={`w-full h-full object-cover transition-all hdr-vibrant ${isSelected ? '' : 'group-hover:scale-105 opacity-80 group-hover:opacity-100'}`} 
                                                />
                                            </div>

                                            <div className="flex-1 flex items-center px-6 gap-8 min-w-0" onClick={() => handleSelectItem(item)}>
                                                <div className="flex flex-col shrink-0 min-w-[140px] py-1">
                                                    <div className="flex items-baseline gap-3">
                                                        <h3 className="text-sm font-black text-(--text-color) uppercase tracking-tight whitespace-nowrap">{item.shape || tr("OBJ")} {item.shortDescription && <span className="opacity-40 font-black ml-1 text-[9px] uppercase tracking-widest">{item.shortDescription}</span>}</h3>
                                                    </div>
                                                    <div className="text-[9px] text-(--text-color)/30 uppercase tracking-[0.2em] font-black whitespace-nowrap mt-1">{[item.color, item.material].filter(Boolean).join(' ')}</div>
                                                </div>
                                                
                                                <div className="flex flex-col min-w-[70px] shrink-0">
                                                    <span className="text-[8px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none mb-1">{tr("Ident")}</span>
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px] font-black uppercase tracking-tight w-fit">
                                                        {item.itemId || `N/A`}
                                                    </span>
                                                </div>

                                                <div className="flex flex-col min-w-[120px] shrink-0">
                                                    <span className="text-[8px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none mb-1">{tr("Metrics")}</span>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[9px] font-mono text-(--text-color)/60">{dim}</span>
                                                        <span className="text-[9px] font-mono text-(--text-color)/40">{wg}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col min-w-[120px] shrink-0 ml-auto items-end pr-4">
                                                    <span className="text-[8px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none mb-2">{tr("Engine Data")}</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasData ? (
                                                            <div className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                                                <Check strokeWidth={3} size={10} /> {tr("Valid")}
                                                            </div>
                                                        ) : (
                                                            <div className="px-2 py-0.5 rounded text-[9px] font-black bg-white/5 text-white/40 uppercase tracking-widest">
                                                                {tr("Empty")}
                                                            </div>
                                                        )}
                                                        {item.generatedPngUrl && (
                                                            <button 
                                                                onClick={(e) => handleClearResult(item, e)}
                                                                className="w-5 h-5 rounded hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                                                title={tr("Clear Engine Result")}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
