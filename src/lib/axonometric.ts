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

export async function generateAxonometricDataUrl(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = '',
    wireframeColor?: string,
    asJpeg: boolean = false
): Promise<string> {
    return new Promise((resolve) => {
        let W = w_cm;
        let H = h_cm;
        let D = d_cm;

        const s = shapeStr.toLowerCase();
        const t = descStr.toLowerCase();
        let geom = 'box';
        let isMirror = false;
        
        if (s.includes('bowl') || t.includes('bowl') || s.includes('canoe') || t.includes('canoe') || s.includes('canoa') || t.includes('canoa')) geom = 'bowl';
        else if (s.includes('plate') || t.includes('plate') || s.includes('plato') || t.includes('plato') || s.includes('tray') || t.includes('tray') || s.includes('dish') || t.includes('dish')) geom = 'plate';
        else if (s.includes('mirror') || t.includes('mirror')) {
            isMirror = true;
            if (s.includes('rectangular') || t.includes('rectangular') || s.includes('squared') || t.includes('squared')) {
                geom = 'box';
            } else if (s.includes('round') || t.includes('round') || s.includes('circle') || t.includes('circle') || s.includes('redondo') || t.includes('redondo') || s.includes('oval') || t.includes('oval')) {
                geom = 'mirror';
            } else {
                geom = 'box';
            }
        }
        else if (s.includes('cylinder') || t.includes('cylinder') || t.includes('cilinder') || s.includes('round') || t.includes('round') || s.includes('pendant') || t.includes('pendant')) {
            geom = 'cylinder';
        }
        else if (s.includes('rock') || t.includes('rock') || s.includes('sculpture') || t.includes('sculpture') || s.includes('fountain') || t.includes('fountain')) geom = 'polyhedron';

        if (geom === 'mirror') {
            const maxVal = Math.max(W, H, D);
            const minVal = Math.min(W, H, D);
            W = maxVal;
            H = maxVal;
            D = minVal;
        }

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

        const isWireframe = !!wireframeColor;
        // Grayscale Palette (transparent if wireframe to achieve hidden-line look)
        const COLOR_TOP = isWireframe ? 'rgba(0,0,0,0)' : '#F0F0F0';
        const COLOR_RIGHT = isWireframe ? 'rgba(0,0,0,0)' : '#D4D4D4';
        const COLOR_LEFT = isWireframe ? 'rgba(0,0,0,0)' : '#9E9E9E';
        const COLOR_OUTLINE = wireframeColor || '#111111';

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
            const isPlate = geom === 'plate';
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

            if (isPlate) {
                // FLAT CONCAVE SHALLOW PLATE rendering
                const plateThickness = Math.max(H * 0.15, 2/scale);
                const baseDepth = Math.max(H * 0.4, 6/scale);
                
                // 1. Draw outer rim bottom edge (for thickness)
                drawEllipsePath(ct_u, ct_v + plateThickness, 1.0, 0, Math.PI);
                ctx.strokeStyle = wireframeColor || '#94a3b8';
                ctx.stroke();

                // 2. Connect thickness edges
                ctx.beginPath();
                const pLeft_u = cx + (ct_u + a*Math.cos(Math.PI) + c*Math.sin(Math.PI))*scale;
                const pLeft_v = cy + (ct_v + b*Math.cos(Math.PI) + d*Math.sin(Math.PI))*scale;
                const pRight_u = cx + (ct_u + a*Math.cos(0) + c*Math.sin(0))*scale;
                const pRight_v = cy + (ct_v + b*Math.cos(0) + d*Math.sin(0))*scale;
                
                ctx.moveTo(pLeft_u, pLeft_v);
                ctx.lineTo(pLeft_u, pLeft_v + plateThickness*scale);
                ctx.moveTo(pRight_u, pRight_v);
                ctx.lineTo(pRight_u, pRight_v + plateThickness*scale);
                ctx.stroke();

                // 3. Draw full top ellipse (outer rim)
                drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
                ctx.fillStyle = COLOR_TOP;
                ctx.fill();
                ctx.stroke();

                // 4. Draw inner concave area
                const innerRadius = 0.82;
                drawEllipsePath(ct_u, ct_v, innerRadius, 0, 2 * Math.PI);
                const grad = ctx.createLinearGradient(
                    cx + (ct_u - a)*scale, cy + (ct_v - b)*scale,
                    cx + (ct_u + a)*scale, cy + (ct_v + b)*scale
                );
                grad.addColorStop(0, '#f4f4f5'); // zinc-100
                grad.addColorStop(1, '#a1a1aa'); // zinc-400
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.stroke();

                // 5. Draw flat base (inner center)
                const baseRadius = 0.55;
                drawEllipsePath(ct_u, ct_v + baseDepth, baseRadius, 0, 2 * Math.PI);
                ctx.fillStyle = '#d4d4d8'; // zinc-300
                ctx.fill();
                ctx.stroke();

                // Draw lines connecting inner rim to flat base
                const numSpokes = 8;
                for (let i = 0; i < numSpokes; i++) {
                    const angle = (i / numSpokes) * Math.PI * 2;
                    const x = Math.cos(angle);
                    const z = Math.sin(angle);
                    const u = a * x + c * z;
                    const v = b * x + d * z;
                    ctx.beginPath();
                    ctx.moveTo(cx + (ct_u + u * innerRadius) * scale, cy + (ct_v + v * innerRadius) * scale);
                    ctx.lineTo(cx + (ct_u + u * baseRadius) * scale, cy + (ct_v + baseDepth + v * baseRadius) * scale);
                    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
                    ctx.stroke();
                }

                ctx.strokeStyle = wireframeColor || '#000'; // Reset stroke

            } else {
                // BOWL rendering (original)
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
                
                const grd = ctx.createLinearGradient(p0_u, 0, p2_u, 0);
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
                ctx.fillStyle = '#C0C0C0';
                ctx.fill();
                ctx.stroke();
            }

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
            ctx!.fillStyle = COLOR_TOP;
            ctx!.fill();
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
