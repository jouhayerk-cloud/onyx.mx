import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export type ScanEvent = {
  id: number;
  device_id: string;
  type: string;
  payload: any;
  occurred_at: string;
};

export type ScansStatus = 'loading' | 'ready' | 'empty' | 'unavailable';

export function useDeviceScans() {
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [status, setStatus] = useState<ScansStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const fetchScans = useCallback(async () => {
    try {
      const db = supabase as any;
      const { data, error: fetchError } = await db
        .from('onyxchan_events')
        .select('id, device_id, type, data, occurred_at')
        .eq('type', 'scan')
        .order('occurred_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        setStatus('unavailable');
        setError(fetchError.message);
        return;
      }

      if (!data || data.length === 0) {
        setStatus('empty');
        setScans([]);
        setError(null);
      } else {
        setStatus('ready');
        setScans(
          data.map((row: any) => ({
            id: row.id,
            device_id: row.device_id,
            type: row.type,
            payload: row.data || {},
            occurred_at: row.occurred_at,
          }))
        );
        setError(null);
      }
    } catch (e: any) {
      setStatus('unavailable');
      setError(e.message || 'Unknown error');
    }
  }, []);

  useEffect(() => {
    fetchScans();

    const intervalId = setInterval(fetchScans, 10000);

    const onFocus = () => {
      fetchScans();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchScans]);

  return { status, scans, error, refresh: fetchScans };
}
