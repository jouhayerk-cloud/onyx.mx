import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateSiriToken, hashSiriToken, isSiriToken, bearerFrom } from "./siriToken.ts";

Deno.test("generateSiriToken generates valid length and prefix", () => {
    const { token, prefix } = generateSiriToken();
    assertEquals(token.length, 48);
    assertEquals(prefix.length, 9);
    assertEquals(token.startsWith("siri_"), true);
    assertEquals(prefix, token.slice(0, 9));
});

Deno.test("generateSiriToken produces unique tokens", () => {
    const tokens = new Set();
    for (let i = 0; i < 50; i++) {
        tokens.add(generateSiriToken().token);
    }
    assertEquals(tokens.size, 50);
});

Deno.test("hashSiriToken produces stable 64-character hex hash", async () => {
    const token = "siri_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP";
    const hash1 = await hashSiriToken(token);
    const hash2 = await hashSiriToken(token);
    assertEquals(hash1, hash2);
    assertEquals(hash1.length, 64);
    assert(/^[0-9a-f]{64}$/.test(hash1));
});

Deno.test("hashSiriToken produces different hashes for different tokens", async () => {
    const hash1 = await hashSiriToken("siri_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP");
    const hash2 = await hashSiriToken("siri_bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPA");
    assert(hash1 !== hash2);
});

Deno.test("isSiriToken accepts generated tokens", () => {
    const { token } = generateSiriToken();
    assertEquals(isSiriToken(token), true);
});

Deno.test("isSiriToken rejects invalid strings", () => {
    assertEquals(isSiriToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"), false);
    assertEquals(isSiriToken(""), false);
    assertEquals(isSiriToken("siri_123"), false);
    assertEquals(isSiriToken("siri_!bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"), false);
});

Deno.test("bearerFrom extracts token from Authorization header", () => {
    assertEquals(bearerFrom("Bearer some-token-here"), "some-token-here");
    assertEquals(bearerFrom("bearer another-token"), "another-token");
    assertEquals(bearerFrom("Bearer    spaces  "), "spaces");
});

Deno.test("bearerFrom handles invalid headers gracefully", () => {
    assertEquals(bearerFrom(null), null);
    assertEquals(bearerFrom(""), null);
    assertEquals(bearerFrom("Basic auth-data"), null);
});
