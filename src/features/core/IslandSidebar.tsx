import React, { useState, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import {
    activeViewAtom,
    activeSubMenuAtom,
    sidebarStateAtom,
    userAtom,
    logisticsSubTabAtom,
    isStudioSettingsOpenAtom,
    SidebarState
} from '../../lib/atoms';
import {
    Shield, CreditCard, Truck, Package, MapPin,
    ChevronRight, Zap, BarChart3, LayoutDashboard, Pipette, Layers,
    Box, Cuboid, BadgeDollarSign, Rotate3d, Cpu, Album, Shell
} from 'lucide-react';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { tr } from '../../lib/i18n';
import './islandSidebar.css';

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

interface NavItemProps {
    icon: React.FC<any>;
    label: string;
    isActive: boolean;
    action: () => void;
    isCompact: boolean;
    isHoverPeek: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, isActive, action, isCompact, isHoverPeek }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <a 
            href="#" 
            className={`isb-item ${isActive ? 'isb-item-active' : ''}`}
            onClick={(e) => { e.preventDefault(); action(); }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-current={isActive ? 'page' : undefined}
            role="button"
        >
            <div className="isb-item-main">
                <div className="isb-item-icon">
                    <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
                </div>
                <div className={`isb-label-wrap ${(!isCompact || isHoverPeek) ? 'isb-label-expanded' : 'isb-label-compact'}`}>
                    <div className="isb-item-label">{label}</div>
                </div>
            </div>
            
            <AnimatePresence>
                {isCompact && !isHoverPeek && isHovered && (
                    <m.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="isb-tooltip"
                    >
                        {label}
                    </m.div>
                )}
            </AnimatePresence>
        </a>
    );
};

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
    isCompact: boolean;
    isHoverPeek: boolean;
    onHideSidebarMobile: () => void;
}

const NavItemWithSubmenuComponent: React.FC<NavItemWithSubmenuProps> = React.memo(({ viewId, label, icon, subItems, isCompact, isHoverPeek, onHideSidebarMobile }) => {
    const [activeView] = useAtom(activeViewAtom);
    const [activeSubMenu, setActiveSubMenu] = useAtom(activeSubMenuAtom);
    
    const [isHovered, setIsHovered] = useState(false);
    const isOpen = activeSubMenu === viewId;
    const isParentActive = activeView === viewId;

    const NavIcon = ICON_MAP[icon] || Truck;

    const handleToggle = () => {
        setActiveSubMenu(isOpen ? null : viewId);
    };

    const showFlyout = isCompact && !isHoverPeek && isHovered;

    return (
        <div 
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative"
        >
            <a 
                href="#"
                className={`isb-item ${isParentActive ? 'isb-item-active' : ''}`} 
                onClick={(e) => { e.preventDefault(); handleToggle(); }}
                role="button"
                aria-expanded={isOpen}
            >
                <div className="isb-item-main">
                    <div className="isb-item-icon">
                        <NavIcon size={22} strokeWidth={isParentActive ? 2 : 1.75} />
                    </div>
                    <div className={`isb-label-wrap ${(!isCompact || isHoverPeek) ? 'isb-label-expanded' : 'isb-label-compact'}`}>
                        <div className="isb-item-label">{label}</div>
                    </div>
                </div>
                <div className={`isb-chevron-wrap ${(!isCompact || isHoverPeek) ? 'isb-label-expanded' : 'isb-label-compact'}`}>
                    <div className={`isb-chevron ${isOpen ? 'isb-chevron-open' : ''}`}>
                        <ChevronRight size={16} strokeWidth={2} />
                    </div>
                </div>

                {isCompact && !isHoverPeek && isHovered && !showFlyout && (
                    <div className="isb-tooltip">{label}</div>
                )}
            </a>

            <AnimatePresence>
                {showFlyout && (
                    <m.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="isb-flyout"
                    >
                        <div className="px-2 py-1 text-xs font-bold text-white/50 uppercase tracking-wider mb-1">{label}</div>
                        {subItems.map(item => {
                            const SubIcon = ICON_MAP[item.icon] || Package;
                            return (
                                <div 
                                    key={item.id} 
                                    className={`isb-flyout-item ${item.isActive ? 'isb-flyout-item-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); item.action(); setIsHovered(false); onHideSidebarMobile(); }}
                                    role="button"
                                >
                                    <SubIcon size={16} strokeWidth={1.75} />
                                    <span>{item.label}</span>
                                </div>
                            );
                        })}
                    </m.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {(!isCompact || isHoverPeek) && isOpen && (
                    <m.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="isb-submenu"
                    >
                        {subItems.map(item => {
                            const SubIcon = ICON_MAP[item.icon] || Package;
                            return (
                                <div 
                                    key={item.id} 
                                    className={`isb-submenu-item ${item.isActive ? 'isb-submenu-item-active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); item.action(); onHideSidebarMobile(); }}
                                    role="button"
                                >
                                    <SubIcon size={16} strokeWidth={1.75} />
                                    <span>{item.label}</span>
                                </div>
                            );
                        })}
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
});

const SidebarSection: React.FC<{ title: string, show: boolean, isCompact: boolean, isHoverPeek: boolean, children: React.ReactNode }> = ({ title, show, isCompact, isHoverPeek, children }) => {
    const hasRenderableChildren = React.Children.toArray(children).some(child => !!child);
    if (!show || !hasRenderableChildren) return null;
    return (
        <div className="isb-section">
            <div className={`isb-section-title ${(!isCompact || isHoverPeek) ? 'isb-label-expanded' : 'isb-label-compact'}`}>
                {title}
            </div>
            <div className="isb-section-items">
                {children}
            </div>
        </div>
    );
};

export const IslandSidebar: React.FC = () => {
    const [user] = useAtom(userAtom);
    const [activeView, setActiveView] = useAtom(activeViewAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);
    const [isSettingsOpen, setIsSettingsOpen] = useAtom(isStudioSettingsOpenAtom);
    
    const [isHoverPeek, setIsHoverPeek] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isCompact = sidebarState === 'compact';
    
    const handleMouseEnter = () => {
        if (!isCompact) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHoverPeek(true);
        }, 250);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setIsHoverPeek(false);
    };

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

    const handleMobileHide = () => {
        if (window.innerWidth <= 768) {
            setSidebarState('hidden');
        }
    };

    const showManagement = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientAccounting';
    const showLogistics = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor';
    const showTools = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor';

    const panelStyle: React.CSSProperties = {
        width: isHoverPeek ? '240px' : 'calc(var(--sidebar-width) - 24px)',
        transform: sidebarState === 'hidden' ? 'translateX(-150%)' : 'translateX(0)',
        opacity: sidebarState === 'hidden' ? 0 : 1,
        pointerEvents: sidebarState === 'hidden' ? 'none' : 'auto'
    };

    return (
        <LazyMotion features={domAnimation}>
        <div 
            className="isb-panel ui-root" 
            style={panelStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="isb-header">
                <div
                    className={`isb-logo-wrap ${(!isCompact || isHoverPeek) ? 'isb-header-expanded' : ''}`}
                    onClick={handleSidebarStateToggle}
                    title={tr("Toggle Sidebar")}
                    role="button"
                >
                    {(!isCompact || isHoverPeek) ? (
                        <>
                            <OnyxLogo className="w-16 h-16 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95" />
                            <div className="isb-logo-text mt-1 text-white opacity-80">Onyx.mx</div>
                        </>
                    ) : (
                        <OnyxMiniLogo className="w-12 h-12 transition-transform duration-300 hover:scale-105 active:scale-95" />
                    )}
                </div>
            </div>

            <div className="isb-list">
                {showManagement && (
                    <SidebarSection title={tr("Management")} show={true} isCompact={isCompact} isHoverPeek={isHoverPeek}>
                        {user?.role === 'Developer' && (
                            <NavItemWithSubmenuComponent
                                viewId="admin"
                                label={tr("Admin")}
                                icon="shield"
                                subItems={[
                                    { id: 'control', label: 'Control Center', icon: 'shield', action: () => { setActiveView('control'); handleMobileHide(); }, isActive: activeView === 'control' }
                                ]}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                                onHideSidebarMobile={handleMobileHide}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItem
                                icon={LayoutDashboard}
                                label={tr("Dashboard")}
                                isActive={activeView === 'dashboard'}
                                action={() => { setActiveView('dashboard'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItem
                                icon={Layers}
                                label={tr("Archived")}
                                isActive={activeView === 'workbook'}
                                action={() => { setActiveView('workbook'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientAccounting') && (
                            <NavItem
                                icon={BadgeDollarSign}
                                label={tr("Finances")}
                                isActive={activeView === 'finance'}
                                action={() => { setActiveView('finance'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItem
                                icon={Cpu}
                                label={tr("Devices")}
                                isActive={activeView === 'devices'}
                                action={() => { setActiveView('devices'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}

                {showLogistics && (
                    <SidebarSection title={tr("Logistics")} show={true} isCompact={isCompact} isHoverPeek={isHoverPeek}>
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <NavItem
                                icon={Album}
                                label={tr("Inventory")}
                                isActive={activeView === 'inventory'}
                                action={() => { setActiveView('inventory'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <NavItem
                                icon={Package}
                                label={tr("Warehouse")}
                                isActive={activeView === 'warehouse'}
                                action={() => { setActiveView('warehouse'); setLogisticsSubTab('empty'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <NavItem
                                icon={Truck}
                                label={tr("Trucking")}
                                isActive={activeView === 'trucking'}
                                action={() => { setActiveView('trucking'); setLogisticsSubTab('shipping'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}

                {showTools && (
                    <SidebarSection title={tr("Tools")} show={true} isCompact={isCompact} isHoverPeek={isHoverPeek}>
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenuComponent
                                viewId="labs"
                                label={tr("Labs")}
                                icon="layers"
                                subItems={[
                                    { id: 'process', label: 'Process', icon: 'pipette', action: () => { setActiveView('process'); handleMobileHide(); }, isActive: activeView === 'process' },
                                    { id: 'threed', label: '3D and AR', icon: 'rotate-3d', action: () => { setActiveView('threed'); handleMobileHide(); }, isActive: activeView === 'threed' }
                                ]}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                                onHideSidebarMobile={handleMobileHide}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <NavItem
                                icon={Shell}
                                label={tr("Viewer")}
                                isActive={activeView === 'viewer'}
                                action={() => { setActiveView('viewer'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}
            </div>

            <div 
                className={`isb-footer ${isSettingsOpen ? 'isb-footer-active' : ''}`}
                onClick={() => setIsSettingsOpen(true)}
                title={tr("Studio Settings & Manifesto")}
                role="button"
            >
                {(!isCompact || isHoverPeek) ? (
                    <>
                        <OnyxMiniLogo className={`w-8 h-8 transition-all duration-500 ${isSettingsOpen ? 'rotate-90' : 'opacity-80'}`} />
                        <div className="mt-4">
                            <SyncStatusBadge />
                        </div>
                    </>
                ) : (
                    <>
                        <OnyxMiniLogo className={`w-7 h-7 transition-all duration-500 ${isSettingsOpen ? 'rotate-90' : 'opacity-80'}`} />
                        <div className="mt-3 scale-75 origin-center">
                            <SyncStatusBadge />
                        </div>
                    </>
                )}
            </div>
        </div>
        </LazyMotion>
    );
};
