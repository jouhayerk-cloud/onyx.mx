# Deploy the Onyx AI Edge Function (2026-10-10)

**Status 2026-10-10: Ready for deployment and smoke verification.**
The `onyx-ai` Edge Function provides a secure server-side proxy for Google Gemini models, protecting the Gemini API key from exposure in client-side bundles. Calls are restricted to authorized internal roles (`Developer`, `Admin`, `ClientBoss`).

Project ref: `yircifkayqpuydfdqzlm`.
Run all commands from the repository root `C:\Jouhayerk\git\app` in PowerShell.

---

## 1. What the Function Does and Permitted Roles

- **Purpose:** Receives chat/prompt requests from Onyx.mx, authenticates the caller via Supabase Auth JWT, authorizes the user role against `public.app_users`, validates models and token limits, and proxies the payload to Google Generative Language API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) using a private server-side key.
- **Allowed Roles (`ALLOWED_ROLES` in `index.ts:15`):**
  - `Developer`
  - `Admin`
  - `ClientBoss`
- **Denied Roles:**
  - `ClientAccounting` -> HTTP 403 (`Forbidden: role 'ClientAccounting' is not authorized`)
  - `ClientViewer` -> HTTP 403 (`Forbidden: role 'ClientViewer' is not authorized`)
  - Any unprovisioned or inactive account (`active = false` or `is_active = false`) -> HTTP 403.
- **Caller Matching:** Resolves user from JWT via `supabase.auth.getUser()`, then matches `app_users.id = user.id`. If not found, falls back to `app_users.email ilike user.email`.

---

## 2. Secrets Management

The function requires one upstream secret:
- **`GEMINI_API_KEY`**: Google Gemini API key from Google AI Studio.
*(Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by the Supabase platform).*

### Setting the Secret (Ramses in own PowerShell)
> [!IMPORTANT]
> Ramses must paste and execute this command directly in his own local PowerShell window. Never share or paste the API key in chat, logs, tickets, or git commits.

```powershell
supabase secrets set GEMINI_API_KEY=<PASTE_YOUR_GEMINI_KEY_HERE> --project-ref yircifkayqpuydfdqzlm
```

Verify the secret is stored (will show name, never value):
```powershell
supabase secrets list --project-ref yircifkayqpuydfdqzlm
```

---

## 3. Gateway Configuration (`verify_jwt`)

- **Status in `supabase/config.toml`:** UNVERIFIED in repository configuration. `[functions.onyx-ai]` is currently missing from `supabase/config.toml`.
- **Gateway Default:** According to `supabase/config.toml` (lines 8–9), any function omitted defaults to `verify_jwt = true`.
- **Code Enforcement:** The function also enforces application-level JWT verification in `index.ts:25-62` via `supabase.auth.getUser(token)` at line 34.
- **Recommended Configuration:** To preserve explicit configuration standards across functions, Ramses/Chief should add the following block to `supabase/config.toml`:
  ```toml
  [functions.onyx-ai]
  verify_jwt = true
  ```

---

## 4. Deploying the Function

Deploy using the remote bundle API (`--use-api` avoids local Docker dependency):

```powershell
supabase functions deploy onyx-ai --project-ref yircifkayqpuydfdqzlm --use-api
```

Verify deployment status:
```powershell
supabase functions list --project-ref yircifkayqpuydfdqzlm
```
Expected: `onyx-ai` status `ACTIVE`.

---

## 5. Rate Limits, Payload Bounds, and Cost Controls

Found in `index.ts`:
- **Payload Size Bound:** Max 200 KB (`buffer.byteLength > 200 * 1024` at `index.ts:78`). Exceeding returns HTTP 413 `Payload too large`.
- **Turn Bound:** Max 50 messages (`contents.length > 50` at `index.ts:106`). Exceeding returns HTTP 400 `Too many messages`.
- **Output Token Cap:** `maxOutputTokens` is clamped to a maximum of 8,192 (`MAX_OUTPUT_TOKENS = 8192` at `index.ts:118`), preventing unbounded generation costs.
- **Generation Controls:** Clamps `temperature` [0, 2], `topP` [0, 1], `topK` [1, 100], and `thinkingBudget` [-1, 8192] (`index.ts:119-142`).
- **Model Whitelist (`ALLOWED_MODELS` at `index.ts:16-23`):**
  - `gemini-3.8-flash`
  - `gemini-3.7-flash`
  - `gemini-3.6-flash`
  - `gemini-3.1-pro-preview`
  - `gemini-2.5-flash` (default if unspecified)
  - `gemini-2.5-pro`
  Any other model returns HTTP 400 `Model not allowed`.
- **Rate Limiting:** UNVERIFIED / None in code. There is no in-memory or database-backed per-user rate limiter in `index.ts`. Upstream Gemini API limits apply (will relay HTTP 429).
- **Cost / Token Auditing:** UNVERIFIED / None in code. The function does not record token metrics or cost into `onyxchan_audit` or database tables.

---

## 6. Failure Modes and Fixes

> [!NOTE]
> The 401 texts "Unauthorized: Missing token" and "Unauthorized: Invalid token" only appear when the request passes the gateway; onyx-ai is not listed in `supabase/config.toml` so `verify_jwt` defaults to true and the gateway rejects a missing or bad JWT first with its own body (the gateway rejects first while verify_jwt is true, so the body differs; Invalid token appears only for a gateway-valid JWT such as the anon key that getUser rejects).

| HTTP Status | Exact Error JSON Message | Root Cause | Remediation / Fix |
|---|---|---|---|
| `401` | `Unauthorized: Missing token` | No `Authorization: Bearer <token>` header supplied (the gateway rejects first while verify_jwt is true, so the body differs; Invalid token appears only for a gateway-valid JWT such as the anon key that getUser rejects) | Provide caller Supabase JWT in `Authorization` header |
| `401` | `Unauthorized: Invalid token` | JWT expired, invalid signature, or rejected by Supabase Auth (the gateway rejects first while verify_jwt is true, so the body differs; Invalid token appears only for a gateway-valid JWT such as the anon key that getUser rejects) | Refresh caller session in client / obtain fresh JWT |
| `403` | `Forbidden: User not provisioned` | Caller user ID and email not found in `app_users` | Provision user record in `app_users` |
| `403` | `Forbidden: Account inactive` | `app_users.active` or `app_users.is_active` is `false` | Set `active = true` and `is_active = true` in `app_users` |
| `403` | `Forbidden: role '<role>' is not authorized` | User role is not Developer, Admin, or ClientBoss | Elevate user role in `app_users` or enforce intended denial |
| `405` | `Method not allowed` | Non-POST HTTP method used (e.g. GET) | Send HTTP POST with JSON body |
| `413` | `Payload too large` | Request body exceeds 200 KB (204,800 bytes) | Reduce prompt context or message sizes below 200 KB |
| `400` | `Invalid JSON` | Request body is not well-formed JSON | Fix JSON formatting in client request |
| `400` | `Missing messages parameter` | JSON root lacks `messages` field | Provide `messages` array or object in request body |
| `400` | `Model not allowed` | `model` is not in `ALLOWED_MODELS` | Use an allowed Gemini model (default `gemini-2.5-flash`) |
| `400` | `Too many messages` | `contents` array exceeds 50 items | Prune message history to 50 or fewer entries |
| `500` | `Server configuration error` | `GEMINI_API_KEY` secret is not configured in Supabase | Set secret with `supabase secrets set GEMINI_API_KEY=...` |
| `500` | `Internal server error` | Unhandled runtime exception (network failure, etc.) | Inspect Edge Function logs in Supabase Dashboard |
| Upstream (e.g. `429`, `503`) | Upstream error message or `Upstream AI error` | Gemini API rate limit, quota exhaustion, or service outage | Check Google AI Studio quota / billing; implement retry backoff |

---

## 7. Smoke Testing

Run the smoke test script using an active user JWT from an authorized account:

1. Obtain token from browser console (logged in as Developer, Admin, or ClientBoss):
   ```javascript
   JSON.parse(localStorage.getItem('sb-yircifkayqpuydfdqzlm-auth-token')).access_token
   ```
2. Execute smoke test in PowerShell:
   ```powershell
   $env:ONYX_TEST_JWT = "<paste token>"
   .\scripts\golive\50-onyx-ai-smoke.ps1
   ```
3. Expected: Every test outputs `[PASS]`. Never share or commit the JWT.

---

## 8. Frontend Switch and Cleanup

1. After deployment and smoke test pass, Chief updates frontend config:
   Set `VITE_ONYX_AI_MODE=edge` in environment, then rebuild and redeploy the frontend, because `VITE_ONYX_AI_MODE` is read at build time (`src/features/onyx/OnyxChat.tsx:181` and `src/features/onyxAgent/useOnyxAgent.ts:126`).
2. Ensure production build does NOT include `VITE_GEMINI_API_KEY` in environment (prevents Vite from inlining secret key into static bundle).
3. Revoke legacy client-side Gemini API key in Google AI Studio once traffic routes through `onyx-ai`.

---

## 9. Rollback Plan

If `onyx-ai` fails or needs immediate decommissioning:
1. Revert frontend routing by unsetting or removing `VITE_ONYX_AI_MODE=edge`, then rebuild and redeploy the frontend, because VITE_ONYX_AI_MODE is read at build time (src/features/onyx/OnyxChat.tsx:181 and src/features/onyxAgent/useOnyxAgent.ts:126).
2. Delete the Edge Function:
   ```powershell
   supabase functions delete onyx-ai --project-ref yircifkayqpuydfdqzlm
   ```
3. Remove the secret from Supabase:
   ```powershell
   supabase secrets unset GEMINI_API_KEY --project-ref yircifkayqpuydfdqzlm
   ```

---

## 10. Who Does What

| Task | Responsible Party | Notes |
|---|---|---|
| Function code & smoke script creation | Pair developer / Antigravity | Local repository |
| Set `GEMINI_API_KEY` in Supabase | Ramses / Chief | Executed in Ramses's private PowerShell |
| Add explicit `[functions.onyx-ai]` in `config.toml` | Ramses / Chief | Repo maintenance |
| Deploy Edge Function (`supabase functions deploy`) | Ramses / Chief | Via Supabase CLI |
| Run smoke test script (`50-onyx-ai-smoke.ps1`) | Ramses / Chief | Uses private session JWT |
| Flip `VITE_ONYX_AI_MODE=edge` in frontend | Ramses / Chief | Deployment workflow (rebuild required) |
| Revoke legacy client Gemini API key | Ramses / Chief | Google AI Studio |

---

## 11. Findings (Defects Noted in `index.ts`)

Without modifying `index.ts`, the following potential defects and deviations were identified during code inspection:

1. **Top-level generationConfig and systemInstruction — Resolved by design (RK1)**
   - **Location:** `index.ts:90, 117, 122-125`
   - **Status:** Resolved by design (RK1). The function intentionally whitelists and clamps generation parameters (`index.ts:115-130`) rather than accepting unvalidated root objects.
   - **Code:**
     ```typescript
     const { messages, model } = body;
     ...
     const src: Record<string, any> = Array.isArray(messages) ? { contents: messages } : messages;
     for (const k of ["systemInstruction", "system_instruction", "tools", "toolConfig", "tool_config"]) {
       if (src[k] !== undefined) payload[k] = src[k];
     }
     const gcIn = (src.generationConfig ?? src.generation_config ?? {}) as Record<string, any>;
     ```

2. **Snake_case parameters passed verbatim to Gemini upstream [UNVERIFIED, low priority]**
   - **Location:** `index.ts:122-124`
   - **Code:**
     ```typescript
     for (const k of ["systemInstruction", "system_instruction", "tools", "toolConfig", "tool_config"]) {
       if (src[k] !== undefined) payload[k] = src[k];
     }
     ```
   - **Defect:** UNVERIFIED, low priority. The Google Gemini REST parser accepts both camelCase and snake_case spellings (e.g. `system_instruction` as well as `systemInstruction`). Normalizing to camelCase is good practice for consistency, but passing snake_case is not rejected by the API.

3. **Missing configuration entry in `supabase/config.toml`**
   - **Location:** `supabase/config.toml` (absent)
   - **Defect:** While Supabase defaults unlisted functions to `verify_jwt = true`, the project convention documented in `supabase/config.toml:8-9` specifies that all functions should declare explicit `verify_jwt` entries.

4. **Message count check skipped for non-array `contents`**
   - **Location:** `index.ts:105-108`
   - **Code:**
     ```typescript
     let contents = messages.contents || messages;
     if (Array.isArray(contents) && contents.length > 50) {
       return new Response(JSON.stringify({ error: { code: 400, message: "Too many messages" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
     }
     ```
   - **Defect:** If `messages` is an object with a non-array or single content item, `Array.isArray(contents)` evaluates to `false`, bypassing the message limit check entirely.
