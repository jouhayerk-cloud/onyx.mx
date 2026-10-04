---
name: OnyxMX-OnyxChanMCP
description: "OnyxChan agent and MCP layer: the tool contract and transports between the Onyx.mx app and ESP32 devices, the local Node/Python services, and their known disconnects."
---

# OnyxChan Agent & MCP Integration

Covers everything **between** the firmware and the app: transports, the MCP tool surface,
and the local servers. For the devices and firmware themselves see
[[OnyxMX-PicoHardware]].

## 1. Start here — the integration is not wired end to end

Audited 2026-08-29. Both sides implement the same command vocabulary; **no transport
carries it end to end**. Assume nothing works until you have verified which path you are
actually exercising.

## 2. Command schema (the contract)

Documented in `Onyx.mx-Pico/StackChan/firmware_cpp/APP_INTEGRATION_SPEC.md`. JSON over
WebSocket:

| Action | Payload | Firmware handles |
|--------|---------|------------------|
| `face` | `expression`, optional `duration` | ✅ |
| `move` | `pan` −90..90, `tilt` 0..90 | ✅ |
| `tts` | `text`, `language` (`es`\|`en`\|`ja`) | ✅ |
| `vendor-display` | `vendor`, `color`, `title`, `details[]`, `icon` | ✅ |
| `vision` | `{type:"vision", state:bool}` | ✅ |
| `inventory-display` | `item_id`, `title`, `price`, `stock`, `vendor` | ❌ **dropped** |
| `gif` | `url`, `duration` | ❌ **dropped** |

The app emits all seven (`useDeviceControl.ts`); the firmware parses five. The last two
are accepted by the transport and silently discarded. Fix one side or the other before
building on this.

Audio: send Opus as binary WebSocket frames, not base64 JSON. Spec recommends a 50–100 ms
jitter buffer and device-side ACK/flow control.

## 3. The three transports — and how each fails

| # | Path | State |
|---|------|-------|
| A | `useDeviceControl` → Supabase Realtime broadcast → firmware | **Broken.** Firmware has no Realtime client. `_supabaseConnected` in `Face.cpp` is a display flag, not a connection. |
| B | `useStackChanSocket` → ESP32 WS server → firmware | **Broken — inverted topology.** Firmware declares only `WebSocketsClient` and dials *out*; there is no `WebSocketsServer` in it. This hook targets stock factory StackChan firmware. |
| C | firmware `wsClient` → `192.168.1.71` → `server.js` :3001 | **Correct topology.** But the second client, `xiaozhiClient`, points at the literal placeholder `"XIAOZHI_SERVER_IP"` and can never resolve. |

**Path C is the one to build on.** The ESP32 should hold one outbound WebSocket to a
gateway; it should not be taught Supabase Realtime.

## 4. MCP surfaces — four of them, none authoritative

| Surface | Tools | State |
|---------|-------|-------|
| `supabase/functions/onyxchan-mcp/index.ts` | 14 | 588 lines, **not deployed** |
| `Onyx.mx-Pico/server/supabase_mcp_server.py` | 2 | overlaps the above |
| `Onyx.mx-Pico/server/stackchan_mcp_bridge.py` | — | **fails at import** (uses `create_client`/`Client` without importing them) |
| `Onyx.mx-Pico/mcp-ts-server/` | — | standalone SSE, pinned to `@modelcontextprotocol/sdk ^0.1.2` (very old) |

### The 14-tool contract (edge function)

- **Device → app:** `app_change_view`, `app_open_add_item`,
  `app_open_inventory_artifact`, `app_search_inventory`, `display_inventory_card`,
  `display_vendor_card`
- **Data:** `query_inventory`, `query_inventory_item`, `query_payment_status`
- **App → robot:** `speak`, `set_expression`, `move_head`, `get_robot_status`, `ping_robot`

**Recommendation: consolidate onto the edge function.** It has the widest tool set, runs
next to the data, and is reachable off-LAN — which path C is not. Reduce the Python and
SSE servers to thin clients or retire them. Do not add a fifth surface.

## 5. The fallback that hides failure

`mcp/onyxChanMcpClient.ts` POSTs to the edge function and, on failure, silently calls
`dispatchRealtimeFallback()` — broadcasting over Supabase Realtime instead. Because the
function is undeployed, **every MCP call has taken the fallback**; the MCP layer has never
executed. The system therefore looks functional while the integration is inert.

When debugging, always establish which path ran. After deploying the function, remove the
silent fallback or make it log loudly.

## 6. Local services (`Onyx.mx-Pico/`)

| Service | Purpose |
|---------|---------|
| `Onyx.mx-App/server/server.js` | Node WebSocket gateway, port **3001** — firmware's intended target |
| `Onyx.mx-App/client/` | Vite + react-three-fiber 3D StackChan viewer |
| `server/whisper-api/whisper_server.py` | Speech-to-text |
| `server/ui_generator.py` | UI generation helper |

Note `server/` also contains a 33k-file `.venv`; exclude it from searches.

## 7. Working rules

1. **Verify the path before debugging.** Most failures here are deployment/config, not logic:
   undeployed function, unapplied migration, placeholder host, non-persisted atoms.
2. **Check the port.** Gateway listens on 3001; the firmware's XiaoZhi client assumes 8080.
   Confirm which the build targets.
3. **One MCP surface.** Extend the edge function rather than adding another server.
4. **Adding a tool means three edits:** the edge function schema, `onyxChanMcpClient.ts`,
   and a decision about whether the Realtime fallback can service it.
5. **Adding a device command means two:** the app's `useDeviceControl` union *and* the
   firmware parser — the `inventory-display` gap is exactly what happens otherwise.
6. **Device identity is not persisted** — see [[OnyxMX-PicoHardware]] §4 before relying on
   the registry.
