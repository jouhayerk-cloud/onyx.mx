import { classifyGeometry } from './geometry';
import type { Geometry } from './geometry';

export function resolveItemColor(item: any): string {
    const textToSearch = [
        item.color, item.color_en, item.color_es,
        item.finish, item.finish_en, item.finish_es,
        item.material, item.material_en, item.material_es,
        item.description, item.shortDescription,
        item.title, item.name
    ].filter(Boolean).join(' ').toLowerCase();

    if (textToSearch.includes('gold') || textToSearch.includes('brass') || textToSearch.includes('laton') || textToSearch.includes('dorado')) return '#FDE047'; 
    if (textToSearch.includes('silver') || textToSearch.includes('chrome') || textToSearch.includes('steel') || textToSearch.includes('aluminum') || textToSearch.includes('plata') || textToSearch.includes('acero')) return '#E2E8F0';
    if (textToSearch.includes('copper') || textToSearch.includes('bronze') || textToSearch.includes('rust') || textToSearch.includes('cobre') || textToSearch.includes('bronce')) return '#F59E0B'; 
    if (textToSearch.includes('aqua') || textToSearch.includes('teal')) return '#0D9488'; 
    if (textToSearch.includes('emperador')) return '#FB923C'; 
    if (textToSearch.includes('amber') || textToSearch.includes('ambar')) return '#D97706'; 
    if (textToSearch.includes('red') || textToSearch.includes('rojo')) return '#EF4444'; 
    if (textToSearch.includes('blue') || textToSearch.includes('azul')) return '#3B82F6'; 
    if (textToSearch.includes('green') || textToSearch.includes('verde') || textToSearch.includes('emerald')) return '#10B981'; 
    if (textToSearch.includes('pink') || textToSearch.includes('rosa')) return '#EC4899'; 
    if (textToSearch.includes('purple') || textToSearch.includes('violet') || textToSearch.includes('morado')) return '#8B5CF6'; 
    if (textToSearch.includes('orange') || textToSearch.includes('naranja')) return '#F97316'; 
    if (textToSearch.includes('yellow') || textToSearch.includes('amarillo')) return '#EAB308'; 
    if (textToSearch.includes('brown') || textToSearch.includes('wood') || textToSearch.includes('walnut') || textToSearch.includes('oak') || textToSearch.includes('madera') || textToSearch.includes('cafe') || textToSearch.includes('marrón')) return '#D97706'; 
    if (textToSearch.includes('black') || textToSearch.includes('nero') || textToSearch.includes('dark') || textToSearch.includes('negro')) return '#888888';
    if (textToSearch.includes('white') || textToSearch.includes('blanco') || textToSearch.includes('clear') || textToSearch.includes('transparent')) return '#FFFFFF';
    if (textToSearch.includes('grey') || textToSearch.includes('gray') || textToSearch.includes('gris') || textToSearch.includes('concrete') || textToSearch.includes('cement')) return '#A1A1AA'; 
    
    return '#71717A'; // default neutral
}

export type AxoGeom = Geometry;

export interface ResolvedAxoGeometry {
    W: number;
    H: number;
    D: number;
    geom: AxoGeom;
    isMirror: boolean;
}

/**
 * Resolves an item to the mesh the rasteriser will draw: its CLASS (delegated to
 * geometry.ts, which the tag filters share) plus the DIMENSIONS that class
 * implies.
 *
 * Split out of generateAxonometricDataUrl so callers can build a cache key from
 * what actually drives the drawing rather than from the raw row. Shape and
 * description are free text — ~500 rows carry a few hundred distinct strings, but
 * they collapse to 8 geometries and a normalised W/H/D triple here. Keying a
 * cache on the *resolved* output is what turns "one 400x400 canvas per card" into
 * "one per distinct silhouette".
 *
 * The two dimension adjustments below stay here rather than in geometry.ts
 * because they are about mesh proportions, not class, and no other consumer of
 * the taxonomy wants them.
 *
 * Pure — no canvas, no DOM. Safe to call on every render.
 */
export function resolveAxoGeometry(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = ''
): ResolvedAxoGeometry {
    let W = w_cm;
    let H = h_cm;
    let D = d_cm;

    const s = (shapeStr || '').toLowerCase();
    const t = (descStr || '').toLowerCase();

    if (!W) W = D || H || 10;
    // Plates are forced shallow and round regardless of what was measured, so this
    // test cannot be folded into classifyGeometry — it rewrites dimensions, and it
    // runs before classification because the mirror pass below reads the result.
    if (s.includes('plate') || t.includes('plate') || s.includes('plato') || t.includes('plato') || s.includes('tray') || t.includes('tray') || s.includes('dish') || t.includes('dish')) {
        if (!H) H = 5;
        // Force shallow round shape
        H = 5;
        W = Math.max(W, D);
        D = W;
    } else {
        if (!H) H = W;
    }
    if (!D) D = W;

    const { geom, isMirror } = classifyGeometry(shapeStr, descStr);

    // A round mirror is drawn as a disc, so it needs a square face and a thin
    // depth whatever the row claims.
    if (geom === 'mirror') {
        const maxVal = Math.max(W, H, D);
        const minVal = Math.min(W, H, D);
        W = maxVal;
        H = maxVal;
        D = minVal;
    }

    return { W, H, D, geom, isMirror };
}

export async function generateAxonometricDataUrl(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = '',
    wireframeColor?: string,
    asJpeg: boolean = false,
    hexMapString?: string
): Promise<string> {
    return new Promise((resolve) => {
        const { W, H, D, geom, isMirror } = resolveAxoGeometry(w_cm, h_cm, d_cm, shapeStr, descStr);

        const cos30 = Math.cos(Math.PI / 6);
        const sin30 = Math.sin(Math.PI / 6);

        function project(x: number, y: number, z: number) {
            return {
                u: (x - z) * cos30,
                v: -y - (x + z) * sin30
            };
        }

        const v3d_box = [
            {x:0, y:0, z:0}, {x:W, y:0, z:0}, {x:W, y:0, z:D}, {x:0, y:0, z:D},
            {x:0, y:H, z:0}, {x:W, y:H, z:0}, {x:W, y:H, z:D}, {x:0, y:H, z:D}
        ];
        const projected_box = v3d_box.map(p => project(p.x, p.y, p.z));
        const uVals = projected_box.map(p => p.u);
        const vVals = projected_box.map(p => p.v);
        const minU = Math.min(...uVals), maxU = Math.max(...uVals);
        const minV = Math.min(...vVals), maxV = Math.max(...vVals);

        const padding = 60;
        const canvasSize = 400;
        const scaleU = (canvasSize - padding * 2) / (maxU - minU || 1);
        const scaleV = (canvasSize - padding * 2) / (maxV - minV || 1);
        const scale = Math.min(scaleU, scaleV);

        const cx = canvasSize / 2 - ((minU + maxU) / 2) * scale;
        const cy = canvasSize / 2 - ((minV + maxV) / 2) * scale;

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }
        
        if (asJpeg) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const isWireframe = wireframeColor === 'black' || wireframeColor === 'wireframe' || wireframeColor === 'transparent' || wireframeColor === '#000000';
        // Grayscale Palette (transparent if wireframe to achieve hidden-line look)
        const COLOR_TOP = isWireframe ? 'rgba(0,0,0,0)' : '#F0F0F0';
        const COLOR_RIGHT = isWireframe ? 'rgba(0,0,0,0)' : '#D4D4D4';
        const COLOR_LEFT = isWireframe ? 'rgba(0,0,0,0)' : '#9E9E9E';
        const COLOR_OUTLINE = wireframeColor || '#111111';

        let hexPattern: CanvasPattern | null = null;
        let parsedHexList: string[] = [];
        let tCols = 20;
        let tRows = 20;
        if (hexMapString && !isWireframe) {
            try {
                parsedHexList = hexMapString.split(',').map(s => s.trim()).filter(s => s.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(s));
                if (parsedHexList.length > 0) {
                    if (parsedHexList.length === 160) { tCols = 20; tRows = 8; }
                    else if (parsedHexList.length === 400) { tCols = 20; tRows = 20; }
                    else if (parsedHexList.length === 64) { tCols = 8; tRows = 8; }
                    else if (parsedHexList.length === 100) { tCols = 10; tRows = 10; }
                    else if (parsedHexList.length > 0 && parsedHexList.length % 20 === 0) { tCols = 20; tRows = parsedHexList.length / 20; }
                    else if (parsedHexList.length > 0 && parsedHexList.length % 16 === 0) { tCols = 16; tRows = parsedHexList.length / 16; }
                    else {
                        tCols = Math.max(1, Math.round(Math.sqrt(parsedHexList.length)));
                        tRows = Math.ceil(parsedHexList.length / tCols);
                    }

                    const texCan = document.createElement('canvas');
                    const cellSize = Math.max(4, Math.round(160 / tCols));
                    texCan.width = tCols * cellSize;
                    texCan.height = tRows * cellSize;
                    const texCtx = texCan.getContext('2d');
                    if (texCtx) {
                        for (let r = 0; r < tRows; r++) {
                            for (let c = 0; c < tCols; c++) {
                                const idx = r * tCols + c;
                                const color = parsedHexList[idx] || parsedHexList[0] || '#CCCCCC';
                                texCtx.fillStyle = color.startsWith('#') ? color : `#${color}`;
                                texCtx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                            }
                        }
                        hexPattern = ctx.createPattern(texCan, 'repeat');
                    }
                }
            } catch(e) {
                console.error("Failed to create hex texture pattern", e);
            }
        }

        ctx.font = 'bold 18px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        function drawLabel(val: number, label: string, p1: {u:number, v:number}, p2: {u:number, v:number}, angle: number, offsetV: number) {
            // Text annotations removed: already printed on manifesto
            return;
        }

        ctx.lineWidth = 5;
        ctx.strokeStyle = COLOR_OUTLINE;

        if (geom === 'cylinder') {
            const cb_u = (W/2 - D/2) * cos30;
            const cb_v = -(W/2 + D/2) * sin30;
            const ct_u = (W/2 - D/2) * cos30;
            const ct_v = -H - (W/2 + D/2) * sin30;

            const a = (W/2)*cos30, b = -(W/2)*sin30;
            const c = -(D/2)*cos30, d = -(D/2)*sin30;

            const t1 = Math.atan2(-D, W); // Right-most tangent parameter
            const t2 = Math.atan2(D, -W); // Left-most tangent parameter
            const x1 = Math.cos(t1), z1 = Math.sin(t1);
            const x2 = Math.cos(t2), z2 = Math.sin(t2);

            const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
            const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

            let tFrontStart = t2;
            let tFrontEnd = t1;
            if (tFrontEnd < tFrontStart) tFrontEnd += 2 * Math.PI;

            function drawEllipsePath(c_u: number, c_v: number, scaleFactor: number, tStart: number, tEnd: number) {
                ctx!.beginPath();
                for (let t = tStart; t <= tEnd + 0.05; t += 0.05) {
                    const ct = t > tEnd ? tEnd : t;
                    const x = Math.cos(ct), z = Math.sin(ct);
                    const u = a * x + c * z;
                    const v = b * x + d * z;
                    const px = cx + (c_u + u * scaleFactor) * scale;
                    const py = cy + (c_v + v * scaleFactor) * scale;
                    if (t === tStart) ctx!.moveTo(px, py);
                    else ctx!.lineTo(px, py);
                }
            }

            drawEllipsePath(cb_u, cb_v, 1.0, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_RIGHT;
            ctx.fill();
            if (isWireframe) ctx.stroke();

            drawEllipsePath(cb_u, cb_v, 1.0, tFrontStart, tFrontEnd);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.lineTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.closePath();
            
            if (hexPattern) {
                ctx.fillStyle = hexPattern;
                ctx.fill();
                const shGrd = ctx!.createLinearGradient(cx + (cb_u + u2)*scale, 0, cx + (cb_u + u1)*scale, 0);
                shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
                shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
                shGrd.addColorStop(1, 'rgba(0,0,0,0.15)');
                ctx.fillStyle = shGrd;
                ctx.fill();
            } else {
                const grd = ctx!.createLinearGradient(cx + (cb_u + u2)*scale, 0, cx + (cb_u + u1)*scale, 0);
                grd.addColorStop(0, COLOR_LEFT);
                grd.addColorStop(1, COLOR_RIGHT);
                ctx.fillStyle = grd;
                ctx.fill();
            }
            
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.stroke();

            drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
            ctx.fillStyle = hexPattern || COLOR_TOP;
            ctx.fill();
            if (hexPattern) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fill();
            }
            ctx.stroke();

            // Draw inner top ellipse (hollow interior or glass)
            drawEllipsePath(ct_u, ct_v, isMirror ? 0.85 : 0.75, 0, 2 * Math.PI);
            if (isWireframe) {
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fill();
                ctx.stroke();
                
                if (isMirror) {
                    ctx.beginPath();
                    const slashAngle = Math.PI / 4;
                    const len = (W/2) * 0.5 * scale;
                    const dx = Math.cos(slashAngle) * len;
                    const dy = Math.sin(slashAngle) * len;
                    ctx.moveTo(cx + ct_u*scale - dx, cy + ct_v*scale - dy);
                    ctx.lineTo(cx + ct_u*scale + dx, cy + ct_v*scale + dy);
                    ctx.moveTo(cx + ct_u*scale - dx + 8, cy + ct_v*scale - dy - 4);
                    ctx.lineTo(cx + ct_u*scale + dx + 8, cy + ct_v*scale + dy - 4);
                    ctx.stroke();
                }
            } else if (isMirror) {
                const faceGrd = ctx!.createLinearGradient(
                    cx + (ct_u - W/4)*scale, cy + (ct_v - W/4)*scale,
                    cx + (ct_u + W/4)*scale, cy + (ct_v + W/4)*scale
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT); // sleek diagonal glass shine
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);
                ctx.fillStyle = faceGrd;
                ctx.fill();
                ctx.stroke();
            } else {
                const holeGrd = ctx!.createLinearGradient(
                    cx + (ct_u) * scale, cy + (ct_v - (W/2)*sin30) * scale,
                    cx + (ct_u) * scale, cy + (ct_v + (W/2)*sin30) * scale
                );
                holeGrd.addColorStop(0, '#555555');
                holeGrd.addColorStop(1, '#0A0A0A');
                ctx.fillStyle = holeGrd;
                ctx.fill();
                ctx.stroke();
            }

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            const pRightBottom = {u: cx + (cb_u + u1)*scale, v: cy + (cb_v + v1)*scale};
            const pRightTop = {u: cx + (ct_u + u1)*scale, v: cy + (ct_v + v1)*scale};
            drawLabel(H, 'H', pRightBottom, pRightTop, Math.atan2(pRightTop.v - pRightBottom.v, pRightTop.u - pRightBottom.u), 25);

        } else if (geom === 'bowl' || geom === 'plate') {
            const ct_u = (W/2 - D/2) * cos30;
            const ct_v = -H - (W/2 + D/2) * sin30;
            const cb_u = (W/2 - D/2) * cos30;
            
            const a = (W/2)*cos30, b = -(W/2)*sin30;
            const c = -(D/2)*cos30, d = -(D/2)*sin30;

            function drawEllipsePath(c_u: number, c_v: number, scaleFactor: number, tStart: number, tEnd: number) {
                ctx!.beginPath();
                for (let t = tStart; t <= tEnd + 0.05; t += 0.05) {
                    const ct = t > tEnd ? tEnd : t;
                    const x = Math.cos(ct), z = Math.sin(ct);
                    const u = a * x + c * z;
                    const v = b * x + d * z;
                    const px = cx + (c_u + u * scaleFactor) * scale;
                    const py = cy + (c_v + v * scaleFactor) * scale;
                    if (t === tStart) ctx!.moveTo(px, py);
                    else ctx!.lineTo(px, py);
                }
            }

            // BOWL & PLATE rendering

                const tLowest = Math.atan2(-D, -W);
                const vLowest = b * Math.cos(tLowest) + d * Math.sin(tLowest);
                
                const visualH = Math.max(H, vLowest + Math.min(W, D) * 0.25);
                const cb_v = ct_v + visualH;

                const t1 = Math.atan2(-D, W); // Right tangent
                const t2 = Math.atan2(D, -W); // Left tangent
                const x1 = Math.cos(t1), z1 = Math.sin(t1);
                const x2 = Math.cos(t2), z2 = Math.sin(t2);

                const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
                const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

                const p0_u = cx + (ct_u + u2)*scale; // Left tangent
                const p0_v = cy + (ct_v + v2)*scale;
                const p2_u = cx + (ct_u + u1)*scale; // Right tangent
                const p2_v = cy + (ct_v + v1)*scale;
                
                const pm_u = cx + ct_u*scale; // Top center
                const pm_v = cy + ct_v*scale;
                
                const pBot_u = cx + cb_u*scale; // Bottom center
                const pBot_v = cy + cb_v*scale;

                const kappa = 0.55228;
                const hLeft = pBot_v - p0_v;
                const hRight = pBot_v - p2_v;
                
                const cp1_u = p0_u;
                const cp1_v = p0_v + kappa * hLeft;
                const cp2_u = pBot_u - kappa * (pBot_u - p0_u);
                const cp2_v = pBot_v;
                
                const cp3_u = pBot_u + kappa * (p2_u - pBot_u);
                const cp3_v = pBot_v;
                const cp4_u = p2_u;
                const cp4_v = p2_v + kappa * hRight;

                // Fill bowl body
                ctx.beginPath();
                ctx.moveTo(p0_u, p0_v);
                ctx.bezierCurveTo(cp1_u, cp1_v, cp2_u, cp2_v, pBot_u, pBot_v);
                ctx.bezierCurveTo(cp3_u, cp3_v, cp4_u, cp4_v, p2_u, p2_v);
                ctx.lineTo(pm_u, pm_v);
                ctx.closePath();
                
                if (hexPattern) {
                    ctx.fillStyle = hexPattern;
                    ctx.fill();
                    const shGrd = ctx.createLinearGradient(p0_u, 0, p2_u, 0);
                    shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
                    shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
                    shGrd.addColorStop(1, 'rgba(0,0,0,0.2)');
                    ctx.fillStyle = shGrd;
                    ctx.fill();
                } else {
                    const grd = ctx.createLinearGradient(p0_u, 0, p2_u, 0);
                    grd.addColorStop(0, COLOR_LEFT);
                    grd.addColorStop(1, COLOR_RIGHT);
                    ctx.fillStyle = grd;
                    ctx.fill();
                }

                // Stroke bottom sweeping curve
                ctx.beginPath();
                ctx.moveTo(p0_u, p0_v);
                ctx.bezierCurveTo(cp1_u, cp1_v, cp2_u, cp2_v, pBot_u, pBot_v);
                ctx.bezierCurveTo(cp3_u, cp3_v, cp4_u, cp4_v, p2_u, p2_v);
                ctx.stroke();

                // Draw full top ellipse (outer rim)
                drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
                ctx.fillStyle = hexPattern || COLOR_TOP;
                ctx.fill();
                if (hexPattern) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }
                ctx.stroke();

                // Draw inner top ellipse (hollow interior)
                drawEllipsePath(ct_u, ct_v, 0.85, 0, 2 * Math.PI);
                ctx.fillStyle = '#C0C0C0';
                ctx.fill();
                ctx.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);



        } else if (geom === 'mirror') {
            const R = Math.max(W, H) / 2;
            
            // Center of the back face (Z=D)
            const backCx = cx + project(W/2, H/2, D).u * scale;
            const backCy = cy + project(W/2, H/2, D).v * scale;
            
            // Center of the front face (Z=0)
            const frontCx = cx + project(W/2, H/2, 0).u * scale;
            const frontCy = cy + project(W/2, H/2, 0).v * scale;

            function traceIsoCircle(centerX: number, centerY: number, radius: number) {
                ctx!.beginPath();
                for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
                    const x = radius * Math.cos(t);
                    const y = radius * Math.sin(t);
                    const p = project(x, y, 0);
                    const ptX = centerX + p.u * scale;
                    const ptY = centerY + p.v * scale;
                    if (t === 0) ctx!.moveTo(ptX, ptY);
                    else ctx!.lineTo(ptX, ptY);
                }
                ctx!.closePath();
            }

            // 1. Draw back face
            traceIsoCircle(backCx, backCy, R);
            ctx!.fillStyle = COLOR_RIGHT;
            ctx!.fill();
            if (isWireframe) ctx!.stroke();

            // 2. Draw connecting rim
            const tTangent1 = -Math.PI/4;
            const tTangent2 = 3*Math.PI/4;
            const p1 = project(R * Math.cos(tTangent1), R * Math.sin(tTangent1), 0);
            const p2 = project(R * Math.cos(tTangent2), R * Math.sin(tTangent2), 0);

            ctx!.beginPath();
            ctx!.moveTo(backCx + p1.u * scale, backCy + p1.v * scale);
            ctx!.lineTo(frontCx + p1.u * scale, frontCy + p1.v * scale);
            ctx!.lineTo(frontCx + p2.u * scale, frontCy + p2.v * scale);
            ctx!.lineTo(backCx + p2.u * scale, backCy + p2.v * scale);
            ctx!.closePath();
            ctx!.fillStyle = COLOR_RIGHT;
            ctx!.fill();

            if (isWireframe) {
                // Outline the rim
                ctx!.beginPath();
                ctx!.moveTo(backCx + p1.u * scale, backCy + p1.v * scale);
                ctx!.lineTo(frontCx + p1.u * scale, frontCy + p1.v * scale);
                ctx!.moveTo(backCx + p2.u * scale, backCy + p2.v * scale);
                ctx!.lineTo(frontCx + p2.u * scale, frontCy + p2.v * scale);
                ctx!.stroke();
            }

            // 3. Draw front face
            traceIsoCircle(frontCx, frontCy, R);
            ctx!.fillStyle = hexPattern || COLOR_TOP;
            ctx!.fill();
            if (hexPattern) {
                ctx!.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx!.fill();
            }
            ctx!.stroke();

            // 4. Draw inner glass
            const innerR = R * 0.85;
            traceIsoCircle(frontCx, frontCy, innerR);
            if (isWireframe) {
                ctx!.fillStyle = 'rgba(0,0,0,0)';
                ctx!.fill();
                ctx!.stroke();
                // Add wireframe slash
                ctx!.beginPath();
                const sp1 = project(innerR * Math.cos(Math.PI/4), innerR * Math.sin(Math.PI/4), 0);
                const sp2 = project(innerR * Math.cos(Math.PI/4 + Math.PI), innerR * Math.sin(Math.PI/4 + Math.PI), 0);
                ctx!.moveTo(frontCx + sp1.u*scale, frontCy + sp1.v*scale);
                ctx!.lineTo(frontCx + sp2.u*scale, frontCy + sp2.v*scale);
                
                const sp3 = project(innerR * Math.cos(Math.PI/4)*0.8, innerR * Math.sin(Math.PI/4)*0.8, 0);
                const sp4 = project(innerR * Math.cos(Math.PI/4 + Math.PI)*0.8, innerR * Math.sin(Math.PI/4 + Math.PI)*0.8, 0);
                ctx!.moveTo(frontCx + sp3.u*scale + 10, frontCy + sp3.v*scale - 5);
                ctx!.lineTo(frontCx + sp4.u*scale + 10, frontCy + sp4.v*scale - 5);
                ctx!.stroke();
            } else {
                const faceGrd = ctx!.createLinearGradient(
                    frontCx - R*scale, frontCy - R*scale,
                    frontCx + R*scale, frontCy + R*scale
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT);
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);
                ctx!.fillStyle = faceGrd;
                ctx!.fill();
                ctx!.stroke();
            }

            // Labels
            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else if (geom === 'sphere') {
            const R = Math.max(W, H, D) / 2;
            const center3d = project(W/2, H/2, D/2);
            const ptX = cx + center3d.u * scale;
            const ptY = cy + center3d.v * scale;
            
            ctx!.beginPath();
            ctx!.arc(ptX, ptY, R * scale, 0, 2 * Math.PI);
            ctx!.closePath();

            const grd = ctx!.createRadialGradient(ptX - (R*0.3)*scale, ptY - (R*0.3)*scale, R*0.1*scale, ptX, ptY, R*scale);
            grd.addColorStop(0, COLOR_TOP);
            grd.addColorStop(0.7, COLOR_RIGHT);
            grd.addColorStop(1, COLOR_LEFT);
            
            if (isWireframe) {
                ctx!.fillStyle = 'rgba(0,0,0,0)';
            } else if (hexPattern) {
                ctx!.fillStyle = hexPattern;
                ctx!.fill();
                const shGrd = ctx!.createRadialGradient(ptX - (R*0.3)*scale, ptY - (R*0.3)*scale, R*0.1*scale, ptX, ptY, R*scale);
                shGrd.addColorStop(0, 'rgba(255,255,255,0.3)');
                shGrd.addColorStop(0.7, 'rgba(0,0,0,0.1)');
                shGrd.addColorStop(1, 'rgba(0,0,0,0.45)');
                ctx!.fillStyle = shGrd;
            } else {
                ctx!.fillStyle = grd;
            }
            ctx!.fill();
            ctx!.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else if (geom === 'octahedron') {
            const v3d = [
                {x: W/2, y: H, z: D/2}, // 0: Top
                {x: W/2, y: 0, z: D/2}, // 1: Bottom
                {x: 0, y: H/2, z: 0},   // 2: Front
                {x: W, y: H/2, z: 0},   // 3: Right
                {x: W, y: H/2, z: D},   // 4: Back
                {x: 0, y: H/2, z: D}    // 5: Left
            ];
            const projected = v3d.map(p => project(p.x, p.y, p.z));
            const pts = projected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));

            function drawFace(indices: number[], color: string, shadeOverlay?: string) {
                ctx!.beginPath();
                ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                ctx!.closePath();
                ctx!.fillStyle = hexPattern || color;
                ctx!.fill();
                if (hexPattern && shadeOverlay) {
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                }
                ctx!.stroke();
            }

            // Top-Left Face
            drawFace([0, 5, 2], COLOR_TOP, 'rgba(255, 255, 255, 0.15)');
            // Top-Right Face
            drawFace([0, 2, 3], COLOR_RIGHT, 'rgba(0, 0, 0, 0.15)');
            // Bottom-Left Face
            drawFace([1, 5, 2], COLOR_LEFT, 'rgba(0, 0, 0, 0.35)');
            
            // Bottom-Right Face
            ctx!.fillStyle = isWireframe ? 'rgba(0,0,0,0)' : '#A3A3A3'; 
            ctx!.beginPath();
            ctx!.moveTo(pts[1].u, pts[1].v);
            ctx!.lineTo(pts[2].u, pts[2].v);
            ctx!.lineTo(pts[3].u, pts[3].v);
            ctx!.closePath();
            ctx!.fill();
            ctx!.stroke();

            const boxPts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', boxPts[0], boxPts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', boxPts[0], boxPts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', boxPts[1], boxPts[5], Math.atan2(boxPts[5].v - boxPts[1].v, boxPts[5].u - boxPts[1].u), 25);

        } else {
            const inset = geom === 'polyhedron' ? 0.3 : 0;
            const v3d = [
                {x:0, y:0, z:0}, {x:W, y:0, z:0}, {x:W, y:0, z:D}, {x:0, y:0, z:D},
                {x:W*inset, y:H, z:D*inset}, {x:W*(1-inset), y:H, z:D*inset}, 
                {x:W*(1-inset), y:H, z:D*(1-inset)}, {x:W*inset, y:H, z:D*(1-inset)}
            ];

            const projected = v3d.map(p => project(p.x, p.y, p.z));
            const pts = projected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));

            function drawFace(indices: number[], color: string, shadeOverlay?: string) {
                ctx!.beginPath();
                ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                ctx!.closePath();
                ctx!.fillStyle = hexPattern || color;
                ctx!.fill();
                if (hexPattern && shadeOverlay) {
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                }
                ctx!.stroke();
            }

            function drawProjectedHexGrid(faceType: 'front' | 'top' | 'left', shadeOverlay?: string) {
                if (!parsedHexList || parsedHexList.length === 0) return;
                const topInset = geom === 'polyhedron' ? 0.3 : 0;
                for (let r = 0; r < tRows; r++) {
                    for (let c = 0; c < tCols; c++) {
                        const idx = r * tCols + c;
                        const color = parsedHexList[idx] || parsedHexList[0] || '#CCCCCC';
                        const hexCol = color.startsWith('#') ? color : `#${color}`;
                        
                        let p1_3d, p2_3d, p3_3d, p4_3d;
                        if (faceType === 'front') {
                            const yRatio1 = (tRows - r) / tRows;
                            const yRatio2 = (tRows - (r + 1)) / tRows;
                            const insetLeft1 = W * topInset * yRatio1;
                            const insetRight1 = W * (1 - topInset * yRatio1);
                            const insetLeft2 = W * topInset * yRatio2;
                            const insetRight2 = W * (1 - topInset * yRatio2);
                            
                            const x1_top = insetLeft1 + (c / tCols) * (insetRight1 - insetLeft1);
                            const x2_top = insetLeft1 + ((c + 1) / tCols) * (insetRight1 - insetLeft1);
                            const x1_bot = insetLeft2 + (c / tCols) * (insetRight2 - insetLeft2);
                            const x2_bot = insetLeft2 + ((c + 1) / tCols) * (insetRight2 - insetLeft2);
                            
                            const y1 = H - (r / tRows) * H;
                            const y2 = H - ((r + 1) / tRows) * H;
                            p1_3d = { x: x1_top, y: y1, z: 0 };
                            p2_3d = { x: x2_top, y: y1, z: 0 };
                            p3_3d = { x: x2_bot, y: y2, z: 0 };
                            p4_3d = { x: x1_bot, y: y2, z: 0 };
                        } else if (faceType === 'top') {
                            const x1 = W * topInset + (c / tCols) * (W * (1 - 2 * topInset));
                            const x2 = W * topInset + ((c + 1) / tCols) * (W * (1 - 2 * topInset));
                            const z1 = D * topInset + (r / tRows) * (D * (1 - 2 * topInset));
                            const z2 = D * topInset + ((r + 1) / tRows) * (D * (1 - 2 * topInset));
                            p1_3d = { x: x1, y: H, z: z1 };
                            p2_3d = { x: x2, y: H, z: z1 };
                            p3_3d = { x: x2, y: H, z: z2 };
                            p4_3d = { x: x1, y: H, z: z2 };
                        } else { // left
                            const yRatio1 = (tRows - r) / tRows;
                            const yRatio2 = (tRows - (r + 1)) / tRows;
                            const insetFront1 = D * topInset * yRatio1;
                            const insetBack1 = D * (1 - topInset * yRatio1);
                            const insetFront2 = D * topInset * yRatio2;
                            const insetBack2 = D * (1 - topInset * yRatio2);
                            
                            const z1_top = insetFront1 + (c / tCols) * (insetBack1 - insetFront1);
                            const z2_top = insetFront1 + ((c + 1) / tCols) * (insetBack1 - insetFront1);
                            const z1_bot = insetFront2 + (c / tCols) * (insetBack2 - insetFront2);
                            const z2_bot = insetFront2 + ((c + 1) / tCols) * (insetBack2 - insetFront2);

                            const y1 = H - (r / tRows) * H;
                            const y2 = H - ((r + 1) / tRows) * H;
                            p1_3d = { x: 0, y: y1, z: z1_top };
                            p2_3d = { x: 0, y: y1, z: z2_top };
                            p3_3d = { x: 0, y: y2, z: z2_bot };
                            p4_3d = { x: 0, y: y2, z: z1_bot };
                        }

                        const p1 = project(p1_3d.x, p1_3d.y, p1_3d.z);
                        const p2 = project(p2_3d.x, p2_3d.y, p2_3d.z);
                        const p3 = project(p3_3d.x, p3_3d.y, p3_3d.z);
                        const p4 = project(p4_3d.x, p4_3d.y, p4_3d.z);

                        ctx!.beginPath();
                        ctx!.moveTo(p1.u * scale + cx, p1.v * scale + cy);
                        ctx!.lineTo(p2.u * scale + cx, p2.v * scale + cy);
                        ctx!.lineTo(p3.u * scale + cx, p3.v * scale + cy);
                        ctx!.lineTo(p4.u * scale + cx, p4.v * scale + cy);
                        ctx!.closePath();
                        ctx!.fillStyle = hexCol;
                        ctx!.fill();
                    }
                }
                if (shadeOverlay) {
                    const indices = faceType === 'top' ? [4, 5, 6, 7] : faceType === 'left' ? [0, 3, 7, 4] : [0, 1, 5, 4];
                    ctx!.beginPath();
                    ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                    for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                    ctx!.closePath();
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                    ctx!.stroke();
                }
            }

            if (parsedHexList && parsedHexList.length > 0 && !isWireframe) {
                drawProjectedHexGrid('top', 'rgba(255, 255, 255, 0.15)');
                drawProjectedHexGrid('left', 'rgba(0, 0, 0, 0.35)');
                drawProjectedHexGrid('front', 'rgba(0, 0, 0, 0.15)');
            } else {
                drawFace([4, 5, 6, 7], COLOR_TOP, 'rgba(255, 255, 255, 0.15)');
                drawFace([0, 3, 7, 4], COLOR_LEFT, 'rgba(0, 0, 0, 0.35)');
                drawFace([0, 1, 5, 4], COLOR_RIGHT, 'rgba(0, 0, 0, 0.15)');
            }

            if (isMirror) {
                // Find largest face to draw the glass on
                const areaLeft = D * H;
                const areaRight = W * H;
                const areaTop = W * D;
                const maxArea = Math.max(areaLeft, areaRight, areaTop);
                
                const frameX = Math.min(20, W * 0.3);
                const frameY = Math.min(20, H * 0.3);
                const frameZ = Math.min(20, D * 0.3);
                
                let glassPts3d = [];
                if (maxArea === areaRight) {
                    glassPts3d = [
                        {x: frameX, y: frameY, z: 0},
                        {x: W - frameX, y: frameY, z: 0},
                        {x: W - frameX, y: H - frameY, z: 0},
                        {x: frameX, y: H - frameY, z: 0}
                    ];
                } else if (maxArea === areaLeft) {
                    glassPts3d = [
                        {x: 0, y: frameY, z: frameZ},
                        {x: 0, y: frameY, z: D - frameZ},
                        {x: 0, y: H - frameY, z: D - frameZ},
                        {x: 0, y: H - frameY, z: frameZ}
                    ];
                } else {
                    glassPts3d = [
                        {x: frameX, y: H, z: frameZ},
                        {x: W - frameX, y: H, z: frameZ},
                        {x: W - frameX, y: H, z: D - frameZ},
                        {x: frameX, y: H, z: D - frameZ}
                    ];
                }
                
                const glassProjected = glassPts3d.map(p => project(p.x, p.y, p.z));
                const gPts = glassProjected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
                
                ctx.beginPath();
                ctx.moveTo(gPts[0].u, gPts[0].v);
                ctx.lineTo(gPts[1].u, gPts[1].v);
                ctx.lineTo(gPts[2].u, gPts[2].v);
                ctx.lineTo(gPts[3].u, gPts[3].v);
                ctx.closePath();
                
                const minGu = Math.min(...gPts.map(p=>p.u));
                const maxGu = Math.max(...gPts.map(p=>p.u));
                const minGv = Math.min(...gPts.map(p=>p.v));
                const maxGv = Math.max(...gPts.map(p=>p.v));
                
                const faceGrd = ctx!.createLinearGradient(
                    maxGu, minGv,
                    minGu, maxGv
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT);
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);

                ctx.fillStyle = faceGrd;
                ctx.fill();
                ctx.stroke();
            }

            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);
        }

        resolve(canvas.toDataURL(asJpeg ? 'image/jpeg' : 'image/png', 1.0));
    });
}
