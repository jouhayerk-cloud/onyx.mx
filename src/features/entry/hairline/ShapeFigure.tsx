import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { ShapeFigureProps, FigurePart, Dims, Motif, Geometry } from './types';
import { FIGURE_VB } from './types';
import { buildFamilyFigure } from './figures/familyFigures';
import { buildMotifFigure } from './figures/motifFigures';
import { buildTypeFigure } from './typeFigures';
import { Spring, wake, sleep } from '../../welcome/hairline/engine';
import './shapeFigure.css';

/**
 * Module-level cache keyed by family|isMirror|motif|holes|dims rounded to 1 cm.
 */
const partsCache = new Map<string, FigurePart[]>();

function getFigureParts(
    family: Geometry,
    isMirror: boolean,
    motif: Motif | null | undefined,
    dims: Dims | null | undefined,
    holes?: number,
    typeId?: string | null,
    variant?: string | null,
    top?: string | null,
): FigurePart[] {
    const rw = dims && dims.w > 0 ? Math.round(dims.w) : '';
    const rh = dims && dims.h > 0 ? Math.round(dims.h) : '';
    const rd = dims && dims.d > 0 ? Math.round(dims.d) : '';
    const key = `${typeId ?? ''}|${variant ?? ''}|${top ?? ''}|${family}|${isMirror ? 1 : 0}|${motif ?? ''}|${holes ?? ''}|${rw},${rh},${rd}`;

    const cached = partsCache.get(key);
    if (cached) return cached;

    let parts: FigurePart[] | null = null;
    if (typeId) {
        parts = buildTypeFigure(typeId, dims ?? null, holes, variant, top);
    }
    if (!parts && motif) {
        parts = buildMotifFigure(motif, dims ?? null, holes);
    }
    if (!parts) {
        parts = buildFamilyFigure(family, isMirror, dims ?? null);
    }

    partsCache.set(key, parts);
    return parts;
}

/**
 * Material-aware CSS color tokens mapped across all 22 types and families.
 */
function getShapeColor(typeId: string | null | undefined, family: Geometry, isMirror: boolean): string {
    if (isMirror || typeId === 'mirror' || family === 'mirror') {
        return '#00aeef'; // Sky Cyan
    }
    if (
        typeId === 'pendant' ||
        typeId === 'table-lamp' ||
        typeId === 'floor-lamp' ||
        typeId === 'luminary' ||
        typeId === 'tower-lamp'
    ) {
        return '#f59e0b'; // Radiant Amber
    }
    if (
        typeId === 'bowl' ||
        typeId === 'canoe' ||
        typeId === 'plate' ||
        typeId === 'basin' ||
        typeId === 'sink' ||
        family === 'bowl' ||
        family === 'plate'
    ) {
        return '#10b981'; // Emerald Jade
    }
    if (
        typeId === 'wall-panel' ||
        typeId === 'painted-wall-panel' ||
        typeId === 'table' ||
        typeId === 'couch' ||
        typeId === 'bar' ||
        typeId === 'wine-rack'
    ) {
        return '#ff7a45'; // Architectural Terracotta Coral
    }
    return '#b85bf8'; // Vivid Amethyst Stone
}

export const ShapeFigure: React.FC<ShapeFigureProps> = ({
    family,
    isMirror = false,
    motif = null,
    typeId = null,
    variant = null,
    top = null,
    dims = null,
    holes,
    lift = 0,
    active = false,
    className = '',
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const groupRef = useRef<SVGGElement>(null);

    const parts = useMemo(
        () => getFigureParts(family, isMirror, motif, dims, holes, typeId, variant, top),
        [family, isMirror, motif, dims, holes, typeId, variant, top],
    );

    const color = useMemo(
        () => getShapeColor(typeId, family, isMirror),
        [typeId, family, isMirror],
    );

    // Spring physics for dynamic hover / active vertical elevation
    const liftSpring = useRef(new Spring(0));
    const tiltSpring = useRef(new Spring(0));

    const paint = () => {
        if (groupRef.current) {
            const y = liftSpring.current.x;
            const x = tiltSpring.current.x;
            groupRef.current.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
        }
    };

    const tick = useRef((dt: number): boolean => {
        const a = liftSpring.current.step(dt);
        const b = tiltSpring.current.step(dt);
        paint();
        return a || b;
    }).current;

    useEffect(() => {
        const baseLift = (lift || (isHovered ? 0.6 : 0) || (active ? 0.9 : 0)) * -10;
        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reducedMotion) {
            liftSpring.current.x = baseLift;
            liftSpring.current.t = baseLift;
            tiltSpring.current.x = 0;
            tiltSpring.current.t = 0;
            paint();
        } else {
            liftSpring.current.t = baseLift;
            wake(tick);
        }
    }, [lift, isHovered, active]);

    useEffect(() => {
        paint();
        return () => { sleep(tick); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        const baseLift = (lift || 0.6) * -10;
        liftSpring.current.t = baseLift + ny * 3;
        tiltSpring.current.t = nx * 3;
        wake(tick);
    }, [lift]);

    const handlePointerLeave = useCallback(() => {
        setIsHovered(false);
        const baseLift = (lift || (active ? 0.9 : 0)) * -10;
        liftSpring.current.t = baseLift;
        tiltSpring.current.t = 0;
        wake(tick);
    }, [lift, active]);

    const rootClass = [
        'sf-figure',
        'ui-root',
        active ? 'is-active' : '',
        isHovered ? 'is-hovered' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${FIGURE_VB.w} ${FIGURE_VB.h}`}
            aria-hidden="true"
            focusable="false"
            className={rootClass}
            style={{ '--sf-c': color } as React.CSSProperties}
            onPointerEnter={() => setIsHovered(true)}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
        >
            <g ref={groupRef} className="sf-assembly-group">
                {parts.map((part, index) => (
                    <path
                        key={index}
                        className={`sf-${part.kind}`}
                        d={part.d}
                    />
                ))}
            </g>
        </svg>
    );
};
