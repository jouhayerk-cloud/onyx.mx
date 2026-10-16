/**
 * scripts/check-presence-service.ts
 *
 * Subagent ADM-T1: Database & Low-Load Presence Architect
 * Test Harness for Onyx Presence Service & Fleet Telemetry Engine.
 *
 * Verifies:
 * 1. Session ID generation and persistence
 * 2. Client platform detection (Windows, iOS, macOS, Linux, Android, Unknown)
 * 3. Device type classification (desktop, mobile, tablet, edge_relay)
 * 4. Mesh network node resolution (G7, Martha, Ramses iPhone, Edge Terminal)
 * 5. Low-load throttling logic (45s heartbeat, redundant write elimination, 5s min throttle)
 * 6. Interaction debouncing (30s) and idle state detection (3 min inactivity)
 * 7. Non-throwing graceful offline and error handling
 *
 * Run via: npx tsx scripts/check-presence-service.ts
 */

import {
  PresenceService,
  detectClientPlatform,
  detectDeviceType,
  detectBrowser,
  detectDeviceName,
  getOrCreateSessionId,
  SESSION_STORAGE_KEY,
  DEFAULT_PING_INTERVAL_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_INTERACTION_DEBOUNCE_MS,
  DEFAULT_MIN_THROTTLE_MS,
} from '../src/lib/presence/presenceService';

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    const err = `${message}: expected ${String(expected)}, got ${String(actual)}`;
    console.error(`❌ Assertion Failed: ${err}`);
    throw new Error(err);
  }
}

function assertOk(value: any, message: string): void {
  if (!value) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

console.log('─────────────────────────────────────────────────────────────────────────────');
console.log('  Onyx Low-Load Presence Service Verification Harness (ADM-T1)');
console.log('─────────────────────────────────────────────────────────────────────────────');

// ── Test 1: Session ID Generation & Storage Persistence ───────────────────────
console.log('\n[1/7] Testing Session ID Generation & Storage Persistence...');
{
  const mockStorage = new MockStorage();

  // First call should create and persist
  const sessionId1 = getOrCreateSessionId(mockStorage);
  assertOk(sessionId1 && sessionId1.length > 8, 'Generated session ID must be valid');
  assertEqual(mockStorage.getItem(SESSION_STORAGE_KEY), sessionId1, 'Session ID must be persisted in storage');

  // Second call with same storage should restore exact same ID
  const sessionId2 = getOrCreateSessionId(mockStorage);
  assertEqual(sessionId2, sessionId1, 'Subsequent call must restore existing session ID from storage');

  // Fallback without storage
  const fallbackId = getOrCreateSessionId(null);
  assertOk(fallbackId && fallbackId.length > 8, 'Fallback generation without storage must succeed');
  console.log('  ✓ Session ID generation, restoration, and fallback passed.');
}

// ── Test 2: Client Platform Detection ─────────────────────────────────────────
console.log('\n[2/7] Testing Client Platform Detection...');
{
  // Windows
  const winUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  assertEqual(detectClientPlatform(winUA, 'Win32'), 'Windows', 'Should detect Windows');

  // iOS iPhone
  const iphoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assertEqual(detectClientPlatform(iphoneUA, 'iPhone'), 'iOS', 'Should detect iOS Phone');

  // iOS iPad (iPadOS reporting MacIntel with touchpoints)
  const ipadUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  assertEqual(detectClientPlatform(ipadUA, 'MacIntel', 5), 'iOS', 'Should detect iPadOS as iOS');

  // macOS
  const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  assertEqual(detectClientPlatform(macUA, 'MacIntel', 0), 'macOS', 'Should detect macOS');

  // Android
  const androidUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
  assertEqual(detectClientPlatform(androidUA, 'Linux armv8l'), 'Android', 'Should detect Android');

  // Linux
  const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
  assertEqual(detectClientPlatform(linuxUA, 'Linux x86_64'), 'Linux', 'Should detect Linux');

  // Unknown
  assertEqual(detectClientPlatform('', ''), 'Unknown', 'Should default to Unknown');
  console.log('  ✓ Client platform detection for all target platforms passed.');
}

// ── Test 3: Device Type Classification ───────────────────────────────────────
console.log('\n[3/7] Testing Device Type Classification...');
{
  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0';
  assertEqual(detectDeviceType(desktopUA, 'Win32', 1920), 'desktop', 'Standard desktop screen should be desktop');

  const iphoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148';
  assertEqual(detectDeviceType(iphoneUA, 'iPhone', 393), 'mobile', 'iPhone should be mobile');

  const ipadUA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
  assertEqual(detectDeviceType(ipadUA, 'iPad', 820, 5), 'tablet', 'iPad should be tablet');

  const edgeUA = 'Onyx-Edge-Relay/1.0 (Headless Linux)';
  assertEqual(detectDeviceType(edgeUA, 'Linux', 800), 'edge_relay', 'Edge relay should be classified as edge_relay');
  console.log('  ✓ Device type classification (desktop, mobile, tablet, edge_relay) passed.');
}

// ── Test 4: G7 Mesh Network Node Resolution ──────────────────────────────────
console.log('\n[4/7] Testing Mesh Network Device Name Resolution...');
{
  // G7 Host: 192.0.2.71
  const g7Name = detectDeviceName({
    hostname: '192.0.2.71',
    platform: 'Windows',
    deviceType: 'desktop',
  });
  assertEqual(g7Name, 'G7 Laptop', '192.0.2.71 on Windows must resolve to G7 Laptop');

  // Second Relay Node: 192.0.2.67
  const secondName = detectDeviceName({
    hostname: '192.0.2.67',
    platform: 'Windows',
    deviceType: 'desktop',
  });
  assertEqual(secondName, "Second Laptop", "192.0.2.67 must resolve to Second Laptop");

  // Ramses iPhone: 192.0.2.100 or iOS Mobile
  const phoneName = detectDeviceName({
    hostname: '192.0.2.100',
    platform: 'iOS',
    deviceType: 'mobile',
  });
  assertEqual(phoneName, 'Ramses iPhone', '192.0.2.100 or iOS mobile must resolve to Ramses iPhone');

  // Edge Terminal
  const edgeName = detectDeviceName({
    hostname: 'edge-terminal-01.lan',
    deviceType: 'edge_relay',
  });
  assertEqual(edgeName, 'Edge Terminal', 'Edge hostname or type must resolve to Edge Terminal');

  // Custom User Override in storage
  const mockStorage = new MockStorage();
  mockStorage.setItem('onyx_device_name', 'Workshop Laser PC');
  const customName = detectDeviceName({
    hostname: '192.0.2.71',
    platform: 'Windows',
    storage: mockStorage,
  });
  assertEqual(customName, 'Workshop Laser PC', 'Custom storage name must override automatic detection');
  console.log('  ✓ Mesh network node and custom name resolution passed.');
}

// ── Test 5: Idle Calculation & Interaction Debouncing ─────────────────────────
console.log('\n[5/7] Testing Idle Calculation & Interaction Debouncing...');
{
  const service = new PresenceService({
    sessionId: 'test_session_idle',
    idleTimeoutMs: 180_000,
    interactionDebounceMs: 30_000,
  });

  const t0 = 1_000_000_000;
  (service as any).lastInteractionTime = t0;

  // Initially not idle
  assertEqual(service.isIdle(), false, 'Initially not idle');

  // After 60 seconds of no input -> still active (< 180s)
  service.checkIdleState(t0 + 60_000);
  assertEqual(service.isIdle(), false, 'Should remain active after 60 seconds');

  // After 181 seconds of no input -> should transition to idle (>= 180s)
  service.checkIdleState(t0 + 181_000);
  assertEqual(service.isIdle(), true, 'Should be idle after 181 seconds of inactivity');
  assertEqual(service.getLastAction(), 'Idle', 'Action should reflect Idle status');

  // User performs interaction -> should immediately revert to active
  service.recordUserAction('User tapped button');
  assertEqual(service.isIdle(), false, 'Interaction must clear idle state immediately');
  assertEqual(service.getLastAction(), 'User tapped button', 'Action must update to user action');
  console.log('  ✓ Idle calculation (180s threshold) and instant active wake passed.');
}

// ── Test 6: Low-Load Ping Throttling & Redundant DB Write Elimination ────────
console.log('\n[6/7] Testing Ping Throttling & Redundant DB Write Elimination...');
{
  const service = new PresenceService({
    sessionId: 'test_session_throttle',
    pingIntervalMs: DEFAULT_PING_INTERVAL_MS,       // 45s
    minThrottleMs: DEFAULT_MIN_THROTTLE_MS,         // 5s
  });

  const t0 = 2_000_000_000;
  (service as any).lastInteractionTime = t0;

  // 1. Initial force ping -> must be allowed
  assertEqual(service.shouldSendPing(t0, true), true, 'Force ping must always return true');

  // Simulate successful ping at t0
  (service as any).lastPingTime = t0;
  (service as any).lastSyncedHash = (service as any).currentView + '::' + (service as any).lastAction + '::active::anon';

  // 2. Immediate check 1 second later with NO state change -> MUST SKIP DB WRITE
  assertEqual(service.shouldSendPing(t0 + 1_000, false), false, 'Immediate ping with unchanged state must skip DB write');

  // 3. Check 20 seconds later with NO state change (< 45s) -> MUST SKIP DB WRITE
  assertEqual(service.shouldSendPing(t0 + 20_000, false), false, 'Ping before 45s interval with unchanged state must skip DB write');

  // 4. Check 46 seconds later with NO state change (>= 45s) -> MUST EMIT HEARTBEAT PING
  assertEqual(service.shouldSendPing(t0 + 46_000, false), true, 'Ping after 45s interval must emit heartbeat ping');

  // 5. State change: User changes view at t0 + 10s (elapsed > 5s min throttle) -> MUST EMIT PING
  service.setContext({ currentView: 'inventory' });
  assertEqual(service.shouldSendPing(t0 + 10_000, false), true, 'View change after min throttle must emit ping');

  // 6. Rapid consecutive state change 2s later (< 5s min throttle) -> MUST THROTTLE
  (service as any).lastPingTime = t0 + 10_000;
  (service as any).lastSyncedHash = 'inventory::Navigated to inventory::active::anon';
  service.setContext({ currentView: 'logistics' });
  assertEqual(service.shouldSendPing(t0 + 12_000, false), false, 'Rapid state changes within 5s min throttle must be delayed');

  console.log('  ✓ 45s heartbeat, unchanged state DB-skip, and 5s min throttle verified.');
}

// ── Test 7: Service Lifecycle & Non-Crashing Offline Execution ────────────────
console.log('\n[7/7] Testing Service Lifecycle & Graceful Offline Behavior...');
{
  const service = new PresenceService({
    sessionId: 'test_session_offline',
  });

  // Start heartbeat
  service.startPresenceHeartbeat({
    currentView: 'dashboard',
    user: { id: 'usr_mock_123', email: 'ramses@onyx.mx', name: 'Ramses' },
  });

  assertEqual(service.getCurrentView(), 'dashboard', 'Current view should be dashboard');
  assertEqual(service.getUser()?.email, 'ramses@onyx.mx', 'User email should match');

  // sendPresencePing should handle offline or mock supabase gracefully without throwing
  let threwException = false;
  try {
    const resultPromise = service.sendPresencePing(true);
    assertOk(resultPromise instanceof Promise, 'sendPresencePing must return a Promise');
  } catch {
    threwException = true;
  }
  assertEqual(threwException, false, 'sendPresencePing must never throw uncaught exceptions');

  // Stop heartbeat
  service.stopPresenceHeartbeat();
  console.log('  ✓ Service lifecycle and exception shielding verified.');
}

console.log('\n=============================================================================');
console.log('  ALL PRESENCE SERVICE TESTS PASSED SUCCESSFULLY (0 ERRORS)');
console.log('=============================================================================\n');
