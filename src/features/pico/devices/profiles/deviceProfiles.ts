export type HardwareModel = 'M5StackChan' | 'M5StickS3' | 'unknown';

export interface DeviceProfile {
  model: HardwareModel;
  label: string;
  shortLabel: string;
  screen: { w: number; h: number } | null;
  hasServos: boolean;
  hasScanner: boolean;
  hasVoice: boolean;
  hasNfc: boolean;
  battery: { minVolt: number; maxVolt: number; lowPct: number; criticalPct: number } | null;
  telemetry: Array<{ key: string; label: string; unit: string; min: number; max: number; warnBelow?: number; warnAbove?: number }>;
  accent: string; /* a CSS variable name, never a raw colour */
}

const unknownProfile: DeviceProfile = {
  model: 'unknown',
  label: 'Unknown Device',
  shortLabel: 'Unknown',
  screen: null,
  hasServos: false,
  hasScanner: false,
  hasVoice: false,
  hasNfc: false,
  battery: null,
  telemetry: [],
  accent: '--slab-dim',
};

const stackChanProfile: DeviceProfile = {
  model: 'M5StackChan',
  label: 'M5StackChan AI Desktop Robot',
  shortLabel: 'StackChan',
  screen: { w: 320, h: 240 },
  hasServos: true,
  hasScanner: false,
  hasVoice: true,
  hasNfc: true,
  battery: { minVolt: 3300, maxVolt: 4200, lowPct: 20, criticalPct: 10 },
  telemetry: [
    { key: 'battery_pct', label: 'Battery', unit: '%', min: 0, max: 100, warnBelow: 20 },
    { key: 'rssi', label: 'WiFi Signal', unit: 'dBm', min: -100, max: 0, warnBelow: -75 },
    { key: 'heap_free', label: 'Free Memory', unit: 'KB', min: 0, max: 8192, warnBelow: 200 },
    { key: 'temp_c', label: 'Temperature', unit: '°C', min: 0, max: 100, warnAbove: 60 },
  ],
  accent: '--main-color',
};

const stickS3Profile: DeviceProfile = {
  model: 'M5StickS3',
  label: 'M5StickS3 Staff Device',
  shortLabel: 'StickS3',
  screen: { w: 240, h: 135 },
  hasServos: false,
  hasScanner: true,
  hasVoice: false,
  hasNfc: false,
  battery: { minVolt: 3300, maxVolt: 4200, lowPct: 20, criticalPct: 10 },
  telemetry: [
    { key: 'battery_pct', label: 'Battery', unit: '%', min: 0, max: 100, warnBelow: 20 },
    { key: 'rssi', label: 'WiFi Signal', unit: 'dBm', min: -100, max: 0, warnBelow: -75 },
    { key: 'heap_free', label: 'Free Memory', unit: 'KB', min: 0, max: 8192, warnBelow: 200 },
    { key: 'temp_c', label: 'Temperature', unit: '°C', min: 0, max: 100, warnAbove: 60 },
  ],
  accent: '--main-color',
};

/** Returns the device profile for a hardware model string, or the generic profile when unknown. */
export function profileFor(hardwareModel?: string | null): DeviceProfile {
  if (hardwareModel === 'M5StackChan') return stackChanProfile;
  if (hardwareModel === 'M5StickS3') return stickS3Profile;
  return unknownProfile;
}
