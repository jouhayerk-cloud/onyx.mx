import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { Truck, Box, Trash2, RotateCcw, Info, ChevronRight, Loader2, Gauge, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { isDummyModeAtom, cratesVersionAtom, inventoryAtom, truckReadyTriggerAtom, truckIsBusyAtom } from '../../lib/atoms';
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
// ─── Isometric Wireframe Icon ────────────────────────────────────────────────────
const CrateWireframe: React.FC<{ w: number; l: number; h: number; color: string; size?: number }> = ({ w, l, h, color, size = 44 }) => {
    const maxDim = Math.max(w, l, h, 1);
    const W = w / maxDim; const L = l / maxDim; const H = h / maxDim;
    const S = 13; const ox = 24; const oy = 30;
    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];
    const corners = [
        iso(0,0,0), iso(W,0,0), iso(W,L,0), iso(0,L,0), // bottom
        iso(0,0,H), iso(W,0,H), iso(W,L,H), iso(0,L,H), // top
    ];
    const [a,b,c,d,e,f,g,hh] = corners;
    const pts = (arr: [number,number][]) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible' }}>
            {/* bottom face */}
            <polygon points={pts([a,b,c,d])} fill="none" stroke={color} strokeWidth={0.6} strokeOpacity={0.25} />
            {/* left face */}
            <polygon points={pts([a,d,hh,e])} fill="rgba(255,255,255,0.02)" stroke={color} strokeWidth={0.7} strokeOpacity={0.55} />
            {/* right face */}
            <polygon points={pts([b,c,g,f])} fill="rgba(255,255,255,0.02)" stroke={color} strokeWidth={0.7} strokeOpacity={0.45} />
            {/* top face */}
            <polygon points={pts([e,f,g,hh])} fill="rgba(255,255,255,0.03)" stroke={color} strokeWidth={0.9} strokeOpacity={1} />
            {/* vertical edges */}
            {[{a,b: e},{a: b,b: f},{a: c,b: g},{a: d,b: hh}].map(({a: p1,b: p2},i) => (
                <line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth={0.6} strokeOpacity={0.4} />
            ))}
        </svg>
    );
};

// ─── Data-Dense Dock Card (horizontal layout) ───────────────────────────────────────
const DockCard: React.FC<{ crate: any; allCrates: any[]; allInventory: any[]; onLoad: () => void }> = ({ crate, allCrates, allInventory, onLoad }) => {
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#fff') : '#fff';
    const itemCount = (crate.inventory_ids || '').split(',').filter(Boolean).length;
    const w = crate.weight_kg || Math.round((crate.width_cm * crate.length_cm * (crate.height_cm || crate.width_cm)) / 5000);
    return (
        <button
            onClick={onLoad}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 active:scale-[0.98] transition-all group shrink-0 text-left border border-white/0 hover:border-white/5"
            style={{ minWidth: 180, maxWidth: 220 }}
        >
            {/* Wireframe */}
            <div className="shrink-0 relative">
                <CrateWireframe w={crate.width_cm} l={crate.length_cm} h={crate.height_cm || crate.width_cm} color={primaryColor} size={48} />
            </div>
            {/* Data */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                {/* Label + type */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-tight truncate leading-none" style={{ color: primaryColor }}>
                        {label}
                    </span>
                    {crate.type && <span className="text-[7px] font-black text-white/20 uppercase shrink-0">{crate.type.slice(0,2)}</span>}
                </div>
                {/* Dims */}
                <span className="text-[9px] font-black text-white/30 uppercase tracking-wide whitespace-nowrap">
                    {crate.width_cm}×{crate.length_cm}×{crate.height_cm || '?'} cm
                </span>
                {/* Bottom row: vendors + count */}
                <div className="flex items-center gap-1 mt-0.5">
                    {vendorList.slice(0, 3).map(v => (
                        <span key={v} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }} />
                    ))}
                    {itemCount > 0 && <span className="text-[8px] font-black text-white/20 ml-0.5">{itemCount} items</span>}
                    {w > 0 && <span className="text-[8px] font-black text-white/15 ml-auto">{w}KG</span>}
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

    const [isSaving, setIsSaving] = useAtom(truckIsBusyAtom);
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

    // ── Memoized panel stats — independent of zoom ──
    const panelStats = useMemo(() => {
        const MAX_KG = 20411;
        const TRUCK_VOL_M3 = (TRUCK_L_CM * TRUCK_W_CM * 279) / 1e6;
        const usedVol = truckCrates.reduce((s, c) => s + (c.width_cm * c.length_cm * (c.height_cm || 100)) / 1e6, 0);
        const volPct = Math.min(100, Math.round(usedVol / TRUCK_VOL_M3 * 100));
        const payloadPct = Math.min(100, Math.round(totalWeight / MAX_KG * 100));
        const remaining = Math.max(0, MAX_KG - totalWeight);
        const avgW = truckCrates.length ? Math.round(totalWeight / truckCrates.length) : 0;
        const nCrates = truckCrates.filter(c => c.type === 'crate').length;
        const nPallets = truckCrates.filter(c => c.type === 'pallet').length;
        const nBoxes = truckCrates.filter(c => c.type === 'cardboard').length;
        const th = TRUCK_L_CM / 3;
        const rear  = truckCrates.filter(c => (positions[c.id]?.x || 0) < th).length;
        const mid   = truckCrates.filter(c => { const x = positions[c.id]?.x || 0; return x >= th && x < 2*th; }).length;
        const total = truckCrates.length || 1;
        const rPct = Math.round(rear / total * 100);
        const mPct = Math.round(mid / total * 100);
        const fPct = 100 - rPct - mPct;
        const status = totalWeight > MAX_KG ? 'OVERLOAD' : payloadPct > 85 ? 'NEAR MAX' : payloadPct > 50 ? 'OPTIMAL' : truckCrates.length > 0 ? 'LIGHT' : 'EMPTY';
        const statusColor = status === 'OVERLOAD' ? '#ef4444' : status === 'NEAR MAX' ? '#f97316' : status === 'OPTIMAL' ? '#10b981' : '#6b7280';
        return { MAX_KG, TRUCK_VOL_M3, usedVol, volPct, payloadPct, remaining, avgW, nCrates, nPallets, nBoxes, rPct, mPct, fPct, status, statusColor };
    }, [truckCrates, totalWeight, positions]);

    const handleLoad = (id: string) => { setPositions(p => ({ ...p, [id]: { x: 10, y: 10, r: 0 } })); setSelectedId(id); };
    const handleUnload = (id: string) => { setPositions(p => { const n = { ...p }; delete n[id]; return n; }); setSelectedId(null); };
    const handleUpdatePos = (id: string, x: number, y: number) => setPositions(p => ({ ...p, [id]: { ...p[id], x, y } }));
    const handleRotate = (id: string) => setPositions(p => ({ ...p, [id]: { ...p[id], r: p[id].r === 0 ? 90 : 0 } }));
    const handleWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001))); }, []);

    // ── Ready Truck — sync DB + PDF + XLSX ──
    const handleReadyTruck = async () => {
        setIsSaving(true);
        const tid = toast.loading('Preparing manifest…');
        try {
            // 1. Sync positions to DB
            if (!isDummyMode) {
                for (const c of allCrates) {
                    const pos = positions[c.id];
                    const newStatus = pos ? 'In Transit' : (c.status === 'In Transit' ? 'Packed' : c.status);
                    const cleanDesc = (c.description || '').replace(/POS:\d+,\d+,\d+/, '').trim();
                    const finalDesc = pos ? `${cleanDesc} POS:${Math.round(pos.x)},${Math.round(pos.y)},${pos.r}`.trim() : cleanDesc;
                    const { error } = await supabase.from('logistics').update({ status: newStatus, description: finalDesc, updated_at: new Date().toISOString() }).eq('id', c.id);
                    if (error) throw error;
                    if (db) { const lDoc = await db.logistics.findOne({ selector: { id: c.id } }).exec(); if (lDoc) await lDoc.patch({ status: newStatus, description: finalDesc }); }
                }
                onRefresh(); setCratesVersion(v => v + 1);
            }

            const manifestId = `TRK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const ts = new Date().toLocaleString();

            // 2. Build per-crate item data
            const crateData = truckCrates.map(c => {
                const pos = positions[c.id]!;
                const { label } = getCrateDisplayName(c, allCrates, allInventory);
                const items = (c.inventory_ids || '').split(',').filter(Boolean).map((e: string) => {
                    const [id, qty] = e.split(':');
                    const inv = allInventory.find((i: any) => String(i.row) === id);
                    return inv ? { sku: inv.data?.itemId || id, desc: inv.data?.description || inv.data?.itemId || id, qty: qty || 1, vendor: (inv.data?.vendor_id || '').split('-')[0] } : null;
                }).filter(Boolean);
                const w = c.weight_kg || Math.round(c.width_cm * c.length_cm * c.height_cm / 5000);
                return { id: c.id, label, pos: `${Math.round(pos.x)}cm, ${Math.round(pos.y)}cm`, rot: pos.r === 90 ? '90°' : '0°', w_cm: c.width_cm, l_cm: c.length_cm, h_cm: c.height_cm, weight: w, type: c.type, items };
            });

            // 3. Generate truck map SVG (800×120px, scale=0.5)
            const svgScale = 0.5;
            const svgW = Math.round(TRUCK_L_CM * BASE_SCALE * svgScale);
            const svgH = Math.round(TRUCK_W_CM * BASE_SCALE * svgScale);
            const crateRects = crateData.map(cd => {
                const dimX = cd.rot === '90°' ? cd.l_cm : cd.w_cm;
                const dimY = cd.rot === '90°' ? cd.w_cm : cd.l_cm;
                const px = Math.round(cd.pos.split(',')[0].trim().replace('cm','')) * BASE_SCALE * svgScale;
                const py = Math.round(parseFloat(cd.pos.split(',')[1])) * BASE_SCALE * svgScale;
                const pw = dimX * BASE_SCALE * svgScale;
                const ph = dimY * BASE_SCALE * svgScale;
                const vendor = (cd.items[0] as any)?.vendor || '';
                const col = (vendors as any)[vendor]?.color || '#6b7280';
                return `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${col}22" stroke="${col}" stroke-width="0.8"/><text x="${px+pw/2}" y="${py+ph/2+4}" text-anchor="middle" font-size="7" fill="${col}" font-family="monospace">${cd.label}</text>`;
            }).join('');
            const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"><rect width="${svgW}" height="${svgH}" fill="#111" stroke="#444" stroke-width="1.5" rx="2"/>${crateRects}</svg>`;

            // 4. PDF (HTML print)
            const allItemsFlat = crateData.flatMap(cd => (cd.items as any[]).map(it => ({ ...it, crate: cd.label })));
            const crateRowsHTML = crateData.map(cd => `
                <tr style="border-top:1px solid #333"><td colspan="5" style="padding:6px 4px 2px;font-weight:900;font-size:11px;letter-spacing:0.05em">${cd.label} &mdash; ${cd.type.toUpperCase()}</td></tr>
                <tr style="color:#aaa;font-size:9px"><td style="padding:0 4px 4px">Pos: ${cd.pos} R:${cd.rot}</td><td>${cd.w_cm}W×${cd.l_cm}D×${cd.h_cm}H cm</td><td>${cd.weight} KG</td><td colspan="2">${(cd.items as any[]).length} items</td></tr>
                ${(cd.items as any[]).map((it: any) => `<tr style="font-size:10px"><td style="padding:1px 4px 1px 16px">${it.sku}</td><td>${it.desc}</td><td>${it.vendor}</td><td style="text-align:right">${it.qty}</td><td></td></tr>`).join('')}
            `).join('');
            const itemTableHTML = allItemsFlat.map((it: any) => `<tr><td style="padding:2px 4px">${it.sku}</td><td>${it.desc}</td><td>${it.vendor}</td><td>${it.crate}</td><td style="text-align:right">${it.qty}</td></tr>`).join('');
            const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Trucking Manifest ${manifestId}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;font-size:11px;color:#111;padding:24px}h1{font-size:18px;font-weight:900;letter-spacing:-0.03em;margin-bottom:4px}h2{font-size:13px;font-weight:900;margin:18px 0 6px;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #999;padding-bottom:4px}table{width:100%;border-collapse:collapse}tr:nth-child(even){background:#f9f9f9}.kv{display:flex;gap:32px;margin-bottom:12px;flex-wrap:wrap}.kv span{font-size:10px;color:#666;display:block}.kv strong{font-size:13px;font-weight:900}@media print{body{padding:16px}}</style></head><body>
<h1>■ TRUCKING MANIFEST</h1><p style="color:#999;font-size:9px;margin-bottom:14px">${manifestId} &bull; Generated ${ts}</p>
<div class="kv"><div><span>TRAILER</span><strong>53' &mdash; ${TRUCK_L_CM}cm × ${TRUCK_W_CM}cm</strong></div><div><span>UNITS LOADED</span><strong>${truckCrates.length} / ${allCrates.length}</strong></div><div><span>TOTAL PAYLOAD</span><strong>${Math.round(panelStats.payloadPct < 1 ? 0 : (panelStats.payloadPct / 100 * panelStats.MAX_KG))} KG</strong></div><div><span>FLOOR USED</span><strong>${panelStats.floorPct}%</strong></div><div><span>STATUS</span><strong>${panelStats.status}</strong></div></div>
<h2>Trailer Load Map</h2><div style="overflow:auto">${truckSvg}</div>
<h2>Crates Packing List</h2><table><thead><tr style="background:#111;color:#fff"><th style="padding:4px;text-align:left">Crate</th><th>Dims</th><th>Weight</th><th>Items</th><th></th></tr></thead><tbody>${crateRowsHTML}</tbody></table>
<h2>Unified Items Index</h2><table><thead><tr style="background:#111;color:#fff"><th style="padding:4px;text-align:left">SKU</th><th>Description</th><th>Vendor</th><th>Crate</th><th style="text-align:right">Qty</th></tr></thead><tbody>${itemTableHTML}</tbody></table>
</body></html>`;
            const pdfBlob = new Blob([htmlContent], { type: 'text/html' });
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const pdfWin = window.open(pdfUrl, '_blank');
            if (pdfWin) { pdfWin.onload = () => { pdfWin.print(); }; }

            // 5. XLSX as CSV
            const csvRows = [
                ['TRUCKING MANIFEST', manifestId, ts],
                [],
                ['CRATE ID','TYPE','POS_X_CM','POS_Y_CM','ROTATION','WIDTH_CM','DEPTH_CM','HEIGHT_CM','WEIGHT_KG','ITEMS'],
                ...crateData.map(cd => [cd.label, cd.type, cd.pos.split(',')[0], cd.pos.split(',')[1], cd.rot, cd.w_cm, cd.l_cm, cd.h_cm, cd.weight, (cd.items as any[]).length]),
                [],
                ['SKU','DESCRIPTION','VENDOR','CRATE','QTY'],
                ...allItemsFlat.map((it: any) => [it.sku, it.desc, it.vendor, it.crate, it.qty]),
            ];
            const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
            const csvBlob = new Blob([csv], { type: 'text/csv' });
            const csvUrl = URL.createObjectURL(csvBlob);
            const a = document.createElement('a'); a.href = csvUrl; a.download = `${manifestId}.csv`; a.click();
            URL.revokeObjectURL(csvUrl);

            toast.success(`Manifest ${manifestId} ready`, { id: tid, icon: '🚚', duration: 5000 });
        } catch (err: any) { toast.error(err.message || 'Failed', { id: tid }); }
        finally { setIsSaving(false); }
    };

    // Listen to global Ready Truck trigger from MainHeader
    const truckReadyTrigger = useAtomValue(truckReadyTriggerAtom);
    const prevTriggerRef = useRef(0);
    useEffect(() => {
        if (truckReadyTrigger > 0 && truckReadyTrigger !== prevTriggerRef.current) {
            prevTriggerRef.current = truckReadyTrigger;
            handleReadyTruck();
        }
    }, [truckReadyTrigger]);

    const canvasW = TRUCK_L_CM * BASE_SCALE; // 2422px — scrolls horizontally
    const canvasH = TRUCK_W_CM * BASE_SCALE; // 366px

    return (
        <div className="flex flex-col h-full text-white overflow-hidden relative" onClick={() => setSelectedId(null)}>

            {/* ── HORIZONTAL DOCK STRIP — above info panel, never zooms ── */}
            <div
                className="shrink-0 border-b border-white/5 bg-[#080808]"
                onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
            >
                {dockCrates.length === 0 ? (
                    <div className="flex items-center gap-3 px-6 py-3 text-white/10">
                        <Truck size={14} strokeWidth={0.8} />
                        <span className="text-[9px] font-black uppercase tracking-[0.3em]">All units loaded</span>
                    </div>
                ) : (
                    <div
                        className="flex items-stretch gap-1 overflow-x-auto px-4 py-3"
                        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
                    >
                        {/* Count badge */}
                        <div className="flex flex-col items-center justify-center px-4 shrink-0 border-r border-white/8 mr-2">
                            <span className="text-3xl font-black tracking-tighter text-white/60">{dockCrates.length}</span>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/20">staged</span>
                        </div>
                        {dockCrates.map(c => (
                            <DockCard key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory} onLoad={() => handleLoad(c.id)} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── CANVAS AREA (info panel + trailer viewer) ── */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-0" onClick={e => e.stopPropagation()}>

                {/* ══ FIXED HEADER PANEL — never scrolls or zooms ══ */}
                <div
                    className="shrink-0 px-8 pt-4 pb-4 flex flex-col gap-3"
                    onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
                >

                    {/* Row 1: title + controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-3">
                            <h2 className="text-xl font-black uppercase tracking-tighter">53' Trailer</h2>
                            <span className="text-[9px] font-black text-white/20">{Math.round(zoom * 100)}%</span>
                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">{TRUCK_L_CM}cm × {TRUCK_W_CM}cm</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="text-white/30 hover:text-white transition-colors" title="Zoom out"><ZoomOut size={16} /></button>
                            <button onClick={() => setZoom(1.0)} className="text-white/30 hover:text-white transition-colors" title="Reset zoom"><Maximize2 size={14} /></button>
                            <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="text-white/30 hover:text-white transition-colors" title="Zoom in"><ZoomIn size={16} /></button>
                        </div>
                    </div>

                    {/* Row 2: stats — flex nowrap, fixed min-widths, NEVER collapses or wraps */}
                    <div className="flex items-start gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {/* Units */}
                        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 90 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Units</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black tracking-tighter text-emerald-400">{truckCrates.length}</span>
                                <span className="text-[10px] text-white/20">/ {allCrates.length}</span>
                            </div>
                            <div className="flex gap-1 text-[7px] font-black text-white/20 uppercase">
                                {panelStats.nCrates > 0 && <span>{panelStats.nCrates}CR</span>}
                                {panelStats.nPallets > 0 && <span>{panelStats.nPallets}PL</span>}
                                {panelStats.nBoxes > 0 && <span>{panelStats.nBoxes}BX</span>}
                            </div>
                        </div>
                        <div className="w-px self-stretch bg-white/5 mx-5 shrink-0" />
                        {/* Payload */}
                        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 180 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Payload</span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-black tracking-tighter" style={{ color: 'var(--main-color)' }}>{Math.round(totalWeight).toLocaleString()}</span>
                                <span className="text-[10px] text-white/30">KG</span>
                                <span className="text-white/10 mx-1">·</span>
                                <span className="text-sm font-black text-white/40">{(totalWeight/1000).toFixed(2)}</span>
                                <span className="text-[9px] text-white/20">T</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-0.5 bg-white/10 rounded-full overflow-hidden" style={{ width: 120 }}>
                                    <div className="h-full transition-all duration-700" style={{ width: `${panelStats.payloadPct}%`, backgroundColor: panelStats.statusColor }} />
                                </div>
                                <span className="text-[7px] font-black text-white/20 whitespace-nowrap">{panelStats.payloadPct}% of {(panelStats.MAX_KG/1000).toFixed(0)}T max</span>
                            </div>
                        </div>
                        <div className="w-px self-stretch bg-white/5 mx-5 shrink-0" />
                        {/* Floor */}
                        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 90 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Floor</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black tracking-tighter">{floorPct}</span>
                                <span className="text-[10px] text-white/30">%</span>
                            </div>
                            <div className="h-0.5 bg-white/10 rounded-full overflow-hidden" style={{ width: 80 }}>
                                <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${floorPct}%` }} />
                            </div>
                        </div>
                        <div className="w-px self-stretch bg-white/5 mx-5 shrink-0" />
                        {/* Volume */}
                        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 90 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Volume</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black tracking-tighter">{panelStats.volPct}</span>
                                <span className="text-[10px] text-white/30">%</span>
                            </div>
                            <span className="text-[7px] font-black text-white/20 whitespace-nowrap">{panelStats.usedVol.toFixed(1)} / {panelStats.TRUCK_VOL_M3.toFixed(0)} m³</span>
                        </div>
                        <div className="w-px self-stretch bg-white/5 mx-5 shrink-0" />
                        {/* Status */}
                        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 120 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Status</span>
                            <span className="text-base font-black tracking-tighter" style={{ color: panelStats.statusColor }}>{panelStats.status}</span>
                            <span className="text-[7px] font-black text-white/20 whitespace-nowrap">{panelStats.avgW > 0 ? `~${panelStats.avgW} KG/unit` : '—'}</span>
                            <span className="text-[7px] font-black text-white/20 whitespace-nowrap">{panelStats.remaining > 0 ? `${Math.round(panelStats.remaining).toLocaleString()} KG rem.` : 'AT MAX'}</span>
                        </div>
                        <div className="w-px self-stretch bg-white/5 mx-5 shrink-0" />
                        {/* Distribution — larger chart, bigger labels */}
                        <div className="flex flex-col gap-2 shrink-0" style={{ minWidth: 320 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Load Distribution</span>
                            {/* Bar */}
                            <div className="flex h-3 gap-0.5 rounded overflow-hidden" style={{ width: '100%' }}>
                                <div className="h-full bg-emerald-500/80 rounded-l transition-all duration-700" style={{ flex: panelStats.rPct || 1 }} />
                                <div className="h-full bg-emerald-400/50 transition-all duration-700" style={{ flex: panelStats.mPct || 1 }} />
                                <div className="h-full bg-emerald-300/30 rounded-r transition-all duration-700" style={{ flex: panelStats.fPct || 1 }} />
                            </div>
                            {/* Labels */}
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col items-start">
                                    <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">◀ Rear</span>
                                    <span className="text-lg font-black tracking-tighter text-emerald-400">{panelStats.rPct}<span className="text-[10px] text-white/30">%</span></span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">Mid</span>
                                    <span className="text-lg font-black tracking-tighter text-emerald-300/70">{panelStats.mPct}<span className="text-[10px] text-white/30">%</span></span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">Front ▶</span>
                                    <span className="text-lg font-black tracking-tighter text-emerald-300/40">{panelStats.fPct}<span className="text-[10px] text-white/30">%</span></span>
                                </div>
                            </div>
                        </div>
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


            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
            `}</style>
        </div>
    );
};
