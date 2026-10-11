# Onyx.mx Go-Live Runbook: MCP, Siri & Gateway

**Date:** 2026-10-10  
**Project:** Onyx.mx (Season 826)  
**Supabase Project Ref:** `yircifkayqpuydfdqzlm`  
**Target Environment:** Production (Windows 11 Execution by Ramses)  
**Status:** Partly live; see DEPLOY_MCP_AND_SIRI.md phase status

---

## (0) Tools and Logins

Before starting, ensure required CLI tools are installed and authenticated in Windows PowerShell 5.1:

1. **Supabase CLI**
   - Check version: `supabase --version`
   - Authenticate: `supabase login`
   - Link project (`VERIFY ON FIRST RUN`):
     ```powershell
     supabase link --project-ref yircifkayqpuydfdqzlm
     ```
2. **Google Cloud SDK (`gcloud`)**
   - Check version: `gcloud --version`
   - Authenticate: `gcloud auth login`
   - Set active project (`VERIFY ON FIRST RUN`):
     ```powershell
     gcloud config set project YOUR_PROJECT_ID
     ```
3. **Node.js & npm**
   - Check version: `node --version` (v18+ or v20+ recommended)
   - Check npm: `npm --version`
4. **curl.exe**
   - Windows built-in `curl.exe` (use `curl.exe`, not PowerShell alias `curl`/`Invoke-WebRequest`)

---

## (1) What is Live Today

Verified baseline as of 2026-10-10:
- **Supabase Project:** `yircifkayqpuydfdqzlm`
- **Live Edge Functions (5 live):**
  - `artifact` (v27, Public QR-tag lookup, unauthenticated endpoint, verify_jwt false)
  - `artifact-preview` (v2, Preview endpoint, verify_jwt true)
  - `siri-token` (v3, verify_jwt true)
  - `siri-inventory` (v4, verify_jwt false)
  - `onyx-mcp` (v5, verify_jwt false)
  *(onyxchan-mcp and onyx-ai are NOT deployed)*
- **Live Migrations:** Applied up to version `20261004173808` (`archive_v825_tables`).
- **Already live / applied (DO NOT RE-APPLY):**
  - `20260920_item_segmentation.sql` is already applied as version `20260921014132`.
  - `20260830234500_device_auth_per_device_tokens.sql` is already applied as version `20260831002448`.
  - `20261005120000_document_jobs.sql` is already applied.
  - `20261010120000_onyxchan_audit.sql` is already applied.
  - `20261011140000_siri_tokens.sql` is already applied.
  - `20261011150000_device_functions_null_role_guard.sql` is already applied.
  - `20261011160000_revoke_anon_new_tables.sql` is already applied.

---

## (2) Migrations in Order

### Execution Method
> **WARNING:** Do **NOT** run `supabase db push`. The local migration file naming convention differs from live version records; running `db push` risks applying duplicate migrations or failing on already-applied tables.  
> **Recommended Method:** Apply each file individually using the Supabase Dashboard SQL Editor (copy/paste into a new query window) OR via command line (`VERIFY ON FIRST RUN`):
> ```powershell
> # VERIFY ON FIRST RUN: single-file CLI execution against linked project
> supabase db query --file "supabase/migrations/<filename>.sql" --project-ref yircifkayqpuydfdqzlm
> ```
> Or copy to clipboard:
> ```powershell
> Get-Content -Raw "supabase\migrations\<filename>.sql" | Set-Clipboard
> ```

### Ordered Migration Plan
Plan = type_library only; list the applied migrations as record:
1. `20261011130000_type_library.sql`
   - **Purpose:** Centralized type library and schema definitions for modular tools and season 826 records.
   - **Type:** Additive.
   - **Status:** DRAFT (keep gated behind an explicit prompt).
   - **Risk:** Low (creates type definition catalogs).
   - **Rollback:** Drop type library tables and type registry entries.

*(Applied migrations on record — DO NOT RE-APPLY)*:
- `20261005120000_document_jobs.sql` (APPLIED)
- `20261010120000_onyxchan_audit.sql` (APPLIED — creates table `onyxchan_audit`. Rollback: drop table `onyxchan_audit`)
- `20261011140000_siri_tokens.sql` (APPLIED — creates table, index, RLS, grants, one select policy; no RPC. Rollback: drop table public.siri_tokens)
- `20261011150000_device_functions_null_role_guard.sql` (APPLIED)
- `20261011160000_revoke_anon_new_tables.sql` (APPLIED)

### Three Migrations Requiring Ramses' Decision (DO NOT APPLY YET)
1. `20260725_pico_bridge_schema.sql`
   - **Question for Ramses:** Is `pico_bridge` legacy architecture now superseded by the `onyxchan_gateway` and device tokens schema, or are legacy hardware devices still running pico-bridge firmware?
   - **Recommendation:** Do not apply if retiring legacy pico-bridge; verify if hardware still relies on pico channels.
2. `create_onyxchan_devices.sql`
   - **Question for Ramses:** The live database already has table `onyxchan_devices` (created previously and updated). Does this standalone script conflict with or duplicate existing live columns and constraints?
   - **Recommendation:** Do not apply; check the migration files before touching.
3. `PENDING_consolidate_inventory_and_server_side_cypher.sql`
   - **Question for Ramses:** Should server-side Cypher graph query consolidation be executed now, or kept pending until inventory schema stability for season 826 is verified?
   - **Recommendation:** Keep pending until Season 826 inventory data tools are validated.

---

## (3) Edge Functions in Deploy Order

Deploy the 5 new local functions in the following sequence.

### Secrets Configuration (`VERIFY ON FIRST RUN`)
Secrets must be configured in Supabase before deploying functions that depend on them:
- **Platform-provided automatically:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Application secrets to set:**
  ```powershell
  # VERIFY ON FIRST RUN: Set required secrets (use origin that serves the app; confirm before using onyx.mx, e.g. https://jouhayerk-cloud.github.io)
  supabase secrets set ONYXCHAN_ALLOWED_ORIGIN="https://jouhayerk-cloud.github.io" --project-ref yircifkayqpuydfdqzlm
  supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY" --project-ref yircifkayqpuydfdqzlm
  ```

### Deployment Sequence

| Order | Function Name | verify_jwt | Secrets Read | Purpose & Notes |
|:-----:|:--------------|:----------:|:-------------|:----------------|
| 1 | `onyx-mcp` | `false` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Data MCP server for web app & AI agents. Accepts JWT or mcp_ token. Enforces role checks in `app_users`. |
| 2 | `onyxchan-mcp` | `false` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ONYXCHAN_ALLOWED_ORIGIN` | Staff JWT + device tokens (`ocd_`). Custom app-level auth. |
| 3 | `onyx-ai` | `true` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` | AI assistance features via Gemini API. |
| 4 | `siri-token` | `true` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Generates & manages personal `siri_` tokens for authenticated staff. |
| 5 | `siri-inventory` | `false` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Read-only voice query adapter. verify_jwt is false in config.toml (accepts JWT or siri_ token). No change needed. |

Deploy commands (`VERIFY ON FIRST RUN`):
```powershell
supabase functions deploy onyx-mcp --no-verify-jwt --project-ref yircifkayqpuydfdqzlm
supabase functions deploy onyxchan-mcp --no-verify-jwt --project-ref yircifkayqpuydfdqzlm
supabase functions deploy onyx-ai --project-ref yircifkayqpuydfdqzlm
supabase functions deploy siri-token --project-ref yircifkayqpuydfdqzlm
supabase functions deploy siri-inventory --no-verify-jwt --project-ref yircifkayqpuydfdqzlm
```

---

## (4) Smoke Tests per Function

Run these tests from PowerShell using `curl.exe`. Set your test token in environment variable `$env:ONYX_TEST_JWT` (never in a file).

### Common Placeholders
- `PROJECT_URL`: `https://yircifkayqpuydfdqzlm.supabase.co`
- `ANON_KEY`: Your Supabase anon public key

### Tests

#### 1. Baseline Live Functions
```powershell
# artifact (public tag scan, expects 200 or 400 for missing tag)
curl.exe -i -X GET "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact"
# Expected status: 400 (Bad Request: missing tag param) or 200

# artifact-preview
curl.exe -i -X GET "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact-preview"
# Expected status: 400 or 200
```

#### 2. `onyx-mcp` (accepts JWT or mcp_ token)
```powershell
# Without JWT: expects 401
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-mcp" `
  -H "Content-Type: application/json"

# With GET method: expects 200 health JSON
curl.exe -i -X GET "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-mcp"

# With valid JWT: expects 200 OK (or JSON-RPC protocol error)
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-mcp" `
  -H "Authorization: Bearer $env:ONYX_TEST_JWT" `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

#### 3. `onyxchan-mcp` (verify_jwt false, internal auth)
```powershell
# Without credentials: expects 401
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyxchan-mcp" `
  -H "Content-Type: application/json"

# With valid Staff JWT: expects 200
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyxchan-mcp" `
  -H "Authorization: Bearer $env:ONYX_TEST_JWT" `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

#### 4. `onyx-ai` (Gemini API bridge)
```powershell
# Without JWT: expects 401
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-ai" `
  -H "Content-Type: application/json"

# With valid JWT: expects 200
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-ai" `
  -H "Authorization: Bearer $env:ONYX_TEST_JWT" `
  -H "Content-Type: application/json" `
  -d '{"messages":[{"role":"user","parts":[{"text":"Say OK"}]}],"model":"gemini-2.5-flash"}'
```

#### 5. `siri-token` (verify_jwt true)
```powershell
# Without JWT: expects 401
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-token" `
  -H "Content-Type: application/json"

# With valid JWT: expects 200 (returns list of active tokens)
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-token" `
  -H "Authorization: Bearer $env:ONYX_TEST_JWT" `
  -H "Content-Type: application/json" `
  -d '{"action":"list"}'
```

#### 6. `siri-inventory` (verify_jwt false, checks JWT or siri_ token)
```powershell
# Without any token: expects 401
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory" `
  -H "Content-Type: application/json"

# With valid JWT: expects 200
curl.exe -i -X POST "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory" `
  -H "Authorization: Bearer $env:ONYX_TEST_JWT" `
  -H "Content-Type: application/json" `
  -d '{"intent":"count","query":"","lang":"en"}'
```

---

## (5) The Gateway on Cloud Run

Summary of architecture from `C:\Jouhayerk\git\onyxchan-wt\GOLIVE-1\docs\_inputs\gateway-go-live.md` and `C:\Jouhayerk\git\onyxchan-wt\GOLIVE-1\docs\_inputs\supabase-draft-README.md`.

### Step 1: Database Migrations (Firmware Repo)
Apply firmware migrations in order via Supabase SQL Editor:
1. `0001_onyxchan_gateway.sql` (Alters devices/commands, adds assignments, events, token RPCs).
2. `0002_device_state_telemetry_runs.sql` (Device state, telemetry history, agent runs).
3. `0003_device_extra.sql` (Strict JSONB extra column validation).
4. `0001b_realtime_policies.sql` (Optional: private Realtime channels; skip if table ownership error occurs).

Verification Query:
```sql
select (select count(*) from information_schema.columns where table_name='onyxchan_devices' and column_name='checkin_interval_s') as device_cols,
       (select count(*) from information_schema.tables where table_schema='public' and (table_name like 'onyxchan%' or table_name like 'agent%')) as new_tables,
       (select count(*) from information_schema.columns where table_name='onyxchan_device_state' and column_name='extra') as extra_col;
```
Expected output: `1, 9, 1`.

### Step 2: Supabase Vault Session Key
Generate HMAC session key in SQL Editor (value stays in Vault):
```sql
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'onyxchan_session_' || 'hmac_key');
```

### Step 3: Edge Function `onyxchan-gateway-api`
- Deploy `C:\Jouhayerk\git\onyxchan-firmware\supabase-draft\functions\onyxchan-gateway-api\index.ts` with **Verify JWT OFF**.
- Add secret `GATEWAY_EDGE_SECRET` to Supabase Edge Functions Secrets.

### Step 4: Deploy Cloud Run Gateway
1. Enable GCP services:
   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com
   ```
2. Generate secrets in Secret Manager:
   - `gateway-edge-secret` (same value pasted to Supabase as `GATEWAY_EDGE_SECRET`)
   - `gateway-notify-secret`
   - `gemini-api-key` (optional, for voice)
3. Deploy container (`VERIFY ON FIRST RUN`):
   ```powershell
   cd C:\Jouhayerk\git\onyxchan-firmware
   gcloud run deploy onyxchan-gateway --source . --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 1 --timeout 3600 `
     --set-env-vars "GATEWAY_EDGE_URL=https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyxchan-gateway-api" `
     --set-secrets "GATEWAY_EDGE_SECRET=gateway-edge-secret:latest,NOTIFY_SECRET=gateway-notify-secret:latest"
   ```

### Step 5: Connect Database to Gateway (Vault)
In Supabase SQL Editor:
```sql
select vault.create_secret('PASTE_NOTIFY_SECRET_HERE', 'onyxchan_notify_secret');
select vault.create_secret('https://YOUR-SERVICE-URL.run.app', 'onyxchan_gateway_url');
```

### Step 6: Smoke Test
```powershell
# Expects 401 Unauthorized (confirms endpoint is active and rejecting unauthenticated calls)
curl.exe -i -X POST "https://YOUR-SERVICE-URL.run.app/v1/checkin"
```

---

## (6) Rollback per Step

1. **Migrations Rollback:**
   - Run the manual rollback blocks defined in each SQL migration.
   - For 826 migrations: drop created tables (`document_jobs`, `onyxchan_audit`, `type_library`, `siri_tokens`).
2. **Edge Functions Rollback:**
   - To remove a newly deployed function:
     ```powershell
     # VERIFY ON FIRST RUN
     supabase functions delete onyx-mcp --project-ref yircifkayqpuydfdqzlm
     supabase functions delete onyxchan-mcp --project-ref yircifkayqpuydfdqzlm
     supabase functions delete onyx-ai --project-ref yircifkayqpuydfdqzlm
     supabase functions delete siri-token --project-ref yircifkayqpuydfdqzlm
     supabase functions delete siri-inventory --project-ref yircifkayqpuydfdqzlm
     ```
   - Previous live functions (`artifact`, `artifact-preview`) remain untouched.
3. **Gateway Rollback:**
   - Delete Cloud Run service:
     ```powershell
     gcloud run services delete onyxchan-gateway --region us-central1
     ```
   - Remove edge function `onyxchan-gateway-api` from Supabase dashboard.

---

## (7) Go / No-Go Checklist

### Pre-Flight
- [ ] Working directory confirmed as `C:\Jouhayerk\git\app` (or `C:\Jouhayerk\git\onyxchan-wt\GOLIVE-1`)
- [ ] `supabase login` authenticated
- [ ] `gcloud auth login` authenticated
- [ ] Run `scripts/golive/00-check.ps1` with all green checks
- [ ] Verified live baseline (5 functions live: `artifact`, `artifact-preview`, `siri-token`, `siri-inventory`, `onyx-mcp`)

### Migrations
- [ ] Decision made for `20260725_pico_bridge_schema.sql` (Hold/Retire)
- [ ] Decision made for `create_onyxchan_devices.sql` (Skip/Verify)
- [ ] Decision made for `PENDING_consolidate_inventory_and_server_side_cypher.sql` (Hold)
- [x] Applied `20261005120000_document_jobs.sql`
- [x] Applied `20261010120000_onyxchan_audit.sql`
- [ ] Applied `20261011130000_type_library.sql`
- [x] Applied `20261011140000_siri_tokens.sql`

### Secrets & Functions
- [ ] Secrets set in Supabase (`ONYXCHAN_ALLOWED_ORIGIN`, `GEMINI_API_KEY`)
- [x] Deployed `onyx-mcp` (verify_jwt false; accepts JWT or mcp_)
- [ ] Deployed `onyxchan-mcp` (verify_jwt false)
- [ ] Deployed `onyx-ai`
- [x] Deployed `siri-token` (verify_jwt true)
- [x] Deployed `siri-inventory` (verify_jwt false)

### Gateway (Cloud Run)
- [ ] Firmware migrations 0001, 0002, 0003 applied and verified (`1, 9, 1`)
- [ ] Vault secrets populated (`onyxchan_session_hmac_key`, `onyxchan_notify_secret`, `onyxchan_gateway_url`)
- [ ] Edge function `onyxchan-gateway-api` deployed
- [ ] Cloud Run container deployed successfully
- [ ] Checkin endpoint returned HTTP 401

### Verification
- [ ] Run smoke scripts: `40-siri-mcp-smoke.ps1` for Siri/MCP, 50 onyx-ai, 60 onyxchan-mcp (or updated `30-smoke.ps1`) with `$env:ONYX_TEST_JWT` set
- [ ] All smoke tests passed

---

## (8) What to Paste Back into Chat

When reporting progress or errors in chat:
- **SAFE TO PASTE:**
  - Script console output showing check results, versions, and deployment status.
  - HTTP status codes (e.g., `401 Unauthorized`, `200 OK`, `405 Method Not Allowed`).
  - Database verification query results (e.g., `device_cols: 1, new_tables: 9, extra_col: 1`).
  - Error messages and stack traces (ensure they do not contain embedded connection strings or query params with keys).
- **NEVER PASTE:**
  - JWT tokens or bearer headers.
  - Supabase service role keys or anon keys.
  - Gemini API keys.
  - Gateway secrets (`GATEWAY_EDGE_SECRET`, `NOTIFY_SECRET`, Vault HMAC values).
  - Hardware device tokens (`ocd_...`) or Siri tokens (`siri_...`).
