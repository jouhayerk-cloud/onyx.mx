## [1.50.2] - 2026-03-30
### Added
- **PaymentsArtifact Overview Integration**:
    - **Financials Contextual Auditing**: Clicking Category cards (Monthly, Supplies, Labor, Packing, Operations) now opens the global PaymentsArtifact overlay filtered by that specific category.
    - **Vendor-Specific Drill-down**: Clicking any vendor row in the Acquisitions Concentration breakdown now launches the PaymentsArtifact filtered for that vendor.
    - **Interactive UI**: Added hover states and cursor feedback for all new payment audit triggers.

## [1.50.1] - 2026-03-30
### Changed
- **Storage & Logistics Visual Overhaul**:
    - **Fleet Visualization**: Engineered a dynamic grid of crate/pallet types featuring isometric 3D wireframe icons scaled to actual dimensions.
    - **Status Indicators**: Implemented color-coded wireframes (Green, Gold, Cyan) based on packing fill levels.
    - **Data Density**: Upgraded the compact logistics summary to include total units, packed status, and interactive progress tracking.
- **Global Distribution Analysis Reordering**:
    - **Financial Prioritization**: Moved Acquisitions Concentration (Value) to the top of the analysis panel for immediate balance auditing.
    - **Operational Secondary**: Moved Units Share by Vendor immediately below the value concentration.

## [1.50.0] - 2026-03-30
### Added
- **Compact Financials Dashboard [major]**:
    - **Multi-Segment Bar Graph**: Engineered a custom visualization for Mexico Total, Expenses, Acquisitions, and Unpaid amounts in a single compact bar.
    - **Default Entry State**: Updated the Overview module to load in "Compact Mode" by default for faster auditing.
    - **Interaction Design**: Integrated seamless click-to-expand transitions between compact and granular financial views.

## [1.46.2] - 2026-03-29
### Fixed
- **XLSX Grouping & Ledger Cleanup**:
    - **Inventory Sheets**: Fixed a critical bug where items were incorrectly grouped as "Unknown". Grouping now proactively extracts vendor prefixes from Tag IDs (e.g., "EM", "AN").
    - **Ledger Cleanliness**: Removed the unrequested "TAG ID" column from the Finance Ledger to maintain report standards.
    - **Syntax Integrity**: Resolved parsing errors in the master export loop.

## [1.46.0] - 2026-03-29
### Changed
- **Studio Branding & Visual Clarity**:
    - **Solid Contrast Fills**: Applied solid background fills to TAG ID and VENDOR cells using vendor-specific colors.
    - **Contrast Logic**: Integrated automated font-color flipping (White vs. Black) based on background luminance for 100% legibility.
    - **Descriptive Naming**: Renamed inventory worksheets from two-letter codes to full vendor names (e.g., "ESTEBAN").
- **System Versioning**: Updated application to v1.46.2.

## [1.45.0] - 2026-03-29
### Added
- **High-Density XLSX Export [feature]**:
    - **Combined Attributes**: Refactored inventory sheets to merge Shape/Description and Color/Material for better spreadsheet scannability.
    - **Physical Spec Consolidation**: Implemented a "SIZES" column that concatenates L x W x H and Diameter/Interior/Drop dimensions.
    - **Precise Calculation Logic**: Integrated manual multipliers for financial reporting:
        - **Landed Cost**: Cost * 1.4 (MXN).
        - **Retail Pricing**: Cost * 12 (USD Book Rate).
    - **Finance Precision**: Applied `# ,##0.00` number formatting to all monetary cells in Excel to prevent floating-point artifacts.
- **Vendor Identity Branding**: Preserved per-vendor sheet segregation and color-coded TAG ID font styling.

## [1.44.1] - 2026-03-29
### Fixed
- **XLSX Export Stability**: Resolved "Cannot read properties of undefined (reading 'type')" crash by implementing optional chaining for uninitialized cell fills during zebra-row styling.

## [1.44.0] - 2026-03-29
### Added
- **Studio XLSX Overhaul [major]**:
    - **ExcelJS Pipeline**: Transitioned from legacy `xlsx` to `exceljs` for high-fidelity spreadsheet generation with advanced styling.
    - **Zebra Striping**: Implemented alternating row background colors for high-density financial ledgers.
    - **Status Color-Coding**: Applied dynamic background fills to "Status" and "Pay Status" columns (Green, Yellow, Red).
    - **Automatic Vendor Sheets**: Automated the split of inventory items into dedicated sheets per vendor.

## [1.43.3] - 2026-03-29
### Refined
- **Finance UI Refinements [refactor]**:
    - **Readability Upgrade**: Scaled up font sizes and padding across payment transaction rows and overview panels for improved data legibility.
    - **Traceability Cleanup**: Removed redundant "Ledger" action from inventory item details to streamline navigation.
    - **Export Consolidation**: Centralized "Export XLSX" functionality exclusively in the Overview module, removing it from Inventory and Finance modules.
- **System Versioning**: Updated application to v1.43.3.

## [1.43.2] - 2026-03-29
### Changed
- **Inventory UI Gallery Fix**:
    - **Chevron Placement**: Scaled down and repositioned gallery navigation icons in the List view to prevent overlapping with item details.
    - **Strict Containment**: Added overflow constraints to the list view image container to ensure all floating elements stay within their designated bounds.
    - **Visual Clarity**: Enhanced icon contrast with deep drop shadows for better visibility across various image backgrounds.

## [1.43.1] - 2026-03-29
### Changed
- **Inventory UI Modernization**:
    - **Grid View Refinement**: Added dynamic, color-coded payment status borders and bubble indicators for immediate financial status awareness.
    - **Minimalist Actions**: Removed containers and borders from Edit/Delete action icons, transitioning to a clean, free-floating "Studio" style.
    - **UX: Click-to-Expand**: Enabled full-row clickability in the List View for deploying item details.
    - **Gallery Navigation**: Converted gallery chevrons in List View to free-floating icons for consistency with Grid View.
    - **Mobile Optimization**: Simplified expansion toggles to a minimalist "Studio-style" icon without backgrounds.

## [1.43.0] - 2026-03-28
### Changed
- **Top Bar Redesign**:
    - **Studio Aesthetics**: Implemented a high-density "StudioAction" component for vertically stacked icon + text labels.
    - **Deployable Search**: Search bars are now frameless and icon-triggered, maximizing space for module content.
    - **Compact User Profile**: Removed the avatar icon and minimized the "Welcome" section.
    - **Scalability**: Added responsive scaling to the top bar for better mobile usability.
- **Sidebar Branding**:
    - Moved the "Onyx.mx" brand tag closer to the icon for tighter visual alignment.
    - Increased vertical padding between the branding section and the navigation menu items for improved balance.

## [1.42.7] - 2026-03-28
### Fixed
- **Top Bar Alignment**: 
    - Resolved a collision where module bar icons (like the Overview grid) were rendering behind the Onyx logo FAB in hidden mode.
    - Linked the 'main-header' CSS class to the MainHeader component to correctly apply the 80px safety offset.

## [1.42.6] - 2026-03-28
### Changed
- **Sidebar Branding**: 
    - Simplified the expanded sidebar logo by removing the "Digital Studio" subtitle.
    - Added additional spacing (`mb-4`) under the brand name for a more balanced layout.

## [1.42.5] - 2026-03-28
### Fixed
- **Sidebar & Navigation**:
    - **Toggle Logic**: Corrected the FAB behavior to take desktop users directly to Expanded mode (v1.42.4 was stuck in compact).
    - **Mobile Compact View**: Fixed the mobile sidebar rendering, restoring the 80px icon-only mode and removing redundant text/chevrons that caused cropping issues.
    - **Header Collision**: Implemented a universal 80px offset for the main header in hidden mode to prevent module icons from overlapping the Onyx logo FAB.
    - **Redundant Toggle**: Removed the legacy mobile sidebar toggle button from the header, resolving the "weird empty button" visual bug in hidden mode.

## [1.42.4] - 2026-03-28
### Changed
- **Sidebar Redesign**:
    - **Header Layout**: Centered, vertical stack for logo and brand name in expanded mode with improved typography.
    - **Responsive States**: On mobile, the sidebar now cycles between 'Hidden' and 'Compact' to maximize space.
    - **FAB Safety Zone**: Added a backdrop 'safety area' when the sidebar is hidden to prevent overlap with the Top Bar.
    - **Padding Refinements**: Standardized top/left padding for all sidebar header states (Extended and Compact).
- **Layout Alignment**: Optimized desktop top-bar offset in hidden mode to align with the Onyx logo FAB.

## [1.42.3] - 2026-03-28
### Security
- **RBAC for Add Payment**: Restricted the "Add Payment" button visibility to Administrator and Developer roles. Clients and Vendors will no longer see this action, ensuring unauthorized users cannot initiate the payment wizard.

## [1.42.2] - 2026-03-28
### Added
- **Restored Add Payment Button**: Re-integrated a large, glassmorphic "New Transaction" action button at the top of the payment list for easy access to the payment wizard UI.

## [1.42.1] - 2026-03-28
### Added
- **Restored Payment Icons**: Re-integrated color-coded category icons (Development, Acquisition, Operations, etc.) into the transaction list rows for improved visual categorization.

## [1.42.0] - 2026-03-28
### Added
- **Inventory Action Relocation**: Moved Edit and Delete buttons from the primary list row to the expanded details panel in the Inventory List View. Added a dedicated high-density action bar with labeled buttons and status indicators.
- **Improved Status Visibility**: Integrated `CheckCircle` icons for approved items in the list view header for immediate visual confirmation.

## [1.41.1] - 2026-03-28
### Fixed
- **Date Parsing Logic**: Corrected an "Invalid Date" bug in the payment list by handling full ISO strings correctly before formatting.

## [1.41.0] - 2026-03-28
### Added
- **High-Density Payments UI**: Replaced row status buttons with vertical, color-coded left borders (`#8DC63F` for Paid, `#FACC15` for Requested) to maximize horizontal space.
- **Unified Traceability**: Consolidated individual item tags into a single, high-contrast "ITEMS" link that launches the `InventoryArtifact` pop-up.
- **Stacked Currency Toggle**: Refactored the global currency switch in the main header into a free-floating, borderless, stacked icon-text layout ($ + USD/MXN) for a minimalist "Studio" aesthetic.
- **CRATES Box Icon**: Implemented specialized `Box` iconography for `CRATES` items, replacing standard vendor text tags.
### Changed
- **Relocated Actions**: Moved secondary transaction controls (Status Toggle, Delete) into the expanded details panel to keep the primary list view clean and focused.
- **Filter Bar Optimization**: Reduced padding and icon gaps in the header filter bar for increased information density.
- **Minimalist Vendor Tags**: Transitioned vendor ID displays from bordered bubbles to color-coded, text-only labels.
### Fixed
- **Structural Integrity**: Resolved the unclosed map loop syntax error and missing `DollarSign` import in `MainHeader.tsx`.
- **Tailwind Refinement**: Streamlined background opacity classes from arbitrary values (`bg-white/[0.08]`) to standard format (`bg-white/8`).

### Added
- **Dynamic Inventory Artifacts**: Upgraded the item detail pop-up (Artifact Overlay) to fully support the global USD/MXN toggle. All unit prices and totals now switch dynamically with color-coded tags.
- **Contextual Exchange Rate**: Relocated the global exchange rate indicator from the Top Bar to the `Overview` module's "Expenses & Financials" section, positioning it next to the Mexico Total label for better relevance.
### Changed
- **Overview Module Density**: 
    - Converted the 6 operational expense category cards (Monthly, Supplies, Labor, Packing, Operations) to high-density dynamic currency fields.
    - Updated the Acquisitions Concentration pie chart tooltips to display values in the user's preferred currency.
- **Layout Alignment**: Standardized emerald/sky color logic across all currency tags for unified visual feedback.

## [1.39.0] - 2026-03-28
### Added
- **Global Currency Toggle**: Introduced a high-contrast `$+USD` / `$+MXN` switch in the `MainHeader`, enabling dynamic, real-time currency switching across the application.
- **Dynamic Financial Rendering**: Transitioned all list items and summary cards to a single, high-density currency field based on the global preference.
- **Large Vendor Tags**: Implemented expansive, color-coded vendor tags in the `TrackingPaymentsView` list for instant visual recognition of transactions.
### Changed
- **Payments UI Density**: 
    - Increased financial amount text size to `18px` in summary cards and list rows.
    - Improved layout vertical rhythm by condensing the subcategory filters and fixing status/action button overlaps.
- **Overview Module Alignment**: Updated KPI cards and request queue items to support the global currency toggle, ensuring cross-module data consistency.
### Fixed
- **JSX Structural Stability**: Corrected multiple nested tag mismatches and missing braces in `TrackingPaymentsView.tsx`.

## [1.38.1] - 2026-03-28
### Added
- **Filter Bar Toggle**: Integrated a sleek "Filters" On/Off switch in the top header for persistent visibility control.
- **Multi-Row Expansion**: Upgraded the payment item list to support simultaneous expansion of multiple transaction details for better comparison.
### Changed
- **Iconography**: Restored large, free-floating account icons (BBVA, BoA, etc.) in the filter bar, removing all frames and containers for a modern look.
- **Data Density Optimization**: 
    - Compacted the **FX Rates** and **Status Totals** overview panels by 20%, reducing padding and font sizes.
    - Global padding reduction across the Payments module to maximize information density.
    - Re-styled Subcategory filters as rounded pills with color-coded Lucide icons.
- **UI Refinement**: Standardized financial displays with side-by-side MXN/USD amounts using the `CurrencyTag` small variant.

## [1.38.0] - 2026-03-28
### Added
- **CurrencyTag Component**: Introduced a standardized, reusable component for displaying multi-currency financial data (MXN/USD) with consistent formatting and opacity-based visual hierarchy.
### Changed
- **Payments Module UI Overhaul**: Complete redesign of `TrackingPaymentsView.tsx` to align with the "Studio" aesthetic:
    - **Dynamic Stats Grids**: Replaced linear displays with responsive, stackable grid cards for FX Rates and Status Totals.
    - **Iconographic Filter Bar**: Implemented a blurred, floating filter bar with Lucide icons and specific color-coded subcategory buttons (Acq, Prod, Monthly, etc.).
    - **High-Density Card List**: Transitioned from a legacy HTML table to a modern, expandable card-list view with glassmorphism, depth-based shadow states, and animated row expansions.
    - **Finance Traceability**: Integrated Tag ID resolution directly into the payment cards, showing up to 15 linked items with vendor-specific color coding.

## [1.37.25] - 2026-03-28
### Changed
- **Dashboard Layout**: Reordered the primary dashboard panels. **Expenses & Financials** is now positioned on the left side (wider span), and **Storage & Logistics** is positioned on the right side.

## [1.37.24] - 2026-03-28
### Fixed
- **Distribution Analysis Data**: Optimized the **Shape + Description** grouping logic by implementing a robust description fallback chain. The system now resolves data through `short_description`, `item_description`, and `generatedDescription` if the primary field is empty, significantly reducing the "No Description" count in the distribution graph.

## [1.37.23] - 2026-03-28
### Improved
- **Financials Compaction**: Reduced the vertical footprint of the **Expenses & Financials** panel by ~20%. Optimized padding, font sizes, and layout density for high-fidelity information display.
- **Tag ID Parity**: Synchronized the Tag ID calculation logic between the **Overview** (Active Request Queue) and the **Finance/Payments** module. Both modules now use the same on-the-fly calculation utility, ensuring 1:1 matching for tags like `EM3265E0X`.

## [1.37.22] - 2026-03-28
### Fixed
- **Tag ID Parity**: Synchronized the Tag ID calculation logic between the **Overview** (Active Request Queue) and the **Finance/Payments** module. Both modules now use the same on-the-fly calculation utility, ensuring 1:1 matching for tags like `EM3265E0X`.
- **Logic Correction**: Fixed a variable naming mismatch that caused a lint error during tag resolution.

## [1.37.21] - 2026-03-28
### Fixed
- **Payment ID Correction**: Corrected the identifier displayed in the **Active Request Queue** details. Swapped generic barcodes for the official **Acquisition Code** (`book_aq_code`), matching the `EM3261ACQ` format for financial traceability.

## [1.37.20] - 2026-03-28
### Added
- **Shape + Description Analysis**: Introduced a new high-fidelity circle graph (donut chart) at the bottom of the **Global Distribution Analysis**. This combined metric provides a detailed view of item categories and their descriptions, complete with a categorical legend and frequency breakdown.
- **Enhanced Data Visualization**: Integrated a responsive ECharts implementation for attribute composition, featuring interactive tooltips and category-specific progress scales.

## [1.37.19] - 2026-03-28
### Fixed
- **Traceability Precision**: Corrected the identifier used in the `Active Request Queue` detail tags. Swapped generated codes for the official **Barcode Tag ID** (`book_barcode`), ensuring exact alignment with physical tracking labels.
- **Data Model Alignment**: Updated the core inventory schema and normalization logic to prioritize and correctly surface the database-level barcode and acquisition codes.

## [1.37.18] - 2026-03-28
### Fixed
- **Traceability Accuracy**: Corrected the identifier used in the `Active Request Queue` detail tags. Swapped generic item IDs for the specific **Book TAG ID** (full alphanumeric code, e.g. `AN...`) as generated in the internal tagging engine.

## [1.37.17] - 2026-03-28
### Optimized
- **Compact Hero Module**: Significantly reduced the footprint of the 'Mexico Total' panel by tightening padding and margins.
- **Micro-Typography**: Scaled down font sizes across all states of the total panel, including shortening the compact summary label to 'MX Total' for maximum space efficiency.

## [1.37.16] - 2026-03-28
### Added
- **Inventory Tag Tracking**: Integrated searchable 'Book Tag IDs' (e.g., AN-24-XXX) into the `Active Request Queue` payment details. This provides direct visibility into which specific inventory items are being paid for at a glance.

## [1.37.15] - 2026-03-28
### Optimized
- **Hover Interactions**: Key bottom stat icons (Acquisitions Value, Req Unpaid, Total Unpaid) now transition to full opacity on panel hover for improved interactive feedback.

## [1.37.14] - 2026-03-28
### Optimized
- **UI Refinement**: Reduced the font sizes for all text elements in the 'Mexico Total' hero panel (Label, USD, and MXN amounts) for a more compact and consistent high-density design.

## [1.37.13] - 2026-03-28
### Optimized
- **Financial Clarity**: Renamed the operational 'TOTAL' card to **EXPENSES** to better represent non-merch operational spend.
- **UI Refinement**: Added a subtle background tint and reduced the header font size for the `EXPENSES` card to distinguish it as the aggregate total of operational categories.

## [1.37.12] - 2026-03-28
### Optimized
- **UI Refinement**: Reduced the font sizes for "Mexico Total" elements across both expanded and compact views to improve visual density and balance.
- **Component Update**: Added a `small` variant to the `CurrencyTag` component for use in high-density areas of the dashboard.

## [1.37.11] - 2026-03-28
### Added
- **Logistics Financial Tracking**: Integrated financial data for Crates and Pallets directly into the `Storage & Logistics` panel, surfacing total USD/MXN payments alongside physical unit counts.

## [1.37.10] - 2026-03-28
### Optimized
- **UI Refinement**: Reduced the font size of the "Mexico Total:" label for better visual balance in both the main dashboard and compact summaries.

## [1.37.9] - 2026-03-28
### Added
- **Mexico Total Panel**: Promoted the global portfolio total to a dedicated high-fidelity "Mexico Total" panel within the Financials module.
- **Collapsible Analysis**: The `Global Distribution Analysis` section is now collapsible, featuring a rich compact summary of unit counts and total acquisition values.
- **Enriched Compact Summaries**:
    - `Active Request Queue`: Now displays total pending USD/MXN financial volume when collapsed.
    - `Expenses & Financials`: Now displays the "Mexico Total" (USD/MXN) as bullet info when collapsed.

### Optimized
- **Mobile Responsiveness**: Replaced static multi-column grids with adaptive Tailwind layouts (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-6`) to ensure readability on small screens.
- **Grid Layouts**: Operational categories and financial metrics now stack and scale correctly across breakpoints.

## [1.37.8] - 2026-03-28
### Added
- **Portfolio Aggregation**: Implemented a global "Portfolio Total" summary in the `Expenses & Financials` panel, consolidating all Operational Expenses and Acquisitions Values.
- **Multi-Currency Restoration**: Restored USD/MXN dual-currency visibility across all financial metrics and category labels.

### Optimized
- **Categorical Refinement**: Renamed the operational baseline from "Non-Merch" to **TOTAL** and removed its icon for improved visual focus.
- **Metric Scalability**: Increased the `Units` count font size to **28px** for better visual weighting in the stats row.

## [1.37.7] - 2026-03-28
### Optimized
- **Financial UI Cleanup**: Streamlined the `Expenses & Financials` panel by removing secondary MXN currency tags from operational categories.
- **Metric Refinement**: Removed the "Inventory Total" tag and MXN conversion from the `Units` count panel to focus strictly on the item quantity as requested.

## [1.37.6] - 2026-03-28
### Fixed
- **Dashboard Layout Fix**: Resolved the persistent vertical stacking of primary panels. The `Active Request Queue` (75%) and `Upcoming Payments` (25%) now correctly stack horizontally side-by-side using a 12-column grid starting at the `md` (768px) breakpoint.

### Optimized
- **Information Density**: Further refined typography to support high-density monitoring:
    - Main KPI values reduced to **22px** for a more compact dashboard.
    - Expense category labels increased to **11px** with significantly larger icons (**24px**) and persistent color-coding.

## [1.37.5] - 2026-03-28
### Optimized
- **Financial Hierarchy**: Increased the size of category labels (10px) and icons (20px) in the Expenses panel, matching them to their respective brand colors.
- **KPI Refinement**: Reduced the main metric font size from 32px to 26px for a more balanced and professional layout.
- **Queue Cleanup**: Removed the item-count percentage progress bar from individual requisition rows in the `Active Request Queue` to improve data scannability.
- **Layout Persistence**: Confirmed the 75/25 side-by-side grid split for the primary workspace on Desktop screens.

## [1.37.4] - 2026-03-28
### Optimized
- **Financial UI Refinement**: Relocated category icons to the top-right corner and enlarged them for better visual scanning.
- **Typography**: Main financial values now use color-matched typography (Emerald, Green, Amber, Rose) instead of default white.
- **Opacity**: Removed transparency from all text elements in the Expenses & Financials panel to improve readability.
- **Layout Distribution**: Updated the dashboard grid to a **75% / 25%** split between the Active Request Queue and Upcoming Payments.

## [1.37.3] - 2026-03-28
### Added
- **UI Restoration**: Reinstated high-fidelity v1.36.3 dashboard features.
- **Financial Layout**: Moved `Non-Merch` to the first position in the financials row.
- **KPI Enhancements**: Increased text size (32px) and relocated icons to the top-right corner for all bottom KPI panels.
- **Queue Optimization**: Expanded `Active Request Queue` width and integrated vendor color tags and payment descriptions.
- **Analysis Restoration**: Restored full Two-Panel Global Distribution Analysis, Horizontal Units Share bar, and Material/Color Attribution.

## [1.37.2] - 2026-03-28
### Dashboard Restoration & Financial Enrichment
- **Dual-Currency System**: Integrated MXN/USD color-coded tags across the entire Overview dashboard (Emerald for USD, Sky/Blue for MXN).
- **Active Request Queue**: Fixed icon transparency (100% opacity) and added dual-currency tracking for all queued items.
- **Upcoming Payments**: 
  - Enhanced grid density (up to 5 columns on large screens).
  - Implemented full vendor-brand background tiles with automated text contrast optimization.
  - Added horizontal progress bars for partial payment tracking.
- **Analysis Restoration**: Reinstated the "Global Distribution Analysis" and "Material + Color Attribution" to their full-width v1.36.3 layout for better data visibility.
- **UI Standardization**: Unified 18px/9px typography and border-radius tokens across all new panels.

## [1.37.1] - 2026-03-28
### Fixed
- **Overview Module [crit]**: Performed a complete structural restoration of the dashboard to resolve critical syntax errors, unclosed JSX tags, and state corruption.
- **Icon Restoration**: Restored missing `Activity` icon imports and stabilized the `isLoading` skeleton logic.
### Refined
- **UI Consistency**: Standardized the high-density "Studio" aesthetic across all collapsible panels (Storage, Financials, Requests, Payments).
- **Typography**: Optimized font sizes (18px KPIs, 9px labels) and color brightness (60% white for MXN) for maximum scannability.

## [1.36.3] - 2026-03-28
### Refined
- **Expenses & Financials**: Significant readability improvements for MXN values (increased font size to 18px and brightness to 60% white).
- **Label Consistency**: Standardized all bottom-row KPI labels (Non-Merch, Units, etc.) to a consistent size and color for better visual alignment.

## [1.36.2] - 2026-03-28
### Changed
- **Navigation**: Renamed "Shipping" module to "**Crates**" and "Packing" module to "**Labels**" in the main sidebar for better functional clarity.

## [1.36.1] - 2026-03-28
### Refined
- **Overview Module**: Significantly increased font sizes for financial and logistics KPIs to improve readability.
- **Data Density**: Added "Packed Efficiency" progress bar and percentage to the Storage & Logistics panel.
- **Logistics Logic**: Refined font weight and data label clarity for Pallets, Crates, and packed items.

### Fixed
- **Build Pipeline**: Installed missing `@google/genai` dependency to resolve Rollup resolution errors.
- **CSS Syntax**: Cleaned up Tailwind 4 `--variable` syntax in `MainHeader` to resolve build warnings.

### v1.36.0 — 2026-03-28
- **Global Exchange Rate [feat]:** Relocated the USD/MXN exchange rate to the main application top bar for persistent global visibility.
- **Top Bar XLSX Export [feat]:** Added a "Master Export" button directly to the Overview top bar, consolidating inventory and finance reporting access.
- **Overview Module UI Refinement [ui]:** Massively upgraded font sizes and information density across the Storage & Logistics and Expenses & Financials panels.
- **Vendor Color Coding [ui]:** Implemented vendor-specific color-coded backgrounds for Upcoming Payment cards to match established brand identities.
- **Partial Payment Progress Bars [feat]:** Integrated horizontal progress bars in both Upcoming Payments and the Active Request Queue to visualize completion status of partial disbursements.
- **Terminology Alignment [standard]:** Renamed all "Portfolio" references to "Acquisitions" for business logic consistency (e.g., Total Acquisitions Value).

### v1.35.1 — 2026-03-28
- **UI Squaring [ui]:** Standardized all dashboard and inventory panels to `rounded-xl` for a more professional, "squared" Studio aesthetic.
- **Dual-Currency Dashboard [feat]:** Added explicit USD/MXN labels to *all* financial KPIs in the Overview, including Acq Value, Req Unpaid, Total Unpaid, and Expense categories.
- **Logistics Dimension Fix [fix]:** Corrected dimension fetching in the Storage panel by mapping to `length_cm`, `width_cm`, and `height_cm` properties.
- **Storage Panel Density [ui]:** Refactored the Storage & Logistics panel to be smaller and more data-dense.
- **Upcoming Payments Refactor [ui]:** Transformed the payments grid into large, squared tiles with high-contrast centered typography.
- **Cleanup [ui]:** Removed the "Platform Sync" title from the main top bar for a cleaner interface.

### v1.35.0 — 2026-03-28
- **Studio Unification [ui]:** Unified Overview and Inventory modules with theme-aware CSS variables (`--sidebar-bg`, `--border-color`), replacing all hardcoded dark backgrounds for full Obsidian/Nacar/Stitch theme compatibility.
- **Financial Consolidation [feat]:** Merged individual KPI cards (Units, Acq Value, Requested, Pending, Total Unpaid) and the Expenses panel into a single high-density "Expenses & Financials" section.
- **Interactive Expense Navigation [feat]:** Clicking any expense category (Monthly, Supplies, Labor, Packing, Operations) now navigates to Finance > Payments with the corresponding filter pre-applied.
- **Total Expenses Logic [logic]:** "Total Expenses" now correctly sums only non-merchandise operational costs, excluding acquisition values.
- **Logistics Overhaul [ui]:** Renamed panel to "Total Crates and Pallets", fixed dimension fetching, added glass glow effect, and removed redundant telemetry/verification tags.
- **Upcoming Payments Density [ui]:** Upgraded from 2-col grid to a high-density 3–8 col adaptive grid for maximum vendor visibility.
- **Lint Fix [fix]:** Resolved duplicate `color` property in the `SectionHeader` component style object.

### v1.34.1 — 2026-03-28
- **Design Unification [ui]:** Unified the Overview module with the Inventory's "Stitch" aesthetic, adopting `#1C212D` card backgrounds, `border-white/10`, and standardized `rounded-3xl` radii.
- **Typography Cleanup [ui]:** Standardized all dashboard labels and section headers with the `font-black uppercase tracking-widest` style.
- **Sync Fix [logic]:** Fixed nested div and useMemo syntax errors introduced in the previous refactor.

### v1.34.0 — 2026-03-28
- **Logistics Hub [feat]:** Extracted Crates/Pallets into a standalone, high-density panel at the top of the dashboard with real-time telemetry for Packed vs. Empty units.
- **Interactive Material Graph [ui]:** Transformed the static 'Material + Color' analysis into a horizontal segmented bar graph with interactive tooltips.
- **Expenses Overhaul [ui]:** Refactored the Expenses section into a borderless, high-density tag-grid with large typography and MXN/USD breakdowns.
- **Clean-Up [ui]:** Removed the redundant 'Merchandise Status' panel to focus strictly on Logistics and Financials.

### v1.32.2 — 2026-03-28
- **Overview Optimization [ui]:** Removed the redundant 'Catalog' KPI and the 'Shape + Description' visualization panel to focus strictly on Logistics and Active Financials.

### v1.32.1 — 2026-03-28
- **Grid-Stackable Dashboard [ui]:** Refactored the 'Active Queue' and 'Upcoming Payments' into a side-by-side grid layout for optimized screen usage.
- **Floating Payment Tags [ui]:** Removed rigid background boxes from payment destination icons, making them "free floating" with backdrop drop-shadows.
- **Detailed Non-Merch Tracking [feat]:** Added real-time MXN/USD breakdown lists for Monthly, Supplies, Labor, Packing, and Operations categories.
- **Partial Production Fix [logic]:** Accurately calculates disbursed partial payments for production items using % paid matching.
- **Full-Width Attributes [ui]:** Expanded 'Material + Color' and 'Shape + Description' visualization panels to full-width containers.

### v1.32.0 — 2026-03-28
- **Overview Dashboard Overhaul [ui]:** Transitioned to a "Frameless" modern aesthetic with floating elements, backdrop-blurs (`bg-white/2`), and zero borders for a professional Studio look.
- **Unified Payment Queue [feat]:** Merged 'Priority Requisitions' and 'To be Requested' into a single, high-density vertical stack for faster payment processing.
- **Segmented Unit Share [ui]:** Replaced the legacy pie chart with a horizontal segmented bar graph for scannable vendor unit distribution.
- **Top-Level Payment Tracking [feat]:** Integrated a new tracking strip for Non-Merchandise (Monthly, Supplies, Labor, Packing, Ops) vs. Merchandise (Acquisitions, Production).
- **Attribute Analysis Dashboards [feat]:** Added new multi-dimensional visualizations for **Shape+Category** and **Material+Color** item concentrations.
- **Logistics Breakdown [ui]:** Added global Crates and Pallets count KPI to the dashboard strip.

### v1.31.3 — 2026-03-28
- **About Modal Reliability [fix]:** Resolved documentation loading failures by migrating logs to source-controlled assets, ensuring the 'About' popup is always high-fidelity.
- **Security Redaction [standard]:** Successfully scrubbed sensitive Cypher Keys and private development markers from all public-facing logs in the repository.
- **UI Simplification [ui]:** Removed the legacy 'Version History' tab to focus the 'About' experience on the latest release logs and system updates.

### v1.31.2 — 2026-03-28
- **Unified Master XLSX Export [feat]:** Consolidated Inventory and Finance reporting into a single, high-fidelity workbook.
- **App-Generated TAG IDs [standard]:** Standardized the export to use `[Vendor][Workbook][ItemNumber][Cypher]` format (e.g., `EM3261HXF`) for all inventory rows.
- **Dynamic Partial Payment Tracking [logic]:** Implemented live finance cross-referencing to correctly label items with active partial payments (identified by `%` in descriptions).
- **Vendor-Specific Sheets [ui]:** Automated generation of unique sheets per vendor within the master workbook.
- **Finance Ledger & Summary [ui]:** Included complete transaction history and aggregated balance summaries in the export.
- **TypeScript Lint Errors [fix]:** Resolved `setIsExporting` scope issues and ensured type safety for `updated_at` properties in the export routine.

### v1.30.5
- **Dynamic Payment Mapping**: Refactored the Inventory and Production filters to dynamically cross-reference the Finance module.
- **Cross-Module Sync**: Production items with partial payments (e.g. 50%) are now correctly identified and filtered despite database boolean column limitations.
- **Filtering Hardening**: Fixed a bug where partial status was lost due to database casting; the UI now derives payment status from live finance record descriptions.

## v1.30.4 — 2026-03-28
### Fixed
- **Partial Payment Tracking [fix]:** Resolved an issue where partially paid items (e.g., "50% paid") were erroneously stamped with a `pay_date`, causing them to show as **Green/Paid**. 
- **Indicator Priority [fix]:** `getStatusClass` now correctly prioritizes **Red/Partial** status when a percentage is detected in `pay_req`, even if a payment timestamp exists.
- **Pay Date Integrity [fix]:** Fixed `handleToggleStatus` in the Finance module to only stamp `pay_date` on inventory items for **Full Liquidation** payments. Partial payments now correctly update `pay_req` without triggering a full-paid state.
- **Data Synchronization [fix]:** Executed `backfill_v1_30_4.py` to restore 34 items to their correct partial/requested states in the database.

## v1.30.3 — 2026-03-28
### Added
- **Status Filter Refinement [ui]:** Refined the Global Status Toggle cycle to: All → **Partial** (Red) → **Requested** (Yellow) → **Paid** (Green).
- **Payment Filtering Logic [fix]:** Updated the Inventory view to distinguish between **Partial** payments (items with payReq matching a percentage) and **Requested** payments (items with payReq as true).

## v1.30.2 — 2026-03-28
### Fixed
- **Payment Status Write-Back [fix]:** When a finance record is marked **Paid**, linked inventory items now correctly receive a `pay_date` timestamp, showing as **Green/Paid** in the Inventory list.
- **Pay Date Revert [fix]:** Reverting a Paid finance record to Requested clears `pay_date` from linked inventory items.
- **`getStatusClass` Guard [fix]:** Items with `payReq = 'false'` or empty string no longer incorrectly show as YELLOW.
- **Client Approval [feat]:** `Client` role users can now mark inventory items as **Approved** from the list view (`dispersal_status = 'Approved'`).
- **Payment Indicator List View [feat]:** Each list item now shows a Pay Status chip (Paid/Requested/Pending) with accent border and glow dot.

## v1.30.1 — 2026-03-28
### Added
- **Inventory Sub-Header Redesign [ui]:** Refactored the "Types / Count / Total" panel into a compact, glassy sticky header (`backdrop-blur-xl`) with reduced font sizes and deep transparency for a professional "Studio" look.
- **Glassmorphic Sub-Header [ui]:** Content now scrolls seamlessly behind the semi-transparent sub-header with real-time blur.
- **Enhanced Status Toggle [feat]:** Replaced the linear status cycle with a business-driven multi-state filter:
  - **All** (Clear/Inactive)
  - **Acq+Prod** (Red): Unified filter for Acquisitions and Production items.
  - **Requested** (Yellow): Filters for items with active payment requests (`payReq`).
  - **Paid** (Green): Filters for items with confirmed payment dates (`payDate`).

## v1.29.9 — 2026-03-25
### Changed
- **Full-Width Crate Cards:** Refactored the "Empty Inventory" and "Packed Crates" views in the Crates tab to use a horizontal, full-width card layout for better information density and readability.
- **2x5 Grid Preview:** Replaced the single large wireframe icon in the Active Group sidebar with a stacked 2x5 grid of 10 smaller icons to visualize available capacity.
- **Selection Button Fix:** Corrected a logic bug in `PackingInventoryRow` that disabled the selection button for items already in the current crate. These items are now correctly selectable, enabling de-selection/removal from packed crates.
- **Improved Alignment:** Switched sidebar aspect ratios to better suit the new grid preview.

## v1.29.8 — 2026-03-25
### Changed
- **Unified Selection State:** Selecting any crate (empty or packed) now instantly pre-populates the "staged items" with its current contents. This "checks" the items in the inventory list, allowing for seamless addition/removal editing.
- **Overwrite Packing Logic:** Refactored `handlePackItems` from merge-mode to overwrite-mode. Saving a crate now commits the *exact* staged selection, making it easy to remove items by unchecking them or move them between crates.
- **Inventory Sync:** When items are removed from or added to a crate during editing, the `inventory` table's `crate_id` pointers are automatically synced (cleared for removals, set for additions).
- **Context-Aware Availability:** The "available" quantity calculation in the inventory list now correctly includes items already in the currently selected crate, so they can be re-selected or kept during editing without hitting "max quantity" limits.
- **UI Labeling:** The main action button dynamically switches between "Confirm Pack" (for new crates) and "Update Crate Contents" (for existing ones). The sidebar "Clear" button is now "Deselect Crate" and resets the left-pane view.

## v1.29.7 — 2026-03-25
### Fixed
- **Crash on Crate Selection:** Resolved a React #130 crash that occurred when drilling down into an empty crate size group in the Pack tab. Removed an obsolete component reference (`RotatingWireframeCrate`) from the drill-down preview panel, replacing it with the new static `LargeCrateWireframe` representation.

## v1.29.6 — 2026-03-25
### Changed
- **Volume Formulas Refined:** Internal crate volume now deducts 15 cm per axis (7.5 cm wall thickness × 2 sides): `(W−15)×(L−15)×(H−15) cm³`. Item volume uses padded dimensions adding 3 cm per axis (1.5 cm clearance × 2 faces): `(W+3)×(H+3)×(L+3) cm³`. Fill % is calculated as `Σ padded item volumes ÷ internal crate volume × 100`.
- **Stacked Fill Bar:** The Vol. Fill gauge now displays two segments — a solid bar for net item volume and a translucent bar for packaging padding volume — colour-coded emerald → amber → rose at 70%/90% thresholds.
- **Formula Chip:** A compact formula reference card is displayed below the fill gauge showing the three formulas used for internal, item, and fill % calculations.
- **Collapsible Sidebar Panel:** The Active Crate sidebar can now be collapsed to a minimal strip showing only the crate label, fill %, and a mini-bar. Expand/collapse via chevron toggle buttons.
- **Static Wireframe:** Removed `requestAnimationFrame` animation from the crate wireframe in the Active Crate sidebar and drill-down preview. Replaced with a clean static isometric projection (`LargeCrateWireframe`).

## v1.29.5 — 2026-03-26
### Added
- **Active Crate Sidebar:** When items are staged for a selected crate in the Pack tab, the left sidebar dynamically switches from the crate list to a focused **Active Crate Mode**. It displays: rotating 3D animated wireframe of the selected crate (using `requestAnimationFrame`), cubic-centimeter volume fill gauge (colour-coded emerald → amber → rose), a 2-col stat panel showing total units and total weight (kg), and a per-item staged summary showing TAG IDs, dimensions, and allocated quantity.
- **Rotating 3D Wireframe:** The static wireframe in the group drill-down view is replaced by a live-animated isometric wireframe rendered via SVG and `requestAnimationFrame`, giving perspective depth based on a continuous rotation angle. Pallets render as a 15cm-tall flat-bed, crates as standard cuboids.
- **Volume Fill Estimator:** Per-crate internal volume (cm³) is calculated from stored dimensions. Each staged item's volume is estimated from its own `widthCm × heightCm × lengthCm` fields. Fill % combines already-packed + pending items vs crate capacity, shown as a live progress bar with warning indicator above 85%.
- **Sidebar View Switch:** Cleared selection or no item staged reverts the sidebar back to the available crates/sizes list. A "Clear" button dismisses the active crate panel.

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
- **Top Bar Refactor:** Removed Onyx logo, "version": "1.50.0", inventory title, toggle financial, and toggle display buttons from the header for a cleaner layout
- **Search Bar:** Enhanced to full-width liquid glass style with responsive animations
- **Sidebar:** Relocated Onyx logo and version tag to the bottom of the sidebar (expanded + compact modes)
- **Dashboard:** Added "Lock Financial Info" toggle button to Admin Dashboard header
- **Inventory Filters:** Made filter panel collapsible with animated expand/collapse; added "Types" and "Count" tags above the inventory list; moved grid/list toggle into the inventory area
- **Payments Overview:** Separated payment summary from action buttons; removed "General Overview" and "Details" titles; added vendor color-coded bubbles with progress rings in minimal view
- **Payments Full View:** Removed Pending totals; MXN and USD values displayed side-by-side at equal size; "Add Payment" button moved inline with vendor request cards; removed "Add Expense" button
- **Payments Top Bar:** Shows compact summary stats and a "Show Overview" button when overview is collapsed
- **Destination Cards:** Replaced flat icon row with stacked card deck animation with spring physics on select/deselect

## v1.10.66
- Implemented automatic language selection at login: Spanish for Vendors, English for Admins, Clients, and Developers.
- Integrated AI-powered auto-translation (to English) and spelling autocorrection for Vendor product submissions in FastEntryForm and UploadEntryForm.

## v1.10.65
- Added new General Overview panel directly into TrackingPaymentsView for easier total viewing
- Fetched real-time Exchange Rate (USD-MXN) to display within the general payments overview
- Re-designed the details tab to properly include data-dense table and removed filter bar bloat
- Dashboard adjusted to a four column responsive grid, removed the land and retail totals
- Fixed placeholder image overlay bugs across inventory layouts

