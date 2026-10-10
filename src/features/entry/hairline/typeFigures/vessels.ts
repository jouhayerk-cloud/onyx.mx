import type { Dims, FigurePart } from '../types';
import { normalizeDims, centeredCam } from '../types';
import {
    type Cam,
    type P2,
    proj,
    ring,
    hull,
    pathOf,
    prism,
    discY,
} from '../../../welcome/hairline/engine';

/** Canonical Type IDs handled by this vessel figure module. */
export const VESSEL_FIGURE_IDS: readonly string[] = [
    'bowl',
    'canoe',
    'plate',
    'basin',
] as const;

/**
 * Sensible default dimensions per vessel Type in cm (median inventory dimensions).
 * Scaled by normalizeDims so the longest side is FIGURE_SIZE (30 world units).
 */
export const DEFAULTS: Record<string, Dims> = {
    'bowl':  { w: 50, h: 36, d: 50 },
    'canoe': { w: 70, h: 10, d: 23 },
    'plate': { w: 55, h: 3,  d: 55 },
    'basin': { w: 42, h: 14, d: 42 },
};

// ── geometric helpers ────────────────────────────────────────────────────────

/**
 * An elongated ring tapering to sharp pointed ends along the x-axis.
 * Creates the tapered prow and stern contour of a carved stone canoe vessel.
 */
function pointedRing(x0: number, y0: number, len: number, wid: number, steps = 14): P2[] {
    const yMid = y0 + wid / 2;
    const pts: P2[] = [];
    // Upper arc: from left prow tip (x0, yMid) to right prow tip (x0 + len, yMid)
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = x0 + u * len;
        const y = yMid + (wid / 2) * Math.sin(u * Math.PI);
        pts.push([x, y]);
    }
    // Lower arc: from right prow tip back to left prow tip
    for (let i = steps - 1; i >= 1; i--) {
        const u = i / steps;
        const x = x0 + u * len;
        const y = yMid - (wid / 2) * Math.sin(u * Math.PI);
        pts.push([x, y]);
    }
    return pts;
}

// ── vessel builders (back to front, 1 bright mark, <= 14 paths) ─────────────

/**
 * Wide bowl (~50 cm wide, 36 cm tall):
 * Hull of a small bottom ring and a large top ring, visible inner rim crease.
 */
function buildBowl(cam: Cam, dims: Dims): FigurePart[] {
    const bw = dims.w * 0.48;
    const bd = dims.d * 0.48;
    const bx0 = (dims.w - bw) / 2;
    const by0 = (dims.d - bd) / 2;
    const br = Math.min(bw, bd) / 2;
    const botRing = ring(bx0, by0, bw, bd, br, 8);
    const botPts = botRing.map(([x, y]) => proj(cam, x, y, 0));

    const tr = Math.min(dims.w, dims.d) / 2;
    const topRing = ring(0, 0, dims.w, dims.d, tr, 8);
    const topPts = topRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const iw = dims.w * 0.82;
    const id = dims.d * 0.82;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const ir = Math.min(iw, id) / 2;
    const innerRing = ring(ix0, iy0, iw, id, ir, 8);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const bright = discY(cam, dims.w / 2, dims.d, dims.h - 0.6, 0.6, 10);

    return [
        { d: pathOf(hull([...botPts, ...topPts])), kind: 'plate' },
        { d: pathOf(topPts), kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Canoe shaped vessel (~70 cm long, 10 cm tall, 23 cm wide):
 * Hull of an elongated ring tapering to pointed ends at both prows, inner rim crease.
 */
function buildCanoe(cam: Cam, dims: Dims): FigurePart[] {
    const bw = dims.w * 0.72;
    const bd = dims.d * 0.48;
    const bx0 = (dims.w - bw) / 2;
    const by0 = (dims.d - bd) / 2;
    const botRing = pointedRing(bx0, by0, bw, bd, 14);
    const botPts = botRing.map(([x, y]) => proj(cam, x, y, 0));

    const topRing = pointedRing(0, 0, dims.w, dims.d, 14);
    const topPts = topRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const iw = dims.w * 0.88;
    const id = dims.d * 0.64;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const innerRing = pointedRing(ix0, iy0, iw, id, 14);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, dims.h));

    // Accent glint mark at the right prow tip
    const [px, py] = proj(cam, dims.w - 0.6, dims.d / 2, dims.h);
    const bright = pathOf([
        [px - 1.6, py],
        [px, py - 1.4],
        [px + 1.6, py],
        [px, py + 1.4],
    ]);

    return [
        { d: pathOf(hull([...botPts, ...topPts])), kind: 'plate' },
        { d: pathOf(topPts), kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Plate or charger (~55 cm across, almost flat):
 * Very low round prism with an inner ring crease.
 */
function buildPlate(cam: Cam, dims: Dims): FigurePart[] {
    const r = Math.min(dims.w, dims.d) / 2;
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, dims.h, r);

    const iw = dims.w * 0.74;
    const id = dims.d * 0.74;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const ir = Math.min(iw, id) / 2;
    const innerRing = ring(ix0, iy0, iw, id, ir, 8);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const bright = discY(cam, dims.w / 2, dims.d, dims.h - 0.4, 0.5, 10);

    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Stone basin or sink bowl (~42 cm wide, 14 cm tall, 42 cm deep):
 * Wide short cylinder with thick stone rim, shallow hollow, and central round drain mark.
 */
function buildBasin(cam: Cam, dims: Dims): FigurePart[] {
    const r = Math.min(dims.w, dims.d) / 2;
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, dims.h, r);

    // Thick stone rim opening at top
    const iw = dims.w * 0.76;
    const id = dims.d * 0.76;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const ir = Math.min(iw, id) / 2;
    const innerTop = ring(ix0, iy0, iw, id, ir, 8).map(([x, y]) => proj(cam, x, y, dims.h));

    // Shallow hollow interior floor
    const floorZ = dims.h * 0.85;
    const hw = dims.w * 0.52;
    const hd = dims.d * 0.52;
    const hx0 = (dims.w - hw) / 2;
    const hy0 = (dims.d - hd) / 2;
    const hr = Math.min(hw, hd) / 2;
    const hollowFloor = ring(hx0, hy0, hw, hd, hr, 8).map(([x, y]) => proj(cam, x, y, floorZ));

    // Round drain mark as the bright accent
    const cx = dims.w / 2;
    const cy = dims.d / 2;
    const drainR = Math.max(0.8, dims.w * 0.045);
    const drainPts: P2[] = [];
    const drainSteps = 12;
    for (let i = 0; i < drainSteps; i++) {
        const a = (i / drainSteps) * Math.PI * 2;
        drainPts.push(proj(cam, cx + drainR * Math.cos(a), cy + drainR * Math.sin(a), floorZ));
    }

    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: pathOf(innerTop), kind: 'crease' },
        { d: pathOf(hollowFloor), kind: 'crease' },
        { d: pathOf(drainPts), kind: 'bright' },
    ];
}

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for canonical vessel Types:
 * 'bowl' | 'canoe' | 'plate' | 'basin'.
 * Parts are ordered back-to-front. Returns null for any unrecognized id.
 */
export function buildVesselFigure(
    id: string,
    rawDims: Dims | null,
    holes?: number,
): FigurePart[] | null {
    void holes;
    const fallback = DEFAULTS[id];
    if (!fallback) return null;
    const dims = normalizeDims(rawDims, fallback);
    const cam = centeredCam(dims);

    switch (id) {
        case 'bowl':
            return buildBowl(cam, dims);
        case 'canoe':
            return buildCanoe(cam, dims);
        case 'plate':
            return buildPlate(cam, dims);
        case 'basin':
            return buildBasin(cam, dims);
        default:
            return null;
    }
}
