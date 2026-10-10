export interface ArchiveItem {
    id: string | number;
    vendor: string;
    tag_id?: string;
    item_number?: string;
    item_date: string | null;
    description?: string;
    quantity?: number;
    weight_kg?: number;
    height_cm?: number;
    width_cm?: number;
    length_cm?: number;
}

export interface ArchiveFinance {
    price_mxn?: number;
    total_pesos?: number;
    aq?: number;
    lnd?: number;
    retail?: number;
    total_usd?: number;
    aqc?: number;
    lc?: number;
    sqm_price?: number;
    aq_round?: number;
    lnd_round?: number;
    desc_price?: number;
}

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

// CSV cell: double the quotes, and defuse spreadsheet formulas (a leading = + - @ tab or CR makes Excel run the cell)
const csvCell = (v: unknown): string => {
    const t = String(v ?? '').replace(/"/g, '""');
    return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t) + '"';
};

/** Builds archive CSV text, file name and row count from items; adds finance columns for finance roles. */
export function buildArchiveCsv(
    items: ArchiveItem[],
    finance: Record<string, ArchiveFinance>,
    isFinanceRole: boolean,
    book?: { season?: string | number } | null,
    selectedVendor?: string | null,
    page?: number
): { text: string; fileName: string; rowCount: number } {
    let csv = '';
    const headers = ['VND', 'TAG ID', 'Item Number', 'Date', 'Description', 'Qty', 'Wt.', 'Dimensions'];
    
    if (isFinanceRole) {
        headers.push('Price MXN', 'Total Pesos', 'AQ', 'LND', 'Retail', 'Total USD', 'AQC', 'LC', 'SQM Price', 'AQ Round', 'LND Round', 'Desc Price');
    }
    
    csv += headers.map(h => `"${h}"`).join(',') + '\n';
    
    items.forEach(item => {
        const row = [
            item.vendor,
            item.tag_id || '',
            item.item_number || '',
            fmtDate(item.item_date),
            (item.description || '').replace(/"/g, '""'),
            item.quantity?.toString() || '',
            item.weight_kg?.toString() || '',
            `${item.height_cm || 0}x${item.width_cm || 0}x${item.length_cm || 0}`
        ];
        
        if (isFinanceRole) {
            const fin = finance[item.id];
            if (fin) {
                row.push(
                    fin.price_mxn?.toString() || '',
                    fin.total_pesos?.toString() || '',
                    fin.aq?.toString() || '',
                    fin.lnd?.toString() || '',
                    fin.retail?.toString() || '',
                    fin.total_usd?.toString() || '',
                    fin.aqc?.toString() || '',
                    fin.lc?.toString() || '',
                    fin.sqm_price?.toString() || '',
                    fin.aq_round?.toString() || '',
                    fin.lnd_round?.toString() || '',
                    fin.desc_price?.toString() || ''
                );
            } else {
                row.push('', '', '', '', '', '', '', '', '', '', '', '');
            }
        }
        
        csv += row.map(csvCell).join(',') + '\n';
    });

    const fileName = `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page ?? 0}.csv`;

    return { text: csv, fileName, rowCount: items.length };
}
