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
import { resolveVariant } from '../variantOptions';

export type LampId = 'pendant' | 'table-lamp' | 'floor-lamp';

export const LAMP_FIGURE_IDS: readonly string[] = [
    'pendant',
    'table-lamp',
    'floor-lamp',
];

export type LampVariant = 'cylinder' | 'squared' | 'cube' | 'rectangular';

export type LampTop = 'open' | 'closed';

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

const CUBE_WORDS = new Set([
    'cube',
    'cubed',
    'cubo',
]);

const RECTANGULAR_WORDS = new Set([
    'rectangular',
    'rectangle',
    'rectangulo',
    'slab',
]);

const SQUARED_WORDS = new Set([
    'squared',
    'square',
    'squares',
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
 * Classify a shape descriptor or optional type id into one of the lamp variants:
 * 'cylinder' | 'squared' | 'cube' | 'rectangular'.
 * Case- and accent-insensitive. Defaults according to Type id or 'cylinder'.
 */
export function lampVariantOf(shape: string | null | undefined, id?: string): LampVariant {
    const raw = cleanWord(shape ?? '');
    if (raw) {
        if (CUBE_WORDS.has(raw)) return 'cube';
        if (RECTANGULAR_WORDS.has(raw)) return 'rectangular';
        if (CYLINDER_WORDS.has(raw)) return 'cylinder';
        if (SQUARED_WORDS.has(raw)) return 'squared';

        const tokens = raw.split(/[\s_\-/]+/);
        for (const t of tokens) {
            if (CUBE_WORDS.has(t)) return 'cube';
            if (RECTANGULAR_WORDS.has(t)) return 'rectangular';
            if (CYLINDER_WORDS.has(t)) return 'cylinder';
            if (SQUARED_WORDS.has(t)) return 'squared';
        }
    }

    if (id === 'pendant') return 'cylinder';
    if (id === 'table-lamp' || id === 'floor-lamp') return 'squared';
    return 'cylinder';
}

/**
 * Normalise top selection to 'open' or 'closed'. Null or unspecified defaults to 'closed'.
 */
export function lampTopOf(top: string | null | undefined): LampTop {
    if (!top) return 'closed';
    const s = cleanWord(top);
    if (s.includes('open') || s.includes('abiert')) return 'open';
    return 'closed';
}

/**
 * Default dimensions per lamp canonical Type in cm (w, h, d).
 */
export const DEFAULTS: Record<LampId, Dims> = {
    'pendant':    { w: 10, h: 32, d: 10 },
    'table-lamp': { w: 15, h: 42, d: 15 },
    'floor-lamp': { w: 28, h: 145, d: 28 },
};

/**
 * Fallback dimensions per lamp Type and form variant in cm (w, h, d).
 * Informs the silhouette when dimensions are null/unknown.
 */
export const VARIANT_DEFAULTS: Record<LampId, Record<string, Dims>> = {
    'pendant': {
        cylinder: { w: 10, h: 32, d: 10 },
        squared:  { w: 12, h: 30, d: 12 },
    },
    'table-lamp': {
        squared:     { w: 15, h: 42, d: 15 },
        cylinder:    { w: 14, h: 38, d: 14 },
        cube:        { w: 22, h: 22, d: 22 },
        rectangular: { w: 26, h: 40, d: 14 },
    },
    'floor-lamp': {
        squared:     { w: 28, h: 145, d: 28 },
        rectangular: { w: 42, h: 140, d: 18 },
    },
};

function defaultDimsFor(key: LampId, variant: LampVariant): Dims {
    return VARIANT_DEFAULTS[key]?.[variant] ?? DEFAULTS[key];
}

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

function buildTableLampCylinder(cam: Cam, dims: Dims): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.07);
    const bw = w * 0.72;
    const bd = d * 0.72;
    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, Math.min(bw, bd) / 2);

    const cw = w * 0.58;
    const cd = d * 0.58;
    const ch = h - baseH;
    const drum = prism(cam, cx - cw / 2, cy - cd / 2, baseH, cw, cd, ch, Math.min(cw, cd) / 2);

    const cord = pathOf([
        proj(cam, cx + bw * 0.35, cy - bd * 0.1, 0),
        proj(cam, cx + (w - cx) * 0.55, cy - bd * 0.25, 0),
        proj(cam, cx + (w - cx) * 0.85, cy - bd * 0.35, 0),
    ], false);

    // Front vertical slot
    const slotW = cw * 0.22;
    const sz0 = baseH + ch * 0.18;
    const sz1 = baseH + ch * 0.82;
    const slot = rectY(cam, cy + cd / 2, cx - slotW / 2, cx + slotW / 2, sz0, sz1);
    const litW = slotW * 0.45;
    const lit = rectY(cam, cy + cd / 2, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    // Two horizontal curved strata creases across the cylinder body front
    const r = cw / 2;
    const arcZ1 = baseH + ch * 0.42;
    const arcZ2 = baseH + ch * 0.68;
    const arcPts1: [number, number][] = [];
    const arcPts2: [number, number][] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 4 + (i / steps) * Math.PI;
        const px = cx + r * Math.cos(a);
        const py = cy + (cd / 2) * Math.sin(a);
        arcPts1.push(proj(cam, px, py, arcZ1));
        arcPts2.push(proj(cam, px, py, arcZ2));
    }
    const str1 = pathOf(arcPts1, false);
    const str2 = pathOf(arcPts2, false);

    return [
        { d: cord, kind: 'crease' },
        ...solidParts(base),
        ...solidParts(drum),
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
    ];
}

function buildTableLampSquared(cam: Cam, dims: Dims, top: LampTop): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.06);
    const bw = w * 0.72;
    const bd = d * 0.72;
    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, 0.35);

    const colW = w * 0.58;
    const colD = d * 0.58;
    const colH = h - baseH;
    const bx0 = cx - colW / 2;
    const by0 = cy - colD / 2;
    const bx1 = cx + colW / 2;
    const by1 = cy + colD / 2;
    const post = prism(cam, bx0, by0, baseH, colW, colD, colH, 0.3);

    const cord = pathOf([
        proj(cam, bx1 - 0.2, by0 + colD * 0.25, 0),
        proj(cam, bx1 + (w - bx1) * 0.45, by0 + colD * 0.12, 0),
        proj(cam, bx1 + (w - bx1) * 0.85, by0, 0),
    ], false);

    // Veins on visible front faces (+y and +x)
    const v1 = pathOf([
        proj(cam, bx0 + colW * 0.28, by1, baseH + colH * 0.84),
        proj(cam, bx0 + colW * 0.42, by1, baseH + colH * 0.60),
        proj(cam, bx0 + colW * 0.30, by1, baseH + colH * 0.38),
        proj(cam, bx0 + colW * 0.46, by1, baseH + colH * 0.16),
    ], false);

    const v2 = pathOf([
        proj(cam, bx1, by0 + colD * 0.36, baseH + colH * 0.80),
        proj(cam, bx1, by0 + colD * 0.22, baseH + colH * 0.54),
        proj(cam, bx1, by0 + colD * 0.38, baseH + colH * 0.30),
        proj(cam, bx1, by0 + colD * 0.24, baseH + colH * 0.12),
    ], false);

    // Front vertical slit
    const slitW = colW * 0.22;
    const sz0 = baseH + colH * 0.18;
    const sz1 = baseH + colH * 0.82;
    const frontSlot = rectY(cam, by1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);

    if (top === 'open') {
        const rim = Math.min(colW, colD) * 0.18;
        const mx0 = bx0 + rim;
        const mx1 = bx1 - rim;
        const my0 = by0 + rim;
        const my1 = by1 - rim;
        const wellDepth = Math.min(colH * 0.22, 3.5);
        const zFloor = h - wellDepth;

        const mouth = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my1, h),
            proj(cam, mx0, my1, h),
        ], true);

        const innerWallRight = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const innerWallLeft = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx0, my1, h),
            proj(cam, mx0, my1, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const litFloor = pathOf([
            proj(cam, mx0, my0, zFloor),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx1, my1, zFloor),
            proj(cam, mx0, my1, zFloor),
        ], true);

        return [
            { d: cord, kind: 'crease' },
            ...solidParts(base),
            ...solidParts(post),
            { d: frontSlot, kind: 'slot' },
            { d: mouth, kind: 'slot' },
            { d: innerWallRight, kind: 'face' },
            { d: innerWallLeft, kind: 'face' },
            { d: litFloor, kind: 'bright' },
            { d: v1, kind: 'crease' },
            { d: v2, kind: 'crease' },
        ];
    }

    // Closed top
    const litW = slitW * 0.45;
    const lit = rectY(cam, by1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        { d: cord, kind: 'crease' },
        ...solidParts(base),
        ...solidParts(post),
        { d: frontSlot, kind: 'slot' },
        { d: lit, kind: 'bright' },
        { d: v1, kind: 'crease' },
        { d: v2, kind: 'crease' },
    ];
}

function buildTableLampCube(cam: Cam, dims: Dims, top: LampTop): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const bw = w * 0.82;
    const bd = d * 0.82;
    const bh = h * 0.82;
    const bx0 = cx - bw / 2;
    const by0 = cy - bd / 2;
    const bx1 = cx + bw / 2;
    const by1 = cy + bd / 2;

    const post = prism(cam, bx0, by0, 0, bw, bd, bh, 0.4);

    const cord = pathOf([
        proj(cam, bx1 - 0.2, by0 + bd * 0.25, 0),
        proj(cam, bx1 + (w - bx1) * 0.45, by0 + bd * 0.12, 0),
        proj(cam, bx1 + (w - bx1) * 0.85, by0, 0),
    ], false);

    // Natural stone veins
    const v1 = pathOf([
        proj(cam, bx0 + bw * 0.26, by1, bh * 0.84),
        proj(cam, bx0 + bw * 0.46, by1, bh * 0.58),
        proj(cam, bx0 + bw * 0.32, by1, bh * 0.34),
        proj(cam, bx0 + bw * 0.52, by1, bh * 0.12),
    ], false);

    const v2 = pathOf([
        proj(cam, bx1, by0 + bd * 0.32, bh * 0.78),
        proj(cam, bx1, by0 + bd * 0.20, bh * 0.52),
        proj(cam, bx1, by0 + bd * 0.36, bh * 0.28),
    ], false);

    const slitW = bw * 0.20;
    const sz0 = bh * 0.20;
    const sz1 = bh * 0.80;
    const frontSlot = rectY(cam, by1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);

    if (top === 'open') {
        const rim = Math.min(bw, bd) * 0.18;
        const mx0 = bx0 + rim;
        const mx1 = bx1 - rim;
        const my0 = by0 + rim;
        const my1 = by1 - rim;
        const wellDepth = bh * 0.24;
        const zFloor = bh - wellDepth;

        const mouth = pathOf([
            proj(cam, mx0, my0, bh),
            proj(cam, mx1, my0, bh),
            proj(cam, mx1, my1, bh),
            proj(cam, mx0, my1, bh),
        ], true);

        const innerWallRight = pathOf([
            proj(cam, mx0, my0, bh),
            proj(cam, mx1, my0, bh),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const innerWallLeft = pathOf([
            proj(cam, mx0, my0, bh),
            proj(cam, mx0, my1, bh),
            proj(cam, mx0, my1, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const litFloor = pathOf([
            proj(cam, mx0, my0, zFloor),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx1, my1, zFloor),
            proj(cam, mx0, my1, zFloor),
        ], true);

        return [
            { d: cord, kind: 'crease' },
            ...solidParts(post),
            { d: frontSlot, kind: 'slot' },
            { d: mouth, kind: 'slot' },
            { d: innerWallRight, kind: 'face' },
            { d: innerWallLeft, kind: 'face' },
            { d: litFloor, kind: 'bright' },
            { d: v1, kind: 'crease' },
            { d: v2, kind: 'crease' },
        ];
    }

    // Closed top
    const litW = slitW * 0.45;
    const lit = rectY(cam, by1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        { d: cord, kind: 'crease' },
        ...solidParts(post),
        { d: frontSlot, kind: 'slot' },
        { d: lit, kind: 'bright' },
        { d: v1, kind: 'crease' },
        { d: v2, kind: 'crease' },
    ];
}

function buildTableLampRectangular(cam: Cam, dims: Dims, top: LampTop): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.06);
    const bw = w * 0.85;
    const bd = d * 0.85;
    const base = prism(cam, cx - bw / 2, cy - bd / 2, 0, bw, bd, baseH, 0.35);

    const slabW = w * 0.74;
    const slabD = d * 0.55;
    const slabH = h - baseH;
    const sx0 = cx - slabW / 2;
    const sy0 = cy - slabD / 2;
    const sx1 = cx + slabW / 2;
    const sy1 = cy + slabD / 2;
    const slab = prism(cam, sx0, sy0, baseH, slabW, slabD, slabH, 0.3);

    const cord = pathOf([
        proj(cam, sx1 - 0.2, sy0 + slabD * 0.25, 0),
        proj(cam, sx1 + (w - sx1) * 0.45, sy0 + slabD * 0.12, 0),
        proj(cam, sx1 + (w - sx1) * 0.85, sy0, 0),
    ], false);

    // Strata bands across wide slab face
    const str1 = pathOf([
        proj(cam, sx0 + slabW * 0.10, sy1, baseH + slabH * 0.35),
        proj(cam, sx1 - slabW * 0.10, sy1, baseH + slabH * 0.35),
    ], false);

    const str2 = pathOf([
        proj(cam, sx0 + slabW * 0.15, sy1, baseH + slabH * 0.70),
        proj(cam, sx1 - slabW * 0.15, sy1, baseH + slabH * 0.70),
    ], false);

    const slitW = slabW * 0.16;
    const sz0 = baseH + slabH * 0.16;
    const sz1 = baseH + slabH * 0.84;
    const frontSlot = rectY(cam, sy1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);

    if (top === 'open') {
        const rimX = slabW * 0.16;
        const rimY = slabD * 0.22;
        const mx0 = sx0 + rimX;
        const mx1 = sx1 - rimX;
        const my0 = sy0 + rimY;
        const my1 = sy1 - rimY;
        const wellDepth = Math.min(slabH * 0.22, 3.5);
        const zFloor = h - wellDepth;

        const mouth = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my1, h),
            proj(cam, mx0, my1, h),
        ], true);

        const innerWallRight = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const innerWallLeft = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx0, my1, h),
            proj(cam, mx0, my1, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const litFloor = pathOf([
            proj(cam, mx0, my0, zFloor),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx1, my1, zFloor),
            proj(cam, mx0, my1, zFloor),
        ], true);

        return [
            { d: cord, kind: 'crease' },
            ...solidParts(base),
            ...solidParts(slab),
            { d: frontSlot, kind: 'slot' },
            { d: mouth, kind: 'slot' },
            { d: innerWallRight, kind: 'face' },
            { d: innerWallLeft, kind: 'face' },
            { d: litFloor, kind: 'bright' },
            { d: str1, kind: 'crease' },
            { d: str2, kind: 'crease' },
        ];
    }

    // Closed top
    const litW = slitW * 0.45;
    const lit = rectY(cam, sy1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        { d: cord, kind: 'crease' },
        ...solidParts(base),
        ...solidParts(slab),
        { d: frontSlot, kind: 'slot' },
        { d: lit, kind: 'bright' },
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
    ];
}

function buildFloorLampSquared(cam: Cam, dims: Dims, top: LampTop): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.035);
    const pw = w * 0.88;
    const pd = d * 0.88;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, baseH, 0.4);

    const cw = w * 0.74;
    const cd = d * 0.74;
    const ch = h - baseH;
    const cx0 = cx - cw / 2;
    const cy0 = cy - cd / 2;
    const cx1 = cx + cw / 2;
    const cy1 = cy + cd / 2;
    const tower = prism(cam, cx0, cy0, baseH, cw, cd, ch, 0.35);

    const str1 = pathOf([
        proj(cam, cx0 + cw * 0.10, cy1, baseH + ch * 0.32),
        proj(cam, cx1, cy1, baseH + ch * 0.32),
        proj(cam, cx1, cy0 + cd * 0.10, baseH + ch * 0.32),
    ], false);

    const str2 = pathOf([
        proj(cam, cx0 + cw * 0.15, cy1, baseH + ch * 0.68),
        proj(cam, cx1, cy1, baseH + ch * 0.68),
        proj(cam, cx1, cy0 + cd * 0.15, baseH + ch * 0.68),
    ], false);

    const slitW = cw * 0.20;
    const sz0 = baseH + ch * 0.10;
    const sz1 = baseH + ch * 0.90;

    const slotX = rectX(cam, cx1, cy - slitW / 2, cy + slitW / 2, sz0, sz1);
    const slotY = rectY(cam, cy1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);

    if (top === 'open') {
        const rim = Math.min(cw, cd) * 0.18;
        const mx0 = cx0 + rim;
        const mx1 = cx1 - rim;
        const my0 = cy0 + rim;
        const my1 = cy1 - rim;
        const wellDepth = Math.min(ch * 0.18, 4.5);
        const zFloor = h - wellDepth;

        const mouth = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my1, h),
            proj(cam, mx0, my1, h),
        ], true);

        const innerWallRight = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const innerWallLeft = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx0, my1, h),
            proj(cam, mx0, my1, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const litFloor = pathOf([
            proj(cam, mx0, my0, zFloor),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx1, my1, zFloor),
            proj(cam, mx0, my1, zFloor),
        ], true);

        const litW = slitW * 0.45;
        const markY = rectY(cam, cy1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

        return [
            ...solidParts(plinth),
            ...solidParts(tower),
            { d: slotX, kind: 'slot' },
            { d: slotY, kind: 'slot' },
            { d: markY, kind: 'mark' },
            { d: mouth, kind: 'slot' },
            { d: innerWallRight, kind: 'face' },
            { d: innerWallLeft, kind: 'face' },
            { d: litFloor, kind: 'bright' },
            { d: str1, kind: 'crease' },
            { d: str2, kind: 'crease' },
        ];
    }

    // Closed top
    const litW = slitW * 0.45;
    const litX = rectX(cam, cx1, cy - litW / 2, cy + litW / 2, sz0 + 0.4, sz1 - 0.4);
    const litY = rectY(cam, cy1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        ...solidParts(plinth),
        ...solidParts(tower),
        { d: slotX, kind: 'slot' },
        { d: litX, kind: 'mark' },
        { d: slotY, kind: 'slot' },
        { d: litY, kind: 'bright' },
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
    ];
}

function buildFloorLampRectangular(cam: Cam, dims: Dims, top: LampTop): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cy = d / 2;

    const baseH = Math.max(1.0, h * 0.035);
    const pw = w * 0.90;
    const pd = d * 0.90;
    const plinth = prism(cam, cx - pw / 2, cy - pd / 2, 0, pw, pd, baseH, 0.4);

    const sw = w * 0.78;
    const sd = d * 0.60;
    const sh = h - baseH;
    const sx0 = cx - sw / 2;
    const sy0 = cy - sd / 2;
    const sx1 = cx + sw / 2;
    const sy1 = cy + sd / 2;
    const slab = prism(cam, sx0, sy0, baseH, sw, sd, sh, 0.35);

    const str1 = pathOf([
        proj(cam, sx0 + sw * 0.08, sy1, baseH + sh * 0.28),
        proj(cam, sx1 - sw * 0.08, sy1, baseH + sh * 0.28),
    ], false);

    const str2 = pathOf([
        proj(cam, sx0 + sw * 0.12, sy1, baseH + sh * 0.58),
        proj(cam, sx1 - sw * 0.12, sy1, baseH + sh * 0.58),
    ], false);

    const str3 = pathOf([
        proj(cam, sx0 + sw * 0.10, sy1, baseH + sh * 0.82),
        proj(cam, sx1 - sw * 0.10, sy1, baseH + sh * 0.82),
    ], false);

    const slitW = sw * 0.15;
    const sz0 = baseH + sh * 0.10;
    const sz1 = baseH + sh * 0.90;
    const slot = rectY(cam, sy1, cx - slitW / 2, cx + slitW / 2, sz0, sz1);

    if (top === 'open') {
        const rimX = sw * 0.16;
        const rimY = sd * 0.22;
        const mx0 = sx0 + rimX;
        const mx1 = sx1 - rimX;
        const my0 = sy0 + rimY;
        const my1 = sy1 - rimY;
        const wellDepth = Math.min(sh * 0.18, 4.0);
        const zFloor = h - wellDepth;

        const mouth = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my1, h),
            proj(cam, mx0, my1, h),
        ], true);

        const innerWallRight = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx1, my0, h),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const innerWallLeft = pathOf([
            proj(cam, mx0, my0, h),
            proj(cam, mx0, my1, h),
            proj(cam, mx0, my1, zFloor),
            proj(cam, mx0, my0, zFloor),
        ], true);

        const litFloor = pathOf([
            proj(cam, mx0, my0, zFloor),
            proj(cam, mx1, my0, zFloor),
            proj(cam, mx1, my1, zFloor),
            proj(cam, mx0, my1, zFloor),
        ], true);

        return [
            ...solidParts(plinth),
            ...solidParts(slab),
            { d: slot, kind: 'slot' },
            { d: mouth, kind: 'slot' },
            { d: innerWallRight, kind: 'face' },
            { d: innerWallLeft, kind: 'face' },
            { d: litFloor, kind: 'bright' },
            { d: str1, kind: 'crease' },
            { d: str2, kind: 'crease' },
            { d: str3, kind: 'crease' },
        ];
    }

    // Closed top
    const litW = slitW * 0.45;
    const lit = rectY(cam, sy1, cx - litW / 2, cx + litW / 2, sz0 + 0.4, sz1 - 0.4);

    return [
        ...solidParts(plinth),
        ...solidParts(slab),
        { d: slot, kind: 'slot' },
        { d: lit, kind: 'bright' },
        { d: str1, kind: 'crease' },
        { d: str2, kind: 'crease' },
        { d: str3, kind: 'crease' },
    ];
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
    top?: string | null,
): FigurePart[] | null {
    if (!id || !LAMP_FIGURE_IDS.includes(id)) return null;
    const key = id as LampId;
    const resolvedVariant = (resolveVariant(key, variant) ?? lampVariantOf(variant, key)) as LampVariant;
    const resolvedTop = lampTopOf(top);
    const dims = normalizeDims(rawDims, defaultDimsFor(key, resolvedVariant));
    const cam = centeredCam(dims);

    switch (key) {
        case 'pendant':
            return resolvedVariant === 'squared'
                ? buildPendantSquared(cam, dims)
                : buildPendant(cam, dims);
        case 'table-lamp':
            switch (resolvedVariant) {
                case 'cylinder':
                    return buildTableLampCylinder(cam, dims);
                case 'cube':
                    return buildTableLampCube(cam, dims, resolvedTop);
                case 'rectangular':
                    return buildTableLampRectangular(cam, dims, resolvedTop);
                case 'squared':
                default:
                    return buildTableLampSquared(cam, dims, resolvedTop);
            }
        case 'floor-lamp':
            switch (resolvedVariant) {
                case 'rectangular':
                    return buildFloorLampRectangular(cam, dims, resolvedTop);
                case 'squared':
                default:
                    return buildFloorLampSquared(cam, dims, resolvedTop);
            }
        default:
            return null;
    }
}
