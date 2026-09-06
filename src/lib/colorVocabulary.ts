/**
 * Every colour value the inventory actually holds, mapped to the Shopify
 * vocabulary.
 *
 * GENERATED from the "Onyx Colour Vocabulary" review page
 * (https://claude.ai/code/artifact/0310db3f-f57d-45b2-8806-885f0ce2eafe),
 * which is where the mapping is reviewed and corrected. Regenerate from that
 * page rather than editing entries here, or the two drift apart -- which is the
 * whole reason this file exists instead of a short heuristic table.
 *
 * The keys are the 69 canonical values left in public.inventory.color after the
 * 6 Sep 2026 normalisation collapsed 104 spellings (479 rows rewritten; the
 * originals are kept in public.color_normalization_backup_20260906). Most of
 * them are stone varieties, finishes or the quarry region rather than colours --
 * only about an eighth of the rows ever held a word from Shopify's own colour
 * list -- so this mapping is what lets the export fill a metaobject-reference
 * column that the source field cannot fill on its own.
 *
 * Lookup is case-insensitive on the caller's side, so a row that was entered
 * after the normalisation still resolves if it matches a key in any casing.
 * Anything not listed here falls through to the token-by-token matcher in
 * MainHeader, which is what handles new vocabulary until this file is
 * regenerated.
 */
import type { ShopifyColor } from './colorExtractor';

export const CANONICAL_COLOR_MAP: Record<string, readonly ShopifyColor[]> = {
    'Amber':                       ['Orange', 'Yellow'],
    'Amber Emperor':               ['Orange', 'Yellow', 'Brown'],
    'Amber Gray':                  ['Orange', 'Yellow', 'Gray'],
    'Aqua':                        ['Turquoise/Aqua'],
    'Aqua Serpentine':             ['Turquoise/Aqua', 'Green', 'Brown'],
    'Assorted':                    ['Multicolor'],
    'Assorted Colors':             ['Multicolor'],
    'Beige':                       ['Cream', 'Tan'],
    'Beige Cristaline':            ['Cream', 'Tan', 'Clear'],
    'Black':                       ['Black'],
    'Black Zebra':                 ['Black', 'White', 'Brown'],
    'Blue':                        ['Blue'],
    'Brown Tehuacan':              ['Brown'],
    'Chocolate':                   ['Brown'],
    'Cristaline':                  ['Clear', 'White'],
    'Cristaline Amber':            ['Orange', 'Yellow', 'Clear'],
    'Cristaline Brown':            ['Brown', 'Clear', 'White'],
    'Cristaline Gray':             ['Gray', 'Clear', 'White'],
    'Cristaline Gray Amber':       ['Gray', 'Orange', 'Yellow'],
    'Cristaline Green':            ['Green', 'Clear', 'White'],
    'Cristaline Green Amber':      ['Green', 'Orange', 'Yellow'],
    'Cristaline Green Gray':       ['Green', 'Gray', 'Clear'],
    'Cristaline Pink':             ['Pink', 'Clear', 'White'],
    'Emperor':                     ['Brown', 'Gray', 'Cream'],
    'Galaxy':                      ['Black', 'Gray', 'Multicolor'],
    'Golden':                      ['Gold'],
    'Gray':                        ['Gray'],
    'Gray Green':                  ['Gray', 'Green'],
    'Green':                       ['Green'],
    'Green Amber':                 ['Green', 'Orange', 'Yellow'],
    'Green Brown Vein':            ['Green', 'Brown'],
    'Green Gray Cristaline':       ['Green', 'Gray', 'Clear'],
    'Green Talan':                 ['Green', 'Brown', 'Tan'],
    'Green Talan Black':           ['Green', 'Black', 'Brown'],
    'Ice Gray':                    ['Gray', 'Clear', 'White'],
    'Multicolor':                  ['Multicolor'],
    'Multicolor Orange':           ['Multicolor', 'Orange'],
    'Multicolor White':            ['Multicolor', 'White'],
    'Nacar':                       ['Iridescent', 'White', 'Cream'],
    'Orange':                      ['Orange'],
    'Orange Black Brown':          ['Orange', 'Black', 'Brown'],
    'Orange Cosmic':               ['Orange', 'Multicolor'],
    'Orange Green White':          ['Orange', 'Green', 'White'],
    'Pearlescent':                 ['Iridescent', 'White', 'Cream'],
    'Pink':                        ['Pink'],
    'Pink Gray':                   ['Pink', 'Gray'],
    'Pink Serpentine':             ['Pink', 'Green', 'Brown'],
    'Pink Serpentine Amber':       ['Pink', 'Orange', 'Yellow'],
    'Pink Serpentine Cristaline':  ['Pink', 'Green', 'Brown'],
    'Pink Zebra':                  ['Pink', 'Black', 'White'],
    'Purple Green':                ['Purple', 'Green'],
    'Red Pyramid':                 ['Red', 'Brown', 'Orange'],
    'Red Pyramid Jasper':          ['Red', 'Brown', 'Orange'],
    'Serpentine':                  ['Green', 'Brown', 'Cream'],
    'Tehuacan':                    ['White'],
    'Tehuacan Amber':              ['Orange', 'Yellow'],
    'Tehuacan Gray':               ['Gray'],
    'Tehuacan Green':              ['Green'],
    'Tehuacan Ice':                ['Clear', 'White', 'Gray'],
    'Tehuacan Large Gray Rim':     ['Gray'],
    'Tehuacan Mint':               ['Green', 'Cream'],
    'Tehuacan Small Gray Rim':     ['Gray'],
    'Tehuacan W Green':            ['Green'],
    'Tehuacan White':              ['White'],
    'White':                       ['White'],
    'White Amber':                 ['White', 'Orange', 'Yellow'],
    'White Ice':                   ['White', 'Clear', 'Gray'],
    'Yellow':                      ['Yellow'],
    'Zebra':                       ['Black', 'White', 'Brown'],
};

/** Same keys, lower-cased, so a lookup does not have to care about casing. */
const LOOKUP: Record<string, readonly ShopifyColor[]> = Object.fromEntries(
    Object.entries(CANONICAL_COLOR_MAP).map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * The Shopify colours for a whole raw colour value, or null when the value is
 * not one this file knows -- null means "fall back", never "no colours".
 */
export function lookupCanonicalColors(raw: string): readonly ShopifyColor[] | null {
    if (!raw) return null;
    return LOOKUP[raw.trim().toLowerCase()] ?? null;
}
