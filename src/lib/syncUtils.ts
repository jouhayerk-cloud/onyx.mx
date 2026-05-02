/**
 * syncUtils.ts
 * Drop-in replacement for direct supabase writes.
 * Always writes to local RxDB first, then either writes to Supabase
 * immediately (online) or enqueues for later (offline / forced offline mode).
 */
import { supabase } from './supabase';
import { enqueueChange, ChangeOperation } from './changeQueue';
import { getDatabase } from './database';
import { createClient } from '@supabase/supabase-js';

// Separate restricted client for offline mode writes (uses VITE_SUPABASE_OFFLINE_KEY if set)
const offlineKey = import.meta.env.VITE_SUPABASE_OFFLINE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const offlineClient = offlineKey && supabaseUrl
    ? createClient(supabaseUrl.includes('://') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`, offlineKey)
    : supabase;

function isOnline(): boolean {
    return navigator.onLine;
}

function isOfflineMode(): boolean {
    try {
        return localStorage.getItem('offlineMode') === 'true';
    } catch {
        return false;
    }
}

/**
 * Write a record with offline fallback.
 * @param table     - Supabase table name (must match RxDB collection name)
 * @param operation - 'upsert' | 'hide'
 * @param payload   - Record data (must include `id`)
 * @param skipLocal - Skip RxDB write (for tables not in local DB)
 */
export async function syncWrite(
    table: string,
    operation: ChangeOperation,
    payload: any,
    skipLocal = false
): Promise<{ error: any | null }> {
    // 1. Always write locally first (optimistic)
    if (!skipLocal) {
        try {
            const db = await getDatabase();
            const collection = (db as any)[table];
            if (collection) {
                if (operation === 'upsert') {
                    await collection.upsert({ ...payload, id: String(payload.id) });
                } else if (operation === 'hide') {
                    // Mark hidden locally too
                    const doc = await collection.findOne({ selector: { id: String(payload.id) } }).exec();
                    if (doc) await doc.patch({ is_hidden: true, updated_at: new Date().toISOString() });
                }
            }
        } catch (localErr) {
            console.warn(`[syncWrite] Local RxDB write failed for ${table}:`, localErr);
        }
    }

    // 2. If online and not in forced offline mode → write directly to Supabase
    if (isOnline() && !isOfflineMode()) {
        const client = isOfflineMode() ? offlineClient : supabase;
        try {
            if (operation === 'upsert') {
                const { error } = await client.from(table).upsert(payload);
                if (error) {
                    enqueueChange(table, operation, payload);
                    return { error };
                }
            } else if (operation === 'hide') {
                const { error } = await client.from(table).update({
                    is_hidden: true,
                    updated_at: new Date().toISOString(),
                }).eq('id', payload.id);
                if (error) {
                    enqueueChange(table, operation, payload);
                    return { error };
                }
            }
            return { error: null };
        } catch (err) {
            enqueueChange(table, operation, payload);
            return { error: err };
        }
    }

    // 3. Offline → enqueue only
    enqueueChange(table, operation, payload);
    return { error: null };
}

export const offlineSupabase = {
    upsert: (table: string, payload: any) => syncWrite(table, 'upsert', payload),
    hide: (table: string, id: string) => syncWrite(table, 'hide', { id }),
};
