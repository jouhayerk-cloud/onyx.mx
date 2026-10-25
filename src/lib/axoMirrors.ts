import { tr } from './i18n';
import type { AxoDrawHelpers } from './axoExtra';

/**
 * axoMirrors.ts — Natural stone slab mirror icon renderer for the axonometric rasteriser.
 *
 * Models real floor/wall mirrors carved from thick slabs of natural onyx and marble:
 * - A thick stone slab frame (~10 cm deep) with a wide border (20% to 28% of width on each side).
 * - A hand-cut opening in the center with a rough, wavy edge (small irregular deterministic bumps).
 * - A recessed mirror glass panel displaying a soft reflection with a diagonal sheen line.
 * - Concentric strata contours following the opening on the slab face.
 * - Three distinct variants:
 *     1. mirror-round: thick ring slab with rough circular opening.
 *     2. mirror-square: 100 x 100 cm square stone slab with rough square opening.
 *     3. mirror-rect: 80 x 150 cm standing floor slab with rough rectangular opening.
 */

export type AxoMirrorClass = 'mirror-round' | 'mirror-square' | 'mirror-rect';

export const AXO_MIRROR_CLASSES: AxoMirrorClass[] = [
    'mirror-round',
    'mirror-square',
    'mirror-rect',
];

/**
 * Localised display label for each mirror variant.
 */
export function getAxoMirrorLabel(cls: AxoMirrorClass): string {
    switch (cls) {
        case 'mirror-round':
            return tr('Round Mirror');
        case 'mirror-square':
            return tr('Square Mirror');
        case 'mirror-rect':
            return tr('Rectangular Mirror');
    }
}

/**
 * Normalises text by lower-casing and stripping diacritics.
 */
function norm(s: string): string {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Classifies an inventory item from its shape and type/description strings into
 * one of the three stone slab mirror classes, or returns null if not a mirror.
 *
 * Rules:
 * - null unless the Type or shape text says mirror or espejo
 * - round, circle, oval, redondo, redonda -> mirror-round
 * - squared, square, cuadrado, cuadrada -> mirror-square
 * - everything else -> mirror-rect
 */
export function classifyMirror(shape: string = '', type: string = ''): AxoMirrorClass | null {
    const s = norm(shape);
    const t = norm(type);
    const text = `${s} ${t}`;

    const has = (...words: string[]) => words.some(w => text.includes(norm(w)));

    if (!has('mirror', 'espejo')) {
        return null;
    }

    if (has('round', 'circle', 'oval', 'redondo', 'redonda')) {
        return 'mirror-round';
    }

    if (has('squared', 'square', 'cuadrado', 'cuadrada')) {
        return 'mirror-square';
    }

    return 'mirror-rect';
}

/**
 * Projects a 3D point (x, y, z) into 2D canvas pixel coordinates.
 */
function toCanvas(helpers: AxoDrawHelpers, x: number, y: number, z: number): { x: number; y: number } {
    const p = helpers.project(x, y, z);
    return {
        x: helpers.cx + p.u * helpers.scale,
        y: helpers.cy + p.v * helpers.scale,
    };
}

/**
 * Multi-frequency deterministic harmonic perturbation for hand-cut stone edges.
 * Strictly periodic over [0, 2π], bounded in [-1, 1], and completely deterministic (no Math.random).
 */
function roughWiggle(t: number): number {
    return (
        Math.sin(7 * t) * 0.45 +
        Math.cos(13 * t + 0.8) * 0.35 +
        Math.sin(23 * t + 2.1) * 0.20
    );
}

/**
 * Signed power helper for rounded superellipse contours.
 */
function signedPow(val: number, exp: number): number {
    return val >= 0 ? Math.pow(val, exp) : -Math.pow(-val, exp);
}

/**
 * Draws diagonal wireframe slash lines across the glass surface.
 */
function drawWireframeSlashes(
    ctx: CanvasRenderingContext2D,
    center: { x: number; y: number },
    len: number,
): void {
    const angle = Math.PI / 4;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;

    ctx.beginPath();
    ctx.moveTo(center.x - dx, center.y - dy);
    ctx.lineTo(center.x + dx, center.y + dy);
    ctx.moveTo(center.x - dx + 8, center.y - dy - 4);
    ctx.lineTo(center.x + dx + 8, center.y + dy - 4);
    ctx.stroke();
}

/**
 * Renders a natural stone strata contour line on the slab face.
 */
function drawStrataLine(
    ctx: CanvasRenderingContext2D,
    pts: Array<{ x: number; y: number }>,
    helpers: AxoDrawHelpers,
): void {
    if (pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = Math.max(1.5, (helpers.lineWidth ?? 5) * 0.35);
    ctx.strokeStyle = helpers.isWireframe
        ? (helpers.colorOutline ?? '#111111')
        : 'rgba(40, 40, 40, 0.45)';
    ctx.stroke();
    ctx.restore();
}

/**
 * Draws a filled and stroked 3D polygon face on the canvas.
 */
function drawPolygonFace(
    ctx: CanvasRenderingContext2D,
    helpers: AxoDrawHelpers,
    pts3d: Array<{ x: number; y: number; z: number }>,
    fillColor: string,
    shadeOverlay?: string,
): void {
    if (pts3d.length < 3) return;

    ctx.beginPath();
    const p0 = toCanvas(helpers, pts3d[0].x, pts3d[0].y, pts3d[0].z);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts3d.length; i++) {
        const pt = toCanvas(helpers, pts3d[i].x, pts3d[i].y, pts3d[i].z);
        ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        if (shadeOverlay) {
            ctx.fillStyle = shadeOverlay;
            ctx.fill();
        }
    } else {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    ctx.stroke();
}

/**
 * Samples a stone color from parsedHexList at normalized UV coordinates (0..1, 0..1).
 * If the sampled cell is white (#FFFFFF) or empty, falls back to stoneFallback or helpers.colorRight.
 */
function sampleMirrorColor(
    helpers: AxoDrawHelpers,
    normU: number,
    normV: number,
    fallback: string,
): string {
    const list = helpers.parsedHexList;
    if (!list || list.length === 0) return fallback;
    const cols = helpers.tCols || 60;
    const rows = helpers.tRows || 60;
    const c = Math.max(0, Math.min(cols - 1, Math.floor(normU * cols)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(normV * rows)));
    const col = list[r * cols + c];
    if (!col) return fallback;
    const uc = col.toUpperCase().replace('#', '');
    if (uc === 'FFFFFF' || uc === 'FEFEFE' || uc === 'FDFDFD' || uc === 'FCFFFF' || uc === 'FFFFF7') {
        return fallback;
    }
    return col.startsWith('#') ? col : `#${col}`;
}

/**
 * Finds the first dominant non-white stone color from parsedHexList to serve as a reliable fallback.
 */
function getStoneFallback(helpers: AxoDrawHelpers, defaultColor: string): string {
    const list = helpers.parsedHexList;
    if (list && list.length > 0) {
        for (const c of list) {
            const uc = c.toUpperCase().replace('#', '');
            if (uc !== 'FFFFFF' && uc !== 'FEFEFE' && uc !== 'FDFDFD' && uc !== 'FCFFFF' && uc !== 'FFFFF7') {
                return c.startsWith('#') ? c : `#${c}`;
            }
        }
    }
    return defaultColor;
}

/**
 * ROUND: A thick stone ring slab with an elliptical rough opening and recessed glass.
 */
function drawRoundMirror(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const R = Math.max(W, H) / 2;
    const Xc = W / 2;
    const Yc = H / 2;

    // Opening radius: frame band is ~24% on each side -> inner radius is ~52% of R
    const rInner = R * 0.52;
    const zGlass = Math.max(2, Math.min(D * 0.5, 4));

    const N = 64;
    const ptsInner3d: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const ripple = roughWiggle(t);
        const r = rInner * (1 + 0.05 * ripple);
        ptsInner3d.push({
            x: Xc + r * Math.cos(t),
            y: Yc + r * Math.sin(t),
        });
    }

    // 1. Outer cylinder mantle from back (z = D) to front (z = 0)
    // Tangents in the isometric XY plane are at t = π/4 and t = 5π/4
    const tStart = Math.PI / 4;
    const tEnd = (5 * Math.PI) / 4;
    const M = 32;

    const backMantlePts: Array<{ x: number; y: number }> = [];
    const frontMantlePts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= M; i++) {
        const t = tStart + (i / M) * (tEnd - tStart);
        const x = Xc + R * Math.cos(t);
        const y = Yc + R * Math.sin(t);
        backMantlePts.push(toCanvas(helpers, x, y, D));
        frontMantlePts.push(toCanvas(helpers, x, y, 0));
    }

    const stoneFallback = getStoneFallback(helpers, helpers.colorRight || '#B8956A');

    if (helpers.isWireframe) {
        ctx.beginPath();
        ctx.moveTo(frontMantlePts[0].x, frontMantlePts[0].y);
        ctx.lineTo(backMantlePts[0].x, backMantlePts[0].y);
        for (let i = 1; i <= M; i++) {
            ctx.lineTo(backMantlePts[i].x, backMantlePts[i].y);
        }
        ctx.lineTo(frontMantlePts[M].x, frontMantlePts[M].y);
        for (let i = M - 1; i >= 0; i--) {
            ctx.lineTo(frontMantlePts[i].x, frontMantlePts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else {
        // Draw mantle quads textured from perimeter of hex map
        for (let i = 0; i < M; i++) {
            const tA = tStart + (i / M) * (tEnd - tStart);
            const tB = tStart + ((i + 1) / M) * (tEnd - tStart);
            const tMid = (tA + tB) / 2;

            // In photo: outer rim at perimeter
            const u = 0.5 + 0.46 * Math.cos(tMid);
            const v = 0.5 - 0.46 * Math.sin(tMid);
            const col = sampleMirrorColor(helpers, u, v, helpers.colorLeft);

            const p1 = frontMantlePts[i];
            const p2 = frontMantlePts[i + 1];
            const p3 = backMantlePts[i + 1];
            const p4 = backMantlePts[i];

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
        }

        // Soft isometric shading overlay across the mantle
        const shGrd = ctx.createLinearGradient(
            frontMantlePts[M].x,
            frontMantlePts[M].y,
            frontMantlePts[0].x,
            frontMantlePts[0].y,
        );
        shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
        shGrd.addColorStop(1, 'rgba(255,255,255,0.15)');

        ctx.beginPath();
        ctx.moveTo(frontMantlePts[0].x, frontMantlePts[0].y);
        ctx.lineTo(backMantlePts[0].x, backMantlePts[0].y);
        for (let i = 1; i <= M; i++) {
            ctx.lineTo(backMantlePts[i].x, backMantlePts[i].y);
        }
        ctx.lineTo(frontMantlePts[M].x, frontMantlePts[M].y);
        for (let i = M - 1; i >= 0; i--) {
            ctx.lineTo(frontMantlePts[i].x, frontMantlePts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = shGrd;
        ctx.fill();
    }

    // Outer silhouette outline
    ctx.beginPath();
    ctx.moveTo(frontMantlePts[0].x, frontMantlePts[0].y);
    ctx.lineTo(backMantlePts[0].x, backMantlePts[0].y);
    for (let i = 1; i <= M; i++) {
        ctx.lineTo(backMantlePts[i].x, backMantlePts[i].y);
    }
    ctx.lineTo(frontMantlePts[M].x, frontMantlePts[M].y);
    ctx.stroke();

    // 2. Recessed mirror glass at z = zGlass
    const ptsGlass = ptsInner3d.map(p => toCanvas(helpers, p.x, p.y, zGlass));
    const centerGlass = toCanvas(helpers, Xc, Yc, zGlass);

    ctx.beginPath();
    ctx.moveTo(ptsGlass[0].x, ptsGlass[0].y);
    for (let i = 1; i < ptsGlass.length; i++) {
        ctx.lineTo(ptsGlass[i].x, ptsGlass[i].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
        ctx.stroke();
        drawWireframeSlashes(ctx, centerGlass, rInner * 0.7 * helpers.scale);
    } else {
        const minX = Math.min(...ptsGlass.map(p => p.x));
        const maxX = Math.max(...ptsGlass.map(p => p.x));
        const minY = Math.min(...ptsGlass.map(p => p.y));
        const maxY = Math.max(...ptsGlass.map(p => p.y));

        const sheenGrd = ctx.createLinearGradient(maxX, minY, minX, maxY);
        sheenGrd.addColorStop(0, '#E8F0F8');
        sheenGrd.addColorStop(0.44, '#E8F0F8');
        sheenGrd.addColorStop(0.49, '#FFFFFF');
        sheenGrd.addColorStop(0.54, '#D0E0EE');
        sheenGrd.addColorStop(1, '#D0E0EE');

        ctx.fillStyle = sheenGrd;
        ctx.fill();
    }

    // 3. Front stone slab face at z = 0 (outer ring with inner cutout)
    const outerCirclePts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        outerCirclePts.push(toCanvas(helpers, Xc + R * Math.cos(t), Yc + R * Math.sin(t), 0));
    }
    const innerOpeningPts = ptsInner3d.map(p => toCanvas(helpers, p.x, p.y, 0));

    if (helpers.isWireframe) {
        ctx.beginPath();
        ctx.moveTo(outerCirclePts[0].x, outerCirclePts[0].y);
        for (let i = 1; i < outerCirclePts.length; i++) {
            ctx.lineTo(outerCirclePts[i].x, outerCirclePts[i].y);
        }
        ctx.closePath();
        ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
        for (let i = 1; i < innerOpeningPts.length; i++) {
            ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill('evenodd');
    } else {
        // True 3D radial ring facet mapping: strictly samples authentic stone rim
        const NR = 4;
        for (let i = 0; i < N; i++) {
            const nextI = (i + 1) % N;
            const t1 = (i / N) * 2 * Math.PI;
            const t2 = ((i + 1) / N) * 2 * Math.PI;
            const rIn1 = rInner * (1 + 0.05 * roughWiggle(t1));
            const rIn2 = rInner * (1 + 0.05 * roughWiggle(t2));

            for (let j = 0; j < NR; j++) {
                const frac1 = j / NR;
                const frac2 = (j + 1) / NR;
                const fracMid = (frac1 + frac2) / 2;

                const rad1A = (1 - frac1) * rIn1 + frac1 * R;
                const rad2A = (1 - frac2) * rIn1 + frac2 * R;
                const rad1B = (1 - frac1) * rIn2 + frac1 * R;
                const rad2B = (1 - frac2) * rIn2 + frac2 * R;

                const tMid = (t1 + t2) / 2;
                const radMid = (1 - fracMid) * rInner + fracMid * R;

                // Normalized UV coordinates in photo (mirror outer edge at ~0.46 radius)
                const normR = radMid / R;
                const u = 0.5 + 0.46 * normR * Math.cos(tMid);
                const v = 0.5 - 0.46 * normR * Math.sin(tMid);
                const col = sampleMirrorColor(helpers, u, v, stoneFallback);

                const c1 = toCanvas(helpers, Xc + rad1A * Math.cos(t1), Yc + rad1A * Math.sin(t1), 0);
                const c2 = toCanvas(helpers, Xc + rad2A * Math.cos(t1), Yc + rad2A * Math.sin(t1), 0);
                const c3 = toCanvas(helpers, Xc + rad2B * Math.cos(t2), Yc + rad2B * Math.sin(t2), 0);
                const c4 = toCanvas(helpers, Xc + rad1B * Math.cos(t2), Yc + rad1B * Math.sin(t2), 0);

                ctx.beginPath();
                ctx.moveTo(c1.x, c1.y);
                ctx.lineTo(c2.x, c2.y);
                ctx.lineTo(c3.x, c3.y);
                ctx.lineTo(c4.x, c4.y);
                ctx.closePath();
                ctx.fillStyle = col;
                ctx.fill();
            }
        }

        // Subtle ambient shadow overlay
        ctx.beginPath();
        ctx.moveTo(outerCirclePts[0].x, outerCirclePts[0].y);
        for (let i = 1; i < outerCirclePts.length; i++) {
            ctx.lineTo(outerCirclePts[i].x, outerCirclePts[i].y);
        }
        ctx.closePath();
        ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
        for (let i = 1; i < innerOpeningPts.length; i++) {
            ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fill('evenodd');
    }

    // Stroke front outer circle
    ctx.beginPath();
    ctx.moveTo(outerCirclePts[0].x, outerCirclePts[0].y);
    for (let i = 1; i < outerCirclePts.length; i++) {
        ctx.lineTo(outerCirclePts[i].x, outerCirclePts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Stroke inner wavy opening
    ctx.beginPath();
    ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
    for (let i = 1; i < innerOpeningPts.length; i++) {
        ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // 4. Two strata lines on the slab face following the opening
    for (const alpha of [0.33, 0.66]) {
        const strataPts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < N; i++) {
            const innerPt = ptsInner3d[i];
            const t = (i / N) * 2 * Math.PI;
            const outerX = Xc + R * Math.cos(t);
            const outerY = Yc + R * Math.sin(t);
            const sx = (1 - alpha) * innerPt.x + alpha * outerX;
            const sy = (1 - alpha) * innerPt.y + alpha * outerY;
            strataPts.push(toCanvas(helpers, sx, sy, 0));
        }
        drawStrataLine(ctx, strataPts, helpers);
    }
}


/**
 * SQUARED & RECTANGULAR: Thick stone slab box with a wavy hand-cut opening and recessed glass.
 */
function drawSlabBoxMirror(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
    cls: AxoMirrorClass,
): void {
    const { W, H, D } = geo;

    // Stone frame borders: ~24% on each side
    const frameW = W * 0.24;
    const frameH = cls === 'mirror-square' ? H * 0.24 : H * 0.22;
    const rw = W / 2 - frameW;
    const rh = H / 2 - frameH;
    const zGlass = Math.max(2, Math.min(D * 0.5, 4));

    // 1. Left face of slab box (x = 0)
    if (helpers.isWireframe) {
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: D },
                { x: 0, y: H, z: D },
                { x: 0, y: H, z: 0 },
            ],
            'rgba(0,0,0,0)',
        );
    } else {
        const stoneFallback = getStoneFallback(helpers, helpers.colorLeft || '#8A7050');
        const NY = 16;
        for (let yStep = 0; yStep < NY; yStep++) {
            const y1 = (yStep / NY) * H;
            const y2 = ((yStep + 1) / NY) * H;
            const midY = (y1 + y2) / 2;
            const u = 0.06;
            const v = 1 - (midY / H);
            const col = sampleMirrorColor(helpers, u, v, stoneFallback);

            const p1 = toCanvas(helpers, 0, y1, 0);
            const p2 = toCanvas(helpers, 0, y1, D);
            const p3 = toCanvas(helpers, 0, y2, D);
            const p4 = toCanvas(helpers, 0, y2, 0);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
        }
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: D },
                { x: 0, y: H, z: D },
                { x: 0, y: H, z: 0 },
            ],
            'rgba(0,0,0,0)',
            'rgba(0, 0, 0, 0.35)',
        );
    }

    // 2. Top face of slab box (y = H)
    if (helpers.isWireframe) {
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: 0, y: H, z: 0 },
                { x: W, y: H, z: 0 },
                { x: W, y: H, z: D },
                { x: 0, y: H, z: D },
            ],
            'rgba(0,0,0,0)',
        );
    } else {
        const stoneFallback = getStoneFallback(helpers, helpers.colorTop || '#D4B896');
        const NX = 16;
        for (let xStep = 0; xStep < NX; xStep++) {
            const x1 = (xStep / NX) * W;
            const x2 = ((xStep + 1) / NX) * W;
            const midX = (x1 + x2) / 2;
            const u = midX / W;
            const v = 0.06;
            const col = sampleMirrorColor(helpers, u, v, stoneFallback);

            const p1 = toCanvas(helpers, x1, H, 0);
            const p2 = toCanvas(helpers, x2, H, 0);
            const p3 = toCanvas(helpers, x2, H, D);
            const p4 = toCanvas(helpers, x1, H, D);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
        }
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: 0, y: H, z: 0 },
                { x: W, y: H, z: 0 },
                { x: W, y: H, z: D },
                { x: 0, y: H, z: D },
            ],
            'rgba(0,0,0,0)',
            'rgba(255, 255, 255, 0.15)',
        );
    }

    // 3. Generate wavy hand-cut opening points in 3D
    const N = 64;
    const ptsInner3d: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const cosVal = Math.cos(t);
        const sinVal = Math.sin(t);
        const cosS = signedPow(cosVal, 1 / 3);
        const sinS = signedPow(sinVal, 1 / 3);
        const ripple = roughWiggle(t);
        const w = 1 + 0.045 * ripple;
        ptsInner3d.push({
            x: W / 2 + rw * cosS * w,
            y: H / 2 + rh * sinS * w,
        });
    }

    // 4. Recessed mirror glass at z = zGlass
    const ptsGlass = ptsInner3d.map(p => toCanvas(helpers, p.x, p.y, zGlass));
    const centerGlass = toCanvas(helpers, W / 2, H / 2, zGlass);

    ctx.beginPath();
    ctx.moveTo(ptsGlass[0].x, ptsGlass[0].y);
    for (let i = 1; i < ptsGlass.length; i++) {
        ctx.lineTo(ptsGlass[i].x, ptsGlass[i].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
        ctx.stroke();
        drawWireframeSlashes(ctx, centerGlass, Math.min(rw, rh) * 0.7 * helpers.scale);
    } else {
        const minX = Math.min(...ptsGlass.map(p => p.x));
        const maxX = Math.max(...ptsGlass.map(p => p.x));
        const minY = Math.min(...ptsGlass.map(p => p.y));
        const maxY = Math.max(...ptsGlass.map(p => p.y));

        const sheenGrd = ctx.createLinearGradient(maxX, minY, minX, maxY);
        sheenGrd.addColorStop(0, '#E8F0F8');
        sheenGrd.addColorStop(0.44, '#E8F0F8');
        sheenGrd.addColorStop(0.49, '#FFFFFF');
        sheenGrd.addColorStop(0.54, '#D0E0EE');
        sheenGrd.addColorStop(1, '#D0E0EE');

        ctx.fillStyle = sheenGrd;
        ctx.fill();
    }

    // 5. Front slab face at z = 0 (outer rectangle with inner wavy opening)
    const p0 = toCanvas(helpers, 0, 0, 0);
    const p1 = toCanvas(helpers, W, 0, 0);
    const p2 = toCanvas(helpers, W, H, 0);
    const p3 = toCanvas(helpers, 0, H, 0);

    const innerOpeningPts = ptsInner3d.map(p => toCanvas(helpers, p.x, p.y, 0));

    if (helpers.isWireframe) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
        for (let i = 1; i < innerOpeningPts.length; i++) {
            ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill('evenodd');
    } else {
        // True 3D superelliptical perimeter facet mapping: strictly samples stone frame borders
        const stoneFallback = getStoneFallback(helpers, helpers.colorRight || '#C0A080');
        const NR = 4;
        const outW = W / 2;
        const outH = H / 2;

        for (let i = 0; i < N; i++) {
            const nextI = (i + 1) % N;
            const t1 = (i / N) * 2 * Math.PI;
            const t2 = ((i + 1) / N) * 2 * Math.PI;

            const cosS1 = signedPow(Math.cos(t1), 1 / 3);
            const sinS1 = signedPow(Math.sin(t1), 1 / 3);
            const cosS2 = signedPow(Math.cos(t2), 1 / 3);
            const sinS2 = signedPow(Math.sin(t2), 1 / 3);

            const outX1 = W / 2 + outW * cosS1;
            const outY1 = H / 2 + outH * sinS1;
            const outX2 = W / 2 + outW * cosS2;
            const outY2 = H / 2 + outH * sinS2;

            const inPt1 = ptsInner3d[i];
            const inPt2 = ptsInner3d[nextI];

            for (let j = 0; j < NR; j++) {
                const alpha1 = j / NR;
                const alpha2 = (j + 1) / NR;

                const q1x = (1 - alpha1) * inPt1.x + alpha1 * outX1;
                const q1y = (1 - alpha1) * inPt1.y + alpha1 * outY1;

                const q2x = (1 - alpha2) * inPt1.x + alpha2 * outX1;
                const q2y = (1 - alpha2) * inPt1.y + alpha2 * outY1;

                const q3x = (1 - alpha2) * inPt2.x + alpha2 * outX2;
                const q3y = (1 - alpha2) * inPt2.y + alpha2 * outY2;

                const q4x = (1 - alpha1) * inPt2.x + alpha1 * outX2;
                const q4y = (1 - alpha1) * inPt2.y + alpha1 * outY2;

                const midX = (q1x + q2x + q3x + q4x) / 4;
                const midY = (q1y + q2y + q3y + q4y) / 4;

                const u = Math.max(0.01, Math.min(0.99, midX / W));
                const v = Math.max(0.01, Math.min(0.99, 1 - (midY / H)));
                const col = sampleMirrorColor(helpers, u, v, stoneFallback);

                const c1 = toCanvas(helpers, q1x, q1y, 0);
                const c2 = toCanvas(helpers, q2x, q2y, 0);
                const c3 = toCanvas(helpers, q3x, q3y, 0);
                const c4 = toCanvas(helpers, q4x, q4y, 0);

                ctx.beginPath();
                ctx.moveTo(c1.x, c1.y);
                ctx.lineTo(c2.x, c2.y);
                ctx.lineTo(c3.x, c3.y);
                ctx.lineTo(c4.x, c4.y);
                ctx.closePath();
                ctx.fillStyle = col;
                ctx.fill();
            }
        }

        // Subtle ambient shadow overlay
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
        for (let i = 1; i < innerOpeningPts.length; i++) {
            ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fill('evenodd');
    }

    // Stroke outer front rect
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.stroke();

    // Stroke inner wavy opening
    ctx.beginPath();
    ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
    for (let i = 1; i < innerOpeningPts.length; i++) {
        ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // 6. Two strata lines on front face following the opening
    const outW = W / 2 - 2;
    const outH = H / 2 - 2;
    for (const alpha of [0.33, 0.66]) {
        const strataPts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < N; i++) {
            const t = (i / N) * 2 * Math.PI;
            const cosS = signedPow(Math.cos(t), 1 / 3);
            const sinS = signedPow(Math.sin(t), 1 / 3);
            const outerX = W / 2 + outW * cosS;
            const outerY = H / 2 + outH * sinS;
            const innerPt = ptsInner3d[i];
            const sx = (1 - alpha) * innerPt.x + alpha * outerX;
            const sy = (1 - alpha) * innerPt.y + alpha * outerY;
            strataPts.push(toCanvas(helpers, sx, sy, 0));
        }
        drawStrataLine(ctx, strataPts, helpers);
    }
}


/**
 * Dispatches drawing of a natural stone slab mirror onto a 2D canvas.
 * Follows the projection, outline style, and three face colours of axonometric.ts.
 */
export function drawMirror(
    ctx: CanvasRenderingContext2D,
    cls: AxoMirrorClass,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    ctx.save();
    ctx.lineWidth = helpers.lineWidth ?? 5;
    ctx.strokeStyle = helpers.colorOutline ?? '#111111';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (cls) {
        case 'mirror-round':
            drawRoundMirror(ctx, geo, helpers);
            break;
        case 'mirror-square':
        case 'mirror-rect':
            drawSlabBoxMirror(ctx, geo, helpers, cls);
            break;
    }

    ctx.restore();
}
