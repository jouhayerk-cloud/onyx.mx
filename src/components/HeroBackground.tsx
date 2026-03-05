import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai/react';
import { performanceModeAtom, activeViewAtom } from '../lib/atoms';
import { buildMediaPool } from '../lib/heroMedia';

/**
 * HeroBackground — auto-cycling Ken Burns gallery (images + videos)
 *
 * Uses NEGATIVE z-indices so it sits BEHIND all app content without
 * breaking stacking contexts or fighting app-container z-index.
 *
 * Layering:
 *   z-index: -2  →  blurred bg image (Ken Burns)
 *   z-index: -1  →  scrim (theme color overlay)
 *   z-index: auto →  app-container and all UI (naturally on top)
 *
 * Performance mode ON  → static gradient, zero animations
 * Performance mode OFF → cycling images/videos with Ken Burns + crossfade
 */

const IMAGE_INTERVAL_MS = 8000;
type Slide = { type: 'img' | 'video'; url: string };

export const HeroBackground = () => {
    const performanceMode = useAtomValue(performanceModeAtom);
    const activeView = useAtomValue(activeViewAtom);
    const [pool] = useState<Slide[]>(() => buildMediaPool());
    const [idx, setIdx] = useState(0);
    const [opacity, setOpacity] = useState(1);
    const [loaded, setLoaded] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const current = pool[idx] ?? pool[0];
    const next = pool[(idx + 1) % pool.length];

    const advance = () => {
        setOpacity(0);
        setTimeout(() => {
            setIdx(i => (i + 1) % pool.length);
            setLoaded(false);
            setOpacity(1);
        }, 900);
    };

    useEffect(() => {
        if (performanceMode || current?.type !== 'img') return;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (loaded) timerRef.current = setTimeout(advance, IMAGE_INTERVAL_MS);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [current?.url, current?.type, loaded, performanceMode]);

    // ── Performance mode: solid theme-aware background, no media, no animation
    if (performanceMode) {
        return (
            <div
                aria-hidden="true"
                className="perf-mode-bg"
                style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: -2 }}
            />
        );
    }

    if (activeView !== 'inventory' && activeView !== 'store') {
        return null;
    }

    if (pool.length === 0) return null;

    const mediaStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'blur(10px) brightness(0.45) saturate(1.2)',
        transformOrigin: 'center center',
        transition: 'opacity 0.9s ease',
        opacity,
        zIndex: -2,  // BEHIND everything — no stacking context conflict
    };

    return (
        <>
            {/* Blurred background image / video at z:-2 */}
            {current?.type === 'img' ? (
                <img
                    key={`img-${current.url}`}
                    src={current.url}
                    aria-hidden="true"
                    onLoad={() => setLoaded(true)}
                    onError={() => { setLoaded(true); advance(); }}
                    style={{
                        ...mediaStyle,
                        animation: 'ken-burns 28s ease-in-out infinite',
                    }}
                />
            ) : (
                <video
                    key={`vid-${current.url}`}
                    src={current.url}
                    aria-hidden="true"
                    autoPlay
                    muted
                    playsInline
                    loop={false}
                    onCanPlay={() => setLoaded(true)}
                    onEnded={advance}
                    onError={() => { setLoaded(true); advance(); }}
                    style={{ ...mediaStyle, animation: 'none' }}
                />
            )}

            {/* Preload next image */}
            {next?.type === 'img' && (
                <img
                    key={`pre-${next.url}`}
                    src={next.url}
                    aria-hidden="true"
                    style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -3 }}
                />
            )}

            {/* Scrim at z:-1 — between image and app UI */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'var(--app-bg-solid, #0a0a0f)',
                    opacity: 0.65,
                    pointerEvents: 'none',
                    zIndex: -1,
                }}
            />
        </>
    );
};
