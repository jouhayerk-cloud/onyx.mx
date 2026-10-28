import React, { useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { X } from 'lucide-react';
import { inventoryHexRangeAtom, visibleInventoryAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { extractItemHexString } from '../../lib/utils';
import {
    COLS, LIGHT_BINS, RANGE_MIN_SHARE, inRange, inventoryColorMap, itemHistogram, rangeShare, type HexRange,
} from '../../lib/hexColorMap';

const colOf = (c: number) => c % COLS;
const rowOf = (c: number) => Math.floor(c / COLS);
const boundsOf = (cells: number[]): HexRange => ({
    c0: Math.min(...cells.map(colOf)), c1: Math.max(...cells.map(colOf)),
    r0: Math.min(...cells.map(rowOf)), r1: Math.max(...cells.map(rowOf)),
});
const sameRange = (a: HexRange | null, b: HexRange) => !!a && a.c0 === b.c0 && a.c1 === b.c1 && a.r0 === b.r0 && a.r1 === b.r1;

// The colour goes in as a background IMAGE: theme rules force every button's background-color (!important), not its image.
const paint = (c: string) => `linear-gradient(${c}, ${c})`;

type Drag = { from: 'bar' | 'map'; a: number; b: number };

/**
 * The inventory's colours, built from every item's hex map (lib/hexColorMap):
 *  - a full-width SPECTRUM BAR: each colour cell as wide as its share across all items, hue by hue (neutrals last),
 *    light to dark within a hue, in the real mean stone colour;
 *  - the COLOUR MAP under it: hue across, light to dark down, each cell as strong as the number of items carrying it.
 * Drag across either to filter the list to that colour range; tap a lone selected cell again to clear.
 */
export const HexColorMapPanel: React.FC = () => {
    // Only the workbooks toggled ON in the View bar (825 / 326 / 826), as the list shows them.
    const rows = useAtomValue(visibleInventoryAtom);
    const withMaps = useMemo(() => rows.filter((r: any) => itemHistogram(r?.data || r, extractItemHexString)).length, [rows]);
    const [range, setRange] = useAtom(inventoryHexRangeAtom);
    const [drag, setDrag] = useState<Drag | null>(null);

    const map = useMemo(() => inventoryColorMap(rows, extractItemHexString), [rows]);
    const mosaic = useMemo(() => {
        const cols: { c: number; w: number; cells: number[] }[] = [];
        for (let c = 0; c < COLS; c++) {
            const cells: number[] = [];
            let w = 0;
            for (let r = 0; r < LIGHT_BINS; r++) { const cell = r * COLS + c; if (map.counts[cell]) { cells.push(cell); w += map.weight[cell]; } }
            if (cells.length) cols.push({ c, w: Math.sqrt(w), cells });
        }
        return cols;
    }, [map]);
    // Bar order: hue column by column, light to dark inside each. Cells under 0.4% of all colour are left out, so the
    // bar shows the inventory's real colours instead of a fringe of one-pixel slivers.
    const barCells = useMemo(() => {
        const total = map.weight.reduce((a, b) => a + b, 0);
        const out: number[] = [];
        for (let c = 0; c < COLS; c++) for (let r = 0; r < LIGHT_BINS; r++) if (map.weight[r * COLS + c] > total * 0.004) out.push(r * COLS + c);
        return out;
    }, [map]);
    const matchCount = useMemo(() => range
        ? rows.filter((r: any) => rangeShare(itemHistogram(r?.data || r, extractItemHexString), range) >= RANGE_MIN_SHARE).length
        : 0, [rows, range]);

    const dragRange = (d: Drag): HexRange => d.from === 'map'
        ? boundsOf([d.a, d.b])
        : boundsOf(barCells.slice(Math.min(d.a, d.b), Math.max(d.a, d.b) + 1));
    const shown = drag ? dragRange(drag) : range;
    const commit = () => {
        if (!drag) return;
        const next = dragRange(drag);
        setRange(drag.a === drag.b && sameRange(range, next) ? null : next);
        setDrag(null);
    };
    const start = (from: Drag['from'], i: number) => (e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId);   // touch captures by default; release so the drag reaches the next cell
        setDrag({ from, a: i, b: i });
    };
    const extend = (from: Drag['from'], i: number) => () => { if (drag?.from === from) setDrag({ ...drag, b: i }); };
    const keyPick = (cell: number) => (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const r = boundsOf([cell]);
        setRange(sameRange(range, r) ? null : r);
    };

    return (
        <div className="hexmap" onPointerUp={commit} onPointerLeave={commit}>
            <div className="hexmap-head">
                <span className="hexmap-title">{tr("Colour map")}</span>
                <span className="hexmap-hint tabular-nums" title={tr("Items in the visible workbooks that have a hex map")}>{withMaps} / {rows.length} {tr("with hex maps")}</span>
                <span className="hexmap-status">
                    {range
                        ? <><b className="tabular-nums">{matchCount}</b> {tr("items in range")}
                            <button type="button" className="utb-control utb-icon-only" onClick={() => setRange(null)} aria-label={tr("Clear colour range")} title={tr("Clear colour range")}><X size={13} strokeWidth={2.5} /></button></>
                        : tr("Drag across the bar or the map to filter by colour")}
                </span>
            </div>

                        <div className="hexmap-bar" role="group" aria-label={tr("Inventory colours")}>
                {barCells.map((cell, i) => (
                    <button key={cell} type="button"
                        className={`hexmap-seg${shown && inRange(cell, shown) ? ' is-on' : ''}`}
                        style={{ flexGrow: map.weight[cell], backgroundImage: paint(map.color[cell]) }}
                        title={`${map.counts[cell]} ${tr("items")}`} aria-label={`${map.counts[cell]} ${tr("items")}`}
                        onPointerDown={start('bar', i)} onPointerEnter={extend('bar', i)} onKeyDown={keyPick(cell)} />
                ))}
            </div>

            {/* The mosaic: one column per hue that some item carries (neutrals last), each as wide as its share; inside,
                only the lightness steps that exist, light to dark, each as tall as the items carrying it. No empty cells.
                Shown only once a colour is picked on the bar, and then only for the picked hues, to refine by shade. */}
            {range && (
            <div className="hexmap-mosaic" role="group" aria-label={tr("Colour map")}>
                {mosaic.filter(col => col.c >= range.c0 && col.c <= range.c1).map(col => (
                    <div key={col.c} className="hexmap-col" style={{ flexGrow: col.w }}>
                        {col.cells.map(cell => (
                            <button key={cell} type="button"
                                className={`hexmap-cell${shown && inRange(cell, shown) ? ' is-on' : ''}`}
                                style={{ flexGrow: map.counts[cell], backgroundImage: paint(map.color[cell]) }}
                                title={`${map.counts[cell]} ${tr("items")}`} aria-label={`${map.counts[cell]} ${tr("items")}`}
                                onPointerDown={start('map', cell)} onPointerEnter={extend('map', cell)} onKeyDown={keyPick(cell)} />
                        ))}
                    </div>
                ))}
            </div>
            )}
        </div>
    );
};
