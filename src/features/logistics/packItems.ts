// One place that writes an item's crate pointer, so every packing screen saves the same rules.
import { supabase } from '../../lib/supabase';

export type PackTable = 'inventory' | 'production';

export const buildPackPatch = (crateId: string | null, now = new Date().toISOString()) =>
    crateId
        ? { crate_id: crateId, packing_status: 'Packed', pack_date: now, updated_at: now }
        : { crate_id: null, packing_status: 'Unpacked', pack_date: null, updated_at: now };

async function writeItems(table: PackTable, crateId: string | null, itemIds: string[]) {
    const ids = itemIds.map(String).filter(Boolean);
    if (ids.length === 0) return;
    const patch = buildPackPatch(crateId);
    const { error } = await supabase.from(table).update(patch).in('id', ids);
    if (error) throw error;
    const db = (window as any).onyxDb;
    if (!db?.[table]) return;
    for (const id of ids) {
        try {
            const doc = await db[table].findOne({ selector: { id } }).exec();
            if (doc) await doc.patch(patch);
        } catch (_) { /* local cache only; Supabase already holds the truth */ }
    }
}

export const packItems = (crateId: string, itemIds: string[], table: PackTable = 'inventory') =>
    writeItems(table, crateId, itemIds);

export const unpackItems = (itemIds: string[], table: PackTable = 'inventory') =>
    writeItems(table, null, itemIds);
