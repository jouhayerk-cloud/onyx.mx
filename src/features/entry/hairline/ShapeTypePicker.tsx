import React, { useId, useMemo, useRef, useState } from 'react';
import { tr, trf } from '../../../lib/i18n';
import { canonicalType, typeKey } from '../../../lib/canonicalType';
import { suggestTypes, type TypeEntry } from '../../../lib/typeLibrary';
import type { Dims } from './types';
import { ShapeFigure } from './ShapeFigure';
import { SubShapeRow } from './SubShapeRow';
import { HairlineScroller, type HairlineScrollerItem } from './HairlineScroller';
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

const SUGGESTIONS = 4;
const SAVED_MS = 2000;

const countText = (n: number) => (n === 0 ? tr('saved') : n === 1 ? tr('1 piece') : trf('{n} pieces', { n }));

type PickerView = 'types' | 'forms' | 'final';

/**
 * Hairline selector for Add Entry: Type, then Form, then ONE final tile.
 * - types: every Type as a horizontally scrolling grid.
 * - forms: the chosen Type collapses to a parent tile (click it to see all Types again)
 *   and the forms of that Type deploy beside it.
 * - final: only the chosen Form is shown, as one tile; clicking it deploys the forms again.
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
    // The owner's explicit choice of view; null follows what is filled in.
    const [viewOverride, setViewOverride] = useState<PickerView | null>(null);
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
        setViewOverride(null);
    };

    const handlePickSubShape = (shapeText: string, _source: 'primary' | 'extra') => {
        setViewOverride(null);
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
            setViewOverride(null);
        }
    };

    const parsedShape = parseShapeText(chosenTypeId, typedShape);
    const chosenOption = parsedShape.primary;
    const activeVariant = chosenOption ?? subShapes.defaultValue ?? null;
    const activeTop = parsedShape.extra.top ?? null;

    // Nothing more to ask once the form (when the Type has several) and every extra axis (the top of a lamp) are chosen.
    const formDone = !hasSubShapes || (
        (subShapes.options.length <= 1 || chosenOption !== null)
        && extraAxesFor(chosenTypeId, activeVariant).every(axis => parsedShape.extra[axis.kind] !== undefined)
    );
    const derivedView: PickerView = !typedType ? 'types' : formDone ? 'final' : 'forms';
    const view: PickerView = query ? 'types' : (viewOverride ?? derivedView);
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

    // The one tile of the final view: the chosen form (or the Type itself when it has no forms).
    const finalItems: ReadonlyArray<HairlineScrollerItem> = useMemo(() => {
        if (!typedType) return [];
        const typeLabel = chosen?.label ?? typedType;
        return [{
            key: 'final',
            label: hasSubShapes && typedShape ? typedShape : typeLabel,
            meta: hasSubShapes && typedShape ? typeLabel : undefined,
            node: (
                <ShapeFigure
                    family={chosen?.family ?? 'box'}
                    isMirror={chosen?.isMirror ?? false}
                    typeId={chosenTypeId}
                    variant={hasSubShapes ? activeVariant : null}
                    top={activeTop}
                    dims={dims ?? chosen?.dims ?? null}
                    holes={holesCount}
                    active
                    className="ssr-scroller-svg"
                />
            ),
        }];
    }, [typedType, typedShape, hasSubShapes, chosen, chosenTypeId, activeVariant, activeTop, dims, holesCount]);

    return (
        <div className="stp ui-root" onKeyDown={onKeyDown}>
            {/* Header: title and search */}
            <div className="stp-head">
                <span id={`${uid}-title`} className="stp-title">{tr('Pick a type')}</span>
                <input
                    type="search"
                    className="stp-search"
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
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

            {/* Type, then Form, then ONE final tile */}
            <div className="stp-layout">
                <div className="stp-layout__scrollers">
                    {view === 'final' ? (
                        <HairlineScroller
                            label={hasSubShapes ? tr('Form') : tr('Pick a type')}
                            size="sub"
                            items={finalItems}
                            value="final"
                            onChange={() => {}}
                            disabled={disabled}
                            expanded={false}
                            onExpandedChange={open => { if (open) setViewOverride(hasSubShapes ? 'forms' : 'types'); }}
                        />
                    ) : (
                        <>
                            {/* The Type scroller: open in the types view, the parent tile in the forms view */}
                            <HairlineScroller
                                label={tr('Pick a type')}
                                size="type"
                                items={typeItems}
                                value={chosen?.label ?? (typedType || null)}
                                onChange={handlePickType}
                                disabled={disabled}
                                expanded={view === 'types'}
                                onExpandedChange={open => setViewOverride(open ? 'types' : null)}
                            />

                            {/* Sub-Shape Row (Form / Size / Holes / Top) */}
                            {view === 'forms' && chosenTypeId && hasSubShapes && (
                                <SubShapeRow
                                    key={`${chosenTypeId}-${viewOverride ?? 'auto'}`}
                                    typeId={chosenTypeId}
                                    value={typedShape}
                                    onChange={handlePickSubShape}
                                    dims={dims ?? chosen?.dims ?? null}
                                    family={chosen?.family ?? 'box'}
                                    disabled={disabled}
                                    forceOpen={viewOverride === 'forms'}
                                />
                            )}
                        </>
                    )}
                </div>
                {view === 'forms' && (
                    <div className="stp-done">
                        <button type="button" className="stp-done__btn" disabled={disabled} onClick={() => setViewOverride('final')}>
                            {tr('Done')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
