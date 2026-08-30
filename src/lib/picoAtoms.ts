/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface PicoDevice {
  id: string;
  device_mac: string;
  device_name: string;
  hardware_model: 'M5Stack Tab5' | 'M5StackChan' | 'ATOM Lite' | 'AtomS3R-CAM' | 'M5StickS3' | 'CoreS3' | string;
  assigned_role: 'Developer' | 'Admin' | 'Vendor' | 'Staff' | 'User' | string;
  owner_user_id: string;
  owner_email: string;
  accessories: string[];
  firmware_version: string;
  is_active: boolean;
  last_seen_at: string;
  /** Local IP address on LAN for direct WebSocket bridge (e.g. '192.168.1.137') */
  local_ip?: string;
}

export interface PicoSession {
  session_id: string;
  device_id: string;
  user_id: string;
  active_workflow: 'idle' | 'labeling' | 'packing' | 'cataloging' | 'tracking';
  workflow_metadata: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  battery?: number;
  rssi?: number;
  activeAccessory?: string;
  connected_at: string;
}

export interface PicoScanEvent {
  deviceId: string;
  scanType: 'NFC' | 'UHF_RFID' | 'QR' | 'BARCODE';
  tagId: string;
  rssi?: number;
  timestamp: number;
}

// Persistent or in-memory atoms for PicoBridge
export const picoDevicesAtom = atom<PicoDevice[]>([]);
export const activePicoSessionAtom = atom<PicoSession | null>(null);
export const picoRealtimePayloadAtom = atom<PicoScanEvent | null>(null);
export const picoWorkflowStateAtom = atom<'idle' | 'labeling' | 'packing' | 'cataloging' | 'tracking'>('idle');
export const picoRssiThresholdAtom = atomWithStorage<number>('picoRssiThreshold', -65);
