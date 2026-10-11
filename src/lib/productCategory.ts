/**
 * Shopify product category and type from the words of an item.
 *
 * Pure module (no app imports) so it can be tested alone. Two rules keep it honest:
 *  1. Words are matched WHOLE. The old rules used substring search, so "tina" (Spanish for bathtub) matched
 *     inside "Blue Argentina" and every Blue Argentina bowl was exported as Hardware > Plumbing > Bathtubs.
 *  2. The Type the staff typed decides first (it is the ground truth), then the type the model chose, then the Shape.
 *     The title and the description are free text and only decide when nothing else matched.
 */

export interface CategoryAndType {
    category: string;
    type: string;
}

/** Lowercase, accents removed, single spaces: the form every rule is matched against. */
export const foldText = (value: unknown): string =>
    String(value ?? '')
        .normalize('NFD')
        .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const wordPatterns = new Map<string, RegExp>();

/** True when `word` (or its plural) is a whole word or phrase of the folded text: "tina" is not found in "argentina". */
export function hasWord(folded: string, word: string): boolean {
    let re = wordPatterns.get(word);
    if (!re) {
        re = new RegExp('(^|[^a-z0-9])' + word + '(s|es)?($|[^a-z0-9])');
        wordPatterns.set(word, re);
    }
    return re.test(folded);
}

interface CategoryRule {
    words: readonly string[];
    result: CategoryAndType;
}

/** In priority order: the first rule with a matching word wins. */
const CATEGORY_RULES: readonly CategoryRule[] = [
    { words: ['wine rack'], result: { category: 'Furniture > Cabinets & Storage > Wine Racks', type: 'Home Decor > Wine Racks' } },
    { words: ['bathtub', 'bath tub', 'tina'], result: { category: 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs', type: 'Bathtubs' } },
    { words: ['sink', 'washbasin', 'lavabo'], result: { category: 'Hardware > Plumbing > Plumbing Fixtures > Sinks', type: 'Home Decor > Sinks' } },
    { words: ['sculpture', 'statue', 'animal', 'figura'], result: { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Sculptures' } },
    { words: ['bowl', 'tazon'], result: { category: 'Home & Garden > Decor > Decorative Bowls', type: 'Home Decor > Decorative Bowls' } },
    { words: ['plate', 'plato'], result: { category: 'Home & Garden > Decor > Decorative Plates', type: 'Home Decor > Decorative Plates' } },
    { words: ['tray', 'charola'], result: { category: 'Home & Garden > Decor > Decorative Trays', type: 'Home Decor > Decorative Trays' } },
    { words: ['fountain', 'cascada', 'fuente'], result: { category: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains', type: 'Outdoor Decor > Fountains' } },
    { words: ['mirror', 'espejo'], result: { category: 'Home & Garden > Decor > Mirrors', type: 'Home Decor > Mirrors' } },
    { words: ['coaster', 'portavaso'], result: { category: 'Home & Garden > Kitchen & Dining > Barware > Coasters', type: 'Home Decor > Coasters' } },
    { words: ['shot glass', 'tequilero'], result: { category: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses', type: 'Home Decor > Sculptures' } },
    { words: ['desk lamp', 'table lamp'], result: { category: 'Home & Garden > Lighting > Lamps > Desk Lamps', type: 'Home Decor > Table Lamps' } },
    { words: ['floor lamp', 'tower lamp'], result: { category: 'Home & Garden > Lighting > Lamps > Floor Lamps', type: 'Home Decor > Floor Lamps' } },
    { words: ['pendant', 'hanging', 'colgante'], result: { category: 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures', type: 'Home Decor > Pendant Lights' } },
    { words: ['wall light', 'sconce'], result: { category: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures', type: 'Home Decor > Pendant Lights' } },
    { words: ['lamp'], result: { category: 'Home & Garden > Lighting > Lamps > Desk Lamps', type: 'Home Decor > Table Lamps' } },
    { words: ['wall panel', 'panel'], result: { category: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures', type: 'Home Decor > Wall Panels' } },
    { words: ['wine stopper'], result: { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Barware > Wine Stoppers' } },
    { words: ['chess', 'board', 'ajedrez'], result: { category: 'Toys & Games > Games > Board Games', type: 'Board Games > Chess Sets' } },
    { words: ['candle', 'vela'], result: { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Candleholders' } },
    { words: ['vase', 'florero'], result: { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Vases' } },
    { words: ['table', 'mesa', 'stand', 'pedestal'], result: { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Tables' } },
];

const DEFAULT_RESULT: CategoryAndType = { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Sculptures' };

function matchRules(folded: string): CategoryAndType | null {
    if (!folded) return null;
    for (const rule of CATEGORY_RULES) {
        if (rule.words.some(w => hasWord(folded, w))) return rule.result;
    }
    return null;
}

/**
 * Category and type for an item. The fields are read in this order, each on its own: shortDescription (the Type the staff
 * typed), type (the type the model chose), shape, and only then description (free text, often the generated title).
 */
export function getProductCategoryAndType(item: any): CategoryAndType {
    const decisive = [item?.shortDescription, item?.short_description, item?.type, item?.shape];
    for (const field of decisive) {
        const hit = matchRules(foldText(field));
        if (hit) return { ...hit };
    }
    return { ...(matchRules(foldText(item?.description)) ?? DEFAULT_RESULT) };
}
