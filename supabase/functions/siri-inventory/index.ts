// =============================================================================
// DRAFT — Supabase Edge Function: siri-inventory
// =============================================================================
// Status: DRAFT — deployed by Ramses only.
// Configuration: verify_jwt = true (see supabase/config.toml)
// Date: 2026-10-10
//
// Description:
//   Thin, read-only adapter designed for Apple Shortcuts voice interaction
//   ("Get Contents of URL" -> "Speak Text"). Enforces strict server-side role gating
//   for inventory queries and redacts all financial data for callers outside FINANCE_ROLES.
//
// Required Environment Secrets (same as onyx-mcp):
//   - SUPABASE_URL: Supabase project API URL.
//   - SUPABASE_SERVICE_ROLE_KEY: Service role secret key for admin database access.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { COST_COLUMNS, FINANCE_ROLES } from "../_shared/onyxDataTools.ts";
import {
  executeOnyxDataTool,
  CallerContext,
} from "../_shared/onyxDataHandlers.ts";

// ── Supabase Client Setup ────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CORS Headers ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Role Security Policy ─────────────────────────────────────────────────────
// Owner decision (2026-10-10): Siri shows money to the same roles as the app, FINANCE_ROLES from _shared/onyxDataTools.ts
// (Developer, Admin, ClientBoss, ClientAccounting). Every other role gets all cost columns stripped and a polite refusal on money questions.
// The role is always read from the verified JWT (app_users), never from the request body.
const SIRI_FINANCE_ROLES: string[] = FINANCE_ROLES;

// ── Rate Limiting (In-Memory: 30 requests/min per user) ───────────────────────
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = rateLimits.get(userId);

  if (!record || now > record.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  record.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// ── Authentication & Caller Resolution ────────────────────────────────────────
interface AuthSuccess {
  caller: CallerContext;
  userId: string;
  errorResponse?: never;
}

interface AuthFailure {
  caller?: never;
  userId?: never;
  errorResponse: Response;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validates the Bearer token against Supabase Auth and resolves the caller's
 * application role and vendor scope from the app_users table.
 * Matches the resolution pattern in onyx-mcp/index.ts.
 */
async function authenticateCaller(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;

  if (!token) {
    return {
      errorResponse: new Response(
        JSON.stringify({ ok: false, error: "Unauthorized: Missing or malformed Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      errorResponse: new Response(
        JSON.stringify({ ok: false, error: "Unauthorized: Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  let appUser: Record<string, unknown> | null = null;
  const { data: userById } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (userById) {
    appUser = userById;
  } else if (user.email) {
    const { data: userByEmail } = await supabase
      .from("app_users")
      .select("*")
      .ilike("email", user.email)
      .maybeSingle();
    if (userByEmail) {
      appUser = userByEmail;
    }
  }

  if (!appUser) {
    return {
      errorResponse: new Response(
        JSON.stringify({ ok: false, error: "Forbidden: User not provisioned in app_users" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  const isActive = appUser.active !== false && appUser.is_active !== false;
  if (!isActive) {
    return {
      errorResponse: new Response(
        JSON.stringify({ ok: false, error: "Forbidden: Account is inactive" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  let vendorPrefix: string | undefined = undefined;
  if (appUser.role === "Vendor") {
    vendorPrefix =
      (appUser.vendor_prefix as string | undefined) ??
      (user.user_metadata?.vendor_prefix as string | undefined) ??
      undefined;
  }

  const caller: CallerContext = {
    role: String(appUser.role || "ClientViewer"),
    vendorPrefix,
  };

  return { caller, userId: user.id };
}

// ── Financial Data Stripping (Belt and Braces) ────────────────────────────────
const COST_KEY_PATTERN = /(?:price|cost|retail|landed|acquisition|margin|aq_code|land_code|valuation)/i;

/**
 * Local deep-stripping helper ensuring callers outside FINANCE_ROLES never receive monetary
 * figures, even if returned by underlying handlers.
 */
function stripMoneyFields<T>(val: T): T {
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

const FINANCIAL_QUERY_PATTERN = /(?:price|pricing|cost|costs|how much|total value|retail|landed|acquisition|margin|precio|precios|costo|costos|cuanto cuesta|cuánto cuesta|cuanto vale|cuánto vale|valor total)/i;

function isFinancialQuery(queryText: string): boolean {
  return FINANCIAL_QUERY_PATTERN.test(queryText);
}

// ── Image Extraction Helper ──────────────────────────────────────────────────
function extractImageUrl(item: Record<string, unknown>): string | null {
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

// ── Exported Request Handler ──────────────────────────────────────────────────
export async function handleSiriInventory(req: Request): Promise<Response> {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2. HTTP Method Enforcement (Only POST allowed)
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: `Method not allowed: ${req.method}` }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 3. JWT Verification & Caller RBAC Resolution
  const authResult = await authenticateCaller(req);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  const { caller, userId } = authResult;
  const canSeeMoney = SIRI_FINANCE_ROLES.includes(caller.role);

  // 4. Rate Limiting Check (30 requests per minute per user)
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Rate limit exceeded. Please wait a moment before trying again.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  // 5. Parse Request Payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Bad Request: Invalid JSON body" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const intent = typeof body?.intent === "string" ? body.intent.trim().toLowerCase() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const lang = body?.lang === "es" ? "es" : "en";
  const isEs = lang === "es";

  // Validate Intent
  if (intent !== "search" && intent !== "count" && intent !== "item") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Bad Request: Unknown or missing intent '${intent}'. Expected 'search', 'count', or 'item'.`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 6. Role Gate: Polite Refusal on Financial Queries outside FINANCE_ROLES
  if (!canSeeMoney && isFinancialQuery(query)) {
    const refusalText = isEs
      ? "Los precios y datos financieros solo están disponibles para los roles de finanzas de Onyx."
      : "Prices and financial data are only available to Onyx finance roles.";

    const refusalResponse: SiriResponse = {
      ok: true,
      spoken_text: refusalText,
      title: isEs ? "Restringido" : "Restricted",
      fields: [],
      image_url: null,
      truncated: false,
    };

    return new Response(JSON.stringify(refusalResponse), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 7. Intent Execution
  try {
    // ── Intent: "item" ────────────────────────────────────────────────────────
    if (intent === "item") {
      if (!query) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Bad Request: 'query' parameter is required for 'item' intent.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      const itemArgs = isUuid ? { id: query } : { item_id: query };

      let itemResult = await executeOnyxDataTool(supabase, "inventory_get_item", itemArgs, caller);
      let foundData = itemResult.structuredContent;

      if (!foundData || foundData.found === false) {
        const barcodeResult = await executeOnyxDataTool(
          supabase,
          "inventory_get_by_barcode",
          { barcode: query },
          caller
        );
        foundData = barcodeResult.structuredContent;
      }

      if (!foundData || foundData.found === false) {
        const notFoundText = isEs
          ? `No se encontró el artículo ${query}.`
          : `Item ${query} was not found.`;

        const notFoundResponse: SiriResponse = {
          ok: false,
          spoken_text: notFoundText,
          title: isEs ? "Artículo no encontrado" : "Item Not Found",
          fields: [],
          image_url: null,
          truncated: false,
        };

        return new Response(JSON.stringify(notFoundResponse), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let item = foundData as Record<string, unknown>;
      if (!canSeeMoney) {
        item = stripMoneyFields(item);
      }

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

      const itemIdStr = String(item.item_id || query);
      const statusStr = String(item.status || (isEs ? "Disponible" : "Available"));
      const dimPart = item.dimensions ? (isEs ? ` Medidas: ${item.dimensions}.` : ` Dimensions: ${item.dimensions}.`) : "";
      const matPart = item.material ? (isEs ? ` Material: ${item.material}.` : ` Material: ${item.material}.`) : "";
      const spokenText = `${itemIdStr}: ${statusStr}.${dimPart}${matPart}`;

      const responsePayload: SiriResponse = {
        ok: true,
        spoken_text: spokenText,
        title: itemIdStr,
        fields,
        image_url: extractImageUrl(item),
        truncated: false,
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Intent: "count" ───────────────────────────────────────────────────────
    if (intent === "count") {
      const isGeneralCount =
        !query || /^(all|todos|total|inventario|inventory|status|estatus)$/i.test(query);

      if (isGeneralCount) {
        const countResult = await executeOnyxDataTool(
          supabase,
          "inventory_count_by_status",
          {},
          caller
        );

        const countData = countResult.structuredContent ?? {};
        const byStatus = (countData.by_status ?? {}) as Record<string, { items: number; quantity: number }>;
        const totalItems = Number(countData.total_items ?? 0);
        const totalQuantity = Number(countData.total_quantity ?? 0);

        const fields: Array<{ label: string; value: string }> = Object.entries(byStatus).map(
          ([statusKey, stats]) => ({
            label: statusKey,
            value: `${stats.items} items (${stats.quantity} units)`,
          })
        );

        const spokenText = isEs
          ? `Total en inventario: ${totalItems} artículos en ${totalQuantity} unidades.`
          : `Total inventory: ${totalItems} items across ${totalQuantity} units.`;

        const responsePayload: SiriResponse = {
          ok: true,
          spoken_text: spokenText,
          title: isEs ? "Conteo de inventario" : "Inventory Count",
          fields,
          image_url: null,
          truncated: false,
        };

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filtered Count using inventory_search
      const searchResult = await executeOnyxDataTool(
        supabase,
        "inventory_search",
        { query, limit: 5 },
        caller
      );

      const searchData = searchResult.structuredContent ?? {};
      const totalCount = Number(searchData.total_count ?? 0);
      let items = (searchData.items ?? []) as Array<Record<string, unknown>>;
      if (!canSeeMoney) {
        items = stripMoneyFields(items);
      }

      const fields: Array<{ label: string; value: string }> = items.slice(0, 5).map((it) => ({
        label: String(it.item_id || "Item"),
        value: [it.short_description, it.status].filter(Boolean).map(String).join(" - ") || "Inventory",
      }));

      const spokenText = isEs
        ? `Se encontraron ${totalCount} artículos para "${query}".`
        : `Found ${totalCount} items for "${query}".`;

      const responsePayload: SiriResponse = {
        ok: true,
        spoken_text: spokenText,
        title: isEs ? `Conteo: ${query}` : `Count: ${query}`,
        fields,
        image_url: items.length > 0 ? extractImageUrl(items[0]) : null,
        truncated: totalCount > 5,
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Intent: "search" ──────────────────────────────────────────────────────
    if (intent === "search") {
      const searchResult = await executeOnyxDataTool(
        supabase,
        "inventory_search",
        { query, limit: 5 },
        caller
      );

      const searchData = searchResult.structuredContent ?? {};
      const totalCount = Number(searchData.total_count ?? 0);
      let items = (searchData.items ?? []) as Array<Record<string, unknown>>;
      if (!canSeeMoney) {
        items = stripMoneyFields(items);
      }

      if (items.length === 0) {
        const noResultsText = isEs
          ? `No se encontraron artículos para "${query}".`
          : `No items found matching "${query}".`;

        const noResultsResponse: SiriResponse = {
          ok: true,
          spoken_text: noResultsText,
          title: isEs ? "Sin resultados" : "No Results",
          fields: [],
          image_url: null,
          truncated: false,
        };

        return new Response(JSON.stringify(noResultsResponse), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const displayedItems = items.slice(0, 5);
      const isTruncated = totalCount > 5;
      const idList = displayedItems
        .map((it) => String(it.item_id || it.short_description || "item"))
        .join(", ");
      const remaining = totalCount - displayedItems.length;

      let spokenText: string;
      if (isTruncated) {
        spokenText = isEs
          ? `Se encontraron ${totalCount} artículos. Mostrando 5: ${idList}. Hay ${remaining} artículos más.`
          : `Found ${totalCount} items. Showing 5: ${idList}. ${remaining} more items exist.`;
      } else {
        spokenText = isEs
          ? `Se encontraron ${totalCount} artículos: ${idList}.`
          : `Found ${totalCount} items: ${idList}.`;
      }

      const fields: Array<{ label: string; value: string }> = displayedItems.map((it) => ({
        label: String(it.item_id || "Item"),
        value: [it.short_description, it.status, it.dimensions].filter(Boolean).map(String).join(" · ") || String(it.status || "In catalog"),
      }));

      const responsePayload: SiriResponse = {
        ok: true,
        spoken_text: spokenText,
        title: isEs ? `Búsqueda: ${query}` : `Search: ${query}`,
        fields,
        image_url: extractImageUrl(displayedItems[0]),
        truncated: isTruncated,
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback response for unhandled control flow
    return new Response(
      JSON.stringify({ ok: false, error: "Internal processing error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (_err: unknown) {
    // Never expose database error details, SQL queries, tokens, or stack traces
    return new Response(
      JSON.stringify({
        ok: false,
        error: "An unexpected error occurred while processing the inventory request.",
        spoken_text: isEs
          ? "Ocurrió un error inesperado al procesar la solicitud de inventario."
          : "An unexpected error occurred while processing the inventory request.",
        title: isEs ? "Error del sistema" : "System Error",
        fields: [],
        image_url: null,
        truncated: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// ── HTTP Server Listener ─────────────────────────────────────────────────────
serve(handleSiriInventory);
