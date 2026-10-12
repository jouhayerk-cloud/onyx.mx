/**
 * On phones and tablets the app is a fixed-size surface: pinch-zoom is off. A zoomed page used to leave an empty strip under the app,
 * pan into pull-to-refresh and drop unsaved work. The one exception is a full-screen image gallery, where pinching is how you look
 * at a photo: those viewers call usePinchZoomRegion() (lib/usePinchZoomRegion.ts), which lifts the lock while they are open and puts
 * the page back at 100% when the last one closes.
 *
 * Desktop is untouched: everything here runs only when the primary pointer is a finger (hover: none and pointer: coarse), so a
 * laptop with a touch screen, a trackpad pinch and ctrl+wheel keep the browser's own zoom.
 *
 * How the zoom is blocked, because browsers differ:
 *  - the viewport meta (maximum-scale=1, user-scalable=no), set from here: Android Chrome obeys it, current iOS Safari does not;
 *  - the iOS gesture events (gesturestart/change/end) and two-finger touchmove, cancelled with preventDefault;
 *  - touch-action: pan-x pan-y on html and body (index.css), which keeps the compositor from starting a pinch or a double-tap zoom.
 * Custom two-finger gestures (the 3D views, the truck canvas, the viewer's own pinch) still receive their touch events: only the
 * browser's zoom is cancelled.
 */
const MOBILE_QUERY = '(hover: none) and (pointer: coarse)';
const META_LOCKED = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
const META_ZOOMABLE = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover';

export const isMobileDevice = (): boolean =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;

let regions = 0;
const viewportMeta = () => document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
const zoomAllowed = () => regions > 0;

/** A full-screen image viewer opened: pinch-zoom works until it is released. Returns the release function. */
export function acquirePinchZoom(): () => void {
    if (!isMobileDevice()) return () => { /* desktop: nothing was locked */ };
    regions++;
    document.documentElement.setAttribute('data-pinch-open', '');
    viewportMeta()?.setAttribute('content', META_ZOOMABLE);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        regions = Math.max(0, regions - 1);
        if (regions > 0) return;
        document.documentElement.removeAttribute('data-pinch-open');
        resetPageZoom();
    };
}

/** Back to 100% after a gallery: re-applying the locked viewport makes Android Chrome drop its scale; iOS also gets the scroll reset. */
function resetPageZoom(): void {
    const meta = viewportMeta();
    meta?.setAttribute('content', META_LOCKED);
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.02) {
        window.scrollTo(0, 0);
        // a second pass on the next frame: some browsers only re-read the meta once the zoomed layout has settled
        requestAnimationFrame(() => { meta?.setAttribute('content', META_LOCKED); });
    }
}

export function lockZoom(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !isMobileDevice()) return;
    viewportMeta()?.setAttribute('content', META_LOCKED);

    const stop = (e: Event) => { if (!zoomAllowed() && isMobileDevice() && e.cancelable) e.preventDefault(); };
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener('gesturestart', stop, opts);
    document.addEventListener('gesturechange', stop, opts);
    document.addEventListener('gestureend', stop, opts);
    document.addEventListener('touchmove', (e: TouchEvent) => { if (e.touches.length > 1) stop(e); }, opts);
}
