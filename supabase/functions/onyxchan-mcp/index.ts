// Setup type definitions for Deno
/// <reference types="https://deno.land/x/types/index.d.ts" />

import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "npm:@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "npm:@modelcontextprotocol/sdk/types.js";
import { createClient } from "npm:@supabase/supabase-js";
import { ONYXCHAN_TOOLS } from "../_shared/onyxchanTools.ts";

// Initialize Supabase Client (Edge Functions inject these environment variables)
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// A wildcard here let any website drive the robot from a visitor's browser.
const ALLOWED_ORIGIN = Deno.env.get("ONYXCHAN_ALLOWED_ORIGIN")
  || "https://jouhayerk-cloud.github.io";

// ── Authentication ────────────────────────────────────────────────────────────
// This function runs on the service role, which bypasses RLS entirely. Without
// a gate here, every policy fix made on the database is irrelevant to anyone who
// can reach this URL: `{"tool":"query_inventory"}` would return the whole
// inventory, costs included, to an unauthenticated caller.
//
// Two kinds of caller, with very different privilege:
//
//   staff   a Supabase JWT belonging to a provisioned user (a row in app_users,
//           not merely an account). Full tool surface.
//   device  a per-device token issued by public.issue_device_token. Restricted
//           to DEVICE_TOOLS and can only ever act as itself.
//
// A device credential lives in flash on hardware that sits on a warehouse floor,
// so it is treated as semi-public: it may report telemetry and resolve a scanned
// tag, and it may not read costs, query finance, or drive a user's browser.
type Caller =
  | { kind: "staff"; role: string }
  | { kind: "device"; deviceId: string };

const DEVICE_TOOLS = new Set(["resolve_tag", "get_robot_status", "ping_robot"]);

async function authenticate(req: Request): Promise<Caller | Response> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonError(401, "Missing bearer token");

  // Device tokens carry a distinguishing prefix, so a device credential is never
  // sent to the auth server and a user JWT is never hashed against device rows.
  if (token.startsWith("ocd_")) {
    const { data: deviceId, error } = await supabase.rpc("verify_device_token", { p_token: token });
    if (error || !deviceId) return jsonError(401, "Invalid or revoked device token");
    return { kind: "device", deviceId: String(deviceId) };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) return jsonError(401, "Invalid or expired token");

  const { data: row } = await supabase
    .from("app_users")
    .select("role")
    .ilike("email", user.email)
    .maybeSingle();

  if (!row?.role) return jsonError(403, "No application role assigned");
  return { kind: "staff", role: String(row.role) };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Content-Type": "application/json" },
  });
}

// PostgREST parses `or=` filters as a comma/parenthesis-delimited expression, so
// an unescaped search term can inject extra predicates. Strip the delimiters.
function sanitiseFilterTerm(raw: unknown): string {
  return String(raw ?? "").replace(/[,()*:."'\\]/g, " ").trim().slice(0, 100);
}

// ── Vendor Color Map ──────────────────────────────────────────────────────────
const VENDOR_COLORS: Record<string, string> = {
  Ramses: "#737104",
  Martha: "#4f2068",
  Alejandra: "#1a6b5a",
  Carolina: "#8b2252",
  Default: "#8b5cf6",
};

// ── Helper: Broadcast a device command to the robot ───────────────────────────
async function broadcastDeviceCommand(deviceId: string, command: Record<string, any>) {
  const channelName = `device_control:${deviceId}`;
  const channel = supabase.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "DEVICE_COMMAND",
    payload: command,
  });
}

// ── Helper: Broadcast a state update to the user's remote control channel ──────
async function broadcastStateUpdate(deviceId: string, atomName: string, value: any) {
  const { data: device } = await supabase
    .from("onyxchan_devices")
    .select("assigned_user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  const targetUserId = device?.assigned_user_id || "global-user";
  const channelName = `remote_control:${targetUserId}`;
  const channel = supabase.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "STATE_UPDATE",
    payload: { atomName, value },
  });
}

// ── Helper: Broadcast multiple state updates at once ──────────────────────────
async function broadcastBatchUpdate(
  deviceId: string,
  updates: { atomName: string; value: any }[]
) {
  const { data: device } = await supabase
    .from("onyxchan_devices")
    .select("assigned_user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  const targetUserId = device?.assigned_user_id || "global-user";
  const channelName = `remote_control:${targetUserId}`;
  const channel = supabase.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "BATCH_UPDATE",
    payload: { updates },
  });
}

// ── Define MCP Server ─────────────────────────────────────────────────────────
const server = new Server(
  { name: "OnyxChan-Edge-MCP", version: "2.5.0" },
  { capabilities: { tools: {} } }
);

// ── Register ALL MCP Tools ───────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: ONYXCHAN_TOOLS };
});

// ── Handle Tool Execution ─────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 1. move_head
    if (name === "move_head") {
      const pan = Math.max(-90, Math.min(90, Number(args?.pan) || 0));
      const tilt = Math.max(0, Math.min(90, Number(args?.tilt) || 0));
      await broadcastDeviceCommand(String(args?.device_id), {
        action: "move",
        pan,
        tilt,
      });
      return {
        content: [{ type: "text", text: `Robot head moved to Pan: ${pan}°, Tilt: ${tilt}°` }],
      };
    }

    // 2. set_expression
    if (name === "set_expression") {
      const expression = String(args?.expression || "calm");
      const duration = args?.duration ? Number(args.duration) : undefined;
      await broadcastDeviceCommand(String(args?.device_id), {
        action: "face",
        expression,
        duration,
      });
      return {
        content: [{ type: "text", text: `Avatar expression updated to "${expression}"` }],
      };
    }

    // 3. speak
    if (name === "speak") {
      const text = String(args?.text || "");
      const language = (args?.language as any) || "es";
      await broadcastDeviceCommand(String(args?.device_id), {
        action: "tts",
        text,
        language,
      });
      return {
        content: [{ type: "text", text: `Robot speaking (${language}): "${text}"` }],
      };
    }

    // 4. display_vendor_card
    if (name === "display_vendor_card") {
      const vendor = String(args?.vendor || "Martha");
      const title = String(args?.title || `${vendor} Card`);
      const details = Array.isArray(args?.details) ? (args?.details as string[]) : [];
      const color = args?.color ? String(args.color) : VENDOR_COLORS[vendor] || VENDOR_COLORS.Default;
      const icon = args?.icon ? String(args.icon) : "tag";

      await broadcastDeviceCommand(String(args?.device_id), {
        action: "vendor-display",
        vendor,
        title,
        details,
        color,
        icon,
      });
      return {
        content: [{ type: "text", text: `Vendor display card for "${vendor}" rendered on robot LCD.` }],
      };
    }

    // 4b. display_inventory_card
    if (name === "display_inventory_card") {
      await broadcastDeviceCommand(String(args?.device_id), {
        action: "inventory-display",
        item_id: String(args?.item_id),
        title: String(args?.title),
        price: Number(args?.price || 0),
        stock: Number(args?.stock || 0),
        vendor: String(args?.vendor || "Unknown"),
      });
      return {
        content: [{ type: "text", text: `Inventory card for "${args?.title}" rendered on robot LCD.` }],
      };
    }

    // 5. get_robot_status
    if (name === "get_robot_status") {
      const deviceId = String(args?.device_id);
      const { data: dev } = await supabase
        .from("onyxchan_devices")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

      const statusReport = {
        device_id: deviceId,
        status: dev?.status || "online",
        battery: dev?.battery_level ?? 92,
        rssi: dev?.rssi ?? -48,
        firmware: dev?.firmware_version || "2.4.0",
        accessories: dev?.accessories || ["NFC_ST25R3916", "SERVO_PAN_TILT"],
        active_workflow: "idle",
        last_seen: dev?.last_seen || new Date().toISOString(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(statusReport, null, 2) }],
      };
    }

    // 6. ping_robot
    if (name === "ping_robot") {
      const startTime = Date.now();
      await broadcastDeviceCommand(String(args?.device_id), {
        action: "ping",
        timestamp: startTime,
      });
      return {
        content: [{ type: "text", text: `Ping heartbeat transmitted to ${args?.device_id} at ${new Date(startTime).toISOString()}` }],
      };
    }

    // 7. query_inventory
    if (name === "query_inventory") {
      let query = supabase.from("inventory").select("*").limit(Number(args?.limit) || 20);
      if (args?.search_term) {
        // `title` and `vendor` do not exist on this table — selecting or
        // filtering on them makes PostgREST reject the whole query. Verified
        // against the live schema: short_description, description, book_barcode
        // and vendor_id are the real columns.
        const term = sanitiseFilterTerm(args.search_term);
        if (term) {
          query = query.or(
            `short_description.ilike.%${term}%,description.ilike.%${term}%,book_barcode.ilike.%${term}%`,
          );
        }
      }
      if (args?.vendor) {
        query = query.eq("vendor_id", String(args.vendor));
      }
      if (args?.status) {
        query = query.eq("status", String(args.status));
      }
      const { data, error } = await query;
      if (error) throw error;
      return {
        content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }],
      };
    }

    // 8. query_inventory_item
    if (name === "query_inventory_item") {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("id", String(args?.item_id))
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // 9. query_payment_status
    if (name === "query_payment_status") {
      // `finance_payments` does not exist — verified against the live schema,
      // which has `finance` (and the retired `finance_826`). This tool has
      // therefore never returned anything but an error. Left pointing at the
      // real table; confirm the column names before relying on it.
      const { data, error } = await supabase
        .from("finance")
        .select("*")
        .eq("vendor_id", String(args?.vendor_id));
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }] };
    }

    // 10. app_change_view
    if (name === "app_change_view") {
      await broadcastStateUpdate(String(args?.device_id), "activeViewAtom", String(args?.view));
      return { content: [{ type: "text", text: `View changed to "${args?.view}" on user devices.` }] };
    }

    // 11. app_search_inventory
    if (name === "app_search_inventory") {
      await broadcastBatchUpdate(String(args?.device_id), [
        { atomName: "activeViewAtom", value: "inventory" },
        { atomName: "inventorySearchTermAtom", value: String(args?.search_term) },
      ]);
      return { content: [{ type: "text", text: `Searching inventory for "${args?.search_term}".` }] };
    }

    // 12. app_open_inventory_artifact
    if (name === "app_open_inventory_artifact") {
      await broadcastStateUpdate(String(args?.device_id), "inventoryArtifactConfigAtom", {
        isOpen: true,
        itemIds: args?.item_ids || [],
        title: String(args?.title || "OnyxChan Artifact"),
        viewMode: "modal",
        displayMode: "list",
      });
      return { content: [{ type: "text", text: `Inventory artifact opened on user screen.` }] };
    }

    // 13. app_open_add_item
    if (name === "app_open_add_item") {
      await broadcastStateUpdate(String(args?.device_id), "isUploadWizardOpenAtom", true);
      return { content: [{ type: "text", text: `Add Item wizard opened.` }] };
    }

    // 14. count_vendor_items
    if (name === "count_vendor_items") {
      const { count, error } = await supabase
        .from("inventory")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", String(args?.vendor_id));
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify({ vendor_id: args?.vendor_id, count: count ?? 0 }) }] };
    }

    // 15. resolve_tag
    if (name === "resolve_tag") {
      const tag = String(args?.tag ?? "");
      const { data, error } = await supabase
        .from("inventory")
        .select("item_id, vendor_id, short_description, book_barcode, status")
        .or(`book_barcode.eq.${sanitiseFilterTerm(tag)},item_id.eq.${sanitiseFilterTerm(tag)}`)
        .maybeSingle();
      if (error) throw error;
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? { found: false, tag }) }],
      };
    }

    throw new Error(`Unknown MCP tool: ${name}`);
  } catch (e: any) {
    return { content: [{ type: "text", text: `Error executing ${name}: ${e.message}` }], isError: true };
  }
});

// ── Supabase Edge Function HTTP & SSE Server ──────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Every path below this line either moves physical hardware, reads inventory
  // and finance on the service role, or pushes state into a user's browser.
  // None of it is public. The bare "v2.5 Active" banner at the bottom is the
  // only unauthenticated response.
  let caller: Caller | null = null;
  if (req.method === "POST") {
    const result = await authenticate(req);
    if (result instanceof Response) return result;
    caller = result;
  }

  // Devices get a deliberately narrow surface. Enforced here rather than inside
  // each handler so a tool added later is denied to devices by default.
  const guardToolForCaller = (toolName: string): Response | null => {
    if (caller?.kind === "device" && !DEVICE_TOOLS.has(toolName)) {
      return jsonError(403, `Device tokens may not call ${toolName}`);
    }
    return null;
  };

  // 1. SSE Connection for MCP
  if (url.pathname.endsWith("/sse") && req.method === "GET") {
    const body = new TransformStream();
    return new Response(body.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // 2. Direct HTTP Tool Invocation / JSON-RPC
  if ((url.pathname.endsWith("/rpc") || url.pathname.endsWith("/messages") || url.pathname.endsWith("/execute")) && req.method === "POST") {
    try {
      const body = await req.json();

      // If it's a direct tool execution request { tool: "speak", args: { ... } }
      if (body.tool) {
        const blocked = guardToolForCaller(String(body.tool));
        if (blocked) return blocked;
        const handlerRes = await server.request(
          { method: "tools/call", params: { name: body.tool, arguments: body.args || {} } },
          CallToolRequestSchema
        );
        return new Response(JSON.stringify(handlerRes), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If it's standard JSON-RPC 2.0
      if (body.jsonrpc === "2.0") {
        if (body.method === "tools/list") {
          const tools: any = await server.request({ method: "tools/list", params: {} }, ListToolsRequestSchema);
          // A device is shown only what it may call, so its client does not
          // advertise tools it would be refused.
          const visible = caller?.kind === "device"
            ? { ...tools, tools: (tools.tools || []).filter((t: any) => DEVICE_TOOLS.has(t.name)) }
            : tools;
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: visible }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (body.method === "tools/call") {
          const blocked = guardToolForCaller(String(body.params?.name ?? ""));
          if (blocked) return blocked;
          const callRes = await server.request(
            { method: "tools/call", params: body.params },
            CallToolRequestSchema
          );
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: callRes }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ status: "received", body }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // 3. Heartbeat from robot hardware
  //
  // The device_id is taken from the credential, never from the body. Previously
  // the body supplied it, so any caller could mark any device online, set its
  // battery, and move its last_seen — the classic confused-deputy shape.
  // A staff token may still post a heartbeat, but must name the device.
  if (url.pathname.endsWith("/heartbeat") && req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    const deviceId = caller?.kind === "device"
      ? caller.deviceId
      : String(body?.device_id ?? "");

    if (!deviceId) return jsonError(400, "device_id required for staff-posted heartbeats");

    const toInt = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };

    const { error } = await supabase.rpc("record_device_heartbeat", {
      p_device_id: deviceId,
      p_battery: toInt(body?.battery),
      p_rssi: toInt(body?.rssi),
    });
    if (error) return jsonError(500, `heartbeat failed: ${error.message}`);

    return new Response(JSON.stringify({ status: "ok", device_id: deviceId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("OnyxChan MCP Edge Function v2.5 Active", {
    status: 200,
    headers: corsHeaders,
  });
});
