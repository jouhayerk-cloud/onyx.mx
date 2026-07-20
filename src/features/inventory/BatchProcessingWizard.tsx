import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { createPortal } from 'react-dom';
import { 
    isBatchWizardOpenAtom, 
    batchWizardItemsAtom, 
    inventoryAtom, 
    InventoryVersionAtom,
    userAtom
} from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { getCleanImageUrl, resizeImage, handleProcessedFileUpload, loadImage, cropImage, findContour, simplifyContour, createCurvePath, generatePngAndSvgFromMasks, preprocessForMasking, applyAlphaMask } from '../../lib/utils';
import { X, Play, Loader2, CheckCircle2, AlertCircle, Sparkles, Settings2, UploadCloud, Cloud, Cpu, ZoomIn, ZoomOut, Save, RefreshCw, Bot, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { removeBackground } from '@imgly/background-removal';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { collectAllImages, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';

const resolveVendorColor = (inputStr: string | undefined | null) => {
    if (!inputStr) return '#ffffff';
    const upper = inputStr.toUpperCase();
    const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
    // Try matching by exact name first
    const nameMatch = vKeys.find(k => (vendors as any)[k].name.toUpperCase() === upper);
    if (nameMatch) return (vendors as any)[nameMatch].color;
    // Then try matching by prefix (for Tag IDs)
    const vPre = vKeys.find(k => upper.startsWith(k));
    return vPre ? (vendors as any)[vPre].color : '#ffffff';
};

interface BatchOp {
    id: string;
    item: any;
    imageIndex?: number;
    imageUrl?: string;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    processingMode?: 'local' | 'cloud';
    skipImageProcessing?: boolean;
    result?: {
        description?: string;
        maskUrl?: string;
    };
}

const getApiKey = () => {
    const key = localStorage.getItem('ONYX_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const clean = String(key).trim().replace(/['"]/g, '');
    return (clean === 'null' || clean === 'undefined') ? '' : clean;
};



export const BatchProcessingWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isBatchWizardOpenAtom);
    const [batchItems, setBatchItems] = useAtom(batchWizardItemsAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const [user] = useAtom(userAtom);
    
    const [queue, setQueue] = useState<BatchOp[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAborted, setIsAborted] = useState(false);
    const cancelTokens = useRef<Record<string, boolean>>({});
    const [overallProgress, setOverallProgress] = useState(0);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showApiModal, setShowApiModal] = useState(false);
    const apiInputRef = useRef<HTMLInputElement>(null);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [xlsxUrl, setXlsxUrl] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isGeneratingXlsx, setIsGeneratingXlsx] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isSavingDb, setIsSavingDb] = useState(false);
    const [pdfBrand, setPdfBrand] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');

    const saveApiKey = () => {
        if (apiInputRef.current?.value) {
            localStorage.setItem('ONYX_GEMINI_KEY', apiInputRef.current.value);
            setShowApiModal(false);
            handleStartBatch();
        }
    };

    useEffect(() => {
        if (isOpen && batchItems.length > 0) {
            const newQueue: BatchOp[] = [];
            batchItems.forEach(item => {
                const norm = normalizeInventoryData(item.data || item);
                const images = collectAllImages(norm);
                const processedMediaStr = String(norm.processed_media_urls || '').trim();
                let processedMap: Record<string, string> = {};
                if (processedMediaStr) {
                    if (processedMediaStr.startsWith('{')) {
                        try {
                            processedMap = JSON.parse(processedMediaStr);
                        } catch(e) {}
                    } else {
                        const arr = processedMediaStr.split(',').map(s => s.trim());
                        images.forEach((img, idx) => {
                            processedMap[img] = arr[idx] || (idx === 0 ? arr[0] : undefined);
                        });
                    }
                }
                
                if (images.length === 0) {
                    const hasAI = !!norm.detailed_description;
                    newQueue.push({
                        id: String(item.id || item.row),
                        item,
                        imageIndex: 0,
                        imageUrl: '',
                        status: hasAI ? 'completed' : 'idle',
                        progress: hasAI ? 100 : 0,
                        logs: hasAI ? ['[  OK  ] Loaded saved AI content'] : ['[ WAIT ] Ready for AI processing'],
                        processingMode: 'local',
                        skipImageProcessing: true,
                        result: hasAI ? { description: norm.detailed_description } : undefined
                    });
                } else {
                    images.forEach((imgUrl, idx) => {
                        const maskUrl = processedMap[imgUrl] || undefined;
                        const hasAI = !!(norm.detailed_description || maskUrl);
                        newQueue.push({
                            id: `${item.id || item.row}_img${idx}`,
                            item,
                            imageIndex: idx,
                            imageUrl: imgUrl,
                            status: hasAI ? 'completed' : 'idle',
                            progress: hasAI ? 100 : 0,
                            logs: hasAI ? ['[  OK  ] Loaded saved AI content'] : ['[ WAIT ] Ready for AI processing'],
                            processingMode: 'local',
                            skipImageProcessing: false,
                            result: hasAI ? {
                                description: norm.detailed_description,
                                maskUrl: maskUrl
                            } : undefined
                        });
                    });
                }
            });
            setQueue(newQueue);
        } else if (!isOpen) {
            setQueue([]);
            setIsProcessing(false);
            setIsAborted(false);
            setOverallProgress(0);
            setHasUnsavedChanges(false);
            if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            setXlsxUrl(null);
            setPdfUrl(null);
            setIsGeneratingXlsx(false);
            setIsGeneratingPdf(false);
        }
    }, [isOpen, batchItems]);

    const updateOp = (id: string, updates: Partial<BatchOp> | ((prev: BatchOp) => Partial<BatchOp>)) => {
        setQueue(prev => prev.map(op => op.id === id ? { ...op, ...(typeof updates === 'function' ? updates(op) : updates) } : op));
    };

    const logOp = (id: string, text: string) => {
        updateOp(id, prev => ({ logs: [...prev.logs, text] }));
    };

    const callGemini = async (prompt: string, imgData: string, timeoutMs: number = 40000, modelId: string = "gemini-2.5-flash") => {
        const API_KEY = getApiKey();
        if (!API_KEY) throw new Error("API Key missing");
        
        // Use v1beta endpoint for 1.5-flash since some accounts might not have it exposed on v1
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ 
                    parts: [
                        { text: prompt }, 
                        { inlineData: { mimeType: 'image/jpeg', data: imgData } }
                    ] 
                }] 
            })
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 400 && err?.error?.message?.includes('API key not valid')) {
                localStorage.removeItem('ONYX_GEMINI_KEY');
                throw new Error("Invalid API Key! Please click the Settings icon above to provide a valid key.");
            }
            throw new Error(`API Error: ${res.status} ${err?.error?.message || ''}`);
        }
        return await res.json();
    };

    const checkAbort = async <T,>(id: string, promise: Promise<T>, timeoutMs?: number): Promise<T> => {
        let interval: NodeJS.Timeout;
        let timeout: NodeJS.Timeout;
        const abortPromise = new Promise<T>((_, reject) => {
            interval = setInterval(() => {
                if (cancelTokens.current[id]) {
                    clearInterval(interval);
                    if (timeout) clearTimeout(timeout);
                    reject(new Error("Cancelled by user"));
                }
            }, 500);
            if (timeoutMs) {
                timeout = setTimeout(() => {
                    clearInterval(interval);
                    reject(new Error("Timeout processing image"));
                }, timeoutMs);
            }
        });
        try {
            return await Promise.race([promise, abortPromise]);
        } finally {
            if (interval!) clearInterval(interval);
            if (timeout!) clearTimeout(timeout);
        }
    };

    const processSingleItem = async (op: BatchOp) => {
        if (cancelTokens.current[op.id]) return;
        updateOp(op.id, { status: 'processing', progress: 10 });
        logOp(op.id, '[ WAIT ] Resizing image...');
        try {
            const itemData = op.item.data || op.item;
            const rawImageUrl = op.imageUrl || getCleanImageUrl(op.item.generatedPngUrl || itemData.generatedPngUrl || op.item.imageUrl || itemData.mediaUrls?.split(',')[0]);
            const imageUrl = getCleanImageUrl(rawImageUrl);
            if (!imageUrl) throw new Error("No image found for item");

            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];
            logOp(op.id, '[  OK  ] Image resized successfully');

            let processed = { description: op.result?.description || '' };
            if ((op.imageIndex || 0) === 0 && !processed.description) {
                updateOp(op.id, { progress: 30 });
                logOp(op.id, '[ WAIT ] Analyzing via Gemini...');
                
                const shape = itemData.shape || 'Artifact';
                const type = itemData.shortDescription || itemData.type || 'Object';
                const material = itemData.material || 'Onyx';
                
                const prompt = `FIND the ${material} ${shape} ${type}. 
Generate a short, title-style description (maximum 1 sentence) of the item.

CRITICAL RULES for the description:
- Keep it concise, like a product title.
- Do NOT use the word 'lamp'. ALL lamps MUST be described as 'Luminarie' or 'Luminaries'.

Examples of the desired style:
- Rectangular White Onyx Wall Luminarie pair with green banding running in the center.
- Aqua Onyx Cylinder Luminarie with Rustic open top aqua band in center.
- Round Pink Onyx mirror with brown banding.

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here..."
}`;

                const data = await callGemini(prompt, base64);
                logOp(op.id, '[  OK  ] Received Gemini response');
                
                let resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!resultText) throw new Error("Empty response from AI");
                
                updateOp(op.id, { progress: 70 });
                logOp(op.id, '[ WAIT ] Parsing results...');
                
                if (resultText.includes('```')) {
                    const match = resultText.match(/```(?:json)?([\s\S]*?)```/);
                    if (match) resultText = match[1].trim();
                    else resultText = resultText.replace(/```(json)?|```/g, '').trim();
                }
                
                processed = JSON.parse(resultText);
                if (!processed.description) {
                    throw new Error("Invalid output format from AI");
                }
                logOp(op.id, '[  OK  ] Parsing complete');
            } else {
                updateOp(op.id, { progress: 70 });
                logOp(op.id, '[  OK  ] Using primary item description');
            }

            let localMaskUrl = null;
            if (!op.skipImageProcessing) {
                if (op.processingMode === 'cloud') {
                    logOp(op.id, '[ WAIT ] Running Cloud AI for segmentation...');
                const itemData = op.item.data || op.item;
                const shape = itemData.shape || 'object';
                // Pass 1: Only ask for bounding boxes, NOT masks! Asking for multiple base64 masks in one pass blows past the 8192 token limit!
                const instruction = `Find the primary, central ${shape} Onyx artifact in the image. Ignore any other artifacts in the background or corners.
Instructions: 
1. Focus ONLY on the artifact closest to the center of the image.
2. If it is a bowl, basin, or canoe, strictly extract and separate the 'rim', 'interior', and 'exterior' of that central artifact ONLY. 
3. CRITICAL: You MUST include the natural, rough, or unpolished outer rock edges as part of the artifact. Do NOT crop out or ignore the rough edges (e.g. the bark-like exterior or rustic edges of bowls and canoes). 
4. For MIRRORS, the SOLID ONYX MIRROR FRAME is your absolute priority. You MUST output exactly TWO objects:
   - 1. A bounding box labeled 'mirror_frame' that encompasses the entire stone frame (outer edge).
   - 2. A polygon labeled 'mirror_glass' that tightly traces the exact inner boundary where the onyx frame meets the center glass reflection. 
   - CRITICAL for mirror_glass: Provide a 'polygon' array of at least 20 [y, x] coordinates (normalized 0-1000) tracing the natural, irregular inner rugged edge of the stone frame. This polygon will be used to cut out the center reflection.
   - Completely EXCLUDE cardboard on the floor, people holding the mirror, and any reflections of the floor/people visible INSIDE the mirror glass from your consideration.
Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "string", "polygon": [[y,x], ...]}].`;

                try {
                    // Use the latest 2.5 model for unparalleled detection logic
                    const data = await callGemini(instruction, base64, 40000, "gemini-2.5-flash");
                    let resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!resultText) throw new Error("Empty response from Engine");
                    
                    if (resultText.includes('```')) {
                        const match = resultText.match(/```(?:json)?([\s\S]*?)```/);
                        if (match) resultText = match[1].trim();
                        else resultText = resultText.replace(/```(json)?|```/g, '').trim();
                    }
                    
                    const processed = JSON.parse(resultText);
                    logOp(op.id, `[  OK  ] Found ${processed.length} layers. Refining...`);

                    const img = await loadImage(imageUrl);
                    const originalWidth = img.width;
                    const originalHeight = img.height;
                    const targetSize = 1024;
                    
                    let drawW, drawH;
                    if (originalWidth > originalHeight) { drawW = targetSize; drawH = Math.round(originalHeight * (targetSize / originalWidth)); } 
                    else { drawH = targetSize; drawW = Math.round(originalWidth * (targetSize / originalHeight)); }
                    const offsetX = (targetSize - drawW) / 2;
                    const offsetY = (targetSize - drawH) / 2;

                    const masks: any[] = [];
                    for (let idx = 0; idx < processed.length; idx++) {
                        if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");
                        const m = processed[idx];
                        updateOp(op.id, { progress: 15 + ((idx/processed.length) * 75), stepLabel: `Extracting Mask ${idx+1}/${processed.length}...` });
                        
                        if (m.polygon && m.polygon.length > 0) {
                            const pts = m.polygon.map((pt: any[]) => {
                                const raw_px = pt[1] / 1000;
                                const raw_py = pt[0] / 1000;
                                return {
                                    x: (raw_px * targetSize - offsetX) / drawW,
                                    y: (raw_py * targetSize - offsetY) / drawH
                                };
                            });
                            masks.push({
                                label: m.label,
                                x: 0, y: 0,
                                width: 1, height: 1,
                                maskWidth: 1,
                                maskHeight: 1,
                                path: createCurvePath(pts)
                            });
                            logOp(op.id, `[  OK  ] Extracted ${m.label} polygon from Gemini directly`);
                            continue;
                        }

                        const box = m.box_2d;
                        if (!box) continue;
                        
                        const raw_x = box[1] / 1000; const raw_y = box[0] / 1000;
                        const raw_w = (box[3] - box[1]) / 1000; const raw_h = (box[2] - box[0]) / 1000;
                        
                        // Gemini's coordinates are relative to a 1024x1024 letterboxed canvas
                        // We must map them back to the original image's coordinate space
                        const norm_x = (raw_x * targetSize - offsetX) / drawW;
                        const norm_y = (raw_y * targetSize - offsetY) / drawH;
                        const norm_w = (raw_w * targetSize) / drawW;
                        const norm_h = (raw_h * targetSize) / drawH;
                        
                        const PAD = 0.15; // 15% padding to catch natural rough edges
                        const bx_x = Math.max(0, norm_x - PAD);
                        const bx_y = Math.max(0, norm_y - PAD);
                        const bx_w = Math.min(1 - bx_x, norm_w + (PAD * 2));
                        const bx_h = Math.min(1 - bx_y, norm_h + (PAD * 2));
                        
                        // Crop using the original image space coordinates
                        const cropUrl = await cropImage(imageUrl, bx_x, bx_y, bx_w, bx_h, 512);
                        const processedCropUrl = await preprocessForMasking(cropUrl);
                        
                        logOp(op.id, `[ WAIT ] Segmenting ${m.label}...`);
                        const bgBlob = await checkAbort(op.id, removeBackground(processedCropUrl, {
                            model: 'isnet',
                            output: { format: 'image/png' },
                            device: 'gpu' as any,
                            debug: false,
                        }), 60000); // 60 seconds timeout per mask part to avoid permanent hang
                        
                        const maskImg = await loadImage(URL.createObjectURL(bgBlob));
                        const rcv = document.createElement('canvas');
                        rcv.width = maskImg.width; rcv.height = maskImg.height;
                        const rctx = rcv.getContext('2d', { willReadFrequently: true })!;
                        
                        rctx.clearRect(0, 0, rcv.width, rcv.height);
                        rctx.drawImage(maskImg, 0, 0);
                        rctx.globalCompositeOperation = 'source-in';
                        rctx.fillStyle = 'white';
                        rctx.fillRect(0, 0, rcv.width, rcv.height);
                        rctx.globalCompositeOperation = 'destination-over';
                        rctx.fillStyle = 'black';
                        rctx.fillRect(0, 0, rcv.width, rcv.height);
                        rctx.globalCompositeOperation = 'source-over';
                        const iData = rctx.getImageData(0, 0, rcv.width, rcv.height);
                        const contour = findContour(iData);
                        
                        const simplified = simplifyContour(contour, 0.2);
                        const maskWidth = maskImg.width;
                        const maskHeight = maskImg.height;
        
                        masks.push({
                            label: m.label,
                            x: bx_x, y: bx_y, 
                            width: bx_w, height: bx_h,
                            maskWidth: maskWidth,
                            maskHeight: maskHeight,
                            path: createCurvePath(simplified)
                        });
                    }

                    logOp(op.id, '[ WAIT ] Generating high-res cutout...');
                    const { pngData } = await checkAbort(op.id, generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks));
                    localMaskUrl = pngData;
                    logOp(op.id, '[  OK  ] Cloud Mask generated');

                } catch (e: any) {
                    logOp(op.id, `[ FAIL ] Cloud Mask failed: ${e.message}`);
                    console.error(e);
                }
            } else {
                logOp(op.id, '[ WAIT ] Running local AI for background removal...');
                try {
                    updateOp(op.id, { progress: 15, stepLabel: 'Preparing Full-Res SDR Image...' });
                    
                    // Convert raw HDR to SDR while PRESERVING original resolution and aspect ratio
                    const sdrDataUrl = await new Promise<string>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error('Canvas error'));
                            ctx.drawImage(img, 0, 0, img.width, img.height);
                            resolve(canvas.toDataURL('image/jpeg', 1.0));
                        };
                        img.onerror = () => reject(new Error('Image load failed'));
                        img.src = imageUrl;
                    });

                    logOp(op.id, '[ WAIT ] Extracting background...');
                    const processedSdrUrl = await preprocessForMasking(sdrDataUrl);
                    
                    // Yield to main thread to prevent UI freezing
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");

                    const bgBlob = await checkAbort(op.id, removeBackground(processedSdrUrl, {
                        model: 'isnet', // Upgrade to isnet for perfect solid boundaries and fewer partial cuts
                        output: { format: 'image/png' },
                        device: 'gpu' as any, // Explicitly request GPU acceleration if available
                        debug: false,
                        progress: (key, current, total) => {
                            const p = Math.round((current / total) * 100);
                            updateOp(op.id, { progress: 15 + (p * 0.7), stepLabel: `Extracting: ${key} ${p}%` });
                        }
                    }), 120000); // 120 sec timeout for full image processing
                    
                    const img = await loadImage(imageUrl);// Yield again before applying alpha mask
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");

                    updateOp(op.id, { progress: 90, stepLabel: 'Finalizing Image...' });
                    localMaskUrl = await applyAlphaMask(sdrDataUrl, bgBlob);
                    logOp(op.id, '[  OK  ] Mask generated locally');
                } catch (err: any) {
                    logOp(op.id, `[ FAIL ] Mask generation failed: ${err.message}`);
                    console.error(err);
                }
            }
            } else {
                logOp(op.id, '[ SKIP ] Image processing skipped');
                updateOp(op.id, { progress: 90 });
            }

            updateOp(op.id, { 
                status: 'completed', 
                progress: 100, 
                result: {
                    description: processed.description,
                    maskUrl: localMaskUrl || undefined
                }
            });
        } catch (err: any) {
            logOp(op.id, `[ FAIL ] ${err.message}`);
            updateOp(op.id, { status: 'failed', progress: 0 });
            throw err;
        }
    };

    const handleRegenerate = (id: string) => {
        cancelTokens.current[id] = false;
        setQueue(prev => prev.map(op => 
            op.id === id 
                ? { ...op, status: 'idle', progress: 0, logs: ['[ WAIT ] Re-queued for processing'], result: { ...op.result, maskUrl: undefined } }
                : op
        ));
        setHasUnsavedChanges(true);
    };

    const handleAbort = (id: string) => {
        cancelTokens.current[id] = true;
        setQueue(prev => prev.map(op => 
            op.id === id 
                ? { ...op, status: 'failed', logs: [...op.logs, '[ FAIL ] Cancelled by user'] }
                : op
        ));
    };

    const handleUploadMask = (op: BatchOp) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re: any) => {
                updateOp(op.id, {
                    result: {
                        ...(op.result || { description: '' }),
                        maskUrl: re.target.result
                    }
                });
                setHasUnsavedChanges(true);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const handleSaveDescription = async (op: BatchOp) => {
        if (!op.result?.description) return;
        const toastId = toast.loading('Saving description...');
        try {
            const itemId = op.item.data?.id || op.item.id || op.item.row;
            await supabase.from('inventory').update({
                detailed_description: op.result.description
            }).eq('id', itemId);
            toast.success('Description saved!', { id: toastId });
            setInventoryVersion(Date.now());
        } catch (e: any) {
            toast.error('Failed to save description', { id: toastId });
        }
    };

    const handleExportDatabase = async () => {
        const completedOps = queue.filter(op => op.status === 'completed');
        if (completedOps.length === 0) {
            toast.error('No completed items to export.');
            return;
        }

        const toastId = toast.loading(`Saving data for ${completedOps.length} operations...`);
        setIsSavingDb(true);
        setOverallProgress(0);
        
        try {
            const opsByItem: Record<string, BatchOp[]> = {};
            completedOps.forEach(op => {
                const itemId = String(op.item.id || op.item.row);
                if (!opsByItem[itemId]) opsByItem[itemId] = [];
                opsByItem[itemId].push(op);
            });

            const entries = Object.entries(opsByItem);
            let savedCount = 0;

            for (const [itemId, ops] of entries) {
                ops.sort((a, b) => (a.imageIndex || 0) - (b.imageIndex || 0));
                
                let combinedMaskUrls: string[] = [];
                let lastDescription = '';
                
                for (const op of ops) {
                    if (op.result?.maskUrl && op.result.maskUrl.startsWith('data:')) {
                        const upRes = await handleProcessedFileUpload(op.result.maskUrl, `mask_${op.id}.png`, user);
                        if (upRes && upRes.thumbnailUrl) {
                            op.result.maskUrl = upRes.thumbnailUrl;
                        }
                    }
                    
                    if (op.result?.maskUrl) {
                        combinedMaskUrls.push(op.result.maskUrl);
                    } else {
                        combinedMaskUrls.push('');
                    }
                    
                    if (op.result?.description) {
                        lastDescription = op.result.description;
                    }
                }
                
                const primaryOp = ops[0];
                const itemData = primaryOp.item.data || primaryOp.item;
                const currentMasks = itemData.spatialMasks || itemData.spatial_masks || {};
                let updatedMasks: Record<string, any> = {};
                combinedMaskUrls.forEach((url, idx) => {
                    if (url) {
                        updatedMasks[`angle_${idx}`] = [{ mask: url }];
                    }
                });

                let processedMap: Record<string, string> = {};
                ops.forEach(op => {
                    if (op.result?.maskUrl && op.imageUrl) {
                        processedMap[op.imageUrl] = op.result.maskUrl;
                    }
                });

                await supabase.from('inventory').update({ 
                    detailed_description: lastDescription,
                    spatial_masks: updatedMasks,
                    processed_media_urls: JSON.stringify(processedMap),
                    generated_png_url: combinedMaskUrls[0] || null
                }).eq('id', itemId);
                
                savedCount++;
                setOverallProgress((savedCount / entries.length) * 100);
            }
            
            toast.success('Saved successfully to database!', { id: toastId });
            setInventoryVersion(Date.now());
            setHasUnsavedChanges(false);
        } catch (e: any) {
            toast.error(`Save failed: ${e.message}`, { id: toastId });
            console.error(e);
        } finally {
            setIsSavingDb(false);
            setOverallProgress(100);
        }
    };

    const getProductCategory = (shape: string, shortDesc: string) => {
        const combined = `${shape} ${shortDesc}`.toLowerCase();
        if (combined.includes('wine rack')) return 'Furniture > Cabinets & Storage > Wine Racks';
        if (combined.includes('pendant')) return 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures';
        if (combined.includes('tower lamp') || combined.includes('floor lamp') || combined.includes('pillar')) return 'Home & Garden > Lighting > Lamps > Floor Lamps';
        if (combined.includes('table lamp') || combined.includes('desk lamp') || combined.includes('lamp')) return 'Home & Garden > Lighting > Lamps > Desk Lamps';
        if (combined.includes('coaster')) return 'Home & Garden > Kitchen & Dining > Barware > Coasters';
        if (combined.includes('bathtub') || combined.includes('tub')) return 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs';
        if (combined.includes('sink') || combined.includes('vessel')) return 'Hardware > Plumbing > Plumbing Fixtures > Sinks';
        if (combined.includes('sculpture') || combined.includes('statue') || combined.includes('carving') || combined.includes('figure')) return 'Home & Garden > Decor > Artwork > Sculptures & Statues';
        if (combined.includes('bowl')) return 'Home & Garden > Decor > Decorative Bowls';
        if (combined.includes('plate')) return 'Home & Garden > Decor > Decorative Plates';
        if (combined.includes('tray')) return 'Home & Garden > Decor > Decorative Trays';
        if (combined.includes('fountain') || combined.includes('waterfall')) return 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains';
        if (combined.includes('garden sculpture') || combined.includes('lawn ornament')) return 'Home & Garden > Decor > Lawn Ornaments & Garden Sculptures > Garden Sculptures';
        if (combined.includes('mirror')) return 'Home & Garden > Decor > Mirrors';
        if (combined.includes('shot glass') || combined.includes('tequila glass')) return 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses';
        if (combined.includes('wall light') || combined.includes('sconce')) return 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures';
        if (combined.includes('board game') || combined.includes('chess') || combined.includes('checkers') || combined.includes('tic tac toe')) return 'Toys & Games > Games > Board Games';
        return 'Home & Garden > Decor';
    };

    const buildExportContext = () => {
        const completedOps = queue.filter(op => op.status === 'completed');
        const exportDataList: any[] = [];
        const catalogResults: CatalogArtifact[] = [];

        const opsByItem: Record<string, BatchOp[]> = {};
        completedOps.forEach(op => {
            const itemId = String(op.item.id || op.item.row);
            if (!opsByItem[itemId]) opsByItem[itemId] = [];
            opsByItem[itemId].push(op);
        });

        for (const [itemId, ops] of Object.entries(opsByItem)) {
            ops.sort((a, b) => (a.imageIndex || 0) - (b.imageIndex || 0));
            const primaryOp = ops[0];
            const itemData = primaryOp.item.data || primaryOp.item;
            
            const shape = itemData.shape || 'object';
            const shortDesc = itemData.shortDescription || itemData.type || '';
            const category = getProductCategory(shape, shortDesc);
            
            const normData = normalizeInventoryData(itemData);
            const codes = calculateCodesAndPrices(itemData, 1, 'REG');
            
            const vendorMapping: Record<string, string> = {
                'ET': 'Betoeduardo', 'DH': 'Delfino', 'EM': 'Emmanuel', 'GE': 'Geraldo',
                'JM': 'Jose', 'ML': 'Maria Luisa', 'MM': 'Mariam', 'SU': 'Susana',
                'TE': 'Tellez', 'CA': 'Carlos', 'AM': 'Alejandro', 'CP': 'Cantera Puebla',
                'AN': 'Angel', 'FR': 'Fountain Rock Mine', 'BT': 'Bernardo', 'RF': 'Roberto'
            };
            
            const tagId = codes?.printCode || codes?.bookBarcode || normData.book_barcode || normData.itemId || '';
            const matchPrefix = tagId.match(/^[A-Za-z]+/);
            const extractedPrefix = matchPrefix ? matchPrefix[0] : '';
            const rawVendorId = String(normData.vendor_id || extractedPrefix || '').toUpperCase();
            const vendorName = vendorMapping[rawVendorId] || rawVendorId || 'Art of Decor';

            const combinedMaskUrls = ops.map(op => op.result?.maskUrl || (op.skipImageProcessing ? op.imageUrl : undefined)).filter(Boolean) as string[];
            
            exportDataList.push({ op: primaryOp, category, vendorName, allMasks: combinedMaskUrls });

            let lastDescription = '';
            for (const op of ops) { if (op.result?.description) lastDescription = op.result.description; }

            const pdfProcessedMap: Record<string, string> = {};
            ops.forEach(op => {
                if (op.result?.maskUrl && op.imageUrl) {
                    pdfProcessedMap[op.imageUrl] = op.result.maskUrl;
                }
            });

            const pdfData = { 
                ...normData, 
                detailed_description: lastDescription || normData.detailed_description, 
                processed_media_urls: JSON.stringify(pdfProcessedMap),
                category: category
            };
            
            catalogResults.push({
                data: pdfData,
                codes: codes,
                images: combinedMaskUrls.length > 0 ? combinedMaskUrls.map(u => getCleanImageUrl(u)!) : collectAllImages(normData),
                exportType: 'catalog'
            });
        }
        return { exportDataList, catalogResults };
    };

    const handleGenerateXLSX = async () => {
        if (!allCompleted || hasUnsavedChanges) { toast.error("Please export to database first."); return; }
        setIsGeneratingXlsx(true);
        const toastId = toast.loading('Generating Shopify XLSX...');
        try {
            const { exportDataList } = buildExportContext();
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Onyx Dashboard';
            const sheet = workbook.addWorksheet('Shopify Export');
            
            const headers = [
                'Title', 'Vendor', 'Variant SKU', 'Variant Barcode', 'Variant Cost',
                'Variant Price', 'Variant Grams', 'Image Src', 'Image Position', 
                'Metafield: custom.product_weight [single_line_text_field]', 
                'Variant Metafield: Vendor_SKU', 'Variant Weight Unit', 
                'Variant Metafield: reg.variant_depth', 'Variant Metafield: reg.variant_width', 
                'Variant Metafield: reg.variant_height', 'Variant Metafield: reg.variant_measurements', 
                'Metafield: Measurements', 'Metafield: shopify.material [list.metaobject_reference]', 
                'Metafield: custom.variety [list.single_line_text_field]', 'Variant Country of Origin', 
                'Tags', 'Product Category', 'Metafield: shopify.color-pattern [list.metaobject_reference]', 
                'Metafield: custom.polish_type [list.single_line_text_field]', 
                'Metafield: custom.cut_type [list.single_line_text_field]', 
                'Metafield: shopify.age-group [list.metaobject_reference]', 
                'Metafield: shopify.target-gender [list.metaobject_reference]', 
                'Variant Metafield: mm-google-shopping.custom_label_1', 
                'Metafield: reg.designer', 'Status', 'Published', 'Published Scope', 
                'Variant Taxable', 'Variant Inventory Tracker', 'Variant Inventory Policy', 
                'Variant Fulfillment Service', 'Variant Requires Shipping'
            ];
            sheet.addRow(headers);
            sheet.getRow(1).font = { bold: true };

            exportDataList.forEach(({ op, category, vendorName, allMasks }) => {
                const itemData = op.item.data || op.item;
                const norm = normalizeInventoryData(itemData);
                const bookRate = 20; 
                const calc = calculateCodesAndPrices(norm, bookRate, '326');
                
                const shape = norm.shape || '';
                const shortDesc = norm.shortDescription || norm.type || '';
                const color = norm.color || '';
                const material = norm.material || '';
                const fallbackTitle = `${shape} ${shortDesc} ${color} ${material}`.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const title = op.result?.description || fallbackTitle;

                const tagId = calc.printCode || calc.bookBarcode || norm.book_barcode || norm.itemId || String(itemData.row) || '';
                const vendorSku = calc.bookAqCode || tagId.replace(/^[A-Za-z]{2}[-]?\d{3}[-]?/, '') || tagId;
                
                const rawVendorId = String(norm.vendor_id || '').toUpperCase();
                let polishType = 'matte';
                if (rawVendorId === 'JM') polishType = 'high-polish';
                else if (['EM', 'ML', 'TE'].includes(rawVendorId)) polishType = 'polish';

                const parseNum = (val: any) => { const num = parseFloat(val); return isNaN(num) ? 0 : num; };
                const cmToIn = (cm: any) => (parseNum(cm) / 2.54).toFixed(2);
                const kgToLbs = (kg: any) => (parseNum(kg) * 2.20462).toFixed(2);
                
                const costMxn = parseFloat(norm.price || norm.acquisition_price_mxn || '0') || 0;
                const landedUsd = ((costMxn / bookRate) * 1.4) || 0;
                const retailUsd = (landedUsd * 12) || 0;
                const price = Math.round(retailUsd * 100) / 100;
                const cost = calc.bookLanded || '';

                const weightKg = parseNum(norm.weightKg);
                const weightGrams = Math.round(weightKg * 1000);
                const weightLbs = kgToLbs(weightKg);
                
                const depthIn = cmToIn(norm.lengthCm);
                const widthIn = cmToIn(norm.widthCm);
                const heightIn = cmToIn(norm.heightCm);
                const measurementsStr = `D${depthIn}xW${widthIn}xH${heightIn}`;
                const variety = 'Mexican Onyx';
                const formattedMaterial = material ? material.charAt(0).toUpperCase() + material.slice(1) : 'Onyx';

                let imageSrc = '';
                if (allMasks && allMasks.length > 0) {
                    imageSrc = getCleanImageUrl(allMasks[0]) || '';
                } else {
                    imageSrc = getCleanImageUrl(norm.generatedPngUrl) || getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]) || '';
                }
                
                if (imageSrc && imageSrc.includes('google') && !imageSrc.toLowerCase().endsWith('.png') && !imageSrc.toLowerCase().endsWith('.jpg')) {
                    imageSrc = imageSrc.includes('?') ? `${imageSrc}&ext=.png` : `${imageSrc}?.png`;
                }

                const combinedVendorSku = `${tagId}-${vendorSku}${costMxn}`;

                const tagsArray = [
                    tagId,
                    color,
                    formattedMaterial,
                    shape,
                    shortDesc,
                    norm.heightCm ? `${norm.heightCm} cm` : '',
                    norm.widthCm ? `${norm.widthCm} cm` : ''
                ].filter(Boolean).join(', ');

                sheet.addRow([
                    title, vendorName, tagId, '', cost, price, weightGrams, imageSrc, 1, weightLbs, combinedVendorSku, '', depthIn, widthIn, heightIn, measurementsStr, '', formattedMaterial, variety, 'MX', tagsArray, category, '', polishType, '', 'Adults', 'Unisex', 'Rare Earth Gallery', 'Rare Earth Gallery', 'active', 'true', 'web', 'true', 'shopify', 'deny', 'manual', 'true'
                ]);
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            setXlsxUrl(URL.createObjectURL(blob));
            toast.success('XLSX generated! Click Download XLSX to save.', { id: toastId });
        } catch (e: any) {
            toast.error(`XLSX Generation failed: ${e.message}`, { id: toastId });
            console.error(e);
        } finally { setIsGeneratingXlsx(false); }
    };

    const handleGeneratePDF = async () => {
        if (!allCompleted || hasUnsavedChanges) { toast.error("Please export to database first."); return; }
        setIsGeneratingPdf(true);
        const toastId = toast.loading('Generating Catalog PDF...');
        try {
            const { catalogResults } = buildExportContext();
            const dateStr = new Date().toISOString().split('T')[0];
            const blob = await exportCatalogPdf(catalogResults, {
                title: `AI Generated Catalog ${dateStr}`,
                method: 'grid',
                logo: pdfBrand,
                exportType: 'catalog'
            }, () => {}, 'blob');

            if (blob instanceof Blob) {
                setPdfUrl(URL.createObjectURL(blob));
                toast.success('PDF generated! Click Download PDF to save.', { id: toastId });
            }
        } catch (e: any) {
            toast.error(`PDF Generation failed: ${e.message}`, { id: toastId });
            console.error(e);
        } finally { setIsGeneratingPdf(false); }
    };

    const handleStartBatch = async () => {
        if (!getApiKey()) {
            setShowApiModal(true);
            return;
        }

        setIsProcessing(true);
        setIsAborted(false);
        setOverallProgress(0);

        let completed = 0;
        for (const op of queue) {
            if (isAborted) break;
            if (op.status === 'completed') {
                completed++;
                continue;
            }

            try {
                await processSingleItem(op);
            } catch (err) {
                console.error("Failed processing item:", op.id, err);
            }
            completed++;
            setOverallProgress((completed / queue.length) * 100);
            await new Promise(r => setTimeout(r, 1000)); // Rate limit backoff
        }
        
        setIsProcessing(false);
        setInventoryVersion(v => v + 1);
        if (!isAborted) {
            toast.success("AI Batch Processing Complete!");
        }
    };

    const handleClose = () => {
        if (isProcessing) {
            const ok = window.confirm("Processing is active. Are you sure you want to abort and close?");
            if (!ok) return;
            setIsAborted(true);
        }
        setIsOpen(false);
    };

    const toggleProcessingMode = (id: string) => {
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                return { ...op, processingMode: op.processingMode === 'local' ? 'cloud' : 'local' };
            }
            return op;
        }));
    };

    const toggleImageProcessing = (id: string) => {
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                return { ...op, skipImageProcessing: !op.skipImageProcessing };
            }
            return op;
        }));
    };

    const allCompleted = queue.length > 0 && queue.every(op => op.status === 'completed');
    const needsProcessing = queue.some(op => op.status !== 'completed');

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex animate-in fade-in duration-500 bg-black/40 backdrop-blur-md">
            <div className="relative w-full h-full flex flex-col bg-transparent">
                
                {/* Fullscreen Image Gallery Mode */}
                {fullscreenImage && (
                    <div 
                        className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in"
                        onClick={() => { setFullscreenImage(null); setZoomLevel(1); }}
                    >
                        <div className="absolute top-6 right-6 flex gap-4 z-50">
                            <button onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(z + 0.5, 4)); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white backdrop-blur-md transition-all">
                                <ZoomIn size={24} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(z - 0.5, 1)); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white backdrop-blur-md transition-all">
                                <ZoomOut size={24} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); setZoomLevel(1); }} className="p-3 bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 rounded-xl text-white backdrop-blur-md transition-all">
                                <X size={24} />
                            </button>
                        </div>
                        <div 
                            className="w-full h-full p-12 flex items-center justify-center overflow-auto scrollbar-none"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img 
                                src={fullscreenImage} 
                                style={{ transform: `scale(${zoomLevel})` }}
                                className="max-w-full max-h-full object-contain transition-transform duration-300 ease-out cursor-zoom-in drop-shadow-2xl" 
                                onClick={(e) => { e.stopPropagation(); setZoomLevel(z => z === 1 ? 2 : 1); }}
                            />
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                            <Bot size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white">Onyx.mx - Shopifier</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Batch segmentation & description logic</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowApiModal(true)} title="API Settings" className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <Settings2 size={24} />
                        </button>
                        <button onClick={handleClose} className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Queue List */}
                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6">
                    {queue.map((op, idx) => (
                        <div key={op.id} className="relative overflow-hidden bg-black/10 backdrop-blur-2xl rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-start gap-4 md:gap-6 shadow-2xl">
                            {/* Glowing Progress Background */}
                            <div 
                                className="absolute top-0 left-0 bottom-0 bg-(--main-color)/10 transition-all duration-500 ease-out z-0"
                                style={{ width: `${op.progress}%` }}
                            />
                            
                            {/* Images Side-by-Side Container */}
                            <div className="flex gap-4 shrink-0 relative z-10">
                                {/* Source Image */}
                                <div 
                                    className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-white/5 cursor-pointer group relative"
                                    onClick={() => {
                                        const img = op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : null);
                                        if (img) setFullscreenImage(getCleanImageUrl(img)!);
                                    }}
                                >
                                    {op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls) ? (
                                        <>
                                            <img src={getCleanImageUrl(op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || op.item.data.mediaUrls.split(',')[0])!} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                                                <ZoomIn size={24} className="text-white drop-shadow-md" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
                                            <UploadCloud size={24} />
                                            <span className="text-[10px] font-black uppercase mt-2">No Image</span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Generated Mask Image */}
                                {op.result?.maskUrl && (
                                    <div 
                                        className="w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden shrink-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSI+PC9yZWN0Pgo8cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIj48L3BhdGg+Cjwvc3ZnPg==')] flex flex-col items-center justify-center border border-white/20 group relative cursor-pointer"
                                        onClick={() => setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!)}
                                    >
                                        <img src={getCleanImageUrl(op.result.maskUrl)!} className="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-all duration-300" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2 md:gap-4">
                                            <button onClick={(e) => { e.stopPropagation(); handleUploadMask(op); }} className="flex flex-col items-center text-white/80 hover:text-white hover:scale-110 transition-all">
                                                <UploadCloud size={16} />
                                                <span className="text-[8px] font-black uppercase mt-1">Upload</span>
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!); }} className="flex flex-col items-center text-white/80 hover:text-white hover:scale-110 transition-all">
                                                <ZoomIn size={16} />
                                                <span className="text-[8px] font-black uppercase mt-1">View</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 relative z-10 w-full flex flex-col justify-center min-w-0">
                                {/* Progress Line */}
                                <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-3 whitespace-nowrap overflow-x-auto scrollbar-none">
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 5 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 5 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> IMG
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 15 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 15 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> MASK
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 70 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 70 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> AI
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.status === 'completed' ? 'text-emerald-400' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.status === 'completed' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]' : 'bg-white/20'}`} /> DONE
                                    </div>
                                </div>
                                
                                <div className="flex flex-col xl:flex-row items-start justify-between w-full gap-4">
                                    <div>
                                        <h4 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                                            {(() => {
                                                const norm = normalizeInventoryData(op.item.data || op.item);
                                                const calc = calculateCodesAndPrices(norm, 20, '326');
                                                const tagId = calc?.printCode || calc?.bookBarcode || norm.book_barcode || norm.itemId || `Item ${norm.itemNumber}`;
                                                
                                                const match = tagId.replace(/\s+/g, '').match(/^([A-Za-z]+\d{2,4})(\d{2}[A-Za-z]*)$/);
                                                if (match) {
                                                    const [_, section1, section2] = match;
                                                    return (
                                                        <div className="flex gap-2 items-center">
                                                            <span style={{ color: resolveVendorColor(section1) }}>{section1}</span>
                                                            <span className="text-white/90">{section2}</span>
                                                        </div>
                                                    );
                                                }
                                                return <span style={{ color: resolveVendorColor(tagId) }}>{tagId}</span>;
                                            })()}
                                        </h4>
                                        {/* Item Details - Enlarger Text */}
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-[10px] md:text-xs font-black uppercase tracking-widest text-white/50">
                                            <span className="text-white/80">{(op.item.data || op.item).shape || 'N/A'}</span>
                                            <span className="text-white/20">•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).color || 'N/A'}</span>
                                            <span className="text-white/20">•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).material || 'N/A'}</span>
                                            {((op.item.data || op.item).dimensions) && (
                                                <>
                                                    <span className="text-white/20">•</span>
                                                    <span className="text-white/60 bg-white/5 px-2 py-0.5 rounded-md">{(op.item.data || op.item).dimensions}</span>
                                                </>
                                            )}
                                            {((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) && (
                                                <>
                                                    <span className="text-white/20">•</span>
                                                    <span className="bg-white/5 px-2 py-0.5 rounded-md" style={{ color: resolveVendorColor((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) }}>
                                                        {(op.item.data || op.item).vendor || (op.item.data || op.item).supplier}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Buttons */}
                                    <div className="flex flex-wrap gap-2 opacity-70 hover:opacity-100 transition-opacity shrink-0">
                                        <button 
                                            onClick={() => toggleImageProcessing(op.id)}
                                            disabled={op.status !== 'idle'}
                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${
                                                !op.skipImageProcessing 
                                                    ? 'text-rose-400 hover:text-rose-300 bg-black/40 hover:bg-white/10'
                                                    : 'text-white/40 hover:text-white/60 bg-black/40 hover:bg-white/10'
                                            } ${op.status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title="Toggle Image Processing"
                                        >
                                            <UploadCloud size={14} /> IMG
                                        </button>
                                        <button 
                                            onClick={() => toggleProcessingMode(op.id)}
                                            disabled={op.status !== 'idle' || op.skipImageProcessing}
                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${
                                                op.processingMode === 'cloud' 
                                                    ? 'text-blue-400 hover:text-blue-300 bg-black/40 hover:bg-white/10'
                                                    : 'text-(--main-color) hover:text-(--main-color) bg-black/40 hover:bg-white/10'
                                            } ${op.status !== 'idle' || op.skipImageProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title="Toggle Cloud/Local"
                                        >
                                            {op.processingMode === 'cloud' ? <Cloud size={14} /> : <Cpu size={14} />}
                                            {op.processingMode === 'cloud' ? 'CLOUD' : 'LOCAL'}
                                        </button>
                                        
                                        {op.status === 'processing' && (
                                            <button 
                                                onClick={() => handleAbort(op.id)}
                                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-red-400 hover:text-red-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                title="Abort Processing"
                                            >
                                                <XCircle size={14} /> ABORT
                                            </button>
                                        )}
                                        {op.status === 'completed' && (
                                            <button 
                                                onClick={() => handleRegenerate(op.id)}
                                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-amber-400 hover:text-amber-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                title="Re-Generate Mask"
                                            >
                                                <RefreshCw size={14} /> RE-GENERATE
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Step Label & Progress text */}
                                {op.status === 'processing' && (
                                    <div className="mt-4 flex items-center justify-between text-[10px] md:text-xs font-black uppercase tracking-widest text-(--main-color)">
                                        <span className="flex items-center gap-2 animate-pulse"><Loader2 size={12} className="animate-spin"/> {op.stepLabel || 'Processing...'}</span>
                                        <span>{Math.round(op.progress)}%</span>
                                    </div>
                                )}

                                {/* Streaming Logs */}
                                <div className="mt-3 text-[9px] md:text-[10px] font-mono text-(--main-color)/60 truncate">
                                    {op.logs.length > 0 && (
                                        <div className={op.logs[op.logs.length - 1].includes('[ FAIL ]') ? 'text-rose-400' : op.logs[op.logs.length - 1].includes('[  OK  ]') ? 'text-emerald-400' : ''}>
                                            {">"} {op.logs[op.logs.length - 1]}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Free-Floating Generated Description */}
                                {op.result && (
                                    <div className="mt-4 flex flex-col gap-2 animate-in slide-in-from-top-2 w-full">
                                        <textarea 
                                            value={op.result.description || ''}
                                            onChange={(e) => {
                                                updateOp(op.id, { result: { ...op.result, description: e.target.value } });
                                                setHasUnsavedChanges(true);
                                            }}
                                            className="w-full min-h-[60px] md:min-h-[80px] bg-black/30 border border-white/5 hover:border-white/20 rounded-xl p-3 md:p-4 text-xs md:text-sm text-white/90 font-mono leading-relaxed focus:outline-none focus:border-(--main-color) transition-all resize-y scrollbar-thin scrollbar-thumb-white/20"
                                            placeholder="AI generated description will appear here..."
                                        />
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleSaveDescription(op); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-(--main-color)/20 hover:bg-(--main-color) text-(--main-color) hover:text-black text-[10px] font-black uppercase tracking-widest rounded-lg border border-(--main-color)/30 transition-all"
                                            >
                                                <Save size={14} />
                                                Save Description
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="relative z-10 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center shrink-0 ml-auto md:ml-0 mt-4 md:mt-0 bg-black/30 rounded-2xl border border-white/10">
                                {op.status === 'processing' && <Loader2 size={24} className="text-(--main-color) animate-spin" />}
                                {op.status === 'completed' && <CheckCircle2 size={24} className="text-emerald-500" />}
                                {op.status === 'failed' && <AlertCircle size={24} className="text-rose-500" />}
                                {op.status === 'idle' && <span className="text-[9px] md:text-[10px] font-black text-white/20">WAIT</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Global Progress Bar */}
                <div className="w-full bg-black/40 border-t border-white/5 p-4 flex flex-col gap-2 relative z-20">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/60 px-4">
                        <span>{isSavingDb ? 'Saving to DB...' : 'Total Progress'}</span>
                        <span>{Math.round(overallProgress)}%</span>
                    </div>
                    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden mx-4 w-[calc(100%-2rem)]">
                        <div 
                            className="h-full bg-(--main-color) shadow-[0_0_20px_var(--main-color)] transition-all duration-500"
                            style={{ width: `${overallProgress}%` }}
                        />
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="px-8 pb-8 pt-4 bg-black/60 flex flex-col md:flex-row items-center justify-end gap-6 relative z-20">
                    <div className="flex flex-wrap items-center justify-end gap-4 w-full">
                        <div className="flex items-center gap-2 border border-white/10 p-2 rounded-2xl bg-black/40">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/50 whitespace-nowrap ml-2">PDF BRAND</label>
                            <select 
                                value={pdfBrand} 
                                onChange={(e) => setPdfBrand(e.target.value as any)} 
                                className="bg-black/50 text-white text-xs font-bold px-3 py-2 rounded-xl outline-none border border-white/5 focus:border-(--main-color)"
                            >
                                <option value="ArtOfDecor">ART OF DECOR</option>
                                <option value="RareEarth">RARE EARTH GALLERY</option>
                            </select>
                        </div>
                        
                        <button 
                            onClick={handleExportDatabase}
                            disabled={!allCompleted || !hasUnsavedChanges}
                            className={`flex items-center gap-3 px-6 py-4 font-black uppercase tracking-widest rounded-2xl transition-all shrink-0 ${(!hasUnsavedChanges && allCompleted) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500 hover:bg-blue-400 text-black shadow-[0_0_20px_rgba(59,130,246,0.3)]'} ${(!allCompleted || !hasUnsavedChanges) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {(!hasUnsavedChanges && allCompleted) ? <CheckCircle2 size={20} /> : <Save size={20} />}
                            {(!hasUnsavedChanges && allCompleted) ? 'SAVED TO DB' : 'SAVE TO DB'}
                        </button>
                        
                            <>
                                {!xlsxUrl ? (
                                    <button 
                                        onClick={handleGenerateXLSX}
                                        disabled={!allCompleted || hasUnsavedChanges || isGeneratingXlsx}
                                        className="flex items-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {isGeneratingXlsx ? <Loader2 size={20} className="animate-spin" /> : <Settings2 size={20} />}
                                        Generate XLSX
                                    </button>
                                ) : (
                                    <a 
                                        href={xlsxUrl}
                                        download={`Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx`}
                                        className="flex items-center gap-3 px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shrink-0"
                                    >
                                        <Save size={20} />
                                        Download XLSX
                                    </a>
                                )}
                                
                                {!pdfUrl ? (
                                    <button 
                                        onClick={handleGeneratePDF}
                                        disabled={!allCompleted || hasUnsavedChanges || isGeneratingPdf}
                                        className="flex items-center gap-3 px-6 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {isGeneratingPdf ? <Loader2 size={20} className="animate-spin" /> : <Settings2 size={20} />}
                                        Generate PDF
                                    </button>
                                ) : (
                                    <a 
                                        href={pdfUrl}
                                        download={`Catalog_AI_${new Date().toISOString().split('T')[0]}.pdf`}
                                        className="flex items-center gap-3 px-6 py-4 bg-rose-500 hover:bg-rose-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shrink-0"
                                    >
                                        <Save size={20} />
                                        Download PDF
                                    </a>
                                )}
                            </>

                        <button 
                            onClick={handleStartBatch}
                            disabled={!needsProcessing || isProcessing}
                            className="flex items-center gap-3 px-8 py-4 bg-(--main-color) hover:bg-(--main-color)/80 text-black font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                            {isProcessing ? 'Processing...' : 'Start Engine'}
                        </button>
                    </div>
                </div>

            </div>

            {/* API Key Modal */}
            {showApiModal && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-8 max-w-sm w-full flex flex-col gap-6 shadow-2xl">
                        <div>
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">API Key Required</h3>
                            <p className="text-xs text-white/40 mt-2 font-mono">Please enter your Gemini API Key. It will be stored securely in your local device storage.</p>
                        </div>
                        <input 
                            ref={apiInputRef}
                            type="password"
                            placeholder="AIzaSy..."
                            className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-(--main-color) transition-all"
                        />
                        <div className="flex justify-end gap-3 mt-2">
                            <button onClick={() => setShowApiModal(false)} className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white uppercase tracking-wider">Cancel</button>
                            <button onClick={saveApiKey} className="px-6 py-2 bg-(--main-color) text-black text-xs font-black uppercase tracking-wider rounded-lg hover:bg-white transition-all">Save & Start</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    , document.body);
};
