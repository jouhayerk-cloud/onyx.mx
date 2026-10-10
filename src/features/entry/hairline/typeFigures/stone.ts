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
    'sculpture',
    'pillar',
    'ball',
    'bag',
] as const;

export type StoneFigureId = (typeof STONE_FIGURE_IDS)[number];

/** Sensible default dimensions in cm per stone Type. */
export const DEFAULTS: Record<StoneFigureId, Dims> = {
    'rock':      { w: 38, h: 32, d: 34 },
    'fountain':  { w: 70, h: 85, d: 70 },
    'sculpture': { w: 40, h: 85, d: 40 },
    'pillar':    { w: 30, h: 120, d: 30 },
    'ball':      { w: 20, h: 22, d: 20 },
    'bag':       { w: 20, h: 60, d: 20 },
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

function buildRock(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;

    // Irregular faceted polyhedron: wider at base, tapering towards a tilted top
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

    // Tilted top facet (slanted forward toward +x/+y so it is visible)
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

    // Carved hollow on top (rock fountain basin)
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

function buildFountain(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const t1H = h * 0.20;
    const c1H = h * 0.11;
    const t2H = h * 0.18;
    const c2H = h * 0.11;
    const t3H = h * 0.16;

    const c1Top = t1H + c1H;
    const t2Top = c1Top + t2H;
    const c2Top = t2Top + c2H;
    const t3Top = c2Top + t3H;

    // Base basin
    const w1 = w * 0.94;
    const d1 = d * 0.94;
    const p1 = prism(cam, cx - w1 / 2, cy - d1 / 2, 0, w1, d1, t1H, Math.min(w1, d1) / 2);

    // Lower column
    const cw1 = w * 0.22;
    const cd1 = d * 0.22;
    const pc1 = prism(cam, cx - cw1 / 2, cy - cd1 / 2, t1H, cw1, cd1, c1H, Math.min(cw1, cd1) / 2);

    // Middle basin
    const w2 = w * 0.66;
    const d2 = d * 0.66;
    const p2 = prism(cam, cx - w2 / 2, cy - d2 / 2, c1Top, w2, d2, t2H, Math.min(w2, d2) / 2);

    // Upper column
    const cw2 = w * 0.16;
    const cd2 = d * 0.16;
    const pc2 = prism(cam, cx - cw2 / 2, cy - cd2 / 2, t2Top, cw2, cd2, c2H, Math.min(cw2, cd2) / 2);

    // Top basin
    const w3 = w * 0.40;
    const d3 = d * 0.40;
    const p3 = prism(cam, cx - w3 / 2, cy - d3 / 2, c2Top, w3, d3, t3H, Math.min(w3, d3) / 2);

    // Water bubbling spout at apex (bright accent)
    const spoutPts = [
        proj(cam, cx, cy, h),
        proj(cam, cx + w * 0.04, cy, t3Top),
        proj(cam, cx, cy + d * 0.04, t3Top),
        proj(cam, cx - w * 0.04, cy, t3Top),
        proj(cam, cx, cy - d * 0.04, t3Top),
    ];
    const spout = pathOf(hull(spoutPts));

    return [
        ...solidParts(p1),
        ...solidParts(pc1),
        ...solidParts(p2),
        ...solidParts(pc2),
        ...solidParts(p3),
        { d: spout, kind: 'bright' },
    ];
}

function buildSculpture(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Square plinth at base
    const pw = w * 0.72;
    const pd = d * 0.72;
    const plinthH = h * 0.12;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.8);

    // Faceted standing form above plinth
    const formH = h - plinthH;
    const zMid = plinthH + formH * 0.44;

    // Small base diamond resting on plinth
    const bw = w * 0.32;
    const bd = d * 0.32;
    const pB_front = proj(cam, cx, cy + bd / 2, plinthH);
    const pB_right = proj(cam, cx + bw / 2, cy, plinthH);
    const pB_left = proj(cam, cx - bw / 2, cy, plinthH);
    const pB_back = proj(cam, cx, cy - bd / 2, plinthH);

    // Widest equator diamond
    const mw = w * 0.86;
    const md = d * 0.86;
    const pM_front = proj(cam, cx, cy + md / 2, zMid);
    const pM_right = proj(cam, cx + mw / 2, cy, zMid);
    const pM_left = proj(cam, cx - mw / 2, cy, zMid);
    const pM_back = proj(cam, cx, cy - md / 2, zMid);

    // Apex at top
    const pApex = proj(cam, cx, cy, h);

    const body = pathOf(hull([
        pApex,
        pM_back, pM_right, pM_front, pM_left,
        pB_back, pB_right, pB_front, pB_left,
    ]));

    // Visible facet crease lines
    const frontSpine = pathOf([pApex, pM_front, pB_front], false);
    const equator = pathOf([pM_left, pM_front, pM_right], false);
    const lowerFacets = pathOf([pM_left, pB_front, pM_right], false);

    // Bright accent mark at the apex
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

function buildPillar(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Stepped base: lower plinth and upper moulding
    const bw1 = w * 0.94;
    const bd1 = d * 0.94;
    const hB1 = h * 0.04;
    const base1 = prism(cam, cx - bw1 / 2, cy - bd1 / 2, 0, bw1, bd1, hB1, 0.6);

    const bw2 = w * 0.82;
    const bd2 = d * 0.82;
    const hB2 = h * 0.04;
    const base2 = prism(cam, cx - bw2 / 2, cy - bd2 / 2, hB1, bw2, bd2, hB2, 0.5);

    // Square shaft
    const zShaftStart = hB1 + hB2;
    const zShaftEnd = h * 0.88;
    const sw = w * 0.66;
    const sd = d * 0.66;
    const shaft = prism(cam, cx - sw / 2, cy - sd / 2, zShaftStart, sw, sd, zShaftEnd - zShaftStart, 0.4);

    // Vertical panel flute on front face
    const fluteW = sw * 0.46;
    const flute = rectY(cam, cy + sd / 2, cx - fluteW / 2, cx + fluteW / 2, zShaftStart + h * 0.03, zShaftEnd - h * 0.03);

    // Capital: lower neck collar and upper abacus slab
    const hC1 = h * 0.04;
    const cw1 = w * 0.78;
    const cd1 = d * 0.78;
    const cap1 = prism(cam, cx - cw1 / 2, cy - cd1 / 2, zShaftEnd, cw1, cd1, hC1, 0.5);

    const zCap2 = zShaftEnd + hC1;
    const hC2 = h - zCap2;
    const cw2 = w * 0.94;
    const cd2 = d * 0.94;
    const cap2 = prism(cam, cx - cw2 / 2, cy - cd2 / 2, zCap2, cw2, cd2, hC2, 0.6);

    // Bright highlight on the front face of the upper capital abacus
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

function buildBall(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    // Small low ring stand at base
    const ringH = Math.max(1.5, h * 0.12);
    const rw = w * 0.52;
    const rd = d * 0.52;
    const rRing = Math.min(rw, rd) / 2;
    const stand = prism(cam, cx - rw / 2, cy - rd / 2, 0, rw, rd, ringH, rRing);

    // Sphere resting in the ring
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

    // One equator crease
    const eqPts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        eqPts.push(proj(cam, cx + srWorld * Math.cos(a), cy + srWorld * Math.sin(a), cz));
    }
    const equator = pathOf(eqPts);

    // Front lip of the ring supporting the ball
    const frontLip = ring(cx - rw / 2, cy - rd / 2, rw, rd, rRing, 6)
        .filter(([x, y]) => y >= cy)
        .map(([x, y]) => proj(cam, x, y, ringH));
    const frontLipCrease = pathOf(frontLip, false);

    // Bright highlight mark near top-left of sphere
    const hr = Math.max(1.2, sr * 0.08);
    const hx = scx - sr * 0.35;
    const hy = scy - sr * 0.35;
    const hlPts: P2[] = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        hlPts.push([hx + hr * Math.cos(a), hy + hr * Math.sin(a)]);
    }
    const brightMark = pathOf(hlPts);

    return [
        ...solidParts(stand),
        { d: sphereBody, kind: 'plate' },
        { d: equator, kind: 'crease' },
        { d: frontLipCrease, kind: 'crease' },
        { d: brightMark, kind: 'bright' },
    ];
}

function buildBag(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const zBelly = h * 0.34;
    const zShoulder = h * 0.68;
    const zNeck = h * 0.84;

    // Sack body rings: rounded bottom, bulging belly, tapering shoulder, tight neck
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

    // Flared gathered fabric opening above the neck cinch
    const fw = w * 0.52;
    const fd = d * 0.52;
    const flareRing = ring(cx - fw / 2, cy - fd / 2, fw, fd, Math.min(fw, fd) * 0.35, 6);
    const frillSolid = loft(cam, neckRing, zNeck, flareRing, h);

    // Fabric fold creases running down from the cinched neck
    const fold1 = pathOf([
        proj(cam, cx - nw * 0.25, cy + nd / 2, zNeck),
        proj(cam, cx - mw * 0.18, cy + md * 0.45, zBelly + (zShoulder - zBelly) * 0.5),
    ], false);
    const fold2 = pathOf([
        proj(cam, cx + nw * 0.25, cy + nd / 2, zNeck),
        proj(cam, cx + mw * 0.18, cy + md * 0.45, zBelly + (zShoulder - zBelly) * 0.5),
    ], false);

    // Small bright tie knot at the neck cinch
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

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for a known canonical stone Type.
 * Returns FigurePart[] back-to-front, or null for an unknown Type id.
 */
export function buildStoneFigure(id: string, rawDims: Dims | null, _holes?: number): FigurePart[] | null {
    if (!id || !(id in DEFAULTS)) return null;
    const dims = normalizeDims(rawDims, DEFAULTS[id as StoneFigureId]);
    const cam = centeredCam(dims);

    switch (id) {
        case 'rock':
            return buildRock(cam, dims);
        case 'fountain':
            return buildFountain(cam, dims);
        case 'sculpture':
            return buildSculpture(cam, dims);
        case 'pillar':
            return buildPillar(cam, dims);
        case 'ball':
            return buildBall(cam, dims);
        case 'bag':
            return buildBag(cam, dims);
        default:
            return null;
    }
}
