/**
 * Simulated fleet for local development ONLY. useDeviceFleet loads this module
 * through a dynamic import guarded by import.meta.env.DEV, so it never reaches
 * a production bundle.
 */
import type { AgentRun, CommandRow, DeviceState, TelemetryPoint } from './types';

const iso = (ms: number) => new Date(ms).toISOString();

export function buildMockFleet(now: number) {
  const devices: DeviceState[] = [
    {
      device_id: 'mock-stackchan', last_checkin_at: iso(now - 20_000), checkin_interval_s: 30,
      battery_pct: 78, charging: true, rssi: -52, fw_version: '0.4.0-mock', heap_free: 184_000,
      temp_c: 36.5, state: 'idle', session_open_until: iso(now + 120_000),
      active_workflow: 'packing_check', last_error: null,
    },
    {
      device_id: 'mock-atom', last_checkin_at: iso(now - 150_000), checkin_interval_s: 30,
      battery_pct: 41, charging: false, rssi: -71, fw_version: '0.4.0-mock', heap_free: 92_000,
      temp_c: 33.0, state: 'sleeping', session_open_until: null,
      active_workflow: null, last_error: 'Wi-Fi reconnect failed',
    },
    {
      device_id: 'mock-stick', last_checkin_at: iso(now - 3_600_000), checkin_interval_s: 60,
      battery_pct: 9, charging: false, rssi: -84, fw_version: '0.3.2-mock', heap_free: 61_000,
      temp_c: null, state: null, session_open_until: null,
      active_workflow: null, last_error: null,
    },
  ];

  const telemetry: TelemetryPoint[] = [];
  for (const d of devices) {
    for (let i = 30; i >= 0; i--) {
      telemetry.push({
        device_id: d.device_id,
        at: iso(now - i * 60_000),
        battery_pct: d.battery_pct === null ? null : Math.max(0, Math.min(100, d.battery_pct - Math.round(i / 3))),
        rssi: d.rssi === null ? null : d.rssi + Math.round(Math.sin(i / 3) * 4),
        heap_free: d.heap_free,
        temp_c: d.temp_c,
        state: d.state,
      });
    }
  }

  const runId = 'mock-run-1';
  const t = (s: number) => iso(now - 90_000 + s * 1000);
  const runs: AgentRun[] = [
    {
      id: runId, workflow: 'packing_check', device_id: 'mock-stackchan', status: 'running',
      started_at: t(0), finished_at: null,
      events: [
        { run_id: runId, seq: 0, type: 'RunStarted', payload: {}, at: t(0) },
        { run_id: runId, seq: 1, type: 'StepStarted', payload: { name: 'Load crate manifest' }, at: t(1) },
        { run_id: runId, seq: 2, type: 'ToolCallStart', payload: { tool: 'get_crate_manifest', id: 'c1' }, at: t(2) },
        { run_id: runId, seq: 3, type: 'ToolCallResult', payload: { tool: 'get_crate_manifest', id: 'c1' }, at: t(4) },
        { run_id: runId, seq: 4, type: 'StepFinished', payload: { name: 'Load crate manifest' }, at: t(5) },
        { run_id: runId, seq: 5, type: 'StepStarted', payload: { name: 'Scan items' }, at: t(6) },
        {
          run_id: runId, seq: 6, type: 'StateDelta', at: t(40),
          payload: { state: { crate: 'MOCK-CRATE-01', expected: ['A1', 'A2', 'A3', 'A4', 'A5'], scanned: ['A1', 'A2', 'X9'], wrong: ['X9'] } },
        },
      ],
    },
    {
      id: 'mock-run-2', workflow: 'inventory_lookup', device_id: 'mock-atom', status: 'failed',
      started_at: iso(now - 600_000), finished_at: iso(now - 595_000),
      events: [
        { run_id: 'mock-run-2', seq: 0, type: 'RunStarted', payload: {}, at: iso(now - 600_000) },
        { run_id: 'mock-run-2', seq: 1, type: 'ToolCallStart', payload: { tool: 'search_items', id: 'c2' }, at: iso(now - 599_000) },
        { run_id: 'mock-run-2', seq: 2, type: 'RunError', payload: { message: 'Tool timed out' }, at: iso(now - 595_000) },
      ],
    },
  ];

  const commands: CommandRow[] = (['queued', 'leased', 'acked', 'failed', 'expired'] as const).map((status, i) => ({
    id: i + 1, command_id: null, action: ['say', 'move', 'set_face', 'say', 'show_card'][i],
    status, target_device: i % 2 ? 'mock-atom' : 'mock-stackchan',
    created_at: iso(now - (i + 1) * 45_000), acked_at: status === 'acked' ? iso(now - i * 40_000) : null,
    attempts: status === 'queued' ? 0 : 1,
  }));

  return { devices, telemetry, runs, commands };
}
