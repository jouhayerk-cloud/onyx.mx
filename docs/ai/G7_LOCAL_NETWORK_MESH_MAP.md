# Colibrì MoE Local Network Mesh Map & Relay Architecture

This document outlines the local network topology, device inventory, IP/MAC bindings, and relay deployment architecture for **Onyx-mx** and **Colibrì Local MoE** on the G7 Wi-Fi network.

---

## 1. Local Network Device Inventory (G7 Network)

| Hostname | Role | IP Address | MAC Address | Operating Service / Port |
| :--- | :--- | :--- | :--- | :--- |
| **G7** | Primary Host | `192.0.2.71` | `02:00:00:00:00:01` | • Colibrì MoE NVMe Server: `8082`<br>• Onyx Web Dev App: `https://192.0.2.71:1001/onyx.mx/` |
| **Second_Laptop** | Secondary Client / Relay Node | `192.0.2.67` | `02:00:00:00:00:02` | • Colibrì LAN Mesh Relay: `http://127.0.0.1:8082`<br>• Connects across LAN to `192.0.2.71:8082` |
| **Phone** | Mobile Client (Ramses iPhone) | `192.0.2.100` | `02:00:00:00:00:03` | • iOS Safari Web Client: `https://192.0.2.71:1001/`<br>• LiteRT On-Device / Wi-Fi inference |

---

## 2. Mesh Relay Architecture

```
                      ┌────────────────────────────────────────┐
                      │             G7 LAPTOP (HOST)           │
                      │         IP: 192.0.2.71:8082          │
                      │        MAC: 02:00:00:00:00:01          │
                      │   - Colibrì MoE NVMe Sparse Engine     │
                      │   - Models: GLM-5.2, Kimi-K3, Qwen-2.5 │
                      │   - Onyx-mx Web App (Port 1001)        │
                      └──────────────────┬─────────────────────┘
                                         │
                         Local G7 Wi-Fi Mesh Network
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             ▼                                                       ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│        MARTHA_LAPTOP          │               │         RAMSES IPHONE         │
│     IP: 192.0.2.67          │               │      IP: 192.0.2.100        │
│    MAC: 02:00:00:00:00:02     │               │     MAC: 02:00:00:00:00:03    │
│                               │               │                               │
│  [ Colibrì LAN Mesh Relay ]   │               │   [ Safari / Web Client ]     │
│  Listening on 127.0.0.1:8082  │               │   Connected to Onyx App on    │
│   ▲                           │               │   https://192.0.2.71:1001/  │
│   │                           │               │                               │
│  [ Web Browser / Client ]     │               │   Direct inference over LAN:  │
│  Bypasses browser PNA & CORS  │               │   http://192.0.2.71:8082    │
└───────────────────────────────┘               └───────────────────────────────┘
```

---

## 3. Why Run the Relay on Second Laptop?

1. **Browser Private Network Access (PNA) & Mixed Content Immunity**:
   Modern Chromium browsers block HTTPS pages (`https://...`) from fetching raw private IP addresses (`http://192.0.2.71:8082`) due to Mixed Content / PNA security restrictions. However, browsers treat `http://127.0.0.1` (localhost) as a **secure context**, allowing direct communication with 0 blocks.
2. **True Byte-by-Byte SSE Token Streaming**:
   The relay forwards Server-Sent Events (`text/event-stream`) in real time, delivering token-by-token generation in Chan Chat with virtually 0 latency penalty (~1-3ms across Wi-Fi).
3. **Resilience & Fault Shielding**:
   If G7 goes to sleep, the relay returns clear diagnostic JSON messages instead of causing browser timeouts.

---

## 4. Deployment Instructions

### On G7 Laptop (Ramses)
Run the Colibrì MoE server (already listening on `0.0.0.0:8082`):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-colibri-daemon.ps1 -DevMock
```

### On Second Laptop (`192.0.2.67`)
**Option A: 1-Click Batch File**
Double-click:
```
scripts\deploy-second-relay.bat
```

**Option B: PowerShell Launcher**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-colibri-relay.ps1 -Upstream "http://192.0.2.71:8082" -Port 8082
```

### On Ramses iPhone (`192.0.2.100`)
1. Connect to the same G7 Wi-Fi network.
2. Open Safari and navigate to: `https://192.0.2.71:1001/onyx.mx/` (accept self-signed dev certificate).
3. In Studio Settings > **AI & Local Intelligence**, verify endpoint is set to `http://192.0.2.71:8082` and tap **Test Connection**.

---

## 5. Testing & Verification

1. **Verify G7 Server**:
   ```powershell
   Invoke-RestMethod -Uri "http://192.0.2.71:8082/health"
   ```
2. **Verify Second Relay**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8082/health"
   ```
3. **Check Relay Diagnostics**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8082/relay-health"
   ```
