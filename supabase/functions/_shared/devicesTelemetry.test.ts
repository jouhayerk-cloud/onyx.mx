import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  ONYX_DATA_TOOLS,
  DEVICE_TELEMETRY_ROLES,
  TELEMETRY_SELECT_COLUMNS,
  isRoleAllowed,
  authorizeTelemetryRole,
  validateTelemetryArgs,
  shapeTelemetryRow,
  shapeTelemetryResult,
} from "./onyxDataTools.ts";

// ── Backlog Item 1: devices_onyxchan_telemetry Tool Registration ────────────

Deno.test("devices_onyxchan_telemetry is registered in ONYX_DATA_TOOLS with correct schema", () => {
  const tool = ONYX_DATA_TOOLS.find((t) => t.name === "devices_onyxchan_telemetry");
  assert(tool !== undefined, "devices_onyxchan_telemetry tool must be registered");
  assertEquals(tool.name, "devices_onyxchan_telemetry");
  assertEquals(tool.requiredRoles, DEVICE_TELEMETRY_ROLES);

  const schema = tool.inputSchema as {
    type: string;
    properties: Record<string, { type: string; maxLength?: number; minimum?: number; maximum?: number; default?: number }>;
  };
  assertEquals(schema.type, "object");
  assertEquals(schema.properties.device_id.type, "string");
  assertEquals(schema.properties.device_id.maxLength, 50);
  assertEquals(schema.properties.limit.type, "integer");
  assertEquals(schema.properties.limit.minimum, 1);
  assertEquals(schema.properties.limit.maximum, 100);
  assertEquals(schema.properties.limit.default, 20);
});

// ── Backlog Test Case 1: Role Developer, Input {} ────────────────────────────

Deno.test("Backlog Case 1: Developer role with input {} is allowed and shapes all devices", () => {
  // 1. Role authorization
  const auth = authorizeTelemetryRole("Developer");
  assertEquals(auth.allowed, true);
  assertEquals(isRoleAllowed("Developer", DEVICE_TELEMETRY_ROLES), true);

  // 2. Input validation (default limit 20, no device_id filter)
  const validation = validateTelemetryArgs({});
  assertEquals(validation.ok, true);
  if (validation.ok) {
    assertEquals(validation.params.limit, 20);
    assertEquals(validation.params.device_id, undefined);
  }

  // 3. Database row shaping for all registered devices
  const mockDbRows = [
    {
      device_id: "onyxchan-01",
      device_name: "OnyxChan 1",
      status: "online",
      battery_level: 92,
      rssi: -55,
      token_hash: "secret_hash_01",
    },
    {
      device_id: "onyxchan-02",
      device_name: "OnyxChan 2",
      status: "charging",
      battery_level: 45,
      rssi: -60,
      token_hash: "secret_hash_02",
    },
  ];

  const result = shapeTelemetryResult(mockDbRows);
  assertEquals(result.devices.length, 2);
  assertEquals(result.devices[0], {
    device_id: "onyxchan-01",
    device_name: "OnyxChan 1",
    status: "online",
    battery_level: 92,
    rssi: -55,
  });
  assertEquals(result.devices[1], {
    device_id: "onyxchan-02",
    device_name: "OnyxChan 2",
    status: "charging",
    battery_level: 45,
    rssi: -60,
  });
});

// ── Backlog Test Case 2: Role ClientViewer, Input {} ─────────────────────────

Deno.test("Backlog Case 2: ClientViewer role returns 403 Forbidden (requires DEVICE_TELEMETRY_ROLES)", () => {
  const auth = authorizeTelemetryRole("ClientViewer");
  assertEquals(auth.allowed, false);
  assertEquals(auth.status, 403);
  assertEquals(isRoleAllowed("ClientViewer", DEVICE_TELEMETRY_ROLES), false);
  assert(auth.error !== undefined);
  assert(auth.error.includes("requires a staff role other than ClientViewer"));
});

// ── Backlog Test Case 3: Role Admin, Input { device_id: 'onyxchan-01' } ──────

Deno.test("Backlog Case 3: Admin role with device_id returns telemetry for single device", () => {
  // 1. Role authorization
  const auth = authorizeTelemetryRole("Admin");
  assertEquals(auth.allowed, true);
  assertEquals(isRoleAllowed("Admin", DEVICE_TELEMETRY_ROLES), true);

  // 2. Input validation
  const validation = validateTelemetryArgs({ device_id: "onyxchan-01" });
  assertEquals(validation.ok, true);
  if (validation.ok) {
    assertEquals(validation.params.device_id, "onyxchan-01");
    assertEquals(validation.params.limit, 20);
  }

  // 3. Result shaping for single device
  const mockDbRow = {
    device_id: "onyxchan-01",
    device_name: "OnyxChan 1",
    status: "online",
    battery_level: 92,
    rssi: -55,
    token_hash: "super_secret_token_hash",
  };

  const result = shapeTelemetryResult([mockDbRow]);
  assertEquals(result, {
    devices: [
      {
        device_id: "onyxchan-01",
        device_name: "OnyxChan 1",
        status: "online",
        battery_level: 92,
        rssi: -55,
      },
    ],
  });
});

// ── Input Validation Bad Cases: limit 0, limit 101, device_id > 50 chars ────

Deno.test("validateTelemetryArgs rejects limit 0 (below minimum 1)", () => {
  const result = validateTelemetryArgs({ limit: 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateTelemetryArgs rejects limit 101 (above maximum 100)", () => {
  const result = validateTelemetryArgs({ limit: 101 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateTelemetryArgs rejects device_id longer than 50 characters", () => {
  const overlongId = "a".repeat(51);
  const result = validateTelemetryArgs({ device_id: overlongId });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "device_id must not exceed 50 characters");
  }
});

Deno.test("validateTelemetryArgs rejects non-object inputs", () => {
  assertEquals(validateTelemetryArgs(null).ok, false);
  assertEquals(validateTelemetryArgs("bad").ok, false);
  assertEquals(validateTelemetryArgs([1, 2, 3]).ok, false);
  assertEquals(validateTelemetryArgs(42).ok, false);
});

// ── Row Shaping Edge Cases: null battery & secrecy guarantee ─────────────────

Deno.test("shapeTelemetryRow handles a row that has a null battery", () => {
  const rawRow = {
    device_id: "onyxchan-unpowered",
    device_name: "OnyxChan Unpowered",
    status: "offline",
    battery_level: null,
    rssi: null,
  };

  const shaped = shapeTelemetryRow(rawRow);
  assertEquals(shaped.device_id, "onyxchan-unpowered");
  assertEquals(shaped.device_name, "OnyxChan Unpowered");
  assertEquals(shaped.status, "offline");
  assertEquals(shaped.battery_level, null);
  assertEquals(shaped.rssi, null);
});

Deno.test("shapeTelemetryRow excludes token_hash and any secret columns", () => {
  const rawWithSecrets = {
    device_id: "onyxchan-01",
    device_name: "OnyxChan 1",
    status: "online",
    battery_level: 95,
    rssi: -52,
    token_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    token: "ocd_supersecret",
    auth_secret: "hidden",
  };

  const shaped = shapeTelemetryRow(rawWithSecrets);
  assertEquals(shaped, {
    device_id: "onyxchan-01",
    device_name: "OnyxChan 1",
    status: "online",
    battery_level: 95,
    rssi: -52,
  });
  assert(!("token_hash" in shaped));
  assert(!("token" in shaped));
  assert(!("auth_secret" in shaped));
  assertEquals(Object.keys(shaped).sort(), [
    "battery_level",
    "device_id",
    "device_name",
    "rssi",
    "status",
  ]);
});

Deno.test("TELEMETRY_SELECT_COLUMNS does not contain sensitive column names", () => {
  assert(!TELEMETRY_SELECT_COLUMNS.includes("token"));
  assert(!TELEMETRY_SELECT_COLUMNS.includes("secret"));
  assert(!TELEMETRY_SELECT_COLUMNS.includes("hash"));
  assertEquals(
    TELEMETRY_SELECT_COLUMNS,
    "device_id,device_name,status,battery_level,rssi"
  );
});
