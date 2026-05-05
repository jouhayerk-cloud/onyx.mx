
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
        color?: string,
        material?: string,
        min_length?: number,
        max_length?: number,
        min_width?: number,
        max_width?: number,
        min_height?: number,
        max_height?: number,
        min_weight?: number,
        max_weight?: number,
        limit?: number 
    }) => {
        const invCols = '*, item_id, book_barcode, quantity, status, height_cm, width_cm, length_cm, weight_kg, color';
        const prodCols = '*, item_id, book_barcode, quantity, status';
        
        // Fetch from Inventory
        let invQ = supabase.from('inventory').select(invCols, { count: 'exact' });
        if (params.status) {
            if (Array.isArray(params.status)) {
                invQ = invQ.in('status', params.status);
            } else {
                invQ = invQ.eq('status', params.status);
            }
        }
        
        // Apply global shape/color/material if provided
        if (params.shape) invQ = invQ.ilike('shape', `%${params.shape}%`);
        if (params.color) invQ = invQ.ilike('color', `%${params.color}%`);
        if (params.material) invQ = invQ.ilike('material', `%${params.material}%`);

        if (params.min_length) invQ = invQ.gte('length_cm', params.min_length);
        if (params.max_length) invQ = invQ.lte('length_cm', params.max_length);
        if (params.min_width) invQ = invQ.gte('width_cm', params.min_width);
        if (params.max_width) invQ = invQ.lte('width_cm', params.max_width);
        if (params.min_height) invQ = invQ.gte('height_cm', params.min_height);
        if (params.max_height) invQ = invQ.lte('height_cm', params.max_height);
        if (params.min_weight) invQ = invQ.gte('weight_kg', params.min_weight);
        if (params.max_weight) invQ = invQ.lte('weight_kg', params.max_weight);

        if (params.query) {
            const clean = params.query.trim();
            // Split by spaces or commas, and remove empty strings
            const words = clean.split(/[\s,]+/)
                .map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim())
                .filter(w => w.length >= 2);
            
            // Search each word as an OR group, but ANDed together
            words.forEach(word => {
                const stem = (word.toLowerCase().endsWith('s') && word.length > 3) 
                    ? word.slice(0, -1) 
                    : word;
                
                const wordFilter = [
                    `description.ilike.%${word}%`,
                    `short_description.ilike.%${word}%`,
                    `material.ilike.%${word}%`,
                    `shape.ilike.%${word}%`,
                    `color.ilike.%${word}%`,
                    `book_barcode.ilike.%${word}%`,
                    `item_id.ilike.%${word}%`,
                    // Also search the stem if it's different
                    ...(stem !== word ? [
                        `description.ilike.%${stem}%`,
                        `short_description.ilike.%${stem}%`,
                        `shape.ilike.%${stem}%`
                    ] : [])
                ].join(',');
                invQ = invQ.or(wordFilter);
            });
        }
        
        // Handle vendor filter carefully
        if (params.vendor) {
            if (params.vendor.length <= 3) {
                const prefix = `${params.vendor}%`;
                invQ = invQ.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
            } else {
                // If it's a long string (like "Tehuacan"), treat it as a general keyword search
                invQ = invQ.or(`description.ilike.%${params.vendor}%,color.ilike.%${params.vendor}%,material.ilike.%${params.vendor}%`);
            }
        }

        // Fetch from Production
        let prodQ = supabase.from('production').select(prodCols, { count: 'exact' });
        if (params.status) prodQ = prodQ.eq('status', params.status);
        if (params.shape) prodQ = prodQ.ilike('shape', `%${params.shape}%`);
        if (params.color) prodQ = prodQ.ilike('color', `%${params.color}%`);
        if (params.material) prodQ = prodQ.ilike('material', `%${params.material}%`);

        if (params.query) {
            const clean = params.query.trim();
            const words = clean.split(/[\s,]+/)
                .map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim())
                .filter(w => w.length >= 2);
            words.forEach(word => {
                const stem = (word.toLowerCase().endsWith('s') && word.length > 3) ? word.slice(0, -1) : word;
                const wordFilter = [
                    `description.ilike.%${word}%`,
                    `short_description.ilike.%${word}%`,
                    `material.ilike.%${word}%`,
                    `shape.ilike.%${word}%`,
                    `color.ilike.%${word}%`,
                    `book_barcode.ilike.%${word}%`,
                    `item_id.ilike.%${word}%`,
                    ...(stem !== word ? [
                        `description.ilike.%${stem}%`,
                        `short_description.ilike.%${stem}%`,
                        `shape.ilike.%${stem}%`
                    ] : [])
                ].join(',');
                prodQ = prodQ.or(wordFilter);
            });
        }
        
        if (params.vendor) {
            if (params.vendor.length <= 3) {
                const prefix = `${params.vendor}%`;
                prodQ = prodQ.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
            } else {
                prodQ = prodQ.or(`description.ilike.%${params.vendor}%,color.ilike.%${params.vendor}%,material.ilike.%${params.vendor}%`);
            }
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
        let prodSumQ = supabase.from('production').select('quantity');

        if (params.status) {
            invSumQ = invSumQ.eq('status', params.status);
            prodSumQ = prodSumQ.eq('status', params.status);
        }
        
        if (params.query) {
            const clean = params.query.trim();
            const words = clean.split(/[\s,]+/)
                .map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim())
                .filter(w => w.length >= 2);
            words.forEach(word => {
                const stem = (word.toLowerCase().endsWith('s') && word.length > 3) ? word.slice(0, -1) : word;
                const f = [
                    `description.ilike.%${word}%`,
                    `material.ilike.%${word}%`,
                    `shape.ilike.%${word}%`,
                    `color.ilike.%${word}%`,
                    `item_id.ilike.%${word}%`,
                    `book_barcode.ilike.%${word}%`,
                    ...(stem !== word ? [`description.ilike.%${stem}%`, `shape.ilike.%${stem}%`] : [])
                ].join(',');
                invSumQ = invSumQ.or(f);
                prodSumQ = prodSumQ.or(f);
            });
        }

        if (params.vendor) {
            invSumQ = invSumQ.or(`item_id.ilike.${params.vendor}%,book_barcode.ilike.${params.vendor}%`);
            prodSumQ = prodSumQ.or(`item_id.ilike.${params.vendor}%,book_barcode.ilike.${params.vendor}%`);
        }

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

            if (vendor) {
                const prefix = `${vendor}%`;
                invQ = invQ.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
                prodQ = prodQ.or(`item_id.ilike.${prefix},book_barcode.ilike.${prefix}`);
            }
            
            if (query) {
                const clean = query.trim();
                const words = clean.split(/[\s,]+/)
                    .map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim())
                    .filter(w => w.length >= 2);
                words.forEach(word => {
                    const stem = (word.toLowerCase().endsWith('s') && word.length > 3) ? word.slice(0, -1) : word;
                    const f = [
                        `description.ilike.%${word}%`,
                        `short_description.ilike.%${word}%`,
                        `material.ilike.%${word}%`,
                        `shape.ilike.%${word}%`,
                        `color.ilike.%${word}%`,
                        `book_barcode.ilike.%${word}%`,
                        `item_id.ilike.%${word}%`,
                        ...(stem !== word ? [`description.ilike.%${stem}%`, `short_description.ilike.%${stem}%`, `shape.ilike.%${stem}%`] : [])
                    ].join(',');
                    invQ = invQ.or(f);
                    prodQ = prodQ.or(f);
                });
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
    },

    /**
     * Search logistics (crates, pallets, boxes, shipments, manifests)
     */
    searchLogistics: async (params: { query?: string, limit?: number }) => {
        const crateColumns = 'id, type, status, length_cm, width_cm, height_cm, weight_kg, inventory_ids, contents_summary, description, parent_id, updated_at';
        const shipmentColumns = 'manifest_id, timestamp, status, metadata, payload';
        
        let crateQ = supabase.from('logistics').select(crateColumns);
        if (params.query) {
            crateQ = crateQ.or(`id.ilike.%${params.query}%,description.ilike.%${params.query}%,contents_summary.ilike.%${params.query}%,type.ilike.%${params.query}%,status.ilike.%${params.query}%`);
        }

        let shipQ = supabase.from('shipments').select(shipmentColumns);
        if (params.query) {
            shipQ = shipQ.or(`manifest_id.ilike.%${params.query}%,status.ilike.%${params.query}%`);
        }

        const [crateRes, shipRes] = await Promise.all([
            crateQ.limit(params.limit || 20),
            shipQ.limit(params.limit || 20)
        ]);

        return {
            crates: crateRes.data || [],
            shipments: shipRes.data || []
        };
    },

    /**
     * Search finance (expenses, payments, vendor commissions)
     */
    searchFinance: async (params: { query?: string, limit?: number }) => {
        const financeColumns = 'id, amount, commission, destination, status, date, type, category, description, related_ids, pay_date';
        
        let finQ = supabase.from('finance').select(financeColumns);
        if (params.query) {
            finQ = finQ.or(`description.ilike.%${params.query}%,destination.ilike.%${params.query}%,category.ilike.%${params.query}%,status.ilike.%${params.query}%,type.ilike.%${params.query}%`);
        }

        const { data, error } = await finQ.limit(params.limit || 50);
        return {
            expenses: data || [],
            error: error?.message
        };
    }
};
