import React, { useMemo, useState } from 'react';
import { exportCatalogPdf } from '../../lib/pdfExport';
import { ExportWizard } from '../../components/ExportWizard';
import { islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { 
    InventorySearchPanel,
    InventoryViewPanel,
    InventorySmartFiltersPanel,
    InventoryFiltersPanel,
    InventoryPanelsRegistrar
} from './inventoryPanels';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { SubmenuDock, SubmenuCard } from './SubmenuDock';
import { 
    activeViewAtom, 
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    logisticsSubTabAtom,
    isInventoryViewSliderOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryAtom,
    inventoryCategoryFilterAtom,
    inventoryMaterialFilterAtom,
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
    logisticsDocsAtom,
    isInventorySearchOpenAtom,
    inventoryToolsOpenAtom,
    isInventorySmartFiltersOpenAtom,
    inventoryArtifactConfigAtom,
    isPackingNFCWizardOpenAtom,
    isPackingCrateWizardOpenAtom,
    isCratePackingManagerOpenAtom,
    isPaymentWizardOpenAtom,
    workbookVersionAtom,
    isBatchActionsModalOpenAtom,
    batchActionItemsDataAtom,
    inventoryExportSelectedXLSXTriggerAtom,
    isBatchWizardOpenAtom,
    batchWizardItemsAtom
} from '../../lib/atoms';
import { isPackingPrintWizardOpenAtom } from '../../lib/atoms';
import { 
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus, DollarSign, Minimize2, Maximize2, Cpu, Calendar, Activity, Archive, Users, LayoutGrid, LayoutList, Layout, ChevronUp, ChevronDown, Activity as Heartbeat, Wallet, ShoppingCart, ShoppingBag, Package, Truck, ArrowUp, ArrowDown, History, Save, Hourglass, Settings, Send, PackageCheck, PackageOpen, PackageX,
    Palette, Shapes, Printer, Nfc, Copy, FileSpreadsheet, Sparkles, Download, BookOpen
} from 'lucide-react';
import { vendors } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';
// Lazy load logistics cards to prevent bundling 400KB+ of trucking/inventory modules into main
const CompactDockCard = React.lazy(() => import('../logistics/TruckingModule').then(m => ({ default: m.CompactDockCard })));
const DeployedTrailerCard = React.lazy(() => import('../logistics/TruckingModule').then(m => ({ default: m.DeployedTrailerCard })));
import toast from '../onyxIsland/notify/toast';
import { normalizeInventoryData, calculateCodesAndPrices, collectAllImages, collectExportImages, getCleanImageUrl } from '../../lib/utils';
import { tr } from '../../lib/i18n';

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
                <Icon size={32} strokeWidth={3} style={{ color: color }} className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
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
                <ChevronRight size={12} className="text-white/40" />
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



export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const setView = useSetAtom(activeViewAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    
    // Inventory States
    const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
    const toolsOpen = useAtomValue(inventoryToolsOpenAtom);
    const [smartOpen, setSmartOpen] = useAtom(isInventorySmartFiltersOpenAtom);
    
    // Both hierarchies are derived from the live rows, so a new material,
    // colour or shape appears as a filter the moment an item using it is
    // saved — nothing to configure and nothing to keep in sync with the data.
    const invCategoryFilter = useAtomValue(inventoryCategoryFilterAtom);
    const invMaterialFilter = useAtomValue(inventoryMaterialFilterAtom);
    const filteredIds = useAtomValue(filteredInventoryIdsAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);

    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    
    // Batch & Print Actions
    const setPrintWizardOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setNFCOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const [isPackOpen, setPackOpen] = useAtom(isPackingCrateWizardOpenAtom);
    const isCratePackingManagerOpen = useAtomValue(isCratePackingManagerOpenAtom);
    const isPackModalActive = isPackOpen || isCratePackingManagerOpen;
    const setPayOpen = useSetAtom(isPaymentWizardOpenAtom);
    const setIsBatchModalOpen = useSetAtom(isBatchActionsModalOpenAtom);
    const setBatchItemsData = useSetAtom(batchActionItemsDataAtom);
    const setExportSelectedXLSX = useSetAtom(inventoryExportSelectedXLSXTriggerAtom);
    const setIsBatchWizardOpen = useSetAtom(isBatchWizardOpenAtom);
    const setBatchWizardItems = useSetAtom(batchWizardItemsAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    
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

    const allLogistics = useAtomValue(logisticsDocsAtom);
    const allInventory = useAtomValue(inventoryAtom);

    // Inventory Atoms for Filtering

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

    // Elements
    
    // The real panels own the state and the handlers (inventorySearchTermAtom, the view slider and sort atoms, the filter atoms): the bars only restyle them
    const renderInvSearch = () => <InventorySearchPanel />;
    const renderInvView = () => <InventoryViewPanel />;
    const renderInvFilters = () => <InventoryFiltersPanel />;

    const renderFinSearch = () => (
        <div className="utb-row">
            <div className="utb-search-container">
                <Search size={16} strokeWidth={3} className="utb-search-icon" />
                <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder={tr("SEARCH PAYMENTS...")} className="utb-search-input" aria-label={tr("Search")} />
                {finSearchTerm && <button onClick={() => setFinSearchTerm('')} className="utb-control utb-clear-btn utb-icon-only" aria-label={tr("Clear")} title={tr("Clear")}><X size={16} strokeWidth={3}/></button>}
            </div>
        </div>
    );

    const getSelectedItems = () => allInventory.filter(item => selectedIds.includes(item.row));

    const handleCopyTags = () => {
        const items = getSelectedItems();
        const tags = items.map(item => {
            const codes = calculateCodesAndPrices(item.data, fixedEx, workbookPrefix);
            return codes.bookBarcode;
        }).filter(Boolean).join(' ');
        if (tags) {
            navigator.clipboard.writeText(tags);
            toast.success(`Copied ${items.length} tags to clipboard`);
        }
    };

    const handleOpenTags = () => {
        setBatchItemsData(getSelectedItems());
        setIsBatchModalOpen(true);
    };

    const handleOpenAIWizard = () => {
        setBatchWizardItems(getSelectedItems());
        setIsBatchWizardOpen(true);
    };

    const [isCatalogExportOpen, setIsCatalogExportOpen] = useState(false);
    const [catalogExportProgress, setCatalogExportProgress] = useState(0);
    const [catalogExportStatus, setCatalogExportStatus] = useState('');
    const [catalogPdfBlobUrl, setCatalogPdfBlobUrl] = useState<string | null>(null);

    const handleExportCatalogPdf = () => {
        const items = getSelectedItems();
        if (items.length === 0) {
            toast.error(tr("Please select items to export"));
            return;
        }
        setIsCatalogExportOpen(true);
    };

    const handleStartCatalogExport = async (cfg: any) => {
        try {
            const selectedItems = getSelectedItems();
            const currentRate = liveEx || fixedEx || 18.0;
            const itemsToExport = selectedItems.map(item => {
                const norm = normalizeInventoryData(item.data || item);
                const rawCleanPng = norm.generatedPngUrl || norm.generated_png_url || norm.maskUrl;
                const cleanPng = rawCleanPng ? getCleanImageUrl(rawCleanPng) : null;
                const exportImgs = collectExportImages(norm);
                const allStills = collectAllImages(norm, { dropVideos: true });
                const combined = [cleanPng, ...exportImgs, ...allStills].filter(Boolean) as string[];
                const imgs = Array.from(new Set(combined));
                const codes = calculateCodesAndPrices(item.data || item, currentRate, workbookPrefix || '1');
                
                return {
                    data: norm,
                    codes: {
                        bookBarcode: codes.bookBarcode || norm.itemId || '',
                        bookAqCode: codes.bookAqCode,
                        bookLandCode: codes.bookLandCode,
                        bookRetail: codes.bookRetail,
                        primaryPriceLabel: 'USD RETAIL',
                        primaryPriceValue: `$${codes.bookRetail} USD`
                    },
                    images: imgs,
                    exportType: 'catalog'
                };
            });

            const blob = await exportCatalogPdf(itemsToExport as any, {
                title: cfg.title || "ONYX COLLECTION",
                method: cfg.method || "grid",
                exportType: 'catalog'
            }, (p: number, s: string) => {
                setCatalogExportProgress(p);
                setCatalogExportStatus(s);
            }, 'blob');

            if (blob instanceof Blob) {
                const url = URL.createObjectURL(blob);
                setCatalogPdfBlobUrl(url);
            }
            toast.success(tr("Catalog PDF generated successfully!"));
        } catch (err: any) {
            console.error("PDF Export error:", err);
            toast.error(tr("Failed to export PDF catalog: ") + (err?.message || ''));
        }
    };

    const renderInvSelection = (className = "") => (
        <div className={`utb-row ${className}`}>
            <button onClick={handleSelectAll} className="utb-control" title={tr("Select All")} aria-label={tr("Select All")}>
                <SquareCheckBig size={18} strokeWidth={2} />
                <span className="utb-label-desktop">{tr("ALL")}</span>
            </button>
            <button 
                onClick={() => { setSelectedIds([]); toast.success(tr("Selection Cleared")); }}
                className="utb-control utb-clear-btn utb-icon-only"
                aria-label={tr("Clear")} title={tr("Clear")}
            >
                <X size={18} strokeWidth={2} />
            </button>

            <div className="utb-filter-badge tabular-nums">
                {selectedIds.length}
            </div>

            <div className="utb-scrollable">
                <button onClick={() => setPrintWizardOpen(true)} className="utb-control" title={tr("Labels")} aria-label={tr("Labels")}>
                    <Tag size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("LABELS")}</span>
                </button>
                <button onClick={() => setNFCOpen(true)} className="utb-control" title={tr("Write NFC")} aria-label={tr("Write NFC")}>
                    <Nfc size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">NFC</span>
                </button>
                <button 
                    onClick={() => setPackOpen(true)} 
                    className="utb-control text-emerald-400 hover:text-emerald-300 border-emerald-500/30 hover:border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all font-black group/pack" 
                    title={tr("Pack Items")} 
                    aria-label={tr("Pack Items")}
                >
                    <Package size={18} strokeWidth={2.5} className="text-emerald-400 group-hover/pack:rotate-[-6deg] transition-transform" />
                    <span className="utb-label-desktop tracking-wide font-black">{tr("PACK")}</span>
                    {selectedIds.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black tabular-nums rounded-full bg-emerald-500/30 text-cyan-200 border border-emerald-400/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                            {selectedIds.length}
                        </span>
                    )}
                </button>
                <button onClick={() => setPayOpen(true)} className="utb-control text-green-400" title={tr("Payment Workflow")} aria-label={tr("Payment Workflow")}>
                    <DollarSign size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("PAY")}</span>
                </button>
                <button onClick={handleOpenTags} className="utb-control text-[var(--main-color)]" title={tr("Manage Tags")} aria-label={tr("Manage Tags")}>
                    <Tag size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("TAGS")}</span>
                </button>
                <button onClick={handleCopyTags} className="utb-control text-blue-400" title={tr("Copy Tag IDs")} aria-label={tr("Copy Tag IDs")}>
                    <Copy size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("COPY")}</span>
                </button>
                <button onClick={() => setExportSelectedXLSX(Date.now())} className="utb-control text-green-500" title={tr("Export XLSX")} aria-label={tr("Export XLSX")}>
                    <FileSpreadsheet size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("EXPORT")}</span>
                </button>
                <button onClick={handleExportCatalogPdf} className="utb-control text-amber-400" title={tr("Export Catalog PDF")} aria-label={tr("Export Catalog PDF")}>
                    <BookOpen size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("CATALOG")}</span>
                </button>
                <button onClick={handleOpenAIWizard} className="utb-control text-purple-400" title={tr("AI Batch Process")} aria-label={tr("AI Batch Process")}>
                    <Sparkles size={18} strokeWidth={2} />
                    <span className="utb-label-desktop">{tr("AI GEN")}</span>
                </button>
            </div>
        </div>
    );

    const renderFinFilters = (className = "") => (
        <div className={`utb-row ${className}`}>
            <div className="utb-filter-badge tabular-nums">
                <Filter size={16} strokeWidth={2.5} />
                {financeDocs.length}
            </div>
            <div className="utb-scrollable">
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
                        <button key={s.id} aria-pressed={isActive} title={s.id} onClick={() => setFinCategoryFilter(s.id as any)} className="utb-control" aria-label={s.id}>
                            <Icon size={16} strokeWidth={2.5} style={{ color: isActive ? 'var(--main-color)' : s.color }} />
                            <span className="utb-label-desktop">{s.id.toUpperCase()}</span>
                        </button>
                    );
                })}
            </div>
            <button className="utb-control utb-clear-btn utb-icon-only" onClick={() => setFinCategoryFilter('All')} aria-label={tr("Clear Filters")} title={tr("Clear Filters")}>
                <X size={18} strokeWidth={2.5} />
            </button>
        </div>
    );

    const renderFinAction = (className = "") => (
        <div className={`w-full px-8 py-4 ${className}`}>
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
    );

    const renderFinUpcoming = (className = "") => (
        <div className={`w-full px-8 py-4 ${className}`}>
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
                                
                                <div 
                                    className="absolute bottom-2 right-4 text-[32px] font-black uppercase tracking-tighter pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity"
                                    style={{ color: color, filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.5))' }}
                                >
                                    {v}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const docks: React.ReactNode[] = [];
    
    if (islandEnabled) {
        if (isInventory && isInvSearchOpen) docks.push(<SubmenuCard key="inv-search" id="inv-search" title={tr("Search")} hideTitle onClose={() => setIsInvSearchOpen(false)}>{renderInvSearch()}</SubmenuCard>);
        if (isInventory && isInvViewSliderOpen) docks.push(<SubmenuCard key="inv-view" id="inv-view" title={tr("View")} hideTitle onClose={() => setIsInvViewSliderOpen(false)}>{renderInvView()}</SubmenuCard>);
        if (isInventory && isInvFiltersOpen) docks.push(<SubmenuCard key="inv-filters" id="inv-filters" title={tr("Filters")} hideTitle onClose={() => setIsInvFiltersOpen(false)}><InventoryFiltersPanel /></SubmenuCard>);
        if (isInventory && smartOpen) docks.push(<SubmenuCard key="inv-smart" id="inv-smart" title={tr("Smart Filters")} onClose={() => setSmartOpen(false)}><InventorySmartFiltersPanel /></SubmenuCard>);
        if (isInventory && isSelectionMode && !isPackModalActive) docks.push(<SubmenuCard key="inv-select" id="inv-select" title={tr("Batch Management")} headless onClose={() => setIsSelectionMode(false)}>{renderInvSelection()}</SubmenuCard>);
        if (isFinance && isFinSearchOpen) docks.push(<SubmenuCard key="fin-search" id="fin-search" title={tr("Search Payments")} onClose={() => setIsFinSearchOpen(false)}>{renderFinSearch()}</SubmenuCard>);
        if (isFinance && isFinFiltersOpen) docks.push(<SubmenuCard key="fin-filters" id="fin-filters" title={tr("Filters")} onClose={() => setIsFinFiltersOpen(false)}>{renderFinFilters()}</SubmenuCard>);
        if (isFinance && isFinActionOpen) docks.push(<SubmenuCard key="fin-action" id="fin-action" title={tr("Requested Payments")} onClose={() => setIsFinActionOpen(false)}>{renderFinAction()}</SubmenuCard>);
        if (isFinance && isFinUpcomingOpen) docks.push(<SubmenuCard key="fin-upcoming" id="fin-upcoming" title={tr("Upcoming Payments")} onClose={() => setIsFinUpcomingOpen(false)}>{renderFinUpcoming()}</SubmenuCard>);
    }

    return (
        <div className="flex flex-col w-full z-50">
            <InventoryPanelsRegistrar />
            
            {islandEnabled && docks.length > 0 && (
                <SubmenuDock>{docks}</SubmenuDock>
            )}

            {!islandEnabled && ((isInventory && toolsOpen && (isInvSearchOpen || isInvViewSliderOpen)) || (isFinance && isFinSearchOpen)) && (
                <div className="w-full animate-in slide-in-from-top duration-500 overflow-hidden pr-4 pl-4">
                    <div className="w-full mx-auto px-6 py-3 flex flex-col gap-4">
                        {isInventory && isInvSearchOpen && renderInvSearch()}
                        {isInventory && isInvViewSliderOpen && renderInvView()}
                        {isFinance && isFinSearchOpen && renderFinSearch()}
                    </div>
                </div>
            )}

            {!islandEnabled && isInventory && isSelectionMode && !isPackModalActive && (
                <div className="w-full border-t border-white/5 animate-in slide-in-from-top duration-500 overflow-hidden px-4 bg-white/[0.02]">
                    {renderInvSelection()}
                </div>
            )}

            {!islandEnabled && isFinance && (
                <div className="flex flex-col w-full min-h-0 border-t border-white/5">
                    {isFinFiltersOpen && renderFinFilters("animate-in slide-in-from-top-4 duration-500")}
                    {isFinActionOpen && renderFinAction("border-t border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden")}
                </div>
            )}

            {!islandEnabled && isFinUpcomingOpen && isFinance && renderFinUpcoming("animate-in slide-in-from-top duration-500 overflow-hidden bg-amber-500/5")}

            {!islandEnabled && isInventory && smartOpen && (
                <InventorySmartFiltersPanel />
            )}

            {!islandEnabled && isInventory && isInvFiltersOpen && (
                renderInvFilters()
            )}

            {isCatalogExportOpen && (
                <ExportWizard
                    isOpen={isCatalogExportOpen}
                    onClose={() => {
                        setIsCatalogExportOpen(false);
                        setCatalogExportProgress(0);
                        if (catalogPdfBlobUrl) {
                            URL.revokeObjectURL(catalogPdfBlobUrl);
                            setCatalogPdfBlobUrl(null);
                        }
                    }}
                    onStart={handleStartCatalogExport}
                    progress={catalogExportProgress}
                    status={catalogExportStatus}
                    moduleName="Catalog"
                    pdfBlobUrl={catalogPdfBlobUrl}
                />
            )}

        </div>
    );
};








