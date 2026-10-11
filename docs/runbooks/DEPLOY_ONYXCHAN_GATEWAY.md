# Deploy OnyxChan Gateway and Edge MCP (2026-10-10)

Status: **Review draft for the Chief.** Nothing in this document is deployed or applied. Production project ref: `yircifkayqpuydfdqzlm`.

---

## 1. Architecture (8 lines)

1. Robot Hardware: ESP32 devices (StackChan CoreS3 voice role, M5StickS3 staff-device role) operate on warehouse Wi-Fi.
2. Ingress & Transport: Devices dial out via HTTPS (`/v1/checkin`, `/v1/event`, `/v1/call`) and voice WSS (`/v1/session`) presenting bearer credentials.
3. Gateway Service: Cloud Run gateway (or LAN Node server on port 3001) terminates TLS and forwards calls to Supabase.
4. Edge Function: Supabase Edge Function `onyxchan-mcp` exposes tool execution (`/rpc`), heartbeats (`/heartbeat`), and SSE.
5. Authentication Gate: Edge Function verifies `ocd_` bearer tokens via `verify_device_token` RPC and validates staff JWTs against `app_users`.
6. Device Registry: Postgres table `onyxchan_devices` tracks devices, telemetry (`battery_level`, `rssi`), and SHA-256 token digests.
7. Command Pipeline: Postgres table `onyxchan_commands` buffers commands with leases and delivery tracking for sleeping devices [UNVERIFIED].
8. Core Data: PostgREST tables (`inventory`, `finance`, `app_users`) provide warehouse catalog, financial data, and staff permissions.

---

## 2. Secrets and Settings (by Name Only)

Set all configuration via the Supabase CLI. Never commit secret values or print raw credentials.

### Edge Function Configuration

| Setting Name | Purpose | CLI Command |
|---|---|---|
| `ONYXCHAN_ALLOWED_ORIGIN` | Allowed origin for CORS headers on `onyxchan-mcp` (defaults to `https://jouhayerk-cloud.github.io`). | `supabase secrets set ONYXCHAN_ALLOWED_ORIGIN="https://jouhayerk-cloud.github.io" --project-ref yircifkayqpuydfdqzlm` |
| `SUPABASE_URL` | Supabase API URL. Automatically injected by the platform runtime; do not set manually. | Platform-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role API key for administrative database access. Automatically injected; do not set manually. | Platform-injected |

### Gateway Infrastructure Secrets [UNVERIFIED]

| Secret Name | Purpose | Location |
|---|---|---|
| `GATEWAY_EDGE_SECRET` | Header secret passed from Cloud Run gateway to edge function RPC endpoints. [UNVERIFIED] | GCP Secret Manager |
| `NOTIFY_SECRET` | Header secret used by database `pg_net` trigger to POST `/v1/notify` to Cloud Run gateway. [UNVERIFIED] | Supabase Vault |

---

## 3. Device Token Issuance and Revocation

Device tokens are 32-byte cryptographically secure random tokens prefixed with `ocd_` (`ocd_` + 64 hex characters).
Only users with the `Admin` or `Developer` application role can issue or revoke tokens (for API callers; the SQL editor and the CLI run as postgres, which the guard allows explicitly; the guard was hardened on 2026-10-11 so a signed-in user with no app role is refused).
The raw token is displayed **exactly once** upon generation and is never stored in plaintext (only its SHA-256 digest is saved).

### Prerequisites

A device record must exist in `public.onyxchan_devices` before issuing a token:

```sql
INSERT INTO public.onyxchan_devices (device_id, assigned_user_email, device_name)
VALUES ('PLACEHOLDER_DEVICE_ID', 'admin@example.com', 'Warehouse Scanner 01');
```

### Issuing a Token

- **SQL Editor Form:**
  ```sql
  SELECT public.issue_device_token('PLACEHOLDER_DEVICE_ID');
  ```

- **Supabase CLI Form:**
  ```powershell
  supabase db query --linked --project-ref yircifkayqpuydfdqzlm "SELECT public.issue_device_token('PLACEHOLDER_DEVICE_ID');"
  ```

Copy the returned `ocd_...` token immediately. It cannot be recovered from the database afterwards.

### Revoking a Token

Revoking clears the `token_hash`, sets `token_revoked_at = now()`, and marks device status as `offline`.

- **SQL Editor Form:**
  ```sql
  SELECT public.revoke_device_token('PLACEHOLDER_DEVICE_ID');
  ```

- **Supabase CLI Form:**
  ```powershell
  supabase db query --linked --project-ref yircifkayqpuydfdqzlm "SELECT public.revoke_device_token('PLACEHOLDER_DEVICE_ID');"
  ```

---

## 4. Firmware Setup Form Storage

During hardware provisioning, device Wi-Fi AP setup captures connection parameters and persists them to ESP32 Non-Volatile Storage (NVS):

- **NVS Namespace:** `onyx`
- **NVS Key `url`:** Base service URL for the edge function or Cloud Run gateway endpoint (e.g., `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyxchan-mcp`).
- **NVS Key `token`:** Raw hardware device token (`ocd_...`).

---

## 5. Deployment

Deploy the `onyxchan-mcp` Edge Function using the Supabase CLI with `--use-api` (remote bundle build, no local Docker required):

```powershell
supabase functions deploy onyxchan-mcp --project-ref yircifkayqpuydfdqzlm --use-api
```

### Gateway JWT Verification Setting

In `supabase/config.toml`, `[functions.onyxchan-mcp]` must have:

```toml
[functions.onyxchan-mcp]
verify_jwt = false
```

**Rationale:** Hardware devices authenticate using per-device bearer tokens (`ocd_...`) rather than Supabase user JWTs. Enabling platform-level `verify_jwt = true` causes Supabase's API gateway to reject all device requests with HTTP 401 before reaching the function code. Authentication is strictly enforced inside the function (`index.ts:42-65`).

---

## 6. Bench Handshake Checklist (Firmware Side)

> [!WARNING]
> **UNVERIFIED — MCP Server Not Connected:**
> `onyxchan-mcp/index.ts` calls `server.request(...)` at lines 442, 455, and 469 on an MCP SDK `Server` instance that is never `.connect()`ed. The expectation is "Not connected" and a 400 `{"error":"Not connected"}` for every `/rpc` tool call, which would break Step 3b and the smoke checks that call tools. Test one `/rpc` call first and see the `OnyxMX-OnyxChanMCP` skill (the MCP layer has never executed); the fix direction is to call the tool handler directly.

Use this checklist on the hardware bench to verify firmware authentication against `onyxchan-mcp`:

| Step / Scenario | Target Endpoint & Headers | Request Payload | Expected HTTP Code | Expected Response Body |
|---|---|---|---|---|
| **1. No Token** | `POST /heartbeat`<br>No `Authorization` header | `{}` | `401 Unauthorized` | `{"error":"Missing bearer token"}` |
| **2. Wrong Token** | `POST /heartbeat`<br>`Authorization: Bearer ocd_0000000000000000000000000000000000000000000000000000000000000000` | `{"battery":80,"rssi":-60}` | `401 Unauthorized` | `{"error":"Invalid or revoked device token"}` |
| **3. Good Token** | `POST /heartbeat`<br>`Authorization: Bearer <valid_ocd_token>` | `{"battery":85,"rssi":-55}` | `200 OK` | `{"status":"ok","device_id":"PLACEHOLDER_DEVICE_ID"}` |
| **3b. Tool Call** | `POST /rpc`<br>`Authorization: Bearer <valid_ocd_token>` | `{"tool":"resolve_tag","args":{"tag":"test-tag"}}` | `200 OK` | `{"content":[{"type":"text","text":"{\"found\":false,\"tag\":\"test-tag\"}"}]}` |
| **4. Revoked Token** | `POST /heartbeat`<br>`Authorization: Bearer <revoked_ocd_token>` | `{"battery":85,"rssi":-55}` | `401 Unauthorized` | `{"error":"Invalid or revoked device token"}` |
| **5. Device Offline** | Network unreachable / DNS failure | Any | Client TCP error / timeout | Firmware queues telemetry in local offline buffer; if gateway is reachable but Supabase is down, gateway returns HTTP `502`/`503` `upstream_unavailable` [UNVERIFIED]. |

---

## 7. Rollback Procedures

### Roll Back Edge Function Deployment

```powershell
supabase functions delete onyxchan-mcp --project-ref yircifkayqpuydfdqzlm
```

### Roll Back Database Token Functions

If database functions must be reverted:

```powershell
supabase db query --linked --project-ref yircifkayqpuydfdqzlm "DROP FUNCTION IF EXISTS public.record_device_heartbeat(TEXT, INT, INT); DROP FUNCTION IF EXISTS public.verify_device_token(TEXT); DROP FUNCTION IF EXISTS public.revoke_device_token(TEXT); DROP FUNCTION IF EXISTS public.issue_device_token(TEXT);"
```

### Emergency Fleet Shutdown (Revoke All Devices)

To immediately disconnect all active devices:

```powershell
supabase db query --linked --project-ref yircifkayqpuydfdqzlm "UPDATE public.onyxchan_devices SET token_hash = NULL, token_revoked_at = now(), status = 'offline' WHERE token_revoked_at IS NULL;"
```

---

## 8. Who Does What

| Task / Step | Responsible Role | Details |
|---|---|---|
| Review Architecture & Code | The Chief | Approves runbook, review findings, and migration application. |
| Database Migration (`20260830234500_...sql`) | Lead DB / Chief | Already applied (as 20260831002448); do not re-apply. |
| Edge Function Secrets Configuration | Deployer / Chief | Configures `ONYXCHAN_ALLOWED_ORIGIN` in Supabase Secrets. |
| Edge Function Deployment | Deployer | Runs `supabase functions deploy onyxchan-mcp --use-api`. |
| Device Provisioning & Token Generation | Admin / Developer | Creates device record and runs `issue_device_token`. |
| Hardware Flashing & NVS Provisioning | Firmware Engineer | Flashes firmware and inputs `url` and `token` into NVS. |
| Bench Handshake & Smoke Test Execution | Hardware QA Engineer | Executes `60-onyxchan-mcp-smoke.ps1` and validates HTTP responses. |
| Emergency Revocation & Fleet Rollback | Admin / Chief | Executes SQL emergency revocation or deletes function. |

---

## 9. Findings: Defects & Risky Behaviour

Code inspection of `supabase/functions/onyxchan-mcp/index.ts` and `supabase/functions/_shared/onyxchanTools.ts` revealed the following defects and risky behaviours:

1. **Unauthenticated SSE Connection (`index.ts` lines 421-431):**
   ```ts
   // 1. SSE Connection for MCP
   if (url.pathname.endsWith("/sse") && req.method === "GET") {
     const body = new TransformStream();
     return new Response(body.readable, {
   ```
   *Risk:* Authentication gate `authenticate(req)` is only invoked for `POST` requests (line 405). Any unauthenticated client can open and hold an SSE connection without a token.

2. **Root POST Routing Omission (`index.ts` lines 434, 498, 525):**
   ```ts
   if ((url.pathname.endsWith("/rpc") || url.pathname.endsWith("/messages") || url.pathname.endsWith("/execute")) && req.method === "POST") {
   ```
   *Risk:* Standard JSON-RPC callers POSTing directly to the function root `/onyxchan-mcp` pass authentication but miss all tool execution blocks and fall through to line 525, returning HTTP 200 with text `"OnyxChan MCP Edge Function v2.5 Active"`. Calls must explicitly append `/rpc`.

3. **Hardware Commands Broadcast to Realtime Instead of Database Queue (`index.ts` lines 90-98):**
   ```ts
   async function broadcastDeviceCommand(deviceId: string, command: Record<string, any>) {
     const channelName = `device_control:${deviceId}`;
     const channel = supabase.channel(channelName);
     await channel.send({
       type: "broadcast",
       event: "DEVICE_COMMAND",
       payload: command,
     });
   }
   ```
   *Risk:* ESP32 firmware has no Supabase Realtime client (`ONYXCHAN_MCP_SKILL.md` §3). Furthermore, `supabase.channel()` is sent without waiting for `.subscribe()`. Protocol requires queueing into table `onyxchan_commands`.

4. **Legacy Command Action Names Dropped by Firmware (`index.ts` lines 188, 221):**
   Line 188: `action: "tts",` (Protocol specifies `speak`; legacy `tts` is deprecated).
   Line 221: `action: "inventory-display",` (Protocol specifies `item-card`; firmware silently drops `inventory-display` per `ONYXCHAN_MCP_SKILL.md` line 30).

5. **Tool Schema Discrepancies in Manifest (`onyxchanTools.ts` lines 54, 72):**
   Line 54: `vendor-display` is included as an avatar expression in `set_expression`:
   `enum: ["calm", "happy", "thinking", "sleepy", "shy", "smug", "pouty", "alert", "error", "speaking", "listening", "vendor-display"]` (`vendor-display` is a card command, not a face expression; `FW_PROTOCOL.md` line 284).
   Line 72: `ja` is included in `speak` language enum (`["es", "en", "ja"]`), but Japanese was dropped in protocol v1 (`FW_PROTOCOL.md` line 285).

6. **Unredacted Inventory and Finance Queries on Service Role (`index.ts` lines 271, 301, 315-317):**
   Line 271: `let query = supabase.from("inventory").select("*").limit(Number(args?.limit) || 20);`
   Line 301: `.from("inventory").select("*").eq("id", String(args?.item_id)).single();`
   Lines 315-317: `.from("finance").select("*").eq("vendor_id", String(args?.vendor_id));`
   *Risk:* The function runs on `SUPABASE_SERVICE_ROLE_KEY` and selects all columns (`*`), bypassing RLS. Any staff user calling `query_inventory` or `query_payment_status` receives confidential acquisition and landed cost fields without role redaction or `FINANCE_ROLES` checks.

7. **Simulated Telemetry Fallbacks Mask Unreported State (`index.ts` lines 245-246):**
   ```ts
   battery: dev?.battery_level ?? 92,
   rssi: dev?.rssi ?? -48,
   ```
   *Risk:* Missing hardware telemetry is masked by hardcoded mock values (92% battery, -48 dBm RSSI) rather than indicating null/missing data.

8. **MCP SDK Server Not Connected on /rpc Invocations [UNVERIFIED] (`index.ts` lines 442, 455, 469):**
   ```ts
   const handlerRes = await server.request(
     { method: "tools/call", params: { name: body.tool, arguments: body.args || {} } },
     CallToolRequestSchema
   );
   ```
   *Risk:* `onyxchan-mcp/index.ts` calls `server.request(...)` at lines 442, 455 and 469 on an MCP SDK `Server` instance that is initialized at line 140 but is never `.connect()`ed to a transport. In `@modelcontextprotocol/sdk`, invoking `server.request(...)` without an active connection throws `"Not connected"`, which is caught at line 484 and returned as HTTP 400 `{"error":"Not connected"}`. This breaks direct `/rpc` tool calls (`body.tool` at line 442), JSON-RPC `tools/list` (line 455), and `tools/call` (line 469). Step 3b and any smoke checks calling tools will fail. The MCP layer has never executed in production because client calls previously fell back silently to Realtime broadcast (`OnyxMX-OnyxChanMCP` skill §5). Fix direction: invoke the tool execution handler directly rather than dispatching through `server.request()`.
