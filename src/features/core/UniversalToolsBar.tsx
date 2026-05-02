import React, { useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
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
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus
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
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[600] flex flex-col items-center gap-6 pointer-events-none w-full max-w-fit px-6">
            
            {/* EXPANDED PANELS (Slide up above the dock) */}
            <div className="flex flex-col gap-4 w-full max-w-5xl pointer-events-auto">
                {/* INVENTORY: SEARCH PANEL */}
                {isSearchOpen && (
                    <div className="bg-black/60 backdrop-blur-3xl rounded-3xl p-8 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-6 group transition-all">
                            <Search size={32} strokeWidth={4} className="text-(--main-color) drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.7)]" />
                            <input 
                                autoFocus
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="SEARCH INVENTORY..."
                                className="bg-transparent border-none text-white text-4xl font-black placeholder:text-white/20 outline-none w-full tracking-tighter"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2">
                                    <X size={32} strokeWidth={4} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* INVENTORY: FILTERS PANEL */}
                {isFiltersOpen && !isSearchOpen && (
                    <div className="bg-black/60 backdrop-blur-3xl rounded-3xl p-6 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-500 flex flex-col gap-6">
                        {/* FILTER LAUNCHERS - ICONS ONLY */}
                        <div className="flex items-center justify-center gap-12 pb-4 border-b border-white/5">
                            <button onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)} className={`transition-all hover:scale-125 ${isVendorFilterOpen ? 'text-(--main-color) drop-shadow-[0_0_15px_white]' : 'text-white/40'}`}>
                                <Tag size={24} strokeWidth={3} />
                            </button>
                            <button onClick={() => setIsCategoryOpen(!isCategoryOpen)} className={`transition-all hover:scale-125 ${isCategoryOpen ? 'text-(--main-color) drop-shadow-[0_0_15px_white]' : 'text-white/40'}`}>
                                <Layers size={24} strokeWidth={3} />
                            </button>
                            <button onClick={() => setIsMaterialOpen(!isMaterialOpen)} className={`transition-all hover:scale-125 ${isMaterialOpen ? 'text-(--main-color) drop-shadow-[0_0_15px_white]' : 'text-white/40'}`}>
                                <Box size={24} strokeWidth={3} />
                            </button>
                        </div>

                        {/* VENDOR ROW */}
                        {isVendorFilterOpen && (
                            <div className="flex items-center gap-6 w-full animate-in fade-in duration-300">
                                <Tag size={20} strokeWidth={3} className="text-(--main-color) shrink-0" />
                                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
                                    <button onClick={() => setVendorFilter(['All'])} className={`text-[18px] font-black uppercase px-4 py-2 transition-all shrink-0 ${vendorFilter.includes('All') ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
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
                                            <button key={v} onClick={handleToggle} className={`text-[18px] font-black uppercase px-4 py-2 transition-all hover:scale-110 flex items-center gap-3 shrink-0`} style={{ color: isActive ? vendorColor : '#444444', textShadow: isActive ? `0 0 15px ${vendorColor}` : 'none' }}>
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isActive ? vendorColor : '#333333' }} />
                                                {v}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* TYPE ROW */}
                        {isCategoryOpen && (
                            <div className="flex items-center gap-6 w-full animate-in fade-in duration-300">
                                <Layers size={20} strokeWidth={3} className="text-(--main-color) shrink-0" />
                                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
                                    <button onClick={() => setCategoryFilter('All')} className={`text-[16px] font-black uppercase px-4 py-2 transition-all shrink-0 ${categoryFilter === 'All' ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
                                    {activeCategories.map(d => {
                                        const isActive = categoryFilter === d;
                                        return (
                                            <button key={d} onClick={() => setCategoryFilter(isActive ? 'All' : d)} className={`text-[16px] font-black uppercase px-4 py-2 transition-all hover:scale-110 shrink-0 ${isActive ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white/60'}`}>{d}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* MATERIAL ROW */}
                        {isMaterialOpen && (
                            <div className="flex items-center gap-6 w-full animate-in fade-in duration-300">
                                <Box size={20} strokeWidth={3} className="text-(--main-color) shrink-0" />
                                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
                                    <button onClick={() => setMaterialFilter('All')} className={`text-[16px] font-black uppercase px-4 py-2 transition-all shrink-0 ${materialFilter === 'All' ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white/60'}`}>ALL</button>
                                    {activeMaterials.map(d => {
                                        const isActive = materialFilter === d;
                                        return (
                                            <button key={d} onClick={() => setMaterialFilter(isActive ? 'All' : d)} className={`text-[16px] font-black uppercase px-4 py-2 transition-all hover:scale-110 shrink-0 ${isActive ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white/60'}`}>{d}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW SLIDER */}
                {isViewSliderOpen && !isSearchOpen && !isFiltersOpen && (
                    <div className="bg-black/60 backdrop-blur-3xl rounded-3xl p-8 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-500 flex flex-col gap-6">
                        <div className="flex items-center gap-8 w-full">
                            <SlidersHorizontal size={24} strokeWidth={3} className="text-(--main-color) shrink-0" />
                            <input 
                                type="range" min="0" max="100" 
                                value={viewSlider} 
                                onChange={(e) => setViewSlider(parseInt(e.target.value))}
                                className="flex-1 h-3 bg-white/10 rounded-lg appearance-none cursor-pointer accent-(--main-color)"
                            />
                            <span className="text-3xl font-black text-white w-20 text-right font-mono">{viewSlider}%</span>
                        </div>

                        <div className="flex items-center gap-8 w-full">
                            <ArrowUpDown size={24} strokeWidth={3} className="text-(--main-color) shrink-0" />
                            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
                                {[{ key: 'Date', label: 'DATE' }, { key: 'Status', label: 'STATUS' }, { key: 'Vendor', label: 'VENDOR' }, { key: 'Number', label: '#' }].map((o) => (
                                    <button key={o.key}
                                        onClick={() => sortKey === o.key ? setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') : setSortKey(o.key as any)}
                                        className={`text-[18px] font-black uppercase tracking-widest transition-all flex items-center gap-3 hover:scale-110 ${sortKey === o.key ? 'text-white drop-shadow-[0_0_12px_white]' : 'text-white/20 hover:text-white'}`}>
                                        {o.label}
                                        {sortKey === o.key && (
                                            <div className="flex flex-col -space-y-1 text-(--main-color)">
                                                <ChevronRight size={12} strokeWidth={4} className={`-rotate-90 ${sortOrder === 'asc' ? 'opacity-100' : 'opacity-20'}`} />
                                                <ChevronRight size={12} strokeWidth={4} className={`rotate-90 ${sortOrder === 'desc' ? 'opacity-100' : 'opacity-20'}`} />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MAIN DOCK (Icons Only) */}
            <div className="bg-black/60 backdrop-blur-3xl rounded-full p-2 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-2 pointer-events-auto">
                <div className="flex items-center gap-1 px-4">
                    <button 
                        onClick={() => { setIsViewSliderOpen(!isViewSliderOpen); setIsFiltersOpen(false); setIsSearchOpen(false); }}
                        className={`p-4 rounded-full transition-all duration-300 hover:scale-125 ${isViewSliderOpen ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <SlidersHorizontal size={28} strokeWidth={2.5} />
                    </button>
                    <button 
                        onClick={() => { setIsFiltersOpen(!isFiltersOpen); setIsViewSliderOpen(false); setIsSearchOpen(false); }}
                        className={`p-4 rounded-full transition-all duration-300 hover:scale-125 ${isFiltersOpen ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <Filter size={28} strokeWidth={2.5} />
                    </button>
                    <button 
                        onClick={() => { setIsSearchOpen(!isSearchOpen); setIsFiltersOpen(false); setIsViewSliderOpen(false); }}
                        className={`p-4 rounded-full transition-all duration-300 hover:scale-125 ${isSearchOpen || searchTerm ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <Search size={28} strokeWidth={2.5} />
                    </button>
                    
                    <div className="w-px h-8 bg-white/10 mx-2" />

                    <button 
                        onClick={() => setIsSelectionMode(!isSelectionMode)}
                        className={`p-4 rounded-full transition-all duration-300 hover:scale-125 ${isSelectionMode ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <SquareCheckBig size={28} strokeWidth={2.5} />
                    </button>
                    <button 
                        onClick={() => setIsUploadWizardOpen(true)}
                        className="p-4 rounded-full transition-all duration-300 text-(--main-color) hover:text-white hover:scale-125"
                    >
                        <Plus size={32} strokeWidth={3} className="drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                    </button>
                </div>
            </div>
        </div>
    );
};
