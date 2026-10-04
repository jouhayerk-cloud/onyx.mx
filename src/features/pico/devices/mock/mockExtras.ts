import type { DeviceExtra } from '../twin/deviceExtra';

let phase = 0;

export function tick(now: number): void {
  // Drift slowly based on time, full cycle every ~62 seconds
  phase = (now / 10000) % (Math.PI * 2);
}

export function mockExtraFor(deviceId: string): DeviceExtra {
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  
  if (deviceId === 'stackchan-1') {
    return {
      expression: 'happy',
      head_pan_deg: sin * 20, // look left/right
      head_tilt_deg: 10 + cos * 5, // slight nod
      mic_level: 25 + Math.abs(sin * 15),
      volume: 80,
      vbat_mv: 4150 + sin * 10,
      charge_ma: 450,
      chip_temp_c: 42 + cos,
      uptime_s: 86400 + Math.floor(phase * 10000),
      wifi_ssid_hash: 'abc1234',
    };
  }
  
  if (deviceId === 'stackchan-2') {
    return {
      expression: 'sleepy',
      head_pan_deg: 0,
      head_tilt_deg: 0,
      mic_level: 0,
      volume: 40,
      vbat_mv: 3400 - sin * 5,
      charge_ma: -150,
      chip_temp_c: 35,
      uptime_s: 400000,
      wifi_ssid_hash: 'abc1234',
    };
  }
  
  if (deviceId === 'sticks3-1') {
    return {
      screen: 'packing',
      scanner: 'ready',
      nfc: 'none',
      vbat_mv: 3800 + sin * 20,
      charge_ma: -90,
      chip_temp_c: 39 + cos * 1.5,
      uptime_s: 3600,
      last_scan: 'ITEM-999',
      wifi_ssid_hash: 'xyz987',
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
