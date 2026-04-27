import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

export function PullToRefresh() {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // threshold in px to trigger refresh - increased for more deliberate action
    const PULL_THRESHOLD = 150;
    const MIN_PULL_FOR_INDICATOR = 20;
    
    const touchStartRef = useRef<{ x: number, y: number } | null>(null);
    const activeRef = useRef(false);

    useEffect(() => {
        // Disable native browser pull-to-refresh
        document.body.style.overscrollBehaviorY = 'contain';

        const handleTouchStart = (e: TouchEvent) => {
            // Ignore if already refreshing or multi-touch (zooming)
            if (isRefreshing || e.touches.length > 1) {
                activeRef.current = false;
                return;
            }

            // Only activate if we are at the absolute top of the scrollable container
            const scrollContainer = document.querySelector('.app-content');
            const isAtTop = !scrollContainer || scrollContainer.scrollTop === 0;

            if (isAtTop) {
                touchStartRef.current = { 
                    x: e.touches[0].clientX, 
                    y: e.touches[0].clientY 
                };
                activeRef.current = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!activeRef.current || touchStartRef.current === null || e.touches.length > 1) {
                activeRef.current = false;
                setPullDistance(0);
                return;
            }

            const touch = e.touches[0];
            const pullY = touch.clientY - touchStartRef.current.y;
            const pullX = touch.clientX - touchStartRef.current.x;

            // Ensure the pull is primarily vertical and downward
            if (pullY > 0 && Math.abs(pullY) > Math.abs(pullX) * 1.5) {
                // Check if we are still at the top
                const scrollContainer = document.querySelector('.app-content');
                const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 0;

                if (isAtTop) {
                    // Apply exponential friction for a more "elastic" feel
                    // The further we pull, the harder it gets
                    const frictionPull = Math.pow(pullY, 0.85) * 1.5;
                    
                    // Cap the pull distance to avoid excessive stretching
                    const cappedPull = Math.min(frictionPull, PULL_THRESHOLD + 60);
                    setPullDistance(cappedPull);
                } else {
                    activeRef.current = false;
                    setPullDistance(0);
                }
            } else if (pullY < -10) {
                // If they are scrolling UP, deactivate immediately
                activeRef.current = false;
                setPullDistance(0);
            }
        };

        const handleTouchEnd = () => {
            if (!activeRef.current) return;
            activeRef.current = false;
            touchStartRef.current = null;

            setPullDistance(current => {
                if (current >= PULL_THRESHOLD) {
                    setIsRefreshing(true);
                    setTimeout(() => {
                        window.location.reload();
                    }, 800); // Slightly longer for a more premium transition
                    return PULL_THRESHOLD;
                }
                return 0;
            });
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            document.body.style.overscrollBehaviorY = 'auto';
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isRefreshing]);

    // Don't show indicator for very small pulls to avoid flickering during fast taps
    if (pullDistance < MIN_PULL_FOR_INDICATOR && !isRefreshing) return null;

    const pullPct = Math.min(pullDistance / PULL_THRESHOLD, 1);
    const opacity = Math.min(1, Math.max(0, (pullDistance - MIN_PULL_FOR_INDICATOR) / 40));
    const rotation = pullPct * 180;

    return (
        <div 
            className="fixed top-0 left-0 w-full flex justify-center z-[10000] pointer-events-none"
            style={{ 
                transform: `translateY(${Math.max(0, pullDistance - 60)}px)`,
                transition: activeRef.current ? 'none' : 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
        >
            <div 
                className="bg-black/90 backdrop-blur-2xl border border-white/20 rounded-full h-12 w-12 flex items-center justify-center shadow-2xl shadow-black/50 transition-all duration-300"
                style={{ 
                    opacity: isRefreshing ? 1 : opacity,
                    scale: isRefreshing ? 1 : 0.8 + (pullPct * 0.2)
                }}
            >
                <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent pointer-events-none" />
                
                {isRefreshing ? (
                    <Loader2 className="text-[#b8860b] h-6 w-6 animate-spin" />
                ) : (
                    <ArrowDown 
                        className="transition-all duration-200" 
                        style={{ 
                            height: '20px',
                            width: '20px',
                            transform: `rotate(${rotation}deg)`,
                            color: pullPct >= 1 ? '#b8860b' : 'rgba(255,255,255,0.4)',
                            opacity: pullPct > 0.2 ? 1 : 0
                        }}
                    />
                )}
            </div>
        </div>
    );
}
