
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
    processIsProcessingAtom,
    processActiveStepLabelAtom,
    isDummyModeAtom,
    inventoryArtifactConfigAtom,
    paymentsArtifactConfigAtom,
    universalViewAtom,
    tagIdAtom
} from '../../lib/atoms';
import React, { useEffect, useState } from 'react';
import {
    Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
    ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard, Pipette, Search, Layers
} from 'lucide-react';

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
import { HeroBackground } from '../../components/HeroBackground';
import { UploadWizard } from '../inventory/UploadWizard';
import { AdminDashboard } from '../dashboard/AdminDashboard';
import { ClientOverview } from '../dashboard/ClientOverview';
import { StoreView } from '../store/StoreView';
import { PackingModule } from '../logistics/PackingModule';
import { ProcessView } from '../process/ProcessView';
import { DataSyncProvider } from '../../components/DataSyncProvider';
import { AboutModal } from '../../components/AboutModal';
import { InventoryArtifact } from '../inventory/InventoryArtifact';
import { PaymentsArtifact } from '../finance/PaymentsArtifact';
import { ViewerView } from '../viewer/ViewerView';

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
    const setUniversalView = useSetAtom(universalViewAtom);
    const setTagId = useSetAtom(tagIdAtom);
    const workflowStep = useAtomValue(workflowStepAtom);
    const isEditingMask = useAtomValue(isEditingMaskAtom);
    const [is3DWorkspaceOpen, setIs3DWorkspaceOpen] = useAtom(is3DWorkspaceOpenAtom);
    const sidebarState = useAtomValue(sidebarStateAtom);
    const setSidebarState = useSetAtom(sidebarStateAtom);
    const [logisticsSubTab, setLogisticsSubTab] = useAtom(logisticsSubTabAtom);
    const [financeSubTab, setFinanceSubTab] = useAtom(financeSubTabAtom);
    const [isDummyMode, setIsDummyMode] = useAtom(isDummyModeAtom);
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    
    const setInventoryArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);

    // Deep Link Effect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        let updated = false;

        const artifact = params.get('artifact');
        const ids = params.get('ids');
        const tagid = params.get('tagid');

        if (artifact === 'inventory' && ids) {
            setInventoryArtifactConfig({
                isOpen: true,
                itemIds: ids.split(',').filter(Boolean),
                title: 'Shared Inventory Items'
            });
        } else if (tagid && user) {
            import('../../lib/supabase').then(async ({ supabase }) => {
                const { data } = await supabase.from('inventory').select('id').eq('book_barcode', tagid).maybeSingle();
                if (data) {
                    setInventoryArtifactConfig({
                        isOpen: true,
                        itemIds: [String(data.id)],
                        title: `Item: ${tagid}`
                    });
                }
            });
        }

        const inventoryIds = params.get('inventoryArtifactIds');
        if (inventoryIds) {
            setInventoryArtifactConfig({
                isOpen: true,
                itemIds: inventoryIds.split(',').filter(Boolean),
                title: 'Linked Items'
            });
            params.delete('inventoryArtifactIds');
            updated = true;
        }

        const paymentId = params.get('paymentsArtifactPaymentId');
        if (paymentId) {
            const vendor = params.get('paymentsArtifactVendor') || 'Vendor Details';
            setPaymentsArtifactConfig({
                isOpen: true,
                vendor,
                paymentIds: [paymentId],
                title: `Payment History: ${vendor}`
            });
            params.delete('paymentsArtifactPaymentId');
            params.delete('paymentsArtifactVendor');
            updated = true;
        }

        if (updated) {
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
            window.history.replaceState(null, '', newUrl);
        }
    }, [setInventoryArtifactConfig, setPaymentsArtifactConfig, user]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 768) {
                setSidebarState(current => {
                    if (current !== 'hidden') return 'hidden';
                    return current;
                });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setSidebarState]);

    useEffect(() => {
        if (user?.role === 'Client') {
            const dummyViews = ['upload', 'logistics', 'packing', 'process'];
            setIsDummyMode(dummyViews.includes(activeView as string));
        } else {
            setIsDummyMode(false);
        }
    }, [user, activeView, setIsDummyMode]);

    const pageContent = (() => {
        if (isEditingMask || workflowStep === 'fullscreenEdit' || workflowStep === 'fullscreenView') {
            return (
                <div className="glass-overlay-fullscreen flex flex-col p-4 md:p-12 z-100">
                    <div className="w-full h-full glass-panel flex flex-col overflow-hidden relative shadow-2xl rounded-3xl border border-white/20 bg-black/40">
                        <div className="flex grow flex-col overflow-hidden relative">
                            <Content />
                        </div>
                        <ExtraModeControls />
                    </div>
                </div>
            );
        }

        switch (activeView as string) {
            case 'control': return <ControlView />;
            case 'dashboard': return <AdminDashboard />;
            case 'overview': return <ClientOverview />;
            case 'upload': return <UploadView />;
            case 'inventory': return <InventoryView />;
            case 'logistics': return <LogisticsView />;
            case 'packing': return <PackingModule />;
            case 'finance': return <FinanceView />;
            case 'store': return <StoreView />;
            case 'process': return <ProcessView />;
            case 'viewer':
                return <ViewerView onOpenArtifact={(id) => { setUniversalView('tag'); setTagId(id); }} />;
            default:
                return <InventoryView />;
        }
    })();

    const handleSidebarStateToggle = () => {
        setSidebarState(current => {
            const states: SidebarState[] = ['expanded', 'compact', 'hidden'];
            const isMobile = window.innerWidth <= 768;
            if (isMobile) return current === 'hidden' ? 'compact' : 'hidden';
            const currentIndex = states.indexOf(current);
            const nextIndex = (currentIndex + 1) % states.length;
            return states[nextIndex];
        });
    };

    return (
        <>
            {sidebarState === 'hidden' && (
                <div 
                    className="fixed top-0 left-0 p-6 z-1000 group cursor-pointer"
                    onClick={() => {
                        const isMobile = window.innerWidth <= 768;
                        setSidebarState(isMobile ? 'compact' : 'expanded');
                    }}
                    title="Open Navigation"
                >
                    <div className="absolute inset-0 bg-(--app-bg)/40 backdrop-blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-br-3xl pointer-events-none" />
                    <div className="relative hover:scale-110 active:scale-95 transition-all outline-none">
                        <OnyxMiniLogo className="w-10 h-10 opacity-70 hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            )}

            <DataSyncProvider />
            <HeroBackground />

            <div className={`app-container sidebar-${sidebarState}`}>
                <div className="sidebar border-none bg-transparent">
                    <div className={`sidebar-header mb-12! border-none bg-transparent flex flex-col items-center ${sidebarState === 'expanded' ? 'pt-10' : 'pt-10 px-4'}`}>
                        <div
                            className={`sidebar-logo p-0! cursor-pointer! hover:scale-105 active:scale-95 transition-all flex items-center w-full ${sidebarState === 'expanded' ? 'flex-col gap-2' : 'justify-center'}`}
                            onClick={handleSidebarStateToggle}
                            title="Toggle Sidebar"
                        >
                            {sidebarState === 'expanded' && (
                                <>
                                    <OnyxLogo className="w-16 h-16 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
                                    <div className="flex flex-col items-center mb-6">
                                        <span className="sidebar-logo-text text-[11px]! font-bold! tracking-[0.2em]! opacity-90! text-(--text-color) opacity-80">Onyx.mx</span>
                                    </div>
                                </>
                            )}
                            {sidebarState === 'compact' && <OnyxMiniLogo className="w-12 h-12 transition-transform duration-300" />}
                        </div>
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
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => { setActiveView('overview'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <LayoutDashboard size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Overview</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Overview</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'upload' ? 'active' : ''}`} onClick={() => { setActiveView('upload'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Upload size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Add Entry</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Add Entry</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveView('inventory'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Store size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Inventory</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Inventory</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'viewer' ? 'active' : ''}`} onClick={() => { setActiveView('viewer'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Search size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Viewer</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Viewer</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'finance' ? 'active' : ''}`} onClick={() => { setActiveView('finance'); setFinanceSubTab('payments'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <CreditCard size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Payments</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Payments</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'store' ? 'active' : ''}`} onClick={() => { setActiveView('store'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Store size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Store</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Store</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <li className={`sidebar-list-item ${activeView === 'logistics' ? 'active' : ''}`} onClick={() => { setActiveView('logistics'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Truck size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Crates</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Crates</span>
                            </li>
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Client') && (
                            <>
                                <li className={`sidebar-list-item ${activeView === 'packing' ? 'active' : ''}`} onClick={() => { setActiveView('packing'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                    <div className="sidebar-list-item-main">
                                        <Package size={20} strokeWidth={1.75} />
                                        <span className="sidebar-list-item-text">Labels</span>
                                    </div>
                                    <span className="sidebar-compact-tooltip">Labels</span>
                                </li>
                                <li className={`sidebar-list-item ${activeView === 'process' ? 'active' : ''}`} onClick={() => { setActiveView('process'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                    <div className="sidebar-list-item-main">
                                        <Pipette size={20} strokeWidth={1.75} />
                                        <span className="sidebar-list-item-text">Process</span>
                                    </div>
                                    <span className="sidebar-compact-tooltip">Process</span>
                                </li>
                            </>
                        )}
                    </ul>

                    {/* Branding & Global Progress at bottom of sidebar — Clickable About Tag */}
                    <div 
                        className="mt-auto flex flex-col items-center justify-center p-4 border-t border-(--border-color) shrink-0 relative overflow-hidden cursor-pointer hover:bg-white/5 active:bg-white/10 transition-all group"
                        onClick={() => setIsAboutOpen(true)}
                        title="About Onyx.mx Studio"
                    >
                        {sidebarState === 'expanded' && (
                            <>
                                <OnyxMiniLogo className="w-7 h-7 mb-2 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] transition-all" />
                                <span className="text-[9px] font-black uppercase tracking-[0.3em] font-mono leading-none text-(--text-color-secondary) group-hover:text-blue-300 transition-colors">v{__APP_VERSION__}</span>
                            </>
                        )}
                        {sidebarState === 'compact' && (
                            <>
                                <OnyxMiniLogo className="w-6 h-6 mb-2 group-hover:scale-110 transition-all" />
                                <span className="text-[7px] font-black uppercase tracking-[0.2em] font-mono leading-none text-(--text-color-secondary) group-hover:text-blue-300">v{__APP_VERSION__}</span>
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

            <BatchActionsModal />
            <UploadWizard />
            <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
            <InventoryArtifact />
            <PaymentsArtifact />
        </>
    );
}