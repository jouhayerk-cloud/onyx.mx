import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import toast from '../../features/onyxIsland/notify/toast';
import { tr } from '../../lib/i18n';
import { hasUnsavedWork } from '../../lib/workGuard';

export function PullToRefresh() {
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // threshold in px to trigger refresh - increased for more deliberate action
    const PULL_THRESHOLD = 150;
    const MIN_PULL_FOR_INDICATOR = 20;
    
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);
    const activeRef = useRef(false);
    const pullDistanceRef = useRef(0);
    // true from the moment a second finger touches until every finger is lifted: a pinch (or the finger left after one) never refreshes
    const multiTouchRef = useRef(false);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const arrowRef = useRef<SVGSVGElement>(null);

    // pinch-zoomed pages: the visual viewport scale is not 1, and a one-finger pan of the zoomed page is not a pull
    const isZoomed = () => {
        const vv = window.visualViewport;
        return !!vv && Math.abs(vv.scale - 1) > 0.02;
    };

    const updatePullStyles = (dist: number) => {
        if (!wrapperRef.current) return;
        if (dist < MIN_PULL_FOR_INDICATOR) {
            wrapperRef.current.style.opacity = '0';
            wrapperRef.current.style.transform = 'translateY(-100px)';
            return;
        }

        const capped = Math.min(dist, PULL_THRESHOLD + 60);
        wrapperRef.current.style.opacity = '1';
        wrapperRef.current.style.transform = `translateY(${Math.max(0, capped - 60)}px)`;
        wrapperRef.current.style.transition = 'none';

        const pullPct = Math.min(capped / PULL_THRESHOLD, 1);
        const opacity = Math.min(1, Math.max(0, (capped - MIN_PULL_FOR_INDICATOR) / 40));
        const rotation = pullPct * 180;

        if (bubbleRef.current) {
            bubbleRef.current.style.opacity = `${opacity}`;
            bubbleRef.current.style.scale = `${0.8 + (pullPct * 0.2)}`;   // the bubble's own `scale` style, not a second transform
        }
        if (arrowRef.current) {
            arrowRef.current.style.transform = `rotate(${rotation}deg)`;
            arrowRef.current.style.color = pullPct >= 1 ? '#b8860b' : 'rgba(255,255,255,0.4)';
            arrowRef.current.style.opacity = pullPct > 0.2 ? '1' : '0';
        }
    };

    const resetPullStyles = () => {
        if (wrapperRef.current) {
            wrapperRef.current.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease';
            wrapperRef.current.style.transform = 'translateY(-100px)';
            wrapperRef.current.style.opacity = '0';
        }
    };

    useEffect(() => {
        // Disable native browser pull-to-refresh
        document.body.style.overscrollBehaviorY = 'contain';

        const cancelPull = () => {
            activeRef.current = false;
            touchStartRef.current = null;
            pullDistanceRef.current = 0;
            resetPullStyles();
        };

        const handleTouchStart = (e: TouchEvent) => {
            // Ignore if already refreshing, multi-touch (zooming) or while the page is pinch-zoomed
            if (e.touches.length > 1) multiTouchRef.current = true;
            else multiTouchRef.current = false;   // a fresh single finger starts a new gesture
            if (isRefreshing || e.touches.length > 1 || isZoomed()) {
                cancelPull();
                return;
            }

            // Only activate if we are at the absolute top of the scrollable container
            const scrollContainer = document.querySelector('.app-content');
            const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 0;

            if (isAtTop) {
                touchStartRef.current = { 
                    x: e.touches[0].clientX, 
                    y: e.touches[0].clientY 
                };
                activeRef.current = true;
                pullDistanceRef.current = 0;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 1) multiTouchRef.current = true;
            if (!activeRef.current || touchStartRef.current === null || multiTouchRef.current || isZoomed()) {
                cancelPull();
                return;
            }

            const touch = e.touches[0];
            const pullY = touch.clientY - touchStartRef.current.y;
            const pullX = touch.clientX - touchStartRef.current.x;

            // Ensure the pull is primarily vertical and downward
            if (pullY > 0 && Math.abs(pullY) > Math.abs(pullX) * 1.5) {
                // Apply exponential friction for a more "elastic" feel
                // The further we pull, the harder it gets
                const frictionPull = Math.pow(pullY, 0.85) * 1.5;
                pullDistanceRef.current = frictionPull;
                updatePullStyles(frictionPull);
            } else if (pullY < -10) {
                // If they are scrolling UP, deactivate immediately
                cancelPull();
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const wasMulti = multiTouchRef.current || e.touches.length > 0;
            if (e.touches.length === 0) multiTouchRef.current = false;
            if (!activeRef.current) return;
            activeRef.current = false;
            touchStartRef.current = null;

            const dist = pullDistanceRef.current;
            pullDistanceRef.current = 0;

            // never refresh after a pinch, on a zoomed page, or with unsaved work (a reload would throw it away)
            if (wasMulti || isZoomed()) {
                resetPullStyles();
                return;
            }
            if (hasUnsavedWork()) {
                resetPullStyles();
                toast(tr('You have unsaved work. Save it first, then pull down to refresh.'), { id: 'ptr-unsaved-work', duration: 4000 });
                return;
            }

            if (dist >= PULL_THRESHOLD) {
                setIsRefreshing(true);
                if (wrapperRef.current) {
                    wrapperRef.current.style.transform = `translateY(${PULL_THRESHOLD - 60}px)`;
                    wrapperRef.current.style.opacity = '1';
                    wrapperRef.current.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                }
                setTimeout(() => {
                    window.location.reload();
                }, 800); // Slightly longer for a more premium transition
            } else {
                resetPullStyles();
            }
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
        const handleTouchCancel = () => { multiTouchRef.current = false; cancelPull(); };
        document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
        // zooming mid-pull (the scale changes while a finger is down) cancels the pull
        const vv = window.visualViewport;
        const handleViewport = () => { if (isZoomed()) cancelPull(); };
        vv?.addEventListener('resize', handleViewport);

        return () => {
            document.body.style.overscrollBehaviorY = 'auto';
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
            document.removeEventListener('touchcancel', handleTouchCancel);
            vv?.removeEventListener('resize', handleViewport);
        };
    }, [isRefreshing]);

    return (
        <div 
            ref={wrapperRef}
            className="fixed top-0 left-0 w-full flex justify-center z-[10000] pointer-events-none"
            style={{ 
                transform: isRefreshing ? `translateY(${PULL_THRESHOLD - 60}px)` : 'translateY(-100px)',
                opacity: isRefreshing ? 1 : 0,
                transition: activeRef.current ? 'none' : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease'
            }}
        >
            <div 
                ref={bubbleRef}
                className="bg-black/90 backdrop-blur-2xl border border-white/20 rounded-full h-12 w-12 flex items-center justify-center shadow-2xl shadow-black/50 transition-all duration-300"
                style={{ 
                    opacity: isRefreshing ? 1 : 0,
                    scale: isRefreshing ? 1 : 0.8
                }}
            >
                <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent pointer-events-none" />
                
                {isRefreshing ? (
                    <Loader2 className="text-[#b8860b] h-6 w-6 animate-spin" />
                ) : (
                    <ArrowDown 
                        ref={arrowRef}
                        className="transition-all duration-200" 
                        style={{ 
                            height: '20px',
                            width: '20px',
                            transform: 'rotate(0deg)',
                            color: 'rgba(255,255,255,0.4)',
                            opacity: 0
                        }}
                    />
                )}
            </div>
        </div>
    );
}
