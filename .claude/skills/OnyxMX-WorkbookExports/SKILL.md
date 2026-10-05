---
name: OnyxMX-WorkbookExports
description: "Onyx.mx exports: Shopify/Matrixify XLSX, PDF catalogues, crate manifests, ExcelJS styling, workbook formats. Use when changing any export."
---

# OnyxMX Workbook & Exports Sub-Skill

> **Domain**: XLSX Generation, Shopify Export, PDF Catalogs, Shipping Documents  
> **Key Files**: `src/features/workbook/`, `src/lib/xlsxUtils.tsx`, `src/lib/excelStyles.ts`, `src/lib/pdfExport.ts`, `src/lib/crateManifesto.ts`, `src/features/inventory/BatchProcessingWizard.tsx`

---

## 1. Shopify XLSX Export (Matrixify Format)

### 1.1 Generation Function
`handleGenerateXLSX()` in [`BatchProcessingWizard.tsx`](file:///c:/Jouhayerk/git/app/src/features/inventory/BatchProcessingWizard.tsx)
Uses **ExcelJS** library to create Matrixify-compatible multi-image format Excel files.

### 1.2 Complete Column Mappings

| # | Shopify Column | Source Field | Transformation |
|---|---------------|-------------|----------------|
| 1 | **Handle** | `title` or `tagId` | Lowercase, spaces → hyphens |
| 2 | **Title** | `shape`, `shortDesc`, `color`, `material` | `${shape} ${shortDesc} ${color} ${material}` + optional `partSuffix` |
| 3 | **Body (HTML)** | `marketingDescription` | AI-generated HTML (`generated_description`) or fallback generated HTML |
| 4 | **Vendor** | `vendorName` | Direct mapping from vendor registry in `consts.tsx` |
| 5 | **Type** | `generatedType` | Via `getProductCategoryAndType()` |
| 6 | **Tags** | Multiple fields | Comma-separated: `tagId, color, formattedMaterial, shape, shortDesc, heightCm, widthCm` |
| 7 | **Published** | — | Default: `TRUE` |
| 8 | **Variant Position** | Sequential | Auto-assigned per product |
| 9 | **Variant SKU** | `tagId`, `vendorSku`, `costMxn` | Combined: `${tagId}-${vendorSku}${costMxn}` |
| 10 | **Variant Barcode** | `tagId` / `bookBarcode` | `printCode` or `bookBarcode` direct |
| 11 | **Variant Cost** | `bookLanded` | Landed cost USD (fallback calculation available) |
| 12 | **Variant Price** | `bookRetail` | Retail USD, or fallback: `(costMxn / activeRate) * 1.4 * 12` |
| 13 | **Variant Grams** | `weightKg` | `weightKg * 1000` (kg → grams) |
| 14 | **Variant Image** | `mediaUrls[0]` | First image assigned to variant |
| 15 | **Image Src** | `mediaUrls` | Multi-image matrix (see below) |
| 16 | **Image Position** | Sequential | 1, 2, 3... per product |

### 1.3 Multi-Image Matrix Logic (Matrixify)
```
Row 1 (product row):  Handle + all product data + "MERGE" command + Variant Image
Row 2 (image row):    Handle repeated + Image Src (2nd image) + Image Position: 2
Row 3 (image row):    Handle repeated + Image Src (3rd image) + Image Position: 3
...
```
- First image gets `MERGE` command and is assigned as `Variant Image`
- Subsequent images populate only `Image Src` and `Image Position`
- All rows share the same Handle to associate images with the product

### 1.4 Shopify Metafield Mappings

| Metafield Key | Value | Derivation Logic |
|--------------|-------|-----------------|
| `custom.polish_type` | String | Vendor prefix: `JM` → "Fully Polished", `TE/EM/ML` → "Partially Polished", else → "Matte" |
| `Measurements` | Formatted string | `D{depthIn}×W{widthIn}×H{heightIn}` (cm → inches conversion) |
| `custom.variety` | `"Mexican Onyx"` | Default constant |

---

## 2. PDF Catalog Generation

### 2.1 Engine
[`pdfExport.ts`](file:///c:/Jouhayerk/git/app/src/lib/pdfExport.ts) — 42KB, ~1004 lines  
Uses **jsPDF** with **jspdf-autotable** for dynamic catalog rendering.

### 2.2 Header Structure
Each product page includes:
- **QR Code**: Generated via `qrcode` library, encodes TagID/Barcode
- **Barcode**: Generated via `jsbarcode`, encoded as TagID
- **Item identifier text**: `bookBarcode`, `bookRetail`, `bookAqCode`, `bookLandCode`

### 2.3 Axonometric 3D Projection
- Function: `generateAxonometricDataUrl()`
- Renders a 3D bounding box representation of physical dimensions
- Used as overlay or fallback when product images are missing
- Drawn as JPEG data URL embedded in PDF

### 2.4 Dimensions Block
Imperial conversion display:
```
WIDTH:   wImp    HEIGHT: hImp
DEPTH:   dImp    WEIGHT: wtImp
OVERALL: ovImp (all dims joined with ' × ')
```
Uses `cmToImperial()`, `toImp()`, and `formatWeightImperialOnly()`

### 2.5 Layout Modes
- **Grid format**: Single item with multi-image gallery pages
- **Sequential catalog**: One product per page with header + full-bleed image
- **Marketing mode**: Includes AI marketing text injection below images

### 2.6 Branding
- Company logo injection: `RareEarth` or `ArtOfDecor`
- Logo assets stored as base64 in `src/lib/rareEarthLogo.ts` and `src/lib/artOfDecorLogo.ts`
- Header/footer with company branding

### 2.7 Image Handling
```typescript
const d = await loadImgData(imgUrl, 800, false, '#1C1C1E', 32);
// 800px max, dark background (#1C1C1E), 32px padding
drawContain(doc, d, x, y, width, height, 0.90);
// 90% fill ratio within allocated space
```

### 2.8 Output Options
- `output === 'blob'` → Returns PDF blob (for programmatic use)
- Default → `doc.save()` triggers browser download
- Filename: `${safeTitle}_${date}.pdf`

---

## 3. Crate Manifesto & Shipping Documents

### 3.1 Engine
[`crateManifesto.ts`](file:///c:/Jouhayerk/git/app/src/lib/crateManifesto.ts) — 49KB  
Generates shipping documentation in three formats.

### 3.2 XLSX Packing List
Generated by `exportToXLSX()` via `handleExportPackingList`

| Column | Description |
|--------|-------------|
| Crate ID | Container identifier |
| Vendor | Vendor origin(s) |
| Item ID | Individual item identifier |
| Shape | Physical shape |
| Dimensions | Formatted dimensions string |
| Weight | Item weight |
| Barcode | Item barcode |

### 3.3 Interactive HTML Manifest
- `generatePackingListHtml.ts`
- Embeds a **live Three.js script** directly in the HTML
- Creates an interactive 3D truck load simulation
- Can be sent to clients or customs as a standalone file
- Self-contained: all Three.js code inlined, no external dependencies

### 3.4 PDF Manifesto
Dense tabular format including:
- QR code → item mapping per crate
- Isometric container thumbnails (drawn procedurally)
- Shipment metadata:
  - Seal Number
  - Tractor Number
  - Trailer Plates
  - Vendor origins
  - Total weight/dimensions

---

## 4. Workbook Versioning & Import

### 4.1 WorkbookV2 (Book 326 — Active Format)
Managed by [`WorkbookLogView.tsx`](file:///c:/Jouhayerk/git/app/src/features/workbook/WorkbookLogView.tsx)

- Parses acquisitions and detailed expense groups:
  - `BOA` (Bank of America)
  - `BBVA RAMSES`
  - `BBVA MARTHA`
- Exchange rate location: `data[1][1]`
- Tabs: `inventory`, `finance`, `production`, `logistics`, `database`

### 4.2 Legacy Format (v825 — Archive)
- Basic sequential expense and account tracking
- Exchange rate location: `data[10][3]`
- Simpler read format

### 4.3 Upload Wizard
[`UploadWizard.tsx`](file:///c:/Jouhayerk/git/app/src/features/upload/UploadWizard.tsx)
- Allows toggling between v326 and v825 workbooks
- Handles XLSX file parsing and data extraction
- Maps spreadsheet columns to internal data model

---

## 5. ExcelJS Utilities

### 5.1 Style Configuration ([`excelStyles.ts`](file:///c:/Jouhayerk/git/app/src/lib/excelStyles.ts))
- Consistent font, color, and border definitions
- Header row styling (bold, colored backgrounds)
- Data cell formatting (number formats, alignment)

### 5.2 Utility Functions ([`xlsxUtils.tsx`](file:///c:/Jouhayerk/git/app/src/lib/xlsxUtils.tsx))
- Workbook creation helpers
- Column auto-width calculation
- Cell formatting utilities
- Sheet generation with typed column definitions

---

## 6. ExportWizard Component

[`ExportWizard.tsx`](file:///c:/Jouhayerk/git/app/src/components/ExportWizard.tsx)
- UI for generating tailored Excel/PDF catalogs on-the-fly
- Configuration options:
  - Export type (XLSX, PDF, Shopify)
  - Item selection/filtering
  - Branding choice (RareEarth, ArtOfDecor)
  - Layout preferences
  - Column visibility toggles

---

## 7. Common Modification Patterns

### Adding a New Shopify Column
1. Add column definition in `handleGenerateXLSX()` in `BatchProcessingWizard.tsx`
2. Map internal field name → Shopify column header
3. Add any data transformation logic
4. Test with Matrixify import validation

### Adding a New Metafield
1. Add metafield key to the XLSX generation logic
2. Define value derivation (constant, computed, or field-mapped)
3. Ensure namespace matches Shopify metafield definition

### Modifying PDF Catalog Layout
1. Edit [`pdfExport.ts`](file:///c:/Jouhayerk/git/app/src/lib/pdfExport.ts)
2. Adjust page dimensions, margins, font sizes
3. Modify `drawHeader()` for header changes
4. Update image placement logic in layout modes
5. Test with `output === 'blob'` for preview before download

### Adding a New Shipping Document Format
1. Add generator function to `crateManifesto.ts`
2. Define column/field mappings for new format
3. Wire up to `ExportCratesWizard.tsx` UI
4. Add format option to export dropdown
