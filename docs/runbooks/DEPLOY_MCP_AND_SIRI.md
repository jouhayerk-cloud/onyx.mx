# Deploy the MCP data server and Siri (2026-10-11)

**Status 2026-10-11: phases 1 and 2 are DONE.** The siri_tokens migration is applied (10 columns, RLS on, one select policy, no grant on `token_hash`), and `siri-token`, `siri-inventory` and `onyx-mcp` are deployed (v1). The checks that need no login pass (health 200 with 33 tools, 401 without a token, 405 on GET, 401 for a made-up Siri token). Left: phase 3 (you run the smoke script with your login), phase 4 (flag set in deploy.yml) and phase 5 (the iPhone).

Project ref: `yircifkayqpuydfdqzlm`. Run every command from the repo root `C:\Jouhayerk\git\app` in PowerShell.
The Supabase CLI (2.120.0, installed with scoop) is already logged in on this PC, and `deno` 2.9.7 is installed.

## What is already done and checked (no action for you)
- Deno: 27 tests pass with type check (`siriToken.test.ts`, `helpers.test.ts`); `deno check` is clean for `siri-token`, `siri-inventory` and `onyx-mcp`.
- Live schema read (read only): the tables the MCP tools read exist (`inventory` 548 rows, `finance`, `logistics`, `shipments`, `onyxchan_devices`, `app_users` 8 rows); `siri_tokens` and `onyxchan_audit` do not exist yet.
- **Finding that changed the design:** in `app_users` the `id` is NOT the Supabase login id for any of the 8 users (they match by email only). A Siri token therefore remembers its `app_users` row (`app_user_id`), and `siri-inventory` reads the role from that row. The migration and both functions already contain this.
- Roles live today: Developer 1, Admin 1, ClientAccounting 1, ClientBoss 4, ClientViewer 1. Money through Siri and MCP follows `FINANCE_ROLES` (Developer, Admin, ClientBoss, ClientAccounting); ClientViewer gets the polite refusal. Two ClientBoss rows have no login yet, so they cannot create tokens.

## Phase 1: the migration (about 2 minutes)
1. Dry run (changes nothing, the transaction is rolled back):
   ```powershell
   (Get-Content supabase\migrations\20261011140000_siri_tokens.sql -Raw) -replace '(?im)^commit;','rollback;' | Set-Content $env:TEMP\siri_tokens_dryrun.sql
   supabase db query --linked --project-ref yircifkayqpuydfdqzlm -f $env:TEMP\siri_tokens_dryrun.sql
   ```
   Expected: no error. A foreign key error on `app_users` means the table or primary key differs from what was read today: stop and tell me.
2. Apply:
   ```powershell
   supabase db query --linked --project-ref yircifkayqpuydfdqzlm -f supabase\migrations\20261011140000_siri_tokens.sql
   ```
3. Verify (expected: 10 columns incl. `app_user_id`, RLS `true`, and no grant on `token_hash`):
   ```powershell
   supabase db query --linked --project-ref yircifkayqpuydfdqzlm "select column_name from information_schema.columns where table_schema='public' and table_name='siri_tokens' order by ordinal_position"
   supabase db query --linked --project-ref yircifkayqpuydfdqzlm "select relrowsecurity from pg_class where oid='public.siri_tokens'::regclass"
   supabase db query --linked --project-ref yircifkayqpuydfdqzlm "select grantee, privilege_type, column_name from information_schema.column_privileges where table_name='siri_tokens' and grantee in ('anon','authenticated') order by 1,3"
   ```
   Then in the Supabase dashboard open Advisors, Security: there must be no new warning for `siri_tokens`.
4. Rollback: `drop table public.siri_tokens;` (nothing else depends on it yet).

The audit table (`20261010120000_onyxchan_audit.sql`) is only needed when the MCP bridge flag is turned on. Leave it for later. `document_jobs` and `type_library` are separate app features: not part of this deploy.

## Phase 2: deploy the three functions (about 5 minutes)
Order matters: the token function first, then the one that reads the tokens, then the MCP server. `--use-api` bundles on Supabase's side, so Docker is not needed. The `verify_jwt` flags come from `supabase\config.toml`.
```powershell
supabase functions deploy siri-token     --project-ref yircifkayqpuydfdqzlm --use-api
supabase functions deploy siri-inventory --project-ref yircifkayqpuydfdqzlm --use-api
supabase functions deploy onyx-mcp       --project-ref yircifkayqpuydfdqzlm --use-api
supabase functions list --project-ref yircifkayqpuydfdqzlm
```
Expected in the list: `siri-token` ACTIVE verify_jwt true, `siri-inventory` ACTIVE verify_jwt false (it checks a JWT or a siri token itself), `onyx-mcp` ACTIVE verify_jwt true. No secrets are needed: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. Do NOT deploy `onyx-ai` (needs `GEMINI_API_KEY`) or `onyxchan-mcp` (needs `ONYXCHAN_ALLOWED_ORIGIN` and the gateway) in this step.

Rollback: `supabase functions delete siri-inventory --project-ref yircifkayqpuydfdqzlm` (same for the other two).

## Phase 3: smoke test (about 3 minutes)
1. In the Onyx app tab (logged in), open DevTools, Console, and run:
   `JSON.parse(localStorage.getItem('sb-yircifkayqpuydfdqzlm-auth-token')).access_token`
2. In PowerShell, in the same window as the next command (never paste the token into chat or a file):
   ```powershell
   $env:ONYX_TEST_JWT = "<paste the token>"
   .\scripts\golive\40-siri-mcp-smoke.ps1
   ```
3. Expected: every line PASS (about 14 checks). The script creates and revokes one test token labelled `smoke-test`. The line "money question answer" is for your eyes: as Developer or Admin it may include an amount; for ClientViewer it must be the refusal sentence.
4. If a line fails, send me the FAIL lines (never the token). Function logs: Supabase dashboard, Edge Functions, the function, Logs.

## Phase 4: show the Siri panel in the app (I do this on your word)
The Siri access panel in Settings is hidden until `VITE_SIRI_TOKENS` is `true`. After phase 3 passes, tell me "enable the Siri panel": I add `VITE_SIRI_TOKENS: 'true'` to `.github/workflows/deploy.yml`, push, and GitHub Pages deploys. Then: Settings, Siri access, type a label (for example `iPhone`), Create, copy the token (it is shown once).

## Phase 5: the Shortcut on your iPhone (about 15 minutes)
Follow `docs\siri\SHORTCUT_BUILD_GUIDE.md` step by step: a Text action named "Siri token" with your token, Get Contents of URL (POST, JSON body, `Authorization: Bearer <Siri token>`), Get Dictionary Value `spoken_text`, Speak Text. Name the Shortcut with the phrases from the guide ("Inventory search", "Buscar inventario"). Test by voice, then in Settings revoke the token, run the Shortcut again (it must fail with 401), and create a new one. Anything on the iPhone I could not verify is marked `VERIFY ON IPHONE` in the guide: tell me what you see.

## Phase 6: use the MCP server
`onyx-mcp` answers JSON-RPC over HTTPS with a Supabase user token (`tools/list`, `tools/call`). The Onyx agent inside the app can use it; connecting it to an outside AI client needs an OAuth bridge that does not exist yet, so that is a later wave (see `docs\mcp\TOOL_BACKLOG.md` for the next tools).

## Emergency stop
Revoke every Siri token: `supabase db query --linked --project-ref yircifkayqpuydfdqzlm "update public.siri_tokens set revoked_at = now() where revoked_at is null"`.
Turn Siri off: delete the function (phase 2 rollback). Nothing else in the app depends on these functions.

## Who does what
| Step | Who |
|---|---|
| Tests, type checks, schema reads, the fixes above | done by me |
| Phase 1, 2 (production changes) | you, or me on your explicit word in chat |
| Phase 3 | you (the token stays on your PC) |
| Phase 4 | me, on your word (GitHub) |
| Phase 5 | you (the iPhone) |
