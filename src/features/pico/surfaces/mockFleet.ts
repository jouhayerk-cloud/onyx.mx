/**
 * Simulated fleet for local development ONLY. useDeviceFleet loads this module
 * through a dynamic import guarded by import.meta.env.DEV, so it never reaches
 * a production bundle.
 */
import type { AgentRun, CommandRow, DeviceState, TelemetryPoint } from './types';
import { mockExtraFor, tick } from '../devices/mock/mockExtras';

const iso = (ms: number) => new Date(ms).toISOString();

export function buildMockFleet(now: number) {
  tick(now); // Progress device simulations

  const devices: DeviceState[] = [
    {
      device_id: 'stackchan-1', last_checkin_at: iso(now - 10_000), checkin_interval_s: 30,
      battery_pct: 95, charging: true, rssi: -45, fw_version: '0.5.0-mock', heap_free: 190_000,
      temp_c: 42, state: 'idle', session_open_until: iso(now + 120_000),
      active_workflow: null, last_error: null,
      hardware_model: 'M5StackChan',
      extra: mockExtraFor('stackchan-1'),
    } as unknown as DeviceState,
    {
      device_id: 'stackchan-2', last_checkin_at: iso(now - 300_000), checkin_interval_s: 60,
      battery_pct: 12, charging: false, rssi: -78, fw_version: '0.4.0-mock', heap_free: 180_000,
      temp_c: 35, state: 'sleeping', session_open_until: null,
      active_workflow: null, last_error: 'Wi-Fi reconnect failed',
      hardware_model: 'M5StackChan',
      extra: mockExtraFor('stackchan-2'),
    } as unknown as DeviceState,
    {
      device_id: 'sticks3-1', last_checkin_at: iso(now - 15_000), checkin_interval_s: 60,
      battery_pct: 55, charging: false, rssi: -60, fw_version: '0.5.0-mock', heap_free: 95_000,
      temp_c: 39, state: 'active', session_open_until: null,
      active_workflow: 'packing_check', last_error: null,
      hardware_model: 'M5StickS3',
      extra: mockExtraFor('sticks3-1'),
    } as unknown as DeviceState,
    {
      device_id: 'sticks3-2', last_checkin_at: iso(now - 86400_000), checkin_interval_s: 60,
      battery_pct: 0, charging: false, rssi: -90, fw_version: '0.5.0-mock', heap_free: 61_000,
      temp_c: null, state: null, session_open_until: null,
      active_workflow: null, last_error: null,
      hardware_model: 'M5StickS3',
      extra: mockExtraFor('sticks3-2'),
    } as unknown as DeviceState,
  ];

  const telemetry: TelemetryPoint[] = [];
  const TELEMETRY_INTERVAL_MS = 30 * 60 * 1000;
  const POINTS_COUNT = 48; // 24 hours

  for (const d of devices) {
    for (let i = POINTS_COUNT; i >= 0; i--) {
      const pointTime = now - i * TELEMETRY_INTERVAL_MS;
      
      // Introduce check-in gaps (skip roughly 5% of points)
      if (i % 17 === 0 && d.device_id !== 'sticks3-2') continue;
      
      let battery = d.battery_pct ?? 0;
      let temp = d.temp_c ?? 30;
      let rssi = d.rssi ?? -70;

      if (d.device_id === 'stackchan-1') {
        battery = Math.max(20, Math.min(100, 95 - (i * 2))); // charging up to 95
        temp = 42 - (i / 10);
        rssi = -45 + Math.round(Math.sin(i / 2) * 5);
      } else if (d.device_id === 'stackchan-2') {
        battery = Math.max(0, Math.min(100, 12 + i * 1.5));
        rssi = -78 + Math.round(Math.cos(i) * 10);
      } else if (d.device_id === 'sticks3-1') {
        battery = Math.max(0, Math.min(100, 55 + i * 0.8));
        temp = 32 + (POINTS_COUNT - i) * 0.15;
        rssi = -60 + Math.round(Math.sin(i / 3) * 8);
      } else if (d.device_id === 'sticks3-2') {
        if (i < 40) continue;
        battery = Math.max(0, Math.min(100, 50 - (POINTS_COUNT - i) * 2));
      }

      telemetry.push({
        device_id: d.device_id,
        at: iso(pointTime),
        battery_pct: Math.min(100, Math.max(0, Math.round(battery))),
        rssi: Math.round(rssi),
        heap_free: (d.heap_free ?? 100000) + Math.round(Math.sin(i) * 5000),
        temp_c: d.temp_c !== null ? Number(temp.toFixed(1)) : null,
        state: d.state,
      });
    }
  }

  const runId1 = 'mock-run-packing';
  const t = (s: number) => iso(now - 120_000 + s * 1000);
  const runs: AgentRun[] = [
    {
      id: runId1, workflow: 'packing_check', device_id: 'sticks3-1', status: 'running',
      started_at: t(0), finished_at: null,
      events: [
        { run_id: runId1, seq: 0, type: 'RunStarted', payload: {}, at: t(0) },
        { run_id: runId1, seq: 1, type: 'StepStarted', payload: { name: 'Load crate manifest' }, at: t(1) },
        { run_id: runId1, seq: 2, type: 'ToolCallStart', payload: { tool: 'get_crate_manifest', id: 'c1' }, at: t(2) },
        { run_id: runId1, seq: 3, type: 'ToolCallResult', payload: { tool: 'get_crate_manifest', id: 'c1' }, at: t(4) },
        { run_id: runId1, seq: 4, type: 'StepFinished', payload: { name: 'Load crate manifest' }, at: t(5) },
        { run_id: runId1, seq: 5, type: 'StepStarted', payload: { name: 'Scan items' }, at: t(6) },
        {
          run_id: runId1, seq: 6, type: 'StateDelta', at: t(10),
          payload: { state: { crate: 'CRATE-MX-091', expected: ['ITEM-101', 'ITEM-102', 'ITEM-103'], scanned: ['ITEM-101'], wrong: [] } },
        },
        {
          run_id: runId1, seq: 7, type: 'StateDelta', at: t(40),
          payload: { state: { crate: 'CRATE-MX-091', expected: ['ITEM-101', 'ITEM-102', 'ITEM-103'], scanned: ['ITEM-101', 'ITEM-999'], wrong: ['ITEM-999'] } },
        },
      ],
    },
    {
      id: 'mock-run-lookup', workflow: 'inventory_lookup', device_id: 'stackchan-1', status: 'failed',
      started_at: iso(now - 600_000), finished_at: iso(now - 595_000),
      events: [
        { run_id: 'mock-run-lookup', seq: 0, type: 'RunStarted', payload: {}, at: iso(now - 600_000) },
        { run_id: 'mock-run-lookup', seq: 1, type: 'ToolCallStart', payload: { tool: 'search_items', id: 'c2' }, at: iso(now - 599_000) },
        { run_id: 'mock-run-lookup', seq: 2, type: 'RunError', payload: { message: 'Tool timed out' }, at: iso(now - 595_000) },
      ],
    },
  ];

  const commands: CommandRow[] = (['queued', 'leased', 'acked', 'failed', 'expired'] as const).map((status, i) => ({
    id: i + 1, command_id: null, action: ['item-card', 'move', 'face', 'speak', 'vendor-display'][i],
    status, target_device: i % 2 === 0 ? 'stackchan-1' : 'sticks3-1',
    created_at: iso(now - (i + 1) * 45_000), acked_at: status === 'acked' ? iso(now - i * 40_000) : null,
    attempts: status === 'queued' ? 0 : (status === 'failed' ? 3 : 1),
  }));

  return { devices, telemetry, runs, commands };
}
