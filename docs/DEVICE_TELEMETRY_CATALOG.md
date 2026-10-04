# Device Telemetry Catalog

## Current Telemetry Fields (Per Device)

| Field | Unit | Range | Source |
|---|---|---|---|
| battery_pct | % | 0 - 100 | telemetry (check-in / event) |
| rssi_dbm | dBm | -100 - 0 | telemetry (check-in / event) |
| uptime_s | s | 0+ | telemetry (check-in / event) |
| free_heap_bytes | bytes | 0+ | telemetry (check-in / event) |
| free_psram_bytes | bytes | 0+ | telemetry (check-in / event) |
| offline_queue_len | count | 0+ | telemetry (check-in / event) |
| charging | boolean | true/false | telemetry (check-in / event) |
| accessories | array | string[] | telemetry (check-in / event) |

## Gap List (Fields not currently in firmware/contract)

* expression (string)
* head_pan_deg (number)
* head_tilt_deg (number)
* screen (string: idle, scan, item, packing, offline, unknown)
* last_scan (string)
* scanner (string: none, ready, error)
* nfc (string: none, ready, error)
* mic_level (number)
* volume (number)
* vbat_mv (number)
* charge_ma (number)
* chip_temp_c (number)
* wifi_ssid_hash (string)

## Proposal: Adding `extra` to Telemetry Data

To add the missing hardware telemetry, we propose extending the `telemetry_data` schema with an optional `extra` object.

### Schema Updates
In `reference/contract/event.schema.json` under `telemetry_data`:

```json
"extra": {
  "type": "object",
  "properties": {
    "expression": { "type": "string", "maxLength": 32 },
    "head_pan_deg": { "type": "integer", "minimum": -180, "maximum": 180 },
    "head_tilt_deg": { "type": "integer", "minimum": -90, "maximum": 90 },
    "screen": { "enum": ["idle", "scan", "item", "packing", "offline", "unknown"] },
    "last_scan": { "type": "string", "maxLength": 256 },
    "scanner": { "enum": ["none", "ready", "error"] },
    "nfc": { "enum": ["none", "ready", "error"] },
    "mic_level": { "type": "integer", "minimum": 0, "maximum": 255 },
    "volume": { "type": "integer", "minimum": 0, "maximum": 100 },
    "vbat_mv": { "type": "integer", "minimum": 3000, "maximum": 4500 },
    "charge_ma": { "type": "integer", "minimum": 0, "maximum": 2000 },
    "chip_temp_c": { "type": "integer", "minimum": -40, "maximum": 125 },
    "wifi_ssid_hash": { "type": "string", "maxLength": 64 }
  },
  "additionalProperties": false
}
```

### Database Updates
Add a JSONB column `extra` to `onyxchan_device_state` (if not already handled by a generic catch-all) or ensure the check-in processor parses and writes the `extra` block to a corresponding JSONB `extra` column.

### Firmware Cost
Assuming 3-4 active values at a time per check-in (e.g., `vbat_mv`, `chip_temp_c`, `screen`, `mic_level`), the JSON payload would increase by approximately **80-120 bytes** per check-in. The maximum payload with all fields populated would be around **250-300 bytes**.
