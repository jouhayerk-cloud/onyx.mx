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

  // Supabase Realtime wss:// Channel & Presence state (<100ms instant updates)
  private realtimeChannel: RealtimeChannel | null = null;
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
    if (this.realtimeChannel) return;

    try {
      this.realtimeChannel = supabase.channel('onyx_live_presence', {
        config: {
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
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.trackRealtimePresence();
          }
        });
    } catch (err) {
      console.warn('[PresenceService] Realtime channel setup failed:', err);
    }
  }

  /**
   * Emits instantaneous presence state over WebSockets (<100ms) to all connected devices.
   */
  public async trackRealtimePresence(): Promise<void> {
    if (!this.realtimeChannel) return;
    try {
      await this.realtimeChannel.track({
        session_id: this.sessionId,
        user_id: this.user?.id || null,
        user_email: this.user?.email || null,
        user_name: this.user?.name || null,
        device_name: this.deviceName,
        device_type: this.deviceType,
        client_platform: this.clientPlatform,
        browser: this.browser,
        current_view: this.currentView,
        last_action: this.lastAction,
        is_idle: this.isIdleState,
        last_seen_at: new Date().toISOString(),
      });
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

    // 2. Overlay instantaneous Realtime Presence states (<100ms websocket)
    for (const [key, p] of this.activeRealtimePresences.entries()) {
      const sessId = p.session_id || key;
      const existing = map.get(sessId);
      if (existing) {
        existing.current_view = p.current_view || existing.current_view;
        existing.last_action = p.last_action || existing.last_action;
        existing.is_idle = p.is_idle !== undefined ? Boolean(p.is_idle) : existing.is_idle;
        existing.last_seen_at = p.last_seen_at || existing.last_seen_at;
        if (p.user_name) existing.user_name = p.user_name;
        if (p.user_email) existing.user_email = p.user_email;
      } else {
        // Realtime session joined before DB write was committed
        map.set(sessId, {
          session_id: sessId,
          user_id: p.user_id || null,
          user_email: p.user_email || null,
          user_name: p.user_name || null,
          device_name: p.device_name || 'Onyx Node',
          device_type: p.device_type || 'desktop',
          client_platform: p.client_platform || 'Windows',
          browser: p.browser || 'App',
          ip_address: null,
          current_view: p.current_view || 'home',
          last_action: p.last_action || 'Connected via Realtime',
          is_idle: Boolean(p.is_idle),
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
      const key = `${(s.user_email || s.user_id || 'anon').toLowerCase()}::${s.device_name.toLowerCase()}::${s.client_platform.toLowerCase()}`;
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

    const payload = {
      p_session_id: this.sessionId,
      p_device_name: this.deviceName,
      p_device_type: this.deviceType,
      p_client_platform: this.clientPlatform,
      p_browser: this.browser,
      p_current_view: this.currentView,
      p_last_action: this.lastAction,
      p_is_idle: this.isIdleState,
      p_user_id: this.user?.id || null,
      p_user_email: this.user?.email || null,
      p_user_name: this.user?.name || null,
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
        // Record state locally without crashing
        this.lastPingTime = now;
        const msg = (error.message || '').toLowerCase();
        const isNotFound =
          error.code === 'PGRST202' ||
          error.code === '404' ||
          (error as any).status === 404 ||
          msg.includes('not found') ||
          msg.includes('could not find the function');

        if (isNotFound) {
          this.rpcUnavailable = true;
          console.info(
            '[PresenceService] ping_user_presence RPC is not deployed in Supabase backend (404). Falling back cleanly to pure Realtime presence channel.'
          );
          return false;
        }

        console.warn('[PresenceService] Ping failed (handled gracefully):', error.message);
        return false;
      }

      this.lastPingTime = now;
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
      this.lastPingTime = now;
      const msg = (err?.message || '').toLowerCase();
      if (err?.status === 404 || msg.includes('not found') || msg.includes('404')) {
        this.rpcUnavailable = true;
        console.info(
          '[PresenceService] ping_user_presence RPC is not deployed in Supabase backend (404). Falling back cleanly to pure Realtime presence channel.'
        );
        return false;
      }
      console.warn('[PresenceService] Network unreachable, presence saved locally:', err?.message || err);
      return false;
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
