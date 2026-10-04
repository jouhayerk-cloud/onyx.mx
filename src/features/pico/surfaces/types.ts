/**
 * Shapes for the OnyxChan fleet surfaces. Column names follow the drafted
 * migration 0002 (onyxchan_device_state, onyxchan_telemetry, agent_runs,
 * agent_run_events) and 0001 (onyxchan_commands). Nothing here is applied to
 * the database yet, so every consumer must cope with having no data.
 */

export interface DeviceState {
  device_id: string;
  last_checkin_at: string | null;
  checkin_interval_s: number | null;
  battery_pct: number | null;
  charging: boolean | null;
  rssi: number | null;
  fw_version: string | null;
  heap_free: number | null;
  temp_c: number | null;
  state: string | null;
  session_open_until: string | null;
  active_workflow: string | null;
  last_error: string | null;
  extra?: Record<string, unknown> | null;
}

export interface TelemetryPoint {
  device_id: string;
  at: string;
  battery_pct: number | null;
  rssi: number | null;
  heap_free: number | null;
  temp_c: number | null;
  state: string | null;
}

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AgentRun {
  id: string;
  workflow: string;
  device_id: string | null;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  events: AgentRunEvent[];
}

export type AgentRunEventType =
  | 'RunStarted'
  | 'StepStarted'
  | 'StepFinished'
  | 'ToolCallStart'
  | 'ToolCallResult'
  | 'StateDelta'
  | 'RunFinished'
  | 'RunError';

export interface AgentRunEvent {
  run_id: string;
  seq: number;
  type: AgentRunEventType;
  payload: Record<string, any>;
  at: string;
}

export type CommandStatus = 'queued' | 'leased' | 'acked' | 'failed' | 'expired';

export interface CommandRow {
  id: number;
  command_id: string | null;
  action: string;
  status: CommandStatus;
  target_device: string;
  created_at: string | null;
  acked_at: string | null;
  attempts: number | null;
}

/** Carried in the payload of a StateDelta event of workflow 'packing_check'. */
export interface PackingState {
  crate: string;
  expected: string[];
  scanned: string[];
  wrong: string[];
}

export type Connectivity = 'online' | 'stale' | 'offline';

const DEFAULT_CHECKIN_INTERVAL_S = 60;

/**
 * Derived from the last check-in only (no Realtime Presence): online inside
 * 2.5 intervals, stale up to 10 intervals, offline beyond or never seen.
 */
export function connectivity(state: DeviceState, nowMs: number): Connectivity {
  if (!state.last_checkin_at) return 'offline';
  const last = Date.parse(state.last_checkin_at);
  if (Number.isNaN(last)) return 'offline';
  const intervalMs = (state.checkin_interval_s ?? DEFAULT_CHECKIN_INTERVAL_S) * 1000;
  const age = nowMs - last;
  if (age < 2.5 * intervalMs) return 'online';
  if (age <= 10 * intervalMs) return 'stale';
  return 'offline';
}

/** Latest packing_check state of a run (last StateDelta that carries one), or null. */
export function packingStateOf(run: AgentRun): PackingState | null {
  if (run.workflow !== 'packing_check') return null;
  for (let i = run.events.length - 1; i >= 0; i--) {
    const e = run.events[i];
    if (e.type !== 'StateDelta') continue;
    const p = (e.payload?.state ?? e.payload) as Partial<PackingState> | undefined;
    if (p && typeof p.crate === 'string' && Array.isArray(p.expected)) {
      return {
        crate: p.crate,
        expected: p.expected.map(String),
        scanned: Array.isArray(p.scanned) ? p.scanned.map(String) : [],
        wrong: Array.isArray(p.wrong) ? p.wrong.map(String) : [],
      };
    }
  }
  return null;
}
