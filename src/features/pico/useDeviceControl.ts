/**
 * useDeviceControl.ts
 * 
 * Provides functions for the Onyx.mx web app to send commands
 * back to OnyxChan hardware devices via:
 *   1. Direct WebSocket (LAN) — zero-latency, factory firmware compatible
 *   2. Supabase Realtime (WAN) — cloud relay for custom firmware
 *   3. Web Bluetooth (BLE) — direct browser-to-robot wireless connection
 * 
 * Supports:
 * - Custom animated face expressions
 * - Vendor color-coded UI elements on the StackChan LCD
 * - TTS speech commands with local Web Speech API synthesis audio playback
 * - Pan & Tilt 2-Axis Servo movement (-90°..+90° yaw, 0°..90° pitch)
 */
import { useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useStackChanSocket, StackChanSocketState } from './useStackChanSocket';

// ── Vendor Color Map (mirrors Onyx.mx styling system) ──────────────────────
export const VENDOR_COLORS: Record<string, string> = {
  'AM': '#9b1c31', // Alejandro Meza
  'AN': '#f1c40f', // Angel Cabrera
  'BT': '#8b4513', // Bernardo
  'CA': '#85C1E9', // Carlos Arenas
  'CP': '#C71585', // Cantera Puebla
  'DH': '#8DC63F', // Delfino Hernandez
  'EM': '#00AEEF', // Emmanuel
  'FR': '#F36F21', // Fountain Rock
  'GE': '#F89406', // Gerardo De Gante
  'IH': '#F39C12', // Ismael Huerta
  'JM': '#48C9B0', // Jose Meza
  'ML': '#FFA07A', // Maria Luisa
  'MM': '#8E44AD', // MM
  'RF': '#16A085', // Roberto Florita
  'SU': '#B19CD9', // Susana
  'TE': '#F1C40F', // Tellez Taller
};

// ── Face Expression Types ──────────────────────────────────────────────────
export type OnyxChanFace =
  | 'calm'
  | 'happy'
  | 'thinking'
  | 'sleepy'
  | 'shy'
  | 'smug'
  | 'pouty'
  | 'alert'
  | 'error'
  | 'speaking'
  | 'listening'
  | 'vendor-display'
  | 'inventory-display';

// ── Command Payloads ───────────────────────────────────────────────────────
export interface FaceCommand {
  action: 'face';
  expression: OnyxChanFace;
  duration?: number;
}

export interface TtsCommand {
  action: 'tts';
  text: string;
  language: 'es' | 'en' | 'ja';
}

export interface ServoCommand {
  action: 'move';
  pan: number;   // -90 to 90
  tilt: number;  // 0 to 90 (or -45 to 45)
}

export interface VendorDisplayCommand {
  action: 'vendor-display';
  vendor: string;
  color?: string;
  title: string;
  details: string[];
  icon?: 'box' | 'tag' | 'dollar' | 'truck' | 'package';
}

export interface InventoryDisplayCommand {
  action: 'inventory-display';
  item_id: string;
  title: string;
  price?: number;
  stock?: number;
  vendor?: string;
}

export interface AnimatedGifCommand {
  action: 'gif';
  url: string;
  duration?: number;
}

export type DeviceCommand =
  | FaceCommand
  | TtsCommand
  | ServoCommand
  | VendorDisplayCommand
  | InventoryDisplayCommand
  | AnimatedGifCommand;

export function useDeviceControl(
  deviceId: string,
  localIp?: string,
  sendBleCommand?: (payload: Record<string, any>) => Promise<boolean>
) {
  // Direct WebSocket bridge to the robot on LAN
  const directSocket = useStackChanSocket(localIp);

  // Play audio locally in browser using Web Speech API
  const playLocalSpeech = useCallback((text: string, lang: 'es' | 'en' | 'ja' = 'es') => {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'es' ? 'es-MX' : lang === 'ja' ? 'ja-JP' : 'en-US';
        utterance.rate = 1.05;
        utterance.pitch = 1.25; // StackChan cute higher pitch
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }, []);

  const sendCommand = useCallback(async (command: DeviceCommand) => {
    // Resolve vendor color if it's a vendor-display command
    if (command.action === 'vendor-display' && !command.color) {
      command.color = VENDOR_COLORS[command.vendor] || VENDOR_COLORS['Default'];
    }

    // Local Web Speech synthesis for TTS
    if (command.action === 'tts') {
      playLocalSpeech(command.text, command.language);
    }

    // ── Channel 1: Direct WebSocket (LAN) ──────────────────────────────
    if (directSocket.isConnected) {
      switch (command.action) {
        case 'face':
          directSocket.setFace(command.expression);
          break;
        case 'tts':
          directSocket.speak(command.text, command.language);
          break;
        case 'move':
          directSocket.moveServo(command.pan, command.tilt);
          break;
        default:
          directSocket.sendRaw(command as Record<string, any>);
          break;
      }
      console.log(`[Direct WS] Sent to ${localIp}:`, command);
    }

    // ── Channel 2: Web Bluetooth (BLE UART) ────────────────────────────
    if (sendBleCommand) {
      try {
        await sendBleCommand(command as Record<string, any>);
        console.log(`[Web Bluetooth BLE] Sent to device:`, command);
      } catch (err) {
        console.warn('[Web Bluetooth BLE] TX failed:', err);
      }
    }

    // ── Channel 3: Supabase Realtime (WAN Cloud) ───────────────────────
    try {
      const channelName = `device_control:${deviceId}`;
      const channel = supabase.channel(channelName);

      await channel.send({
        type: 'broadcast',
        event: 'DEVICE_COMMAND',
        payload: command,
      });

      console.log(`[Supabase RT] Sent to ${deviceId}:`, command);
    } catch (err) {
      console.warn('[Supabase RT] Broadcast failed:', err);
    }
  }, [deviceId, localIp, directSocket, sendBleCommand, playLocalSpeech]);

  // ── Convenience Methods ────────────────────────────────────────────────
  const say = useCallback((text: string, language: 'es' | 'en' | 'ja' = 'es') => {
    return sendCommand({ action: 'tts', text, language });
  }, [sendCommand]);

  const setFace = useCallback((expression: OnyxChanFace, duration?: number) => {
    return sendCommand({ action: 'face', expression, duration });
  }, [sendCommand]);

  const move = useCallback((pan: number, tilt: number) => {
    return sendCommand({ action: 'move', pan, tilt });
  }, [sendCommand]);

  const showVendorCard = useCallback((
    vendor: string,
    title: string,
    details: string[],
    icon?: VendorDisplayCommand['icon']
  ) => {
    return sendCommand({
      action: 'vendor-display',
      vendor,
      title,
      details,
      icon,
    });
  }, [sendCommand]);

  const showInventoryCard = useCallback((
    item_id: string,
    title: string,
    price?: number,
    stock?: number,
    vendor?: string
  ) => {
    return sendCommand({
      action: 'inventory-display',
      item_id,
      title,
      price,
      stock,
      vendor,
    });
  }, [sendCommand]);

  const showGif = useCallback((url: string, duration?: number) => {
    return sendCommand({ action: 'gif', url, duration });
  }, [sendCommand]);

  return useMemo(() => ({
    sendCommand,
    say,
    setFace,
    move,
    showVendorCard,
    showInventoryCard,
    showGif,
    playLocalSpeech,
    sendRaw: directSocket.sendRaw,
    directSocket: directSocket.state as StackChanSocketState,
    isDirectConnected: directSocket.isConnected,
    reconnectDirect: directSocket.reconnect,
  }), [sendCommand, say, setFace, move, showVendorCard, showGif, playLocalSpeech, directSocket]);
}
