import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Hand,
    Image as ImageIcon,
    Layers,
    Maximize2,
    Move,
    Plus,
    Redo2,
    RefreshCw,
    RotateCcw,
    Save,
    Scissors,
    Sparkles,
    Trash2,
    Undo2,
} from 'lucide-react';
import { Key, Segmented } from '../../components/ui';
import { tr } from '../../lib/i18n';
import { getCleanImageUrl } from '../../lib/utils';
import { CanvasViewport, clientToImagePoint, type ViewportTransform } from './CanvasViewport';
import {
    deleteNodeFromSubpath,
    extractOutlineFromSvg,
    findNearestSegmentInSubpath,
    insertNodeOnNearestSegment,
    serializeSubpathsToD,
    smoothSubpath,
    type EditableSubpath,
} from './svgPathEditor';

const HISTORY_CAP = 40;

type VectorMode = 'move' | 'add' | 'delete';
type BackdropMode = 'photo' | 'cutout' | 'matte';

export interface MaskVectorStageProps {
    baseImageUrl: string;
    svgTextOrD: string;
    cutoutUrl?: string | null;
    matteUrl?: string | null;
    isMirror?: boolean;
    hasPreviousOutline?: boolean;
    saving?: boolean;
    onSave: (payload: { pathD: string; fillRule: 'nonzero' | 'evenodd'; width: number; height: number }) => void;
    onRestorePrevious?: () => void;
}

function fitTransform(stage: HTMLElement | null, w: number, h: number): ViewportTransform {
    if (!stage || !w || !h) return { scale: 1, tx: 0, ty: 0 };
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return { scale: 1, tx: 0, ty: 0 };
    const scale = Math.min(r.width / w, r.height / h, 1);
    return { scale, tx: (r.width - w * scale) / 2, ty: (r.height - h * scale) / 2 };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Interactive SVG outline editor: renders the combined path with its fillRule (mirror holes via evenodd)
 * and draggable node handles inside CanvasViewport.
 */
export function MaskVectorStage({
    baseImageUrl,
    svgTextOrD,
    cutoutUrl,
    matteUrl,
    isMirror = false,
    hasPreviousOutline = false,
    saving = false,
    onSave,
    onRestorePrevious,
}: MaskVectorStageProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<{
        pointerId: number;
        subpathId: string;
        nodeIndex: number;
        before: EditableSubpath[];
        moved: boolean;
    } | null>(null);

    const [photoSize, setPhotoSize] = useState({ w: 0, h: 0 });
    const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, tx: 0, ty: 0 });
    const [mode, setMode] = useState<VectorMode>('move');
    const [backdrop, setBackdrop] = useState<BackdropMode>('photo');
    const [panMode, setPanMode] = useState(false);

    const initialParsed = useMemo(
        () => extractOutlineFromSvg(svgTextOrD, photoSize.w || 1000, photoSize.h || 1000, isMirror),
        [svgTextOrD, photoSize.w, photoSize.h, isMirror],
    );

    const [subpaths, setSubpaths] = useState<EditableSubpath[]>(initialParsed.subpaths);
    const [fillRule, setFillRule] = useState<'nonzero' | 'evenodd'>(initialParsed.fillRule);
    const [undo, setUndo] = useState<EditableSubpath[][]>([]);
    const [redo, setRedo] = useState<EditableSubpath[][]>([]);
    const [selected, setSelected] = useState<{ subpathId: string; nodeIndex: number | null } | null>(
        initialParsed.subpaths[0] ? { subpathId: initialParsed.subpaths[0].id, nodeIndex: null } : null,
    );

    // Reset editor state when the stored SVG outline or mirror flag changes.
    useEffect(() => {
        const parsed = extractOutlineFromSvg(svgTextOrD, photoSize.w || 1000, photoSize.h || 1000, isMirror);
        setSubpaths(parsed.subpaths);
        setFillRule(parsed.fillRule);
        setUndo([]);
        setRedo([]);
        setSelected(parsed.subpaths[0] ? { subpathId: parsed.subpaths[0].id, nodeIndex: null } : null);
    }, [svgTextOrD, isMirror]);

    // Ensure backdrop falls back to 'photo' when cutout/matte is absent on the current angle.
    useEffect(() => {
        if (backdrop === 'cutout' && !cutoutUrl) setBackdrop('photo');
        if (backdrop === 'matte' && !matteUrl) setBackdrop('photo');
    }, [backdrop, cutoutUrl, matteUrl]);

    const stageW = initialParsed.width || photoSize.w || 1000;
    const stageH = initialParsed.height || photoSize.h || 1000;
    const effectiveFillRule: 'nonzero' | 'evenodd' = subpaths.length > 1 || isMirror ? 'evenodd' : fillRule;
    const combinedD = useMemo(() => serializeSubpathsToD(subpaths), [subpaths]);

    const stageEl = () => svgRef.current?.closest('[data-canvas-stage]') as HTMLElement | null;

    const pushHistory = (prev: EditableSubpath[]) => {
        setUndo(u => [...u, prev].slice(-HISTORY_CAP));
        setRedo([]);
    };

    const activeSubpathId = selected?.subpathId ?? subpaths[0]?.id ?? null;
    const activeSubpath = useMemo(
        () => subpaths.find(sp => sp.id === activeSubpathId) ?? subpaths[0] ?? null,
        [subpaths, activeSubpathId],
    );

    // Delete or Backspace removes the currently selected node.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (saving || !selected || selected.nodeIndex === null) return;
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

            const sp = subpaths.find(s => s.id === selected.subpathId);
            if (!sp) return;
            const nextSp = deleteNodeFromSubpath(sp, selected.nodeIndex);
            if (nextSp.nodes.length === sp.nodes.length) return;

            e.preventDefault();
            pushHistory(subpaths);
            setSubpaths(prev => prev.map(s => (s.id === sp.id ? nextSp : s)));
            setSelected({
                subpathId: sp.id,
                nodeIndex: Math.min(selected.nodeIndex, nextSp.nodes.length - 1),
            });
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [saving, selected, subpaths]);

    const handleUndo = () => {
        const last = undo[undo.length - 1];
        if (!last) return;
        setUndo(u => u.slice(0, -1));
        setRedo(r => [...r, subpaths].slice(-HISTORY_CAP));
        setSubpaths(last);
    };

    const handleRedo = () => {
        const next = redo[redo.length - 1];
        if (!next) return;
        setRedo(r => r.slice(0, -1));
        setUndo(u => [...u, subpaths].slice(-HISTORY_CAP));
        setSubpaths(next);
    };

    const handleSmooth = () => {
        if (!activeSubpath || saving) return;
        const smoothed = smoothSubpath(activeSubpath);
        if (smoothed === activeSubpath) return;
        pushHistory(subpaths);
        setSubpaths(prev => prev.map(sp => (sp.id === activeSubpath.id ? smoothed : sp)));
        setSelected({ subpathId: activeSubpath.id, nodeIndex: null });
    };

    const handleReset = () => {
        if (saving || !undo.length) return;
        pushHistory(subpaths);
        setSubpaths(initialParsed.subpaths);
        setFillRule(initialParsed.fillRule);
        setSelected(initialParsed.subpaths[0] ? { subpathId: initialParsed.subpaths[0].id, nodeIndex: null } : null);
    };

    const handleSave = () => {
        if (saving || !combinedD) return;
        onSave({
            pathD: combinedD,
            fillRule: effectiveFillRule,
            width: stageW,
            height: stageH,
        });
    };

    const fit = () => setTransform(fitTransform(stageEl(), stageW, stageH));

    const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        // A second finger is a pinch: a node drag the first finger started is taken back, with no undo entry.
        const drag = dragRef.current;
        if (drag && e.pointerId !== drag.pointerId) {
            dragRef.current = null;
            if (drag.moved) setSubpaths(drag.before);
            return;
        }
        if (panMode || saving || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const el = stageEl();
        if (!el || !subpaths.length) return;
        const pt = clientToImagePoint(e.clientX, e.clientY, el, transform);

        if (mode === 'add') {
            let bestSp = subpaths[0];
            let bestHit = findNearestSegmentInSubpath(bestSp, pt);
            for (let i = 1; i < subpaths.length; i++) {
                const hit = findNearestSegmentInSubpath(subpaths[i], pt);
                if (hit.dist < bestHit.dist) {
                    bestSp = subpaths[i];
                    bestHit = hit;
                }
            }
            const nextSp = insertNodeOnNearestSegment(bestSp, pt);
            pushHistory(subpaths);
            setSubpaths(prev => prev.map(sp => (sp.id === bestSp.id ? nextSp : sp)));
            setSelected({ subpathId: bestSp.id, nodeIndex: bestHit.insertIndex });
            return;
        }

        if (mode === 'move') {
            let bestSp = subpaths[0];
            let bestHit = findNearestSegmentInSubpath(bestSp, pt);
            for (let i = 1; i < subpaths.length; i++) {
                const hit = findNearestSegmentInSubpath(subpaths[i], pt);
                if (hit.dist < bestHit.dist) {
                    bestSp = subpaths[i];
                    bestHit = hit;
                }
            }
            if (bestHit.dist <= Math.max(24 / Math.max(transform.scale, 0.05), 12)) {
                setSelected({ subpathId: bestSp.id, nodeIndex: null });
            }
        }
    };

    const onNodePointerDown = (e: React.PointerEvent<SVGCircleElement>, subpathId: string, nodeIndex: number) => {
        if (panMode || saving || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.stopPropagation();

        if (mode === 'delete') {
            const sp = subpaths.find(s => s.id === subpathId);
            if (!sp) return;
            const nextSp = deleteNodeFromSubpath(sp, nodeIndex);
            if (nextSp.nodes.length === sp.nodes.length) {
                setSelected({ subpathId, nodeIndex });
                return;
            }
            pushHistory(subpaths);
            setSubpaths(prev => prev.map(s => (s.id === subpathId ? nextSp : s)));
            setSelected({
                subpathId,
                nodeIndex: Math.min(nodeIndex, nextSp.nodes.length - 1),
            });
            return;
        }

        setSelected({ subpathId, nodeIndex });
        if (mode === 'move') {
            dragRef.current = {
                pointerId: e.pointerId,
                subpathId,
                nodeIndex,
                before: subpaths,
                moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    const onNodePointerMove = (e: React.PointerEvent<SVGCircleElement>) => {
        const d = dragRef.current;
        const el = stageEl();
        if (!d || d.pointerId !== e.pointerId || !el) return;
        const pt = clientToImagePoint(e.clientX, e.clientY, el, transform);
        const clampedX = round1(Math.max(0, Math.min(stageW, pt.x)));
        const clampedY = round1(Math.max(0, Math.min(stageH, pt.y)));
        d.moved = true;
        setSubpaths(prev =>
            prev.map(sp => {
                if (sp.id !== d.subpathId) return sp;
                const nextNodes = sp.nodes.map((n, idx) => (idx === d.nodeIndex ? { x: clampedX, y: clampedY } : n));
                return { ...sp, nodes: nextNodes };
            }),
        );
    };

    const onNodePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        dragRef.current = null;
        if (d.moved) {
            pushHistory(d.before);
        }
    };

    const scale = Math.max(transform.scale, 0.05);
    const invScale = 1 / scale;
    // Hit radius scaled by 1/zoom, at least 22 screen px (44 px touch target).
    const hitRadius = Math.max(22 * invScale, 6);
    const nodeRadius = 5 * invScale;
    const selectedNodeRadius = 7 * invScale;
    const strokeMain = 2 * invScale;
    const strokeHalo = 4 * invScale;

    const cleanCutoutUrl = cutoutUrl ? (getCleanImageUrl(cutoutUrl) || cutoutUrl) : null;
    const cleanMatteUrl = matteUrl ? (getCleanImageUrl(matteUrl) || matteUrl) : null;
    const activeImageSrc =
        backdrop === 'cutout' && cleanCutoutUrl
            ? cleanCutoutUrl
            : backdrop === 'matte' && cleanMatteUrl
                ? cleanMatteUrl
                : baseImageUrl;

    const backdropOptions = useMemo(() => {
        const opts: { value: BackdropMode; label: string; icon: React.ReactNode }[] = [
            { value: 'photo', label: tr('Photo'), icon: <ImageIcon size={14} /> },
        ];
        if (cleanCutoutUrl) opts.push({ value: 'cutout', label: tr('Cutout'), icon: <Scissors size={14} /> });
        if (cleanMatteUrl) opts.push({ value: 'matte', label: tr('Matte'), icon: <Layers size={14} /> });
        return opts;
    }, [cleanCutoutUrl, cleanMatteUrl]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                <Segmented
                    size="sm"
                    label={tr('Vector mode')}
                    value={mode}
                    onChange={v => setMode(v as VectorMode)}
                    options={[
                        { value: 'move', label: tr('Move'), icon: <Move size={14} /> },
                        { value: 'add', label: tr('Add node'), icon: <Plus size={14} /> },
                        { value: 'delete', label: tr('Delete node'), icon: <Trash2 size={14} /> },
                    ]} />
                {backdropOptions.length > 1 && (
                    <Segmented
                        size="sm"
                        label={tr('Backdrop')}
                        value={backdrop}
                        onChange={v => setBackdrop(v as BackdropMode)}
                        options={backdropOptions} />
                )}
                <Key iconOnly size="sm" icon={<Hand size={14} />} label={tr('Pan')} pressed={panMode} onClick={() => setPanMode(p => !p)} />
                <Key iconOnly size="sm" icon={<Maximize2 size={14} />} label={tr('Fit to screen')} onClick={fit} />
                <Key
                    size="sm"
                    icon={<Sparkles size={14} />}
                    disabled={!activeSubpath || saving}
                    onClick={handleSmooth}>
                    {tr('Smooth selected subpath')}
                </Key>
                <Key iconOnly size="sm" icon={<Undo2 size={14} />} label={tr('Undo')} disabled={!undo.length || saving} onClick={handleUndo} />
                <Key iconOnly size="sm" icon={<Redo2 size={14} />} label={tr('Redo')} disabled={!redo.length || saving} onClick={handleRedo} />
                <Key
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    disabled={!undo.length || saving}
                    onClick={handleReset}>
                    {tr('Reset to stored outline')}
                </Key>
                <span className="flex-1" />
                {hasPreviousOutline && onRestorePrevious && (
                    <Key
                        size="sm"
                        icon={<RotateCcw size={14} />}
                        disabled={saving}
                        onClick={onRestorePrevious}>
                        {tr('Restore previous outline')}
                    </Key>
                )}
                <Key
                    variant="go"
                    size="sm"
                    icon={<Save size={14} />}
                    disabled={!subpaths.length || saving}
                    busy={saving}
                    onClick={handleSave}>
                    {tr('Save')}
                </Key>
            </div>

            <CanvasViewport
                naturalWidth={stageW}
                naturalHeight={stageH}
                ground={backdrop === 'matte' ? 'black' : 'checker'}
                transform={transform}
                onTransformChange={setTransform}
                panMode={panMode}>
                <img
                    src={activeImageSrc}
                    alt=""
                    draggable={false}
                    className="block max-w-none select-none"
                    style={{ width: stageW, height: stageH }}
                    onLoad={(e) => {
                        if (activeImageSrc === baseImageUrl) {
                            const nw = e.currentTarget.naturalWidth;
                            const nh = e.currentTarget.naturalHeight;
                            if (nw && nh && (nw !== photoSize.w || nh !== photoSize.h)) {
                                setPhotoSize({ w: nw, h: nh });
                            }
                        }
                        const w = initialParsed.width || e.currentTarget.naturalWidth || stageW;
                        const h = initialParsed.height || e.currentTarget.naturalHeight || stageH;
                        setTransform(fitTransform(e.currentTarget.closest('[data-canvas-stage]') as HTMLElement | null, w, h));
                    }} />
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${stageW} ${stageH}`}
                    width={stageW}
                    height={stageH}
                    className="absolute left-0 top-0 h-full w-full touch-none overflow-visible"
                    style={{ cursor: panMode ? 'grab' : mode === 'add' ? 'crosshair' : undefined }}
                    onPointerDown={onSvgPointerDown}>
                    {combinedD && (
                        <>
                            <path
                                d={combinedD}
                                fill="#0ea5e9"
                                fillOpacity={0.2}
                                fillRule={effectiveFillRule}
                                pointerEvents="none" />
                            <path
                                d={combinedD}
                                fill="none"
                                stroke="#ffffff"
                                strokeOpacity={0.9}
                                strokeWidth={strokeHalo}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                pointerEvents="none" />
                            <path
                                d={combinedD}
                                fill="none"
                                stroke="#0b6f7c"
                                strokeWidth={strokeMain}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                pointerEvents="none" />
                        </>
                    )}
                    {subpaths.length > 1 && activeSubpath && (
                        <path
                            d={serializeSubpathsToD([activeSubpath])}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth={strokeMain * 1.25}
                            strokeDasharray={`${6 * invScale} ${4 * invScale}`}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            pointerEvents="none" />
                    )}
                    {subpaths.map(sp =>
                        sp.nodes.map((node, idx) => {
                            const isSelected = selected?.subpathId === sp.id && selected?.nodeIndex === idx;
                            return (
                                <g key={`${sp.id}_${idx}`}>
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isSelected ? selectedNodeRadius : nodeRadius}
                                        fill={isSelected ? '#38bdf8' : '#ffffff'}
                                        stroke="#0b6f7c"
                                        strokeWidth={1.75 * invScale}
                                        pointerEvents="none" />
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={hitRadius}
                                        fill="transparent"
                                        style={{ cursor: panMode ? 'grab' : mode === 'delete' ? 'pointer' : 'move' }}
                                        onPointerDown={(e) => onNodePointerDown(e, sp.id, idx)}
                                        onPointerMove={onNodePointerMove}
                                        onPointerUp={onNodePointerUp}
                                        onPointerCancel={onNodePointerUp} />
                                </g>
                            );
                        }),
                    )}
                </svg>
            </CanvasViewport>
        </div>
    );
}
