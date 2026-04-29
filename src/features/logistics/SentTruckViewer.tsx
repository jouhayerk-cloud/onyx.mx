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
    Hash, Timer, ShieldCheck, Factory
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

    // Theme Constants
    const COLORS = {
        gold: '#C5A028',
        green: '#10b981',
        black: '#050505',
        surface: 'rgba(10, 10, 10, 0.8)',
        border: 'rgba(197, 160, 40, 0.2)',
        text: '#ffffff',
        textDim: 'rgba(255, 255, 255, 0.4)'
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
        scene.background = new THREE.Color(0x050505);

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(24, 18, 30);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1;

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(10, 20, 10);
        scene.add(sun);
        
        const accent = new THREE.PointLight(0xC5A028, 2, 50);
        accent.position.set(0, 10, 0);
        scene.add(accent);

        // Ground Grid (Gold/Black)
        const grid = new THREE.GridHelper(80, 80, 0x1a1a1a, 0x0a0a0a);
        scene.add(grid);

        // Truck Bed
        const bedGeo = new THREE.BoxGeometry(TRUCK_L, 0.05, TRUCK_W);
        const bedMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.position.y = -0.025;
        scene.add(bed);

        // Trailer Wireframe (Gold)
        const trailerGeo = new THREE.BoxGeometry(TRUCK_L, TRUCK_H, TRUCK_W);
        const trailerWire = new THREE.LineSegments(
            new THREE.EdgesGeometry(trailerGeo),
            new THREE.LineBasicMaterial({ color: 0xC5A028, transparent: true, opacity: 0.15 })
        );
        trailerWire.position.set(0, TRUCK_H / 2, 0);
        scene.add(trailerWire);

        const cratesMap = new Map<string, THREE.Mesh>();
        cratesData.forEach((c: any) => {
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;
            const isRotated = c.r === 90;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            const vendorKey = c.vendorList?.[0] as keyof typeof vendors;
            const vendorCol = vendors[vendorKey]?.color || '#C5A028';
            
            const material = new THREE.MeshStandardMaterial({ 
                color: vendorCol,
                roughness: 0.5,
                metalness: 0.2,
                transparent: true,
                opacity: 0.9,
                emissive: vendorCol,
                emissiveIntensity: 0.1
            });

            const mesh = new THREE.Mesh(geometry, material);
            const x_m = (c.x || 0) / 100;
            const y_m = (c.y || 0) / 100;
            const z_m = (c.z || 0) / 100;

            // Coordinate Mapping Fix (Matches Payload and HTML Fix)
            mesh.position.set(
                x_m - (TRUCK_L / 2) + (dl / 2),
                y_m + (dh / 2),
                z_m - (TRUCK_W / 2) + (dw / 2)
            );

            if (isRotated) mesh.rotation.y = Math.PI / 2;
            mesh.userData = { id: c.id, data: c };
            scene.add(mesh);

            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(geometry),
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
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
                material.emissiveIntensity = 0.1;
                material.opacity = 0.9;
                material.color.set(vendors[mesh.userData.data.vendorList?.[0] as keyof typeof vendors]?.color || '#C5A028');
            } else if (id === selectedCrateId) {
                material.emissiveIntensity = 0.8;
                material.opacity = 1;
                material.color.set(COLORS.gold);
                
                const targetCamPos = mesh.position.clone().add(new THREE.Vector3(5, 4, 5));
                gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 1, ease: "power2.inOut" });
                gsap.to(controls.target, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, duration: 1, ease: "power2.inOut" });
            } else {
                material.emissiveIntensity = 0;
                material.opacity = 0.1;
            }
        });
    }, [selectedCrateId]);

    if (loading) return (
        <div className="w-full h-screen bg-[#050505] flex flex-col items-center justify-center gap-8">
            <div className="w-16 h-16 border-2 border-gold/10 border-t-gold rounded-full animate-spin" style={{ borderColor: 'rgba(197, 160, 40, 0.1)', borderTopColor: '#C5A028' }}></div>
            <div className="text-gold font-black uppercase tracking-[0.6em] text-[10px]" style={{ color: '#C5A028' }}>Talan Logistics Protocol</div>
        </div>
    );

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#050505] font-['Inter'] selection:bg-gold/30 text-white">
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Header HUD */}
            <div className="absolute top-0 left-0 right-0 z-10 p-8 flex justify-between items-start pointer-events-none">
                <div className="flex gap-6 pointer-events-auto">
                    <button onClick={() => setView('app')} className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-3xl border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all shadow-2xl">
                        <ChevronLeft className="w-8 h-8 text-white/40" />
                    </button>
                    <div className="bg-black/40 backdrop-blur-3xl border border-white/5 rounded-3xl px-10 py-6 flex flex-col shadow-2xl min-w-[320px]">
                        <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full bg-gold shadow-[0_0_15px_rgba(197,160,40,1)]" style={{ backgroundColor: '#C5A028' }} />
                            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">{sentTruckId}</h1>
                        </div>
                        <div className="text-[10px] font-black text-gold/60 uppercase tracking-[0.4em] mt-3 ml-6" style={{ color: 'rgba(197, 160, 40, 0.6)' }}>Digital Mirror v2.8</div>
                    </div>
                </div>

                <div className="flex gap-4 pointer-events-auto">
                    <div className="bg-black/40 backdrop-blur-3xl border border-white/5 rounded-3xl px-8 py-5 flex flex-col shadow-2xl">
                        <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">Payload Weight</div>
                        <div className="text-3xl font-black tabular-nums tracking-tighter">
                            {Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} <span className="text-sm font-bold text-white/20 ml-1">KG</span>
                        </div>
                    </div>
                    <div className="bg-black/40 backdrop-blur-3xl border border-white/5 rounded-3xl px-8 py-5 flex flex-col shadow-2xl">
                        <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">Fill Rate</div>
                        <div className="text-3xl font-black text-green-500 tabular-nums tracking-tighter" style={{ color: '#10b981' }}>
                            {payload?.truckStats?.volPct || 0}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Left Panel: Crates List */}
            <div className="absolute top-32 left-8 bottom-32 w-80 z-10 flex flex-col gap-4 pointer-events-none">
                <div className="bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[2rem] flex-1 flex flex-col overflow-hidden pointer-events-auto shadow-2xl">
                    <div className="p-8 pb-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers size={18} className="text-gold" style={{ color: '#C5A028' }} />
                            <span className="text-[11px] font-black uppercase tracking-widest text-white/40">Load Units</span>
                        </div>
                        <span className="text-[11px] font-black text-gold" style={{ color: '#C5A028' }}>{cratesData.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                        {cratesData.map((c: any) => {
                            const isSelected = selectedCrateId === c.id;
                            const vCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#C5A028';
                            return (
                                <button 
                                    key={c.id}
                                    onClick={() => setSelectedCrateId(isSelected ? null : c.id)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 group ${isSelected ? 'bg-gold/10 border-gold shadow-lg shadow-gold/5' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'}`}
                                    style={isSelected ? { borderColor: '#C5A028', backgroundColor: 'rgba(197, 160, 40, 0.1)' } : {}}
                                >
                                    <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: vCol }} />
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-black uppercase truncate tracking-tight ${isSelected ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>{c.label}</div>
                                        <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1 truncate">{c.subtitle}</div>
                                    </div>
                                    <ArrowUpRight size={14} className={`transition-all ${isSelected ? 'text-gold' : 'text-white/10 group-hover:text-white/30'}`} style={isSelected ? { color: '#C5A028' } : {}} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right Panel: Selected Crate Details */}
            {selectedCrateData && (
                <div className="absolute top-32 right-8 bottom-32 w-[480px] z-20 animate-in slide-in-from-right-20 fade-in duration-700 pointer-events-auto">
                    <div className="h-full bg-black/60 backdrop-blur-3xl border border-gold/20 rounded-[3rem] overflow-hidden flex flex-col shadow-[0_50px_120px_rgba(0,0,0,0.8)]" style={{ borderColor: 'rgba(197, 160, 40, 0.2)' }}>
                        <div className="p-12 pb-8 border-b border-white/5 relative bg-gradient-to-br from-gold/5 to-transparent" style={{ backgroundImage: 'linear-gradient(to bottom right, rgba(197, 160, 40, 0.05), transparent)' }}>
                            <button onClick={() => setSelectedCrateId(null)} className="absolute top-10 right-10 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                <X size={20} />
                            </button>
                            
                            <div className="flex items-center gap-3 mb-4">
                                <Box className="text-gold" size={20} style={{ color: '#C5A028' }} />
                                <span className="text-[10px] font-black text-gold uppercase tracking-[0.4em]" style={{ color: '#C5A028' }}>Unit Profile</span>
                            </div>
                            <h2 className="text-5xl font-black tracking-tighter uppercase leading-none mb-4">{selectedCrateData.label}</h2>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">{selectedCrateData.subtitle}</p>

                            <div className="grid grid-cols-3 gap-4 mt-12">
                                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Scale size={12} className="text-gold/40" style={{ color: 'rgba(197, 160, 40, 0.4)' }} />
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Weight</span>
                                    </div>
                                    <div className="text-lg font-black tabular-nums">
                                        {(selectedCrateData.items?.reduce((s: number, i: any) => s + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0).toFixed(1)} <span className="text-[10px] text-white/20 ml-1">KG</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Maximize2 size={12} className="text-gold/40" style={{ color: 'rgba(197, 160, 40, 0.4)' }} />
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Dims</span>
                                    </div>
                                    <div className="text-xs font-black truncate">{selectedCrateData.w}x{selectedCrateData.l}x{selectedCrateData.h}</div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Hash size={12} className="text-gold/40" style={{ color: 'rgba(197, 160, 40, 0.4)' }} />
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Nodes</span>
                                    </div>
                                    <div className="text-lg font-black text-gold" style={{ color: '#C5A028' }}>{selectedCrateData.items?.length || 0}</div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Description</th>
                                        <th className="text-right py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">Qty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {selectedCrateData.items?.map((item: any, idx: number) => (
                                        <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="py-6 pr-4">
                                                <div className="text-[9px] font-black text-gold/60 uppercase tracking-widest mb-1.5" style={{ color: 'rgba(197, 160, 40, 0.6)' }}>{item.itemId}</div>
                                                <div className="text-sm font-bold uppercase tracking-tight leading-snug">{item.name}</div>
                                                <div className="flex gap-3 mt-3">
                                                    <span className="text-[9px] font-bold text-white/20 uppercase">{item.material}</span>
                                                    <span className="text-[9px] font-bold text-white/20 uppercase">/</span>
                                                    <span className="text-[9px] font-bold text-white/20 uppercase">{item.color}</span>
                                                </div>
                                            </td>
                                            <td className="py-6 text-right">
                                                <div className="text-xl font-black tabular-nums">x{item.qty}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-12 pt-0 mt-auto">
                            <div className="p-6 bg-gold/5 border border-gold/10 rounded-3xl flex items-center justify-between" style={{ backgroundColor: 'rgba(197, 160, 40, 0.05)', borderColor: 'rgba(197, 160, 40, 0.1)' }}>
                                <div className="flex items-center gap-4">
                                    <ShieldCheck className="text-green-500" size={20} style={{ color: '#10b981' }} />
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest">Protocol Verified</div>
                                        <div className="text-[8px] font-bold text-white/30 uppercase mt-0.5">Checksum: {Math.random().toString(16).slice(2, 10).toUpperCase()}</div>
                                    </div>
                                </div>
                                <Factory size={20} className="text-white/10" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom HUD: Stats Bar */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-4 pointer-events-none">
                <div className="bg-black/40 backdrop-blur-3xl border border-white/5 rounded-full px-10 py-5 flex items-center gap-10 shadow-2xl pointer-events-auto">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/30">
                            <Timer size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">System Time</span>
                            <span className="text-xs font-bold tabular-nums uppercase">{new Date().toLocaleTimeString()}</span>
                        </div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/30">
                            <MapIcon size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Projection</span>
                            <span className="text-xs font-bold uppercase tracking-widest">ISO MIRROR</span>
                        </div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    {!selectedCrateId && (
                        <div className="flex items-center gap-6 text-white/30 px-4">
                            <div className="flex items-center gap-2">
                                <Move size={16} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Orbit</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Maximize2 size={16} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Inspect</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
