/**
 * Decide how to build an item's mesh, from `shape` + `generated_type` together.
 *
 * Neither field is sufficient alone, which is why this reads both:
 *
 *   · `shape` is free text and overloaded. Across the 497 production rows it
 *     mixes real geometry (`squared` 113, `cylinder` 110) with pure SIZES
 *     (`medium` 41, `large` 34, `small` 16, `mini` 8 -- 99 rows where shape says
 *     nothing at all about form) and with figurative subjects (`horses`, `elk`,
 *     `deer`, `venus`).
 *
 *   · `generated_type` is Shopify taxonomy, present on 444 of 497 rows and far
 *     more reliable -- but unnormalised. `Home Decor > Pendant Lights`,
 *     `Home Decor > Pendant Lamps`, `Lighting > Pendant Lamps`,
 *     `Home Decor > Lighting > Pendant` and `Home Decor > Pendant Lighting` are
 *     five spellings of one thing, so it has to be reduced to a leaf first.
 *
 * Type wins where present, shape fills the gaps, and a dimension-ratio
 * heuristic catches the 53 rows that have no type at all.
 */
import type { InventoryItemData } from '../../lib/Types';

/** How the mesh gets built -- not what the product is called. */
export type GeometryStrategy =
  | 'lathe'       // rotationally symmetric: pendants, lamps, bowls, fountains  (292 items)
  | 'extrude'     // prismatic slab: wall panels, tables, wine racks             (91 items)
  | 'tray'        // extruded outline with an inner recess: trays, canoes        (30 items)
  | 'mirror'      // frame ring plus a reflective face                           (22 items)
  | 'placeholder'; // no usable signal                                           (15 items)

/**
 * Size words that appear in `shape` but describe no geometry. Listed explicitly
 * so they fall through to `generated_type` instead of matching some keyword by
 * accident -- 99 items depend on this.
 */
const SIZE_ONLY_SHAPES = new Set([
  'mini', 'small', 'medium', 'large', 'xl', 'xxl', 'rustic',
  'small - medium - mini',
]);

/**
 * Types whose real form is beyond any silhouette or profile approximation, and
 * which are therefore the priority queue for the img2threejs GLB pipeline.
 * They still get a best-effort mesh in the meantime -- a fountain is a decent
 * lathe, a wine rack a decent slab -- but they are badged so nobody mistakes
 * the approximation for a scan.
 */
const NEEDS_CAPTURE = /wine rack|fountain|sculpt|chess|horse|elk|deer|moose|bear|bobcat|climber|cactus|venus|chair|flame/i;

/** [pattern, strategy], first match wins. Applied to the normalised type leaf. */
const TYPE_RULES: ReadonlyArray<readonly [RegExp, GeometryStrategy]> = [
  [/mirror/,                                    'mirror'],
  [/tray|canoe/,                                'tray'],
  [/panel|table$|wine rack|chess/,              'extrude'],
  [/pendant|lamp|light|bowl|vessel|ball|fountain|basin|vase/, 'lathe'],
];

/** Applied to raw `shape` when the type gave nothing. */
const SHAPE_RULES: ReadonlyArray<readonly [RegExp, GeometryStrategy]> = [
  [/mirror/,                                            'mirror'],
  [/canoe|tray/,                                        'tray'],
  [/cylinder|round|sphere|basin|boulder|pebble|ball/,    'lathe'],
  [/squar|rectang|cube|diamond|panel|l shaped|s shape|irregular|free form/, 'extrude'],
];

/**
 * `'Home Decor > Lighting > Pendant Lamps'` -> `'pendant lamp'`.
 *
 * Takes the breadcrumb leaf, lowercases, and singularises. The singulariser is
 * deliberately naive -- it only has to collapse the handful of plurals that
 * actually occur in this column ('Lights', 'Lamps', 'Bowls', 'Panels',
 * 'Mirrors', 'Fountains', 'Racks', 'Sets') and must not mangle words ending in
 * 'ss'.
 */
export function normalizeType(generatedType?: string): string {
  if (!generatedType) return '';

  const leaf = generatedType.split('>').pop()?.trim().toLowerCase() ?? '';
  if (!leaf) return '';

  return leaf
    .split(/\s+/)
    .map(word => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
      ? word.slice(0, -1)
      : word))
    .join(' ');
}

/**
 * Last resort for the 53 rows with no type: infer from proportions.
 *
 * A roughly square footprint means the piece is most likely turned on an axis,
 * and a footprint much wider than it is tall means a slab. Crude, but it is
 * strictly better than the grey box these items get today, and it applies to
 * the 38 of them that do have dimensions.
 */
function strategyFromDimensions(item: InventoryItemData): GeometryStrategy | null {
  const w = parseFloat(item.widthCm || '');
  const l = parseFloat(item.lengthCm || '');
  const h = parseFloat(item.heightCm || '');

  if (![w, l, h].every(v => Number.isFinite(v) && v > 0)) return null;

  const footprintRatio = Math.max(w, l) / Math.min(w, l);
  const flatness = h / Math.max(w, l);

  if (flatness < 0.2) return 'extrude';        // markedly flatter than wide -- a slab
  if (footprintRatio < 1.25) return 'lathe';   // near-square footprint -- turned
  return 'extrude';
}

export function resolveGeometryStrategy(item: InventoryItemData): GeometryStrategy {
  const typeLeaf = normalizeType(item.generatedType);
  for (const [pattern, strategy] of TYPE_RULES) {
    if (pattern.test(typeLeaf)) return strategy;
  }

  const shape = (item.shape || '').trim().toLowerCase();
  if (shape && !SIZE_ONLY_SHAPES.has(shape)) {
    for (const [pattern, strategy] of SHAPE_RULES) {
      if (pattern.test(shape)) return strategy;
    }
  }

  return strategyFromDimensions(item) ?? 'placeholder';
}

/** True when this item really wants a captured or procedurally built model. */
export function needsCapture(item: InventoryItemData): boolean {
  return NEEDS_CAPTURE.test(item.generatedType || '') || NEEDS_CAPTURE.test(item.shape || '');
}

/** Short badge text for the catalogue card. */
export function strategyLabel(strategy: GeometryStrategy): string {
  switch (strategy) {
    case 'lathe':       return 'Turned';
    case 'extrude':     return 'Slab';
    case 'tray':        return 'Tray';
    case 'mirror':      return 'Mirror';
    case 'placeholder': return 'Unmodelled';
  }
}
