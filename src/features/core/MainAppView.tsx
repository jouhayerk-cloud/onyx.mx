
import React, { Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import './topbarOverlay.css';
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
    isBotOrbOpenAtom,
    UserRole
} from '../../lib/atoms';
import {
    Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
    ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard, Pipette, Search, Layers, ShoppingBag,
    Barcode, Box, Shell, Album, Cuboid, Tag, BadgeDollarSign, Rotate3d, History, Brain, Cpu
} from 'lucide-react';

import { LiquidBar } from '../../components/LiquidBar';
import { LiquidOnyxFilters } from '../../components/LiquidOnyxFilters';
import { MainHeader } from './MainHeader';
import { IslandSidebar } from './IslandSidebar';
import { isPrintCenterOpenAtom } from '../print/printState';
import { Content } from '../../components/Content';
import { ExtraModeControls } from '../create/ExtraModeControls';
import { LiquidOnyxBackground } from '../../components/LiquidOnyxBackground';
import { useLogout, useTranslation } from '../../lib/hooks';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import userIcons from '../../components/userIcons';
import { DataSyncProvider } from '../../components/DataSyncProvider';
import { UniversalToolsBar } from './UniversalToolsBar';
import { ArchivedToolsBar } from '../archived/ArchivedChrome';
import { islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { ViewSkeleton } from '../../components/ui/ViewSkeleton';
import { useRemoteControl } from '../pico/useRemoteControl';
import { tr } from '../../lib/i18n';

// ── Lazy-loaded route views ────────────────────────────────────────────────────
// These chunks are only downloaded when the user navigates to that view.
// Saves ~2-3MB of JS parse time on initial load.
const ControlView        = React.lazy(() => import('../control/ControlView').then(m => ({ default: m.ControlView })));
const UploadView         = React.lazy(() => import('../upload/UploadView').then(m => ({ default: m.UploadView })));
// Dev only review board of the Type figures, photos and axonometric icons (activeView 'typeboard'); not in the production bundle.
const TypeAuditBoard     = import.meta.env.DEV ? React.lazy(() => import('../entry/typeBoard/TypeAuditBoard').then(m => ({ default: m.TypeAuditBoard }))) : null;
const WelcomeView        = React.lazy(() => import('../welcome/WelcomeView').then(m => ({ default: m.WelcomeView })));
const PrintCenter        = React.lazy(() => import('../print/PrintCenter').then(m => ({ default: m.PrintCenter })));
const InventoryView      = React.lazy(() => import('../inventory/InventoryView').then(m => ({ default: m.InventoryView })));
const LogisticsView      = React.lazy(() => import('../logistics/LogisticsView').then(m => ({ default: m.LogisticsView })));
const FinanceView        = React.lazy(() => import('../finance/FinanceView').then(m => ({ default: m.FinanceView })));
const AdminDashboard     = React.lazy(() => import('../dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ClientOverview     = React.lazy(() => import('../dashboard/ClientOverview').then(m => ({ default: m.ClientOverview })));
const ArchivedView       = React.lazy(() => import('../archived/ArchivedView').then(m => ({ default: m.ArchivedView })));   // replaces WorkbookView (Archived module: ARCHIVE 825 only)
const StoreView          = React.lazy(() => import('../store/StoreView').then(m => ({ default: m.StoreView })));
const RegStorePreview    = React.lazy(() => import('../store/RegStorePreview').then(m => ({ default: m.RegStorePreview })));
const PackingModule      = React.lazy(() => import('../logistics/PackingModule').then(m => ({ default: m.PackingModule })));
const DeployedView       = React.lazy(() => import('../logistics/DeployedView').then(m => ({ default: m.DeployedView })));
const ProcessView        = React.lazy(() => import('../process/ProcessView').then(m => ({ default: m.ProcessView })));
const ThreeDAppView      = React.lazy(() => import('../threed/ThreeDView').then(m => ({ default: m.ThreeDAppView })));
const ViewerView         = React.lazy(() => import('../viewer/ViewerView').then(m => ({ default: m.ViewerView })));
const OnyxAgentPage      = React.lazy(() => import('../onyxAgent/OnyxAgentPage').then(m => ({ default: m.OnyxAgentPage })));   // replaces the three.js OnyxOrbView
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
const DevicesView        = React.lazy(() => import('../pico/devices/DevicesView').then(m => ({ default: m.DevicesView })));
// ──────────────────────────────────────────────────────────────────────────────

export function MainAppView() {
    const t = useTranslation();
    const islandOn = useAtomValue(islandCommandsEnabledAtom);
    const isPrintCenterOpen = useAtomValue(isPrintCenterOpenAtom);
    // Publish the top bar's height so the page can flow under it (topbarOverlay.css).
    const appContentRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const host = appContentRef.current;
        const bar = host?.querySelector<HTMLElement>(':scope > .app-topbar');
        if (!host || !bar) return;
        const apply = () => host.style.setProperty('--app-topbar-h', `${bar.offsetHeight}px`);
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(bar);
        return () => ro.disconnect();
    }, []);
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

    // OnyxChan Remote State Control — listens for Supabase Realtime broadcasts
    useRemoteControl();

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
                if (false) {
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
            case 'dashboard': return (user?.role === 'Developer' || user?.role === 'Admin') ? <AdminDashboard /> : <InventoryView />;
            // Overview summarises finances and inventory: Admin and Developer only (never vendors or client roles).
            case 'overview': return (user?.role === 'Developer' || user?.role === 'Admin') ? <AdminDashboard /> : <InventoryView />;
            // Workbook holds the 326 book and the ARCHIVE 825 tab (finance, production, logistics tabs inside): Admin and Developer only.
            case 'workbook': return (user?.role === 'Developer' || user?.role === 'Admin') ? <ArchivedView /> : <InventoryView />;
            case 'upload': return <UploadView />;
            case 'typeboard': return TypeAuditBoard ? <TypeAuditBoard /> : <WelcomeView />;
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
            case 'onyx': return <OnyxAgentPage />;
            case 'onyx-reg': return <RegStorePreview />;
            case 'pico-bridge': return <DevicesView />;
            case 'devices': return <DevicesView />;

            default:
                return <InventoryView />;
        }
    })();

    const handleSidebarStateToggle = () => {
        setSidebarState(current => {
            const states: SidebarState[] = ['expanded', 'compact', 'hidden'];
            const isMobile = window.innerWidth <= 768;
            if (isMobile) return current === 'compact' ? 'expanded' : 'compact';
            const currentIndex = states.indexOf(current);
            const nextIndex = (currentIndex + 1) % states.length;
            return states[nextIndex];
        });
    };

    const sidebarWidth = sidebarState === 'expanded' ? '264px' : sidebarState === 'rail' ? '104px' : sidebarState === 'compact' ? '92px' : '0px';

    return (
        <>
            <LiquidOnyxFilters />
            <DataSyncProvider />
            <LiquidOnyxBackground />

            {sidebarState === 'hidden' && !islandOn && (
                <button 
                    onClick={() => {
                        const isMobile = window.innerWidth <= 768;
                        setSidebarState(isMobile ? 'compact' : 'expanded');
                    }}
                    className="fixed bottom-[max(16px,env(safe-area-inset-bottom,16px))] left-4 z-[9999] md:hidden w-12 h-12 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/60 transition-all shadow-xl"
                >
                    <OnyxMiniLogo className="w-8 h-8" />
                </button>
            )}

            <div 
                className={`app-container sidebar-${sidebarState}`}
                style={{ '--sidebar-width': sidebarWidth } as React.CSSProperties}
            >
                <IslandSidebar />
                <div 
                    ref={appContentRef}
                    className="app-content flex-1 min-h-0 overflow-y-auto scroll-smooth p-0 m-0 relative"
                    onScroll={(e) => {
                        const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
                        if (activeView === 'finance') {
                            if (scrollTop > 100) setIsFinanceScrolled(true);
                            else setIsFinanceScrolled(false);
                        }
                    }}
                >
                    {/* app-topbar: the band that paints behind the iOS status bar.
                        It is sticky at top:0 inside the scroller, so with
                        viewport-fit=cover its background already reaches the top
                        of the display — the class makes that explicit and pays
                        the inset back as padding, so the bar's CONTENT clears the
                        clock and the notch while its GLASS runs underneath. */}
                    <LiquidBar className={"app-topbar sticky top-0 z-[500] w-full flex flex-col transition-all " + (!islandOn ? 'bg-white/[0.01] backdrop-blur-2xl border-b border-white/10 shadow-2xl' : '')}>
                            <div className="pointer-events-auto flex flex-col w-full">
                                <MainHeader />
                                {(!islandOn) && <UniversalToolsBar />}
                                {activeView === 'workbook' && !islandOn && <ArchivedToolsBar />}
                            </div>
                        </LiquidBar>
                        {islandOn && <UniversalToolsBar />}

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
                        {/* A portal sheet with its own header. It used to also be wrapped in a sub menu bar, which left an empty second bar behind it. */}
                        {isPrintCenterOpen && <PrintCenter />}
                    </Suspense>
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

















