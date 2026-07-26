
import React, { Suspense, useEffect, useState, useCallback } from 'react';
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
    isStudioSettingsOpenAtom,
    isFinanceScrolledAtom,
    isBotOrbOpenAtom
} from '../../lib/atoms';
import {
    Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
    ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard, Pipette, Search, Layers, ShoppingBag,
    Barcode, Box, Label, Shell, Album, Cuboid, Tag, BadgeDollarSign, Rotate3d, History, Brain
} from 'lucide-react';

import { MainHeader } from './MainHeader';
import { Content } from '../../components/Content';
import { ExtraModeControls } from '../create/ExtraModeControls';
import { HeroBackground } from '../../components/HeroBackground';
import { useLogout, useTranslation } from '../../lib/hooks';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';
import { DataSyncProvider } from '../../components/DataSyncProvider';
import { UniversalToolsBar } from './UniversalToolsBar';
import { InventorySelectionDock } from './InventorySelectionDock';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { ViewSkeleton } from '../../components/ui/ViewSkeleton';

// ── Lazy-loaded route views ────────────────────────────────────────────────────
// These chunks are only downloaded when the user navigates to that view.
// Saves ~2-3MB of JS parse time on initial load.
const ControlView        = React.lazy(() => import('../control/ControlView').then(m => ({ default: m.ControlView })));
const UploadView         = React.lazy(() => import('../upload/UploadView').then(m => ({ default: m.UploadView })));
const WelcomeView        = React.lazy(() => import('../welcome/WelcomeView').then(m => ({ default: m.WelcomeView })));
const InventoryView      = React.lazy(() => import('../inventory/InventoryView').then(m => ({ default: m.InventoryView })));
const LogisticsView      = React.lazy(() => import('../logistics/LogisticsView').then(m => ({ default: m.LogisticsView })));
const FinanceView        = React.lazy(() => import('../finance/FinanceView').then(m => ({ default: m.FinanceView })));
const AdminDashboard     = React.lazy(() => import('../dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ClientOverview     = React.lazy(() => import('../dashboard/ClientOverview').then(m => ({ default: m.ClientOverview })));
const StoreView          = React.lazy(() => import('../store/StoreView').then(m => ({ default: m.StoreView })));
const PackingModule      = React.lazy(() => import('../logistics/PackingModule').then(m => ({ default: m.PackingModule })));
const DeployedView       = React.lazy(() => import('../logistics/DeployedView').then(m => ({ default: m.DeployedView })));
const ProcessView        = React.lazy(() => import('../process/ProcessView').then(m => ({ default: m.ProcessView })));
const ThreeDAppView      = React.lazy(() => import('../threed/ThreeDView').then(m => ({ default: m.ThreeDAppView })));
const ViewerView         = React.lazy(() => import('../viewer/ViewerView').then(m => ({ default: m.ViewerView })));
const OnyxOrbView        = React.lazy(() => import('../onyx/OnyxOrbView').then(m => ({ default: m.OnyxOrbView })));
const StudioSettingsPortal = React.lazy(() => import('./StudioSettingsPortal').then(m => ({ default: m.StudioSettingsPortal })));
const InventoryArtifact  = React.lazy(() => import('../inventory/InventoryArtifact').then(m => ({ default: m.InventoryArtifact })));
const PaymentsArtifact   = React.lazy(() => import('../finance/PaymentsArtifact').then(m => ({ default: m.PaymentsArtifact })));
const BatchActionsModal  = React.lazy(() => import('../catalog/BatchActionsModal').then(m => ({ default: m.BatchActionsModal })));
const UploadWizard       = React.lazy(() => import('../inventory/UploadWizard').then(m => ({ default: m.UploadWizard })));
const BatchProcessingWizard = React.lazy(() => import('../inventory/BatchProcessingWizard').then(m => ({ default: m.BatchProcessingWizard })));
const LabelWizard        = React.lazy(() => import('../logistics/LabelWizard').then(m => ({ default: m.LabelWizard })));
const NFCWizard          = React.lazy(() => import('../logistics/LabelWizard').then(m => ({ default: m.NFCWizard })));
const PackWizard         = React.lazy(() => import('../logistics/PackWizard').then(m => ({ default: m.PackWizard })));
const CratePackingManager = React.lazy(() => import('../logistics/CratePackingManager').then(m => ({ default: m.CratePackingManager })));
const ItemsPayWizard     = React.lazy(() => import('../finance/ItemsPayWizard').then(m => ({ default: m.ItemsPayWizard })));
const PicoBridgeView       = React.lazy(() => import('../pico/PicoBridgeView').then(m => ({ default: m.PicoBridgeView })));
// ──────────────────────────────────────────────────────────────────────────────

/** Module-level constant — avoids re-creating this object on every NavItemWithSubmenu render */
const ICON_MAP: Record<string, React.FC<any>> = {
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

const NavItemWithSubmenu: React.FC<NavItemWithSubmenuProps> = React.memo(({ viewId, label, icon, subItems }) => {
    const [activeView] = useAtom(activeViewAtom);
    const [activeSubMenu, setActiveSubMenu] = useAtom(activeSubMenuAtom);
    const sidebarState = useAtomValue(sidebarStateAtom);

    const isOpen = activeSubMenu === viewId;
    const isParentActive = activeView === viewId;

    // Use module-level ICON_MAP — not recreated on every render
    const NavIcon = ICON_MAP[icon] || Truck;

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
                            const SubIcon = ICON_MAP[item.icon] || Package;
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
                        const SubIcon = ICON_MAP[item.icon] || Package;
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
});

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
    const setIsFinanceScrolled = useSetAtom(isFinanceScrolledAtom);

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
        // rAF-throttled resize handler — fires at most once per frame instead of every pixel
        let rafId: number | null = null;
        const handleResize = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (window.innerWidth <= 768) {
                    setSidebarState(current => {
                        if (current !== 'hidden') return 'hidden';
                        return current;
                    });
                }
            });
        };
        window.addEventListener('resize', handleResize, { passive: true });
        return () => {
            window.removeEventListener('resize', handleResize);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [setSidebarState]);

    useEffect(() => {
        const clientRoles: UserRole[] = ['ClientBoss', 'ClientAccounting', 'ClientViewer'];
        if (clientRoles.includes(user?.role as UserRole)) {
            const alwaysDummy = ['upload', 'process'];
            const isViewerInventory = user?.role === 'ClientViewer' && activeView === 'inventory';
            setIsDummyMode(alwaysDummy.includes(activeView as string) || isViewerInventory);
        } else {
            setIsDummyMode(false);
        }
    }, [user, activeView, setIsDummyMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p' || e.key === 'O' || e.key === 'o')) {
                e.preventDefault();
                setActiveView('pico-bridge');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        if (window.location.search.includes('view=pico-bridge') || window.location.pathname === '/pico-bridge') {
            setActiveView('pico-bridge');
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setActiveView]);

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

        // Each case is wrapped in Suspense at the switch level — chunk downloads
        // show the ViewSkeleton while the JS is loading.
        switch (activeView as string) {
            case 'control': return <ControlView />;
            case 'dashboard': return <AdminDashboard />;
            case 'upload': return <UploadView />;
            case 'welcome': return <WelcomeView />;
            case 'inventory': return <InventoryView />;
            case 'warehouse':
            case 'trucking':
            case 'logistics': return <LogisticsView />;
            case 'deployed': return <DeployedView />;
            case 'packing': return <PackingModule />;
            case 'finance': return <FinanceView />;
            case 'store': return <StoreView />;
            case 'process': return <ProcessView />;
            case 'threed': return <ThreeDAppView />;
            case 'viewer':
                return <ViewerView onOpenArtifact={(id) => { setUniversalView('tag'); setTagId(id); }} />;
            case 'onyx': return <OnyxOrbView />;
            case 'pico-bridge': return <PicoBridgeView />;

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
                        {/* ── ONYX INTELLIGENCE (DISABLED) ── 
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <li className={`sidebar-list-item ${activeView === 'onyx' ? 'active' : ''}`} onClick={() => { setActiveView('onyx'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Brain size={20} strokeWidth={1.75} className="text-(--main-color)" />
                                    <span className="sidebar-list-item-text font-bold">Onyx Intelligence</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Onyx Intelligence</span>
                            </li>
                        )}
                        */}

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
                            <li className={`sidebar-list-item ${activeView === 'finance' ? 'active' : ''}`} onClick={() => { setActiveView('finance'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <BadgeDollarSign size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Finances</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Finances</span>
                            </li>
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



                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <li className={`sidebar-list-item ${activeView === 'warehouse' ? 'active' : ''}`} onClick={() => { setActiveView('warehouse'); setLogisticsSubTab('empty'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Package size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Warehouse</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Warehouse</span>
                            </li>
                        )}

                        {/* ── TRUCKING ── */}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <li className={`sidebar-list-item ${activeView === 'trucking' ? 'active' : ''}`} onClick={() => { setActiveView('trucking'); setLogisticsSubTab('shipping'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
                                <div className="sidebar-list-item-main">
                                    <Truck size={20} strokeWidth={1.75} />
                                    <span className="sidebar-list-item-text">Trucking</span>
                                </div>
                                <span className="sidebar-compact-tooltip">Trucking</span>
                            </li>
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
                                <div className="mt-4">
                                    <SyncStatusBadge />
                                </div>
                            </>
                        )}
                        {sidebarState === 'compact' && (
                            <>
                                <OnyxMiniLogo className={`w-7 h-7 transition-all duration-500 group-hover:scale-110 ${isSettingsOpen ? 'rotate-90 text-blue-400' : 'text-white/40'}`} />
                                <div className="mt-3 scale-75 origin-center">
                                    <SyncStatusBadge />
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div 
                    className="app-content flex-1 min-h-0 overflow-y-auto scroll-smooth p-0 m-0 relative"
                    onScroll={(e) => {
                        const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
                        if (activeView === 'finance') {
                            if (scrollTop > 100) setIsFinanceScrolled(true);
                            else setIsFinanceScrolled(false);
                        }
                    }}
                >
                    <div className="sticky top-0 z-[500] w-full flex flex-col bg-white/[0.01] backdrop-blur-2xl border-b border-white/10 shadow-2xl">
                        <MainHeader />
                        <UniversalToolsBar />
                    </div>

                    <main className="flex-1 flex flex-col min-h-0 p-0 m-0">
                        {/* Suspense catches lazy-loaded view chunks during navigation */}
                        <Suspense fallback={<ViewSkeleton />}>
                            {pageContent}
                        </Suspense>
                    </main>

                    {/* Modals/wizards — also lazy-loaded, only mounted when open */}
                    <Suspense fallback={null}>
                        <BatchActionsModal />
                        <UploadWizard />
                        <BatchProcessingWizard />
                        <LabelWizard />
                        <NFCWizard />
                        <PackWizard />
                        <CratePackingManager />
                        <ItemsPayWizard />
                    </Suspense>
                    <InventorySelectionDock />
                </div>
            </div>

            <Suspense fallback={null}>
                <StudioSettingsPortal />
                <InventoryArtifact />
                <PaymentsArtifact />
            </Suspense>
            {/* <BotOrb /> Disabled for performance */}
        </>
    );
}

