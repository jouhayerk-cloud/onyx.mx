import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    isPackingCrateWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    exchangeRateAtom,
} from '../../lib/atoms';
import { X, ChevronRight, Search, Info, Loader2, PackagePlus, ArrowLeft, Layers, Weight, Maximize2, Zap, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { normalizeInventoryData, getCleanImageUrl, calculateCodesAndPrices, getCrateInternalVolume, getItemPaddedVolume } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeCrate } from '../../components/CrateVisuals';

type WizardStep = 'SELECT_CRATE' | 'REVIEW_PACK';

interface CrateRecord {
    id: string;
    type?: string;
    status: 'Empty' | 'Packed' | 'Partial' | 'In Transit';
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    weight_kg?: number;
    inventory_ids?: string;
    contents_summary?: string;
    description?: string;
    updated_at?: string;
    sent_date?: string;
}

// Derive vendor color from prefix code
function getVendorColor(prefix: string): string {
    return (vendors as any)[prefix]?.color || '#555';
}

function getVendorName(prefix: string): string {
    return (vendors as any)[prefix]?.name || prefix;
}

// Extract vendor prefixes from a crate's inventory_ids using inventory lookup
function getCrateVendors(crate: CrateRecord, allInventory: any[]): { prefix: string; color: string; name: string }[] {
    if (!crate.inventory_ids) return [];
    const seen = new Set<string>();
    const result: { prefix: string; color: string; name: string }[] = [];
    crate.inventory_ids.split(',').filter(Boolean).forEach(entry => {
        const [id] = entry.split(':');
        const inv = allInventory.find((i: any) => String(i.row) === id);
        if (inv?.data) {
            const norm = normalizeInventoryData(inv.data);
            const raw = (norm.itemId || norm.tag_id || '').toUpperCase();
            // Try longest prefix first
            const keys = Object.keys(vendors).sort((a, b) => b.length - a.length);
            for (const k of keys) {
                if (raw.startsWith(k) && !seen.has(k)) {
                    seen.add(k);
                    result.push({ prefix: k, color: getVendorColor(k), name: getVendorName(k) });
                    break;
                }
            }
        }
    });
    return result;
}

function getTextContrast(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#000' : '#fff';
}

function CheckCircle2(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

export const PackWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingCrateWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);

    const [step, setStep] = useState<WizardStep>('SELECT_CRATE');
    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [isLoadingCrates, setIsLoadingCrates] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCrate, setSelectedCrate] = useState<CrateRecord | null>(null);
    const [isPacking, setIsPacking] = useState(false);

    const selectedItems = useMemo(() =>
        inventory.filter(item => selectedIds.includes(item.row)).map(item => {
            const norm = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(item.data, exchangeRate, '326');
            return { ...item, norm, codes };
        }),
        [inventory, selectedIds, exchangeRate]
    );

    const fetchCrates = async () => {
        setIsLoadingCrates(true);
        try {
            const { data, error } = await supabase.from('logistics').select('*').order('updated_at', { ascending: false });
            if (error) throw error;
            setCrates(data || []);
        } catch (e: any) {
            toast.error(`Failed to load containers: ${e.message}`);
        } finally {
            setIsLoadingCrates(false);
        }
    };

    useEffect(() => {
        if (isOpen) { fetchCrates(); setStep('SELECT_CRATE'); setSelectedCrate(null); }
    }, [isOpen]);

    const filteredCrates = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        // Only show Empty and Partial — Packed and In Transit (deployed) are locked
        return crates
            .filter(c => c.status === 'Empty' || c.status === 'Partial')
            .filter(c => !c.sent_date)  // exclude deployed crates
            .filter(c => !term ||
                (c.id || '').toLowerCase().includes(term) ||
                (c.description || '').toLowerCase().includes(term) ||
                (c.contents_summary || '').toLowerCase().includes(term)
            );
    }, [crates, searchTerm]);

    const logisticsMetrics = useMemo(() => {
        if (!selectedCrate) return null;
        const internalVol = getCrateInternalVolume(selectedCrate);
        let existingVol = 0, existingWeight = 0;
        const existingIds = (selectedCrate.inventory_ids || '').split(',').filter(Boolean);
        existingIds.forEach(entry => {
            const [id, qtyStr] = entry.split(':');
            const qty = qtyStr ? parseInt(qtyStr) : 1;
            const inv = inventory.find(i => String(i.row) === id);
            if (inv) {
                existingVol += getItemPaddedVolume(inv.data, qty);
                existingWeight += (Number(normalizeInventoryData(inv.data).weightKg) || 0) * qty;
            }
        });
        const newVol = selectedItems.reduce((acc, item) => acc + getItemPaddedVolume(item.data, 1), 0);
        const newWeight = selectedItems.reduce((acc, item) => acc + (Number(item.norm.weightKg) || 0), 0);
        const totalVol = existingVol + newVol;
        const totalWeight = existingWeight + newWeight;
        const fillPct = internalVol > 0 ? (totalVol / internalVol) * 100 : 0;
        return { internalVol, totalVol, fillPct, totalWeight, itemCount: existingIds.length + selectedItems.length };
    }, [selectedCrate, selectedItems, inventory]);

    const handleConfirmPack = async () => {
        if (!selectedCrate) return;
        setIsPacking(true);
        const tid = toast.loading('Synchronizing container manifest...');
        try {
            const existingIds = (selectedCrate.inventory_ids || '').split(',').filter(Boolean);
            const newIds = selectedItems.map(item => String(item.row));
            const updatedIds = [...existingIds, ...newIds].join(',');
            const { error } = await supabase.from('logistics').update({
                inventory_ids: updatedIds, status: 'Packed', updated_at: new Date().toISOString()
            }).eq('id', selectedCrate.id);
            if (error) throw error;
            toast.success(`Packed ${selectedItems.length} items into ${selectedCrate.id}`, { id: tid });
            setIsOpen(false);
        } catch (e: any) {
            toast.error(`Packing failed: ${e.message}`, { id: tid });
        } finally {
            setIsPacking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[20000] flex flex-col pointer-events-none animate-in fade-in duration-500 overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-[120px] bg-black/40 pointer-events-auto" onClick={() => setIsOpen(false)} />
            <div className="relative w-full h-full flex flex-col pointer-events-auto overflow-hidden">

            {/* Background branding */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.015]">
                <OnyxMiniLogo className="w-[900px] h-[900px]" />
            </div>

            {/* Floating close */}
            <button
                onClick={() => setIsOpen(false)}
                className="fixed top-4 right-4 md:top-8 md:right-8 z-[20002] w-14 h-14 md:w-20 md:h-20 rounded-full bg-white/10 backdrop-blur-3xl border border-white/20 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/20 hover:scale-110 transition-all active:scale-90 group pointer-events-auto"
            >
                <X size={36} className="group-hover:rotate-90 transition-transform duration-500" strokeWidth={1} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-5 px-8 md:px-16 pt-8 pb-4 shrink-0 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                    {step === 'SELECT_CRATE' ? <LayoutGrid size={28} /> : <PackagePlus size={28} />}
                </div>
                <div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">PackWizard</h2>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] mt-1 flex items-center gap-3">
                        <span className={step === 'SELECT_CRATE' ? 'text-(--main-color)' : 'text-white/20'}>01 Container</span>
                        <ChevronRight size={10} />
                        <span className={step === 'REVIEW_PACK' ? 'text-(--main-color)' : 'text-white/20'}>02 Manifest</span>
                        <span className="ml-2 opacity-40">·</span>
                        <span className="opacity-40">{selectedIds.length} UNITS STAGED</span>
                    </p>
                </div>
            </div>

            {/* Main */}
            <div className="flex-1 overflow-hidden flex flex-col relative z-10">

                {/* STEP 1: SELECT CRATE */}
                {step === 'SELECT_CRATE' && (
                    <div className="flex-1 flex flex-col px-8 md:px-16 overflow-hidden">
                        {/* Search */}
                        <div className="relative group mb-8 shrink-0">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-(--main-color) transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="SEARCH CONTAINER · VENDOR · ID"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-white/[0.04] border-0 border-b border-white/10 focus:border-(--main-color)/60 pl-12 pr-6 py-4 text-sm text-white focus:outline-none transition-all font-black uppercase tracking-[0.2em] bg-transparent placeholder:text-white/20"
                            />
                        </div>

                        {/* Crate Grid */}
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            {isLoadingCrates ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-20">
                                    <Loader2 className="animate-spin" size={48} />
                                    <span className="text-[11px] font-black uppercase tracking-[0.5em]">Scanning Registry</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3 pb-32">
                                    {filteredCrates.map(crate => {
                                        const crateVendors = getCrateVendors(crate, inventory);
                                        const isSelected = selectedCrate?.id === crate.id;
                                        const primaryColor = crateVendors[0]?.color || 'var(--main-color)';
                                        const itemCount = (crate.inventory_ids || '').split(',').filter(Boolean).length;

                                        return (
                                            <button
                                                key={crate.id}
                                                onClick={() => setSelectedCrate(crate)}
                                                className={`group relative flex flex-col items-center p-5 md:p-7 rounded-3xl transition-all duration-500 text-left ${
                                                    isSelected
                                                        ? 'scale-[1.03] z-10'
                                                        : 'hover:bg-white/[0.04]'
                                                }`}
                                                style={isSelected ? {
                                                    background: `${primaryColor}18`,
                                                    boxShadow: `0 0 60px ${primaryColor}30, inset 0 0 0 1px ${primaryColor}40`
                                                } : {}}
                                            >
                                                {/* Vendor color bar — top accent */}
                                                {crateVendors.length > 0 && (
                                                    <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-3xl overflow-hidden flex">
                                                        {crateVendors.slice(0, 4).map(v => (
                                                            <div key={v.prefix} className="flex-1 h-full" style={{ backgroundColor: v.color }} />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Wireframe */}
                                                <div className="mb-4 mt-2 transition-transform duration-500 group-hover:scale-110">
                                                    <WireframeCrate
                                                        w={crate.width_cm}
                                                        l={crate.length_cm}
                                                        h={crate.height_cm}
                                                        type={crate.type}
                                                        selected={isSelected}
                                                        size={80}
                                                        vibrant={isSelected}
                                                    />
                                                </div>

                                                {/* Vendor name tags — color coded chips */}
                                                {crateVendors.length > 0 ? (
                                                    <div className="flex flex-wrap justify-center gap-1 mb-3">
                                                        {crateVendors.slice(0, 3).map(v => (
                                                            <span
                                                                key={v.prefix}
                                                                className="text-[9px] font-black uppercase tracking-widest px-2 py-[3px] rounded-sm leading-none"
                                                                style={{ backgroundColor: v.color, color: getTextContrast(v.color) }}
                                                            >
                                                                {v.prefix}
                                                            </span>
                                                        ))}
                                                        {crateVendors.length > 3 && (
                                                            <span className="text-[9px] font-black text-white/30 px-1">+{crateVendors.length - 3}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mb-3">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-[3px] rounded-sm ${
                                                            crate.status === 'Empty' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'
                                                        }`}>
                                                            {crate.status}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Dims */}
                                                <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-white/30 mb-1">
                                                    {crate.width_cm}×{crate.length_cm}×{crate.height_cm}
                                                </p>

                                                {/* Item count */}
                                                {itemCount > 0 && (
                                                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
                                                        {itemCount} items
                                                    </p>
                                                )}

                                                {isSelected && (
                                                    <div className="absolute top-3 right-3" style={{ color: primaryColor }}>
                                                        <CheckCircle2 width={18} height={18} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2: REVIEW */}
                {step === 'REVIEW_PACK' && selectedCrate && (() => {
                    const crateVendors = getCrateVendors(selectedCrate, inventory);
                    const primaryColor = crateVendors[0]?.color || 'var(--main-color)';
                    return (
                        <div className="flex-1 flex flex-col lg:flex-row min-h-0 px-8 md:px-16">
                            {/* Items list */}
                            <div className="w-full lg:w-1/2 flex flex-col pr-0 lg:pr-12 overflow-hidden">
                                <div className="flex justify-between items-end pb-5 shrink-0">
                                    <div>
                                        <h3 className="text-xl font-black text-white tracking-tighter uppercase">Staging List</h3>
                                        <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.3em] mt-1">Ready for insertion</p>
                                    </div>
                                    <span className="text-4xl font-black tabular-nums leading-none" style={{ color: primaryColor }}>{selectedItems.length}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-32">
                                    {selectedItems.map(item => {
                                        const rawId = (item.norm.itemId || item.norm.tag_id || '').toUpperCase();
                                        const vendorKey = Object.keys(vendors).sort((a, b) => b.length - a.length).find(k => rawId.startsWith(k));
                                        const vColor = vendorKey ? getVendorColor(vendorKey) : '#555';
                                        return (
                                            <div key={item.row} className="flex items-center gap-4 group">
                                                <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: vColor }} />
                                                <div className="w-14 h-14 rounded-xl bg-black/40 overflow-hidden shrink-0">
                                                    <img src={getCleanImageUrl(item.norm.mediaUrls?.split(',')[0])} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        {vendorKey && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-[2px] rounded-sm" style={{ backgroundColor: vColor, color: getTextContrast(vColor) }}>{vendorKey}</span>}
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{item.norm.itemId}</span>
                                                    </div>
                                                    <h5 className="text-xs font-black text-white uppercase truncate">{item.norm.shortDescription || 'Inventory Item'}</h5>
                                                    <p className="text-[8px] font-bold text-white/25 uppercase tracking-tight mt-0.5">
                                                        {item.norm.widthCm}×{item.norm.lengthCm}×{item.norm.heightCm} CM · {item.norm.weightKg} KG
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Logistics HUB */}
                            <div className="w-full lg:w-1/2 flex flex-col justify-center pb-32 pl-0 lg:pl-12 border-t lg:border-t-0 lg:border-l border-white/5 mt-4 lg:mt-0 pt-8 lg:pt-0">
                                {/* Crate ID + vendor tags */}
                                <div className="mb-12">
                                    <p className="text-[9px] font-black uppercase tracking-[0.5em] mb-3" style={{ color: primaryColor }}>Target Container</p>
                                    <div className="flex items-center gap-4 mb-4">
                                        <WireframeCrate w={selectedCrate.width_cm} l={selectedCrate.length_cm} h={selectedCrate.height_cm} type={selectedCrate.type} selected vibrant size={90} />
                                        <div>
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {crateVendors.map(v => (
                                                    <span key={v.prefix} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-sm" style={{ backgroundColor: v.color, color: getTextContrast(v.color) }}>
                                                        {v.prefix}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[9px] font-mono font-bold text-white/30 uppercase">
                                                {selectedCrate.width_cm}×{selectedCrate.length_cm}×{selectedCrate.height_cm} CM
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Metrics */}
                                <div className="grid grid-cols-2 gap-8 border-t border-white/5 pt-10">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Layers className="text-blue-400" size={14} />
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Volumetric Fill</span>
                                        </div>
                                        <div className="flex items-baseline gap-1 mb-2">
                                            <span className={`text-5xl font-black tabular-nums ${logisticsMetrics!.fillPct > 90 ? 'text-rose-500' : 'text-white'}`}>
                                                {logisticsMetrics!.fillPct.toFixed(0)}
                                            </span>
                                            <span className="text-lg font-black text-white/20">%</span>
                                        </div>
                                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-1000 ${logisticsMetrics!.fillPct > 90 ? 'bg-rose-500' : 'bg-blue-400'}`}
                                                style={{ width: `${Math.min(100, logisticsMetrics!.fillPct)}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Weight className="text-emerald-400" size={14} />
                                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Total Weight</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-5xl font-black tabular-nums text-white">{logisticsMetrics!.totalWeight.toFixed(1)}</span>
                                            <span className="text-lg font-black text-white/20">KG</span>
                                        </div>
                                    </div>
                                </div>

                                {logisticsMetrics!.fillPct > 100 && (
                                    <div className="mt-8 p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4 animate-pulse">
                                        <Maximize2 className="text-rose-500 shrink-0" size={20} />
                                        <div>
                                            <p className="text-sm font-black text-rose-500 uppercase">Volume Overload</p>
                                            <p className="text-[9px] text-rose-400/60 font-bold uppercase tracking-tight">
                                                {(logisticsMetrics!.fillPct - 100).toFixed(0)}% over capacity
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 z-20 px-8 md:px-16 py-6 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center gap-6">
                    {step === 'REVIEW_PACK' && (
                        <button onClick={() => setStep('SELECT_CRATE')} className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.3em] hover:text-white transition-all group">
                            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                            Back
                        </button>
                    )}
                    <div className="hidden lg:flex items-center gap-2 text-white/15 text-[9px] font-black uppercase tracking-widest">
                        <Info size={12} />
                        Persisted to global logistics manifest
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setIsOpen(false)} className="px-8 h-14 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-[0.4em] text-white/30 hover:text-white hover:bg-white/5 transition-all active:scale-95">
                        Abort
                    </button>
                    {step === 'SELECT_CRATE' ? (
                        <button
                            onClick={() => setStep('REVIEW_PACK')}
                            disabled={!selectedCrate}
                            className="px-10 h-14 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.4em] hover:scale-105 active:scale-95 transition-all disabled:opacity-20 flex items-center gap-3"
                        >
                            Review Manifest <ChevronRight size={16} strokeWidth={3} />
                        </button>
                    ) : (
                        <button
                            onClick={handleConfirmPack}
                            disabled={isPacking}
                            className="px-12 h-14 rounded-full text-black text-[10px] font-black uppercase tracking-[0.4em] hover:scale-105 active:scale-95 transition-all disabled:opacity-30 flex items-center gap-3 shadow-[0_0_50px_rgba(var(--main-color-rgb),0.3)] bg-(--main-color)"
                        >
                            {isPacking ? <><Loader2 className="animate-spin" size={18} />Syncing...</> : <><Zap size={18} />Confirm Packing</>}
                        </button>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
};
