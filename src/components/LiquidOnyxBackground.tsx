import React, { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { Gradient } from '../lib/LiquidGradientMesh';
import { performanceModeAtom, themeAtom } from '../lib/atoms';
import '../styles/liquid-gradient.css';

export const LiquidOnyxBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gradientRef = useRef<any>(null);
    const performanceMode = useAtomValue(performanceModeAtom);
    const theme = useAtomValue(themeAtom);

    useEffect(() => {
        if (!canvasRef.current) return;

        const style = getComputedStyle(document.body);
        const getHex = (cssVal: string, fallback: string) => {
            const val = cssVal.includes('var(') || cssVal.includes('color-mix') ? cssVal : style.getPropertyValue(cssVal).trim();
            if (!val) return fallback;
            if (val.startsWith('#')) return val;
            const ctx = document.createElement("canvas").getContext("2d");
            if (ctx) {
                ctx.fillStyle = val;
                return ctx.fillStyle;
            }
            return fallback;
        };

        const palettes = {
            talan: { // Dark Stone (Dark Mode)
                c1: getHex('--onyx-bg-1-dark', '#1F1E1B'), // Deep stone grey
                c2: getHex('--onyx-bg-2-dark', '#283839'), // Deep slate teal
                c3: getHex('--onyx-bg-3-dark', '#594A31'), // Dark bronze
                c4: getHex('--onyx-bg-4-dark', '#1C1612'), // Deep umber
            },
            aqua: { // Coastal Stone (Light Mode)
                c1: getHex('--onyx-bg-1-light', '#EEE8DB'), // Soft Cream/Bone
                c2: getHex('--onyx-bg-2-light', '#9DC3C4'), // Desaturated Slate/Aqua
                c3: getHex('--onyx-bg-3-light', '#CBAE73'), // Muted Warm Gold
                c4: getHex('--onyx-bg-4-light', '#69584D'), // Dusty Taupe/Brown
            }
        };

        const activePalette = theme === 'talan' ? palettes.talan : palettes.aqua;

        const gradient = new Gradient();
        gradientRef.current = gradient;
        
        // Pass colors directly to bypass the buggy CSS variable polling in LiquidGradientMesh
        gradient.initGradient(canvasRef.current, [
            activePalette.c1,
            activePalette.c2,
            activePalette.c3,
            activePalette.c4
        ]);

        return () => {
            gradient.pause();
            gradient.disconnect();
        };
    }, [theme]); // Re-initialize when theme changes

    // Effect to toggle play/pause when performanceMode changes
    useEffect(() => {
        if (gradientRef.current) {
            if (performanceMode) {
                gradientRef.current.pause();
            } else {
                gradientRef.current.play();
            }
        }
    }, [performanceMode]);

    return (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none">
            <canvas 
                ref={canvasRef} 
                id="gradient-canvas" 
                className="w-full h-full opacity-60"
                data-js-darken-top=""
            />
            <div 
                className="absolute inset-0 pointer-events-none mix-blend-multiply"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)',
                }}
            />
        </div>
    );
};
