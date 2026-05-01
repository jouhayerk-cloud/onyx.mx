
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    isPackingCrateWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    themeAtom
} from '../../lib/atoms';
import { 
    X, Box, Package, ChevronRight, Search, Check, 
    ArrowUpRight, Info, Loader2, PackagePlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

export const PackingWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingCrateWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    
    const [crates, setCrates] = useState<any[]>([]);
    const [isLoadingCrates, setIsLoadingCrates] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
    const [isPacking, setIsPacking] = useState(false);

    const selectedItems = useMemo(() => {
        return inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            return { ...item, normData: normalizeInventoryData(item.data) };
        });
    }, [inventory, selectedIds]);

    const fetchCrates = async () => {
        setIsLoadingCrates(true);
        try {
            const { data, error } = await supabase
                .from('crates')
                .select('*')
                .order('updated_at', { ascending: false });
            if (error) throw error;
            setCrates(data || []);
        } catch (e: any) {
            toast.error(`Failed to load crates: ${e.message}`);
        } finally {
            setIsLoadingCrates(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchCrates();
        }
    }, [isOpen]);

    const filteredCrates = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return crates;
        return crates.filter(c => 
            (c.id || '').toLowerCase().includes(term) || 
            (c.description || '').toLowerCase().includes(term) ||
            (c.contents_summary || '').toLowerCase().includes(term)
        );
    }, [crates, searchTerm]);

    const handlePack = async () => {
        if (!selectedCrateId) return;
        setIsPacking(true);
        const tid = toast.loading('Packing items into crate...');

        try {
            const targetCrate = crates.find(c => c.id === selectedCrateId);
            if (!targetCrate) throw new Error('Target crate not found');

            // Parse existing inventory_ids
            const existingIdsRaw = targetCrate.inventory_ids || '';
            const existingIdList = existingIdsRaw.split(',').filter(Boolean);
            
            // Add new IDs (only if not already there, or handle quantities)
            // For now, let's just append the new IDs
            const newIds = selectedItems.map(item => String(item.row));
            const updatedIdList = Array.from(new Set([...existingIdList, ...newIds]));
            const updatedIdsRaw = updatedIdList.join(',');

            const { error } = await supabase
                .from('crates')
                .update({ 
                    inventory_ids: updatedIdsRaw,
                    status: 'Packed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedCrateId);

            if (error) throw error;

            toast.success(`Packed ${selectedItems.length} items into ${selectedCrateId}`, { id: tid });
            setIsOpen(false);
        } catch (e: any) {
            toast.error(`Packing failed: ${e.message}`, { id: tid });
        } finally {
            setIsPacking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-4xl glass-panel rounded-[3rem] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-8 pb-4 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                            <PackagePlus className="text-(--main-color)" />
                            Packing Wizard
                        </h3>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mt-1">Assigning {selectedItems.length} items to a container</p>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"><X size={24} /></button>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Left Panel: Selected Items Summary */}
                    <div className="w-1/3 border-r border-white/5 p-8 overflow-y-auto no-scrollbar bg-black/20">
                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6">Selected Items</h4>
                        <div className="space-y-4">
                            {selectedItems.map(item => (
                                <div key={item.row} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <div className="w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0">
                                        <img src={getCleanImageUrl(item.normData.mediaUrls?.split(',')[0])} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-white truncate uppercase">{item.normData.shape} {item.normData.shortDescription}</p>
                                        <p className="text-[8px] text-white/40 font-bold uppercase tracking-tighter">QTY: {item.normData.quantity || 1}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Panel: Crate Selection */}
                    <div className="flex-1 flex flex-col min-w-0 p-8">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input 
                                type="text"
                                placeholder="Search containers by ID or description..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:border-(--main-color)/50 transition-all font-bold"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-2">
                            {isLoadingCrates ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-20">
                                    <Loader2 className="animate-spin" size={32} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Scanning Registry...</span>
                                </div>
                            ) : filteredCrates.length === 0 ? (
                                <div className="text-center py-20 opacity-30">
                                    <p className="text-sm font-bold uppercase tracking-widest">No matching containers found</p>
                                </div>
                            ) : (
                                filteredCrates.map(crate => (
                                    <div 
                                        key={crate.id}
                                        onClick={() => setSelectedCrateId(crate.id)}
                                        className={`p-5 rounded-[2rem] border transition-all cursor-pointer group flex items-center justify-between ${
                                            selectedCrateId === crate.id 
                                                ? 'bg-(--main-color)/10 border-(--main-color) shadow-[0_0_20px_rgba(var(--main-color-rgb),0.1)]' 
                                                : 'bg-white/5 border-white/10 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                                                selectedCrateId === crate.id ? 'bg-(--main-color) text-black' : 'bg-white/5 text-white/20 group-hover:text-white/40'
                                            }`}>
                                                <Box size={28} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h5 className="text-sm font-black text-white uppercase tracking-tight">{crate.id}</h5>
                                                    <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                                                        crate.status === 'Empty' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                                    }`}>
                                                        {crate.status}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter mt-1 truncate max-w-[200px]">
                                                    {crate.description || 'No description provided'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="text-[9px] font-mono font-bold text-white/20">
                                                {crate.width_cm}×{crate.length_cm}×{crate.height_cm} CM
                                            </span>
                                            {selectedCrateId === crate.id && <Check className="text-(--main-color)" size={20} />}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 pt-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 text-white/20 text-[10px] font-black uppercase tracking-widest">
                        <Info size={14} />
                        Items will be appended to container manifest
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="px-8 h-14 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handlePack}
                            disabled={!selectedCrateId || isPacking}
                            className="px-10 h-14 rounded-full bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 flex items-center gap-3 shadow-xl"
                        >
                            {isPacking ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                            Confirm Packing
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
