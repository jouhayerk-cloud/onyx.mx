import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { 
    Truck, RotateCcw, Trash2, Box, Layers, Grid3x3, 
    ZoomIn, ZoomOut, Maximize2, Gauge, 
    CheckCircle2, AlertCircle, Clock, History,
    Package, Filter, Search, ArrowRight,
    CornerDownRight, MoreHorizontal, LayoutGrid, Info, ChevronRight, Loader2, PanelTop, PanelTopClose, FolderOpen, Save, X, Download, Upload, ArrowUp, ArrowDown, ArrowLeft, FileText, FileSpreadsheet, Image as ImageIcon, Plus, Shield, IdCard, ClipboardCheck, Hash, Move, Globe, Share2, List, Eye, Pencil, Library, SquareLibrary
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { generatePackingListHtml } from './generatePackingListHtml';
import { generatePackingListXlsx } from '../../lib/xlsxUtils';
import { useDatabase, useNotify } from '../../lib/hooks';
import { 
    activeViewAtom,
    inventoryAtom, cratesVersionAtom, truckReadyTriggerAtom, 
    truckIsBusyAtom, truckViewModeAtom, truckIsCompactAtom,
    truckShowSaveDraftAtom, truckShowOpenDraftAtom,
    truckShowExportModalAtom, truckShowReadyWizardAtom,
    truckTopBarStateAtom, exchangeRateAtom, isDummyModeAtom,
    sentTruckIdAtom, universalViewAtom, truckShowPanelsAtom,
    inventoryArtifactConfigAtom,
    logisticsSubTabAtom,
    financeDataAtom
} from '../../lib/atoms';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, getCrateDisplayName } from '../../lib/utils';
import ExcelJS from 'exceljs';
import { exportCrateManifesto, ManifestoItem, exportCombinedTruckManifesto, ManifestoMeta } from '../../lib/crateManifesto';

import * as THREE from 'three';
import { CrateEditPanel, WireframeCrate } from './CratesInventoryView';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import gsap from 'gsap';

export const TRUCK_L_CM = 1615;
export const TRUCK_W_CM = 244;
export const TRUCK_H_CM = 279;
export const BASE_SCALE = 1.5; // px/cm Ã¢â‚¬â€ canvas is 2422 Ãƒâ€” 366 px at zoom=1

// getCrateDisplayName moved to utils.tsx



export function getTruckCrateNumbering(truckCrates: any[], positions: Record<string, any>) {
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Weight: sum item.weight_kg Ãƒâ€” qty from inventory_ids Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export function computeCrateWeight(crate: any, allInventory: any[], allCrates: any[], visited = new Set<string>()): number {
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
    
    const w = parseFloat(crate.width_cm) || 60;
    const l = parseFloat(crate.length_cm) || 60;
    const h = parseFloat(crate.height_cm) || w;
    return crate.weight_kg || Math.round((w * l * h) / 5000);
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CM Grid (LANDSCAPE: X=truck length 1615cm, Y=truck width 244cm) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const CmGrid: React.FC<{ isVertical?: boolean }> = ({ isVertical }) => {
    const minor = 50; const major = 100;
    const xLines: number[] = []; const yLines: number[] = [];
    for (let x = 0; x <= TRUCK_L_CM; x += minor) xLines.push(x);
    for (let y = 0; y <= TRUCK_W_CM; y += minor) yLines.push(y);

    const L = TRUCK_L_CM * BASE_SCALE;
    const W = TRUCK_W_CM * BASE_SCALE;

    return (
        <svg 
            className="absolute inset-0 pointer-events-none" 
            width={isVertical ? W : L} 
            height={isVertical ? L : W} 
            style={{ overflow: 'visible' }}
        >
            {xLines.map(x => {
                const xPos = isVertical ? (TRUCK_L_CM - x) * BASE_SCALE : x * BASE_SCALE;
                return (
                    <line 
                        key={`x${x}`} 
                        x1={isVertical ? 0 : xPos} 
                        y1={isVertical ? xPos : 0} 
                        x2={isVertical ? W : xPos} 
                        y2={isVertical ? xPos : W}
                        stroke={x % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} 
                        strokeWidth={x % major === 0 ? 1 : 0.5} 
                    />
                );
            })}
            {yLines.map(y => {
                const yPos = y * BASE_SCALE;
                return (
                    <line 
                        key={`y${y}`} 
                        x1={isVertical ? yPos : 0} 
                        y1={isVertical ? 0 : yPos} 
                        x2={isVertical ? yPos : L} 
                        y2={isVertical ? 0 : yPos}
                        stroke={y % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} 
                        strokeWidth={y % major === 0 ? 1 : 0.5} 
                    />
                );
            })}
            {!isVertical && xLines.filter(x => x % major === 0 && x > 0).map(x => (
                <text key={`xl${x}`} x={x * BASE_SCALE + 3} y={12} fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="monospace">{x}cm</text>
            ))}
            {!isVertical && yLines.filter(y => y % major === 0 && y > 0).map(y => (
                <text key={`yl${y}`} x={3} y={y * BASE_SCALE - 3} fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="monospace">{y}</text>
            ))}
        </svg>
    );
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Dock Card Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Isometric Wireframe Icon Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export const CrateWireframe: React.FC<{ w: number; l: number; h: number; color: string; size?: number; solid?: boolean }> = ({ w, l, h, color, size = 44, solid = false }) => {
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
    const fillOpacity = solid ? 1.0 : 0.03;
    const strokeOpacity = solid ? 0.3 : 1;
    
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible' }}>
            {/* bottom face */}
            <polygon points={pts([a,b,c,d])} fill={solid ? color : "none"} fillOpacity={solid ? 0.15 : 0} stroke={color} strokeWidth={0.6} strokeOpacity={0.25} />
            {/* front-left face */}
            <polygon points={pts([a,d,hh,e])} fill={color} fillOpacity={fillOpacity * 0.75} stroke={color} strokeWidth={0.7} strokeOpacity={strokeOpacity * 0.55} />
            {/* front-right face */}
            <polygon points={pts([a,b,f,e])} fill={color} fillOpacity={fillOpacity * 0.9} stroke={color} strokeWidth={0.7} strokeOpacity={strokeOpacity * 0.45} />
            {/* top face */}
            <polygon points={pts([e,f,g,hh])} fill={color} fillOpacity={fillOpacity} stroke={color} strokeWidth={0.9} strokeOpacity={strokeOpacity} />
            {/* vertical edges */}
            {!solid && [{a,b: e},{a: b,b: f},{a: c,b: g},{a: d,b: hh}].map(({a: p1,b: p2},i) => (
                <line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth={0.6} strokeOpacity={0.4} />
            ))}
        </svg>
    );
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Compact Data-Dense Card components Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function getDynamicCrateIdComponents(crate: any, allCrates: any[], allInventory: any[]) {
    if (!crate.inventory_ids || crate.status === 'Empty') return { date: '', vendors: [], sequence: crate.id.slice(0, 8).toUpperCase() };
    
    const d = crate.updated_at ? new Date(crate.updated_at) : (crate.date ? new Date(crate.date) : new Date());
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const datePrefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
    
    const vSet = new Set<string>();
    crate.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
        const [id] = entry.split(':');
        const inv = allInventory.find((i: any) => String(i.row) === id);
        if (inv?.data) {
            const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
            if (p) vSet.add(p.toUpperCase());
        }
    });
    const vendorsList = Array.from(vSet).sort();
    const vendorsStr = vendorsList.join('');
    
    const matchingCrates = allCrates.filter(c => {
        if (c.status === 'Empty' || !c.inventory_ids) return false;
        const cVSet = new Set<string>();
        c.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
            const [id] = entry.split(':');
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (inv?.data) {
                const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
                if (p) cVSet.add(p.toUpperCase());
            }
        });
        return Array.from(cVSet).sort().join('') === vendorsStr;
    });

    matchingCrates.sort((a, b) => {
        const tA = (a.updated_at || a.date) ? new Date(a.updated_at || a.date!).getTime() : 0;
        const tB = (b.updated_at || b.date) ? new Date(b.updated_at || b.date!).getTime() : 0;
        return tA === tB ? a.id.localeCompare(b.id) : tA - tB;
    });

    const index = matchingCrates.findIndex(c => c.id === crate.id);
    const sequence = index >= 0 ? index + 1 : 1;

    return { date: datePrefix, vendors: vendorsList, sequence: String(sequence) };
}

export const CompactDockCard: React.FC<{ 
    crate: any; allCrates: any[]; allInventory: any[]; 
    onLoad: () => void; onNest?: () => void; isCompact: boolean
}> = ({ crate, allCrates, allInventory, onLoad, onNest, isCompact }) => {
    const financeDocs = useAtomValue(financeDataAtom);
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const dynamicId = useMemo(() => getDynamicCrateIdComponents(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#adb5bd') : '#adb5bd';
    const w = computeCrateWeight(crate, allInventory, allCrates);
    const typeLabel = crate.type === 'pallet' ? 'PLT' : crate.type === 'cardboard' ? 'BOX' : 'CRT';
    
    const payStatus = useMemo(() => {
        const v = (crate.vendors || '').toUpperCase();
        const related = (financeDocs || []).filter(d => 
            (d.vendor_id === v || d.vendor_id === 'Crates') && 
            (d.related_ids?.includes(crate.id) || (typeof d.related_inventory_ids === 'string' && d.related_inventory_ids.split(',').includes(crate.id)))
        );
        if (related.some(d => d.status === 'Paid' || d.status === 'Dispersed' || d.status === 'Sent')) return 'Paid';
        if (related.some(d => d.status === 'Requested')) return 'Requested';
        const normV = (crate.vendors || '').toLowerCase();
        if ((normV.includes('juan') || normV.includes('simona')) && (crate.cost_mxn || 0) > 0) return 'Pending';
        return null;
    }, [crate, financeDocs]);

    return (
        <div className={`flex items-center transition-all group shrink-0 text-left ${isCompact ? 'gap-2 px-3 py-0.5 min-w-[120px]' : 'gap-6 px-4 py-3 min-w-[200px]'}`}>
            <button
                onClick={onLoad}
                className="flex items-center gap-3 transition-all active:scale-[0.95]"
                style={{ '--main-color': primaryColor } as React.CSSProperties}
            >
                <div className={`flex items-center justify-center transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_8px_16px_rgba(0,0,0,0.3)] ${isCompact ? 'w-6 h-6' : 'w-16 h-16'}`}>
                    <div style={{ transform: `scale(${isCompact ? 0.7 : 1.2})`, pointerEvents: 'none' }}>
                        <WireframeCrate 
                            w={crate.width_cm || 60} 
                            l={crate.length_cm || 60} 
                            h={crate.height_cm || 60} 
                            status={crate.status}
                            type={crate.type}
                            count={1}
                            fillPct={100}
                        />
                    </div>
                </div>
                <div className="flex flex-col">
                    <div className={`flex items-center transition-all duration-500 ${isCompact ? 'gap-1 mb-0' : 'gap-3 mb-1.5'}`}>
                        {(!dynamicId.date && !dynamicId.sequence) ? (
                            <span className={`font-black uppercase tracking-tighter text-white transition-all ${isCompact ? 'text-[10px]' : 'text-[16px]'}`}>{label}</span>
                        ) : (
                            <div className="flex items-center gap-1">
                                {dynamicId.date && (
                                    <div className="bg-white/10 px-1.5 py-0.5">
                                        <span className={`font-black text-white tracking-[0.1em] leading-none block ${isCompact ? 'text-[8px]' : 'text-[11px]'}`}>{dynamicId.date}</span>
                                    </div>
                                )}
                                {dynamicId.vendors.map((v) => (
                                    <div 
                                        key={v} 
                                        className="px-1.5 py-0.5"
                                        style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}
                                    >
                                        <span className={`font-black tracking-[0.1em] leading-none block text-black ${isCompact ? 'text-[8px]' : 'text-[11px]'}`}>{v}</span>
                                    </div>
                                ))}
                                {dynamicId.sequence && (
                                    <div className="px-2 py-0.5 bg-white/5">
                                        <span className={`font-black tracking-[0.1em] leading-none block text-white/90 ${isCompact ? 'text-[8px]' : 'text-[11px]'}`}>{dynamicId.sequence}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isCompact && (
                            <span className="font-black px-1.5 py-0.5 rounded-full border border-white/10 transition-all uppercase tracking-[0.2em] text-[8px]" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}>{typeLabel}</span>
                        )}
                        {payStatus && (
                            <span className={`font-black px-1.5 py-0.5 rounded-full border transition-all uppercase tracking-[0.2em] text-[8px] ${
                                payStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                payStatus === 'Requested' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                                {payStatus}
                            </span>
                        )}
                    </div>
                    {!isCompact && (
                        <div className="flex items-center gap-4 leading-none">
                            <span className="font-black text-white/80 uppercase tracking-widest text-[12px]">{crate.width_cm}Ãƒâ€”{crate.length_cm}</span>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="font-black tracking-tighter text-[13px]" style={{ color: 'var(--main-color)' }}>{w}KG</span>
                        </div>
                    )}
                </div>
            </button>

            <div className="flex items-center gap-3 ml-auto">
                {onNest && crate.type === 'cardboard' && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onNest(); }}
                        className="text-emerald-400/40 hover:text-emerald-400 transition-all opacity-0 group-hover:opacity-100 hover:scale-125"
                        title="Nest Unit"
                    >
                        <CornerDownRight size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

export const CompactItemCard: React.FC<{ 
    item: any; 
    onLoad: () => void 
}> = ({ item, onLoad }) => {
    const data = item.data || {};
    const norm = normalizeInventoryData(item);
    const calculated = calculateCodesAndPrices(norm, 17.5, '326');
    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(item.row);
    const vendorPrefix = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
    const primaryColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#adb5bd';
    const w = parseFloat(data.weightKg || data.weight_kg) || 0;
    
    return (
        <button
            onClick={onLoad}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] transition-all group shrink-0 text-left cursor-pointer active:scale-[0.98] h-[52px]"
        >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <CrateWireframe 
                    w={parseFloat(data.widthCm || data.width_cm) || 40} 
                    l={parseFloat(data.lengthCm || data.length_cm) || 40} 
                    h={parseFloat(data.heightCm || data.height_cm) || 40} 
                    color={primaryColor} 
                    size={40} 
                    solid={true}
                />
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[200px]">
                <div className="flex items-center gap-1.5 leading-none mb-1">
                    <span className="text-[11px] font-black uppercase tracking-tighter truncate text-white/80">{data.shape || 'Unit'}</span>
                    <div className="flex items-center gap-1 px-1 py-0.5 rounded-sm bg-black/40 text-white/40 border border-white/5">
                        <Hash size={7} />
                        <span className="text-[7px] font-black">{tag}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 leading-none opacity-60">
                    <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[9px] font-bold truncate text-white/40">{data.shortDescription || 'Artifact'}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Gauge size={9} className="text-emerald-500/40" />
                        <span className="text-[9px] font-black text-white/50">{w}KG</span>
                    </div>
                </div>
                {(data.width_cm || data.material) && (
                    <div className="flex items-center gap-2 mt-1 opacity-40">
                        {data.width_cm && (
                            <div className="flex items-center gap-1">
                                <Maximize2 size={8} />
                                <span className="text-[7px] font-black">{data.width_cm}Ãƒâ€”{data.length_cm}</span>
                            </div>
                        )}
                        {data.material && (
                            <div className="flex items-center gap-1">
                                <Layers size={8} />
                                <span className="text-[7px] font-black uppercase truncate max-w-[40px]">{data.material}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </button>
    );
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Mini Iso View for Deployed Trailers (SVG based) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const MiniIsoView: React.FC<{
    truckCrates: any[];
    positions: Record<string, any>;
    allCrates: any[];
    allInventory: any[];
    truckNumbering?: Record<string, number>;
}> = ({ truckCrates, positions, allCrates, allInventory, truckNumbering = {} }) => {
    const W = 300;
    const H = 150;
    const S = W / (TRUCK_L_CM + TRUCK_W_CM) * 0.95;
    const ox = W * 0.5;
    const oy = H * 0.35;

    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];

    const effectivePositions = { ...positions };
    if (Object.keys(effectivePositions).length === 0) {
        truckCrates.forEach(c => {
            if (c.id) {
                effectivePositions[c.id] = {
                    x: c.x ?? 0,
                    y: c.z !== undefined ? c.z : (c.y ?? 0),
                    r: c.r ?? 0,
                    z: c.y !== undefined && c.z !== undefined ? c.y : 0
                };
            }
        });
    }

    const sortedIds = Object.keys(effectivePositions).sort((a, b) => 
        (effectivePositions[a].x + effectivePositions[a].y) - (effectivePositions[b].x + effectivePositions[b].y)
    );

    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
            {sortedIds.map(id => {
                const crate = crateMap.get(id);
                if (!crate || crate.parent_id) return null;
                const p = effectivePositions[id];
                const rotated = p.r === 90;
                const w = parseFloat(crate.width_cm as any) || parseFloat(crate.w as any) || 120;
                const l = parseFloat(crate.length_cm as any) || parseFloat(crate.l as any) || 80;
                const h = parseFloat(crate.height_cm as any) || parseFloat(crate.h as any) || 100;
                const dX = rotated ? w : l, dY = rotated ? l : w;
                const zOff = p.z || 0;

                const col = crate.color || (vendors[getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[id]).vendorList[0] as keyof typeof vendors]?.color || '#F97316');

                const pts = [
                    iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0),
                    iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h)
                ];
                const ptStr = (indices: number[]) => indices.map(i => `${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`).join(' ');

                return (
                    <g key={id}>
                        {/* Front-left */}
                        <polygon points={ptStr([0,3,7,4])} fill={col} fillOpacity={0.75} stroke={col} strokeWidth={0.2} strokeOpacity={0.3} />
                        {/* Front-right */}
                        <polygon points={ptStr([0,1,5,4])} fill={col} fillOpacity={0.9} stroke={col} strokeWidth={0.2} strokeOpacity={0.3} />
                        {/* Top */}
                        <polygon points={ptStr([4,5,6,7])} fill={col} fillOpacity={1.0} stroke={col} strokeWidth={0.3} strokeOpacity={0.4} />
                    </g>
                );
            })}
        </svg>
    );
};

export const DeployedTrailerCard: React.FC<{ 
    shipment: any; 
    onRecall: () => void;
    onDelete: () => void;
    onView: () => void;
    allCrates: any[];
    allInventory: any[];
}> = ({ shipment, onRecall, onDelete, onView, allCrates, allInventory }) => {
    const date = new Date(shipment.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const trkDate = `TRK-${dateStr}`;

    const payload = useMemo(() => {
        try { return typeof shipment.payload === 'string' ? JSON.parse(shipment.payload) : shipment.payload; } catch (e) { return null; }
    }, [shipment]);
    const weight = Math.round(payload?.truckStats?.totalWeight || 0);
    const truckCrates = payload?.crates || [];
    const truckPositions = payload?.positions || {};
    const truckNumbering = payload?.numbering || {};
    
    
    return (
        <div className="flex items-center gap-6 group shrink-0 transition-all select-none">
            {/* Larger SVG Crate Map Indicator */}
            <div className="relative w-36 h-28 flex items-center justify-center transition-all duration-700 group-hover:scale-110 cursor-pointer active:scale-95" onClick={onView}>
                <div className="absolute inset-0 bg-white/5 rounded-full scale-0 group-hover:scale-150 transition-all duration-1000 blur-[40px] opacity-20 transform-gpu will-change-transform" />
                {truckCrates.length > 0 ? (
                    <MiniIsoView 
                        truckCrates={truckCrates} 
                        positions={truckPositions} 
                        allCrates={allCrates} 
                        allInventory={allInventory} 
                        truckNumbering={truckNumbering}
                    />
                ) : (
                    <CrateWireframe 
                        w={530} l={240} h={270} 
                        color="#F97316" 
                        size={84} 
                        solid={true}
                    />
                )}
            </div>

            <div className="flex flex-col gap-1 min-w-[120px]">
                <span className="text-[16px] font-black text-white/90 tracking-tighter uppercase leading-none">{trkDate}</span>
                <span className="text-[9px] font-black text-emerald-500/40 uppercase tracking-[0.4em]">{weight}KG LOADED</span>
            </div>

            <div className="flex items-center gap-4">
                <button 
                    onClick={onRecall}
                    className="w-16 h-16 rounded-full text-white/10 hover:text-white hover:scale-125 transition-all duration-500 flex items-center justify-center group/btn active:scale-90"
                    title="Recall Load"
                >
                    <ArrowUp size={32} strokeWidth={2.5} className="transition-transform group-hover/btn:-translate-y-1" />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-3 text-rose-500/5 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                    title="Delete Record"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
};

const DockCard: React.FC<{ 
    crate: any; allCrates: any[]; allInventory: any[]; 
    onLoad: () => void; onNest?: () => void 
}> = ({ crate, allCrates, allInventory, onLoad, onNest }) => {
    const financeDocs = useAtomValue(financeDataAtom);
    const { label, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#e5e7eb') : '#e5e7eb';
    const itemCount = (crate.inventory_ids || '').split(',').filter(Boolean).length;
    const w = computeCrateWeight(crate, allInventory, allCrates);
    const typeLabel = crate.type === 'pallet' ? 'PLT' : crate.type === 'cardboard' ? 'BOX' : 'CRT';
    
    const payStatus = useMemo(() => {
        const v = (crate.vendors || '').toUpperCase();
        const related = (financeDocs || []).filter(d => 
            (d.vendor_id === v || d.vendor_id === 'Crates') && 
            (d.related_ids?.includes(crate.id) || (typeof d.related_inventory_ids === 'string' && d.related_inventory_ids.split(',').includes(crate.id)))
        );
        if (related.some(d => d.status === 'Paid' || d.status === 'Dispersed' || d.status === 'Sent')) return 'Paid';
        if (related.some(d => d.status === 'Requested')) return 'Requested';
        const normV = (crate.vendors || '').toLowerCase();
        if ((normV.includes('juan') || normV.includes('simona')) && (crate.cost_mxn || 0) > 0) return 'Pending';
        return null;
    }, [crate, financeDocs]);

    return (
        <div 
            className="flex flex-col gap-1.5 p-2.5 rounded-xl transition-all group shrink-0 text-left border-2 cursor-pointer shadow-lg relative"
            style={{
                minWidth: 130, maxWidth: 150,
                background: `${primaryColor}15`,
                borderColor: `${primaryColor}40`,
            }}
        >
            <button onClick={onLoad} className="absolute inset-0 z-0" />
            
            {/* Top row: wireframe + type badge + Edit */}
            <div className="flex items-start justify-between w-full mb-0 relative z-10 pointer-events-none">
                <div style={{ transform: 'scale(1.1)', transformOrigin: 'top left' }}>
                    <WireframeCrate 
                        w={crate.width_cm || 60} 
                        l={crate.length_cm || 60} 
                        h={crate.height_cm || 60} 
                        status={crate.status}
                        type={crate.type}
                        count={1}
                        fillPct={100} 
                    />
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-black/40 text-white border border-white/10">
                        {typeLabel}
                    </span>
                    {payStatus && (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                            payStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            payStatus === 'Requested' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                            {payStatus}
                        </span>
                    )}
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
                    {crate.width_cm}Ãƒâ€”{crate.length_cm}Ãƒâ€”{crate.height_cm || '?'} CM
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
        </div>
    );
};



// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Truck Crate Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// IMPORTANT: items live in the UNSCALED canvas coordinate space.
// CSS transform(zoom) is applied to the parent; layout uses BASE_SCALE only.
// Drag delta must divide by zoom to convert screen-px Ã¢â€ â€™ canvas-px.
const TruckCrate: React.FC<{
    crate: any; allCrates: any[]; allInventory: any[];
    pos: { x: number; y: number; r: number };
    truckSeq?: number;
    isSelected: boolean; zoom: number;
    onSelect: () => void; onUpdatePos: (x: number, y: number) => void;
    onRotate: () => void; onUnload: () => void; onNest?: () => void;
    isVertical?: boolean;
}> = ({ crate, allCrates, allInventory, pos: rawPos, truckSeq, isSelected, zoom, onSelect, onUpdatePos, onRotate, onUnload, onNest, isVertical }) => {
    const { label, subtitle, vendorList } = useMemo(() => getCrateDisplayName(crate, allCrates, allInventory, truckSeq), [crate, allCrates, allInventory, truckSeq]);
    const primaryColor = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
    const isDraggingRef = useRef(false);
    const pos = {
        x: parseFloat(rawPos?.x as any) || 0,
        y: parseFloat(rawPos?.y as any) || 0,
        r: rawPos?.r || 0,
        z: rawPos?.z || 0
    };

    const children = useMemo(() => allCrates.filter(c => c.parent_id === crate.id), [allCrates, crate.id]);

    const cW = parseFloat(crate.width_cm) || 60;
    const cL = parseFloat(crate.length_cm) || 60;
    const pxX = (pos.r === 0 ? cL : cW) * BASE_SCALE;
    const pxY = (pos.r === 0 ? cW : cL) * BASE_SCALE;
    const dimX = pos.r === 0 ? cL : cW;
    const dimY = pos.r === 0 ? cW : cL;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation(); onSelect();
        isDraggingRef.current = true;
        const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const deltaX = (me.clientX - sx) / (zoom * BASE_SCALE);
            const deltaY = (me.clientY - sy) / (zoom * BASE_SCALE);
            
            let nx, ny;
            if (isVertical) {
                // In vertical mode: screen X movement affects truck Y, screen Y affects truck X (inverted)
                // Visual X = Truck Y, Visual Y = Truck L - Truck X - DimX
                ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + deltaX));
                nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox - deltaY));
            } else {
                nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox + deltaX));
                ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + deltaY));
            }
            onUpdatePos(nx, ny);
        };
        const onUp = () => { isDraggingRef.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    }, [pos.x, pos.y, dimX, dimY, zoom, onSelect, onUpdatePos, isVertical]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation(); onSelect();
        isDraggingRef.current = true;
        const touch = e.touches[0];
        const sx = touch.clientX, sy = touch.clientY, ox = pos.x, oy = pos.y;
        
        const onTouchMove = (te: TouchEvent) => {
            if (!isDraggingRef.current || te.touches.length !== 1) return;
            const t = te.touches[0];
            const deltaX = (t.clientX - sx) / (zoom * BASE_SCALE);
            const deltaY = (t.clientY - sy) / (zoom * BASE_SCALE);

            let nx, ny;
            if (isVertical) {
                ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + deltaX));
                nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox - deltaY));
            } else {
                nx = Math.max(0, Math.min(TRUCK_L_CM - dimX, ox + deltaX));
                ny = Math.max(0, Math.min(TRUCK_W_CM - dimY, oy + deltaY));
            }
            onUpdatePos(nx, ny);
        };
        
        const onTouchEnd = () => { 
            isDraggingRef.current = false; 
            window.removeEventListener('touchmove', onTouchMove); 
            window.removeEventListener('touchend', onTouchEnd); 
        };
        
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }, [pos.x, pos.y, dimX, dimY, zoom, onSelect, onUpdatePos, isVertical]);

    const iconSize = Math.min(pxX, pxY) * 0.38;
    const textScale = Math.max(10, Math.min(22, pxX / 8));

    const visualX = isVertical ? pos.y * BASE_SCALE : pos.x * BASE_SCALE;
    const visualY = isVertical ? (TRUCK_L_CM - pos.x - dimX) * BASE_SCALE : pos.y * BASE_SCALE;
    const visualW = isVertical ? pxY : pxX;
    const visualH = isVertical ? pxX : pxY;

    return (
        <div className="absolute select-none" style={{ 
            left: visualX, 
            top: visualY, 
            width: visualW, 
            height: visualH, 
            zIndex: isSelected ? 50 : 10
        }}>
            <div
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onMouseUp={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                className="w-full h-full cursor-grab active:cursor-grabbing flex flex-col items-center justify-center overflow-hidden relative group touch-none"
                style={{
                    backgroundColor: primaryColor,
                    boxShadow: isSelected 
                        ? `0 20px 60px -10px rgba(0,0,0,0.8), inset 0 0 40px rgba(255,255,255,0.4)` 
                        : `0 8px 24px -4px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.1)`,
                }}
            >
                {/* Visual children indicator */}
                {children.length > 0 && (
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1 p-1 pointer-events-none">
                        {children.slice(0, 3).map(child => (
                            <div key={child.id} className="w-2 h-2 rounded-full bg-white/40 shadow-sm" />
                        ))}
                    </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none drop-shadow-xl overflow-hidden">
                    <CrateWireframe 
                        w={crate.width_cm} 
                        l={crate.length_cm} 
                        h={crate.height_cm || 50} 
                        color="rgba(0,0,0,0.6)" 
                        size={iconSize * 1.5} 
                        solid={false}
                    />
                </div>
                
                <div className="flex flex-col items-center pointer-events-none w-full px-2 mt-1">
                    <span className="font-black uppercase text-center leading-[0.9] text-black/80 tracking-tighter"
                        style={{ fontSize: textScale * 1.4 }}>
                        {label}
                    </span>
                    {pxX > 50 && pxY > 30 && (
                        <div className="mt-1 flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-black/20" />
                            <span className="font-black text-black/50 uppercase tracking-widest" style={{ fontSize: Math.max(8, textScale * 0.5) }}>
                                {computeCrateWeight(crate, allInventory, allCrates)} KG
                            </span>
                        </div>
                    )}
                </div>

                {/* Selection Overlay */}
                {isSelected && (
                    <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                )}
            </div>
        </div>
    );
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Isometric View (interactive 3-D perspective view) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const IsoView: React.FC<{
    truckCrates: any[];
    positions: Record<string, { x: number; y: number; r: number; z?: number }>;
    truckNumbering: Record<string, number>;
    allCrates: any[]; allInventory: any[];
    zoom: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
}> = ({ truckCrates, positions, truckNumbering, allCrates, allInventory, zoom, selectedId, onSelect }) => {
    const S = 1.2 * BASE_SCALE;
    const ox = 400;
    const oy = 250;
    const W = TRUCK_L_CM * S;
    const H = (TRUCK_W_CM + TRUCK_H_CM) * S * 1.5;

    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];

    const sortedIds = useMemo(() => {
        return Object.keys(positions).sort((a, b) => {
            const pa = positions[a];
            const pb = positions[b];
            return (pa.x + pa.y) - (pb.x + pb.y);
        });
    }, [positions]);

    return (
        <div className="w-full h-full backdrop-blur-3xl bg-white/[0.02] border-t border-white/10 shadow-inner relative">
            <div className="py-[100vh] pl-[300vw] pr-[100vw]" style={{ minWidth: W * zoom + 12000, minHeight: H * zoom + 4000 }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} 
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', overflow: 'visible' }}
                    onClick={() => onSelect('')}
                >
                    <path 
                        d={`M ${iso(0,0,0).join(',')} L ${iso(TRUCK_L_CM,0,0).join(',')} L ${iso(TRUCK_L_CM,TRUCK_W_CM,0).join(',')} L ${iso(0,TRUCK_W_CM,0).join(',')} Z`} 
                        fill="rgba(255,255,255,0.03)" 
                        stroke="rgba(255,255,255,0.15)" 
                        strokeWidth={1} 
                    />
                    
                    {Array.from({ length: Math.floor(TRUCK_L_CM / 100) + 1 }).map((_, i) => (
                        <path key={`x${i}`} d={`M ${iso(i * 100, 0, 0).join(',')} L ${iso(i * 100, TRUCK_W_CM, 0).join(',')}`} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                    ))}
                    {Array.from({ length: Math.floor(TRUCK_W_CM / 100) + 1 }).map((_, i) => (
                        <path key={`y${i}`} d={`M ${iso(0, i * 100, 0).join(',')} L ${iso(TRUCK_L_CM, i * 100, 0).join(',')}`} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                    ))}
                    
                    
                    {sortedIds.map(id => {
                        const crate = allCrates.find(c => c.id === id);
                        if (!crate || crate.parent_id) return null;
                        const p = {
                            x: parseFloat(positions[id]?.x as any) || 0,
                            y: parseFloat(positions[id]?.y as any) || 0,
                            z: parseFloat(positions[id]?.z as any) || 0,
                            r: positions[id]?.r || 0
                        };
                        const rotated = p.r === 90;
                        const w = parseFloat(crate.width_cm) || 60, l = parseFloat(crate.length_cm) || 60, h = parseFloat(crate.height_cm) || 100;
                        const dX = rotated ? w : l, dY = rotated ? l : w;
                        const zOff = p.z;
                        const isSelected = id === selectedId;
                        const { vendorList, label } = getCrateDisplayName(crate, allCrates, allInventory, truckNumbering[id]);
                        const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';

                        const pts = [
                            iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0),
                            iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h)
                        ];

                        const ptsStr = (indices: number[]) => indices.map(i => pts[i].join(',')).join(' ');

                        return (
                            <g key={id} onClick={(e) => { e.stopPropagation(); onSelect(id); }} className="cursor-pointer group">
                                {/* Front-left face */}
                                <polygon points={ptsStr([0,3,7,4])} fill={col} fillOpacity={0.75} stroke={col} strokeWidth={isSelected ? 1.5 : 0.5} strokeOpacity={0.3} />
                                {/* Front-right face */}
                                <polygon points={ptsStr([0,1,5,4])} fill={col} fillOpacity={0.9} stroke={col} strokeWidth={isSelected ? 1.5 : 0.5} strokeOpacity={0.3} />
                                {/* Top face */}
                                <polygon 
                                    points={ptsStr([4,5,6,7])} 
                                    fill={col} 
                                    fillOpacity={isSelected ? 1.0 : 0.95} 
                                    stroke={isSelected ? '#fff' : col} 
                                    strokeWidth={isSelected ? 2.5 : 1} 
                                    className="transition-all duration-300"
                                />
                                
                                {/* Inner glow for selection */}
                                {isSelected && (
                                    <polygon points={ptsStr([4,5,6,7])} fill="white" fillOpacity={0.1} filter="blur(12px)" />
                                )}

                                {/* Label - Floating above */}
                                <text x={pts[4][0] + (pts[6][0] - pts[4][0])/2} y={pts[4][1] + (pts[6][1] - pts[4][1])/2} 
                                    textAnchor="middle" fill={isSelected ? "white" : "rgba(0,0,0,0.7)"} 
                                    fontSize={Math.min(14, dX/3)} fontWeight="900" 
                                    style={{ pointerEvents: 'none', filter: isSelected ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' : 'none' }}>
                                    {label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Side View (interactive 2-D lateral view) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        <div 
            className="w-full h-full backdrop-blur-3xl bg-white/[0.02] border-t border-white/10 shadow-inner relative"
        >
            <div className="py-[40vh] px-[40vw]" style={{ minWidth: SVG_W * zoom + 800, minHeight: SVG_H * zoom + 800 }}>
                {/* Header bar */}
                <div className="flex items-center gap-6 mb-6 px-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-white/20" /> Ã¢â€”â‚¬ Rear
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] font-black text-white/70 uppercase tracking-[0.6em] italic">
                        Trailer Matrix Ã¢â‚¬â€ {TRUCK_L_CM}cm Ãƒâ€” {TRUCK_H_CM}cm H
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                        Front Ã¢â€“Â¶ <span className="w-1 h-1 rounded-full bg-white/20" />
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
                        {/* Crates Ã¢â‚¬â€ non-selected first, selected on top */}
                        {[...crateItems.filter(cr => !cr.isSelected), ...crateItems.filter(cr => cr.isSelected)].map(cr => (
                            <g key={cr.id} style={{ cursor: 'grab' }} onMouseDown={e => handleCrateMouseDown(e, cr)}>
                                {/* Selection Glow & Shadow */}
                                {cr.isSelected && (
                                    <>
                                        <rect x={cr.px - 4} y={cr.py - 4} width={cr.pw + 8} height={cr.ph + 8} fill="white" opacity={0.15} filter="blur(12px)" rx={8} />
                                        <rect x={cr.px + 4} y={cr.py + 4} width={cr.pw} height={cr.ph} fill="rgba(0,0,0,0.5)" rx={4} />
                                    </>
                                )}
                                {/* Body Ã¢â‚¬â€ full solid color */}
                                <rect x={cr.px} y={cr.py} width={cr.pw} height={cr.ph}
                                    fill={cr.col}
                                    stroke={cr.isSelected ? 'white' : 'rgba(0,0,0,0.4)'}
                                    strokeWidth={cr.isSelected ? 2.5 : 1.5}
                                    rx={4} opacity={cr.isSelected ? 1 : 0.92} />

                                {/* 3D Wireframe Icon Overlay */}
                                <foreignObject x={cr.px} y={cr.py} width={cr.pw} height={cr.ph} style={{ pointerEvents: 'none' }}>
                                    <div className="w-full h-full flex items-center justify-center opacity-30 overflow-hidden">
                                        <CrateWireframe 
                                            w={parseFloat(cr.crate.width_cm as any) || 60} 
                                            l={parseFloat(cr.crate.length_cm as any) || 60} 
                                            h={parseFloat(cr.crate.height_cm as any) || 50} 
                                            color="rgba(0,0,0,0.6)" 
                                            size={Math.min(cr.pw, cr.ph) * 1.5} 
                                            solid={false} 
                                        />
                                    </div>
                                </foreignObject>

                                {/* Selection ring */}
                                {cr.isSelected && <rect x={cr.px - 2} y={cr.py - 2} width={cr.pw + 4} height={cr.ph + 4}
                                    fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} rx={4} strokeDasharray="4,3" />}
                                {/* Label Ã¢â‚¬â€ dark text over solid fill for contrast */}
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Draft Save / Load / Export / Import System Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Thumbnail generator Ã¢â‚¬â€ draws exact trailer map without padding Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        ctx.fillRect((parseFloat(pos.x as any)||0) * scale, (parseFloat(pos.y as any)||0) * scale, lenX, lenY);

        // Border
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 2;
        ctx.strokeRect((parseFloat(pos.x as any)||0) * scale, (parseFloat(pos.y as any)||0) * scale, lenX, lenY);
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('ONYX Ã‚Â· TRUCKLOAD TOP VIEW', 40, H - 40);
    
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
            ctx.fillText(label, (parseFloat(pos.x as any)||0) * scale + lenX / 2, (parseFloat(pos.y as any)||0) * scale + lenY / 2 + 10);
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${w} KG`, (parseFloat(pos.x as any)||0) * scale + lenX / 2, (parseFloat(pos.y as any)||0) * scale + lenY / 2 + 32);
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
        ctx.fillRect((parseFloat(pos.x as any)||0) * scale, H - zOff - h, lenX, h);

        // Border
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 2;
        ctx.strokeRect((parseFloat(pos.x as any)||0) * scale, H - zOff - h, lenX, h);
    }
    
    // Watermark
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('ONYX Ã‚Â· TRUCKLOAD SIDEVIEW', 40, H - 40);

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
            ctx.fillText(label, (parseFloat(pos.x as any)||0) * scale + lenX / 2, H - zOff - h / 2 + 10);
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${w} KG`, (parseFloat(pos.x as any)||0) * scale + lenX / 2, H - zOff - h / 2 + 32);
        }
    }
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

function generateIsoViewThumbnail(
    truckCrates: any[],
    positions: Record<string, { x: number; y: number; r: number; z?: number }>,
    allCrates: any[],
    allInventory: any[],
    isMini: boolean = false
): string {
    const W = isMini ? 600 : 2400;
    const H = isMini ? 600 : 1200;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, W, H);

    const scale = W / (TRUCK_L_CM + TRUCK_W_CM);
    const S = scale * (isMini ? 1.05 : 0.72); 
    const ox = isMini ? W * 0.5 : W * 0.28;
    const oy = isMini ? H * 0.35 : H * 0.18;
    
    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];

    // Draw trailer floor
    if (!isMini) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const f1 = iso(0,0,0), f2 = iso(TRUCK_L_CM,0,0), f3 = iso(TRUCK_L_CM,TRUCK_W_CM,0), f4 = iso(0,TRUCK_W_CM,0);
        ctx.moveTo(...f1); ctx.lineTo(...f2); ctx.lineTo(...f3); ctx.lineTo(...f4); ctx.closePath();
        ctx.stroke();
    }

    // Reconstruct positions if missing (e.g. from historical shipment payloads)
    const effectivePositions = { ...positions };
    if (Object.keys(effectivePositions).length === 0) {
        truckCrates.forEach(c => {
            if (c.id) {
                effectivePositions[c.id] = {
                    x: c.x ?? 0,
                    y: c.z !== undefined ? c.z : (c.y ?? 0), // Handle depth
                    r: c.r ?? 0,
                    z: c.y !== undefined && c.z !== undefined ? c.y : 0 // Handle height
                };
            }
        });
    }

    // Sort crates for correct depth rendering (X+Y)
    const sortedIds = Object.keys(effectivePositions).sort((a, b) => (effectivePositions[a].x + effectivePositions[a].y) - (effectivePositions[b].x + effectivePositions[b].y));

    // Pre-calculate numbering for performance
    const numbering = getTruckCrateNumbering(truckCrates, effectivePositions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    for (const id of sortedIds) {
        const crate = crateMap.get(id);
        if (!crate || crate.parent_id) continue; 
        const p = effectivePositions[id];
        const rotated = p.r === 90;
        const w = parseFloat(crate.width_cm as any) || parseFloat(crate.w as any) || 120;
        const l = parseFloat(crate.length_cm as any) || parseFloat(crate.l as any) || 80;
        const h = parseFloat(crate.height_cm as any) || parseFloat(crate.h as any) || 100;
        const dX = rotated ? w : l, dY = rotated ? l : w;
        const zOff = p.z || 0;
        
        const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
        const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
        
        const pts = [
            iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0),
            iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h)
        ];

        // Draw faces as solid 3D boxes
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        
        // 1. Back/Bottom faces (optional, usually skipped for solid)
        
        // 1. Front-left face (shaded)
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[3]); ctx.lineTo(...pts[7]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // 2. Front-right face (darker shaded)
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
        
        // 3. Top face (brightest)
        ctx.fillStyle = col;
        ctx.globalAlpha = 1.0;
        ctx.beginPath(); ctx.moveTo(...pts[4]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[7]); ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.globalAlpha = 1.0;

        // Labels in Iso View
        if (!isMini) {
            const { label } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
            const wKg = computeCrateWeight(crate, allInventory, allCrates);
            const pMid = iso(p.x + dX/2, p.y + dY/2, zOff + h);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.font = 'black 22px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(label, pMid[0], pMid[1] - 10);
            ctx.font = 'bold 14px monospace';
            ctx.fillText(`${wKg}KG`, pMid[0], pMid[1] + 12);
        }
    }
    
    if (!isMini) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('ONYX Ã‚Â· TRUCKLOAD ISOMETRIC VIEW', 40, H - 40);
    }

    return canvas.toDataURL('image/png', 0.85);
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
    
    // Ã¢â€â‚¬Ã¢â€â‚¬ Background Ã¢â€â‚¬Ã¢â€â‚¬
    ctx.fillStyle = '#0F111A'; // Deep midnight
    ctx.fillRect(0, 0, W, H);
    
    // Ã¢â€â‚¬Ã¢â€â‚¬ Layout Dividers Ã¢â€â‚¬Ã¢â€â‚¬
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.moveTo(W/2, H/2); ctx.lineTo(W/2, H);
    ctx.stroke();

    const numbering = getTruckCrateNumbering(truckCrates, positions);
    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    // Ã¢â€â‚¬Ã¢â€â‚¬ 1. ISOMETRIC VIEW (Top Half) Ã¢â€â‚¬Ã¢â€â‚¬
    const drawIso = (ctx: CanvasRenderingContext2D, rect: {x:number; y:number; w:number; h:number}) => {
        const scale = rect.w / (TRUCK_L_CM + TRUCK_W_CM) * 0.8;
        const S = scale * 0.85;
        const ox = rect.x + rect.w * 0.35;
        const oy = rect.y + rect.h * 0.25;
        
        const iso = (x: number, y: number, z: number): [number, number] => [
            ox + (x - y) * S * 0.866,
            oy + (x + y) * S * 0.5 - z * S
        ];

        // Floor - removed for containerless design

        const sortedIds = Object.keys(positions).sort((a, b) => (positions[a].x + positions[a].y) - (positions[b].x + positions[b].y));
        for (const id of sortedIds) {
            const crate = crateMap.get(id);
            if (!crate || crate.parent_id) continue;
            const p = positions[id];
            const rotated = p.r === 90;
            const w = parseFloat(crate.width_cm as any)||120, l = parseFloat(crate.length_cm as any)||80, h = parseFloat(crate.height_cm as any) || 100;
            const dX = rotated ? w : l, dY = rotated ? l : w;
            const zOff = p.z || 0;
            const { vendorList } = getCrateDisplayName(crate, allCrates, allInventory, numbering[id]);
            const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#F97316') : '#F97316';
            
            const pts = [
                iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, parseFloat(zOff as any)||0), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, parseFloat(zOff as any)||0),
                iso(parseFloat(p.x as any)||0, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, parseFloat(p.y as any)||0, (parseFloat(zOff as any)||0) + h), iso((parseFloat(p.x as any)||0) + dX, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h), iso(parseFloat(p.x as any)||0, (parseFloat(p.y as any)||0) + dY, (parseFloat(zOff as any)||0) + h)
            ];

            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            
            // 1. Front-left face (shaded)
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.75;
            ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[3]); ctx.lineTo(...pts[7]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
            
            // 2. Front-right face (darker shaded)
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[4]); ctx.closePath(); ctx.fill(); ctx.stroke();
            
            // 3. Top face (brightest)
            ctx.fillStyle = col;
            ctx.globalAlpha = 1.0;
            ctx.beginPath(); ctx.moveTo(...pts[4]); ctx.lineTo(...pts[5]); ctx.lineTo(...pts[6]); ctx.lineTo(...pts[7]); ctx.closePath(); ctx.fill(); ctx.stroke();
            
            ctx.globalAlpha = 1.0;
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('ISOMETRIC LOAD VIEW Ã‚Â· SOLID MATRIX', rect.x + 40, rect.y + rect.h - 40);
    };

    // Ã¢â€â‚¬Ã¢â€â‚¬ 2. TOP VIEW (Bottom Left) Ã¢â€â‚¬Ã¢â€â‚¬
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
            ctx.fillRect(ox + (parseFloat(pos.x as any)||0) * scale, oy + (parseFloat(pos.y as any)||0) * scale, lenX, lenY);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(ox + (parseFloat(pos.x as any)||0) * scale, oy + (parseFloat(pos.y as any)||0) * scale, lenX, lenY);
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('TOP VIEW Ã‚Â· DISTRIBUTION MAP', rect.x + 40, rect.y + rect.h - 40);
    };

    // Ã¢â€â‚¬Ã¢â€â‚¬ 3. SIDE VIEW (Bottom Right) Ã¢â€â‚¬Ã¢â€â‚¬
    const drawSide = (ctx: CanvasRenderingContext2D, rect: {x:number; y:number; w:number; h:number}) => {
        const padding = 60;
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
            ctx.fillRect(ox + (parseFloat(pos.x as any)||0) * scale, oy + (TRUCK_H_CM * scale) - zOff - h, lenX, h);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(ox + (parseFloat(pos.x as any)||0) * scale, oy + (TRUCK_H_CM * scale) - zOff - h, lenX, h);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SIDE VIEW Ã‚Â· STACKING PROFILE', rect.x + 40, rect.y + rect.h - 40);
    };

    drawIso(ctx, {x:0, y:0, w:W, h:H/2});
    drawTop(ctx, {x:0, y:H/2, w:W/2, h:H/2});
    drawSide(ctx, {x:W/2, y:H/2, w:W/2, h:H/2});

    // Ã¢â€â‚¬Ã¢â€â‚¬ Master Branding Ã¢â€â‚¬Ã¢â€â‚¬
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ONYX LOGISTICS Ã‚Â· MASTER LOAD ARCHIVE Ã‚Â· ${draftName?.toUpperCase() || 'UNTITLED LOAD'}`, W/2, 50);
    
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText(`GENERATED: ${new Date().toLocaleString()} Ã‚Â· v${TRUCKLOAD_VERSION} HYBRID ENGINE`, W/2, 75);

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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Nesting Target Selector Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
                    <p className="text-[8px] font-black text-white/10 uppercase tracking-[0.5em]">Onyx Logistics Protocol Ã‚Â· Nesting v1.2</p>
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Export Card Component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Export Modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
            const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : '');
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
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : ''),
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
                    id: c.id, label, type: c.type, dims: `${c.width_cm}Ãƒâ€”${c.length_cm}Ãƒâ€”${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100,
                    parentLabel
                };
            });

            const meta = {
                dynamicId: name || 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}Ãƒâ€”${TRUCK_W_CM} cm`,
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
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : ''),
                    weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                    costMxn: 0, costUsd: 0,
                    imageUrls: photos,
                    tagColor: vendors[vP as keyof typeof vendors]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                    packetIn: item.packetIn || '', // Floor level owner
                    boxLabel: item.boxLabel || ''  // Immediate box owner
                };
            });
            const meta = {
                dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}Ãƒâ€”${crate.length_cm}Ãƒâ€”${crate.height_cm||'?'} cm`,
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
                id: c.id, label, type: c.type, dims: `${c.width_cm}Ãƒâ€”${c.length_cm}Ãƒâ€”${c.height_cm||'?'} cm`,
                weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
            };
        });

        const trailerMeta = {
            dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}Ãƒâ€”${TRUCK_W_CM} cm`,
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
                const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : '');
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
        <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Interactive Truck Viewer (Local Preview) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€â‚¬Ã¢â€â‚¬ Interactive Truck Viewer (Local Preview) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const InteractiveTruckViewer: React.FC<{
    truckCrates: any[];
    positions: Record<string, any>;
    allCrates: any[];
    allInventory: any[];
    truckNumbering: Record<string, number>;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}> = ({ truckCrates, positions, allCrates, allInventory, truckNumbering, selectedId, onSelect }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const setInventoryArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        crates: Map<string, THREE.Mesh>;
    } | null>(null);

    // 1. Initialize Scene (Run Once)
    useEffect(() => {
        if (!containerRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = null; // Transparent for containerless feel

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(30, 20, 30);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        sun.position.set(20, 40, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);
        
        // Trailer Bed
        const bedGeo = new THREE.BoxGeometry(16.15, 0.1, 2.44);
        const bedMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a1c24, 
            metalness: 0.8, 
            roughness: 0.2,
            envMapIntensity: 1.0
        });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.receiveShadow = true;
        bed.position.y = -0.05;
        scene.add(bed);

        const cratesMap = new Map<string, THREE.Mesh>();
        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap };

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handleClick = (event: MouseEvent) => {
            if (!containerRef.current || !sceneRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, sceneRef.current.camera);
            const meshes = Array.from(sceneRef.current.crates.values());
            const intersects = raycaster.intersectObjects(meshes);

            if (intersects.length > 0) {
                const mesh = intersects[0].object as THREE.Mesh;
                let foundId = null;
                for (const [id, m] of sceneRef.current.crates.entries()) {
                    if (m === mesh) { foundId = id; break; }
                }
                if (foundId) {
                    onSelect(foundId);
                    
                    // Animate camera focus
                    const targetTarget = mesh.position.clone();
                    const targetCam = targetTarget.clone().add(new THREE.Vector3(8, 6, 8));
                    
                    gsap.to(sceneRef.current.controls.target, {
                        x: targetTarget.x, y: targetTarget.y, z: targetTarget.z,
                        duration: 1.2, ease: "power3.inOut"
                    });
                    gsap.to(sceneRef.current.camera.position, {
                        x: targetCam.x, y: targetCam.y, z: targetCam.z,
                        duration: 1.2, ease: "power3.inOut"
                    });
                }
            } else {
                onSelect(null);
                // Reset camera
                gsap.to(sceneRef.current.controls.target, { x: 0, y: 0, z: 0, duration: 1.2, ease: "power3.inOut" });
                gsap.to(sceneRef.current.camera.position, { x: 30, y: 20, z: 30, duration: 1.2, ease: "power3.inOut" });
            }
        };

        containerRef.current.addEventListener('click', handleClick);

        let animationId: number;
        const animate = () => {
            if (!sceneRef.current) return;
            animationId = requestAnimationFrame(animate);
            sceneRef.current.controls.update();
            sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
        };
        animate();

        let timeoutId: number;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                if (!containerRef.current || !sceneRef.current) return;
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                sceneRef.current.camera.aspect = w / h;
                sceneRef.current.camera.updateProjectionMatrix();
                sceneRef.current.renderer.setSize(w, h);
            }, 100) as unknown as number;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
            cancelAnimationFrame(animationId);
            if (containerRef.current) {
                containerRef.current.removeEventListener('click', handleClick);
                if (renderer.domElement && containerRef.current.contains(renderer.domElement)) {
                    containerRef.current.removeChild(renderer.domElement);
                }
            }
            renderer.dispose();
            sceneRef.current = null;
        };
    }, [onSelect]);

    // 2. Sync Meshes (Run on data change)
    useEffect(() => {
        if (!sceneRef.current) return;
        const { scene, crates } = sceneRef.current;

        // Remove deleted crates
        const currentIds = new Set(truckCrates.map(c => c.id));
        for (const [id, mesh] of Array.from(crates.entries())) {
            if (!currentIds.has(id)) {
                scene.remove(mesh);
                crates.delete(id);
            }
        }

        // Add or Update crates
        truckCrates.forEach(c => {
            const rawPos = positions[c.id];
            if (!rawPos) return;
            const pos = {
                x: parseFloat(rawPos.x as any) || 0,
                y: parseFloat(rawPos.y as any) || 0,
                z: parseFloat(rawPos.z as any) || 0,
                r: rawPos.r || 0
            };
            
            const dw = (parseFloat(c.width_cm) || 60) / 100;
            const dl = (parseFloat(c.length_cm) || 60) / 100;
            const dh = (parseFloat(c.height_cm) || 100) / 100;
            const isRotated = pos.r === 90;
            
            const targetX = (pos.x / 100) - (16.15 / 2) + (isRotated ? dw : dl) / 2;
            const targetY = (pos.z / 100) + dh/2 + 0.01;
            const targetZ = (pos.y / 100) - (2.44 / 2) + (isRotated ? dl : dw) / 2;
            
            const mesh = crates.get(c.id);
            
            if (!mesh) {
                const geo = new THREE.BoxGeometry(dl, dh, dw);
                const col = vendors[c.vendor_id as keyof typeof vendors]?.color || '#F97316';
                const mat = new THREE.MeshStandardMaterial({ 
                    color: col, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.95 
                });
                const newMesh = new THREE.Mesh(geo, mat);
                newMesh.castShadow = true; newMesh.receiveShadow = true;
                
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(geo),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
                );
                newMesh.add(edges);
                
                newMesh.position.set(targetX, targetY, targetZ);
                newMesh.rotation.y = isRotated ? Math.PI / 2 : 0;
                scene.add(newMesh);
                crates.set(c.id, newMesh);
            } else {
                // Update position with GSAP for smooth drag
                gsap.to(mesh.position, { x: targetX, y: targetY, z: targetZ, duration: 0.3, ease: 'power2.out' });
                gsap.to(mesh.rotation, { y: isRotated ? Math.PI / 2 : 0, duration: 0.3, ease: 'power2.out' });
            }

        });
    }, [truckCrates, positions]);

    // 3. Sync UI selected state
    useEffect(() => {
        if (!sceneRef.current) return;
        if (selectedId) {
            const sel = allCrates.find(c => c.id === selectedId);
            if (sel) {
                const itemIds = sel.inventory_ids 
                    ? sel.inventory_ids.split(',').filter(Boolean).map((e: string) => e.split(':')[0])
                    : (sel.inventoryItems || []).map((i: any) => i.row);

                setInventoryArtifactConfig({
                    isOpen: true,
                    itemIds,
                    title: `Crate: ${getCrateDisplayName(sel, allCrates, allInventory).label || sel.id}`,
                    viewMode: 'sidebar'
                });
            }
        } else {
            setInventoryArtifactConfig(prev => ({ ...prev, isOpen: false }));
        }
    }, [selectedId, allCrates, allInventory, setInventoryArtifactConfig]);

    return <div ref={containerRef} className="w-full h-full cursor-pointer" />;
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ready Truck Wizard Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
                    dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : ''),
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
                    id: c.id, label, type: c.type, dims: `${c.width_cm}Ãƒâ€”${c.length_cm}Ãƒâ€”${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: col,
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100, parentLabel
                };
            });

            const meta: ManifestoMeta = {
                dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}Ãƒâ€”${TRUCK_W_CM} cm`,
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
            ws.addRow(['ONYX LOGISTICS Ã‚Â· TRAILER PACKING LIST']);
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
                    const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”');
                    
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
                        dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('Ãƒâ€”') + (data.lengthCm ? ' cm' : ''),
                        weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                        costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                        packetIn: item.packetIn || '', boxLabel: item.boxLabel || ''
                    };
                });
                const meta = {
                    dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}Ãƒâ€”${crate.length_cm}Ãƒâ€”${crate.height_cm||'?'} cm`,
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
                    id: c.id, label, type: c.type, dims: `${c.width_cm}Ãƒâ€”${c.length_cm}Ãƒâ€”${c.height_cm||'?'} cm`,
                    weight: computeCrateWeight(c, allInventory, allCrates), color: (vendors as any)[vendorList[0]]?.color || '#6b7280',
                    l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
                };
            });
            const trailerMeta: ManifestoMeta = {
                dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}Ãƒâ€”${TRUCK_W_CM} cm`,
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
        <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
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
                                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black">Ã¢Å“â€œ</div>
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-tight">Shipment Live in Registry</h4>
                                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">3D Digital Mirror Created</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Registry Link Copied'); }} className="px-4 py-2 rounded-xl bg-white/10 text-[9px] font-black text-white uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10">Copy Share Link</button>
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
                                                {publicUrl ? 'Sync Active Ã‚Â· Publicly Accessible' : 'Pending Dispatch Ã‚Â· Registry Offline'}
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
                                <div className="absolute bottom-4 left-6 flex items-center justify-between right-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-md">
                                            <Maximize2 size={14} className="text-emerald-400" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-white uppercase tracking-tight">Trailer Isometric</span>
                                            <span className="text-[8px] font-black text-emerald-400/80 uppercase tracking-widest">Active Mirror Sync</span>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Handle case where we might want to view current draft in 3D
                                            // For now, if we have a recalled shipment, use that
                                            /* if (recalledShipment?.manifest_id) {
                                                setSentTruckId(recalledShipment.manifest_id);
                                                setView('truck');
                                            } else {
                                                toast.error("3D View requires a finalized or recalled shipment");
                                            } */
                                        }}
                                        className="p-2.5 rounded-xl bg-white text-black hover:bg-emerald-400 transition-all shadow-xl flex items-center gap-2 group/btn"
                                    >
                                        <Share2 size={14} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">View 3D</span>
                                    </button>
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

const SharePopup: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
    return (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl animate-in fade-in duration-700 overflow-hidden flex flex-col">
            <div className="flex-1 w-full bg-black relative">
                <iframe 
                    src={url} 
                    className="w-full h-full border-none" 
                    title="Onyx 3D Visualizer"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
                
                {/* Floating Immersive Actions */}
                <div className="absolute top-10 right-10 flex items-center gap-6 animate-in slide-in-from-top-10 duration-1000">
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(url);
                            toast.success('Public URL copied to clipboard');
                        }}
                        className="px-10 py-5 rounded-[2rem] bg-white text-black font-black text-[12px] tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4"
                    >
                        <Share2 size={22} /> COPY MANIFESTO LINK
                    </button>
                    <button onClick={onClose} className="w-16 h-16 rounded-full bg-black/40 border border-white/10 backdrop-blur-2xl flex items-center justify-center text-white/60 hover:text-white hover:bg-black/60 transition-all group shadow-2xl">
                        <X size={36} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                </div>
                
                {/* HUD Overlay for the iframe */}
                <div className="absolute bottom-10 left-10 p-8 rounded-[2rem] border border-white/5 bg-black/40 backdrop-blur-2xl flex flex-col gap-2 pointer-events-none">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em]">Network Topology</span>
                    <span className="text-[14px] font-black text-white/80 uppercase tracking-widest">{url.split('?')[0]}</span>
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
        <div className="fixed inset-0 z-[450] flex items-center justify-center" onClick={onClose}>
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Floating Ready Truck HUD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const ReadyTruckHUD: React.FC<{ metadata: any, stats: any }> = ({ metadata, stats }) => {
    return (
        <div className="absolute top-40 left-10 z-[50] p-8 rounded-[2.5rem] bg-black/40 backdrop-blur-[40px] border border-white/5 flex flex-col gap-6 shadow-2xl animate-in slide-in-from-left-10 duration-1000">
            <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/30">
                    <Shield size={22} strokeWidth={1.5} />
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Security Seal</span>
                    <span className="text-lg font-black uppercase text-emerald-400 tracking-tighter">{metadata?.sealNumber || 'OPEN'}</span>
                </div>
            </div>
            <div className="w-full h-px bg-white/5" />
            <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Tractor</span>
                    <span className="text-[12px] font-black uppercase text-white/80">{metadata?.tractorNumber || 'Ã¢â‚¬â€'}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Trailer</span>
                    <span className="text-[12px] font-black uppercase text-white/80">{metadata?.trailerNumber || 'Ã¢â‚¬â€'}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Load Weight</span>
                    <span className="text-[12px] font-black uppercase text-white/80">{Math.round(stats?.totalWeight || 0).toLocaleString()} KG</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Status</span>
                    <span className="text-[12px] font-black uppercase text-emerald-500/60 font-mono tracking-tighter">{stats?.status || 'OPTIMAL'}</span>
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
        <div className="fixed inset-0 z-[450] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-white/15 flex flex-col overflow-hidden"
                style={{ backgroundColor: 'rgba(12,12,18,0.95)', maxHeight: '82vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-[60] flex items-center justify-between px-6 py-4 border-b border-white/8 bg-[rgba(12,12,18,0.95)]">
                    <div>
                        <h3 className="text-[14px] font-black uppercase tracking-tight text-white">Load Drafts</h3>
                        <p className="text-[10px] text-white/40">{drafts.length} saved Ã‚Â· <span className="text-white/20">.truckload</span></p>
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
                                    {/* Thumbnail strip Ã¢â‚¬â€ shown on hover if available */}
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



// ————————————————— Main ——————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————
export const TruckingModule: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const db = useDatabase();
    const notify = useNotify();
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const setCratesVersion = useSetAtom(cratesVersionAtom);
    const setSentTruckId = useSetAtom(sentTruckIdAtom);
    const setView = useSetAtom(universalViewAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);
    const [isSaving, setIsSaving] = useAtom(truckIsBusyAtom);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [positions, setPositions] = useState<Record<string, { x: number; y: number; r: number; z?: number }>>({});
    const [zoom, setZoom] = useState(1.0);
    const [topBarState, setTopBarState] = useAtom(truckTopBarStateAtom);
    const [recentShipments, setRecentShipments] = useState<any[]>([]);
    const [loadingShipments, setLoadingShipments] = useState(false);
    const [viewMode, setViewMode] = useAtom(truckViewModeAtom);
    const [isCompact, setIsCompact] = useAtom(truckIsCompactAtom);
    const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
    const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
    const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
    const [showReadyWizard, setShowReadyWizard] = useAtom(truckShowReadyWizardAtom);
    const setInventoryArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const showPanels = useAtomValue(truckShowPanelsAtom);
    const [nestingBoxId, setNestingBoxId] = useState<string | null>(null);
    const [publicUrl, setPublicUrl] = useState<string | null>(null);
    const [recalledShipment, setRecalledShipment] = useState<any | null>(null);
    const [showSharePopup, setShowSharePopup] = useState(false);
    const [editingCrate, setEditingCrate] = useState<any | null>(null);


    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    // Panning state
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const [readyTruckFields, setReadyTruckFields] = useState({
        sealNumber: '',
        tractorNumber: '',
        truckPlates: '',
        trailerNumber: '',
        trailerPlates: '',
        senders: [''],
        packingItems: [] as Array<{ name: string; count: number; weight: number }>
    });
    const bookRate = useAtomValue(exchangeRateAtom);

    const looseItems = useMemo(() => {
        return allInventory.filter(item => {
            const data = item.data || {};
            const parentId = data.parent_id || data.crate_id;
            return !parentId && !positions[String(item.row)];
        });
    }, [allInventory, positions]);

    // ─── TRAILER POSITIONS ARE LOCAL ONLY ────────────────────────────────────
    // Positions are pure React state (useState). They are NEVER read from or
    // written to the database. The DB only stores crate status (Packed/Deployed)
    // which is set exclusively by the Ready Truck / finalize shipment flow.
    // Draft trailer layouts are saved to localStorage via the TruckDraft system.

    useEffect(() => {
        if (topBarState === 'trailers') {
            const fetchRecent = async () => {
                setLoadingShipments(true);
                try {
                    const { data, error } = await supabase.from('shipments')
                        .select('*')
                        .order('timestamp', { ascending: false })
                        .limit(10);
                    if (error) throw error;
                    setRecentShipments(data || []);
                } catch (err) { console.error('Recent shipments fetch error:', err); }
                finally { setLoadingShipments(false); }
            };
            fetchRecent();
        }
    }, [topBarState]);

    const handleRecall = useCallback((shipment: any) => {
        try {
            const payload = typeof shipment.payload === 'string' ? JSON.parse(shipment.payload) : shipment.payload;
            if (!payload) return;
            const newPos: Record<string, any> = {};
            payload.crates?.forEach((c: any) => {
                // Correctly map saved shipment coordinates back to internal state
                // x is length axis (cab to rear)
                // y in payload is height, z in payload is depth (side to side)
                newPos[c.id] = { 
                    x: c.x, 
                    y: c.z || 0, // Depth axis
                    r: c.r || 0, 
                    z: c.y || 0  // Height axis
                };
            });
            setPositions(newPos);
            setRecalledShipment(shipment);
            setReadyTruckFields({
                sealNumber: shipment.metadata?.sealNumber || '',
                tractorNumber: shipment.metadata?.tractorNumber || '',
                truckPlates: shipment.metadata?.truckPlates || '',
                trailerNumber: shipment.metadata?.trailerNumber || '',
                trailerPlates: shipment.metadata?.trailerPlates || '',
                senders: shipment.metadata?.senders || [''],
                packingItems: payload.packingItems || []
            });
            notify.success(`Recalled manifest ${shipment.manifest_id}`);
            setTopBarState('crates');
        } catch (e) { notify.error('Failed to recall shipment'); }
    }, [setPositions, setTopBarState, setRecalledShipment, setReadyTruckFields]);


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
        let timeoutId: number;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                const mobile = window.innerWidth < 768;
                setIsMobile(mobile);
                if (mobile) {
                    setIsCompact(true);
                }
            }, 100) as unknown as number;
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
        };
    }, [setIsCompact]);

    // Trailer positions are LOCAL ONLY — never synced to DB.
    // Use the TruckDraft (localStorage) system to persist layouts.
    // The DB only stores crate status (Packed/Deployed) set by Ready Truck.

    const allCrates = useMemo(() => {
        // Exclude 'Deployed' Ã¢â‚¬â€ deployed crates have been shipped and are not part of active trucking
        const live = docs.filter(d => {
            const s = (d.status || '').toLowerCase().trim();
            return ['packed', 'partial', 'in transit'].includes(s);
        });
        
        // If we have a recalled shipment, we might need to inject "virtual" crates 
        // for IDs that are in positions but NOT in the live docs (e.g. because status changed or record missing)
        if (recalledShipment) {
            const payload = typeof recalledShipment.payload === 'string' ? JSON.parse(recalledShipment.payload) : recalledShipment.payload;
            const recalledCrates = (payload?.crates || []).filter((rc: any) => !live.some(l => l.id === rc.id));
            
            // Map virtual crates to the expected doc schema
            const virtual = recalledCrates.map((rc: any) => ({
                id: rc.id,
                type: rc.h > 40 ? 'crate' : 'pallet', // heuristics
                status: 'In Transit',
                width_cm: rc.w,
                length_cm: rc.l,
                height_cm: rc.h,
                inventory_ids: (rc.items || []).map((i: any) => `${i.itemId}:${i.qty}`).join(','),
                description: `RECALLED: ${rc.label || rc.id}`,
                isVirtual: true
            }));
            
            return [...live, ...virtual];
        }
        
        return live;
    }, [docs, recalledShipment]);
    // Dock: show ONLY crates not currently loaded on the trailer that are Packed or Partial.
    // Crates that are 'In Transit' or 'Deployed' are excluded from the dock.
    const dockCrates = useMemo(() => allCrates.filter(c => 
        !positions[c.id] && !c.parent_id && ['packed', 'partial'].includes((c.status || '').toLowerCase().trim())
    ), [allCrates, positions]);
    
    // Deployed: show crates that are 'In Transit' or 'Deployed'
    const deployedCrates = useMemo(() => allCrates.filter(c => 
        !positions[c.id] && !c.parent_id && ['deployed', 'in transit'].includes((c.status || '').toLowerCase().trim())
    ), [allCrates, positions]);
    const truckCrates = useMemo(() => allCrates.filter(c => !!positions[c.id]), [allCrates, positions]);
    const truckNumbering = useMemo(() => getTruckCrateNumbering(truckCrates, positions), [truckCrates, positions]);

    const dockUnits = useMemo(() => dockCrates.filter(c => (c.type || '').toLowerCase().trim() !== 'cardboard'), [dockCrates]);
    const dockBoxes = useMemo(() => dockCrates.filter(c => (c.type || '').toLowerCase().trim() === 'cardboard'), [dockCrates]);
    const totalWeight = useMemo(() => truckCrates.reduce((s, c) => s + computeCrateWeight(c, allInventory, allCrates), 0), [truckCrates, allInventory, allCrates]);
    const floorPct = useMemo(() => Math.min(100, Math.round(truckCrates.reduce((s, c) => s + c.width_cm * c.length_cm, 0) / (TRUCK_W_CM * TRUCK_L_CM) * 100)), [truckCrates]);
    const inventoryArtifactConfig = useAtomValue(inventoryArtifactConfigAtom);

    useEffect(() => {
        if (selectedId && inventoryArtifactConfig.isOpen) {
            const sel = allCrates.find(c => c.id === selectedId);
            if (sel) {
                const extractItemIds = (c: any): string[] => {
                    const direct = c.inventory_ids ? c.inventory_ids.split(',').map((s: string) => s.split(':')[0]).filter(Boolean) : [];
                    const nested = allCrates.filter(child => child.parent_id === c.id);
                    let result = [...direct];
                    nested.forEach(n => { result = [...result, ...extractItemIds(n)]; });
                    return Array.from(new Set(result));
                };
                const itemIds = extractItemIds(sel);
                setInventoryArtifactConfig(prev => ({
                    ...prev,
                    itemIds,
                    title: `Crate: ${getCrateDisplayName(sel, allCrates, allInventory).label || sel.id}`,
                }));
            }
        }
    }, [selectedId, inventoryArtifactConfig.isOpen, allCrates, allInventory, setInventoryArtifactConfig]);

    // Ã¢â€â‚¬Ã¢â€â‚¬ Memoized panel stats Ã¢â‚¬â€ independent of zoom Ã¢â€â‚¬Ã¢â€â‚¬
    const panelStats = useMemo(() => {
        const MAX_KG = 20411;
        const TRUCK_VOL_M3 = (TRUCK_L_CM * TRUCK_W_CM * 279) / 1e6;
        const usedVol = truckCrates.reduce((s, c) => s + (c.width_cm * c.length_cm * (c.height_cm || 100)) / 1e6, 0);
        const volPct = Math.min(100, Math.round(usedVol / TRUCK_VOL_M3 * 100));
        const payloadPct = Math.min(100, Math.round(totalWeight / MAX_KG * 100));
        const remaining = Math.max(0, MAX_KG - totalWeight);
        const avgW = truckCrates.length ? Math.round(totalWeight / truckCrates.length) : 0;
        const nCrates = truckCrates.filter(c => (c.type || '').toLowerCase().trim() === 'crate').length;
        const nPallets = truckCrates.filter(c => (c.type || '').toLowerCase().trim() === 'pallet').length;
        const nBoxes = truckCrates.filter(c => (c.type || '').toLowerCase().trim() === 'cardboard').length;
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

    // Smart auto-position: pack from FRONT (cab, right side xÃ¢â€°Ë†TRUCK_L_CM) toward rear, row-by-row
    const computeAutoPosition = useCallback((crate: any, currentPositions: Record<string, {x:number;y:number;r:number}>, allCrates: any[]) => {
        const W = parseFloat(crate.width_cm) || 60;
        const D = parseFloat(crate.length_cm) || 60;
        const PAD = 5; // 5cm padding between crates
        const MARGIN = 10;
        // Collect occupied rects [{x,y,w,d}] in canvas space
        const occupied = allCrates
            .filter(c => currentPositions[c.id])
            .map(c => {
                const p = currentPositions[c.id];
                const rotated = p.r === 90;
                const cw = parseFloat(c.width_cm) || 60;
                const cl = parseFloat(c.length_cm) || 60;
                return { x: p.x, y: p.y, w: rotated ? cl : cw, d: rotated ? cw : cl };
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
        
        // Auto scroll to newly loaded crate
        setTimeout(() => {
            const el = canvasRef.current;
            const trailer = document.getElementById('trailer-main-map');
            const crate = allCrates.find(c => c.id === id);
            if (el && trailer && crate) {
                const isMobile = window.innerWidth < 768;
                const pos = computeAutoPosition(crate, positions, allCrates);
                const visualX = (isMobile ? pos.y : pos.x) * BASE_SCALE * zoom;
                const visualY = (isMobile ? (TRUCK_L_CM - pos.x - (pos.r === 0 ? parseFloat(crate.length_cm as any)||60 : parseFloat(crate.width_cm as any)||60)) : pos.y) * BASE_SCALE * zoom;
                
                // Add the trailer's offset to the visual coordinates to get the absolute position in the scroll container
                const absoluteX = trailer.offsetLeft + visualX;
                const absoluteY = trailer.offsetTop + visualY;
                
                const centerX = absoluteX - el.clientWidth / 2;
                const centerY = absoluteY - el.clientHeight / 2;
                el.scrollTo({ left: Math.max(0, centerX), top: Math.max(0, centerY), behavior: 'smooth' });
            }
        }, 100);

        setSelectedId(id);
        setRecalledShipment(null);
    }, [allCrates, computeAutoPosition, positions]);

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
        setRecalledShipment(null);
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

    const handleStack = useCallback((id: string) => {
        setPositions(p => {
            const current = p[id];
            if (!current) return p;
            const crate = allCrates.find(c => c.id === id);
            if (!crate) return p;
            
            const r = current.r === 90;
            const curW = r ? crate.length_cm : crate.width_cm;
            const curL = r ? crate.width_cm : crate.length_cm;
            
            let maxZ = 0;
            Object.entries(p).forEach(([oid, pos]) => {
                if (oid === id) return;
                const oc = allCrates.find(c => c.id === oid);
                if (!oc) return;
                const or = pos.r === 90;
                const oW = or ? oc.length_cm : oc.width_cm;
                const oL = or ? oc.width_cm : oc.length_cm;
                
                const overlap = !(current.x + curL <= pos.x || pos.x + oL <= current.x ||
                                  current.y + curW <= pos.y || pos.y + oW <= current.y);
                if (overlap) maxZ = Math.max(maxZ, (pos.z || 0) + (oc.height_cm || 100));
            });
            return { ...p, [id]: { ...current, z: maxZ } };
        });
    }, [allCrates]);

    const handleRotate = useCallback((id: string) => {
        setPositions(p => {
            if (!p[id]) return p;
            return { ...p, [id]: { ...p[id], r: p[id].r === 0 ? 90 : 0 } };
        });
    }, []);

    // Ã¢â€â‚¬Ã¢â€â‚¬ Interaction Handlers Ã¢â€â‚¬Ã¢â€â‚¬

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) { // Middle click
            e.preventDefault();
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    useEffect(() => {
        if (!isPanning) return;
        const onMouseMove = (e: MouseEvent) => {
            if (!canvasRef.current) return;
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            canvasRef.current.scrollLeft -= dx;
            canvasRef.current.scrollTop -= dy;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        };
        const onMouseUp = (e: MouseEvent) => {
            if (e.button === 1) setIsPanning(false);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isPanning]);

    // Keyboard Shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // Global shortcuts
            if (e.key === '+' || e.key === '=') { setZoom(z => Math.min(3, z + 0.1)); e.preventDefault(); }
            if (e.key === '-' || e.key === '_') { setZoom(z => Math.max(0.15, z - 0.1)); e.preventDefault(); }
            if (e.key === '0' && e.ctrlKey) { setZoom(1.0); e.preventDefault(); }
            
            if (selectedId) {
                if (e.key === 'r' || e.key === 'R') { handleRotate(selectedId); e.preventDefault(); }
                if (e.key === 'Delete' || e.key === 'Backspace') { handleUnload(selectedId); e.preventDefault(); }
                if (e.key === 'Escape') { setSelectedId(null); e.preventDefault(); }
                
                // Fine-tune position with arrow keys
                const STEP = e.shiftKey ? 10 : 2;
                if (e.key.startsWith('Arrow')) {
                    const pos = positions[selectedId];
                    if (pos) {
                        if (e.key === 'ArrowLeft') handleUpdatePos(selectedId, Math.max(0, pos.x - STEP), pos.y);
                        if (e.key === 'ArrowRight') handleUpdatePos(selectedId, Math.min(TRUCK_L_CM, pos.x + STEP), pos.y);
                        if (e.key === 'ArrowUp') handleUpdatePos(selectedId, pos.x, Math.max(0, pos.y - STEP));
                        if (e.key === 'ArrowDown') handleUpdatePos(selectedId, pos.x, Math.min(TRUCK_W_CM, pos.y + STEP));
                        e.preventDefault();
                    }
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedId, positions, handleRotate, handleUnload, handleUpdatePos]);
    
    const handleNest = async (boxId: string, targetId: string) => {
        const box = allCrates.find(c => c.id === boxId);
        const target = allCrates.find(c => c.id === targetId);
        if (!box || !target) return;

        const tid = notify.loading(`Nesting ${boxId.slice(0,6)} into ${targetId.slice(0,6)}...`);
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
            setRecalledShipment(null);
            notify.success('Successfully nested', { id: tid });
            onRefresh();
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            notify.error(err.message || 'Nesting failed', { id: tid });
        }
    };

    const handleClearTrailer = useCallback(async () => {
        if (Object.keys(positions).length === 0) return;
        if (confirm('Are you sure you want to clear all loaded units from the trailer?')) {
            const idsToClear = Object.keys(positions);
            setPositions({});
            setSelectedId(null);
            setRecalledShipment(null);
            
            // Clear from database as per user request
            try {
                await supabase.from('logistics').update({ truck_id: null, truck_position: null }).in('id', idsToClear);
            } catch (err) {
                console.error("Error clearing trailer from DB", err);
            }
            
            notify.success('Trailer cleared');
        }
    }, [positions]);

    const handleLoadDraft = (draft: TruckDraft) => {
        setPositions(draft.positions);
        setReadyTruckFields(draft.shipmentData || {
            sealNumber: '', tractorNumber: '', truckPlates: '', trailerNumber: '', trailerPlates: '', senders: [''], packingItems: []
        });
        notify.success(`Draft "${draft.name}" loaded`);
        setTopBarState('crates');
    };

    // Ã¢â€â‚¬Ã¢â€â‚¬ Ready Truck Ã¢â‚¬â€ sync DB + PDF + XLSX Ã¢â€â‚¬Ã¢â€â‚¬
    const handleReadyTruck = async (f = readyTruckFields) => {
        if (!confirm('Are you sure you want to finalize this shipment and synchronize with the cloud?')) return;
        setIsSaving(true);
        const tid = notify.loading('Validating shipment integrity...');
        try {
            // 0. Integrity Check: Ensure no items are already in another active shipment
            if (!isDummyMode) {
                const currentItemIds = new Set<string>();
                truckCrates.forEach(c => {
                    getItemsFromCrate(c).forEach(item => currentItemIds.add(String(item.id)));
                });

                // Fetch all recent shipments to check for overlaps
                const { data: activeShipments, error: fetchError } = await supabase
                    .from('shipments')
                    .select('manifest_id, payload')
                    .order('timestamp', { ascending: false })
                    .limit(50);

                if (fetchError) throw fetchError;

                const conflicts: string[] = [];
                for (const ship of activeShipments || []) {
                    const payload = typeof ship.payload === 'string' ? JSON.parse(ship.payload) : ship.payload;
                    const shipItems = payload?.crates?.flatMap((c: any) => c.items || []) || [];
                    
                    for (const item of shipItems) {
                        if (currentItemIds.has(String(item.itemId))) {
                            conflicts.push(`${item.itemId} (in ${ship.manifest_id})`);
                        }
                    }
                }

                if (conflicts.length > 0) {
                    notify.error(`Deployment Blocked: Duplicate items found!\n${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? '...' : ''}`, { id: tid, duration: 6000 });
                    setIsSaving(false);
                    return;
                }
            }

            notify.loading('Synchronizing shipment data...', { id: tid });
            const manifestId = `TRK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const dispatchTs = new Date().toISOString();
            const ts = new Date().toLocaleString();

            // 1. Sync crate positions + statuses to DB
            if (!isDummyMode) {
                for (const c of allCrates) {
                    const pos = positions[c.id];
                    const newStatus = pos ? 'In Transit' : (c.status === 'In Transit' ? 'Packed' : c.status);
                    const cleanDesc = (c.description || '').replace(/POS:\d+,\d+,\d+/, '').trim();
                    const finalDesc = pos ? `${cleanDesc} POS:${Math.round(pos.x)},${Math.round(pos.y)},${pos.r}`.trim() : cleanDesc;
                    const { error } = await supabase.from('logistics').update({ 
                        status: newStatus, 
                        description: finalDesc, 
                        updated_at: dispatchTs,
                        // Clear live trailer fields Ã¢â‚¬â€ position is now stored in shipment payload
                        truck_id: null,
                        truck_position: null
                    }).eq('id', c.id);
                    if (error) throw error;
                    if (db) { const lDoc = await db.logistics.findOne({ selector: { id: c.id } }).exec(); if (lDoc) await lDoc.patch({ status: newStatus, description: finalDesc, truck_id: null, truck_position: null }); }
                }

                // 1b. Stamp sent_date + manifest on all inventory items in dispatched crates
                const deployedCrates = allCrates.filter(c => !!positions[c.id]);
                const deployedInventoryIds: string[] = [];
                for (const c of deployedCrates) {
                    (c.inventory_ids || '').split(',').filter(Boolean).forEach((entry: string) => {
                        const [id] = entry.split(':');
                        if (id) deployedInventoryIds.push(id);
                    });
                }
                if (deployedInventoryIds.length > 0) {
                    // Batch update in chunks of 50 to avoid URL length limits
                    const chunkSize = 50;
                    for (let i = 0; i < deployedInventoryIds.length; i += chunkSize) {
                        const chunk = deployedInventoryIds.slice(i, i + chunkSize);
                        await supabase.from('inventory').update({
                            sent_date: dispatchTs,
                            sent_manifest_id: manifestId,
                        }).in('id', chunk);
                    }
                }

                onRefresh(); setCratesVersion(v => v + 1);
            }


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
                            const rawBarcode = (calculated.bookBarcode && calculated.bookBarcode !== '-') ? calculated.bookBarcode : (data.book_barcode && data.book_barcode !== '-' ? data.book_barcode : null);
                            const tagId = rawBarcode || data.itemId || data.item_id || String(inv.row);
                            const vP = Object.keys(vendors).find(k => tagId.toUpperCase().startsWith(k)) || 'OTHER';
                            
                            const costMxn = parseFloat(data.price || data.acquisition_price_mxn || '0') || 0;
                            const weightKg = parseFloat(data.weightKg || data.weight_kg) || 0;

                            return {
                                row: String(inv.row),
                                itemId: tagId,
                                vendorPrefix: vP,
                                tagColor: (vendors as any)[vP]?.color || '#6b7280',
                                name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                                type: data.shape || 'Unit',
                                desc: data.shortDescription || '',
                                qty: item.qty,
                                price: costMxn,
                                acquisition_price_mxn: costMxn,
                                width_cm: data.width_cm || data.widthCm || 0,
                                height_cm: data.height_cm || data.heightCm || 0,
                                length_cm: data.length_cm || data.lengthCm || 0,
                                weightKg,
                                weight_kg: weightKg,
                                material: data.material || '',
                                color: data.color || '',
                                book_barcode: rawBarcode,
                                book_aq_code: calculated.bookAqCode,
                                book_landed: calculated.bookLanded,
                                book_retail: calculated.bookRetail,
                                pay_date: data.pay_date || data.payDate || '',
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
                    timestamp: dispatchTs,
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

            notify.success(`Shipment ${manifestId} synchronized`, { id: tid, icon: 'Ã°Å¸Å¡Å¡', duration: 10000 });
            // Wizard stays open to show the public link
        } catch (err: any) { 
            notify.error(err.message || 'Synchronization failed', { id: tid }); 
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
            setShowReadyWizard(true);
        }
    }, [truckReadyTrigger, setShowReadyWizard]);

    // Ã¢â€â‚¬Ã¢â€â‚¬ Draft handlers Ã¢â€â‚¬Ã¢â€â‚¬
    const buildDraft = useCallback((name: string, fields?: any): TruckDraft => {
        const payload = {
            id: `draft_${Date.now()}`,
            name,
            savedAt: Date.now(),
            crateCount: truckCrates.length,
            crates: truckCrates, // Include crates for 3D icon rendering
            positions,
            numbering: truckNumbering,
            thumbnail: generateMasterThumbnail(truckCrates, positions, allCrates, allInventory, name),
            shipmentData: fields || readyTruckFields
        };
        return payload;
    }, [truckCrates, positions, truckNumbering, allCrates, allInventory, readyTruckFields]);

    const handleSaveDraft = (name: string) => {
        const draft = buildDraft(name);
        saveDraft(draft);
        notify.success(`Draft "${name}" saved to local storage`, { icon: 'Ã°Å¸â€™Â¾' });
        setShowSaveDraft(false);
    };

    const handleExportDraft = (name: string) => {
        const draft = buildDraft(name);
        exportDraftFile(draft);
        notify.success(`Draft "${name}" exported as file`, { icon: 'Ã°Å¸â€œÂ¤' });
        setShowSaveDraft(false);
    };

    const handleDeleteShipment = async (manifest_id: string) => {
        if (!confirm('Are you sure you want to permanently delete this shipment record? This action cannot be undone.')) return;
        
        const tid = notify.loading('Deleting shipment record...');
        try {
            const { error } = await supabase
                .from('shipments')
                .delete()
                .eq('manifest_id', manifest_id);

            if (error) throw error;

            setRecentShipments(prev => prev.filter(s => s.manifest_id !== manifest_id));
            notify.success('Shipment record deleted', { id: tid });
        } catch (err: any) {
            notify.error(err.message || 'Deletion failed', { id: tid });
        }
    };

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
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setZoom(z => Math.max(0.1, Math.min(4, z - e.deltaY * 0.001 * z)));
            }
        };
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('wheel', onWheel);
        };
    }, [zoom]);

    // Sync inventory sidebar with selected crate
    useEffect(() => {
        if (selectedId && inventoryArtifactConfig.isOpen) {
            const sel = allCrates.find(c => c.id === selectedId);
            if (sel) {
                const itemIds = sel.inventory_ids 
                    ? sel.inventory_ids.split(',').filter(Boolean).map((e: string) => e.split(':')[0])
                    : (sel.inventoryItems || []).map((i: any) => i.row);

                setInventoryArtifactConfig(prev => ({
                    ...prev,
                    itemIds,
                    title: `Crate: ${getCrateDisplayName(sel, allCrates, allInventory).label || sel.id}`
                }));
            }
        }
    }, [selectedId]);

    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;

        let timeoutId: number;
        const centerCanvas = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                const trailer = document.getElementById('trailer-main-map');
                if (trailer && el) {
                    // Calculate absolute center scroll positions
                    const centerX = trailer.offsetLeft + (trailer.offsetWidth / 2) - (el.clientWidth / 2);
                    const centerY = trailer.offsetTop + (trailer.offsetHeight / 2) - (el.clientHeight / 2);
                    
                    el.scrollTo({
                        left: centerX,
                        top: centerY,
                        behavior: 'smooth'
                    });
                } else if (el) {
                    const scrollX = (el.scrollWidth - el.clientWidth) / 2;
                    const scrollY = (el.scrollHeight - el.clientHeight) / 2;
                    el.scrollLeft = scrollX;
                    el.scrollTop = scrollY;
                }
            }, 100) as unknown as number;
        };

        // Center on mount and after render cycles
        const timers = [
            setTimeout(centerCanvas, 100),
            setTimeout(centerCanvas, 500),
            setTimeout(centerCanvas, 1000)
        ];
        
        window.addEventListener('resize', centerCanvas);
        return () => {
            timers.forEach(t => clearTimeout(t));
            clearTimeout(timeoutId);
            window.removeEventListener('resize', centerCanvas);
        };
    }, [zoom, viewMode]);

    return (
        <div className="absolute inset-0 flex flex-col overflow-hidden bg-transparent select-none">
            {/* Ã¢â€â‚¬Ã¢â€â‚¬ FLOATING STUDIO HUB (Persistent Glassmorphic Panel) Ã¢â€â‚¬Ã¢â€â‚¬ */}
            {showPanels && (
            <div className="relative z-[60] p-6 pb-0 pointer-events-none shrink-0">
                <div 
                    className={`pointer-events-auto flex flex-col backdrop-blur-3xl bg-black/5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-500 hover:bg-black/10 ${isCompact ? 'rounded-2xl' : 'rounded-[2rem]'}`}
                    onWheel={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                >


                {/* Bar 1: Primary Selector (Crates or Deployed) */}
                <div className={`flex items-center gap-4 px-6 border-b border-white/5 transition-all duration-500 ${isCompact ? 'py-0.5' : 'py-3'}`}>
                    <button 
                        onClick={() => setTopBarState(topBarState === 'crates' ? 'trailers' : 'crates')}
                        className={`transition-all hover:scale-110 active:scale-95 group/mode-toggle ${isCompact ? 'p-1 text-white' : 'p-4 text-white/30 hover:text-white'}`}
                        title={topBarState === 'crates' ? 'Switch to Deployed History' : 'Switch to Crates'}
                    >
                        {topBarState === 'trailers' ? (
                            <Truck size={isCompact ? 14 : 32} strokeWidth={1.25} style={{ color: 'var(--main-color)' }} />
                        ) : (
                            <Truck size={isCompact ? 14 : 32} strokeWidth={1.25} className="opacity-20" />
                        )}
                    </button>

                    <button 
                        onClick={() => setTopBarState('deployed')}
                        className={`transition-all hover:scale-110 active:scale-95 group/mode-toggle ${isCompact ? 'p-1 text-white' : 'p-4 text-white/30 hover:text-white'}`}
                        title="View All Deployed Crates"
                    >
                        <SquareLibrary size={isCompact ? 14 : 32} strokeWidth={1.25} style={topBarState === 'deployed' ? { color: 'var(--main-color)' } : { opacity: 0.2 }} />
                    </button>

                    <div className={`flex-1 overflow-x-auto custom-scrollbar flex items-center gap-6 no-scrollbar px-2 ${isCompact ? 'py-0' : 'py-2'}`}>
                        {topBarState === 'crates' ? (
                            <>
                                {dockCrates.length === 0 ? (
                                    <div className="flex items-center gap-3 px-6 py-2 rounded-xl bg-white/5 border border-dashed border-white/10 text-white/20">
                                        <CheckCircle2 size={16} strokeWidth={1} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Manifest Clean</span>
                                    </div>
                                ) : (
                                    dockCrates.map(c => (
                                        <CompactDockCard 
                                            key={c.id} 
                                            crate={c} 
                                            allCrates={allCrates} 
                                            allInventory={allInventory} 
                                            onLoad={() => handleLoad(c.id)} 
                                            onNest={() => setNestingBoxId(c.id)} 
                                            isCompact={isCompact}
                                        />
                                    ))
                                )}
                            </>
                        ) : topBarState === 'deployed' ? (
                            <>
                                {deployedCrates.length === 0 ? (
                                    <div className="flex items-center gap-3 px-6 py-2 rounded-xl bg-white/5 border border-dashed border-white/10 text-white/20">
                                        <SquareLibrary size={16} strokeWidth={1} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">No Individual Deployed Crates</span>
                                    </div>
                                ) : (
                                    deployedCrates.map(c => (
                                        <div key={c.id} className="relative group cursor-pointer flex flex-col gap-2 min-w-[200px]">
                                            <div onClick={() => setEditingCrate(c)}>
                                                <CompactDockCard 
                                                    crate={c} 
                                                    allCrates={allCrates} 
                                                    allInventory={allInventory} 
                                                    onLoad={() => {}} 
                                                    isCompact={isCompact}
                                                />
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity w-full mt-1 px-2">
                                                <button onClick={(e) => { e.stopPropagation(); setEditingCrate(c); }} className="flex-1 py-1.5 px-2 text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/5 flex items-center justify-center gap-1.5 whitespace-nowrap">
                                                    <Eye size={12} /> View Deployment
                                                </button>
                                                <button onClick={async (e) => { 
                                                    e.stopPropagation(); 
                                                    const tid = notify.loading('Reverting to Warehouse...');
                                                    const { error } = await supabase.from('logistics').update({ 
                                                        status: c.inventory_ids ? 'Packed' : 'Empty', 
                                                        sent_date: null, 
                                                        truck_plates: null, 
                                                        senders: null,
                                                        truck_id: null,
                                                        truck_position: null
                                                    }).eq('id', c.id);
                                                    if (!error) { 
                                                        notify.success('Reverted to Warehouse', { id: tid }); 
                                                        onRefresh(); 
                                                    } else { 
                                                        notify.error('Failed to revert', { id: tid }); 
                                                    }
                                                }} className="flex-1 py-1.5 px-2 text-[8px] font-black uppercase tracking-widest bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all border border-rose-500/10 flex items-center justify-center gap-1.5 whitespace-nowrap">
                                                    <ArrowLeft size={12} /> Back to Warehouse
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </>
                        ) : (
                            <>
                                {loadingShipments ? (
                                    <div className="flex items-center gap-3 px-6 py-2">
                                        <Loader2 size={16} className="animate-spin text-emerald-400" />
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Loading...</span>
                                    </div>
                                ) : recentShipments.length === 0 ? (
                                    <div className="flex items-center gap-3 px-6 py-2 text-white/10">
                                        <AlertCircle size={16} strokeWidth={1} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">No Records</span>
                                    </div>
                                ) : (
                                    recentShipments.map(s => (
                                        <DeployedTrailerCard 
                                            key={s.manifest_id} 
                                            shipment={s} 
                                            onRecall={() => handleRecall(s)} 
                                            onDelete={() => handleDeleteShipment(s.manifest_id)}
                                            onView={() => { setSentTruckId(s.manifest_id); setView('truck'); }}
                                            allCrates={allCrates}
                                            allInventory={allInventory}
                                        />
                                    ))
                                )}
                                <div className="w-px h-8 bg-white/10 mx-2" />
                                <button 
                                    onClick={() => setLogisticsSubTab('deployed')}
                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 shrink-0 group"
                                >
                                    <Maximize2 size={14} className="group-hover:scale-110 transition-transform" />
                                    Expand Fleet
                                </button>
                            </>
                        )}
                    </div>
                </div>



                {/* Ã¢â€¢ÂÃ¢â€¢Â CONSOLIDATED HIGH-DENSITY DETAILS PANEL Ã¢â€¢ÂÃ¢â€¢Â */}
                <div className={`px-4 transition-all duration-500 flex items-center backdrop-blur-3xl bg-black/5 ${isCompact ? 'py-1' : 'py-5'}`}>
                    <div className={`flex items-center w-full ${isCompact ? 'gap-8 justify-between' : 'gap-1 justify-start'}`}>
                        <div className={`flex items-center transition-all duration-500 ${isCompact ? 'gap-2' : 'gap-4 flex-1 min-w-0'}`}>
                            {!isCompact && (
                                <div className="flex items-center gap-2 shrink-0">
                                    <h2 className="font-black uppercase tracking-tighter text-white leading-none text-4xl">53&apos;</h2>
                                    <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 leading-none opacity-20">
                                        <span className="text-[5px] font-black tracking-widest uppercase">1615</span>
                                        <span className="text-[5px] font-black tracking-widest uppercase">Ãƒâ€”</span>
                                        <span className="text-[5px] font-black tracking-widest uppercase">244</span>
                                        <span className="text-[5px] font-black tracking-widest uppercase">CM</span>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-1 min-w-0">
                                {isCompact ? (
                                    <div className="flex items-center gap-3">
                                        <span className="font-black text-white/40 text-[9px] uppercase tracking-widest">53FT</span>
                                        <span className="font-mono font-black text-white/60 uppercase tracking-widest text-[9px]">{TRUCK_L_CM}Ãƒâ€”{TRUCK_W_CM}</span>
                                        <div className="w-1 h-1 rounded-full bg-white/10" />
                                        <span className="font-black tracking-tighter text-white text-[14px] leading-none">{truckCrates.length}</span>
                                        <span className="text-white/30 font-black uppercase tracking-widest text-[7px] leading-none">UNITS</span>
                                    </div>
                                ) : (
                                    <div className="flex items-baseline gap-1.5 leading-none">
                                        <span className="font-black tracking-tighter text-white text-3xl">{truckCrates.length}</span>
                                        <span className="text-white/80 font-black uppercase tracking-widest text-[8px]">/ {allCrates.length} UNITS</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Section 2: Payload */}
                        <div className={`flex items-center border-l border-white/10 transition-all duration-500 ${isCompact ? 'px-4 gap-2' : 'px-5 gap-4 flex-1 min-w-0'}`}>
                            <Gauge size={isCompact ? 12 : 18} style={{ color: panelStats.statusColor }} className="shrink-0" />
                            <div className={`flex ${isCompact ? 'items-center gap-2' : 'flex-col w-full gap-1 min-w-0'}`}>
                                <div className="flex items-baseline gap-1.5 leading-none">
                                    <span className={`font-black tracking-tighter transition-all duration-500 ${isCompact ? 'text-[15px]' : 'text-3xl'}`} style={{ color: panelStats.statusColor }}>{Math.round(totalWeight).toLocaleString()}</span>
                                    <span className={`text-white/60 font-black uppercase tracking-widest transition-all ${isCompact ? 'text-[7px]' : 'text-[8px]'}`}>KG</span>
                                </div>
                                {isCompact ? (
                                    <span className="font-black text-white/60 uppercase tracking-tighter text-[9px]">{panelStats.payloadPct}%</span>
                                ) : (
                                    <div className="flex items-center gap-2 w-full">
                                        <div className="flex-1 bg-white/20 rounded-full overflow-hidden h-1">
                                            <div className="h-full transition-all duration-1000" style={{ width: `${panelStats.payloadPct}%`, backgroundColor: panelStats.statusColor }} />
                                        </div>
                                        <span className="font-black text-white/80 uppercase tracking-tighter text-[8px]">{panelStats.payloadPct}%</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Section 3: Space Metrics */}
                        <div className={`flex items-center border-l border-white/10 transition-all duration-500 ${isCompact ? 'px-4 gap-4' : 'px-5 gap-6 flex-1 justify-center'}`}>
                            <div className={`${isCompact ? 'flex items-center gap-2' : 'flex flex-col gap-1'} text-center`}>
                                <span className={`font-black text-white leading-none tracking-tighter transition-all ${isCompact ? 'text-[14px]' : 'text-3xl'}`}>{floorPct}%</span>
                                <span className={`font-black uppercase text-white/60 tracking-[0.2em] transition-all ${isCompact ? 'text-[6px]' : 'text-[8px]'}`}>Floor</span>
                            </div>
                            <div className={`${isCompact ? 'flex items-center gap-2' : 'flex flex-col gap-1'} text-center`}>
                                <span className={`font-black text-white leading-none tracking-tighter transition-all ${isCompact ? 'text-[14px]' : 'text-3xl'}`}>{panelStats.volPct}%</span>
                                <span className={`font-black uppercase text-white/60 tracking-[0.2em] transition-all ${isCompact ? 'text-[6px]' : 'text-[8px]'}`}>Vol</span>
                            </div>
                        </div>

                        {/* Section 4: Status */}
                        <div className={`flex flex-col border-l border-white/10 transition-all duration-500 ${isCompact ? 'px-4 min-w-[70px]' : 'px-5 flex-1 min-w-0 gap-1'}`}>
                            <div className="flex items-center gap-3">
                                <span className={`font-black uppercase tracking-tighter leading-none transition-all ${isCompact ? 'text-[13px]' : 'text-2xl'}`} style={{ color: panelStats.statusColor }}>{panelStats.status}</span>
                                {recalledShipment && (
                                    <button 
                                        onClick={() => setShowSharePopup(true)}
                                        className="text-emerald-400 hover:text-emerald-300 hover:scale-125 active:scale-95 transition-all animate-in zoom-in duration-1000 p-2"
                                        title="Share 3D Visualizer"
                                    >
                                        <Share2 size={26} strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
                            {!isCompact && <span className="font-black text-white/80 uppercase tracking-widest leading-none text-[7px] mt-1">{panelStats.remaining.toLocaleString()} KG FREE</span>}
                        </div>

                        {/* Section 5: Recalled Truck Metadata (Ultra-High-Density Onyx Grid) */}
                        {recalledShipment && (
                            <div className={`flex border-l border-white/5 transition-all duration-500 ${isCompact ? 'px-6 gap-6 flex-1' : 'px-8 gap-8 flex-[3] min-w-0'}`}>
                                <div className={`grid w-full gap-x-8 ${isCompact ? 'grid-cols-2' : 'grid-cols-5'}`}>
                                    {/* Col 1: Tractor Context */}
                                    <div className="flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Shield size={10} className="text-emerald-400 opacity-60" />
                                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40 whitespace-nowrap">Tractor</span>
                                        </div>
                                        <span className="text-[14px] font-black text-white uppercase tracking-tighter leading-none">{readyTruckFields.tractorNumber || 'Ã¢â‚¬â€'}</span>
                                        {!isCompact && (
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate mt-1">{readyTruckFields.truckPlates || 'NO PLATES'}</span>
                                        )}
                                    </div>

                                    {/* Col 2: Trailer Context */}
                                    <div className="flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Truck size={10} className="text-white/40" />
                                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40 whitespace-nowrap">Trailer</span>
                                        </div>
                                        <span className="text-[14px] font-black text-white uppercase tracking-tighter leading-none">{readyTruckFields.trailerNumber || 'Ã¢â‚¬â€'}</span>
                                        {!isCompact && (
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate mt-1">{readyTruckFields.trailerPlates || 'NO PLATES'}</span>
                                        )}
                                    </div>

                                    {/* Col 3: Security & Identity */}
                                    <div className="flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <IdCard size={10} className="text-cyan-400" />
                                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40 whitespace-nowrap">Security</span>
                                        </div>
                                        <span className="text-[14px] font-black text-cyan-400 uppercase tracking-tighter leading-none">{readyTruckFields.sealNumber || 'OPEN'}</span>
                                        {!isCompact && (
                                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest truncate mt-1">LOCK VERIFIED</span>
                                        )}
                                    </div>

                                    {/* Col 4: Logistics Payload */}
                                    {!isCompact && (
                                        <div className="flex flex-col justify-center min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <History size={10} className="text-emerald-500" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40 whitespace-nowrap">Logistics</span>
                                            </div>
                                            <span className="text-[13px] font-black text-emerald-400 uppercase tracking-tighter leading-none">{readyTruckFields.packingItems.length || 0} UNITS</span>
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate mt-1">{readyTruckFields.senders[0] || 'ONYX CORE'}</span>
                                        </div>
                                    )}

                                    {/* Col 5: Deployment Timeline */}
                                    {!isCompact && (
                                        <div className="flex flex-col justify-center min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <History size={10} className="text-white/40" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/40 whitespace-nowrap">Deployed</span>
                                            </div>
                                            <span className="text-[12px] font-black text-white/80 uppercase tracking-tighter leading-none">
                                                {new Date(recalledShipment.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                                            </span>
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate mt-1">
                                                {new Date(recalledShipment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Layout Toggle - Fixed Bottom Right of Hub */}
                        <div className="flex items-center pl-6 border-l border-white/5 ml-auto">
                            <button 
                                onClick={() => setIsCompact(!isCompact)}
                                className={`transition-all duration-500 hover:scale-110 active:scale-95 ${isCompact ? 'p-2 text-white/40 hover:text-white' : 'p-3 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl'}`}
                                title={isCompact ? 'Standard View' : 'Compact View'}
                            >
                                <LayoutGrid size={isCompact ? 16 : 24} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )}

            {/* Ã¢â€â‚¬Ã¢â€â‚¬ FULL-SCREEN WORKSPACE (Scrolls Behind Hub) Ã¢â€â‚¬Ã¢â€â‚¬ */}
            <div 
                ref={canvasRef}
                className="flex-1 overflow-auto custom-scrollbar relative bg-white/[0.02] backdrop-blur-3xl"
                style={{ touchAction: 'none' }}
                onMouseDown={handleMouseDown}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setSelectedId(null);
                        setInventoryArtifactConfig(prev => ({ ...prev, isOpen: false }));
                    }
                }}
            >
                <div className="relative">
                {viewMode === 'side' ? (
                    <div className="w-full h-[600px] mt-8">
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
                    </div>
                ) : viewMode === 'iso' ? (
                    <div className="w-full h-full mt-8">
                        <IsoView
                            truckCrates={truckCrates} positions={positions} truckNumbering={truckNumbering}
                            allCrates={allCrates} allInventory={allInventory}
                            zoom={zoom}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                        />
                    </div>
                ) : viewMode === '3d' ? (
                    <div className="w-full h-full relative group">
                        <InteractiveTruckViewer
                            truckCrates={truckCrates}
                            positions={positions}
                            allCrates={allCrates}
                            allInventory={allInventory}
                            truckNumbering={truckNumbering}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                        />
                        <div className="absolute top-10 right-10 pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity">
                            <div className="px-6 py-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 flex items-center gap-3">
                                <Globe size={16} className="text-emerald-500 animate-spin-slow" />
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Interactive Orbit Active</span>
                            </div>
                        </div>
                    </div>
                ) : (
                <div 
                    className="min-w-full min-h-full flex flex-col items-center justify-center p-[1500px] lg:p-[2500px]"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedId(null);
                        }
                    }}
                >
                    <div 
                        id="trailer-main-map"
                        className="flex flex-col items-center animate-in fade-in zoom-in duration-1000" 
                        style={{ 
                            width: (isMobile ? TRUCK_W_CM : TRUCK_L_CM) * BASE_SCALE * zoom + 100,
                            height: (isMobile ? TRUCK_L_CM : TRUCK_W_CM) * BASE_SCALE * zoom + 100
                        }}
                    >
                        {/* Direction labels - Adaptive Layout */}
                        {!isMobile ? (
                            <div className="flex items-center gap-10 mb-12 w-full max-w-[1600px]">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 flex items-center justify-center bg-emerald-500/5">
                                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-[0.5em] text-emerald-500/80 whitespace-nowrap">Rear Deck</span>
                                </div>
                                <div className="flex-1" />
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 flex items-center justify-center bg-white/5">
                                        <div className="w-3 h-3 rounded-full bg-white/40" />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-[0.5em] text-white/40 whitespace-nowrap">Bulkhead</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 mb-10">
                                <div className="w-8 h-8 flex items-center justify-center bg-white/5">
                                    <div className="w-3 h-3 rounded-full bg-white/40" />
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.5em] text-white/40 whitespace-nowrap">Bulkhead</span>
                            </div>
                        )}
                        
                        <div style={{ 
                            width: (isMobile ? TRUCK_W_CM : TRUCK_L_CM) * BASE_SCALE * zoom, 
                            height: (isMobile ? TRUCK_L_CM : TRUCK_W_CM) * BASE_SCALE * zoom, 
                            position: 'relative' 
                        }} className="shadow-[0_120px_250px_-80px_rgba(0,0,0,0.8)] bg-transparent">
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{ 
                                    transform: `scale(${zoom})`, 
                                    transformOrigin: 'top left', 
                                    width: (isMobile ? TRUCK_W_CM : TRUCK_L_CM) * BASE_SCALE, 
                                    height: (isMobile ? TRUCK_L_CM : TRUCK_W_CM) * BASE_SCALE 
                                }}
                                onClick={(e) => {
                                    if (e.target === e.currentTarget) {
                                        setSelectedId(null);
                                    }
                                }}
                            >
                                <CmGrid isVertical={isMobile} />
                                {isMobile ? (
                                    [0.2, 0.4, 0.6, 0.8].map(frac => (
                                        <div key={frac} className="absolute left-0 right-0 h-px bg-white/10 pointer-events-none" style={{ top: (1 - frac) * TRUCK_L_CM * BASE_SCALE }}>
                                            <div className="absolute left-6 -top-3 px-3 py-1.5 bg-black/60 backdrop-blur-xl rounded-lg text-[10px] font-black text-white tracking-[0.2em]">
                                                {Math.round(frac * TRUCK_L_CM)} CM
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    [0.2, 0.4, 0.6, 0.8].map(frac => (
                                        <div key={frac} className="absolute top-0 bottom-0 w-px bg-white/10 pointer-events-none" style={{ left: frac * TRUCK_L_CM * BASE_SCALE }}>
                                            <div className="absolute bottom-6 left-3 px-3 py-1.5 bg-black/60 backdrop-blur-xl rounded-lg text-[10px] font-black text-white tracking-[0.2em]">
                                                {Math.round(frac * TRUCK_L_CM)} CM
                                            </div>
                                        </div>
                                    ))
                                )}
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
                                            onNest={() => setNestingBoxId(c.id)}
                                            isVertical={isMobile} />
                                    );
                                })}
                            </div>
                        </div>

                        {isMobile && (
                            <div className="flex flex-col items-center gap-3 mt-10">
                                <div className="w-8 h-8 flex items-center justify-center bg-emerald-500/5">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.5em] text-emerald-500/80 whitespace-nowrap">Rear Deck</span>
                            </div>
                        )}
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

            {showSharePopup && recalledShipment && (
                <SharePopup 
                    url={`${window.location.origin}${window.location.pathname}?truckid=${recalledShipment.manifest_id}`}
                    onClose={() => setShowSharePopup(false)}
                />
            )}

            {/* Ã¢â€â‚¬Ã¢â€â‚¬ FIXED BOTTOM CONTROL BAR (Glassmorphic) Ã¢â€â‚¬Ã¢â€â‚¬ */}
            <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom duration-700">
                <div className="flex items-center gap-2 px-6 py-3 backdrop-blur-3xl bg-black/60 border border-white/10 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    <button
                        onClick={() => setViewMode(v => v === 'top' ? 'side' : v === 'side' ? 'iso' : v === 'iso' ? '3d' : 'top')}
                        title={viewMode === 'top' ? 'Lateral View' : viewMode === 'side' ? 'Isometric View' : viewMode === 'iso' ? '3D Orbit View' : 'Overhead View'}
                        className={`p-3 rounded-xl transition-all duration-300 ${viewMode !== 'top' ? 'bg-white text-black shadow-xl' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        style={viewMode !== 'top' ? { backgroundColor: 'var(--main-color)', color: 'black' } : {}}
                    >
                        {viewMode === 'top' ? <Layers size={22} /> : viewMode === 'side' ? <Maximize2 size={22} /> : viewMode === 'iso' ? <Box size={22} /> : <Globe size={22} />}
                    </button>
                    
                    <div className="w-px h-8 bg-white/10 mx-2" />
                    
                    <div className="flex items-center gap-1">
                        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-3 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Zoom Out"><ZoomOut size={22} /></button>
                        <button onClick={() => setZoom(1.0)} className="px-4 text-[13px] font-black text-white hover:scale-110 transition-all tracking-tighter">{Math.round(zoom * 100)}%</button>
                        <button onClick={() => setZoom(z => Math.min(4, z + 0.1))} className="p-3 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Zoom In"><ZoomIn size={22} /></button>
                    </div>

                    <div className="w-px h-8 bg-white/10 mx-2" />

                    {selectedId && (
                        <>
                            <div className="flex items-center gap-1 bg-white/5 rounded-2xl px-2 py-1 border border-white/10 animate-in zoom-in duration-500 shadow-2xl backdrop-blur-3xl">
                                <button 
                                    onClick={() => {
                                        const sel = allCrates.find(c => c.id === selectedId);
                                        if (sel) {
                                            const itemIds = sel.inventory_ids 
                                                ? sel.inventory_ids.split(',').filter(Boolean).map((e: string) => e.split(':')[0])
                                                : (sel.inventoryItems || []).map((i: any) => i.row);

                                            setInventoryArtifactConfig({
                                                isOpen: true,
                                                itemIds,
                                                title: `Crate: ${getCrateDisplayName(sel, allCrates, allInventory).label || sel.id}`,
                                                viewMode: 'sidebar'
                                            });
                                        }
                                    }} 
                                    className="px-5 py-3 bg-white text-black rounded-xl font-black text-[11px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2"
                                >
                                    <Eye size={18} />
                                    VIEW
                                </button>
                                <div className="w-px h-8 bg-white/10 mx-1" />
                                <button 
                                    onClick={() => handleRotate(selectedId)} 
                                    className="p-3 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all" 
                                    title="Transform (Rotate)"
                                >
                                    <RotateCcw size={22} />
                                </button>
                                <button 
                                    onClick={() => handleUnload(selectedId)} 
                                    className="p-3 text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all" 
                                    title="Eject (Unload)"
                                >
                                    <Trash2 size={22} />
                                </button>
                                {(() => {
                                    const sel = allCrates.find(c => c.id === selectedId);
                                    return sel?.type === 'cardboard' ? (
                                        <button 
                                            onClick={() => setNestingBoxId(selectedId)} 
                                            className="p-3 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all" 
                                            title="Nest Unit"
                                        >
                                            <Box size={22} />
                                        </button>
                                    ) : null;
                                })()}
                                <button 
                                    onClick={() => setSelectedId(null)} 
                                    className="p-3 text-white/20 hover:text-white hover:bg-white/10 rounded-xl transition-all ml-1" 
                                    title="Deselect"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="w-px h-8 bg-white/10 mx-2" />
                        </>
                    )}

                    <button 
                        onClick={handleClearTrailer}
                        className="p-3 text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        title="Flush Payload"
                    >
                        <Trash2 size={22} />
                    </button>
                </div>
            </div>

            {editingCrate && (
                <CrateEditPanel 
                    crate={editingCrate}
                    allCrates={allCrates}
                    allInventory={allInventory}
                    onClose={() => setEditingCrate(null)}
                    onSave={async (id, updates) => {
                        const { error } = await supabase.from('logistics').update(updates).eq('id', id);
                        if (!error) {
                            setEditingCrate(null);
                            notify.success('Crate updated');
                            onRefresh();
                        } else {
                            notify.error('Update failed');
                        }
                    }}
                    onDeleteGroup={() => {}} 
                />
            )}
        </div>
    );
};
