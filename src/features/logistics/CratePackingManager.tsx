import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import { 
    inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom, 
    inventoryArtifactConfigAtom, isDummyModeAtom, isPackingFiltersOpenAtom,
    packingVendorFilterAtom, packingSortKeyAtom, packingSortOrderAtom,
    crateSeparatorsAtom, crateItemPositionsAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, getCrateInternalVolume, getItemPaddedVolume } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
    Package, ChevronRight, Check, Loader2, X, CheckCircle2,
    PackagePlus, ListFilter, Inbox, Video, Maximize2, Minus, Plus, Trash2,
    ArrowUp, ArrowDown, ArrowUpDown, ArrowLeft, Info
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeCrate } from '../../components/CrateVisuals';
import { NFCTagCard } from '../../components/LabelVisuals';
import { CratePackingWorkspace } from './CratePackingWorkspace';

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
interface CrateRecord {
    id: string;
    type?: string;
    status: 'Empty' | 'Packed' | 'Partial';
    length_cm?: number;
    width_cm?: number;
    weight_kg?: number;
    brute_weight_kg?: number;
    inventory_ids?: string;
    contents_summary?: string;
    description?: string;
    cost_mxn?: number;
    quantity?: number;
    updated_at?: string;
    parent_id?: string | null;
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
        c.inventory_ids.split(',').filter(Boolean).forEach(entry => {
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
    

// ─── ActiveCrateHUD (Floating Top Panel) ─────────────────────────────────────────
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
}> = ({ 
    crate, selectedItemIds, selectedQtys, allInventory, nestedUnits, 
    exchangeRate, onClear, onPack, onUnpack, onUnnest, onDelete, 
    isSaving, itemCount, crates, selectedItemsWithPos, onUpdatePosition,
    separators, onAddSeparator, onRemoveSeparator, onUpdateSeparator
}) => {
    const selectedItems = useMemo(() =>
        Array.from(selectedItemIds).flatMap(id => {
            const inv = allInventory.find((i: any) => String(i.row) === id);
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
            const inv = allInventory.find((i: any) => String(i.row) === id);
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

    return (
        <div className="sticky top-20 sm:top-24 z-[60] w-full bg-black/60 backdrop-blur-3xl border-b border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="w-full max-w-screen-2xl mx-auto flex items-center justify-between gap-6 px-6 py-4 sm:px-12 sm:py-6">
                {/* Left: Crate Info */}
                <div className="flex items-center gap-6 min-w-0">
                    <div className="shrink-0 scale-75 sm:scale-100 origin-left">
                        <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={50} vibrant />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-3 mt-1.5 overflow-x-auto no-scrollbar">
                            {(() => {
                                const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(crate, crates, allInventory);
                                if (!date && !sequence) return (
                                    <span className="text-[10px] font-mono font-black text-white/40 uppercase tracking-widest">{crate.id.slice(0, 8).toUpperCase()}</span>
                                );
                                return (
                                    <div className="flex items-center">
                                        {date && (
                                            <div className="bg-white/10 px-2 py-1">
                                                <span className="text-[14px] font-black text-white tracking-[0.1em] leading-none block">{date}</span>
                                            </div>
                                        )}
                                        {vList.map((v) => (
                                            <div key={v} className="px-2 py-1 bg-(--main-color)">
                                                <span className="text-[14px] font-black tracking-[0.1em] leading-none block text-black">{v}</span>
                                            </div>
                                        ))}
                                        {sequence && (
                                            <div className="px-3 py-1 bg-white/5">
                                                <span className="text-[14px] font-black tracking-[0.1em] leading-none block text-white/90">{sequence}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            <span className="hidden sm:inline-block px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-black uppercase tracking-[0.2em] text-white/40">
                                {crate.type}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 overflow-x-auto no-scrollbar">
                            <button 
                                onClick={onClear} 
                                className="shrink-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all flex items-center gap-2 group shadow-lg"
                            >
                                <X size={12} className="group-hover:rotate-90 transition-transform" />
                                Release
                            </button>
                            {crate.inventory_ids && (
                                <button 
                                    onClick={onUnpack} 
                                    disabled={isSaving} 
                                    className="shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-all flex items-center gap-2 group shadow-lg"
                                >
                                    <Trash2 size={12} className="group-hover:-translate-y-0.5 transition-transform" />
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {/* Center: Inventory Meta (Added to HUD) */}
                <div className="hidden lg:flex items-center gap-12">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">Staging Sequence</span>
                        <span className="text-xl font-black text-white uppercase tracking-tighter leading-none italic">
                            {itemCount} <span className="text-(--main-color) ml-1">Items</span>
                        </span>
                    </div>

                    {totalNested > 0 && (
                        <div className="flex items-center gap-4 border-l border-white/5 pl-12">
                            <div className="flex flex-col items-start gap-1">
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">Nested Units</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-black text-blue-400 uppercase tracking-tighter leading-none italic">{totalNested}</span>
                                    <div className="flex -space-x-2">
                                        {nestedUnits.map(u => (
                                            <button 
                                                key={u.id} 
                                                onClick={() => onUnnest(u.id)}
                                                title={`Unnest ${u.id.slice(0, 8).toUpperCase()}`}
                                                className="w-6 h-6 rounded-full bg-blue-500 border-2 border-black flex items-center justify-center text-[8px] font-black hover:scale-110 transition-transform cursor-pointer"
                                            >
                                                📦
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Metrics */}
                <div className="flex items-center gap-8 sm:gap-16 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5">Brute Weight</span>
                        <div className="flex items-center gap-1.5">
                            <input 
                                type="number"
                                step="0.1"
                                defaultValue={crate.brute_weight_kg || ''}
                                placeholder="0.0"
                                onBlur={async (e) => {
                                    const val = parseFloat(e.target.value);
                                    if (isNaN(val)) return;
                                    const tid = toast.loading('Syncing weight...');
                                    try {
                                        // brute_weight_kg does NOT exist as a Supabase column.
                                        const db = (window as any).onyxDb;
                                        if (db) {
                                            const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                                            if (lDoc) await lDoc.patch({ brute_weight_kg: val, updated_at: new Date().toISOString() });
                                        }
                                        const summary = (crate as any).contents_summary || '';
                                        const cleaned = summary.replace(/\[BW:\d+\.?\d*\]/g, '').trim();
                                        const newSummary = `${cleaned} [BW:${val}]`.trim();
                                        await supabase.from('logistics').update({ contents_summary: newSummary, updated_at: new Date().toISOString() }).eq('id', crate.id);
                                        toast.success('Recorded', { id: tid });
                                    } catch (err) {
                                        toast.error('Sync failed', { id: tid });
                                    }
                                }}
                                className="w-14 bg-white/5 border border-white/10 px-2 py-1 text-xs font-mono text-(--main-color) focus:outline-none focus:border-(--main-color)/50 transition text-right"
                            />
                            <span className="text-[9px] font-black text-white/20">KG</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-0.5">Volumetric Fill</span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-xl sm:text-3xl font-black tabular-nums tracking-tighter ${fillPct > 90 ? 'text-rose-500' : 'text-(--main-color)'}`}>
                                {fillPct.toFixed(0)}
                            </span>
                            <span className="text-[10px] font-black text-white/20">%</span>
                        </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-0.5">Units Packed</span>
                        <span className="text-xl sm:text-3xl font-black text-white tabular-nums tracking-tighter">
                            {totalQty}
                        </span>
                    </div>
                </div>
            </div>

                    {/* Separator Controls */}
                    <div className="h-8 w-px bg-white/10" />
                    <div className="flex flex-col gap-1 min-w-[120px]">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Active Separators</span>
                        <div className="flex flex-wrap gap-2">
                            {separators.map(sep => (
                                <div key={sep.id} className="group/sep relative">
                                    <input 
                                        type="number"
                                        value={sep.y}
                                        onChange={(e) => onUpdateSeparator(sep.id, parseInt(e.target.value))}
                                        className="w-10 bg-white/10 border border-white/5 px-1 py-0.5 text-[10px] font-mono text-white rounded"
                                    />
                                    <button 
                                        onClick={() => onRemoveSeparator(sep.id)}
                                        className="absolute -top-2 -right-2 bg-rose-500 text-white p-0.5 rounded-full opacity-0 group-hover/sep:opacity-100 transition-opacity"
                                    >
                                        <X size={8} />
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={onAddSeparator}
                                className="p-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded flex items-center justify-center text-white/40 hover:text-white"
                                title="Add Separator"
                            >
                                <Plus size={12} />
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
            <div className="text-center">
                <p className={`text-lg font-black uppercase tracking-[0.2em] font-mono mb-2 transition-colors ${isSelected ? 'text-(--main-color)' : 'text-white/80'}`}>
                    {crate.width_cm}×{crate.length_cm}×{crate.height_cm}
                </p>
                <div className="flex items-center justify-center gap-3">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">
                        {isPallet ? 'Pallet' : (crate.type === 'cardboard' || (crate.width_cm == 38 && crate.length_cm == 41 && crate.height_cm == 38)) ? 'Box' : 'Crate'}
                    </span>
                    {partialCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-none bg-amber-400" />
                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Active</span>
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
                            <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">PACKED</span>
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
                    title="Label Preview"
                >
                    <Info size={14} />
                </button>
            </div>

            {/* Metadata Section */}
            <div className="p-5 flex flex-col gap-3">
                <div className="min-h-[40px]">
                    <h3 className="text-[11px] font-black text-white uppercase tracking-tight leading-tight line-clamp-2">
                        {(norm.shape || '') + ' ' + (norm.shortDescription || norm.description || 'Untitled')}
                    </h3>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="block text-[7px] font-black text-white/20 uppercase tracking-widest mb-0.5">DIMENSIONS</span>
                        <span className="block text-[9px] font-mono font-black text-white/70 truncate">{dimsCm || '—'} CM</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="block text-[7px] font-black text-white/20 uppercase tracking-widest mb-0.5">AVAILABILITY</span>
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
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mt-0.5">UNIT</span>
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
        toast.success(`Separator added at 40cm`);
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
            setSelectedItemIds(ids);
            setSelectedQtys(qtys);
        } else {
            setSelectedItemIds(new Set());
            setSelectedQtys({});
        }
    }, [crates]);

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
                    valA = a.data?.updated_at || a.data?.createdAt || '';
                    valB = b.data?.updated_at || b.data?.createdAt || '';
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
                await supabase.from('inventory').update({ crate_id: selectedCrate.id }).in('id', addedIds);
                if (db) {
                    for (const id of addedIds) {
                        try { 
                            const lDoc = await db.inventory.findOne({ selector: { id } }).exec(); 
                            if (lDoc) await lDoc.patch({ crate_id: selectedCrate.id }); 
                        } catch (_) {}
                    }
                }
            }

            // Mark removals
            if (removedIds.length > 0) {
                await supabase.from('inventory').update({ crate_id: null }).in('id', removedIds);
                if (db) {
                    for (const id of removedIds) {
                        try { 
                            const lDoc = await db.inventory.findOne({ selector: { id } }).exec(); 
                            if (lDoc) await lDoc.patch({ crate_id: null }); 
                        } catch (_) {}
                    }
                }
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
                toast.success("Crate unpacked (Demo Mode)", { id: tid, icon: '🧪' });
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
            await supabase.from('inventory').update({ crate_id: null }).in('id', itemIds);
            if (db) {
                for (const id of itemIds) {
                    try {
                        const lDoc = await db.inventory.findOne({ selector: { id } }).exec();
                        if (lDoc) await lDoc.patch({ crate_id: null });
                    } catch (_) {}
                }
            }

            toast.success("Crate unpacked", { id: tid });
            setSelectedItemIds(new Set());
            setSelectedQtys({});
            setCratesVersion(v => v + 1);
        } finally {
            setIsSaving(false);
        }
    };

    const handleNestUnit = async (sourceId: string, parentId: string) => {
        setIsSaving(true);
        const tid = toast.loading(`Nesting unit...`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success("Unit nested (Demo Mode)", { id: tid, icon: '🧪' });
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
            toast.success("Unit successfully nested", { id: tid });
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
        const tid = toast.loading(`Unnesting unit...`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success("Unit unnested (Demo Mode)", { id: tid, icon: '🧪' });
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
            toast.success("Unit successfully unnested", { id: tid });
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
                toast.success("Crate deleted (Demo Mode)", { id: tid, icon: '🧪' });
                handleSelectCrate(null);
                setCratesVersion(v => v + 1);
                setIsSaving(false);
                return;
            }

            // 1. If it has items, release them first (update inventory crate_id to null)
            const currentIds = parseInventoryIds(selectedCrate.inventory_ids);
            if (currentIds.size > 0) {
                const itemIds = Array.from(currentIds.keys());
                await supabase.from('inventory').update({ crate_id: null }).in('id', itemIds);
                if (db) {
                    for (const id of itemIds) {
                        try {
                            const lDoc = await db.inventory.findOne({ selector: { id } }).exec();
                            if (lDoc) await lDoc.patch({ crate_id: null });
                        } catch (_) {}
                    }
                }
            }

            // 2. Delete from Supabase
            const { error: delErr } = await supabase.from('logistics').delete().eq('id', selectedCrate.id);
            if (delErr) throw delErr;

            // 3. Delete from RxDB
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.remove();
            }

            toast.success("Crate permanently deleted", { id: tid });
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
            const inv = allInventory.find(i => String(i.row) === id);
            return {
                item: inv as InventoryItem,
                position: itemPositions[id] || { x: 0, y: 0, z: 0, rotation: 0, isFlipped: false }
            };
        }).filter(entry => entry.item);
    }, [selectedItemIds, allInventory, itemPositions]);

    return (
        <div className="flex-1 flex flex-col relative m-0 p-0 overflow-hidden bg-black select-none">
            {/* ─── Top Panel: HUD (Sticky when active) ─── */}
            {/* HUD is now rendered inside the workspace area for better focus */}

            {/* ─── Unit Picker (Full screen if no crate selected) ─── */}
            {!selectedCrate && (
                <div className="flex-1 flex flex-col bg-white/[0.01] backdrop-blur-3xl min-h-0 border-x border-white/5 relative overflow-hidden">
                    {/* Background Decorative Element */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-(--main-color)/5 blur-[120px] rounded-full -translate-y-1/2 pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full translate-x-1/4 translate-y-1/4 pointer-events-none" />
                    
                    {/* Header Section */}
                    <div className="px-6 pt-12 pb-10 sm:px-10 shrink-0">
                        <div className="max-w-7xl mx-auto flex items-center justify-between">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-[14px] font-black uppercase tracking-[0.6em] text-(--main-color) italic">
                                    {activeGroup?.isNestable ? 'Packed Boxes' : `Available ${activeGroup ? activeGroup.type === 'pallet' ? 'Pallets' : 'Crates' : 'Storage Units'}`}
                                </h3>
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] font-mono">
                                    {activeCrates.length} {activeGroup?.isNestable ? 'Ready for Nesting' : 'Precision Units Ready for Assignment'}
                                </p>
                            </div>
                            {activeGroup && (
                                <button
                                    onClick={() => setActiveGroupKey(null)}
                                    className="text-[10px] font-black uppercase tracking-[0.2em] text-white hover:text-black px-8 py-3 bg-white/5 hover:bg-(--main-color) border border-white/10 hover:border-(--main-color) transition-all cursor-pointer flex items-center gap-3 group rounded-none font-mono"
                                >
                                    <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                                    Root Catalog
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Free-Floating Grid Section - Responsive Scrollable Mobile View */}
                    <div className="px-6 pb-32 sm:px-10">
                        <div className="w-full">
                            <div className="flex flex-nowrap overflow-x-auto sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 sm:gap-10 no-scrollbar pb-8 sm:pb-0">
                                {activeCrates.length === 0 ? (
                                    <div className="flex flex-col items-center gap-6 py-24 opacity-20 col-span-full justify-center">
                                        <Inbox size={48} strokeWidth={0.5} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.5em] font-mono">No Available Logistics Hardware</span>
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
                                                    className={`w-full flex flex-col gap-6 transition-all cursor-pointer relative p-8 border-2 ${isSelected ? 'bg-black border-(--main-color) shadow-[0_0_60px_rgba(249,115,22,0.2)] scale-[1.05] z-10' : 'bg-black border-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className={`text-[14px] font-mono font-black leading-none tracking-[0.2em] ${isSelected ? 'text-(--main-color)' : 'text-white/40'}`}>
                                                            {c.id.slice(0, 8).toUpperCase()}
                                                        </span>
                                                        <div className={`w-3 h-3 rounded-none ${c.status === 'Partial' ? 'bg-amber-400' : isPacked ? 'bg-rose-400' : 'bg-emerald-400'} ${isSelected ? 'shadow-[0_0_15px_currentColor]' : ''}`} />
                                                    </div>
                                                    <div className="flex flex-col gap-2 text-left">
                                                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isSelected ? 'text-white' : 'text-white/20'}`}>
                                                            {c.status}
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
                                                        Nest
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
                <div className={`sticky top-20 sm:top-24 z-[90] overflow-hidden transition-all duration-700 bg-black/40 backdrop-blur-3xl border-b border-white/10 ${isFiltersOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
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
                                >ALL VENDORS</button>
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
                                        Initialize Packing Sequence
                                    </p>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">
                                        Select a destination unit to begin item assignment
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col w-full h-full">
                                {/* 3D WORKSPACE VIEW */}
                                <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center relative p-12">
                                    <div className="absolute top-12 left-12 flex flex-col gap-2">
                                        <h2 className="text-2xl font-black text-white/80 uppercase tracking-tighter italic leading-none">Logistics <span className="text-(--main-color)">Digital Twin</span></h2>
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] font-mono">Live 1:1 Volumetric Simulation</p>
                                    </div>
                                    
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
                                    />
                                    
                                    <CratePackingWorkspace 
                                        width={selectedCrate.width_cm || 60}
                                        length={selectedCrate.length_cm || 60}
                                        height={selectedCrate.height_cm || 60}
                                        items={itemsWithPositions}
                                        separators={separators}
                                        onUpdatePosition={(id, pos) => setItemPositions(prev => ({ ...prev, [id]: pos }))}
                                        activeItemId={null}
                                    />

                                    {/* Workspace Tooltip */}
                                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-6 shadow-2xl">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Interactive Grid</span>
                                        </div>
                                        <div className="h-4 w-px bg-white/10" />
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest font-mono">ISO View: <span className="text-white">Active</span></span>
                                        </div>
                                    </div>
                                </div>

                                {/* INVENTORY LISTING */}
                                {filteredInventory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 gap-4">
                                        <ListFilter size={48} className="text-white/10" strokeWidth={0.5} />
                                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">No items match current filters</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4 w-full border-t border-white/5 bg-white/[0.01]">
                                <div className="flex items-center justify-end mb-8 px-6 pt-8">
                                    <button
                                        onClick={() => {
                                            const newIds = new Set<string>();
                                            const newQtys: Record<string, number> = {};
                                            filteredInventory.forEach(i => {
                                                const iid = String(i.row);
                                                const norm = normalizeInventoryData(i.data);
                                                const totalQty = Number(norm.quantity || 1);
                                                const packed = getTotalPackedForItem(iid, crates);
                                                const rem = Math.max(0, totalQty - packed);
                                                if (rem > 0) { newIds.add(iid); newQtys[iid] = rem; }
                                            });
                                            setSelectedItemIds(newIds);
                                            setSelectedQtys(newQtys);
                                        }}
                                        className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 hover:text-white transition-colors cursor-pointer"
                                    >
                                        Select All
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-48 px-6">
                                    {filteredInventory.map(item => {
                                        const iid = String(item.row);
                                        const inCurrentCrate = (() => { const q = currentCratePackedMap.get(iid); return q === -1 ? 1 : (q ?? 0); })();
                                        const totalPacked = getTotalPackedForItem(iid, crates);
                                        const isSelected = selectedItemIds.has(iid);
                                        return (
                                            <PackingInventoryCard
                                                key={item.row}
                                                item={item as InventoryItem}
                                                isSelected={isSelected}
                                                packedQtyInCurrentCrate={inCurrentCrate}
                                                totalPackedQty={totalPacked}
                                                selectedQty={selectedQtys[iid] ?? 1}
                                                onToggle={() => {
                                                    const norm = normalizeInventoryData(item.data);
                                                    const totalQty = Number(norm.quantity || 1);
                                                    const avail = Math.max(0, totalQty - (totalPacked - inCurrentCrate));
                                                    toggleItem(iid, avail);
                                                }}
                                                onQtyChange={qty => setSelectedQtys(q => ({ ...q, [iid]: qty }))}
                                                isExpanded={expandedIds.has(iid)}
                                                onToggleExpand={() => toggleExpand(iid)}
                                                exchangeRate={exchangeRate}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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
                        Confirm Pack
                    </span>
                </div>
            )}

            {/* NESTING WIZARD MODAL */}
            {nestingUnit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-black border border-white/10 w-full max-w-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xl font-black uppercase tracking-[0.4em] text-(--main-color)">Nesting Wizard</h3>
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
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{dest.type} · {dest.status}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 border-t border-white/5 bg-white/[0.02] flex items-center justify-center">
                            <p className="text-[10px] font-black text-white/10 uppercase tracking-widest">Nesting packed boxes maintains their inventory and status within the parent unit</p>
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
    );
};
