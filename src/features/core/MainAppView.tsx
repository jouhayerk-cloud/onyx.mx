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
import {
    activeViewAtom,
    createViewActiveTabAtom,
    logisticsSubTabAtom,
    financeSubTabAtom,
    is3DViewerOpenAtom,
    is3DWorkspaceOpenAtom,
    isEditingMaskAtom,
    performanceModeAtom,
    themeAtom,
    userAtom,
    workflowStepAtom,
    activeSubMenuAtom,
    catalogMarketViewModeAtom,
    languageAtom,
    sidebarStateAtom,
    SidebarState,
} from '../../lib/atoms';
import React, { useEffect } from 'react';
import {
    Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
    ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard
} from 'lucide-react';
// import { ThreeDViewer, ThreeDWorkspace } from '../threed/ThreeDView';
import { MainHeader } from './MainHeader';
import { Content } from '../../components/Content';
import { ExtraModeControls } from '../create/ExtraModeControls';
import { UploadView } from '../upload/UploadView';
import { ControlView } from '../control/ControlView';
import { useLogout, useTranslation } from '../../lib/hooks';
import { BatchActionsModal } from '../catalog/BatchActionsModal';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';
import { InventoryView } from '../inventory/InventoryView';
import { LogisticsView } from '../logistics/LogisticsView';
import { FinanceView } from '../finance/FinanceView';
import { UploadWizard } from '../inventory/UploadWizard';
import { AdminDashboard } from '../dashboard/AdminDashboard';
import { ClientOverview } from '../dashboard/ClientOverview';
import { StoreView } from '../store/StoreView';

// Injected at build time from package.json via vite.config.ts
declare const __APP_VERSION__: string;

interface NavItemWithSubmenuProps {
    viewId: string;
    label: string;
    icon: string;
    subItems: {
        id: string;
        label: string;
        action: () => void;
        isActive: boolean;
        icon: string;
    }[];
}

const NavItemWithSubmenu: React.FC<NavItemWithSubmenuProps> = ({ viewId, label, icon, subItems }) => {
    const [activeView] = useAtom(activeViewAtom);
    const [activeSubMenu, setActiveSubMenu] = useAtom(activeSubMenuAtom);
    const sidebarState = useAtomValue(sidebarStateAtom);

    const isOpen = activeSubMenu === viewId;
    const isParentActive = activeView === viewId;

    // Map icon string to Lucide component
    const IconMap: Record<string, React.FC<any>> = { truck: Truck, package: Package, 'map-pin': MapPin };
    const NavIcon = IconMap[icon] || Truck;

    const handleToggle = () => {
        setActiveSubMenu(isOpen ? null : viewId);
    };

    return (
        <>
            <li className={`sidebar-list-item ${isParentActive ? 'active' : ''} ${isOpen ? 'open' : ''}`} onClick={handleToggle}>
                <div className="sidebar-list-item-main">
                    <NavIcon size={20} strokeWidth={1.75} />
                    <span className="sidebar-list-item-text">{label}</span>
                </div>
                <ChevronRight size={14} strokeWidth={2} className={`chevron transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                {/* Tooltip for compact mode */}
                <span className="sidebar-compact-tooltip">{label}</span>
                {/* Pop-out submenu for compact mode */}
                {sidebarState === 'compact' && (
                    <ul className="sidebar-submenu">
                        {subItems.map(item => {
                            const SubIcon = IconMap[item.icon] || Package;
                            return (
                                <li key={item.id}>
                                    <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
                                        <SubIcon size={15} strokeWidth={1.75} className="submenu-icon" />
                                        <span>{item.label}</span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </li>
            {/* Standard slide-down submenu */}
            {sidebarState !== 'compact' && (
                <ul className="sidebar-submenu">
                    {subItems.map(item => {
                        const SubIcon = IconMap[item.icon] || Package;
                        return (
                            <li key={item.id}>
                                <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
                                    <SubIcon size={15} strokeWidth={1.75} className="submenu-icon" />
                                    <span>{item.label}</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
};




export function MainAppView() {
    const t = useTranslation();
    const [user] = useAtom(userAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const workflowStep = useAtomValue(workflowStepAtom);
    const isEditingMask = useAtomValue(isEditingMaskAtom);
    const is3DViewerOpen = useAtomValue(is3DViewerOpenAtom);
    const [is3DWorkspaceOpen, setIs3DWorkspaceOpen] = useAtom(is3DWorkspaceOpenAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
    const setWorkflowStep = useSetAtom(workflowStepAtom);
    const [logisticsSubTab, setLogisticsSubTab] = useAtom(logisticsSubTabAtom);
    const [financeSubTab, setFinanceSubTab] = useAtom(financeSubTabAtom);

    const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;


    useEffect(() => {
        const handleResize = () => {
            // If window becomes mobile size and sidebar is not already hidden, hide it.
            if (window.innerWidth <= 768) {
                setSidebarState(current => {
                    if (current !== 'hidden') {
                        return 'hidden';
                    }
                    return current;
                });
            }
        };
        window.addEventListener('resize', handleResize);
        // Initial check is removed to prevent auto-hiding on load.
        return () => window.removeEventListener('resize', handleResize);
    }, [setSidebarState]);

    const pageContent = (() => {
        if (isEditingMask || workflowStep === 'fullscreenEdit') {
            return (
                <div className="flex flex-col grow overflow-hidden h-full">
                    <div className="flex grow flex-col overflow-hidden relative">
                        <Content />
                    </div>
                    <ExtraModeControls />
                </div>
            );
        }

        switch (activeView) {
            case 'control': return <ControlView />;
            case 'dashboard': return <AdminDashboard />;
            case 'overview': return <ClientOverview />;
            case 'upload': return <UploadView />;
            case 'inventory': return <InventoryView />;
            case 'logistics': return <LogisticsView />;
            case 'finance': return <FinanceView />;
            case 'store': return <StoreView />;
            default:
                return <InventoryView />;
        }
    })();

    const uploadSubItems = [
        {
            id: 'upload-wizard', label: 'Create', icon: 'upload', isActive: activeView === 'upload', action: () => {
                setActiveView('upload');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        }
    ];


    const logisticsSubItems = [
        {
            id: 'packing', label: 'Packing', icon: 'package', isActive: activeView === 'logistics' && logisticsSubTab === 'packing', action: () => {
                setActiveView('logistics');
                setLogisticsSubTab('packing');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'trucking', label: 'Trucking', icon: 'truck', isActive: activeView === 'logistics' && logisticsSubTab === 'trucking', action: () => {
                setActiveView('logistics');
                setLogisticsSubTab('trucking');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'shipping', label: 'Shipping', icon: 'map-pin', isActive: activeView === 'logistics' && logisticsSubTab === 'shipping', action: () => {
                setActiveView('logistics');
                setLogisticsSubTab('shipping');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
    ];

    const financeSubItems = [
        {
            id: 'payments', label: 'Payments', icon: 'credit-card', isActive: activeView === 'finance' && financeSubTab === 'payments', action: () => {
                setActiveView('finance');
                setFinanceSubTab('payments');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'expenses', label: 'Expenses', icon: 'layers', isActive: activeView === 'finance' && financeSubTab === 'expenses', action: () => {
                setActiveView('finance');
                setFinanceSubTab('expenses');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
    ];

    const handleSidebarStateToggle = () => {
        setSidebarState(current => {
            const states: SidebarState[] = ['expanded', 'compact', 'hidden'];
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                return current === 'hidden' ? 'expanded' : 'hidden';
            }
            const currentIndex = states.indexOf(current);
            const nextIndex = (currentIndex + 1) % states.length;
            return states[nextIndex];
        });
    };

    return (
        <>
            {/* Sidebar FAB — only visible when sidebar is hidden */}
            {sidebarState === 'hidden' && (
                <button
                    className="sidebar-fab"
                    onClick={() => setSidebarState('expanded')}
                    title="Open Navigation"
                >
                    <OnyxMiniLogo className="w-6 h-6" />
                </button>
            )}

            <div className={`app-container sidebar-${sidebarState}`}>
                <div className="sidebar">
                    <div className="sidebar-header">
                        <div className="sidebar-logo">
                            {/* Logo: full in expanded, mini icon in compact, nothing in hidden (FAB handles that) */}
                            {sidebarState === 'expanded' && <OnyxLogo className="w-10 h-10" />}
                            {sidebarState === 'compact' && <OnyxMiniLogo className="w-8 h-8" />}
                            {sidebarState === 'expanded' && (
                                <span className="sidebar-logo-text">Onyx.mx</span>
                            )}
                        </div>
                        {/* Toggle: arrow to collapse/hide */}
                        {sidebarState !== 'hidden' && (
                            <button className="sidebar-state-toggle" onClick={handleSidebarStateToggle} title="Toggle Sidebar">
                                <ArrowLeft size={18} strokeWidth={2} className={`transition-transform duration-300 ${sidebarState === 'compact' ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                    <ul className="sidebar-list">
                        {user?.role === 'Developer' && (
                            <li className={`sidebar-list-item ${activeView === 'control' ? 'active' : ''}`} onClick={() => { setActiveView('control'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Shield size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Control Center</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Control Center</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <li className={`sidebar-list-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveView('dashboard'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <BarChart3 size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Dashboard</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Dashboard</span>
                            </li>
                        )}
                        <li className={`sidebar-list-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => { setActiveView('overview'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                            <div className="sidebar-list-item-main">
                                <LayoutDashboard size={20} strokeWidth={1.75} />
                                <span className="sidebar-list-item-text">Overview</span>
                            </div>
                            <span className="sidebar-compact-tooltip">Overview</span>
                        </li>
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor') && (
                            <li className={`sidebar-list-item ${activeView === 'upload' ? 'active' : ''}`} onClick={() => { setActiveView('upload'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Upload size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Add Entry</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Add Entry</span>
                            </li>
                        )}
                        <li className={`sidebar-list-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveView('inventory'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                            <div className="sidebar-list-item-main">
                                <Store size={20} strokeWidth={1.75} />
                                <span className="sidebar-list-item-text">Inventory</span>
                            </div>
                            <span className="sidebar-compact-tooltip">Inventory</span>
                        </li>
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'finance' ? 'active' : ''}`} onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <CreditCard size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Payments</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Payments</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'store' ? 'active' : ''}`} onClick={() => { setActiveView('store'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Store size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Store</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Store</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenu viewId="logistics" label="Logistics" icon="truck" subItems={logisticsSubItems} />
                        )}
                    </ul>

                    {/* Branding at bottom of sidebar */}
                    <div className="mt-auto flex flex-col items-center justify-center p-4 border-t border-(--border-color) opacity-60 shrink-0 relative overflow-hidden">
                        {sidebarState === 'expanded' && (
                            <>
                                <OnyxMiniLogo className="w-7 h-7 mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-[0.3em] font-mono leading-none text-(--text-color-secondary)">v{__APP_VERSION__}</span>
                            </>
                        )}
                        {sidebarState === 'compact' && (
                            <>
                                <OnyxMiniLogo className="w-6 h-6 mb-2" />
                                <span className="text-[7px] font-black uppercase tracking-[0.2em] font-mono leading-none text-(--text-color-secondary)">{__APP_VERSION__}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="app-content">
                    <MainHeader />
                    <main className="grow min-h-0 relative">
                        {pageContent}
                    </main>
                </div>
            </div>

            {/* is3DViewerOpen && <ThreeDViewer /> */}
            {/* is3DWorkspaceOpen && <ThreeDWorkspace /> */}

            <BatchActionsModal />
            <UploadWizard />
        </>
    );
}