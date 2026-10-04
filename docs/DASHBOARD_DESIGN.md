# Dashboard Unification Design

## Overview
This document outlines the design decisions and mapping for merging `AdminDashboard.tsx` and `ClientOverview.tsx` into a single, cohesive `DashboardView.tsx`. The new module is organized around user-centric questions: 'Where do we stand?', 'Where is the money?', 'What do we hold?', and 'Where does it come from?'.

## Decisions

### Module Consolidation
- **Unification**: Extracted the computational logic (`useMemo` blocks) for data like `globalTotals`, `opsBreakdown`, `vendorSummaries`, and `requisitions` into `DashboardView.tsx`, combining the nuanced finance/logistics calculations from both previous modules.
- **Role Gating**: Remained identical; `Admin` and `Developer` roles are required for cost/finance figures, maintaining strict security via the existing guards in `MainAppView.tsx`.

### Section Separation
- **KpiStrip**: 'Where do we stand' - Aggregates high-level metrics (Inventory counts, Finance totals, Outstanding balances, Logistics & Operations Spend).
- **FinanceSummarySection**: 'Where is the money' - Contains the capital allocation donut chart and the active request queue/upcoming payments (formerly in Overview).
- **InventoryStatusSection**: 'What do we hold' - Uses the large wireframe crate visualizations to represent packed vs empty logistics, plus metrics on dimensions.
- **VendorAcquisitionSection**: 'Where does it come from' (Vendors) - Bar and Pie charts for Vendor summaries, detailing the acquisition values per vendor.
- **MaterialBreakdownSection**: 'Where does it come from' (Materials/Shapes) - Categorizes items by color/material and shape/description, shown via pie and pictorial bar charts.
- **ExpenseSection**: Details the `opsBreakdown` (Monthly, Supplies, Labor, Packing, Operations) in a compact layout.
- **DeviceFleetTile**: A new compact tile tracking device fleet telemetry (Online, Stale, Offline) via `useDeviceFleet`.

### Discrepancies & Resolutions
- **`pendingMxn` vs `pendingToRequestMxn`**: 
  - `AdminDashboard` computed `pendingMxn` by summing `rowValue` for items where `payReqStr` is not requested and not paid.
  - `ClientOverview` grouped `pendingItems` into `comingPaymentsByVendor`, tracking percentages paid and calculating `totalPossible` vs `totalPaid`.
  - **Resolution**: Kept BOTH metrics. The `FinanceSummarySection` uses the grouped `comingPaymentsByVendor` for detailed upcoming tables, and the Donut chart uses `pendingMxn` for the aggregate capital liability to remain accurate to the Admin view.
- **`groupedLogistics`**:
  - `AdminDashboard` utilized a highly structured logic to consolidate empty crates vs individual packed ones, rendering `LargeCrateWireframe`.
  - `ClientOverview` just extracted simple counts (packed vs free).
  - **Resolution**: Used the `AdminDashboard` consolidation logic for rendering the `InventoryStatusSection`.

### Omitted Write Actions
- **`handleMarkAsPaid` (ClientOverview.tsx ~Line 488)**: 
  - *Description*: Directly updated the `finance` table (`status: 'Paid'`) and `inventory` table (`pay_req: 'paid %' or 'true'`) in Supabase. Also updated local RxDB docs.
  - *Action*: Omitted from the unified dashboard, as requested by the HARD RULES.

### Accessibility Notes
- Colors rely on existing tokens and vendor/payment constants.
- Added textual summaries for charts to ensure screen-reader compatibility.
- Interactive elements maintain high contrast focus states defined in `slab.css`.
- Support for `prefers-reduced-motion` is native to the Tailwind classes used (`animate-in`, etc.).

## Element Mapping Table

| Element in Old Overview/Admin | New Location / Section |
| --- | --- |
| KPI Stats (ClientOverview) | `KpiStrip` |
| Queue & Upcoming Payments (ClientOverview) | `FinanceSummarySection` |
| Capital Distribution Donut (AdminDashboard) | `FinanceSummarySection` |
| Vendor Summary Charts (AdminDashboard) | `VendorAcquisitionSection` |
| Shape & Material Charts (AdminDashboard) | `MaterialBreakdownSection` |
| Logistics/Crate Wireframes (AdminDashboard) | `InventoryStatusSection` |
| Operational Breakdown (AdminDashboard) | `ExpenseSection` |
| Device Fleet Status (N/A - New) | `DeviceFleetTile` |
