import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

const db = supabase as any;

export interface AdminDevice {
  device_id: string;
  device_name: string | null;
  hardware_model: string | null;
  role: string | null;
  firmware_version: string | null;
  token_issued_at: string | null;
  token_last_used_at: string | null;
  token_revoked_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_checkin_at: string | null;
  session_open_until: string | null;
}

export interface Assignment {
  device_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

/** Loads Pico devices, token state and user assignments from Supabase for the admin tab. */
export function useDeviceAdmin() {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const { data: dData, error: dErr } = await db
        .from('onyxchan_devices')
        .select(`
          device_id,
          device_name,
          hardware_model,
          role,
          firmware_version,
          token_issued_at,
          token_last_used_at,
          token_revoked_at,
          expires_at,
          revoked_at,
          last_checkin_at,
          session_open_until
        `);
      
      if (dErr) throw dErr;

      const { data: aData, error: aErr } = await db
        .from('onyxchan_device_assignments')
        .select('device_id, user_id, assigned_by, created_at');
      
      // If table doesn't exist, assignment query might fail. We'll ignore a missing table error, but throw others if they aren't 'relation does not exist'. 
      // The instructions say "any Supabase table that may not exist yet is queried through supabase as any and a missing table or permission error becomes an 'unavailable' state, never a thrown error"
      // So if ANY error occurs (including devices missing), we set a generic unavailable state instead of throwing an unhandled exception. Wait, I should not throw.
      if (aErr && aErr.code !== '42P01') {
        throw aErr;
      }

      setDevices(dData || []);
      setAssignments(aData || []);
    } catch (e: any) {
      setError(e?.message || 'Data unavailable');
      setDevices([]);
      setAssignments([]);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, devices, assignments, error, refresh: load };
}
