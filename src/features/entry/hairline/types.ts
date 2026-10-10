/**
 * Contracts of the Add Entry shape + type selector (hairline style).
 * Decisions (Ramses, 2026-10-09): one tile = one normalised (shape, type) pair; the library is the pairs found in the
 * inventory plus pairs saved by hand in a new Supabase table (Developer and Admin write); entries that hold a person's
 * name are hidden from the selector but stay in the data; the existing Shape and Type inputs stay untouched.
 *
 * The figure family comes from classifyGeometry (src/lib/geometry.ts) and nothing else: no fourth classifier.
 */
import type { Geometry } from '../../../lib/geometry';
import { proj, type Cam } from '../../welcome/hairline/engine';

export type { Geometry };

/** A drawing motif keyed by Type words, drawn on top of the family silhouette so 45 box pairs do not look alike. */
export type Motif =
    | 'pendant'
    | 'table-lamp'
    | 'tower-lamp'
    | 'floor-lamp'
    | 'wall-panel'
    | 'wine-rack'
    | 'table'
    | 'canoe'
    | 'fountain';

export interface Dims { w: number; h: number; d: number }

/** One tile of the selector. */
export interface LibraryEntry {
    /** normKey(shape, type): lower case, collapsed spaces, "shape|type". Unique. */
    key: string;
    /** Display spelling, canonical() Title Case. */
    shape: string;
    type: string;
    /** Rows that use this pair (0 for a saved-only pair). */
    count: number;
    source: 'items' | 'saved' | 'both';
    family: Geometry;
    /** True for any mirror, including one classified as box. */
    isMirror: boolean;
    motif: Motif | null;
    /** Median W, H, D in cm over the rows, null when no row has dimensions. */
    dims: Dims | null;
    /** N for a wine rack whose Type reads "N Holes". */
    holes?: number;
    /** A person's name or another entry kept out of the shared grid; never shown by the picker. */
    hidden: boolean;
}

/** A pair saved by hand (row of the shape_type_library table). */
export interface SavedPair {
    id?: string;
    shape: string;
    type: string;
    created_by?: string | null;
    created_at?: string;
}

/** What the picker reads and writes: exactly the two form fields. */
export interface PickerValue { shape: string; type: string }

export interface ShapeFigureProps {
    family: Geometry;
    isMirror?: boolean;
    motif?: Motif | null;
    /** Canonical Type id (src/lib/canonicalType.ts): when it has a dedicated figure it wins over motif and family. */
    typeId?: string | null;
    dims?: Dims | null;
    holes?: number;
    /** 0 at rest, 1 fully lifted by the pointer (the parent drives it from the grid's pointer position). */
    lift?: number;
    /** The tile that is chosen: its silhouette uses the bright stroke (the only highlight). */
    active?: boolean;
    className?: string;
}

// ── drawing contract shared by the family and motif builders ───────────────────────────────────────────────────────

/** One SVG path of a figure. Parts are listed BACK TO FRONT and painted in that order (opaque plates hide what is behind). */
export interface FigurePart {
    /** SVG path data (use pathOf / prism / rectY / rectX / discY from welcome/hairline/engine.ts). */
    d: string;
    /** plate: solid with the bright silhouette stroke; face: plate with a dim stroke; crease: unfilled dim line; slot: recessed dark fill; mark: small filled accent mark; bright: the one bright mark. */
    kind: 'plate' | 'face' | 'crease' | 'slot' | 'mark' | 'bright';
}

export const FIGURE_VB = { w: 400, h: 320 } as const;

/** The longest side of a normalised figure, in world units. */
export const FIGURE_SIZE = 30;

/**
 * Scale the cm dimensions so the longest side is FIGURE_SIZE world units and no side is thinner than 3 units
 * (a 10 cm slab next to a 196 cm panel must stay visible). Missing dimensions come from `fallback`.
 */
export function normalizeDims(dims: Dims | null | undefined, fallback: Dims): Dims {
    const raw: Dims = {
        w: dims && dims.w > 0 ? dims.w : fallback.w,
        h: dims && dims.h > 0 ? dims.h : fallback.h,
        d: dims && dims.d > 0 ? dims.d : fallback.d,
    };
    const k = FIGURE_SIZE / Math.max(raw.w, raw.h, raw.d);
    const clamp = (v: number) => Math.max(3, v * k);
    return { w: clamp(raw.w), h: clamp(raw.h), d: clamp(raw.d) };
}

/**
 * A camera that centres a w x d x h box (x in [0,w], y in [0,d], z in [0,h]) in the 400 x 320 view, at the largest
 * scale that keeps it inside a 300 x 230 area. Builders draw in WORLD units with this camera; the caller never scales.
 */
export function centeredCam(box: Dims): Cam {
    const probe: Cam = { S: 1, cx: 0, cy: 0 };
    const pts: Array<[number, number]> = [];
    for (const x of [0, box.w]) for (const y of [0, box.d]) for (const z of [0, box.h]) pts.push(proj(probe, x, y, z));
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const S = Math.min(300 / bw, 230 / bh);
    return { S, cx: 200 - S * (Math.max(...xs) + Math.min(...xs)) / 2, cy: 168 - S * (Math.max(...ys) + Math.min(...ys)) / 2 };
}
