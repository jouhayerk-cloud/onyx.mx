import { useCallback, useEffect, useRef, useState } from 'react';
import { useDatabase } from './hooks';

/**
 * Persists in-progress form state to the local `drafts` collection so a half-filled
 * entry survives a reload, a crash or a tab switch.
 *
 * Drafts live outside the synced collections, so unlike a placeholder row written
 * into `inventory` they are never pruned by pullReplication and never reach Supabase.
 *
 * Usage:
 *
 *   const { restored, ready, clear } = useFormDraft('inventory-entry', formState);
 *
 *   useEffect(() => {
 *       if (ready && restored) setFormState(restored);
 *   }, [ready]);           // restore once, when the lookup settles
 *
 *   // on successful save:
 *   await clear();
 */

interface UseFormDraftOptions {
    /** Scopes the draft, so two users on one device don't overwrite each other. */
    ownerKey?: string | null;
    /** Pause saving (e.g. while the form is submitting). Defaults to true. */
    enabled?: boolean;
    /** Quiet period before a write. Keystrokes shouldn't each hit IndexedDB. */
    debounceMs?: number;
}

interface UseFormDraft<T> {
    /** Draft found on mount, or null. Read it once `ready` is true. */
    restored: T | null;
    /** False until the initial lookup finishes — no writes happen before this. */
    ready: boolean;
    /** Deletes the draft and cancels any pending write. Call after a successful save. */
    clear: () => Promise<void>;
}

export function useFormDraft<T extends object>(
    kind: string,
    value: T,
    options: UseFormDraftOptions = {}
): UseFormDraft<T> {
    const { ownerKey = null, enabled = true, debounceMs = 600 } = options;
    const db = useDatabase();

    const [restored, setRestored] = useState<T | null>(null);
    const [ready, setReady] = useState(false);

    const draftId = `${kind}:${ownerKey ?? 'local'}`;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Restore once, when the database becomes available ───────────────────────
    useEffect(() => {
        if (!db) return;
        let cancelled = false;

        (async () => {
            try {
                const doc = await db.drafts.findOne({ selector: { id: draftId } }).exec();
                if (cancelled) return;
                setRestored((doc?.toJSON()?.data as T) ?? null);
            } catch (err) {
                console.error(`[Draft] restore failed for ${draftId}:`, err);
            } finally {
                // Gates the save effect below: writing before the lookup settles would
                // overwrite the stored draft with the form's empty initial state.
                if (!cancelled) setReady(true);
            }
        })();

        return () => { cancelled = true; };
    }, [db, draftId]);

    // ── Debounced save on every change ─────────────────────────────────────────
    useEffect(() => {
        if (!db || !enabled || !ready) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const now = new Date().toISOString();
            db.drafts.upsert({
                id: draftId,
                kind,
                created_by: ownerKey ?? null,
                created_at: now,
                updated_at: now,
                data: value
            }).catch((err: any) => console.error(`[Draft] save failed for ${draftId}:`, err));
        }, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [db, enabled, ready, draftId, kind, ownerKey, debounceMs, value]);

    const clear = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!db) return;
        try {
            const doc = await db.drafts.findOne({ selector: { id: draftId } }).exec();
            await doc?.remove();
        } catch (err) {
            console.error(`[Draft] clear failed for ${draftId}:`, err);
        }
    }, [db, draftId]);

    return { restored, ready, clear };
}
