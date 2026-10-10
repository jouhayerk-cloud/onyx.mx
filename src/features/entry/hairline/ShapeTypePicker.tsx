import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr, trf } from '../../../lib/i18n';
import { matchEntry, suggestFor, visibleLibrary } from '../../../lib/shapeTypeLibrary';
import { Spring, falloff, sleep, wake } from '../../welcome/hairline/engine';
import { ShapeFigure } from './ShapeFigure';
import type { LibraryEntry, PickerValue } from './types';
import './shapeTypePicker.css';

export interface ShapeTypePickerProps {
    value: PickerValue;
    onChange: (v: PickerValue) => void;
    library: readonly LibraryEntry[];
    canSave: boolean;
    onSave?: (v: PickerValue) => Promise<boolean> | boolean | void;
    disabled?: boolean;
    loading?: boolean;
}

/** Tiles shown before "Show all". */
const FIRST = 24;
/** A tile lifts while the pointer is within this many tile widths of it. */
const REACH = 3;
/** Most suggestions offered under a partial or unknown pair. */
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
 * The Shape + Type selector: one hairline tile per (shape, type) pair of the library. It sits inside the form's Field,
 * so it draws no label of its own. The existing Shape and Type inputs are untouched; they write the same PickerValue
 * this reads, and the tile matching them is the chosen one.
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

    const typed = value.shape.trim() !== '' || value.type.trim() !== '';
    const chosen = useMemo(() => matchEntry(library, value.shape, value.type), [library, value.shape, value.type]);
    const newPair = value.shape.trim() !== '' && value.type.trim() !== '' && !chosen;

    const all = useMemo(() => visibleLibrary(library), [library]);
    const q = query.trim().toLowerCase();
    const matches = useMemo(() => (
        q ? all.filter(e => e.shape.toLowerCase().includes(q) || e.type.toLowerCase().includes(q)) : all
    ), [all, q]);
    const shown = expanded ? matches : matches.slice(0, FIRST);
    const tabKey = shown.some(e => e.key === chosen?.key) ? chosen?.key : shown[0]?.key;

    const suggestions = useMemo(() => (
        chosen || !typed ? [] : suggestFor(library, value.shape, value.type, SUGGESTIONS)
    ), [library, chosen, typed, value.shape, value.type]);

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
        if (!onSave || saveState !== 'idle') return;
        setSaveState('pending');
        let ok: boolean | void;
        try { ok = await onSave(value); } catch { ok = false; }
        if (ok === false) { setSaveState('idle'); return; }
        setSaveState('saved');
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), SAVED_MS);
    };

    return (
        <div className="stp">
            <div className="stp-head">
                <span id={`${uid}-title`} className="stp-title">{tr('Pick a shape and type')}</span>
                <input
                    type="search"
                    className="stp-search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={tr('Find a shape or type')}
                    aria-label={tr('Find a shape or type')}
                    disabled={disabled}
                />
            </div>

            {loading && <p className="stp-quiet">{tr('Loading shapes...')}</p>}
            {!loading && all.length === 0 && <p className="stp-quiet">{tr('No shapes yet. Save an item and it appears here.')}</p>}
            {all.length > 0 && matches.length === 0 && <p className="stp-quiet">{tr('No shape or type matches.')}</p>}

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
                                aria-label={`${entry.shape}, ${entry.type}, ${count}`}
                                tabIndex={entry.key === tabKey ? 0 : -1}
                                className="stp-tile"
                                disabled={disabled}
                                onClick={() => onChange({ shape: entry.shape, type: entry.type })}
                            >
                                <span className="stp-fig">
                                    <ShapeFigure
                                        family={entry.family}
                                        isMirror={entry.isMirror}
                                        motif={entry.motif}
                                        dims={entry.dims}
                                        holes={entry.holes}
                                        active={isChosen}
                                        className="stp-svg"
                                    />
                                </span>
                                <span className="stp-cap" aria-hidden="true">
                                    <span className="stp-shape">{entry.shape}</span>
                                    <span className="stp-type">{entry.type} · {count}</span>
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

            {(newPair || saveState === 'saved') && (
                <div className="stp-new">
                    {newPair && <span className="stp-new__name">{trf('New pair: {shape} · {type}', { shape: value.shape.trim(), type: value.type.trim() })}</span>}
                    {newPair && canSave && (
                        <button
                            type="button"
                            className="stp-save"
                            disabled={disabled || !onSave || saveState !== 'idle'}
                            onClick={save}
                        >
                            {saveState === 'saved' ? tr('Saved') : saveState === 'pending' ? tr('Saving...') : tr('Save to library')}
                        </button>
                    )}
                    {newPair && !canSave && <span className="stp-quiet">{tr('Only Developer and Admin can add pairs to the library.')}</span>}
                    {!newPair && saveState === 'saved' && <span className="stp-quiet">{tr('Saved')}</span>}
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
                            onClick={() => onChange({ shape: s.shape, type: s.type })}
                        >
                            {trf('Did you mean {pair}', { pair: `${s.shape} · ${s.type}` })}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
