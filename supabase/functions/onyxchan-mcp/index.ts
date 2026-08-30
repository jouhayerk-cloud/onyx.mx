// Setup type definitions for Deno
/// <reference types="https://deno.land/x/types/index.d.ts" />

import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "npm:@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "npm:@modelcontextprotocol/sdk/types.js";
import { createClient } from "npm:@supabase/supabase-js";

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
// Callers must present a valid Supabase JWT belonging to a provisioned user —
// the same bar the app itself uses (a row in app_users, not merely an account).
async function requireStaff(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonError(401, "Missing bearer token");

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) return jsonError(401, "Invalid or expired token");

  const { data: row } = await supabase
    .from("app_users")
    .select("role")
    .ilike("email", user.email)
    .maybeSingle();

  if (!row?.role) return jsonError(403, "No application role assigned");
  return null; // authorised
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
  return {
    tools: [
      // ── Physical Robot Control Tools ──
      {
        name: "move_head",
        description: "Pan (yaw) and tilt (pitch) the robot's physical head using dual precision servos.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target OnyxChan robot ID or MAC." },
            pan: { type: "number", description: "Horizontal yaw angle in degrees (-90 to 90). Negative is left, positive is right." },
            tilt: { type: "number", description: "Vertical pitch angle in degrees (0 to 90). 0 is forward, 90 is looking straight up." },
          },
          required: ["device_id", "pan", "tilt"],
        },
      },
      {
        name: "set_expression",
        description: "Change the avatar facial expression on the robot's LCD screen.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target OnyxChan robot ID or MAC." },
            expression: {
              type: "string",
              enum: ["calm", "happy", "thinking", "sleepy", "shy", "smug", "pouty", "alert", "error", "speaking", "listening", "vendor-display"],
              description: "The expression to display.",
            },
            duration: { type: "number", description: "Optional duration in ms before returning to calm." },
          },
          required: ["device_id", "expression"],
        },
      },
      {
        name: "speak",
        description: "Make the robot speak aloud via Text-to-Speech (TTS) synthesizer.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target OnyxChan robot ID or MAC." },
            text: { type: "string", description: "Text for the robot to speak aloud." },
            language: {
              type: "string",
              enum: ["es", "en", "ja"],
              description: "Speech language: 'es' for Spanish, 'en' for English, 'ja' for Japanese.",
              default: "es",
            },
          },
          required: ["device_id", "text"],
        },
      },
      {
        name: "display_vendor_card",
        description: "Render a branded, color-coded vendor or telemetry card on the robot's LCD screen.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target OnyxChan robot ID or MAC." },
            vendor: { type: "string", description: "Vendor name (e.g., 'Martha', 'Ramses', 'Alejandra', 'Carolina')." },
            title: { type: "string", description: "Header title text on the LCD." },
            details: {
              type: "array",
              items: { type: "string" },
              description: "Up to 4 detail lines to display.",
            },
            color: { type: "string", description: "Optional hex color override (e.g. #737104)." },
            icon: {
              type: "string",
              enum: ["box", "tag", "dollar", "truck", "package"],
              description: "Optional icon identifier.",
            },
          },
          required: ["device_id", "vendor", "title", "details"],
        },
      },
      {
        name: "display_inventory_card",
        description: "Render an inventory item card on the robot's LCD screen showing details from Supabase.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target OnyxChan robot ID or MAC." },
            item_id: { type: "string", description: "Item UUID from inventory." },
            title: { type: "string", description: "Item title." },
            price: { type: "number", description: "Item price." },
            stock: { type: "number", description: "Stock quantity." },
            vendor: { type: "string", description: "Vendor name." },
          },
          required: ["device_id", "item_id", "title"],
        },
      },
      {
        name: "get_robot_status",
        description: "Query device connectivity, battery level, RSSI, firmware version, and linked accessories.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The robot device ID or MAC to inspect." },
          },
          required: ["device_id"],
        },
      },
      {
        name: "ping_robot",
        description: "Send a ping to the physical robot over Realtime to test communication latency.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "Target robot device ID." },
          },
          required: ["device_id"],
        },
      },

      // ── Data Query & Inventory Tools ──
      {
        name: "query_inventory",
        description: "Search inventory items by keyword, vendor name, status, or book barcode tag ID.",
        inputSchema: {
          type: "object",
          properties: {
            search_term: { type: "string", description: "Text to search in item title, description, or barcode." },
            vendor: { type: "string", description: "Filter by vendor name." },
            status: { type: "string", description: "Filter by item status." },
            limit: { type: "number", description: "Max results to return (default 20).", default: 20 },
          },
        },
      },
      {
        name: "query_inventory_item",
        description: "Query detailed information about a single inventory item by ID.",
        inputSchema: {
          type: "object",
          properties: {
            item_id: { type: "string", description: "The item ID to query." },
          },
          required: ["item_id"],
        },
      },
      {
        name: "query_payment_status",
        description: "Query payment status and financial obligations for a specific vendor.",
        inputSchema: {
          type: "object",
          properties: {
            vendor_id: { type: "string", description: "The vendor ID or name." },
          },
          required: ["vendor_id"],
        },
      },

      // ── App Screen Control Tools ──
      {
        name: "app_change_view",
        description: "Change the active view in the Onyx.mx web app (inventory, finance, logistics, create, control, pico-bridge, viewer).",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string", description: "The OnyxChan device ID." },
            view: { type: "string", description: "The view to switch to." },
          },
          required: ["device_id", "view"],
        },
      },
      {
        name: "app_search_inventory",
        description: "Filter inventory in real-time on the user's screen.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string" },
            search_term: { type: "string", description: "Search query." },
          },
          required: ["device_id", "search_term"],
        },
      },
      {
        name: "app_open_inventory_artifact",
        description: "Pop up the Inventory Artifact modal showing specific items on the user's screen.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string" },
            item_ids: {
              type: "array",
              items: { type: "string" },
              description: "Array of item IDs to display.",
            },
            title: { type: "string", description: "Modal title." },
          },
          required: ["device_id", "item_ids"],
        },
      },
      {
        name: "app_open_add_item",
        description: "Open the Add Item / Upload Wizard on the user's screen.",
        inputSchema: {
          type: "object",
          properties: {
            device_id: { type: "string" },
          },
          required: ["device_id"],
        },
      },
    ],
  };
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
  if (req.method === "POST") {
    const denied = await requireStaff(req);
    if (denied) return denied;
  }

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
          const tools = await server.request({ method: "tools/list", params: {} }, ListToolsRequestSchema);
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: tools }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (body.method === "tools/call") {
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
  // NOTE: this now sits behind requireStaff, which a device cannot satisfy — it
  // has no user JWT. That is deliberate until per-device tokens exist: the old
  // behaviour let anyone POST a device_id and rewrite that device's status,
  // battery and last_seen. Nothing calls this today (the firmware's networking
  // is still commented out), so failing closed costs nothing now and avoids
  // shipping an open write endpoint. Device auth is tracked separately.
  if (url.pathname.endsWith("/heartbeat") && req.method === "POST") {
    const { device_id, battery, rssi } = await req.json();
    await supabase
      .from("onyxchan_devices")
      .update({
        status: "online",
        battery_level: battery,
        rssi,
        last_seen: new Date().toISOString(),
      })
      .eq("device_id", device_id);

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("OnyxChan MCP Edge Function v2.5 Active", {
    status: 200,
    headers: corsHeaders,
  });
});
