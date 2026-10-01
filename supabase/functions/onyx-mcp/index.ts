import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ONYX_DATA_TOOLS,
  OnyxDataTool,
  FINANCE_ROLES,
  ALL_STAFF,
} from "../_shared/onyxDataTools.ts";
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Authentication & RBAC Resolution ─────────────────────────────────────────
interface AuthSuccess {
  caller: CallerContext;
  errorResponse?: never;
}

interface AuthFailure {
  caller?: never;
  errorResponse: Response;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validates the Bearer token against Supabase Auth and resolves the caller's
 * application role and vendor scope from the app_users table.
 */
async function authenticateCaller(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;

  if (!token) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Unauthorized: Missing or malformed Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Validate token with Supabase Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Lookup user in app_users table by user.id (with email fallback)
  let appUser: Record<string, any> | null = null;
  const { data: userById, error: userByIdError } = await supabase
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
        JSON.stringify({ error: "Forbidden: User not provisioned in app_users" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Active check (reject if active or is_active is explicitly false)
  const isActive = appUser.active !== false && appUser.is_active !== false;
  if (!isActive) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Forbidden: Account is inactive" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Vendor prefix resolution for Vendor roles
  let vendorPrefix: string | undefined = undefined;
  if (appUser.role === "Vendor") {
    vendorPrefix =
      (appUser.vendor_prefix as string | undefined) ??
      (user.user_metadata?.vendor_prefix as string | undefined) ??
      undefined;
  }

  const caller: CallerContext = {
    role: appUser.role,
    vendorPrefix,
  };

  return { caller };
}

// ── JSON-RPC Response Helpers ────────────────────────────────────────────────
function jsonRpcSuccess(id: string | number | null, result: unknown): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      result,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {}),
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ── HTTP Server Entrypoint ───────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2. Normalize routing path
  const url = new URL(req.url);
  let pathname = url.pathname.replace(/^\/onyx-mcp(?:\/|$)/, "/");
  if (!pathname.startsWith("/")) {
    pathname = "/" + pathname;
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // 3. GET / or GET /health -> Health banner
  if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
    return new Response(
      JSON.stringify({
        status: "ok",
        server: "onyx-mcp",
        version: "1.0.0",
        tools_count: ONYX_DATA_TOOLS.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 4. Authenticate caller for operational endpoints
  const authResult = await authenticateCaller(req);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }
  const caller = authResult.caller;

  // 5. Handle POST requests
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      if (pathname === "/rpc" || pathname === "/messages") {
        return jsonRpcError(null, -32700, "Parse error: Invalid JSON");
      }
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Direct REST Tool Invocation: POST /execute
    if (pathname === "/execute" || (pathname === "/" && typeof body?.tool === "string")) {
      const toolName = body?.tool;
      if (!toolName || typeof toolName !== "string") {
        return new Response(
          JSON.stringify({ error: "Invalid request: 'tool' string parameter is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const tool = ONYX_DATA_TOOLS.find((t) => t.name === toolName);
      if (!tool) {
        return new Response(
          JSON.stringify({ error: `Tool not found: ${toolName}` }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!tool.requiredRoles.includes(caller.role)) {
        return new Response(
          JSON.stringify({
            error: `Forbidden: role '${caller.role}' is not authorized to execute tool '${toolName}'`,
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        const args = (body?.args ?? {}) as Record<string, unknown>;
        const result = await executeOnyxDataTool(supabase, toolName, args, caller);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err.message || "Internal execution error" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // JSON-RPC 2.0 Handler: POST /rpc or POST /messages
    if (
      pathname === "/rpc" ||
      pathname === "/messages" ||
      body?.jsonrpc === "2.0" ||
      typeof body?.method === "string"
    ) {
      const id = body?.id ?? null;
      const method = body?.method;

      if (!method || typeof method !== "string") {
        return jsonRpcError(id, -32600, "Invalid Request: 'method' string is required");
      }

      // JSON-RPC method: tools/list
      if (method === "tools/list") {
        const filteredTools = ONYX_DATA_TOOLS.filter((tool) =>
          tool.requiredRoles.includes(caller.role)
        );
        return jsonRpcSuccess(id, { tools: filteredTools });
      }

      // JSON-RPC method: tools/call
      if (method === "tools/call") {
        const params = body?.params;
        const toolName = params?.name;

        if (!toolName || typeof toolName !== "string") {
          return jsonRpcError(id, -32602, "Invalid params: 'name' is required");
        }

        const tool = ONYX_DATA_TOOLS.find((t) => t.name === toolName);
        if (!tool) {
          return jsonRpcError(id, -32601, `Tool not found: ${toolName}`);
        }

        if (!tool.requiredRoles.includes(caller.role)) {
          return jsonRpcError(
            id,
            -32000,
            `Permission denied: role '${caller.role}' is not authorized to call tool '${toolName}'`
          );
        }

        try {
          const args = (params?.arguments ?? {}) as Record<string, unknown>;
          const toolResult = await executeOnyxDataTool(
            supabase,
            toolName,
            args,
            caller
          );
          return jsonRpcSuccess(id, toolResult);
        } catch (err: any) {
          return jsonRpcError(
            id,
            -32000,
            `Execution error: ${err.message || String(err)}`
          );
        }
      }

      // MCP Lifecycle & Handshake methods
      if (method === "initialize") {
        return jsonRpcSuccess(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "onyx-mcp", version: "1.0.0" },
        });
      }

      if (method === "notifications/initialized") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (method === "ping") {
        return jsonRpcSuccess(id, {});
      }

      // Unknown method
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    return new Response(
      JSON.stringify({ error: `Not Found: route '${pathname}' with method 'POST'` }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: `Method not allowed: ${req.method}` }),
    {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
