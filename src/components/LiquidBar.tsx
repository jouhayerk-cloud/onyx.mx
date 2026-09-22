import React, { useEffect, useState } from 'react';

/**
 * The app's top band, as liquid glass.
 *
 * quick-liquid (MIT, amarnath3003/quickLiquid) renders real SVG backdrop
 * refraction — the content behind the bar is displaced and chromatically split
 * at the rim, which is what separates it from a plain backdrop-filter blur.
 * It is loaded LAZILY and only for the styles that want it, for three reasons:
 *
 *   · It is 512KB unpacked. The app already ships a 1MB+ main chunk; this must
 *     not be in it, so the import is dynamic and the bar renders as an ordinary
 *     div until the module resolves. Nothing waits on it.
 *   · The refraction filter costs real paint on every scroll. ROCK is a glass
 *     style and wants it; SLAB-with-glass wants it; a future flat style would
 *     not, so the decision is read from the DOM rather than hardcoded.
 *   · Safari and Firefox fall back to CSS refraction inside the library, so
 *     the bar degrades on its own and we do not branch per browser.
 *
 * Anyone who has asked for less motion or less transparency gets the plain
 * band: the library respects both by default (respectPreferences), and we
 * check ourselves as well so the module is never even fetched.
 */
type Props = React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode };

const wantsGlass = () => {
    if (typeof window === 'undefined') return false;
    const reduced = window.matchMedia('(prefers-reduced-transparency: reduce)').matches
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return false;
    const style = document.documentElement.className;
    return style.includes('style-rock') || style.includes('style-slab');
};

export const LiquidBar: React.FC<Props> = ({ children, ...rest }) => {
    const [Glass, setGlass] = useState<React.ComponentType<any> | null>(null);

    useEffect(() => {
        if (!wantsGlass()) return;
        let alive = true;
        import('quick-liquid/react')
            .then(m => { if (alive) setGlass(() => m.LiquidGlass); })
            // A missing or broken optional dependency must never take the app's
            // header down with it — the plain band is a complete fallback.
            .catch(err => console.warn('[LiquidBar] refraction unavailable:', err));
        return () => { alive = false; };
    }, []);

    if (!Glass) return <div {...rest}>{children}</div>;

    return (
        <Glass
            {...rest}
            config={{
                // 'thin' over 'regular': this bar sits above a dense list and
                // the point is that the list stays visible through it.
                material: 'thin',
                blur: 32,
                // The library tints on top of its own refraction; over a data
                // list anything heavier reads as frosting rather than glass.
                // The theme's own tint is applied to the host in slab-glass.css,
                // so this only has to avoid cancelling it out.
                tintOpacity: 0.12,
                saturation: 1.7,
                refractionStrength: 0.42,
                chromaticAberration: 0.18,
                // The rim is what makes a glass edge read as an edge — SLAB's
                // rule 1 in the library's own terms.
                bezelWidth: 12,
                edgeHighlight: 0.55,
                specularStrength: 0.35,
                // Light from the top left, the same axis every SLAB bevel uses.
                lightAngle: 135,
                elevation: 0,
                borderRadius: 0,
                appearance: 'auto',
                quality: 'medium',
                cursorTracking: false,
                parallax: false,
            }}
        >
            {children}
        </Glass>
    );
};
