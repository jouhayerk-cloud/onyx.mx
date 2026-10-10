import type { Dims, FigurePart } from '../types';
import { normalizeDims, centeredCam } from '../types';
import {
    type Cam,
    proj,
    pathOf,
    prism,
    rectY,
    rectX,
} from '../../../welcome/hairline/engine';

export type LampId = 'pendant' | 'table-lamp' | 'floor-lamp' | 'tower-lamp' | 'luminary';

export const LAMP_FIGURE_IDS: readonly string[] = [
    'pendant',
    'table-lamp',
    'floor-lamp',
    'tower-lamp',
    'luminary',
];

/**
 * Sensible default dimensions per lamp canonical Type in cm.
 * Scaled by normalizeDims so the longest side is FIGURE_SIZE (30 world units).
 */
export const DEFAULTS: Record<LampId, Dims> = {
    'pendant':    { w: 24, h: 62, d: 24 },
    'table-lamp': { w: 20, h: 48, d: 20 },
    'floor-lamp': { w: 30, h: 180, d: 30 },
    'tower-lamp': { w: 30, h: 100, d: 30 },
    'luminary':   { w: 58, h: 180, d: 10 },
};

// ── local geometric helpers ───────────────────────────────────────────────────

/** Standard solid parts: opaque body plate followed by its top crease. */
function solidParts(s: { body: string; crease: string }): FigurePart[] {
    return [
        { d: s.body, kind: 'plate' },
        { d: s.crease, kind: 'crease' },
    ];
}

// ── lamp builders (back to front, exactly 1 bright mark, <= 14 paths) ────────

function buildPendant(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const capH = Math.max(0.8, h * 0.04);
    const capW = Math.max(2.5, w * 0.28);
    const capD = Math.max(2.5, d * 0.28);
    const cap = prism(cam, cx - capW / 2, cy - capD / 2, h - capH, capW, capD, capH, Math.min(capW, capD) / 2);

    const shadeH = h * 0.46;
    const sw = w * 0.88;
    const sd = d * 0.88;
    const shade = prism(cam, cx - sw / 2, cy - sd / 2, 0, sw, sd, shadeH, Math.min(sw, sd) / 2);

    const cord = pathOf([proj(cam, cx, cy, h - capH), proj(cam, cx, cy, shadeH)], false);

    const slotW = sw * 0.40;
    const sz0 = Math.max(0.6, shadeH * 0.08);
    const sz1 = sz0 + Math.max(1.0, shadeH * 0.14);
    const slot = rectY(cam, cy + sd / 2, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.70;
    const lit = rectY(cam, cy + sd / 2, cx - litW / 2, cx + litW / 2, sz0 + 0.25, sz1 - 0.25);

    return [
        ...solidParts(cap),
        { d: cord, kind: 'crease' },
        ...solidParts(shade),
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildTableLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.07);
    const bw = w * 0.65;
    const bd = d * 0.65;
    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, Math.min(bw, bd) * 0.3);

    const shadeZ0 = h * 0.36;
    const stemW = Math.max(1.6, w * 0.12);
    const stemD = Math.max(1.6, d * 0.12);
    const stem = prism(cam, cx - stemW / 2, cy - stemD / 2, baseH, stemW, stemD, shadeZ0 - baseH, Math.min(stemW, stemD) / 2);

    const sw = w * 0.85;
    const sd = d * 0.85;
    const shadeH = h - shadeZ0;
    const shade = prism(cam, cx - sw / 2, cy - sd / 2, shadeZ0, sw, sd, shadeH, Math.min(sw, sd) * 0.35);

    const slotW = sw * 0.26;
    const sz0 = shadeZ0 + shadeH * 0.18;
    const sz1 = shadeZ0 + shadeH * 0.82;
    const slot = rectY(cam, cy + sd / 2, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.45;
    const lit = rectY(cam, cy + sd / 2, cx - litW / 2, cx + litW / 2, sz0 + 0.5, sz1 - 0.5);

    return [
        ...solidParts(base),
        ...solidParts(stem),
        ...solidParts(shade),
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildFloorLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(0.7, h * 0.02);
    const base = prism(cam, cx - w / 2, cy - d / 2, 0, w, d, baseH, 0.3);

    const headH = h * 0.16;
    const headZ0 = h - headH;
    const colW = w * 0.62;
    const colD = d * 0.62;
    const column = prism(cam, cx - colW / 2, cy - colD / 2, baseH, colW, colD, headZ0 - baseH, 0.25);

    const hw = w * 0.88;
    const hd = d * 0.88;
    const head = prism(cam, cx - hw / 2, cy - hd / 2, headZ0, hw, hd, headH, 0.35);

    const slotW = hw * 0.28;
    const sz0 = headZ0 + headH * 0.14;
    const sz1 = headZ0 + headH * 0.86;
    const slot = rectY(cam, cy + hd / 2, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.45;
    const lit = rectY(cam, cy + hd / 2, cx - litW / 2, cx + litW / 2, sz0 + 0.3, sz1 - 0.3);

    return [
        ...solidParts(base),
        ...solidParts(column),
        ...solidParts(head),
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildTowerLamp(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const plinthH = Math.max(1.0, h * 0.04);
    const plinth = prism(cam, cx - w / 2, cy - d / 2, 0, w, d, plinthH, 0.4);

    const tw = w * 0.82;
    const td = d * 0.82;
    const tx0 = cx - tw / 2;
    const tx1 = cx + tw / 2;
    const ty0 = cy - td / 2;
    const ty1 = cy + td / 2;
    const tower = prism(cam, tx0, ty0, plinthH, tw, td, h - plinthH, 0.4);

    const sz0 = plinthH + (h - plinthH) * 0.10;
    const sz1 = plinthH + (h - plinthH) * 0.90;
    const slitW = Math.max(1.0, tw * 0.20);
    const slitLitW = slitW * 0.45;

    const slotX = rectX(cam, tx1, cy - slitW / 2, cy + slitW / 2, sz0, sz1);
    const litX = rectX(cam, tx1, cy - slitLitW / 2, cy + slitLitW / 2, sz0 + 0.4, sz1 - 0.4);

    const slotY = rectY(cam, ty1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);
    const litY = rectY(cam, ty1, cx - slitLitW / 2, cx + slitLitW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        ...solidParts(plinth),
        ...solidParts(tower),
        { d: slotX, kind: 'slot' },
        { d: litX, kind: 'mark' },
        { d: slotY, kind: 'slot' },
        { d: litY, kind: 'bright' },
    ];
}

function buildLuminary(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;

    const slab = prism(cam, 0, 0, 0, w, d, h, 0.5);

    const frameX = w * 0.08;
    const frameZ = h * 0.05;
    const face = rectY(cam, d, frameX, w - frameX, frameZ, h - frameZ);

    const bandX0 = w * 0.22;
    const bandX1 = w * 0.78;
    const bandZ0 = h * 0.10;
    const bandZ1 = h * 0.90;
    const slot = rectY(cam, d, bandX0, bandX1, bandZ0, bandZ1);
    const band = rectY(cam, d, bandX0 + 0.35, bandX1 - 0.35, bandZ0 + 0.35, bandZ1 - 0.35);

    const coreW = (bandX1 - bandX0) * 0.28;
    const core = rectY(cam, d, w / 2 - coreW / 2, w / 2 + coreW / 2, bandZ0 + 1.2, bandZ1 - 1.2);

    return [
        ...solidParts(slab),
        { d: face, kind: 'face' },
        { d: slot, kind: 'slot' },
        { d: band, kind: 'mark' },
        { d: core, kind: 'bright' },
    ];
}

// ── public entry point ────────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for one of the canonical lamp Types.
 * Returns FigurePart[] ordered back to front for supported lamp ids, or null for any other id.
 */
export function buildLampFigure(id: string, rawDims: Dims | null, _holes?: number): FigurePart[] | null {
    if (!id || !LAMP_FIGURE_IDS.includes(id)) return null;
    const key = id as LampId;
    const dims = normalizeDims(rawDims, DEFAULTS[key]);
    const cam = centeredCam(dims);

    switch (key) {
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
        default:
            return null;
    }
}
