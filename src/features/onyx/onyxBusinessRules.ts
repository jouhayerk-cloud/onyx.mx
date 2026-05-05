
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
                vendor_id: "The 2-letter source code (e.g. EM, GE, JM)."
            },
            rules: [
                "Always prioritize book_barcode when referring to an item's unique identity.",
                "Warehouse and Inventory statuses are the primary sources of truth for physical stock.",
                "Available status usually means the item is listed elsewhere and may not be in the physical warehouse.",
                "To search for a vendor, use a prefix match on 'item_id' (e.g. item_id ilike EM%)."
            ]
        },
        expenses: {
            description: "Financial records of payments to vendors and shippers.",
            key_columns: {
                status: "'Paid', 'Partial', 'Requested'.",
                subcategory: "'prod' (Production), 'packing' (Logistics), 'acq' (Acquisition)."
            },
            rules: [
                "A 'Partial' status in expenses combined with a specific inventory item indicates a payment plan.",
                "Red status in the UI corresponds to Partial payments."
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
    - Financials: 'expenses' table tracks vendor payments. 
    - UI Colors: RED=Partial, YELLOW=Requested, GREEN=Paid, BLUE=New.
    - VENDOR NAMES: ${vendors}. If a user mentions a name like 'Emmanuel', they mean vendor 'EM'.
    `;
};
