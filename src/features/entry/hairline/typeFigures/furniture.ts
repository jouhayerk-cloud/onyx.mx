import { type Dims, type FigurePart, normalizeDims, centeredCam } from '../types';
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

/** Sensible median inventory dimensions in cm per canonical Type. */
export const DEFAULTS: Record<string, Dims> = {
    'pendant':            { w: 30, h: 65, d: 30 },
    'table-lamp':         { w: 32, h: 52, d: 32 },
    'floor-lamp':         { w: 42, h: 150, d: 42 },
    'tower-lamp':         { w: 24, h: 110, d: 24 },
    'luminary':           { w: 18, h: 26, d: 18 },
    'bowl':               { w: 36, h: 14, d: 24 },
    'canoe':              { w: 90, h: 22, d: 28 },
    'plate':              { w: 30, h: 3, d: 30 },
    'basin':              { w: 46, h: 16, d: 38 },
    'rock':               { w: 35, h: 28, d: 30 },
    'fountain':           { w: 70, h: 85, d: 70 },
    'sculpture':          { w: 28, h: 62, d: 24 },
    'pillar':             { w: 32, h: 90, d: 32 },
    'ball':               { w: 24, h: 26, d: 24 },
    'bag':                { w: 28, h: 32, d: 14 },
    'wall-panel':         { w: 140, h: 250, d: 10 },
    'painted-wall-panel': { w: 210, h: 75, d: 10 },
    'mirror':             { w: 80, h: 120, d: 8 },
    'wine-rack':          { w: 32, h: 32, d: 15 },
    'table':              { w: 96, h: 50, d: 96 },
    'couch':              { w: 210, h: 75, d: 210 },
    'bar':                { w: 180, h: 105, d: 140 },
};

/** Canonical Type ids handled by the furniture hairline figure renderer. */
export const FURNITURE_FIGURE_IDS: readonly string[] = [
    'pendant',
    'table-lamp',
    'floor-lamp',
    'tower-lamp',
    'luminary',
    'bowl',
    'canoe',
    'plate',
    'basin',
    'rock',
    'fountain',
    'sculpture',
    'pillar',
    'ball',
    'bag',
    'wall-panel',
    'painted-wall-panel',
    'mirror',
    'wine-rack',
    'table',
    'couch',
    'bar',
] as const;

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

// ── figure builders (under 60 lines each, back to front, 1 bright mark) ──────

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

function buildLuminary(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const r = Math.min(w, d) * 0.28;
    const body = prism(cam, 0, 0, 0, w, d, h, r);

    const iw = w * 0.72;
    const id = d * 0.72;
    const innerPts = ring((w - iw) / 2, (d - id) / 2, iw, id, r * 0.72, 6)
        .map(([x, y]) => proj(cam, x, y, h));

    const winW = w * 0.44;
    const winZ0 = h * 0.22;
    const winZ1 = h * 0.72;
    const win = rectY(cam, d, (w - winW) / 2, (w + winW) / 2, winZ0, winZ1);

    const cx = w / 2;
    const flameH = (winZ1 - winZ0) * 0.42;
    const flameBase = winZ0 + (winZ1 - winZ0) * 0.15;
    const flamePts: P2[] = [
        proj(cam, cx, d, flameBase + flameH),
        proj(cam, cx + winW * 0.18, d, flameBase + flameH * 0.4),
        proj(cam, cx + winW * 0.1, d, flameBase),
        proj(cam, cx - winW * 0.1, d, flameBase),
        proj(cam, cx - winW * 0.18, d, flameBase + flameH * 0.4),
    ];
    const flame = pathOf(hull(flamePts));

    return [
        ...solidParts(body),
        { d: pathOf(innerPts), kind: 'crease' },
        { d: win, kind: 'slot' },
        { d: flame, kind: 'bright' },
    ];
}

function buildBowl(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const bw = w * 0.55;
    const bd = d * 0.55;
    const br = Math.min(bw, bd) / 2;
    const botRing = ring((w - bw) / 2, (d - bd) / 2, bw, bd, br, 6);

    const tr = Math.min(w, d) / 2;
    const topRing = ring(0, 0, w, d, tr, 6);
    const bowlLoft = loft(cam, botRing, 0, topRing, h);

    const iw = w * 0.82;
    const id = d * 0.82;
    const innerRing = ring((w - iw) / 2, (d - id) / 2, iw, id, Math.min(iw, id) / 2, 6);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, h));

    const bright = discY(cam, w / 2, d, h - 0.6, 0.6, 10);

    return [
        { d: bowlLoft.body, kind: 'plate' },
        { d: bowlLoft.crease, kind: 'crease' },
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
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

function buildPlate(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const r = Math.min(w, d) / 2;
    const p = prism(cam, 0, 0, 0, w, d, h, r);

    const iw = w * 0.74;
    const id = d * 0.74;
    const innerRing = ring((w - iw) / 2, (d - id) / 2, iw, id, Math.min(iw, id) / 2, 6);
    const innerPts = innerRing.map(([x, y]) => proj(cam, x, y, h));

    const bright = discY(cam, w / 2, d, h - 0.4, 0.5, 10);

    return [
        ...solidParts(p),
        { d: pathOf(innerPts), kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildBasin(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const bw = w * 0.74;
    const bd = d * 0.74;
    const br = Math.min(bw, bd) * 0.35;
    const bRing = ring((w - bw) / 2, (d - bd) / 2, bw, bd, br, 6);

    const tr = Math.min(w, d) * 0.35;
    const tRing = ring(0, 0, w, d, tr, 6);
    const sinkLoft = loft(cam, bRing, 0, tRing, h);

    const iw = w * 0.84;
    const id = d * 0.84;
    const innerRing = ring((w - iw) / 2, (d - id) / 2, iw, id, tr * 0.84, 6);
    const innerCrease = pathOf(innerRing.map(([x, y]) => proj(cam, x, y, h)));

    const cx = w / 2;
    const cy = d / 2;
    const drainR = Math.min(w, d) * 0.12;
    const drainRing = ring(cx - drainR, cy - drainR, drainR * 2, drainR * 2, drainR, 6);
    const drainSlot = pathOf(drainRing.map(([x, y]) => proj(cam, x, y, h * 0.25)));

    const stopperR = drainR * 0.5;
    const stopperRing = ring(cx - stopperR, cy - stopperR, stopperR * 2, stopperR * 2, stopperR, 6);
    const stopperBright = pathOf(stopperRing.map(([x, y]) => proj(cam, x, y, h * 0.25)));

    return [
        { d: sinkLoft.body, kind: 'plate' },
        { d: sinkLoft.crease, kind: 'crease' },
        { d: innerCrease, kind: 'crease' },
        { d: drainSlot, kind: 'slot' },
        { d: stopperBright, kind: 'bright' },
    ];
}

function buildRock(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const ptsBottom: P2[] = [
        proj(cam, w * 0.15, d * 0.15, 0),
        proj(cam, w * 0.82, d * 0.12, 0),
        proj(cam, w * 0.96, d * 0.62, 0),
        proj(cam, w * 0.72, d * 0.96, 0),
        proj(cam, w * 0.18, d * 0.88, 0),
        proj(cam, w * 0.04, d * 0.44, 0),
    ];
    const peak = proj(cam, w * 0.48, d * 0.42, h);
    const midR = proj(cam, w * 0.82, d * 0.52, h * 0.58);
    const midF = proj(cam, w * 0.34, d * 0.78, h * 0.52);
    const midL = proj(cam, w * 0.16, d * 0.36, h * 0.54);

    const body = pathOf(hull([...ptsBottom, peak, midR, midF, midL]));
    const facet1 = pathOf([peak, midR, ptsBottom[2]], false);
    const facet2 = pathOf([peak, midF, ptsBottom[3]], false);
    const facet3 = pathOf([peak, midL, ptsBottom[4]], false);

    const veinPts: P2[] = [
        proj(cam, w * 0.44, d * 0.62, h * 0.38),
        proj(cam, w * 0.48, d * 0.6, h * 0.44),
        proj(cam, w * 0.45, d * 0.56, h * 0.5),
        proj(cam, w * 0.42, d * 0.58, h * 0.44),
    ];
    const vein = pathOf(hull(veinPts));

    return [
        { d: body, kind: 'plate' },
        { d: facet1, kind: 'crease' },
        { d: facet2, kind: 'crease' },
        { d: facet3, kind: 'crease' },
        { d: vein, kind: 'bright' },
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

function buildSculpture(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const plinthH = Math.max(1.8, h * 0.12);
    const pw = w * 0.78;
    const pd = d * 0.78;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, plinthH, 0.6);

    const mw = w * 0.58;
    const md = d * 0.58;
    const baseR = Math.min(mw, md) * 0.3;
    const bRing = ring(cx - mw / 2, cy - md / 2, mw, md, baseR, 6);

    const tw = Math.max(2, mw * 0.25);
    const td = Math.max(2, md * 0.25);
    const tRing = ring(cx - tw / 2, cy - td / 2, tw, td, Math.min(tw, td) / 2, 4);
    const monolith = loft(cam, bRing, plinthH, tRing, h);

    const holeR = Math.min(mw, md) * 0.2;
    const holeZ = plinthH + (h - plinthH) * 0.45;
    const hole = discY(cam, cx, cy + md * 0.3, holeZ, holeR, 14);

    const tipPts = ring(cx - tw / 2, cy - td / 2, tw, td, Math.min(tw, td) / 2, 4)
        .map(([x, y]) => proj(cam, x, y, h));

    return [
        ...solidParts(plinth),
        { d: monolith.body, kind: 'plate' },
        { d: monolith.crease, kind: 'crease' },
        { d: hole, kind: 'slot' },
        { d: pathOf(tipPts), kind: 'bright' },
    ];
}

function buildPillar(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const baseH = Math.max(1.8, h * 0.12);
    const capH = Math.max(1.8, h * 0.1);
    const shaftH = h - baseH - capH;

    const base = prism(cam, 0, 0, 0, w, d, baseH, 0.6);

    const sw = w * 0.68;
    const sd = d * 0.68;
    const sx0 = cx - sw / 2;
    const sy0 = cy - sd / 2;
    const shaft = prism(cam, sx0, sy0, baseH, sw, sd, shaftH, 0.4);

    const frontY = sy0 + sd;
    const g1 = pathOf([proj(cam, sx0 + sw * 0.32, frontY, baseH + 1), proj(cam, sx0 + sw * 0.32, frontY, baseH + shaftH - 1)], false);
    const g2 = pathOf([proj(cam, sx0 + sw * 0.68, frontY, baseH + 1), proj(cam, sx0 + sw * 0.68, frontY, baseH + shaftH - 1)], false);

    const cap = prism(cam, 0, 0, baseH + shaftH, w, d, capH, 0.6);

    const bright = rectY(cam, d, w * 0.78, w * 0.92, h - capH * 0.8, h - capH * 0.2);

    return [
        ...solidParts(base),
        ...solidParts(shaft),
        { d: g1, kind: 'crease' },
        { d: g2, kind: 'crease' },
        ...solidParts(cap),
        { d: bright, kind: 'bright' },
    ];
}

function buildBall(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;
    const standH = Math.max(1.5, h * 0.12);
    const sw = w * 0.6;
    const sd = d * 0.6;
    const stand = prism(cam, cx - sw / 2, cy - sd / 2, 0, sw, sd, standH, Math.min(sw, sd) / 2);

    const sphereR = Math.min(w, d, h - standH) / 2;
    const cz = standH + sphereR;
    const [scx, scy] = proj(cam, cx, cy, cz);
    const sr = cam.S * sphereR;

    const circlePts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        circlePts.push([scx + sr * Math.cos(a), scy + sr * Math.sin(a)]);
    }

    const eqPts: P2[] = [];
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        eqPts.push(proj(cam, cx + sphereR * Math.cos(a), cy + sphereR * Math.sin(a), cz));
    }

    const hr = Math.max(1.2, sr * 0.1);
    const hx = scx - sr * 0.35;
    const hy = scy - sr * 0.35;
    const hlPts: P2[] = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        hlPts.push([hx + hr * Math.cos(a), hy + hr * Math.sin(a)]);
    }

    return [
        ...solidParts(stand),
        { d: pathOf(hull(circlePts)), kind: 'plate' },
        { d: pathOf(eqPts), kind: 'crease' },
        { d: pathOf(hlPts), kind: 'bright' },
    ];
}

function buildBag(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const bodyH = h * 0.68;

    const handleW = w * 0.44;
    const hx0 = cx - handleW / 2;
    const hx1 = cx + handleW / 2;
    const rearHandlePts: P2[] = [
        proj(cam, hx0, d * 0.28, bodyH * 0.9),
        proj(cam, hx0 + handleW * 0.15, d * 0.28, h),
        proj(cam, hx1 - handleW * 0.15, d * 0.28, h),
        proj(cam, hx1, d * 0.28, bodyH * 0.9),
    ];
    const rearHandle = pathOf(rearHandlePts, false);

    const bRing = ring(0, 0, w, d, Math.min(w, d) * 0.2, 4);
    const tw = w * 0.84;
    const td = d * 0.84;
    const tRing = ring((w - tw) / 2, (d - td) / 2, tw, td, Math.min(tw, td) * 0.2, 4);
    const body = loft(cam, bRing, 0, tRing, bodyH);

    const frontHandlePts: P2[] = [
        proj(cam, hx0, d * 0.78, bodyH * 0.9),
        proj(cam, hx0 + handleW * 0.15, d * 0.78, h),
        proj(cam, hx1 - handleW * 0.15, d * 0.78, h),
        proj(cam, hx1, d * 0.78, bodyH * 0.9),
    ];
    const frontHandle = pathOf(frontHandlePts, false);

    const pW = w * 0.52;
    const pZ0 = bodyH * 0.18;
    const pZ1 = bodyH * 0.7;
    const pocket = rectY(cam, d, cx - pW / 2, cx + pW / 2, pZ0, pZ1);

    const buckle = rectY(cam, d, cx - 1.2, cx + 1.2, bodyH - 1.8, bodyH - 0.2);

    return [
        { d: rearHandle, kind: 'crease' },
        { d: body.body, kind: 'plate' },
        { d: body.crease, kind: 'crease' },
        { d: frontHandle, kind: 'crease' },
        { d: pocket, kind: 'crease' },
        { d: buckle, kind: 'bright' },
    ];
}

function buildWallPanel(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const slab = prism(cam, 0, 0, 0, w, d, h, 0.6);

    const borderX = Math.max(1.5, w * 0.1);
    const borderZ = Math.max(1.8, h * 0.08);
    const face = rectY(cam, d, borderX, w - borderX, borderZ, h - borderZ);

    const grooveParts: FigurePart[] = [];
    for (let i = 1; i <= 3; i++) {
        const gx = borderX + (w - 2 * borderX) * (i / 4);
        const line = pathOf([proj(cam, gx, d, borderZ), proj(cam, gx, d, h - borderZ)], false);
        grooveParts.push({ d: line, kind: 'crease' });
    }

    const bright = rectY(cam, d, w / 2 - 1.2, w / 2 + 1.2, h - borderZ * 0.8, h - borderZ * 0.2);

    return [
        ...solidParts(slab),
        { d: face, kind: 'face' },
        ...grooveParts,
        { d: bright, kind: 'bright' },
    ];
}

function buildPaintedWallPanel(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const slab = prism(cam, 0, 0, 0, w, d, h, 0.6);
    const borderX = Math.max(1.8, w * 0.06);
    const borderZ = Math.max(1.5, h * 0.12);
    const face = rectY(cam, d, borderX, w - borderX, borderZ, h - borderZ);

    const hz = borderZ + (h - 2 * borderZ) * 0.42;
    const wavePts: P2[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = borderX + (w - 2 * borderX) * t;
        const z = hz + Math.sin(t * Math.PI * 2) * (h * 0.12) - Math.cos(t * Math.PI) * (h * 0.06);
        wavePts.push(proj(cam, x, d, z));
    }
    const horizon = pathOf(wavePts, false);

    const sunR = Math.min(1.4, h * 0.1);
    const sun = discY(cam, borderX + (w - 2 * borderX) * 0.75, d, h - borderZ - sunR * 1.8, sunR, 12);

    return [
        ...solidParts(slab),
        { d: face, kind: 'face' },
        { d: horizon, kind: 'crease' },
        { d: sun, kind: 'bright' },
    ];
}

function buildMirror(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const frame = prism(cam, 0, 0, 0, w, d, h, 1.2);
    const borderX = Math.max(1.6, w * 0.12);
    const borderZ = Math.max(1.8, h * 0.12);
    const face = rectY(cam, d, borderX, w - borderX, borderZ, h - borderZ);

    const p0 = proj(cam, borderX + (w - 2 * borderX) * 0.2, d, borderZ + (h - 2 * borderZ) * 0.2);
    const p1 = proj(cam, borderX + (w - 2 * borderX) * 0.8, d, borderZ + (h - 2 * borderZ) * 0.8);
    const sheen = pathOf([p0, p1], false);

    const gleamR = Math.min(1.0, w * 0.05);
    const gleam = discY(cam, borderX + (w - 2 * borderX) * 0.8, d, borderZ + (h - 2 * borderZ) * 0.8, gleamR, 10);

    return [
        ...solidParts(frame),
        { d: face, kind: 'face' },
        { d: sheen, kind: 'crease' },
        { d: gleam, kind: 'bright' },
    ];
}

function buildWineRack(cam: Cam, dims: Dims, holes?: number): FigurePart[] {
    const { w, h, d } = dims;
    const box = prism(cam, 0, 0, 0, w, d, h, 0.8);
    const count = Math.min(21, Math.max(2, holes ?? 6));

    let cols = 3;
    if (count <= 2) cols = count;
    else if (count <= 4) cols = 2;
    else if (count <= 6) cols = 3;
    else if (count <= 8) cols = 4;
    else cols = 5;
    const rows = Math.ceil(count / cols);

    const cellW = w / cols;
    const cellH = h / rows;
    const rHole = Math.min(cellW, cellH) * 0.32;

    const slotHoles: string[] = [];
    let brightPart: FigurePart | null = null;

    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const hx = (c + 0.5) * cellW;
        const hz = h - (r + 0.5) * cellH;
        slotHoles.push(discY(cam, hx, d, hz, rHole, 16));
        if (i === 0) {
            brightPart = { d: discY(cam, hx, d, hz, rHole * 0.52, 12), kind: 'bright' };
        }
    }

    return [
        ...solidParts(box),
        { d: slotHoles.join(''), kind: 'slot' },
        brightPart!,
    ];
}

function buildTable(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const slabH = Math.max(1.8, h * 0.14);
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

    const ferruleH = Math.min(2, legH * 0.18);
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

function buildCouch(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const seatH = h * 0.52;
    const depth = Math.min(w, d) * 0.38;
    const bt = depth * 0.28;

    const backX = prism(cam, 0, 0, 0, w, bt, h, 0.5);
    const backY = prism(cam, 0, bt, 0, bt, d - bt, h, 0.5);

    const cornerSeat = prism(cam, bt, bt, 0, depth - bt, depth - bt, seatH, 0.5);
    const seatX = prism(cam, depth, bt, 0, w - depth, depth - bt, seatH, 0.5);
    const seatY = prism(cam, bt, depth, 0, depth - bt, d - depth, seatH, 0.5);

    const seamX = pathOf([proj(cam, depth, bt, seatH), proj(cam, depth, depth, seatH)], false);
    const seamY = pathOf([proj(cam, bt, depth, seatH), proj(cam, depth, depth, seatH)], false);

    const pw = (depth - bt) * 0.55;
    const pd = (depth - bt) * 0.55;
    const pillow = prism(cam, bt + 0.6, bt + 0.6, seatH, pw, pd, seatH * 0.38, 0.4);

    return [
        ...solidParts(backX),
        ...solidParts(backY),
        ...solidParts(cornerSeat),
        ...solidParts(seatX),
        ...solidParts(seatY),
        { d: seamX, kind: 'crease' },
        { d: seamY, kind: 'crease' },
        { d: pillow.body, kind: 'bright' },
    ];
}

function buildBar(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const topZ = h * 0.9;
    const slabH = h - topZ;
    const cw = d * 0.4;
    const cd = w * 0.38;

    const base2 = prism(cam, 0, 0, 0, cd, d, topZ, 0.4);
    const base1 = prism(cam, cd, 0, 0, w - cd, cw, topZ, 0.4);

    const inset = 1.0;
    const panel1 = rectY(cam, cw, cd + inset, w - inset, 1.2, topZ - 1.2);
    const panel2 = rectX(cam, cd, cw + inset, d - inset, 1.2, topZ - 1.2);

    const rail = pathOf([proj(cam, cd, cw + 0.8, topZ * 0.15), proj(cam, w, cw + 0.8, topZ * 0.15)], false);

    const top2 = prism(cam, 0, 0, topZ, cd + 1.0, d, slabH, 0.5);
    const top1 = prism(cam, cd, 0, topZ, w - cd, cw + 1.0, slabH, 0.5);

    const shakerW = Math.max(1.8, w * 0.06);
    const shakerD = Math.max(1.8, d * 0.06);
    const shakerH = Math.max(2.5, h * 0.18);
    const shaker = prism(cam, w * 0.72, cw * 0.35, h, shakerW, shakerD, shakerH, Math.min(shakerW, shakerD) / 2);

    return [
        ...solidParts(base2),
        ...solidParts(base1),
        { d: panel1, kind: 'face' },
        { d: panel2, kind: 'face' },
        { d: rail, kind: 'crease' },
        ...solidParts(top2),
        ...solidParts(top1),
        { d: shaker.body, kind: 'bright' },
    ];
}

// ── public entry point ──────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for one of the 22 canonical Add Entry furniture/inventory Types.
 * Returns null for any unknown type id.
 */
export function buildFurnitureFigure(
    id: string,
    rawDims: Dims | null,
    holes?: number,
): FigurePart[] | null {
    if (!id || !(id in DEFAULTS)) return null;
    const dims = normalizeDims(rawDims, DEFAULTS[id]);
    const cam = centeredCam(dims);

    switch (id) {
        case 'pendant':
            return buildPendant(cam, dims);
        case 'table-lamp':
            return buildTableLamp(cam, dims);
        case 'floor-lamp':
            return buildFloorLamp(cam, dims);
        case 'tower-lamp':
            return buildTowerLamp(cam, dims);
        case 'luminary':
            return buildLuminary(cam, dims);
        case 'bowl':
            return buildBowl(cam, dims);
        case 'canoe':
            return buildCanoe(cam, dims);
        case 'plate':
            return buildPlate(cam, dims);
        case 'basin':
            return buildBasin(cam, dims);
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
        case 'wall-panel':
            return buildWallPanel(cam, dims);
        case 'painted-wall-panel':
            return buildPaintedWallPanel(cam, dims);
        case 'mirror':
            return buildMirror(cam, dims);
        case 'wine-rack':
            return buildWineRack(cam, dims, holes);
        case 'table':
            return buildTable(cam, dims);
        case 'couch':
            return buildCouch(cam, dims);
        case 'bar':
            return buildBar(cam, dims);
        default:
            return null;
    }
}
