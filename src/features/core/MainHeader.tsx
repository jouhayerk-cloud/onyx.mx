/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useMemo, useState, useEffect } from 'react';
import {
    activeViewAtom,
    isDashboardStatsVisibleAtom,
    dashboardSearchTermAtom,
    inventoryAtom,
    inventoryActiveFilterAtom,
    inventorySearchTermAtom,
    dashboardStatusFilterAtom,
    userAtom,
    isDetailsPanelOpenAtom,
    SelectedItemDataAtom,
    TrafficLightStatus,
    dashboardActiveTabAtom,
    paymentsVersionAtom,
    paymentDestinationFilterAtom,
    shippingCameraViewAtom,
    shippingCratesAtom,
    shippingTruckDimsAtom,
    truckMaxWeightAtom,
    shippingViewModeAtom,
    sidebarStateAtom,
    triggerWarehouseOrganizationAtom,
    workbookSearchTermAtom,
    workbookActiveTabAtom,
    workbookVersionAtom,
    workbookAtom
} from '../../lib/atoms';
import { vendors, SCRIPT_URL, WORKBOOK_TABS } from '../../lib/consts';
import { useTranslation } from '../../lib/hooks';
// FIX: Import CameraView from Types.tsx instead of atoms.tsx to fix module resolution error.
import { CameraView, Expense, ExpenseStatus } from '../../lib/Types';
import { OnyxLogo } from '../../components/OnyxLogo';

const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
const filterConfig: Record<TrafficLightStatus, { icon: string, title: string }> = {
    'ALL': { icon: '#filter-all', title: 'Filter: All Items' },
    'RED': { icon: '#filter-red', title: 'Filter: Approved, Pending Payment Request' },
    'YELLOW': { icon: '#filter-yellow', title: 'Filter: Payment Requested, Unpaid' },
    'GREEN': { icon: '#filter-green', title: 'Filter: Paid / Shipped' },
};

const formatCurrency = (amount: number, currency: 'MXN' | 'USD') => new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', { style: 'currency', currency }).format(amount || 0);

const SummaryCard = ({ title, amount, colorClass }: { title: string, amount: number, colorClass: string }) => (
    <div className="text-right">
        <p className="text-xs text-[var(--text-color-secondary)] uppercase font-semibold">{title}</p>
        <p className={`text-lg font-bold font-mono ${colorClass}`}>{formatCurrency(amount, 'MXN')}</p>
    </div>
);

const ShippingStats = () => {
    const crates = useAtomValue(shippingCratesAtom);
    const truckDims = useAtomValue(shippingTruckDimsAtom);
    const maxWeight = useAtomValue(truckMaxWeightAtom);

    const { loadedCrates, totalWeight, volumeUsed, centerOfMass } = useMemo(() => {
        const loaded = crates.filter(c => c.location === 'truck');
        const weight = loaded.reduce((sum, c) => sum + c.weight, 0);
        const usedVolume = loaded.reduce((sum, c) => sum + (c.w * c.h * c.d), 0);
        const truckVolume = truckDims.length * truckDims.width * truckDims.height;
        const volPercent = truckVolume > 0 ? (usedVolume / truckVolume) * 100 : 0;

        // Center of mass calculation (x-axis for L/R balance)
        const weightedSumX = loaded.reduce((sum, c) => sum + c.x * c.weight, 0);
        const comX = weight > 0 ? weightedSumX / weight : 0;

        return { loadedCrates: loaded, totalWeight: weight, volumeUsed: volPercent, centerOfMass: comX };
    }, [crates, truckDims]);

    const balancePercent = (centerOfMass / (truckDims.length / 2) + 1) * 50;

    return (
        <div className="hidden md:flex items-center gap-4 text-xs font-mono">
            <span>Crates: <span className="font-bold text-[var(--text-color-primary)]">{loadedCrates.length}</span></span>
            <div className="flex flex-col items-center">
                <span>Weight: <span className="font-bold text-[var(--text-color-primary)]">{totalWeight.toFixed(0)}</span> / {maxWeight} kg</span>
                <progress className="w-24 h-1" value={totalWeight} max={maxWeight}></progress>
            </div>
            <div className="flex flex-col items-center">
                <span>L/R Balance</span>
                <div className="w-24 h-2 bg-gray-700 rounded-full relative">
                    <div className="absolute top-0 h-full bg-blue-400 rounded-full" style={{ left: `${Math.min(100, Math.max(0, balancePercent))}%`, width: '2px', transform: 'translateX(-50%)' }}></div>
                </div>
            </div>
        </div>
    );
};


export function MainHeader() {
    const t = useTranslation();
    const [user] = useAtom(userAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);

    const [isStatsVisible, setIsStatsVisible] = useAtom(isDashboardStatsVisibleAtom);
    const [dashboardSearch, setDashboardSearch] = useAtom(dashboardSearchTermAtom);
    const inventory = useAtomValue(inventoryAtom);
    const [inventorySearch, setInventorySearch] = useAtom(inventorySearchTermAtom);
    const [inventoryFilter, setInventoryFilter] = useAtom(inventoryActiveFilterAtom);
    const [statusFilter, setStatusFilter] = useAtom(dashboardStatusFilterAtom);

    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useAtom(isDetailsPanelOpenAtom);
    const selectedItemData = useAtomValue(SelectedItemDataAtom);
    const [activeView] = useAtom(activeViewAtom);
    const [dashboardTab] = useAtom(dashboardActiveTabAtom);
    const destinationFilter = useAtomValue(paymentDestinationFilterAtom);

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [paymentsVersion] = useAtom(paymentsVersionAtom);

    const [cameraView, setCameraView] = useAtom(shippingCameraViewAtom);
    const [viewMode, setViewMode] = useAtom(shippingViewModeAtom);
    const [maxWeight, setMaxWeight] = useAtom(truckMaxWeightAtom);
    const setTriggerOrganization = useSetAtom(triggerWarehouseOrganizationAtom);


    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [workbookActiveTab, setWorkbookActiveTab] = useAtom(workbookActiveTabAtom);
    const [workbookVersion, setWorkbookVersion] = useAtom(workbookVersionAtom);
    const setWorkbook = useSetAtom(workbookAtom);

    useEffect(() => {
        async function fetchExpenses() {
            try {
                const response = await fetch(SCRIPT_URL, {
                    method: 'POST', body: JSON.stringify({ action: 'getExpenses', user }),
                });
                const result = await response.json();
                if (result.status === 'success') {
                    setExpenses(result.data);
                }
            } catch (error) { }
        }
        fetchExpenses();
    }, [paymentsVersion, user]);

    const summary = useMemo(() => {
        const filteredExpenses = destinationFilter === 'All'
            ? expenses
            : expenses.filter(e => e.destination === destinationFilter);

        const inventoryDue = destinationFilter === 'All'
            ? inventory.filter(i => i.data.status === 'YES' && !i.data.payReq).reduce((sum, item) => sum + (parseFloat(item.data.price) || 0), 0)
            : 0;

        const expensesDue = filteredExpenses.filter(e => e.status === ExpenseStatus.Requested).reduce((sum, e) => sum + e.totalAmount, 0);
        const totalDue = inventoryDue + expensesDue;

        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const paidThisMonth = filteredExpenses
            .filter(e => e.status === ExpenseStatus.Paid && e.paymentDate && new Date(e.paymentDate) >= firstDayOfMonth)
            .reduce((sum, e) => sum + e.totalAmount, 0);

        return { totalDue, paidThisMonth };
    }, [inventory, expenses, destinationFilter]);

    const vendorIdsInInventory = useMemo(() => {
        if (inventory.length === 0) return [];
        const ids = new Set(inventory.map((item) => item.data.itemId));
        return ['All', ...Array.from(ids).sort()];
    }, [inventory]);

    const [workbookSearch, setWorkbookSearch] = useAtom(workbookSearchTermAtom);

    const isCatalog = activeView === 'inventory';
    const isDashboard = activeView === 'finance' || activeView === 'logistics';
    const isWorkbook = activeView === 'finance' || activeView === 'logistics' || activeView === 'inventory';

    const searchTerm = isCatalog ? inventorySearch : isDashboard ? dashboardSearch : isWorkbook ? workbookSearch : '';
    const setSearchTerm = isCatalog ? setInventorySearch : isDashboard ? setDashboardSearch : isWorkbook ? setWorkbookSearch : () => { };
    const searchPlaceholder = isCatalog ? t.searchInventory : isDashboard ? t.searchAcquisitions : isWorkbook ? 'Search Workbook...' : t.search;

    const handleCycleFilter = () => {
        const currentIndex = filterCycle.indexOf(statusFilter);
        const nextIndex = (currentIndex + 1) % filterCycle.length;
        setStatusFilter(filterCycle[nextIndex]);
    };

    const toggleSidebar = () => {
        setSidebarState(current => (current === 'hidden' ? 'expanded' : 'hidden'));
    };

    return (
        <div className="main-header">
            <button className="sidebar-toggle flex items-center gap-2 pr-4 border-r border-white/5 mr-2" onClick={toggleSidebar}>
                <OnyxLogo className="w-8 h-8" />
                <span className="text-[10px] font-black text-white/20 tracking-tighter mt-4 ml-[-8px]">v2.5.6</span>
            </button>

            <div className={`search-wrapper transition-all duration-300 ease-in-out ${isSearchExpanded ? '!max-w-md w-full' : '!max-w-[40px] cursor-pointer'}`}
                onClick={() => !isSearchExpanded && setIsSearchExpanded(true)}
            >
                <svg
                    className={`search-icon ${!isSearchExpanded ? 'mx-auto' : ''}`}
                    xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {isSearchExpanded ? (
                    <div className="flex items-center w-full">
                        <input
                            className="search-input !flex-grow"
                            type="text"
                            autoFocus
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onBlur={() => !searchTerm && setIsSearchExpanded(false)}
                            placeholder={searchPlaceholder}
                        />
                        <button
                            className="ml-2 p-1 hover:bg-white/10 rounded-full transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsSearchExpanded(false);
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                ) : null}
            </div>



            <div className="flex-grow flex justify-end items-center gap-6">
                {isDashboard && dashboardTab === 'payments' && (
                    <div className="hidden md:flex items-center gap-6">
                        <SummaryCard title="Total Due" amount={summary.totalDue} colorClass="text-amber-400" />
                        <SummaryCard title="Paid This Month" amount={summary.paidThisMonth} colorClass="text-green-400" />
                    </div>
                )}
                {isDashboard && dashboardTab === 'shipping' && (
                    <>
                        <div className="hidden md:flex items-center gap-2">
                            <button onClick={() => setTriggerOrganization(v => v + 1)} className="button !p-2 !min-h-0" title="Organize Warehouse">
                                <svg className="w-5 h-5"><use href="#layout-grid"></use></svg>
                            </button>
                            <div className="shipping-view-toggle">
                                <button onClick={() => setViewMode('warehouse')} className={viewMode === 'warehouse' ? 'active' : ''}>{t.warehouse}</button>
                                <button onClick={() => setViewMode('truck')} className={viewMode === 'truck' ? 'active' : ''}>{t.truck}</button>
                            </div>
                            <div className="dashboard-tabs !p-0 !bg-transparent !border-none">
                                {(['perspective', 'top', 'side', 'front'] as CameraView[]).map(view => (
                                    <button key={view} onClick={() => setCameraView(view)} className={`tab-button ${cameraView === view ? 'active' : ''}`}>
                                        {view.charAt(0).toUpperCase() + view.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold whitespace-nowrap">{t.maxWeight}:</label>
                                <input type="number" value={maxWeight} onChange={e => setMaxWeight(Number(e.target.value))} className="!rounded-md !w-24 !py-1 text-xs" />
                            </div>
                        </div>
                        <ShippingStats />
                    </>
                )}

                <div className="flex gap-3 items-center justify-end">
                    {activeView === 'inventory' && dashboardTab === 'acquisitions' && (
                        <div className="flex gap-2 items-center">
                            <button onClick={() => setIsStatsVisible(!isStatsVisible)} className="button !p-2 !min-h-0" title={isStatsVisible ? 'Hide Stats Panel' : 'Show Stats Panel'}>
                                <svg className="w-5 h-5"><use href={isStatsVisible ? '#eye-off' : '#eye'}></use></svg>
                            </button>
                            <button
                                onClick={handleCycleFilter}
                                className="button !p-2 !min-h-0 flex items-center justify-center"
                                title={filterConfig[statusFilter].title} >
                                <svg className="w-5 h-5"><use href={filterConfig[statusFilter].icon}></use></svg>
                            </button>
                        </div>
                    )}

                    {user?.role === 'Admin' && activeView === 'inventory' && vendorIdsInInventory.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {vendorIdsInInventory.map((id: string) => (
                                <button key={id} onClick={() => setInventoryFilter(id)} className={`px-3 py-1 text-xs font-semibold rounded-full transition-all border border-transparent ${inventoryFilter === id ? '!border-[var(--main-color)] bg-black/20' : 'opacity-70 hover:opacity-100'}`}
                                    style={{ flexShrink: 0 }}>
                                    {id === 'All' ? t.all : id}
                                </button>
                            ))}
                        </div>
                    )}
                    {activeView === 'inventory' && selectedItemData && (
                        <button
                            onClick={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}
                            className="button !p-2 !min-h-0 lg:hidden"
                            title={isDetailsPanelOpen ? 'Hide Details' : 'Show Details'}
                        >
                            <svg className="w-5 h-5"><use href="#layout-sidebar-right"></use></svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}