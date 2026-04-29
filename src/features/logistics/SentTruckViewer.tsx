import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useAtom, useAtomValue } from 'jotai';
import { sentTruckIdAtom, universalViewAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { 
    ChevronLeft, Truck, Package, Maximize2, X, 
    Layers, ArrowUpRight, ShieldCheck, QrCode, 
    Activity, Info, Scale, Box, Map as MapIcon,
    Download, Share2, ExternalLink
} from 'lucide-react';
import gsap from 'gsap';

export const SentTruckViewer: React.FC = () => {
    const sentTruckId = useAtomValue(sentTruckIdAtom);
    const [view, setView] = useAtom(universalViewAtom);
    
    const [shipment, setShipment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        crates: Map<string, THREE.Mesh>;
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
    const truckStats = useMemo(() => payload?.truckStats || {}, [payload]);

    useEffect(() => {
        if (!containerRef.current || !payload) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

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

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.4);
        sun.position.set(10, 20, 10);
        scene.add(sun);
        
        const grid = new THREE.GridHelper(40, 40, 0xe2e8f0, 0xf1f5f9);
        scene.add(grid);

        const bed = new THREE.Mesh(
            new THREE.BoxGeometry(TRUCK_L, 0.05, TRUCK_W),
            new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.1, roughness: 0.8 })
        );
        bed.position.y = -0.025;
        scene.add(bed);

        const cratesMap = new Map<string, THREE.Mesh>();
        cratesData.forEach((c: any) => {
            const dw = (c.w || 100) / 100;
            const dl = (c.l || 100) / 100;
            const dh = (c.h || 100) / 100;
            const isRotated = c.r === 90;

            const geometry = new THREE.BoxGeometry(dl, dh, dw);
            
            // Fallback for older payloads: lookup vendor color if missing
            const fallbackCol = vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd';
            const material = new THREE.MeshStandardMaterial({ 
                color: c.color || fallbackCol,
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
                (c.x || 0) / 100 - (TRUCK_L / 2) + (isRotated ? dw : dl) / 2, 
                (c.y || 0) / 100 + dh/2 + 0.001,
                (c.z || 0) / 100 - (TRUCK_W / 2) + (isRotated ? dl : dw) / 2
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
            cratesMap.set(c.id, mesh);
        });

        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            if (!containerRef.current) return;
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [payload]);

    if (loading) return (
        <div className="w-full h-screen bg-white flex flex-col items-center justify-center gap-8">
            <div className="w-12 h-12 border-4 border-gray-100 border-t-orange-500 rounded-full animate-spin"></div>
            <div className="text-gray-400 font-black uppercase tracking-[0.4em] text-[10px]">Synchronizing Digital Mirror</div>
        </div>
    );

    return (
        <div className="w-full h-screen overflow-y-auto bg-[#f8f9fb] text-[#111827] font-['Inter'] selection:bg-orange-500 selection:text-white custom-scrollbar">
            {/* Redesigned Document-Style Header */}
            <div className="max-w-[1300px] mx-auto px-10 py-20">
                <div className="flex justify-between items-center mb-16">
                    <div className="flex items-center gap-8">
                        <button onClick={() => setView('app')} className="w-14 h-14 rounded-2xl bg-white border border-black/5 flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-gray-400 hover:text-black">
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none mb-2">ONYX LOGISTICS TRAILER MANIFEST</h1>
                            <p className="text-[10px] font-black text-black/20 uppercase tracking-[0.4em]">Digital Mirror Protocol v2.8</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-black tracking-tighter uppercase leading-none mb-3">{sentTruckId}</div>
                        <div className="text-[10px] font-black text-black/20 uppercase tracking-[0.2em]">ISSUED: {shipment?.timestamp}</div>
                    </div>
                </div>

                {/* Metrics Grid (Mirroring HTML) */}
                <div className="grid grid-cols-3 gap-6 mb-16">
                    <div className="bg-white rounded-[2.5rem] p-10 border border-black/5 shadow-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 block mb-4">Payload Weight</label>
                        <div className="text-5xl font-black tracking-tighter">{Math.round(truckStats?.totalWeight || 0).toLocaleString()}<span className="text-lg font-bold text-black/20 ml-2">KG</span></div>
                        <div className="flex items-center gap-3 mt-6">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#059669] shadow-[0_0_8px_#059669]" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#059669]">{truckStats?.payloadPct || 0}% UTILIZATION</span>
                        </div>
                    </div>
                    <div className="bg-white rounded-[2.5rem] p-10 border border-black/5 shadow-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 block mb-4">Distribution</label>
                        <div className="h-3 bg-[#f1f5f9] rounded-full flex overflow-hidden mb-4">
                            <div style={{ flex: truckStats?.rPct || 1 }} className="bg-[#1e293b] border-r border-white/10" />
                            <div style={{ flex: truckStats?.mPct || 1 }} className="bg-[#64748b] border-r border-white/10" />
                            <div style={{ flex: truckStats?.fPct || 1 }} className="bg-[#cbd5e1]" />
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-black/40">
                            <span>REAR: {truckStats?.rPct || 0}%</span>
                            <span>FRONT: {truckStats?.fPct || 0}%</span>
                        </div>
                    </div>
                    <div className="bg-white rounded-[2.5rem] p-10 border border-black/5 shadow-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 block mb-4">Volume Status</label>
                        <div className="text-5xl font-black tracking-tighter uppercase text-[#D95A0A]">{(truckStats?.status || 'Balanced')}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-black/20 mt-6">{truckStats?.volPct || 0}% FILLED</div>
                    </div>
                </div>

                {/* Metadata Grid (Mirroring HTML) */}
                <div className="bg-white rounded-[2.5rem] p-10 border border-black/5 shadow-sm grid grid-cols-4 gap-10 mb-16">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-black/30 block mb-2">Seal Number</label>
                        <span className="text-[15px] font-bold uppercase">{metadata?.sealNumber || '—'}</span>
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-black/30 block mb-2">Tractor / Plates</label>
                        <span className="text-[15px] font-bold uppercase">{metadata?.tractorNumber || '—'} · {metadata?.truckPlates || '—'}</span>
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-black/30 block mb-2">Trailer / Plates</label>
                        <span className="text-[15px] font-bold uppercase">{metadata?.trailerNumber || '—'} · {metadata?.trailerPlates || '—'}</span>
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-black/30 block mb-2">Dispatch Personnel</label>
                        <span className="text-[15px] font-bold uppercase">{(metadata?.senders || []).join(' / ') || '—'}</span>
                    </div>
                </div>

                {/* 3D Simulation Container */}
                <div className="mb-8">
                    <span className="inline-block text-[12px] font-black uppercase tracking-[0.4em] text-[#D95A0A] border-b-2 border-[#D95A0A] pb-3 mb-8">Live Load Simulation</span>
                    <div className="viewer-container w-full h-[640px] bg-white rounded-[3.5rem] border border-black/5 shadow-inner relative overflow-hidden">
                        <div ref={containerRef} className="absolute inset-0" />
                        <div className="absolute top-10 left-10 pointer-events-none">
                            <div className="text-[11px] font-black uppercase tracking-[0.4em] text-black/20 flex items-center gap-3">
                                <Maximize2 size={16} />
                                VIRTUAL TWIN · SCALE 1:1 · ISOMETRIC MIRROR
                            </div>
                        </div>
                    </div>
                </div>

                {/* Inventory Breakdown (The Main Section User complained about) */}
                <div className="mt-20">
                    <span className="inline-block text-[12px] font-black uppercase tracking-[0.4em] text-[#111827] border-b-2 border-black pb-3 mb-12">Inventory Breakdown</span>
                    
                    {cratesData.map((c: any, ci: number) => {
                        const crateCol = c.color || vendors[c.vendorList?.[0] as keyof typeof vendors]?.color || '#adb5bd';
                        return (
                            <div key={c.id} className="bg-white rounded-[3.5rem] border border-black/5 shadow-sm overflow-hidden mb-12">
                                <div className="p-10 bg-[#fbfbfc] border-b border-black/5 flex justify-between items-center">
                                    <div className="flex items-center gap-6">
                                        <div className="w-2.5 h-10 rounded-full" style={{ backgroundColor: crateCol }} />
                                        <h3 className="text-3xl font-black tracking-tighter uppercase leading-none">{c.label}</h3>
                                        <span className="text-xs font-bold text-black/20 uppercase tracking-[0.2em] ml-4">{c.subtitle}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[11px] font-black uppercase tracking-widest text-black/30">
                                            {c.l}×{c.w}×{c.h} CM · {(c.items?.reduce((s:number,i:any)=>s+((i.weightKg||0)*(i.qty||1)),0) || 0).toFixed(1)} KG
                                        </div>
                                    </div>
                                </div>
                                <div className="p-10 pt-0">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b-2 border-black">
                                                <th className="text-left py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] w-20">Seq</th>
                                                <th className="text-left py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] w-[340px]">Identity / Tag ID</th>
                                                <th className="text-left py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em]">Description / Attributes</th>
                                                <th className="text-right py-8 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] w-24">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.05]">
                                            {c.items?.map((it: any, ii: number) => (
                                                <tr key={ii} className="group hover:bg-black/[0.01] transition-colors">
                                                    <td className="py-10 align-top text-[11px] font-black text-black/10">
                                                        {String(ii + 1).padStart(2, '0')}
                                                    </td>
                                                    <td className="py-10">
                                                        {/* CALCULATED TAG ID BADGE - PDF STYLE */}
                                                        <div className="inline-flex px-5 py-2.5 rounded-xl border-2 border-black font-mono text-xs font-black bg-white text-black mb-4 shadow-[4px_4px_0_rgba(0,0,0,0.05)]" 
                                                             style={{ borderLeftWidth: '10px', borderLeftColor: it.tagColor || vendors[it.vendorPrefix as keyof typeof vendors]?.color || '#000' }}>
                                                            {it.itemId}
                                                        </div>
                                                    </td>
                                                    <td className="py-10">
                                                        <div className="text-xl font-black uppercase tracking-tight leading-snug mb-3">{it.name}</div>
                                                        <div className="flex items-center gap-3">
                                                            {/* Type + Description Tags */}
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-black/30 bg-[#f1f5f9] px-4 py-2 rounded-lg border border-black/5">{it.type || 'Artifact'}</span>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-black/30 bg-[#f1f5f9] px-4 py-2 rounded-lg border border-black/5">{it.desc || '—'}</span>
                                                        </div>
                                                        <div className="text-[11px] font-bold text-black/20 uppercase tracking-widest mt-4">{it.combinedAttr}</div>
                                                    </td>
                                                    <td className="py-10 text-right align-top">
                                                        <div className="text-4xl font-black tabular-nums tracking-tighter">×{it.qty}</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="footer flex justify-between items-center mt-32 pt-10 border-t border-black/5">
                    <div className="text-[10px] font-black text-black/20 uppercase tracking-[0.4em]">ONYX LOGISTICS · SECURE DIGITAL MIRROR PROTOCOL · {new Date().getFullYear()}</div>
                    <div className="flex items-center gap-4">
                        <ShieldCheck className="text-[#059669]" size={20} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#059669]">LOAD ANALYSIS VERIFIED</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
