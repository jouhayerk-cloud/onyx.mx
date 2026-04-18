import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

export function PullToRefresh() {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // threshold in px to trigger refresh
    const PULL_THRESHOLD = 80;
    
    // We use refs to track touch state synchronously without re-rendering the whole tree
    const touchStartRef = useRef<number | null>(null);
    const activeRef = useRef(false);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            // Only activate if we are at the very top of the page
            if (window.scrollY <= 5 || document.documentElement.scrollTop <= 5) {
                touchStartRef.current = e.touches[0].clientY;
                activeRef.current = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!activeRef.current || touchStartRef.current === null) return;

            const pull = e.touches[0].clientY - touchStartRef.current;
            
            // If they are pulling down and are at the top of the viewport
            if (pull > 0 && (window.scrollY <= 5 || document.documentElement.scrollTop <= 5)) {
                // Add some friction so it doesn't pull down too fast
                const frictionPull = Math.min(pull * 0.4, PULL_THRESHOLD + 40);
                setPullDistance(frictionPull);
            } else {
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
                    // trigger refresh
                    setTimeout(() => {
                        window.location.reload();
                    }, 500); // give it time to show the spinning animation
                    return PULL_THRESHOLD; // hold it at the threshold position
                }
                return 0; // snap back if they didn't pull enough
            });
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    // Only render if there's pull or refresh state
    if (pullDistance === 0 && !isRefreshing) return null;

    const pullPct = Math.min(pullDistance / PULL_THRESHOLD, 1);
    const opacity = Math.max(0, pullPct - 0.1); // fade in after pulling a bit
    const rotation = pullPct * 180; // half rotation while pulling

    return (
        <div 
            className="fixed top-0 left-0 w-full flex justify-center z-[9999] pointer-events-none"
            style={{ 
                transform: `translateY(${Math.max(0, pullDistance - 40)}px)`,
                transition: activeRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
        >
            <div 
                className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-full h-11 w-11 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-opacity duration-300 relative overflow-hidden"
                style={{ opacity: isRefreshing ? 1 : opacity }}
            >
                {/* Subtle sheen */}
                <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent pointer-events-none" />
                
                {isRefreshing ? (
                    <Loader2 className="text-(--main-color) h-5 w-5 animate-spin" />
                ) : (
                    <ArrowDown 
                        className="text-white h-5 w-5 transition-transform" 
                        style={{ 
                            transform: `rotate(${rotation}deg)`,
                            color: pullPct >= 1 ? 'var(--main-color, #10b981)' : 'rgba(255,255,255,0.7)'
                        }}
                    />
                )}
            </div>
        </div>
    );
}
