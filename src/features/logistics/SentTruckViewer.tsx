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
    Hash, Timer, ShieldCheck, Factory, Download, Share2,
    QrCode, ImageIcon, ExternalLink, Activity
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

    // Design Tokens (Premium Light Glass Theme)
    const DESIGN = {
        bg: '#f8f9fb',
        surface: 'rgba(255, 255, 255, 0.7)',
        border: 'rgba(0, 0, 0, 0.05)',
        text: '#111827',
        textDim: '#6b7280',
        accent: '#D95A0A', // PDF Orange Accent
        emerald: '#059669',
        blur: 'backdrop-blur-2xl'
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
        scene.background = new THREE.Color(0xf8f9fb);

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(22, 14, 22);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1;

        // Soft Studio Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.5);
        sun.position.set(10, 20, 10);
        scene.add(sun);
        
        const fill = new THREE.PointLight(0xffffff, 0.2);
        fill.position.set(-10, 5, -10);
        scene.add(fill);

        // Ground Protocol (Light Grid)
        const grid = new THREE.GridHelper(100, 100, 0xe2e8f0, 0xf1f5f9);
        scene.add(grid);

        // Trailer Chassis
        const bedGeo = new THREE.BoxGeometry(TRUCK_L, 0.05, TRUCK_W);
        const bedMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.1, roughness: 0.8 });
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
                metalness: 0.0,
                roughness: 1.0,
                transparent: true,
                opacity: 0.85,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });

            const mesh = new THREE.Mesh(geometry, material);
            const x_m = (c.x || 0) / 100;
            const y_m = (c.y || 0) / 100; // Height
            const z_m = (c.z || 0) / 100; // Width/Depth

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
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
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
                material.opacity = 0.85;
                material.emissiveIntensity = 0;
            } else if (id === selectedCrateId) {
                material.opacity = 1;
                material.emissiveIntensity = 0.3;
                material.emissive.setHex(0xD95A0A);
                
                const targetCamPos = mesh.position.clone().add(new THREE.Vector3(6, 5, 6));
                gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 1.2, ease: "power3.out" });
                gsap.to(controls.target, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, duration: 1.2, ease: "power3.out" });
            } else {
                material.opacity = 0.1;
                material.emissiveIntensity = 0;
            }
        });
    }, [selectedCrateId]);

    if (loading) return (
        <div className="w-full h-screen bg-white flex flex-col items-center justify-center gap-8">
            <div className="w-12 h-12 border-4 border-gray-100 border-t-orange-500 rounded-full animate-spin"></div>
            <div className="text-gray-400 font-black uppercase tracking-[0.4em] text-[10px]">Synchronizing Digital Twin</div>
        </div>
    );

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#f8f9fb] font-['Inter'] text-[#111827]">
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Premium Light Header */}
            <div className="absolute top-8 left-8 right-8 z-10 flex justify-between items-start pointer-events-none">
                <div className="flex gap-4 pointer-events-auto">
                    <button onClick={() => setView('app')} className="w-16 h-16 rounded-[2rem] bg-white border border-black/[0.05] flex items-center justify-center hover:shadow-xl transition-all shadow-lg text-gray-400 hover:text-black">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="bg-white/70 backdrop-blur-3xl border border-black/[0.05] rounded-[2.5rem] px-12 py-6 flex flex-col shadow-xl min-w-[420px] relative overflow-hidden group">
                        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#D95A0A]" />
                        <div className="flex items-center gap-4">
                            <QrCode size={18} className="text-[#D95A0A]" />
                            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">{sentTruckId}</h1>
                        </div>
                        <div className="text-[10px] font-black text-black/20 uppercase tracking-[0.4em] mt-3 ml-8">Mirror Interface v2.8</div>
                    </div>
                </div>

                <div className="flex gap-4 pointer-events-auto">
                    <div className="bg-white/70 backdrop-blur-3xl border border-black/[0.05] rounded-[2rem] px-10 py-6 flex flex-col shadow-lg text-right">
                        <div className="text-[9px] font-black text-black/20 uppercase tracking-[0.3em] mb-1">Payload Weight</div>
                        <div className="text-3xl font-black tabular-nums tracking-tighter">
                            {Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} <span className="text-sm font-bold text-black/20 ml-1">KG</span>
                        </div>
                    </div>
                    <div className="bg-white/70 backdrop-blur-3xl border border-black/[0.05] rounded-[2rem] px-10 py-6 flex flex-col shadow-lg text-right">
                        <div className="text-[9px] font-black text-black/20 uppercase tracking-[0.3em] mb-1">Status</div>
                        <div className="text-3xl font-black text-[#059669] tracking-tighter uppercase">{(payload?.truckStats?.status || 'Active')}</div>
                    </div>
                </div>
            </div>

            {/* Unit Registry (Left) */}
            <div className="absolute top-36 left-8 bottom-32 w-96 z-10 flex flex-col gap-4 pointer-events-none">
                <div className="bg-white/60 backdrop-blur-3xl border border-black/[0.05] rounded-[3rem] flex-1 flex flex-col overflow-hidden pointer-events-auto shadow-xl">
                    <div className="p-10 pb-6 border-b border-black/[0.05] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers size={18} className="text-[#D95A0A]" />
                            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-black/40">Unit Breakdown</span>
                        </div>
                        <span className="text-[11px] font-black text-[#D95A0A]">{cratesData.length} UNITS</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
                        {cratesData.map((c: any) => {
                            const isSelected = selectedCrateId === c.id;
                            const vCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd';
                            return (
                                <button 
                                    key={c.id}
                                    onClick={() => setSelectedCrateId(isSelected ? null : c.id)}
                                    className={`w-full text-left p-6 rounded-[2rem] border transition-all flex items-center gap-6 group ${isSelected ? 'bg-white border-black/10 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/30'}`}
                                >
                                    <div className="w-2.5 h-12 rounded-full" style={{ backgroundColor: vCol }} />
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-black uppercase truncate tracking-tight ${isSelected ? 'text-black' : 'text-black/50 group-hover:text-black'}`}>{c.label}</div>
                                        <div className="text-[10px] font-bold text-black/20 uppercase tracking-widest mt-1.5 truncate">{c.subtitle}</div>
                                    </div>
                                    <ArrowUpRight size={18} className={`transition-all ${isSelected ? 'text-[#D95A0A]' : 'text-black/5 group-hover:text-black/20'}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Item Inspector (Overlay PDF Style) */}
            {selectedCrateData && (
                <div className="absolute top-1/2 -translate-y-1/2 right-12 w-[760px] max-h-[85vh] z-20 animate-in slide-in-from-right-32 fade-in duration-700 pointer-events-auto">
                    <div className="bg-white/90 backdrop-blur-3xl border-2 border-black rounded-[4rem] overflow-hidden flex flex-col shadow-[0_80px_200px_rgba(0,0,0,0.15)]">
                        <div className="p-16 pb-10 border-b-2 border-black relative">
                            <button onClick={() => setSelectedCrateId(null)} className="absolute top-12 right-12 w-14 h-14 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center text-black/30 hover:text-black hover:bg-black/10 transition-all">
                                <X size={24} />
                            </button>
                            
                            <div className="flex items-center gap-6 mb-6">
                                <div className="w-6 h-6 rounded-lg border border-black/10" style={{ backgroundColor: vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd' }} />
                                <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">{selectedCrateData.label}</h2>
                            </div>
                            <div className="flex items-center gap-12 text-black/40">
                                <p className="text-xs font-black uppercase tracking-[0.4em]">{selectedCrateData.subtitle}</p>
                                <div className="h-4 w-px bg-black/10" />
                                <p className="text-xs font-black uppercase tracking-[0.2em]">
                                    {selectedCrateData.l}×{selectedCrateData.w}×{selectedCrateData.h} CM · {(selectedCrateData.items?.reduce((s: number, i: any) => s + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0).toFixed(1)} KG
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-16 pt-0 custom-scrollbar">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-black">
                                        <th className="text-left py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] w-20">Seq</th>
                                        <th className="text-left py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em]">Identity / Tag ID</th>
                                        <th className="text-right py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] w-24">Qty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/10">
                                    {selectedCrateData.items?.map((item: any, idx: number) => (
                                        <tr key={idx} className="group hover:bg-black/[0.02] transition-colors">
                                            <td className="py-10 align-top text-[11px] font-black text-black/10">
                                                {String(idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="py-10">
                                                {/* PDF Style Badge - Book Calculated Tag ID */}
                                                <div className="inline-flex px-4 py-2 rounded-xl border-2 font-mono text-xs font-black bg-white text-black mb-4 shadow-sm" 
                                                     style={{ borderColor: item.tagColor || '#000', borderLeftWidth: '8px' }}>
                                                    {item.itemId}
                                                </div>
                                                <div className="text-xl font-black uppercase tracking-tight leading-snug mb-3">{item.name}</div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-black/30 bg-black/5 px-3 py-1.5 rounded-lg">{item.material}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-black/30 bg-black/5 px-3 py-1.5 rounded-lg">{item.color}</span>
                                                </div>
                                            </td>
                                            <td className="py-10 text-right align-top">
                                                <div className="text-4xl font-black tabular-nums tracking-tighter">×{item.qty}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-12 bg-black/[0.02] flex justify-between items-center border-t border-black/5">
                            <div className="flex items-center gap-4">
                                <ShieldCheck className="text-[#059669]" size={24} />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/30">Verified Mirror Protocol</span>
                            </div>
                            <div className="text-[10px] font-mono text-black/10">{Math.random().toString(16).slice(2, 14).toUpperCase()}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Navigation Controls */}
            <div className="absolute bottom-10 left-10 right-10 z-10 flex justify-between items-center pointer-events-none">
                <div className="bg-white/80 backdrop-blur-3xl border border-black/5 rounded-full px-12 py-6 flex items-center gap-10 shadow-xl pointer-events-auto">
                    <Activity size={18} className="text-[#D95A0A]" />
                    <span className="text-[11px] font-black uppercase tracking-[0.4em] text-black/40">Load Analysis Protocol active</span>
                </div>

                <div className="flex gap-4 pointer-events-auto">
                    <div className="bg-white/80 backdrop-blur-3xl border border-black/5 rounded-full p-6 shadow-xl text-black/40">
                        <MapIcon size={20} />
                    </div>
                    <div className="bg-white/80 backdrop-blur-3xl border border-black/5 rounded-full p-6 shadow-xl text-black/40">
                        <Maximize2 size={20} />
                    </div>
                </div>
            </div>
        </div>
    );
};
