// =============================================================================
// Onyx.mx Shared Query Execution Engine (MCP Data Handlers)
// =============================================================================
// Cleanly importable by BOTH Deno and Node environments with ZERO external imports.
// Enforces role-based access control (RBAC), vendor tenancy scoping, and
// cost cypher redaction in application code over the Supabase service role.
// =============================================================================

import {
  ONYX_DATA_TOOLS,
  type OnyxDataTool,
  FINANCE_ROLES,
  ALL_STAFF,
  INTERNAL_STAFF,
  WRITE_ROLES,
  MAX_LIMIT,
  COST_COLUMNS,
} from "./onyxDataTools.ts";

export interface CallerContext {
  role: string;
  vendorPrefix?: string;
  isServiceRole?: boolean;
}

export interface ToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: any;
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Strips delimiter characters that could manipulate PostgREST filter expressions.
 */
function cleanTerm(raw: unknown): string {
  return String(raw ?? "").replace(/[,()*:."'\\]/g, " ").trim().slice(0, 100);
}

/**
 * Recursively strips columns specified in COST_COLUMNS from objects or arrays.
 */
function stripCostColumns<T>(data: T): T {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((item) => stripCostColumns(item)) as unknown as T;
  }
  if (typeof data === "object") {
    const clone: Record<string, any> = { ...(data as Record<string, any>) };
    for (const col of COST_COLUMNS) {
      delete clone[col];
    }
    return clone as T;
  }
  return data;
}

/**
 * Standardizes pagination parameters against MAX_LIMIT.
 */
function clampPagination(args: Record<string, unknown>, defaultLimit = 20): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Number(args.limit) || defaultLimit), MAX_LIMIT);
  const offset = Math.max(0, Number(args.offset) || 0);
  return { limit, offset };
}

/**
 * Derives USD retail price from MXN acquisition price following the artifact pipeline:
 * acquisition USD = price_mxn / rate; landed = acq * 1.4; retail = landed * 12
 */
function calculateRetailUsd(costMxn: number, rate = 17.0): number {
  if (!costMxn || costMxn <= 0) return 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return r2(r2(r2(costMxn / rate) * 1.4) * 12);
}

/**
 * Fetches the current exchange rate from the settings table with a 17.0 fallback.
 */
async function getExchangeRateFromSettings(supabase: any): Promise<number> {
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", "exchange_rate").maybeSingle();
    if (data?.value !== undefined && data?.value !== null) {
      if (typeof data.value === "number") return data.value;
      if (typeof data.value === "string") {
        const parsed = parseFloat(data.value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      if (typeof data.value === "object" && (data.value as any)?.rate) {
        const parsed = Number((data.value as any).rate);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
  } catch {}
  return 17.0;
}

/**
 * Extracts Google Drive file IDs from varied URL formats.
 */
function extractDriveId(url: string): string | null {
  const m = String(url || "").match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// ── Main Entrypoint ───────────────────────────────────────────────────────────

export async function executeOnyxDataTool(
  supabase: any,
  toolName: string,
  args: Record<string, unknown> = {},
  caller?: CallerContext
): Promise<ToolExecutionResult> {
  try {
    // 1. Resolve Effective Caller (Default to 'Developer' if omitted or if service role)
    const effectiveCaller: CallerContext = !caller || caller.isServiceRole
      ? { role: "Developer", vendorPrefix: caller?.vendorPrefix, isServiceRole: true }
      : caller;

    // 2. Validate Tool Manifest & Role Authorization
    const tool = ONYX_DATA_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool not found: '${toolName}'` }],
      };
    }

    if (!tool.requiredRoles.includes(effectiveCaller.role)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Forbidden: role '${effectiveCaller.role}' not permitted for tool '${toolName}'. Requires one of: ${tool.requiredRoles.join(", ")}`,
          },
        ],
      };
    }

    const isFinance = FINANCE_ROLES.includes(effectiveCaller.role);
    const isVendor = effectiveCaller.role === "Vendor";
    const scopedVendor = isVendor ? effectiveCaller.vendorPrefix || "" : undefined;

    // ── Tool Implementations ─────────────────────────────────────────────────

    // ── 1. inventory_search ──────────────────────────────────────────────────
    if (toolName === "inventory_search") {
      const { limit, offset } = clampPagination(args, 20);
      let q = supabase.from("inventory").select("*", { count: "exact" });

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      } else if (args.vendor_id) {
        q = q.eq("vendor_id", String(args.vendor_id).trim());
      }

      if (args.status) {
        q = q.eq("status", String(args.status).trim());
      }
      if (args.material) {
        const mat = cleanTerm(args.material);
        if (mat) q = q.ilike("material", `%${mat}%`);
      }
      if (args.shape) {
        const shp = cleanTerm(args.shape);
        if (shp) q = q.ilike("shape", `%${shp}%`);
      }
      if (args.workbook) {
        q = q.eq("workbook", String(args.workbook).trim());
      }
      if (args.query) {
        const term = cleanTerm(args.query);
        if (term) {
          q = q.or(
            `short_description.ilike.%${term}%,description.ilike.%${term}%,item_id.ilike.%${term}%,book_barcode.ilike.%${term}%`
          );
        }
      }

      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      let items = data || [];
      if (!isFinance) {
        items = stripCostColumns(items);
      }

      const totalCount = count ?? items.length;
      const resultPayload = {
        items,
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + items.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 2. inventory_get_item ────────────────────────────────────────────────
    if (toolName === "inventory_get_item") {
      if (!args.id && !args.item_id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Either 'id' or 'item_id' parameter must be provided." }],
        };
      }

      let q = supabase.from("inventory").select("*");
      if (args.id) {
        q = q.eq("id", String(args.id).trim());
      } else {
        q = q.eq("item_id", String(args.item_id).trim());
      }

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, message: "Inventory item not found." }) }],
          structuredContent: { found: false },
        };
      }

      const item = !isFinance ? stripCostColumns(data) : data;
      return {
        content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
        structuredContent: item,
      };
    }

    // ── 3. inventory_get_by_barcode ──────────────────────────────────────────
    if (toolName === "inventory_get_by_barcode") {
      const barcode = cleanTerm(args.barcode);
      if (!barcode) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'barcode' is required." }],
        };
      }

      let q = supabase
        .from("inventory")
        .select("*")
        .or(`book_barcode.eq.${barcode},item_id.eq.${barcode}`);

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, barcode }) }],
          structuredContent: { found: false, barcode },
        };
      }

      const item = !isFinance ? stripCostColumns(data) : data;
      return {
        content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
        structuredContent: item,
      };
    }

    // ── 4. inventory_list_by_crate ───────────────────────────────────────────
    if (toolName === "inventory_list_by_crate") {
      const crateId = cleanTerm(args.crate_id);
      if (!crateId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'crate_id' is required." }],
        };
      }

      const { limit, offset } = clampPagination(args, 50);
      let q = supabase.from("inventory").select("*", { count: "exact" }).eq("crate_id", crateId);
      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      let items = data || [];
      if (!isFinance) {
        items = stripCostColumns(items);
      }

      const totalCount = count ?? items.length;
      const resultPayload = {
        crate_id: crateId,
        items,
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + items.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 5. inventory_list_by_vendor ──────────────────────────────────────────
    if (toolName === "inventory_list_by_vendor") {
      let vendorId = String(args.vendor_id || "").trim();
      if (isVendor) {
        vendorId = scopedVendor || "";
      }
      if (!vendorId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'vendor_id' is required." }],
        };
      }

      const { limit, offset } = clampPagination(args, 50);
      let q = supabase.from("inventory").select("*", { count: "exact" }).eq("vendor_id", vendorId);
      if (args.status) {
        q = q.eq("status", String(args.status).trim());
      }

      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      let items = data || [];
      if (!isFinance) {
        items = stripCostColumns(items);
      }

      const totalCount = count ?? items.length;
      const resultPayload = {
        vendor_id: vendorId,
        items,
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + items.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 6. inventory_count_by_status ─────────────────────────────────────────
    if (toolName === "inventory_count_by_status") {
      let q = supabase.from("inventory").select("status, quantity");
      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      } else if (args.vendor_id) {
        q = q.eq("vendor_id", String(args.vendor_id).trim());
      }
      if (args.workbook) {
        q = q.eq("workbook", String(args.workbook).trim());
      }

      const { data, error } = await q;
      if (error) throw error;

      const byStatus: Record<string, { items: number; quantity: number }> = {};
      let totalItems = 0;
      let totalQuantity = 0;

      for (const row of data || []) {
        const status = (row.status || "Unknown").trim();
        const qty = Number(row.quantity) || 1;
        if (!byStatus[status]) byStatus[status] = { items: 0, quantity: 0 };
        byStatus[status].items += 1;
        byStatus[status].quantity += qty;
        totalItems += 1;
        totalQuantity += qty;
      }

      const resultPayload = {
        by_status: byStatus,
        total_items: totalItems,
        total_quantity: totalQuantity,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 7. inventory_count_by_vendor ─────────────────────────────────────────
    if (toolName === "inventory_count_by_vendor") {
      let q = supabase.from("inventory").select("vendor_id, item_id, quantity");
      if (args.status) {
        q = q.eq("status", String(args.status).trim());
      }
      if (args.workbook) {
        q = q.eq("workbook", String(args.workbook).trim());
      }

      const { data, error } = await q;
      if (error) throw error;

      const byVendor: Record<string, { items: number; quantity: number }> = {};
      let totalItems = 0;
      let totalQuantity = 0;

      for (const row of data || []) {
        let v = (row.vendor_id || "").trim();
        if (!v && row.item_id) {
          v = String(row.item_id).split("-")[0].trim();
        }
        v = v || "Unknown";
        const qty = Number(row.quantity) || 1;
        if (!byVendor[v]) byVendor[v] = { items: 0, quantity: 0 };
        byVendor[v].items += 1;
        byVendor[v].quantity += qty;
        totalItems += 1;
        totalQuantity += qty;
      }

      const resultPayload = {
        by_vendor: byVendor,
        total_items: totalItems,
        total_quantity: totalQuantity,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 8. inventory_get_pricing ─────────────────────────────────────────────
    if (toolName === "inventory_get_pricing") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      let q = supabase
        .from("inventory")
        .select("*")
        .or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`);

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, id }) }],
          structuredContent: { found: false, id },
        };
      }

      const exchangeRate = await getExchangeRateFromSettings(supabase);
      const costMxn = Number(data.price_mxn ?? 0);
      let bookRetail = data.book_retail !== null && data.book_retail !== undefined ? Number(data.book_retail) : null;
      if (bookRetail === null && costMxn > 0) {
        bookRetail = calculateRetailUsd(costMxn, exchangeRate);
      }

      // Non-finance callers NEVER receive cost data, price_mxn or cost cyphers
      if (!isFinance) {
        const publicPricing = {
          id: data.id,
          item_id: data.item_id,
          book_barcode: data.book_barcode,
          book_retail: bookRetail,
          retail_usd: bookRetail,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(publicPricing, null, 2) }],
          structuredContent: publicPricing,
        };
      }

      const acquisitionUsd = data.book_acquisition !== null && data.book_acquisition !== undefined
        ? Number(data.book_acquisition)
        : (costMxn > 0 ? Math.round((costMxn / exchangeRate) * 100) / 100 : null);

      const landedUsd = data.book_landed !== null && data.book_landed !== undefined
        ? Number(data.book_landed)
        : (acquisitionUsd !== null ? Math.round(acquisitionUsd * 1.4 * 100) / 100 : null);

      const fullPricing = {
        id: data.id,
        item_id: data.item_id,
        book_barcode: data.book_barcode,
        price_mxn: costMxn > 0 ? costMxn : null,
        book_acquisition: acquisitionUsd,
        book_landed: landedUsd,
        book_retail: bookRetail,
        book_aq_code: data.book_aq_code || null,
        book_land_code: data.book_land_code || null,
        exchange_rate: exchangeRate,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(fullPricing, null, 2) }],
        structuredContent: fullPricing,
      };
    }

    // ── 9. inventory_get_media ───────────────────────────────────────────────
    if (toolName === "inventory_get_media") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      let q = supabase
        .from("inventory")
        .select(
          "id, item_id, book_barcode, vendor_id, media_urls, processed_media_urls, generated_png_url, generated_svg_url, generated_image_urls, axo_icon_url"
        )
        .or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`);

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, id }) }],
          structuredContent: { found: false, id },
        };
      }

      const rawList = String(data.media_urls || "")
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const driveIds: string[] = [];
      for (const u of rawList) {
        const did = extractDriveId(u);
        if (did && !driveIds.includes(did)) driveIds.push(did);
      }

      let processedMap: Record<string, any> = {};
      if (data.processed_media_urls) {
        if (typeof data.processed_media_urls === "object") {
          processedMap = data.processed_media_urls;
        } else if (
          typeof data.processed_media_urls === "string" &&
          data.processed_media_urls.trim().startsWith("{")
        ) {
          try {
            processedMap = JSON.parse(data.processed_media_urls);
          } catch {}
        }
      }

      const imageUrls: string[] = [];
      for (const [k, v] of Object.entries(processedMap)) {
        if (k.startsWith("_") || typeof v !== "string" || !v.startsWith("http")) continue;
        imageUrls.push(v);
      }
      if (data.generated_png_url && !imageUrls.includes(data.generated_png_url)) {
        imageUrls.push(data.generated_png_url);
      }

      const mediaResult = {
        id: data.id,
        item_id: data.item_id,
        book_barcode: data.book_barcode,
        media_urls: rawList,
        image_urls: imageUrls,
        drive_ids: driveIds,
        generated_png_url: data.generated_png_url || null,
        generated_svg_url: data.generated_svg_url || null,
        axo_icon_url: data.axo_icon_url || null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(mediaResult, null, 2) }],
        structuredContent: mediaResult,
      };
    }

    // ── 10. inventory_get_segmentation ───────────────────────────────────────
    if (toolName === "inventory_get_segmentation") {
      const itemId = cleanTerm(args.item_id);
      if (!itemId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'item_id' is required." }],
        };
      }

      if (isVendor) {
        const { data: invItem } = await supabase
          .from("inventory")
          .select("id, vendor_id")
          .or(`id.eq.${itemId},item_id.eq.${itemId}`)
          .maybeSingle();

        if (!invItem || invItem.vendor_id !== scopedVendor) {
          return {
            isError: true,
            content: [{ type: "text", text: "Forbidden: item does not belong to vendor." }],
          };
        }
      }

      let q = supabase.from("item_segmentation").select("*").eq("item_id", itemId);
      if (args.angle_index !== undefined && args.angle_index !== null) {
        q = q.eq("angle_index", Number(args.angle_index));
      }

      let { data, error } = await q;

      // Fallback: Check if item_id was human-readable item_id rather than inventory.id UUID
      if (!error && (!data || data.length === 0)) {
        const { data: invRow } = await supabase.from("inventory").select("id").eq("item_id", itemId).maybeSingle();
        if (invRow?.id) {
          let q2 = supabase.from("item_segmentation").select("*").eq("item_id", invRow.id);
          if (args.angle_index !== undefined && args.angle_index !== null) {
            q2 = q2.eq("angle_index", Number(args.angle_index));
          }
          const res2 = await q2;
          if (!res2.error && res2.data && res2.data.length > 0) {
            data = res2.data;
          }
        }
      }

      if (error) throw error;

      const resultPayload = {
        item_id: itemId,
        segmentations: data || [],
        count: (data || []).length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 11. finance_list_transactions ────────────────────────────────────────
    if (toolName === "finance_list_transactions") {
      const { limit, offset } = clampPagination(args, 50);
      let q = supabase.from("finance").select("*", { count: "exact" });

      if (args.type) q = q.eq("type", String(args.type).trim());
      if (args.category) q = q.eq("category", String(args.category).trim());
      if (args.vendor_id) q = q.eq("vendor_id", String(args.vendor_id).trim());
      if (args.status) q = q.eq("status", String(args.status).trim());
      if (args.date_from) q = q.gte("date", String(args.date_from).trim());
      if (args.date_to) q = q.lte("date", String(args.date_to).trim());

      q = q.order("date", { ascending: false, nullsFirst: false });
      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      const totalCount = count ?? (data || []).length;
      const resultPayload = {
        transactions: data || [],
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + (data || []).length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 12. finance_get_transaction ──────────────────────────────────────────
    if (toolName === "finance_get_transaction") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      const { data, error } = await supabase.from("finance").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, id }) }],
          structuredContent: { found: false, id },
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }

    // ── 13. finance_vendor_summary ───────────────────────────────────────────
    if (toolName === "finance_vendor_summary") {
      const vendorId = cleanTerm(args.vendor_id);
      if (!vendorId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'vendor_id' is required." }],
        };
      }

      const { data, error } = await supabase.from("finance").select("*").eq("vendor_id", vendorId);
      if (error) throw error;

      const rows = data || [];
      let totalPaidMxn = 0;
      let totalPendingMxn = 0;
      let totalPaidUsd = 0;
      let totalPendingUsd = 0;
      let totalCommissionMxn = 0;
      let totalCommissionUsd = 0;

      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};

      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        const comm = Number(row.commission) || 0;
        const curr = (row.currency || "MXN").toUpperCase();
        const status = (row.status || "Requested").toLowerCase();
        const isPaid = status === "paid" || status === "dispersed" || status === "sent";

        if (curr === "MXN") {
          if (isPaid) totalPaidMxn += amount;
          else totalPendingMxn += amount;
          totalCommissionMxn += comm;
        } else {
          if (isPaid) totalPaidUsd += amount;
          else totalPendingUsd += amount;
          totalCommissionUsd += comm;
        }

        byStatus[row.status || "Unknown"] = (byStatus[row.status || "Unknown"] || 0) + amount;
        byCategory[row.category || "Uncategorized"] = (byCategory[row.category || "Uncategorized"] || 0) + amount;
      }

      const summary = {
        vendor_id: vendorId,
        total_transactions: rows.length,
        totals: {
          paid_mxn: Math.round(totalPaidMxn * 100) / 100,
          pending_mxn: Math.round(totalPendingMxn * 100) / 100,
          paid_usd: Math.round(totalPaidUsd * 100) / 100,
          pending_usd: Math.round(totalPendingUsd * 100) / 100,
          commission_mxn: Math.round(totalCommissionMxn * 100) / 100,
          commission_usd: Math.round(totalCommissionUsd * 100) / 100,
        },
        by_status: byStatus,
        by_category: byCategory,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }

    // ── 14. finance_monthly_summary ──────────────────────────────────────────
    if (toolName === "finance_monthly_summary") {
      const now = new Date();
      const targetYear = Number(args.year) || now.getFullYear();
      const targetMonth = Number(args.month) || now.getMonth() + 1;

      const startMonthStr = String(targetMonth).padStart(2, "0");
      const startDate = `${targetYear}-${startMonthStr}-01T00:00:00.000Z`;

      const nextMonthDate = new Date(Date.UTC(targetYear, targetMonth, 1));
      const endDate = nextMonthDate.toISOString();

      let q = supabase.from("finance").select("*").gte("date", startDate).lt("date", endDate);
      if (args.currency) {
        q = q.eq("currency", String(args.currency).trim().toUpperCase());
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      let totalMxn = 0;
      let totalUsd = 0;
      let totalPaidMxn = 0;
      let totalPaidUsd = 0;

      const byCategory: Record<string, { mxn: number; usd: number; count: number }> = {};
      const byType: Record<string, { mxn: number; usd: number; count: number }> = {};

      for (const row of rows) {
        const amt = Number(row.amount) || 0;
        const curr = (row.currency || "MXN").toUpperCase();
        const cat = row.category || "Uncategorized";
        const typ = row.type || "Other";
        const isPaid = ["paid", "dispersed", "sent"].includes((row.status || "").toLowerCase());

        if (curr === "MXN") {
          totalMxn += amt;
          if (isPaid) totalPaidMxn += amt;
        } else {
          totalUsd += amt;
          if (isPaid) totalPaidUsd += amt;
        }

        if (!byCategory[cat]) byCategory[cat] = { mxn: 0, usd: 0, count: 0 };
        byCategory[cat].count += 1;
        if (curr === "MXN") byCategory[cat].mxn += amt;
        else byCategory[cat].usd += amt;

        if (!byType[typ]) byType[typ] = { mxn: 0, usd: 0, count: 0 };
        byType[typ].count += 1;
        if (curr === "MXN") byType[typ].mxn += amt;
        else byType[typ].usd += amt;
      }

      const summary = {
        year: targetYear,
        month: targetMonth,
        total_transactions: rows.length,
        totals: {
          total_mxn: Math.round(totalMxn * 100) / 100,
          total_usd: Math.round(totalUsd * 100) / 100,
          paid_mxn: Math.round(totalPaidMxn * 100) / 100,
          paid_usd: Math.round(totalPaidUsd * 100) / 100,
        },
        by_category: byCategory,
        by_type: byType,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }

    // ── 15. finance_linked_items ─────────────────────────────────────────────
    if (toolName === "finance_linked_items") {
      const financeId = cleanTerm(args.finance_id);
      if (!financeId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'finance_id' is required." }],
        };
      }

      const { data: fin, error: finErr } = await supabase
        .from("finance")
        .select("*")
        .eq("id", financeId)
        .maybeSingle();

      if (finErr) throw finErr;
      if (!fin) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, finance_id: financeId, items: [] }) }],
          structuredContent: { found: false, items: [] },
        };
      }

      const idList: string[] = [];
      if (Array.isArray(fin.related_ids)) {
        for (const rid of fin.related_ids) {
          if (rid && typeof rid === "string") idList.push(rid.trim());
        }
      }
      if (fin.related_inventory_ids && typeof fin.related_inventory_ids === "string") {
        const parts = fin.related_inventory_ids
          .split(/[,;\s]+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        for (const p of parts) {
          if (!idList.includes(p)) idList.push(p);
        }
      }

      if (idList.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  finance_id: financeId,
                  items: [],
                  message: "No linked inventory items found for transaction.",
                },
                null,
                2
              ),
            },
          ],
          structuredContent: { finance_id: financeId, items: [] },
        };
      }

      const filterOr = idList.map((i) => `id.eq.${cleanTerm(i)},item_id.eq.${cleanTerm(i)}`).join(",");
      const { data: invItems, error: invErr } = await supabase.from("inventory").select("*").or(filterOr);
      if (invErr) throw invErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                finance_id: financeId,
                items: invItems || [],
                count: (invItems || []).length,
              },
              null,
              2
            ),
          },
        ],
        structuredContent: { finance_id: financeId, items: invItems || [] },
      };
    }

    // ── 16. logistics_list_containers ────────────────────────────────────────
    if (toolName === "logistics_list_containers") {
      const { limit, offset } = clampPagination(args, 50);
      let q = supabase.from("logistics").select("*", { count: "exact" });

      if (args.type) q = q.ilike("type", `%${cleanTerm(args.type)}%`);
      if (args.status) q = q.ilike("status", `%${cleanTerm(args.status)}%`);
      if (args.truck_id) q = q.eq("truck_id", String(args.truck_id).trim());
      if (args.vendor_id) {
        const v = cleanTerm(args.vendor_id);
        q = q.or(`vendor_id.eq.${v},vendors.ilike.%${v}%`);
      }

      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      const totalCount = count ?? (data || []).length;
      const resultPayload = {
        containers: data || [],
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + (data || []).length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 17. logistics_get_container ──────────────────────────────────────────
    if (toolName === "logistics_get_container") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      let { data, error } = await supabase.from("logistics").select("*").eq("id", id).maybeSingle();
      if (!data) {
        const { data: d2 } = await supabase
          .from("logistics")
          .select("*")
          .or(`tracking_number.eq.${id},description.ilike.%${id}%`)
          .limit(1);
        if (d2 && d2.length > 0) data = d2[0];
      }

      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, id }) }],
          structuredContent: { found: false, id },
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }

    // ── 18. logistics_get_shipment ───────────────────────────────────────────
    if (toolName === "logistics_get_shipment") {
      const manifestId = cleanTerm(args.manifest_id);
      if (!manifestId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'manifest_id' is required." }],
        };
      }

      let { data, error } = await supabase.from("shipments").select("*").eq("manifest_id", manifestId).maybeSingle();
      if (!data) {
        const res2 = await supabase.from("shipments").select("*").eq("id", manifestId).maybeSingle();
        if (res2.data) data = res2.data;
      }

      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, manifest_id: manifestId }) }],
          structuredContent: { found: false, manifest_id: manifestId },
        };
      }

      if (typeof data.payload === "string" && data.payload.trim().startsWith("{")) {
        try {
          data.payload = JSON.parse(data.payload);
        } catch {}
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }

    // ── 19. logistics_list_shipments ─────────────────────────────────────────
    if (toolName === "logistics_list_shipments") {
      const { limit, offset } = clampPagination(args, 20);
      let q = supabase.from("shipments").select("*", { count: "exact" });
      q = q.order("timestamp", { ascending: false, nullsFirst: false });
      q = q.range(offset, offset + limit - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      const shipments = (data || []).map((s: any) => {
        if (typeof s.payload === "string" && s.payload.trim().startsWith("{")) {
          try {
            s.payload = JSON.parse(s.payload);
          } catch {}
        }
        return s;
      });

      const totalCount = count ?? shipments.length;
      const resultPayload = {
        shipments,
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + shipments.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 20. logistics_truck_summary ──────────────────────────────────────────
    if (toolName === "logistics_truck_summary") {
      const truckId = cleanTerm(args.truck_id);
      if (!truckId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'truck_id' is required." }],
        };
      }

      const { data, error } = await supabase.from("logistics").select("*").eq("truck_id", truckId);
      if (error) throw error;

      const containers = data || [];
      let totalWeightKg = 0;
      let crateCount = 0;
      let palletCount = 0;
      let cardboardCount = 0;

      for (const c of containers) {
        totalWeightKg += Number(c.weight_kg) || 0;
        const t = (c.type || "").toLowerCase();
        if (t.includes("pallet")) palletCount += 1;
        else if (t.includes("cardboard") || t.includes("box")) cardboardCount += 1;
        else crateCount += 1;
      }

      const summary = {
        truck_id: truckId,
        total_containers: containers.length,
        total_weight_kg: Math.round(totalWeightKg * 100) / 100,
        breakdown: {
          crates: crateCount,
          pallets: palletCount,
          cardboard: cardboardCount,
        },
        containers,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    }

    // ── 21. logistics_container_contents ─────────────────────────────────────
    if (toolName === "logistics_container_contents") {
      const containerId = cleanTerm(args.container_id);
      if (!containerId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'container_id' is required." }],
        };
      }

      const { data: logRow } = await supabase.from("logistics").select("*").eq("id", containerId).maybeSingle();
      const { data: byCrate } = await supabase.from("inventory").select("*").eq("crate_id", containerId);

      let idList: string[] = [];
      if (logRow?.inventory_ids) {
        idList = String(logRow.inventory_ids)
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      let extraItems: any[] = [];
      if (idList.length > 0) {
        const orExpr = idList.map((i) => `id.eq.${cleanTerm(i)},item_id.eq.${cleanTerm(i)}`).join(",");
        const { data: byIds } = await supabase.from("inventory").select("*").or(orExpr);
        if (byIds) extraItems = byIds;
      }

      const seen = new Set<string>();
      const allItems: any[] = [];
      for (const item of [...(byCrate || []), ...extraItems]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          allItems.push(!isFinance ? stripCostColumns(item) : item);
        }
      }

      const resultPayload = {
        container_id: containerId,
        container_info: logRow || null,
        items: allItems,
        total_items: allItems.length,
        total_weight_kg: allItems.reduce((acc, it) => acc + (Number(it.weight_kg) || 0), 0),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 22. production_list_orders ───────────────────────────────────────────
    if (toolName === "production_list_orders") {
      const { limit, offset } = clampPagination(args, 50);
      let q = supabase.from("production").select("*", { count: "exact" });

      if (args.vendor_id) q = q.eq("vendor_id", String(args.vendor_id).trim());
      if (args.status) q = q.eq("status", String(args.status).trim());

      q = q.range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw error;

      const totalCount = count ?? (data || []).length;
      const resultPayload = {
        orders: data || [],
        total_count: totalCount,
        offset,
        limit,
        has_more: totalCount > offset + (data || []).length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 23. production_get_order ─────────────────────────────────────────────
    if (toolName === "production_get_order") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      const { data, error } = await supabase
        .from("production")
        .select("*")
        .or(`id.eq.${id},tag_id.eq.${id}`)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, id }) }],
          structuredContent: { found: false, id },
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }

    // ── 24. system_list_users ────────────────────────────────────────────────
    if (toolName === "system_list_users") {
      let q = supabase
        .from("app_users")
        .select("id, email, role, is_active, display_name, vendor_prefix, created_at");

      if (args.role) q = q.eq("role", String(args.role).trim());
      if (args.active_only !== false) {
        q = q.neq("is_active", false);
      }

      const { data, error } = await q;
      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }],
        structuredContent: data || [],
      };
    }

    // ── 25. system_get_settings ──────────────────────────────────────────────
    if (toolName === "system_get_settings") {
      let q = supabase.from("settings").select("key, value, updated_at");
      if (args.key) {
        q = q.eq("key", String(args.key).trim());
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) {
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false, key: args.key }) }],
            structuredContent: { found: false, key: args.key },
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      }

      const { data, error } = await q;
      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }],
        structuredContent: data || [],
      };
    }

    // ── 26. system_get_exchange_rate ─────────────────────────────────────────
    if (toolName === "system_get_exchange_rate") {
      const rate = await getExchangeRateFromSettings(supabase);
      const resultPayload = {
        exchange_rate: rate,
        currency_pair: "MXN/USD",
        source: "settings",
        description: "Official MXN per 1 USD conversion rate used across Onyx.mx",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 27. system_list_devices ──────────────────────────────────────────────
    if (toolName === "system_list_devices") {
      let devices: any[] = [];
      let warning: string | null = null;

      try {
        let q = supabase.from("onyxchan_devices").select("*");
        if (args.status) q = q.eq("status", String(args.status).trim());
        const { data, error } = await q;
        if (!error && data) {
          devices = data;
        } else if (error) {
          warning = error.message;
        }
      } catch (e: any) {
        warning = e.message;
      }

      if (devices.length === 0) {
        try {
          let q2 = supabase.from("pico_devices").select("*");
          if (args.status) q2 = q2.eq("status", String(args.status).trim());
          const res2 = await q2;
          if (res2.data) devices = res2.data;
        } catch {}
      }

      const resultPayload = {
        devices,
        count: devices.length,
        ...(warning && devices.length === 0 ? { warning } : {}),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(resultPayload, null, 2) }],
        structuredContent: resultPayload,
      };
    }

    // ── 28. system_get_print_jobs ────────────────────────────────────────────
    if (toolName === "system_get_print_jobs") {
      const { limit } = clampPagination(args, 20);
      let q = supabase.from("print_jobs").select("*").limit(limit);
      try {
        q = q.order("printed_at", { ascending: false, nullsFirst: false });
      } catch {}

      const { data, error } = await q;
      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data || [], null, 2) }],
        structuredContent: data || [],
      };
    }

    // ── 29. display_item_card ────────────────────────────────────────────────
    if (toolName === "display_item_card") {
      const id = cleanTerm(args.id);
      if (!id) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'id' is required." }],
        };
      }

      let q = supabase
        .from("inventory")
        .select("*")
        .or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`);

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          isError: true,
          content: [{ type: "text", text: `Item not found for identifier '${id}'.` }],
        };
      }

      const exchangeRate = await getExchangeRateFromSettings(supabase);
      const costMxn = Number(data.price_mxn ?? 0);
      let bookRetail = data.book_retail !== null && data.book_retail !== undefined ? Number(data.book_retail) : null;
      if (bookRetail === null && costMxn > 0) {
        bookRetail = calculateRetailUsd(costMxn, exchangeRate);
      }

      let heroImage: string | null = null;
      if (data.generated_png_url) heroImage = data.generated_png_url;
      else if (data.media_urls) {
        const parts = String(data.media_urls)
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) heroImage = parts[0];
      }

      const lines: string[] = [];
      const title =
        [data.shape, data.short_description || data.description].filter(Boolean).join(" ") || "Onyx Inventory Item";
      lines.push(`### 📦 ${title.toUpperCase()}`);
      lines.push(
        `**Tag ID:** \`${data.book_barcode || data.item_id || data.id}\` | **Vendor:** \`${data.vendor_id || "N/A"}\` | **Status:** **${data.status || "Unknown"}**`
      );
      lines.push("");

      if (heroImage) {
        lines.push(`![${title}](${heroImage})`);
        lines.push("");
      }

      lines.push("#### Physical Specifications");
      lines.push(`- **Material:** ${data.material || "N/A"}`);
      lines.push(`- **Color:** ${data.color || "N/A"}`);
      lines.push(`- **Shape:** ${data.shape || "N/A"}`);
      lines.push(
        `- **Dimensions (L × W × H):** ${data.length_cm ?? "-"} × ${data.width_cm ?? "-"} × ${data.height_cm ?? "-"} cm`
      );
      lines.push(`- **Weight:** ${data.weight_kg ? `${data.weight_kg} kg` : "N/A"}`);
      lines.push(`- **Quantity:** ${data.quantity ?? 1}`);
      lines.push(`- **Crate / Container:** \`${data.crate_id || "Unassigned"}\``);
      lines.push("");

      lines.push("#### Commercial & Pricing");
      lines.push(
        `- **Retail Price (USD):** **$${bookRetail !== null ? bookRetail.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "N/A"} USD**`
      );

      if (isFinance) {
        lines.push(
          `- **Acquisition Cost (MXN):** $${costMxn ? costMxn.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "N/A"} MXN`
        );
        if (data.book_acquisition) {
          lines.push(
            `- **Acquisition Cost (USD):** $${Number(data.book_acquisition).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`
          );
        }
        if (data.book_landed) {
          lines.push(
            `- **Landed Cost (USD):** $${Number(data.book_landed).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`
          );
        }
        if (data.book_aq_code) lines.push(`- **AQ Cypher Code:** \`${data.book_aq_code}\``);
        if (data.book_land_code) lines.push(`- **LD Cypher Code:** \`${data.book_land_code}\``);
      }

      const markdownText = lines.join("\n");
      return {
        content: [{ type: "text", text: markdownText }],
        structuredContent: {
          markdown: markdownText,
          item: !isFinance ? stripCostColumns(data) : data,
        },
      };
    }

    // ── 30. display_vendor_report ────────────────────────────────────────────
    if (toolName === "display_vendor_report") {
      const vendorId = cleanTerm(args.vendor_id);
      if (!vendorId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'vendor_id' is required." }],
        };
      }

      const { data: invItems, error: invErr } = await supabase
        .from("inventory")
        .select("status, quantity, price_mxn, book_retail")
        .eq("vendor_id", vendorId);
      if (invErr) throw invErr;

      const { data: finTx, error: finErr } = await supabase
        .from("finance")
        .select("amount, currency, status, type, date")
        .eq("vendor_id", vendorId);
      if (finErr) throw finErr;

      const items = invItems || [];
      const txs = finTx || [];

      let totalUnits = 0;
      let totalValuationMxn = 0;
      const statusMap: Record<string, { count: number; units: number }> = {};

      for (const it of items) {
        const qty = Number(it.quantity) || 1;
        const status = it.status || "Unknown";
        totalUnits += qty;
        totalValuationMxn += (Number(it.price_mxn) || 0) * qty;

        if (!statusMap[status]) statusMap[status] = { count: 0, units: 0 };
        statusMap[status].count += 1;
        statusMap[status].units += qty;
      }

      let paidMxn = 0;
      let pendingMxn = 0;
      let paidUsd = 0;
      let pendingUsd = 0;

      for (const tx of txs) {
        const amt = Number(tx.amount) || 0;
        const isPaid = ["paid", "dispersed", "sent"].includes((tx.status || "").toLowerCase());
        const curr = (tx.currency || "MXN").toUpperCase();
        if (curr === "MXN") {
          if (isPaid) paidMxn += amt;
          else pendingMxn += amt;
        } else {
          if (isPaid) paidUsd += amt;
          else pendingUsd += amt;
        }
      }

      const lines: string[] = [];
      lines.push(`## 📊 Vendor Performance & Financial Report: \`${vendorId}\``);
      lines.push("");
      lines.push(
        `**Total Items Cataloged:** ${items.length} | **Total Units:** ${totalUnits} | **Total Cost Valuation (MXN):** $${totalValuationMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} MXN`
      );
      lines.push("");

      lines.push("### 📦 Stock Status Breakdown");
      lines.push("| Lifecycle Status | Item Count | Total Units | Share |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const [st, val] of Object.entries(statusMap)) {
        const share = totalUnits > 0 ? ((val.units / totalUnits) * 100).toFixed(1) + "%" : "0%";
        lines.push(`| **${st}** | ${val.count} | ${val.units} | ${share} |`);
      }
      lines.push("");

      lines.push("### 💳 Financial Obligations & Disbursements");
      lines.push("| Obligation / Payment Status | Amount (MXN) | Amount (USD) |");
      lines.push("| :--- | :--- | :--- |");
      lines.push(
        `| **Paid / Disbursed** | $${paidMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} MXN | $${paidUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD |`
      );
      lines.push(
        `| **Pending / Requested** | $${pendingMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} MXN | $${pendingUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD |`
      );
      lines.push(
        `| **Total Obligations** | **$${(paidMxn + pendingMxn).toLocaleString("en-US", { minimumFractionDigits: 2 })} MXN** | **$${(paidUsd + pendingUsd).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD** |`
      );
      lines.push("");

      const markdown = lines.join("\n");
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: {
          markdown,
          vendor_id: vendorId,
          items_count: items.length,
          transactions_count: txs.length,
        },
      };
    }

    // ── 31. display_crate_manifest ───────────────────────────────────────────
    if (toolName === "display_crate_manifest") {
      const crateId = cleanTerm(args.crate_id);
      if (!crateId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Parameter 'crate_id' is required." }],
        };
      }

      const { data: logRow } = await supabase.from("logistics").select("*").eq("id", crateId).maybeSingle();
      const { data: itemsData, error: itemsErr } = await supabase
        .from("inventory")
        .select("*")
        .eq("crate_id", crateId);

      if (itemsErr) throw itemsErr;

      const items = itemsData || [];
      let totalWeight = 0;
      let totalUnits = 0;

      for (const it of items) {
        totalWeight += Number(it.weight_kg) || 0;
        totalUnits += Number(it.quantity) || 1;
      }

      const lines: string[] = [];
      lines.push(`## 📋 Crate Packing Manifest & Bill of Lading: \`${crateId}\``);
      lines.push("");
      lines.push(
        `**Container Type:** ${logRow?.type || "Crate"} | **Transit Status:** **${logRow?.status || "Warehouse"}** | **Assigned Truck:** \`${logRow?.truck_id || "Unassigned"}\``
      );
      if (logRow?.length_cm || logRow?.width_cm || logRow?.height_cm) {
        lines.push(
          `**Dimensions:** ${logRow.length_cm ?? "-"} × ${logRow.width_cm ?? "-"} × ${logRow.height_cm ?? "-"} cm | **Gross Crate Weight:** ${logRow.weight_kg ? `${logRow.weight_kg} kg` : "N/A"}`
        );
      }
      lines.push("");

      lines.push("### 📦 Packed Items Manifest");
      lines.push("| Item ID | Barcode | Shape / Material | Dimensions (cm) | Weight (kg) | Units | Status |");
      lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

      if (items.length === 0) {
        lines.push("| *No items currently assigned to this container* | | | | | | |");
      } else {
        for (const it of items) {
          const dim = `${it.length_cm ?? "-"}×${it.width_cm ?? "-"}×${it.height_cm ?? "-"}`;
          const stone = [it.shape, it.material].filter(Boolean).join(" ") || "Item";
          lines.push(
            `| **${it.item_id || "-"}** | \`${it.book_barcode || "-"}\` | ${stone} | ${dim} | ${it.weight_kg ? `${it.weight_kg}` : "-"} | ${it.quantity || 1} | ${it.status || "-"} |`
          );
        }
      }

      lines.push("");
      lines.push(
        `**Total Items:** ${items.length} | **Total Units:** ${totalUnits} | **Combined Cargo Weight:** ${totalWeight.toFixed(2)} kg`
      );

      const markdown = lines.join("\n");
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: {
          markdown,
          crate_id: crateId,
          total_items: items.length,
          total_weight_kg: totalWeight,
        },
      };
    }

    // ── 32. display_financial_report ─────────────────────────────────────────
    if (toolName === "display_financial_report") {
      let q = supabase.from("finance").select("*");
      if (args.vendor_id) q = q.eq("vendor_id", String(args.vendor_id).trim());
      if (args.date_from) q = q.gte("date", String(args.date_from).trim());
      if (args.date_to) q = q.lte("date", String(args.date_to).trim());
      q = q.order("date", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      let totalPaidMxn = 0;
      let totalPendingMxn = 0;
      let totalPaidUsd = 0;
      let totalPendingUsd = 0;

      const catMap: Record<
        string,
        { paidMxn: number; pendingMxn: number; paidUsd: number; pendingUsd: number; count: number }
      > = {};

      for (const tx of rows) {
        const amt = Number(tx.amount) || 0;
        const curr = (tx.currency || "MXN").toUpperCase();
        const cat = tx.category || "General";
        const isPaid = ["paid", "dispersed", "sent"].includes((tx.status || "").toLowerCase());

        if (!catMap[cat]) catMap[cat] = { paidMxn: 0, pendingMxn: 0, paidUsd: 0, pendingUsd: 0, count: 0 };
        catMap[cat].count += 1;

        if (curr === "MXN") {
          if (isPaid) {
            totalPaidMxn += amt;
            catMap[cat].paidMxn += amt;
          } else {
            totalPendingMxn += amt;
            catMap[cat].pendingMxn += amt;
          }
        } else {
          if (isPaid) {
            totalPaidUsd += amt;
            catMap[cat].paidUsd += amt;
          } else {
            totalPendingUsd += amt;
            catMap[cat].pendingUsd += amt;
          }
        }
      }

      const lines: string[] = [];
      lines.push("## 💼 Executive Financial Summary Report");
      lines.push(
        `**Filter Scope:** Date range [${args.date_from || "All"} to ${args.date_to || "All"}] | Vendor: \`${args.vendor_id || "All Vendors"}\``
      );
      lines.push("");

      lines.push("### 💰 Cash Flow Overview");
      lines.push("| Currency | Paid / Disbursed | Pending / Requested | Total Net Flow |");
      lines.push("| :--- | :--- | :--- | :--- |");
      lines.push(
        `| **MXN ($)** | $${totalPaidMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} | $${totalPendingMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} | **$${(totalPaidMxn + totalPendingMxn).toLocaleString("en-US", { minimumFractionDigits: 2 })} MXN** |`
      );
      lines.push(
        `| **USD ($)** | $${totalPaidUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} | $${totalPendingUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} | **$${(totalPaidUsd + totalPendingUsd).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD** |`
      );
      lines.push("");

      lines.push("### 📑 Category Breakdown");
      lines.push("| Category | Paid (MXN) | Pending (MXN) | Paid (USD) | Pending (USD) | Transactions |");
      lines.push("| :--- | :--- | :--- | :--- | :--- | :--- |");
      for (const [cat, val] of Object.entries(catMap)) {
        lines.push(
          `| **${cat}** | $${val.paidMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} | $${val.pendingMxn.toLocaleString("en-US", { minimumFractionDigits: 2 })} | $${val.paidUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} | $${val.pendingUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} | ${val.count} |`
        );
      }
      lines.push("");

      lines.push("### 🕒 Recent Key Transactions");
      lines.push("| Date | Vendor | Type | Category | Amount | Currency | Status |");
      lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
      const recent = rows.slice(0, 10);
      if (recent.length === 0) {
        lines.push("| *No transactions match filter criteria* | | | | | | |");
      } else {
        for (const r of recent) {
          const d = r.date ? String(r.date).slice(0, 10) : "-";
          const amt = Number(r.amount) || 0;
          lines.push(
            `| ${d} | \`${r.vendor_id || "-"}\` | ${r.type || "-"} | ${r.category || "-"} | $${amt.toLocaleString("en-US", { minimumFractionDigits: 2 })} | ${r.currency || "MXN"} | **${r.status || "-"}** |`
          );
        }
      }

      const markdown = lines.join("\n");
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: { markdown, total_transactions: rows.length },
      };
    }

    // ── 33. display_inventory_dashboard ──────────────────────────────────────
    if (toolName === "display_inventory_dashboard") {
      let q = supabase.from("inventory").select("status, material, shape, quantity, weight_kg, vendor_id, workbook");

      if (isVendor) {
        q = q.eq("vendor_id", scopedVendor || "");
      } else if (args.vendor_id) {
        q = q.eq("vendor_id", String(args.vendor_id).trim());
      }
      if (args.workbook) {
        q = q.eq("workbook", String(args.workbook).trim());
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      let totalUnits = 0;
      let totalWeight = 0;
      const statusMap: Record<string, { count: number; units: number }> = {};
      const materialMap: Record<string, { count: number; units: number }> = {};
      const shapeMap: Record<string, { count: number; units: number }> = {};
      const vendorMap: Record<string, { count: number; units: number }> = {};

      for (const r of rows) {
        const qty = Number(r.quantity) || 1;
        totalUnits += qty;
        totalWeight += Number(r.weight_kg) || 0;

        const st = r.status || "Unknown";
        if (!statusMap[st]) statusMap[st] = { count: 0, units: 0 };
        statusMap[st].count += 1;
        statusMap[st].units += qty;

        const mat = r.material || "Unspecified";
        if (!materialMap[mat]) materialMap[mat] = { count: 0, units: 0 };
        materialMap[mat].count += 1;
        materialMap[mat].units += qty;

        const sh = r.shape || "Unspecified";
        if (!shapeMap[sh]) shapeMap[sh] = { count: 0, units: 0 };
        shapeMap[sh].count += 1;
        shapeMap[sh].units += qty;

        const v = r.vendor_id || "Unknown";
        if (!vendorMap[v]) vendorMap[v] = { count: 0, units: 0 };
        vendorMap[v].count += 1;
        vendorMap[v].units += qty;
      }

      const lines: string[] = [];
      lines.push("## 🏭 Onyx Warehouse Inventory Dashboard");
      const activeVendorFilter = isVendor ? scopedVendor : args.vendor_id;
      const scopeStr =
        [
          args.workbook ? `Workbook: \`${args.workbook}\`` : null,
          activeVendorFilter ? `Vendor: \`${activeVendorFilter}\`` : null,
        ]
          .filter(Boolean)
          .join(" | ") || "All Catalog Records";
      lines.push(`**Scope:** ${scopeStr}`);
      lines.push("");
      lines.push(
        `**Total Items:** ${rows.length} | **Total Stock Units:** ${totalUnits} | **Cumulative Cargo Weight:** ${totalWeight.toFixed(2)} kg`
      );
      lines.push("");

      lines.push("### 📦 Stock Status Distribution");
      lines.push("| Status | Item Count | Total Units | % Units |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const [st, val] of Object.entries(statusMap)) {
        const pct = totalUnits > 0 ? ((val.units / totalUnits) * 100).toFixed(1) + "%" : "0%";
        lines.push(`| **${st}** | ${val.count} | ${val.units} | ${pct} |`);
      }
      lines.push("");

      lines.push("### 💎 Material Breakdown (Top)");
      lines.push("| Material | Item Count | Total Units |");
      lines.push("| :--- | :--- | :--- |");
      const topMaterials = Object.entries(materialMap)
        .sort((a, b) => b[1].units - a[1].units)
        .slice(0, 8);
      for (const [mat, val] of topMaterials) {
        lines.push(`| ${mat} | ${val.count} | ${val.units} |`);
      }
      lines.push("");

      lines.push("### 📐 Shape Classifications (Top)");
      lines.push("| Shape | Item Count | Total Units |");
      lines.push("| :--- | :--- | :--- |");
      const topShapes = Object.entries(shapeMap)
        .sort((a, b) => b[1].units - a[1].units)
        .slice(0, 8);
      for (const [sh, val] of topShapes) {
        lines.push(`| ${sh} | ${val.count} | ${val.units} |`);
      }
      lines.push("");

      if (!isVendor) {
        lines.push("### 👥 Supplier Volume Breakdown");
        lines.push("| Vendor Prefix | Item Count | Total Units |");
        lines.push("| :--- | :--- | :--- |");
        const topVendors = Object.entries(vendorMap)
          .sort((a, b) => b[1].units - a[1].units)
          .slice(0, 10);
        for (const [v, val] of topVendors) {
          lines.push(`| **${v}** | ${val.count} | ${val.units} |`);
        }
        lines.push("");
      }

      const markdown = lines.join("\n");
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: {
          markdown,
          total_items: rows.length,
          total_units: totalUnits,
          total_weight_kg: totalWeight,
        },
      };
    }

    // Fallthrough for unrecognized tools
    return {
      isError: true,
      content: [{ type: "text", text: `Handler not implemented for tool: '${toolName}'` }],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing '${toolName}': ${err?.message || String(err)}`,
        },
      ],
    };
  }
}
