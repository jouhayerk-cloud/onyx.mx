
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
        scene.background = new THREE.Color(0x0a0a0f);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(15, 10, 20);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(10, 20, 10);
        scene.add(sunLight);

        const rimLight = new THREE.DirectionalLight(0x3b82f6, 0.3);
        rimLight.position.set(-10, 5, -10);
        scene.add(rimLight);

        // Trailer Visualizer (Standard 53' Trailer approx 16m x 2.6m x 2.8m)
        const trailerGeo = new THREE.BoxGeometry(16.5, 2.8, 2.6);
        const trailerEdges = new THREE.EdgesGeometry(trailerGeo);
        const trailerMat = new THREE.LineBasicMaterial({ color: 0x333344, transparent: true, opacity: 0.3 });
        const trailerWire = new THREE.LineSegments(trailerEdges, trailerMat);
        trailerWire.position.set(0, 1.4, 0); // Ground it
        scene.add(trailerWire);

        // Ground Plane
        const grid = new THREE.GridHelper(40, 40, 0x1f2937, 0x111827);
        scene.add(grid);

        // Crate Meshes
        const cratesMap = new Map<string, THREE.Mesh>();

        cratesData.forEach((c: any) => {
            // Convert cm to meters
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            const vendorCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#6b7280';
            const material = new THREE.MeshStandardMaterial({ 
                color: vendorCol,
                roughness: 0.2,
                metalness: 0.5,
                emissive: vendorCol,
                emissiveIntensity: 0.1
            });

            const mesh = new THREE.Mesh(geometry, material);
            
            // Positioning (Payload coords are relative to trailer front-left-bottom)
            // Coords from wizard are in meters normalized to trailer center
            mesh.position.set(c.x - 8.25 + dl/2, c.z + dh/2, c.y - 1.3 + dw/2);
            
            mesh.userData = { id: c.id, data: c };
            scene.add(mesh);
            cratesMap.set(c.id, mesh);
        });

        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap };

        // Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Raycaster for clicks
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

        // Resize
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

    // Handle Selection Visuals (Ghost Mode)
    useEffect(() => {
        if (!sceneRef.current) return;
        const { crates, camera, controls } = sceneRef.current;

        crates.forEach((mesh, id) => {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (selectedCrateId === null) {
                material.wireframe = false;
                material.opacity = 1;
                material.transparent = false;
            } else if (id === selectedCrateId) {
                material.wireframe = false;
                material.opacity = 1;
                material.transparent = false;
                
                // Fly-to Animation
                const targetPos = mesh.position.clone().add(new THREE.Vector3(5, 5, 5));
                gsap.to(camera.position, {
                    x: targetPos.x,
                    y: targetPos.y,
                    z: targetPos.z,
                    duration: 1.2,
                    ease: "power2.inOut",
                    onUpdate: () => camera.lookAt(mesh.position)
                });
                gsap.to(controls.target, {
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z,
                    duration: 1.2,
                    ease: "power2.inOut"
                });
            } else {
                material.wireframe = true;
                material.opacity = 0.2;
                material.transparent = true;
            }
        });
    }, [selectedCrateId]);

    if (loading) return (
        <div className="w-full h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="text-white/50 font-black uppercase tracking-widest text-[10px]">Loading 3D Digital Mirror...</div>
        </div>
    );

    if (error) return (
        <div className="w-full h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
            <div className="text-red-400 font-bold">Error: {error}</div>
            <button onClick={() => setView('app')} className="button px-6 py-2">Back to App</button>
        </div>
    );

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#0a0a0f] font-['Inter']">
            {/* 3D Container */}
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Top Bar HUD */}
            <div className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start pointer-events-none">
                <div className="flex gap-4 pointer-events-auto">
                    <button 
                        onClick={() => setView('app')}
                        className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
                    >
                        <ChevronLeft className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                    </button>
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col">
                        <div className="flex items-center gap-3">
                            <Truck className="w-5 h-5 text-blue-400" />
                            <h1 className="text-xl font-black text-white tracking-tighter uppercase">{sentTruckId}</h1>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Digital Twin Active</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2 pointer-events-auto">
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-right">
                        <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Total Payload</div>
                        <div className="text-2xl font-black text-white tabular-nums">
                            {Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} <span className="text-sm font-bold text-white/40">KG</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Interaction Instructions */}
            {!selectedCrateId && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-4 z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="flex items-center gap-2 text-white/40">
                        <Move className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Orbit</span>
                    </div>
                    <div className="w-px h-3 bg-white/10" />
                    <div className="flex items-center gap-2 text-white/40">
                        <Maximize2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Select Crate</span>
                    </div>
                </div>
            )}

            {/* Selected Crate Side Panel */}
            {selectedCrateData && (
                <div className="absolute top-24 bottom-24 right-8 w-96 z-20 animate-in slide-in-from-right-8 fade-in duration-500">
                    <div className="h-full bg-black/60 backdrop-blur-3xl border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Header */}
                        <div className="p-6 border-bottom border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{selectedCrateData.label}</h2>
                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">{selectedCrateData.subtitle}</p>
                                </div>
                                <div 
                                    className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
                                    style={{ 
                                        backgroundColor: (vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#6b7280') + '20',
                                        color: vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#6b7280',
                                        border: `1px solid ${vendors[selectedCrateData.vendorList?.[0] as keyof typeof vendors]?.color || '#6b7280'}40`
                                    }}
                                >
                                    {selectedCrateData.vendorList?.[0] || 'VAR'}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                    <div className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Dimensions</div>
                                    <div className="text-xs font-bold text-white tabular-nums">{selectedCrateData.crateDims}</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                    <div className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">Net Weight</div>
                                    <div className="text-xs font-bold text-white tabular-nums">
                                        {selectedCrateData.items.reduce((s: number, i: any) => s + (i.weightKg * i.qty), 0).toFixed(1)} KG
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contents List */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="flex items-center gap-2 mb-4">
                                <List className="w-4 h-4 text-blue-400" />
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Packing Manifest</span>
                            </div>
                            
                            <div className="space-y-2">
                                {selectedCrateData.items.map((item: any, idx: number) => (
                                    <div key={idx} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 transition-colors group">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-blue-400/70">{item.itemId}</span>
                                            <span className="text-[10px] font-black text-white/40 group-hover:text-white/60">x{item.qty}</span>
                                        </div>
                                        <div className="text-xs font-bold text-white/80 mt-1 uppercase truncate">{item.name}</div>
                                        <div className="flex gap-3 mt-2 text-[9px] font-medium text-white/30">
                                            <span>{item.material}</span>
                                            <span className="w-px h-2 bg-white/10" />
                                            <span>{item.color}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="p-6 bg-white/5 border-t border-white/5">
                            <button 
                                onClick={() => setSelectedCrateId(null)}
                                className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                            >
                                Reset View
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
