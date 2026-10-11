import React from 'react';
import { tr } from '../../../lib/i18n';
import type { Geometry, Dims } from './types';
import { ShapeFigure } from './ShapeFigure';
import { subShapesFor, parseShapeText, composeShapeText, extraAxesFor, type SubShapeAxis } from './variantOptions';
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
}

/**
 * Compact row of a Type's sub-shape choices (Form, Size, Subject, or Holes).
 * Shows each option with its own mini hairline figure, highlighting the default
 * without writing it until chosen. Offers a "Not listed" choice to leave the field free.
 */
export const SubShapeRow: React.FC<SubShapeRowProps> = ({
    typeId,
    value,
    onChange,
    dims = null,
    family = 'box',
    isCoarse = false,
    disabled = false,
}) => {
    const subShapes = subShapesFor(typeId);
    if (subShapes.kind === 'none' || subShapes.options.length === 0) {
        return null;
    }

    const parsed = parseShapeText(typeId, value);
    const chosenOption = parsed.primary;
    const primaryForExtras = chosenOption ?? subShapes.defaultValue;
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

    const labelText = tr(subShapes.label);

    return (
        <div
            className={`ssr-root ${isCoarse ? 'ssr-root--coarse' : ''}`}
            role="group"
            aria-label={labelText}
        >
            {showPrimary && <div className="ssr-head">
                <span className="ssr-label">{labelText}</span>
            </div>}

            {showPrimary && <div className={isCoarse ? 'ssr-mobile-scroll' : 'ssr-chips'}>
                {subShapes.options.map(opt => {
                    const isChosen = chosenOption === opt.value;
                    const isDefault = chosenOption === null && opt.value === subShapes.defaultValue;
                    const holes = typeId === 'wine-rack' ? Number(opt.value) : undefined;
                    const chipClass = [
                        'ssr-chip',
                        isChosen ? 'is-active' : '',
                        isDefault ? 'is-default' : '',
                    ].filter(Boolean).join(' ');

                    return (
                        <button
                            key={opt.value}
                            type="button"
                            className={chipClass}
                            aria-pressed={isChosen}
                            disabled={disabled}
                            onClick={() => handleSelect(opt.value)}
                        >
                            <span className="ssr-chip-fig">
                                <ShapeFigure
                                    family={family}
                                    typeId={typeId}
                                    variant={opt.value}
                                    top={parsed.extra.top ?? null}
                                    holes={holes}
                                    dims={dims}
                                    active={isChosen}
                                    className="ssr-svg"
                                />
                            </span>
                            <span className="ssr-chip-text">{tr(opt.label)}</span>
                        </button>
                    );
                })}

                <button
                    type="button"
                    className="ssr-chip ssr-chip--free"
                    disabled={disabled}
                    onClick={handleFree}
                >
                    <span className="ssr-chip-text">{tr('Not listed')}</span>
                </button>
            </div>}

            {extraAxes.map(axis => (
                <div key={axis.kind} className="ssr-extra" role="group" aria-label={tr(axis.label)}>
                    <div className="ssr-head">
                        <span className="ssr-label">{tr(axis.label)}</span>
                    </div>
                    <div className={isCoarse ? 'ssr-mobile-scroll' : 'ssr-chips'}>
                        {axis.options.map(opt => {
                            const isChosen = parsed.extra[axis.kind] === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={['ssr-chip', isChosen ? 'is-active' : ''].filter(Boolean).join(' ')}
                                    aria-pressed={isChosen}
                                    disabled={disabled}
                                    onClick={() => handleExtra(axis, opt.value)}
                                >
                                    <span className="ssr-chip-fig">
                                        <ShapeFigure
                                            family={family}
                                            typeId={typeId}
                                            variant={primaryForExtras}
                                            top={opt.value}
                                            dims={dims}
                                            active={isChosen}
                                            className="ssr-svg"
                                        />
                                    </span>
                                    <span className="ssr-chip-text">{tr(opt.label)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};
