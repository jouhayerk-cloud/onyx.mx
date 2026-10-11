import React, { useId, useMemo, useRef, useState } from 'react';
import { tr, trf } from '../../../lib/i18n';
import { canonicalType, typeKey } from '../../../lib/canonicalType';
import { suggestTypes, type TypeEntry } from '../../../lib/typeLibrary';
import type { Dims } from './types';
import { ShapeFigure } from './ShapeFigure';
import { SubShapeRow } from './SubShapeRow';
import { HairlineScroller, type HairlineScrollerItem } from './HairlineScroller';
import { subShapesFor, parseShapeText } from './variantOptions';
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

const SUGGESTIONS = 4;
const SAVED_MS = 2000;

const countText = (n: number) => (n === 0 ? tr('saved') : n === 1 ? tr('1 piece') : trf('{n} pieces', { n }));

/**
 * Hairline selector for Add Entry.
 * Rebuilt as horizontally scrollable grids that collapse to the chosen element,
 * and re-deploy when clicked.
 * Live drawing sits to the left on desktop and above on mobile.
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
    const [query, setQuery] = useState('');
    const [typeExpanded, setTypeExpanded] = useState(false);
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

    const matches = useMemo(() => {
        if (!query.trim()) return library;
        return suggestTypes(library, query, library.length);
    }, [library, query]);

    const suggestions = useMemo(() => (
        chosen || !typedType ? [] : suggestTypes(library, typedType, SUGGESTIONS)
    ), [library, chosen, typedType]);

    const handlePickType = (entryLabel: string) => {
        const newId = canonicalType(entryLabel).id;
        const isValidOption = Boolean(newId && typedShape && parseShapeText(newId, typedShape).primary !== null);

        if (isValidOption) {
            onChange({ type: entryLabel });
        } else {
            onChange({ type: entryLabel, shape: '' });
        }

        setQuery('');
        setTypeExpanded(false);
    };

    const handlePickSubShape = (shapeText: string, _source: 'primary' | 'extra') => {
        onChange({ shape: shapeText });
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
        if (e.key === 'Escape' && query) {
            e.preventDefault();
            e.stopPropagation();
            setQuery('');
            setTypeExpanded(false);
        }
    };

    const parsedShape = parseShapeText(chosenTypeId, typedShape);
    const chosenOption = parsedShape.primary;
    const activeVariant = chosenOption ?? subShapes.defaultValue ?? null;
    const activeTop = parsedShape.extra.top ?? null;
    const holesCount = chosenTypeId === 'wine-rack'
        ? (Number(activeVariant) || chosen?.holes[0] || undefined)
        : undefined;

    const typeItems: ReadonlyArray<HairlineScrollerItem> = useMemo(() => {
        return matches.map(entry => {
            const isChosen = entry.key === currentKey || entry.label === typedType;
            const count = countText(entry.count);

            return {
                key: entry.label,
                label: entry.label,
                meta: count,
                node: (
                    <ShapeFigure
                        family={entry.family}
                        isMirror={entry.isMirror}
                        typeId={entry.id}
                        dims={entry.dims}
                        holes={entry.holes[0]}
                        active={isChosen}
                        className="stp-type-scroller-svg"
                    />
                ),
            };
        });
    }, [matches, currentKey, typedType]);

    return (
        <div className="stp" onKeyDown={onKeyDown}>
            {/* Header: title and search */}
            <div className="stp-head">
                <span id={`${uid}-title`} className="stp-title">{tr('Pick a type')}</span>
                <input
                    type="search"
                    className="stp-search"
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
                        if (e.target.value) setTypeExpanded(true);
                    }}
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

            {/* Live Drawing + Scrollers layout */}
            <div className="stp-layout">
                {chosenTypeId && (
                    <div className="stp-layout__preview">
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

                <div className="stp-layout__scrollers">
                    {/* Reusable HairlineScroller for Types */}
                    <HairlineScroller
                        label={tr('Pick a type')}
                        size="type"
                        items={typeItems}
                        value={chosen?.label ?? (typedType || null)}
                        onChange={handlePickType}
                        disabled={disabled}
                        expanded={Boolean(query) || typeExpanded || !typedType}
                        onExpandedChange={setTypeExpanded}
                    />

                    {/* Sub-Shape Row (Form / Size / Holes / Top) */}
                    {chosenTypeId && hasSubShapes && (
                        <SubShapeRow
                            typeId={chosenTypeId}
                            value={typedShape}
                            onChange={handlePickSubShape}
                            dims={dims ?? chosen?.dims ?? null}
                            family={chosen?.family ?? 'box'}
                            disabled={disabled}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
