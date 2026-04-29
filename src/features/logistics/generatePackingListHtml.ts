
import { vendors } from '../../lib/consts';

export function generatePackingListHtml(shipmentId: string, metadata: any, payload: any): string {
    const { sealNumber, tractorNumber, truckPlates, trailerNumber, trailerPlates, senders } = metadata;
    const { crates, truckStats, timestamp } = payload;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${shipmentId}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f8f9fb;
            --surface: #ffffff;
            --surface-hi: rgba(255, 255, 255, 0.7);
            --border: rgba(0, 0, 0, 0.05);
            --text: #111827;
            --text-dim: #6b7280;
            --accent: #D95A0A;
            --emerald: #059669;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: var(--bg); 
            color: var(--text); 
            font-family: 'Inter', sans-serif; 
            line-height: 1.5;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }
        .dashboard { padding: 80px 40px; max-width: 1300px; margin: 0 auto; }
        
        .top-bar {
            background: var(--surface);
            backdrop-filter: blur(40px);
            border: 1px solid var(--border);
            border-radius: 40px;
            padding: 48px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 64px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.02);
        }
        .top-bar::before {
            content: '';
            position: absolute;
            top: 0; left: 0; bottom: 0;
            width: 8px;
            background: var(--accent);
        }
        .branding h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.05em; text-transform: uppercase; color: var(--text); }
        .branding p { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4em; font-weight: 800; margin-top: 8px; }
        .top-stats { text-align: right; }
        .top-stats .id { font-size: 36px; font-weight: 900; line-height: 1; letter-spacing: -0.06em; color: var(--text); }
        .top-stats .time { font-size: 10px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; margin-top: 10px; letter-spacing: 0.1em; }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-bottom: 64px;
        }
        .metric-card {
            background: var(--surface);
            border-radius: 32px;
            padding: 40px;
            border: 1px solid var(--border);
            box-shadow: 0 10px 30px rgba(0,0,0,0.02);
        }
        .metric-card label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-dim); display: block; margin-bottom: 16px; letter-spacing: 0.2em; }
        .metric-card .value { font-size: 42px; font-weight: 900; color: var(--text); line-height: 1; letter-spacing: -0.04em; }
        .metric-card .unit { font-size: 14px; font-weight: 700; color: var(--text-dim); margin-left: 8px; }
        .metric-card .sub-value { font-size: 11px; color: var(--text); font-weight: 800; text-transform: uppercase; margin-top: 24px; display: flex; align-items: center; gap: 8px; }
        .metric-card .sub-value::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); }

        .axle-bar { height: 12px; background: #f1f5f9; border-radius: 6px; display: flex; overflow: hidden; margin: 16px 0; }
        .axle-seg { height: 100%; border-right: 1px solid #fff; }

        .meta-grid { 
            display: grid; 
            grid-template-columns: repeat(4, 1fr); 
            gap: 20px; 
            margin-bottom: 64px;
            padding: 40px;
            background: var(--surface);
            border-radius: 32px;
            border: 1px solid var(--border);
            box-shadow: 0 10px 30px rgba(0,0,0,0.02);
        }
        .meta-item label { font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--text-dim); display: block; margin-bottom: 8px; letter-spacing: 0.2em; }
        .meta-item span { font-size: 15px; font-weight: 700; color: var(--text); display: block; text-transform: uppercase; }

        .viewer-container {
            width: 100%;
            height: 640px;
            background: #ffffff;
            border-radius: 40px;
            border: 1px solid var(--border);
            margin-bottom: 64px;
            position: relative;
            overflow: hidden;
            box-shadow: inset 0 0 100px rgba(0,0,0,0.01);
        }
        #canvas-holder { width: 100%; height: 100%; }
        .viewer-overlay { position: absolute; top: 32px; left: 32px; pointer-events: none; }
        .viewer-overlay h3 { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; color: var(--text-dim); }

        .section-header { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; color: var(--text); margin-bottom: 32px; padding-bottom: 12px; border-bottom: 2px solid var(--text); display: inline-block; }

        .crate-section { margin-bottom: 64px; background: var(--surface); border-radius: 40px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
        .crate-header { padding: 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); background: #fbfbfc; }
        .crate-title { display: flex; align-items: center; gap: 24px; }
        .crate-badge { width: 10px; height: 32px; border-radius: 5px; }
        .crate-label { font-size: 28px; font-weight: 900; text-transform: uppercase; color: var(--text); letter-spacing: -0.04em; }
        .crate-meta { font-size: 12px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; }

        .table-wrap { padding: 0 40px 40px 40px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 24px 0; font-size: 10px; font-weight: 900; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.2em; border-bottom: 2px solid var(--text); }
        td { padding: 32px 0; border-bottom: 1px solid var(--border); vertical-align: top; }
        
        .tag-id { 
            display: inline-block; 
            padding: 8px 16px; 
            border-radius: 12px; 
            font-size: 14px; 
            font-weight: 900; 
            font-family: monospace;
            background: #fff;
            color: #000;
            border: 2px solid #000;
            box-shadow: 4px 4px 0 rgba(0,0,0,0.05);
        }
        .item-name { font-size: 18px; font-weight: 900; color: var(--text); margin-bottom: 12px; letter-spacing: -0.02em; text-transform: uppercase; }
        .item-tags { display: flex; gap: 10px; }
        .item-tag { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-dim); background: #f1f5f9; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border); }
        .attr-cell { font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; }
        .qty-cell { font-size: 32px; font-weight: 900; color: var(--text); letter-spacing: -0.05em; }

        .footer { text-align: left; color: var(--text-dim); font-size: 10px; font-weight: 800; letter-spacing: 0.4em; text-transform: uppercase; margin-top: 100px; padding-top: 40px; border-top: 1px solid var(--border); }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="top-bar">
            <div class="branding">
                <h1>ONYX LOGISTICS TRAILER MANIFEST</h1>
                <p>Digital Mirror Protocol v2.8</p>
            </div>
            <div class="top-stats">
                <div class="id">${shipmentId}</div>
                <div class="time">ISSUED: ${timestamp}</div>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <label>Payload Weight</label>
                <div class="value">${Math.round(truckStats?.totalWeight || 0).toLocaleString()}<span class="unit">KG</span></div>
                <div class="sub-value">${truckStats?.payloadPct || 0}% UTILIZATION</div>
            </div>
            <div class="metric-card">
                <label>Distribution</label>
                <div class="axle-bar">
                    <div class="axle-seg" style="flex: ${truckStats?.rPct || 1}; background: #1e293b;"></div>
                    <div class="axle-seg" style="flex: ${truckStats?.mPct || 1}; background: #64748b;"></div>
                    <div class="axle-seg" style="flex: ${truckStats?.fPct || 1}; background: #cbd5e1;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em;">
                    <span>REAR: ${truckStats?.rPct || 0}%</span>
                    <span>FRONT: ${truckStats?.fPct || 0}%</span>
                </div>
            </div>
            <div class="metric-card">
                <label>Volume Status</label>
                <div class="value">${(truckStats?.status || 'Optimal').toUpperCase()}</div>
                <div class="sub-value">${truckStats?.volPct || 0}% FILLED</div>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-item"><label>Seal Number</label><span>${sealNumber || '—'}</span></div>
            <div class="meta-item"><label>Tractor / Plates</label><span>${tractorNumber || '—'} · ${truckPlates || '—'}</span></div>
            <div class="meta-item"><label>Trailer / Plates</label><span>${trailerNumber || '—'} · ${trailerPlates || '—'}</span></div>
            <div class="meta-item"><label>Dispatch Personnel</label><span>${(senders || []).join(' / ') || '—'}</span></div>
        </div>

        <div class="section-header">Live Load Simulation</div>
        <div class="viewer-container">
            <div id="canvas-holder"></div>
            <div class="viewer-overlay">
                <h3>VIRTUAL TWIN · SCALE 1:1 · ISOMETRIC MIRROR</h3>
            </div>
        </div>

        <div class="section-header">Inventory Breakdown</div>
        
        ${(crates || []).map((c: any, ci: number) => {
            const crateCol = c.color || '#adb5bd';
            return `
            <div class="crate-section">
                <div class="crate-header">
                    <div class="crate-title">
                        <div class="crate-badge" style="background: ${crateCol};"></div>
                        <span class="crate-label">${c.label}</span>
                        <span style="color: var(--text-dim); font-size: 14px; font-weight: 700; margin-left: 20px; text-transform: uppercase; letter-spacing: 0.1em;">${c.subtitle}</span>
                    </div>
                    <div class="crate-meta">
                        ${c.l}×${c.w}×${c.h} CM · ${c.items.reduce((s:number,i:any)=>s+(i.weightKg*i.qty),0).toFixed(1)} KG
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 80px;">Seq</th>
                                <th style="width: 320px;">Identity / Tag ID</th>
                                <th>Description / Attributes</th>
                                <th style="width: 100px; text-align: right;">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${c.items.map((it: any, ii: number) => `
                                <tr>
                                    <td style="font-size: 11px; font-weight: 800; color: var(--text-dim);">${String(ii+1).padStart(2,'0')}</td>
                                    <td>
                                        <div class="tag-id" style="border-left-color: ${it.tagColor}; border-left-width: 10px;">
                                            ${it.itemId}
                                        </div>
                                    </td>
                                    <td>
                                        <div class="item-name">${it.name}</div>
                                        <div class="item-tags">
                                            <span class="item-tag">${it.type}</span>
                                            <span class="item-tag">${it.desc}</span>
                                        </div>
                                        <div class="attr-cell" style="margin-top: 14px; font-size: 11px;">${it.combinedAttr}</div>
                                    </td>
                                    <td class="qty-cell" style="text-align: right;">${it.qty}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            `;
        }).join('')}

        <div class="footer">ONYX LOGISTICS · SECURE DIGITAL MIRROR PROTOCOL · ${new Date().getFullYear()}</div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script>
        const CRATE_DATA = ${JSON.stringify(crates)};
        
        function initViewer() {
            const holder = document.getElementById('canvas-holder');
            if (!holder) return;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff);

            const camera = new THREE.PerspectiveCamera(35, holder.clientWidth / holder.clientHeight, 0.1, 1000);
            camera.position.set(22, 14, 22);
            camera.lookAt(0, 0, 0);

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(holder.clientWidth, holder.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            holder.appendChild(renderer.domElement);

            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxPolarAngle = Math.PI / 2.1;

            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            const sun = new THREE.DirectionalLight(0xffffff, 0.4);
            sun.position.set(10, 20, 10);
            scene.add(sun);

            const grid = new THREE.GridHelper(40, 40, 0xe2e8f0, 0xf1f5f9);
            scene.add(grid);

            const bed = new THREE.Mesh(
                new THREE.BoxGeometry(16.15, 0.05, 2.44),
                new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.1, roughness: 0.8 })
            );
            bed.position.y = -0.025;
            scene.add(bed);

            CRATE_DATA.forEach(c => {
                const dw = c.w / 100, dl = c.l / 100, dh = c.h / 100;
                const isRotated = c.r === 90;
                
                const geometry = new THREE.BoxGeometry(dl, dh, dw);
                const material = new THREE.MeshStandardMaterial({ 
                    color: c.color || 0xdee2e6,
                    metalness: 0,
                    roughness: 1,
                    transparent: true,
                    opacity: 0.85,
                    polygonOffset: true,
                    polygonOffsetFactor: 1,
                    polygonOffsetUnits: 1
                });
                const mesh = new THREE.Mesh(geometry, material);
                
                mesh.position.set(
                    c.x / 100 - 8.075 + (isRotated ? dw : dl) / 2, 
                    c.y / 100 + dh/2 + 0.001,
                    c.z / 100 - 1.22 + (isRotated ? dl : dw) / 2
                );
                
                if (isRotated) mesh.rotation.y = Math.PI / 2;
                scene.add(mesh);
                
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(geometry), 
                    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
                );
                edges.position.copy(mesh.position);
                edges.rotation.copy(mesh.rotation);
                scene.add(edges);
            });

            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            window.addEventListener('resize', () => {
                camera.aspect = holder.clientWidth / holder.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(holder.clientWidth, holder.clientHeight);
            });
        }
        
        window.onload = initViewer;
    </script>
</body>
</html>
    `;
    return html;
}
