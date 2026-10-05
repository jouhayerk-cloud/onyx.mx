// Data derived from docs/print/PM1_XLSX_CATALOGUE.md

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
    numberFormats: {
        mxn: '#,##0',
        usd: '#,##0.00',
        percent: '0.00%', // UNKNOWN exact format from docs, inferred standard
        weightMetric: '#,##0.00', // kg
        weightImperial: '#,##0.00', // lb. UNKNOWN decimal places from docs, assumed 2
        dimensions: '@', 
        date: 'yyyy-mm-dd', // UNKNOWN standard format from docs, assumed standard ISO
    }
} as const;

export interface XlsxFont { name?: string; size?: number; bold?: boolean; italic?: boolean; color?: { argb: string }; }
export interface XlsxFill { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string }; }
export interface XlsxBorder { style: 'thin' | 'medium'; color: { argb: string }; }
export interface XlsxBorders { top?: XlsxBorder; bottom?: XlsxBorder; left?: XlsxBorder; right?: XlsxBorder; }
export interface XlsxAlignment { vertical?: 'top' | 'middle' | 'bottom'; horizontal?: 'left' | 'center' | 'right'; wrapText?: boolean; }

export interface XlsxStylePreset {
    font?: XlsxFont;
    fill?: XlsxFill;
    border?: XlsxBorders;
    alignment?: XlsxAlignment;
    numFmt?: string;
}

export const STYLE_PRESETS: Record<string, XlsxStylePreset> = {
    headerPrimary: {
        font: ONYX_WORKBOOK_THEME.fonts.header,
        fill: ONYX_WORKBOOK_THEME.fills.headerPrimary,
        border: ONYX_WORKBOOK_THEME.borders.headerBottom,
        alignment: ONYX_WORKBOOK_THEME.alignments.header,
    },
    headerAccent: {
        font: ONYX_WORKBOOK_THEME.fonts.header,
        fill: ONYX_WORKBOOK_THEME.fills.headerAccent,
        border: ONYX_WORKBOOK_THEME.borders.headerBottom,
        alignment: ONYX_WORKBOOK_THEME.alignments.header,
    },
    headerOrange: {
        font: ONYX_WORKBOOK_THEME.fonts.header,
        fill: ONYX_WORKBOOK_THEME.fills.headerOrange,
        border: ONYX_WORKBOOK_THEME.borders.headerBottom,
        alignment: ONYX_WORKBOOK_THEME.alignments.header,
    },
    headerEmerald: {
        font: ONYX_WORKBOOK_THEME.fonts.header,
        fill: ONYX_WORKBOOK_THEME.fills.headerEmerald,
        border: ONYX_WORKBOOK_THEME.borders.headerBottom,
        alignment: ONYX_WORKBOOK_THEME.alignments.header,
    },
    bodyCell: {
        font: ONYX_WORKBOOK_THEME.fonts.body,
        alignment: ONYX_WORKBOOK_THEME.alignments.left,
    },
    zebraCell: {
        font: ONYX_WORKBOOK_THEME.fonts.body,
        fill: ONYX_WORKBOOK_THEME.fills.zebra,
        alignment: ONYX_WORKBOOK_THEME.alignments.left,
    }
};

export function sanitizeSheetName(name: string): string {
    // Max 31 chars, forbidden: [] * ? / \ :
    return name.replace(/[\[\]*?\/\\:]/g, '').trim().substring(0, 31);
}

export const PRINT_SETUP = {
    landscapeFitToWidth: {
        orientation: 'landscape' as const,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '1:1', // Repeat header row
    },
    portraitFitToWidth: {
        orientation: 'portrait' as const,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '1:1',
    }
};

export const FREEZE_PANES = {
    headerRow: { state: 'frozen' as const, ySplit: 1 },
    vendorBannerV2: { state: 'frozen' as const, ySplit: 5 },
};

export interface XlsxColumnDef {
    header: string;
    key: string;
    width: number;
    numFmt?: string;
}

export const FMT_INVENTORY_SELECTED_COLS: XlsxColumnDef[] = [
    { header: 'VENDOR', key: 'vendor', width: 15 },
    { header: '#', key: 'itemNumber', width: 8 },
    { header: 'PAY DATE', key: 'payDate', width: 12 },
    { header: 'BOOK BARCODE', key: 'bookBarcode', width: 22 },
    { header: 'AQ CODE', key: 'aqCode', width: 12 },
    { header: 'LD CODE', key: 'ldCode', width: 12 },
    { header: 'DESCRIPTION', key: 'description', width: 45 },
    { header: 'COLOR + MATERIAL', key: 'colorMaterial', width: 35 },
    { header: 'SIZES (CM)', key: 'sizesCm', width: 20 },
    { header: 'SIZES (IN)', key: 'sizesIn', width: 20 },
    { header: 'WEIGHT (KG)', key: 'weightKg', width: 15 },
    { header: 'WEIGHT (LB)', key: 'weightLb', width: 15 },
    { header: 'QTY', key: 'qty', width: 8 },
    { header: 'ACQ COST $ (MXN)', key: 'acqCostMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'ACQ $ (USD)', key: 'acqCostUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'TOTAL MXN', key: 'totalMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'LANDED $ (MXN)', key: 'landedMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'LD $ (USD)', key: 'landedUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'RETAIL $ (USD)', key: 'retailUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'PAY STATUS', key: 'payStatus', width: 18 },
];

export const FMT_MASTER_326_SUMMARY_COLS: XlsxColumnDef[] = [
    { header: 'VENDOR / SECTION', key: 'entity', width: 30 },
    { header: 'INV ITEMS (ACQ/PROD)', key: 'items', width: 22 },
    { header: 'TOTAL SPEND (MXN)', key: 'spendMxn', width: 22, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'SPEND (USD - Inet Rate)', key: 'spendUsd', width: 25, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'PAID (MXN)', key: 'paidMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'PENDING (MXN)', key: 'pendingMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
];

export const FMT_MASTER_326_FINANCE_COLS: XlsxColumnDef[] = [
    { header: 'DATE', key: 'date', width: 12 },
    { header: 'DESCRIPTION', key: 'description', width: 35 },
    { header: 'CATEGORY', key: 'category', width: 15 },
    { header: 'VENDOR', key: 'vendor', width: 10 },
    { header: 'DESTINATION', key: 'destination', width: 18 },
    { header: 'AMOUNT (MXN)', key: 'amount', width: 15, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'FEES (MXN)', key: 'fees', width: 15, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'TOTAL (MXN)', key: 'total', width: 15, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'STATUS', key: 'status', width: 12 },
    { header: 'PAY DATE', key: 'payDate', width: 12 },
    { header: 'REFERENCE', key: 'reference', width: 20 },
];

export const FMT_MASTER_326_CRATES_COLS: XlsxColumnDef[] = [
    { header: 'ID', key: 'id', width: 22 },
    { header: 'TYPE', key: 'type', width: 14 },
    { header: 'DIMENSIONS (WxLxH)', key: 'dimensions', width: 28 },
    { header: 'WEIGHT (KG)', key: 'weight', width: 15, numFmt: ONYX_WORKBOOK_THEME.numberFormats.weightMetric },
    { header: 'SUPPLIER', key: 'supplier', width: 18 },
    { header: 'PRICE (MXN)', key: 'price', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'CONTENTS SUMMARY', key: 'contents', width: 60 },
    { header: 'TRK', key: 'trk', width: 18 },
    { header: 'STATUS', key: 'status', width: 15 },
];

export const FMT_MASTER_326_TRK_COLS: XlsxColumnDef[] = [
    { header: 'PAY DATE', key: 'payDate', width: 12 },
    { header: 'BOOK BARCODE', key: 'bookBarcode', width: 22 },
    { header: 'AQ CODE', key: 'aqCode', width: 12 },
    { header: 'LD CODE', key: 'ldCode', width: 12 },
    { header: 'DESCRIPTION', key: 'description', width: 45 },
    { header: 'COLOR + MATERIAL', key: 'colorMaterial', width: 35 },
    { header: 'SIZES (CM)', key: 'sizesCm', width: 20 },
    { header: 'SIZES (IN)', key: 'sizesIn', width: 20 },
    { header: 'WEIGHT (KG)', key: 'weightKg', width: 15 },
    { header: 'WEIGHT (LB)', key: 'weightLb', width: 15 },
    { header: 'QTY', key: 'qty', width: 8 },
    { header: 'QTY TRK', key: 'qtyTrk', width: 10 },
    { header: 'ACQ COST $ (MXN)', key: 'acqCostMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'ACQ $ (USD)', key: 'acqCostUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'T SHIPPED MXN', key: 'tShippedMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'LANDED $ (MXN)', key: 'landedMxn', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'LD $ (USD)', key: 'landedUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'RETAIL $ (USD)', key: 'retailUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'PAY STATUS', key: 'payStatus', width: 18 },
];

export const FMT_WORKBOOK_V2_COLS: XlsxColumnDef[] = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Shape Type', key: 'shapeType', width: 20 },
    { header: 'Colo Material', key: 'colorMaterial', width: 20 },
    { header: 'Tag - ID with LC', key: 'tagId', width: 22 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Weight', key: 'weight', width: 10 },
    { header: 'H Cm', key: 'hCm', width: 12 },
    { header: 'W cm', key: 'wCm', width: 12 },
    { header: 'D cm', key: 'dCm', width: 12 },
    { header: 'Pounds', key: 'pounds', width: 10 },
    { header: 'L inch', key: 'lInch', width: 12 },
    { header: 'W Inch', key: 'wInch', width: 12 },
    { header: 'D Inch', key: 'dInch', width: 12 },
    { header: 'Per Piece Pesos', key: 'perPiecePesos', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'Total in Pesos', key: 'totalPesos', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.mxn },
    { header: 'Per Piece US$', key: 'perPieceUsd', width: 18, numFmt: ONYX_WORKBOOK_THEME.numberFormats.usd },
    { header: 'Total in US$ Dollars', key: 'totalUsd', width: 20, numFmt: ONYX_WORKBOOK_THEME.numberFormats.usd },
    { header: 'ACQ Code', key: 'acqCode', width: 12 },
    { header: 'LND Code', key: 'lndCode', width: 12 },
    { header: 'RETAIL', key: 'retail', width: 15, numFmt: ONYX_WORKBOOK_THEME.numberFormats.usd },
    { header: 'TRK', key: 'trk', width: 15 },
    // dynamic image columns appended afterwards with width 15
];

export const FMT_SHOPIFY_MATRIXIFY_MAIN_COLS: XlsxColumnDef[] = [
    { header: 'Handle', key: 'handle', width: 20 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Body HTML', key: 'bodyHtml', width: 40 },
    { header: 'Vendor', key: 'vendor', width: 15 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Option1 Name', key: 'option1Name', width: 15 },
    { header: 'Option1 Value', key: 'option1Value', width: 15 },
    { header: 'Variant Position', key: 'variantPosition', width: 15 },
    { header: 'Variant SKU', key: 'variantSku', width: 22 },
    { header: 'Variant Barcode', key: 'variantBarcode', width: 22 },
    { header: 'Variant Cost', key: 'variantCost', width: 15 },
    { header: 'Variant Price', key: 'variantPrice', width: 15 },
    { header: 'Variant Grams', key: 'variantGrams', width: 15 },
    { header: 'Image Src', key: 'imageSrc', width: 40 },
    { header: 'Image Command', key: 'imageCommand', width: 15 },
    { header: 'Image Position', key: 'imagePosition', width: 15 },
    { header: 'Variant Image', key: 'variantImage', width: 40 },
    { header: 'Metafield: custom.product_weight [single_line_text_field]', key: 'metaProductWeight', width: 25 },
    { header: 'Variant Metafield: Vendor_SKU', key: 'metaVendorSku', width: 25 },
    { header: 'Variant Weight Unit', key: 'metaWeightUnit', width: 15 },
    { header: 'Variant Metafield: reg.variant_depth', key: 'metaVariantDepth', width: 25 },
    { header: 'Variant Metafield: reg.variant_width', key: 'metaVariantWidth', width: 25 },
    { header: 'Variant Metafield: reg.variant_height', key: 'metaVariantHeight', width: 25 },
    { header: 'Variant Metafield: reg.variant_measurements', key: 'metaVariantMeasurements', width: 25 },
    { header: 'Metafield: Measurements', key: 'metaMeasurements', width: 25 },
    { header: 'Metafield: shopify.material [list.metaobject_reference]', key: 'metaMaterial', width: 25 },
    { header: 'Metafield: custom.variety [list.single_line_text_field]', key: 'metaVariety', width: 25 },
    { header: 'Variant Country of Origin', key: 'variantCountryOfOrigin', width: 25 },
    { header: 'Tags', key: 'tags', width: 30 },
    { header: 'Product Category', key: 'productCategory', width: 25 },
    { header: 'Metafield: shopify.color-pattern [list.metaobject_reference]', key: 'metaColorPattern', width: 35 },
    { header: 'Metafield: custom.polish_type [list.single_line_text_field]', key: 'metaPolishType', width: 30 },
    { header: 'Metafield: custom.cut_type [list.single_line_text_field]', key: 'metaCutType', width: 30 },
    { header: 'Metafield: shopify.age-group [list.metaobject_reference]', key: 'metaAgeGroup', width: 25 },
    { header: 'Metafield: shopify.target-gender [list.metaobject_reference]', key: 'metaTargetGender', width: 25 },
    { header: 'Variant Metafield: mm-google-shopping.custom_label_1', key: 'metaCustomLabel1', width: 35 },
    { header: 'Metafield: reg.designer', key: 'metaDesigner', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Published', key: 'published', width: 15 },
    { header: 'Published Scope', key: 'publishedScope', width: 15 },
    { header: 'Variant Taxable', key: 'variantTaxable', width: 15 },
    { header: 'Variant Inventory Tracker', key: 'variantInventoryTracker', width: 25 },
    { header: 'Variant Inventory Policy', key: 'variantInventoryPolicy', width: 25 },
    { header: 'Variant Fulfillment Service', key: 'variantFulfillmentService', width: 25 },
    { header: 'Variant Requires Shipping', key: 'variantRequiresShipping', width: 25 },
    { header: 'Included / Art Of Decor', key: 'includedArtOfDecor', width: 20 },
    { header: 'Included / Trade Partners - Fountains', key: 'includedFountains', width: 30 },
    { header: 'Included / Trade Partners - Pendant Lights', key: 'includedPendantLights', width: 30 },
    { header: 'Inventory Available: Art Of Decor', key: 'inventoryAvailable', width: 30 },
];

export const FMT_TRUCKING_MANIFESTO_COLS: XlsxColumnDef[] = [
    { header: 'Book TAG ID', key: 'bookTagId', width: 20 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Weight (KG)', key: 'weightKg', width: 15 },
    { header: 'Dimensions (CM)', key: 'dimensionsCm', width: 20 },
    { header: 'Acq. Cost MXN', key: 'acqCostMxn', width: 20 },
];

export const FMT_TRUCKING_CRATES_SPREADSHEETS_COLS: XlsxColumnDef[] = [
    { header: 'Book TAG ID', key: 'bookTagId', width: 20 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Weight (KG)', key: 'weightKg', width: 15 },
    { header: 'Dimensions (CM)', key: 'dimensionsCm', width: 20 },
    { header: 'Container', key: 'container', width: 25 },
];

export const FMT_TRAILER_PACKING_LIST_COLS: XlsxColumnDef[] = [
    { header: 'Crate / Unit', key: 'crate', width: 25 },
    { header: 'Book TAG ID', key: 'tag', width: 22 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Description', key: 'desc', width: 50 },
    { header: 'Dimensions (CM)', key: 'dims', width: 22 },
    { header: 'Weight (KG)', key: 'weight', width: 12 },
    { header: 'Sub-Container', key: 'box', width: 25 },
];

export const FMT_PACKING_PRINTABLES_WIZARD_COLS: XlsxColumnDef[] = [
    { header: 'TAGID', key: 'tagId', width: 22 },
    { header: 'DESCRIPTION', key: 'description', width: 22 },
    { header: 'MATERIAL COLOR', key: 'materialColor', width: 22 },
    { header: 'SIZES', key: 'sizes', width: 22 },
    { header: 'QUANTITY', key: 'quantity', width: 22 },
    { header: 'LANDED CODE', key: 'landedCode', width: 22 },
    { header: 'ACQ CODE', key: 'acqCode', width: 22 },
    { header: 'BOOK RETAIL', key: 'bookRetail', width: 22 },
    { header: 'QR URL', key: 'qrUrl', width: 22 },
];

export const FMT_ARCHIVE_SEASON_825_BASE_COLS: XlsxColumnDef[] = [
    { header: 'VND', key: 'vnd', width: 10 },
    { header: 'TAG ID', key: 'tagId', width: 22 },
    { header: 'Item Number', key: 'itemNumber', width: 15 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Description', key: 'description', width: 45 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Wt.', key: 'wt', width: 10 },
    { header: 'Dimensions', key: 'dimensions', width: 20 },
];

export const FMT_ARCHIVE_SEASON_825_FINANCE_COLS: XlsxColumnDef[] = [
    { header: 'Price MXN', key: 'priceMxn', width: 15 },
    { header: 'Total Pesos', key: 'totalPesos', width: 15 },
    { header: 'AQ', key: 'aq', width: 15 },
    { header: 'LND', key: 'lnd', width: 15 },
    { header: 'Retail', key: 'retail', width: 15 },
    { header: 'Total USD', key: 'totalUsd', width: 15 },
    { header: 'AQC', key: 'aqc', width: 15 },
    { header: 'LC', key: 'lc', width: 15 },
    { header: 'SQM Price', key: 'sqmPrice', width: 15 },
    { header: 'AQ Round', key: 'aqRound', width: 15 },
    { header: 'LND Round', key: 'lndRound', width: 15 },
    { header: 'Desc Price', key: 'descPrice', width: 15 },
];

// TODO: FMT_SHOPIFY_BATCH_WIZARD_COLS (Incomplete in PM1 - 47 columns mentioned but not all listed. Use FMT_SHOPIFY_MATRIXIFY_MAIN_COLS as the standard central Print Module engine schema).
