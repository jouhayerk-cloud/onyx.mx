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
-->

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

