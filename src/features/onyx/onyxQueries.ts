
import { supabase } from '../../lib/supabase';

/**
 * Onyx Query Engine
 * Provides structured access to the warehouse database with built-in context awareness.
 * Note: 'vendor_id' is derived from the first two letters of 'item_id'.
 */

import { vendors } from '../../lib/consts';

// Ordered list of vendor keys (longest first to prevent greedy matching)
const VENDOR_KEYS = Object.keys(vendors).sort((a, b) => b.length - a.length);

export const onyxQueries = {
    // ... rest of the file
    /**
     * Search inventory with flexible status and identifier logic.
     * Prioritizes Tag IDs (book_barcode) and filters by status.
     */
    searchInventory: async (params: { 
        query?: string, 
        vendor?: string, 
        status?: string, 
        shape?: string,
        limit?: number 
    }) => {
        // Select essential columns. Excluding 'vendor_id' as it may not exist on server.
        let q = supabase.from('inventory').select('*, item_id, book_barcode, quantity, status, height_cm, width_cm, length_cm, weight_kg, color', { count: 'exact' });

        // Handle Status logic from user: "only read INVENTORY, not available items"
        // We exclude what's NOT wanted to be as inclusive as possible for physical stock.
        if (params.status) {
            q = q.eq('status', params.status);
        }

        let orFilters = [];
        if (params.query) {
            const clean = params.query.trim();
            orFilters.push(
                `description.ilike.%${clean}%`, 
                `short_description.ilike.%${clean}%`, 
                `material.ilike.%${clean}%`, 
                `shape.ilike.%${clean}%`,
                `color.ilike.%${clean}%`,
                `book_barcode.ilike.%${clean}%`,
                `item_id.ilike.%${clean}%`
            );
        }
        
        if (params.shape) {
            orFilters.push(`shape.ilike.%${params.shape}%`);
        }

        if (orFilters.length > 0) {
            q = q.or(orFilters.join(','));
        }

        // Vendor is derived from item_id or book_barcode prefix
        if (params.vendor) {
            const prefix = `${params.vendor}%`;
            q = q.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
        }

        const { data, error, count } = await q.limit(params.limit || 50);
        
        if (error) {
            console.error("[OnyxQuery] Search Error:", error);
            throw new Error(error.message);
        }

        // Fetch sum separately to ensure accuracy for the WHOLE matched set
        let sumQ = supabase.from('inventory').select('quantity, item_id');
        if (params.status) {
            sumQ = sumQ.eq('status', params.status);
        }
        if (orFilters.length > 0) sumQ = sumQ.or(orFilters.join(','));
        if (params.vendor) {
            const prefix = `${params.vendor}%`;
            sumQ = sumQ.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
        }

        const { data: sumData } = await sumQ;
        const totalQty = sumData?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;

        return {
            items: (data || []).map(i => ({ 
                ...i, 
                vendor_id: i.item_id?.substring(0, 2) // Virtual column
            })),
            total_records: count || 0,
            total_quantity: totalQty
        };
    },

    /**
     * Specialized summary query that ignores the 50-item limit for counting.
     */
    getAggregatedSummary: async (group_by: string, vendor?: string, query?: string) => {
        try {
            console.log(`[OnyxQuery] Aggregating ${group_by} (virtual) for vendor: ${vendor}, query: ${query}`);
            
            // Map virtual group_by if needed
            const dbField = group_by === 'vendor_id' ? 'item_id' : group_by;
            let q = supabase.from('inventory').select(`quantity, ${dbField}, status`);
            
            // No automatic status filtering to ensure maximum visibility of all assets

            if (vendor) {
                const prefix = `${vendor}%`;
                q = q.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
            }
            
            if (query) {
                const clean = query.trim();
                q = q.or(`description.ilike.%${clean}%,short_description.ilike.%${clean}%,material.ilike.%${clean}%,shape.ilike.%${clean}%,color.ilike.%${clean}%,book_barcode.ilike.%${clean}%,item_id.ilike.%${clean}%`);
            }

            const { data, error } = await q;
            if (error) {
                console.error("[OnyxQuery] Aggregation Error:", error);
                throw new Error(`Aggregation failed: ${error.message}`);
            }

            if (!data) return { summary: {}, total_quantity: 0, total_records: 0 };

            const summary: Record<string, number> = {};
            data.forEach((item: any) => {
                let key = 'Unknown';
                if (group_by === 'vendor_id') {
                    const idString = (item.item_id || item.book_barcode || '').toString().toUpperCase().trim();
                    // Find the best matching vendor key
                    const match = VENDOR_KEYS.find(k => idString.startsWith(k.toUpperCase()));
                    key = match || idString.substring(0, 2) || 'Unknown';
                } else {
                    key = item[group_by] || 'Unknown';
                }
                const normalizedKey = key.toString().toUpperCase().trim();
                summary[normalizedKey] = (summary[normalizedKey] || 0) + (item.quantity || 0);
            });

            return {
                group_by,
                summary,
                total_quantity: Object.values(summary).reduce((a, b) => a + b, 0),
                total_records: data.length
            };
        } catch (err: any) {
            console.error("[OnyxQuery] Catch Error:", err);
            throw err;
        }
    },

    /**
     * Get unique values for knowledge grounding.
     * Expanded to include color + material context.
     */
    getDatabaseContext: async () => {
        const { data, error } = await supabase.from('inventory').select('shape, material, item_id, book_barcode, status, color');
        if (error) throw new Error(error.message);

        return {
            vendors: Array.from(new Set(data.map(i => {
                const idString = (i.item_id || i.book_barcode || '').toString().toUpperCase().trim();
                const match = VENDOR_KEYS.find(k => idString.startsWith(k.toUpperCase()));
                return match || idString.substring(0, 2);
            }).filter(Boolean))),
            shapes: Array.from(new Set(data.map(i => i.shape?.trim()).filter(Boolean))),
            materials: Array.from(new Set(data.map(i => i.material?.trim()).filter(Boolean))),
            colors: Array.from(new Set(data.map(i => i.color?.trim()).filter(Boolean))),
            statuses: Array.from(new Set(data.map(i => i.status?.trim()).filter(Boolean))),
            total_items: data.length
        };
    },

    /**
     * Get item details by any identifier.
     */
    getItemByAnyId: async (id: string) => {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`)
            .maybeSingle();
        
        if (error) throw new Error(error.message);
        
        if (data) {
            return { ...data, vendor_id: data.item_id?.substring(0, 2) };
        }
        return data;
    }
};
