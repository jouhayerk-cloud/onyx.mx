import { tr } from './i18n';

/**
 * axoExtra.ts — Extra geometry classes for the axonometric icon rasteriser.
 *
 * Why this exists:
 * The base geometry classifier (geometry.ts) only recognises 8 primitive shapes:
 * box, bowl, plate, mirror, cylinder, sphere, octahedron, polyhedron.
 * Roughly 38% of inventory items (table lamps, floor lamps, tower lamps, wall panels,
 * wine racks, tables, and canoe bowls) fall back to a plain box or bowl.
 *
 * This module introduces 8 dedicated visual classes to give those items authentic
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
    | 'table';

export const AXO_EXTRA_CLASSES: AxoExtraClass[] = [
    'lamp-table',
    'lamp-floor',
    'lamp-tower',
    'lamp-pendant',
    'hull',
    'panel',
    'wine-rack',
    'table',
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
    }
}

/**
 * Classifies an inventory item from its shape and type/description strings into
 * one of the 8 extra classes, or returns null so base classification handles it.
 *
 * Rules:
 * - table lamp, lampara de mesa -> lamp-table
 * - floor lamp, lampara de pie -> lamp-floor
 * - tower lamp, torre -> lamp-tower
 * - pendant lamp or pendant with a square or cube shade is NOT ours (stays with cylinder)
 *   UNLESS explicitly described as pendant lamp with squared -> lamp-pendant
 * - canoe, canoa -> hull
 * - wall panel, panel, painted wall panel, luminary -> panel
 * - wine rack, N holes -> wine-rack
 * - table, coffee table, mesa -> table
 * - mirror, bowl, plate, rock, sculpture, sphere stay with existing base classes -> null
 */
export function classifyExtra(shape: string = '', type: string = ''): AxoExtraClass | null {
    const s = norm(shape);
    const t = norm(type);
    const text = `${s} ${t}`;

    const has = (...words: string[]) => words.some(w => text.includes(norm(w)));

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

    // Pendant lamp with squared shade
    // Regular pendant or pendant with square/cube shade stays with cylinder;
    // only "pendant lamp with squared" (or Spanish equivalent) maps to lamp-pendant.
    const isPendantSquared =
        has('pendant lamp with squared', 'pendant lamp squared', 'lampara colgante cuadrada', 'colgante cuadrado') ||
        (has('pendant', 'colgante') && has('lamp', 'lampara') && has('squared', 'cuadrad'));
    if (isPendantSquared) {
        return 'lamp-pendant';
    }
    if (has('pendant', 'colgante')) {
        return null;
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
 * Renders an axonometric cylinder matching the base rasteriser's conventions.
 */
function drawIsoCylinder(
    ctx: CanvasRenderingContext2D,
    helpers: AxoDrawHelpers,
    cx3d: number,
    cz3d: number,
    yBottom: number,
    yTop: number,
    radiusX: number,
    radiusZ: number,
): void {
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);

    const a = radiusX * cos30;
    const b = -radiusX * sin30;
    const c = -radiusZ * cos30;
    const d = -radiusZ * sin30;

    const cb = helpers.project(cx3d, yBottom, cz3d);
    const ct = helpers.project(cx3d, yTop, cz3d);

    const t1 = Math.atan2(-radiusZ, radiusX);
    const t2 = Math.atan2(radiusZ, -radiusX);
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

    // 1. Bottom ellipse
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

    // Bottom front arc stroke
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

    // 2. Side mantle
    ctx.beginPath();
    ctx.moveTo(pBotRight.x, pBotRight.y);
    ctx.lineTo(pTopRight.x, pTopRight.y);
    ctx.lineTo(pTopLeft.x, pTopLeft.y);
    ctx.lineTo(pBotLeft.x, pBotLeft.y);
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

    ctx.beginPath();
    ctx.moveTo(pBotRight.x, pBotRight.y);
    ctx.lineTo(pTopRight.x, pTopRight.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pBotLeft.x, pBotLeft.y);
    ctx.lineTo(pTopLeft.x, pTopLeft.y);
    ctx.stroke();

    // 3. Top cap ellipse
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
 * Hull: A long boat hull with pointed ends and an inner rim (canoe / canoa).
 */
function drawHull(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;

    const pStern = toCanvas(helpers, 0, H, D / 2); // Left tip
    const pBow = toCanvas(helpers, W, H, D / 2); // Right tip
    const pMidFront = toCanvas(helpers, W / 2, H * 0.82, 0); // Front gunwale center
    const pMidBack = toCanvas(helpers, W / 2, H * 0.82, D); // Back gunwale center
    const pKeel = toCanvas(helpers, W / 2, 0, D / 2); // Bottom center

    // Outer hull body (sweeping front/bottom face)
    ctx.beginPath();
    ctx.moveTo(pStern.x, pStern.y);
    ctx.bezierCurveTo(pStern.x, pKeel.y, pKeel.x - (pKeel.x - pStern.x) * 0.4, pKeel.y, pKeel.x, pKeel.y);
    ctx.bezierCurveTo(pKeel.x + (pBow.x - pKeel.x) * 0.4, pKeel.y, pBow.x, pKeel.y, pBow.x, pBow.y);
    ctx.bezierCurveTo(
        pBow.x - (pBow.x - pMidFront.x) * 0.5,
        pMidFront.y,
        pMidFront.x + (pBow.x - pMidFront.x) * 0.3,
        pMidFront.y,
        pMidFront.x,
        pMidFront.y,
    );
    ctx.bezierCurveTo(
        pMidFront.x - (pMidFront.x - pStern.x) * 0.3,
        pMidFront.y,
        pStern.x + (pMidFront.x - pStern.x) * 0.5,
        pMidFront.y,
        pStern.x,
        pStern.y,
    );
    ctx.closePath();

    if (helpers.isWireframe) {
        ctx.fillStyle = 'rgba(0,0,0,0)';
    } else if (helpers.hexPattern) {
        ctx.fillStyle = helpers.hexPattern;
        ctx.fill();
        const shGrd = ctx.createLinearGradient(pStern.x, 0, pBow.x, 0);
        shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
        shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
        shGrd.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = shGrd;
    } else {
        const grd = ctx.createLinearGradient(pStern.x, 0, pBow.x, 0);
        grd.addColorStop(0, helpers.colorLeft);
        grd.addColorStop(1, helpers.colorRight);
        ctx.fillStyle = grd;
    }
    ctx.fill();

    // Outline bottom sweeping keel curve
    ctx.beginPath();
    ctx.moveTo(pStern.x, pStern.y);
    ctx.bezierCurveTo(pStern.x, pKeel.y, pKeel.x - (pKeel.x - pStern.x) * 0.4, pKeel.y, pKeel.x, pKeel.y);
    ctx.bezierCurveTo(pKeel.x + (pBow.x - pKeel.x) * 0.4, pKeel.y, pBow.x, pKeel.y, pBow.x, pBow.y);
    ctx.stroke();

    // Top rim (outer gunwales)
    ctx.beginPath();
    ctx.moveTo(pStern.x, pStern.y);
    ctx.bezierCurveTo(
        pStern.x + (pMidFront.x - pStern.x) * 0.5,
        pMidFront.y,
        pMidFront.x - (pMidFront.x - pStern.x) * 0.3,
        pMidFront.y,
        pMidFront.x,
        pMidFront.y,
    );
    ctx.bezierCurveTo(
        pMidFront.x + (pBow.x - pMidFront.x) * 0.3,
        pMidFront.y,
        pBow.x - (pBow.x - pMidFront.x) * 0.5,
        pMidFront.y,
        pBow.x,
        pBow.y,
    );
    ctx.bezierCurveTo(
        pBow.x - (pBow.x - pMidBack.x) * 0.5,
        pMidBack.y,
        pMidBack.x + (pBow.x - pMidBack.x) * 0.3,
        pMidBack.y,
        pMidBack.x,
        pMidBack.y,
    );
    ctx.bezierCurveTo(
        pMidBack.x - (pMidBack.x - pStern.x) * 0.3,
        pMidBack.y,
        pStern.x + (pMidBack.x - pStern.x) * 0.5,
        pMidBack.y,
        pStern.x,
        pStern.y,
    );
    ctx.closePath();

    ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : helpers.hexPattern || helpers.colorTop;
    ctx.fill();
    ctx.stroke();

    // Inner rim (hollow hull interior)
    const pInnerStern = toCanvas(helpers, W * 0.08, H * 0.82, D / 2);
    const pInnerBow = toCanvas(helpers, W * 0.92, H * 0.82, D / 2);
    const pInnerFront = toCanvas(helpers, W / 2, H * 0.82, D * 0.16);
    const pInnerBack = toCanvas(helpers, W / 2, H * 0.82, D * 0.84);

    ctx.beginPath();
    ctx.moveTo(pInnerStern.x, pInnerStern.y);
    ctx.bezierCurveTo(
        pInnerStern.x + (pInnerFront.x - pInnerStern.x) * 0.5,
        pInnerFront.y,
        pInnerFront.x - (pInnerFront.x - pInnerStern.x) * 0.3,
        pInnerFront.y,
        pInnerFront.x,
        pInnerFront.y,
    );
    ctx.bezierCurveTo(
        pInnerFront.x + (pInnerBow.x - pInnerFront.x) * 0.3,
        pInnerFront.y,
        pInnerBow.x - (pInnerBow.x - pInnerFront.x) * 0.5,
        pInnerFront.y,
        pInnerBow.x,
        pInnerBow.y,
    );
    ctx.bezierCurveTo(
        pInnerBow.x - (pInnerBow.x - pInnerBack.x) * 0.5,
        pInnerBack.y,
        pInnerBack.x + (pInnerBow.x - pInnerBack.x) * 0.3,
        pInnerBack.y,
        pInnerBack.x,
        pInnerBack.y,
    );
    ctx.bezierCurveTo(
        pInnerBack.x - (pInnerBack.x - pInnerStern.x) * 0.3,
        pInnerBack.y,
        pInnerStern.x + (pInnerBack.x - pInnerStern.x) * 0.5,
        pInnerBack.y,
        pInnerStern.x,
        pInnerStern.y,
    );
    ctx.closePath();

    ctx.fillStyle = helpers.isWireframe ? 'rgba(0,0,0,0)' : '#C0C0C0';
    ctx.fill();
    ctx.stroke();
}

/**
 * Tower Lamp: A tall square column with two lit slits and a plinth.
 */
function drawLampTower(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const plinthH = Math.max(3, H * 0.08);

    // 1. Plinth (base plinth box)
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: D },
            { x: 0, y: plinthH, z: D },
            { x: 0, y: plinthH, z: 0 },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: 0, z: 0 },
            { x: W, y: 0, z: 0 },
            { x: W, y: plinthH, z: 0 },
            { x: 0, y: plinthH, z: 0 },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: 0, y: plinthH, z: 0 },
            { x: W, y: plinthH, z: 0 },
            { x: W, y: plinthH, z: D },
            { x: 0, y: plinthH, z: D },
        ],
        helpers.colorTop,
        'rgba(255, 255, 255, 0.15)',
    );

    // 2. Tower column
    const colInset = Math.max(2, Math.min(W, D) * 0.08);
    const colLeft = colInset;
    const colRight = W - colInset;
    const colBack = D - colInset;

    // Left face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: colLeft, y: plinthH, z: colInset },
            { x: colLeft, y: plinthH, z: colBack },
            { x: colLeft, y: H, z: colBack },
            { x: colLeft, y: H, z: colInset },
        ],
        helpers.colorLeft,
        'rgba(0, 0, 0, 0.35)',
    );
    // Front face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: colLeft, y: plinthH, z: colInset },
            { x: colRight, y: plinthH, z: colInset },
            { x: colRight, y: H, z: colInset },
            { x: colLeft, y: H, z: colInset },
        ],
        helpers.colorRight,
        'rgba(0, 0, 0, 0.15)',
    );
    // Top face
    drawPolygonFace(
        ctx,
        helpers,
        [
            { x: colLeft, y: H, z: colInset },
            { x: colRight, y: H, z: colInset },
            { x: colRight, y: H, z: colBack },
            { x: colLeft, y: H, z: colBack },
        ],
        helpers.colorTop,
        'rgba(255, 255, 255, 0.15)',
    );

    // 3. Two vertical lit slits on front face (z = colInset)
    const colW = colRight - colLeft;
    const slitW = Math.max(1.5, colW * 0.12);
    const slitBottom = plinthH + H * 0.12;
    const slitTop = H - H * 0.1;

    const slitCenters = [colLeft + colW * 0.33, colLeft + colW * 0.67];

    for (const sx of slitCenters) {
        const slitPts = [
            { x: sx - slitW / 2, y: slitBottom, z: colInset },
            { x: sx + slitW / 2, y: slitBottom, z: colInset },
            { x: sx + slitW / 2, y: slitTop, z: colInset },
            { x: sx - slitW / 2, y: slitTop, z: colInset },
        ];
        drawPolygonFace(
            ctx,
            helpers,
            slitPts,
            helpers.isWireframe ? 'rgba(0,0,0,0)' : '#FEF08A',
            'rgba(255, 255, 255, 0.4)',
        );
    }
}

/**
 * Table Lamp: Base plate, thin stem, shade as a cylinder.
 */
function drawLampTable(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const cx3d = W / 2;
    const cz3d = D / 2;

    const rBase = Math.min(W, D) * 0.32;
    const baseH = Math.max(2, H * 0.06);

    const shadeYBot = H * 0.48;
    const shadeYTop = H * 0.9;
    const rShade = Math.min(W, D) * 0.45;

    // 1. Base disc
    drawIsoCylinder(ctx, helpers, cx3d, cz3d, 0, baseH, rBase, rBase);

    // 2. Center stem
    const pStemBot = toCanvas(helpers, cx3d, baseH, cz3d);
    const pStemTop = toCanvas(helpers, cx3d, shadeYBot, cz3d);
    ctx.beginPath();
    ctx.moveTo(pStemBot.x, pStemBot.y);
    ctx.lineTo(pStemTop.x, pStemTop.y);
    ctx.stroke();

    // 3. Drum shade
    drawIsoCylinder(ctx, helpers, cx3d, cz3d, shadeYBot, shadeYTop, rShade, rShade);

    // 4. Finial tip
    const pFinBot = toCanvas(helpers, cx3d, shadeYTop, cz3d);
    const pFinTop = toCanvas(helpers, cx3d, H * 0.96, cz3d);
    ctx.beginPath();
    ctx.moveTo(pFinBot.x, pFinBot.y);
    ctx.lineTo(pFinTop.x, pFinTop.y);
    ctx.stroke();
}

/**
 * Floor Lamp: Flat base plate, thin pole, elevated shade on top.
 */
function drawLampFloor(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const cx3d = W / 2;
    const cz3d = D / 2;

    const rBase = Math.min(W, D) * 0.42;
    const baseH = Math.max(2, H * 0.03);

    const shadeYBot = H * 0.76;
    const shadeYTop = H * 0.96;
    const rShade = Math.min(W, D) * 0.38;

    // 1. Flat base disc
    drawIsoCylinder(ctx, helpers, cx3d, cz3d, 0, baseH, rBase, rBase);

    // 2. Slender central pole
    const pPoleBot = toCanvas(helpers, cx3d, baseH, cz3d);
    const pPoleTop = toCanvas(helpers, cx3d, shadeYBot, cz3d);
    ctx.beginPath();
    ctx.moveTo(pPoleBot.x, pPoleBot.y);
    ctx.lineTo(pPoleTop.x, pPoleTop.y);
    ctx.stroke();

    // 3. Drum shade
    drawIsoCylinder(ctx, helpers, cx3d, cz3d, shadeYBot, shadeYTop, rShade, rShade);

    // 4. Top finial
    const pFinBot = toCanvas(helpers, cx3d, shadeYTop, cz3d);
    const pFinTop = toCanvas(helpers, cx3d, H, cz3d);
    ctx.beginPath();
    ctx.moveTo(pFinBot.x, pFinBot.y);
    ctx.lineTo(pFinTop.x, pFinTop.y);
    ctx.stroke();
}

/**
 * Pendant Lamp: Cord extending to the canvas ceiling and a drum shade.
 */
function drawLampPendant(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: AxoDrawHelpers,
): void {
    const { W, H, D } = geo;
    const cx3d = W / 2;
    const cz3d = D / 2;

    const shadeYBot = H * 0.12;
    const shadeYTop = H * 0.65;
    const rShade = Math.min(W, D) * 0.45;

    // 1. Drum shade
    drawIsoCylinder(ctx, helpers, cx3d, cz3d, shadeYBot, shadeYTop, rShade, rShade);

    // 2. Cord reaching to the canvas top (y = 0 in 2D canvas coordinates)
    const pShadeTop = toCanvas(helpers, cx3d, shadeYTop, cz3d);
    ctx.beginPath();
    ctx.moveTo(pShadeTop.x, pShadeTop.y);
    ctx.lineTo(pShadeTop.x, 0);
    ctx.stroke();
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
    }

    ctx.restore();
}
