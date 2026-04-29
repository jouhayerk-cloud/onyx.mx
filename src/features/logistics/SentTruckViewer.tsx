
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAtom, useAtomValue } from 'jotai';
import { sentTruckIdAtom, universalViewAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { Package, Truck, ChevronLeft, Info, List, Maximize2, Move } from 'lucide-react';
import gsap from 'gsap';
import { vendors } from '../../lib/consts';

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

    // Constants (matching wizard)
    const TRUCK_L = 16.15;
    const TRUCK_W = 2.44;
    const TRUCK_H = 2.8;

    // Fetch shipment data directly from Supabase for public access
    useEffect(() => {
        if (!sentTruckId) return;

        const fetchShipment = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('shipments')
                    .select('*')
                    .eq('manifest_id', sentTruckId)
                    .single();

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

    // Memoized Payload parsing
    const payload = useMemo(() => {
        if (!shipment?.payload) return null;
        try {
            return typeof shipment.payload === 'string' ? JSON.parse(shipment.payload) : shipment.payload;
        } catch (e) {
            console.error('[TruckViewer] Payload parse error:', e);
            return null;
        }
    }, [shipment]);

    const cratesData = useMemo(() => payload?.crates || [], [payload]);

    const selectedCrateData = useMemo(() => {
        if (!selectedCrateId || !payload) return null;
        return payload.crates?.find((c: any) => c.id === selectedCrateId);
    }, [selectedCrateId, payload]);

    // Initialize Three.js Scene
    useEffect(() => {
        if (!containerRef.current || !shipment || !payload) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050508);
        scene.fog = new THREE.FogExp2(0x050508, 0.015);

        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        camera.position.set(18, 12, 22);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ReinhardToneMapping;
        renderer.toneMappingExposure = 1.2;
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxDistance = 50;
        controls.minDistance = 5;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x3b82f6, 1, 100);
        pointLight.position.set(10, 20, 10);
        scene.add(pointLight);

        const spotLight = new THREE.SpotLight(0xffffff, 1);
        spotLight.position.set(0, 30, 0);
        spotLight.angle = Math.PI / 4;
        scene.add(spotLight);

        // Ground Grid
        const grid = new THREE.GridHelper(60, 60, 0x1e293b, 0x0f172a);
        grid.position.y = -0.01;
        scene.add(grid);

        // Trailer Visualizer (Standard 53' Trailer)
        const trailerGeo = new THREE.BoxGeometry(TRUCK_L, TRUCK_H, TRUCK_W);
        const trailerEdges = new THREE.EdgesGeometry(trailerGeo);
        const trailerMat = new THREE.LineBasicMaterial({ 
            color: 0x3b82f6, 
            transparent: true, 
            opacity: 0.15,
            blending: THREE.AdditiveBlending 
        });
        const trailerWire = new THREE.LineSegments(trailerEdges, trailerMat);
        trailerWire.position.set(0, TRUCK_H / 2, 0); 
        scene.add(trailerWire);

        // Crate Meshes
        const cratesMap = new Map<string, THREE.Mesh>();

        cratesData.forEach((c: any) => {
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            const vendorCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#3b82f6';
            
            const material = new THREE.MeshPhysicalMaterial({ 
                color: vendorCol,
                roughness: 0.1,
                metalness: 0.1,
                transmission: 0.6,
                thickness: 0.5,
                transparent: true,
                opacity: 0.85,
                emissive: vendorCol,
                emissiveIntensity: 0.05
            });

            const mesh = new THREE.Mesh(geometry, material);
            
            // Correct Positioning (CM to Meters)
            const x_m = (c.x || 0) / 100;
            const y_m = (c.y || 0) / 100; // Height (Up)
            const z_m = (c.z || 0) / 100; // Width (Across)

            mesh.position.set(
                x_m - (TRUCK_L / 2) + (dl / 2),
                y_m + (dh / 2),
                z_m - (TRUCK_W / 2) + (dw / 2)
            );

            if (c.r) {
                mesh.rotation.y = (c.r * Math.PI) / 180;
            }
            
            mesh.userData = { id: c.id, data: c };
            scene.add(mesh);

            // Wireframe overlay
            const wireGeo = new THREE.EdgesGeometry(geometry);
            const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
            const wire = new THREE.LineSegments(wireGeo, wireMat);
            mesh.add(wire);

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

        const handleClick = (event: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(Array.from(cratesMap.values()));

            if (intersects.length > 0) {
                const clicked = intersects[0].object as THREE.Mesh;
                setSelectedCrateId(clicked.userData.id);
            } else {
                setSelectedCrateId(null);
            }
        };

        renderer.domElement.addEventListener('mousedown', handleClick);

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
            renderer.domElement.removeEventListener('mousedown', handleClick);
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [shipment, payload]);

    // Handle Selection Visuals
    useEffect(() => {
        if (!sceneRef.current) return;
        const { crates, camera, controls } = sceneRef.current;

        crates.forEach((mesh, id) => {
            const material = mesh.material as THREE.MeshPhysicalMaterial;
            if (selectedCrateId === null) {
                material.emissiveIntensity = 0.05;
                material.opacity = 0.85;
            } else if (id === selectedCrateId) {
                material.emissiveIntensity = 0.5;
                material.opacity = 1.0;
                
                const targetPos = mesh.position.clone().add(new THREE.Vector3(4, 3, 4));
                gsap.to(camera.position, {
                    x: targetPos.x,
                    y: targetPos.y,
                    z: targetPos.z,
                    duration: 1.5,
                    ease: "expo.out",
                    onUpdate: () => camera.lookAt(mesh.position)
                });
                gsap.to(controls.target, {
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z,
                    duration: 1.5,
                    ease: "expo.out"
                });
            } else {
                material.emissiveIntensity = 0;
                material.opacity = 0.15;
            }
        });
    }, [selectedCrateId]);

    if (loading) return (
        <div className="w-full h-screen bg-[#050508] flex flex-col items-center justify-center gap-6">
            <div className="relative w-20 h-20">
                <div className="absolute inset-0 border-4 border-blue-500/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
            <div className="text-blue-400 font-black uppercase tracking-[0.4em] text-[10px]">Talan Hub OS</div>
        </div>
    );

    if (error) return (
        <div className="w-full h-screen bg-[#050508] flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                <X size={32} />
            </div>
            <div className="text-center">
                <div className="text-red-400 font-black uppercase tracking-widest text-[10px] mb-2">Protocol Error</div>
                <div className="text-white/40 text-xs font-medium max-w-xs">{error}</div>
            </div>
            <button onClick={() => setView('app')} className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-white uppercase tracking-widest hover:bg-white/10 transition-all">Emergency Exit</button>
        </div>
    );

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#050508] font-['Inter'] selection:bg-blue-500/30">
            {/* 3D Container */}
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Glass Overlays */}
            <div className="absolute inset-0 pointer-events-none z-10 p-6 flex flex-col justify-between">
                {/* Header HUD */}
                <div className="flex justify-between items-start">
                    <div className="flex gap-4 pointer-events-auto">
                        <button 
                            onClick={() => setView('app')}
                            className="w-14 h-14 rounded-2xl bg-white/[0.03] backdrop-blur-3xl border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 group shadow-2xl"
                        >
                            <ChevronLeft className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
                        </button>
                        <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-3xl px-6 py-4 flex flex-col shadow-2xl">
                            <div className="flex items-center gap-3">
                                <Truck className="w-5 h-5 text-blue-400" />
                                <h1 className="text-xl font-black text-white tracking-tighter uppercase leading-none">{sentTruckId}</h1>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></span>
                                <span className="text-[9px] font-black text-blue-400/60 uppercase tracking-widest">Mirror Link Active</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pointer-events-auto">
                        <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-3xl px-6 py-4 text-right shadow-2xl min-w-[200px]">
                            <div className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Live Manifest Weight</div>
                            <div className="text-3xl font-black text-white tabular-nums tracking-tighter">
                                {Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} <span className="text-sm font-bold text-white/20 ml-1">KG</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom HUD */}
                <div className="flex justify-between items-end">
                    <div className="flex gap-3 pointer-events-auto">
                        <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Crates</span>
                                <span className="text-sm font-black text-white">{payload?.truckStats?.nCrates || 0}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Pallets</span>
                                <span className="text-sm font-black text-white">{payload?.truckStats?.nPallets || 0}</span>
                            </div>
                        </div>
                    </div>

                    {!selectedCrateId && (
                        <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
                            <div className="flex items-center gap-2 text-white/40">
                                <Move className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Orbit</span>
                            </div>
                            <div className="w-px h-3 bg-white/10" />
                            <div className="flex items-center gap-2 text-white/40">
                                <Maximize2 className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Select Node</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar Inspector */}
            {selectedCrateData && (
                <div className="absolute top-6 bottom-6 right-6 w-[400px] z-20 animate-in slide-in-from-right-12 fade-in duration-700">
                    <div className="h-full bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[40px] overflow-hidden flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                        {/* Panel Header */}
                        <div className="p-8 pb-6 border-b border-white/5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8">
                                <button 
                                    onClick={() => setSelectedCrateId(null)}
                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all active:scale-90 pointer-events-auto"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-1 pr-12">
                                <div className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1">Crate Identifier</div>
                                <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">{selectedCrateData.label}</h2>
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">{selectedCrateData.subtitle}</p>
                            </div>

                            <div className="flex items-center gap-3 mt-8">
                                <div 
                                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border"
                                    style={{ 
                                        backgroundColor: (vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#3b82f6') + '10',
                                        color: vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#3b82f6',
                                        borderColor: (vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#3b82f6') + '30'
                                    }}
                                >
                                    {selectedCrateData.vendorList?.[0] || 'VAR'}
                                </div>
                                <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest">
                                    NODE {selectedCrateData.id.slice(-6).toUpperCase()}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-8">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 group hover:bg-white/10 transition-colors">
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Dimensions</div>
                                    <div className="text-xs font-bold text-white tabular-nums tracking-wide">{selectedCrateData.crateDims || `${selectedCrateData.l}x${selectedCrateData.w}x${selectedCrateData.h} CM`}</div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 group hover:bg-white/10 transition-colors">
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Net Load</div>
                                    <div className="text-xs font-bold text-white tabular-nums tracking-wide">
                                        {(selectedCrateData.items?.reduce((s: number, i: any) => s + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0).toFixed(1)} <span className="text-[9px] opacity-40 ml-0.5">KG</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contents Section */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar pointer-events-auto">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <List size={14} />
                                    </div>
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Loading Manifest</span>
                                </div>
                                <span className="text-[10px] font-black text-blue-400/60 uppercase">{selectedCrateData.items?.length || 0} Items</span>
                            </div>
                            
                            <div className="space-y-3">
                                {selectedCrateData.items?.map((item: any, idx: number) => (
                                    <div key={idx} className="group relative bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-2xl p-4 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest opacity-60">{item.itemId}</span>
                                            <div className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-black text-white/40 group-hover:text-white transition-colors">×{item.qty}</div>
                                        </div>
                                        <div className="text-sm font-bold text-white leading-tight uppercase tracking-tight line-clamp-2">{item.name}</div>
                                        <div className="flex items-center gap-3 mt-3">
                                            <div className="text-[9px] font-bold text-white/30 uppercase">{item.material}</div>
                                            <div className="w-1 h-1 rounded-full bg-white/10" />
                                            <div className="text-[9px] font-bold text-white/30 uppercase">{item.color}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Link */}
                        <div className="p-8 pt-0 mt-auto pointer-events-auto">
                            <button 
                                onClick={() => setSelectedCrateId(null)}
                                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.3em] transition-all active:scale-[0.98] shadow-xl"
                            >
                                Release Focus
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
