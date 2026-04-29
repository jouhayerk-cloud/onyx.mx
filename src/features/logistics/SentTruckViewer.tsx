import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useAtom, useAtomValue } from 'jotai';
import { sentTruckIdAtom, universalViewAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { 
    ChevronLeft, Truck, Package, Maximize2, Move, X, List, 
    Layers, Info, ArrowUpRight, Scale, Box, Map as MapIcon, 
    Hash, Timer, ShieldCheck, Factory, Download, Share2
} from 'lucide-react';
import gsap from 'gsap';

export const SentTruckViewer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sentTruckId = useAtomValue(sentTruckIdAtom);
    const [view, setView] = useAtom(universalViewAtom);
    
    const [shipment, setShipment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);

    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        crates: Map<string, THREE.Mesh>;
    } | null>(null);

    const TRUCK_L = 16.15;
    const TRUCK_W = 2.44;
    const TRUCK_H = 2.8;

    // Theme Constants (Matched to generatePackingListHtml.ts)
    const COLORS = {
        bg: '#ffffff',
        surface: '#ffffff',
        surfaceHi: '#f8f9fa',
        border: '#e9ecef',
        text: '#111827',
        textDim: '#6b7280',
        accent: '#2563eb',
        emerald: '#059669',
    };

    useEffect(() => {
        if (!sentTruckId) return;
        const fetchShipment = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.from('shipments').select('*').eq('manifest_id', sentTruckId).single();
                if (error) throw error;
                if (!data) throw new Error('Shipment not found');
                setShipment(data);
            } catch (err: any) {
                console.error('[TruckViewer] Fetch error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchShipment();
    }, [sentTruckId]);

    const payload = useMemo(() => {
        if (!shipment?.payload) return null;
        try {
            return typeof shipment.payload === 'string' ? JSON.parse(shipment.payload) : shipment.payload;
        } catch (e) { return null; }
    }, [shipment]);

    const cratesData = useMemo(() => payload?.crates || [], [payload]);

    const selectedCrateData = useMemo(() => {
        if (!selectedCrateId || !payload) return null;
        return payload.crates?.find((c: any) => c.id === selectedCrateId);
    }, [selectedCrateId, payload]);

    useEffect(() => {
        if (!containerRef.current || !shipment || !payload) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(18, 14, 18);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1;

        // Lighting (Natural)
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.4);
        sun.position.set(10, 20, 10);
        scene.add(sun);

        // Ground Grid (Subtle)
        const grid = new THREE.GridHelper(40, 40, 0xe9ecef, 0xf8f9fa);
        scene.add(grid);

        // Truck Bed
        const bedGeo = new THREE.BoxGeometry(TRUCK_L, 0.05, TRUCK_W);
        const bedMat = new THREE.MeshStandardMaterial({ color: 0xf8f9fa });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.position.y = -0.025;
        scene.add(bed);

        const cratesMap = new Map<string, THREE.Mesh>();
        cratesData.forEach((c: any) => {
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;
            const isRotated = c.r === 90;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            const vendorKey = c.vendorList?.[0] as keyof typeof vendors;
            const vendorCol = vendors[vendorKey]?.color || '#adb5bd';
            
            const material = new THREE.MeshStandardMaterial({ 
                color: vendorCol,
                metalness: 0,
                roughness: 1,
                transparent: true,
                opacity: 0.82,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });

            const mesh = new THREE.Mesh(geometry, material);
            const x_m = (c.x || 0) / 100;
            const y_m = (c.y || 0) / 100; // Height
            const z_m = (c.z || 0) / 100; // Width/Depth

            // Coordinate Mapping Fix (Matches Updated HTML Generator)
            mesh.position.set(
                x_m - (TRUCK_L / 2) + (isRotated ? dw : dl) / 2,
                y_m + (dh / 2) + 0.001,
                z_m - (TRUCK_W / 2) + (isRotated ? dl : dw) / 2
            );

            if (isRotated) mesh.rotation.y = Math.PI / 2;
            mesh.userData = { id: c.id, data: c };
            scene.add(mesh);

            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(geometry),
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
            );
            mesh.add(edges);
            cratesMap.set(c.id, mesh);
        });

        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let mouseDownPos = { x: 0, y: 0 };

        const onMouseDown = (e: MouseEvent) => { mouseDownPos = { x: e.clientX, y: e.clientY }; };
        const onMouseUp = (e: MouseEvent) => {
            const dist = Math.sqrt(Math.pow(e.clientX - mouseDownPos.x, 2) + Math.pow(e.clientY - mouseDownPos.y, 2));
            if (dist > 5) return;
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(Array.from(cratesMap.values()));
            if (intersects.length > 0) {
                const clicked = intersects[0].object as THREE.Mesh;
                setSelectedCrateId(clicked.userData.id);
            } else {
                setSelectedCrateId(null);
            }
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mouseup', onMouseUp);

        const handleResize = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            renderer.domElement.removeEventListener('mouseup', onMouseUp);
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [shipment, payload]);

    useEffect(() => {
        if (!sceneRef.current) return;
        const { crates, camera, controls } = sceneRef.current;
        crates.forEach((mesh, id) => {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (selectedCrateId === null) {
                material.opacity = 0.82;
                material.emissiveIntensity = 0;
            } else if (id === selectedCrateId) {
                material.opacity = 1;
                material.emissiveIntensity = 0.2;
                material.emissive.setHex(0x2563eb);
                
                const targetCamPos = mesh.position.clone().add(new THREE.Vector3(5, 4, 5));
                gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 1, ease: "power2.inOut" });
                gsap.to(controls.target, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, duration: 1, ease: "power2.inOut" });
            } else {
                material.opacity = 0.15;
                material.emissiveIntensity = 0;
            }
        });
    }, [selectedCrateId]);

    if (loading) return (
        <div className="w-full h-screen bg-white flex flex-col items-center justify-center gap-8">
            <div className="w-12 h-12 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="text-gray-400 font-black uppercase tracking-[0.4em] text-[10px]">Loading Manifest Payload</div>
        </div>
    );

    return (
        <div className="relative w-full h-screen overflow-hidden bg-white font-['Inter'] text-[#111827]">
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Top Bar (HTML Style) */}
            <div className="absolute top-0 left-0 right-0 z-10 px-10 py-8 flex justify-between items-end border-b-2 border-[#111827] bg-white/80 backdrop-blur-xl pointer-events-auto">
                <div className="flex items-center gap-8">
                    <button onClick={() => setView('app')} className="p-4 rounded-xl hover:bg-gray-100 transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">ONYX LOGISTICS TRAILER MANIFEST</h1>
                        <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-[0.3em] mt-1.5">Digital Mirror Protocol v2.8</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-black tracking-tighter leading-none">{sentTruckId}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">ISSUED: {payload?.timestamp}</div>
                </div>
            </div>

            {/* Metrics HUD (HTML Style Cards) */}
            <div className="absolute top-40 left-10 right-10 z-10 grid grid-cols-4 gap-6 pointer-events-none">
                <div className="bg-[#f8f9fa] border border-[#e9ecef] rounded-2xl p-8 pointer-events-auto shadow-sm">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 block">Payload Weight</label>
                    <div className="text-4xl font-black tracking-tighter">
                        {Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} <span className="text-sm font-bold text-gray-400 ml-1">KG</span>
                    </div>
                    <div className="text-[11px] font-black uppercase text-[#059669] mt-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                        {payload?.truckStats?.payloadPct || 0}% UTILIZATION
                    </div>
                </div>
                <div className="bg-[#f8f9fa] border border-[#e9ecef] rounded-2xl p-8 pointer-events-auto shadow-sm col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 block">Distribution</label>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden flex mb-4">
                        <div className="h-full bg-[#343a40]" style={{ flex: payload?.truckStats?.rPct || 1 }} />
                        <div className="h-full bg-[#6c757d]" style={{ flex: payload?.truckStats?.mPct || 1 }} />
                        <div className="h-full bg-[#adb5bd]" style={{ flex: payload?.truckStats?.fPct || 1 }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <span>REAR: {payload?.truckStats?.rPct || 0}%</span>
                        <span>FRONT: {payload?.truckStats?.fPct || 0}%</span>
                    </div>
                </div>
                <div className="bg-[#f8f9fa] border border-[#e9ecef] rounded-2xl p-8 pointer-events-auto shadow-sm">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 block">Volume Status</label>
                    <div className="text-3xl font-black tracking-tighter uppercase">{(payload?.truckStats?.status || 'Optimal')}</div>
                    <div className="text-[11px] font-black uppercase text-[#059669] mt-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                        {payload?.truckStats?.volPct || 0}% FILLED
                    </div>
                </div>
            </div>

            {/* Floating Crate List (Left) */}
            <div className="absolute top-[480px] left-10 bottom-10 w-96 z-10 flex flex-col pointer-events-auto">
                <div className="bg-white border border-[#e9ecef] rounded-3xl flex-1 flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-8 border-b border-[#e9ecef] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers size={20} className="text-[#111827]" />
                            <span className="text-xs font-black uppercase tracking-[0.2em]">Inventory Breakdown</span>
                        </div>
                        <span className="text-xs font-black text-[#6b7280]">{cratesData.length} UNITS</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                        {cratesData.map((c: any) => {
                            const isSelected = selectedCrateId === c.id;
                            const vCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd';
                            return (
                                <button 
                                    key={c.id}
                                    onClick={() => setSelectedCrateId(isSelected ? null : c.id)}
                                    className={`w-full text-left p-6 rounded-2xl border transition-all flex items-center gap-5 group ${isSelected ? 'border-[#111827] bg-[#f8f9fa] shadow-lg' : 'border-transparent bg-white hover:bg-[#f8f9fa] hover:border-[#e9ecef]'}`}
                                >
                                    <div className="w-4 h-4 rounded-md shrink-0 border border-black/10" style={{ backgroundColor: vCol }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-black uppercase truncate tracking-tight">{c.label}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 truncate">{c.subtitle}</div>
                                    </div>
                                    <ArrowUpRight size={16} className={`transition-all ${isSelected ? 'text-[#111827]' : 'text-gray-200 group-hover:text-gray-400'}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Selected Crate Details (Overlay Table Style) */}
            {selectedCrateData && (
                <div className="absolute top-1/2 -translate-y-1/2 right-10 w-[720px] max-h-[85vh] z-20 animate-in slide-in-from-right-20 fade-in duration-500 pointer-events-auto">
                    <div className="bg-white border-2 border-[#111827] rounded-[2rem] overflow-hidden flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.15)]">
                        <div className="p-10 pb-6 border-b-2 border-[#111827] relative">
                            <button onClick={() => setSelectedCrateId(null)} className="absolute top-8 right-8 p-3 rounded-xl hover:bg-gray-100 transition-colors">
                                <X size={24} />
                            </button>
                            
                            <div className="flex items-center gap-6 mb-6">
                                <div className="w-6 h-6 rounded-md border border-black/10" style={{ backgroundColor: vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd' }} />
                                <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">{selectedCrateData.label}</h2>
                            </div>
                            <div className="flex items-center gap-10">
                                <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{selectedCrateData.subtitle}</p>
                                <div className="h-4 w-px bg-gray-200" />
                                <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">
                                    {selectedCrateData.l}×{selectedCrateData.w}×{selectedCrateData.h} CM · {(selectedCrateData.items?.reduce((s: number, i: any) => s + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0).toFixed(1)} KG
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 pt-0">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-[#111827]">
                                        <th className="text-left py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16">SEQ</th>
                                        <th className="text-left py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-48">BARCODE ID</th>
                                        <th className="text-left py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">DESCRIPTION / ATTR</th>
                                        <th className="text-right py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">QTY</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y border-[#e9ecef]">
                                    {selectedCrateData.items?.map((item: any, idx: number) => (
                                        <tr key={idx} className="group hover:bg-[#f8f9fa] transition-colors">
                                            <td className="py-8 text-[11px] font-black text-gray-300">
                                                {String(idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="py-8">
                                                <div className="inline-block px-3 py-1.5 rounded-lg border-2 font-mono text-xs font-black bg-white" style={{ borderColor: item.tagColor || '#e9ecef', borderLeftWidth: '6px' }}>
                                                    {item.itemId}
                                                </div>
                                            </td>
                                            <td className="py-8">
                                                <div className="text-base font-black uppercase tracking-tight mb-2">{item.name}</div>
                                                <div className="flex gap-2">
                                                    <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{item.type || 'Unit'}</span>
                                                    <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{item.desc || '—'}</span>
                                                </div>
                                                <div className="mt-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{item.combinedAttr}</div>
                                            </td>
                                            <td className="py-8 text-right">
                                                <div className="text-2xl font-black tabular-nums">{item.qty}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-10 border-t border-gray-100 mt-auto bg-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-[#059669]" size={20} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">SECURE DIGITAL MIRROR PROTOCOL</span>
                            </div>
                            <div className="text-[9px] font-mono text-gray-300">CHKSUM: {Math.random().toString(16).slice(2, 10).toUpperCase()}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Footer (HTML Style) */}
            <div className="absolute bottom-10 left-10 z-10 flex items-center gap-4 pointer-events-none">
                <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">
                    ONYX LOGISTICS · SECURE MIRROR INTERFACE · {new Date().getFullYear()}
                </div>
            </div>
        </div>
    );
};
