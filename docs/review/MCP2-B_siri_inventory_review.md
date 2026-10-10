# Siri Inventory Function Review (MCP2-B)

## Findings Table

| Check | Severity | File:Line | Failing Scenario | Suggested Fix |
| :--- | :--- | :--- | :--- | :--- |
| (1) Money value exposure | none found | - | - | - |
| (2) Role derivation from JWT vs request | none found | - | - | - |
| (3) Rate limiter correctness | Medium | `siri-inventory/index.ts:50` | The in-memory `rateLimits` Map is isolated per Edge Function instance, allowing 30 requests per minute per active instance globally. | Replace the in-memory Map with a centralized store (e.g., a Supabase table or Redis) to enforce true global rate limits. |
| (4) Input validation & leakages | Medium | `siri-inventory/index.ts:331` | The `query` parameter lacks a maximum length constraint, allowing massive strings that could cause regex ReDoS or excessive TTS playback in responses. | Enforce a maximum character limit on the `query` input (e.g., `query.slice(0, 100)`). |
| (5) Logging of secrets/amounts | none found | - | - | - |
| (6) Caller resolution differences | none found | - | - | - |
| (7) CORS and `verify_jwt` settings | High | `siri-inventory/index.ts:5` | `verify_jwt = true` causes the Supabase API Gateway to block CORS preflight `OPTIONS` requests as they do not carry an `Authorization` header. | Set `verify_jwt = false` in `supabase/config.toml` since the code manually verifies the JWT token anyway. |
| (8) Unsafe/wrong spoken answers | Low | `siri-inventory/index.ts:594` | The `spokenText` template string hardcodes "Showing 5" (and "Mostrando 5"), which is inaccurate if `displayedItems.length` is less than 5 but `totalCount > 5`. | Replace the hardcoded `5` with `${displayedItems.length}` in the `spokenText` strings. |

## Severity Summary
- **High**: 1
- **Medium**: 2
- **Low**: 1

## Chief verdict (2026-10-10)
- High (verify_jwt and CORS preflight): not applicable. The function is called by Apple Shortcuts (native HTTP, no browser preflight), and `verify_jwt = true` is an extra safety layer. Keep it. Revisit only if a browser client is ever added.
- Medium (query length): fixed, `parseRequestPayload` caps the query at 120 characters.
- Medium (rate limiter per instance): accepted for the draft. The limit is per function instance, so the real ceiling is 30 per minute per instance; a table backed limiter is a later step if abuse appears.
- Low ("Showing 5" wording): fixed, the text uses the number of items actually listed.
