import React, { useId, useRef, useState } from 'react';
import { Expand } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { Lightbox } from './Lightbox';
import { Thumb, svgSrc } from './Thumb';
import { cx } from './types';

/**
 * `cutout` is opt-in (not in MEDIA_VIEWS): in bgreplace mode the clean PNG is
 * the repainted photo and the transparent cut-out of the piece is a second,
 * different image, which a screen offers by passing it in `views`.
 */
export type MediaView = 'photo' | 'png' | 'cutout' | 'mask' | 'svg' | 'axo';

export const MEDIA_VIEWS: readonly MediaView[] = ['photo', 'png', 'mask', 'svg', 'axo'];

/** English source strings for the tabs. */
export const MEDIA_VIEW_LABEL: Record<MediaView, string> = {
    photo: 'Photo',
    png: 'Clean PNG',
    cutout: 'Cutout',
    mask: 'Mask',
    svg: 'SVG',
    axo: 'Axo',
};

export interface MediaMeta {
    width?: number;
    height?: number;
    bytes?: number;
    /** Where it came from: "Cloud", "Local", "from photo 1", a model name. */
    source?: string;
    note?: string;
    /** The image has no transparency (a repainted photo), so the meta line does not call it transparent. */
    opaque?: boolean;
}

/** One photo and everything generated from it. */
export interface MediaAngle {
    photo: string;
    png?: string | null;
    cutout?: string | null;
    mask?: string | null;
    /** URL, data URL or raw <svg> markup. */
    svg?: string | null;
    axo?: string | null;
    meta?: Partial<Record<MediaView, MediaMeta>>;
}

export type MediaOutputs = Partial<Record<Exclude<MediaView, 'photo'>, string | null>>;

export interface MediaViewerProps {
    angles: readonly MediaAngle[];
    /**
     * Item-level outputs used when an angle has none of its own: the hero
     * clean PNG (generated_png_url), outline (generated_svg_url) and axo icon
     * (axo_icon_url) are stored once per item, masks once per photo.
     */
    shared?: MediaOutputs;
    /** Controlled angle; omit to let the viewer keep its own. */
    angle?: number;
    defaultAngle?: number;
    onAngleChange?: (index: number) => void;
    view?: MediaView;
    defaultView?: MediaView;
    onViewChange?: (view: MediaView) => void;
    /** Which tabs to offer; all five by default. */
    views?: readonly MediaView[];
    /** Base alt text, e.g. the item id and name. */
    alt: string;
    /** CSS aspect-ratio of the stage; 4 / 3 by default. */
    aspect?: string;
    /** Click the stage to open the lightbox (default true). */
    zoomable?: boolean;
    className?: string;
}

const KIND_GROUND: Record<MediaView, string | undefined> = {
    photo: undefined,
    png: 'ui-checker',
    cutout: 'ui-checker',
    svg: 'ui-checker',
    axo: 'ui-checker',
    mask: 'ui-black',
};

function formatBytes(n?: number): string | undefined {
    if (!n) return undefined;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function useControllable<T>(value: T | undefined, initial: T, onChange?: (v: T) => void): [T, (v: T) => void] {
    const [own, setOwn] = useState<T>(initial);
    const current = value !== undefined ? value : own;
    return [current, (v: T) => { if (value === undefined) setOwn(v); onChange?.(v); }];
}

/**
 * The photo and what the pipeline made from it, side by side in one frame:
 * Photo / Clean PNG / Mask / SVG / Axo. A PNG sits on the transparency grid
 * and a mask on black, so a bad cut-out or an empty matte is visible at a
 * glance; tabs for outputs that were not generated are disabled. Several
 * photos get an angle strip; the meta line gives size and source; the stage
 * opens a zoomable lightbox.
 */
export function MediaViewer({
    angles,
    shared,
    angle: angleProp,
    defaultAngle = 0,
    onAngleChange,
    view: viewProp,
    defaultView = 'photo',
    onViewChange,
    views = MEDIA_VIEWS,
    alt,
    aspect,
    zoomable = true,
    className,
}: MediaViewerProps) {
    const [angle, setAngle] = useControllable(angleProp, defaultAngle, onAngleChange);
    const [view, setView] = useControllable<MediaView>(viewProp, defaultView, onViewChange);
    const [measured, setMeasured] = useState<Record<string, { w: number; h: number }>>({});
    const [lightbox, setLightbox] = useState(false);
    const tabRefs = useRef<Partial<Record<MediaView, HTMLButtonElement | null>>>({});
    const stageId = `ui-mv-${useId()}`;

    const index = Math.min(Math.max(0, angle), Math.max(0, angles.length - 1));
    const current = angles[index];
    const srcFor = (v: MediaView, a: MediaAngle | undefined = current): string | null => {
        if (!a) return null;
        if (v === 'photo') return a.photo || null;
        return a[v] || shared?.[v] || null;
    };
    const available = (v: MediaView) => !!srcFor(v);
    // A view that does not exist for this photo falls back to the photo, so
    // the stage is never blank while a generated tab is still selected.
    const shown: MediaView = available(view) ? view : 'photo';
    const src = srcFor(shown);
    const displaySrc = src && shown === 'svg' ? svgSrc(src) : src;

    const viewLabel = tr(MEDIA_VIEW_LABEL[shown]);
    const metaOf = current?.meta?.[shown];
    const dims = metaOf?.width && metaOf?.height
        ? { w: metaOf.width, h: metaOf.height }
        : (src ? measured[src] : undefined);
    const meta = [
        shown === 'photo'
            ? (angles.length > 1 ? `${tr('Photo')} ${index + 1} / ${angles.length}` : tr('Photo'))
            : viewLabel,
        dims ? `${dims.w}×${dims.h}` : undefined,
        formatBytes(metaOf?.bytes),
        (shown === 'png' || shown === 'cutout') && !metaOf?.opaque ? tr('transparent') : undefined,
        metaOf?.source,
        metaOf?.note,
    ].filter(Boolean).join(' · ');
    const imgAlt = `${alt} · ${viewLabel}${angles.length > 1 ? ` · ${tr('Photo')} ${index + 1}` : ''}`;

    const enabledViews = views.filter(available);
    const onTabKey = (e: React.KeyboardEvent, v: MediaView) => {
        const i = enabledViews.indexOf(v);
        let next: MediaView | undefined;
        if (e.key === 'ArrowRight') next = enabledViews[(i + 1) % enabledViews.length];
        else if (e.key === 'ArrowLeft') next = enabledViews[(i - 1 + enabledViews.length) % enabledViews.length];
        else if (e.key === 'Home') next = enabledViews[0];
        else if (e.key === 'End') next = enabledViews[enabledViews.length - 1];
        if (next) { e.preventDefault(); setView(next); tabRefs.current[next]?.focus(); }
    };

    const stageStyle = aspect ? ({ ['--ui-viewer-aspect' as string]: aspect } as React.CSSProperties) : undefined;
    const stageBody = (
        <>
            {displaySrc
                ? <img className="ui-viewer__img" src={displaySrc} alt={imgAlt} draggable={false} decoding="async"
                    onLoad={(e) => {
                        const el = e.currentTarget;
                        if (src && !measured[src]) setMeasured(m => ({ ...m, [src]: { w: el.naturalWidth, h: el.naturalHeight } }));
                    }} />
                : <span className="ui-viewer__empty">{tr('No photo')}</span>}
            {displaySrc && <span className="ui-viewer__meta">{meta}</span>}
            {displaySrc && zoomable && <span className="ui-viewer__zoomhint" aria-hidden="true"><Expand size={13} /></span>}
        </>
    );

    return (
        <div className={cx('ui-viewer', className)}>
            {views.length > 1 && (
                <div className="ui-vtabs" role="tablist" aria-label={tr('Image outputs')}>
                    {views.map(v => {
                        const has = available(v);
                        return (
                            <button
                                key={v}
                                ref={el => { tabRefs.current[v] = el; }}
                                type="button"
                                role="tab"
                                className="ui-vtab"
                                aria-selected={shown === v}
                                aria-controls={stageId}
                                tabIndex={shown === v ? 0 : -1}
                                disabled={!has}
                                title={has ? undefined : tr('Not generated yet')}
                                onClick={() => setView(v)}
                                onKeyDown={(e) => onTabKey(e, v)}
                            >
                                {v !== 'photo' && has && <span className="ui-vtab__dot" aria-hidden="true" />}
                                {tr(MEDIA_VIEW_LABEL[v])}
                            </button>
                        );
                    })}
                </div>
            )}

            <div id={stageId} role={views.length > 1 ? 'tabpanel' : undefined} aria-label={views.length > 1 ? viewLabel : undefined}>
                {displaySrc && zoomable ? (
                    <button type="button"
                        className={cx('ui-viewer__stage', 'ui-viewer__stage--button', KIND_GROUND[shown])}
                        style={stageStyle}
                        aria-label={`${tr('Open full size')}: ${imgAlt}`}
                        onClick={() => setLightbox(true)}>
                        {stageBody}
                    </button>
                ) : (
                    <div className={cx('ui-viewer__stage', KIND_GROUND[shown])} style={stageStyle}>
                        {stageBody}
                    </div>
                )}
            </div>

            {angles.length > 1 && (
                <div className="ui-angles" role="group" aria-label={tr('Photos')}>
                    {angles.map((a, i) => (
                        <Thumb
                            key={`${i}-${a.photo}`}
                            src={a.photo}
                            size="lg"
                            alt={`${tr('Photo')} ${i + 1}`}
                            current={i === index}
                            onClick={() => setAngle(i)}
                        />
                    ))}
                </div>
            )}

            {lightbox && displaySrc && src && (
                <Lightbox
                    src={src}
                    kind={shown}
                    alt={imgAlt}
                    title={imgAlt}
                    meta={meta}
                    onClose={() => setLightbox(false)}
                    onPrev={angles.length > 1 ? () => setAngle((index - 1 + angles.length) % angles.length) : undefined}
                    onNext={angles.length > 1 ? () => setAngle((index + 1) % angles.length) : undefined}
                />
            )}
        </div>
    );
}
