/**
 * The inventory colour map: every item's hex map (spatial_points pixel_map, the one the axo and the colour bar use)
 * binned into one hue x lightness grid, so items can be filtered by a colour range and ranked by colour similarity.
 *
 * Grid: HUE_BINS hue columns (red at 0) plus one NEUTRAL column for low-saturation cells (whites, grays, blacks),
 * by LIGHT_BINS lightness rows, lightest at the top. An item's histogram is the share of its stone cells in each grid
 * cell (background cells skipped, the same rule as the colour bar), so every histogram sums to 1.
 */
import { parseHexMapString } from './axonometric';
import { isHexMapBackground } from './canonicalColors';

export const HUE_BINS = 12;
export const NEUTRAL_COL = HUE_BINS;
export const COLS = HUE_BINS + 1;
export const LIGHT_BINS = 6;
export const CELLS = COLS * LIGHT_BINS;
/** Below this saturation a cell counts as neutral. */
const NEUTRAL_SAT = 0.12;
/** A range matches an item when at least this share of its hex map falls inside it. */
export const RANGE_MIN_SHARE = 0.1;

/** Inclusive column / row bounds of a selection on the grid. */
export type HexRange = { c0: number; c1: number; r0: number; r1: number };

function hsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}

export function cellOf(r: number, g: number, b: number): number {
    const [h, s, l] = hsl(r, g, b);
    const col = s < NEUTRAL_SAT ? NEUTRAL_COL : Math.floor(h * HUE_BINS) % HUE_BINS;
    const row = Math.min(LIGHT_BINS - 1, Math.floor((1 - l) * LIGHT_BINS));
    return row * COLS + col;
}

/** The share of each grid cell in a list of hex colours; null when nothing but background is left. */
export function histogramOf(hexes: readonly string[], rgbOut?: Float32Array): Float32Array | null {
    const hist = new Float32Array(CELLS);
    let n = 0;
    for (const h of hexes) {
        const m = /^#?([0-9a-f]{6})/i.exec(h.trim());
        if (!m) continue;
        const v = parseInt(m[1], 16);
        const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
        if (isHexMapBackground(r, g, b)) continue;
        const c = cellOf(r, g, b);
        hist[c]++;
        if (rgbOut) { rgbOut[c * 3] += r; rgbOut[c * 3 + 1] += g; rgbOut[c * 3 + 2] += b; }
        n++;
    }
    if (!n) return null;
    // rgbOut ends as each cell's mean colour, hist as each cell's share.
    if (rgbOut) for (let i = 0; i < CELLS; i++) if (hist[i]) for (let k = 0; k < 3; k++) rgbOut[i * 3 + k] /= hist[i];
    for (let i = 0; i < CELLS; i++) hist[i] /= n;
    return hist;
}

// shortcut: cached per row object, so an edited row (a new object from sync) is re-binned; fine for ~2k rows.
const cache = new WeakMap<object, Float32Array | null>();
const rgbCache = new WeakMap<object, Float32Array>();
/** `hexString` is the row's hex map (utils extractItemHexString), passed in so this module stays free of app imports. */
export function itemHistogram(data: any, hexString: (d: any) => string | undefined): Float32Array | null {
    if (!data || typeof data !== 'object') return null;
    if (cache.has(data)) return cache.get(data)!;
    const rgb = new Float32Array(CELLS * 3);
    const hist = histogramOf(parseHexMapString(hexString(data)), rgb);
    cache.set(data, hist);
    rgbCache.set(data, rgb);
    return hist;
}

export function inRange(cell: number, r: HexRange): boolean {
    const col = cell % COLS, row = Math.floor(cell / COLS);
    return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1;
}

export function rangeShare(hist: Float32Array | null, r: HexRange): number {
    if (!hist) return 0;
    let s = 0;
    for (let row = r.r0; row <= r.r1; row++)
        for (let col = r.c0; col <= r.c1; col++) s += hist[row * COLS + col];
    return s;
}

/** Histogram intersection, 0 (no shared colour) to 1 (the same colour mix). */
export function similarity(a: Float32Array | null, b: Float32Array | null): number {
    if (!a || !b) return 0;
    let s = 0;
    for (let i = 0; i < CELLS; i++) s += Math.min(a[i], b[i]);
    return s;
}

/** The display colour of a grid cell: the centre of its hue and lightness band. */
export function cellColor(cell: number): string {
    const col = cell % COLS, row = Math.floor(cell / COLS);
    const l = 1 - (row + 0.5) / LIGHT_BINS;
    const s = col === NEUTRAL_COL ? 0 : 0.55;
    const h = col === NEUTRAL_COL ? 0 : (col + 0.5) / HUE_BINS;
    return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * The whole inventory on the grid: per cell, how many items carry it (at least 2% of their map), its summed share
 * (its width in the spectrum bar) and the share-weighted mean of the real stone colours in it (centre colour when empty).
 */
export function inventoryColorMap(rows: readonly any[], hexString: (d: any) => string | undefined) {
    const counts = new Uint32Array(CELLS);
    const weight = new Float32Array(CELLS);
    const rgb = new Float64Array(CELLS * 3);
    for (const row of rows) {
        const d = row?.data || row;
        const hist = itemHistogram(d, hexString);
        if (!hist) continue;
        const mean = rgbCache.get(d)!;
        for (let i = 0; i < CELLS; i++) {
            const w = hist[i];
            if (!w) continue;
            if (w >= 0.02) counts[i]++;
            weight[i] += w;
            for (let k = 0; k < 3; k++) rgb[i * 3 + k] += mean[i * 3 + k] * w;
        }
    }
    const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
    const color = Array.from({ length: CELLS }, (_, i) => weight[i]
        ? '#' + hex2(rgb[i * 3] / weight[i]) + hex2(rgb[i * 3 + 1] / weight[i]) + hex2(rgb[i * 3 + 2] / weight[i])
        : cellColor(i));
    return { counts, weight, color };
}
