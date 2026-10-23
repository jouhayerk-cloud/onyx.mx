# Build log

One entry per deploy day on main. Version 2.0.<commit>. Summaries written by the local Colibri model.

## [2.0.0a38331] - 2026-10-21
### 10 commit(s)
- Fixed catalog hub retry logic to only re-run ticked processes and corrected mask and hex map cleaning for cut photos.
- Updated lamp descriptions to remove references to open or closed tops while keeping titles unchanged.
- Added local SAM 2 segmentation service for cutouts and maps with fallback to Tailscale routing and improved aspect ratio handling.
- Redesigned the catalog hub with a responsive phone and tablet layout, compact top bar, and polished desktop view.
- Improved system stability by accepting engine busy tests and settling orphan operations when the system is idle.

## [2.0.f9f6b4b] - 2026-10-19
### 3 commit(s)
- Improved inventory list performance by precomputing keys, deferring filters, and loading Excel/PDF chunks only when needed.
- Enhanced touch and small screen experience with lighter glass effects, removed layout animations, and added idle-aware gaze tracking.
- Optimized DataSyncProvider to mount once in App.tsx, eliminating duplicate subscriptions and improving real-time sync efficiency.
- Implemented passive hot listeners and deferred dialog mounting to reduce unnecessary rendering and improve responsiveness.
- Added chunk prefetching and startTransition view switching to ensure smoother interactions during page transitions.

## [2.0.cd21d3d] - 2026-10-18
### 24 commit(s)
- Fixed Colibri provider settings to prevent stale IP addresses and removed obsolete link options while allowing custom endpoints to be typed and saved without reloading.
- Improved search and inventory summaries to include descriptions, skip hidden rows, return accurate MXN totals, and resolve book aliases correctly for better data accuracy.
- Enhanced chat performance by reducing token limits, streamlining tool calls, and optimizing prompt sizes to prevent GPU overflow and slow response times.
- Updated the chat interface with larger text sizes based on island dimensions, added production-only database queries, and fixed PWA iframe rendering issues.
- Adjusted user presence detection to show online status only after recent pings, added AI device key prompts, and included new developer tools and links.

## [2.0.71977fb] - 2026-10-17
### 45 commit(s)
- Unified Book 826 taxonomy and prompts with validators, added open/closed top persistence, and introduced the Phomemo Label Print Studio alongside the Packaging Studio.
- Enhanced print capabilities with crisp integer-module Code 128 and M110 templates, live batch print views, and a virtual Phomemo printer that simulates timing errors without writing data.
- Improved inventory and warehouse views with denser glass styling, expanded item details, 3D drag-rotate/zoom, and cardboard fold animations while retiring the rock style.
- Fixed barcode sizing and module widths, locked designer frame messaging to the same origin, and corrected packaging calculations for foam padding and crate wall heights.
- Updated the UI with LiquidOnyx as the sole style, added SVG refraction as an opt-in test effect, and removed the Barkod experiment in favor of the new layered Barkod style.

## [2.0.52083c9] - 2026-10-16
### 36 commit(s)
- Added Night Wave offline fallback, dashboard people and devices views, warehouse tracking, private presence channels, and tag color validation.
- Introduced Liquid Glass styling on the home screen with collapsible bubbles, new island layout, and updated warehouse, logistics, and admin control center cards.
- Fixed iOS fullscreen shell behavior, app root positioning, and Safari glass rendering issues including refraction and backdrop filters.
- Enhanced AI capabilities with a new generation panel, smart task routing, and improved settings interface with compact grouped lists.
- Updated branding with new logo assets, fixed XSS vulnerabilities in print popups, and aligned Colibri settings with correct CORS and port configurations.

## [2.0.f4bef80] - 2026-10-15
### 9 commit(s)
- Consolidated settings into two unified tabs with Liquid Glass animations and added dual-mode presence telemetry for Colibri and MCP bridges.
- Replaced the static chan sprite with an animated Onyx logo and updated the loading message to Onyx-mx.
- Fixed a console flood caused by missing RPC pings, optimized real-time bridge subscriptions, and corrected PWA navigation loops.
- Deployed the new Warehouse and PackWizard studio with Hairline 3D engine support and optimized production base URLs.
- Restored light and dark 3D liquid glass icons, added self-healing bootstrap logic, and improved mobile settings layout.

## [2.0.4634317] - 2026-10-12
### 16 commit(s)
- Added a bilingual benchmark harness, item embedding synchronization runner, and hybrid search hook to improve vector search accuracy.
- Deployed an on-device embedding service, iOS companion app, and SQL migration to support local processing and data integrity.
- Fixed foreign key type mismatches and resolved actor reentrancy issues in the Swift bridge and vendor RLS.
- Established CI workflows, refresh scripts, and runbooks to streamline testing and deployment for new embedding modules.
- Released Workbook V3 with a book picker on the Inventory island Export to manage finance ledgers and inventory items.

## [2.0.7ad182c] - 2026-10-11
### 32 commit(s)
- Fixed mobile pinch-zoom to prevent losing unsaved work and triggered pull-to-refresh, while adding fixed-size app layout and saving view state and chat on the device.
- Improved Chan chat stability by preserving conversation across drawer closure and island compaction, with clearer answer bubbles and a new vendor XLSX import format.
- Unified AI provider routing to Ollama, OpenAI, and Anthropic with bring-your-own-key support, introducing a per-Type prompt system and multi-provider key store.
- Redesigned the Add Entry screen with larger text, collapsed details fields, dynamic hairline selectors, and a new lamp figure system with unified taxonomy.
- Updated the sidebar to v2 with a flat role map, removed visible version numbers from the header, and corrected product categorization rules for canoes and bowls.

## [2.0.3637f66] - 2026-10-10
### 64 commit(s)
- Added MCP panel support for reading tokens from the clipboard, validating formats, replacing old entries, and connecting via environment variables or macOS/Linux variants, while updating Spanish strings and removing the token placeholder from help cards.
- Enhanced export functionality to match Workbook V2 vendor sheets with shared columns, cached totals, frozen headers, and robust sanitization that prevents Excel repair prompts by fixing NaN values and invalid dates.
- Fixed critical bugs where the export action generated empty workbooks due to timing issues, list titles scrolled behind pinned headers, and security roles incorrectly exposed internal inventory columns or retail book data.
- Improved Siri and MCP integration with new personal token management, device telemetry tools, and stricter role enforcement, alongside updated runbooks, smoke tests, and deployment guides for the go-live kit.
- Restyled the settings panel with Apple-style grouping and a compact system logs view, refined the sidebar toggle button size, and corrected UI issues like search bar focus, ARIA accessibility, and contrast ratios.

## [2.0.c8ea0be] - 2026-10-09
### 30 commit(s)
- Redesigned entry types with new tile-based pickers, restored known sizes, and added shape variants for lamps, mirrors, and table lamps.
- Launched Onyx Island v3 with a unified surface, improved welcome page, and enhanced print center legibility across all UI components.
- Implemented robust job tracking for all export formats including PDFs, manifests, and labels to ensure single-job processing and better error handling.
- Upgraded AI capabilities with new studio backgrounds, improved model selection logic, and fixed critical issues preventing chat loops or image failures.
- Refactored print and trucking exports to use shared rendering logic, cleaned up legacy code, and added comprehensive documentation for future development.

## [2.0.0c9ec12] - 2026-10-08
### 2 commit(s)
- Fixed PDF preview z-index to display correctly over the Label Wizard layering.
- Corrected Universal Tools Bar labels button, Label Wizard z-index, and iframe paths.
- Resolved layering conflicts between the PDF preview and the Label Wizard interface.
- Updated iframe paths and button labels within the Universal Tools Bar.
- Ensured consistent z-index positioning for the Label Wizard and related components.

## [2.0.7a7c9e9] - 2026-10-07
### 9 commit(s)
- Updated branding assets including the favicon, iOS app icons, and mascot to reflect the new Onyx Mini identity.
- Improved mobile layout by removing unnecessary gaps, optimizing island tools visibility, and hiding the legacy top bar.
- Fixed critical island issues where tools appeared disabled and restored the app top bar with proper blur and padding.
- Enhanced the island experience with dynamic sizing, hover labels, and optimized surface grid spacing.
- Removed debug elements and legacy state flags to clean up the codebase and improve rendering stability.

## [2.0.33ee636] - 2026-10-06
### 1 commit(s)
- Fixed local asset resolution by adjusting Vite base configuration for testing.
- Improved build process to ensure correct asset paths before deployment.
- Resolved issues where local development assets failed to load properly.
- Updated build settings to align local environment with production requirements.
- Enhanced development workflow for smoother asset handling during testing.

## [2.0.5e01840] - 2026-10-05
### 8 commit(s)
- Updated the welcome mascot to a custom 3D Onyx Chan and redesigned the mobile interface with new tactile switches and optimized WebGL bursts.
- Replaced the SVG brand mark with a new 3D WebP glass cube logo and regenerated all PWA app icons to match the updated branding.
- Integrated hairline isometric 3D figures and the page mascot Cube into the WelcomeView while centering the inventory card and increasing cabinet size.
- Fixed shader math errors that were turning beige stone colors into neon pink and corrected WebGL gradient brightness and saturation issues.
- Removed the welcome tutorial, fixed the mascot base URL path, and replaced the liquid gradient mesh fallback with stone colors while removing CSS polling timeouts.

## [2.0.a6367af] - 2026-10-04
### 68 commit(s)
- Implemented print label rendering with 1-bit canvas support and established foundational shells for Excel and PDF export engines.
- Launched the Onyx Island v2 interface with a liquid glass surface, face-centred launchers, and integrated notification centers and toasts.
- Redesigned the sidebar and menu systems into independent glass components, removing the traditional top bar and header rows from all views.
- Refactored the Archived module with improved data handling, filter logic, and UI stability while integrating it into the new island architecture.
- Documented the complete Wave IV workflow, including design specs, research outputs, and implementation plans for the new island and print features.

## [2.0.e03bd05] - 2026-10-03
### 6 commit(s)
- Added an overview route visible only to Admin and Developer users.
- Redesigned device surfaces to include fleet cards, telemetry sparklines, run timelines, command lifecycles, and a packing board based on real telemetry.
- Established device foundations with the onyxMcpClient, useDeviceChannel hook, removal of fake telemetry, and elimination of silent broadcast fallback.
- Completed the redesign of step 5 with final review fixes, a kit Dialog, Spanish string updates, and a vendor list.
- Fixed the colour-coded vendor picker in Add Entry and Batch Create, then merged a single screen for Add/Edit Entry featuring AI Generate and Batch Create on the kit.

## [2.0.0cba9ad] - 2026-10-02
### 2 commit(s)
- Fixed generated SVG files that were displaying as empty outlines
- Added a shared UI kit to the application
- Updated the run engine and rebuilt the Catalog Hub with new design steps
- Completed redesign steps 2 and 3 for the Catalog Hub
- Delivered the new shared UI kit alongside the rebuilt Catalog Hub

## [2.0.9b0567a] - 2026-10-01
### 1 commit(s)
- Added a dedicated AI layer to every inventory screen as the first step of the redesign.
- Implemented the new AI infrastructure to support future inventory features.
- Completed the foundational work required for the upcoming inventory interface overhaul.
- Established the AI framework that will power next-generation inventory tools.
- Finished the initial phase of the inventory redesign by deploying the AI layer.

## [2.0.88c1166] - 2026-09-30
### 10 commit(s)
- Fixed production build issues where glass blur effects were missing and corrected service worker installation for offline mode.
- Updated branding assets to include a consistent vector cube for favicons and logos, while organizing source artwork outside the public folder.
- Improved batch photo uploads to attach images by filename and upload four at a time, while preserving spreadsheet text exactly as typed.
- Corrected pricing calculations to use the 17 MXN book rate for entries and previews instead of the previous 19 MXN rate.
- Standardized icon versioning across all icon URLs and added the Onyx MCP server and edge function sources.

## [2.0.94ec71b] - 2026-09-23
### 2 commit(s)
- Fixed in-app OnyxLogo components to use the new favicon.svg
- Updated favicons and deployed recent AI features
- Redesigned the interface with a new liquid glass style

## [2.0.76ee9a7] - 2026-09-21
### 9 commit(s)
- Restored the colour-coded vendor selector in Add Entry and fixed the missing app icon and start URL.
- Improved full-screen layers to clear the iOS status bar and allowed the standalone app to run beneath it with a lighter glass effect.
- Added real liquid glass to the top bar behind the iOS status bar and made SLAB surfaces translucent so bars are visible through them.
- Extended the layout under the iOS notch and home indicator while passing batch wizard and catalog surfaces from SLAB to LABS.
- Enabled building item geometry from type and dimensions while maintaining segmentation.

## [2.0.5dec5a9] - 2026-09-19
### 6 commit(s)
- Implemented a unified font system that loads once to improve performance.
- Fixed the trailer map visibility and resolved issues where zooming caused the view to collapse.
- Redesigned the Standard and Spacious inventory views to use a card layout.
- Rebuilt the public tag page to display curated server records more effectively.
- Added a dense inventory list with priority stacking in the details panel and extended mesh gradients to SLAB surfaces.

## [2.0.ba2ede3] - 2026-09-09
### 4 commit(s)
- Fixed color pattern metafields to use Blue instead of Turquoise or Aqua.
- Corrected image rows to properly export variant fields and stock quantities.
- Reverted the feature to state stock at both Art Of Decor and REG locations.
- Added the feature to state stock at both Art Of Decor and REG locations.
- Updated the release notes to reflect the final state of stock tracking.

## [2.0.b178ee2] - 2026-09-08
### 4 commit(s)
- Added validation to ensure variation pass output matches inventory records.
- Resolved 13 typecheck errors, reducing the total count to zero.
- Corrected the wholesale column header from 'Décor' to 'Art Of Decor'.
- Split the Shopify export functionality into separate sheets for photos and icons only.
- Improved data integrity and export clarity through new validation and structural changes.

## [2.0.7ba4fd9] - 2026-09-07
### 21 commit(s)
- Improved media handling by hoisting classification logic, adding a column to the Shopify export report, and ensuring image-only batches fill missing data.
- Enhanced item presentation with new axonometric icons for missing photos, generated catalogue copy, and numeric suffixes for colliding Shopify handles.
- Fixed data integrity issues by correcting vendor names and tags in exports, resolving remaining mismatches, and repairing the packing list export.
- Strengthened the codebase by deriving inventory types from the schema, narrowing the sync surface, and repairing the query layer against the real database.
- Resolved TypeScript errors, added generated database types, and merged fixes for catalogue images and in-app PDF reviews.

## [2.0.e8ffe28] - 2026-09-06
### 3 commit(s)
- Fixed multicolor spelling errors and corrected Shopify export functionality.
- Updated the onyx colour vocabulary to ensure consistency across the app.
- Improved catalogue image fetching performance and renamed Shopify and Isometric modules.

## [2.0.e8f4b98] - 2026-09-05
### 2 commit(s)
- Merged the slab crate indicator and compact warehouse crate card into a single view.
- Combined the Shopify-split catalogue, video exclusion, and image failure reporting features.
- Consolidated slab and warehouse crate indicators for a unified interface.
- Integrated catalogue splitting, video exclusion, and image reporting into one module.
- Unified slab and warehouse crate cards while merging catalogue and reporting tools.

## [2.0.9a8a9e3] - 2026-09-04
### 2 commit(s)
- Fixed catalogue size and tool-bar icon sizing issues
- Resolved catalogue export errors and adjusted tool-bar icon dimensions
- Corrected catalogue layout and improved tool-bar icon appearance
- Addressed catalogue export functionality and refined tool-bar icon sizing
- Finalized catalogue size adjustments and standardized tool-bar icon dimensions

## [2.0.54ed78c] - 2026-09-03
### 9 commit(s)
- Merged Spanish UI catalogue and fixed a bug where the role default overwrote the chosen language.
- Added translations for the batch wizard, store module, AI content filters, and crates inventory module.
- Fixed three translation bugs, repaired mojibake in the trucking UI, and enabled batch completion to save to the database.
- Updated the cabling module to remove power cords instead of protecting them as cabling.

## [2.0.6310a3f] - 2026-09-02
### 6 commit(s)
- Fixed invisible re-cleaned images and corrected "Luminarie" references across all generated rows.
- Improved performance by warming catalogue images in parallel and removing unnecessary CORS requests for Drive images.
- Updated Shopify export to consolidate data into a single workbook with three sheets.
- Added sanitization for two new sheets before writing them to prevent data errors.
- Resolved multiple issues related to image visibility and data integrity in the inventory system.

## [2.0.d8fe846] - 2026-09-01
### 19 commit(s)
- Fixed dark room bleeding onto stone surfaces and corrected backdrop color measurements to ensure accurate inventory data.
- Implemented AI content classification and filters to meet content rules, clean images, and prevent data loss during recovery.
- Added QR code and table icons to the interface, updated glyph sizes, and improved header alignment for better usability.
- Replaced generative backgrounds with large rooms at shallow depth of field and separated image processing from text work.
- Merged Spanish UI translations, expanded the readout tab functionality, and refined key spacing and corner scaling.

## [2.0.1948833] - 2026-08-31
### 6 commit(s)
- Fixed a missing i18n runtime issue that was breaking the main build.
- Improved performance by limiting inventory rendering to what is currently on screen.
- Added bounded shape filters, retired Fluorite/Nacar/Paper variants, and extracted shape taxonomy into a new module.
- Introduced print job tracking, smart filters, and the Printables neumorphic pass.
- Added per-season filters, an info notch, and the neumorphic state grammar.

## [2.0.edd3fd3] - 2026-08-30
### 5 commit(s)
- Fixed inventory edit to prevent book_barcode from being overwritten by item_id
- Updated the toolbar, sidebar, and header to match the new SLAB style
- Resolved HTTPS mixed-content warnings appearing in the devices module
- Corrected the inventory tag display to properly show landed codes
- Merged the season-826 and pico-baseline feature branches

## [2.0.3aa5287] - 2026-07-26
### 1 commit(s)
- Integrated Catalog Hub with a side-by-side PDF layout.
- Sanitized Excel XML corruption to ensure data integrity.
- Added on-device hex bitmap processing for improved performance.

## [2.0.cc2f525] - 2026-07-20
### 14 commit(s)
- Reverted iOS image loading to lh3 and fixed transparent PNG rendering to resolve ITP blocking and lazy loading issues.
- Updated Shopifier title, added a Clear Gen button, and replaced batch base64 fetching with direct lh3 URLs for faster image rendering.
- Implemented shape-specific preprocessing for Cylinders to improve local AI background removal and restored gemini-2.5-pro with a 2x exposure boost.
- Added auto-conversion for legacy PNG masks to WebP, capped mask sizes to 1600px, and fixed the legacy optimization script for better performance.
- Fixed polygon logic to apply only to mirror_glass, upgraded to gemini-1.5-pro, and resolved callGemini timeout bugs to prevent API hangs.

## [2.0.27791ed] - 2026-07-19
### 21 commit(s)
- Fixed mirror center hole detection and updated segmentation prompts to ensure accurate inner polygon extraction and seamless stitching.
- Corrected PDF export transparency issues, resolved UI loops during mask regeneration, and added missing delete buttons and CORS fallbacks.
- Enhanced Shopify export to include comprehensive tag and dimension data while optimizing AI generation to prevent interface freezes.
- Improved batch processing capabilities with new export features, separate download controls, and updated catalog PDFs to reflect generated titles.
- Resolved critical bugs in image handling, vendor color mapping, and syntax errors to ensure stable multi-image support and accurate item formatting.

## [2.0.a983ca7] - 2026-07-18
### 1 commit(s)
- Fixed Shopify export to display variant costs in landed price USD
- Updated inventory calculations for accurate landed cost reporting
- Improved export accuracy for international variant pricing
- Enhanced data consistency across Shopify and internal records
- Resolved currency conversion issues in variant cost columns

## [2.0.b2c8175] - 2026-07-15
### 13 commit(s)
- Reverted column blanking logic and corrected the exclusion of 825 payments from the vendor payments list.
- Fixed workbook export issues including scope errors, duplicate declarations, and improved sorting for tag IDs.
- Updated workbook exports to leave O and Q columns blank for 825 items, add blue color coding, and move 825 items to the top of vendor tabs.
- Enhanced DataSyncProvider to fetch all finance records and refined regex patterns to strictly distinguish between 3-digit workbook codes.
- Improved Shopify export functionality by fixing vendor extraction fallbacks, updating vendor name mappings, and robustly collecting images with correct Google Drive URLs.

## [2.0.a9dc60b] - 2026-07-14
### 13 commit(s)
- Fixed Shopify export issues including missing data, reference errors, and incorrect item inclusion while adding category mapping and direct image links.
- Added a new button to export Shopify data to Excel and updated the export format to use creation dates instead of payment dates.
- Corrected errors in the V2 export module regarding shipment references and fixed duplicate variable declarations.
- Resolved duplicate import issues for ShoppingBag and ensured vendor payments and truck deployments are now properly tracked.
- Updated the workbook features to improve overall export stability and data accuracy across all modules.

## [2.0.0a081a0] - 2026-07-13
### 1 commit(s)
- Updated WorkbookV2 to include TRK consolidated sheets using V2 columns
- Enhanced data consolidation capabilities within the workbook interface
- Improved column alignment for TRK tracking data in version 2
- Streamlined the process for generating consolidated TRK reports
- Optimized workbook performance for large-scale TRK datasets

## [2.0.84b8ef1] - 2026-07-10
### 4 commit(s)
- Updated the Trucking Trailer Map UI and canvas sizes for better layout.
- Restricted the All Crates and Trucking Library tabs to display only deployed and in-transit units.
- Added View Deployment and Back to Warehouse actions within the Trucking Library.
- Updated WorkbookV2 to color Tag IDs and Payments rows based on their current Payment Status.

## [2.0.e60fa1b] - 2026-07-09
### 1 commit(s)
- Fixed Warehouse crate filtering to prevent empty crates from appearing as Deployed.

## [2.0.4ca7a54] - 2026-07-08
### 13 commit(s)
- Fixed workbook export spacing and restored full format while adding dynamic image columns with hyperlinks and styling.
- Improved crate management by updating the UI to show partial contents without modals and fixing status filtering logic.
- Enhanced the export wizard with multiple sender support, truck plate tracking, and an HTML generator for better reporting.
- Reverted trucking module to local-only trailer positions and removed database sync hooks to improve performance.
- Added vendor IH support and updated warehouse packing functionality with denser visualization and item removal options.

## [2.0.a8d2b36] - 2026-07-07
### 5 commit(s)
- Export functionality now consolidates selected items into a single sheet with a new XLSX button.
- Trailer map views have been fixed to resolve layout errors and NaN positioning issues.
- Auto-positioning logic was corrected to handle NaN values, and the dock now uses axonometric icons.
- The Dock Load count and visual schema have been aligned to reflect only packed crates.
- Logistics display has been updated to ensure consistency between load counts and the packed crate schema.

## [2.0.eaa746f] - 2026-07-06
### 2 commit(s)
- Added a unified Packed Units view in the Logistics Warehouse to combine crates, pallets, and cardboard boxes.
- Implemented dynamic crate naming for packed status within the UnifiedInventoryView.
- Enhanced the UI by consolidating different storage unit types into a single interface.
- Improved crate identification with dynamic naming based on packed status.
- Updated the inventory display to show packed units across multiple formats.

## [2.0.17ce1ff] - 2026-07-05
### 9 commit(s)
- Fixed database recovery issues by updating migration strategies and schema versions to resolve DM4 and DB6 errors.
- Added packing status tracking to the inventory schema and updated the PackWizard to default to total available quantities.
- Improved the crate display by fixing subtitle overlaps, adjusting icon positions, and reordering header information.
- Enhanced the user interface by adding visual indicators for all inventory views and thinning axometric icon lines.
- Optimized database cleanup logic to ensure clean recovery from specific error scenarios.

## [2.0.1002b06] - 2026-07-04
### 14 commit(s)
- Enhanced axometric icons with solid thick lines, increased subtitle text, and improved PDF branding including logo placement and dynamic page numbering.
- Moved units to the SKUs line, relocated crate dimensions and type to the right side of the PDF info panel, and updated the print wizard UI for specific gallery branding.
- Implemented a quantity selector in the Pack Wizard, fixed item axometric dimensions mapping, and corrected the branding logo URL for PDF exports.
- Cleaned up header and footer backgrounds, enlarged titles, thickened icon lines, and increased font sizes across the application and PDFs.
- Updated logistics to onyx.mx, split the crate title line, centered the logo with a wireframe in PDF exports, and fixed the layout by moving the "Made in Mexico for" text closer to the logo.

## [2.0.ce9aff1] - 2026-07-03
### 20 commit(s)
- Moved dimension fallback logic into the axonometric data generator and updated default plate depth to 5cm for consistent rendering across deep plates and missing dimensions.
- Added new geometry types for spheres and octahedrons to support sculpture rendering, corrected vertex logic for true corner faces, and replaced cone geometry with smooth bowl logic for plates.
- Enhanced PDF exports by integrating vendor color bubbles into QR codes, adding a blank center circle for manual color coding, and improving the Control manifesto layout with larger UI elements and correct dimension parsing.
- Fixed catalog and control PDFs by removing page numbers, resolving footer overlaps, shrinking axonometric icons, and correcting logo path resolution for GitHub Pages and various brand assets.
- Improved print functionality by fixing state scope issues in the label wizard, updating logo dimensions for 50x50 labels, and introducing a new PrintHelper launcher with skeleton mockups.

## [2.0.76e7f44] - 2026-07-02
### 1 commit(s)
- Fixed Android Chrome visual glitches and enabled designer auto-load.

## [2.0.bc2a280] - 2026-07-01
### 4 commit(s)
- Fixed the add images button and reduced the size of status bubbles.
- Restored the add entry button and made the status column more compact.
- Updated inventory view layouts and improved search functionality.
- Updated label templates, normalized print fields, and redesigned the tutorial.

## [2.0.96ae64e] - 2026-06-30
### 25 commit(s)
- Fixed barcode printing issues and resolved label size display problems on Bluetooth connections.
- Updated the 50x50 label template with precise coordinates, new design specifications, and the ArtOfDecor logo.
- Improved the Print Wizard by adding the 50x50 format, fixing button layout, and correcting PDF print failures.
- Enhanced the axometric renderer with plate geometry and fixed icon rendering and Control PDF issues.
- Rebuilt the tutorial with a new vertical layout, glassmorphic design, and updated screenshots.
- Implemented the Welcome Screen and Inventory Tutorial while fixing image pathing and layout issues.

## [2.0.6d4736a] - 2026-06-29
### 4 commit(s)
- Fixed barcode display issues in batch printing caused by async SVG loading.
- Resolved template data mismatches in the OnyxLabels designer during external batch loads.
- Improved printer reliability for large batches by waiting for the BLE Print Complete event.
- Updated the main Print button to correctly handle batch printing when template data is present.

## [2.0.892f587] - 2026-06-28
### 4 commit(s)
- Fixed a race condition in the LabelWizard and OnyxLabels designer state.
- Corrected the z-index overlap issue in the Inventory ListView expanded items.
- Adjusted LabelWizard counts and resolved the PDF axonometric logo overlap.
- Updated the UI for the Print Wizard and Designer.

## [2.0.aceb427] - 2026-06-27
### 9 commit(s)
- Updated the axometric icon position and designer theme, fixed sidebars CSS selectors, and corrected theme references in LabelWizard and the Print Wizard.
- Resolved UI overlaps and syntax errors in the LabelWizard, fixed the close button functionality, and removed extra close buttons caused by iframe CSS issues.
- Improved the OnyxLabels integration within the LabelWizard and Print Wizard by using createPortal and glassmorphic styling for the iframe.
- Optimized the Print Wizard to skip the preview window and load the Phomemo designer immediately while fixing a double printing bug.
- Adjusted canvas colors and resolved remaining visual glitches to ensure a smoother experience across all inventory tools.

## [2.0.dc78c43] - 2026-06-26
### 16 commit(s)
- Improved catalog layout by adjusting margins, resizing images, and repositioning the QTY indicator and logo for better print quality and alignment.
- Enhanced print reliability by hardcoding the Art of Decor logo, removing separator lines, and switching to rich black for glossy output.
- Optimized QR code and barcode generation by removing unnecessary spaces and ensuring footer elements like the page number and tag ID are correctly placed.
- Refined the catalog footer by increasing text size, aligning the logo to the right, and reducing its size to maintain a clean design.
- Fixed hardware margin conflicts by shifting the catalog footer and content up, while reducing top padding and scaling images appropriately.

## [2.0.af938f4] - 2026-06-24
### 5 commit(s)
- Fixed axonometric mirror orientation and rim logic to ensure correct display and eliminate self-intersecting loops
- Removed the left black edge bar from catalog PDF pages and applied item color rules to axonometric icons in Control PDF
- Resolved a Print Workflow crash caused by a localStorage QuotaExceededError

## [2.0.183dac3] - 2026-06-23
### 2 commit(s)
- Fixed axonometric round mirror geometry and virtual list collapse issues
- Redesigned catalog PDF headers and synchronized inventory list virtualization
- Improved visual accuracy for round mirrors in axonometric views
- Enhanced PDF report formatting and list performance consistency
- Resolved geometry rendering bugs and optimized virtual list rendering

## [2.0.b094d47] - 2026-06-22
### 2 commit(s)
- Fixed label export parsing, axometric sizing, and PDF text overlap bugs
- Optimized layout, animations, and virtualization for major performance improvements
- Improved overall app stability and responsiveness across all features
- Resolved critical rendering issues affecting document exports and measurements
- Enhanced user experience through faster loading times and smoother interactions

## [2.0.057a173] - 2026-06-21
### 1 commit(s)
- Refine Catalog PDF export layout by rebalancing text sizing and improving spacing
- Shrink icons in the Catalog PDF export to fit the new design
- Enforce a strict black color scheme across all Catalog PDF exports
- Update the Catalog PDF export to ensure consistent visual alignment

## [2.0.0b06b00] - 2026-06-20
### 1 commit(s)
- Improved app performance by adding React.memo, useDeferredValue, and lazy loading.
- Optimized rendering speed to reduce unnecessary recalculations.
- Enhanced initial load times through strategic resource preloading.
- Reduced memory usage by deferring non-critical component rendering.
- Streamlined data fetching to ensure smoother user interactions.

## [2.0.ec725b6] - 2026-06-03
### 4 commit(s)
- Fixed vendor color bubble rendering issues in jsPDF reports.
- Improved the Control manifesto layout with reordered columns, Code39 barcode support, and better spacing.
- Enhanced the label engine with Axonometric 3D icons, justified text alignment, and updated data mappings.
- Integrated the Phomemo BT printer into LabelWizard and disabled Onyx Intelligence to improve performance.
- Applied daily refinements across rendering, layout, labeling, and printer integration.

## [2.0.d100780] - 2026-05-21
### 1 commit(s)
- Added Canoe geometry mapping to axonometric shapes
- Updated shape rendering logic for Canoe models
- Enhanced visual consistency for watercraft in 3D views
- Integrated new geometry parameters into the rendering engine
- Improved accuracy of Canoe shape representation

## [2.0.1f2768f] - 2026-05-17
### 1 commit(s)
- Added Axonometric wireframe integration to the inventory view.
- Fixed a UI background blur leak that was affecting display performance.
- Implemented dynamic item color extraction for more accurate visual representation.

## [2.0.3d3e336] - 2026-05-16
### 2 commit(s)
- Perfected the Bauhaus axonometric geometry engine with improved bowl curves and oblique round mirror projections.
- Modernized the Sales Catalog PDF export by fixing Tag ID logic and overhauling typography and spacing.
- Enhanced the geometry engine to support more complex oblique round mirror projections.
- Updated the Sales Catalog PDF export to include better typography and improved spacing.
- Fixed Tag ID logic issues in the Sales Catalog PDF export process.

## [2.0.1c353d2] - 2026-05-13
### 1 commit(s)
- Fixed a bug where inventory labels were not sorting correctly in XLSX and PDF exports.
- Updated the export logic to sort inventory labels by descending tag ID.
- Improved the consistency of label ordering across all logistics reports.
- Enhanced the user experience for logistics teams managing large inventory datasets.
- Resolved issues with tag ID sequencing in generated export files.

## [2.0.8551f06] - 2026-05-11
### 2 commit(s)
- Fixed standardization of payment status logic to use Blue for no data, Yellow for requested, Red for partial, and Green for paid.
- Removed legacy purple status from the payment system.
- Synchronized inventory payment status and export logic to ensure consistency between the UI and XLSX reports.
- Aligned REQUESTED and PARTIAL tags across all interfaces and downloadable files.
- Improved data accuracy for payment tracking and reporting.

## [2.0.c5d14c4] - 2026-05-10
### 2 commit(s)
- Fixed CreditCard and Percent ReferenceErrors in the TrackingPaymentsView wizard.
- Updated production payment status logic to prevent premature 'Paid' status in workbook 825.

## [2.0.4bcb3cc] - 2026-05-09
### 7 commit(s)
- Enhanced the Payment Wizard UI with frameless floating icons, enlarged typography, and standardized navigation terminology.
- Finalized the top-aligned, horizontally-centered wizard layout and eliminated excessive vertical padding.
- Resolved reference errors for icons and fixed a babel parsing issue within the Onyx Studio interface.
- Implemented glassmorphic translucent modals and high-contrast full-color icons for improved visual clarity.
- Fixed a nested div syntax error in the TrackingPaymentsView component.

## [2.0.ad97440] - 2026-05-08
### 8 commit(s)
- Fixed syntax errors and optimized the Wizard layout for better alignment and compact containers.
- Modernized the Finance Wizard with high-contrast icons, glassmorphic styling, and improved payment tracking.
- Added support for supplier payments and progress bars to visualize partial production costs.
- Updated payment icons and vendor tags with color-coding and improved sizing for upcoming payments.
- Stabilized finance and logistics workflows while implementing the new Deployed Crates view and Edit modal.

## [2.0.b60fc29] - 2026-05-07
### 4 commit(s)
- Modernized the Logistics Export and Crate Naming features to improve data handling.
- Integrated Source Provider selection into the Creation modal and fixed sidebar overlap issues.
- Unified the Crate Management UI with a glassmorphic design and added unit type selection.
- Redesigned the Crate Edit interface and introduced a new Delete All functionality.

## [2.0.bf5a70c] - 2026-05-06
### 10 commit(s)
- Fixed a reference error in the UploadWizard and removed the hourglass icon from the inventory bar based on user feedback.
- Hardened multi-image PDF exports by standardizing the collection pipeline, decoupling images from item quantity, and ensuring all visuals appear without duplicates.
- Added a finance module restriction to the upcoming payments panel and integrated the toggle with auto-generation logic.
- Modernized the universal tools bar with a free-floating UI and a cyclic density toggle for better usability.
- Improved PDF export reliability by robustly collecting all available images and deduplicating them after the cleaning process.

## [2.0.b1b3298] - 2026-05-05
### 74 commit(s)
- Fixed inventory status defaults and synchronized selection logic to ensure new items show as NEW and batch tools work with filters.
- Implemented batch selection tools and relocated tactical controls to improve mobile ergonomics and submission reliability.
- Resolved multiple mobile input failures, unified credential keys, and stabilized the Orb view to prevent crashes and silent errors.
- Added audio-reactive visual effects, real-time language detection, and personalized chat history to enhance the Onyx Intelligence experience.
- Finalized the mobile HUD layout with refined visuals, improved accessibility, and comprehensive error handling for voice interactions.

## [2.0.a9afb09] - 2026-05-04
### 41 commit(s)
- Redefined the inventory interface with a glassmorphic aesthetic, floating tactical panels, and standardized hold-to-talk voice interactions across all devices.
- Migrated tactical controls to a modular bottom bar and unified PointerEvents to resolve mobile voice session issues and improve touch reliability.
- Enforced strict Tag ID and barcode formatting in AI responses while fixing Supabase hydration loops and resolving critical database schema mismatches.
- Overhauled the artifact display with high-transparency backgrounds, dynamic barcodes, and a streamlined dual-stream inventory resolution system.
- Modernized the core application with a unified save workflow, optimized trucking logistics controls, and a responsive layout that prioritizes visual data over text.

## [2.0.42fb2b8] - 2026-05-03
### 17 commit(s)
- Modernized wizards to glassmorphic studio design, added XLSX workbook download button, and optimized NFC layout
- Stabilized logistics packing workspace, fixed glassmorphic UI, and made System Node panel full width
- Removed System Node telemetry section, displayed operator email in lowercase, and consolidated Performance toggle
- Renamed requested queue, implemented currency conversion, modernized vendor tags, and refined user panel typography
- Removed density slider and skeleton screens, implemented high-contrast data-dense settings, and optimized mobile responsiveness

## [2.0.a1ee734] - 2026-05-02
### 10 commit(s)
- Refined inventory sorting to prioritize creation timestamps over modification dates and deployed trucking crate filters.
- Modernized the finance hub with unified sliders, glassmorphic filters, cinematic transitions, and standardized sorting.
- Enhanced the UI with high-fidelity icons, relocated status indicators to the sidebar, and added a pulsating sync toggle.
- Implemented offline mode with a PWA sync engine and optimized mobile inventory and NFC wizard panels.
- Updated layout styles by moving the sync dot next to the user name and positioning the sync status above the welcome tag.

## [2.0.e2cbf33] - 2026-05-01
### 30 commit(s)
- Redesigned the UI with a premium glassmorphic bottom dock and modernized the Print Engine to include progress bars and manual downloads.
- Overhauled the NFC and Add Entry interfaces with tactical ergonomics, keyboard shortcuts, and mobile-responsive layouts for better navigation.
- Enhanced the Inventory Registry with high-fidelity visuals, an intelligent tag cloud, and optimized manual suggestion cycling.
- Fixed critical logistics data integrity issues by resolving schema errors, correcting weight calculations, and improving XLSX export reliability.
- Streamlined tracking sheets by removing redundant columns and adding direct atom lookups to ensure accurate price and dimension data.

## [2.0.608d043] - 2026-04-30
### 12 commit(s)
- Optimized the trucking mobile layout with auto-centering, a large close button, and a glassmorphic background for the trailer workspace.
- Redesigned the 3D trailer manifesto with orbit controls, a data HUD, and an immersive edge-to-edge visualizer popup.
- Modernized the settings portal and trucking hub with high-density layouts, theme-aware contrast, and expanded 3D workspaces.
- Fixed a syntax error in atoms.tsx and corrected an inventory schema error within the trailer manifesto.
- Added a global show/hide toggle for control panels, stabilized the trailer map canvas, and updated the crate contents viewer.

## [2.0.9e70124] - 2026-04-29
### 18 commit(s)
- Stabilized the trucking module by fixing recall coordinate mapping, adding virtual crate injection for historical manifests, and implementing deployment integrity checks.
- Integrated 3D Share functionality and improved recall mapping stability across shipment sync and the 3D virtual twin interface.
- Redesigned the SentTruckViewer dashboard with a unified payload, high-fidelity styling, and a light premium theme featuring glassmorphic elements.
- Overhauled the HTML manifest to an interactive 3D format with a PDF-style vendor coding layout and shadowless compact data density.
- Fixed critical viewer issues including coordinate scaling, rotation offsets, data discrepancies, and scrolling within the SentTruckViewer.

## [2.0.6044c6f] - 2026-04-28
### 14 commit(s)
- Fixed a blank page and JSON parse crash in the digital manifest viewer and modernized the manifest with an interactive 3D viewer.
- Integrated the Master Packing List XLSX export and Ready Truck Wizard with improved crate-wise sectioning and persistence for shipment metadata.
- Enhanced the PDF Manifest with unified branding, corrected header totals, and added support for cardboard boxes and trailer map rendering.
- Upgraded the Master View thumbnail to a higher resolution composite and refined the Ready Truck Wizard UI with larger input fields.
- Resolved a reference error in the crate card component and improved item details typography across the application.

## [2.0.b740705] - 2026-04-27
### 8 commit(s)
- Added a dedicated Packed Boxes tab with nesting awareness and vendor color synchronization.
- Introduced hierarchical nesting support and a high-density dashboard for logistics tracking.
- Fixed PDF generation hangs and resolved recursive weight calculation errors.
- Corrected logical nesting relationships and removed redundant tag IDs from the system.
- Refined the PDF manifesto layout and improved overall logistics stability.

## [2.0.81da696] - 2026-04-26
### 23 commit(s)
- Modernized the interface with horizontal toolbars, sticky headers, glassmorphic panels, and responsive mobile scrolling.
- Redesigned the Labels module with an integrated bottom bar, state persistence, and a compact glassmorphic design.
- Implemented comprehensive logistics features including crate packing, trucking modules, and tracking views.
- Enhanced the visual experience with dynamic theme colors, color-coded bars, and interactive mesh gradients.
- Fixed responsiveness issues, header gaps, and pull-to-refresh behavior to ensure a smooth user experience.

## [2.0.8008432] - 2026-04-25
### 26 commit(s)
- Implemented the high-fidelity Exportation Wizard for the Trucking Module, including multi-sheet XLSX and consolidated PDF reports.
- Added support for .truckload drafts with named configurations, localStorage persistence, and shareable packing configs.
- Enhanced the PDF header with total Crates and Pallets counts, added a PACKET IN column, and refined layout spacing and data density.
- Fixed vendor prefix lookups for color-coded TAG IDs, corrected orientation logic in thumbnails, and updated trailer map backgrounds.
- Increased .truckload thumbnail resolution to 2400px, applied vendor colors, and ensured tight fitting to trailer floor dimensions.

## [2.0.b72d646] - 2026-04-24
### 3 commit(s)
- Deployed the crates tab, reopened packed crates, and refined dock and info panel sizing.
- Added landscape view, free-floating icons, and a centimeter grid to the trucking module with solid crates and zoom fixes.
- Introduced portrait layout, centimeter grid, solid crates, zoom, and drag fixes alongside vendor color names.
- Fixed zoom and scale issues in the trucking module while improving dock and info panel sizing.
- Enhanced the trucking module with landscape and portrait layouts, free-floating icons, and drag functionality.
