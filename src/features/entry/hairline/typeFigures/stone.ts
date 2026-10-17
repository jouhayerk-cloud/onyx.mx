/**
 * Hairline figure builders for stone canonical Types of the Add Entry selector.
 *
 * Each figure follows the hairline rules:
 * - Solids are the hull of rounded rings (silhouette plus one dim crease along the top).
 * - Plates are opaque and painted back-to-front.
 * - Exactly one part marked as 'bright' (tiny accent mark).
 * - Reads at 120 px wide; max ~14 paths per figure; builder under 90 lines.
 */
import type { Dims, FigurePart } from '../types';
import { normalizeDims, centeredCam } from '../types';
import { resolveVariant } from '../variantOptions';
import {
    proj,
    pathOf,
    hull,
    ring,
    prism,
    rectY,
    type Cam,
    type P2,
} from '../../../welcome/hairline/engine';

export const STONE_FIGURE_IDS = [
    'rock',
    'fountain',
    'fountain-set',
    'sculpture',
    'sculpture-set',
    'pillar',
    'ball',
    'bag',
    'boulder',
    'pebble-stone',
] as const;

export type StoneFigureId = (typeof STONE_FIGURE_IDS)[number];

/** Sensible default dimensions in cm per stone Type. */
export const DEFAULTS: Record<StoneFigureId, Dims> = {
    'rock':          { w: 42, h: 36, d: 38 },
    'fountain':      { w: 60, h: 75, d: 55 },
    'fountain-set':  { w: 60, h: 54, d: 60 },
    'sculpture':     { w: 40, h: 85, d: 40 },
    'sculpture-set': { w: 60, h: 54, d: 50 },
    'pillar':        { w: 30, h: 120, d: 30 },
    'ball':          { w: 6,  h: 6.5, d: 6 },
    'bag':           { w: 20, h: 60, d: 20 },
    'boulder':       { w: 42, h: 36, d: 38 },
    'pebble-stone':  { w: 20, h: 60, d: 20 },
};

/** Option-specific fallback dimensions when rawDims is null. */
const ROCK_FALLBACKS: Record<string, Dims> = {
    'boulder':   { w: 42, h: 36, d: 38 },
    'free-form': { w: 46, h: 30, d: 42 },
};

const FOUNTAIN_FALLBACKS: Record<string, Dims> = {
    'boulder':  { w: 60, h: 75,  d: 55 },
    'sphere':   { w: 50, h: 72,  d: 50 },
    's-shaped': { w: 45, h: 100, d: 40 },
};

const SCULPTURE_FALLBACKS: Record<string, Dims> = {
    'flame':   { w: 35, h: 90, d: 35 },
    'venus':   { w: 35, h: 95, d: 30 },
    'cactus':  { w: 50, h: 80, d: 35 },
    'default': { w: 40, h: 85, d: 40 },
};

const PILLAR_FALLBACKS: Record<string, Dims> = {
    'squared':  { w: 30, h: 120, d: 30 },
    'cylinder': { w: 30, h: 120, d: 30 },
};

const BALL_FALLBACKS: Record<string, Dims> = {
    'mini':  { w: 6, h: 6.5, d: 6 },
    'small': { w: 8, h: 8.5, d: 8 },
};

// ── geometric helpers ────────────────────────────────────────────────────────

/** A lofted solid between two rounded rings: hull silhouette plus top crease. */
function loft(cam: Cam, bRing: P2[], z0: number, tRing: P2[], z1: number): { body: string; crease: string } {
    const bottom = bRing.map(([x, y]) => proj(cam, x, y, z0));
    const top = tRing.map(([x, y]) => proj(cam, x, y, z1));
    return { body: pathOf(hull([...bottom, ...top])), crease: pathOf(top) };
}

/** Standard solid parts: opaque body plate followed by its top crease. */
function solidParts(s: { body: string; crease: string }, bodyKind: 'plate' | 'face' = 'plate'): FigurePart[] {
    return [
        { d: s.body, kind: bodyKind },
        { d: s.crease, kind: 'crease' },
    ];
}

// ── figure builders (under 90 lines each, back to front, 1 bright mark) ─────

/**
 * Rock boulder: heavy irregular faceted stone with planar facets,
 * facet ridges down visible faces, and a carved top hollow with water glint.
 */
function buildRockBoulder(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;

    const basePts: P2[] = [
        [0.12 * w, 0.10 * d],
        [0.55 * w, 0.05 * d],
        [0.92 * w, 0.16 * d],
        [0.98 * w, 0.55 * d],
        [0.86 * w, 0.94 * d],
        [0.42 * w, 0.98 * d],
        [0.06 * w, 0.76 * d],
        [0.02 * w, 0.35 * d],
    ];

    const midPts: [number, number, number][] = [
        [0.20 * w, 0.12 * d, 0.45 * h],
        [0.65 * w, 0.10 * d, 0.40 * h],
        [0.95 * w, 0.35 * d, 0.48 * h],
        [0.90 * w, 0.80 * d, 0.42 * h],
        [0.50 * w, 0.90 * d, 0.50 * h],
        [0.12 * w, 0.80 * d, 0.46 * h],
    ];

    const topFacet: [number, number, number][] = [
        [0.30 * w, 0.25 * d, 0.96 * h],
        [0.68 * w, 0.22 * d, 0.92 * h],
        [0.78 * w, 0.60 * d, 0.84 * h],
        [0.52 * w, 0.78 * d, 0.82 * h],
        [0.24 * w, 0.62 * d, 0.88 * h],
    ];

    const projBase = basePts.map(([x, y]) => proj(cam, x, y, 0));
    const projMid = midPts.map(([x, y, z]) => proj(cam, x, y, z));
    const projTop = topFacet.map(([x, y, z]) => proj(cam, x, y, z));

    const body = pathOf(hull([...projBase, ...projMid, ...projTop]));
    const topCrease = pathOf(projTop);

    // Facet ridges down the visible front faces
    const ridge1 = pathOf([projTop[2], projMid[3], projBase[4]], false);
    const ridge2 = pathOf([projTop[3], projMid[4], projBase[5]], false);

    // Carved hollow on top
    const hx = 0.50 * w;
    const hy = 0.50 * d;
    const hz = 0.87 * h;
    const hr = Math.min(w, d) * 0.12;
    const hollowPts = ring(hx - hr, hy - hr, 2 * hr, 2 * hr, hr, 6).map(([x, y]) => proj(cam, x, y, hz));
    const hollow = pathOf(hollowPts);

    // Bright water glint inside the hollow
    const glintPts = ring(hx - hr * 0.45, hy - hr * 0.45, hr * 0.9, hr * 0.9, hr * 0.45, 4).map(([x, y]) => proj(cam, x, y, hz));
    const glint = pathOf(glintPts);

    return [
        { d: body, kind: 'plate' },
        { d: topCrease, kind: 'crease' },
        { d: ridge1, kind: 'crease' },
        { d: ridge2, kind: 'crease' },
        { d: hollow, kind: 'slot' },
        { d: glint, kind: 'bright' },
    ];
}

/**
 * Rock free-form: a smoother organic stone mass with soft flowing contours
 * and natural curvilinear layering.
 */
function buildRockFreeForm(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Organic wavy base ring at z = 0
    const basePts: P2[] = [];
    const steps = 16;
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rad = 1 + 0.12 * Math.sin(2 * a) + 0.08 * Math.cos(3 * a);
        const rx = (w * 0.44 / 1.2) * rad;
        const ry = (d * 0.44 / 1.2) * rad;
        basePts.push(proj(cam, cx + rx * Math.cos(a), cy + ry * Math.sin(a), 0));
    }

    // Mid belly ring at z = 0.45 * h (wider bulging organic cross-section)
    const midPts: P2[] = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rad = 1 + 0.14 * Math.sin(2 * a + 0.6) - 0.08 * Math.cos(3 * a);
        const rx = (w * 0.48 / 1.22) * rad;
        const ry = (d * 0.48 / 1.22) * rad;
        midPts.push(proj(cam, cx + rx * Math.cos(a), cy + ry * Math.sin(a), 0.45 * h));
    }

    // Top crest ring at z = 0.90 * h
    const topPts: P2[] = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rad = 1 + 0.08 * Math.sin(2 * a);
        const rx = (w * 0.28 / 1.08) * rad;
        const ry = (d * 0.28 / 1.08) * rad;
        topPts.push(proj(cam, cx + rx * Math.cos(a), cy + ry * Math.sin(a), 0.90 * h));
    }

    const body = pathOf(hull([...basePts, ...midPts, ...topPts]));
    const topCrease = pathOf(topPts);

    // Smooth flowing surface layer creases wrapping across the front
    const crease1: P2[] = [];
    for (let i = 2; i <= 8; i++) {
        crease1.push(midPts[i]);
    }
    const flow1 = pathOf(crease1, false);

    const crease2: P2[] = [];
    for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const a = Math.PI * 0.2 + u * Math.PI * 0.8;
        const rx = w * 0.35;
        const ry = d * 0.35;
        const z = 0.68 * h - 0.10 * h * Math.sin(Math.PI * u);
        crease2.push(proj(cam, cx + rx * Math.cos(a), cy + ry * Math.sin(a), z));
    }
    const flow2 = pathOf(crease2, false);

    // Polished smooth highlight mark near upper front
    const [hx, hy] = proj(cam, cx + w * 0.12, cy + d * 0.20, 0.88 * h);
    const glint = pathOf([
        [hx - 1.8, hy],
        [hx, hy - 1.5],
        [hx + 1.8, hy],
        [hx, hy + 1.5],
    ]);

    return [
        { d: body, kind: 'plate' },
        { d: topCrease, kind: 'crease' },
        { d: flow1, kind: 'crease' },
        { d: flow2, kind: 'crease' },
        { d: glint, kind: 'bright' },
    ];
}

/**
 * Fountain boulder: a rugged natural rock boulder with a carved basin line
 * and an active bubbling water spout at the apex.
 */
function buildFountainBoulder(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;

    const basePts: P2[] = [
        [0.12 * w, 0.10 * d],
        [0.55 * w, 0.05 * d],
        [0.92 * w, 0.16 * d],
        [0.98 * w, 0.55 * d],
        [0.86 * w, 0.94 * d],
        [0.42 * w, 0.98 * d],
        [0.06 * w, 0.76 * d],
        [0.02 * w, 0.35 * d],
    ];

    const midPts: [number, number, number][] = [
        [0.20 * w, 0.12 * d, 0.40 * h],
        [0.65 * w, 0.10 * d, 0.36 * h],
        [0.95 * w, 0.35 * d, 0.42 * h],
        [0.90 * w, 0.80 * d, 0.38 * h],
        [0.50 * w, 0.90 * d, 0.44 * h],
        [0.12 * w, 0.80 * d, 0.40 * h],
    ];

    const topFacet: [number, number, number][] = [
        [0.28 * w, 0.24 * d, 0.85 * h],
        [0.72 * w, 0.20 * d, 0.82 * h],
        [0.80 * w, 0.62 * d, 0.76 * h],
        [0.50 * w, 0.80 * d, 0.75 * h],
        [0.22 * w, 0.62 * d, 0.80 * h],
    ];

    const projBase = basePts.map(([x, y]) => proj(cam, x, y, 0));
    const projMid = midPts.map(([x, y, z]) => proj(cam, x, y, z));
    const projTop = topFacet.map(([x, y, z]) => proj(cam, x, y, z));

    const body = pathOf(hull([...projBase, ...projMid, ...projTop]));
    const topCrease = pathOf(projTop);

    // Carved water basin line contour around the top plateau
    const bx = 0.50 * w;
    const by = 0.50 * d;
    const bz = 0.80 * h;
    const br = Math.min(w, d) * 0.20;
    const basinPts = ring(bx - br, by - br, 2 * br, 2 * br, br, 8).map(([x, y]) => proj(cam, x, y, bz));
    const basinLine = pathOf(basinPts);

    // Facet ridge down front
    const ridge = pathOf([projTop[3], projMid[4], projBase[5]], false);

    // Water cascade line from apex into basin
    const cascadeLine = pathOf([
        proj(cam, bx, by, 0.96 * h),
        proj(cam, bx + br * 0.4, by + br * 0.4, bz),
    ], false);

    // Bubbling water spout at apex (bright accent)
    const [sx, sy] = proj(cam, bx, by, 0.98 * h);
    const spout = pathOf([
        [sx - 1.8, sy],
        [sx, sy - 2.0],
        [sx + 1.8, sy],
        [sx, sy + 2.0],
    ]);

    return [
        { d: body, kind: 'plate' },
        { d: topCrease, kind: 'crease' },
        { d: ridge, kind: 'crease' },
        { d: basinLine, kind: 'crease' },
        { d: cascadeLine, kind: 'crease' },
        { d: spout, kind: 'bright' },
    ];
}

/**
 * Fountain sphere: a round stone sphere on a stepped circular pedestal base
 * with water streaming ripple creases and an apex bubbling water spout.
 */
function buildFountainSphere(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Stepped circular basin base
    const baseH1 = h * 0.16;
    const baseH2 = h * 0.12;
    const w1 = w * 0.92;
    const d1 = d * 0.92;
    const p1 = prism(cam, cx - w1 / 2, cy - d1 / 2, 0, w1, d1, baseH1, Math.min(w1, d1) / 2);

    const w2 = w * 0.74;
    const d2 = d * 0.74;
    const p2 = prism(cam, cx - w2 / 2, cy - d2 / 2, baseH1, w2, d2, baseH2, Math.min(w2, d2) / 2);

    // Sphere resting in the upper basin
    const zBaseTop = baseH1 + baseH2;
    const sphereH = h - zBaseTop;
    const srWorld = Math.min(w * 0.60, d * 0.60, sphereH) / 2;
    const cz = zBaseTop + srWorld;

    const [scx, scy] = proj(cam, cx, cy, cz);
    const sr = cam.S * srWorld;

    const spherePts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        spherePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }
    const sphereBody = pathOf(hull(spherePts));

    // Water streaming crease lines running down the sphere from the top apex
    const waterLine1: P2[] = [];
    const waterLine2: P2[] = [];
    const waterSteps = 10;
    for (let i = 0; i <= waterSteps; i++) {
        const t = (i / waterSteps);
        const theta = t * Math.PI * 0.5;
        const z = cz + srWorld * Math.cos(theta);
        const rHoriz = srWorld * Math.sin(theta);
        const a1 = Math.PI * 0.35;
        waterLine1.push(proj(cam, cx + rHoriz * Math.cos(a1), cy + rHoriz * Math.sin(a1), z));
        const a2 = Math.PI * 0.68;
        waterLine2.push(proj(cam, cx + rHoriz * Math.cos(a2), cy + rHoriz * Math.sin(a2), z));
    }
    const waterPath1 = pathOf(waterLine1, false);
    const waterPath2 = pathOf(waterLine2, false);

    // Front rim crease of upper basin
    const frontRim = ring(cx - w2 / 2, cy - d2 / 2, w2, d2, Math.min(w2, d2) / 2, 6)
        .filter(pt => pt[1] >= cy)
        .map(([x, y]) => proj(cam, x, y, zBaseTop));
    const frontRimCrease = pathOf(frontRim, false);

    // Bubbling water spout at top apex of the sphere
    const [apexX, apexY] = proj(cam, cx, cy, cz + srWorld);
    const spout = pathOf([
        [apexX - 1.6, apexY],
        [apexX, apexY - 2.0],
        [apexX + 1.6, apexY],
        [apexX, apexY + 2.0],
    ]);

    return [
        ...solidParts(p1),
        ...solidParts(p2),
        { d: sphereBody, kind: 'plate' },
        { d: frontRimCrease, kind: 'crease' },
        { d: waterPath1, kind: 'crease' },
        { d: waterPath2, kind: 'crease' },
        { d: spout, kind: 'bright' },
    ];
}

/**
 * Fountain S-shaped: an S-curve column with a water channel crease
 * and top cascading spill crest.
 */
function buildFountainSShaped(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Plinth base at z = 0
    const plinthH = h * 0.10;
    const pw = w * 0.88;
    const pd = d * 0.88;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, Math.min(pw, pd) / 2);

    // S-curve column rising from plinthH to h
    const colH = h - plinthH;
    const levels = 6;
    const allColPts: P2[] = [];
    const colTopPts: P2[] = [];
    const groovePts: P2[] = [];

    const colW = w * 0.36;
    const colD = d * 0.36;
    const colR = Math.min(colW, colD) / 2;

    for (let i = 0; i <= levels; i++) {
        const u = i / levels;
        const z = plinthH + u * colH;
        const shiftX = (w * 0.18) * Math.sin(u * Math.PI * 2);
        const curCx = cx + shiftX;
        const curCy = cy;

        const rPts = ring(curCx - colW / 2, curCy - colD / 2, colW, colD, colR, 6);
        for (const [rx, ry] of rPts) {
            const p = proj(cam, rx, ry, z);
            allColPts.push(p);
            if (i === levels) colTopPts.push(p);
        }

        groovePts.push(proj(cam, curCx, curCy + colD / 2, z));
    }

    const colBody = pathOf(hull(allColPts));
    const topCrease = pathOf(colTopPts);
    const waterGroove = pathOf(groovePts, false);

    // Water spillover spout at top crest (bright accent)
    const [topX, topY] = proj(cam, cx, cy, h);
    const spout = pathOf([
        [topX - 1.8, topY],
        [topX, topY - 2.2],
        [topX + 1.8, topY],
        [topX, topY + 2.2],
    ]);

    return [
        ...solidParts(plinth),
        { d: colBody, kind: 'plate' },
        { d: topCrease, kind: 'crease' },
        { d: waterGroove, kind: 'crease' },
        { d: spout, kind: 'bright' },
    ];
}

/**
 * Sculpture flame: a tapering dynamic flame silhouette rising from a square plinth.
 */
function buildSculptureFlame(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Square plinth at base
    const plinthH = h * 0.10;
    const pw = w * 0.70;
    const pd = d * 0.70;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.6);

    // Flame body: rises from plinthH to h with twisting tapering levels
    const levels = 6;
    const flamePts: P2[] = [];
    const spinePts: P2[] = [];
    const formH = h - plinthH;

    for (let i = 0; i <= levels; i++) {
        const u = i / levels;
        const z = plinthH + u * formH;
        const shiftX = (w * 0.14) * Math.sin(u * Math.PI * 1.5);
        const curCx = cx + shiftX;
        const curCy = cy;
        const taper = Math.max(0.04, (1 - u * 0.92));
        const curW = w * 0.55 * taper;
        const curD = d * 0.55 * taper;
        const curR = Math.min(curW, curD) / 2;

        const rPts = ring(curCx - curW / 2, curCy - curD / 2, curW, curD, curR, 5);
        for (const [rx, ry] of rPts) {
            flamePts.push(proj(cam, rx, ry, z));
        }
        spinePts.push(proj(cam, curCx, curCy + curD / 2, z));
    }

    const apexPt = proj(cam, cx + (w * 0.14) * Math.sin(Math.PI * 1.5), cy, h);
    flamePts.push(apexPt);

    const body = pathOf(hull(flamePts));
    const spineCrease = pathOf(spinePts, false);

    // Second flame tongue curl crease
    const curlPts: P2[] = [
        proj(cam, cx - w * 0.08, cy + d * 0.15, plinthH + formH * 0.30),
        proj(cam, cx + w * 0.04, cy + d * 0.12, plinthH + formH * 0.60),
        proj(cam, cx - w * 0.02, cy + d * 0.05, plinthH + formH * 0.82),
    ];
    const curlCrease = pathOf(curlPts, false);

    // Bright flame tip mark
    const [ax, ay] = apexPt;
    const brightMark = pathOf([
        [ax, ay - 2.5],
        [ax + 1.8, ay],
        [ax, ay + 2.5],
        [ax - 1.8, ay],
    ]);

    return [
        ...solidParts(plinth),
        { d: body, kind: 'plate' },
        { d: spineCrease, kind: 'crease' },
        { d: curlCrease, kind: 'crease' },
        { d: brightMark, kind: 'bright' },
    ];
}

/**
 * Sculpture Venus: a stylized standing torso silhouette with classical body curves.
 */
function buildSculptureVenus(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Plinth at base
    const plinthH = h * 0.08;
    const pw = w * 0.66;
    const pd = d * 0.66;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.6);

    // Anatomical profile levels [zFraction, widthFraction, depthFraction]
    const profile: [number, number, number][] = [
        [0.08, 0.32, 0.32],
        [0.26, 0.36, 0.34],
        [0.44, 0.48, 0.44],
        [0.60, 0.34, 0.32],
        [0.76, 0.44, 0.40],
        [0.90, 0.30, 0.28],
        [0.98, 0.18, 0.18],
    ];

    const bodyPts: P2[] = [];
    const waistPts: P2[] = [];
    const bustPts: P2[] = [];

    for (let i = 0; i < profile.length; i++) {
        const [zF, wF, dF] = profile[i];
        const z = zF * h;
        const curW = w * wF;
        const curD = d * dF;
        const curR = Math.min(curW, curD) / 2;

        const rPts = ring(cx - curW / 2, cy - curD / 2, curW, curD, curR, 6);
        for (const [rx, ry] of rPts) {
            const p = proj(cam, rx, ry, z);
            bodyPts.push(p);
            if (i === 3) waistPts.push(p);
            if (i === 4) bustPts.push(p);
        }
    }

    const body = pathOf(hull(bodyPts));
    const waistCrease = pathOf(waistPts.filter(pt => pt[1] >= cy), false);
    const bustCrease = pathOf(bustPts.filter(pt => pt[1] >= cy), false);

    // Polished stone highlight on chest curve
    const [hx, hy] = proj(cam, cx - w * 0.08, cy + d * 0.16, 0.78 * h);
    const highlight = pathOf([
        [hx - 1.5, hy],
        [hx, hy - 1.5],
        [hx + 1.5, hy],
        [hx, hy + 1.5],
    ]);

    return [
        ...solidParts(plinth),
        { d: body, kind: 'plate' },
        { d: waistCrease, kind: 'crease' },
        { d: bustCrease, kind: 'crease' },
        { d: highlight, kind: 'bright' },
    ];
}

/**
 * Sculpture cactus: a column with two branching arms (traditional saguaro form)
 * and a blooming flower at the tip of the higher arm.
 */
function buildSculptureCactus(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Plinth at base
    const plinthH = h * 0.08;
    const pw = w * 0.76;
    const pd = d * 0.76;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.6);

    // Central trunk
    const tw = w * 0.30;
    const td = d * 0.30;
    const trunk = prism(cam, cx - tw / 2, cy - td / 2, plinthH, tw, td, h - plinthH, Math.min(tw, td) / 2);

    // Left arm: branches out at z = 0.36 * h, rises to z = 0.66 * h
    const aw = w * 0.20;
    const ad = d * 0.20;
    const ar = Math.min(aw, ad) / 2;
    const zLBranch = h * 0.36;
    const xLArm = cx - tw / 2 - aw;
    const leftArmHoriz = prism(cam, xLArm, cy - ad / 2, zLBranch, aw + tw / 2, ad, aw * 0.9, ar);
    const leftArmVert = prism(cam, xLArm, cy - ad / 2, zLBranch, aw, ad, h * 0.30, ar);

    // Right arm: branches out at z = 0.48 * h, rises to z = 0.80 * h
    const zRBranch = h * 0.48;
    const xRArm = cx + tw / 2;
    const rightArmHoriz = prism(cam, xRArm - tw / 4, cy - ad / 2, zRBranch, aw + tw / 4, ad, aw * 0.9, ar);
    const rightArmVert = prism(cam, xRArm + aw * 0.05, cy - ad / 2, zRBranch, aw, ad, h * 0.32, ar);

    // Vertical rib crease down front of trunk
    const trunkRib = pathOf([
        proj(cam, cx, cy + td / 2, plinthH + h * 0.05),
        proj(cam, cx, cy + td / 2, h - h * 0.05),
    ], false);

    // Blooming flower on the tip of the taller right arm (bright accent)
    const [fx, fy] = proj(cam, xRArm + aw * 0.55, cy, zRBranch + h * 0.32);
    const flower = pathOf([
        [fx - 1.8, fy],
        [fx, fy - 2.0],
        [fx + 1.8, fy],
        [fx, fy + 2.0],
    ]);

    return [
        ...solidParts(plinth),
        ...solidParts(leftArmHoriz),
        ...solidParts(leftArmVert),
        ...solidParts(rightArmHoriz),
        ...solidParts(rightArmVert),
        ...solidParts(trunk),
        { d: trunkRib, kind: 'crease' },
        { d: flower, kind: 'bright' },
    ];
}

/**
 * Neutral default sculpture: abstract geometric faceted form on square plinth.
 */
function buildSculptureDefault(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const pw = w * 0.72;
    const pd = d * 0.72;
    const plinthH = h * 0.12;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.8);

    const formH = h - plinthH;
    const zMid = plinthH + formH * 0.44;

    const bw = w * 0.32;
    const bd = d * 0.32;
    const pB_front = proj(cam, cx, cy + bd / 2, plinthH);
    const pB_right = proj(cam, cx + bw / 2, cy, plinthH);
    const pB_left = proj(cam, cx - bw / 2, cy, plinthH);
    const pB_back = proj(cam, cx, cy - bd / 2, plinthH);

    const mw = w * 0.86;
    const md = d * 0.86;
    const pM_front = proj(cam, cx, cy + md / 2, zMid);
    const pM_right = proj(cam, cx + mw / 2, cy, zMid);
    const pM_left = proj(cam, cx - mw / 2, cy, zMid);
    const pM_back = proj(cam, cx, cy - md / 2, zMid);

    const pApex = proj(cam, cx, cy, h);

    const body = pathOf(hull([
        pApex,
        pM_back, pM_right, pM_front, pM_left,
        pB_back, pB_right, pB_front, pB_left,
    ]));

    const frontSpine = pathOf([pApex, pM_front, pB_front], false);
    const equator = pathOf([pM_left, pM_front, pM_right], false);
    const lowerFacets = pathOf([pM_left, pB_front, pM_right], false);

    const [aX, aY] = pApex;
    const brightMark = pathOf([
        [aX, aY - 2.4],
        [aX + 2.0, aY],
        [aX, aY + 2.4],
        [aX - 2.0, aY],
    ]);

    return [
        ...solidParts(plinth),
        { d: body, kind: 'plate' },
        { d: frontSpine, kind: 'crease' },
        { d: equator, kind: 'crease' },
        { d: lowerFacets, kind: 'crease' },
        { d: brightMark, kind: 'bright' },
    ];
}

/**
 * Pillar squared: stepped square bases, square shaft with panel flute, stepped square capital.
 */
function buildPillarSquared(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const bw1 = w * 0.94;
    const bd1 = d * 0.94;
    const hB1 = h * 0.04;
    const base1 = prism(cam, cx - bw1 / 2, cy - bd1 / 2, 0, bw1, bd1, hB1, 0.6);

    const bw2 = w * 0.82;
    const bd2 = d * 0.82;
    const hB2 = h * 0.04;
    const base2 = prism(cam, cx - bw2 / 2, cy - bd2 / 2, hB1, bw2, bd2, hB2, 0.5);

    const zShaftStart = hB1 + hB2;
    const zShaftEnd = h * 0.88;
    const sw = w * 0.66;
    const sd = d * 0.66;
    const shaft = prism(cam, cx - sw / 2, cy - sd / 2, zShaftStart, sw, sd, zShaftEnd - zShaftStart, 0.4);

    const fluteW = sw * 0.46;
    const flute = rectY(cam, cy + sd / 2, cx - fluteW / 2, cx + fluteW / 2, zShaftStart + h * 0.03, zShaftEnd - h * 0.03);

    const hC1 = h * 0.04;
    const cw1 = w * 0.78;
    const cd1 = d * 0.78;
    const cap1 = prism(cam, cx - cw1 / 2, cy - cd1 / 2, zShaftEnd, cw1, cd1, hC1, 0.5);

    const zCap2 = zShaftEnd + hC1;
    const hC2 = h - zCap2;
    const cw2 = w * 0.94;
    const cd2 = d * 0.94;
    const cap2 = prism(cam, cx - cw2 / 2, cy - cd2 / 2, zCap2, cw2, cd2, hC2, 0.6);

    const brightW = cw2 * 0.40;
    const bright = rectY(cam, cy + cd2 / 2, cx - brightW / 2, cx + brightW / 2, zCap2 + hC2 * 0.35, zCap2 + hC2 * 0.75);

    return [
        ...solidParts(base1),
        ...solidParts(base2),
        ...solidParts(shaft),
        { d: flute, kind: 'crease' },
        ...solidParts(cap1),
        ...solidParts(cap2),
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Pillar cylinder: circular classical column with round stepped bases,
 * cylindrical shaft, and circular capital.
 */
function buildPillarCylinder(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const bw1 = w * 0.94;
    const bd1 = d * 0.94;
    const hB1 = h * 0.04;
    const base1 = prism(cam, cx - bw1 / 2, cy - bd1 / 2, 0, bw1, bd1, hB1, Math.min(bw1, bd1) / 2);

    const bw2 = w * 0.82;
    const bd2 = d * 0.82;
    const hB2 = h * 0.04;
    const base2 = prism(cam, cx - bw2 / 2, cy - bd2 / 2, hB1, bw2, bd2, hB2, Math.min(bw2, bd2) / 2);

    const zShaftStart = hB1 + hB2;
    const zShaftEnd = h * 0.88;
    const sw = w * 0.66;
    const sd = d * 0.66;
    const shaft = prism(cam, cx - sw / 2, cy - sd / 2, zShaftStart, sw, sd, zShaftEnd - zShaftStart, Math.min(sw, sd) / 2);

    // Flute crease down front curve of cylinder
    const fluteLine: P2[] = [
        proj(cam, cx, cy + sd / 2, zShaftStart + h * 0.03),
        proj(cam, cx, cy + sd / 2, zShaftEnd - h * 0.03),
    ];
    const flute = pathOf(fluteLine, false);

    const hC1 = h * 0.04;
    const cw1 = w * 0.78;
    const cd1 = d * 0.78;
    const cap1 = prism(cam, cx - cw1 / 2, cy - cd1 / 2, zShaftEnd, cw1, cd1, hC1, Math.min(cw1, cd1) / 2);

    const zCap2 = zShaftEnd + hC1;
    const hC2 = h - zCap2;
    const cw2 = w * 0.94;
    const cd2 = d * 0.94;
    const cap2 = prism(cam, cx - cw2 / 2, cy - cd2 / 2, zCap2, cw2, cd2, hC2, Math.min(cw2, cd2) / 2);

    const [bx, by] = proj(cam, cx, cy + cd2 / 2, zCap2 + hC2 * 0.5);
    const bright = pathOf([
        [bx - 2.0, by],
        [bx, by - 1.2],
        [bx + 2.0, by],
        [bx, by + 1.2],
    ]);

    return [
        ...solidParts(base1),
        ...solidParts(base2),
        ...solidParts(shaft),
        { d: flute, kind: 'crease' },
        ...solidParts(cap1),
        ...solidParts(cap2),
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Ball mini: a 6 cm sphere resting in a compact low ring collar with an equator ellipse crease.
 */
function buildBallMini(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const ringH = Math.max(1.2, h * 0.10);
    const rw = w * 0.48;
    const rd = d * 0.48;
    const rRing = Math.min(rw, rd) / 2;
    const stand = prism(cam, cx - rw / 2, cy - rd / 2, 0, rw, rd, ringH, rRing);

    const zBot = ringH * 0.5;
    const srWorld = Math.min(w, d, h - zBot) / 2;
    const cz = zBot + srWorld;

    const [scx, scy] = proj(cam, cx, cy, cz);
    const sr = cam.S * srWorld;

    const circlePts: P2[] = [];
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        circlePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }
    const sphereBody = pathOf(hull(circlePts));

    const eqPts: P2[] = [];
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        eqPts.push(proj(cam, cx + srWorld * Math.cos(a), cy + srWorld * Math.sin(a), cz));
    }
    const equator = pathOf(eqPts);

    const hr = Math.max(1.0, sr * 0.07);
    const hx = scx - sr * 0.32;
    const hy = scy - sr * 0.32;
    const hlPts: P2[] = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        hlPts.push([hx + hr * Math.cos(a), hy + hr * Math.sin(a)]);
    }
    const brightMark = pathOf(hlPts);

    return [
        ...solidParts(stand),
        { d: sphereBody, kind: 'plate' },
        { d: equator, kind: 'crease' },
        { d: brightMark, kind: 'bright' },
    ];
}

/**
 * Ball small: an 8 cm sphere on a beveled cradle pedestal with equator and meridian creases.
 */
function buildBallSmall(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const ringH = Math.max(1.6, h * 0.14);
    const rw = w * 0.56;
    const rd = d * 0.56;
    const rRing = Math.min(rw, rd) / 2;
    const stand = prism(cam, cx - rw / 2, cy - rd / 2, 0, rw, rd, ringH, rRing);

    const frontLip = ring(cx - rw / 2, cy - rd / 2, rw, rd, rRing, 6)
        .filter(pt => pt[1] >= cy)
        .map(([x, y]) => proj(cam, x, y, ringH));
    const frontLipCrease = pathOf(frontLip, false);

    const zBot = ringH * 0.5;
    const srWorld = Math.min(w, d, h - zBot) / 2;
    const cz = zBot + srWorld;

    const [scx, scy] = proj(cam, cx, cy, cz);
    const sr = cam.S * srWorld;

    const circlePts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        circlePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }
    const sphereBody = pathOf(hull(circlePts));

    const eqPts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        eqPts.push(proj(cam, cx + srWorld * Math.cos(a), cy + srWorld * Math.sin(a), cz));
    }
    const equator = pathOf(eqPts);

    const longPts: P2[] = [];
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI;
        const x = cx + srWorld * Math.sin(a) * Math.cos(Math.PI * 0.25);
        const y = cy + srWorld * Math.sin(a) * Math.sin(Math.PI * 0.25);
        const z = cz + srWorld * Math.cos(a);
        longPts.push(proj(cam, x, y, z));
    }
    const longitude = pathOf(longPts, false);

    const hx = scx - sr * 0.35;
    const hy = scy - sr * 0.35;
    const brightMark = pathOf([
        [hx - 1.8, hy],
        [hx, hy - 1.8],
        [hx + 1.8, hy],
        [hx, hy + 1.8],
    ]);

    return [
        ...solidParts(stand),
        { d: sphereBody, kind: 'plate' },
        { d: equator, kind: 'crease' },
        { d: longitude, kind: 'crease' },
        { d: frontLipCrease, kind: 'crease' },
        { d: brightMark, kind: 'bright' },
    ];
}

/**
 * Bag of stones: gathered fabric sack cinched at the neck with folds and a tie knot.
 */
function buildBag(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const zBelly = h * 0.34;
    const zShoulder = h * 0.68;
    const zNeck = h * 0.84;

    const bw = w * 0.82;
    const bd = d * 0.82;
    const botRing = ring(cx - bw / 2, cy - bd / 2, bw, bd, Math.min(bw, bd) * 0.35, 6);

    const mw = w * 0.96;
    const md = d * 0.96;
    const bellyRing = ring(cx - mw / 2, cy - md / 2, mw, md, Math.min(mw, md) * 0.45, 6);

    const sw = w * 0.72;
    const sd = d * 0.72;
    const shoulderRing = ring(cx - sw / 2, cy - sd / 2, sw, sd, Math.min(sw, sd) * 0.40, 6);

    const nw = w * 0.36;
    const nd = d * 0.36;
    const neckRing = ring(cx - nw / 2, cy - nd / 2, nw, nd, Math.min(nw, nd) / 2, 6);

    const ptsBot = botRing.map(([x, y]) => proj(cam, x, y, 0));
    const ptsBelly = bellyRing.map(([x, y]) => proj(cam, x, y, zBelly));
    const ptsShoulder = shoulderRing.map(([x, y]) => proj(cam, x, y, zShoulder));
    const ptsNeck = neckRing.map(([x, y]) => proj(cam, x, y, zNeck));

    const sackBody = pathOf(hull([...ptsBot, ...ptsBelly, ...ptsShoulder, ...ptsNeck]));
    const neckCrease = pathOf(ptsNeck);

    const fw = w * 0.52;
    const fd = d * 0.52;
    const flareRing = ring(cx - fw / 2, cy - fd / 2, fw, fd, Math.min(fw, fd) * 0.35, 6);
    const frillSolid = loft(cam, neckRing, zNeck, flareRing, h);

    const fold1 = pathOf([
        proj(cam, cx - nw * 0.25, cy + nd / 2, zNeck),
        proj(cam, cx - mw * 0.18, cy + md * 0.45, zBelly + (zShoulder - zBelly) * 0.5),
    ], false);
    const fold2 = pathOf([
        proj(cam, cx + nw * 0.25, cy + nd / 2, zNeck),
        proj(cam, cx + mw * 0.18, cy + md * 0.45, zBelly + (zShoulder - zBelly) * 0.5),
    ], false);

    const kx = cx + nw * 0.28;
    const ky = cy + nd / 2;
    const [skx, sky] = proj(cam, kx, ky, zNeck);
    const knotPts: P2[] = [
        [skx - 2.0, sky - 1.5],
        [skx + 2.0, sky - 1.5],
        [skx + 2.5, sky + 1.8],
        [skx - 1.5, sky + 2.5],
    ];
    const knot = pathOf(knotPts);

    return [
        ...solidParts(frillSolid),
        { d: sackBody, kind: 'plate' },
        { d: neckCrease, kind: 'crease' },
        { d: fold1, kind: 'crease' },
        { d: fold2, kind: 'crease' },
        { d: knot, kind: 'bright' },
    ];
}

/**
 * B6 fountain-set: set of 3 fountain monoliths on a shadow plinth with apex spouts.
 */
function buildFountainSet(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const plinthH = Math.max(1.0, h * 0.08);
    const plinth = prism(cam, 0, 0, 0, w, d, plinthH, Math.min(w, d) * 0.15);

    const w1 = w * 0.24;
    const d1 = d * 0.55;
    const h1 = h * 0.70;
    const x1 = w * 0.06;
    const y1 = d * 0.22;
    const f1 = prism(cam, x1, y1, plinthH, w1, d1, h1 - plinthH, Math.min(w1, d1) * 0.35);

    const w2 = w * 0.28;
    const d2 = d * 0.60;
    const h2 = h * 0.92;
    const x2 = w * 0.36;
    const y2 = d * 0.18;
    const f2 = prism(cam, x2, y2, plinthH, w2, d2, h2 - plinthH, Math.min(w2, d2) * 0.35);

    const w3 = w * 0.24;
    const d3 = d * 0.52;
    const h3 = h * 0.80;
    const x3 = w * 0.70;
    const y3 = d * 0.24;
    const f3 = prism(cam, x3, y3, plinthH, w3, d3, h3 - plinthH, Math.min(w3, d3) * 0.35);

    const groove2 = pathOf([
        proj(cam, x2 + w2 * 0.5, y2 + d2, h2 * 0.9),
        proj(cam, x2 + w2 * 0.5, y2 + d2, plinthH + 1),
    ], false);

    const [sx, sy] = proj(cam, x2 + w2 * 0.5, y2 + d2 * 0.5, h2);
    const spout = pathOf([
        [sx - 1.8, sy],
        [sx, sy - 2.0],
        [sx + 1.8, sy],
        [sx, sy + 2.0],
    ]);

    return [
        ...solidParts(plinth),
        ...solidParts(f1),
        ...solidParts(f3),
        ...solidParts(f2),
        { d: groove2, kind: 'crease' },
        { d: spout, kind: 'bright' },
    ];
}

/**
 * B7 sculpture-set: set of 3 sculptures on shared plinth with varying heights.
 */
function buildSculptureSet(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const plinthH = Math.max(1.0, h * 0.08);
    const plinth = prism(cam, 0, 0, 0, w, d, plinthH, Math.min(w, d) * 0.15);

    const w1 = w * 0.25;
    const d1 = d * 0.52;
    const h1 = h * 0.72;
    const x1 = w * 0.06;
    const y1 = d * 0.24;
    const s1 = prism(cam, x1, y1, plinthH, w1, d1, h1 - plinthH, Math.min(w1, d1) * 0.4);

    const w2 = w * 0.30;
    const d2 = d * 0.58;
    const h2 = h * 0.94;
    const x2 = w * 0.35;
    const y2 = d * 0.20;
    const s2 = prism(cam, x2, y2, plinthH, w2, d2, h2 - plinthH, Math.min(w2, d2) * 0.4);

    const w3 = w * 0.25;
    const d3 = d * 0.50;
    const h3 = h * 0.82;
    const x3 = w * 0.69;
    const y3 = d * 0.25;
    const s3 = prism(cam, x3, y3, plinthH, w3, d3, h3 - plinthH, Math.min(w3, d3) * 0.4);

    const rib = pathOf([
        proj(cam, x2 + w2 * 0.5, y2 + d2, h2 * 0.88),
        proj(cam, x2 + w2 * 0.5, y2 + d2, plinthH + 1),
    ], false);

    const [ax, ay] = proj(cam, x2 + w2 * 0.5, y2 + d2 * 0.5, h2);
    const glint = pathOf([
        [ax - 1.8, ay],
        [ax, ay - 1.8],
        [ax + 1.8, ay],
        [ax, ay + 1.8],
    ]);

    return [
        ...solidParts(plinth),
        ...solidParts(s1),
        ...solidParts(s3),
        ...solidParts(s2),
        { d: rib, kind: 'crease' },
        { d: glint, kind: 'bright' },
    ];
}

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for a known canonical stone Type.
 * Returns FigurePart[] back-to-front, or null for an unknown Type id.
 */
export function buildStoneFigure(
    id: string,
    rawDims: Dims | null,
    holes?: number,
    variant?: string | null,
): FigurePart[] | null {
    void holes;
    if (!id || !STONE_FIGURE_IDS.includes(id as StoneFigureId)) return null;
    const opt = resolveVariant(id, variant);

    let fallback = DEFAULTS[id as StoneFigureId];
    if (id === 'rock' || id === 'boulder') {
        fallback = ROCK_FALLBACKS[opt ?? 'boulder'] ?? DEFAULTS['rock'];
    } else if (id === 'fountain') {
        fallback = FOUNTAIN_FALLBACKS[opt ?? 'boulder'] ?? DEFAULTS['fountain'];
    } else if (id === 'sculpture') {
        fallback = SCULPTURE_FALLBACKS[opt ?? 'default'] ?? DEFAULTS['sculpture'];
    } else if (id === 'pillar') {
        fallback = PILLAR_FALLBACKS[opt ?? 'squared'] ?? DEFAULTS['pillar'];
    } else if (id === 'ball') {
        fallback = BALL_FALLBACKS[opt ?? 'mini'] ?? DEFAULTS['ball'];
    }

    const dims = normalizeDims(rawDims, fallback);
    const cam = centeredCam(dims);

    switch (id) {
        case 'rock':
            return opt === 'free-form'
                ? buildRockFreeForm(cam, dims)
                : buildRockBoulder(cam, dims);
        case 'boulder':
            return buildRockBoulder(cam, dims);
        case 'pebble-stone':
            return buildBag(cam, dims);
        case 'fountain':
            if (opt === 'sphere') return buildFountainSphere(cam, dims);
            if (opt === 's-shaped') return buildFountainSShaped(cam, dims);
            return buildFountainBoulder(cam, dims);
        case 'fountain-set':
            return buildFountainSet(cam, dims);
        case 'sculpture':
            if (opt === 'flame') return buildSculptureFlame(cam, dims);
            if (opt === 'venus') return buildSculptureVenus(cam, dims);
            if (opt === 'cactus') return buildSculptureCactus(cam, dims);
            return buildSculptureDefault(cam, dims);
        case 'sculpture-set':
            return buildSculptureSet(cam, dims);
        case 'pillar':
            return opt === 'cylinder'
                ? buildPillarCylinder(cam, dims)
                : buildPillarSquared(cam, dims);
        case 'ball':
            return opt === 'small'
                ? buildBallSmall(cam, dims)
                : buildBallMini(cam, dims);
        case 'bag':
            return buildBag(cam, dims);
        default:
            return null;
    }
}
