/**
 * Canonical Inventory Taxonomy for Onyx.mx.
 *
 * Provides a single source of truth for physical forms, product types,
 * size bands, sculpture subjects, materials, colors, and stone varieties across the live inventory.
 * Used by Add Entry, the hairline selector panel, suggestion tags, and exports.
 *
 * Pure TypeScript: strict, deterministic, zero I/O, no runtime dependencies.
 */

export type CanonicalTypeFamily =
    | 'vessel'
    | 'lamp'
    | 'mirror'
    | 'furniture'
    | 'stone'
    | 'fountain'
    | 'sculpture'
    | 'panel'
    | 'other';

export interface CanonicalType {
    readonly id: string;
    readonly english: string;
    readonly spanish: string;
    readonly family: CanonicalTypeFamily;
    readonly shopifyProductType: string;
    readonly shopifyCategory: string;
    readonly hairlineFigure: string;
}

export type ShapeKind = 'form' | 'size' | 'subject' | 'type' | 'unknown';

export interface ShapeClassification {
    readonly kind: ShapeKind;
    readonly value: string | null;
    readonly top?: 'open' | 'closed';
}

export interface CategoryAndType {
    readonly category: string;
    readonly productType: string;
}

export interface SplitVendorColour {
    readonly colour: string | null;
    readonly variety: string | null;
}

/**
 * The 37 canonical Types covering the 548 live inventory rows and the closed Shopify catalogue.
 * Note: Tower Lamp is folded into Floor Lamp, and Luminary is folded into Wall Panel per owner decisions (11 Oct 2026).
 * Rock is preserved as its own canonical Type (owner decision pending).
 */
export const CANONICAL_TYPES: readonly CanonicalType[] = [
    {
        id: 'bowl',
        english: 'Bowl',
        spanish: 'Tazón',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Decorative Bowls',
        shopifyCategory: 'Home & Garden > Decor > Decorative Bowls',
        hairlineFigure: 'bowl',
    },
    {
        id: 'canoe',
        english: 'Canoe',
        spanish: 'Canoa',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Decorative Trays',
        shopifyCategory: 'Home & Garden > Decor > Decorative Trays',
        hairlineFigure: 'canoe',
    },
    {
        id: 'plate',
        english: 'Plate',
        spanish: 'Plato',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Decorative Plates',
        shopifyCategory: 'Home & Garden > Decor > Decorative Plates',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'tray',
        english: 'Tray',
        spanish: 'Charola',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Decorative Trays',
        shopifyCategory: 'Home & Garden > Decor > Decorative Trays',
        hairlineFigure: 'canoe',
    },
    {
        id: 'basin',
        english: 'Basin',
        spanish: 'Lavamanos / Palangana',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Sinks',
        shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Sinks',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'sink',
        english: 'Sink',
        spanish: 'Lavabo',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Sinks',
        shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Sinks',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'bathtub',
        english: 'Bathtub',
        spanish: 'Tina de Baño',
        family: 'vessel',
        shopifyProductType: 'Bathtubs',
        shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'vase',
        english: 'Vase',
        spanish: 'Florero',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Vases',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'shot-glass',
        english: 'Shot Glass',
        spanish: 'Tequilero',
        family: 'vessel',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'pendant',
        english: 'Pendant',
        spanish: 'Lámpara Colgante',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Pendant Lights',
        shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures',
        hairlineFigure: 'pendant',
    },
    {
        id: 'table-lamp',
        english: 'Table Lamp',
        spanish: 'Lámpara de Mesa',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Table Lamps',
        shopifyCategory: 'Home & Garden > Lighting > Lamps > Desk Lamps',
        hairlineFigure: 'table-lamp',
    },
    {
        // A Tower Lamp is a Floor Lamp (owner decision, 11 Oct 2026): the staff used two names for one product.
        id: 'floor-lamp',
        english: 'Floor Lamp',
        spanish: 'Lámpara de Piso',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Floor Lamps',
        shopifyCategory: 'Home & Garden > Lighting > Lamps > Floor Lamps',
        hairlineFigure: 'floor-lamp',
    },
    {
        id: 'mirror',
        english: 'Mirror',
        spanish: 'Espejo',
        family: 'mirror',
        shopifyProductType: 'Home Decor > Mirrors',
        shopifyCategory: 'Home & Garden > Decor > Mirrors',
        hairlineFigure: 'mirror',
    },
    {
        id: 'table',
        english: 'Table',
        spanish: 'Mesa',
        family: 'furniture',
        shopifyProductType: 'Home Decor > Tables',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'table',
    },
    {
        id: 'coffee-table',
        english: 'Coffee Table',
        spanish: 'Mesa de Centro',
        family: 'furniture',
        shopifyProductType: 'Home Decor > Tables',
        shopifyCategory: 'Furniture > Tables > Coffee Tables',
        hairlineFigure: 'table',
    },
    {
        id: 'table-set',
        english: 'Table Set',
        spanish: 'Juego de Mesas',
        family: 'furniture',
        shopifyProductType: 'Home Decor > Tables',
        shopifyCategory: 'Furniture > Table Accessories',
        hairlineFigure: 'table',
    },
    {
        id: 'chair',
        english: 'Chair',
        spanish: 'Silla',
        family: 'furniture',
        shopifyProductType: 'NONE: needs owner decision',
        shopifyCategory: 'Furniture > Chairs',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'couch',
        english: 'Couch',
        spanish: 'Sillón / Sofá',
        family: 'furniture',
        shopifyProductType: 'NONE: needs owner decision',
        shopifyCategory: 'Furniture > Sofas',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'bar',
        english: 'Bar',
        spanish: 'Barra',
        family: 'furniture',
        shopifyProductType: 'Home Decor > Tables',
        shopifyCategory: 'Furniture > Bars & Bar Carts',
        hairlineFigure: 'table',
    },
    {
        // Rock is kept as its own canonical Type (owner direction: the owner has not decided yet between fountain and boulder).
        id: 'rock',
        english: 'Rock',
        spanish: 'Roca Decorativa',
        family: 'stone',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'boulder',
        english: 'Boulder',
        spanish: 'Roca Monumental',
        family: 'stone',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'pebble-stone',
        english: 'Pebble Stones',
        spanish: 'Guijarros / Piedras de Río',
        family: 'stone',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'bag',
        english: 'Bag of Stones',
        spanish: 'Bolsa de Piedras',
        family: 'stone',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'fountain',
        english: 'Fountain',
        spanish: 'Fuente',
        family: 'fountain',
        shopifyProductType: 'Outdoor Decor > Fountains',
        shopifyCategory: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains',
        hairlineFigure: 'fountain',
    },
    {
        id: 'fountain-set',
        english: 'Fountain Set',
        spanish: 'Juego de Fuentes',
        family: 'fountain',
        shopifyProductType: 'Outdoor Decor > Fountains',
        shopifyCategory: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains',
        hairlineFigure: 'fountain',
    },
    {
        id: 'sculpture',
        english: 'Sculpture',
        spanish: 'Escultura',
        family: 'sculpture',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'sculpture-set',
        english: 'Sculpture Set',
        spanish: 'Juego de Esculturas',
        family: 'sculpture',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'ball',
        english: 'Ball',
        spanish: 'Esfera',
        family: 'sculpture',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'pillar',
        english: 'Pillar',
        spanish: 'Pedestal / Pilar',
        family: 'sculpture',
        shopifyProductType: 'Home Decor > Sculptures',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        // Every wall panel is also a luminary (it is lit per owner decision, 11 Oct 2026): both names are one Type.
        id: 'wall-panel',
        english: 'Wall Panel',
        spanish: 'Panel de Pared',
        family: 'panel',
        shopifyProductType: 'Home Decor > Wall Panels',
        shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
        hairlineFigure: 'wall-panel',
    },
    {
        id: 'painted-wall-panel',
        english: 'Painted Wall Panel',
        spanish: 'Panel de Pared Pintado',
        family: 'panel',
        shopifyProductType: 'Home Decor > Wall Panels',
        shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
        hairlineFigure: 'wall-panel',
    },
    {
        id: 'panel-pair',
        english: 'Panel Pair',
        spanish: 'Par de Paneles',
        family: 'panel',
        shopifyProductType: 'Home Decor > Wall Panels',
        shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
        hairlineFigure: 'wall-panel',
    },
    {
        id: 'wine-rack',
        english: 'Wine Rack',
        spanish: 'Portavinos / Cava',
        family: 'other',
        shopifyProductType: 'Home Decor > Wine Racks',
        shopifyCategory: 'Furniture > Cabinets & Storage > Wine Racks',
        hairlineFigure: 'wine-rack',
    },
    {
        id: 'chess-set',
        english: 'Chess Set',
        spanish: 'Ajedrez',
        family: 'other',
        shopifyProductType: 'Board Games > Chess Sets',
        shopifyCategory: 'Toys & Games > Games > Board Games',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'candleholder',
        english: 'Candleholder',
        spanish: 'Portavelas',
        family: 'other',
        shopifyProductType: 'Home Decor > Candleholders',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'coaster',
        english: 'Coaster',
        spanish: 'Portavasos',
        family: 'other',
        shopifyProductType: 'Home Decor > Coasters',
        shopifyCategory: 'Home & Garden > Kitchen & Dining > Barware > Coasters',
        hairlineFigure: 'UNKNOWN',
    },
    {
        id: 'wine-stopper',
        english: 'Wine Stopper',
        spanish: 'Tapón de Vino',
        family: 'other',
        shopifyProductType: 'Barware > Wine Stoppers',
        shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
        hairlineFigure: 'UNKNOWN',
    },
] as const;

/**
 * Closed list of true 3D physical geometric forms.
 */
export const CANONICAL_FORMS = [
    'cylinder',
    'squared',
    'rectangular',
    'round',
    'free-form',
    'irregular',
    'cube',
    'diamond',
    'sphere',
    'l-shaped',
    's-shaped',
] as const;

export type CanonicalForm = typeof CANONICAL_FORMS[number];

/**
 * Standard size bands.
 */
export const SIZE_BANDS = [
    'mini',
    'small',
    'medium',
    'large',
] as const;

export type SizeBand = typeof SIZE_BANDS[number];

/**
 * Closed list of sculpture subjects/motifs.
 */
export const CANONICAL_SUBJECTS = [
    'horse',
    'elk',
    'deer',
    'moose',
    'bear',
    'cactus',
    'bobcat',
    'climbers',
    'flame',
    'venus',
] as const;

export type CanonicalSubject = typeof CANONICAL_SUBJECTS[number];

/**
 * Closed list of raw materials.
 */
export const CANONICAL_MATERIALS = [
    'Onyx',
    'Fluorite',
    'Calcite',
    'Travertine',
    'Marble',
    'Concrete',
] as const;

export type CanonicalMaterial = typeof CANONICAL_MATERIALS[number];

/**
 * Closed list of standard Shopify colors + Amber and Pearlescent from the alias map.
 */
export const CANONICAL_COLOURS = [
    'Amber',
    'Black',
    'Blue',
    'Bronze',
    'Brown',
    'Clear',
    'Copper',
    'Cream',
    'Gold',
    'Gray',
    'Green',
    'Iridescent',
    'Multicolor',
    'Orange',
    'Pearlescent',
    'Pink',
    'Purple',
    'Rainbow',
    'Red',
    'Rose Gold',
    'Silver',
    'Tan',
    'Teal',
    'Turquoise/Aqua',
    'White',
    'Yellow',
] as const;

export type CanonicalColour = typeof CANONICAL_COLOURS[number];

/**
 * Closed list of recognized stone varieties (quarry names, geological styles).
 */
export const CANONICAL_STONE_VARIETIES = [
    'Blue Argentina',
    'Cloud',
    'Cosmic',
    'Cristaline',
    'Emperor',
    'Galaxy',
    'Guatemala',
    'Ice',
    'Jasper',
    'Nacar',
    'Pearlescent',
    'Queretaro',
    'Red Pyramid',
    'Serpentine',
    'Talan',
    'Teal Serpentine',
    'Tehuacan',
    'Zebra',
] as const;

export type CanonicalStoneVariety = typeof CANONICAL_STONE_VARIETIES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Normalization and Aliasing Dictionaries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes text: trims, collapses multiple spaces, strips diacritical accents, and lowercases.
 */
export function normalizeText(raw: unknown): string {
    return String(raw ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/**
 * Capitalises each word, leaves the rest lower-case.
 */
function titleCase(raw: string): string {
    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Type alias table: maps normalized raw input strings to canonical Type IDs.
 * Reconciled against docs/inventory/taxonomy_alias_map.json and 11 Oct 2026 owner decisions.
 */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
    'bowl': 'bowl',
    'bowls': 'bowl',
    'tazon': 'bowl',
    'tazones': 'bowl',
    'decorative bowl': 'bowl',
    'home decor > decorative bowls': 'bowl',
    'home decor > decorative vessels': 'bowl',

    'table lamp': 'table-lamp',
    'table lamps': 'table-lamp',
    'lamp': 'table-lamp',
    'lamps': 'table-lamp',
    'lampara de mesa': 'table-lamp',
    'desk lamp': 'table-lamp',
    'home decor > table lamps': 'table-lamp',
    'home decor > lighting': 'table-lamp',
    'home decor > lighting > table lamps': 'table-lamp',

    'pendant': 'pendant',
    'pendants': 'pendant',
    'pendant lamp': 'pendant',
    'pendant lamps': 'pendant',
    'colgante': 'pendant',
    'colgantes': 'pendant',
    'lampara colgante': 'pendant',
    'home decor > pendant lights': 'pendant',
    'home decor > pendant lamps': 'pendant',
    'home decor > lighting > pendant lamps': 'pendant',
    'home decor > lighting > pendant': 'pendant',
    'home decor > pendant lighting': 'pendant',
    'lighting > pendant lamps': 'pendant',

    'canoe': 'canoe',
    'canoas': 'canoe',
    'canoa': 'canoe',
    'canoe tray': 'canoe',
    'onyx canoe tray': 'canoe',

    // Tower Lamp is Floor Lamp (owner decision, 11 Oct 2026)
    'tower lamp': 'floor-lamp',
    'tower lamps': 'floor-lamp',
    'lampara torre': 'floor-lamp',

    // Rock is kept as its own canonical Type (owner direction)
    'rock': 'rock',
    'roca': 'rock',
    'piedra': 'rock',

    'mirror': 'mirror',
    'mirrors': 'mirror',
    'espejo': 'mirror',
    'espejos': 'mirror',
    'home decor > mirrors': 'mirror',

    'painted wall panel': 'painted-wall-panel',

    'floor lamp': 'floor-lamp',
    'floor lamps': 'floor-lamp',
    'lampara de piso': 'floor-lamp',
    'home decor > floor lamps': 'floor-lamp',

    'wine rack': 'wine-rack',
    'wine racks': 'wine-rack',
    'rustic wine rack': 'wine-rack',
    'portavinos': 'wine-rack',
    'cava': 'wine-rack',
    'home decor > wine racks': 'wine-rack',
    '2 holes': 'wine-rack',
    '3 holes': 'wine-rack',
    '4 holes': 'wine-rack',
    '5 holes': 'wine-rack',
    '6 holes': 'wine-rack',
    '8 holes': 'wine-rack',
    '9 holes': 'wine-rack',
    '10 holes': 'wine-rack',
    '20 holes': 'wine-rack',
    '21 holes': 'wine-rack',

    'wall panel pair': 'panel-pair',
    'panel pair': 'panel-pair',
    'par de paneles': 'panel-pair',

    // Luminary is Wall Panel (owner decision, 11 Oct 2026)
    'luminary': 'wall-panel',
    'luminaries': 'wall-panel',
    'luminarie': 'wall-panel',
    'luminaria': 'wall-panel',
    'luminarias': 'wall-panel',
    'wall luminary': 'wall-panel',
    'luminary panel': 'wall-panel',

    'wall panel': 'wall-panel',
    'wall panels': 'wall-panel',
    'panel de pared': 'wall-panel',
    'paneles de pared': 'wall-panel',
    'panel': 'wall-panel',
    'home decor > wall panels': 'wall-panel',

    'table': 'table',
    'tables': 'table',
    'mesa': 'table',
    'mesas': 'table',
    'stand': 'table',
    'home decor > tables': 'table',

    'bag': 'bag',
    'bolsa': 'bag',

    'ball': 'ball',
    'balls': 'ball',
    'esfera': 'ball',
    'esferas': 'ball',
    'home decor > decorative balls': 'ball',

    'fountain set': 'fountain-set',
    '3 fountain set': 'fountain-set',
    'juego de fuentes': 'fountain-set',

    'pillar': 'pillar',
    'pillars': 'pillar',
    'pilar': 'pillar',
    'pilares': 'pillar',
    'pedestal': 'pillar',

    'sculpture': 'sculpture',
    'sculptures': 'sculpture',
    'escultura': 'sculpture',
    'esculturas': 'sculpture',
    'statue': 'sculpture',
    'figura': 'sculpture',
    'home decor > sculptures': 'sculpture',
    'home decor > decorative objects': 'sculpture',
    'home decor > decorative sculpture': 'sculpture',

    'bar': 'bar',
    'barra': 'bar',

    // Client custom commissions resolved to basin as recorded in the alias map
    'client jan dunn': 'basin',
    'client sandy levits': 'basin',
    'client trish wagner': 'basin',

    'coffee table': 'coffee-table',
    'cofee table': 'coffee-table',
    'mesa de centro': 'coffee-table',

    'fountain': 'fountain',
    'fountains': 'fountain',
    'fuente': 'fountain',
    'fuentes': 'fountain',
    'cascada': 'fountain',
    'outdoor decor > fountains': 'fountain',

    'plate': 'plate',
    'plato': 'plate',
    'platos': 'plate',

    'sculptures set': 'sculpture-set',
    'sculpture set': 'sculpture-set',
    'juego de esculturas': 'sculpture-set',

    'table set': 'table-set',
    'juego de mesas': 'table-set',

    'couch': 'couch',
    'v shaped couch': 'couch',
    'sofa': 'couch',
    'sillon': 'couch',

    'tray': 'tray',
    'charola': 'tray',
    'charolas': 'tray',
    'home decor > decorative trays': 'tray',

    'chess': 'chess-set',
    'chess set': 'chess-set',
    'italian chess': 'chess-set',
    'ajedrez': 'chess-set',
    'board games > chess sets': 'chess-set',

    'basin': 'basin',
    'palangana': 'basin',
    'sink': 'sink',
    'sinks': 'sink',
    'lavabo': 'sink',
    'lavabos': 'sink',
    'washbasin': 'sink',

    'bathtub': 'bathtub',
    'bathtubs': 'bathtub',
    'bath tub': 'bathtub',
    'tina': 'bathtub',
    'tinas': 'bathtub',

    'vase': 'vase',
    'vases': 'vase',
    'florero': 'vase',
    'floreros': 'vase',

    'shot glass': 'shot-glass',
    'shot glasses': 'shot-glass',
    'tequilero': 'shot-glass',
    'tequileros': 'shot-glass',

    'boulder': 'boulder',
    'pebble stone': 'pebble-stone',
    'pebble stones': 'pebble-stone',
    'guijarros': 'pebble-stone',

    'chair': 'chair',
    'silla': 'chair',
    'sillas': 'chair',

    'candleholder': 'candleholder',
    'candleholders': 'candleholder',
    'portavelas': 'candleholder',

    'coaster': 'coaster',
    'coasters': 'coaster',
    'portavaso': 'coaster',
    'portavasos': 'coaster',

    'wine stopper': 'wine-stopper',
    'wine stoppers': 'wine-stopper',
    'tapon de vino': 'wine-stopper',
};

/**
 * Form alias table: maps normalized form strings to canonical form names.
 */
const FORM_ALIASES: Readonly<Record<string, CanonicalForm>> = {
    'cylinder': 'cylinder',
    'cilindro': 'cylinder',
    'cilindrico': 'cylinder',
    'cylindrical': 'cylinder',
    'squared': 'squared',
    'square': 'squared',
    'cuadrado': 'squared',
    'rectangular': 'rectangular',
    'rectangulo': 'rectangular',
    'round': 'round',
    'redondo': 'round',
    'circular': 'round',
    'free form': 'free-form',
    'freeform': 'free-form',
    'forma libre': 'free-form',
    'irregular': 'irregular',
    'irregular border': 'irregular',
    'borde irregular': 'irregular',
    'cube': 'cube',
    'cubo': 'cube',
    'diamond': 'diamond',
    'diamante': 'diamond',
    'sphere': 'sphere',
    'esfera': 'sphere',
    'l shaped': 'l-shaped',
    'l shape': 'l-shaped',
    'forma l': 'l-shaped',
    's shape': 's-shaped',
    's shaped': 's-shaped',
    'forma s': 's-shaped',
};

/**
 * Size band alias table.
 */
const SIZE_ALIASES: Readonly<Record<string, SizeBand>> = {
    'mini': 'mini',
    'extra small': 'mini',
    'xs': 'mini',
    'small': 'small',
    'chico': 'small',
    'pequeno': 'small',
    's': 'small',
    'medium': 'medium',
    'mediano': 'medium',
    'm': 'medium',
    'large': 'large',
    'grande': 'large',
    'l': 'large',
};

/**
 * Sculpture subject alias table.
 */
const SUBJECT_ALIASES: Readonly<Record<string, CanonicalSubject>> = {
    'horse': 'horse',
    'horses': 'horse',
    'caballo': 'horse',
    'caballos': 'horse',
    'elk': 'elk',
    'elks': 'elk',
    'alce': 'elk',
    'alces': 'elk',
    'deer': 'deer',
    'deers': 'deer',
    'venado': 'deer',
    'venados': 'deer',
    'moose': 'moose',
    'bear': 'bear',
    'bears': 'bear',
    'oso': 'bear',
    'osos': 'bear',
    'cactus': 'cactus',
    '3 cactus': 'cactus',
    'bobcat': 'bobcat',
    'bobcats': 'bobcat',
    'lince': 'bobcat',
    'climbers': 'climbers',
    'escaladores': 'climbers',
    'flame': 'flame',
    'llama': 'flame',
    'venus': 'venus',
};

/**
 * Material alias table.
 */
const MATERIAL_ALIASES: Readonly<Record<string, CanonicalMaterial>> = {
    'onyx': 'Onyx',
    'onix': 'Onyx',
    'fluorite': 'Fluorite',
    'fluorita': 'Fluorite',
    'calcite': 'Calcite',
    'calcita': 'Calcite',
    'travertine': 'Travertine',
    'travertino': 'Travertine',
    'marble': 'Marble',
    'marmol': 'Marble',
    'concrete': 'Concrete',
    'concreto': 'Concrete',
};

/**
 * Vendor colour alias dictionary reconciling the 74 raw values from distinct_values.json
 * with docs/inventory/taxonomy_alias_map.json.
 */
const VENDOR_COLOUR_MAP: Readonly<Record<string, string>> = {
    'green talan': 'Green Talan',
    'pearlescent': 'Pearlescent',
    'teal serpentine': 'Teal Serpentine',
    'teal': 'Teal',
    'tehuacan': 'Tehuacan',
    'aqua serpentine': 'Aqua Serpentine',
    'purple green': 'Purple Green',
    'amber': 'Amber',
    'aqua': 'Aqua',
    'orange': 'Orange',
    'pink serpentine': 'Pink Serpentine',
    'pink': 'Pink',
    'tehuacan gray': 'Tehuacan Gray',
    'tehuacan amber': 'Tehuacan Amber',
    'white': 'White',
    'yellow': 'Yellow',
    'cristaline gray': 'Cristaline Gray',
    'nacar': 'Nacar',
    'blue': 'Blue',
    'cristaline amber': 'Cristaline Amber',
    'golden': 'Golden',
    'red pyramid': 'Red Pyramid',
    'tehuacan ice': 'Tehuacan Ice',
    'white-amber': 'White Amber',
    'white amber': 'White Amber',
    'zebra': 'Zebra',
    'cristaline': 'Cristaline',
    'cristaline gray amber': 'Cristaline Gray Amber',
    'green-gray': 'Green-Gray',
    'black': 'Black',
    'black zebra': 'Black Zebra',
    'tehuacan white': 'Tehuacan White',
    'white-gray': 'White-Gray',
    'assorted colors': 'Assorted Colors',
    'orange cosmic': 'Orange Cosmic',
    'pink zebra': 'Pink Zebra',
    'tehuacan green': 'Tehuacan Green',
    'white-amber-gray': 'White-Amber-Gray',
    'blue argentina': 'Blue Argentina',
    'cristaline brown': 'Cristaline Brown',
    'emperor': 'Emperor',
    'gray': 'Gray',
    'green': 'Green',
    'white ice': 'White Ice',
    'beige': 'Beige',
    'beige cristaline': 'Beige Cristaline',
    'brown tehuacan': 'Brown Tehuacan',
    'cristaline green amber': 'Cristaline Green Amber',
    'cristaline green gray': 'Cristaline Green Gray',
    'green gray cristaline': 'Cristaline Green Gray',
    'green talan black': 'Green Talan Black',
    'ice gray': 'Ice Gray',
    'multicolor': 'Multicolor',
    'orange green white': 'Orange Green White',
    'pink serpentine cristaline': 'Pink Serpentine Cristaline',
    'serpentine': 'Serpentine',
    'tehuacan w green': 'Tehuacan Green',
    'amber emperor': 'Amber Emperor',
    'amber gray': 'Amber Gray',
    'assorted': 'Assorted Colors',
    'chocolate': 'Chocolate',
    'cristaline green': 'Cristaline Green',
    'cristaline pink': 'Cristaline Pink',
    'galaxy': 'Galaxy',
    'gray green': 'Green-Gray',
    'green amber': 'Green Amber',
    'green brown vein': 'Green Brown Vein',
    'multicolor orange': 'Multicolor Orange',
    'multicolor white': 'Multicolor White',
    'orange black brown': 'Orange Black Brown',
    'pink gray': 'Pink Gray',
    'pink serpentine amber': 'Pink Serpentine Amber',
    'red pyramid jasper': 'Red Pyramid',
    'tehuacan large gray rim': 'Tehuacan Gray',
    'tehuacan mint': 'Tehuacan Mint',
    'tehuacan small gray rim': 'Tehuacan Gray',
};

/**
 * Split vendor colours dictionary for the live 74 vendor colours.
 * Extracts plain optical colour and geological stone variety.
 */
const SPLIT_VENDOR_COLOUR_MAP: Readonly<Record<string, SplitVendorColour>> = {
    'green talan': { colour: 'Green', variety: 'Talan' },
    'pearlescent': { colour: 'Pearlescent', variety: 'Pearlescent' },
    'tehuacan': { colour: null, variety: 'Tehuacan' },
    'aqua serpentine': { colour: 'Aqua', variety: 'Serpentine' },
    'purple green': { colour: 'Purple Green', variety: null },
    'amber': { colour: 'Amber', variety: null },
    'aqua': { colour: 'Aqua', variety: null },
    'orange': { colour: 'Orange', variety: null },
    'pink serpentine': { colour: 'Pink', variety: 'Serpentine' },
    'pink': { colour: 'Pink', variety: null },
    'tehuacan gray': { colour: 'Gray', variety: 'Tehuacan' },
    'tehuacan amber': { colour: 'Amber', variety: 'Tehuacan' },
    'white': { colour: 'White', variety: null },
    'yellow': { colour: 'Yellow', variety: null },
    'cristaline gray': { colour: 'Gray', variety: 'Cristaline' },
    'nacar': { colour: null, variety: 'Nacar' },
    'blue': { colour: 'Blue', variety: null },
    'cristaline amber': { colour: 'Amber', variety: 'Cristaline' },
    'golden': { colour: 'Golden', variety: null },
    'red pyramid': { colour: 'Red', variety: 'Red Pyramid' },
    'tehuacan ice': { colour: 'Ice', variety: 'Tehuacan' },
    'white-amber': { colour: 'White Amber', variety: null },
    'white amber': { colour: 'White Amber', variety: null },
    'zebra': { colour: null, variety: 'Zebra' },
    'cristaline': { colour: null, variety: 'Cristaline' },
    'cristaline gray amber': { colour: 'Gray Amber', variety: 'Cristaline' },
    'green-gray': { colour: 'Green-Gray', variety: null },
    'black': { colour: 'Black', variety: null },
    'black zebra': { colour: 'Black', variety: 'Zebra' },
    'tehuacan white': { colour: 'White', variety: 'Tehuacan' },
    'white-gray': { colour: 'White-Gray', variety: null },
    'assorted colors': { colour: 'Assorted Colors', variety: null },
    'orange cosmic': { colour: 'Orange', variety: 'Cosmic' },
    'pink zebra': { colour: 'Pink', variety: 'Zebra' },
    'tehuacan green': { colour: 'Green', variety: 'Tehuacan' },
    'white-amber-gray': { colour: 'White-Amber-Gray', variety: null },
    'blue argentina': { colour: 'Blue', variety: 'Blue Argentina' },
    'cristaline brown': { colour: 'Brown', variety: 'Cristaline' },
    'emperor': { colour: null, variety: 'Emperor' },
    'gray': { colour: 'Gray', variety: null },
    'green': { colour: 'Green', variety: null },
    'white ice': { colour: 'White', variety: 'Ice' },
    'beige': { colour: 'Beige', variety: null },
    'beige cristaline': { colour: 'Beige', variety: 'Cristaline' },
    'brown tehuacan': { colour: 'Brown', variety: 'Tehuacan' },
    'cristaline green amber': { colour: 'Green Amber', variety: 'Cristaline' },
    'cristaline green gray': { colour: 'Green Gray', variety: 'Cristaline' },
    'green gray cristaline': { colour: 'Green Gray', variety: 'Cristaline' },
    'green talan black': { colour: 'Green Black', variety: 'Talan' },
    'ice gray': { colour: 'Gray', variety: 'Ice' },
    'multicolor': { colour: 'Multicolor', variety: null },
    'orange green white': { colour: 'Orange Green White', variety: null },
    'pink serpentine cristaline': { colour: 'Pink', variety: 'Serpentine' },
    'serpentine': { colour: null, variety: 'Serpentine' },
    'tehuacan w green': { colour: 'Green', variety: 'Tehuacan' },
    'amber emperor': { colour: 'Amber', variety: 'Emperor' },
    'amber gray': { colour: 'Amber Gray', variety: null },
    'assorted': { colour: 'Assorted Colors', variety: null },
    'chocolate': { colour: 'Chocolate', variety: null },
    'cristaline green': { colour: 'Green', variety: 'Cristaline' },
    'cristaline pink': { colour: 'Pink', variety: 'Cristaline' },
    'galaxy': { colour: null, variety: 'Galaxy' },
    'gray green': { colour: 'Green-Gray', variety: null },
    'green amber': { colour: 'Green Amber', variety: null },
    'green brown vein': { colour: 'Green Brown', variety: null },
    'multicolor orange': { colour: 'Multicolor Orange', variety: null },
    'multicolor white': { colour: 'Multicolor White', variety: null },
    'orange black brown': { colour: 'Orange Black Brown', variety: null },
    'pink gray': { colour: 'Pink Gray', variety: null },
    'pink serpentine amber': { colour: 'Pink Amber', variety: 'Serpentine' },
    'red pyramid jasper': { colour: 'Red', variety: 'Red Pyramid' },
    'tehuacan large gray rim': { colour: 'Gray', variety: 'Tehuacan' },
    'tehuacan mint': { colour: 'Mint', variety: 'Tehuacan' },
    'tehuacan small gray rim': { colour: 'Gray', variety: 'Tehuacan' },
};

const HOLE_REGEX = /^(\d+)\s*holes?$/;
const CLIENT_REGEX = /^client\b/;

// Fast lookup maps
const TYPE_BY_ID = new Map<string, CanonicalType>(CANONICAL_TYPES.map(t => [t.id, t]));

// ─────────────────────────────────────────────────────────────────────────────
// Pure Exported Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a raw string into a canonical Type ID (kebab-case).
 * Handles plural forms, accents, wine rack hole counts, and Spanish aliases.
 * Personal/client entries without fixed mappings return null.
 */
export function canonicalTypeId(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;

    if (HOLE_REGEX.test(text) || text.includes('wine rack')) {
        return 'wine-rack';
    }

    const direct = TYPE_ALIASES[text];
    if (direct) return direct;

    if (CLIENT_REGEX.test(text)) return null;

    if (text.endsWith('s')) {
        const singular = TYPE_ALIASES[text.slice(0, -1)];
        if (singular) return singular;
    }

    return null;
}

/**
 * Resolves a raw string into a canonical geometric form name.
 */
export function canonicalForm(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;

    const direct = FORM_ALIASES[text];
    if (direct) return direct;

    if (text.endsWith('s')) {
        const singular = FORM_ALIASES[text.slice(0, -1)];
        if (singular) return singular;
    }

    return null;
}

/**
 * Resolves a raw string into a standard SizeBand (mini, small, medium, large).
 */
export function sizeBandOf(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;
    return SIZE_ALIASES[text] ?? null;
}

/**
 * Resolves a raw material string into a canonical Material name (Title Case).
 * Missing/empty materials resolve to 'Onyx' as recorded in taxonomy_alias_map.json.
 */
export function canonicalMaterial(raw: unknown): string | null {
    if (raw === null || raw === undefined) return 'Onyx';
    const text = normalizeText(raw);
    if (!text || text === 'null') return 'Onyx';
    return MATERIAL_ALIASES[text] ?? null;
}

/**
 * Resolves a raw string into a canonical stone variety name from CANONICAL_STONE_VARIETIES,
 * or null if no stone variety is present.
 */
export function canonicalVariety(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;

    // Multi-word varieties first
    if (text.includes('blue argentina')) return 'Blue Argentina';
    if (text.includes('red pyramid')) return 'Red Pyramid';

    // Single-word varieties
    if (text.includes('tehuacan')) return 'Tehuacan';
    if (text.includes('talan')) return 'Talan';
    if (text.includes('serpentine')) return 'Serpentine';
    if (text.includes('zebra')) return 'Zebra';
    if (text.includes('nacar')) return 'Nacar';
    if (text.includes('cosmic')) return 'Cosmic';
    if (text.includes('cristaline') || text.includes('cristalina') || text.includes('crystalline')) return 'Cristaline';
    if (text.includes('pearlescent')) return 'Pearlescent';
    if (text.includes('emperor')) return 'Emperor';
    if (text.includes('galaxy')) return 'Galaxy';
    if (text.includes('jasper')) return 'Jasper';
    if (text.includes('cloud')) return 'Cloud';
    if (text.includes('guatemala')) return 'Guatemala';
    if (text.includes('queretaro')) return 'Queretaro';
    if (/\bice\b/.test(text)) return 'Ice';

    return null;
}

/**
 * Fallback parser for arbitrary/new vendor colours.
 */
function parseVendorColourFallback(text: string): SplitVendorColour {
    const variety = canonicalVariety(text);
    if (!variety) {
        const colour = titleCase(text.replace(/-/g, ' '));
        return { colour: colour || null, variety: null };
    }

    if (variety === 'Blue Argentina') {
        return { colour: 'Blue', variety: 'Blue Argentina' };
    }
    if (variety === 'Red Pyramid') {
        return { colour: 'Red', variety: 'Red Pyramid' };
    }
    if (variety === 'Pearlescent') {
        return { colour: 'Pearlescent', variety: 'Pearlescent' };
    }

    const stripped = text
        .replace(new RegExp(`\\b${normalizeText(variety)}\\b`, 'gi'), '')
        .replace(/-/g, ' ')
        .trim();

    if (!stripped) {
        return { colour: null, variety };
    }

    return { colour: titleCase(stripped), variety };
}

/**
 * Splits a vendor colour string into its optical colour component and stone variety.
 * E.g., "Green Talan" -> { colour: "Green", variety: "Talan" },
 * "Blue Argentina" -> { colour: "Blue", variety: "Blue Argentina" },
 * "White-Amber" / "White Amber" -> { colour: "White Amber", variety: null },
 * "Amber" -> { colour: "Amber", variety: null },
 * "Pearlescent" -> { colour: "Pearlescent", variety: "Pearlescent" },
 * "Tehuacan" -> { colour: null, variety: "Tehuacan" }.
 */
export function splitVendorColour(raw: unknown): SplitVendorColour {
    const text = normalizeText(raw);
    if (!text) return { colour: null, variety: null };

    const direct = SPLIT_VENDOR_COLOUR_MAP[text];
    if (direct) return direct;

    return parseVendorColourFallback(text);
}

export const splitVendorColor = splitVendorColour;

/**
 * Resolves a raw vendor colour into its plain canonical colour name.
 * Returns null only for values with no optical colour at all (e.g., pure stone varieties like "Tehuacan", "Zebra").
 */
export function canonicalColour(raw: unknown): string | null {
    if (!raw) return null;
    const split = splitVendorColour(raw);
    return split.colour;
}

export const canonicalColor = canonicalColour;

/**
 * Resolves a raw vendor colour into its canonical vendor colour label as defined in taxonomy_alias_map.json.
 */
export function canonicalVendorColour(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;
    const aliased = VENDOR_COLOUR_MAP[text];
    if (aliased) return aliased;
    return titleCase(String(raw).replace(/-/g, ' '));
}

export const canonicalVendorColor = canonicalVendorColour;

/**
 * Classifies an entry from the shape column into its true conceptual dimension:
 * geometric form, size band, sculpture subject, product type, or unknown.
 * Supports optional top ("open" | "closed") for table and floor lamps in squared,
 * rectangular, and cube forms per owner decision (11 Oct 2026).
 */
export function classifyShapeValue(raw: unknown): ShapeClassification {
    const text = normalizeText(raw);
    if (!text) return { kind: 'unknown', value: null };

    // Detect open or closed top for table/floor lamps
    let top: 'open' | 'closed' | undefined;
    let baseText = text;
    if (/\bopen\s*top\b/i.test(baseText)) {
        top = 'open';
        baseText = baseText.replace(/\bopen\s*top\b/i, '').replace(/\s+/g, ' ').trim();
    } else if (/\bclosed\s*top\b/i.test(baseText)) {
        top = 'closed';
        baseText = baseText.replace(/\bclosed\s*top\b/i, '').replace(/\s+/g, ' ').trim();
    }

    // 1. Size check
    const size = sizeBandOf(text);
    if (size) return { kind: 'size', value: size };
    if (text === 'small - medium - mini') return { kind: 'size', value: 'small' };

    // 2. Subject check
    const subject = SUBJECT_ALIASES[text] ?? (text.endsWith('s') ? SUBJECT_ALIASES[text.slice(0, -1)] : null);
    if (subject) return { kind: 'subject', value: subject };

    // 3. Form check
    const form = canonicalForm(baseText) ?? canonicalForm(text);
    if (form) {
        return top ? { kind: 'form', value: form, top } : { kind: 'form', value: form };
    }

    // 4. Type check
    const typeId = canonicalTypeId(text);
    if (typeId) return { kind: 'type', value: typeId };

    // 5. Special shape items
    if (text === 'boulder' || text === 'pebble stone' || text === 'pebble stones' || text === 'rustic') {
        return { kind: 'form', value: 'free-form' };
    }

    return { kind: 'unknown', value: null };
}

/**
 * Exact, deterministic category and product type lookup by canonical Type ID.
 * NEVER performs substring matching, preventing false positive matches like
 * "tina" inside "Argentina" matching Bathtub.
 */
export function categoryForType(typeId: string): CategoryAndType | null {
    if (!typeId) return null;
    const entry = TYPE_BY_ID.get(typeId);
    if (!entry) return null;
    return {
        category: entry.shopifyCategory,
        productType: entry.shopifyProductType,
    };
}
