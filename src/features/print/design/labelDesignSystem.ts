// Data derived from docs/print/PM3_LABELS_CATALOGUE_AND_DESIGN_REVIEW.md

export const LABEL_STOCK_PRESETS = {
    M110_48x28: {
        name: 'Phomemo M110 48x28.75mm',
        widthMm: 48,
        heightMm: 28.75,
        widthDots: 384,
        heightDots: 230, // at 203 dpi
        orientation: 'landscape' as const,
        gapMm: 0, // UNKNOWN exact gap from docs.
    },
    Standard_50x30: {
        name: 'Standard 50x30mm',
        widthMm: 50,
        heightMm: 30,
        widthDots: 400,
        heightDots: 240, // at 203 dpi
        orientation: 'landscape' as const,
        gapMm: 0, // UNKNOWN exact gap from docs.
    }
};

export const LABEL_PALETTE = {
    black: '#000000',
    white: '#FFFFFF',
};

export const LABEL_TYPE_SCALE = {
    utility: { dots: 16, mm: 2 }, // Metadata, absolute min legible height
    body: { dots: 24, mm: 3 }, // Subhead/Body
    headlineSmall: { dots: 32, mm: 4 }, // Primary ID/Headline
    headlineLarge: { dots: 40, mm: 5 }, // Primary ID/Headline
};

export const LABEL_QR_BARCODE = {
    qrMinSizeDots: 128, // 16x16 mm
    qrMinSizeMm: 16,
    qrQuietZoneDots: 16, // 4 modules (~2 mm)
    qrQuietZoneMm: 2,
    barcodeWidthMm: 40, // From PM2 Part C
    barcodeHeightMm: 12, // From PM2 Part C
};

export const LABEL_LAYOUT_GRID = {
    safeMarginDots: 16, // 2 mm clear zone
    safeMarginMm: 2,
    snapGridDots: 8, // 1 mm snapping grid
    snapGridMm: 1,
};

export function mmToDots(mm: number): number {
    return Math.round(mm * 8); // 203 dpi: 8 dots = 1 mm
}

export function dotsToMm(dots: number): number {
    return dots / 8;
}
