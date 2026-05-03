import React, { useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
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
    isInventoryVendorFilterOpenAtom,
    isInventoryCategoryFilterOpenAtom,
    isInventoryMaterialFilterOpenAtom,
    isInventorySearchOpenAtom,
    inventorySearchTermAtom,
    isUploadWizardOpenAtom,
    isPaymentsSearchOpenAtom,
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
    liveExchangeRateAtom
} from '../../lib/atoms';
import { 
    Layers, SlidersHorizontal, Filter, SquareCheckBig, Tag, Box, ChevronRight, X, Search, ArrowUpDown, Plus, DollarSign, Minimize2, Maximize2, Cpu, Calendar, Activity, Archive, Users, LayoutGrid, LayoutList, Layout, ChevronUp, ChevronDown, Activity as Heartbeat, Wallet, ShoppingCart, Package, Hammer, FlaskConical, Truck, ArrowUp, ArrowDown
} from 'lucide-react';
import { vendors } from '../../lib/consts';
import { destinationsConfig } from '../../lib/paymentConfig';

// ── Components ───────────────────────────────────────────────────────────────

const ActiveRequestGridItem: React.FC<{
    label: string;
    amount: number;
    color: string;
    type: string;
    onClick: () => void;
}> = ({ label, amount, color, type, onClick }) => {
    const isMerch = type?.toLowerCase().includes('acq') || type?.toLowerCase().includes('prod');
    const Icon = isMerch ? ShoppingCart : Package;

    return (
        <div 
            onClick={onClick}
            className="flex flex-col justify-between p-4 h-28 cursor-pointer transition-all hover:brightness-110 active:scale-95 shadow-lg group relative overflow-hidden backdrop-blur-md border border-white/10"
            style={{ backgroundColor: `${color}40` }}
        >
            <div className="flex items-start justify-between">
                <span className="text-[12px] font-black text-white/60 uppercase tracking-[0.2em] truncate max-w-[80%]">{label}</span>
                <Icon size={16} className="text-white/40" />
            </div>
            
            <div className="flex flex-col">
                <span className="text-[32px] font-black text-white leading-none tracking-tighter">${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mt-2 truncate">{type || 'General'}</span>
            </div>

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
    onClick: () => void;
}> = ({ label, amount, color, type, onClick }) => (
    <div 
        onClick={onClick}
        className="flex flex-col justify-center p-4 h-20 cursor-pointer transition-all hover:brightness-125 active:scale-95 shadow-lg group relative overflow-hidden backdrop-blur-md border border-white/10"
        style={{ backgroundColor: `${color}30` }}
    >
        <div className="flex items-baseline justify-between gap-2">
            <span className="text-[24px] font-black text-white leading-none tracking-tighter">${Math.round(amount/1000)}k</span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{label}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{type}</span>
        </div>
        
        {/* Selection indicator overlay */}
        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="text-black/40" />
        </div>
    </div>
);

const SectionHeader: React.FC<{
    icon: any;
    title: string;
    count?: number;
    amount?: number;
    isOpen: boolean;
    onToggle: () => void;
    minimal?: boolean;
}> = ({ icon: Icon, title, count, amount, isOpen, onToggle, minimal }) => (
    <div className={`flex items-center justify-between transition-all group cursor-pointer ${minimal ? 'px-4 py-3' : 'px-4 py-4 hover:bg-white/5 rounded-2xl'}`} onClick={onToggle}>
        <div className="flex items-center gap-6">
            {/* Free floating icon (no container) */}
            <div className={`transition-all duration-500 ${isOpen ? 'text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.8)]' : 'text-white/20'}`}>
                <Icon size={minimal ? 20 : 28} strokeWidth={3} />
            </div>
            <div className="flex flex-col gap-0.5">
                <span className={`${minimal ? 'text-[11px]' : 'text-[16px]'} font-black text-white uppercase tracking-[0.3em]`}>{title}</span>
                {!minimal && (
                    <div className="flex items-center gap-4">
                        {count !== undefined && <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{count} UNITS</span>}
                        {amount !== undefined && (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em]">${amount.toLocaleString('en-US')} MXN</span>
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

// ── Main Component ───────────────────────────────────────────────────────────

export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const [selectedIds] = useAtom(selectedInventoryIdsAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    
    // Inventory States
    const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
    const [invMode, setInvMode] = useAtom(inventoryViewModeAtom);
    const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
    const [invSearchTerm, setInvSearchTerm] = useAtom(inventorySearchTermAtom);
    const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    
    // Finance States
    const [isFinSearchOpen, setIsFinSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
    const [finSearchTerm, setFinSearchTerm] = useAtom(financeSearchTermAtom);
    const [isFinFiltersOpen, setIsFinFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
    const [isFinActionOpen, setIsFinActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
    const [isFinQueueOpen, setIsFinQueueOpen] = useAtom(isPaymentQueueOpenAtom);
    const [isFinUpcomingOpen, setIsFinUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
    const [isFinPendingBarOpen, setIsFinPendingBarOpen] = useAtom(isPaymentPendingBarOpenAtom);
    
    const [finStatusFilter, setFinStatusFilter] = useAtom(paymentStatusFilterAtom);
    const [finCategoryFilter, setFinCategoryFilter] = useAtom(paymentCategoryFilterAtom);
    const [finDestFilter, setFinDestFilter] = useAtom(paymentDestinationFilterAtom);
    const [finOverviewMode, setFinOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
    const isFinanceScrolled = useAtomValue(isFinanceScrolledAtom);
    const financeTotals = useAtomValue(financeTotalsAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const liveEx = useAtomValue(liveExchangeRateAtom);
    const fixedEx = useAtomValue(exchangeRateAtom);
    const exRate = liveEx || fixedEx;

    // Derived Finance Data
    const activeQueueRecords = useMemo(() => 
        financeDocs.filter(r => r.status === 'Requested'), 
    [financeDocs]);

    const activeQueueTotal = useMemo(() => 
        activeQueueRecords.reduce((s, r) => s + (r.amount || 0) + (r.commission || 0), 0),
    [activeQueueRecords]);

    // Inventory Atoms for Filtering
    const inventoryItems = useAtomValue(inventoryAtom);
    const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [invCategoryFilter, setInvCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [invMaterialFilter, setInvMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [invSortKey, setInvSortKey] = useAtom(inventorySortKeyAtom);
    const [invSortOrder, setInvSortOrder] = useAtom(inventorySortOrderAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    
    if (!activeView) return null;

    const isInventory = activeView === 'inventory';
    const isFinance = activeView === 'finance';

    if (!isInventory && !isFinance) return null;

    return (
        <div className="flex flex-col w-full z-50">
            {/* ── TOP BAR (SEARCH/SLIDERS) ────────────────────────────────────────────────────────── */}
            {((isInventory && (isInvSearchOpen || isInvViewSliderOpen)) || (isFinance && isFinSearchOpen)) && (
                <div className="w-full border-t border-white/5 animate-in slide-in-from-top duration-500 overflow-hidden pr-4 pl-4">
                    <div className="w-full mx-auto px-6 py-3 flex flex-col gap-4">
                        {isInventory && isInvSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all">
                                <Search size={24} strokeWidth={3} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder="SEARCH INVENTORY..." className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {invSearchTerm && <button onClick={() => setInvSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={24} strokeWidth={3} /></button>}
                            </div>
                        )}
                        {isInventory && isInvViewSliderOpen && (
                            <div className="flex items-center gap-10 animate-in slide-in-from-top-4 duration-500">
                                {/* UNIFIED VIEW SLIDER */}
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2 text-zinc-500 shrink-0 w-8 h-8 justify-center relative overflow-hidden">
                                        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out" style={{ 
                                            opacity: invMode === 'list' ? 1 : 0,
                                            transform: `scale(${invMode === 'list' ? 1 : 0.5}) rotate(${invMode === 'list' ? 0 : -90}deg)`
                                        }}>
                                            <LayoutList size={20} strokeWidth={3} className="text-white" />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out" style={{ 
                                            opacity: invMode === 'grid' ? 1 : 0,
                                            transform: `scale(${invMode === 'grid' ? 1 : 0.5})`
                                        }}>
                                            <LayoutGrid size={20} strokeWidth={3} className="text-white" />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out" style={{ 
                                            opacity: invMode === 'gallery' ? 1 : 0,
                                            transform: `scale(${invMode === 'gallery' ? 1 : 0.5}) rotate(${invMode === 'gallery' ? 0 : 90}deg)`
                                        }}>
                                            <Layout size={20} strokeWidth={3} className="text-white" />
                                        </div>
                                    </div>
                                    <div className="relative flex items-center group">
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="6" 
                                            step="1" 
                                            value={invSlider} 
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setInvSlider(val);
                                                if (val <= 2) setInvMode('list');
                                                else if (val <= 4) setInvMode('grid');
                                                else setInvMode('gallery');
                                            }}
                                            className="w-48 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white transition-all hover:bg-white/20"
                                        />
                                    </div>
                                </div>

                                <div className="w-px h-6 bg-white/10 shrink-0" />

                                {/* SORTING CONTROLS */}
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2 text-zinc-500 uppercase font-black text-[10px] tracking-widest shrink-0">
                                        <ArrowUpDown size={16} />
                                        <span>SORT BY</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {[
                                            { key: 'Date', label: 'DATE' },
                                            { key: 'Vendor', label: 'VENDOR' },
                                            { key: 'Status', label: 'STATUS' },
                                            { key: 'Number', label: 'NUM' },
                                            { key: 'Value', label: 'VALUE' },
                                            { key: 'Qty', label: 'QTY' }
                                        ].map(sort => (
                                            <button 
                                                key={sort.key} 
                                                onClick={() => {
                                                    if (invSortKey === sort.key) setInvSortOrder(invSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setInvSortKey(sort.key as any); setInvSortOrder('desc'); }
                                                }}
                                                className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all font-black text-[10px] tracking-wider ${invSortKey === sort.key ? 'bg-white text-black' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}
                                            >
                                                {sort.label}
                                                {invSortKey === sort.key && (
                                                    invSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={4} /> : <ArrowDown size={12} strokeWidth={4} />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {isFinance && isFinSearchOpen && (
                            <div className="flex items-center gap-6 group transition-all">
                                <Search size={24} strokeWidth={3} className="text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder="SEARCH PAYMENTS..." className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none w-full tracking-tight" />
                                {finSearchTerm && <button onClick={() => setFinSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={24} strokeWidth={3} /></button>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── FINANCE TOOLS (CONTINUOUS PANEL STYLE) ─────────────────────────────────────── */}
            {isFinance && (
                <div className="flex flex-col w-full min-h-0 border-t border-white/5">
                    
                    {/* BAR 2: FILTERS (ACCOUNTS/CATEGORIES) */}
                    {isFinFiltersOpen && (
                        <div className={`w-full px-8 py-3 animate-in slide-in-from-top-4 duration-500 flex items-center justify-between gap-8 overflow-x-auto no-scrollbar`}>
                            
                            {/* LEFT: PAYMENT TYPES */}
                            <div className="flex items-center gap-4 shrink-0">
                                {[
                                    { id: 'All', icon: LayoutGrid, color: '#888' },
                                    { id: 'Acq', icon: DollarSign, color: '#10b981' },
                                    { id: 'Prod', icon: Cpu, color: '#6366f1' },
                                    { id: 'Monthly', icon: Calendar, color: '#38bdf8' },
                                    { id: 'Supplies', icon: Box, color: '#f59e0b' },
                                    { id: 'Labor', icon: Users, color: '#ec4899' },
                                    { id: 'Packing', icon: Archive, color: '#a855f7' },
                                    { id: 'Operations', icon: Activity, color: '#ef4444' },
                                    { id: 'Logistics', icon: Truck, color: '#06b6d4' }
                                ].map(s => {
                                    const Icon = s.icon;
                                    const isActive = finCategoryFilter === s.id;
                                    return (
                                        <button key={s.id} onClick={() => setFinCategoryFilter(s.id as any)}
                                            className={`flex flex-col items-center gap-1.5 transition-all shrink-0 ${isActive ? 'scale-110' : 'text-zinc-600 hover:text-white'}`}>
                                            <Icon size={20} strokeWidth={isActive ? 4 : 3} style={{ color: isActive ? 'var(--main-color)' : s.color }} className={isActive ? 'drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]' : ''} />
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isActive ? 'text-white' : 'text-zinc-500'}`}>{s.id}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* DIVIDER */}
                            <div className="w-px h-6 bg-white/5 shrink-0" />

                            {/* RIGHT: DESTINATION ACCOUNTS */}
                            <div className="flex items-center gap-5 shrink-0">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                    <button key={key} onClick={() => setFinDestFilter(finDestFilter === key ? 'All' : key as any)}
                                        className={`flex flex-col items-center gap-1 transition-all shrink-0 ${finDestFilter === key ? 'scale-110 grayscale-0 brightness-100' : 'grayscale brightness-50 hover:grayscale-0 hover:brightness-100'}`}>
                                        <img src={cfg.icon} alt={cfg.name} className="w-9 h-4.5 object-contain" />
                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${finDestFilter === key ? 'text-white' : 'text-zinc-500'}`}>{cfg.name.split(' ')[0]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* BAR 3: ACTIVE REQUEST QUEUE */}
                    {isFinActionOpen && (
                        <div className="w-full border-t border-white/5 px-8 py-4 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                            <SectionHeader 
                                icon={Heartbeat} 
                                title="Active Request Queue" 
                                count={activeQueueRecords.length}
                                amount={activeQueueTotal}
                                isOpen={isFinQueueOpen}
                                onToggle={() => setIsFinQueueOpen(!isFinQueueOpen)}
                            />
                            {isFinQueueOpen && (
                                <div className={`grid gap-1 overflow-hidden transition-all duration-500 ${activeQueueRecords.length === 0 ? 'grid-cols-1 opacity-10' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
                                    {activeQueueRecords.length === 0 ? (
                                        <div className="py-6 text-center border border-white/5 rounded-2xl">
                                            <span className="text-[11px] font-black uppercase tracking-[0.6em]">QUEUE EMPTY</span>
                                        </div>
                                    ) : (
                                        activeQueueRecords.map(r => {
                                            const v = r.vendor_id || 'Unknown';
                                            const color = vendors[v as keyof typeof vendors]?.color || '#888';
                                            return (
                                                <ActiveRequestGridItem 
                                                    key={r.id}
                                                    label={r.description || v}
                                                    amount={r.amount}
                                                    color={color}
                                                    type={r.subcategory}
                                                    onClick={() => setPaymentsArtifactConfig({ isOpen: true, paymentIds: [r.id], title: `Detail: ${v}` })}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* BAR 4: UPCOMING PAYMENTS */}
                    {isFinActionOpen && (
                        <div className="w-full border-t border-white/5 px-8 py-4 animate-in slide-in-from-top-4 duration-700 overflow-hidden">
                            <SectionHeader 
                                icon={Wallet} 
                                title="Upcoming Payments" 
                                isOpen={isFinUpcomingOpen}
                                onToggle={() => setIsFinUpcomingOpen(!isFinUpcomingOpen)}
                                minimal
                            />
                            {isFinUpcomingOpen && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1 overflow-hidden">
                                    {financeTotals.pendingGroups.length === 0 ? (
                                        <div className="col-span-full py-6 text-center opacity-10 border border-white/5 rounded-xl">
                                            <span className="text-[11px] font-black uppercase tracking-[0.6em]">NO UPCOMING ITEMS</span>
                                        </div>
                                    ) : (
                                        financeTotals.pendingGroups.map(g => {
                                            const color = vendors[g.vendorId as keyof typeof vendors]?.color || '#888';
                                            const remaining = g.total - g.paidTotal;
                                            return (
                                                <UpcomingGridItem 
                                                    key={`${g.vendorId}-${g.type}`}
                                                    label={g.vendorId}
                                                    amount={remaining}
                                                    color={color}
                                                    type={g.type}
                                                    onClick={() => setPaymentsArtifactConfig({ isOpen: true, vendor: g.vendorId, title: `Liquidation: ${g.vendorId}` })}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* ── INVENTORY TOOLS (INDEPENDENT CONTROL BARS) ─────────────────────────────────────────── */}
            {isInventory && isInvFiltersOpen && (
                <div className="flex flex-col w-full min-h-0 border-t border-white/5">
                    
                    {/* STATUS FILTERS BAR */}
                    <div className="w-full px-6 py-3 flex items-center gap-5 overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-5 shrink-0">
                            {[
                                { id: 'All', icon: LayoutGrid, color: '#FFFFFF' },
                                { id: 'New', icon: Plus, color: '#38bdf8' },
                                { id: 'Production', icon: Hammer, color: '#6366f1' },
                                { id: 'Acquired', icon: Tag, color: '#10b981' },
                                { id: 'Partial', icon: FlaskConical, color: '#a855f7' },
                                { id: 'Requested', icon: Activity, color: '#f59e0b' },
                                { id: 'Paid', icon: DollarSign, color: '#10b981' }
                            ].map(s => {
                                const Icon = s.icon;
                                const isActive = invStatusFilter === s.id;
                                return (
                                    <button key={s.id} onClick={() => setInvStatusFilter(s.id as any)}
                                        className={`flex flex-col items-center gap-1 transition-all shrink-0 ${isActive ? 'scale-110' : 'text-zinc-600 hover:text-white'}`}
                                        style={{ color: isActive ? s.color : undefined }}>
                                        <Icon size={18} strokeWidth={isActive ? 4 : 3} className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''} />
                                        <span className={`text-[8px] font-black uppercase tracking-wider ${isActive ? 'text-white' : 'text-zinc-500'}`}>{s.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* VENDOR FILTERS BAR (COMPACT VERTICAL STACK) */}
                    <div className="w-full border-t border-white/5 px-6 py-3 flex items-center gap-6 overflow-x-auto no-scrollbar animate-in slide-in-from-top-4 duration-700">
                        <button onClick={() => setInvVendorFilter(['All'])} 
                            className={`text-[10px] font-black uppercase transition-all shrink-0 ${invVendorFilter.includes('All') ? 'text-white' : 'text-zinc-600 hover:text-white'}`}>
                            ALL<br/>VENDORS
                        </button>
                        <div className="w-px h-6 bg-white/10 shrink-0" />
                        <div className="flex items-center gap-6 shrink-0 py-1">
                            {activeVendors.map(v => {
                                const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                                const isExplicitlyActive = invVendorFilter.includes(v);
                                const isAllActive = invVendorFilter.includes('All');
                                const isActive = isExplicitlyActive || isAllActive;
                                
                                return (
                                    <button key={v} onClick={() => setInvVendorFilter(isExplicitlyActive ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])} 
                                        className={`flex flex-col items-center gap-1.5 transition-all shrink-0 ${isActive ? 'scale-110 brightness-125' : 'grayscale brightness-50 hover:grayscale-0 hover:brightness-100'}`}
                                        style={{ color: isActive ? vendorColor : '#52525b' }}>
                                        <div className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_15px_-5px_rgba(255,255,255,0.3)]" style={{ backgroundColor: vendorColor }} />
                                        <span className="text-[10px] font-black uppercase tracking-tight">{v}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};