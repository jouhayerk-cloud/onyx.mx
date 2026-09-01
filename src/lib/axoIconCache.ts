import { generateAxonometricDataUrl, resolveAxoGeometry, resolveItemColor } from './axonometric';

/**
 * Process-wide cache for the axonometric card icons.
 *
 * Why this exists: generateAxonometricDataUrl allocates a 400x400 canvas
 * (640 KB of backing store) and returns a retained base64 PNG. The inventory grid
 * and gallery used to call it once per card, from a mount effect, with no
 * de-duplication — 500 rows meant 500 simultaneous canvases plus 500 *separately
 * decoded* bitmaps in the image cache, because every <img> had a unique src
 * string. That is the out-of-memory path.
 *
 * Two properties do the work here:
 *  1. The key is built from the RESOLVED geometry (8 shapes + a normalised W/H/D
 *     triple + the outline colour), not from the free-text shape/description the
 *     row carries. Hundreds of distinct descriptions collapse onto a handful of
 *     silhouettes.
 *  2. Identical inputs yield the identical data-URL *string*, so the browser
 *     decodes the bitmap once and shares it across every <img> that uses it.
 *
 * Deliberately NOT blob URLs: a blob URL has to be revoked to free its backing
 * store, and revoking on cache eviction would break every <img> still mounted
 * against that URL. Data URLs are collected with the string, which is the
 * behaviour a bounded cache actually wants.
 */

export interface AxoIconRequest {
    /** Stable identity for the rendered image — same key implies identical pixels. */
    key: string;
    w: number;
    h: number;
    d: number;
    shape: string;
    desc: string;
    color: string;
}

// Bounded so a long session with many distinct silhouettes cannot grow without
// limit. A 400px PNG of flat-shaded polygons is ~10-30 KB of base64, so the cap
// costs single-digit megabytes at worst.
const MAX_ENTRIES = 240;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/**
 * Derive the render inputs + cache key for an inventory row.
 * Pure and cheap; safe to call inside a render or useMemo.
 */
export function describeAxoIcon(item: any): AxoIconRequest {
    // Field fallbacks mirror the original WireframeIcon exactly — snake_case rows
    // come from Supabase, camelCase from normalizeInventoryData.
    // `||` not `??` on purpose: a stored 0 or '' must fall through to the other
    // casing, which is what the original WireframeIcon did.
    const w = parseFloat(item?.width_cm || item?.widthCm) || 40;
    const h = parseFloat(item?.height_cm || item?.heightCm) || 40;
    const d = parseFloat(item?.length_cm || item?.lengthCm) || parseFloat(item?.depth_cm || item?.depthCm) || w;

    const shape = item?.shape || '';
    const desc = item?.shortDescription || item?.description || '';
    const color = resolveItemColor(item || {});

    const g = resolveAxoGeometry(w, h, d, shape, desc);
    // Round the dimensions: sub-0.01cm differences cannot survive the projection
    // and would only fragment the cache.
    const dims = `${g.W.toFixed(2)}x${g.H.toFixed(2)}x${g.D.toFixed(2)}`;
    const key = `${g.geom}|${g.isMirror ? 'm' : ''}|${dims}|${color}`;

    return { key, w, h, d, shape, desc, color };
}

/** Synchronous cache read — lets a card paint its icon on first render with no flash. */
export function peekAxoIcon(key: string): string | null {
    return cache.get(key) ?? null;
}

/**
 * Resolve the icon for a request, generating it at most once per key even if
 * dozens of cards ask for the same silhouette in the same tick.
 */
export function getAxoIcon(req: AxoIconRequest): Promise<string> {
    const hit = cache.get(req.key);
    if (hit) return Promise.resolve(hit);

    const pending = inFlight.get(req.key);
    if (pending) return pending;

    const job = generateAxonometricDataUrl(req.w, req.h, req.d, req.shape, req.desc, req.color)
        .then(url => {
            inFlight.delete(req.key);
            if (url) {
                if (cache.size >= MAX_ENTRIES) {
                    // Map iterates in insertion order, so this drops the oldest entry.
                    // Insertion order rather than true LRU: the working set is bounded
                    // by the geometry vocabulary, so recency tracking would cost more
                    // than the occasional regeneration it saves.
                    const oldest = cache.keys().next().value;
                    if (oldest !== undefined) cache.delete(oldest);
                }
                cache.set(req.key, url);
            }
            return url;
        })
        .catch(err => {
            inFlight.delete(req.key);
            console.error('Axonometric icon generation failed', err);
            return '';
        });

    inFlight.set(req.key, job);
    return job;
}
