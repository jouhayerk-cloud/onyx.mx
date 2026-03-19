
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
    paymentFilterBarModeAtom,
    processToolAtom,
    processShowTerminalAtom,
    processShowVaultAtom,
    processShowBatchListAtom,
    processTriggerAnalyzeAtom,
    processTriggerBatchAtom,
    processActiveStepLabelAtom,
    processIsProcessingAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { useTranslation, useLogout } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import { TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { OnyxLogo } from '../../components/OnyxLogo';
import toast from 'react-hot-toast';
import userIcons from '../../components/userIcons';
import {
    Store, CreditCard, Truck, Upload, Shield, Search, RefreshCw,
    LogOut, LayoutDashboard, LayoutGrid, List, Bookmark, Sun, Moon, Layers,
    Camera, Wallet, Landmark, X, Settings, Zap, Globe,
    OctagonX, Octagon, CheckCircle, Tag, MapPin, LayoutList, Download, Package,
    Fingerprint, MousePointer2, Scissors, Library, Terminal, FolderKanban, Sparkles, Play, Activity, Loader2
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

const HeaderButton = ({ 
    icon: Icon, 
    onClick, 
    active = false, 
    label, 
    className = "",
    disabled = false
}: { 
    icon: any, 
    onClick?: () => void, 
    active?: boolean, 
    label?: string,
    className?: string,
    disabled?: boolean
}) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`h-9 flex items-center gap-2.5 px-3 rounded-lg transition-all border ${
            active 
                ? "bg-(--main-color) text-black border-(--main-color) shadow-lg shadow-(--main-color)/20" 
                : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10"
        } ${disabled ? "opacity-20 cursor-not-allowed" : ""} ${className}`}
    >
        <Icon size={16} strokeWidth={active ? 2.5 : 2} />
        {label && <span className="text-[10px] font-black uppercase tracking-widest leading-none translate-y-[1px]">{label}</span>}
    </button>
);

const IconButton = ({ 
    icon: Icon, 
    onClick, 
    active = false, 
    className = "",
    disabled = false,
    color = "main"
}: { 
    icon: any, 
    onClick?: () => void, 
    active?: boolean, 
    className?: string,
    disabled?: boolean,
    color?: "main" | "white"
}) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all border ${
            active 
                ? (color === "main" ? "bg-(--main-color) text-black border-(--main-color)" : "bg-white text-black border-white")
                : "bg-white/5 text-white/30 border-white/5 hover:bg-white/10 hover:text-white"
        } ${disabled ? "opacity-20 cursor-not-allowed" : ""} ${className}`}
    >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} />
    </button>
);

const SearchBar = ({ 
    value, 
    onChange, 
    placeholder, 
    onClear,
    icon: Icon = Search 
}: { 
    value: string, 
    onChange: (val: string) => void, 
    placeholder: string,
    onClear?: () => void,
    icon?: any
}) => (
    <div className="relative group">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-(--main-color) transition-colors" size={14} />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 w-64 bg-white/5 border border-white/5 rounded-lg pl-9 pr-8 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-(--main-color)/30 focus:bg-white/8 transition-all"
        />
        {value && onClear && (
            <button 
                onClick={onClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-all"
            >
                <X size={12} />
            </button>
        )}
    </div>
);

const FilterBadge = ({ 
    active, 
    onClick, 
    label, 
    count, 
    icon: Icon 
}: { 
    active: boolean, 
    onClick: () => void, 
    label: string, 
    count?: number,
    icon?: any
}) => (
    <button 
        onClick={onClick}
        className={`h-9 flex items-center gap-2.5 px-3 rounded-lg border transition-all ${
            active 
                ? "bg-(--main-color)/10 border-(--main-color)/30 text-(--main-color)" 
                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/8 hover:text-white"
        }`}
    >
        {Icon && <Icon size={14} />}
        <span className="text-[10px] font-black uppercase tracking-widest leading-none translate-y-[1px]">{label}</span>
        {count !== undefined && (
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                active ? "bg-(--main-color) text-black" : "bg-white/10 text-white/60"
            }`}>
                {count}
            </span>
        )}
    </button>
);

const InventoryBar = () => {
    const [searchTerm, setSearchTerm] = useAtom(inventorySearchTermAtom);
    const [activeFilter, setActiveFilter] = useAtom(inventoryActiveFilterAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const count = useAtomValue(filteredInventoryCountAtom);

    return (
        <div className="flex items-center gap-4">
            <SearchBar 
                value={searchTerm} 
                onChange={setSearchTerm} 
                placeholder="Search catalog..." 
                onClear={() => setSearchTerm('')}
            />
            
            <div className="h-6 w-px bg-white/5" />
            
            <div className="flex items-center gap-1.5">
                <FilterBadge 
                    active={activeFilter === 'All'} 
                    onClick={() => setActiveFilter('All')} 
                    label="All" 
                    count={activeFilter === 'All' ? count : undefined}
                />
                <FilterBadge 
                    active={activeFilter === 'ON_SALE'} 
                    onClick={() => setActiveFilter('ON_SALE')} 
                    label="On Sale" 
                    icon={Tag}
                    count={activeFilter === 'ON_SALE' ? count : undefined}
                />
            </div>

            <div className="h-6 w-px bg-white/5" />

            <div className="relative">
                <HeaderButton
                    icon={LayoutList}
                    label={vendorFilter === 'All' ? "All Vendors" : vendorFilter}
                    onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)}
                    active={vendorFilter !== 'All'}
                />
                
                {isVendorFilterOpen && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-(--stitch-card-bg) border border-white/10 rounded-xl shadow-2xl z-50 p-1 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        <button 
                            onClick={() => { setVendorFilter('All'); setIsVendorFilterOpen(false); }}
                            className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${vendorFilter === 'All' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                        >
                            All Vendors
                        </button>
                        <div className="max-h-60 overflow-y-auto">
                            {Object.keys(vendors).map(vId => (
                                <button 
                                    key={vId}
                                    onClick={() => { setVendorFilter(vId); setIsVendorFilterOpen(false); }}
                                    className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${vendorFilter === vId ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                >
                                    {vId}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="h-6 w-px bg-white/5" />

            <div className="flex items-center gap-1 bg-white/3 p-1 rounded-lg border border-white/5">
                <IconButton 
                    icon={List} 
                    active={viewMode === 'list'} 
                    onClick={() => setViewMode('list')} 
                />
                <IconButton 
                    icon={LayoutGrid} 
                    active={viewMode === 'grid'} 
                    onClick={() => setViewMode('grid')} 
                />
            </div>
        </div>
    );
};

const DashboardBar = () => {
    const [searchTerm, setSearchTerm] = useAtom(dashboardSearchTermAtom);
    const [activeFilter, setActiveFilter] = useAtom(dashboardStatusFilterAtom);
    
    return (
        <div className="flex items-center gap-4">
            <SearchBar 
                value={searchTerm} 
                onChange={setSearchTerm} 
                placeholder="Search dashboard..." 
                onClear={() => setSearchTerm('')}
            />
            
            <div className="h-6 w-px bg-white/5" />
            
            <div className="flex items-center gap-1.5">
                {filterCycle.map(status => (
                    <FilterBadge 
                        key={status}
                        active={activeFilter === status} 
                        onClick={() => setActiveFilter(status)} 
                        label={status.toLowerCase()} 
                    />
                ))}
            </div>
        </div>
    );
};

const LogisticsBar = () => {
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    
    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <HeaderButton 
                    icon={Package} 
                    label="Packing" 
                    active={subTab === 'packing'} 
                    onClick={() => setSubTab('packing')} 
                />
                <HeaderButton 
                    icon={Truck} 
                    label="Trucking" 
                    active={subTab === 'trucking'} 
                    onClick={() => setSubTab('trucking')} 
                />
                <HeaderButton 
                    icon={Layers} 
                    label="Shipping" 
                    active={subTab === 'shipping'} 
                    onClick={() => setSubTab('shipping')} 
                />
            </div>
            
            <div className="h-6 w-px bg-white/5" />
            
            <HeaderButton icon={Download} label="Export Manifest" onClick={() => toast.success("Exporting manifest...")} />
        </div>
    );
};

const FinanceBar = () => {
    const [subTab, setSubTab] = useAtom(financeSubTabAtom);
    const [searchTerm, setSearchTerm] = useAtom(financeSearchTermAtom);
    const [showFinancials, setShowFinancials] = useAtom(showFinancialsAtom);
    const [destFilter, setDestFilter] = useAtom(paymentDestinationFilterAtom);
    const [isDestFilterOpen, setIsDestFilterOpen] = useAtom(isPaymentDestinationFilterOpenAtom);
    const [vendorFilter, setVendorFilter] = useAtom(paymentVendorFilterAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isPaymentVendorFilterOpenAtom);
    const [catFilter, setCatFilter] = useAtom(paymentCategoryFilterAtom);
    const [isCatFilterOpen, setIsCatFilterOpen] = useAtom(isPaymentCategoryFilterOpenAtom);
    const [filterBarMode, setFilterBarMode] = useAtom(paymentFilterBarModeAtom);

    const categories: PaymentCategory[] = ['All', 'ACQ', 'PROD', 'MONTHLY', 'SPPL', 'LABR', 'PACK', 'OPRT'];

    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <HeaderButton 
                    icon={Wallet} 
                    label="Payments" 
                    active={subTab === 'payments'} 
                    onClick={() => setSubTab('payments')} 
                />
                <HeaderButton 
                    icon={Landmark} 
                    label="Tracking" 
                    active={subTab === 'tracking'} 
                    onClick={() => setSubTab('tracking')} 
                />
            </div>
            
            <div className="h-6 w-px bg-white/5" />
            
            {subTab === 'payments' && (
                <>
                    <SearchBar 
                        value={searchTerm} 
                        onChange={setSearchTerm} 
                        placeholder="Search items..." 
                        onClear={() => setSearchTerm('')}
                    />
                    
                    <div className="h-6 w-px bg-white/5" />

                    <div className="flex items-center gap-1 bg-white/3 p-1 rounded-lg border border-white/5">
                        <IconButton 
                            icon={List} 
                            active={filterBarMode === 'off'} 
                            onClick={() => setFilterBarMode('off')} 
                        />
                        <IconButton 
                            icon={LayoutGrid} 
                            active={filterBarMode === 'left'} 
                            onClick={() => setFilterBarMode('left')} 
                        />
                    </div>

                    <div className="h-6 w-px bg-white/5" />

                    {/* Destination Filter */}
                    <div className="relative">
                        <HeaderButton
                            icon={MapPin}
                            label={destFilter === 'All' ? "All Destinations" : destFilter}
                            onClick={() => setIsDestFilterOpen(!isDestFilterOpen)}
                            active={destFilter !== 'All'}
                        />
                        {isDestFilterOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-(--stitch-card-bg) border border-white/10 rounded-xl shadow-2xl z-50 p-1">
                                <button 
                                    onClick={() => { setDestFilter('All'); setIsDestFilterOpen(false); }}
                                    className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${destFilter === 'All' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                >
                                    All Destinations
                                </button>
                                {Object.keys(destinationsConfig).map(dId => (
                                    <button 
                                        key={dId}
                                        onClick={() => { setDestFilter(dId as any); setIsDestFilterOpen(false); }}
                                        className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${destFilter === dId ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {dId}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Vendor Filter */}
                    <div className="relative">
                        <HeaderButton
                            icon={CreditCard}
                            label={vendorFilter === 'All' ? "All Vendors" : vendorFilter}
                            onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)}
                            active={vendorFilter !== 'All'}
                        />
                        {isVendorFilterOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-(--stitch-card-bg) border border-white/10 rounded-xl shadow-2xl z-50 p-1">
                                <button 
                                    onClick={() => { setVendorFilter('All'); setIsVendorFilterOpen(false); }}
                                    className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${vendorFilter === 'All' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                >
                                    All Vendors
                                </button>
                                <div className="max-h-60 overflow-y-auto">
                                    {Object.keys(vendors).map(vId => (
                                        <button 
                                            key={vId}
                                            onClick={() => { setVendorFilter(vId); setIsVendorFilterOpen(false); }}
                                            className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${vendorFilter === vId ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                        >
                                            {vId}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Category Filter */}
                    <div className="relative">
                        <HeaderButton
                            icon={LayoutGrid}
                            label={catFilter === 'All' ? "All Categories" : catFilter}
                            onClick={() => setIsCatFilterOpen(!isCatFilterOpen)}
                            active={catFilter !== 'All'}
                        />
                        {isCatFilterOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-(--stitch-card-bg) border border-white/10 rounded-xl shadow-2xl z-50 p-1">
                                {categories.map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => { setCatFilter(cat); setIsCatFilterOpen(false); }}
                                        className={`w-full flex items-center px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${catFilter === cat ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
            
            <div className="h-6 w-px bg-white/5" />
            
            <IconButton 
                icon={showFinancials ? Sun : Moon} 
                onClick={() => setShowFinancials(!showFinancials)} 
                active={showFinancials}
                color="white"
            />
        </div>
    );
};

const ShippingBar = () => {
    const [viewMode, setViewMode] = useAtom(shippingViewModeAtom);
    
    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <HeaderButton 
                    icon={LayoutDashboard} 
                    label="Warehouse" 
                    active={viewMode === 'warehouse'} 
                    onClick={() => setViewMode('warehouse')} 
                />
                <HeaderButton 
                    icon={Package} 
                    label="Truck" 
                    active={viewMode === 'truck'} 
                    onClick={() => setViewMode('truck')} 
                />
            </div>
            
            <div className="h-6 w-px bg-white/5" />
            
            <SearchBar 
                value="" 
                onChange={() => {}} 
                placeholder="Search storage..." 
                onClear={() => {}}
            />
        </div>
    );
};

const ProcessBar = () => {
    const [tool, setTool] = useAtom(processToolAtom);
    const [showTerminal, setShowTerminal] = useAtom(processShowTerminalAtom);
    const [showVault, setShowVault] = useAtom(processShowVaultAtom);
    const [showBatchList, setShowBatchList] = useAtom(processShowBatchListAtom);
    const setAnalyzeTrigger = useSetAtom(processTriggerAnalyzeAtom);
    const setBatchTrigger = useSetAtom(processTriggerBatchAtom);
    const activeStep = useAtomValue(processActiveStepLabelAtom);
    const isProcessing = useAtomValue(processIsProcessingAtom);
    const selectedItem = useAtomValue(SelectedItemDataAtom);

    return (
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 bg-white/3 p-1 rounded-xl border border-white/5">
                <IconButton 
                    icon={MousePointer2} 
                    active={tool === 'move'} 
                    onClick={() => setTool('move')} 
                />
                <IconButton 
                    icon={Scissors} 
                    active={tool === 'mask'} 
                    onClick={() => setTool('mask')} 
                />
            </div>

            <div className="h-6 w-px bg-white/5" />

            <HeaderButton 
                icon={Library} 
                label="Artifact Vault" 
                active={showVault} 
                onClick={() => setShowVault(!showVault)} 
            />

            <div className="h-6 w-px bg-white/5" />

            {/* Pipeline Status */}
            <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                <Activity size={14} className={isProcessing ? "text-(--main-color) animate-pulse" : "text-white/10"} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 truncate max-w-[140px]">
                    {activeStep || "ENGINE READY"}
                </span>
            </div>

            <div className="h-6 w-px bg-white/5" />

            <HeaderButton 
                icon={isProcessing ? Loader2 : Sparkles} 
                label="Analyze" 
                onClick={() => setAnalyzeTrigger(prev => prev + 1)}
                disabled={!selectedItem || isProcessing}
                className={isProcessing ? "animate-pulse" : ""}
            />

            <HeaderButton 
                icon={Play} 
                label="Run Batch" 
                onClick={() => setBatchTrigger(prev => prev + 1)}
                disabled={isProcessing}
                active
            />

            <div className="flex items-center gap-1.5 ml-2">
                <IconButton 
                    icon={Terminal} 
                    active={showTerminal} 
                    onClick={() => setShowTerminal(!showTerminal)} 
                />
                <IconButton 
                    icon={FolderKanban} 
                    active={showBatchList} 
                    onClick={() => setShowBatchList(!showBatchList)} 
                />
            </div>
        </div>
    );
};

export const MainHeader = () => {
    const activeView = useAtomValue(activeViewAtom);
    const [user] = useAtom(userAtom);
    const [theme, setTheme] = useAtom(themeAtom);
    const [lang, setLang] = useAtom(languageAtom);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const logout = useLogout();
    const { t } = useTranslation();

    const renderModuleBar = () => {
        switch (activeView) {
            case 'dashboard': return <DashboardBar />;
            case 'inventory': return <InventoryBar />;
            case 'logistics': return <LogisticsBar />;
            case 'finance': return <FinanceBar />;
            case 'shipping': return <ShippingBar />;
            case 'process': return <ProcessBar />;
            default: return null;
        }
    };

    return (
        <header className="h-[72px] shrink-0 bg-(--header-bg) border-b border-white/5 px-6 flex items-center justify-between z-100 backdrop-blur-md relative">
            <div className="flex items-center gap-8">
                <OnyxLogo className="w-8 h-8 text-(--main-color)" />
                
                <nav className="flex items-center">
                    {renderModuleBar()}
                </nav>
            </div>

            <div className="flex items-center gap-4">
                {/* Version & Environment */}
                <div className="hidden lg:flex flex-col items-end gap-1">
                    <span className="text-[10px] font-black text-(--main-color) tracking-[0.2em]">V{__APP_VERSION__}</span>
                    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest italic leading-none truncate">Core Integration</span>
                </div>

                <div className="h-8 w-px bg-white/5" />

                {/* User Profile / Menu */}
                <div className="relative">
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`group flex items-center gap-3 pl-3 pr-1 py-1 rounded-xl transition-all border ${
                            isMenuOpen ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className="flex flex-col items-end">
                            <span className="text-[11px] font-black text-white uppercase tracking-tight leading-none mb-1">{user?.name || 'Guest'}</span>
                            <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest leading-none">{user?.role || 'Operator'}</span>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center text-(--main-color) group-hover:bg-(--main-color) group-hover:text-black transition-all">
                            {user?.name ? user.name.charAt(0).toUpperCase() : <Settings size={18} />}
                        </div>
                    </button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                            <div className="absolute top-full right-0 mt-3 w-64 bg-(--stitch-card-bg) border border-white/10 rounded-2xl shadow-3xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                {/* Theme Selector */}
                                <div className="p-4 border-b border-white/5">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] block mb-3">Aesthetic Tone</span>
                                    <div className="grid grid-cols-7 gap-2">
                                        {themes.map(t => (
                                            <button
                                                key={t.name}
                                                onClick={() => setTheme(t.name as any)}
                                                className={`aspect-square rounded-md border-2 transition-all ${
                                                    theme === t.name ? "border-(--main-color) scale-110 shadow-lg shadow-(--main-color)/20" : "border-transparent hover:scale-105"
                                                }`}
                                                style={{ background: t.gradient }}
                                                title={t.name}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Menu Actions */}
                                <div className="p-2 flex flex-col gap-1">
                                    <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all w-full text-left">
                                        <Globe size={16} className="text-sky-400" />
                                        <span>Switch Language (EN/ES)</span>
                                    </button>
                                    <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all w-full text-left">
                                        <Zap size={16} className="text-yellow-400" />
                                        <span>Performance Mode</span>
                                    </button>
                                </div>

                                <div className="p-2 bg-white/2 mt-1">
                                    <button 
                                        onClick={() => { logout(); setIsMenuOpen(false); }}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-red-400/5 text-red-400 hover:bg-red-400/10 transition-all border border-red-400/10"
                                    >
                                        <div className="flex items-center gap-3">
                                            <LogOut size={16} />
                                            <span className="text-[11px] font-black uppercase tracking-widest">Terminate Session</span>
                                        </div>
                                        <RefreshCw size={12} className="opacity-40" />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};
