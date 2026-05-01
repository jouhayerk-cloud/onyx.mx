// Force HMR refresh for navigation modernization
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
    filteredInventoryTotalQtyAtom,
    filteredInventoryTotalValueAtom,
    filteredInventoryIdsAtom,
    inventoryArtifactConfigAtom,
    financeDataAtom,
    isUploadWizardOpenAtom,
    languageAtom,
    themeAtom,
    performanceModeAtom,
    paymentsOverviewModeAtom,
    paymentDestinationFilterAtom,
    liveExchangeRateAtom,
    currencyModeAtom,
    logisticsDataAtom,
    storeSearchTermAtom,
    storeActiveVendorFilterAtom,
    storeViewModeAtom,
    storeVendorOptionsAtom,
    storeShoppingBagAtom,
    isStoreBagOpenAtom,
    activeVendorsAtom,
    inventoryVendorFilterAtom,
    isInventoryVendorFilterOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    isInventorySortMenuOpenAtom,
    financeSearchTermAtom,
    paymentVendorFilterAtom,
    isPaymentVendorFilterOpenAtom,
    isPaymentDestinationFilterOpenAtom,
    paymentCategoryFilterAtom,
    isPaymentCategoryFilterOpenAtom,
    PaymentCategory,
    paymentFilterBarModeAtom,
    processActiveTabAtom,
    TOP_BAR_SEARCH_ATOM,
    packingViewModeAtom,
    packingVendorFilterAtom,
    packingLabelSizeAtom,
    isPackingPrintWizardOpenAtom,
    packingExportPDFTriggerAtom,
    packingExportXLSXTriggerAtom,
    packingExportJSONTriggerAtom,
    isPackingFiltersOpenAtom,
    isPackingNFCWizardOpenAtom,
    truckReadyTriggerAtom,
    truckIsBusyAtom,
    truckViewModeAtom,
    truckShowSaveDraftAtom,
    truckShowOpenDraftAtom,
    truckShowExportModalAtom,
    truckShowReadyWizardAtom,
    truckShowPanelsAtom,
    packingSelectedIdsAtom,
    isStudioSettingsOpenAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData, formatDimensionsImperial, formatWeightImperial, formatDimensionsMetricOnly, formatDimensionsImperialOnly, formatWeightMetricOnly, formatWeightImperialOnly, getStatusClass } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { useTranslation, useLogout } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import ExcelJS from 'exceljs';
import { getStatusColor, getCategoryColor, getVendorColor, getContrastColor, EXCEL_STYLES } from '../../lib/excelStyles';
import { saveAs } from 'file-saver';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';

import toast from 'react-hot-toast';
import userIcons from '../../components/userIcons';
import { supabase } from '../../lib/supabase';
import {
    ArrowUpDown, ArrowUp, ArrowDown, Share2, Copy, ExternalLink, Layout, ShoppingBag,
    CreditCard, Truck, Upload, Shield, Search, RefreshCw, LogOut, LayoutGrid, 
    LayoutDashboard, List, Bookmark, Sun, Moon, Layers, Camera, Zap, Settings, 
    Download, DownloadCloud, Filter, ArrowUpRight, Check, X, ChevronRight, 
    ChevronLeft, Plus, Trash2, Grid, FileText, Database, Calendar, DollarSign, 
    Globe, Languages, Cpu, Clock, ArrowRight, Lock, Unlock, Printer,
    Landmark, Wallet, Play, Store, Package, MapPin, LayoutList,
    Target, Library, FolderKanban, FileJson, FileSpreadsheet, Nfc, ListFilter,
    Grid3x3, PanelTop, PanelTopClose, FolderOpen, Save
} from 'lucide-react';

import { THEME_ASSETS } from '../../lib/themes-assets';
import { ShoppingBagDrawer } from '../store/ShoppingBagDrawer';

declare const __APP_VERSION__: string;

const themes = [
    { name: 'talan', swatch: THEME_ASSETS.talan.swatch },
    { name: 'fluorite', swatch: THEME_ASSETS.fluorite.swatch },
    { name: 'nacar', swatch: THEME_ASSETS.nacar.swatch },
    { name: 'aqua', swatch: THEME_ASSETS.aqua.swatch },
];

const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const filterConfig: Record<TrafficLightStatus, { icon: string; title: string }> = {
    ALL: { icon: '○', title: 'All items' },
    RED: { icon: '●', title: 'Approved, pending payment' },
    YELLOW: { icon: '●', title: 'Payment requested, unpaid' },
    GREEN: { icon: '●', title: 'Paid / Prepaid' },
};

const iconToLucide: Record<string, React.FC<any>> = {
    'store': ShoppingBag,
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
    'package': Package,
    'map-pin': MapPin,
    'download': Download,
};


const SubTabPills: React.FC<{
    tabs: { id: string; label: string; icon?: string }[];
    active: string;
    onSelect: (id: string) => void;
    accentColor?: string;
}> = ({ tabs, active, onSelect, accentColor = 'var(--main-color)' }) => (
    <div className="flex items-center gap-0.5">
        {tabs.map(t => {
            const TabIcon = t.icon ? iconToLucide[t.icon.replace('#', '')] : null;
            return (
                <button key={t.id} onClick={() => onSelect(t.id)}
                    className={`flex flex-col items-center justify-center p-2 transition-all active:scale-90 group/pill select-none
                        ${active === t.id ? 'text-(--text-color)' : 'text-(--text-color)/30 hover:text-(--text-color)'}`}
                    style={active === t.id ? { color: accentColor } : {}}>
                    {TabIcon && <TabIcon size={28} strokeWidth={1.5} />}
                </button>
            );
        })}
    </div>
);

const StudioAction: React.FC<{
    icon: any;
    label: string;
    onClick: () => void;
    active?: boolean;
    title?: string;
    color?: string;
    disabled?: boolean;
    className?: string;
}> = ({ icon: Icon, label, onClick, active, title, color = 'var(--main-color)', disabled, className = "" }) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex flex-col items-center justify-center h-16 px-4 rounded-2xl transition-all active:scale-90 group/studio select-none disabled:opacity-30 disabled:pointer-events-none ${className}
            ${active ? 'bg-white/5 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/2'}`}
    >
        <Icon size={24} strokeWidth={2} className="group-hover/studio:scale-110 transition-transform mb-1" style={{ color: active ? color : undefined }} />
        <span className="text-[8px] font-black uppercase tracking-widest leading-none">{label}</span>
    </button>
);

const DeployableSearch: React.FC<{
    value: string;
    onChange: (v: string) => void;
    isOpen: boolean;
    setIsOpen: (o: boolean) => void;
    placeholder?: string;
    accentColor?: string;
}> = ({ value, onChange, isOpen, setIsOpen, placeholder = "SEARCH...", accentColor = "var(--main-color)" }) => (
    <div className={`relative flex items-center transition-all duration-500 ease-out ${isOpen ? 'flex-1 max-w-xl' : 'w-auto'}`}>
        {!isOpen ? (
            <button onClick={() => setIsOpen(true)} className="p-4 text-(--text-color)/40 hover:text-(--text-color) hover:scale-110 transition-all">
                <Search size={32} strokeWidth={2} />
            </button>
        ) : (
            <div className="flex-1 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                <Search size={24} strokeWidth={2.5} style={{ color: accentColor }} className="shrink-0 opacity-80" />
                <input
                    autoFocus
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={() => { if (!value) setIsOpen(false); }}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-none text-[15px] font-black text-(--text-color) outline-none placeholder-(--text-color)/15 uppercase tracking-[0.25em] py-4"
                />
                {value && (
                    <button onClick={() => onChange('')} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-colors">
                        <X size={24} strokeWidth={2.5} />
                    </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-all hover:scale-125">
                    <X size={20} strokeWidth={3} />
                </button>
            </div>
        )}
    </div>
);




const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
    const BadgeIcon = iconToLucide[icon] || Store;
    return (
        <div className="hidden sm:flex items-center gap-4 pr-6 border-r border-white/5 shrink-0 truncate">
            <BadgeIcon size={28} strokeWidth={2} style={{ color }} />
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
        <div className="hidden lg:flex items-center gap-6 text-[12px] font-mono text-(--text-color)/40">
            <span className="flex items-center gap-2"><span className="text-(--text-color)/70 font-black text-sm">{loaded.length}</span> crates</span>
            <div className="flex items-center gap-2.5">
                <div className="w-24 h-2 bg-(--text-color)/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}% wt</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-(--text-color)/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#6BCEBB] rounded-full transition-all" style={{ width: `${volPct}%` }} />
                </div>
                <span>{volPct}% vol</span>
            </div>
        </div>
    );
};


const InventoryStats: React.FC = () => {
    const typesCount = useAtomValue(filteredInventoryCountAtom);
    const totalQty = useAtomValue(filteredInventoryTotalQtyAtom);
    const totalValue = useAtomValue(filteredInventoryTotalValueAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);

    const lbl = "text-[9px] font-black uppercase tracking-[0.2em] opacity-30 leading-none mb-1";
    const val = "text-[15px] font-black leading-none tracking-tighter";

    return (
        <div className="flex items-center gap-5 px-5 border-l border-white/5 animate-in fade-in slide-in-from-right-4 duration-500 shrink-0">
            <div className="flex flex-col">
                <span className={lbl}>Types</span>
                <span className={`${val} text-white/80`}>{typesCount.toLocaleString()}</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex flex-col">
                <span className={lbl}>Count</span>
                <span className={`${val} text-[#6BCEBB]`}>{totalQty.toLocaleString()}</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex flex-col min-w-[60px]">
                <span className={lbl}>Rate</span>
                <span className={`${val} text-white/50 font-mono`}>
                    {exchangeRate ? exchangeRate.toFixed(2) : '0.00'}
                </span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex flex-col min-w-[80px]">
                <span className={lbl}>Total {showFinancials ? 'MXN' : ''}</span>
                <span className={`${val} text-(--main-color)`}>
                    {showFinancials ? `$${totalValue.toLocaleString()}` : '***'}
                </span>
            </div>
        </div>
    );
};


const InventoryBar: React.FC = () => {
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : v === 'grid' ? 'gallery' : 'list');
    const ViewIcon = viewMode === 'list' ? LayoutList : viewMode === 'grid' ? LayoutGrid : Layout;
    const viewLabel = viewMode === 'list' ? 'LIST' : viewMode === 'grid' ? 'GRID' : 'GALLERY';

    return (
        <div className="flex items-center gap-2 w-full min-w-max">
            <div className={`flex items-center gap-1 shrink-0 ${isSearchOpen ? '' : 'sm:gap-2'}`}>
                <DeployableSearch 
                    value={search} 
                    onChange={setSearch} 
                    isOpen={isSearchOpen} 
                    setIsOpen={setIsSearchOpen} 
                    accentColor="var(--color-inventory)"
                    placeholder="EM+GREEN+CYL  SU+WHITE..."
                />

                {!isSearchOpen && (
                    <div className="flex items-center gap-0.5 shrink-0 animate-in fade-in duration-300">
                        <StudioAction 
                            icon={ViewIcon}
                            label={viewLabel}
                            active={true}
                            onClick={cycleView}
                            color="var(--color-inventory)"
                        />
                    </div>
                )}
            </div>
            
            {!isSearchOpen && (
                <>
                    <div className="flex-1 min-w-[20px]" />
                    <InventoryStats />
                    <div className="flex items-center gap-2 pr-6">
                        <div className="w-px h-8 bg-white/10 mx-2" />
                        <button 
                            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                            className={`flex items-center justify-center w-12 h-12 transition-all cursor-pointer rounded-2xl ${isFiltersOpen ? 'bg-(--color-inventory) text-black shadow-[0_0_20px_rgba(var(--color-inventory-rgb),0.3)]' : 'bg-white/5 text-white/20 hover:text-white hover:bg-white/10'}`}
                            title="Filters"
                        >
                            <Filter size={24} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};


const StoreBar: React.FC = () => {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const vendorOptions = useAtomValue(storeVendorOptionsAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    return (
        <div className={`flex flex-1 items-center gap-1 shrink-0 min-w-max ${isSearchOpen ? '' : 'sm:gap-2'}`}>
            <DeployableSearch 
                value={search} 
                onChange={setSearch} 
                isOpen={isSearchOpen} 
                setIsOpen={setIsSearchOpen} 
                accentColor="var(--color-store)"
                placeholder="FIND ON STORE..."
            />

            {!isSearchOpen && (
                <>
                    <div className="flex items-center gap-1.5 py-1 pr-2 border-r border-white/5 mr-1 shrink-0">
                        {vendorOptions.map(v => {
                            const vColor = vendors[v as keyof typeof vendors]?.color || 'var(--text-color)';
                            const isActive = vendorFilter === v;
                            return (
                                <button
                                    key={v}
                                    onClick={() => setVendorFilter(v)}
                                    className={`shrink-0 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.2em] transition-all border
                                        ${isActive 
                                            ? 'text-black shadow-lg' 
                                            : 'bg-white/3 border-white/3 text-(--text-color)/30 hover:text-(--text-color) hover:bg-white/10'}`}
                                    style={{ 
                                        borderColor: isActive ? vColor : (v !== 'All' ? `${vColor}40` : ''),
                                        backgroundColor: isActive ? vColor : '',
                                        color: isActive ? 'black' : (v !== 'All' ? vColor : '')
                                    }}
                                >
                                    {v}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-0.5 px-2">
                        <StudioAction 
                            icon={viewMode === 'grid' ? LayoutGrid : viewMode === 'gallery' ? Layout : LayoutList}
                            label={viewMode.toUpperCase()}
                            active={true}
                            onClick={() => {
                                const modes: ('grid' | 'gallery' | 'list')[] = ['grid', 'gallery', 'list'];
                                const nextIdx = (modes.indexOf(viewMode) + 1) % modes.length;
                                setViewMode(modes[nextIdx]);
                            }}
                            color="var(--color-store)"
                        />
                    </div>
                </>
            )}
        </div>
    );
};

const FinanceBar: React.FC = () => {
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const [search, setSearch] = useAtom(financeSearchTermAtom);
    const [filterMode, setFilterMode] = useAtom(paymentFilterBarModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
    const toggleCurrency = () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN');

    const modeLabel: Record<string, string> = { extended: 'FULL', minimal: 'MIN', collapsed: 'OFF' };

    return (
        <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
            <DeployableSearch 
                value={search} 
                onChange={setSearch} 
                isOpen={isSearchOpen} 
                setIsOpen={setIsSearchOpen} 
                accentColor="var(--color-finance)"
                placeholder="FIND PAYMENTS..."
            />

            {!isSearchOpen && (
                <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
                    <StudioAction 
                        icon={DollarSign}
                        label={currencyMode}
                        active={true}
                        onClick={toggleCurrency}
                        color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
                    />

                    <div className="w-px h-5 bg-(--text-color)/5 mx-1" />

                    <StudioAction 
                        icon={Filter}
                        label="FILTER"
                        active={filterMode !== 'off'}
                        onClick={() => setFilterMode(filterMode === 'off' ? 'left' : 'off')}
                        color="var(--color-finance)"
                    />

                    <div className="w-px h-5 bg-(--text-color)/5 mx-1" />

                    <StudioAction 
                        icon={LayoutList}
                        label={modeLabel[overviewMode]}
                        active={overviewMode !== 'collapsed'}
                        onClick={() => {
                            const next: Record<string, 'extended' | 'minimal' | 'collapsed'> = {
                                'extended': 'minimal', 'minimal': 'collapsed', 'collapsed': 'extended'
                            };
                            setOverviewMode((next[overviewMode] || 'extended') as any);
                        }}
                        color="var(--color-finance)"
                    />
                </div>
            )}
        </div>
    );
};


const LogisticsBar: React.FC = () => {
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isPackingFiltersOpen, setIsPackingFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
    const setTruckReady = useSetAtom(truckReadyTriggerAtom);
    const truckBusy = useAtomValue(truckIsBusyAtom);
    const [truckView, setTruckView] = useAtom(truckViewModeAtom);
    const [showPanels, setShowPanels] = useAtom(truckShowPanelsAtom);
    const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
    const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
    const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
    const setShowReadyWizard = useSetAtom(truckShowReadyWizardAtom);

    const tabs = [
        { id: 'crates', label: 'CRATES', icon: 'package' },
        { id: 'packing', label: 'PACK', icon: 'download' },
        { id: 'shipping', label: 'TRK', icon: 'truck' },
    ];

    return (
        <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
            <DeployableSearch 
                value={search} 
                onChange={setSearch} 
                isOpen={isSearchOpen} 
                setIsOpen={setIsSearchOpen} 
                accentColor="var(--color-logistics)"
                placeholder="FIND CRATES..."
            />

            {!isSearchOpen && (
                <div className="flex items-center gap-4 animate-in fade-in duration-300">
                    <SubTabPills
                        tabs={tabs}
                        active={subTab}
                        onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
                        accentColor="var(--color-logistics)"
                    />

                    {subTab === 'packing' && (
                        <>
                            <div className="w-px h-6 bg-white/5 mx-1" />
                            <button 
                                onClick={() => setIsPackingFiltersOpen(!isPackingFiltersOpen)}
                                className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isPackingFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
                                title="Configuration"
                            >
                                <ListFilter size={28} />
                            </button>
                        </>
                    )}

                    {subTab === 'shipping' && (
                        <>
                            <div className="w-px h-6 bg-white/5 mx-1" />
                            {/* Visibility toggle */}
                            <button
                                onClick={() => setShowPanels(s => !s)}
                                title={showPanels ? 'Hide all panels' : 'Show all panels'}
                                className="text-white/40 hover:text-white transition-colors cursor-pointer"
                            >
                                {showPanels ? <PanelTopClose size={16} /> : <PanelTop size={16} />}
                            </button>
                            {/* Drafts */}
                            <button
                                onClick={() => setShowOpenDraft(true)}
                                title="Open saved drafts"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/25 transition-all cursor-pointer"
                                style={{ background: 'rgba(255,255,255,0.04)' }}
                            >
                                <FolderOpen size={13} />Drafts
                            </button>
                            {/* Save Draft */}
                            <button
                                onClick={() => setShowSaveDraft(true)}
                                title="Save current load as draft"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/25 transition-all cursor-pointer"
                                style={{ background: 'rgba(255,255,255,0.04)' }}
                            >
                                <Save size={13} />Save
                            </button>
                            {/* Exportation */}
                            <button
                                onClick={() => setShowExportModal(true)}
                                title="Export consolidated manifesto and packed crates"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/25 transition-all cursor-pointer"
                                style={{ background: 'rgba(255,255,255,0.04)' }}
                            >
                                <Download size={13} />Exportation
                            </button>
                            {/* Ready Truck */}
                            <button
                                onClick={() => setShowReadyWizard(true)}
                                disabled={truckBusy}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-40"
                                style={{ background: 'var(--main-color)', color: '#000' }}
                                title="Ready Truck — sync manifest + export PDF &amp; CSV"
                            >
                                {truckBusy
                                    ? <span className="w-3 h-3 border border-black/40 border-t-transparent rounded-full animate-spin" />
                                    : <Truck size={13} />}
                                <span>Ready Truck</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const PackingBar: React.FC = () => {
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    
    // Packing specific state
    const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
    const [isPrintOpen, setIsPrintOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
    const setExportPDF = useSetAtom(packingExportPDFTriggerAtom);
    const setExportXLSX = useSetAtom(packingExportXLSXTriggerAtom);
    const setExportJSON = useSetAtom(packingExportJSONTriggerAtom);
    const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);

    const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : 'list');
    const ViewIcon = viewMode === 'list' ? LayoutList : LayoutGrid;

    return (
        <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
            {selectedIds.size > 0 ? (
                <div className="flex items-center gap-6 animate-in slide-in-from-left duration-500 pr-4 border-r border-white/5 mr-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-(--main-color) whitespace-nowrap">
                            {selectedIds.size} ARTIFACTS SELECTED
                        </span>
                        <button 
                            onClick={() => setSelectedIds(new Set())} 
                            className="text-[9px] font-bold underline uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity text-left"
                        >
                            Clear Selection
                        </button>
                    </div>
                </div>
            ) : (
                <DeployableSearch 
                    value={search} 
                    onChange={setSearch} 
                    isOpen={isSearchOpen} 
                    setIsOpen={setIsSearchOpen} 
                    accentColor="var(--main-color)"
                    placeholder="FIND INVENTORY..."
                />
            )}

            {!isSearchOpen && (
                <>
                        {/* Export Actions */}


                        {/* View & Config Actions */}
                        <div className="flex items-center gap-0.5">
                            <StudioAction 
                                icon={ViewIcon}
                                label={viewMode.toUpperCase()}
                                active={true}
                                onClick={cycleView}
                                title="Toggle View Mode"
                            />
                                <button 
                                    onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                                    className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
                                    title="Configuration"
                                >
                                    <ListFilter size={28} />
                                </button>
                            </div>
                    </>
                )}
            </div>
    );
};

const ProcessBar: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);
    
    return (
        <div className="flex items-center gap-6 px-4 animate-in fade-in duration-500">
            <button 
                onClick={() => setActiveTab('workspace')}
                className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
                    ${activeTab === 'workspace' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
                title="Engine Workspace"
            >
                <Target size={24} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
                {activeTab === 'workspace' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <button 
                onClick={() => setActiveTab('vault')}
                className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
                    ${activeTab === 'vault' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
                title="Inventory Vault"
            >
                <Library size={24} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
                {activeTab === 'vault' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <button 
                onClick={() => setActiveTab('batch')}
                className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
                    ${activeTab === 'batch' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
                title="Batch Telemetry"
            >
                <FolderKanban size={24} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
                {activeTab === 'batch' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
            </button>
        </div>
    );
};

const UploadBar: React.FC = () => {
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const activeWb = itemData.workbook || 'v326';

    return (
        <div className="flex items-center gap-3">
            <ModuleBadge icon="upload" label="Add Entry" color="var(--color-upload)" />

            <div className="flex items-center border-l border-white/5 pl-5 ml-2 gap-5">
                <div className="flex flex-col items-start select-none">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] leading-none mb-2 opacity-30">WORKBOOK TAG</span>
                    <div className="flex gap-1.5">
                        {['v326', 'v825'].map(wb => (
                            <button
                                key={wb}
                                type="button"
                                onClick={() => setItemData(prev => ({ ...prev, workbook: wb }))}
                                className={`text-[11px] font-black font-mono leading-none tracking-tighter transition-all px-3 py-1.5 rounded-lg border ${activeWb === wb 
                                    ? 'bg-white/10 text-white border-white/20 shadow-[0_5px_15px_rgba(255,255,255,0.05)]' 
                                    : 'text-white/20 border-transparent hover:text-white/50 hover:bg-white/5'}`}
                            >
                                {wb.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ControlBar: React.FC = () => (
    <>
        <ModuleBadge icon="shield" label="Control" color="var(--color-control)" />
        <div className="ml-auto">
            <span className="text-[11px] font-black text-(--text-color)/15 uppercase tracking-widest">Developer Only</span>
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
    const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
    const bagCount = useAtomValue(storeShoppingBagAtom).length;
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);

    const inventory = useAtomValue(inventoryAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const logisticsDocs = useAtomValue(logisticsDataAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRateValue = useAtomValue(liveExchangeRateAtom);
    const [isExporting, setIsExporting] = useState(false);
    const logout = useLogout();
    const user = useAtomValue(userAtom);

    // Statuses that are store/catalog items — excluded from the export
    const EXCLUDED_STATUSES = new Set(['available', 'avaiable', 'catalog', 'store']);

    const handleMasterExportXLSX = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Onyx.mx Studio';
            workbook.lastModifiedBy = 'Onyx.mx Studio';
            workbook.created = new Date();

            const partialPayIds = new Set<string>();
            const fullPayIds = new Set<string>();
            const requestedAcqIds = new Set<string>();
            const paymentDateMap = new Map<string, string>();

            const paidMap = new Map<string, number>();
            const requestedMap = new Map<string, number>();

            financeDocs.forEach(d => {
                const rel = d.related_ids || d.related_inventory_ids || '';
                let ids: string[] = [];
                if (Array.isArray(rel)) ids = rel.map((id: any) => String(id));
                else if (typeof rel === 'string') ids = rel.split(',').map(s => s.trim()).filter(Boolean);
                
                const amount = Number(d.amount || 0);
                if (amount <= 0) return;

                if (d.status === 'Paid') {
                    ids.forEach(id => paidMap.set(id, (paidMap.get(id) || 0) + amount));
                    const pDate = d.date || d.pay_date || d.created_at;
                    if (pDate) ids.forEach(id => paymentDateMap.set(id, pDate));
                } else if (d.status === 'Requested') {
                    ids.forEach(id => requestedMap.set(id, (requestedMap.get(id) || 0) + amount));
                }
            });

            inventory.forEach(item => {
                const id = String(item.data.id || item.row);
                const norm = normalizeInventoryData(item.data);
                const price = parseFloat(String(norm.price || 0));
                const qty = parseInt(String(norm.quantity || 1));
                const totalCost = price * qty;
                const totalPaid = paidMap.get(id) || 0;
                const totalRequested = requestedMap.get(id) || 0;
                
                const payReqStr = String(norm.payReq || '').toLowerCase();
                const statusStr = String(norm.status || '').toLowerCase();
                const workbook = String(norm.workbook || '').toLowerCase();

                // 0. Book 825 or Prepaid Override
                if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid' || payReqStr === 'paid') {
                    fullPayIds.add(id);
                } else if (totalCost > 0 && totalPaid >= totalCost) {
                    fullPayIds.add(id);
                } else if (totalPaid > 0 || totalRequested > 0 || payReqStr === 'requested' || payReqStr === 'true' || payReqStr.includes('%')) {
                    // Distinguish between Requested Acquisition and Partial/Advance
                    if (statusStr === 'acquisition' && totalPaid === 0 && (totalRequested > 0 || payReqStr === 'requested')) {
                        requestedAcqIds.add(id);
                    } else {
                        partialPayIds.add(id);
                    }
                }
            });

            // CRITICAL: Expand payment sets with alternate keys (tag_id, book_barcode, itemId)
            // so that TRK manifest items (keyed by tag_id) can be matched
            inventory.forEach(item => {
                const id = String(item.data.id || item.row);
                const norm = normalizeInventoryData(item.data);
                let targetSet: Set<string> | null = null;
                if (fullPayIds.has(id)) targetSet = fullPayIds;
                else if (partialPayIds.has(id)) targetSet = partialPayIds;
                else if (requestedAcqIds.has(id)) targetSet = requestedAcqIds;
                
                if (targetSet) {
                    // Add all known identifiers so manifest items can match
                    [String(item.row), norm.itemId, norm.tag_id, norm.book_barcode, norm.item_id,
                     item.data?.itemId, item.data?.tag_id, item.data?.book_barcode, item.data?.item_id
                    ].forEach(k => {
                        if (k && k !== '-' && k !== '' && k !== 'undefined' && k !== 'null') {
                            targetSet!.add(String(k));
                            targetSet!.add(String(k).toUpperCase());
                        }
                    });
                }
            });

            const internetRate = liveExchangeRateValue || exchangeRate;
            const bookRate = exchangeRate || 20;

            // 1. DATA PREPARATION (Fetch shipments and full registry early for filtering)
            let crateToTruck = new Map<string, string>();
            let shipments: any[] = [];
            let allInventory: any[] = [];
            let allProduction: any[] = [];

            try {
                // Helper to fetch all records using pagination
                const fetchAll = async (table: string) => {
                    let all: any[] = [];
                    let page = 0;
                    const pageSize = 1000;
                    while (true) {
                        const { data, error } = await supabase.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
                        if (error || !data || data.length === 0) break;
                        all = [...all, ...data];
                        if (data.length < pageSize) break;
                        page++;
                    }
                    return all;
                };

                const [invResData, prodResData, shipRes] = await Promise.all([
                    fetchAll('inventory'),
                    fetchAll('production'),
                    supabase.from('shipments').select('*').order('timestamp', { ascending: true })
                ]);

                allInventory = invResData || [];
                allProduction = prodResData || [];

                if (shipRes.error) console.warn('[Export] Shipments fetch error:', shipRes.error);
                else if (shipRes.data) shipments = shipRes.data;
                
                // Build current active crate map for status validation
                const activeCrates = new Map<string, any>();
                (logisticsDocs || []).forEach(d => activeCrates.set(String(d.id), d));

                shipments.forEach(s => {
                    try {
                        const p = typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload;
                        const date = new Date(s.timestamp || s.updated_at || Date.now());
                        const dateStr = !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : 'N/A';
                        const trkName = s.manifest_id || `TRK-${dateStr}`;

                        if (p && p.crates) {
                            p.crates.forEach((c: any) => {
                                const cid = String(c.id);
                                if (!cid) return;

                                // VALIDATION: Only map if the crate is actually on a truck OR not in the warehouse anymore
                                // If it exists in active docs but its status is NOT deployed/shipped, ignore this old shipment mapping
                                const activeCrate = activeCrates.get(cid);
                                if (activeCrate) {
                                    const aStatus = (activeCrate.status || '').toLowerCase();
                                    if (aStatus !== 'deployed' && aStatus !== 'shipped' && aStatus !== 'in transit') {
                                        return; // This crate was cleared and is now being reused (e.g. for Production)
                                    }
                                }
                                
                                crateToTruck.set(cid, trkName);
                            });
                        }
                    } catch (e) { console.warn('[Export] Payload parse error:', e); }
                });
            } catch (err) {
                console.error('[Export] Critical pre-fetch failure:', err);
            }

            const exportItems = inventory.filter(item => {
                const status = (item.data.status || '').toLowerCase().trim();
                return !EXCLUDED_STATUSES.has(status);
            });

            const vendorGroups: Record<string, any[]> = {};
            exportItems.forEach(item => {
                const d = item.data as any;
                // Proactively extract vendor from tag prefixes if direct field is missing
                // Priority: explicit vendor_id > item.label > d.itemId > d.item_id > d.tag_id
                const rawId = d.vendor_id || d.vendorId || item.label || d.itemId || d.item_id || d.tag_id || '';
                const prefixId = (typeof rawId === 'string' && rawId.length >= 2) ? rawId.substring(0, 2).toUpperCase() : '';
                
                let vid = prefixId || 'Unknown';
                if (!vendorGroups[vid]) vendorGroups[vid] = [];
                vendorGroups[vid].push(item);
            });

            // 1. SUMMARY SHEET DASHBOARD
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.columns = [
                { header: 'VENDOR / SECTION', key: 'vendor', width: 30 },
                { header: 'INV ITEMS (ACQ/PROD)', key: 'items', width: 22 },
                { header: 'TOTAL SPEND (MXN)', key: 'total_mxn', width: 22, style: { numFmt: '#,##0' } },
                { header: 'SPEND (USD - Inet Rate)', key: 'total_usd', width: 25, style: { numFmt: '#,##0' } },
                { header: 'PAID (MXN)', key: 'paid_mxn', width: 18, style: { numFmt: '#,##0' } },
                { header: 'PENDING (MXN)', key: 'pending_mxn', width: 18, style: { numFmt: '#,##0' } }
            ];

            // Apply Header Styling
            summarySheet.getRow(1).eachCell(cell => {
                cell.font = EXCEL_STYLES.fonts.header;
                cell.fill = EXCEL_STYLES.fills.header;
                cell.alignment = { horizontal: 'center' };
            });

            const totalAll = financeDocs.reduce((s, d) => s + (d.amount ?? 0) + (d.commission ?? 0), 0);
            const totalPaid = financeDocs.filter(d => d.status === 'Paid').reduce((s, d) => s + (d.amount ?? 0) + (d.commission ?? 0), 0);
            const totalPend = totalAll - totalPaid;
            
            summarySheet.addRow({ vendor: '── OVERVIEW ──' });
            summarySheet.addRow({ 
                vendor: 'Grand Total', 
                items: exportItems.filter(i => ['acquisition', 'production'].includes((i.data.status || '').toLowerCase())).length,
                total_mxn: totalAll, 
                total_usd: totalAll / internetRate,
                paid_mxn: totalPaid, 
                pending_mxn: totalPend
            });
            summarySheet.addRow({ vendor: 'Internet Exchange Rate', total_usd: internetRate });
            summarySheet.addRow({ vendor: 'Book Exchange Rate', total_usd: bookRate });
            summarySheet.addRow({}); // Spacer

            // Aggregate by Vendor
            const vendorRollup: Record<string, { total: number, paid: number, items: number }> = {};
            
            // From Finance
            financeDocs.forEach(d => {
                const v = d.vendor_id || 'Other';
                if (!vendorRollup[v]) vendorRollup[v] = { total: 0, paid: 0, items: 0 };
                const amt = (d.amount || 0) + (d.commission || 0);
                vendorRollup[v].total += amt;
                if (d.status === 'Paid') vendorRollup[v].paid += amt;
            });
            
            // From Inventory (only acquisition/production)
            exportItems.forEach(item => {
                const status = (item.data.status || '').toLowerCase();
                if (status === 'acquisition' || status === 'production') {
                    const d = item.data as any;
                    const rawId = d.vendor_id || d.vendorId || item.label || d.itemId || d.item_id || d.tag_id || '';
                    const prefixId = (typeof rawId === 'string' && rawId.length >= 2) ? rawId.substring(0, 2).toUpperCase() : '';
                    let vid = prefixId || 'Unknown';
                    if (!vendorRollup[vid]) vendorRollup[vid] = { total: 0, paid: 0, items: 0 };
                    vendorRollup[vid].items += 1;
                }
            });

            summarySheet.addRow({ vendor: '── BY VENDOR (Sorted by Count) ──' });
            Object.entries(vendorRollup)
                .filter(([vid]) => {
                    const vUpper = vid.toUpperCase();
                    return vUpper !== 'OTHER' && vUpper !== 'CRATE' && vUpper !== 'CRATES';
                })
                .sort((a, b) => b[1].items - a[1].items)
                .forEach(([vid, v]) => {
                const vColor = getVendorColor(vid);
                const contrastColor = getContrastColor(vColor);
                
                const row = summarySheet.addRow({
                    vendor: (vendors as any)[vid]?.name || vid,
                    items: v.items,
                    total_mxn: v.total,
                    total_usd: v.total / internetRate,
                    paid_mxn: v.paid,
                    pending_mxn: v.total - v.paid
                });
                row.getCell('vendor').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColor } };
                row.getCell('vendor').font = { bold: true, color: { argb: contrastColor } };
            });
            summarySheet.addRow({});

            const catMap: Record<string, { total: number; paid: number }> = {};
            financeDocs.forEach(d => {
                const cat = d.subcategory || d.category || 'Other';
                if (!catMap[cat]) catMap[cat] = { total: 0, paid: 0 };
                const amt = (d.amount || 0) + (d.commission || 0);
                catMap[cat].total += amt;
                if (d.status === 'Paid') catMap[cat].paid += amt;
            });

            summarySheet.addRow({ vendor: '── BY CATEGORY ──' });
            Object.entries(catMap).sort((a,b) => b[1].total - a[1].total).forEach(([cat, v]) => {
                const row = summarySheet.addRow({
                    vendor: cat, 
                    total_mxn: v.total, 
                    total_usd: v.total / internetRate,
                    paid_mxn: v.paid, 
                    pending_mxn: v.total - v.paid
                });
                row.getCell('vendor').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: getCategoryColor(cat) } };
                row.getCell('vendor').font = { bold: true, color: { argb: 'FFFFFFFF' } };
            });
            summarySheet.addRow({});

            const destMap: Record<string, { total: number; paid: number }> = {};
            financeDocs.forEach(d => {
                const destId = d.destination;
                const destName = destinationsConfig[destId as keyof typeof destinationsConfig]?.name || destId || 'Other';
                if (!destMap[destName]) destMap[destName] = { total: 0, paid: 0 };
                const amt = (d.amount || 0) + (d.commission || 0);
                destMap[destName].total += amt;
                if (d.status === 'Paid') destMap[destName].paid += amt;
            });

            summarySheet.addRow({ vendor: '── BY DESTINATION ──' });
            Object.entries(destMap).sort((a,b) => b[1].total - a[1].total).forEach(([dest, v]) => {
                summarySheet.addRow({
                    vendor: dest,
                    total_mxn: v.total,
                    total_usd: v.total / internetRate,
                    paid_mxn: v.paid,
                    pending_mxn: v.total - v.paid
                });
            });
            summarySheet.addRow({});

            // 2. FINANCE LEDGER SHEET
            const ledgerSheet = workbook.addWorksheet('Finance Ledger');
            const ledgerCols = [
                { header: 'DATE', key: 'date', width: 12 },
                { header: 'DESCRIPTION', key: 'description', width: 35 },
                { header: 'CATEGORY', key: 'category', width: 15 },
                { header: 'VENDOR', key: 'vendor', width: 10 },
                { header: 'DESTINATION', key: 'destination', width: 18 },
                { header: 'AMOUNT (MXN)', key: 'amount', width: 15, style: { numFmt: '#,##0' } },
                { header: 'FEES (MXN)', key: 'commission', width: 15, style: { numFmt: '#,##0' } },
                { header: 'TOTAL (MXN)', key: 'total', width: 15, style: { numFmt: '#,##0' } },
                { header: 'STATUS', key: 'status', width: 12 },
                { header: 'PAY DATE', key: 'pay_date', width: 12 },
                { header: 'REFERENCE', key: 'reference', width: 20 }
            ];
            ledgerSheet.columns = ledgerCols;

            ledgerSheet.getRow(1).eachCell(cell => {
                cell.font = EXCEL_STYLES.fonts.header;
                cell.fill = EXCEL_STYLES.fills.header;
            });

            financeDocs.forEach((r, idx) => {
                const row = ledgerSheet.addRow({
                    date: r.date ? new Date(r.date).toLocaleDateString() : '',
                    description: r.description || '',
                    category: r.subcategory || r.category || '',
                    vendor: r.vendor_id || '',
                    destination: destinationsConfig[r.destination as keyof typeof destinationsConfig]?.name || r.destination || '',
                    amount: r.amount ?? 0,
                    commission: r.commission ?? 0,
                    total: (r.amount ?? 0) + (r.commission ?? 0),
                    status: r.status || 'Requested',
                    pay_date: r.pay_date ? new Date(r.pay_date).toLocaleDateString() : '',
                    reference: r.reference || ''
                });

                // Styling Ledger row
                const statusColor = getStatusColor(r.status || 'Requested');
                row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor } };
                row.getCell('status').font = { bold: true, color: { argb: 'FFFFFFFF' } };
                
                const vCode = r.vendor_id || '';
                if (vCode) {
                    const vColor = getVendorColor(vCode);
                    const contrast = getContrastColor(vColor);
                    row.getCell('vendor').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColor } };
                    row.getCell('vendor').font = { bold: true, color: { argb: contrast } };
                }
                
                const catColor = getCategoryColor(r.subcategory || r.category || '');
                row.getCell('category').font = { color: { argb: catColor }, bold: true };

                if (idx % 2 === 0) row.eachCell(c => { if (!c.fill?.type) c.fill = EXCEL_STYLES.fills.zebra; });
            });

            // 3. CRATES & PALLETS DATABASE SHEET
            const getCrateBarcodes = (crateId: string, visited = new Set<string>()): string[] => {
                if (visited.size > 50 || visited.has(crateId)) return []; // Safety depth limit
                visited.add(crateId);
                
                const crate = (logisticsDocs || []).find(d => d.id === crateId);
                if (!crate) return [];
                
                let barcodes: string[] = [];
                if (crate.inventory_ids) {
                    const entries = crate.inventory_ids.split(',').filter(Boolean);
                    entries.forEach((entry: string) => {
                        const [id] = entry.split(':');
                        const inv = (inventory || []).find(i => String(i.row) === id);
                        if (inv) {
                            try {
                                const norm = normalizeInventoryData(inv.data);
                                const calc = calculateCodesAndPrices(norm, liveExchangeRateValue || exchangeRate || 18, '326');
                                const tag = calc.bookBarcode || norm.book_barcode || norm.itemId || String(inv.row);
                                if (tag) barcodes.push(tag);
                            } catch (e) { console.warn('Item barcode calculation failed:', e); }
                        }
                    });
                }
                
                const children = (logisticsDocs || []).filter(d => d.parent_id === crateId);
                children.forEach(child => {
                    barcodes = [...barcodes, ...getCrateBarcodes(child.id, visited)];
                });
                return barcodes;
            };

            const cratesSheet = workbook.addWorksheet('Crates & Pallets');
            cratesSheet.columns = [
                { header: 'ID', key: 'id', width: 22 },
                { header: 'TYPE', key: 'type', width: 14 },
                { header: 'DIMENSIONS (WxLxH)', key: 'dims', width: 28 },
                { header: 'WEIGHT (KG)', key: 'weight', width: 15, style: { numFmt: '#,##0.00' } },
                { header: 'SUPPLIER', key: 'supplier', width: 18 },
                { header: 'PRICE (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
                { header: 'CONTENTS SUMMARY', key: 'contents', width: 60 },
                { header: 'TRK', key: 'trk', width: 18 },
                { header: 'STATUS', key: 'status', width: 15 }
            ];

            cratesSheet.getRow(1).eachCell(cell => {
                cell.font = EXCEL_STYLES.fonts.header;
                cell.fill = EXCEL_STYLES.fills.header;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            const exportCrates = (logisticsDocs || []).filter(d => 
                ['crate', 'pallet', 'cardboard'].includes((d.type || '').toLowerCase())
            );

            const groups = [
                { label: 'EMPTY INVENTORY', status: ['Empty'] },
                { label: 'PACKED INVENTORY', status: ['Packed', 'Partial'] },
                { label: 'DEPLOYED / IN TRANSIT', status: ['Deployed', 'In Transit'] }
            ];

            groups.forEach(group => {
                const groupItems = exportCrates.filter(c => group.status.includes(c.status || 'Empty'));
                if (groupItems.length === 0) return;

                // Add group header row
                const headerRow = cratesSheet.addRow({ id: group.label });
                cratesSheet.mergeCells(headerRow.number, 1, headerRow.number, cratesSheet.columns.length);
                headerRow.eachCell(cell => {
                    cell.font = { ...EXCEL_STYLES.fonts.header, size: 11, italic: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light gray divider
                    cell.alignment = { horizontal: 'left', indent: 1 };
                });

                groupItems.forEach((c, idx) => {
                    const allBarcodes = getCrateBarcodes(c.id);
                    const barcodeSummary = allBarcodes.length > 0 ? `[${allBarcodes.join(', ')}]` : '';
                    const contents = (c.contents_summary || '') + (barcodeSummary ? (c.contents_summary ? ' | ' : '') + barcodeSummary : '');

                    const row = cratesSheet.addRow({
                        id: String(c.id || '').toUpperCase(),
                        type: (c.type || 'Crate').toUpperCase(),
                        dims: `${c.width_cm || 0} x ${c.length_cm || 0} x ${c.height_cm || 0} CM`,
                        weight: parseFloat(String(c.weight_kg || '0')) || 0,
                        supplier: (c.vendors || 'INTERNAL').toUpperCase(),
                        cost_mxn: parseFloat(String(c.cost_mxn || '0')) || 0,
                        contents,
                        trk: crateToTruck.get(c.id) || '',
                        status: (c.status || 'Empty').toUpperCase()
                    });

                    if (idx % 2 === 0) row.eachCell(cell => { if (!cell.fill?.type) cell.fill = EXCEL_STYLES.fills.zebra; });
                    row.eachCell(cell => {
                        cell.alignment = { vertical: 'middle', wrapText: true };
                    });
                });
            });

            // 4. DEPLOYED TRUCK CONSOLIDATED SHEETS
            const monthsShort = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            
            // Enhanced Inventory Map (Super-Index)
            const invMap = new Map<string, any>();
            const normalizeKey = (k: any) => String(k || '').trim().toUpperCase();
            const stripKey = (k: any) => String(k || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            
            const indexItem = (item: any) => {
                if (!item || !item.data) return;
                const d = item.data;
                const rawKeys = [
                    item.row,
                    d.id,
                    d.itemId,
                    d.item_id,
                    d.tag_id,
                    d.book_barcode,
                    d.bookBarcode,
                    d.item_number,
                    d.itemNumber,
                    d.description,
                    d.short_description,
                    d.shortDescription,
                    `${d.shape || d.type || ''} ${d.shortDescription || d.description || ''}`
                ];
                
                const finalKeys = new Set<string>();
                rawKeys.forEach(k => {
                    if (k) {
                        const nk = normalizeKey(k);
                        const sk = stripKey(k);
                        if (nk && nk !== 'UNDEFINED' && nk !== 'NULL') finalKeys.add(nk);
                        if (sk && sk !== 'UNDEFINED' && sk !== 'NULL') finalKeys.add(sk);
                    }
                });

                finalKeys.forEach(k => { 
                    const existing = invMap.get(k);
                    if (existing) {
                        existing.data = { ...existing.data, ...item.data };
                    } else {
                        invMap.set(k, { ...item }); 
                    }
                });
            };

            // DIRECT ROW MAP from inventory atom (same data source as working vendor sheets)
            const rowMap = new Map<string, any>();
            (inventory || []).forEach(item => {
                if (item && item.row != null) {
                    rowMap.set(String(item.row), item);
                    // Also index by all known IDs
                    const d = item.data || {};
                    [d.itemId, d.item_id, d.tag_id, d.book_barcode, d.bookBarcode].forEach(k => {
                        if (k && k !== '-' && k !== '') rowMap.set(String(k).toUpperCase(), item);
                    });
                }
            });

            // 1. Index from local atom (low priority fallback)
            (inventory || []).forEach(indexItem);
            (allProduction || []).forEach(indexItem);

            // 2. Index from Supabase Inventory (Acquisitions) - High Priority
            allInventory.forEach(dbItem => {
                const itemObj = { 
                    row: dbItem.id, 
                    data: {
                        ...dbItem,
                        id: dbItem.id,
                        itemId: dbItem.item_id || dbItem.item_number,
                        price: dbItem.price_mxn || dbItem.acquisition_price_mxn || dbItem.price,
                        acquisition_price_mxn: dbItem.acquisition_price_mxn || dbItem.price_mxn || dbItem.price,
                        weightKg: dbItem.weight_kg,
                        widthCm: dbItem.width_cm,
                        heightCm: dbItem.height_cm,
                        lengthCm: dbItem.length_cm,
                        bookBarcode: dbItem.book_barcode,
                        bookAqCode: dbItem.book_aq_code,
                        bookLanded: dbItem.book_landed,
                        bookRetail: dbItem.book_retail,
                        payDate: dbItem.pay_date
                    } 
                };
                indexItem(itemObj);
            });

            // 3. Index from Supabase Production (Work in Progress) - High Priority
            (allProduction || []).forEach(pItem => {
                const itemObj = {
                    row: pItem.id,
                    data: {
                        ...pItem,
                        id: pItem.id,
                        itemId: pItem.tag_id,
                        item_id: pItem.tag_id,
                        tag_id: pItem.tag_id,
                        price: pItem.price_unit,
                        acquisition_price_mxn: pItem.price_unit,
                        description: pItem.description,
                        quantity: pItem.quantity,
                        status: pItem.status
                    }
                };
                indexItem(itemObj);
            });

            // 4. DEEP RECOVERY for missing shipment items
            const allShipmentItems: any[] = [];
            (shipments || []).forEach(s => {
                try {
                    const p = typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload;
                    if (p && p.crates) {
                        p.crates.forEach((c: any) => {
                            if (c.items) allShipmentItems.push(...c.items);
                        });
                    }
                } catch (e) {}
            });

            const missingIds = new Set<string>();
            allShipmentItems.forEach(item => {
                const ik = normalizeKey(item.itemId || item.item_id || item.tag_id || item.row);
                if (ik && ik !== 'UNDEFINED' && !invMap.has(ik) && !invMap.has(stripKey(ik))) {
                    missingIds.add(ik);
                }
            });

            if (missingIds.size > 0) {
                const idList = Array.from(missingIds);
                console.log(`[Export] Deep Recovery: Fetching ${idList.length} missing items...`);
                
                // Chunk into groups of 100 to avoid URL length limits
                const chunkSize = 100;
                for (let i = 0; i < idList.length; i += chunkSize) {
                    const chunk = idList.slice(i, i + chunkSize);
                    // Quote values for PostgREST syntax: "ID1","ID2"
                    const quotedList = chunk.map(id => `"${id}"`).join(',');
                    
                    try {
                        const [invBatch, prodBatch] = await Promise.all([
                            supabase.from('inventory').select('*').or(`item_id.in.(${quotedList}),book_barcode.in.(${quotedList}),tag_id.in.(${quotedList}),id.in.(${quotedList})`),
                            supabase.from('production').select('*').in('tag_id', chunk)
                        ]);

                        if (invBatch.data) {
                            invBatch.data.forEach(dbItem => {
                                indexItem({ row: dbItem.id, data: { ...dbItem, itemId: dbItem.item_id || dbItem.item_number } });
                            });
                        }
                        if (prodBatch.data) {
                            prodBatch.data.forEach(pItem => {
                                indexItem({ row: pItem.id, data: { ...pItem, itemId: pItem.tag_id, item_id: pItem.tag_id } });
                            });
                        }
                    } catch (e) { console.error('Deep recovery batch failed:', e); }
                }
            }

            for (const ship of (shipments || [])) {
                try {
                    // Only include finalized shipments with a manifest ID
                    if (!ship.manifest_id) continue;
                    
                    const p = typeof ship.payload === 'string' ? JSON.parse(ship.payload) : ship.payload;
                    if (!p || !p.crates || p.crates.length === 0) continue;

                    const date = new Date(ship.timestamp || ship.updated_at || Date.now());
                    const fallbackName = `TRK-${monthsShort[date.getMonth()]}${date.getDate()}`;
                    const sheetName = ship.manifest_id || fallbackName;
                    
                    let finalSheetName = sheetName;
                    let counter = 1;
                    while (workbook.getWorksheet(finalSheetName)) {
                        finalSheetName = `${sheetName}_${counter++}`;
                    }

                    const tSheet = workbook.addWorksheet(finalSheetName, { properties: { tabColor: { argb: 'FF10B981' } } });
                    tSheet.columns = [
                        { header: 'PAY DATE', key: 'pay_date', width: 12 },
                        { header: 'BOOK BARCODE', key: 'tag_id', width: 22 },
                        { header: 'AQ CODE', key: 'aq_code', width: 12 },
                        { header: 'LD CODE', key: 'ld_code', width: 12 },
                        { header: 'DESCRIPTION', key: 'description', width: 45 },
                        { header: 'COLOR + MATERIAL', key: 'color_material', width: 35 },
                        { header: 'SIZES (CM)', key: 'sizes_metric', width: 20 },
                        { header: 'SIZES (IN)', key: 'sizes_imperial', width: 20 },
                        { header: 'WEIGHT (KG)', key: 'weight_metric', width: 15 },
                        { header: 'WEIGHT (LB)', key: 'weight_imperial', width: 15 },
                        { header: 'QTY', key: 'quantity', width: 8 },
                        { header: 'ACQ COST $ (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'ACQ $ (USD)', key: 'acq_usd', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'TOTAL MXN', key: 'total_mxn', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'LANDED $ (MXN)', key: 'landed_mxn', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'LD $ (USD)', key: 'ld_usd', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'RETAIL $ (USD)', key: 'retail_usd', width: 18, style: { numFmt: '#,##0' } },
                        { header: 'PAY STATUS', key: 'pay_status', width: 18 }
                    ];

                    tSheet.getRow(1).eachCell(cell => {
                        cell.font = { ...EXCEL_STYLES.fonts.header, color: { argb: 'FFFFFFFF' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
                        cell.alignment = { horizontal: 'center' };
                    });

                    let rowIndex = 0;
                    p.crates.forEach((c: any) => {
                        // Skip crates that are marked as draft or empty in this payload
                        if (c.status === 'Draft' || !c.items || c.items.length === 0) return;

                        (c.items || []).forEach((pItem: any) => {
                            try {
                                rowIndex++;

                                // TRACE: Log for first 3 items to diagnose data resolution
                                if (rowIndex <= 3) {
                                    console.log(`[TRK-TRACE] Item #${rowIndex}:`, {
                                        pItemRow: pItem.row,
                                        pItemId: pItem.itemId,
                                        pItemPrice: pItem.price,
                                        pItemWidth: pItem.width_cm,
                                        rowMapSize: rowMap.size,
                                        rowMapHasRow: rowMap.has(String(pItem.row)),
                                        invMapSize: invMap.size,
                                        inventoryAtomSize: (inventory || []).length,
                                    });
                                }

                                // PRIMARY LOOKUP: Direct row map from inventory atom
                                // This is the SAME data source that vendor sheets use successfully
                                let atomItem = rowMap.get(String(pItem.row));
                                if (!atomItem) atomItem = rowMap.get(String(pItem.itemId || '').toUpperCase());
                                if (!atomItem) {
                                    // Fallback to invMap (Supabase registry)
                                    const matchKeys = [pItem.row, pItem.itemId, pItem.item_id, pItem.tag_id];
                                    for (const k of matchKeys) {
                                        if (!k) continue;
                                        const found = invMap.get(normalizeKey(k)) || invMap.get(stripKey(k));
                                        if (found) { atomItem = found; break; }
                                    }
                                }

                                // Use atom data as primary (same as vendor sheets), payload as fallback
                                const atomData = atomItem?.data || {};
                                const itemData = { ...pItem, ...atomData };
                                
                                // Ensure price uses the best available source
                                const priceChain = [
                                    atomData.price, atomData.price_mxn, atomData.acquisition_price_mxn,
                                    pItem.price, pItem.acquisition_price_mxn, pItem.price_mxn
                                ];
                                const resolvedPrice = priceChain.find(p => {
                                    const v = parseFloat(String(p || '0'));
                                    return v > 0;
                                });
                                if (resolvedPrice) {
                                    const pVal = parseFloat(String(resolvedPrice));
                                    itemData.price = pVal;
                                    itemData.price_mxn = pVal;
                                    itemData.acquisition_price_mxn = pVal;
                                }

                                // Normalize for utility calls
                                const norm = normalizeInventoryData(itemData);
                                
                                // Price calculation logic using normalized data
                                const costMxn = parseFloat(String(norm.price || '0')) || 0;

                                // TRACE: Log resolved data for first 3 items
                                if (rowIndex <= 3) {
                                    console.log(`[TRK-RESOLVED] Item #${rowIndex}:`, {
                                        atomFound: !!atomItem,
                                        atomDataPrice: atomItem?.data?.price,
                                        atomDataPriceMxn: atomItem?.data?.price_mxn,
                                        atomDataWidth: atomItem?.data?.width_cm,
                                        resolvedPrice: resolvedPrice,
                                        normPrice: norm.price,
                                        costMxn,
                                        normWidthCm: norm.width_cm,
                                        normHeightCm: norm.height_cm,
                                        normLengthCm: norm.length_cm,
                                    });
                                }
                                const qty = parseFloat(String(itemData.quantity || pItem.qty || '1')) || 1;
                                
                                const onyxRound = (n: number) => {
                                    const floor = Math.floor(n);
                                    return (n - floor >= 0.4) ? floor + 1 : floor;
                                };

                                const costUsd = onyxRound(costMxn / (bookRate || 1));
                                const totalMxn = Math.round(costMxn * qty);
                                const landedUsd = onyxRound((costMxn / (bookRate || 1)) * 1.4);
                                const landedMxn = Math.round(costMxn * 1.4);
                                const retailUsd = onyxRound(landedUsd * 12);

                                const finalName = itemData.shortDescription || itemData.description || itemData.name || itemData.desc || 'Unit';
                                const finalMaterial = itemData.material || '';
                                const finalColor = itemData.color || '';

                                // Calculated codes — pass explicit price to prevent silent dash returns
                                const calculated = calculateCodesAndPrices({ ...norm, price: costMxn, price_mxn: costMxn }, bookRate || 1, '326');
                                
                                // Payment Status — use atom row ID that matches the payment sets
                                const statusLookupItem = { ...norm, id: String(atomItem?.row || pItem.row || norm.id || norm.itemId || '') };
                                const payStatusClass = getStatusClass(statusLookupItem, partialPayIds, fullPayIds, requestedAcqIds) || 'BLUE';
                                
                                const payStatusText = payStatusClass === 'GREEN' ? 'PAID' : 
                                                    payStatusClass === 'YELLOW' ? 'REQUESTED' : 
                                                    payStatusClass === 'RED' ? 'REQUESTED' : 
                                                    payStatusClass === 'PURPLE' ? 'PARTIAL' : 'NEW';

                                const payStatusColor = payStatusClass === 'GREEN' ? 'FF22C55E' : 
                                                     payStatusClass === 'YELLOW' ? 'FFFACC15' : 
                                                     payStatusClass === 'RED' ? 'FFFACC15' : 
                                                     payStatusClass === 'PURPLE' ? 'FFA855F7' : 'FF38BDF8';

                                let formattedPayDate = 'N/A';
                                try {
                                    // Use atom row ID to match paymentDateMap keys
                                    const pId = atomItem?.row || pItem.row || itemData.id || pItem.itemId;
                                    const pDateVal = paymentDateMap.get(String(pId)) || paymentDateMap.get(String(itemData.itemId)) || paymentDateMap.get(String(pItem.itemId)) || itemData.pay_date || itemData.payDate || pItem.pay_date;
                                    if (pDateVal && pDateVal !== 'N/A' && pDateVal !== '') {
                                        const d = new Date(pDateVal);
                                        if (!isNaN(d.getTime())) formattedPayDate = d.toISOString().split('T')[0];
                                    }
                                } catch (e) {}

                                const row = tSheet.addRow({
                                    pay_date: formattedPayDate,
                                    tag_id: [
                                        calculated.bookBarcode,
                                        norm.book_barcode,
                                        pItem.itemId
                                    ].find(id => id && id !== '-' && id !== 'UNDEFINED' && id !== 'NULL') || '',
                                    aq_code: (calculated.bookAqCode && calculated.bookAqCode !== '-') ? calculated.bookAqCode : (norm.book_aq_code || '-'),
                                    ld_code: (calculated.bookLandCode && calculated.bookLandCode !== '-') ? calculated.bookLandCode : '-',
                                    description: `${itemData.shape || itemData.type || ''} ${finalName}`.trim(),
                                    color_material: `${finalColor} ${finalMaterial}`.trim(),
                                    sizes_metric: formatDimensionsMetricOnly(norm.width_cm, norm.height_cm, norm.length_cm),
                                    sizes_imperial: formatDimensionsImperialOnly(norm.width_cm, norm.height_cm, norm.length_cm),
                                    weight_metric: formatWeightMetricOnly(norm.weight_kg),
                                    weight_imperial: formatWeightImperialOnly(norm.weight_kg),
                                    quantity: qty,
                                    cost_mxn: costMxn,
                                    acq_usd: costUsd,
                                    total_mxn: totalMxn,
                                    landed_mxn: landedMxn,
                                    ld_usd: landedUsd,
                                    retail_usd: retailUsd,
                                    pay_status: payStatusText
                                });

                                if (rowIndex % 2 === 0) row.eachCell(cell => { cell.fill = EXCEL_STYLES.fills.zebra; });

                                const tagIdStr = String([
                                    calculated.bookBarcode,
                                    itemData.book_barcode,
                                    itemData.itemId,
                                    itemData.tag_id,
                                    pItem.itemId
                                ].find(id => id && id !== '-' && id !== 'UNDEFINED' && id !== 'NULL') || '');

                                const vColor = getVendorColor(tagIdStr);
                                const contrast = getContrastColor(vColor);

                                const tagCell = row.getCell('tag_id');
                                const vendorCode = tagIdStr.split('-')[0] || tagIdStr.substring(0, 2);
                                const tagColor = getVendorColor(vendorCode);
                                const rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tagColor } };
                                const rowFont = { color: { argb: getContrastColor(tagColor) }, bold: true };
                                
                                row.getCell('tag_id').fill = rowFill;
                                row.getCell('tag_id').font = rowFont;
                                row.getCell('tag_id').alignment = { horizontal: 'center' };

                                // Payment Status Styling
                                row.getCell('pay_status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: payStatusColor } };
                                row.getCell('pay_status').font = { bold: true, color: { argb: 'FFFFFFFF' } };
                                row.getCell('pay_status').alignment = { horizontal: 'center' };

                            } catch (e) { console.error('Row generation error:', e); }
                        });
                    });

                } catch (err) {
                    console.error('[Export] TRK sheet failure:', err);
                }
            }


            // 5. VENDOR WORKBOOKS (INDIVIDUAL SHEETS)
            Object.entries(vendorGroups).forEach(([vid, items]) => {
                // Determine sheet name (full vendor name if possible)
                const vMeta = (vendors as any)[vid];
                const sheetName = (vMeta?.name || vid).substring(0, 25);
                const vendorColor = getVendorColor(vid);
                const contrastColor = getContrastColor(vendorColor);

                const vSheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: vendorColor } } });
                
                vSheet.columns = [
                    { header: '#', key: 'item_number', width: 8 },
                    { header: 'PAY DATE', key: 'pay_date', width: 12 },
                    { header: 'BOOK BARCODE', key: 'tag_id', width: 22 },
                    { header: 'AQ CODE', key: 'aq_code', width: 12 },
                    { header: 'LD CODE', key: 'ld_code', width: 12 },
                    { header: 'DESCRIPTION', key: 'description', width: 45 },
                    { header: 'COLOR + MATERIAL', key: 'color_material', width: 35 },
                    { header: 'SIZES (CM)', key: 'sizes_metric', width: 20 },
                    { header: 'SIZES (IN)', key: 'sizes_imperial', width: 20 },
                    { header: 'WEIGHT (KG)', key: 'weight_metric', width: 15 },
                    { header: 'WEIGHT (LB)', key: 'weight_imperial', width: 15 },
                    { header: 'QTY', key: 'quantity', width: 8 },
                    { header: 'ACQ COST $ (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'ACQ $ (USD)', key: 'acq_usd', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'TOTAL MXN', key: 'total_mxn', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'LANDED $ (MXN)', key: 'landed_mxn', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'LD $ (USD)', key: 'ld_usd', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'RETAIL $ (USD)', key: 'retail_usd', width: 18, style: { numFmt: '#,##0' } },
                    { header: 'PAY STATUS', key: 'pay_status', width: 18 }
                ];

                // Header styling
                vSheet.getRow(1).eachCell(cell => {
                    cell.font = EXCEL_STYLES.fonts.header;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vendorColor } };
                    cell.font = { ...EXCEL_STYLES.fonts.header, color: { argb: contrastColor } };
                    cell.alignment = { horizontal: 'center' };
                });

                // Sort items by item_number (numerical)
                const sortedItems = [...items].sort((a: any, b: any) => {
                    const numA = parseInt(a.data.itemNumber || a.data.item_number || '0', 10);
                    const numB = parseInt(b.data.itemNumber || b.data.item_number || '0', 10);
                    return numA - numB;
                });

                sortedItems.forEach((item: any, iIdx: number) => {
                    const itemData = item.data;
                    const qty = parseInt(itemData.quantity || '1', 10) || 1;
                    const costMxn = parseFloat(itemData.price || itemData.acquisition_price_mxn || '0') || 0;
                    
                    const onyxRound = (n: number) => {
                        const floor = Math.floor(n);
                        return (n - floor >= 0.4) ? floor + 1 : floor;
                    };

                    const costUsd = onyxRound(costMxn / bookRate);
                    const totalMxn = Math.round(costMxn * qty);
                    const landedUsd = onyxRound((costMxn / bookRate) * 1.4);
                    const landedMxn = Math.round(costMxn * 1.4);
                    const retailUsd = onyxRound(landedUsd * 12);

                    const norm = normalizeInventoryData(itemData);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const payStatusClass = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds) || 'BLUE';
                    
                    const payStatusText = payStatusClass === 'GREEN' ? 'PAID' : 
                                        payStatusClass === 'YELLOW' ? 'REQUESTED' : 
                                        payStatusClass === 'RED' ? 'PARTIAL' : 
                                        payStatusClass === 'PURPLE' ? 'PURPLE' : 'NEW';

                    const payStatusColor = payStatusClass === 'GREEN' ? 'FF22C55E' : 
                                         payStatusClass === 'YELLOW' ? 'FFFACC15' : 
                                         payStatusClass === 'RED' ? 'FFFACC15' : 
                                         payStatusClass === 'PURPLE' ? 'FFA855F7' : 'FF38BDF8';

                    let formattedPayDate = 'N/A';
                    try {
                        const pDateVal = paymentDateMap.get(String(itemData.id)) || itemData.pay_date || itemData.payDate;
                        if (pDateVal) {
                            const d = new Date(pDateVal);
                            if (!isNaN(d.getTime())) {
                                formattedPayDate = d.toISOString().split('T')[0];
                            }
                        }
                    } catch (e) { console.error('Date error:', e); }

                    const itemNum = itemData.itemNumber || itemData.item_number || iIdx + 1;

                    const row = vSheet.addRow({
                        item_number: itemNum,
                        pay_date: formattedPayDate,
                        tag_id: calculated.bookBarcode || itemData.book_barcode || itemData.itemId || itemData.item_id || itemData.tag_id || item.label || '',
                        aq_code: calculated.bookAqCode || '-',
                        ld_code: calculated.bookLandCode || '-',
                        description: `${itemData.shape || ''} ${itemData.shortDescription || itemData.description || ''}`.trim(),
                        color_material: `${itemData.color || ''} ${itemData.material || ''}`.trim(),
                        sizes_metric: formatDimensionsMetricOnly(itemData.widthCm || itemData.width_cm, itemData.heightCm || itemData.height_cm, itemData.lengthCm || itemData.length_cm),
                        sizes_imperial: formatDimensionsImperialOnly(itemData.widthCm || itemData.width_cm, itemData.heightCm || itemData.height_cm, itemData.lengthCm || itemData.length_cm),
                        weight_metric: formatWeightMetricOnly(itemData.weightKg || itemData.weight_kg),
                        weight_imperial: formatWeightImperialOnly(itemData.weightKg || itemData.weight_kg),
                        quantity: qty,
                        cost_mxn: costMxn,
                        acq_usd: costUsd,
                        total_mxn: totalMxn,
                        landed_mxn: landedMxn,
                        ld_usd: landedUsd,
                        retail_usd: retailUsd,
                        pay_status: payStatusText
                    });

                    // Tag ID highlighting (Vendor Color)
                    const tagIdVal = calculated.bookBarcode || itemData.book_barcode || itemData.itemId || itemData.item_id || itemData.tag_id || item.label || '';
                    const vColorRow = getVendorColor(tagIdVal);
                    const contrastColorRow = getContrastColor(vColorRow);
                    
                    const tagCell = row.getCell('tag_id');
                    tagCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColorRow } };
                    tagCell.font = { bold: true, color: { argb: contrastColorRow } };

                    // Pay Status highlighting
                    const payCell = row.getCell('pay_status');
                    payCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: payStatusColor } };
                    payCell.font = { bold: true, color: { argb: getContrastColor(payStatusColor) } };

                    // Zebra
                    if (iIdx % 2 === 0) row.eachCell(c => { if (!c.fill?.type) c.fill = EXCEL_STYLES.fills.zebra; });
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
            saveAs(new Blob([buffer]), `Onyx-mx_Book-326_${dateStr}.xlsx`);
            toast.success('Manifest Exported Successfully');
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Manifest Export Failed');
        } finally {
            setIsExporting(false);
        }
    };

    const handleRefresh = () => {
        window.location.reload();
    };

    const handleLogout = () => {
        logout();
    };

    const openSettingsPortal = useSetAtom(isStudioSettingsOpenAtom);
    const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;

    return (
        <>
            <div className="main-header h-20 sm:h-24 max-h-20 sm:max-h-24 flex items-center pl-6 pr-0 shrink-0 transition-all flex-nowrap w-full sticky top-0 z-[500] border-b border-white/5 bg-black/20 backdrop-blur-[50px] overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
                {/* Integrated Sidebar Toggle & Logo - Only visible in HIDDEN mode */}
                <div className="flex items-center shrink-0">
                    {sidebarState === 'hidden' && (
                        <button 
                            onClick={() => {
                                const isMobile = window.innerWidth <= 768;
                                setSidebarState(isMobile ? 'compact' : 'expanded');
                            }}
                            className="p-1 px-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-90 transition-all flex items-center gap-2 group/logo mr-4"
                            title="Onyx.mx Menu"
                        >
                            <OnyxMiniLogo className="w-12 h-12 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                        </button>
                    )}
                </div>

                {/* Dynamic Module Bar — Aligned Left & Horizontally Scrollable */}
                <div className="flex-1 flex items-center justify-start min-w-0 overflow-x-auto no-scrollbar custom-scrollbar-hide">
                    <div className="flex items-center gap-1 sm:gap-6 flex-nowrap min-w-max pr-4">
                        {activeView === 'inventory' && <InventoryBar />}
                        {activeView === 'store' && <StoreBar />}
                        {activeView === 'finance' && <FinanceBar />}
                        {activeView === 'logistics' && <LogisticsBar />}
                        {activeView === 'packing' && <PackingBar />}
                        {activeView === 'upload' && <UploadBar />}
                        {activeView === 'process' && <ProcessBar />}
                        {activeView === 'control' && <ControlBar />}
                        {activeView === 'overview' && (
                            <div className="flex items-center gap-1 sm:gap-4">
                                <ModuleBadge icon="layout-dashboard" label="" color="var(--main-color)" />
                                <StudioAction 
                                    icon={DollarSign}
                                    label={currencyMode}
                                    active={true}
                                    onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
                                    color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
                                />
                                <StudioAction 
                                    icon={Download}
                                    label="EXPORT"
                                    onClick={handleMasterExportXLSX}
                                    disabled={isExporting}
                                    className={isExporting ? 'animate-bounce' : ''}
                                />
                            </div>
                        )}
                        {activeView === 'dashboard' && (
                            <div className="flex items-center gap-1 sm:gap-4">
                                <ModuleBadge icon="layout-grid" label="Analytics" color="var(--color-analytics)" />
                                <StudioAction 
                                    icon={DollarSign}
                                    label={currencyMode}
                                    active={true}
                                    onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
                                    color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
                                />
                            </div>
                        )}
                        {(activeView === 'create' || !activeView) && (
                            <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0 pl-4 ml-auto h-full">
                    <div
                        className="hidden md:flex flex-col items-end border-l border-white/5 pl-6 cursor-pointer"
                        onClick={() => openSettingsPortal(true)}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-(--main-color) opacity-40 leading-none mb-1.5">WELCOME</span>
                        <span className="text-[18px] font-black text-(--text-color) opacity-90 tracking-tight leading-none capitalize">
                            {(user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
                                ? user.name.split(' ')[0]
                                : user?.email?.split('@')[0] || 'User'}
                        </span>
                    </div>

                    {activeView === 'store' && (
                        <div className="flex items-center gap-1 mx-2 relative">
                            <button
                                onClick={() => setIsBagOpen(!isBagOpen)}
                                className="w-16 h-16 flex items-center justify-center text-(--main-color) transition-all relative group/bag"
                            >
                                <ShoppingBag size={36} strokeWidth={1.5} className="group-hover/bag:scale-110 transition-transform drop-shadow-[0_0_8px_var(--main-color)]" />
                                {bagCount > 0 && (
                                    <span className="absolute top-1 right-1 w-6 h-6 bg-(--main-color) text-black text-[12px] font-black rounded-full flex items-center justify-center shadow-[0_0_15px_var(--main-color)] animate-in zoom-in duration-300">
                                        {bagCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                </div>
            </div>
            <ShoppingBagDrawer isOpen={isBagOpen} onClose={() => setIsBagOpen(false)} />
        </>
    );
}

