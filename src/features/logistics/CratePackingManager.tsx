import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtomValue, useAtom } from 'jotai/react';
import { inventoryAtom, cratesVersionAtom, inventoryAtom as allInventoryAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    Search, Package, Box, ChevronRight, Check, X, Loader2,
    PackagePlus, Filter, LayoutGrid, ListFilter, Inbox
} from 'lucide-react';
import { InventoryItem } from '../../lib/Types';

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
    updated_at?: string;
}

// --- Helpers ---
const fmtDims = (c: CrateRecord) =>
    `${c.width_cm ?? '?'}×${c.length_cm ?? '?'}×${c.height_cm ?? '?'} cm`;

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

// --- Inventory Item Row ---
const InventoryRow = ({
    item,
    isSelected,
    isPacked,
    onToggle,
}: {
    item: InventoryItem;
    isSelected: boolean;
    isPacked: boolean;
    onToggle: () => void;
}) => {
    const d = item.data;
    const vendorId = d.vendor_id || d.vendorId;
    return (
        <button
            onClick={onToggle}
            disabled={isPacked}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border transition-all duration-200 text-left cursor-pointer group ${isPacked
                    ? 'bg-white/2 border-white/5 opacity-40 cursor-not-allowed'
                    : isSelected
                        ? 'bg-(--main-color)/8 border-(--main-color)/30 shadow-lg shadow-(--main-color)/5'
                        : 'bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5'
                }`}
        >
            {/* Select indicator */}
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all border ${isPacked ? 'bg-white/5 border-white/10' : isSelected ? 'bg-(--main-color) border-(--main-color)' : 'border-white/15 group-hover:border-white/30'}`}>
                {isPacked ? <Check size={10} className="text-white/30" /> : isSelected ? <Check size={10} className="text-black" strokeWidth={3} /> : null}
            </div>

            {/* Item info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/30 shrink-0">
                        {d.item_id || d.itemId || String(item.row).slice(0, 8)}
                    </span>
                    {vendorId && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-(--main-color)/60 shrink-0">{vendorId}</span>
                    )}
                </div>
                <p className="text-[11px] font-medium text-white/80 truncate leading-tight mt-0.5">
                    {d.description || d.shortDescription || 'No description'}
                </p>
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[8px] text-white/25 font-mono uppercase">{d.material}</span>
                    {d.quantity && <span className="text-[8px] text-white/25 font-mono">QTY: {d.quantity}</span>}
                    {d.price_mxn && <span className="text-[8px] text-(--main-color)/50 font-mono">${Number(d.price_mxn).toLocaleString()}</span>}
                </div>
            </div>

            {isPacked && <span className="text-[8px] font-black uppercase tracking-widest text-white/20 shrink-0">Packed</span>}
        </button>
    );
};

// --- Main Component ---
export const CratePackingManager: React.FC = () => {
    const db = useDatabase();
    const allInventory = useAtomValue(allInventoryAtom);
    const [cratesVersion, setCratesVersion] = useAtom(cratesVersionAtom);

    // Crates state
    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);

    // Inventory filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Acquisition' | 'Production' | 'Shipped'>('All');
    const [vendorFilter, setVendorFilter] = useState('All');
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

    // Saving state
    const [isSaving, setIsSaving] = useState(false);

    // Subscribe to RxDB crates
    useEffect(() => {
        if (!db) return;
        const sub = db.logistics.find({ selector: { type: 'crate' } }).$.subscribe((data: any[]) => {
            setCrates(data.map(c => c.toJSON()));
        });
        return () => sub.unsubscribe();
    }, [db, cratesVersion]);

    // Selected crate
    const selectedCrate = useMemo(() =>
        crates.find(c => c.id === selectedCrateId) ?? null,
        [crates, selectedCrateId]
    );

    // Items already in this crate
    const packedIds = useMemo(() => {
        if (!selectedCrate?.inventory_ids) return new Set<string>();
        return new Set(selectedCrate.inventory_ids.split(',').filter(Boolean));
    }, [selectedCrate]);

    // All packed IDs across crates (for marking items)
    const allPackedIds = useMemo(() => {
        const ids = new Set<string>();
        crates.forEach(c => {
            if (c.inventory_ids) c.inventory_ids.split(',').filter(Boolean).forEach(id => ids.add(id));
        });
        return ids;
    }, [crates]);

    // Unique vendors
    const vendorOptions = useMemo(() => {
        const vs = new Set<string>();
        allInventory.forEach(i => {
            const v = i.data.vendor_id || i.data.vendorId;
            if (v) vs.add(v);
        });
        return ['All', ...Array.from(vs)];
    }, [allInventory]);

    // Filter inventory
    const filteredInventory = useMemo(() => {
        const q = search.toLowerCase();
        return allInventory.filter(i => {
            const d = i.data;
            const statusMatch = statusFilter === 'All' || (d.status || '').toLowerCase() === statusFilter.toLowerCase();
            const vendorId = d.vendor_id || d.vendorId;
            const vendorMatch = vendorFilter === 'All' || vendorId === vendorFilter;
            const searchMatch = !q
                || (d.description || '').toLowerCase().includes(q)
                || (d.item_id || d.itemId || '').toLowerCase().includes(q)
                || (d.material || '').toLowerCase().includes(q)
                || String(d.item_number || '').toLowerCase().includes(q);
            return statusMatch && vendorMatch && searchMatch;
        });
    }, [allInventory, search, statusFilter, vendorFilter]);

    // Toggle item selection
    const toggleItem = useCallback((id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Pack selected items into crate
    const handlePackItems = async () => {
        if (!selectedCrate || selectedItemIds.size === 0) return;
        setIsSaving(true);
        const tid = toast.loading(`Packing ${selectedItemIds.size} item(s)…`);
        try {
            const existingIds = selectedCrate.inventory_ids
                ? selectedCrate.inventory_ids.split(',').filter(Boolean)
                : [];
            const allIds = [...new Set([...existingIds, ...Array.from(selectedItemIds)])];
            const isPacked = allIds.length >= 1; // Mark as Partial or Packed by convention
            const summary = `${allIds.length} items packed`;

            const updatePayload = {
                inventory_ids: allIds.join(','),
                contents_summary: summary,
                status: 'Partial' as const,
                updated_at: new Date().toISOString(),
            };

            // Update in Supabase
            const { error } = await supabase.from('logistics').update(updatePayload).eq('id', selectedCrate.id);
            if (error) throw error;

            // Update in local RxDB
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: selectedCrate.id } }).exec();
                if (localCrate) await localCrate.patch(updatePayload);
            }

            // Mark items with crate_id in inventory
            const idsArr = Array.from(selectedItemIds);
            await supabase.from('inventory').update({ crate_id: selectedCrate.id }).in('id', idsArr);
            if (db) {
                for (const iid of idsArr) {
                    try {
                        const lDoc = await db.inventory.findOne({ selector: { id: iid } }).exec();
                        if (lDoc) await lDoc.patch({ crate_id: selectedCrate.id });
                    } catch (_) { /* */ }
                }
            }

            toast.success(`${selectedItemIds.size} item(s) packed into crate ${selectedCrate.id.slice(0, 8).toUpperCase()}`, { id: tid });
            setSelectedItemIds(new Set());
            setCratesVersion(v => v + 1);
        } catch (err: any) {
            toast.error(err.message || 'Packing failed.', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-transparent">

            {/* ── Left Pane: Crate Selection ── */}
            <div className="w-[300px] shrink-0 border-r border-white/5 flex flex-col bg-black/30 backdrop-blur-3xl">
                <div className="px-5 pt-5 pb-3 border-b border-white/5">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-(--main-color)">Available Crates</h3>
                    <p className="text-[8px] font-black text-white/25 uppercase tracking-[0.25em] mt-0.5">Select empty crate to pack</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
                    {crates.filter(c => c.status !== 'Packed').length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4 py-12">
                            <Inbox size={36} className="text-white/20" strokeWidth={1} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 max-w-[160px] leading-relaxed">
                                No empty crates.<br />Go to Crates tab to create some.
                            </span>
                        </div>
                    ) : (
                        crates.filter(c => c.status !== 'Packed').map(crate => {
                            const isSelected = selectedCrateId === crate.id;
                            const packedCount = crate.inventory_ids ? crate.inventory_ids.split(',').filter(Boolean).length : 0;
                            return (
                                <button
                                    key={crate.id}
                                    onClick={() => { setSelectedCrateId(crate.id); setSelectedItemIds(new Set()); }}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left cursor-pointer group ${isSelected ? 'bg-(--main-color)/10 border-(--main-color)/30' : 'bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5'}`}
                                >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(crate.status)}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-mono text-white/40 truncate">{crate.id.slice(0, 10).toUpperCase()}</p>
                                        <p className="text-[11px] font-black text-white truncate leading-tight mt-0.5">{fmtDims(crate)}</p>
                                        <p className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${statusText(crate.status)}`}>
                                            {crate.status} · {packedCount} items
                                        </p>
                                    </div>
                                    <ChevronRight size={12} className={`shrink-0 transition-all ${isSelected ? 'text-(--main-color)' : 'text-white/20 group-hover:text-white/40'}`} />
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Right Pane: Inventory Selection ── */}
            <div className="flex-1 flex flex-col min-w-0 bg-black/10">
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedCrate ? (
                            <div className="flex items-center gap-2">
                                <Box size={14} className="text-(--main-color)" />
                                <div>
                                    <p className="text-[11px] font-black text-white uppercase tracking-widest">
                                        {fmtDims(selectedCrate)}
                                    </p>
                                    <p className="text-[8px] font-mono text-white/30">{selectedCrate.id.slice(0, 12).toUpperCase()}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-white/25">
                                <PackagePlus size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Select a crate first</span>
                            </div>
                        )}

                        {selectedItemIds.size > 0 && selectedCrate && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-(--main-color)/10 border border-(--main-color)/20 rounded-xl">
                                <span className="text-[10px] font-black text-(--main-color)">{selectedItemIds.size} selected</span>
                                <button onClick={() => setSelectedItemIds(new Set())} className="text-(--main-color)/60 hover:text-(--main-color) cursor-pointer">
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                            <input
                                type="text"
                                placeholder="SEARCH ARTIFACTS…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-[10px] font-mono text-white uppercase tracking-widest outline-none focus:border-white/20 transition w-44"
                            />
                        </div>

                        {/* Status filter */}
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as any)}
                            className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 outline-none cursor-pointer focus:border-white/20 transition appearance-none"
                        >
                            {['All', 'Acquisition', 'Production', 'Shipped'].map(s => (
                                <option key={s} value={s} className="bg-black text-white">{s}</option>
                            ))}
                        </select>

                        {/* Vendor filter */}
                        <select
                            value={vendorFilter}
                            onChange={e => setVendorFilter(e.target.value)}
                            className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 outline-none cursor-pointer focus:border-white/20 transition appearance-none"
                        >
                            {vendorOptions.map(v => (
                                <option key={v} value={v} className="bg-black text-white">{v}</option>
                            ))}
                        </select>

                        {/* Pack Action */}
                        <button
                            onClick={handlePackItems}
                            disabled={!selectedCrate || selectedItemIds.size === 0 || isSaving}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!selectedCrate || selectedItemIds.size === 0 || isSaving) ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95 shadow-lg shadow-(--main-color)/20 cursor-pointer'}`}
                        >
                            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
                            Pack {selectedItemIds.size > 0 ? selectedItemIds.size : ''} Item{selectedItemIds.size !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>

                {/* Inventory list */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!selectedCrate ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4">
                            <Package size={44} className="text-white/15" strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 max-w-xs leading-loose">
                                Inventory routing suspended.<br />
                                Select a destination crate to activate artifact selection.
                            </p>
                        </div>
                    ) : filteredInventory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-40 gap-4">
                            <ListFilter size={40} className="text-white/15" strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">No items match the current filters.</p>
                        </div>
                    ) : (
                        <div className="p-5 flex flex-col gap-2">
                            {/* Stats bar */}
                            <div className="flex items-center justify-between mb-1 px-1">
                                <span className="text-[8px] font-black uppercase tracking-widest text-white/25">{filteredInventory.length} artifacts</span>
                                {selectedItemIds.size > 0 && (
                                    <button
                                        onClick={() => setSelectedItemIds(new Set(filteredInventory.map(i => String(i.row)).filter(id => !allPackedIds.has(id))))}
                                        className="text-[8px] font-black uppercase tracking-widest text-(--main-color)/70 hover:text-(--main-color) transition cursor-pointer"
                                    >
                                        Select all visible
                                    </button>
                                )}
                            </div>
                            {filteredInventory.map(item => {
                                const rowId = String(item.row);
                                const isPacked = allPackedIds.has(rowId) && !packedIds.has(rowId);
                                return (
                                    <InventoryRow
                                        key={rowId}
                                        item={item}
                                        isSelected={selectedItemIds.has(rowId)}
                                        isPacked={isPacked}
                                        onToggle={() => !isPacked && toggleItem(rowId)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Pack summary bar */}
                {selectedCrate && selectedItemIds.size > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-black/30 backdrop-blur-xl shrink-0 animate-in slide-in-from-bottom-2 duration-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            {selectedItemIds.size} item(s) ready to pack into <span className="text-(--main-color)">{fmtDims(selectedCrate)}</span>
                        </span>
                        <button
                            onClick={handlePackItems}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
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
            `}</style>
        </div>
    );
};
