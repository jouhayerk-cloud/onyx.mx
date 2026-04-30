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

const SentTruckViewer: React.FC = () => {
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
    
    // Robust stats calculation if payload is missing them
    const truckStats = useMemo(() => {
        const stats = payload?.truckStats || {};
        if (!stats.totalWeight || stats.totalWeight === 0) {
            stats.totalWeight = cratesData.reduce((sum: number, c: any) => {
                return sum + (c.items?.reduce((iSum: number, i: any) => iSum + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0);
            }, 0);
        }
        return stats;
    }, [payload, cratesData]);

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
            
            // Stronger fallback for vendor color: use first 2 chars of label if subtitle is raw
            const vPrefix = (c.subtitle && c.subtitle.length <= 3) ? c.subtitle : (c.label?.slice(0, 2).toUpperCase());
            const fallbackCol = (vendors as any)[vPrefix]?.color || '#adb5bd';
            
            const material = new THREE.MeshStandardMaterial({ 
                color: c.color || fallbackCol,
                metalness: 0,
                roughness: 1,
                transparent: true,
                opacity: 0.85
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

        return () => {
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [payload, cratesData]);

    if (loading) return null;

    return (
        <div className="w-full h-screen overflow-y-auto bg-white text-[#111827] font-['Inter'] custom-scrollbar selection:bg-orange-500 selection:text-white">
            <div className="max-w-[1400px] mx-auto px-12 py-16">
                
                {/* Unified Borderless Data Panel */}
                <div className="flex flex-col gap-12 mb-20">
                    <div className="flex justify-between items-start border-b border-black/5 pb-10">
                        <div className="flex items-center gap-6">
                            <div className="p-3 text-black/20">
                                <Truck size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight uppercase leading-none mb-1">ONYX LOGISTICS TRAILER MANIFEST</h1>
                                <p className="text-[9px] font-black text-black/20 uppercase tracking-[0.3em]">Digital Mirror Protocol v2.8 · Issued {shipment?.timestamp}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black tracking-tighter uppercase leading-none">{sentTruckId}</div>
                        </div>
                    </div>

                    {/* Compact Data Row */}
                    <div className="grid grid-cols-12 gap-12 items-center">
                        <div className="col-span-3">
                            <label className="text-[9px] font-black uppercase tracking-widest text-black/20 block mb-3">Payload Weight</label>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black tracking-tighter">{Math.round(truckStats?.totalWeight || 0).toLocaleString()}</span>
                                <span className="text-sm font-black text-black/20">KG</span>
                            </div>
                            <div className="text-[9px] font-black text-[#059669] uppercase mt-2">{truckStats?.payloadPct || 0}% UTILIZATION</div>
                        </div>
                        <div className="col-span-3">
                            <label className="text-[9px] font-black uppercase tracking-widest text-black/20 block mb-3">Distribution</label>
                            <div className="h-1.5 bg-black/[0.03] rounded-full flex overflow-hidden mb-3">
                                <div style={{ flex: truckStats?.rPct || 1 }} className="bg-black/40" />
                                <div style={{ flex: truckStats?.mPct || 1 }} className="bg-black/20" />
                                <div style={{ flex: truckStats?.fPct || 1 }} className="bg-black/5" />
                            </div>
                            <div className="flex justify-between text-[9px] font-black text-black/30 uppercase tracking-widest">
                                <span>REAR: {truckStats?.rPct || 0}%</span>
                                <span>FRONT: {truckStats?.fPct || 0}%</span>
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-black/20 block mb-3">Volume Status</label>
                            <div className="text-2xl font-black uppercase tracking-tight text-[#D95A0A]">{truckStats?.status || 'OPTIMAL'}</div>
                            <div className="text-[9px] font-black text-black/20 uppercase mt-1">{truckStats?.volPct || 0}% FILLED</div>
                        </div>
                        <div className="col-span-4 flex flex-wrap gap-x-8 gap-y-4 border-l border-black/5 pl-8">
                            <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-black/20 block mb-1">Seal Number</label>
                                <span className="text-[11px] font-bold uppercase">{metadata?.sealNumber || '—'}</span>
                            </div>
                            <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-black/20 block mb-1">Tractor / Plates</label>
                                <span className="text-[11px] font-bold uppercase">{metadata?.tractorNumber || '—'} · {metadata?.truckPlates || '—'}</span>
                            </div>
                            <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-black/20 block mb-1">Trailer / Plates</label>
                                <span className="text-[11px] font-bold uppercase">{metadata?.trailerNumber || '—'} · {metadata?.trailerPlates || '—'}</span>
                            </div>
                            <div className="w-full">
                                <label className="text-[8px] font-black uppercase tracking-widest text-black/20 block mb-1">Dispatch Personnel</label>
                                <span className="text-[11px] font-bold uppercase">{(metadata?.senders || []).join(' / ') || '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3D View - Minimal Borderless */}
                <div className="mb-24">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-px bg-black/5 flex-1" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/20">Live Load Simulation</span>
                        <div className="h-px bg-black/5 flex-1" />
                    </div>
                    <div className="w-full h-[600px] bg-[#fafafa] rounded-[3rem] relative overflow-hidden group border border-black/5">
                        <div ref={containerRef} className="absolute inset-0" />
                        <div className="absolute top-10 left-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-black/10">VIRTUAL TWIN · SCALE 1:1</span>
                        </div>
                    </div>
                </div>

                {/* Inventory Breakdown - Pure White Table Style */}
                <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.5em] text-black/20 mb-12 flex items-center gap-6">
                        Inventory Breakdown <div className="h-px bg-black/5 flex-1" />
                    </h2>
                    
                    {cratesData.map((c: any) => {
                        const vPrefix = (c.subtitle && c.subtitle.length <= 3) ? c.subtitle : (c.label?.slice(0, 2).toUpperCase());
                        const crateCol = c.color || (vendors as any)[vPrefix]?.color || '#adb5bd';
                        const crateLabel = (c.label && c.label.length > 10) ? `CRATE ${c.id.slice(-4)}` : c.label;
                        const crateSub = (c.subtitle && c.subtitle.length < 15) ? c.subtitle : 'CRATE';

                        return (
                            <div key={c.id} className="mb-20 last:mb-0">
                                <div className="flex justify-between items-end mb-8 px-2">
                                    <div className="flex items-center gap-5">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: crateCol }} />
                                        <h3 className="text-2xl font-black tracking-tight uppercase leading-none">{crateLabel}</h3>
                                        <span className="text-[10px] font-black text-black/20 uppercase tracking-widest ml-4">{crateSub}</span>
                                    </div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-black/20">
                                        {c.l}×{c.w}×{c.h} CM · {(c.items?.reduce((s:number,i:any)=>s+((i.weightKg || i.weight_kg || 0)*(i.qty||1)),0) || 0).toFixed(1)} KG
                                    </div>
                                </div>
                                <div className="border-t border-black/5">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-black">
                                                <th className="text-left py-6 text-[9px] font-black text-black/20 uppercase tracking-[0.2em] w-16">Seq</th>
                                                <th className="text-left py-6 text-[9px] font-black text-black/20 uppercase tracking-[0.2em] w-72">Barcode ID</th>
                                                <th className="text-left py-6 text-[9px] font-black text-black/20 uppercase tracking-[0.2em]">Description / Attributes</th>
                                                <th className="text-left py-6 text-[9px] font-black text-black/20 uppercase tracking-[0.2em] w-48">Color & Material</th>
                                                <th className="text-right py-6 text-[9px] font-black text-black/20 uppercase tracking-[0.2em] w-20">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5">
                                            {(c.items || []).map((it: any, ii: number) => {
                                                const tagCol = it.tagColor || (vendors as any)[it.vendorPrefix]?.color || (vendors as any)[it.itemId?.slice(0, 2)]?.color || '#000';
                                                // Fallback for missing name: use type + desc or Artifact
                                                const itemName = it.name || `${it.type || ''} ${it.desc || ''}`.trim() || 'Artifact';
                                                
                                                return (
                                                    <tr key={ii} className="group hover:bg-black/[0.01] transition-colors">
                                                        <td className="py-8 align-top text-[10px] font-black text-black/10">{String(ii + 1).padStart(2, '0')}</td>
                                                        <td className="py-8 align-top">
                                                            <div className="inline-flex px-4 py-2 rounded-lg border border-black font-mono text-[11px] font-black bg-white text-black mb-3" 
                                                                 style={{ borderLeftWidth: '8px', borderLeftColor: tagCol }}>
                                                                {it.itemId}
                                                            </div>
                                                        </td>
                                                        <td className="py-8 align-top pr-10">
                                                            <div className="text-lg font-black uppercase tracking-tight leading-tight mb-3 group-hover:text-orange-600 transition-colors">{itemName}</div>
                                                            <div className="flex gap-2">
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-black/40 bg-black/[0.03] px-3 py-1.5 rounded-md">{it.type || 'Unit'}</span>
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-black/40 bg-black/[0.03] px-3 py-1.5 rounded-md">{it.desc || '—'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-8 align-top text-[10px] font-bold uppercase tracking-widest text-black/30">
                                                            {it.combinedAttr || `${it.color || ''} / ${it.material || ''}` || '—'}
                                                        </td>
                                                        <td className="py-8 align-top text-right text-4xl font-black tabular-nums tracking-tighter">
                                                            {it.qty}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-32 pt-10 border-t border-black/5 flex justify-between items-center opacity-20 hover:opacity-100 transition-opacity">
                    <div className="text-[9px] font-black uppercase tracking-[0.3em]">SECURE MIRROR PROTOCOL · {new Date().getFullYear()}</div>
                    <StatusShield size={18} />
                </div>
            </div>
        </div>
    );
};

const StatusShield = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
);
export default SentTruckViewer;
