---
name: OnyxMX-AdminFinanceLogistics
description: "Onyx.mx admin (users, roles), finance (payments, expenses, bank accounts), warehouse crates and pallets, trucking, dashboards. Use when working in those modules."
---

# OnyxMX Admin, Finance & Logistics Sub-Skill

> **Domain**: Admin Panel, Payments, Warehouse, Trucking, Dashboard  
> **Key Files**: `src/features/control/`, `src/features/finance/`, `src/features/logistics/`, `src/features/dashboard/`, `src/lib/paymentConfig.ts`

---

## 1. Admin Module (`features/control/`)

### 1.1 User Registry ([`UserRegistryPanel.tsx`](file:///c:/Jouhayerk/git/app/src/features/control/UserRegistryPanel.tsx))
- CRUD operations on `app_users` table
- Role management with 6 access levels:

| Role | Description | Permissions |
|------|------------|-------------|
| `Developer` | Full system access | All CRUD + system overrides |
| `Admin` | Administrative access | All CRUD, no system overrides |
| `ClientBoss` | Client owner | Read all, manage own data |
| `ClientAccounting` | Client accounting | Financial views, payment tracking |
| `ClientViewer` | Client read-only | View inventory and catalogs |
| `Vendor` | Supplier access | View/update own production |

- Role toggling and active status modification
- Email invite system for new users

### 1.2 Database Stats Panel ([`DatabaseStatsPanel.tsx`](file:///c:/Jouhayerk/git/app/src/features/control/DatabaseStatsPanel.tsx))
- Real-time inventory metrics monitoring
- Pending record expungement tracking
- **System Core Override** (Developer-only):
  - Wipe local IndexedDB caches
  - Hard reset remote cloud tables
  - Force full re-sync from Supabase

### 1.3 Store Settings ([`StoreSettingsPanel.tsx`](file:///c:/Jouhayerk/git/app/src/features/control/StoreSettingsPanel.tsx))
- Per-user catalog access management
- Custom branding configuration (logos, themes)
- Store catalog visibility controls

---

## 2. Finance Module (`features/finance/`)

### 2.1 Payment Wizard

[`TrackingPaymentsView.tsx`](file:///c:/Jouhayerk/git/app/src/features/finance/TrackingPaymentsView.tsx) + `AddPaymentModal`

Multi-step payment creation flow:

```
Step 1: Select Vendor
Step 2: Enter Amount (MXN or USD)
Step 3: Select Source Account
Step 4: Apply Adjustments (IVA, Commission)
Step 5: Sync to finance table
Step 6: Update inventory pay_req statuses
```

### 2.2 Payment Classifications

| Type | Categories | Description |
|------|-----------|-------------|
| **Merchandise** | `Acq` (Acquisition) | Direct product purchases from vendors |
| | `Prod` (Production) | Manufacturing/production costs |
| **Operations** | `Sppl` (Supplies) | Operational supplies |
| | `Labr` (Labor) | Labor costs |
| | `Packing` | Packing materials and labor |
| | `Oprt` (Operations) | General operational expenses |
| | `Monthly` | Recurring monthly costs |

### 2.3 Payment Destinations ([`paymentConfig.ts`](file:///c:/Jouhayerk/git/app/src/lib/paymentConfig.ts))

| Account | Description | Commission Logic |
|---------|-------------|-----------------|
| `BoA_Employee` | Bank of America Employee | Encoded fee structure |
| `BBVA_Martha` | BBVA Martha account | Encoded fee structure |
| `BBVA_Ramses` | BBVA Ramses account | Encoded fee structure |

### 2.4 Payment → Inventory Link
- Payment records in `finance` table link to inventory via `related_ids` (JSONB array)
- Creating a payment updates `pay_req` status on linked `inventory` items
- Status transitions: → "Requested" → "Paid"
- Computed dynamically in `getStatusClass()` in `utils.tsx`

### 2.5 Payment Filtering ([`PaymentsFilterBar.tsx`](file:///c:/Jouhayerk/git/app/src/features/finance/PaymentsFilterBar.tsx))
- Filter by destination account
- Filter by category (Merchandise vs Operations)
- Filter by payment status
- Sort by date, amount, vendor

---

## 3. Warehouse Module (`features/logistics/`)

### 3.1 Crate & Pallet Management

[`CratesInventoryView.tsx`](file:///c:/Jouhayerk/git/app/src/features/logistics/CratesInventoryView.tsx) + [`WarehouseView.tsx`](file:///c:/Jouhayerk/git/app/src/features/logistics/WarehouseView.tsx)

**Nested Container Hierarchy:**
```
Individual Items
  └── Cardboard Boxes
        └── Crates / Pallets
              └── Truck Positions
```

### 3.2 Weight & Dimension Calculation
- `computeCrateWeight()` dynamically sums all contained items
- Validates against `WAREHOUSE_DIMS` or `shippingTruckDimsAtom`
- Checks volumetric/spatial overlap

### 3.3 Visual Wireframes
- 2D SVG wireframe rendering (`CrateWireframe` component)
- Shows fill percentage per crate
- Displays physical dimensions
- Color-coded by vendor origin

---

## 4. Trucking & Logistics Module (`features/logistics/`)

### 4.1 Trailer Load Simulator

[`TruckingModule.tsx`](file:///c:/Jouhayerk/git/app/src/features/logistics/TruckingModule.tsx)

**Truck Bed Dimensions:** 1615cm × 244cm × 279cm

| View | Description |
|------|-------------|
| **TopView** | Bird's-eye crate placement grid |
| **SideView** | Lateral stacking visualization |
| **IsoView** | 3D isometric rendering via Three.js |

### 4.2 Weight Distribution Metrics
- Real-time calculation: Front / Mid / Rear percentages
- Critical for transportation safety compliance
- Updates dynamically as crates are positioned

### 4.3 Crate Positioning
- X/Z coordinate system within simulated trailer footprint
- Crates can be rotated and repositioned
- Snap-to-grid alignment
- Collision detection between containers

### 4.4 Manifest Generation

| Document | Format | Generator | Contents |
|----------|--------|-----------|----------|
| Master Packing List | XLSX | `ExportCratesWizard.tsx` | All crates, items, dimensions |
| Interactive Manifest | HTML | `generatePackingListHtml.ts` | Embedded Three.js 3D simulation |
| PDF Manifesto | PDF | `crateManifesto.ts` | QR codes, isometric thumbnails, metadata |
| Warehouse Picking List | XLSX | `handleExportPackingList` | Per-crate picking order |

### 4.5 Shipment Metadata Fields
- **Seal Number**: Container seal identifier
- **Tractor Number**: Truck tractor identifier
- **Trailer Plates**: Trailer license plates
- **Customs Status**: Clearance tracking
- **Tracking Number**: Carrier tracking
- **Freight Cost**: Shipping charges

> **Note**: No explicit "Certificate of Origin" generation found. May be handled externally.

---

## 5. Dashboard & Analytics (`features/dashboard/`)

### 5.1 Capital Allocation Dashboard

[`AdminDashboard.tsx`](file:///c:/Jouhayerk/git/app/src/features/dashboard/AdminDashboard.tsx)

**ECharts Donut Charts:**
- Paid Acquisitions
- Requested Merchandise
- Pending (outstanding)
- Requested Expenses
- Paid Expenses

All values converted via `exchangeRateAtom` (MXN → USD).

### 5.2 Logistics Accumulation
- Total packed crates/pallets count
- Items per container
- Aggregate weight and volume

### 5.3 Liability Ledger
- Top pending vendors ranked by outstanding amount
- Outstanding item equities by vendor prefix
- Vendor-color coded displays (matching `consts.tsx` vendor colors)

### 5.4 Attribute Clustering Analytics
- Dynamic grouping by **Color + Material** combination
- Dynamic grouping by **Shape + Description** combination
- ECharts bar/donut visualizations
- Real-time data from inventory atoms

---

## 6. Common Modification Patterns

### Adding a New Payment Category
1. Add category to classification in `TrackingPaymentsView.tsx`
2. Update filter options in `PaymentsFilterBar.tsx`
3. Add dashboard aggregation in `AdminDashboard.tsx`

### Adding a New Bank Account/Destination
1. Add entry to payment destinations in `paymentConfig.ts`
2. Define commission logic
3. Add to payment wizard dropdown

### Modifying Truck Dimensions
1. Update dimensions in `TruckingModule.tsx` (currently 1615×244×279 cm)
2. Update `shippingTruckDimsAtom` if used
3. Recalibrate weight distribution zones (Front/Mid/Rear)

### Adding a New Dashboard KPI
1. Add data aggregation logic in `AdminDashboard.tsx`
2. Configure ECharts visualization
3. Ensure proper MXN→USD conversion via `exchangeRateAtom`

### Adding a New User Role
1. Add role to `app_users` table enum
2. Update `UserRegistryPanel.tsx` role options
3. Add RLS policy for new role in `supabase_rls_fix.sql`
4. Update `get_my_app_role()` SECURITY DEFINER function
5. Add conditional rendering in UI components
