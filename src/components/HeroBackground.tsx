import { useAtomValue } from 'jotai/react';
import { performanceModeAtom, activeViewAtom } from '../lib/atoms';

/**
 * HeroBackground — Unified Global Mesh Gradient
 * 
 * Provides a high-fidelity, multi-color mesh gradient that changes its pattern
 * based on the active application view, creating a unique atmosphere for 
 * each module without the performance cost of animations.
 */
export const HeroBackground = () => {
    const performanceMode = useAtomValue(performanceModeAtom);
    const activeView = useAtomValue(activeViewAtom);

    // Generate deterministic but unique positions/scales for each view
    const getViewPattern = (view: string) => {
        const patterns: Record<string, string[]> = {
            'inventory': ['10% 20%', '90% 15%', '80% 85%', '15% 90%', '50% 50%', '30% 70%'],
            'logistics': ['0% 50%', '100% 50%', '50% 0%', '50% 100%', '20% 20%', '80% 80%'],
            'finance':   ['15% 15%', '85% 25%', '75% 75%', '25% 85%', '50% 10%', '10% 50%'],
            'store':     ['40% 10%', '60% 90%', '10% 40%', '90% 60%', '50% 50%', '0% 0%'],
            'upload':    ['30% 30%', '70% 70%', '30% 70%', '70% 30%', '50% 50%', '100% 100%'],
            'control':   ['10% 90%', '90% 10%', '50% 0%', '50% 100%', '0% 0%', '100% 100%'],
            'dashboard': ['25% 25%', '75% 25%', '25% 75%', '75% 75%', '50% 50%', '50% 0%'],
            'default':   ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '50% 50%', '50% 50%']
        };
        return patterns[view] || patterns['default'];
    };

    if (performanceMode) {
        return (
            <div 
                className="fixed inset-0 z--2" 
                style={{ background: 'var(--performance-bg)' }}
            />
        );
    }

    const p = getViewPattern(activeView);

    const meshStyle = {
        background: `
            radial-gradient(at ${p[0]}, var(--c1) 0px, transparent 65%),
            radial-gradient(at ${p[1]}, var(--c2) 0px, transparent 65%),
            radial-gradient(at ${p[2]}, var(--c3) 0px, transparent 65%),
            radial-gradient(at ${p[3]}, var(--c4) 0px, transparent 65%),
            radial-gradient(at ${p[4]}, var(--c5) 0px, transparent 65%),
            radial-gradient(at ${p[5]}, var(--c6, var(--c1)) 0px, transparent 65%),
            radial-gradient(at 50% 50%, var(--main-color) 0px, transparent 70%),
            radial-gradient(at 20% 80%, var(--secondary-color) 0px, transparent 60%)
        `,
        backgroundColor: 'var(--app-bg-solid, #0a0a0f)',
        opacity: 0.8 // Subtle softness
    };

    return (
        <div 
            className="fixed inset-0 overflow-hidden z--2 pointer-events-none select-none transition-all duration-[1500ms] ease-in-out" 
            style={meshStyle} 
        />
    );
};
