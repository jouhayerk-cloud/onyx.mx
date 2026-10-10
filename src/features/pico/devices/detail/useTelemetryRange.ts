import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { TelemetryPoint } from '../../surfaces/types';

const db = supabase as any;

export type TelemetryRange = '1h' | '24h' | '7d';

/** Loads a device's telemetry for a time range from Supabase, thinned to 240 points, every 30 s. */
export function useTelemetryRange(deviceId: string | null, range: TelemetryRange) {
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const now = Date.now();
      let startMs = now;
      if (range === '1h') startMs -= 3600 * 1000;
      else if (range === '24h') startMs -= 24 * 3600 * 1000;
      else if (range === '7d') startMs -= 7 * 24 * 3600 * 1000;

      const isoStart = new Date(startMs).toISOString();

      const { data, error: e } = await db.from('onyxchan_telemetry')
        .select('device_id, at, battery_pct, rssi, heap_free, temp_c, state')
        .eq('device_id', deviceId)
        .gte('at', isoStart)
        .order('at', { ascending: true });

      if (e) {
        setError(e.message || 'Error fetching telemetry');
      } else {
        let raw = (data || []) as TelemetryPoint[];
        if (raw.length > 240) {
          const step = raw.length / 240;
          const downsampled: TelemetryPoint[] = [];
          for (let i = 0; i < 240; i++) {
            const index = Math.floor(i * step);
            downsampled.push(raw[index]);
          }
          raw = downsampled;
        }
        setPoints(raw);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [deviceId, range]);

  useEffect(() => {
    if (!deviceId) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    void load();
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(interval);
  }, [deviceId, range, load]);

  return { points, loading, error };
}
