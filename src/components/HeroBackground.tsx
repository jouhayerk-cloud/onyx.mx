import { useAtomValue } from 'jotai/react';
import { performanceModeAtom } from '../lib/atoms';

/**
 * HeroBackground — Unified Global Animated Gradient
 *
 * This component provides a high-density, shifting liquid gradient background
 * using the theme's core color tokens. Video and image cycling have been 
 * decommissioned for a cleaner, more consistent Studio aesthetic.
 */
export const HeroBackground = () => {
    const performanceMode = useAtomValue(performanceModeAtom);

    return (
        <div 
            aria-hidden="true"
            className={`hero-background-layer ${performanceMode ? 'static-bg' : 'animate-gradient-bg'}`}
            style={{
                position: 'fixed',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: -2,
                userSelect: 'none',
                overflow: 'hidden'
            }}
        >
            <div className="gradient-overlay-scrim" />
        </div>
    );
};
