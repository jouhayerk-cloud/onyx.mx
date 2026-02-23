
// Helper to find the likely header row index in a sheet's data
// Scans the first 10 rows for common keywords
export const findHeaderRowIndex = (data: any[][]): number => {
    if (!data || data.length === 0) return 0;

    const keywords = ['DATE', 'FECHA', 'VENDOR', 'PROVEEDOR', 'ITEM', 'DESCRIPCION', 'DESCRIPTION', 'AMOUNT', 'MONTO', 'QTY', 'CANTIDAD'];

    // Limit scan to first 10 rows to avoid performance hit
    const limit = Math.min(data.length, 10);

    for (let i = 0; i < limit; i++) {
        const row = data[i];
        if (!row) continue;

        // Count how many cells in this row match a keyword (case-insensitive)
        let matchCount = 0;
        for (const cell of row) {
            if (typeof cell === 'string') {
                const upper = cell.toUpperCase();
                if (keywords.some(k => upper.includes(k))) {
                    matchCount++;
                }
            }
        }

        // If we find at least 2 keywords in a row, assume it's the header
        if (matchCount >= 2) {
            return i;
        }
    }

    // Default to 0 if no clear header found
    return 0;
};
