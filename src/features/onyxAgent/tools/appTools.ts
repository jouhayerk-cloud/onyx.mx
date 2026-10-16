import {
    computeBoxesParams,
    formatBoxesCliCommand,
    CrateDimensions
} from '../../../lib/logistics/boxesBridge';
import { sanitizeFileBase } from '../../../lib/logistics/boxesCliBridge';

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
}
