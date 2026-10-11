/**
 * Canonical Inventory Taxonomy for Onyx.mx.
 *
 * Provides a single source of truth for physical forms, product types,
 * size bands, sculpture subjects, materials, and colors across the live inventory.
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
}

export interface CategoryAndType {
    readonly category: string;
    readonly productType: string;
}

/**
 * The 39 canonical Types covering the 548 live inventory rows and the closed Shopify catalogue.
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
        id: 'floor-lamp',
        english: 'Floor Lamp',
        spanish: 'Lámpara de Piso',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Floor Lamps',
        shopifyCategory: 'Home & Garden > Lighting > Lamps > Floor Lamps',
        hairlineFigure: 'floor-lamp',
    },
    {
        id: 'tower-lamp',
        english: 'Tower Lamp',
        spanish: 'Lámpara Torre',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Floor Lamps',
        shopifyCategory: 'Home & Garden > Lighting > Lamps > Floor Lamps',
        hairlineFigure: 'tower-lamp',
    },
    {
        id: 'luminary',
        english: 'Luminary',
        spanish: 'Luminaria',
        family: 'lamp',
        shopifyProductType: 'Home Decor > Table Lamps',
        shopifyCategory: 'Home & Garden > Lighting > Lamps > Desk Lamps',
        hairlineFigure: 'UNKNOWN',
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
 * Closed list of standard Shopify colors (23 colors).
 */
export const CANONICAL_COLOURS = [
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
    'Pink',
    'Purple',
    'Rainbow',
    'Red',
    'Rose Gold',
    'Silver',
    'Tan',
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
 * Type alias table: maps normalized raw input strings to canonical Type IDs.
 */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
    'bowl': 'bowl',
    'bowls': 'bowl',
    'tazon': 'bowl',
    'tazones': 'bowl',
    'canoe': 'canoe',
    'canoa': 'canoe',
    'canoas': 'canoe',
    'plate': 'plate',
    'plato': 'plate',
    'platos': 'plate',
    'tray': 'tray',
    'charola': 'tray',
    'charolas': 'tray',
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
    'pendant': 'pendant',
    'pendants': 'pendant',
    'pendant lamp': 'pendant',
    'pendant lamps': 'pendant',
    'colgante': 'pendant',
    'colgantes': 'pendant',
    'lampara colgante': 'pendant',
    'table lamp': 'table-lamp',
    'table lamps': 'table-lamp',
    'lamp': 'table-lamp',
    'lamps': 'table-lamp',
    'lampara de mesa': 'table-lamp',
    'desk lamp': 'table-lamp',
    'floor lamp': 'floor-lamp',
    'floor lamps': 'floor-lamp',
    'lampara de piso': 'floor-lamp',
    'tower lamp': 'tower-lamp',
    'tower lamps': 'tower-lamp',
    'lampara torre': 'tower-lamp',
    'luminary': 'luminary',
    'luminaries': 'luminary',
    'luminarie': 'luminary',
    'luminaria': 'luminary',
    'luminarias': 'luminary',
    'mirror': 'mirror',
    'mirrors': 'mirror',
    'espejo': 'mirror',
    'espejos': 'mirror',
    'table': 'table',
    'tables': 'table',
    'mesa': 'table',
    'mesas': 'table',
    'stand': 'table',
    'coffee table': 'coffee-table',
    'cofee table': 'coffee-table',
    'mesa de centro': 'coffee-table',
    'table set': 'table-set',
    'juego de mesas': 'table-set',
    'chair': 'chair',
    'silla': 'chair',
    'sillas': 'chair',
    'couch': 'couch',
    'v shaped couch': 'couch',
    'sofa': 'couch',
    'sillon': 'couch',
    'bar': 'bar',
    'barra': 'bar',
    'rock': 'rock',
    'roca': 'rock',
    'piedra': 'rock',
    'boulder': 'boulder',
    'pebble stone': 'pebble-stone',
    'pebble stones': 'pebble-stone',
    'guijarros': 'pebble-stone',
    'bag': 'bag',
    'bolsa': 'bag',
    'fountain': 'fountain',
    'fountains': 'fountain',
    'fuente': 'fountain',
    'fuentes': 'fountain',
    'cascada': 'fountain',
    'fountain set': 'fountain-set',
    '3 fountain set': 'fountain-set',
    'juego de fuentes': 'fountain-set',
    'sculpture': 'sculpture',
    'sculptures': 'sculpture',
    'escultura': 'sculpture',
    'esculturas': 'sculpture',
    'statue': 'sculpture',
    'figura': 'sculpture',
    'sculptures set': 'sculpture-set',
    'sculpture set': 'sculpture-set',
    'juego de esculturas': 'sculpture-set',
    'ball': 'ball',
    'balls': 'ball',
    'esfera': 'ball',
    'esferas': 'ball',
    'pillar': 'pillar',
    'pillars': 'pillar',
    'pilar': 'pillar',
    'pilares': 'pillar',
    'pedestal': 'pillar',
    'wall panel': 'wall-panel',
    'wall panels': 'wall-panel',
    'panel de pared': 'wall-panel',
    'paneles de pared': 'wall-panel',
    'panel': 'wall-panel',
    'painted wall panel': 'painted-wall-panel',
    'panel pair': 'panel-pair',
    'wall panel pair': 'panel-pair',
    'par de paneles': 'panel-pair',
    'wine rack': 'wine-rack',
    'wine racks': 'wine-rack',
    'rustic wine rack': 'wine-rack',
    'portavinos': 'wine-rack',
    'cava': 'wine-rack',
    'chess': 'chess-set',
    'chess set': 'chess-set',
    'italian chess': 'chess-set',
    'ajedrez': 'chess-set',
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
 * Color alias table: maps normalized vendor/generated strings to canonical Shopify palette color names.
 */
const COLOUR_ALIASES: Readonly<Record<string, CanonicalColour>> = {
    'black': 'Black',
    'negro': 'Black',
    'blue': 'Blue',
    'azul': 'Blue',
    'bronze': 'Bronze',
    'bronce': 'Bronze',
    'brown': 'Brown',
    'cafe': 'Brown',
    'marron': 'Brown',
    'chocolate': 'Brown',
    'clear': 'Clear',
    'translucent': 'Clear',
    'transparente': 'Clear',
    'copper': 'Copper',
    'cobre': 'Copper',
    'cream': 'Cream',
    'crema': 'Cream',
    'beige': 'Cream',
    'ivory': 'Cream',
    'gold': 'Gold',
    'golden': 'Gold',
    'dorado': 'Gold',
    'gray': 'Gray',
    'grey': 'Gray',
    'gris': 'Gray',
    'silver': 'Silver',
    'plata': 'Silver',
    'green': 'Green',
    'verde': 'Green',
    'iridescent': 'Iridescent',
    'tornasol': 'Iridescent',
    'pearlescent': 'Iridescent',
    'nacar': 'Iridescent',
    'pearl': 'Iridescent',
    'multicolor': 'Multicolor',
    'multi-color': 'Multicolor',
    'multi color': 'Multicolor',
    'assorted': 'Multicolor',
    'assorted colors': 'Multicolor',
    'orange': 'Orange',
    'naranja': 'Orange',
    'amber': 'Orange',
    'ambar': 'Orange',
    'terracotta': 'Orange',
    'pink': 'Pink',
    'rosa': 'Pink',
    'purple': 'Purple',
    'morado': 'Purple',
    'violet': 'Purple',
    'rainbow': 'Rainbow',
    'arcoiris': 'Rainbow',
    'red': 'Red',
    'rojo': 'Red',
    'rose gold': 'Rose Gold',
    'oro rosa': 'Rose Gold',
    'tan': 'Tan',
    'turquoise': 'Turquoise/Aqua',
    'turquoise/aqua': 'Turquoise/Aqua',
    'aqua': 'Turquoise/Aqua',
    'turquesa': 'Turquoise/Aqua',
    'white': 'White',
    'blanco': 'White',
    'yellow': 'Yellow',
    'amarillo': 'Yellow',
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
 * Personal/client entries return null.
 */
export function canonicalTypeId(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;

    if (CLIENT_REGEX.test(text)) return null;

    if (HOLE_REGEX.test(text) || text.includes('wine rack')) {
        return 'wine-rack';
    }

    const direct = TYPE_ALIASES[text];
    if (direct) return direct;

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
 */
export function canonicalMaterial(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;
    return MATERIAL_ALIASES[text] ?? null;
}

/**
 * Resolves a raw color string into a canonical Shopify color name.
 */
export function canonicalColour(raw: unknown): string | null {
    const text = normalizeText(raw);
    if (!text) return null;
    return COLOUR_ALIASES[text] ?? null;
}

/**
 * Classifies an entry from the shape column into its true conceptual dimension:
 * geometric form, size band, sculpture subject, product type, or unknown.
 */
export function classifyShapeValue(raw: unknown): ShapeClassification {
    const text = normalizeText(raw);
    if (!text) return { kind: 'unknown', value: null };

    // 1. Size check
    const size = sizeBandOf(text);
    if (size) return { kind: 'size', value: size };
    if (text === 'small - medium - mini') return { kind: 'size', value: 'small' };

    // 2. Subject check
    const subject = SUBJECT_ALIASES[text] ?? (text.endsWith('s') ? SUBJECT_ALIASES[text.slice(0, -1)] : null);
    if (subject) return { kind: 'subject', value: subject };

    // 3. Form check
    const form = canonicalForm(text);
    if (form) return { kind: 'form', value: form };

    // 4. Type check
    const typeId = canonicalTypeId(text);
    if (typeId) return { kind: 'type', value: typeId };

    // 5. Special shape items
    if (text === 'boulder' || text === 'pebble stone' || text === 'pebble stones') {
        return { kind: 'form', value: 'free-form' };
    }
    if (text === 'rustic') {
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
