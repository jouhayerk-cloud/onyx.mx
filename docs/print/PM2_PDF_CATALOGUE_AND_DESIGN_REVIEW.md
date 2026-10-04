# Onyx.mx Print & PDF Catalogue and Design Review

## Part A: Document Catalogue

### 1. Catalog Hub / Inventory Sheet
* **ID**: `pdf-inventory-sheet`
* **Name**: Catalog Page / Tag Sheet
* **Purpose**: Provide a detailed item view with images, barcodes, dimensions, and weight for internal inventory or external cataloging.
* **UI Trigger**: Export Catalog / Print Item.
* **Function & File**: `drawHeader`, `drawCatalogHubPage` in `src/lib/pdfExport.ts:323`, `704`.
* **Page Size & Orientation**: Dynamic/A4 Portrait.
* **Margins**: Left/Right bounds calculated dynamically (e.g., `M`, `PW` variables).
* **Fonts & Sizes**: Helvetica (Normal, Bold), sizes 8pt, 9pt, 10pt.
* **Colours**: Greyscale RGB values `(20,20,20)`, `(60,60,60)`, `(80,80,80)`, `(100,100,100)`.
* **Layout**: 
  * Header: Item ID, barcode, dimensions, and weight.
  * Body: Product images with optional background plate (Contain/Cover drawing).
  * Footer/QR: QR and Barcode placed in the header block.
* **Data Fields & Sources**: `barcode` / `bookBarcodeDisplay` / `bookTagId`, metric/imperial dimensions, metric/imperial weight (`weightKg`), item images.
* **Images**: Remote images fetched via DataURL proxies and drawn to canvas.
* **Pagination Rules**: Variable layout depending on `exportType` ('regular' vs 'catalog').
* **File Naming**: Dynamic based on item name/ID.
* **Consumer**: Warehouse staff, Vendors, Clients.
* **Data Availability**: Dimensions (`dimsMetric`, `dimsImp`) and Weight (`weightKg`) are often unavailable and gracefully fallback to `—`.

### 2. Crate Manifesto
* **ID**: `pdf-crate-manifesto`
* **Name**: Logistics Manifesto / Crate Manifesto
* **Purpose**: Summarize crate and pallet contents, weights, and counts for a shipment.
* **UI Trigger**: Export Manifesto.
* **Function & File**: `exportCrateManifesto` in `src/lib/crateManifesto.ts:235`.
* **Page Size & Orientation**: A4 Landscape (`format: 'a4', orientation: 'landscape'`).
* **Margins**: Top: 15mm, Bottom: 15mm, Left: 15mm, Right: 15mm.
* **Fonts & Sizes**: Helvetica (Normal, Bold), sizes 9pt, 12pt, 14pt, 16pt.
* **Colours**: `TEXT_HI`, `TEXT_LO`, White `(255,255,255)` on dark backgrounds.
* **Layout**: 
  * Header (H=36mm): QR code, Logo, Title, Subtitle, Dimensions, Total Weight, SKU count.
  * Body: Tabular list of crates.
  * Footer (H=15mm): Branding string (`Onyx.mx - Made In Mexico for...`) and export date.
* **Data Fields & Sources**: `dynamicId`, `crateId`, `crateDims`, `crateType`, `exportedAt`, `customTitle`, `subtitle`, `branding`, total crates/pallets/units, summary weight, wireframe/axonometric images.
* **Images**: Wireframe icons (Pallet/Crate), Axonometric generated views.
* **Pagination Rules**: Header on first page, continuation margins on subsequent pages.
* **File Naming**: Manifesto ID.
* **Consumer**: Logistics, Customs, Freight Forwarders.
* **Data Availability**: `customTitle`, `subtitle`, `crateDims`, and `branding` can be empty.

### 3. Trailer Packing List
* **ID**: `html-trailer-manifest`
* **Name**: Trailer Manifest / Packing List
* **Purpose**: Detail truck payload, distribution, routing, and seal info for a truck trailer.
* **UI Trigger**: Print Trailer Manifest.
* **Function & File**: `generatePackingListHtml` in `src/features/logistics/generatePackingListHtml.ts:3`.
* **Page Size & Orientation**: Browser default (HTML print).
* **Margins**: HTML `padding: 60px;`, Print `@media print { padding: 0; }`.
* **Fonts & Sizes**: Inter, JetBrains Mono. Sizes range from `8px` up to `42px`. Weights 400, 700, 900.
* **Colours**: Text `#111827`, `#94a3b8`, `#cbd5e1`, `#e2e8f0`, `#059669`. Vendor/Crate dynamic colours.
* **Layout**:
  * Header: Title, Protocol Version, Export Timestamp, Manifest ID.
  * Metrics Grid: Payload weight, distribution bars (Rear/Mid/Front), Volume status, Seal, Tractor/Trailer Plates.
  * 3D Viewer: Interactive map (hidden in print, replaced by static thumbnail).
  * Table (Inventory): Seq, Barcode ID, Description/Attributes, Color/Material, Qty.
* **Data Fields & Sources**: `manifestId`, `timestamp`, `truckStats` (weight, payloadPct, rPct, mPct, fPct, status, volPct), `sealNumber`, `tractorNumber`, `truckPlates`, `trailerNumber`, `trailerPlates`, `senders`. Crate item fields (`seq`, `itemId`, `name`, `type`, `desc`, `combinedAttr`, `qty`).
* **Images**: 3D Canvas rendering (fallback static thumbnail).
* **Pagination Rules**: `page-break-inside: avoid;` applied to crate groups.
* **File Naming**: Triggered via browser print dialog.
* **Consumer**: Drivers, Logistics, Customs.
* **Data Availability**: `truckStats`, `sealNumber`, `tractorNumber`, `trailerNumber`, `trailerPlates`, and `senders` are frequently unavailable and render as `—`.

### 4. Crates Manifest
* **ID**: `html-crates-manifest`
* **Name**: Crates Manifest / Shipping List
* **Purpose**: Detail individual crates and their items without truck-specific payload information.
* **UI Trigger**: Print Crates List.
* **Function & File**: `generateCratesListHtml` in `src/features/logistics/generateCratesListHtml.ts:3`.
* **Page Size & Orientation**: Browser default (HTML print).
* **Margins**: Same as Packing List.
* **Fonts & Sizes**: Same as Packing List.
* **Colours**: Same as Packing List.
* **Layout**:
  * Header: Title, Export Timestamp, Manifest ID.
  * Metrics Grid: Total Weight, Units exported, Shipment Ref, Senders Info, Truck Plates, Notes.
  * Table (Inventory): Identical to Packing List.
* **Data Fields & Sources**: `manifestId`, `timestamp`, `totalWeight`, `crates.length`, `shipmentRef`, `senders`, `truckPlates`, `notes`. Crate item fields.
* **Images**: None.
* **Pagination Rules**: `page-break-inside: avoid;` applied to crate groups.
* **File Naming**: Triggered via browser print dialog.
* **Consumer**: Warehouse, Logistics.
* **Data Availability**: `shipmentRef`, `senders`, `truckPlates`, and `notes` are frequently unavailable and render as `—`.

### 5. Viewer Export
* **ID**: `pdf-viewer-export`
* **Name**: 3D Viewer Export
* **Purpose**: Export fullscreen captures of the Three.js canvas or product imagery to PDF.
* **UI Trigger**: Export Wizard within the 3D Viewer.
* **Function & File**: Component `ViewerView` (uses jsPDF) in `src/features/viewer/ViewerView.tsx:25`.
* **Page Size & Orientation**: Unspecified (likely screen aspect ratio or A4 Landscape).
* **Margins**: Likely borderless or minimal.
* **Fonts & Sizes**: N/A (Image-centric).
* **Colours**: Full RGB from Canvas.
* **Layout**: Full-bleed images.
* **Data Fields & Sources**: Canvas captures (`dataUrl`).
* **Images**: Yes.
* **Pagination Rules**: One image per page.
* **Consumer**: Clients, Internal Review.
* **Data Availability**: Relies entirely on canvas rendering success.

---

## Part B: Apple Design Review

### `pdf-inventory-sheet` (Catalog / Inventory Sheet)
* **Hierarchy**: Clear grouping of dimensions and weights, but visual weighting lacks a distinct focal point.
* **Type Scale & Legibility**: Uses 8pt for labels and 10pt for values. **8pt is critically small** and fails Apple's accessibility baseline for legibility (minimum 10pt for desktop/print).
* **Colour Use**: Relies on `RGB(100,100,100)` for secondary text. This is legible, but may wash out on low-quality monochrome printers.
* **Score**: **3 / 5**
* **Defects**: 8pt text is too small for standard print accessibility. Needs an upward shift in the type scale.

### `pdf-crate-manifesto` (Crate Manifesto)
* **Hierarchy**: Good structural breakdown. Header is well-defined.
* **Type Scale & Legibility**: Employs a healthy scale (9pt, 12pt, 14pt, 16pt), avoiding microscopic text.
* **Colour Use**: Safe text colors, but the use of white text (`255,255,255`) on dark backgrounds can bleed heavily on laser printers and consume unnecessary toner.
* **Score**: **3 / 5**
* **Defects**: Inverted text (white on dark) is hostile to standard document printing.

### `html-trailer-manifest` (Trailer Packing List)
* **Hierarchy**: Flat and aggressive. The overuse of `font-weight: 900` destroys nuance.
* **Type Scale & Legibility**: Fonts defined in pixels (`8px`, `9px`, `10px`). `8px` translates to roughly **6pt** in print. This is microscopic and inaccessible.
* **Alignment & Grid**: Relies on hardcoded column widths (`width: 40px`, `width: 140px`).
* **Colour Use**: Light grey (`#94a3b8`) on white (`#ffffff`) has a contrast ratio of ~2.5:1, explicitly failing the WCAG 4.5:1 requirement. In grayscale print, this disappears entirely.
* **Content & Writing**: Almost every element uses `text-transform: uppercase`. Apple guidelines note that mixed/forced capitalization harms readability. It creates a "shouty" document.
* **Localisation**: Labels like "Total Weight" are hardcoded, bypassing the app's `tr()` i18n system.
* **Score**: **1 / 5 (Critical Issues)**
* **Defects**: 6pt equivalent text, failing contrast ratios, overused uppercase strings, i18n bypass, heavy reliance on color tags that map poorly to grayscale.

### `html-crates-manifest` (Crates Manifest)
* **Hierarchy & Type Scale**: Shares the exact same flawed CSS as the Trailer Manifest. Microscopic fonts, 900-weight everywhere.
* **Colour Use**: Same contrast failures.
* **Localisation**: Same hardcoded strings.
* **Score**: **1 / 5 (Critical Issues)**
* **Defects**: Identical to Trailer Manifest.

### `pdf-viewer-export` (Viewer Export)
* **Score**: **N/A** (Canvas image wrapper, no structural typography to critique).

---

## Part C: Unified PDF Design System

To resolve the inconsistencies, contrast failures, and legibility issues, all documents will adopt the following single unified design system. **No data fields will be added or removed.**

### 1. Page Presets
* **Formats**: A4 (210 x 297mm) and US Letter (8.5 x 11in).
* **Orientations**: Portrait (Inventory Sheets) and Landscape (Manifests).

### 2. Type Scale (Print Optimized)
All font sizes must be defined in points (`pt`) for reliable print scaling. Minimum size is strictly bounded to 10pt for readability.
* **Display**: 24pt (Manifest ID)
* **Title**: 16pt (Document Name)
* **Body / Table Data**: 12pt (Regular & Bold)
* **Caption / Label**: 10pt (Utility, minimum allowed size)
* **Weight**: Regular (400) for data, Bold (700) for headers/labels. **Remove all 900 (Black) weights.**

### 3. Grid & Whitespace
* **Margins**: 15mm global margins (Top, Bottom, Left, Right).
* **Spacing**: Use standard multiples for gaps (4mm, 8mm, 16mm).
* **Tables**: `page-break-inside: avoid` strictly enforced on table rows.

### 4. Header and Footer Pattern
* **Header**:
  * Top-left: Company Logo / Title (`16pt Bold`).
  * Top-right: Manifest ID (`24pt Bold`) + Timestamp (`10pt Regular`).
  * Bottom border: 1pt solid line separating header from content.
* **Footer**:
  * Bottom-left: Brand string (`10pt Regular`, localised).
  * Bottom-right: Page `X` of `Y` (`10pt Regular`).

### 5. Table Style
* **Typography**: Sentence case for data, Title case for headers. **No forced ALL CAPS.**
* **Borders**: 0.5pt solid bottom border for rows. No vertical lines.
* **Alignment**: Left-align text and descriptions; Right-align numbers, weights, and quantities.
* **Zebra Striping**: None (wastes ink, reduces contrast).

### 6. QR / Barcode Block
* **Sizing**: QR codes fixed at 20x20mm. Barcodes fixed at 40x12mm.
* **Contrast**: 100% Black on 100% White background.
* **Quiet Zone**: Absolute minimum of 4 white modules surrounding the code to ensure scanning reliability.

### 7. Colour Tokens (Greyscale-Safe)
Color cues must survive black-and-white printing.
* `print-text-primary`: `#000000` (Black)
* `print-text-secondary`: `#475569` (Dark Slate Gray — ensures > 4.5:1 contrast against white).
* `print-border`: `#CBD5E1` (Light Gray — only used for structural lines, never text).
* `print-accent`: `#0F172A` (Very Dark Blue — prints as rich black, used sparingly for emphasis).
* **Removal**: Remove all instances of `#94a3b8` text and white-on-dark inverted text blocks.

### 8. Single Document-Template Contract
All generators (`jsPDF` and `HTML`) must accept a unified data payload and handle missing data gracefully.

```typescript
interface UnifiedPrintPayload {
    metadata: {
        documentId: string;
        documentTitle: string; // tr() localised
        timestamp: string;
        branding?: string; // Optional
    };
    summary: {
        label: string; // tr() localised
        value: string | number; // Fallback to '—' if unavailable
    }[];
    tables: {
        headers: string[]; // tr() localised
        rows: (string | number)[][];
    }[];
    codes?: {
        qrDataUrl?: string;
        barcodeDataUrl?: string;
    };
}
```
* **Handling Unavailable Data**: If a field (e.g., `truckStats`, `sealNumber`, `weightKg`) is missing from the legacy data structure, it is passed to the `value` property as `—`. The UI rendering layer will blindly render the string, maintaining the layout integrity without inventing new fields.
