// TEMPORARY stub until the taxonomy agent's version lands: keeps the first occurrence of each value, case-insensitively, and drops empty values.
export type SuggestField = 'shape' | 'type' | 'material' | 'color';

export function cleanSuggestions(_field: SuggestField, values: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const t = String(v ?? '').trim();
        const k = t.toLowerCase();
        if (!t || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
    }
    return out;
}
