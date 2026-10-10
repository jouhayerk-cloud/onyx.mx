import { tr } from '../../lib/i18n';
import type { DocumentKind } from './types';

export interface TemplateEntry {
    id: string;
    kind: DocumentKind;
    label: string;
    module: "inventory" | "logistics" | "packing" | "trucking" | "archive" | "store" | "catalog" | "finance" | "viewer";
    source: string;
    description: string;
    status: "legacy" | "tracked" | "hub";
}

export const TEMPLATE_CATALOGUE: TemplateEntry[] = [
    {
        id: "lbl-item-template-v4",
        kind: "label",
        label: tr("Master Item Template (V4)"),
        module: "logistics",
        source: "LabelWizard.tsx (ONYX_MASTER_TEMPLATE_V4)",
        description: tr("Legacy V4 master item label template"),
        status: "legacy"
    },
    {
        id: "fmt-inventory-selected-xlsx",
        kind: "xlsx",
        label: tr("Selected Inventory (XLSX)"),
        module: "inventory",
        source: "MainHeader.tsx (handleExportSelectedXLSX)",
        description: tr("XLSX export for selected inventory"),
        status: "legacy"
    },
    {
        id: "fmt-master-book-326-xlsx",
        kind: "xlsx",
        label: tr("Master Book 326 (XLSX)"),
        module: "inventory",
        source: "MainHeader.tsx (handleMasterExportXLSX)",
        description: tr("Legacy season 326 master workbook"),
        status: "legacy"
    },
    {
        id: "fmt-workbook-v2-xlsx",
        kind: "xlsx",
        label: tr("Master Workbook V2 (XLSX)"),
        module: "inventory",
        source: "MainHeader.tsx (handleMasterExportXLSX_V2)",
        description: tr("Current season master workbook"),
        status: "legacy"
    },
    {
        id: "fmt-shopify-matrixify-main-xlsx",
        kind: "xlsx",
        label: tr("Shopify Matrixify Main (XLSX)"),
        module: "inventory",
        source: "MainHeader.tsx (handleShopifyExportXLSX)",
        description: tr("Main Shopify import spreadsheet"),
        status: "legacy"
    },
    {
        id: "fmt-shopify-batch-wizard-xlsx",
        kind: "xlsx",
        label: tr("Shopify Batch Wizard (XLSX)"),
        module: "inventory",
        source: "BatchProcessingWizard.tsx (buildXlsx)",
        description: tr("Batch Shopify import spreadsheet"),
        status: "legacy"
    },
    {
        id: "fmt-trucking-manifesto-xlsx",
        kind: "xlsx",
        label: tr("Trucking Manifesto (XLSX)"),
        module: "trucking",
        source: "TruckingModule.tsx (generateManifesto)",
        description: tr("Consolidated trucking manifesto"),
        status: "legacy"
    },
    {
        id: "fmt-trucking-crates-spreadsheets-xlsx",
        kind: "xlsx",
        label: tr("Trucking Crates Spreadsheets (XLSX)"),
        module: "trucking",
        source: "TruckingModule.tsx (generatePacked)",
        description: tr("Spreadsheets for trucking crates"),
        status: "legacy"
    },
    {
        id: "fmt-trucking-trailer-packing-list-xlsx",
        kind: "xlsx",
        label: tr("Trailer Packing List (XLSX)"),
        module: "trucking",
        source: "TruckingModule.tsx (generatePackingListXlsx)",
        description: tr("Trailer packing list spreadsheet"),
        status: "legacy"
    },
    {
        id: "fmt-crates-wizard-packing-list-xlsx",
        kind: "xlsx",
        label: tr("Crates Wizard Packing List (XLSX)"),
        module: "trucking",
        source: "ExportCratesWizard.tsx (generatePackingListXlsx)",
        description: tr("Packing list for exported crates"),
        status: "legacy"
    },
    {
        id: "fmt-packing-printables-wizard-xlsx",
        kind: "xlsx",
        label: tr("Packing Printables Wizard (XLSX)"),
        module: "packing",
        source: "PackingModule.tsx (handleGenerateXLSX)",
        description: tr("Packing wizard printables"),
        status: "legacy"
    },
    {
        id: "fmt-label-wizard-xlsx",
        kind: "xlsx",
        label: tr("Label Wizard Sheet (XLSX)"),
        module: "logistics",
        source: "LabelWizard.tsx (handleGenerateXLSX)",
        description: tr("Spreadsheet generated next to the label print"),
        status: "tracked"
    },
    {
        id: "fmt-packing-raw-xml-xlsx",
        kind: "xlsx",
        label: tr("Packing Raw XML (XLSX)"),
        module: "packing",
        source: "PackingModule.tsx (handleExportXLSX)",
        description: tr("Legacy raw XML based export"),
        status: "legacy"
    },
    {
        id: "pdf-inventory-sheet",
        kind: "pdf",
        label: tr("Inventory Sheet (PDF)"),
        module: "catalog",
        source: "pdfExport.ts (drawCatalogHubPage)",
        description: tr("Catalog hub page PDF"),
        status: "legacy"
    },
    {
        id: "pdf-crate-manifesto",
        kind: "pdf",
        label: tr("Crate Manifesto (PDF)"),
        module: "trucking",
        source: "crateManifesto.ts (exportCrateManifesto)",
        description: tr("Manifesto PDF for a specific crate"),
        status: "legacy"
    },
    {
        id: "html-trailer-manifest",
        kind: "pdf",
        label: tr("Trailer Manifest (HTML/PDF)"),
        module: "trucking",
        source: "generatePackingListHtml.ts (generatePackingListHtml)",
        description: tr("Trailer manifest printed via HTML"),
        status: "legacy"
    },
    {
        id: "html-crates-manifest",
        kind: "pdf",
        label: tr("Crates Manifest (HTML/PDF)"),
        module: "trucking",
        source: "generateCratesListHtml.ts (generateCratesListHtml)",
        description: tr("Crates manifest printed via HTML"),
        status: "legacy"
    },
    {
        id: "pdf-viewer-export",
        kind: "pdf",
        label: tr("Viewer Export (PDF)"),
        module: "viewer",
        source: "ViewerView.tsx (ViewerView)",
        description: tr("Export generated from the 3D Viewer"),
        status: "legacy"
    },
    {
        id: "lbl-packing-batch",
        kind: "label",
        label: tr("Packing Batch Label"),
        module: "packing",
        source: "PackingModule.tsx (buildBatchJSON)",
        description: tr("Label for a packing batch"),
        status: "legacy"
    },
    {
        id: "lbl-preview-m110",
        kind: "label",
        label: tr("Preview Label M110"),
        module: "logistics",
        source: "PreviewLabels.tsx",
        description: tr("Preview labels for Phomemo M110"),
        status: "legacy"
    },
    {
        id: "lbl-nfc-card",
        kind: "label",
        label: tr("NFC Card Label"),
        module: "logistics",
        source: "LabelVisuals.tsx (NFCTagCard)",
        description: tr("Visual NFC tag label"),
        status: "legacy"
    },
    {
        id: "fmt-archive-season-825-csv",
        kind: "csv",
        label: tr("Archive Season 825 (CSV)"),
        module: "archive",
        source: "ArchivePanel.tsx (handleExportCSV)",
        description: tr("Archived season 825 data export"),
        status: "legacy"
    },
    {
        id: "fmt-vendor-batch-create-import-xlsx",
        kind: "xlsx",
        label: tr("Vendor Batch Import (XLSX)"),
        module: "inventory",
        source: "batchSheet.ts (parseSheet)",
        description: tr("Vendor batch import template"),
        status: "legacy"
    }
];

/** Looks up a template catalogue entry by its id, or undefined when there is none. */
export function getTemplate(id: string): TemplateEntry | undefined {
    return TEMPLATE_CATALOGUE.find(t => t.id === id);
}

export function listTemplatesByModule(): Record<string, TemplateEntry[]> {
    const res: Record<string, TemplateEntry[]> = {};
    for (const t of TEMPLATE_CATALOGUE) {
        if (!res[t.module]) {
            res[t.module] = [];
        }
        res[t.module].push(t);
    }
    return res;
}
