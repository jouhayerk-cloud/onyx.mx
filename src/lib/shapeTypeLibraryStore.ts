import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as typedSupabase } from './supabase';
import { buildLibrary, type LibraryRow } from './shapeTypeLibrary';
import type { LibraryEntry, PickerValue, SavedPair } from '../features/entry/hairline/types';

// shape_type_library comes from a draft migration and is not in the generated types yet
const supabase = typedSupabase as unknown as { from: (table: string) => any };

export type SaveSavedPairResult = { ok: true } | { ok: false; reason: 'missing_table' | 'forbidden' | 'duplicate' | 'error' };

let loggedMissingTable = false;
// Once the table is known to be missing (migration not applied yet) stop asking the server for a while:
// every call would be a 404 in the console and a wasted request. Same rule as documentJobs.ts.
let libraryMissingUntil = 0;
const LIBRARY_RETRY_MS = 5 * 60 * 1000;
function libraryDown(): boolean { return Date.now() < libraryMissingUntil; }

function isMissingTable(err: any): boolean {
    const code = err?.code || err?.details?.code || '';
    const message = err?.message || '';
    if (code === '42P01' || code === 'PGRST205' || message.includes('404') || message.includes('does not exist') || message.includes('schema cache')) {
        libraryMissingUntil = Date.now() + LIBRARY_RETRY_MS;
        if (!loggedMissingTable) {
            console.warn('shape_type_library table does not exist yet. Failing softly.');
            loggedMissingTable = true;
        }
        return true;
    }
    return false;
}

/** Every saved pair, oldest first. Returns [] when the table is missing or unreadable; never throws. */
export async function fetchSavedPairs(): Promise<SavedPair[]> {
    if (libraryDown()) return [];
    try {
        const { data, error } = await supabase
            .from('shape_type_library')
            .select('shape, type, id, created_at')
            .order('created_at', { ascending: true });
        if (error) {
            if (isMissingTable(error)) return [];
            console.error('fetchSavedPairs: error querying shape_type_library:', error);
            return [];
        }
        return (data ?? []).map((row: any) => ({ id: row.id, shape: row.shape, type: row.type, created_at: row.created_at }));
    } catch (err: any) {
        if (isMissingTable(err)) return [];
        console.error('fetchSavedPairs failed', err);
        return [];
    }
}

/** Saves one pair. The table normalises the spelling. A duplicate is reported as its own reason; the caller treats it as saved. Never throws. */
export async function saveSavedPair(pair: { shape: string; type: string }): Promise<SaveSavedPairResult> {
    const shape = pair.shape.trim();
    const type = pair.type.trim();
    if (!shape || !type) return { ok: false, reason: 'error' };
    if (libraryDown()) return { ok: false, reason: 'missing_table' };
    try {
        const { error } = await supabase.from('shape_type_library').insert({ shape, type });
        if (!error) return { ok: true };
        if (isMissingTable(error)) return { ok: false, reason: 'missing_table' };
        const code = (error as any).code ?? '';
        if (code === '23505') return { ok: false, reason: 'duplicate' };
        if (code === '42501' || String(error.message ?? '').includes('row-level security')) return { ok: false, reason: 'forbidden' };
        console.error('saveSavedPair: error inserting row:', error);
        return { ok: false, reason: 'error' };
    } catch (err: any) {
        if (isMissingTable(err)) return { ok: false, reason: 'missing_table' };
        console.error('saveSavedPair failed', err);
        return { ok: false, reason: 'error' };
    }
}

function pairKey(pair: { shape: string; type: string }): string {
    return `${pair.shape.trim().toLowerCase().replace(/\s+/g, ' ')}|${pair.type.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/** The selector's library: inventory rows merged with the saved pairs. Fetches the saved pairs once on mount. */
export function useShapeTypeLibrary(rows: readonly LibraryRow[]): {
    library: LibraryEntry[];
    loading: boolean;
    saved: SavedPair[];
    save: (pair: PickerValue) => Promise<boolean>;
    reload: () => void;
} {
    const [saved, setSaved] = useState<SavedPair[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchSavedPairs().then(list => {
            if (cancelled) return;
            setSaved(list);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [reloadToken]);

    const library = useMemo(() => buildLibrary(rows, saved), [rows, saved]);

    const reload = useCallback(() => setReloadToken(t => t + 1), []);

    const save = useCallback(async (pair: PickerValue): Promise<boolean> => {
        const result = await saveSavedPair(pair);
        if (result.ok === false && result.reason !== 'duplicate') return false;
        setSaved(prev => {
            const key = pairKey(pair);
            if (prev.some(p => pairKey(p) === key)) return prev;
            return [...prev, { shape: pair.shape.trim(), type: pair.type.trim() }];
        });
        return true;
    }, []);

    return { library, loading, saved, save, reload };
}
