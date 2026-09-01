/**
 * aiContent.ts — which AI-generated content an item carries.
 *
 * The enrichment pipeline is a strict funnel, not a set of independent fields.
 * Verified against all 497 production rows, with zero exceptions:
 *
 *     497  all items
 *      └─ 397  image cleanup   processed_media_urls + generated_color
 *          └─ 175  vision      detailed_description + spatial_masks
 *              └─ 142  copy    generated_description + spatial_points
 *
 *     116  cutout render (generated_png_url) — branches off vision, and is the
 *          one stage that is not a clean prefix: 86 of those also have copy,
 *          30 do not.
 *
 * Two facts from that audit shape this file:
 *
 *   1. The field PAIRS are always written together — detailed_description with
 *      spatial_masks, generated_description with spatial_points, on every row
 *      with no mismatches. Each pair is one pass leaving two artifacts, so a
 *      stage test reads either column and treats them as one signal.
 *
 *   2. Nothing has any AI field without a cleaned image. `enriched` is
 *      therefore the honest test for "has AI content at all" — it is not an
 *      OR across every column, it is the funnel's entry gate, and the two
 *      agree exactly.
 */

export type ContentKey = 'enriched' | 'vision' | 'copy' | 'cutout' | 'none';

const filled = (v: unknown): boolean => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    const s = String(v).trim();
    return s !== '' && s !== '-' && s !== '[]' && s !== '{}' && s.toUpperCase() !== 'NULL';
};

const read = (d: any, ...keys: string[]): boolean => keys.some(k => filled(d?.[k]));

/** Image cleanup ran. The funnel's entry gate, and so the test for "has any". */
export const hasEnrichment = (d: any): boolean =>
    read(d, 'processedMediaUrls', 'processed_media_urls', 'generatedColor', 'generated_color');

/** Vision analysis ran: a written-up description plus segmentation masks. */
export const hasVision = (d: any): boolean =>
    read(d, 'detailedDescription', 'detailed_description', 'spatialMasks', 'spatial_masks');

/** Copywriting ran: the generated sales description plus spatial points. */
export const hasCopy = (d: any): boolean =>
    read(d, 'generatedDescription', 'generated_description', 'spatialPoints', 'spatial_points');

/** A transparent cutout was rendered from the cleaned photo. */
export const hasCutout = (d: any): boolean =>
    read(d, 'generatedPngUrl', 'generated_png_url');

export const CONTENT_FILTERS: { key: ContentKey; label: string; hint: string }[] = [
    { key: 'enriched', label: 'AI Content', hint: 'Any generated content — cleaned image and colour' },
    { key: 'vision',   label: 'Vision',     hint: 'Analysed: detailed description and masks' },
    { key: 'copy',     label: 'Copy',       hint: 'Written up: generated description' },
    { key: 'cutout',   label: 'Cutout',     hint: 'Transparent PNG rendered' },
    { key: 'none',     label: 'No AI',      hint: 'Never processed' },
];

export const matchesContentKey = (d: any, key: ContentKey): boolean => {
    switch (key) {
        case 'enriched': return hasEnrichment(d);
        case 'vision':   return hasVision(d);
        case 'copy':     return hasCopy(d);
        case 'cutout':   return hasCutout(d);
        // Deliberately the negation of the entry gate rather than of every
        // field: since nothing carries AI content without a cleaned image,
        // the two are equivalent, and this stays correct if a later stage
        // adds a column nobody remembers to list here.
        case 'none':     return !hasEnrichment(d);
        default:         return true;
    }
};

/**
 * Selected keys are OR-ed. Picking Vision and Cutout asks for items with
 * either, which is what a row of chips reads as — an unselected filter
 * constrains nothing.
 */
export const rowMatchesContent = (d: any, selected: string[] | undefined): boolean => {
    if (!selected || selected.length === 0) return true;
    return selected.some(k => matchesContentKey(d, k as ContentKey));
};

/** Live counts for the chips, so the distribution is visible while choosing. */
export const countContent = (rows: any[]): Record<ContentKey, number> => {
    const out: Record<ContentKey, number> = { enriched: 0, vision: 0, copy: 0, cutout: 0, none: 0 };
    for (const row of rows) {
        const d = row?.data ?? row;
        if (hasEnrichment(d)) {
            out.enriched++;
            if (hasVision(d)) out.vision++;
            if (hasCopy(d)) out.copy++;
            if (hasCutout(d)) out.cutout++;
        } else {
            out.none++;
        }
    }
    return out;
};
