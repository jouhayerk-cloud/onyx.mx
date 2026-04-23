import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import { 
    inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom, 
    inventoryArtifactConfigAtom, isDummyModeAtom, isPackingFiltersOpenAtom 
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, getCrateInternalVolume, getItemPaddedVolume } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
    Package, ChevronRight, Check, Loader2, X,
    PackagePlus, ListFilter, Inbox, Video, Maximize2, Minus, Plus, Trash2,
    ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeCrate } from '../../components/CrateVisuals';

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
        sequence: String(index >= 0 ? index + 1 : 1)
    };
}

// ─── ActiveCrateSidebar ───────────────────────────────────────────────────────
// ─── ActiveCrateDashboard (Top Panel) ─────────────────────────────────────────
const ActiveCrateDashboard: React.FC<{
    crate: CrateRecord;
    selectedItemIds: Set<string>;
    selectedQtys: Record<string, number>;
    allInventory: any[];
    exchangeRate: number;
    onClear: () => void;
    onClearStaged: () => void;
    onPack: () => void;
    onUnpack: () => void;
    isSaving: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}> = ({ crate, selectedItemIds, selectedQtys, allInventory, exchangeRate, onClear, onClearStaged, onPack, onUnpack, isSaving, isCollapsed, onToggleCollapse }) => {
    const selectedItems = useMemo(() =>
        Array.from(selectedItemIds).flatMap(id => {
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (!inv) return [];
            const norm = normalizeInventoryData(inv.data);
            const calc = calculateCodesAndPrices(norm, exchangeRate, '326');
            const qty = selectedQtys[id] ?? 1;
            const vendorPrefix = String(norm.itemId || inv.data?.vendor_id || '').split('-')[0] || '';
            const tagColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#555';
            const netVol     = itemNetCm3(norm) * qty;
            const paddedVol  = getItemPaddedVolume(inv.data, qty);
            const paddingVol = paddedVol - netVol;
            const weight     = (Number(norm.weightKg) || 0) * qty;
            return [{ id, norm, calc, qty, netVol, paddedVol, paddingVol, weight, tagColor, vendorPrefix }];
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

    const pendingNetVol     = selectedItems.reduce((s, i) => s + i.netVol, 0);
    const pendingPaddingVol = selectedItems.reduce((s, i) => s + i.paddingVol, 0);
    const pendingPaddedVol  = pendingNetVol + pendingPaddingVol;

    const totalUsedPaddedVol = alreadyPackedPaddedVol + pendingPaddedVol;
    const fillPct    = internalCrateCm3 > 0 ? clampN(totalUsedPaddedVol / internalCrateCm3 * 100, 0, 100) : 0;
    const netFillPct = internalCrateCm3 > 0 ? clampN((alreadyPackedPaddedVol + pendingNetVol) / internalCrateCm3 * 100, 0, 100) : 0;
    const padFillPct = Math.max(0, fillPct - netFillPct);
    const barColor   = fillBarColor(fillPct);

    const totalQty    = selectedItems.reduce((s, i) => s + i.qty, 0);
    const totalWeight = selectedItems.reduce((s, i) => s + i.weight, 0);

    return (
        <div className={`w-full transition-all duration-700 overflow-hidden ${isCollapsed ? 'h-[60px]' : 'h-[140px] sm:h-[120px]'} bg-transparent backdrop-blur-2xl border-b border-white/5`}>
            <div className="flex flex-col lg:flex-row h-full">
                {/* Visual Section */}
                <div className={`flex items-center gap-8 px-8 transition-all ${isCollapsed ? 'w-full lg:w-[280px]' : 'w-full lg:w-[400px]'}`}>
                    <div className="shrink-0 scale-75 lg:scale-90 opacity-60">
                        <LargeCrateWireframe w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={isCollapsed ? 60 : 110} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 opacity-20">
                            <span className="text-[7px] font-mono uppercase tracking-[0.3em]">{crate.id.toUpperCase()}</span>
                        </div>
                        <p className="text-[28px] lg:text-[32px] font-black text-white uppercase tracking-tighter truncate leading-none mb-2">
                            {fmtDims(crate)}<span className="text-white/10 text-[9px] font-black uppercase ml-1 tracking-widest">cm</span>
                        </p>
                        {!isCollapsed && (
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 pr-3 border-r border-white/5">
                                    <div className={`w-1 h-1 rounded-full ${statusDot(crate.status)}`} />
                                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${statusText(crate.status)}`}>{crate.status}</span>
                                </div>
                                <button 
                                    onClick={onClear} 
                                    className="text-[8px] font-black uppercase tracking-[0.2em] text-white/10 hover:text-rose-400 transition-all cursor-pointer"
                                >
                                    Release Unit
                                </button>
                             </div>
                        )}
                    </div>
                </div>

                {/* Data Matrix Section (High Density) */}
                <div className="flex-1 flex items-center justify-between px-10 relative min-w-0">
                    <div className="flex items-center gap-12">
                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-white/10 leading-none">Volumetric Fill</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[32px] font-black tabular-nums leading-none tracking-tighter" style={{ color: barColor }}>
                                    {fillPct.toFixed(0)}<span className="text-[10px] ml-0.5 opacity-30">%</span>
                                </span>
                                <span className="text-[9px] font-mono text-white/10 tracking-widest">{(totalUsedPaddedVol/1000).toFixed(0)} / {(internalCrateCm3/1000).toFixed(0)}L</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-white/10 leading-none">Staged Units</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[32px] font-black text-white leading-none tracking-tighter">{totalQty}</span>
                                <span className="text-[9px] font-mono text-white/10 tracking-widest">{selectedItemIds.size} SKUs</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-white/10 leading-none">Total Weight</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[32px] font-black text-white leading-none tracking-tighter">{totalWeight.toFixed(0)}</span>
                                <span className="text-[9px] text-white/10 font-mono tracking-widest">kg total</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onUnpack}
                            disabled={!crate.inventory_ids || crate.inventory_ids.length === 0 || isSaving}
                            className={`flex items-center gap-2 px-4 h-[40px] rounded-lg text-[8px] font-black uppercase tracking-[0.2em] transition-all border ${(!crate.inventory_ids || crate.inventory_ids.length === 0 || isSaving) ? 'opacity-10 cursor-not-allowed' : 'text-white/20 hover:text-rose-400 border-white/5 hover:border-rose-400/20 bg-white/2 cursor-pointer'}`}
                        >
                            <Trash2 size={10} strokeWidth={2.5} />
                            Unpack All
                        </button>

                        <button
                            onClick={onPack}
                            disabled={selectedItemIds.size === 0 || isSaving}
                            className={`flex items-center gap-2.5 px-8 h-[40px] rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all ${selectedItemIds.size === 0 || isSaving ? 'bg-white/5 text-white/5 cursor-not-allowed border border-white/5' : 'bg-(--main-color) text-black hover:bg-white shadow-lg shadow-(--main-color)/5 cursor-pointer'}`}
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} strokeWidth={2.5} />}
                            {selectedItemIds.size > 0 ? `Commit ${selectedItemIds.size} items` : 'Commit Packing'}
                        </button>
                    </div>

                    {!isCollapsed && (
                        <div className="absolute bottom-4 left-10 right-10">
                            <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden flex">
                                <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${netFillPct}%`, backgroundColor: barColor }} />
                                <div className="h-full transition-all duration-1000 ease-out opacity-20" style={{ width: `${padFillPct}%`, backgroundColor: barColor }} />
                            </div>
                        </div>
                    )}
                </div>

                <button onClick={onToggleCollapse} className={`absolute top-3 right-4 p-1.5 rounded-md hover:bg-white/5 text-white/5 hover:text-white transition-all ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                    <Maximize2 size={12} />
                </button>
            </div>
        </div>
    );
};



// ─── Compact Crate Card (left panel) ─────────────────────────────────────────
// ─── Compact Crate Card (Horizontal Top Ribbon) ─────────────────────────────────
// ─── Unified Crate/Pallet Selection Card ───────────────────────────────────────
const CrateSelectCard: React.FC<{
    crate: GroupedCrateRecord;
    isSelected: boolean;
    onClick: () => void;
    allCrates: CrateRecord[];
    allInventory: any[];
}> = ({ crate, isSelected, onClick, allCrates, allInventory }) => {
    const isPallet = crate.type === 'pallet';
    const partialCount = crate.children.filter(c => c.status === 'Partial' || (c.inventory_ids && c.inventory_ids.length > 0)).length;
    const emptyCount = crate.children.length - partialCount;
    
    const dynamicParts = useMemo(() => {
        if (crate.status === 'Partial') return getDynamicCrateIdComponents(crate, allCrates, allInventory);
        return null;
    }, [crate, allCrates, allInventory]);

    return (
        <button
            onClick={onClick}
            className={`flex flex-col gap-2 transition-all cursor-pointer min-w-[140px] shrink-0 relative group select-none`}
        >
            {/* Visual & Tags Area */}
            <div className="relative flex flex-col gap-2">
                <div className="h-16 flex items-center justify-center relative overflow-visible">
                    <div className="scale-90 group-hover:scale-100 transition-transform duration-500">
                        <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} selected={isSelected} type={crate.type} />
                    </div>
                    
                    {/* Selection Indicator (Bottom Bar) */}
                    <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 transition-all duration-500 rounded-full ${
                        isSelected ? 'w-full bg-(--main-color) shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]' : 'w-0 bg-white/20'
                    }`} />
                </div>

                {/* Tag Cluster */}
                {dynamicParts && (
                    <div className="absolute top-0 left-0 flex items-center gap-1 flex-wrap">
                        {dynamicParts.vendors.map(v => (
                            <div 
                                key={v}
                                style={{ backgroundColor: (vendors as any)[v]?.color || 'var(--main-color)' }}
                                className="px-1.5 py-0.5 rounded-sm text-black text-[7px] font-black shadow-sm"
                            >
                                {v}
                            </div>
                        ))}
                    </div>
                )}
                
                {crate.groupedCount > 1 && (
                    <div className="absolute top-0 right-0 text-[8px] font-black text-white/40 uppercase tracking-tighter">
                        {crate.groupedCount}×
                    </div>
                )}
            </div>
            
            {/* Metadata Area */}
            <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-[11px] font-black uppercase tracking-tight font-mono ${isSelected ? 'text-(--main-color)' : 'text-white/80'}`}>
                        {crate.width_cm}×{crate.length_cm}×{crate.height_cm}
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em]">
                        {isPallet ? 'Pallet' : 'Crate'}
                    </span>
                    {partialCount > 0 && (
                        <div className="flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-amber-400" />
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                {crate.children.reduce((acc, c) => acc + (c.inventory_ids ? c.inventory_ids.split(',').filter(Boolean).length : 0), 0)} items
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </button>
    );
};

// ─── Inventory Row (quantity-aware) ──────────────────────────────────────────────
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
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);

    const mediaUrls = useMemo(() => {
        const raw = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = norm.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [norm.mediaUrls, norm.generatedPngUrl]);

    const rawImageUrl = mediaUrls[0] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const itemPriceMXN = Math.ceil(Number(norm.price || 0));
    const itemQuantity = Number(norm.quantity || 1);
    const availableForThisCrate = Math.max(0, itemQuantity - (totalPackedQty - packedQtyInCurrentCrate));
    const fullyPacked = availableForThisCrate === 0;
    const partiallyPacked = totalPackedQty > 0 && availableForThisCrate > 0;

    const dimsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('×');
    const weightKg = norm.weightKg ? parseFloat(String(norm.weightKg)) : null;

    return (
        <div className="flex flex-col gap-0">
            <div
                className={`flex flex-col sm:flex-row items-stretch overflow-hidden border rounded-2xl transition-all group shadow-sm ${
                    fullyPacked
                        ? 'bg-white/1 border-white/3 opacity-40'
                        : isSelected
                            ? 'bg-(--main-color)/8 border-(--main-color)/30 ring-1 ring-(--main-color)/20'
                            : partiallyPacked
                                ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/30'
                                : 'bg-white/3 border-white/6 hover:border-white/12 hover:bg-white/5'
                }`}
            >
                {/* Selection checkbox - click anywhere except stepper */}
                <div
                    className={`w-10 shrink-0 flex items-center justify-center border-r border-white/5 cursor-pointer ${ fullyPacked ? 'cursor-not-allowed' : ''}`}
                    onClick={() => !fullyPacked && onToggle()}
                >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all border ${
                        fullyPacked
                            ? 'bg-white/5 border-white/10'
                            : isSelected
                                ? 'bg-(--main-color) border-(--main-color) shadow-md shadow-(--main-color)/30'
                                : 'border-white/15 group-hover:border-white/30'
                    }`}>
                        {(fullyPacked || isSelected) && <Check size={8} className={fullyPacked ? 'text-white/30' : 'text-black'} strokeWidth={3} />}
                    </div>
                </div>

                {/* Image thumb */}
                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-black/40 relative">
                    {imageUrl ? (
                        <>
                            <img src={imageUrl} className="w-full h-full object-cover" />
                            {isVideo && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video className="w-3 h-3" /></div>}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20">
                            <OnyxMiniLogo className="w-7 h-7 object-contain" />
                        </div>
                    )}
                </div>

                {/* Main content row */}
                <div className="flex-1 overflow-x-auto no-scrollbar flex items-center px-3 gap-3 min-w-0">
                    {/* Name + Description */}
                    <div className="flex flex-col justify-center min-w-[150px] max-w-[260px] shrink-0 border-r border-white/10 pr-3 h-full py-2">
                        <h3 className="text-[16px] font-black text-white truncate uppercase tracking-tight leading-none mb-1">
                            {(norm.shape || '') + ' ' + (norm.shortDescription || norm.description || 'Untitled Item')}
                        </h3>
                        <div className="flex items-center gap-2 text-[12px] text-white/80 font-bold uppercase tracking-widest">
                            {norm.color && <span className="truncate">{norm.color}</span>}
                            {norm.material && <><span className="text-white/40">·</span><span className="truncate">{norm.material}</span></>}
                        </div>
                    </div>

                    {/* Tag ID */}
                    <div className="flex flex-col min-w-[110px] shrink-0 sm:border-r border-white/10 sm:pr-4 justify-center h-full gap-1 group/tag">
                        <span className="text-[9px] font-black text-white/60 uppercase tracking-[0.2em] leading-none">Tag ID</span>
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const wbStr = String(norm.workbook || '').replace(/v/gi, '');
                                    const fullText = `${calculated.bookBarcode}|${(norm.color || '')} ${(norm.material || '')}`.trim() + `|${(norm.shape || '')} ${(norm.shortDescription || (norm as any).description || 'Untitled Item')}`.trim() + `|${calculated.bookAqCode || ''}${wbStr}${calculated.bookRetail || ''}`;
                                    navigator.clipboard.writeText(fullText); 
                                    toast.success(`Full Metadata Copied`, { icon: '📋' }); 
                                }}
                                className="inline-flex items-center px-3 py-1.5 rounded text-black text-[14px] font-black uppercase shadow-lg w-fit hover:scale-105 active:scale-95 transition-all"
                                style={{ backgroundColor: vendorColor }}
                            >
                                {calculated.bookBarcodeDisplay || vendorPrefix || 'N/A'}
                            </button>
                    </div>

                    {/* Price / Qty / Stats */}
                    <div className="flex flex-col min-w-[120px] shrink-0 sm:border-r border-white/10 sm:pr-4 justify-center h-full gap-1">
                        <span className="text-[9px] font-black text-white/60 uppercase tracking-[0.2em] leading-none">Availability</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[18px] font-black text-white leading-none">{itemQuantity}</span>
                                <span className="text-[10px] text-white/70 uppercase font-black tracking-widest">Total</span>
                            </div>
                            {totalPackedQty > 0 && (
                                <span className="text-[10px] px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 font-black uppercase">
                                    {packedQtyInCurrentCrate > 0 ? `+${packedQtyInCurrentCrate} Here` : ''}{totalPackedQty - packedQtyInCurrentCrate > 0 ? ` ${totalPackedQty - packedQtyInCurrentCrate} Other` : ''}
                                </span>
                            )}
                            {availableForThisCrate > 0 && (
                                <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-black uppercase">
                                    {availableForThisCrate} Avail
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Dims & AQ (Hidden on mobile, moved to expanded) */}
                    <div className="hidden lg:flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-4 justify-center h-full gap-1">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Details</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/70 font-mono">{calculated.bookAqCode || '—'}</span>
                            <span className="text-[11px] text-white/50 font-mono">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                        </div>
                    </div>

                    {weightKg && (
                        <div className="flex flex-col min-w-[50px] shrink-0 justify-center h-full gap-0.5">
                            <span className="text-[7px] font-black uppercase tracking-widest leading-none">Wt</span>
                            <span className="text-[10px] text-white/50 font-mono">{weightKg}kg</span>
                        </div>
                    )}
                </div>

                {/* Right action area */}
                <div className="flex items-center gap-1 px-2 py-2 shrink-0 bg-white/2 border-l border-white/5">
                    {fullyPacked && <span className="text-[7px] font-black uppercase tracking-widest text-white/20 px-1.5">Done</span>}
                    {isSelected && !fullyPacked && (
                        // Qty stepper — stops click propagation so it doesn't toggle selection
                        <div
                            className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => onQtyChange(Math.max(1, selectedQty - 1))}
                                className="w-6 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            >
                                <Minus size={9} strokeWidth={3} />
                            </button>
                            <span className="text-[11px] font-black text-white font-mono w-5 text-center">{selectedQty}</span>
                            <button
                                type="button"
                                onClick={() => onQtyChange(Math.min(availableForThisCrate, selectedQty + 1))}
                                className="w-6 h-7 flex items-center justify-center text-white/50 hover:text-(--main-color) hover:bg-(--main-color)/10 transition cursor-pointer"
                            >
                                <Plus size={9} strokeWidth={3} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={e => { e.stopPropagation(); onToggleExpand(); }}
                        className={`p-1.5 hover:text-white hover:bg-white/10 rounded-md transition-colors ${isExpanded ? 'text-(--main-color)' : 'text-white/30'}`}
                    >
                        <Maximize2 className={`w-3 h-3 stroke-2 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Expanded Detail Panel */}
            {isExpanded && (
                <div className="ml-4 sm:ml-[94px] mr-1 px-4 pb-4 pt-3 bg-black/40 border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-4">
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Material</p><p className="text-[11px] font-black text-(--text-color)/80 uppercase tracking-wide">{norm.material || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Dimensions</p><p className="text-[11px] font-mono font-black text-white/70">{dimsCm ? `${dimsCm}cm` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Weight</p><p className="text-[11px] font-mono font-black text-white/70">{weightKg ? `${weightKg}kg` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Status</p><p className="text-[11px] font-black text-white/70 uppercase tracking-wide">{norm.status || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">LD Code</p><p className="text-[12px] font-mono font-black text-yellow-400/80">{calculated.bookLandCode || '—'}</p></div>
                    </div>
                    {norm.description && (
                        <p className="text-[10px] text-white/40 mt-2 italic leading-relaxed border-t border-white/5 pt-2">{norm.description}</p>
                    )}
                </div>
            )}
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
    const [vendorFilter, setVendorFilter] = useState('All');
    const [sortBy, setSortBy] = useState<'date' | 'status' | 'vendor' | 'qty'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
        const sub = db.logistics.find({ selector: { type: { $in: ['crate', 'pallet'] } } }).$.subscribe((data: any[]) => {
            setCrates(data.map(c => c.toJSON()));
        });
        return () => sub.unsubscribe();
    }, [db, cratesVersion]);

    const activeCrates = useMemo(() => crates.filter(c => c.status !== 'Packed'), [crates]);

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
                case 'date':
                    valA = a.data?.updated_at || a.data?.createdAt || '';
                    valB = b.data?.updated_at || b.data?.createdAt || '';
                    break;
                case 'status':
                    valA = a.data?.status || '';
                    valB = b.data?.status || '';
                    break;
                case 'vendor':
                    valA = a.data?.vendor_id || a.data?.vendorId || '';
                    valB = b.data?.vendor_id || b.data?.vendorId || '';
                    break;
                case 'qty':
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
        <div className="flex flex-col h-full w-full overflow-hidden bg-transparent">
            {/* ─── Top Panel: Crate Dashboard / Selector ─── */}
            <div className="shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-3xl overflow-hidden">
                {selectedCrate ? (
                    <ActiveCrateDashboard
                        crate={selectedCrate}
                        selectedItemIds={selectedItemIds}
                        selectedQtys={selectedQtys}
                        allInventory={allInventory}
                        exchangeRate={exchangeRate}
                        onClear={() => handleSelectCrate(null)}
                        onClearStaged={() => { setSelectedItemIds(new Set()); setSelectedQtys({}); }}
                        onPack={handlePackItems}
                        onUnpack={handleUnpackAll}
                        isSaving={isSaving}
                        isCollapsed={isDashboardCollapsed}
                        onToggleCollapse={() => setIsDashboardCollapsed(!isDashboardCollapsed)}
                    />
                ) : (
                    <div className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-(--main-color)">
                                    Available {activeGroup ? activeGroup.type === 'pallet' ? 'Pallets' : 'Crates' : 'Storage Units'}
                                </h3>
                                <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">
                                    {activeCrates.length} units ready for packing
                                </p>
                            </div>
                            {activeGroup && (
                                <button
                                    onClick={() => setActiveGroupKey(null)}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition cursor-pointer"
                                >
                                    ← Back to sizes
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-8 overflow-x-auto no-scrollbar pb-2">
                            {activeCrates.length === 0 ? (
                                <div className="flex items-center gap-3 py-4 opacity-30">
                                    <Inbox size={20} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">No empty units available</span>
                                </div>
                            ) : !activeGroup ? (
                                groupedAvailableCrates.map(group => {
                                    const isSelected = selectedCrateId && group.children.some(c => c.id === selectedCrateId);
                                    return (
                                        <CrateSelectCard
                                            key={group.id}
                                            crate={{...group, status: group.children.some(c => c.status === 'Partial') ? 'Partial' : 'Empty'}}
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
                                <div className="flex items-center gap-4">
                                    {activeGroup.children.map(c => {
                                        const isSelected = selectedCrateId === c.id;
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => handleSelectCrate(c.id)}
                                                className={`min-w-[100px] flex flex-col gap-1.5 transition-all cursor-pointer relative group`}
                                            >
                                                <div className="flex items-center justify-between w-full px-1">
                                                    <span className={`text-[9px] font-mono leading-none tracking-tight ${isSelected ? 'text-(--main-color)' : 'text-white/60'}`}>
                                                        {c.id.slice(0,8).toUpperCase()}
                                                    </span>
                                                    <div className={`w-1 h-1 rounded-full ${c.status === 'Partial' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                                </div>
                                                <div className={`h-0.5 rounded-full transition-all duration-500 ${isSelected ? 'w-full bg-(--main-color)' : 'w-0 bg-white/10'}`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Main Area: Inventory List ── */}
            <div className="flex-1 flex flex-col min-w-0 bg-black/10 min-h-0">

                {/* Config & Sort Panel */}
                {isFiltersOpen && (
                    <div className="border-b border-white/10 bg-white/2 backdrop-blur-3xl flex flex-col gap-0 animate-in slide-in-from-top duration-300 shrink-0">
                        {/* Sort Bar */}
                        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/5">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-4">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Sort By</span>
                                    <div className="flex items-center gap-3">
                                        {[
                                            { id: 'date', label: 'Date' },
                                            { id: 'status', label: 'Status' },
                                            { id: 'vendor', label: 'Vendor' },
                                            { id: 'qty', label: 'Qty' },
                                        ].map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    if (sortBy === s.id) {
                                                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                    } else {
                                                        setSortBy(s.id as any);
                                                        setSortOrder('desc');
                                                    }
                                                }}
                                                className={`text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 group/sort ${
                                                    sortBy === s.id
                                                        ? 'text-(--main-color)'
                                                        : 'text-white/25 hover:text-white/60'
                                                }`}
                                            >
                                                {s.label}
                                                {sortBy === s.id ? (
                                                    sortOrder === 'asc' ? <ArrowUp size={10} className="text-(--main-color)" /> : <ArrowDown size={10} className="text-(--main-color)" />
                                                ) : (
                                                    <ArrowUpDown size={10} className="opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {!selectedCrate && (
                                    <div className="flex items-center gap-3 text-white/20 ml-2">
                                        <PackagePlus size={16} strokeWidth={2.5} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.3em]">SELECT DESTINATION UNIT</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Vendor Filters */}
                        <div className="px-6 py-4 flex flex-col gap-2">
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20">Source Vendor</span>
                            <div className="flex flex-wrap gap-2">
                                {vendorOptions.map(v => {
                                    const color = v === 'All' ? undefined : (vendors as any)[v]?.color;
                                    const isActive = vendorFilter === v;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setVendorFilter(v)}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border shrink-0 cursor-pointer ${
                                                isActive
                                                    ? 'bg-white text-black border-white shadow-md'
                                                    : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
                                            }`}
                                        >
                                            {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                                            {v}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Inventory List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    {!selectedCrate ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-6">
                            <div className="p-8 bg-white/2 rounded-full border border-white/5">
                                <Package size={64} className="text-white/10" strokeWidth={0.5} />
                            </div>
                            <p className="text-[12px] font-black uppercase tracking-[0.4em] text-white/30 max-w-sm leading-loose">
                                SELECT A DESTINATION CRATE<br />TO ACTIVATE ITEM SELECTION.
                            </p>
                        </div>
                    ) : filteredInventory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4">
                            <ListFilter size={48} className="text-white/10" strokeWidth={0.5} />
                            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">NO ITEMS MATCH FILTERS</p>
                        </div>
                    ) : (
                        <div className="p-6 flex flex-col gap-1.5">
                            {/* Stats bar */}
                            <div className="flex items-center justify-between mb-4 px-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/25">{filteredInventory.length} ITEMS FOUND</span>
                                {filteredInventory.length > 0 && (
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
                                        className="text-[10px] font-black uppercase tracking-widest text-(--main-color)/60 hover:text-(--main-color) transition cursor-pointer"
                                    >
                                        SELECT ALL REMAINING
                                    </button>
                                )}
                            </div>
                            {filteredInventory.map(item => {
                                const iid = String(item.row);
                                const norm = normalizeInventoryData(item.data);
                                const totalQty = Number(norm.quantity || 1);
                                const totalPacked = getTotalPackedForItem(iid, crates);
                                const inCurrentCrate = (() => { const q = currentCratePackedMap.get(iid); return q === -1 ? 1 : (q ?? 0); })();
                                const availableForThisCrate = Math.max(0, totalQty - (totalPacked - inCurrentCrate));
                                const isSelected = selectedItemIds.has(iid);
                                return (
                                    <PackingInventoryRow
                                        key={item.row}
                                        item={item as InventoryItem}
                                        isSelected={isSelected}
                                        packedQtyInCurrentCrate={inCurrentCrate}
                                        totalPackedQty={totalPacked}
                                        selectedQty={selectedQtys[iid] ?? 1}
                                        onToggle={() => toggleItem(iid, availableForThisCrate)}
                                        onQtyChange={qty => setSelectedQtys(q => ({ ...q, [iid]: qty }))}
                                        isExpanded={expandedIds.has(iid)}
                                        onToggleExpand={() => toggleExpand(iid)}
                                        exchangeRate={exchangeRate}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Confirm Pack summary bar */}
                {selectedCrate && selectedItemIds.size > 0 && (
                    <div className="flex items-center justify-between px-8 py-5 border-t border-white/5 bg-black/40 backdrop-blur-3xl shrink-0 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-[13px] font-black uppercase tracking-[0.1em] text-white">
                                    {Array.from(selectedItemIds).reduce((s, id) => s + (selectedQtys[id] ?? 1), 0)} TOTAL UNITS
                                </span>
                                <span className="text-[10px] font-mono text-white/40 mt-1 uppercase">
                                    → {selectedItemIds.size} UNIQUE SKU(s)
                                </span>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--main-color)/60">DESTINATION</span>
                                <span className="text-[12px] font-black text-white mt-0.5">{fmtDims(selectedCrate)} {selectedCrate.type.toUpperCase()}</span>
                            </div>
                        </div>
                        <button
                            onClick={handlePackItems}
                            disabled={isSaving}
                            className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-(--main-color) text-black text-[12px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-98 transition-all cursor-pointer disabled:opacity-50 shadow-2xl shadow-(--main-color)/30"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} strokeWidth={4} />}
                            {selectedCrate.inventory_ids && selectedCrate.inventory_ids.length > 0 ? 'UPDATE CONTENTS' : 'CONFIRM PACK'}
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
