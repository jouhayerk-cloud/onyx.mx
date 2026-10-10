import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr, trf } from '../../../lib/i18n';
import { typeKey } from '../../../lib/canonicalType';
import { suggestTypes, type TypeEntry } from '../../../lib/typeLibrary';
import { Spring, falloff, sleep, wake } from '../../welcome/hairline/engine';
import { ShapeFigure } from './ShapeFigure';
import './shapeTypePicker.css';

/** What the picker reads and writes: the Type input only. The Shape input is never touched here. */
export interface TypePickerValue { type: string }

export interface ShapeTypePickerProps {
    value: TypePickerValue;
    onChange: (v: TypePickerValue) => void;
    library: readonly TypeEntry[];
    canSave: boolean;
    onSave: (type: string) => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
}

/** Tiles shown before "Show all". */
const FIRST = 24;
/** A tile lifts while the pointer is within this many tile widths of it. */
const REACH = 3;
/** Most suggestions offered under a Type that is not in the library. */
const SUGGESTIONS = 4;
/** How long "Saved" stays on the button. */
const SAVED_MS = 2000;

const countText = (n: number) => (n === 0 ? tr('saved') : n === 1 ? tr('1 piece') : trf('{n} pieces', { n }));

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How many tiles share the first row, read from where they sit. */
function columnsOf(tiles: HTMLElement[]): number {
    if (!tiles.length) return 1;
    const top = tiles[0].getBoundingClientRect().top;
    let n = 0;
    while (n < tiles.length && Math.abs(tiles[n].getBoundingClientRect().top - top) < 2) n++;
    return Math.max(1, n);
}

/**
 * The Type selector: one hairline tile per canonical Type of the library (no photo, the figure and the Type name only).
 * It sits inside the form's Field, so it draws no label of its own. The existing Type input is untouched; it writes the
 * same value this reads, and the tile matching it is the chosen one. Shape is not a tile: it is a free sub group.
 *
 * The grid is a radiogroup with one tab stop (arrows, Home, End), as VendorPicker. The pointer lifts the nearby tiles
 * by setting --sf-lift on each tile from the shared loop; nothing runs at rest, and reduced motion turns it off.
 */
export const ShapeTypePicker: React.FC<ShapeTypePickerProps> = ({
    value, onChange, library, canSave, onSave, disabled = false, loading = false,
}) => {
    const uid = useId();
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved'>('idle');
    const gridRef = useRef<HTMLDivElement>(null);
    const tileEls = useRef(new Map<string, HTMLButtonElement>());
    const lifts = useRef(new Map<string, Spring>());
    const savedTimer = useRef<number | undefined>(undefined);

    const typed = value.type.trim();
    const chosen = useMemo(() => (typed ? library.find(e => e.key === typeKey(typed)) : undefined), [library, typed]);
    const newType = typed !== '' && !chosen;

    const matches = useMemo(() => suggestTypes(library, query, library.length), [library, query]);
    const shown = expanded ? matches : matches.slice(0, FIRST);
    const tabKey = shown.some(e => e.key === chosen?.key) ? chosen?.key : shown[0]?.key;

    const suggestions = useMemo(() => (
        chosen || !typed ? [] : suggestTypes(library, typed, SUGGESTIONS)
    ), [library, chosen, typed]);

    const springOf = (key: string): Spring => {
        let s = lifts.current.get(key);
        if (!s) { s = new Spring(0); lifts.current.set(key, s); }
        return s;
    };

    const tick = useRef((dt: number): boolean => {
        let moving = false;
        lifts.current.forEach((s, key) => {
            if (s.step(dt)) moving = true;
            tileEls.current.get(key)?.style.setProperty('--sf-lift', s.x.toFixed(3));
        });
        return moving;
    }).current;

    useEffect(() => () => {
        sleep(tick);
        window.clearTimeout(savedTimer.current);
    }, [tick]);

    const setTileEl = (key: string, el: HTMLButtonElement | null) => {
        if (!el) { tileEls.current.delete(key); return; }
        tileEls.current.set(key, el);
        el.style.setProperty('--sf-lift', String(lifts.current.get(key)?.x ?? 0));
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (reducedMotion()) return;
        tileEls.current.forEach((el, key) => {
            const r = el.getBoundingClientRect();
            const w = r.width || 1;
            const dx = (e.clientX - (r.left + r.width / 2)) / w;
            const dy = (e.clientY - (r.top + r.height / 2)) / w;
            springOf(key).t = falloff(Math.hypot(dx, dy), REACH);
        });
        lifts.current.forEach((s, key) => { if (!tileEls.current.has(key)) s.t = 0; });
        wake(tick);
    };

    const onPointerLeave = () => {
        lifts.current.forEach(s => { s.t = 0; });
        wake(tick);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const tiles = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
        const at = tiles.findIndex(t => t === document.activeElement);
        if (at < 0) return;
        const cols = columnsOf(tiles);
        let next = at;
        if (e.key === 'ArrowRight') next = at + 1;
        else if (e.key === 'ArrowLeft') next = at - 1;
        else if (e.key === 'ArrowDown') next = at + cols;
        else if (e.key === 'ArrowUp') next = at - cols;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tiles.length - 1;
        else return;
        e.preventDefault();
        if (next < 0 || next >= tiles.length) return;
        tiles[next].focus();
    };

    const save = async () => {
        if (saveState !== 'idle') return;
        setSaveState('pending');
        try { await onSave(typed); } catch { setSaveState('idle'); return; }
        setSaveState('saved');
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), SAVED_MS);
    };

    return (
        <div className="stp">
            <div className="stp-head">
                <span id={`${uid}-title`} className="stp-title">{tr('Pick a type')}</span>
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
            {!loading && library.length === 0 && <p className="stp-quiet">{tr('No types yet. Save an item and it appears here.')}</p>}
            {library.length > 0 && matches.length === 0 && <p className="stp-quiet">{tr('No type matches.')}</p>}

            {shown.length > 0 && (
                <div
                    ref={gridRef}
                    className="stp-grid"
                    role="radiogroup"
                    aria-labelledby={`${uid}-title`}
                    onKeyDown={onKeyDown}
                    onPointerMove={onPointerMove}
                    onPointerLeave={onPointerLeave}
                >
                    {shown.map(entry => {
                        const isChosen = entry.key === chosen?.key;
                        const count = countText(entry.count);
                        return (
                            <button
                                key={entry.key}
                                ref={el => setTileEl(entry.key, el)}
                                type="button"
                                role="radio"
                                aria-checked={isChosen}
                                aria-label={`${entry.label}, ${count}`}
                                tabIndex={entry.key === tabKey ? 0 : -1}
                                className="stp-tile"
                                disabled={disabled}
                                onClick={() => onChange({ type: entry.label })}
                            >
                                <span className="stp-fig">
                                    <ShapeFigure
                                        family={entry.family}
                                        isMirror={entry.isMirror}
                                        typeId={entry.id}
                                        dims={entry.dims}
                                        holes={entry.holes[0]}
                                        active={isChosen}
                                        className="stp-svg"
                                    />
                                </span>
                                <span className="stp-cap" aria-hidden="true">
                                    <span className="stp-shape">{entry.label}</span>
                                    <span className="stp-type">{count}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {matches.length > FIRST && (
                <div className="stp-more-row">
                    <button
                        type="button"
                        className="stp-more"
                        aria-expanded={expanded}
                        disabled={disabled}
                        onClick={() => setExpanded(x => !x)}
                    >
                        {expanded ? tr('Show fewer') : trf('Show all {n}', { n: matches.length })}
                    </button>
                </div>
            )}

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
                    {newType && !canSave && <span className="stp-quiet">{tr('Only Developer and Admin can add types to the library.')}</span>}
                    {!newType && saveState === 'saved' && <span className="stp-quiet">{tr('Saved')}</span>}
                </div>
            )}

            {suggestions.length > 0 && (
                <div className="stp-chips">
                    {suggestions.map(s => (
                        <button
                            key={s.key}
                            type="button"
                            className="stp-chip"
                            disabled={disabled}
                            onClick={() => onChange({ type: s.label })}
                        >
                            {trf('Did you mean {type}', { type: s.label })}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
