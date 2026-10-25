/**
 * Catalog 826 taxonomy: 37 merged ids, families, aliases, shapes, Shopify paths,
 * colour-pattern rules and top flag rules.
 *
 * Implements the owner-approved 826 catalog plan:
 * docs/_inputs/TAXONOMY_826_PROPOSAL.md v1 FINAL and docs/_inputs/onyx826_taxonomy_draft.ts.
 *
 * Union of canonicalType.ts (20 ids) and inventoryTaxonomy.ts (37 ids) = 37 ids.
 * Scope: Book 826 only. Old taxonomy files (canonicalType.ts, inventoryTaxonomy.ts) preserved for legacy books.
 */

import { CANONICAL_COLOR_MAP } from '../colorVocabulary';
import { ALLOWED_SHOPIFY_COLORS, type ShopifyColor } from '../colorExtractor';

export type Family =
  | 'lamps'
  | 'vessels'
  | 'panels-mirrors'
  | 'rocks-fountains-sculpture'
  | 'furniture'
  | 'wine'
  | 'small-items';

/** Whether the item needs an Open or Closed top before a title is produced. */
export type OpenTopRule = 'required' | 'required-confirm' | 'not-needed';

export interface TitlePatterns {
  /** Invoice / identification title, deterministic: {Colour} {Material} {Shape} {Type}, {Top}, {Size} cm. */
  invoice: string;
  /** Shopify Title, Grant format: 60 to 70 characters, Title Case, no articles, no trailing period. */
  shopify: string;
}

export interface OnyxTaxonomyEntry {
  id: string;
  labelEN: string;
  labelES: string;
  family: Family;
  /** Vendor raw values (EN and ES) that resolve to this id. Lower-case match, accents removed. */
  aliases: readonly string[];
  /** Shape values seen in the record or expected. Empty = no shape rule. */
  allowedShapes: readonly string[];
  /** Hairline figure key in src/features/entry/hairline/typeFigures (null = no dedicated figure). */
  hairlineFigure: string | null;
  /** Shopify Standard Product Taxonomy category, full path. */
  shopifyCategory: string;
  /** Shopify product type (Matrixify "Type"). */
  shopifyProductType: string;
  /** How the color-pattern metafield is filled. */
  colourPatternRule: 'lookup-canonical-map' | 'lookup-canonical-map-no-substitution';
  titlePattern: TitlePatterns;
  openTop: OpenTopRule;
  /** Trade partner flags (Grant, 21 Jul). */
  tradePartner?: 'fountains' | 'pendant-lights';
  /** Note or status for review. */
  note: string;
}

const LAMP_SHOPIFY_TEMPLATE_INVOICE = '{Colour} {Material} {Shape} {Type}, {Top}, {Size} cm';

export const ONYX826_TAXONOMY: readonly OnyxTaxonomyEntry[] = [
  // ---------------- lamps ----------------
  {
    id: 'pendant',
    labelEN: 'Pendant',
    labelES: 'Lampara colgante',
    family: 'lamps',
    aliases: ['pendant', 'pendant lamp', 'pendant lamps', 'pendants', 'colgante', 'colgantes', 'lampara colgante'],
    allowedShapes: ['cylinder', 'squared', 'square'],
    hairlineFigure: 'pendant',
    shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures',
    shopifyProductType: 'Home Decor > Pendant Lights',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: LAMP_SHOPIFY_TEMPLATE_INVOICE.replace('{Type}', 'Pendant'),
      shopify: '{Colour} {Material} {Shape} Pendant Luminary - {Feature}',
    },
    openTop: 'required',
    tradePartner: 'pendant-lights',
    note: 'Lamp: top required (Chad remark). Trade partner flag TRUE for pendant lights only (Grant 21 Jul).',
  },
  {
    id: 'table-lamp',
    labelEN: 'Table Lamp',
    labelES: 'Lampara de mesa',
    family: 'lamps',
    aliases: ['table lamp', 'table lamps', 'lamp', 'lamps', 'desk lamp', 'lampara de mesa'],
    allowedShapes: ['squared', 'cylinder', 'square', 'squared open top'],
    hairlineFigure: 'table-lamp',
    shopifyCategory: 'Home & Garden > Lighting > Lamps > Table Lamps',
    shopifyProductType: 'Home Decor > Table Lamps',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: LAMP_SHOPIFY_TEMPLATE_INVOICE.replace('{Type}', 'Table Lamp'),
      shopify: '{Colour} {Material} {Shape} Table Luminary - {Feature}',
    },
    openTop: 'required',
    note: 'Bare "lamp" resolves here only when no other word matches. Shopify category path: Table Lamps (verified; app used Desk Lamps).',
  },
  {
    id: 'floor-lamp',
    labelEN: 'Floor Lamp',
    labelES: 'Lampara de piso',
    family: 'lamps',
    aliases: ['floor lamp', 'floor lamps', 'tower lamp', 'tower lamps', 'lampara de piso', 'lampara torre'],
    allowedShapes: ['squared', 'square', 'cylinder'],
    hairlineFigure: 'floor-lamp',
    shopifyCategory: 'Home & Garden > Lighting > Lamps > Floor Lamps',
    shopifyProductType: 'Home Decor > Floor Lamps',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: LAMP_SHOPIFY_TEMPLATE_INVOICE.replace('{Type}', 'Floor Lamp'),
      shopify: '{Colour} {Material} {Shape} Floor Luminary - {Feature}',
    },
    openTop: 'required',
    note: 'Tower Lamp is a Floor Lamp (owner rule). Never print "Tower Lamp" on copy.',
  },

  // ---------------- vessels ----------------
  {
    id: 'bowl',
    labelEN: 'Bowl',
    labelES: 'Tazon',
    family: 'vessels',
    aliases: ['bowl', 'bowls', 'decorative bowl', 'tazon', 'tazones'],
    allowedShapes: ['large', 'medium', 'small', 'mini'],
    hairlineFigure: 'bowl',
    shopifyCategory: 'Home & Garden > Decor > Decorative Bowls',
    shopifyProductType: 'Home Decor > Decorative Bowls',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Type}, {Top}, {Size} cm',
      shopify: '{Size} {Colour} {Material} Decorative Bowl - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'Top for bowls: confirm all bowls are open top (Q8 family, open). 18 bowls in 826 lack the field.',
  },
  {
    id: 'canoe',
    labelEN: 'Canoe',
    labelES: 'Canoa',
    family: 'vessels',
    aliases: ['canoe', 'canoe tray', 'onyx canoe tray', 'canoas', 'canoa'],
    allowedShapes: ['large', 'medium', 'small'],
    hairlineFigure: 'canoe',
    shopifyCategory: 'Home & Garden > Decor > Decorative Trays',
    shopifyProductType: 'Home Decor > Decorative Trays',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Canoe Tray, {Top}, {Length} x {Width} x {Height} cm',
      shopify: '{Size} {Colour} {Material} Canoe Tray - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'Owner rule: canoes are always Decorative Trays. Width = long axis in the record (KB 2).',
  },
  {
    id: 'tray',
    labelEN: 'Tray',
    labelES: 'Charola',
    family: 'vessels',
    aliases: ['tray', 'trays', 'charola', 'charolas', 'home decor > decorative trays'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Decorative Trays',
    shopifyProductType: 'Home Decor > Decorative Trays',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Tray, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Decorative Tray - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'Q3 decided: kept as its own id (not folded into plate).',
  },
  {
    id: 'plate',
    labelEN: 'Plate',
    labelES: 'Plato',
    family: 'vessels',
    aliases: ['plate', 'plates', 'plato', 'platos'],
    allowedShapes: ['large'],
    hairlineFigure: 'plate',
    shopifyCategory: 'Home & Garden > Decor > Decorative Plates',
    shopifyProductType: 'Home Decor > Decorative Plates',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Plate, {Top}, {Size} cm',
      shopify: '{Size} {Colour} {Material} Decorative Plate - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'The "tray" alias is removed from plate (it belongs to tray).',
  },
  {
    id: 'basin',
    labelEN: 'Basin',
    labelES: 'Palangana',
    family: 'vessels',
    aliases: ['basin', 'palangana', 'vessel sink basin'],
    allowedShapes: ['basin'],
    hairlineFigure: 'basin',
    shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Sinks',
    shopifyProductType: 'Home Decor > Sinks',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Basin, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Vessel Sink Basin - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'VERIFY category path (not in the exact list checked). Client commissions: basin only when shape is Basin; names never shown.',
  },
  {
    id: 'sink',
    labelEN: 'Sink',
    labelES: 'Lavabo',
    family: 'vessels',
    aliases: ['sink', 'sinks', 'washbasin', 'lavabo'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Sinks',
    shopifyProductType: 'Home Decor > Sinks',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Sink, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Sink - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'VERIFY category path. Proposed: fold into basin with shape Sink (decide with Q3 follow-up).',
  },
  {
    id: 'bathtub',
    labelEN: 'Bathtub',
    labelES: 'Tina',
    family: 'vessels',
    aliases: ['bathtub', 'bath tub', 'tina'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs',
    shopifyProductType: 'Bathtubs',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Bathtub, {Size} cm',
      shopify: '{Colour} {Material} Bathtub - {Feature}',
    },
    openTop: 'not-needed',
    note: 'VERIFY category path. Not used in the 826 range; kept so the id list is complete.',
  },
  {
    id: 'vase',
    labelEN: 'Vase',
    labelES: 'Florero',
    family: 'vessels',
    aliases: ['vase', 'vases', 'florero', 'floreros'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Vases',
    shopifyProductType: 'Home Decor > Vases',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Vase, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Vase - {Feature}',
    },
    openTop: 'required',
    note: 'Owner decision Q4: category fixed to Vases (verified path).',
  },
  {
    id: 'shot-glass',
    labelEN: 'Shot Glass',
    labelES: 'Tequilero',
    family: 'vessels',
    aliases: ['shot glass', 'shot glasses', 'tequilero'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses',
    shopifyProductType: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Shot Glass, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Shot Glass - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'Owner decision Q4: category Drinkware > Shot Glasses (verified). Product type decided by Q11 (to confirm with Grant).',
  },

  // ---------------- panels and mirrors ----------------
  {
    id: 'wall-panel',
    labelEN: 'Wall Panel',
    labelES: 'Panel de pared',
    family: 'panels-mirrors',
    aliases: ['wall panel', 'wall panels', 'luminary', 'luminaries', 'luminarie', 'luminaria', 'luminarias', 'panel de pared', 'paneles de pared', 'panel'],
    allowedShapes: ['rectangular', 'free form', 'irregular border', 'pair'],
    hairlineFigure: 'wall-panel',
    shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
    shopifyProductType: 'Home Decor > Wall Panels',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Shape} Wall Panel{Pair}, {Size} cm',
      shopify: '{Colour} {Material} {Shape} Backlit Wall Panel - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Every wall panel is lit (Luminary folds in). Pair is a shape value (Q3 family): one item, one SKU.',
  },
  {
    id: 'panel-pair',
    labelEN: 'Panel Pair',
    labelES: 'Par de paneles',
    family: 'panels-mirrors',
    aliases: ['panel pair', 'wall panel pair', 'par de paneles'],
    allowedShapes: ['pair'],
    hairlineFigure: 'panel-pair',
    shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
    shopifyProductType: 'Home Decor > Wall Panels',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Shape} Wall Panel Pair, {Size} cm (each)',
      shopify: '{Colour} {Material} {Shape} Wall Panel Pair - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Alias of wall-panel with shape Pair, so one item per pair (Grant 30 Jul).',
  },
  {
    id: 'painted-wall-panel',
    labelEN: 'Painted Wall Panel',
    labelES: 'Panel pintado',
    family: 'panels-mirrors',
    aliases: ['painted wall panel', 'panel pintado'],
    allowedShapes: ['horses', 'elk', 'deer', 'moose', 'bears', 'bobcats'],
    hairlineFigure: 'painted-wall-panel',
    shopifyCategory: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures',
    shopifyProductType: 'Home Decor > Wall Panels',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: 'Painted {Colour} {Material} Wall Panel, {Subject}, {Size} cm',
      shopify: 'Painted {Colour} {Material} Wall Panel - {Subject} Scene',
    },
    openTop: 'not-needed',
    note: 'Q2 decided: the title may name the subject from the record (e.g. "Painted Onyx Wall Panel - Elk Scene"). Not lit: do not use "translucent" unless the record says lit.',
  },
  {
    id: 'mirror',
    labelEN: 'Mirror',
    labelES: 'Espejo',
    family: 'panels-mirrors',
    aliases: ['mirror', 'mirrors', 'espejo', 'espejos'],
    allowedShapes: ['round', 'squared', 'rectangular'],
    hairlineFigure: 'mirror',
    shopifyCategory: 'Home & Garden > Decor > Mirrors > Wall Mirrors',
    shopifyProductType: 'Home Decor > Mirrors',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Shape} Mirror, {Size} cm',
      shopify: '{Colour} {Material} {Shape} Wall Mirror - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Record: length is the thickness (10 cm). The copy describes a stone frame only if the record says so.',
  },

  // ---------------- rocks, fountains, sculpture ----------------
  {
    id: 'rock',
    labelEN: 'Rock',
    labelES: 'Roca',
    family: 'rocks-fountains-sculpture',
    aliases: ['rock', 'rocks', 'roca', 'piedra'],
    allowedShapes: ['free form', 'boulder'],
    hairlineFigure: 'rock',
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Natural Rock, {Size} cm',
      shopify: '{Colour} {Material} Natural Rock - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Q1 decided: rock with shape Fountain is a FOUNTAIN (resolved by shape override). Uncarved: no carving words unless the record states it.',
  },
  {
    id: 'boulder',
    labelEN: 'Boulder',
    labelES: 'Peñasco',
    family: 'rocks-fountains-sculpture',
    aliases: ['boulder', 'boulders'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Boulder, {Size} cm',
      shopify: '{Colour} {Material} Boulder - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Kept as its own id (Q3 union). Same Shopify target as rock.',
  },
  {
    id: 'pebble-stone',
    labelEN: 'Pebble Stones',
    labelES: 'Piedras pulidas',
    family: 'rocks-fountains-sculpture',
    aliases: ['pebble stone', 'pebble stones'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Garden & Stepping Stones > Garden Stones',
    shopifyProductType: 'Home & Garden > Decor > Garden & Stepping Stones > Garden Stones',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Pebble Stones, {Quantity}',
      shopify: '{Colour} {Material} Pebble Stones - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Pebble stones are not sculptures: closest standard entry assigned per Q11.',
  },
  {
    id: 'fountain',
    labelEN: 'Fountain',
    labelES: 'Fuente',
    family: 'rocks-fountains-sculpture',
    aliases: ['fountain', 'fountains', 'fuente', 'fuentes', 'cascada', 'outdoor decor > fountains'],
    allowedShapes: ['fountain', 'sphere', 'set'],
    hairlineFigure: 'fountain',
    shopifyCategory: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains',
    shopifyProductType: 'Outdoor Decor > Fountains',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Fountain, {Size} cm',
      shopify: '{Colour} {Material} Fountain - {Feature}',
    },
    openTop: 'not-needed',
    tradePartner: 'fountains',
    note: 'Q1 decided: rock with shape Fountain goes here (43 rows in the workbook). Trade partner flag TRUE for fountains only.',
  },
  {
    id: 'fountain-set',
    labelEN: 'Fountain Set',
    labelES: 'Juego de fuentes',
    family: 'rocks-fountains-sculpture',
    aliases: ['fountain set', '3 fountain set', 'juego de fuentes'],
    allowedShapes: ['set'],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains',
    shopifyProductType: 'Outdoor Decor > Fountains',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Fountain Set of {Count}, {Size} cm',
      shopify: '{Colour} {Material} Fountain Set - {Feature}',
    },
    openTop: 'not-needed',
    tradePartner: 'fountains',
    note: 'Set of fountains (Q3 union). Shape Set on the fountain id is the same item.',
  },
  {
    id: 'sculpture',
    labelEN: 'Sculpture',
    labelES: 'Escultura',
    family: 'rocks-fountains-sculpture',
    aliases: ['sculpture', 'sculptures', 'escultura', 'esculturas', 'statue', 'figura', 'home decor > sculptures'],
    allowedShapes: ['horses', 'elk', 'deer', 'moose', 'bear', 'bears', 'bobcats', 'bobcat', 'cactus', 'climbers', 'flame', 'venus'],
    hairlineFigure: 'sculpture',
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Subject} Sculpture, {Size} cm',
      shopify: '{Colour} {Material} {Subject} Sculpture - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Subject comes from shape (Q2 decided: the subject may be named when it is in the record).',
  },
  {
    id: 'sculpture-set',
    labelEN: 'Sculpture Set',
    labelES: 'Juego de esculturas',
    family: 'rocks-fountains-sculpture',
    aliases: ['sculptures set', 'sculpture set', 'juego de esculturas'],
    allowedShapes: ['set'],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Sculpture Set of {Count}, {Size} cm',
      shopify: '{Colour} {Material} Sculpture Set - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Set (Q3 union).',
  },
  {
    id: 'pillar',
    labelEN: 'Pillar',
    labelES: 'Pilar',
    family: 'rocks-fountains-sculpture',
    aliases: ['pillar', 'pillars', 'pilar', 'pilares', 'pedestal'],
    allowedShapes: ['square'],
    hairlineFigure: 'pillar',
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Pillar, {Size} cm',
      shopify: '{Colour} {Material} Pedestal Pillar - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Owner decision 2026-10-17: pedestal stays under pillar, not under tables (word rule removed from table).',
  },
  {
    id: 'ball',
    labelEN: 'Ball',
    labelES: 'Esfera',
    family: 'rocks-fountains-sculpture',
    aliases: ['ball', 'balls', 'esfera', 'esferas'],
    allowedShapes: ['sphere', 'mini'],
    hairlineFigure: 'ball',
    shopifyCategory: 'Home & Garden > Decor > Artwork > Sculptures & Statues',
    shopifyProductType: 'Home Decor > Sculptures',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Sphere, {Size} cm',
      shopify: '{Colour} {Material} Decorative Sphere - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Compact sphere, under 60 words of copy (per-Type spec).',
  },
  {
    id: 'bag',
    labelEN: 'Bag',
    labelES: 'Bolsa',
    family: 'rocks-fountains-sculpture',
    aliases: ['bag', 'bags', 'bolsa', 'bolsas', 'bag of stones'],
    allowedShapes: ['pebble stones'],
    hairlineFigure: 'bag',
    shopifyCategory: 'Home & Garden > Decor > Garden & Stepping Stones > Garden Stones',
    shopifyProductType: 'Home & Garden > Decor > Garden & Stepping Stones > Garden Stones',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Pebble Stones Bag, {Quantity}',
      shopify: '{Colour} {Material} Pebble Stones Bag - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Pebble bags are not sculptures; closest standard product type assigned per Q11.',
  },

  // ---------------- furniture ----------------
  {
    id: 'table',
    labelEN: 'Table',
    labelES: 'Mesa',
    family: 'furniture',
    aliases: ['table', 'tables', 'mesa', 'mesas', 'stand'],
    allowedShapes: ['diamond', 'rustic', 'round', 'squared'],
    hairlineFigure: 'table',
    shopifyCategory: 'Furniture > Tables',
    shopifyProductType: 'Home Decor > Tables',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Shape} Table, {Size} cm',
      shopify: '{Colour} {Material} {Shape} Stone Table - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Q4 decided: table moves from Sculptures and Statues to Furniture > Tables (verified path).',
  },
  {
    id: 'coffee-table',
    labelEN: 'Coffee Table',
    labelES: 'Mesa de centro',
    family: 'furniture',
    aliases: ['coffee table', 'cofee table', 'mesa de centro'],
    allowedShapes: ['coffee'],
    hairlineFigure: null,
    shopifyCategory: 'Furniture > Tables > Accent Tables > Coffee Tables',
    shopifyProductType: 'Home Decor > Tables',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Coffee Table, {Size} cm',
      shopify: '{Colour} {Material} Coffee Table - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Verified path (Accent Tables > Coffee Tables).',
  },
  {
    id: 'table-set',
    labelEN: 'Table Set',
    labelES: 'Juego de mesas',
    family: 'furniture',
    aliases: ['table set', 'tables set', 'juego de mesas'],
    allowedShapes: ['set'],
    hairlineFigure: null,
    shopifyCategory: 'Furniture > Tables',
    shopifyProductType: 'Home Decor > Tables',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Table Set of {Count}, {Size} cm',
      shopify: '{Colour} {Material} Table Set - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Set (Q3 union). Verified table path is used.',
  },
  {
    id: 'couch',
    labelEN: 'Couch',
    labelES: 'Sofa',
    family: 'furniture',
    aliases: ['couch', 'couches', 'sofa', 'sofas', 'sillon', 'v shaped couch'],
    allowedShapes: [],
    hairlineFigure: 'couch',
    shopifyCategory: 'Furniture > Sofas',
    shopifyProductType: 'Furniture > Sofas',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} {Shape} Couch, {Size} cm',
      shopify: '{Colour} {Material} {Shape} Stone Couch - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Q5 decided: category Furniture > Sofas (verified). Product type Furniture > Sofas per Q11.',
  },
  {
    id: 'chair',
    labelEN: 'Chair',
    labelES: 'Silla',
    family: 'furniture',
    aliases: ['chair', 'chairs', 'silla', 'sillas'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Furniture > Chairs',
    shopifyProductType: 'Furniture > Chairs',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Chair, {Size} cm',
      shopify: '{Colour} {Material} Stone Chair - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Q5 decided: category Furniture > Chairs (verified). Product type Furniture > Chairs per Q11.',
  },
  {
    id: 'bar',
    labelEN: 'Bar',
    labelES: 'Barra',
    family: 'furniture',
    aliases: ['bar', 'bars', 'barra', 'barras'],
    allowedShapes: ['l shaped'],
    hairlineFigure: 'bar',
    shopifyCategory: 'Furniture > Bars & Bar Carts',
    shopifyProductType: 'Home Decor > Tables',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Bar, {Shape}, {Size} cm',
      shopify: '{Colour} {Material} Freestanding Bar - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Category path Furniture > Bars & Bar Carts.',
  },

  // ---------------- wine ----------------
  {
    id: 'wine-rack',
    labelEN: 'Wine Rack',
    labelES: 'Portavinos',
    family: 'wine',
    aliases: ['wine rack', 'wine racks', 'rustic wine rack', 'portavinos', 'cava', 'home decor > wine racks'],
    allowedShapes: ['rustic wine rack'],
    hairlineFigure: 'wine-rack',
    shopifyCategory: 'Furniture > Cabinets & Storage > Wine Racks',
    shopifyProductType: 'Home Decor > Wine Racks',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Wine Rack, {Holes} Holes, {Size} cm',
      shopify: '{Holes} {Colour} {Material} Rustic Wine Rack - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Holes come from the Type text ("N Holes"). Never state a bottle capacity unless the hole count is recorded.',
  },

  // ---------------- small items ----------------
  {
    id: 'chess-set',
    labelEN: 'Chess Set',
    labelES: 'Juego de ajedrez',
    family: 'small-items',
    aliases: ['chess', 'chess set', 'italian chess', 'ajedrez', 'board games > chess sets'],
    allowedShapes: ['italian chess'],
    hairlineFigure: null,
    shopifyCategory: 'Toys & Games > Games > Board Games',
    shopifyProductType: 'Board Games > Chess Sets',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Chess Set, {Size} cm',
      shopify: '{Colour} {Material} Chess Set - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Parent category verified; Board Games > Chess Sets.',
  },
  {
    id: 'candleholder',
    labelEN: 'Candleholder',
    labelES: 'Candelero',
    family: 'small-items',
    aliases: ['candleholder', 'candle holder', 'candle holders', 'candle', 'candelero', 'candeleros'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Decor > Home Fragrance Accessories > Candle Holders',
    shopifyProductType: 'Home Decor > Candleholders',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Candleholder, {Top}, {Size} cm',
      shopify: '{Colour} {Material} Candleholder - {Feature}',
    },
    openTop: 'required-confirm',
    note: 'Owner decision Q4: category Candle Holders (verified path under Home Fragrance Accessories).',
  },
  {
    id: 'coaster',
    labelEN: 'Coaster',
    labelES: 'Posavasos',
    family: 'small-items',
    aliases: ['coaster', 'coasters', 'portavaso', 'posavasos'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Kitchen & Dining > Barware > Coasters',
    shopifyProductType: 'Home Decor > Coasters',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Coaster, {Size} cm',
      shopify: '{Colour} {Material} Coaster - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Category path Home & Garden > Kitchen & Dining > Barware > Coasters.',
  },
  {
    id: 'wine-stopper',
    labelEN: 'Wine Stopper',
    labelES: 'Tapon para vino',
    family: 'small-items',
    aliases: ['wine stopper', 'wine stoppers', 'stopper', 'tapon'],
    allowedShapes: [],
    hairlineFigure: null,
    shopifyCategory: 'Home & Garden > Kitchen & Dining > Barware > Wine Accessories > Wine Stoppers',
    shopifyProductType: 'Barware > Wine Stoppers',
    colourPatternRule: 'lookup-canonical-map',
    titlePattern: {
      invoice: '{Colour} {Material} Wine Stopper, {Size} cm',
      shopify: '{Colour} {Material} Wine Stopper - {Feature}',
    },
    openTop: 'not-needed',
    note: 'Owner decision Q4: category Barware > Wine Accessories > Wine Stoppers.',
  },
];

/** Shape overrides applied before the type lookup (Q1 decided). */
export const SHAPE_OVERRIDES: readonly { whenType: string; whenShape: string; mapTo: string }[] = [
  { whenType: 'rock', whenShape: 'fountain', mapTo: 'fountain' },
  { whenType: 'wall-panel', whenShape: 'pair', mapTo: 'panel-pair' },
];

/** Colour rule (Q6 & Q8 decided). The mapping table is src/lib/colorVocabulary.ts CANONICAL_COLOR_MAP. */
export const COLOUR_PATTERN_RULE = {
  source: 'src/lib/colorVocabulary.ts CANONICAL_COLOR_MAP',
  allowedValues: 'src/lib/colorExtractor.ts ALLOWED_SHOPIFY_COLORS',
  maxValues: 3,
  substitutions: { 'Turquoise/Aqua': 'Teal' } as const,
  decided: 'Q8 (owner, 2026-10-17): "Multicolor" is correct; "Mulicolor" was a misspelling.',
  openLocationQuestion: 'Exact Shopify location name for the quantity column (ask Grant: Settings > Locations).',
  copyKeeps: 'the stone or variety name, e.g. "Green Talan Onyx"',
} as const;

/** Open or closed top source (6.5): intake field plus AI pre-fill with confirmation. */
export const TOP_FIELD = {
  name: 'top',
  values: ['open', 'closed'] as const,
  requiredFor: [
    'pendant', 'table-lamp', 'floor-lamp', 'bowl', 'canoe', 'tray', 'plate',
    'basin', 'sink', 'vase', 'shot-glass', 'candleholder',
  ] as const,
  status: 'DECIDED (Q10): intake field (Add Entry and vendor XLSX) plus AI pre-fill from the item photo when empty, with a person confirming.',
  prefill: 'ai-from-photo-then-human-confirm',
} as const;

/** Lowercase, strip accents, collapse spaces for alias matching. */
export function normalizeAlias(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolves canonical 826 Type ID considering shape overrides and aliases. */
export function resolve826TypeId(rawType: unknown, rawShape?: unknown): string {
  const normType = normalizeAlias(rawType);
  const normShape = normalizeAlias(rawShape);

  // Check shape overrides first (e.g., rock with shape fountain is fountain)
  for (const ov of SHAPE_OVERRIDES) {
    if (normType === ov.whenType && normShape.includes(ov.whenShape)) {
      return ov.mapTo;
    }
  }

  // Exact ID match ("Floor Lamp" and "floor-lamp" both name floor-lamp)
  const asId = normType.replace(/[\s_]+/g, '-');
  const exact = ONYX826_TAXONOMY.find(e => e.id === normType || e.id === asId);
  if (exact) return exact.id;

  // Alias lookup
  for (const entry of ONYX826_TAXONOMY) {
    if (entry.aliases.some(a => normType === normalizeAlias(a) || normType.includes(normalizeAlias(a)))) {
      return entry.id;
    }
  }

  return normType;
}

/** Gets the taxonomy entry for an item type and optional shape. */
export function getOnyx826Entry(typeIdOrAlias: unknown, shape?: unknown): OnyxTaxonomyEntry | undefined {
  const id = resolve826TypeId(typeIdOrAlias, shape);
  return ONYX826_TAXONOMY.find(e => e.id === id);
}

/**
 * Returns true if the type needs an open/closed top specification (lamps and vessels).
 */
export function needsTopFlag(typeIdOrAlias: unknown, shape?: unknown): boolean {
  const entry = getOnyx826Entry(typeIdOrAlias, shape);
  if (!entry) return false;
  return entry.openTop === 'required' || entry.openTop === 'required-confirm';
}

/**
 * Returns true if the type belongs to the 'lamps' or 'vessels' family.
 */
export function isLampOrVesselFamily(typeIdOrAlias: unknown, shape?: unknown): boolean {
  const entry = getOnyx826Entry(typeIdOrAlias, shape);
  if (!entry) return false;
  return entry.family === 'lamps' || entry.family === 'vessels';
}

/**
 * Returns approved Shopify colors for 826 items using CANONICAL_COLOR_MAP,
 * with Turquoise/Aqua replaced by Blue, keeping at most 3 colors.
 */
export function getApprovedShopifyColors826(vendorColor: string): readonly string[] {
  const clean = String(vendorColor ?? '').trim();
  if (!clean) return [];

  // Exact map lookup
  let mapped: readonly ShopifyColor[] | undefined = CANONICAL_COLOR_MAP[clean];
  if (!mapped) {
    // Try case-insensitive lookup
    const norm = clean.toLowerCase();
    const key = Object.keys(CANONICAL_COLOR_MAP).find(k => k.toLowerCase() === norm);
    if (key) mapped = CANONICAL_COLOR_MAP[key];
  }

  const rawColors = mapped && mapped.length ? mapped : [clean as ShopifyColor];
  const result: string[] = [];
  const allowedSet = new Set<string>(ALLOWED_SHOPIFY_COLORS as readonly string[]);

  for (const c of rawColors) {
    let sub: string = c;
    if (sub === 'Turquoise/Aqua') sub = 'Teal';
    if (allowedSet.has(sub) && !result.includes(sub)) {
      result.push(sub);
    }
  }

  return result.slice(0, 3);
}


/**
 * Builds deterministic identification / invoice title according to Book 826 per-family templates.
 * Pure function: assembled purely from record fields (color, material, shape, type, top flag, dimensions).
 */
export function buildInvoiceTitle826(item: any): string {
  const rawType = String(item.type || item.short_description || item.shortDescription || '');
  const rawShape = String(item.shape || '');
  const entry = getOnyx826Entry(rawType, rawShape);
  const family = entry?.family ?? 'lamps';

  let color = String(item.vendorColor || item.color || 'Onyx').trim();
  color = color.replace(/\bAqua\b/gi, 'Teal');
  const material = String(item.material || 'Onyx').trim();

  // Map shape variants (Squared -> Square, Cylindrical -> Cylinder)
  let normShape = rawShape.trim();
  if (/^squared$/i.test(normShape)) normShape = 'Square';
  else if (/^cylindrical$/i.test(normShape)) normShape = 'Cylinder';
  else if (/^round$/i.test(normShape)) normShape = 'Round';
  else if (/^rectangular$/i.test(normShape)) normShape = 'Rectangular';

  // Normalized noun
  let typeNoun = entry?.labelEN ?? (rawType.trim() || 'Luminary');
  if (/tower\s*lamp/i.test(typeNoun)) typeNoun = 'Floor Lamp';

  // Top flag
  const topVal = String(item.top || item.data?.top || '').trim().toLowerCase();
  const topStr = topVal === 'open' ? 'Open Top'
    : topVal === 'closed' ? 'Closed Top'
      : (needsTopFlag(rawType, rawShape) ? '[Top: confirm]' : '');

  // Dimensions
  const w = item.widthCm ?? item.width_cm;
  const h = item.heightCm ?? item.height_cm;
  const l = item.lengthCm ?? item.length_cm;
  let sizeStr = '';
  if (w && h) {
    if (!l || Number(w) === Number(l)) {
      sizeStr = `${w} x ${h}`;
    } else {
      sizeStr = `${w} x ${l} x ${h}`;
    }
  } else if (w && l && h) {
    sizeStr = `${w} x ${l} x ${h}`;
  }

  switch (family) {
    case 'lamps': {
      const parts = [
        color,
        material !== color ? material : '',
        normShape,
        typeNoun,
      ].filter(Boolean).join(' ');
      const meta = [topStr, sizeStr ? `${sizeStr} cm` : ''].filter(Boolean).join(', ');
      return meta ? `${parts}, ${meta}` : parts;
    }
    case 'vessels': {
      let label = typeNoun;
      if (/canoe/i.test(rawType) || /canoe/i.test(rawShape)) label = 'Canoe Tray';
      const parts = [
        color,
        material !== color ? material : '',
        normShape && normShape !== 'Regular' && !label.includes(normShape) ? normShape : '',
        label,
      ].filter(Boolean).join(' ');
      const meta = [topStr, sizeStr ? `${sizeStr} cm` : ''].filter(Boolean).join(', ');
      return meta ? `${parts}, ${meta}` : parts;
    }
    case 'panels-mirrors': {
      if (/painted/i.test(rawType) || entry?.id === 'painted-wall-panel') {
        const subject = normShape || 'Scene';
        const parts = `Painted ${color} ${material} Wall Panel, ${subject}`;
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/mirror/i.test(rawType) || entry?.id === 'mirror') {
        const parts = [color, material !== color ? material : '', normShape, 'Mirror'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      const isPair = /pair/i.test(rawType) || /pair/i.test(normShape);
      const panelNoun = isPair ? 'Wall Panel Pair' : 'Wall Panel';
      const parts = [color, material !== color ? material : '', normShape, panelNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm${isPair ? ' (each)' : ''}` : parts;
    }
    case 'rocks-fountains-sculpture': {
      if (/fountain/i.test(rawType) || /fountain/i.test(rawShape)) {
        const parts = [color, material !== color ? material : '', 'Fountain'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/sculpture/i.test(rawType)) {
        const subject = normShape || 'Sculpture';
        const parts = [color, material !== color ? material : '', subject, 'Sculpture'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/pillar/i.test(rawType)) {
        const parts = [color, material !== color ? material : '', 'Pillar'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/ball/i.test(rawType) || /sphere/i.test(rawType)) {
        const parts = [color, material !== color ? material : '', 'Sphere'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/bag|pebble/i.test(rawType)) {
        return [color, material !== color ? material : '', 'Pebble Stones Bag'].filter(Boolean).join(' ');
      }
      const parts = [color, material !== color ? material : '', 'Natural Rock'].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'furniture': {
      const tableNoun = /coffee/i.test(rawType) ? 'Coffee Table' : typeNoun;
      const parts = [color, material !== color ? material : '', normShape, tableNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'wine': {
      const parts = [color, material !== color ? material : '', normShape, 'Wine Rack'].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'small-items': {
      const parts = [color, material !== color ? material : '', normShape, typeNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    default: {
      const parts = [color, material !== color ? material : '', normShape, typeNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
  }
}
