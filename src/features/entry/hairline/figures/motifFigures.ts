import { type Motif, type Dims, type FigurePart, normalizeDims, centeredCam } from '../types';
import { proj, pathOf, hull, ring, prism, rectY, discY, type Cam, type P2 } from '../../../welcome/hairline/engine';

/** Sensible default dimensions in cm per motif. */
const DEFAULTS: Record<Motif, Dims> = {
    'pendant':    { w: 30, h: 65, d: 30 },
    'table-lamp': { w: 32, h: 52, d: 32 },
    'tower-lamp': { w: 24, h: 110, d: 24 },
    'floor-lamp': { w: 42, h: 150, d: 42 },
    'wall-panel': { w: 80, h: 100, d: 6.5 },
    'wine-rack':  { w: 48, h: 64, d: 24 },
    'table':      { w: 100, h: 75, d: 60 },
    'canoe':      { w: 90, h: 22, d: 28 },
    'fountain':   { w: 70, h: 85, d: 70 },
};

// ── small local geometric helpers ───────────────────────────────────────────

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

// ── motif builders (under 40 lines each, back to front, 1 bright mark) ─────

function buildPendant(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const bw = w * 0.7;
    const bd = d * 0.7;
    const bodyH = h * 0.48;
    const capW = Math.max(2.5, bw * 0.25);
    const capD = Math.max(2.5, bd * 0.25);

    const cord = pathOf([proj(cam, cx, cy, bodyH), proj(cam, cx, cy, h)], false);
    const capPts = ring(cx - capW / 2, cy - capD / 2, capW, capD, Math.min(capW, capD) / 2)
        .map(([x, y]) => proj(cam, x, y, h));
    const body = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, bodyH, Math.min(bw, bd) / 2);

    return [
        { d: cord, kind: 'crease' },
        { d: pathOf(capPts), kind: 'bright' },
        ...solidParts(body),
    ];
}

function buildTableLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const baseH = h * 0.35;
    const bw = w * 0.65;
    const bd = d * 0.65;
    const neckH = h * 0.15;
    const nw = Math.max(2.5, bw * 0.2);
    const nd = Math.max(2.5, bd * 0.2);
    const shadeZ0 = baseH + neckH;
    const shadeZ1 = h - 1.5;

    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, Math.min(bw, bd) * 0.25);
    const neck = prism(cam, cx - nw / 2, cy - nd / 2, baseH, nw, nd, neckH, Math.min(nw, nd) / 2);
    const sw0 = w * 0.9;
    const sd0 = d * 0.9;
    const sw1 = w * 0.55;
    const sd1 = d * 0.55;
    const bRing = ring(cx - sw0 / 2, cy - sd0 / 2, sw0, sd0, Math.min(sw0, sd0) / 2);
    const tRing = ring(cx - sw1 / 2, cy - sd1 / 2, sw1, sd1, Math.min(sw1, sd1) / 2);
    const shade = loft(cam, bRing, shadeZ0, tRing, shadeZ1);

    const fw = Math.max(2, sw1 * 0.22);
    const fd = Math.max(2, sd1 * 0.22);
    const finialPts = ring(cx - fw / 2, cy - fd / 2, fw, fd, Math.min(fw, fd) / 2)
        .map(([x, y]) => proj(cam, x, y, h));

    return [
        ...solidParts(base),
        ...solidParts(neck),
        ...solidParts(shade),
        { d: pathOf(finialPts), kind: 'bright' },
    ];
}

function buildTowerLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const baseH = Math.max(1, h * 0.04);
    const bw = w * 0.9;
    const bd = d * 0.9;
    const tw = w * 0.55;
    const td = d * 0.55;
    const tx0 = cx - tw / 2;
    const ty0 = cy - td / 2;

    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, 0.8);
    const tower = prism(cam, tx0, ty0, baseH, tw, td, h - baseH, 0.6);

    const frontY = ty0 + td;
    const slotW = tw * 0.32;
    const sz0 = baseH + (h - baseH) * 0.08;
    const sz1 = h - (h - baseH) * 0.08;
    const slot = rectY(cam, frontY, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.35;
    const lit = rectY(cam, frontY, cx - litW / 2, cx + litW / 2, sz0 + 0.6, sz1 - 0.6);

    return [
        ...solidParts(base),
        ...solidParts(tower),
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildFloorLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const baseH = Math.max(1, h * 0.03);
    const bw = w * 0.85;
    const bd = d * 0.85;
    const pw = Math.max(2, w * 0.08);
    const pd = Math.max(2, d * 0.08);
    const shadeZ0 = h * 0.72;
    const shadeZ1 = h - 1.5;

    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, Math.min(bw, bd) / 2);
    const pole = prism(cam, cx - pw / 2, cy - pd / 2, baseH, pw, pd, shadeZ0 - baseH, Math.min(pw, pd) / 2);

    const sw0 = w * 0.8;
    const sd0 = d * 0.8;
    const sw1 = w * 0.5;
    const sd1 = d * 0.5;
    const bRing = ring(cx - sw0 / 2, cy - sd0 / 2, sw0, sd0, Math.min(sw0, sd0) / 2);
    const tRing = ring(cx - sw1 / 2, cy - sd1 / 2, sw1, sd1, Math.min(sw1, sd1) / 2);
    const shade = loft(cam, bRing, shadeZ0, tRing, shadeZ1);

    const fw = Math.max(2, sw1 * 0.25);
    const fd = Math.max(2, sd1 * 0.25);
    const finialPts = ring(cx - fw / 2, cy - fd / 2, fw, fd, Math.min(fw, fd) / 2)
        .map(([x, y]) => proj(cam, x, y, h));

    return [
        ...solidParts(base),
        ...solidParts(pole),
        ...solidParts(shade),
        { d: pathOf(finialPts), kind: 'bright' },
    ];
}

function buildWallPanel(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const slab = prism(cam, 0, 0, 0, w, d, h, 0.8);

    const insetX = w * 0.08;
    const insetZ = h * 0.08;
    const face = rectY(cam, d, insetX, w - insetX, insetZ, h - insetZ);

    const barW = w * 0.38;
    const barH = h * 0.07;
    const gap = h * 0.06;
    const barX0 = (w - barW) / 2;
    const barX1 = barX0 + barW;
    const startZ = (h - (3 * barH + 2 * gap)) / 2;

    const b0 = rectY(cam, d, barX0, barX1, startZ, startZ + barH);
    const b1 = rectY(cam, d, barX0, barX1, startZ + barH + gap, startZ + 2 * barH + gap);
    const b2 = rectY(cam, d, barX0, barX1, startZ + 2 * (barH + gap), startZ + 3 * barH + 2 * gap);

    return [
        ...solidParts(slab),
        { d: face, kind: 'face' },
        { d: b0, kind: 'mark' },
        { d: b1, kind: 'mark' },
        { d: b2, kind: 'bright' },
    ];
}

function buildWineRack(cam: Cam, dims: Dims, holes?: number): FigurePart[] {
    const { w, h, d } = dims;
    const box = prism(cam, 0, 0, 0, w, d, h, 0.8);
    const count = Math.min(12, Math.max(1, holes ?? 6));

    let rows = 2;
    if (count <= 3) rows = 1;
    else if (count >= 7) rows = 3;
    const cols = Math.ceil(count / rows);

    const cellW = w / cols;
    const cellH = h / rows;
    const rHole = Math.min(cellW, cellH) * 0.32;

    const slotParts: FigurePart[] = [];
    let brightPart: FigurePart | null = null;

    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const hx = (c + 0.5) * cellW;
        const hz = h - (r + 0.5) * cellH;
        slotParts.push({ d: discY(cam, hx, d, hz, rHole), kind: 'slot' });
        if (i === 0) {
            brightPart = { d: discY(cam, hx, d, hz, rHole * 0.55), kind: 'bright' };
        }
    }

    return [
        ...solidParts(box),
        ...slotParts,
        brightPart!,
    ];
}

function buildTable(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const slabH = Math.max(1.5, h * 0.08);
    const legH = h - slabH;
    const lw = Math.max(2, w * 0.08);
    const ld = Math.max(2, d * 0.08);
    const ix = w * 0.06;
    const iy = d * 0.06;

    const bl = prism(cam, ix, iy, 0, lw, ld, legH, 0.4);
    const br = prism(cam, w - ix - lw, iy, 0, lw, ld, legH, 0.4);
    const top = prism(cam, 0, 0, legH, w, d, slabH, 1.2);
    const fl = prism(cam, ix, d - iy - ld, 0, lw, ld, legH, 0.4);
    const fr = prism(cam, w - ix - lw, d - iy - ld, 0, lw, ld, legH, 0.4);

    const ferruleH = Math.min(2, legH * 0.15);
    const ferrule = prism(cam, w - ix - lw, d - iy - ld, 0, lw, ld, ferruleH, 0.4);

    return [
        { d: bl.body, kind: 'plate' },
        { d: br.body, kind: 'plate' },
        ...solidParts(top),
        ...solidParts(fl),
        ...solidParts(fr),
        { d: ferrule.body, kind: 'bright' },
    ];
}

function buildCanoe(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const bw = w * 0.72;
    const bd = d * 0.45;
    const tw = w * 0.96;
    const td = d * 0.85;

    const bRing = ring((w - bw) / 2, (d - bd) / 2, bw, bd, bd / 2);
    const tRing = ring((w - tw) / 2, (d - td) / 2, tw, td, td / 2);
    const hullLoft = loft(cam, bRing, 0, tRing, h);

    const iw = tw * 0.88;
    const id = td * 0.65;
    const innerRing = ring((w - iw) / 2, (d - id) / 2, iw, id, id / 2);
    const innerCrease = pathOf(innerRing.map(([x, y]) => proj(cam, x, y, h)));

    const twW = Math.max(1.2, w * 0.035);
    const iy0 = (d - id) / 2;
    const thwartPts = [
        proj(cam, w / 2 - twW / 2, iy0, h),
        proj(cam, w / 2 + twW / 2, iy0, h),
        proj(cam, w / 2 + twW / 2, iy0 + id, h),
        proj(cam, w / 2 - twW / 2, iy0 + id, h),
    ];

    return [
        { d: hullLoft.body, kind: 'plate' },
        { d: hullLoft.crease, kind: 'crease' },
        { d: innerCrease, kind: 'crease' },
        { d: pathOf(thwartPts), kind: 'bright' },
    ];
}

function buildFountain(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const t1H = h * 0.2;
    const c1H = h * 0.1;
    const t2H = h * 0.18;
    const c2H = h * 0.1;
    const t3H = h * 0.16;

    const c1Top = t1H + c1H;
    const t2Top = c1Top + t2H;
    const c2Top = t2Top + c2H;
    const t3Top = c2Top + t3H;

    const w1 = w * 0.95;
    const d1 = d * 0.95;
    const p1 = prism(cam, cx - w1 / 2, cy - d1 / 2, 0, w1, d1, t1H, Math.min(w1, d1) * 0.35);

    const cw1 = w * 0.22;
    const cd1 = d * 0.22;
    const pc1 = prism(cam, cx - cw1 / 2, cy - cd1 / 2, t1H, cw1, cd1, c1H, Math.min(cw1, cd1) / 2);

    const w2 = w * 0.68;
    const d2 = d * 0.68;
    const p2 = prism(cam, cx - w2 / 2, cy - d2 / 2, c1Top, w2, d2, t2H, Math.min(w2, d2) * 0.35);

    const cw2 = w * 0.16;
    const cd2 = d * 0.16;
    const pc2 = prism(cam, cx - cw2 / 2, cy - cd2 / 2, t2Top, cw2, cd2, c2H, Math.min(cw2, cd2) / 2);

    const w3 = w * 0.42;
    const d3 = d * 0.42;
    const p3 = prism(cam, cx - w3 / 2, cy - d3 / 2, c2Top, w3, d3, t3H, Math.min(w3, d3) * 0.35);

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

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for a known Type motif.
 * Returns null only for an unknown motif.
 */
export function buildMotifFigure(motif: Motif, rawDims: Dims | null, holes?: number): FigurePart[] | null {
    if (!motif || !(motif in DEFAULTS)) return null;
    const dims = normalizeDims(rawDims, DEFAULTS[motif]);
    const cam = centeredCam(dims);

    switch (motif) {
        case 'pendant':
            return buildPendant(cam, dims);
        case 'table-lamp':
            return buildTableLamp(cam, dims);
        case 'tower-lamp':
            return buildTowerLamp(cam, dims);
        case 'floor-lamp':
            return buildFloorLamp(cam, dims);
        case 'wall-panel':
            return buildWallPanel(cam, dims);
        case 'wine-rack':
            return buildWineRack(cam, dims, holes);
        case 'table':
            return buildTable(cam, dims);
        case 'canoe':
            return buildCanoe(cam, dims);
        case 'fountain':
            return buildFountain(cam, dims);
        default:
            return null;
    }
}
