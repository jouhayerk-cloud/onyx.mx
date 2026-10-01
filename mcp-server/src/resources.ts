import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Register all 8 Onyx.mx MCP resources onto the McpServer instance.
 */
export function registerResources(server: McpServer, supabase: SupabaseClient): void {
  // ── 1. onyx://schema/inventory ─────────────────────────────────────────────
  server.registerResource(
    "inventory_schema",
    "onyx://schema/inventory",
    {
      description: "Full schema of the inventory table with descriptions of all key columns, lifecycle statuses, and data types.",
      mimeType: "application/json",
    },
    async (uri) => {
      const schema = {
        table: "inventory",
        description: "Primary warehouse stone catalog table holding physical attributes, media, lifecycle status, pricing, and container tracking.",
        primaryKey: "id",
        columns: {
          id: { type: "uuid", description: "Internal unique UUID identifier for the inventory record." },
          item_id: { type: "text", description: "Human-readable tag or code prefix (e.g. 'EM-0042', 'MAR-101')." },
          item_number: { type: "integer", description: "Numeric sequence number of the item within the vendor or catalog batch." },
          workbook: { type: "text", description: "Source workbook or procurement batch identifier (e.g. '2026-08', 'WB-EM-01')." },
          vendor_id: { type: "text", description: "Vendor prefix or supplier code (e.g. 'EM', 'SU', 'CA', 'JM', 'AM', 'Ramses', 'Martha')." },
          status: {
            type: "text",
            description: "Current lifecycle state of the item.",
            values: ["Inventory", "Sold", "Reserved", "Shipped", "Pending Payment", "On Hold", "Sample"],
          },
          lifecycle_status: { type: "text", description: "Extended lifecycle tracking state." },
          material: {
            type: "text",
            description: "Primary mineral or stone material.",
            values: ["onyx", "marble", "fluorite", "calcite", "concrete", "travertine", "other"],
          },
          shape: {
            type: "text",
            description: "Physical geometry / shape classification.",
            values: ["cylinder", "squared", "fountain", "rustic_wine_rack", "round", "basin", "sphere", "rectangular", "other"],
          },
          color: { type: "text", description: "Primary recorded colour name (e.g. 'white', 'honey', 'amber', 'green')." },
          generated_color: { type: "text", description: "AI-normalized colour metadata." },
          generated_type: { type: "text", description: "AI-classified product type (e.g. 'Sink', 'Lamp', 'Vase', 'Table', 'Sculpture')." },
          short_description: { type: "text", description: "Brief product summary used on tags and condensed card views." },
          detailed_description: { type: "text", description: "Extended descriptive text outlining grain, texture, and visual character." },
          generated_description: { type: "text", description: "AI-synthesized product marketing copy." },
          quantity: { type: "integer", description: "Item quantity (normally 1 for unique stone pieces, or batch count)." },
          length_cm: { type: "numeric", description: "Physical length in centimetres." },
          width_cm: { type: "numeric", description: "Physical width in centimetres." },
          height_cm: { type: "numeric", description: "Physical height in centimetres." },
          weight_kg: { type: "numeric", description: "Net physical stone weight in kilograms." },
          price_mxn: { type: "numeric", description: "Cost price in MXN (cost-sensitive; restricted to finance roles)." },
          book_acquisition: { type: "numeric", description: "Direct acquisition cost in MXN (cost-sensitive; restricted to finance roles)." },
          book_landed: { type: "numeric", description: "Fully landed cost including logistics in MXN (cost-sensitive; restricted to finance roles)." },
          book_retail: { type: "numeric", description: "Public retail price in USD." },
          book_aq_code: { type: "text", description: "Encrypted cypher acquisition code." },
          book_land_code: { type: "text", description: "Encrypted cypher landed cost code." },
          book_barcode: { type: "text", description: "Printed barcode string encoded on physical thermal QR/barcode tags." },
          crate_id: { type: "text", description: "Identifier of the logistics crate or container holding this piece." },
          shipped: { type: "boolean", description: "Flag indicating whether item has departed the warehouse." },
          pack_date: { type: "date", description: "Date when item was packed into its crate." },
          sent_date: { type: "date", description: "Dispatch date." },
          sent_manifest_id: { type: "text", description: "Manifest ID under which the item was dispatched." },
          media_urls: { type: "text / json", description: "Array of raw uploaded photo/video URLs from Google Drive or storage." },
          processed_media_urls: { type: "text / json", description: "JSON map of original photos to AI background-removed cleaned image URLs." },
          generated_png_url: { type: "text", description: "High-resolution transparent cutout PNG hero image URL." },
          generated_svg_url: { type: "text", description: "Vector boundary contour SVG URL for CNC/visualization." },
          axo_icon_url: { type: "text", description: "Axonometric 3D render icon URL." },
          labels_printed_total: { type: "integer", description: "Audit counter of physical label prints generated for this item." },
          created_at: { type: "timestamptz", description: "Timestamp when record was created." },
          updated_at: { type: "timestamptz", description: "Timestamp of last modification." },
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(schema, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 2. onyx://schema/finance ───────────────────────────────────────────────
  server.registerResource(
    "finance_schema",
    "onyx://schema/finance",
    {
      description: "Schema of the finance table covering cash disbursements, expenses, vendor payments, and multi-currency exchange records.",
      mimeType: "application/json",
    },
    async (uri) => {
      const schema = {
        table: "finance",
        description: "Primary financial ledger table recording cash disbursements, vendor advances, operational expenses, and transport payments.",
        primaryKey: "id",
        accessControl: "Restricted to FINANCE_ROLES: Developer, Admin, ClientBoss, ClientAccounting.",
        columns: {
          id: { type: "uuid", description: "Unique transaction UUID." },
          type: {
            type: "text",
            description: "Transaction type classification.",
            values: ["payment", "expense", "disbursement", "transfer"],
          },
          category: {
            type: "text",
            description: "Primary cost category.",
            values: ["Acquisition", "Logistics", "Workshop", "Operational", "Administrative", "Other"],
          },
          subcategory: { type: "text", description: "Granular subcategory classification." },
          amount: { type: "numeric", description: "Monetary amount in the declared currency." },
          currency: {
            type: "text",
            description: "Currency of transaction.",
            values: ["MXN", "USD"],
          },
          exchange_rate: { type: "numeric", description: "Exchange rate applied (MXN per USD) at the time of the transaction." },
          commission: { type: "numeric", description: "Supplier or agent commission amount, if applicable." },
          payment_method: {
            type: "text",
            description: "Payment channel used.",
            values: ["wire", "cash", "credit_card", "debit_card", "transfer", "check"],
          },
          bank_account: { type: "text", description: "Destination bank account number, CLABE, or institution name." },
          reference: { type: "text", description: "External invoice number, bank reference, or payment voucher code." },
          vendor_id: { type: "text", description: "Vendor prefix or supplier ID receiving disbursement." },
          destination: { type: "text", description: "Payee entity or recipient description." },
          status: {
            type: "text",
            description: "Workflow approval and disbursement state.",
            values: ["pending", "approved", "paid", "cancelled"],
          },
          date: { type: "date", description: "Transaction date recorded in ledger." },
          pay_date: { type: "date", description: "Scheduled or effective payment date." },
          dispersed_at: { type: "timestamptz", description: "Timestamp when payment was disbursed." },
          requested_by: { type: "text", description: "Email or name of user who initiated the request." },
          approved_by: { type: "text", description: "Email or name of authorizing manager." },
          related_ids: { type: "text[]", description: "Array of related database entity IDs." },
          related_inventory_ids: { type: "text", description: "Associated inventory item IDs linking expenditure to physical stone." },
          notes: { type: "text", description: "Freeform accounting notes, memo, or receipt audit notes." },
          created_at: { type: "timestamptz", description: "Timestamp when transaction was logged." },
          updated_at: { type: "timestamptz", description: "Timestamp of last modification." },
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(schema, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 3. onyx://schema/logistics ─────────────────────────────────────────────
  server.registerResource(
    "logistics_schema",
    "onyx://schema/logistics",
    {
      description: "Schema of the logistics and shipments tables for crates, pallets, truck manifests, and dispatch records.",
      mimeType: "application/json",
    },
    async (uri) => {
      const schema = {
        tables: {
          logistics: {
            description: "Physical shipping containers (crates, pallets, cardboard boxes) and packing manifests.",
            primaryKey: "id",
            columns: {
              id: { type: "text / uuid", description: "Container identifier or UUID (e.g. 'CRATE-001', 'PALLET-A')." },
              type: {
                type: "text",
                description: "Container classification.",
                values: ["crate", "pallet", "cardboard"],
              },
              status: {
                type: "text",
                description: "Transit and packing status.",
                values: ["packing", "packed", "in_transit", "delivered", "customs_hold"],
              },
              truck_id: { type: "text", description: "Assigned transport truck ID or trailer plate." },
              truck_position: { type: "text", description: "Cargo bay position inside truck (e.g. 'Front-Left', 'Bay-3')." },
              carrier: { type: "text", description: "Freight carrier company or driver name." },
              tracking_number: { type: "text", description: "Carrier tracking code or waybill number." },
              origin: { type: "text", description: "Origin dispatch facility or warehouse." },
              destination_address: { type: "text", description: "Final consignee or delivery destination address." },
              length_cm: { type: "numeric", description: "External container length in cm." },
              width_cm: { type: "numeric", description: "External container width in cm." },
              height_cm: { type: "numeric", description: "External container height in cm." },
              weight_kg: { type: "numeric", description: "Gross weight including container tare and stone cargo in kg." },
              crate_count: { type: "integer", description: "Number of crates grouped if this record is a master pallet." },
              pallet_count: { type: "integer", description: "Pallet count." },
              quantity: { type: "integer", description: "Total inventory item count packed inside." },
              customs_status: { type: "text", description: "Customs clearance and import/export inspection status." },
              insurance_value: { type: "numeric", description: "Declared cargo insurance valuation." },
              freight_cost: { type: "numeric", description: "Freight shipping charge." },
              cost_mxn: { type: "numeric", description: "Total container fabrication / packing cost in MXN." },
              inventory_ids: { type: "text", description: "Comma-separated or serialized inventory item IDs contained." },
              contents_summary: { type: "text", description: "Summary description of packed goods." },
              vendor_id: { type: "text", description: "Primary vendor prefix associated with cargo." },
              vendors: { type: "text", description: "Comma-separated list of all vendor prefixes with items inside." },
              date: { type: "date", description: "Packing or container creation date." },
              ship_date: { type: "date", description: "Dispatch date." },
            },
          },
          shipments: {
            description: "Official dispatch manifests and bills of lading containing complete JSONB cargo snapshots.",
            primaryKey: "id",
            columns: {
              id: { type: "uuid", description: "Unique shipment UUID." },
              manifest_id: { type: "text", description: "Unique human-readable manifest identifier (e.g. 'MAN-2026-001')." },
              payload: { type: "jsonb", description: "Full immutable JSON snapshot of all crates, items, weights, and destinations." },
              metadata: { type: "jsonb", description: "Logistics carrier details, truck license, seal tags, and driver info." },
              timestamp: { type: "timestamptz", description: "Dispatch departure timestamp." },
              updated_at: { type: "timestamptz", description: "Timestamp of last status update." },
            },
          },
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(schema, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 4. onyx://schema/production ────────────────────────────────────────────
  server.registerResource(
    "production_schema",
    "onyx://schema/production",
    {
      description: "Schema of the production table tracking workshop manufacturing orders, artisan progress, advances, and completions.",
      mimeType: "application/json",
    },
    async (uri) => {
      const schema = {
        table: "production",
        description: "Workshop manufacturing order tracking for artisan stonemasons, carving batches, and custom orders.",
        primaryKey: "id",
        columns: {
          id: { type: "uuid", description: "Unique production order UUID." },
          tag_id: { type: "text", description: "Work order reference code or assigned piece tag ID." },
          vendor_id: { type: "text", description: "Artisan workshop prefix (e.g. 'EM', 'SU', 'CA', 'JM', 'AM')." },
          description: { type: "text", description: "Detailed carving and fabrication specifications for the piece." },
          quantity: { type: "integer", description: "Target piece quantity." },
          price_unit: { type: "numeric", description: "Agreed unit artisan cost in MXN." },
          advance: { type: "numeric", description: "Cash advance disbursed to artisan workshop." },
          total: { type: "numeric", description: "Total order contract value in MXN." },
          progress: { type: "numeric", description: "Production completion percentage (0 to 100)." },
          status: {
            type: "text",
            description: "Production lifecycle stage.",
            values: ["pending", "in_progress", "ready", "delivered", "cancelled"],
          },
          ready_date: { type: "date", description: "Target or actual completion date." },
          rating: { type: "numeric", description: "Artisan work quality inspection rating (1 to 5 stars)." },
          is_hidden: { type: "boolean", description: "Archived or soft-deleted order flag." },
          hidden_reason: { type: "text", description: "Explanation if order was archived." },
          updated_at: { type: "timestamptz", description: "Last progress or status update timestamp." },
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(schema, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 5. onyx://stats/overview ───────────────────────────────────────────────
  server.registerResource(
    "stats_overview",
    "onyx://stats/overview",
    {
      description: "Live operational metrics and inventory counts queried directly from Supabase.",
      mimeType: "application/json",
    },
    async (uri) => {
      // Run parallel lightweight count queries
      const [
        totalInvResult,
        activeInvResult,
        soldInvResult,
        totalCratesResult,
        activeOrdersResult,
        exchangeRateResult,
      ] = await Promise.all([
        supabase.from("inventory").select("*", { count: "exact", head: true }),
        supabase.from("inventory").select("*", { count: "exact", head: true }).eq("status", "Inventory"),
        supabase.from("inventory").select("*", { count: "exact", head: true }).eq("status", "Sold"),
        supabase.from("logistics").select("*", { count: "exact", head: true }),
        supabase.from("production").select("*", { count: "exact", head: true }).not("status", "in", '("delivered","cancelled")'),
        supabase.from("settings").select("value").eq("key", "exchange_rate").maybeSingle(),
      ]);

      const exchangeRate = Number(exchangeRateResult.data?.value) || 17.0;

      const overview = {
        timestamp: new Date().toISOString(),
        inventory: {
          total_items: totalInvResult.count ?? 0,
          in_stock: activeInvResult.count ?? 0,
          sold: soldInvResult.count ?? 0,
        },
        logistics: {
          total_containers: totalCratesResult.count ?? 0,
        },
        production: {
          active_orders: activeOrdersResult.count ?? 0,
        },
        rates: {
          exchange_rate_mxn_usd: exchangeRate,
        },
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(overview, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 6. onyx://config/vendors ───────────────────────────────────────────────
  server.registerResource(
    "config_vendors",
    "onyx://config/vendors",
    {
      description: "List of known vendor codes and supplier prefixes with names and brand styling colours.",
      mimeType: "application/json",
    },
    async (uri) => {
      const vendors = [
        { prefix: "AM", name: "Alejandro Meza", color: "#9b1c31", description: "Sculptures and carved pedestals" },
        { prefix: "AN", name: "Angel Cabrera", color: "#f1c40f", description: "Rustic lamps and travertine" },
        { prefix: "BT", name: "Bernardo", color: "#8b4513", description: "Stoneware and bowls" },
        { prefix: "CA", name: "Carlos Arenas", color: "#85C1E9", description: "Onyx basins and sinks" },
        { prefix: "CP", name: "Cantera Puebla", color: "#C71585", description: "Architectural cantera and panels" },
        { prefix: "DH", name: "Delfino Hernandez", color: "#8DC63F", description: "Geometric cylinders and accessories" },
        { prefix: "EM", name: "Emmanuel", color: "#00AEEF", description: "Fine polished onyx and spheres" },
        { prefix: "FR", name: "Fountain Rock", color: "#F36F21", description: "Water features and outdoor stone" },
        { prefix: "GE", name: "Gerardo De Gante", color: "#F89406", description: "Turned stone vases and vessels" },
        { prefix: "IH", name: "Ismael Huerta", color: "#F39C12", description: "Rustic wine racks and blocks" },
        { prefix: "JM", name: "Jose Meza", color: "#48C9B0", description: "Artisan onyx lighting and monoliths" },
        { prefix: "ML", name: "Maria Luisa", color: "#FFA07A", description: "Fine carving and translucent slabs" },
        { prefix: "MM", name: "MM", color: "#8E44AD", description: "Workshop items and accessories" },
        { prefix: "RF", name: "Roberto Florita", color: "#16A085", description: "Calcite and mineral specimens" },
        { prefix: "SU", name: "Susana", color: "#B19CD9", description: "Luxury onyx homeware and trays" },
        { prefix: "TE", name: "Tellez Taller", color: "#F1C40F", description: "Custom stone fabrication" },
        { prefix: "Ramses", name: "Ramses", color: "#737104", description: "Curated collection and executive" },
        { prefix: "Martha", name: "Martha", color: "#4f2068", description: "Design director collection" },
        { prefix: "Alejandra", name: "Alejandra", color: "#1a6b5a", description: "Operations and catalog" },
        { prefix: "Carolina", name: "Carolina", color: "#8b2252", description: "Commercial inventory" },
      ];

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ vendors, count: vendors.length }, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 7. onyx://config/settings ──────────────────────────────────────────────
  server.registerResource(
    "config_settings",
    "onyx://config/settings",
    {
      description: "Application key-value configuration settings fetched from the settings table.",
      mimeType: "application/json",
    },
    async (uri) => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .order("key", { ascending: true });

      if (error) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: error.message }, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      }

      const settingsMap: Record<string, unknown> = {};
      for (const row of data || []) {
        settingsMap[row.key] = row.value;
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ settings: settingsMap, raw: data }, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ── 8. onyx://config/app ───────────────────────────────────────────────────
  server.registerResource(
    "config_app",
    "onyx://config/app",
    {
      description: "Application runtime version, technology stack architecture, and module catalog.",
      mimeType: "application/json",
    },
    async (uri) => {
      const appInfo = {
        name: "Onyx.mx Warehouse & Logistics Platform",
        version: "v1.81.29",
        environment: "production",
        tech_stack: {
          frontend_framework: "React 19 with Vite 6",
          styling: "Tailwind CSS v4 with custom SLAB glass design system",
          database: "Supabase (PostgreSQL 15) with Row-Level Security",
          offline_sync: "RxDB 16 with IndexedDB (Dexie) replication engine",
          graphics_3d: "Three.js with WebGL PBR parametric profiles and GLTF pipeline",
          ai_pipeline: "Google Gemini 2.5 Flash, @imgly/background-removal, SVG vector contouring",
          hardware_iot: "Raspberry Pi Pico W (OnyxChan IoT Robot), ST25R NFC, ESC/POS thermal printers",
          mcp_server: "Node.js Model Context Protocol Server (@modelcontextprotocol/sdk v1.12+)",
        },
        module_catalog: [
          {
            id: "catalog",
            name: "Catalog & Inventory",
            description: "Stone inventory search, physical dimension tracking, image cleaning, batch processing wizard, and thermal label printing.",
          },
          {
            id: "finance",
            name: "Finance & Accounting",
            description: "Multi-currency ledger (MXN/USD), vendor obligations, cash disbursements, and expense tracking.",
          },
          {
            id: "logistics",
            name: "Logistics & Packing",
            description: "Crate and pallet packaging, truck manifest weight distribution, bay loading, and dispatch bills of lading.",
          },
          {
            id: "production",
            name: "Workshop Production",
            description: "Artisan manufacturing orders, carving progress tracking, and advance payment management.",
          },
          {
            id: "labs_3d",
            name: "Labs 3D & Showroom",
            description: "Parametric lathe/extrude mesh generation, Three.js showroom, and AR asset generation.",
          },
          {
            id: "pico_bridge",
            name: "OnyxChan IoT Bridge",
            description: "Hardware telemetry, pan/tilt head control, avatar expressions, and RFID tag resolution.",
          },
          {
            id: "admin",
            name: "System Administration",
            description: "RBAC user management, settings KV store, and label reprint audit logs.",
          },
        ],
      };

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(appInfo, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
