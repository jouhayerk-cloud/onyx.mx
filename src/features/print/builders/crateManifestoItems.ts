export interface ManifestoItem {
    index: number;
    vendorPrefix: string;
    qty: number;
    itemId: string;
    rowId: any;
    name: string;
    material: string;
    color: string;
    dims: string;
    weightKg: number;
    costMxn: number;
    costUsd: number;
    imageUrls: string[];
    tagColor: string;
    dbItemCount: number;
    packetIn: any;
}

/** Maps packed crate items to manifesto rows, with normalized codes, prices and image URLs. */
export function buildCrateManifestoItems(
    packedItems: any[],
    normalizeInventoryData: (data: any) => any,
    calculateCodesAndPrices: (data: any, liveRate: number, season: string) => any,
    liveRate: number,
    getCleanImageUrl: (url: string) => string,
    vendors: any
): ManifestoItem[] {
    return packedItems.map((item, idx) => {
        const d = normalizeInventoryData(item.norm);
        const c = calculateCodesAndPrices(d, liveRate, '326');
        const vendorPrefix = String(d.vendor_id || d.itemId || '').split('-')[0] || 'UNK';
        const rawUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [d.generatedPngUrl];
        const imageUrls = rawUrls.map((u: string) => getCleanImageUrl(u));
        
        return {
            index: idx + 1,
            vendorPrefix,
            qty: item.qty,
            itemId: c.bookBarcode || d.itemId || 'N/A',
            rowId: item.id,
            name: `${d.shape || ''} ${d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE',
            material: d.material || 'ONYX',
            color: d.color || '',
            dims: `${d.widthCm || 0}×${d.heightCm || 0}×${d.lengthCm || 0} cm`,
            weightKg: Number(d.weightKg || 0),
            costMxn: Number(d.price || 0),
            costUsd: Number(c.bookAcquisition || 0),
            imageUrls,
            tagColor: (vendors as any)[vendorPrefix]?.color || '#555',
            dbItemCount: Number(d.quantity || 0),
            packetIn: item.packetIn
        };
    });
}
