import React, { useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    activeViewAtom, 
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    logisticsSubTabAtom,
    isInventoryViewSliderOpenAtom,
    inventoryViewSliderAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryStatusFilterAtom,
    inventoryAtom,
    inventoryVendorFilterAtom,
    inventoryCategoryFilterAtom,
    inventoryMaterialFilterAtom,
    inventorySortKeyAtom,
    inventorySortOrderAtom,
    isInventoryVendorFilterOpenAtom,
    isInventoryCategoryFilterOpenAtom,
    isInventoryMaterialFilterOpenAtom,
    isInventorySearchOpenAtom,
    inventorySearchTermAtom,
    isUploadWizardOpenAtom
} from '../../lib/atoms';
import { 
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus,
    Printer, Nfc, Package, DollarSign, MoreHorizontal, Copy
} from 'lucide-react';
import { vendors } from '../../lib/consts';

export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const [selectedIds] = useAtom(selectedInventoryIdsAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    
    // View/Filter/Search States
    const [isViewSliderOpen, setIsViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [viewSlider, setViewSlider] = useAtom(inventoryViewSliderAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isSearchOpen, setIsSearchOpen] = useAtom(isInventorySearchOpenAtom);
    const [searchTerm, setSearchTerm] = useAtom(inventorySearchTermAtom);
    const [statusFilter] = useAtom(inventoryStatusFilterAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    
    // Inventory Atoms
    const inventoryItems = useAtomValue(inventoryAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom);
    
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom);

    // Derived active filter lists
    const activeVendors = useMemo(() => Array.from(new Set(inventoryItems.map(i => i.data.itemId?.split('-')[0] || i.data.vendor_id || i.data.vendorId).filter(Boolean))).sort(), [inventoryItems]);
    
    const activeCategories = useMemo(() => {
        const cats = new Set<string>();
        inventoryItems.forEach(i => {
            const d = i.data as any;
            const s = (d.shape || '').trim();
            const desc = (d.shortDescription || d.short_description || '').trim();
            const words = Array.from(new Set(`${s} ${desc}`.toUpperCase().split(/\s+/).filter(Boolean)));
            const full = words.join(' ');
            if (full) cats.add(full);
        });
        return Array.from(cats).sort();
    }, [inventoryItems]);

    const activeMaterials = useMemo(() => {
        const mats = new Set<string>();
        inventoryItems.forEach(i => {
            const d = i.data as any;
            const c = (d.color || '').trim();
            const m = (d.material || '').trim();
            const words = Array.from(new Set(`${c} ${m}`.toUpperCase().split(/\s+/).filter(Boolean)));
            const full = words.join(' ');
            if (full) mats.add(full);
        });
        return Array.from(mats).sort();
    }, [inventoryItems]);

    if (!activeView) return null;

    const isInventory = activeView === 'inventory';
    if (!isInventory) return null;

    return (
        <>
            {/* TOP ATTACHED FILTER ROWS */}
            {(isSearchOpen || isFiltersOpen || isViewSliderOpen) && (
                <div className="w-full bg-black/20 backdrop-blur-xl border-b border-white/5 animate-in slide-in-from-top duration-500 overflow-hidden">
                    <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
                        {/* INVENTORY: SEARCH PANEL */}
                        {isSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all">
                                <Search size={24} strokeWidth={3} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <input 
                                    autoFocus
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="SEARCH INVENTORY..."
                                    className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2">
                                        <X size={24} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* INVENTORY: FILTERS PANEL */}
                        {isFiltersOpen && !isSearchOpen && (
                            <div className="flex flex-col gap-4">
                                {/* VENDOR ROW */}
                                <div className="flex items-center gap-4 w-full">
                                    <Tag size={18} strokeWidth={2.5} className="text-(--main-color) shrink-0" />
                                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                                        <button onClick={() => setVendorFilter(['All'])} className={`text-[12px] font-black uppercase px-3 py-1.5 rounded-lg transition-all shrink-0 ${vendorFilter.includes('All') ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
                                        {activeVendors.map(v => {
                                            const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                                            const isActive = vendorFilter.includes(v);
                                            const handleToggle = () => {
                                                if (vendorFilter.includes('All')) setVendorFilter([v]);
                                                else if (isActive) {
                                                    const next = vendorFilter.filter(item => item !== v);
                                                    setVendorFilter(next.length === 0 ? ['All'] : next);
                                                } else setVendorFilter([...vendorFilter, v]);
                                            };
                                            return (
                                                <button key={v} onClick={handleToggle} className={`text-[12px] font-black uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105 flex items-center gap-2 shrink-0 border border-transparent`} style={{ color: isActive ? vendorColor : 'rgba(255,255,255,0.2)', backgroundColor: isActive ? `${vendorColor}15` : 'transparent', borderColor: isActive ? `${vendorColor}30` : 'transparent' }}>
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vendorColor }} />
                                                    {v}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* TYPE ROW */}
                                <div className="flex items-center gap-4 w-full">
                                    <Layers size={18} strokeWidth={2.5} className="text-(--main-color) shrink-0" />
                                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                                        <button onClick={() => setCategoryFilter('All')} className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-lg transition-all shrink-0 ${categoryFilter === 'All' ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
                                        {activeCategories.map(d => {
                                            const isActive = categoryFilter === d;
                                            return (
                                                <button key={d} onClick={() => setCategoryFilter(isActive ? 'All' : d)} className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105 shrink-0 ${isActive ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/60'}`}>{d}</button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* MATERIAL ROW */}
                                <div className="flex items-center gap-4 w-full">
                                    <Box size={18} strokeWidth={2.5} className="text-(--main-color) shrink-0" />
                                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                                        <button onClick={() => setMaterialFilter('All')} className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-lg transition-all shrink-0 ${materialFilter === 'All' ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
                                        {activeMaterials.map(d => {
                                            const isActive = materialFilter === d;
                                            return (
                                                <button key={d} onClick={() => setMaterialFilter(isActive ? 'All' : d)} className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-lg transition-all hover:scale-105 shrink-0 ${isActive ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/60'}`}>{d}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VIEW SLIDER */}
                        {isViewSliderOpen && !isSearchOpen && !isFiltersOpen && (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-6 w-full">
                                    <SlidersHorizontal size={20} strokeWidth={2.5} className="text-(--main-color) shrink-0" />
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={viewSlider} 
                                        onChange={(e) => setViewSlider(parseInt(e.target.value))}
                                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-(--main-color)"
                                    />
                                    <span className="text-xl font-black text-white w-12 text-right font-mono">{viewSlider}%</span>
                                </div>

                                <div className="flex items-center gap-6 w-full">
                                    <ArrowUpDown size={20} strokeWidth={2.5} className="text-(--main-color) shrink-0" />
                                    <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
                                        {[{ key: 'Date', label: 'DATE' }, { key: 'Status', label: 'STATUS' }, { key: 'Vendor', label: 'VENDOR' }, { key: 'Number', label: '#' }].map((o) => (
                                            <button key={o.key}
                                                onClick={() => sortKey === o.key ? setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') : setSortKey(o.key as any)}
                                                className={`text-[12px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 hover:scale-110 ${sortKey === o.key ? 'text-white shadow-lg' : 'text-white/20 hover:text-white'}`}>
                                                {o.label}
                                                {sortKey === o.key && (
                                                    <div className="flex flex-col -space-y-1 text-(--main-color)">
                                                        <ChevronRight size={10} strokeWidth={4} className={`-rotate-90 ${sortOrder === 'asc' ? 'opacity-100' : 'opacity-20'}`} />
                                                        <ChevronRight size={10} strokeWidth={4} className={`rotate-90 ${sortOrder === 'desc' ? 'opacity-100' : 'opacity-20'}`} />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SELECTION WORKFLOW DOCK (Attached to bottom) */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-[1000] animate-in slide-in-from-bottom duration-500">
                    <div className="bg-black/10 backdrop-blur-3xl border-t border-white/5 px-10 py-6 flex items-center justify-between shadow-[0_-20px_80px_rgba(0,0,0,0.4)]">
                        <div className="flex items-center gap-6 group transition-all">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/20 tracking-[0.5em] leading-none mb-1">RECORD_SELECTION</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-(--main-color) font-black text-4xl leading-none drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]">
                                        {selectedIds.length}
                                    </span>
                                    <span className="text-[14px] font-black text-white/40 tracking-widest uppercase">ITEMS</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-14 pr-4">
                            <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Print Labels">
                                <Printer size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PRINT</span>
                            </button>
                            <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Write NFC">
                                <Nfc size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">NFC</span>
                            </button>
                            <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Pack Items">
                                <Package size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PACK</span>
                            </button>
                            <button className="text-white/40 hover:text-green-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Payment Workflow">
                                <DollarSign size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PAY</span>
                            </button>
                            <button className="text-white/40 hover:text-(--main-color) transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Manage Tags">
                                <Tag size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">TAGS</span>
                            </button>
                            <button className="text-white/40 hover:text-blue-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Copy Tag IDs">
                                <Copy size={34} strokeWidth={2} />
                                <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">COPY</span>
                            </button>
                            
                            <div className="w-px h-12 bg-white/10 mx-2" />
                            
                            <button className="text-white/20 hover:text-white transition-all hover:rotate-90 p-0 bg-transparent border-none outline-none">
                                <MoreHorizontal size={34} strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
