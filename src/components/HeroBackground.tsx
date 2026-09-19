import { useAtomValue } from 'jotai/react';
import { performanceModeAtom, activeViewAtom } from '../lib/atoms';
import React, { useEffect, useMemo, useState } from 'react';

/**
 * HeroBackground — Dynamic Mesh Gradient
 *
 * Provides a theme-specific mesh gradient that shifts patterns on state
 * changes and global clicks. Talan uses Green/Gold, Aqua uses Cyan/Terracotta
 * (Fluorite, formerly Purple/Mint, was retired — see lib/atoms.tsx).
 *
 * The mesh is also PUBLISHED to the document root as `--mesh-image`, so it can
 * be painted onto foreground surfaces rather than only behind them. SLAB
 * suppresses the background layer entirely (a gradient ground destroys relief —
 * the shadow colours stop matching their surroundings), so under SLAB this
 * variable is the only place the mesh is visible: slab.css blends it into the
 * lit top face of every raised surface. Because those surfaces paint it with
 * `background-attachment: fixed`, they all sample ONE viewport-anchored mesh —
 * a panel top-left and a panel bottom-right catch different colour, the way
 * they would under a real coloured light, and the whole surface set shifts
 * together on each click.
 */
export const HeroBackground = () => {
    const performanceMode = useAtomValue(performanceModeAtom);
    const activeView = useAtomValue(activeViewAtom);
    const [patternSeed, setPatternSeed] = useState(0);

    // Debounced click handler — each click triggers an expensive 8-layer gradient repaint.
    // Debouncing at 400ms prevents mobile tap-spam from flooding the paint pipeline.
    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout>;
        const handleClick = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => setPatternSeed(s => s + 1), 400);
        };
        window.addEventListener('click', handleClick, { passive: true });
        return () => {
            window.removeEventListener('click', handleClick);
            clearTimeout(debounceTimer);
        };
    }, []);

    // Generate unique positions based on view AND click seed
    const positions = useMemo(() => {
        const seed = patternSeed + (activeView.length * 7);
        const getPos = (offset: number) => {
            const x = (Math.abs(Math.sin(seed + offset)) * 100).toFixed(0);
            const y = (Math.abs(Math.cos(seed + offset * 1.5)) * 100).toFixed(0);
            return `${x}% ${y}%`;
        };
        return [getPos(1), getPos(2), getPos(3), getPos(4), getPos(5), getPos(6), getPos(7), getPos(8)];
    }, [activeView, patternSeed]);

    // The eight mesh stops, in one place. `tint` wraps each colour so the same
    // eight positions can be emitted twice: opaque for the backdrop, diluted for
    // the foreground veil.
    const buildMesh = useMemo(() => (tint: (c: string) => string) => `
            radial-gradient(at ${positions[0]}, ${tint('var(--c1)')} 0px, transparent 60%),
            radial-gradient(at ${positions[1]}, ${tint('var(--c2)')} 0px, transparent 60%),
            radial-gradient(at ${positions[2]}, ${tint('var(--c3)')} 0px, transparent 60%),
            radial-gradient(at ${positions[3]}, ${tint('var(--c4)')} 0px, transparent 60%),
            radial-gradient(at ${positions[4]}, ${tint('var(--c5)')} 0px, transparent 60%),
            radial-gradient(at ${positions[5]}, ${tint('var(--c6, var(--c1))')} 0px, transparent 60%),
            radial-gradient(at ${positions[6]}, ${tint('var(--main-color)')} 0px, transparent 70%),
            radial-gradient(at ${positions[7]}, ${tint('var(--secondary-color)')} 0px, transparent 60%)
        `, [positions]);

    const meshImage = useMemo(() => buildMesh(c => c), [buildMesh]);

    // The foreground copy, and deliberately NOT the same eight layers.
    //
    // Two reasons it collapses to one. Paint cost: the veil is carried by every
    // panel, tile, sidebar and header at once, and it is viewport-anchored, so
    // each one repaints on scroll — eight fixed radial gradients per surface is
    // a real frame budget, one linear gradient is not. Correctness: layered
    // background properties are POSITIONAL lists, so the veil's layer count has
    // to stay fixed or `background-attachment` silently slides onto the wrong
    // layer and pins the sheen to the viewport, which flattens the relief. One
    // layer means the pairing in slab.css is always `fixed, scroll`.
    //
    // Every stop is pre-diluted toward transparent so the veil TINTS the surface
    // instead of repainting it — the highlight and shadow are computed from
    // --slab-hi / --slab-sh and only read correctly while the surface stays near
    // --slab. Strength is a CSS knob (--mesh-veil-strength) so a theme can tune
    // it without touching this file.
    const meshVeil = useMemo(() => {
        const seed = patternSeed + (activeView.length * 7);
        const angle = Math.round(Math.abs(Math.sin(seed)) * 360);
        const veil = (c: string) => `color-mix(in srgb, ${c} var(--mesh-veil-strength, 22%), transparent)`;
        return `linear-gradient(${angle}deg,
            ${veil('var(--main-color)')} 0%,
            ${veil('var(--c4)')} 38%,
            ${veil('var(--secondary-color)')} 100%)`;
    }, [patternSeed, activeView]);

    // Publish both so foreground surfaces can sample the mesh. Published even in
    // performance mode — one extra `background-image` on an already-painted
    // surface costs a fraction of the eight-layer fixed backdrop, and it keeps
    // the app's colour identity when the backdrop itself is switched off.
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--mesh-image', meshImage);
        root.style.setProperty('--mesh-veil', meshVeil);
        return () => {
            root.style.removeProperty('--mesh-image');
            root.style.removeProperty('--mesh-veil');
        };
    }, [meshImage, meshVeil]);

    if (performanceMode) {
        return (
            <div
                className="fixed inset-0 z--2"
                style={{ background: 'var(--performance-bg)' }}
            />
        );
    }

    const meshStyle = {
        backgroundImage: meshImage,
        backgroundColor: 'var(--app-bg-solid, #000000)',
        opacity: 0.75
    };

    return (
        <div
            className="fixed inset-0 overflow-hidden z--2 pointer-events-none select-none transition-opacity duration-[2000ms] ease-in-out"
            style={{ ...meshStyle, transform: 'translateZ(0)' }}
        />
    );
};
