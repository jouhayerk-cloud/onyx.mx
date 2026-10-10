import React, { useMemo } from 'react';
import type { ShapeFigureProps, FigurePart, Dims, Motif, Geometry } from './types';
import { FIGURE_VB } from './types';
import { buildFamilyFigure } from './figures/familyFigures';
import { buildMotifFigure } from './figures/motifFigures';
import { buildTypeFigure } from './typeFigures';
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
): FigurePart[] {
    const rw = dims && dims.w > 0 ? Math.round(dims.w) : '';
    const rh = dims && dims.h > 0 ? Math.round(dims.h) : '';
    const rd = dims && dims.d > 0 ? Math.round(dims.d) : '';
    const key = `${typeId ?? ''}|${family}|${isMirror ? 1 : 0}|${motif ?? ''}|${holes ?? ''}|${rw},${rh},${rd}`;

    const cached = partsCache.get(key);
    if (cached) return cached;

    let parts: FigurePart[] | null = null;
    if (typeId) {
        parts = buildTypeFigure(typeId, dims ?? null, holes);
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

export const ShapeFigure: React.FC<ShapeFigureProps> = ({
    family,
    isMirror = false,
    motif = null,
    typeId = null,
    dims = null,
    holes,
    lift = 0,
    active = false,
    className = '',
}) => {
    const parts = useMemo(
        () => getFigureParts(family, isMirror, motif, dims, holes, typeId),
        [family, isMirror, motif, dims, holes, typeId],
    );

    const rootClass = ['sf-figure', active ? 'is-active' : '', className]
        .filter(Boolean)
        .join(' ');

    return (
        <svg
            viewBox={`0 0 ${FIGURE_VB.w} ${FIGURE_VB.h}`}
            aria-hidden="true"
            focusable="false"
            className={rootClass}
        >
            <g
                style={
                    {
                        transform: 'translateY(calc(var(--sf-lift, 0) * -10px))',
                        // only when the prop is used: the picker drives --sf-lift on the tile and an inline 0 here would hide it
                        ...(lift ? { '--sf-lift': lift } : {}),
                    } as React.CSSProperties
                }
            >
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
