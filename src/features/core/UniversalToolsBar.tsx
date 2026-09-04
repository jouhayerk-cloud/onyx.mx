import React, { useMemo, useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { CONTENT_FILTERS, countContent, type ContentKey } from '../../lib/aiContent';
import { buildGeometryTree, buildMaterialColorTree, toggleKey, type SmartFilterNode } from '../../lib/smartFilters';
import { GEOMETRIES, GEOMETRY_LABELS, type Geometry } from '../../lib/geometry';
import { GeometryIcon } from './shapeIcons';
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
    inventoryToolsOpenAtom,
    isInventorySmartFiltersOpenAtom,
    inventoryContentFilterAtom,
    isInventoryMaterialColorFilterOpenAtom,
    isInventoryShapeFilterOpenAtom,
    inventoryShapeFilterAtom,
    inventoryMaterialColorFilterAtom,
    inventorySearchTermAtom,
    truckDockIsCompactAtom,
    truckStatsIsCompactAtom,
    truckingReadyFieldsAtom,
    inventoryArtifactConfigAtom
} from '../../lib/atoms';
import { 
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus, DollarSign, Minimize2, Maximize2, Cpu, Calendar, Activity, Archive, Users, LayoutGrid, LayoutList, Layout, ChevronUp, ChevronDown, Activity as Heartbeat, Wallet, ShoppingCart, ShoppingBag, Package, Truck, ArrowUp, ArrowDown, History, Save, Hourglass, Settings, Send, PackageCheck, PackageOpen, PackageX,
    Palette, Shapes
} from 'lucide-react';
import { vendors } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';
// Lazy load logistics cards to prevent bundling 400KB+ of trucking/inventory modules into main
const CompactDockCard = React.lazy(() => import('../logistics/TruckingModule').then(m => ({ default: m.CompactDockCard })));
const DeployedTrailerCard = React.lazy(() => import('../logistics/TruckingModule').then(m => ({ default: m.DeployedTrailerCard })));
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { normalizeInventoryData } from '../../lib/utils';
import { tr } from '../../lib/i18n';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

// buildGeometryTree's node.label is GEOMETRY_LABELS[g] ("Box", "Sculpture", …)
// — the Shape bar needs the geometry BACK from that label to pick an icon,
// so this is the one inverse of GEOMETRY_LABELS, built once rather than per
// render. Computed here instead of in geometry.ts because geometry.ts is not
// this feature's file to edit and the inverse has exactly one caller.
const LABEL_TO_GEOMETRY = new Map<string, Geometry>(GEOMETRIES.map(g => [GEOMETRY_LABELS[g], g]));

// ── Components ───────────────────────────────────────────────────────────────

const ActiveRequestGridItem: React.FC<{
    label: string;
    amount: number;
    color: string;
    type: string;
    currencyMode: string;
    exRate: number;
    paidAmount?: number;
    totalAmount?: number;
    onClick: () => void;
}> = ({ label, amount, color, type, currencyMode, exRate, paidAmount = 0, totalAmount = 0, onClick }) => {
    const isAcq = type?.toLowerCase().includes('acq');
    const isProd = type?.toLowerCase().includes('prod');
    const Icon = isAcq ? ShoppingCart : (isProd ? Settings : Package);
    const finalAmount = currencyMode === 'MXN' ? amount : amount / exRate;

    return (
        <div 
            onClick={onClick}
            className="flex flex-col justify-between p-4 h-28 cursor-pointer transition-all hover:brightness-110 active:scale-95 group relative overflow-hidden"
            style={{ backgroundColor: `${color}40` }}
        >
            <div className="flex items-start justify-between">
                <span className="text-[12px] font-black text-white/60 uppercase tracking-[0.2em] truncate max-w-[80%]">{label}</span>
                <Icon size={36} strokeWidth={3} style={{ color: color }} className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
            </div>
            
            <div className="flex flex-col">
                <span className="text-[28px] font-black text-white leading-none tracking-tighter">
                    {currencyMode === 'MXN' ? fmtMXN(amount) : fmtUSD(finalAmount)}
                </span>
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-2 truncate">{type || tr("General")}</span>
            </div>

            {/* Progress Bar for Partial Production */}
            {isProd && totalAmount > 0 && paidAmount > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                    <div 
                        className="h-full transition-all duration-1000" 
                        style={{ 
                            width: `${Math.min((paidAmount / totalAmount) * 100, 100)}%`,
                            backgroundColor: color 
                        }} 
                    />
                </div>
            )}

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
                <ChevronRight size={16} className="text-white/40" />
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
                            {count !== undefined && <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{count} {tr("UNITS")}</span>}
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


/**
 * One hierarchy. Parents are always visible; a parent's children appear only
 * once it is expanded, because showing every shape for every type at once is
 * several hundred chips and unusable on a phone.
 *
 * Expansion is independent of selection: a user can look inside a branch
 * without filtering by it, which is how you find the shape you actually want.
 *
 * `renderIcon` is optional and used only by the Shape bar: Material/Colour's
 * parents are free text with no bounded glyph set behind them, so that bar
 * stays text-only, while Shape's eight parents each get the icon that makes
 * the hierarchy visual instead of one more wall of chips (see shapeIcons.tsx).
 * `primary` gives the Material/Colour bar the larger, first-in-reading-order
 * treatment the user asked for as the MAIN filter, without a second component
 * to keep in sync with this one.
 */
const SmartFilterGroup: React.FC<{
    title: string;
    tree: SmartFilterNode[];
    selected: string[];
    onToggle: (key: string) => void;
    onClear: () => void;
    renderIcon?: (node: SmartFilterNode) => React.ReactNode;
    primary?: boolean;
}> = ({ title, tree, selected, onToggle, onClear, renderIcon, primary }) => {
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    const sel = new Set(selected || []);
    const activeCount = (selected || []).length;

    if (tree.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-3">
                <span className={`font-black uppercase tracking-[0.2em] opacity-40 leading-none ${primary ? 'text-[9px]' : 'text-[8px]'}`}>{title}</span>
                {activeCount > 0 && (
                    <button onClick={onClear}
                        className="smart-clear text-[8px] font-black uppercase tracking-[0.16em] px-2 py-0.5 rounded-md"
                        title={tr("Clear this filter")}>
                        {tr("Clear")} {activeCount}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-start gap-1.5 max-w-[46rem]">
                {tree.map(node => {
                    const isOpen = expanded.has(node.key);
                    const isSel = sel.has(node.key);
                    return (
                        <div key={node.key} className="flex flex-col gap-1">
                            <div className="flex items-stretch">
                                <button
                                    onClick={() => onToggle(node.key)}
                                    aria-pressed={isSel}
                                    className={`smart-chip flex items-center gap-1.5 rounded-l-lg font-black uppercase tracking-[0.1em] ${primary ? 'smart-chip-primary px-3 py-2 text-[10px]' : 'px-2.5 py-1.5 text-[9px]'}`}
                                    title={`Filter by ${node.label}`}
                                >
                                    {renderIcon?.(node)}
                                    {node.label}
                                    <span className="smart-count tabular-nums opacity-50">{node.count}</span>
                                </button>
                                {node.children.length > 0 && (
                                    <button
                                        onClick={() => setExpanded(p => {
                                            const n = new Set(p);
                                            n.has(node.key) ? n.delete(node.key) : n.add(node.key);
                                            return n;
                                        })}
                                        aria-pressed={isOpen}
                                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
                                        className="smart-expand flex items-center justify-center px-1.5 rounded-r-lg"
                                        title={`${node.children.length} sub-filter${node.children.length !== 1 ? 's' : ''}`}
                                    >
                                        <ChevronDown size={17} strokeWidth={3}
                                            className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                    </button>
                                )}
                            </div>

                            {isOpen && (
                                <div className="smart-children flex flex-wrap gap-1 pl-2 ml-1 animate-in fade-in duration-200">
                                    {node.children.map(child => (
                                        <button
                                            key={child.key}
                                            onClick={() => onToggle(child.key)}
                                            aria-pressed={sel.has(child.key)}
                                            className="smart-chip smart-chip-child flex items-center gap-1.5 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-[0.08em]"
                                            title={`Filter by ${node.label} / ${child.label}`}
                                        >
                                            {child.label}
                                            <span className="smart-count tabular-nums opacity-50">{child.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    
    // Inventory States
    const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
    const [invMode, setInvMode] = useAtom(inventoryViewModeAtom);
    const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
    // The Tools disclosure gates these bars without clearing their state, so
    // collapsing the group hides them and reopening restores what was active.
    // smartOpen is the master ("Tags") switch; the two bars below then deploy
    // independently under it, each with its own open atom, so showing one
    // never forces the other onto the screen.
    const toolsOpen = useAtomValue(inventoryToolsOpenAtom);
    const smartOpen = useAtomValue(isInventorySmartFiltersOpenAtom);
    const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
    const [materialColorOpen, setMaterialColorOpen] = useAtom(isInventoryMaterialColorFilterOpenAtom);
    const [shapeFilterOpen, setShapeFilterOpen] = useAtom(isInventoryShapeFilterOpenAtom);
    const [shapeSel, setShapeSel] = useAtom(inventoryShapeFilterAtom);
    const [materialColorSel, setMaterialColorSel] = useAtom(inventoryMaterialColorFilterAtom);
    const inventoryRows = useAtomValue(inventoryAtom);

    // Both hierarchies are derived from the live rows, so a new material,
    // colour or shape appears as a filter the moment an item using it is
    // saved — nothing to configure and nothing to keep in sync with the data.
    const shapeTree = React.useMemo(() => buildGeometryTree(inventoryRows || []), [inventoryRows]);
    const materialColorTree = React.useMemo(() => buildMaterialColorTree(inventoryRows || []), [inventoryRows]);
    const contentCounts = React.useMemo(() => countContent(inventoryRows || []), [inventoryRows]);
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
    const setInvArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
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
    const allLogistics = useAtomValue(logisticsDocsAtom);
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
        if (!confirm(tr("Delete this shipment record permanently?"))) return;
        try {
            const { error } = await supabase.from('shipments').delete().eq('id', id);
            if (error) throw error;
            setRecentShipments(s => s.filter(x => x.id !== id));
            toast.success(tr("Shipment deleted"));
        } catch (e) { toast.error(tr("Failed to delete shipment")); }
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
        const groups: Record<string, { vendor: string, type: 'Acq' | 'Prod' | 'Crate', items: any[], total: number }> = {};
        
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

        // 3. Add ALL pending Logistic Units (Crates/Pallets/etc)
        const supplierLogistics = (allLogistics || []).filter(c => {
            const payReqStr = String(c.pay_req || '').toLowerCase();
            const isUnpaid = !['true', 'paid'].includes(payReqStr);
            const isLogisticUnit = ['crate', 'pallet', 'cardboard'].includes(String(c.type || '').toLowerCase());
            return isLogisticUnit && isUnpaid && (c.cost_mxn || 0) > 0;
        });

        supplierLogistics.forEach(crate => {
            // Robust vendor detection for logistics
            const searchStr = `${crate.vendors || ''} ${crate.description || ''} ${crate.vendor_id || ''}`.toUpperCase();
            let v = 'CRATES';
            if (searchStr.includes('JUAN')) v = 'JUAN';
            else if (searchStr.includes('SIMONA')) v = 'SIMONA';
            else v = (crate.vendors || crate.vendor_id || 'CRATES').toUpperCase();

            const gKey = `${v}-Crate`;
            if (!groups[gKey]) {
                groups[gKey] = { vendor: v, type: 'Crate', items: [], total: 0 };
            }
            groups[gKey].items.push(crate);
            const crateQty = parseFloat(String(crate.quantity || crate.qty || '1')) || 1;
            groups[gKey].total += ((crate.cost_mxn || 0) * crateQty);
        });

        // 4. Calculate paid offsets for each group to get true balance
        return Object.entries(groups).map(([gKey, group]) => {
            const itemIds = new Set(group.items.map(i => String(i.id || i.data?.id || i.row)));
            
            // Sum all expenses related to these items/crates
            const paidTotal = financeDocs.reduce((sum, exp) => {
                if (!['Requested', 'Paid', 'Sent', 'Dispersed'].includes(exp.status)) return sum;
                
                const relIds = Array.isArray(exp.related_ids) ? exp.related_ids : (typeof exp.related_inventory_ids === 'string' ? exp.related_inventory_ids.split(',') : []);
                const isRel = relIds.some((id: any) => itemIds.has(String(id)));
                
                // For packing suppliers, also match against generic vendor IDs
                const isPackingVendor = ['JUAN', 'SIMONA', 'PACK', 'CRATES'].includes(group.vendor.toUpperCase());
                const expVendor = (exp.vendor_id || '').toUpperCase();
                const vendorMatch = expVendor === group.vendor.toUpperCase() || (isPackingVendor && ['PACK', 'CRATES', 'JUAN', 'SIMONA'].includes(expVendor));

                return isRel && (vendorMatch || !exp.vendor_id) ? sum + (exp.amount || 0) : sum;
            }, 0);

            const balance = group.total - paidTotal;

            if (balance <= 0.5) return null; // Skip if basically paid

            return {
                id: `auto-${gKey}`,
                vendor_id: group.vendor,
                description: group.type === 'Crate' ? `${group.items.length} Logistic Units` : `${group.items.length} ${group.type === 'Acq' ? 'Acquisition' : 'Production'} Items`,
                amount: Math.round(balance),
                paidAmount: Math.round(paidTotal),
                totalAmount: Math.round(group.total),
                status: 'Upcoming',
                subcategory: group.type === 'Crate' ? 'Logistics' : (group.type === 'Acq' ? 'Acquisition' : 'Production'),
                related_inventory_ids: Array.from(itemIds),
                is_auto_gen: true
            };
        }).filter(Boolean);
    }, [allInventory, allLogistics, financeDocs]);

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
            {((isInventory && toolsOpen && (isInvSearchOpen || isInvViewSliderOpen)) || (isFinance && isFinSearchOpen)) && (
                <div className="w-full animate-in slide-in-from-top duration-500 overflow-hidden pr-4 pl-4">
                    <div className="w-full mx-auto px-6 py-3 flex flex-col gap-4">
                        {isInventory && toolsOpen && isInvSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all shrink-0">
                                <Search size={32} strokeWidth={3} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder={tr("SEARCH INVENTORY...")} className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {invSearchTerm && <button onClick={() => setInvSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={32} strokeWidth={3} /></button>}
                            </div>
                        )}
                        {isInventory && toolsOpen && isInvViewSliderOpen && (
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
                                                {invSlider <= 33 ? <LayoutList size={28} strokeWidth={2.5} /> : 
                                                 invSlider <= 66 ? <LayoutGrid size={28} strokeWidth={2.5} /> : 
                                                 <Layout size={28} strokeWidth={2.5} />}
                                            </div>
                                            <div className="absolute inset-0 opacity-20 transition-all duration-500"
                                                 style={{ 
                                                     background: `radial-gradient(circle, var(--main-color) 0%, transparent 70%)`,
                                                     opacity: (invSlider / 100) * 0.3
                                                 }} />
                                        </button>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] leading-none mb-1">{tr("Density")}</span>
                                            <span className="text-[14px] font-black text-white uppercase tracking-tighter">
                                                {invSlider <= 33 ? tr("Compact") : invSlider <= 66 ? tr("Standard") : tr("Spacious")}
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
                                <div className="flex items-center gap-6 shrink-0 sm:justify-end overflow-x-auto no-scrollbar">
                                    <div className="flex items-center gap-2 text-white/20 uppercase font-black text-[9px] tracking-[0.2em] shrink-0">
                                        <ArrowUpDown size={22} />
                                        <span>{tr("SORT BY")}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {[
                                            { key: 'Date', label: tr("DATE") },
                                            { key: 'Vendor', label: 'VENDOR' },
                                            { key: 'Status', label: tr("STATUS") },
                                            { key: 'Number', label: tr("NUM") },
                                            { key: 'Value', label: tr("VALUE") },
                                            { key: 'Qty', label: 'QTY' }
                                        ].map(sort => (
                                        <div key={sort.key} className="tool-cell flex flex-col items-center gap-1 shrink-0">
                                            <button
                                                aria-pressed={invSortKey === sort.key}
                                                title={sort.label}
                                                onClick={() => {
                                                    if (invSortKey === sort.key) setInvSortOrder(invSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setInvSortKey(sort.key as any); setInvSortOrder('desc'); }
                                                }}
                                                className="tool-btn flex items-center justify-center w-12 h-12 rounded-xl transition-all">
                                                {invSortKey === sort.key
                                                    ? (invSortOrder === 'asc' ? <ArrowUp size={30} strokeWidth={3} /> : <ArrowDown size={30} strokeWidth={3} />)
                                                    : <ArrowUpDown size={30} strokeWidth={2.2} />}
                                            </button>
                                            <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none">{sort.label}</span>
                                        </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {isFinance && isFinSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all shrink-0">
                                <Search size={32} strokeWidth={3} className="text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder={tr("SEARCH PAYMENTS...")} className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {finSearchTerm && <button onClick={() => setFinSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={32} strokeWidth={3} /></button>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── SELECTION TOOLS ─────────────────────────────────────────────────────────── */}
            {isInventory && isSelectionMode && (
                <div className="w-full border-t border-white/5 animate-in slide-in-from-top duration-500 overflow-hidden px-4 bg-white/[0.02]">
                    <div className="w-full mx-auto px-6 py-4 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-6">
                            <div className="w-12 h-12 rounded-xl bg-(--color-inventory)/10 border border-(--color-inventory)/20 flex items-center justify-center text-(--color-inventory) drop-shadow-[0_0_15px_rgba(var(--color-inventory-rgb),0.3)]">
                                <SquareCheckBig size={32} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] leading-none mb-1">{tr("Batch Management")}</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white tracking-tighter">{selectedIds.length}</span>
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Items Selected")}</span>
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
                                <span className="text-[11px] font-black uppercase tracking-[0.2em]">{tr("Select All")}</span>
                            </button>

                            <button 
                                onClick={() => {
                                    setSelectedIds([]);
                                    toast.success(tr("Selection Cleared"));
                                }}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all font-black text-[11px] tracking-widest uppercase active:scale-95"
                            >
                                <X size={24} strokeWidth={3} />
                                <span>{tr("Clear")}</span>
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
                                    { id: "Operations", icon: Activity, color: '#ef4444' },
                                    { id: "Logistics", icon: Truck, color: '#06b6d4' }
                                ].map(s => {
                                    const Icon = s.icon;
                                    const isActive = finCategoryFilter === s.id;
                                    return (
                                        <div key={s.id} className="tool-cell flex flex-col items-center gap-1 shrink-0">
                                            <button aria-pressed={isActive} title={s.id} onClick={() => setFinCategoryFilter(s.id as any)}
                                                className="tool-btn flex items-center justify-center w-12 h-12 rounded-xl transition-all">
                                                <Icon size={30} strokeWidth={isActive ? 3.5 : 2.5} style={{ color: isActive ? 'var(--main-color)' : s.color }} />
                                            </button>
                                            <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none">{s.id}</span>
                                        </div>
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
                            <SectionHeader icon={Heartbeat} title={tr("Requested")} count={activeQueueRecords.length} amount={activeQueueTotal} isOpen={isFinQueueOpen} onToggle={() => setIsFinQueueOpen(!isFinQueueOpen)} currencyMode={currencyMode} exRate={exRate} />
                            {isFinQueueOpen && (
                                <div className={`grid gap-1 overflow-y-auto max-h-[340px] custom-scrollbar transition-all duration-500 ${activeQueueRecords.length === 0 ? 'grid-cols-1 opacity-10' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                                    {activeQueueRecords.length === 0 ? <div className="py-6 text-center border border-white/5 rounded-2xl"><span className="text-[11px] font-black uppercase tracking-[0.6em]">{tr("QUEUE EMPTY")}</span></div> : activeQueueRecords.map(r => {
                                        const v = r.vendor_id || tr("Unknown");
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
                        title={tr("Upcoming Payments")} 
                        count={combinedUpcoming.length} 
                        amount={combinedUpcomingTotal} 
                        isOpen={isFinUpcomingOpen} 
                        onToggle={() => setIsFinUpcomingOpen(!isFinUpcomingOpen)} 
                        currencyMode={currencyMode} 
                        exRate={exRate} 
                    />
                    {isFinUpcomingOpen && (
                        <div className={`grid gap-1 overflow-y-auto max-h-[340px] custom-scrollbar transition-all duration-500 mt-2 ${combinedUpcoming.length === 0 ? 'grid-cols-1 opacity-10' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                            {combinedUpcoming.length === 0 ? (
                                <div className="py-6 text-center border border-white/5 rounded-2xl">
                                    <span className="text-[11px] font-black uppercase tracking-[0.6em]">{tr("NO UPCOMING PAYMENTS")}</span>
                                </div>
                            ) : combinedUpcoming.map(r => {
                                const v = r.vendor_id || tr("Unknown");
                                const color = vendors[v as keyof typeof vendors]?.color || '#888';
                                const isAuto = (r as any).is_auto_gen;
                                return (
                                    <div key={r.id} className="relative group">
                                        <ActiveRequestGridItem 
                                            label={r.description || v} 
                                            amount={r.amount} 
                                            paidAmount={(r as any).paidAmount}
                                            totalAmount={(r as any).totalAmount}
                                            color={color} 
                                            type={r.subcategory} 
                                            currencyMode={currencyMode} 
                                            exRate={exRate} 
                                            onClick={() => {
                                                if (isAuto) {
                                                    setInvArtifactConfig({ 
                                                        isOpen: true, 
                                                        itemIds: r.related_inventory_ids || [], 
                                                        title: `Batch Items: ${v}`,
                                                        displayMode: 'gallery'
                                                    });
                                                } else {
                                                    setPaymentsArtifactConfig({ 
                                                        isOpen: true, 
                                                        paymentIds: Array.isArray(r.related_inventory_ids) ? r.related_inventory_ids : [r.id], 
                                                        title: `Detail: ${v}` 
                                                    });
                                                }
                                            }} 
                                        />
                                        
                                        {/* Vendor Tag (Free Floating High Contrast) */}
                                        <div 
                                            className="absolute bottom-2 right-4 text-[32px] font-black uppercase tracking-tighter pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity"
                                            style={{ color: color, filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.5))' }}
                                        >
                                            {v}
                                        </div>

                                        {/* Removed Auto-Gen Tag */}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Smart filters ────────────────────────────────────────────
                Two independent bars rather than one crowded one — that was
                the actual complaint: both hierarchies rendered side by side
                in a single disclosure, which only grows as branches expand.
                The deploy row below is the "universal tools bar for smart
                filters" itself: two keys, one per bar, each gating its own
                bar without touching the other's selection or open state.

                Material -> Colour is the MAIN filter (open by default, listed
                first, larger chips via `primary`). Shape is headed by the
                eight bounded geometry classes from lib/geometry.ts — icons,
                not text, because a bounded set of eight is exactly small
                enough to recognise by glyph — with the free-text shape/type
                values nested underneath as sub-filters, deployed per branch
                exactly like the old hierarchy's children were. */}
            {isInventory && toolsOpen && smartOpen && (
                <div className="smart-filters w-full border-t border-white/5 animate-in slide-in-from-top duration-300 overflow-x-auto no-scrollbar">
                    <div className="smart-filter-deploy flex items-center gap-4 px-4 pt-3 pb-1 min-w-max">
                        <button
                            onClick={() => setMaterialColorOpen(!materialColorOpen)}
                            aria-pressed={materialColorOpen}
                            className="smart-deploy-key flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.16em]"
                            title={tr("Material / Colour — main filter")}
                        >
                            <Palette size={17} strokeWidth={2.4} />
                            {tr("Material / Colour")}
                        </button>
                        <button
                            onClick={() => setShapeFilterOpen(!shapeFilterOpen)}
                            aria-pressed={shapeFilterOpen}
                            className="smart-deploy-key flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.16em]"
                            title={tr("Shape — sub filter")}
                        >
                            <Shapes size={17} strokeWidth={2.4} />
                            {tr("Shape")}
                        </button>
                    </div>

                    {materialColorOpen && (
                        <div className="smart-filters-main px-4 py-3 min-w-max">
                            <SmartFilterGroup
                                title={tr("Material / Colour — Main Filter")}
                                tree={materialColorTree}
                                selected={materialColorSel}
                                onToggle={(k: string) => setMaterialColorSel(prev => toggleKey(prev || [], k))}
                                onClear={() => setMaterialColorSel([])}
                                primary
                            />
                        </div>
                    )}

                    {shapeFilterOpen && (
                        <div className="smart-filters-shape px-4 py-3 min-w-max">
                            <SmartFilterGroup
                                title={tr("Shape — Sub Filter")}
                                tree={shapeTree}
                                selected={shapeSel}
                                onToggle={(k: string) => setShapeSel(prev => toggleKey(prev || [], k))}
                                onClear={() => setShapeSel([])}
                                renderIcon={(node) => {
                                    const geom = LABEL_TO_GEOMETRY.get(node.label);
                                    return geom ? <GeometryIcon geom={geom} size={17} strokeWidth={2.4} /> : null;
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ── INVENTORY TOOLS ─────────────────────────────────────────────────────────── */}
            {isInventory && toolsOpen && isInvFiltersOpen && (
                <div className="flex flex-col w-full min-h-0">
                    <div className="w-full px-6 py-3 flex items-center overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-5 shrink-0">
                            {[
                                { id: 'All', icon: LayoutGrid, color: '#FFFFFF' },
                                { id: 'New', icon: Plus, color: '#38bdf8' },
                                { id: 'Packed', icon: PackageCheck, color: '#eab308' },
                                { id: 'Not Packed', icon: PackageOpen, color: '#a1a1aa' },
                                { id: 'Shipped', icon: Send, color: '#06b6d4' },
                                { id: 'Not Shipped', icon: PackageX, color: '#f43f5e' },
                                { id: 'Acquired', icon: Tag, color: '#10b981' },
                                { id: 'Requested', icon: Activity, color: '#f59e0b' },
                                { id: 'Paid', icon: DollarSign, color: '#10b981' }
                            ].map(s => {
                                const Icon = s.icon;
                                const isActive = invStatusFilter === s.id;
                                return (
                                    <div key={s.id} className="tool-cell flex flex-col items-center gap-1 shrink-0">
                                        <button aria-pressed={isActive} title={s.id} onClick={() => setInvStatusFilter(s.id as any)}
                                            className="tool-btn flex items-center justify-center w-12 h-12 rounded-xl transition-all"
                                            style={{ color: isActive ? s.color : undefined }}>
                                            <Icon size={30} strokeWidth={isActive ? 3.5 : 2.5} />
                                        </button>
                                        <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none">{s.id}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* AI content, on the SAME row as Status and divided from
                            it rather than stacked. Both answer "what state is this
                            item in", and a second row for five chips cost as much
                            height as the status keys themselves.

                            The stages are strictly nested — cleanup > vision > copy,
                            with cutout branching off vision — so the counts fall from
                            left to right by design, not by accident. See lib/aiContent
                            for the audit they come from. Chips OR together. */}
                        <div className="h-9 w-px bg-white/10 mx-5 shrink-0" />

                        <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 leading-none shrink-0 mr-3">
                            {tr("AI Content")}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {CONTENT_FILTERS.map(f => {
                                const on = (contentSel || []).includes(f.key);
                                const n = contentCounts[f.key as ContentKey] ?? 0;
                                return (
                                    <button
                                        key={f.key}
                                        onClick={() => setContentSel(prev => {
                                            const cur = prev || [];
                                            return cur.includes(f.key)
                                                ? cur.filter(k => k !== f.key)
                                                : [...cur, f.key];
                                        })}
                                        aria-pressed={on}
                                        title={tr(f.hint)}
                                        className="smart-chip flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.1em]"
                                    >
                                        {tr(f.label)}
                                        <span className="smart-count tabular-nums opacity-50">{n}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {(contentSel || []).length > 0 && (
                            <button onClick={() => setContentSel([])}
                                className="smart-clear text-[8px] font-black uppercase tracking-[0.16em] px-2 py-1 rounded-md shrink-0 ml-3"
                                title={tr("Clear content filter")}>
                                {tr("Clear")} {(contentSel || []).length}
                            </button>
                        )}
                    </div>

                    <div className="w-full px-6 py-3 flex items-center gap-6 overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-700">
                        <button onClick={() => setInvVendorFilter(['All'])} className={`text-[10px] font-black uppercase transition-all shrink-0 ${invVendorFilter.includes('All') ? 'text-white' : 'text-zinc-600 hover:text-white'}`}>{tr("ALL")}<br/>{tr("VENDORS")}</button>
                        <div className="flex items-center gap-6 shrink-0 py-1">
                            {activeVendors.map(v => {
                                const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                                const isActive = invVendorFilter.includes(v) || invVendorFilter.includes('All');
                                return (
                                    <div key={v} className="tool-cell flex flex-col items-center gap-1 shrink-0">
                                        <button aria-pressed={isActive} title={v}
                                            onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])}
                                            className="tool-btn vendor-btn flex items-center justify-center w-12 h-12 rounded-xl transition-all"
                                            style={{ ['--vendor-color' as any]: vendorColor }} />
                                        <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none" style={{ color: vendorColor }}>{v}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
};