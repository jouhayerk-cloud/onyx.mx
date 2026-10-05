// Data derived from docs/print/PM2_PDF_CATALOGUE_AND_DESIGN_REVIEW.md

export const PDF_PAGE_PRESETS = {
    A4: {
        format: 'a4' as const,
        dimensions: [210, 297], // mm
    },
    Letter: {
        format: 'letter' as const,
        dimensions: [215.9, 279.4], // mm
    },
    LabelSheet: {
        // UNKNOWN exact dimensions from PM2 docs for LabelSheet. Assumed standard sizes or fallback.
        format: 'unknown' as const,
        dimensions: [0, 0],
    }
};

export const PDF_MARGINS = {
    global: 15, // mm
    gapSmall: 4, // mm
    gapMedium: 8, // mm
    gapLarge: 16, // mm
};

export const PDF_TYPE_SCALE = {
    display: { size: 24, weight: 700 }, // bold
    title: { size: 16, weight: 700 }, // bold
    body: { size: 12, weight: 400 }, // regular
    bodyBold: { size: 12, weight: 700 }, // bold
    caption: { size: 10, weight: 400 }, // regular
    captionBold: { size: 10, weight: 700 }, // bold
};

export const PDF_COLORS = {
    primary: '#000000',
    secondary: '#475569',
    border: '#CBD5E1',
    accent: '#0F172A',
    white: '#FFFFFF',
};

export const PDF_TABLE_STYLE = {
    headerCase: 'Title Case',
    dataCase: 'Sentence Case',
    borderBottomWidth: 0.5, // pt
    borderBottomColor: PDF_COLORS.border,
    zebra: 'none',
    paddingTop: 2, // mm (UNKNOWN from docs, inferred sensible padding)
    paddingBottom: 2, // mm (UNKNOWN from docs, inferred sensible padding)
};

export const PDF_FOOTER_TEMPLATE = {
    brandString: 'Onyx.mx - Made In Mexico', // UNKNOWN if dynamic, using base string
    pageNumberString: 'Page {current} of {total}',
    dj1HashPlaceholder: 'dj1:{hash}',
    jobRefPlaceholder: 'Job: {jobRef}',
};

export const PDF_QR_BLOCK = {
    qrSize: 20, // mm
    barcodeWidth: 40, // mm
    barcodeHeight: 12, // mm
    quietZone: 4, // modules
};

export function mmToPt(mm: number): number {
    return mm * 2.83465;
}

export function ptToMm(pt: number): number {
    return pt / 2.83465;
}
