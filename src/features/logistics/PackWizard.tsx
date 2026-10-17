import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    isPackingCrateWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    exchangeRateAtom,
    isCratePackingManagerOpenAtom,
    packingManagerTargetCrateIdAtom,
    CrateStatus,
    toCrateStatus,
    isPackagingStudioOpenAtom,
    packagingStudioStagedItemsAtom
} from '../../lib/atoms';
import { recommendPackaging } from '../packaging/generators';
import { 
    X, ChevronRight, Search, Info, Loader2, PackagePlus, Package, ArrowLeft, 
    Layers, Weight, Maximize2, Zap, LayoutGrid, Rotate3d, Sparkles, 
    Box, CheckCircle2, MapPin, SlidersHorizontal, Scissors, Cpu, 
    Check, ArrowUpRight
} from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import { supabase } from '../../lib/supabase';
import { 
    normalizeInventoryData, 
    getCleanImageUrl, 
    calculateCodesAndPrices, 
    getCrateInternalVolume, 
    getItemPaddedVolume 
} from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { WireframeCrate } from '../../components/CrateVisuals';
import { findInventoryByRow } from '../../lib/inventoryIndex';
import { tr } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';
import { 
    computeBoxesParams, 
    computeCutTelemetry, 
    PackedItemSpec, 
    BoxesGeneratorParams, 
    CutTelemetry 
} from '../../lib/logistics/boxesBridge';

type WizardStep = 'SELECT_CRATE' | 'REVIEW_PACK';

/**
 * Id of the virtual "auto-fit laser box" card. It is only a suggestion until the user packs into it; it is
 * never stored. Packing into it creates one real logistics row (type 'cardboard', id assigned by the database
 * like every other container), and from then on that row is an ordinary container that is updated, not copied.
 */
const AUTOFIT_CRATE_ID = 'BOX-PY-AUTOFIT';
type ContainerTaxonomy = 'all' | 'crates' | 'pallets' | 'boxes' | 'empty' | 'best_fit';

interface CrateRecord {
    id: string;
    type?: string;
    status: CrateStatus;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    weight_kg?: number;
    inventory_ids?: string;
    contents_summary?: string;
    description?: string;
    updated_at?: string;
    sent_date?: string;
    location?: string;
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
        const inv = findInventoryByRow(allInventory, id);
        if (inv?.data) {
            const norm = normalizeInventoryData(inv.data);
            const raw = (norm.itemId || norm.tag_id || '').toUpperCase();
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
    if (!hex || hex.length < 7) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#000000' : '#ffffff';
}

// Classify container into Crates, Pallets, or Boxes
function getContainerCategory(c: CrateRecord): {
    category: 'crate' | 'pallet' | 'box';
    label: string;
    badgeStyle: string;
    icon: string;
} {
    const typeStr = (c.type || '').toLowerCase();
    const idStr = (c.id || '').toUpperCase();
    const h = c.height_cm || 0;
    const w = c.width_cm || 0;
    const l = c.length_cm || 0;

    if (typeStr === 'pallet' || (h <= 40 && (w >= 70 || l >= 70))) {
        return {
            category: 'pallet',
            label: 'FREIGHT PALLET',
            badgeStyle: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
            icon: '🪵',
        };
    }
    if (typeStr === 'box' || typeStr === 'cardboard' || idStr.startsWith('BOX') || idStr.startsWith('LBL') || (h <= 30 && w <= 50 && l <= 50)) {
        return {
            category: 'box',
            label: 'CARDBOARD / LASER BOX',
            badgeStyle: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
            icon: '📐',
        };
    }
    return {
        category: 'crate',
        label: 'WOOD CRATE',
        badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        icon: '📦',
    };
}

export const PackWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPackingCrateWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const setIsManagerOpen = useSetAtom(isCratePackingManagerOpenAtom);
    const setManagerTargetCrateId = useSetAtom(packingManagerTargetCrateIdAtom);
    const setIsPackagingStudioOpen = useSetAtom(isPackagingStudioOpenAtom);
    const setPackagingStudioStagedItems = useSetAtom(packagingStudioStagedItemsAtom);

    const [step, setStep] = useState<WizardStep>('SELECT_CRATE');
    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [isLoadingCrates, setIsLoadingCrates] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTaxonomy, setSelectedTaxonomy] = useState<ContainerTaxonomy>('all');
    const [selectedCrate, setSelectedCrate] = useState<CrateRecord | null>(null);
    const [crateLocation, setCrateLocation] = useState('');
    const [isPacking, setIsPacking] = useState(false);
    const [packQuantities, setPackQuantities] = useState<Record<string, number>>({});

    // Staged items data normalized
    const selectedItems = useMemo(() =>
        inventory.filter(item => 
            selectedIds.includes(item.row) || 
            selectedIds.includes(String(item.row)) || 
            selectedIds.includes(item.data?.id)
        ).map(item => {
            const norm = normalizeInventoryData(item.data);
            const codes = calculateCodesAndPrices(item.data, exchangeRate, '326');
            return { ...item, norm, codes };
        }),
        [inventory, selectedIds, exchangeRate]
    );

    // Staged telemetry metrics
    const stagedMetrics = useMemo(() => {
        let volCm3 = 0;
        let weightKg = 0;
        let maxW = 0;
        let maxL = 0;
        let maxH = 0;
        let totalUnits = 0;

        selectedItems.forEach(item => {
            const qty = packQuantities[item.row] ?? (item.norm.quantity || 1);
            totalUnits += qty;
            volCm3 += getItemPaddedVolume(item.data, qty);
            weightKg += (Number(item.norm.weightKg) || 0) * qty;
            maxW = Math.max(maxW, Number(item.norm.widthCm) || 0);
            maxL = Math.max(maxL, Number(item.norm.lengthCm) || 0);
            maxH = Math.max(maxH, Number(item.norm.heightCm) || 0);
        });

        const volLiters = volCm3 / 1000;
        return { volCm3, volLiters, weightKg, maxW, maxL, maxH, totalUnits };
    }, [selectedItems, packQuantities]);

    // Smart packaging suggestion using unified inside/outside volume math (FEFCO 0201, Cleated Crate, Pallet)
    const customBoxesCrate = useMemo(() => {
        if (selectedItems.length === 0) return null;
        const rec = recommendPackaging(selectedItems);
        const { totalUnits } = stagedMetrics;
        
        const w = rec.outerCm.w;
        const l = rec.outerCm.l;
        const h = rec.outerCm.h;

        const generator: 'TypeTray' | 'UniversalBox' = totalUnits > 1 && h <= 30 ? 'TypeTray' : 'UniversalBox';

        const packedSpecs: PackedItemSpec[] = selectedItems.map((item, idx) => ({
            id: String(item.row),
            name: item.norm.shortDescription || item.norm.itemId || `Item ${idx + 1}`,
            xCm: (idx % 2) * (item.norm.widthCm || 10),
            yCm: 0,
            zCm: Math.floor(idx / 2) * (item.norm.lengthCm || 10),
            widthCm: item.norm.widthCm || 10,
            lengthCm: item.norm.lengthCm || 10,
            heightCm: item.norm.heightCm || 10,
        }));

        const boxesParams: BoxesGeneratorParams = computeBoxesParams(
            { widthCm: w, lengthCm: l, heightCm: h, thicknessMm: rec.boardThicknessMm, burnMm: 0.09 },
            generator === 'TypeTray' ? packedSpecs : undefined
        );

        const cutTelemetry: CutTelemetry = computeCutTelemetry(
            { widthCm: w, lengthCm: l, heightCm: h, thicknessMm: rec.boardThicknessMm, burnMm: 0.09 },
            generator === 'TypeTray' ? packedSpecs : undefined
        );

        const tareWeight = Math.max(0.8, rec.tareWeightKg);

        const record: CrateRecord = {
            id: AUTOFIT_CRATE_ID,
            type: rec.kind === 'cardboard' ? 'cardboard' : rec.kind === 'crate' ? 'crate' : 'pallet',
            status: 'Empty',
            width_cm: w,
            length_cm: l,
            height_cm: h,
            weight_kg: tareWeight,
            inventory_ids: '',
            description: `Auto-fit ${rec.kind.toUpperCase()} (${rec.style}) · Usable ${rec.innerCm.w}×${rec.innerCm.l}×${rec.innerCm.h}cm · Tare ${tareWeight}kg`,
            location: 'Packaging Hub',
        };

        return { record, boxesParams, cutTelemetry, generator, spec: rec };
    }, [selectedItems, stagedMetrics]);

    const fetchCrates = async () => {
        setIsLoadingCrates(true);
        try {
            const { data, error } = await supabase.from('logistics').select('*').order('updated_at', { ascending: false });
            if (error) throw error;
            setCrates((data || []).map(r => ({ ...r, status: toCrateStatus(r.status) })));
        } catch (e: any) {
            toast.error(`Failed to load containers: ${e.message}`);
        } finally {
            setIsLoadingCrates(false);
        }
    };

    useEffect(() => {
        if (isOpen) { 
            fetchCrates(); 
            setStep('SELECT_CRATE'); 
            setSelectedCrate(null); 
            setPackQuantities({}); 
            setCrateLocation('');
        }
    }, [isOpen]);

    // Calculate capacity & fit for any crate
    const getCrateMetrics = useMemo(() => {
        return (crate: CrateRecord) => {
            const internalVol = getCrateInternalVolume(crate);
            let existingVol = 0;
            let existingWeight = 0;
            const existingIds = (crate.inventory_ids || '').split(',').filter(Boolean);
            existingIds.forEach(entry => {
                const [id, qtyStr] = entry.split(':');
                const qty = qtyStr ? parseInt(qtyStr) : 1;
                const inv = findInventoryByRow(inventory, id);
                if (inv?.data) {
                    existingVol += getItemPaddedVolume(inv.data, qty);
                    existingWeight += (Number(normalizeInventoryData(inv.data).weightKg) || 0) * qty;
                }
            });

            const currentFillPct = internalVol > 0 ? (existingVol / internalVol) * 100 : 0;
            const totalVol = existingVol + stagedMetrics.volCm3;
            const totalWeight = existingWeight + stagedMetrics.weightKg;
            const projectedFillPct = internalVol > 0 ? (totalVol / internalVol) * 100 : 0;
            const deltaFillPct = projectedFillPct - currentFillPct;
            const fitsStaged = internalVol > 0 && projectedFillPct <= 100;
            const isOverCapacity = internalVol > 0 && projectedFillPct > 100;
            const isRecommended = fitsStaged && (projectedFillPct >= 20 || internalVol <= stagedMetrics.volCm3 * 2.5);

            return {
                internalVol,
                existingVol,
                existingWeight,
                totalVol,
                totalWeight,
                currentFillPct,
                projectedFillPct,
                deltaFillPct,
                fitsStaged,
                isOverCapacity,
                isRecommended,
                itemCount: existingIds.length
            };
        };
    }, [inventory, stagedMetrics]);

    // Active metrics for currently selected container
    const activeSelectedMetrics = useMemo(() => {
        if (!selectedCrate) return null;
        return getCrateMetrics(selectedCrate);
    }, [selectedCrate, getCrateMetrics]);

    // Compute Taxonomy Filter Counts
    const taxonomyCounts = useMemo(() => {
        const available = crates.filter(c => (c.status === 'Empty' || c.status === 'Partial') && !c.sent_date);
        let cratesCount = 0;
        let palletsCount = 0;
        let boxesCount = 0;
        let emptyCount = 0;
        let bestFitCount = 0;

        available.forEach(c => {
            const tax = getContainerCategory(c);
            if (tax.category === 'crate') cratesCount++;
            if (tax.category === 'pallet') palletsCount++;
            if (tax.category === 'box') boxesCount++;

            const itemCount = (c.inventory_ids || '').split(',').filter(Boolean).length;
            if (itemCount === 0 || c.status === 'Empty') emptyCount++;

            const metrics = getCrateMetrics(c);
            if (metrics.isRecommended) bestFitCount++;
        });

        return {
            all: available.length,
            crates: cratesCount,
            pallets: palletsCount,
            boxes: boxesCount,
            empty: emptyCount,
            bestFit: bestFitCount,
        };
    }, [crates, getCrateMetrics]);

    // Filter and search container records
    const filteredCrates = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return crates
            .filter(c => c.status === 'Empty' || c.status === 'Partial')
            .filter(c => !c.sent_date)
            .filter(c => {
                if (!term) return true;
                const dimsStr = `${c.width_cm}x${c.length_cm}x${c.height_cm}`.toLowerCase();
                const tax = getContainerCategory(c);
                return (
                    (c.id || '').toLowerCase().includes(term) ||
                    (c.description || '').toLowerCase().includes(term) ||
                    (c.contents_summary || '').toLowerCase().includes(term) ||
                    tax.label.toLowerCase().includes(term) ||
                    dimsStr.includes(term)
                );
            })
            .filter(c => {
                const tax = getContainerCategory(c);
                const metrics = getCrateMetrics(c);
                const itemCount = (c.inventory_ids || '').split(',').filter(Boolean).length;

                if (selectedTaxonomy === 'crates') return tax.category === 'crate';
                if (selectedTaxonomy === 'pallets') return tax.category === 'pallet';
                if (selectedTaxonomy === 'boxes') return tax.category === 'box';
                if (selectedTaxonomy === 'empty') return itemCount === 0 || c.status === 'Empty';
                if (selectedTaxonomy === 'best_fit') return metrics.isRecommended;
                return true;
            });
    }, [crates, searchTerm, selectedTaxonomy, getCrateMetrics]);

    // Handle Quick Launch into 3D / Boxes Studio
    const handleLaunch3DStudio = (crateId?: string) => {
        const targetId = crateId || selectedCrate?.id;
        if (targetId) {
            setManagerTargetCrateId(targetId);
        }
        setIsManagerOpen(true);
        setIsOpen(false);
        toast.success(tr("Entering 3D / Boxes.py Studio"), { icon: '📐' });
    };

    // Confirm pack manifest sync
    const handleConfirmPack = async () => {
        if (!selectedCrate) return;
        setIsPacking(true);
        const tid = toast.loading(tr("Synchronizing container manifest..."));
        try {
            const existingIds = (selectedCrate.inventory_ids || '').split(',').filter(Boolean);
            const newIds = selectedItems.map(item => `${item.row}:${packQuantities[item.row] ?? (item.norm.quantity || 1)}`);
            const updatedIds = [...existingIds, ...newIds].join(',');
            
            let targetCrateId = selectedCrate.id;

            // Only the virtual auto-fit card is created. Real rows (including a laser box created earlier)
            // are updated below. The database assigns the id, as for every other container, so two packs
            // can never collide, and the stored type is 'cardboard' (the type every logistics filter knows).
            if (selectedCrate.id === AUTOFIT_CRATE_ID) {
                const nowIso = new Date().toISOString();
                const { data: created, error: insError } = await supabase.from('logistics').insert({
                    type: 'cardboard',
                    status: 'Packed',
                    width_cm: selectedCrate.width_cm,
                    length_cm: selectedCrate.length_cm,
                    height_cm: selectedCrate.height_cm,
                    weight_kg: selectedCrate.weight_kg,
                    inventory_ids: updatedIds,
                    description: selectedCrate.description || 'Auto-fit laser box',
                    contents_summary: '',
                    quantity: 1,
                    date: nowIso,
                    location: crateLocation || 'Laser Fab Bed',
                    updated_at: nowIso,
                }).select('id').single();
                if (insError) throw insError;
                if (!created?.id) throw new Error('The new container was not returned by the database');
                targetCrateId = String(created.id);
            } else {
                // Update existing container in logistics table
                const { error: crateError } = await supabase.from('logistics').update({
                    inventory_ids: updatedIds,
                    status: 'Packed',
                    location: crateLocation || selectedCrate.location,
                    updated_at: new Date().toISOString()
                }).eq('id', selectedCrate.id);
                if (crateError) throw crateError;
            }

            // Update packing_status, crate_id, and pack_date in inventory table
            const inventoryRowsToUpdate = selectedItems.map(item => item.row ?? item.data.id);
            if (inventoryRowsToUpdate.length > 0) {
                const { error: invError } = await supabase.from('inventory')
                    .update({
                        packing_status: 'Packed',
                        crate_id: targetCrateId,
                        pack_date: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .in('id', inventoryRowsToUpdate.map(String));
                if (invError) throw invError;
            }

            toast.success(`Successfully packed ${selectedItems.length} items into ${targetCrateId}`, { id: tid });
            setIsOpen(false);
        } catch (e: any) {
            toast.error(`Packing failed: ${e.message}`, { id: tid });
        } finally {
            setIsPacking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Scrim: dark backdrop layer behind the glass */}
            <div 
                className="fixed inset-0 z-[10059] pointer-events-none animate-in fade-in duration-300" 
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }} 
                aria-hidden="true" 
            />
            <div className="fixed inset-0 z-[10060] ui-root flex flex-col liquid-surface rounded-none border-0 animate-in fade-in duration-300 overflow-hidden select-none text-(--lq-ink)">
            
            {/* ━━ 1. TOP FUNCTIONAL HEADER BAR (Two-Layer Liquid Glass) ━━ */}
            <div className="shrink-0 border-b border-(--lq-rim-subtle) bg-(--lq-fill-panel) px-6 pt-12 pb-4 sm:px-10 flex flex-wrap items-center justify-between gap-4 z-20">
                {/* Left: Step indicator + Title + Telemetry summary */}
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_25px_rgba(var(--main-color-rgb),0.35)] shrink-0">
                        {step === 'SELECT_CRATE' ? <LayoutGrid size={22} strokeWidth={2.5} /> : <PackagePlus size={22} strokeWidth={2.5} />}
                    </div>

                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-(--lq-ink)/50">
                                {step === 'SELECT_CRATE' ? 'STEP 1 · SELECT CONTAINER' : 'STEP 2 · REVIEW & CONFIRM MANIFEST'}
                            </span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-black text-(--lq-ink) tracking-wide uppercase leading-tight">
                            {tr("Pack Staged Inventory")}
                        </h1>
                    </div>

                    {/* Staged Telemetry Pill */}
                    <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-(--lq-fill-control) border border-(--lq-rim-subtle) text-xs font-bold text-(--lq-ink)/80 ml-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-(--lq-ink) font-black">{stagedMetrics.totalUnits} Units</span>
                        <span className="text-(--lq-ink)/30">·</span>
                        <span>{stagedMetrics.weightKg.toFixed(1)} kg</span>
                        <span className="text-(--lq-ink)/30">·</span>
                        <span className="text-cyan-400 font-mono font-bold">{stagedMetrics.volLiters.toFixed(1)} L Required</span>
                    </div>
                </div>

                {/* Right: Quick action 3D Studio button + 40x40 Close button */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleLaunch3DStudio()}
                        className="h-10 px-4 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title={tr("Open 3D / Boxes.py Studio directly")}
                    >
                        <Rotate3d size={15} className="text-cyan-400" />
                        <span className="hidden sm:inline">{tr("Open 3D / Boxes.py Studio")}</span>
                        <span className="sm:hidden">{tr("3D Studio")}</span>
                        <ArrowUpRight size={13} className="text-cyan-400/60" />
                    </button>

                    <button
                        onClick={() => setIsOpen(false)}
                        className="w-10 h-10 rounded-full border border-(--lq-rim-subtle) bg-(--lq-fill-control) hover:bg-(--lq-fill-control-hover) text-(--lq-ink)/40 hover:text-(--lq-ink) flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-lg group"
                        title={tr("Close Pack Wizard")}
                    >
                        <X size={20} className="group-hover:rotate-90 transition-transform duration-300" strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* ━━ 2. FILTER & SEARCH CONTROL BAR (Step 1 Only) ━━ */}
            {step === 'SELECT_CRATE' && (
                <div className="shrink-0 px-6 sm:px-10 py-3 bg-(--lq-fill-panel) border-b border-(--lq-rim-subtle) flex flex-wrap items-center justify-between gap-3 z-10">
                    {/* Obsidian Glass Search Box */}
                    <div className="relative flex-1 min-w-[260px] max-w-md group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-(--lq-ink)/40 group-focus-within:text-(--main-color) transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder={tr("Search container ID, vendor, dimensions...")}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-(--lq-fill-control) border border-(--lq-rim-subtle) focus:border-cyan-500/50 rounded-xl pl-10 pr-9 py-2 text-xs text-(--lq-ink) focus:outline-none transition-all placeholder:text-(--lq-ink)/30 uppercase font-medium tracking-wider"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--lq-ink)/40 hover:text-(--lq-ink)"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Taxonomy Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <button
                            onClick={() => setSelectedTaxonomy('all')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 ${
                                selectedTaxonomy === 'all'
                                    ? 'bg-white text-black border-white shadow-md'
                                    : 'bg-(--lq-fill-control) text-(--lq-ink)/60 border-(--lq-rim-subtle) hover:bg-(--lq-fill-control-hover) hover:text-(--lq-ink)'
                            }`}
                        >
                            All Containers ({taxonomyCounts.all})
                        </button>

                        <button
                            onClick={() => setSelectedTaxonomy('crates')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                                selectedTaxonomy === 'crates'
                                    ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                                    : 'bg-(--lq-fill-control) text-amber-300/70 border-(--lq-rim-subtle) hover:bg-amber-500/10 hover:text-amber-300'
                            }`}
                        >
                            <span>📦</span> Crates ({taxonomyCounts.crates})
                        </button>

                        <button
                            onClick={() => setSelectedTaxonomy('pallets')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                                selectedTaxonomy === 'pallets'
                                    ? 'bg-sky-400 text-black border-sky-300 shadow-md'
                                    : 'bg-(--lq-fill-control) text-sky-300/70 border-(--lq-rim-subtle) hover:bg-sky-500/10 hover:text-sky-300'
                            }`}
                        >
                            <span>🪵</span> Pallets ({taxonomyCounts.pallets})
                        </button>

                        <button
                            onClick={() => setSelectedTaxonomy('boxes')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                                selectedTaxonomy === 'boxes'
                                    ? 'bg-cyan-400 text-black border-cyan-300 shadow-md'
                                    : 'bg-(--lq-fill-control) text-cyan-300/70 border-(--lq-rim-subtle) hover:bg-cyan-500/10 hover:text-cyan-300'
                            }`}
                        >
                            <span>📐</span> Boxes & Laser ({taxonomyCounts.boxes})
                        </button>

                        <button
                            onClick={() => setSelectedTaxonomy('empty')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                                selectedTaxonomy === 'empty'
                                    ? 'bg-white/90 text-black border-white'
                                    : 'bg-(--lq-fill-control) text-(--lq-ink)/60 border-(--lq-rim-subtle) hover:bg-(--lq-fill-control-hover) hover:text-(--lq-ink)'
                            }`}
                        >
                            <span>✨</span> Empty ({taxonomyCounts.empty})
                        </button>

                        <button
                            onClick={() => setSelectedTaxonomy('best_fit')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                                selectedTaxonomy === 'best_fit'
                                    ? 'bg-emerald-400 text-black border-emerald-300 shadow-md'
                                    : 'bg-(--lq-fill-control) text-emerald-300/70 border-(--lq-rim-subtle) hover:bg-emerald-500/10 hover:text-emerald-300'
                            }`}
                        >
                            <span>🟢</span> Best Fit ({taxonomyCounts.bestFit})
                        </button>
                    </div>
                </div>
            )}

            {/* ━━ 3. MAIN CONTENT LAYER ━━ */}
            <div className="flex-1 overflow-hidden flex flex-col relative z-10">

                {/* ── STEP 1: SELECT CONTAINER ── */}
                {step === 'SELECT_CRATE' && (
                    <div className="flex-1 overflow-y-auto px-6 sm:px-10 pt-6 pb-36">
                        {isLoadingCrates ? (
                            <div className="flex flex-col items-center justify-center h-80 gap-4 opacity-40">
                                <Loader2 className="animate-spin text-cyan-400" size={44} />
                                <span className="text-xs font-black uppercase tracking-[0.4em] text-(--lq-ink)">
                                    {tr("Scanning Logistics Registry...")}
                                </span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                
                                {/* 🌟 SPECIAL FIRST CARD: Auto-Fit Boxes.py Parametric Container */}
                                {customBoxesCrate && (
                                    <div
                                        onClick={() => setSelectedCrate(customBoxesCrate.record)}
                                        className={`relative flex flex-col p-5 rounded-3xl border-2 border-dashed transition-all duration-300 text-left cursor-pointer group liquid-panel ${
                                            selectedCrate?.id === customBoxesCrate.record.id
                                                ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_40px_rgba(6,182,212,0.3)] scale-[1.02]'
                                                : 'border-cyan-500/40 bg-cyan-950/15 hover:bg-cyan-950/30 hover:border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                                        }`}
                                    >
                                        {/* Top Accent Strip */}
                                        <div className="absolute top-0 left-6 right-6 h-[2px] bg-linear-to-r from-transparent via-cyan-400 to-transparent opacity-80" />

                                        {/* Header Badges */}
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Sparkles size={14} className="text-cyan-400 animate-pulse" />
                                                    <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                        AUTO-FIT {customBoxesCrate.spec.kind.toUpperCase()}
                                                    </span>
                                                </div>
                                                <span className="text-[8px] font-bold tracking-wider text-cyan-400/70 uppercase">
                                                    {customBoxesCrate.spec.style} · {customBoxesCrate.spec.materialId}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                    100% TAILORED
                                                </span>
                                            </div>
                                        </div>

                                        {/* Wireframe Preview */}
                                        <div className="my-2 py-2 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                                            <WireframeCrate
                                                w={customBoxesCrate.record.width_cm}
                                                l={customBoxesCrate.record.length_cm}
                                                h={customBoxesCrate.record.height_cm}
                                                type="box"
                                                selected={selectedCrate?.id === customBoxesCrate.record.id}
                                                size={75}
                                                vibrant={true}
                                            />
                                        </div>

                                        {/* Spec details */}
                                        <div className="flex flex-col gap-1.5 mt-auto pt-3 border-t border-cyan-500/20">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[11px] font-mono font-black text-(--lq-ink)">
                                                    {customBoxesCrate.record.width_cm}×{customBoxesCrate.record.length_cm}×{customBoxesCrate.record.height_cm} CM
                                                </span>
                                                <span className="text-[9px] font-mono font-bold text-cyan-300">
                                                    {customBoxesCrate.cutTelemetry.estCutTimeSec}s cut
                                                </span>
                                            </div>

                                            <p className="text-[8px] font-bold text-(--lq-ink)/40 uppercase tracking-tight truncate">
                                                Kerf 0.09mm · {customBoxesCrate.cutTelemetry.panelCount} panels · {customBoxesCrate.cutTelemetry.nestingEfficiencyPct}% bed eff
                                            </p>

                                            {/* Action bar inside card */}
                                            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-cyan-500/20">
                                                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                                                    {selectedCrate?.id === customBoxesCrate.record.id ? (
                                                        <><Check size={12} strokeWidth={3} /> Selected</>
                                                    ) : (
                                                        'Select Custom Box'
                                                    )}
                                                </span>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPackagingStudioStagedItems(selectedItems.map(i => i.data || i));
                                                            setIsPackagingStudioOpen(true);
                                                            setIsOpen(false);
                                                        }}
                                                        className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                                                        title={tr("Open in Packaging Studio")}
                                                    >
                                                        <Package size={11} /> Studio
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleLaunch3DStudio(customBoxesCrate.record.id);
                                                        }}
                                                        className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                                                        title={tr("Open in 3D & 2D Stencil Studio")}
                                                    >
                                                        <Rotate3d size={11} /> 3D
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* EXISTING CONTAINERS (Crates, Pallets, Boxes) */}
                                {filteredCrates.map(crate => {
                                    const isSelected = selectedCrate?.id === crate.id;
                                    const crateVendors = getCrateVendors(crate, inventory);
                                    const primaryColor = crateVendors[0]?.color || 'var(--main-color)';
                                    const tax = getContainerCategory(crate);
                                    const metrics = getCrateMetrics(crate);

                                    return (
                                        <div
                                            key={crate.id}
                                            onClick={() => setSelectedCrate(crate)}
                                            className={`group relative flex flex-col p-5 rounded-3xl transition-all duration-300 text-left cursor-pointer border liquid-panel ${
                                                isSelected
                                                    ? 'border-(--main-color) bg-(--lq-fill-panel-hover,rgba(255,255,255,0.12)) shadow-[0_0_40px_rgba(var(--main-color-rgb),0.25)] scale-[1.02]'
                                                    : 'border-(--lq-rim-subtle) hover:bg-(--lq-fill-control-hover) hover:border-(--lq-rim)'
                                            }`}
                                        >
                                            {/* Vendor color accent bar on top */}
                                            {crateVendors.length > 0 && (
                                                <div className="absolute top-0 left-6 right-6 h-[3px] rounded-t-3xl overflow-hidden flex">
                                                    {crateVendors.slice(0, 4).map(v => (
                                                        <div key={v.prefix} className="flex-1 h-full" style={{ backgroundColor: v.color }} />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Header: Type Badge + Semantic Status Badge */}
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded border ${tax.badgeStyle}`}>
                                                    {tax.icon} {tax.label}
                                                </span>

                                                {/* Semantic Status Badge: Neutral Slate if empty, Emerald if packed */}
                                                {metrics.itemCount === 0 || crate.status === 'Empty' ? (
                                                    <span className="text-[8px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-(--lq-fill-control) text-(--lq-ink)/60 border border-(--lq-rim-subtle)">
                                                        AVAILABLE · EMPTY
                                                    </span>
                                                ) : (
                                                    <span className="text-[8px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                        PACKED · {metrics.itemCount} ITEMS
                                                    </span>
                                                )}
                                            </div>

                                            {/* Wireframe Representation */}
                                            <div className="my-2 py-1 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                                                <WireframeCrate
                                                    w={crate.width_cm}
                                                    l={crate.length_cm}
                                                    h={crate.height_cm}
                                                    type={tax.category}
                                                    selected={isSelected}
                                                    size={75}
                                                    vibrant={isSelected}
                                                />
                                            </div>

                                            {/* Container ID & Vendor Tags */}
                                            <div className="mt-auto">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h3 className="text-xs font-black text-(--lq-ink) uppercase tracking-wider truncate">
                                                        {crate.id}
                                                    </h3>
                                                    <span className="text-[10px] font-mono font-bold text-(--lq-ink)/50">
                                                        {crate.width_cm}×{crate.length_cm}×{crate.height_cm} CM
                                                    </span>
                                                </div>

                                                {/* Vendor chips if present */}
                                                {crateVendors.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {crateVendors.slice(0, 3).map(v => (
                                                            <span
                                                                key={v.prefix}
                                                                className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none"
                                                                style={{ backgroundColor: v.color, color: getTextContrast(v.color) }}
                                                            >
                                                                {v.prefix}
                                                            </span>
                                                        ))}
                                                        {crateVendors.length > 3 && (
                                                            <span className="text-[8px] font-black text-(--lq-ink)/40">+{crateVendors.length - 3}</span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Smart Fit Recommendation Badge */}
                                                <div className="mb-2">
                                                    {metrics.isOverCapacity ? (
                                                        <span className="inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                                            OVER CAPACITY (+{(metrics.projectedFillPct - 100).toFixed(0)}%)
                                                        </span>
                                                    ) : metrics.isRecommended ? (
                                                        <span className="inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                                            RECOMMENDED FIT (+{metrics.deltaFillPct.toFixed(0)}% FILL)
                                                        </span>
                                                    ) : metrics.fitsStaged ? (
                                                        <span className="inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                            FITS STAGED (+{metrics.deltaFillPct.toFixed(0)}%)
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {/* Visual Capacity Gauge */}
                                                <div className="flex flex-col gap-1 pt-2 border-t border-(--lq-rim-subtle)">
                                                    <div className="flex items-center justify-between text-[8px] font-mono text-(--lq-ink)/40">
                                                        <span>Fill: {metrics.currentFillPct.toFixed(0)}%</span>
                                                        <span className={metrics.projectedFillPct > 100 ? 'text-rose-400 font-bold' : 'text-cyan-300 font-bold'}>
                                                            Projected: {metrics.projectedFillPct.toFixed(0)}%
                                                        </span>
                                                    </div>

                                                    <div className="h-1.5 w-full bg-(--lq-fill-control) rounded-full overflow-hidden flex relative">
                                                        {/* Current Fill */}
                                                        {metrics.currentFillPct > 0 && (
                                                            <div 
                                                                className="h-full bg-(--lq-ink)/30" 
                                                                style={{ width: `${Math.min(100, metrics.currentFillPct)}%` }} 
                                                            />
                                                        )}
                                                        {/* Projected Added Staged Fill */}
                                                        <div 
                                                            className={`h-full ${
                                                                metrics.projectedFillPct > 100 
                                                                    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' 
                                                                    : 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                                                            }`} 
                                                            style={{ width: `${Math.min(100 - metrics.currentFillPct, metrics.deltaFillPct)}%` }} 
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Top-Right Selection Indicator */}
                                            {isSelected && (
                                                <div className="absolute top-4 right-4 text-(--main-color)">
                                                    <CheckCircle2 size={18} strokeWidth={2.5} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 2: REVIEW MANIFEST ── */}
                {step === 'REVIEW_PACK' && selectedCrate && activeSelectedMetrics && (() => {
                    const crateVendors = getCrateVendors(selectedCrate, inventory);
                    const primaryColor = crateVendors[0]?.color || 'var(--main-color)';
                    const tax = getContainerCategory(selectedCrate);
                    const isCustomBox = selectedCrate.id === AUTOFIT_CRATE_ID;

                    return (
                        <div className="flex-1 flex flex-col lg:flex-row min-h-0 px-6 sm:px-10 pt-6 pb-36 gap-8 overflow-hidden">
                            
                            {/* LEFT COLUMN: Target Container Specs + Wireframe Preview + Boxes Telemetry */}
                            <div className="w-full lg:w-1/2 flex flex-col overflow-y-auto no-scrollbar gap-6 pr-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-(--lq-rim-subtle) pb-8 lg:pb-0">
                                
                                {/* Target Container Header Card */}
                                <div className="p-6 rounded-3xl liquid-panel flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded border ${tax.badgeStyle}`}>
                                                    {tax.icon} {tax.label}
                                                </span>
                                                <span className="text-[8px] font-bold text-(--lq-ink)/40 uppercase tracking-widest">
                                                    Target Destination
                                                </span>
                                            </div>
                                            <h2 className="text-2xl font-black text-(--lq-ink) uppercase tracking-wider">
                                                {selectedCrate.id}
                                            </h2>
                                        </div>

                                        <div className="shrink-0">
                                            <WireframeCrate 
                                                w={selectedCrate.width_cm} 
                                                l={selectedCrate.length_cm} 
                                                h={selectedCrate.height_cm} 
                                                type={tax.category} 
                                                selected 
                                                vibrant 
                                                size={85} 
                                            />
                                        </div>
                                    </div>

                                    {/* Dimensions & Tare Specs */}
                                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-(--lq-rim-subtle) text-center">
                                        <div className="p-3 rounded-2xl bg-(--lq-fill-control) border border-(--lq-rim-subtle)">
                                            <span className="block text-[8px] font-black text-(--lq-ink)/40 uppercase tracking-widest mb-1">Dimensions</span>
                                            <span className="text-xs font-mono font-bold text-(--lq-ink)">
                                                {selectedCrate.width_cm}×{selectedCrate.length_cm}×{selectedCrate.height_cm} CM
                                            </span>
                                        </div>

                                        <div className="p-3 rounded-2xl bg-(--lq-fill-control) border border-(--lq-rim-subtle)">
                                            <span className="block text-[8px] font-black text-(--lq-ink)/40 uppercase tracking-widest mb-1">Tare Weight</span>
                                            <span className="text-xs font-mono font-bold text-(--lq-ink)">
                                                {(selectedCrate.weight_kg || 1).toFixed(1)} KG
                                            </span>
                                        </div>

                                        <div className="p-3 rounded-2xl bg-(--lq-fill-control) border border-(--lq-rim-subtle)">
                                            <span className="block text-[8px] font-black text-(--lq-ink)/40 uppercase tracking-widest mb-1">Internal Volume</span>
                                            <span className="text-xs font-mono font-bold text-cyan-400">
                                                {(activeSelectedMetrics.internalVol / 1000).toFixed(1)} L
                                            </span>
                                        </div>
                                    </div>

                                    {/* Warehouse / Pallet Rack Location Input */}
                                    <div className="flex flex-col gap-1.5 pt-2">
                                        <label className="text-[9px] font-black text-(--lq-ink)/40 uppercase tracking-widest flex items-center gap-1.5">
                                            <MapPin size={12} className="text-amber-400" />
                                            {tr("Warehouse / Pallet Location (Optional)")}
                                        </label>
                                        <input
                                            type="text"
                                            value={crateLocation}
                                            onChange={e => setCrateLocation(e.target.value)}
                                            placeholder={selectedCrate.location || "e.g. Rack A-04, Bay 2, Dock 1"}
                                            className="w-full bg-(--lq-fill-control) border border-(--lq-rim-subtle) focus:border-cyan-500/50 rounded-xl px-4 py-2.5 text-xs text-(--lq-ink) focus:outline-none transition-all placeholder:text-(--lq-ink)/30 font-medium"
                                        />
                                    </div>
                                </div>

                                {/* Boxes.py Laser Cutfile Telemetry Card (if custom box or laser container) */}
                                {customBoxesCrate && (
                                    <div className="p-6 rounded-3xl liquid-panel border-cyan-500/30 flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Scissors size={16} className="text-cyan-400" />
                                                <h4 className="text-xs font-black text-cyan-300 uppercase tracking-widest">
                                                    {tr("Laser cut estimate (approximate)")}
                                                </h4>
                                            </div>
                                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                                                {customBoxesCrate.generator}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/20">
                                                <span className="block text-[8px] font-bold text-cyan-400/60 uppercase">Perimeter</span>
                                                <span className="text-xs font-mono font-bold text-(--lq-ink)">
                                                    {(customBoxesCrate.cutTelemetry.totalPerimeterMm / 10).toFixed(0)} cm
                                                </span>
                                            </div>

                                            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/20">
                                                <span className="block text-[8px] font-bold text-cyan-400/60 uppercase">Cut Time</span>
                                                <span className="text-xs font-mono font-bold text-(--lq-ink)">
                                                    {customBoxesCrate.cutTelemetry.estCutTimeSec}s
                                                </span>
                                            </div>

                                            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/20">
                                                <span className="block text-[8px] font-bold text-cyan-400/60 uppercase">Thickness</span>
                                                <span className="text-xs font-mono font-bold text-(--lq-ink)">
                                                    6.0 mm
                                                </span>
                                            </div>

                                            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/20">
                                                <span className="block text-[8px] font-bold text-cyan-400/60 uppercase">Nesting</span>
                                                <span className="text-xs font-mono font-bold text-emerald-400">
                                                    {customBoxesCrate.cutTelemetry.nestingEfficiencyPct}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[9px] text-cyan-400/80 pt-2 border-t border-cyan-500/20">
                                            <span>Material: Baltic Birch / Plywood</span>
                                            <button
                                                type="button"
                                                onClick={() => handleLaunch3DStudio(selectedCrate.id)}
                                                className="text-cyan-300 hover:text-(--lq-ink) underline font-bold flex items-center gap-1"
                                            >
                                                Inspect 2D / 3D Layout <ArrowUpRight size={11} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Volumetric & Weight Gauges */}
                                <div className="grid grid-cols-2 gap-4 p-6 rounded-3xl liquid-panel">
                                    {/* Volume Gauge */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <Layers className="text-cyan-400" size={15} />
                                            <span className="text-[9px] font-black text-(--lq-ink)/40 uppercase tracking-widest">
                                                {tr("Volumetric Fill")}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className={`text-4xl font-black tabular-nums ${activeSelectedMetrics.projectedFillPct > 100 ? 'text-rose-500' : 'text-(--lq-ink)'}`}>
                                                {activeSelectedMetrics.projectedFillPct.toFixed(0)}
                                            </span>
                                            <span className="text-sm font-black text-(--lq-ink)/30">%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-(--lq-fill-control) rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-700 ${
                                                    activeSelectedMetrics.projectedFillPct > 100 ? 'bg-rose-500' : 'bg-cyan-400'
                                                }`}
                                                style={{ width: `${Math.min(100, activeSelectedMetrics.projectedFillPct)}%` }} 
                                            />
                                        </div>
                                    </div>

                                    {/* Weight Gauge */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <Weight className="text-emerald-400" size={15} />
                                            <span className="text-[9px] font-black text-(--lq-ink)/40 uppercase tracking-widest">
                                                {tr("Total Weight")}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl font-black tabular-nums text-(--lq-ink)">
                                                {activeSelectedMetrics.totalWeight.toFixed(1)}
                                            </span>
                                            <span className="text-sm font-black text-(--lq-ink)/30">KG</span>
                                        </div>
                                        <span className="text-[8px] font-mono text-(--lq-ink)/40 uppercase">
                                            Payload + {(selectedCrate.weight_kg || 0).toFixed(1)}kg tare
                                        </span>
                                    </div>
                                </div>

                                {activeSelectedMetrics.projectedFillPct > 100 && (
                                    <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-400">
                                        <Maximize2 className="shrink-0" size={18} />
                                        <div className="text-xs">
                                            <p className="font-black uppercase">{tr("Volume Overload")}</p>
                                            <p className="text-[10px] text-rose-300/80">
                                                {(activeSelectedMetrics.projectedFillPct - 100).toFixed(0)}% {tr("over capacity. Items may not fit safely.")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT COLUMN: Staged Items Manifest with Quantity Steppers */}
                            <div className="w-full lg:w-1/2 flex flex-col min-h-0 overflow-hidden">
                                <div className="flex items-center justify-between pb-4 shrink-0 border-b border-(--lq-rim-subtle) mb-4">
                                    <div>
                                        <h3 className="text-lg font-black text-(--lq-ink) uppercase tracking-wider">
                                            {tr("Staging List")}
                                        </h3>
                                        <p className="text-[9px] text-(--lq-ink)/40 font-bold uppercase tracking-widest">
                                            {selectedItems.length} {tr("Items")} · {stagedMetrics.totalUnits} {tr("Total Units to Pack")}
                                        </p>
                                    </div>
                                    <span className="text-3xl font-black tabular-nums text-(--lq-ink)/80">
                                        {selectedItems.length}
                                    </span>
                                </div>

                                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pb-20">
                                    {selectedItems.map(item => {
                                        const rawId = (item.norm.itemId || item.norm.tag_id || '').toUpperCase();
                                        const vendorKey = Object.keys(vendors).sort((a, b) => b.length - a.length).find(k => rawId.startsWith(k));
                                        const vColor = vendorKey ? getVendorColor(vendorKey) : '#555';
                                        const currentPackQty = packQuantities[item.row] ?? (item.norm.quantity || 1);
                                        const maxAvailableQty = item.norm.quantity || 1;

                                        return (
                                            <div 
                                                key={item.row} 
                                                className="flex items-center gap-3 p-3 rounded-2xl liquid-panel hover:bg-(--lq-fill-control-hover) border border-(--lq-rim-subtle) transition-all group"
                                            >
                                                <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: vColor }} />
                                                
                                                <div className="w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-(--lq-rim-subtle)">
                                                    <img 
                                                        src={getCleanImageUrl(item.norm.mediaUrls?.split(',')[0])} 
                                                        className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all" 
                                                        alt={item.norm.itemId}
                                                    />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        {vendorKey && (
                                                            <span 
                                                                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded leading-none" 
                                                                style={{ backgroundColor: vColor, color: getTextContrast(vColor) }}
                                                            >
                                                                {vendorKey}
                                                            </span>
                                                        )}
                                                        <span className="text-[9px] font-black text-(--lq-ink)/50 uppercase tracking-wider font-mono">
                                                            {item.norm.itemId}
                                                        </span>
                                                    </div>

                                                    <h5 className="text-xs font-bold text-(--lq-ink) uppercase truncate">
                                                        {item.norm.shortDescription || tr("Inventory Item")}
                                                    </h5>

                                                    <p className="text-[8px] font-mono text-(--lq-ink)/30 uppercase mt-0.5">
                                                        {item.norm.widthCm}×{item.norm.lengthCm}×{item.norm.heightCm} CM · {item.norm.weightKg} KG
                                                    </p>
                                                </div>
                                                
                                                {/* Quantity Selector Stepper */}
                                                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                                    <div className="flex items-center gap-2 bg-(--lq-fill-control) border border-(--lq-rim-subtle) rounded-xl px-2 py-1">
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setPackQuantities(prev => ({ 
                                                                ...prev, 
                                                                [item.row]: Math.max(1, (prev[item.row] ?? (item.norm.quantity || 1)) - 1) 
                                                            }))}
                                                            className="w-5 h-5 flex items-center justify-center text-(--lq-ink)/40 hover:text-(--lq-ink) hover:bg-(--lq-fill-control-hover) rounded transition-all cursor-pointer"
                                                        >
                                                            -
                                                        </button>

                                                        <span className="text-xs font-black w-5 text-center tabular-nums text-(--lq-ink)">
                                                            {currentPackQty}
                                                        </span>

                                                        <button 
                                                            type="button" 
                                                            onClick={() => setPackQuantities(prev => ({ 
                                                                ...prev, 
                                                                [item.row]: Math.min(maxAvailableQty, (prev[item.row] ?? (item.norm.quantity || 1)) + 1) 
                                                            }))}
                                                            className="w-5 h-5 flex items-center justify-center text-(--lq-ink)/40 hover:text-(--lq-ink) hover:bg-(--lq-fill-control-hover) rounded transition-all disabled:opacity-20 cursor-pointer"
                                                            disabled={currentPackQty >= maxAvailableQty}
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    <span className="text-[8px] font-mono font-bold text-(--lq-ink)/30 uppercase">
                                                        Max: {maxAvailableQty}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ━━ 4. DEDICATED BOTTOM GLASS ACTION DOCK (Two-Layer Liquid Glass) ━━ */}
            <div className="shrink-0 border-t border-(--lq-rim-subtle) bg-(--lq-fill-panel) text-(--lq-ink) px-6 sm:px-10 py-4 flex flex-wrap items-center justify-between gap-4 z-20">
                {/* Left: Telemetry status & Back button */}
                <div className="flex items-center gap-4">
                    {step === 'REVIEW_PACK' ? (
                        <button 
                            onClick={() => setStep('SELECT_CRATE')} 
                            className="flex items-center gap-2 text-xs font-black text-(--lq-ink)/50 uppercase tracking-wider hover:text-(--lq-ink) transition-all group cursor-pointer"
                        >
                            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                            {tr("Back to Containers")}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 text-(--lq-ink)/30 text-[9px] font-black uppercase tracking-widest">
                            <Info size={13} className="text-cyan-400/60" />
                            <span>{tr("Persisted to Global Logistics Manifest")}</span>
                        </div>
                    )}
                </div>

                {/* Right: Tactile Action Buttons */}
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="px-6 h-12 rounded-xl border border-(--lq-rim-subtle) text-xs font-black uppercase tracking-wider text-(--lq-ink)/40 hover:text-(--lq-ink) hover:bg-(--lq-fill-control) transition-all active:scale-95 cursor-pointer"
                    >
                        {tr("Cancel / Abort")}
                    </button>

                    {/* Launch 3D Packing Studio Button */}
                    <button 
                        onClick={() => handleLaunch3DStudio()}
                        className="hidden sm:flex items-center gap-2 px-5 h-12 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
                        title={tr("Open in 3D Crate Packing & Boxes.py Studio")}
                    >
                        <Rotate3d size={16} className="text-cyan-400" />
                        <span>{tr("3D Studio")}</span>
                    </button>

                    {/* Primary CTA */}
                    {step === 'SELECT_CRATE' ? (
                        <button
                            onClick={() => setStep('REVIEW_PACK')}
                            disabled={!selectedCrate}
                            className="px-8 h-12 rounded-xl bg-white text-black text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all disabled:opacity-20 flex items-center gap-2 shadow-lg cursor-pointer"
                        >
                            <span>{tr("Review Manifest")}</span>
                            <ChevronRight size={16} strokeWidth={2.5} />
                        </button>
                    ) : (
                        <button
                            onClick={handleConfirmPack}
                            disabled={isPacking}
                            className="px-8 h-12 rounded-xl text-black text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all disabled:opacity-30 flex items-center gap-2 shadow-[0_0_40px_rgba(var(--main-color-rgb),0.35)] bg-(--main-color) cursor-pointer"
                        >
                            {isPacking ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    <span>{tr("Packing...")}</span>
                                </>
                            ) : (
                                <>
                                    <Zap size={16} />
                                    <span>{tr(`Confirm & Pack ${stagedMetrics.totalUnits} Units`)}</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

        </div>
        </>
    );
};
