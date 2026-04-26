import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { Truck, Box, Trash2, RotateCcw, Info, ChevronRight, Loader2, Gauge, ZoomIn, ZoomOut, Maximize2, Layers, Grid3x3, PanelTop, PanelTopClose, FolderOpen, Save, X, Download, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { isDummyModeAtom, cratesVersionAtom, inventoryAtom, truckReadyTriggerAtom, truckIsBusyAtom, truckViewModeAtom, truckIsCompactAtom, truckShowSaveDraftAtom, truckShowOpenDraftAtom, truckShowExportModalAtom } from '../../lib/atoms';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import ExcelJS from 'exceljs';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';

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

// ─── Weight: sum item.weight_kg × qty from inventory_ids ─────────────────────
function computeCrateWeight(crate: any, allInventory: any[]): number {
    if (crate.inventory_ids) {
        let total = 0; let hasData = false;
        crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
            const [id, qtyStr] = e.split(':');
            const qty = parseInt(qtyStr || '1', 10) || 1;
            const inv = allInventory.find((i: any) => String(i.row) === id);
            const w = inv?.data?.weight_kg ?? inv?.data?.weightKg;
            if (w != null && !isNaN(Number(w))) { total += Number(w) * qty; hasData = true; }
        });
        if (hasData) return Math.round(total * 10) / 10;
    }
    return crate.weight_kg || Math.round((crate.width_cm * crate.length_cm * (crate.height_cm || crate.width_cm)) / 5000);
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

// ─── Data-Dense Dock Card (larger, high-contrast) ────────────────────────────
const DockCard: React.FC<{ crate: any; allCrates: any[]; allInventory: any[]; onLoad: () => void }> = ({ crate, allCrates, allInventory, onLoad }) => {
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#e5e7eb') : '#e5e7eb';
    const itemCount = (crate.inventory_ids || '').split(',').filter(Boolean).length;
    const w = computeCrateWeight(crate, allInventory);
    const typeLabel = crate.type === 'pallet' ? 'PLT' : crate.type === 'cardboard' ? 'BOX' : 'CRT';
    return (
        <button
            onClick={onLoad}
            title={`Load ${label} onto truck`}
            className="flex flex-col gap-2 p-3 rounded-xl transition-all group shrink-0 text-left border cursor-pointer active:scale-[0.97]"
            style={{
                minWidth: 160, maxWidth: 190,
                background: `${primaryColor}10`,
                borderColor: `${primaryColor}30`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${primaryColor}22`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${primaryColor}60`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${primaryColor}10`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${primaryColor}30`; }}
        >
            {/* Top row: wireframe + type badge */}
            <div className="flex items-start justify-between w-full">
                <CrateWireframe w={crate.width_cm} l={crate.length_cm} h={crate.height_cm || crate.width_cm} color={primaryColor} size={52} />
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: `${primaryColor}25`, color: primaryColor }}>
                    {typeLabel}
                </span>
            </div>
            {/* Label */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {vendorList.slice(0,3).map(v => (
                    <span key={v} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }} />
                ))}
                <span className="text-[13px] font-black uppercase tracking-tight leading-none truncate" style={{ color: primaryColor }}>
                    {label}
                </span>
            </div>
            {/* Dims */}
            <span className="text-[10px] font-black uppercase tracking-wide whitespace-nowrap" style={{ color: `${primaryColor}99` }}>
                {crate.width_cm}×{crate.length_cm}×{crate.height_cm || '?'} cm
            </span>
            {/* Bottom stats */}
            <div className="flex items-center justify-between w-full pt-1 border-t" style={{ borderColor: `${primaryColor}20` }}>
                <span className="text-[10px] font-black text-white/60">{itemCount} <span className="text-white/30 font-normal">items</span></span>
                <span className="text-[10px] font-black" style={{ color: primaryColor }}>{w}<span className="text-white/30 font-normal text-[8px]"> KG</span></span>
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

// ─── Side View (interactive 2-D lateral view) ────────────────────────────────
const TRUCK_H_CM = 279;
const SideView: React.FC<{
    truckCrates: any[];
    positions: Record<string, {x:number;y:number;r:number;z?:number}>;
    allCrates: any[]; allInventory: any[];
    zoom: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onUpdateXZ: (id: string, x: number, z: number) => void;
    onStack: (id: string) => void;
    onUnload: (id: string) => void;
}> = ({ truckCrates, positions, allCrates, allInventory, zoom, selectedId, onSelect, onUpdateXZ, onStack, onUnload }) => {
    const SVG_W = TRUCK_L_CM * BASE_SCALE;
    const SVG_H = TRUCK_H_CM * BASE_SCALE;
    const svgRef = useRef<SVGSVGElement>(null);

    // Build crate draw list with z support
    const crateItems = useMemo(() => truckCrates.map(c => {
        const pos = positions[c.id];
        if (!pos) return null;
        const rotated = pos.r === 90;
        // r=0: length_cm goes along truck X axis (same as TruckCrate top-view)
        const lenX = rotated ? c.width_cm : c.length_cm;
        const h = c.height_cm || 100;
        const zOff = pos.z || 0;
        const px = pos.x * BASE_SCALE;
        const pw = lenX * BASE_SCALE;
        const ph = h * BASE_SCALE;
        const py = SVG_H - (zOff + h) * BASE_SCALE;
        const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
        const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#a1a1aa') : '#a1a1aa';
        const isSelected = c.id === selectedId;
        return { id: c.id, px, py, pw, ph, label, col, h, lenX, zOff, isSelected, crate: c };
    }).filter(Boolean) as any[], [truckCrates, positions, allCrates, allInventory, selectedId]);

    // SVG mouse drag
    const dragRef = useRef<{ id: string; startX: number; startZ: number; mouseX: number; mouseY: number } | null>(null);

    const getSVGPoint = (e: MouseEvent | React.MouseEvent): {x: number; y: number} => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const clientX = 'clientX' in e ? e.clientX : 0;
        const clientY = 'clientY' in e ? e.clientY : 0;
        return {
            x: (clientX - rect.left) / zoom / BASE_SCALE,
            y: (clientY - rect.top) / zoom / BASE_SCALE,
        };
    };

    const handleCrateMouseDown = (e: React.MouseEvent, item: any) => {
        e.preventDefault(); e.stopPropagation();
        onSelect(item.id);
        const pt = getSVGPoint(e);
        dragRef.current = { id: item.id, startX: positions[item.id].x, startZ: positions[item.id].z || 0, mouseX: pt.x, mouseY: pt.y };
        const onMove = (me: MouseEvent) => {
            if (!dragRef.current) return;
            const p = getSVGPoint(me);
            // SVG point is already in cm-space (divided by BASE_SCALE in getSVGPoint)
            const dx = p.x - dragRef.current.mouseX;
            const dy = -(p.y - dragRef.current.mouseY); // inverted: up = positive z
            onUpdateXZ(dragRef.current.id, dragRef.current.startX + dx, Math.max(0, dragRef.current.startZ + dy));
        };
        const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div className="flex-1 overflow-auto custom-scrollbar" style={{ background: 'rgba(3,3,6,0.9)' }}>
            <div className="p-6" style={{ minWidth: SVG_W * zoom + 48, minHeight: SVG_H * zoom + 120 }}>
                {/* Header bar */}
                <div className="flex items-center gap-4 mb-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">◀ Rear</span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] font-black text-white/70 uppercase tracking-widest">
                        Side View — {TRUCK_L_CM}cm × {TRUCK_H_CM}cm H
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">Front ▶</span>
                </div>
                {/* Selected crate toolbar */}
                {selectedId && positions[selectedId] && (() => {
                    const sel = truckCrates.find(c => c.id === selectedId);
                    const pos = positions[selectedId];
                    return sel ? (
                        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-white/15 backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <span className="text-[10px] font-black text-white/80 uppercase tracking-wide flex-1">
                                {getCrateDisplayName(sel, allCrates, allInventory).label}
                                <span className="text-white/30 ml-2">X:{Math.round(pos.x)}cm  Z:{Math.round(pos.z||0)}cm</span>
                            </span>
                            <button onClick={() => onStack(selectedId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border border-amber-500/30 text-amber-400 hover:bg-amber-500/15">
                                ⬆ Stack on Top
                            </button>
                            <button onClick={() => onUpdateXZ(selectedId, pos.x, Math.max(0, (pos.z||0) - (sel.height_cm||100)))}
                                className="px-2 py-1.5 rounded-md text-[9px] font-black text-white/50 hover:text-white border border-white/10 cursor-pointer">↓</button>
                            <button onClick={() => onUpdateXZ(selectedId, pos.x, (pos.z||0) + (sel.height_cm||100))}
                                className="px-2 py-1.5 rounded-md text-[9px] font-black text-white/50 hover:text-white border border-white/10 cursor-pointer">↑</button>
                            <button onClick={() => onUpdateXZ(selectedId, Math.max(0, pos.x - 50), pos.z||0)}
                                className="px-2 py-1.5 rounded-md text-[9px] font-black text-white/50 hover:text-white border border-white/10 cursor-pointer">◀</button>
                            <button onClick={() => onUpdateXZ(selectedId, pos.x + 50, pos.z||0)}
                                className="px-2 py-1.5 rounded-md text-[9px] font-black text-white/50 hover:text-white border border-white/10 cursor-pointer">▶</button>
                            <button onClick={() => onUnload(selectedId)}
                                className="px-3 py-1.5 rounded-md text-[9px] font-black text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 cursor-pointer">Remove</button>
                        </div>
                    ) : null;
                })()}
                <div style={{ width: SVG_W * zoom, height: SVG_H * zoom, position: 'relative' }}>
                    <svg ref={svgRef} width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', overflow: 'visible', cursor: 'default' }}>
                        {/* Trailer shell */}
                        <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.25)" strokeWidth={2} />
                        {/* Floor */}
                        <rect x={0} y={SVG_H - 8} width={SVG_W} height={8} fill="rgba(255,255,255,0.12)" />
                        {/* Height grid every 50cm */}
                        {Array.from({ length: Math.floor(TRUCK_H_CM / 50) }, (_, i) => (i + 1) * 50).map(y => (
                            <g key={y}>
                                <line x1={0} y1={SVG_H - y * BASE_SCALE} x2={SVG_W} y2={SVG_H - y * BASE_SCALE}
                                    stroke={y % 100 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'} strokeWidth={y % 100 === 0 ? 1 : 0.5} />
                                <text x={6} y={SVG_H - y * BASE_SCALE - 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="monospace" fontWeight="bold">{y}cm</text>
                            </g>
                        ))}
                        {/* Axle lines */}
                        {[0.72, 0.82, 0.90].map(f => (
                            <line key={f} x1={f * SVG_W} y1={0} x2={f * SVG_W} y2={SVG_H}
                                stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="5,4" />
                        ))}
                        {/* Crates — non-selected first, selected on top */}
                        {[...crateItems.filter(cr => !cr.isSelected), ...crateItems.filter(cr => cr.isSelected)].map(cr => (
                            <g key={cr.id} style={{ cursor: 'grab' }} onMouseDown={e => handleCrateMouseDown(e, cr)}>
                                {/* Shadow */}
                                {cr.isSelected && <rect x={cr.px + 3} y={cr.py + 3} width={cr.pw} height={cr.ph} fill="rgba(0,0,0,0.4)" rx={3} />}
                                {/* Body — full solid color */}
                                <rect x={cr.px} y={cr.py} width={cr.pw} height={cr.ph}
                                    fill={cr.col}
                                    stroke={cr.isSelected ? 'white' : 'rgba(0,0,0,0.4)'}
                                    strokeWidth={cr.isSelected ? 2.5 : 1.5}
                                    rx={3} opacity={cr.isSelected ? 1 : 0.92} />
                                {/* Selection ring */}
                                {cr.isSelected && <rect x={cr.px - 2} y={cr.py - 2} width={cr.pw + 4} height={cr.ph + 4}
                                    fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} rx={4} strokeDasharray="4,3" />}
                                {/* Label — dark text over solid fill for contrast */}
                                {cr.pw > 18 && cr.ph > 16 && (
                                    <text x={cr.px + cr.pw / 2} y={cr.py + cr.ph / 2 + 4}
                                        textAnchor="middle" fontSize={Math.min(13, cr.pw / 3.5)} fill="rgba(0,0,0,0.85)"
                                        fontFamily="monospace" fontWeight="900" opacity={0.95}>
                                        {cr.label}
                                    </text>
                                )}
                                {cr.ph > 28 && (
                                    <text x={cr.px + cr.pw / 2} y={cr.py + cr.ph / 2 + 17}
                                        textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.6)"
                                        fontFamily="monospace" opacity={0.9}>
                                        {cr.h}H {cr.zOff > 0 ? `+${Math.round(cr.zOff)}Z` : ''}
                                    </text>
                                )}
                                {/* Stack level indicator dot */}
                                {cr.zOff > 0 && (
                                    <circle cx={cr.px + 8} cy={cr.py + 8} r={5} fill={cr.col} opacity={0.9} />
                                )}
                            </g>
                        ))}
                        {/* Cab block */}
                        <rect x={SVG_W - 10} y={0} width={10} height={SVG_H} fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                        <text x={SVG_W - 5} y={SVG_H / 2} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)" fontFamily="monospace"
                            transform={`rotate(-90, ${SVG_W - 5}, ${SVG_H / 2})`}>CAB</text>
                    </svg>
                </div>
            </div>
        </div>
    );
};

// ─── Draft Save / Load / Export / Import System ───────────────────────────────
const DRAFTS_KEY = 'onyx_truck_drafts';
const TRUCKLOAD_EXT = '.truckload';
const TRUCKLOAD_MIME = 'application/json';
const TRUCKLOAD_VERSION = 3; // v3 is a JPEG+JSON hybrid file for native OS thumbnails

interface TruckDraft {
    id: string;
    name: string;
    savedAt: number;
    crateCount: number;
    positions: Record<string, { x: number; y: number; r: number; z?: number }>;
    thumbnail?: string; // base64 JPEG data URL
}
interface TruckloadFile {
    version: number;
    type: 'onyx-truckload';
    name: string;
    savedAt: number;
    crateCount: number;
    positions: Record<string, { x: number; y: number; r: number; z?: number }>;
    thumbnail?: string;
}

// ── Thumbnail generator — draws exact trailer map without padding ─────────────
function generateTrailerThumbnail(
    truckCrates: any[],
    positions: Record<string, { x: number; y: number; r: number; z?: number }>,
    allCrates: any[],
    allInventory: any[]
): string {
    const W = 2400;
    const scale = W / TRUCK_L_CM;
    const H = Math.round(TRUCK_W_CM * scale);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Trailer floor (Dark background)
    ctx.fillStyle = '#13131e';
    ctx.fillRect(0, 0, W, H);
    
    // Cab end marker
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, 6, H);
    
    // Crates
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate) continue;
        
        const rotated = pos.r === 90;
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const lenY = (pos.r === 0 ? (crate.width_cm || 80) : (crate.length_cm || 120)) * scale;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory);
        const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        ctx.fillStyle = primaryColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        (ctx as any).roundRect(pos.x * scale, pos.y * scale, lenX, lenY, 1.5);
        ctx.fill(); ctx.stroke();
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('ONYX · TRUCKLOAD', 10, H - 10);
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

function generateSideViewThumbnail(
    truckCrates: any[],
    positions: Record<string, { x: number; y: number; r: number; z?: number }>,
    allCrates: any[],
    allInventory: any[]
): string {
    const W = 2400;
    const scale = W / TRUCK_L_CM;
    const TRUCK_H_CM = 279;
    const H = Math.round(TRUCK_H_CM * scale);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Trailer shell (Dark background)
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);
    
    // Floor marker
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, H - 4, W, 4);

    // Crates
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate) continue;
        
        const rotated = pos.r === 90;
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const h = (crate.height_cm || 100) * scale;
        const zOff = (pos.z || 0) * scale;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory);
        const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        
        ctx.fillStyle = primaryColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        (ctx as any).roundRect(pos.x * scale, H - zOff - h, lenX, h, 1.5);
        ctx.fill(); ctx.stroke();
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('ONYX · TRUCKLOAD SIDEVIEW', 10, H - 10);
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

function getDrafts(): TruckDraft[] {
    try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch { return []; }
}
function saveDraft(draft: TruckDraft) {
    const existing = getDrafts().filter(d => d.id !== draft.id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify([draft, ...existing]));
}
function deleteDraft(id: string) {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(getDrafts().filter(d => d.id !== id)));
}
function exportDraftFile(draft: TruckDraft) {
    const payload: TruckloadFile = {
        version: TRUCKLOAD_VERSION,
        type: 'onyx-truckload',
        name: draft.name,
        savedAt: draft.savedAt,
        crateCount: draft.crateCount,
        positions: draft.positions
    };
    const jsonString = JSON.stringify(payload, null, 2);
    let blob: Blob;

    if (draft.thumbnail && draft.thumbnail.startsWith('data:image/jpeg;base64,')) {
        const b64Data = draft.thumbnail.split(',')[1];
        const binaryString = atob(b64Data);
        const jpegBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            jpegBytes[i] = binaryString.charCodeAt(i);
        }
        const jsonBytes = new TextEncoder().encode('\n' + jsonString);
        // Hybrid file: JPEG bytes followed by JSON text (OS readers stop at JPEG EOI)
        blob = new Blob([jpegBytes, jsonBytes], { type: 'image/jpeg' });
    } else {
        payload.thumbnail = draft.thumbnail; // fallback
        blob = new Blob([JSON.stringify(payload, null, 2)], { type: TRUCKLOAD_MIME });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.name.replace(/[^a-z0-9_\- ]/gi, '_')}${TRUCKLOAD_EXT}`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
async function importDraftFile(file: File): Promise<TruckDraft | null> {
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let jsonText = '';
        let thumbnailBase64: string | undefined = undefined;

        // Check for JPEG magic bytes (0xFF 0xD8)
        if (bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
            let eoiIndex = -1;
            // Search backwards to find the End Of Image marker (0xFF 0xD9)
            for (let i = bytes.length - 2; i >= 0; i--) {
                if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
                    eoiIndex = i;
                    break;
                }
            }
            if (eoiIndex !== -1) {
                const jpegBytes = bytes.slice(0, eoiIndex + 2);
                const jsonBytes = bytes.slice(eoiIndex + 2);
                
                jsonText = new TextDecoder().decode(jsonBytes).trim();
                
                const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
                thumbnailBase64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } else return null; // Invalid hybrid
        } else {
            // Pure JSON text fallback
            jsonText = new TextDecoder().decode(bytes);
        }

        const data = JSON.parse(jsonText) as TruckloadFile;
        if (data.type !== 'onyx-truckload' || !data.positions) return null;
        return {
            id: `draft_${Date.now()}`,
            name: data.name || file.name.replace(TRUCKLOAD_EXT, ''),
            savedAt: data.savedAt || Date.now(),
            crateCount: data.crateCount || Object.keys(data.positions).length,
            positions: data.positions,
            thumbnail: data.thumbnail || thumbnailBase64
        };
    } catch (e) { console.error('Draft import failed', e); return null; }
}

// ─── Export Modal ────────────────────────────────────────────────────────────
const TruckExportModal: React.FC<{
    truckCrates: any[];
    allCrates: any[];
    allInventory: any[];
    positions: any;
    onClose: () => void;
}> = ({ truckCrates, allCrates, allInventory, positions, onClose }) => {
    const [name, setName] = useState(`Truck ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })}`);
    const [progress, setProgress] = useState({ manifesto: -1, pdf: -1, packed: -1 });
    const [urls, setUrls] = useState({ manifesto: '', pdf: '', packed: '' });

    const getItemsFromCrate = (crate: any) => {
        if (!crate.inventory_ids) return [];
        return crate.inventory_ids.split(',').filter(Boolean).map((e: string) => {
            const [id, qtyStr] = e.split(':');
            const qty = parseInt(qtyStr || '1', 10) || 1;
            const inv = allInventory.find((i: any) => String(i.row) === id);
            return { id, qty, inv };
        }).filter((item: any) => item.inv);
    };

    const buildConsolidatedItems = () => {
        const itemMap = new Map<string, { qty: number, inv: any }>();
        truckCrates.forEach(c => {
            getItemsFromCrate(c).forEach((item: any) => {
                const existing = itemMap.get(item.id);
                if (existing) existing.qty += item.qty;
                else itemMap.set(item.id, { qty: item.qty, inv: item.inv });
            });
        });
        return Array.from(itemMap.values());
    };

    const generateManifesto = async () => {
        setProgress(p => ({ ...p, manifesto: 5 }));
        const items = buildConsolidatedItems();
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Manifesto');
        ws.columns = [
            { header: 'Book TAG ID', key: 'tag', width: 20 },
            { header: 'Quantity', key: 'qty', width: 10 },
            { header: 'Description', key: 'desc', width: 50 },
            { header: 'Weight (KG)', key: 'weight', width: 15 },
            { header: 'Dimensions (CM)', key: 'dims', width: 20 },
        ];
        items.forEach((item, idx) => {
            setProgress(p => ({ ...p, manifesto: 5 + Math.round((idx / items.length) * 80) }));
            const inv = item.inv;
            const data = inv.data || {};
            const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
            const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
            ws.addRow({ tag: data.itemId || inv.row, qty: item.qty, desc: desc || 'Artifact', weight: data.weightKg || data.weight_kg || '', dims });
        });
        ws.getRow(1).font = { bold: true };
        setProgress(p => ({ ...p, manifesto: 95 }));
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
        setProgress(p => ({ ...p, manifesto: 100 }));
    };

    const generatePdf = async () => {
        setProgress(p => ({ ...p, pdf: 5 }));
        const items = buildConsolidatedItems();
        const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
            const data = item.inv.data || {};
            // USE book_barcode (Book tag ID) as requested
            const tag = data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
            const vendorPrefix = tag.split('-')[0] || '';
            const vendorCol = vendors[vendorPrefix as keyof typeof vendors]?.color || '#333333';
            return {
                index: idx, vendorPrefix, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
                name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                material: data.material || data.Material || '', color: data.color || data.Color || '',
                dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                costMxn: 0, costUsd: 0,
                imageUrls: (data.photos || []).map((p:any) => p.url),
                tagColor: vendorCol, dbItemCount: data.quantity || 1
            };
        });

        // ── Enhanced Meta with Trailer Views ──
        const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
        const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
        
        const allTruckCratesMeta = truckCrates.map(c => {
            const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#f59e0b') : '#f59e0b';
            return {
                id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
                weight: computeCrateWeight(c, allInventory), color: col,
                l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
            };
        });

        const meta = {
            dynamicId: name || 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
            crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
            topViewImg: topView, sideViewImg: sideView,
            allTruckCrates: allTruckCratesMeta
        };
        const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), true) as Blob;
        setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
        setProgress(p => ({ ...p, pdf: 100 }));
    };

    const generatePacked = async () => {
        setProgress(p => ({ ...p, packed: 5 }));
        const wb = new ExcelJS.Workbook();
        for (let i = 0; i < truckCrates.length; i++) {
            setProgress(p => ({ ...p, packed: 5 + Math.round((i / truckCrates.length) * 80) }));
            const crate = truckCrates[i];
            const { label } = getCrateDisplayName(crate, allCrates, allInventory);
            const safeLabel = label.replace(/[\[\]\*\/\?\:\\]/g, '').substring(0, 31) || `Crate ${i+1}`;
            let sheetName = safeLabel; let counter = 1;
            while (wb.worksheets.find(s => s.name === sheetName)) sheetName = `${safeLabel.substring(0, 28)}_${counter++}`;
            const ws = wb.addWorksheet(sheetName);
            ws.columns = [
                { header: 'Book TAG ID', key: 'tag', width: 20 }, { header: 'Quantity', key: 'qty', width: 10 },
                { header: 'Description', key: 'desc', width: 50 }, { header: 'Weight (KG)', key: 'weight', width: 15 },
                { header: 'Dimensions (CM)', key: 'dims', width: 20 },
            ];
            getItemsFromCrate(crate).forEach((item: any) => {
                const inv = item.inv; const data = inv.data || {};
                const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
                const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
                ws.addRow({ tag: data.itemId || inv.row, qty: item.qty, desc: desc || 'Artifact', weight: data.weightKg || data.weight_kg || '', dims });
            });
            ws.getRow(1).font = { bold: true };
        }
        setProgress(p => ({ ...p, packed: 95 }));
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        setUrls(u => ({ ...u, packed: URL.createObjectURL(blob) }));
        setProgress(p => ({ ...p, packed: 100 }));
    };

    const triggerDownload = (url: string, filename: string) => {
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    };

    const isDone = (k: keyof typeof progress) => progress[k] === 100;
    const isWorking = (k: keyof typeof progress) => progress[k] >= 0 && progress[k] < 100;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/15 p-6 flex flex-col gap-6 shadow-2xl"
                style={{ background: 'rgba(12,12,18,0.95)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-white">Exportation Wizard</h3>
                        <p className="text-xs text-white/40 mt-1">Generate manifestos and packing lists</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Truck Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                </div>

                <div className="flex flex-col gap-3">
                    {/* Manifesto.xlsx */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                        <div className="flex-1">
                            <span className="block text-sm font-bold text-white">manifesto.xlsx</span>
                            <span className="block text-[10px] text-white/40">Consolidated list of all items</span>
                            {progress.manifesto >= 0 && (
                                <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress.manifesto}%` }} />
                                </div>
                            )}
                        </div>
                        {isDone('manifesto') ? (
                            <button onClick={() => triggerDownload(urls.manifesto, `${name}_Manifesto.xlsx`)} className="px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer">Download</button>
                        ) : (
                            <button onClick={generateManifesto} disabled={isWorking('manifesto')} className="px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors cursor-pointer">
                                {isWorking('manifesto') ? 'Generating...' : 'Generate'}
                            </button>
                        )}
                    </div>

                    {/* Packing List.pdf */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                        <div className="flex-1">
                            <span className="block text-sm font-bold text-white">Packing List.pdf</span>
                            <span className="block text-[10px] text-white/40">Multi-page printable manifesto</span>
                            {progress.pdf >= 0 && (
                                <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${progress.pdf}%` }} />
                                </div>
                            )}
                        </div>
                        {isDone('pdf') ? (
                            <button onClick={() => triggerDownload(urls.pdf, `${name}_Packing_List.pdf`)} className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer">Download</button>
                        ) : (
                            <button onClick={generatePdf} disabled={isWorking('pdf')} className="px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors cursor-pointer">
                                {isWorking('pdf') ? 'Generating...' : 'Generate'}
                            </button>
                        )}
                    </div>

                    {/* Packed.xlsx */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                        <div className="flex-1">
                            <span className="block text-sm font-bold text-white">Packed.xlsx</span>
                            <span className="block text-[10px] text-white/40">One spreadsheet per crate</span>
                            {progress.packed >= 0 && (
                                <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress.packed}%` }} />
                                </div>
                            )}
                        </div>
                        {isDone('packed') ? (
                            <button onClick={() => triggerDownload(urls.packed, `${name}_Packed.xlsx`)} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer">Download</button>
                        ) : (
                            <button onClick={generatePacked} disabled={isWorking('packed')} className="px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors cursor-pointer">
                                {isWorking('packed') ? 'Generating...' : 'Generate'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Save Draft Modal
const SaveDraftModal: React.FC<{
    crateCount: number;
    onSave: (name: string) => void;
    onExport: (name: string) => void;
    onClose: () => void;
}> = ({ crateCount, onSave, onExport, onClose }) => {
    const [name, setName] = React.useState(`Load ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}`);
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-white/15 p-6 flex flex-col gap-5"
                style={{ background: 'rgba(12,12,18,0.95)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-[14px] font-black uppercase tracking-tight text-white">Save Draft</h3>
                        <p className="text-[10px] text-white/40 mt-0.5">{crateCount} crates · positions + thumbnail</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white cursor-pointer"><X size={16} /></button>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Draft Name</label>
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); if (e.key === 'Escape') onClose(); }}
                        className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2.5 text-[13px] font-black text-white outline-none focus:border-white/40 transition-colors"
                        placeholder="e.g. Monday AM Load"
                    />
                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">Exports as <span className="text-white/40">.truckload</span> · includes map thumbnail · shareable</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-[10px] font-black text-white/40 hover:text-white hover:border-white/20 transition-all cursor-pointer">
                        Cancel
                    </button>
                    <button
                        onClick={() => name.trim() && onExport(name.trim())}
                        disabled={!name.trim()}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/30 transition-all cursor-pointer disabled:opacity-30"
                        title="Export as .truckload file (includes thumbnail)"
                    >
                        <Download size={12} />Export
                    </button>
                    <button
                        onClick={() => name.trim() && onSave(name.trim())}
                        disabled={!name.trim()}
                        className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40"
                        style={{ background: 'var(--main-color)', color: '#000' }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

// Open Draft Modal
const OpenDraftModal: React.FC<{
    onLoad: (draft: TruckDraft) => void;
    onClose: () => void;
}> = ({ onLoad, onClose }) => {
    const [drafts, setDrafts] = React.useState<TruckDraft[]>(getDrafts);
    const [preview, setPreview] = React.useState<string | null>(null); // thumbnail on hover import
    const importRef = React.useRef<HTMLInputElement>(null);
    const handleDelete = (id: string) => { deleteDraft(id); setDrafts(getDrafts()); };
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const draft = await importDraftFile(file);
        if (!draft) { toast.error('Invalid .truckload file'); return; }
        saveDraft(draft);
        setDrafts(getDrafts());
        toast.success(`Imported "${draft.name}"`);
        e.target.value = '';
    };
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-white/15 flex flex-col overflow-hidden"
                style={{ background: 'rgba(12,12,18,0.95)', maxHeight: '82vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <div>
                        <h3 className="text-[14px] font-black uppercase tracking-tight text-white">Load Drafts</h3>
                        <p className="text-[10px] text-white/40">{drafts.length} saved · <span className="text-white/20">.truckload</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                        <input ref={importRef} type="file" accept={`${TRUCKLOAD_EXT},.json`} className="hidden" onChange={handleImport} />
                        <button
                            onClick={() => importRef.current?.click()}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/30 transition-all cursor-pointer"
                            title="Import a .truckload file"
                        ><Upload size={12} />Import</button>
                        <button onClick={onClose} className="text-white/30 hover:text-white cursor-pointer"><X size={16} /></button>
                    </div>
                </div>
                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {drafts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-white/20">
                            <Truck size={32} strokeWidth={0.8} />
                            <p className="text-[11px] font-black uppercase tracking-widest mt-3">No saved drafts</p>
                            <p className="text-[9px] text-white/15 mt-1">Import a .truckload file to get started</p>
                        </div>
                    ) : (
                        <div className="flex flex-col divide-y divide-white/5">
                            {drafts.map(draft => (
                                <div key={draft.id}
                                    className="flex flex-col hover:bg-white/3 transition-colors group cursor-default"
                                    onMouseEnter={() => draft.thumbnail ? setPreview(draft.thumbnail) : setPreview(null)}
                                    onMouseLeave={() => setPreview(null)}
                                >
                                    {/* Thumbnail strip — shown on hover if available */}
                                    {draft.thumbnail && (
                                        <div className="overflow-hidden transition-all" style={{ maxHeight: preview === draft.thumbnail ? '90px' : '0', opacity: preview === draft.thumbnail ? 1 : 0 }}>
                                            <img src={draft.thumbnail} alt={draft.name} className="w-full object-cover" style={{ height: '88px', filter: 'brightness(0.9)' }} />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-4 px-5 py-3">
                                        {/* Mini thumbnail badge */}
                                        {draft.thumbnail ? (
                                            <img src={draft.thumbnail} alt="" className="w-14 h-7 rounded object-cover shrink-0 border border-white/10" />
                                        ) : (
                                            <div className="w-14 h-7 rounded shrink-0 border border-white/8 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                <Truck size={12} className="text-white/20" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-black text-white truncate">{draft.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[9px] text-white/30 font-black">{draft.crateCount} crates</span>
                                                <span className="text-[9px] text-white/20">{new Date(draft.savedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                                                {draft.thumbnail && <span className="text-[8px] text-emerald-500/60 font-black uppercase tracking-widest">📷 thumb</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => exportDraftFile(draft)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white transition-all cursor-pointer" title="Export .truckload"><Download size={13} /></button>
                                            <button onClick={() => handleDelete(draft.id)} className="opacity-0 group-hover:opacity-100 text-rose-400/60 hover:text-rose-400 transition-all cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                                            <button onClick={() => { onLoad(draft); onClose(); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all" style={{ background: 'var(--main-color)', color: '#000' }}>Load</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
    const [viewMode, setViewMode] = useAtom(truckViewModeAtom);
    const [isCompact, setIsCompact] = useAtom(truckIsCompactAtom);
    const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
    const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
    const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);

    useEffect(() => {
        const map: Record<string, { x: number; y: number; r: number; z?: number }> = {};
        docs.forEach(d => {
            if (d.description?.includes('POS:')) {
                const m = d.description.match(/POS:(\d+),(\d+),(\d+)(?:,Z(\d+))?/);
                if (m) map[d.id] = { x: +m[1], y: +m[2], r: +m[3], z: m[4] ? +m[4] : 0 };
            }
        });
        setPositions(map);
    }, [docs]);

    const allCrates = useMemo(() => docs.filter(d => ['crate', 'pallet', 'cardboard'].includes(d.type) && ['Packed', 'Partial', 'In Transit'].includes(d.status)), [docs]);
    const dockCrates = useMemo(() => allCrates.filter(c => !positions[c.id]), [allCrates, positions]);
    const truckCrates = useMemo(() => allCrates.filter(c => !!positions[c.id]), [allCrates, positions]);
    const totalWeight = useMemo(() => truckCrates.reduce((s, c) => s + computeCrateWeight(c, allInventory), 0), [truckCrates, allInventory]);
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

    // Smart auto-position: pack from FRONT (cab, right side x≈TRUCK_L_CM) toward rear, row-by-row
    const computeAutoPosition = useCallback((crate: any, currentPositions: Record<string, {x:number;y:number;r:number}>, allCrates: any[]) => {
        const W = crate.width_cm;
        const D = crate.length_cm;
        const PAD = 5; // 5cm padding between crates
        const MARGIN = 10;
        // Collect occupied rects [{x,y,w,d}] in canvas space
        const occupied = allCrates
            .filter(c => currentPositions[c.id])
            .map(c => {
                const p = currentPositions[c.id];
                const rotated = p.r === 90;
                return { x: p.x, y: p.y, w: rotated ? c.length_cm : c.width_cm, d: rotated ? c.width_cm : c.length_cm };
            });
        // Scan from front (high x) to rear (low x), left-to-right in y
        const stepX = Math.max(10, Math.floor(W / 2));
        const stepY = Math.max(10, Math.floor(D / 2));
        for (let xi = TRUCK_L_CM - W - MARGIN; xi >= MARGIN; xi -= stepX) {
            for (let yi = MARGIN; yi <= TRUCK_W_CM - D - MARGIN; yi += stepY) {
                const fits = !occupied.some(o =>
                    xi < o.x + o.w + PAD && xi + W + PAD > o.x &&
                    yi < o.y + o.d + PAD && yi + D + PAD > o.y
                );
                if (fits) return { x: xi, y: yi, r: 0 };
            }
        }
        // Fallback: stack at front edge
        return { x: Math.max(MARGIN, TRUCK_L_CM - W - MARGIN), y: MARGIN, r: 0 };
    }, []);

    const handleLoad = (id: string) => {
        const crate = allCrates.find(c => c.id === id);
        if (!crate) return;
        const pos = computeAutoPosition(crate, positions, allCrates);
        setPositions(p => ({ ...p, [id]: { ...pos, z: 0 } }));
        setSelectedId(id);
    };
    const handleUnload = (id: string) => { setPositions(p => { const n = { ...p }; delete n[id]; return n; }); setSelectedId(null); };
    const handleUpdatePos = (id: string, x: number, y: number) => setPositions(p => ({ ...p, [id]: { ...p[id], x, y } }));
    // Side-view drag: updates longitudinal (x) and vertical stack (z)
    const handleUpdateXZ = (id: string, x: number, z: number) => setPositions(p => ({ ...p, [id]: { ...p[id], x: Math.max(0, Math.min(TRUCK_L_CM - (p[id] ? (p[id].r === 90 ? allCrates.find(c=>c.id===id)?.length_cm : allCrates.find(c=>c.id===id)?.width_cm) || 0 : 0), x)), z: Math.max(0, z) } }));
    // Stack: place selected crate on top of the tallest crate overlapping its x position
    const handleStack = (id: string) => {
        const crate = allCrates.find(c => c.id === id);
        if (!crate || !positions[id]) return;
        const rotated = positions[id].r === 90;
        const myW = rotated ? crate.length_cm : crate.width_cm;
        const myX = positions[id].x;
        // Find highest z+h of any crate overlapping the same x zone
        let topZ = 0;
        truckCrates.forEach(c => {
            if (c.id === id) return;
            const p = positions[c.id];
            if (!p) return;
            const cRot = p.r === 90;
            const cW = cRot ? c.length_cm : c.width_cm;
            const overlap = myX < p.x + cW + 5 && myX + myW + 5 > p.x;
            if (overlap) {
                const top = (p.z || 0) + (c.height_cm || 100);
                if (top > topZ) topZ = top;
            }
        });
        setPositions(p => ({ ...p, [id]: { ...p[id], z: topZ } }));
        toast.success(`Stacked at ${topZ}cm above floor`, { icon: '📦' });
    };
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
                const w = computeCrateWeight(c, allInventory);
                return { id: c.id, label, pos: `${Math.round(pos.x)}cm, ${Math.round(pos.y)}cm`, rot: pos.r === 90 ? '90°' : '0°', w_cm: c.width_cm, l_cm: c.length_cm, h_cm: c.height_cm, weight: w, type: c.type, items };
            });

            // 3. Generate truck map SVG (800×120px, scale=0.5)
            const svgScale = 0.5;
            const svgW = Math.round(TRUCK_L_CM * BASE_SCALE * svgScale);
            const svgH = Math.round(TRUCK_W_CM * BASE_SCALE * svgScale);
            const crateRects = crateData.map(cd => {
                const dimX = cd.rot === '90°' ? cd.w_cm : cd.l_cm;
                const dimY = cd.rot === '90°' ? cd.l_cm : cd.w_cm;
                const px = Math.round(parseFloat(cd.pos.split(',')[0].trim().replace('cm',''))) * BASE_SCALE * svgScale;
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
<div class="kv"><div><span>TRAILER</span><strong>53' &mdash; ${TRUCK_L_CM}cm × ${TRUCK_W_CM}cm</strong></div><div><span>UNITS LOADED</span><strong>${truckCrates.length} / ${allCrates.length}</strong></div><div><span>TOTAL PAYLOAD</span><strong>${Math.round(panelStats.payloadPct < 1 ? 0 : (panelStats.payloadPct / 100 * panelStats.MAX_KG))} KG</strong></div><div><span>FLOOR USED</span><strong>${floorPct}%</strong></div><div><span>STATUS</span><strong>${panelStats.status}</strong></div></div>
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

    // ── Draft handlers ──
    const buildDraft = useCallback((name: string): TruckDraft => {
        const thumbnail = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
        return { id: `draft_${Date.now()}`, name, savedAt: Date.now(), crateCount: truckCrates.length, positions: { ...positions }, thumbnail: thumbnail || undefined };
    }, [positions, truckCrates, allCrates, allInventory]);

    const handleSaveDraft = useCallback((name: string) => {
        saveDraft(buildDraft(name));
        setShowSaveDraft(false);
        toast.success(`Draft "${name}" saved`);
    }, [buildDraft]);

    const handleExportDraft = useCallback((name: string) => {
        exportDraftFile(buildDraft(name));
        setShowSaveDraft(false);
    }, [buildDraft]);

    const handleLoadDraft = useCallback((draft: TruckDraft) => {
        setPositions(draft.positions as any);
        toast.success(`Loaded draft "${draft.name}"`);
    }, []);

    const canvasW = TRUCK_L_CM * BASE_SCALE;
    const canvasH = TRUCK_W_CM * BASE_SCALE;

    // ── Touch pinch-zoom ──
    const canvasRef = useRef<HTMLDivElement>(null);
    const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
            }
        };
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && pinchRef.current) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const newDist = Math.hypot(dx, dy);
                const scale = newDist / pinchRef.current.dist;
                setZoom(Math.max(0.2, Math.min(3, pinchRef.current.zoom * scale)));
            }
        };
        const onTouchEnd = () => { pinchRef.current = null; };
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [zoom]);

    return (
        <div className="flex flex-col h-full text-white overflow-hidden relative" onClick={() => setSelectedId(null)}>

            {/* ── HORIZONTAL DOCK STRIP ── */}
            <div
                className="shrink-0 border-b border-white/8 backdrop-blur-xl"
                style={{ background: 'rgba(255,255,255,0.03)' }}
                onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
            >
                {dockCrates.length === 0 ? (
                    <div className="flex items-center gap-3 px-6 py-3 text-white/10">
                        <Truck size={14} strokeWidth={0.8} />
                        <span className="text-[9px] font-black uppercase tracking-[0.3em]">All units loaded</span>
                    </div>
                ) : isCompact ? (
                    /* ── COMPACT dock strip: small pill chips ── */
                    <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none' }}>
                        <div className="flex flex-col items-center justify-center px-3 shrink-0 border-r border-white/8 mr-1">
                            <span className="text-lg font-black tracking-tighter text-white/60">{dockCrates.length}</span>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/20">stg</span>
                        </div>
                        {dockCrates.map(c => {
                            const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
                            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#e5e7eb') : '#e5e7eb';
                            const w = computeCrateWeight(c, allInventory);
                            const typeLabel = c.type === 'pallet' ? 'PLT' : c.type === 'cardboard' ? 'BOX' : 'CRT';
                            return (
                                <button key={c.id} onClick={() => handleLoad(c.id)}
                                    title={`Load ${label}`}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border shrink-0 cursor-pointer active:scale-95 transition-all"
                                    style={{ background: `${col}12`, borderColor: `${col}35` }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${col}28`; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${col}12`; }}
                                >
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col }} />
                                    <span className="text-[11px] font-black uppercase tracking-tight" style={{ color: col }}>{label}</span>
                                    <span className="text-[8px] font-black text-white/30">{typeLabel}</span>
                                    <span className="text-[8px] text-white/20 font-black">{w}KG</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    /* ── EXPANDED dock strip: large DockCards ── */
                    <div className="flex items-stretch gap-1 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}>
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

                {/* ══ FIXED HEADER PANEL ══ */}
                <div
                    className="shrink-0 px-6 pt-3 pb-3 flex flex-col gap-3 backdrop-blur-xl border-b border-white/6"
                    style={{ background: 'rgba(10,10,15,0.7)' }}
                    onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
                >
                    {/* Row 1: title + view toggle + zoom controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-3">
                            <h2 className="text-xl font-black uppercase tracking-tighter text-white">53' Trailer</h2>
                            <span className="text-[9px] font-black text-white/40">{Math.round(zoom * 100)}%</span>
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{TRUCK_L_CM}cm × {TRUCK_W_CM}cm</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Top / Side single-icon toggle */}
                            <button
                                onClick={() => setViewMode(v => v === 'top' ? 'side' : 'top')}
                                title={viewMode === 'top' ? 'Switch to Side View' : 'Switch to Top View'}
                                className="text-white/40 hover:text-white transition-colors cursor-pointer"
                            >
                                {viewMode === 'top' ? <Layers size={16} /> : <Grid3x3 size={16} />}
                            </button>
                            {/* Zoom controls */}
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="text-white/50 hover:text-white transition-colors cursor-pointer" title="Zoom out"><ZoomOut size={15} /></button>
                                <button onClick={() => setZoom(1.0)} className="text-white/30 hover:text-white transition-colors cursor-pointer text-[8px] font-black w-8 text-center" title="Reset">{Math.round(zoom*100)}%</button>
                                <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="text-white/50 hover:text-white transition-colors cursor-pointer" title="Zoom in"><ZoomIn size={15} /></button>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: stats — compact = single row chips, expanded = full metrics */}
                    {isCompact ? (
                        /* ── COMPACT stats row ── */
                        <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Units</span>
                                <span className="text-[13px] font-black text-emerald-400">{truckCrates.length}</span>
                                <span className="text-[9px] text-white/30">/ {allCrates.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">KG</span>
                                <span className="text-[13px] font-black" style={{ color: panelStats.statusColor }}>{Math.round(totalWeight).toLocaleString()}</span>
                                <span className="text-[9px] text-white/30">{panelStats.payloadPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Floor</span>
                                <span className="text-[13px] font-black text-white/80">{floorPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Vol</span>
                                <span className="text-[13px] font-black text-white/80">{panelStats.volPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0" style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${panelStats.statusColor}40` }}>
                                <span className="text-[11px] font-black uppercase" style={{ color: panelStats.statusColor }}>{panelStats.status}</span>
                            </div>
                            {/* Mini dist bar */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0 min-w-[120px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Dist</span>
                                <div className="flex h-1.5 gap-0.5 rounded overflow-hidden flex-1">
                                    <div className="h-full bg-emerald-500/80 rounded-l" style={{ flex: panelStats.rPct || 1 }} />
                                    <div className="h-full bg-emerald-400/50" style={{ flex: panelStats.mPct || 1 }} />
                                    <div className="h-full bg-emerald-300/30 rounded-r" style={{ flex: panelStats.fPct || 1 }} />
                                </div>
                                <span className="text-[8px] text-white/30 shrink-0">{panelStats.rPct}/{panelStats.mPct}/{panelStats.fPct}</span>
                            </div>
                        </div>
                    ) : (
                        /* ── EXPANDED stats row ── */
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
                        {/* Distribution */}
                        <div className="flex flex-col gap-2 shrink-0" style={{ minWidth: 320 }}>
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/25">Load Distribution</span>
                            <div className="flex h-3 gap-0.5 rounded overflow-hidden">
                                <div className="h-full bg-emerald-500/80 rounded-l transition-all duration-700" style={{ flex: panelStats.rPct || 1 }} />
                                <div className="h-full bg-emerald-400/50 transition-all duration-700" style={{ flex: panelStats.mPct || 1 }} />
                                <div className="h-full bg-emerald-300/30 rounded-r transition-all duration-700" style={{ flex: panelStats.fPct || 1 }} />
                            </div>
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
                    )}

                 </div>


                {/* Canvas / Side View */}
                <div
                    ref={canvasRef}
                    className="flex-1 overflow-auto custom-scrollbar"
                    style={{ background: 'rgba(5,5,8,0.85)', touchAction: 'pan-x pan-y' }}
                    onWheel={handleWheel}
                >
                    {viewMode === 'side' ? (
                        <SideView
                            truckCrates={truckCrates} positions={positions}
                            allCrates={allCrates} allInventory={allInventory}
                            zoom={zoom}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onUpdateXZ={handleUpdateXZ}
                            onStack={handleStack}
                            onUnload={handleUnload}
                        />
                    ) : (
                    <div className="p-8" style={{ minWidth: canvasW * zoom + 64, minHeight: canvasH * zoom + 64 }}>
                        {/* Direction labels */}
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full border border-white/30 shrink-0" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">Rear Door</span>
                            <div className="flex-1 h-px bg-white/8" />
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20">{TRUCK_L_CM}cm × {TRUCK_W_CM}cm</span>
                            <div className="flex-1 h-px bg-white/8" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">Cab Front</span>
                            <div className="w-2 h-2 rounded-full bg-white/40 shrink-0" />
                        </div>
                        <div style={{ width: canvasW * zoom, height: canvasH * zoom, position: 'relative' }}>
                            <div
                                className="absolute top-0 left-0 border border-white/15"
                                style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})`, transformOrigin: 'top left', background: 'rgba(255,255,255,0.025)' }}
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
                    )}
                </div>
            </div>


            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 99px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 99px; border: 1px solid rgba(255,255,255,0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
                .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
            `}</style>
            {showSaveDraft && (
                <SaveDraftModal
                    crateCount={truckCrates.length}
                    onSave={handleSaveDraft}
                    onExport={handleExportDraft}
                    onClose={() => setShowSaveDraft(false)}
                />
            )}
            {showOpenDraft && (
                <OpenDraftModal
                    onLoad={handleLoadDraft}
                    onClose={() => setShowOpenDraft(false)}
                />
            )}
            {showExportModal && (
                <TruckExportModal
                    truckCrates={truckCrates}
                    allCrates={allCrates}
                    allInventory={allInventory}
                    positions={positions}
                    onClose={() => setShowExportModal(false)}
                />
            )}
        </div>
    );
};
