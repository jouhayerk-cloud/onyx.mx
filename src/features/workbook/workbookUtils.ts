
export const findHeaderRowIndex = (data: any[][]): number => {
    if (!data || data.length === 0) return 0;

    const keywords = ['DATE', 'FECHA', 'VENDOR', 'PROVEEDOR', 'ITEM', 'DESCRIPCION', 'DESCRIPTION', 'AMOUNT', 'MONTO', 'QTY', 'CANTIDAD'];
    const limit = Math.min(data.length, 10);

    for (let i = 0; i < limit; i++) {
        const row = data[i];
        if (!row) continue;
        let matchCount = 0;
        for (const cell of row) {
            if (typeof cell === 'string') {
                const upper = cell.toUpperCase();
                if (keywords.some(k => upper.includes(k))) {
                    matchCount++;
                }
            }
        }
        if (matchCount >= 2) {
            return i;
        }
    }
    return 0;
};
