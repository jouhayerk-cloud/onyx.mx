/**
 * Attribute suggestions derived from existing inventory.
 *
 * Each field is suggested from the values that actually co-occur with what the user
 * has already chosen, so the options narrow as the entry takes shape: pick
 * shape "squared" and Type offers only the types recorded against squared items;
 * pick type "table lamp" and Shape narrows to the shapes table lamps come in.
 *
 * Suggestions never dead-end — if a combination has no precedent (a genuinely new
 * pairing), that field falls back to every known value rather than offering nothing.
 */

/**
 * Form field name → inventory columns it is suggested from, in priority order.
 * Several fields are stored under more than one name across the seasons, so the
 * first column with a value wins (matching how the rows were written).
 */
export const SUGGESTION_COLUMNS: Record<string, string[]> = {
    shape: ['shape'],
    material: ['material'],
    color: ['color'],
    type: ['short_description', 'shortDescription', 'item_type', 'generated_type', 'type']
};

export type SuggestionSelection = Partial<Record<string, string>>;

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** First non-empty value across the candidate columns. */
const pick = (row: any, columns: string[]): string => {
    for (const column of columns) {
        const value = row?.[column];
        if (value !== null && value !== undefined && String(value).trim()) return String(value);
    }
    return '';
};

/**
 * Distinct values of `column`, ordered by how often they occur so the common
 * answers surface first. Ties fall back to alphabetical for a stable list.
 */
const distinctByFrequency = (rows: any[], columns: string[]): string[] => {
    // Keyed by normalised value so "Squared" and "squared" count once; we keep the
    // most frequent original spelling to display.
    const seen = new Map<string, { count: number; spellings: Map<string, number> }>();

    for (const row of rows) {
        const raw = pick(row, columns);
        const key = norm(raw);
        if (!key) continue;

        const entry = seen.get(key) ?? { count: 0, spellings: new Map<string, number>() };
        entry.count += 1;
        const spelling = String(raw).trim();
        entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
        seen.set(key, entry);
    }

    return Array.from(seen.values())
        .map(entry => {
            const best = Array.from(entry.spellings.entries())
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
            return { label: best, count: entry.count };
        })
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map(v => v.label);
};

/**
 * Builds the suggestion lists for every field in `SUGGESTION_COLUMNS`.
 *
 * @param rows      Inventory rows to learn from.
 * @param selection Current form values, keyed by form field name. Empty values are ignored.
 * @param fields    Restrict the result to these field names. Defaults to all.
 */
export const buildAttributeSuggestions = (
    rows: any[],
    selection: SuggestionSelection = {},
    fields: string[] = Object.keys(SUGGESTION_COLUMNS)
): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (!Array.isArray(rows) || rows.length === 0) return result;

    for (const field of fields) {
        const columns = SUGGESTION_COLUMNS[field];
        if (!columns) continue;

        // Every other field the user has already filled constrains this one.
        const constraints = Object.entries(selection)
            .filter(([key, value]) => key !== field && norm(value) && SUGGESTION_COLUMNS[key])
            .map(([key, value]) => ({ columns: SUGGESTION_COLUMNS[key], value: norm(value) }));

        const matching = constraints.length === 0
            ? rows
            : rows.filter(row => constraints.every(c => norm(pick(row, c.columns)) === c.value));

        const narrowed = distinctByFrequency(matching, columns);

        // A combination with no precedent must not leave the field with no options.
        result[field] = narrowed.length > 0 ? narrowed : distinctByFrequency(rows, columns);
    }

    return result;
};
