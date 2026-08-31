/**
 * useStackChanSocket.ts
 * 
 * Direct WebSocket bridge to StackChan factory firmware on the local network.
 * Connects to the robot's ESP32 WebSocket server for real-time avatar control,
 * servo movement, TTS commands, and scan event interception.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { PicoScanEvent } from '../../lib/picoAtoms';

export type StackChanSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Common WebSocket endpoints to probe */
const WS_ENDPOINTS = [
  '/',          // Root WebSocket (Node.js Gateway)
  '/ws',
  '/avatar',
];

const WS_PORTS = [3000, 80, 8080, 81];

/**
 * A page served over HTTPS may not open a plain ws:// socket — the browser blocks
 * it as mixed content and flags the page as not secure. Loopback is the single
 * exception: browsers treat localhost/127.0.0.1 as a trustworthy origin, so
 * ws://localhost still connects from https://.
 *
 * On the deployed site the LAN gateway is therefore unreachable by design. That
 * is the architecture, not a defect: production drives devices through Supabase
 * Realtime over wss:// (see PicoRealtimeController), and this direct socket is
 * the local development path.
 */
const isSecurePage = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

const isLoopbackHost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

/** Max reconnection attempts before giving up */
const MAX_RECONNECT = 5;
const RECONNECT_BASE_MS = 1000;

export interface StackChanSocketState {
  status: StackChanSocketStatus;
  endpoint: string | null;
  latencyMs: number | null;
  lastError: string | null;
}

export function useStackChanSocket(
  localIp: string | undefined,
  onScanEvent?: (event: PicoScanEvent) => void
) {
  const [state, setState] = useState<StackChanSocketState>({
    status: 'disconnected',
    endpoint: null,
    latencyMs: null,
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingStart = useRef<number>(0);

  /** Handle incoming messages from the robot */
  const handleMessage = useCallback((ev: MessageEvent) => {
    try {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data);

        // Pong response for latency measurement
        if (msg.type === 'pong' || msg.cmd === 'pong') {
          const latency = Date.now() - pingStart.current;
          setState(s => ({ ...s, latencyMs: latency }));
          return;
        }

        // Scan Event from ESP32 ST25R3916 NFC / RFID Unit
        if (msg.type === 'scan' || msg.tagId || msg.tag_id) {
          const scanEvt: PicoScanEvent = {
            deviceId: localIp || 'stackchan-ws',
            scanType: (msg.scanType || msg.sensor || 'NFC') as any,
            tagId: msg.tagId || msg.tag_id,
            rssi: msg.rssi,
            timestamp: msg.timestamp || Date.now(),
          };
          if (onScanEvent) {
            onScanEvent(scanEvt);
          }
        }

        console.log('[StackChan WS] Received:', msg);
      }
    } catch {
      // Non-JSON message, ignore
    }
  }, [localIp, onScanEvent]);

  /** Try connecting to a single WebSocket URL with a timeout */
  const tryConnect = (url: string, timeoutMs: number): Promise<WebSocket | null> => {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve(null);
        }, timeoutMs);

        ws.onopen = () => {
          clearTimeout(timer);
          resolve(ws);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  };

  /** Start keepalive ping interval */
  const startPing = () => {
    stopPing();
    pingTimer.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        pingStart.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 8000); // Ping every 8s
  };

  const stopPing = () => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  };

  /** Handle disconnection */
  const handleDisconnect = () => {
    stopPing();
    wsRef.current = null;
    setState(s => ({ ...s, status: 'disconnected', latencyMs: null }));
    scheduleReconnect();
  };

  /** Schedule a reconnection attempt */
  const scheduleReconnect = () => {
    if (reconnectCount.current >= MAX_RECONNECT) {
      setState(s => ({ ...s, status: 'error', lastError: 'Max reconnection attempts reached' }));
      return;
    }
    const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectCount.current);
    reconnectCount.current++;
    reconnectTimer.current = setTimeout(() => connect(), delay);
  };

  /** Attempt connection to the robot's WebSocket server */
  const connect = useCallback(async () => {
    if (!localIp) return;

    // Clean up any existing connection
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const secure = isSecurePage();

    setState(s => ({ ...s, status: 'connecting', lastError: null }));

      for (const port of WS_PORTS) {
      for (const path of WS_ENDPOINTS) {
        // Try localhost first for the Node.js Gateway, fallback to direct robot IP.
        // The LAN address is omitted on HTTPS: the browser would block each attempt
        // as mixed content and mark the page not secure. With 4 ports x 3 paths that
        // was 24 blocked requests per connect.
        const urlsToTry = [`ws://localhost:${port}${path}`];
        if (!secure || isLoopbackHost(localIp)) {
          urlsToTry.push(`ws://${localIp}:${port}${path}`);
        }

        for (const url of urlsToTry) {
          try {
            const ws = await tryConnect(url, 1500);
          if (ws) {
            wsRef.current = ws;
            reconnectCount.current = 0;

            setState({
              status: 'connected',
              endpoint: url,
              latencyMs: null,
              lastError: null,
            });

            // Set up event handlers
            ws.onmessage = (ev) => handleMessage(ev);
            ws.onclose = () => handleDisconnect();
            ws.onerror = () => handleDisconnect();

            // Start keepalive pings
            startPing();

            console.log(`[StackChan WS] Connected to ${url}`);
            return;
          }
        } catch {
          continue;
        }
        }
      }
    }

    // All endpoints failed.
    if (secure && !isLoopbackHost(localIp)) {
      // Not a transient failure — retrying cannot succeed from an HTTPS page, and
      // each attempt is another mixed-content warning. Stop and say why.
      setState(s => ({
        ...s,
        status: 'error',
        lastError:
          `Direct LAN control is unavailable over HTTPS (${localIp} needs ws://, which the browser blocks). ` +
          `Devices are driven through Supabase Realtime here; run the app locally to use the gateway directly.`,
      }));
      return;
    }

    setState(s => ({
      ...s,
      status: 'error',
      lastError: `Could not connect to StackChan at ${localIp}`,
    }));
    scheduleReconnect();
  }, [localIp, handleMessage]);

  /** Send a raw JSON command to the robot */
  const sendRaw = useCallback((payload: Record<string, any>): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  /** Send a face expression command */
  const setFace = useCallback((expression: string): boolean => {
    return sendRaw({
      type: 'face',
      expression: expression,
    });
  }, [sendRaw]);

  /** Send a servo movement command (pan/tilt) */
  const moveServo = useCallback((x: number, y: number): boolean => {
    return sendRaw({
      type: 'servo',
      pan: Math.max(-90, Math.min(90, x)),
      tilt: Math.max(0, Math.min(90, y)),
    });
  }, [sendRaw]);

  /** Send a TTS speech command */
  const speak = useCallback((text: string, lang: string = 'es'): boolean => {
    return sendRaw({
      type: 'tts',
      text: text,
      language: lang,
      cmd: 'say',
    });
  }, [sendRaw]);

  /** Force reconnection */
  const reconnect = useCallback(() => {
    reconnectCount.current = 0;
    connect();
  }, [connect]);

  /** Disconnect cleanly */
  const disconnect = useCallback(() => {
    stopPing();
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setState({
      status: 'disconnected',
      endpoint: null,
      latencyMs: null,
      lastError: null,
    });
  }, []);

  // Auto-connect when IP is available
  useEffect(() => {
    if (localIp) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [localIp]);

  return {
    state,
    sendRaw,
    setFace,
    moveServo,
    speak,
    reconnect,
    disconnect,
    isConnected: state.status === 'connected',
  };
}
