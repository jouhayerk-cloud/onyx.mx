import {
    computeBoxesParams,
    formatBoxesCliCommand,
    CrateDimensions
} from '../../../lib/logistics/boxesBridge';
import { sanitizeFileBase } from '../../../lib/logistics/boxesCliBridge';
import { getDefaultStore } from 'jotai';
import {
    activeViewAtom,
    inventorySearchTermAtom,
    TOP_BAR_SEARCH_ATOM,
    inventoryStatusFilterAtom,
    inventoryVendorFilterAtom,
    inventoryCategoryFilterAtom,
    inventoryMaterialFilterAtom,
    inventoryMaterialColorFilterAtom,
    inventoryShapeFilterAtom,
    inventoryContentFilterAtom,
    SelectedItemRowAtom,
    isDetailsPanelOpenAtom,
    selectedInventoryIdsAtom,
    isInventorySelectionModeAtom,
    type UserRole,
    type InventoryStatusFilter
} from '../../../lib/atoms';
import { tr } from '../../../lib/i18n';

/**
 * REQUIRED JOTAI WIRING:
 * The caller must wire the following to AppToolContext:
 * - getActiveView: read from `activeViewAtom` (src/lib/atoms.tsx)
 * - setActiveView: write to `activeViewAtom` (src/lib/atoms.tsx)
 * - openItem: write to `inventoryArtifactConfigAtom` to open the modal (src/lib/atoms.tsx)
 * - setInventorySearch: write to `inventorySearchTermAtom` or `TOP_BAR_SEARCH_ATOM` (src/lib/atoms.tsx)
 */

export type AppRole = UserRole | 'Client';

export type AppToolContext = {
    role: AppRole;
    getActiveView: () => string;
    setActiveView: (view: string) => void;
    openItem?: (itemId: string) => void;
    setInventorySearch?: (text: string) => void;
    setInventoryFilter?: (facet: string, value: string | string[]) => void;
    clearFilters?: (scope?: 'all' | 'search' | 'facets') => void;
    highlightItems?: (itemIds: string[]) => void;
};

export type UiToolDefinitions = {
    navigate_view: { view: 'inventory' | 'finance' | 'logistics' | 'warehouse' | 'trucking' | 'packing' };
    set_inventory_filter: {
        facet: 'status' | 'vendor' | 'category' | 'materialColor' | 'shape' | 'search';
        value: string | string[];
    };
    clear_filters: { scope?: 'all' | 'search' | 'facets' };
    open_item: { item_id: string };
    highlight_items: { item_ids: string[] };
};

export const VIEW_ACCESS: Record<AppRole, readonly string[]> = {
    Developer: [
        'inventory', 'logistics', 'warehouse', 'trucking', 'packing',
        'finance', 'upload', 'control', 'dashboard', 'overview',
        'workbook', 'store', 'process', 'viewer', 'welcome',
        'onyx', 'pico-bridge', 'onyx-reg', 'devices', 'threed'
    ],
    Admin: [
        'inventory', 'logistics', 'warehouse', 'trucking', 'packing',
        'finance', 'upload', 'control', 'dashboard', 'overview',
        'workbook', 'store', 'process', 'viewer', 'welcome',
        'onyx', 'pico-bridge', 'onyx-reg', 'devices', 'threed'
    ],
    ClientBoss: ['inventory', 'viewer'],
    ClientAccounting: ['inventory', 'viewer'],
    ClientViewer: ['inventory', 'viewer'],
    Vendor: ['inventory', 'viewer'],
    Client: ['inventory', 'viewer']
};

export const appToolDefinitions = [
    {
        name: "navigate_view",
        description: "Navigates the user to a specific view in the app. Call get_current_view first when unsure of the current context.",
        parameters: {
            type: "OBJECT",
            properties: {
                view: {
                    type: "STRING",
                    description: "The view ID to navigate to ('inventory', 'finance', 'logistics', 'warehouse', 'trucking', 'packing', etc.)."
                }
            },
            required: ["view"]
        }
    },
    {
        name: "navigate_to_view",
        description: "Navigates the user to a specific view in the app. Call get_current_view first when unsure of the current context.",
        parameters: {
            type: "OBJECT",
            properties: {
                view: {
                    type: "STRING",
                    description: "The view ID to navigate to."
                }
            },
            required: ["view"]
        }
    },
    {
        name: "get_current_view",
        description: "Retrieves the currently active view ID in the app. Use this to understand where the user currently is.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "open_item",
        description: "Opens the details panel for a specific inventory item. Call get_current_view first when unsure.",
        parameters: {
            type: "OBJECT",
            properties: {
                item_id: {
                    type: "STRING",
                    description: "The ID of the item to open (max 64 chars, letters, digits, dash, underscore only)."
                }
            },
            required: ["item_id"]
        }
    },
    {
        name: "search_in_app",
        description: "Navigates to the inventory view and performs a search. Call get_current_view first when unsure.",
        parameters: {
            type: "OBJECT",
            properties: {
                text: {
                    type: "STRING",
                    description: "The text to search for (max 80 chars)."
                }
            },
            required: ["text"]
        }
    },
    {
        name: "set_inventory_filter",
        description: "Sets an inventory facet filter ('status', 'vendor', 'category', 'materialColor', 'shape', or 'search').",
        parameters: {
            type: "OBJECT",
            properties: {
                facet: {
                    type: "STRING",
                    description: "The facet to filter: 'status', 'vendor', 'category', 'materialColor', 'shape', or 'search'."
                },
                value: {
                    type: "STRING",
                    description: "The filter value or comma-separated list of values."
                }
            },
            required: ["facet", "value"]
        }
    },
    {
        name: "clear_filters",
        description: "Clears active inventory filters (optionally scoped to 'all', 'search', or 'facets').",
        parameters: {
            type: "OBJECT",
            properties: {
                scope: {
                    type: "STRING",
                    description: "Filter scope to clear: 'all', 'search', or 'facets' (default: 'all')."
                }
            }
        }
    },
    {
        name: "highlight_items",
        description: "Highlights and selects specific inventory items by their IDs.",
        parameters: {
            type: "OBJECT",
            properties: {
                item_ids: {
                    type: "ARRAY",
                    items: {
                        type: "STRING"
                    },
                    description: "Array of item IDs to highlight and select."
                }
            },
            required: ["item_ids"]
        }
    },
    {
        name: "generate_crate_cutfile",
        description: "Looks up a warehouse crate by id and prepares its laser stencil from the crate's real dimensions. Returns the dimensions, the material settings and a Boxes.py CLI recipe; the card draws the approximate SVG itself, no SVG is returned. When called, include the cutfile JSON block in your answer so Chan renders the interactive LaserCutfileCard.",
        parameters: {
            type: "OBJECT",
            properties: {
                crate_id: {
                    type: "STRING",
                    description: "The id of the crate (letters, digits, '_' and '-', up to 64 characters)."
                },
                material_thickness_mm: {
                    type: "NUMBER",
                    description: "Material thickness in mm (default: 6)."
                },
                burn_mm: {
                    type: "NUMBER",
                    description: "Laser kerf burn offset in mm (default: 0.1)."
                },
                output_format: {
                    type: "STRING",
                    description: "Output format: 'svg', 'lbrn2', or 'cli_recipe'."
                }
            },
            required: ["crate_id"]
        }
    }
];

export const appToolRisk: Record<string, 'read' | 'navigate' | 'robot' | 'write'> = {
    navigate_to_view: 'navigate',
    navigate_view: 'navigate',
    get_current_view: 'read',
    open_item: 'navigate',
    search_in_app: 'navigate',
    set_inventory_filter: 'navigate',
    clear_filters: 'navigate',
    highlight_items: 'navigate',
    generate_crate_cutfile: 'read'
};

export const appToolConfirm: Record<string, boolean> = {
    navigate_to_view: false,
    navigate_view: false,
    open_item: false,
    highlight_items: false
};

export function createAppToolHandlers(ctx: AppToolContext): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
        navigate_view: async (args) => {
            const view = typeof args.view === 'string' ? args.view.trim() : '';
            if (!view) {
                return { ok: false, error: tr('Invalid or missing view argument.') };
            }
            
            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (!allowedViews.includes(view)) {
                return { ok: false, error: tr('not allowed') };
            }

            ctx.setActiveView(view);
            try {
                const store = getDefaultStore();
                store.set(activeViewAtom, view as any);
            } catch {
                // Ignore store error
            }
            return { ok: true, navigatedTo: view };
        },

        navigate_to_view: async (args) => {
            return handlers.navigate_view(args);
        },

        get_current_view: async () => {
            const view = ctx.getActiveView();
            return { ok: true, currentView: view };
        },

        open_item: async (args) => {
            const itemId = typeof args.item_id === 'string' ? args.item_id.trim() : '';
            if (!itemId) {
                return { ok: false, error: tr('Invalid or missing item_id argument.') };
            }
            
            if (itemId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(itemId)) {
                return { ok: false, error: tr('Invalid item_id format or length.') };
            }

            try {
                const store = getDefaultStore();
                store.set(SelectedItemRowAtom, itemId);
                store.set(isDetailsPanelOpenAtom, true);
            } catch {
                // Ignore store error
            }

            if (ctx.openItem) {
                ctx.openItem(itemId);
            } else {
                const allowedViews = VIEW_ACCESS[ctx.role] || [];
                if (allowedViews.includes('inventory')) {
                    ctx.setActiveView('inventory');
                }
                if (ctx.setInventorySearch) {
                    ctx.setInventorySearch(itemId);
                }
            }
            return { ok: true, openedItem: itemId };
        },

        search_in_app: async (args) => {
            const text = typeof args.text === 'string' ? args.text : '';
            if (!text) {
                return { ok: false, error: tr('Invalid or missing text argument.') };
            }
            
            if (text.length > 80) {
                return { ok: false, error: tr('Search text exceeds maximum length of 80 characters.') };
            }

            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (allowedViews.includes('inventory')) {
                ctx.setActiveView('inventory');
            }
            
            if (ctx.setInventorySearch) {
                ctx.setInventorySearch(text);
            }
            try {
                const store = getDefaultStore();
                store.set(inventorySearchTermAtom, text);
                store.set(TOP_BAR_SEARCH_ATOM, text);
            } catch {
                // Ignore store error
            }
            return { ok: true, searchedFor: text };
        },

        set_inventory_filter: async (args) => {
            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (!allowedViews.includes('inventory')) {
                return { ok: false, error: tr('not allowed') };
            }

            const facet = typeof args.facet === 'string' ? args.facet.trim() : '';
            if (!facet) {
                return { ok: false, error: tr('Invalid or missing facet argument.') };
            }

            const rawVal = args.value;
            const singleVal = typeof rawVal === 'string' ? rawVal.trim() : Array.isArray(rawVal) && rawVal.length > 0 ? String(rawVal[0]).trim() : '';
            const arrayVal = Array.isArray(rawVal)
                ? rawVal.map(String).map(s => s.trim()).filter(Boolean)
                : typeof rawVal === 'string' && rawVal.includes(',')
                ? rawVal.split(',').map(s => s.trim()).filter(Boolean)
                : singleVal ? [singleVal] : [];

            if (ctx.setInventoryFilter) {
                ctx.setInventoryFilter(facet, Array.isArray(rawVal) ? arrayVal : singleVal);
            }

            try {
                const store = getDefaultStore();
                switch (facet) {
                    case 'search':
                        store.set(inventorySearchTermAtom, singleVal);
                        store.set(TOP_BAR_SEARCH_ATOM, singleVal);
                        ctx.setInventorySearch?.(singleVal);
                        break;
                    case 'status':
                        store.set(inventoryStatusFilterAtom, (singleVal || 'All') as InventoryStatusFilter);
                        break;
                    case 'vendor':
                        store.set(inventoryVendorFilterAtom, arrayVal.length > 0 ? arrayVal : ['All']);
                        break;
                    case 'category':
                        store.set(inventoryCategoryFilterAtom, singleVal || 'All');
                        break;
                    case 'materialColor':
                        store.set(inventoryMaterialColorFilterAtom, arrayVal);
                        break;
                    case 'shape':
                        store.set(inventoryShapeFilterAtom, arrayVal);
                        break;
                    default:
                        return { ok: false, error: tr('Invalid facet argument.') };
                }
            } catch {
                // Ignore store error
            }

            return { ok: true, facet, value: rawVal };
        },

        clear_filters: async (args) => {
            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (!allowedViews.includes('inventory')) {
                return { ok: false, error: tr('not allowed') };
            }

            const rawScope = typeof args.scope === 'string' ? args.scope.trim().toLowerCase() : 'all';
            const scope = (rawScope === 'search' || rawScope === 'facets') ? rawScope : 'all';

            if (ctx.clearFilters) {
                ctx.clearFilters(scope);
            }

            try {
                const store = getDefaultStore();
                if (scope === 'all' || scope === 'search') {
                    store.set(inventorySearchTermAtom, '');
                    store.set(TOP_BAR_SEARCH_ATOM, '');
                    ctx.setInventorySearch?.('');
                }
                if (scope === 'all' || scope === 'facets') {
                    store.set(inventoryStatusFilterAtom, 'All');
                    store.set(inventoryVendorFilterAtom, ['All']);
                    store.set(inventoryCategoryFilterAtom, 'All');
                    store.set(inventoryMaterialFilterAtom, 'All');
                    store.set(inventoryMaterialColorFilterAtom, []);
                    store.set(inventoryShapeFilterAtom, []);
                    store.set(inventoryContentFilterAtom, []);
                }
            } catch {
                // Ignore store error
            }

            return { ok: true, cleared: scope };
        },

        highlight_items: async (args) => {
            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (!allowedViews.includes('inventory')) {
                return { ok: false, error: tr('not allowed') };
            }

            const rawIds = args.item_ids;
            const ids: string[] = Array.isArray(rawIds)
                ? rawIds.map(String).map(s => s.trim()).filter(Boolean)
                : typeof rawIds === 'string'
                ? rawIds.split(',').map(s => s.trim()).filter(Boolean)
                : [];

            if (ids.length === 0) {
                return { ok: false, error: tr('Invalid or missing item_ids argument.') };
            }

            if (ctx.highlightItems) {
                ctx.highlightItems(ids);
            }

            try {
                const store = getDefaultStore();
                store.set(selectedInventoryIdsAtom, ids);
                store.set(isInventorySelectionModeAtom, true);
            } catch {
                // Ignore store error
            }

            return { ok: true, highlightedCount: ids.length, itemIds: ids };
        },

        generate_crate_cutfile: async (args) => {
            // Same gate as navigating to the logistics module: crate sizes are not for vendor / client roles.
            if (!(VIEW_ACCESS[ctx.role] || []).includes('logistics')) {
                return { ok: false, error: 'not allowed' };
            }

            const crateId = typeof args.crate_id === 'string' ? args.crate_id.trim() : '';
            if (!crateId) {
                return { ok: false, error: 'Invalid or missing crate_id argument.' };
            }
            if (crateId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(crateId)) {
                return { ok: false, error: 'Invalid crate_id format or length.' };
            }

            const clamp = (value: unknown, fallback: number, min: number, max: number) => {
                const n = typeof value === 'number' ? value : Number.NaN;
                return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
            };
            const materialThickness = clamp(args.material_thickness_mm, 6, 0.5, 50);
            const burn = clamp(args.burn_mm, 0.1, 0, 2);
            const outputFormat = args.output_format === 'lbrn2' ? 'lbrn2' : 'svg';

            // The stencil is for THIS crate: read its real size from the local database.
            let row: { width_cm?: unknown; length_cm?: unknown; height_cm?: unknown } | null = null;
            try {
                const { getDatabase } = await import('../../../lib/database');
                const db: any = await getDatabase();
                const doc = await db.logistics.findOne({ selector: { id: crateId } }).exec();
                row = doc ? (typeof doc.toJSON === 'function' ? doc.toJSON() : doc) : null;
            } catch {
                return { ok: false, error: 'The crate database is not available right now.' };
            }
            if (!row) {
                return { ok: false, error: `No crate with id ${crateId} was found.` };
            }
            const widthCm = Number(row.width_cm);
            const lengthCm = Number(row.length_cm);
            const heightCm = Number(row.height_cm);
            if (![widthCm, lengthCm, heightCm].every(n => Number.isFinite(n) && n > 0)) {
                return { ok: false, error: `Crate ${crateId} has no complete dimensions, so no stencil can be drawn.` };
            }

            const crateDims: CrateDimensions = {
                widthCm,
                lengthCm,
                heightCm,
                thicknessMm: materialThickness,
                burnMm: burn
            };

            const params = computeBoxesParams(crateDims);
            const fileBase = sanitizeFileBase(crateId);
            const cliCommand = formatBoxesCliCommand(
                outputFormat === 'lbrn2' ? { ...params, extraArgs: { format: 'lbrn2' } } : params,
                `${fileBase}_cutfile.${outputFormat}`
            );

            // No SVG in the result: it would only bloat the model context, and the card must never render
            // markup that passed through the model. The card draws the approximate SVG from these numbers.
            const cutfileData = {
                ok: true,
                crateId,
                generator: params.generator,
                dimensionsMm: { x: params.x, y: params.y, h: params.h },
                materialThicknessMm: materialThickness,
                burnMm: burn,
                cliCommand
            };

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('onyx:cutfile-generated', { detail: cutfileData }));
            }

            return {
                ...cutfileData,
                cutfileData
            };
        }
    };
    return handlers;
}
