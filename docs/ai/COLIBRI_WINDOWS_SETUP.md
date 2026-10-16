# Colibrì on Windows: local model server and the Onyx app

**Document ID**: `COLIBRI_WINDOWS_SETUP`
**Version**: 2.0 (rewritten 2026-10-16 against the real server; the 1.0 text described a mock)
**Engine**: [`JustVugg/colibri`](https://github.com/JustVugg/colibri) v2 (`coli web` / `coli serve`)

## 1. What it is, and what it is not

Colibrì runs a large model on one PC (here: Qwen3.6-35B-A3B, Vulkan on an RTX 2060) and serves it over an
OpenAI-compatible HTTP API. Measured on this PC:

| Fact | Value |
|---|---|
| Address | `http://127.0.0.1:8000` (OpenAI API under `/v1`) |
| Models | **One at a time.** `GET /v1/models` returns the loaded one, for example `qwen3.6-colibri` or `qwen3-coder-30b-a3b-colibri` |
| Wrong model id | `404 model_not_found`. There is no `auto` on the server |
| Input | **Text only** (`input_modalities: ["text"]`). Images are refused |
| Speed | About **0.5 tokens per second** (a one-line answer took 45 s) |
| Embeddings | **None.** The API lists `/v1/models`, `/v1/chat/completions`, `/v1/completions`, `/v1/systemone`, `/v1/messages` and image generation; there is no `/v1/embeddings` |
| Telemetry | `GET /health` returns status, `arch`, scheduler counters (active, queued, completed, failed). It reports no tokens per second and no disk throughput |

How the app uses it:

- **Chan chat** can use Colibrì. The chat pane shows "Local model: replies can take a minute", a running seconds
  counter, and a Stop button. If the server is down the call fails within about two seconds with a clear message.
- **'auto'** in the app only means "the model the server has loaded". The model list comes from `GET /v1/models`
  (cached for a few seconds). A saved model id that is not loaded falls back to the loaded one.
- **Images are never sent to Colibrì.** Segmentation (vision) cannot be routed to it, and any job that carries a photo
  to Colibrì fails with a message instead of answering blind.
- **No embeddings tier.** Vectors in `item_embeddings` come from one model only; the sync runner tags each row with the
  model the embedder really reports and refuses a batch from a different model.
- **No invented numbers.** The Edge Fleet page shows only what `/health` and `/v1/models` report.

## 2. Install and start

1. Run `START-HERE.bat` in the Colibrì folder once (it chooses a model that fits, gets the engine, downloads the
   model and writes `%LOCALAPPDATA%\colibri\setup.json` with the model folder, port and arguments).
2. Start it later with either:
   ```powershell
   .\scripts\start-colibri-daemon.ps1            # reads setup.json, adds the app's CORS origin, waits until it answers
   .\scripts\start-colibri-daemon.ps1 -Status    # is it up?
   .\scripts\start-colibri-daemon.ps1 -Stop
   ```
   or Colibrì's own command, for example
   `coli web --model <model folder> --host 127.0.0.1 --port 8000 --no-browser`.

The server binds to `127.0.0.1` by default. Set `COLI_API_KEY` (and type the same key in Settings > AI) before ever
exposing it beyond this PC.

## 3. CORS: letting the app's origin call the server

A browser blocks the call unless the server lists the page's origin. Colibrì's built-in list is
`http://127.0.0.1:8000`, `http://localhost:8000`, `http://127.0.0.1:5173`, `http://localhost:5173`,
`http://tauri.localhost` and `tauri://localhost`. So the Vite dev server on `http://localhost:5173` already works; the
deployed app on GitHub Pages does not.

Add it with `--cors-origin`. A plain value **replaces** the list; a value starting with `+` **adds** to it:

```
coli web --model <model folder> --host 127.0.0.1 --port 8000 --no-browser ^
         --cors-origin +https://jouhayerk-cloud.github.io
```

(`start-colibri-daemon.ps1 -CorsOrigin https://jouhayerk-cloud.github.io` does exactly this.) To make it permanent
for the installer's own launch, append `"--cors-origin", "+https://jouhayerk-cloud.github.io"` to `args` in
`%LOCALAPPDATA%\colibri\setup.json`. The list is read when the server starts: restart it after changing it. Do not use
`--cors-origin '*'`.

Other things a browser enforces, which no setting here can bypass:

- A page served over **HTTPS** may call `http://127.0.0.1` in Chrome, Edge and Firefox (loopback counts as secure),
  but **not** a plain-HTTP LAN address, and **Safari on iPhone/iPad cannot reach the PC at all**. Colibrì is therefore
  a desktop feature for now.
- Chrome may ask once for permission to reach local devices.

## 4. In the app

1. Settings > AI providers > Colibrì: the address defaults to `http://127.0.0.1:8000`; **Test connection** reads
   `/health` and `/v1/models` and shows the loaded model.
2. Chan: the **Use Colibrì** pill (desktop) switches chat to it after checking the server answers.

## 5. Checks (PowerShell)

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
(Invoke-RestMethod http://127.0.0.1:8000/v1/models).data | Select-Object id
$body = @{ model = "qwen3.6-colibri"; messages = @(@{ role = "user"; content = "Say hi in five words." }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod http://127.0.0.1:8000/v1/chat/completions -Method Post -Body $body -ContentType "application/json" -TimeoutSec 600
```

Use the id that `/v1/models` printed. Expect about a minute for a short answer.

## 6. Relay: disabled until secured

The Supabase Realtime relay (which carried iPhone traffic) is **off** (owner decision, 16 Oct 2026):
`colibriRealtimeBridge.ts` is an inert module, `colibri-supabase-relay.cjs` exits immediately, and the provider has no
fallback to it. It broadcast prompts and answers on one public channel with the public anon key, so anyone could read
them or pose as the host. To bring it back it needs a private channel with RLS on `realtime.messages`, a dedicated
daemon identity (not the anon key), an allowlist of host identities, an endpoint allowlist, a fixed upstream and
per-sender rate limits.

## 7. LAN relay (optional, same-network browser to a Colibrì PC)

`scripts/colibri-lan-relay.cjs` (or `start-colibri-relay.ps1`) lets a browser on one machine reach a Colibrì server on
another through `http://127.0.0.1:<port>`:

```powershell
.\scripts\start-colibri-relay.ps1 -Upstream "http://<host-or-ip>:8000"
```

It listens on `127.0.0.1` only, forwards only `/health`, `/v1/models` and `/v1/chat/completions`, and answers CORS only
for a fixed origin list (add more with `--allow-origin`). Listening on another address needs `--allow-lan --token
<secret>`. For the app to find the machines, add them under Edge Fleet > "Configure mesh nodes" (kept in this
browser's localStorage; nothing is built in).

## 8. Developing without the engine

`scripts/colibri-mock-server.cjs` (or `start-colibri-daemon.ps1 -DevMock`) is a **mock**: canned answers in the real
API shape (one model id, 404 for any other, no embeddings, no telemetry). It listens on `127.0.0.1` only. Never use it
for real answers.

## 9. Troubleshooting

- **"Colibrì is not reachable"** in Chan: the server is not running, or the browser blocked the call. Run
  `start-colibri-daemon.ps1 -Status`; then check the origin is in the CORS list (section 3).
- **404 model_not_found**: the model id is not the loaded one. Choose "auto" (the loaded model) in Settings.
- **429 / "busy"**: the single generation slot is taken and the queue is full or timed out (queue 8, 300 s by
  default). Wait, or press Stop on the long request.
- **Very slow**: expected on this PC (about 0.5 tokens per second). Keep prompts short and `max_tokens` low.
- **Port in use**: `Get-NetTCPConnection -LocalPort 8000` shows the owner; `start-colibri-daemon.ps1 -Stop` stops it.
