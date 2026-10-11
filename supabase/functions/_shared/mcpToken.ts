import { encodeBase64Url, hashSiriToken } from "./siriToken.ts";

// Personal MCP tokens share the siri_tokens table with the Siri tokens. The kind is the token prefix:
// siri_ tokens work only on siri-inventory, mcp_ tokens work only on onyx-mcp.

export type PersonalTokenKind = "siri" | "mcp";

export function generateMcpToken(): { token: string; prefix: string } {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const token = `mcp_${encodeBase64Url(randomBytes)}`;
    return { token, prefix: token.slice(0, 9) };
}

export function isMcpToken(value: string): boolean {
    return /^mcp_[a-zA-Z0-9_-]{43}$/.test(value);
}

/** The kind of a stored token, from its stored prefix (siri_xxxx or mcp_xxxxx). */
export function tokenKindOfPrefix(prefix: unknown): PersonalTokenKind {
    return typeof prefix === "string" && prefix.startsWith("mcp_") ? "mcp" : "siri";
}

export type McpTokenLookup =
    | { ok: true; appUser: Record<string, any>; tokenId: string }
    | { ok: false; status: number; error: string };

/**
 * Resolves a presented mcp_ token to the app_users row of its owner.
 * Rejects (401) a malformed, unknown, revoked or expired token and (403) an unprovisioned or inactive owner.
 * `supabase` is a service role client. last_used_at is refreshed at most once a minute.
 */
export async function lookupMcpToken(supabase: any, rawToken: string, now: Date = new Date()): Promise<McpTokenLookup> {
    const denied: McpTokenLookup = { ok: false, status: 401, error: "Unauthorized: Invalid or expired token" };
    if (!isMcpToken(rawToken)) return denied;

    const hash = await hashSiriToken(rawToken);
    const nowIso = now.toISOString();
    const { data: row } = await supabase
        .from("siri_tokens")
        .select("id, app_user_id, token_prefix, last_used_at")
        .eq("token_hash", hash)
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .maybeSingle();
    if (!row || tokenKindOfPrefix(row.token_prefix) !== "mcp") return denied;

    const { data: appUser } = await supabase.from("app_users").select("*").eq("id", row.app_user_id).maybeSingle();
    if (!appUser) return { ok: false, status: 403, error: "Forbidden: User not provisioned in app_users" };
    if (appUser.active === false || appUser.is_active === false) {
        return { ok: false, status: 403, error: "Forbidden: Account is inactive" };
    }

    const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0;
    if (!lastUsed || now.getTime() - lastUsed > 60_000) {
        void Promise.resolve(supabase.from("siri_tokens").update({ last_used_at: nowIso }).eq("id", row.id)).catch(() => {});
    }
    return { ok: true, appUser, tokenId: String(row.id) };
}

// Small in-memory limiter (per function instance, so a soft limit only).
const windows = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, max: number, windowMs: number, nowMs: number = Date.now()): boolean {
    const w = windows.get(key);
    if (!w || nowMs > w.resetAt) {
        windows.set(key, { count: 1, resetAt: nowMs + windowMs });
        return true;
    }
    if (w.count >= max) return false;
    w.count += 1;
    return true;
}
