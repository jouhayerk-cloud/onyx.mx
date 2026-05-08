import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    activeViewAtom, 
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    logisticsSubTabAtom,
    isInventoryViewSliderOpenAtom,
    inventoryViewSliderAtom,
    inventoryViewModeAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryStatusFilterAtom,
    inventoryAtom,
    inventoryVendorFilterAtom,
    activeVendorsAtom,
    inventoryCategoryFilterAtom,
    inventoryMaterialFilterAtom,
    inventorySortKeyAtom,
    inventorySortOrderAtom,
    InventoryVersionAtom,
    isUploadWizardOpenAtom,
    isPaymentsSearchOpenAtom,
    filteredInventoryIdsAtom,
    financeSearchTermAtom,
    isPaymentFiltersOpenAtom,
    paymentStatusFilterAtom,
    paymentCategoryFilterAtom,
    paymentDestinationFilterAtom,
    paymentsOverviewModeAtom,
    currencyModeAtom,
    isPaymentActionPanelOpenAtom,
    isPaymentQueueOpenAtom,
    isPaymentUpcomingOpenAtom,
    isPaymentPendingBarOpenAtom,
    isFinanceScrolledAtom,
    financeTotalsAtom,
    financeDataAtom,
    paymentsArtifactConfigAtom,
    exchangeRateAtom,
    liveExchangeRateAtom,
    truckShowSaveDraftAtom,
    truckShowOpenDraftAtom,
    truckShowExportModalAtom,
    truckShowReadyWizardAtom,
    truckIsBusyAtom,
    truckShowPanelsAtom,
    truckTopBarStateAtom,
    truckingDockCratesAtom,
    truckingTotalWeightAtom,
    truckingFloorPctAtom,
    truckingRecalledShipmentAtom,
    truckingAllCratesAtom,
    truckingPositionsAtom,
    logisticsDocsAtom,
    isInventorySearchOpenAtom,
    inventorySearchTermAtom,
    truckDockIsCompactAtom,
    truckStatsIsCompactAtom,
    truckingReadyFieldsAtom
} from '../../lib/atoms';
import { 
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus, DollarSign, Minimize2, Maximize2, Cpu, Calendar, Activity, Archive, Users, LayoutGrid, LayoutList, Layout, ChevronUp, ChevronDown, Activity as Heartbeat, Wallet, ShoppingCart, ShoppingBag, Package, Hammer, FlaskConical, Truck, ArrowUp, ArrowDown, History, Save, Hourglass
} from 'lucide-react';
import { vendors } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';
import { CompactDockCard, DeployedTrailerCard } from '../logistics/TruckingModule';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { normalizeInventoryData } from '../../lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

// ── Components ───────────────────────────────────────────────────────────────

const ActiveRequestGridItem: React.FC<{
    label: string;
    amount: number;
    color: string;
    type: string;
    currencyMode: string;
    exRate: number;
    onClick: () => void;
}> = ({ label, amount, color, type, currencyMode, exRate, onClick }) => {
    const isMerch = type?.toLowerCase().includes('acq') || type?.toLowerCase().includes('prod');
    const Icon = isMerch ? ShoppingCart : Package;
    const finalAmount = currencyMode === 'MXN' ? amount : amount / exRate;

    return (
        <div 
            onClick={onClick}
            className="flex flex-col justify-between p-4 h-28 cursor-pointer transition-all hover:brightness-110 active:scale-95 group relative overflow-hidden"
            style={{ backgroundColor: `${color}40` }}
        >
            <div className="flex items-start justify-between">
                <span className="text-[12px] font-black text-white/60 uppercase tracking-[0.2em] truncate max-w-[80%]">{label}</span>
                <Icon size={16} className="text-white/40" />
            </div>
            
            <div className="flex flex-col">
                <span className="text-[28px] font-black text-white leading-none tracking-tighter">
                    {currencyMode === 'MXN' ? fmtMXN(amount) : fmtUSD(finalAmount)}
                </span>
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-2 truncate">{type || 'General'}</span>
            </div>

            {/* Shine effect */}
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
    );
};

const UpcomingGridItem: React.FC<{
    label: string;
    amount: number;
    color: string;
    type: string;
    currencyMode: string;
    exRate: number;
    onClick: () => void;
}> = ({ label, amount, color, type, currencyMode, exRate, onClick }) => {
    const finalAmount = currencyMode === 'MXN' ? amount : amount / exRate;
    return (
        <div 
            onClick={onClick}
            className="flex flex-col justify-center p-4 h-20 cursor-pointer transition-all hover:brightness-125 active:scale-95 group relative overflow-hidden"
            style={{ backgroundColor: `${color}15` }}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[18px] font-black text-white leading-none tracking-tighter">
                    {currencyMode === 'MXN' ? fmtMXN(amount) : fmtUSD(finalAmount)}
                </span>
                <div className="px-2.5 py-1 rounded-md shadow-sm shrink-0" style={{ backgroundColor: color }}>
                    <span className="text-[12px] font-black text-black uppercase tracking-tighter">{label}</span>
                </div>
            </div>
            <div className="flex items-center justify-between mt-2">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{type}</span>
            </div>
            
            {/* Selection indicator overlay */}
            <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={10} className="text-white/40" />
            </div>
        </div>
    );
};

const SectionHeader: React.FC<{
    icon: any;
    title: string;
    count?: number;
    amount?: number;
    isOpen: boolean;
    onToggle: () => void;
    minimal?: boolean;
    currencyMode?: string;
    exRate?: number;
}> = ({ icon: Icon, title, count, amount, isOpen, onToggle, minimal, currencyMode = 'MXN', exRate = 1 }) => {
    const finalAmount = currencyMode === 'MXN' ? amount : (amount || 0) / exRate;
    return (
        <div className={`flex items-center justify-between transition-all group cursor-pointer ${minimal ? 'px-4 py-3' : 'px-4 py-4'}`} onClick={onToggle}>
            <div className="flex items-center gap-6">
                <div className={`transition-all duration-500 ${isOpen ? 'text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.8)]' : 'text-white/20'}`}>
                    <Icon size={minimal ? 20 : 28} strokeWidth={3} />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className={`${minimal ? 'text-[11px]' : 'text-[16px]'} font-black text-white uppercase tracking-[0.3em]`}>{title}</span>
                    {!minimal && (
                        <div className="flex items-center gap-4">
                            {count !== undefined && <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{count} UNITS</span>}
                            {amount !== undefined && (
                                <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em]">
                                        {currencyMode === 'MXN' ? fmtMXN(amount) : fmtUSD(finalAmount)} {currencyMode}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className={`transition-all duration-500 ${isOpen ? 'rotate-180 text-white' : 'text-white/10'}`}>
                <ChevronDown size={minimal ? 20 : 28} strokeWidth={4} />
            </div>
        </div>
    );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    
    // Inventory States
    const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
    const [invMode, setInvMode] = useAtom(inventoryViewModeAtom);
    const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
    const [invSearchTerm, setInvSearchTerm] = useAtom(inventorySearchTermAtom);
    const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const invCategoryFilter = useAtomValue(inventoryCategoryFilterAtom);
    const invMaterialFilter = useAtomValue(inventoryMaterialFilterAtom);
    const filteredIds = useAtomValue(filteredInventoryIdsAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);

    const handleToggleDensity = () => {
        if (invSlider <= 33) {
            setInvSlider(50);
            setInvMode('grid');
        } else if (invSlider <= 66) {
            setInvSlider(85);
            setInvMode('gallery');
        } else {
            setInvSlider(15);
            setInvMode('list');
        }
    };
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const setInvVersion = useSetAtom(InventoryVersionAtom);
    
    // Finance States
    const [isFinSearchOpen, setIsFinSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
    const [finSearchTerm, setFinSearchTerm] = useAtom(financeSearchTermAtom);
    const [isFinFiltersOpen, setIsFinFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
    const [isFinActionOpen, setIsFinActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
    const [isFinQueueOpen, setIsFinQueueOpen] = useAtom(isPaymentQueueOpenAtom);
    const [isFinUpcomingOpen, setIsFinUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
    
    const [finCategoryFilter, setFinCategoryFilter] = useAtom(paymentCategoryFilterAtom);
    const [finDestFilter, setFinDestFilter] = useAtom(paymentDestinationFilterAtom);
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
    const financeTotals = useAtomValue(financeTotalsAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const liveEx = useAtomValue(liveExchangeRateAtom);
    const fixedEx = useAtomValue(exchangeRateAtom);
    const exRate = liveEx || fixedEx;

    // Trucking States
    const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
    const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
    const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
    const [showReadyWizard, setShowReadyWizard] = useAtom(truckShowReadyWizardAtom);
    const truckBusy = useAtomValue(truckIsBusyAtom);
    const showPanels = useAtomValue(truckShowPanelsAtom);
    const topBarState = useAtomValue(truckTopBarStateAtom);
    const [positions, setPositions] = useAtom(truckingPositionsAtom);
    const [recalledShipment, setRecalledShipment] = useAtom(truckingRecalledShipmentAtom);
    const dockCrates = useAtomValue(truckingDockCratesAtom);
    const allCrates = useAtomValue(truckingAllCratesAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const totalWeight = useAtomValue(truckingTotalWeightAtom);
    const floorPct = useAtomValue(truckingFloorPctAtom);
    const [isDockCompact, setIsDockCompact] = useAtom(truckDockIsCompactAtom);
    const [isStatsCompact, setIsStatsCompact] = useAtom(truckStatsIsCompactAtom);
    const readyFields = useAtomValue(truckingReadyFieldsAtom);
    const [recentShipments, setRecentShipments] = useState<any[]>([]);

    useEffect(() => {
        if (activeView === 'trucking' && topBarState === 'trailers') {
            const fetchRecent = async () => {
                try {
                    const { data, error } = await supabase.from('shipments')
                        .select('*')
                        .order('timestamp', { ascending: false })
                        .limit(10);
                    if (!error) setRecentShipments(data || []);
                } catch (err) { console.error('Recent shipments fetch error:', err); }
            };
            fetchRecent();
        }
    }, [activeView, topBarState]);

    const handleRecall = (shipment: any) => {
        setRecalledShipment(shipment);
        toast.success(`Recalling manifest ${shipment.manifest_id}`);
    };

    const handleDeleteShipment = async (id: string) => {
        if (!confirm('Delete this shipment record permanently?')) return;
        try {
            const { error } = await supabase.from('shipments').delete().eq('id', id);
            if (error) throw error;
            setRecentShipments(s => s.filter(x => x.id !== id));
            toast.success('Shipment deleted');
        } catch (e) { toast.error('Failed to delete shipment'); }
    };

    // Inventory Atoms for Filtering
    const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [invSortKey, setInvSortKey] = useAtom(inventorySortKeyAtom);
    const [invSortOrder, setInvSortOrder] = useAtom(inventorySortOrderAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);

    const activeQueueRecords = useMemo(() => 
        financeDocs.filter(r => r.status === 'Requested'), 
    [financeDocs]);

    const activeQueueTotal = useMemo(() => 
        activeQueueRecords.reduce((s, r) => s + (r.amount || 0) + (r.commission || 0), 0),
    [activeQueueRecords]);

    const upcomingRecords = useMemo(() => 
        financeDocs.filter(r => String(r.status || '').toLowerCase() === 'upcoming' || String(r.status || '').toLowerCase() === 'pending'), 
    [financeDocs]);

    const upcomingTotal = useMemo(() => 
        upcomingRecords.reduce((s, r) => s + (r.amount || 0) + (r.commission || 0), 0),
    [upcomingRecords]);

    const autoGenPayments = useMemo(() => {
        // 1. Identify all potentially unpaid items
        const targetStatuses = ['acquired', 'acquisition', 'acquisitions', 'production', 'new', 'scheduled', 'ready'];
        const targetInventory = allInventory.filter(i => {
            const norm = normalizeInventoryData(i.data);
            const status = (norm.status || '').toLowerCase();
            const payReqStr = String(norm.payReq || '').toLowerCase();
            const workbook = String(norm.workbook || '').toLowerCase();
            
            if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid') return false;
            const isUnpaid = !['true', 'paid'].includes(payReqStr);
            return targetStatuses.includes(status) && isUnpaid;
        });

        // 2. Group by Vendor AND Type (Production vs Acquisition)
        const groups: Record<string, { vendor: string, type: 'Acq' | 'Prod', items: any[], total: number }> = {};
        
        targetInventory.forEach(item => {
            const norm = normalizeInventoryData(item.data);
            const v = norm.vendorId || 'Unknown';
            const status = (norm.status || '').toLowerCase();
            const type = (status === 'production' || status === 'packing') ? 'Prod' : 'Acq';
            const gKey = `${v}-${type}`;

            if (!groups[gKey]) {
                groups[gKey] = { vendor: v, type, items: [], total: 0 };
            }
            const price = parseFloat(norm.price) || 0;
            const qty = parseInt(norm.quantity) || 1;
            groups[gKey].items.push(item);
            groups[gKey].total += (price * qty);
        });

        // 3. Calculate paid offsets for each group to get true balance
        return Object.entries(groups).map(([gKey, group]) => {
            const itemIds = new Set(group.items.map(i => String(i.data?.id || i.row)));
            
            // Sum all expenses related to these items
            const paidTotal = financeDocs.reduce((sum, exp) => {
                if (exp.vendor_id !== group.vendor) return sum;
                if (!['Requested', 'Paid', 'Sent', 'Dispersed'].includes(exp.status)) return sum;
                
                const relIds = Array.isArray(exp.related_ids) ? exp.related_ids : (typeof exp.related_inventory_ids === 'string' ? exp.related_inventory_ids.split(',') : []);
                const isRel = relIds.some((id: any) => itemIds.has(String(id)));
                
                return isRel ? sum + (exp.amount || 0) : sum;
            }, 0);

            const balance = group.total - paidTotal;

            if (balance <= 0.5) return null; // Skip if basically paid

            return {
                id: `auto-${gKey}`,
                vendor_id: group.vendor,
                description: `${group.items.length} ${group.type === 'Acq' ? 'Acquisition' : 'Production'} Items`,
                amount: Math.round(balance),
                status: 'Upcoming',
                subcategory: group.type === 'Acq' ? 'Acquisition' : 'Production',
                related_inventory_ids: Array.from(itemIds),
                is_auto_gen: true
            };
        }).filter(Boolean);
    }, [allInventory, financeDocs]);

    const combinedUpcoming = useMemo(() => [...upcomingRecords, ...autoGenPayments], [upcomingRecords, autoGenPayments]);
    const combinedUpcomingTotal = useMemo(() => combinedUpcoming.reduce((s, r) => s + (r.amount || 0), 0), [combinedUpcoming]);

    const handleSelectAll = () => {
        setSelectedIds(filteredIds);
        toast.success(`Selected ${filteredIds.length} items`);
    };
    
    if (!activeView) return null;

    const isInventory = activeView === 'inventory';
    const isFinance = activeView === 'finance';
    const isTrucking = activeView === 'trucking';

    if (!isInventory && !isFinance && !isTrucking) return null;


    return (
        <div className="flex flex-col w-full z-50">
            {/* ── TOP BAR (SEARCH/SLIDERS) ────────────────────────────────────────────────────────── */}
            {((isInventory && (isInvSearchOpen || isInvViewSliderOpen)) || (isFinance && isFinSearchOpen)) && (
                <div className="w-full animate-in slide-in-from-top duration-500 overflow-hidden pr-4 pl-4">
                    <div className="w-full mx-auto px-6 py-3 flex flex-col gap-4">
                        {isInventory && isInvSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all">
                                <Search size={24} strokeWidth={3} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder="SEARCH INVENTORY..." className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {invSearchTerm && <button onClick={() => setInvSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={24} strokeWidth={3} /></button>}
                            </div>
                        )}
                        {isInventory && isInvViewSliderOpen && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full animate-in slide-in-from-top-4 duration-500 py-2 gap-6 sm:gap-0">
                                <div className="flex items-center gap-8 w-full sm:w-1/2">
                                    <div className="flex items-center gap-3 shrink-0">
                                        <button 
                                            onClick={handleToggleDensity}
                                            className="relative w-12 h-12 flex items-center justify-center overflow-hidden group/view transition-transform active:scale-90"
                                        >
                                            <div className="transition-all duration-300 ease-out flex items-center justify-center"
                                                 style={{ 
                                                     transform: `scale(${1 + (invSlider / 100) * 0.8})`,
                                                     color: invSlider > 66 ? 'var(--main-color)' : 'white'
                                                 }}>
                                                {invSlider <= 33 ? <LayoutList size={20} strokeWidth={2.5} /> : 
                                                 invSlider <= 66 ? <LayoutGrid size={20} strokeWidth={2.5} /> : 
                                                 <Layout size={20} strokeWidth={2.5} />}
                                            </div>
                                            <div className="absolute inset-0 opacity-20 transition-all duration-500"
                                                 style={{ 
                                                     background: `radial-gradient(circle, var(--main-color) 0%, transparent 70%)`,
                                                     opacity: (invSlider / 100) * 0.3
                                                 }} />
                                        </button>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] leading-none mb-1">Density</span>
                                            <span className="text-[14px] font-black text-white uppercase tracking-tighter">
                                                {invSlider <= 33 ? 'Compact' : invSlider <= 66 ? 'Standard' : 'Spacious'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex-1 relative flex items-center group px-4">
                                        <div className="absolute left-4 right-4 h-1.5 bg-white/5 rounded-full" />
                                        <div className="absolute left-4 h-1.5 bg-white/20 rounded-full transition-all duration-300" 
                                             style={{ width: `calc(${(invSlider / 100) * 100}% - 8px)` }} />
                                        <input 
                                            type="range" min="1" max="100" step="1" value={invSlider} 
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setInvSlider(val);
                                                if (val <= 33) setInvMode('list');
                                                else if (val <= 66) setInvMode('grid');
                                                else setInvMode('gallery');
                                            }}
                                            className="w-full h-8 bg-transparent appearance-none cursor-pointer relative z-10 
                                                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
                                                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(255,255,255,0.5)]
                                                       [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:transition-transform"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 shrink-0 sm:justify-end">
                                    <div className="flex items-center gap-2 text-white/20 uppercase font-black text-[9px] tracking-[0.2em] shrink-0">
                                        <ArrowUpDown size={14} />
                                        <span>SORT BY</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {[
                                            { key: 'Date', label: 'DATE' },
                                            { key: 'Vendor', label: 'VENDOR' },
                                            { key: 'Status', label: 'STATUS' },
                                            { key: 'Number', label: 'NUM' },
                                            { key: 'Value', label: 'VALUE' },
                                            { key: 'Qty', label: 'QTY' }
                                        ].map(sort => (
                                            <button key={sort.key} onClick={() => {
                                                if (invSortKey === sort.key) setInvSortOrder(invSortOrder === 'asc' ? 'desc' : 'asc');
                                                else { setInvSortKey(sort.key as any); setInvSortOrder('desc'); }
                                            }} className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-black text-[9px] tracking-wider ${invSortKey === sort.key ? 'bg-white text-black shadow-lg' : 'text-white/20 hover:text-white hover:bg-white/5'}`}>
                                                {sort.label}
                                                {invSortKey === sort.key && (invSortOrder === 'asc' ? <ArrowUp size={10} strokeWidth={4} /> : <ArrowDown size={10} strokeWidth={4} />)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {isFinance && isFinSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all">
                                <Search size={24} strokeWidth={3} className="text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder="SEARCH PAYMENTS..." className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {finSearchTerm && <button onClick={() => setFinSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={24} strokeWidth={3} /></button>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── SELECTION TOOLS ─────────────────────────────────────────────────────────── */}
            {isInventory && isSelectionMode && (
                <div className="w-full border-t border-white/5 animate-in slide-in-from-top duration-500 overflow-hidden px-4 bg-white/[0.02]">
                    <div className="w-full mx-auto px-6 py-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                            <div className="w-12 h-12 rounded-xl bg-(--color-inventory)/10 border border-(--color-inventory)/20 flex items-center justify-center text-(--color-inventory) drop-shadow-[0_0_15px_rgba(var(--color-inventory-rgb),0.3)]">
                                <SquareCheckBig size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] leading-none mb-1">Batch Management</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white tracking-tighter">{selectedIds.length}</span>
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Items Selected</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handleSelectAll}
                                className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 shadow-xl"
                            >
                                <div className="w-5 h-5 rounded-md border-2 border-white/20 group-hover:border-white/40 flex items-center justify-center transition-all">
                                    <div className="w-2 h-2 rounded-sm bg-white scale-0 group-hover:scale-100 transition-transform" />
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.2em]">Select All</span>
                            </button>

                            <button 
                                onClick={() => {
                                    setSelectedIds([]);
                                    toast.success("Selection Cleared");
                                }}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all font-black text-[11px] tracking-widest uppercase active:scale-95"
                            >
                                <X size={16} strokeWidth={3} />
                                <span>Clear</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── FINANCE TOOLS ─────────────────────────────────────────────────────────── */}
            {isFinance && (
                <div className="flex flex-col w-full min-h-0 border-t border-white/5">
                    {isFinFiltersOpen && (
                        <div className="w-full px-8 py-3 animate-in slide-in-from-top-4 duration-500 flex items-center justify-between gap-8 overflow-x-auto no-scrollbar">
                            <div className="flex items-center gap-4 shrink-0">
                                {[
                                    { id: 'All', icon: LayoutGrid, color: '#888' },
                                    { id: 'Acq', icon: DollarSign, color: '#10b981' },
                                    { id: 'Prod', icon: Cpu, color: '#6366f1' },
                                    { id: 'Monthly', icon: Calendar, color: '#38bdf8' },
                                    { id: 'Supplies', icon: Box, color: '#f59e0b' },
                                    { id: 'Labor', icon: Users, color: '#ec4899' },
                                    { id: 'Packing', icon: Archive, color: '#a855f7' },
                                    { id: 'Operations', icon: Activity, color: '#ef4444' },
                                    { id: 'Logistics', icon: Truck, color: '#06b6d4' }
                                ].map(s => {
                                    const Icon = s.icon;
                                    const isActive = finCategoryFilter === s.id;
                                    return (
                                        <button key={s.id} onClick={() => setFinCategoryFilter(s.id as any)} className={`flex flex-col items-center gap-1.5 transition-all shrink-0 ${isActive ? 'scale-110' : 'text-zinc-600 hover:text-white'}`}>
                                            <Icon size={20} strokeWidth={isActive ? 4 : 3} style={{ color: isActive ? 'var(--main-color)' : s.color }} />
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isActive ? 'text-white' : 'text-zinc-500'}`}>{s.id}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-5 shrink-0">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                    <button key={key} onClick={() => setFinDestFilter(finDestFilter === key ? 'All' : key as any)} className={`flex flex-col items-center gap-1 transition-all shrink-0 ${finDestFilter === key ? 'scale-110 grayscale-0 brightness-100' : 'grayscale brightness-50 hover:grayscale-0 hover:brightness-100'}`}>
                                        <img src={cfg.icon} alt={cfg.name} className="w-9 h-4.5 object-contain" />
                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${finDestFilter === key ? 'text-white' : 'text-zinc-500'}`}>{cfg.name.split(' ')[0]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isFinActionOpen && (
                        <div className="w-full border-t border-white/5 px-8 py-4 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                            <SectionHeader icon={Heartbeat} title="Requested" count={activeQueueRecords.length} amount={activeQueueTotal} isOpen={isFinQueueOpen} onToggle={() => setIsFinQueueOpen(!isFinQueueOpen)} currencyMode={currencyMode} exRate={exRate} />
                            {isFinQueueOpen && (
                                <div className={`grid gap-1 overflow-hidden transition-all duration-500 ${activeQueueRecords.length === 0 ? 'grid-cols-1 opacity-10' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                                    {activeQueueRecords.length === 0 ? <div className="py-6 text-center border border-white/5 rounded-2xl"><span className="text-[11px] font-black uppercase tracking-[0.6em]">QUEUE EMPTY</span></div> : activeQueueRecords.map(r => {
                                        const v = r.vendor_id || 'Unknown';
                                        const color = vendors[v as keyof typeof vendors]?.color || '#888';
                                        return <ActiveRequestGridItem key={r.id} label={r.description || v} amount={r.amount} color={color} type={r.subcategory} currencyMode={currencyMode} exRate={exRate} onClick={() => setPaymentsArtifactConfig({ isOpen: true, paymentIds: [r.id], title: `Detail: ${v}` })} />;
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── UPCOMING PAYMENTS (FINANCE ONLY) ─────────────────────────────────────────── */}
            {isFinUpcomingOpen && isFinance && (
                <div className="w-full px-8 py-4 animate-in slide-in-from-top duration-500 overflow-hidden bg-amber-500/5">
                    <SectionHeader 
                        icon={Hourglass} 
                        title="Upcoming Payments" 
                        count={combinedUpcoming.length} 
                        amount={combinedUpcomingTotal} 
                        isOpen={isFinUpcomingOpen} 
                        onToggle={() => setIsFinUpcomingOpen(!isFinUpcomingOpen)} 
                        currencyMode={currencyMode} 
                        exRate={exRate} 
                    />
                    {isFinUpcomingOpen && (
                        <div className={`grid gap-1 overflow-hidden transition-all duration-500 mt-2 ${combinedUpcoming.length === 0 ? 'grid-cols-1 opacity-10' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                            {combinedUpcoming.length === 0 ? (
                                <div className="py-6 text-center border border-white/5 rounded-2xl">
                                    <span className="text-[11px] font-black uppercase tracking-[0.6em]">NO UPCOMING PAYMENTS</span>
                                </div>
                            ) : combinedUpcoming.map(r => {
                                const v = r.vendor_id || 'Unknown';
                                const color = vendors[v as keyof typeof vendors]?.color || '#888';
                                const isAuto = (r as any).is_auto_gen;
                                return (
                                    <div key={r.id} className="relative group">
                                        <ActiveRequestGridItem label={r.description || v} amount={r.amount} color={color} type={r.subcategory} currencyMode={currencyMode} exRate={exRate} onClick={() => setPaymentsArtifactConfig({ isOpen: true, paymentIds: Array.isArray(r.related_inventory_ids) ? r.related_inventory_ids : [r.id], title: isAuto ? `Batch: ${v}` : `Detail: ${v}` })} />
                                        
                                        {/* Vendor Tag (Free Floating High Contrast) */}
                                        <div 
                                            className="absolute bottom-2 right-4 text-[32px] font-black uppercase tracking-tighter pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity"
                                            style={{ color: color, filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.5))' }}
                                        >
                                            {v}
                                        </div>

                                        {isAuto && (
                                            <div className="absolute top-2 right-2 text-amber-500 text-[10px] font-black uppercase tracking-[0.2em] pointer-events-none z-10" style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.8)) drop-shadow(0 0 1px rgba(245,158,11,0.5))' }}>Auto-Gen</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── INVENTORY TOOLS ─────────────────────────────────────────────────────────── */}
            {isInventory && isInvFiltersOpen && (
                <div className="flex flex-col w-full min-h-0">
                    <div className="w-full px-6 py-3 flex items-center justify-between overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-5 shrink-0">
                            {[
                                { id: 'All', icon: LayoutGrid, color: '#FFFFFF' },
                                { id: 'New', icon: Plus, color: '#38bdf8' },
                                { id: 'Production', icon: Hammer, color: '#6366f1' },
                                { id: 'Available', icon: ShoppingBag, color: '#10b981' },
                                { id: 'Acquired', icon: Tag, color: '#10b981' },
                                { id: 'Partial', icon: FlaskConical, color: '#a855f7' },
                                { id: 'Requested', icon: Activity, color: '#f59e0b' },
                                { id: 'Paid', icon: DollarSign, color: '#10b981' }
                            ].map(s => {
                                const Icon = s.icon;
                                const isActive = invStatusFilter === s.id;
                                return (
                                    <button key={s.id} onClick={() => setInvStatusFilter(s.id as any)} className={`flex flex-col items-center gap-1 transition-all shrink-0 ${isActive ? 'scale-110' : 'text-zinc-600 hover:text-white'}`} style={{ color: isActive ? s.color : undefined }}>
                                        <Icon size={18} strokeWidth={isActive ? 4 : 3} className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''} />
                                        <span className={`text-[8px] font-black uppercase tracking-wider ${isActive ? 'text-white' : 'text-zinc-500'}`}>{s.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => { setInvVersion(v => v + 1); toast.success('Syncing...'); }} className="flex items-center gap-2 px-4 py-2 text-white/40 hover:text-white text-[9px] font-black uppercase tracking-widest"><Heartbeat size={14} /> SYNC REGISTRY</button>
                    </div>
                    <div className="w-full px-6 py-3 flex items-center gap-6 overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-700">
                        <button onClick={() => setInvVendorFilter(['All'])} className={`text-[10px] font-black uppercase transition-all shrink-0 ${invVendorFilter.includes('All') ? 'text-white' : 'text-zinc-600 hover:text-white'}`}>ALL<br/>VENDORS</button>
                        <div className="flex items-center gap-6 shrink-0 py-1">
                            {activeVendors.map(v => {
                                const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                                const isActive = invVendorFilter.includes(v) || invVendorFilter.includes('All');
                                return (
                                    <button key={v} onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])} className={`flex flex-col items-center gap-1.5 transition-all shrink-0 ${isActive ? 'scale-110' : 'grayscale brightness-50 hover:grayscale-0'}`} style={{ color: isActive ? vendorColor : '#52525b' }}>
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: vendorColor }} />
                                        <span className="text-[10px] font-black uppercase tracking-tight">{v}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TRUCKING TOOLS ─────────────────────────────────────────────────── */}
            {isTrucking && showPanels && (
                <div className="flex flex-col w-full border-t border-white/5 bg-black/40 backdrop-blur-xl animate-in slide-in-from-bottom duration-500">
                    
                    {/* 1. SHIPPING ACTION BAR (Always visible in trucking) */}
                    {!recalledShipment && (
                        <div className="flex items-center justify-between px-8 py-3 bg-white/[0.03] border-b border-white/5">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
                                    <Hammer size={16} className="text-(--main-color)" />
                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.3em]">Actions</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <button onClick={() => setShowOpenDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group">
                                        <Archive size={16} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Drafts</span>
                                    </button>
                                    <button onClick={() => setShowSaveDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group">
                                        <Save size={16} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Save</span>
                                    </button>
                                    <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 text-white/30 hover:text-(--main-color) transition-all group">
                                        <SlidersHorizontal size={16} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Export</span>
                                    </button>
                                </div>
                            </div>

                            <button 
                                disabled={truckBusy} 
                                onClick={() => setShowReadyWizard(true)} 
                                className={`flex items-center gap-3 px-6 py-2 rounded-xl transition-all font-black text-[11px] tracking-widest uppercase shadow-xl
                                    ${truckBusy ? 'bg-white/5 text-white/20' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95'}`}
                            >
                                {truckBusy ? <Activity size={16} className="animate-spin" /> : <Truck size={16} strokeWidth={3} />}
                                <span>{truckBusy ? 'Processing...' : 'Ready Truck'}</span>
                            </button>
                        </div>
                    )}

                    {/* 2. DOCK BAR (Crates / History) */}
                    <div className={`flex flex-col w-full border-b border-white/5 transition-all duration-500 overflow-hidden ${isDockCompact ? 'h-14' : 'h-40'}`}>
                        {topBarState === 'crates' ? (
                            <div className="flex flex-col h-full">
                                <div className="flex items-center justify-between px-6 py-3 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
                                            <LayoutGrid size={16} className="text-(--main-color)" />
                                        </div>
                                        {dockCrates.length > 0 && (
                                            <span className="text-[9px] font-black text-(--main-color) px-2 py-0.5 rounded-full bg-(--main-color)/10 uppercase tracking-tighter">
                                                {dockCrates.length} Units Available
                                            </span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setIsDockCompact(!isDockCompact)}
                                        className="p-2 text-white/20 hover:text-white transition-all bg-white/5 rounded-lg"
                                        title={isDockCompact ? 'Expand Dock' : 'Collapse Dock'}
                                    >
                                        {isDockCompact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                                    </button>
                                </div>
                                {!isDockCompact && (
                                    <div className="flex-1 px-8 pb-6 overflow-x-auto no-scrollbar flex items-center gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
                                        <div className="flex flex-col justify-center pr-8 border-r border-white/5 h-16 shrink-0">
                                            <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.4em] mb-1">Dock Load</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-black text-white tracking-tighter">{dockCrates.length}</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Units</span>
                                            </div>
                                        </div>

                                        {dockCrates.length === 0 ? (
                                            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/5 opacity-40 italic">
                                                <Package size={20} className="text-white/20" />
                                                <span className="text-[12px] font-bold text-white/40 uppercase tracking-widest whitespace-nowrap">No units currently staged at dock</span>
                                            </div>
                                        ) : (
                                            <div className="flex gap-6 pr-4">
                                                {dockCrates.map(crate => (
                                                    <div key={crate.id} className="shrink-0 transition-all hover:scale-105 active:scale-95 duration-500">
                                                        <CompactDockCard crate={crate} allCrates={allCrates} allInventory={allInventory} isCompact={false} onLoad={() => setPositions(p => ({ ...p, [crate.id]: { x: 0, y: 0, r: 0, z: 0 } }))} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : topBarState === 'trailers' && (
                            <div className="flex flex-col h-full">
                                <div className="flex items-center justify-between px-6 py-3 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 pr-4 border-r border-white/10 shrink-0">
                                            <History size={16} className="text-white/20" />
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Deployment Registry</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsDockCompact(!isDockCompact)}
                                        className="p-2 text-white/20 hover:text-white transition-all bg-white/5 rounded-lg"
                                        title={isDockCompact ? 'Expand History' : 'Collapse History'}
                                    >
                                        {isDockCompact ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                                    </button>
                                </div>
                                {!isDockCompact && (
                                    <div className="flex-1 px-6 pb-6 overflow-x-auto no-scrollbar flex items-center gap-8 animate-in fade-in slide-in-from-top-2 duration-500">
                                        {recentShipments.length === 0 ? (
                                            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/5 opacity-40">
                                                <Truck size={14} className="text-white/20" />
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">No recent deployments</span>
                                            </div>
                                        ) : (
                                            recentShipments.map(s => (
                                                <DeployedTrailerCard key={s.id} shipment={s} allCrates={allCrates} allInventory={allInventory} onRecall={() => handleRecall(s)} onDelete={() => handleDeleteShipment(s.id)} />
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 3. STATS BAR (HUD / Trailer Details) */}
                    <div className={`flex items-center justify-between px-8 transition-all duration-700 ease-in-out overflow-hidden bg-white/[0.02] ${isStatsCompact ? 'h-20 py-4' : 'h-36 py-6'}`}>
                        <div className="flex items-center gap-12 h-full">
                            {/* Weight Section */}
                            <div className="flex flex-col justify-center">
                                <span className={`font-black uppercase tracking-[0.4em] transition-all duration-500 ${isStatsCompact ? 'text-[8px] text-white/20 mb-1' : 'text-[10px] text-(--main-color) mb-2'}`}>Payload Weight</span>
                                <div className="flex items-baseline gap-2">
                                    <span className={`font-black text-white transition-all duration-500 ${isStatsCompact ? 'text-2xl' : 'text-6xl tracking-tighter'}`}>
                                        {totalWeight.toLocaleString()}
                                    </span>
                                    <span className={`font-black text-white/20 tracking-widest uppercase transition-all ${isStatsCompact ? 'text-[10px]' : 'text-[14px]'}`}>KG</span>
                                </div>
                            </div>

                            <div className={`w-px transition-all duration-500 bg-white/10 ${isStatsCompact ? 'h-8' : 'h-20'}`} />

                            {/* Floor Usage Section */}
                            <div className="flex flex-col justify-center">
                                <span className={`font-black uppercase tracking-[0.4em] transition-all duration-500 ${isStatsCompact ? 'text-[8px] text-white/20 mb-1' : 'text-[10px] text-white/30 mb-2'}`}>Floor Capacity</span>
                                <div className="flex items-baseline gap-1">
                                    <span className={`font-black transition-all duration-500 ${isStatsCompact ? 'text-2xl' : 'text-6xl tracking-tighter'} ${floorPct > 95 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {floorPct}
                                    </span>
                                    <span className={`font-black transition-all duration-500 ${isStatsCompact ? 'text-[12px] opacity-40' : 'text-2xl opacity-20'} ${floorPct > 95 ? 'text-rose-500' : 'text-white'}`}>%</span>
                                </div>
                            </div>

                            {!isStatsCompact && (
                                <>
                                    <div className="w-px h-20 bg-white/10 animate-in fade-in duration-1000" />
                                    
                                    {/* Volume / Status Section */}
                                    <div className="flex flex-col justify-center animate-in slide-in-from-left-4 duration-700">
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-2">Volumetric Flow</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-4xl font-black text-white/80 tracking-tighter uppercase">Optimal</span>
                                            <div className="flex gap-1">
                                                {[1,2,3,4,5].map(i => <div key={i} className={`w-2 h-8 rounded-full ${i <= 4 ? 'bg-emerald-500/40' : 'bg-white/5'}`} />)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-px h-20 bg-white/5 animate-in fade-in duration-1000" />

                                    {/* Detailed Metadata Grid */}
                                    <div className="hidden 2xl:grid grid-cols-2 gap-x-12 gap-y-3 animate-in slide-in-from-left-8 duration-1000">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest mb-0.5">Manifest ID</span>
                                            <span className="text-[14px] font-black text-white/60 tracking-wider">#{recalledShipment?.manifest_id || readyFields?.manifestId || '---'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest mb-0.5">Carrier</span>
                                            <span className="text-[14px] font-black text-white/60 tracking-wider uppercase">{recalledShipment?.carrier || readyFields?.carrier || 'ONYX LOGISTICS'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest mb-0.5">Seal Number</span>
                                            <span className="text-[14px] font-black text-white/60 tracking-wider">#{recalledShipment?.seal_number || readyFields?.sealNumber || '---'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest mb-0.5">Trailer Plates</span>
                                            <span className="text-[14px] font-black text-white/60 tracking-wider">{recalledShipment?.trailer_plates || readyFields?.trailerPlates || '---'}</span>
                                        </div>
                                    </div>

                                    <div className="w-px h-20 bg-white/5 animate-in fade-in duration-1000 hidden 2xl:block" />

                                    {/* Personnel */}
                                    <div className="flex flex-col justify-center animate-in slide-in-from-left-12 duration-1000">
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-2">Personnel</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                                <Users size={16} className="text-white/40" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-black text-white/80 uppercase">{recalledShipment?.driver_name || readyFields?.driverName || 'UNASSIGNED'}</span>
                                                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Master Driver</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            {recalledShipment && (
                                <button onClick={() => setRecalledShipment(null)} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all text-[11px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95">
                                    <X size={16} strokeWidth={3} /> Close Registry
                                </button>
                            )}
                            <button 
                                onClick={() => setIsStatsCompact(!isStatsCompact)}
                                className={`p-4 transition-all rounded-2xl flex items-center justify-center hover:scale-110 active:scale-90
                                    ${isStatsCompact ? 'bg-white/5 text-white/20 hover:text-white' : 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.3)]'}`}
                                title={isStatsCompact ? 'Expand Details' : 'Compact Details'}
                            >
                                {isStatsCompact ? <Maximize2 size={20} /> : <Minimize2 size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};