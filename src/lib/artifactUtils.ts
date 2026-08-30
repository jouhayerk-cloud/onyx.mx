import { supabase } from './supabase';
import { normalizeInventoryData, calculateCodesAndPrices, getCleanImageUrl } from './utils';
import { DEFAULT_EXCHANGE_RATE } from './consts';

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
/**
 * Public tag resolution goes through the `artifact` edge function, not the
 * inventory table.
 *
 * The function runs on the service role server-side and returns a curated field
 * set — never price_mxn, acquisition or landed cost — so the database can stay
 * closed to anonymous callers while printed QR labels keep resolving. Retail is
 * computed there from the cost it declines to expose.
 */
const ARTIFACT_FN = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/artifact`;

async function fetchPublicArtifact(tagId: string): Promise<any | null> {
    try {
        const res = await fetch(`${ARTIFACT_FN}?tagid=${encodeURIComponent(tagId)}&format=json`);
        if (!res.ok) return null;
        const body = await res.json();
        return body?.found ? body.data : null;
    } catch (err) {
        console.error('[artifact] public lookup failed:', err);
        return null;
    }
}

export async function resolveArtifact(tagId: string, options: { exchangeRate?: number; workbookPrefix?: string } = {}): Promise<ResolvedArtifact | null> {
    if (!tagId) return null;
    const { exchangeRate = DEFAULT_EXCHANGE_RATE, workbookPrefix = '326' } = options;

    // Unauthenticated callers (public tag scans) must use the edge function.
    // Signed-in users fall through to the direct queries below, which return the
    // full record including the cost codes the app is entitled to show.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        const publicItem = await fetchPublicArtifact(tagId);
        if (!publicItem) return null;

        const data = normalizeInventoryData(publicItem);
        const images: string[] = [];
        if (data.generatedPngUrl) images.push(data.generatedPngUrl);
        if (data.mediaUrls) String(data.mediaUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });
        if (data.generatedImageUrls) String(data.generatedImageUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });

        return {
            data,
            // Retail arrives precomputed. Acquisition and landed codes are absent by
            // design: the cypher is public, so publishing them publishes the cost.
            codes: { bookBardcode: publicItem.book_barcode, bookRetail: publicItem.book_retail },
            images: Array.from(new Set(images.filter(Boolean))).map(url => getCleanImageUrl(url)),
            source: 'public'
        };
    }

    try {
        let fetched: { data: any; source?: string } | null = null;

        // 1. Try exact match on multiple ID columns (Barcode, Item ID, or UUID)
        const { data: directData } = await supabase.from('inventory')
            .select('*')
            .or(`book_barcode.eq.${tagId},item_id.eq.${tagId},id.eq.${tagId}`)
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
                    .eq('item_number', parseInt(itemNumStr, 10))
                    .not('status', 'ilike', 'Available%');


                
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

/**
 * SEARCH ARTIFACTS
 * Global search engine for the Onyx Viewer.
 * Performs direct resolution first, then falls back to keyword searching.
 */
export async function searchArtifacts(query: string, options: { exchangeRate?: number; workbookPrefix?: string } = {}): Promise<ResolvedArtifact[]> {
    const { exchangeRate = DEFAULT_EXCHANGE_RATE, workbookPrefix = '326' } = options;
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    // Phase 1: Try Direct Resolution
    const resolved = await Promise.all(terms.map(t => resolveArtifact(t, options)));
    const validResolved = resolved.filter((r): r is ResolvedArtifact => r !== null);
    
    if (validResolved.length > 0) return validResolved;

    // Phase 2: Keyword Fallback
    try {
        const firstTerm = terms[0];
        let { data: items } = await supabase.from('inventory')
            .select('*')
            .not('status', 'ilike', 'Available%')
            .or(`short_description.ilike.%${firstTerm}%,shape.ilike.%${firstTerm}%,material.ilike.%${firstTerm}%,color.ilike.%${firstTerm}%,workbook.ilike.%${firstTerm}%`)
            .limit(250);

        if (!items) return [];

        if (terms.length > 1) {
            items = items.filter(item => {
                const blob = [item.short_description, item.shape, item.material, item.color].filter(Boolean).join(' ').toLowerCase();
                return terms.every(t => blob.includes(t.toLowerCase()));
            });
        }

        return items.map(item => {
            const data = normalizeInventoryData(item);
            const codes = calculateCodesAndPrices(data, exchangeRate, workbookPrefix);
            const images: string[] = [];
            if (data.generatedPngUrl) images.push(data.generatedPngUrl);
            if (data.mediaUrls) String(data.mediaUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });
            if (data.generatedImageUrls) String(data.generatedImageUrls).split(',').forEach(u => { const t = u.trim(); if (t) images.push(t); });
            const uniqueImages = Array.from(new Set(images.filter(Boolean))).map(url => getCleanImageUrl(url));
            
            return { 
                data, 
                codes, 
                images: uniqueImages,
                source: 'inventory' 
            };
        });
    } catch (err) {
        console.error("Search artifacts error:", err);
        return [];
    }
}
