import {
    computeBoxesParams,
    formatBoxesCliCommand,
    generateProceduralCrateSvg,
    CrateDimensions
} from '../../../lib/logistics/boxesBridge';
import { getBoxesCliRecipe } from '../../../lib/logistics/boxesCliBridge';

/**
 * REQUIRED JOTAI WIRING:
 * The caller must wire the following to AppToolContext:
 * - getActiveView: read from `activeViewAtom` (src/lib/atoms.tsx)
 * - setActiveView: write to `activeViewAtom` (src/lib/atoms.tsx)
 * - openItem: write to `inventoryArtifactConfigAtom` to open the modal (src/lib/atoms.tsx)
 * - setInventorySearch: write to `inventorySearchTermAtom` or `TOP_BAR_SEARCH_ATOM` (src/lib/atoms.tsx)
 */

export type AppRole = 'Developer' | 'Admin' | 'Vendor' | 'Client';

export type AppToolContext = {
    role: AppRole;
    getActiveView: () => string;
    setActiveView: (view: string) => void;
    openItem?: (itemId: string) => void;
    setInventorySearch?: (text: string) => void;
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
    Vendor: ['inventory', 'viewer'],
    Client: ['inventory', 'viewer']
};

export const appToolDefinitions = [
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
        name: "generate_crate_cutfile",
        description: "Generates laser cut box/crate stencils or divider cutfiles (Boxes.py standard) for a given crate and its packed items. Returns cut dimensions, SVG stencil data, and CLI recipe. When called, include the cutfile JSON block in your answer so Chan renders the interactive LaserCutfileCard.",
        parameters: {
            type: "OBJECT",
            properties: {
                crate_id: {
                    type: "STRING",
                    description: "The ID or display name of the crate to generate cutfiles for."
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
    get_current_view: 'read',
    open_item: 'navigate',
    search_in_app: 'navigate',
    generate_crate_cutfile: 'read'
};

export function createAppToolHandlers(ctx: AppToolContext): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
    return {
        navigate_to_view: async (args) => {
            const view = typeof args.view === 'string' ? args.view : '';
            if (!view) {
                return { ok: false, error: 'Invalid or missing view argument.' };
            }
            
            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (!allowedViews.includes(view)) {
                return { ok: false, error: 'not allowed' };
            }

            ctx.setActiveView(view);
            return { ok: true, navigatedTo: view };
        },

        get_current_view: async () => {
            const view = ctx.getActiveView();
            return { ok: true, currentView: view };
        },

        open_item: async (args) => {
            const itemId = typeof args.item_id === 'string' ? args.item_id : '';
            if (!itemId) {
                return { ok: false, error: 'Invalid or missing item_id argument.' };
            }
            
            if (itemId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(itemId)) {
                return { ok: false, error: 'Invalid item_id format or length.' };
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
                return { ok: false, error: 'Invalid or missing text argument.' };
            }
            
            if (text.length > 80) {
                return { ok: false, error: 'Search text exceeds maximum length of 80 characters.' };
            }

            const allowedViews = VIEW_ACCESS[ctx.role] || [];
            if (allowedViews.includes('inventory')) {
                ctx.setActiveView('inventory');
            }
            
            if (ctx.setInventorySearch) {
                ctx.setInventorySearch(text);
            }
            return { ok: true, searchedFor: text };
        },

        generate_crate_cutfile: async (args) => {
            const crateId = typeof args.crate_id === 'string' ? args.crate_id : '';
            if (!crateId) {
                return { ok: false, error: 'Invalid or missing crate_id argument.' };
            }

            const materialThickness = typeof args.material_thickness_mm === 'number' ? args.material_thickness_mm : 6;
            const burn = typeof args.burn_mm === 'number' ? args.burn_mm : 0.1;
            const outputFormat = typeof args.output_format === 'string' ? args.output_format : 'svg';

            const crateDims: CrateDimensions = {
                widthCm: 60,
                lengthCm: 60,
                heightCm: 40,
                thicknessMm: materialThickness,
                burnMm: burn
            };

            const params = computeBoxesParams(crateDims);
            const cliCommand = formatBoxesCliCommand(params, `${crateId}_cutfile.${outputFormat === 'lbrn2' ? 'lbrn2' : 'svg'}`);
            const svg = generateProceduralCrateSvg(crateDims);

            const cutfileData = {
                ok: true,
                crateId,
                generator: params.generator,
                dimensionsMm: { x: params.x, y: params.y, h: params.h },
                materialThicknessMm: materialThickness,
                burnMm: burn,
                cliCommand,
                sampleSvgSnippet: svg.slice(0, 300),
                fullSvg: svg
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
}
