
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
    tagIdAtom,
    isStudioSettingsOpenAtom
} from '../../lib/atoms';
import React, { useEffect, useState } from 'react';
import {
    Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
    ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard, Pipette, Search, Layers, ShoppingBag,
    Barcode, Box, Label, Shell, Album, Cuboid, Tag, BadgeDollarSign, Rotate3d
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
import { StudioSettingsPortal } from './StudioSettingsPortal';
import { InventoryArtifact } from '../inventory/InventoryArtifact';
import { PaymentsArtifact } from '../finance/PaymentsArtifact';
import { ViewerView } from '../viewer/ViewerView';
import { ThreeDAppView } from '../threed/ThreeDView';
import { PaymentsFilterBar } from '../finance/PaymentsFilterBar';
import { UniversalToolsBar } from './UniversalToolsBar';
import { LabelWizard, NFCWizard } from '../logistics/LabelWizard';
import { PackWizard } from '../logistics/PackWizard';
import { PaymentWizard } from '../finance/PaymentWizard';
import { InventorySelectionDock } from './InventorySelectionDock';


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

    const IconMap: Record<string, React.FC<any>> = { 
        truck: Truck, 
        package: Package, 
        'map-pin': MapPin, 
        shield: Shield, 
        'badge-dollar-sign': BadgeDollarSign, 
        layers: Layers,
        box: Box,
        cuboid: Cuboid,
        zap: Zap,
        pipette: Pipette,
        'rotate-3d': Rotate3d,
        'bar-chart-3': BarChart3,
        'layout-dashboard': LayoutDashboard,
        'credit-card': CreditCard
    };
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
    const [isSettingsOpen, setIsSettingsOpen] = useAtom(isStudioSettingsOpenAtom);
    
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
        const clientRoles: UserRole[] = ['ClientBoss', 'ClientAccounting', 'ClientViewer'];
        if (clientRoles.includes(user?.role as UserRole)) {
            const alwaysDummy = ['upload', 'logistics', 'packing', 'process'];
            const isViewerInventory = user?.role === 'ClientViewer' && activeView === 'inventory';
            setIsDummyMode(alwaysDummy.includes(activeView as string) || isViewerInventory);
        } else {
            setIsDummyMode(false);
        }
    }, [user, activeView, setIsDummyMode]);

    const pageContent = (() => {
        if (isEditingMask || workflowStep === 'fullscreenEdit' || workflowStep === 'fullscreenView') {
            return (
                <div className="glass-overlay-fullscreen flex flex-col p-4 md:p-12 z-[450]">
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
            case 'threed': return <ThreeDAppView />;
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

    const sidebarWidth = sidebarState === 'expanded' ? '240px' : sidebarState === 'compact' ? '80px' : '0px';

    return (
        <>
            <DataSyncProvider />
            <HeroBackground />

            <div 
                className={`app-container sidebar-${sidebarState}`}
                style={{ '--sidebar-width': sidebarWidth } as React.CSSProperties}
            >
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
                        {/* ── ADMIN ── */}
                        {user?.role === 'Developer' && (
                            <NavItemWithSubmenu 
                                viewId="admin"
                                label="Admin"
                                icon="shield"
                                subItems={[
                                    { id: 'control', label: 'Control Center', icon: 'shield', action: () => { setActiveView('control'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'control' }
                                ]}
                            />
                        )}

                        {/* ── FINANCES ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientAccounting') && (
                            <NavItemWithSubmenu 
                                viewId="finances"
                                label="Finances"
                                icon="badge-dollar-sign"
                                subItems={[
                                    ...(user?.role !== 'ClientAccounting' ? [{ id: 'dashboard', label: 'Dashboard', icon: 'bar-chart-3', action: () => { setActiveView('dashboard'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'dashboard' }] : []),
                                    { id: 'overview', label: 'Overview', icon: 'layout-dashboard', action: () => { setActiveView('overview'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'overview' },
                                    { id: 'finance', label: 'Payments', icon: 'credit-card', action: () => { setActiveView('finance'); setFinanceSubTab('payments'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'finance' }
                                ]}
                            />
                        )}
                        {/* ── INVENTORY ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <li className={`sidebar-list-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveView('inventory'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Album size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Inventory</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Inventory</span>
                            </li>
                        )}

                        {/* ── WAREHOUSE ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <NavItemWithSubmenu 
                                viewId="warehouse"
                                label="Warehouse"
                                icon="package"
                                subItems={[
                                    { id: 'warehouse_empty', label: 'Empty Crates', icon: 'box', action: () => { setActiveView('logistics'); setLogisticsSubTab('empty'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'logistics' && logisticsSubTab === 'empty' },
                                    { id: 'warehouse_packed', label: 'Packed Crates', icon: 'cuboid', action: () => { setActiveView('logistics'); setLogisticsSubTab('packed'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'logistics' && (logisticsSubTab === 'packed' || logisticsSubTab === 'packing') }
                                ]}
                            />
                        )}

                        {/* ── TRUCKING ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <NavItemWithSubmenu 
                                viewId="trucking"
                                label="Trucking"
                                icon="truck"
                                subItems={[
                                    { id: 'trucking_plan', label: 'Plan Truck', icon: 'map-pin', action: () => { setActiveView('logistics'); setLogisticsSubTab('shipping'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'logistics' && logisticsSubTab === 'shipping' },
                                    { id: 'trucking_deployed', label: 'Deployed', icon: 'zap', action: () => { setActiveView('logistics'); setLogisticsSubTab('deployed'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'logistics' && logisticsSubTab === 'deployed' }
                                ]}
                            />
                        )}

                        {/* ── LABS ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenu 
                                viewId="labs"
                                label="Labs"
                                icon="layers"
                                subItems={[
                                    { id: 'process', label: 'Process', icon: 'pipette', action: () => { setActiveView('process'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'process' },
                                    { id: 'threed', label: '3D and AR', icon: 'rotate-3d', action: () => { setActiveView('threed'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'threed' }
                                ]}
                            />
                        )}
                        
                        {/* ── LEGACY VIEWER (Internal) ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <li className={`sidebar-list-item ${activeView === 'viewer' ? 'active' : ''}`} onClick={() => { setActiveView('viewer'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Shell size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Viewer</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Viewer</span>
                            </li>
                        )}
                    </ul>

                    {/* Studio Settings Trigger at bottom of sidebar */}
                    <div 
                        className={`mt-auto flex flex-col items-center justify-center p-4 pb-8 border-t border-(--border-color) shrink-0 relative overflow-hidden cursor-pointer transition-all group ${isSettingsOpen ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'}`}
                        onClick={() => setIsSettingsOpen(true)}
                        title="Studio Settings & Manifesto"
                    >
                        {sidebarState === 'expanded' && (
                            <>
                                <OnyxMiniLogo className={`w-8 h-8 transition-all duration-500 group-hover:scale-110 ${isSettingsOpen ? 'rotate-90 text-blue-400' : 'text-white/40'}`} />
                            </>
                        )}
                        {sidebarState === 'compact' && (
                            <>
                                <OnyxMiniLogo className={`w-7 h-7 transition-all duration-500 group-hover:scale-110 ${isSettingsOpen ? 'rotate-90 text-blue-400' : 'text-white/40'}`} />
                            </>
                        )}
                    </div>
                </div>
                <div className="app-content flex-1 min-h-0 overflow-y-auto scroll-smooth p-0 m-0 relative">
                    <div className="sticky top-0 z-[500] w-full flex flex-col shadow-2xl">
                        <MainHeader />
                        <UniversalToolsBar />
                    </div>
                    {activeView === 'finance' && <PaymentsFilterBar />}
                    <main className="flex-1 flex flex-col min-h-0 p-0 m-0">
                        {pageContent}
                    </main>

                    <BatchActionsModal />
                    <UploadWizard />
                    <LabelWizard />
                    <NFCWizard />
                    <PackWizard />
                    <PaymentWizard />
                    <InventorySelectionDock />
                </div>
            </div>

            <StudioSettingsPortal />
            <InventoryArtifact />
            <PaymentsArtifact />
        </>
    );
}