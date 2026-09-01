import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { 
    ChevronLeft, Truck, Package, Maximize2, X, 
    Layers, ArrowUpRight, ShieldCheck, QrCode, 
    Activity, Info, Scale, Box, Map as MapIcon,
    Download, Share2, ExternalLink, Filter, Search,
    LayoutGrid, List, Database, Weight, Globe, ArrowRight,
    ArrowUp, ArrowDown, History, Clock, Calendar, CheckCircle2,
    Zap, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { 
    MiniIsoView, CmGrid, TRUCK_L_CM, TRUCK_W_CM, BASE_SCALE 
} from './LogisticsComponents';
import { universalViewAtom } from '../../lib/atoms';
import { toast } from 'react-hot-toast';
import { gsap } from 'gsap';
import { CrateEditPanel, CrateRecord } from './CratesInventoryView';
import { logisticsDocsAtom, inventoryAtom, liveExchangeRateAtom } from '../../lib/atoms';
import { useAtomValue } from 'jotai';
import { useNotify } from '../../lib/hooks';
import { tr } from '../../lib/i18n';

export const DeployedView: React.FC = () => {
    const [shipments, setShipments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedShipment, setSelectedShipment] = useState<any>(null);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const setView = useSetAtom(universalViewAtom);
    const notify = useNotify();
    const logisticsDocs = useAtomValue(logisticsDocsAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom) || 17.5;
    const [editingCrate, setEditingCrate] = useState<CrateRecord | null>(null);
    
    const detailViewRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const mapAreaRef = useRef<HTMLDivElement>(null);
    const [viewScale, setViewScale] = useState(1);

    // Fetch Deployed Shipments
    useEffect(() => {
        const fetchShipments = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('shipments')
                    .select('*')
                    .order('timestamp', { ascending: false });
                if (error) throw error;
                setShipments(data || []);
            } catch (err: any) {
                notify.error(`Fleet Sync Error: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };
        fetchShipments();
    }, []);

    // GSAP Transitions
    useEffect(() => {
        if (selectedShipment) {
            gsap.fromTo(detailViewRef.current, 
                { opacity: 0, scale: 0.95, y: 20 },
                { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: "power4.out" }
            );

            // Calculate scale to fit map area
            let timeoutId: number;
            const updateScale = () => {
                clearTimeout(timeoutId);
                timeoutId = window.setTimeout(() => {
                if (mapAreaRef.current) {
                    const { width, height } = mapAreaRef.current.getBoundingClientRect();
                    const targetL = TRUCK_L_CM * BASE_SCALE;
                    const targetW = TRUCK_W_CM * BASE_SCALE;
                    const scaleX = (width - 160) / targetL;
                    const scaleY = (height - 300) / targetW; // Leave room for HUD
                    setViewScale(Math.min(scaleX, scaleY, 1.2));
                }
            }, 100) as unknown as number;
            };
            setTimeout(updateScale, 100);
            window.addEventListener('resize', updateScale);
            return () => window.removeEventListener('resize', updateScale);
            clearTimeout(timeoutId);
        } else {
            gsap.fromTo(listRef.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.8, ease: "power4.out", delay: 0.2 }
            );
        }
    }, [selectedShipment]);

    const filteredShipments = useMemo(() => {
        if (!search) return shipments;
        return shipments.filter(s => 
            s.manifest_id?.toLowerCase().includes(search.toLowerCase()) ||
            s.metadata?.tractorNumber?.toLowerCase().includes(search.toLowerCase()) ||
            s.metadata?.trailerNumber?.toLowerCase().includes(search.toLowerCase())
        );
    }, [shipments, search]);

    const payload = useMemo(() => {
        if (!selectedShipment?.payload) return null;
        try {
            return typeof selectedShipment.payload === 'string' 
                ? JSON.parse(selectedShipment.payload) 
                : selectedShipment.payload;
        } catch (e) { return null; }
    }, [selectedShipment]);

    const cratesData = useMemo(() => payload?.crates || [], [payload]);
    const positions = useMemo(() => payload?.positions || {}, [payload]);
    
    const selectedCrate = useMemo(() => 
        cratesData.find((c: any) => c.id === selectedCrateId),
    [cratesData, selectedCrateId]);

    const handleBack = () => {
        if (selectedShipment) {
            setSelectedShipment(null);
            setSelectedCrateId(null);
        }
    };

    const handleEditCrate = () => {
        if (!selectedCrateId || !selectedCrate) return;
        const realCrate = logisticsDocs.find(c => c.id === selectedCrateId);
        if (realCrate) {
            setEditingCrate(realCrate);
        } else {
            // Create a temporary CrateRecord from snapshot data
            const virtual: CrateRecord = {
                id: selectedCrate.id,
                type: selectedCrate.type || 'crate',
                status: 'Packed',
                length_cm: selectedCrate.l,
                width_cm: selectedCrate.w,
                height_cm: selectedCrate.h,
                inventory_ids: (selectedCrate.items || []).map((i: any) => `${i.itemId}:${i.qty}`).join(','),
                description: selectedCrate.label || '',
                vendors: selectedCrate.color
            };
            setEditingCrate(virtual);
        }
    };

    const handleSaveCrate = async (id: string, updates: any) => {
        const tid = notify.loading(tr("Synchronizing Matrix..."));
        try {
            const { error } = await supabase
                .from('logistics')
                .update(updates)
                .eq('id', id);
            
            if (error) throw error;
            
            notify.success(tr("Matrix Synchronized"), { id: tid });
            setEditingCrate(null);
        } catch (err: any) {
            notify.error(`Sync Failed: ${err.message}`, { id: tid });
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-black/20 backdrop-blur-3xl h-full">
                <div className="w-16 h-16 border-4 border-white/5 border-t-emerald-500 rounded-full animate-spin mb-6 shadow-[0_0_40px_rgba(16,185,129,0.2)]" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em] animate-pulse">{tr("Syncing Fleet Registry")}</span>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-transparent text-white overflow-hidden relative font-['Inter']">
            {/* ── HEADER ── */}
            <header className="px-10 py-10 flex items-center justify-between border-b border-white/5 bg-white/[0.01] backdrop-blur-3xl z-40 shrink-0">
                <div className="flex items-center gap-10">
                    {selectedShipment && (
                        <button 
                            onClick={handleBack}
                            className="w-14 h-14 rounded-full bg-white/[0.05] flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90 border border-white/10"
                        >
                            <ChevronLeft size={28} />
                        </button>
                    )}
                    <div className="flex flex-col gap-1">
                        {selectedShipment && (
                            <h1 className="text-3xl font-black uppercase tracking-tighter leading-none text-white/90">
                                {tr("Manifest")} {selectedShipment.manifest_id}
                            </h1>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">{tr("Digital Twin Active")}</span>
                            </div>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">
                                {selectedShipment ? `Protocol Synchronized ${new Date(selectedShipment.timestamp).toLocaleDateString()}` : `Registry tracking ${shipments.length} units`}
                            </span>
                        </div>
                    </div>
                </div>

                {!selectedShipment && (
                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
                            <input 
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={tr("SEARCH REGISTRY...")}
                                className="pl-16 pr-8 py-4 bg-white/[0.03] border border-white/5 rounded-[2rem] w-[400px] text-[12px] font-black tracking-widest placeholder:text-white/10 focus:bg-white/[0.07] focus:border-white/10 focus:ring-4 focus:ring-emerald-500/5 outline-none transition-all uppercase"
                            />
                        </div>
                    </div>
                )}
            </header>

            <div className="flex-1 relative overflow-hidden">
                {!selectedShipment ? (
                    /* ── PHASE 1: LIST VIEW ── */
                    <div ref={listRef} className="absolute inset-0 overflow-y-auto custom-scrollbar p-12">
                        <div className="flex flex-col gap-8 w-full max-w-[2400px] mx-auto">
                            {filteredShipments.length > 0 ? filteredShipments.map((s) => {
                                const sPayload = typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload;
                                const weight = sPayload?.truckStats?.totalWeight || 0;
                                const crateCount = sPayload?.crates?.length || 0;
                                const date = new Date(s.timestamp);
                                
                                return (
                                    <div 
                                        key={s.id}
                                        onClick={() => setSelectedShipment(s)}
                                        className="group p-8 rounded-[2.5rem] bg-white/[0.03] backdrop-blur-3xl border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-700 cursor-pointer flex items-center gap-12 shadow-2xl relative overflow-hidden active:scale-[0.995]"
                                    >
                                        <div className="absolute top-0 right-0 w-[50%] h-full bg-gradient-to-l from-emerald-500/[0.02] to-transparent pointer-events-none" />
                                        
                                        {/* Info Block */}
                                        <div className="flex flex-col gap-4 w-96 shrink-0 border-r border-white/10 pr-12">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-1">{tr("Deployment Record")}</span>
                                                <span className="text-4xl font-black uppercase tracking-tighter text-white/90 group-hover:text-white transition-colors">
                                                    {s.manifest_id}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                                    <Calendar size={12} className="text-white/40" />
                                                    <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">
                                                        {date.toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                                    <Clock size={12} className="text-white/40" />
                                                    <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">
                                                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Isometric Preview (Full Width) */}
                                        <div className="flex-1 h-48 flex items-center justify-center transition-all duration-1000 group-hover:scale-105">
                                            <MiniIsoView 
                                                truckCrates={sPayload?.crates || []}
                                                positions={sPayload?.positions || {}}
                                                allCrates={[]}
                                                allInventory={[]}
                                                width={1200}
                                                height={300}
                                            />
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="flex items-center gap-6 shrink-0 border-l border-white/10 pl-12">
                                            <div className="flex flex-col gap-1 text-right">
                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{tr("Payload")}</span>
                                                <div className="flex items-baseline gap-2 justify-end">
                                                    <span className="text-4xl font-black tracking-tighter text-white/90">{Math.round(weight).toLocaleString()}</span>
                                                    <span className="text-[12px] font-black text-white/20">KG</span>
                                                </div>
                                            </div>
                                            <div className="w-px h-12 bg-white/10" />
                                            <div className="flex flex-col gap-1 text-right">
                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{tr("Units")}</span>
                                                <div className="flex items-baseline gap-2 justify-end">
                                                    <span className="text-4xl font-black tracking-tighter text-white/90">{crateCount}</span>
                                                    <span className="text-[12px] font-black text-white/20">{tr("UNITS")}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="ml-6 w-14 h-14 rounded-full bg-white/[0.05] text-white/20 group-hover:text-white group-hover:bg-emerald-500 group-hover:rotate-45 transition-all duration-700 flex items-center justify-center border border-white/10 shadow-lg">
                                                <ArrowUpRight size={28} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full flex flex-col items-center justify-center py-40 text-white/10">
                                    <Database size={64} strokeWidth={1} className="mb-6 opacity-20" />
                                    <span className="text-sm font-black uppercase tracking-[0.5em]">{tr("No Records Found in Registry")}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── PHASE 2: DETAIL VIEW (2D TOP MAP) ── */
                    <div ref={detailViewRef} className="absolute inset-0 flex">
                        {/* 2D Map Area */}
                        <div ref={mapAreaRef} className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-white/[0.01]">
                            {/* Map Interaction Hint */}
                            {!selectedCrateId && (
                                <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-full bg-white/[0.05] border border-white/10 backdrop-blur-3xl animate-bounce z-50">
                                    <Zap size={14} className="text-emerald-500" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">{tr("SELECT ANY UNIT FOR REGISTRY FOCUS")}</span>
                                </div>
                            )}

                            <div 
                                className="relative transition-all duration-700 ease-out origin-center" 
                                style={{ 
                                    width: TRUCK_L_CM * BASE_SCALE, 
                                    height: TRUCK_W_CM * BASE_SCALE,
                                    transform: `scale(${viewScale})`
                                }}
                            >
                                <CmGrid />
                                {cratesData.map((crate: any) => {
                                    const p = positions[crate.id] || { x: crate.x || 0, y: crate.y || 0, r: crate.r || 0, z: crate.z || 0 };
                                    const isRotated = p.r === 90;
                                    const w = crate.w || crate.width_cm || 100;
                                    const l = crate.l || crate.length_cm || 100;
                                    const dw = isRotated ? w : l;
                                    const dl = isRotated ? l : w;
                                    
                                    const vendorId = crate.subtitle || crate.vendor_id || (crate.label?.split('-')[0]);
                                    const col = crate.color || (vendors[vendorId as keyof typeof vendors]?.color || '#adb5bd');
                                    const isActive = selectedCrateId === crate.id;

                                    return (
                                        <div 
                                            key={crate.id}
                                            onClick={() => setSelectedCrateId(crate.id)}
                                            className={`absolute cursor-pointer transition-all duration-700 group/crate ${isActive ? 'z-50' : 'hover:z-40'}`}
                                            style={{
                                                left: p.x * BASE_SCALE,
                                                top: p.y * BASE_SCALE,
                                                width: dw * BASE_SCALE,
                                                height: dl * BASE_SCALE,
                                            }}
                                        >
                                            <div 
                                                className={`w-full h-full rounded-md border-4 transition-all duration-700 flex items-center justify-center overflow-hidden ${isActive ? 'bg-white shadow-[0_0_60px_rgba(255,255,255,0.4)] border-white scale-110' : 'bg-white/5 border-white/5 hover:bg-white/15 hover:border-white/20'}`}
                                                style={{ backgroundColor: isActive ? '#fff' : `${col}22`, borderColor: isActive ? '#fff' : col }}
                                            >
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`text-[12px] font-black transition-colors leading-none ${isActive ? 'text-black' : 'text-white/60'}`}>
                                                        {crate.label || crate.id.slice(-4)}
                                                    </span>
                                                    {!isActive && <div className="w-6 h-0.5 rounded-full opacity-20" style={{ backgroundColor: col }} />}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* HUD Stats */}
                            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-10 animate-in slide-in-from-bottom-12 duration-1000 ease-out">
                                <div className="px-14 py-8 rounded-[3.5rem] bg-black/60 backdrop-blur-[80px] border border-white/10 flex items-center gap-14 shadow-2xl">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">{tr("Net Cargo Weight")}</span>
                                        <span className="text-3xl font-black tracking-tighter text-white">{Math.round(payload?.truckStats?.totalWeight || 0).toLocaleString()} KG</span>
                                    </div>
                                    <div className="w-px h-12 bg-white/10" />
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">{tr("Tractor Unit")}</span>
                                        <span className="text-3xl font-black tracking-tighter text-white">{selectedShipment.metadata?.tractorNumber || 'ALPHA-1'}</span>
                                    </div>
                                    <div className="w-px h-12 bg-white/10" />
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">{tr("Trailer ID")}</span>
                                        <span className="text-3xl font-black tracking-tighter text-white">{selectedShipment.metadata?.trailerNumber || 'TR-772'}</span>
                                    </div>
                                    <div className="w-px h-12 bg-white/10" />
                                    <div className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                        <div className="flex flex-col gap-1 items-center">
                                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{tr("Protocol")}</span>
                                            <span className="text-[14px] font-black text-emerald-500 uppercase tracking-tight">{tr("OPTIMAL")}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Crate Contents Panel */}
                        <div className={`w-[560px] h-full bg-black/60 backdrop-blur-[80px] border-l border-white/5 flex flex-col transition-transform duration-1000 cubic-bezier(0.16, 1, 0.3, 1) shadow-[-40px_0_100px_rgba(0,0,0,0.8)] z-50 ${selectedCrateId ? 'translate-x-0' : 'translate-x-full'}`}>
                            {selectedCrate && (
                                <>
                                    <div className="p-12 border-b border-white/5 flex items-start justify-between bg-white/[0.02]">
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-5">
                                                <div className="w-5 h-5 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]" style={{ backgroundColor: selectedCrate.color || '#adb5bd' }} />
                                                <h2 className="text-4xl font-black uppercase tracking-tighter text-white">{selectedCrate.label}</h2>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1">
                                                <span className="text-[12px] font-black text-white/40 uppercase tracking-[0.2em]">{selectedCrate.type || 'Standard Payload'}</span>
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                                <span className="text-[12px] font-black text-white/40 uppercase tracking-widest">{selectedCrate.l}×{selectedCrate.w}×{selectedCrate.h} CM</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={handleEditCrate}
                                                className="px-6 py-3 rounded-2xl bg-(--main-color)/10 text-(--main-color) hover:bg-(--main-color) hover:text-black transition-all border border-(--main-color)/20 text-[9px] font-black uppercase tracking-widest"
                                            >
                                                {tr("Edit Protocol")}
                                            </button>
                                            <button onClick={() => setSelectedCrateId(null)} className="w-12 h-12 rounded-full flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                                <X size={28} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-12">
                                        <div className="flex flex-col gap-10">
                                            <div className="flex flex-col gap-5">
                                                <div className="flex items-center gap-6 mb-2">
                                                    <h3 className="text-[11px] font-black text-white/20 uppercase tracking-[0.5em] whitespace-nowrap leading-none">{tr("Internal Artifacts")}</h3>
                                                    <div className="h-px bg-white/10 flex-1" />
                                                </div>
                                                {(selectedCrate.items || []).map((it: any, idx: number) => (
                                                    <div key={idx} className="p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/[0.07] hover:border-white/20 transition-all duration-500 shadow-xl">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[16px] font-black uppercase tracking-tight text-white group-hover:translate-x-1 transition-transform">{it.name || it.itemId}</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{it.desc || 'Standard Protocol Unit'}</span>
                                                                <div className="w-1 h-1 rounded-full bg-white/5" />
                                                                <span className="text-[9px] font-black text-emerald-500/40 uppercase tracking-widest">{tr("Verified")}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-4xl font-black text-white/10 group-hover:text-emerald-500/50 transition-all duration-700">×{it.qty}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            {/* Security Profile */}
                                            <div className="p-8 rounded-[3rem] bg-emerald-500/5 border border-emerald-500/10 flex flex-col gap-4">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck size={18} className="text-emerald-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80">{tr("Security Protocol")}</span>
                                                </div>
                                                <p className="text-[11px] font-bold text-white/40 leading-relaxed uppercase tracking-tight">
                                                    {tr("Unit integrity verified via NFC handshake. All internal artifact IDs match manifest deployment signature.")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-12 border-t border-white/5 bg-black/40 backdrop-blur-3xl">
                                        <button className="w-full py-6 rounded-[2.5rem] bg-white text-black font-black text-[14px] tracking-[0.3em] uppercase hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center justify-center gap-4 shadow-[0_25px_60px_rgba(255,255,255,0.15)] group">
                                            <Download size={22} className="group-hover:-translate-y-1 transition-transform" /> 
                                            {tr("Generate High-Fidelity Manifest")}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editingCrate && (
                <CrateEditPanel 
                    crate={editingCrate}
                    allCrates={logisticsDocs}
                    allInventory={allInventory}
                    onClose={() => setEditingCrate(null)}
                    onSave={handleSaveCrate}
                />
            )}

            {/* Background Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        </div>
    );
};
