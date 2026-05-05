
/**
 * Onyx Business Rules & Schema Context
 * This module defines the "Business Intelligence" layer that grounds AI models 
 * in the specific context of the Jouhayerk Warehouse.
 */

export const ONYX_CONTEXT = {
    tables: {
        inventory: {
            description: "Physical items stored in the warehouse.",
            primary_identifiers: ["book_barcode (Tag ID)", "item_id"],
            virtual_columns: {
                vendor_id: "Derived from the first two characters of 'item_id' (e.g. 'EM' from 'EM-1234')."
            },
            key_columns: {
                status: "Current state: 'Warehouse' (In Stock), 'Inventory' (Historical Stock), 'Available' (Listed for sale), 'Sold' (Not in stock).",
                shape: "The physical form (e.g. Squared, Heart, Moon).",
                material: "The composition (e.g. Onyx, Amethyst, Marble).",
                color: "The specific hue (e.g. Tehuacan, Blanco, Cafe).",
                vendor_id: "The 2-letter source code (e.g. EM, GE, JM)."
            },
            rules: [
                "Always prioritize book_barcode when referring to an item's unique identity.",
                "Warehouse and Inventory statuses are the primary sources of truth for physical stock.",
                "Available status usually means the item is listed elsewhere and may not be in the physical warehouse.",
                "To search for a vendor, use a prefix match on 'item_id' (e.g. item_id ilike EM%)."
            ]
        },
        finance: {
            description: "Financial records of payments to vendors, shippers, and general expenses.",
            key_columns: {
                status: "'Paid' (Green), 'Requested' (Yellow), 'Partial' (Red).",
                category: "e.g. 'Vendor Payment', 'Logistics', 'Packing'.",
                destination: "Payment platform used (e.g. 'BBVA', 'HSBC', 'CASH').",
                related_ids: "A comma-separated list of inventory item IDs related to this payment."
            },
            rules: [
                "To see what an expense paid for, check 'related_ids'.",
                "A 'Requested' status means the payment has been generated but not yet confirmed as paid.",
                "Vendor payments are often grouped by the 2-letter vendor ID in the description."
            ]
        },
        logistics: {
            description: "Records of crates, pallets, and boxes used for packing.",
            key_columns: {
                status: "'Empty', 'Partial', 'Packed', 'In Transit'.",
                type: "'crate', 'pallet', 'cardboard'.",
                inventory_ids: "A comma-separated list of 'item_id:quantity' pairs inside this container.",
                parent_id: "If set, this container is nested inside another container (the parent ID)."
            },
            rules: [
                "Use 'inventory_ids' to see exactly which products are inside a crate.",
                "If a crate is 'In Transit', it means it has been dispatched on a truck."
            ]
        },
        shipments: {
            description: "Finalized manifests and truck load records.",
            key_columns: {
                manifest_id: "Unique identifier for the truck load.",
                status: "'Dispatched', 'Draft', 'Delivered'.",
                metadata: "JSON object containing 'sealNumber', 'tractorNumber', 'trailerNumber', and 'truckPlates'."
            },
            rules: [
                "Manifests link multiple crates together into a single truck dispatch.",
                "Use 'manifest_id' to retrieve the full digital twin of a truck load."
            ]
        }
    },
    vendor_mapping: {
        JM: { name: "JOSE MEZA", firstName: "Jose", color: "#6BCEBB", bio: "Specialist in high-polish marble" },
        EM: { name: "EMMANUEL DE LOS SANTOS", firstName: "Emmanuel", color: "#00AEEF", bio: "Specializes in lighting and large onyx pieces" },
        CA: { name: "CARLOS ARENAS", firstName: "Carlos", color: "#85C1E9", bio: "Logistics specialist" },
        AN: { name: "ANGEL CABRERA", firstName: "Angel", color: "#FFED00", bio: "Artisan carver" },
        SU: { name: "SUSANA", firstName: "Susana", color: "#B19CD9", bio: "Quality control" },
        TE: { name: "TELLEZ TALLER", firstName: "Tellez", color: "#FFCB05", bio: "Production workshop" },
        DH: { name: "DELFINO HERNANDEZ", firstName: "Delfino", color: "#8DC63F", bio: "Slab specialist" },
        ML: { name: "MARIA LUISA", firstName: "Maria", color: "#F9A17A", bio: "Finishing expert" },
        GE: { name: "GERARDO DE GANTE", firstName: "Gerardo", color: "#F7941D", bio: "Primary source for carved figures" },
        FR: { name: "FOUNTAIN ROCK", firstName: "Fountain", color: "#F36F21", bio: "Raw material supplier" },
        ET: { name: "EDUARDO TELLEZ", firstName: "Eduardo", color: "#636466", bio: "Design lead" },
        AM: { name: "ALEJANDRO MEZA", firstName: "Alejandro", color: "#800020", bio: "Stone selection" },
        BT: { name: "BERNARDO", firstName: "Bernardo", color: "#603913", bio: "Logistics support" },
        RF: { name: "ROBERTO FLORITA", firstName: "Roberto", color: "#00A591", bio: "Export specialist" },
        GS: { name: "GIFT STORE", firstName: "Gift", color: "#D11C7E", bio: "Retail channel" },
        CP: { name: "CANTERA PUEBLA", firstName: "Cantera", color: "#A01E5D", bio: "Quarry source" }
    }
};

export const getOnyxSystemGrounding = () => {
    const vendors = Object.entries(ONYX_CONTEXT.vendor_mapping)
        .map(([id, info]) => `${info.name} (${info.firstName}) = ID: ${id}`)
        .join(', ');

    return `
    WAREHOUSE CONTEXT:
    - Tag IDs: Always use 'book_barcode'.
    - Physical Stock: Statuses 'Warehouse' and 'Inventory'.
    - Logistics: 'logistics' table for crates (packed items) and 'shipments' for truck manifests.
    - Financials: 'finance' table tracks all payments (Status: Requested/Paid). 
    - Relations: 'logistics.inventory_ids' links items to crates. 'finance.related_ids' links items to payments.
    - UI Colors: RED=Partial, YELLOW=Requested, GREEN=Paid, BLUE=New.
    - VENDOR NAMES: ${vendors}. If a user mentions a name like 'Emmanuel', they mean vendor 'EM'.
    - IMPORTANT: 'Tehuacan', 'Nacar', 'Pearlecent', 'White', 'Blanco', 'Cafe' are COLORS. 'Onyx', 'Marble', 'Amethyst' are MATERIALS.
    - If a user asks for 'Tehuacan items', search for color='Tehuacan'.
    `;
};
