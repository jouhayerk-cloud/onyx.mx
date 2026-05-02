/**
 * changeQueue.ts
 * Offline write queue. All mutations made while offline (or in forced offline mode)
 * are enqueued here and replayed to Supabase when connectivity is restored.
 */
import { supabase } from './supabase';

export type ChangeOperation = 'upsert' | 'hide';

export interface ChangeRecord {
    id: string;
    table: string;
    operation: ChangeOperation;
    recordId: string;
    payload: any;
    created_at: string;
    retries: number;
}

const QUEUE_KEY = 'onyx_change_queue';
const MAX_RETRIES = 3;

/** Load queue from localStorage */
export function loadQueue(): ChangeRecord[] {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
        return [];
    }
}

/** Persist queue to localStorage */
function saveQueue(queue: ChangeRecord[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Add a pending change to the queue */
export function enqueueChange(table: string, operation: ChangeOperation, payload: any): void {
    const queue = loadQueue();
    const record: ChangeRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        table,
        operation,
        recordId: String(payload?.id ?? ''),
        payload,
        created_at: new Date().toISOString(),
        retries: 0,
    };
    // Deduplicate: if same recordId + table already queued with 'upsert', replace it
    if (operation === 'upsert') {
        const idx = queue.findIndex(r => r.table === table && r.recordId === record.recordId && r.operation === 'upsert');
        if (idx >= 0) {
            queue[idx] = record;
            saveQueue(queue);
            return;
        }
    }
    queue.push(record);
    saveQueue(queue);
    console.log(`[Queue] Enqueued ${operation} on ${table}:${record.recordId} (queue size: ${queue.length})`);
}

/** Stats for the UI badge */
export function getQueueStats(): { count: number; tables: string[] } {
    const queue = loadQueue();
    const tables = [...new Set(queue.map(r => r.table))];
    return { count: queue.length, tables };
}

/** Remove a record from queue by id */
function removeFromQueue(id: string): void {
    const queue = loadQueue().filter(r => r.id !== id);
    saveQueue(queue);
}

/** Flush all pending changes to Supabase, returns { success, failed } counts */
export async function flushQueue(
    onProgress?: (done: number, total: number, current: string) => void
): Promise<{ success: number; failed: number }> {
    const queue = loadQueue();
    if (queue.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;
    const total = queue.length;

    console.log(`[Queue] Flushing ${total} pending changes to Supabase...`);

    for (let i = 0; i < queue.length; i++) {
        const record = queue[i];
        onProgress?.(i, total, `${record.table} · ${record.operation}`);

        try {
            if (record.operation === 'upsert') {
                const { error } = await supabase.from(record.table).upsert(record.payload);
                if (error) throw error;
            } else if (record.operation === 'hide') {
                // Never delete — mark as hidden instead
                const { error } = await supabase.from(record.table).update({
                    is_hidden: true,
                    updated_at: new Date().toISOString(),
                }).eq('id', record.recordId);
                if (error) throw error;
            }
            removeFromQueue(record.id);
            success++;
            console.log(`[Queue] ✓ ${record.operation} ${record.table}:${record.recordId}`);
        } catch (err: any) {
            failed++;
            // Increment retry count — remove after MAX_RETRIES
            const current = loadQueue();
            const idx = current.findIndex(r => r.id === record.id);
            if (idx >= 0) {
                current[idx].retries += 1;
                if (current[idx].retries >= MAX_RETRIES) {
                    console.error(`[Queue] ✗ Dropping after ${MAX_RETRIES} retries: ${record.table}:${record.recordId}`, err);
                    current.splice(idx, 1);
                }
                saveQueue(current);
            }
        }
    }

    onProgress?.(total, total, 'Complete');
    console.log(`[Queue] Flush complete. Success: ${success}, Failed: ${failed}`);
    return { success, failed };
}

/** Clear the entire queue (use with caution) */
export function clearQueue(): void {
    localStorage.removeItem(QUEUE_KEY);
}
