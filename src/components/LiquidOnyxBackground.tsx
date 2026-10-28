import React, { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { Gradient } from '../lib/LiquidGradientMesh';
import { performanceModeAtom, themeAtom, visibleInventoryAtom } from '../lib/atoms';
import { gradientSlotsFromShades } from '../lib/canonicalColors';
import { itemShades, hasHexMap } from '../lib/itemShades';
import '../styles/liquid-gradient.css';

// The background's theme colours (the --onyx-bg-* overrides they once read were never defined).
const THEME_COLORS = {
    talan: ['#1e2120', '#222627', '#2f3f40', '#4a3d2c'], // dark mineral slate, slate, subtle teal wave, warm bronze
    aqua: ['#EEE8DB', '#9DC3C4', '#CBAE73', '#69584D'],  // cream / bone, slate aqua, muted gold, dusty taupe
};

export const LiquidOnyxBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gradientRef = useRef<any>(null);
    const performanceMode = useAtomValue(performanceModeAtom);
    const theme = useAtomValue(themeAtom);
    const rows = useAtomValue(visibleInventoryAtom);
    // The palette library: every visible item that has a hex map, in a shuffled ring the clicks walk through.
    const palettesRef = useRef<string[][]>([]);
    const nextRef = useRef(0);
    useEffect(() => {
        const list: string[][] = [];
        for (const r of rows) {
            const d: any = (r as any)?.data || r;
            const sh = d && hasHexMap(d) ? itemShades(d) : null;
            if (sh && sh.length >= 4) list.push(sh);
        }
        for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
        palettesRef.current = list;
        nextRef.current = 0;
    }, [rows]);

    // The theme's own colours: the first frame, and the fallback before any hex maps load.
    const themeRef = useRef(theme);
    themeRef.current = theme;

    // One Gradient for the app's lifetime: a theme change recolours it in place, because a rebuild per theme or
    // language switch left the old WebGL context alive (iOS Safari allows only a handful). No loseContext() on
    // cleanup: React StrictMode remounts on the same canvas, and a lost context there never draws again.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gradient = new Gradient();
        gradientRef.current = gradient;
        gradient.initGradient(canvas, THEME_COLORS[themeRef.current === 'talan' ? 'talan' : 'aqua']);

        // The library's own init path is two requestAnimationFrame hops deep
        // (connect() schedules one, which schedules the mesh/animate setup).
        // Pausing synchronously here used to race that and always win --
        // conf.playing started false and nothing ever flipped it true before
        // the render loop checked it and gave up, so the canvas never painted
        // a single frame on any platform or theme. Wait two frames so the
        // first render actually lands, then stop the animation loop.
        requestAnimationFrame(() => requestAnimationFrame(() => gradient.pause()));

        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const handleClick = () => {
            // Next item's palette (none loaded yet: the theme colours stay).
            const lib = palettesRef.current;
            if (lib.length) {
                const slots = gradientSlotsFromShades(lib[nextRef.current++ % lib.length], themeRef.current === 'talan');
                if (slots.length) gradient.setTargetColors?.(slots);
            }
            if (reducedMotion?.matches) gradient.applyColorsNow?.();
            else gradient.triggerBurst?.();
        };
        window.addEventListener('click', handleClick);

        return () => {
            gradient.pause();
            gradient.disconnect();
            window.removeEventListener('click', handleClick);
            gradientRef.current = null;
        };
    }, []);

    // Theme switch: the theme's colours, at once, on the same Gradient.
    const firstTheme = useRef(true);
    useEffect(() => {
        if (firstTheme.current) { firstTheme.current = false; return; }
        const g = gradientRef.current;
        if (!g) return;
        g.setTargetColors?.(THEME_COLORS[theme === 'talan' ? 'talan' : 'aqua']);
        g.applyColorsNow?.();
    }, [theme]);

    // Performance mode is handled by the initial pause and burst logic now.

    return (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none">
            <canvas 
                ref={canvasRef} 
                id="gradient-canvas" 
                className="w-full h-full"
            />
            <div 
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)',
                }}
            />
        </div>
    );
};
