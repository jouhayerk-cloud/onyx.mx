# Changelog
# 
## [1.80.0] - 2026-04-24
### Added
- **PDF Export Modernization**: Overhauled the PDF manifesto generator to use Portrait orientation.
- **Dynamic Crate Typology**: Implemented legacy backward compatibility to automatically classify 38x41x38 crates as "Boxes" in PDF exports and UI.
- **High-Visibility Formatting**: Detached the Crate/Box typology label from the metadata line in the manifesto header, upscaling it to a distinct 14pt bold format.
- **Compact Scannability**: Re-engineered barcode tag ID badges on the PDF with minimized padding and increased text scaling for better scanning reliability.
- **UI Stabilizations**: Resolved scrolling regression on available storage units panel in Logistics module.

## [1.79.0] - 2026-04-24
- **Multi-Window Independence [Desktop]**: Re-engineered state management to support multiple independent browser windows. Navigation, filters, and view-states now utilize `sessionStorage`, allowing side-by-side operation of different modules (e.g., Logistics and Finance) without interference.
- **Modernized Crates Packing Module**: Completely overhauled the packing interface with a high-fidelity "containerless" design.
- **Unified Image-Centric Intelligence Matrix**: Integrated all item metadata (Type, Size, Weight, and Barcodes) directly into high-fidelity image overlays for zero-clutter information retrieval.
- **Vendor Color-Coded Identity**: Implemented dynamic color-coding for Tag IDs based on vendor palettes for instant visual sorting during batch operations.
- **Zero-Container Aesthetic**: Removed all borders, rounding, and card frames for a sharp, "free-floating" professional interface.
- **Floating HUD & FAB**: Integrated a glassmorphic `ActiveCrateHUD` for real-time volume metrics and a persistent Floating Action Button (FAB) for streamlined packing confirmation.
- **Borderless Unit Picker**: Refactored crate selection into a vibrant, borderless unit grid with elastic hover effects and selection glows.

### Refined
- **Navigation Persistence**: Global settings (User, Theme, Language) remain shared across all windows, while UI-specific state is isolated per tab.
- **Logistics UX**: Cleaned up legacy syntax errors and optimized touch targets for warehouse handheld devices.

## [1.78.54] - 2026-04-13
### Added
- **PDF Presentation Suite**: Integrated a configurable export dialog allowing for custom PDF titles and layout choices.
- **High-Fidelity Export Modes**: Users can now choose between a compact "Catalog Grid" or a "One Image per Page" format for professional inventory documentation.

## [1.78.53] - 2026-04-13
### Added
- **Dashboard Analytics v2**: Implemented smart clustering for financial metrics and store-exclusion logic for more accurate procurement reporting.
- **Automated Title Casing**: Enforced professional title casing across all dashboard labels and chart axes.

## [1.78.52] - 2026-04-11
### Added
- **Inventory Selection Suite**: Launched "Batch Select" mode with single-click "Select All" and "Copy Tags" utilities, enabling rapid data extraction for external auditing.

## [1.78.49] - 2026-04-11
### Added
- **Logistics Density Visualization**: Integrated real-time fill-level indicators for crates and pallets, providing visual feedback on warehouse throughput and storage efficiency.

## [1.70.1] - 2026-04-20
### Added
- **Nexys Database Interface**: Modernized the low-level database management HUD with high-contrast UI elements and improved query responsiveness.

## [1.70.0] - 2026-04-18
### Added
- **Control Center HUD**: Centralized administrative tools and RBAC (Role Based Access Control) refinements into a unified, glassmorphic management panel.

## [1.69.0] - 2026-04-16
### Added
- **Store Interaction Suite**: Fully migrated store bag management to a high-performance interactive system with improved visibility and feedback during acquisition workflows.

### Added
- **Cinematic Full-Width Parallax**: The primary artifact image in the Store module now spans edge-to-edge behind the frosted details panel, utilizing dynamic `vh` scrolling logic for immersive parallax scaling.
- **Precision Keyboard Dismissals**: Fully integrated the `Escape` key to intelligently dismiss upper-layer modals, fullscreen viewers, and the details panel natively for desktop users.
- **UX Revisions**: Introduced a sleek, free-floating 'Return' button to the top-right of the fullscreen image viewer.

### Refined
- **Dynamic Bottom Bar**: Shrunk the initial open profile of the details panel from 65% to a zero-waste 45% profile to maximize media focus. Overhauled padding and gaps (`dPad`, `dGap`) globally.
- **Consolidated Financial Core**: The "Curation & Global Estimate" bottom section block was pruned entirely, bringing the USD estimate directly alongside the MXN base price.
- **Floating Controls Adjustment**: Safe-zoned the navigation `Close` button to the global top-right display border, clearing visual collision on mobile viewports.

## [1.66.27] - 2026-04-06
### Refined
- **Payment Detail Panel Aesthetic**: Implemented vendor color-coded Tag IDs with dynamic text contrast logic (`getTextColorForBg`).
- **Logistics UI Optimization**: Strategically hidden the "Tag ID" column for Logistics Crates to minimize redundancy, while maintaining layout alignment via `opacity-0`.

## [1.66.26] - 2026-04-06
### Added
- **Asset Aggregation [Logistics]**: Implemented fingerprint-based grouping in `TrackingPaymentsView` to consolidate identical crates and items into single summarized rows.
- **Quantified Wireframes**: Added vibrant quantity badging (`xN`) to isometric crate wireframes within the payment detail panel.
- **Enhanced Financial Clarity**: Replaced individual item rows with consolidated entries featuring Unit Price and Line Totals for bulk logistics payments.
- **Identity Summarization**: Integrated Tag ID summarization (e.g., `AN326... +14`) for aggregated asset groups.

## [1.66.25] - 2026-04-06
### Added
- **Isometric Crate Wireframes**: Integrated scaled isometric wireframe visuals for logistics items (crates/pallets) in the Payment detail panels.
- **Logistics Traceability Refinement**: Updated crate rows to display high-fidelity dimensions ($W \times L \times H$) and total item counts (e.g., `x15 items`) instead of generic placeholder text.
- **Visual Parity**: Implemented glowing vibrant wireframes that match the "Studio" design standard and reference imagery.
- **Refined Data Display**: Relocated technical IDs to a subtle mono-font placement under dimensions, removing them from the primary description block for a cleaner UI.

## [1.66.24] - 2026-04-06
### Added
- **High-Fidelity Payment Traceability**: Re-engineered linked asset cards in `TrackingPaymentsView` to match the professional "Studio" list aesthetic. 
- **Expanded Technical Specs**: Integrated `formatDimensionsImperial` and `formatWeightImperial` to display real-world measurements for all linked payment items.
- **Enhanced Financial Diagnostics**: Added vertical columns for AQ Code, LD Code, Individual Price, and Line Totals (Price * Qty) to provide full financial transparency within the payment detail panel.
- **Lookup Resolution Fix**: Resolved a critical issue where linked items with Supabase UUIDs were failing metadata resolution, ensuring all assets display their correct names and identity tags.

## [1.66.23] - 2026-04-06
### Added
- **Enriched Payment Asset Metadata**: Enhanced linked item cards in the payment detail view with vendor-specific Tag IDs (barcodes), combined Shape-Type-Color attribute strings, and prominent quantity indicators.
- **Color-Coded Identity**: Implemented high-contrast, vendor-colored pills for Tag IDs within the payment asset list.
- **Micro-Layout Optimization**: Balanced the distribution of expanded item metadata to ensure clarity and scan-ability at all screen sizes.

## [1.66.22] - 2026-04-06
### Refined
- **Payment Detail Panel Modernization**: Eliminated redundant metadata tags (Mtd, Ref, Hub) for a cleaner, high-density expanded view.
- **Linked Assets Aesthetic Transformation**: Redesigned linked item cards into compact, borderless rows with simplified metadata, improving vertical space efficiency and visual clarity.
- **Header Simplification**: Removed internal hub navigation buttons from the individual payment detail panels in favor of a focused, data-first presentation.
- **Tailwind Utility Optimization**: Fixed legacy Tailwind linting warnings (`max-w-full`, `max-h-full`) in the finance view.

### Fixed
- **Ghost Rendering Eradication**: Resolved a regression where numeric state variables were being accidentally rendered as "0" below item cards in Grid and Gallery views. Corrected using explicit boolean checks.
### Refined
- **Barcode & QR Rescaling**: Optimized the visual proportions of Identity Hub elements (Barcode and QR) to better suit high-density expanded layouts.
- **Centered Identity Hub**: Implemented `max-w-md` and horizontal centering for the barcode panel in expanded details.

## [1.66.20] - 2026-04-06
### Added
- **Inventory List View Refinement**: Item detail panels now auto-adjust to full screen width on large displays, utilizing a `max-w-[1600px]` constraint for a balanced visual experience.
- **Justified Data Layout**: Redesigned list row headers with justified column distribution and increased horizontal spacing (`gap-8`) for improved scan-ability on desktop.
- **Ergonomic Status Filtering**: Relocated the Payment Status Filter to the far-left of the Inventory Info Panel, optimizing user flow for status-based management.
### Refined
- **Responsive Navigation**: Enabled horizontal scrolling for expanded card details on mobile devices, ensuring zero layout breakage on smaller viewports.
- **Status Tag Visibility**: Standardized status tag placement to the far-right of every row header, providing a consistent visual anchor throughout the Inventory list.
- **TopBar Micro-Aesthetics**: Successfully upscaled username (14px) and Settings icon (24px) for a more luxurious, high-impact navigation feel.

## [1.66.19] - 2026-04-06
### Added
- **TopBar UI Modernization**: Upscaled the username font size from 11px to 14px and Settings icon from 18px to 24px for improved legibility and prominence.
- **Enhanced Settings Controls**: Refined the Settings icon stroke width and button wrapper size for a more luxurious and responsive interactive feel.
### Refined
- **Status Filter Modernization (Payments)**: Upgraded the status toggle to a 20px solid bubble design with an optimized 50px hit area.
- **Cross-Module UI Parity**: Synchronized the Payments module's "bubble" design language with the Unified Inventory Studio aesthetic.
- **Visibility Optimizations**: Resolved rendering and visibility bugs, ensuring status indicators are clearly displayed across all background and theme states.

## [1.65.0] - 2026-04-04
### Added
- **Store Module Redesign [Major]**: Transitioned the Store module to a high-density, multi-image "Gallery" aesthetic inspired by the Unified Inventory View.
- **Dynamic Gallery Grid**: Artifact cards now support high-fidelity multi-image grids (2x2, 3x2) with "+X more" overlays and interactive hover scaling.
- **Premium Detail Panel**: Redesigned the item detail view with Studio typography (Outfit/Inter), glassmorphic layout elements, and descriptive financial coding (ACQ/LND).
- **Acquisition Workflow Optimization**: Refined the "Mark for Acquisition" action with a high-contrast primary button and improved bag management notifications.
- **Theme-Aware Continuity**: Ensured 100% theme-aware styling and contrast consistency across the entire shopping experience.

## [1.64.7] - 2026-04-03
### Refined
- **Responsive Barcode Scaling**: Optimized barcode dimensions for high-density layouts and added `overflow-hidden w-full` constraints to ensure adaptivity to all screen widths.

## [1.64.6] - 2026-04-03
### Refined
- **Identity Hub SVG QR**: Switched to `QRCodeSVG` with `var(--main-color)` overlay for better visibility and theme integration.
- **Action Row Utility**: Relocated the "Copy Trace Link" utility from the barcode panel to a free-floating icon in the item card action row.
- **Logistics Integration**: Added a high-density Copy icon next to the Tag ID badge in `PackingModule` rows.

## [1.64.5] - 2026-04-03
### Changed
- **Free-Floating Identity QR**: The QR code is now a standalone, theme-colored element (non-white background) for a more integrated aesthetic.
- **Barcode Panel Optimization**: The high-density white panel now exclusively houses the barcode and its associated metadata (Tag ID, Copy button).
- **Responsive Hub Refactoring**: Improved the alignment of the Identity Hub components for better mobile and desktop readability.
### Added
- **Ultra-High-Density Identity Hub**: Minimalist, square-bordered design for QR and Barcodes.
- **Maximized Scannability**: Increased barcode thickness and QR dimensions.
- **Strategic Copy Utility**: Relocated COPY button for zero interference with codes.
- **Project-wide Standardization**: Unified aesthetics in Inventory and Logistics modules.

## v1.64.2 (2026-04-03)
- **Identity Hub Refinement**: Removed "Identity Hub" text labels for a more purely minimalistic aesthetic.
- **Tag ID Standard**: Enforced a project-wide standard for Tag IDs, showing only alphanumeric barcode IDs (e.g., `AN3261XODD`) and removing legacy dashed formats (e.g., `AN-1LVDFT9U`).
- **Global Deployment**: Updated Workbook, Logistics, and Inventory modules to ensure data-display consistency.

## v1.64.1 (2026-04-03)
## v1.64.0 (2026-04-03)
- **Logistics Module Redesign [Major]**: Modernized the Labels (Packing) system with high-fidelity QR/Barcode integration.
- **Artifact Traceability**: Added side-by-side Code 39 Barcodes and QR Codes to all expanded item detail views.
- **Vendor-Specific Branding**: Implemented dynamic brand color-coding for Tag ID badges across Logistics and Inventory modules.
- **QR Cloud Linking**: QR codes now point directly to `onyx.mx` artifact cloud endpoints.
- **Layout Optimization**: Removed redundant barcodes from compact Logistics rows to improve visual clarity and data density.


## v1.63.0 (2026-04-03)
- **Contrast Modernization [Major]**: Replaced over 300 instances of hardcoded white text and backgrounds with theme-aware dynamic variables.
- **Aqua Theme Accessibility**: Achieved 100% legibility across Dashboard, Finance, and Acquisitions modules in light mode.
- **Build Optimization**: Implemented `manualChunks` to split heavy libraries (ECharts, Lucide, DB) into separate bundles, reducing index load time.
- **Analytics Accuracy**: Theme-aware contrast for ECharts axis labels and grid lines.
- **Interactive Precision**: Updated all modals, slide-out drawers, and tooltips for consistent accessibility.


## v1.62.0 (2026-04-03)
- **Primary Theme Optimization**: Removed Earth, Cherry, and Stitch themes to streamline the visual experience.
- **Nacar Realism Overhaul**: Corrected Nacar colors to a honey-amber palette (#fffcf5/ #d4a373) matched to its natural source.
- **Enhanced Contrast**: Switched Nacar typography to a deep stone brown for superior legibility.


## v1.61.0 (2026-04-03)
- **High-Fidelity Theme Swatches**: Replaced gradient thumbnails with actual stone texture swatches in the Settings menu.
- **Reference HEX Integration**: Extracted and embedded theme color metadata (Primary/Accents) into the core assets engine.
- **Improved Selector UX**: Textured background support and better readability for theme labels in the appearance menu.


## v1.60.0 (2026-04-03)
- **Studio UI Modernization [Major]**: Transitioned to a high-performance, 5-layer animated CSS "Liquid Shades" background system, replaces legacy video backgrounds.
- **Dynamic Performance Mode**: Now uses theme-aware fixed gradients instead of flat colors for a premium static UI state.
- **Stone-Inspired Themes**: Refined Talan (Dark Shadow), Nacar (True Onyx), and Aqua (Coastal Earth) palettes.
- **Aqua Contrast Restoration**: Replaced hardcoded 'text-white' utility classes across all modules with theme-aware variables for 100% legibility in light themes.
- **Enhanced Inventory Design**: Optimized Quantity/Price tag hierarchies, implemented borderless glassmorphism, and reduced element rounding for a sharper, modern feel.
- **Redesigned Settings**: Compact, responsive, and data-dense settings panel with enhanced refresh sync controls.


## v1.58.12 (2026-04-01)
- **Financial Details Expose**: Injected granular financial breakdowns (Net Paid vs. Taxes/Fees vs. Total) into the Inventory Artifact and Unified Inventory modules, allowing precise itemized auditing.
- **Payments Module Traceability**: Redesigned TrackingPaymentsView and PaymentsArtifact to explicitly separate baseline transaction amounts from supplemental commissions and fees to prevent financial obfuscation.
- **Overview Request Queue Redesign**: Overhauled the expanded Active Request Queue view. Added dynamic contextual module icons (Logistics/Acquisitions/Operations), color-coded robust vendor tagging, and single-click direct access to Inventory Artifact overlays for linked items.

## v1.58.2 (2026-03-31)
- **Logistics Volume Optimization**: Refactored volume calculation logic into shared utilities (`getCrateInternalVolume`, `getItemPaddedVolume`) for absolute cross-module consistency.
- **Volume Fill Correction**: Resolved a critical bug where volume usage jumped to 100% on save; implemented explicit state resets for staged inventory to ensure accurate real-time reporting.
- **Enhanced Crate Visualizations**: Integrated dynamic, color-coded volume fill indicators into the Packed Crates wireframe icons with pulsating capacity alerts.
- **Unpack All Functionality**: Added a one-click "Unpack All" feature in the Packing Manager to safely reset crate contents and restore item availability.
- **Logistics Tag Upgrades**: Implemented vendor-specific color-coding for TAG IDs and integrated secondary Code 39 barcode displays for physical logistics scanning.
- **Client Dummy Modules**: Launched a suite of simulated modules (`dummyAddEntry`, `dummyCrates`, `dummyLabels`, `dummyProcess`) enabling client interaction without database persistence.


## v1.57.1 (2026-03-30)
- **Tagging Precision [Engine]**: Enhanced `getStatusClass` logic to check both `pay_req` and `status` columns.
- **Requested Status Fix**: Resolved regression where items were mislabeled as "New" after edits.
- **Production Tagging**: Introduced dedicated Blue `Production` tag for items in progress.
- **Workflow Sorting**: Updated "Status" sort sequence to prioritize financial urgency.

## v1.57.0 (2026-03-30)
- **Inventory Edit Redesign [Studio]**: Completely overhauled the Edit Panel to match the "Manual Entry Form" aesthetic.
- **Visual Identity**: Integrated vendor selection bubbles and status tabs (Available, Production, Acquisition) for a more intuitive experience.
- **Logistics & Financials**: Added dedicated sections for physical dimensions (W/H/D), weight (KG), and acquisition price (MXN).
- **Core Restoration**: Reintroduced missing financial metrics (`LD Code`, `Landed USD`, `Retail USD`) and physical metrics (`Weight`) to list/grid views.
- **Administrative Tools**: Implemented the "Hide Artifact" (Delete) button for authorized roles to manage inventory visibility without data loss.

## v1.56.0 (2026-03-30)
- **Dashboard Panel Optimization [Layout]**: Implemented responsive panel behaviors based on screen size on load.
- **Large Screen Maximization**: All modules (Logistics, Financials, Queue, Payments, Analysis) now load maximized on large screens (>1024px).
- **Small Screen Minification**: "Expenses & Financials", "Storage & Logistics", and "Upcoming Payments" now auto-minimize on mobile and tablet views to improve usability.

## v1.55.1 (2026-03-30)
- **Filter Bar Stabilization [Bug Fix]**: Resolved a critical issue where Category and Material discovery bars were failing to deploy.
- **Toggle Logic Calibration**: Fixed boolean toggle errors in the `onClick` handlers for filter icons.
- **UI Restoration**: Fully restored missing JSX components for multi-layered filter bars in the Inventory module.

## v1.55.0 (2026-03-30)
- **Inventory UI Redesign [Layout]**: Replaced vertical absolute-positioned Sort and Filter menus with a consolidated horizontal button group in the top panel.
- **Icon-Only Discovery**: Implemented visual-only triggers (Tag, Layers, Box) for Vendor, Category, and Material discovery panels to maximize screen space.
- **Horizontal Sort Control**: Integrated Date, Status, Vendor, Category, and Material sorting into a single row, appearing conditionally on `isSortMenuOpen`.
- **System Restoration**: Successfully recovered and stabilized the `UnifiedInventoryView.tsx` component logic after a structural regression.
- **Global Deployment**: Published the v1.55.0 update to production.

## v1.50.0 (2026-03-30)
- **Compact Financials Dashboard [major]**:
    - **Multi-Segment Bar Graph**: Engineered a custom visualization for Mexico Total, Expenses, Acquisitions, and Unpaid amounts in a single compact bar.
    - **Default Entry State**: Updated the Overview module to load in "Compact Mode" by default for faster auditing.
    - **Interaction Design**: Integrated seamless click-to-expand transitions between compact and granular financial views.

---
