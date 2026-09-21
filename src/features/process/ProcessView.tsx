
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

/* The card asked for `bg-(--stitch-card-bg)/40`, a token that no longer
   exists, so the panels had no background at all; the backdrop-blur and the
   border-white/5 beside it are both flattened to the surface by SLAB. It is
   the module's panel, so it takes .proc-panel and its `raised` step. */
const StitchCard = ({ children, className = "", noPadding = false }: { children: React.ReactNode, className?: string, noPadding?: boolean }) => (
    <div className={`proc-panel ${noPadding ? '' : 'p-3'} ${className}`}>
        {children}
    </div>
);

/* The icon was `text-(--main-color)`: 1.7:1 on the light slab. Per the
   accessibility note the accent keeps fill and border and label ink comes
   from the slab, so the glyph drops to --proc-ink-dim and the title to ink. */
const SectionTitle = ({ title, icon: Icon }: { title: string, icon?: any }) => (
    <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
            <div className="proc-title-icon flex items-center">
                <Icon size={16} />
            </div>
        )}
        <h3 className="proc-title text-[11px] font-black uppercase tracking-[0.2em] truncate">{title}</h3>
    </div>
);

const Badge = ({ children, color = "main" }: { children: React.ReactNode, color?: "main" | "green" | "red" | "blue" }) => {
    /* A count is a readout, so the default tone is the muted (pressed) badge;
       the other three are meaning colour, which rides on the slab. */
    const tone = {
        main: "proc-badge--muted",
        green: "proc-badge--ok",
        red: "proc-badge--bad",
        blue: "proc-badge--muted"
    };
    return (
        <span className={`proc-badge proc-figures ${tone[color]} text-[9px] font-black uppercase tracking-widest`}>
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
    // processShowVaultAtom / processShowBatchListAtom were already imported at the
    // top of this file and already exist in atoms.tsx -- only the bindings were
    // missing, so every setShowVault / setShowBatchList call was a ReferenceError.
    const setShowVault = useSetAtom(processShowVaultAtom);
    const setShowBatchList = useSetAtom(processShowBatchListAtom);
    // The workspace tool is local editor state; there is no atom for it. Ids come
    // from the toolbar below: 'move' | 'mask' | 'point'.
    const [tool, setTool] = useState<'move' | 'mask' | 'point'>('move');
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
        /* The active-mask outline asked for the literal string '(---main-color)',
           which is not a colour, so canvas silently kept whatever strokeStyle was
           already set and the selected layer never got its accent. Read the token
           off the element instead — it is the same value on either ground. */
        const accentStroke = getComputedStyle(cv).getPropertyValue('--main-color').trim() || '#00bcd4';
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
                    ctx.strokeStyle = accentStroke;
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
            <div className="proc-empty">
                <ImageIcon size={56} strokeWidth={1} />
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">{tr("Initialize Workspace First")}</span>
            </div>
        );

        const images = selectedItem.mediaUrls?.split(',').map((u: string) => u.trim()).filter(Boolean) || [selectedItem.image_url].filter(Boolean);
        
        return (
            <div className="w-full h-full p-4 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                className="proc-gal group"
                            >
                                <img src={url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />

                                {/* The mask outline is the module's subject: data drawn over a
                                    photograph, so it keeps its hue on both grounds. */}
                                <svg className="proc-mask-overlay absolute inset-0 w-full h-full pointer-events-none opacity-50 group-hover:opacity-80 transition-opacity" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    {angleMasks.map((m: any, mIdx: number) => (
                                        <polygon key={mIdx} points={m.points.map((p: any) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="currentColor" />
                                    ))}
                                </svg>

                                <div className="proc-gal-caption">
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{tr("Angle")} {(idx + 1).toString().padStart(2, '0')}</span>
                                    <span className="text-[13px] font-black uppercase tracking-tight">{angleMasks.length} {tr("Masks")}</span>
                                </div>
                                <div className="proc-gal-open text-[9px] font-black uppercase tracking-widest">{tr("Open Editor")}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div id="process" className="process-view-container w-full h-full relative overflow-hidden">
            <main className="proc-main">
                {activeTab === 'workspace' && (
                    <div className="proc-workspace">
                        <div className="proc-stack">
             {/* Unified tools HUD. It used to be `absolute top-6 left-1/2` with
                 bg-black/40 + backdrop-blur-3xl over the canvas, which SLAB
                 flattens to an opaque slab sitting on top of the drawing. It is
                 now a docked row of the workspace column, above the stage. */}
                <div className="proc-hud">
                    <button
                        onClick={() => setWorkspaceViewMode(workspaceViewMode === 'editor' ? 'gallery' : 'editor')}
                        data-active={workspaceViewMode === 'gallery'}
                        className="proc-btn proc-toggle font-black text-[9px] uppercase tracking-widest"
                        title={tr("Toggle Gallery/Editor")}
                    >
                        {workspaceViewMode === 'gallery' ? <Target size={12} /> : <ImageIcon size={12} />}
                        <span>{workspaceViewMode === 'gallery' ? tr("Editor") : tr("Gallery")}</span>
                    </button>
                    <div className="proc-rule-v" />
                    {[
                        { id: 'move', icon: MousePointer2, title: tr("Move Workspace") },
                        { id: 'mask', icon: Scissors, title: tr("Segmentation Match") },
                        { id: 'point', icon: Target, title: tr("AI Refinement") }
                    ].map(t => (
                        <button key={t.id} onClick={() => setTool(t.id as any)} data-active={tool === t.id} aria-pressed={tool === t.id} className="proc-btn proc-key proc-toggle" title={t.title}>
                            <t.icon size={16} />
                        </button>
                    ))}
                    <div className="proc-rule-v" />
                    <button onClick={handleManualCommit} className="proc-btn font-black text-[9px] uppercase tracking-widest">
                        <Upload size={12} strokeWidth={2.5} />
                        <span>{tr("Sync")}</span>
                    </button>
                </div>
                <div className="proc-stage">
                    <div className="proc-grid" />
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
                        className="proc-canvas hdr-vibrant"
                    />

                    {/* Angle Navigator Strip */}
                    {selectedItem && (selectedItem.mediaUrls?.split(',').length || 0) > 1 && (
                        <div className="proc-anglebar">
                             {selectedItem.mediaUrls.split(',').map((u: string, i: number) => {
                                 const isActive = activeAngleIndex === i;
                                 const cleanUrl = getCleanImageUrl(u);
                                 return (
                                     <button
                                        key={i}
                                        onClick={() => switchAngle(i)}
                                        data-active={isActive}
                                        aria-pressed={isActive}
                                        className="proc-angle group"
                                        title={`${tr("Angle")} ${i + 1}`}
                                     >
                                         <img src={cleanUrl!} className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} />
                                         <span className="proc-angle-no text-[8px] font-black uppercase tracking-tighter">#{i+1}</span>
                                     </button>
                                 );
                             })}
                        </div>
                    )}

                    {refiningLayerId && (
                        <div className="proc-scrim z-30 flex flex-col items-center justify-center p-6 overflow-hidden">
                             <div className="w-full max-w-4xl h-full flex flex-col gap-3">
                                 <div className="flex items-center justify-between gap-3">
                                     <SectionTitle title={tr("Manual Edge Refinement")} icon={Pipette} />
                                     <div className="flex items-center gap-2">
                                         <button
                                            onClick={() => setRefiningLayerId(null)}
                                            className="proc-btn text-[10px] font-black uppercase"
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
                                            className="proc-btn-primary text-[10px] font-black uppercase"
                                         >{tr("Apply Changes")}</button>
                                     </div>
                                 </div>
                                 <div className="proc-maskwell flex-1 relative">
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
                        <div className="proc-telemetry animate-in fade-in duration-500">
                             <div className="relative">
                                 <div className="proc-spinner" />
                                 <div className="proc-spinner-face">
                                     <Activity size={22} className="proc-dim animate-pulse mb-1" />
                                     <span className="text-[8px] font-black uppercase tracking-[0.2em]">{engineStatus}</span>
                                 </div>
                             </div>
                             <div className="proc-telemetry-chip">
                                 <span className="text-[10px] font-black uppercase tracking-[0.4em]">{activeStepLabel}</span>
                                 <div className="proc-progress w-32">
                                     <div className="proc-progress-fill" style={{
                                         width: engineStatus === 'analyzing' ? '30%' : engineStatus === 'vectorizing' ? '70%' : engineStatus === 'committing' ? '90%' : '5%'
                                     }} />
                                 </div>
                             </div>
                        </div>
                    )}
                </div>
                        </div>
                <aside className="proc-aside">
                    {/* Layer Properties Panel (Conditional) */}
                    {activeLayerId && (
                        <StitchCard className="shrink-0 flex flex-col gap-2.5 overflow-hidden">
                            <SectionTitle title={tr("Properties")} icon={Palette} />
                            <div className="flex flex-col gap-2.5 mt-0.5">
                                {layers.find(l => l.id === activeLayerId)?.type === 'mask' && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="proc-dim text-[8px] font-black uppercase tracking-widest">{tr("Color")}</label>
                                        <div className="flex gap-2">
                                            {['#6BCEBB', '#F7941D', '#F36F21', '#a78bfa', '#FFFFFF'].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, data: { ...l.data, color: c } } : l))}
                                                    data-active={layers.find(l => l.id === activeLayerId)?.data.color === c}
                                                    className="proc-swatch-btn"
                                                    title={c}
                                                    /* The fill is the mask's own colour — data. It goes through a
                                                       custom property because SLAB repaints a hovered or ON button
                                                       with --slab-tint-on/-hover !important, which outranks an
                                                       inline background and would wash the swatch off the slab. */
                                                    style={{ ['--proc-swatch-fill' as any]: c, backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {refinePoints.length > 0 && (
                                     <div className="proc-well flex flex-col gap-2 p-2">
                                         <button
                                             onClick={() => processItem('single', refinePoints)}
                                             className="proc-btn-primary proc-figures w-full text-[9px] font-black uppercase tracking-widest"
                                         >{tr("Refine via")} {refinePoints.length} {tr("Points")}</button>
                                         <button
                                             onClick={() => setRefinePoints([])}
                                             className="proc-btn-quiet proc-btn-quiet--danger w-full justify-center text-[8px] font-black uppercase"
                                         >{tr("Reset Points")}</button>
                                     </div>
                                )}
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="proc-dim text-[8px] font-black uppercase tracking-widest">{tr("Opacity")}</label>
                                        <input
                                            type="range" min="0" max="1" step="0.01"
                                            value={layers.find(l => l.id === activeLayerId)?.opacity || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, opacity: parseFloat(e.target.value) } : l))}
                                            className="proc-range"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="proc-dim text-[8px] font-black uppercase tracking-widest">{tr("Scale")}</label>
                                        <input
                                            type="range" min="0.1" max="3" step="0.01"
                                            value={layers.find(l => l.id === activeLayerId)?.scale || 1}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, scale: parseFloat(e.target.value) } : l))}
                                            className="proc-range"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="proc-dim text-[8px] font-black uppercase tracking-widest">{tr("Rotate")}</label>
                                        <input
                                            type="range" min="-180" max="180" step="1"
                                            value={layers.find(l => l.id === activeLayerId)?.rotation || 0}
                                            onChange={(e) => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, rotation: parseInt(e.target.value) } : l))}
                                            className="proc-range"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="proc-dim text-[8px] font-black uppercase tracking-widest">{tr("Z-Order")}</label>
                                        <div className="flex gap-2">
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: Math.max(0, l.zIndex - 1) } : l))} className="proc-btn flex-1 text-[8px] font-black">{tr("BACK")}</button>
                                             <button onClick={() => setLayers(ls => ls.map(l => l.id === activeLayerId ? { ...l, zIndex: l.zIndex + 1 } : l))} className="proc-btn flex-1 text-[8px] font-black">{tr("FRONT")}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </StitchCard>
                    )}
                    <StitchCard className="flex-1 flex flex-col gap-3 overflow-hidden">
                        <div className="proc-divider-b flex items-center justify-between pb-2.5">
                            <span className="proc-dim text-[10px] font-black uppercase tracking-widest">{tr("Layers")}</span>
                            <Badge>{layers.length}</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                            {layers.map(l => (
                                <div key={l.id} className={`proc-layer ${activeLayerId === l.id ? 'is-active' : ''}`}>
                                    <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, visible: !layer.visible } : layer))}
                                            data-active={!!l.visible}
                                            aria-pressed={!!l.visible}
                                            className="proc-layer-flag"
                                            title={tr("Toggle Visibility")}
                                        >
                                            <Layers size={14} />
                                        </button>
                                        {l.type === 'mask' && (
                                            <button
                                                onClick={() => setLayers(ls => ls.map(layer => layer.id === l.id ? { ...layer, includeInOutput: !layer.includeInOutput } : layer))}
                                                data-active={!!l.includeInOutput}
                                                aria-pressed={!!l.includeInOutput}
                                                className="proc-layer-flag proc-layer-flag--out"
                                                title={tr("Include in Output")}
                                            >
                                                <Check size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div onClick={() => setActiveLayerId(l.id)} className="flex-1 flex items-center gap-2.5 cursor-pointer min-w-0">
                                        <div className="proc-layer-thumb">
                                            {l.type === 'image' && <img src={l.data.src} className="w-full h-full object-cover" />}
                                            {l.type === 'mask' && <span className="proc-swatch" style={{ color: l.data.color }} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="proc-title text-[9px] font-black uppercase italic truncate tracking-widest">{l.id.split('-').pop()}</p>
                                            <div className="proc-dim text-[9px] truncate">{l.type}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {l.type === 'mask' && (
                                            <button
                                                onClick={() => setRefiningLayerId(l.id)}
                                                className="proc-icon-btn"
                                                title={tr("Refine Edges")}
                                            >
                                                <Pipette size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="proc-divider-t pt-2 flex flex-col gap-2">
                            <button
                                onClick={handleManualCommit}
                                disabled={isProcessingGlobal || layers.filter(l => l.type === 'mask' && l.includeInOutput).length === 0}
                                className="proc-btn-primary w-full text-[10px] font-black uppercase tracking-widest"
                            >
                                <Save size={12} />
                                <span>{tr("Sync Selection")}</span>
                            </button>
                        </div>
                    </StitchCard>

                    {showTerminal && (
                        <div className="proc-terminal">
                            <div className="proc-divider-b flex items-center justify-between gap-2 pb-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <SectionTitle title={tr("Engine Console")} icon={Terminal} />
                                    <button
                                        onClick={() => {
                                            const val = window.prompt("Enter Gemini API Key (Case-Sensitive):", getApiKey());
                                            if (val !== null) {
                                                localStorage.setItem('ONYX_GEMINI_KEY', val.trim());
                                                window.location.reload();
                                            }
                                        }}
                                        className="proc-icon-btn"
                                        title={tr("Configure API Key")}
                                    >
                                        <Bug size={12} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const text = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
                                            navigator.clipboard.writeText(text);
                                            toast.success(tr("Logs copied to clipboard"));
                                        }}
                                        className="proc-icon-btn"
                                        title={tr("Copy Logs")}
                                    >
                                        <Download size={12} />
                                    </button>
                                </div>
                                <button onClick={() => setShowTerminal(false)} className="proc-icon-btn proc-icon-btn--danger" title={tr("Close")}><X size={14} /></button>
                            </div>
                            <div className="proc-log flex flex-col-reverse text-[10px] leading-relaxed">
                                {logs.map(log => (
                                    <div key={log.id} className="proc-log-row">
                                        <span className="proc-log-time text-[9px]">[{log.time}]</span>
                                        <span className={
                                            'proc-log-msg ' + (
                                                log.type === 'error' ? 'proc-log-msg--bad font-bold' :
                                                log.type === 'success' ? 'proc-log-msg--ok font-bold' :
                                                log.type === 'warn' ? 'proc-log-msg--warn' : ''
                                            )
                                        }>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
                </div>
                )}

                {activeTab === 'batch' && (
                    <div className="proc-workspace">
                         <div className="proc-batch">
                             <StitchCard className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
                                 <div className="proc-divider-b flex items-center justify-between gap-3 pb-2.5">
                                     <SectionTitle title={tr("Batch Pipeline")} icon={FolderKanban} />
                                     <div className="flex items-center gap-2">
                                         <button onClick={() => setBatchQueue([])} className="proc-btn-quiet proc-btn-quiet--danger text-[10px] font-bold uppercase">{tr("Clear Queue")}</button>
                                         <button onClick={() => setShowBatchList(false)} className="proc-btn proc-key" title={tr("Close")}>
                                              <X size={16} />
                                         </button>
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                     {batchQueue.map(op => (
                                         <div
                                             key={op.id}
                                             onClick={() => toggleBatchItemSelection(op.id)}
                                             className={`proc-op group ${op.selected ? 'is-selected' : ''}`}
                                         >
                                             <div className="proc-op-media">
                                                 <img src={getCleanImageUrl(op.item.activeImageUrl || op.item.mediaUrls?.split(',')[0])!} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity duration-500 hdr-vibrant" />

                                                 {/* Interactive Selection Checkbox */}
                                                 <div className="absolute top-2 left-2 z-20">
                                                     <div className={`proc-check ${op.selected ? 'is-on' : ''}`}>
                                                         {op.selected && <Check size={11} strokeWidth={4} />}
                                                     </div></div>

                                                 {op.status === 'processing' && (
                                                     <div className="proc-op-busy">
                                                         <div className="proc-spinner" />
                                                     </div>
                                                 )}
                                                 {op.status === 'completed' && (
                                                     <div className="proc-pip proc-pip--ok">
                                                         <CheckCircle2 size={12} />
                                                     </div>
                                                 )}
                                                 {op.status === 'failed' && (
                                                     <div className="proc-pip proc-pip--bad">
                                                         <AlertCircle size={12} />
                                                     </div>
                                                 )}
                                             </div>
                                             <div className="flex flex-col gap-1 min-w-0">
                                                  <div className="flex items-center justify-between gap-2">
                                                       <span className="proc-title text-[9px] font-black italic truncate uppercase">{op.item.itemId}</span>
                                                       {op.status === 'completed' && <span className="proc-badge proc-badge--ok text-[7px] font-black uppercase tracking-tighter shrink-0">{tr("DONE")}</span>}
                                                  </div>
                                                  <div className="proc-dim proc-figures flex items-center justify-between gap-2 text-[8px] font-bold uppercase">
                                                       <span className="truncate">{op.stepLabel}</span>
                                                       <span className="shrink-0">{op.progress}%</span>
                                                  </div>
                                                  <div className="proc-progress">
                                                       <div className={`proc-progress-fill ${op.status === 'completed' ? 'is-done' : ''}`} style={{ width: `${op.progress}%` }} />
                                                  </div>
                                             </div>
                                         </div>
                                     ))}
                                     {batchQueue.length === 0 && <div className="proc-empty col-span-full text-[10px] font-black uppercase tracking-[0.2em]">{tr("Queue Empty")}</div>}
                                 </div>

                                 <div className="flex gap-3">
                                      {!isProcessingGlobal || isAborted ? (
                                          <button
                                              onClick={runBatchSequence}
                                              disabled={isProcessingGlobal || batchQueue.length === 0}
                                              className="proc-btn-primary proc-btn-go text-[12px] font-black uppercase tracking-[0.3em]"
                                          ><span>{tr("Execute Batch Sequence")}</span></button>
                                      ) : (
                                          <button
                                              onClick={() => {
                                                  setIsAborted(true);
                                                  addLog("Termination signal sent to engine...", "warn");
                                              }}
                                              className="proc-btn-stop text-[12px] font-black uppercase tracking-[0.3em]"
                                          ><span>{tr("Stop Batch Sequence")}</span></button>
                                      )}
                                  </div>
                             </StitchCard>

                             {/* Shared Terminal in Sidebar */}
                             <aside className="proc-aside">
                                 <StitchCard className="proc-panel--well flex-1 flex flex-col gap-3 overflow-hidden">
                                     <div className="proc-divider-b flex items-center justify-between gap-2 pb-2.5">
                                         <SectionTitle title={tr("Live Engine")} icon={Terminal} />
                                         <div className="flex items-center gap-1">
                                              <button
                                                  onClick={() => {
                                                      const text = (logs || []).map((l: any) => `[${l.time}] ${l.msg}`).join('\n');
                                                      navigator.clipboard.writeText(text);
                                                      toast.success(tr("Telemetry logs copied"));
                                                  }}
                                                  className="proc-icon-btn"
                                                  title={tr("Copy All Progress Logs")}
                                              >
                                                  <Copy size={12} />
                                              </button>
                                              <button onClick={() => setLogs([])} className="proc-btn-quiet text-[8px] font-black uppercase">{tr("Clear")}</button>
                                          </div>
                                     </div>
                                     <div className="proc-log flex flex-col-reverse text-[9px]">
                                         {logs.map(log => (
                                             <div key={log.id} className="proc-log-row">
                                                 <span className="proc-log-time text-[9px]">[{log.time}]</span>
                                                 <span className={'proc-log-msg ' + (log.type === 'error' ? 'proc-log-msg--bad' : log.type === 'success' ? 'proc-log-msg--ok' : log.type === 'warn' ? 'proc-log-msg--warn' : '')}>{log.msg}</span>
                                             </div>
                                         ))}
                                     </div>
                                 </StitchCard>
                             </aside>
                         </div>
                    </div>
                )}

                {activeTab === 'vault' && (
                    <div className="proc-workspace flex-col">
                        <div className="flex flex-col gap-3 h-full max-w-[1800px] mx-auto w-full min-h-0">
                            <div className="proc-segbar">
                                    <button
                                        onClick={() => setVaultFilter('ALL')}
                                        data-active={vaultFilter === 'ALL'}
                                        aria-pressed={vaultFilter === 'ALL'}
                                        className="proc-seg text-[10px] font-black uppercase tracking-widest"
                                    ><span>{tr("All Data")}</span></button>
                                    <button
                                        onClick={() => setVaultFilter('STORE')}
                                        data-active={vaultFilter === 'STORE'}
                                        aria-pressed={vaultFilter === 'STORE'}
                                        className="proc-seg text-[10px] font-black uppercase tracking-widest"
                                    ><span>{tr("Store List")}</span></button>
                                    <button
                                        onClick={() => setVaultFilter('INVENTORY')}
                                        data-active={vaultFilter === 'INVENTORY'}
                                        aria-pressed={vaultFilter === 'INVENTORY'}
                                        className="proc-seg text-[10px] font-black uppercase tracking-widest"
                                    ><span>{tr("Inventory Tracker")}</span></button>

                                    <div className="proc-rule-v mx-1" />

                                    <div className="relative group min-w-0">
                                        <Search size={14} className="proc-dim absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder={tr("FILTER TAG ID...")}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="proc-input proc-input--search w-56 max-w-full text-[10px] font-bold uppercase tracking-widest"
                                        />
                                    </div>

                                    {selectedIds.size > 0 && (
                                        <button
                                            onClick={addSelectedToBatch}
                                            className="proc-btn-primary proc-figures ml-auto text-[10px] font-black uppercase tracking-widest"
                                        >
                                            <Play size={10} />
                                            <span>{tr("Add")} {selectedIds.size} to Batch</span>
                                        </button>
                                    )}
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-1">
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
                                            className={`proc-vault-row group ${isSelected ? 'is-selected' : ''}`}
                                        >
                                            {/* Selection Checkbox */}
                                            <div
                                                className="proc-vault-check"
                                                onClick={(e) => { e.stopPropagation(); toggleSelection(item.row); }}
                                            >
                                                <div className={`proc-check proc-check--lg ${isSelected ? 'is-on' : ''}`}>
                                                    {isSelected && <Check size={13} strokeWidth={4} />}
                                                </div>
                                            </div>

                                            <div className="proc-vault-media"
                                                onClick={() => handleSelectItem(item)}>
                                                <img
                                                    src={getCleanImageUrl(item.mediaUrls?.split(',')[0] || item.generatedPngUrl)!}
                                                    className="hdr-vibrant"
                                                />
                                            </div>

                                            <div className="flex-1 flex flex-wrap items-center px-4 gap-x-6 gap-y-1 min-w-0" onClick={() => handleSelectItem(item)}>
                                                <div className="flex flex-col shrink-0 min-w-[140px] py-1">
                                                    <div className="flex items-baseline gap-3">
                                                        <h3 className="proc-title text-[13px] font-black uppercase tracking-tight whitespace-nowrap">{item.shape || tr("OBJ")} {item.shortDescription && <span className="proc-dim font-black ml-1 text-[9px] uppercase tracking-widest">{item.shortDescription}</span>}</h3>
                                                    </div>
                                                    <div className="proc-dim text-[9px] uppercase tracking-[0.2em] font-black whitespace-nowrap mt-0.5">{[item.color, item.material].filter(Boolean).join(' ')}</div>
                                                </div>

                                                <div className="flex flex-col min-w-[70px] shrink-0">
                                                    <span className="proc-vault-label text-[8px] font-black uppercase leading-none mb-1">{tr("Ident")}</span>
                                                    <span className="proc-chip text-[10px] font-black uppercase tracking-tight w-fit">
                                                        {item.itemId || `N/A`}
                                                    </span>
                                                </div>

                                                <div className="flex flex-col min-w-[120px] shrink-0">
                                                    <span className="proc-vault-label text-[8px] font-black uppercase leading-none mb-1">{tr("Metrics")}</span>
                                                    <div className="proc-figures flex flex-col gap-0.5 font-mono">
                                                        <span className="proc-title text-[9px]">{dim}</span>
                                                        <span className="proc-dim text-[9px]">{wg}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col min-w-[120px] shrink-0 ml-auto items-end pr-2">
                                                    <span className="proc-vault-label text-[8px] font-black uppercase leading-none mb-1.5">{tr("Engine Data")}</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasData ? (
                                                            <div className="proc-badge proc-badge--ok text-[9px] font-black uppercase tracking-widest">
                                                                <Check strokeWidth={3} size={10} /> {tr("Valid")}
                                                            </div>
                                                        ) : (
                                                            <div className="proc-badge proc-badge--muted text-[9px] font-black uppercase tracking-widest">
                                                                {tr("Empty")}
                                                            </div>
                                                        )}
                                                        {item.generatedPngUrl && (
                                                            <button
                                                                onClick={(e) => handleClearResult(item, e)}
                                                                className="proc-icon-btn proc-icon-btn--danger"
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
