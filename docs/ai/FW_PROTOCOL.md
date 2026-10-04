# OnyxChan protocol v1

Status: **draft 1.1.0**, task P1-01 plus CA-1 (section 14 Chief decisions applied), written against `PLAN_OnyxChan_Firmware.md` v2.1 (2026-10-03). Owner: the Chief.

The machine-readable source is `contract/` (JSON Schema draft 2020-12 plus `contract/roles.json`). This document explains it. When they disagree, `contract/` wins and this file is fixed. Anything the plan does not decide is listed under [Open questions](#open-questions) instead of being invented here; names the contract needed that the Chief accepted are no longer marked **(derived)**; the rest stay in that list.

## 1. Scope and versioning

Covers every message between a device (StackChan CoreS3 = role `voice`, M5StickS3 = role `staff-device`) and the Cloud Run gateway, the gateway's leg to Supabase, the `/v1/notify` push, and the tool-by-role table that `onyx-mcp` enforces for every caller (`voice`, `staff-device`, `staff`, `agent`, `gateway`).

Not covered: the Gemini Live leg (gateway internal), the app's UI, the agent MCP Streamable HTTP transport itself (standard MCP).

Versioning:
- `/v1` in every path is the protocol major version.
- Additive optional fields stay in v1. Removing or renaming a field, changing a type, adding a required field, or changing a command's meaning needs `/v2`; the gateway then serves both until every device has taken an OTA.
- Devices report `fw_version` in `hello` and in every check-in, so the gateway can tell which contract a device speaks.
- `contract/roles.json` carries its own `version`.

## 2. Transport

All traffic is TLS to the Cloud Run gateway. Devices validate the server certificate (CA bundle or pinned root); CI forbids `setInsecure`.

| Endpoint | Who calls | Body (request -> response) | Used by |
|----------|-----------|----------------------------|---------|
| `POST /v1/checkin` | device | `checkin.request` -> `checkin.response` | both device roles, always |
| `POST /v1/event` | device | `event` -> 200 (body: `{"ok": true}`) | both device roles; also carries command acks (event type `ack`) and every scan |
| `POST /v1/call` | device | `call.request` -> `call.response` | both device roles (`resolve_tag`, other tools) |
| `POST /v1/notify` | Supabase `pg_net` trigger | `notify` -> 202, header `X-Notify-Secret` | gateway only |
| `wss /v1/session` | device | `hello`, then `mcp` envelopes; binary audio / JPEG ([section 7](#7-binary-frames-audio-and-jpeg)) | `voice` only |

- Staff devices use stateless HTTPS only. A socket held for a whole shift would be billed as instance time.
- Errors: non-2xx HTTP responses carry `error.schema.json#/$defs/http_error_body`; on the socket the gateway sends `error.schema.json#/$defs/error_frame` and closes.
- Cloud Run: request-based billing, min instances 0, `--max-instances=1`, timeout 3600 s, no session affinity, region `us-central1` (subject to Ramses' project choice). Cloud Run must allow unauthenticated invocation, so the gateway's own auth is the first line of defence.
- Frame size and rate are capped per connection; over the cap the gateway answers `frame_too_large` / `rate_limited` and closes. The numbers are an open question.

## 3. Authentication

| Leg | Credential | Notes |
|-----|-----------|-------|
| device -> gateway (HTTPS) | `Authorization: Bearer ocd_...` | The device's own token. Hash at rest; plaintext shown once at provisioning, entered through the setup AP, stored in NVS. |
| device -> gateway (wss) | `Authorization: Bearer ocd_...` on the HTTP upgrade | **Never in the URL** (Cloud Run logs URLs). |
| gateway -> edge function | `GATEWAY_EDGE_SECRET` (Secret Manager) in a header **plus** the device's own `ocd_` token (or the per-session token minted by `verify_device_token`, below) | One small edge function (`onyx-mcp` or `onyxchan-gateway-api`) calls the RPCs server-side. The gateway never calls Postgres and never holds the service-role key. |
| Supabase `pg_net` -> gateway `/v1/notify` | `NOTIFY_SECRET` (Supabase Vault) in the `X-Notify-Secret` header | Not a device token, and never the same value as `GATEWAY_EDGE_SECRET`. |
| app -> `onyx-mcp` | staff JWT (signed-in user) | |
| agent -> `onyx-mcp` | personal access token (`agent_tokens`) | Hashed, scoped, revocable, read-only by default. |

Rules:
1. **5 s auth timeout.** A wss connection must pass the upgrade's token check and send a valid `hello` within 5 s, or the gateway closes it (`auth_timeout`). Unauthenticated sockets never get a second chance on the same connection.
2. **RPCs derive `device_id` from the token**, never from a parameter: `verify_device_token`, `claim_commands`, `ack_command(id, result)`, `record_device_heartbeat`, `record_device_event`. A leaked gateway secret or a gateway bug cannot read or ack another device's commands. EXECUTE on these RPCs is revoked from `anon` and `authenticated`.
3. `onyx-mcp` evaluates every forwarded tool call under the role of the forwarded device token (`voice` or `staff-device`), never under a broad gateway identity.
4. `hello.device_id` and `hello.role` are declarative. A mismatch with the token's identity closes the session with `identity_mismatch`.
5. Revoked (`revoked_at`) or expired (`expires_at`) tokens get `401` with `token_revoked` / `token_expired`; on revoke, the gateway drops any live session of that device.
6. Lost device runbook: revoke the token, rotate the IoT Wi-Fi password.
7. **Two separate secrets**: `GATEWAY_EDGE_SECRET` (gateway to edge function) and `NOTIFY_SECRET` (`pg_net` trigger to `/v1/notify`). Never the same value; a leak of one does not authenticate the other leg. Neither secret grants a tool or device data.
8. **Per-session token**: minted by `verify_device_token`, HMAC-signed, valid 10 minutes, bound to `device_id`. The gateway uses it in place of the long-lived `ocd_` token for forwarded calls during a session and mints a new one before it expires. Its claim layout and the signing-key location are not specified here (open question 10b).

## 4. Check-in cycle and sleeping devices

`POST /v1/checkin` (`checkin.request` -> `checkin.response`):

1. The device sends `fw_version`, optional `hardware`, `power`, `state` (telemetry snapshot), `ota_result` once after an update, and `acks` for every command it executed since the last confirmed check-in.
2. The gateway records the heartbeat (`record_device_heartbeat`, sets `last_checkin_at`), records the acks (`ack_command`), claims queued commands for this device (`claim_commands`, `FOR UPDATE SKIP LOCKED`, lease `2 x checkin_interval_s + 15 s`, 60 s minimum), and answers with:
   - `checkin_interval_s`: about 30 on mains, 60-120 on battery;
   - `commands`: the claimed commands (now `status = claimed`);
   - `acked`: command ids whose acks were recorded (the device keeps an ack until it sees its id here);
   - `ota` when an update is offered: `{version, url, sha256, signature}`, `url` a short-lived signed GCS URL.
3. The device executes the commands (deduping by `id`) and acks them in the next check-in, or earlier as an event of type `ack` over `/v1/event`. A command id it already executed is re-acked (`duplicate: true`) and not run again.

Sleeping-device rules:
- "Online" in the app = age of `last_checkin_at`.
- A command for a sleeping device waits until its next check-in, or until its session opens. Worst case about one interval (about 30 s on mains). This is Ramses' accepted trade-off.
- Default `expires_at` is at least `3 x checkin_interval_s` of the target device (it must be longer than the maximum lease of 2 x checkin_interval_s + 15 s), so a command is not dropped before the device can claim it. The lease is longer than the check-in interval, so a battery device that acks on its next check-in does not see its command re-queued.
- The device keeps an offline queue of events and acks while the link is down and replays them on reconnect; `event_id` and command `id` make replays idempotent.
- The device must never hold a GitHub token: OTA binaries come from GCS. It verifies `sha256` and `signature` before switching OTA slots and rolls back on a failed boot.

## 5. Session lifecycle (voice only)

1. **Open** on a voice interaction (tap, proximity, button) and while a card is shown. `wss /v1/session` with `Authorization: Bearer ocd_...`.
2. **hello** (`hello.schema.json`): `{type:"hello", device_id, role, hardware, fw_version, capabilities, tools}` within 5 s.
3. The gateway calls `verify_device_token`, sets the device's `session_open_until` (now + about 60 s), and keeps one session per device. It may then send `tools/list` in an `mcp` envelope.
4. **Traffic:** text frames are `{type:"mcp", payload: <JSON-RPC 2.0>}` (`mcp.envelope.schema.json`) and `{type:"audio.interrupted"}` (sent by the gateway to stop the device from playing the current turn's audio). Binary frames are audio and JPEG (section 7). Ping/pong every 30 s and TCP keepalive; each ping refreshes `session_open_until`.
5. **Commands in a session:** a new `onyxchan_commands` row fires the `pg_net` trigger, which POSTs `notify {device_id, command_id}` to `/v1/notify` (header `X-Notify-Secret`) only while `session_open_until` is in the future. `session_open_until` is a lease, not a flag: a dead instance, the 3600 s timeout or a scale to zero clears it by lapsing. With `--max-instances=1` the POST reaches the instance that holds the socket. The gateway claims with the device's own token and sends each command as `tools/call` with `id = command.id`, `params.name = command.name`, `params.arguments = command.args`. The device's JSON-RPC response is the ack. The lease for a command sent into an open session is 60 s.
   - `speak` is synthesized by the gateway (Gemini voice) and needs a session. Sent to a device without a session it is queued and runs on wake only if not expired; otherwise the caller gets `expired`.
   - Scans do not use the session: they always go over `/v1/event` + `/v1/call`, in or out of a session.
6. **Gemini Live** is per interaction: opened on speech or button, about 500 ms of audio buffered to hide setup, kept across turns, closed when idle; `goAway` and session resumption are handled by the gateway.
7. **Close** after about 60 s idle (what counts as idle: open question). The gateway lets `session_open_until` lapse (or clears it). Commands not acked by then wait for the lease to lapse and are re-queued for the next check-in.

## 6. Command lifecycle

Queue: `onyxchan_commands`. Contract: `command.schema.json`.

```
queued --claim (lease, attempts+1)--> claimed --ack ok--> acked
   ^                                          |  \--ack ok=false--> failed
   |---------- lease lapses (attempts < 3) ---|
                                              \-- lease lapses at attempts = 3 --> failed
any non-final state --expires_at passes--> expired
```

- `id` is the idempotency key. Devices dedupe by `id`: a re-delivered command already executed is acked again with `duplicate: true` and never re-executed.
- Lease: `2 x checkin_interval_s + 15 s` (60 s minimum) for a command delivered by check-in; 60 s for a command sent into an open session. Then re-queue; 3 attempts, then `failed`.
- Acks travel in the next check-in, over `/v1/event` as an event of type `ack`, or as the JSON-RPC response in a session.
- Default expiry: at least `3 x checkin_interval_s` of the device (it must be longer than the maximum lease of 2 x checkin_interval_s + 15 s), for every command. The caller sees `expired` if it lapses.
- Claim per device with `FOR UPDATE SKIP LOCKED`.
- MCP tools that command a device return the command id at once; the ack arrives asynchronously.
- `inventory-display` is the legacy name of `item-card`; `onyx-mcp` normalises it, devices only ever receive `item-card`.

## 7. Binary frames: audio and JPEG

Full spec: [`contract/audio-frame.md`](../contract/audio-frame.md). Decided by the Chief on 2026-10-03.

- Binary WebSocket messages carry audio and JPEG; one message is one frame: a **10-byte little-endian header** plus the payload.
- **Audio is compressed from v1** (B6). Codec order: **IMA-ADPCM first** (4:1, about 64 kbps at 16 kHz), **Opus** later if bandwidth demands it. The gateway transcodes to PCM for Gemini Live.

| Bytes | Field | Type | Meaning |
|-------|-------|------|---------|
| 0 | `frame_type` | uint8 | `0x01` audio, `0x02` JPEG |
| 1 | `codec_id` | uint8 | `0` PCM16, `1` IMA-ADPCM, `2` Opus; JPEG frames use `0` |
| 2-3 | `seq` | uint16 | Sequence number |
| 4-7 | `timestamp_ms` | uint32 | Milliseconds since session start |
| 8-9 | `payload_len` | uint16 | Payload length in bytes |

- **Sample rate is implied by direction**: 16 kHz mono device to gateway, 24 kHz mono gateway to device. Audio frames carry 20 to 40 ms.
- **IMA-ADPCM payload** starts with a 3-byte state (int16 predictor, uint8 step index, little-endian) so a lost frame does not corrupt later ones.
- **JPEG frames** (`0x02`) carry camera images and are told apart from audio by `frame_type`.
- A Phase 3 spike still confirms the Opus layout. Gaps (JPEG over 64 KiB, ADPCM nibble order, `seq` scope) are in the open questions.

## 8. Device vocabulary (initial)

### Commands (device side)
From plan Phase 1.1 / 3.5 / 5.4. Args in `command.schema.json#/$defs`.

| Command | Args | Devices | Source tool in `onyxchanTools.ts` |
|---------|------|---------|-----------------------------------|
| `face` | `expression` (calm, happy, thinking, sleepy, shy, smug, pouty, alert, error, speaking, listening), `duration_ms` | voice | `set_expression` |
| `move` | `pan` -90..90, `tilt` 0..90 | voice | `move_head` |
| `speak` | `text`, `language` es / en (no `ja`); synthesized by the gateway, needs a session | voice | `speak` |
| `item-card` (= `inventory-display`) | `item_id`, `title`, `vendor`, `stock`, `status`, `price` (= `book_retail`, USD; staff-device only) | both | `display_inventory_card` |
| `vendor-display` | `vendor`, `title`, `details` (max 4), `color`, `icon` (a command only, never an expression value) | both | `display_vendor_card` |
| `payment-card` | open question (fields) | voice (StackChan); only from a staff JWT with a finance role | none yet |
| `gif` | open question | none in v1 | none: devices answer ack `ok=false`, `error.code = unsupported` |
| `play_tone` | `tone` | staff-device | none yet |

Rules: a command the device does not implement is answered with `unsupported`, never dropped silently. `payment-card` is shown on screen only, enqueued only from a staff JWT with a finance role, and is never spoken nor passed to the voice model (Ramses to confirm: visitors may see the screen).

### Events (`POST /v1/event`, `event.schema.json`)
| Type | Data |
|------|------|
| `scan` | `source` (nfc, qr, barcode, uhf, serial, simulator), `tag`, optional `item_id` |
| `button` | `button` (a, b, power, touch), `action` (press, long_press, double_press) |
| `telemetry` | battery, charging, RSSI, uptime, free heap, free PSRAM, offline queue length, accessories. New fields: expression (neutral, happy, sad, angry, surprised, sleepy, listening, speaking, unknown), head_pan_deg (-180..180 deg), head_tilt_deg (-90..90 deg), screen (idle, scan, item, packing, offline, unknown), last_scan (string max 64 chars), scanner (none, ready, error), nfc (none, ready, error), mic_level (0..255), volume (0..100), vbat_mv (3000..4500 mV), charge_ma (0..2000 mA), chip_temp_c (-40..125 C). Every field is optional and a device reports only what it has. |
| `ack` | a command ack (`ack.schema.json`), sent instead of waiting for the next check-in |
| `packing_result` | `crate_id`, `expected_count`, `scanned_count` (N/M), scanned / missing ids, wrong-item tags, `result` |

Every event has a device-generated `event_id` (replay dedupe) and `occurred_at`. Scans always go over `/v1/event` (plus `resolve_tag` over `/v1/call`), in or out of a session.

### Device tool calls (`POST /v1/call`)
`call.request` is one JSON-RPC 2.0 `tools/call`. Main use: `resolve_tag {tag}` (tag = `book_barcode` or `item_id`) for NFC (StackChan) and QR/barcode (StickS3). Flow: tag read -> `resolve_tag` -> item card on screen -> `scan` event -> the app opens the item for assigned users.

## 9. Error codes

Stable codes (`error.schema.json`). Clients branch on `code`, never on `message`. Messages never contain a token, secret or redacted value.

| Code | HTTP | Meaning |
|------|------|---------|
| `invalid_request` | 400 | Body or frame fails its schema |
| `unauthorized` | 401 | Missing or unknown token |
| `token_revoked` | 401 | Token has `revoked_at` |
| `token_expired` | 401 | Token past `expires_at` |
| `auth_timeout` | (wss close) | No valid auth + `hello` within 5 s |
| `identity_mismatch` | (wss close) | `hello.device_id` / `role` differ from the token's identity |
| `forbidden` | 403 | Tool or device not allowed for this role (incl. cross-device) |
| `field_denied` | 403 | An argument asks for a field the role cannot see |
| `unknown_tool` | 404 | No such tool / command name |
| `unsupported` | - | Device does not implement this command (e.g. `gif`) |
| `not_found` | 404 | Tag / item / command id not found |
| `command_expired` | - | Command passed `expires_at` |
| `command_failed` | - | Command reached 3 attempts or was acked `ok=false` |
| `lease_expired` | 409 | Ack for a command whose lease lapsed and was re-claimed |
| `frame_too_large` | 413 | Frame or body over the cap |
| `rate_limited` | 429 | Over the per-connection rate cap |
| `session_closed` | (wss close) | Idle close, revoke, or gateway shutdown |
| `upstream_unavailable` | 502 / 503 | `onyx-mcp`, the RPC edge function or Gemini Live unavailable |
| `internal` | 500 | Anything else |

The code names are derived from behaviours the plan requires; their final names and the JSON-RPC numeric code mapping await the Chief (Open questions).

## 10. Tool-by-role table

Source: `contract/roles.json`. Deny by default. `onyx-mcp` enforces it server-side, including field redaction in results (not the prompt).

Field sets:
- **cost columns** (`COST_COLUMNS`): `price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, `book_land_code`.
- **price fields** (not in `COST_COLUMNS`): `book_retail` (USD), `price` (carries `book_retail`; list pending audit).
- **redaction is a deny-by-default field allowlist per role** (`redaction.field_allowlists` in `roles.json`), applied at the query and before any Markdown rendering. It never relies on the `costSensitive` flag of `onyxDataTools.ts`; `inventory_get_by_barcode` and `display_item_card` are listed explicitly. The `denied_field_patterns` are defence in depth only.
- **payment fields**: matched by pattern; explicit list pending audit.

| Tool group | voice | staff-device | staff (JWT) | agent (PAT) | gateway |
|------------|-------|--------------|-------------|-------------|---------|
| `resolve_tag`, `query_inventory`, `query_inventory_item`, `count_vendor_items` | yes | yes | yes | read scope | via device token only |
| `logistics_list_containers`, `logistics_container_contents` (crate list and contents, read-only) | no | yes, cost fields denied | per `requiredRoles` | read scope | via device token only |
| `inventory_search`, `inventory_get_item`, `inventory_get_by_barcode`, `inventory_list_by_crate`, `inventory_list_by_vendor`, `inventory_count_by_status`, `inventory_count_by_vendor`, `inventory_get_media`, `inventory_get_segmentation`, `display_item_card`, `display_inventory_dashboard` | yes, no cost/price/payment/MXN fields | yes, `book_retail` (USD) only, no cost/payment/MXN | per `requiredRoles`; cost redacted unless FINANCE_ROLES | issuer's set, read scope, cost redacted | via device token only |
| `inventory_get_pricing`, `query_payment_status`, `finance_*`, `display_vendor_report`, `display_financial_report` | no | no | FINANCE_ROLES | only with a named payment / cost scope, capped by issuer | no |
| `payment-card` command | only from a staff JWT with a finance role; never from the model | no | FINANCE_ROLES | named payment scope | no |
| `system_get_exchange_rate` (MXN) | no | no | per `requiredRoles` | read scope | no |
| `system_list_users`, `system_get_settings`, `system_list_devices`, `system_get_print_jobs`, other logistics, production | no | no | per `requiredRoles` | read scope, capped by issuer | no |
| `set_expression`, `move_head`, `speak`, `display_vendor_card`, `display_inventory_card` | own device only | no | assigned devices; only Admin commands all devices | device-command scope, issuer's assigned devices | no |
| `get_robot_status`, `ping_robot`, `app_*` | no | no | assigned devices; only Admin commands all devices | device-command scope | no |
| RPCs `verify_device_token`, `claim_commands`, `ack_command`, `record_device_heartbeat`, `record_device_event` | - | - | - | - | yes, through the edge function (`GATEWAY_EDGE_SECRET`), with the device's token or per-session token |

Agent cap: effective permissions = issuing user's permissions AND issuing user's device assignments AND token scopes. Payment and cost tools never reachable with a PAT unless a named scope grants them; device-command scope only when granted explicitly.

## 11. Negative tests (Phase 1 "Done when")

All must pass before Phase 1 is done:
1. `anon` cannot call the device RPCs.
2. `anon` cannot publish to robot Realtime channels.
3. A device token cannot call staff tools.
4. A revoked or expired device token is rejected.
5. Device A's token cannot claim or ack device B's commands.
6. A `voice` call never returns a cost, payment or price field.
7. A `staff-device` call returns price but no payment or cost field.
8. A PAT cannot reach payment tools without a named scope.
9. A user who is not assigned to a device cannot read its `onyxchan_events`.

Phase 2 simulator tests on top: hello, check-in, `tools/call`, ack, reconnect, audio loopback, long idle then a voice turn, revoked token, push into an open session (latency measured), command expiry and lease re-queue.

## 12. Open questions

Nothing below is decided by the plan or the Chief. Numbers are stable (section 14 refers to them): items answered by section 14 and the binary frame decision are removed, so some numbers are missing. Items marked **(derived)** in this document are proposals pending the Chief.

**Transport and frames**
3. Does the gateway answer `hello` (a server hello like xiaozhi)? Does the envelope carry a `session_id` like xiaozhi's `{session_id, type, payload}`?
5. `/v1/event` response status and body (the `/v1/call` JSON-RPC shape is accepted).
7. Frame size and rate caps (numbers).
8. What counts as "idle" for the 60 s session close (audio and commands, not ping/pong?).
10b. Claim layout and signing-key location of the per-session token (format HMAC-signed, 10 minutes, bound to `device_id` is decided).
31. Binary frames: JPEG larger than 65535 bytes (uint16 `payload_len`: chunking or size cap), JPEG direction, Opus packet layout, IMA-ADPCM nibble order, scope of the `seq` counter, receiver gap handling. See `contract/audio-frame.md`.
32. `session_open_until` initial window (about 60 s is assumed here) and how the app shows "session open".

**Vocabulary**
12. Mapping of manifest tools to device commands (`set_expression` -> `face`, `move_head` -> `move`, `display_inventory_card` -> `item-card`, `display_vendor_card` -> `vendor-display`) and whether the tool names change.
14. `payment-card` fields; `gif` args; `play_tone` tone vocabulary; the Phase 3.5 "inventory list" card has no command name.
15. Does the StackChan `item-card` show price on screen (staff use) or never (voice role)? (The contract strips it for voice.)
17. `app_*` tools and `get_robot_status` / `ping_robot` used to be Realtime broadcasts; how are they delivered now, and are they commands?
18. `hardware` value list and the `capabilities` vocabulary.
19. Button gestures beyond press.

**Roles and data**
21. Agent scope names (this contract uses `read`, `device-command`, `payment`, `cost` as placeholders, `names_final: false`).
22. Exact column allowlists per role and tool (the contract lists only the field names already known), the payment field list, the inventory and logistics column audit.
24. Display tools return Markdown: redaction happens at the query, not the output text (decision 8 says allowlist; confirm the implementation in `onyx-mcp`).
25. Device roles are not app roles: how `requiredRoles` (e.g. `INTERNAL_STAFF` on `inventory_list_by_crate` and `logistics_container_contents`) applies to `voice` / `staff-device`.
26. Does `packing_result` only land in `onyxchan_events` or also update inventory / logistics rows? Which crates (current `logistics_826`?) is already an open item for Ramses.
27. Device clock: `occurred_at` needs NTP or server time; offline-queued events need a trustworthy timestamp.
28. OTA signature algorithm and encoding; signed URL lifetime.
29. `checkin_interval_s` bounds and who decides mains vs battery (device-reported `power` **(derived)**).
30. Error code names and JSON-RPC numeric code mapping.
33. Finance-role confirmation for `payment-card` on the StackChan **(Ramses)**.

## 13. Plan conflicts found while writing this

All eight are decided in section 14 and applied in contract 1.1.0; the text below is kept as the record of the question.

1. **Lease vs battery check-in.** Lease 60 s, acks ride on the next check-in, battery interval 60-120 s. A battery device acks after its lease lapsed, so the command is re-queued, re-delivered and counted again, and can reach `failed` after 3 attempts although it ran. Needs one of: lease >= interval + margin, an immediate ack check-in, or acks over `/v1/event`.
2. **Staff-device price vs `price_mxn`.** "price allowed" but `price_mxn` is in `COST_COLUMNS`; B4 also bans MXN on voice. As written, staff-device sees only `book_retail` (USD).
3. **`payment-card` on a `voice` device.** Phase 3.5 shows payment cards on the StackChan, whose role must never see payment fields. Allowed here only from a staff JWT with a finance role and kept out of the voice model; needs explicit confirmation.
4. **Packing check needs a crate list** ("choose a crate"), but `staff-device` is limited to the voice set (inventory and vendor tools) and logistics tools are not in it.
5. **One gateway secret, two uses.** The `pg_net` trigger must hold the gateway secret to call `/v1/notify`, so the same secret that authenticates the gateway to the edge function would sit in the database. Two separate secrets are safer.
6. **`vendor-display`** is a command in the plan and an expression value in `onyxchanTools.ts`.
7. **Languages.** Plan: es + en; `speak` in `onyxchanTools.ts` also allows `ja`.
8. **Existing manifest vs redaction.** `inventory_get_by_barcode` is not `costSensitive` in `onyxDataTools.ts`, and `display_item_card` renders the USD retail price; both are in the voice set, so role redaction must not depend on the `costSensitive` flag.

## 14. Chief decisions (2026-10-03) on sections 12 and 13

Decided by the Chief (Juan117) under plan v2.1. Items that need Ramses are marked **(Ramses)**. The schemas and `roles.json` were updated to match in task CA-1 (contract 1.1.0).

**Plan conflicts (section 13)**
1. **Lease vs battery check-in:** lease = `2 x checkin_interval_s + 15 s` (60 s minimum) for commands delivered by check-in; 60 s for commands sent into an open session. Acks may also be sent over `/v1/event`. A device that receives a command id it already executed re-acks it and does not run it again.
2. **Staff-device price:** the StickS3 card shows the retail price (`book_retail`, USD) only. `price_mxn` and every other cost column stay denied.
3. **`payment-card` on the StackChan:** allowed only as a command from a staff JWT with a finance role, shown on screen, never passed to the voice model and never spoken. **(Ramses)** to confirm, because visitors may see the screen.
4. **Packing check crate list:** `staff-device` gets read-only crate list and crate contents tools (names from the logistics group of `onyxDataTools.ts`), with cost fields denied.
5. **Two gateway secrets:** `GATEWAY_EDGE_SECRET` (gateway to edge function, in Secret Manager) and `NOTIFY_SECRET` (`pg_net` trigger to `/v1/notify`, in Supabase Vault). Never the same value.
6. **`vendor-display`** is a command only; remove it from the `set_expression` values (done in the contract; `onyxchanTools.ts` follows when merged in Phase 1).
7. **Languages:** Spanish and English only; drop `ja` from `speak`.
8. **Redaction is a field allowlist per role, deny by default**, never the `costSensitive` flag. `inventory_get_by_barcode` and `display_item_card` are covered explicitly.

**Open questions (section 12)**
- 4, 5, 6: accept the derived shapes (commands in a session as `tools/call` with `id = command.id`; `/v1/call` as JSON-RPC `tools/call`; notify body `{device_id, command_id}` with the secret in an `X-Notify-Secret` header). The `/v1/event` response is HTTP 200 with the JSON object `{"ok": true}`.
- 9: `session_open` is a lease, not a flag: `session_open_until`, refreshed by the 30 s ping; the trigger fires only while it is in the future. A dead instance clears itself.
- 10: the per-session token is HMAC-signed, valid 10 minutes, bound to `device_id`; minted by `verify_device_token`.
- 11: scans always go over `/v1/event` + `/v1/call`, in or out of a session.
- 16: `speak` is synthesized by the gateway (Gemini voice) and needs a session; sent to a sleeping device it is queued and runs on wake only if not expired, otherwise the caller gets `expired`.
- 20: per-command expiry stays at least `3 x checkin_interval_s` (it must be longer than the maximum lease of 2 x checkin_interval_s + 15 s).
- 23: only Admin commands all devices.
- 1, 2, 3, 7, 8, 12-15, 17-19, 21, 22, 24-30: for the next contract pass (wave A) with the research digests as input.

**Binary frame header (Chief, 2026-10-03)**
- Answers open questions 1 and 2. Ten bytes, little-endian: type, codec id, seq, timestamp, payload length. Spec in section 7 and `contract/audio-frame.md`.
