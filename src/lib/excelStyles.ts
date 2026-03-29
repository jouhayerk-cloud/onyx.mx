
import { vendors } from './consts';

export const EXCEL_STYLES = {
    fonts: {
        header: { name: 'Arial', family: 2, size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        body: { name: 'Arial', family: 2, size: 9 },
        tagid: { name: 'Arial', family: 2, size: 9, bold: true },
    },
    fills: {
        header: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }, // Gray-800
        zebra: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }, // Gray-50
    }
};

export const getStatusColor = (status: string): string => {
    const s = (status || '').toLowerCase().trim();
    if (s === 'paid') return 'FF22C55E';
    if (s === 'requested' || s === 'pending') return 'FFFACC15';
    if (s === 'partial') return 'FFEF4444';
    return 'FF94A3B8'; // Slate-400
};

export const getCategoryColor = (cat: string): string => {
    const c = (cat || '').toLowerCase().trim();
    if (c.includes('acq')) return 'FF10B981';
    if (c.includes('prod')) return 'FF6366F1';
    if (c.includes('month')) return 'FF38BDF8';
    if (c.includes('oprt') || c.includes('operation')) return 'FF818CF8';
    if (c.includes('pack')) return 'FFFB7185';
    if (c.includes('sppl') || c.includes('supply')) return 'FF34D399';
    if (c.includes('labr') || c.includes('labor')) return 'FFFB7185';
    return 'FF94A3B8';
};

export const getVendorColor = (vendorId: string): string => {
    const v = vendors[vendorId as keyof typeof vendors];
    if (v?.color) {
        // Convert #RRGGBB to ARGB (FFRRGGBB)
        return 'FF' + v.color.replace('#', '').toUpperCase();
    }
    return 'FF1F2937'; // Default header color
};
