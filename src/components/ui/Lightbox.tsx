import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { Key } from './Key';
import { svgSrc, type ThumbKind } from './Thumb';
import { cx } from './types';

export interface LightboxProps {
    src: string;
    /** Decides the ground, as in the viewer: grid behind PNGs, black behind masks. */
    kind?: ThumbKind;
    alt: string;
    /** Bar title, e.g. "EM-004 · Mask · photo 1". */
    title?: string;
    /** Meta line over the image (size, source). */
    meta?: string;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
}

const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const GROUND: Partial<Record<ThumbKind, string>> = { png: 'ui-checker', cutout: 'ui-checker', svg: 'ui-checker', axo: 'ui-checker', mask: 'ui-black' };

/**
 * Full-screen view of one image, portalled to <body> above every module
 * (including #batchproc). Fit by default; zoom with the keys, + / -, 0 for
 * fit, or the wheel; the stage scrolls when the image is larger than it.
 * Esc closes and focus returns to whatever opened it.
 */
export function Lightbox({ src, kind = 'photo', alt, title, meta, onClose, onPrev, onNext }: LightboxProps) {
    const [zoom, setZoom] = useState<number | 'fit'>('fit');
    // Keyed by src, so a measurement never outlives its image. (Resetting it
    // in an effect raced the load event of a cached image and wiped it.)
    const [measured, setMeasured] = useState<{ src: string; w: number; h: number } | null>(null);
    const natural = measured && measured.src === src ? measured : null;
    const rootRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    // Back to fit when the image changes (prev / next).
    const lastSrc = useRef(src);
    useEffect(() => {
        if (lastSrc.current !== src) { lastSrc.current = src; setZoom('fit'); }
    }, [src]);

    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { opener?.focus?.(); };
    }, []);

    const fitScale = useCallback(() => {
        const stage = stageRef.current;
        if (!stage || !natural) return 1;
        return Math.min(stage.clientWidth / natural.w, stage.clientHeight / natural.h, 1);
    }, [natural]);

    const step = useCallback((dir: 1 | -1) => {
        setZoom(z => {
            const current = z === 'fit' ? fitScale() : z;
            const next = dir > 0 ? STEPS.find(s => s > current + 0.001) : [...STEPS].reverse().find(s => s < current - 0.001);
            return next ?? current;
        });
    }, [fitScale]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1); return; }
        if (e.key === '-') { e.preventDefault(); step(-1); return; }
        if (e.key === '0') { e.preventDefault(); setZoom('fit'); return; }
        if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev(); return; }
        if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext(); return; }
        if (e.key === 'Tab') {
            // Keep focus inside the dialog.
            const focusable = rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])');
            if (!focusable?.length) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };

    const onWheel = (e: React.WheelEvent) => {
        if (Math.abs(e.deltaY) < 1) return;
        step(e.deltaY < 0 ? 1 : -1);
    };

    const pct = zoom === 'fit' ? (natural ? Math.round(fitScale() * 100) : null) : Math.round(zoom * 100);
    const shown = kind === 'svg' ? svgSrc(src) : src;

    return createPortal(
        <div ref={rootRef} className="ui-root ui-lightbox" role="dialog" aria-modal="true"
            aria-label={title ?? alt} onKeyDown={onKeyDown}
            // A click on the bar or the title keeps focus in the dialog (on
            // <body> its Esc, zoom keys and Tab trap would stop working).
            tabIndex={-1}>
            <div className="ui-lightbox__bar">
                <span className="ui-lightbox__title">{title ?? alt}</span>
                {onPrev && <Key iconOnly size="sm" icon={<ChevronLeft size={14} />} label={tr('Previous')} onClick={onPrev} />}
                {onNext && <Key iconOnly size="sm" icon={<ChevronRight size={14} />} label={tr('Next')} onClick={onNext} />}
                <Key iconOnly size="sm" icon={<ZoomOut size={14} />} label={tr('Zoom out')} onClick={() => step(-1)} />
                <span className="ui-lightbox__zoom" aria-live="polite">{pct != null ? `${pct}%` : ''}</span>
                <Key iconOnly size="sm" icon={<ZoomIn size={14} />} label={tr('Zoom in')} onClick={() => step(1)} />
                <Key size="sm" icon={<Maximize2 size={13} />} pressed={zoom === 'fit'}
                    onClick={() => setZoom(z => (z === 'fit' ? 1 : 'fit'))}>
                    {/* One label with aria-pressed (off = 1:1); the readout beside it gives the zoom. */}
                    {tr('Fit')}
                </Key>
                <Key ref={closeRef} iconOnly size="sm" icon={<X size={14} />} label={tr('Close')} onClick={onClose} />
            </div>
            <div ref={stageRef} className={cx('ui-lightbox__stage', GROUND[kind])} tabIndex={0}
                aria-label={alt} onWheel={onWheel}
                onClick={(e) => { if (e.target === e.currentTarget && zoom === 'fit') onClose(); }}>
                <img
                    src={shown}
                    alt={alt}
                    draggable={false}
                    className={cx('ui-lightbox__img', zoom === 'fit' && 'ui-lightbox__img--fit')}
                    style={zoom !== 'fit' && natural ? { width: natural.w * zoom, height: natural.h * zoom } : undefined}
                    onLoad={(e) => setMeasured({ src, w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
                />
            </div>
            {meta && <span className="ui-lightbox__meta">{meta}</span>}
        </div>,
        document.body,
    );
}
