/**
 * Pure logic of the Add Entry shape + type library (hairline selector).
 *
 * One tile = one normalised (shape, type) pair. The library is the pairs found in the inventory plus the pairs saved
 * by hand (table shape_type_library). Everything here is deterministic: no React, no I/O, no clock.
 * Contracts: src/features/entry/hairline/types.ts. The figure family comes only from classifyGeometry (geometry.ts).
 */
import type { Dims, LibraryEntry, Motif, SavedPair } from '../features/entry/hairline/types';
import { classifyGeometry } from './geometry';
import { canonical } from './smartFilters';
import { vendors } from './consts';

/** A cell of an inventory row as read from Supabase or RxDB. */
type Cell = string | number | boolean | null | undefined;

/** The inventory columns the library reads. Type is shortDescription, then short_description, then type. Never generated_type. */
export interface LibraryRow {
    shape?: Cell;
    shortDescription?: Cell;
    short_description?: Cell;
    type?: Cell;
    widthCm?: Cell;
    width_cm?: Cell;
    heightCm?: Cell;
    height_cm?: Cell;
    lengthCm?: Cell;
    length_cm?: Cell;
    depthCm?: Cell;
    depth_cm?: Cell;
    is_hidden?: Cell;
}

/** Vendor names that are businesses or materials, not people. Their words are shape or type words, so they are not personal. */
const NON_PERSON_VENDORS: ReadonlySet<string> = new Set(['ONYX', 'FOUNTAIN ROCK', 'GIFT STORE', 'CANTERA PUEBLA', 'TELLEZ TALLER']);

/** Extra names kept out of the selector (add a name here when one turns up in a shape or a type). */
const EXTRA_PERSONAL_NAMES: readonly string[] = [];

/** Trim, collapse spaces, lower case. */
const squash = (raw: unknown): string => String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Trimmed, single-spaced text of a cell ('' for null, undefined). Case is kept. */
const text = (v: Cell): string => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

/** First non-blank text of several cells. */
const firstText = (...vals: Cell[]): string => {
    for (const v of vals) {
        const s = text(v);
        if (s) return s;
    }
    return '';
};

/** A positive number from a number or a numeric string (a comma is a decimal point), else null. */
const positive = (v: Cell): number | null => {
    const n = typeof v === 'number'
        ? v
        : typeof v === 'string' ? Number.parseFloat(v.trim().replace(',', '.')) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

const firstPositive = (...vals: Cell[]): number | null => {
    for (const v of vals) {
        const n = positive(v);
        if (n !== null) return n;
    }
    return null;
};

const isHiddenFlag = (v: Cell): boolean => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');

const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Word-start regex for a phrase, plural allowed on its last word: phrase('table lamp') matches "Table Lamps". */
const phrase = (words: string): RegExp => new RegExp(`\\b${words.replace(/ /g, '\\s+')}s?\\b`);

const PENDANT = phrase('pendant');
const TABLE_LAMP = phrase('table lamp');
const TOWER_LAMP = phrase('tower lamp');
const FLOOR_LAMP = phrase('floor lamp');
const WALL_PANEL = /\b(wall\s+panels?|panel\s+pairs?|luminar(y|ies))\b/;
const WINE_RACK = phrase('wine rack');
const HOLES = /^(\d+)\s+holes?$/;
const TABLE = phrase('table');
const CANOE = phrase('canoe');
const FOUNTAIN = phrase('fountain');

/** Personal names: the client prefix is tested per word below; these are whole-field matches. */
const PERSONAL_PREFIX = /^client\b/;

const PERSONAL_NAMES: ReadonlySet<string> = (() => {
    const names = new Set<string>(EXTRA_PERSONAL_NAMES.map(squash));
    for (const vendor of Object.values(vendors)) {
        if (NON_PERSON_VENDORS.has(vendor.name)) continue;
        names.add(squash(vendor.name));
        names.add(squash(vendor.name.split(' ')[0]));
    }
    return names;
})();

/**
 * The key of a pair: lower case, trimmed, collapsed spaces, joined with "|". Unique per tile.
 * @example normKey('  Squared ', 'Tower  Lamp') // 'squared|tower lamp'
 */
export function normKey(shape: string, type: string): string {
    return `${squash(shape)}|${squash(type)}`;
}

/**
 * The display spelling of a pair: canonical() (Title Case) of each field.
 * @example canonicalPair('SQUARED', 'tower lamp') // { shape: 'Squared', type: 'Tower Lamp' }
 */
export function canonicalPair(shape: string, type: string): { shape: string; type: string } {
    return { shape: canonical(shape), type: canonical(type) };
}

/**
 * True when a pair holds a person's name, so the selector hides it (the data keeps it).
 * A field starting with the word "client" ("Client <name>") is personal. So is a field equal to a vendor's full name
 * or first name. Plain words such as Large or Basin are never personal.
 * @example isPersonalEntry('Basin', 'Client Ana') // true
 * @example isPersonalEntry('Basin', 'Large Bowl') // false
 */
export function isPersonalEntry(shape: string, type: string): boolean {
    const s = squash(shape);
    const t = squash(type);
    if (PERSONAL_PREFIX.test(s) || PERSONAL_PREFIX.test(t)) return true;
    return PERSONAL_NAMES.has(s) || PERSONAL_NAMES.has(t);
}

/**
 * The drawing motif of a pair, read from its Type words (case-insensitive). `holes` is set only for a wine rack
 * whose Type reads "N Holes".
 * @example motifFor('Rustic Wine Rack', '8 Holes') // { motif: 'wine-rack', holes: 8 }
 * @example motifFor('Squared', 'Tower Lamp') // { motif: 'tower-lamp' }
 * @example motifFor('Round', 'Mirror') // { motif: null }
 */
export function motifFor(shape: string, type: string): { motif: Motif | null; holes?: number } {
    const t = squash(type);
    if (PENDANT.test(t)) return { motif: 'pendant' };
    if (TABLE_LAMP.test(t)) return { motif: 'table-lamp' };
    if (TOWER_LAMP.test(t)) return { motif: 'tower-lamp' };
    if (FLOOR_LAMP.test(t)) return { motif: 'floor-lamp' };
    if (WALL_PANEL.test(t)) return { motif: 'wall-panel' };
    const holes = HOLES.exec(t);
    if (holes) return { motif: 'wine-rack', holes: Number(holes[1]) };
    if (WINE_RACK.test(squash(shape)) || WINE_RACK.test(t)) return { motif: 'wine-rack' };
    if (TABLE.test(t)) return { motif: 'table' };
    if (CANOE.test(t)) return { motif: 'canoe' };
    if (FOUNTAIN.test(t)) return { motif: 'fountain' };
    return { motif: null };
}

interface Group {
    /** Inventory rows that use the pair (0 for a saved-only pair). */
    count: number;
    /** Canonical pair, used when no row spells it. */
    fallback: { shape: string; type: string };
    /** Raw spellings with their use count; the most used one gives the display spelling. */
    spellings: Map<string, { shape: string; type: string; uses: number }>;
    items: boolean;
    saved: boolean;
    /** [w, h, d] of each row that has all three dimensions positive. */
    dims: Array<[number, number, number]>;
}

const medianDims = (dims: Array<[number, number, number]>): Dims | null => {
    if (dims.length === 0) return null;
    return {
        w: median(dims.map(x => x[0])),
        h: median(dims.map(x => x[1])),
        d: median(dims.map(x => x[2])),
    };
};

/**
 * Builds the library: one entry per normalised pair, from the inventory rows and the saved pairs.
 * Rows with is_hidden set, and rows with an empty shape or type, are ignored. Dimensions are the median of the rows
 * that have W, H and D all positive. Entries are sorted: visible first, then count (high first), then shape and type.
 * @example buildLibrary([{ shape: 'Squared', shortDescription: 'Tower Lamp', widthCm: 30, heightCm: 125, lengthCm: 30 }], [])
 *   // [{ key: 'squared|tower lamp', shape: 'Squared', type: 'Tower Lamp', count: 1, source: 'items', family: 'box',
 *   //    isMirror: false, motif: 'tower-lamp', dims: { w: 30, h: 125, d: 30 }, hidden: false }]
 */
export function buildLibrary(rows: readonly LibraryRow[], saved: readonly SavedPair[]): LibraryEntry[] {
    const groups = new Map<string, Group>();
    const groupOf = (key: string, fallback: { shape: string; type: string }): Group => {
        let g = groups.get(key);
        if (!g) {
            g = { count: 0, fallback, spellings: new Map(), items: false, saved: false, dims: [] };
            groups.set(key, g);
        }
        return g;
    };

    for (const row of rows) {
        if (isHiddenFlag(row.is_hidden)) continue;
        const shape = text(row.shape);
        const type = firstText(row.shortDescription, row.short_description, row.type);
        if (!canonical(shape) || !canonical(type)) continue;

        const g = groupOf(normKey(shape, type), canonicalPair(shape, type));
        g.count += 1;
        g.items = true;
        const spelling = `${shape}\u0000${type}`;
        const seen = g.spellings.get(spelling) ?? { shape, type, uses: 0 };
        seen.uses += 1;
        g.spellings.set(spelling, seen);

        const w = firstPositive(row.widthCm, row.width_cm);
        const h = firstPositive(row.heightCm, row.height_cm);
        const d = firstPositive(row.lengthCm, row.length_cm, row.depthCm, row.depth_cm);
        if (w !== null && h !== null && d !== null) g.dims.push([w, h, d]);
    }

    for (const pair of saved) {
        const shape = text(pair.shape);
        const type = text(pair.type);
        if (!canonical(shape) || !canonical(type)) continue;
        groupOf(normKey(shape, type), canonicalPair(shape, type)).saved = true;
    }

    const entries: LibraryEntry[] = [];
    for (const [key, g] of groups) {
        const best = [...g.spellings.values()]
            .sort((a, b) => b.uses - a.uses || a.shape.localeCompare(b.shape) || a.type.localeCompare(b.type))[0];
        const shown = best ? canonicalPair(best.shape, best.type) : g.fallback;
        const { geom, isMirror } = classifyGeometry(shown.shape, shown.type);
        const m = motifFor(shown.shape, shown.type);
        const source: LibraryEntry['source'] = g.items && g.saved ? 'both' : g.items ? 'items' : 'saved';
        entries.push({
            key,
            shape: shown.shape,
            type: shown.type,
            count: g.count,
            source,
            family: geom,
            isMirror,
            motif: m.motif,
            ...(m.holes === undefined ? {} : { holes: m.holes }),
            dims: medianDims(g.dims),
            hidden: isPersonalEntry(shown.shape, shown.type),
        });
    }

    return entries.sort((a, b) =>
        Number(a.hidden) - Number(b.hidden)
        || b.count - a.count
        || a.shape.localeCompare(b.shape)
        || a.type.localeCompare(b.type));
}

/**
 * The entries the selector shows: hidden (personal) entries removed.
 * @example visibleLibrary(lib) // lib without the 'Basin|Client <name>' tile
 */
export function visibleLibrary(lib: readonly LibraryEntry[]): LibraryEntry[] {
    return lib.filter(e => !e.hidden);
}

/** Folds a trailing "s" on each word longer than three letters: "Table Lamps" and "Table Lamp" fold alike. */
const foldWord = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const foldKey = (shape: string, type: string): string => {
    const fold = (s: string) => squash(s).split(' ').map(foldWord).join(' ');
    return `${fold(shape)}|${fold(type)}`;
};

/**
 * The entry for a typed pair: the exact key first, then the same key after folding plurals. Searches all of `lib`,
 * hidden entries included. Null when shape or type is empty.
 * @example matchEntry(lib, 'Table Lamps', 'Table Lamp') // the 'Table Lamp' entry, if the library has it
 */
export function matchEntry(lib: readonly LibraryEntry[], shape: string, type: string): LibraryEntry | null {
    if (!squash(shape) || !squash(type)) return null;
    const exact = normKey(shape, type);
    const hit = lib.find(e => e.key === exact);
    if (hit) return hit;
    const folded = foldKey(shape, type);
    return lib.find(e => foldKey(e.shape, e.type) === folded) ?? null;
}

/** Levenshtein distance. */
const editDistance = (a: string, b: string): number => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        const cur = [i];
        for (let j = 1; j <= b.length; j += 1) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
};

/** 2 when the field starts with the typed text, 1 when a word does, 0 otherwise. An empty query scores 0. */
const strength = (field: string, query: string): number => {
    if (!query) return 0;
    const f = squash(field);
    if (f.startsWith(query)) return 2;
    return ` ${f}`.includes(` ${query}`) ? 1 : 0;
};

const byCountThenName = (a: LibraryEntry, b: LibraryEntry): number =>
    b.count - a.count || a.shape.localeCompare(b.shape) || a.type.localeCompare(b.type);

/**
 * Up to `limit` visible suggestions for what is typed, never the matched entry itself. First the pairs whose shape
 * and/or type contain the typed text as a prefix or a word (each typed field must match; an empty field is free),
 * best matches first. Then "did you mean" pairs: same family as the typed pair, one edit away in the shape or the
 * type, with the other field equal or empty.
 * @example suggestFor(lib, 'Squred', 'Tower Lamp') // includes the 'Squared|Tower Lamp' entry
 * @example suggestFor(lib, 'Round', '') // every pair whose shape is or contains a word starting with 'round'
 */
export function suggestFor(lib: readonly LibraryEntry[], shape: string, type: string, limit = 6): LibraryEntry[] {
    const s = squash(shape);
    const t = squash(type);
    const exact = matchEntry(lib, shape, type);
    const pool = visibleLibrary(lib).filter(e => !exact || e.key !== exact.key);

    const scored = pool.flatMap(e => {
        const a = strength(e.shape, s);
        const b = strength(e.type, t);
        if ((s && !a) || (t && !b)) return [];
        return [{ e, score: a + b }];
    });
    scored.sort((x, y) => y.score - x.score || byCountThenName(x.e, y.e));
    const hits = scored.map(x => x.e);

    const picked = new Set(hits.map(e => e.key));
    const family = classifyGeometry(shape, type).geom;
    const near = (e: LibraryEntry): boolean => {
        if (e.family !== family) return false;
        const shapeOff = s !== '' && editDistance(squash(e.shape), s) === 1 && (!t || squash(e.type) === t);
        const typeOff = t !== '' && editDistance(squash(e.type), t) === 1 && (!s || squash(e.shape) === s);
        return shapeOff || typeOff;
    };
    const fuzzy = (s || t)
        ? pool.filter(e => !picked.has(e.key) && near(e)).sort(byCountThenName)
        : [];

    return [...hits, ...fuzzy].slice(0, limit);
}
