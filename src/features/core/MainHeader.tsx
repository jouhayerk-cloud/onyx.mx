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
    performanceModeAtom,
    paymentsOverviewModeAtom,
    paymentDestinationFilterAtom,
    liveExchangeRateAtom
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

// Search component is inline in InventoryBar

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
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [devStatusFilter, setDevStatusFilter] = useAtom(dashboardStatusFilterAtom);

    return (
        <div className="flex flex-1 items-center gap-4 ml-2">
            <Store size={22} strokeWidth={1.75} color="#6BCEBB" className="shrink-0 hidden sm:block" />

            <div className="flex-1 w-full relative group/search max-w-3xl mx-auto">
                {/* Large liquid glass search bar */}
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Search size={18} strokeWidth={2} className="text-white/40 group-focus-within/search:text-[#6BCEBB] transition-colors" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search inventory entirely..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-10 text-sm text-white outline-none placeholder-white/25 focus:bg-white/10 focus:border-white/20 transition-all shadow-lg backdrop-blur-md"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/30 hover:text-white/70 transition-colors">
                        <X size={16} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => {
                    const statuses = ['ALL', 'RED', 'YELLOW', 'GREEN'] as const;
                    setDevStatusFilter(statuses[(statuses.indexOf(devStatusFilter) + 1) % statuses.length]);
                }} title={filterConfig[devStatusFilter].title}
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10 shrink-0 shadow-lg cursor-pointer">
                    <span className={`text-base leading-none ${devStatusFilter === 'RED' ? 'text-red-500' :
                        devStatusFilter === 'YELLOW' ? 'text-yellow-500' :
                            devStatusFilter === 'GREEN' ? 'text-green-500' :
                                'text-white/20'
                        }`}>{filterConfig[devStatusFilter].icon}</span>
                </button>
            </div>
        </div>
    );
};

const FinanceBar: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const docs = useAtomValue(financeDataAtom);
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const destinationFilter = useAtomValue(paymentDestinationFilterAtom);

    const grandTotal = useMemo(() => docs.reduce((a, b) => a + (b.amount || 0), 0), [docs]);
    const paid = useMemo(() => docs.filter((d: any) => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0), [docs]);
    const pending = grandTotal - paid;

    const activeDestPendingRecords = useMemo(() => {
        return destinationFilter !== 'All'
            ? docs.filter(d => d.destination === destinationFilter && (d.status === 'Requested' || !d.status))
            : [];
    }, [docs, destinationFilter]);

    const activeDestReqNetMXN = useMemo(() => {
        return activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
    }, [activeDestPendingRecords]);

    const activeDestReqNetUSD = activeDestReqNetMXN / (liveExchangeRate || exchangeRate);

    const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <div className="flex flex-1 items-center gap-4 ml-2 relative">
            <CreditCard size={22} strokeWidth={1.75} color="#A78BFA" className="shrink-0 hidden sm:block" />

            {overviewMode === 'collapsed' && (
                <button onClick={() => setOverviewMode('extended')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 transition-all text-[10px] font-black uppercase tracking-widest">
                    Show Overview
                </button>
            )}

            {/* Dynamic Pending Net Total for Active Destination (Centered) */}
            {overviewMode === 'collapsed' && destinationFilter !== 'All' && activeDestReqNetMXN > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 bg-(--main-color)/10 border border-(--main-color)/30 rounded-xl animate-in fade-in zoom-in-95 shrink-0 shadow-inner z-10 pointer-events-auto">
                    <span className="text-[9px] font-black text-(--main-color) uppercase tracking-[0.2em]">
                        PENDING REQ
                    </span>
                    <div className="h-4 w-px bg-(--main-color)/20" />
                    <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-mono font-black text-(--text-color)">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(activeDestReqNetMXN)}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-(--main-color)/70">
                            ≈ ${activeDestReqNetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
                        </span>
                    </div>
                </div>
            )}
        </div>
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
        <div className="h-16 flex items-center px-4 shrink-0 transition-colors delay-100 flex-nowrap w-full relative z-10 border-b border-white/5 bg-(--main-header-bg)">

            {/* Mobile Sidebar toggle if needed, or simply let FAB handle it mostly, but good to have a simple button here */}
            {sidebarState !== 'expanded' && (
                <button className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 mr-2 sm:mr-3 shrink-0 lg:hidden" onClick={toggleSidebar}>
                    <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
            )}

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
                    <Settings size={18} strokeWidth={1.75}
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`cursor-pointer text-white/40 hover:text-white/80 transition-all duration-300 ${isSettingsOpen ? 'rotate-90 text-[#6BCEBB]' : ''}`} />
                    {isSettingsOpen && (
                        <>
                            {/* Backdrop */}
                            <div className="fixed inset-0 z-[99]" onClick={() => setIsSettingsOpen(false)} />
                            {/* Panel */}
                            <div className="absolute top-12 right-0 w-72 bg-[#0d0d1a]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-5 flex flex-col gap-5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">

                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[#6BCEBB]">Settings</span>
                                    <button onClick={() => setIsSettingsOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/30 hover:text-white transition-all">
                                        <X size={12} />
                                    </button>
                                </div>

                                {/* Language */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Language</span>
                                    <button onClick={() => setLanguage(l => l === 'en' ? 'es' : 'en')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all group">
                                        <Globe size={15} strokeWidth={1.75} className="text-white/40 group-hover:text-white/70 transition-colors" />
                                        <span className="flex-1 text-xs font-bold text-white/70">Display Language</span>
                                        <span className="text-[10px] uppercase font-black bg-white/10 px-2.5 py-1 rounded-lg text-white/60">{language === 'en' ? 'EN' : 'ES'}</span>
                                    </button>
                                </div>

                                {/* Appearance — Theme + Performance */}
                                <div className="flex flex-col gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Appearance</span>
                                    <div className="grid grid-cols-6 gap-2">
                                        {themes.map(th => (
                                            <button key={th.name} onClick={() => setTheme(th.name)}
                                                className={`w-8 h-8 rounded-xl cursor-pointer transition-all hover:scale-110 border ${theme === th.name ? 'border-[#6BCEBB] ring-2 ring-[#6BCEBB]/30 scale-110 shadow-lg' : 'border-white/10 hover:border-white/20'}`}
                                                style={{ background: th.gradient }} title={th.name} />
                                        ))}
                                    </div>
                                    <button onClick={() => setPerformanceMode(!performanceMode)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all group mt-1">
                                        <Zap size={15} strokeWidth={1.75} className={`transition-colors ${performanceMode ? 'text-yellow-400' : 'text-white/40 group-hover:text-white/70'}`} />
                                        <span className="flex-1 text-xs font-bold text-white/70">Performance Mode</span>
                                        <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg transition-colors ${performanceMode ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/10 text-white/40'}`}>{performanceMode ? 'ON' : 'OFF'}</span>
                                    </button>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Actions</span>
                                    <button onClick={handleRefresh} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all group">
                                        <RefreshCw size={15} strokeWidth={1.75} className="text-white/40 group-hover:text-white/70 transition-colors" />
                                        <span className="flex-1 text-xs font-bold text-white/70 text-left">Refresh Sync</span>
                                    </button>
                                    <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all group">
                                        <LogOut size={15} strokeWidth={1.75} className="text-red-400/60 group-hover:text-red-400 transition-colors" />
                                        <span className="flex-1 text-xs font-bold text-red-400/70 group-hover:text-red-400 text-left transition-colors">Logout Session</span>
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
