import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Truck, Box, Trash2, RotateCcw, Save, Info, ChevronRight, Loader2, Gauge, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { isDummyModeAtom, cratesVersionAtom, inventoryAtom } from '../../lib/atoms';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';

const TRUCK_L_CM = 1615;
const TRUCK_W_CM = 244;
const BASE_SCALE = 1.5; // px/cm — canvas is 2422 × 366 px at zoom=1

function getCrateDisplayName(crate: any, allCrates: any[], allInventory: any[]) {
    if (!crate.inventory_ids || crate.status === 'Empty')
        return { label: crate.id.slice(0, 8).toUpperCase(), vendorList: [] as string[] };
    const vSet = new Set<string>();
    crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
        const [id] = e.split(':');
        const inv = allInventory.find((i: any) => String(i.row) === id);
        if (inv?.data) { const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0]; if (p) vSet.add(p.toUpperCase()); }
    });
    const vendorList = Array.from(vSet).sort();
    const vendorsStr = vendorList.join('');
    const d = crate.updated_at ? new Date(crate.updated_at) : new Date();
    const datePrefix = `${d.getMonth() + 1}${String(d.getFullYear()).slice(-2)}`;
    const matching = allCrates.filter(c => {
        if (c.status === 'Empty' || !c.inventory_ids) return false;
        const s = new Set<string>();
        c.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
            const [id] = e.split(':');
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (inv?.data) { const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0]; if (p) s.add(p.toUpperCase()); }
        });
        return Array.from(s).sort().join('') === vendorsStr;
    }).sort((a, b) => new Date(a.updated_at || a.date || 0).getTime() - new Date(b.updated_at || b.date || 0).getTime());
    const seq = matching.findIndex(c => c.id === crate.id);
    return { label: `${datePrefix}${vendorsStr}${seq >= 0 ? seq + 1 : 1}`, vendorList };
}

// ─── CM Grid (LANDSCAPE: X=truck length 1615cm, Y=truck width 244cm) ──────────
const CmGrid: React.FC = () => {
    const minor = 50; const major = 100;
    const xLines: number[] = []; const yLines: number[] = [];
    for (let x = 0; x <= TRUCK_L_CM; x += minor) xLines.push(x);
    for (let y = 0; y <= TRUCK_W_CM; y += minor) yLines.push(y);
    return (
        <svg className="absolute inset-0 pointer-events-none" width={TRUCK_L_CM * BASE_SCALE} height={TRUCK_W_CM * BASE_SCALE} style={{ overflow: 'visible' }}>
            {xLines.map(x => (
                <line key={`x${x}`} x1={x * BASE_SCALE} y1={0} x2={x * BASE_SCALE} y2={TRUCK_W_CM * BASE_SCALE}
                    stroke={x % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} strokeWidth={x % major === 0 ? 1 : 0.5} />
            ))}
            {yLines.map(y => (
                <line key={`y${y}`} x1={0} y1={y * BASE_SCALE} x2={TRUCK_L_CM * BASE_SCALE} y2={y * BASE_SCALE}
                    stroke={y % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} strokeWidth={y % major === 0 ? 1 : 0.5} />
            ))}
            {xLines.filter(x => x % major === 0 && x > 0).map(x => (
                <text key={`xl${x}`} x={x * BASE_SCALE + 3} y={12} fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="monospace">{x}cm</text>
            ))}
            {yLines.filter(y => y % major === 0 && y > 0).map(y => (
                <text key={`yl${y}`} x={3} y={y * BASE_SCALE - 3} fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="monospace">{y}</text>
            ))}
        </svg>
    );
};

// ─── Dock Card ────────────────────────────────────────────────────────────────
const DockCard: React.FC<{ crate: any; allCrates: any[]; allInventory: any[]; onLoad: () => void }> = ({ crate, allCrates, allInventory, onLoad }) => {
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#fff') : '#fff';
    return (
        <button onClick={onLoad} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group text-left">
            <Box size={32} strokeWidth={0.5} style={{ color: primaryColor }} className="shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-black truncate" style={{ color: primaryColor }}>{label}</span>
                    <ChevronRight size={13} className="text-white/20 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {vendorList.map(v => (
                        <span key={v} className="px-1.5 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}>{v}</span>
                    ))}
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{crate.width_cm}W×{crate.length_cm}D cm</span>
                </div>
            </div>
        </button>
    );
};

// ─── Truck Crate ──────────────────────────────────────────────────────────────
// IMPORTANT: items live in the UNSCALED canvas coordinate space.
// CSS transform(zoom) is applied to the parent; layout uses BASE_SCALE only.
// Drag delta must divide by zoom to convert screen-px → canvas-px.
const TruckCrate: React.FC<{
    crate: any; allCrates: any[]; allInventory: any[];
    pos: { x: number; y: number; r: number };
    isSelected: boolean; zoom: number;
    onSelect: () => void; onUpdatePos: (x: number, y: number) => void;
    onRotate: () => void; onUnload: () => void;
}> = ({ crate, allCrates, allInventory, pos, isSelected, zoom, onSelect, onUpdatePos, onRotate, onUnload }) => {
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
    const isDraggingRef = useRef(false);

    // LANDSCAPE: X = truck length axis (1615cm, scrolls), Y = truck width axis (244cm)
    // r=0: crate length along X, crate width along Y
    const pxX = (pos.r === 0 ? crate.length_cm : crate.width_cm) * BASE_SCALE;
    const pxY = (pos.r === 0 ? crate.width_cm : crate.length_cm) * BASE_SCALE;
    const dimX = pos.r === 0 ? crate.length_cm : crate.width_cm;
    const dimY = pos.r === 0 ? crate.width_cm : crate.length_cm;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation(); onSelect();
        isDraggingRef.current = true;
        const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingRef.current) return;
            // divide by zoom because parent is CSS-scaled
            const nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox + (me.clientX - sx) / (zoom * BASE_SCALE)));
            const ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + (me.clientY - sy) / (zoom * BASE_SCALE)));
            onUpdatePos(nx, ny);
        };
        const onUp = () => { isDraggingRef.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    }, [pos.x, pos.y, dimX, dimY, zoom, onSelect, onUpdatePos]);

    const iconSize = Math.min(pxX, pxY) * 0.38;
    const textScale = Math.max(6, Math.min(11, pxX / 15));

    return (
        <div className="absolute select-none" style={{ left: pos.x * BASE_SCALE, top: pos.y * BASE_SCALE, width: pxX, height: pxY, zIndex: isSelected ? 50 : 10 }}>
            {isSelected && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50 whitespace-nowrap">
                    <button onClick={e => { e.stopPropagation(); onRotate(); }} className="text-white/50 hover:text-white transition-colors" title="Rotate">
                        <RotateCcw size={16} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onUnload(); }} className="text-rose-400/60 hover:text-rose-400 transition-colors" title="Unload">
                        <Trash2 size={16} />
                    </button>
                </div>
            )}
            <div
                onMouseDown={handleMouseDown}
                className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col items-center justify-center overflow-hidden relative"
                style={{
                    backgroundColor: primaryColor,
                    outline: isSelected ? `3px solid #fff` : `1px solid rgba(0,0,0,0.3)`,
                    boxShadow: isSelected ? `0 0 0 1px rgba(255,255,255,0.3), 0 8px 30px rgba(0,0,0,0.5)` : `0 4px 12px rgba(0,0,0,0.4)`,
                }}
            >
                <Box size={iconSize} strokeWidth={0.6} color="rgba(0,0,0,0.4)" className="pointer-events-none" />
                {pxX > 40 && (
                    <span className="font-black uppercase text-center px-1 mt-0.5 pointer-events-none truncate w-full text-center text-black/70"
                        style={{ fontSize: textScale }}>
                        {label}
                    </span>
                )}
                {pxX > 60 && pxY > 24 && (
                    <span className="font-mono pointer-events-none text-black/40" style={{ fontSize: Math.max(5, textScale - 2) }}>
                        {crate.width_cm}W×{crate.length_cm}D
                    </span>
                )}
            </div>
        </div>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const TruckingModule: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const db = useDatabase();
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const setCratesVersion = useSetAtom(cratesVersionAtom);

    const [isSaving, setIsSaving] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [positions, setPositions] = useState<Record<string, { x: number; y: number; r: number }>>({});
    const [zoom, setZoom] = useState(1.0);

    useEffect(() => {
        const map: Record<string, { x: number; y: number; r: number }> = {};
        docs.forEach(d => {
            if (d.description?.includes('POS:')) {
                const m = d.description.match(/POS:(\d+),(\d+),(\d+)/);
                if (m) map[d.id] = { x: +m[1], y: +m[2], r: +m[3] };
            }
        });
        setPositions(map);
    }, [docs]);

    const allCrates = useMemo(() => docs.filter(d => ['crate', 'pallet', 'cardboard'].includes(d.type) && ['Packed', 'Partial', 'In Transit'].includes(d.status)), [docs]);
    const dockCrates = useMemo(() => allCrates.filter(c => !positions[c.id]), [allCrates, positions]);
    const truckCrates = useMemo(() => allCrates.filter(c => !!positions[c.id]), [allCrates, positions]);
    const totalWeight = useMemo(() => truckCrates.reduce((s, c) => s + (c.weight_kg || (c.width_cm * c.length_cm * c.height_cm / 5000)), 0), [truckCrates]);
    const floorPct = useMemo(() => Math.min(100, Math.round(truckCrates.reduce((s, c) => s + c.width_cm * c.length_cm, 0) / (TRUCK_W_CM * TRUCK_L_CM) * 100)), [truckCrates]);

    const handleLoad = (id: string) => { setPositions(p => ({ ...p, [id]: { x: 10, y: 10, r: 0 } })); setSelectedId(id); };
    const handleUnload = (id: string) => { setPositions(p => { const n = { ...p }; delete n[id]; return n; }); setSelectedId(null); };
    const handleUpdatePos = (id: string, x: number, y: number) => setPositions(p => ({ ...p, [id]: { ...p[id], x, y } }));
    const handleRotate = (id: string) => setPositions(p => ({ ...p, [id]: { ...p[id], r: p[id].r === 0 ? 90 : 0 } }));
    const handleWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001))); }, []);

    const handleSave = async () => {
        setIsSaving(true);
        const tid = toast.loading('Syncing manifest…');
        try {
            if (isDummyMode) { await new Promise(r => setTimeout(r, 1200)); toast.success('Demo saved', { id: tid, icon: '🧪' }); return; }
            for (const c of allCrates) {
                const pos = positions[c.id];
                const newStatus = pos ? 'In Transit' : (c.status === 'In Transit' ? 'Packed' : c.status);
                const cleanDesc = (c.description || '').replace(/POS:\d+,\d+,\d+/, '').trim();
                const finalDesc = pos ? `${cleanDesc} POS:${Math.round(pos.x)},${Math.round(pos.y)},${pos.r}`.trim() : cleanDesc;
                const { error } = await supabase.from('logistics').update({ status: newStatus, description: finalDesc, updated_at: new Date().toISOString() }).eq('id', c.id);
                if (error) throw error;
                if (db) { const lDoc = await db.logistics.findOne({ selector: { id: c.id } }).exec(); if (lDoc) await lDoc.patch({ status: newStatus, description: finalDesc }); }
            }
            toast.success('Manifest deployed', { id: tid }); onRefresh(); setCratesVersion(v => v + 1);
        } catch (err: any) { toast.error(err.message || 'Save failed', { id: tid }); }
        finally { setIsSaving(false); }
    };

    // LANDSCAPE: length=horizontal(scrolls), width=vertical(fixed)
    const canvasW = TRUCK_L_CM * BASE_SCALE; // 2422px — scrolls horizontally
    const canvasH = TRUCK_W_CM * BASE_SCALE; // 366px

    return (
        <div className="flex flex-col lg:flex-row h-full text-white overflow-hidden relative" onClick={() => setSelectedId(null)}>

            {/* ── DOCK ── */}
            <div className="w-full lg:w-[320px] flex flex-col shrink-0 relative z-10 lg:border-r border-white/5">
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6 flex flex-col gap-2">
                    {dockCrates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 opacity-10 gap-4">
                            <Truck size={56} strokeWidth={0.5} />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">All units loaded</p>
                        </div>
                    ) : dockCrates.map(c => (
                        <DockCard key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory} onLoad={() => handleLoad(c.id)} />
                    ))}
                </div>
            </div>

            {/* ── CANVAS ── */}
            <div className="flex-1 flex flex-col min-h-0 relative z-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-8 py-5 shrink-0">
                    <div>
                        <div className="flex items-baseline gap-3">
                            <h2 className="text-xl font-black uppercase tracking-tighter">53' Trailer</h2>
                            <span className="text-[9px] font-black text-white/20">{Math.round(zoom * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] font-black uppercase tracking-widest">
                            <span className="text-emerald-400">{truckCrates.length} Loaded</span>
                            <span className="text-white/10">·</span>
                            <span className="text-(--main-color)">{Math.round(totalWeight).toLocaleString()} KG</span>
                            <span className="text-white/10">·</span>
                            <span className="text-white/30">{floorPct}% Floor</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-5">
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="text-white/30 hover:text-white transition-colors" title="Zoom out"><ZoomOut size={18} /></button>
                        <button onClick={() => setZoom(1.0)} className="text-white/30 hover:text-white transition-colors" title="Reset zoom"><Maximize2 size={16} /></button>
                        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="text-white/30 hover:text-white transition-colors" title="Zoom in"><ZoomIn size={18} /></button>
                        <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors" title="Deploy manifest">
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            <span className="text-[10px] font-black uppercase tracking-widest">Deploy</span>
                        </button>
                    </div>
                </div>

                {/* Scrollable canvas */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-[#0a0a0a]" onWheel={handleWheel}>
                    <div className="p-8" style={{ minWidth: canvasW * zoom + 64, minHeight: canvasH * zoom + 64 }}>
                        {/* Direction labels — landscape: rear=left, front=right */}
                        <div className="flex items-center gap-3 mb-2 text-white/30">
                            <div className="w-2 h-2 rounded-full border border-white/30 shrink-0" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em]">Rear Door</span>
                            <div className="flex-1 h-px bg-white/10" style={{ width: canvasW * zoom * 0.3 }} />
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] opacity-50">{TRUCK_L_CM}cm × {TRUCK_W_CM}cm</span>
                            <div className="flex-1 h-px bg-white/10" style={{ width: canvasW * zoom * 0.3 }} />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em]">Cab Front</span>
                            <div className="w-2 h-2 rounded-full bg-white/30 shrink-0" />
                        </div>

                        {/* Truck body — CSS scaled, items live in unscaled space */}
                        <div style={{ width: canvasW * zoom, height: canvasH * zoom, position: 'relative' }}>
                            <div
                                className="absolute top-0 left-0 border-2 border-white/20 bg-[#111]"
                                style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <CmGrid />
                                {/* Axle markers at 72%, 82%, 90% of truck length (vertical lines) */}
                                {[0.72, 0.82, 0.90].map(frac => (
                                    <div key={frac} className="absolute top-0 bottom-0 w-px bg-white/15 pointer-events-none" style={{ left: frac * canvasW }}>
                                        <span className="absolute bottom-1 left-1 text-[7px] font-mono text-white/30">{Math.round(frac * TRUCK_L_CM)}cm</span>
                                    </div>
                                ))}
                                {truckCrates.map(c => {
                                    const pos = positions[c.id];
                                    if (!pos) return null;
                                    return (
                                        <TruckCrate key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory}
                                            pos={pos} isSelected={selectedId === c.id} zoom={zoom}
                                            onSelect={() => setSelectedId(c.id)}
                                            onUpdatePos={(x, y) => handleUpdatePos(c.id, x, y)}
                                            onRotate={() => handleRotate(c.id)}
                                            onUnload={() => handleUnload(c.id)} />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── ANALYSIS ── */}
            <div className="w-full lg:w-[220px] flex flex-col shrink-0 relative z-10 lg:border-l border-white/5 p-6 gap-6">
                <Gauge size={16} className="text-emerald-400" />
                <div className="flex flex-col gap-2 mt-4">
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Floor</span>
                        <span className="text-sm font-black tabular-nums">{floorPct}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${floorPct}%` }} />
                    </div>
                </div>
                <div className="flex flex-col gap-1 mt-4">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Payload</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tracking-tighter">{(Math.round(totalWeight) / 1000).toFixed(2)}</span>
                        <span className="text-xs font-black text-white/30 uppercase">Tons</span>
                    </div>
                </div>
                <div className="mt-auto flex items-start gap-2 text-white/20">
                    <Info size={13} className="shrink-0 mt-0.5" />
                    <p className="text-[9px] font-black uppercase leading-relaxed tracking-widest">Scroll to zoom. Click to select. Drag to move.</p>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
            `}</style>
        </div>
    );
};
