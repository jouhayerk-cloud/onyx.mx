/**
 * src/lib/presence/presenceService.ts
 *
 * Subagent ADM-T1: Database & Low-Load Presence Architect
 *
 * Lightweight, resilient presence service for Onyx-mx device fleet.
 * Features:
 * - Persistent session tracking via sessionStorage with crypto fallback
 * - Device platform, browser, and mesh network node detection (G7, Martha, Ramses iPhone, Edge)
 * - Throttled ping engine (45s interval, 30s interaction debounce, 3min idle threshold)
 * - Zero DB writes when state is unchanged and interval has not elapsed
 * - Non-crashing offline & fallback handling
 *
 * Privacy: the Realtime presence channel is PUBLIC (anyone holding the anon key can join it), so it only
 * carries the session_id plus non-identifying liveness fields (device_type, last_seen_at). Identities
 * (email, name, IP, device, current view) live in the RLS-protected user_active_sessions table, written by
 * the ping_user_presence RPC and read back by Developer/Admin only.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'edge_relay';
export type ClientPlatform = 'Windows' | 'iOS' | 'macOS' | 'Linux' | 'Android' | 'Unknown';

export interface UserActiveSession {
  session_id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  device_name: string;
  device_type: DeviceType;
  client_platform: ClientPlatform;
  browser: string;
  ip_address: string | null;
  current_view: string;
  last_action: string;
  is_idle: boolean;
  last_seen_at: string;
  created_at: string;
}

/** The only fields ever broadcast on the public presence channel. */
export interface PublicPresencePayload {
  session_id: string;
  device_type: DeviceType;
  last_seen_at: string;
}

export interface PresenceUserInfo {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface PresenceServiceConfig {
  sessionId?: string;
  pingIntervalMs?: number;
  idleTimeoutMs?: number;
  interactionDebounceMs?: number;
  minThrottleMs?: number;
  storage?: Storage | null;
}

export const SESSION_STORAGE_KEY = 'onyx_presence_session_id';
export const DEFAULT_PING_INTERVAL_MS = 45_000;       // 45 seconds while active for low-load fleet telemetry
export const DEFAULT_INTERACTION_DEBOUNCE_MS = 30_000; // 30 seconds debounce for interaction actions
export const MAX_PING_BACKOFF_MS = 5 * 60_000;         // failed pings back off exponentially up to 5 minutes
export const DEFAULT_IDLE_TIMEOUT_MS = 180_000;       // 3 minutes (180s) of inactivity -> Idle
export const DEFAULT_MIN_THROTTLE_MS = 5_000;         // Minimum 5 seconds between state change pings

/**
 * Generates or retrieves a persistent session ID.
 * Prefers localStorage so multiple tabs on the same hardware browser share one node session.
 */
export function getOrCreateSessionId(customStorage?: Storage | null): string {
  try {
    let storage: Storage | null = null;
    if (customStorage !== undefined) {
      storage = customStorage;
    } else if (typeof window !== 'undefined') {
      try {
        storage = window.localStorage || window.sessionStorage;
      } catch {
        storage = window.sessionStorage || null;
      }
    }

    if (storage) {
      const existing = storage.getItem(SESSION_STORAGE_KEY);
      if (existing && existing.trim().length > 0) {
        return existing.trim();
      }
    }

    let newId: string;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      newId = crypto.randomUUID();
    } else {
      newId = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    }

    if (storage) {
      storage.setItem(SESSION_STORAGE_KEY, newId);
    }
    return newId;
  } catch {
    return `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }
}

/**
 * Detects client OS / platform.
 */
export function detectClientPlatform(
  customUserAgent?: string,
  customPlatform?: string,
  maxTouchPoints?: number
): ClientPlatform {
  const ua = customUserAgent !== undefined
    ? customUserAgent
    : (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');
  const plat = customPlatform !== undefined
    ? customPlatform
    : (typeof navigator !== 'undefined' ? ((navigator as any).platform || '') : '');
  const touches = maxTouchPoints !== undefined
    ? maxTouchPoints
    : (typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0);

  // iOS detection (including iPadOS reporting as MacIntel with touchpoints)
  if (/iPad|iPhone|iPod/.test(ua) || (plat === 'MacIntel' && touches > 1)) {
    return 'iOS';
  }

  // Android
  if (/Android/.test(ua)) {
    return 'Android';
  }

  // Windows
  if (/Windows|Win32|Win64|WOW64/.test(ua) || /Win/.test(plat)) {
    return 'Windows';
  }

  // macOS
  if (/Macintosh|Mac OS X/.test(ua) || /Mac/.test(plat)) {
    return 'macOS';
  }

  // Linux
  if (/Linux/.test(ua) || /Linux/.test(plat)) {
    return 'Linux';
  }

  return 'Unknown';
}

/**
 * Detects device form factor.
 */
export function detectDeviceType(
  customUserAgent?: string,
  customPlatform?: string,
  screenWidth?: number,
  maxTouchPoints?: number
): DeviceType {
  const ua = customUserAgent !== undefined
    ? customUserAgent
    : (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');
  const plat = customPlatform !== undefined
    ? customPlatform
    : (typeof navigator !== 'undefined' ? ((navigator as any).platform || '') : '');
  const width = screenWidth !== undefined
    ? screenWidth
    : (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024);
  const touches = maxTouchPoints !== undefined
    ? maxTouchPoints
    : (typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0);

  // Check for edge relay or headless terminal signals
  if (/edge-relay|onyx-edge|onyx-terminal/i.test(ua)) {
    return 'edge_relay';
  }

  // Tablets: iPads, Android tablets, touchscreens between 600px and 1366px
  const isIPad = /iPad/.test(ua) || (plat === 'MacIntel' && touches > 1);
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
  if (isIPad || isAndroidTablet || (touches > 1 && width >= 600 && width <= 1180)) {
    return 'tablet';
  }

  // Mobile Phones: iPhones, Android phones, narrow screens
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua)) || width < 600) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Detects client browser brand.
 */
export function detectBrowser(customUserAgent?: string): string {
  const ua = customUserAgent !== undefined
    ? customUserAgent
    : (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '');

  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  return 'Browser';
}

/**
 * Detects device friendly name, resolving known nodes from the G7 Local Network Mesh Map:
 * - 192.0.2.71 -> "G7 Laptop"
 * - 192.0.2.67 -> "Second Laptop"
 * - 192.0.2.100 -> "Ramses iPhone"
 * - Edge relays / terminals -> "Edge Terminal"
 */
export function detectDeviceName(options?: {
  hostname?: string;
  platform?: ClientPlatform;
  deviceType?: DeviceType;
  userAgent?: string;
  storage?: Storage | null;
}): string {
  const host = (options?.hostname !== undefined
    ? options.hostname
    : (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();

  const platform = options?.platform ?? detectClientPlatform(options?.userAgent);
  const deviceType = options?.deviceType ?? detectDeviceType(options?.userAgent);

  // Check for user-configured persistent override in localStorage
  try {
    const store = options?.storage !== undefined ? options.storage : (typeof window !== 'undefined' ? window.localStorage : null);
    const customName = store?.getItem('onyx_device_name');
    if (customName && customName.trim().length > 0) {
      return customName.trim();
    }
  } catch {
    // Ignore storage errors
  }

  // Mesh Network Map IP / Hostname resolution
  if (host === '192.0.2.67' || host.includes('martha')) {
    return "Second Laptop";
  }

  if (host === '192.0.2.100' || (platform === 'iOS' && deviceType === 'mobile')) {
    return "Ramses iPhone";
  }

  if (host.includes('edge') || host.includes('relay') || deviceType === 'edge_relay') {
    return 'Edge Terminal';
  }

  if (host === '192.0.2.71' || host === 'localhost' || host === '127.0.0.1' || host.includes('g7')) {
    if (platform === 'Windows') {
      return 'G7 Laptop';
    }
    if (platform === 'iOS') {
      return "Ramses iPhone";
    }
  }

  // Descriptive device fallbacks
  switch (platform) {
    case 'Windows':
      return 'G7 Laptop';
    case 'iOS':
      return deviceType === 'tablet' ? "Ramses iPad" : "Ramses iPhone";
    case 'macOS':
      return "Second Laptop";
    case 'Android':
      return deviceType === 'tablet' ? 'Android Tablet' : 'Android Phone';
    case 'Linux':
      return 'Linux Workstation';
    default:
      return 'Onyx Terminal';
  }
}

/**
 * Computes deterministic hash to detect state changes.
 */
function computeStateHash(view: string, action: string, isIdle: boolean, userId: string | null): string {
  return `${view}::${action}::${isIdle ? 'idle' : 'active'}::${userId ?? 'anon'}`;
}

/**
 * PresenceService singleton class managing low-load client telemetry and presence heartbeats.
 */
export class PresenceService {
  private sessionId: string;
  private clientPlatform: ClientPlatform;
  private deviceType: DeviceType;
  private browser: string;
  private deviceName: string;

  private pingIntervalMs: number;
  private idleTimeoutMs: number;
  private interactionDebounceMs: number;
  private minThrottleMs: number;

  private currentView: string = 'welcome';
  private lastAction: string = 'Session initialized';
  private user: PresenceUserInfo | null = null;

  private lastInteractionTime: number = Date.now();
  private lastDebouncedInteractionTime: number = 0;
  private lastPingTime: number = 0;
  private lastSyncedHash: string = '';
  private isIdleState: boolean = false;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private interactionListenersBound: boolean = false;
  private boundInteractionHandler: (() => void) | null = null;

  private cachedSessions: UserActiveSession[] = [];
  private isOffline: boolean = false;
  private rpcUnavailable: boolean = false;
  private pingFailures: number = 0;
  private nextPingAllowedAt: number = 0;

  // Supabase Realtime wss:// Channel & Presence state (<100ms instant updates)
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeUnauthorized: boolean = false;
  private fleetListeners = new Set<(sessions: UserActiveSession[]) => void>();
  private activeRealtimePresences = new Map<string, any>();
  private activeDbSessions = new Map<string, UserActiveSession>();
  private heartbeatRefCount: number = 0;

  constructor(config?: PresenceServiceConfig) {
    this.sessionId = config?.sessionId ?? getOrCreateSessionId(config?.storage);
    this.clientPlatform = detectClientPlatform();
    this.deviceType = detectDeviceType();
    this.browser = detectBrowser();
    this.deviceName = detectDeviceName({
      platform: this.clientPlatform,
      deviceType: this.deviceType,
      storage: config?.storage,
    });

    this.pingIntervalMs = config?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.idleTimeoutMs = config?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.interactionDebounceMs = config?.interactionDebounceMs ?? DEFAULT_INTERACTION_DEBOUNCE_MS;
    this.minThrottleMs = config?.minThrottleMs ?? DEFAULT_MIN_THROTTLE_MS;
  }

  // ── Accessors & Configuration ───────────────────────────────────────────────

  public getSessionId(): string {
    return this.sessionId;
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  public setDeviceName(name: string): void {
    this.deviceName = name;
  }

  public getDeviceType(): DeviceType {
    return this.deviceType;
  }

  public getClientPlatform(): ClientPlatform {
    return this.clientPlatform;
  }

  public getBrowser(): string {
    return this.browser;
  }

  public getCurrentView(): string {
    return this.currentView;
  }

  public getLastAction(): string {
    return this.lastAction;
  }

  public isIdle(): boolean {
    return this.isIdleState;
  }

  public getUser(): PresenceUserInfo | null {
    return this.user;
  }

  public getLastPingTime(): number {
    return this.lastPingTime;
  }

  /**
   * Initializes the Supabase Realtime channel for instant presence tracking and DB changes.
   */
  public initRealtimeChannel(): void {
    if (this.realtimeChannel || this.realtimeUnauthorized) return;

    try {
      // Private channel: RLS policies on realtime.messages allow Developer/Admin only.
      this.realtimeChannel = supabase.channel('onyx_live_presence', {
        config: {
          private: true,
          presence: { key: this.sessionId },
        },
      });

      this.realtimeChannel
        .on('presence', { event: 'sync' }, () => {
          this.syncRealtimePresenceState();
        })
        .on('presence', { event: 'join' }, () => {
          this.syncRealtimePresenceState();
        })
        .on('presence', { event: 'leave' }, () => {
          this.syncRealtimePresenceState();
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_active_sessions' },
          (payload: any) => {
            this.handleDbSessionChange(payload);
          }
        )
        .subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            await this.trackRealtimePresence();
          } else if (
            status === 'CHANNEL_ERROR' ||
            String(status).toLowerCase().includes('unauthorized') ||
            Boolean(err && /unauthorized/i.test(err.message || String(err)))
          ) {
            if (!this.realtimeUnauthorized) {
              this.realtimeUnauthorized = true;
              console.warn(
                '[PresenceService] Realtime presence unauthorized or channel error; stopped retrying.'
              );
            }
            if (this.realtimeChannel) {
              const channel = this.realtimeChannel;
              this.realtimeChannel = null;
              void supabase.removeChannel(channel);
            }
          }
        });
    } catch (err) {
      console.warn('[PresenceService] Realtime channel setup failed:', err);
    }
  }

  /**
   * Emits instantaneous presence over WebSockets. The channel is public, so the payload is limited to the
   * session id and non-identifying liveness fields; identities are read from user_active_sessions (RLS).
   */
  public async trackRealtimePresence(): Promise<void> {
    if (!this.realtimeChannel) return;
    try {
      const payload: PublicPresencePayload = {
        session_id: this.sessionId,
        device_type: this.deviceType,
        last_seen_at: new Date().toISOString(),
      };
      await this.realtimeChannel.track(payload);
    } catch (err) {
      console.warn('[PresenceService] Realtime presence track error:', err);
    }
  }

  private syncRealtimePresenceState(): void {
    if (!this.realtimeChannel) return;
    const state = this.realtimeChannel.presenceState();
    this.activeRealtimePresences.clear();

    for (const [key, presences] of Object.entries(state)) {
      if (Array.isArray(presences) && presences.length > 0) {
        const latest = presences[presences.length - 1] as any;
        this.activeRealtimePresences.set(key, latest);
      }
    }

    this.recomputeMergedFleet();
  }

  private handleDbSessionChange(payload: any): void {
    const { eventType, new: newRec, old: oldRec } = payload;
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newRec && newRec.session_id) {
        this.activeDbSessions.set(newRec.session_id, newRec as UserActiveSession);
      }
    } else if (eventType === 'DELETE') {
      if (oldRec && oldRec.session_id) {
        this.activeDbSessions.delete(oldRec.session_id);
      }
    }
    this.recomputeMergedFleet();
  }

  private recomputeMergedFleet(): void {
    const map = new Map<string, UserActiveSession>();

    // 1. Fill from known DB sessions
    for (const [id, sess] of this.activeDbSessions.entries()) {
      map.set(id, { ...sess });
    }

    // 2. Overlay instantaneous Realtime Presence (session_id, device_type, last_seen_at only: the channel is public).
    //    Identity, view and IP always come from the RLS-protected DB rows above.
    for (const [key, p] of this.activeRealtimePresences.entries()) {
      const sessId = typeof p.session_id === 'string' && p.session_id ? p.session_id : key;
      const existing = map.get(sessId);
      if (existing) {
        existing.last_seen_at = p.last_seen_at || existing.last_seen_at;
      } else {
        // Live session with no readable DB row (not written yet, ping RPC missing, or hidden by RLS): count it, unidentified.
        const deviceType: DeviceType = ['desktop', 'mobile', 'tablet', 'edge_relay'].includes(p.device_type)
          ? p.device_type
          : 'desktop';
        map.set(sessId, {
          session_id: sessId,
          user_id: null,
          user_email: null,
          user_name: null,
          device_name: 'Onyx Node',
          device_type: deviceType,
          client_platform: 'Unknown',
          browser: 'App',
          ip_address: null,
          current_view: '',
          last_action: 'Connected via Realtime',
          is_idle: false,
          last_seen_at: p.last_seen_at || new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    }

    // Filter out stale sessions older than 10 minutes unless currently in realtime presence
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const activeList = Array.from(map.values()).filter(s => {
      if (this.activeRealtimePresences.has(s.session_id)) return true;
      const seenTime = Date.parse(s.last_seen_at);
      return !Number.isNaN(seenTime) && seenTime >= tenMinAgo;
    });

    // Deduplicate by physical hardware node: (user, device_name, client_platform)
    // Multiple tabs or previous session IDs from the same device collapse into 1 card
    const deviceMap = new Map<string, UserActiveSession>();
    for (const s of activeList) {
      // Unidentified (realtime-only) sessions never merge: each one is its own live session.
      const who = s.user_email || s.user_id;
      const key = who
        ? `${who.toLowerCase()}::${s.device_name.toLowerCase()}::${s.client_platform.toLowerCase()}`
        : `session::${s.session_id}`;
      const existing = deviceMap.get(key);
      if (!existing) {
        deviceMap.set(key, s);
      } else {
        const existingTime = Date.parse(existing.last_seen_at) || 0;
        const newTime = Date.parse(s.last_seen_at) || 0;
        const isSelf = s.session_id === this.sessionId || existing.session_id === this.sessionId;
        if (newTime >= existingTime) {
          deviceMap.set(key, {
            ...s,
            session_id: isSelf ? this.sessionId : s.session_id,
          });
        } else if (isSelf) {
          existing.session_id = this.sessionId;
        }
      }
    }

    const list = Array.from(deviceMap.values());
    list.sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at));
    this.cachedSessions = list;
    this.fleetListeners.forEach(cb => cb(this.cachedSessions));
  }

  /**
   * Subscribes to live fleet presence changes from both DB and WebSockets.
   */
  public subscribeToFleet(cb: (sessions: UserActiveSession[]) => void): () => void {
    this.fleetListeners.add(cb);
    cb(this.cachedSessions);
    return () => this.fleetListeners.delete(cb);
  }

  /**
   * Updates context (current active view and/or user).
   */
  public setContext(context: { user?: PresenceUserInfo | null; currentView?: string }): void {
    let changed = false;

    if (context.currentView !== undefined && context.currentView !== this.currentView) {
      this.currentView = context.currentView;
      this.lastAction = `Navigated to ${context.currentView}`;
      changed = true;
    }

    if (context.user !== undefined) {
      const prevId = this.user?.id;
      const nextId = context.user?.id;
      if (prevId !== nextId) {
        this.user = context.user;
        changed = true;
      } else {
        this.user = context.user;
      }
    }

    if (changed) {
      void this.trackRealtimePresence();
      if (this.heartbeatTimer) {
        // Trigger an immediate presence ping to announce view/user change instantly
        void this.sendPresencePing(true);
      }
    }
  }

  /**
   * Records a user interaction or significant action.
   */
  public recordUserAction(action: string): void {
    const now = Date.now();
    this.lastInteractionTime = now;
    this.lastAction = action;

    if (this.isIdleState) {
      this.isIdleState = false;
    }

    void this.trackRealtimePresence();
    if (this.heartbeatTimer) {
      void this.sendPresencePing(false);
    }
  }

  // ── Interaction & Idle Detection ───────────────────────────────────────────

  private handleUserInteraction = (): void => {
    const now = Date.now();
    this.lastInteractionTime = now;

    // Transition back from idle immediately if input occurs
    if (this.isIdleState) {
      this.isIdleState = false;
      this.lastAction = 'User active';
      this.lastDebouncedInteractionTime = now;
      void this.trackRealtimePresence();
      if (this.heartbeatTimer) {
        void this.sendPresencePing(false);
      }
      return;
    }

    // Debounce non-state changing interaction recordings to 15s
    if (now - this.lastDebouncedInteractionTime >= this.interactionDebounceMs) {
      this.lastDebouncedInteractionTime = now;
    }
  };

  public checkIdleState(now = Date.now()): boolean {
    const wasIdle = this.isIdleState;
    const isNowIdle = (now - this.lastInteractionTime) >= this.idleTimeoutMs;

    if (isNowIdle !== wasIdle) {
      this.isIdleState = isNowIdle;
      if (isNowIdle) {
        this.lastAction = 'Idle';
      } else {
        this.lastAction = 'Active';
      }
      void this.trackRealtimePresence();
      return true; // Idle state changed
    }

    return false;
  }

  // ── Throttled Presence Engine ──────────────────────────────────────────────

  /**
   * Determines whether a ping needs to be emitted to Supabase.
   * Skips DB write if state hasn't changed and interval hasn't elapsed.
   */
  public shouldSendPing(now = Date.now(), force = false): boolean {
    // After failures, even forced pings wait for the backoff window (no request storm, no console flood)
    if (now < this.nextPingAllowedAt) return false;

    if (force) return true;

    // Minimum throttle protection: do not ping more frequently than minThrottleMs
    if (now - this.lastPingTime < this.minThrottleMs) {
      return false;
    }

    const currentHash = computeStateHash(
      this.currentView,
      this.lastAction,
      this.isIdleState,
      this.user?.id ?? null
    );

    const stateChanged = currentHash !== this.lastSyncedHash;
    const intervalElapsed = (now - this.lastPingTime) >= this.pingIntervalMs;

    // Send ping if interval elapsed or state meaningfully changed
    return intervalElapsed || stateChanged;
  }

  /**
   * Emits a presence ping to the Supabase RPC `ping_user_presence`.
   * Never throws errors; catches network/offline failures gracefully.
   */
  public async sendPresencePing(force = false): Promise<boolean> {
    if (this.rpcUnavailable) {
      return false;
    }

    const now = Date.now();
    this.checkIdleState(now);

    if (!this.shouldSendPing(now, force)) {
      return false;
    }

    // Identity is never sent: the RPC resolves user, email and name from the caller's JWT, so a client cannot
    // claim to be someone else. Current view and last action stay in the RLS-protected table.
    const payload = {
      p_session_id: this.sessionId,
      p_device_name: this.deviceName,
      p_device_type: this.deviceType,
      p_client_platform: this.clientPlatform,
      p_browser: this.browser,
      p_current_view: this.currentView,
      p_last_action: this.lastAction,
      p_is_idle: this.isIdleState,
    };

    try {
      // In browser, check navigator.onLine before firing
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.isOffline = true;
        this.lastPingTime = now;
        return false;
      }

      const { error } = await (supabase as any).rpc('ping_user_presence', payload);

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const isNotFound =
          error.code === 'PGRST202' ||
          error.code === '404' ||
          (error as any).status === 404 ||
          msg.includes('not found') ||
          msg.includes('could not find the function');

        if (isNotFound) {
          this.lastPingTime = now;
          this.rpcUnavailable = true;
          console.info(
            '[PresenceService] ping_user_presence RPC is not deployed in Supabase backend (404). Falling back cleanly to pure Realtime presence channel.'
          );
          return false;
        }

        this.registerPingFailure(now, error.message);
        return false;
      }

      this.lastPingTime = now;
      if (this.pingFailures > 0) {
        console.info('[PresenceService] Presence ping recovered.');
      }
      this.pingFailures = 0;
      this.nextPingAllowedAt = 0;
      this.lastSyncedHash = computeStateHash(
        this.currentView,
        this.lastAction,
        this.isIdleState,
        this.user?.id ?? null
      );
      this.isOffline = false;
      return true;
    } catch (err: any) {
      // Offline or network error
      this.isOffline = true;
      const msg = (err?.message || '').toLowerCase();
      if (err?.status === 404 || msg.includes('not found') || msg.includes('404')) {
        this.lastPingTime = now;
        this.rpcUnavailable = true;
        console.info(
          '[PresenceService] ping_user_presence RPC is not deployed in Supabase backend (404). Falling back cleanly to pure Realtime presence channel.'
        );
        return false;
      }
      this.registerPingFailure(now, err?.message || String(err));
      return false;
    }
  }

  /**
   * Records a failed ping: exponential backoff (ping interval x 2^n, capped), and a single console line for the
   * whole failure streak so a missing RPC, a denied call or a dead network cannot flood the console.
   */
  private registerPingFailure(now: number, message: string): void {
    this.lastPingTime = now;
    this.pingFailures++;
    const wait = Math.min(this.pingIntervalMs * 2 ** this.pingFailures, MAX_PING_BACKOFF_MS);
    this.nextPingAllowedAt = now + wait;
    if (this.pingFailures === 1) {
      console.warn('[PresenceService] Ping failed, retrying with backoff (handled gracefully):', message);
    }
  }

  // ── Heartbeat Lifecycle ────────────────────────────────────────────────────

  /**
   * Starts background presence heartbeat, attaches DOM listeners, and engages Realtime presence.
   */
  public startPresenceHeartbeat(options?: {
    user?: PresenceUserInfo | null;
    currentView?: string;
    pingIntervalMs?: number;
  }): void {
    if (options?.user !== undefined) this.user = options.user;
    if (options?.currentView !== undefined) this.currentView = options.currentView;
    if (options?.pingIntervalMs !== undefined) this.pingIntervalMs = options.pingIntervalMs;

    this.initRealtimeChannel();
    this.attachInteractionListeners();
    this.heartbeatRefCount++;

    if (this.heartbeatTimer) {
      void this.trackRealtimePresence();
      void this.sendPresencePing(true);
      return;
    }

    // Send immediate initial presence ping
    void this.trackRealtimePresence();
    void this.sendPresencePing(true);

    // Ticker runs every 3 seconds to inspect idle status and fire pings on schedule
    this.heartbeatTimer = setInterval(() => {
      const idleChanged = this.checkIdleState();
      if (idleChanged || this.shouldSendPing()) {
        void this.sendPresencePing(false);
      }
    }, 3_000);
  }

  /**
   * Stops background heartbeat and tears down listeners when all consumers have unmounted.
   */
  public stopPresenceHeartbeat(force = false): void {
    this.heartbeatRefCount = Math.max(0, this.heartbeatRefCount - 1);
    if (force || this.heartbeatRefCount === 0) {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.detachInteractionListeners();
      if (this.realtimeChannel) {
        void this.realtimeChannel.untrack();
      }
    }
  }

  private attachInteractionListeners(): void {
    if (this.interactionListenersBound || typeof window === 'undefined') return;

    this.boundInteractionHandler = () => this.handleUserInteraction();
    const opts = { passive: true };

    window.addEventListener('mousemove', this.boundInteractionHandler, opts);
    window.addEventListener('pointerdown', this.boundInteractionHandler, opts);
    window.addEventListener('keydown', this.boundInteractionHandler, opts);
    window.addEventListener('scroll', this.boundInteractionHandler, opts);
    window.addEventListener('touchstart', this.boundInteractionHandler, opts);

    this.interactionListenersBound = true;
  }

  private detachInteractionListeners(): void {
    if (!this.interactionListenersBound || typeof window === 'undefined' || !this.boundInteractionHandler) return;

    window.removeEventListener('mousemove', this.boundInteractionHandler);
    window.removeEventListener('pointerdown', this.boundInteractionHandler);
    window.removeEventListener('keydown', this.boundInteractionHandler);
    window.removeEventListener('scroll', this.boundInteractionHandler);
    window.removeEventListener('touchstart', this.boundInteractionHandler);

    this.interactionListenersBound = false;
    this.boundInteractionHandler = null;
  }

  // ── Fleet Queries ──────────────────────────────────────────────────────────

  /**
   * Queries active sessions seen within the last 10 minutes and merges with instant Realtime Presence state.
   */
  public async getActiveSessions(): Promise<UserActiveSession[]> {
    this.initRealtimeChannel();
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from('user_active_sessions')
        .select('*')
        .gt('last_seen_at', tenMinutesAgo)
        .order('last_seen_at', { ascending: false });

      if (error) {
        if (error.code !== '42P01' && !error.message?.includes('does not exist')) {
          console.warn('[PresenceService] Error fetching active sessions from DB:', error.message);
        }
        return this.cachedSessions;
      }

      const dbRows = (data as UserActiveSession[]) || [];
      this.activeDbSessions.clear();
      for (const row of dbRows) {
        this.activeDbSessions.set(row.session_id, row);
      }

      this.recomputeMergedFleet();
      return this.cachedSessions;
    } catch (err: any) {
      console.warn('[PresenceService] Exception querying active sessions:', err?.message || err);
      return this.cachedSessions;
    }
  }
}

// Export singleton instance
export const presenceService = new PresenceService();
