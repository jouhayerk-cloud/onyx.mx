/**
 * Pure logic of the Add Entry Type library (hairline selector).
 *
 * The selector keys on TYPE only: one tile = one canonical Type (canonicalType.ts). The library is the canonical Types
 * found in the inventory plus the extra Types saved by hand (table type_library), without the hidden values (person
 * names: never suggested, still kept in the data). Shape is a free sub group or description, never a key.
 * Everything here is deterministic: no React, no I/O, no clock.
 */
import { canonicalType, typeKey, type CanonicalResult, type CanonicalTypeId } from './canonicalType';
import { classifyGeometry, type Geometry } from './geometry';
import type { Dims } from '../features/entry/hairline/types';

/** An inventory row as the library reads it. Type is short_description, then shortDescription. */
export interface TypeRow {
    shape?: string;
    shortDescription?: string;
    short_description?: string;
    widthCm?: number | string | null;
    width_cm?: number | string | null;
    heightCm?: number | string | null;
    height_cm?: number | string | null;
    lengthCm?: number | string | null;
    length_cm?: number | string | null;
    depthCm?: number | string | null;
    depth_cm?: number | string | null;
    is_hidden?: boolean;
}

/** A Type saved by hand (row of the type_library table), with the spellings folded onto it. */
export interface SavedType {
    type: string;
    aliases?: string[];
}

/** One tile of the selector. */
export interface TypeEntry {
    /** The canonical id, null for a Type that is not in the canonical table. */
    id: CanonicalTypeId | null;
    /** typeKey of the Type: the canonical id, else the normalised text. Unique. */
    key: string;
    /** Canonical label (Title Case). */
    label: string;
    /** Inventory rows that use this Type (0 for a saved-only Type). */
    count: number;
    family: Geometry;
    /** True for any mirror, including one classified as box. */
    isMirror: boolean;
    /** Median W, H, D in cm; a dimension no row gives is 0. Null when no row gives any dimension. */
    dims: Dims | null;
    /** The most used Shape spellings of the group, case-merged, top 8 by count; for a wine rack "N holes". */
    shapes: { label: string; count: number }[];
    /** The distinct hole counts of a wine rack, ascending. Empty for any other Type. */
    holes: number[];
    /** True when the Type was saved by hand. */
    saved: boolean;
}

interface ShapeTally { count: number; spellings: Map<string, number> }

interface Group {
    label: string;
    id: CanonicalTypeId | null;
    count: number;
    saved: boolean;
    /** Raw Shape of the first row of the group that has one. */
    firstShape: string;
    shapes: Map<string, ShapeTally>;
    holes: Set<number>;
    widths: number[];
    heights: number[];
    depths: number[];
}

const NO_HIDDEN: ReadonlySet<string> = new Set<string>();

/** Trim, collapse spaces, lower case: the form a hidden value is compared in. */
const squash = (raw: unknown): string => String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** squash with accents folded: the form the search compares in. */
const fold = (raw: unknown): string => squash(String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

/** A positive number from a number or a numeric string (a comma is a decimal point), else null. */
const positive = (v: number | string | null | undefined): number | null => {
    const n = typeof v === 'number'
        ? v
        : typeof v === 'string' ? Number.parseFloat(v.trim().replace(',', '.')) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

const firstPositive = (...vals: Array<number | string | null | undefined>): number | null => {
    for (const v of vals) {
        const n = positive(v);
        if (n !== null) return n;
    }
    return null;
};

const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const newGroup = (read: CanonicalResult): Group => ({
    label: read.label,
    id: read.id,
    count: 0,
    saved: false,
    firstShape: '',
    shapes: new Map<string, ShapeTally>(),
    holes: new Set<number>(),
    widths: [],
    heights: [],
    depths: [],
});

const tally = (shapes: Map<string, ShapeTally>, spelled: string): void => {
    const key = squash(spelled);
    const t = shapes.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    t.count += 1;
    t.spellings.set(spelled, (t.spellings.get(spelled) ?? 0) + 1);
    shapes.set(key, t);
};

const topShapes = (shapes: Map<string, ShapeTally>): TypeEntry['shapes'] =>
    [...shapes.values()]
        .map(t => ({
            label: [...t.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
            count: t.count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 8);

const dimsOf = (g: Group): Dims | null => {
    if (g.widths.length + g.heights.length + g.depths.length === 0) return null;
    const pick = (xs: number[]): number => (xs.length > 0 ? round1(median(xs)) : 0);
    return { w: pick(g.widths), h: pick(g.heights), d: pick(g.depths) };
};

/**
 * Builds the library: one entry per Type, from the inventory rows and the saved Types.
 * Rows with is_hidden set, rows with a personal or empty Type, and Types or Shapes listed in `hidden` are left out
 * of the library (the data keeps them). A saved Type joins the library with count 0 unless the inventory already
 * uses it; its aliases count as the same Type. Sorted by count (high first), then label.
 * @example buildTypeLibrary([{ short_description: 'pendant lamps', shape: 'Round', widthCm: 40 }], [])
 *   // [{ id: 'pendant', key: 'pendant', label: 'Pendant', count: 1, family: 'cylinder', ... }]
 */
export function buildTypeLibrary(
    rows: readonly TypeRow[],
    saved: readonly SavedType[],
    hidden: ReadonlySet<string> = NO_HIDDEN,
): TypeEntry[] {
    const groups = new Map<string, Group>();

    for (const s of saved) {
        const read = canonicalType(s.type);
        if (read.personal || !read.label || hidden.has(squash(read.label))) continue;
        const key = typeKey(s.type);
        const group = groups.get(key) ?? newGroup(read);
        group.saved = true;
        groups.set(key, group);
    }

    // An alias folds onto its saved Type's key, unless that alias is a saved Type of its own.
    const savedKeys = new Set(groups.keys());
    const folded = new Map<string, string>();
    for (const s of saved) {
        const key = typeKey(s.type);
        if (!savedKeys.has(key)) continue;
        for (const alias of s.aliases ?? []) {
            const aliasKey = typeKey(alias);
            if (aliasKey && aliasKey !== key && !savedKeys.has(aliasKey)) folded.set(aliasKey, key);
        }
    }

    for (const row of rows) {
        if (row.is_hidden === true) continue;
        const typeRaw = row.short_description ?? row.shortDescription ?? '';
        const shape = row.shape ?? '';
        const read = canonicalType(typeRaw, shape);
        if (read.personal || !read.label || hidden.has(squash(read.label))) continue;

        const own = typeKey(typeRaw, shape);
        const key = folded.get(own) ?? own;
        const group = groups.get(key) ?? newGroup(read);
        groups.set(key, group);

        group.count += 1;
        if (!group.firstShape && squash(shape)) group.firstShape = String(shape).trim();

        const holes = read.id === 'wine-rack' ? read.holes : undefined;
        if (holes !== undefined) group.holes.add(holes);
        const spelled = read.id === 'wine-rack'
            ? (holes === undefined ? '' : `${holes} holes`)
            : String(shape).trim().replace(/\s+/g, ' ');
        if (spelled && !hidden.has(squash(spelled))) tally(group.shapes, spelled);

        const w = firstPositive(row.widthCm, row.width_cm);
        const h = firstPositive(row.heightCm, row.height_cm);
        const d = firstPositive(row.length_cm, row.lengthCm, row.depth_cm, row.depthCm);
        if (w !== null) group.widths.push(w);
        if (h !== null) group.heights.push(h);
        if (d !== null) group.depths.push(d);
    }

    const entries: TypeEntry[] = [];
    for (const [key, g] of groups) {
        const geo = classifyGeometry(g.firstShape, g.label);
        entries.push({
            id: g.id,
            key,
            label: g.label,
            count: g.count,
            family: geo.geom,
            isMirror: geo.isMirror,
            dims: dimsOf(g),
            shapes: topShapes(g.shapes),
            holes: [...g.holes].sort((a, b) => a - b),
            saved: g.saved,
        });
    }

    return entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The suggestions for what is typed: the entries whose label contains the typed text (case and accents ignored),
 * prefix matches first, then count (high first), then label. With empty text, the first `limit` entries.
 * @example suggestTypes(lib, 'lamp') // 'Table Lamp' and 'Floor Lamp' entries, prefix matches first
 */
export function suggestTypes(lib: readonly TypeEntry[], typed: string, limit = 8): TypeEntry[] {
    const q = fold(typed);
    if (!q) return lib.slice(0, limit);
    const rank = (e: TypeEntry): number => (fold(e.label).startsWith(q) ? 0 : 1);
    return lib
        .filter(e => fold(e.label).includes(q))
        .sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, limit);
}
