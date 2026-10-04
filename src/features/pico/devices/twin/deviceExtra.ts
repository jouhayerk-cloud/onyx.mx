import { DeviceState } from '../../surfaces/types';

export interface DeviceExtra {
  expression?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy' | 'listening' | 'speaking' | 'unknown';
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
  offline_queue_len?: number;
}

export function readExtra(state: DeviceState): DeviceExtra {
  try {
    const extraRaw = state.extra;
    if (!extraRaw || typeof extraRaw !== 'object') {
      return {};
    }

    const extra: DeviceExtra = {};

    if (typeof extraRaw.expression === 'string') {
      if (['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy', 'listening', 'speaking', 'unknown'].includes(extraRaw.expression)) {
        extra.expression = extraRaw.expression as DeviceExtra['expression'];
      }
    }
    if (typeof extraRaw.head_pan_deg === 'number' && extraRaw.head_pan_deg >= -180 && extraRaw.head_pan_deg <= 180) {
      extra.head_pan_deg = extraRaw.head_pan_deg;
    }
    if (typeof extraRaw.head_tilt_deg === 'number' && extraRaw.head_tilt_deg >= -90 && extraRaw.head_tilt_deg <= 90) {
      extra.head_tilt_deg = extraRaw.head_tilt_deg;
    }
    if (typeof extraRaw.screen === 'string') {
      if (['idle', 'scan', 'item', 'packing', 'offline', 'unknown'].includes(extraRaw.screen)) {
        extra.screen = extraRaw.screen as DeviceExtra['screen'];
      }
    }
    if (typeof extraRaw.last_scan === 'string' && extraRaw.last_scan.length <= 64) {
      extra.last_scan = extraRaw.last_scan;
    }
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
    if (typeof extraRaw.mic_level === 'number' && extraRaw.mic_level >= 0 && extraRaw.mic_level <= 255) {
      extra.mic_level = extraRaw.mic_level / 255;
    }
    if (typeof extraRaw.volume === 'number' && extraRaw.volume >= 0 && extraRaw.volume <= 100) {
      extra.volume = extraRaw.volume;
    }
    if (typeof extraRaw.vbat_mv === 'number' && extraRaw.vbat_mv >= 3000 && extraRaw.vbat_mv <= 4500) {
      extra.vbat_mv = extraRaw.vbat_mv;
    }
    if (typeof extraRaw.charge_ma === 'number' && extraRaw.charge_ma >= 0 && extraRaw.charge_ma <= 2000) {
      extra.charge_ma = extraRaw.charge_ma;
    }
    if (typeof extraRaw.chip_temp_c === 'number' && extraRaw.chip_temp_c >= -40 && extraRaw.chip_temp_c <= 125) {
      extra.chip_temp_c = extraRaw.chip_temp_c;
    }
    if (typeof extraRaw.uptime_s === 'number' && Number.isFinite(extraRaw.uptime_s) && extraRaw.uptime_s >= 0) {
      extra.uptime_s = extraRaw.uptime_s;
    }
    if (typeof extraRaw.offline_queue_len === 'number' && Number.isFinite(extraRaw.offline_queue_len) && extraRaw.offline_queue_len >= 0) {
      extra.offline_queue_len = extraRaw.offline_queue_len;
    }

    return extra;
  } catch (err) {
    return {};
  }
}
