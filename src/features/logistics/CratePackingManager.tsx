import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import { 
    inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom, 
    inventoryArtifactConfigAtom, isDummyModeAtom, isPackingFiltersOpenAtom,
    packingVendorFilterAtom, packingSortKeyAtom, packingSortOrderAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, getCrateInternalVolume, getItemPaddedVolume } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
    Package, ChevronRight, Check, Loader2, X, CheckCircle2,
    PackagePlus, ListFilter, Inbox, Video, Maximize2, Minus, Plus, Trash2,
    ArrowUp, ArrowDown, ArrowUpDown, ArrowLeft
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeCrate } from '../../components/CrateVisuals';
import { NFCTagCard } from '../../components/LabelVisuals';

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
    height_cm?: number;
    inventory_ids?: string;
    contents_summary?: string;
    description?: string;
    cost_mxn?: number;
    quantity?: number;
    updated_at?: string;
}

interface GroupedCrateRecord extends CrateRecord {
    groupedCount: number;
    children: CrateRecord[];
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
    const mm = d.getMonth() + 1;
    const yy = String(d.getFullYear()).slice(-2);
    const datePrefix = `${mm}${yy}`;
    
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
    exchangeRate: number;
    onClear: () => void;
    onPack: () => void;
    onUnpack: () => void;
    isSaving: boolean;
}> = ({ crate, selectedItemIds, selectedQtys, allInventory, exchangeRate, onClear, onPack, onUnpack, isSaving }) => {
    const selectedItems = useMemo(() =>
        Array.from(selectedItemIds).flatMap(id => {
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (!inv) return [];
            const norm = normalizeInventoryData(inv.data);
            const calc = calculateCodesAndPrices(norm, exchangeRate, '326');
            const qty = selectedQtys[id] ?? 1;
            const netVol     = itemNetCm3(norm) * qty;
            const paddedVol  = getItemPaddedVolume(inv.data, qty);
            const weight     = (Number(norm.weightKg) || 0) * qty;
            return [{ id, norm, calc, qty, netVol, paddedVol, weight }];
        })
    , [selectedItemIds, selectedQtys, allInventory, exchangeRate]);

    const internalCrateCm3 = getCrateInternalVolume(crate);
    const alreadyPackedMap = useMemo(() => parseInventoryIds(crate.inventory_ids), [crate.inventory_ids]);
    const alreadyPackedPaddedVol = useMemo(() => {
        let v = 0;
        alreadyPackedMap.forEach((qty, id) => {
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (!inv) return;
            v += getItemPaddedVolume(inv.data, qty === -1 ? 1 : qty);
        });
        return v;
    }, [alreadyPackedMap, allInventory]);

    const pendingPaddedVol = selectedItems.reduce((s, i) => s + i.paddedVol, 0);
    const totalUsedPaddedVol = alreadyPackedPaddedVol + pendingPaddedVol;
    const fillPct = internalCrateCm3 > 0 ? clampN(totalUsedPaddedVol / internalCrateCm3 * 100, 0, 100) : 0;
    const barColor = fillBarColor(fillPct);

    const totalQty = selectedItems.reduce((s, i) => s + i.qty, 0);
    const totalWeight = selectedItems.reduce((s, i) => s + i.weight, 0);

    return (
        <div className="w-full bg-black border-b border-white/5 py-4 sm:py-8 px-4 sm:px-12 lg:px-20 sticky top-0 z-50">
            <div className="flex flex-row items-center justify-between gap-4 sm:gap-8">
                {/* Visual Identity */}
                <div className="flex items-center gap-6 sm:gap-10">
                    <div className="shrink-0 relative group scale-90 sm:scale-125 origin-left">
                        <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={80} vibrant />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{crate.type}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusDot(crate.status)}`} />
                        </div>
                        <h2 className="text-2xl sm:text-5xl font-black text-white tracking-tighter leading-none flex items-baseline gap-1">
                            {fmtDims(crate)}
                            <span className="text-[10px] sm:text-[14px] text-white/20 uppercase tracking-widest font-black ml-2">cm</span>
                        </h2>
                        <div className="flex items-center gap-6 mt-4">
                            <button onClick={onClear} className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 hover:text-white transition-colors flex items-center gap-2 group">
                                <X size={12} className="opacity-40 group-hover:opacity-100 group-hover:rotate-90 transition-all" />
                                Release
                            </button>
                            {crate.inventory_ids && (
                                <button onClick={onUnpack} disabled={isSaving} className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 hover:text-amber-400 transition-colors flex items-center gap-2 group">
                                    <Trash2 size={12} className="opacity-40 group-hover:opacity-100 group-hover:-translate-y-0.5 transition-all" />
                                    Unpack
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Performance Matrix */}
                <div className="flex items-center gap-8 sm:gap-20">
                    <div className="flex flex-col items-end">
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl sm:text-6xl font-black tabular-nums tracking-tighter text-(--main-color)">
                                {fillPct.toFixed(0)}
                            </span>
                            <span className="text-lg sm:text-2xl font-black text-(--main-color)/40">%</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-3xl sm:text-6xl font-black text-white tabular-nums tracking-tighter">
                            {totalQty}
                        </span>
                    </div>
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
            className={`flex flex-col items-center gap-6 transition-all duration-500 cursor-pointer p-8 rounded-none min-w-[180px] shrink-0 relative group select-none border-2 ${
                isSelected ? 'bg-black border-(--main-color) shadow-[0_0_50px_rgba(249,115,22,0.1)] z-10 scale-105' : 'bg-black border-white/5 hover:border-white/20'
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
                                style={{ backgroundColor: (vendors as any)[v]?.color || 'var(--main-color)' }}
                                className="px-2 py-0.5 rounded-none text-black text-[8px] font-black uppercase tracking-widest"
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


// ─── Inventory Row (Minimalist & Borderless) ───────────────────────────────────────
const PackingInventoryRow: React.FC<{
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
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#555';
    const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');

    const mediaUrls = useMemo(() => {
        const raw = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = norm.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [norm.mediaUrls, norm.generatedPngUrl]);

    const rawImageUrl = mediaUrls[0] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const itemQuantity = Number(norm.quantity || 1);
    const availableForThisCrate = Math.max(0, itemQuantity - (totalPackedQty - packedQtyInCurrentCrate));
    const fullyPacked = availableForThisCrate === 0;

    const dimsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('×');
    const weightKg = norm.weightKg ? parseFloat(String(norm.weightKg)) : null;

    return (
        <div 
            className={`group relative flex flex-col gap-6 py-10 border-b border-white/5 last:border-0 transition-all duration-700 ${
                isSelected ? 'bg-white/[0.02]' : ''
            }`}
        >
            {/* Unified Visual Matrix Tier */}
            <div className="flex items-start gap-8">
                <div className="relative flex-1 max-w-2xl">
                    <div className="relative aspect-square overflow-hidden bg-black/40 transition-all duration-700 group-hover:shadow-[0_0_60px_rgba(var(--main-color-rgb),0.15)]">
                        {imageUrl ? (
                            <img src={imageUrl} className={`w-full h-full object-cover transition-transform duration-1000 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-10"><OnyxMiniLogo className="w-24 h-24" /></div>
                        )}
                        
                        {/* Integrated Selection Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); !fullyPacked && onToggle(); }}
                            className={`absolute bottom-6 right-6 w-14 h-14 flex items-center justify-center transition-all z-30 ${
                                fullyPacked
                                    ? 'opacity-0 pointer-events-none'
                                    : isSelected
                                        ? 'bg-(--main-color) text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.6)]'
                                        : 'bg-black/60 backdrop-blur-xl border border-white/20 text-white/40 hover:text-white hover:border-white/40'
                            }`}
                        >
                            {isSelected ? <Check size={28} strokeWidth={4} /> : <Plus size={28} />}
                        </button>

                        {/* Top Metadata Layer */}
                        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20">
                            <div className="flex flex-col gap-1">
                                <span 
                                    className="px-3 py-1 text-black text-[10px] font-black uppercase tracking-widest shadow-xl"
                                    style={{ backgroundColor: vendorColor }}
                                >
                                    {calculated.bookBarcode}
                                </span>
                                <span className="px-3 py-1 bg-black/80 backdrop-blur-md text-white/60 text-[9px] font-black uppercase tracking-[0.2em]">
                                    {vendorPrefix || 'UNKNOWN VENDOR'}
                                </span>
                            </div>
                            
                            <div className={`px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 text-[11px] font-black uppercase tracking-widest ${fullyPacked ? 'text-white/20' : 'text-emerald-400'}`}>
                                {availableForThisCrate}/{itemQuantity}
                            </div>
                        </div>

                        {/* Bottom Information Matrix Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-8 bg-linear-to-t from-black/95 via-black/80 to-transparent z-10">
                            <div className="flex flex-col gap-4">
                                <h3 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tighter leading-none max-w-[80%]">
                                    {(norm.shape || '') + ' ' + (norm.shortDescription || norm.description || 'Untitled Item')}
                                </h3>
                                
                                <div className="flex flex-wrap items-center gap-x-10 gap-y-2 text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-40 text-emerald-500/50">SIZE:</span>
                                        <span className="text-white/60">{dimsCm ? `${dimsCm} CM` : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-40 text-emerald-500/50">WGT:</span>
                                        <span className="text-white/60">{weightKg ? `${weightKg} KG` : 'N/A'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop Quantity Controls */}
                <div className="hidden sm:flex flex-col items-end gap-6 pt-10 shrink-0">
                     {isSelected && !fullyPacked && (
                        <div className="flex flex-col items-center gap-4 bg-black/40 backdrop-blur-xl p-4 border border-white/5">
                            <button
                                onClick={e => { e.stopPropagation(); onQtyChange(Math.max(1, selectedQty - 1)); }}
                                className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-white transition-all border border-white/10"
                            >
                                <Minus size={24} />
                            </button>
                            <span className="text-3xl font-black text-white font-mono w-16 text-center">{selectedQty}</span>
                            <button
                                onClick={e => { e.stopPropagation(); onQtyChange(Math.min(availableForThisCrate, selectedQty + 1)); }}
                                className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-(--main-color) transition-all border border-white/10"
                            >
                                <Plus size={24} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Expansion Logic */}
            <div className="flex flex-col gap-8">
                <button
                    onClick={e => { e.stopPropagation(); onToggleExpand(); }}
                    className={`w-14 h-14 transition-all flex items-center justify-center ${
                        isExpanded ? 'text-(--main-color)' : 'text-white/10 hover:text-white'
                    }`}
                >
                    <Maximize2 size={28} className={`transition-transform duration-700 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                    <div className="w-full max-w-3xl animate-in fade-in duration-700 pt-4">
                        <div className="relative group/label transform-gpu transition-all duration-700">
                            <div className="absolute inset-0 bg-(--main-color)/5 blur-[100px] opacity-40" />
                            <div className="drop-shadow-[0_60px_120px_rgba(0,0,0,0.9)]">
                                <NFCTagCard item={{ normData: norm, codes: calculated }} />
                            </div>
                        </div>
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
    const [vendorFilter, setVendorFilter] = useAtom(packingVendorFilterAtom);
    const [sortBy, setSortKey] = useAtom(packingSortKeyAtom);
    const [sortOrder, setSortOrder] = useAtom(packingSortOrderAtom);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    // Map of itemId -> qty user wants to pack into this crate
    const [selectedQtys, setSelectedQtys] = useState<Record<string, number>>({});
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isDashboardCollapsed, setIsDashboardCollapsed] = useState(false);

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

    const activeCrates = useMemo(() => crates.filter(c => c.status !== 'Packed' && (c.type === 'crate' || c.type === 'pallet' || c.type === 'cardboard')), [crates]);

    const groupedAvailableCrates = useMemo(() => {
        const individualPartials: any[] = [];
        const emptyGroups: Record<string, any> = {};
        
        for (const c of activeCrates) {
            if (c.status === 'Partial') {
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
            const vendorMatch = vendorFilter === 'All' || vendorId === vendorFilter;
            if (!vendorMatch) return false;
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

        // Sorting logic
        items.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

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
        } catch (err: any) {
            toast.error(err.message || 'Unpack failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const crateCm3 = useMemo(() => {
        if (!selectedCrate) return 0;
        return getCrateInternalVolume(selectedCrate);
    }, [selectedCrate]);


    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-black/95">
            {/* ─── Top Panel: Floating HUD / Unit Picker ─── */}
            <div className={`flex flex-col min-h-0 ${selectedCrate ? 'shrink-0' : 'flex-1'}`}>
                {selectedCrate ? (
                    <ActiveCrateHUD
                        crate={selectedCrate}
                        selectedItemIds={selectedItemIds}
                        selectedQtys={selectedQtys}
                        allInventory={allInventory}
                        exchangeRate={exchangeRate}
                        onClear={() => handleSelectCrate(null)}
                        onPack={handlePackItems}
                        onUnpack={handleUnpackAll}
                        isSaving={isSaving}
                    />
                ) : (
                    <div className="flex-1 flex flex-col bg-black min-h-0">
                        {/* Header Section */}
                        <div className="px-6 pt-12 pb-10 sm:px-10 shrink-0">
                            <div className="max-w-7xl mx-auto flex items-center justify-between">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-[14px] font-black uppercase tracking-[0.6em] text-(--main-color) italic">
                                        Available {activeGroup ? activeGroup.type === 'pallet' ? 'Pallets' : 'Crates' : 'Storage Units'}
                                    </h3>
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] font-mono">
                                        {activeCrates.length} Precision Units Ready for Assignment
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

                        {/* Free-Floating Grid Section - FULL SCROLLABILITY */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-32 sm:px-10">
                            <div className="max-w-7xl mx-auto">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
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
                                            return (
                                                <button
                                                    key={c.id}
                                                    onClick={() => handleSelectCrate(c.id)}
                                                    className={`flex flex-col gap-6 transition-all cursor-pointer relative group p-8 border-2 ${isSelected ? 'bg-black border-(--main-color) shadow-[0_0_60px_rgba(249,115,22,0.2)] scale-[1.05] z-10' : 'bg-black border-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className={`text-[14px] font-mono font-black leading-none tracking-[0.2em] ${isSelected ? 'text-(--main-color)' : 'text-white/40'}`}>
                                                            {c.id.slice(0, 8).toUpperCase()}
                                                        </span>
                                                        <div className={`w-3 h-3 rounded-none ${c.status === 'Partial' ? 'bg-amber-400' : 'bg-emerald-400'} ${isSelected ? 'shadow-[0_0_15px_currentColor]' : ''}`} />
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
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Main Area: Inventory List ── */}
            <div className={`flex-1 flex flex-col min-w-0 min-h-0 relative ${!selectedCrate ? 'hidden' : ''}`}>
                {/* INDUSTRIAL CONFIG DRAWER - Stick to top of list area */}
                <div className={`shrink-0 z-50 overflow-hidden transition-all duration-700 bg-black border-b border-white/10 ${isFiltersOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="max-w-7xl mx-auto px-8 py-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div className="flex flex-col gap-6">
                                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Source Vendor Identity</span>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => setVendorFilter(null)}
                                        className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-2 ${
                                            !vendorFilter ? 'bg-white text-black border-white' : 'text-white/30 hover:text-white hover:border-white/30 border-white/10'
                                        }`}
                                    >All Vendors</button>
                                    {vendorOptions.filter(v => v !== 'All').map(v => {
                                        const vColor = vendors[v as keyof typeof vendors]?.color || 'white';
                                        const isActive = vendorFilter === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => setVendorFilter(v)}
                                                style={{ 
                                                    backgroundColor: isActive ? vColor : 'transparent',
                                                    borderColor: isActive ? vColor : 'rgba(255,255,255,0.1)'
                                                }}
                                                className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-2 ${
                                                    isActive ? 'text-black shadow-[0_0_30px_rgba(255,255,255,0.1)]' : 'text-white/30 hover:text-white hover:border-white/30'
                                                }`}
                                            >
                                                {v}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-col gap-6">
                                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Sort Parameters</span>
                                <div className="flex gap-4">
                                    {(['Date', 'Status', 'Vendor', '#'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => {
                                                if (sortBy === s) {
                                                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortKey(s);
                                                }
                                            }}
                                            className={`flex-1 py-3 border-2 text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2 ${
                                                sortBy === s ? 'bg-white text-black border-white' : 'bg-transparent text-white/20 border-white/5 hover:border-white/20'
                                            }`}
                                        >
                                            {s}
                                            {sortBy === s && (
                                                <div className="flex flex-col -space-y-1">
                                                    <ChevronRight size={8} className={`-rotate-90 ${sortOrder === 'asc' ? 'text-black' : 'text-black/20'}`} />
                                                    <ChevronRight size={8} className={`rotate-90 ${sortOrder === 'desc' ? 'text-black' : 'text-black/20'}`} />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                            </div>
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
                        ) : filteredInventory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 gap-4">
                                <ListFilter size={48} className="text-white/10" strokeWidth={0.5} />
                                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">No items match current filters</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between mb-12 px-6">
                                    <div className="flex items-center gap-10">
                                        <div className="flex flex-col gap-1">
                                            <h4 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter leading-none">
                                                {filteredInventory.length} Items
                                            </h4>
                                        </div>
                                    </div>
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

                                <div className="flex flex-col gap-2 pb-48">
                                    {filteredInventory.map(item => {
                                        const iid = String(item.row);
                                        const inCurrentCrate = (() => { const q = currentCratePackedMap.get(iid); return q === -1 ? 1 : (q ?? 0); })();
                                        const totalPacked = getTotalPackedForItem(iid, crates);
                                        const isSelected = selectedItemIds.has(iid);
                                        return (
                                            <PackingInventoryRow
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

                {/* FAB */}
                {selectedCrate && selectedItemIds.size > 0 && (
                    <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none px-6 z-50">
                        <button
                            onClick={handlePackItems}
                            disabled={isSaving}
                            className="pointer-events-auto flex items-center gap-6 px-10 py-5 rounded-[40px] bg-white text-black shadow-[0_20px_50px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all duration-500 group"
                        >
                            <div className="flex flex-col items-start">
                                <span className="text-[14px] font-black uppercase tracking-tighter leading-none">
                                    {Array.from(selectedItemIds).reduce((s, id) => s + (selectedQtys[id] ?? 1), 0)} Units
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-black/40 mt-1">
                                    {selectedItemIds.size} Unique SKU(s)
                                </span>
                            </div>
                            <div className="w-px h-8 bg-black/10" />
                            <div className="flex items-center gap-3">
                                <span className="text-[12px] font-black uppercase tracking-[0.2em]">Confirm Pack</span>
                                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center transition-transform group-hover:rotate-12">
                                    {isSaving ? <Loader2 size={14} className="animate-spin text-white" /> : <Package size={16} className="text-white" />}
                                </div>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
            `}</style>
        </div>
    );
};
