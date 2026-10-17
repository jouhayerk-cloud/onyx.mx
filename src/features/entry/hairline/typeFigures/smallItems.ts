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

export const SMALL_ITEM_FIGURE_IDS: readonly string[] = [
    'chess-set',
    'candleholder',
    'coaster',
    'wine-stopper',
] as const;

export type SmallItemId = (typeof SMALL_ITEM_FIGURE_IDS)[number];

export const DEFAULTS: Record<SmallItemId, Dims> = {
    'chess-set':    { w: 45, h: 5,   d: 45 },
    'candleholder': { w: 10, h: 14,  d: 10 },
    'coaster':      { w: 10, h: 1.2, d: 10 },
    'wine-stopper': { w: 4,  h: 9,   d: 4 },
};

function solidParts(s: { body: string; crease: string }): FigurePart[] {
    return [
        { d: s.body, kind: 'plate' },
        { d: s.crease, kind: 'crease' },
    ];
}

/**
 * B11 chess-set: flat board prism with 8x8 grid creases and playing square field.
 */
function buildChessSet(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const board = prism(cam, 0, 0, 0, w, d, h, 0.4);

    const borderX = Math.max(1.5, w * 0.08);
    const borderY = Math.max(1.5, d * 0.08);
    const gridW = w - 2 * borderX;
    const gridD = d - 2 * borderY;

    // Inset playing field
    const fieldPts: P2[] = [
        proj(cam, borderX, borderY, h),
        proj(cam, borderX + gridW, borderY, h),
        proj(cam, borderX + gridW, borderY + gridD, h),
        proj(cam, borderX, borderY + gridD, h),
    ];
    const fieldFace = pathOf(fieldPts, true);

    // 8x8 grid lines (7 internal creases in each axis)
    const gridCreases: FigurePart[] = [];
    for (let i = 1; i < 8; i++) {
        const u = i / 8;
        const gx = borderX + u * gridW;
        const gy = borderY + u * gridD;
        const lineX = pathOf([proj(cam, gx, borderY, h), proj(cam, gx, borderY + gridD, h)], false);
        const lineY = pathOf([proj(cam, borderX, gy, h), proj(cam, borderX + gridW, gy, h)], false);
        gridCreases.push({ d: lineX, kind: 'crease' });
        gridCreases.push({ d: lineY, kind: 'crease' });
    }

    // Bright accent: king piece marker on e1
    const kx = borderX + gridW * 0.56;
    const ky = borderY + gridD * 0.12;
    const [skx, sky] = proj(cam, kx, ky, h);
    const bright = pathOf([
        [skx - 1.4, sky],
        [skx, sky - 1.4],
        [skx + 1.4, sky],
        [skx, sky + 1.4],
    ]);

    return [
        ...solidParts(board),
        { d: fieldFace, kind: 'face' },
        ...gridCreases,
        { d: bright, kind: 'bright' },
    ];
}

/**
 * B12 candleholder: short cylinder with recessed cup (bowl) cut into top. Open top: yes.
 */
function buildCandleholder(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const r = Math.min(w, d) / 2;

    const body = prism(cam, cx - r, cy - r, 0, 2 * r, 2 * r, h, r);

    // Base ring crease at z = 0.12 * h
    const basePts = ring(cx - r * 0.98, cy - r * 0.98, r * 1.96, r * 1.96, r * 0.98, 8)
        .map(([x, y]) => proj(cam, x, y, h * 0.12));
    const baseCrease = pathOf(basePts);

    // Recessed candle cup: depth 0.3 * h -> floor at 0.70 * h
    const cupR = r * 0.65;
    const cupOpeningPts = ring(cx - cupR, cy - cupR, cupR * 2, cupR * 2, cupR, 8)
        .map(([x, y]) => proj(cam, x, y, h));
    const cupSlot = pathOf(cupOpeningPts);

    const floorZ = h * 0.70;
    const floorPts = ring(cx - cupR * 0.85, cy - cupR * 0.85, cupR * 1.7, cupR * 1.7, cupR * 0.85, 8)
        .map(([x, y]) => proj(cam, x, y, floorZ));
    const floorCrease = pathOf(floorPts);

    // Candle flame / wick bright glint mark
    const [fx, fy] = proj(cam, cx, cy, h * 0.88);
    const bright = pathOf([
        [fx - 1.2, fy],
        [fx, fy - 1.8],
        [fx + 1.2, fy],
        [fx, fy + 1.8],
    ]);

    return [
        ...solidParts(body),
        { d: baseCrease, kind: 'crease' },
        { d: cupSlot, kind: 'slot' },
        { d: floorCrease, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * B13 coaster: flat stone disc with concentric bevel rings.
 */
function buildCoaster(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const r = Math.min(w, d) / 2;

    const disc = prism(cam, cx - r, cy - r, 0, 2 * r, 2 * r, h, r);

    // Concentric ring creases on top face
    const r1 = r * 0.78;
    const ring1Pts = ring(cx - r1, cy - r1, 2 * r1, 2 * r1, r1, 8)
        .map(([x, y]) => proj(cam, x, y, h));
    const ring1Crease = pathOf(ring1Pts);

    const r2 = r * 0.45;
    const ring2Pts = ring(cx - r2, cy - r2, 2 * r2, 2 * r2, r2, 8)
        .map(([x, y]) => proj(cam, x, y, h));
    const ring2Crease = pathOf(ring2Pts);

    // Natural stone veining crease across surface
    const veinPts: P2[] = [
        proj(cam, cx - r * 0.65, cy - r * 0.35, h),
        proj(cam, cx - r * 0.15, cy - r * 0.05, h),
        proj(cam, cx + r * 0.25, cy + r * 0.30, h),
        proj(cam, cx + r * 0.60, cy + r * 0.50, h),
    ];
    const veinCrease = pathOf(veinPts, false);

    // Rim glint bright mark
    const [gx, gy] = proj(cam, cx + r * 0.55, cy + r * 0.55, h);
    const bright = pathOf([
        [gx - 1.2, gy],
        [gx, gy - 1.2],
        [gx + 1.2, gy],
        [gx, gy + 1.2],
    ]);

    return [
        ...solidParts(disc),
        { d: ring1Crease, kind: 'crease' },
        { d: ring2Crease, kind: 'crease' },
        { d: veinCrease, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * B14 wine-stopper: knob on short stem with flared base.
 */
function buildWineStopper(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Base flange disc at z = 0 to 0.16 * h
    const baseR = Math.min(w, d) * 0.40;
    const baseH = h * 0.16;
    const baseDisc = prism(cam, cx - baseR, cy - baseR, 0, 2 * baseR, 2 * baseR, baseH, baseR);

    // Stem cylinder from baseH to 0.55 * h
    const stemR = Math.min(w, d) * 0.22;
    const stemTop = h * 0.55;
    const stem = prism(cam, cx - stemR, cy - stemR, baseH, 2 * stemR, 2 * stemR, stemTop - baseH, stemR);

    // Collar ring at 0.55 * h to 0.62 * h
    const collarR = Math.min(w, d) * 0.32;
    const collarH = h * 0.07;
    const collar = prism(cam, cx - collarR, cy - collarR, stemTop, 2 * collarR, 2 * collarR, collarH, collarR);

    // Spherical knob at 0.62 * h to h
    const knobBot = stemTop + collarH;
    const knobH = h - knobBot;
    const knobR = Math.min(w, d, knobH) / 2;
    const knobCenterZ = knobBot + knobR;

    const [scx, scy] = proj(cam, cx, cy, knobCenterZ);
    const sr = cam.S * knobR;
    const circlePts: P2[] = [];
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        circlePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }
    const knobBody = pathOf(hull(circlePts));

    const eqPts: P2[] = [];
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        eqPts.push(proj(cam, cx + knobR * Math.cos(a), cy + knobR * Math.sin(a), knobCenterZ));
    }
    const knobEquator = pathOf(eqPts);

    const [ax, ay] = proj(cam, cx - knobR * 0.35, cy + knobR * 0.35, knobCenterZ + knobR * 0.45);
    const bright = pathOf([
        [ax - 1.2, ay],
        [ax, ay - 1.2],
        [ax + 1.2, ay],
        [ax, ay + 1.2],
    ]);

    return [
        ...solidParts(baseDisc),
        ...solidParts(stem),
        ...solidParts(collar),
        { d: knobBody, kind: 'plate' },
        { d: knobEquator, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for canonical small-item Types:
 * 'chess-set' | 'candleholder' | 'coaster' | 'wine-stopper'.
 * Parts are ordered back-to-front. Returns null for any unrecognized id.
 */
export function buildSmallItemFigure(
    id: string,
    rawDims: Dims | null,
    holes?: number,
    variant?: string | null,
): FigurePart[] | null {
    void holes;
    if (!id || !SMALL_ITEM_FIGURE_IDS.includes(id as SmallItemId)) return null;
    const opt = resolveVariant(id, variant);
    void opt;

    const fallback = DEFAULTS[id as SmallItemId];
    const dims = normalizeDims(rawDims, fallback);
    const cam = centeredCam(dims);

    switch (id) {
        case 'chess-set':
            return buildChessSet(cam, dims);
        case 'candleholder':
            return buildCandleholder(cam, dims);
        case 'coaster':
            return buildCoaster(cam, dims);
        case 'wine-stopper':
            return buildWineStopper(cam, dims);
        default:
            return null;
    }
}
