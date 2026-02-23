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
    is3DViewerOpenAtom,
    is3DWorkspaceOpenAtom,
    isEditingMaskAtom,
    performanceModeAtom,
    themeAtom,
    userAtom,
    workflowStepAtom,
    activeSubMenuAtom,
    catalogMarketViewModeAtom,
    dashboardActiveTabAtom,
    languageAtom,
    sidebarStateAtom,
    SidebarState,
} from '../../lib/atoms';
import React, { useEffect } from 'react';
import { Dashboard } from '../dashboard/Dashboard';
import { ThreeDViewer, ThreeDWorkspace } from '../threed/ThreeDView';
import { CatalogMarketView } from '../catalog/CatalogMarketView';
import { MainHeader } from './MainHeader';
import { Content } from '../../components/Content';
import { ExtraModeControls } from '../create/ExtraModeControls';
import { CreateView } from '../create/CreateView';
import { useLogout, useTranslation } from '../../lib/hooks';
import { BatchActionsModal } from '../catalog/BatchActionsModal';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';
import { WorkbookView } from '../workbook/WorkbookView';

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

    const handleToggle = () => {
        setActiveSubMenu(isOpen ? null : viewId);
    };

    return (
        <>
            <li className={`sidebar-list-item ${isParentActive ? 'active' : ''} ${isOpen ? 'open' : ''}`} onClick={handleToggle}>
                <div className="sidebar-list-item-main">
                    <svg><use href={`#${icon}`}></use></svg>
                    <span className="sidebar-list-item-text">{label}</span>
                </div>
                <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                {/* Pop-out submenu for compact mode */}
                {sidebarState === 'compact' && (
                    <ul className="sidebar-submenu">
                        {subItems.map(item => (
                            <li key={item.id}>
                                <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
                                    <svg className="submenu-icon"><use href={`#${item.icon}`}></use></svg>
                                    <span>{item.label}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </li>
            {/* Standard slide-down submenu */}
            {sidebarState !== 'compact' && (
                <ul className="sidebar-submenu">
                    {subItems.map(item => (
                        <li key={item.id}>
                            <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
                                <svg className="submenu-icon"><use href={`#${item.icon}`}></use></svg>
                                <span>{item.label}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
};


const themes = [
    { name: 'concrete', gradient: 'linear-gradient(135deg, #434343, #343434, #2e2e2e)' },
    { name: 'nacar', gradient: 'linear-gradient(135deg, #dbe2e1, #bfc6c1, #babaab)' },
    { name: 'orange', gradient: 'linear-gradient(135deg, #d4cec6, #b39172, #95623a)' },
    { name: 'cherry', gradient: 'linear-gradient(135deg, #e7d8d7, #adbcc3, #90a2ac)' },
    { name: 'forest', gradient: 'linear-gradient(135deg, #c2c4bd, #606654, #2a3025)' },
    { name: 'terra', gradient: 'linear-gradient(135deg, #a2927f, #824f35, #53382e)' },
    { name: 'calcite', gradient: 'linear-gradient(135deg, #ade6f5, #79a7c6, #5c7b8d)' },
    { name: 'fluorite', gradient: 'linear-gradient(135deg, #b5cbf4, #818ecf, #666e94)' },
];

export function MainAppView() {
    const t = useTranslation();
    const [user] = useAtom(userAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const workflowStep = useAtomValue(workflowStepAtom);
    const isEditingMask = useAtomValue(isEditingMaskAtom);
    const is3DViewerOpen = useAtomValue(is3DViewerOpenAtom);
    const [is3DWorkspaceOpen, setIs3DWorkspaceOpen] = useAtom(is3DWorkspaceOpenAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
    const logout = useLogout();
    const [performanceMode, setPerformanceMode] = useAtom(performanceModeAtom);
    const [language, setLanguage] = useAtom(languageAtom);

    const [createTab, setCreateTab] = useAtom(createViewActiveTabAtom);
    const setWorkflowStep = useSetAtom(workflowStepAtom);
    const setTheme = useSetAtom(themeAtom);
    const [mode, setMode] = useAtom(catalogMarketViewModeAtom);
    const [dashboardTab, setDashboardTab] = useAtom(dashboardActiveTabAtom);

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

    const toggleLanguage = () => {
        setLanguage(lang => lang === 'en' ? 'es' : 'en');
    };

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
            case 'create': return <CreateView />;
            case 'dashboard': return <Dashboard />;
            case 'workbook': return <WorkbookView />;
            case 'catalog':
            default:
                return <CatalogMarketView />;
        }
    })();

    const createSubItems = [
        {
            id: 'new', label: t.newFastEntry, icon: 'layout-grid', isActive: createTab === 'new' && workflowStep === 'fastEntry', action: () => {
                setActiveView('create');
                setCreateTab('new');
                setWorkflowStep('fastEntry');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'batchEntry', label: t.batchEntry, icon: 'archive', isActive: createTab === 'batchEntry', action: () => {
                setActiveView('create');
                setCreateTab('batchEntry');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'videoBatch', label: t.videoBatch, icon: 'file-plus', isActive: createTab === 'videoBatch', action: () => {
                setActiveView('create');
                setCreateTab('videoBatch');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
    ];

    const catalogSubItems = [
        {
            id: 'inventory', label: t.inventory, icon: 'package', isActive: activeView === 'catalog' && mode === 'catalog', action: () => {
                setActiveView('catalog');
                setMode('catalog');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'market', label: t.market, icon: 'store', isActive: activeView === 'catalog' && mode === 'market', action: () => {
                setActiveView('catalog');
                setMode('market');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
    ];

    const dashboardSubItems = [
        {
            id: 'acquisitions', label: t.acquisitions, icon: 'archive', isActive: activeView === 'dashboard' && dashboardTab === 'acquisitions', action: () => {
                setActiveView('dashboard');
                setDashboardTab('acquisitions');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'payments', label: t.payments, icon: 'credit-card', isActive: activeView === 'dashboard' && dashboardTab === 'payments', action: () => {
                setActiveView('dashboard');
                setDashboardTab('payments');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
        {
            id: 'shipping', label: t.shipping, icon: 'truck', isActive: activeView === 'dashboard' && dashboardTab === 'shipping', action: () => {
                setActiveView('dashboard');
                setDashboardTab('shipping');
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
            <div className={`app-container sidebar-${sidebarState}`}>
                <div className="sidebar">
                    <div className="sidebar-header">
                        <div className="sidebar-logo">
                            {sidebarState === 'compact' ? <OnyxMiniLogo /> : <OnyxLogo />}
                            <span className="sidebar-logo-text">Onyx.mx</span>
                        </div>
                        <button className="sidebar-state-toggle" onClick={handleSidebarStateToggle} title="Toggle Sidebar">
                            {sidebarState === 'hidden' ?
                                <OnyxMiniLogo className="w-6 h-6 text-[var(--text-color)]" /> :
                                <svg className="w-6 h-6"><use href="#arrow-left"></use></svg>
                            }
                        </button>
                    </div>
                    <ul className="sidebar-list">
                        {user?.role !== 'Client' && (
                            <NavItemWithSubmenu viewId="create" label={t.create} icon="plus" subItems={createSubItems} />
                        )}
                        <NavItemWithSubmenu viewId="catalog" label={t.catalog} icon="camera" subItems={catalogSubItems} />
                        <NavItemWithSubmenu viewId="workbook" label="Workbook" icon="dashboard-icon" subItems={[{ id: 'overview', label: 'Overview', icon: 'dashboard-icon', action: () => { setActiveView('workbook'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'workbook' }]} />
                        {user?.role !== 'Vendor' && (
                            <NavItemWithSubmenu viewId="dashboard" label={t.dashboard} icon="dashboard-icon" subItems={dashboardSubItems} />
                        )}
                    </ul>
                    <div className="sidebar-footer">
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={toggleLanguage} className="button !p-2 !min-h-0 !bg-transparent border border-white/20" title={t.language}>
                                <span className="w-5 h-5 font-bold text-sm flex items-center justify-center">{language.toUpperCase()}</span>
                            </button>
                            <nav className="menu">
                                <input type="checkbox" className="menu-open" name="menu-open" id="menu-open" />
                                <label className="menu-open-button !bg-transparent border border-white/20" htmlFor="menu-open">
                                    <svg className="w-5 h-5 text-white"><use href="#palette"></use></svg>
                                </label>
                                {themes.map((theme) => (
                                    <button
                                        key={theme.name}
                                        className="menu-item"
                                        style={{ background: theme.gradient }}
                                        onClick={() => setTheme(theme.name)}
                                        title={theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
                                    />
                                ))}
                            </nav>
                            <button
                                onClick={() => setPerformanceMode(!performanceMode)}
                                className={`button !p-2 !min-h-0 !bg-transparent border ${performanceMode ? 'border-yellow-400' : 'border-white/20'}`}
                                title={performanceMode ? t.perfModeOn : t.perfModeOff}
                            >
                                <svg className={`w-5 h-5 transition-colors ${performanceMode ? 'text-yellow-400' : 'text-white'}`}>
                                    <use href="#zap"></use>
                                </svg>
                            </button>
                            {UserIcon && (
                                <button onClick={logout} className="button !p-0 !min-h-0 !bg-transparent !border-none rounded-full w-8 h-8 overflow-hidden" title={t.logout}>
                                    <UserIcon className="w-full h-full" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="app-content">
                    <MainHeader />
                    <main className="flex-grow min-h-0 relative">
                        {pageContent}
                    </main>
                </div>
            </div>

            {is3DViewerOpen && <ThreeDViewer />}
            {is3DWorkspaceOpen && <ThreeDWorkspace />}

            <BatchActionsModal />
        </>
    );
}