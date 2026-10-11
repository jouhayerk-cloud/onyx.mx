// =============================================================================
// Supabase Edge Function: siri-inventory
// =============================================================================
// Status: LIVE (deployed 2026-10-10); redeploy only with Ramses approval.
// Configuration: verify_jwt = false; this function verifies a Supabase JWT or a siri_ token itself (see supabase/config.toml)
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
import {
  executeOnyxDataTool,
  CallerContext,
} from "../_shared/onyxDataHandlers.ts";
import {
  SIRI_FINANCE_ROLES,
  SiriResponse,
  isFinancialQuery,
  parseRequestPayload,
  isValidIntent,
  parseVendorQuery,
  buildFinancialRefusalResponse,
  buildItemNotFoundResponse,
  buildItemResponse,
  buildGeneralCountResponse,
  buildFilteredCountResponse,
  buildSearchResponse,
  buildVendorCountResponse,
  buildVendorNotFoundResponse,
  buildSystemErrorResponse,
} from "./helpers.ts";

export type { SiriResponse };

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

import { isSiriToken, hashSiriToken } from "../_shared/siriToken.ts";
import { escapeLikeValue } from "../_shared/likeEscape.ts";

const tokenUsageCache = new Map<string, number>();

/**
 * Validates the Bearer token against Supabase Auth (or Siri token) and resolves the caller's
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

  let user: Record<string, any> | null = null;
  // a siri token remembers its app_users row (app_users.id is not the auth user id in this project)
  let tokenAppUserId: string | null = null;

  if (isSiriToken(token)) {
    const tokenHash = await hashSiriToken(token);
    const { data: siriToken } = await supabase
      .from("siri_tokens")
      .select("id, user_id, app_user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!siriToken) {
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

    user = { id: siriToken.user_id };
    tokenAppUserId = (siriToken.app_user_id as string | null) ?? null;

    const now = Date.now();
    const lastUpdate = tokenUsageCache.get(siriToken.id) ?? 0;
    if (now - lastUpdate > 60000) {
      tokenUsageCache.set(siriToken.id, now);
      void Promise.resolve(
        supabase
          .from("siri_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", siriToken.id),
      ).catch(() => {});
    }
  } else {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
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
    user = authUser;
  }

  let appUser: Record<string, unknown> | null = null;
  const { data: userById } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", tokenAppUserId ?? user.id)
    .maybeSingle();

  if (userById) {
    appUser = userById;
  } else if (user.email) {
    const { data: userByEmail } = await supabase
      .from("app_users")
      .select("*")
      .ilike("email", escapeLikeValue(user.email))
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

  const { intent, query, isEs } = parseRequestPayload(body);

  // Validate Intent
  if (!isValidIntent(intent)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Bad Request: Unknown or missing intent '${intent}'. Expected 'search', 'count', 'item', or 'vendor'.`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 6. Role Gate: Polite Refusal on Financial Queries outside FINANCE_ROLES
  if (!canSeeMoney && isFinancialQuery(query)) {
    const refusalResponse = buildFinancialRefusalResponse(isEs);

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
        const notFoundResponse = buildItemNotFoundResponse(query, isEs);

        return new Response(JSON.stringify(notFoundResponse), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const responsePayload = buildItemResponse(
        foundData as Record<string, unknown>,
        query,
        canSeeMoney,
        isEs
      );

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

        const responsePayload = buildGeneralCountResponse(byStatus, totalItems, totalQuantity, isEs);

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filtered Count using inventory_search
      const searchResult = await executeOnyxDataTool(
        supabase,
        "inventory_search",
        { query, limit: 5, view: "full" },
        caller
      );

      const searchData = searchResult.structuredContent ?? {};
      const totalCount = Number(searchData.total_count ?? 0);
      const items = (searchData.items ?? []) as Array<Record<string, unknown>>;

      const responsePayload = buildFilteredCountResponse(query, totalCount, items, canSeeMoney, isEs);

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
        { query, limit: 5, view: "full" },
        caller
      );

      const searchData = searchResult.structuredContent ?? {};
      const totalCount = Number(searchData.total_count ?? 0);
      const items = (searchData.items ?? []) as Array<Record<string, unknown>>;

      const responsePayload = buildSearchResponse(query, totalCount, items, canSeeMoney, isEs);

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Intent: "vendor" ──────────────────────────────────────────────────────
    if (intent === "vendor") {
      const vendorCode = parseVendorQuery(query);

      if (!vendorCode) {
        const notFoundResponse = buildVendorNotFoundResponse(
          query || (isEs ? "desconocido" : "unknown"),
          isEs
        );
        return new Response(JSON.stringify(notFoundResponse), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // A Vendor caller may only ask about their own vendor code (the count tool itself is not scoped).
      if (caller.role === "Vendor" && String(caller.vendorPrefix ?? "").toUpperCase() !== vendorCode.toUpperCase()) {
        return new Response(JSON.stringify(buildVendorNotFoundResponse(vendorCode, isEs)), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const vendorResult = await executeOnyxDataTool(
        supabase,
        "inventory_count_by_vendor",
        {},
        caller
      );

      const vendorData = vendorResult.structuredContent ?? {};
      const byVendor = (vendorData.by_vendor ?? {}) as Record<string, { items: number; quantity: number }>;
      const stats = byVendor[vendorCode] || byVendor[vendorCode.toLowerCase()] || byVendor[vendorCode.toUpperCase()];

      const quantity = Number(stats?.quantity ?? stats?.items ?? 0);
      const items = Number(stats?.items ?? 0);

      if (!stats || (quantity <= 0 && items <= 0)) {
        const notFoundResponse = buildVendorNotFoundResponse(vendorCode, isEs);
        return new Response(JSON.stringify(notFoundResponse), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const responsePayload = buildVendorCountResponse(vendorCode, quantity, isEs, items);

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
        ...buildSystemErrorResponse(isEs),
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
