import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register all 4 Onyx.mx MCP prompts onto the McpServer instance.
 */
export function registerPrompts(server: McpServer): void {
  // ── 1. analyze_vendor ───────────────────────────────────────────────────────
  server.registerPrompt(
    "analyze_vendor",
    {
      title: "Analyze Vendor Inventory & Financial Performance",
      description: "Generates a structured workflow for an agent to evaluate a supplier's catalog volume, stock status breakdown, and financial obligations.",
      argsSchema: {
        vendor_id: z.string().describe("Vendor prefix code (e.g. 'EM', 'SU', 'CA', 'JM', 'AM', 'Ramses', 'Martha')"),
      },
    },
    async ({ vendor_id }) => {
      return {
        description: `Vendor performance analysis for supplier '${vendor_id}'`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please conduct a comprehensive inventory and financial analysis for vendor '${vendor_id}'.

Follow this operational checklist:

1. **Inventory Volume & Status Breakdown**:
   - Call \`inventory_count_by_status\` with \`vendor_id: "${vendor_id}"\` to get the volume of items across each status (Inventory, Sold, Reserved, Shipped, Pending Payment).
   - Call \`inventory_list_by_vendor\` with \`vendor_id: "${vendor_id}"\` to sample the vendor's items, materials, and product shapes.

2. **Financial Position & Obligations**:
   - Call \`finance_vendor_summary\` with \`vendor_id: "${vendor_id}"\` to calculate total disbursements paid, pending payments, and commissions.
   - Call \`finance_list_transactions\` with \`vendor_id: "${vendor_id}"\` to inspect recent payment history and bank account details.

3. **Workshop & Production Status**:
   - Call \`production_list_orders\` with \`vendor_id: "${vendor_id}"\` to inspect active manufacturing orders, carving progress, and cash advances disbursed.

4. **Synthesis & Executive Report**:
   - Generate a clear summary of active stock vs sold stock.
   - Note any overdue pending disbursements or outstanding workshop orders.
   - Call \`display_vendor_report\` with \`vendor_id: "${vendor_id}"\` to produce a clean Markdown vendor dashboard.`,
            },
          },
        ],
      };
    }
  );

  // ── 2. prepare_shipment ────────────────────────────────────────────────────
  server.registerPrompt(
    "prepare_shipment",
    {
      title: "Prepare & Audit Truck Shipment Manifest",
      description: "Checklist and steps for auditing crates, pallets, and packed items for a specific transport truck.",
      argsSchema: {
        truck_id: z.string().describe("Transport truck identifier or trailer plate (e.g. 'TRUCK-01', 'FREIGHT-45')"),
      },
    },
    async ({ truck_id }) => {
      return {
        description: `Shipment preparation and crate manifest audit for truck '${truck_id}'`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please prepare and audit the cargo manifest for transport truck '${truck_id}'.

Follow this systematic shipping inspection checklist:

1. **Truck Overview & Cargo Weight**:
   - Call \`logistics_truck_summary\` with \`truck_id: "${truck_id}"\` to retrieve total container count, crate/pallet breakdown, and gross cargo weight in kg.
   - Verify that total cargo weight complies with transport axle limits.

2. **Container Inspection**:
   - Call \`logistics_list_containers\` with \`truck_id: "${truck_id}"\` to list all containers assigned to this truck.
   - Check container status (e.g. 'packed' vs 'packing'), physical dimensions (length, width, height), and cargo bay loading positions (\`truck_position\`).

3. **Item Packing Verification**:
   - For each container, call \`logistics_container_contents\` using the container ID to inspect individual items packed inside.
   - Verify that all packed pieces have recorded weights and dimensions.

4. **Customs & Documentation Audit**:
   - Verify that \`customs_status\` is recorded and cleared for international freight.
   - Confirm carrier details (\`carrier\`), tracking number, and destination address.

5. **Manifest Generation**:
   - Call \`display_crate_manifest\` for key crates to generate preview packing slips.
   - Output a consolidated bill of lading and flag any unpackaged items, missing weights, or unverified QR barcodes.`,
            },
          },
        ],
      };
    }
  );

  // ── 3. audit_inventory ─────────────────────────────────────────────────────
  server.registerPrompt(
    "audit_inventory",
    {
      title: "Audit Inventory Catalog Health",
      description: "Instructions for auditing missing descriptions, unlinked media, missing dimensions, and pricing anomalies.",
      argsSchema: {
        workbook: z.string().optional().describe("Optional workbook batch or procurement batch identifier to scope the audit (e.g. '2026-08', 'WB-EM-01')"),
      },
    },
    async ({ workbook }) => {
      const scopeText = workbook ? `workbook '${workbook}'` : "the active warehouse catalog";
      return {
        description: `Inventory health and data completeness audit for ${scopeText}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please perform a comprehensive catalog data quality audit for ${scopeText}.

Execute the audit following these steps:

1. **Inventory Scan**:
   - Call \`inventory_search\`${workbook ? ` with \`workbook: "${workbook}"\`` : ""} with \`limit: 100\` to inspect item records.

2. **Descriptions Audit**:
   - Check for items missing \`short_description\`, \`detailed_description\`, or \`generated_description\`.
   - Verify that stone material (\`material\`) and geometric shape (\`shape\`) are properly populated.

3. **Media & Visual Assets Audit**:
   - Identify items missing raw photographs (\`media_urls\`).
   - Check if background-cleaned photographs (\`processed_media_urls\`) or transparent cutout heroes (\`generated_png_url\`) are missing.
   - Verify whether AI segmentation vector contours (\`generated_svg_url\`) exist.

4. **Physical Dimensions & Weight Verification**:
   - Flag any items where \`weight_kg\` is null, 0, or unrealistic.
   - Verify that length, width, and height (\`length_cm\`, \`width_cm\`, \`height_cm\`) are recorded.

5. **Pricing & Cypher Code Integrity**:
   - Check that public USD retail price (\`book_retail\`) is set.
   - For authorized finance callers, inspect acquisition cost (\`book_acquisition\`) and landed cost (\`book_landed\`) using \`inventory_get_pricing\`.
   - Confirm that encrypted cypher codes (\`book_aq_code\`, \`book_land_code\`) match expected cost encryptions.

6. **Barcode & Label Print Audit**:
   - Verify that every item has a unique \`book_barcode\` or tag \`item_id\`.
   - Check \`labels_printed_total\` to identify intake items that have not yet had physical thermal labels printed.

7. **Audit Report Summary**:
   - Produce a structured Markdown audit table listing anomalies grouped into Critical, Warning, and Info severity levels, with actionable next steps.`,
            },
          },
        ],
      };
    }
  );

  // ── 4. financial_review ────────────────────────────────────────────────────
  server.registerPrompt(
    "financial_review",
    {
      title: "Financial Ledger Reconciliation & Outflow Review",
      description: "Steps for reconciling transactions, disbursements, payments, and multi-currency exchange rates.",
      argsSchema: {
        period: z.string().describe("Financial period for review, e.g. '2026-Q1', '2026-09', or 'current-month'"),
      },
    },
    async ({ period }) => {
      return {
        description: `Financial reconciliation and cash outflow review for period '${period}'`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please conduct a financial review and reconciliation for the period '${period}'.

Execute the reconciliation according to these steps:

1. **Exchange Rate Baseline**:
   - Call \`system_get_exchange_rate\` to check the current official MXN/USD foreign exchange rate.
   - Verify historical exchange rates recorded on transactions within the period.

2. **Monthly Aggregate Performance**:
   - Call \`finance_monthly_summary\` to review total cash outflow grouped by expense category and currency.

3. **Transaction Ledger Audit**:
   - Call \`finance_list_transactions\` with date filters corresponding to period '${period}'.
   - Inspect transaction types (payment, expense, disbursement, transfer) and approval statuses (pending vs approved vs paid).
   - Identify any unapproved or overdue pending disbursements.

4. **Stone Stock Reconciliation**:
   - For acquisition payments, call \`finance_linked_items\` using the transaction ID to verify that cash disbursements correspond to physical stone items in warehouse stock.

5. **Vendor Balance Breakdown**:
   - Check vendor payment obligations using \`finance_vendor_summary\` for primary suppliers.
   - Reconcile workshop production advances from \`production_list_orders\` against recorded disbursements.

6. **Executive Statement**:
   - Call \`display_financial_report\` to generate a formal Markdown financial report.
   - Summarize total outflows in MXN and USD, highlight upcoming payment liabilities, and flag any currency variance anomalies.`,
            },
          },
        ],
      };
    }
  );
}
