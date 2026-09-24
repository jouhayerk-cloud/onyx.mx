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
import { callGemini, getApiKey } from '../../lib/geminiClient';
import { processSingleItem, processVariationItem, buildDonorPool, type BatchOp, type ProcessingMode, type PipelineContext } from '../../lib/catalogHubPipeline';

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

/**
 * spatial_masks is jsonb. Handing it a JSON *string* stores a string scalar,
 * which the RxDB mirror (declared as an array/object) then chokes on. Parse
 * before writing so Postgres and the local cache agree.
 */
const safeParseMasks = (raw: string): any => {
    try { return JSON.parse(raw); } catch { return undefined; }
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

    /**
     * The donor pool: every catalogue item that already has generated content to
     * lend. Built once per run rather than per item -- at 497 rows against 87
     * orphans the naive version re-normalizes 43,000 objects.
     */
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
    /**
     * Run the variation pass over every queued item that has no photograph.
     * Serial on purpose: these are text-only calls against the same quota as the
     * image run, and there is nothing to gain from racing them.
     */

    const pipelineCtx: PipelineContext = {
        updateOp,
        logOp,
        checkAbort,
        callGemini,
        user,
        bgQuality,
        cancelTokens,
        setHasUnsavedChanges,
        setQueue
    };

    const handleStartVariationPass = async () => {
        const pending = queue.filter(op => op.needsVariation && op.status !== 'completed');
        if (pending.length === 0) return;

        const donors = buildDonorPool(fullInventory);
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
            await processVariationItem(op, donors, pipelineCtx);
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
                    await processSingleItem(pending[index], pipelineCtx);
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
