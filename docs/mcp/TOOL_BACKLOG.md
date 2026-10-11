# Onyx.mx MCP Tool Backlog

This document outlines read-only data tools for the Onyx agent and Siri adapter, covering devices, logistics, type library, document jobs, audit trail, and the season 826 finance ledger. Note that 3 of the 8 tools are already implemented (`devices_onyxchan_telemetry`, `audit_trail_recent_calls`, `document_jobs_check_status`).

## Priority 1 (P1)

### 1. devices_onyxchan_telemetry
**Purpose:** Retrieve battery, RSSI, and online status of OnyxChan robots.
**Input Fields:** `device_id` (string, optional, max 50 chars), `limit` (int, 1-100, default 20).
**Tables and Columns:** `onyxchan_devices` (`create_onyxchan_devices.sql` L3-12 and `20260830234500_device_auth_per_device_tokens.sql` L23-26). Columns: `device_id` (`create_onyxchan_devices.sql` L4), `device_name` (`create_onyxchan_devices.sql` L7), `status` (`create_onyxchan_devices.sql` L9), `battery_level` (`20260830234500_device_auth_per_device_tokens.sql` L24), `rssi` (`20260830234500_device_auth_per_device_tokens.sql` L25).
**Roles Allowed:** `DEVICE_TELEMETRY_ROLES` (`Developer`, `Admin`, `ClientBoss`, `ClientAccounting`)
**Redaction Rules:** None (no cost columns present).
**Risk:** Read only.
**Safe for Siri:** Yes (purely hardware telemetry, no financial data).
**Answer Shape:**
```json
{
  "devices": [
    { "device_id": "onyxchan-01", "device_name": "OnyxChan 1", "status": "online", "battery_level": 92, "rssi": -55 }
  ]
}
```
**Test Cases:**
- Role: Developer, Input: `{}`, Expected: Returns all registered OnyxChan devices with battery and RSSI.
- Role: ClientViewer, Input: `{}`, Expected: Returns 403 Forbidden (requires DEVICE_TELEMETRY_ROLES).
- Role: Admin, Input: `{ "device_id": "onyxchan-01" }`, Expected: Returns telemetry for just onyxchan-01.

### 2. audit_trail_recent_calls
**Purpose:** Review recent MCP bridge and Onyx agent invocations for security.
**Input Fields:** `limit` (int, 1-100, default 20), `caller_role` (string, max 20 chars), `outcome` (string, max 20 chars).
**Tables and Columns:** `onyxchan_audit` (`20261010120000_onyxchan_audit.sql` L6-25). Columns: `tool` (L11), `caller_role` (L14), `outcome` (L17), `duration_ms` (L19), `args_summary` (L20).
**Roles Allowed:** `Developer`, `Admin`
**Redaction Rules:** None (no cost columns exposed, restricted to highest roles).
**Risk:** Read only.
**Safe for Siri:** Yes (only accessible to Admin/Developer anyway).
**Answer Shape:**
```json
{
  "audit_logs": [
    { "tool": "inventory_search", "caller_role": "voice", "outcome": "ok", "duration_ms": 120, "args_summary": "..." }
  ]
}
```
**Test Cases:**
- Role: Admin, Input: `{ "limit": 5 }`, Expected: Returns the 5 most recent MCP bridge audit logs.
- Role: ClientBoss, Input: `{}`, Expected: Returns 403 Forbidden (requires Developer or Admin).
- Role: Developer, Input: `{ "outcome": "denied" }`, Expected: Returns only audit logs where the invocation was blocked.

### 3. document_jobs_check_status
**Purpose:** Check the rendering and printing status of document jobs.
**Input Fields:** `season` (string, "826" or "legacy"), `kind` (string, "pdf" | "label" | "xlsx" | "csv"), `limit` (int, 1-100, default 20).
**Tables and Columns:** `document_jobs_current` view (`20261005120000_document_jobs.sql` L64-70). Columns: `job_ref` (`20261005120000_document_jobs.sql` L7), `kind` (L8), `season` (L11), `current_status` (L65), `status_at` (L65).
**Roles Allowed:** `DOC_JOB_ROLES` (`Developer`, `Admin`, `ClientBoss`, `ClientAccounting`)
**Redaction Rules:** None (operational job metadata).
**Risk:** Read only.
**Safe for Siri:** Yes (no financial data).
**Answer Shape:**
```json
{
  "jobs": [
    { "job_ref": "job-123", "kind": "pdf", "season": "826", "current_status": "printed", "status_at": "2026-10-11T12:00:00Z" }
  ]
}
```
**Test Cases:**
- Role: ClientBoss, Input: `{ "season": "826" }`, Expected: Returns recent document jobs for the 826 season.
- Role: Vendor, Input: `{ "kind": "label" }`, Expected: Returns 403 Forbidden (requires DOC_JOB_ROLES).
- Role: Developer, Input: `{ "limit": 1 }`, Expected: Returns exactly 1 document job record.

### 4. finance_826_season_summary
**Purpose:** Retrieve financial totals and disbursements strictly for the 826 season.
**Input Fields:** `vendor_id` (string, optional, max 50 chars).
**Tables and Columns:** `finance_826` (`20260829223345_finance_826_parity_with_legacy_finance.sql` L6-27). Columns: `status` (L8), `vendor_id` (L15), `date` (L7). Columns `amount`, `currency`, `commission` are NOT IN FILES.
**Roles Allowed:** `FINANCE_ROLES`
**Redaction Rules:** Completely restricted to FINANCE_ROLES. No data is returned for other roles.
**Risk:** Read only.
**Safe for Siri:** Only after redaction (the tool must enforce that the caller holds a FINANCE_ROLE before answering; if not, Siri refuses).
**Answer Shape:**
```json
{
  "total_paid_mxn": 15000.50,
  "total_pending_mxn": 5000.00,
  "total_paid_usd": 200.00,
  "total_commission_mxn": 1500.00,
  "currency_breakdown": { "MXN": 20000.50, "USD": 200.00 }
}
```
**Test Cases:**
- Role: Admin, Input: `{}`, Expected: Returns the summarized financial totals for the 826 season.
- Role: ClientAccounting, Input: `{ "vendor_id": "EM" }`, Expected: Returns the 826 financial summary specifically for vendor EM.
- Role: ClientViewer, Input: `{}`, Expected: Returns 403 Forbidden (not in FINANCE_ROLES).

## Priority 2 (P2)

### 5. devices_list_pico_scanners
**Purpose:** View staff handheld scanner hardware and online status.
**Input Fields:** `is_active` (boolean, optional), `limit` (int, 1-100, default 20).
**Tables and Columns:** `pico_devices` (`20260725_pico_bridge_schema.sql` L5-18). Columns: `device_mac` (L7), `device_name` (L8), `hardware_model` (L9), `assigned_role` (L10), `is_active` (L15), `last_seen_at` (L16).
**Roles Allowed:** `INTERNAL_STAFF`
**Redaction Rules:** None.
**Risk:** Read only.
**Safe for Siri:** Yes (hardware and connection status only).
**Answer Shape:**
```json
{
  "scanners": [
    { "device_name": "Scanner 1", "device_mac": "AA:BB:CC:DD:EE:FF", "hardware_model": "M5Stack", "is_active": true, "last_seen_at": "2026-10-10T15:00:00Z" }
  ]
}
```
**Test Cases:**
- Role: Developer, Input: `{}`, Expected: Returns a list of all Pico bridge scanners.
- Role: Admin, Input: `{ "is_active": true }`, Expected: Returns only currently active scanners.
- Role: Vendor, Input: `{}`, Expected: Returns 403 Forbidden (requires INTERNAL_STAFF).

### 6. type_library_list_types
**Purpose:** List available canonical item types and their aliases.
**Input Fields:** `limit` (int, 1-200, default 50).
**Tables and Columns:** `type_library` (`20261011130000_type_library.sql` L9-20). Columns: `type` (L11), `norm_key` (L12), `aliases` (L15).
**Roles Allowed:** `ALL_STAFF`
**Redaction Rules:** None.
**Risk:** Read only.
**Safe for Siri:** Yes.
**Answer Shape:**
```json
{
  "types": [
    { "type": "Sink", "norm_key": "sink", "aliases": ["basin", "washbasin"] }
  ]
}
```
**Test Cases:**
- Role: ClientBoss, Input: `{}`, Expected: Returns a list of saved taxonomy types.
- Role: Vendor, Input: `{ "limit": 10 }`, Expected: Returns up to 10 canonical types.
- Role: ClientViewer, Input: `{}`, Expected: Returns the list successfully.

## Priority 3 (P3)

### 7. type_library_hidden_values
**Purpose:** View attributes intentionally hidden from suggestions, like person names.
**Input Fields:** `limit` (int, 1-100, default 50).
**Tables and Columns:** `attribute_hidden_values` (`20261011130000_type_library.sql` L30-41). Columns: `value` (L32), `norm_key` (L33), `note` (L36).
**Roles Allowed:** `ALL_STAFF`
**Redaction Rules:** None.
**Risk:** Read only.
**Safe for Siri:** Yes.
**Answer Shape:**
```json
{
  "hidden_values": [
    { "value": "Martha", "norm_key": "martha", "note": "person name, hide from suggestions" }
  ]
}
```
**Test Cases:**
- Role: Admin, Input: `{}`, Expected: Returns a list of values hidden from the UI selector.
- Role: Developer, Input: `{ "limit": 5 }`, Expected: Returns 5 hidden values.
- Role: Vendor, Input: `{}`, Expected: Returns the hidden values successfully.

### 8. logistics_get_shipment_status
**Purpose:** Get the current delivery status and tracking details of a shipping manifest.
**Input Fields:** `manifest_id` (string, max 100 chars).
**Tables and Columns:** `shipments` (`20260830222232_repair_role_resolution_and_close_shipments.sql` L84-100). Columns: `manifest_id` (`20261005120000_document_jobs.sql` L13). Columns `status`, `sender_name`, `seal_number` are NOT IN FILES.
**Roles Allowed:** `ALL_STAFF`
**Redaction Rules:** None.
**Risk:** Read only.
**Safe for Siri:** Yes (logistics progress contains no cost data).
**Answer Shape:**
```json
{
  "manifest_id": "MAN-2026-001",
  "status": "in_transit",
  "sender_name": "Onyx Warehouse",
  "seal_number": "SEAL-12345"
}
```
**Test Cases:**
- Role: ClientBoss, Input: `{ "manifest_id": "MAN-2026-001" }`, Expected: Returns the logistics tracking status for the manifest.
- Role: ClientViewer, Input: `{ "manifest_id": "MAN-2026-002" }`, Expected: Returns tracking details for MAN-2026-002.
- Role: Developer, Input: `{ "manifest_id": "INVALID" }`, Expected: Returns a "not found" response.

---

## Tool Summary by Priority

| Priority | Tool Name | Area | Status |
| :--- | :--- | :--- | :--- |
| P1 | devices_onyxchan_telemetry | Devices | Implemented (`onyxDataTools.ts:804`) |
| P1 | audit_trail_recent_calls | Audit Trail | Implemented (`auditDocTools.ts:54`) |
| P1 | document_jobs_check_status | Document Jobs | Implemented (`auditDocTools.ts:94`) |
| P1 | finance_826_season_summary | Finance Summaries | Proposed |
| P2 | devices_list_pico_scanners | Devices | Proposed |
| P2 | type_library_list_types | Type Library | Proposed |
| P3 | type_library_hidden_values | Type Library | Proposed |
| P3 | logistics_get_shipment_status | Logistics | Proposed |

## Open Questions for Ramses
1. Should `logistics_get_shipment_status` expose `sender_name` and `seal_number` to all roles, or restrict PII to `INTERNAL_STAFF`?
2. Does `finance_826_season_summary` need explicit support for multiple currency conversions dynamically, or should it rely on the exchange rate in `settings`?
3. Should the audit trail expose full `args_summary` payloads to Admins via Siri, or truncate them to prevent leaking long secrets via voice?

## Unverified Table / Column Facts (NOT IN FILES)
- `finance_826.amount`
- `finance_826.currency`
- `finance_826.commission`
- `logistics_826.*` (except `id` via `document_jobs`)
- `shipments.status`
- `shipments.sender_name`
- `shipments.seal_number`
