import React from 'react';
import { cx } from './types';
import { getCleanImageUrl } from '../../lib/utils';

/** `cutout`: the transparent PNG of the piece alone, when it is not the clean PNG itself (bgreplace + mask). */
export type ThumbKind = 'photo' | 'png' | 'cutout' | 'mask' | 'svg' | 'axo';

export interface ThumbProps {
    src: string;
    /** Decides the ground: a PNG sits on the transparency grid, a mask on black. */
    kind?: ThumbKind;
    /** Corner badge, e.g. "PNG" or "MASK". */
    badge?: string;
    alt?: string;
    size?: 'md' | 'lg' | 'xl';
    /** Makes it a button (angle pickers, opening the viewer). */
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    /** Button thumbs only: marks the one currently shown. */
    current?: boolean;
    title?: string;
    className?: string;
}

const GROUND: Partial<Record<ThumbKind, string>> = {
    png: 'ui-checker',
    cutout: 'ui-checker',
    axo: 'ui-checker',
    svg: 'ui-checker',
    mask: 'ui-black',
};

/**
 * SVG markup is shown through an <img> data URL, where its scripts cannot run.
 * A Drive-hosted SVG is shown through its lh3 image link: Drive serves the
 * file itself as a download (application/octet-stream), which an <img> will
 * not draw, while lh3 returns it rendered as an image.
 */
export function svgSrc(svg: string): string {
    const t = svg.trim();
    if (t.startsWith('<')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`;
    if (/drive\.google\.com/i.test(t)) return getCleanImageUrl(t) || t;
    return t;
}

/**
 * A small media square. Generated outputs keep their real ground at row
 * size, so a mask and a clean PNG are recognisable in the list itself.
 */
export function Thumb({ src, kind = 'photo', badge, alt = '', size = 'md', onClick, current, title, className }: ThumbProps) {
    const cls = cx(
        'ui-thumb',
        `ui-thumb--${kind}`,
        size !== 'md' && `ui-thumb--${size}`,
        GROUND[kind],
        onClick && 'ui-thumb--button',
        className,
    );
    const body = (
        <>
            <img src={kind === 'svg' ? svgSrc(src) : src} alt={onClick ? '' : alt} loading="lazy" decoding="async" draggable={false} />
            {badge && <span className="ui-thumb__badge" aria-hidden="true">{badge}</span>}
        </>
    );
    if (onClick) {
        return (
            <button type="button" className={cls} onClick={onClick} title={title ?? alt}
                aria-label={alt || title} aria-current={current ? 'true' : undefined}>
                {body}
            </button>
        );
    }
    return <span className={cls} title={title}>{body}</span>;
}
