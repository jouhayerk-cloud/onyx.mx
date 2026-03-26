# Changelog

<!--
  Version Scheme: v[General].[Feature_Count].[Build]
  ─────────────────────────────────────────────────
  General      (v1)  — Stable production generation. Bump on full architectural rewrite.
  Feature_Count(.11) — Increments per new module / major feature shipped.
  Build        (.72) — Increments on every production deployment, hotfix, or patch.

  All-time deployment count (LEGACY Onyx.mx/app + git/app): ~100 versions
  LEGACY versionLog.md      : 13 entries  (v0.9.1 → v1.0.0, Aug 2024)
  git/app v1.x tagged builds: 53 entries  (v1.10.20 → v1.11.73)
  git/app v2.x branch builds: ~34 entries (earlier parallel branch, now merged)
## v1.29.4 — 2026-03-25
### Added
- **Pallet Support:** Shipping Crates module now supports both Crates and Pallets. The "Initialize" dialog features a type toggle (Crate / Pallet). Pallets render as a flat 15cm-tall wireframe distinctly different from the standard cuboid Crate, omitting the cross-brace overlay to visually distinguish flat-bed shipping containers.
- **Grouped Empty Inventory View:** The Empty Inventory tab now condenses crates and pallets of identical dimensions into a single stacked wireframe card (showing up to 5 ghost outlines). A count badge shows how many units share that footprint. Packed items are shown as independent grid cards as before.
- **Pack Tab Grouped Sidebar:** Available crates/pallets in the Packing Module sidebar are now displayed grouped by their dimensional size. Selecting a size drills into a full-panel wireframe preview with an individual unit sub-list underneath for precise selection. A "Back" navigation bar exits the drill-down.
- **Quantity-Aware Packing Workflow:** Each inventory row in the packing module now shows a real-time status breakdown: total quantity, units already packed in this crate, and units packed into other crates. When an item is checked for packing, a `−` / `+` stepper appears on the right to select exactly how many units to assign to this crate. Quantities default to 1 and are capped by remaining available units.
- **Cross-Crate Quantity Tracking:** `inventory_ids` now serializes as `id:qty` pairs (`id1:4,id2:2`) enabling per-crate per-item quantity tracking without destructive schema changes. Legacy entries without a `:qty` suffix are treated as full-quantity (backward compat). Total units packed per SKU are computed in real time across all crates to accurately compute "elsewhere" packed quantities.
- **Confirm Bar Enhancement:** The bottom pack confirmation bar now shows the total unit count and SKU count, plus the target crate/pallet type and dimensions.

## v1.29.3 — 2026-03-25
### Added
- **Bank Commission & IVA Toggles:** Implemented a new mutually-exclusive 10% Bank Commission toggle under the existing 16% IVA boolean selector within the Add Payment and Request Payment workflows. This standardizes automatic fee calculations for transactions bound by fixed platform or international transfer percentages, keeping exact ledger balances without manually recalculating the base + fee aggregates.

## v1.29.2 — 2026-03-25
### Fixed
- **Workflow Filtering Bug:** Corrected an isolated rendering issue where the auto-generated Crates payment request bubble was erroneously displayed under the Merchandise -> Acquisitions vendor list. The Crates vendor bubble has been actively filtered from Acquisitions and properly routed to display seamlessly when activating Operations -> Crates, deploying the exact, uniform vendor bubble UI.

## v1.29.1 — 2026-03-25
### Changed
- **Operations Workflow:** Integrated Crates tracking seamlessly into the Add Payment Operations sequence (Monthly Fixed · Crates · Other). Clicking Crates automatically aggregates all unpacked logistics crate shipments into a unified vendor group, calculating aggregate metrics (`W×L×D` physical dimensions, counts, combined total cost) and instantly populating the final checkout form.
- **Categorization:** Upgraded default database sync tagging for crates from general Acquisition (`Acq`) to specific Logistics Packaging (`Packing`). Overrided the default internal subcategory `Pack` naming to `Packing` globally to resolve mapping inconsistency.

### Fixed
- **Local Architecture Overwrite Bug:** Modified `WorkbookView`'s Developer query module to stream finance analytics strictly from the centralized Supabase `financeDataAtom` memory cache. This eliminates remaining dependencies on local RxDB storage which actively interrupted dataset sync logic.
- **Logistics Form Synchronization Update:** Intercepted and rerouted logistics table mutation logic within the Add Payment Wizard tracking submission (`handleSubmit`) sequence to safely intercept empty references resulting from the pseudo-vendor array mapped from the `logisticsData` source.
- **SVG Warning Artifacts:** Handled multiple console warnings emitted from `OnyxMiniLogo` and main inventory component mapping rendering by correcting microscopic syntax omissions (missing standard whitespace delimitation before the `a` path execution string identifier).

## v1.29.0 — 2026-03-25
### Added
- **Global Realtime Sync:** Augmented the RxDB local storage mechanism with a Live Supabase Real-Time Channel, allowing all clients to reflect dataset changes simultaneously across the application, achieving fully reactive multiplayer and optimistic UI updates.
- **Logistics Finance Tracking:** Auto-generation of empty crates now surfaces as a localized "payment request" bubble at the top of the Finance Tracking Module under the "Logistics" / "Pack" subcategory instead of inserting hardcoded financial ledger entries.

## v1.28.1 — 2026-03-25
### Changed
- **Header Tabs:** App version bump to v1.28.1 to resolve logistics sub-tab routing in MainHeader interface logic.

## v1.28.0 — 2026-03-25
### Added
- **Logistics Module Redesign [feat]:** Complete overhaul of the Logistics module replacing the Three.js placeholder with a production-grade glassmorphic UI system.
- **Crates Inventory [feat]:** New `CratesInventoryView` with live RxDB subscription, tabbed Empty/Packed views, status strip (Empty · Partial · Packed counters), real-time search, and responsive card grid.
- **Crate Creation Modal [feat]:** Form for initializing crates with W×L×H dimensions, quantity, and acquisition price. Inserts into `logistics` table (Supabase + RxDB) and **auto-generates a `finance` payment record** (`category: Logistics, subcategory: Pack, status: Requested`) mirroring existing inventory payment logic.
- **Crate Packing Manager [feat]:** Split-pane `CratePackingManager` with left crate selector (live RxDB-sourced) and right inventory panel with multi-select, status/vendor/search filters. Packing assigns `crate_id` to each inventory item and updates crate `inventory_ids` and `contents_summary` atomically.
- **Logistics Tab Restructure [ui]:** Navigation tabs updated from `PACK / TRUCK / SHIP` to `CRATES / PACK / TRK`. Legacy Three.js `ShippingView` and `PackingModule` references removed from primary tab routing.

## v1.27.2 — 2026-03-24

### Changed
- **Overview Module [ui]:** Redesigned the "Priority Requisitions" section with significantly larger UI components. Headers, bank logos, vendor dots, and expansion detail panels have been enlarged for better visibility and interactive density.
- **Payment Split [feat]:** "Direct Wire" payments are now displayed independently per vendor instead of being grouped under a single destination. Other payment destinations (BoA, BBVA) continue to be grouped as usual.
- **Payment detail list [ui]:** Expanded the accordion detail rows to show a clear breakdown of Net Amount, Commission Fee, and total value with improved typographic hierarchy.

## v1.27.1 — 2026-03-20
### Added
- **Studio Overhaul [feat]:** Interactive Transforms, AI Point Refinement, and Spatial UI implementation.

### Changed
- **Packing Nav [ui]:** Removed redundant internal title, brand pill, and search bar from the Packing module — the global top bar handles both. Replaced the full nav with a slim status toolbar (artifact count · selected count · active vendor filter chip).
- **Packing Sidebar [ui]:** Removed Est. Value auto-sum card. Sidebar now shows Batch count only.
- **Packing Pipeline [feat]:** Removed all PNG generation (`html2canvas`, `PhomemoSheetTemplate`, hidden scratchpad, BLE print). Export pipeline is now XLSX + JSON only.
- **JSON Export [feat]:** Added structured `Packing_Batch_{date}.json` download with full item metadata (tagId, tagUrl, description, dimensions, codes, imageUrl) for downstream Designer import.
- **Send to Designer [feat]:** Primary CTA button — generates XLSX simultaneously, stores full batch JSON in `localStorage` (`onyx_packing_batch`), sends `ONYX_LOAD_BATCH` postMessage to the embedded designer iframe, and auto-opens standalone designer with pre-loaded batch.
- **Designer Theme [ui]:** Injected comprehensive Onyx.mx dark glassmorphism theme override into the Phomemo Designer. All toolbars, panels, inputs, buttons, dialogs, and scrollbars now match the main app's dark aesthetic with sky-300 accent (#7dd3fc).

### Fixed
- **Packing postMessage [fix]:** Active item now sends `ONYX_LOAD_ITEM` message type with clean normalized payload instead of raw normData dump.

## v1.18.0 — 2026-03-18
### Added
- **Phomymo Designer Integration [feat]:** Replaced the static label preview with a live-embedded Phomymo Designer iframe in the packing sidebar. The designer receives the active item's data via `postMessage` for real-time label population and preview.
- **Split-Pane Logistics Layout [ui]:** Packing Module now uses a full split-pane layout — scrollable item list on the left, persistent glass sidebar (designer + execution) on the right — for a data-dense workflow.
- **Glass Dashboard Nav [ui]:** Completely redesigned the top control panel with modern glassmorphism. Includes an integrated liquid-glass search field, live BLE/batch status pills, and a condensed icon-palette for view/filter toggles.
- **Liquid Filter Drawer [ui]:** Filters panel (vendor chips, label size selector, select-all) now slides in as a collapsible glass layer beneath the nav.
- **Premium Card & Row Components [ui]:** Redesigned `LogisticsCard` and `LogisticsRow` with refined hover micro-animations, vendor identity ribbons, and glassmorphism depth layering consistent with the rest of the app.
- **Local Search Field [feat]:** Added an inline search input in the nav bar that combines with the global top-bar search atom for fast artifact scanning.
- **BLE + Execution Sidebar [feat]:** BLE printer connection, batch print, XLSX export, and PNG download are all accessible in the right sidebar without leaving the item list view.
- **Item Navigator [feat]:** Added prev/next item navigation controls within the designer panel to cycle through selected batch items.

### Fixed
- **Broken JSX / Duplicate Layout [fix]:** Resolved accumulated broken JSX from partial edits. Complete module rewrite eliminates all runtime TS errors.
- **Missing `search` State [fix]:** Fixed `Cannot find name 'search'` TS errors by adding proper local `search`/`setSearch` state wired to `processedItems` memoization.

## v1.17.1 — 2026-03-18
### Fixed
- **Artifact Framing [ui]:** Corrected image scaling to `object-contain` within a white-filled frame, ensuring artifacts are never cropped and fit perfectly on all devices.
- **UI Minimalization [ui]:** Removed redundant status badges and internal IDs (`AUTHENTIC`, `Verified Piece`, `ITEM ID`) for a cleaner, unified title experience.
- **Standalone Artifacts [feat]:** Removed back-navigation to the main application for public artifact links, creating a truly standalone verification experience.

## v1.17.0 — 2026-03-18
### Added
- **Online Artifact Experience [ui]:** Completely redesigned the public digital tag view with a high-contrast, minimalist light theme.
- **Edge-to-Edge Hero Gallery [ui]:** Implemented a fullscreen zero-padding hero section with dynamic image navigation and gallery support for items with multiple artifacts.
- **Vendor-Coded Identity [ui]**: Interactive Tag ID badges that maintain local vendor branding colors.
- **Technical Specs Grid [ui]**: Redesigned metadata display for dimensions, weight, and internal traceability codes (AQC/LC).
- **MSRP Certification [ui]**: Bold, high-contrast valuation section for authorized retail verification.
- **Floating Action Bar [ui]**: Minimalist floating contact bar for quick piece inquiries.

## v1.16.0 — 2026-03-18
### Fixed
- **Packing Label Proportions [ui]**: Barcode now occupies the bottom half of the sticker for high-visibility industrial scanning.
- **Combined Description [ui]**: Correctly integrated Shape + Description logic across all logistics modules and PNG labels.
- **Sidebar Clarity [ui]**: Resized the "MADE IN MEXICO" side tag to ensure zero overlap with the primary artifact metadata.
- **Logistics Export Refinement [feat]**: Added combined Shape/Type descriptions and a direct QR URL column to the XLSX packing list.

## v1.15.2 — 2026-03-18
### Added
- **Logistics QR Link [feat]:** Added a dedicated `QR URL` column to the XLSX export for immediate digital artifact access.
- **Combined Branding [ui]:** Correctly integrated the `SHAPE TYPE` title logic across the entire Packing module and PNG label generation system.
- **Label Redesign [ui]:** Completely redesigned the PNG label layout to prevent text cut-off. Adjusted heights, margins, and font sizes to eliminate overlap with the barcode and provide a clean, modern aesthetic.

### Fixed
- **TagID Resolver [fix]:** Enhanced `TagView` to handle workbooks stored with a `V` prefix (e.g., `V326`), ensuring scans like `EM3265EOX` find the correct record in Supabase.

## v1.15.1 — 2026-03-18
### Added
- **XLSX Column Consistency [feat]:** Refined the logistics export columns: `DESCRIPTION` now combines `SHAPE` + `TYPE`, and `BOOK RETAIL` uses a composite tag (`{ACQCODE}-BOOKv{RETAIL_USD}`).
- **Quantity Column [feat]:** Added `QUANTITY` tracking for each item in the logistics export.
- **PNG Label Branding [ui]:** Removed the "ONYX • ITEM" prefix from the label metadata and replaced it with a dedicated `SHAPE TYPE` tag.
- **Improved Item Titles [ui]:** Empty item descriptions now fallback to `{SHAPE} {TYPE}` instead of "UNNAMED PIECE" in both Grid and List views.

### Fixed
- **Packing Search Hardening [fix]:** Implemented `useDeferredValue` for the search term, preventing input lag in the Packing module. Added a global `try-catch` to the filtering memo for zero-crash stability.

## v1.15.0 — 2026-03-18
### Added
- **Public Online Tags [feat]:** Scanned QR codes now correctly resolve to the GitHub Pages deployment (`https://jouhayerk-cloud.github.io/onyx.mx/?tagid={ID}`).
- **Artifact Detail Certificates [ui]:** New `TagView` component for public access. Features standalone fast-fetch, vendor color-theming, and comprehensive metadata (Mass, Dims, AQC, LC, Retail USD).
- **Logistics Export Overhaul [feat]:** Completely redesigned the Packing module XLSX export. Columns now include combined fields: `TAGID`, `DESCRIPTION` (Shape + Type), `MATERIAL COLOR`, `SIZES` (W*L*H CM), `LANDED CODE`, `ACQ CODE`, and `BOOK RETAIL`.
- **Typographic Tag Refinement [ui]:** Removed high-contrast industrial black blocks for a cleaner "High-End Artifact" certificate look. Adjusted title and ID dimensions for better hierarchy.

### Fixed
- **Packing Search Stability [fix]:** Resolved a critical null-pointer crash in the Packing Module search bar by hardening `normalizeInventoryData` and adding defensive string serialization in the filtering memo.
- **TagID Resolver [fix]:** Implemented a robust multi-stage lookup in `TagView`. If direct barcode matching fails, the app parses the TagID into Vendor/Workbook/ItemNum components to locate the record in Supabase.
- **XLSX Dependency [fix]:** Corrected `JSZip` import for Vite compatibility, resolving the "XLSX Export failed" issue reported by users.
- **Tailwind Syntax [ui]:** Cleaned up multiple lint warnings for modern standard syntax (opacity, linear gradients).

## v1.14.0 — 2026-03-18
### Added
- **Overview Module Redesign [ui]:** Redesigned the Client Overview module for maximum data density. Removed nested frame containers and heavy padding. Added a compact 6-stat KPI strip at the top. Condensed payment requisition rows to a single-line layout. Replaced large "SummaryTile" cards with an inline "Vendor Breakdown" data table featuring visual progress bars.
- **Skeleton Screens [ui]:** Replaced the generic global loading spinner with high-fidelity skeleton screens tailored for each module (Inventory Grid/List, User Registry, Payments). Skeletons match real layout geometry to prevent layout shifts.
- **Optimistic UI [feat]:** Implemented optimistic updates for User Registry (toggling status, deletion) and Payments (marking as paid). The UI updates instantly upon user interaction, with automatic rollback and error notifications if the server/Supabase request fails.
- **Global Sync State [infra]:** Introduced `isSyncingAtom` to centralize the initial data loading state, allowing components to react to the overall synchronization status rather than managing individual loading flags.
- **CSS Design Utilities [infra]:** Added global `.skeleton` shimmer and `.optimistic-revert` flash animation utilities to `index.css`, supporting all 6 application themes automatically.
### Fixed
- **Payments View [fix]:** Resolved a pre-existing broken atom import (`isPaymentsFilterBarVisibleAtom` → `paymentFilterBarModeAtom`) and corrected `LoadingIndicator` usage after skeleton implementation.
- **TypeScript Errors [fix]:** Resolved multiple TypeScript errors (TS2339, TS2367) in AI-driven features and Logistics module.

## v1.13.5 — 2026-03-17
### Fixed
- **Supabase signup redirect [fix]:** `signUp` now passes `emailRedirectTo: 'https://jouhayerk-cloud.github.io/onyx.mx/'` so activation email links correctly land on the app instead of the GitHub root (which 404s).
- **Custom 404 page [fix]:** Replaced the empty `404.html` with a full Onyx.mx–branded dark page (inline SVG logo, animated, glassmorphic). When Supabase auth params (`type=signup`, `access_token`, etc.) are detected in the URL hash or query string, the page automatically redirects to the app within 800ms so the token is preserved and processed.

## v1.13.4 — 2026-03-17
### Fixed
- **Float precision [fix]:** Prices stored as whole MXN pesos now correctly round at each calculation step (`round2 = Math.round(x * 100) / 100`) inside `calculateCodesAndPrices`, preventing IEEE 754 drift from producing long decimal tails in USD conversions, cypher codes, and retail prices.
- **Payments display [fix]:** `fmtMXN` in TrackingPaymentsView now clamps to `maximumFractionDigits: 2`, eliminating floating-point artifacts like `$1,500.000000001` in the Payments view.
### Added
- **Inventory Export (codes) [feat]:** ACQ Code, LND Code, and Retail (USD) are now **computed live** using the workbook exchange rate via `calculateCodesAndPrices`, replacing stale DB-stored values. Columns reordered: Tag ID, Item #, Status, Shape, Material, Color, Description, Qty, Price (MXN), Subtotal (MXN), ACQ Code, LND Code, Retail (USD), Pay Status, Weight, Dimensions, Workbook, Notes.

## v1.13.3 — 2026-03-17
### Added
- **Inventory Export [feat]:** Added XLSX export button to the Inventory top bar. Exports all acquisition and production items (excludes Available/catalog/store items) as `Onyx_Inventory_YYYY-MM-DD.xlsx`. File contains **one sheet per vendor**, sorted by Tag ID, with columns: Tag ID, Item #, Status, Shape, Material, Color, Description, Qty, Price (MXN), Subtotal (MXN), Weight, Dimensions (H/W/L cm), Pay Status, Workbook, ACQ Code, Land Code, Notes. Each sheet includes a totals row at the bottom.

## v1.13.2 — 2026-03-17
### Added
- **Finance Export [feat]:** Added XLSX export button to the Finance top bar. Exports the full `finance` database as a timestamped file (`Onyx_Finance_YYYY-MM-DD.xlsx`) with two sheets: **Finance Ledger** (all records with Date, Description, Category, Vendor, Amount, Commission, Total, Status, Destination, Reference, Pay Date, Notes) and **Summary** (grand totals + breakdown by category and by account, with MXN and USD equivalents using the live exchange rate).

## v1.12.4 — 2026-03-14
### Added
- Multi-media gallery in the Inventory Details view, allowing users to browse all uploaded images and videos for a single item.
- Interactive Fullscreen Media Viewer with support for zooming and native video playback.
- Thumbnail navigation bar in the details panel for quick media switching.
- Enhanced Content viewer with support for `<video>` elements using `foreignObject` rendering in SVG.

## v1.12.3 — 2026-03-13
### Added
- Browser-side MOV video decoding and playback support.
- Automatic video thumbnail generation in the inventory grid and upload views.
- High-fidelity image previews with client-side resizing for better performance.
- Support for video attachments in Upload Wizard and Manual Entry form.
- **Drive Upload [fix]:** Resolved "Failed to fetch" error during media uploads by simplifying CORS headers and updating the Google Apps Script response mime-type to `TEXT` (CORS-safe redirect).
- **Drive Folder [infra]:** Migrated the primary upload target to the new `GlobalUploads` folder.
- **Supabase [sync]::** Finalized the full migration of all data persistence operations from Google Sheets to Supabase. Replaced legacy Apps Script backend calls with direct Supabase CRUD operations across all modules.

## v1.11.100 — 2026-03-05 (Deployment Stability)
- **Deployment [fix]:** Stabilized production builds by explicitly defining Supabase and Gemini environment variables in the Vite configuration. This ensures critical keys are baked into the production bundle, resolving "blank screen" issues on live deployments.
- **Workflow [infra]:** Implemented isolated git worktree deployment workflow for consistent, high-fidelity production releases.

## v1.11.99 — 2026-03-05 (Packing Intelligence Update)
- **Packing Info [feat]:** Adapted the Packing module UI and label templates to display all essential packing metrics: Descriptions, Dimensions, Cypher Codes (ACQ/LC), TAG IDs, Vendor IDs, and USD Retail Prices.
- **Label Architecture [feat]:** Redesigned the printable label template with a high-density, professional layout that incorporates dimensional data and financial codes for streamlined logistics.
- **UI High-Fidelity [ui]:** Enhanced Grid and List views in the Packing module to provide immediate visibility of technical item data.

## v1.11.98 — 2026-03-05 (Crash Fix)
- **Packing Crash [fix]:** Resolved a critical application crash occurring when selecting items in the Packing Module. The issue was caused by attempting to call string methods on numeric item numbers.
- **Data Validation [fix]:** Added robust type checking and fallback values for label generation templates to prevent crashes on malformed or incomplete inventory data.
- **UI Cleanup [ui]:** Corrected duplicated header metrics in the Packing Module.

## v1.11.97 — 2026-03-05 (Data Sync Fix)
- **Packing Sync [fix]:** Implemented direct database listeners in the Packing module to ensure inventory and production items are always loaded and synchronized, even when accessing the module directly.
- **Packing Header [ui]:** Updated summary header to include "Types", "Count" (total qty), and "Selected" metrics, matching the Unified Inventory View aesthetic.
- **Search Logic [fix]:** Refined filter to include Tag ID (Barcode) in the search strings.

## v1.11.96 — 2026-03-05 (Packing Overhaul)
- **Packing Module [feat]:** Relocated the Packing module to be a primary sidebar navigation item. Improved filtering logic to include ALL inventory items for labeling.
- **Packing UI [ui]:** Overhauled the Packing interface with a modern, compact design. Replaced the side panel with a stackable horizontal configuration drawer at the top.
- **Top Bar Integration [feat]:** Integrated Packing title and search functionality into the main global top bar using `TOP_BAR_SEARCH_ATOM`.
- **Label Generation [feat]:** Restructured label action workflow with improved buttons for PNG generation, Phomemo Bulk XLSX, and Packing List XLSX.
- **Background Decor [ui]:** Added free-floating background SVG icons (Package, Barcode, Printer) for a premium high-fidelity look.

## v1.11.80 — 2026-03-04 (UI Polish)
- **Inventory List Icons [ui]:** Replaced Lucide `<Edit2>` and `<ChevronDown>` button wrappers with bare inline `<svg>` elements — truly free-floating, no background box, no border. Edit icon uses `--main-color` on hover, chevron rotates 180° when expanded. Correct color theme applied.
- **Payments Filters [ui]:** Consolidated three separate filter buttons (MapPin/Destination, Tag/Vendor, LayoutList/Type) into a single `SlidersHorizontal` inline SVG toggle. Clicking it opens one unified popup panel containing all three filter sections (Destination, Vendor, Payment Type) plus a "Clear All" link. Filter indicator dot shows when any filter is active. Filters are no longer individually visible in the top bar.

## v1.11.79 — 2026-03-04 (Enhancement + Bugfix)
- **Inventory Search Bar [feat]:** Restored wide centered smart search bar to Inventory top bar. Supports multi-term AND search (space-separated), matched against Tag ID, shape, color, material, codes.
- **Inventory List View [ui]:** Edit and Details buttons converted to free-floating ghost icon buttons (no label, no border box) for a cleaner, more compact row layout.
- **Inventory Grid Detail [ui]:** Replaced right-side slide drawer with a centered fullscreen modal viewer (max-w-3xl, zoom-in animation). Matches the Store viewer pattern. Bottom panel in list view now shows all size/weight/financial details expanded inline.
- **Payments Top Bar [feat]:** Restored smart search bar (multi-term, space = AND). Filter dropdowns converted from portal strip bars to inline popup menus attached to each icon. New LayoutList button deploys Payment Type filter popup (ALL / ACQ / PROD / MONTHLY / SPPL / LABR / PACK / OPRT).
- **Payments Category Filter [feat]:** Added `paymentCategoryFilterAtom` and `isPaymentCategoryFilterOpenAtom` to global state. Wired into `sortedTimeline` filter chain alongside destination, vendor and search term filters.
- **Payments Request Cards [ui]:** Autogenerated payment request cards now use `flex-wrap` with `min-w-[220px]` so they stretch to fill available width instead of stacking vertically.
- **Status Bug [bugfix]:** Fixed `'Avaiable'` (typo) status option in the Edit Item dropdown — corrected to `'Available'`. Added `'Acquisition'` to the dropdown options. Renamed `'Payed'` → `'Paid'` for consistency. Updated `filteredItems` exclusion list to also match the legacy typo and `'catalog'`, preventing misspelled records from leaking into the Inventory view.
- **Store View [bugfix]:** StoreView Supabase query retains both `'Available'` and `'Avaiable'` in the status filter for backward compatibility with existing database records that were saved with the old typo.

## v1.11.78 — 2026-03-04 (Enhancement)
- **Inventory Top Bar [ui]:** Removed search input from Inventory top bar. Grid/List selector replaced with single toggle icon that flips state on each click. Vendor filter deploys as a glassmorphic horizontal pill-bar below the header (portal) instead of a dropdown.
- **Payments Top Bar [ui]:** Removed search and filter dropdowns from Finance top bar. Destination and Vendor filter toggles now deploy as horizontal portal pill-bars below the header. Overview panel cycle button replaced with single 3-state toggle (Full → Min → Off) with label indicator.
- **Payments Overview Panel [feat]:** Overview panel now respects the 3-state mode atom — Full shows full height, Min shows compact height, Off hides the panel entirely. Removed inline Full/Min/Hide buttons from panel body.
- **Inventory Edit [feat]:** Added Quantity and Unit Cost (MXN) fields to the Inventory Edit item panel.
- **Add Entry Fast-Entry [feat]:** After saving an item in the Manual Entry form, the form stays open with the same vendor, status, and workbook pre-filled, and the item number auto-incremented for rapid consecutive entries.
- **Upload Wizard [feat]:** Final step now shows two action buttons — **Save & Continue** (saves and resets to Step 3 with same vendor + bumped item count) and **Save & Exit** (saves and closes wizard).

## v1.11.77 — 2026-03-04 (Enhancement)
- **Top Bar UI [feat]:** Redesigned FinanceBar to include search and deployable filter panels for Vendors and Destinations to match the InventoryBar. Fixed SVG borderless icons across all TopBars.
- **Payments Timeline [feat]:** Replaced inline filters with global Top Bar filters. Added independent sliding detail drawer panel for individual payment timeline items.
- **Inventory Grid [ui]:** Redesigned Unified Inventory Grid layout to align aesthetically with Store Viewer (improved background layers, clear spacing for images, modern translucent tags).

## v1.11.76 — 2026-03-04 (Feature)
- **Inventory [feat]:** Replaced in-grid expanded view with a new sliding glassmorphic right-side drawer detail panel for improved layout stability.
- **Upload Wizard [feat]:** Added real-time "Vendor Existing Units" count display to Step 3, alongside the auto-generated new Item Number.
- **Dashboards [ui]:** Removed large redundant headers/titles from Dashboard, Admin Dashboard, and Control Center in favor of the unified Main Top Bar system.
- **Settings [feat]:** Persisted UI preferences locally across refreshes via `atomWithStorage` (Performance mode, sidebar state, financial visibility toggle).

## v1.11.75 — 2026-03-04 (Bugfix)
- **HeroBackground [fix]:** Background elements now use negative z-indices (`-2` image, `-1` scrim) so they sit visually behind all app content without fighting stacking contexts. Previously the scrim at `z-index: 1` was covering the entire app-container, making all UI invisible/fogged.
- **HeroBackground [fix]:** Scrim opacity reduced to `0.65` — hero images now show through as a subtle blurred texture rather than being fully obscured.
- **Performance Mode [fix]:** `performanceModeAtom` now read directly inside `HeroBackground` (no prop passing). When ON, renders a static dark gradient with zero animations; when OFF, cycles the full media gallery.
- **Glass Utilities [fix]:** All text in `.glass-label`, `.glass-field-label`, `.glass-value` now renders at full opacity using `var(--text-color)` directly — removed `color-mix` transparency that was causing text to appear faint/invisible on light themes.
- **Theme Variables [feat]:** Added `--app-bg-solid` CSS variable to all themes (dark and light) for use as scrim background reference.
- **Glass Panels [fix]:** Increased panel background opacity across all glass utility classes: `.glass-sm` 50→82%, `.glass-md` 65→88%, `.glass-lg` 70→92% — panels now appear solid and readable.

## v1.11.74 — 2026-03-04 (Feature)
- **Glass UI System:** Added global glassmorphic CSS utility classes (`.glass-sm/md/lg`, `.glass-label`, `.glass-value`, etc.) across the entire app.
- **Hero Media Gallery:** Auto-cycling background gallery using 20 images + 8 videos from the Jouhayerk Hero page, served from `/hero/` public folder.
- **HeroBackground Component:** Crossfade cycling with Ken Burns animation, `buildMediaPool()` interleaving images and videos.
- **Inventory Overhaul:** Glassmorphic expanded card panel, auto-cycling media bg on edit overlay, vendor glow on card hover.
- **backdrop-filter [fix]:** Removed `backdropFilter` from scrim elements that was causing the entire app UI to appear blurred.

## v1.11.73 — 2026-03-04 (Bugfix)
- **Store Panel BG [fix]:** Blurred background image in item detail panel was rendering as a black screen. Root cause: CSS `background-image` and `position: absolute` inside a `fixed` parent are blocked by cross-origin policy for Google Drive URLs. Fixed by using a `<img>` element with `position: fixed` and explicit `zIndex: 0`, ensuring correct rendering for all image sources.
- **Store Panel BG [fix]:** Background image brightness increased from `0.25` (near-invisible) to `0.45` for visible cinematic effect.
- **Store Cards [fix]:** TAG ID in compact catalog cards now correctly renders in vendor brand color (glowing dot + icon + text), consistent with the expanded panel view.

## v1.11.72 — 2026-03-04
- **Store Grid:** Widened item cards (reduced column density) for better legibility at all breakpoints.
- **Store Cards:** Removed the QUICK ADD hover overlay; replaced with a small ShoppingBag icon bubble on the bottom-right edge of the price row.
- **Store Cards:** Inline secondary info row now displays TAG ID, ACQ Code, LND Code, and Retail USD for non-Vendor roles directly on each catalog card.
- **Store Detail Panel:** Gallery images are now clickable, launching a fullscreen zoomable/pannable image viewer with mousewheel zoom, drag, and pinch-to-zoom on touch devices.
- **Store Detail Panel:** Normalized all item specifications and pricing codes (TAG ID, AQC, LND, Landed, Retail) using `normalizeInventoryData` + `calculateCodesAndPrices` — now correctly resolved from both camelCase and snake_case DB schemas.
- **FastEntryForm:** Fixed item payload serialization to use proper snake_case keys matching the RxDB/Supabase schema (weight_kg, height_cm, width_cm, length_cm, price_mxn, etc.).
- **FastEntryForm:** Restored `GoogleGenAI` initialization that was inadvertently dropped, fixing AI analysis chain errors.

## v1.11.71
- **Settings Popup:** Updated Settings menu UI to be theme-color aware (light/dark adaptative).
- **Unit Conversions:** Added imperial unit conversions (inches, pounds) alongside metric measurements for item details.
- **Icon System:** Full transition from emojis and embedded SVGs to free-floating `lucide-react` icons across UploadAIPanel, FastEntryForm, PackingModule, and UnifiedInventoryView.
- **App Consistency:** Improved theme logic, removing remaining hardcoded colors and fixing lint warnings in the build process.

## v1.11.70
- **Store Module:** Created new global responsive Store/Catalog layout with session-based shopping bag.
- **Store Data Exports:** Generated comprehensive checkout XLS/PDF receipts.
- **Control Center Access:** Added active Store toggles and Custom Logos to the Developer dashboard settings panel.

## v1.10.69
- **Payments UX Overhaul:** Refactored the payments list into a responsive, modern expandable table. Each row is now a dynamic two-line panel that can be clicked to reveal deep financial data (Total Net MXN, USD equivalent at live rate, Requested/Paid dates, and a deployable tag IDs list for Acquisition records).
- **Payment Destination UX:** Tweaked the stacked card icons filter to be perfectly symmetrical, tighter packed, and dynamically highlight the total requested value on top of the selected active icon.

## v1.10.68
- **Light Theme Overhaul:** Comprehensive fixes for all light themes (Nacar, Tehu, Tekis) across Dashboard, Inventory, Payments, Upload, and Wizard views
- **Drop Shadows Removed:** Removed all text drop-shadows from grid cards, catalog images, and item thumbnails for cleaner rendering
- **Dashboard Theme-Aware:** Stat cards, section titles (Acquisition by Vendor, By Shape · Type, By Material), bar chart labels, and panel backgrounds now use CSS variables
- **Inventory Top Bar:** Types, Count, view toggle, and Filters buttons use theme-aware glass backgrounds and borders
- **Inventory Grid Cards:** Card gradient overlay now adapts properly for light backgrounds
- **Filters Panel:** Filter bars use glass-bg and border-color variables instead of hardcoded black
- **Upload Entry Form:** Labels, inputs, and auto-generated suggestion tags are now readable on light themes
- **Wizard Renamed:** "Start Wizard" → "New Item" with smaller, more compact launcher button
- **Payment Card Icons:** Destination picker icons are now free-floating, borderless, and larger with stacked spread animation
- **Sidebar Version Tag:** Logo and version number use theme-aware text colors, visible on both light and dark themes
- **Background Containers:** Increased transparency across the app for a lighter, more modern feel

## v1.10.67
- **Top Bar Refactor:** Removed Onyx logo, version count, inventory title, toggle financial, and toggle display buttons from the header for a cleaner layout
- **Search Bar:** Enhanced to full-width liquid glass style with responsive animations
- **Sidebar:** Relocated Onyx logo and version tag to the bottom of the sidebar (expanded + compact modes)
- **Dashboard:** Added "Lock Financial Info" toggle button to Admin Dashboard header
- **Inventory Filters:** Made filter panel collapsible with animated expand/collapse; added "Types" and "Count" tags above the inventory list; moved grid/list toggle into the inventory area
- **Payments Overview:** Separated payment summary from action buttons; removed "General Overview" and "Details" titles; added vendor color-coded bubbles with progress rings in minimal view
- **Payments Full View:** Removed Pending totals; MXN and USD values displayed side-by-side at equal size; "Add Payment" button moved inline with vendor request cards; removed "Add Expense" button
- **Payments Top Bar:** Shows compact summary stats and a "Show Overview" button when overview is collapsed
- **Destination Cards:** Replaced flat icon row with stacked card deck animation with spring physics on select/deselect
- **Security:** Removed leaked API key from .env.example

## v1.10.66
- Implemented automatic language selection at login: Spanish for Vendors, English for Admins, Clients, and Developers.
- Integrated AI-powered auto-translation (to English) and spelling autocorrection for Vendor product submissions in FastEntryForm and UploadEntryForm.

## v1.10.65
- Added new General Overview panel directly into TrackingPaymentsView for easier total viewing
- Fetched real-time Exchange Rate (USD-MXN) to display within the general payments overview
- Re-designed the details tab to properly include data-dense table and removed filter bar bloat
- Dashboard adjusted to a four column responsive grid, removed the land and retail totals
- Fixed placeholder image overlay bugs across inventory layouts

