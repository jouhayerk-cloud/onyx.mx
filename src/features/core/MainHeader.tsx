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
    inventorySubTabAtom,
    dashboardStatusFilterAtom,
    dashboardSearchTermAtom,
    userAtom,
    isDetailsPanelOpenAtom,
    SelectedItemDataAtom,
    TrafficLightStatus,
    logisticsSubTabAtom,
    financeSubTabAtom,
    uploadTabAtom,
    shippingCameraViewAtom,
    shippingCratesAtom,
    shippingTruckDimsAtom,
    truckMaxWeightAtom,
    shippingViewModeAtom,
    sidebarStateAtom,
    triggerWarehouseOrganizationAtom,
    exchangeRateAtom,
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useTranslation } from '../../lib/hooks';
import { CameraView } from '../../lib/Types';
import { OnyxLogo } from '../../components/OnyxLogo';

// Injected at build time from package.json via vite.config.ts
declare const __APP_VERSION__: string;

// ─── Types ───────────────────────────────────────────────────────────────────
const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const filterConfig: Record<TrafficLightStatus, { icon: string; title: string }> = {
    ALL: { icon: '#filter-all', title: 'All items' },
    RED: { icon: '#filter-red', title: 'Approved, pending payment' },
    YELLOW: { icon: '#filter-yellow', title: 'Payment requested, unpaid' },
    GREEN: { icon: '#filter-green', title: 'Paid / shipped' },
};

// ─── Search bar (shared) ──────────────────────────────────────────────────────
const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className={`flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl transition-all duration-300 ${expanded ? 'w-52 px-3' : 'w-9 justify-center cursor-pointer hover:bg-white/[0.08]'} h-9 overflow-hidden`}
            onClick={() => !expanded && setExpanded(true)}
        >
            <svg className="w-4 h-4 text-white/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {expanded && (
                <>
                    <input autoFocus className="flex-1 bg-transparent text-xs text-white outline-none placeholder-white/25 min-w-0"
                        value={value} onChange={e => onChange(e.target.value)}
                        onBlur={() => !value && setExpanded(false)}
                        placeholder={placeholder} />
                    {value && (
                        <button onClick={() => onChange('')} className="text-white/30 hover:text-white/70 transition-colors text-xs">✕</button>
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
        {tabs.map(t => (
            <button key={t.id} onClick={() => onSelect(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200
                    ${active === t.id ? 'text-black shadow-lg scale-[1.03]' : 'bg-white/[0.05] text-white/35 hover:text-white/70 hover:bg-white/[0.09]'}`}
                style={active === t.id ? { backgroundColor: accentColor } : {}}>
                {t.icon && <svg className="w-3 h-3"><use href={t.icon} /></svg>}
                {t.label}
            </button>
        ))}
    </div>
);

// ─── Module badge ─────────────────────────────────────────────────────────────
const ModuleBadge: React.FC<{ emoji: string; label: string; color: string }> = ({ emoji, label, color }) => (
    <div className="flex items-center gap-1.5 pr-4 border-r border-white/[0.07] shrink-0">
        <span className="text-base">{emoji}</span>
        <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color }}>{label}</span>
    </div>
);

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
                <div className="w-16 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                    <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}% wt</span>
            </div>
            <div className="flex items-center gap-1">
                <div className="w-16 h-1 bg-white/[0.08] rounded-full overflow-hidden">
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
    const [subTab, setSubTab] = useAtom(inventorySubTabAtom);
    const [search, setSearch] = useAtom(inventorySearchTermAtom);
    const [statusFilter, setStatusFilter] = useAtom(dashboardStatusFilterAtom);
    const [inventoryFilter, setInventoryFilter] = useAtom(inventoryActiveFilterAtom);
    const inventory = useAtomValue(inventoryAtom);
    const [isDetailsOpen, setIsDetailsOpen] = useAtom(isDetailsPanelOpenAtom);
    const selectedItem = useAtomValue(SelectedItemDataAtom);
    const user = useAtomValue(userAtom);

    const tabs = [
        { id: 'catalog', label: t.catalog || 'Catalog', icon: '#camera' },
        { id: 'production', label: 'Production', icon: '#layers' },
        { id: 'acquisitions', label: t.acquisitions || 'Acquired', icon: '#archive' },
        { id: 'archive', label: 'Archive', icon: '#package' },
    ];

    const vendorIds = useMemo(() => {
        const ids = new Set(inventory.map(i => i.data.itemId));
        return ['All', ...Array.from(ids).sort()];
    }, [inventory]);

    const cycleFilter = () => {
        const i = filterCycle.indexOf(statusFilter);
        setStatusFilter(filterCycle[(i + 1) % filterCycle.length]);
    };

    return (
        <>
            <ModuleBadge emoji="📦" label="Inventory" color="#6BCEBB" />
            <SubTabPills tabs={tabs} active={subTab} onSelect={id => setSubTab(id as typeof subTab)} accentColor="#6BCEBB" />
            <div className="flex items-center gap-2 ml-auto">
                {/* Admin vendor filter chips */}
                {user?.role !== 'Client' && vendorIds.length > 2 && (
                    <div className="hidden md:flex items-center gap-1 overflow-x-auto max-w-[200px]">
                        {vendorIds.slice(0, 5).map(id => (
                            <button key={id} onClick={() => setInventoryFilter(id)}
                                className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all border ${inventoryFilter === id ? 'border-[#6BCEBB] bg-[#6BCEBB]/10 text-[#6BCEBB]' : 'border-white/10 text-white/30 hover:text-white/60'}`}>
                                {id}
                            </button>
                        ))}
                    </div>
                )}
                {/* Traffic light filter */}
                <button onClick={cycleFilter} title={filterConfig[statusFilter].title}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] transition-colors border border-white/[0.08]">
                    <svg className="w-4 h-4"><use href={filterConfig[statusFilter].icon} /></svg>
                </button>
                <SearchBar value={search} onChange={setSearch} placeholder="Search inventory…" />
                {/* Details panel toggle on mobile */}
                {selectedItem && (
                    <button onClick={() => setIsDetailsOpen(!isDetailsOpen)} title="Toggle details"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] lg:hidden">
                        <svg className="w-4 h-4"><use href="#layout-sidebar-right" /></svg>
                    </button>
                )}
            </div>
        </>
    );
};

const FinanceBar: React.FC = () => {
    const [subTab, setSubTab] = useAtom(financeSubTabAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);

    const tabs = [
        { id: 'payments', label: 'Payments', icon: '#credit-card' },
        { id: 'expenses', label: 'Expenses', icon: '#layers' },
    ];

    return (
        <>
            <ModuleBadge emoji="💳" label="Finance" color="#00AEEF" />
            <SubTabPills tabs={tabs} active={subTab} onSelect={id => setSubTab(id as typeof subTab)} accentColor="#00AEEF" />
            <div className="ml-auto flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                    <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Exchange</span>
                    <span className="text-xs font-mono font-black text-white/40">1 USD = {exchangeRate.toFixed(2)} MXN</span>
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

    const tabs = [
        { id: 'packing', label: 'Packing', icon: '#package' },
        { id: 'trucking', label: 'Trucking', icon: '#truck' },
        { id: 'shipping', label: t.shipping || 'Shipping', icon: '#map-pin' },
    ];

    const cameraViews: CameraView[] = ['perspective', 'top', 'side', 'front'];

    return (
        <>
            <ModuleBadge emoji="🚚" label="Logistics" color="#F7941D" />
            <SubTabPills tabs={tabs} active={subTab} onSelect={id => setSubTab(id as typeof subTab)} accentColor="#F7941D" />

            {subTab === 'shipping' && (
                <div className="hidden md:flex items-center gap-2 ml-2">
                    {/* Warehouse organise */}
                    <button onClick={() => setTriggerOrg(v => v + 1)} title="Organise warehouse"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-colors">
                        <svg className="w-4 h-4"><use href="#layout-grid" /></svg>
                    </button>
                    {/* View mode */}
                    <div className="flex items-center gap-0.5 bg-white/[0.05] border border-white/[0.08] rounded-lg p-0.5">
                        {(['warehouse', 'truck'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === m ? 'bg-[#F7941D] text-black' : 'text-white/35 hover:text-white/70'}`}>
                                {m}
                            </button>
                        ))}
                    </div>
                    {/* Camera view */}
                    <div className="flex items-center gap-0.5 bg-white/[0.05] border border-white/[0.08] rounded-lg p-0.5">
                        {cameraViews.map(v => (
                            <button key={v} onClick={() => setCameraView(v)}
                                className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${cameraView === v ? 'bg-[#F7941D] text-black' : 'text-white/35 hover:text-white/70'}`}>
                                {v.slice(0, 3)}
                            </button>
                        ))}
                    </div>
                    {/* Max weight */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/30 font-black uppercase tracking-widest whitespace-nowrap">Max kg</span>
                        <input type="number" value={maxWeight} onChange={e => setMaxWeight(Number(e.target.value))}
                            className="w-16 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-xs font-mono text-white/70 focus:outline-none focus:border-[#F7941D]/50" />
                    </div>
                </div>
            )}

            <div className="ml-auto">
                {subTab === 'shipping' && <ShippingStats />}
            </div>
        </>
    );
};

const UploadBar: React.FC = () => {
    const tab = useAtomValue(uploadTabAtom);
    return (
        <>
            <ModuleBadge emoji="⬆" label="Upload" color="#8DC63F" />
            <div className="flex items-center gap-1">
                <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                    ${tab === 'entry' ? 'bg-[#8DC63F] text-black' : 'text-white/25'}`}>
                    ✚ Entry
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                    ${tab === 'ai' ? 'bg-[var(--main-color)] text-black' : 'text-white/25'}`}>
                    ✨ AI Tools
                </span>
            </div>

        </>
    );
};

const ControlBar: React.FC = () => (
    <>
        <ModuleBadge emoji="🛡" label="Control Center" color="#a78bfa" />
        <div className="ml-auto">
            <span className="text-[9px] font-black text-white/15 uppercase tracking-widest">Developer Only</span>
        </div>
    </>
);

// ─── MAIN HEADER ─────────────────────────────────────────────────────────────

export function MainHeader() {
    const [activeView] = useAtom(activeViewAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);

    const toggleSidebar = () => setSidebarState(cur => cur === 'hidden' ? 'expanded' : 'hidden');

    return (
        <div className="main-header">
            {/* Logo / sidebar toggle */}
            <button className="sidebar-toggle flex items-center gap-2 pr-4 border-r border-white/[0.07] mr-3 shrink-0" onClick={toggleSidebar}>
                <OnyxLogo className="w-8 h-8" />
                <span className="text-[10px] font-black text-white/20 tracking-tighter mt-4 ml-[-8px]">v{__APP_VERSION__}</span>
            </button>

            {/* Dynamic module bar — grows to fill available space */}
            <div className="flex-1 flex items-center gap-3 overflow-hidden min-w-0">
                {activeView === 'inventory' && <InventoryBar />}
                {activeView === 'finance' && <FinanceBar />}
                {activeView === 'logistics' && <LogisticsBar />}
                {activeView === 'upload' && <UploadBar />}
                {activeView === 'control' && <ControlBar />}
                {(activeView === 'create' || !activeView) && (
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Onyx.mx</span>
                )}
            </div>
        </div>
    );
}