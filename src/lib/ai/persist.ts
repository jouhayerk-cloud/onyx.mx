/**
 * The one writer for AI output.
 *
 * Six save paths wrote AI results, and no two agreed. The Catalog Hub's
 * per-card save and its SAVE TO DB disagreed on brand terms, template HTML,
 * spatial_masks and generated_png_url; SAVE TO DB rebuilt processed_media_urls
 * and spatial_masks from scratch, dropping every entry the run had not
 * touched, and wrote the template body and pixel-sampled colours nobody had
 * reviewed; Batch Create wrote every AI column whatever was ticked;
 * BatchActionsModal wrote camelCase keys that are not columns; ProcessView
 * overwrote the vendor `description`.
 *
 * buildAiPatch applies the canonical column map once:
 *
 *   title_desc          -> detailed_description
 *   marketing_desc      -> generated_description
 *   dominant_colors     -> generated_color (+ _generated_color in the map)
 *   product_type        -> generated_type  (+ _generated_type, _product_*)
 *   hex_map             -> spatial_points  (+ _pixel_map_hex, _bitmap_url)
 *   img_clean           -> processed_media_urls[clean source url]
 *   image_segmentation  -> spatial_masks.angle_N, generated_png_url (hero
 *                          cutout), generated_svg_url (hero outline), and the
 *                          item_segmentation table
 *   video_proc          -> processed_media_urls videoGen*
 *   variation_donor     -> the four text columns + axo_icon_url
 *
 * `description`, `short_description` and `color` belong to the vendor and the
 * entry form; nothing here writes them. Only processes that were selected AND
 * succeeded are written. The two JSON columns are merged with what is stored,
 * and every data: URL is uploaded first, so the table never holds one.
 */
import { supabase } from '../supabase';
import { getDatabase } from '../database';
import type { Database, Json } from '../database.types';
import { getCleanImageUrl, getProductCategoryAndType } from '../utils';
import { uploadCleanedImage } from '../bgReplace';
import { saveSegmentation, type SegmentationResult } from '../segmentationStore';
import type { CatalogProcess } from '../catalogHubProcesses';
import type { BatchOp } from '../catalogHubPipeline';
import { finalizeColors, finalizeHtml, finalizeTitle } from './finalize';

export type ProcessId = CatalogProcess['id'];
export type InventoryRow = Database['public']['Tables']['inventory']['Row'];
export type InventoryUpdate = Database['public']['Tables']['inventory']['Update'];

/** One photo's image outputs. */
export interface AiPhotoResult {
    /** The original photo, as stored in media_urls. */
    sourceUrl: string;
    /** Its position among the item's photos; spatial_masks.angle_N and item_segmentation.angle_index. */
    index: number;
    /** Background-replaced photo, or the transparent cutout in the cut-out modes. */
    cleanedUrl?: string;
    /** Transparent PNG of the piece alone. */
    cutoutUrl?: string;
    /** Black-and-white matte of the piece. */
    matteUrl?: string;
    /** SVG markup of the outline. */
    outlineSvg?: string;
    /** Uploaded outline, when a previous save already uploaded it. */
    svgUrl?: string;
    /** Semantic layers from the cloud/hybrid segmentation (mirror glass etc.). */
    layers?: unknown[];
    width?: number;
    height?: number;
    segmentation?: SegmentationResult;
}

/** One item's AI outputs, whichever screen produced them. */
export interface AiItemResult {
    title?: string;
    html?: string;
    colors?: string[];
    genType?: string;
    hexMap?: { hexString: string; bitmapUrl?: string; cols: number; rows: number };
    axoIconUrl?: string;
    /** videoGen, videoGen_N and videoGenCount entries for processed_media_urls. */
    videoMap?: Record<string, string>;
    photos: AiPhotoResult[];
    /**
     * Processes that ran and succeeded. When absent (results from before
     * per-process status existed) a process counts as succeeded when its
     * output is present.
     */
    succeeded?: ReadonlySet<ProcessId>;
}

export interface AiPatch {
    columns: InventoryUpdate;
    /** Rows for the item_segmentation table, written by saveAiPatch. */
    segmentations: SegmentationResult[];
    /** Everything worth telling the user: failed uploads, and a vendor-echo title left out. */
    warnings: string[];
    /**
     * The failed uploads alone. Their columns were left out rather than
     * written as data: URLs, so the work is NOT saved: a caller must report
     * these as failures and keep its unsaved state, not announce success.
     */
    failedUploads: string[];
}

const TEXT_PROCESSES: readonly ProcessId[] = ['title_desc', 'marketing_desc', 'dominant_colors', 'product_type'];

/**
 * Collapse a run's ops (one per photo) into one item result.
 *
 * The hero (imageIndex 0) wins for text, colours and the hex map, because
 * only the hero runs the text call. Siblings used to finish with a stale
 * snapshot of the text, or with pixel-sampled colours of their own photo, and
 * SAVE TO DB took whichever op came last. Image outputs stay per photo.
 */
export function aiResultFromOps(ops: readonly BatchOp[]): AiItemResult {
    const sorted = [...ops].sort((a, b) => (a.imageIndex || 0) - (b.imageIndex || 0));
    const hero = sorted.find(o => (o.imageIndex || 0) === 0) || sorted[0];
    const h = hero?.result || {};

    const succeeded = new Set<ProcessId>();
    let anyStatus = false;
    for (const op of sorted) {
        if (!op.processStatus) continue;
        anyStatus = true;
        for (const [id, status] of Object.entries(op.processStatus)) {
            if (status !== 'done') continue;
            // A sibling never runs the text call; only the hero's count.
            if (op !== hero && TEXT_PROCESSES.includes(id as ProcessId)) continue;
            succeeded.add(id as ProcessId);
        }
    }

    const hexOp = sorted.find(o => o.result?.hexString);
    const heroHex = h.hexString ? hero : hexOp;

    const videoMap: Record<string, string> = {};
    for (const op of sorted) {
        const pm = op.result?.processedMap;
        if (!pm) continue;
        for (const [k, v] of Object.entries(pm)) {
            if (k.startsWith('videoGen') && v) videoMap[k] = v;
        }
        if (op.result?.videoGen && !videoMap.videoGen) videoMap.videoGen = op.result.videoGen;
    }

    return {
        title: h.description || undefined,
        html: h.marketingDescription || undefined,
        colors: h.dominantColors?.length ? h.dominantColors : undefined,
        genType: h.generatedType || undefined,
        hexMap: heroHex?.result?.hexString ? {
            hexString: heroHex.result.hexString,
            bitmapUrl: heroHex.result.bitmapUrl,
            cols: heroHex.result.cols || 20,
            rows: heroHex.result.rows || 20,
        } : undefined,
        axoIconUrl: sorted.map(o => o.result?.axoIconUrl).filter(Boolean).pop(),
        videoMap: Object.keys(videoMap).length ? videoMap : undefined,
        photos: sorted
            .filter(o => !!o.imageUrl)
            .map(o => {
                const r = o.result || {};
                let layers: unknown[] | undefined;
                if (r.cloudSegmentationMasks) {
                    try { layers = JSON.parse(r.cloudSegmentationMasks)?.layers; } catch { layers = undefined; }
                }
                return {
                    sourceUrl: o.imageUrl!,
                    index: o.imageIndex || 0,
                    cleanedUrl: r.cleanedUrl,
                    cutoutUrl: r.cutoutUrl,
                    matteUrl: r.matteUrl,
                    outlineSvg: r.outlineSvg,
                    svgUrl: r.svgUrl,
                    layers,
                    width: r.segmentation?.imageWidth,
                    height: r.segmentation?.imageHeight,
                    segmentation: r.segmentation,
                };
            }),
        succeeded: anyStatus ? succeeded : undefined,
    };
}

// A value that predates the JSON map (a bare URL or a comma list) is kept
// under _legacy, so merging into it never drops what is stored. Readers skip
// underscore keys, as they already do for _generated_color and _product_type.
const parseMap = (raw: unknown): Record<string, string> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, string>) };
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return {};
        if (s.startsWith('{')) {
            try { return JSON.parse(s); } catch { return { _legacy: s }; }
        }
        return { _legacy: s };
    }
    return {};
};

/**
 * spatial_masks as an angle map. The old single-array form is what angle 0
 * looked like before multi-angle saves, so it is kept under angle_0 (the rule
 * ProcessView already used) instead of being thrown away.
 */
const parseMasks = (raw: unknown): Record<string, unknown> => {
    let v = raw;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { return {}; }
    }
    if (Array.isArray(v)) return v.length ? { angle_0: v } : {};
    if (v && typeof v === 'object') return { ...(v as Record<string, unknown>) };
    return {};
};

const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/**
 * Build the column patch for one item.
 *
 * `existingRow` is the stored row (raw or normalized; its processed_media_urls
 * and spatial_masks are the merge base). `processes` is what the user ticked.
 * Uploads happen here, so call it at save time, not when the run finishes.
 */
export async function buildAiPatch(
    result: AiItemResult,
    existingRow: Partial<InventoryRow> & Record<string, any>,
    processes: ReadonlySet<ProcessId>,
    opts: { user?: unknown } = {},
): Promise<AiPatch> {
    const columns: InventoryUpdate = {};
    const segmentations: SegmentationResult[] = [];
    const warnings: string[] = [];
    const failedUploads: string[] = [];
    const rowId = String(existingRow?.id || 'item');

    const present: Record<ProcessId, boolean> = {
        title_desc: !!result.title,
        marketing_desc: !!result.html,
        dominant_colors: !!result.colors?.length,
        product_type: !!result.genType,
        hex_map: !!result.hexMap?.hexString,
        img_clean: result.photos.some(p => !!p.cleanedUrl),
        image_segmentation: result.photos.some(p => !!(p.cutoutUrl || p.matteUrl || p.outlineSvg || p.segmentation)),
        video_proc: !!result.videoMap,
        variation_donor: !!(result.title || result.html),
    };
    const want = (p: ProcessId) => processes.has(p) && present[p]
        && (result.succeeded ? result.succeeded.has(p) : true);
    // A donor run fills the same four text fields as the photo processes.
    const donor = want('variation_donor');

    /** Upload a data: URL; pass an http URL through; null when the upload failed. */
    const ensureUploaded = async (url: string | undefined, name: string, what: string): Promise<string | null> => {
        if (!url) return null;
        if (!url.startsWith('data:')) return url;
        try {
            return await uploadCleanedImage(url, name, opts.user);
        } catch (err: any) {
            const msg = `${what}: upload failed (${err?.message || err})`;
            warnings.push(msg);
            failedUploads.push(msg);
            return null;
        }
    };

    const storedMap = parseMap(existingRow?.processed_media_urls ?? (existingRow as any)?.processedMediaUrls);
    const map = { ...storedMap };

    // ── text ──
    // The vendor's word coming back as a "title" (the Catalog Hub queue seeds
    // result.description with it) is not AI output and is never stored as one.
    const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const vendorEcho = !!result.title && norm(result.title) === norm(existingRow?.description)
        && norm(result.title) !== norm(existingRow?.detailed_description ?? (existingRow as any)?.detailedDescription);
    if (vendorEcho) warnings.push('Title skipped: it is the vendor description, not a generated title');
    if ((want('title_desc') || donor) && result.title && !vendorEcho) {
        columns.detailed_description = finalizeTitle(result.title);
    }
    if ((want('marketing_desc') || donor) && result.html) {
        columns.generated_description = finalizeHtml(result.html);
    }
    if ((want('dominant_colors') || donor) && result.colors?.length) {
        const colors = finalizeColors(result.colors);
        if (colors.length) {
            columns.generated_color = colors.join(', ');
            map._generated_color = columns.generated_color;
        }
    }
    if ((want('product_type') || donor) && result.genType) {
        columns.generated_type = result.genType;
        map._generated_type = result.genType;
        // Not columns: these live in the map, where normalizeInventoryData
        // reads them back (see handleSaveDescription's 42703 note).
        const cat = getProductCategoryAndType({
            ...existingRow,
            shortDescription: existingRow?.short_description ?? (existingRow as any)?.shortDescription,
            description: result.title || existingRow?.description,
            type: result.genType,
        });
        if (cat) {
            map._product_category = cat.category;
            map._product_type = cat.type;
        }
    }
    if (donor && result.axoIconUrl) {
        const url = await ensureUploaded(result.axoIconUrl, `axo_${rowId}.jpg`, 'Icon');
        if (url) columns.axo_icon_url = url;
    }

    // ── hex map ──
    if (want('hex_map') && result.hexMap) {
        const { hexString, cols, rows } = result.hexMap;
        const bitmapUrl = await ensureUploaded(result.hexMap.bitmapUrl, `bitmap_${rowId}.webp`, 'Bitmap');
        columns.spatial_points = [{
            type: 'pixel_map',
            dimensions: `${cols}x${rows}`,
            cols,
            rows,
            hex_string: hexString,
            bitmap_url: bitmapUrl || null,
        }] as unknown as Json;
        map._pixel_map_hex = hexString;
        if (bitmapUrl) map._bitmap_url = bitmapUrl;
    }

    // ── cleaned photos ──
    if (want('img_clean')) {
        for (const photo of result.photos) {
            if (!photo.cleanedUrl) continue;
            const url = await ensureUploaded(photo.cleanedUrl, `clean_${rowId}_a${photo.index}.png`, `Clean photo ${photo.index + 1}`);
            // Keyed by the CLEANED source url: the form UnifiedInventoryView
            // looks up, and the form every existing entry uses.
            if (url) map[getCleanImageUrl(photo.sourceUrl) || photo.sourceUrl] = url;
        }
    }

    // ── segmentation ──
    if (want('image_segmentation')) {
        const masks = parseMasks(existingRow?.spatial_masks ?? (existingRow as any)?.spatialMasks);
        let masksChanged = false;
        const heroIndex = Math.min(...result.photos.map(p => p.index));

        for (const photo of result.photos) {
            const tag = `${rowId}_a${photo.index}`;
            const cutout = await ensureUploaded(photo.cutoutUrl, `cutout_${tag}.png`, `Cutout ${photo.index + 1}`);
            const matte = await ensureUploaded(photo.matteUrl, `matte_${tag}.png`, `Mask ${photo.index + 1}`);
            const svg = photo.svgUrl
                || (photo.outlineSvg ? await ensureUploaded(svgDataUrl(photo.outlineSvg), `outline_${tag}.svg`, `Outline ${photo.index + 1}`) : null);

            if (cutout || matte || svg) {
                // `mask` stays the cutout image, which is what every existing
                // angle entry holds and what the readers draw.
                masks[`angle_${photo.index}`] = [{
                    mask: cutout || matte,
                    ...(matte ? { matte } : {}),
                    ...(svg ? { svg } : {}),
                    ...(photo.layers?.length ? { layers: photo.layers } : {}),
                    ...(photo.width && photo.height ? { width: photo.width, height: photo.height } : {}),
                }];
                masksChanged = true;
            }
            if (photo.index === heroIndex) {
                if (cutout) columns.generated_png_url = cutout;
                if (svg) columns.generated_svg_url = svg;
            }
            if (photo.segmentation) {
                segmentations.push({ ...photo.segmentation, angleIndex: photo.index });
            }
        }
        if (masksChanged) columns.spatial_masks = masks as Json;
    }

    // ── video ──
    if (want('video_proc') && result.videoMap) {
        Object.assign(map, result.videoMap);
    }

    if (JSON.stringify(map) !== JSON.stringify(storedMap)) {
        columns.processed_media_urls = JSON.stringify(map);
    }

    return { columns, segmentations, warnings, failedUploads };
}

export const isEmptyPatch = (patch: AiPatch) =>
    Object.keys(patch.columns).length === 0 && patch.segmentations.length === 0;

/**
 * Write a patch: Supabase by `id` (never by item_id, which is unique only
 * within a workbook), then the RxDB mirror, then the segmentation rows.
 *
 * Throws when the inventory update fails. The mirror and the segmentation
 * table are best-effort: realtime sync repairs the first, and
 * saveSegmentation already logs and swallows its own failures, because a
 * cutout upload timing out must not cost the text that saved beside it.
 */
export async function saveAiPatch(rowId: string, patch: AiPatch, opts: { user?: unknown } = {}): Promise<InventoryRow | null> {
    if (!rowId) throw new Error('saveAiPatch: no row id');
    let saved: InventoryRow | null = null;

    if (Object.keys(patch.columns).length > 0) {
        const { data, error } = await supabase
            .from('inventory')
            .update(patch.columns)
            .eq('id', rowId)
            .select('*')
            .single();
        if (error) throw new Error(`Save failed: ${error.message}`);
        saved = data as InventoryRow;

        try {
            const db: any = await getDatabase();
            if (db?.inventory && saved) {
                await db.inventory.upsert({
                    ...saved,
                    id: String(saved.id),
                    ...(saved.workbook != null ? { workbook: String(saved.workbook) } : {}),
                });
            }
        } catch (err) {
            console.warn('[AI persist] RxDB mirror update failed; realtime sync will repair it.', err);
        }
    }

    for (const seg of patch.segmentations) {
        await saveSegmentation(rowId, seg, opts.user);
    }

    return saved;
}
