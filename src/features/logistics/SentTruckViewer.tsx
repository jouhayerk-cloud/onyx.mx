import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useAtom, useAtomValue } from 'jotai';
import { sentTruckIdAtom, universalViewAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { gsap } from 'gsap';
import { 
    ChevronLeft, Truck, Package, Maximize2, X, 
    Layers, ArrowUpRight, ShieldCheck, QrCode, 
    Activity, Info, Scale, Box, Map as MapIcon,
    Download, Share2, ExternalLink, Filter, Search,
    LayoutGrid, List, Database, Weight, Globe
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const SentTruckViewer: React.FC = () => {
    const sentTruckId = useAtomValue(sentTruckIdAtom);
    const [view, setView] = useAtom(universalViewAtom);
    
    const [shipment, setShipment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        crates: Map<string, THREE.Mesh>;
        raycaster: THREE.Raycaster;
        mouse: THREE.Vector2;
    } | null>(null);

    const TRUCK_L = 16.15;
    const TRUCK_W = 2.44;

    useEffect(() => {
        if (!sentTruckId) return;
        const fetchShipment = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.from('shipments').select('*').eq('manifest_id', sentTruckId).single();
                if (error) throw error;
                setShipment(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchShipment();
    }, [sentTruckId]);

    const metadata = useMemo(() => shipment?.metadata || {}, [shipment]);
    const payload = useMemo(() => {
        if (!shipment?.payload) return null;
        try {
            return typeof shipment.payload === 'string' ? JSON.parse(shipment.payload) : shipment.payload;
        } catch (e) { return null; }
    }, [shipment]);

    const cratesData = useMemo(() => payload?.crates || [], [payload]);
    
    const truckStats = useMemo(() => {
        const stats = payload?.truckStats || {};
        if (!stats.totalWeight || stats.totalWeight === 0) {
            stats.totalWeight = cratesData.reduce((sum: number, c: any) => {
                return sum + (c.items?.reduce((iSum: number, i: any) => iSum + ((i.weightKg || i.weight_kg || 0) * (i.qty || 1)), 0) || 0);
            }, 0);
        }
        return stats;
    }, [payload, cratesData]);

    const selectedCrate = useMemo(() => 
        cratesData.find((c: any) => c.id === selectedCrateId),
    [cratesData, selectedCrateId]);

    // ── THREE.JS ENGINE ──
    useEffect(() => {
        if (!containerRef.current || !payload) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = null; 

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
        controls.minDistance = 5;
        controls.maxDistance = 60;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(20, 30, 20);
        scene.add(sun);
        
        // Floor / Grid
        const grid = new THREE.GridHelper(60, 60, 0x1f2937, 0x111827);
        grid.position.y = -0.05;
        scene.add(grid);

        const bed = new THREE.Mesh(
            new THREE.BoxGeometry(TRUCK_L, 0.1, TRUCK_W),
            new THREE.MeshStandardMaterial({ 
                color: 0x050505, 
                metalness: 0.9, 
                roughness: 0.1,
                emissive: 0x000000
            })
        );
        bed.position.y = -0.05;
        scene.add(bed);

        // Crates
        const cratesMap = new Map<string, THREE.Mesh>();
        cratesData.forEach((c: any) => {
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;
            const isRotated = c.r === 90;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            const vPrefix = (c.subtitle && c.subtitle.length <= 3) ? c.subtitle : (c.label?.slice(0, 2).toUpperCase());
            const fallbackCol = (vendors as any)[vPrefix]?.color || '#adb5bd';
            
            const material = new THREE.MeshStandardMaterial({ 
                color: c.color || fallbackCol,
                metalness: 0.2,
                roughness: 0.5,
                transparent: true,
                opacity: 0.9,
                emissive: new THREE.Color(c.color || fallbackCol).multiplyScalar(0.15)
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { id: c.id };
            mesh.position.set(
                (c.x || 0) / 100 - (TRUCK_L / 2) + (isRotated ? dw : dl) / 2, 
                (c.y || 0) / 100 + dh/2 + 0.01,
                (c.z || 0) / 100 - (TRUCK_W / 2) + (isRotated ? dl : dw) / 2
            );
            
            if (isRotated) mesh.rotation.y = Math.PI / 2;
            scene.add(mesh);
            
            // Subtle edges
            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(geometry), 
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 })
            );
            edges.position.copy(mesh.position);
            edges.rotation.copy(mesh.rotation);
            scene.add(edges);
            
            cratesMap.set(c.id, mesh);
        });

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap, raycaster, mouse };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

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
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [payload, cratesData]);

    // ── INTERACTION ENGINE ──
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!sceneRef.current) return;
        const { raycaster, mouse, camera, scene } = sceneRef.current;
        const rect = containerRef.current!.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        const crate = intersects.find(i => i.object.userData?.id);
        setIsHovering(!!crate);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!sceneRef.current) return;
        const { raycaster, mouse, camera, scene } = sceneRef.current;
        const rect = containerRef.current!.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        const crateIntersect = intersects.find(i => i.object.userData?.id);
        
        if (crateIntersect) {
            const id = crateIntersect.object.userData.id;
            focusOnCrate(id);
        } else {
            resetFocus();
        }
    };

    const focusOnCrate = (id: string) => {
        if (!sceneRef.current) return;
        const { camera, controls, crates } = sceneRef.current;
        const mesh = crates.get(id);
        if (!mesh) return;

        setSelectedCrateId(id);

        // Animate Camera
        const targetPos = mesh.position.clone();
        const offset = new THREE.Vector3(7, 5, 7);
        const cameraPos = targetPos.clone().add(offset);

        gsap.to(camera.position, {
            x: cameraPos.x,
            y: cameraPos.y,
            z: cameraPos.z,
            duration: 1.5,
            ease: "power4.inOut"
        });

        gsap.to(controls.target, {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 1.5,
            ease: "power4.inOut",
            onUpdate: () => controls.update()
        });

        // Opacity transition for focus
        crates.forEach((m, crateId) => {
            const mat = m.material as THREE.MeshStandardMaterial;
            gsap.to(mat, {
                opacity: crateId === id ? 1.0 : 0.15,
                duration: 0.6
            });
        });
    };

    const resetFocus = () => {
        if (!sceneRef.current) return;
        const { camera, controls, crates } = sceneRef.current;
        setSelectedCrateId(null);

        gsap.to(camera.position, {
            x: 22,
            y: 14,
            z: 22,
            duration: 1.5,
            ease: "power4.inOut"
        });

        gsap.to(controls.target, {
            x: 0,
            y: 0,
            z: 0,
            duration: 1.5,
            ease: "power4.inOut",
            onUpdate: () => controls.update()
        });

        crates.forEach((m) => {
            const mat = m.material as THREE.MeshStandardMaterial;
            gsap.to(mat, {
                opacity: 0.9,
                duration: 0.6
            });
        });
    };

    if (loading) return (
        <div className="w-full h-screen bg-[#050505] flex items-center justify-center">
            <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 border-4 border-white/5 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_40px_rgba(16,185,129,0.2)]" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em] animate-pulse">Initializing Digital Twin</span>
                    <span className="text-[8px] font-bold text-white/10 uppercase tracking-widest">Secure Cloud Registry Sync</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-screen overflow-hidden bg-[#020203] text-white font-['Inter'] relative selection:bg-emerald-500 selection:text-white">
            
            {/* ── 3D VIEWPORT (Full Screen) ── */}
            <div 
                ref={containerRef} 
                className={`absolute inset-0 transition-all duration-1000 ease-in-out ${selectedCrateId ? 'w-[calc(100%-520px)]' : 'w-full'} ${isHovering ? 'cursor-pointer' : 'cursor-default'}`}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
            />

            {/* ── FLOATING HEADER ── */}
            <div className="absolute top-0 left-0 right-0 p-10 pointer-events-none z-20">
                <div className="max-w-7xl mx-auto flex justify-between items-start">
                    <div className="flex flex-col gap-2 pointer-events-auto group">
                        <div className="flex items-center gap-5">
                            <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 backdrop-blur-xl">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Live Registry Protocol</span>
                            </div>
                            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none text-white/90 group-hover:text-white transition-colors">
                                Manifest {sentTruckId}
                            </h1>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-1 ml-1">
                            Onyx Mirror v3.1 · Synchronized {shipment?.timestamp}
                        </p>
                    </div>

                    <div className="flex items-center gap-5 pointer-events-auto">
                         <div className="px-8 py-4 rounded-3xl bg-white/[0.03] border border-white/5 backdrop-blur-3xl flex items-center gap-10 shadow-2xl transition-all hover:bg-white/[0.05] hover:border-white/10">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">Net Weight</span>
                                <span className="text-lg font-black tracking-tight">{Math.round(truckStats?.totalWeight || 0).toLocaleString()} KG</span>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">Load Status</span>
                                <span className="text-lg font-black text-emerald-400 tracking-tight">{truckStats?.status || 'OPTIMAL'}</span>
                            </div>
                         </div>
                         <button 
                            onClick={() => { setView('app'); }}
                            className="w-14 h-14 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 hover:scale-110 transition-all group backdrop-blur-xl"
                         >
                            <X size={28} strokeWidth={1.5} />
                         </button>
                    </div>
                </div>
            </div>

            {/* ── INTERACTIVE SIDEBAR (Crates Content) ── */}
            <div className={`absolute top-0 right-0 bottom-0 w-[520px] bg-black/60 backdrop-blur-[60px] border-l border-white/5 z-30 transition-transform duration-1000 cubic-bezier(0.16, 1, 0.3, 1) shadow-[-60px_0_120px_rgba(0,0,0,0.8)] flex flex-col ${selectedCrateId ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedCrate && (
                    <>
                        {/* Sidebar Header */}
                        <div className="p-10 border-b border-white/5 flex items-start justify-between bg-white/[0.02]">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-4">
                                    <div className="w-4 h-4 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ backgroundColor: selectedCrate.color || '#adb5bd' }} />
                                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white">{selectedCrate.label}</h2>
                                </div>
                                <div className="flex items-center gap-4 ml-1">
                                    <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">{selectedCrate.subtitle || 'Payload Unit'}</span>
                                    <div className="w-1 h-1 rounded-full bg-white/10" />
                                    <span className="text-[11px] font-black text-white/40 uppercase tracking-widest">{selectedCrate.l}×{selectedCrate.w}×{selectedCrate.h} CM</span>
                                </div>
                            </div>
                            <button onClick={resetFocus} className="w-10 h-10 rounded-full flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Sidebar Inventory Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                            <div className="flex flex-col gap-10">
                                
                                {/* High-Contrast Stats Card */}
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 shadow-xl">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] block mb-2">Payload Weight</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-black text-white">{(selectedCrate.items?.reduce((s:number,i:any)=>s+((i.weightKg || i.weight_kg || 0)*(i.qty||1)),0) || 0).toFixed(1)}</span>
                                            <span className="text-sm font-black text-white/20">KG</span>
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 shadow-xl">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] block mb-2">Inventory Count</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-black text-white">{(selectedCrate.items || []).length}</span>
                                            <span className="text-sm font-black text-white/20">UNITS</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Dynamic Inventory Table */}
                                <div className="flex flex-col gap-5">
                                    <div className="flex items-center gap-6 mb-2">
                                        <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.5em] whitespace-nowrap">Internal Registry</h3>
                                        <div className="h-px bg-white/10 flex-1" />
                                    </div>
                                    
                                    {(selectedCrate.items || []).map((it: any, idx: number) => {
                                        const tagCol = it.tagColor || (vendors as any)[it.vendorPrefix]?.color || (vendors as any)[it.itemId?.slice(0, 2)]?.color || '#3b82f6';
                                        return (
                                            <div key={idx} className="group p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-500 shadow-lg">
                                                <div className="flex items-start justify-between mb-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-2 h-8 rounded-full" style={{ backgroundColor: tagCol }} />
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-[12px] font-black text-white/90 tracking-tight">{it.itemId}</span>
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-0.5">{it.vendorPrefix || 'Onyx'} Registry</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-4xl font-black tracking-tighter text-white/10 group-hover:text-emerald-500/40 transition-colors">×{it.qty}</span>
                                                    </div>
                                                </div>
                                                <div className="text-lg font-black uppercase tracking-tight text-white mb-3 group-hover:translate-x-1 transition-transform">
                                                    {it.name || `${it.type || ''} ${it.desc || ''}`.trim() || 'Unidentified Artifact'}
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/5">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{it.type || 'Standard'}</span>
                                                    </div>
                                                    <div className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/5">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 truncate max-w-[140px]">{it.combinedAttr || `${it.color || ''} / ${it.material || ''}` || '—'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Interactive Footer */}
                        <div className="p-10 border-t border-white/5 bg-black/40 backdrop-blur-2xl">
                            <button className="w-full py-5 rounded-[2rem] bg-white text-black font-black text-[12px] tracking-[0.2em] uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_60px_rgba(255,255,255,0.2)] flex items-center justify-center gap-4">
                                <Download size={20} /> Generate Digital Manifesto
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ── OVERVIEW METADATA HUD ── */}
            {!selectedCrateId && (
                <div className="absolute bottom-12 left-12 flex flex-col gap-6 animate-in slide-in-from-bottom duration-1000 cubic-bezier(0.16, 1, 0.3, 1)">
                    <div className="p-8 rounded-[3rem] bg-black/40 backdrop-blur-[40px] border border-white/5 flex flex-col gap-6 shadow-2xl">
                         <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/30 shadow-inner">
                                <Box size={28} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20">Payload Deployment</span>
                                <span className="text-xl font-black uppercase text-white/90 tracking-tighter">{cratesData.length} Registry Units Loaded</span>
                            </div>
                         </div>
                         <div className="w-full h-px bg-white/10" />
                         <div className="flex items-center gap-12 px-2">
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Tractor No</span>
                                <span className="text-[13px] font-black uppercase text-white/80">{metadata?.tractorNumber || '—'}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Trailer No</span>
                                <span className="text-[13px] font-black uppercase text-white/80">{metadata?.trailerNumber || '—'}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Security Seal</span>
                                <span className="text-[13px] font-black uppercase text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]">{metadata?.sealNumber || 'NOT SEALED'}</span>
                             </div>
                         </div>
                    </div>
                </div>
            )}

            {/* ── INTERACTION INDICATOR ── */}
            {!selectedCrateId && (
                <div className="absolute bottom-12 right-12 text-right animate-in fade-in duration-1000 delay-700">
                    <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.5em]">Orbit Controls Active</span>
                            <div className="w-12 h-px bg-white/20" />
                        </div>
                        <p className="text-lg font-black text-white/40 uppercase tracking-[0.1em]">Select any unit for registry focus</p>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SentTruckViewer;
