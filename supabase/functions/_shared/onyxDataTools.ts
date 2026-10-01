// =============================================================================
// Onyx.mx Data MCP tool manifest — the single source of truth for data tools.
// =============================================================================
// This module defines the complete MCP tool surface for Onyx.mx data operations
// across Inventory, Finance, Logistics, Production, System, and Display domains.
//
// Access Control & Security:
//   The MCP server executes using SUPABASE_SERVICE_ROLE_KEY which bypasses
//   Row Level Security (RLS). Consequently, all role-based access control,
//   vendor isolation, and cost data redaction must be strictly enforced in
//   application code using the metadata declared on each tool:
//
//   - requiredRoles: Array of app_users roles permitted to invoke the tool.
//   - costSensitive: When true, acquisition, landed, and cypher cost columns
//     (COST_COLUMNS) must be redacted unless the caller holds a FINANCE_ROLES role.
//   - vendorScoped: When true, queries invoked by a 'Vendor' role caller must
//     have their results scoped strictly to the caller's assigned vendor_id.
//
// Deno-importable and dependency-free on purpose — it must stay loadable from
// both the edge runtime and plain Node environments with ZERO external imports.
// =============================================================================

export interface OnyxDataTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredRoles: string[];     // roles allowed to call this tool
  costSensitive?: boolean;     // if true, strip cost columns for non-finance roles
  vendorScoped?: boolean;      // if true, inject vendor_id filter for Vendor callers
}

// ── Role Sets ─────────────────────────────────────────────────────────────────
// Plain string arrays (not Set) to ensure JSON-serializability across Deno and Node.
export const FINANCE_ROLES: string[] = [
  "Developer",
  "Admin",
  "ClientBoss",
  "ClientAccounting",
];

export const WRITE_ROLES: string[] = [
  "Developer",
  "Admin",
];

export const ALL_STAFF: string[] = [
  "Developer",
  "Admin",
  "ClientBoss",
  "ClientAccounting",
  "ClientViewer",
  "Vendor",
  "Client",
];

export const INTERNAL_STAFF: string[] = [
  "Developer",
  "Admin",
  "ClientBoss",
  "ClientAccounting",
  "ClientViewer",
];

// ── Constants ─────────────────────────────────────────────────────────────────
export const MAX_LIMIT = 200;

export const COST_COLUMNS: string[] = [
  "price_mxn",
  "book_acquisition",
  "book_landed",
  "book_aq_code",
  "book_land_code",
];

// ── Tool Definitions ──────────────────────────────────────────────────────────
export const ONYX_DATA_TOOLS: OnyxDataTool[] = [
  // ── Inventory Tools (10) ───────────────────────────────────────────────────
  {
    name: "inventory_search",
    description: "Search and filter warehouse inventory records by query keyword, vendor prefix, lifecycle status, material, shape, or workbook batch. Supports pagination up to MAX_LIMIT. Acquisition and landed cost columns are automatically redacted for non-finance callers. For Vendor callers, results are strictly scoped to their own vendor_id.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword matching descriptions, item codes, tags, or barcodes.",
        },
        vendor_id: {
          type: "string",
          description: "Vendor prefix code (e.g. 'EM', 'SU', 'AM', 'Ramses', 'Martha').",
        },
        status: {
          type: "string",
          description: "Inventory lifecycle status (e.g. 'Inventory', 'Sold', 'Reserved', 'Shipped', 'Pending').",
        },
        material: {
          type: "string",
          description: "Material type filter (e.g. 'onyx', 'marble', 'fluorite', 'calcite', 'travertine').",
        },
        shape: {
          type: "string",
          description: "Shape classification (e.g. 'cylinder', 'squared', 'fountain', 'round', 'sphere', 'basin').",
        },
        workbook: {
          type: "string",
          description: "Source workbook or procurement batch identifier.",
        },
        limit: {
          type: "integer",
          description: "Maximum records to return (1-200, default 20).",
          default: 20,
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "integer",
          description: "Pagination offset for skipping initial records (default 0).",
          default: 0,
          minimum: 0,
        },
      },
    },
    requiredRoles: ALL_STAFF,
    costSensitive: true,
    vendorScoped: true,
  },
  {
    name: "inventory_get_item",
    description: "Retrieve comprehensive details for a single inventory item by database UUID (id) or human-readable item_id (e.g. 'EM-0123'). Returns physical dimensions, weight, status, descriptions, and media. Cost fields are stripped for non-finance callers. Scoped to vendor for Vendor callers.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Internal database UUID of the inventory record.",
        },
        item_id: {
          type: "string",
          description: "Human-readable item identifier or tag code (e.g. 'EM-0042', 'MAR-101').",
        },
      },
    },
    requiredRoles: ALL_STAFF,
    costSensitive: true,
    vendorScoped: true,
  },
  {
    name: "inventory_get_by_barcode",
    description: "Resolve a scanned physical barcode or printed label tag (book_barcode or item_id) to an inventory record. Primary tool for warehouse floor barcode scanning, physical label verification, and intake audits.",
    inputSchema: {
      type: "object",
      properties: {
        barcode: {
          type: "string",
          description: "The scanned barcode text or printed tag identifier (book_barcode or item_id).",
        },
      },
      required: ["barcode"],
    },
    requiredRoles: ALL_STAFF,
    vendorScoped: true,
  },
  {
    name: "inventory_list_by_crate",
    description: "List all inventory items currently packed into a designated logistics crate or container. Returns item identifiers, dimensions, weights, and descriptions for crate manifest packing verification.",
    inputSchema: {
      type: "object",
      properties: {
        crate_id: {
          type: "string",
          description: "Unique identifier or container code of the crate (e.g. 'CRATE-042', 'PALLET-A').",
        },
        limit: {
          type: "integer",
          description: "Maximum items to return (1-200, default 50).",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
      required: ["crate_id"],
    },
    requiredRoles: INTERNAL_STAFF,
    vendorScoped: true,
  },
  {
    name: "inventory_list_by_vendor",
    description: "List inventory items belonging to a specific vendor prefix with summary metadata. Supports status filtering and pagination. Scoped automatically for vendor callers, and cost fields are redacted for non-finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: {
          type: "string",
          description: "Vendor prefix code (e.g. 'EM', 'SU', 'Ramses', 'Martha').",
        },
        status: {
          type: "string",
          description: "Optional lifecycle status filter (e.g. 'Inventory', 'Sold', 'Pending Payment').",
        },
        limit: {
          type: "integer",
          description: "Maximum items to return (1-200, default 50).",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "integer",
          description: "Pagination offset for slicing through records (default 0).",
          default: 0,
          minimum: 0,
        },
      },
      required: ["vendor_id"],
    },
    requiredRoles: ALL_STAFF,
    costSensitive: true,
    vendorScoped: true,
  },
  {
    name: "inventory_count_by_status",
    description: "Count inventory items grouped by lifecycle status (e.g. 'Inventory', 'Sold', 'Reserved', 'Shipped'). Essential for stock auditing, warehouse health checks, and dashboard metrics.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: {
          type: "string",
          description: "Optional vendor prefix to filter counts to a single supplier.",
        },
        workbook: {
          type: "string",
          description: "Optional workbook batch name to scope counts to a specific procurement batch.",
        },
      },
    },
    requiredRoles: ALL_STAFF,
    vendorScoped: true,
  },
  {
    name: "inventory_count_by_vendor",
    description: "Count inventory items grouped by vendor prefix across the catalog. Provides supplier-level inventory volume breakdown. Accessible only to internal staff.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional status filter to count only items with that status (e.g. 'Inventory').",
        },
        workbook: {
          type: "string",
          description: "Optional workbook batch name to filter counts.",
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
    vendorScoped: true,
  },
  {
    name: "inventory_get_pricing",
    description: "Retrieve comprehensive pricing details for an inventory item, including MXN price, acquisition cost (book_acquisition), landed cost (book_landed), retail price (book_retail), and cypher codes (book_aq_code, book_land_code). Restricted strictly to finance roles. Non-finance callers must never receive cost data (matching artifact/index.ts security rules).",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID or item_id of the inventory item to fetch pricing for.",
        },
      },
      required: ["id"],
    },
    requiredRoles: FINANCE_ROLES,
    costSensitive: true,
    vendorScoped: true,
  },
  {
    name: "inventory_get_media",
    description: "Retrieve all media URLs and photography assets for an inventory item, including raw uploads (media_urls), background-processed clean photos (processed_media_urls), hero cutouts (generated_png_url), vector contours (generated_svg_url), and isometric icons (axo_icon_url).",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID or item_id of the inventory item.",
        },
      },
      required: ["id"],
    },
    requiredRoles: ALL_STAFF,
    vendorScoped: true,
  },
  {
    name: "inventory_get_segmentation",
    description: "Retrieve AI vision segmentation and geometric contour data for an item from item_segmentation. Returns 2D polygon contour points, SVG vector data, cutout PNG file references, and source image dimensions for visualization and bounding.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "Inventory item UUID linking to item_segmentation.",
        },
        angle_index: {
          type: "integer",
          description: "Optional camera angle index (0, 1, 2, 3) for multi-angle captures.",
        },
      },
      required: ["item_id"],
    },
    requiredRoles: INTERNAL_STAFF,
    vendorScoped: true,
  },

  // ── Finance Tools (5) ───────────────────────────────────────────────────────
  {
    name: "finance_list_transactions",
    description: "Query financial records from the finance table with multi-currency support (MXN/USD). Supports filtering by transaction type, expense category, vendor ID, approval status, and date range. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Transaction type (e.g. 'payment', 'expense', 'disbursement', 'transfer').",
        },
        category: {
          type: "string",
          description: "Financial category (e.g. 'Acquisition', 'Logistics', 'Workshop', 'Operational').",
        },
        vendor_id: {
          type: "string",
          description: "Vendor prefix or identifier to filter disbursements.",
        },
        status: {
          type: "string",
          description: "Transaction workflow status (e.g. 'pending', 'approved', 'paid', 'cancelled').",
        },
        date_from: {
          type: "string",
          description: "Start date filter in ISO format (YYYY-MM-DD).",
        },
        date_to: {
          type: "string",
          description: "End date filter in ISO format (YYYY-MM-DD).",
        },
        limit: {
          type: "integer",
          description: "Maximum transactions to return (1-200, default 50).",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "integer",
          description: "Pagination offset for skipping initial records (default 0).",
          default: 0,
          minimum: 0,
        },
      },
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "finance_get_transaction",
    description: "Retrieve complete details for a single financial transaction record by its UUID, including monetary amounts, currency, exchange rate, payment method, bank account details, reference codes, and linked inventory IDs. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID of the finance record.",
        },
      },
      required: ["id"],
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "finance_vendor_summary",
    description: "Calculate a financial summary and obligations breakdown for a specific vendor, including total disbursements paid, pending payments, commission amounts, and currency breakdown. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: {
          type: "string",
          description: "Vendor prefix or supplier identifier (e.g. 'EM', 'SU', 'Ramses', 'Martha').",
        },
      },
      required: ["vendor_id"],
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "finance_monthly_summary",
    description: "Aggregate monthly financial performance metrics, cash disbursements, and expenses grouped by category and currency. Provides cash outflow analysis for management accounting. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "integer",
          description: "Month number (1 to 12). Defaults to current month if omitted.",
          minimum: 1,
          maximum: 12,
        },
        year: {
          type: "integer",
          description: "Four-digit calendar year (e.g. 2026). Defaults to current year if omitted.",
        },
        currency: {
          type: "string",
          description: "Currency code filter (e.g. 'MXN', 'USD'). If omitted, aggregates across currencies.",
        },
      },
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "finance_linked_items",
    description: "Retrieve all physical inventory items linked to a specific finance transaction via related_inventory_ids or related_ids. Enables reconciliation of purchase payments against warehouse stone stock. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        finance_id: {
          type: "string",
          description: "Database UUID of the finance transaction record.",
        },
      },
      required: ["finance_id"],
    },
    requiredRoles: FINANCE_ROLES,
  },

  // ── Logistics Tools (6) ─────────────────────────────────────────────────────
  {
    name: "logistics_list_containers",
    description: "List shipping containers, crates, and pallets with optional filtering by container type, transit status, assigned truck ID, or associated vendor. Returns container dimensions, gross weights, and tracking codes.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["crate", "pallet", "cardboard"],
          description: "Container type filter: 'crate', 'pallet', or 'cardboard'.",
        },
        status: {
          type: "string",
          description: "Logistics status filter (e.g. 'packing', 'packed', 'in_transit', 'delivered').",
        },
        truck_id: {
          type: "string",
          description: "Truck identifier or transport manifest ID.",
        },
        vendor_id: {
          type: "string",
          description: "Vendor prefix filter for containers holding vendor items.",
        },
        limit: {
          type: "integer",
          description: "Maximum containers to return (1-200, default 50).",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "logistics_get_container",
    description: "Retrieve comprehensive details for a shipping container (crate or pallet) by UUID or identifier, including physical dimensions, tare/gross weight, truck assignment, customs status, and complete list of packed inventory items.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID or container code (e.g. 'CRATE-001').",
        },
      },
      required: ["id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "logistics_get_shipment",
    description: "Retrieve a complete shipment dispatch record by manifest_id from the shipments table, including JSONB packing payloads, truck manifest metadata, delivery milestones, and destination addresses.",
    inputSchema: {
      type: "object",
      properties: {
        manifest_id: {
          type: "string",
          description: "Unique shipment manifest identifier (e.g. 'MAN-2026-001').",
        },
      },
      required: ["manifest_id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "logistics_list_shipments",
    description: "List all shipment dispatch manifests ordered by timestamp. Supports pagination across historical logistics manifests and freight dispatches.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum shipment records to return (1-200, default 20).",
          default: 20,
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "integer",
          description: "Pagination offset for skipping initial records (default 0).",
          default: 0,
          minimum: 0,
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "logistics_truck_summary",
    description: "Generate an aggregated packing and weight distribution summary for a specific transport truck. Calculates total container count, crate/pallet breakdown, gross cargo weight in kg, and freight positions.",
    inputSchema: {
      type: "object",
      properties: {
        truck_id: {
          type: "string",
          description: "Truck identifier, trailer plate, or transport code (e.g. 'TRUCK-01', 'FREIGHT-45').",
        },
      },
      required: ["truck_id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "logistics_container_contents",
    description: "Retrieve all individual inventory items currently packed inside a container or crate. Returns item IDs, materials, shapes, quantities, and weights for customs inspection and manifest verification.",
    inputSchema: {
      type: "object",
      properties: {
        container_id: {
          type: "string",
          description: "Unique container or crate identifier (matches logistics.id or inventory.crate_id).",
        },
      },
      required: ["container_id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },

  // ── Production Tools (2) ────────────────────────────────────────────────────
  {
    name: "production_list_orders",
    description: "List workshop manufacturing orders from the production table. Supports filtering by vendor artisan workshop, order status (e.g. 'pending', 'in_progress', 'ready'), and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: {
          type: "string",
          description: "Vendor artisan or workshop prefix (e.g. 'EM', 'SU').",
        },
        status: {
          type: "string",
          description: "Production status filter (e.g. 'pending', 'in_progress', 'ready', 'delivered').",
        },
        limit: {
          type: "integer",
          description: "Maximum production orders to return (1-200, default 50).",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "production_get_order",
    description: "Retrieve full details for a workshop production order by UUID or tag_id. Shows item descriptions, target quantities, unit price, advance payment disbursed, total valuation, and completion progress percentage.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID or tag_id of the production order.",
        },
      },
      required: ["id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },

  // ── System Tools (5) ────────────────────────────────────────────────────────
  {
    name: "system_list_users",
    description: "List registered application users from app_users, including RBAC roles (Developer, Admin, ClientBoss, ClientAccounting, ClientViewer, Vendor, Client), active status, and vendor prefix bindings. Restricted to write roles (Developer and Admin).",
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description: "Filter by role: 'Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor', or 'Client'.",
        },
        active_only: {
          type: "boolean",
          description: "If true, return only active users (is_active = true). Default true.",
          default: true,
        },
      },
    },
    requiredRoles: WRITE_ROLES,
  },
  {
    name: "system_get_settings",
    description: "Retrieve application key-value configuration settings from the settings table (e.g. exchange_rate, feature flags, warehouse parameters). Restricted to internal staff.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Optional specific settings key to look up. If omitted, returns all settings.",
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "system_get_exchange_rate",
    description: "Retrieve the current official MXN/USD foreign exchange conversion rate used across the application for pricing calculations, billing, and financial reporting.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    requiredRoles: ALL_STAFF,
  },
  {
    name: "system_list_devices",
    description: "List registered OnyxChan IoT robot devices and hardware gateways from onyxchan_devices. Shows device name, MAC/ID, online status, battery percentage, WiFi RSSI signal strength, firmware version, and linked accessories.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional device connection status filter (e.g. 'online', 'offline', 'error', 'charging').",
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "system_get_print_jobs",
    description: "Retrieve recent thermal label printing jobs and item print audit logs from print_jobs. Returns batch counts, label sizes, reprint status, and timestamps. Restricted to internal staff.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum print jobs to return (1-200, default 20).",
          default: 20,
          minimum: 1,
          maximum: 200,
        },
      },
    },
    requiredRoles: INTERNAL_STAFF,
  },

  // ── Display Tools (5) ───────────────────────────────────────────────────────
  {
    name: "display_item_card",
    description: "Render an elegant, human-readable Markdown product card for an inventory item. Formats photography, physical dimensions, material, shape, status, and USD retail price. Acquisition and landed costs are redacted unless caller holds a finance role. Scoped to vendor for Vendor callers.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Database UUID or item_id of the inventory item to render.",
        },
      },
      required: ["id"],
    },
    requiredRoles: ALL_STAFF,
    costSensitive: true,
    vendorScoped: true,
  },
  {
    name: "display_vendor_report",
    description: "Generate a formatted Markdown vendor performance and financial dashboard report. Displays total catalog items, active stock, recent disbursements, and pending obligations for a supplier. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: {
          type: "string",
          description: "Vendor code prefix (e.g. 'EM', 'SU', 'Ramses', 'Martha').",
        },
      },
      required: ["vendor_id"],
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "display_crate_manifest",
    description: "Generate a formatted Markdown packing manifest and bill of lading for a shipping crate or pallet. Includes item table with tag IDs, physical dimensions, weights, and total gross crate weight.",
    inputSchema: {
      type: "object",
      properties: {
        crate_id: {
          type: "string",
          description: "Unique crate or container identifier (e.g. 'CRATE-001').",
        },
      },
      required: ["crate_id"],
    },
    requiredRoles: INTERNAL_STAFF,
  },
  {
    name: "display_financial_report",
    description: "Generate an executive Markdown financial report summarizing cash disbursements, acquisitions, workshop advances, logistics expenses, and currency exposure across an optional date range and vendor filter. Restricted to finance roles.",
    inputSchema: {
      type: "object",
      properties: {
        date_from: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD).",
        },
        date_to: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD).",
        },
        vendor_id: {
          type: "string",
          description: "Optional vendor prefix to filter report to a specific supplier.",
        },
      },
    },
    requiredRoles: FINANCE_ROLES,
  },
  {
    name: "display_inventory_dashboard",
    description: "Generate a comprehensive Markdown warehouse inventory dashboard. Features status breakdowns (Inventory, Sold, Shipped), material and shape distributions, stock totals, and volume metrics. Scoped automatically for vendor callers.",
    inputSchema: {
      type: "object",
      properties: {
        workbook: {
          type: "string",
          description: "Optional workbook batch name to scope dashboard metrics.",
        },
        vendor_id: {
          type: "string",
          description: "Optional vendor prefix to filter dashboard metrics.",
        },
      },
    },
    requiredRoles: ALL_STAFF,
    vendorScoped: true,
  },
];
