export async function generateAxonometricDataUrl(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = ''
): Promise<string> {
    return new Promise((resolve) => {
        const W = w_cm;
        const H = h_cm;
        const D = d_cm;

        const s = shapeStr.toLowerCase();
        const t = descStr.toLowerCase();
        let geom = 'box';
        
        if (s.includes('bowl') || t.includes('bowl')) geom = 'bowl';
        else if ((s.includes('mirror') || t.includes('mirror')) && (s.includes('rectangular') || t.includes('rectangular') || s.includes('squared') || t.includes('squared'))) geom = 'box';
        else if (s.includes('mirror') || t.includes('mirror')) geom = 'mirror';
        else if (s.includes('cylinder') || t.includes('cylinder') || t.includes('cilinder') || s.includes('round') || t.includes('round') || s.includes('pendant') || t.includes('pendant')) geom = 'cylinder';
        else if (s.includes('rock') || t.includes('rock') || s.includes('sculpture') || t.includes('sculpture') || s.includes('fountain') || t.includes('fountain')) geom = 'polyhedron';

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
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Grayscale Palette
        const COLOR_TOP = '#F0F0F0';
        const COLOR_RIGHT = '#D4D4D4';
        const COLOR_LEFT = '#9E9E9E';
        const COLOR_OUTLINE = '#111111';

        ctx.font = 'bold 18px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        function drawLabel(val: number, label: string, p1: {u:number, v:number}, p2: {u:number, v:number}, angle: number, offsetV: number) {
            if (!val) return;
            const midU = (p1.u + p2.u) / 2;
            const midV = (p1.v + p2.v) / 2;
            ctx!.save();
            ctx!.translate(midU, midV);
            ctx!.rotate(angle);
            ctx!.fillStyle = '#111111';
            ctx!.fillText(`${Math.round(val)}cm ${label}`, 0, offsetV);
            ctx!.restore();
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

            drawEllipsePath(cb_u, cb_v, 1.0, tFrontStart, tFrontEnd);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.lineTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.closePath();
            
            const grd = ctx!.createLinearGradient(cx + (cb_u + u2)*scale, 0, cx + (cb_u + u1)*scale, 0);
            grd.addColorStop(0, COLOR_LEFT);
            grd.addColorStop(1, COLOR_RIGHT);
            ctx.fillStyle = grd;
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.stroke();

            drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_TOP;
            ctx.fill();
            ctx.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            const pRightBottom = {u: cx + (cb_u + u1)*scale, v: cy + (cb_v + v1)*scale};
            const pRightTop = {u: cx + (ct_u + u1)*scale, v: cy + (ct_v + v1)*scale};
            drawLabel(H, 'H', pRightBottom, pRightTop, Math.atan2(pRightTop.v - pRightBottom.v, pRightTop.u - pRightBottom.u), 25);

        } else if (geom === 'bowl') {
            const ct_u = (W/2 - D/2) * cos30;
            const ct_v = -H - (W/2 + D/2) * sin30;
            const cb_u = (W/2 - D/2) * cos30;
            
            const a = (W/2)*cos30, b = -(W/2)*sin30;
            const c = -(D/2)*cos30, d = -(D/2)*sin30;

            const tLowest = Math.atan2(-D, -W);
            const vLowest = b * Math.cos(tLowest) + d * Math.sin(tLowest);
            
            // Visual height adjustment to ensure the bowl body sweeps elegantly downwards
            // It MUST be visibly lower than the front arc (vLowest) of the top ellipse.
            const visualH = Math.max(H, vLowest + W * 0.25);
            const cb_v = ct_v + visualH;

            const t1 = Math.atan2(-D, W); // Right tangent
            const t2 = Math.atan2(D, -W); // Left tangent
            const x1 = Math.cos(t1), z1 = Math.sin(t1);
            const x2 = Math.cos(t2), z2 = Math.sin(t2);

            const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
            const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

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

            const p0_u = cx + (ct_u + u2)*scale; // Left tangent
            const p0_v = cy + (ct_v + v2)*scale;
            const p2_u = cx + (ct_u + u1)*scale; // Right tangent
            const p2_v = cy + (ct_v + v1)*scale;
            
            const pm_u = cx + ct_u*scale; // Top center
            const pm_v = cy + ct_v*scale;
            
            const pBot_u = cx + cb_u*scale; // Bottom center
            const pBot_v = cy + cb_v*scale;

            // U-shape Bezier control points for a perfect semi-ellipse profile
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
            
            const grd = ctx!.createLinearGradient(p0_u, 0, p2_u, 0);
            grd.addColorStop(0, COLOR_LEFT);
            grd.addColorStop(1, COLOR_RIGHT);
            ctx.fillStyle = grd;
            ctx.fill();

            // Stroke bottom sweeping curve
            ctx.beginPath();
            ctx.moveTo(p0_u, p0_v);
            ctx.bezierCurveTo(cp1_u, cp1_v, cp2_u, cp2_v, pBot_u, pBot_v);
            ctx.bezierCurveTo(cp3_u, cp3_v, cp4_u, cp4_v, p2_u, p2_v);
            ctx.stroke();

            // Draw full top ellipse (outer rim)
            drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_TOP;
            ctx.fill();
            ctx.stroke();

            // Draw inner top ellipse (hollow interior)
            drawEllipsePath(ct_u, ct_v, 0.85, 0, 2 * Math.PI);
            ctx.fillStyle = '#C0C0C0'; // Darker inner shade to emphasize the cavity depth
            ctx.fill();
            ctx.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else if (geom === 'mirror') {
            // To ensure the mirror looks perfectly 'ROUND', we abandon strict isometric ellipses 
            // for the front face and instead use a perfect circle (oblique projection).
            // We extrude this circle along the Z-axis (Depth) to show the thickness.
            const r = (Math.max(W, H) / 2) * scale;
            
            // Isometric center of the front face (z = D)
            const frontCx = cx + ((W/2 - D) * cos30) * scale;
            const frontCy = cy + (-H/2 - (W/2 + D) * sin30) * scale;
            
            // Isometric center of the back face (z = 0)
            const backCx = cx + ((W/2) * cos30) * scale;
            const backCy = cy + (-H/2 - (W/2) * sin30) * scale;

            // Draw back circle
            ctx.beginPath();
            ctx.arc(backCx, backCy, r, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_RIGHT;
            ctx.fill();
            ctx.stroke();

            // Draw connecting rim
            const dx = backCx - frontCx;
            const dy = backCy - frontCy;
            const angle = Math.atan2(dy, dx);
            const t1 = angle - Math.PI / 2;
            const t2 = angle + Math.PI / 2;

            ctx.beginPath();
            ctx.moveTo(backCx + r * Math.cos(t1), backCy + r * Math.sin(t1));
            ctx.lineTo(frontCx + r * Math.cos(t1), frontCy + r * Math.sin(t1));
            ctx.lineTo(frontCx + r * Math.cos(t2), frontCy + r * Math.sin(t2));
            ctx.lineTo(backCx + r * Math.cos(t2), backCy + r * Math.sin(t2));
            ctx.closePath();
            ctx.fillStyle = COLOR_RIGHT;
            ctx.fill();

            // Stroke rim edges
            ctx.beginPath();
            ctx.moveTo(backCx + r * Math.cos(t1), backCy + r * Math.sin(t1));
            ctx.lineTo(frontCx + r * Math.cos(t1), frontCy + r * Math.sin(t1));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(backCx + r * Math.cos(t2), backCy + r * Math.sin(t2));
            ctx.lineTo(frontCx + r * Math.cos(t2), frontCy + r * Math.sin(t2));
            ctx.stroke();

            // Draw perfect front circle (Mirror Face)
            ctx.beginPath();
            ctx.arc(frontCx, frontCy, r, 0, 2 * Math.PI);
            
            // Mirror glass reflection slash
            const faceGrd = ctx!.createLinearGradient(
                frontCx + r*0.5, frontCy - r*0.5,
                frontCx - r*0.5, frontCy + r*0.5
            );
            faceGrd.addColorStop(0, COLOR_TOP);
            faceGrd.addColorStop(0.45, COLOR_TOP);
            faceGrd.addColorStop(0.5, COLOR_RIGHT); // sleek diagonal glass shine
            faceGrd.addColorStop(0.55, COLOR_TOP);
            faceGrd.addColorStop(1, COLOR_TOP);

            ctx.fillStyle = faceGrd;
            ctx.fill();
            ctx.stroke();

            // Labels
            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else {
            const inset = geom === 'polyhedron' ? 0.3 : 0;
            const v3d = [
                {x:0, y:0, z:0}, {x:W, y:0, z:0}, {x:W, y:0, z:D}, {x:0, y:0, z:D},
                {x:W*inset, y:H, z:D*inset}, {x:W*(1-inset), y:H, z:D*inset}, 
                {x:W*(1-inset), y:H, z:D*(1-inset)}, {x:W*inset, y:H, z:D*(1-inset)}
            ];

            const projected = v3d.map(p => project(p.x, p.y, p.z));
            const pts = projected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));

            function drawFace(indices: number[], color: string) {
                ctx!.beginPath();
                ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                ctx!.closePath();
                ctx!.fillStyle = color;
                ctx!.fill();
                ctx!.stroke();
            }

            drawFace([4, 5, 6, 7], COLOR_TOP);
            drawFace([0, 3, 7, 4], COLOR_LEFT);
            drawFace([0, 1, 5, 4], COLOR_RIGHT);

            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);
        }

        resolve(canvas.toDataURL('image/png', 1.0));
    });
}
