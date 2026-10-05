---
name: OnyxMX-DatabasePricing
description: "Onyx.mx Supabase schema, seasons (826 / v326 / v825), RxDB-Supabase sync, pricing formulas, cost cypher, barcodes, exchange rate (default 17). Use for SQL, migrations, RLS, pricing or sync bugs."
---

# OnyxMX Database & Pricing Sub-Skill

> **Domain**: Supabase Schema, Pricing Engine, Data Sync  
> **Key Files**: `src/lib/database.ts`, `src/lib/utils.tsx`, `src/lib/syncEngine.ts`, `src/lib/supabase.ts`

---

## 1. Complete Database Schema

### 1.1 `inventory` — Master Product Table (~35 columns)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique record identifier |
| `item_id` | TEXT | Vendor-prefixed item code (e.g., `EM-001`) |
| `item_number` | INT | Sequential item number within vendor |
| `vendor_id` | TEXT | Extracted vendor prefix (e.g., `EM`, `CA`, `JM`) |
| `workbook` | TEXT | Workbook partition (`v326` = active, `v825` = archive) |
| `status` | TEXT | Lifecycle status (dynamically computed via `getStatusClass`) |
| `shape` | TEXT | Physical shape classification |
| `material` | TEXT | Material type (Onyx, Marble, etc.) |
| `color` | TEXT | Raw color string |
| `description` | TEXT | Base description |
| `short_description` | TEXT | AI-generated single-sentence description |
| `generated_description` | TEXT | AI bullet-point description |
| `detailed_description` | TEXT | AI marketing HTML copy (1000-1200 chars) |
| `generated_color` | TEXT | AI-classified color(s) from Shopify palette |
| `generated_type` | TEXT | AI-classified Shopify product taxonomy |
| `price_mxn` | NUMERIC | Vendor price in Mexican Pesos |
| `book_acquisition` | NUMERIC | Calculated: `price_mxn / exchangeRate` (USD) |
| `book_landed` | NUMERIC | Calculated: `acquisition * 1.4` (USD) |
| `book_retail` | NUMERIC | Calculated: `landed * 12` (USD) |
| `book_barcode` | TEXT | Deterministic barcode (vendor+workbook+seq+cypher) |
| `book_aq_code` | TEXT | Acquisition cost cypher code |
| `book_land_code` | TEXT | Landed cost cypher code |
| `quantity` | INT | Item count |
| `weight_kg` | NUMERIC | Weight in kilograms |
| `height_cm` | NUMERIC | Height in centimeters |
| `width_cm` | NUMERIC | Width in centimeters |
| `length_cm` | NUMERIC | Length/depth in centimeters |
| `media_urls` | JSONB | Array of media (image/video) URLs |
| `image_urls` | JSONB | Legacy image URL array |
| `drive_ids` | JSONB | Google Drive file IDs |
| `spatial_boxes_2d` | JSONB | AI-detected 2D bounding boxes |
| `spatial_masks` | JSONB | AI segmentation masks |
| `spatial_boxes_3d` | JSONB | 3D bounding volumes |
| `crate_id` | TEXT | Assigned shipping crate |
| `invoice_id` | TEXT | Linked invoice reference |
| `pay_req` | TEXT | Payment request status |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification timestamp |

### 1.2 `finance` — Payment & Expense Tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Payment record ID |
| `amount` | NUMERIC | Payment amount |
| `currency` | TEXT | Currency code (default: `MXN`) |
| `type` | TEXT | `Merchandise` or `Operations` |
| `category` | TEXT | `Acq`, `Prod`, `Sppl`, `Labr`, `Packing`, `Oprt`, `Monthly` |
| `subcategory` | TEXT | Sub-classification |
| `payment_method` | TEXT | Method of payment |
| `bank_account` | TEXT | Source account (`BoA_Employee`, `BBVA_Martha`, `BBVA_Ramses`) |
| `commission` | NUMERIC | Transaction fee/commission |
| `exchange_rate` | NUMERIC | MXN/USD rate at time of payment |
| `related_ids` | JSONB | Linked inventory item IDs |
| `created_at` | TIMESTAMPTZ | Payment date |

### 1.3 `logistics` — Shipping & Crate Management

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Logistics record ID |
| `type` | TEXT | Container type (`Crate`, `Pallet`) |
| `vendors` | JSONB | Vendor origins for contents |
| `truck_id` | TEXT | Assigned truck identifier |
| `customs_status` | TEXT | Customs clearance status |
| `freight_cost` | NUMERIC | Shipping cost |
| `tracking_number` | TEXT | Carrier tracking number |
| `inventory_ids` | JSONB | Array of contained item IDs |
| `dimensions` | JSONB | Crate physical dimensions |
| `weight` | NUMERIC | Total crate weight |

### 1.4 `production` — Manufacturing Progress

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Production record ID |
| `vendor_id` | TEXT | Manufacturing vendor |
| `progress` | NUMERIC | Completion percentage |
| `stage` | TEXT | Current production stage |
| `price_unit` | NUMERIC | Unit price for production |
| `ready_date` | DATE | Expected completion date |

### 1.5 `app_users` — User & Role Management

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | User ID (linked to Supabase Auth) |
| `email` | TEXT | User email |
| `role` | TEXT | `Developer`, `Admin`, `ClientBoss`, `ClientAccounting`, `ClientViewer`, `Vendor` |
| `active` | BOOLEAN | Account active status |

### 1.6 `settings` — Key-Value Configuration

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT (PK) | Setting name (e.g., `exchange_rate`) |
| `value` | JSONB | Setting value |

---

## 2. RLS (Row-Level Security) Policies

| Table | Policy | Implementation |
|-------|--------|---------------|
| `inventory` | **Permissive** | `USING (true) WITH CHECK (true)` — open during migration |
| `finance` | **Permissive** | Same as above |
| `production` | **Permissive** | Same as above |
| `logistics` | **Permissive** | Same as above |
| `app_users` | **Restrictive** | Helper function `public.get_my_app_role()` (SECURITY DEFINER). Users read/update own row; Admin/Dev CRUD all. |
| `settings` | **Restrictive** | Any authenticated user can read; Admin/Dev write. |

> **WARNING**: Core business tables need RLS hardening before production.

---

## 3. Pricing Calculations

### 3.1 Core Formula
Located in [`src/lib/utils.tsx`](file:///c:/Jouhayerk/git/app/src/lib/utils.tsx) → `calculateCodesAndPrices()`:

```typescript
// Step 1: Acquisition Cost (MXN → USD conversion)
const costUsd = round2(costMxn / exchangeRate);

// Step 2: Landed Cost (+40% for customs, tariffs, freight)
const landedCost = round2(costUsd * 1.4);

// Step 3: Retail Price (12× markup on landed cost)
const retailPrice = round2(landedCost * 12);
```

### 3.2 Cypher Encoding
- Cypher string: **`DMOXHELFAN`** (digit 0→D, 1→M, 2→O, 3→X, etc.)
- Function: `numberToCypher(value)` converts dollar amounts to letter codes
- Stored in: `book_aq_code` (acquisition), `book_land_code` (landed)
- Purpose: Price concealment on physical product labels

### 3.3 Barcode Generation
Formula: `vendor_prefix + workbook_number + item_sequence + cypher_string`
- Generated deterministically in `artifactUtils.ts` → barcode calculation
- Supports exact match, legacy UUID, and regex pattern resolution

### 3.4 Exchange Rate
- Stored in `settings` table as key `exchange_rate`
- Exposed via `exchangeRateAtom` (Jotai)
- Typical range: 17-18 MXN/USD
- Workbook v326 reads from `data[1][1]`, legacy v825 from `data[10][3]`

### 3.5 Syncing Calculated Fields
- `syncAllCalculatedFieldsToDB()` recalculates all pricing for existing records
- Triggered when exchange rate changes or bulk recalculation needed

---

## 4. Data Sync Architecture (Offline-First)

### 4.1 Write Path (`syncUtils.ts` → `syncWrite`)
```
User Action → RxDB.upsert (local) → Online? 
  → YES: Supabase.upsert (remote)
  → NO:  enqueueChange → ChangeQueue (localStorage)
```

### 4.2 Reconnection (`syncEngine.ts` → `useSyncEngine`)
- Listens to browser `online`/`offline` events
- **Push**: `flushQueue()` replays all pending mutations to Supabase in order
- **Pull**: `deltaPull()` fetches records where `updated_at >= LAST_SYNC_KEY`
- Merges remote records back into local RxDB

### 4.3 Conflict Resolution (`conflictResolver.ts`)
- Strategy: **Last-Write-Wins (LWW)**
- Compares `updated_at` timestamps
- Remote record overwrites local if strictly newer
- Otherwise local state preserved

### 4.4 Initial Hydration (`database.ts`)
- `pullReplication()` does paginated sync: 1000 records per page
- Chunked upserts into RxDB
- Priority-ordered table sync sequence

### 4.5 Key State Atoms
- `LAST_SYNC_KEY`: `onyx_last_synced_at` — localStorage timestamp
- `exchangeRateAtom`: Live exchange rate from settings table

---

## 5. Common Modification Patterns

### Modifying Pricing Formula
1. Edit `calculateCodesAndPrices()` in `src/lib/utils.tsx`
2. Update multipliers (currently 1.4 for landed, 12 for retail)
3. Run `syncAllCalculatedFieldsToDB()` to recalculate existing records

### Adding a New Database Column
1. Create SQL migration (ALTER TABLE)
2. Run migration in Supabase Dashboard or via CLI
3. Update `InventoryItemData` interface in `src/lib/Types.tsx`
4. Update RxDB schema in `src/lib/database.ts`
5. Update `normalizeInventoryData()` in `src/lib/utils.tsx`

### Hardening RLS Policies
1. Create SECURITY DEFINER helper functions
2. Replace `USING (true)` with role-based predicates
3. Test with different user roles
4. Update in `supabase_rls_fix.sql`
