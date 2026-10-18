/**
 * The per-Type prompt contract (owner decision, 11 Oct 2026): every generated field is written from a spec for the Type of the piece,
 * not from one generic recipe. The generic BODY_RULE made every description the same 2,000 characters of "artisanal Mexican stone
 * craftsmanship, translucency and natural veining", so the copy repeated itself across items and ran long.
 *
 * Two files fill this contract:
 *   typePromptData.ts   the data: one TypePromptSpec per canonical Type (TYPE_PROMPT_SPECS)
 *   typePrompts.ts      the logic: promptSpecFor(typeId), typeGuidanceFor(item), and the prompt builders that use it
 *
 * Canonical Type ids are the ones in src/lib/canonicalType.ts AFTER the unifications of 11 Oct 2026: floor-lamp (a tower lamp is a
 * floor lamp), wall-panel (a luminary is a wall panel). Sub-shape facts (form, size, top, holes) come from
 * src/features/entry/hairline/variantOptions.ts parseShapeText, never from the model.
 * Pure: no React, no I/O.
 */

/** What a description may state about the piece, taken from the record, never invented. */
export type CopyFact = 'dimensions' | 'form' | 'size' | 'top' | 'holes' | 'material' | 'colour' | 'variety' | 'quantity' | 'finish';

/** A word the title must contain. */
export type TitlePart = 'type' | 'colour' | 'material' | 'form' | 'size' | 'variety';

export interface TypePromptSpec {
    /** Canonical Type id: pendant, table-lamp, floor-lamp, bowl, canoe, plate, basin, rock, fountain, sculpture, pillar, ball, bag, wall-panel, painted-wall-panel, mirror, wine-rack, table, couch, bar. */
    readonly typeId: string;
    /** The Type as a title noun, Title Case: "Floor Lamp". */
    readonly noun: string;
    readonly nounPlural: string;
    /**
     * The noun the DESCRIPTION uses when the client has a rule for it: lamps are "Luminary" (Grant, 21 Jul: never the word lamp).
     * null: the description uses `noun`.
     */
    readonly descriptionNoun: string | null;
    /** True for pieces that are lit (lamps, wall panels): only then may the copy talk about light passing through the stone. */
    readonly lit: boolean;
    /** The Shopify product type for this Type. The model never chooses it; one of SHOPIFY_PRODUCT_TYPES. */
    readonly shopifyType: string;
    readonly title: {
        /** A pattern with the words in order, for example "{Size} {Colour} Onyx {Noun}". Maximum 70 characters in the result. */
        readonly pattern: string;
        /** 3 examples, each 40 to 70 characters, none claiming anything the record cannot hold. */
        readonly examples: readonly string[];
        readonly mustInclude: readonly TitlePart[];
    };
    readonly description: {
        /** The one angle of this Type, a sentence: what a buyer wants to know about it ("how it stands and how it lights a room"). */
        readonly angle: string;
        /** The paragraphs and bullets, in order, one short instruction each, 2 to 4 entries. */
        readonly structure: readonly string[];
        /** Hard ceiling for the whole description in words (typically 70 to 110). */
        readonly maxWords: number;
        /** Facts the description should state when the record has them. */
        readonly facts: readonly CopyFact[];
        /** 3 to 5 short use cases or settings, specific to the Type, for the closing line (not reused word for word across Types). */
        readonly useCases: readonly string[];
    };
    readonly colours: {
        /** 2 or 3. */
        readonly max: number;
        /** Rule for this Type, one sentence: where the dominant colour is seen first (body, rim, face, panel). */
        readonly note: string;
    };
    /** Claims and phrases this Type must not use (in addition to COPY_BANNED_CLAIMS). */
    readonly forbidden: readonly string[];
    /** Anything else the writer must know about this Type, one or two sentences. */
    readonly notes: string;
}

/**
 * Phrases the copy must not contain unless the record states them (the review of the six EM826 items found them invented in every
 * description). They are matched case-insensitively as whole words or phrases by validateCopy.
 */
export const COPY_BANNED_CLAIMS: readonly string[] = [
    'hand-carved', 'hand carved', 'hand-selected', 'hand selected', 'meticulously', 'heirloom', 'generations', 'centuries-old', 'centuries old',
    'rare', 'exquisite', 'unparalleled', 'masterpiece', 'testament', 'investment', 'flawless', 'inner glow', 'one-of-a-kind', 'artisanal',
];

/** Limits that apply to every Type. */
export const COPY_LIMITS = {
    titleMaxChars: 70,
    /** Hard ceiling for any description, whatever the Type says. */
    descriptionMaxWords: 120,
    /** Sentence openers that must not repeat inside one description. */
    maxBullets: 4,
} as const;

// ── Book 826 Catalog Specifications ──────────────────────────────────────────

/**
 * Forbidden carving and making words for Book 826 unless the record's process field states them (Q9).
 */
export const COPY_BANNED_PROCESS_WORDS_826: readonly string[] = [
    'carved', 'carving', 'hand-carved', 'hand carved', 'crafted', 'hand-crafted', 'hand crafted',
    'hand-made', 'handmade', 'sculpted', 'hewn', 'chiseled', 'cut', 'slabbed',
    'polished by hand', 'artisan', 'artisanal',
];

/**
 * Flowery or sales hype words for Book 826 that are NEVER allowed.
 */
export const COPY_BANNED_HYPE_WORDS_826: readonly string[] = [
    'magnificent', 'exquisite', 'striking', 'refined', 'breathtaking', 'meticulously',
    'precisely', 'masterpiece', 'heirloom', 'rare', 'stunning', 'unparalleled',
    'flawless', 'one-of-a-kind', 'investment', 'testament', 'inner glow',
];

/**
 * Combined banned claims for 826 when no process is stated.
 */
export const COPY_BANNED_WORDS_826: readonly string[] = [
    ...COPY_BANNED_PROCESS_WORDS_826,
    ...COPY_BANNED_HYPE_WORDS_826,
    'hand-selected', 'hand selected', 'generations', 'centuries-old', 'centuries old',
];

/** Strict copy limits for Book 826 (Q7: 600-750 characters plain text). */
export const COPY_LIMITS_826 = {
    shopifyTitleMinChars: 60,
    shopifyTitleMaxChars: 70,
    bodyMinChars: 600,
    bodyMaxChars: 750,
} as const;

/** Output contract for Book 826 generation. */
export interface Prompt826Output {
    invoiceTitle: string;
    shopifyTitle: string;
    body: string;
    shopifyCategory: string;
    shopifyProductType: string;
    colourPattern: readonly string[];
    tags: readonly string[];
    copyStatus: 'draft' | 'reviewed' | 'approved';
}

/** Validation issues flagged by 826 output validators. */
export interface Validation826Issue {
    field: 'invoiceTitle' | 'shopifyTitle' | 'body' | 'colours' | 'category' | 'productType';
    rule: string;
    message: string;
    severity: 'error' | 'warning';
}

export interface Validation826Result {
    valid: boolean;
    issues: readonly Validation826Issue[];
}

