// Values are in WIRE format (what the device sends and onyxchan_device_state.extra stores): integers, mic_level 0..255, charge_ma 0..2000.
// The mock goes through readExtra like live data, so out-of-range values would be dropped.

let phase = 0;

export function tick(now: number): void {
  // Drift slowly based on time, full cycle every ~62 seconds
  phase = (now / 10000) % (Math.PI * 2);
}

export function mockExtraFor(deviceId: string): Record<string, unknown> {
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  
  if (deviceId === 'stackchan-1') {
    return {
      expression: 'happy',
      head_pan_deg: Math.round(sin * 20), // look left/right
      head_tilt_deg: Math.round(10 + cos * 5), // slight nod
      mic_level: Math.round((0.25 + Math.abs(sin * 0.15)) * 255), // wire value 0..255, readExtra converts to 0..1
      volume: 80,
      vbat_mv: Math.round(4150 + sin * 10),
      charge_ma: 450,
      chip_temp_c: Math.round(42 + cos),
      uptime_s: 86400 + Math.floor(phase * 10000),
    };
  }
  
  if (deviceId === 'stackchan-2') {
    return {
      expression: 'sleepy',
      head_pan_deg: 0,
      head_tilt_deg: 0,
      mic_level: 0,
      volume: 40,
      vbat_mv: Math.round(3400 - sin * 5),
      charge_ma: 0, // wire range is 0..2000: not charging reports 0
      chip_temp_c: 35,
      uptime_s: 400000,
    };
  }
  
  if (deviceId === 'sticks3-1') {
    return {
      screen: 'packing',
      scanner: 'ready',
      nfc: 'none',
      vbat_mv: Math.round(3800 + sin * 20),
      charge_ma: 0,
      chip_temp_c: Math.round(39 + cos * 1.5),
      uptime_s: 3600,
      last_scan: 'ITEM-999',
    };
  }
  
  if (deviceId === 'sticks3-2') {
    return {
      screen: 'offline',
      scanner: 'none',
      nfc: 'none',
      vbat_mv: 3300,
      charge_ma: 0,
      chip_temp_c: 25,
      uptime_s: 0,
    };
  }
  
  return {};
}
