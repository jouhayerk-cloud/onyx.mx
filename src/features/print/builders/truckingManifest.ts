export interface ConsolidatedItem {
    qty: number;
    inv: any;
    crates: Set<string>;
}

export interface ManifestoItem {
    index: number;
    vendorPrefix: string;
    qty: number;
    itemId: string;
    rowId: string;
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
    packetIn: string;
}

/** Merges the items of truck crates into one entry per item id, with total quantity and crate names. */
export function buildConsolidatedItems(
    truckCrates: any[],
    allCrates: any[],
    allInventory: any[],
    getCrateDisplayName: (crate: any, allCrates: any[], allInventory: any[], numbering?: any) => any,
    getItemsFromCrate: (crate: any, nextFloorLabel?: string, nextBoxLabel?: string, visited?: Set<string>) => any[]
): ConsolidatedItem[] {
    const itemMap = new Map<string, { qty: number, inv: any, crates: Set<string> }>();
    truckCrates.forEach(c => {
        const { label } = getCrateDisplayName(c, allCrates, allInventory);
        getItemsFromCrate(c).forEach((item: any) => {
            const itemContainer = item.packetIn || label;
            const existing = itemMap.get(item.id);
            if (existing) {
                existing.qty += item.qty;
                existing.crates.add(itemContainer);
            } else {
                itemMap.set(item.id, { qty: item.qty, inv: item.inv, crates: new Set([itemContainer]) });
            }
        });
    });
    return Array.from(itemMap.values());
}

/** Turns consolidated items into manifesto rows with vendor, dimensions, weight and packet location. */
export function buildManifestoItems(
    items: ConsolidatedItem[],
    bookRate: number,
    vendors: Record<string, any>,
    normalizeInventoryData: (inv: any) => any,
    calculateCodesAndPrices: (norm: any, rate: number, season: string) => any
): ManifestoItem[] {
    return items.map((item, idx) => {
        const inv = item.inv;
        const data = inv.data || {};
        const norm = normalizeInventoryData(inv);
        const calculated = calculateCodesAndPrices(norm, bookRate, '326');
        const tag = calculated.bookBarcode || data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
        const vendorPrefix = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
        const vendorCol = vendors[vendorPrefix]?.color || '#6b7280';
        return {
            index: idx, vendorPrefix, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
            name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
            material: data.material || data.Material || '', color: data.color || data.Color || '',
            dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
            weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
            costMxn: 0, costUsd: 0,
            imageUrls: [], 
            tagColor: vendorCol, dbItemCount: data.quantity || 1,
            packetIn: Array.from(item.crates).join(', ')
        };
    });
}
