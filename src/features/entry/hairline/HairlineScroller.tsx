import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import './hairlineScroller.css';

export interface HairlineScrollerItem {
    key: string;
    label: string;
    meta?: string;
    node: React.ReactNode;
}

export interface HairlineScrollerProps {
    label: string;
    items: ReadonlyArray<HairlineScrollerItem>;
    value: string | null;
    onChange: (key: string) => void;
    size?: 'type' | 'sub';
    disabled?: boolean;
    freeLabel?: string;
    onFree?: () => void;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
}

/**
 * Reusable horizontally scrollable hairline grid.
 * Collapses to the single chosen element, and re-deploys when clicked.
 * Supports touch swipe, trackpad, shift-wheel, drag-scroll, desktop arrow buttons,
 * edge fades, and roving tabindex keyboard navigation.
 */
export const HairlineScroller: React.FC<HairlineScrollerProps> = ({
    label,
    items,
    value,
    onChange,
    size = 'sub',
    disabled = false,
    freeLabel,
    onFree,
    expanded: propExpanded,
    onExpandedChange,
}) => {
    const uid = useId();
    const trackRef = useRef<HTMLDivElement | null>(null);
    const collapsedBtnRef = useRef<HTMLButtonElement | null>(null);

    const chosenItem = useMemo(
        () => (value ? items.find(it => it.key === value) : undefined),
        [items, value],
    );
    const hasValidChoice = Boolean(chosenItem);

    const isControlled = typeof propExpanded === 'boolean';
    const [uncontrolledExpanded, setUncontrolledExpanded] = useState<boolean>(!value);

    const isExpanded = !hasValidChoice ? true : (isControlled ? (propExpanded ?? false) : uncontrolledExpanded);

    const setExpanded = useCallback(
        (next: boolean) => {
            if (!isControlled) {
                setUncontrolledExpanded(next);
            }
            onExpandedChange?.(next);
        },
        [isControlled, onExpandedChange],
    );

    // Track scroll bounds and overflow for fades & arrow buttons
    const [hasOverflow, setHasOverflow] = useState(false);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = trackRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const maxScroll = scrollWidth - clientWidth;
        const overflows = maxScroll > 2;
        setHasOverflow(overflows);
        setCanScrollLeft(overflows && scrollLeft > 2);
        setCanScrollRight(overflows && scrollLeft < maxScroll - 2);
    }, []);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;

        updateScrollState();
        el.addEventListener('scroll', updateScrollState, { passive: true });
        window.addEventListener('resize', updateScrollState);

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => updateScrollState());
            ro.observe(el);
        }

        return () => {
            el.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
            ro?.disconnect();
        };
    }, [updateScrollState, items.length, isExpanded]);

    // Vertical wheel scrolling sideways without trapping page scroll
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            if (e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
                return;
            }

            const delta = e.deltaY;
            if (delta === 0) return;

            const maxScroll = el.scrollWidth - el.clientWidth;
            if (maxScroll <= 0) return;

            if (delta > 0) {
                if (el.scrollLeft < maxScroll - 1) {
                    e.preventDefault();
                    el.scrollLeft += delta;
                }
            } else {
                if (el.scrollLeft > 1) {
                    e.preventDefault();
                    el.scrollLeft += delta;
                }
            }
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', onWheel);
        };
    }, []);

    // Pointer drag-to-scroll
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartScrollLeftRef = useRef(0);
    const hasDraggedRef = useRef(false);

    // Interactive Auto-Scroll for mobile / touch / expanded discovery
    const isInteractingRef = useRef(false);
    const autoScrollIdleTimerRef = useRef<number | null>(null);

    const pauseAutoScroll = useCallback(() => {
        isInteractingRef.current = true;
        if (autoScrollIdleTimerRef.current) clearTimeout(autoScrollIdleTimerRef.current);
        autoScrollIdleTimerRef.current = window.setTimeout(() => {
            isInteractingRef.current = false;
        }, 4000);
    }, []);

    useEffect(() => {
        if (!isExpanded || !hasOverflow || disabled) return;
        const el = trackRef.current;
        if (!el) return;

        const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;

        let raf = 0;
        let dir = 1;
        const speed = 0.35;

        const step = () => {
            if (!isInteractingRef.current && el) {
                const maxScroll = el.scrollWidth - el.clientWidth;
                if (maxScroll > 6) {
                    el.scrollLeft += dir * speed;
                    if (el.scrollLeft >= maxScroll - 2) {
                        dir = -1;
                    } else if (el.scrollLeft <= 2) {
                        dir = 1;
                    }
                }
            }
            raf = requestAnimationFrame(step);
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [isExpanded, hasOverflow, disabled]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || disabled) return;
        isDraggingRef.current = true;
        hasDraggedRef.current = false;
        dragStartXRef.current = e.clientX;
        if (trackRef.current) {
            dragStartScrollLeftRef.current = trackRef.current.scrollLeft;
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current || !trackRef.current) return;
        const dx = e.clientX - dragStartXRef.current;
        if (Math.abs(dx) > 4) {
            hasDraggedRef.current = true;
            trackRef.current.scrollLeft = dragStartScrollLeftRef.current - dx;
        }
    };

    const handlePointerUp = () => {
        isDraggingRef.current = false;
    };

    const handlePointerCancel = () => {
        isDraggingRef.current = false;
    };

    // Keyboard roving tabindex
    const allKeys = useMemo(
        () => [...items.map(it => it.key), ...(freeLabel && onFree ? ['__free__'] : [])],
        [items, freeLabel, onFree],
    );

    const [focusedIndex, setFocusedIndex] = useState<number>(() => {
        if (value) {
            const idx = items.findIndex(it => it.key === value);
            return idx >= 0 ? idx : 0;
        }
        return 0;
    });

    useEffect(() => {
        if (value) {
            const idx = items.findIndex(it => it.key === value);
            if (idx >= 0) setFocusedIndex(idx);
        }
    }, [value, items]);

    const focusTileByIndex = (index: number) => {
        if (!trackRef.current) return;
        const target = trackRef.current.querySelector<HTMLElement>(`[data-index="${index}"]`);
        if (target) {
            target.focus();
            target.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled || !isExpanded) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const next = Math.min(prev + 1, allKeys.length - 1);
                focusTileByIndex(next);
                return next;
            });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const next = Math.max(prev - 1, 0);
                focusTileByIndex(next);
                return next;
            });
        } else if (e.key === 'Home') {
            e.preventDefault();
            setFocusedIndex(0);
            focusTileByIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            const last = allKeys.length - 1;
            setFocusedIndex(last);
            focusTileByIndex(last);
        } else if (e.key === 'Escape') {
            if (hasValidChoice) {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(false);
                collapsedBtnRef.current?.focus();
            }
        }
    };

    // Selection handlers
    const handleSelect = (key: string) => {
        if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
        }
        onChange(key);
        setExpanded(false);
    };

    const handleFree = () => {
        if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
        }
        onFree?.();
        setExpanded(false);
    };

    // Re-deploy row and scroll chosen tile into view
    const handleReOpen = () => {
        setExpanded(true);
        requestAnimationFrame(() => {
            if (trackRef.current && value) {
                const el = trackRef.current.querySelector<HTMLElement>(`[data-key="${CSS.escape(value)}"]`);
                if (el) {
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    el.scrollIntoView({
                        inline: 'center',
                        block: 'nearest',
                        behavior: reduced ? 'auto' : 'smooth',
                    });
                    el.focus();
                }
            }
        });
    };

    // Arrow buttons scroll handlers
    const handleScrollPrev = () => {
        if (!trackRef.current) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const amount = trackRef.current.clientWidth * 0.8;
        trackRef.current.scrollBy({
            left: -amount,
            behavior: reduced ? 'auto' : 'smooth',
        });
    };

    const handleScrollNext = () => {
        if (!trackRef.current) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const amount = trackRef.current.clientWidth * 0.8;
        trackRef.current.scrollBy({
            left: amount,
            behavior: reduced ? 'auto' : 'smooth',
        });
    };

    const rootClass = [
        'hl-scroller',
        'ui-root',
        `hl-scroller--${size}`,
        isExpanded ? 'is-expanded' : 'is-collapsed',
    ].join(' ');

    return (
        <div className={rootClass}>
            {/* COLLAPSED VIEW: single chosen element button */}
            {chosenItem && (
                <div
                    className="hl-scroller__collapsed-wrap"
                    aria-hidden={isExpanded}
                >
                    <button
                        ref={collapsedBtnRef}
                        type="button"
                        className="hl-scroller__collapsed-btn"
                        aria-expanded={isExpanded}
                        aria-label={`${label}: ${chosenItem.label}. ${tr('Click to change')}`}
                        disabled={disabled}
                        tabIndex={isExpanded ? -1 : 0}
                        onClick={handleReOpen}
                    >
                        <span className="hl-scroller__collapsed-fig">
                            {chosenItem.node}
                        </span>
                        <span className="hl-scroller__collapsed-cap">
                            <span className="hl-scroller__collapsed-label">{chosenItem.label}</span>
                            {chosenItem.meta && (
                                <span className="hl-scroller__collapsed-meta">{chosenItem.meta}</span>
                            )}
                        </span>
                        <span className="hl-scroller__collapsed-affordance" aria-hidden="true">
                            <ChevronDown size={13} className="hl-scroller__chevron" />
                            <span>{tr('Change')}</span>
                        </span>
                    </button>
                </div>
            )}

            {/* EXPANDED VIEW: horizontally scrollable row */}
            <div
                className="hl-scroller__expanded-wrap"
                aria-hidden={!isExpanded}
            >
                {/* Previous Arrow Button */}
                {hasOverflow && (
                    <button
                        type="button"
                        className={`hl-scroller__arrow hl-scroller__arrow--prev ${canScrollLeft ? '' : 'is-hidden'}`}
                        aria-label={tr('Previous')}
                        disabled={disabled || !canScrollLeft}
                        tabIndex={isExpanded ? 0 : -1}
                        onClick={handleScrollPrev}
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}

                {/* Track container with edge fades */}
                <div className="hl-scroller__track-container">
                    <div
                        className={`hl-scroller__fade hl-scroller__fade--left ${canScrollLeft ? 'is-active' : ''}`}
                        aria-hidden="true"
                    />

                    <div
                        ref={trackRef}
                        id={`${uid}-track`}
                        className="hl-scroller__track"
                        role="radiogroup"
                        aria-label={label}
                        aria-orientation="horizontal"
                        tabIndex={-1}
                        onTouchStart={pauseAutoScroll}
                        onWheel={pauseAutoScroll}
                        onMouseEnter={pauseAutoScroll}
                        onFocus={pauseAutoScroll}
                        onPointerDown={(e) => {
                            pauseAutoScroll();
                            handlePointerDown(e);
                        }}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        onKeyDown={(e) => {
                            pauseAutoScroll();
                            handleKeyDown(e);
                        }}
                    >
                        {items.map((item, index) => {
                            const isChosen = item.key === value;
                            const isFocused = focusedIndex === index;

                            return (
                                <button
                                    key={item.key}
                                    data-key={item.key}
                                    data-index={index}
                                    type="button"
                                    role="radio"
                                    aria-checked={isChosen}
                                    aria-label={item.meta ? `${item.label}, ${item.meta}` : item.label}
                                    tabIndex={isExpanded && isFocused ? 0 : -1}
                                    disabled={disabled}
                                    className={`hl-scroller__tile ${isChosen ? 'is-active' : ''}`}
                                    style={{ '--tile-idx': index } as React.CSSProperties}
                                    onClick={() => handleSelect(item.key)}
                                    onFocus={() => setFocusedIndex(index)}
                                >
                                    <span className="hl-scroller__tile-fig">
                                        {item.node}
                                    </span>
                                    <span className="hl-scroller__tile-cap">
                                        <span className="hl-scroller__tile-label">{item.label}</span>
                                        {item.meta && (
                                            <span className="hl-scroller__tile-meta">{item.meta}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}

                        {/* Free / Not Listed Tile */}
                        {freeLabel && onFree && (
                            <button
                                key="__free__"
                                data-key="__free__"
                                data-index={items.length}
                                type="button"
                                role="radio"
                                aria-checked={!value}
                                aria-label={freeLabel}
                                tabIndex={isExpanded && focusedIndex === items.length ? 0 : -1}
                                disabled={disabled}
                                className={`hl-scroller__tile hl-scroller__tile--free ${!value ? 'is-active' : ''}`}
                                style={{ '--tile-idx': items.length } as React.CSSProperties}
                                onClick={handleFree}
                                onFocus={() => setFocusedIndex(items.length)}
                            >
                                <span className="hl-scroller__tile-label">{freeLabel}</span>
                            </button>
                        )}
                    </div>

                    <div
                        className={`hl-scroller__fade hl-scroller__fade--right ${canScrollRight ? 'is-active' : ''}`}
                        aria-hidden="true"
                    />
                </div>

                {/* Next Arrow Button */}
                {hasOverflow && (
                    <button
                        type="button"
                        className={`hl-scroller__arrow hl-scroller__arrow--next ${canScrollRight ? '' : 'is-hidden'}`}
                        aria-label={tr('Next')}
                        disabled={disabled || !canScrollRight}
                        tabIndex={isExpanded ? 0 : -1}
                        onClick={handleScrollNext}
                    >
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
