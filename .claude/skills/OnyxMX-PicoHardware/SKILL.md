---
name: OnyxMX-PicoHardware
description: "Onyx.mx-Pico hardware: ESP32/M5Stack firmware, the hidden PicoBridge module in the web app, device transports (BLE / WebSocket / Supabase Realtime)."
---

# OnyxMX Pico Hardware

Covers the physical side of Onyx.mx: M5Stack/ESP32 devices ("OnyxChan" / "StackChan"),
the hidden `PicoBridge` module inside the web app, and the MCP tool layer that lets a
device drive the app.

**Two repos are involved.** The web-app side lives in `C:\Jouhayerk\git\app\src\features\pico\`;
firmware, local servers and hardware specs live in `C:\Jouhayerk\Onyx.mx-Pico\`.

## 1. Current state — read this first

This is the most actively developed and **least committed** area of the project.
As of 2026-08-29:

- The entire app-side `features/pico/` tree (18 files, ~4,700 lines) is **uncommitted**.
  `git log --grep pico` returns nothing.
- The migration `supabase/migrations/20260725_pico_bridge_schema.sql` (creating
  `pico_devices`, `pico_sessions`, `pico_scan_logs`) has **never been applied**. Those
  tables do not exist remotely.
- The remote DB instead has `onyxchan_devices` (1 row) and `onyxchan_commands` (0 rows),
  which **no app code queries**.
- The edge function `supabase/functions/onyxchan-mcp/` (588 lines, 14 tools) exists
  locally but is **not deployed**. Remote has only `artifact` and `artifact-preview`.

Verify these before assuming any device state persists.

## 2. Hardware & role mapping

Role → device, per `Onyx.mx-Pico/device_root/m5stack_specs/`:

| Role | Device |
|------|--------|
| Developer | M5Stack Tab5 (ESP32-P4) |
| Admin | M5StackChan AI Desktop Robot (ESP32-S3) |
| Vendor | ATOM Lite / AtomS3R-CAM |
| Staff | M5StickS3 |
| User | M5Stack CoreS3 |

Accessories map through an `accessories` JSONB field: ATOMIC Barcode/QR Base,
QR Scanner Unit (STM32F030), NFC Universal Unit (ST25R3916), UHF RFID (JRD-4035).

## 3. Firmware

**Canonical copy: `Onyx.mx-Pico/StackChan/firmware_cpp/`** — not `OnyxChan/firmware_cpp/`.
Both build; StackChan is newer (main.cpp 67 KB / Aug 19 vs 54 KB / Aug 18) and carries
`APP_INTEGRATION_SPEC.md`. Treat OnyxChan as the older fork and confirm before editing
either.

- Target: `m5stack-cores3`, Arduino framework via PlatformIO, C++17.
- Deps include M5Unified, M5GFX, ArduinoJson, WebSockets, m5stack-avatar, StackChan-BSP,
  M5UnitUnified, M5Unit-NFC.
- **`extra_scripts = pre:patch_m5unified.py` patches a vendored library at build time** —
  a dependency bump can silently break the build. Check that script first when a
  previously-working build fails.
- Modules: `main.cpp`, `Face.*` (avatar), `GeminiLiveProbe.*` (on-device Gemini Live),
  `GeminiToolBridge.*` (tool calling), `ScreenApps.*`, `ServoGestureController.*`,
  `AudioClient.*`.
- Orphaned experiment: `C:\Jouhayerk\scratch_*.cpp` (incl. `scratch_EmotionController.cpp`)
  is a third divergent variant referenced by nothing. Do not treat as source.

## 4. App side — the hidden PicoBridge module

`PicoBridge` is deliberately absent from sidebar navigation. Three access paths, all
implemented in `features/core/MainAppView.tsx` and `features/control/ControlView.tsx`:

1. `Ctrl/Cmd + Shift + P` (or `O`) global shortcut
2. URL parameter check during init
3. A "PicoBridge" button in ControlView (Developer/Admin only)

Keep it unlisted — do not add a nav entry.

**State lives in `src/lib/picoAtoms.ts`.** Critical caveat: `picoDevicesAtom`,
`activePicoSessionAtom`, `picoRealtimePayloadAtom` and `picoWorkflowStateAtom` are plain
in-memory atoms. Only `picoRssiThresholdAtom` persists. **Registered devices are lost on
every page reload** — the registry is not backed by Supabase despite the tables existing.

## 5. Transports — three channels

1. **Web Bluetooth** (`useBleDevice.ts`) — requires a secure context. The dev server runs
   HTTPS via `@vitejs/plugin-basic-ssl` for exactly this reason; the cert is self-signed
   (`CN=example.org`), so browsers need a manual exception.
2. **WebSocket** (`useStackChanSocket.ts`) — direct to the robot's ESP32 server on the
   LAN, probing several candidate endpoints.
3. **Supabase Realtime** (`PicoRealtimeController.tsx`) — channel `pico-bridge-global`,
   broadcast events `SCAN_EVENT` and `STATUS_HEARTBEAT`.

`onyxChanMcpClient.ts` POSTs to the edge function and **falls back to Realtime broadcast**
when that call fails (`dispatchRealtimeFallback`). This is why the system appears to work
despite the function being undeployed — know which path you are actually exercising.

## 6. MCP, transports and servers

Covered in depth by [[OnyxMX-OnyxChanMCP]] — the 14-tool contract, the three transports
and which of them actually work, the four overlapping MCP surfaces, and the local
Node/Python services. Read that skill before touching anything between the app and the
device.

The one thing to carry here: the firmware parses `face`, `move`, `tts`,
`vendor-display` and `vision`, but **not** `inventory-display` or `gif`, which the app
sends anyway.

## 7. Working rules

1. **Check what is deployed before debugging.** Most "broken" behaviour here traces to the
   undeployed edge function, the unapplied migration, or the non-persisted device atoms —
   not to logic errors.
2. **Never add a PicoBridge nav entry.** The module is intentionally hidden.
3. **Prefer `StackChan/firmware_cpp`** and confirm which copy the user means before editing.
4. **Web Bluetooth needs HTTPS** — never move the dev server to plain HTTP.
5. **Device identity must be validated** (MAC/chip ID) against the role table in §2 before
   granting workflow permissions.
6. When adding a tool, add it to the edge function's schema *and* `onyxChanMcpClient.ts`,
   and decide whether the Realtime fallback can service it.
