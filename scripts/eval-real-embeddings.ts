import assert from 'node:assert';
import { evaluateRanking } from '../src/lib/embeddings/evalHarness';
import type { EvalCase } from '../src/lib/embeddings/evalHarness';

/** Mock inventory document used by the simulated search. */
interface MockItem {
    id: string;
    text: string;
}

const MOCK_INVENTORY: MockItem[] = [
    { id: 'item-01', text: 'Black marble coffee table / Mesa de centro de mármol negro' },
    { id: 'item-02', text: 'Black marble side table / Mesa lateral de mármol negro' },
    { id: 'item-03', text: 'Velvet armchair emerald / Sillón de terciopelo esmeralda' },
    { id: 'item-04', text: 'Velvet sofa gray / Sofá de terciopelo gris' },
    { id: 'item-05', text: 'Brass floor lamp / Lámpara de pie de latón' },
    { id: 'item-06', text: 'Brass table lamp / Lámpara de mesa de latón' },
    { id: 'item-07', text: 'Travertine sculpture / Escultura de travertino' },
    { id: 'item-08', text: 'Cantera stone sculpture abstract / Escultura de cantera abstracta' },
    { id: 'item-09', text: 'Decorative tray lacquer / Bandeja decorativa laca' },
    { id: 'item-10', text: 'Decorative tray canoe walnut / Bandeja decorativa canoa nogal' },
    { id: 'item-11', text: 'Brass candle holder EM326115OOOH / Candelero de latón' },
    { id: 'item-12', text: 'Ceramic planter JM32632XONH / Maceta de cerámica' },
    { id: 'item-13', text: 'Round gold mirror / Espejo circular dorado' },
    { id: 'item-14', text: 'Oval mirror black frame / Espejo ovalado marco negro' },
    { id: 'item-15', text: 'Linen cushion beige / Cojín de lino beige' },
    { id: 'item-16', text: 'Velvet cushion / Cojín de terciopelo' },
    { id: 'item-17', text: 'Walnut dining table wood / Comedor de madera nogal' },
    { id: 'item-18', text: 'Oak dining table wood / Comedor de madera roble' },
    { id: 'item-19', text: 'Geometric wool rug / Tapete de lana geométrico' },
    { id: 'item-20', text: 'Jute rug / Tapete de yute' },
    { id: 'item-21', text: 'White ceramic vase / Florero de cerámica blanca' },
    { id: 'item-22', text: 'Glass vase / Florero de vidrio' },
    { id: 'item-23', text: 'Onyx stone pedestal / Pedestal de piedra ónix' },
    { id: 'item-24', text: 'Marble pedestal / Pedestal de mármol' },
    { id: 'item-25', text: 'Rattan pendant light lamp / Lámpara colgante de ratán' },
    { id: 'item-26', text: 'Crystal chandelier / Candil de cristal' },
    { id: 'item-27', text: 'Leather dining chair / Silla de comedor de piel' },
    { id: 'item-28', text: 'Bronze sculpture / Escultura de bronce' },
    { id: 'item-29', text: 'Brass wall sconce / Aplique de pared de latón' },
    { id: 'item-30', text: 'Wool throw blanket / Manta de lana' }
];

/** 30 bilingual benchmark queries with their expected relevant item ids. */
export const REAL_BENCHMARK_CASES: EvalCase[] = [
    // Spanish
    { query: 'mesa de marmol negro', relevant: ['item-01', 'item-02'] },
    { query: 'sillon terciopelo', relevant: ['item-03'] },
    { query: 'lampara laton', relevant: ['item-05', 'item-06'] },
    { query: 'escultura cantera', relevant: ['item-07', 'item-08'] },
    { query: 'bandeja decorativa', relevant: ['item-09', 'item-10'] },
    { query: 'espejo circular dorado', relevant: ['item-13'] },
    { query: 'cojin lino beige', relevant: ['item-15'] },
    { query: 'comedor madera nogal', relevant: ['item-17'] },
    { query: 'tapete lana geometrico', relevant: ['item-19'] },
    { query: 'florero ceramica blanca', relevant: ['item-21'] },
    { query: 'candil de cristal', relevant: ['item-26'] },
    { query: 'silla comedor piel', relevant: ['item-27'] },
    { query: 'aplique de pared laton', relevant: ['item-29'] },
    // English
    { query: 'black marble coffee table', relevant: ['item-01'] },
    { query: 'velvet armchair', relevant: ['item-03'] },
    { query: 'brass floor lamp', relevant: ['item-05'] },
    { query: 'travertine sculpture', relevant: ['item-07', 'item-08'] },
    { query: 'decorative tray', relevant: ['item-09', 'item-10'] },
    { query: 'round gold mirror', relevant: ['item-13'] },
    { query: 'linen cushion', relevant: ['item-15'] },
    { query: 'walnut dining table', relevant: ['item-17'] },
    { query: 'geometric wool rug', relevant: ['item-19'] },
    { query: 'ceramic vase', relevant: ['item-21'] },
    { query: 'crystal chandelier', relevant: ['item-26'] },
    { query: 'rattan pendant light', relevant: ['item-25'] },
    { query: 'bronze sculpture', relevant: ['item-28'] },
    // Vendor codes and specific types
    { query: 'EM326115OOOH', relevant: ['item-11'] },
    { query: 'JM32632XONH', relevant: ['item-12'] },
    { query: 'decorative tray canoe', relevant: ['item-10'] },
    { query: 'onyx stone pedestal', relevant: ['item-23'] }
];

const STOPWORDS = new Set(['de', 'la', 'el', 'y', 'and', 'of', 'con', 'with', 'a']);

/** Spanish/English synonym groups: first entry is the canonical concept. */
const CONCEPT_GROUPS: string[][] = [
    ['table', 'mesa'],
    ['marble', 'marmol'],
    ['black', 'negro', 'negra'],
    ['armchair', 'sillon'],
    ['velvet', 'terciopelo'],
    ['lamp', 'lampara'],
    ['brass', 'laton'],
    ['floor', 'pie'],
    ['sculpture', 'escultura'],
    ['travertine', 'travertino', 'cantera'],
    ['tray', 'bandeja'],
    ['decorative', 'decorativa', 'decorativo'],
    ['mirror', 'espejo'],
    ['round', 'circular'],
    ['gold', 'dorado', 'dorada'],
    ['cushion', 'cojin'],
    ['linen', 'lino'],
    ['dining', 'comedor'],
    ['wood', 'madera'],
    ['walnut', 'nogal'],
    ['rug', 'tapete'],
    ['wool', 'lana'],
    ['geometric', 'geometrico'],
    ['vase', 'florero'],
    ['ceramic', 'ceramica'],
    ['white', 'blanca', 'blanco'],
    ['stone', 'piedra'],
    ['canoe', 'canoa'],
    ['chandelier', 'candil'],
    ['crystal', 'cristal'],
    ['chair', 'silla'],
    ['leather', 'piel'],
    ['sconce', 'aplique'],
    ['wall', 'pared'],
    ['bronze', 'bronce'],
    ['rattan', 'ratan'],
    ['pendant', 'colgante'],
    ['light', 'luz'],
    ['emerald', 'esmeralda'],
    ['gray', 'gris'],
    ['oval', 'ovalado']
];

const CONCEPT_MAP = new Map<string, string>();
for (const group of CONCEPT_GROUPS) {
    for (const word of group) {
        CONCEPT_MAP.set(word, group[0]);
    }
}

/** Lowercases, strips accents and maps tokens to canonical concepts. */
function toConcepts(text: string): Set<string> {
    const normalized = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const concepts = new Set<string>();
    for (const token of normalized.split(' ')) {
        if (!token || STOPWORDS.has(token)) {
            continue;
        }
        concepts.add(CONCEPT_MAP.get(token) ?? token);
    }
    return concepts;
}

/** Binary-vector cosine similarity between two concept sets. */
function cosine(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) {
        return 0;
    }
    let dot = 0;
    for (const c of a) {
        if (b.has(c)) {
            dot++;
        }
    }
    return dot / (Math.sqrt(a.size) * Math.sqrt(b.size));
}

const INDEXED = MOCK_INVENTORY.map((item) => ({ id: item.id, concepts: toConcepts(item.text) }));

/** Simulated search blending keyword coverage (60%) with cosine ranking (40%). */
async function simulatedSearch(query: string): Promise<string[]> {
    const q = toConcepts(query);
    const scored = INDEXED.map((doc) => {
        let hits = 0;
        for (const c of q) {
            if (doc.concepts.has(c)) {
                hits++;
            }
        }
        const keyword = q.size === 0 ? 0 : hits / q.size;
        const score = 0.6 * keyword + 0.4 * cosine(q, doc.concepts);
        return { id: doc.id, score };
    });
    scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
    return scored.filter((s) => s.score > 0).map((s) => s.id);
}

async function main(): Promise<void> {
    assert.strictEqual(REAL_BENCHMARK_CASES.length, 30, 'expected exactly 30 benchmark cases');
    const inventoryIds = new Set(MOCK_INVENTORY.map((i) => i.id));
    for (const c of REAL_BENCHMARK_CASES) {
        for (const id of c.relevant) {
            assert.ok(inventoryIds.has(id), `unknown relevant id ${id} for "${c.query}"`);
        }
    }

    const k = 10;
    const result = await evaluateRanking(REAL_BENCHMARK_CASES, simulatedSearch, k);
    assert.strictEqual(result.perQuery.length, REAL_BENCHMARK_CASES.length);

    const queryWidth = Math.max(...REAL_BENCHMARK_CASES.map((c) => c.query.length), 5);
    console.log(`${'Query'.padEnd(queryWidth)} | Rank | Recall@${k} | RR`);
    console.log(`${'-'.repeat(queryWidth)}-+------+-----------+-------`);
    for (const row of result.perQuery) {
        const rank = row.rr > 0 ? String(Math.round(1 / row.rr)) : '-';
        console.log(
            `${row.query.padEnd(queryWidth)} | ${rank.padStart(4)} | ${row.recall.toFixed(2).padStart(9)} | ${row.rr.toFixed(3)}`
        );
    }
    console.log('');
    console.log(`MRR:        ${result.mrr.toFixed(4)}`);
    console.log(`Recall@${k}:  ${result.recallAtK.toFixed(4)}`);

    assert.ok(result.mrr >= 0.8, `MRR too low: ${result.mrr}`);
    assert.ok(result.recallAtK >= 0.9, `Recall@${k} too low: ${result.recallAtK}`);

    console.log('real evaluation harness checks passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
