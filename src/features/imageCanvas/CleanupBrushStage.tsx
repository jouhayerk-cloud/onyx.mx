import React, { useEffect, useRef, useState } from 'react';
import { Brush, Eraser, Hand, Maximize2, Redo2, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { Key, Segmented } from '../../components/ui';
import { tr } from '../../lib/i18n';
import { iopaintInpaint, IopaintServiceError } from '../../lib/ai/providers/iopaintService';
import { CanvasViewport, clientToImagePoint, type ViewportTransform } from './CanvasViewport';

const STROKE_HISTORY = 10; // full-resolution ImageData snapshots: ~48 MB each on a 12 MP photo
const PASS_COLOR = 'rgba(14, 165, 233, 0.48)';

export interface CleanupBrushStageProps {
    /** The current pass as a data: URL. The next IOPaint pass runs on it. */
    baseImageUrl: string;
    serviceOnline: boolean;
    /** A pass came back from IOPaint; the parent decides what it replaces. */
    onPassComplete: (newImageDataUrl: string) => void;
    onError: (message: string) => void;
}

/** Fit the image inside the stage with no upscaling, centred. */
function fitTransform(stage: HTMLElement | null, w: number, h: number): ViewportTransform {
    if (!stage || !w || !h) return { scale: 1, tx: 0, ty: 0 };
    const r = stage.getBoundingClientRect();
    const scale = Math.min(r.width / w, r.height / h, 1);
    return { scale, tx: (r.width - w * scale) / 2, ty: (r.height - h * scale) / 2 };
}

/**
 * The cleanup brush: paint over clutter on the photo, then Run inpaint sends the paint as a binary mask (white =
 * erase) to IOPaint at the photo's exact pixel size. The result is a new pass, and painting starts again on top of it.
 */
export function CleanupBrushStage({ baseImageUrl, serviceOnline, onPassComplete, onError }: CleanupBrushStageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef<{ id: number; last: { x: number; y: number }; before: ImageData } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, tx: 0, ty: 0 });
    const [brushRadius, setBrushRadius] = useState(24);
    const [isEraser, setIsEraser] = useState(false);
    const [panMode, setPanMode] = useState(false);
    const [busy, setBusy] = useState(false);
    // Stroke history: a snapshot of the mask before each stroke (undo) and before each undo (redo).
    const [undo, setUndo] = useState<ImageData[]>([]);
    const [redo, setRedo] = useState<ImageData[]>([]);

    // A new pass is a new photo: its mask starts empty and its history starts over.
    useEffect(() => {
        const c = canvasRef.current;
        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        setUndo([]);
        setRedo([]);
    }, [baseImageUrl]);

    const stageEl = () => canvasRef.current?.closest('[data-canvas-stage]') as HTMLElement | null;

    const paint = (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        ctx.strokeStyle = PASS_COLOR;
        ctx.lineWidth = brushRadius * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (panMode || busy || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const canvas = e.currentTarget;
        const ctx = canvas.getContext('2d');
        const el = stageEl();
        if (!ctx || !el) return;
        const p = clientToImagePoint(e.clientX, e.clientY, el, transform);
        drawing.current = { id: e.pointerId, last: p, before: ctx.getImageData(0, 0, canvas.width, canvas.height) };
        canvas.setPointerCapture(e.pointerId);
        paint(ctx, p, p);
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const d = drawing.current;
        const el = stageEl();
        if (!d || d.id !== e.pointerId || !el) return;
        const ctx = e.currentTarget.getContext('2d');
        if (!ctx) return;
        const p = clientToImagePoint(e.clientX, e.clientY, el, transform);
        paint(ctx, d.last, p);
        d.last = p;
    };

    const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const d = drawing.current;
        if (!d || d.id !== e.pointerId) return;
        drawing.current = null;
        setUndo(u => [...u, d.before].slice(-STROKE_HISTORY));
        setRedo([]);
    };

    const snapshot = () => {
        const c = canvasRef.current;
        return c?.getContext('2d')?.getImageData(0, 0, c.width, c.height) ?? null;
    };

    const restore = (img: ImageData) => {
        const c = canvasRef.current;
        c?.getContext('2d')?.putImageData(img, 0, 0);
    };

    const undoStroke = () => {
        const last = undo[undo.length - 1];
        const now = snapshot();
        if (!last || !now) return;
        restore(last);
        setUndo(u => u.slice(0, -1));
        setRedo(r => [...r, now].slice(-STROKE_HISTORY));
    };

    const redoStroke = () => {
        const next = redo[redo.length - 1];
        const now = snapshot();
        if (!next || !now) return;
        restore(next);
        setRedo(r => r.slice(0, -1));
        setUndo(u => [...u, now].slice(-STROKE_HISTORY));
    };

    const clearMask = () => {
        const now = snapshot();
        const c = canvasRef.current;
        if (!now || !c) return;
        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        setUndo(u => [...u, now].slice(-STROKE_HISTORY));
        setRedo([]);
    };

    /** White where anything was painted, black elsewhere, at the photo's exact pixel size. */
    const binaryMaskDataUrl = (): string => {
        const c = canvasRef.current!;
        const src = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        const out = document.createElement('canvas');
        out.width = c.width;
        out.height = c.height;
        const octx = out.getContext('2d')!;
        const img = octx.createImageData(c.width, c.height);
        const d = img.data;
        for (let i = 0; i < src.length; i += 4) {
            const v = src[i + 3] > 0 ? 255 : 0;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        return out.toDataURL('image/png');
    };

    const runInpaint = async () => {
        if (busy || !undo.length || !serviceOnline || !canvasRef.current) return;
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setBusy(true);
        try {
            const out = await iopaintInpaint(baseImageUrl, binaryMaskDataUrl(), { signal: ctrl.signal });
            onPassComplete(out);
        } catch (e) {
            if (!(e instanceof IopaintServiceError && e.code === 'aborted')) onError((e as Error)?.message || tr('Inpaint failed'));
        } finally {
            abortRef.current = null;
            setBusy(false);
        }
    };

    const fit = () => setTransform(fitTransform(stageEl(), size.w, size.h));

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                <Segmented
                    size="sm"
                    label={tr('Brush mode')}
                    value={isEraser ? 'erase' : 'paint'}
                    onChange={(v) => setIsEraser(v === 'erase')}
                    options={[
                        { value: 'paint', label: tr('Brush'), icon: <Brush size={14} /> },
                        { value: 'erase', label: tr('Eraser'), icon: <Eraser size={14} /> },
                    ]} />
                <input
                    type="range"
                    min={4}
                    max={160}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                    aria-label={tr('Brush size')}
                    title={`${brushRadius * 2} px`}
                    className="w-28" />
                <Key iconOnly size="sm" icon={<Hand size={14} />} label={tr('Pan')} pressed={panMode} onClick={() => setPanMode(p => !p)} />
                <Key iconOnly size="sm" icon={<Maximize2 size={14} />} label={tr('Fit to screen')} onClick={fit} />
                <Key iconOnly size="sm" icon={<Undo2 size={14} />} label={tr('Undo stroke')} disabled={!undo.length || busy} onClick={undoStroke} />
                <Key iconOnly size="sm" icon={<Redo2 size={14} />} label={tr('Redo stroke')} disabled={!redo.length || busy} onClick={redoStroke} />
                <Key iconOnly size="sm" icon={<Trash2 size={14} />} label={tr('Clear mask')} disabled={!undo.length || busy} onClick={clearMask} />
                <span className="flex-1" />
                {busy && <span className="text-[12px]">{tr('Inpainting...')}</span>}
                {busy ? (
                    <Key variant="stop" size="sm" icon={<X size={14} />} onClick={() => abortRef.current?.abort()}>{tr('Cancel')}</Key>
                ) : (
                    <Key variant="go" size="sm" icon={<Sparkles size={14} />} disabled={!undo.length || !serviceOnline} onClick={runInpaint}>
                        {tr('Run inpaint')}
                    </Key>
                )}
            </div>
            <CanvasViewport
                naturalWidth={size.w}
                naturalHeight={size.h}
                ground="checker"
                transform={transform}
                onTransformChange={setTransform}
                panMode={panMode}>
                <img
                    src={baseImageUrl}
                    alt=""
                    draggable={false}
                    className="block max-w-none select-none"
                    style={{ width: size.w || undefined, height: size.h || undefined }}
                    onLoad={(e) => {
                        const w = e.currentTarget.naturalWidth;
                        const h = e.currentTarget.naturalHeight;
                        setSize({ w, h });
                        setTransform(fitTransform(e.currentTarget.closest('[data-canvas-stage]') as HTMLElement | null, w, h));
                    }} />
                <canvas
                    ref={canvasRef}
                    width={size.w}
                    height={size.h}
                    className="absolute left-0 top-0 h-full w-full touch-none"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp} />
            </CanvasViewport>
        </div>
    );
}
