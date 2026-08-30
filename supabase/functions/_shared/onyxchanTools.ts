// =============================================================================
// OnyxChan tool manifest — the single source of truth for the tool surface.
// =============================================================================
// There were four divergent tool surfaces before this file existed:
//
//   supabase/functions/onyxchan-mcp   14 tools  (robot + data + app control)
//   Onyx.mx-Pico/mcp-ts-server         1 tool   (stackchan_say — a subset)
//   Onyx.mx-Pico/.../server/server.js  3 tools  (its own inventory query)
//   src/features/onyx/onyxTools.ts     9 tools  (in-browser, user session)
//
// Three of them queried columns that do not exist (`title`, `vendor`,
// `vendor_name`) and a table that does not exist (`finance_payments`), which is
// how we know none had ever run against the real database.
//
// The edge function is now the only remote executor. The LAN gateway is an MCP
// client of it rather than a second implementation, so adding a tool here
// reaches both. src/features/onyx/onyxTools.ts deliberately stays separate: it
// runs in the browser under the user's own session, so RLS still applies to it.
//
// Deno-importable and dependency-free on purpose — it must stay loadable from
// both the edge runtime and plain Node.
// =============================================================================

export interface OnyxChanTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const ONYXCHAN_TOOLS: OnyxChanTool[] = [
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

  // ── Added so the LAN gateway needs no database access of its own ──
  // It previously ran these two queries directly, against `vendor`,
  // `vendor_code`, `sku` and `nfc_id` — none of which exist on inventory.
  {
    name: "count_vendor_items",
    description: "Count inventory items belonging to a vendor prefix (e.g. 'EM', 'SU', 'AM').",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor prefix as stored in inventory.vendor_id." },
      },
      required: ["vendor_id"],
    },
  },
  {
    name: "resolve_tag",
    description: "Resolve a scanned NFC or QR tag to its inventory item, by printed barcode or item id.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "The scanned tag value (book_barcode or item_id)." },
      },
      required: ["tag"],
    },
  },
];

/** Tools the LAN gateway must not proxy: they run against local-network resources. */
export const GATEWAY_LOCAL_TOOLS = ["search_web", "query_local_ollama"] as const;
