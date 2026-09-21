/**
 * Persistence for real segmentation output.
 *
 * Background cleaning and segmentation are independent processes. Cleaning
 * continues to write `processed_media_urls` and `generated_png_url` exactly as
 * it always has; nothing here touches either. This module owns the other half:
 * the RGBA cutout and the contour vectors, written to `item_segmentation`.
 *
 * It exists because that half was never persisted at all. The wizard computed
 * it, assigned it to `op.result.cloudSegmentationMasks`, and lost it -- there is
 * no `cloud_segmentation_masks` column in Postgres and no such field in the RxDB
 * schema. A comment in BatchProcessingWizard records the workaround that
 * followed: the payload was redirected into `spatial_masks`, which is how that
 * column came to hold background-REPLACED photographs under a key called
 * "mask".
 */
import { supabase } from './supabase';
import type { Json } from './database.types';
import { handleProcessedFileUpload } from './utils';

/** A contour point, normalised to 0..1 against the source image. */
export interface ContourPoint {
  x: number;
  y: number;
}

export interface SegmentationResult {
  /** `<svg>` markup or path data, for the vector editor and exports. */
  svgData?: string;
  /**
   * Raw simplified contour, normalised 0..1.
   *
   * Kept alongside `svgData` rather than derived from it: `createCurvePath`
   * smooths through quadratic beziers, so parsing points back out of the path
   * loses precision at exactly the step that can least afford it -- building
   * the 3D profile. Going the other way is lossless, so points are the master.
   */
  points?: ContourPoint[];
  /** Data URL of the RGBA cutout, uploaded to Drive on persist. */
  cutoutDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  sourceImageUrl?: string;
  angleIndex?: number;
  /** 'local' | 'cloud' | 'hybrid'. Never 'bgreplace' -- that mode segments nothing. */
  method?: string;
}

/**
 * Normalise a pixel-space contour to 0..1.
 *
 * The generators need resolution-independent points: the same piece
 * photographed at 1200x1600 and 1792x2400 must yield the same profile.
 */
export function normalizeContour(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): ContourPoint[] {
  if (!width || !height) return [];
  return points.map(p => ({
    x: p.x / width,
    y: p.y / height,
  }));
}

/**
 * Upload the cutout and upsert the row.
 *
 * Deliberately non-throwing. Segmentation is a secondary product of a long
 * batch run, and a failure here must never take down the description, pricing
 * and cleaned-image work that ran alongside it -- the 42703 incident that
 * produced this table's existence was exactly that failure mode, where one bad
 * column silently downgraded the whole save.
 *
 * Returns the row id on success, or null, having logged the reason.
 */
export async function saveSegmentation(
  itemId: string,
  result: SegmentationResult,
  user: unknown,
): Promise<string | null> {
  if (!itemId) {
    console.warn('[Segmentation] No item id; skipping save.');
    return null;
  }

  const hasVectors = !!result.svgData || !!(result.points && result.points.length);
  if (!hasVectors && !result.cutoutDataUrl) {
    return null;
  }

  try {
    let cutoutFileId: string | null = null;

    if (result.cutoutDataUrl) {
      // Reuses the existing Drive upload path so the cutout lands beside every
      // other processed asset, under the same account and folder conventions.
      const upload = await handleProcessedFileUpload(
        result.cutoutDataUrl,
        `segmentation_${itemId}_a${result.angleIndex ?? 0}.png`,
        user,
      );
      cutoutFileId = upload?.fileId ?? null;
    }

    const row = {
      item_id: itemId,
      source_image_url: result.sourceImageUrl ?? null,
      angle_index: result.angleIndex ?? 0,
      svg_data: result.svgData ?? null,
      // Cast, not a looser ContourPoint: {x, y} IS valid Json, but a declared
      // interface has no index signature so it never satisfies the generated
      // Json type structurally. Widening ContourPoint to carry one would let
      // any numeric key in and lose the shape the 3D generators read.
      contour_points: (result.points ?? null) as unknown as Json,
      cutout_png_file_id: cutoutFileId,
      image_width: result.imageWidth ?? null,
      image_height: result.imageHeight ?? null,
      method: result.method ?? null,
    };

    const { data, error } = await supabase
      .from('item_segmentation')
      .upsert(row, { onConflict: 'item_id,angle_index' })
      .select('id')
      .single();

    if (error) {
      console.error('[Segmentation] Save failed:', error.message, error.code);
      return null;
    }

    return data?.id ?? null;
  } catch (e) {
    console.error('[Segmentation] Save threw:', e);
    return null;
  }
}

/** Every stored segmentation for an item, lowest angle first. */
export async function loadSegmentations(itemId: string) {
  const { data, error } = await supabase
    .from('item_segmentation')
    .select('*')
    .eq('item_id', itemId)
    .order('angle_index', { ascending: true });

  if (error) {
    console.error('[Segmentation] Load failed:', error.message);
    return [];
  }
  return data ?? [];
}
