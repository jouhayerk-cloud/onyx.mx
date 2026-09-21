import type { Database } from './database.types';

/**
 * The tables that participate in offline sync.
 *
 * These are the ones passed to syncCollection in database.ts:474-478, which are
 * also the only tables changeQueue can replay against.
 *
 * This exists for a second reason beyond documentation. `supabase.from(x)` with
 * x typed as plain `string` forces TypeScript to instantiate the generic across
 * every table in the schema at once, and at fifteen tables that exceeds the
 * instantiation depth limit -- reported as TS2589 "type instantiation is
 * excessively deep and possibly infinite" in changeQueue.ts and database.ts.
 * Narrowing to the five that are real both removes the error and stops those
 * helpers claiming a reach they do not have.
 */
export type SyncTable = Extract<
    keyof Database['public']['Tables'],
    'inventory' | 'production' | 'logistics' | 'finance' | 'shipments' | 'item_segmentation'
>;

export const SYNC_TABLES: readonly SyncTable[] = [
    'inventory',
    'production',
    'logistics',
    'finance',
    'shipments',
    // Pull-only. It is in this union because deltaPull types its table name
    // against it; changeQueue never replays a local write here, because the
    // wizard writes segmentation directly to Supabase.
    'item_segmentation',
] as const;

/** Narrow an untrusted string (a queued record, a stored job) to a SyncTable. */
export const isSyncTable = (value: string): value is SyncTable =>
    (SYNC_TABLES as readonly string[]).includes(value);
