import { tr } from './i18n';

/**
 * axoExtra.ts — Extra geometry classes for the axonometric icon rasteriser.
 *
 * Why this exists:
 * The base geometry classifier (geometry.ts) only recognises 8 primitive shapes:
 * box, bowl, plate, mirror, cylinder, sphere, octahedron, polyhedron.
 * Roughly 38% of inventory items (table lamps, floor lamps, tower lamps, wall panels,
 * wine racks, tables, canoe bowls, and stone tubes) fall back to a plain box or bowl.
 *
 * This module introduces 9 dedicated visual classes to give those items authentic
 * axonometric silhouettes while keeping axonometric.ts and geometry.ts untouched.
 */

export type AxoExtraClass =
    | 'lamp-table'
    | 'lamp-floor'
    | 'lamp-tower'
    | 'lamp-pendant'
    | 'hull'
    | 'panel'
    | 'wine-rack'
    | 'table'
    | 'tube';

export const AXO_EXTRA_CLASSES: AxoExtraClass[] = [
    'lamp-table',
    'lamp-floor',
    'lamp-tower',
    'lamp-pendant',
    'hull',
    'panel',
    'wine-rack',
    'table',
    'tube',
];

export interface AxoPoint2D {
    x: number;
    y: number;
}

/**
 * Contextual helpers passed by the axonometric rasteriser into drawExtra().
 * Fully typed with no unknown or any types.
 */
export interface AxoDrawHelpers {
    /** 3D (x, y, z) to 2D isometric (u, v) projection function from axonometric.ts */
    project: (x: number, y: number, z: number) => { u: number; v: number };
    /** Uniform canvas scale factor */
    scale: number;
    /** Canvas horizontal center offset */
    cx: number;
    /** Canvas vertical center offset */
    cy: number;
    /** Shading colour for top isometric faces (lightest) */
    colorTop: string;
    /** Shading colour for right/front isometric faces (medium) */
    colorRight: string;
    /** Shading colour for left isometric faces (darkest) */
    colorLeft: string;
    /** Stroke outline colour */
    colorOutline?: string;
    /** Stroke line width (typically 5) */
    lineWidth?: number;
    /** Hole count for wine racks (defaults to 6 if unspecified) */
    holes?: number;
    /** Wireframe / hidden-line mode flag */
    isWireframe?: boolean;
    /** Optional repetitive pattern */
    hexPattern?: CanvasPattern | null;
    /** Optional shape text override (e.g. 'cylinder', 'round', 'squared', 'cube') */
    shapeText?: string;
}

/**
 * Normalises text by lower-casing and stripping diacritics so Spanish terms with
 * accents match cleanly against plain ASCII keys.
 */
function norm(s: string): string {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extracts a stated hole count (e.g. "8 holes", "6 agujeros") from inventory text.
 */
export function extractHolesCount(shapeStr: string = '', descStr: string = ''): number | undefined {
    const text = `${norm(shapeStr)} ${norm(descStr)}`;
    const m = text.match(/\b(\d+)\s*(?:holes?|agujeros?|orificios?|hoyos?)\b/);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Localised display label for each extra geometry class.
 */
export function getAxoExtraLabel(cls: AxoExtraClass): string {
    switch (cls) {
        case 'lamp-table':
            return tr('Table Lamp');
        case 'lamp-floor':
            return tr('Floor Lamp');
        case 'lamp-tower':
            return tr('Tower Lamp');
        case 'lamp-pendant':
            return tr('Pendant Lamp');
        case 'hull':
            return tr('Canoe');
        case 'panel':
            return tr('Wall Panel');
        case 'wine-rack':
            return tr('Wine Rack');
        case 'table':
            return tr('Table');
        case 'tube':
            return tr('Tube');
    }
}

/** Module-level store of the last classified item's normalised text */
let lastClassifiedShapeText = '';

/**
 * Classifies an inventory item from its shape and type/description strings into
 * one of the extra classes, or returns null so base classification handles it.
 */
export function classifyExtra(shape: string = '', type: string = ''): AxoExtraClass | null {
    const s = norm(shape);
    const t = norm(type);
    const text = `${s} ${t}`;
    lastClassifiedShapeText = text;

    const has = (...words: string[]) => words.some(w => text.includes(norm(w)));
    const shapeHas = (...words: string[]) => words.some(w => s.includes(norm(w)));

    // 1. Canoe / boat hull takes precedence over bowl
    if (has('canoe', 'canoa')) {
        return 'hull';
    }

    // 2. Existing core classes that MUST stay with base taxonomy
    // (mirror, bowl without canoe, plate, sphere, sculpture, standalone rock)
    if (has('mirror', 'espejo')) {
        return null;
    }
    if (has('bowl', 'tazon', 'cuenco')) {
        return null;
    }
    if (has('plate', 'plato', 'tray', 'dish')) {
        return null;
    }
    if (has('sphere', 'esfera')) {
        return null;
    }
    if (has('sculpture', 'escultura') && !has('table', 'mesa', 'lamp', 'lampara')) {
        return null;
    }
    if ((has('rock', 'piedra', 'fountain', 'fuente')) && !has('table', 'mesa', 'lamp', 'lampara', 'panel')) {
        return null;
    }

    // 3. Lamps
    // Table lamp
    if (
        has('table lamp', 'lampara de mesa', 'lamp table', 'lampara mesa', 'desk lamp', 'lampara de escritorio') ||
        (has('lamp', 'lampara') && has('table', 'mesa', 'escritorio'))
    ) {
        return 'lamp-table';
    }

    // Floor lamp
    if (
        has('floor lamp', 'lampara de pie', 'standing lamp', 'lampara de piso', 'lamp floor') ||
        (has('lamp', 'lampara') && has('floor', 'pie', 'piso', 'standing'))
    ) {
        return 'lamp-floor';
    }

    // Tower lamp
    if (
        has('tower lamp', 'lamp tower', 'lampara torre', 'lampara de torre') ||
        has('torre') ||
        (has('lamp', 'lampara') && has('tower', 'columna'))
    ) {
        return 'lamp-tower';
    }

    // Pendant lamp (any shape)
    if (has('pendant lamp', 'lampara colgante', 'pendant', 'colgante')) {
        return 'lamp-pendant';
    }

    // 4. Wall panels and luminaries
    if (
        has(
            'wall panel',
            'panel',
            'painted wall panel',
            'luminary',
            'luminaria',
            'luminario',
            'panel de pared',
            'panel mural',
            'panel pintado',
        )
    ) {
        return 'panel';
    }

    // 5. Wine rack
    const hasHolesPattern = /\b\d+\s*(?:holes?|agujeros?|orificios?|hoyos?)\b/.test(text);
    if (
        has('wine rack', 'winerack', 'botellero', 'portabotellas', 'porta botellas', 'porta vinos', 'portavinos', 'cava') ||
        (hasHolesPattern && (has('wine', 'vino', 'bottle', 'botella', 'rack') || !has('plate', 'bowl', 'mirror'))) ||
        (has('holes', 'agujeros') && has('wine', 'vino'))
    ) {
        return 'wine-rack';
    }

    // 6. Tables (must be checked after table lamp)
    if (
        has(
            'coffee table',
            'side table',
            'dining table',
            'end table',
            'accent table',
            'mesa de centro',
            'mesa lateral',
            'mesa de comedor',
            'mesa',
            'mesita',
            'table',
        )
    ) {
        return 'table';
    }

    // 7. Stone Tube: anything the text calls a cylinder or round that is not excluded above
    if (
        shapeHas('cylinder', 'cilinder', 'round', 'cilindro', 'redondo') ||
        has('cylinder', 'cilinder', 'round', 'cilindro', 'redondo')
    ) {
        return 'tube';
    }

    return null;
}

/**
 * Projects a 3D point (x, y, z) into 2D canvas pixel coordinates.
 */
function toCanvas(helpers: AxoDrawHelpers, x: number, y: number, z: number): AxoPoint2D {
    const p = helpers.project(x, y, z);
    return {
        x: helpers.cx + p.u * helpers.scale,
        y: helpers.cy + p.v * helpers.scale,
    };
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
 * Resolves shape preference (tube, post, or cube) from text hints or class default.
 */
function resolveShapePreference(
    helpers: AxoDrawHelpers,
    defaultShape: 'tube' | 'post',
): 'tube' | 'post' | 'cube' {
    const text = norm(helpers.shapeText ?? lastClassifiedShapeText);
    if (text) {
        if (['cube', 'cubo'].some(w => text.includes(w))) {
            return 'cube';
        }
        if (['squared', 'square', 'cuadrado', 'rectangular', 'rectangulo'].some(w => text.includes(w))) {
            return 'post';
        }
        if (['cylinder', 'cilinder', 'round', 'cilindro', 'redondo'].some(w => text.includes(w))) {
            return 'tube';
        }
    }
    return defaultShape;
}

interface StoneTubeOptions {
    hasCordTop?: boolean;
    hasCordFoot?: boolean;
    hasSlit?: boolean;
    openBottom?: boolean;
}

/**
 * Stone Tube: A hollow cylinder of natural stone, open on top (thick irregular rim
 * and inner wall showing), with 3 horizontal strata lines wrapping around the body.
 */
function drawStoneTube(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
    options: StoneTubeOptions = {},
): void {
    const { W, H, D } = geo;
    const cx3d = W / 2;
    const cz3d = D / 2;
    const rx = W / 2;
    const rz = D / 2;

    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);

    const a = rx * cos30;
    const b = -rx * sin30;
    const c = -rz * cos30;
    const d = -rz * sin30;

    const cb = helpers.project(cx3d, 0, cz3d);
    const ct = helpers.project(cx3d, H, cz3d);

    const t1 = Math.atan2(-rz, rx);
    const t2 = Math.atan2(rz, -rx);
    const x1 = Math.cos(t1);
    const z1 = Math.sin(t1);
    const x2 = Math.cos(t2);
    const z2 = Math.sin(t2);

    const u1 = a * x1 + c * z1;
    const v1 = b * x1 + d * z1;
    const u2 = a * x2 + c * z2;
    const v2 = b * x2 + d * z2;

    const pBotRight = { x: helpers.cx + (cb.u + u1) * helpers.scale, y: helpers.cy + (cb.v + v1) * helpers.scale };
    const pBotLeft = { x: helpers.cx + (cb.u + u2) * helpers.scale, y: helpers.cy + (cb.v + v2) * helpers.scale };
    const pTopRight = { x: helpers.cx + (ct.u + u1) * helpers.scale, y: helpers.cy + (ct.v + v1) * helpers.scale };
    const pTopLeft = { x: helpers.cx + (ct.u + u2) * helpers.scale, y: helpers.cy + (ct.v + v2) * helpers.scale };

    let tFrontStart = t2;
    let tFrontEnd = t1;
    if (tFrontEnd < tFrontStart) tFrontEnd += 2 * Math.PI;

    // 1. Bottom
    if (options.openBottom) {
        // Light shines out of the open bottom for pendant lamps
        ctx.beginPath();
        for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
            const ctVal = Math.min(t, 2 * Math.PI);
            const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
            const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
            const px = helpers.cx + (cb.u + u) * helpers.scale;
            const py = helpers.cy + (cb.v + v) * helpers.scale;
            if (t === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : '#FEF08A';
        ctx.fill();
        if (helpers.isWireframe) ctx.stroke();
    } else {
        ctx.beginPath();
        for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
            const ctVal = Math.min(t, 2 * Math.PI);
            const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
            const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
            const px = helpers.cx + (cb.u + u) * helpers.scale;
            const py = helpers.cy + (cb.v + v) * helpers.scale;
            if (t === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.colorRight;
        ctx.fill();
        if (helpers.isWireframe) ctx.stroke();
    }

    // Bottom front arc outline
    ctx.beginPath();
    for (let t = tFrontStart; t <= tFrontEnd + 0.05; t += 0.05) {
        const ctVal = Math.min(t, tFrontEnd);
        const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
        const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
        const px = helpers.cx + (cb.u + u) * helpers.scale;
        const py = helpers.cy + (cb.v + v) * helpers.scale;
        if (t === tFrontStart) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 2. Cylinder mantle body
    ctx.beginPath();
    ctx.moveTo(pBotLeft.x, pBotLeft.y);
    for (let t = tFrontStart; t <= tFrontEnd + 0.05; t += 0.05) {
        const ctVal = Math.min(t, tFrontEnd);
        const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
        const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
        ctx.lineTo(helpers.cx + (cb.u + u) * helpers.scale, helpers.cy + (cb.v + v) * helpers.scale);
    }
    ctx.lineTo(pTopRight.x, pTopRight.y);
    ctx.lineTo(pTopLeft.x, pTopLeft.y);
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        const shGrd = ctx.createLinearGradient(pBotLeft.x, 0, pBotRight.x, 0);
        shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
        shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
        shGrd.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = shGrd;
    } else {
        const grd = ctx.createLinearGradient(pBotLeft.x, 0, pBotRight.x, 0);
        grd.addColorStop(0, helpers.colorLeft);
        grd.addColorStop(1, helpers.colorRight);
        ctx.fillStyle = grd;
    }
    ctx.fill();

    // Side mantle edge strokes
    ctx.beginPath();
    ctx.moveTo(pBotRight.x, pBotRight.y);
    ctx.lineTo(pTopRight.x, pTopRight.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pBotLeft.x, pBotLeft.y);
    ctx.lineTo(pTopLeft.x, pTopLeft.y);
    ctx.stroke();

    // 3. Three horizontal strata lines wrapping the visible mantle
    if (!helpers.isWireframe) {
        const strataHeights = [H * 0.28, H * 0.52, H * 0.76];
        const tone1 = 'rgba(255, 255, 255, 0.28)';
        const tone2 = 'rgba(0, 0, 0, 0.22)';

        for (let i = 0; i < strataHeights.length; i++) {
            const sy = strataHeights[i];
            const sc = helpers.project(cx3d, sy, cz3d);
            const tone = i % 2 === 0 ? tone1 : tone2;

            ctx.save();
            ctx.beginPath();
            for (let t = tFrontStart; t <= tFrontEnd + 0.05; t += 0.05) {
                const ctVal = Math.min(t, tFrontEnd);
                const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
                const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
                const wave = Math.sin(ctVal * 3.5 + i * 2.1) * Math.min(2.5, H * 0.015 * helpers.scale);
                const px = helpers.cx + (sc.u + u) * helpers.scale;
                const py = helpers.cy + (sc.v + v) * helpers.scale + wave;
                if (t === tFrontStart) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.55);
            ctx.strokeStyle = tone;
            ctx.stroke();
            ctx.restore();
        }
    }

    // 4. Vertical light slit (for tower lamps)
    if (options.hasSlit) {
        const midT = (tFrontStart + tFrontEnd) / 2;
        const slitW = Math.max(2, rx * 0.18 * helpers.scale);
        const slitYBot = H * 0.16;
        const slitYTop = H * 0.84;
        const pSlitBot = helpers.project(cx3d, slitYBot, cz3d);
        const pSlitTop = helpers.project(cx3d, slitYTop, cz3d);

        const midU = a * Math.cos(midT) + c * Math.sin(midT);
        const midV = b * Math.cos(midT) + d * Math.sin(midT);

        const sxBot = helpers.cx + (pSlitBot.u + midU) * helpers.scale;
        const syBot = helpers.cy + (pSlitBot.v + midV) * helpers.scale;
        const sxTop = helpers.cx + (pSlitTop.u + midU) * helpers.scale;
        const syTop = helpers.cy + (pSlitTop.v + midV) * helpers.scale;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sxBot - slitW / 2, syBot);
        ctx.lineTo(sxBot + slitW / 2, syBot);
        ctx.lineTo(sxTop + slitW / 2, syTop);
        ctx.lineTo(sxTop - slitW / 2, syTop);
        ctx.closePath();

        ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : '#FEF08A';
        ctx.fill();
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.6);
        ctx.stroke();
        ctx.restore();
    }

    // 5. Open top: thick rim as a ring (outer and inner ellipse), inner wall one shade darker
    // Outer top ellipse
    ctx.beginPath();
    for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
        const ctVal = Math.min(t, 2 * Math.PI);
        const u = a * Math.cos(ctVal) + c * Math.sin(ctVal);
        const v = b * Math.cos(ctVal) + d * Math.sin(ctVal);
        const px = helpers.cx + (ct.u + u) * helpers.scale;
        const py = helpers.cy + (ct.v + v) * helpers.scale;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.hexPattern || helpers.colorTop;
    ctx.fill();
    ctx.stroke();

    // Inner top ellipse (thick stone rim opening)
    const rimScale = 0.72;
    ctx.beginPath();
    for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
        const ctVal = Math.min(t, 2 * Math.PI);
        const u = a * rimScale * Math.cos(ctVal) + c * rimScale * Math.sin(ctVal);
        const v = b * rimScale * Math.cos(ctVal) + d * rimScale * Math.sin(ctVal);
        const px = helpers.cx + (ct.u + u) * helpers.scale;
        const py = helpers.cy + (ct.v + v) * helpers.scale;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else {
        // Inner wall one shade darker
        const innerGrd = ctx.createLinearGradient(
            helpers.cx + ct.u * helpers.scale,
            helpers.cy + (ct.v - rz * sin30 * rimScale) * helpers.scale,
            helpers.cx + ct.u * helpers.scale,
            helpers.cy + (ct.v + rz * sin30 * rimScale) * helpers.scale,
        );
        innerGrd.addColorStop(0, helpers.colorLeft);
        innerGrd.addColorStop(1, helpers.colorRight);
        ctx.fillStyle = innerGrd;
        ctx.fill();
    }
    ctx.stroke();

    // 6. Accessories (cords)
    if (options.hasCordFoot) {
        // Thin power cord leaving foot
        const footX = pBotRight.x;
        const footY = pBotRight.y;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(footX, footY);
        ctx.bezierCurveTo(footX + 16, footY + 6, footX + 26, footY + 16, footX + 42, footY + 12);
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.4);
        ctx.stroke();
        ctx.restore();
    }

    if (options.hasCordTop) {
        // Pendant: thin cord rises to ceiling cap at canvas top
        const pTopCenter = {
            x: helpers.cx + ct.u * helpers.scale,
            y: helpers.cy + ct.v * helpers.scale,
        };
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pTopCenter.x, pTopCenter.y);
        ctx.lineTo(pTopCenter.x, 0);
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.4);
        ctx.stroke();

        const capW = 20;
        const capH = 6;
        ctx.beginPath();
        ctx.rect(pTopCenter.x - capW / 2, 0, capW, capH);
        ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.colorRight;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

interface StonePostOptions {
    isCube?: boolean;
    isChunky?: boolean;
    hasCordFoot?: boolean;
    hasSlit?: boolean;
    hasCordTop?: boolean;
    openBottom?: boolean;
}

/**
 * Stone Post / Cube: A column or cube of natural stone, open on top (thick rim
 * with an inset square), with 3 horizontal strata lines wrapping the visible faces.
 */
function drawStonePost(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
    options: StonePostOptions = {},
): void {
    let { W, H, D } = geo;

    if (options.isCube) {
        const avg = (W + H + D) / 3;
        W = avg;
        H = avg;
        D = avg;
    } else if (options.isChunky) {
        if (W < H * 0.28) W = Math.max(W, H * 0.28);
        if (D < H * 0.28) D = Math.max(D, H * 0.28);
    }

    // 1. Left face (darkest)
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

    // 2. Right / front face (medium)
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: W, y: 0, z: 0 },
            { x: W, y: H, z: 0 },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );

    // 3. Three horizontal strata lines wrapping the visible faces
    if (!helpers.isWireframe) {
        const strataHeights = [H * 0.28, H * 0.52, H * 0.76];
        const tone1 = 'rgba(255, 255, 255, 0.28)';
        const tone2 = 'rgba(0, 0, 0, 0.22)';

        for (let i = 0; i < strataHeights.length; i++) {
            const sy = strataHeights[i];
            const tone = i % 2 === 0 ? tone1 : tone2;
            const wave = (i % 2 === 0 ? 1 : -1) * 1.5;

            const pLeftBack = toCanvas(helpers, 0, sy, D);
            const pLeftMid = toCanvas(helpers, 0, sy, D / 2);
            const pCorner = toCanvas(helpers, 0, sy, 0);
            const pRightMid = toCanvas(helpers, W / 2, sy, 0);
            const pRightBack = toCanvas(helpers, W, sy, 0);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pLeftBack.x, pLeftBack.y);
            ctx.quadraticCurveTo(pLeftMid.x, pLeftMid.y + wave, pCorner.x, pCorner.y);
            ctx.quadraticCurveTo(pRightMid.x, pRightMid.y - wave, pRightBack.x, pRightBack.y);
            ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.55);
            ctx.strokeStyle = tone;
            ctx.stroke();
            ctx.restore();
        }
    }

    // 4. Vertical light slit on front face (for tower lamps)
    if (options.hasSlit) {
        const slitW = Math.max(2, W * 0.12);
        const slitBottom = H * 0.15;
        const slitTop = H * 0.85;
        const slitX = W * 0.5;

        const slitPts = [
            { x: slitX - slitW / 2, y: slitBottom, z: 0 },
            { x: slitX + slitW / 2, y: slitBottom, z: 0 },
            { x: slitX + slitW / 2, y: slitTop, z: 0 },
            { x: slitX - slitW / 2, y: slitTop, z: 0 },
        ];
        drawPolygonFace(
            ctx,
            helpers,
            slitPts,
            helpers.isWireframe ? 'rgba(0,0,0,0)' : '#FEF08A',
            'rgba(255, 255, 255, 0.4)',
        );
    }

    // 5. Open top: thick rim with an inset square, inner wall one shade darker
    // Outer top square
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

    // Inner top square (opening)
    const rimInsetX = W * 0.18;
    const rimInsetZ = D * 0.18;
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: rimInsetX, y: H, z: rimInsetZ },
            { x: W - rimInsetX, y: H, z: rimInsetZ },
            { x: W - rimInsetX, y: H, z: D - rimInsetZ },
            { x: rimInsetX, y: H, z: D - rimInsetZ },
        ],
        helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.colorRight,
        'rgba(0, 0, 0, 0.25)',
    );

    // 6. Accessories
    if (options.hasCordFoot) {
        // Power cord leaving foot
        const pFoot = toCanvas(helpers, 0, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pFoot.x, pFoot.y);
        ctx.bezierCurveTo(pFoot.x + 14, pFoot.y + 6, pFoot.x + 24, pFoot.y + 16, pFoot.x + 38, pFoot.y + 12);
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.4);
        ctx.stroke();
        ctx.restore();
    }

    if (options.hasCordTop) {
        // Pendant cord and ceiling cap
        const pTopCenter = toCanvas(helpers, W / 2, H, D / 2);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pTopCenter.x, pTopCenter.y);
        ctx.lineTo(pTopCenter.x, 0);
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = Math.max(2, (helpers.lineWidth ?? 5) * 0.4);
        ctx.stroke();

        const capW = 20;
        const capH = 6;
        ctx.beginPath();
        ctx.rect(pTopCenter.x - capW / 2, 0, capW, capH);
        ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.colorRight;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Table: A solid top slab on four legs.
 */
function drawTable(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const slabH = Math.max(2, Math.min(H * 0.14, 6));
    const legH = Math.max(1, H - slabH);
    const legSize = Math.max(2, Math.min(W * 0.08, D * 0.08, 5));
    const inset = Math.max(1, legSize * 0.3);

    // Four legs drawn in painter's order (back legs first, then front legs)
    const legBoxes = [
        { x: inset, z: D - legSize - inset }, // Back-left
        { x: W - legSize - inset, z: D - legSize - inset }, // Back-right
        { x: inset, z: inset }, // Front-left
        { x: W - legSize - inset, z: inset }, // Front-right
    ];

    for (const leg of legBoxes) {
        // Left face of leg
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: leg.x, y: 0, z: leg.z },
                { x: leg.x, y: 0, z: leg.z + legSize },
                { x: leg.x, y: legH, z: leg.z + legSize },
                { x: leg.x, y: legH, z: leg.z },
            ],
            helpers.colorLeft,
            'rgba(0, 0, 0, 0.35)',
        );
        // Right/front face of leg
        drawPolygonFace(
            ctx,
            helpers,
            [
                { x: leg.x, y: 0, z: leg.z },
                { x: leg.x + legSize, y: 0, z: leg.z },
                { x: leg.x + legSize, y: legH, z: leg.z },
                { x: leg.x, y: legH, z: leg.z },
            ],
            helpers.colorRight,
            'rgba(0, 0, 0, 0.15)',
        );
    }

    // Top slab
    // Left face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: legH, z: 0 },
            { x: 0, y: legH, z: D },
            { x: 0, y: H, z: D },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );
    // Right/front face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: legH, z: 0 },
            { x: W, y: legH, z: 0 },
            { x: W, y: H, z: 0 },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );
    // Top face
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
}

/**
 * Panel: A thin slab with a frame edge and vertical grooves.
 */
function drawPanel(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const slabD = Math.max(2, Math.min(D, 8));

    // Base slab body
    // Left face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: slabD },
            { x: 0, y: H, z: slabD },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );
    // Top face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: H, z: 0 },
            { x: W, y: H, z: 0 },
            { x: W, y: H, z: slabD },
            { x: 0, y: H, z: slabD },
        ],
        helpers.colorTop,
        'rgba(255, 255, 255, 0.15)',
    );
    // Front face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: W, y: 0, z: 0 },
            { x: W, y: H, z: 0 },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );

    // Raised / inset frame edge on the front face (z = 0)
    const frameInset = Math.max(3, Math.min(W * 0.08, H * 0.08, 8));
    const innerPanelPts = [
        { x: frameInset, y: frameInset, z: 0 },
        { x: W - frameInset, y: frameInset, z: 0 },
        { x: W - frameInset, y: H - frameInset, z: 0 },
        { x: frameInset, y: H - frameInset, z: 0 },
    ];
    drawPolygonFace(
        ctx,
        helpers,
        innerPanelPts,
        helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.colorTop,
        'rgba(255, 255, 255, 0.2)',
    );

    // Vertical grooves inside the inner panel
    const usableW = W - 2 * frameInset;
    const numGrooves = Math.max(3, Math.min(8, Math.round(usableW / 6)));
    const grooveSpacing = usableW / (numGrooves + 1);

    for (let i = 1; i <= numGrooves; i++) {
        const gx = frameInset + i * grooveSpacing;
        const pBot = toCanvas(helpers, gx, frameInset, 0);
        const pTop = toCanvas(helpers, gx, H - frameInset, 0);

        ctx.beginPath();
        ctx.moveTo(pBot.x, pBot.y);
        ctx.lineTo(pTop.x, pTop.y);
        ctx.stroke();
    }
}

/**
 * Wine Rack: A thin block with a grid of round holes on the front face.
 */
function drawWineRack(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const rackD = Math.max(4, Math.min(D, 20));

    // Base block
    // Left face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: rackD },
            { x: 0, y: H, z: rackD },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );
    // Top face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: H, z: 0 },
            { x: W, y: H, z: 0 },
            { x: W, y: H, z: rackD },
            { x: 0, y: H, z: rackD },
        ],
        helpers.colorTop,
        'rgba(255, 255, 255, 0.15)',
    );
    // Front face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: W, y: 0, z: 0 },
            { x: W, y: H, z: 0 },
            { x: 0, y: H, z: 0 },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );

    // Grid of holes on front face (z = 0 plane)
    const count = helpers.holes && helpers.holes > 0 ? helpers.holes : 6;
    const cols = W < H * 0.5 ? (count <= 4 ? 1 : 2) : Math.max(2, Math.min(4, Math.round(Math.sqrt(count * (W / H)))));
    const rows = Math.ceil(count / cols);

    const marginW = W * 0.15;
    const marginH = H * 0.12;
    const usableW = W - 2 * marginW;
    const usableH = H - 2 * marginH;
    const colStep = cols > 1 ? usableW / (cols - 1) : 0;
    const rowStep = rows > 1 ? usableH / (rows - 1) : 0;
    const maxR = Math.min(
        colStep > 0 ? colStep * 0.36 : usableW * 0.38,
        rowStep > 0 ? rowStep * 0.36 : usableH * 0.38,
        7,
    );
    const radius = Math.max(2, maxR);

    for (let k = 0; k < count; k++) {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const cxHole = cols > 1 ? marginW + c * colStep : W / 2;
        const cyHole = rows > 1 ? marginH + (rows - 1 - r) * rowStep : H / 2;

        ctx.beginPath();
        let firstPt: AxoPoint2D | null = null;
        for (let theta = 0; theta <= 2 * Math.PI + 0.05; theta += 0.1) {
            const tVal = Math.min(theta, 2 * Math.PI);
            const x = cxHole + radius * Math.cos(tVal);
            const y = cyHole + radius * Math.sin(tVal);
            const pt = toCanvas(helpers, x, y, 0);
            if (theta === 0) {
                firstPt = pt;
                ctx.moveTo(pt.x, pt.y);
            } else {
                ctx.lineTo(pt.x, pt.y);
            }
        }
        ctx.closePath();

        if (helpers.isWireframe) {
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fill();
        } else if (firstPt) {
            const holeCenter = toCanvas(helpers, cxHole, cyHole, 0);
            const holeGrd = ctx.createLinearGradient(
                holeCenter.x,
                holeCenter.y - radius * helpers.scale,
                holeCenter.x,
                holeCenter.y + radius * helpers.scale,
            );
            holeGrd.addColorStop(0, '#555555');
            holeGrd.addColorStop(1, '#0A0A0A');
            ctx.fillStyle = holeGrd;
            ctx.fill();
        }
        ctx.stroke();
    }
}

/**
 * Hull: A long, low, shallow oval trough of natural onyx (canoe / canoa).
 * Follows stadium footprint (straight sides, rounded ends), leaning walls,
 * thin rim with an inner hollow, recessed floor, and soft banding.
 */
function drawHull(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const lengthW = Math.max(geo.W, 10);
    const depthD = Math.max(geo.D, 4);
    const heightH = Math.max(geo.H, 1);

    const radius = depthD / 2;
    const straightL = Math.max(0, lengthW - depthD);
    const cx0 = lengthW / 2;
    const cz0 = depthD / 2;

    // Sample stadium footprint with 56 points
    // Starting on the back straight edge (z = depthD) so visible front quads form a single contiguous interval
    const N = 56;
    const arcLen = Math.PI * radius;
    const totalPerimeter = 2 * straightL + 2 * arcLen;

    interface PerimeterPt {
        x: number;
        z: number;
        nx: number;
        nz: number;
    }

    const basePts: PerimeterPt[] = [];
    for (let i = 0; i < N; i++) {
        const s = (i / N) * totalPerimeter;
        let x = 0;
        let z = 0;
        let nx = 0;
        let nz = 0;

        if (s < straightL) {
            // 1. Back straight edge (z = depthD, x goes from cx0 + straightL / 2 down to cx0 - straightL / 2)
            const sBack = s;
            x = radius + straightL - sBack;
            z = depthD;
            nx = 0;
            nz = 1;
        } else if (s < straightL + arcLen) {
            // 2. Left semicircle (around center (radius, cz0), theta from pi/2 to 3pi/2)
            const sArc = s - straightL;
            const theta = Math.PI / 2 + (sArc / arcLen) * Math.PI;
            x = radius + radius * Math.cos(theta);
            z = cz0 + radius * Math.sin(theta);
            nx = Math.cos(theta);
            nz = Math.sin(theta);
        } else if (s < 2 * straightL + arcLen) {
            // 3. Front straight edge (z = 0, x goes from radius up to radius + straightL)
            const sFront = s - (straightL + arcLen);
            x = radius + sFront;
            z = 0;
            nx = 0;
            nz = -1;
        } else {
            // 4. Right semicircle (around center (radius + straightL, cz0), theta from -pi/2 to pi/2)
            const sArc = s - (2 * straightL + arcLen);
            const theta = -Math.PI / 2 + (sArc / arcLen) * Math.PI;
            x = radius + straightL + radius * Math.cos(theta);
            z = cz0 + radius * Math.sin(theta);
            nx = Math.cos(theta);
            nz = Math.sin(theta);
        }

        basePts.push({ x, z, nx, nz });
    }

    // Top footprint: 4% larger than base, walls lean outward slightly
    const topScale = 1.04;
    const insetRim = 0.06 * depthD;
    const insetFloor = insetRim + 0.10 * depthD;
    const floorY = heightH * 0.65; // lowered by 35% of H

    const ptsBase = basePts.map(p => ({ x: p.x, y: 0, z: p.z }));
    const ptsTop = basePts.map(p => ({
        x: cx0 + (p.x - cx0) * topScale,
        y: heightH,
        z: cz0 + (p.z - cz0) * topScale,
    }));
    const ptsInnerTop = ptsTop.map((p, idx) => ({
        x: p.x - basePts[idx].nx * insetRim,
        y: heightH,
        z: p.z - basePts[idx].nz * insetRim,
    }));
    const ptsFloor = ptsTop.map((p, idx) => ({
        x: p.x - basePts[idx].nx * insetFloor,
        y: floorY,
        z: p.z - basePts[idx].nz * insetFloor,
    }));

    // Project all point sets to 2D canvas coordinates
    const pBase2D = ptsBase.map(p => toCanvas(helpers, p.x, p.y, p.z));
    const pTop2D = ptsTop.map(p => toCanvas(helpers, p.x, p.y, p.z));
    const pInnerTop2D = ptsInnerTop.map(p => toCanvas(helpers, p.x, p.y, p.z));
    const pFloor2D = ptsFloor.map(p => toCanvas(helpers, p.x, p.y, p.z));

    // Determine visibility of each side wall quad
    const isQuadVis: boolean[] = [];
    for (let k = 0; k < N; k++) {
        const next = (k + 1) % N;
        const p0 = pBase2D[k];
        const p1 = pBase2D[next];
        const p3 = pTop2D[k];
        const cross = (p1.x - p0.x) * (p3.y - p0.y) - (p1.y - p0.y) * (p3.x - p0.x);
        isQuadVis.push(cross < -0.001);
    }

    // Identify the contiguous chain of visible quads
    let startK = -1;
    for (let k = 0; k < N; k++) {
        const prev = (k - 1 + N) % N;
        if (isQuadVis[k] && !isQuadVis[prev]) {
            startK = k;
            break;
        }
    }
    const visibleIndices: number[] = [];
    if (startK !== -1) {
        let curr = startK;
        while (isQuadVis[curr]) {
            visibleIndices.push(curr);
            curr = (curr + 1) % N;
            if (curr === startK) break;
        }
    }

    // 1. Fill visible side wall quads by normal direction
    for (const k of visibleIndices) {
        const next = (k + 1) % N;
        const p0 = pBase2D[k];
        const p1 = pBase2D[next];
        const p2 = pTop2D[next];
        const p3 = pTop2D[k];

        const midNx = (basePts[k].nx + basePts[next].nx) / 2;
        const midNz = (basePts[k].nz + basePts[next].nz) / 2;
        const isLeft = midNx < midNz;
        const fillColor = isLeft ? helpers.colorLeft : helpers.colorRight;
        const shadeOverlay = isLeft ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.15)';

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();

        if (helpers.isWireframe) {
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fill();
        } else if (helpers.hexPattern) {
            ctx.fillStyle = helpers.hexPattern;
            ctx.fill();
            ctx.fillStyle = shadeOverlay;
            ctx.fill();
        } else {
            ctx.fillStyle = fillColor;
            ctx.fill();
            // Tiny stroke matching fill to prevent subpixel antialiasing seams
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    // 2. Stroke silhouette on outer body (profile sides and bottom curve on table)
    if (visibleIndices.length > 0) {
        const sK = visibleIndices[0];
        const eK = (visibleIndices[visibleIndices.length - 1] + 1) % N;

        ctx.save();
        ctx.strokeStyle = helpers.colorOutline ?? '#111111';
        ctx.lineWidth = helpers.lineWidth ?? 5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pTop2D[sK].x, pTop2D[sK].y);
        ctx.lineTo(pBase2D[sK].x, pBase2D[sK].y);
        for (let i = 0; i < visibleIndices.length; i++) {
            const nextK = (visibleIndices[i] + 1) % N;
            ctx.lineTo(pBase2D[nextK].x, pBase2D[nextK].y);
        }
        ctx.lineTo(pTop2D[eK].x, pTop2D[eK].y);
        ctx.stroke();
        ctx.restore();
    }

    // 3. One soft band line along the outside wall
    if (!helpers.isWireframe && visibleIndices.length > 0) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < visibleIndices.length; i++) {
            const k = visibleIndices[i];
            const bx = ptsBase[k].x * 0.58 + ptsTop[k].x * 0.42;
            const bz = ptsBase[k].z * 0.58 + ptsTop[k].z * 0.42;
            const pt = toCanvas(helpers, bx, heightH * 0.42, bz);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        const eK = (visibleIndices[visibleIndices.length - 1] + 1) % N;
        const endBx = ptsBase[eK].x * 0.58 + ptsTop[eK].x * 0.42;
        const endBz = ptsBase[eK].z * 0.58 + ptsTop[eK].z * 0.42;
        const endPt = toCanvas(helpers, endBx, heightH * 0.42, endBz);
        ctx.lineTo(endPt.x, endPt.y);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = Math.max(1.5, (helpers.lineWidth ?? 5) * 0.4);
        ctx.stroke();
        ctx.restore();
    }

    // 4. Shallow hollow interior: inner polygon filled one shade darker than colorTop
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
        else ctx.lineTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fill();
    } else {
        // colorRight is the intermediate shade between colorTop and colorLeft
        ctx.fillStyle = helpers.colorRight;
        ctx.fill();
    }

    // 5. Floor: second inner polygon in colorLeft
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pFloor2D[k].x, pFloor2D[k].y);
        else ctx.lineTo(pFloor2D[k].x, pFloor2D[k].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
    } else {
        ctx.fillStyle = helpers.colorLeft;
        ctx.fill();
    }
    if (!helpers.isWireframe) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = Math.max(1, (helpers.lineWidth ?? 5) * 0.3);
        ctx.stroke();
        ctx.restore();
    }

    // 6. Rim: outer top polygon minus inner polygon, filled with colorTop using even-odd rule
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pTop2D[k].x, pTop2D[k].y);
        else ctx.lineTo(pTop2D[k].x, pTop2D[k].y);
    }
    ctx.closePath();

    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
        else ctx.lineTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
    }
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill('evenodd');
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill('evenodd');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill('evenodd');
    } else {
        ctx.fillStyle = helpers.colorTop;
        ctx.fill('evenodd');
    }

    // 7. Outline strokes on the outer and inner rim
    ctx.save();
    ctx.strokeStyle = helpers.colorOutline ?? '#111111';
    ctx.lineWidth = helpers.lineWidth ?? 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pTop2D[k].x, pTop2D[k].y);
        else ctx.lineTo(pTop2D[k].x, pTop2D[k].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let k = 0; k < N; k++) {
        if (k === 0) ctx.moveTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
        else ctx.lineTo(pInnerTop2D[k].x, pInnerTop2D[k].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

/**
 * Tower Lamp: A chunky stone post (or stone tube if round) with a vertical light slit on one face.
 */
function drawLampTower(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const pref = resolveShapePreference(helpers, 'post');
    if (pref === 'tube') {
        drawStoneTube(ctx, geo, helpers, { hasSlit: true });
    } else {
        drawStonePost(ctx, geo, helpers, { isChunky: true, hasSlit: true });
    }
}

/**
 * Table Lamp: A natural stone tube (round), stone cube (cube or W, H, D within 25%),
 * or stone post (squared), with a thin power cord leaving the foot.
 */
function drawLampTable(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const pref = resolveShapePreference(helpers, 'tube');
    const maxDim = Math.max(geo.W, geo.H, geo.D);
    const minDim = Math.min(geo.W, geo.H, geo.D);
    const isWithin25 = maxDim > 0 && (maxDim - minDim) / maxDim <= 0.25;

    if (pref === 'cube' || isWithin25) {
        drawStonePost(ctx, geo, helpers, { isCube: true, hasCordFoot: true });
    } else if (pref === 'post') {
        drawStonePost(ctx, geo, helpers, { hasCordFoot: true });
    } else {
        drawStoneTube(ctx, geo, helpers, { hasCordFoot: true });
    }
}

/**
 * Floor Lamp: A natural stone post (or stone tube if round) standing on the floor.
 */
function drawLampFloor(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const pref = resolveShapePreference(helpers, 'post');
    if (pref === 'tube') {
        drawStoneTube(ctx, geo, helpers);
    } else {
        drawStonePost(ctx, geo, helpers);
    }
}

/**
 * Pendant Lamp: A natural stone tube (or post if squared) hung from a thin cord
 * to the canvas top with a ceiling cap, and light shining out of the open bottom.
 */
function drawLampPendant(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const pref = resolveShapePreference(helpers, 'tube');
    if (pref === 'post' || pref === 'cube') {
        drawStonePost(ctx, geo, helpers, { hasCordTop: true, openBottom: true });
    } else {
        drawStoneTube(ctx, geo, helpers, { hasCordTop: true, openBottom: true });
    }
}

/**
 * Plain Stone Tube: A hollow cylinder of natural stone.
 */
function drawTube(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    drawStoneTube(ctx, geo, helpers);
}

/**
 * Dispatches drawing of an extra axonometric geometry class onto a 2D canvas.
 * Follows the exact shading, stroke, and projection conventions of axonometric.ts.
 */
export function drawExtra(
    ctx: CanvasRenderingContext2D,
    cls: AxoExtraClass,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    ctx.save();
    ctx.lineWidth = helpers.lineWidth ?? 5;
    ctx.strokeStyle = helpers.colorOutline ?? '#111111';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (cls) {
        case 'table':
            drawTable(ctx, geo, helpers);
            break;
        case 'panel':
            drawPanel(ctx, geo, helpers);
            break;
        case 'wine-rack':
            drawWineRack(ctx, geo, helpers);
            break;
        case 'hull':
            drawHull(ctx, geo, helpers);
            break;
        case 'lamp-tower':
            drawLampTower(ctx, geo, helpers);
            break;
        case 'lamp-table':
            drawLampTable(ctx, geo, helpers);
            break;
        case 'lamp-floor':
            drawLampFloor(ctx, geo, helpers);
            break;
        case 'lamp-pendant':
            drawLampPendant(ctx, geo, helpers);
            break;
        case 'tube':
            drawTube(ctx, geo, helpers);
            break;
    }

    ctx.restore();
}
