import { saveAiPatch, type InventoryRow, type InventoryUpdate } from '../../lib/ai/persist';
import type { Json } from '../../lib/database.types';
import { uploadCleanedImage } from '../../lib/bgReplace';
import { getCleanImageUrl } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { buildCutoutSvgMarkup } from './svgPathEditor';

/**
 * Cleaned-photo and vector-mask writes for ImageCanvas. Each writer re-reads the target JSON column from
 * Supabase right before merging so sibling angles or concurrent Catalog Hub writes are never overwritten.
 */

const PREV_PREFIX = '_prev_clean:';

const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

const urlOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Same reading as persist.ts parseMap: a JSON object string, an object, or a legacy plain string kept under _legacy. */
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

/** Same reading as persist.ts parseMasks: an angle map, keeping a legacy root array under angle_0. */
const parseMasks = (raw: unknown): Record<string, unknown> => {
    let v = raw;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { return {}; }
    }
    if (Array.isArray(v)) return v.length ? { angle_0: v } : {};
    if (v && typeof v === 'object') return { ...(v as Record<string, unknown>) };
    return {};
};

const keyFor = (sourceUrl: string) => getCleanImageUrl(sourceUrl) || sourceUrl;

/** The clean and rollback URLs this photo has in the row's map right now. */
export function cleanedPhotoState(row: Record<string, any>, sourceUrl: string): { cleanedUrl?: string; prevUrl?: string } {
    const map = parseMap(row.processed_media_urls);
    const key = keyFor(sourceUrl);
    return { cleanedUrl: map[key] || undefined, prevUrl: map[PREV_PREFIX + key] || undefined };
}

export interface MaskOutlineState {
    svgUrl?: string;
    cutoutUrl?: string;
    matteUrl?: string;
    pathD?: string;
    fillRule?: 'nonzero' | 'evenodd';
    width?: number;
    height?: number;
    hasPrevOutline: boolean;
}

/** The active outline SVG, cutout, matte and rollback availability for `angleIndex` in `row`. */
export function maskOutlineState(row: Record<string, any>, angleIndex: number): MaskOutlineState {
    const masks = parseMasks(row.spatial_masks ?? row.spatialMasks);
    const list = Array.isArray(masks[`angle_${angleIndex}`]) ? (masks[`angle_${angleIndex}`] as unknown[]) : [];
    const head = list[0] && typeof list[0] === 'object' ? (list[0] as Record<string, any>) : undefined;
    const heroSvg = angleIndex === 0 ? urlOrUndef(row.generated_svg_url ?? row.generatedSvgUrl) : undefined;
    const heroPng = angleIndex === 0 ? urlOrUndef(row.generated_png_url ?? row.generatedPngUrl) : undefined;
    return {
        svgUrl: urlOrUndef(head?.svg) ?? heroSvg,
        cutoutUrl: urlOrUndef(head?.mask) ?? heroPng,
        matteUrl: urlOrUndef(head?.matte),
        pathD: typeof head?.pathD === 'string' && head.pathD.trim() ? head.pathD.trim() : undefined,
        fillRule: head?.fillRule === 'evenodd' || head?.fillRule === 'nonzero' ? head.fillRule : undefined,
        width: typeof head?.width === 'number' && head.width > 0 ? head.width : undefined,
        height: typeof head?.height === 'number' && head.height > 0 ? head.height : undefined,
        hasPrevOutline: list.length >= 2,
    };
}

/**
 * The map as it is in the database NOW, not as the row was when the canvas opened: the
 * Catalog Hub or another device may have written other photos' keys since, and a merge
 * into the stale copy would silently drop them.
 */
async function freshMap(row: Record<string, any>): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('inventory').select('processed_media_urls').eq('id', row.id).single();
    if (error) throw new Error(`Could not re-read the item before saving: ${error.message}`);
    return parseMap(data?.processed_media_urls);
}

/** Re-read spatial_masks and generated_svg_url right before merging an outline change. */
async function freshMasks(row: Record<string, any>): Promise<{ masks: Record<string, unknown>; generatedSvgUrl: string | null }> {
    const { data, error } = await supabase.from('inventory').select('spatial_masks, generated_svg_url').eq('id', row.id).single();
    if (error) throw new Error(`Could not re-read the item before saving: ${error.message}`);
    return {
        masks: parseMasks(data?.spatial_masks),
        generatedSvgUrl: typeof data?.generated_svg_url === 'string' ? data.generated_svg_url : null,
    };
}

async function writeMap(row: Record<string, any>, map: Record<string, string>, user?: unknown): Promise<InventoryRow> {
    const rowId = String(row.id || '');
    const saved = await saveAiPatch(rowId, {
        columns: { processed_media_urls: JSON.stringify(map) },
        segmentations: [],
        warnings: [],
        failedUploads: [],
    }, { user });
    if (!saved) throw new Error('Save failed: no row came back');
    return saved;
}

export interface SaveCleanedPhotoArgs {
    row: Record<string, any>;
    angleIndex: number;
    sourceUrl: string;
    dataUrl: string;
    user?: unknown;
}

/** Upload the cleaned PNG to Drive and point this photo's key at it, keeping the old clean as the rollback. */
export async function saveCleanedPhotoToDb({ row, angleIndex, sourceUrl, dataUrl, user }: SaveCleanedPhotoArgs): Promise<{ savedRow: InventoryRow; uploadedUrl: string; prevUrl?: string }> {
    const uploadedUrl = await uploadCleanedImage(dataUrl, `clean_${row.id}_a${angleIndex}.png`, user);
    if (!uploadedUrl) throw new Error('Upload to Drive returned no URL; nothing was saved');
    const key = keyFor(sourceUrl);
    const map = await freshMap(row);
    const prevUrl = map[key];
    if (prevUrl && prevUrl !== uploadedUrl) map[PREV_PREFIX + key] = prevUrl;
    map[key] = uploadedUrl;
    const savedRow = await writeMap(row, map, user);
    return { savedRow, uploadedUrl, prevUrl };
}

/** Swap this photo's clean with its `_prev_clean:` backup. Throws when there is no backup to restore. */
export async function rollbackCleanedPhotoInDb(row: Record<string, any>, sourceUrl: string, user?: unknown): Promise<InventoryRow> {
    const key = keyFor(sourceUrl);
    const map = await freshMap(row);
    const prev = map[PREV_PREFIX + key];
    if (!prev) throw new Error('No previous clean image to restore');
    const current = map[key];
    map[key] = prev;
    if (current) map[PREV_PREFIX + key] = current;
    else delete map[PREV_PREFIX + key];
    return writeMap(row, map, user);
}

export interface SaveMaskSvgArgs {
    row: Record<string, any>;
    angleIndex: number;
    sourceUrl?: string | null;
    pathD: string;
    fillRule: 'nonzero' | 'evenodd';
    width: number;
    height: number;
    cutoutUrl?: string | null;
    user?: unknown;
}

/**
 * Build the cutout SVG document, upload it to Drive, re-read spatial_masks from Supabase,
 * and prepend a new head entry to `spatial_masks['angle_' + angleIndex]` keeping all prior versions.
 */
export async function saveMaskSvgToDb({
    row,
    angleIndex,
    pathD,
    fillRule,
    width,
    height,
    cutoutUrl,
    user,
}: SaveMaskSvgArgs): Promise<{ savedRow: InventoryRow; uploadedUrl: string }> {
    const cleanHref = cutoutUrl ? (getCleanImageUrl(cutoutUrl) || cutoutUrl) : null;
    const svgMarkup = buildCutoutSvgMarkup(pathD, width, height, cleanHref, fillRule);
    if (!svgMarkup) throw new Error('Outline path is empty; nothing was saved');

    const newSvgUrl = await uploadCleanedImage(svgDataUrl(svgMarkup), `outline_${row.id}_a${angleIndex}.svg`, user);
    if (!newSvgUrl) throw new Error('Upload to Drive returned no URL; nothing was saved');

    const { masks } = await freshMasks(row);
    const angleKey = `angle_${angleIndex}`;
    const existingList = Array.isArray(masks[angleKey]) ? (masks[angleKey] as unknown[]) : [];
    const oldHead = existingList[0] && typeof existingList[0] === 'object' ? (existingList[0] as Record<string, any>) : {};

    const newHead: Record<string, any> = {
        ...oldHead,
        svg: newSvgUrl,
        pathD,
        fillRule,
        width,
        height,
        updatedAt: new Date().toISOString(),
    };
    masks[angleKey] = [newHead, ...existingList];

    const columns: InventoryUpdate = {
        spatial_masks: masks as Json,
        ...(angleIndex === 0 ? { generated_svg_url: newSvgUrl } : {}),
    };

    const rowId = String(row.id || '');
    const savedRow = await saveAiPatch(rowId, {
        columns,
        segmentations: [],
        warnings: [],
        failedUploads: [],
    }, { user });
    if (!savedRow) throw new Error('Save failed: no row came back');
    return { savedRow, uploadedUrl: newSvgUrl };
}

/**
 * Roll back the outline for `angleIndex`: when the angle array has 2+ entries,
 * move `[1]` to `[0]` and the old head to the end, updating `generated_svg_url` for angle 0.
 */
export async function rollbackMaskSvgInDb(
    row: Record<string, any>,
    angleIndex: number,
    user?: unknown,
): Promise<InventoryRow> {
    const { masks } = await freshMasks(row);
    const angleKey = `angle_${angleIndex}`;
    const list = Array.isArray(masks[angleKey]) ? [...(masks[angleKey] as unknown[])] : [];
    if (list.length < 2) throw new Error('No previous outline version to restore');

    const [oldHead, nextHead, ...rest] = list;
    masks[angleKey] = [nextHead, ...rest, oldHead];

    const nextSvg =
        nextHead && typeof nextHead === 'object' && typeof (nextHead as Record<string, any>).svg === 'string'
            ? ((nextHead as Record<string, any>).svg as string)
            : undefined;

    const columns: InventoryUpdate = {
        spatial_masks: masks as Json,
        ...(angleIndex === 0 && nextSvg ? { generated_svg_url: nextSvg } : {}),
    };

    const rowId = String(row.id || '');
    const saved = await saveAiPatch(rowId, {
        columns,
        segmentations: [],
        warnings: [],
        failedUploads: [],
    }, { user });
    if (!saved) throw new Error('Restore failed: no row came back');
    return saved;
}
