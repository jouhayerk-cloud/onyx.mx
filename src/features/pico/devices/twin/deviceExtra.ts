import { DeviceState } from '../../surfaces/types';

export interface DeviceExtra {
  expression?: string;
  head_pan_deg?: number;
  head_tilt_deg?: number;
  screen?: 'idle' | 'scan' | 'item' | 'packing' | 'offline' | 'unknown';
  last_scan?: string;
  scanner?: 'none' | 'ready' | 'error';
  nfc?: 'none' | 'ready' | 'error';
  mic_level?: number;
  volume?: number;
  vbat_mv?: number;
  charge_ma?: number;
  chip_temp_c?: number;
  uptime_s?: number;
  wifi_ssid_hash?: string;
}

export function readExtra(state: DeviceState): DeviceExtra {
  try {
    const extraRaw = (state as any).extra;
    if (!extraRaw || typeof extraRaw !== 'object') {
      return {};
    }

    const extra: DeviceExtra = {};

    if (typeof extraRaw.expression === 'string') extra.expression = extraRaw.expression;
    if (typeof extraRaw.head_pan_deg === 'number') extra.head_pan_deg = extraRaw.head_pan_deg;
    if (typeof extraRaw.head_tilt_deg === 'number') extra.head_tilt_deg = extraRaw.head_tilt_deg;
    if (typeof extraRaw.screen === 'string') {
      if (['idle', 'scan', 'item', 'packing', 'offline', 'unknown'].includes(extraRaw.screen)) {
        extra.screen = extraRaw.screen as DeviceExtra['screen'];
      }
    }
    if (typeof extraRaw.last_scan === 'string') extra.last_scan = extraRaw.last_scan;
    if (typeof extraRaw.scanner === 'string') {
      if (['none', 'ready', 'error'].includes(extraRaw.scanner)) {
        extra.scanner = extraRaw.scanner as DeviceExtra['scanner'];
      }
    }
    if (typeof extraRaw.nfc === 'string') {
      if (['none', 'ready', 'error'].includes(extraRaw.nfc)) {
        extra.nfc = extraRaw.nfc as DeviceExtra['nfc'];
      }
    }
    if (typeof extraRaw.mic_level === 'number') extra.mic_level = extraRaw.mic_level;
    if (typeof extraRaw.volume === 'number') extra.volume = extraRaw.volume;
    if (typeof extraRaw.vbat_mv === 'number') extra.vbat_mv = extraRaw.vbat_mv;
    if (typeof extraRaw.charge_ma === 'number') extra.charge_ma = extraRaw.charge_ma;
    if (typeof extraRaw.chip_temp_c === 'number') extra.chip_temp_c = extraRaw.chip_temp_c;
    if (typeof extraRaw.uptime_s === 'number') extra.uptime_s = extraRaw.uptime_s;
    if (typeof extraRaw.wifi_ssid_hash === 'string') extra.wifi_ssid_hash = extraRaw.wifi_ssid_hash;

    return extra;
  } catch (err) {
    return {};
  }
}
