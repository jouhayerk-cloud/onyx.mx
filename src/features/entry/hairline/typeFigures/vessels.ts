import type { Dims, FigurePart } from '../types';
import { normalizeDims, centeredCam } from '../types';
import { resolveVariant } from '../variantOptions';
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
    'bowl':  { w: 36, h: 15, d: 24 },
    'canoe': { w: 100, h: 10, d: 23 },
    'plate': { w: 55, h: 3.5, d: 55 },
    'basin': { w: 42, h: 14, d: 42 },
};

/** Option-specific fallback dimensions when rawDims is null. */
const BOWL_FALLBACKS: Record<string, Dims> = {
    'mini':   { w: 12, h: 10, d: 12 },
    'small':  { w: 25, h: 12, d: 20 },
    'medium': { w: 36, h: 15, d: 24 },
    'large':  { w: 48, h: 18, d: 32 },
};

const CANOE_FALLBACKS: Record<string, Dims> = {
    'small':  { w: 70,  h: 9,  d: 20 },
    'medium': { w: 100, h: 10, d: 23 },
    'large':  { w: 140, h: 11, d: 26 },
};

const PLATE_FALLBACKS: Record<string, Dims> = {
    'small':  { w: 28, h: 2.5, d: 28 },
    'medium': { w: 40, h: 3.0, d: 40 },
    'large':  { w: 55, h: 3.5, d: 55 },
};

// ── vessel builders (back to front, 1 bright mark, <= 14 paths) ─────────────

/**
 * Bowls with size variants (mini, small, medium, large):
 * - Mini: small tall cup-like bowl (~12 cm wide), deeper and rounder, subtle 4-wave rim.
 * - Small: rounder bowl (~25 cm wide), moderately deep, 5-wave rim.
 * - Medium: wide shallow bowl (~36 cm wide, 15 cm tall, 24 cm deep), organic 6-wave rim.
 * - Large: wide platter bowl (~48 cm wide), shallow base, dramatic 7-wave rim.
 */
function buildBowl(cam: Cam, dims: Dims, size: string): FigurePart[] {
    const cx = dims.w / 2;
    const cy = dims.d / 2;

    // Proportions and silhouette parameters per size variant
    let baseRatio = 0.46;
    let waveAmp = 0.05;
    let waveCount = 6;
    let innerRatio = 0.82;
    let floorDepth = 0.25;

    if (size === 'mini') {
        baseRatio = 0.58;
        waveAmp = 0.02;
        waveCount = 4;
        innerRatio = 0.86;
        floorDepth = 0.45;
    } else if (size === 'small') {
        baseRatio = 0.52;
        waveAmp = 0.035;
        waveCount = 5;
        innerRatio = 0.84;
        floorDepth = 0.35;
    } else if (size === 'large') {
        baseRatio = 0.40;
        waveAmp = 0.065;
        waveCount = 7;
        innerRatio = 0.80;
        floorDepth = 0.18;
    }

    // Base ring at z = 0
    const bw = dims.w * baseRatio;
    const bd = dims.d * baseRatio;
    const bx0 = (dims.w - bw) / 2;
    const by0 = (dims.d - bd) / 2;
    const br = Math.min(bw, bd) / 2;
    const botRing = ring(bx0, by0, bw, bd, br, 8);
    const botPts = botRing.map(([x, y]) => proj(cam, x, y, 0));

    // Wavy organic top rim at z = dims.h
    const steps = 28;
    const topPts: P2[] = [];
    const rxMax = (dims.w / 2) / (1 + waveAmp);
    const ryMax = (dims.d / 2) / (1 + waveAmp);
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wave = 1 + waveAmp * Math.sin(waveCount * a);
        const x = cx + rxMax * wave * Math.cos(a);
        const y = cy + ryMax * wave * Math.sin(a);
        topPts.push(proj(cam, x, y, dims.h));
    }

    // Inner rim crease (inset opening)
    const innerPts: P2[] = [];
    const irxMax = rxMax * innerRatio;
    const iryMax = ryMax * innerRatio;
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wave = 1 + waveAmp * Math.sin(waveCount * a);
        const x = cx + irxMax * wave * Math.cos(a);
        const y = cy + iryMax * wave * Math.sin(a);
        innerPts.push(proj(cam, x, y, dims.h));
    }

    // Interior floor crease at floorDepth * dims.h
    const floorZ = dims.h * floorDepth;
    const fw = bw * 0.90;
    const fd = bd * 0.90;
    const fx0 = (dims.w - fw) / 2;
    const fy0 = (dims.d - fd) / 2;
    const fr = Math.min(fw, fd) / 2;
    const floorPts = ring(fx0, fy0, fw, fd, fr, 8).map(([x, y]) => proj(cam, x, y, floorZ));

    // Bright accent mark on the inside rim
    const bright = discY(cam, dims.w / 2, dims.d * 0.85, dims.h - 0.6, 0.6, 8);

    return [
        { d: pathOf(hull([...botPts, ...topPts])), kind: 'plate' },
        { d: pathOf(topPts), kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: pathOf(floorPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Canoe shaped vessel with size variants (large, medium, small):
 * - Long shallow boat shape with pointed ends (prow and stern).
 * - Median ~100 x 23 x 10 cm, large ~140 cm, small ~70 cm.
 * - Pointed boat silhouette, inner hollow trough crease, floor crease,
 *   wavy exterior stone banding with wave frequency scaling by size, and a bright mark.
 */
function buildCanoe(cam: Cam, dims: Dims, size: string): FigurePart[] {
    const cy = dims.d / 2;

    let waveBands = 4;
    let insetRatio = 0.12;
    let floorRatio = 0.78;

    if (size === 'small') {
        waveBands = 2;
        insetRatio = 0.14;
        floorRatio = 0.72;
    } else if (size === 'large') {
        waveBands = 6;
        insetRatio = 0.10;
        floorRatio = 0.84;
    }

    // Pointed top rim outline (boat shape with sharp pointed prow and stern)
    const rimSteps = 28;
    const topPts3d: [number, number, number][] = [];
    const ryTop = dims.d / 2;

    for (let i = 0; i <= rimSteps; i++) {
        const u = i / rimSteps;
        const x = u * dims.w;
        const profile = Math.sin(Math.PI * u);
        const y = cy + ryTop * profile;
        topPts3d.push([x, y, dims.h]);
    }
    for (let i = rimSteps; i >= 0; i--) {
        const u = i / rimSteps;
        const x = u * dims.w;
        const profile = Math.sin(Math.PI * u);
        const y = cy - ryTop * profile;
        topPts3d.push([x, y, dims.h]);
    }
    const topPts = topPts3d.map(([x, y, z]) => proj(cam, x, y, z));

    // Base ring (smaller pointed boat footprint at z = 0)
    const baseScaleX = 0.88;
    const baseScaleY = 0.80;
    const bx0 = (dims.w * (1 - baseScaleX)) / 2;
    const bw = dims.w * baseScaleX;
    const ryBot = (dims.d / 2) * baseScaleY;
    const botPts3d: [number, number, number][] = [];

    for (let i = 0; i <= rimSteps; i++) {
        const u = i / rimSteps;
        const x = bx0 + u * bw;
        const profile = Math.sin(Math.PI * u);
        const y = cy + ryBot * profile;
        botPts3d.push([x, y, 0]);
    }
    for (let i = rimSteps; i >= 0; i--) {
        const u = i / rimSteps;
        const x = bx0 + u * bw;
        const profile = Math.sin(Math.PI * u);
        const y = cy - ryBot * profile;
        botPts3d.push([x, y, 0]);
    }
    const botPts = botPts3d.map(([x, y, z]) => proj(cam, x, y, z));

    // Silhouette body
    const bodyPath = pathOf(hull([...botPts, ...topPts]));
    const topCrease = pathOf(topPts);

    // Inner rim crease (carved hollow opening at z = dims.h)
    const innerPts3d: [number, number, number][] = [];
    const ix0 = dims.w * insetRatio;
    const iw = dims.w * (1 - 2 * insetRatio);
    const ryInner = ryTop * (1 - 2 * insetRatio);
    for (let i = 0; i <= rimSteps; i++) {
        const u = i / rimSteps;
        const x = ix0 + u * iw;
        const profile = Math.sin(Math.PI * u);
        innerPts3d.push([x, cy + ryInner * profile, dims.h]);
    }
    for (let i = rimSteps; i >= 0; i--) {
        const u = i / rimSteps;
        const x = ix0 + u * iw;
        const profile = Math.sin(Math.PI * u);
        innerPts3d.push([x, cy - ryInner * profile, dims.h]);
    }
    const innerCrease = pathOf(innerPts3d.map(([x, y, z]) => proj(cam, x, y, z)));

    // Floor crease inside the shallow trough at z = dims.h * 0.75
    const floorZ = dims.h * 0.75;
    const fx0 = (dims.w * (1 - floorRatio)) / 2;
    const fw = dims.w * floorRatio;
    const ryFloor = ryTop * 0.42;
    const floorPts3d: [number, number, number][] = [];
    for (let i = 0; i <= rimSteps; i++) {
        const u = i / rimSteps;
        const x = fx0 + u * fw;
        const profile = Math.sin(Math.PI * u);
        floorPts3d.push([x, cy + ryFloor * profile, floorZ]);
    }
    for (let i = rimSteps; i >= 0; i--) {
        const u = i / rimSteps;
        const x = fx0 + u * fw;
        const profile = Math.sin(Math.PI * u);
        floorPts3d.push([x, cy - ryFloor * profile, floorZ]);
    }
    const floorCrease = pathOf(floorPts3d.map(([x, y, z]) => proj(cam, x, y, z)));

    // Wavy horizontal stone band crease along the outside wall
    const wavyPts: P2[] = [];
    const waveSteps = 24;
    const zMid = dims.h * 0.45;
    const amp = dims.h * 0.10;
    const xStart = dims.w * 0.15;
    const xEnd = dims.w * 0.85;
    for (let i = 0; i <= waveSteps; i++) {
        const u = i / waveSteps;
        const x = xStart + u * (xEnd - xStart);
        const normU = (x / dims.w);
        const y = cy + (ryTop * 0.90) * Math.sin(Math.PI * normU);
        const z = zMid + amp * Math.sin(u * Math.PI * waveBands);
        wavyPts.push(proj(cam, x, y, z));
    }
    const wavyCrease = pathOf(wavyPts, false);

    // Tiny bright mark inside the hollow
    const [gx, gy] = proj(cam, dims.w * 0.54, cy, floorZ);
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
 * Plate or charger with size variants (large, medium, small):
 * - Very flat round disc (~55 cm wide for large).
 * - Small: compact rim flange and delicate cavetto ring.
 * - Medium: classic dinner plate with distinct marli groove and center well.
 * - Large: broad service charger with stepped rim levels.
 */
function buildPlate(cam: Cam, dims: Dims, size: string): FigurePart[] {
    const r = Math.min(dims.w, dims.d) / 2;
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, dims.h, r);

    let rimRatio = 0.70;
    let wellRatio = 0.45;
    if (size === 'small') {
        rimRatio = 0.82;
        wellRatio = 0.55;
    } else if (size === 'medium') {
        rimRatio = 0.76;
        wellRatio = 0.50;
    }

    // Outer rim crease (cavetto)
    const rw = dims.w * rimRatio;
    const rd = dims.d * rimRatio;
    const rx0 = (dims.w - rw) / 2;
    const ry0 = (dims.d - rd) / 2;
    const rr = Math.min(rw, rd) / 2;
    const rimRing = ring(rx0, ry0, rw, rd, rr, 8);
    const rimPts = rimRing.map(([x, y]) => proj(cam, x, y, dims.h));

    // Center depression well crease
    const ww = dims.w * wellRatio;
    const wd = dims.d * wellRatio;
    const wx0 = (dims.w - ww) / 2;
    const wy0 = (dims.d - wd) / 2;
    const wr = Math.min(ww, wd) / 2;
    const wellRing = ring(wx0, wy0, ww, wd, wr, 8);
    const wellPts = wellRing.map(([x, y]) => proj(cam, x, y, dims.h));

    // Accent mark on rim
    const bright = discY(cam, dims.w / 2, dims.d * 0.92, dims.h - 0.3, 0.5, 8);

    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: pathOf(rimPts), kind: 'crease' },
        { d: pathOf(wellPts), kind: 'crease' },
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
    variant?: string | null,
): FigurePart[] | null {
    void holes;
    if (!VESSEL_FIGURE_IDS.includes(id)) return null;
    const opt = resolveVariant(id, variant);

    let fallback = DEFAULTS[id];
    if (id === 'bowl') {
        fallback = BOWL_FALLBACKS[opt ?? 'medium'] ?? DEFAULTS['bowl'];
    } else if (id === 'canoe') {
        fallback = CANOE_FALLBACKS[opt ?? 'medium'] ?? DEFAULTS['canoe'];
    } else if (id === 'plate') {
        fallback = PLATE_FALLBACKS[opt ?? 'large'] ?? DEFAULTS['plate'];
    }

    const dims = normalizeDims(rawDims, fallback);
    const cam = centeredCam(dims);

    switch (id) {
        case 'bowl':
            return buildBowl(cam, dims, opt ?? 'medium');
        case 'canoe':
            return buildCanoe(cam, dims, opt ?? 'medium');
        case 'plate':
            return buildPlate(cam, dims, opt ?? 'large');
        case 'basin':
            return buildBasin(cam, dims);
        default:
            return null;
    }
}
