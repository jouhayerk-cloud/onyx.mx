
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';

/**
 * Onyx Query Engine
 * Provides structured access to the warehouse database with built-in context awareness.
 * Integrates both 'inventory' and 'production' asset streams.
 */

const VENDOR_KEYS = Object.keys(vendors).sort((a, b) => b.length - a.length);

export const onyxQueries = {
    /**
     * Search inventory & production with flexible status and identifier logic.
     */
    searchInventory: async (params: { 
        query?: string, 
        vendor?: string, 
        status?: string, 
        shape?: string,
        limit?: number 
    }) => {
        const columns = '*, item_id, book_barcode, quantity, status, height_cm, width_cm, length_cm, weight_kg, color';
        
        // Define filters
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
        if (params.shape) orFilters.push(`shape.ilike.%${params.shape}%`);
        const orFilterString = orFilters.length > 0 ? orFilters.join(',') : null;

        let invQ = supabase.from('inventory').select(columns, { count: 'exact' });
        let prodQ = supabase.from('production').select(columns, { count: 'exact' });

        if (params.status) {
            invQ = invQ.eq('status', params.status);
            prodQ = prodQ.eq('status', params.status);
        }

        let filterParts = [];
        if (orFilterString) filterParts.push(`(${orFilterString})`);
        if (params.vendor) {
            const prefix = `${params.vendor}%`;
            filterParts.push(`(item_id.ilike.${prefix},book_barcode.ilike.${prefix})`);
        }

        if (filterParts.length > 0) {
            const combined = filterParts.join(',');
            invQ = invQ.and(combined);
            prodQ = prodQ.and(combined);
        }

        const [invRes, prodRes] = await Promise.all([
            invQ.limit(params.limit || 50),
            prodQ.limit(params.limit || 50)
        ]);

        const combinedData = [
            ...(invRes.data || []).map(i => ({ ...i, source: 'inventory', vendor_id: i.item_id?.substring(0, 2) })),
            ...(prodRes.data || []).map(i => ({ ...i, source: 'production', vendor_id: i.item_id?.substring(0, 2) }))
        ];

        // Fetch sum separately (Inventory only for now as per business rules, or both?)
        // User asked to fetch production info too, so we sum both.
        let invSumQ = supabase.from('inventory').select('quantity');
        if (params.status) invSumQ = invSumQ.eq('status', params.status);
        if (orFilterString) invSumQ = invSumQ.or(orFilterString);
        if (params.vendor) invSumQ = invSumQ.or(`item_id.ilike.${params.vendor}%,book_barcode.ilike.${params.vendor}%`);

        let prodSumQ = supabase.from('production').select('quantity');
        if (params.status) prodSumQ = prodSumQ.eq('status', params.status);
        if (orFilterString) prodSumQ = prodSumQ.or(orFilterString);
        if (params.vendor) prodSumQ = prodSumQ.or(`item_id.ilike.${params.vendor}%,book_barcode.ilike.${params.vendor}%`);

        const [invSum, prodSum] = await Promise.all([invSumQ, prodSumQ]);
        const totalQty = (invSum.data?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0) +
                         (prodSum.data?.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0);

        return {
            items: combinedData,
            total_records: (invRes.count || 0) + (prodRes.count || 0),
            total_quantity: totalQty
        };
    },

    getAggregatedSummary: async (group_by: string, vendor?: string, query?: string) => {
        try {
            const dbField = group_by === 'vendor_id' ? 'item_id' : group_by;
            const columns = `quantity, ${dbField}, status`;
            
            let invQ = supabase.from('inventory').select(columns);
            let prodQ = supabase.from('production').select(columns);

            let filterParts = [];
            if (vendor) {
                const prefix = `${vendor}%`;
                filterParts.push(`(item_id.ilike.${prefix},book_barcode.ilike.${prefix})`);
            }
            if (query) {
                const clean = query.trim();
                filterParts.push(`(description.ilike.%${clean}%,short_description.ilike.%${clean}%,material.ilike.%${clean}%,shape.ilike.%${clean}%,color.ilike.%${clean}%,book_barcode.ilike.%${clean}%,item_id.ilike.%${clean}%)`);
            }

            if (filterParts.length > 0) {
                const combinedFilter = filterParts.join(',');
                invQ = invQ.and(combinedFilter);
                prodQ = prodQ.and(combinedFilter);
            }

            const [invRes, prodRes] = await Promise.all([invQ, prodQ]);
            const data = [...(invRes.data || []), ...(prodRes.data || [])];

            const summary: Record<string, number> = {};
            data.forEach((item: any) => {
                let key = 'Unknown';
                if (group_by === 'vendor_id') {
                    const idString = (item.item_id || item.book_barcode || '').toString().toUpperCase().trim();
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
            throw err;
        }
    },

    getDatabaseContext: async () => {
        const [invRes, prodRes] = await Promise.all([
            supabase.from('inventory').select('shape, material, item_id, book_barcode, status, color'),
            supabase.from('production').select('shape, material, item_id, book_barcode, status, color')
        ]);
        
        const data = [...(invRes.data || []), ...(prodRes.data || [])];

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

    getItemByAnyId: async (id: string) => {
        const [invRes, prodRes] = await Promise.all([
            supabase.from('inventory').select('*').or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`).maybeSingle(),
            supabase.from('production').select('*').or(`id.eq.${id},item_id.eq.${id},book_barcode.eq.${id}`).maybeSingle()
        ]);
        
        const data = invRes.data || prodRes.data;
        if (data) {
            return { 
                ...data, 
                source: invRes.data ? 'inventory' : 'production',
                vendor_id: data.item_id?.substring(0, 2) 
            };
        }
        return null;
    }
};
