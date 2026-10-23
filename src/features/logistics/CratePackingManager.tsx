import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Database } from '../../lib/database.types';
import { createPortal } from 'react-dom';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import { 
    inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom, 
    inventoryArtifactConfigAtom, isDummyModeAtom, isPackingFiltersOpenAtom,
    packingVendorFilterAtom, packingSortKeyAtom, packingSortOrderAtom,
    crateSeparatorsAtom, crateItemPositionsAtom,
    isCratePackingManagerOpenAtom, packingManagerTargetCrateIdAtom,
    selectedInventoryIdsAtom, CrateStatus} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { packItems, unpackItems } from './packItems';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, getCrateInternalVolume, getItemPaddedVolume } from '../../lib/utils';
import toast from '../onyxIsland/notify/toast';
import {
    Package, ChevronRight, Check, Loader2, X, CheckCircle2,
    PackagePlus, ListFilter, Inbox, Video, Maximize2, Minus, Plus, Trash2,
    ArrowUp, ArrowDown, ArrowUpDown, ArrowLeft, Info,
    Download, Copy, Flame, Layers, Cpu, FileCode, CheckCheck, Sparkles, Scissors, ExternalLink
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeCrate } from '../../components/CrateVisuals';
import { NFCTagCard } from '../../components/LabelVisuals';
import { CratePackingWorkspace } from './CratePackingWorkspace';
import { InventoryArtifactInner } from '../inventory/InventoryArtifact';
import { findInventoryByRow } from '../../lib/inventoryIndex';
import { tr } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';
import { 
    computeBoxesParams, 
    computeCutTelemetry, 
    generateProceduralCrateSvg, 
    formatBoxesCliCommand,
    PackedItemSpec,
    BoxesGeneratorParams
} from '../../lib/logistics/boxesBridge';
import { 
    downloadLaserCutfileSvg, 
    downloadLightBurnProject, 
    generateLightBurnProjectXml,
    getBoxesCliRecipe,
    BOXES_RUNTIME,
    BOXES_GENERATORS,
    BoxesGeneratorType
} from '../../lib/logistics/boxesCliBridge';
import { getContainerClassification } from './CrateCutfileStencilView';

// ─── Official Kerf Burn Presets for Laser Cutting (from boxes-py/SKILL.md) ───────
export interface MaterialPreset {
    id: string;
    label: string;
    thicknessMm: number;
    burnMm: number;
    color: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
    { id: 'baltic-birch-3', label: 'Baltic Birch 3mm', thicknessMm: 3, burnMm: 0.09, color: '#f59e0b' },
    { id: 'birch-ply-5', label: 'Birch Plywood 5mm', thicknessMm: 5, burnMm: 0.13, color: '#d97706' },
    { id: 'structural-ply-6', label: 'Structural Ply 6mm', thicknessMm: 6, burnMm: 0.15, color: '#b45309' },
    { id: 'cast-acrylic-3', label: 'Cast Acrylic 3mm', thicknessMm: 3, burnMm: 0.07, color: '#06b6d4' },
    { id: 'marine-ply-12', label: 'Marine Ply 12mm', thicknessMm: 12, burnMm: 0.18, color: '#10b981' },
];

// ─── Serialization helpers: inventory_ids stores "id:qty,id:qty" ──────────────────
// Backward compat: entries without ":qty" default to full quantity
function parseInventoryIds(raw?: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!raw) return map;
    raw.split(',').filter(Boolean).forEach(entry => {
        const [id, qty] = entry.split(':');
        if (id) map.set(id.trim(), qty ? parseInt(qty) : -1); // -1 = full qty (legacy)
    });
    return map;
}

function serializeInventoryIds(map: Map<string, number>): string {
    return Array.from(map.entries()).map(([id, qty]) => qty === -1 ? id : `${id}:${qty}`).join(',');
}

// Compute total packed qty for a given item id across all crates
function getTotalPackedForItem(itemId: string, allCrates: CrateRecord[]): number {
    let total = 0;
    for (const c of allCrates) {
        const m = parseInventoryIds(c.inventory_ids);
        if (m.has(itemId)) {
            const q = m.get(itemId)!;
            total += q === -1 ? 1 : q;
        }
    }
    return total;
}

// --- Local Crate type ---
type LogisticsRow = Database['public']['Tables']['logistics']['Row'];

/**
 * Derived from the generated logistics row rather than restated. The hand
 * written version omitted height_cm, which this file reads in seven places --
 * so the compiler could not see those reads at all.
 */
interface CrateRecord extends Partial<Omit<LogisticsRow, 'id' | 'status'>> {
    id: string;
    status: CrateStatus;
    /** Local only -- not a Supabase column. */
    brute_weight_kg?: number;
}

interface GroupedCrateRecord extends CrateRecord {
    groupedCount: number;
    children: CrateRecord[];
    isNestable?: boolean;
}

// --- Helpers ---
const fmtDims = (c: CrateRecord) =>
    `${c.width_cm ?? '?'}×${c.length_cm ?? '?'}×${c.height_cm ?? '?'}`;

const statusDot = (s: string) => {
    if (s === 'Empty') return 'bg-emerald-400';
    if (s === 'Partial') return 'bg-amber-400';
    return 'bg-rose-400';
};
const statusText = (s: string) => {
    if (s === 'Empty') return 'text-emerald-400';
    if (s === 'Partial') return 'text-amber-400';
    return 'text-rose-400';
};

// ─── Volume helpers ─────────────────────────────────────────────────────
//
// INTERNAL CRATE VOLUME
//   Each physical wall is ~7.5 cm thick, so we subtract 15 cm from every
//   external dimension (7.5 cm × 2 sides) before cubing.
//   Formula: (W_ext − 15) × (L_ext − 15) × (H_ext − 15)  [cm³]
//   Floors at 0 so degenerate/tiny crates don't go negative.
function crateCm3(c: CrateRecord): number {
    const iw = Math.max(0, (c.width_cm  ?? 0) - 15);
    const il = Math.max(0, (c.length_cm ?? 0) - 15);
    const ih = Math.max(0, (c.height_cm ?? 0) - 15);
    return iw * il * ih;
}

// NET ITEM VOLUME  — actual bounding box of the item
//   Formula: W × H × L  [cm³]
function itemNetCm3(norm: ReturnType<typeof normalizeInventoryData>): number {
    return (Number(norm.widthCm)  || 0) *
           (Number(norm.heightCm) || 0) *
           (Number(norm.lengthCm) || 0);
}

// PADDED ITEM VOLUME — item + 1.5 cm packaging clearance on every face
//   Each axis gains +3 cm (1.5 cm × 2 opposite faces).
//   Formula: (W+3) × (H+3) × (L+3)  [cm³]
function itemPaddedCm3(norm: ReturnType<typeof normalizeInventoryData>): number {
    return (Math.max(0, Number(norm.widthCm)  || 0) + 3) *
           (Math.max(0, Number(norm.heightCm) || 0) + 3) *
           (Math.max(0, Number(norm.lengthCm) || 0) + 3);
}

function clampN(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function fillBarColor(pct: number): string {
    if (pct >= 90) return '#ef4444';
    if (pct >= 70) return '#f59e0b';
    return '#10b981';
}

// ─── Static Isometric Wireframe (sidebar large view) ─────────────────────────
// Static — no animation. Fixed 35° isometric projection.
const LargeCrateWireframe: React.FC<{ w?: number; l?: number; h?: number; type?: string; size?: number }> = ({
    w = 60, l = 60, h = 60, type = 'crate', size = 130
}) => {
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale  = (size * 0.33) / maxDim;
    const dw = Math.round(w    * scale);
    const dh = Math.round(visH * scale);
    const depth = Math.round(l * scale * 0.4);
    const color  = 'var(--main-color)';
    const svgW = dw + depth + 8, svgH = dh + depth + 8;
    const x0 = 4, y0 = depth + 4, x1 = x0 + dw, y2 = y0 + dh;
    const dx = depth, dy = -depth;
    return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ filter: 'drop-shadow(0 0 10px var(--main-color))', overflow: 'visible' }}>
            {/* back edges (dashed) */}
            <line x1={x0+dx} y1={y0+dy} x2={x0+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            <line x1={x0+dx} y1={y0+dy} x2={x1+dx} y2={y0+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            <line x1={x0+dx} y1={y2+dy} x2={x1+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.5" />
            {/* top face */}
            <polygon points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y0+dy} ${x1},${y0}`} fill="rgba(249,115,22,0.08)" stroke={color} strokeWidth="1" />
            {/* right face */}
            <polygon points={`${x1},${y0} ${x1+dx},${y0+dy} ${x1+dx},${y2+dy} ${x1},${y2}`} fill="rgba(249,115,22,0.04)" stroke={color} strokeWidth="1" />
            {/* front face */}
            <rect x={x0} y={y0} width={dw} height={dh} fill="rgba(249,115,22,0.07)" stroke={color} strokeWidth="1.2" />
            {type !== 'pallet' && (
                <>
                    <line x1={x0} y1={y0} x2={x1} y2={y2} stroke={color} strokeWidth="0.5" opacity="0.3" />
                    <line x1={x1} y1={y0} x2={x0} y2={y2} stroke={color} strokeWidth="0.5" opacity="0.3" />
                </>
            )}
        </svg>
    );
};

// Format components for space-separated tags
function getDynamicCrateIdComponents(crate: CrateRecord, allCrates: CrateRecord[], allInventory: any[]) {
    if (!crate.inventory_ids || crate.status === 'Empty') return { date: '', vendors: [], sequence: crate.id.slice(0, 8).toUpperCase() };
    
    const d = crate.updated_at ? new Date(crate.updated_at) : new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const datePrefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
    
    const vSet = new Set<string>();
    crate.inventory_ids.split(',').filter(Boolean).forEach(entry => {
        const [id] = entry.split(':');
        const inv = findInventoryByRow(allInventory, id);
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
        c.inventory_ids.split(',').filter(Boolean).forEach(entry => {
            const [id] = entry.split(':');
            const inv = findInventoryByRow(allInventory, id);
            if (inv?.data) {
                const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
                if (p) cVSet.add(p.toUpperCase());
            }
        });
        return Array.from(cVSet).sort().join('') === vendorsStr;
    });

    matchingCrates.sort((a, b) => {
        const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tA === tB ? a.id.localeCompare(b.id) : tA - tB;
    });
    
    const index = matchingCrates.findIndex(c => c.id === crate.id);
    return {
        date: datePrefix,
        vendors: vendorsList,
        sequence: String(index + 1).padStart(2, '0')
    };
}
    

// ─── ActiveCrateHUD (Liquid Glass Top Header & Boxes.py CNC Studio Ribbon) ───────
const ActiveCrateHUD: React.FC<{
    crate: CrateRecord;
    selectedItemIds: Set<string>;
    selectedQtys: Record<string, number>;
    allInventory: any[];
    nestedUnits: CrateRecord[];
    exchangeRate: number;
    onClear: () => void;
    onPack: () => void;
    onUnpack: () => void;
    onUnnest: (id: string) => void;
    onDelete: () => void;
    isSaving: boolean;
    itemCount: number;
    crates: CrateRecord[];
    selectedItemsWithPos: { item: InventoryItem; position: any }[];
    onUpdatePosition: (id: string, pos: any) => void;
    separators: any[];
    onAddSeparator: () => void;
    onRemoveSeparator: (id: string) => void;
    onUpdateSeparator: (id: string, y: number) => void;
    viewMode: '3d' | 'stencil' | 'dual';
    onViewModeChange: (mode: '3d' | 'stencil' | 'dual') => void;
    selectedMaterialId: string;
    onSelectMaterial: (preset: MaterialPreset) => void;
    thicknessMm: number;
    onUpdateThickness: (val: number) => void;
    burnMm: number;
    onUpdateBurn: (val: number) => void;
    telemetry: ReturnType<typeof computeCutTelemetry>;
    boxesParams: BoxesGeneratorParams;
    cutfileSvg: string;
}> = ({ 
    crate, selectedItemIds, selectedQtys, allInventory, nestedUnits, 
    exchangeRate, onClear, onPack, onUnpack, onUnnest, onDelete, 
    isSaving, itemCount, crates, selectedItemsWithPos, onUpdatePosition,
    separators, onAddSeparator, onRemoveSeparator, onUpdateSeparator,
    viewMode, onViewModeChange, selectedMaterialId, onSelectMaterial,
    thicknessMm, onUpdateThickness, burnMm, onUpdateBurn,
    telemetry, boxesParams, cutfileSvg
}) => {
    const selectedItems = useMemo(() =>
        Array.from(selectedItemIds).flatMap(id => {
            const inv = findInventoryByRow(allInventory, id);
            if (!inv) return [];
            const norm = normalizeInventoryData(inv.data);
            const qty = selectedQtys[id] ?? 1;
            const paddedVol  = getItemPaddedVolume(inv.data, qty);
            const weight     = (Number(norm.weightKg) || 0) * qty;
            return [{ id, norm, qty, paddedVol, weight }];
        })
    , [selectedItemIds, selectedQtys, allInventory, exchangeRate]);

    const internalCrateCm3 = getCrateInternalVolume(crate);
    const alreadyPackedMap = useMemo(() => parseInventoryIds(crate.inventory_ids), [crate.inventory_ids]);
    
    // Total Volume including nested units
    const alreadyPackedPaddedVol = useMemo(() => {
        let v = 0;
        alreadyPackedMap.forEach((qty, id) => {
            const inv = findInventoryByRow(allInventory, id);
            if (!inv) return;
            v += getItemPaddedVolume(inv.data, qty === -1 ? 1 : qty);
        });
        // Add volume of nested units
        nestedUnits.forEach(u => {
            v += (u.width_cm || 0) * (u.length_cm || 0) * (u.height_cm || 0);
        });
        return v;
    }, [alreadyPackedMap, allInventory, nestedUnits]);

    const pendingPaddedVol = selectedItems.reduce((s, i) => s + i.paddedVol, 0);
    const totalUsedPaddedVol = alreadyPackedPaddedVol + pendingPaddedVol;
    const fillPct = internalCrateCm3 > 0 ? clampN(totalUsedPaddedVol / internalCrateCm3 * 100, 0, 100) : 0;

    const totalQty = selectedItems.reduce((s, i) => s + i.qty, 0);
    const totalNested = nestedUnits.length;
    const crateName = (crate as any).label || (crate as any).name || crate.id.slice(0, 8).toUpperCase();

    const handleDownloadSvg = () => {
        downloadLaserCutfileSvg(`${crateName}_cutfile.svg`, cutfileSvg);
        toast.success(tr("Laser cutfile SVG downloaded"));
    };

    const handleDownloadLightBurn = () => {
        const lbrnXml = generateLightBurnProjectXml(cutfileSvg, { materialThickness: thicknessMm });
        downloadLightBurnProject(`${crateName}_project.lbrn2`, lbrnXml);
        toast.success(tr("LightBurn (.lbrn2) project exported"));
    };

    const handleCopyCliRecipe = () => {
        const cmd = getBoxesCliRecipe(boxesParams.generator, {
            x: boxesParams.x,
            y: boxesParams.y,
            h: boxesParams.h,
            thickness: thicknessMm,
            burn: burnMm,
            outside: 1,
            sx: boxesParams.sx,
            sy: boxesParams.sy,
        }, `${crateName}_cutfile.svg`);
        navigator.clipboard.writeText(cmd);
        toast.success(tr("Boxes.py C:\\boxes CLI recipe copied ($env:PYTHONUTF8=1)"));
    };

    const handleLaunchWebServer = () => {
        navigator.clipboard.writeText(BOXES_RUNTIME.serverCommand);
        toast.success(tr("Boxes.py server command copied! Opening :8080"));
        window.open(BOXES_RUNTIME.serverUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="sticky top-20 sm:top-24 z-[60] w-full bg-black/75 dark:bg-black/90 backdrop-blur-3xl border-b border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col">
            {/* Top Row: Crate Specs, Apple HIG Mode Switcher & Quick Actions */}
            <div className="w-full max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8">
                {/* Left: Crate Identity & Dimensions */}
                <div className="flex items-center gap-4 min-w-0">
                    <div className="shrink-0 scale-75 origin-left">
                        <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={44} vibrant />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            {(() => {
                                const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(crate, crates, allInventory);
                                if (!date && !sequence) return (
                                    <span className="text-[11px] font-mono font-black text-white uppercase tracking-wider">{crateName}</span>
                                );
                                return (
                                    <div className="flex items-center rounded-lg overflow-hidden border border-white/10">
                                        {date && (
                                             <div className="bg-white/10 px-2 py-0.5">
                                                <span className="text-[12px] font-black text-white tracking-[0.05em] leading-none block">{date}</span>
                                            </div>
                                        )}
                                        {vList.map((v) => (
                                            <div key={v} className="px-2 py-0.5 bg-(--main-color)">
                                                <span className="text-[12px] font-black tracking-[0.05em] leading-none block text-black">{v}</span>
                                            </div>
                                        ))}
                                        {sequence && (
                                            <div className="px-2.5 py-0.5 bg-white/5">
                                                <span className="text-[12px] font-black tracking-[0.05em] leading-none block text-white/90">{sequence}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            
                            <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 rounded-lg text-[10px] font-mono font-bold tracking-tight">
                                {crate.width_cm || 60}×{crate.length_cm || 60}×{crate.height_cm || 60} cm
                            </span>

                            {(() => {
                                const cls = getContainerClassification(crate.type, crate.width_cm, crate.length_cm, crate.height_cm);
                                return (
                                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${cls.bg} ${cls.border} ${cls.color}`}>
                                        {cls.icon} {cls.badge}
                                    </span>
                                );
                            })()}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                            <button 
                                onClick={onClear} 
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-wider text-white/60 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                                title={tr("Close Active Crate")}
                            >
                                <X size={10} />
                                {tr("Release")}
                            </button>
                            {crate.inventory_ids && (
                                <button 
                                    onClick={onUnpack} 
                                    disabled={isSaving} 
                                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-[9px] font-black uppercase tracking-wider text-rose-400 hover:text-rose-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                    title={tr("Unpack all items from crate")}
                                >
                                    <Trash2 size={10} />
                                    {tr("Reset")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Apple HIG Mode Switcher Pill */}
                <div className="flex items-center p-1 bg-black/60 backdrop-blur-xl border border-white/15 rounded-full shadow-xl">
                    {/* 📦 3D Isometric Crate */}
                    <button
                        type="button"
                        onClick={() => onViewModeChange('3d')}
                        className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                            viewMode === '3d'
                                ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)] border border-white/30 font-bold'
                                : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent font-medium'
                        }`}
                    >
                        <span>📦</span>
                        <span className="hidden sm:inline">{tr("3D Isometric Crate")}</span>
                        <span className="sm:hidden">3D</span>
                    </button>

                    {/* 📐 2D Laser Stencil */}
                    <button
                        type="button"
                        onClick={() => onViewModeChange('stencil')}
                        className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                            viewMode === 'stencil'
                                ? 'bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)] border border-amber-400/40 font-bold'
                                : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent font-medium'
                        }`}
                    >
                        <span>📐</span>
                        <span className="hidden sm:inline">{tr("2D Laser Stencil")}</span>
                        <span className="sm:hidden">2D Stencil</span>
                    </button>

                    {/* ◫ Dual Split View */}
                    <button
                        type="button"
                        onClick={() => onViewModeChange('dual')}
                        className={`hidden md:flex min-h-[36px] px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 items-center gap-1.5 cursor-pointer ${
                            viewMode === 'dual'
                                ? 'bg-cyan-500/20 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-cyan-400/50 font-bold'
                                : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent font-medium'
                        }`}
                        title={tr("Side-by-side 3D Crate and 2D Laser Stencil")}
                    >
                        <span className="text-sm leading-none">◫</span>
                        <span>{tr("Dual Split View")}</span>
                    </button>
                </div>

                {/* Right: Telemetry Metrics & Pack Action */}
                <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">{tr("Brute Weight")}</span>
                        <div className="flex items-center gap-1">
                            <input 
                                type="number"
                                step="0.1"
                                defaultValue={crate.brute_weight_kg || ''}
                                placeholder="0.0"
                                onBlur={async (e) => {
                                    const val = parseFloat(e.target.value);
                                    if (isNaN(val)) return;
                                    const tid = toast.loading(tr("Syncing weight..."));
                                    try {
                                        const db = (window as any).onyxDb;
                                        if (db) {
                                            const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                                            if (lDoc) await lDoc.patch({ brute_weight_kg: val, updated_at: new Date().toISOString() });
                                        }
                                        const summary = (crate as any).contents_summary || '';
                                        const cleaned = summary.replace(/\[BW:\d+\.?\d*\]/g, '').trim();
                                        const newSummary = `${cleaned} [BW:${val}]`.trim();
                                        await supabase.from('logistics').update({ contents_summary: newSummary, updated_at: new Date().toISOString() }).eq('id', crate.id);
                                        toast.success(tr("Recorded"), { id: tid });
                                    } catch (err) {
                                        toast.error(tr("Sync failed"), { id: tid });
                                    }
                                }}
                                className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400/50 transition text-right"
                            />
                            <span className="text-[9px] font-black text-white/40">KG</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">{tr("Fill")}</span>
                        <div className="flex items-baseline gap-0.5">
                            <span className={`text-xl sm:text-2xl font-black tabular-nums tracking-tighter ${fillPct > 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {fillPct.toFixed(0)}
                            </span>
                            <span className="text-[10px] font-black text-white/30">%</span>
                        </div>
                    </div>

                    {/* Staged Items Confirmation Action */}
                    {selectedItemIds.size > 0 && (
                        <button
                            onClick={onPack}
                            disabled={isSaving}
                            className="min-h-[44px] px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <CheckCircle2 size={16} strokeWidth={2.5} />
                            <span>{tr("Confirm Pack")} ({selectedItemIds.size})</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom Row: Boxes.py CNC Laser Studio HUD Ribbon */}
            <div className="w-full bg-white/[0.02] border-t border-white/10 px-6 py-2.5 sm:px-8 flex flex-wrap items-center justify-between gap-4 text-xs">
                {/* Material Presets & Laser Config */}
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/30 flex items-center gap-1">
                        <Layers size={12} className="text-amber-400" />
                        {tr("Material:")}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {MATERIAL_PRESETS.map(preset => {
                            const isSelected = selectedMaterialId === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    onClick={() => onSelectMaterial(preset)}
                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                        isSelected
                                            ? 'bg-white/15 text-white border-white/30 shadow-sm'
                                            : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color }} />
                                    <span>{preset.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-4 w-px bg-white/10 hidden sm:block" />

                    {/* Custom Thickness & Kerf Burn */}
                    <div className="flex items-center gap-2">
                        <label className="text-[9px] font-mono text-white/40 flex items-center gap-1">
                            <span>T:</span>
                            <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="25"
                                value={thicknessMm}
                                onChange={e => onUpdateThickness(parseFloat(e.target.value) || 3)}
                                className="w-11 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-white text-center focus:outline-none focus:border-amber-400"
                            />
                            <span>mm</span>
                        </label>

                        <label className="text-[9px] font-mono text-white/40 flex items-center gap-1">
                            <Flame size={11} className="text-amber-400" />
                            <span>Kerf:</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={burnMm}
                                onChange={e => onUpdateBurn(parseFloat(e.target.value) || 0.1)}
                                className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-amber-300 text-center focus:outline-none focus:border-amber-400"
                            />
                            <span>mm</span>
                        </label>
                    </div>
                </div>

                {/* CNC Telemetry Badges */}
                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar font-mono text-[10px]">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <Cpu size={12} />
                        <span>{tr("Nesting:")} <strong>{telemetry.nestingEfficiencyPct}%</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                        <span>{tr("Perimeter:")} <strong>{(telemetry.totalPerimeterMm / 1000).toFixed(2)}m</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70">
                        <span>{tr("Est. Cut:")} <strong>{Math.floor(telemetry.estCutTimeSec / 60)}m {telemetry.estCutTimeSec % 60}s</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50">
                        <span>{telemetry.panelCount} {tr("panels")} ({boxesParams.generator})</span>
                    </div>
                </div>

                {/* Direct Laser Fabrication Exports & Separators */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownloadSvg}
                        className="min-h-[30px] px-3 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title={tr("Download Boxes.py Vector Stencil (SVG)")}
                    >
                        <Download size={12} />
                        <span>{tr("SVG Stencil")}</span>
                    </button>

                    <button
                        onClick={handleDownloadLightBurn}
                        className="min-h-[30px] px-3 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title={tr("Download LightBurn Laser Cut Project (.lbrn2)")}
                    >
                        <Flame size={12} />
                        <span>{tr("LightBurn")}</span>
                    </button>

                    <button
                        onClick={handleCopyCliRecipe}
                        className="min-h-[30px] px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 text-[10px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title={tr("Copy Windows PowerShell Boxes.py CLI command to clipboard")}
                    >
                        <Copy size={11} />
                        <span className="hidden lg:inline">{tr("CLI Recipe")}</span>
                    </button>

                    <button
                        onClick={handleLaunchWebServer}
                        className="min-h-[30px] px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title={`${tr("Launch local Boxes.py Web Server and copy command to clipboard")}: ${BOXES_RUNTIME.serverCommand}`}
                    >
                        <ExternalLink size={12} />
                        <span className="hidden sm:inline">{tr("Web Server (:8080)")}</span>
                    </button>

                    {/* Separators Toggle / Add */}
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button 
                        onClick={onAddSeparator}
                        className="min-h-[30px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        title={tr("Add Internal Shelf Separator")}
                    >
                        <Plus size={11} />
                        <span>{tr("Separator")}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── CrateSelectCard (Floating Borderless) ───────────────────────────────────────
const CrateSelectCard: React.FC<{
    crate: GroupedCrateRecord;
    isSelected: boolean;
    onClick: () => void;
    allCrates: CrateRecord[];
    allInventory: any[];
}> = ({ crate, isSelected, onClick, allCrates, allInventory }) => {
    const isPallet = crate.type === 'pallet';
    const partialCount = crate.children.filter(c => c.status === 'Partial' || (c.inventory_ids && c.inventory_ids.length > 0)).length;
    
    const dynamicParts = useMemo(() => {
        if (crate.status === 'Partial') return getDynamicCrateIdComponents(crate, allCrates, allInventory);
        return null;
    }, [crate, allCrates, allInventory]);

    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-6 transition-all duration-500 cursor-pointer p-8 rounded-3xl min-w-[180px] shrink-0 relative group select-none border-2 ${
                isSelected ? 'bg-black border-(--main-color) shadow-[0_0_50px_rgba(249,115,22,0.1)] z-10 scale-105' : 'bg-white/[0.03] backdrop-blur-md border-white/5 hover:border-white/20'
            }`}
        >
            {/* Visual Section */}
            <div className="relative h-24 flex items-center justify-center w-full">
                <div className={`transition-all duration-700 ${isSelected ? 'scale-110' : 'scale-90 opacity-60 group-hover:opacity-100'}`}>
                    <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} selected={isSelected} type={crate.type} size={100} />
                </div>
                
                {/* Dynamic Tags */}
                {dynamicParts && (
                    <div className="absolute top-0 left-0 flex flex-wrap gap-1.5 max-w-[100px]">
                        {dynamicParts.vendors.slice(0, 3).map(v => (
                            <div 
                                key={v}
                                className="px-2 py-0.5 rounded-none bg-(--main-color) text-black text-[8px] font-black uppercase tracking-widest"
                            >
                                {v}
                            </div>
                        ))}
                    </div>
                )}

                {crate.groupedCount > 1 && (
                    <div className="absolute top-0 right-0 bg-white/10 px-2 py-1 rounded-none text-[9px] font-black text-white/60 font-mono">
                        {crate.groupedCount}×
                    </div>
                )}
            </div>
            
            {/* Metadata Area */}
            <div className="text-center flex flex-col items-center gap-1.5">
                <p className={`text-lg font-black uppercase tracking-[0.2em] font-mono transition-colors ${isSelected ? 'text-(--main-color)' : 'text-white/80'}`}>
                    {crate.width_cm}×{crate.length_cm}×{crate.height_cm}
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {(() => {
                        const cls = getContainerClassification(crate.type, crate.width_cm, crate.length_cm, crate.height_cm);
                        return (
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${cls.bg} ${cls.border} ${cls.color}`}>
                                {cls.icon} {cls.badge}
                            </span>
                        );
                    })()}
                    {partialCount > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-400/20 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">{partialCount} {tr("Active")}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Selection Indicator Glow */}
            {isSelected && (
                <div className="absolute inset-0 rounded-none ring-2 ring-(--main-color)/20 pointer-events-none" />
            )}
        </button>
    );
};


// ─── Inventory Card (Data-Dense & Glassmorphic) ───────────────────────────────────
const PackingInventoryCard: React.FC<{
    item: InventoryItem;
    isSelected: boolean;
    packedQtyInCurrentCrate: number;
    totalPackedQty: number;
    selectedQty: number;
    onToggle: () => void;
    onQtyChange: (newQty: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
    exchangeRate: number;
}> = ({ item, isSelected, packedQtyInCurrentCrate, totalPackedQty, selectedQty, onToggle, onQtyChange, isExpanded, onToggleExpand, exchangeRate }) => {
    const d = item.data;
    const norm = normalizeInventoryData(d);
    const vendorPrefix = String(norm.itemId || d.vendor_id || '').split('-')[0] || '';
    const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');

    const imageUrl = getCleanImageUrl(norm.generatedPngUrl || (norm.mediaUrls ? String(norm.mediaUrls).split(',')[0] : null));

    const itemQuantity = Number(norm.quantity || 1);
    const availableForThisCrate = Math.max(0, itemQuantity - (totalPackedQty - packedQtyInCurrentCrate));
    const fullyPacked = availableForThisCrate === 0;

    const dimsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('×');

    return (
        <div 
            onClick={() => !fullyPacked && onToggle()}
            className={`group relative flex flex-col border transition-all duration-500 cursor-pointer overflow-hidden rounded-[2.5rem] ${
                isSelected 
                    ? 'bg-black border-(--main-color) shadow-[0_0_80px_rgba(249,115,22,0.15)] scale-[1.02] z-10' 
                    : 'bg-white/[0.03] border-white/5 hover:border-white/20 backdrop-blur-md'
            }`}
        >
            {/* Image Section */}
            <div className="relative aspect-square w-full overflow-hidden bg-black/40">
                {imageUrl ? (
                    <img src={imageUrl} className={`w-full h-full object-cover transition-transform duration-700 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><OnyxMiniLogo className="w-16 h-16" /></div>
                )}
                
                {/* Status Overlays */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end justify-between">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono font-black text-white/90 tracking-tighter uppercase">{calculated.bookBarcode}</span>
                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{vendorPrefix}</span>
                    </div>
                    {fullyPacked && (
                        <div className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                            <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">{tr("PACKED")}</span>
                        </div>
                    )}
                </div>

                {/* Selection Checkbox (Modern) */}
                <div className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                    isSelected ? 'bg-(--main-color) border-(--main-color) scale-110 shadow-lg' : 'bg-black/20 border-white/20'
                }`}>
                    {isSelected && <Check size={14} strokeWidth={4} className="text-black" />}
                </div>

                {/* Label Preview Hover Toggle */}
                <button
                    onClick={e => { e.stopPropagation(); onToggleExpand(); }}
                    className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
                    title={tr("Label Preview")}
                >
                    <Info size={14} />
                </button>
            </div>

            {/* Metadata Section */}
            <div className="p-5 flex flex-col gap-3">
                <div className="min-h-[40px]">
                    <h3 className="text-[11px] font-black text-white uppercase tracking-tight leading-tight line-clamp-2">
                        {(norm.shape || '') + ' ' + (norm.shortDescription || norm.description || tr("Untitled"))}
                    </h3>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="block text-[7px] font-black text-white/20 uppercase tracking-widest mb-0.5">{tr("DIMENSIONS")}</span>
                        <span className="block text-[9px] font-mono font-black text-white/70 truncate">{dimsCm || '—'} CM</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="block text-[7px] font-black text-white/20 uppercase tracking-widest mb-0.5">{tr("AVAILABILITY")}</span>
                        <span className={`block text-[10px] font-mono font-black ${fullyPacked ? 'text-rose-400/60' : 'text-emerald-400'}`}>
                            {availableForThisCrate}/{itemQuantity}
                        </span>
                    </div>
                </div>

                {/* Quantity Controller (Show only when selected) */}
                {isSelected && !fullyPacked && (
                    <div className="mt-1 flex items-center justify-between gap-2 p-1.5 bg-black/60 border border-white/10 rounded-2xl" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={e => { e.stopPropagation(); onQtyChange(Math.max(1, selectedQty - 1)); }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                        >
                            <Minus size={14} />
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="text-xs font-black text-white font-mono leading-none">{selectedQty}</span>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mt-0.5">{tr("UNIT")}</span>
                        </div>
                        <button
                            onClick={e => { e.stopPropagation(); onQtyChange(Math.min(availableForThisCrate, selectedQty + 1)); }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                )}

                {/* Label Preview (Inline Expanded) */}
                {isExpanded && (
                    <div className="mt-2 p-4 bg-white/5 border border-white/10 rounded-3xl animate-in fade-in zoom-in-95 duration-300">
                        <NFCTagCard item={{ normData: norm, codes: calculated }} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
export const CratePackingManager: React.FC = () => {
    const db = useDatabase();
    const allInventory = useAtomValue(inventoryAtom);
    const [cratesVersion, setCratesVersion] = useAtom(cratesVersionAtom);
    const search = useAtomValue(TOP_BAR_SEARCH_ATOM);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);

    const [isOpen, setIsOpen] = useAtom(isCratePackingManagerOpenAtom);
    const [targetCrateId, setTargetCrateId] = useAtom(packingManagerTargetCrateIdAtom);
    const [globalSelectedIds, setGlobalSelectedIds] = useAtom(selectedInventoryIdsAtom);

    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
    // --- ATOMS ---
    const [allSeparators, setAllSeparators] = useAtom(crateSeparatorsAtom);
    const [allItemPositions, setAllItemPositions] = useAtom(crateItemPositionsAtom);

    const separators = useMemo(() => (selectedCrateId ? allSeparators[selectedCrateId] : []) || [], [allSeparators, selectedCrateId]);
    const setSeparators = useCallback((val: any) => {
        if (!selectedCrateId) return;
        setAllSeparators(prev => ({ ...prev, [selectedCrateId]: typeof val === 'function' ? val(prev[selectedCrateId] || []) : val }));
    }, [selectedCrateId, setAllSeparators]);

    const itemPositions = useMemo(() => (selectedCrateId ? allItemPositions[selectedCrateId] : {}) || {}, [allItemPositions, selectedCrateId]);
    const setItemPositions = useCallback((val: any) => {
        if (!selectedCrateId) return;
        setAllItemPositions(prev => ({ ...prev, [selectedCrateId]: typeof val === 'function' ? val(prev[selectedCrateId] || {}) : val }));
    }, [selectedCrateId, setAllItemPositions]);

    const handleAddSeparator = () => {
        if (!selectedCrate) return;
        const newSep = { id: Math.random().toString(36).slice(2, 9), y: 40, label: `SHELF ${separators.length + 1}` };
        setSeparators([...separators, newSep]);
        toast.success(tr("Separator added at 40cm"));
    };

    const handleRemoveSeparator = (id: string) => {
        setSeparators(separators.filter(s => s.id !== id));
    };

    const handleUpdateSeparator = (id: string, y: number) => {
        setSeparators(separators.map(s => s.id === id ? { ...s, y } : s));
    };

    const [vendorFilter, setVendorFilter] = useAtom(packingVendorFilterAtom);
    const [sortBy, setSortKey] = useAtom(packingSortKeyAtom);
    const [sortOrder, setSortOrder] = useAtom(packingSortOrderAtom);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    // Map of itemId -> qty user wants to pack into this crate
    const [selectedQtys, setSelectedQtys] = useState<Record<string, number>>({});
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isDashboardCollapsed, setIsDashboardCollapsed] = useState(false);
    const [nestingUnit, setNestingUnit] = useState<CrateRecord | null>(null);

    // Laser Fabrication & Workspace View Mode State
    const [workspaceViewMode, setWorkspaceViewMode] = useState<'3d' | 'stencil' | 'dual'>('3d');
    const [selectedMaterialId, setSelectedMaterialId] = useState<string>('plywood-6');
    const [customThicknessMm, setCustomThicknessMm] = useState<number>(6);
    const [customBurnMm, setCustomBurnMm] = useState<number>(0.15);

    const handleSelectCrate = useCallback((id: string | null) => {
        setSelectedCrateId(id);
        setExpandedIds(new Set());
        if (!id) {
            setSelectedItemIds(new Set());
            setSelectedQtys({});
            setActiveGroupKey(null); // Reset grouping when releasing unit
            return;
        }
        const crate = crates.find(c => c.id === id);
        if (crate) {
            const map = parseInventoryIds(crate.inventory_ids);
            const ids = new Set(map.keys());
            const qtys: Record<string, number> = {};
            map.forEach((q, iid) => { qtys[iid] = q === -1 ? 1 : q; });
            
            // Preserve staged items selected in PackingModule or WarehouseView
            if (globalSelectedIds && globalSelectedIds.length > 0) {
                globalSelectedIds.forEach(gid => ids.add(String(gid)));
            }

            setSelectedItemIds(ids);
            setSelectedQtys(qtys);
        } else {
            setSelectedItemIds(new Set());
            setSelectedQtys({});
        }
    }, [crates, globalSelectedIds]);

    // Handle initial target from simple wizard
    useEffect(() => {
        if (isOpen && targetCrateId && crates.length > 0) {
            handleSelectCrate(targetCrateId);
            setTargetCrateId(null);
        }
    }, [isOpen, targetCrateId, crates, handleSelectCrate, setTargetCrateId]);

    // Auto-select available crate if opening with global selected items but no target crate
    useEffect(() => {
        if (isOpen && !selectedCrateId && !targetCrateId && globalSelectedIds.length > 0 && crates.length > 0) {
            const firstAvailable = crates.find(c => c.status === 'Empty' || c.status === 'Partial') || crates[0];
            if (firstAvailable) {
                handleSelectCrate(firstAvailable.id);
            }
        }
    }, [isOpen, selectedCrateId, targetCrateId, globalSelectedIds.length, crates, handleSelectCrate]);

    // Sync local selectedItemIds with global selectedInventoryIdsAtom
    useEffect(() => {
        if (isOpen) {
            setSelectedItemIds(new Set(globalSelectedIds.map(String)));
        }
    }, [globalSelectedIds, isOpen]);

    // Subscribe to RxDB crates
    useEffect(() => {
        if (!db) return;
        const sub = db.logistics.find({ selector: { type: { $in: ['crate', 'pallet', 'cardboard'] } } }).$.subscribe((data: any[]) => {
            setCrates(data.map(c => c.toJSON()));
        });
        return () => sub.unsubscribe();
    }, [db, cratesVersion]);

    const activeCrates = useMemo(() => crates.filter(c => 
        (c.status !== 'Packed' || (c.type === 'cardboard' && !c.parent_id)) && 
        (c.type === 'crate' || c.type === 'pallet' || c.type === 'cardboard')
    ), [crates]);

    const groupedAvailableCrates = useMemo(() => {
        const individualPartials: any[] = [];
        const nestableBoxes: any[] = [];
        const emptyGroups: Record<string, any> = {};
        
        for (const c of activeCrates) {
            if (c.status === 'Packed' && c.type === 'cardboard') {
                nestableBoxes.push({
                    ...c,
                    groupedCount: 1,
                    children: [c],
                    groupKey: `NEST_${c.id}`,
                    vendorKey: 'NESTABLE',
                    isNestable: true
                });
            } else if (c.status === 'Partial') {
                const parts = getDynamicCrateIdComponents(c, crates, allInventory);
                const vKey = parts.vendors.length > 0 ? parts.vendors.join(',') : 'PARTIAL';
                individualPartials.push({
                    ...c,
                    groupedCount: 1,
                    children: [c],
                    groupKey: `ID_${c.id}`,
                    vendorKey: vKey
                });
            } else {
                // Group empty by dimensions
                const dimTypeKey = `${c.width_cm}x${c.length_cm}x${c.height_cm}x${c.type}`;
                if (!emptyGroups[dimTypeKey]) {
                    emptyGroups[dimTypeKey] = {
                        ...c,
                        groupedCount: 0,
                        children: [],
                        groupKey: `EMPTY_${dimTypeKey}`,
                        vendorKey: 'EMPTY'
                    };
                }
                emptyGroups[dimTypeKey].groupedCount += 1;
                emptyGroups[dimTypeKey].children.push(c);
            }
        }
        
        return [
            ...nestableBoxes.sort((a, b) => a.id.localeCompare(b.id)),
            ...individualPartials.sort((a, b) => a.vendorKey.localeCompare(b.vendorKey)),
            ...Object.values(emptyGroups).sort((a, b) => {
                if (a.width_cm !== b.width_cm) return b.width_cm - a.width_cm;
                return b.length_cm - a.length_cm;
            })
        ];
    }, [activeCrates, crates, allInventory]);

    const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
    const activeGroup = useMemo(() => activeGroupKey ? groupedAvailableCrates.find(g => (g as any).groupKey === activeGroupKey) : null, [activeGroupKey, groupedAvailableCrates]);

    const selectedCrate = useMemo(() => crates.find(c => c.id === selectedCrateId) ?? null, [crates, selectedCrateId]);

    // Current crate packed ID map
    const currentCratePackedMap = useMemo(() => parseInventoryIds(selectedCrate?.inventory_ids), [selectedCrate]);

    const packedIds = useMemo(() => new Set(currentCratePackedMap.keys()), [currentCratePackedMap]);

    const allPackedIds = useMemo(() => {
        const ids = new Set<string>();
        crates.forEach(c => {
            parseInventoryIds(c.inventory_ids).forEach((_, id) => ids.add(id));
        });
        return ids;
    }, [crates]);

    const vendorOptions = useMemo(() => {
        const vs = new Set<string>();
        allInventory.forEach(i => { const v = i.data.vendor_id || i.data.vendorId || (i.data.itemId || '').split('-')[0]; if (v) vs.add(v); });
        return ['All', ...Array.from(vs)];
    }, [allInventory]);

    // Smart multi-term search and sorting
    const filteredInventory = useMemo(() => {
        let items = allInventory.filter(i => {
            const d = i.data;
            if ((d as any).is_hidden) return false;

            const iid = String(i.row);
            const norm = normalizeInventoryData(d);
            const totalQty = Number(norm.quantity || 1);
            const totalPacked = getTotalPackedForItem(iid, crates);
            const isInCurrentCrate = currentCratePackedMap.has(iid);
            
            // Hide if fully packed and not in the current crate
            if (totalPacked >= totalQty && !isInCurrentCrate) return false;

            const vendorId = d.vendor_id || d.vendorId || (d.itemId || '').split('-')[0];
            
            // Fix: Handle null/undefined vendorFilter correctly
            const isAllMode = !vendorFilter || vendorFilter === 'All';
            const vendorMatch = isAllMode || vendorId === vendorFilter;
            
            if (!vendorMatch) return false;

            // If in "All Vendors" mode, the user specifically requested "all unpacked items"
            // We interpret this as prioritizing items that have NO units packed yet if in All mode
            // and search is empty. Otherwise, we show all available items.
            if (isAllMode && !search && totalPacked > 0 && !isInCurrentCrate) {
                // Optional: We could hide partially packed items in "All Vendors" view to focus on backlog
                // But it's safer to just keep them. Let's see if we can just sort them lower.
            }

            if (search) {
                const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                const fields = [
                    norm.itemId, norm.itemNumber, norm.color, norm.material,
                    norm.shape, norm.shortDescription, norm.description,
                    norm.widthCm, norm.heightCm, norm.lengthCm, norm.weightKg,
                    calculated.bookAqCode, calculated.bookLandCode, calculated.bookBardcode,
                    norm.status, norm.workbook, vendorId,
                ].map(v => String(v || '').toLowerCase());
                const haystack = fields.join(' ');
                const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
                if (!terms.every(t => haystack.includes(t))) return false;
            }
            return true;
        });

        // Sorting logic - Priority to unpacked items when in All Vendors mode
        items.sort((a, b) => {
            if (!vendorFilter || vendorFilter === 'All') {
                const totalPackedA = getTotalPackedForItem(String(a.row), crates);
                const totalPackedB = getTotalPackedForItem(String(b.row), crates);
                // Unpacked items (totalPacked === 0) come first
                if (totalPackedA === 0 && totalPackedB > 0) return -1;
                if (totalPackedA > 0 && totalPackedB === 0) return 1;
            }

            let valA: any = '';
            let valB: any = '';
            // ... rest of sorting stays the same

            switch (sortBy) {
                case 'Date':
                    valA = a.data?.updated_at || '';
                    valB = b.data?.updated_at || '';
                    break;
                case 'Status':
                    valA = a.data?.status || '';
                    valB = b.data?.status || '';
                    break;
                case 'Vendor':
                    valA = a.data?.vendor_id || a.data?.vendorId || '';
                    valB = b.data?.vendor_id || b.data?.vendorId || '';
                    break;
                case '#':
                    valA = Number(a.data?.quantity || 1);
                    valB = Number(b.data?.quantity || 1);
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [allInventory, search, vendorFilter, exchangeRate, sortBy, sortOrder]);

    const toggleItem = useCallback((id: string, maxQty: number) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                setSelectedQtys(q => { const nq = { ...q }; delete nq[id]; return nq; });
            } else {
                next.add(id);
                // Default to 1, or maxQty if maxQty is less than 1 (e.g., 0, though it should be at least 1 to be selectable)
                setSelectedQtys(q => ({ ...q, [id]: Math.max(1, Math.min(maxQty, 1)) }));
            }
            return next;
        });
    }, []);

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const handlePackItems = async () => {
        if (!selectedCrate) return;
        setIsSaving(true);
        const isUpdate = selectedCrate.inventory_ids && selectedCrate.inventory_ids.length > 0;
        const tid = toast.loading(isUpdate ? `Updating ${selectedCrate.type}...` : `Packing ${selectedItemIds.size} item(s)...`);
        
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1500));
                toast.success(isUpdate ? "Crate contents updated (Demo Mode)" : "Packing confirmed (Demo Mode)", { id: tid, icon: '🧪' });
                setSelectedItemIds(new Set());
                setSelectedQtys({});
                setCratesVersion(v => v + 1);
                setIsSaving(false);
                return;
            }
            // THE NEW MAP: fully defined by the staged selection (overwrite mode)
            const newMap = new Map<string, number>();
            selectedItemIds.forEach(id => {
                newMap.set(id, selectedQtys[id] ?? 1);
            });

            const serialized = serializeInventoryIds(newMap);
            const totalUnits = Array.from(newMap.values()).reduce((s, q) => s + (q === -1 ? 1 : q), 0);
            const summary = `${newMap.size} SKU(s) · ${totalUnits} unit(s) packed`;
            const newStatus = totalUnits === 0 ? 'Empty' : 'Partial';
            const updatePayload = { 
                inventory_ids: serialized, 
                contents_summary: summary, 
                status: newStatus as any, 
                updated_at: new Date().toISOString() 
            };

            // 1. Update the crate in Supabase
            const { error: crateErr } = await supabase.from('logistics').update(updatePayload).eq('id', selectedCrate.id);
            if (crateErr) throw crateErr;

            // 2. Local RxDB update
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.patch(updatePayload);
            }

            // 3. Sync Inventory crate_id pointers
            const originalMap = parseInventoryIds(selectedCrate.inventory_ids);
            const originalIds = Array.from(originalMap.keys());
            const currentIds = Array.from(newMap.keys());

            const addedIds = currentIds.filter(id => !originalMap.has(id));
            const removedIds = originalIds.filter(id => !newMap.has(id));

            // Mark additions
            if (addedIds.length > 0) {
                await packItems(selectedCrate.id, addedIds);
            }

            // Mark removals
            if (removedIds.length > 0) {
                await unpackItems(removedIds);
            }

            toast.success(isUpdate ? "Crate contents updated" : "Packing confirmed", { id: tid });
            
            // FIX: Clear selection after successful pack to avoid double-counting volume 
            // and ensure the fill bar correctly reflects the saved state.
            setSelectedItemIds(new Set());
            setSelectedQtys({});
            
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Update failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnpackAll = async () => {
        if (!selectedCrate) return;
        const currentIds = parseInventoryIds(selectedCrate.inventory_ids);
        if (currentIds.size === 0) return;

        setIsSaving(true);
        const tid = toast.loading(`Unpacking ${selectedCrate.type}...`);

        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1500));
                toast.success(tr("Crate unpacked (Demo Mode)"), { id: tid, icon: '🧪' });
                setSelectedItemIds(new Set());
                setSelectedQtys({});
                setCratesVersion(v => v + 1);
                setIsSaving(false);
                return;
            }

            const updatePayload = {
                inventory_ids: "",
                contents_summary: "0 SKU(s) · 0 unit(s) packed",
                status: 'Empty' as any,
                updated_at: new Date().toISOString()
            };

            // 1. Update the crate in Supabase
            const { error: crateErr } = await supabase.from('logistics').update(updatePayload).eq('id', selectedCrate.id);
            if (crateErr) throw crateErr;

            // 2. Local RxDB update
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.patch(updatePayload);
            }

            // 3. Sync Inventory (remove crate_id)
            const itemIds = Array.from(currentIds.keys());
            await unpackItems(itemIds);

            toast.success(tr("Crate unpacked"), { id: tid });
            setSelectedItemIds(new Set());
            setSelectedQtys({});
            setCratesVersion(v => v + 1);
        } finally {
            setIsSaving(false);
        }
    };

    const handleNestUnit = async (sourceId: string, parentId: string) => {
        setIsSaving(true);
        const tid = toast.loading(tr("Nesting unit..."));
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success(tr("Unit nested (Demo Mode)"), { id: tid, icon: '🧪' });
                setNestingUnit(null);
                setCratesVersion(v => v + 1);
                return;
            }
            const updatePayload = { parent_id: parentId, updated_at: new Date().toISOString() };
            const { error: nestErr } = await supabase.from('logistics').update(updatePayload).eq('id', sourceId);
            if (nestErr) throw nestErr;
            if (db) {
                const localUnit = await db.logistics.findOne({ selector: { id: sourceId } }).exec();
                if (localUnit) await localUnit.patch(updatePayload);
            }
            toast.success(tr("Unit successfully nested"), { id: tid });
            setNestingUnit(null);
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Nesting failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnnestUnit = async (unitId: string) => {
        setIsSaving(true);
        const tid = toast.loading(tr("Unnesting unit..."));
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success(tr("Unit unnested (Demo Mode)"), { id: tid, icon: '🧪' });
                setCratesVersion(v => v + 1);
                return;
            }
            const updatePayload = { parent_id: null, updated_at: new Date().toISOString() };
            const { error: unnestErr } = await supabase.from('logistics').update(updatePayload).eq('id', unitId);
            if (unnestErr) throw unnestErr;
            if (db) {
                const localUnit = await db.logistics.findOne({ selector: { id: unitId } }).exec();
                if (localUnit) await localUnit.patch(updatePayload);
            }
            toast.success(tr("Unit successfully unnested"), { id: tid });
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Unnesting failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCrate = async () => {
        if (!selectedCrate) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE this ${selectedCrate.type}? This action cannot be undone.`)) return;

        setIsSaving(true);
        const tid = toast.loading(`Deleting ${selectedCrate.type}...`);

        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1500));
                toast.success(tr("Crate deleted (Demo Mode)"), { id: tid, icon: '🧪' });
                handleSelectCrate(null);
                setCratesVersion(v => v + 1);
                setIsSaving(false);
                return;
            }

            // 1. If it has items, release them first (update inventory crate_id to null)
            const currentIds = parseInventoryIds(selectedCrate.inventory_ids);
            if (currentIds.size > 0) {
                const itemIds = Array.from(currentIds.keys());
                await unpackItems(itemIds);
            }

            // 2. Delete from Supabase
            const { error: delErr } = await supabase.from('logistics').delete().eq('id', selectedCrate.id);
            if (delErr) throw delErr;

            // 3. Delete from RxDB
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.remove();
            }

            toast.success(tr("Crate permanently deleted"), { id: tid });
            handleSelectCrate(null);
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Delete failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const nestedUnits = useMemo(() => 
        crates.filter(c => c.parent_id === selectedCrateId),
    [crates, selectedCrateId]);

    const itemsWithPositions = useMemo(() => {
        return Array.from(selectedItemIds).map(id => {
            const inv = findInventoryByRow(allInventory, id);
            return {
                item: inv as InventoryItem,
                position: itemPositions[id] || { x: 0, y: 0, z: 0, rotation: 0, isFlipped: false }
            };
        }).filter(entry => entry.item);
    }, [selectedItemIds, allInventory, itemPositions]);

    const packedSpecs = useMemo<PackedItemSpec[]>(() => {
        return itemsWithPositions.map(({ item, position }) => {
            const norm = normalizeInventoryData(item?.data || {});
            return {
                id: String(item?.row || item?.id || 'item'),
                name: norm.shortDescription || norm.itemId || 'Item',
                xCm: position?.x || 0,
                yCm: position?.y || 0,
                zCm: position?.z || 0,
                widthCm: Number(norm.widthCm) || 10,
                lengthCm: Number(norm.lengthCm) || 10,
                heightCm: Number(norm.heightCm) || 10,
            };
        });
    }, [itemsWithPositions]);

    const activeCrateDims = useMemo(() => ({
        widthCm: selectedCrate?.width_cm || 60,
        lengthCm: selectedCrate?.length_cm || 60,
        heightCm: selectedCrate?.height_cm || 60,
        thicknessMm: customThicknessMm,
        burnMm: customBurnMm,
    }), [selectedCrate?.width_cm, selectedCrate?.length_cm, selectedCrate?.height_cm, customThicknessMm, customBurnMm]);

    const activeTelemetry = useMemo(() => {
        return computeCutTelemetry(activeCrateDims, packedSpecs);
    }, [activeCrateDims, packedSpecs]);

    const activeBoxesParams = useMemo(() => {
        return computeBoxesParams(activeCrateDims, packedSpecs);
    }, [activeCrateDims, packedSpecs]);

    const activeCutfileSvg = useMemo(() => {
        return generateProceduralCrateSvg(activeCrateDims, packedSpecs);
    }, [activeCrateDims, packedSpecs]);

    if (!isOpen) return null;

    return createPortal(
        <div className="ui-root fixed inset-0 z-[10060] flex flex-col bg-black/85 backdrop-blur-3xl select-none animate-in fade-in duration-300 pt-16 sm:pt-20 text-white font-sans">
            {/* Header / Top Panel with Close Button */}
            <div className="absolute top-4 left-6 right-6 z-[10070] flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-4 sm:gap-6 pointer-events-auto">
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-all active:scale-90 shadow-2xl cursor-pointer"
                        title={tr("Close Workspace")}
                    >
                        <X size={20} />
                    </button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-[0.4em] italic drop-shadow-lg">{tr("Advanced Packing")}</h2>
                            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/10 border border-emerald-400/30 text-emerald-300">
                                🟢 Boxes.py C:\boxes Engine Active
                            </span>
                        </div>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mt-0.5">{tr("3D Spatial Manifest & Laser Fabrication Studio")}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(BOXES_RUNTIME.serverCommand);
                            toast.success(tr("Boxes.py server command copied! Opening :8080"));
                            window.open(BOXES_RUNTIME.serverUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono text-cyan-300 transition-all cursor-pointer shadow-lg active:scale-95"
                        title={`${tr("Start local Boxes.py Web Server")}: ${BOXES_RUNTIME.serverCommand}`}
                    >
                        <ExternalLink size={13} />
                        <span>Boxes.py Server (:8080)</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col relative m-0 p-0 overflow-hidden bg-transparent">
            {/* ─── Top Panel: HUD (Sticky when active) ─── */}
            {/* HUD is now rendered inside the workspace area for better focus */}

            {/* ─── Unit Picker (Full screen if no crate selected) ─── */}
            {!selectedCrate && (
                <div className="flex-1 flex flex-col bg-white/[0.01] backdrop-blur-3xl min-h-0 border-x border-white/5 relative overflow-y-auto custom-scrollbar">
                    {/* Background Decorative Element */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-(--main-color)/5 blur-[120px] rounded-full -translate-y-1/2 pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full translate-x-1/4 translate-y-1/4 pointer-events-none" />
                    
                    {/* Header Section */}
                    <div className="px-6 pt-12 pb-8 sm:px-10 shrink-0">
                        <div className="max-w-7xl mx-auto flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1.5">
                                    <h3 className="text-[14px] font-black uppercase tracking-[0.6em] text-(--main-color) italic">
                                        {activeGroup?.isNestable ? tr("Packed Boxes") : `Available ${activeGroup ? activeGroup.type === 'pallet' ? tr("Pallets") : 'Crates' : tr("Storage Units")}`}
                                    </h3>
                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] font-mono">
                                        {activeCrates.length} {activeGroup?.isNestable ? tr("Ready for Nesting") : tr("Precision Units Ready for Assignment")}
                                    </p>
                                </div>
                                {activeGroup && (
                                    <button
                                        onClick={() => setActiveGroupKey(null)}
                                        className="text-[10px] font-black uppercase tracking-[0.2em] text-white hover:text-black px-6 py-2.5 bg-white/5 hover:bg-(--main-color) border border-white/10 hover:border-(--main-color) transition-all cursor-pointer flex items-center gap-2 group font-mono"
                                    >
                                        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                                        {tr("Root Catalog")}
                                    </button>
                                )}
                            </div>

                            {/* Warehouse Status & Classification Inventory Bar */}
                            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
                                {(() => {
                                    const woodCount = crates.filter(c => c.type === 'crate').length;
                                    const palletCount = crates.filter(c => c.type === 'pallet').length;
                                    const boxCount = crates.filter(c => c.type === 'cardboard' || (c.width_cm === 38 && c.length_cm === 41 && c.height_cm === 38)).length;
                                    const emptyCount = crates.filter(c => c.status === 'Empty').length;
                                    const activeCount = crates.filter(c => c.status === 'Partial').length;
                                    const packedCount = crates.filter(c => c.status === 'Packed').length;

                                    return (
                                        <>
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 rounded-xl text-[10px] font-bold">
                                                <span>🪵</span>
                                                <span>{woodCount} {tr("Wood Crates")}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 rounded-xl text-[10px] font-bold">
                                                <span>▤</span>
                                                <span>{palletCount} {tr("Freight Pallets")}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-400/20 text-amber-300 rounded-xl text-[10px] font-bold">
                                                <span>⚡</span>
                                                <span>{boxCount} {tr("Boxes.py Laser Boxes")}</span>
                                            </div>
                                            <div className="h-3 w-px bg-white/10 hidden sm:block" />
                                            <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                                                <span>{emptyCount} {tr("Empty")}</span>
                                                <span>•</span>
                                                <span className="text-amber-400">{activeCount} {tr("Active")}</span>
                                                <span>•</span>
                                                <span className="text-rose-400">{packedCount} {tr("Packed")}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Free-Floating Grid Section - Responsive Scrollable Mobile View */}
                    <div className="px-6 pb-32 sm:px-10">
                        <div className="w-full">
                            <div className="flex flex-nowrap overflow-x-auto sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 sm:gap-10 no-scrollbar pb-8 sm:pb-0">
                                {activeCrates.length === 0 ? (
                                    <div className="flex flex-col items-center gap-6 py-24 opacity-20 col-span-full justify-center">
                                        <Inbox size={48} strokeWidth={0.5} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.5em] font-mono">{tr("No Available Logistics Hardware")}</span>
                                    </div>
                                ) : !activeGroup ? (
                                    groupedAvailableCrates.map(group => {
                                        const isSelected = selectedCrateId && group.children.some(c => c.id === selectedCrateId);
                                        return (
                                            <CrateSelectCard
                                                key={group.id}
                                                crate={{ ...group, status: group.children.some(c => c.status === 'Partial') ? 'Partial' : 'Empty' } as any}
                                                isSelected={!!isSelected}
                                                allCrates={crates}
                                                allInventory={allInventory}
                                                onClick={() => {
                                                    setActiveGroupKey((group as any).groupKey);
                                                    const targetCrate = [...group.children].sort((a, b) => a.status === 'Partial' ? -1 : 1)[0];
                                                    handleSelectCrate(targetCrate.id);
                                                }}
                                            />
                                        );
                                    })
                                ) : (
                                    activeGroup.children.map(c => {
                                        const isSelected = selectedCrateId === c.id;
                                        const isBox = c.type === 'cardboard';
                                        const isPacked = c.status === 'Packed';
                                        
                                        return (
                                            <div key={c.id} className="relative group/unit">
                                                <button
                                                    onClick={() => handleSelectCrate(c.id)}
                                                    className={`w-full flex flex-col gap-6 transition-all cursor-pointer relative p-8 border ${isSelected ? 'bg-white/10 backdrop-blur-2xl border-(--main-color) shadow-[0_0_60px_rgba(249,115,22,0.3)] scale-[1.05] z-10' : 'bg-white/[0.03] backdrop-blur-xl border-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className={`text-[14px] font-mono font-black leading-none tracking-[0.2em] ${isSelected ? 'text-(--main-color)' : 'text-white/40'}`}>
                                                            {c.id.slice(0, 8).toUpperCase()}
                                                        </span>
                                                        <div className={`w-3 h-3 rounded-none ${c.status === 'Partial' ? 'bg-amber-400' : isPacked ? 'bg-rose-400' : 'bg-emerald-400'} ${isSelected ? 'shadow-[0_0_15px_currentColor]' : ''}`} />
                                                    </div>
                                                    <div className="flex flex-col gap-2 text-left">
                                                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isSelected ? 'text-white' : 'text-white/20'}`}>
                                                            {el(c.status)}
                                                        </span>
                                                        <div className={`h-2 transition-all duration-1000 ${isSelected ? 'w-full bg-(--main-color)' : 'w-10 bg-white/10'}`} />
                                                    </div>

                                                    {isSelected && (
                                                        <div className="absolute -top-3 -right-3 bg-(--main-color) text-black p-1.5 z-20">
                                                            <CheckCircle2 size={16} strokeWidth={4} />
                                                        </div>
                                                    )}
                                                </button>

                                                {/* NEST Button for packed boxes */}
                                                {isPacked && isBox && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setNestingUnit(c); }}
                                                        className="absolute bottom-2 right-2 bg-blue-500 text-white px-4 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all z-20 flex items-center gap-2 shadow-lg opacity-0 group-hover/unit:opacity-100 translate-y-2 group-hover/unit:translate-y-0"
                                                    >
                                                        <PackagePlus size={12} />
                                                        {tr("Nest")}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Area: Inventory List ── */}
            <div className={`flex-1 flex flex-col min-w-0 relative ${!selectedCrate ? 'hidden' : ''}`}>
                {/* INDUSTRIAL CONFIG DRAWER - Redesigned as Sticky Glassmorphic Toolbars */}
                <div className={`sticky top-24 sm:top-28 z-[90] overflow-hidden transition-all duration-700 bg-black/40 backdrop-blur-3xl border-b border-white/10 ${isFiltersOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                    <div className="flex flex-col">
                        
                        {/* Toolbar 1: Sort Parameters */}
                        <div className="flex items-center gap-10 px-8 py-5 border-b border-white/5 overflow-x-auto no-scrollbar">
                            <div className="flex items-center gap-2 shrink-0">
                                {(['Date', 'Status', 'Vendor', '#'] as const).map(s => {
                                    const isActive = sortBy === s;
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => {
                                                if (sortBy === s) {
                                                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortKey(s);
                                                }
                                            }}
                                            className={`px-6 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                                                isActive 
                                                    ? 'bg-(--main-color) text-black border-transparent shadow-[0_0_20px_rgba(var(--main-rgb),0.3)]' 
                                                    : 'bg-white/5 text-white/20 border-white/5 hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {s}
                                            {isActive && (
                                                <div className="flex flex-col -space-y-1">
                                                    <ChevronRight size={8} className={`-rotate-90 ${sortOrder === 'asc' ? 'text-black' : 'text-black/40'}`} />
                                                    <ChevronRight size={8} className={`rotate-90 ${sortOrder === 'desc' ? 'text-black' : 'text-black/40'}`} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Toolbar 2: Source Vendor Identity (Horizontally Scrollable) */}
                        <div className="flex items-center gap-8 px-8 py-5 overflow-x-auto no-scrollbar">
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setVendorFilter(null)}
                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
                                        !vendorFilter ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                    }`}
                                >{tr("ALL VENDORS")}</button>
                                {vendorOptions.filter(v => v !== 'All').map(v => {
                                    const vColor = vendors[v as keyof typeof vendors]?.color || 'white';
                                    const isActive = vendorFilter === v;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setVendorFilter(v)}
                                            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-3 ${
                                                isActive 
                                                    ? 'bg-white text-black border-white shadow-xl' 
                                                    : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                            }`}
                                        >
                                            <div 
                                                className="w-2.5 h-2.5 rounded-full" 
                                                style={{ backgroundColor: vColor, boxShadow: isActive ? `0 0 10px ${vColor}` : 'none' }} 
                                            />
                                            {v}
                                        </button>
                                    );
                                })}
                    </div>
                </div>
            </div>
        </div>
            {!selectedCrate ? (
                            <div className="flex flex-col items-center justify-center py-32 text-center opacity-40 gap-10">
                                <div className="p-12 bg-white/[0.02] rounded-full border border-white/5 relative">
                                    <div className="absolute inset-0 bg-(--main-color)/5 blur-3xl rounded-full" />
                                    <Package size={80} className="text-white/10 relative" strokeWidth={0.5} />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <p className="text-[14px] font-black uppercase tracking-[0.5em] text-white/30">
                                        {tr("Initialize Packing Sequence")}
                                    </p>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">
                                        {tr("Select a destination unit to begin item assignment")}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col w-full h-full">
                                <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                                    {/* 3D WORKSPACE VIEW - LEFT PANEL */}
                                    <div className="flex-1 min-h-[400px] lg:min-h-0 flex flex-col items-center justify-center relative p-6 md:p-12 overflow-hidden">
                                        
                                        
                                        <ActiveCrateHUD
                                            crate={selectedCrate}
                                            selectedItemIds={selectedItemIds}
                                            selectedQtys={selectedQtys}
                                            allInventory={allInventory}
                                            nestedUnits={nestedUnits}
                                            exchangeRate={exchangeRate}
                                            onClear={() => handleSelectCrate(null)}
                                            onPack={handlePackItems}
                                            onUnpack={handleUnpackAll}
                                            onUnnest={handleUnnestUnit}
                                            onDelete={handleDeleteCrate}
                                            isSaving={isSaving}
                                            itemCount={filteredInventory.length}
                                            crates={crates}
                                            selectedItemsWithPos={itemsWithPositions.filter(i => selectedItemIds.has(String(i.item.row)))}
                                            onUpdatePosition={(id, pos) => setItemPositions(prev => ({ ...prev, [id]: pos }))}
                                            separators={separators}
                                            onAddSeparator={handleAddSeparator}
                                            onRemoveSeparator={handleRemoveSeparator}
                                            onUpdateSeparator={handleUpdateSeparator}
                                            viewMode={workspaceViewMode}
                                            onViewModeChange={setWorkspaceViewMode}
                                            selectedMaterialId={selectedMaterialId}
                                            onSelectMaterial={(p) => {
                                                setSelectedMaterialId(p.id);
                                                setCustomThicknessMm(p.thicknessMm);
                                                setCustomBurnMm(p.burnMm);
                                            }}
                                            thicknessMm={customThicknessMm}
                                            onUpdateThickness={setCustomThicknessMm}
                                            burnMm={customBurnMm}
                                            onUpdateBurn={setCustomBurnMm}
                                            telemetry={activeTelemetry}
                                            boxesParams={activeBoxesParams}
                                            cutfileSvg={activeCutfileSvg}
                                        />
                                        
                                        <CratePackingWorkspace 
                                            width={selectedCrate.width_cm || 60}
                                            length={selectedCrate.length_cm || 60}
                                            height={selectedCrate.height_cm || 60}
                                            items={itemsWithPositions}
                                            separators={separators}
                                            onUpdatePosition={(id, pos) => setItemPositions(prev => ({ ...prev, [id]: pos }))}
                                            activeItemId={null}
                                            crateName={(selectedCrate as any).label || selectedCrate.id || 'Crate'}
                                            crateType={selectedCrate.type}
                                            viewMode={workspaceViewMode}
                                            onViewModeChange={setWorkspaceViewMode}
                                            hideModeSwitcher={true}
                                            availableContainers={crates.map(c => ({
                                                id: c.id,
                                                name: `${(c as any).label || c.id.slice(0, 8).toUpperCase()} (${fmtDims(c)} cm)`,
                                                type: (c.type === 'pallet' ? 'pallet' : (c.type === 'cardboard' || (c.width_cm === 38 && c.length_cm === 41 && c.height_cm === 38)) ? 'cardboard' : 'crate'),
                                                widthCm: c.width_cm || 60,
                                                lengthCm: c.length_cm || 60,
                                                heightCm: c.height_cm || 60,
                                                status: c.status,
                                            }))}
                                            selectedContainerId={selectedCrate.id}
                                            onSelectContainer={(id) => handleSelectCrate(id)}
                                            thickness={customThicknessMm}
                                            onThicknessChange={setCustomThicknessMm}
                                            burn={customBurnMm}
                                            onBurnChange={setCustomBurnMm}
                                        />

                                        {/* Workspace Tooltip */}
                                        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-6 shadow-2xl">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{tr("Interactive Grid")}</span>
                                            </div>
                                            <div className="h-4 w-px bg-white/10" />
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest font-mono">{tr("ISO View:")} <span className="text-white">{tr("Active")}</span></span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* INVENTORY SIDEBAR - RIGHT PANEL */}
                                    <div className="w-full lg:w-[480px] h-[400px] lg:h-full flex flex-col bg-black/20 border-t lg:border-t-0 lg:border-l border-white/5 animate-in slide-in-from-right lg:slide-in-from-right slide-in-from-bottom duration-700">
                                        <InventoryArtifactInner 
                                            ids={filteredInventory.map(i => String(i.row))}
                                            onClose={() => {}}
                                            viewMode="embedded"
                                            title={tr("Crate Inventory")}
                                            onItemClick={(item) => {
                                                const iid = String(item.row);
                                                const norm = normalizeInventoryData(item.data);
                                                const totalQty = Number(norm.quantity || 1);
                                                const totalPacked = getTotalPackedForItem(iid, crates);
                                                const inCurrentCrate = currentCratePackedMap.get(iid) || 0;
                                                const avail = Math.max(0, totalQty - (totalPacked - inCurrentCrate));
                                                toggleItem(iid, avail);
                                            }}
                                        />
                                    </div>
                                </div>

            </div>
        )}
    </div>

            {/* FAB - Fixed to bottom of the entire view */}
            {selectedCrate && selectedItemIds.size > 0 && (
                <div className="fixed bottom-12 right-12 z-[100] flex flex-col items-center gap-4">
                    <button
                        onClick={handlePackItems}
                        disabled={isSaving}
                        className={`group relative pointer-events-auto w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl bg-white text-black hover:scale-110 active:scale-95 cursor-pointer ${
                            isSaving ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isSaving ? (
                            <Loader2 size={32} className="animate-spin" />
                        ) : (
                            <Package size={32} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" />
                        )}

                        {/* Count Badge */}
                        <div className="absolute -top-1 -right-1 min-w-[28px] h-[28px] px-1.5 bg-(--main-color) text-black rounded-full border-4 border-black flex items-center justify-center text-[10px] font-black">
                            {Array.from(selectedItemIds).reduce((s, id) => s + (selectedQtys[id] ?? 1), 0)}
                        </div>
                    </button>
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 pointer-events-none drop-shadow-lg">
                        {tr("Confirm Pack")}
                    </span>
                </div>
            )}

            {/* NESTING WIZARD MODAL */}
            {nestingUnit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-black border border-white/10 w-full max-w-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xl font-black uppercase tracking-[0.4em] text-(--main-color)">{tr("Nesting Wizard")}</h3>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Select destination for {nestingUnit.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                            <button onClick={() => setNestingUnit(null)} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto no-scrollbar p-8 bg-black">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {crates.filter(c => (c.status !== 'Packed' || (c.type !== 'cardboard')) && (c.type === 'crate' || c.type === 'pallet') && c.id !== nestingUnit.id).map(dest => (
                                    <button
                                        key={dest.id}
                                        onClick={() => handleNestUnit(nestingUnit.id, dest.id)}
                                        className="flex flex-col items-start gap-4 p-6 bg-white/[0.03] border border-white/5 hover:border-(--main-color) transition-all text-left group"
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <span className="text-[12px] font-mono font-black text-white/40 tracking-widest uppercase">{dest.id.slice(0, 8).toUpperCase()}</span>
                                            <div className={`w-2 h-2 ${dest.status === 'Partial' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-lg font-black text-white tracking-tighter uppercase">{fmtDims(dest)}</span>
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{dest.type} · {el(dest.status)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 border-t border-white/5 bg-white/[0.02] flex items-center justify-center">
                            <p className="text-[10px] font-black text-white/10 uppercase tracking-widest">{tr("Nesting packed boxes maintains their inventory and status within the parent unit")}</p>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
            `}</style>
        </div>
    </div>,
    document.body
    );
};
