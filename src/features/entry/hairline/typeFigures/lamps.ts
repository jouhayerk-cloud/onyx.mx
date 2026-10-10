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

export type LampVariant = 'cylinder' | 'squared';

const CYLINDER_WORDS = new Set([
    'cylinder',
    'cylindrical',
    'round',
    'circular',
    'cilindro',
    'cilindrico',
    'redondo',
    'redonda',
]);

const SQUARED_WORDS = new Set([
    'squared',
    'square',
    'cube',
    'cubed',
    'cubo',
    'rectangular',
    'rectangle',
    'cuadrado',
    'cuadrada',
    'tower',
]);

function cleanWord(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * Classify a shape descriptor or optional type id into 'cylinder' or 'squared'.
 * Case- and accent-insensitive. Defaults to 'cylinder'.
 */
export function lampVariantOf(shape: string | null | undefined, id?: string): LampVariant {
    const check = (raw: string | null | undefined): LampVariant | null => {
        if (!raw) return null;
        const s = cleanWord(raw);
        if (!s) return null;
        if (SQUARED_WORDS.has(s)) return 'squared';
        if (CYLINDER_WORDS.has(s)) return 'cylinder';

        const tokens = s.split(/[\s_\-/]+/);
        for (const t of tokens) {
            if (SQUARED_WORDS.has(t)) return 'squared';
            if (CYLINDER_WORDS.has(t)) return 'cylinder';
        }
        return null;
    };

    return check(shape) ?? check(id) ?? 'cylinder';
}

/**
 * Sensible default dimensions per lamp canonical Type in cm.
 * Scaled by normalizeDims so the longest side is FIGURE_SIZE (30 world units).
 */
export const DEFAULTS: Record<LampId, Dims> = {
    'pendant':    { w: 10, h: 32, d: 10 },
    'table-lamp': { w: 15, h: 42, d: 15 },
    'floor-lamp': { w: 30, h: 180, d: 30 },
    'tower-lamp': { w: 30, h: 100, d: 30 },
    'luminary':   { w: 58, h: 180, d: 10 },
};

export const VARIANT_DEFAULTS: Record<'pendant' | 'table-lamp', Record<LampVariant, Dims>> = {
    'pendant': {
        cylinder: { w: 10, h: 32, d: 10 },
        squared:  { w: 12, h: 30, d: 12 },
    },
    'table-lamp': {
        cylinder: { w: 15, h: 42, d: 15 },
        squared:  { w: 15, h: 40, d: 15 },
    },
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

function buildPendantSquared(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const capH = Math.max(0.8, h * 0.04);
    const capW = Math.max(2.5, w * 0.28);
    const capD = Math.max(2.5, d * 0.28);
    const cap = prism(cam, cx - capW / 2, cy - capD / 2, h - capH, capW, capD, capH, Math.min(capW, capD) / 2);

    const bodyH = h * 0.50;
    const bw = w * 0.86;
    const bd = d * 0.86;
    const bx0 = cx - bw / 2;
    const by0 = cy - bd / 2;
    const bx1 = cx + bw / 2;
    const by1 = cy + bd / 2;
    const post = prism(cam, bx0, by0, 0, bw, bd, bodyH, 0.35);

    const cord = pathOf([proj(cam, cx, cy, h - capH), proj(cam, cx, cy, bodyH)], false);

    // Inset square opening on top around where the cord enters
    const topInset = Math.min(bw, bd) * 0.20;
    const tox0 = bx0 + topInset;
    const tox1 = bx1 - topInset;
    const toy0 = by0 + topInset;
    const toy1 = by1 - topInset;
    const topSlot = pathOf([
        proj(cam, tox0, toy0, bodyH),
        proj(cam, tox1, toy0, bodyH),
        proj(cam, tox1, toy1, bodyH),
        proj(cam, tox0, toy1, bodyH),
    ], true);

    // Veins as 3 irregular zig zag crease paths on the two visible faces (+y and +x)
    const v1 = pathOf([
        proj(cam, bx0 + bw * 0.30, by1, bodyH * 0.88),
        proj(cam, bx0 + bw * 0.46, by1, bodyH * 0.64),
        proj(cam, bx0 + bw * 0.34, by1, bodyH * 0.40),
        proj(cam, bx0 + bw * 0.50, by1, bodyH * 0.16),
    ], false);

    const v2 = pathOf([
        proj(cam, bx1, by0 + bd * 0.38, bodyH * 0.84),
        proj(cam, bx1, by0 + bd * 0.22, bodyH * 0.58),
        proj(cam, bx1, by0 + bd * 0.40, bodyH * 0.34),
        proj(cam, bx1, by0 + bd * 0.26, bodyH * 0.12),
    ], false);

    const v3 = pathOf([
        proj(cam, bx0 + bw * 0.72, by1, bodyH * 0.80),
        proj(cam, bx0 + bw * 0.84, by1, bodyH * 0.52),
        proj(cam, bx0 + bw * 0.68, by1, bodyH * 0.30),
        proj(cam, bx0 + bw * 0.78, by1, bodyH * 0.08),
    ], false);

    // Strata bands as faint horizontal creases wrapping around corner (bx1, by1)
    const str1 = pathOf([
        proj(cam, bx0 + bw * 0.08, by1, bodyH * 0.36),
        proj(cam, bx1, by1, bodyH * 0.36),
        proj(cam, bx1, by0 + bd * 0.10, bodyH * 0.36),
    ], false);

    const str2 = pathOf([
        proj(cam, bx0 + bw * 0.12, by1, bodyH * 0.70),
        proj(cam, bx1, by1, bodyH * 0.70),
        proj(cam, bx1, by0 + bd * 0.08, bodyH * 0.70),
    ], false);

    // Light shines out of the open bottom
    const slotW = bw * 0.40;
    const sz0 = Math.max(0.6, bodyH * 0.08);
    const sz1 = sz0 + Math.max(1.0, bodyH * 0.14);
    const slot = rectY(cam, by1, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.70;
    const lit = rectY(cam, by1, cx - litW / 2, cx + litW / 2, sz0 + 0.25, sz1 - 0.25);

    return [
        ...solidParts(cap),
        { d: cord, kind: 'crease' },
        ...solidParts(post),
        { d: topSlot, kind: 'slot' },
        { d: v1, kind: 'crease' },
        { d: v2, kind: 'crease' },
        { d: v3, kind: 'crease' },
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildTableLampSquared(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const maxDim = Math.max(w, h, d);
    const minDim = Math.min(w, h, d);
    const isCube = (maxDim - minDim) / maxDim <= 0.25;

    const bw = isCube ? Math.min(w, d) * 0.85 : w * 0.82;
    const bd = isCube ? bw : d * 0.82;
    const bh = isCube ? bw : h;

    const bx0 = cx - bw / 2;
    const by0 = cy - bd / 2;
    const bx1 = cx + bw / 2;
    const by1 = cy + bd / 2;

    // Thin power cord leaving the foot on table plane z = 0
    const cord = pathOf([
        proj(cam, bx1 - 0.5, by0 + bd * 0.25, 0),
        proj(cam, bx1 + 3.0, by0 - 1.5, 0),
        proj(cam, bx1 + 6.0, by0 - 0.5, 0),
        proj(cam, bx1 + 9.0, by0 - 2.0, 0),
    ], false);

    const post = prism(cam, bx0, by0, 0, bw, bd, bh, 0.35);

    // Open top with an inset square opening and the bright glow mark inside
    const inset = Math.min(bw, bd) * 0.20;
    const tox0 = bx0 + inset;
    const tox1 = bx1 - inset;
    const toy0 = by0 + inset;
    const toy1 = by1 - inset;
    const topSlot = pathOf([
        proj(cam, tox0, toy0, bh),
        proj(cam, tox1, toy0, bh),
        proj(cam, tox1, toy1, bh),
        proj(cam, tox0, toy1, bh),
    ], true);

    const glowInset = inset + Math.min(bw, bd) * 0.12;
    const gx0 = bx0 + glowInset;
    const gx1 = bx1 - glowInset;
    const gy0 = by0 + glowInset;
    const gy1 = by1 - glowInset;
    const lit = pathOf([
        proj(cam, gx0, gy0, bh),
        proj(cam, gx1, gy0, bh),
        proj(cam, gx1, gy1, bh),
        proj(cam, gx0, gy1, bh),
    ], true);

    // Veins as 3 irregular zig zag crease paths on the two visible faces (+y and +x)
    const v1 = pathOf([
        proj(cam, bx0 + bw * 0.28, by1, bh * 0.86),
        proj(cam, bx0 + bw * 0.44, by1, bh * 0.62),
        proj(cam, bx0 + bw * 0.32, by1, bh * 0.40),
        proj(cam, bx0 + bw * 0.50, by1, bh * 0.16),
    ], false);

    const v2 = pathOf([
        proj(cam, bx1, by0 + bd * 0.36, bh * 0.82),
        proj(cam, bx1, by0 + bd * 0.20, bh * 0.56),
        proj(cam, bx1, by0 + bd * 0.38, bh * 0.34),
        proj(cam, bx1, by0 + bd * 0.24, bh * 0.12),
    ], false);

    const v3 = pathOf([
        proj(cam, bx0 + bw * 0.70, by1, bh * 0.78),
        proj(cam, bx0 + bw * 0.82, by1, bh * 0.52),
        proj(cam, bx0 + bw * 0.66, by1, bh * 0.30),
        proj(cam, bx0 + bw * 0.76, by1, bh * 0.10),
    ], false);

    // Strata bands as faint horizontal creases wrapping around corner (bx1, by1)
    const str1 = pathOf([
        proj(cam, bx0 + bw * 0.08, by1, bh * 0.36),
        proj(cam, bx1, by1, bh * 0.36),
        proj(cam, bx1, by0 + bd * 0.10, bh * 0.36),
    ], false);

    const str2 = pathOf([
        proj(cam, bx0 + bw * 0.12, by1, bh * 0.68),
        proj(cam, bx1, by1, bh * 0.68),
        proj(cam, bx1, by0 + bd * 0.08, bh * 0.68),
    ], false);

    return [
        { d: cord, kind: 'crease' },
        ...solidParts(post),
        { d: topSlot, kind: 'slot' },
        { d: lit, kind: 'bright' },
        { d: v1, kind: 'crease' },
        { d: v2, kind: 'crease' },
        { d: v3, kind: 'crease' },
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
    ];
}

function defaultDimsFor(key: LampId, variant: LampVariant): Dims {
    if (key === 'pendant') {
        return variant === 'squared' ? { w: 12, h: 30, d: 12 } : { w: 10, h: 32, d: 10 };
    }
    if (key === 'table-lamp') {
        return variant === 'squared' ? { w: 15, h: 40, d: 15 } : { w: 15, h: 42, d: 15 };
    }
    return DEFAULTS[key];
}

// ── public entry point ────────────────────────────────────────────────────────

/**
 * Draw the hairline figure parts for one of the canonical lamp Types.
 * Returns FigurePart[] ordered back to front for supported lamp ids, or null for any other id.
 */
export function buildLampFigure(
    id: string,
    rawDims: Dims | null,
    _holes?: number,
    variant?: string | null,
): FigurePart[] | null {
    if (!id || !LAMP_FIGURE_IDS.includes(id)) return null;
    const key = id as LampId;
    const resolvedVariant = lampVariantOf(variant);
    const dims = normalizeDims(rawDims, defaultDimsFor(key, resolvedVariant));
    const cam = centeredCam(dims);

    switch (key) {
        case 'pendant':
            return resolvedVariant === 'squared'
                ? buildPendantSquared(cam, dims)
                : buildPendant(cam, dims);
        case 'table-lamp':
            return resolvedVariant === 'squared'
                ? buildTableLampSquared(cam, dims)
                : buildTableLamp(cam, dims);
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
