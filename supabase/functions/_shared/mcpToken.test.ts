import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allowRequest, generateMcpToken, isMcpToken, lookupMcpToken, tokenKindOfPrefix } from "./mcpToken.ts";
import { hashSiriToken } from "./siriToken.ts";

// A tiny stand-in for the Supabase client: every chain method returns the chain, maybeSingle answers per table.
function fakeClient(tokenRow: unknown, appUser: unknown) {
    const updates: unknown[] = [];
    const client = {
        updates,
        from(table: string) {
            const chain: any = {
                select() { return chain; },
                eq() { return chain; },
                is() { return chain; },
                gt() { return chain; },
                update(v: unknown) { updates.push(v); return chain; },
                maybeSingle: () => Promise.resolve({ data: table === "siri_tokens" ? tokenRow : appUser, error: null }),
                then(res: (v: unknown) => void) { res({ data: null, error: null }); },
            };
            return chain;
        },
    };
    return client;
}

Deno.test("generateMcpToken makes mcp_ plus 43 url-safe characters", () => {
    const { token, prefix } = generateMcpToken();
    assert(isMcpToken(token));
    assertEquals(token.length, 47);
    assertEquals(prefix, token.slice(0, 9));
    assert(prefix.startsWith("mcp_"));
});

Deno.test("isMcpToken rejects Siri tokens, short tokens and other text", () => {
    assertEquals(isMcpToken("siri_" + "A".repeat(43)), false);
    assertEquals(isMcpToken("mcp_" + "A".repeat(42)), false);
    assertEquals(isMcpToken("mcp_" + "A".repeat(44)), false);
    assertEquals(isMcpToken("mcp_" + "A".repeat(42) + "!"), false);
    assertEquals(isMcpToken(""), false);
    assertEquals(isMcpToken("mcp_" + "A".repeat(43)), true);
});

Deno.test("tokenKindOfPrefix reads the kind from the stored prefix", () => {
    assertEquals(tokenKindOfPrefix("mcp_AbCdE"), "mcp");
    assertEquals(tokenKindOfPrefix("siri_AbCd"), "siri");
    assertEquals(tokenKindOfPrefix(null), "siri");
});

Deno.test("lookupMcpToken accepts a live token and returns the owner", async () => {
    const token = "mcp_" + "B".repeat(43);
    const client = fakeClient({ id: "t1", app_user_id: "u1", token_prefix: "mcp_BBBBB", last_used_at: null }, { id: "u1", role: "Admin", is_active: true });
    const r = await lookupMcpToken(client, token);
    assert(r.ok);
    if (r.ok) {
        assertEquals(r.appUser.role, "Admin");
        assertEquals(r.tokenId, "t1");
    }
    assertEquals(client.updates.length, 1);
});

Deno.test("lookupMcpToken does not rewrite last_used_at within a minute", async () => {
    const token = "mcp_" + "C".repeat(43);
    const now = new Date("2026-10-10T12:00:30Z");
    const client = fakeClient({ id: "t1", app_user_id: "u1", token_prefix: "mcp_CCCCC", last_used_at: "2026-10-10T12:00:00Z" }, { id: "u1", role: "Admin" });
    const r = await lookupMcpToken(client, token, now);
    assert(r.ok);
    assertEquals(client.updates.length, 0);
});

Deno.test("lookupMcpToken refuses an unknown, revoked or expired token (no row)", async () => {
    const r = await lookupMcpToken(fakeClient(null, null), "mcp_" + "D".repeat(43));
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("lookupMcpToken refuses a siri_ token without touching the database", async () => {
    const client = fakeClient({ id: "t1", app_user_id: "u1", token_prefix: "siri_AAAA" }, { id: "u1", role: "Admin" });
    const r = await lookupMcpToken(client, "siri_" + "A".repeat(43));
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.status, 401);
    assertEquals(client.updates.length, 0);
});

Deno.test("lookupMcpToken refuses a stored row whose prefix is not mcp_", async () => {
    const client = fakeClient({ id: "t1", app_user_id: "u1", token_prefix: "siri_AAAA", last_used_at: null }, { id: "u1", role: "Admin" });
    const r = await lookupMcpToken(client, "mcp_" + "E".repeat(43));
    assertEquals(r.ok, false);
});

Deno.test("lookupMcpToken refuses an inactive or unprovisioned owner", async () => {
    const token = "mcp_" + "F".repeat(43);
    const row = { id: "t1", app_user_id: "u1", token_prefix: "mcp_FFFFF", last_used_at: null };
    const inactive = await lookupMcpToken(fakeClient(row, { id: "u1", role: "Admin", is_active: false }), token);
    assertEquals(inactive.ok, false);
    if (!inactive.ok) assertEquals(inactive.status, 403);
    const missing = await lookupMcpToken(fakeClient(row, null), token);
    assertEquals(missing.ok, false);
    if (!missing.ok) assertEquals(missing.status, 403);
});

Deno.test("the stored hash of a token is its SHA-256 hex", async () => {
    const h = await hashSiriToken("mcp_" + "G".repeat(43));
    assertEquals(h.length, 64);
});

Deno.test("allowRequest limits per key and window", () => {
    assertEquals(allowRequest("k1", 2, 1000, 0), true);
    assertEquals(allowRequest("k1", 2, 1000, 10), true);
    assertEquals(allowRequest("k1", 2, 1000, 20), false);
    assertEquals(allowRequest("k1", 2, 1000, 2000), true);
    assertEquals(allowRequest("k2", 2, 1000, 20), true);
});
