import React, { useEffect, useRef } from 'react';
import { usePinchZoomRegion } from '../../lib/usePinchZoomRegion';
import { cx } from '../../components/ui/types';

export interface ViewportTransform { scale: number; tx: number; ty: number }

export interface CanvasViewportProps {
    naturalWidth: number;
    naturalHeight: number;
    ground?: 'checker' | 'black' | 'none';
    transform: ViewportTransform;
    onTransformChange: (next: ViewportTransform) => void;
    /** True when 1-finger drag should pan instead of drawing. */
    panMode: boolean;
    /** Called when a second pointer goes down anywhere on the stage, as a pinch starts. */
    onSecondPointer?: () => void;
    /** Focus target for keyboard handlers that belong to the stage. */
    tabIndex?: number;
    children: React.ReactNode;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 12;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** A client point in image pixels. `stageEl` is the [data-canvas-stage] element that CanvasViewport renders. */
export function clientToImagePoint(clientX: number, clientY: number, stageEl: HTMLElement, t: ViewportTransform): { x: number; y: number } {
    const rect = stageEl.getBoundingClientRect();
    return { x: (clientX - rect.left - t.tx) / t.scale, y: (clientY - rect.top - t.ty) / t.scale };
}

type Gesture =
    | { kind: 'pan'; startX: number; startY: number; base: ViewportTransform }
    | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; base: ViewportTransform };

/**
 * Pan and zoom stage for the image tools. Wheel zooms about the cursor; two fingers pinch and pan; one finger pans
 * in panMode or a middle-button drag pans. Children (the brush) draw with the remaining single pointer.
 */
export function CanvasViewport({ naturalWidth, naturalHeight, ground = 'none', transform, onTransformChange, panMode, onSecondPointer, tabIndex, children }: CanvasViewportProps) {
    usePinchZoomRegion();
    const stageRef = useRef<HTMLDivElement>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<Gesture | null>(null);
    const latest = useRef(transform);
    latest.current = transform;
    const onChange = useRef(onTransformChange);
    onChange.current = onTransformChange;

    // Native listener so the wheel can be cancelled (React's onWheel is passive).
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const t = latest.current;
            const rect = el.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const scale = clampScale(t.scale * Math.exp(-e.deltaY * 0.0015));
            const k = scale / t.scale;
            onChange.current({ scale, tx: px - (px - t.tx) * k, ty: py - (py - t.ty) * k });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const rel = (p: { x: number; y: number }) => {
        const rect = stageRef.current!.getBoundingClientRect();
        return { x: p.x - rect.left, y: p.y - rect.top };
    };
    const pair = () => [...pointers.current.values()];
    const midpoint = () => { const [a, b] = pair(); return rel({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); };
    const distance = () => { const [a, b] = pair(); return Math.hypot(a.x - b.x, a.y - b.y) || 1; };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            gesture.current = { kind: 'pinch', dist: distance(), mid: midpoint(), base: transform };
            e.currentTarget.setPointerCapture?.(e.pointerId);
            onSecondPointer?.();
        } else if (pointers.current.size === 1 && (panMode || e.button === 1)) {
            gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, base: transform };
            e.currentTarget.setPointerCapture?.(e.pointerId);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        if (!g) return;
        if (g.kind === 'pan' && pointers.current.size === 1) {
            onChange.current({ scale: g.base.scale, tx: g.base.tx + e.clientX - g.startX, ty: g.base.ty + e.clientY - g.startY });
        } else if (g.kind === 'pinch' && pointers.current.size >= 2) {
            const scale = clampScale(g.base.scale * distance() / g.dist);
            const k = scale / g.base.scale;
            // The image point under the starting midpoint stays under the current midpoint.
            const m = midpoint();
            onChange.current({ scale, tx: m.x - (g.mid.x - g.base.tx) * k, ty: m.y - (g.mid.y - g.base.ty) * k });
        }
    };

    const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) gesture.current = null;
    };

    return (
        <div
            ref={stageRef}
            data-canvas-stage
            tabIndex={tabIndex}
            className={cx('relative min-h-0 flex-1 overflow-hidden touch-none select-none', ground === 'checker' && 'ui-checker', ground === 'black' && 'ui-black')}
            style={{ cursor: panMode ? 'grab' : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}>
            <div
                className="absolute left-0 top-0 origin-top-left"
                style={{ width: naturalWidth, height: naturalHeight, transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})` }}>
                {children}
            </div>
        </div>
    );
}
