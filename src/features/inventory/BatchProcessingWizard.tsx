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
import { replaceBackgroundWithDarkRoom, uploadCleanedImage, bgCacheKey, type BgQuality } from '../../lib/bgReplace';
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
    SHOPIFY_PRODUCT_TYPES,
    normalizeBrandTerms,
    formatProductTitle
} from '../../lib/utils';
import { normalizeContour, saveSegmentation, type SegmentationResult } from '../../lib/segmentationStore';
import { X, Play, Loader2, CheckCircle2, AlertCircle, Sparkles, Settings2, UploadCloud, Cloud, Cpu, ZoomIn, ZoomOut, Save, RefreshCw, Bot, XCircle, Trash2, Layers, Video, Maximize2, Image as ImageIcon, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { removeBackground } from '@imgly/background-removal';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { extractDominantColorsFromImage, getStoneStyleColors, generateFallbackMarketingHtml, generateBitmapAndHexMap, reconstructRgbPixelMap } from '../../lib/colorExtractor';
import { SquareCropModal } from '../../components/SquareCropModal';
import { sanitizeExcelRow } from '../../lib/xlsxUtils';
import { vendors } from '../../lib/consts';
import { findDonor, isUsableDonor, TIER_LABEL } from '../../lib/variationMatch';
import { generateAxonometricDataUrl, resolveItemColor } from '../../lib/axonometric';
import { validateCopy, describeIssues } from '../../lib/copyValidation';
import type { DonorCandidate } from '../../lib/variationMatch';
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

/**
 * `bgreplace` is the default: it repaints the background instead of cutting the
 * subject out, which is the only one of the four that cannot punch holes in a
 * translucent or dark-veined stone piece. The other three remain reachable from
 * the mode chip for the minority of items that genuinely need transparency.
 */
type ProcessingMode = 'bgreplace' | 'local' | 'cloud' | 'hybrid';

const MODE_CYCLE: ProcessingMode[] = ['bgreplace', 'local', 'cloud', 'hybrid'];

/** The mode chip's label. The chip is always pressed — one of the four is
 *  always engaged — so the mode is told by word, icon and tint together, never
 *  by the colour of the label alone. `data-mode` on the button picks the tint
 *  and the icon colour in batchproc.css. */
const MODE_LABEL: Record<ProcessingMode, string> = {
    bgreplace: 'STUDIO',
    hybrid: 'HYBRID',
    cloud: 'CLOUD',
    local: 'LOCAL',
};

/** Which meaning colour a log line carries. The prefixes are written by logOp
 *  and are the only thing that distinguishes a finished step from a failed one,
 *  so they stay coloured — the line is data, not chrome. */
const logTone = (line: string): string => {
    if (line.includes('[ FAIL ]')) return 'is-fail';
    if (line.includes('[  OK  ]')) return 'is-ok';
    if (line.includes('[ WARN ]')) return 'is-warn';
    if (line.includes('[ SKIP ]')) return 'is-skip';
    return '';
};

interface BatchOp {
    id: string;
    item: any;
    imageIndex?: number;
    imageUrl?: string;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    /** Sub-step caption under the progress bar. Was written all over this file without ever being declared. */
    stepLabel?: string;
    processingMode?: ProcessingMode;
    skipImageProcessing?: boolean;
    forceRegenerateDescription?: boolean;
    /** Re-clean this image even if the cache key still matches. Separate from
     *  forceRegenerateDescription: forcing a description should not pay for a
     *  fresh generation of an image that has not changed. */
    forceRecleanImage?: boolean;
    /** No photograph at all. Excluded from the image run; handled by the
     *  variation pass, which writes text from a similar item instead. */
    needsVariation?: boolean;
    result?: {
        description?: string;
        marketingDescription?: string;
        dominantColors?: string[];
        generatedType?: string;
        /**
         * The background-replaced catalogue photo. Distinct from maskUrl: this is
         * an opaque image that replaces the shot, not a transparent cutout, so it
         * goes into processed_media_urls and never into generated_png_url.
         */
        cleanedUrl?: string;
        /** Identifies what produced cleanedUrl, so a rerun can skip unchanged work. */
        cleanedKey?: string;
        /** Uploaded vector outline, persisted to generated_svg_url. */
        svgUrl?: string;
        /** Rendered axonometric icon, uploaded. Used as the Shopify product
         *  image for items that have no photograph. */
        axoIconUrl?: string;
        /** Whole processed_media_urls map, assembled by the video branch. */
        processedMap?: Record<string, string>;
        maskUrl?: string;
        bitmapUrl?: string;
        hexString?: string;
        cols?: number;
        rows?: number;
        localSegmentationMasks?: string;
        cloudSegmentationMasks?: string;
        /**
         * Real segmentation output, bound for the `item_segmentation` table.
         *
         * Separate from everything above because segmentation and background
         * cleaning are independent processes: cleaning keeps writing cleanedUrl
         * into processed_media_urls exactly as before, and this carries the
         * cutout and vectors on its own path.
         *
         * It exists because localSegmentationMasks / cloudSegmentationMasks have
         * no column behind them in Postgres OR in the RxDB schema, so everything
         * assigned to them was computed and then dropped.
         */
        segmentation?: SegmentationResult;
        videoGen?: string;
    };
}

/**
 * spatial_masks is jsonb. Handing it a JSON *string* stores a string scalar,
 * which the RxDB mirror (declared as an array/object) then chokes on. Parse
 * before writing so Postgres and the local cache agree.
 */
const safeParseMasks = (raw: string): any => {
    try { return JSON.parse(raw); } catch { return undefined; }
};

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
    // Whole catalogue, not just the selection: an item with no photograph looks
    // for a donor across everything that already has generated content.
    const fullInventory = useAtomValue(inventoryAtom);
    const activeRate = liveExchangeRate || exchangeRate || DEFAULT_EXCHANGE_RATE;
    
    const [queue, setQueue] = useState<BatchOp[]>([]);
    /** Queued items with no photograph that still have no generated content. */
    const variationPending = queue.filter(op => op.needsVariation && op.status !== 'completed').length;
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAborted, setIsAborted] = useState(false);
    /** 2K costs ~2.6x 1K per image but source photos are ~4000px, so 1K is a visible downgrade. */
    const [bgQuality, setBgQuality] = useState<BgQuality>('2K');
    /**
     * Restrict a run to each item's first image.
     *
     * This defaulted to true and had no control anywhere in the UI, which is
     * why multi-image items only ever came back with one cleaned photo — the
     * queue built an op per image correctly, and then the run silently dropped
     * every op with imageIndex > 0. Now off by default, because "clean this
     * item's photos" should mean all of them, and exposed as a toggle so the
     * cheaper hero-only run is still available deliberately.
     */
    const [heroOnly, setHeroOnly] = useState(false);
    /** Run the image stage only — no descriptions, colours or type. */
    const [imagesOnly, setImagesOnly] = useState(false);
    /**
     * Abort has to be a ref: handleStartBatch's loop closes over the render it
     * started in, so reading the isAborted STATE there is always false and the
     * stop button never stops anything.
     */
    const abortRef = useRef(false);
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
                        processingMode: 'bgreplace',
                        skipImageProcessing: true,
                        needsVariation: !hasData,
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
                            processingMode: 'bgreplace',
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

    const callGemini = async (
        prompt: string,
        imgData: string | null,
        timeoutMs: number = 40000,
        modelId: string = "gemini-2.5-flash",
        responseSchema?: any,
    ) => {
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
                            // Omitted entirely when there is no image: the
                            // variation pass reasons from a sibling item's text,
                            // and an empty inlineData is rejected by the API.
                            ...(imgData ? [{ inlineData: { mimeType: 'image/jpeg', data: imgData } }] : []),
                        ] 
                    }],
                    // Structured output, per the OnyxMX-AIPipelineOptimization skill.
                    // Without it the model wraps JSON in markdown fences and every
                    // call site has to strip them by hand.
                    generationConfig: {
                        responseMimeType: 'application/json',
                        ...(responseSchema ? { responseSchema } : {}),
                    },
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
                setHasUnsavedChanges(true);
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
            // Backfill whatever is missing, on every run, including an
            // images-only one -- cleaning a photo used to skip this entirely, so
            // an item could come back with a fresh image and still no colour.
            //
            // The condition is already "is anything absent", and the merge below
            // keeps every value that exists, so a field with a value is never
            // regenerated. An item missing only its colour therefore keeps its
            // description and body and takes just the colour from this call.
            // Only forceRegenerateDescription overwrites, and that is a separate
            // per-item action.
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
1. "description": A product title of 60 to 70 characters, and NEVER longer than 70. Capitalize Every Word Like This. Do NOT use articles (a, an, the, and). Do NOT end with a period. (e.g., "Mexican Onyx Cylinder Pendant Light Fixtures - Box Set").
2. "marketingDescription": A 1000 to 1200 character marketing description formatted in clean HTML (<p>, <ul>, <li>). Make it premium and engaging, emphasizing artisanal Mexican stone craftsmanship, translucency and natural veining.
   - Say each thing ONCE. Do not restate the title, the material or the colour after the opening sentence, and do not close with a summary of what you just said. Every sentence must add a fact or an image the reader did not already have.
   - You MUST COUNT the exact number of individual cylinder pieces visible in this photo (e.g. 9 pieces, 12 pieces, etc.) and state clearly early in the description: "This box set contains [X] pieces" (replacing [X] with the exact number of cylinders you counted in the image).
   - You MUST also mention later in the description that this set is part of a larger limited edition master collection (stating clearly: "${collectionTotal} items in this limited edition collection").
   - Emphasize how each cylinder in the set showcases unique natural veining and warm translucent glow when illuminated.
3. "dominantColors": An array of 2 to 3 color names selected strictly from this allowed list: [Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green, Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold, Silver, Tan, Turquoise/Aqua, White, Yellow].
   - CRITICAL COLOR RULE: Completely IGNORE the black studio background cloth! NEVER include "Black" as a dominant color for translucent cylinder pendants! Choose only the true natural stone colors (e.g. Cream, Tan, Brown, Orange, White, Green, etc.).
4. Do NOT use the word 'lamp'. ALL fixtures MUST be described as 'Luminary' or 'Luminaries' or 'Light Fixtures'.
5. "generatedType": Choose ONE category strictly from this allowed list: [${SHOPIFY_PRODUCT_TYPES.join(', ')}]. CRITICAL RULE: Canoes, canoe dishes, or canoe bowls MUST be classified as "Home Decor > Decorative Trays". For Cylinder Pendants, always choose "Home Decor > Pendant Lights".

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here...",
  "marketingDescription": "<p>Your 1000-1200 character HTML marketing description here...</p>",
  "dominantColors": ["Color1", "Color2"],
  "generatedType": "Home Decor > Pendant Lights"
}` : `FIND the ${material} ${shape} ${type}. 
Generate comprehensive catalog content for this item based on its features, shape, material (${material}), and color (${color}).

CRITICAL RULES:
1. "description": A product title of 60 to 70 characters, and NEVER longer than 70. Capitalize Every Word Like This. Do NOT use articles (a, an, the, and). Do NOT end with a period.
2. "marketingDescription": A 1000 to 1200 character marketing description formatted in clean HTML (<p>, <ul>, <li>). Make it premium and engaging, emphasizing artisanal Mexican stone craftsmanship, translucency and natural veining.
   - Say each thing ONCE. Do not restate the title, the material or the colour after the opening sentence, and do not close with a summary of what you just said. Every sentence must add a fact or an image the reader did not already have.
3. "dominantColors": An array of 2 to 3 color names selected strictly from this allowed list: [Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green, Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold, Silver, Tan, Turquoise/Aqua, White, Yellow].
4. Do NOT use the word 'lamp'. ALL lamps MUST be described as 'Luminary' or 'Luminaries'.
5. "generatedType": Choose ONE category strictly from this allowed list: [${SHOPIFY_PRODUCT_TYPES.join(', ')}]. CRITICAL RULE: Canoes, canoe dishes, or canoe bowls MUST be classified as "Home Decor > Decorative Trays".

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here...",
  "marketingDescription": "<p>Your 1000-1200 character HTML marketing description here...</p>",
  "dominantColors": ["Color1", "Color2"],
  "generatedType": "Home Decor > Decorative Bowls"
}`;

                const data = await callGemini(prompt, base64, 40000, "gemini-2.5-flash", {
                    type: 'object',
                    properties: {
                        description: { type: 'string' },
                        marketingDescription: { type: 'string' },
                        dominantColors: { type: 'array', items: { type: 'string' } },
                        generatedType: { type: 'string' },
                    },
                    required: ['description', 'marketingDescription', 'dominantColors', 'generatedType'],
                });
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
                if (op.processingMode === 'bgreplace') {
                    // Deliberately short-circuits the entire mask path below. No
                    // preprocessForMasking, no removeBackground, no applyAlphaMask,
                    // no findContour — every one of those is a place where a dark
                    // vein or a rough edge gets mistaken for background.
                    const cacheKey = bgCacheKey(imageUrl, bgQuality);
                    if (op.result?.cleanedKey === cacheKey && op.result?.cleanedUrl && !op.forceRecleanImage) {
                        logOp(op.id, '[ SKIP ] Background already replaced for this image');
                        localMaskUrl = null;
                    } else {
                        try {
                            updateOp(op.id, { progress: 20, stepLabel: 'Replacing background...' });
                            const { dataUrl, modelUsed } = await checkAbort(
                                op.id,
                                replaceBackgroundWithDarkRoom(
                                    imageUrl,
                                    {
                                        shape: itemData.shape,
                                        material: itemData.material,
                                        description: itemData.shortDescription || itemData.type,
                                    },
                                    { quality: bgQuality, onLog: (m) => logOp(op.id, m) },
                                ),
                                180000,
                            );

                            updateOp(op.id, { progress: 75, stepLabel: 'Uploading cleaned image...' });
                            const publicUrl = await checkAbort(
                                op.id,
                                uploadCleanedImage(dataUrl, `${op.id}_${cacheKey}.png`, user),
                            );

                            op.result = op.result || {};
                            op.result.cleanedUrl = publicUrl;
                            op.result.cleanedKey = cacheKey;
                            logOp(op.id, `[  OK  ] Cleaned image stored (${modelUsed})`);
                        } catch (err: any) {
                            logOp(op.id, `[ FAIL ] Background replacement failed: ${err.message}`);
                            console.error(err);
                        }
                    }
                } else if (op.processingMode === 'cloud') {
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
                    
                    // resizeImage() letterboxes onto a 1024 square with 10% padding
                    // per side, so the photo occupies AVAILABLE, not targetSize.
                    // Assuming otherwise scaled every returned polygon by 1024/819
                    // and offset it - a 25% error on every mirror_glass trace.
                    const available = targetSize * 0.8;
                    let drawW = available, drawH = available;
                    if (originalWidth > originalHeight) { drawH = Math.round(available * (originalHeight / originalWidth)); }
                    else { drawW = Math.round(available * (originalWidth / originalHeight)); }
                    const offsetX = (targetSize - drawW) / 2;
                    const offsetY = (targetSize - drawH) / 2;

                    const masks: any[] = [];
                    logOp(op.id, `[ WAIT ] Extracting high-res global boundary on GPU...`);
                    // This branch never declared its own SDR frame, so it threw a
                    // ReferenceError on every run and the catch below logged it as
                    // "Cloud Mask failed". Cloud mode has never produced a mask.
                    const sdrDataUrl = await new Promise<string>((resolve, reject) => {
                        const sdrImg = new Image();
                        sdrImg.crossOrigin = 'anonymous';
                        sdrImg.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = sdrImg.width; canvas.height = sdrImg.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error('Canvas error'));
                            ctx.drawImage(sdrImg, 0, 0, sdrImg.width, sdrImg.height);
                            resolve(canvas.toDataURL('image/jpeg', 1.0));
                        };
                        sdrImg.onerror = () => reject(new Error('Image load failed'));
                        sdrImg.src = imageUrl;
                    });
                    const bgBlobFull = await checkAbort(op.id, removeBackground(sdrDataUrl, {
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
                    // Same values, on a path that actually reaches the database.
                    // cloudSegmentationMasks above has no column behind it in
                    // Postgres or RxDB, so it is computed and dropped; it is left
                    // in place only because the SVG-upload step at the save site
                    // still reads it. `simplifiedFull` is the raw contour the
                    // curve-smoothing discards, kept here because the 3D
                    // generators need points rather than a bezier path.
                    op.result.segmentation = {
                        svgData,
                        points: normalizeContour(simplifiedFull, maskImgFull.width, maskImgFull.height),
                        cutoutDataUrl: pngData,
                        imageWidth: img.width,
                        imageHeight: img.height,
                        sourceImageUrl: imageUrl,
                        method: 'cloud',
                    };
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
                    // As above: localSegmentationMasks has no column behind it.
                    // This carries the same contour on a path that persists, in
                    // {x, y} 0..1 form rather than the [y, x] 0..1000 pairs, so
                    // consumers do not have to know which branch produced it.
                    op.result.segmentation = {
                        svgData: svgPath,
                        points: normalizeContour(simplified, maskImg.width, maskImg.height),
                        cutoutDataUrl: initialLocalMaskUrl,
                        imageWidth: maskImg.width,
                        imageHeight: maskImg.height,
                        sourceImageUrl: imageUrl,
                        method: 'hybrid',
                    };
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
                        const cloudData = await callGemini(hybridInstruction, base64, 40000, "gemini-2.5-flash");
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
                        // See the cloud branch: resizeImage pads 10% per side.
                        const available = targetSize * 0.8;
                        let drawW = available, drawH = available;
                        if (originalWidth > originalHeight) { drawH = Math.round(available * (originalHeight / originalWidth)); }
                        else { drawW = Math.round(available * (originalWidth / originalHeight)); }
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
                        // The persisted twin of the line above, which has no
                        // column to land in. localMaskUrl is the alpha-masked
                        // cutout, which is the real segmented image.
                        op.result.segmentation = {
                            svgData: svgPath,
                            points: normalizeContour(simplified, maskImg.width, maskImg.height),
                            cutoutDataUrl: localMaskUrl,
                            imageWidth: maskImg.width,
                            imageHeight: maskImg.height,
                            sourceImageUrl: imageUrl,
                            method: 'local',
                        };
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
                // Prefer the background-replaced frame: sampling colour off the
                // original means sampling the studio cloth and the cardboard too.
                const colorSource = op.result?.cleanedUrl || localMaskUrl || op.result?.maskUrl || op.imageUrl;
                bitmapRes = await generateBitmapAndHexMap(colorSource, 20, 20, 80, 149, 61, 199, itemData.material, itemData.shape, itemData.color);
                finalColors = (processed.dominantColors && processed.dominantColors.length > 0) ? processed.dominantColors : bitmapRes.dominantColors;
            }

            updateOp(op.id, { 
                status: 'completed', 
                progress: 100, 
                forceRegenerateDescription: false,
                forceRecleanImage: false,
                result: {
                    ...op.result,
                    description: processed.description,
                    marketingDescription: processed.marketingDescription,
                    dominantColors: finalColors,
                    generatedType: processed.generatedType || op.result?.generatedType,
                    maskUrl: localMaskUrl || op.result?.maskUrl || undefined,
                    cleanedUrl: op.result?.cleanedUrl,
                    cleanedKey: op.result?.cleanedKey,
                    bitmapUrl: bitmapRes.bitmapDataUrl || op.result?.bitmapUrl,
                    hexString: bitmapRes.hexString || op.result?.hexString,
                    cols: bitmapRes.cols || op.result?.cols,
                    rows: bitmapRes.rows || op.result?.rows,
                    videoGen: processed.videoGen || op.result?.videoGen
                }
            });
            // Every other setHasUnsavedChanges(true) in this file follows a
            // manual UI action (regenerate, upload mask, toggle a mode). The
            // automatic batch run had none -- handleStartBatch never touched
            // this flag, so a finished run left SAVE TO DB disabled
            // (completedOps.length === 0 || !hasUnsavedChanges) with results
            // sitting only in React state and nowhere to put them.
            setHasUnsavedChanges(true);

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

    /**
     * The donor pool: every catalogue item that already has generated content to
     * lend. Built once per run rather than per item -- at 497 rows against 87
     * orphans the naive version re-normalizes 43,000 objects.
     */
    const buildDonorPool = (): DonorCandidate[] =>
        (fullInventory || []).map((it: any) => {
            const n = normalizeInventoryData(it.data || it);
            return {
                id: String(it.id || it.row || ''),
                shape: String(n.shape || ''),
                type: String(n.shortDescription || n.short_description || ''),
                material: String(n.material || ''),
                color: String(n.color || ''),
                widthCm: Number(n.widthCm || n.width_cm) || 0,
                heightCm: Number(n.heightCm || n.height_cm) || 0,
                lengthCm: Number(n.lengthCm || n.length_cm) || 0,
                description: String(n.detailedDescription || n.detailed_description || ''),
                marketingDescription: String(n.marketingDescription || n.marketing_description || ''),
                dominantColors: Array.isArray(n.generatedColor) ? n.generatedColor
                    : String(n.generatedColor || n.generated_color || '')
                        .split(',').map((c: string) => c.trim()).filter(Boolean),
                generatedType: String(n.generatedType || n.generated_type || ''),
            };
        }).filter(isUsableDonor);

    /**
     * Write content for an item that has no photograph, by varying the closest
     * item that does.
     *
     * Deliberately not a fresh invention. The model is handed a sibling's
     * finished copy and asked to write the same piece of catalogue for THIS
     * item's dimensions and colour, so the voice and structure stay consistent
     * with everything already approved, and only what genuinely differs changes.
     *
     * It never writes an image field. The photograph is still owed.
     */
    const processVariationItem = async (op: BatchOp, donors: DonorCandidate[]) => {
        if (cancelTokens.current[op.id]) return;
        updateOp(op.id, { status: 'processing', progress: 15, stepLabel: 'Finding a similar item' });

        const itemData = op.item.data || op.item;
        const n = normalizeInventoryData(itemData);
        const self: DonorCandidate = {
            id: String(op.item.id || op.item.row || ''),
            shape: String(n.shape || ''),
            type: String(n.shortDescription || n.short_description || ''),
            material: String(n.material || ''),
            color: String(n.color || ''),
            widthCm: Number(n.widthCm || n.width_cm) || 0,
            heightCm: Number(n.heightCm || n.height_cm) || 0,
            lengthCm: Number(n.lengthCm || n.length_cm) || 0,
            description: '', marketingDescription: '', dominantColors: [], generatedType: '',
        };

        try {
            const match = findDonor(self, donors);
            if (!match) {
                // Not a failure of this item so much as of the catalogue: nothing
                // shares even its shape, so there is nothing honest to vary.
                logOp(op.id, '[ SKIP ] No similar item in the catalogue to vary from');
                updateOp(op.id, { status: 'idle', progress: 0, stepLabel: undefined });
                return;
            }

            logOp(op.id, `[  OK  ] Matched on ${TIER_LABEL[match.tier]}`);
            updateOp(op.id, { progress: 40, stepLabel: 'Writing a variation' });

            const d = match.donor;
            const selfSize = [self.widthCm, self.heightCm, self.lengthCm].filter(v => v > 0).join(' x ') || 'not recorded';
            const donorSize = [d.widthCm, d.heightCm, d.lengthCm].filter(v => v > 0).join(' x ') || 'not recorded';

            const prompt = `You are writing catalogue copy for Rare Earth Gallery, a dealer in Mexican onyx.

Below is the finished copy for an item ALREADY in the catalogue. Write the equivalent copy for a DIFFERENT piece of the same kind, described underneath it.

EXISTING ITEM (the template -- match its voice, length and structure):
  Title: ${d.description}
  Body: ${d.marketingDescription}
  Colours: ${(d.dominantColors || []).join(', ')}
  Type: ${d.generatedType}
  Shape / type / material / colour: ${d.shape} / ${d.type} / ${d.material} / ${d.color}
  Size (w x h x l cm): ${donorSize}

THE NEW ITEM you are writing for:
  Shape: ${self.shape || 'unspecified'}
  Type: ${self.type || 'unspecified'}
  Material: ${self.material || 'onyx'}
  Recorded colour: ${self.color || 'unspecified'}
  Size (w x h x l cm): ${selfSize}

RULES
- This is a VARIATION, not a copy. Do not reuse the template's sentences verbatim.
- There is NO photograph of the new item. Describe only what its recorded
  attributes support. Do not invent veining, patterns, inclusions or markings
  you cannot know.
- Where the new item's recorded colour differs from the template's, follow the
  NEW item's colour.
- Use the new item's own dimensions wherever the template cites size.
- dominantColors must come from the new item's recorded colour and material,
  not be copied from the template.
- generatedType should match the template's unless the new item's shape or type
  clearly indicates otherwise.`;

            const askModel = async (extra: string) => {
                const data = await callGemini(prompt + extra, null, 40000, 'gemini-2.5-flash', {
                    type: 'object',
                    properties: {
                        description: { type: 'string' },
                        marketingDescription: { type: 'string' },
                        dominantColors: { type: 'array', items: { type: 'string' } },
                        generatedType: { type: 'string' },
                    },
                    required: ['description', 'marketingDescription', 'dominantColors', 'generatedType'],
                });
                let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Empty response from AI');
                if (text.includes('```')) {
                    const m = text.match(/```(?:json)?([\s\S]*?)```/);
                    text = m ? m[1].trim() : text.replace(/```(json)?|```/g, '').trim();
                }
                const out = JSON.parse(text);
                if (!out.description) throw new Error('Invalid output format from AI');
                return out;
            };

            // The record is the authority. The prompt already forbids
            // contradicting it, and on 8 Sep the model contradicted it anyway
            // on 18 of 223 items -- wrong stone, wrong colour, the donor's
            // dimensions. Asking is not checking, so check.
            const recordForCheck = {
                color: self.color,
                material: self.material,
                widthCm: self.widthCm,
                heightCm: self.heightCm,
                lengthCm: self.lengthCm,
                quantity: Number(itemData.quantity ?? n.quantity ?? 1) || 1,
            };

            let parsed = await askModel('');
            let issues = validateCopy(parsed.description, parsed.marketingDescription, recordForCheck);

            if (issues.length > 0) {
                logOp(op.id, `[ WARN ] Draft contradicts the record; asking again`);
                issues.forEach(i => logOp(op.id, `         ${i.message}`));
                updateOp(op.id, { progress: 55, stepLabel: 'Correcting the draft' });
                parsed = await askModel(
                    `\n\nYour previous answer was rejected because it disagreed with this ` +
                    `item's inventory record:\n${describeIssues(issues)}\n` +
                    `Write it again. The record above is correct and your description ` +
                    `must not contradict it.`);
                issues = validateCopy(parsed.description, parsed.marketingDescription, recordForCheck);
            }

            if (issues.length > 0) {
                // Refusing is the right outcome. Writing copy that contradicts
                // the record is what created this week's cleanup.
                logOp(op.id, `[ FAIL ] Rejected after retry -- item left unchanged`);
                issues.forEach(i => logOp(op.id, `         ${i.message}`));
                updateOp(op.id, { status: 'failed', progress: 0, stepLabel: undefined });
                return;
            }

            updateOp(op.id, {
                status: 'completed',
                progress: 100,
                stepLabel: undefined,
                result: {
                    ...(op.result || {}),
                    description: formatProductTitle(parsed.description),
                    marketingDescription: parsed.marketingDescription,
                    dominantColors: Array.isArray(parsed.dominantColors) ? parsed.dominantColors : [],
                    generatedType: parsed.generatedType || d.generatedType || '',
                },
            });
            // An item with no photograph still needs SOMETHING in the Shopify
            // Image Src column, or it imports as a product with no image at all.
            // The axonometric icon is already what the Isometric catalogue shows
            // for these; this makes it a real uploaded image so the sheet can
            // point at it. Rendered with the same generator the catalogue uses --
            // no second renderer.
            try {
                updateOp(op.id, { progress: 80, stepLabel: 'Rendering icon' });
                const iconDataUrl = await generateAxonometricDataUrl(
                    self.widthCm, self.heightCm, self.lengthCm,
                    self.shape, self.type,
                    resolveItemColor(itemData),
                    true, // JPEG: smaller, and this is a flat-shaded drawing
                );
                if (iconDataUrl) {
                    const iconUrl = await uploadCleanedImage(iconDataUrl, `axo_${self.id || op.id}.jpg`, user);
                    updateOp(op.id, (prev) => ({ result: { ...(prev.result || {}), axoIconUrl: iconUrl } }));
                    logOp(op.id, '[  OK  ] Icon uploaded as fallback product image');
                }
            } catch (iconErr: any) {
                // The copy is the valuable half. A failed icon should not throw
                // away a description that cost a model call.
                logOp(op.id, `[ WARN ] Icon render/upload failed: ${iconErr.message}`);
            }

            logOp(op.id, `[  OK  ] Written as a variation of ${d.id}`);
            setHasUnsavedChanges(true);
        } catch (err: any) {
            logOp(op.id, `[ FAIL ] ${err.message}`);
            updateOp(op.id, { status: 'failed', progress: 0, stepLabel: undefined });
        }
    };

    /**
     * Run the variation pass over every queued item that has no photograph.
     * Serial on purpose: these are text-only calls against the same quota as the
     * image run, and there is nothing to gain from racing them.
     */
    const handleStartVariationPass = async () => {
        const pending = queue.filter(op => op.needsVariation && op.status !== 'completed');
        if (pending.length === 0) return;

        const donors = buildDonorPool();
        if (donors.length === 0) {
            toast.error(tr('No items with generated content to vary from'));
            return;
        }

        setIsProcessing(true);
        abortRef.current = false;
        setOverallProgress(0);
        toast.loading(tr('Writing from similar items...'), { id: 'variation' });

        let done = 0;
        for (const op of pending) {
            if (abortRef.current) break;
            await processVariationItem(op, donors);
            done += 1;
            setOverallProgress(Math.round((done / pending.length) * 100));
        }

        setIsProcessing(false);
        toast.success(tr('Variation pass complete'), { id: 'variation' });
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
            // Normalise on the way into the table, not only on the way out.
            // formatProductTitle applies Grant's rules (no articles, every word
            // capitalised, no trailing period) so the stored title is already
            // correct for both the Shopify sheet and the printed catalogue --
            // the model does not always honour them. Length is deliberately NOT
            // enforced here; the export trims on a word boundary instead, so a
            // good long title is not destroyed in storage.
            if (op.result.description) {
                updatePayload.detailed_description = formatProductTitle(normalizeBrandTerms(op.result.description));
            }
            if (op.result.marketingDescription) {
                updatePayload.generated_description = normalizeBrandTerms(op.result.marketingDescription);
            }
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
            if (op.result.cleanedUrl && op.imageUrl) {
                // Keyed by the CLEANED source url, because that is the form
                // UnifiedInventoryView looks up (getCleanImageUrl rewrites Drive
                // links to lh3). All 294 existing entries use this form.
                processedMap[getCleanImageUrl(op.imageUrl) || op.imageUrl] = op.result.cleanedUrl;
            }
            updatePayload.processed_media_urls = JSON.stringify(processedMap);
            // local_segmentation_masks / cloud_segmentation_masks do not exist in
            // Postgres. Sending them fails the whole update with 42703, and the old
            // recovery path retried without generated_color and generated_type -
            // silently downgrading the save. Write the column that does exist.
            if (op.result.cloudSegmentationMasks) {
                // Assign only on a successful parse. Writing the failure value
                // would blank spatial_masks on a row that already had one.
                const parsed = safeParseMasks(op.result.cloudSegmentationMasks);
                if (parsed !== undefined) updatePayload.spatial_masks = parsed;
            }

            // Segmentation goes to its own table, independently of everything
            // above. Awaited but never allowed to throw -- saveSegmentation
            // swallows its own failures -- because the description, pricing and
            // cleaned-image work in this same payload must not be lost to a
            // cutout upload timing out.
            if (op.result.segmentation && itemData?.id) {
                void saveSegmentation(itemData.id, op.result.segmentation, user);
            }
            
            // Generate and save Classification and Type
            const catAndType = getProductCategoryAndType({
                ...itemData,
                description: op.result.description || itemData.description,
                type: op.result.generatedType || itemData.type
            });
            if (catAndType) {
                // product_category / product_type are NOT columns on inventory.
                // Sending them failed the update with 42703; the old recovery
                // retried without them, which is the only reason these saves ever
                // worked. Removing that recovery without auditing every column
                // turned a silent degradation into a total save failure. The map
                // is where these two actually live, and normalizeInventoryData
                // already reads them back from it.
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
            if (sbErr) throw sbErr;
            toast.success(tr("Description saved!"), { id: toastId });
            setInventoryVersion(Date.now());
        } catch (e: any) {
            toast.error('Failed to save description: ' + (e.message || ''), { id: toastId });
        }
    };

    const handleExportDatabase = async () => {
        const completedOps = queue.filter(op => op.status === 'completed');
        if (completedOps.length === 0) {
            toast.error(tr("No completed items to export."));
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
                // Every op in this group is an angle of the SAME item, so they
                // all attach to one item id. Resolved before the loop because
                // `itemData` below is only read from ops[0] afterwards.
                const primaryItemId = (ops[0]?.item?.data || ops[0]?.item as any)?.id;

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
                    
                    if (op.result?.cloudSegmentationMasks && !op.result.svgUrl) {
                        try {
                            const svgData = JSON.parse(op.result.cloudSegmentationMasks)?.svgData;
                            if (svgData) {
                                const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
                                op.result.svgUrl = await uploadCleanedImage(svgDataUrl, `outline_${op.id}.svg`, user);
                            }
                        } catch (e) {
                            console.warn('Could not persist SVG outline:', e);
                        }
                    }

                    // Persist this angle's segmentation before the index moves on.
                    // One row per photographed angle, which is the shape
                    // `spatial_masks` was being bent into -- except these rows
                    // carry real contours and a real cutout, and they cannot
                    // collide with the cleaned-photo columns.
                    if (op.result?.segmentation && primaryItemId) {
                        void saveSegmentation(
                            primaryItemId,
                            { ...op.result.segmentation, angleIndex: combinedMaskUrls.length },
                            user,
                        );
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
                
                let lastCloudMasks = '';
                let lastSvgUrl = '';
                ops.forEach(op => {
                    if (op.result?.cloudSegmentationMasks) lastCloudMasks = op.result.cloudSegmentationMasks;
                    if (op.result?.svgUrl) lastSvgUrl = op.result.svgUrl;
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
                    // The cleaned photo wins over a cutout for the catalogue slot:
                    // it is the opaque image the grid renders. Key on the cleaned
                    // source url, matching all 294 existing entries.
                    if (op.imageUrl) {
                        const key = getCleanImageUrl(op.imageUrl) || op.imageUrl;
                        if (op.result?.cleanedUrl) {
                            processedMap[key] = op.result.cleanedUrl;
                        } else if (op.result?.maskUrl) {
                            processedMap[key] = op.result.maskUrl;
                        }
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
                // Only spatial_masks exists in Postgres; see handleSaveDescription.
                if (lastCloudMasks) {
                    const parsedMasks = safeParseMasks(lastCloudMasks);
                    if (parsedMasks !== undefined) updatePayload.spatial_masks = parsedMasks;
                }
                const lastAxoIconUrl = ops.map(o => o.result?.axoIconUrl).filter(Boolean).pop();
                if (lastAxoIconUrl) {
                    updatePayload.axo_icon_url = lastAxoIconUrl;
                }

                if (lastSvgUrl) {
                    // generated_svg_url was 0/497 because the SVG was rendered on
                    // every run and then dropped on the floor.
                    updatePayload.generated_svg_url = lastSvgUrl;
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
                if (sbErr) throw sbErr;
                
                savedCount++;
                setOverallProgress((savedCount / entries.length) * 100);
            }
            
            toast.success(tr("Saved successfully to database!"), { id: toastId });
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
            
            // Second copy of the same drifted mapping; both now read `vendors`
            // from lib/consts so they cannot disagree with each other again.
            const vendorMapping: Record<string, string> = Object.fromEntries(
                Object.entries(vendors).map(([code, v]) => [code, v.name])
            );
            
            const tagId = codes?.bookBarcode || normData.book_barcode || normData.itemId || '';
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
        if (!allCompleted || hasUnsavedChanges) { toast.error(tr("Please export to database first.")); return; }
        setIsGeneratingXlsx(true);
        const toastId = toast.loading(tr("Generating Shopify XLSX..."));
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

                const tagId = calc.bookBarcode || norm.book_barcode || norm.itemId || String(itemData.row) || '';
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
            toast.success(tr("XLSX generated! Click Download XLSX to save."), { id: toastId });
        } catch (e: any) {
            toast.error(`XLSX Generation failed: ${e.message}`, { id: toastId });
            console.error(e);
        } finally { setIsGeneratingXlsx(false); }
    };

    const handleGeneratePDF = async () => {
        if (!allCompleted || hasUnsavedChanges) { toast.error(tr("Please export to database first.")); return; }
        setIsGeneratingPdf(true);
        const toastId = toast.loading(tr("Generating Catalog PDF..."));
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
                toast.success(tr("PDF generated! Click Download PDF to save."), { id: toastId });
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
                status: 'idle' as const
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
        abortRef.current = false;
        setOverallProgress(0);

        const pending = queue.filter(op => {
            // No photograph: nothing in this run can act on it. processSingleItem
            // throws "No image found for item" on the first line that touches the
            // URL, so leaving these in meant 87 guaranteed failures in the log.
            // They belong to the variation pass instead.
            if (op.needsVariation) return false;
            // Missing text is a reason to include an op in any run now, since
            // an images-only run backfills gaps too.
            const needsContent = (op.imageIndex || 0) === 0
                && (!op.result?.marketingDescription || !op.result?.dominantColors?.length || op.forceRegenerateDescription);
            const needsImage = !!op.imageUrl && !op.skipImageProcessing
                && (op.forceRecleanImage || !op.result?.cleanedUrl);
            if (imagesOnly && !needsImage) return false;
            if (op.status === 'completed' && !needsContent && !needsImage) return false;
            // Hero-only is a deliberate economy, not the default: at ~2 images an
            // item it halves the bill, but it also means the other photos never
            // get cleaned, which is the bug this flag used to cause silently.
            if (heroOnly && (op.imageIndex || 0) > 0 && !needsContent) return false;
            return true;
        });

        let completed = 0;
        const total = pending.length || 1;

        // Three at a time. Serial with a blanket sleep(1000) meant a 240-image run
        // spent hours waiting on a rate limit that was never actually being hit.
        const CONCURRENCY = 3;
        const cursor = { i: 0 };
        const worker = async () => {
            while (!abortRef.current) {
                const index = cursor.i++;
                if (index >= pending.length) return;
                try {
                    await processSingleItem(pending[index]);
                } catch (err) {
                    console.error("Failed processing item:", pending[index].id, err);
                }
                completed++;
                setOverallProgress((completed / total) * 100);
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

        setIsProcessing(false);
        setInventoryVersion(v => v + 1);
        if (!abortRef.current) {
            toast.success(tr("AI Batch Processing Complete!"));
        }
    };

    const handleClose = () => {
        if (isProcessing) {
            const ok = window.confirm(tr("Processing is active. Are you sure you want to abort and close?"));
            if (!ok) return;
            abortRef.current = true;
            setIsAborted(true);
        }
        setIsOpen(false);
    };

    const toggleProcessingMode = (id: string) => {
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                const current = MODE_CYCLE.indexOf(op.processingMode || 'bgreplace');
                const nextMode = MODE_CYCLE[(current + 1) % MODE_CYCLE.length];
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

    /**
     * Force a fresh background replacement on every image in the queue.
     *
     * Deliberately does NOT filter to imageIndex 0 the way the descriptions
     * handler does: a description belongs to the item, so regenerating it once
     * is right, but a cleaned photo belongs to the image, and there is one per
     * photo. Hero-only is turned off here for the same reason — asking to
     * re-clean everything and then silently skipping the second photo of every
     * item is the behaviour this whole change exists to remove.
     */
    const handleRecleanAllImages = () => {
        const targets = queue.filter(op => op.imageUrl && !op.skipImageProcessing);
        if (targets.length === 0) {
            toast.error(tr("No images in the queue to re-clean."));
            return;
        }
        const items = new Set(targets.map(op => String(op.item?.id ?? op.item?.row ?? op.id))).size;
        if (!confirm(`Force a new background replacement on all ${targets.length} images across ${items} items? This regenerates every one, including images that already have a cleaned version.`)) return;
        setHeroOnly(false);
        setHasUnsavedChanges(true);
        setQueue(prev => prev.map(op => {
            if (!op.imageUrl || op.skipImageProcessing) return op;
            return {
                ...op,
                forceRecleanImage: true,
                status: 'idle',
                progress: 0,
                logs: [...op.logs, '[ WAIT ] Re-queued for forced background replacement']
            };
        }));
        toast.success(tr("All images queued for re-cleaning. Click START ENGINE to begin."));
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
        <div id="batchproc" className="animate-in fade-in duration-500">
            <div className="bp-shell">

                {/* Fullscreen Image Gallery Mode.
                    The scrim is deliberately NOT a bg-black/* utility: SLAB
                    flattens every one of those to the page colour, which on the
                    light slab turned the lightbox into a white sheet with a
                    white-on-white photograph in it. A scrim over a photograph
                    stays dark on both grounds — the image is what is lit. */}
                {fullscreenImage && (
                    <div
                        className="bp-lightbox animate-in fade-in"
                        onClick={() => { setFullscreenImage(null); setZoomLevel(1); }}
                    >
                        <div className="bp-lightbox-bar">
                            <button type="button" aria-label={tr("Zoom in")} onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(z + 0.5, 4)); }} className="bp-lightbox-key">
                                <ZoomIn size={22} />
                            </button>
                            <button type="button" aria-label={tr("Zoom out")} onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(z - 0.5, 1)); }} className="bp-lightbox-key">
                                <ZoomOut size={22} />
                            </button>
                            <button type="button" aria-label={tr("Close")} onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); setZoomLevel(1); }} className="bp-lightbox-key">
                                <X size={22} />
                            </button>
                        </div>
                        <div
                            className="bp-lightbox-stage scrollbar-none"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={fullscreenImage}
                                style={{ transform: `scale(${zoomLevel})` }}
                                className="bp-lightbox-img"
                                onClick={(e) => { e.stopPropagation(); setZoomLevel(z => z === 1 ? 2 : 1); }}
                            />
                        </div>
                    </div>
                )}

                {/* Header.
                    Chrome: raised once, for the whole bar. Every key in the
                    tool rail is a `.bp-key` — the depth walk, the hairline and
                    the focus ring are written once in batchproc.css instead of
                    once per button in utilities SLAB then flattens. */}
                <div className="bp-head">
                    <div className="bp-brand">
                        <div className="bp-mark">
                            <Bot size={24} />
                        </div>
                        <div>
                            <h2 className="bp-title">{tr("Onyx.mx - Catalog Hub")}</h2>
                            <p className="bp-sub">{tr("Batch segmentation & description logic")}</p>
                        </div>
                    </div>
                    <div className="bp-tools">
                        {/* A two-state control: engaged seats pressed and
                            tinted, and the amber rides on the icon, never on
                            the 10px label. */}
                        <button
                            type="button"
                            onClick={toggleAllImageProcessing}
                            aria-pressed={!allSkippingImage}
                            data-sig={allSkippingImage ? 'amber' : 'accent'}
                            className="bp-key"
                            title={tr("Toggle Image Processing (Masks & Transparency) ON/OFF for ALL items")}
                        >
                            <UploadCloud size={16} className="bp-sig" />
                            <span>{allSkippingImage ? tr("IMG PROCESSING: OFF (ORIGINALS)") : tr("IMG PROCESSING: ON (MASKS)")}</span>
                        </button>

                        {/* Force a fresh clean on every image. Sits beside
                            REGENERATE DESCRIPTIONS because it is the same kind of
                            control — force the work again — for the other half of
                            the pipeline. */}
                        <button
                            type="button"
                            onClick={handleRecleanAllImages}
                            data-sig="sky"
                            className="bp-key"
                            title={tr("Re-clean ALL images (force a new background replacement on every image of every item, not just the first)")}
                        >
                            <ImageIcon size={16} className="bp-sig" />
                            <span>{tr("RE-CLEAN IMAGES")}</span>
                        </button>

                        {/* Scope, not force -- and scope only over which ITEMS
                            run: on, the queue is limited to items whose images
                            need cleaning. Those items still have any missing
                            description, colour or type filled in; what is
                            already there is never regenerated either way. */}
                        <button
                            type="button"
                            onClick={() => setImagesOnly(v => !v)}
                            aria-pressed={imagesOnly}
                            data-sig={imagesOnly ? 'sky' : 'dim'}
                            className="bp-key"
                            title={tr("Limits the run to items whose images need cleaning. Those items still get any missing description, colour or type filled in — anything that already has a value is left alone.")}
                        >
                            <Wand2 size={16} className="bp-sig" />
                            <span>{imagesOnly ? tr("CLEAN IMAGES + FILL GAPS") : tr("IMAGES + DESCRIPTIONS")}</span>
                        </button>

                        {/* Which images a run covers. This was hardcoded to
                            hero-only with no control, which is why multi-image
                            items only ever came back with one cleaned photo. */}
                        <button
                            type="button"
                            onClick={() => setHeroOnly(v => !v)}
                            aria-pressed={!heroOnly}
                            data-sig={heroOnly ? 'amber' : 'accent'}
                            className="bp-key"
                            title={tr("All images per item, or only the first. Hero-only is cheaper — roughly half the images — but leaves the rest uncleaned.")}
                        >
                            <Layers size={16} className="bp-sig" />
                            <span>{heroOnly ? tr("HERO IMAGE ONLY") : tr("ALL IMAGES")}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleRegenerateAllDescriptions}
                            data-sig="emerald"
                            className="bp-key"
                            title={tr("Regenerate ALL Descriptions (Force AI body descriptions and color info for all active items)")}
                        >
                            <Sparkles size={16} className="bp-sig" />
                            <span>{tr("REGENERATE DESCRIPTIONS")}</span>
                        </button>

                        <button type="button" onClick={handleClearGen} title={tr("Clear AI Generated Data")} aria-label={tr("Clear AI Generated Data")} data-sig="rose" className="bp-key bp-key--icon">
                            <Trash2 size={20} className="bp-sig" />
                        </button>
                        <button type="button" onClick={handleOptimizeLegacyPNGs} title={tr("Optimize Legacy PNG Masks to WebP")} aria-label={tr("Optimize Legacy PNG Masks to WebP")} data-sig="amber" className="bp-key bp-key--icon">
                            <Sparkles size={20} className="bp-sig" />
                        </button>
                        <button type="button" onClick={() => setShowApiModal(true)} title={tr("API Settings")} aria-label={tr("API Settings")} className="bp-key bp-key--icon">
                            <Settings2 size={20} />
                        </button>
                        <button type="button" onClick={handleClose} title={tr("Close")} aria-label={tr("Close")} className="bp-key bp-key--icon">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Queue List */}
                <div className="bp-queue">
                    {queue.map((op) => (
                        <div key={op.id} className="bp-op">
                            {/* Progress wash. DATA: it is this item's own
                                progress painted across its card, so it keeps
                                the accent on both grounds. */}
                            <div className="bp-op-prog" style={{ width: `${op.progress}%` }} />

                            {/* Missing Data Indicator */}
                            {(op.imageIndex || 0) === 0 && (!op.result?.description || !op.result?.dominantColors?.length || !op.result?.hexString || !op.result?.generatedType) && (
                                <div
                                    className="bp-op-flag"
                                    title={tr("Incomplete Data: Missing Description, Colors, Hex Map, or Type")}
                                />
                            )}

                            {/* Images Side-by-Side Container */}
                            <div className="bp-shots">
                                {/* Source Image */}
                                <div
                                    className="bp-well"
                                    role="button"
                                    tabIndex={0}
                                    title={tr("View source image")}
                                    onClick={() => {
                                        const img = op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : null);
                                        if (img) setFullscreenImage(getCleanImageUrl(img)!);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        const img = op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : null);
                                        if (img) setFullscreenImage(getCleanImageUrl(img)!);
                                    }}
                                >
                                    {(() => {
                                        const thumbUrl = getCleanImageUrl(op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data?.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : ''));
                                        if (!thumbUrl) return (
                                            <div className="bp-well-empty">
                                                <UploadCloud size={24} />
                                                <span>{tr("No Image")}</span>
                                            </div>
                                        );

                                        const isThumbVideo = /\.(mov|mp4|webm|m4v)(\?|$)/i.test(thumbUrl);

                                        return (
                                            <>
                                                {isThumbVideo ? (
                                                    <video src={thumbUrl} className="bp-well-img" muted playsInline loop autoPlay />
                                                ) : (
                                                    <img src={thumbUrl} className="bp-well-img" alt="" />
                                                )}
                                                <div className="bp-well-veil">
                                                    <ZoomIn size={24} />
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Background-replaced result.
                                  *
                                  * Studio mode ('bgreplace') short-circuits the
                                  * mask path entirely and sets localMaskUrl to
                                  * null, so its output never had a preview here
                                  * -- the panel below only renders maskUrl, and
                                  * the thumbnail to the left resolves from
                                  * op.imageUrl, which is the SOURCE photo. The
                                  * cleaned image was being produced, uploaded and
                                  * saved without ever being shown, which is what
                                  * made the batch look like it was not picking up
                                  * regenerated images.
                                  */}
                                {op.result?.cleanedUrl && (
                                    <div
                                        className="bp-well"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setFullscreenImage(getCleanImageUrl(op.result!.cleanedUrl!) || op.result!.cleanedUrl!)}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter' && e.key !== ' ') return;
                                            e.preventDefault();
                                            setFullscreenImage(getCleanImageUrl(op.result!.cleanedUrl!) || op.result!.cleanedUrl!);
                                        }}
                                        title={tr("Cleaned image")}
                                    >
                                        {/* Through getCleanImageUrl, not raw: cleanedUrl is a Drive
                                          * URL now, and Drive's own uc?export=view form does not
                                          * render reliably in an img tag. The rewrite turns it into
                                          * the lh3 form that does. */}
                                        <img src={getCleanImageUrl(op.result.cleanedUrl) || op.result.cleanedUrl} className="bp-well-img" alt="" />
                                        <div className="bp-well-cap">{tr("Cleaned")}</div>
                                        <div className="bp-well-veil">
                                            <ZoomIn size={20} />
                                        </div>
                                    </div>
                                )}

                                {/* Generated Mask Image. The well shows
                                    transparency, so its ground is a checker
                                    drawn from the ground ink rather than a
                                    base64 sheet that only reads on one. */}
                                {op.result?.maskUrl && (
                                    <div
                                        className="bp-well bp-well--checker"
                                        role="button"
                                        tabIndex={0}
                                        title={tr("Generated mask")}
                                        onClick={() => setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!)}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter' && e.key !== ' ') return;
                                            e.preventDefault();
                                            setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!);
                                        }}
                                    >
                                        <img src={getCleanImageUrl(op.result.maskUrl)!} className="bp-well-img bp-well-img--fit" alt="" />
                                        <div className="bp-well-veil">
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleUploadMask(op); }} className="bp-well-act">
                                                <UploadCloud size={16} />
                                                <span>{tr("Upload")}</span>
                                            </button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setFullscreenImage(getCleanImageUrl(op.result!.maskUrl!)!); }} className="bp-well-act">
                                                <ZoomIn size={16} />
                                                <span>{tr("View")}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bp-body">
                                {/* Stage rail. Data: four stages, each either
                                    reached or not, and the difference between
                                    the two is the only thing the rail says. */}
                                <div className="bp-stages">
                                    <span className={`bp-stage${op.progress >= 5 ? ' is-on' : ''}`}>
                                        <span className="bp-stage-dot" /> {tr("IMG")}
                                    </span>
                                    <span className="bp-stage-rule" />
                                    <span className={`bp-stage${op.progress >= 15 ? ' is-on' : ''}`}>
                                        <span className="bp-stage-dot" /> {tr("MASK")}
                                    </span>
                                    <span className="bp-stage-rule" />
                                    <span className={`bp-stage${op.progress >= 70 ? ' is-on' : ''}`}>
                                        <span className="bp-stage-dot" /> AI
                                    </span>
                                    <span className="bp-stage-rule" />
                                    <span className={`bp-stage bp-stage--done${op.status === 'completed' ? ' is-on' : ''}`}>
                                        <span className="bp-stage-dot" /> {tr("DONE")}
                                    </span>
                                </div>

                                <div className="bp-op-head">
                                    <div className="bp-op-id">
                                        <h4 className="bp-op-title">
                                            {(() => {
                                                const norm = normalizeInventoryData(op.item.data || op.item);
                                                const calc = calculateCodesAndPrices(norm, activeRate, norm.workbook || op.item.workbook || '326');
                                                const tagId = calc?.bookBarcode || norm.book_barcode || norm.itemId || `Item ${norm.itemNumber}`;

                                                const match = tagId.replace(/\s+/g, '').match(/^([A-Za-z]+\d{2,4})(\d{2}[A-Za-z]*)$/);
                                                if (match) {
                                                    const [_, section1, section2] = match;
                                                    return (
                                                        <>
                                                            {/* The vendor half of the tag carries the
                                                                vendor's printed colour: that is a
                                                                physical standard and is left exactly
                                                                as it is. The second half has no vendor
                                                                meaning, so it takes the ground's ink. */}
                                                            <span style={{ color: resolveVendorColor(section1) }}>{section1}</span>
                                                            <span className="bp-tag-tail">{section2}</span>
                                                        </>
                                                    );
                                                }
                                                return <span style={{ color: resolveVendorColor(tagId) }}>{tagId}</span>;
                                            })()}
                                        </h4>
                                        {/* Item Details */}
                                        <div className="bp-meta">
                                            <span className="bp-meta-v">{(op.item.data || op.item).shape || 'N/A'}</span>
                                            <span className="bp-meta-sep">•</span>
                                            <span className="bp-meta-v">{(op.item.data || op.item).color || 'N/A'}</span>
                                            <span className="bp-meta-sep">•</span>
                                            <span className="bp-meta-v">{(op.item.data || op.item).material || 'N/A'}</span>
                                            {((op.item.data || op.item).dimensions) && (
                                                <>
                                                    <span className="bp-meta-sep">•</span>
                                                    <span className="bp-chip">{(op.item.data || op.item).dimensions}</span>
                                                </>
                                            )}
                                            {((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) && (
                                                <>
                                                    <span className="bp-meta-sep">•</span>
                                                    <span className="bp-chip" style={{ color: resolveVendorColor((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) }}>
                                                        {(op.item.data || op.item).vendor || (op.item.data || op.item).supplier}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions & instruments */}
                                    <div className="bp-op-side">
                                        <div className="bp-ops">
                                            <button
                                                type="button"
                                                onClick={() => toggleImageProcessing(op.id)}
                                                disabled={op.status !== 'idle'}
                                                aria-pressed={!op.skipImageProcessing}
                                                data-sig={!op.skipImageProcessing ? 'rose' : 'dim'}
                                                className="bp-op-key"
                                                title={tr("Toggle Image Processing")}
                                            >
                                                <UploadCloud size={14} className="bp-sig" /> {tr("IMG")}
                                            </button>

                                            {/* The processing mode. Four states,
                                                one key, and exactly one of them
                                                is always engaged — so the key is
                                                ALWAYS pressed, never lifted, and
                                                the tint moves with the mode.
                                                CLOUD and LOCAL used to share a
                                                fill and be told apart by the
                                                colour of their label alone; they
                                                are now distinguished by tint, by
                                                icon and by the word, with the
                                                hue carried on the icon where it
                                                does not have to be read at 9px. */}
                                            <button
                                                type="button"
                                                onClick={() => toggleProcessingMode(op.id)}
                                                disabled={op.status !== 'idle' || op.skipImageProcessing}
                                                data-mode={op.processingMode || 'bgreplace'}
                                                aria-label={`${tr("Processing mode")}: ${tr(MODE_LABEL[op.processingMode || 'bgreplace'])}`}
                                                className="bp-mode"
                                                title={tr("Toggle Studio / Local / Cloud / Hybrid Processing")}
                                            >
                                                {op.processingMode === 'hybrid'
                                                    ? <Layers size={14} className="bp-sig" />
                                                    : op.processingMode === 'cloud'
                                                    ? <Cloud size={14} className="bp-sig" />
                                                    : op.processingMode === 'local'
                                                    ? <Cpu size={14} className="bp-sig" />
                                                    : <Sparkles size={14} className="bp-sig" />}
                                                {tr(MODE_LABEL[op.processingMode || 'bgreplace'])}
                                            </button>

                                            {op.status === 'processing' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAbort(op.id)}
                                                    data-sig="rose"
                                                    className="bp-op-key"
                                                    title={tr("Abort Processing")}
                                                >
                                                    <XCircle size={14} className="bp-sig" /> {tr("ABORT")}
                                                </button>
                                            )}
                                            {op.status === 'completed' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRegenerate(op.id)}
                                                        data-sig="amber"
                                                        className="bp-op-key"
                                                        title={tr("Re-Generate Mask")}
                                                    >
                                                        <RefreshCw size={14} className="bp-sig" /> {tr("RE-GENERATE")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRegenerateAI(op.id)}
                                                        data-sig="blue"
                                                        className="bp-op-key"
                                                        title={tr("Re-Generate AI Info")}
                                                    >
                                                        <RefreshCw size={14} className="bp-sig" /> {tr("RE-GEN INFO")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const rawUrl = op.result?.maskUrl || op.item?.generatedPngUrl || op.imageUrl || op.item?.imageUrl || '';
                                                            const cleanUrl = getCleanImageUrl(rawUrl) || rawUrl;
                                                            setCropModalState({ isOpen: true, opId: op.id, imageSrc: cleanUrl });
                                                        }}
                                                        data-sig="purple"
                                                        className="bp-op-key"
                                                        title={tr("1:1 Square Crop Tool")}
                                                    >
                                                        <Maximize2 size={14} className="bp-sig" /> {tr("1:1 CROP")}
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        {/* HEX Map. A readout with one key in
                                            it, so the panel itself is pressed. */}
                                        {op.result?.bitmapUrl && (
                                            <div className="bp-panel animate-in fade-in" data-sig="amber">
                                                <span className="bp-panel-cap">
                                                    <Sparkles size={12} className="bp-sig" /> {op.result.cols || 20}x{op.result.rows || 20}
                                                </span>
                                                <img src={op.result.bitmapUrl} className="bp-bitmap" alt="" />
                                                <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(op.result?.hexString || ''); toast.success(tr("Hexadecimal pixel map copied to clipboard!")); }} className="bp-op-key">
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
                                                <div className="bp-panel bp-panel--col animate-in fade-in" data-sig="purple">
                                                    <span className="bp-panel-cap">
                                                        <Video size={12} className="bp-sig" /> {tr("AI Generated Video")}{clipUrls.length > 1 ? ` — ${clipUrls.length} ${tr("Clips")}` : ''}
                                                    </span>
                                                    <div className={`bp-clips${clipUrls.length > 1 ? ' bp-clips--many' : ''}`}>
                                                        {clipUrls.map((url, ci) => (
                                                            <div key={ci} className="bp-clip-wrap">
                                                                {clipUrls.length > 1 && (
                                                                    <span className="bp-clip-n">{tr("Clip")} {ci + 1}</span>
                                                                )}
                                                                <video
                                                                    src={url}
                                                                    controls
                                                                    autoPlay={ci === 0}
                                                                    loop
                                                                    muted
                                                                    className="bp-clip"
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
                                    <div className="bp-step">
                                        <span><Loader2 size={12} className="animate-spin" /> {op.stepLabel || tr("Processing...")}</span>
                                        <span className="bp-step-pct">{Math.round(op.progress)}%</span>
                                    </div>
                                )}

                                {/* Streaming logs. A READOUT: pressed, mono,
                                    tabular, and it takes no hover and no press.
                                    OK / FAIL / WARN / SKIP keep their meaning
                                    colour, because which of the four a line is
                                    is the whole point of the line. */}
                                {op.logs.length > 0 && (
                                    <div className="bp-log" role="status" aria-live="polite">
                                        {op.logs.slice(-3).map((line, li) => (
                                            <span key={`${op.id}-log-${li}`} className={`bp-log-line ${logTone(line)}`}>{line}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Generated content */}
                                {op.result && (
                                    <div className="bp-gen animate-in slide-in-from-top-2">
                                        <div className="bp-gen-row">
                                            {op.result.generatedType && (
                                                <div className="bp-pair">
                                                    <span className="bp-label">{tr("AI:")}</span>
                                                    <span className="bp-badge">{op.result.generatedType}</span>
                                                </div>
                                            )}

                                            {op.result.dominantColors && op.result.dominantColors.length > 0 && (
                                                <div className="bp-pair">
                                                    <span className="bp-label">{tr("Colors:")}</span>
                                                    <div className="bp-chips">
                                                        {op.result.dominantColors.map((c, i) => (
                                                            <span key={i} className="bp-swatch">{c}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="bp-gen-block">
                                            <label className="bp-label" htmlFor={`bp-desc-${op.id}`}>{tr("Title Description")}</label>
                                            <textarea
                                                id={`bp-desc-${op.id}`}
                                                value={op.result.description || ''}
                                                onChange={(e) => {
                                                    updateOp(op.id, { result: { ...op.result, description: e.target.value } });
                                                    setHasUnsavedChanges(true);
                                                }}
                                                className="bp-input"
                                                placeholder={tr("AI generated title description...")}
                                            />
                                        </div>

                                        {op.result.marketingDescription !== undefined && (
                                            <div className="bp-gen-block">
                                                <div className="bp-gen-head">
                                                    <span className="bp-label bp-label--sig">
                                                        <Sparkles size={12} className="bp-sig" /> {tr("Marketing Description (Embedded HTML Review)")}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditHtmlId(editHtmlId === op.id ? null : op.id);
                                                        }}
                                                        aria-pressed={editHtmlId === op.id}
                                                        data-sig="amber"
                                                        className="bp-op-key"
                                                    >
                                                        {editHtmlId === op.id ? tr("View Styled Preview") : tr("Edit Source HTML")}
                                                    </button>
                                                </div>
                                                {editHtmlId === op.id ? (
                                                    <textarea
                                                        value={op.result.marketingDescription || ''}
                                                        onChange={(e) => {
                                                            updateOp(op.id, { result: { ...op.result, marketingDescription: e.target.value } });
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="bp-input bp-input--html"
                                                        placeholder={tr("AI generated HTML marketing description...")}
                                                    />
                                                ) : (
                                                    /* The rendered copy. This used to carry a
                                                       per-item <style> tag hardcoding
                                                       rgba(255,255,255,.92) — one per queue entry,
                                                       and white-on-white on the light slab. It is
                                                       one rule in batchproc.css now, and it takes
                                                       the ground's ink. */
                                                    <div
                                                        className="bp-md"
                                                        dangerouslySetInnerHTML={{ __html: op.result.marketingDescription || '<p>No HTML description generated yet.</p>' }}
                                                    />
                                                )}
                                            </div>
                                        )}

                                        <div className="bp-gen-foot">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleSaveDescription(op); }}
                                                className="bp-key bp-key--go bp-key--sm"
                                            >
                                                <Save size={14} />
                                                {tr("Save Description & Colors")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Status. An instrument: it reports where the item
                                is and cannot be pressed. */}
                            <div className={`bp-status${op.status === 'processing' ? ' bp-status--run' : op.status === 'completed' ? ' bp-status--done' : op.status === 'failed' ? ' bp-status--failed' : ''}`}>
                                {op.status === 'processing' && <Loader2 size={24} className="animate-spin" />}
                                {op.status === 'completed' && <CheckCircle2 size={24} />}
                                {op.status === 'failed' && <AlertCircle size={24} />}
                                {op.status === 'idle' && <span>{tr("WAIT")}</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Global Progress. The track is a well; the fill is data and
                    keeps the accent. */}
                <div className="bp-total">
                    <div className="bp-total-head">
                        <span>{isSavingDb ? tr("Saving to DB...") : tr("Total Progress")}</span>
                        <span className="bp-total-pct">{Math.round(overallProgress)}%</span>
                    </div>
                    <div
                        className="bp-track"
                        role="progressbar"
                        aria-valuenow={Math.round(overallProgress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <div className="bp-fill" style={{ width: `${overallProgress}%` }} />
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="bp-foot">
                    <div className="bp-field">
                        <label className="bp-label" htmlFor="bp-pdf-brand">{tr("PDF BRAND")}</label>
                        <select
                            id="bp-pdf-brand"
                            value={pdfBrand}
                            onChange={(e) => setPdfBrand(e.target.value as any)}
                            className="bp-select"
                        >
                            <option value="ArtOfDecor">{tr("ART OF DECOR")}</option>
                            <option value="RareEarth">{tr("RARE EARTH GALLERY")}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportDatabase}
                        disabled={completedOps.length === 0 || !hasUnsavedChanges}
                        data-sig={(!hasUnsavedChanges && completedOps.length > 0) ? 'emerald' : 'blue'}
                        className="bp-key bp-key--solid"
                    >
                        {(!hasUnsavedChanges && completedOps.length > 0) ? <CheckCircle2 size={18} /> : <Save size={18} />}
                        {(!hasUnsavedChanges && completedOps.length > 0) ? tr("SAVED TO DB") : tr("SAVE TO DB")}
                    </button>

                    {!xlsxUrl ? (
                        <button
                            type="button"
                            onClick={handleGenerateXLSX}
                            disabled={!isFullyGenerated || hasUnsavedChanges || isGeneratingXlsx}
                            data-sig="emerald"
                            className="bp-key bp-key--solid"
                        >
                            {isGeneratingXlsx ? <Loader2 size={18} className="animate-spin" /> : <Settings2 size={18} />}
                            {tr("Generate XLSX")}
                        </button>
                    ) : (
                        <a
                            href={xlsxUrl}
                            download={`Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx`}
                            data-sig="emerald"
                            className="bp-key bp-key--solid"
                        >
                            <Save size={18} />
                            {tr("Download XLSX")}
                        </a>
                    )}

                    {!pdfUrl ? (
                        <button
                            type="button"
                            onClick={handleGeneratePDF}
                            disabled={!isFullyGenerated || hasUnsavedChanges || isGeneratingPdf}
                            data-sig="rose"
                            className="bp-key bp-key--solid"
                        >
                            {isGeneratingPdf ? <Loader2 size={18} className="animate-spin" /> : <Settings2 size={18} />}
                            {tr("Generate PDF")}
                        </button>
                    ) : (
                        <a
                            href={pdfUrl}
                            download={`Catalog_AI_${new Date().toISOString().split('T')[0]}.pdf`}
                            data-sig="rose"
                            className="bp-key bp-key--solid"
                        >
                            <Save size={18} />
                            {tr("Download PDF")}
                        </a>
                    )}

                    {/* Items with no photograph cannot be image-processed, so
                        they are dropped from the engine run and offered here
                        instead: their copy is written by varying the closest
                        item that does have content. */}
                    {variationPending > 0 && (
                        <button
                            type="button"
                            onClick={handleStartVariationPass}
                            disabled={isProcessing}
                            title={tr("These items have no photograph. Their description, colours and type will be written by varying the most similar item that does — no image is generated.")}
                            data-sig="violet"
                            className="bp-key bp-key--solid"
                        >
                            <Sparkles size={18} />
                            {tr("Write From Similar")} ({variationPending})
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleStartBatch}
                        disabled={!needsProcessing || isProcessing}
                        className="bp-key bp-key--go"
                    >
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                        {isProcessing ? tr("Processing...") : tr("Start Engine")}
                    </button>
                </div>

            </div>

            {/* API Key Modal. A panel that is not itself a hover target, so it
                is `raised`, not `float`. */}
            {showApiModal && (
                <div className="bp-modal animate-in fade-in">
                    <div className="bp-card">
                        <div>
                            <h3>{tr("API Key Required")}</h3>
                            <p>{tr("Please enter your Gemini API Key. It will be stored securely in your local device storage.")}</p>
                        </div>
                        <input
                            ref={apiInputRef}
                            type="password"
                            placeholder={tr("AIzaSy...")}
                            aria-label={tr("API Key Required")}
                            className="bp-input bp-input--line"
                        />
                        <div className="bp-card-row">
                            <button type="button" onClick={() => setShowApiModal(false)} className="bp-key">{tr("Cancel")}</button>
                            <button type="button" onClick={saveApiKey} className="bp-key bp-key--go bp-key--sm">{tr("Save & Start")}</button>
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
