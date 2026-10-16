import React, { useMemo, useState } from 'react';
import { tr } from '../../../lib/i18n';
import type { Geometry, Dims } from './types';
import { ShapeFigure } from './ShapeFigure';
import { HairlineScroller, type HairlineScrollerItem } from './HairlineScroller';
import {
    subShapesFor,
    parseShapeText,
    composeShapeText,
    extraAxesFor,
    type SubShapeAxis,
} from './variantOptions';
import './dynamicSelector.css';

export interface SubShapeRowProps {
    typeId: string;
    value: string;
    /** source: "primary" when the form, size, subject or holes changed, "extra" when an extra axis (the open or closed top) changed. */
    onChange: (shapeText: string, source: 'primary' | 'extra') => void;
    dims?: Dims | null;
    family?: Geometry;
    isCoarse?: boolean;
    disabled?: boolean;
    /** Open the first axis (the forms) even though it has a choice: the owner came back to change it. */
    forceOpen?: boolean;
}

const EXTRA_FIRST = '__first-extra__';

/**
 * Sub-shape selector row for a chosen Type.
 * Renders one HairlineScroller per axis (the primary form/size/holes axis,
 * plus extra axes like Top for table and floor lamps).
 * Each scroller collapses to its chosen element and re-deploys when clicked.
 */
export const SubShapeRow: React.FC<SubShapeRowProps> = ({
    typeId,
    value,
    onChange,
    dims = null,
    family = 'box',
    isCoarse: _isCoarse = false,
    disabled = false,
    forceOpen = false,
}) => {
    const subShapes = subShapesFor(typeId);
    // Which axis the owner re-opened (or came back to change); an axis without a choice is always open.
    const [openKey, setOpenKey] = useState<string | null>(forceOpen ? (subShapes.options.length > 1 ? 'primary' : EXTRA_FIRST) : null);
    if (subShapes.kind === 'none' || subShapes.options.length === 0) {
        return null;
    }

    const parsed = parseShapeText(typeId, value);
    const chosenPrimary = parsed.primary;
    const primaryForExtras = chosenPrimary ?? subShapes.defaultValue;
    const extraAxes = extraAxesFor(typeId, primaryForExtras);
    // A Type with one form (the floor lamp column) shows only its extra row: the single form is implied.
    const showPrimary = subShapes.options.length > 1;

    const handleSelect = (optValue: string) => {
        onChange(composeShapeText(typeId, optValue, parsed.extra), 'primary');
    };

    const handleExtra = (axis: SubShapeAxis, optValue: string) => {
        const next: Record<string, string> = { ...parsed.extra };
        if (next[axis.kind] === optValue) delete next[axis.kind];
        else next[axis.kind] = optValue;
        onChange(composeShapeText(typeId, primaryForExtras, next), 'extra');
    };

    const handleFree = () => {
        onChange('', 'primary');
    };

    const primaryItems: ReadonlyArray<HairlineScrollerItem> = useMemo(() => {
        return subShapes.options.map(opt => {
            const isChosen = chosenPrimary === opt.value;
            const holes = typeId === 'wine-rack' ? Number(opt.value) : undefined;

            return {
                key: opt.value,
                label: tr(opt.label),
                node: (
                    <ShapeFigure
                        family={family}
                        typeId={typeId}
                        variant={opt.value}
                        top={parsed.extra.top ?? null}
                        holes={holes}
                        dims={dims}
                        active={isChosen}
                        className="ssr-scroller-svg"
                    />
                ),
            };
        });
    }, [subShapes.options, chosenPrimary, typeId, family, parsed.extra.top, dims]);

    const getExtraItems = (axis: SubShapeAxis): ReadonlyArray<HairlineScrollerItem> => {
        return axis.options.map(opt => {
            const isChosen = parsed.extra[axis.kind] === opt.value;

            return {
                key: opt.value,
                label: tr(opt.label),
                node: (
                    <ShapeFigure
                        family={family}
                        typeId={typeId}
                        variant={primaryForExtras}
                        top={opt.value}
                        dims={dims}
                        active={isChosen}
                        className="ssr-scroller-svg"
                    />
                ),
            };
        });
    };

    return (
        <div className="ssr-root ui-root" role="group" aria-label={tr(subShapes.label)}>
            {showPrimary && (
                <div className="ssr-axis" role="group" aria-label={tr(subShapes.label)}>
                    <div className="ssr-head">
                        <span className="ssr-label">{tr(subShapes.label)}</span>
                    </div>
                    <HairlineScroller
                        label={tr(subShapes.label)}
                        size="sub"
                        items={primaryItems}
                        value={chosenPrimary}
                        onChange={handleSelect}
                        freeLabel={tr('Not listed')}
                        onFree={handleFree}
                        disabled={disabled}
                        expanded={openKey === 'primary'}
                        onExpandedChange={open => setOpenKey(open ? 'primary' : null)}
                    />
                </div>
            )}

            {extraAxes.map((axis, axisIndex) => (
                <div key={axis.kind} className="ssr-axis" role="group" aria-label={tr(axis.label)}>
                    <div className="ssr-head">
                        <span className="ssr-label">{tr(axis.label)}</span>
                    </div>
                    <HairlineScroller
                        label={tr(axis.label)}
                        size="sub"
                        items={getExtraItems(axis)}
                        value={parsed.extra[axis.kind] ?? null}
                        onChange={optVal => handleExtra(axis, optVal)}
                        disabled={disabled}
                        expanded={openKey === axis.kind || (openKey === EXTRA_FIRST && axisIndex === 0)}
                        onExpandedChange={open => setOpenKey(open ? axis.kind : null)}
                    />
                </div>
            ))}
        </div>
    );
};
