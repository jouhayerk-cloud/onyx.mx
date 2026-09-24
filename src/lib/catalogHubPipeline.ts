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
    collectAllImages, 
    normalizeInventoryData, 
    SHOPIFY_PRODUCT_TYPES,
    formatProductTitle
} from './utils';
import { normalizeContour, type SegmentationResult } from './segmentationStore';
import { removeBackground } from '@imgly/background-removal';
import { extractDominantColorsFromImage, generateBitmapAndHexMap, reconstructRgbPixelMap } from './colorExtractor';
import { findDonor, isUsableDonor, type DonorCandidate, TIER_LABEL } from './variationMatch';
import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
import { validateCopy, describeIssues } from './copyValidation';

export type ProcessingMode = 'bgreplace' | 'local' | 'cloud' | 'hybrid';

export interface BatchOp {
    id: string;
    item: any;
    imageIndex?: number;
    imageUrl?: string;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    stepLabel?: string;
    processingMode?: ProcessingMode;
    skipImageProcessing?: boolean;
    forceRegenerateDescription?: boolean;
    forceRecleanImage?: boolean;
    needsVariation?: boolean;
    result?: {
        description?: string;
        marketingDescription?: string;
        dominantColors?: string[];
        generatedType?: string;
        cleanedUrl?: string;
        cleanedKey?: string;
        svgUrl?: string;
        axoIconUrl?: string;
        processedMap?: Record<string, string>;
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
    callGemini: (prompt: string, imgData: string | null, timeoutMs?: number, modelId?: string, responseSchema?: any) => Promise<any>;
    user: any;
    bgQuality: BgQuality;
    cancelTokens: { current: Record<string, boolean> };
    setHasUnsavedChanges: (val: boolean) => void;
    setQueue?: (updater: (prev: BatchOp[]) => BatchOp[]) => void;
}

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
            marketingDescription: String(n.marketingDescription || n.marketing_description || ''),
            dominantColors: Array.isArray(n.generatedColor) ? n.generatedColor
                : String(n.generatedColor || n.generated_color || '')
                    .split(',').map((c: string) => c.trim()).filter(Boolean),
            generatedType: String(n.generatedType || n.generated_type || ''),
        };
    }).filter(isUsableDonor);


export const processSingleItem = async (op: BatchOp, ctx: PipelineContext) => {
    const { updateOp, logOp, checkAbort, callGemini, user, bgQuality, cancelTokens, setHasUnsavedChanges, setQueue } = ctx;
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

export const processVariationItem = async (op: BatchOp, donors: DonorCandidate[], ctx: PipelineContext) => {
    const { updateOp, logOp, callGemini, user, cancelTokens, setHasUnsavedChanges } = ctx;
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
