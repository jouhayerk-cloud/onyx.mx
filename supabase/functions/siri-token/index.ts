import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { generateSiriToken, hashSiriToken, bearerFrom } from "../_shared/siriToken.ts";
import { generateMcpToken, tokenKindOfPrefix } from "../_shared/mcpToken.ts";
import { escapeLikeValue } from "../_shared/likeEscape.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Rate Limiting (In-Memory: 20 requests/min per user) ───────────────────────
interface RateLimitRecord {
    count: number;
    resetAt: number;
}
const rateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const record = rateLimits.get(userId);

    if (!record || now > record.resetAt) {
        rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }

    record.count += 1;
    return true;
}

export async function handleSiriTokenApi(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: `Method not allowed: ${req.method}` }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const token = bearerFrom(req.headers.get("Authorization") ?? req.headers.get("authorization"));
    if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    let appUser = null;
    const { data: userById } = await supabase.from("app_users").select("*").eq("id", user.id).maybeSingle();
    if (userById) {
        appUser = userById;
    } else if (user.email) {
        const { data: userByEmail } = await supabase.from("app_users").select("*").ilike("email", escapeLikeValue(user.email)).maybeSingle();
        if (userByEmail) {
            appUser = userByEmail;
        }
    }

    if (!appUser) {
        return new Response(JSON.stringify({ error: "Forbidden: User not provisioned" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const isActive = appUser.active !== false && appUser.is_active !== false;
    if (!isActive) {
        return new Response(JSON.stringify({ error: "Forbidden: Account is inactive" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!checkRateLimit(user.id)) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "Bad Request: Invalid JSON" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const action = body?.action;
    // Two kinds of personal token share this table: siri_ (default) and mcp_.
    const kind: "siri" | "mcp" = body?.kind === "mcp" ? "mcp" : "siri";

    try {
        if (action === "create") {
            const { data: activeRows } = await supabase
                .from("siri_tokens")
                .select("token_prefix")
                .eq("user_id", user.id)
                .is("revoked_at", null)
                .gt("expires_at", new Date().toISOString());
            const count = (activeRows ?? []).filter((r: { token_prefix: unknown }) => tokenKindOfPrefix(r.token_prefix) === kind).length;

            if (count >= 5) {
                return new Response(JSON.stringify({ error: "Conflict: Maximum of 5 active tokens allowed" }), {
                    status: 409,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const tokenLabel = typeof body?.label === "string" && body.label.length >= 1 && body.label.length <= 40 ? body.label : (kind === "mcp" ? "Claude Code" : "iPhone");
            const { token: rawToken, prefix } = kind === "mcp" ? generateMcpToken() : generateSiriToken();
            const tokenHash = await hashSiriToken(rawToken);

            const { data, error } = await supabase
                .from("siri_tokens")
                .insert({
                    user_id: user.id,
                    app_user_id: appUser.id,
                    label: tokenLabel,
                    token_hash: tokenHash,
                    token_prefix: prefix,
                })
                .select("id, label, token_prefix, expires_at")
                .single();

            if (error) {
                return new Response(JSON.stringify({ error: "Internal error creating token" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({
                ok: true,
                token: rawToken,
                id: data.id,
                prefix: data.token_prefix,
                label: data.label,
                expires_at: data.expires_at,
            }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "list") {
            const { data, error } = await supabase
                .from("siri_tokens")
                .select("id, label, token_prefix, created_at, last_used_at, expires_at, revoked_at")
                .eq("user_id", user.id);

            if (error) {
                return new Response(JSON.stringify({ error: "Internal error listing tokens" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ ok: true, tokens: (data ?? []).filter((r: { token_prefix: unknown }) => tokenKindOfPrefix(r.token_prefix) === kind) }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action === "revoke") {
            const id = body?.id;
            if (!id) {
                return new Response(JSON.stringify({ error: "Bad Request: Missing token id" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // check ownership
            const { data: existing } = await supabase
                .from("siri_tokens")
                .select("user_id")
                .eq("id", id)
                .maybeSingle();

            if (!existing || existing.user_id !== user.id) {
                return new Response(JSON.stringify({ error: "Not Found: Token not found or access denied" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { error } = await supabase
                .from("siri_tokens")
                .update({ revoked_at: new Date().toISOString() })
                .eq("id", id);

            if (error) {
                return new Response(JSON.stringify({ error: "Internal error revoking token" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Bad Request: Invalid action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (_e) {
        return new Response(JSON.stringify({ error: "Internal processing error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
}

serve(handleSiriTokenApi);
