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

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        const shGrd = ctx.createLinearGradient(
            frontMantlePts[M].x,
            frontMantlePts[M].y,
            frontMantlePts[0].x,
            frontMantlePts[0].y,
        );
        shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
        shGrd.addColorStop(1, 'rgba(255,255,255,0.15)');
        ctx.fillStyle = shGrd;
        ctx.fill();
    } else {
        const mantleGrd = ctx.createLinearGradient(
            frontMantlePts[M].x,
            frontMantlePts[M].y,
            frontMantlePts[0].x,
            frontMantlePts[0].y,
        );
        mantleGrd.addColorStop(0, helpers.colorLeft);
        mantleGrd.addColorStop(1, helpers.colorTop);
        ctx.fillStyle = mantleGrd;
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
        sheenGrd.addColorStop(0, helpers.colorTop);
        sheenGrd.addColorStop(0.44, helpers.colorTop);
        sheenGrd.addColorStop(0.49, '#FFFFFF');
        sheenGrd.addColorStop(0.54, helpers.colorTop);
        sheenGrd.addColorStop(1, helpers.colorTop);

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

    ctx.beginPath();
    // Outer circle
    ctx.moveTo(outerCirclePts[0].x, outerCirclePts[0].y);
    for (let i = 1; i < outerCirclePts.length; i++) {
        ctx.lineTo(outerCirclePts[i].x, outerCirclePts[i].y);
    }
    ctx.closePath();
    // Inner wavy opening
    ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
    for (let i = 1; i < innerOpeningPts.length; i++) {
        ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill('evenodd');
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill('evenodd');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fill('evenodd');
    } else {
        ctx.fillStyle = helpers.colorRight;
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
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: D },
            { x: 0, y: H, z: D },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );

    // 2. Top face of slab box (y = H)
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: H, z: 0 },
            { x: W, y: H, z: 0 },
            { x: W, y: H, z: D },
            { x: 0, y: H, z: D },
        ],
        helpers.colorTop,
        'rgba(255, 255, 255, 0.15)',
    );

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
        sheenGrd.addColorStop(0, helpers.colorTop);
        sheenGrd.addColorStop(0.44, helpers.colorTop);
        sheenGrd.addColorStop(0.49, '#FFFFFF');
        sheenGrd.addColorStop(0.54, helpers.colorTop);
        sheenGrd.addColorStop(1, helpers.colorTop);

        ctx.fillStyle = sheenGrd;
        ctx.fill();
    }

    // 5. Front slab face at z = 0 (outer rectangle with inner wavy opening)
    const p0 = toCanvas(helpers, 0, 0, 0);
    const p1 = toCanvas(helpers, W, 0, 0);
    const p2 = toCanvas(helpers, W, H, 0);
    const p3 = toCanvas(helpers, 0, H, 0);

    const innerOpeningPts = ptsInner3d.map(p => toCanvas(helpers, p.x, p.y, 0));

    ctx.beginPath();
    // Outer rect
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    // Inner wavy opening
    ctx.moveTo(innerOpeningPts[0].x, innerOpeningPts[0].y);
    for (let i = 1; i < innerOpeningPts.length; i++) {
        ctx.lineTo(innerOpeningPts[i].x, innerOpeningPts[i].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill('evenodd');
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill('evenodd');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fill('evenodd');
    } else {
        ctx.fillStyle = helpers.colorRight;
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
