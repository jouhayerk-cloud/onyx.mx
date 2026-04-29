import { vendors } from '../../lib/consts';

export function generatePackingListHtml(manifestId: string, metadata: any, payload: any) {
    const { crates, truckStats, timestamp } = payload;
    const cratesJson = JSON.stringify(crates);
    
    const crateRows = crates.map((c: any) => {
        const crateColor = c.color || (vendors as any)[c.subtitle]?.color || '#adb5bd';
        
        const itemRows = (c.items || []).map((it: any, idx: number) => `
            <tr>
                <td style="padding: 15px 0; font-size: 10px; font-weight: 900; color: #e2e8f0; vertical-align: top;">
                    ${String(idx + 1).padStart(2, '0')}
                </td>
                <td style="padding: 15px 0; vertical-align: top;">
                    <div style="display: inline-flex; border: 1px solid #000; border-left: 8px solid ${it.tagColor || (vendors as any)[it.vendorPrefix]?.color || '#000'}; border-radius: 6px; padding: 6px 12px; background: #fff; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 900; margin-bottom: 8px;">
                        ${it.itemId}
                    </div>
                </td>
                <td style="padding: 15px 15px; vertical-align: top;">
                    <div style="font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 6px;">
                        ${it.name}
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${it.type || 'Unit'}</span>
                        <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${it.desc || '—'}</span>
                    </div>
                </td>
                <td style="padding: 15px 0; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; vertical-align: top;">
                    ${it.combinedAttr || '—'}
                </td>
                <td style="padding: 15px 0; font-size: 24px; font-weight: 900; text-align: right; vertical-align: top;">
                    ${it.qty}
                </td>
            </tr>
        `).join('');

        return `
            <div style="margin-bottom: 60px; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 15px; border-bottom: 1px solid #000; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${crateColor};"></div>
                        <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">${c.label}</span>
                        <span style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 10px;">${c.subtitle}</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
                        ${c.l}×${c.w}×${c.h} CM &nbsp;·&nbsp; ${(c.items?.reduce((s:number,i:any)=>s+((i.weightKg||0)*(i.qty||1)),0) || 0).toFixed(1)} KG
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #000;">
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 40px;">Seq</th>
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 140px;">Barcode ID</th>
                            <th style="text-align: left; padding: 10px 15px; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Description / Attributes</th>
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 160px;">Color & Material</th>
                            <th style="text-align: right; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 60px;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Packing List - ${manifestId}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700;900&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 60px; background: #fff; color: #111827; line-height: 1.4; }
        @media print {
            body { padding: 0; }
            .no-print { display: none; }
            #three-container { display: none; }
            #static-thumbnail { display: block !important; }
        }
    </style>
</head>
<body>
    <div style="max-width: 1000px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 40px; margin-bottom: 40px;">
            <div>
                <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: -0.01em;">Onyx Logistics Trailer Manifest</h1>
                <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3em; margin: 0;">Digital Mirror Protocol v2.8 · Issued ${timestamp}</p>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -0.03em;">${manifestId}</div>
            </div>
        </div>

        <!-- Metrics -->
        <div style="display: grid; grid-template-cols: 1fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 60px;">
            <div>
                <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Payload Weight</label>
                <div style="font-size: 42px; font-weight: 900; letter-spacing: -0.04em;">
                    ${Math.round(truckStats?.totalWeight || 0).toLocaleString()} <span style="font-size: 14px; color: #cbd5e1;">KG</span>
                </div>
                <div style="font-size: 9px; font-weight: 900; color: #059669; text-transform: uppercase; margin-top: 5px;">${truckStats?.payloadPct || 0}% Utilization</div>
            </div>
            <div>
                <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Distribution</label>
                <div style="height: 6px; background: #f1f5f9; border-radius: 3px; display: flex; overflow: hidden; margin-bottom: 10px;">
                    <div style="flex: ${truckStats?.rPct || 1}; background: #94a3b8;"></div>
                    <div style="flex: ${truckStats?.mPct || 1}; background: #cbd5e1;"></div>
                    <div style="flex: ${truckStats?.fPct || 1}; background: #e2e8f0;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">
                    <span>Rear: ${truckStats?.rPct || 0}%</span>
                    <span>Front: ${truckStats?.fPct || 0}%</span>
                </div>
            </div>
            <div style="grid-column: span 2; border-left: 1px solid #f1f5f9; padding-left: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                <div>
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Volume Status</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${truckStats?.statusColor || '#111827'};">${truckStats?.status || 'OPTIMAL'}</span>
                    <span style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-left: 4px;">${truckStats?.volPct || 0}% FILLED</span>
                </div>
                <div>
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Seal Number</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.sealNumber || '—'}</span>
                </div>
                <div>
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Tractor / Plates</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.tractorNumber || '—'} ${metadata?.truckPlates ? '· ' + metadata.truckPlates : ''}</span>
                </div>
                <div style="grid-column: span 3;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Trailer / Plates</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.trailerNumber || '—'} ${metadata?.trailerPlates ? '· ' + metadata.trailerPlates : ''}</span>
                </div>
                <div style="grid-column: span 3;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Dispatch Personnel</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${(metadata?.senders || []).join(' / ') || '—'}</span>
                </div>
            </div>
        </div>

        <!-- 3D Interactive Map Section -->
        <div style="margin-bottom: 60px;">
            <h2 style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; color: #cbd5e1; margin-bottom: 30px; display: flex; align-items: center; gap: 20px;">
                Live 3D Load Simulation <div style="flex: 1; height: 1px; background: #f1f5f9;"></div>
            </h2>
            <div id="three-container" style="width: 100%; height: 500px; background: #0c0c12; border-radius: 20px; border: 1px solid #1e293b; position: relative; overflow: hidden; cursor: grab;">
                <div style="position: absolute; top: 20px; right: 20px; z-index: 10; background: rgba(0,0,0,0.4); backdrop-filter: blur(10px); padding: 8px 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); font-size: 8px; font-weight: 900; color: rgba(255,255,255,0.4); letter-spacing: 0.2em; text-transform: uppercase;">
                    Digital Twin · Interactive View
                </div>
                <div style="position: absolute; bottom: 20px; left: 20px; z-index: 10; font-size: 8px; font-weight: 900; color: rgba(255,255,255,0.2); letter-spacing: 0.1em; text-transform: uppercase;">
                    Drag to Rotate · Scroll to Zoom
                </div>
            </div>
            <!-- Fallback for print -->
            <div id="static-thumbnail" style="display: none; width: 100%; border: 1px solid #f1f5f9; border-radius: 20px; padding: 20px; background: #f8fafc; text-align: center;">
                <div style="font-size: 12px; font-weight: 900; color: #94a3b8; text-transform: uppercase;">3D Simulation View (Interactive in Web Browser)</div>
            </div>
        </div>

        <!-- Inventory Breakdown -->
        <h2 style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; color: #cbd5e1; margin-bottom: 40px; display: flex; align-items: center; gap: 20px;">
            Inventory Breakdown <div style="flex: 1; height: 1px; background: #f1f5f9;"></div>
        </h2>
        
        ${crateRows}

        <div style="margin-top: 100px; padding-top: 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; color: #e2e8f0;">
            <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em;">Secure Mirror Protocol · ${new Date().getFullYear()}</div>
            <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em;">End of Document</div>
        </div>
    </div>

    <!-- Live 3D Simulation Script -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script>
        (function() {
            const crates = ${cratesJson};
            const container = document.getElementById('three-container');
            if (!container) return;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0c0c12);

            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10000);
            camera.position.set(2500, 1500, 2500);
            camera.lookAt(800, 0, 120);

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            // Lighting
            const ambient = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambient);
            const directional = new THREE.DirectionalLight(0xffffff, 0.8);
            directional.position.set(1000, 2000, 1000);
            scene.add(directional);

            // Truck Bed
            const bedGeo = new THREE.BoxGeometry(1615, 5, 244);
            const bedMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, transparent: true, opacity: 0.5 });
            const bed = new THREE.Mesh(bedGeo, bedMat);
            bed.position.set(1615/2, -2.5, 244/2);
            scene.add(bed);

            // Grid
            const grid = new THREE.GridHelper(2000, 20, 0x334155, 0x1e293b);
            grid.position.y = -0.1;
            scene.add(grid);

            // Crates
            crates.forEach(c => {
                const geo = new THREE.BoxGeometry(c.w, c.h || 100, c.l);
                const mat = new THREE.MeshPhongMaterial({ color: c.color || 0x6b7280 });
                const mesh = new THREE.Mesh(geo, mat);
                
                // Position adjustment (center-based in Three.js)
                mesh.position.set(c.x + c.w/2, (c.h || 100)/2 + (c.y || 0), c.z + c.l/2);
                if (c.r) mesh.rotation.y = (c.r * Math.PI) / 180;

                // Edges
                const edges = new THREE.EdgesGeometry(geo);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
                mesh.add(line);

                scene.add(mesh);
            });

            // Interaction (Basic rotation)
            let isDragging = false;
            let previousMouseX = 0;
            let previousMouseY = 0;
            let rotationY = 0;
            let rotationX = 0;

            container.addEventListener('mousedown', e => { isDragging = true; container.style.cursor = 'grabbing'; });
            window.addEventListener('mouseup', e => { isDragging = false; container.style.cursor = 'grab'; });
            window.addEventListener('mousemove', e => {
                if (!isDragging) return;
                const deltaX = e.clientX - previousMouseX;
                const deltaY = e.clientY - previousMouseY;
                
                const target = new THREE.Vector3(800, 0, 120);
                const radius = camera.position.distanceTo(target);
                
                rotationY -= deltaX * 0.005;
                rotationX = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, rotationX + deltaY * 0.005));
                
                camera.position.x = target.x + radius * Math.cos(rotationX) * Math.sin(rotationY);
                camera.position.y = target.y + radius * Math.sin(rotationX);
                camera.position.z = target.z + radius * Math.cos(rotationX) * Math.cos(rotationY);
                camera.lookAt(target);

                previousMouseX = e.clientX;
                previousMouseY = e.clientY;
            });

            container.addEventListener('wheel', e => {
                e.preventDefault();
                const target = new THREE.Vector3(800, 0, 120);
                const dir = camera.position.clone().sub(target).normalize();
                const zoomSpeed = 50;
                if (e.deltaY < 0) camera.position.sub(dir.multiplyScalar(zoomSpeed));
                else camera.position.add(dir.multiplyScalar(zoomSpeed));
                camera.lookAt(target);
            }, { passive: false });

            previousMouseX = 0; previousMouseY = 0;
            
            function animate() {
                requestAnimationFrame(animate);
                renderer.render(scene, camera);
            }
            animate();

            window.addEventListener('resize', () => {
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            });
        })();
    </script>
</body>
</html>
    `;
}
