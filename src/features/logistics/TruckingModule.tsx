import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { Truck, Box, Trash2, RotateCcw, Info, ChevronRight, Loader2, Gauge, ZoomIn, ZoomOut, Maximize2, Layers, Grid3x3, PanelTop, PanelTopClose, FolderOpen, Save, X, Download, Upload, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, FileText, FileSpreadsheet, Image as ImageIcon, LayoutGrid, Plus, Shield, IdCard, ClipboardCheck, Hash, Move, Globe, Share2, List } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { generatePackingListHtml } from './generatePackingListHtml';
import { generatePackingListXlsx } from '../../lib/xlsxUtils';
import { useDatabase } from '../../lib/hooks';
import { exchangeRateAtom, isDummyModeAtom, cratesVersionAtom, inventoryAtom, truckReadyTriggerAtom, truckIsBusyAtom, truckViewModeAtom, truckIsCompactAtom, truckShowSaveDraftAtom, truckShowOpenDraftAtom, truckShowExportModalAtom, truckShowReadyWizardAtom } from '../../lib/atoms';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, getCrateDisplayName } from '../../lib/utils';
import ExcelJS from 'exceljs';
import { exportCrateManifesto, ManifestoItem, exportCombinedTruckManifesto, ManifestoMeta } from '../../lib/crateManifesto';

const TRUCK_L_CM = 1615;
const TRUCK_W_CM = 244;
const BASE_SCALE = 1.5; // px/cm — canvas is 2422 × 366 px at zoom=1

// getCrateDisplayName moved to utils.tsx



function getTruckCrateNumbering(truckCrates: any[], positions: Record<string, any>) {
    const sorted = [...truckCrates].sort((a, b) => {
        const pa = positions[a.id];
        const pb = positions[b.id];
        if (!pa || !pb) return 0;
        // Front to Rear: X desc
        if (Math.abs(pb.x - pa.x) > 5) return pb.x - pa.x;
        // Left to Right: Y asc
        if (Math.abs(pa.y - pb.y) > 5) return pa.y - pb.y;
        // Bottom to Top: Z asc
        return (pa.z || 0) - (pb.z || 0);
    });
    const map: Record<string, number> = {};
    sorted.forEach((c, i) => { map[c.id] = i + 1; });
    return map;
}

// ─── Weight: sum item.weight_kg × qty from inventory_ids ─────────────────────
function computeCrateWeight(crate: any, allInventory: any[], allCrates: any[], visited = new Set<string>()): number {
    if (!crate || visited.has(crate.id)) return 0;
    visited.add(crate.id);

    let total = 0;
    let hasData = false;
    
    // 1. Direct items
    if (crate.inventory_ids) {
        crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
            const [id, qtyStr] = e.split(':');
            const qty = parseInt(qtyStr || '1', 10) || 1;
            const inv = allInventory.find((i: any) => String(i.row) === id);
            const w = inv?.data?.weight_kg ?? inv?.data?.weightKg;
            if (w != null && !isNaN(Number(w))) {
                total += Number(w) * qty;
                hasData = true;
            }
        });
    }

    // 2. Nested units
    const nested = allCrates.filter(c => c.parent_id === crate.id);
    nested.forEach(n => {
        total += computeCrateWeight(n, allInventory, allCrates, visited);
        hasData = true;
    });

    if (hasData) return Math.round(total * 10) / 10;
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
const DockCard: React.FC<{ crate: any; allCrates: any[]; allInventory: any[]; onLoad: () => void; onNest?: () => void }> = ({ crate, allCrates, allInventory, onLoad, onNest }) => {
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#e5e7eb') : '#e5e7eb';
    const itemCount = (crate.inventory_ids || '').split(',').filter(Boolean).length;
    const w = computeCrateWeight(crate, allInventory, allCrates);
    const typeLabel = crate.type === 'pallet' ? 'PLT' : crate.type === 'cardboard' ? 'BOX' : 'CRT';
    return (
        <button
            onClick={onLoad}
            title={`Load ${label} onto truck`}
            className="flex flex-col gap-1.5 p-2.5 rounded-xl transition-all group shrink-0 text-left border-2 cursor-pointer active:scale-[0.97] shadow-lg"
            style={{
                minWidth: 130, maxWidth: 150,
                background: `${primaryColor}15`,
                borderColor: `${primaryColor}40`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${primaryColor}28`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${primaryColor}80`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${primaryColor}15`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${primaryColor}40`; }}
        >
            {/* Top row: wireframe + type badge */}
            <div className="flex items-start justify-between w-full mb-0">
                <CrateWireframe w={crate.width_cm} l={crate.length_cm} h={crate.height_cm || crate.width_cm} color={primaryColor} size={60} />
                <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-black/40 text-white border border-white/10">
                        {typeLabel}
                    </span>
                </div>
            </div>
            {/* Label */}
            <div className="flex items-center gap-2 flex-wrap">
                {vendorList.map(v => (
                    <div key={v} className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }} />
                ))}
                <span className="text-[14px] font-black uppercase tracking-tighter leading-none truncate flex-1" style={{ color: primaryColor }}>
                    {label}
                </span>
            </div>
            {/* Dims & Vol */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                    {crate.width_cm}×{crate.length_cm}×{crate.height_cm || '?'} CM
                </span>
                <span className="text-[9px] font-bold text-white/20 uppercase">
                    Vol: {Math.round((crate.width_cm * crate.length_cm * (crate.height_cm||100))/1000)} Liters
                </span>
            </div>
            {/* Bottom stats */}
            <div className="flex items-center justify-between w-full pt-2 border-t border-white/10 mt-1">
                <div className="flex flex-col">
                    <span className="text-[11px] font-black text-white">{itemCount} SKU</span>
                    <span className="text-[8px] text-white/40 uppercase font-bold">In Inventory</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[14px] font-black" style={{ color: primaryColor }}>{w} KG</span>
                    <span className="text-[8px] text-white/40 uppercase font-bold">Estimated</span>
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
    truckSeq?: number;
    isSelected: boolean; zoom: number;
    onSelect: () => void; onUpdatePos: (x: number, y: number) => void;
    onRotate: () => void; onUnload: () => void; onNest?: () => void;
}> = ({ crate, allCrates, allInventory, pos, truckSeq, isSelected, zoom, onSelect, onUpdatePos, onRotate, onUnload, onNest }) => {
    const { label, subtitle, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory, truckSeq), [crate, allCrates, allInventory, truckSeq]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
    const isDraggingRef = useRef(false);

    const children = useMemo(() => allCrates.filter(c => c.parent_id === crate.id), [allCrates, crate.id]);

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
            const nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox + (me.clientX - sx) / (zoom * BASE_SCALE)));
            const ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + (me.clientY - sy) / (zoom * BASE_SCALE)));
            onUpdatePos(nx, ny);
        };
        const onUp = () => { isDraggingRef.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    }, [pos.x, pos.y, dimX, dimY, zoom, onSelect, onUpdatePos]);

    const iconSize = Math.min(pxX, pxY) * 0.38;
    const textScale = Math.max(10, Math.min(22, pxX / 8));

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
                    {onNest && crate.type === 'cardboard' && (
                        <button onClick={e => { e.stopPropagation(); onNest(); }} className="px-3 py-1 rounded bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors flex items-center gap-1 shadow-lg" title="Nest into Crate/Pallet">
                            <Box size={12} /> NEST
                        </button>
                    )}
                </div>
            )}
            <div
                onMouseDown={handleMouseDown}
                className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col items-center justify-center overflow-hidden relative group"
                style={{
                    backgroundColor: primaryColor,
                    outline: isSelected ? `3px solid #fff` : `1px solid rgba(0,0,0,0.3)`,
                    boxShadow: isSelected ? `0 0 0 1px rgba(255,255,255,0.3), 0 8px 30px rgba(0,0,0,0.5)` : `0 4px 12px rgba(0,0,0,0.4)`,
                }}
            >
                {/* Visual children indicator */}
                {children.length > 0 && (
                    <div className="absolute inset-1 border border-black/10 rounded flex flex-wrap gap-1 p-1 content-start pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                        {children.map(child => {
                            const { vendorList } = getCrateDisplayName(child, allCrates, allInventory);
                            const vStr = vendorList.join('') || 'BX';
                            return (
                                <div key={child.id} className="px-1.5 py-0.5 rounded-sm bg-black/20 text-[6px] font-black text-white uppercase tracking-tighter border border-white/5">
                                    {vStr}
                                </div>
                            );
                        })}
                    </div>
                )}

                <Box size={iconSize} strokeWidth={0.6} color="rgba(0,0,0,0.4)" className="pointer-events-none" />
                {pxX > 30 && (
                    <div className="flex flex-col items-center pointer-events-none w-full">
                        <span className="font-black uppercase text-center px-1 mt-0.5 truncate w-full text-black/90"
                            style={{ fontSize: textScale * 1.5 }}>
                            {label}
                        </span>
                        {vendorList.length > 1 && (
                            <span className="font-black opacity-60 uppercase text-center px-1 -mt-0.5 truncate w-full text-black/80"
                                style={{ fontSize: textScale * 0.9 }}>
                                MIXED
                            </span>
                        )}
                    </div>
                )}
                {pxX > 50 && pxY > 20 && (
                    <span className="font-black pointer-events-none text-black/60" style={{ fontSize: Math.max(9, textScale) }}>
                        {computeCrateWeight(crate, allInventory, allCrates)} KG
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
    truckNumbering: Record<string, number>;
    allCrates: any[]; allInventory: any[];
    zoom: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onUpdateXZ: (id: string, x: number, z: number) => void;
    onStack: (id: string) => void;
    onUnload: (id: string) => void;
}> = ({ truckCrates, positions, truckNumbering, allCrates, allInventory, zoom, selectedId, onSelect, onUpdateXZ, onStack, onUnload }) => {
    const SVG_W = TRUCK_L_CM * BASE_SCALE;
    const SVG_H = TRUCK_H_CM * BASE_SCALE;
    const svgRef = useRef<SVGSVGElement>(null);

    // Build crate draw list with z support (Render all crates that have a position)
    const crateItems = useMemo(() => truckCrates.filter(c => !!positions[c.id]).map(c => {
        const pos = positions[c.id];
        if (!pos) return null;
        const rotated = pos.r === 90;
        const lenX = rotated ? c.width_cm : c.length_cm;
        const h = c.height_cm || 100;
        const zOff = pos.z || 0;
        const px = pos.x * BASE_SCALE;
        const pw = lenX * BASE_SCALE;
        const ph = h * BASE_SCALE;
        const py = SVG_H - (zOff + h) * BASE_SCALE;
        const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
        const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#a1a1aa') : '#a1a1aa';
        const isSelected = c.id === selectedId;
        
        // Find children for side-view rendering
        const childCrates = allCrates.filter(child => child.parent_id === c.id);

        return { id: c.id, px, py, pw, ph, label, subtitle, col, h, lenX, zOff, isSelected, crate: c, children: childCrates };
    }).filter(Boolean) as any[], [truckCrates, positions, allCrates, allInventory, selectedId, truckNumbering]);

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
        <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 backdrop-blur-2xl border-t border-white/5 shadow-inner">
            <div className="p-6" style={{ minWidth: SVG_W * zoom + 48, minHeight: SVG_H * zoom + 120 }}>
                {/* Header bar */}
                <div className="flex items-center gap-6 mb-6 px-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-white/20" /> ◀ Rear
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] font-black text-white/70 uppercase tracking-[0.6em] italic">
                        Trailer Matrix — {TRUCK_L_CM}cm × {TRUCK_H_CM}cm H
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                        Front ▶ <span className="w-1 h-1 rounded-full bg-white/20" />
                    </span>
                </div>
                {/* Selected crate toolbar */}
                {selectedId && positions[selectedId] && (() => {
                    const sel = truckCrates.find(c => c.id === selectedId);
                    const pos = positions[selectedId];
                    return sel ? (
                        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-3xl shadow-2xl">
                            <span className="text-[10px] font-black text-white/80 uppercase tracking-wide flex-1">
                                {(() => {
                                    const { label, subtitle } = getCrateDisplayName(sel, allCrates, allInventory, truckNumbering[sel.id]);
                                    return `${label}${subtitle ? ` (${subtitle})` : ''}`;
                                })()}
                                <span className="text-white/30 ml-2">X:{Math.round(pos.x)}cm  Z:{Math.round(pos.z||0)}cm</span>
                            </span>
                            <button onClick={() => onStack(selectedId)}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] cursor-pointer transition-all bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/5">
                                <Layers size={13} /> Stack on Top
                            </button>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-xl border border-white/10">
                                <button onClick={() => onUpdateXZ(selectedId, pos.x, Math.max(0, (pos.z||0) - (sel.height_cm||100)))}
                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer" title="Move Down"><ArrowDown size={14} /></button>
                                <button onClick={() => onUpdateXZ(selectedId, pos.x, (pos.z||0) + (sel.height_cm||100))}
                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer" title="Move Up"><ArrowUp size={14} /></button>
                                <div className="w-px h-3 bg-white/10 mx-0.5" />
                                <button onClick={() => onUpdateXZ(selectedId, Math.max(0, pos.x - 50), pos.z||0)}
                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer" title="Move Rear"><ArrowLeft size={14} /></button>
                                <button onClick={() => onUpdateXZ(selectedId, pos.x + 50, pos.z||0)}
                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer" title="Move Front"><ChevronRight size={14} /></button>
                            </div>
                            <button onClick={() => onUnload(selectedId)}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:scale-105 active:scale-95 shadow-lg shadow-rose-500/5">
                                <Trash2 size={13} /> Remove
                            </button>
                        </div>
                    ) : null;
                })()}
                <div style={{ width: SVG_W * zoom, height: SVG_H * zoom, position: 'relative' }}>
                    <svg ref={svgRef} width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', overflow: 'visible', cursor: 'default' }}>
                        {/* Trailer shell */}
                        <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} rx={8} />
                        {/* Floor */}
                        <rect x={0} y={SVG_H - 8} width={SVG_W} height={8} fill="rgba(255,255,255,0.08)" />
                        <line x1={0} y1={SVG_H - 8} x2={SVG_W} y2={SVG_H - 8} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
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
                                {/* Selection Glow & Shadow */}
                                {cr.isSelected && (
                                    <>
                                        <rect x={cr.px - 4} y={cr.py - 4} width={cr.pw + 8} height={cr.ph + 8} fill="white" opacity={0.15} filter="blur(12px)" rx={8} />
                                        <rect x={cr.px + 4} y={cr.py + 4} width={cr.pw} height={cr.ph} fill="rgba(0,0,0,0.5)" rx={4} />
                                    </>
                                )}
                                {/* Body — full solid color */}
                                <rect x={cr.px} y={cr.py} width={cr.pw} height={cr.ph}
                                    fill={cr.col}
                                    stroke={cr.isSelected ? 'white' : 'rgba(0,0,0,0.4)'}
                                    strokeWidth={cr.isSelected ? 2.5 : 1.5}
                                    rx={4} opacity={cr.isSelected ? 1 : 0.92} />
                                {/* Selection ring */}
                                {cr.isSelected && <rect x={cr.px - 2} y={cr.py - 2} width={cr.pw + 4} height={cr.ph + 4}
                                    fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} rx={4} strokeDasharray="4,3" />}
                                {/* Label — dark text over solid fill for contrast */}
                                {cr.pw > 18 && cr.ph > 16 && (
                                    <text x={cr.px + cr.pw / 2} y={cr.py + cr.ph / 2 + 3}
                                        textAnchor="middle" fontSize={Math.min(10, cr.pw / 4.2)} fill="rgba(0,0,0,0.85)"
                                        fontFamily="monospace" fontWeight="900" opacity={0.95}>
                                        {cr.label}
                                        {cr.subtitle && (
                                            <tspan x={cr.px + cr.pw / 2} dy={12} fontSize={Math.min(9, cr.pw / 5)} opacity={0.6} fontWeight="normal">
                                                {cr.subtitle}
                                            </tspan>
                                        )}
                                    </text>
                                )}
                                {cr.ph > 28 && (
                                    <text x={cr.px + cr.pw / 2} y={cr.py + cr.ph / 2 + 17}
                                        textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.6)"
                                        fontFamily="monospace" opacity={0.9}>
                                        {cr.h}H {cr.zOff > 0 ? `+${Math.round(cr.zOff)}Z` : ''}
                                        {cr.children.length > 0 ? ` [${cr.children.length} BX]` : ''}
                                    </text>
                                )}
                                {/* Stack level indicator dot */}
                                {cr.zOff > 0 && (
                                    <circle cx={cr.px + 8} cy={cr.py + 8} r={5} fill={cr.col} opacity={0.9} />
                                )}
                            </g>
                        ))}
                        {/* Cab block */}
                        <rect x={SVG_W - 12} y={0} width={12} height={SVG_H} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} rx={2} />
                        <text x={SVG_W - 6} y={SVG_H / 2} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.25)" fontFamily="monospace" fontWeight="black"
                            transform={`rotate(-90, ${SVG_W - 6}, ${SVG_H / 2})`}>FRONT (CAB)</text>
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
    numbering?: Record<string, number>;
    thumbnail?: string; // base64 JPEG data URL
    shipmentData?: {
        sealNumber: string;
        tractorNumber: string;
        truckPlates: string;
        trailerNumber: string;
        trailerPlates: string;
        senders: string[];
        packingItems: Array<{ name: string; count: number; weight: number }>;
    };
}
interface TruckloadFile {
    version: number;
    type: 'onyx-truckload';
    name: string;
    savedAt: number;
    crateCount: number;
    positions: Record<string, { x: number; y: number; r: number; z?: number }>;
    numbering?: Record<string, number>;
    thumbnail?: string;
    shipmentData?: TruckDraft['shipmentData'];
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
    
    // Trailer floor (Light gray background)
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, W, H);
    
    // Cab end marker
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, 6, H);
    
    // Pre-calculate numbering for performance
    const numbering = getTruckCrateNumbering(truckCrates, positions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    // Crates - Solid Fills
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate || crate.parent_id) continue; // Skip nested boxes
        
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const lenY = (pos.r === 0 ? (crate.width_cm || 80) : (crate.length_cm || 120)) * scale;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[crate.id]);
        const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        
        // Solid Fill
        ctx.fillStyle = primaryColor + 'D0'; // ~80% opacity solid
        ctx.fillRect(pos.x * scale, pos.y * scale, lenX, lenY);

        // Border
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x * scale, pos.y * scale, lenX, lenY);
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('ONYX · TRUCKLOAD TOP VIEW', 40, H - 40);
    
    // Cab end marker (at front)
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(W - 10, 0, 10, H);
    
    // Labels & Weights
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate || crate.parent_id) continue;
        const { label } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
        const w = computeCrateWeight(crate, allInventory, allCrates);
        const col = '#000000'; // Dark text for contrast on solid fill
        
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const lenY = (pos.r === 0 ? (crate.width_cm || 80) : (crate.length_cm || 120)) * scale;
        
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        if (lenX > 60) {
            ctx.font = 'bold 28px monospace';
            ctx.fillText(label, pos.x * scale + lenX / 2, pos.y * scale + lenY / 2 + 10);
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${w} KG`, pos.x * scale + lenX / 2, pos.y * scale + lenY / 2 + 32);
        }
    }
    
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
    
    // Trailer shell (Light gray background)
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, W, H);
    
    // Floor marker
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, H - 4, W, 4);

    // Pre-calculate numbering for performance
    const numbering = getTruckCrateNumbering(truckCrates, positions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    // Crates - Solid Fills
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate || crate.parent_id) continue; // Skip nested boxes
        
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const h = (crate.height_cm || 100) * scale;
        const zOff = (pos.z || 0) * scale;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[crate.id]);
        const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        
        // Solid Fill
        ctx.fillStyle = primaryColor + 'D0';
        ctx.fillRect(pos.x * scale, H - zOff - h, lenX, h);

        // Border
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x * scale, H - zOff - h, lenX, h);
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('ONYX · TRUCKLOAD SIDEVIEW', 40, H - 40);

    // Labels & Weights
    for (const [id, pos] of Object.entries(positions)) {
        const crate = crateMap.get(id) as any;
        if (!crate || crate.parent_id) continue;
        const { label } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
        const w = computeCrateWeight(crate, allInventory, allCrates);
        const col = '#000000'; // Dark text for contrast
        
        const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
        const h = (crate.height_cm || 100) * scale;
        const zOff = (pos.z || 0) * scale;
        
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        if (lenX > 60) {
            ctx.font = 'bold 28px monospace';
            ctx.fillText(label, pos.x * scale + lenX / 2, H - zOff - h / 2 + 10);
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${w} KG`, pos.x * scale + lenX / 2, H - zOff - h / 2 + 32);
        }
    }
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

function generateIsoViewThumbnail(
    truckCrates: any[],
    positions: Record<string, { x: number; y: number; r: number; z?: number }>,
    allCrates: any[],
    allInventory: any[]
): string {
    const W = 2400;
    const H = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, W, H);
    
    const scale = W / (TRUCK_L_CM + TRUCK_W_CM);
    const S = scale * 0.72; // Reduced scale to fit better
    const ox = W * 0.28;   // Moved left to accommodate long tail
    const oy = H * 0.18;   // Moved up to accommodate growth downwards
    
    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];

    // Draw trailer floor
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const f1 = iso(0,0,0), f2 = iso(TRUCK_L_CM,0,0), f3 = iso(TRUCK_L_CM,TRUCK_W_CM,0), f4 = iso(0,TRUCK_W_CM,0);
    ctx.moveTo(...f1); ctx.lineTo(...f2); ctx.lineTo(...f3); ctx.lineTo(...f4); ctx.closePath();
    ctx.stroke();

    // Sort crates for correct depth rendering (X+Y)
    const sortedIds = Object.keys(positions).sort((a, b) => (positions[a].x + positions[a].y) - (positions[b].x + positions[b].y));

    // Pre-calculate numbering for performance
    const numbering = getTruckCrateNumbering(truckCrates, positions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    for (const id of sortedIds) {
        const crate = crateMap.get(id);
        if (!crate || crate.parent_id) continue; // Skip nested boxes in ISO too
        const p = positions[id];
        const rotated = p.r === 90;
        const w = crate.width_cm, l = crate.length_cm, h = crate.height_cm || 100;
        const dX = rotated ? w : l, dY = rotated ? l : w;
        const zOff = p.z || 0;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
        const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        
        const pts = [
            iso(p.x, p.y, zOff), iso(p.x + dX, p.y, zOff), iso(p.x + dX, p.y + dY, zOff), iso(p.x, p.y + dY, zOff),
            iso(p.x, p.y, zOff + h), iso(p.x + dX, p.y, zOff + h), iso(p.x + dX, p.y + dY, zOff + h), iso(p.x, p.y + dY, zOff + h)
        ];

        // Draw faces as wireframe
        ctx.lineWidth = 3;
        ctx.strokeStyle = col;
        
        // Front faces (visible)
        // Left
        ctx.fillStyle = `${col}11`;
        ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[3]); ctx.lineTo(...pts[7]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Right
        ctx.beginPath(); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[5]); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Top
        ctx.fillStyle = `${col}15`;
        ctx.beginPath(); ctx.moveTo(...pts[4]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[7]); ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // Vertical connecting edges
        ctx.stroke();

        // Labels in Iso View
        const { label } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
        const wKg = computeCrateWeight(crate, allInventory, allCrates);
        const pMid = iso(p.x + dX/2, p.y + dY/2, zOff + h/2);
        ctx.fillStyle = col;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, pMid[0], pMid[1]);
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`${wKg} KG`, pMid[0], pMid[1] + 18);
    }
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ONYX · TRUCKLOAD ISOMETRIC VIEW', 40, H - 40);

    return canvas.toDataURL('image/jpeg', 0.85);
}

function generateMasterThumbnail(
    truckCrates: any[],
    positions: Record<string, { x: number; y: number; r: number; z?: number }>,
    allCrates: any[],
    allInventory: any[],
    draftName?: string
): string {
    const W = 1920;
    const H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // ── Background ──
    ctx.fillStyle = '#0F111A'; // Deep midnight
    ctx.fillRect(0, 0, W, H);
    
    // ── Layout Dividers ──
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.moveTo(W/2, H/2); ctx.lineTo(W/2, H);
    ctx.stroke();

    const numbering = getTruckCrateNumbering(truckCrates, positions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    // ── 1. ISOMETRIC VIEW (Top Half) ──
    const drawIso = (ctx: CanvasRenderingContext2D, rect: {x:number; y:number; w:number; h:number}) => {
        const scale = rect.w / (TRUCK_L_CM + TRUCK_W_CM) * 0.8;
        const S = scale * 0.85;
        const ox = rect.x + rect.w * 0.35;
        const oy = rect.y + rect.h * 0.25;
        
        const iso = (x: number, y: number, z: number): [number, number] => [
            ox + (x - y) * S * 0.866,
            oy + (x + y) * S * 0.5 - z * S
        ];

        // Floor
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const f1 = iso(0,0,0), f2 = iso(TRUCK_L_CM,0,0), f3 = iso(TRUCK_L_CM,TRUCK_W_CM,0), f4 = iso(0,TRUCK_W_CM,0);
        ctx.moveTo(...f1); ctx.lineTo(...f2); ctx.lineTo(...f3); ctx.lineTo(...f4); ctx.closePath();
        ctx.stroke();

        const sortedIds = Object.keys(positions).sort((a, b) => (positions[a].x + positions[a].y) - (positions[b].x + positions[b].y));
        for (const id of sortedIds) {
            const crate = crateMap.get(id);
            if (!crate || crate.parent_id) continue;
            const p = positions[id];
            const rotated = p.r === 90;
            const w = crate.width_cm, l = crate.length_cm, h = crate.height_cm || 100;
            const dX = rotated ? w : l, dY = rotated ? l : w;
            const zOff = p.z || 0;
            const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
            
            const pts = [
                iso(p.x, p.y, zOff), iso(p.x + dX, p.y, zOff), iso(p.x + dX, p.y + dY, zOff), iso(p.x, p.y + dY, zOff),
                iso(p.x, p.y, zOff + h), iso(p.x + dX, p.y, zOff + h), iso(p.x + dX, p.y + dY, zOff + h), iso(p.x, p.y + dY, zOff + h)
            ];

            ctx.lineWidth = 1.5;
            ctx.strokeStyle = col;
            ctx.fillStyle = `${col}15`; // Faint fill for wireframe look
            
            // Top face
            ctx.beginPath(); ctx.moveTo(...pts[4]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[7]); ctx.closePath(); ctx.fill(); ctx.stroke();
            // Left face
            ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[3]); ctx.lineTo(...pts[7]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
            // Right face
            ctx.beginPath(); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[5]); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('ISOMETRIC LOAD VIEW · WIREFRAME MATRIX', rect.x + 40, rect.y + rect.h - 40);
    };

    // ── 2. TOP VIEW (Bottom Left) ──
    const drawTop = (ctx: CanvasRenderingContext2D, rect: {x:number; y:number; w:number; h:number}) => {
        const padding = 60;
        const availW = rect.w - padding * 2;
        const scale = availW / TRUCK_L_CM;
        const availH = TRUCK_W_CM * scale;
        const ox = rect.x + padding;
        const oy = rect.y + (rect.h - availH) / 2;

        // Trailer floor
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(ox, oy, TRUCK_L_CM * scale, TRUCK_W_CM * scale);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(ox, oy, TRUCK_L_CM * scale, TRUCK_W_CM * scale);

        for (const [id, pos] of Object.entries(positions)) {
            const crate = crateMap.get(id) as any;
            if (!crate || crate.parent_id) continue;
            const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
            const lenY = (pos.r === 0 ? (crate.width_cm || 80) : (crate.length_cm || 120)) * scale;
            const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[crate.id]);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
            
            ctx.fillStyle = col;
            ctx.fillRect(ox + pos.x * scale, oy + pos.y * scale, lenX, lenY);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(ox + pos.x * scale, oy + pos.y * scale, lenX, lenY);
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('TOP VIEW · DISTRIBUTION MAP', rect.x + 40, rect.y + rect.h - 40);
    };

    // ── 3. SIDE VIEW (Bottom Right) ──
    const drawSide = (ctx: CanvasRenderingContext2D, rect: {x:number; y:number; w:number; h:number}) => {
        const padding = 60;
        const TRUCK_H_CM = 279;
        const availW = rect.w - padding * 2;
        const scale = availW / TRUCK_L_CM;
        const availH = TRUCK_H_CM * scale;
        const ox = rect.x + padding;
        const oy = rect.y + (rect.h - availH) / 2;

        // Trailer shell
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(ox, oy, TRUCK_L_CM * scale, TRUCK_H_CM * scale);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(ox, oy, TRUCK_L_CM * scale, TRUCK_H_CM * scale);

        for (const [id, pos] of Object.entries(positions)) {
            const crate = crateMap.get(id) as any;
            if (!crate || crate.parent_id) continue;
            const lenX = (pos.r === 0 ? (crate.length_cm || 120) : (crate.width_cm || 80)) * scale;
            const h = (crate.height_cm || 100) * scale;
            const zOff = (pos.z || 0) * scale;
            const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[crate.id]);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
            
            ctx.fillStyle = col;
            ctx.fillRect(ox + pos.x * scale, oy + (TRUCK_H_CM * scale) - zOff - h, lenX, h);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(ox + pos.x * scale, oy + (TRUCK_H_CM * scale) - zOff - h, lenX, h);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SIDE VIEW · STACKING PROFILE', rect.x + 40, rect.y + rect.h - 40);
    };

    drawIso(ctx, {x:0, y:0, w:W, h:H/2});
    drawTop(ctx, {x:0, y:H/2, w:W/2, h:H/2});
    drawSide(ctx, {x:W/2, y:H/2, w:W/2, h:H/2});

    // ── Master Branding ──
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ONYX LOGISTICS · MASTER LOAD ARCHIVE · ${draftName?.toUpperCase() || 'UNTITLED LOAD'}`, W/2, 50);
    
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText(`GENERATED: ${new Date().toLocaleString()} · v${TRUCKLOAD_VERSION} HYBRID ENGINE`, W/2, 75);

    return canvas.toDataURL('image/jpeg', 0.90);
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

// ─── Nesting Target Selector ──────────────────────────────────────────────────
const NestingTargetModal: React.FC<{
    boxId: string;
    allCrates: any[];
    onSelect: (targetId: string) => void;
    onClose: () => void;
}> = ({ boxId, allCrates, onSelect, onClose }) => {
    const targets = allCrates.filter(c => c.id !== boxId && c.type !== 'cardboard' && c.status !== 'Empty');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/[0.01] backdrop-blur-2xl animate-in fade-in zoom-in duration-500">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative z-10 w-full max-w-lg bg-white/[0.03] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.5)] backdrop-blur-3xl animate-in slide-in-from-bottom-8 duration-700">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Nesting Wizard</h3>
                        <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-bold mt-1.5">Select container for box {boxId.slice(0,6)}</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-white/10 text-white/20 hover:text-white transition-all flex items-center justify-center group">
                        <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
                <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-3">
                    {targets.length === 0 ? (
                        <div className="py-20 text-center flex flex-col items-center gap-4">
                            <Box size={48} className="text-white/5" />
                            <p className="text-xs text-white/20 uppercase tracking-widest font-black italic">No compatible containers available</p>
                        </div>
                    ) : targets.map(t => (
                        <button
                            key={t.id}
                            onClick={() => onSelect(t.id)}
                            className="w-full p-5 flex items-center gap-5 rounded-[1.5rem] border border-white/5 bg-white/[0.03] hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group text-left shadow-lg hover:shadow-emerald-500/5 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5 shrink-0 group-hover:border-emerald-500/20 group-hover:bg-emerald-500/5 transition-all">
                                <Box size={32} className="text-white/20 group-hover:text-emerald-500/60 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black uppercase text-(--main-color) tracking-[0.3em] mb-1">{t.type} UNIT</div>
                                <div className="text-lg font-black text-white truncate leading-none group-hover:text-emerald-400 transition-colors">
                                    {getCrateDisplayName(t, allCrates, []).label}
                                </div>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{t.width_cm}x{t.length_cm}x{t.height_cm} CM</span>
                                    <div className="w-1 h-1 rounded-full bg-white/10" />
                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{t.status}</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-emerald-400/40 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-all">
                                <ChevronRight size={24} />
                            </div>
                        </button>
                    ))}
                </div>
                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-center">
                    <p className="text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">Onyx Logistics Protocol · Nesting v1.2</p>
                </div>
            </div>
        </div>
    );
};

function exportDraftFile(draft: TruckDraft) {
    const payload: TruckloadFile = {
        version: TRUCKLOAD_VERSION,
        type: 'onyx-truckload',
        name: draft.name,
        savedAt: draft.savedAt,
        crateCount: draft.crateCount,
        positions: draft.positions,
        numbering: draft.numbering,
        shipmentData: draft.shipmentData
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
            numbering: data.numbering,
            thumbnail: data.thumbnail || thumbnailBase64,
            shipmentData: data.shipmentData
        };
    } catch (e) { console.error('Draft import failed', e); return null; }
}

// ─── Export Card Component ──────────────────────────────────────────────────
const ExportCard: React.FC<{
    id: string;
    title: string;
    type: string;
    desc?: string;
    icon: any;
    color: string;
    prog: number;
    url?: string;
    onGenerate: () => void;
    onDownload?: (url: string, filename: string) => void;
    filename?: string;
}> = ({ id, title, type, desc, icon: Icon, color, prog, url, onGenerate, onDownload, filename }) => {
    const isDone = prog === 100;
    return (
        <div className="flex items-center gap-5 p-5 rounded-3xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.06] transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: `${color}15`, color: color }}>
                <Icon size={28} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white uppercase tracking-tight">{title}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase">{type}</span>
                </div>
                {desc && <span className="block text-[10px] text-white/30 uppercase font-bold tracking-wider mt-1 leading-relaxed">{desc}</span>}
                {prog >= 0 && (
                    <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full transition-all duration-300" style={{ width: `${prog}%`, backgroundColor: color }} />
                    </div>
                )}
            </div>
            <div className="shrink-0">
                {isDone && url ? (
                    <button 
                        onClick={() => onDownload ? onDownload(url, filename || `${title.replace(/\s+/g, '_')}.${type.toLowerCase()}`) : window.open(url, '_blank')}
                        className="px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl"
                        style={{ backgroundColor: color, color: '#fff' }}
                    >
                        Download
                    </button>
                ) : (
                    <button 
                        onClick={onGenerate}
                        disabled={prog >= 0}
                        className="px-5 py-2.5 bg-white/5 text-white hover:bg-white/15 disabled:opacity-30 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                    >
                        {prog >= 0 ? 'Building...' : 'Generate'}
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── Export Modal ────────────────────────────────────────────────────────────
const TruckExportModal: React.FC<{
    truckCrates: any[];
    allCrates: any[];
    allInventory: any[];
    positions: any;
    truckNumbering: Record<string, number>;
    totalWeight: number;
    panelStats: any;
    floorPct: number;
    onClose: () => void;
}> = ({ truckCrates, allCrates, allInventory, positions, truckNumbering, totalWeight, panelStats, floorPct, onClose }) => {
    const [name, setName] = useState(`TRK ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' }).toUpperCase()}`);
    const bookRate = useAtomValue(exchangeRateAtom);
    const [progress, setProgress] = useState({ manifesto: -1, pdf: -1, packed: -1, allCrates: -1, allCratesImages: -1 });
    const [urls, setUrls] = useState({ manifesto: '', pdf: '', packed: '', allCrates: '', allCratesImages: '' });
    const [includePhotos, setIncludePhotos] = useState(true);

    const getItemsFromCrate = (crate: any, floorLabel?: string, boxLabel?: string, visited = new Set<string>()): any[] => {
        if (!crate || visited.has(crate.id)) return [];
        visited.add(crate.id);

        const { label: currentLabel } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
        const nextFloorLabel = floorLabel || currentLabel;
        const nextBoxLabel = crate.type === 'cardboard' ? currentLabel : boxLabel;

        let results: any[] = [];
        
        // 1. Direct items
        if (crate.inventory_ids) {
            crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
                const [id, qtyStr] = e.split(':');
                const qty = parseInt(qtyStr || '1', 10) || 1;
                const inv = allInventory.find((i: any) => String(i.row) === id);
                if (inv) {
                    results.push({ id, qty, inv, packetIn: floorLabel, boxLabel: nextBoxLabel });
                }
            });
        }
        
        // 2. Nested units (recursive)
        const nested = allCrates.filter(c => c.parent_id === crate.id);
        nested.forEach(n => {
            results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)];
        });
        
        return results;
    };

    const buildConsolidatedItems = () => {
        const itemMap = new Map<string, { qty: number, inv: any, crates: Set<string> }>();
        truckCrates.forEach(c => {
            const { label } = getCrateDisplayName(c, allCrates, allInventory);
            getItemsFromCrate(c).forEach((item: any) => {
                const itemContainer = item.packetIn || label;
                const existing = itemMap.get(item.id);
                if (existing) {
                    existing.qty += item.qty;
                    existing.crates.add(itemContainer);
                } else {
                    itemMap.set(item.id, { qty: item.qty, inv: item.inv, crates: new Set([itemContainer]) });
                }
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
            { header: 'Acq. Cost MXN', key: 'cost', width: 20 },
        ];
        items.forEach((item, idx) => {
            setProgress(p => ({ ...p, manifesto: 5 + Math.round((idx / items.length) * 80) }));
            const inv = item.inv;
            const data = inv.data || {};
            const norm = normalizeInventoryData(inv);
            const calculated = calculateCodesAndPrices(norm, bookRate, '326');
            const tag = calculated.bookBarcode || norm.book_barcode || norm.itemId || inv.row;
            const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
            const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
            const cost = calculated.acquisitionCostMxn || 0;
            ws.addRow({ tag, qty: item.qty, desc: desc || 'Artifact', weight: data.weightKg || data.weight_kg || '', dims, cost });
        });
        ws.getRow(1).font = { bold: true };
        setProgress(p => ({ ...p, manifesto: 95 }));
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (blob) {
            setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, manifesto: 100 }));
        } else {
            setProgress(p => ({ ...p, manifesto: -1 }));
            toast.error('Failed to generate Excel file');
        }
    };

    const generatePdf = async () => {
        const tid = toast.loading('Generating consolidated trailer manifest...');
        setProgress(p => ({ ...p, pdf: 5 }));
        try {
            const items = buildConsolidatedItems();
            const packingWeight = (fields.packingItems || []).reduce((s, i) => s + (i.weight || 0) * (i.count || 1), 0);
            const packingUnits = (fields.packingItems || []).reduce((s, i) => s + (i.count || 0), 0);
            const crateItemsCount = items.reduce((s, i) => s + (i.qty || 1), 0);

            const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
                const inv = item.inv;
                const data = inv.data || {};
                const norm = normalizeInventoryData(inv);
                const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                const tag = calculated.bookBarcode || data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
                const vendorPrefix = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                const vendorCol = vendors[vendorPrefix as keyof typeof vendors]?.color || '#6b7280';
                return {
                    index: idx, vendorPrefix, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
                    name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                    material: data.material || data.Material || '', color: data.color || data.Color || '',
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                    weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                    costMxn: 0, costUsd: 0,
                    imageUrls: [], 
                    tagColor: vendorCol, dbItemCount: data.quantity || 1,
                    packetIn: Array.from(item.crates).join(', ')
                };
            });

            const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
            const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
            const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
            
            const floorCrates = truckCrates;
            const nestedBoxes = allCrates.filter(c => c.type === 'cardboard' && c.parent_id && floorCrates.some(fc => fc.id === c.parent_id));
            
            const allTruckCratesMeta = [...floorCrates, ...nestedBoxes].map(c => {
                const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
                const col = vendorList.length > 0 ? (vendors as any)[vendorList[0] as keyof typeof vendors]?.color || '#6b7280' : '#6b7280';
                
                let parentLabel = '';
                if (c.parent_id) {
                    const parent = allCrates.find(p => p.id === c.parent_id);
                    if (parent) {
                        const { label: pl } = getCrateDisplayName(parent, allCrates, allInventory, truckNumbering[parent.id]);
                        parentLabel = pl;
                    }
                }

                return {
                    id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100,
                    parentLabel
                };
            });

            const meta = {
                dynamicId: name || 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
                crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
                topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
                allTruckCrates: allTruckCratesMeta,
                truckStats: {
                    totalWeight: totalWeight + packingWeight, 
                    payloadPct: Math.round(((totalWeight + packingWeight) / 22000) * 100), 
                    floorPct: floorPct, volPct: panelStats.volPct,
                    status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, 
                    itemCount: crateItemsCount + packingUnits
                },
                packingItems: fields.packingItems,
                excludeImages: true,
                excludeHeaderQr: true,
                excludeHeaderWireframe: true
            };
            const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
            if (blob) {
                setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
                setProgress(p => ({ ...p, pdf: 100 }));
                toast.success('Manifest ready', { id: tid });
            } else {
                throw new Error('PDF Generation failed (empty blob)');
            }
        } catch (err: any) {
            console.error('[TruckExport] PDF Error:', err);
            setProgress(p => ({ ...p, pdf: -1 }));
            toast.error(err.message || 'PDF Generation failed', { id: tid });
        }
    };

    const generateAllManifestos = async (withImages: boolean) => {
        const key = withImages ? 'allCratesImages' : 'allCrates';
        setProgress(p => ({ ...p, [key]: 5 }));
        
        // Filter to only ROOT containers (those not nested inside others) and exclude cardboard boxes from individual exports
        const rootCrates = truckCrates.filter(c => !c.parent_id && c.type !== 'cardboard');
        
        const cratesData = [...rootCrates].sort((a, b) => (truckNumbering[a.id] || 0) - (truckNumbering[b.id] || 0)).map(crate => {
            const { label, subtitle, vendorList } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
            const items = getItemsFromCrate(crate).map((item, idx) => {
                const inv = item.inv; const data = inv.data || {};
                const norm = normalizeInventoryData(inv);
                const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                
                let photos: string[] = [];
                if (withImages) {
                    const rawPhotos = data.generatedPngUrl ? [data.generatedPngUrl] : (data.mediaUrls ? (Array.isArray(data.mediaUrls) ? data.mediaUrls : String(data.mediaUrls).split(',')) : []);
                    photos = rawPhotos.map((url: string) => getCleanImageUrl(url)).filter(Boolean) as string[];
                }

                return {
                    index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(inv.row),
                    name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                    material: data.material || '', color: data.color || '',
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                    weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                    costMxn: 0, costUsd: 0,
                    imageUrls: photos,
                    tagColor: vendors[vP as keyof typeof vendors]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                    packetIn: item.packetIn || '', // Floor level owner
                    boxLabel: item.boxLabel || ''  // Immediate box owner
                };
            });
            const meta = {
                dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm||'?'} cm`,
                crateType: crate.type, fillPct: 100, exportedAt: new Date().toLocaleString(),
                excludeImages: !withImages, crateColor: vendors[vendorList[0] as keyof typeof vendors]?.color || '#6b7280',
                excludeHeaderQr: false, excludeHeaderWireframe: false,
                exportBruteWeight: crate.brute_weight_kg
            };
            return { items, meta };
        });

        const trailerManifestoItems: ManifestoItem[] = [];
        const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
        const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
        const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
        
        const allTruckCratesMeta = truckCrates.map(c => {
            const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#6b7280') : '#6b7280';
            return {
                id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
                weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
            };
        });

        const trailerMeta = {
            dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
            crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
            topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
            allTruckCrates: allTruckCratesMeta,
            truckStats: {
                totalWeight,
                payloadPct: panelStats.payloadPct, floorPct: floorPct, volPct: panelStats.volPct,
                status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, itemCount: truckCrates.length
            },
            excludeImages: true, excludeHeaderQr: true, excludeHeaderWireframe: true
        };

        const blob = await exportCombinedTruckManifesto({ items: trailerManifestoItems, meta: trailerMeta }, cratesData, pct => setProgress(p => ({ ...p, [key]: 10 + Math.round(pct * 0.9) })), 'blob') as any as Blob;
        if (blob) {
            setUrls(u => ({ ...u, [key]: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, [key]: 100 }));
        } else {
            setProgress(p => ({ ...p, [key]: -1 }));
            toast.error('Failed to generate combined PDF');
        }
    };

    const generatePacked = async () => {
        setProgress(p => ({ ...p, packed: 5 }));
        const wb = new ExcelJS.Workbook();
        
        // Filter to only ROOT containers
        const rootCrates = truckCrates.filter(c => !c.parent_id);
        
        for (let i = 0; i < rootCrates.length; i++) {
            setProgress(p => ({ ...p, packed: 5 + Math.round((i / rootCrates.length) * 80) }));
            const crate = rootCrates[i];
            const { label } = getCrateDisplayName(crate, allCrates, allInventory);
            const safeLabel = label.replace(/[\[\]\*\/\?\:\\]/g, '').substring(0, 31) || `Crate ${i+1}`;
            let sheetName = safeLabel; let counter = 1;
            while (wb.worksheets.find(s => s.name === sheetName)) sheetName = `${safeLabel.substring(0, 28)}_${counter++}`;
            const ws = wb.addWorksheet(sheetName);
            ws.columns = [
                { header: 'Book TAG ID', key: 'tag', width: 20 }, { header: 'Quantity', key: 'qty', width: 10 },
                { header: 'Description', key: 'desc', width: 40 }, { header: 'Weight (KG)', key: 'weight', width: 15 },
                { header: 'Dimensions (CM)', key: 'dims', width: 20 },
                { header: 'Container', key: 'container', width: 25 }
            ];
            getItemsFromCrate(crate).forEach((item: any) => {
                const inv = item.inv; const data = inv.data || {};
                const norm = normalizeInventoryData(inv);
                const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                const tag = calculated.bookBarcode || norm.book_barcode || norm.itemId || inv.row;
                const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
                const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
                ws.addRow({ 
                    tag, 
                    qty: item.qty, 
                    desc: desc || 'Artifact', 
                    weight: data.weightKg || data.weight_kg || '', 
                    dims,
                    container: item.packetIn || '' // Show nested box label if applicable
                });
            });
            ws.getRow(1).font = { bold: true };
        }
        setProgress(p => ({ ...p, packed: 95 }));
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (blob) {
            setUrls(u => ({ ...u, packed: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, packed: 100 }));
        } else {
            setProgress(p => ({ ...p, packed: -1 }));
            toast.error('Failed to generate Excel files');
        }
    };

    const triggerDownload = (url: string, filename: string) => {
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-white/[0.05] backdrop-blur-2xl" />
            <div className="relative z-10 w-full max-w-2xl mx-4 rounded-[3.5rem] border border-white/10 p-12 flex flex-col gap-10 shadow-[0_50px_100px_rgba(0,0,0,0.8)] bg-white/[0.01] backdrop-blur-3xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-700"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
                                <LayoutGrid size={24} className="text-white/60" />
                            </div>
                            <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Exportation Wizard</h3>
                        </div>
                        <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-bold ml-16">Advanced Logistics Protocol v2.5</p>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-2xl text-white/30 hover:text-white hover:bg-white/10 transition-all cursor-pointer border border-transparent hover:border-white/10">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-col gap-8">
                    {/* Shipment Info */}
                    <div className="flex flex-col gap-3 max-w-sm">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 ml-1">Manifest Identity</label>
                        <input 
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-base font-bold text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-white/10"
                            placeholder="TRK-ID-000"
                        />
                    </div>

                    {/* Options List */}
                    <div className="flex flex-col gap-4">
                        <ExportCard 
                            id="manifesto" title="Consolidated Manifesto" type="XLSX" color="#3b82f6" icon={FileSpreadsheet}
                            desc="Global inventory list with all items combined. Best for accounting."
                            prog={progress.manifesto} url={urls.manifesto} onGenerate={generateManifesto} onDownload={triggerDownload} filename={`${name}_Consolidated_Manifesto.xlsx`}
                        />
                        <ExportCard 
                            id="pdf" title="Trailer Packing List" type="PDF" color="#ef4444" icon={FileText}
                            desc="Summary of trailer load with isometric and top views."
                            prog={progress.pdf} url={urls.pdf} onGenerate={generatePdf} onDownload={triggerDownload} filename={`${name}_Packing_List.pdf`}
                        />
                        <ExportCard 
                            id="packed" title="Crate Spreadsheets" type="XLSX" color="#10b981" icon={FileSpreadsheet}
                            desc="One Excel sheet per crate. Detailed per-box breakdown."
                            prog={progress.packed} url={urls.packed} onGenerate={generatePacked} onDownload={triggerDownload} filename={`${name}_Crate_Spreadsheets.xlsx`}
                        />
                        <div className="h-px bg-white/5 my-2" />
                        <ExportCard 
                            id="allCrates" title="All Crates Manifesto" type="PDF" color="#f97316" icon={FileText}
                            desc="Combined PDF of all individual crate manifestos. (No photos)."
                            prog={progress.allCrates} url={urls.allCrates} onGenerate={() => generateAllManifestos(false)} onDownload={triggerDownload} filename={`${name}_All_Crates_Manifesto.pdf`}
                        />
                        <ExportCard 
                            id="allCratesImages" title="Visual Manifesto" type="PDF" color="#f43f5e" icon={ImageIcon}
                            desc="High-fidelity visual verification with multi-row item photos."
                            prog={progress.allCratesImages} url={urls.allCratesImages} onGenerate={() => generateAllManifestos(true)} onDownload={triggerDownload} filename={`${name}_Visual_Manifesto.pdf`}
                        />
                    </div>
                </div>

                {/* Status Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Load Payload</span>
                            <span className="text-xl font-black text-white italic tracking-tighter">{totalWeight.toLocaleString()} <span className="text-xs text-white/40 not-italic">KG</span></span>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Active Units</span>
                            <span className="text-xl font-black text-white italic tracking-tighter">{truckCrates.length} <span className="text-xs text-white/40 not-italic">Units</span></span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">Protocol Stable</span>
                        <div className="flex gap-1 mt-1">
                            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                            <div className="w-1 h-1 rounded-full bg-emerald-500/40" />
                            <div className="w-1 h-1 rounded-full bg-emerald-500/20" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Interactive Truck Viewer (Local Preview) ──────────────────────────────────
const InteractiveTruckViewer: React.FC<{
    truckCrates: any[];
    positions: Record<string, any>;
    allCrates: any[];
    allInventory: any[];
    truckNumbering: Record<string, number>;
}> = ({ truckCrates, positions, allCrates, allInventory, truckNumbering }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        crates: Map<string, THREE.Mesh>;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(22, 14, 22);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.4);
        sun.position.set(10, 20, 10);
        scene.add(sun);
        
        const grid = new THREE.GridHelper(40, 40, 0xe2e8f0, 0xf1f5f9);
        grid.position.y = -0.06;
        scene.add(grid);

        const bed = new THREE.Mesh(
            new THREE.BoxGeometry(16.15, 0.05, 2.44),
            new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.1, roughness: 0.8 })
        );
        bed.position.y = -0.025;
        scene.add(bed);

        const cratesMap = new Map<string, THREE.Mesh>();
        truckCrates.forEach(c => {
            const pos = positions[c.id];
            if (!pos) return;
            const dw = c.width_cm / 100;
            const dl = c.length_cm / 100;
            const dh = (c.height_cm || 100) / 100;
            const isRotated = pos.r === 90;

            const geo = new THREE.BoxGeometry(dl, dh, dw);
            const col = vendors[c.vendor_id as keyof typeof vendors]?.color || '#adb5bd';
            const mat = new THREE.MeshPhongMaterial({ 
                color: col, 
                transparent: true, 
                opacity: 0.85,
                shininess: 30
            });
            const mesh = new THREE.Mesh(geo, mat);
            
            mesh.position.set(
                (pos.x / 100) - (16.15 / 2) + (isRotated ? dw : dl) / 2, 
                (pos.z || 0)/100 + dh/2 + 0.01, 
                (pos.y / 100) - (2.44 / 2) + (isRotated ? dl : dw) / 2
            );
            
            if (isRotated) mesh.rotation.y = Math.PI / 2;
            scene.add(mesh);

            // Edges
            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(geo),
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
            );
            edges.position.copy(mesh.position);
            edges.rotation.copy(mesh.rotation);
            scene.add(edges);

            cratesMap.set(c.id, mesh);
        });

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
            if (containerRef.current?.contains(renderer.domElement)) containerRef.current.removeChild(renderer.domElement);
        };
    }, [truckCrates, positions]);

    return <div ref={containerRef} className="w-full h-full" />;
};

// ─── Ready Truck Wizard ──────────────────────────────────────────────────────
const ReadyTruckWizard: React.FC<{
    truckCrates: any[];
    allCrates: any[];
    allInventory: any[];
    positions: any;
    truckNumbering: Record<string, number>;
    totalWeight: number;
    panelStats: any;
    floorPct: number;
    fields: any;
    onFieldChange: (f: any) => void;
    onClose: () => void;
    onConfirm: () => void;
    onSaveDraft: () => void;
    onOpenDraft: () => void;
    isBusy?: boolean;
    publicUrl?: string | null;
}> = ({ truckCrates, allCrates, allInventory, positions, truckNumbering, totalWeight, panelStats, floorPct, fields, onFieldChange, onClose, onConfirm, onSaveDraft, onOpenDraft, isBusy, publicUrl }) => {
    const bookRate = useAtomValue(exchangeRateAtom);
    const [progress, setProgress] = useState({ pdf: -1, allCrates: -1, xlsx: -1 });
    const [urls, setUrls] = useState({ pdf: '', allCrates: '', xlsx: '', html: '' });
    const [showLiveViewer, setShowLiveViewer] = useState(false);
    const exportTimestamp = useRef(new Date().getTime());

    const getItemsFromCrate = (crate: any, floorLabel?: string, boxLabel?: string, visited = new Set<string>()): any[] => {
        if (!crate || visited.has(crate.id)) return [];
        visited.add(crate.id);
        const { label: currentLabel } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
        const nextFloorLabel = floorLabel || currentLabel;
        const nextBoxLabel = crate.type === 'cardboard' ? currentLabel : boxLabel;
        let results: any[] = [];
        if (crate.inventory_ids) {
            crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
                const [id, qtyStr] = e.split(':');
                const qty = parseInt(qtyStr || '1', 10) || 1;
                const inv = allInventory.find((i: any) => String(i.row) === id);
                if (inv) results.push({ id, qty, inv, packetIn: floorLabel, boxLabel: nextBoxLabel });
            });
        }
        const nested = allCrates.filter(c => c.parent_id === crate.id);
        nested.forEach(n => { results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)]; });
        return results;
    };

    const buildConsolidatedItems = () => {
        const itemMap = new Map<string, { qty: number, inv: any, crates: Set<string> }>();
        truckCrates.forEach(c => {
            const { label } = getCrateDisplayName(c, allCrates, allInventory);
            getItemsFromCrate(c).forEach((item: any) => {
                const itemContainer = item.packetIn || label;
                const existing = itemMap.get(item.id);
                if (existing) { existing.qty += item.qty; existing.crates.add(itemContainer); }
                else { itemMap.set(item.id, { qty: item.qty, inv: item.inv, crates: new Set([itemContainer]) }); }
            });
        });
        return Array.from(itemMap.values());
    };

    const generatePdf = async () => {
        const tid = toast.loading('Building trailer packing list...');
        setProgress(p => ({ ...p, pdf: 5 }));
        try {
            const items = buildConsolidatedItems();
            const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
                const inv = item.inv; const data = inv.data || {};
                const norm = normalizeInventoryData(inv);
                const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                const tag = calculated.bookBarcode || data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
                const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                return {
                    index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
                    name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                    material: data.material || '', color: data.color || '',
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                    weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                    costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                    packetIn: Array.from(item.crates).join(', ')
                };
            });

            const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
            const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
            const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
            
            const floorCrates = truckCrates;
            const nestedBoxes = allCrates.filter(c => c.type === 'cardboard' && c.parent_id && floorCrates.some(fc => fc.id === c.parent_id));
            const allTruckCratesMeta = [...floorCrates, ...nestedBoxes].map(c => {
                const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
                const col = vendorList.length > 0 ? (vendors as any)[vendorList[0]]?.color || '#6b7280' : '#6b7280';
                let parentLabel = '';
                if (c.parent_id) {
                    const parent = allCrates.find(p => p.id === c.parent_id);
                    if (parent) parentLabel = getCrateDisplayName(parent, allCrates, allInventory, truckNumbering[parent.id]).label;
                }
                return {
                    id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100, parentLabel
                };
            });

            const meta: ManifestoMeta = {
                dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
                crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
                topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
                allTruckCrates: allTruckCratesMeta,
                truckStats: {
                    totalWeight: totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0), 
                    payloadPct: panelStats.payloadPct, floorPct: floorPct, volPct: panelStats.volPct,
                    status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, 
                    itemCount: (buildConsolidatedItems().reduce((s:number, i:any) => s + (i.qty || 1), 0)) + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.count || 0), 0)
                },
                excludeImages: true, excludeHeaderQr: true, excludeHeaderWireframe: true,
                sealNumber: fields.sealNumber, tractorNumber: fields.tractorNumber, truckPlates: fields.truckPlates,
                trailerNumber: fields.trailerNumber, trailerPlates: fields.trailerPlates, senders: fields.senders,
                packingItems: fields.packingItems
            };
            const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
            if (blob) { setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) })); setProgress(p => ({ ...p, pdf: 100 })); toast.success('Manifest ready', { id: tid }); }
        } catch (err: any) { setProgress(p => ({ ...p, pdf: -1 })); toast.error(err.message || 'Failed', { id: tid }); }
    };

    const generatePackingListXlsx = async () => {
        const tid = toast.loading('Generating XLSX Packing List...');
        setProgress(p => ({ ...p, xlsx: 5 }));
        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Trailer Packing List');

            // Header Styling
            const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } }; // Orange
            const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light Gray
            const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };

            // 1. Shipment Info
            ws.addRow(['ONYX LOGISTICS · TRAILER PACKING LIST']);
            ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
            ws.addRow([`Exported At: ${new Date().toLocaleString()}`]);
            ws.addRow([]);

            ws.addRow(['SHIPMENT METADATA']);
            ws.getRow(4).font = { bold: true };
            ws.addRow(['Seal #', fields.sealNumber || 'N/A']);
            ws.addRow(['Tractor #', fields.tractorNumber || 'N/A']);
            ws.addRow(['Truck Plates', fields.truckPlates || 'N/A']);
            ws.addRow(['Trailer #', fields.trailerNumber || 'N/A']);
            ws.addRow(['Trailer Plates', fields.trailerPlates || 'N/A']);
            ws.addRow(['Senders', (fields.senders || []).join(', ') || 'N/A']);
            ws.addRow([]);

            // 2. Item List Header
            const startRow = ws.rowCount + 1;
            ws.addRow(['Crate / Unit', 'Book TAG ID', 'Qty', 'Description', 'Dimensions (CM)', 'Weight (KG)', 'Sub-Container']);
            const headerRow = ws.getRow(startRow);
            headerRow.font = textWhite;
            headerRow.eachCell(cell => { cell.fill = headerFill; cell.alignment = { horizontal: 'center' }; });

            ws.columns = [
                { key: 'crate', width: 25 },
                { key: 'tag', width: 22 },
                { key: 'qty', width: 8 },
                { key: 'desc', width: 50 },
                { key: 'dims', width: 22 },
                { key: 'weight', width: 12 },
                { key: 'box', width: 25 }
            ];

            // 3. Sectioned Items
            const rootCrates = [...truckCrates].sort((a, b) => (truckNumbering[a.id] || 0) - (truckNumbering[b.id] || 0));
            
            rootCrates.forEach((crate, cIdx) => {
                const { label } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
                
                // Section Header Row
                const sRow = ws.addRow([`UNIT ${truckNumbering[crate.id] || cIdx + 1}: ${label.toUpperCase()}`]);
                ws.mergeCells(sRow.number, 1, sRow.number, 7);
                sRow.font = { bold: true };
                sRow.getCell(1).fill = sectionFill;

                const items = getItemsFromCrate(crate);
                items.forEach(item => {
                    const inv = item.inv; const data = inv.data || {};
                    const norm = normalizeInventoryData(inv);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                    const desc = [data.color, data.material, data.shape, data.shortDescription].filter(Boolean).join(' - ');
                    const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×');
                    
                    const row = ws.addRow({
                        crate: label,
                        tag: tag,
                        qty: item.qty,
                        desc: desc || 'Artifact',
                        dims: dims || 'N/A',
                        weight: data.weightKg || data.weight_kg || 0,
                        box: item.boxLabel || ''
                    });
                    row.getCell('qty').alignment = { horizontal: 'center' };
                    row.getCell('weight').alignment = { horizontal: 'center' };
                });
            });

            // 4. Packing Items (Cardboard boxes)
            if (fields.packingItems && fields.packingItems.length > 0) {
                ws.addRow([]);
                const pRow = ws.addRow(['EXTERNAL PACKING & CARDBOARD UNITS']);
                ws.mergeCells(pRow.number, 1, pRow.number, 7);
                pRow.font = { bold: true };
                pRow.getCell(1).fill = sectionFill;

                fields.packingItems.forEach((p: any) => {
                    ws.addRow({
                        crate: 'PACKING',
                        tag: 'BOX',
                        qty: p.count,
                        desc: p.name || 'Packing Unit',
                        dims: 'N/A',
                        weight: p.weight || 0,
                        box: ''
                    });
                });
            }

            setProgress(p => ({ ...p, xlsx: 90 }));
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, xlsx: 100 }));
            toast.success('Packing List Ready', { id: tid });
        } catch (err: any) {
            console.error('[TruckExport] XLSX Error:', err);
            setProgress(p => ({ ...p, xlsx: -1 }));
            toast.error('Failed to generate XLSX', { id: tid });
        }
    };

    const generateAllManifestos = async () => {
        setProgress(p => ({ ...p, allCrates: 5 }));
        try {
            const rootCrates = truckCrates.filter(c => !c.parent_id && c.type !== 'cardboard');
            const cratesData = [...rootCrates].sort((a, b) => (truckNumbering[a.id] || 0) - (truckNumbering[b.id] || 0)).map(crate => {
                const { label, subtitle, vendorList } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
                const items = getItemsFromCrate(crate).map((item, idx) => {
                    const inv = item.inv; const data = inv.data || {};
                    const norm = normalizeInventoryData(inv);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                    const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                    return {
                        index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(inv.row),
                        name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                        material: data.material || '', color: data.color || '',
                        dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                        weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                        costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                        packetIn: item.packetIn || '', boxLabel: item.boxLabel || ''
                    };
                });
                const meta = {
                    dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm||'?'} cm`,
                    crateType: crate.type, fillPct: 100, exportedAt: new Date().toLocaleString(),
                    excludeImages: true, crateColor: (vendors as any)[vendorList[0]]?.color || '#6b7280',
                    excludeHeaderQr: false, excludeHeaderWireframe: false, exportBruteWeight: crate.brute_weight_kg
                };
                return { items, meta };
            });

            const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
            const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
            const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
            const allTruckCratesMeta = truckCrates.map(c => {
                const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
                return {
                    id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: (vendors as any)[vendorList[0]]?.color || '#6b7280',
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
                };
            });
            const trailerMeta: ManifestoMeta = {
                dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
                crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
                topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView, allTruckCrates: allTruckCratesMeta,
                truckStats: {
                    totalWeight: totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0), 
                    payloadPct: panelStats.payloadPct, floorPct: floorPct, volPct: panelStats.volPct,
                    status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, 
                    itemCount: (buildConsolidatedItems().reduce((s:number, i:any) => s + (i.qty || 1), 0)) + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.count || 0), 0)
                },
                excludeImages: true, excludeHeaderQr: true, excludeHeaderWireframe: true,
                sealNumber: fields.sealNumber, tractorNumber: fields.tractorNumber, truckPlates: fields.truckPlates,
                trailerNumber: fields.trailerNumber, trailerPlates: fields.trailerPlates, senders: fields.senders,
                packingItems: fields.packingItems
            };
            const blob = await exportCombinedTruckManifesto({ items: [], meta: trailerMeta }, cratesData, pct => setProgress(p => ({ ...p, allCrates: 10 + Math.round(pct * 0.9) })), 'blob') as Blob;
            if (blob) { setUrls(u => ({ ...u, allCrates: URL.createObjectURL(blob) })); setProgress(p => ({ ...p, allCrates: 100 })); }
        } catch (err: any) { setProgress(p => ({ ...p, allCrates: -1 })); toast.error('Combined PDF failed'); }
    };

    const generateHtml = async () => {
        try {
            setProgress(p => ({ ...p, html: 10 }));
            const dateStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
            const manifestId = `ONYX MX - ${dateStr}`;
            const extraWeight = (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0);
            const finalTotalWeight = totalWeight + extraWeight;
            
            const shipmentPayload = {
                crates: truckCrates.map(c => {
                    const pos = positions[c.id] || { x: 0, y: 0, r: 0 };
                    const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
                    const crateColor = (vendors as any)[vendorList[0]]?.color || '#6b7280';
                    const items = getItemsFromCrate(c).map((item, idx) => {
                        const inv = item.inv; 
                        const data = inv.data || {};
                        const norm = normalizeInventoryData(inv);
                        const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                        const tagId = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                        const vP = Object.keys(vendors).find(k => tagId.toUpperCase().startsWith(k)) || 'OTHER';
                        
                        return {
                            itemId: tagId,
                            vendorPrefix: vP,
                            tagColor: (vendors as any)[vP]?.color || '#6b7280',
                            name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                            type: data.shape || 'Unit',
                            desc: data.shortDescription || '',
                            qty: item.qty,
                            weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                            material: data.material || '',
                            color: data.color || '',
                            combinedAttr: `${data.color || ''} ${data.material ? '/ ' + data.material : ''}`.trim()
                        };
                    });
                    
                    return {
                        id: c.id,
                        label,
                        subtitle,
                        x: pos.x,
                        y: pos.z || 0, // Height
                        z: pos.y,      // Width/Depth
                        w: c.width_cm,
                        l: c.length_cm,
                        h: c.height_cm || 100,
                        r: pos.r || 0,
                        color: crateColor,
                        vendorList,
                        items
                    };
                }),
                truckStats: {
                    ...panelStats,
                    totalWeight: finalTotalWeight,
                    payloadPct: Math.round((finalTotalWeight / 22000) * 100)
                },
                timestamp: new Date().toLocaleString()
            };
            const htmlContent = generatePackingListHtml(manifestId, fields, shipmentPayload);
            const blob = new Blob([htmlContent], { type: 'text/html' });
            if (blob) { 
                setUrls(u => ({ ...u, html: URL.createObjectURL(blob) })); 
                setProgress(p => ({ ...p, html: 100 })); 
            }
        } catch (err: any) { 
            setProgress(p => ({ ...p, html: -1 })); 
            toast.error('HTML Generation failed'); 
        }
    };

    const triggerDownload = (url: string, filename: string) => { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <div className="relative z-10 w-full max-w-4xl rounded-[2.5rem] border border-white/10 p-8 flex flex-col gap-6 shadow-2xl bg-[#0c0c12] max-h-[95vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center bg-white/[0.02] -mx-8 -mt-8 px-8 py-6 border-b border-white/10 rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                            <Truck size={24} className="text-white/60" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Ready Trailer</h3>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] font-black">Ready for Finalization Sequence</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Protocol ID</span>
                            <span className="text-[10px] font-mono text-white/40 tracking-wider">ONYX-LOG-2.5</span>
                        </div>
                        <button onClick={onClose} className="p-3 rounded-2xl text-white/20 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"><X size={20} /></button>
                    </div>
                </div>

                {publicUrl && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black">✓</div>
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-tight">Shipment Live in Registry</h4>
                                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">3D Digital Mirror Created</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link Copied'); }} className="px-4 py-2 rounded-xl bg-white/10 text-[9px] font-black text-white uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10">Copy Share Link</button>
                                <button onClick={() => window.open(publicUrl, '_blank')} className="px-4 py-2 rounded-xl bg-emerald-500 text-[9px] font-black text-black uppercase tracking-widest hover:scale-105 transition-all">Launch 3D Viewer</button>
                            </div>
                        </div>
                        <div className="text-[10px] font-mono text-white/40 break-all bg-black/20 p-3 rounded-xl border border-white/5">{publicUrl}</div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left side: Form */}
                    <div className="flex flex-col gap-5">
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Seal Number', key: 'sealNumber', placeholder: 'S-0000000', icon: Shield },
                                { label: 'Tractor Number', key: 'tractorNumber', placeholder: 'T-000', icon: IdCard },
                                { label: 'Truck Plates', key: 'truckPlates', placeholder: 'ABC-123-X', icon: ClipboardCheck },
                                { label: 'Trailer Number', key: 'trailerNumber', placeholder: 'TR-000', icon: Hash },
                                { label: 'Trailer Plates', key: 'trailerPlates', placeholder: 'XYZ-789-Y', icon: FileText },
                            ].map(f => (
                                <div key={f.key} className="group flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-all">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-white/20">{f.label}</label>
                                        <f.icon size={12} className="text-white/10 group-focus-within:text-white/30 transition-colors" />
                                    </div>
                                    <input type="text" value={fields[f.key]} onChange={e => onFieldChange({ ...fields, [f.key]: e.target.value })}
                                        className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/10" placeholder={f.placeholder} />
                                </div>
                            ))}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Packing Items (Cardboard Boxes)</label>
                                <button onClick={() => onFieldChange({ ...fields, packingItems: [...fields.packingItems, { name: '', count: 1, weight: 0 }] })} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 text-white/40 hover:text-white transition-all text-[8px] font-black uppercase"><Plus size={10} /> Add Box</button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar bg-white/[0.01] rounded-xl p-2 border border-white/5">
                                {fields.packingItems.length === 0 ? (
                                    <div className="py-6 text-center text-[10px] font-black text-white/10 uppercase tracking-[0.2em] italic">No extra packing items added</div>
                                ) : fields.packingItems.map((pi: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/[0.03] p-3 rounded-2xl border border-white/10 shadow-lg animate-in slide-in-from-left-4 duration-200">
                                        <input type="text" value={pi.name} onChange={e => { const n = [...fields.packingItems]; n[i] = { ...pi, name: e.target.value }; onFieldChange({ ...fields, packingItems: n }); }}
                                            className="flex-1 bg-transparent text-base font-black text-white outline-none focus:text-emerald-400 placeholder:text-white/10 transition-colors" placeholder="BOX DESCRIPTION (E.G. TOOLS, WRAPPING...)" />
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1">Quantity</span>
                                                <input type="number" value={pi.count} onChange={e => { const n = [...fields.packingItems]; n[i] = { ...pi, count: parseInt(e.target.value)||0 }; onFieldChange({ ...fields, packingItems: n }); }}
                                                    className="w-16 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-black text-white outline-none focus:border-white/30 transition-all" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1">Weight KG</span>
                                                <input type="number" value={pi.weight} onChange={e => { const n = [...fields.packingItems]; n[i] = { ...pi, weight: parseFloat(e.target.value)||0 }; onFieldChange({ ...fields, packingItems: n }); }}
                                                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-black text-white outline-none focus:border-white/30 transition-all" />
                                            </div>
                                        </div>
                                        <button onClick={() => { const n = fields.packingItems.filter((_:any,idx:number)=>idx!==i); onFieldChange({ ...fields, packingItems: n }); }}
                                            className="p-2 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all mt-3"><Trash2 size={18} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Senders Information</label>
                                <button onClick={() => onFieldChange({ ...fields, senders: [...fields.senders, ''] })} className="p-1 rounded-md bg-white/5 text-white/40 hover:text-white transition-all"><Plus size={14} /></button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-[100px] overflow-y-auto pr-2 custom-scrollbar">
                                {fields.senders.map((s: string, i: number) => (
                                    <div key={i} className="flex gap-2">
                                        <input type="text" value={s} onChange={e => { const n = [...fields.senders]; n[i] = e.target.value; onFieldChange({ ...fields, senders: n }); }}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:border-white/30" placeholder="Sender Name" />
                                        <button onClick={() => { const n = fields.senders.filter((_:any,idx:number)=>idx!==i); onFieldChange({ ...fields, senders: n.length?n:[''] }); }}
                                            className="p-2 text-white/20 hover:text-red-400 transition-all"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-2 flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Total Payload</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-white">{(totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0)).toLocaleString()}</span>
                                        <span className="text-[10px] font-bold text-white/30 uppercase">KG</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, ((totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0)) / 22000) * 100)}%` }} />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Active Units</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-white">{(buildConsolidatedItems().reduce((s:number, i:any) => s + (i.qty || 1), 0)) + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.count || 0), 0)}</span>
                                        <span className="text-[10px] font-bold text-white/30 uppercase">Units</span>
                                    </div>
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">Ready for In-Transit</div>
                                </div>
                                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Utilization</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-white">{Math.round(((totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0)) / 22000) * 100)}%</span>
                                        <span className="text-[10px] font-bold text-white/30 uppercase">Volume</span>
                                    </div>
                                    <div className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mt-1">High Density</div>
                                </div>
                            </div>

                            {/* Large Share Card */}
                            <div className={`p-6 rounded-[2.5rem] border transition-all duration-500 ${publicUrl ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.1)]' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-5">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${publicUrl ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/20'}`}>
                                            <Share2 size={24} />
                                        </div>
                                        <div>
                                            <h4 className={`text-lg font-black uppercase tracking-tighter ${publicUrl ? 'text-white' : 'text-white/20'}`}>Cloud Registry Link</h4>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                                                {publicUrl ? 'Sync Active · Publicly Accessible' : 'Pending Dispatch · Registry Offline'}
                                            </p>
                                        </div>
                                    </div>
                                    {publicUrl && (
                                        <button 
                                            onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Registry Link Copied'); }}
                                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                        >
                                            Copy URL
                                        </button>
                                    )}
                                </div>
                                {publicUrl && (
                                    <div className="mt-4 p-3 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                                        <p className="text-[10px] font-mono text-emerald-400/60 truncate">{publicUrl}</p>
                                    </div>
                                )}
                            </div>

                            {/* Axle Distribution Visualization */}
                            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 shadow-inner">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2"><Move className="w-3 h-3 text-emerald-500" /> Axle Load Distribution</span>
                                    <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Balanced Load</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex h-4 gap-1 rounded-lg overflow-hidden bg-white/5 p-0.5">
                                        <div className="h-full bg-emerald-500/80 rounded-sm relative group cursor-help" style={{ flex: panelStats.rPct || 1 }}>
                                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <div className="h-full bg-emerald-400/50 rounded-sm relative group cursor-help" style={{ flex: panelStats.mPct || 1 }}>
                                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <div className="h-full bg-emerald-300/30 rounded-sm relative group cursor-help" style={{ flex: panelStats.fPct || 1 }}>
                                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/20 px-1">
                                        <span>Rear Axle ({panelStats.rPct}%)</span>
                                        <span>Mid Section ({panelStats.mPct}%)</span>
                                        <span>Front Axle ({panelStats.fPct}%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">System Ready for Finalization</span>
                            </div>
                            <p className="text-[11px] text-white/30 leading-relaxed uppercase font-bold tracking-tight">Updating <span className="text-white/60">{truckCrates.length}</span> units to "In Transit" status. Positions will be baked into record descriptors.</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-1">Preview</label>
                            <div 
                                onClick={() => setShowLiveViewer(true)}
                                className="relative group rounded-[2rem] border border-white/10 bg-white/5 overflow-hidden aspect-video shadow-2xl cursor-pointer hover:border-emerald-500/30 transition-all"
                            >
                                <img 
                                    src={generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory)} 
                                    alt="Preview" 
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                                <div className="absolute bottom-4 left-6 flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-md">
                                        <Maximize2 size={14} className="text-emerald-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-white uppercase tracking-tight">Trailer Isometric</span>
                                        <span className="text-[8px] font-black text-emerald-400/80 uppercase tracking-widest">Active Mirror Sync</span>
                                    </div>
                                </div>
                                <div className="absolute top-4 right-6 px-3 py-1 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-[0.2em]">3D Lidar Point-Cloud</span>
                                </div>
                            </div>

                            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-1 mt-2">Documentation Engine</label>
                            <div className="grid grid-cols-1 gap-2">
                                <ExportCard id="html" title="Interactive HTML Manifest" type="HTML" color="#3b82f6" icon={Globe} prog={progress.html} url={urls.html} onGenerate={generateHtml} filename={`Manifesto_${exportTimestamp.current}.html`} />
                                <ExportCard id="pdf" title="Trailer Packing List" type="PDF" color="#ef4444" icon={FileText} prog={progress.pdf} url={urls.pdf} onGenerate={generatePdf} filename={`Packing_List_${exportTimestamp.current}.pdf`} />
                                <ExportCard id="xlsx" title="Master Packing List" type="XLSX" color="#10b981" icon={FileSpreadsheet} prog={progress.xlsx} url={urls.xlsx} onGenerate={generatePackingListXlsx} filename={`Master_Packing_List_${exportTimestamp.current}.xlsx`} />
                                <ExportCard id="allCrates" title="All Crates Manifesto" type="PDF" color="#f97316" icon={FileText} prog={progress.allCrates} url={urls.allCrates} onGenerate={generateAllManifestos} filename={`All_Crates_Manifesto_${exportTimestamp.current}.pdf`} />
                            </div>
                        </div>
                    
                        <div className="flex-1" />
                        <div className="flex flex-col gap-3 pt-6 border-t border-white/5">
                            <div className="grid grid-cols-3 gap-3">
                                <button onClick={onOpenDraft} className="py-4 rounded-2xl bg-white/5 text-white/60 font-black uppercase tracking-widest text-[9px] hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center gap-2">
                                    <FolderOpen size={14} /> Load Previous
                                </button>
                                <button onClick={onSaveDraft} className="py-4 rounded-2xl bg-white/10 text-white font-black uppercase tracking-widest text-[9px] hover:bg-white/20 transition-all border border-white/10 flex items-center justify-center gap-2">
                                    <Save size={14} /> Save Truck
                                </button>
                                <button onClick={onConfirm} disabled={isBusy} className="py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40">
                                    {isBusy ? 'Syncing...' : 'Dispatch'}
                                </button>
                            </div>
                            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-white/5 text-white/40 font-black uppercase tracking-widest text-[8px] hover:bg-white/10 transition-all border border-transparent hover:border-white/5">Cancel Protocol</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Save Draft Modal
interface SaveDraftProps {
    crateCount: number;
    onSave: (name: string) => void;
    onExport: (name: string) => void;
    onClose: () => void;
}

const SaveDraftModal = ({ crateCount, onSave, onExport, onClose }: SaveDraftProps) => {
    const [name, setName] = React.useState(`Load ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}`);
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-white/15 p-6 flex flex-col gap-5"
                style={{ backgroundColor: 'rgba(12,12,18,0.95)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-[14px] font-black uppercase tracking-tight text-white">Save Draft</h3>
                        <p className="text-[10px] text-white/40 mt-0.5">{crateCount} crates - positions + thumbnail</p>
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
                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">Exports as .truckload - includes map thumbnail</p>
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
                        style={{ backgroundColor: 'var(--main-color)', color: '#000' }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

// Open Draft Modal
interface OpenDraftProps {
    onLoad: (draft: TruckDraft) => void;
    onClose: () => void;
}

const OpenDraftModal = ({ onLoad, onClose }: OpenDraftProps) => {
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
                style={{ backgroundColor: 'rgba(12,12,18,0.95)', maxHeight: '82vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-[60] flex items-center justify-between px-6 py-4 border-b border-white/8 bg-[rgba(12,12,18,0.95)]">
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
                                            <div className="w-14 h-7 rounded shrink-0 border border-white/8 flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
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
                                            <button onClick={() => { onLoad(draft); onClose(); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all" style={{ backgroundColor: 'var(--main-color)', color: '#000' }}>Load</button>
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
    const [showReadyWizard, setShowReadyWizard] = useAtom(truckShowReadyWizardAtom);
    const [nestingBoxId, setNestingBoxId] = useState<string | null>(null);
    const [publicUrl, setPublicUrl] = useState<string | null>(null);
    const bookRate = useAtomValue(exchangeRateAtom);

    const [readyTruckFields, setReadyTruckFields] = useState({
        sealNumber: '',
        tractorNumber: '',
        truckPlates: '',
        trailerNumber: '',
        trailerPlates: '',
        senders: [''],
        packingItems: [] as Array<{ name: string; count: number; weight: number }>
    });

    const getItemsFromCrate = (crate: any, floorLabel?: string, boxLabel?: string, visited = new Set<string>()): any[] => {
        if (!crate || visited.has(crate.id)) return [];
        visited.add(crate.id);
        const { label: currentLabel } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[crate.id]);
        const nextFloorLabel = floorLabel || currentLabel;
        const nextBoxLabel = crate.type === 'cardboard' ? currentLabel : boxLabel;
        let results: any[] = [];
        if (crate.inventory_ids) {
            crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
                const [id, qtyStr] = e.split(':');
                const qty = parseInt(qtyStr || '1', 10) || 1;
                const inv = allInventory.find((i: any) => String(i.row) === id);
                if (inv) results.push({ id, qty, inv, packetIn: floorLabel, boxLabel: nextBoxLabel });
            });
        }
        const nested = allCrates.filter(c => c.parent_id === crate.id);
        nested.forEach(n => { results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)]; });
        return results;
    };

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
    const dockCrates = useMemo(() => allCrates.filter(c => !positions[c.id] && !c.parent_id), [allCrates, positions]);
    const truckCrates = useMemo(() => allCrates.filter(c => !!positions[c.id]), [allCrates, positions]);
    const truckNumbering = useMemo(() => getTruckCrateNumbering(truckCrates, positions), [truckCrates, positions]);

    const dockUnits = useMemo(() => dockCrates.filter(c => c.type !== 'cardboard'), [dockCrates]);
    const dockBoxes = useMemo(() => dockCrates.filter(c => c.type === 'cardboard'), [dockCrates]);
    const totalWeight = useMemo(() => truckCrates.reduce((s, c) => s + computeCrateWeight(c, allInventory, allCrates), 0), [truckCrates, allInventory, allCrates]);
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

    const handleLoad = useCallback((id: string) => {
        setPositions(p => {
            const crate = allCrates.find(c => c.id === id);
            if (!crate) return p;
            const pos = computeAutoPosition(crate, p, allCrates);
            const newPos = { ...p, [id]: { ...pos, z: 0 } };
            
            // Auto-load children
            const children = allCrates.filter(c => c.parent_id === id);
            children.forEach(child => {
                newPos[child.id] = { ...pos, z: 0 };
            });
            
            return newPos;
        });
        setSelectedId(id);
    }, [allCrates, computeAutoPosition]);

    const handleUnload = useCallback((id: string) => {
        setPositions(p => {
            const n = { ...p };
            const idsToUnload = [id];
            
            // Recursively find all children to unload
            const findChildren = (parentId: string) => {
                allCrates.filter(c => c.parent_id === parentId).forEach(child => {
                    idsToUnload.push(child.id);
                    findChildren(child.id);
                });
            };
            findChildren(id);
            
            idsToUnload.forEach(unId => delete n[unId]);
            return n;
        });
        setSelectedId(null);
    }, [allCrates]);

    const handleUpdatePos = useCallback((id: string, x: number, y: number) => {
        setPositions(p => {
            if (!p[id]) return p;
            const dx = x - p[id].x;
            const dy = y - p[id].y;
            const n = { ...p, [id]: { ...p[id], x, y } };
            
            // Move children too
            const moveChildren = (parentId: string) => {
                allCrates.filter(c => c.parent_id === parentId).forEach(child => {
                    if (n[child.id]) {
                        n[child.id] = { ...n[child.id], x: n[child.id].x + dx, y: n[child.id].y + dy };
                        moveChildren(child.id);
                    }
                });
            };
            moveChildren(id);
            return n;
        });
    }, [allCrates]);

    const handleUpdateXZ = useCallback((id: string, x: number, z: number) => {
        setPositions(p => {
            if (!p[id]) return p;
            const crate = allCrates.find(c => c.id === id);
            const unitW = (p[id].r === 90 ? crate?.length_cm : crate?.width_cm) || 0;
            const nx = Math.max(0, Math.min(TRUCK_L_CM - unitW, x));
            const nz = Math.max(0, z);
            
            const dx = nx - p[id].x;
            const dz = nz - (p[id].z || 0);
            const n = { ...p, [id]: { ...p[id], x: nx, z: nz } };
            
            const moveChildren = (parentId: string) => {
                allCrates.filter(c => c.parent_id === parentId).forEach(child => {
                    if (n[child.id]) {
                        n[child.id] = { ...n[child.id], x: n[child.id].x + dx, z: (n[child.id].z || 0) + dz };
                        moveChildren(child.id);
                    }
                });
            };
            moveChildren(id);
            return n;
        });
    }, [allCrates]);

    const handleRotate = useCallback((id: string) => {
        setPositions(p => {
            if (!p[id]) return p;
            return { ...p, [id]: { ...p[id], r: p[id].r === 0 ? 90 : 0 } };
        });
    }, []);
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

    const handleWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001))); }, []);
    
    const handleNest = async (boxId: string, targetId: string) => {
        const box = allCrates.find(c => c.id === boxId);
        const target = allCrates.find(c => c.id === targetId);
        if (!box || !target) return;

        const tid = toast.loading(`Nesting ${boxId.slice(0,6)} into ${targetId.slice(0,6)}...`);
        try {
            if (!isDummyMode) {
                // Update box to point to target via parent_id
                const { error: err } = await supabase.from('logistics').update({
                    parent_id: targetId,
                    status: 'Packed',
                    description: (box.description || '').replace(/POS:\d+,\d+,\d+/, '').trim(),
                    updated_at: new Date().toISOString()
                }).eq('id', box.id);
                if (err) throw err;
            }

            if (db) {
                const bDoc = await db.logistics.findOne({ selector: { id: box.id } }).exec();
                if (bDoc) await bDoc.patch({ parent_id: targetId, status: 'Packed' });
            }

            setPositions(p => { const n = { ...p }; delete n[boxId]; return n; });
            setNestingBoxId(null);
            toast.success('Successfully nested', { id: tid });
            onRefresh();
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Nesting failed', { id: tid });
        }
    };

    // ── Ready Truck — sync DB + PDF + XLSX ──
    const handleReadyTruck = async (f = readyTruckFields) => {
        setIsSaving(true);
        const tid = toast.loading('Synchronizing shipment data…');
        try {
            // 1. Sync positions to DB
            if (!isDummyMode) {
                for (const c of allCrates) {
                    const pos = positions[c.id];
                    const newStatus = pos ? 'In Transit' : (c.status === 'In Transit' ? 'Packed' : c.status);
                    const cleanDesc = (c.description || '').replace(/POS:\d+,\d+,\d+/, '').trim();
                    const finalDesc = pos ? `${cleanDesc} POS:${Math.round(pos.x)},${Math.round(pos.y)},${pos.r}`.trim() : cleanDesc;
                    const { error } = await supabase.from('logistics').update({ 
                        status: newStatus, 
                        description: finalDesc, 
                        updated_at: new Date().toISOString() 
                    }).eq('id', c.id);
                    if (error) throw error;
                    if (db) { const lDoc = await db.logistics.findOne({ selector: { id: c.id } }).exec(); if (lDoc) await lDoc.patch({ status: newStatus, description: finalDesc }); }
                }
                onRefresh(); setCratesVersion(v => v + 1);
            }

            const manifestId = `TRK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const ts = new Date().toLocaleString();

            // Calculate stats locally to avoid stale state
            const totalWeight = truckCrates.reduce((sum, c) => {
                const items = getItemsFromCrate(c);
                return sum + items.reduce((iSum, i) => iSum + (parseFloat(i.inv?.data?.weightKg || i.inv?.data?.weight_kg || 0) * (i.qty || 1)), 0);
            }, 0);

            const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);

            const shipmentPayload = JSON.parse(JSON.stringify({
                crates: truckCrates.map(c => {
                    const pos = positions[c.id];
                    const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
                    const crateColor = (vendors as any)[vendorList[0]]?.color || '#6b7280';
                    
                    return {
                        id: c.id,
                        label,
                        subtitle,
                        x: pos?.x || 0,
                        y: pos?.z || 0, // Height
                        z: pos?.y || 0, // Width/Depth
                        w: c.width_cm,
                        l: c.length_cm,
                        h: c.height_cm || 100,
                        r: pos?.r || 0,
                        color: crateColor,
                        vendorList,
                        items: getItemsFromCrate(c).map(item => {
                            const inv = item.inv;
                            const data = inv.data || {};
                            const norm = normalizeInventoryData(inv);
                            const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                            const tagId = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                            const vP = Object.keys(vendors).find(k => tagId.toUpperCase().startsWith(k)) || 'OTHER';
                            
                            return {
                                itemId: tagId,
                                vendorPrefix: vP,
                                tagColor: (vendors as any)[vP]?.color || '#6b7280',
                                name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                                type: data.shape || 'Unit',
                                desc: data.shortDescription || '',
                                qty: item.qty,
                                weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                                material: data.material || '',
                                color: data.color || '',
                                combinedAttr: `${data.color || ''} ${data.material ? '/ ' + data.material : ''}`.trim()
                            };
                        })
                    };
                }),
                truckStats: {
                    ...panelStats,
                    totalWeight
                },
                isoView,
                timestamp: ts
            }));

            // 3. Save to Supabase Registry
            console.log('[Shipment] Saving Payload to Cloud Registry:', shipmentPayload);
            if (!isDummyMode) {
                const { error: shipError } = await supabase.from('shipments').insert({
                    manifest_id: manifestId,
                    metadata: f,
                    payload: shipmentPayload,
                    timestamp: ts,
                    updated_at: new Date().toISOString()
                });
                if (shipError) {
                    console.error('[Shipment] Save Error:', shipError);
                    throw shipError;
                }
                console.log('[Shipment] Successfully saved to cloud.');
            } else {
                console.warn('[Shipment] Dummy mode active, skipping cloud save.');
            }

            // 4. Generate HTML Manifesto
            const htmlContent = generatePackingListHtml(manifestId, f, shipmentPayload);
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const htmlUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = htmlUrl;
            a.download = `Manifesto_${manifestId}.html`;
            a.click();

            const shareUrl = `${window.location.origin}${window.location.pathname}?truckid=${manifestId}`;
            setPublicUrl(shareUrl);

            toast.success(`Shipment ${manifestId} synchronized`, { id: tid, icon: '🚚', duration: 10000 });
            // Wizard stays open to show the public link
        } catch (err: any) { 
            toast.error(err.message || 'Synchronization failed', { id: tid }); 
        } finally { 
            setIsSaving(false); 
        }
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
    const buildDraft = useCallback((name: string, fields?: any): TruckDraft => {
        const thumbnail = generateMasterThumbnail(truckCrates, positions, allCrates, allInventory, name);
        return { 
            id: `draft_${Date.now()}`, 
            name, 
            savedAt: Date.now(), 
            crateCount: truckCrates.length, 
            positions: { ...positions }, 
            numbering: { ...truckNumbering },
            thumbnail: thumbnail || undefined,
            shipmentData: fields ? { ...fields } : undefined
        };
    }, [positions, truckCrates, allCrates, allInventory, truckNumbering]);

    const handleSaveDraft = useCallback((name: string) => {
        saveDraft(buildDraft(name, readyTruckFields));
        setShowSaveDraft(false);
        toast.success(`Draft "${name}" saved`);
    }, [buildDraft, readyTruckFields]);

    const handleExportDraft = useCallback((name: string) => {
        exportDraftFile(buildDraft(name, readyTruckFields));
        setShowSaveDraft(false);
    }, [buildDraft, readyTruckFields]);

    const handleLoadDraft = useCallback((draft: TruckDraft) => {
        setPositions(draft.positions as any);
        if (draft.shipmentData) {
            setReadyTruckFields(draft.shipmentData);
        }
        // numbering will be re-calculated automatically based on positions,
        // but if we wanted to force a manual sequence, we'd store it in state.
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
        <div className="flex flex-col text-white relative" onClick={() => setSelectedId(null)}>

            {/* ── HORIZONTAL DOCK STRIP ── */}
            <div
                className="sticky top-20 sm:top-24 z-[60] shrink-0 border-b border-white/10 backdrop-blur-3xl bg-black/40"
                onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
            >
                {dockCrates.length === 0 ? (
                    <div className="flex items-center gap-3 px-6 py-3 text-white/10">
                        <Truck size={14} strokeWidth={0.8} />
                        <span className="text-[9px] font-black uppercase tracking-[0.3em]">All units loaded</span>
                    </div>
                ) : isCompact ? (
                    /* ── COMPACT dock strip: segmented chips ── */
                    <div className="flex items-center gap-4 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none' }}>
                        {dockUnits.length > 0 && (
                            <div className="flex items-center gap-1.5 shrink-0 pr-4 border-r border-white/10">
                                <span className="text-[7px] font-black uppercase tracking-widest text-white/20 mr-1">Units</span>
                                {dockUnits.map(c => {
                                    const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
                                    const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#e5e7eb') : '#e5e7eb';
                                    const w = computeCrateWeight(c, allInventory, allCrates);
                                    const typeLabel = c.type === 'pallet' ? 'PLT' : 'CRT';
                                    return (
                                        <button key={c.id} onClick={() => handleLoad(c.id)}
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border shrink-0 cursor-pointer transition-all hover:bg-white/5"
                                            style={{ borderColor: `${col}35` }}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                                            <span className="text-[10px] font-black uppercase" style={{ color: col }}>{label}</span>
                                            <span className="text-[7px] font-black text-white/20">{typeLabel} · {w}KG</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {dockBoxes.length > 0 && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[7px] font-black uppercase tracking-widest text-white/20 mr-1">Boxes</span>
                                {dockBoxes.map(c => {
                                    const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
                                    const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#d97706') : '#d97706';
                                    const w = computeCrateWeight(c, allInventory, allCrates);
                                    return (
                                        <button key={c.id} onClick={() => handleLoad(c.id)}
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-amber-600/20 bg-amber-600/5 shrink-0 cursor-pointer transition-all hover:bg-amber-600/15"
                                        >
                                            <span className="text-[10px] font-black uppercase text-amber-500">{label}</span>
                                            <span className="text-[7px] font-black text-white/20">{w}KG</span>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setNestingBoxId(c.id); }}
                                                className="ml-1 p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black transition-colors"
                                            >
                                                <Box size={9} />
                                            </button>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── EXPANDED dock strip: Segmented sections ── */
                    <div className="flex items-stretch gap-8 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
                        {dockUnits.length > 0 && (
                            <div className="flex items-stretch gap-2 shrink-0 pr-8 border-r border-white/5">
                                <div className="flex flex-col justify-center px-2">
                                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20 [writing-mode:vertical-lr] rotate-180">Logistics</span>
                                </div>
                                {dockUnits.map(c => (
                                    <DockCard key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory} 
                                        onLoad={() => handleLoad(c.id)} 
                                        onNest={() => setNestingBoxId(c.id)}
                                    />
                                ))}
                            </div>
                        )}
                        {dockBoxes.length > 0 && (
                            <div className="flex items-stretch gap-2 shrink-0">
                                <div className="flex flex-col justify-center px-2">
                                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-amber-500/30 [writing-mode:vertical-lr] rotate-180">Cardboard</span>
                                </div>
                                {dockBoxes.map(c => (
                                    <DockCard key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory} 
                                        onLoad={() => handleLoad(c.id)} 
                                        onNest={() => setNestingBoxId(c.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── CANVAS AREA (info panel + trailer viewer) ── */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-0" onClick={e => e.stopPropagation()}>

                {/* ══ FIXED HEADER PANEL ══ */}
                <div
                    className="shrink-0 px-6 pt-3 pb-3 flex flex-col gap-3 border-b border-white/6"
                    style={{ backgroundColor: 'transparent' }}
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
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
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
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Units</span>
                                <span className="text-[13px] font-black text-emerald-400">{truckCrates.length}</span>
                                <span className="text-[9px] text-white/30">/ {allCrates.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">KG</span>
                                <span className="text-[13px] font-black" style={{ color: panelStats.statusColor }}>{Math.round(totalWeight).toLocaleString()}</span>
                                <span className="text-[9px] text-white/30">{panelStats.payloadPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Floor</span>
                                <span className="text-[13px] font-black text-white/80">{floorPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                <span className="text-[9px] text-white/40 font-black uppercase">Vol</span>
                                <span className="text-[13px] font-black text-white/80">{panelStats.volPct}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: `${panelStats.statusColor}40` }}>
                                <span className="text-[11px] font-black uppercase" style={{ color: panelStats.statusColor }}>{panelStats.status}</span>
                            </div>
                            {/* Mini dist bar */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 shrink-0 min-w-[120px]" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
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
                        /* ── EXPANDED stats row (Optimized for density) ── */
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                            {/* Units Chip */}
                            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] shrink-0">
                                <Truck size={24} className="text-emerald-400 opacity-60" />
                                <div className="flex flex-col">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black tracking-tighter text-white">{truckCrates.length}</span>
                                        <span className="text-[9px] text-white/30 font-bold">/ {allCrates.length}</span>
                                    </div>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/20 -mt-1">Active Units</span>
                                </div>
                            </div>

                            {/* Payload Chip */}
                            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] shrink-0">
                                <Gauge size={24} style={{ color: 'var(--main-color)' }} className="opacity-60" />
                                <div className="flex flex-col">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-xl font-black tracking-tighter" style={{ color: 'var(--main-color)' }}>{Math.round(totalWeight).toLocaleString()}</span>
                                        <span className="text-[9px] text-white/30 font-bold">KG</span>
                                    </div>
                                    <div className="flex items-center gap-2 -mt-0.5">
                                        <span className="text-[8px] font-black text-white/40 uppercase">{(totalWeight / 1000).toFixed(1)}T</span>
                                        <div className="h-1 bg-white/10 rounded-full overflow-hidden w-8">
                                            <div className="h-full bg-emerald-500" style={{ width: `${panelStats.payloadPct}%` }} />
                                        </div>
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{panelStats.payloadPct}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Space Chip (Floor + Volume) */}
                            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] shrink-0">
                                <Maximize2 size={22} className="text-blue-400 opacity-60" />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-base font-black text-white leading-none">{floorPct}</span>
                                                <span className="text-[8px] text-white/30 font-bold">%</span>
                                            </div>
                                            <span className="text-[7px] font-black uppercase text-white/20">Floor</span>
                                        </div>
                                        <div className="w-px h-6 bg-white/10" />
                                        <div className="flex flex-col">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-base font-black text-white leading-none">{panelStats.volPct}</span>
                                                <span className="text-[8px] text-white/30 font-bold">%</span>
                                            </div>
                                            <span className="text-[7px] font-black uppercase text-white/20">Vol ({panelStats.usedVol.toFixed(1)}m³)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Load Balance (Dist) */}
                            <div className="flex items-center gap-4 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] shrink-0 min-w-[200px]">
                                <div className="flex flex-col flex-1 gap-1.5">
                                    <div className="flex h-2 gap-0.5 rounded-full overflow-hidden bg-white/5">
                                        <div className="h-full bg-emerald-500/80" style={{ flex: panelStats.rPct || 1 }} />
                                        <div className="h-full bg-emerald-400/50" style={{ flex: panelStats.mPct || 1 }} />
                                        <div className="h-full bg-emerald-300/30" style={{ flex: panelStats.fPct || 1 }} />
                                    </div>
                                    <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-widest text-white/30">
                                        <span>R {panelStats.rPct}%</span>
                                        <span>M {panelStats.mPct}%</span>
                                        <span>F {panelStats.fPct}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Status Pill */}
                            <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl border shrink-0" style={{ backgroundColor: `${panelStats.statusColor}15`, borderColor: `${panelStats.statusColor}30` }}>
                                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: panelStats.statusColor }} />
                                <div className="flex flex-col">
                                    <span className="text-[12px] font-black uppercase tracking-tighter" style={{ color: panelStats.statusColor }}>{panelStats.status}</span>
                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">{panelStats.remaining.toLocaleString()} KG REMAINING</span>
                                </div>
                            </div>
                        </div>
                    )}

                 </div>


                {/* Canvas / Side View */}
                <div
                    ref={canvasRef}
                    className="flex-1 overflow-auto custom-scrollbar"
                    style={{ backgroundColor: 'transparent', touchAction: 'pan-x pan-y' }}
                    onWheel={handleWheel}
                >
                    {viewMode === 'side' ? (
                        <SideView
                            truckCrates={truckCrates} positions={positions} truckNumbering={truckNumbering}
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
                                style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})`, transformOrigin: 'top left', backgroundColor: 'rgba(255,255,255,0.025)' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <CmGrid />
                                {/* Axle markers at 72%, 82%, 90% of truck length (vertical lines) */}
                                {[0.72, 0.82, 0.90].map(frac => (
                                    <div key={frac} className="absolute top-0 bottom-0 w-px bg-white/15 pointer-events-none" style={{ left: frac * canvasW }}>
                                        <span className="absolute bottom-1 left-1 text-[7px] font-mono text-white/30">{Math.round(frac * TRUCK_L_CM)}cm</span>
                                    </div>
                                ))}
                                {truckCrates.filter(c => !!positions[c.id]).map(c => {
                                    const pos = positions[c.id];
                                    if (!pos) return null;
                                    return (
                                        <TruckCrate key={c.id} crate={c} allCrates={allCrates} allInventory={allInventory}
                                            pos={pos} truckSeq={truckNumbering[c.id]} isSelected={selectedId === c.id} zoom={zoom}
                                            onSelect={() => setSelectedId(c.id)}
                                            onUpdatePos={(x, y) => handleUpdatePos(c.id, x, y)}
                                            onRotate={() => handleRotate(c.id)}
                                            onUnload={() => handleUnload(c.id)}
                                            onNest={() => setNestingBoxId(c.id)} />
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
                    truckNumbering={truckNumbering}
                    totalWeight={totalWeight}
                    panelStats={panelStats}
                    floorPct={floorPct}
                    onClose={() => setShowExportModal(false)}
                />
            )}
            {showReadyWizard && (
                <ReadyTruckWizard
                    truckCrates={truckCrates}
                    allCrates={allCrates}
                    allInventory={allInventory}
                    positions={positions}
                    truckNumbering={truckNumbering}
                    totalWeight={totalWeight}
                    panelStats={panelStats}
                    floorPct={floorPct}
                    fields={readyTruckFields}
                    onFieldChange={setReadyTruckFields}
                    onConfirm={() => handleReadyTruck()}
                    onSaveDraft={() => setShowSaveDraft(true)}
                    onOpenDraft={() => setShowOpenDraft(true)}
                    onClose={() => setShowReadyWizard(false)}
                    isBusy={isSaving}
                    publicUrl={publicUrl}
                />
            )}
            {nestingBoxId && (
                <NestingTargetModal
                    boxId={nestingBoxId}
                    allCrates={allCrates}
                    onSelect={(targetId) => handleNest(nestingBoxId, targetId)}
                    onClose={() => setNestingBoxId(null)}
                />
            )}
        </div>
    );
};
