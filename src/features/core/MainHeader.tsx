
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
    isPaymentDestinationFilterOpenAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';
import { useTranslation, useLogout } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import { topBarRightSlotAtom } from '../../lib/atoms';
import { OnyxLogo } from '../../components/OnyxLogo';
import toast from 'react-hot-toast';
import userIcons from '../../components/userIcons';
import {
    Store, CreditCard, Truck, Upload, Shield, Search, RefreshCw,
    LogOut, LayoutGrid, List, Bookmark, Sun, Moon, Layers,
    Camera, Play, Wallet, Landmark, X, Settings, Zap, Globe,
    OctagonX, Octagon, CheckCircle, Tag, MapPin
} from 'lucide-react';

declare const __APP_VERSION__: string;

const themes = [
    { name: 'obsidian', gradient: 'linear-gradient(135deg, #1a1a24, #212130, #2a2a3d)' },
    { name: 'fluorite', gradient: 'linear-gradient(135deg, #2a0a4a, #1c0e3a, #0a2a40)' },
    { name: 'malaquite', gradient: 'linear-gradient(135deg, #081f13, #0b2f20, #0f4028)' },
    { name: 'nacar', gradient: 'linear-gradient(135deg, #fdfcf0, #f4fae8, #eef9e4)' },
    { name: 'tehu', gradient: 'linear-gradient(135deg, #fdfafa, #f6efe8, #eff6ec)' },
    { name: 'tekis', gradient: 'linear-gradient(135deg, #fffff0, #fdfbf0, #fefce8)' },
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


const InventoryBar: React.FC = () => {
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);

    return (
        <>
            <div className="flex flex-1 items-center gap-4 ml-2">
                <Store size={22} strokeWidth={1.75} color="#6BCEBB" className="shrink-0 hidden lg:block" />

                <div className="flex items-center gap-1 ml-auto relative">
                    {/* Vendor Filter Toggle */}
                    <button
                        className={`p-2 transition-all hover:scale-110 flex items-center justify-center shrink-0 ${isVendorFilterOpen ? 'text-[#6BCEBB]' : 'text-white/50 hover:text-white'}`}
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
                            const next: Record<string, 'All' | 'Acquisition' | 'Production' | 'Shipped'> = {
                                'All': 'Acquisition',
                                'Acquisition': 'Production',
                                'Production': 'Shipped',
                                'Shipped': 'All'
                            };
                            setStatusFilter(next[statusFilter] || 'All');
                        }}
                        title={`Status Filter: ${statusFilter}`}
                    >
                        {statusFilter === 'All' && <div className="w-5 h-5 rounded-full border-2 border-white/50" />}
                        {statusFilter === 'Acquisition' && <div className="w-5 h-5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]" />}
                        {statusFilter === 'Production' && <div className="w-5 h-5 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />}
                        {statusFilter === 'Shipped' && <div className="w-5 h-5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]" />}
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
                </div>
            </div>

            {/* Vendor Filter Bar — horizontal frame rendered outside header via portal */}
            {isVendorFilterOpen && createPortal(
                <div
                    className="fixed left-0 right-0 z-40 flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2 duration-200"
                    style={{
                        top: '64px',
                        background: 'color-mix(in srgb, var(--sidebar-bg) 90%, transparent)',
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
                                className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${isActive ? 'text-black border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                            >
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
                </div>,
                document.body
            )}
        </>
    );
};


const StoreBar: React.FC = () => {
    const [search, setSearch] = useAtom(storeSearchTermAtom);

    return (
        <div className="flex flex-1 items-center gap-4 ml-2 relative">
            <Store size={22} strokeWidth={1.75} color="#F36F21" className="shrink-0 hidden sm:block" />

            <div className="flex-1 w-full relative group/search max-w-3xl mx-auto">
                {/* Large liquid glass search bar */}
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Search size={18} strokeWidth={2} className="text-white/40 group-focus-within/search:text-[#F36F21] transition-colors" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search brand catalog by shape, color, or ID..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-10 text-sm text-white outline-none placeholder-white/25 focus:bg-white/10 focus:border-white/20 transition-all shadow-lg backdrop-blur-md"
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

const FinanceBar: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const docs = useAtomValue(financeDataAtom);
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [vendorFilter, setVendorFilter] = useAtom(paymentVendorFilterAtom);
    const [isVendorOpen, setIsVendorOpen] = useAtom(isPaymentVendorFilterOpenAtom);
    const [isDestOpen, setIsDestOpen] = useAtom(isPaymentDestinationFilterOpenAtom);

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
            'extended': 'minimal',
            'minimal': 'collapsed',
            'collapsed': 'extended',
        };
        setOverviewMode(next[overviewMode] || 'extended');
    };

    const modeLabel: Record<string, string> = { extended: 'Full', minimal: 'Min', collapsed: 'Off' };

    return (
        <>
            <div className="flex flex-1 items-center gap-4 ml-2 relative">
                <CreditCard size={22} strokeWidth={1.75} color="#A78BFA" className="shrink-0 hidden sm:block" />

                {/* Pending net total for active destination filter (centered) */}
                {destinationFilter !== 'All' && activeDestReqNetMXN > 0 && (
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 bg-[#A78BFA]/10 border border-[#A78BFA]/30 rounded-xl shrink-0 shadow-inner z-10 pointer-events-none">
                        <span className="text-[9px] font-black text-[#A78BFA] uppercase tracking-[0.2em]">PENDING REQ</span>
                        <div className="h-4 w-px bg-[#A78BFA]/20" />
                        <div className="flex items-baseline gap-2 text-[#A78BFA]">
                            <span className="text-[13px] font-mono font-black">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(activeDestReqNetMXN)}
                            </span>
                            <span className="text-[10px] font-mono font-bold opacity-70">
                                ≈ ${activeDestReqNetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-1 ml-auto">
                    {/* Destination Filter Toggle */}
                    <button
                        className={`p-2 transition-all hover:scale-110 flex items-center justify-center shrink-0 ${isDestOpen ? 'text-[#A78BFA]' : 'text-white/50 hover:text-white'}`}
                        onClick={() => { setIsDestOpen(!isDestOpen); setIsVendorOpen(false); }}
                        title="Filter by Destination"
                    >
                        <MapPin size={18} strokeWidth={1.75} />
                        {destinationFilter !== 'All' && (
                            <span className="ml-1 text-[10px] font-black text-[#A78BFA]">{destinationFilter}</span>
                        )}
                    </button>

                    {/* Vendor Filter Toggle */}
                    <button
                        className={`p-2 transition-all hover:scale-110 flex items-center justify-center shrink-0 ${isVendorOpen ? 'text-[#A78BFA]' : 'text-white/50 hover:text-white'}`}
                        onClick={() => { setIsVendorOpen(!isVendorOpen); setIsDestOpen(false); }}
                        title="Filter by Vendor"
                    >
                        <Tag size={18} strokeWidth={1.75} />
                        {vendorFilter !== 'All' && (
                            <span className="ml-1 text-[10px] font-black" style={{ color: vendors[vendorFilter as keyof typeof vendors]?.color }}>{vendorFilter}</span>
                        )}
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

                    {/* Single 3-state Overview Toggle */}
                    <button
                        onClick={cycleOverviewMode}
                        className={`p-2 transition-all hover:scale-110 flex items-center gap-1.5 shrink-0 ${overviewMode === 'collapsed' ? 'text-white/30 hover:text-white' :
                                overviewMode === 'minimal' ? 'text-[#A78BFA]/60 hover:text-[#A78BFA]' :
                                    'text-[#A78BFA]'
                            }`}
                        title={`Overview: ${modeLabel[overviewMode]} → click to cycle`}
                    >
                        <CreditCard size={18} strokeWidth={1.75} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{modeLabel[overviewMode]}</span>
                    </button>
                </div>
            </div>

            {/* Destination Filter Bar — horizontal portal frame */}
            {isDestOpen && createPortal(
                <div
                    className="fixed left-0 right-0 z-40 flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2 duration-200"
                    style={{
                        top: '64px',
                        background: 'color-mix(in srgb, var(--sidebar-bg) 90%, transparent)',
                        backdropFilter: 'blur(24px)',
                        borderBottom: '1px solid color-mix(in srgb, var(--text-color) 8%, transparent)',
                    }}
                >
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 shrink-0 mr-2">Destination</span>
                    <button
                        onClick={() => setDestinationFilter('All')}
                        className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${destinationFilter === 'All' ? 'bg-white/20 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            }`}
                    >All</button>
                    {Object.entries(destinationsConfig).map(([key, config]) => (
                        <button
                            key={key}
                            onClick={() => setDestinationFilter(key as any)}
                            className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${destinationFilter === key ? 'bg-[#A78BFA]/20 border-[#A78BFA]/50 text-[#A78BFA]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <img src={config.icon} alt={config.name} className="w-4 h-4 object-contain" />
                            {config.name}
                        </button>
                    ))}
                    <button onClick={() => setIsDestOpen(false)} className="ml-auto shrink-0 p-1.5 rounded-full text-white/20 hover:text-white transition-colors">
                        <X size={12} strokeWidth={2.5} />
                    </button>
                </div>,
                document.body
            )}

            {/* Vendor Filter Bar — horizontal portal frame */}
            {isVendorOpen && createPortal(
                <div
                    className="fixed left-0 right-0 z-40 flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar animate-in slide-in-from-top-2 duration-200"
                    style={{
                        top: '64px',
                        background: 'color-mix(in srgb, var(--sidebar-bg) 90%, transparent)',
                        backdropFilter: 'blur(24px)',
                        borderBottom: '1px solid color-mix(in srgb, var(--text-color) 8%, transparent)',
                    }}
                >
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 shrink-0 mr-2">Vendor</span>
                    <button
                        onClick={() => setVendorFilter('All')}
                        className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${vendorFilter === 'All' ? 'bg-white/20 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            }`}
                    >All</button>
                    {activeVendors.map(v => {
                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                        const isActive = vendorFilter === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${isActive ? 'text-black border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                            >{v}</button>
                        );
                    })}
                    <button onClick={() => setIsVendorOpen(false)} className="ml-auto shrink-0 p-1.5 rounded-full text-white/20 hover:text-white transition-colors">
                        <X size={12} strokeWidth={2.5} />
                    </button>
                </div>,
                document.body
            )}
        </>
    );
};


const LogisticsBar: React.FC = () => {
    const t = useTranslation();
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const [cameraView, setCameraView] = useAtom(shippingCameraViewAtom);
    const [viewMode, setViewMode] = useAtom(shippingViewModeAtom);
    const [maxWeight, setMaxWeight] = useAtom(truckMaxWeightAtom);
    const setTriggerOrg = useSetAtom(triggerWarehouseOrganizationAtom);

    const cameraViews: CameraView[] = ['perspective', 'top', 'side', 'front'];

    return (
        <>
            <ModuleBadge icon="truck" label="Logistics" color="#F7941D" />

            {subTab === 'trucking' && (
                <div className="hidden md:flex items-center gap-2 ml-2">
                    {/* Warehouse organise */}
                    <button onClick={() => setTriggerOrg(v => v + 1)} title="Organise warehouse"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors shrink-0">
                        <svg className="w-4 h-4"><use href="#layout-grid" /></svg>
                    </button>
                    {/* View mode */}
                    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                        {(['warehouse', 'truck'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${viewMode === m ? 'bg-[#F7941D] text-black' : 'text-white/35 hover:text-white/70'}`}>
                                {m}
                            </button>
                        ))}
                    </div>
                    {/* Camera view */}
                    <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                        {cameraViews.map(v => (
                            <button key={v} onClick={() => setCameraView(v)}
                                className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${cameraView === v ? 'bg-[#F7941D] text-black' : 'text-white/35 hover:text-white/70'}`}>
                                {v.slice(0, 3)}
                            </button>
                        ))}
                    </div>
                    {/* Max weight */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-white/30 font-black uppercase tracking-widest whitespace-nowrap">Max kg</span>
                        <input type="number" value={maxWeight} onChange={e => setMaxWeight(Number(e.target.value))}
                            className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-mono text-white/70 focus:outline-none focus:border-[#F7941D]/50" />
                    </div>
                </div>
            )}

            <div className="ml-auto">
                {subTab === 'trucking' && <ShippingStats />}
            </div>
        </>
    );
};

const UploadBar: React.FC = () => {
    const itemData = useAtomValue(uploadItemDataAtom);
    return (
        <div className="flex items-center gap-4">
            <ModuleBadge icon="upload" label="Add Entry" color="#8DC63F" />

            <div className="bg-(--main-color) text-black px-5 py-2.5 rounded-b-xl shadow-2xl flex flex-col items-center min-w-[90px] border-x border-b border-black/20 transform -translate-y-2 hover:translate-y-1 transition-all duration-700 cursor-default group z-50">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] leading-none mb-1.5 opacity-60 group-hover:opacity-100 transition-opacity">BOOK V</span>
                <span className="text-[14px] font-black font-mono leading-none tracking-tight">{itemData.workbook || 'v326'}</span>
            </div>
        </div>
    );
};

const ControlBar: React.FC = () => (
    <>
        <ModuleBadge icon="shield" label="Control" color="#a78bfa" />
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

    const toggleSidebar = () => setSidebarState(cur => cur === 'hidden' ? 'expanded' : 'hidden');

    const user = useAtomValue(userAtom);
    const logout = useLogout();
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const t = useTranslation();

    const handleRefresh = () => {
        setInventoryVersion(v => v + 1);
        toast.success("Synchronizing Database...");
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
                {activeView === 'inventory' && <InventoryBar />}
                {activeView === 'store' && <StoreBar />}
                {activeView === 'finance' && <FinanceBar />}
                {activeView === 'logistics' && <LogisticsBar />}
                {activeView === 'upload' && <UploadBar />}
                {activeView === 'control' && <ControlBar />}
                {activeView === 'dashboard' && (
                    <>
                        <ModuleBadge icon="layout-grid" label="Dashboard" color="#6BCEBB" />
                        <div className="ml-auto">
                            <span className="text-[9px] font-black text-(--text-color) opacity-20 uppercase tracking-widest">Admin Overview</span>
                        </div>
                    </>
                )}
                {(activeView === 'create' || !activeView) && (
                    <span className="text-[10px] font-black text-(--text-color) opacity-20 uppercase tracking-widest">Onyx.mx</span>
                )}
            </div>

            {/* Injected Right-Slot for active view tools */}
            {useAtomValue(topBarRightSlotAtom)}

            {/* User Info & Actions */}
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-(--text-color)/5 shrink-0">
                <div className="hidden lg:flex flex-col items-end">
                    <span className="text-[8px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.2em] mb-0.5">Welcome back,</span>
                    <span className="text-[11px] font-black text-(--text-color) leading-none capitalize">
                        {(user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
                            ? user.name
                            : user?.email?.split('@')[0] || 'User'}
                    </span>
                </div>

                {UserIcon && (
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-(--text-color)/5 border border-(--text-color)/10 shrink-0">
                        <UserIcon className="w-full h-full text-(--text-color)" />
                    </div>
                )}

                <div className="flex items-center gap-1 relative">
                    <Settings size={18} strokeWidth={1.75}
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`cursor-pointer text-(--text-color) opacity-40 hover:opacity-80 transition-all duration-300 ${isSettingsOpen ? 'rotate-90 text-(--main-color)' : ''}`} />
                    {isSettingsOpen && (
                        <>
                            {/* Backdrop */}
                            <div className="fixed inset-0 z-[99]" onClick={() => setIsSettingsOpen(false)} />
                            {/* Panel */}
                            <div className="absolute top-12 right-0 w-72 bg-(--background-color)/90 backdrop-blur-2xl border border-(--text-color)/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-5 flex flex-col gap-5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">

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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
