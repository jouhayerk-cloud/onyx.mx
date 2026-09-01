/**
 * aiContent.ts — which AI-generated content an item carries.
 *
 * CORRECTED 2026-09-01 after a peer review caught this file measuring the
 * wrong thing. The first version treated "processed_media_urls is non-empty"
 * as "an image was cleaned". It is not. That column holds a JSON MAP with two
 * kinds of entry:
 *
 *   "_generated_color": "..."          metadata, underscore-prefixed
 *   "_generated_type":  "..."          metadata
 *   "_pixel_map_hex":   "..."          metadata
 *   "_bitmap_url":      "..."          metadata
 *   "https://…/photo.jpg": "https://…/cleaned.png"    an actual cleaned image
 *
 * 397 rows have the map. Only 116 have a single non-underscore key. The old
 * predicate therefore overstated image cleanup by 3.4x, and reported the
 * re-run backlog as 13 items when it is 125.
 *
 * Verified against all 497 production rows at 2026-09-01 19:55 UTC:
 *
 *     497  all items
 *      └─ 397  metadata      generated_color / the map exists
 *          └─ 176  described  detailed_description + generated_description
 *              │              + spatial_masks + spatial_points (all four move
 *              │              together — zero mismatches on any pairing)
 *              ├─ 116  cleaned image   a non-underscore key in the map
 *              │   └─ 115  cutout      generated_png_url
 *              └─  83  generated_type
 *
 * Note the containment: cleaned images are a SUBSET of described items, not
 * the other way round. 169 of the 397 metadata rows have no photos at all, so
 * that stage is not image-derived and must not be labelled as if it were.
 *
 * These counts move — the table is written live — so treat them as the shape
 * of the funnel rather than current figures. The shape is what this file
 * encodes; countContent() computes the numbers from the rows in hand.
 */

export type ContentKey = 'metadata' | 'described' | 'cleaned' | 'cutout' | 'none';

const filled = (v: unknown): boolean => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    const s = String(v).trim();
    return s !== '' && s !== '-' && s !== '[]' && s !== '{}' && s.toUpperCase() !== 'NULL';
};

const read = (d: any, ...keys: string[]): boolean => keys.some(k => filled(d?.[k]));

/**
 * The processed-media map, whichever shape it arrives in. Supabase sends a
 * JSON string; a row that has already been through normalizeInventoryData may
 * carry a parsed object.
 */
const readMap = (d: any): Record<string, unknown> => {
    const raw = d?.processedMediaUrls ?? d?.processed_media_urls;
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    const s = String(raw).trim();
    if (!s.startsWith('{')) return {};
    try { return JSON.parse(s) ?? {}; } catch { return {}; }
};

/**
 * An image entry is keyed by the source photo's URL. Testing for "no leading
 * underscore" was nearly enough — every metadata key uses one — but not quite:
 * BatchProcessingWizard also writes a bare `videoGen` key into the same map,
 * which is not an image and no underscore marks it. No row carries one today,
 * so this is closing the gap before it opens rather than fixing a live count.
 */
const isImageKey = (k: string): boolean => k.charAt(0) !== '_' && /^https?:\/\//i.test(k);

/**
 * A real cleaned image exists. The underscore prefix is most of the distinction:
 * every metadata entry uses it, and every image entry is keyed by the source
 * photo's URL. Counting keys without checking the prefix is the bug this file
 * was corrected for.
 */
export const hasCleanedImage = (d: any): boolean => {
    const map = readMap(d);
    return Object.keys(map).some(k => isImageKey(k) && filled(map[k]));
};

/**
 * The pipeline ran and left metadata — colour, type, pixel map. Deliberately
 * NOT called "enrichment" or "cleanup": 169 of these rows have no photos, so
 * this stage is derived from text, not imagery.
 */
export const hasMetadata = (d: any): boolean =>
    read(d, 'generatedColor', 'generated_color', 'generatedType', 'generated_type')
    || Object.keys(readMap(d)).length > 0;

/**
 * Written up and analysed. All four of detailed_description,
 * generated_description, spatial_masks and spatial_points move together with
 * zero mismatches, so any one of them tests the stage — they are one pass
 * leaving four artifacts, not four independent fields.
 */
export const hasDescription = (d: any): boolean =>
    read(d, 'detailedDescription', 'detailed_description',
            'generatedDescription', 'generated_description',
            'spatialMasks', 'spatial_masks', 'spatialPoints', 'spatial_points');

/** A transparent cutout was rendered. */
export const hasCutout = (d: any): boolean =>
    read(d, 'generatedPngUrl', 'generated_png_url');

/** Any AI output at all. The metadata stage is the outermost, so it is the test. */
export const hasAnyContent = (d: any): boolean => hasMetadata(d) || hasDescription(d);

export const CONTENT_FILTERS: { key: ContentKey; label: string; hint: string }[] = [
    { key: 'metadata',  label: 'Metadata',  hint: 'Colour and type extracted — text-derived, no photo needed' },
    { key: 'described', label: 'Described', hint: 'Written up: descriptions, masks and points' },
    { key: 'cleaned',   label: 'Cleaned',   hint: 'A background-removed image exists' },
    { key: 'cutout',    label: 'Cutout',    hint: 'Transparent PNG rendered' },
    { key: 'none',      label: 'No AI',     hint: 'Never processed' },
];

export const matchesContentKey = (d: any, key: ContentKey): boolean => {
    switch (key) {
        case 'metadata':  return hasMetadata(d);
        case 'described': return hasDescription(d);
        case 'cleaned':   return hasCleanedImage(d);
        case 'cutout':    return hasCutout(d);
        case 'none':      return !hasAnyContent(d);
        // Unrecognised key. Returning true here would make a stale selection
        // match every row — the keys changed when this file was corrected, and
        // the selection persists in sessionStorage across that change.
        default:          return false;
    }
};

const KNOWN = new Set<string>(CONTENT_FILTERS.map(f => f.key));

/** Selected keys OR together — an unselected filter constrains nothing. */
export const rowMatchesContent = (d: any, selected: string[] | undefined): boolean => {
    if (!selected || selected.length === 0) return true;
    // Drop keys this build does not know before deciding. A session holding
    // only retired keys must read as "no filter", not as "match nothing" —
    // otherwise the list comes up empty with every chip visibly off.
    const live = selected.filter(k => KNOWN.has(k));
    if (live.length === 0) return true;
    return live.some(k => matchesContentKey(d, k as ContentKey));
};

/** Live counts for the chips, so the distribution is visible while choosing. */
export const countContent = (rows: any[]): Record<ContentKey, number> => {
    const out: Record<ContentKey, number> = { metadata: 0, described: 0, cleaned: 0, cutout: 0, none: 0 };
    for (const row of rows) {
        const d = row?.data ?? row;
        if (hasAnyContent(d)) {
            if (hasMetadata(d)) out.metadata++;
            if (hasDescription(d)) out.described++;
            if (hasCleanedImage(d)) out.cleaned++;
            if (hasCutout(d)) out.cutout++;
        } else {
            out.none++;
        }
    }
    return out;
};

/**
 * Items with photos that have never had one cleaned — the actual re-run
 * backlog for the image pipeline. Separated out because the intuitive test
 * ("no AI content") is wrong by an order of magnitude here: most unenriched
 * items simply have no photograph to work from.
 */
export const needsImageCleanup = (d: any): boolean =>
    filled(d?.mediaUrls ?? d?.media_urls) && !hasCleanedImage(d);
