import { type Dims, type FigurePart, normalizeDims, centeredCam } from '../types';
import {
    type Cam,
    type P2,
    proj,
    hull,
    pathOf,
    prism,
    discY,
} from '../../../welcome/hairline/engine';

export type MirrorVariant = 'round' | 'squared' | 'rectangular';

export const MIRROR_VARIANTS: readonly MirrorVariant[] = [
    'round',
    'squared',
    'rectangular',
] as const;

/** Default dimensions in cm per mirror variant (w, h, d). Round variant has h === w. */
export const MIRROR_DEFAULTS: Record<MirrorVariant, Dims> = {
    round: { w: 80, h: 80, d: 10 },
    squared: { w: 100, h: 100, d: 10 },
    rectangular: { w: 80, h: 150, d: 10 },
} as const;

export const DEFAULTS = MIRROR_DEFAULTS;

/**
 * Normalises a shape descriptor to a mirror variant (case- and accent-insensitive).
 * round, circle, circular, oval, redondo, redonda -> round
 * squared, square, cuadrado, cuadrada -> squared
 * everything else, including empty/null/undefined -> rectangular
 */
export function mirrorVariantOf(shape: string | null | undefined): MirrorVariant {
    if (!shape) return 'rectangular';
    const s = shape
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    if (!s) return 'rectangular';

    const roundWords = new Set([
        'round',
        'circle',
        'circulo',
        'circular',
        'oval',
        'redondo',
        'redonda',
    ]);
    const squareWords = new Set([
        'squared',
        'square',
        'cuadrado',
        'cuadrada',
    ]);

    if (roundWords.has(s)) return 'round';
    if (squareWords.has(s)) return 'squared';

    const tokens = s.split(/[\s_\-/]+/);
    for (const t of tokens) {
        if (roundWords.has(t)) return 'round';
        if (squareWords.has(t)) return 'squared';
    }

    return 'rectangular';
}

// ── geometric helpers ────────────────────────────────────────────────────────

/** Deterministic wavy circular contour (32 points) for natural hand-cut stone openings and strata. */
function wavyCircle(
    cx: number,
    cz: number,
    radius: number,
    amp: number,
    n = 32,
): P2[] {
    const pts: P2[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wave =
            (Math.sin(a * 5) * 0.45 +
                Math.cos(a * 9 + 0.8) * 0.32 +
                Math.sin(a * 14 + 1.5) * 0.18) * amp;
        const r = radius + wave;
        pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return pts;
}

/** Deterministic wavy rounded-rectangle contour (32 points) along the perimeter. */
function wavyRoundedRect(
    cx: number,
    cz: number,
    hw: number,
    hz: number,
    rc: number,
    amp: number,
    n = 32,
): P2[] {
    const r = Math.max(0.5, Math.min(rc, hw * 0.45, hz * 0.45));
    const wStraight = Math.max(0, 2 * (hw - r));
    const hStraight = Math.max(0, 2 * (hz - r));
    const arcLen = r * Math.PI * 0.5;
    const totalLen = 2 * wStraight + 2 * hStraight + 4 * arcLen;

    const segments = [
        // 0: Bottom straight (left to right, z = -hz)
        {
            len: wStraight,
            getPoint: (u: number) => ({
                bx: -hw + r + u * wStraight,
                bz: -hz,
                nx: 0,
                nz: -1,
            }),
        },
        // 1: Bottom-right corner arc (-π/2 to 0)
        {
            len: arcLen,
            getPoint: (u: number) => {
                const ang = -Math.PI / 2 + u * Math.PI / 2;
                return {
                    bx: hw - r + r * Math.cos(ang),
                    bz: -hz + r + r * Math.sin(ang),
                    nx: Math.cos(ang),
                    nz: Math.sin(ang),
                };
            },
        },
        // 2: Right straight (bottom to top, x = hw)
        {
            len: hStraight,
            getPoint: (u: number) => ({
                bx: hw,
                bz: -hz + r + u * hStraight,
                nx: 1,
                nz: 0,
            }),
        },
        // 3: Top-right corner arc (0 to π/2)
        {
            len: arcLen,
            getPoint: (u: number) => {
                const ang = u * Math.PI / 2;
                return {
                    bx: hw - r + r * Math.cos(ang),
                    bz: hz - r + r * Math.sin(ang),
                    nx: Math.cos(ang),
                    nz: Math.sin(ang),
                };
            },
        },
        // 4: Top straight (right to left, z = hz)
        {
            len: wStraight,
            getPoint: (u: number) => ({
                bx: hw - r - u * wStraight,
                bz: hz,
                nx: 0,
                nz: 1,
            }),
        },
        // 5: Top-left corner arc (π/2 to π)
        {
            len: arcLen,
            getPoint: (u: number) => {
                const ang = Math.PI / 2 + u * Math.PI / 2;
                return {
                    bx: -hw + r + r * Math.cos(ang),
                    bz: hz - r + r * Math.sin(ang),
                    nx: Math.cos(ang),
                    nz: Math.sin(ang),
                };
            },
        },
        // 6: Left straight (top to bottom, x = -hw)
        {
            len: hStraight,
            getPoint: (u: number) => ({
                bx: -hw,
                bz: hz - r - u * hStraight,
                nx: -1,
                nz: 0,
            }),
        },
        // 7: Bottom-left corner arc (π to 3π/2)
        {
            len: arcLen,
            getPoint: (u: number) => {
                const ang = Math.PI + u * Math.PI / 2;
                return {
                    bx: -hw + r + r * Math.cos(ang),
                    bz: -hz + r + r * Math.sin(ang),
                    nx: Math.cos(ang),
                    nz: Math.sin(ang),
                };
            },
        },
    ];

    const pts: P2[] = [];
    for (let i = 0; i < n; i++) {
        let dist = (i / n) * totalLen;
        let segIdx = 0;
        while (segIdx < segments.length - 1 && dist > segments[segIdx].len) {
            dist -= segments[segIdx].len;
            segIdx++;
        }
        const seg = segments[segIdx];
        const u = seg.len > 0 ? Math.min(1, Math.max(0, dist / seg.len)) : 0;
        const { bx, bz, nx, nz } = seg.getPoint(u);

        const t = (i / n) * Math.PI * 2;
        const wave =
            (Math.sin(t * 6) * 0.42 +
                Math.cos(t * 10 + 0.9) * 0.28 +
                Math.sin(t * 15 + 1.4) * 0.16) * amp;

        pts.push([cx + bx + nx * wave, cz + bz + nz * wave]);
    }
    return pts;
}

// ── variant builders ────────────────────────────────────────────────────────

function buildRoundMirror(cam: Cam, dims: Dims): FigurePart[] {
    const cx = dims.w / 2;
    const cz = dims.h / 2;
    const rOuter = Math.min(dims.w, dims.h) / 2;
    const n = 32;

    // 1. Slab body: ring prism built as hull of two rounded rings (back y=0, front y=dims.d)
    const ptsBack: P2[] = [];
    const ptsFront: P2[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + rOuter * Math.cos(a);
        const z = cz + rOuter * Math.sin(a);
        ptsBack.push(proj(cam, x, 0, z));
        ptsFront.push(proj(cam, x, dims.d, z));
    }
    const bodyPlate = pathOf(hull([...ptsBack, ...ptsFront]));
    const rimCrease = pathOf(ptsFront);

    // Stone frame margin: ~24% of diameter on each side
    const margin = dims.w * 0.24;
    const rInner = Math.max(2, rOuter - margin);

    // 2. Recessed glass plate inside rough wavy opening (32 points, deterministic)
    const openingCoords = wavyCircle(cx, cz, rInner, 1.0, 32);
    const openingPts = openingCoords.map(([x, z]) => proj(cam, x, dims.d, z));
    const glassPlate = pathOf(openingPts, true);

    // 3. Soft sheen crease diagonal on the glass
    const p0 = proj(cam, cx - rInner * 0.55, dims.d, cz + rInner * 0.55);
    const p1 = proj(cam, cx + rInner * 0.55, dims.d, cz - rInner * 0.55);
    const sheen = pathOf([p0, p1], false);

    // 4. Strata crease contours that follow the opening in the stone slab
    const strata1R = rInner + (rOuter - rInner) * 0.38;
    const strata1Coords = wavyCircle(cx, cz, strata1R, 0.75, 32);
    const strata1Pts = strata1Coords.map(([x, z]) => proj(cam, x, dims.d, z));
    const strata1 = pathOf(strata1Pts, true);

    const strata2R = rInner + (rOuter - rInner) * 0.72;
    const strata2Coords = wavyCircle(cx, cz, strata2R, 0.5, 32);
    const strata2Pts = strata2Coords.map(([x, z]) => proj(cam, x, dims.d, z));
    const strata2 = pathOf(strata2Pts, true);

    // 5. Tiny bright mark on the glass
    const bright = discY(cam, cx + rInner * 0.42, dims.d, cz + rInner * 0.42, 0.65, 10);

    return [
        { d: bodyPlate, kind: 'plate' },
        { d: rimCrease, kind: 'crease' },
        { d: glassPlate, kind: 'face' },
        { d: sheen, kind: 'crease' },
        { d: strata1, kind: 'crease' },
        { d: strata2, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

function buildRectangularOrSquareMirror(
    cam: Cam,
    dims: Dims,
    variant: 'squared' | 'rectangular',
): FigurePart[] {
    const { w, h, d } = dims;
    const cx = w / 2;
    const cz = h / 2;

    // 1. Slab body: prism with softened stone edge
    const p = prism(cam, 0, 0, 0, w, d, h, 0.8);

    // Stone frame margin: ~24% of width on sides; top/bottom matches physical stone border width
    const marginX = w * 0.24;
    const marginZ = variant === 'squared' ? h * 0.24 : marginX;
    const hw = Math.max(2, (w - 2 * marginX) / 2);
    const hz = Math.max(2, (h - 2 * marginZ) / 2);
    const rc = Math.min(hw, hz) * 0.22;

    // 2. Recessed glass plate inside rough wavy opening (32 points, deterministic)
    const openingCoords = wavyRoundedRect(cx, cz, hw, hz, rc, 1.0, 32);
    const openingPts = openingCoords.map(([x, z]) => proj(cam, x, d, z));
    const glassPlate = pathOf(openingPts, true);

    // 3. Soft sheen crease diagonal on the glass
    const sheenYScale = variant === 'squared' ? 0.6 : 0.45;
    const p0 = proj(cam, cx - hw * 0.65, d, cz + hz * sheenYScale);
    const p1 = proj(cam, cx + hw * 0.65, d, cz - hz * sheenYScale);
    const sheen = pathOf([p0, p1], false);

    // 4. Strata crease contours that follow the opening in the stone slab
    const s1Hw = hw + marginX * 0.38;
    const s1Hz = hz + marginZ * 0.38;
    const s1Rc = rc + Math.min(marginX, marginZ) * 0.1;
    const strata1Coords = wavyRoundedRect(cx, cz, s1Hw, s1Hz, s1Rc, 0.75, 32);
    const strata1Pts = strata1Coords.map(([x, z]) => proj(cam, x, d, z));
    const strata1 = pathOf(strata1Pts, true);

    const s2Hw = hw + marginX * 0.72;
    const s2Hz = hz + marginZ * 0.72;
    const s2Rc = rc + Math.min(marginX, marginZ) * 0.18;
    const strata2Coords = wavyRoundedRect(cx, cz, s2Hw, s2Hz, s2Rc, 0.5, 32);
    const strata2Pts = strata2Coords.map(([x, z]) => proj(cam, x, d, z));
    const strata2 = pathOf(strata2Pts, true);

    // 5. Tiny bright mark on the glass
    const brightZScale = variant === 'squared' ? 0.55 : 0.65;
    const bright = discY(cam, cx + hw * 0.52, d, cz + hz * brightZScale, 0.65, 10);

    return [
        { d: p.body, kind: 'plate' },
        { d: p.crease, kind: 'crease' },
        { d: glassPlate, kind: 'face' },
        { d: sheen, kind: 'crease' },
        { d: strata1, kind: 'crease' },
        { d: strata2, kind: 'crease' },
        { d: bright, kind: 'bright' },
    ];
}

/**
 * Draw the hairline figure parts for one of the three natural stone mirror variants.
 * Parts are ordered back-to-front and painted in that order (at most 7 paths, well within the 12 path limit).
 */
export function buildMirrorFigure(
    variant: MirrorVariant,
    rawDims: Dims | null,
): FigurePart[] {
    const fallback = MIRROR_DEFAULTS[variant];
    const effectiveRaw: Dims | null = rawDims
        ? variant === 'round'
            ? {
                  w: rawDims.w > 0 ? rawDims.w : fallback.w,
                  h: rawDims.w > 0 ? rawDims.w : (rawDims.h > 0 ? rawDims.h : fallback.h),
                  d: rawDims.d > 0 ? rawDims.d : fallback.d,
              }
            : rawDims
        : null;

    const dims = normalizeDims(effectiveRaw, fallback);
    if (variant === 'round') {
        dims.h = dims.w;
    }
    const cam = centeredCam(dims);

    switch (variant) {
        case 'round':
            return buildRoundMirror(cam, dims);
        case 'squared':
            return buildRectangularOrSquareMirror(cam, dims, 'squared');
        case 'rectangular':
            return buildRectangularOrSquareMirror(cam, dims, 'rectangular');
    }
}
