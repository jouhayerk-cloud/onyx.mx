import { processVideoWithGemini } from './videoAI';
import { replaceBackgroundWithDarkRoom, uploadCleanedImage, bgCacheKey, type BgQuality } from './bgReplace';
import { supabase } from './supabase';
import {
    getCleanImageUrl,
    resizeImage,
    loadImage,
    findContour,
    simplifyContour,
    createCurvePath,
    generatePngAndSvgFromMasks,
    preprocessForMasking,
    applyAlphaMask,
    normalizeInventoryData,
} from './utils';
import { normalizeContour, type SegmentationResult } from './segmentationStore';
import { removeBackground } from '@imgly/background-removal';
import { generateBitmapAndHexMap } from './colorExtractor';
import { findDonor, isUsableDonor, type DonorCandidate, TIER_LABEL } from './variationMatch';
import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
import { describeIssues } from './copyValidation';
import type { CatalogProcess } from './catalogHubProcesses';
import { generateJson } from './ai/client';
import { AiCancelledError, aiErrorMessage } from './ai/errors';
import { buildContentPrompt, buildSegmentationPrompt, type ContentField, type SegmentationLayer } from './ai/prompts';
import { finalizeContent, type RawContent } from './ai/finalize';
import { toPipelineItem, isVendorEcho, isCylinderBoxSet, type PipelineItem } from './ai/item';

export type ProcessingMode = 'bgreplace' | 'local' | 'cloud' | 'hybrid';

/** CATALOG_PROCESSES ids. */
export type ProcessId = CatalogProcess['id'];

/**
 * 'partial': some of what was asked for came back and some failed -- most
 * often the text arrived and the background replacement did not. It used to
 * show as a green 'completed', so a failed clean looked done and was never
 * retried.
 */
export type BatchOpStatus = 'idle' | 'processing' | 'completed' | 'partial' | 'failed';

export type ProcessRunStatus = 'done' | 'failed' | 'skipped';

export interface BatchOp {
    id: string;
    item: any;
    imageIndex?: number;
    imageUrl?: string;
    status: BatchOpStatus;
    progress: number;
    logs: string[];
    stepLabel?: string;
    /** Defaults to 'bgreplace' when absent. */
    processingMode?: ProcessingMode;
    /**
     * The processes to run, by CATALOG_PROCESSES id. When set it is the whole
     * instruction: a ticked text process is regenerated, an unticked one is
     * neither generated nor overwritten, and the image stage runs only for
     * img_clean / image_segmentation.
     */
    processes?: ReadonlySet<ProcessId>;
    /** Per-process outcome of the latest run(s), merged across runs. */
    processStatus?: Partial<Record<ProcessId, ProcessRunStatus>>;
    /** The typed error message for each failed process. */
    processErrors?: Partial<Record<ProcessId, string>>;
    /** @deprecated Pass `processes` instead. Honoured only when `processes` is absent. */
    skipImageProcessing?: boolean;
    /** @deprecated Pass `processes` instead. Honoured only when `processes` is absent. */
    forceRegenerateDescription?: boolean;
    forceRecleanImage?: boolean;
    needsVariation?: boolean;
    result?: {
        description?: string;
        marketingDescription?: string;
        dominantColors?: string[];
        generatedType?: string;
        /**
         * The uploaded clean image: the background-replaced photo in
         * 'bgreplace' mode, the transparent cutout in the cut-out modes.
         * Every mode that cleans now sets it, so img_clean lights up and a
         * rerun does not redo the work.
         */
        cleanedUrl?: string;
        cleanedKey?: string;
        /** Uploaded transparent PNG of the piece alone. */
        cutoutUrl?: string;
        /** Black-and-white matte of the piece (data: URL until saved). */
        matteUrl?: string;
        /** Outline as SVG markup (uploaded by the writer, not here). */
        outlineSvg?: string;
        /** Uploaded outline URL. */
        svgUrl?: string;
        axoIconUrl?: string;
        processedMap?: Record<string, string>;
        /** The cutout, kept under its old name for the savers that read it. */
        maskUrl?: string;
        bitmapUrl?: string;
        hexString?: string;
        cols?: number;
        rows?: number;
        localSegmentationMasks?: string;
        cloudSegmentationMasks?: string;
        segmentation?: SegmentationResult;
        videoGen?: string;
    };
}

export interface PipelineContext {
    updateOp: (id: string, updates: Partial<BatchOp> | ((prev: BatchOp) => Partial<BatchOp>)) => void;
    logOp: (id: string, text: string) => void;
    checkAbort: <T>(id: string, promise: Promise<T>, timeoutMs?: number) => Promise<T>;
    /** @deprecated Unused: every call goes through lib/ai/client. Kept so existing callers compile. */
    callGemini?: (prompt: string, imgData: string | null, timeoutMs?: number, modelId?: string, responseSchema?: any) => Promise<any>;
    user: any;
    bgQuality: BgQuality;
    cancelTokens: { current: Record<string, boolean> };
    setHasUnsavedChanges: (val: boolean) => void;
    /** Optional: used to copy the hero's text onto its sibling photos' cards. */
    setQueue?: (updater: (prev: BatchOp[]) => BatchOp[]) => void;
}

const TEXT_PROCESS_FIELD: ReadonlyArray<[ProcessId, ContentField]> = [
    ['title_desc', 'title'],
    ['marketing_desc', 'body'],
    ['dominant_colors', 'colors'],
    ['product_type', 'type'],
];

export const buildDonorPool = (fullInventory: any[]): DonorCandidate[] =>
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
            marketingDescription: String(n.marketingDescription || n.marketing_description || n.generatedDescription || ''),
            dominantColors: Array.isArray(n.generatedColor) ? n.generatedColor
                : String(n.generatedColor || n.generated_color || '')
                    .split(',').map((c: string) => c.trim()).filter(Boolean),
            generatedType: String(n.generatedType || n.generated_type || ''),
        };
    }).filter(isUsableDonor);

/**
 * An AbortSignal that fires when the op's cancel token is set, so cancelling
 * an op actually cancels its in-flight Gemini request instead of only
 * abandoning the wait for it (checkAbort rejected, the request kept running
 * and billing).
 */
function watchCancel(id: string, cancelTokens: PipelineContext['cancelTokens']) {
    const controller = new AbortController();
    const timer = setInterval(() => {
        if (cancelTokens.current[id]) {
            clearInterval(timer);
            controller.abort();
        }
    }, 300);
    return { signal: controller.signal, dispose: () => clearInterval(timer) };
}

/** The photo at full resolution as an SDR JPEG, which is what imgly wants. */
function loadSdrDataUrl(imageUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const c = canvas.getContext('2d');
            if (!c) return reject(new Error('Canvas error'));
            c.drawImage(img, 0, 0, img.width, img.height);
            resolve(canvas.toDataURL('image/jpeg', 1.0));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = imageUrl;
    });
}

/** Contour of a cutout's opaque area, in that image's pixels. */
async function traceCutout(cutoutUrl: string, tolerance: number) {
    const maskImg = await loadImage(cutoutUrl);
    const canvas = document.createElement('canvas');
    canvas.width = maskImg.width; canvas.height = maskImg.height;
    const c = canvas.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(maskImg, 0, 0);
    const contour = findContour(c.getImageData(0, 0, maskImg.width, maskImg.height));
    const simplified = simplifyContour(contour, tolerance);
    return { simplified, width: maskImg.width, height: maskImg.height };
}

/**
 * The black-and-white matte of a cutout: white wherever the piece is, black
 * elsewhere. The cut-out modes only ever produced the RGBA cutout, and the
 * review screens need the matte on its own to judge an edge.
 */
async function matteFromCutout(cutoutUrl: string): Promise<string> {
    const img = await loadImage(cutoutUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const c = canvas.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, img.width, img.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
        const on = px[i + 3] > 0 ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = on;
        px[i + 3] = 255;
    }
    c.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
}

/** A standalone SVG document for an outline, whatever form it arrived in. */
function toSvgDocument(svg: string, width: number, height: number): string {
    const s = (svg || '').trim();
    if (!s) return '';
    if (s.startsWith('<svg')) return s;
    const body = s.startsWith('<') ? s : `<path d="${s}" fill="none" stroke="#ffffff" stroke-width="2" />`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

/**
 * Model coordinates (0-1000 on resizeImage's letterboxed 1024 square) back to
 * 0..1 of the original photo. resizeImage pads 10% per side, so the photo
 * occupies 80% of the square, not all of it; assuming otherwise scaled every
 * polygon by 1024/819 and offset it -- a 25% error on every mirror_glass trace.
 */
export function letterboxToUnit(origW: number, origH: number) {
    const targetSize = 1024;
    const available = targetSize * 0.8;
    let drawW = available, drawH = available;
    if (origW > origH) drawH = Math.round(available * (origH / origW));
    else drawW = Math.round(available * (origW / origH));
    const offsetX = (targetSize - drawW) / 2;
    const offsetY = (targetSize - drawH) / 2;
    return (pt: number[]) => ({
        x: ((pt[1] / 1000) * targetSize - offsetX) / drawW,
        y: ((pt[0] / 1000) * targetSize - offsetY) / drawH,
    });
}

/** Mask layers from segmentation output: the mirror_glass polygon from the model, everything else the traced contour. */
function layersToMasks(layers: SegmentationLayer[], origW: number, origH: number, contourPath: string, contourW: number, contourH: number) {
    const toUnit = letterboxToUnit(origW, origH);
    return layers.map(m => {
        if (m.polygon && m.polygon.length > 0 && String(m.label).toLowerCase() === 'mirror_glass') {
            return { label: m.label, x: 0, y: 0, width: 1, height: 1, maskWidth: 1, maskHeight: 1, path: createCurvePath(m.polygon.map(toUnit)) };
        }
        return { label: m.label || 'artifact', x: 0, y: 0, width: 1, height: 1, maskWidth: contourW, maskHeight: contourH, path: contourPath };
    });
}

interface Cutout {
    /** RGBA cutout, data: URL. */
    cutoutDataUrl: string;
    segmentation: SegmentationResult;
    outlineSvg: string;
    localSegmentationMasks?: string;
    cloudSegmentationMasks?: string;
}

export const processSingleItem = async (op: BatchOp, ctx: PipelineContext) => {
    const { updateOp, logOp, checkAbort, user, bgQuality, cancelTokens, setHasUnsavedChanges, setQueue } = ctx;
    if (cancelTokens.current[op.id]) return;

    const item = toPipelineItem(op.item);
    const boxSet = isCylinderBoxSet(item);
    const isHero = (op.imageIndex || 0) === 0;
    const explicit = !!op.processes;
    const wants = (p: ProcessId) => !!op.processes?.has(p);
    const mode: ProcessingMode = op.processingMode || 'bgreplace';

    // Local copies, emitted whole on every update. The op handed in is a
    // snapshot of React state; mutating its result (as this used to) leaked
    // through `...op.result` into whatever the caller did next.
    const result: NonNullable<BatchOp['result']> = { ...(op.result || {}) };
    const status: Partial<Record<ProcessId, ProcessRunStatus>> = { ...(op.processStatus || {}) };
    const errors: Partial<Record<ProcessId, string>> = { ...(op.processErrors || {}) };
    const ran = new Set<ProcessId>();
    const mark = (p: ProcessId, s: ProcessRunStatus, err?: unknown) => {
        status[p] = s;
        if (s !== 'skipped') ran.add(p);
        if (s === 'failed') errors[p] = aiErrorMessage(err);
        else delete errors[p];
    };
    const emit = (extra: Partial<BatchOp> = {}) =>
        updateOp(op.id, { ...extra, result: { ...result }, processStatus: { ...status }, processErrors: { ...errors } });

    // The vendor's word is not an AI title. The Catalog Hub queue seeds
    // result.description with it when detailed_description is empty, and this
    // used to keep it as the "existing" title, so "Bowl" was saved into
    // detailed_description.
    if (isVendorEcho(result.description, item)) {
        result.description = item.existing.title || '';
    }

    const cancel = watchCancel(op.id, cancelTokens);
    updateOp(op.id, { status: 'processing', progress: 10 });
    logOp(op.id, '[ WAIT ] Resizing image...');

    try {
        const rawImageUrl = op.imageUrl || getCleanImageUrl(op.item.generatedPngUrl || op.item.data?.generatedPngUrl || op.item.imageUrl || item.mediaUrls[0]);
        const imageUrl = getCleanImageUrl(rawImageUrl);
        if (!imageUrl) throw new Error('No image found for item');

        if (imageUrl.toLowerCase().includes('photos.app.goo.gl') || imageUrl.toLowerCase().includes('photos.google.com')) {
            logOp(op.id, '[ SKIP ] Google Photos link detected. Skipping AI processing.');
            updateOp(op.id, { status: 'completed', progress: 100, result: { ...result } });
            setHasUnsavedChanges(true);
            return;
        }

        const isVideo = imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null;
        let base64 = '';

        if (isVideo) {
            if (explicit && !wants('video_proc')) {
                logOp(op.id, '[ SKIP ] Video processing not selected');
            } else {
                try {
                    logOp(op.id, '[ WAIT ] Fetching video file for AI...');
                    const videoRes = await fetch(imageUrl, { signal: cancel.signal });
                    const videoBlob = await videoRes.blob();

                    logOp(op.id, '[ WAIT ] Generating clean video clips with Gemini...');
                    const generatedClips = await processVideoWithGemini(
                        new File([videoBlob], 'input.mp4', { type: videoBlob.type }),
                        item.shape || 'Artifact',
                        item.type || item.vendorText || 'Onyx item',
                        (p, label) => {
                            updateOp(op.id, { progress: Math.min(90, 10 + p) });
                            logOp(op.id, `[ WAIT ] ${label}`);
                        },
                        cancel.signal
                    );

                    const processedMap: Record<string, string> = {};
                    const uploadedUrls: string[] = [];
                    for (let ci = 0; ci < generatedClips.length; ci++) {
                        if (cancelTokens.current[op.id]) throw new AiCancelledError();
                        logOp(op.id, `[ WAIT ] Uploading generated clip ${ci + 1}/${generatedClips.length} to Supabase...`);
                        const clipFileName = `gen_${Date.now()}_${op.id}_clip${ci}.mp4`;
                        const { error } = await supabase.storage.from('inventory-media').upload(
                            `generated_videos/${clipFileName}`, generatedClips[ci],
                            { cacheControl: '3600', upsert: false }
                        );
                        if (error) {
                            logOp(op.id, `[ WARN ] Clip ${ci + 1} upload failed: ${error.message}`);
                            continue;
                        }
                        const { data: { publicUrl } } = supabase.storage.from('inventory-media').getPublicUrl(`generated_videos/${clipFileName}`);
                        uploadedUrls.push(publicUrl);
                        processedMap[`videoGen_${ci}`] = publicUrl;
                    }

                    // First clip is also stored as 'videoGen' for backward compatibility.
                    // Only this run's clips go in the map: the writer merges it
                    // into the stored processed_media_urls.
                    if (uploadedUrls.length > 0) processedMap['videoGen'] = uploadedUrls[0];
                    processedMap['videoGenCount'] = String(uploadedUrls.length);

                    result.processedMap = processedMap;
                    result.videoGen = uploadedUrls[0] || '';
                    if (uploadedUrls.length > 0) mark('video_proc', 'done');
                    else mark('video_proc', 'failed', new Error('No clip could be uploaded'));
                    emit();
                    logOp(op.id, `[  OK  ] ${uploadedUrls.length} video clip(s) generated and uploaded.`);
                } catch (err) {
                    if (cancelTokens.current[op.id]) throw new AiCancelledError();
                    mark('video_proc', 'failed', err);
                    logOp(op.id, `[ FAIL ] Video: ${aiErrorMessage(err)}`);
                }
            }
        } else {
            const aiDataUrl = await resizeImage(imageUrl, 1024);
            base64 = aiDataUrl.split(',')[1];
            logOp(op.id, '[  OK  ] Image resized successfully');
        }

        // ── Text: title, marketing HTML, colours, type ──
        //
        // One call, on the hero photo only: these belong to the item, not to
        // a photo. With `processes`, the ticked fields are regenerated and
        // nothing else is asked for. Without it (older callers), whatever is
        // missing is backfilled and forceRegenerateDescription redoes all four.
        let textFields: ContentField[] = [];
        if (isHero && !isVideo) {
            if (explicit) {
                textFields = TEXT_PROCESS_FIELD.filter(([p]) => wants(p)).map(([, f]) => f);
            } else {
                const force = !!op.forceRegenerateDescription;
                if (force || !result.description) textFields.push('title');
                if (force || !result.marketingDescription) textFields.push('body');
                if (force || !result.dominantColors?.length) textFields.push('colors');
                if (force || !result.generatedType) textFields.push('type');
            }
        }
        const fieldProcess = (f: ContentField) => TEXT_PROCESS_FIELD.find(([, x]) => x === f)![0];

        if (textFields.length > 0) {
            updateOp(op.id, { progress: 30 });
            logOp(op.id, '[ WAIT ] Analyzing via Gemini...');
            try {
                const built = buildContentPrompt(item, {
                    variant: 'photo',
                    boxSet: boxSet ? { collectionTotal: item.quantity } : undefined,
                    fields: textFields,
                });
                const raw = await generateJson<RawContent>({
                    job: 'content',
                    prompt: built.prompt,
                    system: built.system,
                    images: [base64],
                    schema: built.schema,
                    signal: cancel.signal,
                });
                logOp(op.id, '[  OK  ] Received Gemini response');
                updateOp(op.id, { progress: 70 });

                const fin = finalizeContent(raw, item, { boxSet });
                const got: Record<ContentField, boolean> = {
                    title: !!fin.title,
                    body: !!fin.html,
                    colors: fin.colors.length > 0,
                    type: !!fin.genType,
                };
                if (got.title && textFields.includes('title')) result.description = fin.title;
                if (got.body && textFields.includes('body')) result.marketingDescription = fin.html;
                if (got.colors && textFields.includes('colors')) result.dominantColors = fin.colors;
                if (got.type && textFields.includes('type')) result.generatedType = fin.genType;
                for (const f of textFields) {
                    if (got[f]) mark(fieldProcess(f), 'done');
                    else mark(fieldProcess(f), 'failed', new Error(`Gemini returned no ${f}`));
                }
                // Logged, not refused: the photo is the authority here, and a
                // vague vendor colour is not a contradiction worth a retry.
                // The donor path, which has no photo, refuses on these.
                fin.issues.forEach(i => logOp(op.id, `[ WARN ] ${i.message}`));
                emit();
                logOp(op.id, '[  OK  ] Parsing complete');
            } catch (err) {
                if (err instanceof AiCancelledError || cancelTokens.current[op.id]) throw err;
                textFields.forEach(f => mark(fieldProcess(f), 'failed', err));
                logOp(op.id, `[ FAIL ] Content: ${aiErrorMessage(err)}`);
                console.error(err);
            }
        } else {
            updateOp(op.id, { progress: 70 });
            logOp(op.id, isHero ? '[  OK  ] Using primary item description' : '[  OK  ] Text comes from the first photo');
        }

        // ── Image stage ──
        const cleanImage = explicit ? wants('img_clean') : !op.skipImageProcessing;
        // Legacy callers got a cutout and outline from the cut-out modes
        // whether or not they asked; keep that, and add nothing to bgreplace.
        const segment = explicit ? wants('image_segmentation') : (!op.skipImageProcessing && mode !== 'bgreplace');

        if (!isVideo && (cleanImage || segment)) {
            const cutoutLabel = (c: Cutout) => c.segmentation.method || mode;

            /** Store a cutout: uploaded PNG, matte, outline. Any failure here is the image stage failing. */
            const keepCutout = async (c: Cutout, asCleaned: boolean) => {
                updateOp(op.id, { progress: 85, stepLabel: 'Uploading cutout...' });
                const cutoutUrl = await checkAbort(op.id, uploadCleanedImage(c.cutoutDataUrl, `${op.id}_cutout_${cutoutLabel(c)}.png`, user));
                result.cutoutUrl = cutoutUrl;
                result.maskUrl = cutoutUrl;
                try {
                    result.matteUrl = await matteFromCutout(c.cutoutDataUrl);
                } catch (e: any) {
                    logOp(op.id, `[ WARN ] Matte not generated: ${e.message}`);
                }
                result.segmentation = c.segmentation;
                result.outlineSvg = c.outlineSvg || undefined;
                if (c.localSegmentationMasks) result.localSegmentationMasks = c.localSegmentationMasks;
                if (c.cloudSegmentationMasks) result.cloudSegmentationMasks = c.cloudSegmentationMasks;
                if (asCleaned) {
                    result.cleanedUrl = cutoutUrl;
                    // Not a bgCacheKey: a cutout must never satisfy the
                    // bgreplace "already cleaned" check, or switching modes
                    // would skip the replacement.
                    result.cleanedKey = `${mode}:${bgCacheKey(imageUrl, bgQuality)}`;
                }
            };

            /** imgly on the photo, alpha-masked, traced. The 'local' mode, and the fallback of the others. */
            const localCutout = async (src: string, progressBase: number, progressSpan: number): Promise<Cutout> => {
                updateOp(op.id, { progress: progressBase, stepLabel: 'Preparing Full-Res SDR Image...' });
                const sdrDataUrl = await loadSdrDataUrl(src);
                logOp(op.id, '[ WAIT ] Extracting background...');
                const processedSdrUrl = await preprocessForMasking(sdrDataUrl);
                // Yield to the main thread so the UI does not freeze.
                await new Promise(resolve => setTimeout(resolve, 50));
                if (cancelTokens.current[op.id]) throw new AiCancelledError();

                const bgBlob = await checkAbort(op.id, removeBackground(processedSdrUrl, {
                    output: { format: 'image/png' },
                    device: 'gpu' as any,
                    debug: false,
                    progress: (key, current, total) => {
                        const p = Math.round((current / total) * 100);
                        updateOp(op.id, { progress: progressBase + (p * progressSpan / 100), stepLabel: `Extracting: ${key} ${p}%` });
                    }
                }), 120000);
                await new Promise(resolve => setTimeout(resolve, 50));
                if (cancelTokens.current[op.id]) throw new AiCancelledError();

                const cutoutDataUrl = await applyAlphaMask(sdrDataUrl, bgBlob, boxSet);
                logOp(op.id, '[  OK  ] Mask generated locally');
                const { simplified, width, height } = await traceCutout(cutoutDataUrl, 2.0);
                const svgPath = createCurvePath(simplified);
                return {
                    cutoutDataUrl,
                    outlineSvg: toSvgDocument(svgPath, width, height),
                    localSegmentationMasks: JSON.stringify({
                        width, height, path: svgPath, pointCount: simplified.length,
                        points: simplified.map(p => [Math.round((p.y / height) * 1000), Math.round((p.x / width) * 1000)]),
                    }),
                    // The persisted twin of localSegmentationMasks, which has
                    // no column. {x, y} 0..1, so consumers need not know which
                    // branch produced it.
                    segmentation: {
                        svgData: svgPath,
                        points: normalizeContour(simplified, width, height),
                        cutoutDataUrl,
                        imageWidth: width,
                        imageHeight: height,
                        sourceImageUrl: imageUrl,
                        method: 'local',
                    },
                };
            };

            const segmentationLayers = async (kind: 'cloud' | 'hybrid', pointCount?: number): Promise<SegmentationLayer[]> => {
                const built = buildSegmentationPrompt(item, kind, { boxSet, pointCount });
                const layers = await generateJson<SegmentationLayer[]>({
                    job: 'segmentation',
                    prompt: built.prompt,
                    images: [base64],
                    schema: built.schema,
                    signal: cancel.signal,
                });
                return Array.isArray(layers) ? layers : [];
            };

            let imageFailed = false;

            if (mode === 'bgreplace') {
                // Deliberately short-circuits the mask path: no
                // preprocessForMasking, no removeBackground, no
                // applyAlphaMask, no findContour -- every one of those is a
                // place where a dark vein or a rough edge gets mistaken for
                // background.
                if (cleanImage) {
                    const cacheKey = bgCacheKey(imageUrl, bgQuality);
                    if (result.cleanedKey === cacheKey && result.cleanedUrl && !op.forceRecleanImage) {
                        logOp(op.id, '[ SKIP ] Background already replaced for this image');
                        mark('img_clean', 'done');
                    } else {
                        try {
                            updateOp(op.id, { progress: 20, stepLabel: 'Replacing background...' });
                            const { dataUrl, modelUsed } = await checkAbort(
                                op.id,
                                replaceBackgroundWithDarkRoom(
                                    imageUrl,
                                    { shape: item.shape, material: item.material, description: item.type },
                                    { quality: bgQuality, onLog: (m) => logOp(op.id, m), signal: cancel.signal },
                                ),
                                // No overall timeout here: each model attempt has
                                // its own (AI_MODELS.bgReplace), and a timeout at
                                // this level abandoned the request without
                                // stopping it.
                            );
                            updateOp(op.id, { progress: 75, stepLabel: 'Uploading cleaned image...' });
                            const publicUrl = await checkAbort(op.id, uploadCleanedImage(dataUrl, `${op.id}_${cacheKey}.png`, user));
                            result.cleanedUrl = publicUrl;
                            result.cleanedKey = cacheKey;
                            mark('img_clean', 'done');
                            emit();
                            logOp(op.id, `[  OK  ] Cleaned image stored (${modelUsed})`);
                        } catch (err) {
                            if (cancelTokens.current[op.id]) throw new AiCancelledError();
                            imageFailed = true;
                            mark('img_clean', 'failed', err);
                            logOp(op.id, `[ FAIL ] Background replacement failed: ${aiErrorMessage(err)}`);
                            console.error(err);
                        }
                    }
                }
                if (segment) {
                    // A cutout of the cleaned frame when there is one: the
                    // dark room separates far better than cardboard and studio
                    // clutter do.
                    try {
                        logOp(op.id, '[ WAIT ] Cutting out the piece...');
                        const c = await localCutout(result.cleanedUrl || imageUrl, 80, 10);
                        await keepCutout(c, false);
                        mark('image_segmentation', 'done');
                        emit();
                        logOp(op.id, '[  OK  ] Cutout, mask and outline generated');
                    } catch (err) {
                        if (cancelTokens.current[op.id]) throw new AiCancelledError();
                        imageFailed = true;
                        mark('image_segmentation', 'failed', err);
                        logOp(op.id, `[ FAIL ] Cutout failed: ${aiErrorMessage(err)}`);
                        console.error(err);
                    }
                }
            } else {
                // The cut-out modes. Each yields the RGBA cutout (uploaded,
                // and stored as the clean image), its matte and its outline.
                let cut: Cutout | null = null;
                try {
                    if (mode === 'cloud') {
                        logOp(op.id, '[ WAIT ] Running Cloud AI for segmentation...');
                        const layers = await segmentationLayers('cloud');
                        logOp(op.id, `[  OK  ] Found ${layers.length} layers. Refining...`);

                        const img = await loadImage(imageUrl);
                        logOp(op.id, '[ WAIT ] Extracting high-res global boundary on GPU...');
                        const sdrDataUrl = await loadSdrDataUrl(imageUrl);
                        const bgBlobFull = await checkAbort(op.id, removeBackground(sdrDataUrl, {
                            output: { format: 'image/png' }, device: 'gpu' as any, debug: false,
                        }), 60000);
                        // The imgly output as a white-on-black silhouette, so
                        // the contour follows the piece and not its veining.
                        const maskImgFull = await loadImage(URL.createObjectURL(bgBlobFull));
                        const rcv = document.createElement('canvas'); rcv.width = maskImgFull.width; rcv.height = maskImgFull.height;
                        const rctx = rcv.getContext('2d', { willReadFrequently: true })!;
                        rctx.drawImage(maskImgFull, 0, 0);
                        rctx.globalCompositeOperation = 'source-in'; rctx.fillStyle = 'white'; rctx.fillRect(0, 0, rcv.width, rcv.height);
                        rctx.globalCompositeOperation = 'destination-over'; rctx.fillStyle = 'black'; rctx.fillRect(0, 0, rcv.width, rcv.height);
                        rctx.globalCompositeOperation = 'source-over';
                        const simplifiedFull = simplifyContour(findContour(rctx.getImageData(0, 0, rcv.width, rcv.height)), 0.2);

                        if (cancelTokens.current[op.id]) throw new AiCancelledError();
                        updateOp(op.id, { progress: 70, stepLabel: 'Extracting masks...' });
                        const masks = layersToMasks(
                            layers.length ? layers : [{ box_2d: [], label: 'artifact' }],
                            img.width, img.height, createCurvePath(simplifiedFull), maskImgFull.width, maskImgFull.height,
                        );

                        logOp(op.id, '[ WAIT ] Generating high-res cutout...');
                        const { pngData, svgData } = await checkAbort(op.id, generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks, boxSet));
                        if (!pngData) throw new Error('No cutout could be cropped from the mask');
                        cut = {
                            cutoutDataUrl: pngData,
                            outlineSvg: svgData || '',
                            cloudSegmentationMasks: JSON.stringify({ width: img.width, height: img.height, svgData, layers: masks }),
                            // simplifiedFull is the raw contour the curve
                            // smoothing discards, kept because the 3D
                            // generators need points rather than a path.
                            segmentation: {
                                svgData: svgData || undefined,
                                points: normalizeContour(simplifiedFull, maskImgFull.width, maskImgFull.height),
                                cutoutDataUrl: pngData,
                                imageWidth: img.width,
                                imageHeight: img.height,
                                sourceImageUrl: imageUrl,
                                method: 'cloud',
                            },
                        };
                        logOp(op.id, '[  OK  ] Cloud Mask generated');
                    } else if (mode === 'hybrid') {
                        logOp(op.id, '[ WAIT ] [HYBRID 1/4] Running Local GPU AI for initial background removal...');
                        const local = await localCutout(imageUrl, 15, 25);
                        cut = { ...local, segmentation: { ...local.segmentation, method: 'hybrid' } };
                        const points = local.segmentation.points?.length || 0;
                        logOp(op.id, `[  OK  ] [HYBRID 2/4] Extracted ${points} vector points`);

                        logOp(op.id, '[ WAIT ] [HYBRID 3/4] Prompting Cloud AI for multi-layer refinement...');
                        updateOp(op.id, { progress: 60, stepLabel: 'Querying Cloud AI for Refinement...' });
                        try {
                            const layers = await segmentationLayers('hybrid', points);
                            logOp(op.id, `[  OK  ] [HYBRID 3/4] Cloud AI refined ${layers.length} layers`);
                            updateOp(op.id, { progress: 80, stepLabel: 'Building Final Refined SVG Masks...' });
                            const img = await loadImage(imageUrl);
                            const localPath = local.segmentation.svgData || '';
                            const masks = layersToMasks(
                                layers.length ? layers : [{ box_2d: [], label: 'artifact' }],
                                img.width, img.height, localPath, local.segmentation.imageWidth || img.width, local.segmentation.imageHeight || img.height,
                            );
                            logOp(op.id, '[ WAIT ] [HYBRID 4/4] Generating final high-res SVG & PNG cutout...');
                            const { pngData, svgData } = await checkAbort(op.id, generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks, boxSet));
                            cut = {
                                ...cut,
                                cutoutDataUrl: pngData || local.cutoutDataUrl,
                                outlineSvg: svgData || local.outlineSvg,
                                cloudSegmentationMasks: JSON.stringify({ width: img.width, height: img.height, svgData, layers: masks }),
                            };
                            logOp(op.id, '[  OK  ] [HYBRID 4/4] Hybrid pipeline completed successfully!');
                        } catch (cloudErr) {
                            if (cloudErr instanceof AiCancelledError || cancelTokens.current[op.id]) throw cloudErr;
                            logOp(op.id, `[ WARN ] Cloud refinement fallback to GPU mask: ${aiErrorMessage(cloudErr)}`);
                        }
                    } else {
                        logOp(op.id, '[ WAIT ] Running local AI for background removal...');
                        cut = await localCutout(imageUrl, 15, 70);
                    }

                    updateOp(op.id, { progress: 90, stepLabel: 'Finalizing Image...' });
                    await keepCutout(cut, cleanImage);
                    if (cleanImage) mark('img_clean', 'done');
                    if (segment) mark('image_segmentation', 'done');
                    emit();
                } catch (err) {
                    if (err instanceof AiCancelledError || cancelTokens.current[op.id]) throw new AiCancelledError();
                    imageFailed = true;
                    if (cleanImage) mark('img_clean', 'failed', err);
                    if (segment) mark('image_segmentation', 'failed', err);
                    logOp(op.id, `[ FAIL ] ${mode === 'cloud' ? 'Cloud Mask' : mode === 'hybrid' ? 'Hybrid segmentation' : 'Mask generation'} failed: ${aiErrorMessage(err)}`);
                    console.error(err);
                }
            }
            if (imageFailed) emit();
        } else if (!isVideo) {
            logOp(op.id, '[ SKIP ] Image processing skipped');
        }

        // ── Hex map, and the colour hint ──
        //
        // Sampled from the cleaned frame when there is one: sampling the
        // original means sampling the studio cloth and the cardboard too.
        const colorsWanted = explicit ? wants('dominant_colors') : true;
        const needColorHint = isHero && colorsWanted && !result.dominantColors?.length;
        const hexWanted = explicit ? wants('hex_map') : true;
        if (!isVideo && (hexWanted || needColorHint)) {
            try {
                const colorSource = result.cleanedUrl || result.cutoutUrl || op.imageUrl || imageUrl;
                const bitmapRes = await generateBitmapAndHexMap(colorSource, 20, 20, 80, 149, 61, 199, item.material, item.shape, item.vendorColor);
                // generateBitmapAndHexMap never throws: on a load failure, a
                // CORS refusal or its timeout it returns an all-#FFFFFF grid,
                // no bitmap and colours guessed from the material text. Only
                // a real bitmap means the photo was actually sampled; the
                // placeholder grid used to be saved over spatial_points.
                const sampled = !!bitmapRes.bitmapDataUrl;
                if (hexWanted) {
                    if (sampled && bitmapRes.hexString) {
                        result.bitmapUrl = bitmapRes.bitmapDataUrl;
                        result.hexString = bitmapRes.hexString;
                        result.cols = bitmapRes.cols || result.cols;
                        result.rows = bitmapRes.rows || result.rows;
                        mark('hex_map', 'done');
                    } else {
                        mark('hex_map', 'failed', new Error('The photo could not be sampled'));
                        logOp(op.id, '[ FAIL ] Hex map: the photo could not be sampled');
                    }
                }
                // Only the hero carries colours, and only the AI's colours are
                // stored. The pixel colours used to be put in dominantColors
                // and marked done, which hid the AI failure and saved colours
                // nobody had reviewed into generated_color. They are a hint in
                // the log now; the process keeps whatever status the AI left.
                if (needColorHint && sampled && bitmapRes.dominantColors?.length) {
                    logOp(op.id, `[ WARN ] No AI colours. The photo suggests: ${bitmapRes.dominantColors.join(', ')} (not saved)`);
                }
            } catch (err) {
                if (hexWanted) mark('hex_map', 'failed', err);
                logOp(op.id, `[ FAIL ] Hex map: ${aiErrorMessage(err)}`);
            }
        }

        const failed = [...ran].filter(p => status[p] === 'failed').length;
        const done = [...ran].filter(p => status[p] === 'done').length;
        const finalStatus: BatchOpStatus = failed === 0 ? 'completed' : done > 0 ? 'partial' : 'failed';
        if (finalStatus === 'partial') logOp(op.id, '[ WARN ] Finished with failures; see the lines above');

        emit({
            status: finalStatus,
            progress: finalStatus === 'failed' ? 0 : 100,
            stepLabel: undefined,
            forceRegenerateDescription: false,
            forceRecleanImage: false,
        });
        // Every other setHasUnsavedChanges(true) follows a manual UI action.
        // The automatic run had none, so a finished run left SAVE TO DB
        // disabled with results sitting only in React state.
        setHasUnsavedChanges(true);

        // Copy freshly generated text onto the sibling photos' cards. Only
        // what this run generated, and only when the caller keeps a queue.
        const generated: NonNullable<BatchOp['result']> = {};
        if (textFields.includes('title') && status.title_desc === 'done') generated.description = result.description;
        if (textFields.includes('body') && status.marketing_desc === 'done') generated.marketingDescription = result.marketingDescription;
        if (status.dominant_colors === 'done' && ran.has('dominant_colors')) generated.dominantColors = result.dominantColors;
        if (textFields.includes('type') && status.product_type === 'done') generated.generatedType = result.generatedType;
        if (isHero && setQueue && Object.keys(generated).length > 0) {
            setQueue(prev => prev.map(q =>
                q.item?.id === op.item?.id && q.id !== op.id
                    ? { ...q, result: { ...q.result, ...generated } }
                    : q));
        }
    } catch (err) {
        const cancelled = err instanceof AiCancelledError || !!cancelTokens.current[op.id];
        logOp(op.id, `[ FAIL ] ${cancelled ? 'Cancelled by user' : aiErrorMessage(err)}`);
        emit({ status: 'failed', progress: 0, stepLabel: undefined });
        if (!cancelled) throw err;
    } finally {
        cancel.dispose();
    }
};

export const processVariationItem = async (op: BatchOp, donors: DonorCandidate[], ctx: PipelineContext) => {
    const { updateOp, logOp, user, cancelTokens, setHasUnsavedChanges } = ctx;
    if (cancelTokens.current[op.id]) return;
    updateOp(op.id, { status: 'processing', progress: 15, stepLabel: 'Finding a similar item' });

    const item: PipelineItem = toPipelineItem(op.item);
    const self: DonorCandidate = {
        id: String(op.item.id || op.item.row || item.id || ''),
        shape: item.shape,
        type: item.type,
        material: item.material,
        color: item.vendorColor,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        lengthCm: item.lengthCm,
        description: '', marketingDescription: '', dominantColors: [], generatedType: '',
    };
    const cancel = watchCancel(op.id, cancelTokens);
    const variationIds: ProcessId[] = ['variation_donor', 'title_desc', 'marketing_desc', 'dominant_colors', 'product_type'];

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
        const built = buildContentPrompt(item, { variant: 'donor', donor: d });

        const askModel = (extra: string) => generateJson<RawContent>({
            job: 'content',
            prompt: built.prompt + extra,
            system: built.system,
            schema: built.schema,
            signal: cancel.signal,
        }).then(raw => {
            const fin = finalizeContent(raw, item);
            if (!fin.title) throw new Error('Invalid output format from AI');
            return fin;
        });

        // The record is the authority. The prompt already forbids
        // contradicting it, and on 8 Sep the model contradicted it anyway on
        // 18 of 223 items -- wrong stone, wrong colour, the donor's
        // dimensions. Asking is not checking, so finalizeContent checks.
        let fin = await askModel('');

        if (fin.issues.length > 0) {
            logOp(op.id, `[ WARN ] Draft contradicts the record; asking again`);
            fin.issues.forEach(i => logOp(op.id, `         ${i.message}`));
            updateOp(op.id, { progress: 55, stepLabel: 'Correcting the draft' });
            fin = await askModel(
                `\n\nYour previous answer was rejected because it disagreed with this ` +
                `item's inventory record:\n${describeIssues(fin.issues)}\n` +
                `Write it again. The record above is correct and your description ` +
                `must not contradict it.`);
        }

        if (fin.issues.length > 0) {
            // Refusing is the right outcome. Writing copy that contradicts
            // the record is what created this week's cleanup.
            logOp(op.id, `[ FAIL ] Rejected after retry -- item left unchanged`);
            fin.issues.forEach(i => logOp(op.id, `         ${i.message}`));
            updateOp(op.id, { status: 'failed', progress: 0, stepLabel: undefined });
            return;
        }

        const processStatus: Partial<Record<ProcessId, ProcessRunStatus>> = { ...(op.processStatus || {}) };
        variationIds.forEach(p => { processStatus[p] = 'done'; });
        updateOp(op.id, {
            status: 'completed',
            progress: 100,
            stepLabel: undefined,
            processStatus,
            result: {
                ...(op.result || {}),
                description: fin.title,
                marketingDescription: fin.html,
                dominantColors: fin.colors,
                generatedType: fin.genType || d.generatedType || '',
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
                resolveItemColor(op.item.data || op.item),
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
    } catch (err) {
        const message = cancelTokens.current[op.id] ? 'Cancelled by user' : aiErrorMessage(err);
        logOp(op.id, `[ FAIL ] ${message}`);
        const processErrors: Partial<Record<ProcessId, string>> = { ...(op.processErrors || {}) };
        processErrors.variation_donor = message;
        updateOp(op.id, { status: 'failed', progress: 0, stepLabel: undefined, processErrors });
    } finally {
        cancel.dispose();
    }
};
