
import { onyxQueries } from './onyxQueries';

export const onyxToolDefinitions = [
    {
        name: "search_inventory",
        description: "Search for items in the warehouse. Returns dimensions (H, W, L, Weight) and identifiers. Optimized for Tag IDs, shapes, and vendors.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search keyword, Tag ID, or Barcode" },
                vendor: { type: "string", description: "Vendor ID (e.g. EM, GE, JM)" },
                status: { type: "string", description: "Specific status to filter by" },
                shape: { type: "string", description: "Filter by shape (e.g. Squared, Heart)" },
                color: { type: "string", description: "Filter by color (e.g. Tehuacan, Black, Blanco)" },
                material: { type: "string", description: "Filter by material (e.g. Onyx, Marble, Amethyst)" },
                type: { type: "string", description: "Filter by item type" }
            }
        }
    },
    {
        name: "get_item_details",
        description: "Get comprehensive details for a specific item using its Tag ID (Barcode) or UUID.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "The Tag ID (e.g. EM-1234) or Barcode" }
            },
            required: ["id"]
        }
    },
    {
        name: "get_database_context",
        description: "Retrieves the current 'Knowledge State' of the database including valid Vendor IDs, Shapes, Materials, and Statuses. Use this to orient yourself before searching.",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "get_item_samples",
        description: "Fetches a small sample of raw inventory records. Use this to verify data formats, column names, and prefix patterns if your searches are failing.",
        parameters: {
            type: "object",
            properties: {
                limit: { type: "number", default: 5 }
            }
        }
    },
    {
        name: "get_inventory_summary",
        description: "Get aggregated counts of items grouped by a specific field (e.g. 'how many per vendor'). Only includes 'Inventory' items.",
        parameters: {
            type: "object",
            properties: {
                group_by: { type: "string", enum: ["vendor_id", "shape", "status", "material"] },
                query: { type: "string", description: "Optional filter keyword" },
                vendor: { type: "string", description: "Optional Vendor ID filter" }
            },
            required: ["group_by"]
        }
    },
    {
        name: "get_app_context",
        description: "Retrieves the core business rules, column meanings, and operational policies for the warehouse app. Use this if you are unsure how to interpret specific data points.",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "deploy_inventory_artifact",
        description: "Deploys a UI 'Artifact' to display specific items in a rich grid/gallery view.",
        parameters: {
            type: "object",
            properties: {
                item_ids: { type: "array", items: { type: "string" } },
                title: { type: "string" },
                viewMode: { type: "string", enum: ["modal", "sidebar", "embedded"] }
            },
            required: ["item_ids"]
        }
    },
    {
        name: "search_logistics",
        description: "Search for crates, pallets, manifests, and truck loads. Returns dimensions, statuses, and manifest summaries. Use this to find where items are packed or to track shipments.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Crate ID, Manifest ID, or keyword (e.g. 'In Transit', 'Packed')" },
                limit: { type: "number", default: 20 }
            }
        }
    },
    {
        name: "search_finance",
        description: "Search for payments, expenses, and vendor commissions. Returns amounts, statuses, and destinations. Use this for financial audits or payment status checks.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Expense description, destination, status, or category" },
                limit: { type: "number", default: 20 }
            }
        }
    }
];

export const onyxToolHandlers = {
    search_inventory: async (args: any) => {
        try {
            const result = await onyxQueries.searchInventory(args);
            
            // Core Barcode Generation Logic (Mirroring calculateCodesAndPrices in utils.tsx)
            const numberToCypher = (num: number) => {
                const key = 'DMOXHELFAN';
                return String(Math.floor(num)).split('').map(d => key[parseInt(d, 10)] || '').join('');
            };
            const onyxRound = (n: number) => (n - Math.floor(n) >= 0.4) ? Math.floor(n) + 1 : Math.floor(n);

            return {
                items: result.items.map(item => {
                    let barcode = item.book_barcode;
                    if (!barcode || barcode.includes('-')) {
                        try {
                            const exchangeRate = 17.0; // Standard fallback
                            const costMxn = item.price_mxn || 0;
                            const costUsd = costMxn / exchangeRate;
                            const landedCost = onyxRound(costUsd * 1.4);
                            const vendorPrefix = (item.item_id || '').split('-')[0] || '??';
                            const bookStr = (item.workbook || '326').toString().replace(/v/gi, '');
                            const itemNum = parseInt(item.item_number || '1', 10);
                            const cypher = numberToCypher(landedCost);
                            barcode = `${vendorPrefix}${bookStr}${itemNum}${cypher}`;
                        } catch (e) {
                            barcode = item.item_id || "No TAG ID";
                        }
                    }

                    return { 
                        id: item.id,
                        tag_id: barcode, 
                        shape: item.shape, 
                        material: item.material,
                        dimensions: {
                            h: item.height_cm,
                            w: item.width_cm,
                            l: item.length_cm,
                            weight: item.weight_kg
                        },
                        color: item.color,
                        description: item.generated_description || item.description, 
                        quantity: item.quantity,
                        status: item.status
                    };
                }),
                total_records: result.total_records,
                total_quantity: result.total_quantity
            };
        } catch (err: any) {
            return { error: err.message };
        }
    },
    get_item_details: async ({ id }: any) => {
        try {
            const item = await onyxQueries.getItemByAnyId(id);
            if (!item) return { error: "Item not found" };
            
            // Core Barcode Generation Logic (Mirroring calculateCodesAndPrices in utils.tsx)
            const numberToCypher = (num: number) => {
                const key = 'DMOXHELFAN';
                return String(Math.floor(num)).split('').map(d => key[parseInt(d, 10)] || '').join('');
            };
            const onyxRound = (n: number) => (n - Math.floor(n) >= 0.4) ? Math.floor(n) + 1 : Math.floor(n);

            let barcode = item.book_barcode;
            if (!barcode || barcode.includes('-')) {
                try {
                    const exchangeRate = 17.0; 
                    const costMxn = item.price_mxn || 0;
                    const costUsd = costMxn / exchangeRate;
                    const landedCost = onyxRound(costUsd * 1.4);
                    const vendorPrefix = (item.item_id || '').split('-')[0] || '??';
                    const bookStr = (item.workbook || '326').toString().replace(/v/gi, '');
                    const itemNum = parseInt(item.item_number || '1', 10);
                    const cypher = numberToCypher(landedCost);
                    barcode = `${vendorPrefix}${bookStr}${itemNum}${cypher}`;
                } catch (e) {
                    barcode = item.item_id || "No TAG ID";
                }
            }

            return {
                tag_id: barcode,
                display_title: item.generated_description || item.short_description || item.description,
                specs: {
                    shape: item.shape,
                    material: item.material,
                    dimensions: `${item.length_cm || '?'}x${item.width_cm || '?'}x${item.height_cm || '?'} cm`,
                    weight: item.weight_kg ? `${item.weight_kg} kg` : "Not recorded"
                },
                financials: {
                    price_mxn: item.price_mxn,
                    status: item.status
                },
                visuals: {
                    image_urls: item.generated_image_urls || item.media_urls,
                    ai_description: item.generated_description
                }
            };
        } catch (err: any) {
            return { error: err.message };
        }
    },
    get_database_context: async () => {
        try {
            return await onyxQueries.getDatabaseContext();
        } catch (err: any) {
            return { error: err.message };
        }
    },
    get_inventory_summary: async ({ group_by, query, vendor }: any) => {
        try {
            const result = await onyxQueries.getAggregatedSummary(group_by, vendor, query);
            return result;
        } catch (err: any) {
            return { error: err.message };
        }
    },
    get_app_context: async () => {
        try {
            const { ONYX_CONTEXT } = await import('./onyxBusinessRules');
            return ONYX_CONTEXT;
        } catch (err: any) {
            return { error: err.message };
        }
    },
    get_item_samples: async ({ limit }: any) => {
        try {
            const { data, error } = await supabase.from('inventory').select('*').limit(limit || 5);
            if (error) return { error: error.message };
            return data;
        } catch (err: any) {
            return { error: err.message };
        }
    },
    deploy_inventory_artifact: async ({ item_ids, title, viewMode }: any) => {
        return { action: "DEPLOY_INVENTORY", ids: item_ids, title, viewMode };
    },
    search_logistics: async (args: any) => {
        try {
            return await onyxQueries.searchLogistics(args);
        } catch (err: any) {
            return { error: err.message };
        }
    },
    search_finance: async (args: any) => {
        try {
            return await onyxQueries.searchFinance(args);
        } catch (err: any) {
            return { error: err.message };
        }
    }
};
