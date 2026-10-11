import { useEffect, useState } from 'react';

const COARSE_QUERY = '(max-width: 719px), (pointer: coarse)';

/**
 * Detects whether the device should use the coarse (mobile) layout.
 * Evaluates '(max-width: 719px), (pointer: coarse)', with a safe default of desktop (false)
 * when matchMedia is missing or during SSR.
 */
export function useCoarseLayout(): boolean {
    const [isCoarse, setIsCoarse] = useState<boolean>(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }
        try {
            return window.matchMedia(COARSE_QUERY).matches;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        try {
            const mql = window.matchMedia(COARSE_QUERY);
            const onChange = (e: MediaQueryListEvent) => {
                setIsCoarse(e.matches);
            };

            if (typeof mql.addEventListener === 'function') {
                mql.addEventListener('change', onChange);
                setIsCoarse(mql.matches);
                return () => {
                    mql.removeEventListener('change', onChange);
                };
            }
        } catch {
            // Ignore matchMedia evaluation failures
        }
    }, []);

    return isCoarse;
}
