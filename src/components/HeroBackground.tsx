import { useAtomValue } from 'jotai/react';
import { performanceModeAtom, activeViewAtom } from '../lib/atoms';
import React, { useEffect, useState, useMemo } from 'react';

/**
 * HeroBackground — Dynamic Mesh Gradient
 * 
 * Provides a theme-specific mesh gradient that shifts patterns on state
 * changes and global clicks. Talan uses Green/Gold, Aqua uses Cyan/Terracotta
 * (Fluorite, formerly Purple/Mint, was retired — see lib/atoms.tsx).
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

    if (performanceMode) {
        return (
            <div 
                className="fixed inset-0 z--2" 
                style={{ background: 'var(--performance-bg)' }}
            />
        );
    }

    const meshStyle = {
        backgroundImage: `
            radial-gradient(at ${positions[0]}, var(--c1) 0px, transparent 60%),
            radial-gradient(at ${positions[1]}, var(--c2) 0px, transparent 60%),
            radial-gradient(at ${positions[2]}, var(--c3) 0px, transparent 60%),
            radial-gradient(at ${positions[3]}, var(--c4) 0px, transparent 60%),
            radial-gradient(at ${positions[4]}, var(--c5) 0px, transparent 60%),
            radial-gradient(at ${positions[5]}, var(--c6, var(--c1)) 0px, transparent 60%),
            radial-gradient(at ${positions[6]}, var(--main-color) 0px, transparent 70%),
            radial-gradient(at ${positions[7]}, var(--secondary-color) 0px, transparent 60%)
        `,
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
