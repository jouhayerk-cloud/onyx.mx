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
    'canoe': { w: 100, h: 10, d: 23 },
    'plate': { w: 55, h: 3,  d: 55 },
    'basin': { w: 42, h: 14, d: 42 },
};

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
 * Canoe shaped vessel (~100 cm long, 10 cm tall, 23 cm wide):
 * Long, low, shallow oval trough of pale translucent banded onyx.
 * Hull of two rounded stadium rings (r = d/2), top face inner stadium crease,
 * floor crease, wavy horizontal band crease, and a tiny bright glint inside the hollow.
 */
function buildCanoe(cam: Cam, dims: Dims): FigurePart[] {
    // Top ring: length w, width d, radius d / 2 (stadium footprint) at height h
    const tr = dims.d / 2;
    const topRing = ring(0, 0, dims.w, dims.d, tr, 8);
    const topPts = topRing.map(([x, y]) => proj(cam, x, y, dims.h));

    // Base ring: top ring is about 4% larger than base ring
    const bw = dims.w / 1.04;
    const bd = dims.d / 1.04;
    const bx0 = (dims.w - bw) / 2;
    const by0 = (dims.d - bd) / 2;
    const br = bd / 2;
    const botRing = ring(bx0, by0, bw, bd, br, 8);
    const botPts = botRing.map(([x, y]) => proj(cam, x, y, 0));

    // Silhouette body: hull of bottom and top rounded stadium rings
    const bodyPath = pathOf(hull([...botPts, ...topPts]));

    // Top rim crease
    const topCrease = pathOf(topPts);

    // Inner stadium ring crease on the top face (inset ~12% of d)
    const topInset = dims.d * 0.12;
    const iw = dims.w - 2 * topInset;
    const id = dims.d - 2 * topInset;
    const ir = id / 2;
    const innerRing = ring(topInset, topInset, iw, id, ir, 8);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, dims.h));
    const innerCrease = pathOf(innerPts);

    // Floor crease: smaller inner stadium ring inside the hollow
    const floorZ = dims.h * 0.85;
    const fw = dims.w * 0.78;
    const fd = dims.d * 0.42;
    const fx0 = (dims.w - fw) / 2;
    const fy0 = (dims.d - fd) / 2;
    const fr = fd / 2;
    const floorRing = ring(fx0, fy0, fw, fd, fr, 8);
    const floorPts = floorRing.map(([x, y]) => proj(cam, x, y, floorZ));
    const floorCrease = pathOf(floorPts);

    // Wavy band crease along the outside wall (soft horizontal onyx banding with gentle sine wave)
    const wavyPts: P2[] = [];
    const waveSteps = 28;
    const zMid = dims.h * 0.45;
    const amp = dims.h * 0.1;
    // Interpolate outside wall at zMid between base and top rings
    const tz = 0.45;
    const wMid = bw + tz * (dims.w - bw);
    const dMid = bd + tz * (dims.d - bd);
    const x0Mid = bx0 + tz * (0 - bx0);
    const y0Mid = by0 + tz * (0 - by0);
    const rMid = dMid / 2;
    const xStart = x0Mid + rMid * 0.25;
    const xEnd = x0Mid + wMid - rMid * 0.25;
    for (let i = 0; i <= waveSteps; i++) {
        const u = i / waveSteps;
        const x = xStart + u * (xEnd - xStart);
        let dy = rMid;
        if (x < x0Mid + rMid) {
            const dx = x - (x0Mid + rMid);
            dy = Math.sqrt(Math.max(0, rMid * rMid - dx * dx));
        } else if (x > x0Mid + wMid - rMid) {
            const dx = x - (x0Mid + wMid - rMid);
            dy = Math.sqrt(Math.max(0, rMid * rMid - dx * dx));
        }
        const y = y0Mid + rMid + dy;
        const z = zMid + amp * Math.sin(u * Math.PI * 4);
        wavyPts.push(proj(cam, x, y, z));
    }
    const wavyCrease = pathOf(wavyPts, false);

    // Tiny bright mark inside the hollow
    const [gx, gy] = proj(cam, dims.w * 0.54, dims.d * 0.5, floorZ);
    const bright = pathOf([
        [gx - 1.4, gy],
        [gx, gy - 1.2],
        [gx + 1.4, gy],
        [gx, gy + 1.2],
    ]);

    return [
        { d: bodyPath, kind: 'plate' },
        { d: topCrease, kind: 'crease' },
        { d: innerCrease, kind: 'crease' },
        { d: floorCrease, kind: 'crease' },
        { d: wavyCrease, kind: 'crease' },
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
