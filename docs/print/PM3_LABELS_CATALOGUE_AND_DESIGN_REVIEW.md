# Onyx Labels Catalogue and Design Review

## Part A: Labels Catalogue

### 1. LabelWizard: ONYX_MASTER_TEMPLATE_V4 (Item Tag)
- **ID:** `lbl-item-template-v4`
- **Name:** Onyx Master Template V4
- **Where triggered:** `src/features/logistics/LabelWizard.tsx:379` (`LabelWizard` component).
- **Function and File:Line:** `ONYX_MASTER_TEMPLATE_V4` at `src/features/logistics/LabelWizard.tsx:624`.
- **Physical Size / Pixel Size:** Dynamically sizes based on UI selection (e.g., 50x30 mm). Handled as a JSON configuration targeting the 384 px print width (M110 printer).
- **Density and Speed:** Default driver settings (Speed 5, Density 10) set in `PhomemoM110.ts:70`.
- **Render Method:** JSON template payload sent via `postMessage` to an external iframe designer, which renders the canvas.
- **Printed Fields (in order):** 
  1. `AXO_IMAGE` (Axometric render)
  2. `QR DATA` (QR Code payload)
  3. `TAG ID` (CODE128 Barcode and text)
  4. `SIZES` (Dimensions + Weight)
  5. `BOOK RETAIL` (AqCode + LandCode)
  6. `COLOR MATERIAL`
  7. `DESCRIPTION`
- **Data Availability:** `AXO_IMAGE` is flagged as unavailable if the item lacks 3D data. `SIZES` defaults to 0 if length/width/weight are missing.
- **QR/Barcode Format:** CODE128 for the barcode (`TAG ID`), QR Code payload mapped to `QR DATA`.
- **Print Provenance:** Checksum generated deterministically via `computeJobChecksum` (`LabelWizard.tsx:461`). Provenance (including `print_job_checksum`, `print_job_id`, `printed_at`, `printed_by`, `label_size`) is written back to the Supabase `print_jobs` and `print_job_items` tables (`LabelWizard.tsx:503`). Item records are updated natively.
- **Reprint Behaviour:** Tracked via the `isReprint` boolean flag to differentiate new jobs from reprinted batches.

### 2. Packing Module Batch Label
- **ID:** `lbl-packing-batch`
- **Name:** Packing Batch Label
- **Where triggered:** `src/features/logistics/PackingModule.tsx:408`
- **Function and File:Line:** `buildBatchJSON` at `src/features/logistics/PackingModule.tsx:36`.
- **Physical Size:** Uses the `labelSize` React atom.
- **Render Method:** Exported as a batch project JSON and loaded via iframe.
- **Printed Fields:** `TAG ID`, `DESCRIPTION`, `SIZES`, `BOOK RETAIL`, `MATERIAL COLOR`. 
- **Data Availability:** Lacks `AXO_IMAGE` and `QR DATA` entirely compared to the V4 template. Multiplied by `QUANTITY`.

### 3. M110 Preview Labels
- **ID:** `lbl-preview-m110`
- **Name:** M110 Preview Label
- **Where triggered:** `src/components/PreviewLabels.tsx`
- **Function and File:Line:** Renders at `src/components/PreviewLabels.tsx:117` via `<div id="label-render-{globalIndex}">`.
- **Physical Size / Pixel Size:** 48 mm width (384 px) by 28.75 mm height (230 px). 
- **Render Method:** DOM-to-Canvas rasterization. Rendered directly via React nodes and HTML/CSS.
- **Printed Fields:** `MADE IN MEXICO` (rotated text), `AXO_IMAGE` (SVG overlay), QR Code (`TAG ID`), `TAG ID` (title), `SHORT DESCRIPTION` / `TYPE`, `MATERIAL`, `SIZES` & `WEIGHT`, Barcode (CODE128), and spaced `TAG ID` text.
- **Data Availability:** `axoSvg` conditionally fetched; falls back to empty. `shortDescription` falls back to `type`. Dimensions fallback to 0.

### 4. NFC Tag Card (Visuals)
- **ID:** `lbl-nfc-card`
- **Name:** NFC Tag Card Visual
- **Where triggered:** General visuals and wizard.
- **Function and File:Line:** `NFCTagCard` at `src/components/LabelVisuals.tsx:23`.
- **Physical Size / Pixel Size:** 400x250 px (web card aspect ratio).
- **Render Method:** React DOM.
- **Printed Fields:** `BOOK RETAIL`, `SHAPE` + `SHORT DESCRIPTION`, `COLOR` / `MATERIAL`, Dimensions, QR Code, CODE128 Barcode.

### 5. Crate Manifesto (PDF)
- **ID:** `lbl-crate-manifesto`
- **Name:** Crate Manifesto Box Label
- **Where triggered:** Export flow.
- **Function and File:Line:** `exportCrateManifesto` at `src/lib/crateManifesto.ts:251`.
- **Physical Size:** PDF document (A4 / Letter bounds).
- **Render Method:** jsPDF drawing API.
- **Printed Fields:** Truck stats, Item array, QR Codes for string data.

### Printer Driver: Phomemo M110 (`src/utils/PhomemoM110.ts`)
- **BLE Service UUID:** `0000ff00-0000-1000-8000-00805f9b34fb`
- **Characteristic UUIDs:** Write: `0000ff02-...`, Notify: `0000ff03-...`
- **Command Bytes:** 
  - INIT: `[0x1b, 0x40]`
  - SPEED: `[0x1b, 0x4e, 0x0d, speed]`
  - DENSITY: `[0x1b, 0x4e, 0x04, density]`
  - MEDIA_TYPE: `[0x1f, 0x11, type]`
  - RASTER_HEADER: `[0x1d, 0x76, 0x30, 0x00, widthBytes, 0x00, heightLinesLow, heightLinesHigh]`
  - FOOTER: `[0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00]`
- **Chunking:** Data sent in 128-byte chunks with 20ms delays.
- **Error Handling:** Attempts `writeValueWithoutResponse()`, with a `catch` fallback to `writeValue()`.
- **Reconnect:** The driver strictly relies on fresh connection initiation; no internal automatic reconnect mechanism exists.
- **Scalability:** Filters look for M110, M120, and Q (M110S). To support wider Phomemo models, `WIDTH_PIXELS` (384) and `WIDTH_BYTES` (48) must become configurable instance parameters rather than global constants.

---

## Part B: Apple Design Review

### M110 Preview Labels (`PreviewLabels.tsx`)
- **Score: 2 / 5 (Needs work)**
- **Hierarchy & Consistency:** The layout feels unanchored. Mixing rotated vertical text ("MADE IN MEXICO") alongside an axometric image and centered content creates visual competition.
- **Legibility (203 dpi):** *Critical failure.* Uses fractional metrics (`opacity-60`, `text-black/80`). The thermal driver thresholds pixels (`< 128 = black`). Semi-transparent styling will heavily dither or disappear completely. Furthermore, `9px` and `10px` text sizes equate to ~1.1mm (9 dots) on a 203 dpi printer. Due to thermal bleed, text this small will turn into illegible black blocks.
- **Contrast:** Violates the principle of 1-bit thermal contrast. Text colors must be absolute `#000000` or `#FFFFFF`.
- **QR Size & Quiet Zone:** A `48px` QR Code translates to ~6mm width on paper, heavily risking scanner failure. The layout does not programmatically protect a quiet zone around the QR.
- **Specific Defects:** 
  1. Fractional opacities (`text-black/60`) fail on 1-bit thresholding.
  2. Font sizes (9px, 10px) are below survivable minimums for thermal bleed.
  3. QR code is drastically undersized and lacks a strict 4-module quiet zone.
  4. Barcode `width={1.6}` causes sub-pixel aliasing on rasterization.

### NFC Tag Card (`LabelVisuals.tsx`)
- **Score: 2 / 5 (Needs work)**
- **Legibility & Contrast:** Relying on `codes.vendorColor` and `opacity-60` works strictly for screen interfaces. If printed, these properties threshold unpredictably based on luminance, potentially rendering as blank white zones. 
- **Specific Defects:**
  1. Conveys brand/hierarchy through color alone, which breaks on thermal media.
  2. Transparent backgrounds on the barcode invite artifacts.

### LabelWizard Template V4 (`LabelWizard.tsx`)
- **Score: 3 / 5 (Good, but fragile)**
- **Legibility:** Successfully maps larger text sizes (15pt, 23pt) which will render cleanly into dots.
- **Hierarchy:** Stronger spatial grouping.
- **Specific Defects:**
  1. Purely absolute `x/y` positioning (`x: 75.6, y: 49.8`) can cause catastrophic text collisions if item descriptions are unusually long.
  2. Depends on web fonts (`Inter, sans-serif`) rather than pixel-hinted mono fonts, risking inconsistent stroke widths on a low-dpi canvas.

---

## Part C: Unified Label Design System

To solve thermal printing constraints and cross-module drift, the app requires a strictly millimetre-and-dot based unified design system.

### Millimetre-Based Template Format
- **Label Size Presets:** Base units defined in dots (at 203 dpi, 8 dots = 1 mm). Standardize on `50x30 mm` (400x240 dots) or strictly hardware matched `48x28.75 mm` (384x230 dots for M110).
- **Safe Margins:** 2 mm (16 dots) clear zone on all edges to account for media feed drift.
- **Grid System:** 8-dot (1 mm) snapping grid. No floating-point coordinates.
- **Type Scale (203 dpi):**
  - *Utility / Metadata:* 16 dots (2 mm) - Absolute minimum legible height.
  - *Body / Subhead:* 24 dots (3 mm).
  - *Headline / Primary ID:* 32 dots (4 mm) or 40 dots (5 mm).
  - *Typeface:* A heavy geometric sans-serif or pixel-hinted monospaced font, forced to `#000000` with disabled anti-aliasing.
- **QR Block Spec:** 
  - Minimum scale of 16x16 mm (128x128 dots). 
  - A strict 4-module (approx 2 mm / 16 dot) quiet zone of pure white space enforced around the boundary.
- **Field-Slot Model:** Instead of absolute unconstrained coordinates, use defined bounding boxes. Text that exceeds boundaries must truncate with an ellipsis rather than overlapping neighboring elements.

### The Label-Template Contract
All label generators (LabelWizard, PackingModule, Previews) must supply exactly one standardized data shape, preventing missing fields (like `AXO_IMAGE` missing from PackingModule batches).

```typescript
interface UnifiedPrintLabel {
  tagId: string;           // Maps to TAG ID
  headline: string;        // Maps to BOOK RETAIL (e.g. ACQ-LandCode)
  title: string;           // Maps to SHORT DESCRIPTION / TYPE
  subtitle: string;        // Maps to COLOR / MATERIAL
  dimensions: string;      // Maps to SIZES (LxWxH CM, WT KG). Must fallback to '---' if 0.
  qrPayload: string;       // Maps to QR DATA (Guaranteed length constraints)
  barcodePayload: string;  // Maps to CODE128 data
  axoImage?: string;       // Flagged optional; conditionally rendered if available
}
```

### Output Bitmap & Pixel-Identical Preview
- **The Output:** The engine outputs a strictly 1-bit monochrome `<canvas>` matching the exact dot width of the printer (384px for M110).
- **The Preview:** The UI uses the *exact same rasterized canvas* the printer receives. CSS `image-rendering: pixelated;` is applied to scale the preview for high-DPI screens without blurring.
- **Strict 1-bit Policy:** No `opacity`, no colors, no semi-transparent backgrounds. Allowed values are strictly `#000000` and `#FFFFFF`. Stroke widths and lines must be integer multiples of 1 dot (~0.125 mm).
