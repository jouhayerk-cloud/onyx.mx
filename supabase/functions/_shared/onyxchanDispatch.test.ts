// =============================================================================
// Deno unit tests for OnyxChan tool dispatcher.
// =============================================================================

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  listOnyxchanTools,
  dispatchOnyxchanTool,
  DEVICE_TOOLS,
  MinimalSupabaseClient,
} from "./onyxchanDispatch.ts";
import { ONYXCHAN_TOOLS } from "./onyxchanTools.ts";

/**
 * Creates a fake chainable Supabase client where every method returns itself
 * and whose awaited result is { data, error }.
 */
function createFakeClient(
  result: { data: any; error: any; count?: number | null } = { data: null, error: null },
): MinimalSupabaseClient {
  const chain: any = {
    then(onFulfilled?: (val: any) => any, onRejected?: (err: any) => any) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
    catch(onRejected?: (err: any) => any) {
      return Promise.resolve(result).catch(onRejected);
    },
  };

  const proxy: any = new Proxy(chain, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return (..._args: any[]) => proxy;
    },
  });

  return proxy as MinimalSupabaseClient;
}

/**
 * Creates a fake client whose methods throw synchronously.
 */
function createThrowingClient(message: string): MinimalSupabaseClient {
  return {
    from(_table: string) {
      throw new Error(message);
    },
    channel(_name: string) {
      throw new Error(message);
    },
  } as MinimalSupabaseClient;
}

// 1. tools/list for a device caller and for a staff caller
Deno.test("tools/list for a device caller and for a staff caller", () => {
  const deviceList = listOnyxchanTools("device");
  assertEquals(deviceList.tools.length, DEVICE_TOOLS.size);
  for (const tool of deviceList.tools) {
    assert(DEVICE_TOOLS.has(tool.name));
  }

  const staffList = listOnyxchanTools("staff");
  assertEquals(staffList.tools.length, ONYXCHAN_TOOLS.length);

  // Default / undefined role returns all tools
  const defaultList = listOnyxchanTools();
  assertEquals(defaultList.tools.length, ONYXCHAN_TOOLS.length);
});

// 2. an allowed call
Deno.test("an allowed call", async () => {
  const fakeClient = createFakeClient({ data: null, error: null });
  const ctx = {
    kind: "device" as const,
    role: "device",
    deviceId: "ocd_dev_01",
    client: fakeClient,
  };

  const res = await dispatchOnyxchanTool("resolve_tag", { tag: "test-tag" }, ctx);
  assert(!("error" in res));
  assert("content" in res);
  assertEquals(res.isError, undefined);
  assertExists(res.content);
  assertEquals(res.content.length, 1);
  assertEquals(res.content[0].text, JSON.stringify({ found: false, tag: "test-tag" }));
});

// 3. a forbidden device call
Deno.test("a forbidden device call", async () => {
  const fakeClient = createFakeClient();
  const ctx = {
    kind: "device" as const,
    role: "device",
    deviceId: "ocd_dev_01",
    client: fakeClient,
  };

  const res = await dispatchOnyxchanTool("speak", { device_id: "ocd_dev_01", text: "hello" }, ctx);
  assert("error" in res && res.error);
  assertEquals(res.error.code, 403);
  assertEquals(res.error.message, "Device tokens may not call speak");
  assertEquals(res.isError, true);
});

// 4. an unknown tool
Deno.test("an unknown tool", async () => {
  const fakeClient = createFakeClient();
  const ctx = {
    kind: "staff" as const,
    role: "Admin",
    client: fakeClient,
  };

  const res = await dispatchOnyxchanTool("unknown_nonexistent_tool", {}, ctx);
  assert("error" in res && res.error);
  assertEquals(res.error.code, -32601);
  assertEquals(res.error.message, "Unknown MCP tool: unknown_nonexistent_tool");
  assertEquals(res.isError, true);
});

// 5. missing required argument
Deno.test("missing required argument", async () => {
  const fakeClient = createFakeClient();
  const ctx = {
    kind: "staff" as const,
    role: "Admin",
    client: fakeClient,
  };

  // move_head requires ["device_id", "pan", "tilt"]
  const res = await dispatchOnyxchanTool("move_head", { pan: 10 }, ctx);
  assert("error" in res && res.error);
  assertEquals(res.error.code, -32602);
  assertEquals(res.error.message, "Missing required argument: device_id");
  assertEquals(res.isError, true);
});

// 6. a handler that throws (returns an error result, no stack trace)
Deno.test("a handler that throws (returns an error result, no stack trace)", async () => {
  const throwingClient = createThrowingClient("Postgres connection failure");
  const ctx = {
    kind: "staff" as const,
    role: "Admin",
    client: throwingClient,
  };

  const res = await dispatchOnyxchanTool("query_inventory_item", { item_id: "item-42" }, ctx);
  assert("content" in res);
  assertEquals(res.isError, true);
  assertEquals(res.content![0].text, "Error executing query_inventory_item: Postgres connection failure");

  // Verify no stack trace is leaked in text
  assert(!res.content![0].text.includes("at "));
  assert(!res.content![0].text.includes("\n"));
});
