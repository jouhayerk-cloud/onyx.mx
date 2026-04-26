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

    if (performanceMode) {
        return (
            <div 
                className="fixed inset-0 z--2" 
                style={{ background: 'var(--performance-bg)' }}
            />
        );
    }

    return (
        <div className="fixed inset-0 overflow-hidden z--2 pointer-events-none select-none mesh-gradient" />
    );
};
