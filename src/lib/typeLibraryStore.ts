import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as typedSupabase } from './supabase';
import { buildTypeLibrary, type SavedType, type TypeEntry, type TypeRow } from './typeLibrary';

// type_library and attribute_hidden_values come from a draft migration and are not in the generated types yet
const supabase = typedSupabase as unknown as { from: (table: string) => any };

let loggedMissingTable = false;
// Once the tables are known to be missing (migration not applied yet) stop asking the server for a while:
// every call would be a 404 in the console and a wasted request. Same rule as shapeTypeLibraryStore.ts.
let libraryMissingUntil = 0;
const LIBRARY_RETRY_MS = 5 * 60 * 1000;
function libraryDown(): boolean { return Date.now() < libraryMissingUntil; }

function isMissingTable(err: any): boolean {
    const code = err?.code || err?.details?.code || '';
    const message = err?.message || '';
    if (code === '42P01' || code === 'PGRST205' || message.includes('404') || message.includes('does not exist') || message.includes('schema cache')) {
        libraryMissingUntil = Date.now() + LIBRARY_RETRY_MS;
        if (!loggedMissingTable) {
            console.warn('type_library tables do not exist yet. Failing softly.');
            loggedMissingTable = true;
        }
        return true;
    }
    return false;
}

/** Trim, collapse spaces, lower case: the form a hidden value is compared in. */
const normaliseValue = (raw: unknown): string => String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Every saved Type, oldest first. Returns [] when the table is missing or unreadable; never throws. */
export async function fetchSavedTypes(): Promise<SavedType[]> {
    if (libraryDown()) return [];
    try {
        const { data, error } = await supabase
            .from('type_library')
            .select('type, aliases')
            .order('created_at', { ascending: true });
        if (error) {
            if (isMissingTable(error)) return [];
            console.error('fetchSavedTypes: error querying type_library:', error);
            return [];
        }
        return (data ?? []).map((row: any) => ({
            type: String(row.type ?? ''),
            aliases: Array.isArray(row.aliases) ? row.aliases.map((a: unknown) => String(a)) : [],
        }));
    } catch (err: any) {
        if (isMissingTable(err)) return [];
        console.error('fetchSavedTypes failed', err);
        return [];
    }
}

/** The hidden values, lower case and collapsed. Empty when the table is missing or unreadable; never throws. */
export async function fetchHiddenValues(): Promise<Set<string>> {
    if (libraryDown()) return new Set();
    try {
        const { data, error } = await supabase.from('attribute_hidden_values').select('value');
        if (error) {
            if (isMissingTable(error)) return new Set();
            console.error('fetchHiddenValues: error querying attribute_hidden_values:', error);
            return new Set();
        }
        return new Set((data ?? []).map((row: any) => normaliseValue(row.value)).filter((v: string) => v !== ''));
    } catch (err: any) {
        if (isMissingTable(err)) return new Set();
        console.error('fetchHiddenValues failed', err);
        return new Set();
    }
}

/** Saves one Type. The table normalises the spelling; a Type already saved is not an error. Never throws. */
export async function saveType(type: string): Promise<void> {
    const clean = type.trim().replace(/\s+/g, ' ');
    if (!clean || libraryDown()) return;
    try {
        const { error } = await supabase.from('type_library').insert({ type: clean });
        if (!error || error.code === '23505') return;
        if (isMissingTable(error)) return;
        console.error('saveType: error inserting row:', error);
    } catch (err: any) {
        if (isMissingTable(err)) return;
        console.error('saveType failed', err);
    }
}

/** Hides one value from the suggestions; the data keeps it. Developer and Admin only (RLS). Never throws. */
export async function hideValue(value: string): Promise<void> {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (!clean || libraryDown()) return;
    try {
        const { error } = await supabase.from('attribute_hidden_values').insert({ value: clean });
        if (!error || error.code === '23505') return;
        if (isMissingTable(error)) return;
        console.error('hideValue: error inserting row:', error);
    } catch (err: any) {
        if (isMissingTable(err)) return;
        console.error('hideValue failed', err);
    }
}

/** The selector's Type library: inventory rows merged with the saved Types and the hidden values. Fetches them once on mount. */
export function useTypeLibrary(rows: readonly TypeRow[]): {
    library: TypeEntry[];
    loading: boolean;
    saved: SavedType[];
    hidden: ReadonlySet<string>;
    save: (type: string) => Promise<void>;
    reload: () => void;
} {
    const [saved, setSaved] = useState<SavedType[]>([]);
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set<string>());
    const [loading, setLoading] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([fetchSavedTypes(), fetchHiddenValues()]).then(([types, hiddenValues]) => {
            if (cancelled) return;
            setSaved(types);
            setHidden(hiddenValues);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [reloadToken]);

    const library = useMemo(() => buildTypeLibrary(rows, saved, hidden), [rows, saved, hidden]);

    const reload = useCallback(() => setReloadToken(t => t + 1), []);

    // Reads the list back after the write, so the picker shows what the server holds, not what was typed.
    const save = useCallback(async (type: string): Promise<void> => {
        await saveType(type);
        reload();
    }, [reload]);

    return { library, loading, saved, hidden, save, reload };
}
