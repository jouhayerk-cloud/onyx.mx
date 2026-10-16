import React, { useState, useMemo, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    inventoryAtom, 
    cratesVersionAtom, 
    isCratePackingManagerOpenAtom, 
    packingManagerTargetCrateIdAtom, 
    selectedInventoryIdsAtom,
    logisticsSubTabAtom,
    isPackingCrateWizardOpenAtom,
    truckMaxWeightAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { CratesInventoryView } from './CratesInventoryView';
import { CrateCutfileStencilView, BED_OPTIONS, MATERIAL_PRESETS } from './CrateCutfileStencilView';
import { 
    normalizeInventoryData, 
    getItemPaddedVolume, 
    getCleanImageUrl, 
    calculateCodesAndPrices,
    getCrateDisplayName 
} from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { findInventoryByRow } from '../../lib/inventoryIndex';
import { tr, trf } from '../../lib/i18n';
import toast from '../onyxIsland/notify/toast';
import { 
    Box, 
    Package, 
    Search, 
    CheckCircle2, 
    Download, 
    Scissors, 
    Filter, 
    Check, 
    ChevronRight, 
    Ruler, 
    Layers, 
    Cpu,
    ArrowRight,
    Sparkles,
    PackagePlus,
    Truck,
    X,
    Info,
    Warehouse,
    Activity
} from 'lucide-react';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

// ─── Volume / Crate Recommendations ──────────────────────────────────────────
const STANDARD_CRATES = [
    { name: 'TypeTray (Boxes.py Laser)', width: 30, length: 30, height: 15, volumeCm3: 30 * 30 * 15 },
    { name: 'UniversalBox (Finger-Joint CNC)', width: 38, length: 41, height: 38, volumeCm3: 38 * 41 * 38 },
    { name: 'Standard Medium Crate', width: 60, length: 60, height: 60, volumeCm3: 60 * 60 * 60 },
    { name: 'Large Deep Crate', width: 80, length: 80, height: 80, volumeCm3: 80 * 80 * 80 },
    { name: 'Pallet Freight Unit', width: 120, length: 100, height: 120, volumeCm3: 120 * 100 * 120 },
];

function recommendCrate(totalVolumeCm3: number) {
    if (totalVolumeCm3 <= 0) {
        return { name: 'UniversalBox (Finger-Joint CNC)', dims: '38×41×38 cm', width: 38, length: 41, height: 38, fillPct: 0 };
    }
    // Target 65-80% internal fill efficiency
    for (const c of STANDARD_CRATES) {
        if (totalVolumeCm3 <= c.volumeCm3 * 0.85) {
            const fillPct = Math.min(100, Math.round((totalVolumeCm3 / c.volumeCm3) * 100));
            return {
                name: c.name,
                dims: `${c.width}×${c.length}×${c.height} cm`,
                width: c.width,
                length: c.length,
                height: c.height,
                fillPct
            };
        }
    }
    const last = STANDARD_CRATES[STANDARD_CRATES.length - 1];
    return {
        name: last.name,
        dims: `${last.width}×${last.length}×${last.height} cm`,
        width: last.width,
        length: last.length,
        height: last.height,
        fillPct: Math.min(100, Math.round((totalVolumeCm3 / last.volumeCm3) * 100))
    };
}

function parseInventoryIds(raw?: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!raw) return map;
    raw.split(',').filter(Boolean).forEach(entry => {
        const [id, qty] = entry.split(':');
        if (id) map.set(id.trim(), qty ? parseInt(qty) : -1);
    });
    return map;
}

function getTotalPackedForItem(itemId: string, allCrates: any[]): number {
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

/**
 * WarehouseView
 * Complete Apple HIG Liquid Glass warehouse portal:
 * Tab 1: [ 📦 Packed Crates ]
 * Tab 2: [ 📋 Available to Pack ] with Volumetric Estimator & Launch Studio
 * Tab 3: [ 📐 Laser Stencils (Boxes.py) ] with live 2D CNC fabrication studio
 */
export const WarehouseView: React.FC = () => {
    const db = useDatabase();
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const cratesVersion = useAtomValue(cratesVersionAtom);
    const allInventory = useAtomValue(inventoryAtom);
    // Truck weight limit: the one configured in the app (truckMaxWeightAtom), not a copy of the number.
    const truckMaxKg = useAtomValue(truckMaxWeightAtom);

    const setIsPackingManagerOpen = useSetAtom(isCratePackingManagerOpenAtom);
    const setTargetCrateId = useSetAtom(packingManagerTargetCrateIdAtom);
    const setSelectedInventoryIds = useSetAtom(selectedInventoryIdsAtom);
    const setIsPackingCrateWizardOpen = useSetAtom(isPackingCrateWizardOpenAtom);

    // Three main warehouse tabs: 'packed' | 'available' | 'stencils'
    const [warehouseTab, setWarehouseTab] = useState<'packed' | 'available' | 'stencils'>(() => {
        if (subTab === 'packed' || subTab === 'crates') return 'packed';
        return 'packed';
    });

    // Container type filter state ('all' | 'crate' | 'pallet' | 'box' | 'empty')
    const [containerFilter, setContainerFilter] = useState<'all' | 'crate' | 'pallet' | 'box' | 'empty'>('all');

    // Sync from global logisticsSubTabAtom if it changes externally
    useEffect(() => {
        if (subTab === 'packed' || subTab === 'crates') {
            setWarehouseTab('packed');
        } else if (subTab === 'empty') {
            setWarehouseTab('available');
        }
    }, [subTab]);

    // Live crates from RxDB
    const [crates, setCrates] = useState<any[]>([]);
    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find({ selector: { type: { $in: ['crate', 'pallet', 'cardboard'] } } }).$.subscribe((data: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => setCrates(data.map(c => c.toJSON())), 150);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, cratesVersion]);

    // Live Warehouse Status Telemetry & Weights
    const {
        packedCratesCount,
        freightPalletsCount,
        boxesCount,
        emptyContainersCount,
        totalPackedWeightKg,
        truckCapacityKg,
        truckUtilizationPct
    } = useMemo(() => {
        let packedCrates = 0;
        let freightPallets = 0;
        let boxes = 0;
        let emptyContainers = 0;
        let totalWeight = 0;

        for (const c of crates) {
            if (c.status === 'Empty') {
                emptyContainers++;
                continue;
            }
            
            const isBox = c.type === 'cardboard' || (c.width_cm === 38 && c.length_cm === 41 && c.height_cm === 38);
            const isPallet = c.type === 'pallet' || (!isBox && (c.height_cm || 0) <= 40);

            if (isBox) {
                boxes++;
            } else if (isPallet) {
                freightPallets++;
            } else {
                packedCrates++;
            }

            // Containers that already left (Deployed / In Transit) are no longer stock waiting for a truck.
            if (c.status === 'Deployed' || c.status === 'In Transit') continue;

            if (c.brute_weight_kg && Number(c.brute_weight_kg) > 0) {
                totalWeight += Number(c.brute_weight_kg);
            } else if (c.weight_kg && Number(c.weight_kg) > 0) {
                totalWeight += Number(c.weight_kg);
            }
        }

        const truckCap = truckMaxKg > 0 ? truckMaxKg : 24000; // 24,000 kg only if the setting is missing
        const utilPct = Math.min(100, Math.round((totalWeight / truckCap) * 100));

        return {
            packedCratesCount: packedCrates,
            freightPalletsCount: freightPallets,
            boxesCount: boxes,
            emptyContainersCount: emptyContainers,
            totalPackedWeightKg: totalWeight,
            truckCapacityKg: truckCap,
            truckUtilizationPct: utilPct
        };
    }, [crates, truckMaxKg]);

    // Inventory items available to pack
    const availableItems = useMemo(() => {
        const list: {
            id: string;
            row: any;
            norm: any;
            totalQty: number;
            packedQty: number;
            availableQty: number;
            paddedVolume: number;
            weightKg: number;
            imageUrl: string | null;
            vendorPrefix: string;
            vendorColor: string;
        }[] = [];

        for (const item of allInventory) {
            const rowId = String(item.row);
            const norm = normalizeInventoryData(item.data);
            const totalQty = Number(norm.quantity || 1);
            const packedQty = getTotalPackedForItem(rowId, crates);
            const availableQty = Math.max(0, totalQty - packedQty);

            if (availableQty > 0) {
                const singlePaddedVol = getItemPaddedVolume(item.data, 1);
                const weight = Number(norm.weightKg || norm.weight_kg || 0);
                const urls = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                const imageUrl = getCleanImageUrl(norm.generatedPngUrl || (urls.length > 0 ? urls[0] : null));
                const vendorPrefix = String(norm.vendor_id || norm.itemId || '').split('-')[0] || 'UNK';
                const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#666';

                list.push({
                    id: rowId,
                    row: item.row,
                    norm,
                    totalQty,
                    packedQty,
                    availableQty,
                    paddedVolume: singlePaddedVol,
                    weightKg: weight,
                    imageUrl,
                    vendorPrefix,
                    vendorColor
                });
            }
        }
        return list;
    }, [allInventory, crates]);

    const totalUnpackedUnits = useMemo(() => {
        return availableItems.reduce((acc, i) => acc + i.availableQty, 0);
    }, [availableItems]);

    // Search and vendor filter state in "Available to Pack"
    const [searchQuery, setSearchQuery] = useState('');
    const [vendorFilter, setVendorFilter] = useState<string | null>(null);

    // Multi-select in "Available to Pack"
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

    const filteredAvailableItems = useMemo(() => {
        let items = availableItems;
        if (vendorFilter) {
            items = items.filter(i => i.vendorPrefix.toUpperCase() === vendorFilter.toUpperCase());
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            items = items.filter(i => {
                const title = `${i.norm.shape || ''} ${i.norm.shortDescription || i.norm.description || ''}`.toLowerCase();
                const barcode = String(i.norm.book_barcode || i.norm.itemId || '').toLowerCase();
                const mat = String(i.norm.material || '').toLowerCase();
                const col = String(i.norm.color || '').toLowerCase();
                return title.includes(q) || barcode.includes(q) || mat.includes(q) || col.includes(q);
            });
        }
        return items;
    }, [availableItems, vendorFilter, searchQuery]);

    // Unique vendors for filter pills
    const availableVendors = useMemo(() => {
        const set = new Set<string>();
        availableItems.forEach(i => {
            if (i.vendorPrefix) set.add(i.vendorPrefix.toUpperCase());
        });
        return Array.from(set).sort();
    }, [availableItems]);

    // Selection metrics & Volumetric Crate Estimator
    const { totalSelectedVolumeCm3, totalSelectedWeightKg, totalSelectedUnits } = useMemo(() => {
        let vol = 0;
        let wt = 0;
        let units = 0;
        selectedItemIds.forEach(id => {
            const it = availableItems.find(i => i.id === id);
            if (it) {
                vol += it.paddedVolume * it.availableQty;
                wt += it.weightKg * it.availableQty;
                units += it.availableQty;
            }
        });
        return {
            totalSelectedVolumeCm3: vol,
            totalSelectedWeightKg: wt,
            totalSelectedUnits: units
        };
    }, [selectedItemIds, availableItems]);

    const recommendedCrate = useMemo(() => {
        return recommendCrate(totalSelectedVolumeCm3);
    }, [totalSelectedVolumeCm3]);

    const toggleItemSelection = (id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelectedInventoryIds(Array.from(next));
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedItemIds.size === filteredAvailableItems.length) {
            setSelectedItemIds(new Set());
            setSelectedInventoryIds([]);
        } else {
            const nextIds = filteredAvailableItems.map(i => i.id);
            setSelectedItemIds(new Set(nextIds));
            setSelectedInventoryIds(nextIds);
        }
    };

    // Launch Packing Wizard from Available to Pack
    const handleLaunchPackWizard = () => {
        if (selectedItemIds.size === 0) {
            toast.error(tr("Select items to pack first"));
            return;
        }
        setSelectedInventoryIds(Array.from(selectedItemIds));
        setIsPackingCrateWizardOpen(true);
        toast.success(
            tr(`Opening Pack Wizard with ${selectedItemIds.size} staged items...`), 
            { icon: '📦' }
        );
    };

    // Launch Packing Studio from Available to Pack
    const handleLaunchPackingStudio = () => {
        if (selectedItemIds.size === 0) {
            toast.error(tr("Select items to pack first"));
            return;
        }
        setSelectedInventoryIds(Array.from(selectedItemIds));
        setIsPackingManagerOpen(true);
        toast.success(
            trf('Launching 3D & laser studio with {n} items...', { n: selectedItemIds.size }), 
            { icon: '📐' }
        );
    };

    // ─── Laser Stencil (Boxes.py) Studio State ────────────────────────────────
    const [stencilSelectedCrateId, setStencilSelectedCrateId] = useState<string>('custom');
    const [customDims, setCustomDims] = useState<{ width: number; length: number; height: number }>({
        width: 60,
        length: 60,
        height: 60
    });

    const activeStencilCrate = useMemo(() => {
        if (stencilSelectedCrateId === 'custom') return null;
        return crates.find(c => c.id === stencilSelectedCrateId) || null;
    }, [stencilSelectedCrateId, crates]);

    const stencilWidth = activeStencilCrate ? (activeStencilCrate.width_cm || 60) : customDims.width;
    const stencilLength = activeStencilCrate ? (activeStencilCrate.length_cm || 60) : customDims.length;
    const stencilHeight = activeStencilCrate ? (activeStencilCrate.height_cm || 60) : customDims.height;

    const stencilItems = useMemo(() => {
        if (!activeStencilCrate || !activeStencilCrate.inventory_ids) return [];
        const res: { item: any; position: any }[] = [];
        const map = parseInventoryIds(activeStencilCrate.inventory_ids);
        let curX = 0;
        let curZ = 0;

        map.forEach((qty, id) => {
            const inv = findInventoryByRow(allInventory, id);
            if (inv) {
                const norm = normalizeInventoryData(inv.data);
                const iw = norm.widthCm || 15;
                const il = norm.lengthCm || 15;
                const ih = norm.heightCm || 15;
                res.push({
                    item: inv,
                    position: {
                        x: curX,
                        y: 0,
                        z: curZ,
                        rotation: 0,
                        isFlipped: false
                    }
                });
                curX += iw;
                if (curX > stencilWidth - 10) {
                    curX = 0;
                    curZ += il;
                }
            }
        });
        return res;
    }, [activeStencilCrate, allInventory, stencilWidth]);

    return (
        <div className="ui-root flex flex-col h-full w-full min-h-0 bg-(--sidebar-bg) relative select-none">
            {/* ── Apple HIG Two-Layer Liquid Glass Switcher Bar (Safe clearance for Onyx Dynamic Island) ── */}
            <header className="sticky top-0 z-40 w-full flex flex-col items-center justify-center pt-16 sm:pt-20 pb-4 px-4 sm:px-8 border-b border-white/10 bg-[#0c0e10]/90 backdrop-blur-3xl shadow-2xl liquid-glass">
                {/* Segmented Switcher Controls */}
                <div className="inline-flex items-center p-1.5 bg-[#141819]/90 backdrop-blur-2xl border border-white/15 rounded-full shadow-2xl gap-1 max-w-full overflow-x-auto no-scrollbar">
                    {/* [ 📦 Packed Crates & Pallets ] */}
                    <button
                        type="button"
                        onClick={() => {
                            setWarehouseTab('packed');
                            setSubTab('packed');
                        }}
                        className={`min-h-[44px] sm:min-h-[36px] px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2.5 transition-all duration-200 cursor-pointer ${
                            warehouseTab === 'packed'
                                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                                : 'text-white/65 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <span className="text-sm">📦</span>
                        <span>{tr("Packed Crates & Pallets")}</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] font-mono text-emerald-300 font-bold border border-emerald-400/30">
                            {packedCratesCount + freightPalletsCount + boxesCount}
                        </span>
                    </button>

                    {/* [ 📋 Available to Pack ] */}
                    <button
                        type="button"
                        onClick={() => {
                            setWarehouseTab('available');
                            setSubTab('empty');
                        }}
                        className={`min-h-[44px] sm:min-h-[36px] px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2.5 transition-all duration-200 cursor-pointer ${
                            warehouseTab === 'available'
                                ? 'bg-white/20 text-white border border-white/35 shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                : 'text-white/65 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <span className="text-sm">📋</span>
                        <span>{tr("Available to Pack")}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-mono text-white font-bold border border-white/20">
                            {totalUnpackedUnits} {tr("units")}
                        </span>
                    </button>

                    {/* [ 📐 Boxes.py Laser Studio ] */}
                    <button
                        type="button"
                        onClick={() => setWarehouseTab('stencils')}
                        className={`min-h-[44px] sm:min-h-[36px] px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2.5 transition-all duration-200 cursor-pointer ${
                            warehouseTab === 'stencils'
                                ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                                : 'text-white/65 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <span className="text-sm">📐</span>
                        <span>{tr("Laser Studio")}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-mono text-amber-300 font-bold border border-amber-400/30">
                            v2.0
                        </span>
                    </button>
                </div>

                {/* ── Warehouse Status Telemetry & Filter Ribbon ── */}
                <div className="w-full max-w-7xl mx-auto mt-3.5 pt-3.5 border-t border-white/10 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
                    {/* Live KPI Status Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full lg:w-auto py-1">
                        {/* All Containers Pill */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('packed');
                                setContainerFilter('all');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'packed' && containerFilter === 'all'
                                    ? 'bg-white/20 text-white border border-white/40 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>📦</span>
                            <span>{tr("All Containers")}</span>
                            <span className="font-mono font-bold text-white/90">
                                {packedCratesCount + freightPalletsCount + boxesCount}
                            </span>
                        </button>

                        {/* Wooden Crates */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('packed');
                                setContainerFilter(containerFilter === 'crate' ? 'all' : 'crate');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'packed' && containerFilter === 'crate'
                                    ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>🪵</span>
                            <span>{tr("Wooden Crates")}</span>
                            <span className="font-mono font-bold text-amber-300">{packedCratesCount}</span>
                        </button>

                        {/* Freight Pallets */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('packed');
                                setContainerFilter(containerFilter === 'pallet' ? 'all' : 'pallet');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'packed' && containerFilter === 'pallet'
                                    ? 'bg-sky-500/25 text-sky-300 border border-sky-400/50 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>📦</span>
                            <span>{tr("Freight Pallets")}</span>
                            <span className="font-mono font-bold text-sky-300">{freightPalletsCount}</span>
                        </button>

                        {/* Cardboard / Laser Boxes */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('packed');
                                setContainerFilter(containerFilter === 'box' ? 'all' : 'box');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'packed' && containerFilter === 'box'
                                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>📐</span>
                            <span>{tr("Laser Boxes")}</span>
                            <span className="font-mono font-bold text-cyan-300">{boxesCount}</span>
                        </button>

                        {/* Empty & Available Containers */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('packed');
                                setContainerFilter(containerFilter === 'empty' ? 'all' : 'empty');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'packed' && containerFilter === 'empty'
                                    ? 'bg-white/25 text-white border border-white/50 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>📭</span>
                            <span>{tr("Empty Available")}</span>
                            <span className="font-mono font-bold text-white/90">{emptyContainersCount}</span>
                        </button>

                        {/* Unpacked Inventory Units */}
                        <button
                            type="button"
                            onClick={() => {
                                setWarehouseTab('available');
                                setSubTab('empty');
                            }}
                            className={`min-h-[34px] px-3.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                warehouseTab === 'available'
                                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 shadow-sm'
                                    : 'bg-[#141819]/80 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                            }`}
                        >
                            <span>📋</span>
                            <span>{tr("Unpacked Units")}</span>
                            <span className="font-mono font-bold text-emerald-300">{totalUnpackedUnits}</span>
                        </button>
                    </div>

                    {/* Right: Freight Truck Capacity */}
                    <div className="flex items-center gap-3 shrink-0 py-1">
                        {/* Total Weight vs Truck Capacity */}
                        <div
                            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141819]/90 border border-white/12 text-[11px] font-mono shadow-sm"
                            title={tr("Weight of the packed containers still in the warehouse against the truck weight limit set in the app")}
                        >
                            <Truck size={14} className="text-amber-400 shrink-0" />
                            <span className="text-white/60">{tr("Truck Load:")}</span>
                            <span className="font-bold text-white">
                                {totalPackedWeightKg.toLocaleString()} / {truckCapacityKg.toLocaleString()} kg
                            </span>
                            <div className="w-14 h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                                <div 
                                    className={`h-full transition-all ${truckUtilizationPct > 90 ? 'bg-rose-500' : truckUtilizationPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`} 
                                    style={{ width: `${truckUtilizationPct}%` }}
                                />
                            </div>
                            <span className={`text-[10px] font-bold ${truckUtilizationPct > 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {truckUtilizationPct}%
                            </span>
                        </div>

                    </div>
                </div>
            </header>

            {/* ── Tab Content ── */}
            <main className="flex-1 min-h-0 overflow-y-auto relative custom-scrollbar">
                {/* ── TAB 1: PACKED CRATES ── */}
                {warehouseTab === 'packed' && (
                    <div className="w-full h-full pb-16">
                        <CratesInventoryView 
                            forcedTab="packed" 
                            hideSummaryBar={true}
                            containerTypeFilter={containerFilter}
                        />
                    </div>
                )}

                {/* ── TAB 2: AVAILABLE TO PACK ── */}
                {warehouseTab === 'available' && (
                    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-36 flex flex-col gap-6">
                        {/* Search & Action Bar */}
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#111415]/90 border border-white/12 backdrop-blur-2xl shadow-xl">
                            {/* Search Field */}
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={tr("Search by item name, tag barcode, material, color, vendor...")}
                                    className="w-full bg-black/60 border border-white/10 rounded-xl pl-11 pr-10 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/40 transition-all font-medium"
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs p-1 cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    className="min-h-[44px] sm:min-h-[36px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                                >
                                    <CheckCircle2 size={15} className={selectedItemIds.size === filteredAvailableItems.length && filteredAvailableItems.length > 0 ? 'text-emerald-400' : 'text-white/40'} />
                                    <span>
                                        {selectedItemIds.size === filteredAvailableItems.length && filteredAvailableItems.length > 0
                                            ? tr("Deselect All")
                                            : tr("Select All Filtered")}
                                    </span>
                                </button>

                                {selectedItemIds.size > 0 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedItemIds(new Set());
                                                setSelectedInventoryIds([]);
                                            }}
                                            className="min-h-[44px] sm:min-h-[36px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
                                        >
                                            <X size={14} />
                                            <span>{tr("Clear")}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleLaunchPackWizard}
                                            className="min-h-[44px] sm:min-h-[36px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
                                        >
                                            <PackagePlus size={15} />
                                            <span>{tr("Pack Selected")} ({selectedItemIds.size})</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Vendor Filter Chips */}
                        {availableVendors.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 mr-1 shrink-0">
                                    {tr("Vendor:")}
                                </span>
                                <button
                                    onClick={() => setVendorFilter(null)}
                                    className={`min-h-[36px] px-3.5 py-1 rounded-full text-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                                        !vendorFilter
                                            ? 'bg-white/20 text-white font-bold border border-white/30 shadow-md'
                                            : 'bg-[#141819]/80 text-white/60 hover:text-white hover:bg-white/10 border border-white/10'
                                    }`}
                                >
                                    <span>{tr("ALL")}</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono text-white/80">
                                        {availableItems.length}
                                    </span>
                                </button>
                                {availableVendors.map(v => {
                                    const vCol = vendors[v as keyof typeof vendors]?.color || '#888';
                                    const isActive = vendorFilter === v;
                                    const countForVendor = availableItems.filter(i => i.vendorPrefix.toUpperCase() === v).length;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setVendorFilter(isActive ? null : v)}
                                            className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                                                isActive
                                                    ? 'bg-white/20 text-white border border-white/30 shadow-md'
                                                    : 'bg-[#141819]/80 text-white/60 hover:text-white hover:bg-white/10 border border-white/10'
                                            }`}
                                        >
                                            <span 
                                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                                style={{ backgroundColor: vCol, boxShadow: isActive ? `0 0 10px ${vCol}` : 'none' }} 
                                            />
                                            <span>{v}</span>
                                            <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono text-white/80">
                                                {countForVendor}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Inventory List */}
                        {filteredAvailableItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-[#141819]/60 border border-white/5 rounded-3xl p-12">
                                <Package size={48} className="text-white/20" strokeWidth={1} />
                                <h3 className="text-lg font-bold text-white">{tr("No available items found")}</h3>
                                <p className="text-xs text-white/40 max-w-md">
                                    {tr("All inventory items may already be packed into crates, or the current search/filter combination returned 0 results.")}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {filteredAvailableItems.map(item => {
                                    const isSelected = selectedItemIds.has(item.id);
                                    const dimsCm = [item.norm.lengthCm, item.norm.widthCm, item.norm.heightCm].filter(Boolean).join('×');
                                    
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItemSelection(item.id)}
                                            className={`group relative flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 cursor-pointer gap-4 ${
                                                isSelected
                                                    ? 'bg-[#13221e]/95 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/40'
                                                    : 'bg-[#141819]/90 hover:bg-[#1a2022]/95 border-white/10 hover:border-white/20 shadow-md'
                                            }`}
                                        >
                                            {/* Left: Checkbox Pill + Thumb + Identity + Container Recommendation Tag */}
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                {/* Checkbox Pill (44x44pt touch target) */}
                                                <div 
                                                    className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleItemSelection(item.id);
                                                    }}
                                                >
                                                    <div className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all border ${
                                                        isSelected
                                                            ? 'bg-emerald-500 border-emerald-400 text-black shadow-md'
                                                            : 'bg-black/50 border-white/20 group-hover:border-white/40'
                                                    }`}>
                                                        {isSelected && <Check size={14} strokeWidth={3.5} />}
                                                    </div>
                                                </div>

                                                {/* Image Thumbnail / High Contrast Vector Icon */}
                                                <div className="w-14 h-14 rounded-xl bg-black/80 overflow-hidden shrink-0 border border-white/15 flex items-center justify-center relative shadow-inner">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.norm.shape} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Box size={22} className="text-cyan-400/60" />
                                                    )}
                                                </div>

                                                {/* Meta Info */}
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span 
                                                            className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-black"
                                                            style={{ backgroundColor: item.vendorColor }}
                                                        >
                                                            {item.vendorPrefix}
                                                        </span>
                                                        <h4 className="text-sm font-semibold text-white truncate">
                                                            {item.norm.shape || tr("Artifact")} {item.norm.shortDescription ? `· ${item.norm.shortDescription}` : ''}
                                                        </h4>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-white/65 font-mono">
                                                        {item.norm.material && <span className="text-white/80">{item.norm.material}</span>}
                                                        {item.norm.color && <span>• {item.norm.color}</span>}
                                                        {item.norm.book_barcode && (
                                                            <span className="text-white/40 hidden sm:inline">
                                                                • {item.norm.book_barcode}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Container Recommendation Tag */}
                                                    <div className="mt-1.5 flex items-center gap-1.5">
                                                        {(() => {
                                                            const maxDim = Math.max(item.norm.lengthCm || 0, item.norm.widthCm || 0, item.norm.heightCm || 0);
                                                            const isFlatOrHeavy = (item.norm.heightCm || 0) <= 15 || item.weightKg > 20;
                                                            if (maxDim > 40) {
                                                                return (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30">
                                                                        <span>🪵</span> {tr("Crate")} (&gt;40cm)
                                                                    </span>
                                                                );
                                                            } else if (isFlatOrHeavy) {
                                                                return (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-500/30">
                                                                        <span>📦</span> {tr("Pallet")} (Flat/Heavy)
                                                                    </span>
                                                                );
                                                            } else {
                                                                return (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                                                                        <span>📐</span> {tr("Laser Tray/Box")}
                                                                    </span>
                                                                );
                                                            }
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right: Dimensions, Weight & Available Stock Telemetry Pills */}
                                            <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                                                {/* Spatial Dimensions in Cyan */}
                                                <div className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-xl font-mono text-xs flex flex-col items-start sm:items-end">
                                                    <span className="text-[8px] uppercase tracking-wider text-cyan-400/70 font-bold">
                                                        {tr("Dimensions & Vol")}
                                                    </span>
                                                    <span className="font-bold">
                                                        {dimsCm ? `${dimsCm} cm` : '—'} <span className="text-cyan-400/60 font-normal">({(item.paddedVolume / 1000).toFixed(1)}L)</span>
                                                    </span>
                                                </div>

                                                {/* Weight */}
                                                <div className="bg-amber-950/60 text-amber-300 border border-amber-500/25 px-3 py-1.5 rounded-xl font-mono text-xs flex flex-col items-start sm:items-end">
                                                    <span className="text-[8px] uppercase tracking-wider text-amber-400/70 font-bold">
                                                        {tr("Weight")}
                                                    </span>
                                                    <span className="font-bold">
                                                        {item.weightKg > 0 ? `${item.weightKg.toFixed(1)} kg` : '—'}
                                                    </span>
                                                </div>

                                                {/* Available Units Badge + Quick-Pack Action */}
                                                <div className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/35 px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-2.5">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[8px] uppercase tracking-wider text-emerald-400/70 font-bold">
                                                            {tr("Stock")}
                                                        </span>
                                                        <span>
                                                            {item.availableQty} {tr("units")}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedInventoryIds([item.id]);
                                                            setIsPackingCrateWizardOpen(true);
                                                        }}
                                                        className="w-7 h-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 flex items-center justify-center transition-all cursor-pointer"
                                                        title={tr("Quick Pack this item")}
                                                    >
                                                        <Package size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Floating Bottom Volumetric Packing Dock */}
                        {selectedItemIds.size > 0 && (
                            <aside 
                                aria-label={tr("Selected items packing dock")}
                                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl animate-in slide-in-from-bottom duration-300"
                            >
                                <div className="liquid-glass bg-[#0d1011]/95 backdrop-blur-3xl border border-white/20 rounded-3xl p-4 sm:p-5 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col lg:flex-row items-center justify-between gap-4">
                                    {/* Selection Count & Metrics */}
                                    <div className="flex items-center gap-3 w-full lg:w-auto">
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
                                            <CheckCircle2 size={22} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white">
                                                {selectedItemIds.size} {tr("Items Selected")} ({totalSelectedUnits} {tr("Units")})
                                            </span>
                                            <span className="text-[11px] text-white/60 font-mono">
                                                {tr("Vol:")} {(totalSelectedVolumeCm3 / 1000).toFixed(1)} L · {totalSelectedWeightKg.toFixed(1)} kg
                                            </span>
                                        </div>
                                    </div>

                                    {/* Volumetric Crate Estimator Chip */}
                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/[0.05] border border-white/10 w-full lg:w-auto">
                                        <span className="text-xl">📐</span>
                                        <div className="flex flex-col text-left">
                                            <span className="text-[9px] font-mono text-cyan-300 uppercase tracking-wider font-bold">
                                                {tr("Recommended Container")}
                                            </span>
                                            <span className="text-xs font-bold text-white">
                                                {recommendedCrate.name} ({recommendedCrate.dims}) · <span className="text-emerald-400 font-mono">~{recommendedCrate.fillPct}% fill</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons: 1) Select Container & Pack, 2) Open 3D / Boxes.py Studio */}
                                    <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end">
                                        {/* 1. Select Container & Pack (PackWizard) */}
                                        <button
                                            type="button"
                                            onClick={handleLaunchPackWizard}
                                            className="flex-1 lg:flex-none min-h-[46px] px-6 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                                        >
                                            <PackagePlus size={16} />
                                            <span>{tr("Select Container & Pack")}</span>
                                        </button>

                                        {/* 2. Open 3D / Boxes.py Studio */}
                                        <button
                                            type="button"
                                            onClick={handleLaunchPackingStudio}
                                            className="flex-1 lg:flex-none min-h-[46px] px-5 py-2.5 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-95 text-cyan-200 border border-cyan-400/40 font-bold text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                                        >
                                            <Sparkles size={16} />
                                            <span>{tr("Open 3D / Laser Studio")}</span>
                                        </button>
                                    </div>
                                </div>
                            </aside>
                        )}
                    </div>
                )}

                {/* ── TAB 3: LASER STENCILS (BOXES.PY) STUDIO ── */}
                {warehouseTab === 'stencils' && (
                    <div className="w-full h-full p-4 sm:p-8 flex flex-col gap-6">
                        {/* Stencil Crate Selector Bar */}
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 liquid-glass shadow-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                                    <Scissors size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <span>{tr("Laser Stencil Studio (approximate preview)")}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                                            v2.0
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-white/50">
                                        {tr("Generate parametric cutfiles, nesting telemetry, and LightBurn jobs.")}
                                    </p>
                                </div>
                            </div>

                            {/* Crate Selection Controls */}
                            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
                                <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 shrink-0">
                                    {tr("Source Unit:")}
                                </span>
                                <select
                                    value={stencilSelectedCrateId}
                                    onChange={(e) => setStencilSelectedCrateId(e.target.value)}
                                    className="bg-black/60 border border-white/15 rounded-2xl px-4 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-400/50 transition-all cursor-pointer"
                                >
                                    <option value="custom">⚙️ {tr("Custom Parametric Crate")}</option>
                                    {crates.map(c => {
                                        const { label } = getCrateDisplayName(c, crates, allInventory);
                                        return (
                                            <option key={c.id} value={c.id}>
                                                📦 {label || c.id.slice(0, 8).toUpperCase()} ({c.width_cm}×{c.length_cm}×{c.height_cm} cm)
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* If Custom Crate: Numerical Inputs */}
                        {stencilSelectedCrateId === 'custom' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-xl">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                        {tr("Width (cm)")}
                                    </label>
                                    <input
                                        type="number"
                                        min="10"
                                        max="300"
                                        value={customDims.width}
                                        onChange={(e) => setCustomDims(prev => ({ ...prev, width: Number(e.target.value) || 60 }))}
                                        className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-sm font-mono text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                        {tr("Length (cm)")}
                                    </label>
                                    <input
                                        type="number"
                                        min="10"
                                        max="300"
                                        value={customDims.length}
                                        onChange={(e) => setCustomDims(prev => ({ ...prev, length: Number(e.target.value) || 60 }))}
                                        className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-sm font-mono text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                        {tr("Height (cm)")}
                                    </label>
                                    <input
                                        type="number"
                                        min="10"
                                        max="300"
                                        value={customDims.height}
                                        onChange={(e) => setCustomDims(prev => ({ ...prev, height: Number(e.target.value) || 60 }))}
                                        className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-sm font-mono text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Embedded Full Interactive CrateCutfileStencilView */}
                        <div className="flex-1 min-h-[600px] rounded-3xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl relative">
                            <CrateCutfileStencilView
                                width={stencilWidth}
                                length={stencilLength}
                                height={stencilHeight}
                                items={stencilItems}
                                crateName={activeStencilCrate ? activeStencilCrate.id.slice(0, 8) : 'Custom_Crate'}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
