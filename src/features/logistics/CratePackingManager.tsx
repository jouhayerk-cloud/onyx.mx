import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtomValue, useAtom } from 'jotai/react';
import { inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
    Package, ChevronRight, Check, Loader2, X,
    PackagePlus, ListFilter, Inbox, Video, Maximize2, Minus, Plus
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

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

// ─── Wireframe Crate Visual ───────────────────────────────────────────────────
const WireframeCrate: React.FC<{ w?: number; l?: number; h?: number; selected?: boolean; type?: string }> = ({
    w = 60, l = 60, h = 60, selected = false, type = 'crate'
}) => {
    // Normalize dims to max 48px display box
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale = 38 / maxDim;
    const dw = Math.round(w * scale);
    const dl = Math.round(l * scale);
    const dh = Math.round(visH * scale);

    // Isometric-style wireframe params
    const depth = Math.round(dl * 0.35); // depth perspective
    const color = selected ? 'var(--main-color)' : 'rgba(255,255,255,0.35)';
    const svgW = dw + depth + 4;
    const svgH = dh + depth + 4;

    // Corners of front face
    const x0 = 2, y0 = depth + 2;
    const x1 = x0 + dw, y1 = y0;
    const x2 = x1, y2 = y0 + dh;
    const x3 = x0, y3 = y0 + dh;

    // Top face offset
    const dx = depth, dy = -depth;

    return (
        <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="overflow-visible"
            style={{ filter: selected ? `drop-shadow(0 0 4px var(--main-color))` : undefined }}
        >
            {/* Back vertical */}
            <line x1={x0 + dx} y1={y0 + dy} x2={x0 + dx} y2={y3 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
            {/* Back top horizontal */}
            <line x1={x0 + dx} y1={y0 + dy} x2={x1 + dx} y2={y1 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />
            {/* Back bottom */}
            <line x1={x0 + dx} y1={y3 + dy} x2={x1 + dx} y2={y2 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" />

            {/* Top face */}
            <polygon
                points={`${x0},${y0} ${x0 + dx},${y0 + dy} ${x1 + dx},${y1 + dy} ${x1},${y1}`}
                fill={selected ? 'rgba(var(--main-color-rgb, 249,115,22), 0.06)' : 'rgba(255,255,255,0.03)'}
                stroke={color} strokeWidth="0.8"
            />

            {/* Right face */}
            <polygon
                points={`${x1},${y1} ${x1 + dx},${y1 + dy} ${x1 + dx},${y2 + dy} ${x1},${y2}`}
                fill={selected ? 'rgba(var(--main-color-rgb, 249,115,22), 0.04)' : 'rgba(255,255,255,0.015)'}
                stroke={color} strokeWidth="0.8"
            />

            {/* Front face */}
            <rect x={x0} y={y0} width={dw} height={dh}
                fill={selected ? 'rgba(var(--main-color-rgb, 249,115,22), 0.07)' : 'rgba(255,255,255,0.025)'}
                stroke={color} strokeWidth="1"
            />

            {/* Cross braces on front */}
            {type !== 'pallet' && (
                <>
                    <line x1={x0} y1={y0} x2={x1} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.4" />
                    <line x1={x1} y1={y0} x2={x0} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.4" />
                </>
            )}
        </svg>
    );
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

// ─── ActiveCrateSidebar ───────────────────────────────────────────────────────
// VOLUME FORMULAS:
//   Internal crate  = (W_ext−15) × (L_ext−15) × (H_ext−15) cm³  [7.5cm walls]
//   Item net        = W × H × L  cm³
//   Item padded     = (W+3) × (H+3) × (L+3) cm³  [1.5cm clearance/face]
//   Fill %          = Σ(padded item cm³) / internalCrate cm³ × 100
//   Bar shows net (solid) + padding (translucent) segments of filled volume.
const ActiveCrateSidebar: React.FC<{
    crate: CrateRecord;
    selectedItemIds: Set<string>;
    selectedQtys: Record<string, number>;
    allInventory: any[];
    crates: CrateRecord[];
    exchangeRate: number;
    onClear: () => void;
}> = ({ crate, selectedItemIds, selectedQtys, allInventory, crates: _crates, exchangeRate, onClear }) => {
    const [collapsed, setCollapsed] = useState(false);

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
            const paddedVol  = itemPaddedCm3(norm) * qty;
            const paddingVol = paddedVol - netVol;
            const weight     = (Number(norm.weightKg) || 0) * qty;
            return [{ id, norm, calc, qty, netVol, paddedVol, paddingVol, weight, tagColor, vendorPrefix }];
        })
    , [selectedItemIds, selectedQtys, allInventory, exchangeRate]);

    // Internal crate volume: subtract 7.5cm walls per side (−15cm per axis)
    const internalCrateCm3 = crateCm3(crate);

    // Already-packed padded volume (items saved to this crate)
    const alreadyPackedMap = useMemo(() => parseInventoryIds(crate.inventory_ids), [crate.inventory_ids]);
    const alreadyPackedPaddedVol = useMemo(() => {
        let v = 0;
        alreadyPackedMap.forEach((qty, id) => {
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (!inv) return;
            v += itemPaddedCm3(normalizeInventoryData(inv.data)) * (qty === -1 ? 1 : qty);
        });
        return v;
    }, [alreadyPackedMap, allInventory]);

    // Pending (staged, not yet saved)
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

    // ── Collapsed state: mini strip
    if (collapsed) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="px-3 pt-3 pb-3 border-b border-white/5 shrink-0 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black uppercase tracking-widest text-(--main-color) truncate">Active {crate.type === 'pallet' ? 'Pallet' : 'Crate'}</p>
                        <p className="text-[7px] font-mono text-white/25 truncate">{fmtDims(crate)} cm</p>
                    </div>
                    <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: barColor }}>{fillPct.toFixed(0)}%</span>
                    <button onClick={() => setCollapsed(false)} className="text-white/40 hover:text-white transition cursor-pointer shrink-0 p-1" title="Expand">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                </div>
                <div className="h-1 w-full bg-white/5 shrink-0 flex">
                    <div className="h-full" style={{ width: `${netFillPct}%`, backgroundColor: barColor }} />
                    <div className="h-full opacity-35" style={{ width: `${padFillPct}%`, backgroundColor: barColor }} />
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <button onClick={() => setCollapsed(false)} className="text-[7px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition cursor-pointer">Expand panel</button>
                </div>
            </div>
        );
    }

    // ── Expanded state
    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-3 pb-3 border-b border-white/5 shrink-0 flex items-center justify-between">
                <div>
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-(--main-color)">Active {crate.type === 'pallet' ? 'Pallet' : 'Crate'}</h3>
                    <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">{fmtDims(crate)} cm</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => setCollapsed(true)} className="text-white/30 hover:text-white transition cursor-pointer p-1" title="Collapse">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                    <button onClick={onClear} className="text-[7px] font-black uppercase tracking-widest text-white/30 hover:text-white px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition cursor-pointer">Deselect Crate</button>
                </div>
            </div>

            {/* Wireframe */}
            <div className="flex items-center justify-center py-4 relative shrink-0">
                <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(ellipse_at_center,var(--main-color)_0%,transparent_70%)]" />
                <LargeCrateWireframe w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={130} />
            </div>
            <div className="px-4 pb-2 shrink-0"><p className="text-[7px] font-mono text-white/25 truncate">{crate.id.slice(0, 12).toUpperCase()}</p></div>

            {/* Fill gauge */}
            <div className="px-4 pb-3 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/30">Vol. Fill</span>
                    <span className="text-[11px] font-black tabular-nums" style={{ color: barColor }}>{fillPct.toFixed(1)}%</span>
                </div>
                {/* Stacked bar: solid = net item vol, faded = padding vol */}
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full transition-all duration-300" style={{ width: `${netFillPct}%`, backgroundColor: barColor, borderRadius: netFillPct < 98 ? '9999px 0 0 9999px' : '9999px' }} />
                    <div className="h-full transition-all duration-300 opacity-35" style={{ width: `${padFillPct}%`, backgroundColor: barColor, borderRadius: padFillPct > 0 ? '0 9999px 9999px 0' : '0' }} />
                </div>
                {/* Legend */}
                <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-1.5 rounded-sm" style={{ backgroundColor: barColor }} />
                        <span className="text-[6px] text-white/30 font-mono">item {(pendingNetVol/1000).toFixed(1)}L</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-1.5 rounded-sm opacity-35" style={{ backgroundColor: barColor }} />
                        <span className="text-[6px] text-white/30 font-mono">+pad {(pendingPaddingVol/1000).toFixed(1)}L</span>
                    </div>
                    <span className="text-[6px] text-white/20 font-mono ml-auto">/{(internalCrateCm3/1000).toFixed(0)}L int.</span>
                </div>
                {fillPct >= 90 && <p className="text-[7px] font-black uppercase tracking-widest text-rose-400 mt-1.5 animate-pulse">⚠ Near capacity</p>}
            </div>

            {/* Formula chip */}
            <div className="mx-3 mb-3 px-3 py-2 bg-white/2 border border-white/5 rounded-xl shrink-0">
                <p className="text-[6px] font-mono text-white/20 leading-relaxed">
                    Internal = (W−15)×(L−15)×(H−15) cm³<br />
                    Each item = (W+3)×(H+3)×(L+3) cm³<br />
                    Fill % = Σ padded ÷ internal × 100
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3 shrink-0">
                <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2">
                    <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Units</p>
                    <p className="text-[15px] font-black text-white tabular-nums">{totalQty}</p>
                </div>
                <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2">
                    <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Weight</p>
                    <p className="text-[15px] font-black text-white tabular-nums">{totalWeight.toFixed(1)}<span className="text-[8px] text-white/30 ml-0.5">kg</span></p>
                </div>
            </div>

            {/* Staged items */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1 custom-scrollbar">
                <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mb-1">Staged ({selectedItems.length})</p>
                {selectedItems.map(item => (
                    <div key={item.id} className="flex items-start gap-2 px-2.5 py-2 bg-white/3 border border-white/5 rounded-xl">
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 text-black mt-0.5" style={{ backgroundColor: item.tagColor }}>
                            {item.calc.bookBardcode || item.vendorPrefix || '—'}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[8px] font-black text-white truncate leading-none">{item.norm.shape || ''} {item.norm.shortDescription || item.norm.description || ''}</p>
                            <p className="text-[7px] text-white/30 font-mono mt-0.5">{item.norm.widthCm || '?'}×{item.norm.heightCm || '?'}×{item.norm.lengthCm || '?'}cm · {item.weight.toFixed(1)}kg</p>
                            <p className="text-[6px] text-white/15 font-mono">{(item.paddedVol/1000).toFixed(2)}L padded ×{item.qty}</p>
                        </div>
                        <span className="text-[9px] font-black text-(--main-color) shrink-0">×{item.qty}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


// ─── Compact Crate Card (left panel) ─────────────────────────────────────────
const CrateSelectCard: React.FC<{
    crate: CrateRecord;
    isSelected: boolean;
    onClick: () => void;
}> = ({ crate, isSelected, onClick }) => {
    const packedCount = crate.inventory_ids ? crate.inventory_ids.split(',').filter(Boolean).length : 0;
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border transition-all text-left cursor-pointer group ${
                isSelected
                    ? 'bg-(--main-color)/10 border-(--main-color)/30 shadow-lg shadow-(--main-color)/5'
                    : 'bg-white/2 border-white/5 hover:border-white/12 hover:bg-white/4'
            }`}
        >
            {/* Wireframe crate icon */}
            <div className="w-14 h-12 shrink-0 flex items-center justify-center">
                <WireframeCrate
                    w={crate.width_cm}
                    l={crate.length_cm}
                    h={crate.height_cm}
                    selected={isSelected}
                    type={crate.type}
                />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-[9px] font-mono text-white/30 truncate leading-none">{crate.id.slice(0, 10).toUpperCase()}</p>
                <p className={`text-[11px] font-black text-white truncate leading-tight mt-0.5 ${isSelected ? 'text-(--main-color)' : ''}`}>
                    {fmtDims(crate)} <span className="text-white/30 text-[8px] font-black">CM</span>
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(crate.status)}`} />
                    <p className={`text-[8px] font-black uppercase tracking-widest ${statusText(crate.status)}`}>
                        {crate.status}
                    </p>
                    <span className="text-[8px] text-white/20 font-mono">· {packedCount} items</span>
                </div>
            </div>

            <ChevronRight size={11} className={`shrink-0 transition-all ${isSelected ? 'text-(--main-color)' : 'text-white/15 group-hover:text-white/30'}`} />
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
    const remaining = Math.max(0, itemQuantity - totalPackedQty);
    const fullyPacked = remaining === 0;
    const partiallyPacked = totalPackedQty > 0 && remaining > 0;

    const dimsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('×');
    const weightKg = norm.weightKg ? parseFloat(String(norm.weightKg)) : null;

    return (
        <div className="flex flex-col gap-0">
            <div
                className={`flex items-stretch overflow-hidden border rounded-xl transition-all group shadow-sm ${
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
                    <div className="flex flex-col justify-center min-w-[130px] max-w-[220px] shrink-0 border-r border-white/5 pr-3 h-full py-1">
                        <h3 className="text-xs font-bold text-white truncate">
                            {(norm.shape || '') + ' ' + (norm.shortDescription || norm.description || '')}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 mt-0.5">
                            {norm.color && <span className="truncate">{norm.color}</span>}
                            {norm.material && <><span className="text-white/20">·</span><span className="truncate">{norm.material}</span></>}
                        </div>
                    </div>

                    {/* Tag ID */}
                    <div className="flex flex-col min-w-[64px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Tag ID</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-black text-[10px] font-black uppercase shadow-md w-fit"
                            style={{ backgroundColor: vendorColor }}>
                            {calculated.bookBardcode || vendorPrefix || 'N/A'}
                        </span>
                    </div>

                    {/* Price / Qty */}
                    <div className="flex flex-col min-w-[100px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Qty &amp; Status</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-baseline gap-1">
                                <span className="text-[11px] font-mono font-black text-white">{itemQuantity}</span>
                                <span className="text-[9px] text-white/40">total</span>
                            </div>
                            {totalPackedQty > 0 && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/20 text-rose-400 font-black">
                                    {packedQtyInCurrentCrate > 0 ? `+${packedQtyInCurrentCrate} here` : ''}{totalPackedQty - packedQtyInCurrentCrate > 0 ? ` ${totalPackedQty - packedQtyInCurrentCrate} elsewhere` : ''}
                                </span>
                            )}
                            {remaining > 0 && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black">
                                    {remaining} avail
                                </span>
                            )}
                        </div>
                    </div>

                    {/* AQ Code */}
                    <div className="flex flex-col min-w-[56px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">AQ</span>
                        <span className="text-[11px] text-white/70 font-mono">{calculated.bookAqCode || '—'}</span>
                    </div>

                    {/* Dims */}
                    <div className="flex flex-col min-w-[60px] shrink-0 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black uppercase tracking-widest leading-none">Dims</span>
                        <span className="text-[10px] text-white/50 font-mono">{dimsCm ? `${dimsCm}cm` : '—'}</span>
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
                                onClick={() => onQtyChange(Math.min(remaining, selectedQty + 1))}
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
                <div className="ml-[94px] mr-1 px-4 pb-3 pt-2.5 bg-black/30 border-x border-b border-white/5 rounded-b-xl animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-6 gap-y-2">
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-0.5">Material</p><p className="text-[11px] font-bold text-white/70 uppercase">{norm.material || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-0.5">Dimensions</p><p className="text-[11px] font-mono font-bold text-white/70">{dimsCm ? `${dimsCm}cm` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-0.5">Weight</p><p className="text-[11px] font-mono font-bold text-white/70">{weightKg ? `${weightKg}kg` : '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-0.5">Status</p><p className="text-[11px] font-bold text-white/70 uppercase">{norm.status || '—'}</p></div>
                        <div><p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-0.5">LD Code</p><p className="text-[11px] font-mono text-yellow-400/80">{calculated.bookLandCode || '—'}</p></div>
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

    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Acquisition' | 'Production' | 'Shipped'>('All');
    const [vendorFilter, setVendorFilter] = useState('All');
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    // Map of itemId -> qty user wants to pack into this crate
    const [selectedQtys, setSelectedQtys] = useState<Record<string, number>>({});
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    const handleSelectCrate = useCallback((id: string | null) => {
        setSelectedCrateId(id);
        setExpandedIds(new Set());
        if (!id) {
            setSelectedItemIds(new Set());
            setSelectedQtys({});
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
        const groups: Record<string, GroupedCrateRecord> = {};
        for (const c of activeCrates) {
            const dimTypeKey = `${c.width_cm}x${c.length_cm}x${c.height_cm}x${c.type}`;
            if (!groups[dimTypeKey]) {
                groups[dimTypeKey] = { ...c, groupedCount: 0, children: [] };
            }
            groups[dimTypeKey].groupedCount += 1;
            groups[dimTypeKey].children.push(c);
        }
        return Object.values(groups).sort((a, b) => b.groupedCount - a.groupedCount);
    }, [activeCrates]);

    const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
    const activeGroup = useMemo(() => activeGroupKey ? groupedAvailableCrates.find(g => `${g.width_cm}x${g.length_cm}x${g.height_cm}x${g.type}` === activeGroupKey) : null, [activeGroupKey, groupedAvailableCrates]);

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

    // Smart multi-term search — mirrors inventory module
    const filteredInventory = useMemo(() => {
        return allInventory.filter(i => {
            const d = i.data;
            if ((d as any).is_hidden) return false;
            const statusMatch = statusFilter === 'All' || (d.status || '').toLowerCase() === statusFilter.toLowerCase();
            const vendorId = d.vendor_id || d.vendorId || (d.itemId || '').split('-')[0];
            const vendorMatch = vendorFilter === 'All' || vendorId === vendorFilter;
            if (!statusMatch || !vendorMatch) return false;
            if (search) {
                const norm = normalizeInventoryData(d);
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
    }, [allInventory, search, statusFilter, vendorFilter, exchangeRate]);

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
            // Keep the selection active but we need to re-sync if version changes
            // Actually, usually users want to continue editing or move to next crate.
            // Let's keep it selected so they can see the result.
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Update failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-transparent">

            {/* ── Left Pane: Active Crate Panel ✔ Size Selector ── */}
            <div className="w-[240px] shrink-0 border-r border-white/5 flex flex-col bg-black/40 backdrop-blur-3xl overflow-hidden">
                {selectedCrate && selectedItemIds.size > 0 ? (
                    <ActiveCrateSidebar
                        crate={selectedCrate}
                        selectedItemIds={selectedItemIds}
                        selectedQtys={selectedQtys}
                        allInventory={allInventory}
                        crates={crates}
                        exchangeRate={exchangeRate}
                        onClear={() => handleSelectCrate(null)}
                    />
                ) : (
                    <>
                        <div className="px-4 pt-4 pb-2.5 border-b border-white/5 shrink-0 flex items-center justify-between">
                            <div>
                                <h3 className="text-[9px] font-black uppercase tracking-widest text-(--main-color)">Available {activeGroup ? activeGroup.type === 'pallet' ? 'Pallets' : 'Crates' : 'Sizes'}</h3>
                                <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">{activeCrates.length} ready to pack</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 custom-scrollbar">
                            {activeCrates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-3 py-8">
                                    <Inbox size={28} className="text-white/20" strokeWidth={1} />
                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 max-w-[120px] leading-relaxed">No empty sizes.<br />Create some in the Crates tab.</span>
                                </div>
                            ) : !activeGroup ? (
                                groupedAvailableCrates.map(group => {
                                    const isSelected = selectedCrateId && group.children.some(c => c.id === selectedCrateId);
                                    return (
                                        <CrateSelectCard
                                            key={group.id}
                                            crate={{...group, status: group.children.some(c => c.status === 'Partial') ? 'Partial' : 'Empty'}}
                                            isSelected={!!isSelected}
                                            onClick={() => {
                                                setActiveGroupKey(`${group.width_cm}x${group.length_cm}x${group.height_cm}x${group.type}`);
                                                const targetCrate = [...group.children].sort((a, b) => a.status === 'Partial' ? -1 : 1)[0];
                                                handleSelectCrate(targetCrate.id);
                                            }}
                                        />
                                    );
                                })
                            ) : (
                                <div className="flex flex-col gap-2 relative">
                                    <button onClick={() => setActiveGroupKey(null)} className="absolute -top-1 right-0 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition z-10 cursor-pointer">Back</button>
                                    <div className="w-full aspect-square mt-6 flex items-center justify-center relative bg-white/2 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
                                        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-size-[10px_10px]" />
                                        <LargeCrateWireframe w={activeGroup.width_cm} l={activeGroup.length_cm} h={activeGroup.height_cm} type={activeGroup.type} size={160} />
                                        <div className="absolute bottom-2 left-0 right-0 text-center">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--main-color) drop-shadow-md bg-black/40 px-2 py-1 rounded-full border border-(--main-color)/20 backdrop-blur-md">{activeGroup.groupedCount} AVAILABLE</span>
                                        </div>
                                    </div>
                                    <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mt-2 pl-1">Select a unit</p>
                                    <div className="flex flex-col gap-1 px-1">
                                        {activeGroup.children.map(c => {
                                            const packedItems = c.inventory_ids ? c.inventory_ids.split(',').filter(Boolean).length : 0;
                                            return (
                                                <button key={c.id} onClick={() => handleSelectCrate(c.id)}
                                                    className={`flex items-center justify-between px-3 py-2 border rounded-xl cursor-pointer transition ${
                                                        selectedCrateId === c.id
                                                            ? 'bg-(--main-color)/10 border-(--main-color)/30 shadow-md'
                                                            : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10 text-white/50'
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className={`text-[9px] font-mono leading-none ${selectedCrateId === c.id ? 'text-white' : ''}`}>{c.id.slice(0,8).toUpperCase()}</span>
                                                        <div className="flex items-center gap-1.5 opacity-80">
                                                            <div className={`w-1 h-1 rounded-full ${c.status === 'Partial' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                                            <span className={`text-[7px] font-black uppercase tracking-widest ${c.status === 'Partial' ? 'text-amber-400' : 'text-emerald-400'}`}>{c.status}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{packedItems} items</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Right Pane: Inventory List ── */}
            <div className="flex-1 flex flex-col min-w-0 bg-black/10">

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/5 bg-black/20 backdrop-blur-xl shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedCrate ? (
                            <div className="flex items-center gap-2">
                                <WireframeCrate w={selectedCrate.width_cm} l={selectedCrate.length_cm} h={selectedCrate.height_cm} selected />
                                <div>
                                    <p className="text-[10px] font-black text-white uppercase tracking-widest">
                                        {fmtDims(selectedCrate)} <span className="text-white/30 text-[8px]">cm</span>
                                    </p>
                                    <p className="text-[7px] font-mono text-white/25">{selectedCrate.id.slice(0, 12).toUpperCase()}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-white/25">
                                <PackagePlus size={13} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Select a crate first</span>
                            </div>
                        )}

                        {selectedItemIds.size > 0 && selectedCrate && (
                            <div className="flex items-center gap-2 px-2.5 py-1 bg-(--main-color)/10 border border-(--main-color)/20 rounded-xl">
                                <span className="text-[10px] font-black text-(--main-color)">{selectedItemIds.size} selected</span>
                                <button onClick={() => { setSelectedItemIds(new Set()); setSelectedQtys({}); }} className="text-(--main-color)/60 hover:text-(--main-color) cursor-pointer">
                                    <X size={10} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Status filter — pill chips */}
                        <div className="flex items-center gap-1">
                            {(['All', 'Acquisition', 'Production', 'Shipped'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border cursor-pointer ${
                                        statusFilter === s
                                            ? 'bg-(--main-color) text-black border-(--main-color) shadow-md shadow-(--main-color)/20'
                                            : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20 hover:text-white/70'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-4 bg-white/10 mx-1" />

                        {/* Pack Action */}
                        <button
                            onClick={handlePackItems}
                            disabled={!selectedCrate || selectedItemIds.size === 0 || isSaving}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${(!selectedCrate || selectedItemIds.size === 0 || isSaving) ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95 shadow-lg shadow-(--main-color)/20 cursor-pointer'}`}
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
                            Pack {selectedItemIds.size > 0 ? selectedItemIds.size : ''} Item{selectedItemIds.size !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>

                {/* Vendor filter strip — pill chips with color dots, mirrors Inventory vendor filter */}
                <div className="flex items-center gap-1.5 px-5 py-2 border-b border-white/5 bg-black/10 overflow-x-auto no-scrollbar shrink-0">
                    <span className="text-[7px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-1">Vendor</span>
                    {vendorOptions.map(v => {
                        const color = v === 'All' ? undefined : (vendors as any)[v]?.color;
                        const isActive = vendorFilter === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border shrink-0 cursor-pointer ${
                                    isActive
                                        ? 'bg-white text-black border-white shadow-md'
                                        : 'bg-white/5 border-white/8 text-white/40 hover:border-white/20 hover:text-white/70'
                                }`}
                            >
                                {color && (
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: color }}
                                    />
                                )}
                                {v}
                            </button>
                        );
                    })}
                </div>

                {/* Inventory List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!selectedCrate ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4">
                            <Package size={44} className="text-white/15" strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 max-w-xs leading-loose">
                                Select a destination crate<br />to activate item selection.
                            </p>
                        </div>
                    ) : filteredInventory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4">
                            <ListFilter size={36} className="text-white/15" strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">No items match the current filters.</p>
                        </div>
                    ) : (
                        <div className="p-4 flex flex-col gap-1">
                            {/* Stats bar */}
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-[8px] font-black uppercase tracking-widest text-white/20">{filteredInventory.length} items</span>
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
                                        className="text-[8px] font-black uppercase tracking-widest text-(--main-color)/60 hover:text-(--main-color) transition cursor-pointer"
                                    >
                                        Select all with remaining
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
                    <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-black/30 backdrop-blur-xl shrink-0 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                {Array.from(selectedItemIds).reduce((s, id) => s + (selectedQtys[id] ?? 1), 0)} unit(s) · {selectedItemIds.size} SKU(s)
                            </span>
                            <span className="text-[8px] font-mono text-(--main-color)/70 mt-0.5">
                                → {fmtDims(selectedCrate)} {selectedCrate.type === 'pallet' ? 'pallet' : 'crate'} cm
                            </span>
                        </div>
                        <button
                            onClick={handlePackItems}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                            {selectedCrate.inventory_ids && selectedCrate.inventory_ids.length > 0 ? 'Update Crate Contents' : 'Confirm Pack'}
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
