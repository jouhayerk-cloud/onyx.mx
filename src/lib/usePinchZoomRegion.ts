import { useEffect } from 'react';
import { acquirePinchZoom } from './lockZoom';

/**
 * Call in a full-screen image viewer: pinch-zoom is allowed on phones while it is mounted (the rest of the app is locked at 100%,
 * see lib/lockZoom.ts) and the page returns to 100% when it closes. No effect on desktop.
 */
export function usePinchZoomRegion(active = true): void {
    useEffect(() => {
        if (!active) return;
        return acquirePinchZoom();
    }, [active]);
}
