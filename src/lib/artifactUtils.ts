import { supabase } from './supabase';
import { normalizeInventoryData, calculateCodesAndPrices, getCleanImageUrl } from './utils';

export interface ResolvedArtifact {
    data: any;
    codes: any;
    images: string[];
    source?: string;
}

/**
 * RESOLVE ARTIFACT
 * Official Onyx.mx resolution logic for a single tagId/barcode.
 * Supports: Exact barcode, Regex Pattern (SU...), Production Table, Legacy ItemID.
 */
export async function resolveArtifact(tagId: string, options: { exchangeRate?: number; workbookPrefix?: string } = {}): Promise<ResolvedArtifact | null> {
    if (!tagId) return null;
    const { exchangeRate = 20, workbookPrefix = '326' } = options;

    try {
        let fetched: { data: any; source?: string } | null = null;

        // 1. Try exact match on book_barcode
        const { data: directData } = await supabase.from('inventory')
            .select('*')
            .eq('book_barcode', tagId)
            .maybeSingle();
        
        if (directData) { 
            fetched = { data: directData }; 
        } else {
            // 2. Fallback: Parse barcode style (SU + 326 + 15 + EE)
            const match = tagId.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
            if (match) {
                const [_, vendorPrefix, wbStr, itemNumStr] = match;
                const { data: parsedData } = await supabase.from('inventory').select('*')
                    .or(`workbook.eq.${wbStr},workbook.eq.V${wbStr},workbook.eq.v${wbStr}`)
                    .eq('item_number', parseInt(itemNumStr, 10));
                
                if (parsedData && parsedData.length > 0) {
                    const found = parsedData.find(d => 
                        String(d.item_id || d.itemId || d.id || '').toUpperCase().startsWith(vendorPrefix.toUpperCase())
                    ) || parsedData[0];
                    fetched = { data: found }; 
                }
            }
        }

        // 3. Fallback: Production table
        if (!fetched) {
            const { data: prodData } = await supabase.from('production')
                .select('*')
                .eq('tag_id', tagId)
                .maybeSingle();
            if (prodData) {
                fetched = { data: prodData, source: 'production' };
            }
        }

        // 4. Last resort: Try as item_id (legacy SU-...)
        if (!fetched) {
            const { data: legacyData } = await supabase.from('inventory')
                .select('*')
                .eq('item_id', tagId)
                .maybeSingle();
            if (legacyData) {
                fetched = { data: legacyData };
            }
        }

        if (!fetched) return null;

        // Normalize and Calculate
        const data = normalizeInventoryData(fetched.data);
        const codes = calculateCodesAndPrices(data, exchangeRate, workbookPrefix);

        const images: string[] = [];
        if (data.generatedPngUrl) images.push(data.generatedPngUrl);
        if (data.mediaUrls) String(data.mediaUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });
        if (data.generatedImageUrls) String(data.generatedImageUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });

        const uniqueImages = Array.from(new Set(images.filter(Boolean))).map(url => getCleanImageUrl(url));
        
        return {
            ...fetched,
            data,
            codes,
            images: uniqueImages
        };

    } catch (err) {
        console.error("Artifact resolution error:", err);
        return null;
    }
}
