/**
 * The brand and terminology rules, written once.
 *
 * They used to be pasted into each prompt by hand: the title rules twice,
 * the colour list twice (as a literal, not from ALLOWED_SHOPIFY_COLORS), the
 * "lamp -> Luminary" rule twice, and the donor prompt had none of them, so a
 * variation could come back with a lamp, an 85-character title and a colour
 * Shopify rejects. Every builder in prompts.ts injects these blocks, and
 * finalize.ts enforces the parts that can be checked after the fact.
 *
 * The wording is the wording the ~500 catalogued items were generated with.
 * Change it here, deliberately, and every prompt moves together.
 */
import { ALLOWED_SHOPIFY_COLORS, type ShopifyColor } from '../colorExtractor';
import { SHOPIFY_PRODUCT_TYPES } from '../utils';

export { ALLOWED_SHOPIFY_COLORS, SHOPIFY_PRODUCT_TYPES };
export type { ShopifyColor };

export type ShopifyProductType = typeof SHOPIFY_PRODUCT_TYPES[number];

/** Grant's brief: 60-70 characters, enforced by the export's word-boundary trim. */
export const TITLE_MIN_CHARS = 60;
export const TITLE_MAX_CHARS = 70;

export const TITLE_RULE =
    `A product title of ${TITLE_MIN_CHARS} to ${TITLE_MAX_CHARS} characters, and NEVER longer than ${TITLE_MAX_CHARS}. ` +
    `Capitalize Every Word Like This. Do NOT use articles (a, an, the, and). Do NOT end with a period.`;

export const BODY_RULE =
    `A 1000 to 1200 character marketing description formatted in clean HTML (<p>, <ul>, <li>). ` +
    `Make it premium and engaging, emphasizing artisanal Mexican stone craftsmanship, translucency and natural veining.`;

export const SAY_IT_ONCE_RULE =
    `Say each thing ONCE. Do not restate the title, the material or the colour after the opening sentence, ` +
    `and do not close with a summary of what you just said. Every sentence must add a fact or an image the reader did not already have.`;

export const COLOR_RULE =
    `An array of 2 to 3 color names selected strictly from this allowed list: [${ALLOWED_SHOPIFY_COLORS.join(', ')}].`;

/**
 * Every photo is shot on black studio cloth, and resizeImage pads it with
 * #121212 on top of that. The cylinder prompt was the only one that said so,
 * which left Black free to win on any dark-edged photo of a cream bowl.
 */
export const STUDIO_BLACK_RULE =
    `The photo is taken against a black studio background cloth with dark padding around it. ` +
    `That background is not the stone: name Black only when the stone itself is black.`;

/** Grant, 21 Jul. finalize.ts also rewrites "Luminarie" via normalizeBrandTerms. */
export const LAMP_RULE =
    `Do NOT use the word 'lamp'. ALL lamps MUST be described as 'Luminary' or 'Luminaries'.`;

export const TYPE_RULE =
    `Choose ONE category strictly from this allowed list: [${SHOPIFY_PRODUCT_TYPES.join(', ')}]. ` +
    `CRITICAL RULE: Canoes, canoe dishes, or canoe bowls MUST be classified as "Home Decor > Decorative Trays".`;

/**
 * Stone variety names that are names, not words to translate. The colour
 * mappers (STONE_VARIETY_COLORS in MainHeader.tsx, getStoneStyleColors in
 * colorExtractor.ts) key on them as typed, so a translator that turned
 * "Nacar" into "Mother Of Pearl" or "Talan" into something English silently
 * broke the colour column downstream. "Ambar" is the one exception: Grant
 * asked for it to read "Amber", and both tables already accept either.
 */
export const STONE_VARIETY_NAMES = [
    'Talan', 'Zebra', 'Emperor', 'Ice', 'Pearlescent', 'Nacar', 'Cristaline',
    'Galaxy', 'Cloud', 'Cosmic', 'Queretaro', 'Tehuacan', 'Guatemala', 'Serpentine',
] as const;
