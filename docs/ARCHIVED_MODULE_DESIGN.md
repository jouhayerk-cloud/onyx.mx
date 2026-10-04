# AV2 Archived module design spec and component contracts

Source: Gemini 3.1 Pro (High) via agy, 2026-10-04. Unverified until the Chief reviews it.

# Archived Module Design

## 1. Intent and Principles
Grounded in Apple's Human Interface Guidelines (Clarity, Deference, Depth), this module emphasizes the content—historical archive data—above all else. The interface recedes, providing a single clear hierarchy where layout and typography guide the eye naturally without relying on heavy borders or decorative fills. Every shadow and elevation maps precisely to SLAB's physical metaphor: flat data and pressed or raised controls. We eliminate decoration without function; color carries meaning (vendor tags, finance totals) rather than ornament. The result is a tactile, predictable workspace that feels less like a web page and more like a dense, high-performance analytical tool.

## 2. Information Architecture
*   **Page Header**: Page title **'Archived'**, the season badge 'v825', source file name, and the import date.
*   **KPI Strip**: Aggregates high-level metrics: total vendors, total items, total quantity, total weight, and (strictly for Developer and Admin roles) the finance total.
*   **Vendor Rail**: A horizontal scrolling rail of vendor chips. An **'All'** chip is pinned FIRST, showing aggregate counts, followed by individual vendors with their specific counts.
*   **Filter Bar**: Contains the Search input, Sort dropdown (options: Tag ID, Date, Vendor, Weight, Price), View mode toggle (Gallery / Table), and Density control.
*   **Module Switch**: A top-level Items | Ledger toggle. The Ledger view (mapping to `archive_balances`) is restricted entirely to Developer and Admin roles.

## 3. 'View All' Behavior
The 'All' vendor mode is a distinct operational state rather than a client-side filter. When active, the data hook queries the `archive_items` table by book ID without applying a vendor filter. Both search and sort operations are handled server-side via Supabase to ensure consistency across the entire 740-item dataset. Pagination uses a page size of 120 items with an infinite 'Load more' pattern, triggered by an `IntersectionObserver` sentinel at the bottom of the list. Scroll position is maintained during fetch cycles. The view accurately reflects global counts and gracefully degrades into explicit empty/no-results states if a search yields zero matches. Vendor chips in the rail act as radio selectors and combine seamlessly with the active search string.

## 4. The Item Card
Designed for Gallery mode, the archive item card translates tabular data into a highly scannable tile:
*   **Visuals**: In the absence of photos, a dominant tag tile acts as the primary visual anchor, colored with the specific vendor's SLAB hex code.
*   **Metadata**: Color and shape are parsed directly from the description and rendered as SLAB-styled chips.
*   **Metrics**: Displays dimensions, weight, quantity, and date in a compact grid. Developer and Admin roles see a dedicated price line.
*   **States**: 
    *   *Rest*: SLAB float elevation.
    *   *Hover/Focus*: SLAB raised shadow, slight brightness increase.
    *   *Selected*: Deep SLAB pressed shadow with a 2px `var(--main-color)` outline.
*   **Grid Rules**: CSS grid auto-fit layout scaling from 2 columns on mobile to 6 columns on ultra-wide viewports.

## 5. The Table
For dense data scanning, the Table mode respects the `density` atom (`compact` = `py-1`, standard = `py-3`).
Columns:
1. Vendor (Sticky left, SLAB status color)
2. Tag ID
3. Num
4. Date
5. Description
6. Qty
7. Wt.
8. Dimensions
9. (Dev/Admin only) Price MXN
10. (Dev/Admin only) Total Pesos
11. (Dev/Admin only) AQ
12. (Dev/Admin only) LND
13. (Dev/Admin only) Retail
14. (Dev/Admin only) Total USD
15. (Dev/Admin only) AQC / LC / SQM Price / AQ Round / LND Round / Desc Price

## 6. The Detail Drawer
A 440px wide off-canvas drawer sliding from the right (`translate-x-full` to `translate-x-0`).
*   **Content**: Displays all item fields, the `attrs` JSON payload (extra spreadsheet columns), and the complete finance block (Dev/Admin only).
*   **Actions**: One-click copy buttons for the Tag ID and an 'open source row' text snippet.
*   **Navigation**: Previous/Next item buttons at the bottom to traverse the active list without closing the drawer.
*   **Dismissal**: Closes via an explicit 'X' button, clicking the backdrop, or pressing the `Escape` key.

## 7. Ledger
The Ledger module (`archive_balances`) inherits the identical SLAB design language. Tables utilize the same flat elevation rules without row-level shadows, highlighting boundaries with hairline borders. Vendor balance summaries are presented in SLAB raised panels, adhering to the standard metric typography used in the KPI strip.

## 8. States and Motion
*   **Skeletons**: Loading states use subdued, reduced-opacity pulses mimicking the final layout shapes, avoiding harsh flashes.
*   **Empty/Error**: Clear typography-driven empty states (e.g., "NO RECORDS FOUND") and explicit error boundaries with 'Retry' actions.
*   **Transitions**: All structural animations (drawer slide, view mode fade) are timed between 150ms and 250ms using SLAB's `cubic-bezier(0.4, 0, 0.2, 1)`.
*   **Reduced Motion**: `prefers-reduced-motion` suppresses all slide and scale transforms, falling back to simple opacity crossfades.

## 9. Accessibility
*   **Landmarks**: Explicit `<nav>`, `<main>`, and `<aside>` semantic tags.
*   **Navigation**: The vendor rail operates as an ARIA `tablist` with individual chips as `tab` elements.
*   **Table**: Strict `role="grid"` and `role="row"` semantics for the table view.
*   **Focus**: Standard SLAB 2px outline for keyboard focus. The Detail Drawer traps focus upon opening.
*   **Contrast**: All text tiers floor at `--slab-dim` to ensure strict WCAG 2.2 AA contrast compliance across both light (Aqua) and dark (Talan) themes.

## 10. i18n
New English strings to be added to `src/lib/i18n.es.ts`:
*   "Archived"
*   "All Vendors"
*   "Archive Empty"
*   "Archive Unavailable"
*   "Source File"
*   "Imported"
*   "Vendor Items"
*   "Total Quantity"
*   "Total Weight (KG)"
*   "Page Total (USD)"
*   "Load more"
*   "Open source row"
*   "Copied!"

## 11. Component Contracts

```typescript
// src/features/archived/ArchivedView.tsx
export const ArchivedView: React.FC = () => null;
```

```typescript
// src/features/archived/ArchivedHeader.tsx
export interface ArchivedHeaderProps {
  season: string;
  sourceFile: string;
  importedAt: string;
  vendorCount: number;
  totalQuantity: number;
  totalWeight: number;
  totalUsd: number | null;
}
export const ArchivedHeader: React.FC<ArchivedHeaderProps> = (props) => null;
```

```typescript
// src/features/archived/ArchivedFilterBar.tsx
export interface ArchivedFilterBarProps {
  vendors: { id: string; count: number }[];
  selectedVendor: string | 'ALL';
  onSelectVendor: (vendor: string | 'ALL') => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  viewMode: 'gallery' | 'table';
  onViewModeChange: (mode: 'gallery' | 'table') => void;
  activeTab: 'Items' | 'Ledger';
  onTabChange: (tab: 'Items' | 'Ledger') => void;
  showLedgerTab: boolean;
}
export const ArchivedFilterBar: React.FC<ArchivedFilterBarProps> = (props) => null;
```

```typescript
// src/features/archived/ArchiveItemCard.tsx
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
export interface ArchiveItemCardProps {
  item: ArchiveItem;
  finance: ArchiveFinance | null;
  isSelected: boolean;
  onClick: () => void;
}
export const ArchiveItemCard: React.FC<ArchiveItemCardProps> = (props) => null;
```

```typescript
// src/features/archived/ArchiveItemTable.tsx
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
export interface ArchiveItemTableProps {
  items: ArchiveItem[];
  financeMap: Record<string, ArchiveFinance>;
  isFinanceRole: boolean;
  selectedId: string | null;
  onRowClick: (item: ArchiveItem) => void;
  density: 'compact' | 'standard';
}
export const ArchiveItemTable: React.FC<ArchiveItemTableProps> = (props) => null;
```

```typescript
// src/features/archived/ArchiveItemDrawer.tsx
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
export interface ArchiveItemDrawerProps {
  item: ArchiveItem | null;
  finance: ArchiveFinance | null;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}
export const ArchiveItemDrawer: React.FC<ArchiveItemDrawerProps> = (props) => null;
```

```typescript
// src/features/archived/ArchivedLedger.tsx
export const ArchivedLedger: React.FC = () => null;
```

```typescript
// src/features/archived/useArchiveItems.ts
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
export type ArchiveStatus = 'loading' | 'ready' | 'empty' | 'error';
export function useArchiveItems(
  vendor: string | 'ALL',
  search: string,
  sort: string,
  finance: boolean
): {
  items: ArchiveItem[];
  financeMap: Record<string, ArchiveFinance>;
  totalCount: number;
  countsPerVendor: Record<string, number>;
  status: ArchiveStatus;
  loadMore: () => void;
  hasMore: boolean;
  error: string | null;
  retry: () => void;
} {
  return {} as any;
}
```

## 12. Rollout
*   **Sidebar Navigation**: The sidebar label will change from 'Workbook' to 'Archived'. The underlying route/view ID remains `'workbook'` to prevent breaking deep links or saved state.
*   **Routing**: The legacy `WorkbookView.tsx` will be fully unmounted and removed from the active router, replaced entirely by `ArchivedView.tsx`.
*   **Cleanup**: Once the new module is fully deployed and stable, `src/features/workbook/WorkbookView.tsx`, `src/features/archive/ArchivePanel.tsx`, and `src/features/archive/useArchive.ts` will be permanently deleted.
