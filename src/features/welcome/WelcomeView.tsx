import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, activeViewAtom, sidebarStateAtom, logisticsSubTabAtom, inventoryVendorFilterAtom } from '../../lib/atoms';
import { ArrowRight, Sparkles, Plus, CornerDownLeft, Play, Pause, Album, BadgeDollarSign, FilePlus2, Package, Truck, type LucideIcon } from 'lucide-react';
import { InventoryTutorial } from '../inventory/InventoryTutorial';
import { FolderTray } from './hairline/FolderTray';
import { AtmMachine } from './hairline/AtmMachine';
import { LogisticsBand } from './hairline/LogisticsBand';
import { ItemCargoTruck } from './hairline/ItemCargoTruck';
import { PlusTowerLamp } from './hairline/PlusTowerLamp';
import { ChanMascotSprite, type Area } from './ChanMascotSprite';
import { tr } from '../../lib/i18n';
import './welcome.css';

interface ModuleConfig {
    id: Area;
    title: string;
    tag: string;
    sub: string;
    color: string;
    icon: LucideIcon;
    actionLabel: string;
    onOpen: () => void;
    renderFigure: (onRead: (text: string) => void, focused?: boolean) => React.ReactNode;
    ownClicks?: boolean;
}

const ROLES = {
    inventory: ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Client', 'Vendor'],
    finance: ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting'],
    logistics: ['Developer', 'Admin'],
    addEntry: ['Developer', 'Admin', 'Vendor'],
} as const;

export function WelcomeView() {
    const user = useAtomValue(userAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const setSidebarState = useSetAtom(sidebarStateAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);
    const setVendorFilter = useSetAtom(inventoryVendorFilterAtom);

    const [focusedArea, setFocusedArea] = useState<Area | null>(null);
    const [compactedModules, setCompactedModules] = useState<Set<Area>>(() => new Set());
    const [showTutorial, setShowTutorial] = useState(false);
    const [figureReadText, setFigureReadText] = useState('');
    const [isCompactInfo, setIsCompactInfo] = useState(true);
    const [isAutoFloating, setIsAutoFloating] = useState(true);

    const [isMobile, setIsMobile] = useState(() => {
        return typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    });

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const displayName = (user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
        ? user.name.split(' ')[0]
        : user?.email?.split('@')[0] || 'User';

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return tr('Good morning');
        if (hour < 18) return tr('Good afternoon');
        return tr('Good evening');
    };

    const navigateTo = (view: any) => {
        setActiveView(view);
        if (window.innerWidth <= 768) setSidebarState('hidden');
    };

    const openInventory = (vendor: string | null) => {
        setVendorFilter(vendor ? [vendor] : ['All']);
        navigateTo('inventory');
    };

    const role = user?.role as string | undefined;
    const can = (roles: readonly string[]) => !role ? false : roles.includes(role);

    const canInventory = !role || can(ROLES.inventory);
    const canFinance = !role || can(ROLES.finance);
    const canLogistics = !role || can(ROLES.logistics);
    const canAddEntry = !role || can(ROLES.addEntry);

    // Module definitions with colors, actions, Lucide icons, and custom hairline figures
    const modules: ModuleConfig[] = useMemo(() => {
        const list: ModuleConfig[] = [];

        if (canInventory) {
            list.push({
                id: 'inv',
                title: tr('Inventory'),
                tag: 'INVENTORY',
                sub: tr('One folder per vendor. Pick a folder to see its pieces, pricing, and live stock.'),
                color: '#00aeef',
                icon: Album,
                actionLabel: tr('Open Inventory'),
                onOpen: () => openInventory(null),
                ownClicks: true,
                renderFigure: (onRead, focused) => <FolderTray onOpen={openInventory} onRead={onRead} focused={focused} />,
            });
        }

        if (canFinance) {
            list.push({
                id: 'fin',
                title: tr('Finances'),
                tag: 'FINANCES',
                sub: tr('Vault payments, ATM cash operations, vendor ledgers, and accounting balances.'),
                color: '#f2b53c',
                icon: BadgeDollarSign,
                actionLabel: tr('Open Finances'),
                onOpen: () => navigateTo('finance'),
                ownClicks: true,
                renderFigure: (onRead, focused) => <AtmMachine onOpen={() => navigateTo('finance')} onRead={onRead} focused={focused} />,
            });
        }

        if (canAddEntry) {
            list.push({
                id: 'add',
                title: tr('Add Entry'),
                tag: 'ADD ENTRY',
                sub: tr('Create new inventory item, upload single piece, or process vendor batch XLSX intake.'),
                color: '#b85bf8',
                icon: FilePlus2,
                actionLabel: tr('Add New Entry'),
                onOpen: () => navigateTo('upload'),
                ownClicks: true,
                renderFigure: (onRead, focused) => <PlusTowerLamp onOpen={() => navigateTo('upload')} onRead={onRead} focused={focused} />,
            });
        }

        if (canLogistics) {
            list.push({
                id: 'log',
                title: tr('Logistics'),
                tag: 'LOGISTICS',
                sub: tr('Warehouse crate packing, Boxes.py laser cut stencils, and pallet inventory.'),
                color: '#35d0a2',
                icon: Package,
                actionLabel: tr('Open Logistics'),
                onOpen: () => { setLogisticsSubTab('empty'); navigateTo('warehouse'); },
                ownClicks: true,
                renderFigure: (onRead, focused) => <LogisticsBand onOpen={() => { setLogisticsSubTab('empty'); navigateTo('warehouse'); }} onRead={onRead} focused={focused} />,
            });

            list.push({
                id: 'shp',
                title: tr('Shipping'),
                tag: 'SHIPPING',
                sub: tr('Fleet trucking manifests, bill of ladings, dispatch status, and delivery routes.'),
                color: '#ff7a45',
                icon: Truck,
                actionLabel: tr('Open Shipping'),
                onOpen: () => { setLogisticsSubTab('shipping'); navigateTo('trucking'); },
                ownClicks: true,
                renderFigure: (onRead, focused) => <ItemCargoTruck onOpen={() => { setLogisticsSubTab('shipping'); navigateTo('trucking'); }} onRead={onRead} focused={focused} />,
            });
        }

        return list;
    }, [canInventory, canFinance, canAddEntry, canLogistics]);

    const activeModule = useMemo(() => {
        return modules.find(m => m.id === focusedArea) || null;
    }, [modules, focusedArea]);

    // ── Mobile Vertical Carousel Auto-Scroll & Center Detection ────────────
    const carouselTrackRef = useRef<HTMLDivElement | null>(null);
    const isUserInteractingRef = useRef(false);
    const resumeTimerRef = useRef<number | null>(null);
    const dragStartYRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);
    const hasDraggedRef = useRef(false);

    const updateCenteredAndCompacted = useCallback(() => {
        const el = carouselTrackRef.current;
        if (!el) return;
        const trackCenterY = el.scrollTop + el.clientHeight / 2;
        let closestMod: Area | null = null;
        let closestDist = Infinity;

        const outOfView = new Set<Area>();

        const units = el.querySelectorAll<HTMLElement>('.wl-bubble-unit');
        units.forEach(unit => {
            const unitCenterY = unit.offsetTop + unit.offsetHeight / 2;
            const dist = Math.abs(trackCenterY - unitCenterY);
            const area = unit.getAttribute('data-area') as Area | null;

            if (dist < closestDist) {
                closestDist = dist;
                closestMod = area;
            }

            // Detect whether this module bubble is out of the track's visible viewport
            const unitTop = unit.offsetTop - el.scrollTop;
            const unitBottom = unitTop + unit.offsetHeight;
            const isVisible = unitBottom > 35 && unitTop < el.clientHeight - 35;

            if (area && !isVisible) {
                outOfView.add(area);
            }
        });

        if (closestMod && closestMod !== focusedArea) {
            setFocusedArea(closestMod);
        }
        setCompactedModules(outOfView);
    }, [focusedArea]);

    // Initial mount sync for mobile compacted status
    useEffect(() => {
        if (!isMobile) return;
        const timer = setTimeout(() => {
            updateCenteredAndCompacted();
        }, 60);
        return () => clearTimeout(timer);
    }, [isMobile, updateCenteredAndCompacted]);

    // Continuous auto-scroll loop for mobile vertical carousel
    useEffect(() => {
        if (!isMobile) return;
        const el = carouselTrackRef.current;
        if (!el) return;
        const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;

        let raf = 0;
        let dir = 1;
        const speed = 0.45;

        const step = () => {
            if (isAutoFloating && !isUserInteractingRef.current && el) {
                const maxScroll = el.scrollHeight - el.clientHeight;
                if (maxScroll > 10) {
                    el.scrollTop += dir * speed;
                    updateCenteredAndCompacted();
                    if (el.scrollTop >= maxScroll - 2) {
                        dir = -1;
                    } else if (el.scrollTop <= 2) {
                        dir = 1;
                    }
                }
            }
            raf = requestAnimationFrame(step);
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [isMobile, isAutoFloating, updateCenteredAndCompacted]);

    const handleTouchStart = (e: React.PointerEvent<HTMLDivElement>) => {
        isUserInteractingRef.current = true;
        hasDraggedRef.current = false;
        dragStartYRef.current = e.clientY;
        if (carouselTrackRef.current) {
            dragStartScrollTopRef.current = carouselTrackRef.current.scrollTop;
        }
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };

    const handleTouchMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isUserInteractingRef.current || !carouselTrackRef.current) return;
        const dy = e.clientY - dragStartYRef.current;
        if (Math.abs(dy) > 4) {
            hasDraggedRef.current = true;
            carouselTrackRef.current.scrollTop = dragStartScrollTopRef.current - dy;
            updateCenteredAndCompacted();
        }
    };

    const handleTouchEnd = () => {
        isUserInteractingRef.current = false;
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = window.setTimeout(() => {
            isUserInteractingRef.current = false;
        }, 3500);
    };

    const scrollToModule = (modId: Area) => {
        const el = carouselTrackRef.current;
        if (!el) return;
        const target = el.querySelector<HTMLElement>(`[data-area="${modId}"]`);
        if (target) {
            isUserInteractingRef.current = true;
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            setFocusedArea(modId);
            setCompactedModules(prev => {
                const next = new Set(prev);
                next.delete(modId);
                return next;
            });
            if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = window.setTimeout(() => {
                isUserInteractingRef.current = false;
                updateCenteredAndCompacted();
            }, 3500);
        }
    };

    // Shared Info Chat Bubble Component
    const renderInfoPanel = () => (
        <div
            className={`wl-info-panel ${activeModule ? 'wl-info-panel--active' : 'wl-info-panel--idle'} ${isCompactInfo ? '' : 'wl-info-panel--expanded'}`}
            style={{
                '--panel-accent': activeModule?.color || 'var(--main-color, #00aeef)',
            } as React.CSSProperties}
            onClick={() => setIsCompactInfo(prev => !prev)}
        >
            {activeModule ? (
                <div className="wl-info-content animate-in fade-in duration-200" key={activeModule.id}>
                    <div className="wl-info-header">
                        <div className="wl-info-tag">
                            <span className="wl-info-tag-dot" style={{ background: activeModule.color }} />
                            <span>{activeModule.tag}</span>
                        </div>
                        {figureReadText && !figureReadText.includes('Rest') && (
                            <span className="wl-info-live-read">
                                {figureReadText}
                            </span>
                        )}
                        <button
                            type="button"
                            className="wl-info-toggle-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsCompactInfo(prev => !prev);
                            }}
                            aria-label={isCompactInfo ? tr('Expand Details') : tr('Compact View')}
                        >
                            {isCompactInfo ? tr('Expand') : tr('Compact')}
                        </button>
                    </div>
                    <h2 className="wl-info-title">{activeModule.title}</h2>
                    <p className="wl-info-sub">{activeModule.sub}</p>
                    <div className="wl-info-action-row" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="wl-info-action-btn"
                            onClick={activeModule.onOpen}
                            style={{
                                background: `radial-gradient(120% 120% at 50% 0%, ${activeModule.color}24 0%, ${activeModule.color}08 100%)`,
                                borderColor: `${activeModule.color}66`,
                            }}
                        >
                            <span>{activeModule.actionLabel}</span>
                            <ArrowRight size={13} />
                        </button>
                        <span className="wl-info-hint">
                            <CornerDownLeft size={11} /> {tr('press Enter to open')}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="wl-info-content wl-info-content--greeting animate-in fade-in duration-200">
                    <div className="wl-info-greeting-badge">
                        <Sparkles size={11} className="text-(--main-color)" />
                        <span>{tr('Active Workspace')}</span>
                    </div>
                    <h1 className="wl-info-hello">
                        {getGreeting()}, <b>{displayName}</b>
                    </h1>
                    <p className="wl-info-lede">
                        {tr('Focus or tap any floating module orb to inspect inventory, manage finances, add stock, or coordinate logistics.')}
                    </p>
                    <div className="wl-info-idle-hint">
                        <span>{tr('Hover a bubble to view details')}</span>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="wl-root ui-root flex flex-col h-full w-full overflow-hidden custom-scrollbar bg-transparent relative">
            {/* Ambient Background Glow Orbs */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full blur-[130px] transition-colors duration-700"
                    style={{
                        background: activeModule?.color ? `radial-gradient(circle, ${activeModule.color} 0%, transparent 70%)` : 'var(--main-color, #00aeef)',
                        opacity: 0.12,
                    }}
                />
                <div
                    className="absolute top-[60%] -right-[10%] w-[45%] h-[45%] rounded-full blur-[140px] transition-colors duration-700"
                    style={{
                        background: activeModule?.color ? `radial-gradient(circle, ${activeModule.color} 0%, transparent 70%)` : 'var(--main-color, #00aeef)',
                        opacity: 0.1,
                    }}
                />
            </div>

            <div className="flex-1 overflow-y-auto py-4 sm:py-8 flex flex-col items-center w-full px-3 sm:px-8 md:px-12 z-10 relative">

                {/* ── DESKTOP 3-COLUMN SPATIAL FLANKING LAYOUT (min-width: 769px) ── */}
                <div className="wl-organic-layout wl-desktop-layout">

                    {/* Left Flank: Inventory & Finances */}
                    <div className="wl-flank wl-flank--left">
                        {modules.filter(m => m.id === 'inv' || m.id === 'fin').map((mod, i) => (
                            <div
                                key={mod.id}
                                className={`wl-bubble-unit ui-root ${focusedArea === mod.id ? 'wl-bubble-unit--focused' : ''}`}
                                data-area={mod.id}
                                style={{ '--float-idx': i } as React.CSSProperties}
                                tabIndex={0}
                                role="button"
                                aria-label={`${mod.title} - ${mod.tag}`}
                                onClick={mod.onOpen}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        mod.onOpen();
                                    }
                                }}
                                onMouseEnter={() => setFocusedArea(mod.id)}
                                onMouseLeave={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                                onFocus={() => setFocusedArea(mod.id)}
                                onBlur={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                            >
                                <div className="wl-bubble ui-root">
                                    {mod.renderFigure(setFigureReadText, focusedArea === mod.id)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Center Core: Chan Mascot + Compact Info Chat Bubble + Add Entry */}
                    <div className="wl-center-core">
                        <div className="wl-face-stage">
                            <div className="wl-halo">
                                <ChanMascotSprite
                                    size={196}
                                    focusedArea={focusedArea}
                                    onBoop={() => {}}
                                />
                            </div>
                        </div>

                        {renderInfoPanel()}

                        {modules.filter(m => m.id === 'add').map((mod) => (
                            <div
                                key={mod.id}
                                className={`wl-bubble-unit wl-bubble-unit--add ui-root ${focusedArea === mod.id ? 'wl-bubble-unit--focused' : ''}`}
                                data-area={mod.id}
                                style={{ '--float-idx': 2 } as React.CSSProperties}
                                tabIndex={0}
                                role="button"
                                aria-label={`${mod.title} - ${mod.tag}`}
                                onClick={mod.onOpen}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        mod.onOpen();
                                    }
                                }}
                                onMouseEnter={() => setFocusedArea(mod.id)}
                                onMouseLeave={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                                onFocus={() => setFocusedArea(mod.id)}
                                onBlur={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                            >
                                <div className="wl-bubble wl-bubble--add ui-root">
                                    {mod.renderFigure(setFigureReadText, focusedArea === mod.id)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Flank: Logistics & Shipping */}
                    <div className="wl-flank wl-flank--right">
                        {modules.filter(m => m.id === 'log' || m.id === 'shp').map((mod, i) => (
                            <div
                                key={mod.id}
                                className={`wl-bubble-unit ui-root ${focusedArea === mod.id ? 'wl-bubble-unit--focused' : ''}`}
                                data-area={mod.id}
                                style={{ '--float-idx': 3 + i } as React.CSSProperties}
                                tabIndex={0}
                                role="button"
                                aria-label={`${mod.title} - ${mod.tag}`}
                                onClick={mod.onOpen}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        mod.onOpen();
                                    }
                                }}
                                onMouseEnter={() => setFocusedArea(mod.id)}
                                onMouseLeave={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                                onFocus={() => setFocusedArea(mod.id)}
                                onBlur={() => setFocusedArea(prev => prev === mod.id ? null : prev)}
                            >
                                <div className="wl-bubble ui-root">
                                    {mod.renderFigure(setFigureReadText, focusedArea === mod.id)}
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

                {/* ── MOBILE VERTICAL AUTO-SCROLLING FLOATING BUBBLES CAROUSEL ── */}
                <div className="wl-mobile-carousel">
                    {/* Top Mascot with Satellite Lucide Compaction Rails */}
                    <div className="wl-face-stage">
                        <div className="wl-face-orbit-row">
                            {/* Left satellite rail: inv, fin */}
                            <div className="wl-satellite-rail wl-satellite-rail--left">
                                {modules.filter(m => m.id === 'inv' || m.id === 'fin').map(mod => {
                                    const isCompacted = compactedModules.size > 0
                                        ? compactedModules.has(mod.id)
                                        : (focusedArea ? focusedArea !== mod.id : mod.id !== 'inv');
                                    const Icon = mod.icon;
                                    return (
                                        <button
                                            key={mod.id}
                                            type="button"
                                            className={`wl-mini-lucide-bubble ${isCompacted ? 'is-visible' : 'is-hidden'} ${focusedArea === mod.id ? 'is-focused' : ''}`}
                                            style={{ '--mini-accent': mod.color } as React.CSSProperties}
                                            onClick={() => {
                                                if (focusedArea === mod.id) {
                                                    mod.onOpen();
                                                } else {
                                                    scrollToModule(mod.id);
                                                }
                                            }}
                                            aria-label={`${mod.title} shortcut`}
                                            title={mod.title}
                                        >
                                            <Icon size={18} className="wl-mini-icon" />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Center Chan Halo */}
                            <div className="wl-halo">
                                <ChanMascotSprite
                                    size={142}
                                    focusedArea={focusedArea}
                                    onBoop={() => {}}
                                />
                            </div>

                            {/* Right satellite rail: add, log, shp */}
                            <div className="wl-satellite-rail wl-satellite-rail--right">
                                {modules.filter(m => m.id === 'add' || m.id === 'log' || m.id === 'shp').map(mod => {
                                    const isCompacted = compactedModules.size > 0
                                        ? compactedModules.has(mod.id)
                                        : (focusedArea ? focusedArea !== mod.id : true);
                                    const Icon = mod.icon;
                                    return (
                                        <button
                                            key={mod.id}
                                            type="button"
                                            className={`wl-mini-lucide-bubble ${isCompacted ? 'is-visible' : 'is-hidden'} ${focusedArea === mod.id ? 'is-focused' : ''}`}
                                            style={{ '--mini-accent': mod.color } as React.CSSProperties}
                                            onClick={() => {
                                                if (focusedArea === mod.id) {
                                                    mod.onOpen();
                                                } else {
                                                    scrollToModule(mod.id);
                                                }
                                            }}
                                            aria-label={`${mod.title} shortcut`}
                                            title={mod.title}
                                        >
                                            <Icon size={18} className="wl-mini-icon" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {renderInfoPanel()}

                    {/* Vertical Smooth Auto-Scrolling Floating Bubbles Carousel Track */}
                    <div className="wl-carousel-track-container">
                        <div
                            ref={carouselTrackRef}
                            className="wl-carousel-track custom-scrollbar"
                            onPointerDown={handleTouchStart}
                            onPointerMove={handleTouchMove}
                            onPointerUp={handleTouchEnd}
                            onPointerCancel={handleTouchEnd}
                            onScroll={updateCenteredAndCompacted}
                        >
                            {modules.map((mod, index) => {
                                const isCentered = focusedArea === mod.id;
                                return (
                                    <div
                                        key={mod.id}
                                        className={`wl-bubble-unit ui-root ${isCentered ? 'is-centered wl-bubble-unit--focused' : ''}`}
                                        data-area={mod.id}
                                        style={{ '--float-idx': index } as React.CSSProperties}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${mod.title} - ${mod.tag}`}
                                        onClick={() => {
                                            if (hasDraggedRef.current) return;
                                            if (isCentered) {
                                                mod.onOpen();
                                            } else {
                                                scrollToModule(mod.id);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                mod.onOpen();
                                            }
                                        }}
                                    >
                                        <div className="wl-bubble ui-root">
                                            {mod.renderFigure(setFigureReadText, isCentered)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Micro Navigation Dots & Auto-Float Toggle */}
                    <div className="wl-carousel-nav">
                        <div className="wl-carousel-dots" role="tablist" aria-label={tr('Module carousel navigation')}>
                            {modules.map((mod) => (
                                <button
                                    key={mod.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={focusedArea === mod.id}
                                    className={`wl-carousel-dot ${focusedArea === mod.id ? 'is-active' : ''}`}
                                    onClick={() => scrollToModule(mod.id)}
                                    aria-label={mod.title}
                                />
                            ))}
                        </div>

                        <button
                            type="button"
                            className={`wl-carousel-toggle ${isAutoFloating ? 'is-active' : ''}`}
                            onClick={() => setIsAutoFloating(prev => !prev)}
                            aria-label={isAutoFloating ? tr('Pause Auto Float') : tr('Resume Auto Float')}
                        >
                            {isAutoFloating ? <Pause size={10} /> : <Play size={10} />}
                            <span>{isAutoFloating ? tr('Float ON') : tr('Float OFF')}</span>
                        </button>
                    </div>
                </div>

            </div>

            {showTutorial && <InventoryTutorial onClose={() => setShowTutorial(false)} />}
        </div>
    );
}
