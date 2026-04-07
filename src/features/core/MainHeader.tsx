
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
    TOP_BAR_SEARCH_ATOM
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
import {
    Store, CreditCard, Truck, Upload, Shield, Search, RefreshCw,
    LogOut, LayoutDashboard, LayoutGrid, List, Bookmark, Sun, Moon, Layers,
    Camera, Play, Wallet, Landmark, X, Settings, Zap, Globe, DollarSign,
    OctagonX, Octagon, CheckCircle, Tag, MapPin, LayoutList, Download, Filter,
    ArrowUpDown, ArrowUp, ArrowDown, Share2, Copy, ExternalLink, Layout, ShoppingBag
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
    GREEN: { icon: '●', title: 'Paid / shipped' },
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
                    className={`flex flex-col items-center justify-center p-1 transition-all active:scale-90 group/pill select-none
                        ${active === t.id ? 'text-(--text-color)' : 'text-(--text-color)/30 hover:text-(--text-color)'}`}
                    style={active === t.id ? { color: accentColor } : {}}>
                    {TabIcon && <TabIcon size={20} strokeWidth={1.5} />}
                </button>
            );
        })}
    </div>
);

const StudioAction: React.FC<{
    icon: React.FC<any>;
    label: string,
    onClick: () => void,
    active?: boolean,
    color?: string,
    title?: string,
    disabled?: boolean,
    className?: string
}> = ({ icon: Icon, label, onClick, active, color, title, disabled, className = "" }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex items-center justify-center p-1 transition-all active:scale-90 group/studio select-none disabled:opacity-30 disabled:pointer-events-none ${className} ${
            active ? 'text-(--main-color)' : 'text-(--text-color)/40 hover:text-(--text-color)'
        }`}
        style={active && color ? { color } : {}}
    >
        <Icon size={26} strokeWidth={1.5} className="group-hover/studio:scale-110 transition-transform" />
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
            <button onClick={() => setIsOpen(true)} className="p-2.5 text-(--text-color)/40 hover:text-(--text-color) hover:scale-110 transition-all">
                <Search size={22} strokeWidth={2} />
            </button>
        ) : (
            <div className="flex-1 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                <Search size={18} strokeWidth={2.5} style={{ color: accentColor }} className="shrink-0 opacity-80" />
                <input
                    autoFocus
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={() => { if (!value) setIsOpen(false); }}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-none text-[13px] font-black text-(--text-color) outline-none placeholder-(--text-color)/15 uppercase tracking-[0.25em] py-3"
                />
                {value && (
                    <button onClick={() => onChange('')} className="p-2 text-(--text-color)/30 hover:text-(--text-color) transition-colors">
                        <X size={18} strokeWidth={2.5} />
                    </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-2 text-(--text-color)/30 hover:text-(--text-color) transition-all hover:scale-125">
                    <X size={16} strokeWidth={3} />
                </button>
            </div>
        )}
    </div>
);


const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
    const BadgeIcon = iconToLucide[icon] || Store;
    return (
        <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-white/5 shrink-0 truncate">
            <BadgeIcon size={18} strokeWidth={2} style={{ color }} />
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
        <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono text-(--text-color)/40">
            <span className="flex items-center gap-1"><span className="text-(--text-color)/70 font-black">{loaded.length}</span> crates</span>
            <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-(--text-color)/10 rounded-full overflow-hidden">
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


const InventoryBar: React.FC = () => {
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isSortOpen, setIsSortOpen] = useAtom(isInventorySortMenuOpenAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : v === 'grid' ? 'gallery' : 'list');
    const ViewIcon = viewMode === 'list' ? LayoutList : viewMode === 'grid' ? LayoutGrid : Layout;
    const viewLabel = viewMode === 'list' ? 'LIST' : viewMode === 'grid' ? 'GRID' : 'GALLERY';

    return (
        <>
            <div className={`flex flex-1 items-center gap-1 min-w-0 overflow-x-auto no-scrollbar ${isSearchOpen ? '' : 'sm:gap-2'}`}>
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
                            icon={Filter} 
                            label="FILTERS"
                            active={isFiltersOpen}
                            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                            color="var(--color-inventory)"
                        />

                        <div className="w-px h-5 bg-(--text-color)/5 mx-0.5 hidden sm:block" />

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
        </>
    );
};


const StoreBar: React.FC = () => {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const vendorOptions = useAtomValue(storeVendorOptionsAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    return (
        <div className={`flex flex-1 items-center gap-1 min-w-0 overflow-x-auto no-scrollbar ${isSearchOpen ? '' : 'sm:gap-2'}`}>
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
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pr-2 border-r border-white/5 mr-1">
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

    const tabs = [
        { id: 'crates', label: 'CRATES', icon: 'truck' },
        { id: 'packing', label: 'PACK', icon: 'package' },
        { id: 'shipping', label: 'TRK', icon: 'map-pin' },
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
                <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
                    <SubTabPills
                        tabs={tabs}
                        active={subTab}
                        onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
                        accentColor="var(--color-logistics)"
                    />
                </div>
            )}
        </div>
    );
};

const PackingBar: React.FC = () => {
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    return (
        <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
            <DeployableSearch 
                value={search} 
                onChange={setSearch} 
                isOpen={isSearchOpen} 
                setIsOpen={setIsSearchOpen} 
                accentColor="var(--main-color)"
                placeholder="FIND INVENTORY..."
            />
        </div>
    );
};

const UploadBar: React.FC = () => {
    const itemData = useAtomValue(uploadItemDataAtom);
    return (
        <div className="flex items-center gap-3">
            <ModuleBadge icon="upload" label="Add Entry" color="var(--color-upload)" />

            <div className="flex flex-col items-center justify-center min-w-[72px] transition-all select-none border-l border-white/5 pl-5 ml-2">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] leading-none mb-2 opacity-30">BOOK</span>
                <span className="text-[14px] font-black font-mono leading-none tracking-tighter opacity-80">{itemData.workbook || 'v326'}</span>
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
            const paymentDateMap = new Map<string, string>();

            financeDocs.forEach(d => {
                const rel = d.related_ids || d.related_inventory_ids || '';
                let ids: string[] = [];
                if (Array.isArray(rel)) {
                    ids = rel.map((id: any) => String(id));
                } else if (typeof rel === 'string') {
                    ids = rel.split(',').map(s => s.trim()).filter(Boolean);
                }

                if (d.status === 'Paid') {
                    const pDate = d.date || d.pay_date || d.created_at;
                    if (pDate) ids.forEach(id => paymentDateMap.set(id, pDate));

                    if (d.description?.includes('%')) {
                        ids.forEach(id => partialPayIds.add(id));
                    } else {
                        ids.forEach(id => fullPayIds.add(id));
                    }
                }
            });

            const internetRate = liveExchangeRateValue || exchangeRate;
            const bookRate = exchangeRate || 20;

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
                { header: 'TOTAL SPEND (MXN)', key: 'total_mxn', width: 22, style: { numFmt: '#,##0.00' } },
                { header: 'SPEND (USD - Inet Rate)', key: 'total_usd', width: 25, style: { numFmt: '#,##0.00' } },
                { header: 'PAID (MXN)', key: 'paid_mxn', width: 18, style: { numFmt: '#,##0.00' } },
                { header: 'PENDING (MXN)', key: 'pending_mxn', width: 18, style: { numFmt: '#,##0.00' } }
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
                { header: 'AMOUNT (MXN)', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } },
                { header: 'FEES (MXN)', key: 'commission', width: 15, style: { numFmt: '#,##0.00' } },
                { header: 'TOTAL (MXN)', key: 'total', width: 15, style: { numFmt: '#,##0.00' } },
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
            const cratesSheet = workbook.addWorksheet('Crates & Pallets');
            cratesSheet.columns = [
                { header: 'ID', key: 'id', width: 20 },
                { header: 'TYPE', key: 'type', width: 12 },
                { header: 'STATUS', key: 'status', width: 12 },
                { header: 'DIMENSIONS (WxLxH)', key: 'dims', width: 25 },
                { header: 'WEIGHT (KG)', key: 'weight', width: 15, style: { numFmt: '#,##0.00' } },
                { header: 'CONTENTS SUMMARY', key: 'contents', width: 45 },
                { header: 'NOTES / DESC', key: 'description', width: 40 },
                { header: 'QTY', key: 'quantity', width: 8 },
                { header: 'COST (MXN)', key: 'cost_mxn', width: 15, style: { numFmt: '#,##0.00' } },
                { header: 'CREATED AT', key: 'date', width: 15 }
            ];

            cratesSheet.getRow(1).eachCell(cell => {
                cell.font = EXCEL_STYLES.fonts.header;
                cell.fill = EXCEL_STYLES.fills.header;
                cell.alignment = { horizontal: 'center' };
            });

            const exportCrates = logisticsDocs.filter(d => 
                ['crate', 'pallet'].includes((d.type || '').toLowerCase())
            );

            exportCrates.forEach((c, idx) => {
                const row = cratesSheet.addRow({
                    id: String(c.id || '').toUpperCase(),
                    type: (c.type || 'Crate').toUpperCase(),
                    status: (c.status || 'Empty').toUpperCase(),
                    dims: `${c.width_cm || 0} x ${c.length_cm || 0} x ${c.height_cm || 0} CM`,
                    weight: parseFloat(String(c.weight_kg || '0')) || 0,
                    contents: c.contents_summary || '',
                    description: c.description || '',
                    quantity: parseInt(String(c.quantity || '1')) || 1,
                    cost_mxn: parseFloat(String(c.cost_mxn || '0')) || 0,
                    date: c.date ? new Date(c.date).toLocaleDateString() : ''
                });

                if (idx % 2 === 0) row.eachCell(cell => { if (!cell.fill?.type) cell.fill = EXCEL_STYLES.fills.zebra; });
            });

            // 4. VENDOR WORKBOOKS (INDIVIDUAL SHEETS)
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
                    { header: 'ACQ COST $ (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0.00' } },
                    { header: 'TOTAL MXN', key: 'total_mxn', width: 18, style: { numFmt: '#,##0.00' } },
                    { header: 'LANDED $ (MXN)', key: 'landed_mxn', width: 18, style: { numFmt: '#,##0.00' } },
                    { header: 'RETAIL $ (USD)', key: 'retail_usd', width: 18, style: { numFmt: '#,##0.00' } },
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
                    const qty = parseInt(it.quantity || '1', 10) || 1;
                    const costMxn = parseFloat(it.price || it.acquisition_price_mxn || '0') || 0;
                    
                    const costUsd = costMxn / bookRate;
                    const totalMxn = costMxn * qty;
                    const landedMxn = costMxn * 1.4;
                    const retailUsd = costUsd * 12;

                    const calculated = calculateCodesAndPrices(it, bookRate, '326');
                    const payStatusClass = getStatusClass(it, partialPayIds, fullPayIds) || 'BLUE';
                    const payStatusColor = payStatusClass === 'GREEN' ? 'FF22C55E' : 
                                         payStatusClass === 'YELLOW' ? 'FFFACC15' : 
                                         payStatusClass === 'RED' ? 'FFEF4444' : 
                                         payStatusClass === 'PURPLE' ? 'FFA855F7' : 'FF38BDF8';
                    const payStatusText = payStatusClass === 'GREEN' ? 'PAID' : 
                                        payStatusClass === 'YELLOW' ? 'REQUESTED' : 
                                        payStatusClass === 'RED' ? 'PARTIAL' : 
                                        payStatusClass === 'PURPLE' ? 'ACQUIRED' : 'NEW';

                    let formattedPayDate = 'N/A';
                    try {
                        const pDateVal = paymentDateMap.get(String(it.id)) || it.pay_date || it.payDate;
                        if (pDateVal) {
                            const d = new Date(pDateVal);
                            if (!isNaN(d.getTime())) {
                                formattedPayDate = d.toISOString().split('T')[0];
                            }
                        }
                    } catch (e) { console.error('Date error:', e); }

                    const itemNum = it.itemNumber || it.item_number || iIdx + 1;

                    const row = vSheet.addRow({
                        item_number: itemNum,
                        pay_date: formattedPayDate,
                        tag_id: calculated.bookBarcode || it.book_barcode || it.itemId || it.item_id || it.tag_id || item.label || '',
                        aq_code: calculated.bookAqCode || '-',
                        ld_code: calculated.bookLandCode || '-',
                        description: `${it.shape || ''} ${it.shortDescription || it.description || ''}`.trim(),
                        color_material: `${it.color || ''} ${it.material || ''}`.trim(),
                        sizes_metric: formatDimensionsMetricOnly(it.widthCm || it.width_cm, it.heightCm || it.height_cm, it.lengthCm || it.length_cm),
                        sizes_imperial: formatDimensionsImperialOnly(it.widthCm || it.width_cm, it.heightCm || it.height_cm, it.lengthCm || it.length_cm),
                        weight_metric: formatWeightMetricOnly(it.weightKg || it.weight_kg),
                        weight_imperial: formatWeightImperialOnly(it.weightKg || it.weight_kg),
                        quantity: qty,
                        cost_mxn: costMxn,
                        total_mxn: totalMxn,
                        landed_mxn: landedMxn,
                        retail_usd: retailUsd,
                        pay_status: payStatusText
                    });

                    // Tag ID highlighting (Vendor Color)
                    const tagCell = row.getCell('tag_id');
                    tagCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vendorColor } };
                    tagCell.font = { bold: true, color: { argb: contrastColor } };

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

    const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;

    return (
        <>
            <div className="main-header h-14 sm:h-16 flex items-center pl-4 pr-0 shrink-0 transition-all flex-nowrap w-full relative z-50 border-b border-white/5 bg-(--main-header-bg) scale-95 sm:scale-100 origin-right sm:origin-center">
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
                            <OnyxMiniLogo className="w-8 h-8 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                        </button>
                    )}
                </div>

                {/* Dynamic Module Bar — Aligned Left & Horizontally Scrollable */}
                <div className="flex-1 flex items-center justify-start min-w-0 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1 sm:gap-6 flex-nowrap min-w-0">
                        {activeView === 'inventory' && <InventoryBar />}
                        {activeView === 'store' && <StoreBar />}
                        {activeView === 'finance' && <FinanceBar />}
                        {activeView === 'logistics' && <LogisticsBar />}
                        {activeView === 'packing' && <PackingBar />}
                        {activeView === 'upload' && <UploadBar />}
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
                            <>
                                <ModuleBadge icon="layout-grid" label="Analytics" color="var(--color-analytics)" />
                                <div className="ml-auto pr-4">
                                    <span className="text-[10px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.25em]">SYST_CONTROL</span>
                                </div>
                            </>
                        )}
                        {(activeView === 'create' || !activeView) && (
                            <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0 pl-4 ml-auto h-full">
                    <div className="hidden md:flex flex-col items-end border-l border-white/5 pl-4">
                        <span className="text-[7px] font-bold uppercase tracking-[0.25em] text-(--main-color) opacity-40 leading-none mb-1">WELCOME</span>
                        <span className="text-[14px] font-black text-(--text-color) opacity-90 tracking-tight leading-none capitalize">
                            {(user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
                                ? user.name.split(' ')[0]
                                : user?.email?.split('@')[0] || 'User'}
                        </span>
                    </div>

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

                    <div className="flex items-center relative h-full">
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`w-14 h-14 sm:h-16 flex items-center justify-center transition-all active:scale-95 group/sett ${
                                isSettingsOpen ? 'text-(--main-color) bg-white/5' : 'text-(--text-color) opacity-30 hover:opacity-100 hover:bg-white/5'
                            }`}
                            title="Studio Settings"
                        >
                            <Settings size={24} strokeWidth={1.5} className={`transition-all duration-500 ${isSettingsOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {isSettingsOpen && createPortal(
                            <>
                                <div className="fixed inset-0 z-9998" onClick={() => setIsSettingsOpen(false)} />
                                <div className="fixed top-16 right-6 w-64 bg-black/40 backdrop-blur-3xl shadow-2xl flex flex-col gap-8 z-9999 animate-in fade-in slide-in-from-top-2 duration-200 p-8">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-(--text-color) opacity-30">Settings</span>
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => setPerformanceMode(!performanceMode)} 
                                                    className={`transition-all duration-300 ${performanceMode ? 'text-yellow-400 scale-125 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]' : 'text-(--text-color) opacity-20 hover:opacity-40'}`}
                                                >
                                                    <Zap size={16} strokeWidth={2.5} fill={performanceMode ? "currentColor" : "none"} />
                                                </button>
                                                <button onClick={() => setIsSettingsOpen(false)} className="text-(--text-color) opacity-20 hover:opacity-100 transition-all transform hover:rotate-90">
                                                    <X size={14} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleRefresh} 
                                            className="flex flex-col items-center justify-center p-8 bg-white/5 hover:bg-white/10 active:bg-blue-500/20 transition-all group"
                                        >
                                            <RefreshCw size={28} strokeWidth={1.5} className="text-(--text-color) opacity-40 group-hover:text-blue-400 group-hover:rotate-180 transition-all duration-1000 mb-4" />
                                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-(--text-color) opacity-60">Refresh Sync</span>
                                        </button>

                                        <div className="flex flex-col gap-4">
                                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-(--text-color) opacity-20 border-b border-white/5 pb-1 w-fit">Appearance</span>
                                            <div className="grid grid-cols-4 gap-2">
                                                {themes.map(th => (
                                                    <button key={th.name} onClick={() => setTheme(th.name)}
                                                        className={`h-12 cursor-pointer transition-all hover:scale-110 relative group/th border border-white/5 overflow-hidden ${theme === th.name ? 'ring-2 ring-white/40 z-10 scale-110 shadow-xl' : 'opacity-40 hover:opacity-100'}`}
                                                        style={{ 
                                                            background: `url(${th.swatch})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center'
                                                        }} 
                                                        title={th.name} 
                                                    >
                                                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/th:opacity-100 bg-black/40 transition-opacity">
                                                            <span className="text-[6px] font-black uppercase tracking-widest text-white drop-shadow-md">{th.name}</span>
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-auto">
                                            <button onClick={logout} className="flex items-center gap-3 text-red-500/40 hover:text-red-500 transition-colors py-2 group">
                                                <LogOut size={14} strokeWidth={2.5} className="group-hover:-translate-x-1 transition-transform" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.25em]">Session Exit</span>
                                            </button>
                                        </div>
                                    </div>
                            </>,
                            document.body
                        )}
                    </div>
                </div>
            </div>
            <ShoppingBagDrawer isOpen={isBagOpen} onClose={() => setIsBagOpen(false)} />
        </>
    );
}

