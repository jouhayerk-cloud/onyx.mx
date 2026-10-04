/**
 * useDeviceFleet.ts
 *
 * Real fleet telemetry for the OnyxChan surfaces.
 *   live : select from onyxchan_device_state (+ latest telemetry, agent_runs,
 *          agent_run_events, onyxchan_commands), then follow the private topic
 *          'devices:all' for INSERT/UPDATE from realtime.broadcast_changes.
 *   none : the tables do not exist yet or the query was denied. No crash, no data.
 *   mock : development only (import.meta.env.DEV and localStorage
 *          'onyx.devices.mock' === '1'). Never reachable in production.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useDeviceChannel } from '../hooks/useDeviceChannel';
import type {
  AgentRun, AgentRunEvent, CommandRow, CommandStatus, DeviceState, TelemetryPoint,
} from './types';

export type FleetSource = 'live' | 'mock' | 'none';

const db = supabase as any; // the drafted tables are not in database.types.ts yet
const POLL_MS = 30_000;
const BROADCAST_EVENTS = ['INSERT', 'UPDATE'];

function mockEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('onyx.devices.mock') === '1';
  } catch {
    return false;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toDeviceState(r: any): DeviceState {
  return {
    device_id: String(r.device_id),
    last_checkin_at: str(r.last_checkin_at),
    checkin_interval_s: num(r.checkin_interval_s),
    battery_pct: num(r.battery_pct),
    charging: typeof r.charging === 'boolean' ? r.charging : null,
    rssi: num(r.rssi),
    fw_version: str(r.fw_version),
    heap_free: num(r.heap_free),
    temp_c: num(r.temp_c),
    state: str(r.state),
    session_open_until: str(r.session_open_until),
    active_workflow: str(r.active_workflow),
    last_error: str(r.last_error),
  };
}

function toCommandStatus(s: unknown): CommandStatus {
  if (s === 'pending') return 'queued'; // legacy value from before 0001
  if (s === 'queued' || s === 'leased' || s === 'acked' || s === 'failed' || s === 'expired') return s;
  return 'queued';
}

function toCommand(r: any): CommandRow {
  return {
    id: Number(r.id),
    command_id: str(r.command_id),
    action: String(r.action ?? ''),
    status: toCommandStatus(r.status),
    target_device: String(r.target_device ?? ''),
    created_at: str(r.created_at),
    acked_at: str(r.acked_at),
    attempts: num(r.attempts),
  };
}

function errText(e: any): string {
  return String(e?.message ?? e?.code ?? e ?? 'Unknown error');
}

/** A clock that re-renders its consumer, so connectivity and relative times age on screen. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDeviceFleet() {
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [source, setSource] = useState<FleetSource>('none');
  const [error, setError] = useState<string | null>(null);

  // Secondary data (telemetry, runs, commands). A failure here keeps the devices.
  const loadExtras = useCallback(async (): Promise<string | null> => {
    let firstError: string | null = null;
    const note = (e: any) => { firstError = firstError ?? errText(e); };

    try {
      const { data, error: e } = await db.from('onyxchan_telemetry')
        .select('device_id, at, battery_pct, rssi, heap_free, temp_c, state')
        .order('at', { ascending: false }).limit(600);
      if (e) note(e);
      else setTelemetry(((data ?? []) as any[]).reverse().map((r) => ({
        device_id: String(r.device_id), at: String(r.at), battery_pct: num(r.battery_pct),
        rssi: num(r.rssi), heap_free: num(r.heap_free), temp_c: num(r.temp_c), state: str(r.state),
      })));
    } catch (e) { note(e); }

    try {
      const { data: runRows, error: e } = await db.from('agent_runs')
        .select('id, workflow, device_id, status, started_at, finished_at')
        .order('started_at', { ascending: false }).limit(20);
      if (e) note(e);
      else {
        const ids = ((runRows ?? []) as any[]).map((r) => r.id);
        let events: any[] = [];
        if (ids.length) {
          const { data: ev, error: e2 } = await db.from('agent_run_events')
            .select('run_id, seq, type, payload, at').in('run_id', ids).order('seq', { ascending: true });
          if (e2) note(e2); else events = ev ?? [];
        }
        setRuns(((runRows ?? []) as any[]).map((r): AgentRun => ({
          id: String(r.id), workflow: String(r.workflow), device_id: str(r.device_id),
          status: r.status, started_at: String(r.started_at), finished_at: str(r.finished_at),
          events: events.filter((x) => x.run_id === r.id).map((x): AgentRunEvent => ({
            run_id: String(x.run_id), seq: Number(x.seq), type: x.type,
            payload: x.payload && typeof x.payload === 'object' ? x.payload : {}, at: String(x.at),
          })),
        })));
      }
    } catch (e) { note(e); }

    try {
      const full = await db.from('onyxchan_commands')
        .select('id, command_id, action, status, target_device, created_at, acked_at, attempts')
        .order('created_at', { ascending: false }).limit(30);
      // 0001 columns may not be applied yet: fall back to the columns that exist today.
      const res = full.error
        ? await db.from('onyxchan_commands').select('id, action, status, target_device, created_at')
            .order('created_at', { ascending: false }).limit(30)
        : full;
      if (res.error) note(res.error);
      else setCommands(((res.data ?? []) as any[]).map(toCommand));
    } catch (e) { note(e); }

    return firstError;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (mockEnabled()) {
      import('./mockFleet').then(({ buildMockFleet }) => {
        if (cancelled) return;
        const m = buildMockFleet(Date.now());
        setDevices(m.devices);
        setTelemetry(m.telemetry);
        setRuns(m.runs);
        setCommands(m.commands);
        setError(null);
        setSource('mock');
      });
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const { data, error: e } = await db.from('onyxchan_device_state').select('*');
        if (cancelled) return;
        if (e) {
          setDevices([]); setSource('none'); setError(errText(e));
          return;
        }
        setDevices(((data ?? []) as any[]).map(toDeviceState));
        setSource('live');
        setError(null);
        const extraErr = await loadExtras();
        if (cancelled) return;
        if (extraErr) setError(extraErr);
        timer = setInterval(() => { void loadExtras(); }, POLL_MS);
      } catch (e) {
        if (!cancelled) { setDevices([]); setSource('none'); setError(errText(e)); }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [loadExtras]);

  // realtime.broadcast_changes payload: { operation, record, old_record, ... }
  const onBroadcast = useCallback((event: string, payload: any) => {
    const record = payload?.record ?? payload?.payload?.record;
    if (!record || (event !== 'INSERT' && event !== 'UPDATE') || !record.device_id) return;
    const next = toDeviceState(record);
    setDevices((prev) => {
      const i = prev.findIndex((d) => d.device_id === next.device_id);
      if (i === -1) return [...prev, next];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, []);

  useDeviceChannel(source === 'live' ? 'devices:all' : null, BROADCAST_EVENTS, onBroadcast, { private: true });

  const telemetryFor = useCallback(
    (deviceId: string) => telemetry.filter((p) => p.device_id === deviceId),
    [telemetry],
  );

  return useMemo(
    () => ({ devices, telemetryFor, runs, commands, source, error }),
    [devices, telemetryFor, runs, commands, source, error],
  );
}
