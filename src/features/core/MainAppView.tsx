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
    { name: 'obsidian', gradient: 'linear-gradient(135deg, #1a1a24, #212130, #2a2a3d)' },
    { name: 'midnight', gradient: 'linear-gradient(135deg, #17102e, #211942, #2d235c)' },
    { name: 'forest-night', gradient: 'linear-gradient(135deg, #0f1c16, #162a21, #1c382b)' },
    { name: 'snow', gradient: 'linear-gradient(135deg, #f2f5f9, #e6ebf2, #d9e1ec)' },
    { name: 'sand', gradient: 'linear-gradient(135deg, #faf6f0, #f2ece1, #e8ded1)' },
    { name: 'sky', gradient: 'linear-gradient(135deg, #f0f7ff, #e0f2fe, #bae6fd)' },
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
            case 'control': return <ControlView />;
            case 'upload': return <UploadView />;
            case 'inventory': return <InventoryView />;
            case 'logistics': return <LogisticsView />;
            case 'finance': return <FinanceView />;
            default:
                return <InventoryView />;
        }
    })();

    const uploadSubItems = [
        {
            id: 'upload-wizard', label: 'Create entry', icon: 'upload', isActive: activeView === 'upload', action: () => {
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
            id: 'shipping', label: t.shipping, icon: 'map-pin', isActive: activeView === 'logistics' && logisticsSubTab === 'shipping', action: () => {
                setActiveView('logistics');
                setLogisticsSubTab('shipping');
                if (window.innerWidth <= 768) setSidebarState('hidden');
            }
        },
    ];

    const financeSubItems = [
        {
            id: 'payments', label: t.payments, icon: 'credit-card', isActive: activeView === 'finance' && financeSubTab === 'payments', action: () => {
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
            <div className={`app-container sidebar-${sidebarState}`}>
                <div className="sidebar">
                    <div className="sidebar-header">
                        <div className="sidebar-logo">
                            {sidebarState === 'compact' ? <OnyxMiniLogo /> : <OnyxLogo />}
                            <span className="sidebar-logo-text">Onyx.mx</span>
                        </div>
                        <button className="sidebar-state-toggle" onClick={handleSidebarStateToggle} title="Toggle Sidebar">
                            {sidebarState === 'hidden' ?
                                <OnyxMiniLogo className="w-6 h-6 text-(--text-color)" /> :
                                <svg className="w-6 h-6"><use href="#arrow-left"></use></svg>
                            }
                        </button>
                    </div>
                    <ul className="sidebar-list">
                        {user?.role === 'Developer' && (
                            <li className={`sidebar-list-item ${activeView === 'control' ? 'active' : ''}`} onClick={() => { setActiveView('control'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <svg><use href="#shield"></use></svg>
                                    <span className="sidebar-list-item-text">Control Center</span>
                                </div>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor') && (
                            <li className={`sidebar-list-item ${activeView === 'upload' ? 'active' : ''}`} onClick={() => { setActiveView('upload'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <svg><use href="#upload"></use></svg>
                                    <span className="sidebar-list-item-text">New</span>
                                </div>
                            </li>
                        )}
                        <li className={`sidebar-list-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveView('inventory'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                            <div className="sidebar-list-item-main">
                                <svg><use href="#package"></use></svg>
                                <span className="sidebar-list-item-text">{t.inventory || 'Inventory'}</span>
                            </div>
                        </li>
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenu viewId="logistics" label="Logistics" icon="truck" subItems={logisticsSubItems} />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenu viewId="finance" label="Finance" icon="credit-card" subItems={financeSubItems} />
                        )}
                    </ul>
                    <div className="sidebar-footer">
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={toggleLanguage} className="button p-2! min-h-0! bg-transparent! border border-white/20" title={t.language}>
                                <span className="w-5 h-5 font-bold text-sm flex items-center justify-center">{language.toUpperCase()}</span>
                            </button>
                            <nav className="menu">
                                <input type="checkbox" className="menu-open" name="menu-open" id="menu-open" />
                                <label className="menu-open-button bg-transparent! border border-white/20" htmlFor="menu-open">
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
                                className={`button p-2! min-h-0! bg-transparent! border ${performanceMode ? 'border-yellow-400' : 'border-white/20'}`}
                                title={performanceMode ? t.perfModeOn : t.perfModeOff}
                            >
                                <svg className={`w-5 h-5 transition-colors ${performanceMode ? 'text-yellow-400' : 'text-white'}`}>
                                    <use href="#zap"></use>
                                </svg>
                            </button>
                            {UserIcon && (
                                <button onClick={logout} className="button p-0! min-h-0! bg-transparent! border-none! rounded-full w-8 h-8 overflow-hidden" title={t.logout}>
                                    <UserIcon className="w-full h-full" />
                                </button>
                            )}
                        </div>
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
        </>
    );
}