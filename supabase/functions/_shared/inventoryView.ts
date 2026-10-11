// =============================================================================
// Onyx.mx Inventory View & Projection Helpers
// =============================================================================
// Pure helpers for column projection and payload capping across inventory tools:
// inventory_search, inventory_list_by_crate, inventory_list_by_vendor.
// Pure TypeScript: ZERO imports from Deno std, npm, or external networks.
// =============================================================================

import { COST_COLUMNS } from "./onyxDataTools.ts";

/**
 * The canonical list of inventory table columns from docs/_inputs/inventory_columns.txt.
 */
export const KNOWN_COLUMNS: readonly string[] = [
  "id",
  "timestamp",
  "item_id",
  "item_number",
  "workbook",
  "status",
  "created_by",
  "marked_by",
  "acquired_by",
  "acquired_at",
  "shape",
  "material",
  "description",
  "color",
  "quantity",
  "short_description",
  "detailed_description",
  "generated_description",
  "weight_kg",
  "height_cm",
  "width_cm",
  "length_cm",
  "price_mxn",
  "book_landed",
  "book_retail",
  "book_barcode",
  "book_aq_code",
  "book_land_code",
  "invoice_id",
  "print_date",
  "media_urls",
  "generated_image_urls",
  "generated_png_url",
  "generated_svg_url",
  "spatial_boxes_2d",
  "spatial_points",
  "spatial_masks",
  "spatial_boxes_3d",
  "pay_req",
  "pay_date",
  "shipped",
  "crate_id",
  "sent_notes",
  "sent_pack",
  "sent_date",
  "updated_at",
  "is_client_visible",
  "expires",
  "rating",
  "is_hidden",
  "hidden_reason",
  "payment_ids",
  "packing_status",
  "processed_media_urls",
  "generated_color",
  "vendor_id",
  "generated_type",
  "vendor_notes",
  "ocr_raw_text",
  "translation_status",
  "book_acquisition",
  "created_at",
  "pack_date",
  "sent_manifest_id",
  "print_job_checksum",
  "print_job_id",
  "payment_requested_at",
  "payment_status",
  "lifecycle_status",
  "labels_printed_total",
  "print_job_count",
  "axo_icon_url",
];

/**
 * Sensitive columns blocked from Vendor callers in inventory tools.
 */
export const VENDOR_DENY: readonly string[] = [
  "vendor_notes",
  "is_hidden",
  "hidden_reason",
  "created_by",
  "marked_by",
  "acquired_by",
  "ocr_raw_text",
  "print_job_checksum",
  "print_job_id",
  "print_job_count",
  "labels_printed_total",
  "payment_ids",
  "payment_status",
  "payment_requested_at",
  "pay_req",
  "pay_date",
  "invoice_id",
  "sent_notes",
  "sent_manifest_id",
];

/**
 * Curated compact columns (~20 core columns identifying and describing a piece).
 * Excludes media, spatial_*, ocr, translation, print_job, and axo columns.
 */
export const COMPACT_COLUMNS: readonly string[] = [
  "id",
  "item_id",
  "item_number",
  "workbook",
  "status",
  "lifecycle_status",
  "vendor_id",
  "shape",
  "material",
  "color",
  "quantity",
  "short_description",
  "description",
  "weight_kg",
  "height_cm",
  "width_cm",
  "length_cm",
  "book_barcode",
  "crate_id",
  "packing_status",
  "updated_at",
];

/**
 * Helper generating comma-separated string for compact view.
 * Finance callers get price_mxn and book_retail added; other roles get neither.
 * Never includes book_landed, book_acquisition, or cypher code columns.
 */
function getCompactSelect(isFinance?: boolean): string {
  const cols = [...COMPACT_COLUMNS];
  if (isFinance) {
    cols.push("price_mxn", "book_retail");
  }
  return cols.join(",");
}

/**
 * Resolves the Supabase PostgREST select column list.
 *
 * Rules:
 * - When fields is provided: intersected with KNOWN_COLUMNS and has COST_COLUMNS
 *   removed for non-finance callers. Unknown columns are dropped.
 *   For Vendor callers, VENDOR_DENY columns are also dropped.
 *   If the resulting list is empty, falls back to compact view.
 * - When fields is omitted or empty:
 *   - view === "full" returns "*" for non-vendors; for Vendor callers returns an
 *     explicit column list of all KNOWN_COLUMNS excluding VENDOR_DENY and COST_COLUMNS.
 *   - view === "compact" (or default) returns compact columns.
 * - Finance callers get price_mxn and book_retail added to compact view;
 *   never book_landed, book_acquisition, or cypher codes.
 */
export function selectColumns(
  view?: string | null,
  fields?: string[] | null,
  isFinance?: boolean,
  isVendor?: boolean
): string {
  const vendorDenySet = new Set(VENDOR_DENY);
  const costSet = new Set(COST_COLUMNS);

  if (fields && Array.isArray(fields) && fields.length > 0) {
    const knownSet = new Set(KNOWN_COLUMNS);
    const selected: string[] = [];

    for (const f of fields.slice(0, 30)) {
      if (typeof f !== "string") continue;
      const clean = f.trim();
      if (!knownSet.has(clean)) continue;
      if (isVendor && vendorDenySet.has(clean)) continue;
      if ((!isFinance || isVendor) && costSet.has(clean)) continue;
      if (!selected.includes(clean)) {
        selected.push(clean);
      }
    }

    if (selected.length > 0) {
      return selected.join(",");
    }

    // Empty intersection falls back to compact view
    return getCompactSelect(isFinance);
  }

  if (view === "full") {
    if (isVendor) {
      return KNOWN_COLUMNS.filter(
        (col) => !vendorDenySet.has(col) && !costSet.has(col)
      ).join(",");
    }
    return "*";
  }

  return getCompactSelect(isFinance);
}

export interface CapPayloadResult<T> {
  items: T[];
  truncated: boolean;
}

/**
 * Drops items from the end of the items list until JSON.stringify is at most maxChars (default 60000).
 * Supports being passed either an items array directly, or a full payload object containing an items array.
 * Reports { items, truncated }.
 */
export function capPayload<T>(
  itemsOrPayload: T[] | { items: T[]; [key: string]: unknown },
  maxChars = 60000
): CapPayloadResult<T> {
  const isObj =
    !Array.isArray(itemsOrPayload) &&
    itemsOrPayload !== null &&
    typeof itemsOrPayload === "object" &&
    Array.isArray((itemsOrPayload as Record<string, unknown>).items);

  const rawItems: T[] = isObj
    ? ((itemsOrPayload as Record<string, unknown>).items as T[])
    : (itemsOrPayload as T[]);

  if (!rawItems || rawItems.length === 0) {
    return { items: [], truncated: false };
  }

  const checkLength = (curr: T[], willTruncate = false) => {
    if (isObj) {
      return JSON.stringify({
        ...(itemsOrPayload as Record<string, unknown>),
        items: curr,
        ...(willTruncate ? { truncated: true, has_more: true } : {}),
      }).length;
    }
    return JSON.stringify(curr).length;
  };

  if (checkLength(rawItems, false) <= maxChars) {
    return { items: [...rawItems], truncated: false };
  }

  const current = [...rawItems];
  while (current.length > 0 && checkLength(current, true) > maxChars) {
    current.pop();
  }

  return { items: current, truncated: true };
}
