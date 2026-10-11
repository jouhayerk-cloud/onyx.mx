// =============================================================================
// OnyxChan pure tool dispatcher — dependency-free, no npm imports.
// =============================================================================

import { ONYXCHAN_TOOLS, OnyxChanTool } from "./onyxchanTools.ts";

export type CallerKind = "device" | "user" | "staff";

export interface DispatchCaller {
  kind: CallerKind;
  role?: string;
  deviceId?: string;
}

export interface MinimalSupabaseQueryChain {
  select(columns?: string, options?: Record<string, unknown>): this;
  eq(column: string, value: unknown): this;
  or(filters: string): this;
  limit(count: number): this;
  single(): Promise<{ data: any; error: any }>;
  maybeSingle(): Promise<{ data: any; error: any }>;
  then<TResult1 = { data: any; error: any; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  [key: string]: any;
}

export interface MinimalSupabaseChannel {
  send(payload: { type: string; event: string; payload: unknown }): Promise<unknown>;
  [key: string]: any;
}

export interface MinimalSupabaseClient {
  from(table: string): MinimalSupabaseQueryChain;
  channel(name: string): MinimalSupabaseChannel;
  [key: string]: any;
}

export interface DispatchContext {
  caller?: DispatchCaller;
  kind?: CallerKind;
  role?: string;
  deviceId?: string;
  client?: MinimalSupabaseClient;
  supabase?: MinimalSupabaseClient;
}

export interface ToolContentItem {
  type: string;
  text: string;
}

export interface DispatchToolSuccess {
  content: ToolContentItem[];
  isError?: false;
}

export interface DispatchToolExecutionError {
  content: ToolContentItem[];
  isError: true;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface DispatchToolProtocolError {
  isError: true;
  error: JsonRpcError;
  content?: ToolContentItem[];
}

export type DispatchToolResult =
  | DispatchToolSuccess
  | DispatchToolExecutionError
  | DispatchToolProtocolError;

export const DEVICE_TOOLS = new Set(["resolve_tag", "get_robot_status", "ping_robot"]);

const VENDOR_COLORS: Record<string, string> = {
  Ramses: "#737104",
  Martha: "#4f2068",
  Alejandra: "#1a6b5a",
  Carolina: "#8b2252",
  Default: "#8b5cf6",
};

function sanitiseFilterTerm(raw: unknown): string {
  return String(raw ?? "").replace(/[,()*:."'\\]/g, " ").trim().slice(0, 100);
}

interface SchemaProperty {
  type?: string;
  enum?: unknown[];
  default?: unknown;
}

interface ToolSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

function validateToolArgs(
  tool: OnyxChanTool,
  args: Record<string, unknown> | undefined,
): JsonRpcError | null {
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) {
    return {
      code: -32602,
      message: `Invalid arguments: expected object, got ${Array.isArray(args) ? "array" : typeof args}`,
    };
  }

  const safeArgs = args ?? {};
  const schema = (tool.inputSchema || {}) as ToolSchema;
  const requiredFields = Array.isArray(schema.required) ? schema.required : [];

  for (const field of requiredFields) {
    if (safeArgs[field] === undefined || safeArgs[field] === null) {
      return {
        code: -32602,
        message: `Missing required argument: ${field}`,
      };
    }
  }

  const properties = schema.properties || {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    const val = safeArgs[propName];
    if (val === undefined || val === null) {
      continue;
    }

    if (propSchema.type) {
      switch (propSchema.type) {
        case "string":
          if (typeof val !== "string") {
            return {
              code: -32602,
              message: `Invalid argument type for ${propName}: expected string, got ${typeof val}`,
            };
          }
          break;
        case "number":
          if (typeof val !== "number" || Number.isNaN(val)) {
            return {
              code: -32602,
              message: `Invalid argument type for ${propName}: expected number, got ${typeof val}`,
            };
          }
          break;
        case "boolean":
          if (typeof val !== "boolean") {
            return {
              code: -32602,
              message: `Invalid argument type for ${propName}: expected boolean, got ${typeof val}`,
            };
          }
          break;
        case "array":
          if (!Array.isArray(val)) {
            return {
              code: -32602,
              message: `Invalid argument type for ${propName}: expected array, got ${typeof val}`,
            };
          }
          break;
        case "object":
          if (typeof val !== "object" || Array.isArray(val)) {
            return {
              code: -32602,
              message: `Invalid argument type for ${propName}: expected object, got ${typeof val}`,
            };
          }
          break;
      }
    }

    if (Array.isArray(propSchema.enum)) {
      if (!propSchema.enum.includes(val)) {
        return {
          code: -32602,
          message: `Invalid value for ${propName}: must be one of ${propSchema.enum.join(", ")}`,
        };
      }
    }
  }

  return null;
}

async function broadcastDeviceCommand(client: MinimalSupabaseClient, deviceId: string, command: Record<string, unknown>) {
  const channelName = `device_control:${deviceId}`;
  const channel = client.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "DEVICE_COMMAND",
    payload: command,
  });
}

async function broadcastStateUpdate(client: MinimalSupabaseClient, deviceId: string, atomName: string, value: unknown) {
  const { data: device } = await client
    .from("onyxchan_devices")
    .select("assigned_user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  const targetUserId = device?.assigned_user_id || "global-user";
  const channelName = `remote_control:${targetUserId}`;
  const channel = client.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "STATE_UPDATE",
    payload: { atomName, value },
  });
}

async function broadcastBatchUpdate(
  client: MinimalSupabaseClient,
  deviceId: string,
  updates: { atomName: string; value: unknown }[],
) {
  const { data: device } = await client
    .from("onyxchan_devices")
    .select("assigned_user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  const targetUserId = device?.assigned_user_id || "global-user";
  const channelName = `remote_control:${targetUserId}`;
  const channel = client.channel(channelName);
  await channel.send({
    type: "broadcast",
    event: "BATCH_UPDATE",
    payload: { updates },
  });
}

export function listOnyxchanTools(
  role?: string | { kind?: string; role?: string },
): { tools: OnyxChanTool[] } {
  const roleStr = typeof role === "object" && role !== null
    ? (role.kind === "device" ? "device" : role.role)
    : role;
  const isDevice = roleStr === "device";
  const tools = isDevice
    ? ONYXCHAN_TOOLS.filter((t) => DEVICE_TOOLS.has(t.name))
    : [...ONYXCHAN_TOOLS];
  return { tools };
}

export async function dispatchOnyxchanTool(
  name: string,
  args: Record<string, unknown> | undefined,
  ctx: DispatchContext,
): Promise<DispatchToolResult> {
  const tool = ONYXCHAN_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      isError: true,
      error: {
        code: -32601,
        message: `Unknown MCP tool: ${name}`,
      },
      content: [{ type: "text", text: `Unknown MCP tool: ${name}` }],
    };
  }

  const callerKind = ctx.kind ?? ctx.caller?.kind ?? (ctx.role === "device" ? "device" : "user");
  if (callerKind === "device" && !DEVICE_TOOLS.has(name)) {
    return {
      isError: true,
      error: {
        code: 403,
        message: `Device tokens may not call ${name}`,
      },
      content: [{ type: "text", text: `Device tokens may not call ${name}` }],
    };
  }

  const valError = validateToolArgs(tool, args);
  if (valError) {
    return {
      isError: true,
      error: valError,
      content: [{ type: "text", text: valError.message }],
    };
  }

  const client = (ctx.client ?? ctx.supabase) as MinimalSupabaseClient;
  if (!client) {
    return {
      isError: true,
      error: {
        code: -32603,
        message: "No database client provided in dispatch context",
      },
      content: [{ type: "text", text: "No database client provided in dispatch context" }],
    };
  }

  try {
    // 1. move_head
    if (name === "move_head") {
      const pan = Math.max(-90, Math.min(90, Number(args?.pan) || 0));
      const tilt = Math.max(0, Math.min(90, Number(args?.tilt) || 0));
      await broadcastDeviceCommand(client, String(args?.device_id), {
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
      const duration = args?.duration !== undefined ? Number(args.duration) : undefined;
      await broadcastDeviceCommand(client, String(args?.device_id), {
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
      const language = String(args?.language || "es");
      await broadcastDeviceCommand(client, String(args?.device_id), {
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
      const details = Array.isArray(args?.details) ? (args.details as string[]) : [];
      const color = args?.color ? String(args.color) : VENDOR_COLORS[vendor] || VENDOR_COLORS.Default;
      const icon = args?.icon ? String(args.icon) : "tag";

      await broadcastDeviceCommand(client, String(args?.device_id), {
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

    // 5. display_inventory_card
    if (name === "display_inventory_card") {
      await broadcastDeviceCommand(client, String(args?.device_id), {
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

    // 6. get_robot_status
    if (name === "get_robot_status") {
      const deviceId = String(args?.device_id);
      const { data: dev } = await client
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

    // 7. ping_robot
    if (name === "ping_robot") {
      const startTime = Date.now();
      await broadcastDeviceCommand(client, String(args?.device_id), {
        action: "ping",
        timestamp: startTime,
      });
      return {
        content: [{ type: "text", text: `Ping heartbeat transmitted to ${args?.device_id} at ${new Date(startTime).toISOString()}` }],
      };
    }

    // 8. query_inventory
    if (name === "query_inventory") {
      let query = client.from("inventory").select("*").limit(Number(args?.limit) || 20);
      if (args?.search_term) {
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

    // 9. query_inventory_item
    if (name === "query_inventory_item") {
      const { data, error } = await client
        .from("inventory")
        .select("*")
        .eq("id", String(args?.item_id))
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // 10. query_payment_status
    if (name === "query_payment_status") {
      const { data, error } = await client
        .from("finance")
        .select("*")
        .eq("vendor_id", String(args?.vendor_id));
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }] };
    }

    // 11. app_change_view
    if (name === "app_change_view") {
      await broadcastStateUpdate(client, String(args?.device_id), "activeViewAtom", String(args?.view));
      return { content: [{ type: "text", text: `View changed to "${args?.view}" on user devices.` }] };
    }

    // 12. app_search_inventory
    if (name === "app_search_inventory") {
      await broadcastBatchUpdate(client, String(args?.device_id), [
        { atomName: "activeViewAtom", value: "inventory" },
        { atomName: "inventorySearchTermAtom", value: String(args?.search_term) },
      ]);
      return { content: [{ type: "text", text: `Searching inventory for "${args?.search_term}".` }] };
    }

    // 13. app_open_inventory_artifact
    if (name === "app_open_inventory_artifact") {
      await broadcastStateUpdate(client, String(args?.device_id), "inventoryArtifactConfigAtom", {
        isOpen: true,
        itemIds: args?.item_ids || [],
        title: String(args?.title || "OnyxChan Artifact"),
        viewMode: "modal",
        displayMode: "list",
      });
      return { content: [{ type: "text", text: `Inventory artifact opened on user screen.` }] };
    }

    // 14. app_open_add_item
    if (name === "app_open_add_item") {
      await broadcastStateUpdate(client, String(args?.device_id), "isUploadWizardOpenAtom", true);
      return { content: [{ type: "text", text: `Add Item wizard opened.` }] };
    }

    // 15. count_vendor_items
    if (name === "count_vendor_items") {
      const { count, error } = await client
        .from("inventory")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", String(args?.vendor_id));
      if (error) throw error;
      return { content: [{ type: "text", text: JSON.stringify({ vendor_id: args?.vendor_id, count: count ?? 0 }) }] };
    }

    // 16. resolve_tag
    if (name === "resolve_tag") {
      const tag = String(args?.tag ?? "");
      const { data, error } = await client
        .from("inventory")
        .select("item_id, vendor_id, short_description, book_barcode, status")
        .or(`book_barcode.eq.${sanitiseFilterTerm(tag)},item_id.eq.${sanitiseFilterTerm(tag)}`)
        .maybeSingle();
      if (error) throw error;
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? { found: false, tag }) }],
      };
    }

    return {
      isError: true,
      error: {
        code: -32601,
        message: `Unknown MCP tool: ${name}`,
      },
      content: [{ type: "text", text: `Unknown MCP tool: ${name}` }],
    };
  } catch (e: any) {
    const errMsg = e?.message ? String(e.message) : String(e);
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${errMsg}` }],
      isError: true,
    };
  }
}
