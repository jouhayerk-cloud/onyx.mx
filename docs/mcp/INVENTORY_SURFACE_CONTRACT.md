# Inventory Surface Contract

**Document Version:** 1.0.0  
**Effective Date:** 2026-10-05  
**Review Status:** Pending Review by Ramses (Owner)  
**Scope:** Read-only Inventory MCP Tools in `onyxDataTools.ts`, `onyxDataHandlers.ts`, and `onyx-mcp/index.ts`  

---

## 1. Role Sets

The system defines three primary role sets in [`onyxDataTools.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L34-L62):

### 1.1 `ALL_STAFF`
All authenticated internal personnel, external vendor artisans, and client accounts.
- `Developer`
- `Admin`
- `ClientBoss`
- `ClientAccounting`
- `ClientViewer`
- `Vendor`
- `Client`

### 1.2 `INTERNAL_STAFF`
Internal organization staff excluding external vendors and clients.
- `Developer`
- `Admin`
- `ClientBoss`
- `ClientAccounting`
- `ClientViewer`

### 1.3 `FINANCE_ROLES`
Roles authorized to view financial ledgers, acquisition costs, landed multipliers, and cypher codes within the MCP server code.
- `Developer`
- `Admin`
- `ClientBoss`
- `ClientAccounting`

> [!IMPORTANT]
> **Siri / Voice Assistant Binding Rule (owner decision, 2026-10-10):** the Siri inventory adapter has the same finance access as the app. Money is shown to `FINANCE_ROLES` (`Developer`, `Admin`, `ClientBoss`, `ClientAccounting`); every other role gets all `COST_COLUMNS` stripped.

---

## 2. Inventory Tools Specification

The following table documents all 10 `inventory_*` tools declared in [`onyxDataTools.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L78-L310) and implemented in [`onyxDataHandlers.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L148-L664).

| Tool Name | One-line Purpose | Input Fields | Roles Allowed | Returned Fields (Finance Role) | Returned Fields (Non-Finance Role) | Safe for Siri? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `inventory_search` | Search and filter warehouse inventory records with pagination. | `query` (string), `vendor_id` (string), `status` (string), `material` (string), `shape` (string), `workbook` (string), `limit` (int, default 20), `offset` (int, default 0) | `ALL_STAFF` | `items` (full inventory columns including `COST_COLUMNS`), `total_count`, `offset`, `limit`, `has_more` | `items` (`COST_COLUMNS` redacted via `stripCostColumns`), `total_count`, `offset`, `limit`, `has_more` | **Only after redaction** (Contains cost columns unless caller is Developer/Admin; must strip before speaking/displaying) |
| `inventory_get_item` | Retrieve comprehensive item record by UUID or item tag. | `id` (string), `item_id` (string) | `ALL_STAFF` | All inventory table columns (dimensions, weight, status, media, and unredacted `COST_COLUMNS`) | All inventory table columns with `COST_COLUMNS` stripped (`price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, `book_land_code` removed) | **Only after redaction** (Must strip cost columns for every role outside `FINANCE_ROLES`) |
| `inventory_get_by_barcode` | Resolve a scanned barcode tag or item code to an inventory record. | `barcode` (string, required) | `ALL_STAFF` | Full inventory record matching barcode or item ID, including `COST_COLUMNS` | Inventory record with `COST_COLUMNS` stripped via `stripCostColumns` | **Only after redaction** (Contains cost columns unless caller is Developer/Admin; must strip) |
| `inventory_list_by_crate` | List all inventory items packed in a logistics crate or container. | `crate_id` (string, required), `limit` (int, default 50) | `INTERNAL_STAFF` | `crate_id`, `items` (all inventory columns including `COST_COLUMNS`), `total_count`, `offset`, `limit`, `has_more` | `crate_id`, `items` (`COST_COLUMNS` stripped via `stripCostColumns`), `total_count`, `offset`, `limit`, `has_more` | **Only after redaction** (Internal staff tool; must redact costs for non-Developer/Admin callers) |
| `inventory_list_by_vendor` | List inventory items belonging to a specific vendor prefix. | `vendor_id` (string, required), `status` (string), `limit` (int, default 50), `offset` (int, default 0) | `ALL_STAFF` | `vendor_id`, `items` (all inventory columns including `COST_COLUMNS`), `total_count`, `offset`, `limit`, `has_more` | `vendor_id`, `items` (`COST_COLUMNS` stripped via `stripCostColumns`), `total_count`, `offset`, `limit`, `has_more` | **Only after redaction** (Must redact costs for non-Developer/Admin callers) |
| `inventory_count_by_status` | Count inventory items and aggregate piece quantities grouped by lifecycle status. | `vendor_id` (string), `workbook` (string) | `ALL_STAFF` | `by_status` (map of status to `{ items, quantity }`), `total_items`, `total_quantity` | `by_status` (map of status to `{ items, quantity }`), `total_items`, `total_quantity` | **Yes** (Contains only item counts and piece quantities; zero financial/cost data) |
| `inventory_count_by_vendor` | Count inventory items and aggregate quantities grouped by vendor prefix. | `status` (string), `workbook` (string) | `INTERNAL_STAFF` | `by_vendor` (map of vendor prefix to `{ items, quantity }`), `total_items`, `total_quantity` | `by_vendor` (map of vendor prefix to `{ items, quantity }`), `total_items`, `total_quantity` | **Yes** (Contains only item counts and piece quantities; zero financial/cost data) |
| `inventory_get_pricing` | Retrieve item pricing, acquisition, landed cost, retail price, and cyphers. | `id` (string, required) | `FINANCE_ROLES` in code manifest; handler allows any role but branches payload | `id`, `item_id`, `book_barcode`, `price_mxn`, `book_acquisition`, `book_landed`, `book_retail`, `book_aq_code`, `book_land_code`, `exchange_rate` | `id`, `item_id`, `book_barcode`, `book_retail`, `retail_usd` | **Only for `FINANCE_ROLES`** (exposes cost cyphers and acquisition numbers; a caller outside `FINANCE_ROLES` must never receive acquisition or landed costs through Siri) |
| `inventory_get_media` | Retrieve photography assets, cutout PNGs, SVG contours, and Drive IDs. | `id` (string, required) | `ALL_STAFF` | `id`, `item_id`, `book_barcode`, `media_urls`, `image_urls`, `drive_ids`, `generated_png_url`, `generated_svg_url`, `axo_icon_url` | Same as finance role (`id`, `item_id`, `book_barcode`, `media_urls`, `image_urls`, `drive_ids`, `generated_png_url`, `generated_svg_url`, `axo_icon_url`) | **Yes** (Pure media URLs and asset identifiers; zero cost information) |
| `inventory_get_segmentation` | Retrieve AI vision 2D polygon contours and vector segmentation payloads. | `item_id` (string, required), `angle_index` (int) | `INTERNAL_STAFF` | `item_id`, `segmentations` (rows from `item_segmentation`), `count` | Same as finance role (`item_id`, `segmentations`, `count`) | **Yes** (Pure geometric points, SVG paths, and image dimension metadata; zero cost information) |

---

## 3. Cost Redaction Architecture

### 3.1 `COST_COLUMNS`
Declared in [`onyxDataTools.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L67-L73):
```typescript
export const COST_COLUMNS: string[] = [
  "price_mxn",
  "book_acquisition",
  "book_landed",
  "book_aq_code",
  "book_land_code",
];
```

### 3.2 `stripCostColumns` Implementation
Defined in [`onyxDataHandlers.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L44-L57):
```typescript
function stripCostColumns<T>(data: T): T {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((item) => stripCostColumns(item)) as unknown as T;
  }
  if (typeof data === "object") {
    const clone: Record<string, any> = { ...(data as Record<string, any>) };
    for (const col of COST_COLUMNS) {
      delete clone[col];
    }
    return clone as T;
  }
  return data;
}
```

### 3.3 Application Points
Cost stripping is evaluated in application code over the service role client. The handler checks:
```typescript
const isFinance = FINANCE_ROLES.includes(effectiveCaller.role);
```
When `!isFinance`, `stripCostColumns` is applied at:
1. `inventory_search`: [`onyxDataHandlers.ts:187-189`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L187-L189)
2. `inventory_get_item`: [`onyxDataHandlers.ts:235`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L235)
3. `inventory_get_by_barcode`: [`onyxDataHandlers.ts:270`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L270)
4. `inventory_list_by_crate`: [`onyxDataHandlers.ts:298-300`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L298-L300)
5. `inventory_list_by_vendor`: [`onyxDataHandlers.ts:342-344`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L342-L344)
6. `display_item_card`: [`onyxDataHandlers.ts:1455`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L1455)

In `inventory_get_pricing` ([`onyxDataHandlers.ts:482-494`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L482-L494)), non-finance callers receive an explicit allowlist object containing only `id`, `item_id`, `book_barcode`, `book_retail`, and `retail_usd`.

---

## 4. Findings: Potential Money Leaks to Non-Finance Callers

Every inventory tool and relevant display tool was audited for leaks of cost, price, or derived money data:

1. **`inventory_get_pricing` Manifest Role vs Handler Branch Discrepancy**  
   - **Files & Lines:** [`onyxDataTools.ts:271`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L271) vs [`onyxDataHandlers.ts:482-494`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L482-L494)  
   - **Issue:** In the tool manifest, `inventory_get_pricing.requiredRoles` is set to `FINANCE_ROLES`. As a result, non-finance roles are blocked at the gateway with an RBAC 403 / `-32000` permission error ([`onyxDataHandlers.ts:130-140`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L130-L140) and [`onyx-mcp/index.ts:262-272`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/onyx-mcp/index.ts#L262-L272)). However, line 482 of `onyxDataHandlers.ts` contains code explicitly handling `if (!isFinance)` returning `book_retail` and `retail_usd`. Because `requiredRoles` blocks non-finance users from calling the tool at all, non-finance callers cannot query `book_retail` unless their role is added to `requiredRoles` or they use `display_item_card`.

2. **Retail Price Calculation Leaks Acquisition Cost via Fixed Multiplier Math**  
   - **Files & Lines:** [`onyxDataHandlers.ts:69-76`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L69-L76), [`onyxDataHandlers.ts:477-479`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L477-L479), and [`onyxDataHandlers.ts:1387-1389`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L1387-L1389)  
   - **Issue:** When `book_retail` is `null` in the database, `calculateRetailUsd` derives retail as `round(round(round(costMxn / rate) * 1.4) * 12)`. Because the exchange rate is public via `system_get_exchange_rate` (or defaulted to 17.0) and the multiplier `1.4 * 12 = 16.8` is deterministic, any caller receiving `book_retail` / `retail_usd` can reverse-engineer `price_mxn` (and `book_acquisition` / `book_landed`) by dividing the retail price by 16.8 and multiplying by the exchange rate.

3. **`book_retail` Exemption in `COST_COLUMNS`**  
   - **Files & Lines:** [`onyxDataTools.ts:67-73`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L67-L73) and [`onyxDataHandlers.ts:44-57`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L44-L57)  
   - **Issue:** `COST_COLUMNS` strips `price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, and `book_land_code`, but intentionally leaves `book_retail`. While retail is intended for customer-facing display, in combination with Finding #2, it exposes the raw acquisition basis whenever `book_retail` is algorithmically generated.

4. **Service Role Default Escalation Bypasses Redaction**  
   - **Files & Lines:** [`onyxDataHandlers.ts:117-119`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L117-L119)  
   - **Issue:** If `caller` is omitted or `caller.isServiceRole` is true, `executeOnyxDataTool` automatically assigns `{ role: "Developer", isServiceRole: true }`. Any internal function or bridge invoking `executeOnyxDataTool` without explicitly passing the end-user's resolved role will automatically execute as `Developer`, returning full unredacted costs.

5. **`inventory_get_media` and `inventory_get_segmentation` Leak Check**  
   - **Files & Lines:** [`onyxDataHandlers.ts:524-603`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L524-L603), [`onyxDataHandlers.ts:606-664`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L606-L664)  
   - **Audit Result:** Checked each tool. Neither tool queries or projects monetary columns. `inventory_get_media` selects an explicit column list (`id, item_id, book_barcode, vendor_id, media_urls, processed_media_urls, generated_png_url, generated_svg_url, generated_image_urls, axo_icon_url`), and `item_segmentation` contains strictly vector polygon arrays. No money leaks found here.

6. **`inventory_count_by_status` and `inventory_count_by_vendor` Leak Check**  
   - **Files & Lines:** [`onyxDataHandlers.ts:363-401`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L363-L401), [`onyxDataHandlers.ts:404-444`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataHandlers.ts#L404-L444)  
   - **Audit Result:** Checked each tool. Selects only `status, quantity` and `vendor_id, item_id, quantity`. Totals represent physical item count and unit volume. No money leaks found here.

---

## 5. Siri Adapter Architecture & Voice Access Rules

### 5.1 Owner Rule (decided 2026-10-10)
Money values (acquisition costs, landed costs, retail pricing, cypher codes, monetary totals) may be disclosed through Siri to the same roles as in the app, `FINANCE_ROLES`:
- `Developer`
- `Admin`
- `ClientBoss`
- `ClientAccounting`

### 5.2 `FINANCE_ROLES` is the Siri list
In [`onyxDataTools.ts:34-39`](file:///C:/Jouhayerk/git/onyxchan-wt/MCP1-B/supabase/functions/_shared/onyxDataTools.ts#L34-L39), `FINANCE_ROLES` is defined as:
```typescript
export const FINANCE_ROLES: string[] = [
  "Developer",
  "Admin",
  "ClientBoss",
  "ClientAccounting",
];
```
The adapter reuses this constant, so the app and Siri cannot drift apart. Every other role (for example `ClientViewer`) never receives a money value through Siri.

### 5.3 Requirements for the `siri-inventory` Adapter
1. **Role Gate:** import `FINANCE_ROLES` from `_shared/onyxDataTools.ts` and use it as the only list (no separate Siri list):
   ```typescript
   const SIRI_FINANCE_ROLES: string[] = FINANCE_ROLES;
   ```
2. **Pre-Response Sanitization:** When calling `inventory_get_item`, `inventory_search`, `inventory_get_by_barcode`, `inventory_list_by_crate`, or `inventory_list_by_vendor`, the Siri adapter must verify whether `caller.role` is in `FINANCE_ROLES`. If not, all `COST_COLUMNS` must be omitted from spoken responses and payload summaries.
3. **Explicit Pricing Gate:** If a caller outside `FINANCE_ROLES` asks Siri for cost, acquisition, or pricing, Siri must respond with an authorization refusal rather than passing the query to `inventory_get_pricing`.
4. **Never Trust Client Parameters:** The role check must always be derived from the verified Supabase JWT via `app_users`, never from request parameters.

---

## 6. Deno Automated Test Cases

The following 5 test cases validate RBAC, cost redaction, and tenant scoping across the inventory tools:

### Test Case 1: `inventory_get_item` Cost Redaction for `Vendor` Role
- **Caller Role:** `Vendor` (`vendorPrefix: "EM"`)
- **Tool:** `inventory_get_item`
- **Input:** `{ "item_id": "EM-0042" }`
- **Expected Shape / Verification:**
  - `status: 200`
  - Result object contains `id`, `item_id`, `material`, `shape`, `dimensions`, `weight_kg`.
  - Properties `price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, `book_land_code` are **`undefined`** (stripped by `stripCostColumns`).
  - Item's `vendor_id` must match `"EM"`.

### Test Case 2: `inventory_get_item` Full Pricing for `Developer` Role
- **Caller Role:** `Developer`
- **Tool:** `inventory_get_item`
- **Input:** `{ "item_id": "EM-0042" }`
- **Expected Shape / Verification:**
  - `status: 200`
  - Result object contains `price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, `book_land_code`.
  - No columns stripped.

### Test Case 3: `inventory_list_by_crate` Authorization Failure for `Client` Role
- **Caller Role:** `Client`
- **Tool:** `inventory_list_by_crate`
- **Input:** `{ "crate_id": "CRATE-001" }`
- **Expected Shape / Verification:**
  - `status: 403` or JSON-RPC error code `-32000` (`isError: true`).
  - Error message specifies forbidden access: requires `INTERNAL_STAFF` (`Developer, Admin, ClientBoss, ClientAccounting, ClientViewer`).

### Test Case 4: `inventory_search` Scoping and Redaction for `ClientViewer` Role
- **Caller Role:** `ClientViewer`
- **Tool:** `inventory_search`
- **Input:** `{ "query": "fluorite", "limit": 5 }`
- **Expected Shape / Verification:**
  - `status: 200`
  - Result contains `{ items: Array, total_count: number, offset: number, limit: 5, has_more: boolean }`.
  - Every object in `items` array has `price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, and `book_land_code` omitted.

### Test Case 5: Siri refuses pricing for a role outside `FINANCE_ROLES`
- **Caller Role:** `ClientViewer` (not in `FINANCE_ROLES`)
- **Tool / Adapter:** Siri Inventory Adapter
- **Input:** `{ "intent": "item", "query": "EM-0042 price", "lang": "en" }`
- **Expected Shape / Verification:**
  - `ok: true`, `spoken_text` is the polite refusal (finance roles only), `fields` is empty, no amount appears anywhere in the response.
  - The same request from `ClientBoss` or `ClientAccounting` returns the price (same access as `Admin`).

