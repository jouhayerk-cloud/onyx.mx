import React, { useId, useMemo, useRef, useState } from 'react';
import { tr, trf } from '../../../lib/i18n';
import { canonicalType, typeKey } from '../../../lib/canonicalType';
import { suggestTypes, type TypeEntry } from '../../../lib/typeLibrary';
import type { Dims } from './types';
import { ShapeFigure } from './ShapeFigure';
import { SubShapeRow } from './SubShapeRow';
import { useCoarseLayout } from './useCoarseLayout';
import { subShapesFor, parseShapeText, extraAxesFor } from './variantOptions';
import './shapeTypePicker.css';
import './dynamicSelector.css';

/** What the picker reads and writes: both Type and Shape fields. */
export interface TypePickerValue {
    type: string;
    shape: string;
}

export interface ShapeTypePickerProps {
    value: TypePickerValue;
    onChange: (patch: Partial<TypePickerValue>) => void;
    library: readonly TypeEntry[];
    canSave: boolean;
    onSave: (type: string) => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
    dims?: Dims | null;
}

const FIRST_DESKTOP = 12;
const FIRST_MOBILE = 8;
const SUGGESTIONS = 4;
const SAVED_MS = 2000;

const countText = (n: number) => (n === 0 ? tr('saved') : n === 1 ? tr('1 piece') : trf('{n} pieces', { n }));

/**
 * Dynamic hairline style selector.
 * Adapts to desktop (chip buttons) or mobile (in-flow list), reveals sub-shape options
 * upon Type selection, regenerates hairline drawings live, and collapses to a summary row when filled.
 */
export const ShapeTypePicker: React.FC<ShapeTypePickerProps> = ({
    value,
    onChange,
    library,
    canSave,
    onSave,
    disabled = false,
    loading = false,
    dims = null,
}) => {
    const uid = useId();
    const isCoarse = useCoarseLayout();
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved'>('idle');
    const savedTimer = useRef<number | undefined>(undefined);

    const typedType = (value.type ?? '').trim();
    const typedShape = (value.shape ?? '').trim();

    const currentKey = typeKey(typedType);
    const chosen = useMemo(
        () => (typedType ? library.find(e => e.key === currentKey) : undefined),
        [library, currentKey, typedType],
    );
    const chosenTypeId = chosen?.id ?? canonicalType(typedType).id;
    const newType = typedType !== '' && !chosen;

    const subShapes = subShapesFor(chosenTypeId);
    const hasSubShapes = Boolean(chosenTypeId && subShapes.kind !== 'none' && subShapes.options.length > 0);

    // Initial collapse state: collapsed if Type is chosen and either has no sub-shapes or sub-shape is filled.
    const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
        if (!typedType) return false;
        const tid = canonicalType(typedType).id;
        const sub = subShapesFor(tid);
        if (sub.kind === 'none') return true;
        return Boolean(typedShape);
    });

    const matches = useMemo(() => suggestTypes(library, query, library.length), [library, query]);
    const limit = isCoarse ? FIRST_MOBILE : FIRST_DESKTOP;
    const shown = expanded ? matches : matches.slice(0, limit);

    const suggestions = useMemo(() => (
        chosen || !typedType ? [] : suggestTypes(library, typedType, SUGGESTIONS)
    ), [library, chosen, typedType]);

    const handlePickType = (entryLabel: string) => {
        const newId = canonicalType(entryLabel).id;
        const sub = subShapesFor(newId);
        const isValidOption = Boolean(newId && typedShape && parseShapeText(newId, typedShape).primary !== null);

        if (isValidOption) {
            onChange({ type: entryLabel });
        } else {
            onChange({ type: entryLabel, shape: '' });
        }

        if (!newId || sub.kind === 'none') {
            setIsCollapsed(true);
        } else {
            setIsCollapsed(false);
        }
    };

    const handlePickSubShape = (shapeText: string, source: 'primary' | 'extra') => {
        onChange({ shape: shapeText });
        // Choosing the top finishes the selection. Choosing the form finishes it too, unless the form has an extra row (open or closed top) still to answer.
        const picked = parseShapeText(chosenTypeId, shapeText).primary;
        if (source === 'extra' || extraAxesFor(chosenTypeId, picked).length === 0) setIsCollapsed(true);
    };

    const save = async () => {
        if (saveState !== 'idle') return;
        setSaveState('pending');
        try {
            await onSave(typedType);
        } catch {
            setSaveState('idle');
            return;
        }
        setSaveState('saved');
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), SAVED_MS);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape' && expanded) {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(false);
        }
    };

    const parsedShape = parseShapeText(chosenTypeId, typedShape);
    const chosenOption = parsedShape.primary;
    const activeVariant = chosenOption ?? subShapes.defaultValue ?? null;
    const activeTop = parsedShape.extra.top ?? null;
    const holesCount = chosenTypeId === 'wine-rack'
        ? (Number(activeVariant) || chosen?.holes[0] || undefined)
        : undefined;

    // ── COLLAPSED SUMMARY VIEW ─────────────────────────────────────────────
    if (isCollapsed && (chosen || typedType)) {
        const displayType = chosen?.label ?? typedType;
        const displayShape = typedShape;
        const summaryLabel = displayShape ? `${displayType} · ${displayShape}` : displayType;

        return (
            <div className="stp">
                <div className="stp-summary">
                    <div className="stp-summary-left">
                        <span className="stp-summary-fig">
                            <ShapeFigure
                                family={chosen?.family ?? 'box'}
                                isMirror={chosen?.isMirror ?? false}
                                typeId={chosenTypeId}
                                variant={activeVariant}
                                top={activeTop}
                                dims={dims ?? chosen?.dims ?? null}
                                holes={holesCount}
                                className="stp-summary-svg"
                            />
                        </span>
                        <div className="stp-summary-text">
                            <span className="stp-summary-label">{summaryLabel}</span>
                            {chosen && <span className="stp-summary-count">{countText(chosen.count)}</span>}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="stp-summary-change"
                        disabled={disabled}
                        onClick={() => setIsCollapsed(false)}
                    >
                        {tr('Change')}
                    </button>
                </div>
            </div>
        );
    }

    // ── UNCOLLAPSED INTERACTIVE SELECTOR ───────────────────────────────────
    return (
        <div className="stp" onKeyDown={onKeyDown}>
            <div className="stp-head">
                <span id={`${uid}-title`} className="stp-title">{tr('Pick a type')}</span>
                {typedType !== '' && (
                    <button
                        type="button"
                        className="stp-done"
                        disabled={disabled}
                        onClick={() => setIsCollapsed(true)}
                    >
                        {tr('Done')}
                    </button>
                )}
                <input
                    type="search"
                    className="stp-search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={tr('Find a type')}
                    aria-label={tr('Find a type')}
                    disabled={disabled}
                />
            </div>

            {loading && <p className="stp-quiet">{tr('Loading types...')}</p>}
            {!loading && library.length === 0 && (
                <p className="stp-quiet">{tr('No types yet. Save an item and it appears here.')}</p>
            )}
            {library.length > 0 && matches.length === 0 && (
                <p className="stp-quiet">{tr('No type matches.')}</p>
            )}

            {/* STEP 1: Type Selection (Desktop Chips or Mobile List) */}
            {shown.length > 0 && !isCoarse && (
                <div
                    className="stp-type-chips"
                    role="group"
                    aria-labelledby={`${uid}-title`}
                >
                    {shown.map(entry => {
                        const isChosen = entry.key === currentKey;
                        const count = countText(entry.count);
                        return (
                            <button
                                key={entry.key}
                                type="button"
                                className={`stp-type-chip ${isChosen ? 'is-active' : ''}`}
                                aria-pressed={isChosen}
                                aria-label={`${entry.label}, ${count}`}
                                disabled={disabled}
                                onClick={() => handlePickType(entry.label)}
                            >
                                <span className="stp-type-chip-fig">
                                    <ShapeFigure
                                        family={entry.family}
                                        isMirror={entry.isMirror}
                                        typeId={entry.id}
                                        dims={entry.dims}
                                        holes={entry.holes[0]}
                                        active={isChosen}
                                        className="stp-type-chip-svg"
                                    />
                                </span>
                                <span className="stp-type-chip-cap">
                                    <span className="stp-type-chip-label">{entry.label}</span>
                                    <span className="stp-type-chip-count">{count}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {shown.length > 0 && isCoarse && (
                <div
                    className="stp-type-list"
                    role="group"
                    aria-labelledby={`${uid}-title`}
                >
                    {shown.map(entry => {
                        const isChosen = entry.key === currentKey;
                        const count = countText(entry.count);
                        return (
                            <button
                                key={entry.key}
                                type="button"
                                className={`stp-type-row ${isChosen ? 'is-active' : ''}`}
                                aria-pressed={isChosen}
                                aria-label={`${entry.label}, ${count}`}
                                disabled={disabled}
                                onClick={() => handlePickType(entry.label)}
                            >
                                <span className="stp-type-row-left">
                                    <span className="stp-type-row-fig">
                                        <ShapeFigure
                                            family={entry.family}
                                            isMirror={entry.isMirror}
                                            typeId={entry.id}
                                            dims={entry.dims}
                                            holes={entry.holes[0]}
                                            active={isChosen}
                                            className="stp-type-row-svg"
                                        />
                                    </span>
                                    <span className="stp-type-row-label">{entry.label}</span>
                                </span>
                                <span className="stp-type-row-count">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* More Types Button */}
            {matches.length > limit && (
                <div className="stp-more-row">
                    <button
                        type="button"
                        className="stp-more"
                        aria-expanded={expanded}
                        disabled={disabled}
                        onClick={() => setExpanded(x => !x)}
                    >
                        {expanded ? tr('Fewer types') : tr('More types')}
                    </button>
                </div>
            )}

            {/* Unknown Type / Save to Library */}
            {(newType || saveState === 'saved') && (
                <div className="stp-add">
                    {newType && canSave && (
                        <button
                            type="button"
                            className="stp-save"
                            disabled={disabled || saveState !== 'idle'}
                            onClick={save}
                        >
                            {saveState === 'saved' ? tr('Saved') : saveState === 'pending' ? tr('Saving...') : tr('Save to library')}
                        </button>
                    )}
                    {newType && !canSave && (
                        <span className="stp-quiet">{tr('Only Developer and Admin can add types to the library.')}</span>
                    )}
                    {!newType && saveState === 'saved' && (
                        <span className="stp-quiet">{tr('Saved')}</span>
                    )}
                </div>
            )}

            {/* Did You Mean Suggestions */}
            {suggestions.length > 0 && (
                <div className="stp-chips">
                    {suggestions.map(s => (
                        <button
                            key={s.key}
                            type="button"
                            className="stp-chip"
                            disabled={disabled}
                            onClick={() => handlePickType(s.label)}
                        >
                            {trf('Did you mean {type}', { type: s.label })}
                        </button>
                    ))}
                </div>
            )}

            {/* STEP 2: Sub-Shape Row */}
            {chosenTypeId && hasSubShapes && (
                <SubShapeRow
                    typeId={chosenTypeId}
                    value={typedShape}
                    onChange={handlePickSubShape}
                    dims={dims ?? chosen?.dims ?? null}
                    family={chosen?.family ?? 'box'}
                    isCoarse={isCoarse}
                    disabled={disabled}
                />
            )}

            {/* STEP 3: Live Preview Drawing (~180px) */}
            {chosenTypeId && (
                <div className="stp-live-preview">
                    <div className="stp-preview-box">
                        <ShapeFigure
                            key={`${chosenTypeId}-${activeVariant ?? 'none'}-${activeTop ?? 'none'}`}
                            family={chosen?.family ?? 'box'}
                            isMirror={chosen?.isMirror ?? false}
                            typeId={chosenTypeId}
                            variant={activeVariant}
                            top={activeTop}
                            dims={dims ?? chosen?.dims ?? null}
                            holes={holesCount}
                            active
                            className="stp-live-figure"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
