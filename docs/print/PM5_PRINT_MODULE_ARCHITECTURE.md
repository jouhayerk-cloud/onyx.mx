# PM5: Centralized Print Module Architecture

**Document Date:** 2026-10-04
**Domain:** `src/features/print`

This document synthesizes the research from the XLSX, PDF, Label, and Tracking audits (PM1–PM4) into a unified architecture for the centralized Print Module. 

---

## 1. Goals and Non-Goals

### Goals
*   **Unification:** Consolidate all spreadsheet, PDF, and label generation under a single architectural roof (`src/features/print`) using shared, print-optimized design systems.
*   **Deterministic Tracking:** Introduce a robust, reproducible job ledger (`document_jobs.ts`) featuring `dj1` canonical hashing and complete lifecycle tracking (requested, rendered, printed).
*   **Island Integration:** Surface print capabilities, queue management, and printer statuses natively within the Onyx Island command surface.
*   **Print-First Design:** Enforce strict typographic scales (10pt minimum for PDFs), 1-bit thermal contrast limits for labels, and unified workbook theming.

### Non-Goals
*   **No Data Schema Changes:** Every document will maintain exactly today's data fields and outputs. The module only alters presentation, generation structure, and tracking metadata.
*   **No Feature Deprecation:** Existing flows must continue to work during the migration. Adapters will dual-write to legacy tables.
*   **No Business Logic Changes:** The rules deciding *which* items go into a shipment or *how* prices are calculated remain untouched.

---

## 2. Module Layout

The Print Module is encapsulated under `src/features/print`, interacting with core utilities in `src/lib`.

```text
src/
  features/
    print/
      registry.ts               // Tool descriptors for Onyx Island (ToolDescriptor, useRegisterTools)
      PrintCenter.tsx           // Full Print Center view (History, Reprints, Verification)
      PrintCenterIsland.tsx     // Compact Island launchers (Queue, Printer Status)
      renderers/
        xlsxRenderer.ts         // ExcelJS engine utilizing ONYX_WORKBOOK_THEME
        pdfRenderer.ts          // jsPDF engine utilizing unified PDF constraints
        labelRenderer.ts        // 1-bit canvas engine for Phomemo/Thermal printing
      design/
        xlsxDesignSystem.ts     // Unified colors, fonts, alignments for workbooks
        pdfDesignSystem.ts      // A4/Letter presets, min 10pt scale, greyscale tokens
        labelDesignSystem.ts    // 8-dot grid, strict #000000/#FFFFFF monochrome rules
      services/
        phomemoDriver.ts        // Wrapped Phomemo M110 BLE driver with auto-chunking
  lib/
    documentJobs.ts             // Shared job service, dj1 checksum generation
```

---

## 3. DocumentType Contract

All documents must adhere to a strict TypeScript contract that decouples data gathering from rendering and hashing.

```typescript
// src/features/print/types.ts
import { tr } from '../../lib/i18n';

export type DocumentKind = 'xlsx' | 'pdf' | 'label' | 'csv';

export interface DocumentType<TSource, TSnapshot> {
  id: string;
  kind: DocumentKind;
  label: () => string; // E.g., () => tr("Trailer Manifesto")
  seasonScoping: 'strict' | 'mixed' | 'none';
  permissions: string[]; // Allowed roles: e.g. ['Admin', 'Logistics']
  
  // Extracts only the required fields from the raw source
  requiredData: (source: TSource) => TSnapshot;
  
  // Builds a strictly ordered, canonical JSON payload for dj1 hashing
  buildSnapshot: (data: TSnapshot) => unknown;
  
  // Renders the document into bytes (PDF/XLSX) or 1-bit Canvas (Label)
  render: (data: TSnapshot) => Promise<Uint8Array | Blob | HTMLCanvasElement>;
  
  defaultFileName: (data: TSnapshot) => string;
}
```

### Document Type Catalogue Mapping

| Document ID | Kind | Label / Purpose | Current Source File & Line |
| :--- | :--- | :--- | :--- |
| `fmt-inventory-selected-xlsx` | `xlsx` | Selected Items Export | `src/features/core/MainHeader.tsx:1433` |
| `fmt-master-book-326-xlsx` | `xlsx` | Master Season Book 326 | `src/features/core/MainHeader.tsx:1621` |
| `fmt-workbook-v2-xlsx` | `xlsx` | Workbook V2 (Rare Earth) | `src/features/core/MainHeader.tsx:2724` |
| `fmt-shopify-matrixify-main-xlsx` | `xlsx` | Shopify Matrixify Export | `src/features/core/MainHeader.tsx:3534` |
| `fmt-shopify-batch-wizard-xlsx` | `xlsx` | Shopify Batch Wizard | `src/features/inventory/BatchProcessingWizard.tsx:440` |
| `fmt-trucking-manifesto-xlsx` | `xlsx` | Consolidated Manifesto | `src/features/logistics/TruckingModule.tsx:1934` |
| `fmt-trucking-crates-spreadsheets-xlsx` | `xlsx` | Crate Spreadsheets | `src/features/logistics/TruckingModule.tsx:2153` |
| `fmt-trucking-trailer-packing-list-xlsx` | `xlsx` | Trailer Packing List | `src/features/logistics/TruckingModule.tsx:2667` |
| `fmt-crates-wizard-packing-list-xlsx` | `xlsx` | Crates Packing List | `src/features/logistics/ExportCratesWizard.tsx:110` |
| `fmt-packing-printables-wizard-xlsx` | `xlsx` | Legacy Inventory XLSX | `src/features/logistics/PackingModule.tsx:174` |
| `fmt-packing-raw-xml-xlsx` | `xlsx` | Fast Direct OpenXML | `src/features/logistics/PackingModule.tsx:569` |
| `fmt-vendor-batch-create-import-xlsx` | `xlsx` | Vendor Batch Import | `src/features/upload/batchSheet.ts:163` |
| `fmt-archive-season-825-csv` | `csv` | Archive 825 Inventory | `src/features/archive/ArchivePanel.tsx:62` |
| `pdf-inventory-sheet` | `pdf` | Catalog / Tag Sheet | `src/lib/pdfExport.ts:323` |
| `pdf-crate-manifesto` | `pdf` | Logistics Crate Manifesto | `src/lib/crateManifesto.ts:235` |
| `html-trailer-manifest` | `pdf` | Trailer Packing List (HTML -> PDF)| `src/features/logistics/generatePackingListHtml.ts:3` |
| `html-crates-manifest` | `pdf` | Crates Manifest (HTML -> PDF) | `src/features/logistics/generateCratesListHtml.ts:3` |
| `pdf-viewer-export` | `pdf` | 3D Viewer PDF Export | `src/features/viewer/ViewerView.tsx:25` |
| `lbl-item-template-v4` | `label` | Master Template V4 | `src/features/logistics/LabelWizard.tsx:624` |
| `lbl-packing-batch` | `label` | Packing Batch Label | `src/features/logistics/PackingModule.tsx:36` |
| `lbl-preview-m110` | `label` | Preview Label | `src/components/PreviewLabels.tsx:117` |
| `lbl-nfc-card` | `label` | NFC Tag Card | `src/components/LabelVisuals.tsx:23` |

---

## 4. Job Lifecycle & Call Site Migration

### Job Lifecycle (Ledger)
1.  **Requested:** User initiates an export/print. An idempotent Job ID is generated.
2.  **Rendered:** Data is canonicalized, `dj1` hashed (`data_hash`), and passed to the renderer. Output bytes are hashed (`output_sha256`).
3.  **Printed / Downloaded:** The blob is downloaded by the browser, or the 1-bit canvas is flushed to the Phomemo printer. Ledger records completion.
4.  **Voided / Reprinted:** Historic jobs can be reprinted natively (spawning a new job linked via `parent_job_id`).

### Call Site Migration Table

Migration happens iteratively. Adapters are built first to wrap existing generators and dual-write to both `document_jobs` and legacy tables (`print_jobs`, `logistics`), ensuring uninterrupted operation.

| Call Site | Document Type | What Changes | Risk |
| :--- | :--- | :--- | :--- |
| `MainHeader.tsx:1433` | `fmt-inventory-selected-xlsx` | Replaced by `xlsxRenderer`; records to `documentJobs.ts`. | Low |
| `MainHeader.tsx:1621` & `2724`| `fmt-master-book-326-xlsx`, `fmt-workbook-v2-xlsx` | Ported to unified XLSX builder. Replaces legacy styles. | Medium (Complex nested loops) |
| `MainHeader.tsx:3534` | `fmt-shopify-matrixify-main-xlsx` | Becomes the central Shopify standard. Dual-writes ledger. | Low |
| `BatchProcessingWizard.tsx:440`| `fmt-shopify-batch-wizard-xlsx` | **Deprecate.** Point this UI to the centralized Matrixify standard. | Low (Removes duplicate logic) |
| `TruckingModule.tsx:1934`, `2153`, `2667` | `fmt-trucking-*-xlsx` | Consolidate crate and trailer packing lists into a parameterized template. | Medium (Customs impact) |
| `PackingModule.tsx:174`, `569` | `fmt-packing-printables-wizard-xlsx`, `fmt-packing-raw-xml-xlsx` | **Deprecate `xlsxUtils.tsx` direct XML.** Route all through ExcelJS renderer. | High (Workshop reliance) |
| `pdfExport.ts:323`, `704` | `pdf-inventory-sheet` | Enforce 10pt minimum font sizes and unified margins. | Low |
| `generatePackingListHtml.ts:3` | `html-trailer-manifest` | Convert from HTML window printing to strict `pdfRenderer`. Fix 6pt microscopic text. | High (Browser print dependency) |
| `LabelWizard.tsx:379` | `lbl-item-template-v4` | Wrap in `jobService.ts`. Dual-write to `document_jobs` and `print_jobs`. Replace web fonts with pixel-hinted mono. | High (Thermal driver sensitivity) |
| `PackingModule.tsx:36` | `lbl-packing-batch` | Route through unified `labelRenderer` instead of secondary iframe logic. | Medium |

---

## 5. Print Center & Island Integration

The Print Module exposes its UI natively via the **Onyx Island** and a dedicated view.

### Onyx Island (`PrintCenterIsland.tsx`)
*   **Registry:** Implements `ToolDescriptor` and registers via `useRegisterTools` into `allToolsAtom`.
*   **Expanded View (Cmd+K):** Lists full actions (e.g., "Open Print Center", "Verify Document").
*   **Compact View (Pinned):** When a Phomemo printer is connected, a persistent pill appears beside the Island face showing battery status and active job progress.

### Print Center View (`PrintCenter.tsx`)
*   **Queue:** Lists pending jobs waiting for printer connectivity.
*   **History:** Displays generated documents (filtered by Season, defaulting to 826). Shows `data_hash`, status, user, and allows one-click downloading or reprinting (which sets `parent_job_id`).
*   **Printer Status:** A dedicated pane managing the `phomemoDriver.ts` WebBluetooth connection.
*   **Verification:** A drag-and-drop zone where users can drop an XLSX/PDF to verify its `output_sha256` or input its `dj1` hash to ensure data integrity against the ledger.
*   **Roles:** Accessible by Admin, Developer, Logistics. Data is scoped by the user's role (e.g., vendors only see their own job history via RLS and local filtering).

---

## 6. Testing and Verification Plan

1.  **Golden Files (XLSX/PDF):** Every `DocumentType` implementation must have a Jest snapshot test that processes a standard mock `TSource`, generates the file, and asserts the structure (e.g., column counts, worksheet names) against a known good "golden" output.
2.  **Pixel Diffing (Labels):** Label outputs are strictly 1-bit (`#000000` / `#FFFFFF`). Tests will render labels to a virtual canvas and execute a strict pixel-by-pixel comparison against golden bitmaps to prevent font-rendering regressions and thermal drift.
3.  **Checksum Determinism (dj1):** 
    *   Test: Run identical data payloads through `buildSnapshot` on different simulated dates. Assert `data_hash` is strictly identical.
    *   Test: Alter one field (e.g., `quantity`) and assert the hash changes completely.
    *   Test: Include undefined, null, and empty string properties to ensure canonicalization strips/normalizes them properly.

---

## 7. Implementation Backlog for AI Agents

| Task | Description | Safe to Parallelize? | Dependencies |
| :--- | :--- | :--- | :--- |
| 1 | Initialize `src/features/print` layout, `DocumentType` types, and registry. | Yes | None |
| 2 | Implement `dj1` snapshot canonicalization and SHA-256 hashing in `documentJobs.ts`. | Yes | Task 1 |
| 3 | Create `jobService.ts` for lifecycle management, local outbox, and dual-writing. | No | Task 2 |
| 4 | Implement `xlsxDesignSystem.ts` and `xlsxRenderer.ts`. | Yes | Task 1 |
| 5 | Migrate `fmt-workbook-v2-xlsx` to new renderer and ledger. | No | Tasks 3, 4 |
| 6 | Migrate `fmt-shopify-matrixify-main-xlsx` and deprecate Batch Wizard XLSX. | No | Tasks 3, 4 |
| 7 | Implement `pdfDesignSystem.ts` (10pt rules) and `pdfRenderer.ts`. | Yes | Task 1 |
| 8 | Port `html-trailer-manifest` from HTML print to strict `pdfRenderer`. | No | Task 7 |
| 9 | Implement `labelDesignSystem.ts` (1-bit, 8-dot) and `labelRenderer.ts`. | Yes | Task 1 |
| 10 | Refactor LabelWizard (v4) to use unified label renderer and dual-write jobs. | No | Tasks 3, 9 |
| 11 | Refactor PackingModule batch labels to use central renderer. | No | Tasks 3, 9 |
| 12 | Port `PhomemoM110.ts` to `services/phomemoDriver.ts` with auto-chunking. | Yes | None |
| 13 | Build `PrintCenterIsland.tsx` and integrate into `registry.ts`. | Yes | Task 1 |
| 14 | Build `PrintCenter.tsx` Full View (Queue, History with 826 checksums, Reprint). | No | Task 3 |
| 15 | Build Document Verification drag-and-drop tab in Print Center. | No | Tasks 2, 14 |
| 16 | Write golden file tests, pixel-diff routines, and checksum determinism tests. | Yes | Tasks 2, 4, 7, 9 |

---

## 8. Open Questions & Recommendations

1.  **Phomemo Reconnections:** The current WebBluetooth driver does not auto-reconnect reliably.
    *   *Recommended Default:* Surface a manual "Reconnect Printer" prompt in the Onyx Island compact view when a job is queued and connection is lost, rather than implementing aggressive background polling.
2.  **Legacy Checksums (`print_jobs`):** Existing checksums were generated with raw `JSON.stringify` including timestamps, making them unverifiable in retrospect.
    *   *Recommended Default:* Backfill legacy jobs with `hash_version = 0`. The verification UI should explicitly mark these as "Historical / Unverifiable" rather than "Mismatch".
3.  **Shipment Payload Malleability:** `shipments.payload` is an unstructured JSON blob, creating risks for canonical hashing.
    *   *Recommended Default:* Enforce a strict Zod schema parse before feeding shipment data into the `buildSnapshot` function for Season 826 onwards.
4.  **Role Permeability on Print History:** If vendors have access to the Print Center, they must not see Master Workbooks containing acquisition costs.
    *   *Recommended Default:* Apply strict RLS policies on `document_jobs` based on `created_by` and roles. The client UI should filter the History view by the user's allowed `permissions` array defined in the `DocumentType` contract.
