import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtomValue, useAtom } from 'jotai/react';
import { inventoryAtom, cratesVersionAtom, TOP_BAR_SEARCH_ATOM, exchangeRateAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
    Package, Box, ChevronRight, Check, X, Loader2,
    PackagePlus, ListFilter, Inbox, Video, Maximize2
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

// --- Local Crate type ---
interface CrateRecord {
    id: string;
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
const WireframeCrate: React.FC<{ w?: number; l?: number; h?: number; selected?: boolean }> = ({
    w = 60, l = 60, h = 60, selected = false,
}) => {
    // Normalize dims to max 48px display box
    const maxDim = Math.max(w, l, h, 1);
    const scale = 38 / maxDim;
    const dw = Math.round(w * scale);
    const dl = Math.round(l * scale);
    const dh = Math.round(h * scale);

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

    // Dashed back edges
    const topRight = `${x1 + dx},${y1 + dy}`;
    const topLeft = `${x0 + dx},${y0 + dy}`;
    const topFrontLeft = `${x0},${y0}`;
    const topFrontRight = `${x1},${y1}`;
    const topBack = `${x0 + dx},${y3 + dy}`;
    const bottomBack = `${x2 + dx},${y2 + dy}`;

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
            <line x1={x0} y1={y0} x2={x1} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.4" />
            <line x1={x1} y1={y0} x2={x0} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.4" />
        </svg>
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

// ─── Inventory Row (mirrors Inventory List View) ──────────────────────────────
const PackingInventoryRow: React.FC<{
    item: InventoryItem;
    isSelected: boolean;
    isPacked: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onToggleExpand: () => void;
    exchangeRate: number;
}> = ({ item, isSelected, isPacked, isExpanded, onToggle, onToggleExpand, exchangeRate }) => {
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

    const dimsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('×');
    const weightKg = norm.weightKg ? parseFloat(String(norm.weightKg)) : null;

    return (
        <div className="flex flex-col gap-0">
            <div
                className={`flex items-stretch overflow-hidden border rounded-xl transition-all group shadow-sm cursor-pointer ${
                    isPacked
                        ? 'bg-white/1 border-white/3 opacity-40 cursor-not-allowed'
                        : isSelected
                            ? 'bg-(--main-color)/8 border-(--main-color)/30 ring-1 ring-(--main-color)/20'
                            : 'bg-white/3 border-white/6 hover:border-white/12 hover:bg-white/5'
                }`}
                onClick={() => !isPacked && onToggle()}
            >
                {/* Selection checkbox */}
                <div className="w-10 shrink-0 flex items-center justify-center border-r border-white/5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all border ${
                        isPacked
                            ? 'bg-white/5 border-white/10'
                            : isSelected
                                ? 'bg-(--main-color) border-(--main-color) shadow-md shadow-(--main-color)/30'
                                : 'border-white/15 group-hover:border-white/30'
                    }`}>
                        {(isPacked || isSelected) && <Check size={8} className={isPacked ? 'text-white/30' : 'text-black'} strokeWidth={3} />}
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
                    <div className="flex flex-col min-w-[72px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Price / Qty</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-[12px] font-bold text-white">${itemPriceMXN}</span>
                            <span className="text-[10px] text-white/40 font-mono">×{itemQuantity}</span>
                        </div>
                    </div>

                    {/* AQ Code */}
                    <div className="flex flex-col min-w-[56px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">AQ</span>
                        <span className="text-[11px] text-white/70 font-mono">{calculated.bookAqCode || '—'}</span>
                    </div>

                    {/* Dims */}
                    <div className="flex flex-col min-w-[60px] shrink-0 justify-center h-full gap-0.5">
                        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Dims</span>
                        <span className="text-[10px] text-white/50 font-mono">{dimsCm ? `${dimsCm}cm` : '—'}</span>
                    </div>

                    {weightKg && (
                        <div className="flex flex-col min-w-[50px] shrink-0 justify-center h-full gap-0.5">
                            <span className="text-[7px] font-black text-white/25 uppercase tracking-widest leading-none">Wt</span>
                            <span className="text-[10px] text-white/50 font-mono">{weightKg}kg</span>
                        </div>
                    )}
                </div>

                {/* Right action area */}
                <div className="flex items-center gap-1 px-2 py-2 shrink-0 bg-white/2 border-l border-white/5">
                    {isPacked && <span className="text-[7px] font-black uppercase tracking-widest text-white/20 px-1.5">Packed</span>}
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
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    // Subscribe to RxDB crates
    useEffect(() => {
        if (!db) return;
        const sub = db.logistics.find({ selector: { type: 'crate' } }).$.subscribe((data: any[]) => {
            setCrates(data.map(c => c.toJSON()));
        });
        return () => sub.unsubscribe();
    }, [db, cratesVersion]);

    const selectedCrate = useMemo(() => crates.find(c => c.id === selectedCrateId) ?? null, [crates, selectedCrateId]);

    const packedIds = useMemo(() => {
        if (!selectedCrate?.inventory_ids) return new Set<string>();
        return new Set(selectedCrate.inventory_ids.split(',').filter(Boolean));
    }, [selectedCrate]);

    const allPackedIds = useMemo(() => {
        const ids = new Set<string>();
        crates.forEach(c => {
            if (c.inventory_ids) c.inventory_ids.split(',').filter(Boolean).forEach(id => ids.add(id));
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

    const toggleItem = useCallback((id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
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
        if (!selectedCrate || selectedItemIds.size === 0) return;
        setIsSaving(true);
        const tid = toast.loading(`Packing ${selectedItemIds.size} item(s)…`);
        try {
            const existingIds = selectedCrate.inventory_ids ? selectedCrate.inventory_ids.split(',').filter(Boolean) : [];
            const allIds = [...new Set([...existingIds, ...Array.from(selectedItemIds)])];
            const summary = `${allIds.length} items packed`;
            const updatePayload = { inventory_ids: allIds.join(','), contents_summary: summary, status: 'Partial' as const, updated_at: new Date().toISOString() };

            const { error } = await supabase.from('logistics').update(updatePayload).eq('id', selectedCrate.id);
            if (error) throw error;

            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.patch(updatePayload);
            }

            const idsArr = Array.from(selectedItemIds);
            await supabase.from('inventory').update({ crate_id: selectedCrate.id }).in('id', idsArr);
            if (db) {
                for (const iid of idsArr) {
                    try { const lDoc = await db.inventory.findOne({ selector: { id: iid } }).exec(); if (lDoc) await lDoc.patch({ crate_id: selectedCrate.id }); } catch (_) { }
                }
            }

            toast.success(`${selectedItemIds.size} item(s) packed into ${fmtDims(selectedCrate)} crate`, { id: tid });
            setSelectedItemIds(new Set());
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Packing failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    const availableCrates = crates.filter(c => c.status !== 'Packed');

    return (
        <div className="flex h-full w-full overflow-hidden bg-transparent">

            {/* ── Left Pane: Compact Crate Selector ── */}
            <div className="w-[220px] shrink-0 border-r border-white/5 flex flex-col bg-black/40 backdrop-blur-3xl">
                {/* Header */}
                <div className="px-4 pt-4 pb-2.5 border-b border-white/5 shrink-0">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-(--main-color)">Available Crates</h3>
                    <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">{availableCrates.length} ready to pack</p>
                </div>

                {/* Crate List */}
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 custom-scrollbar">
                    {availableCrates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-3 py-8">
                            <Inbox size={28} className="text-white/20" strokeWidth={1} />
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 max-w-[120px] leading-relaxed">
                                No crates.<br />Create some in the Crates tab.
                            </span>
                        </div>
                    ) : (
                        availableCrates.map(crate => (
                            <CrateSelectCard
                                key={crate.id}
                                crate={crate}
                                isSelected={selectedCrateId === crate.id}
                                onClick={() => { setSelectedCrateId(crate.id); setSelectedItemIds(new Set()); setExpandedIds(new Set()); }}
                            />
                        ))
                    )}
                </div>
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
                                <button onClick={() => setSelectedItemIds(new Set())} className="text-(--main-color)/60 hover:text-(--main-color) cursor-pointer">
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
                                        onClick={() => setSelectedItemIds(new Set(filteredInventory.map(i => String(i.row)).filter(id => !allPackedIds.has(id) || packedIds.has(id))))}
                                        className="text-[8px] font-black uppercase tracking-widest text-(--main-color)/60 hover:text-(--main-color) transition cursor-pointer"
                                    >
                                        Select all visible
                                    </button>
                                )}
                            </div>

                            {filteredInventory.map(item => {
                                const rowId = String(item.row);
                                const isPacked = allPackedIds.has(rowId) && !packedIds.has(rowId);
                                return (
                                    <PackingInventoryRow
                                        key={rowId}
                                        item={item}
                                        isSelected={selectedItemIds.has(rowId)}
                                        isPacked={isPacked}
                                        isExpanded={expandedIds.has(rowId)}
                                        onToggle={() => !isPacked && toggleItem(rowId)}
                                        onToggleExpand={() => toggleExpand(rowId)}
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            {selectedItemIds.size} item(s) → <span className="text-(--main-color)">{fmtDims(selectedCrate)} cm</span>
                        </span>
                        <button
                            onClick={handlePackItems}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                            Confirm Pack
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
