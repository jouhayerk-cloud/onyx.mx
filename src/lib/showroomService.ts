import { supabase } from './supabase';
import { DEFAULT_EXCHANGE_RATE, vendors } from './consts';
import { calculateCodesAndPrices } from './utils';
import { buildInventoryRow, createInventoryItems, getNextItemNumber } from './inventoryCreate';
import { segmentImage, segServiceUsable, type SegMode } from './ai/providers/segService';

export type ShowroomStatus = 'active' | 'discarded' | 'transferred';

export interface ShowroomItem {
    id: string;
    item_id?: string;
    vendor_id: string;
    status: ShowroomStatus;
    shape?: string;
    type?: string;
    canonical_type?: string;
    material?: string;
    color?: string;
    generated_color?: string;
    description?: string;
    detailed_description?: string;
    length_cm?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    weight_kg?: number | null;
    cost_mxn?: number | null;
    cost_usd?: number | null;
    landed_cost?: number | null;
    retail_price?: number | null;
    book_aq_code?: string | null;
    book_land_code?: string | null;
    book_barcode?: string | null;
    media_urls?: string | null;
    img_clean?: string | null;
    local_segmentation_masks?: string | null;
    cloud_segmentation_masks?: string | null;
    svg_data?: string | null;
    notes?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
    discarded_at?: string | null;
    transferred_at?: string | null;
    transferred_to_inventory_id?: string | null;
}

export interface ShowroomFilterOptions {
    role?: string;
    vendorName?: string;
    statusFilter?: 'active' | 'discarded' | 'transferred' | 'all';
    search?: string;
    vendorFilter?: string;
}

/**
 * Fetch showroom items with role, status, and search filters
 */
export async function fetchShowroomItems(opts: ShowroomFilterOptions = {}): Promise<ShowroomItem[]> {
    try {
        let query = (supabase as any).from('showroom_items').select('*');

        // Status filter:
        // By default, clients and active views only see 'active'
        const isClient = opts.role?.startsWith('Client');
        const isVendor = opts.role === 'Vendor';

        if (isClient) {
            query = query.eq('status', 'active');
        } else if (opts.statusFilter && opts.statusFilter !== 'all') {
            query = query.eq('status', opts.statusFilter);
        } else if (!opts.statusFilter) {
            query = query.eq('status', 'active');
        }

        // Vendor role isolation:
        // Vendors only see items belonging to their vendor code
        if (isVendor && opts.vendorName) {
            const vCode = String(opts.vendorName).trim().toUpperCase();
            query = query.eq('vendor_id', vCode);
        } else if (opts.vendorFilter && opts.vendorFilter !== 'All') {
            query = query.eq('vendor_id', opts.vendorFilter.toUpperCase());
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) {
            console.warn('[ShowroomService] fetch failed (table may need migration):', error.message);
            return [];
        }

        let items: ShowroomItem[] = (data || []) as ShowroomItem[];

        // Client-side text search if provided
        if (opts.search && opts.search.trim()) {
            const q = opts.search.toLowerCase();
            items = items.filter(it => 
                (it.item_id?.toLowerCase().includes(q)) ||
                (it.vendor_id?.toLowerCase().includes(q)) ||
                (it.type?.toLowerCase().includes(q)) ||
                (it.shape?.toLowerCase().includes(q)) ||
                (it.color?.toLowerCase().includes(q)) ||
                (it.material?.toLowerCase().includes(q)) ||
                (it.description?.toLowerCase().includes(q)) ||
                (it.notes?.toLowerCase().includes(q))
            );
        }

        return items;
    } catch (err) {
        console.warn('[ShowroomService] fetchShowroomItems error:', err);
        return [];
    }
}

/**
 * Compute acquisition, landed, retail prices and cypher strings for a showroom item
 */
export function computeShowroomFinancials(
    priceMxn: number | null | undefined, 
    vendorId: string, 
    itemRef: string = '1',
    exchangeRate: number = DEFAULT_EXCHANGE_RATE
) {
    const price = typeof priceMxn === 'number' && !isNaN(priceMxn) ? priceMxn : 0;
    const vendor = String(vendorId || 'UNK').trim().toUpperCase();

    const codes = calculateCodesAndPrices(
        {
            price_mxn: price,
            item_id: `${vendor}-${itemRef}`,
            item_number: parseInt(itemRef.replace(/\D/g, ''), 10) || 1,
            vendor_id: vendor,
            workbook: 'v826'
        },
        exchangeRate,
        'v826'
    );

    return {
        cost_mxn: price > 0 ? price : null,
        cost_usd: price > 0 ? Number((price / exchangeRate).toFixed(2)) : null,
        landed_cost: codes.bookLanded ? Number(codes.bookLanded) : null,
        retail_price: codes.bookRetail ? Number(codes.bookRetail) : null,
        book_aq_code: codes.bookAqCode || null,
        book_land_code: codes.bookLandCode || null,
        book_barcode: codes.bookBarcode || null,
    };
}

/**
 * Create a single showroom item
 */
export async function createShowroomItem(item: Partial<ShowroomItem>, user?: any): Promise<ShowroomItem> {
    const vendor = String(item.vendor_id || '').trim().toUpperCase();
    if (!vendor) throw new Error('Vendor is required for showroom item');

    const financials = computeShowroomFinancials(
        item.cost_mxn,
        vendor,
        item.item_id || 'TEMP',
        DEFAULT_EXCHANGE_RATE
    );

    const payload = {
        item_id: item.item_id || `${vendor}-SHOW-${Date.now().toString().slice(-4)}`,
        vendor_id: vendor,
        status: item.status || 'active',
        shape: item.shape || null,
        type: item.type || null,
        canonical_type: item.canonical_type || null,
        material: item.material || null,
        color: item.color || null,
        description: item.description || null,
        detailed_description: item.detailed_description || null,
        length_cm: item.length_cm ?? null,
        width_cm: item.width_cm ?? null,
        height_cm: item.height_cm ?? null,
        weight_kg: item.weight_kg ?? null,
        ...financials,
        media_urls: item.media_urls || null,
        img_clean: item.img_clean || null,
        local_segmentation_masks: item.local_segmentation_masks || null,
        svg_data: item.svg_data || null,
        notes: item.notes || null,
        created_by: user?.name || user?.email || 'System',
    };

    const { data, error } = await (supabase as any)
        .from('showroom_items')
        .insert(payload)
        .select('*')
        .single();

    if (error) throw new Error(error.message);
    return data as ShowroomItem;
}

/**
 * Batch create multiple showroom items (e.g. from XLSX import)
 */
export async function batchCreateShowroomItems(
    items: Partial<ShowroomItem>[],
    user?: any
): Promise<{ successful: ShowroomItem[]; errors: string[] }> {
    const successful: ShowroomItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
        try {
            const created = await createShowroomItem(items[i], user);
            successful.push(created);
        } catch (err: any) {
            errors.push(`Row ${i + 1} (${items[i].item_id || 'unknown'}): ${err.message || String(err)}`);
        }
    }

    return { successful, errors };
}

/**
 * Discard an item from active Showroom view without deleting it from the database
 */
export async function discardShowroomItem(id: string): Promise<boolean> {
    const { error } = await (supabase as any)
        .from('showroom_items')
        .update({
            status: 'discarded',
            discarded_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) throw new Error(error.message);
    return true;
}

/**
 * Restore a discarded item back to active Showroom view
 */
export async function restoreShowroomItem(id: string): Promise<boolean> {
    const { error } = await (supabase as any)
        .from('showroom_items')
        .update({
            status: 'active',
            discarded_at: null
        })
        .eq('id', id);

    if (error) throw new Error(error.message);
    return true;
}

/**
 * Move a Showroom item into official Main Inventory (Lot pass)
 * Assigns next workbook item number, generates official barcode, creates row in `inventory`,
 * and updates showroom item status to 'transferred'.
 */
export async function transferShowroomItemToInventory(
    showroomItem: ShowroomItem,
    targetWorkbook: 'v826' | 'v326' = 'v826',
    user?: any
): Promise<{ inventoryId: string; itemNumber: number; barcode: string }> {
    const vendor = String(showroomItem.vendor_id).trim().toUpperCase();
    if (!vendor) throw new Error('Missing vendor ID');

    // 1. Get next official item number in the target workbook
    const nextNum = await getNextItemNumber(vendor, targetWorkbook);

    // 2. Prepare media URLs array
    const mediaArray = showroomItem.media_urls
        ? showroomItem.media_urls.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    // 3. Build Inventory Row
    const inventoryInsert = buildInventoryRow(
        {
            vendorId: vendor,
            workbook: targetWorkbook,
            itemNumber: nextNum,
            status: 'Available',
            shape: showroomItem.shape || '',
            type: showroomItem.type || '',
            color: showroomItem.color || '',
            material: showroomItem.material || '',
            description: showroomItem.description || '',
            widthCm: showroomItem.width_cm != null ? String(showroomItem.width_cm) : '',
            heightCm: showroomItem.height_cm != null ? String(showroomItem.height_cm) : '',
            lengthCm: showroomItem.length_cm != null ? String(showroomItem.length_cm) : '',
            weightKg: showroomItem.weight_kg != null ? String(showroomItem.weight_kg) : '',
            price: showroomItem.cost_mxn != null ? String(showroomItem.cost_mxn) : '',
            quantity: 1,
            mediaUrls: mediaArray,
        },
        { mode: 'create' }
    );

    // If clean cutout exists, attach to generated_png_url
    if (showroomItem.img_clean) {
        inventoryInsert.generated_png_url = showroomItem.img_clean;
    }

    // 4. Save into main inventory
    const [result] = await createInventoryItems([inventoryInsert]);
    if (!result || !result.ok || !result.row) {
        throw new Error(result?.error || 'Failed to create inventory row');
    }

    const createdInventory = result.row;

    // 5. Update Showroom item status to 'transferred'
    await (supabase as any)
        .from('showroom_items')
        .update({
            status: 'transferred',
            transferred_at: new Date().toISOString(),
            transferred_to_inventory_id: String(createdInventory.id)
        })
        .eq('id', showroomItem.id);

    return {
        inventoryId: String(createdInventory.id),
        itemNumber: nextNum,
        barcode: createdInventory.book_barcode || ''
    };
}

/**
 * Fast SAM2 image segmentation runner for showroom items
 */
export async function runSam2Segmentation(imageSrc: string, itemType?: string, shape?: string): Promise<{
    cutoutDataUrl: string;
    svgPath?: string;
    maskDataUrl?: string;
} | null> {
    try {
        const usable = await segServiceUsable();
        if (!usable) {
            console.warn('[SAM2] Local segmentation service (:8002) not usable or offline');
            return null;
        }

        const isMirror = /mirror|espejo/i.test(itemType || '') || /mirror|espejo/i.test(shape || '');
        const mode: SegMode = isMirror ? 'mirror' : 'object';

        const res = await segmentImage(imageSrc, mode, { maxSide: 1536 });
        const cutout = res.cutoutPng || res.whitePng;
        if (!cutout) return null;

        return {
            cutoutDataUrl: cutout,
            svgPath: res.svg,
            maskDataUrl: res.maskPng
        };
    } catch (err) {
        console.warn('[SAM2] Segmentation failed:', err);
        return null;
    }
}
