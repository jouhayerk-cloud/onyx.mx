/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useMemo } from 'react';
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
    performanceModeAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useTranslation, useLogout } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import { OnyxLogo } from '../../components/OnyxLogo';
import toast from 'react-hot-toast';
import userIcons from '../../components/userIcons';
import {
    Store, CreditCard, Truck, Upload, Shield, Search, RefreshCw,
    LogOut, LayoutGrid, List, Bookmark, Sun, Moon, Layers,
    Camera, Play, Wallet, Landmark, X, Settings, Zap, Globe
} from 'lucide-react';

// Injected at build time from package.json via vite.config.ts
declare const __APP_VERSION__: string;

const themes = [
    { name: 'obsidian', gradient: 'linear-gradient(135deg, #1a1a24, #212130, #2a2a3d)' },
    { name: 'fluorite', gradient: 'linear-gradient(135deg, #2a0a4a, #1c0e3a, #0a2a40)' },
    { name: 'malaquite', gradient: 'linear-gradient(135deg, #081f13, #0b2f20, #0f4028)' },
    { name: 'nacar', gradient: 'linear-gradient(135deg, #fdfcf0, #f4fae8, #eef9e4)' },
    { name: 'tehu', gradient: 'linear-gradient(135deg, #fdfafa, #f6efe8, #eff6ec)' },
    { name: 'tekis', gradient: 'linear-gradient(135deg, #fffff0, #fdfbf0, #fefce8)' },
];

// ─── Types ───────────────────────────────────────────────────────────────────
const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const filterConfig: Record<TrafficLightStatus, { icon: string; title: string }> = {
    ALL: { icon: '○', title: 'All items' },
    RED: { icon: '●', title: 'Approved, pending payment' },
    YELLOW: { icon: '●', title: 'Payment requested, unpaid' },
    GREEN: { icon: '●', title: 'Paid / shipped' },
};

// Map icon string keys to Lucide components for consistent single-color icons
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

// ─── Search bar (shared) ──────────────────────────────────────────────────────
const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className={`flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl transition-all duration-300 ${expanded ? 'w-48 px-3' : 'w-8 justify-center cursor-pointer hover:bg-white/10'} h-8 overflow-hidden shrink-0 z-50 group/search`}
            onClick={() => !expanded && setExpanded(true)}
        >
            <Search size={14} strokeWidth={2} className="shrink-0 text-white/40 group-hover/search:text-(--main-color) transition-colors" />
            {expanded && (
                <>
                    <input autoFocus className="flex-1 bg-transparent text-[10px] text-white outline-none placeholder-white/25 min-w-0"
                        value={value} onChange={e => onChange(e.target.value)}
                        onBlur={() => !value && setExpanded(false)}
                        placeholder={placeholder} />
                    {value && (
                        <button onClick={() => onChange('')} className="text-white/30 hover:text-white/70 transition-colors"><X size={12} strokeWidth={2.5} /></button>
                    )}
                </>
            )}
        </div>
    );
};

// ─── Sub-tab pill strip (shared) ─────────────────────────────────────────────
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

// ─── Module badge ─────────────────────────────────────────────────────────────
const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
    const BadgeIcon = iconToLucide[icon] || Store;
    return (
        <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-white/10 shrink-0 truncate">
            <BadgeIcon size={16} strokeWidth={1.75} style={{ color }} />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] truncate" style={{ color }}>{label}</span>
        </div>
    );
};

// ─── Shipping Stats chip ──────────────────────────────────────────────────────
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

// ─── MODULE BARS ──────────────────────────────────────────────────────────────

const InventoryBar: React.FC = () => {
    const t = useTranslation();
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [showFinancials, setShowFinancials] = useAtom(showFinancialsAtom);
    const [devStatusFilter, setDevStatusFilter] = useAtom(dashboardStatusFilterAtom);
    const [inventoryFilter, setInventoryFilter] = useAtom(inventoryActiveFilterAtom);
    const inventory = useAtomValue(inventoryAtom);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const filteredCount = useAtomValue(filteredInventoryCountAtom);
    const [isDetailsOpen, setIsDetailsOpen] = useAtom(isDetailsPanelOpenAtom);
    const selectedItem = useAtomValue(SelectedItemDataAtom);
    const user = useAtomValue(userAtom);

    const vendorIds = useMemo(() => {
        const ids = new Set(inventory.map(i => i.data.itemId));
        return ['All', ...Array.from(ids).sort()];
    }, [inventory]);

    const cycleFilter = () => {
        const statuses = ['All', 'Available', 'Production', 'Acquisition'] as const;
        const i = statuses.indexOf(statusFilter);
        setStatusFilter(statuses[(i + 1) % statuses.length]);
    };

    return (
        <>
            <ModuleBadge icon="store" label="Inventory" color="#6BCEBB" />
            <div className="flex items-center gap-1.5 ml-2.5 mr-4 text-[#6BCEBB] opacity-60">
                <span className="text-[10px] font-black font-mono tracking-widest">{filteredCount} ITEMS</span>
            </div>

            <button onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
                className="w-9 h-8 flex items-center justify-center rounded-lg transition-all bg-white/5 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white"
                title={viewMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}>
                <span className="text-sm font-bold">{viewMode === 'grid' ? "☰" : "⊞"}</span>
            </button>
            <div className="flex items-center gap-2 ml-auto">
                {/* Admin vendor filter chips */}
                {user?.role !== 'Client' && vendorIds.length > 2 && (
                    <div className="hidden md:flex items-center gap-1 overflow-x-auto max-w-[150px]">
                        {vendorIds.slice(0, 5).map(id => (
                            <button key={id} onClick={() => setInventoryFilter(id)}
                                className={`px-1.5 py-0.5 text-[8px] font-black rounded-md transition-all border ${inventoryFilter === id ? 'border-[#6BCEBB] bg-[#6BCEBB]/10 text-[#6BCEBB]' : 'border-white/10 text-white/30 hover:text-white/60'}`}>
                                {id}
                            </button>
                        ))}
                    </div>
                )}
                {/* Traffic light filter */}
                <button onClick={() => {
                    const statuses = ['ALL', 'RED', 'YELLOW', 'GREEN'] as const;
                    setDevStatusFilter(statuses[(statuses.indexOf(devStatusFilter) + 1) % statuses.length]);
                }} title={filterConfig[devStatusFilter].title}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 shrink-0">
                    <span className={`text-[10px] leading-none ${devStatusFilter === 'RED' ? 'text-red-500' :
                        devStatusFilter === 'YELLOW' ? 'text-yellow-500' :
                            devStatusFilter === 'GREEN' ? 'text-green-500' :
                                'text-white/20'
                        }`}>{filterConfig[devStatusFilter].icon}</span>
                </button>
                <SearchBar value={search} onChange={setSearch} placeholder="Search inventory…" />
                {/* Details panel toggle on mobile */}
                <button onClick={() => setShowFinancials(!showFinancials)} title="Toggle Financials"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 shrink-0">
                    <span className="text-xs font-bold">{showFinancials ? '$' : '***'}</span>
                </button>
                {selectedItem && (
                    <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} title="Toggle details"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 lg:hidden shrink-0">
                        <svg className="w-3.5 h-3.5"><use href="#layout-sidebar-right" /></svg>
                    </button>
                )}
            </div>
        </>
    );
};

const FinanceBar: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const docs = useAtomValue(financeDataAtom);

    const grandTotal = useMemo(() => docs.reduce((a, b) => a + (b.amount || 0), 0), [docs]);
    const paid = useMemo(() => docs.filter((d: any) => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0), [docs]);
    const pending = grandTotal - paid;

    const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <>
            <ModuleBadge icon="credit-card" label="Payments" color="#A78BFA" />

            <div className="flex items-center gap-6 ml-6 mr-4 border-l border-white/10 pl-6 h-8">
                <div className="flex flex-col justify-center">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-none mb-1">Total Expenses</span>
                    <span className="text-xs font-mono font-black text-white leading-none">{fmt(grandTotal)}</span>
                </div>
                <div className="flex flex-col justify-center">
                    <span className="text-[8px] font-black text-green-400/20 uppercase tracking-[0.2em] leading-none mb-1">Disbursed</span>
                    <span className="text-xs font-mono font-black text-green-400 leading-none">{fmt(paid)}</span>
                </div>
                <div className="flex flex-col justify-center">
                    <span className="text-[8px] font-black text-yellow-400/20 uppercase tracking-[0.2em] leading-none mb-1">Pending</span>
                    <span className="text-xs font-mono font-black text-yellow-500 leading-none">{fmt(pending)}</span>
                </div>
            </div>

            <div className="flex items-center gap-4 ml-auto">
                <div className="flex flex-col items-end mr-4">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">Pending USD</span>
                    <span className="text-xs font-mono font-black text-(--main-color) leading-none">${(pending / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
            </div>
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

// ─── MAIN HEADER ─────────────────────────────────────────────────────────────

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
        <div className="h-14 flex items-center px-4 shrink-0 transition-colors delay-100 flex-nowrap w-full relative z-10 border-b border-white/5 bg-(--main-header-bg)">
            {/* Logo / sidebar toggle */}
            <button className="flex items-center gap-2 pr-3 sm:pr-4 sm:border-r border-white/10 mr-2 sm:mr-3 shrink-0" onClick={toggleSidebar}>
                <OnyxLogo className="w-7 h-7 sm:w-8 sm:h-8" />
                <span className="text-[9px] sm:text-[10px] font-black text-white/20 tracking-tighter mt-4 ml-[-8px]">v{__APP_VERSION__}</span>
            </button>

            {/* Dynamic module bar — grows to fill available space */}
            <div className="flex-1 flex items-center gap-2 sm:gap-3 overflow-x-hidden overflow-y-visible min-w-0">
                {activeView === 'inventory' && <InventoryBar />}
                {activeView === 'finance' && <FinanceBar />}
                {activeView === 'logistics' && <LogisticsBar />}
                {activeView === 'upload' && <UploadBar />}
                {activeView === 'control' && <ControlBar />}
                {activeView === 'dashboard' && (
                    <>
                        <ModuleBadge icon="layout-grid" label="Dashboard" color="#6BCEBB" />
                        <div className="ml-auto">
                            <span className="text-[9px] font-black text-white/15 uppercase tracking-widest">Admin Overview</span>
                        </div>
                    </>
                )}
                {(activeView === 'create' || !activeView) && (
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Onyx.mx</span>
                )}
            </div>

            {/* User Info & Actions */}
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-white/5 shrink-0">
                <div className="hidden lg:flex flex-col items-end">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-0.5">Welcome back,</span>
                    <span className="text-[11px] font-black text-white leading-none capitalize">
                        {(user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
                            ? user.name
                            : user?.email?.split('@')[0] || 'User'}
                    </span>
                </div>

                {UserIcon && (
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                        <UserIcon className="w-full h-full" />
                    </div>
                )}

                <div className="flex items-center gap-1 relative">
                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                        <Settings size={15} strokeWidth={2} className={`transition-transform duration-300 ${isSettingsOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {isSettingsOpen && (
                        <div className="absolute top-10 right-0 w-64 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 flex flex-col gap-4 z-50">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#6BCEBB]">Settings</span>
                                <button onClick={() => setIsSettingsOpen(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button onClick={() => setLanguage(l => l === 'en' ? 'es' : 'en')} className="flex items-center gap-3 text-sm text-white/80 hover:text-white transition-colors text-left">
                                    <Globe size={16} strokeWidth={2} />
                                    <span className="flex-1 shrink-0 whitespace-nowrap overflow-hidden text-ellipsis w-24">Language</span>
                                    <span className="text-[10px] uppercase font-bold bg-white/10 px-2 py-0.5 rounded">{language}</span>
                                </button>

                                <button onClick={() => setPerformanceMode(!performanceMode)} className={`flex items-center gap-3 text-sm transition-colors text-left ${performanceMode ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`}>
                                    <Zap size={16} strokeWidth={2} />
                                    <span className="flex-1 shrink-0 whitespace-nowrap overflow-hidden text-ellipsis w-10">Performance Mode</span>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${performanceMode ? 'bg-yellow-400/20 text-yellow-500' : 'bg-white/10 text-white/50'}`}>{performanceMode ? 'ON' : 'OFF'}</span>
                                </button>

                                <button onClick={handleRefresh} className="flex items-center gap-3 text-sm text-white/80 hover:text-white transition-colors text-left w-full">
                                    <RefreshCw size={16} strokeWidth={2} />
                                    <span className="flex-1">Refresh Sync</span>
                                </button>
                            </div>

                            <div className="border-t border-white/10 pt-3">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 block">Theme</span>
                                <div className="grid grid-cols-6 gap-2">
                                    {themes.map(th => (
                                        <button key={th.name} onClick={() => setTheme(th.name)}
                                            className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 border border-white/10 ${theme === th.name ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : ''}`}
                                            style={{ background: th.gradient }} title={th.name} />
                                    ))}
                                </div>
                            </div>

                            <div className="border-t border-white/10 pt-3">
                                <button onClick={logout} className="flex items-center gap-3 text-sm text-red-400 hover:text-red-300 transition-colors w-full text-left">
                                    <LogOut size={16} strokeWidth={2} />
                                    <span className="flex-1">Logout Session</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
