import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import { isPrintCenterOpenAtom } from '../print/printState';
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
    Box, Cuboid, BadgeDollarSign, Rotate3d, Cpu, Album, Shell, Printer,
    ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { tr } from '../../lib/i18n';
import './islandSidebar.css';
import './islandSidebarRail.css';
import './islandSidebarDrawer.css';

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
    isRail: boolean;
    isHoverPeek: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, isActive, action, isCompact, isRail, isHoverPeek }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    const showExpanded = (!isCompact && !isRail) || isHoverPeek;
    const showRail = isRail && !isHoverPeek;
    const showCompact = isCompact && !isHoverPeek;

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
            <div className={`isb-item-main ${showRail ? 'isb-item-main-rail' : ''}`}>
                <div className="isb-item-icon">
                    <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
                </div>
                <div className={`isb-label-wrap ${showExpanded ? 'isb-label-expanded' : showRail ? 'isb-label-rail' : 'isb-label-compact'}`}>
                    <div className={`isb-item-label ${showRail ? 'isb-item-label-rail' : ''}`}>{label}</div>
                </div>
            </div>
            
            <AnimatePresence>
                {showCompact && isHovered && (
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
    isRail: boolean;
    isHoverPeek: boolean;
    onHideSidebarMobile: () => void;
}

const NavItemWithSubmenuComponent: React.FC<NavItemWithSubmenuProps> = React.memo(({ viewId, label, icon, subItems, isCompact, isRail, isHoverPeek, onHideSidebarMobile }) => {
    const [activeView] = useAtom(activeViewAtom);
    const [activeSubMenu, setActiveSubMenu] = useAtom(activeSubMenuAtom);
    
    const [isHovered, setIsHovered] = useState(false);
    const isOpen = activeSubMenu === viewId;
    const isParentActive = activeView === viewId;

    const NavIcon = ICON_MAP[icon] || Truck;

    const handleToggle = () => {
        setActiveSubMenu(isOpen ? null : viewId);
    };

    const showExpanded = (!isCompact && !isRail) || isHoverPeek;
    const showRail = isRail && !isHoverPeek;
    const showCompact = isCompact && !isHoverPeek;
    
    const showFlyout = (showCompact || showRail) && isHovered;

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
                <div className={`isb-item-main ${showRail ? 'isb-item-main-rail' : ''}`}>
                    <div className="isb-item-icon">
                        <NavIcon size={22} strokeWidth={isParentActive ? 2 : 1.75} />
                    </div>
                    <div className={`isb-label-wrap ${showExpanded ? 'isb-label-expanded' : showRail ? 'isb-label-rail' : 'isb-label-compact'}`}>
                        <div className={`isb-item-label ${showRail ? 'isb-item-label-rail' : ''}`}>{label}</div>
                    </div>
                </div>
                <div className={`isb-chevron-wrap ${showExpanded ? 'isb-label-expanded' : 'isb-label-compact'} ${showRail ? 'isb-chevron-wrap-rail' : ''}`}>
                    <div className={`isb-chevron ${isOpen ? 'isb-chevron-open' : ''}`}>
                        <ChevronRight size={16} strokeWidth={2} />
                    </div>
                </div>

                {showCompact && isHovered && !showFlyout && (
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
                {showExpanded && isOpen && (
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

const SidebarSection: React.FC<{ title: string, show: boolean, isCompact: boolean, isRail: boolean, isHoverPeek: boolean, children: React.ReactNode }> = ({ title, show, isCompact, isRail, isHoverPeek, children }) => {
    const hasRenderableChildren = React.Children.toArray(children).some(child => !!child);
    if (!show || !hasRenderableChildren) return null;
    
    const showExpanded = (!isCompact && !isRail) || isHoverPeek;
    const showRail = isRail && !isHoverPeek;

    return (
        <div className="isb-section">
            <div 
                className={`isb-section-title ${showExpanded ? 'isb-label-expanded' : showRail ? 'isb-label-rail' : 'isb-label-compact'}`}
                title={showRail ? title : undefined}
            >
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
    const [activeSubMenu] = useAtom(activeSubMenuAtom);
    const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);
    const [isSettingsOpen, setIsSettingsOpen] = useAtom(isStudioSettingsOpenAtom);
    const [isPrintCenterOpen, setIsPrintCenterOpen] = useAtom(isPrintCenterOpenAtom);
    
    const [isHoverPeek, setIsHoverPeek] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ top: false, bottom: false });

    // Phone / Drawer responsive state
    const [isPhone, setIsPhone] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(max-width: 768px)').matches;
        }
        return false;
    });

    const [dragOffset, setDragOffset] = useState<number | null>(null);
    const dragStartRef = useRef<{
        startX: number;
        startY: number;
        startTime: number;
        isSwiping: boolean;
        isVertical: boolean;
        pointerId: number;
    } | null>(null);

    const lastFocusedElementRef = useRef<HTMLElement | null>(null);
    const prevSidebarStateRef = useRef<SidebarState>(sidebarState);

    const isCompact = !isPhone && sidebarState === 'compact';
    const isRail = !isPhone && sidebarState === 'rail';
    const showExpanded = isPhone || (!isCompact && !isRail) || isHoverPeek;
    const isPhoneDrawerOpen = isPhone && sidebarState !== 'hidden';

    // matchMedia listener for phone breakpoint
    useEffect(() => {
        const mql = window.matchMedia('(max-width: 768px)');

        if (mql.matches) {
            setIsPhone(true);
            setSidebarState(current => (current === 'compact' || current === 'rail' ? 'hidden' : current));
        }

        const handleMediaChange = (e: MediaQueryListEvent) => {
            const matches = e.matches;
            setIsPhone(matches);
            setDragOffset(null);
            dragStartRef.current = null;
            if (matches) {
                setSidebarState('hidden');
            } else {
                setSidebarState(current => (current === 'hidden' ? 'expanded' : current));
            }
        };

        mql.addEventListener('change', handleMediaChange);
        return () => mql.removeEventListener('change', handleMediaChange);
    }, [setSidebarState]);

    // On phone only two states exist: hidden and expanded
    useEffect(() => {
        if (isPhone && (sidebarState === 'compact' || sidebarState === 'rail')) {
            setSidebarState('expanded');
        }
    }, [isPhone, sidebarState, setSidebarState]);

    // Focus restoration when drawer closes
    useEffect(() => {
        const wasOpen = prevSidebarStateRef.current !== 'hidden';
        const isOpen = sidebarState !== 'hidden';

        if (isPhone) {
            if (!wasOpen && isOpen) {
                if (document.activeElement instanceof HTMLElement) {
                    lastFocusedElementRef.current = document.activeElement;
                }
            } else if (wasOpen && !isOpen) {
                if (lastFocusedElementRef.current && typeof lastFocusedElementRef.current.focus === 'function') {
                    lastFocusedElementRef.current.focus();
                }
                lastFocusedElementRef.current = null;
            }
        }
        prevSidebarStateRef.current = sidebarState;
    }, [sidebarState, isPhone]);

    const handleMouseEnter = () => {
        if (isPhone || (!isCompact && !isRail)) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHoverPeek(true);
        }, 250);
    };

    const handleMouseLeave = () => {
        if (isPhone) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setIsHoverPeek(false);
    };

    const handleSidebarStateToggle = useCallback(() => {
        setSidebarState(current => {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                return current === 'hidden' ? 'expanded' : 'hidden';
            }
            const states: SidebarState[] = ['expanded', 'rail', 'compact', 'hidden'];
            const currentIndex = states.indexOf(current);
            const nextIndex = (currentIndex + 1) % states.length;
            return states[nextIndex];
        });
    }, [setSidebarState]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
            if (isInput) return;

            if (e.key === 'Escape') {
                if (isPhone && sidebarState !== 'hidden') {
                    e.preventDefault();
                    setSidebarState('hidden');
                    return;
                }
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                handleSidebarStateToggle();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSidebarStateToggle, isPhone, sidebarState, setSidebarState]);

    const handleScroll = useCallback(() => {
        if (!listRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = listRef.current;
        setScrollState({
            top: scrollTop > 0,
            bottom: Math.ceil(scrollTop + clientHeight) < scrollHeight - 2
        });
    }, []);

    useEffect(() => {
        handleScroll();
        window.addEventListener('resize', handleScroll);
        return () => window.removeEventListener('resize', handleScroll);
    }, [handleScroll, sidebarState, isHoverPeek, isPhone]);
    
    useEffect(() => {
        if (!listRef.current) return;
        const ob = new MutationObserver(() => handleScroll());
        ob.observe(listRef.current, { childList: true, subtree: true });
        return () => ob.disconnect();
    }, [handleScroll]);
    
    useEffect(() => {
        if (!listRef.current) return;
        const activeItem = listRef.current.querySelector('.isb-item-active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeView, activeSubMenu, isPrintCenterOpen]);

    const handleMobileHide = useCallback(() => {
        if (isPhone || window.innerWidth <= 768) {
            setSidebarState('hidden');
        }
    }, [isPhone, setSidebarState]);

    // Swipe left gesture handlers (pointer events)
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.isPrimary) return;
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
            isSwiping: false,
            isVertical: false,
            pointerId: e.pointerId
        };
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStartRef.current;
        if (!drag || e.pointerId !== drag.pointerId) return;
        if (drag.isVertical) return;

        const deltaX = e.clientX - drag.startX;
        const deltaY = e.clientY - drag.startY;

        if (!drag.isSwiping) {
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
                drag.isVertical = true;
                return;
            }
            if (deltaX < -8 && Math.abs(deltaX) > Math.abs(deltaY)) {
                drag.isSwiping = true;
                try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch {
                    // Ignore pointer capture errors if unsupported
                }
            }
        }

        if (drag.isSwiping) {
            const offset = Math.min(0, deltaX);
            setDragOffset(offset);
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStartRef.current;
        if (!drag || e.pointerId !== drag.pointerId) return;

        if (drag.isSwiping && dragOffset !== null) {
            const distance = -dragOffset;
            const elapsed = Date.now() - drag.startTime;
            const velocity = distance / Math.max(1, elapsed);
            if (distance > 60 || (distance > 20 && velocity > 0.3)) {
                setSidebarState('hidden');
            }
        }

        setDragOffset(null);
        dragStartRef.current = null;
    }, [dragOffset, setSidebarState]);

    const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStartRef.current;
        if (!drag || e.pointerId !== drag.pointerId) return;

        setDragOffset(null);
        dragStartRef.current = null;
    }, []);

    const showManagement = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientAccounting';
    const showLogistics = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor';
    const showTools = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor';

    const panelStyle: React.CSSProperties = {
        width: isPhone ? 'min(280px, 85vw)' : (isHoverPeek ? '240px' : 'calc(var(--sidebar-width) - 24px)'),
        transform: isPhone
            ? (dragOffset !== null
                ? `translateX(${dragOffset}px)`
                : (sidebarState === 'hidden' ? 'translateX(calc(-100% - 24px))' : 'translateX(0)'))
            : (sidebarState === 'hidden' ? 'translateX(-150%)' : 'translateX(0)'),
        opacity: sidebarState === 'hidden' ? 0 : 1,
        pointerEvents: sidebarState === 'hidden' ? 'none' : 'auto'
    };

    return (
        <>
        {sidebarState === 'hidden' && (
            <button 
                className="isb-edge-tab hidden md:flex" 
                onClick={() => setSidebarState('expanded')}
                aria-label={tr("Show sidebar")}
            >
                <ChevronsRight size={16} />
            </button>
        )}
        {isPhoneDrawerOpen && (
            <div 
                className="isb-scrim" 
                onClick={() => setSidebarState('hidden')}
                aria-hidden="true"
            />
        )}
        <LazyMotion features={domAnimation}>
        <div 
            className={`isb-panel ui-root ${isPhone ? 'isb-drawer' : ''} ${dragOffset !== null ? 'isb-dragging' : ''}`} 
            style={panelStyle}
            role={isPhoneDrawerOpen ? 'dialog' : undefined}
            aria-modal={isPhoneDrawerOpen ? true : undefined}
            aria-label={isPhoneDrawerOpen ? tr("Main menu") : undefined}
            tabIndex={isPhoneDrawerOpen ? -1 : undefined}
            onPointerDown={isPhoneDrawerOpen ? handlePointerDown : undefined}
            onPointerMove={isPhoneDrawerOpen ? handlePointerMove : undefined}
            onPointerUp={isPhoneDrawerOpen ? handlePointerUp : undefined}
            onPointerCancel={isPhoneDrawerOpen ? handlePointerCancel : undefined}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="isb-header relative flex-col">
                <div 
                    className="isb-top flex flex-col items-center justify-center cursor-pointer w-full"
                    onClick={handleSidebarStateToggle}
                    title={tr("Toggle Sidebar")}
                    role="button"
                >
                    {showExpanded ? (
                        <>
                            <OnyxLogo className="w-16 h-16 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95" />
                            <div className="isb-logo-text isb-height-aware mt-1 text-white opacity-80 font-bold tracking-widest text-sm">Onyx.mx</div>
                        </>
                    ) : (
                        <OnyxMiniLogo className="w-10 h-10 transition-transform duration-300 hover:scale-105 active:scale-95 mt-2" />
                    )}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); handleSidebarStateToggle(); }}
                    className={`isb-collapse-btn ${showExpanded ? 'absolute right-3 top-3 isb-height-aware-collapse' : 'mt-2'} text-white/40 hover:text-white`}
                    aria-label={tr("Toggle Sidebar")}
                >
                    {sidebarState === 'expanded' ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
                </button>
            </div>

            <div 
                ref={listRef}
                onScroll={handleScroll}
                className={`isb-list isb-list--scrollable ${scrollState.top ? 'isb-list--more-top' : ''} ${scrollState.bottom ? 'isb-list--more-bottom' : ''}`}
            >
                {showManagement && (
                    <SidebarSection title={tr("Management")} show={true} isCompact={isCompact} isRail={isRail} isHoverPeek={isHoverPeek}>
                        {user?.role === 'Developer' && (
                            <NavItemWithSubmenuComponent
                                viewId="admin"
                                label={tr("Admin")}
                                icon="shield"
                                subItems={[
                                    { id: 'control', label: tr("Control Center"), icon: 'shield', action: () => { setActiveView('control'); handleMobileHide(); }, isActive: activeView === 'control' }
                                ]}
                                isCompact={isCompact}
                                isRail={isRail}
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
                                isRail={isRail}
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
                                isRail={isRail}
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
                                isRail={isRail}
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
                                isRail={isRail}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}

                {showLogistics && (
                    <SidebarSection title={tr("Logistics")} show={true} isCompact={isCompact} isRail={isRail} isHoverPeek={isHoverPeek}>
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <NavItem
                                icon={Album}
                                label={tr("Inventory")}
                                isActive={activeView === 'inventory'}
                                action={() => { setActiveView('inventory'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isRail={isRail}
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
                                isRail={isRail}
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
                                isRail={isRail}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}

                {showTools && (
                    <SidebarSection title={tr("Tools")} show={true} isCompact={isCompact} isRail={isRail} isHoverPeek={isHoverPeek}>
                        {(user?.role === 'Developer' || user?.role === 'Admin') && (
                            <NavItemWithSubmenuComponent
                                viewId="labs"
                                label={tr("Labs")}
                                icon="layers"
                                subItems={[
                                    { id: 'process', label: tr("Process"), icon: 'pipette', action: () => { setActiveView('process'); handleMobileHide(); }, isActive: activeView === 'process' },
                                    { id: 'threed', label: tr("3D and AR"), icon: 'rotate-3d', action: () => { setActiveView('threed'); handleMobileHide(); }, isActive: activeView === 'threed' }
                                ]}
                                isCompact={isCompact}
                                isRail={isRail}
                                isHoverPeek={isHoverPeek}
                                onHideSidebarMobile={handleMobileHide}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
                            <NavItem
                                icon={Printer}
                                label={tr("Print Center")}
                                isActive={isPrintCenterOpen}
                                action={() => { setIsPrintCenterOpen(open => !open); handleMobileHide(); }}
                                isCompact={isCompact}
                                isRail={isRail}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                        {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
                            <NavItem
                                icon={Shell}
                                label={tr("Viewer")}
                                isActive={activeView === 'viewer'}
                                action={() => { setActiveView('viewer'); handleMobileHide(); }}
                                isCompact={isCompact}
                                isRail={isRail}
                                isHoverPeek={isHoverPeek}
                            />
                        )}
                    </SidebarSection>
                )}
            </div>

            <div 
                className={`isb-footer isb-footer-height-aware ${isSettingsOpen ? 'isb-footer-active' : ''}`}
                onClick={() => { setIsSettingsOpen(true); handleMobileHide(); }}
                title={tr("Studio Settings & Manifesto")}
                role="button"
            >
                {showExpanded ? (
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
        </>
    );
};
