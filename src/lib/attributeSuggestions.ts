/**
 * Attribute suggestions derived from existing inventory.
 *
 * Each field is suggested from the values that actually co-occur with what the user
 * has already chosen, so the options narrow as the entry takes shape: pick
 * shape "squared" and Type offers only the types recorded against squared items;
 * pick type "table lamp" and Shape narrows to the shapes table lamps come in.
 *
 * Type is read as its canonical Type (canonicalType.ts): "pendant" and "pendant lamp"
 * are one suggestion, shown once with the canonical label. A wine rack's Shape is
 * offered as its hole count ("6 holes") rather than the raw Shape.
 *
 * Suggestions never dead-end — if a combination has no precedent (a genuinely new
 * pairing), that field falls back to every known value rather than offering nothing.
 */
import { canonicalType, typeKey } from './canonicalType';

/**
 * Form field name → inventory columns it is suggested from, in priority order.
 * Several fields are stored under more than one name across the seasons, so the
 * first column with a value wins (matching how the rows were written).
 */
export const SUGGESTION_COLUMNS: Record<string, string[]> = {
    shape: ['shape'],
    material: ['material'],
    color: ['color'],
    type: ['short_description', 'shortDescription', 'item_type', 'type']
};

export type SuggestionSelection = Partial<Record<string, string>>;

export interface AttributeSuggestionOptions {
    /** Normalised (lower-case) values that are never suggested for any field, e.g. person names. */
    hidden?: ReadonlySet<string>;
}

export interface SizeSuggestion {
    label: string;
    widthCm: number | null;
    lengthCm: number | null;
    heightCm: number | null;
    count: number;
}

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** First non-empty value across the candidate columns. */
const pick = (row: any, columns: string[]): string => {
    for (const column of columns) {
        const value = row?.[column];
        if (value !== null && value !== undefined && String(value).trim()) return String(value);
    }
    return '';
};

const rowType = (row: any): string => pick(row, SUGGESTION_COLUMNS.type);
const rowShape = (row: any): string => pick(row, SUGGESTION_COLUMNS.shape);

/** The Shape a row offers: a wine rack reads as its hole count, and no count means no Shape. */
const shapeValue = (row: any): string => {
    const shape = rowShape(row);
    const info = canonicalType(rowType(row), shape);
    if (info.id !== 'wine-rack') return shape;
    return info.holes === undefined ? '' : `${info.holes} holes`;
};

/** The value a row suggests for `field`, as shown to the user. '' when it offers nothing. */
const offered = (field: string, row: any): string => {
    if (field === 'type') return canonicalType(rowType(row), rowShape(row)).label;
    if (field === 'shape') return shapeValue(row);
    return pick(row, SUGGESTION_COLUMNS[field]);
};

/** The key a row is matched by for `field`: the Type key for Type, the normalised text otherwise. */
const keyOf = (field: string, row: any): string =>
    field === 'type' ? typeKey(rowType(row), rowShape(row)) : norm(offered(field, row));

/** The key of a value the user has chosen for `field`. */
const keyFor = (field: string, value: unknown): string =>
    field === 'type' ? typeKey(String(value ?? '')) : norm(value);

/**
 * Distinct values of `field`, ordered by how often they occur so the common
 * answers surface first. Ties fall back to alphabetical for a stable list.
 */
const distinctByFrequency = (field: string, rows: any[], hidden?: ReadonlySet<string>): string[] => {
    // Keyed by normalised value so "Squared" and "squared" count once; we keep the
    // most frequent original spelling to display.
    const seen = new Map<string, { count: number; spellings: Map<string, number> }>();

    for (const row of rows) {
        const raw = offered(field, row).trim();
        if (!raw) continue;
        const key = keyOf(field, row);

        const entry = seen.get(key) ?? { count: 0, spellings: new Map<string, number>() };
        entry.count += 1;
        entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + 1);
        seen.set(key, entry);
    }

    return Array.from(seen.values())
        .map(entry => {
            const best = Array.from(entry.spellings.entries())
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
            return { label: best, count: entry.count };
        })
        .filter(v => !hidden?.has(norm(v.label)))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map(v => v.label);
};

/**
 * Builds the suggestion lists for every field in `SUGGESTION_COLUMNS`.
 *
 * @param rows      Inventory rows to learn from.
 * @param selection Current form values, keyed by form field name. Empty values are ignored.
 * @param fields    Restrict the result to these field names. Defaults to all.
 * @param options   `hidden`: values that are never suggested.
 */
export const buildAttributeSuggestions = (
    rows: any[],
    selection: SuggestionSelection = {},
    fields: string[] = Object.keys(SUGGESTION_COLUMNS),
    options: AttributeSuggestionOptions = {}
): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (!Array.isArray(rows) || rows.length === 0) return result;

    for (const field of fields) {
        if (!SUGGESTION_COLUMNS[field]) continue;

        // Every other field the user has already filled constrains this one.
        const constraints = Object.entries(selection)
            .filter(([key, value]) => key !== field && norm(value) && SUGGESTION_COLUMNS[key])
            .map(([key, value]) => ({ field: key, key: keyFor(key, value) }));

        const matching = constraints.length === 0
            ? rows
            : rows.filter(row => constraints.every(c => keyOf(c.field, row) === c.key));

        const narrowed = distinctByFrequency(field, matching, options.hidden);

        // A combination with no precedent must not leave the field with no options.
        result[field] = narrowed.length > 0 ? narrowed : distinctByFrequency(field, rows, options.hidden);
    }

    return result;
};

/** A centimetre reading: the first positive number (a comma is a decimal point), rounded to 1 decimal. */
const centimetres = (...vals: unknown[]): number | null => {
    for (const v of vals) {
        const n = typeof v === 'number'
            ? v
            : typeof v === 'string' ? Number.parseFloat(v.trim().replace(',', '.')) : Number.NaN;
        if (Number.isFinite(n) && n > 0) return Math.round(n * 10) / 10;
    }
    return null;
};

/** Distinct (width, length, height) combinations of `rows`, most common first, ties by smaller volume. */
const sizesOf = (rows: any[]): SizeSuggestion[] => {
    const groups = new Map<string, SizeSuggestion>();

    for (const row of rows) {
        const widthCm = centimetres(row?.width_cm, row?.widthCm);
        const lengthCm = centimetres(row?.length_cm, row?.lengthCm);
        const heightCm = centimetres(row?.height_cm, row?.heightCm);
        if (widthCm === null && lengthCm === null && heightCm === null) continue;

        const key = `${widthCm}|${lengthCm}|${heightCm}`;
        const group = groups.get(key);
        if (group) {
            group.count += 1;
        } else {
            const parts = [
                widthCm === null ? null : `${widthCm}W`,
                lengthCm === null ? null : `${lengthCm}L`,
                heightCm === null ? null : `${heightCm}H`,
            ].filter((p): p is string => p !== null);
            groups.set(key, { label: parts.join(' x '), widthCm, lengthCm, heightCm, count: 1 });
        }
    }

    const volume = (s: SizeSuggestion): number => (s.widthCm ?? 0) * (s.lengthCm ?? 0) * (s.heightCm ?? 0);
    return [...groups.values()].sort((a, b) =>
        b.count - a.count || volume(a) - volume(b) || a.label.localeCompare(b.label));
};

/**
 * Known sizes for the chosen Shape and Type, from the rows that carry a dimension.
 * Narrowest match first: Shape and Type, then Type alone, then every row. The first
 * tier with any size is used. An empty selection field is not a constraint.
 *
 * @example buildSizeSuggestions(rows, { shape: 'Squared', type: 'Mirror' })
 *   // [{ label: '40W x 40L x 100H', widthCm: 40, lengthCm: 40, heightCm: 100, count: 3 }, ...]
 */
export function buildSizeSuggestions(rows: any[], selection: { shape?: string; type?: string }, limit = 8): SizeSuggestion[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const wantShape = norm(selection.shape) || null;
    const wantType = norm(selection.type) ? typeKey(selection.type) : null;

    const tiers: Array<(row: any) => boolean> = [
        row => (wantShape === null || norm(offered('shape', row)) === wantShape)
            && (wantType === null || typeKey(rowType(row), rowShape(row)) === wantType),
        row => wantType === null || typeKey(rowType(row), rowShape(row)) === wantType,
        () => true,
    ];

    for (const matches of tiers) {
        const sizes = sizesOf(rows.filter(matches));
        if (sizes.length > 0) return sizes.slice(0, limit);
    }
    return [];
}
