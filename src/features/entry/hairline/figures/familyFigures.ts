import type { Geometry, Dims, FigurePart } from '../types';
import { normalizeDims, centeredCam } from '../types';
import {
    type Cam,
    type P2,
    proj,
    ring,
    hull,
    pathOf,
    prism,
    rectY,
    rectX,
    discY,
} from '../../../welcome/hairline/engine';

/**
 * Sensible default dimensions per family in cm.
 * Scaled by normalizeDims so the longest side is FIGURE_SIZE (30 world units).
 */
export const DEFAULTS: Record<Geometry, Dims> = {
    box: { w: 30, h: 20, d: 20 },
    bowl: { w: 36, h: 14, d: 24 },
    plate: { w: 30, h: 3, d: 30 },
    cylinder: { w: 18, h: 32, d: 18 },
    sphere: { w: 22, h: 22, d: 22 },
    mirror: { w: 60, h: 60, d: 4 },
    octahedron: { w: 20, h: 32, d: 20 },
    polyhedron: { w: 28, h: 22, d: 24 },
};

function buildBox(cam: Cam, dims: Dims, isMirror: boolean): FigurePart[] {
    const r = Math.min(1.2, dims.w / 4, dims.d / 4);
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, dims.h, r);
    const parts: FigurePart[] = [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
    ];

    if (isMirror) {
        if (dims.w >= dims.d) {
            const x0 = dims.w * 0.15;
            const x1 = dims.w * 0.85;
            const z0 = dims.h * 0.15;
            const z1 = dims.h * 0.85;
            const face = rectY(cam, dims.d, x0, x1, z0, z1);
            const p0 = proj(cam, x0 + (x1 - x0) * 0.2, dims.d, z1 - (z1 - z0) * 0.2);
            const p1 = proj(cam, x0 + (x1 - x0) * 0.8, dims.d, z0 + (z1 - z0) * 0.2);
            const sheen = pathOf([p0, p1], false);
            parts.push({ d: face, kind: 'face' });
            parts.push({ d: sheen, kind: 'crease' });
        } else {
            const y0 = dims.d * 0.15;
            const y1 = dims.d * 0.85;
            const z0 = dims.h * 0.15;
            const z1 = dims.h * 0.85;
            const face = rectX(cam, dims.w, y0, y1, z0, z1);
            const p0 = proj(cam, dims.w, y0 + (y1 - y0) * 0.2, z1 - (z1 - z0) * 0.2);
            const p1 = proj(cam, dims.w, y0 + (y1 - y0) * 0.8, z0 + (z1 - z0) * 0.2);
            const sheen = pathOf([p0, p1], false);
            parts.push({ d: face, kind: 'face' });
            parts.push({ d: sheen, kind: 'crease' });
        }
    }

    // Exactly ONE bright mark on the front face (+y) near top-right
    const bx0 = dims.w * 0.86;
    const bx1 = dims.w * 0.94;
    const bz0 = dims.h - 1.6;
    const bz1 = dims.h - 0.6;
    parts.push({ d: rectY(cam, dims.d, bx0, bx1, bz0, bz1), kind: 'bright' });

    return parts;
}

function buildCylinder(cam: Cam, dims: Dims): FigurePart[] {
    const r = Math.min(dims.w, dims.d) / 2;
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, dims.h, r);
    const bright = discY(cam, dims.w / 2, dims.d, dims.h - 0.8, 0.7, 10);
    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildBowl(cam: Cam, dims: Dims): FigurePart[] {
    const bw = dims.w * 0.55;
    const bd = dims.d * 0.55;
    const bx0 = (dims.w - bw) / 2;
    const by0 = (dims.d - bd) / 2;
    const br = Math.min(bw, bd) / 2;
    const botRing = ring(bx0, by0, bw, bd, br, 6);
    const botPts = botRing.map(([x, y]) => proj(cam, x, y, 0));

    const tr = Math.min(dims.w, dims.d) / 2;
    const topRing = ring(0, 0, dims.w, dims.d, tr, 6);
    const topPts = topRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const iw = dims.w * 0.82;
    const id = dims.d * 0.82;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const ir = Math.min(iw, id) / 2;
    const innerRing = ring(ix0, iy0, iw, id, ir, 6);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, dims.h));

    const bright = discY(cam, dims.w / 2, dims.d, dims.h - 0.6, 0.6, 10);

    return [
        { d: pathOf(hull([...botPts, ...topPts])), kind: 'plate' },
        { d: pathOf(topPts), kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildPlate(cam: Cam, dims: Dims): FigurePart[] {
    const h = 1.2;
    const r = Math.min(dims.w, dims.d) / 2;
    const p = prism(cam, 0, 0, 0, dims.w, dims.d, h, r);

    const iw = dims.w * 0.74;
    const id = dims.d * 0.74;
    const ix0 = (dims.w - iw) / 2;
    const iy0 = (dims.d - id) / 2;
    const ir = Math.min(iw, id) / 2;
    const innerRing = ring(ix0, iy0, iw, id, ir, 6);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, h));

    const bright = discY(cam, dims.w / 2, dims.d, h - 0.4, 0.5, 10);

    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildMirror(cam: Cam, dims: Dims): FigurePart[] {
    const cx = dims.w / 2;
    const cz = dims.h / 2;
    const r = Math.min(dims.w, dims.h) / 2;
    const n = 24;

    const ptsBack: P2[] = [];
    const ptsFront: P2[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + r * Math.cos(a);
        const z = cz + r * Math.sin(a);
        ptsBack.push(proj(cam, x, 0, z));
        ptsFront.push(proj(cam, x, dims.d, z));
    }

    const rFace = r * 0.84;
    const face = discY(cam, cx, dims.d, cz, rFace, 24);
    const p0 = proj(cam, cx - rFace * 0.5, dims.d, cz + rFace * 0.5);
    const p1 = proj(cam, cx + rFace * 0.5, dims.d, cz - rFace * 0.5);
    const sheen = pathOf([p0, p1], false);
    const bright = discY(cam, cx, dims.d, cz + r - 1.2, 0.7, 10);

    return [
        { d: pathOf(hull([...ptsBack, ...ptsFront])), kind: 'plate' },
        { d: pathOf(ptsFront), kind: 'crease' },
        { d: face, kind: 'face' },
        { d: sheen, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildSphere(cam: Cam, dims: Dims): FigurePart[] {
    const cx = dims.w / 2;
    const cy = dims.d / 2;
    const cz = dims.h / 2;
    const r = Math.min(dims.w, dims.d, dims.h) / 2;

    const [scx, scy] = proj(cam, cx, cy, cz);
    const sr = cam.S * r;

    const circlePts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        circlePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }

    const eqPts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        eqPts.push(proj(cam, cx + r * Math.cos(a), cy + r * Math.sin(a), cz));
    }

    const hr = Math.max(1.2, sr * 0.08);
    const hx = scx - sr * 0.35;
    const hy = scy - sr * 0.35;
    const hlPts: P2[] = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        hlPts.push([hx + hr * Math.cos(a), hy + hr * Math.sin(a)]);
    }

    return [
        { d: pathOf(hull(circlePts)), kind: 'plate' },
        { d: pathOf(eqPts), kind: 'crease' },
        { d: pathOf(hlPts), kind: 'bright' },
    ];
}

function buildOctahedron(cam: Cam, dims: Dims): FigurePart[] {
    const cx = dims.w / 2;
    const cy = dims.d / 2;
    const cz = dims.h / 2;

    const pT = proj(cam, cx, cy, dims.h);
    const pB = proj(cam, cx, cy, 0);
    const pC0 = proj(cam, 0, 0, cz);
    const pC1 = proj(cam, dims.w, 0, cz);
    const pC2 = proj(cam, dims.w, dims.d, cz);
    const pC3 = proj(cam, 0, dims.d, cz);

    const body = pathOf(hull([pT, pB, pC0, pC1, pC2, pC3]));
    const facet1 = pathOf([pT, pC1, pC2]);
    const facet2 = pathOf([pT, pC2, pC3]);
    const facet3 = pathOf([pB, pC1, pC2]);
    const facet4 = pathOf([pB, pC2, pC3]);

    const [fX, fY] = pC2;
    const bright = pathOf([[fX, fY - 2.2], [fX + 1.8, fY], [fX, fY + 2.2], [fX - 1.8, fY]]);

    return [
        { d: body, kind: 'plate' },
        { d: facet1, kind: 'crease' },
        { d: facet2, kind: 'crease' },
        { d: facet3, kind: 'crease' },
        { d: facet4, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildPolyhedron(cam: Cam, dims: Dims): FigurePart[] {
    const rBot = Math.min(dims.w, dims.d) * 0.22;
    const ringBot = ring(0, 0, dims.w, dims.d, rBot, 4);
    const ptsBot = ringBot.map(([x, y]) => proj(cam, x, y, 0));

    const wTop = dims.w * 0.65;
    const dTop = dims.d * 0.65;
    const xTop = (dims.w - wTop) / 2;
    const yTop = (dims.d - dTop) / 2;
    const rTop = rBot * 0.65;
    const ringTop = ring(xTop, yTop, wTop, dTop, rTop, 4);
    const ptsTop = ringTop.map(([x, y]) => proj(cam, x, y, dims.h));

    const bright = discY(cam, dims.w * 0.65, dims.d * 0.82, dims.h - 0.8, 0.7, 10);

    return [
        { d: pathOf(hull([...ptsBot, ...ptsTop])), kind: 'plate' },
        { d: pathOf(ptsTop), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Builds the figure parts for one of the eight geometry families in the hairline style.
 * Parts are ordered back-to-front and painted in that order.
 */
export function buildFamilyFigure(
    family: Geometry,
    isMirror: boolean,
    rawDims: Dims | null,
): FigurePart[] {
    const fallback = DEFAULTS[family] ?? DEFAULTS.box;
    const dims = normalizeDims(rawDims, fallback);
    const cam = centeredCam(dims);

    switch (family) {
        case 'box':
            return buildBox(cam, dims, isMirror);
        case 'cylinder':
            return buildCylinder(cam, dims);
        case 'bowl':
            return buildBowl(cam, dims);
        case 'plate':
            return buildPlate(cam, dims);
        case 'mirror':
            return buildMirror(cam, dims);
        case 'sphere':
            return buildSphere(cam, dims);
        case 'octahedron':
            return buildOctahedron(cam, dims);
        case 'polyhedron':
            return buildPolyhedron(cam, dims);
    }
}
