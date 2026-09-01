import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { createPortal } from 'react-dom';
import { 
    isBatchWizardOpenAtom, 
    batchWizardItemsAtom, 
    inventoryAtom, 
    InventoryVersionAtom,
    userAtom,
    exchangeRateAtom,
    liveExchangeRateAtom
} from '../../lib/atoms';
import { SCRIPT_URL , DEFAULT_EXCHANGE_RATE} from '../../lib/consts';
import { ai } from '../../lib/ai';
import { processVideoWithGemini } from '../../lib/videoAI';
import { supabase } from '../../lib/supabase';

import { 
    getCleanImageUrl, 
    resizeImage, 
    handleProcessedFileUpload, 
    loadImage, 
    cropImage, 
    findContour, 
    simplifyContour, 
    createCurvePath, 
    generatePngAndSvgFromMasks, 
    preprocessForMasking, 
    applyAlphaMask,
    collectAllImages, 
    calculateCodesAndPrices, 
    normalizeInventoryData, 
    getProductCategoryAndType,
    formatProductTitle
} from '../../lib/utils';
import { X, Play, Loader2, CheckCircle2, AlertCircle, Sparkles, Settings2, UploadCloud, Cloud, Cpu, ZoomIn, ZoomOut, Save, RefreshCw, Bot, XCircle, Trash2, Layers, Video, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { removeBackground } from '@imgly/background-removal';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { extractDominantColorsFromImage, getStoneStyleColors, generateFallbackMarketingHtml, generateBitmapAndHexMap, reconstructRgbPixelMap } from '../../lib/colorExtractor';
import { SquareCropModal } from '../../components/SquareCropModal';
import { sanitizeExcelRow } from '../../lib/xlsxUtils';
import { vendors } from '../../lib/consts';
import { tr } from '../../lib/i18n';

const resolveVendorColor = (inputStr: string | undefined | null) => {
    if (!inputStr) return '#ffffff';
    const upper = inputStr.toUpperCase();
    const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
    // Try matching by exact name first
    const nameMatch = vKeys.find(k => (vendors as any)[k].name.toUpperCase() === upper);
    if (nameMatch) return (vendors as any)[nameMatch].color;
    // Then try matching by prefix (for Tag IDs)
    const prefixMatch = vKeys.find(k => upper.startsWith(k));
    if (prefixMatch) return (vendors as any)[prefixMatch].color;
    return '#ffffff';
};

interface BatchOp {
    id: string;
    item: any;
    imageIndex?: number;
    imageUrl?: string;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    processingMode?: 'local' | 'cloud' | 'hybrid';
    skipImageProcessing?: boolean;
    forceRegenerateDescription?: boolean;
    result?: {
        description?: string;
        marketingDescription?: string;
        dominantColors?: string[];
        generatedType?: string;
        maskUrl?: string;
        bitmapUrl?: string;
        hexString?: string;
        cols?: number;
        rows?: number;
        localSegmentationMasks?: string;
        cloudSegmentationMasks?: string;
        videoGen?: string;
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
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const activeRate = liveExchangeRate || exchangeRate || DEFAULT_EXCHANGE_RATE;
    
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
    const [editHtmlId, setEditHtmlId] = useState<string | null>(null);
    const [cropModalState, setCropModalState] = useState<{ isOpen: boolean; opId: string; imageSrc: string }>({ isOpen: false, opId: '', imageSrc: '' });

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
                
                const savedMarketingDesc = norm.marketingDescription || norm.marketing_description || norm.generatedDescription || norm.generated_description || item.generatedDescription || item.generated_description || undefined;
                const recon = reconstructRgbPixelMap(norm.spatialPoints || norm.spatial_points || item.spatial_points);
                const savedHexString = recon ? recon.hexString : (item.hexString || item.hex_string || undefined);
                const savedBitmapUrl = recon ? recon.bitmapUrl : undefined;
                const savedCols = recon ? recon.cols : undefined;
                const savedRows = recon ? recon.rows : undefined;
                const savedDominantColors = norm.generatedColor || norm.dominantColors || norm.dominant_colors || item.dominantColors || item.dominant_colors || undefined;
                const savedGeneratedType = norm.generatedType || norm.generated_type || item.generatedType || item.generated_type || (item.processed_media_urls && typeof item.processed_media_urls === 'string' && item.processed_media_urls.startsWith('{') ? (() => { try { return JSON.parse(item.processed_media_urls)['_generated_type']; } catch(e) { return undefined; } })() : undefined);
                
                const detailedDesc = norm.detailedDescription || norm.detailed_description || item.detailedDescription || item.detailed_description;

                const baseResultObj = (detailedDesc || savedMarketingDesc || savedHexString || savedGeneratedType) ? {
                    description: detailedDesc || norm.description || '',
                    marketingDescription: savedMarketingDesc,
                    hexString: savedHexString,
                    bitmapUrl: savedBitmapUrl,
                    cols: savedCols,
                    rows: savedRows,
                    dominantColors: Array.isArray(savedDominantColors) ? savedDominantColors : (typeof savedDominantColors === 'string' && savedDominantColors ? savedDominantColors.split(',').map((s: string) => s.trim()) : undefined),
                    generatedType: savedGeneratedType
                } : undefined;

                if (images.length === 0) {
                    const hasData = !!baseResultObj;
                    newQueue.push({
                        id: String(item.id || item.row),
                        item,
                        imageIndex: 0,
                        imageUrl: '',
                        status: hasData ? 'completed' : 'idle',
                        progress: hasData ? 100 : 0,
                        logs: hasData ? ['[  OK  ] Loaded saved DB content'] : ['[ WAIT ] Ready for AI processing'],
                        processingMode: 'local',
                        skipImageProcessing: true,
                        result: baseResultObj
                    });
                } else {
                    images.forEach((imgUrl, idx) => {
                        const maskUrl = processedMap[imgUrl] || undefined;
                        const hasData = !!(baseResultObj || maskUrl);
                        newQueue.push({
                            id: `${item.id || item.row}_img${idx}`,
                            item,
                            imageIndex: idx,
                            imageUrl: imgUrl,
                            status: hasData ? 'completed' : 'idle',
                            progress: hasData ? 100 : 0,
                            logs: hasData ? ['[  OK  ] Loaded saved DB content'] : ['[ WAIT ] Ready for AI processing'],
                            processingMode: 'local',
                            skipImageProcessing: false,
                            result: (baseResultObj || maskUrl) ? {
                                ...(baseResultObj || { description: norm.description || '' }),
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

    const callGemini = async (prompt: string, imgData: string, timeoutMs: number = 40000, modelId: string = "gemini-2.5-pro") => {
        const API_KEY = getApiKey();
        if (!API_KEY) throw new Error("API Key missing");
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            // Use v1beta endpoint for 1.5-flash since some accounts might not have it exposed on v1
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
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
        } finally {
            clearTimeout(timeoutId);
        }
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
            const isCylPendant = String((itemData.shape || '') + ' ' + (itemData.shortDescription || itemData.type || '') + ' ' + (itemData.description || '') + ' ' + (itemData.title || '')).toLowerCase().match(/cylinder|cilindro|pendant|colgante/i) !== null;
            const rawImageUrl = op.imageUrl || getCleanImageUrl(op.item.generatedPngUrl || itemData.generatedPngUrl || op.item.imageUrl || itemData.mediaUrls?.split(',')[0]);
            const imageUrl = getCleanImageUrl(rawImageUrl);
            if (!imageUrl) throw new Error("No image found for item");
            
            if (imageUrl.toLowerCase().includes('photos.app.goo.gl') || imageUrl.toLowerCase().includes('photos.google.com')) {
                logOp(op.id, '[ SKIP ] Google Photos link detected. Skipping AI processing.');
                updateOp(op.id, { 
                    status: 'completed', 
                    progress: 100,
                    result: op.result || {}
                });
                return;
            }

            const isVideo = imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null;
            let base64 = '';
            
            if (isVideo) {
                logOp(op.id, '[ WAIT ] Fetching video file for AI...');
                const videoRes = await fetch(imageUrl);
                const videoBlob = await videoRes.blob();
                
                logOp(op.id, '[ WAIT ] Generating clean video clips with Gemini...');
                const generatedClips = await processVideoWithGemini(
                    new File([videoBlob], 'input.mp4', { type: videoBlob.type }),
                    itemData.shape || 'Artifact',
                    itemData.shortDescription || itemData.description || 'Onyx item',
                    (p, label) => {
                        updateOp(op.id, { progress: Math.min(90, 10 + p) });
                        logOp(op.id, `[ WAIT ] ${label}`);
                    }
                );
                
                let processedMap: Record<string, string> = {};
                if (itemData.processed_media_urls) {
                    try {
                        processedMap = JSON.parse(itemData.processed_media_urls);
                    } catch (e) {}
                }

                const uploadedUrls: string[] = [];
                for (let ci = 0; ci < generatedClips.length; ci++) {
                    logOp(op.id, `[ WAIT ] Uploading generated clip ${ci + 1}/${generatedClips.length} to Supabase...`);
                    const clipFileName = `gen_${Date.now()}_${op.id}_clip${ci}.mp4`;
                    const { data, error } = await supabase.storage.from('inventory-media').upload(
                        `generated_videos/${clipFileName}`, generatedClips[ci],
                        { cacheControl: '3600', upsert: false }
                    );
                    if (error) {
                        console.error(`Supabase upload failed for clip ${ci}:`, error.message);
                        continue;
                    }
                    const { data: { publicUrl } } = supabase.storage.from('inventory-media').getPublicUrl(`generated_videos/${clipFileName}`);
                    uploadedUrls.push(publicUrl);
                    processedMap[`videoGen_${ci}`] = publicUrl;
                }

                // First clip is also stored as 'videoGen' for backward compatibility
                if (uploadedUrls.length > 0) {
                    processedMap['videoGen'] = uploadedUrls[0];
                }
                processedMap['videoGenCount'] = String(uploadedUrls.length);
                
                updateOp(op.id, { 
                    result: { ...op.result, processedMap, videoGen: uploadedUrls[0] || '' } 
                });
                
                logOp(op.id, `[  OK  ] ${uploadedUrls.length} video clip(s) generated and uploaded.`);
            } else {
                const aiDataUrl = await resizeImage(imageUrl, 1024);
                base64 = aiDataUrl.split(',')[1];
                logOp(op.id, '[  OK  ] Image resized successfully');
            }

            let processed: any = { 
                description: op.result?.description || '',
                marketingDescription: op.result?.marketingDescription || '',
                dominantColors: op.result?.dominantColors || [],
                generatedType: op.result?.generatedType || ''
            };
            if ((op.imageIndex || 0) === 0 && (!processed.description || !processed.marketingDescription || !processed.dominantColors?.length || !processed.generatedType || op.forceRegenerateDescription)) {
                updateOp(op.id, { progress: 30 });
                logOp(op.id, '[ WAIT ] Analyzing via Gemini...');
                
                const shape = itemData.shape || 'Artifact';
                const type = itemData.shortDescription || itemData.type || 'Object';
                const material = itemData.material || 'Onyx';
                const color = itemData.color || 'Natural Veining';
                const collectionTotal = itemData.quantity || itemData.qty || '41';
                
                const prompt = isCylPendant ? `FIND and ANALYZE the collection of Mexican Onyx Cylinder Pendant Lamps/Fixtures in this image.
Notice: These cylinder pendants are packed in SETS / BOXES against a black studio background, and this photo shows the exact items included in this specific Box Set.

CRITICAL RULES FOR CYLINDER PENDANTS:
1. "description": A highly descriptive product title (MAXIMUM 80 characters long). Do NOT use articles (a, an, the, and). Do NOT end with a period. (e.g., "Mexican Onyx Cylinder Pendant Light Fixtures - Box Set").
2. "marketingDescription": A 1000 to 1200 character long marketing description formatted in clean HTML (<p>, <ul>, <li>). Make it premium, engaging, and emphasize artisanal Mexican stone craftsmanship, translucency, and natural veining.
   - You MUST COUNT the exact number of individual cylinder pieces visible in this photo (e.g. 9 pieces, 12 pieces, etc.) and state clearly early in the description: "This box set contains [X] pieces" (replacing [X] with the exact number of cylinders you counted in the image).
   - You MUST also mention later in the description that this set is part of a larger limited edition master collection (stating clearly: "${collectionTotal} items in this limited edition collection").
   - Emphasize how each cylinder in the set showcases unique natural veining and warm translucent glow when illuminated.
3. "dominantColors": An array of 2 to 3 color names selected strictly from this allowed list: [Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green, Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold, Silver, Tan, Turquoise/Aqua, White, Yellow].
   - CRITICAL COLOR RULE: Completely IGNORE the black studio background cloth! NEVER include "Black" as a dominant color for translucent cylinder pendants! Choose only the true natural stone colors (e.g. Cream, Tan, Brown, Amber/Orange, White, Green, etc.).
4. Do NOT use the word 'lamp'. ALL fixtures MUST be described as 'Luminarie' or 'Luminaries' or 'Light Fixtures'.
5. "generatedType": Choose ONE category strictly from this allowed list: [Barware > Wine Stoppers, Bathtubs, Board Games > Chess Sets, Home Decor > Candleholders, Home Decor > Coasters, Home Decor > Decorative Bowls, Home Decor > Decorative Plates, Home Decor > Decorative Trays, Home Decor > Floor Lamps, Home Decor > Mirrors, Home Decor > Pendant Lights, Home Decor > Sculptures, Home Decor > Sinks, Home Decor > Table Lamps, Home Decor > Tables, Home Decor > Vases, Home Decor > Wall Panels, Home Decor > Wine Racks, Outdoor Decor > Fountains]. CRITICAL RULE: Canoes, canoe dishes, or canoe bowls MUST be classified as "Home Decor > Decorative Trays". For Cylinder Pendants, always choose "Home Decor > Pendant Lights".

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here...",
  "marketingDescription": "<p>Your 1000-1200 character HTML marketing description here...</p>",
  "dominantColors": ["Color1", "Color2"],
  "generatedType": "Home Decor > Pendant Lights"
}` : `FIND the ${material} ${shape} ${type}. 
Generate comprehensive catalog content for this item based on its features, shape, material (${material}), and color (${color}).

CRITICAL RULES:
1. "description": A highly descriptive product title (MAXIMUM 80 characters long). Do NOT use articles (a, an, the, and). Do NOT end with a period.
2. "marketingDescription": A 1000 to 1200 character long marketing description formatted in clean HTML (<p>, <ul>, <li>). Make it premium, engaging, and emphasize artisanal Mexican stone craftsmanship, translucency, and natural veining.
3. "dominantColors": An array of 2 to 3 color names selected strictly from this allowed list: [Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green, Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold, Silver, Tan, Turquoise/Aqua, White, Yellow].
4. Do NOT use the word 'lamp'. ALL lamps MUST be described as 'Luminarie' or 'Luminaries'.
5. "generatedType": Choose ONE category strictly from this allowed list: [Barware > Wine Stoppers, Bathtubs, Board Games > Chess Sets, Home Decor > Candleholders, Home Decor > Coasters, Home Decor > Decorative Bowls, Home Decor > Decorative Plates, Home Decor > Decorative Trays, Home Decor > Floor Lamps, Home Decor > Mirrors, Home Decor > Pendant Lights, Home Decor > Sculptures, Home Decor > Sinks, Home Decor > Table Lamps, Home Decor > Tables, Home Decor > Vases, Home Decor > Wall Panels, Home Decor > Wine Racks, Outdoor Decor > Fountains]. CRITICAL RULE: Canoes, canoe dishes, or canoe bowls MUST be classified as "Home Decor > Decorative Trays".

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here...",
  "marketingDescription": "<p>Your 1000-1200 character HTML marketing description here...</p>",
  "dominantColors": ["Color1", "Color2"],
  "generatedType": "Home Decor > Decorative Bowls"
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
                
                const parsed = JSON.parse(resultText);
                let dominantColors = Array.isArray(parsed.dominantColors) ? parsed.dominantColors : processed.dominantColors;
                if (isCylPendant && Array.isArray(dominantColors)) {
                    dominantColors = dominantColors.filter((c: string) => c !== "Black");
                    if (dominantColors.length === 0) dominantColors = ["Cream", "Tan"];
                }
                let generatedType = parsed.generatedType || parsed.generated_type || processed.generatedType || '';
                if (isCylPendant && !generatedType) {
                    generatedType = "Home Decor > Pendant Lights";
                }
                processed = {
                    description: formatProductTitle(op.forceRegenerateDescription ? parsed.description : (processed.description || parsed.description)),
                    marketingDescription: op.forceRegenerateDescription ? parsed.marketingDescription : (processed.marketingDescription || parsed.marketingDescription),
                    dominantColors: op.forceRegenerateDescription ? dominantColors : (processed.dominantColors?.length > 0 ? processed.dominantColors : dominantColors),
                    generatedType: op.forceRegenerateDescription ? generatedType : (processed.generatedType || generatedType)
                };
                if (!processed.description) {
                    throw new Error("Invalid output format from AI");
                }
                logOp(op.id, '[  OK  ] Parsing complete');
            } else {
                updateOp(op.id, { progress: 70 });
                logOp(op.id, '[  OK  ] Using primary item description');
            }

            let localMaskUrl = null;
            if (!op.skipImageProcessing && !isVideo) {
                if (op.processingMode === 'cloud') {
                    logOp(op.id, '[ WAIT ] Running Cloud AI for segmentation...');
                const shape = itemData.shape || 'object';
                // Pass 1: Only ask for bounding boxes, NOT masks! Asking for multiple base64 masks in one pass blows past the 8192 token limit!
                const instruction = isCylPendant ? `Find ALL the Cylinder Pendant Onyx lamps/fixtures in the image. Notice these items are packed in SETS (multiple vertical stone cylinders arranged in a row or grid against a black studio background).
Instructions:
1. You MUST include the entire set of cylinders in the bounding box. Do NOT ignore any cylinder in the group.
2. Output a SINGLE bounding box labeled 'cylinder_set' that encompasses all cylinders shown in the photo from the top-leftmost cylinder edge to the bottom-rightmost cylinder edge.
3. Completely ignore black studio background edges, cardboard on the floor, or extraneous studio objects.
Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "cylinder_set"}].` : `Find the primary, central ${shape} Onyx artifact in the image. Ignore any other artifacts in the background or corners.
Instructions: 
1. Focus ONLY on the artifact closest to the center of the image.
2. If it is a bowl, basin, or canoe, strictly extract and separate the 'rim', 'interior', and 'exterior' of that central artifact ONLY. 
3. CRITICAL: You MUST include the natural, rough, or unpolished outer rock edges as part of the artifact. Do NOT crop out or ignore the rough edges (e.g. the bark-like exterior or rustic edges of bowls and canoes). 
4. For MIRRORS, the SOLID ONYX MIRROR FRAME is your absolute priority. You MUST output exactly TWO objects:
   - 1. A bounding box labeled 'mirror_frame' that encompasses the entire stone frame (outer edge). Do NOT provide a polygon for this.
   - 2. A polygon labeled 'mirror_glass' that tightly traces the exact inner boundary where the onyx frame meets the center glass reflection. 
   - CRITICAL for mirror_glass: Provide a 'polygon' array of 24 to 36 [y, x] coordinates (normalized 0-1000) tracing the inner edge of the stone frame. You MUST output enough points to accurately capture the natural wavy irregular inner contour of the stone. This polygon will be used to cut out the center reflection.
   - Completely EXCLUDE cardboard on the floor, people holding the mirror, and any reflections of the floor/people visible INSIDE the mirror glass from your consideration.
Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "string", "polygon": [[y,x], ...]}].`;

                try {
                    // Use the latest 2.5 model for unparalleled detection logic
                    const data = await callGemini(instruction, base64, 40000, "gemini-2.5-pro");
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
                    logOp(op.id, `[ WAIT ] Extracting high-res global boundary on GPU...`);
                    const bgBlobFull = await checkAbort(op.id, removeBackground(processedSdrUrl, {
                        output: { format: 'image/png' }, device: 'gpu' as any, debug: false,
                    }), 60000);
                    const maskImgFull = await loadImage(URL.createObjectURL(bgBlobFull));
                    const rcvFull = document.createElement('canvas'); rcvFull.width = maskImgFull.width; rcvFull.height = maskImgFull.height;
                    const rctxFull = rcvFull.getContext('2d', { willReadFrequently: true })!;
                    rctxFull.clearRect(0, 0, rcvFull.width, rcvFull.height); rctxFull.drawImage(maskImgFull, 0, 0);
                    rctxFull.globalCompositeOperation = 'source-in'; rctxFull.fillStyle = 'white'; rctxFull.fillRect(0, 0, rcvFull.width, rcvFull.height);
                    rctxFull.globalCompositeOperation = 'destination-over'; rctxFull.fillStyle = 'black'; rctxFull.fillRect(0, 0, rcvFull.width, rcvFull.height);
                    rctxFull.globalCompositeOperation = 'source-over';
                    const contourFull = findContour(rctxFull.getImageData(0, 0, rcvFull.width, rcvFull.height));
                    const simplifiedFull = simplifyContour(contourFull, 0.2);

                    for (let idx = 0; idx < processed.length; idx++) {
                        if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");
                        const m = processed[idx];
                        updateOp(op.id, { progress: 15 + ((idx/processed.length) * 75), stepLabel: `Extracting Mask ${idx+1}/${processed.length}...` });
                        
                        if (m.polygon && m.polygon.length > 0 && String(m.label).toLowerCase() === 'mirror_glass') {
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

                        masks.push({
                            label: m.label || 'artifact',
                            x: 0, y: 0, 
                            width: 1, height: 1,
                            maskWidth: maskImgFull.width,
                            maskHeight: maskImgFull.height,
                            path: createCurvePath(simplifiedFull)
                        });
                    }

                    logOp(op.id, '[ WAIT ] Generating high-res cutout...');
                    const { pngData, svgData } = await checkAbort(op.id, generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks, isCylPendant));
                    localMaskUrl = pngData;
                    op.result = op.result || {};
                    op.result.cloudSegmentationMasks = JSON.stringify({
                        width: img.width, height: img.height,
                        svgData: svgData, layers: masks
                    });
                    logOp(op.id, '[  OK  ] Cloud Mask generated');

                } catch (e: any) {
                    logOp(op.id, `[ FAIL ] Cloud Mask failed: ${e.message}`);
                    console.error(e);
                }
            } else if (op.processingMode === 'hybrid') {
                logOp(op.id, '[ WAIT ] [HYBRID 1/4] Running Local GPU AI for initial background removal...');
                try {
                    updateOp(op.id, { progress: 15, stepLabel: 'Preparing Full-Res SDR Image...' });
                    const sdrDataUrl = await new Promise<string>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width; canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error('Canvas error'));
                            ctx.drawImage(img, 0, 0, img.width, img.height);
                            resolve(canvas.toDataURL('image/jpeg', 1.0));
                        };
                        img.onerror = () => reject(new Error('Image load failed'));
                        img.src = imageUrl;
                    });

                    logOp(op.id, '[ WAIT ] [HYBRID 1/4] Extracting background on GPU...');
                    const processedSdrUrl = await preprocessForMasking(sdrDataUrl);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");

                    const bgBlob = await checkAbort(op.id, removeBackground(processedSdrUrl, {
                        output: { format: 'image/png' },
                        device: 'gpu' as any,
                        debug: false,
                        progress: (key, current, total) => {
                            const p = Math.round((current / total) * 100);
                            updateOp(op.id, { progress: 15 + (p * 0.25), stepLabel: `GPU Extracting: ${key} ${p}%` });
                        }
                    }), 120000);

                    const img = await loadImage(imageUrl);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");

                    const initialLocalMaskUrl = await applyAlphaMask(sdrDataUrl, bgBlob, isCylPendant);
                    logOp(op.id, '[  OK  ] [HYBRID 1/4] Local GPU mask generated');

                    logOp(op.id, '[ WAIT ] [HYBRID 2/4] Tracing vector contours (Bézier curve engine)...');
                    updateOp(op.id, { progress: 45, stepLabel: 'Traced Vector Boundaries...' });
                    const maskImg = await loadImage(initialLocalMaskUrl);
                    const mCanvas = document.createElement('canvas');
                    mCanvas.width = maskImg.width; mCanvas.height = maskImg.height;
                    const mCtx = mCanvas.getContext('2d', { willReadFrequently: true })!;
                    mCtx.drawImage(maskImg, 0, 0);
                    const mData = mCtx.getImageData(0, 0, maskImg.width, maskImg.height);
                    const contour = findContour(mData);
                    const simplified = simplifyContour(contour, 2.0);
                    const svgPath = createCurvePath(simplified);
                    
                    op.result = op.result || {};
                    op.result.localSegmentationMasks = JSON.stringify({
                        width: maskImg.width, height: maskImg.height,
                        path: svgPath, pointCount: simplified.length,
                        points: simplified.map(p => [Math.round((p.y / maskImg.height) * 1000), Math.round((p.x / maskImg.width) * 1000)])
                    });
                    logOp(op.id, `[  OK  ] [HYBRID 2/4] Extracted ${simplified.length} vector points`);

                    logOp(op.id, '[ WAIT ] [HYBRID 3/4] Prompting Cloud AI for multi-layer refinement...');
                    updateOp(op.id, { progress: 60, stepLabel: 'Querying Cloud AI for Refinement...' });
                    
                    const shape = itemData.shape || 'object';
                    const hybridInstruction = isCylPendant ? `We performed initial GPU segmentation on these Cylinder Pendant Onyx lamps/fixtures. Now perform Cloud AI Refinement.
Notice these items are packed in SETS (multiple vertical stone cylinders arranged in a row or grid against a black studio background).
Instructions:
1. You MUST include the entire set of cylinders in the bounding box. Do NOT ignore any cylinder in the group.
2. Output a SINGLE bounding box labeled 'cylinder_set' that encompasses all cylinders shown in the photo from the top-leftmost cylinder edge to the bottom-rightmost cylinder edge.
3. Completely ignore black studio background edges, cardboard on the floor, or extraneous studio objects.
Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "cylinder_set"}].` : `We performed initial local GPU segmentation on this ${shape} Onyx artifact (with ${simplified.length} vector points). Now perform Cloud AI Vector Refinement to generate clean semantic layers and boundaries.
Instructions:
1. Focus ONLY on the primary artifact in the center of the image. Ignore cardboard, studio backgrounds, or people.
2. For MIRRORS, the SOLID ONYX MIRROR FRAME is your absolute priority. You MUST output exactly TWO objects:
   - A bounding box labeled 'mirror_frame' encompassing the outer edge of the stone frame.
   - A polygon labeled 'mirror_glass' tracing the exact inner boundary where the onyx frame meets the reflection glass (provide 24 to 36 [y, x] coordinates normalized 0-1000).
3. For bowls, basins, or canoes, separate 'rim', 'interior', and 'exterior' if distinct, or output a single comprehensive bounding box including all rough rock exterior edges.
4. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "string", "polygon": [[y,x], ...]}].`;

                    try {
                        const cloudData = await callGemini(hybridInstruction, base64, 40000, "gemini-2.5-pro");
                        let resultText = cloudData?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!resultText) throw new Error("Empty response from Cloud Engine");
                        if (resultText.includes('```')) {
                            const match = resultText.match(/```(?:json)?([\s\S]*?)```/);
                            if (match) resultText = match[1].trim();
                            else resultText = resultText.replace(/```(json)?|```/g, '').trim();
                        }
                        const processed = JSON.parse(resultText);
                        logOp(op.id, `[  OK  ] [HYBRID 3/4] Cloud AI refined ${processed.length} layers`);
                        updateOp(op.id, { progress: 80, stepLabel: 'Building Final Refined SVG Masks...' });

                        const originalWidth = img.width; const originalHeight = img.height;
                        const targetSize = 1024;
                        let drawW, drawH;
                        if (originalWidth > originalHeight) { drawW = targetSize; drawH = Math.round(originalHeight * (targetSize / originalWidth)); } 
                        else { drawH = targetSize; drawW = Math.round(originalWidth * (targetSize / originalHeight)); }
                        const offsetX = (targetSize - drawW) / 2; const offsetY = (targetSize - drawH) / 2;

                        const cloudMasks: any[] = [];
                        for (let idx = 0; idx < processed.length; idx++) {
                            if (cancelTokens.current[op.id]) throw new Error("Cancelled by user");
                            const m = processed[idx];
                            if (m.polygon && m.polygon.length > 0 && String(m.label).toLowerCase() === 'mirror_glass') {
                                const pts = m.polygon.map((pt: any[]) => {
                                    const raw_px = pt[1] / 1000; const raw_py = pt[0] / 1000;
                                    return { x: (raw_px * targetSize - offsetX) / drawW, y: (raw_py * targetSize - offsetY) / drawH };
                                });
                                cloudMasks.push({ label: m.label, x: 0, y: 0, width: 1, height: 1, maskWidth: 1, maskHeight: 1, path: createCurvePath(pts) });
                                continue;
                            }
                            cloudMasks.push({
                                label: m.label || 'artifact',
                                x: 0, y: 0, width: 1, height: 1,
                                maskWidth: img.width,
                                maskHeight: img.height,
                                path: createCurvePath(simplified)
                            });
                        }

                        logOp(op.id, '[ WAIT ] [HYBRID 4/4] Generating final high-res SVG & PNG cutout...');
                        const { pngData, svgData } = await checkAbort(op.id, generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, cloudMasks, isCylPendant));
                        localMaskUrl = pngData || initialLocalMaskUrl;
                        op.result.cloudSegmentationMasks = JSON.stringify({
                            width: img.width, height: img.height,
                            svgData: svgData, layers: cloudMasks
                        });
                        logOp(op.id, '[  OK  ] [HYBRID 4/4] Hybrid pipeline completed successfully!');
                    } catch (cloudErr: any) {
                        logOp(op.id, `[ WARN ] Cloud refinement fallback to GPU mask: ${cloudErr.message}`);
                        localMaskUrl = initialLocalMaskUrl;
                    }
                } catch (err: any) {
                    logOp(op.id, `[ FAIL ] Hybrid segmentation failed: ${err.message}`);
                    console.error(err);
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
                    localMaskUrl = await applyAlphaMask(sdrDataUrl, bgBlob, isCylPendant);
                    logOp(op.id, '[  OK  ] Mask generated locally');
                    try {
                        const maskImg = await loadImage(localMaskUrl);
                        const mCanvas = document.createElement('canvas');
                        mCanvas.width = maskImg.width; mCanvas.height = maskImg.height;
                        const mCtx = mCanvas.getContext('2d', { willReadFrequently: true })!;
                        mCtx.drawImage(maskImg, 0, 0);
                        const mData = mCtx.getImageData(0, 0, maskImg.width, maskImg.height);
                        const contour = findContour(mData);
                        const simplified = simplifyContour(contour, 2.0);
                        const svgPath = createCurvePath(simplified);
                        op.result = op.result || {};
                        op.result.localSegmentationMasks = JSON.stringify({
                            width: maskImg.width, height: maskImg.height,
                            path: svgPath, pointCount: simplified.length,
                            points: simplified.map(p => [Math.round((p.y / maskImg.height) * 1000), Math.round((p.x / maskImg.width) * 1000)])
                        });
                    } catch (vErr) {
                        console.warn("Could not parse local vector mask:", vErr);
                    }
                } catch (err: any) {
                    logOp(op.id, `[ FAIL ] Mask generation failed: ${err.message}`);
                    console.error(err);
                }
            }
            } else {
                logOp(op.id, '[ SKIP ] Image processing skipped');
            }

            let finalColors = processed.dominantColors || [];
            let bitmapRes: any = {};
            if (!isVideo) {
                bitmapRes = await generateBitmapAndHexMap(localMaskUrl || op.result?.maskUrl || op.imageUrl, 20, 20, 80, 149, 61, 199, itemData.material, itemData.shape, itemData.color);
                finalColors = (processed.dominantColors && processed.dominantColors.length > 0) ? processed.dominantColors : bitmapRes.dominantColors;
            }

            updateOp(op.id, { 
                status: 'completed', 
                progress: 100, 
                forceRegenerateDescription: false,
                result: {
                    ...op.result,
                    description: processed.description,
                    marketingDescription: processed.marketingDescription,
                    dominantColors: finalColors,
                    generatedType: processed.generatedType || op.result?.generatedType,
                    maskUrl: localMaskUrl || op.result?.maskUrl || undefined,
                    bitmapUrl: bitmapRes.bitmapDataUrl || op.result?.bitmapUrl,
                    hexString: bitmapRes.hexString || op.result?.hexString,
                    cols: bitmapRes.cols || op.result?.cols,
                    rows: bitmapRes.rows || op.result?.rows,
                    videoGen: processed.videoGen || op.result?.videoGen
                }
            });

            // Propagate generated description and colors to all sibling images of the same item
            if ((op.imageIndex || 0) === 0) {
                setQueue(prev => prev.map(q => {
                    if (q.item.id === op.item.id && q.id !== op.id) {
                        return {
                            ...q,
                            result: {
                                ...q.result,
                                description: processed.description,
                                marketingDescription: processed.marketingDescription,
                                dominantColors: finalColors,
                                generatedType: processed.generatedType || op.result?.generatedType
                            }
                        };
                    }
                    return q;
                }));
            }
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

    const handleRegenerateAI = (id: string) => {
        cancelTokens.current[id] = false;
        setQueue(prev => prev.map(op => 
            op.id === id 
                ? { ...op, status: 'idle', progress: 0, forceRegenerateDescription: true, logs: ['[ WAIT ] Re-queued for AI regeneration'] }
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
        if (!op.result?.description && !op.result?.marketingDescription) return;
        const toastId = toast.loading(tr("Saving description..."));
        try {
            const itemId = op.item.data?.id || op.item.id || op.item.row;
            const updatePayload: any = {};
            if (op.result.description) updatePayload.detailed_description = op.result.description;
            if (op.result.marketingDescription) updatePayload.generated_description = op.result.marketingDescription;
            let processedMap: Record<string, string> = {};
            const itemData = op.item.data || op.item || {};
            const rawMedia = itemData.processedMediaUrls || itemData.processed_media_urls;
            if (rawMedia && typeof rawMedia === 'string' && rawMedia.startsWith('{')) {
                try {
                    processedMap = JSON.parse(rawMedia);
                } catch (e) {}
            }
            if (op.result.dominantColors && op.result.dominantColors.length > 0) {
                const genColorStr = op.result.dominantColors.join(', ');
                updatePayload.generated_color = genColorStr;
                processedMap['_generated_color'] = genColorStr;
            }
            if (op.result.generatedType) {
                updatePayload.generated_type = op.result.generatedType;
                processedMap['_generated_type'] = op.result.generatedType;
            }
            if (op.result.videoGen) {
                processedMap['videoGen'] = op.result.videoGen;
            }
            updatePayload.processed_media_urls = JSON.stringify(processedMap);
            if (op.result.localSegmentationMasks) updatePayload.local_segmentation_masks = op.result.localSegmentationMasks;
            if (op.result.cloudSegmentationMasks) {
                updatePayload.cloud_segmentation_masks = op.result.cloudSegmentationMasks;
                updatePayload.spatial_masks = op.result.cloudSegmentationMasks;
            }
            
            // Generate and save Classification and Type
            const catAndType = getProductCategoryAndType({
                ...itemData,
                description: op.result.description || itemData.description,
                type: op.result.generatedType || itemData.type
            });
            if (catAndType) {
                updatePayload.product_category = catAndType.category;
                updatePayload.product_type = catAndType.type;
                processedMap['_product_category'] = catAndType.category;
                processedMap['_product_type'] = catAndType.type;
            }
            
            if (Object.keys(processedMap).length > 0) {
                updatePayload.processed_media_urls = JSON.stringify(processedMap);
            }
            if (op.result.hexString) {
                updatePayload.spatial_points = [{
                    type: 'pixel_map',
                    dimensions: `${op.result.cols || 20}x${op.result.rows || 20}`,
                    cols: op.result.cols || 20,
                    rows: op.result.rows || 20,
                    hex_string: op.result.hexString,
                    bitmap_url: op.result.bitmapUrl || null
                }];
            }

            const { error: sbErr } = await supabase.from('inventory').update(updatePayload).eq('id', itemId);
            if (sbErr) {
                if (sbErr.code === '42703' || sbErr.message?.includes('column')) {
                    const fallbackPayload = { ...updatePayload };
                    delete fallbackPayload.generated_type;
                    delete fallbackPayload.generated_color;
                    delete fallbackPayload.local_segmentation_masks;
                    delete fallbackPayload.cloud_segmentation_masks;
                    delete fallbackPayload.product_category;
                    delete fallbackPayload.product_type;
                    const { error: retryErr } = await supabase.from('inventory').update(fallbackPayload).eq('id', itemId);
                    if (retryErr) throw retryErr;
                } else {
                    throw sbErr;
                }
            }
            toast.success(tr("Description saved!"), { id: toastId });
            setInventoryVersion(Date.now());
        } catch (e: any) {
            toast.error('Failed to save description: ' + (e.message || ''), { id: toastId });
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
                let lastMarketingDescription = '';
                let lastColors: string[] = [];
                let lastGeneratedType = '';
                
                for (const op of ops) {
                    if (op.result?.maskUrl && op.result.maskUrl.startsWith('data:')) {
                        const ext = op.result.maskUrl.startsWith('data:image/webp') ? 'webp' : 'png';
                        const upRes = await handleProcessedFileUpload(op.result.maskUrl, `mask_${op.id}.${ext}`, user);
                        if (upRes && upRes.thumbnailUrl) {
                            op.result.maskUrl = upRes.thumbnailUrl;
                        }
                    }

                    if (op.result?.bitmapUrl && op.result.bitmapUrl.startsWith('data:')) {
                        const upRes = await handleProcessedFileUpload(op.result.bitmapUrl, `bitmap_${op.id}.webp`, user);
                        if (upRes && upRes.thumbnailUrl) {
                            op.result.bitmapUrl = upRes.thumbnailUrl;
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
                    if (op.result?.marketingDescription) {
                        lastMarketingDescription = op.result.marketingDescription;
                    }
                    if (op.result?.dominantColors && op.result.dominantColors.length > 0) {
                        lastColors = op.result.dominantColors;
                    }
                    if (op.result?.generatedType) {
                        lastGeneratedType = op.result.generatedType;
                    }
                }
                
                let lastLocalMasks = '';
                let lastCloudMasks = '';
                ops.forEach(op => {
                    if (op.result?.localSegmentationMasks) lastLocalMasks = op.result.localSegmentationMasks;
                    if (op.result?.cloudSegmentationMasks) lastCloudMasks = op.result.cloudSegmentationMasks;
                });
                
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
                let lastHexString = '';
                let lastBitmapUrl = '';
                let lastCols = 20;
                let lastRows = 20;
                ops.forEach(op => {
                    if (op.result?.maskUrl && op.imageUrl) {
                        processedMap[op.imageUrl] = op.result.maskUrl;
                    }
                    if (op.result?.videoGen) {
                        processedMap['videoGen'] = op.result.videoGen;
                    }
                    if (op.result?.hexString) {
                        lastHexString = op.result.hexString;
                        lastBitmapUrl = op.result.bitmapUrl || '';
                        if (op.result.cols) lastCols = op.result.cols;
                        if (op.result.rows) lastRows = op.result.rows;
                    }
                });

                if (!lastHexString || lastColors.length === 0) {
                    const primaryUrl = combinedMaskUrls[0] || itemData.generatedPngUrl || itemData.imageUrl;
                    const bitmapRes = await generateBitmapAndHexMap(primaryUrl, 20, 20, 80, 149, 61, 199, itemData.material, itemData.shape, itemData.color);
                    if (!lastHexString) {
                        lastHexString = bitmapRes.hexString;
                        lastBitmapUrl = bitmapRes.bitmapDataUrl;
                        lastCols = bitmapRes.cols;
                        lastRows = bitmapRes.rows;
                    }
                    if (lastColors.length === 0) {
                        lastColors = bitmapRes.dominantColors;
                    }
                }

                if (!lastMarketingDescription) {
                    lastMarketingDescription = generateFallbackMarketingHtml(itemData);
                }

                if (lastHexString) {
                    processedMap['_pixel_map_hex'] = lastHexString;
                    if (lastBitmapUrl) processedMap['_bitmap_url'] = lastBitmapUrl;
                }

                if (lastColors.length > 0) {
                    processedMap['_generated_color'] = lastColors.join(', ');
                }

                if (lastGeneratedType) {
                    processedMap['_generated_type'] = lastGeneratedType;
                }

                const updatePayload: any = { 
                    detailed_description: lastDescription || itemData.detailedDescription || itemData.detailed_description || null,
                    generated_description: lastMarketingDescription,
                    spatial_masks: updatedMasks,
                    processed_media_urls: JSON.stringify(processedMap),
                    generated_png_url: combinedMaskUrls[0] || null
                };

                if (lastColors.length > 0) {
                    updatePayload.generated_color = lastColors.join(', ');
                }

                if (lastGeneratedType) {
                    updatePayload.generated_type = lastGeneratedType;
                }
                if (lastLocalMasks) updatePayload.local_segmentation_masks = lastLocalMasks;
                if (lastCloudMasks) {
                    updatePayload.cloud_segmentation_masks = lastCloudMasks;
                    updatePayload.spatial_masks = lastCloudMasks;
                }

                if (lastHexString) {
                    updatePayload.spatial_points = [{
                        type: 'pixel_map',
                        dimensions: `${lastCols}x${lastRows}`,
                        cols: lastCols,
                        rows: lastRows,
                        hex_string: lastHexString,
                        bitmap_url: lastBitmapUrl || null
                    }];
                }

                const { error: sbErr } = await supabase.from('inventory').update(updatePayload).eq('id', itemId);
                if (sbErr) {
                    if (sbErr.code === '42703' || sbErr.message?.includes('column')) {
                        const fallbackPayload = { ...updatePayload };
                        delete fallbackPayload.generated_type;
                        delete fallbackPayload.generated_color;
                        delete fallbackPayload.local_segmentation_masks;
                        delete fallbackPayload.cloud_segmentation_masks;
                        delete fallbackPayload.video_gen;
                        const { error: retryErr } = await supabase.from('inventory').update(fallbackPayload).eq('id', itemId);
                        if (retryErr) throw retryErr;
                    } else {
                        throw sbErr;
                    }
                }
                
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
            const bookPrefix = normData.workbook || itemData.workbook || '326';
            const codes = calculateCodesAndPrices(itemData, activeRate, bookPrefix);
            
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

            const combinedMaskUrls = ops.map(op => (op.skipImageProcessing ? op.imageUrl : (op.result?.maskUrl || op.imageUrl))).filter(Boolean) as string[];

            let lastDescription = '';
            let lastMarketingDesc = '';
            let lastColors: string[] = [];
            for (const op of ops) { 
                if (op.result?.description) lastDescription = op.result.description; 
                if (op.result?.marketingDescription) lastMarketingDesc = op.result.marketingDescription;
                if (op.result?.dominantColors && op.result.dominantColors.length > 0) lastColors = op.result.dominantColors;
            }

            const pdfProcessedMap: Record<string, string> = {};
            ops.forEach(op => {
                if (!op.skipImageProcessing && op.result?.maskUrl && op.imageUrl) {
                    pdfProcessedMap[op.imageUrl] = op.result.maskUrl;
                }
            });

            const pdfData = { 
                ...normData, 
                book_barcode: codes?.bookBarcode || normData.book_barcode || normData.itemId || '',
                book_aq_code: codes?.bookAqCode || normData.book_aq_code || '',
                book_land_code: codes?.bookLandCode || normData.book_land_code || '',
                book_acquisition: codes?.bookAcquisition || normData.book_acquisition || '',
                book_landed: codes?.bookLanded || normData.book_landed || '',
                book_retail: codes?.bookRetail || normData.book_retail || '',
                description: lastDescription || normData.description,
                detailed_description: lastDescription || normData.detailed_description, 
                marketing_description: lastMarketingDesc || normData.generatedDescription || normData.generated_description || generateFallbackMarketingHtml(normData),
                dominant_colors: (lastColors.length > 0 ? lastColors.join(', ') : (normData.color || '')),
                processed_media_urls: JSON.stringify(pdfProcessedMap),
                category: category
            };
            
            const numImages = combinedMaskUrls.length;
            const quantity = Number(normData.quantity) || 1;
            const isCylinderPendant = (normData.type || '').toUpperCase().includes('CYLINDER PENDANT');

            const isQtyMatchesImages = quantity === numImages && numImages > 1;
            const isCylinderBoxSet = isCylinderPendant && quantity > numImages && numImages > 1;

            if (isQtyMatchesImages || isCylinderBoxSet) {
                let qtyPerRow = 1;
                if (isCylinderBoxSet) {
                    const w = Math.round(parseFloat(normData.widthCm) || 0);
                    if (w === 12 || w === 10) qtyPerRow = 9;
                    else if (w === 8) qtyPerRow = 12;
                    else qtyPerRow = Math.round(quantity / numImages);
                }
                
                ops.forEach((op, index) => {
                    const singleMask = combinedMaskUrls[index] ? [combinedMaskUrls[index]] : [];
                    const partSuffix = `(${index + 1} of ${numImages})`;
                    const modifiedNormData = { ...normData, quantity: qtyPerRow, partSuffix };
                    
                    exportDataList.push({ op, category, vendorName, allMasks: singleMask, overrideNormData: modifiedNormData });
                    
                    const singlePdfData = { ...pdfData, quantity: qtyPerRow, partSuffix };
                    
                    catalogResults.push({
                        data: singlePdfData,
                        codes: {
                            ...codes,
                            primaryPriceLabel: 'USD RETAIL',
                            primaryPriceValue: `$${codes.bookRetail} USD`
                        },
                        images: singleMask.length > 0 ? singleMask.map(u => getCleanImageUrl(u)!) : [],
                        exportType: 'catalog'
                    });
                });
            } else {
                exportDataList.push({ op: primaryOp, category, vendorName, allMasks: combinedMaskUrls });
                
                const isSingleItemMultiImage = quantity === 1 && numImages > 1;
                
                catalogResults.push({
                    data: pdfData,
                    codes: {
                        ...codes,
                        primaryPriceLabel: 'USD RETAIL',
                        primaryPriceValue: `$${codes.bookRetail} USD`
                    },
                    images: combinedMaskUrls.length > 0 ? combinedMaskUrls.map(u => getCleanImageUrl(u)!) : collectAllImages(normData),
                    exportType: isSingleItemMultiImage ? 'catalog-grid' as any : 'catalog'
                });
            }
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
                'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Option1 Name', 'Option1 Value', 'Variant Position', 'Variant SKU', 'Variant Barcode', 'Variant Cost',
                'Variant Price', 'Variant Grams', 'Image Src', 'Image Command', 'Image Position', 'Variant Image', 
                'Metafield: custom.product_weight [single_line_text_field]', 
                'Variant Metafield: Vendor_SKU', 'Variant Weight Unit', 
                'Variant Metafield: reg.variant_depth', 'Variant Metafield: reg.variant_width', 
                'Variant Metafield: reg.variant_height', 'Variant Metafield: reg.variant_measurements', 
                'Metafield: Measurements', 'Metafield: shopify.material [list.metaobject_reference]', 
                'Metafield: custom.variety [list.single_line_text_field]', 'Product Category', 
                'Tags', 'Metafield: shopify.color-pattern [list.metaobject_reference]', 
                'Metafield: custom.polish_type [list.single_line_text_field]', 
                'Metafield: custom.cut_type [list.single_line_text_field]', 
                'Metafield: shopify.age-group [list.metaobject_reference]', 
                'Metafield: shopify.target-gender [list.metaobject_reference]', 
                'Variant Metafield: mm-google-shopping.custom_label_1', 
                'Metafield: reg.designer', 'Status', 'Published', 'Published Scope', 
                'Variant Taxable', 'Variant Inventory Tracker', 'Variant Inventory Policy', 
                'Variant Fulfillment Service', 'Variant Requires Shipping',
                'Included / Art Of Decor', 'Included / Trade Partners - Fountains', 'Included / Trade Partners - Pendant Lights'
            ];
            sheet.addRow(sanitizeExcelRow(headers));
            sheet.getRow(1).font = { bold: true };

            exportDataList.forEach(({ op, category, vendorName, allMasks, overrideNormData }) => {
                const itemData = op.item.data || op.item;
                const norm = overrideNormData || normalizeInventoryData(itemData);
                const bookPrefix = norm.workbook || itemData.workbook || '326';
                const calc = calculateCodesAndPrices(norm, activeRate, bookPrefix);
                
                const shape = norm.shape || '';
                const shortDesc = norm.shortDescription || norm.type || '';
                const color = norm.color || '';
                const material = norm.material || '';
                const fallbackTitle = `${shape} ${shortDesc} ${color} ${material}`.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const title = formatProductTitle(op.result?.description || fallbackTitle) + (norm.partSuffix ? ` ${norm.partSuffix}` : '');

                const bodyHtml = op.result?.marketingDescription || norm.generatedDescription || generateFallbackMarketingHtml(norm);

                let colorsStr = '';
                if (op.result?.dominantColors && op.result.dominantColors.length > 0) {
                    colorsStr = op.result.dominantColors.join(', ');
                } else if (norm.color && norm.color.includes(',')) {
                    colorsStr = norm.color;
                } else {
                    colorsStr = getStoneStyleColors(material, `${shape} ${shortDesc}`, color).join(', ');
                }

                const testStr = `${shape} ${shortDesc} ${category} ${title} ${material}`;
                const artOfDecorVal = 'TRUE';
                const fountainsVal = /fountain|fuente|cascada/i.test(testStr) ? 'TRUE' : 'FALSE';
                const pendantsVal = /pendant|colgante|lámpara colgante|hanging/i.test(testStr) ? 'TRUE' : 'FALSE';

                const tagId = calc.printCode || calc.bookBarcode || norm.book_barcode || norm.itemId || String(itemData.row) || '';
                const vendorSku = calc.bookAqCode || tagId.replace(/^[A-Za-z]{2}[-]?\d{3}[-]?/, '') || tagId;
                
                const rawVendorId = String(norm.vendorId || norm.vendor_id || '').toUpperCase().trim();
                const vendorPrefix = rawVendorId.split('-')[0] || rawVendorId.substring(0, 2);

                // Strictly map polishType to allowed Shopify choices:
                // ["Fully Polished", "Raw/Unpolished", "Partially Polished", "Single-Side Polish", "Double-Side Polish", "Tumbled", "Matte"]
                let polishType = 'Matte';
                if (vendorPrefix === 'JM') {
                    polishType = 'Fully Polished';
                } else if (['TE', 'EM', 'ML'].includes(vendorPrefix)) {
                    polishType = 'Partially Polished';
                }

                const parseNum = (val: any) => { const num = parseFloat(val); return isNaN(num) ? 0 : num; };
                const cmToIn = (cm: any) => (parseNum(cm) / 2.54).toFixed(2);
                const kgToLbs = (kg: any) => (parseNum(kg) * 2.20462).toFixed(2);
                
                const costMxn = parseFloat(norm.price || norm.acquisition_price_mxn || '0') || 0;
                const cost = calc.bookLanded || '';
                const price = calc.bookRetail && calc.bookRetail !== '-' ? parseFloat(calc.bookRetail) || 0 : ((costMxn / activeRate) * 1.4 * 12) || 0;

                const weightKg = parseNum(norm.weightKg);
                const weightGrams = Math.round(weightKg * 1000);
                const weightLbs = kgToLbs(weightKg);
                
                const depthIn = cmToIn(norm.lengthCm);
                const widthIn = cmToIn(norm.widthCm);
                const heightIn = cmToIn(norm.heightCm);
                const measurementsStr = `D${depthIn}xW${widthIn}xH${heightIn}`;
                const variety = 'Mexican Onyx';
                const formattedMaterial = material ? material.charAt(0).toUpperCase() + material.slice(1) : 'Onyx';

                // Collect all images for the item
                let itemImages: string[] = [];
                if (op.skipImageProcessing) {
                    const raw = op.imageUrl || norm.imageUrl || norm.mediaUrls;
                    if (raw) {
                        itemImages = typeof raw === 'string' ? raw.split(',').map(s => s.trim()).filter(Boolean) : [raw];
                    }
                } else if (allMasks && allMasks.length > 0) {
                    itemImages = allMasks.map(m => getCleanImageUrl(m) || '').filter(Boolean);
                } else {
                    const primary = getCleanImageUrl(norm.generatedPngUrl) || getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]);
                    if (primary) itemImages.push(primary);
                }

                if (itemImages.length === 0) {
                    itemImages = [''];
                }

                // Clean Drive / image URLs
                itemImages = itemImages.map(img => {
                    let clean = getCleanImageUrl(img) || img;
                    if (clean && clean.includes('google') && !clean.toLowerCase().endsWith('.png') && !clean.toLowerCase().endsWith('.jpg')) {
                        clean = clean.includes('?') ? `${clean}&ext=.png` : `${clean}?.png`;
                    }
                    return clean;
                });

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

                const catAndType = getProductCategoryAndType(norm);
                const finalCategory = catAndType.category;
                const finalType = catAndType.type;
                const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || tagId.toLowerCase();

                // Export ONE row per image (Matrixify multi-image format)
                itemImages.forEach((imgUrl, imgIdx) => {
                    const imagePosition = imgIdx + 1;
                    const imageCommand = 'MERGE';
                    const variantImage = imgIdx === 0 ? imgUrl : '';

                    sheet.addRow(sanitizeExcelRow([
                        handle, title, bodyHtml, vendorName, finalType, 'Title', 'Default Title', 1, tagId, tagId, cost, price, weightGrams, imgUrl, imageCommand, imagePosition, variantImage, weightLbs, combinedVendorSku, '', depthIn, widthIn, heightIn, measurementsStr, '', formattedMaterial, variety, finalCategory, tagsArray, colorsStr, polishType, '', 'Adults', 'Unisex', 'Rare Earth Gallery', 'Rare Earth Gallery', 'active', 'FALSE', 'global', 'true', 'shopify', 'deny', 'manual', 'true', artOfDecorVal, fountainsVal, pendantsVal
                    ]));
                });
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

    const handleClearGen = async () => {
        if (!confirm(`Are you sure you want to clear AI generation data for ${queue.length} selected items?`)) return;
        
        const toastId = toast.loading(`Clearing AI data for ${queue.length} items...`);
        try {
            const ids = queue.map(op => op.item.id);
            if (ids.length === 0) return;
            
            const { error } = await supabase.from('inventory').update({
                detailed_description: null,
                spatial_masks: null,
                processed_media_urls: null,
                generated_png_url: null
            }).in('id', ids);
            
            if (error) throw error;
            
            // Also clear the queue state so UI updates
            setQueue(prev => prev.map(op => ({
                ...op,
                result: undefined,
                status: 'pending'
            })));
            setHasUnsavedChanges(true); // Treat this as a change that needs to be noticed
            
            toast.success(`Cleared AI data for ${ids.length} items!`, { id: toastId });
        } catch (e: any) {
            toast.error(`Clear failed: ${e.message}`, { id: toastId });
            console.error(e);
        }
    };

    const handleOptimizeLegacyPNGs = async () => {
        const toastId = toast.loading(tr("Finding masks to optimize..."));
        try {
            const { data, error } = await supabase.from('inventory').select('*').not('processed_media_urls', 'is', null);
            if (error) throw error;
            if (!data || data.length === 0) {
                toast.success(tr("No masks found!"), { id: toastId });
                return;
            }

            toast.loading(`Scanning ${data.length} items. Starting conversion...`, { id: toastId });
            let optimizedCount = 0;

            for (const item of data) {
                try {
                    let processedMap: Record<string, string> = {};
                    if (item.processed_media_urls) {
                        if (item.processed_media_urls.startsWith('{')) {
                            processedMap = JSON.parse(item.processed_media_urls);
                        }
                    }

                    // Skip if already optimized
                    if (processedMap['_optimized'] === 'true') continue;

                    let updated = false;
                    for (const [imgUrl, maskUrl] of Object.entries(processedMap)) {
                        if (imgUrl === '_optimized') continue;
                        if (maskUrl) {
                            toast.loading(`Optimizing mask ${optimizedCount + 1}...`, { id: toastId });
                            const img = await loadImage(maskUrl);
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d')!;
                            ctx.drawImage(img, 0, 0);
                            const webpData = canvas.toDataURL('image/webp', 0.85);
                            
                            const upRes = await handleProcessedFileUpload(webpData, `mask_opt_${item.id}.webp`, user);
                            if (upRes && upRes.thumbnailUrl) {
                                processedMap[imgUrl] = upRes.thumbnailUrl;
                                updated = true;
                            }
                        }
                    }

                    if (updated) {
                        processedMap['_optimized'] = 'true';
                        const maskUrls = Object.values(processedMap).filter(url => url !== 'true' && url);
                        await supabase.from('inventory').update({
                            processed_media_urls: JSON.stringify(processedMap),
                            generated_png_url: maskUrls.length > 0 ? maskUrls[0] : null
                        }).eq('id', item.id);
                        optimizedCount++;
                    }
                } catch (err) {
                    console.error(`Failed to optimize item ${item.id}`, err);
                }
            }
            
            if (optimizedCount > 0) {
                toast.success(`Optimized ${optimizedCount} masks successfully!`, { id: toastId });
                setInventoryVersion(Date.now());
            } else {
                toast.success(tr("All masks are already optimized!"), { id: toastId });
            }
        } catch (e: any) {
            toast.error(`Optimization failed: ${e.message}`, { id: toastId });
            console.error(e);
        }
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
            const needsContent = (op.imageIndex || 0) === 0 && (!op.result?.marketingDescription || !op.result?.dominantColors?.length || op.forceRegenerateDescription);
            if (op.status === 'completed' && !needsContent) {
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
            toast.success(tr("AI Batch Processing Complete!"));
        }
    };

    const handleClose = () => {
        if (isProcessing) {
            const ok = window.confirm(tr("Processing is active. Are you sure you want to abort and close?"));
            if (!ok) return;
            setIsAborted(true);
        }
        setIsOpen(false);
    };

    const toggleProcessingMode = (id: string) => {
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                const nextMode = op.processingMode === 'local' ? 'cloud' : op.processingMode === 'cloud' ? 'hybrid' : 'local';
                return { ...op, processingMode: nextMode };
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

    const allSkippingImage = queue.length > 0 && queue.every(op => op.skipImageProcessing);

    const toggleAllImageProcessing = () => {
        setHasUnsavedChanges(true);
        const nextState = !allSkippingImage;
        setQueue(prev => prev.map(op => ({
            ...op,
            skipImageProcessing: nextState
        })));
        toast.success(nextState ? "Image Processing OFF for all items (Using original images)" : "Image Processing ON for all items (Masks enabled)");
    };

    const handleRegenerateAllDescriptions = () => {
        if (!confirm(`Are you sure you want to force regenerate AI descriptions and colors for ALL (${queue.length}) active items in the queue?`)) return;
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if ((op.imageIndex || 0) !== 0) return op;
            return {
                ...op,
                forceRegenerateDescription: true,
                status: 'idle',
                progress: 0,
                logs: [...op.logs, '[ WAIT ] Re-queued for forced AI description & color generation']
            };
        }));
        toast.success(tr("All items enabled for AI description & color regeneration! Click START ENGINE to begin."));
    };

    const completedOps = queue.filter(op => op.status === 'completed');
    
    // Strict check: PDF and XLSX generation requires EVERY primary item to have the necessary AI generated fields
    const isFullyGenerated = queue.length > 0 && queue.every(op => {
        if ((op.imageIndex || 0) !== 0) return true;
        return op.result?.description &&
            op.result?.dominantColors && op.result.dominantColors.length > 0 &&
            op.result?.hexString &&
            op.result?.generatedType;
    });
    
    const allCompleted = queue.length > 0 && queue.every(op => op.status === 'completed');
    const needsProcessing = queue.some(op => 
        op.status !== 'completed' || 
        ((op.imageIndex || 0) === 0 && (!op.result?.marketingDescription || !op.result?.dominantColors?.length || op.forceRegenerateDescription))
    );

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
                            <h2 className="text-xl font-black uppercase tracking-tight text-white">{tr("Onyx.mx - Catalog Hub")}</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{tr("Batch segmentation & description logic")}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleAllImageProcessing}
                            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shadow-lg ${
                                allSkippingImage 
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                                    : 'bg-(--main-color)/20 text-(--main-color) border-(--main-color)/40 hover:bg-(--main-color)/30'
                            }`}
                            title={tr("Toggle Image Processing (Masks & Transparency) ON/OFF for ALL items")}
                        >
                            <UploadCloud size={16} className={allSkippingImage ? 'text-amber-300' : 'text-(--main-color)'} />
                            <span>{allSkippingImage ? 'IMG PROCESSING: OFF (ORIGINALS)' : 'IMG PROCESSING: ON (MASKS)'}</span>
                        </button>
                        <button 
                            onClick={handleRegenerateAllDescriptions}
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shadow-lg bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                            title={tr("Regenerate ALL Descriptions (Force AI body descriptions and color info for all active items)")}
                        >
                            <Sparkles size={16} className="text-emerald-300" />
                            <span>{tr("REGENERATE DESCRIPTIONS")}</span>
                        </button>
                        <button onClick={handleClearGen} title={tr("Clear AI Generated Data")} className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-rose-500 transition-all">
                            <Trash2 size={24} />
                        </button>
                        <button onClick={handleOptimizeLegacyPNGs} title={tr("Optimize Legacy PNG Masks to WebP")} className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-amber-400 transition-all">
                            <Sparkles size={24} />
                        </button>
                        <button onClick={() => setShowApiModal(true)} title={tr("API Settings")} className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
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
                                className="absolute top-0 left-0 bottom-0 bg-(--main-color)/30 transition-all duration-500 ease-out z-0"
                                style={{ width: `${op.progress}%` }}
                            />
                            
                            {/* Missing Data Indicator */}
                            {(op.imageIndex || 0) === 0 && (!op.result?.description || !op.result?.dominantColors?.length || !op.result?.hexString || !op.result?.generatedType) && (
                                <div 
                                    className="absolute top-4 right-4 z-20 w-4 h-4 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_10px_rgba(250,204,21,0.8)]" 
                                    title={tr("Incomplete Data: Missing Description, Colors, Hex Map, or Type")}
                                />
                            )}
                            
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
                                    {(() => {
                                        const thumbUrl = getCleanImageUrl(op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data?.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : ''));
                                        if (!thumbUrl) return (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
                                                <UploadCloud size={24} />
                                                <span className="text-[10px] font-black uppercase mt-2">{tr("No Image")}</span>
                                            </div>
                                        );
                                        
                                        const isThumbVideo = /\.(mov|mp4|webm|m4v)(\?|$)/i.test(thumbUrl);
                                        
                                        return (
                                            <>
                                                {isThumbVideo ? (
                                                    <video src={thumbUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 pointer-events-none" muted playsInline loop autoPlay />
                                                ) : (
                                                    <img src={thumbUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                                                    <ZoomIn size={24} className="text-white drop-shadow-md" />
                                                </div>
                                            </>
                                        );
                                    })()}
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
                                                <span className="text-[8px] font-black uppercase mt-1">{tr("Upload")}</span>
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!); }} className="flex flex-col items-center text-white/80 hover:text-white hover:scale-110 transition-all">
                                                <ZoomIn size={16} />
                                                <span className="text-[8px] font-black uppercase mt-1">{tr("View")}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 relative z-10 w-full flex flex-col justify-center min-w-0">
                                {/* Progress Line */}
                                <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-3 whitespace-nowrap overflow-x-auto scrollbar-none">
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 5 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 5 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> {tr("IMG")}
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 15 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 15 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> {tr("MASK")}
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.progress >= 70 ? 'text-(--main-color)' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.progress >= 70 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}`} /> AI
                                    </div>
                                    <div className="w-4 h-[1px] bg-white/5" />
                                    <div className={`flex items-center gap-1.5 transition-all ${op.status === 'completed' ? 'text-emerald-400' : 'text-white/20'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${op.status === 'completed' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]' : 'bg-white/20'}`} /> {tr("DONE")}
                                    </div>
                                </div>
                                
                                <div className="flex flex-col xl:flex-row items-start justify-between w-full gap-4">
                                    <div>
                                        <h4 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                                            {(() => {
                                                const norm = normalizeInventoryData(op.item.data || op.item);
                                                const calc = calculateCodesAndPrices(norm, activeRate, norm.workbook || op.item.workbook || '326');
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
                                    
                                    {/* Actions & Hex Map */}
                                    <div className="flex flex-col items-end gap-3 shrink-0">
                                        {/* Buttons */}
                                        <div className="flex flex-wrap gap-2 opacity-70 hover:opacity-100 transition-opacity justify-end">
                                        <button 
                                            onClick={() => toggleImageProcessing(op.id)}
                                            disabled={op.status !== 'idle'}
                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${
                                                !op.skipImageProcessing 
                                                    ? 'text-rose-400 hover:text-rose-300 bg-black/40 hover:bg-white/10'
                                                    : 'text-white/40 hover:text-white/60 bg-black/40 hover:bg-white/10'
                                            } ${op.status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title={tr("Toggle Image Processing")}
                                        >
                                            <UploadCloud size={14} /> {tr("IMG")}
                                        </button>
                                        <button 
                                            onClick={() => toggleProcessingMode(op.id)}
                                            disabled={op.status !== 'idle' || op.skipImageProcessing}
                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest ${
                                                op.processingMode === 'hybrid'
                                                    ? 'text-purple-400 hover:text-purple-300 bg-purple-500/10 border border-purple-500/30'
                                                    : op.processingMode === 'cloud' 
                                                    ? 'text-blue-400 hover:text-blue-300 bg-black/40 hover:bg-white/10'
                                                    : 'text-(--main-color) hover:text-(--main-color) bg-black/40 hover:bg-white/10'
                                            } ${op.status !== 'idle' || op.skipImageProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title={tr("Toggle Local / Cloud / Hybrid Processing")}
                                        >
                                            {op.processingMode === 'hybrid' ? <Layers size={14} className="animate-pulse" /> : op.processingMode === 'cloud' ? <Cloud size={14} /> : <Cpu size={14} />}
                                            {op.processingMode === 'hybrid' ? 'HYBRID' : op.processingMode === 'cloud' ? 'CLOUD' : 'LOCAL'}
                                        </button>
                                        
                                        {op.status === 'processing' && (
                                            <button 
                                                onClick={() => handleAbort(op.id)}
                                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-red-400 hover:text-red-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                title={tr("Abort Processing")}
                                            >
                                                <XCircle size={14} /> {tr("ABORT")}
                                            </button>
                                        )}
                                        {op.status === 'completed' && (
                                            <>
                                                <button 
                                                    onClick={() => handleRegenerate(op.id)}
                                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-amber-400 hover:text-amber-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                    title={tr("Re-Generate Mask")}
                                                >
                                                    <RefreshCw size={14} /> {tr("RE-GENERATE")}
                                                </button>
                                                <button 
                                                    onClick={() => handleRegenerateAI(op.id)}
                                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-blue-400 hover:text-blue-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                    title={tr("Re-Generate AI Info")}
                                                >
                                                    <RefreshCw size={14} /> {tr("RE-GEN INFO")}
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        const rawUrl = op.result?.maskUrl || op.item?.generatedPngUrl || op.imageUrl || op.item?.imageUrl || '';
                                                        const cleanUrl = getCleanImageUrl(rawUrl) || rawUrl;
                                                        setCropModalState({ isOpen: true, opId: op.id, imageSrc: cleanUrl });
                                                    }}
                                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all text-purple-400 hover:text-purple-300 bg-black/40 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                                    title={tr("1:1 Square Crop Tool")}
                                                >
                                                    <Maximize2 size={14} /> {tr("1:1 CROP")}
                                                </button>
                                            </>
                                        )}
                                        </div>
                                        
                                        {/* HEX Map Top Area */}
                                        {op.result?.bitmapUrl && (
                                            <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-xl border border-white/10 animate-in fade-in zoom-in-95">
                                                <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1.5 pl-2">
                                                    <Sparkles size={12} className="text-amber-400"/> {op.result.cols || 20}x{op.result.rows || 20}
                                                </span>
                                                <img src={op.result.bitmapUrl} className="h-10 md:h-12 w-auto rounded-lg border border-white/20 shadow-lg" style={{ imageRendering: 'pixelated' }} />
                                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(op.result?.hexString || ''); toast.success(tr("Hexadecimal pixel map copied to clipboard!")); }} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white/90 transition-all cursor-pointer">
                                                    {tr("Copy Map")}
                                                </button>
                                            </div>
                                        )}
                                        {(() => {
                                            const pMap = op.result?.processedMap;
                                            const clipCount = parseInt(pMap?.videoGenCount || '0', 10);
                                            const clipUrls: string[] = [];
                                            if (clipCount > 0 && pMap) {
                                                for (let ci = 0; ci < clipCount; ci++) {
                                                    if (pMap[`videoGen_${ci}`]) clipUrls.push(pMap[`videoGen_${ci}`]);
                                                }
                                            } else if (pMap?.videoGen || op.result?.videoGen) {
                                                clipUrls.push(pMap?.videoGen || op.result?.videoGen);
                                            }
                                            if (clipUrls.length === 0) return null;
                                            return (
                                                <div className="flex flex-col gap-2 bg-black/40 p-2 rounded-xl border border-white/10 animate-in fade-in zoom-in-95">
                                                    <span className="text-[10px] font-black uppercase text-purple-400 flex items-center gap-1.5 pl-1">
                                                        <Video size={12} className="text-purple-400"/> {tr("AI Generated Video")}{clipUrls.length > 1 ? ` — ${clipUrls.length} Clips` : ''}
                                                    </span>
                                                    <div className={`flex gap-2 ${clipUrls.length > 1 ? 'overflow-x-auto pb-1' : ''}`}>
                                                        {clipUrls.map((url, ci) => (
                                                            <div key={ci} className="flex flex-col items-center gap-1 shrink-0">
                                                                {clipUrls.length > 1 && (
                                                                    <span className="text-[9px] font-bold text-white/40 uppercase">{tr("Clip")} {ci + 1}</span>
                                                                )}
                                                                <video
                                                                    src={url}
                                                                    controls
                                                                    autoPlay={ci === 0}
                                                                    loop
                                                                    muted
                                                                    className="h-48 md:h-64 w-auto rounded-lg border border-white/20 shadow-lg object-contain"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
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
                                    <div className="mt-4 flex flex-col gap-3 animate-in slide-in-from-top-2 w-full">
                                        {/* Compact Generated Content Area */}
                                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-white/5">
                                            {op.result.generatedType && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[9px] font-black uppercase text-white/40">{tr("AI:")}</span>
                                                    <span className="px-2 py-0.5 rounded bg-(--main-color)/20 border border-(--main-color)/40 text-[9px] font-extrabold text-(--main-color) uppercase tracking-wider">
                                                        {op.result.generatedType}
                                                    </span>
                                                </div>
                                            )}
                                            
                                            {op.result.dominantColors && op.result.dominantColors.length > 0 && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[9px] font-black uppercase text-white/40">{tr("Colors:")}</span>
                                                    <div className="flex items-center gap-1">
                                                        {op.result.dominantColors.map((c, i) => (
                                                            <span key={i} className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[8px] font-bold text-white/90 whitespace-nowrap">
                                                                {c}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-w-4xl">
                                            <label className="text-[9px] font-black uppercase tracking-wider text-white/40 block mb-1">{tr("Title Description")}</label>
                                            <textarea 
                                                value={op.result.description || ''}
                                                onChange={(e) => {
                                                    updateOp(op.id, { result: { ...op.result, description: e.target.value } });
                                                    setHasUnsavedChanges(true);
                                                }}
                                                className="w-full min-h-[44px] bg-black/30 border border-white/5 hover:border-white/20 rounded-xl p-3 text-xs md:text-sm text-white/90 font-mono leading-relaxed focus:outline-none focus:border-(--main-color) transition-all resize-y scrollbar-thin scrollbar-thumb-white/20"
                                                placeholder={tr("AI generated title description...")}
                                            />
                                        </div>
                                        {op.result.marketingDescription !== undefined && (
                                            <div className="max-w-5xl">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="text-[9px] font-black uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                                                        <Sparkles size={12}/> {tr("Marketing Description (Embedded HTML Review)")}
                                                    </label>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditHtmlId(editHtmlId === op.id ? null : op.id);
                                                        }}
                                                        className="text-[9px] font-black text-amber-400 hover:text-amber-300 underline uppercase tracking-wider cursor-pointer bg-white/5 px-2 py-0.5 rounded border border-white/10"
                                                    >
                                                        {editHtmlId === op.id ? 'View Styled Preview' : 'Edit Source HTML'}
                                                    </button>
                                                </div>
                                                {editHtmlId === op.id ? (
                                                    <textarea 
                                                        value={op.result.marketingDescription || ''}
                                                        onChange={(e) => {
                                                            updateOp(op.id, { result: { ...op.result, marketingDescription: e.target.value } });
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-full min-h-[100px] bg-black/60 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200/90 font-mono leading-relaxed focus:outline-none focus:border-amber-400 transition-all resize-y scrollbar-thin scrollbar-thumb-white/20"
                                                        placeholder={tr("AI generated HTML marketing description...")}
                                                    />
                                                ) : (
                                                    <div className="w-full min-h-[60px] bg-black/50 border border-white/15 rounded-xl p-4 text-xs md:text-sm text-white/90 leading-relaxed overflow-y-auto max-h-[220px] space-y-3 font-sans shadow-inner">
                                                        <style>{`
                                                            .marketing-preview-${op.id} p { margin-bottom: 0.75rem; line-height: 1.6; color: rgba(255, 255, 255, 0.92); font-size: 0.85rem; }
                                                            .marketing-preview-${op.id} strong { color: #f59e0b; font-weight: 700; }
                                                            .marketing-preview-${op.id} ul { list-style-type: disc; padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
                                                            .marketing-preview-${op.id} li { margin-bottom: 0.35rem; color: rgba(255, 255, 255, 0.85); font-size: 0.85rem; }
                                                        `}</style>
                                                        <div className={`marketing-preview-${op.id}`} dangerouslySetInnerHTML={{ __html: op.result.marketingDescription || '<p className="text-white/40 italic">No HTML description generated yet.</p>' }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleSaveDescription(op); }}
                                                className="flex items-center gap-2 px-4 py-2 bg-(--main-color)/20 hover:bg-(--main-color) text-(--main-color) hover:text-black text-[10px] font-black uppercase tracking-widest rounded-lg border border-(--main-color)/30 transition-all"
                                            >
                                                <Save size={14} />
                                                {tr("Save Description & Colors")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="relative z-10 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center shrink-0 ml-auto md:ml-0 mt-4 md:mt-0 bg-black/30 rounded-2xl border border-white/10">
                                {op.status === 'processing' && <Loader2 size={24} className="text-(--main-color) animate-spin" />}
                                {op.status === 'completed' && <CheckCircle2 size={24} className="text-emerald-500" />}
                                {op.status === 'failed' && <AlertCircle size={24} className="text-rose-500" />}
                                {op.status === 'idle' && <span className="text-[9px] md:text-[10px] font-black text-white/20">{tr("WAIT")}</span>}
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
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/50 whitespace-nowrap ml-2">{tr("PDF BRAND")}</label>
                            <select 
                                value={pdfBrand} 
                                onChange={(e) => setPdfBrand(e.target.value as any)} 
                                className="bg-black/50 text-white text-xs font-bold px-3 py-2 rounded-xl outline-none border border-white/5 focus:border-(--main-color)"
                            >
                                <option value="ArtOfDecor">{tr("ART OF DECOR")}</option>
                                <option value="RareEarth">{tr("RARE EARTH GALLERY")}</option>
                            </select>
                        </div>
                        
                        <button 
                            onClick={handleExportDatabase}
                            disabled={completedOps.length === 0 || !hasUnsavedChanges}
                            className={`flex items-center gap-3 px-6 py-4 font-black uppercase tracking-widest rounded-2xl transition-all shrink-0 ${(!hasUnsavedChanges && completedOps.length > 0) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500 hover:bg-blue-400 text-black shadow-[0_0_20px_rgba(59,130,246,0.3)]'} ${(completedOps.length === 0 || !hasUnsavedChanges) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {(!hasUnsavedChanges && completedOps.length > 0) ? <CheckCircle2 size={20} /> : <Save size={20} />}
                            {(!hasUnsavedChanges && completedOps.length > 0) ? 'SAVED TO DB' : 'SAVE TO DB'}
                        </button>
                        
                            <>
                                {!xlsxUrl ? (
                                    <button 
                                        onClick={handleGenerateXLSX}
                                        disabled={!isFullyGenerated || hasUnsavedChanges || isGeneratingXlsx}
                                        className="flex items-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {isGeneratingXlsx ? <Loader2 size={20} className="animate-spin" /> : <Settings2 size={20} />}
                                        {tr("Generate XLSX")}
                                    </button>
                                ) : (
                                    <a 
                                        href={xlsxUrl}
                                        download={`Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx`}
                                        className="flex items-center gap-3 px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shrink-0"
                                    >
                                        <Save size={20} />
                                        {tr("Download XLSX")}
                                    </a>
                                )}
                                
                                {!pdfUrl ? (
                                    <button 
                                        onClick={handleGeneratePDF}
                                        disabled={!isFullyGenerated || hasUnsavedChanges || isGeneratingPdf}
                                        className="flex items-center gap-3 px-6 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {isGeneratingPdf ? <Loader2 size={20} className="animate-spin" /> : <Settings2 size={20} />}
                                        {tr("Generate PDF")}
                                    </button>
                                ) : (
                                    <a 
                                        href={pdfUrl}
                                        download={`Catalog_AI_${new Date().toISOString().split('T')[0]}.pdf`}
                                        className="flex items-center gap-3 px-6 py-4 bg-rose-500 hover:bg-rose-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shrink-0"
                                    >
                                        <Save size={20} />
                                        {tr("Download PDF")}
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
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">{tr("API Key Required")}</h3>
                            <p className="text-xs text-white/40 mt-2 font-mono">{tr("Please enter your Gemini API Key. It will be stored securely in your local device storage.")}</p>
                        </div>
                        <input 
                            ref={apiInputRef}
                            type="password"
                            placeholder={tr("AIzaSy...")}
                            className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-(--main-color) transition-all"
                        />
                        <div className="flex justify-end gap-3 mt-2">
                            <button onClick={() => setShowApiModal(false)} className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white uppercase tracking-wider">{tr("Cancel")}</button>
                            <button onClick={saveApiKey} className="px-6 py-2 bg-(--main-color) text-black text-xs font-black uppercase tracking-wider rounded-lg hover:bg-white transition-all">{tr("Save & Start")}</button>
                        </div>
                    </div>
                </div>
            )}
            {/* 1:1 Square Crop Tool Modal */}
            <SquareCropModal
                isOpen={cropModalState.isOpen}
                imageSrc={cropModalState.imageSrc}
                onClose={() => setCropModalState({ isOpen: false, opId: '', imageSrc: '' })}
                onCropComplete={(croppedUrl) => {
                    if (!cropModalState.opId) return;
                    updateOp(cropModalState.opId, {
                        result: {
                            ...queue.find(o => o.id === cropModalState.opId)?.result,
                            maskUrl: croppedUrl
                        }
                    });
                    setHasUnsavedChanges(true);
                    toast.success(tr("1:1 Square crop applied!"));
                }}
            />
        </div>
    , document.body);
};
