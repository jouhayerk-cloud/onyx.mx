# Onyx.mx — Centralized Print Module (PM1)
## Comprehensive XLSX & CSV Catalogue and Architectural Design Review
**Document Date:** 2026-10-04  
**Workspace:** `C:/Jouhayerk/git/onyxchan-wt/PM1`  
**Purpose:** Exhaustive audit of all spreadsheet generation and ingestion code paths across the Onyx.mx platform to drive the consolidation into a centralized Print Module (`PM1`).

---

## 1. Executive Summary & File Inventory

The Onyx.mx codebase contains **13 distinct spreadsheet formats** spanning export logistics, e-commerce catalog publishing, financial ledger reporting, packing operations, historical archives, and artisan batch intake. These formats currently reside in scattered feature directories, with duplicated code paths, conflicting styling rules, and divergent column schemas.

| Format ID | Format Name | Domain | Direction | Primary Source File & Line | Target Consumer |
|---|---|---|---|---|---|
| `fmt-inventory-selected-xlsx` | Selected Items Export | Inventory | Export | `src/features/core/MainHeader.tsx:1433-1618` | Internal Sales & Operations |
| `fmt-master-book-326-xlsx` | Master Season Book 326 Export | Logistics / Finance | Export | `src/features/core/MainHeader.tsx:1621-2721` | Management & Executive Operations |
| `fmt-workbook-v2-xlsx` | Master Workbook V2 (Rare Earth Format) | Catalog / Finance | Export | `src/features/core/MainHeader.tsx:2724-3531` | Client (Rare Earth Gallery) & Finance |
| `fmt-shopify-matrixify-main-xlsx` | Shopify Multi-Image Matrixify Export | Catalog / E-Commerce | Export | `src/features/core/MainHeader.tsx:3534-4283` | Shopify Store Admin / Client |
| `fmt-shopify-batch-wizard-xlsx` | Shopify Batch Wizard Export | Catalog / Studio | Export | `src/features/inventory/BatchProcessingWizard.tsx:440-528` | Studio Operator / E-Commerce |
| `fmt-trucking-manifesto-xlsx` | Consolidated Trailer Manifesto | Logistics / Customs | Export | `src/features/logistics/TruckingModule.tsx:1934-1970` | US/Mexico Customs Broker & Driver |
| `fmt-trucking-crates-spreadsheets-xlsx` | Crate Spreadsheets (Per-Box Sheets) | Logistics / Warehouse | Export | `src/features/logistics/TruckingModule.tsx:2153-2202` | Receiving Dock & Warehouse Staff |
| `fmt-trucking-trailer-packing-list-xlsx` | Master Trailer Packing List | Logistics / Dispatch | Export | `src/features/logistics/TruckingModule.tsx:2667-2779` | Border Dispatch & Freight Carrier |
| `fmt-crates-wizard-packing-list-xlsx` | Crate Selection Master Packing List | Logistics / Warehouse | Export | `src/features/logistics/ExportCratesWizard.tsx:110-185` | Freight Forwarder & Warehouse |
| `fmt-packing-printables-wizard-xlsx` | Printables Wizard Legacy Inventory | Packing / Workshop | Export | `src/features/logistics/PackingModule.tsx:174-222` | Quality Control & Labeling |
| `fmt-packing-raw-xml-xlsx` | Packing Fast Direct OpenXML Export | Packing / Workshop | Export | `src/features/logistics/PackingModule.tsx:569-597` | Workshop Operator & Tracking |
| `fmt-archive-season-825-csv` | Season 825 Archive Inventory CSV | Archive / Historical | Export | `src/features/archive/ArchivePanel.tsx:62-115` | Internal Auditor & Accounting |
| `fmt-vendor-batch-create-import-xlsx` | Vendor Intake Batch Spreadsheet | Intake / Import | Import | `src/features/upload/batchSheet.ts:163-242` | Ingested from Mexican Artisans |

---

## 2. Exhaustive Format Catalogue

---

### Format 1: `fmt-inventory-selected-xlsx`
* **Name:** Selected Items Export
* **Domain:** Inventory / Sales
* **Direction:** Export
* **UI Trigger:** Selection action bar in Inventory view, via `inventoryExportSelectedXLSXTriggerAtom` (effect in `src/features/core/MainHeader.tsx:1423-1427`). Available to all authenticated roles with inventory access.
* **Function & Source:** `handleExportSelectedXLSX` in `src/features/core/MainHeader.tsx:1433-1618`.
* **Data Sources:**
  * `inventoryAtom` (`inventory`: local item objects).
  * `selectedInventoryIdsAtom` (`selectedIds`: array of selected row IDs).
  * `financeDocsAtom` (`financeDocs`: payment tracking records).
  * `exchangeRateAtom` (`exchangeRate`, falls back to `DEFAULT_EXCHANGE_RATE`).
* **File Naming:** `Onyx-mx_Selected_Items_${dateStr}.xlsx` where `dateStr` is `new Date().toLocaleDateString('es-MX').replace(/\//g, '-')` (e.g. `Onyx-mx_Selected_Items_04-10-2026.xlsx`).
* **Target Consumer:** Internal (Sales reps, floor managers, inventory auditors).
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Selected Items'`, tab color `#4F46E5` (`FF4F46E5`).
  * Header Styling: Row 1, fill `FF4F46E5` (Indigo), font Arial 10pt bold white, centered alignment.
  * Body Styling: Alternating zebra striping with `FFF9FAFB` on even rows; vendor cell filled with vendor color (`getVendorColor(tagId)`), tag_id cell filled with vendor color, pay_status filled with status color (`FF22C55E` green, `FFFACC15` yellow, `FFEF4444` red, `FF38BDF8` blue).
* **Column Definitions & Data Availability:**
  1. `VENDOR` (w: 15): `(vendors as any)[vid]?.name || vid`. Extracted from item tag prefix or `vendor_id`. Non-null; falls back to raw code or `'Unknown'`.
  2. `#` (w: 8): `itemData.itemNumber || itemData.item_number || iIdx + 1`. Sequential int or stored item number. Non-null (falls back to 1-based index).
  3. `PAY DATE` (w: 12): Formatted `YYYY-MM-DD` from `paymentDateMap.get(id)` or `itemData.pay_date`. Can be `'N/A'` if unpaid.
  4. `BOOK BARCODE` (w: 22): `calculated.bookBarcode || itemData.book_barcode || itemData.itemId || ...`. Stored or calculated barcode string. May be empty string if uncalculated.
  5. `AQ CODE` (w: 12): `calculated.bookAqCode || '-'`. Calculated acquisition cost code. Non-null (defaults to `'-'`).
  6. `LD CODE` (w: 12): `calculated.bookLandCode || '-'`. Calculated landed cost code. Non-null (defaults to `'-'`).
  7. `DESCRIPTION` (w: 45): `${itemData.shape || ''} ${itemData.shortDescription || itemData.description || ''}`.trim(). Can be empty string if neither shape nor description exist.
  8. `COLOR + MATERIAL` (w: 35): `${itemData.color || ''} ${itemData.material || ''}`.trim(). Can be empty string if unrecorded.
  9. `SIZES (CM)` (w: 20): `formatDimensionsMetricOnly(w, h, l)`. Metric dimension string (`W×L×H cm`). Returns `'-'` if all dimensions null/0.
  10. `SIZES (IN)` (w: 20): `formatDimensionsImperialOnly(w, h, l)`. Converted imperial dimensions. Returns `'-'` if null.
  11. `WEIGHT (KG)` (w: 15): `formatWeightMetricOnly(weight)`. Metric weight string (`X kg`). Returns `'-'` if null/0.
  12. `WEIGHT (LB)` (w: 15): `formatWeightImperialOnly(weight)`. Converted imperial weight string (`X lb`). Returns `'-'` if null/0.
  13. `QTY` (w: 8): `parseInt(itemData.quantity || '1', 10) || 1`. Positive integer. Never null (defaults to 1).
  14. `ACQ COST $ (MXN)` (w: 18, numFmt: `#,##0`): `parseFloat(itemData.price || itemData.acquisition_price_mxn || '0') || 0`. Number. Never null (defaults to 0).
  15. `ACQ $ (USD)` (w: 18, numFmt: `#,##0`): `costMxn / bookRate` rounded with `onyxRound`. Number.
  16. `TOTAL MXN` (w: 18, numFmt: `#,##0`): `Math.round(costMxn * qty)`. Number.
  17. `LANDED $ (MXN)` (w: 18, numFmt: `#,##0`): `Math.round(costMxn * 1.4)`. Number.
  18. `LD $ (USD)` (w: 18, numFmt: `#,##0`): `(costMxn / bookRate) * 1.4` rounded with `onyxRound`. Number.
  19. `RETAIL $ (USD)` (w: 18, numFmt: `#,##0`): `landedUsd * 12` rounded with `onyxRound`. Number.
  20. `PAY STATUS` (w: 18): String (`'PAID'`, `'REQUESTED'`, `'ADVANCE'`, `'PARTIAL'`, `'NEW'`). Never null.

---

### Format 2: `fmt-master-book-326-xlsx`
* **Name:** Master Season Book 326 Export (Classic Full Multi-Sheet Workbook)
* **Domain:** Logistics / Inventory / Finance / Crate Database
* **Direction:** Export
* **UI Trigger:** Overview module top action bar button: `<StudioAction icon={Download} label={tr("EXPORT")} onClick={handleMasterExportXLSX} />` (`src/features/core/MainHeader.tsx:4386`). Available to Admin, Developer, Logistics roles.
* **Function & Source:** `handleMasterExportXLSX` in `src/features/core/MainHeader.tsx:1621-2721`.
* **Data Sources:**
  * `inventory` atom & Supabase `inventory` table.
  * Supabase `production` table (`allProduction`).
  * Supabase `shipments` table (`shipments`).
  * `financeDocs` atom & Supabase `finance` records.
  * `logisticsDocs` atom (`crates`, `pallets`).
  * Provider crates: `juanCrates`, `simonaCrates`, `otherCrates`, `internalCrates`.
  * `destinationsConfig` & `vendors` lookup tables.
* **File Naming:** `Onyx-mx_Book-326_${dateStr}.xlsx` where `dateStr` is `new Date().toLocaleDateString('es-MX').replace(/\//g, '-')` (e.g. `Onyx-mx_Book-326_04-10-2026.xlsx`).
* **Target Consumer:** Internal (Operations Director, Executive Management, Logistics Dispatcher, Accounting).
* **Workbook Structure:**
  1. Sheet `'Summary'`: Dashboard sheet summarizing spend, item counts, paid vs pending by Grand Total, Vendor rollup, Category rollup, Destination rollup. Header: Gray-800 (`FF1F2937`), font Arial 10pt bold white.
  2. Sheet `'Finance Ledger'`: Complete transaction register. Header: Gray-800 (`FF1F2937`).
  3. Sheet `'Crates & Pallets'`: Warehouse container registry grouped by Empty, Packed, Deployed. Gray dividers (`FFF3F4F6`).
  4. Sheets `'JUAN'` and `'SIMONA'`: Crate supplier breakdown sheets with tab colors `#3B82F6` and `#F43F5E`. Grouped by Empty vs Packed/Deployed.
  5. Sheets `'TRK-...'` (or manifest ID): Consolidated shipped truck manifest sheets for finalized shipments. Tab color `#10B981`, header fill `#064E3B`.
  6. Sheets `[Vendor Name]` (e.g. `'Jose Meza'`, `'Tellez Taller'`): One sheet per vendor with tab color matching vendor brand color, header fill matching vendor color with contrast-calculated text.
* **Column Definitions & Data Availability:**
  * **Summary Sheet Columns:**
    1. `VENDOR / SECTION` (w: 30): Section divider or entity name.
    2. `INV ITEMS (ACQ/PROD)` (w: 22): Number of acquisition/production items (number or null for dividers).
    3. `TOTAL SPEND (MXN)` (w: 22, `#,##0`): Total amount + commission in MXN.
    4. `SPEND (USD - Inet Rate)` (w: 25, `#,##0`): Spend converted at Internet exchange rate.
    5. `PAID (MXN)` (w: 18, `#,##0`): Sum of paid disbursements.
    6. `PENDING (MXN)` (w: 18, `#,##0`): Total minus paid.
  * **Finance Ledger Sheet Columns:**
    1. `DATE` (w: 12): Transaction date string. Can be empty.
    2. `DESCRIPTION` (w: 35): Free-text ledger note.
    3. `CATEGORY` (w: 15): Subcategory or category name. Styled with category color.
    4. `VENDOR` (w: 10): 2-letter vendor code. Styled with vendor color fill.
    5. `DESTINATION` (w: 18): Destination facility name.
    6. `AMOUNT (MXN)` (w: 15, `#,##0`): Transaction base amount.
    7. `FEES (MXN)` (w: 15, `#,##0`): Transaction commission/fees.
    8. `TOTAL (MXN)` (w: 15, `#,##0`): Amount + commission.
    9. `STATUS` (w: 12): Status text ('Paid', 'Requested', etc.) filled with status color.
    10. `PAY DATE` (w: 12): Disbursement date string or empty.
    11. `REFERENCE` (w: 20): Banking reference or check number.
  * **Crates & Pallets Sheet Columns:**
    1. `ID` (w: 22): Container barcode ID.
    2. `TYPE` (w: 14): Container type ('CRATE', 'PALLET', 'CARDBOARD').
    3. `DIMENSIONS (WxLxH)` (w: 28): `${w} x ${l} x ${h} CM`.
    4. `WEIGHT (KG)` (w: 15, `#,##0.00`): Tare weight in kg.
    5. `SUPPLIER` (w: 18): Crate builder ('JUAN', 'SIMONA', 'INTERNAL').
    6. `PRICE (MXN)` (w: 18, `#,##0`): Crate acquisition cost.
    7. `CONTENTS SUMMARY` (w: 60): Item summary text + recursive list of nested item tag barcodes `[tag1, tag2]`.
    8. `TRK` (w: 18): Assigned truck manifest ID or empty string.
    9. `STATUS` (w: 15): Container status ('EMPTY', 'PACKED', 'DEPLOYED').
  * **Truck Consolidated Sheet Columns (TRK):**
    1. `PAY DATE` (w: 12): Item payment date or `'N/A'`.
    2. `BOOK BARCODE` (w: 22): Item barcode tag ID.
    3. `AQ CODE` (w: 12): Calculated acquisition cost code or `'-'`.
    4. `LD CODE` (w: 12): Calculated landed cost code or `'-'`.
    5. `DESCRIPTION` (w: 45): Shape and short description.
    6. `COLOR + MATERIAL` (w: 35): Color and stone material.
    7. `SIZES (CM)` (w: 20): Metric dimensions string.
    8. `SIZES (IN)` (w: 20): Imperial dimensions string.
    9. `WEIGHT (KG)` (w: 15): Metric weight string.
    10. `WEIGHT (LB)` (w: 15): Imperial weight string.
    11. `QTY` (w: 8): Master inventory quantity.
    12. `QTY TRK` (w: 10): Actual quantity loaded on this specific shipment.
    13. `ACQ COST $ (MXN)` (w: 18, `#,##0`): Cost per piece in MXN.
    14. `ACQ $ (USD)` (w: 18, `#,##0`): Cost per piece in USD.
    15. `T SHIPPED MXN` (w: 18, `#,##0`): `costMxn * qtyTrk`.
    16. `LANDED $ (MXN)` (w: 18, `#,##0`): Landed cost MXN.
    17. `LD $ (USD)` (w: 18, `#,##0`): Landed cost USD.
    18. `RETAIL $ (USD)` (w: 18, `#,##0`): Retail price USD.
    19. `PAY STATUS` (w: 18): Payment status string.
  * **Vendor Sheets Columns:**
    Columns match Selected Items, with Column 1 `#` (Item Number) instead of VENDOR. Items sorted strictly numerically by `itemNumber`.

---

### Format 3: `fmt-workbook-v2-xlsx`
* **Name:** Master Workbook V2 Export (Rare Earth Format)
* **Domain:** Catalog / Inventory / Finance / Commercial Client Integration
* **Direction:** Export
* **UI Trigger:** MainHeader Export disclosure panel button `<ToolButton icon={FolderUp} .../>` -> `<button onClick={handleMasterExportXLSX_V2} title="Download Workbook V2 (Rare Earth Format)">` (`src/features/core/MainHeader.tsx:4504`).
* **Function & Source:** `handleMasterExportXLSX_V2` in `src/features/core/MainHeader.tsx:2724-3531`.
* **Data Sources:**
  * `inventory` atom & normalized inventory data.
  * Supabase `shipments` table (for TRK assignment mapping).
  * `financeDocs` (for vendor disbursement reconciliation).
  * `exchangeRate` atom (bookRate).
* **File Naming:** `Onyx-mx_Workbook_V2_${dateStr}.xlsx` where `dateStr` is `new Date().toLocaleDateString('es-MX').replace(/\//g, '-')` (e.g. `Onyx-mx_Workbook_V2_04-10-2026.xlsx`).
* **Target Consumer:** External Client (Grant & Commercial Buyers at Rare Earth Gallery) and Internal Accounting.
* **Workbook Structure:**
  * Worksheets:
    * Vendor sheets: One per vendor (`vid`), named after vendor (max 25 chars), tab colored with vendor brand color.
    * Consolidated TRK sheets: One per shipment (`TRK ${finalSheetName}`), tab color `#10B981`.
    * Finance Ledger sheet: Formatted as a native OpenXML table named `FinanceLedgerTable` with style `TableStyleMedium2`.
  * Vendor Sheet Layout:
    * Rows 1-4: Header banner block. Cell A1: Vendor name, Cell A2: Vendor code.
    * Row 5: Column headers, colored with vendor brand color, bordered with thin lines, centered.
    * AutoFilter: Set from `A5` to the last dynamic image column.
    * Rows 6+: Item rows sorted by season book (825 archive first, 326 current second), then descending by tag ID.
    * Tag ID Cell Fill: Light blue (`FF38BDF8`) for prepaid Season 825 items, light green (`FF92D050`) for paid items, yellow (`FFFFFF00`) for requested items.
    * Sub-Total Row: Dynamic Excel formula `SUM(...)` across quantity, total MXN, and total USD for current season 326 items only.
    * Vendor Payments Section: Table of payments filtered for vendor (excluding payments tagged to 825 items), with columns `PAY DATE`, `CATEGORY`, `CURRENCY`, `DESCRIPTION`, `AMOUNT MXN`, `AMOUNT USD`.
    * Charges Row: Taxes and fees summary (`CHARGES (Taxes/Fees)`).
    * Total Payments Row: Net disbursements summary (`Total Payments`).
    * Balance Row: Live Excel formula subtracting payments and adding charges: `=O{subTotal}-O{totalPay}+O{charges}`.
* **Column Definitions & Data Availability (Vendor & TRK Sheets):**
  1. `Date` (w: 12): Item creation date string (`MM/DD/YYYY`). Can fall back to current date.
  2. `Shape Type` (w: 20): Uppercase `${shape} ${type}`. String, non-null.
  3. `Colo Material` (w: 20): Uppercase `${color} ${material}`. String, non-null.
  4. `Tag - ID with LC` (w: 22): Book barcode tag ID.
  5. `Quantity` (w: 10): Integer quantity (default 1).
  6. `Weight` (w: 10): Kilograms value. Can be empty string.
  7. `H Cm` (w: 12): Height in cm.
  8. `W cm` (w: 12): Width in cm.
  9. `D cm` (w: 12): Depth / length in cm.
  10. `Pounds` (w: 10): Weight in lbs (calculated `kg * 2.20462` or stored).
  11. `L inch` (w: 12): Height in inches (`cm / 2.54`).
  12. `W Inch` (w: 12): Width in inches (`cm / 2.54`).
  13. `D Inch` (w: 12): Depth in inches (`cm / 2.54`).
  14. `Per Piece Pesos` (w: 18, `#,##0`): Base price in MXN.
  15. `Total in Pesos` (w: 18, `#,##0`): Price * quantity in MXN.
  16. `Per Piece US$` (w: 18, `#,##0.00`): Price in USD (`priceMxn / bookRate`).
  17. `Total in US$ Dollars` (w: 20, `#,##0.00`): Total price in USD.
  18. `ACQ Code` (w: 12): Book acquisition code.
  19. `LND Code` (w: 12): Book landed code.
  20. `RETAIL` (w: 15, `#,##0.00`): Book retail price in USD.
  21. `TRK` (w: 15): Associated truck manifest ID string (e.g. `'TRK-Sep08'`) or empty.
  22..22+k. `Image 1` .. `Image k` (w: 15 each): Dynamic image hyperlink formula: `=HYPERLINK("{cleanUrl}", "View Image {k}")`. Generated dynamically up to the maximum number of images attached to any single item in the vendor's set (capped at 10).

---

### Format 4: `fmt-shopify-matrixify-main-xlsx`
* **Name:** Shopify Multi-Image Matrixify Export (Main Header Pipeline)
* **Domain:** Catalog / E-Commerce Integration (Matrixify for Shopify)
* **Direction:** Export
* **UI Trigger:** MainHeader ShoppingBag icon button `<button onClick={handleShopifyExportXLSX} title={tr("Download Shopify XLSX")}>` rendered when `selectedIds.length > 0` (`src/features/core/MainHeader.tsx:4473`). Available to all authenticated roles.
* **Function & Source:** `handleShopifyExportXLSX` in `src/features/core/MainHeader.tsx:3534-4283`.
* **Data Sources:**
  * `inventory` atom (filtered by `selectedIds` and partitioned by `missingShopifyFields`).
  * `exchangeRate` atom (bookRate).
  * `vendors` constant table (normalized vendor display names).
  * AI pipelines (detailed descriptions, extracted colors, generated types).
* **File Naming:** `Shopify_Export_${dateStr}.xlsx` where `dateStr` is `new Date().toLocaleDateString('es-MX').replace(/\//g, '-')` (e.g. `Shopify_Export_04-10-2026.xlsx`).
* **Target Consumer:** External Client E-Commerce Team (Rare Earth Gallery / Grant / Stefi) and Shopify Store Administrator.
* **Workbook Structure:**
  1. Sheet `'Shopify Export (Photos)'`: Contains valid products having real photographic assets (uploaded or AI background-replaced).
  2. Sheet `'Shopify Export (Icon Only)'`: Contains valid products whose only visual is an axonometric isometric icon (owed photography). Tab color Amber-700 (`FFB45309`).
  3. Sheet `'Not Shopify Ready (V2)'`: Flat sheet containing selected items that failed validation, displayed in Workbook V2 column format plus a `Missing For Shopify` diagnostic column. Tab color Amber-500 (`FFF59E0B`).
  4. Sheet `'Report'`: Audit dashboard containing summary statistics, media breakdown counts, missing field tallies, and an itemized destination audit table. Tab color Indigo (`FF4F46E5`).
* **Column Definitions & Data Availability (Shopify Sheets — 49 Columns):**
  *CRITICAL MATRIXIFY RULE:* On multi-image products (1 row per image), columns starting with `'Variant'`, `'Option'`, or `'Inventory Available'` MUST be populated on Row 1 (Image 1) and BLANK on subsequent image rows. Repeating them triggers variant duplication errors.
  1. `Handle`: Product slug. Deterministic, derived from title with SKU-based collision disambiguation (`-2`, `-3`). Mandatory.
  2. `Title`: Clean product title (60-70 chars, title-cased, normalized brand terms). Mandatory.
  3. `Body HTML`: Cleaned marketing description HTML with normalized brand terms. Mandatory.
  4. `Vendor`: Vendor display name mapped from `vendors` const. Mandatory.
  5. `Type`: Product type taxonomy (e.g. `'Lamp'`, `'Sculpture'`). Validated against allowed vocabulary. Mandatory.
  6. `Option1 Name`: Literal `'Title'` on Row 1; blank on extra image rows.
  7. `Option1 Value`: Literal `'Default Title'` on Row 1; blank on extra image rows.
  8. `Variant Position`: Integer `1` on Row 1; blank on extra image rows.
  9. `Variant SKU`: Unique tag ID / barcode on Row 1; blank on extra image rows. Mandatory.
  10. `Variant Barcode`: Same as SKU on Row 1; blank on extra image rows.
  11. `Variant Cost`: Landed cost in USD on Row 1; blank on extra image rows.
  12. `Variant Price`: Rounded retail price in USD on Row 1; blank on extra image rows. Mandatory.
  13. `Variant Grams`: Weight in grams (`kg * 1000`) on Row 1; blank on extra image rows.
  14. `Image Src`: Public Google Drive direct download URL or CDN image URL. Non-null.
  15. `Image Command`: Literal `'MERGE'`.
  16. `Image Position`: Integer image index (`1`, `2`, ...).
  17. `Variant Image`: Primary image URL on Row 1; blank on secondary image rows.
  18. `Metafield: custom.product_weight [single_line_text_field]`: Weight in lbs string on Row 1.
  19. `Variant Metafield: Vendor_SKU`: AQ Code or trimmed SKU on Row 1; blank on extra image rows.
  20. `Variant Weight Unit`: Literal `'g'` on Row 1; blank on extra image rows.
  21. `Variant Metafield: reg.variant_depth`: Depth in inches on Row 1.
  22. `Variant Metafield: reg.variant_width`: Width in inches on Row 1.
  23. `Variant Metafield: reg.variant_height`: Height in inches on Row 1.
  24. `Variant Metafield: reg.variant_measurements`: Dimension string `D{d}xW{w}xH{h}` on Row 1.
  25. `Metafield: Measurements`: Literal `''` (empty string).
  26. `Metafield: shopify.material [list.metaobject_reference]`: Title-cased material (e.g. `'Onyx'`).
  27. `Metafield: custom.variety [list.single_line_text_field]`: Literal `'Mexican Onyx'`.
  28. `Variant Country of Origin`: Literal `'MX'` on Row 1; blank on extra image rows.
  29. `Tags`: Comma-separated tags (`tagId`, Title Case shape/desc, cm dimensions).
  30. `Product Category`: Google Product Category taxonomy string.
  31. `Metafield: shopify.color-pattern [list.metaobject_reference]`: Normalized Shopify metaobject color list (e.g. `'White, Amber'`). Mandatory.
  32. `Metafield: custom.polish_type [list.single_line_text_field]`: `'Fully Polished'`, `'Partially Polished'`, or `'Matte'`.
  33. `Metafield: custom.cut_type [list.single_line_text_field]`: Literal `''` (empty string).
  34. `Metafield: shopify.age-group [list.metaobject_reference]`: Literal `'Adults'`.
  35. `Metafield: shopify.target-gender [list.metaobject_reference]`: Literal `'Unisex'`.
  36. `Variant Metafield: mm-google-shopping.custom_label_1`: Literal `'Rare Earth Gallery'` on Row 1.
  37. `Metafield: reg.designer`: Literal `'Rare Earth Gallery'`.
  38. `Status`: Literal `'active'`.
  39. `Published`: Literal `'FALSE'`.
  40. `Published Scope`: Literal `'global'`.
  41. `Variant Taxable`: Literal `'true'` on Row 1.
  42. `Variant Inventory Tracker`: Literal `'shopify'` on Row 1.
  43. `Variant Inventory Policy`: Literal `'deny'` on Row 1.
  44. `Variant Fulfillment Service`: Literal `'manual'` on Row 1.
  45. `Variant Requires Shipping`: Literal `'true'` on Row 1.
  46. `Included / Art Of Decor`: Literal `'TRUE'`.
  47. `Included / Trade Partners - Fountains`: `'TRUE'` if keyword matches fountain, else `'FALSE'`.
  48. `Included / Trade Partners - Pendant Lights`: `'TRUE'` if keyword matches pendant, else `'FALSE'`.
  49. `Inventory Available: Art Of Decor`: Quantity on Row 1 (integer, default 1); blank on extra image rows.

---

### Format 5: `fmt-shopify-batch-wizard-xlsx`
* **Name:** Shopify Batch Wizard Export
* **Domain:** Catalog / E-Commerce Studio Output
* **Direction:** Export
* **UI Trigger:** `BatchProcessingWizard` footer action button `<Key onClick={handleXlsx}>{tr('Generate XLSX')}</Key>` / download link (`src/features/inventory/BatchProcessingWizard.tsx:1423-1428`).
* **Function & Source:** `buildXlsx` in `src/features/inventory/BatchProcessingWizard.tsx:440-528`.
* **Data Sources:** In-memory batch execution queue (`ExportEntry[]`), normalized item attributes, AI generated copy and masks.
* **File Naming:** `Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx` (e.g. `Shopify_Export_AI_2026-10-04.xlsx`).
* **Target Consumer:** Studio Operator / Client E-Commerce Manager.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Shopify Export'`.
  * Header Styling: Row 1 bold text, default Excel fill.
* **Column Definitions & Data Availability (47 Columns):**
  *NOTE:* This format diverges from Format 4 (`MainHeader.tsx`) and contains critical schema defects:
  1-2. `Handle`, `Title`: Same as Format 4.
  3. `Body (HTML)`: **DEFECT:** Named `'Body (HTML)'` instead of `'Body HTML'` (drops column in Matrixify).
  4-18. Same base variant columns.
  19. `Variant Metafield: Vendor_SKU`: Populated with combined string `${tagId}-${vendorSku}${costMxn}`.
  20-27. Dimension and material columns.
  28. `Product Category`: **DEFECT:** Swapped order (placed before `Tags`).
  29. `Tags`: Placed after Product Category.
  30-47. Standard metafields and trade partner columns.
  *CRITICAL DEFECTS:* Does NOT blank variant columns on extra image rows; does NOT include `Variant Country of Origin`; does NOT include `Inventory Available: Art Of Decor`.

---

### Format 6: `fmt-trucking-manifesto-xlsx`
* **Name:** Consolidated Trailer Manifesto XLSX
* **Domain:** Logistics / Customs Clearance
* **Direction:** Export
* **UI Trigger:** `TruckingModule` -> `TruckExportModal` -> ExportCard "Consolidated Manifesto" (`src/features/logistics/TruckingModule.tsx:2246-2248`). Available to Logistics Manager.
* **Function & Source:** `generateManifesto` in `src/features/logistics/TruckingModule.tsx:1934-1970`.
* **Data Sources:** `truckCrates` (all crates loaded onto the active trailer), item normalized records, `calculateCodesAndPrices`.
* **File Naming:** `${name}_Consolidated_Manifesto.xlsx` where `name` is the truck shipment identifier (e.g. `TRK-2026-10-04_Consolidated_Manifesto.xlsx`).
* **Target Consumer:** US & Mexican Customs Brokers, Freight Carrier Drivers, Internal Logistics Accounting.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Manifesto'`.
  * Header Styling: Row 1 bold, plain font, auto column widths.
* **Column Definitions & Data Availability:**
  1. `Book TAG ID` (w: 20): Item barcode tag string.
  2. `Quantity` (w: 10): Item count (number).
  3. `Description` (w: 50): Formatted string `${color} - ${material} - ${shape} - ${shortDescription}`. Falls back to `'Artifact'`.
  4. `Weight (KG)` (w: 15): Item weight in kg.
  5. `Dimensions (CM)` (w: 20): Formatted `${length}×${width}×${height} cm`.
  6. `Acq. Cost MXN` (w: 20): `calculated.acquisitionCostMxn || 0`.

---

### Format 7: `fmt-trucking-crates-spreadsheets-xlsx`
* **Name:** Crate Spreadsheets (Per-Box Worksheet Breakdown)
* **Domain:** Logistics / Warehouse Inspection
* **Direction:** Export
* **UI Trigger:** `TruckingModule` -> `TruckExportModal` -> ExportCard "Crate Spreadsheets" (`src/features/logistics/TruckingModule.tsx:2255-2257`).
* **Function & Source:** `generatePacked` in `src/features/logistics/TruckingModule.tsx:2153-2202`.
* **Data Sources:** Root container records in `truckCrates` (`filter(c => !c.parent_id)`), nested box items, normalized inventory.
* **File Naming:** `${name}_Crate_Spreadsheets.xlsx` (e.g. `TRK-2026-10-04_Crate_Spreadsheets.xlsx`).
* **Target Consumer:** Warehouse Unpacking Crews, Destination Receiving Dock, Quality Assurance Inspectors.
* **Workbook Structure:**
  * Worksheets: One worksheet per root container (crate or pallet). Worksheet name is sanitized crate label (max 31 characters, deduplicated with `_1`, `_2`).
  * Header Styling: Row 1 bold text, standard system styling.
* **Column Definitions & Data Availability:**
  1. `Book TAG ID` (w: 20): Item barcode tag string.
  2. `Quantity` (w: 10): Item count.
  3. `Description` (w: 40): Formatted `${color} - ${material} - ${shape} - ${shortDescription}`.
  4. `Weight (KG)` (w: 15): Item weight in kg.
  5. `Dimensions (CM)` (w: 20): Formatted `${length}×${width}×${height} cm`.
  6. `Container` (w: 25): Sub-container label (`item.packetIn || ''`) if packed inside a nested inner box.

---

### Format 8: `fmt-trucking-trailer-packing-list-xlsx`
* **Name:** Master Trailer Packing List XLSX (ReadyTruckWizard)
* **Domain:** Logistics / Trailer Dispatch
* **Direction:** Export
* **UI Trigger:** `TruckingModule` -> `ReadyTruckWizard` (final dispatch preparation) -> ExportCard "Master Packing List" (`src/features/logistics/TruckingModule.tsx:3180`).
* **Function & Source:** `generatePackingListXlsx` in `src/features/logistics/TruckingModule.tsx:2667-2779`.
* **Data Sources:** `truckCrates`, `truckNumbering`, shipment metadata fields (sealNumber, tractorNumber, truckPlates, trailerNumber, trailerPlates, senders, packingItems), `allCrates`, `allInventory`.
* **File Naming:** `Master_Packing_List_${exportTimestamp.current}.xlsx`.
* **Target Consumer:** Border Customs Officers, Commercial Carrier Dispatch, Terminal Warehouse Managers.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Trailer Packing List'`.
  * Header Banner:
    * Row 1: `ONYX LOGISTICS · TRAILER PACKING LIST` (16pt bold, color `#F97316`).
    * Row 2: `Exported At: [timestamp]`.
    * Rows 4-10: Shipment metadata table (Seal #, Tractor #, Truck Plates, Trailer #, Trailer Plates, Senders).
    * Row 12: Column headers with fill `#F97316` (Orange), bold white text, centered.
  * Section Rows: Each root crate creates a merged 7-column header `UNIT [N]: [CRATE LABEL]` filled with light gray `#F3F4F6`.
  * External Packing Section: Optional section for cardboard boxes (`EXTERNAL PACKING & CARDBOARD UNITS`).
* **Column Definitions & Data Availability:**
  1. `Crate / Unit` (key: `crate`, w: 25): Crate display label.
  2. `Book TAG ID` (key: `tag`, w: 22): Item barcode tag ID.
  3. `Qty` (key: `qty`, w: 8): Loaded quantity. Centered.
  4. `Description` (key: `desc`, w: 50): Formatted `${color} - ${material} - ${shape} - ${shortDescription}`.
  5. `Dimensions (CM)` (key: `dims`, w: 22): Formatted `${length}×${width}×${height}`.
  6. `Weight (KG)` (key: `weight`, w: 12): Item weight. Centered.
  7. `Sub-Container` (key: `box`, w: 25): Inner box label string.

---

### Format 9: `fmt-crates-wizard-packing-list-xlsx`
* **Name:** Crate Selection Master Packing List XLSX (ExportCratesWizard)
* **Domain:** Logistics / Warehouse Crate Export
* **Direction:** Export
* **UI Trigger:** `ExportCratesWizard` modal -> ExportCard "Master Packing List" (`src/features/logistics/ExportCratesWizard.tsx:388`).
* **Function & Source:** `generatePackingListXlsx` in `src/features/logistics/ExportCratesWizard.tsx:110-185`.
* **Data Sources:** `selectedCrates`, shipment metadata fields (`shipmentRef`, `senders`, `truckPlates`, `notes`), `allCrates`, `allInventory`.
* **File Naming:** `Master_Packing_List_${exportTimestamp.current}.xlsx` (or `${filename}.xlsx`).
* **Target Consumer:** Freight Forwarder, Warehouse Logistics Staff.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Master Packing List'`.
  * Header & Section Styling: Identical banner, orange header fill (`#F97316`), and section divider structure as Format 8 (`TruckingModule.tsx`).
* **Column Definitions & Data Availability:**
  Identical 7 columns to Format 8 (`crate`, `tag`, `qty`, `desc`, `dims`, `weight`, `box`).

---

### Format 10: `fmt-packing-printables-wizard-xlsx`
* **Name:** Printables Wizard Legacy Inventory XLSX
* **Domain:** Packing / Workshop / Label Verification
* **Direction:** Export
* **UI Trigger:** `PackingModule` -> `PrintablesWizard` modal -> "inventory.xlsx / Master spreadsheet (Legacy)" Generate/Download button (`src/features/logistics/PackingModule.tsx:327-340`).
* **Function & Source:** `handleGenerateXLSX` in `src/features/logistics/PackingModule.tsx:174-222`.
* **Data Sources:** `items` prop passed to `PrintablesWizard`, item `normData`, item `codes`, `workbookPrefix`.
* **File Naming:** `${name}.xlsx` where `name` defaults to `Onyx_Labels_${month}_${day}` (e.g. `Onyx_Labels_Oct_4.xlsx`).
* **Target Consumer:** Workshop Artisans, Packing Station Technicians, Quality Control.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Packing List'`.
  * Header Styling: Row 1 bold text, uniform column width 22 across all columns.
* **Column Definitions & Data Availability (9 Columns):**
  1. `TAGID`: `c.bookBarcode`. Non-null.
  2. `DESCRIPTION`: `${shape} ${itemType}`. Falls back to `'ONYX PIECE'`.
  3. `MATERIAL COLOR`: `${material} ${color}`.
  4. `SIZES`: `${width}*${length}*${height} CM`.
  5. `QUANTITY`: `d.quantity || 1`.
  6. `LANDED CODE`: `c.bookLandCode || ''`.
  7. `ACQ CODE`: `c.bookAqCode || ''`.
  8. `BOOK RETAIL`: Stamped tag `${c.bookAqCode}-${bookv}${retailStr}` (e.g. `AQ-3260450`).
  9. `QR URL`: Generated verification URL `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${tag}`.

---

### Format 11: `fmt-packing-raw-xml-xlsx`
* **Name:** Packing Fast Direct OpenXML Export
* **Domain:** Packing / Production Tracking
* **Direction:** Export
* **UI Trigger:** Triggered automatically during Step 1 of `handlePrintLabels` in `PackingModule.tsx:700` or via top bar action raising `packingExportXLSXTriggerAtom` (`PackingModule.tsx:806-811`).
* **Function & Source:** `handleExportXLSX` in `src/features/logistics/PackingModule.tsx:569-597` calling `exportToXLSX` in `src/lib/xlsxUtils.tsx:170-209`.
* **Data Sources:** `selectedItems` in `PackingModule`, `workbookPrefix`, `codes`.
* **File Naming:** `Packing_List_${date}.xlsx` where `date` is `new Date().toISOString().split('T')[0]` (e.g. `Packing_List_2026-10-04.xlsx`).
* **Target Consumer:** Workshop Supervisor, Production Audit Log.
* **Workbook Structure:**
  * Worksheets: Exactly 1 sheet named `'Packing List'`.
  * Underlying Engine: Raw XML zip archive generation (`JSZip`) bypassing ExcelJS.
  * Header Styling: Row 1 bold Calibri 11pt, default gray fill.
* **Column Definitions & Data Availability:**
  Identical 9 columns and row data mapping to Format 10 (`TAGID`, `DESCRIPTION`, `MATERIAL COLOR`, `SIZES`, `QUANTITY`, `LANDED CODE`, `ACQ CODE`, `BOOK RETAIL`, `QR URL`).

---

### Format 12: `fmt-archive-season-825-csv`
* **Name:** Season 825 Archive Inventory CSV
* **Domain:** Archive / Historical Accounting
* **Direction:** Export
* **UI Trigger:** `ArchivePanel` (when active view is `'workbook'` / Archived Season 825) -> top bar button `<button onClick={handleExportCSV}>{tr("Export CSV")}</button>` (`src/features/archive/ArchivePanel.tsx:228`). Available to Developer and Admin roles.
* **Function & Source:** `handleExportCSV` in `src/features/archive/ArchivePanel.tsx:62-115`.
* **Data Sources:** Current paginated items (`items`), `finance` record dictionary (`finance[item.id]`), `selectedVendor`, `book.season` (`825`).
* **File Naming:** `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page}.csv` (e.g. `archive_825_EM_page0.csv`).
* **Target Consumer:** Internal Auditors, Forensic Accountants, Executive Management.
* **Structure & Defenses:**
  * Delimiter: Comma `,`.
  * Quoting: All headers and cells wrapped in double quotes.
  * CSV Injection Prevention: Cell sanitizer `csvCell` prefixes any value starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with an apostrophe `'` to prevent spreadsheet formula execution upon opening.
* **Column Definitions & Data Availability:**
  * **Base Columns (All Users):**
    1. `VND`: Vendor code string (e.g. `'EM'`).
    2. `TAG ID`: Archived barcode tag string or empty.
    3. `Item Number`: Stored numeric item number.
    4. `Date`: Formatted item date string (`fmtDate(item.item_date)`).
    5. `Description`: Stored description text with doubled quotes.
    6. `Qty`: Stored item quantity string.
    7. `Wt.`: Item weight in kg string.
    8. `Dimensions`: Formatted `${height}x${width}x${length}`.
  * **Finance Role Columns (Appended if `isFinanceRole` is true):**
    9. `Price MXN`: Base acquisition cost in MXN string.
    10. `Total Pesos`: Total MXN string.
    11. `AQ`: Acquisition USD price string.
    12. `LND`: Landed USD price string.
    13. `Retail`: Retail USD price string.
    14. `Total USD`: Total USD string.
    15. `AQC`: Acquisition code string.
    16. `LC`: Landed code string.
    17. `SQM Price`: Square meter price calculation string.
    18. `AQ Round`: Rounded acquisition cost string.
    19. `LND Round`: Rounded landed cost string.
    20. `Desc Price`: Descriptive price code string.

---

### Format 13: `fmt-vendor-batch-create-import-xlsx`
* **Name:** Vendor Intake Batch Spreadsheet Import
* **Domain:** Intake / Automated Inventory Creation
* **Direction:** Import
* **UI Trigger:** Upload screen / Batch Processing wizard spreadsheet file dropzone (`src/features/upload/batchSheet.ts:163-242`).
* **Function & Source:** `parseSheet` in `src/features/upload/batchSheet.ts:163-242`.
* **Data Sources:** Uploaded binary `.xlsx` workbook bytes (Sheet named after vendor code wins over Sheet 0).
* **Target Consumer:** Parsed and converted into `BatchCreateItem[]` for review, AI completion, and DB insertion.
* **Column Mapping Rules (`COLUMN_MAP`):**
  Headers are accent-folded (`foldHeader`) and stripped of bracketed units (e.g. `'Precio (MXN)'` -> `'precio'` -> `'price'`).
  * `cantidad`, `qty`, `q` -> `quantity` (Numeric)
  * `forma`, `shape` -> `shape` (Text)
  * `tipo`, `type` -> `itemType` (Text)
  * `color` -> `color` (Text)
  * `material` -> `material` (Text)
  * `ancho`, `width`, `w cm` -> `widthCm` (Numeric)
  * `alto`, `height`, `h cm` -> `heightCm` (Numeric)
  * `fondo`, `depth`, `d cm` -> `lengthCm` (Numeric)
  * `precio`, `price`, `per piece mxn$`, `per piece mxn` -> `price` (Numeric)
  * `total`, `total pesos` -> `_total` (Ignored/Validated)
  * `description`, `description color - object type`, `descripcion` -> `description` (Text)
  * `#` -> `itemNumber` (Validated sequential number: 4, '004', 'EM-004' map to 4)
  * `date`, `fecha` -> `_date` (Ignored)
  * `tag-id`, `tag id` -> `_tagId` (Ignored)
  * `kg`, `peso` -> `weightKg` (Numeric)
  * `aqc`, `lc` -> `_aqc`, `_lc` (Ignored)

---

## 3. Duplicates and Overlaps Table

| Overlap Subject | First Code Path | Second Code Path | Divergences / Risk Analysis | Recommended Action |
|---|---|---|---|---|
| **Shopify Matrixify Export** | `src/features/core/MainHeader.tsx:3534` (`handleShopifyExportXLSX`) | `src/features/inventory/BatchProcessingWizard.tsx:440` (`buildXlsx`) | `MainHeader` has 48 headers, blanks variant fields on secondary rows, includes `Variant Country of Origin` and `Inventory Available`. `BatchProcessingWizard` uses invalid header `'Body (HTML)'`, omits `Variant Country of Origin`, swaps `Tags` and `Category`, and fails to blank variant fields on extra image rows (causes Matrixify variant collision). | **Retire BatchProcessingWizard builder.** Point both triggers to the central Print Module engine using `MainHeader`'s verified 48-column schema. |
| **Master Packing List** | `src/features/logistics/TruckingModule.tsx:2667` (`generatePackingListXlsx`) | `src/features/logistics/ExportCratesWizard.tsx:110` (`generatePackingListXlsx`) | 95% identical code copied verbatim. Sheet name differs (`'Trailer Packing List'` vs `'Master Packing List'`). Metadata fields differ slightly (`sealNumber`/`tractorNumber` vs `shipmentRef`/`notes`). | **Unify into single Trailer/Crate Packing List generator.** Pass optional metadata fields object to a shared sheet generator. |
| **Packing Module XLSX** | `src/features/logistics/PackingModule.tsx:174` (`handleGenerateXLSX` in `PrintablesWizard`) | `src/features/logistics/PackingModule.tsx:569` (`handleExportXLSX` via `xlsxUtils.tsx`) | Both generate the exact same 9 columns (`TAGID` through `QR URL`). One uses `ExcelJS`; the other uses `xlsxUtils.tsx` with manual XML templating in `JSZip`. | **Deprecate `xlsxUtils.tsx` direct XML generation.** Route all packing exports through the shared ExcelJS engine with standardized styling. |
| **Vendor Inventory Export** | `src/features/core/MainHeader.tsx:2581` (in Master Book-326) | `src/features/core/MainHeader.tsx:2809` (in Workbook V2) | Master export outputs flat table with vendor color header. V2 outputs banner block (rows 1-4), autoFilter, dynamic hyperlinked image columns, Excel formulas, and a disbursements/charges reconciliation table. | **Standardize on Workbook V2 vendor format.** Provide toggle for lightweight vs full reconciliation mode. |
| **Finance Ledger Export** | `src/features/core/MainHeader.tsx:1953` (in Master Book-326) | `src/features/core/MainHeader.tsx:3470` (in Workbook V2) | Classic export creates plain worksheet with manually styled cells. V2 creates native OpenXML Table (`FinanceLedgerTable`) with `TableStyleMedium2`. | **Adopt V2 native table format.** Excel tables provide built-in sorting, filtering, and structured references. |
| **Consolidated Shipped Items** | `src/features/logistics/TruckingModule.tsx:1936` (`generateManifesto`) | `src/features/core/MainHeader.tsx:2387` (TRK Deployed sheet in Master export) | Both report items assigned to a shipment trailer. `TruckingModule` has 6 columns without pricing/codes. `MainHeader` has 19 columns with full pricing, landed costs, and payment status. | **Retain both as distinct levels:** Level 1 = Driver/Customs Manifesto (no sensitive margins); Level 2 = Accounting Shipped Manifest. |

---

## 4. Style Inconsistencies & Unified Workbook Style Proposal

### Current Inconsistencies
* **Typography:** `EXCEL_STYLES` (`src/lib/excelStyles.ts`) specifies `Arial` (size 10 bold header, size 9 body). `xlsxUtils.tsx` hardcodes `Calibri` 11pt. `TruckingModule.tsx` and `ExportCratesWizard.tsx` do not specify font family, falling back to Excel's default font.
* **Header Background Fills:**
  * Indigo `#4F46E5` (`MainHeader` Selected Items & Report).
  * Dark Charcoal `#1F2937` (`MainHeader` Summary & Finance Ledger).
  * Forest Green `#064E3B` (`MainHeader` Classic TRK).
  * Emerald Green `#10B981` (`MainHeader` V2 TRK & `ExportCratesWizard`).
  * Safety Orange `#F97316` (`TruckingModule` Trailer Packing List & `ExportCratesWizard`).
  * Amber `#B45309` / `#F59E0B` (`MainHeader` Shopify Icon & Not Ready sheets).
  * Vendor Brand Colors (`getVendorColor(tagId)`) dynamically applied across vendor sheets.
* **Row Heights & Text Alignment:** Header row heights vary between default (15pt) and unadjusted. Text vertical alignment is omitted in several modules, causing numbers and text to sit at the cell baseline rather than centered vertically.
* **Freeze Panes:** Almost completely absent across the application. Large datasets (hundreds of inventory rows) scroll headers offscreen immediately.
* **Number Formatting:** Inconsistent usage of integer formats (`#,##0`) vs decimal formats (`#,##0.00`) for currency and weights.

### Proposal: The Unified Onyx Workbook Style
Leverage and expand `src/lib/excelStyles.ts` to enforce a single visual identity across all generated files:

```typescript
// Proposed unified styling additions for src/lib/excelStyles.ts
export const ONYX_WORKBOOK_THEME = {
    fonts: {
        banner: { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
        section: { name: 'Arial', size: 10, bold: true, italic: true, color: { argb: 'FF1F2937' } },
        header: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        body: { name: 'Arial', size: 9, color: { argb: 'FF111827' } },
        bodyMono: { name: 'Courier New', size: 9, bold: true },
        subtotal: { name: 'Arial', size: 10, bold: true },
    },
    fills: {
        headerPrimary: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },    // Gray-800
        headerAccent: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } },     // Indigo-600
        headerOrange: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } },     // Orange-500
        headerEmerald: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } },    // Emerald-600
        sectionDivider: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },   // Gray-100
        zebra: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } },            // Gray-50
        zebraDark: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },        // Gray-100
    },
    borders: {
        thin: {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        },
        headerBottom: {
            bottom: { style: 'medium', color: { argb: 'FF111827' } },
        }
    },
    alignments: {
        header: { vertical: 'middle', horizontal: 'center', wrapText: true },
        center: { vertical: 'middle', horizontal: 'center' },
        left: { vertical: 'middle', horizontal: 'left' },
        right: { vertical: 'middle', horizontal: 'right' },
    },
    numFormats: {
        currencyMxn: '$#,##0',
        currencyUsd: '$#,##0.00',
        integer: '#,##0',
        decimal: '#,##0.00',
        date: 'YYYY-MM-DD',
    }
};
```

#### Shared Rules:
1. **Always Freeze Row 1 (or Header Row):** `ws.views = [{ state: 'frozen', ySplit: headerRowIndex }]`.
2. **Auto-fit Row Heights:** Minimum 24pt for column headers, 18pt for data rows.
3. **Contrast Guarantee:** Every colored cell must pass through `getContrastColor(argb)` to ensure white or black text readability.

---

## 5. Shared Building Blocks for Extraction

The centralized Print Module (`PM1`) should encapsulate all spreadsheet operations into six modular services:

### 1. Declarative Column Engine (`ColumnSpec<T>`)
Replaces ad-hoc column definitions with a typed specification:
```typescript
export interface ColumnSpec<T> {
    header: string;
    key: string;
    width: number;
    numFmt?: string;
    alignment?: 'left' | 'center' | 'right';
    value: (item: T, index: number) => any;
    cellStyle?: (item: T, value: any) => { fill?: string; fontColor?: string; bold?: boolean };
}
```

### 2. Standardized Header & Banner Writer
A reusable component to render document metadata blocks across all workbooks:
* Level 1: Full Metadata Block (Tractor, Trailer, Senders, Seal, Timestamps).
* Level 2: Section Dividers (`UNIT N: ...` or `── CATEGORY ──`).
* Level 3: Table Column Headers with automatic freeze panes and autoFilter bounds.

### 3. Unified Image Embedder & Hyperlink Service
Extracts the divergent Google Drive and CDN image logic:
* Normalizes URLs via `toDriveDownloadUrl` and `getCleanImageUrl`.
* Generates safe formulas: `=HYPERLINK("...", "View Image N")`.
* Prepared for future binary image embedding using `workbook.addImage()` when generating physical offline catalogs.

### 4. Excel Formula & Subtotal Generator
Standardizes calculation rows:
* Dynamically calculates range boundaries (`SUM(E6:E{lastRow})`) without hardcoding vulnerable row numbers.
* Implements multi-tier accounting blocks (Subtotal -> Charges -> Payments -> Balance).

### 5. Cell Sanitization Pipeline
Adopts `sanitizeExcelValue` and `sanitizeExcelRow` from `src/lib/xlsxUtils.tsx:11-38` as mandatory middleware for **all** ExcelJS row insertions to prevent illegal control characters (`\x00-\x1F`) and string limits (>32,767 chars) from corrupting `.xlsx` archives.

### 6. Centralized Stream & Download Manager
Replaces redundant blob creation and `document.createElement('a')` routines:
* Consistent date formatting: `Onyx_[Type]_[Season]_[Date].xlsx`.
* Progress notification handling with active toast reporting.
* Automatic URL object revocation (`URL.revokeObjectURL`).

---

## 6. Invariants: What MUST NOT Change

The following constraints are rigid and must be preserved during centralization to prevent breaking external integrations, customs procedures, or client pipelines:

### 1. Shopify / Matrixify Header Strings & Positions
* **Exact Header Names:** Matrixify matches columns strictly by header text. Any change (e.g. adding brackets to `Body HTML` or accents to `Included / Art Of Decor`) silently drops the column.
* **Blank Secondary Rows:** All columns starting with `'Variant'`, `'Option'`, or `'Inventory Available'` MUST remain blank on secondary image rows. Populating them breaks Shopify variant creation.
* **Required Metafields:** Headers such as `Metafield: shopify.material [list.metaobject_reference]` and `Metafield: custom.variety [list.single_line_text_field]` are bound to Shopify metaobjects and must not be altered.

### 2. Cross-Border Trucking & Customs Manifest Headers
* The 6-column customs manifest format (`Book TAG ID`, `Quantity`, `Description`, `Weight (KG)`, `Dimensions (CM)`, `Acq. Cost MXN`) is required by the US/Mexico customs broker and freight forwarders.
* The 7-column trailer packing list format (`Crate / Unit`, `Book TAG ID`, `Qty`, `Description`, `Dimensions (CM)`, `Weight (KG)`, `Sub-Container`) is actively used on the physical trailer loading dock.

### 3. Season 826 Calculation & Coding Rules
* **Barcode Tag ID Structure:** Season prefix `326` (e.g. `AM32623NXM` or `EM-326-001`).
* **Price Multipliers:**
  * Acquisition Cost USD: `costMxn / bookRate` (rounded via `onyxRound`).
  * Landed Cost: `Acquisition USD * 1.4`.
  * Retail Price: `Landed USD * 12`.
* **Book Retail Stamped Tag:** Formatted as `${bookAqCode}-${bookv}${retailStr}` (e.g. `AQ-3260450`).

### 4. Season 825 Historical Archive Schema
* Season 825 represents immutable archived books. The CSV export headers (`VND`, `TAG ID`, `Item Number`, `Date`, `Description`, `Qty`, `Wt.`, `Dimensions`, `Price MXN`, `Total Pesos`, `AQ`, `LND`, `Retail`, `Total USD`, `AQC`, `LC`, `SQM Price`, `AQ Round`, `LND Round`, `Desc Price`) and order must remain unchanged for historical auditing.

### 5. Vendor Intake Spreadsheet Mappings (`COLUMN_MAP`)
* The Spanish-to-English header dictionary in `src/features/upload/batchSheet.ts` (`cantidad`, `forma`, `tipo`, `color`, `material`, `ancho`, `alto`, `fondo`, `precio`, `total`, `description`, `#`, `kg`) matches the physical Excel books maintained by artisans in Tepeaca and Tecali de Herrera, Puebla.
* Number cleaning rules (handling commas as decimals vs thousands separators) must be retained.
