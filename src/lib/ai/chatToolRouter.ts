import { LAYA_BASE_URL, LAYA_MODEL } from './providers/laya';

/**
 * Laya picks which Chan tools a Colibri chat turn gets, so the local model reads a few tool schemas instead of all
 * of them. Laya answers one `choice` question in under a second; the core tools are always sent, and every group
 * Laya scores at MIN_GROUP_PROBABILITY or more adds its tools. Null when Laya is down or slow: the caller sends
 * its full set.
 */

const ROUTER_TIMEOUT_MS = 1500;
const MIN_GROUP_PROBABILITY = 0.15;

export const CORE_CHAT_TOOLS = ['navigate_to_view', 'get_current_view', 'search_in_app', 'set_inventory_filter', 'clear_filters', 'open_item'];

const GROUPS: Record<string, { criteria: string; tools: string[] }> = {
    navigate: { criteria: 'open a screen or view of the app, go to a page / abrir vista, ir a pantalla', tools: ['navigate_to_view', 'navigate_view', 'get_current_view', 'get_app_context', 'get_ui_snapshot'] },
    search: { criteria: 'find or search items or products like lamps, sinks, tables by words or colour / buscar lamparas, mesas, piezas', tools: ['search_in_app', 'search_inventory', 'highlight_items', 'deploy_inventory_artifact'] },
    filter: { criteria: 'filter, clear or reset the list by vendor, status, book, type / filtrar por vendedor, quitar filtros', tools: ['set_inventory_filter', 'clear_filters'] },
    item: { criteria: 'photos, details or samples of one specific item or tag id like EM8261MLX / fotos de una pieza', tools: ['open_item', 'get_item_details', 'get_item_samples'] },
    summary: { criteria: 'counts, totals, how many items, inventory summary or statistics', tools: ['get_inventory_summary', 'get_database_context'] },
    finance: { criteria: 'payments, invoices, money, transactions, paid or unpaid', tools: ['search_finance'] },
    logistics: { criteria: 'crates, containers, shipments, trucks, crate cut files / cajas, contenedores, envios', tools: ['search_logistics', 'generate_crate_cutfile'] },
    island: { criteria: 'the island panel: island tools, pinned tools, island surfaces', tools: ['list_island_tools', 'run_island_tool', 'open_island_surface', 'set_pinned_tool', 'show_toast'] },
    chat: { criteria: 'greeting or general question with no app action', tools: [] },
};

const cache = new Map<string, Set<string>>();

/** Tool names for this message, or null when Laya could not answer in time. */
export async function routeChatTools(message: string): Promise<Set<string> | null> {
    const text = message.trim().slice(0, 1000);
    if (!text) return null;
    const hit = cache.get(text);
    if (hit) return hit;
    const criteria = Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.criteria]));
    try {
        const res = await fetch(`${LAYA_BASE_URL}/v1/systemone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LAYA_MODEL,
                state: text,
                questions: { group: { type: 'choice', instructions: 'Which kind of app action does this chat message need?', criteria } },
            }),
            signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const probs: Record<string, number> = (await res.json())?.answers?.group?.probabilities ?? {};
        const picked = new Set(CORE_CHAT_TOOLS);
        for (const [group, p] of Object.entries(probs)) {
            if (p >= MIN_GROUP_PROBABILITY) GROUPS[group]?.tools.forEach(t => picked.add(t));
        }
        if (cache.size > 200) cache.clear();
        cache.set(text, picked);
        return picked;
    } catch {
        return null;
    }
}
