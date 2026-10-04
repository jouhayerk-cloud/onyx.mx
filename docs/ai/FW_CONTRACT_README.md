# contract/

Machine-readable source of the OnyxChan protocol v1 (PLAN v2.1, Phase 1.1, A20). `docs/PROTOCOL.md` is the readable explanation; when the two disagree, these files win and the doc is fixed.

Owner: the Chief. Changes only through the Chief, or in a task whose assignment names the file and carries the Chief's sign-off. No agent invents a message type or tool name.

| File | Message | Where it travels |
|------|---------|------------------|
| `common.schema.json` | shared `$defs` (uuid, timestamp, roles, language, tool descriptor) | referenced by the others |
| `hello.schema.json` | `hello` | first text frame on `wss /v1/session` |
| `mcp.envelope.schema.json` | `{type:"mcp", payload}` (JSON-RPC 2.0) | every later text frame on `wss /v1/session` |
| `checkin.request.schema.json` | check-in body (state + acks) | `POST /v1/checkin` |
| `checkin.response.schema.json` | `checkin_interval_s`, commands, OTA `{version,url,sha256,signature}` | `POST /v1/checkin` 200 |
| `event.schema.json` | `scan`, `button`, `telemetry`, `packing_result`, `ack` | `POST /v1/event` |
| `call.request.schema.json` | JSON-RPC `tools/call` (`resolve_tag`, other tools) | `POST /v1/call` |
| `call.response.schema.json` | JSON-RPC result / error | `POST /v1/call` 200 |
| `notify.schema.json` | wake-up hint `{device_id, command_id}` | `pg_net` trigger -> `POST /v1/notify` (header `X-Notify-Secret`, `NOTIFY_SECRET`) |
| `command.schema.json` | queued command (status, expires_at, attempts, idempotent id) + per-command args | check-in response, or `tools/call` in a session |
| `ack.schema.json` | command ack | check-in request, or JSON-RPC response in a session |
| `error.schema.json` | error object with stable `code`; `$defs/error_frame`, `$defs/http_error_body` | everywhere |
| `roles.json` | tool-by-role table, per-role field allowlists (deny by default) | enforced by `onyx-mcp` |
| `audio-frame.md` | 10-byte binary frame header (audio, JPEG), codec ids, ADPCM state | binary frames on `wss /v1/session` |

## Conventions
- JSON Schema draft 2020-12. Each schema has a `urn:onyxchan:contract:v1:<name>` `$id`; cross-file `$ref`s use those URNs, so a validator must load every `*.schema.json` in this folder before compiling (for Ajv: `ajv/dist/2020`, `addSchema` each file, plus `ajv-formats` for `date-time` and `uri`).
- Text frames and HTTP bodies are UTF-8 JSON. Field names are `snake_case`; command names follow the plan's vocabulary (`item-card`, `vendor-display`, ...).
- Unknown fields are rejected (`additionalProperties: false`) except where a schema says otherwise.
- Fixtures live in `fixtures/<owner>/` (wave A) and CI validates both the C++ (ArduinoJson) and TypeScript fixtures against these schemas.
- Never put a real token, key, password or URL with a signature in a fixture.

## Versioning
`/v1` in every path is the protocol major version. Additive, optional fields keep v1; removing or renaming a field, changing a type, or adding a required field needs `/v2`. `roles.json` `version` tracks the table. Binary frames are normative in `audio-frame.md`. See `docs/PROTOCOL.md` "Open questions" for what is still undecided.
