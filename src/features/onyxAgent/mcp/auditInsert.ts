import { supabase } from '../../../lib/supabase';
import type { AuditRow } from './auditSink';

/**
 * Inserts batched audit rows into the onyxchan_audit Supabase table.
 * Throws on error so createAuditSink can perform its single retry before dropping.
 */
export async function insertAuditRows(rows: AuditRow[]): Promise<void> {
  if (!rows || rows.length === 0) {
    return;
  }
  const { error } = await (supabase as any)
    .from('onyxchan_audit')
    .insert(rows);

  if (error) {
    throw error;
  }
}
