
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    activeViewAtom,
    inventoryAtom,
    inventoryActiveFilterAtom,
    inventorySearchTermAtom,
    inventoryStatusFilterAtom,
    showFinancialsAtom,
    dashboardStatusFilterAtom,
    dashboardSearchTermAtom,
    userAtom,
    isDetailsPanelOpenAtom,
    SelectedItemDataAtom,
    TrafficLightStatus,
    logisticsSubTabAtom,
    financeSubTabAtom,
    uploadTabAtom,
    uploadItemDataAtom,
    shippingCameraViewAtom,
    shippingCratesAtom,
    shippingTruckDimsAtom,
    truckMaxWeightAtom,
    shippingViewModeAtom,
    sidebarStateAtom,
    triggerWarehouseOrganizationAtom,
    exchangeRateAtom,
    InventoryVersionAtom,
    inventoryViewModeAtom,
    filteredInventoryCountAtom,
    financeDataAtom,
    isUploadWizardOpenAtom,
    languageAtom,
    themeAtom,
    performanceModeAtom,
    paymentsOverviewModeAtom,
    paymentDestinationFilterAtom,
    liveExchangeRateAtom,
    currencyModeAtom,
    storeSearchTermAtom,
    activeVendorsAtom,
    inventoryVendorFilterAtom,
    isInventoryVendorFilterOpenAtom,
    financeSearchTermAtom,
    paymentVendorFilterAtom,
    isPaymentVendorFilterOpenAtom,
    isPaymentDestinationFilterOpenAtom,
    paymentCategoryFilterAtom,
    isPaymentCategoryFilterOpenAtom,
    PaymentCategory,
    paymentFilterBarModeAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { useTranslation, useLogout } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import { TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { OnyxLogo } from '../../components/OnyxLogo';
import { getStatusClass } from '../inventory/UnifiedInventoryView';
import toast from 'react-hot-toast';
import userIcons from '../../components/userIcons';
import {
    Store, CreditCard, Truck, Upload, Shield, Search, RefreshCw,
    LogOut, LayoutDashboard, LayoutGrid, List, Bookmark, Sun, Moon, Layers,
    Camera, Play, Wallet, Landmark, X, Settings, Zap, Globe,
    OctagonX, Octagon, CheckCircle, Tag, MapPin, LayoutList, Download, Filter
} from 'lucide-react';

declare const __APP_VERSION__: string;

const themes = [
    { name: 'obsidian', gradient: 'var(--gradient-obsidian)' },
    { name: 'fluorite', gradient: 'var(--gradient-fluorite)' },
    { name: 'earth', gradient: 'var(--gradient-earth)' },
    { name: 'nacar', gradient: 'var(--gradient-nacar)' },
    { name: 'tehu', gradient: 'var(--gradient-tehu)' },
    { name: 'cherry', gradient: 'var(--gradient-cherry)' },
    { name: 'stitch', gradient: 'var(--gradient-stitch)' },
];

const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const filterConfig: Record<TrafficLightStatus, { icon: string; title: string }> = {
    ALL: { icon: '○', title: 'All items' },
    RED: { icon: '●', title: 'Approved, pending payment' },
    YELLOW: { icon: '●', title: 'Payment requested, unpaid' },
    GREEN: { icon: '●', title: 'Paid / shipped' },
};

const iconToLucide: Record<string, React.FC<any>> = {
    'store': Store,
    'finance': CreditCard,
    'trucking': Truck,
    'upload': Upload,
    'shield': Shield,
    'search': Search,
    'refresh': RefreshCw,
    'logout': LogOut,
    'layout-grid': LayoutGrid,
    'layout-dashboard': LayoutDashboard,
    'list-bullet': List,
    'bookmark': Bookmark,
    'sun': Sun,
    'moon': Moon,
    'layers': Layers,
    'camera': Camera,
    'play': Play,
    'credit-card': CreditCard,
    'bank': Landmark,
    'wallet': Wallet,
    'truck': Truck,
};


const SubTabPills: React.FC<{
    tabs: { id: string; label: string; icon?: string }[];
    active: string;
    onSelect: (id: string) => void;
    accentColor?: string;
}> = ({ tabs, active, onSelect, accentColor = 'var(--main-color)' }) => (
    <div className="flex items-center gap-1">
        {tabs.map(t => {
            const TabIcon = t.icon ? iconToLucide[t.icon.replace('#', '')] : null;
            return (
                <button key={t.id} onClick={() => onSelect(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200
                        ${active === t.id ? 'text-black shadow-lg scale-[1.03] bg-white/30' : 'bg-white/5 text-white/35 hover:text-white/70 hover:bg-white/10'}`}
                    style={active === t.id ? { backgroundColor: accentColor } : {}}>
                    {TabIcon && <TabIcon size={13} strokeWidth={1.75} />}
                    {t.label}
                </button>
            );
        })}
    </div>
);

const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
    const BadgeIcon = iconToLucide[icon] || Store;
    return (
        <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-white/10 shrink-0 truncate">
            <BadgeIcon size={16} strokeWidth={1.75} style={{ color }} />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] truncate" style={{ color }}>{label}</span>
        </div>
    );
};

const ShippingStats: React.FC = () => {
    const crates = useAtomValue(shippingCratesAtom);
    const truckDims = useAtomValue(shippingTruckDimsAtom);
    const maxWeight = useAtomValue(truckMaxWeightAtom);
    const loaded = crates.filter(c => c.location === 'truck');
    const weight = loaded.reduce((s, c) => s + c.weight, 0);
    const pct = Math.min(100, Math.round((weight / maxWeight) * 100));
    const vol = loaded.reduce((s, c) => s + c.w * c.h * c.d, 0);
    const truckVol = truckDims.length * truckDims.width * truckDims.height;
    const volPct = truckVol > 0 ? Math.round((vol / truckVol) * 100) : 0;

    return (
        <div className="hidden lg:flex items-center gap-3 text-[9px] font-mono text-white/40">
            <span className="flex items-center gap-1"><span className="text-white/70 font-black">{loaded.length}</span> crates</span>
            <div className="flex items-center gap-1">
                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}% wt</span>
            </div>
            <div className="flex items-center gap-1">
                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#6BCEBB] rounded-full transition-all" style={{ width: `${volPct}%` }} />
                </div>
                <span>{volPct}% vol</span>
            </div>
        </div>
    );
};


const InventoryBar: React.FC<{ onExport: () => void, isExporting: boolean }> = ({ onExport, isExporting }) => {
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const inventory = useAtomValue(inventoryAtom);

    // Statuses that are store/catalog items — excluded from the export
    const EXCLUDED_STATUSES = new Set(['available', 'avaiable', 'catalog', 'store']);


    return (
        <>
            <div className="flex flex-1 items-center gap-4 ml-2">
                <Store size={22} strokeWidth={1.75} color="var(--color-inventory)" className="shrink-0 hidden lg:block" />

                {/* Search bar — full width, centered */}
                <div className="flex-1 relative group/search mx-auto max-w-2xl">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                        <Search size={15} strokeWidth={2} className="text-white/40 group-focus-within/search:text-(--main-color) transition-colors" />
                    </div>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by tag ID, shape, color… (space = AND)"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-xs text-white outline-none placeholder-white/25 focus:bg-white/10 focus:border-(--main-color)/40 transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/30 hover:text-white/70 transition-colors">
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 ml-2 relative">
                    {/* Vendor Filter Toggle */}
                    <button
                        className={`p-2 transition-all hover:scale-110 flex items-center justify-center shrink-0 ${isVendorFilterOpen ? 'text-(--color-inventory)' : 'text-white/50 hover:text-white'}`}
                        onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)}
                        title="Filter by Vendor"
                    >
                        <Tag size={18} strokeWidth={1.75} />
                        {vendorFilter !== 'All' && (
                            <span className="ml-1 text-[10px] font-black" style={{ color: vendors[vendorFilter as keyof typeof vendors]?.color }}>{vendorFilter}</span>
                        )}
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

                    {/* Status Filter Single Toggle */}
                    <button
                        className="p-2 text-white/50 hover:text-white hover:scale-110 transition-all flex items-center justify-center shrink-0"
                        onClick={() => {
                            const next: Record<string, 'All' | 'Partial' | 'Requested' | 'Paid'> = {
                                'All': 'Partial',
                                'Partial': 'Requested',
                                'Requested': 'Paid',
                                'Paid': 'All'
                            };
                            setStatusFilter(next[statusFilter] || 'All');
                        }}
                        title={
                            statusFilter === 'All' ? 'Filter: All items' :
                            statusFilter === 'Partial' ? 'Filter: Partially Paid' :
                            statusFilter === 'Requested' ? 'Filter: Payment Requested' :
                            'Filter: Paid'
                        }
                    >
                        {statusFilter === 'All' && <div className="w-5 h-5 rounded-full border-2 border-white/50" />}
                        {statusFilter === 'Partial' && <div className="w-5 h-5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]" />}
                        {statusFilter === 'Requested' && <div className="w-5 h-5 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />}
                        {statusFilter === 'Paid' && <div className="w-5 h-5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]" />}
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

                    {/* Single View Mode Toggle */}
                    <button
                        className="p-2 transition-all hover:scale-110 hidden sm:flex text-white/60 hover:text-white"
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
                    >
                        {viewMode === 'grid'
                            ? <List size={18} strokeWidth={1.75} />
                            : <LayoutGrid size={18} strokeWidth={1.75} />}
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

                    {/* Export Master Unified XLSX */}
                    <button
                        onClick={onExport}
                        disabled={isExporting || inventory.length === 0}
                        className="p-2 transition-all hover:scale-110 flex items-center gap-1 shrink-0 text-white/40 hover:text-(--color-inventory) disabled:opacity-20 disabled:cursor-not-allowed"
                        title={`Export MASTER XLSX — combined Finance (Ledger/Summary) & Inventory (one sheet per vendor)`}
                    >
                        <Download size={17} strokeWidth={1.75} className={isExporting ? 'animate-bounce' : ''} />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:block">XLSX</span>
                    </button>
                </div>
            </div>

            {/* Vendor Filter Bar — horizontal frame rendered below header */}
            {isVendorFilterOpen && (
                <div
                    className="absolute top-full left-0 right-0 z-40 flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2 duration-200"
                    style={{
                        background: 'color-mix(in srgb, var(--sidebar-bg) 95%, transparent)',
                        backdropFilter: 'blur(24px)',
                        borderBottom: '1px solid color-mix(in srgb, var(--text-color) 8%, transparent)',
                    }}
                >
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 shrink-0 mr-2">Vendor</span>
                    <button
                        onClick={() => setVendorFilter('All')}
                        className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${vendorFilter === 'All'
                            ? 'bg-white/20 border-white/30 text-white'
                            : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        All
                    </button>
                    {activeVendors.map(v => {
                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                        const isActive = vendorFilter === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5 ${isActive
                                    ? 'text-black border-transparent shadow-lg'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                style={isActive ? { backgroundColor: color, borderColor: color } : { borderColor: color + '40' }}>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {v}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setIsVendorFilterOpen(false)}
                        className="ml-auto shrink-0 p-1.5 rounded-full text-white/20 hover:text-white transition-colors"
                        title="Close vendor filter"
                    >
                        <X size={12} strokeWidth={2.5} />
                    </button>
                </div>
            )}
        </>
    );
};


const StoreBar: React.FC = () => {
    const [search, setSearch] = useAtom(storeSearchTermAtom);

    return (
        <div className="flex flex-1 items-center gap-4 ml-2 relative">
            <Store size={22} strokeWidth={1.75} color="var(--color-store)" className="shrink-0 hidden sm:block" />

            <div className="flex-1 w-full relative group/search max-w-2xl mx-auto">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Search size={18} strokeWidth={2} className="text-white/40 group-focus-within/search:text-(--main-color) transition-colors" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search Tag ID, Shape, Color... (space = AND)"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-10 text-sm text-white outline-none placeholder-white/25 focus:bg-white/10 focus:border-(--main-color)/40 transition-all shadow-lg backdrop-blur-md"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/30 hover:text-white/70 transition-colors">
                        <X size={16} strokeWidth={2.5} />
                    </button>
                )}
            </div>
            {/* <ModuleBadge icon="store" label="Storefront" color="#F36F21" /> */}
        </div>
    );
};

const FinanceBar: React.FC<{ onExport: () => void, isExporting: boolean }> = ({ onExport, isExporting }) => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const docs = useAtomValue(financeDataAtom);
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [search, setSearch] = useAtom(financeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(paymentVendorFilterAtom);
    const [isVendorOpen, setIsVendorOpen] = useAtom(isPaymentVendorFilterOpenAtom);
    const [isDestOpen, setIsDestOpen] = useAtom(isPaymentDestinationFilterOpenAtom);
    const [categoryFilter, setCategoryFilter] = useAtom(paymentCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isPaymentCategoryFilterOpenAtom);

    const [filterMode, setFilterMode] = useAtom(paymentFilterBarModeAtom);
    const activeVendors = useMemo(() => Array.from(new Set(docs.map(d => Object.keys(vendors).find(v => d.description?.includes(v))).filter(Boolean))) as string[], [docs]);

    const activeDestPendingRecords = useMemo(() => {
        return destinationFilter !== 'All'
            ? docs.filter(d => d.destination === destinationFilter && (d.status === 'Requested' || !d.status))
            : [];
    }, [docs, destinationFilter]);

    const activeDestReqNetMXN = useMemo(() => {
        return activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
    }, [activeDestPendingRecords]);

    const activeDestReqNetUSD = activeDestReqNetMXN / (liveExchangeRate || exchangeRate);

    const cycleOverviewMode = () => {
        const next: Record<string, 'extended' | 'minimal' | 'collapsed'> = {
            'extended': 'minimal', 'minimal': 'collapsed', 'collapsed': 'extended',
        };
        setOverviewMode(next[overviewMode] || 'extended');
    };
    const modeLabel: Record<string, string> = { extended: 'Full', minimal: 'Min', collapsed: 'Off' };

    const closeAll = () => { setIsVendorOpen(false); setIsDestOpen(false); setIsCategoryOpen(false); };

    const CATEGORIES: PaymentCategory[] = ['All', 'ACQ', 'PROD', 'MONTHLY', 'SPPL', 'LABR', 'PACK', 'OPRT'];


    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
    const toggleCurrency = () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN');

    return (
        <div className="flex flex-1 items-center gap-3 ml-2 relative">
            <CreditCard size={22} strokeWidth={1.75} color="var(--color-finance)" className="shrink-0 hidden sm:block" />

            {/* Smart search bar */}
            <div className="flex-1 relative group/search mx-auto max-w-2xl">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Search size={15} strokeWidth={2} className="text-white/40 group-focus-within/search:text-(--color-finance) transition-colors" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search payments… (space = AND)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-xs text-white outline-none placeholder-white/25 focus:bg-white/10 focus:border-[#A78BFA]/40 transition-all"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/30 hover:text-white/70 transition-colors">
                        <X size={13} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {/* Pending net total for active destination (floats center above) */}
            {destinationFilter !== 'All' && activeDestReqNetMXN > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 flex items-center gap-2 px-3 py-1 bg-[#A78BFA]/10 border border-[#A78BFA]/30 rounded-xl z-20 pointer-events-none" style={{ backgroundColor: 'color-mix(in srgb, var(--color-finance) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--color-finance) 30%, transparent)' }}>
                    <span className="text-[9px] font-black text-(--color-finance) uppercase tracking-[0.2em]" style={{ color: 'var(--color-finance)' }}>PENDING</span>
                    <span className="text-[12px] font-mono font-black text-(--color-finance)" style={{ color: 'var(--color-finance)' }}>
                        {currencyMode === 'MXN' 
                            ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(activeDestReqNetMXN)
                            : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(activeDestReqNetUSD)
                        }
                    </span>
                    <span className="text-[8px] font-black bg-white/10 px-1.5 py-0.5 rounded ml-1" style={{ color: currencyMode === 'USD' ? '#10b981' : '#38bdf8' }}>{currencyMode}</span>
                </div>
            )}

            <div className="flex items-center gap-0.5 ml-2 relative shrink-0">
                
                {/* Global Currency Toggle */}
                <button
                    onClick={toggleCurrency}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 group/curr ${
                        currencyMode === 'USD' 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                        : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                    }`}
                >
                    <span className="text-[12px] font-black">$</span>
                    <div className="w-px h-3 bg-white/10 mx-0.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{currencyMode}</span>
                </button>

                <div className="w-px h-5 bg-white/10 mx-1" />

                <div className="relative">
                    <button
                        onClick={() => setFilterMode(filterMode === 'off' ? 'left' : 'off')}
                        className={`p-2 transition-all hover:scale-110 flex items-center gap-1.5 shrink-0 ${filterMode !== 'off' ? 'text-(--color-finance)' : 'text-white/40 hover:text-white'}`}
                        title="Toggle Filter Bar"
                    >
                        <Filter size={18} strokeWidth={2} />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:block">Filters</span>
                    </button>
                </div>

                <div className="w-px h-5 bg-white/10 mx-1" />

                {/* 3-state Overview Density Toggle */}
                <button
                    onClick={cycleOverviewMode}
                    className={`p-2 transition-all hover:scale-110 flex items-center gap-1.5 shrink-0 ${overviewMode === 'collapsed' ? 'text-white/25 hover:text-white' :
                        overviewMode === 'minimal' ? 'text-(--color-finance)/50 hover:text-(--color-finance)' : 'text-(--color-finance)'
                        }`}
                    title={`Overview Layout: ${modeLabel[overviewMode]}`}
                >
                    <LayoutList size={18} strokeWidth={2} />
                    <span className="text-[9px] font-black uppercase tracking-widest">{modeLabel[overviewMode]}</span>
                </button>

                <div className="w-px h-5 bg-white/10 mx-1" />

            </div>
        </div>
    );
};


const LogisticsBar: React.FC = () => {
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);

    const tabs = [
        { id: 'crates', label: 'CRATES', icon: 'truck' },
        { id: 'packing', label: 'PACK', icon: 'package' },
        { id: 'shipping', label: 'TRK', icon: 'map-pin' },
    ];

    return (
        <>
            <ModuleBadge icon="truck" label="Shipping" color="var(--color-logistics)" />

            <div className="flex items-center gap-2 ml-2">
                <SubTabPills
                    tabs={tabs}
                    active={subTab}
                    onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
                    accentColor="var(--color-logistics)"
                />
            </div>

            {subTab === 'packing' && (
                <div className="flex-1 max-w-xl mx-4 relative group/search">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/search:text-(--main-color) transition-all" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="SEARCH INVENTORY…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-11 pr-10 text-[11px] font-bold text-white outline-none placeholder-white/20 focus:bg-white/10 focus:border-(--main-color)/30 transition-all uppercase tracking-widest"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white cursor-pointer">
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}

            <div className="ml-auto">
                <span className="text-[9px] font-black text-white/15 uppercase tracking-widest hidden lg:block">Shipping Protocol v1.29</span>
            </div>
        </>
    );
};

const PackingBar: React.FC = () => {
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    return (
        <div className="flex flex-1 items-center gap-4 ml-2">
            <div className="flex items-center gap-3 pr-6 border-r border-white/5">
                <div className="flex items-center justify-center text-(--main-color) transition-all duration-500 hover:scale-110">
                    <svg className="w-7 h-7 opacity-90"><use href="#pkg" /></svg>
                </div>
                <div className="flex flex-col">
                    <h2 className="text-[14px] font-black tracking-tight leading-none text-(--text-color)">PACKING</h2>
                    <span className="text-[8px] font-black text-(--main-color) opacity-60 uppercase tracking-[0.2em] mt-1">MODULE active</span>
                </div>
            </div>

            <div className="flex-1 max-w-2xl mx-auto relative group/search">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/search:text-(--main-color) transition-all" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="SEARCH INVENTORY PIPELINE..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-11 pr-10 text-[11px] font-bold text-white outline-none placeholder-white/20 focus:bg-white/10 focus:border-(--main-color)/30 transition-all uppercase tracking-widest"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white">
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

const UploadBar: React.FC = () => {
    const itemData = useAtomValue(uploadItemDataAtom);
    return (
        <div className="flex items-center gap-4">
            <ModuleBadge icon="upload" label="Add Entry" color="var(--color-upload)" />

            <div className="bg-(--main-color) text-black px-5 py-2.5 rounded-b-xl shadow-2xl flex flex-col items-center min-w-[90px] border-x border-b border-black/20 transform -translate-y-2 hover:translate-y-1 transition-all duration-700 cursor-default group z-50">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] leading-none mb-1.5 opacity-60 group-hover:opacity-100 transition-opacity">BOOK V</span>
                <span className="text-[14px] font-black font-mono leading-none tracking-tight">{itemData.workbook || 'v326'}</span>
            </div>
        </div>
    );
};

const ControlBar: React.FC = () => (
    <>
        <ModuleBadge icon="shield" label="Control" color="var(--color-control)" />
        <div className="ml-auto">
            <span className="text-[9px] font-black text-white/15 uppercase tracking-widest">Developer Only</span>
        </div>
    </>
);


export function MainHeader() {
    const [activeView] = useAtom(activeViewAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [performanceMode, setPerformanceMode] = useAtom(performanceModeAtom);
    const [language, setLanguage] = useAtom(languageAtom);
    const [theme, setTheme] = useAtom(themeAtom);
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);

    const inventory = useAtomValue(inventoryAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRateValue = useAtomValue(liveExchangeRateAtom);
    const [isExporting, setIsExporting] = useState(false);

    // Statuses that are store/catalog items — excluded from the export
    const EXCLUDED_STATUSES = new Set(['available', 'avaiable', 'catalog', 'store']);

    const handleMasterExportXLSX = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            // 1. DYNAMIC PARTIAL PAYMENT TRACKING (Reflecting latest app balance logic)
            const partialPayIds = new Set<string>();
            financeDocs.forEach(d => {
                if (d.status === 'Paid' && d.description?.includes('%')) {
                    const rel = d.related_ids || (d.related_inventory_ids ? d.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
                    if (Array.isArray(rel)) rel.forEach((id: string) => partialPayIds.add(String(id)));
                    else if (typeof rel === 'string' && rel.includes(',')) rel.split(',').forEach((id: string) => partialPayIds.add(id.trim()));
                }
            });

            // 2. FINANCE DATA (Ledger and Summary)
            const rate = liveExchangeRateValue || exchangeRate;
            const ledgerRows = financeDocs.map(r => ({
                'Date': r.date ? new Date(r.date).toLocaleDateString('en-US') : '',
                'Description': r.description || '',
                'Category': r.subcategory || r.category || '',
                'Vendor': r.vendor_id || '',
                'Amount (MXN)': r.amount ?? 0,
                'Commission (MXN)': r.commission ?? 0,
                'Total (MXN)': (r.amount ?? 0) + (r.commission ?? 0),
                'Status': r.status || 'Requested',
                'Destination': r.destination || '',
                'Payment Method': r.payment_method || '',
                'Reference': r.reference || '',
                'Pay Date': r.pay_date ? new Date(r.pay_date).toLocaleDateString('en-US') : '',
                'Notes': r.notes || '',
                'Recurring': r.recurring ? 'Yes' : 'No',
                'ID': r.id || '',
            }));

            const totalAll = financeDocs.reduce((s, d) => s + (d.amount ?? 0), 0);
            const totalPaid = financeDocs.filter(d => d.status === 'Paid').reduce((s, d) => s + (d.amount ?? 0), 0);
            const totalPend = totalAll - totalPaid;
            
            const catMap: Record<string, { total: number; paid: number }> = {};
            financeDocs.forEach(d => {
                const cat = d.subcategory || d.category || 'Other';
                if (!catMap[cat]) catMap[cat] = { total: 0, paid: 0 };
                catMap[cat].total += d.amount ?? 0;
                if (d.status === 'Paid') catMap[cat].paid += d.amount ?? 0;
            });

            const summaryRows: any[] = [
                { 'Section': '── OVERVIEW ──', 'Label': '', 'Total (MXN)': '', 'Paid (MXN)': '', 'Pending (MXN)': '', 'Total (USD)': '' },
                { 'Section': 'Finance Database', 'Label': 'Grand Total', 'Total (MXN)': totalAll, 'Paid (MXN)': totalPaid, 'Pending (MXN)': totalPend, 'Total (USD)': +(totalAll / rate).toFixed(2) },
                { 'Section': '', 'Label': `Exchange Rate Used`, 'Total (MXN)': '', 'Paid (MXN)': '', 'Pending (MXN)': '', 'Total (USD)': rate },
                { 'Section': '', 'Label': `Records`, 'Total (MXN)': financeDocs.length, 'Paid (MXN)': '', 'Pending (MXN)': '', 'Total (USD)': '' },
                { 'Section': '', 'Label': '', 'Total (MXN)': '', 'Paid (MXN)': '', 'Pending (MXN)': '', 'Total (USD)': '' },
                { 'Section': '── BY CATEGORY ──', 'Label': '', 'Total (MXN)': '', 'Paid (MXN)': '', 'Pending (MXN)': '', 'Total (USD)': '' },
                ...Object.entries(catMap).sort((a,b) => b[1].total - a[1].total).map(([cat, v]) => ({
                    'Section': 'Category', 'Label': cat, 'Total (MXN)': v.total, 'Paid (MXN)': v.paid, 'Pending (MXN)': v.total - v.paid, 'Total (USD)': +(v.total / rate).toFixed(2)
                }))
            ];

            const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Finance Summary');
            const ledgerSheet = XLSX.utils.json_to_sheet(ledgerRows);
            XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Finance Ledger');

            // 3. INVENTORY DATA (Acquisition & Production)
            const exportItems = inventory.filter(item => {
                const status = (item.data.status || '').toLowerCase().trim();
                return !EXCLUDED_STATUSES.has(status);
            });

            const vendorMap: Record<string, typeof exportItems> = {};
            for (const item of exportItems) {
                const d = item.data as any;
                const itemIdStr = String(d.item_id || d.itemId || '');
                let vid: string = d.vendor_id || d.vendorId || '';
                if (!vid && itemIdStr.includes('-')) vid = itemIdStr.split('-')[0];
                if (!vid) vid = 'Unknown';
                if (!vendorMap[vid]) vendorMap[vid] = [];
                vendorMap[vid].push(item);
            }

            const vendorOrder = Object.keys(vendors);
            const sortedVendorIds = [
                ...vendorOrder.filter(v => vendorMap[v]),
                ...Object.keys(vendorMap).filter(v => !vendorOrder.includes(v)),
            ];

            for (const vid of sortedVendorIds) {
                const items = vendorMap[vid];
                const rows = items.map(item => {
                    const d = item.data as any;
                    const norm = normalizeInventoryData(d);
                    const tagId = String(d.item_id || d.itemId || '');
                    const price = parseFloat(String(d.price_mxn || d.price || '0')) || 0;
                    const qty = parseFloat(String(d.quantity || '1')) || 1;
                    
                    const payStatusClass = getStatusClass(norm, partialPayIds);
                    const payStatus = payStatusClass === 'GREEN' ? 'Paid' : (payStatusClass === 'YELLOW' ? 'Requested' : (payStatusClass === 'RED' ? 'Partial' : 'Unpaid'));

                    const computed = calculateCodesAndPrices(norm, rate, norm.workbook || '326');

                    return {
                        'TAG ID': computed.bookBardcode,
                        'Item #': d.item_number || d.itemNumber || '',
                        'Status': d.status || '',
                        'Shape': d.shape || '',
                        'Material': d.material || '',
                        'Color': d.color || '',
                        'Description': d.description || d.short_description || d.shortDescription || '',
                        'Qty': qty,
                        'Price (MXN)': price,
                        'Subtotal (MXN)': +(price * qty).toFixed(2),
                        'ACQ Code': computed.bookAqCode,
                        'LND Code': computed.bookLandCode,
                        'Retail (USD)': computed.bookRetail !== '-' ? Number(computed.bookRetail) : '',
                        'Pay Status': payStatus,
                        'Workbook': d.workbook || '',
                        'Update Date': (item as any).updated_at ? new Date((item as any).updated_at).toLocaleDateString() : ''
                    };
                });

                rows.sort((a,b) => String(a['TAG ID']).localeCompare(String(b['TAG ID'])));
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, vid.slice(0, 31));
            }

            const ts = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `Onyx_Master_Export_${ts}.xlsx`);
            toast.success('Unified Master Export Complete');
        } catch (err: any) {
            toast.error(`Export failed: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const toggleSidebar = () => setSidebarState(cur => cur === 'hidden' ? 'expanded' : 'hidden');

    const user = useAtomValue(userAtom);
    const logout = useLogout();
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const t = useTranslation();

    const handleRefresh = () => {
        toast.loading("Synchronizing Database...", { duration: 1500 });
        setTimeout(() => window.location.reload(), 500);
    };

    const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;

    return (
        <div className="h-16 flex items-center px-4 shrink-0 transition-colors delay-100 flex-nowrap w-full relative z-10 border-b border-white/5 bg-(--main-header-bg)">

            {/* Mobile Sidebar toggle if needed, or simply let FAB handle it mostly, but good to have a simple button here */}
            {sidebarState !== 'expanded' && (
                <button className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 mr-2 sm:mr-3 shrink-0 lg:hidden" onClick={toggleSidebar}>
                    <svg className="w-4 h-4 text-(--text-color)/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
            )}

            {/* Dynamic module bar — grows to fill available space */}
            <div className="flex-1 flex items-center gap-2 sm:gap-3 overflow-x-hidden overflow-y-visible min-w-0">
                {activeView === 'inventory' && <InventoryBar onExport={handleMasterExportXLSX} isExporting={isExporting} />}
                {activeView === 'store' && <StoreBar />}
                {activeView === 'finance' && <FinanceBar onExport={handleMasterExportXLSX} isExporting={isExporting} />}
                {activeView === 'logistics' && <LogisticsBar />}
                {activeView === 'packing' && <PackingBar />}
                {activeView === 'upload' && <UploadBar />}
                {activeView === 'control' && <ControlBar />}
                {activeView === 'overview' && (
                    <div className="flex items-center gap-3">
                        <ModuleBadge icon="layout-dashboard" label="Overview" color="var(--main-color)" />
                        
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl shrink-0">
                            <span className="text-[10px] uppercase font-black tracking-widest text-white/20">Rate</span>
                            <div className="h-4 w-px bg-white/10" />
                            <span className="text-[11px] font-mono font-black text-white/40">1 USD = {(liveExchangeRateValue || exchangeRate).toFixed(2)} MXN</span>
                        </div>

                        {/* Global Currency Toggle */}
                        <button
                            onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 group/curr ${
                                currencyMode === 'USD' 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                            }`}
                        >
                            <span className="text-[12px] font-black">$</span>
                            <div className="w-px h-3 bg-white/10 mx-0.5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{currencyMode}</span>
                        </button>

                        <button 
                            onClick={handleMasterExportXLSX}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-(--main-color)/10 hover:bg-(--main-color)/20 border border-(--main-color)/30 text-(--main-color) rounded-xl transition-all shadow-sm disabled:opacity-50"
                        >
                            <Download size={14} strokeWidth={2.5} className={isExporting ? 'animate-bounce' : ''} />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">XLSX</span>
                        </button>
                    </div>
                )}
                {activeView === 'dashboard' && (
                    <>
                        <ModuleBadge icon="layout-grid" label="Analytics" color="var(--color-analytics)" />
                        <div className="ml-auto">
                            <span className="text-[9px] font-black text-(--text-color) opacity-20 uppercase tracking-widest">Admin Control</span>
                        </div>
                    </>
                )}
                {(activeView === 'create' || !activeView) && (
                    <span className="text-[10px] font-black text-(--text-color) opacity-20 uppercase tracking-widest">Onyx.mx</span>
                )}
            </div>


            {/* User Info & Actions */}
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-(--text-color)/5 shrink-0">
                <div className="hidden lg:flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--main-color) leading-none mb-1">Welcome back,</span>
                    <span className="text-xl font-black text-(--text-color) tracking-tight leading-none capitalize">
                        {(user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
                            ? user.name
                            : user?.email?.split('@')[0] || 'User'}
                    </span>
                </div>

                <div className="flex items-center justify-center shrink-0 hover:scale-105 transition-transform duration-300">
                    {UserIcon ? <UserIcon className="w-8 h-8 text-(--main-color) opacity-80" /> : <svg className="w-8 h-8 text-(--main-color) opacity-50"><use href="#user" /></svg>}
                </div>

                <div className="flex items-center gap-1 relative">
                    <Settings size={18} strokeWidth={1.75}
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`cursor-pointer text-(--text-color) opacity-40 hover:opacity-80 transition-all duration-300 ${isSettingsOpen ? 'rotate-90 text-(--main-color)' : ''}`} />
                    {isSettingsOpen && createPortal(
                        <>
                            {/* Backdrop */}
                            <div className="fixed inset-0 z-9998" onClick={() => setIsSettingsOpen(false)} />
                            {/* Panel */}
                            <div className="fixed top-16 right-6 w-72 bg-(--background-color)/90 backdrop-blur-2xl border border-(--text-color)/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-5 flex flex-col gap-5 z-9999 animate-in fade-in slide-in-from-top-2 duration-200">

                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-(--main-color)">Settings</span>
                                    <button onClick={() => setIsSettingsOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-full bg-(--text-color)/5 hover:bg-(--text-color)/10 text-(--text-color) opacity-30 hover:opacity-100 transition-all">
                                        <X size={12} />
                                    </button>
                                </div>

                                {/* Language */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color) opacity-30">Language</span>
                                    <button onClick={() => setLanguage(l => l === 'en' ? 'es' : 'en')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-(--text-color)/5 hover:bg-(--text-color)/10 border border-(--text-color)/5 transition-all group">
                                        <Globe size={15} strokeWidth={1.75} className="text-(--text-color) opacity-40 group-hover:opacity-70 transition-opacity" />
                                        <span className="flex-1 text-xs font-bold text-(--text-color) opacity-70">Display Language</span>
                                        <span className="text-[10px] uppercase font-black bg-(--text-color)/10 px-2.5 py-1 rounded-lg text-(--text-color) opacity-60">{language === 'en' ? 'EN' : 'ES'}</span>
                                    </button>
                                </div>

                                {/* Appearance — Theme + Performance */}
                                <div className="flex flex-col gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color) opacity-30">Appearance</span>
                                    <div className="grid grid-cols-6 gap-2">
                                        {themes.map(th => (
                                            <button key={th.name} onClick={() => setTheme(th.name)}
                                                className={`w-8 h-8 rounded-xl cursor-pointer transition-all hover:scale-110 border ${theme === th.name ? 'border-(--main-color) ring-2 ring-(--main-color)/30 scale-110 shadow-lg' : 'border-(--text-color)/10 hover:border-(--text-color)/20'}`}
                                                style={{ background: th.gradient }} title={th.name} />
                                        ))}
                                    </div>
                                    <button onClick={() => setPerformanceMode(!performanceMode)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-(--text-color)/5 hover:bg-(--text-color)/10 border border-(--text-color)/5 transition-all group mt-1">
                                        <Zap size={15} strokeWidth={1.75} className={`transition-colors ${performanceMode ? 'text-yellow-400' : 'text-(--text-color) opacity-40 group-hover:opacity-70'}`} />
                                        <span className="flex-1 text-xs font-bold text-(--text-color) opacity-70">Performance Mode</span>
                                        <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg transition-colors ${performanceMode ? 'bg-yellow-400/20 text-yellow-400' : 'bg-(--text-color)/10 text-(--text-color) opacity-40'}`}>{performanceMode ? 'ON' : 'OFF'}</span>
                                    </button>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-color) opacity-30">Actions</span>
                                    <button onClick={handleRefresh} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-(--text-color)/5 hover:bg-(--text-color)/10 border border-(--text-color)/5 transition-all group">
                                        <RefreshCw size={15} strokeWidth={1.75} className="text-(--text-color) opacity-40 group-hover:opacity-70 transition-opacity" />
                                        <span className="flex-1 text-xs font-bold text-(--text-color) opacity-70 text-left">Refresh Sync</span>
                                    </button>
                                    <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all group">
                                        <LogOut size={15} strokeWidth={1.75} className="text-red-500/60 group-hover:text-red-500 transition-colors" />
                                        <span className="flex-1 text-xs font-bold text-red-500/70 group-hover:text-red-500 text-left transition-colors">Logout Session</span>
                                    </button>
                                </div>
                            </div>
                        </>,
                        document.body
                    )}
                </div>
            </div>
        </div>
    );
}
