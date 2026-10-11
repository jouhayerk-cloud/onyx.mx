// =============================================================================
// Pure Helpers for Siri Inventory Adapter (supabase/functions/siri-inventory)
// =============================================================================
// Pure logic extracted from index.ts:
//   - Zero network, zero database, zero Deno.env calls.
//   - Fully testable via standard Deno test runner.
// =============================================================================

import { COST_COLUMNS, FINANCE_ROLES } from "../_shared/onyxDataTools.ts";

// ── Role Security Policy ─────────────────────────────────────────────────────
// Siri shows money to the same roles as the app, FINANCE_ROLES from _shared/onyxDataTools.ts:
// (Developer, Admin, ClientBoss, ClientAccounting). Every other role gets cost columns stripped.
export const SIRI_FINANCE_ROLES: string[] = FINANCE_ROLES;

// ── Financial Data Stripping (Belt and Braces) ────────────────────────────────
export const COST_KEY_PATTERN = /(?:price|cost|retail|landed|acquisition|margin|aq_code|land_code|valuation)/i;

/**
 * Deep-stripping helper ensuring callers outside FINANCE_ROLES never receive monetary
 * figures, even if returned by underlying handlers. Removes all keys in COST_COLUMNS
 * as well as any key matching COST_KEY_PATTERN at any object nesting depth or within arrays.
 */
export function stripMoneyFields<T>(val: T): T {
  if (!val) return val;
  if (Array.isArray(val)) {
    return val.map((item) => stripMoneyFields(item)) as unknown as T;
  }
  if (typeof val === "object" && val !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (COST_COLUMNS.includes(k) || COST_KEY_PATTERN.test(k)) {
        continue;
      }
      out[k] = stripMoneyFields(v);
    }
    return out as T;
  }
  return val;
}

// ── Financial Query Detection ────────────────────────────────────────────────
export const FINANCIAL_QUERY_PATTERN = /(?:price|pricing|cost|costs|how much|total value|retail|landed|acquisition|margin|precio|precios|costo|costos|cuanto cuesta|cuánto cuesta|cuanto vale|cuánto vale|valor total)/i;

export function isFinancialQuery(queryText: string): boolean {
  return FINANCIAL_QUERY_PATTERN.test(queryText);
}

// ── Image Extraction Helper ──────────────────────────────────────────────────
export function extractImageUrl(item: Record<string, unknown>): string | null {
  if (!item || typeof item !== "object") return null;

  if (typeof item.generated_png_url === "string" && item.generated_png_url.startsWith("http")) {
    return item.generated_png_url;
  }

  if (Array.isArray(item.image_urls) && item.image_urls.length > 0) {
    const first = item.image_urls.find((u) => typeof u === "string" && u.startsWith("http"));
    if (first) return first;
  }

  if (item.processed_media_urls) {
    let pMap = item.processed_media_urls;
    if (typeof pMap === "string" && pMap.trim().startsWith("{")) {
      try {
        pMap = JSON.parse(pMap);
      } catch {
        // Safe fallback if JSON parsing fails
      }
    }
    if (typeof pMap === "object" && pMap !== null) {
      for (const [k, v] of Object.entries(pMap as Record<string, unknown>)) {
        if (!k.startsWith("_") && typeof v === "string" && v.startsWith("http")) {
          return v;
        }
      }
    }
  }

  if (typeof item.media_urls === "string" && item.media_urls) {
    const first = item.media_urls.split(/[,;]/)[0]?.trim();
    if (first && first.startsWith("http")) return first;
  }

  return null;
}

// ── Response Contract ─────────────────────────────────────────────────────────
export interface SiriResponse {
  ok: boolean;
  spoken_text: string;
  title: string;
  fields: Array<{ label: string; value: string }>;
  image_url: string | null;
  truncated: boolean;
}

// ── Intent & Language Parsing ─────────────────────────────────────────────────
export interface ParsedRequest {
  intent: string;
  query: string;
  lang: "es" | "en";
  isEs: boolean;
}

export function parseRequestPayload(body: unknown): ParsedRequest {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const intent = typeof b?.intent === "string" ? b.intent.trim().toLowerCase() : "";
  const query = typeof b?.query === "string" ? b.query.trim().slice(0, 120) : "";   // review MCP2-B: cap the length (regex cost, text to speech)
  const lang = b?.lang === "es" ? "es" : "en";
  const isEs = lang === "es";
  return { intent, query, lang, isEs };
}

export function isValidIntent(intent: string): boolean {
  return intent === "search" || intent === "count" || intent === "item" || intent === "vendor";
}

// ── Vendor Query Parsing ──────────────────────────────────────────────────────
export const VENDOR_KEYWORD_PATTERN =
  /(?:vendor|proveedor)\s*(?:id|code|código|de|of)?[:\s#]+([a-zA-Z]{2})\b/i;

export const VENDOR_FILLER_WORDS = new Set([
  // English
  "how", "many", "pieces", "piece", "items", "item", "units", "unit",
  "from", "for", "does", "do", "have", "has", "of", "in", "the", "a", "an",
  "inventory", "stock", "vendor", "vendors", "code", "id", "please",
  "total", "all", "is", "it", "to", "at", "by", "with", "no", "not",
  // Spanish
  "cuantas", "cuántas", "cuantos", "cuántos", "piezas", "pieza",
  "articulos", "artículos", "articulo", "artículo", "unidades", "unidad",
  "del", "de", "la", "el", "los", "las", "tiene", "tienen", "hay", "en",
  "inventario", "stock", "proveedor", "proveedores", "codigo", "código",
  "por", "favor", "total", "todos", "todas", "un", "una", "si", "sí", "con",
]);

/**
 * Extracts a 2-letter vendor code from user spoken phrases in English or Spanish,
 * stripping filler words and punctuation and returning the uppercase code.
 */
export function parseVendorQuery(query: string): string {
  if (!query || typeof query !== "string") return "";

  const trimmed = query.trim();

  // 1. Direct keyword match (e.g. "vendor em", "proveedor JM", "how many pieces from vendor EM")
  const match = trimmed.match(VENDOR_KEYWORD_PATTERN);
  if (match) {
    return match[1].toUpperCase();
  }

  // 2. Strip punctuation and filler words, then find 2-letter vendor code
  const cleaned = trimmed.replace(/[¿?¡!.,:;'"()\[\]{}#\-_\\/]/g, " ").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const remaining = tokens.filter((t) => !VENDOR_FILLER_WORDS.has(t.toLowerCase()));

  for (const token of remaining) {
    if (/^[a-zA-Z]{2}$/.test(token)) {
      return token.toUpperCase();
    }
  }

  return "";
}

// ── Spoken Text & Response Builders ──────────────────────────────────────────

export function buildFinancialRefusalResponse(isEs: boolean): SiriResponse {
  const refusalText = isEs
    ? "Los precios y datos financieros solo están disponibles para los roles de finanzas de Onyx."
    : "Prices and financial data are only available to Onyx finance roles.";

  return {
    ok: true,
    spoken_text: refusalText,
    title: isEs ? "Restringido" : "Restricted",
    fields: [],
    image_url: null,
    truncated: false,
  };
}

export function buildItemNotFoundResponse(query: string, isEs: boolean): SiriResponse {
  const notFoundText = isEs
    ? `No se encontró el artículo ${query}.`
    : `Item ${query} was not found.`;

  return {
    ok: false,
    spoken_text: notFoundText,
    title: isEs ? "Artículo no encontrado" : "Item Not Found",
    fields: [],
    image_url: null,
    truncated: false,
  };
}

export function buildItemFields(
  item: Record<string, unknown>,
  canSeeMoney: boolean
): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  if (item.status) fields.push({ label: "Status", value: String(item.status) });
  if (item.material) fields.push({ label: "Material", value: String(item.material) });
  if (item.shape) fields.push({ label: "Shape", value: String(item.shape) });
  if (item.dimensions) fields.push({ label: "Dimensions", value: String(item.dimensions) });
  if (item.crate_id) fields.push({ label: "Crate", value: String(item.crate_id) });

  if (canSeeMoney) {
    if (item.price_mxn !== null && item.price_mxn !== undefined) {
      fields.push({ label: "Price MXN", value: `$${item.price_mxn} MXN` });
    }
    if (item.book_retail !== null && item.book_retail !== undefined) {
      fields.push({ label: "Retail USD", value: `$${item.book_retail} USD` });
    }
  }

  return fields;
}

export function buildItemSpokenText(
  item: Record<string, unknown>,
  query: string,
  isEs: boolean
): string {
  const itemIdStr = String(item.item_id || query);
  const statusStr = String(item.status || (isEs ? "Disponible" : "Available"));
  const dimPart = item.dimensions
    ? isEs
      ? ` Medidas: ${item.dimensions}.`
      : ` Dimensions: ${item.dimensions}.`
    : "";
  const matPart = item.material
    ? isEs
      ? ` Material: ${item.material}.`
      : ` Material: ${item.material}.`
    : "";
  return `${itemIdStr}: ${statusStr}.${dimPart}${matPart}`;
}

export function buildItemResponse(
  item: Record<string, unknown>,
  query: string,
  canSeeMoney: boolean,
  isEs: boolean
): SiriResponse {
  const sanitizedItem = canSeeMoney ? item : stripMoneyFields(item);
  const fields = buildItemFields(sanitizedItem, canSeeMoney);
  const spokenText = buildItemSpokenText(sanitizedItem, query, isEs);
  const itemIdStr = String(sanitizedItem.item_id || query);

  return {
    ok: true,
    spoken_text: spokenText,
    title: itemIdStr,
    fields,
    image_url: extractImageUrl(sanitizedItem),
    truncated: false,
  };
}

export function buildGeneralCountSpokenText(
  totalItems: number,
  totalQuantity: number,
  isEs: boolean
): string {
  return isEs
    ? `Total en inventario: ${totalItems} artículos en ${totalQuantity} unidades.`
    : `Total inventory: ${totalItems} items across ${totalQuantity} units.`;
}

export function buildGeneralCountResponse(
  byStatus: Record<string, { items: number; quantity: number }>,
  totalItems: number,
  totalQuantity: number,
  isEs: boolean
): SiriResponse {
  const fields: Array<{ label: string; value: string }> = Object.entries(byStatus).map(
    ([statusKey, stats]) => ({
      label: statusKey,
      value: `${stats.items} items (${stats.quantity} units)`,
    })
  );

  return {
    ok: true,
    spoken_text: buildGeneralCountSpokenText(totalItems, totalQuantity, isEs),
    title: isEs ? "Conteo de inventario" : "Inventory Count",
    fields,
    image_url: null,
    truncated: false,
  };
}

export function buildFilteredCountSpokenText(
  query: string,
  totalCount: number,
  isEs: boolean
): string {
  return isEs
    ? `Se encontraron ${totalCount} artículos para "${query}".`
    : `Found ${totalCount} items for "${query}".`;
}

export function buildFilteredCountResponse(
  query: string,
  totalCount: number,
  items: Array<Record<string, unknown>>,
  canSeeMoney: boolean,
  isEs: boolean
): SiriResponse {
  const sanitizedItems = canSeeMoney ? items : stripMoneyFields(items);
  const fields: Array<{ label: string; value: string }> = sanitizedItems.slice(0, 5).map((it) => ({
    label: String(it.item_id || "Item"),
    value: [it.short_description, it.status].filter(Boolean).map(String).join(" - ") || "Inventory",
  }));

  return {
    ok: true,
    spoken_text: buildFilteredCountSpokenText(query, totalCount, isEs),
    title: isEs ? `Conteo: ${query}` : `Count: ${query}`,
    fields,
    image_url: sanitizedItems.length > 0 ? extractImageUrl(sanitizedItems[0]) : null,
    truncated: totalCount > 5,
  };
}

export function buildSearchNoResultsResponse(
  query: string,
  isEs: boolean
): SiriResponse {
  const noResultsText = isEs
    ? `No se encontraron artículos para "${query}".`
    : `No items found matching "${query}".`;

  return {
    ok: true,
    spoken_text: noResultsText,
    title: isEs ? "Sin resultados" : "No Results",
    fields: [],
    image_url: null,
    truncated: false,
  };
}

export function buildSearchSpokenText(
  totalCount: number,
  displayedIds: string[],
  isTruncated: boolean,
  isEs: boolean
): string {
  const idList = displayedIds.join(", ");
  const remaining = totalCount - displayedIds.length;
  if (isTruncated) {
    return isEs
      ? `Se encontraron ${totalCount} artículos. Mostrando ${displayedIds.length}: ${idList}. Hay ${remaining} artículos más.`
      : `Found ${totalCount} items. Showing ${displayedIds.length}: ${idList}. ${remaining} more items exist.`;
  } else {
    return isEs
      ? `Se encontraron ${totalCount} artículos: ${idList}.`
      : `Found ${totalCount} items: ${idList}.`;
  }
}

export function buildSearchResponse(
  query: string,
  totalCount: number,
  items: Array<Record<string, unknown>>,
  canSeeMoney: boolean,
  isEs: boolean
): SiriResponse {
  const sanitizedItems = canSeeMoney ? items : stripMoneyFields(items);
  if (sanitizedItems.length === 0) {
    return buildSearchNoResultsResponse(query, isEs);
  }

  const displayedItems = sanitizedItems.slice(0, 5);
  const isTruncated = totalCount > 5;
  const displayedIds = displayedItems.map((it) =>
    String(it.item_id || it.short_description || "item")
  );
  const spokenText = buildSearchSpokenText(totalCount, displayedIds, isTruncated, isEs);

  const fields: Array<{ label: string; value: string }> = displayedItems.map((it) => ({
    label: String(it.item_id || "Item"),
    value:
      [it.short_description, it.status, it.dimensions].filter(Boolean).map(String).join(" · ") ||
      String(it.status || "In catalog"),
  }));

  return {
    ok: true,
    spoken_text: spokenText,
    title: isEs ? `Búsqueda: ${query}` : `Search: ${query}`,
    fields,
    image_url: extractImageUrl(displayedItems[0]),
    truncated: isTruncated,
  };
}

export function buildVendorNotFoundSpokenText(vendor: string, isEs: boolean): string {
  return isEs
    ? `No se encontró el proveedor ${vendor}.`
    : `Vendor ${vendor} was not found.`;
}

export function buildVendorNotFoundResponse(vendor: string, isEs: boolean): SiriResponse {
  return {
    ok: false,
    spoken_text: buildVendorNotFoundSpokenText(vendor, isEs),
    title: isEs ? "Proveedor no encontrado" : "Vendor Not Found",
    fields: [],
    image_url: null,
    truncated: false,
  };
}

export function buildVendorCountSpokenText(
  vendor: string,
  count: number,
  isEs: boolean
): string {
  if (isEs) {
    return count === 1
      ? `El proveedor ${vendor} tiene 1 pieza.`
      : `El proveedor ${vendor} tiene ${count} piezas.`;
  }
  return count === 1
    ? `Vendor ${vendor} has 1 piece.`
    : `Vendor ${vendor} has ${count} pieces.`;
}

export function buildVendorCountResponse(
  vendor: string,
  count: number,
  isEs: boolean,
  itemsCount?: number
): SiriResponse {
  const fields: Array<{ label: string; value: string }> = [
    { label: "Vendor", value: vendor },
    { label: isEs ? "Piezas" : "Pieces", value: String(count) },
  ];
  if (itemsCount !== undefined && itemsCount > 0) {
    fields.push({ label: isEs ? "Artículos" : "Items", value: String(itemsCount) });
  }

  return {
    ok: true,
    spoken_text: buildVendorCountSpokenText(vendor, count, isEs),
    title: isEs ? `Proveedor: ${vendor}` : `Vendor: ${vendor}`,
    fields,
    image_url: null,
    truncated: false,
  };
}

export function buildSystemErrorResponse(isEs: boolean): {
  spoken_text: string;
  title: string;
  fields: Array<{ label: string; value: string }>;
  image_url: string | null;
  truncated: boolean;
} {
  return {
    spoken_text: isEs
      ? "Ocurrió un error inesperado al procesar la solicitud de inventario."
      : "An unexpected error occurred while processing the inventory request.",
    title: isEs ? "Error del sistema" : "System Error",
    fields: [],
    image_url: null,
    truncated: false,
  };
}
