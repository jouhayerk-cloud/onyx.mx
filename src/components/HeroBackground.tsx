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
        return <div className="fixed inset-0 bg-(--app-bg-solid) z--2" />;
    }

    return (
        <div className="fixed inset-0 overflow-hidden z--2 pointer-events-none select-none animate-gradient-bg">
            <div className="liquid-blob blob-1" />
            <div className="liquid-blob blob-2" />
            <div className="liquid-blob blob-3" />
            <div className="liquid-blob blob-4" />
            <div className="liquid-blob blob-5" />
            <div className="gradient-overlay-scrim" />
        </div>
    );
};
