/**
 * Per-Type prompt guidance builder for Onyx.mx AI pipeline.
 *
 * Implements the per-Type prompt contract (owner decision, 11 Oct 2026):
 * every generated field (title, description, colours, type) is written from
 * a dedicated spec for the piece's canonical Type, replacing the repetitive generic rules.
 *
 * Pure: no React, no I/O.
 */
import { currentTypeId, parseShapeText } from '../../features/entry/hairline/variantOptions';
import { canonicalType } from '../canonicalType';
import {
    ALLOWED_SHOPIFY_COLORS,
    CHARACTER_PATTERN_TOKENS,
    CHARACTER_TONE_TOKENS,
    CHARACTER_POSITION_TOKENS,
    CHARACTER_FORBIDDEN_NOUNS,
} from './vocabulary';
import type { PipelineItem } from './item';
import type { ContentField, BuiltPrompt } from './prompts';
import {
    COPY_BANNED_CLAIMS,
    COPY_LIMITS,
    COPY_BANNED_PROCESS_WORDS_826,
    COPY_BANNED_HYPE_WORDS_826,
    COPY_BANNED_WORDS_826,
    COPY_LIMITS_826,
    type TypePromptSpec,
    type Prompt826Output,
    type Validation826Issue,
    type Validation826Result,
} from './typePromptSpec';
import { TYPE_PROMPT_SPECS, FAMILY_826_SPECS } from './typePromptData';
import {
    getOnyx826Entry,
    resolve826TypeId,
    getApprovedShopifyColors826,
    needsTopFlag,
    buildInvoiceTitle826,
} from '../taxonomy/onyx826';

export { buildInvoiceTitle826 };

export const ALL_CONTENT_FIELDS: readonly ContentField[] = ['title', 'body', 'colors', 'type'];

/**
 * Resolves a TypePromptSpec by canonical type ID, accounting for unified types
 * (luminary -> wall-panel, tower-lamp -> floor-lamp).
 */
export function promptSpecFor(typeId: string | null | undefined): TypePromptSpec | null {
    const id = currentTypeId(typeId);
    if (!id) return null;
    return TYPE_PROMPT_SPECS.find(s => s.typeId === id) ?? null;
}

/**
 * Returns the canonical Type id for a pipeline item.
 */
export function itemTypeId(item: PipelineItem): string | null {
    const res = canonicalType(item.type, item.shape);
    if (res.id) return res.id;
    const direct = currentTypeId(item.type);
    if (direct && promptSpecFor(direct)) return direct;
    return null;
}

/**
 * Returns the Shopify product type for a canonical type id, read from its spec.
 */
export function shopifyTypeFor(typeId: string | null | undefined): string | null {
    const spec = promptSpecFor(typeId);
    return spec ? spec.shopifyType : null;
}

/**
 * Strips stone variety and material words from vendor colour to get the plain stone colour.
 */
export function plainStoneColor(vendorColor: string): string {
    const vc = vendorColor.trim();
    if (!vc) return '';
    for (const c of ALLOWED_SHOPIFY_COLORS) {
        const re = new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
        if (re.test(vc)) return c;
    }
    return vc;
}

function stableIndex(str: string, length: number): number {
    if (length <= 0) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % length;
}

function formatDimensions(item: PipelineItem): string {
    if (item.widthCm > 0 && item.heightCm > 0 && item.lengthCm > 0) {
        const wIn = (item.widthCm / 2.54).toFixed(1);
        const hIn = (item.heightCm / 2.54).toFixed(1);
        const lIn = (item.lengthCm / 2.54).toFixed(1);
        return `${item.widthCm} x ${item.heightCm} x ${item.lengthCm} cm (${wIn}" x ${hIn}" x ${lIn}")`;
    }
    return 'not recorded';
}

function formatWeight(item: PipelineItem): string {
    if (item.weightKg > 0) {
        return `${item.weightKg} kg`;
    }
    return 'unknown (do NOT state, estimate or imply weight or heaviness)';
}

function formatParsedShape(typeId: string, rawShape: string): string {
    const parsed = parseShapeText(typeId, rawShape);
    const parts: string[] = [];
    if (parsed.primary) {
        parts.push(`Primary: ${parsed.primary}`);
    }
    for (const [axis, val] of Object.entries(parsed.extra)) {
        parts.push(`${axis}: ${val}`);
    }
    if (parts.length > 0) {
        return parts.join(', ');
    }
    return rawShape.trim() || 'not recorded';
}

function genericGuidanceFor(item: PipelineItem, fields: readonly ContentField[]): string {
    const parts: string[] = [];
    parts.push(`RECORD FACTS:
- Type: ${item.type || 'Object'}
- Shape: ${item.shape || 'not recorded'}
- Dimensions: ${formatDimensions(item)}
- Weight: ${formatWeight(item)}`);

    if (fields.includes('title')) {
        parts.push(`TITLE INSTRUCTION:
- Maximum 70 characters. Capitalize Every Word. No articles (a, an, the, and). Do not end with a period.`);
    }

    if (fields.includes('body')) {
        parts.push(`DESCRIPTION INSTRUCTION:
- 400 to 700 characters, at most 100 words, clean HTML (<p>, <ul>, <li>).
- Describe only what the record and photo show.
- Do not repeat or restate the title. No closing summary.
- Each paragraph at most 3 sentences.`);
    }

    if (fields.includes('colors')) {
        const plain = plainStoneColor(item.vendorColor);
        parts.push(`COLOURS INSTRUCTION:
- 2 to 3 colours from allowed list: [${ALLOWED_SHOPIFY_COLORS.join(', ')}]
- Dominant colour first. Ignore the black studio backdrop cloth.
${item.vendorColor ? `- Recorded vendor colour: "${item.vendorColor}" (plain colour: "${plain}").` : ''}`);
    }

    if (fields.includes('type')) {
        parts.push(`TYPE INSTRUCTION:
- Choose from Shopify allowed product types.`);
    }

    parts.push(`FORBIDDEN CLAIMS:
${COPY_BANNED_CLAIMS.join(', ')}`);

    return parts.join('\n\n');
}

/**
 * Builds type-specific guidance text to inject into content prompts.
 */
export function typeGuidanceFor(item: PipelineItem, fields: readonly ContentField[] = ALL_CONTENT_FIELDS): string {
    const typeId = itemTypeId(item);
    const spec = promptSpecFor(typeId);
    if (!spec) {
        return genericGuidanceFor(item, fields);
    }

    const sections: string[] = [];

    // 1. Record Facts
    const parsedShapeStr = formatParsedShape(spec.typeId, item.shape);
    sections.push(`RECORD FACTS:
- Noun: ${spec.noun}
- Shopify Product Type: ${spec.shopifyType}
- Parsed shape attributes: ${parsedShapeStr}
- Dimensions: ${formatDimensions(item)}
- Weight: ${formatWeight(item)}`);

    // 2. Title Instruction
    if (fields.includes('title')) {
        sections.push(`TITLE INSTRUCTION:
- Pattern: ${spec.title.pattern}
- Maximum length: ${COPY_LIMITS.titleMaxChars} characters (strictly enforced).
- Must include: ${spec.title.mustInclude.join(', ')}
- Examples:
${spec.title.examples.map(ex => `  * ${ex}`).join('\n')}`);
    }

    // 3. Description Instruction
    if (fields.includes('body')) {
        const wordCeiling = Math.min(spec.description.maxWords, COPY_LIMITS.descriptionMaxWords);
        const nounForDesc = spec.descriptionNoun ?? spec.noun;
        const useCase = spec.description.useCases.length > 0
            ? spec.description.useCases[stableIndex(item.itemId || item.id || '', spec.description.useCases.length)]
            : null;

        const litRule = spec.lit
            ? '- Lighting: This piece is lit; describe how light passes through or illuminates the stone.'
            : '- Lighting: This piece is NOT lit. Do not describe light transmission, glowing, or translucency.';

        sections.push(`DESCRIPTION INSTRUCTION:
- Angle: ${spec.description.angle}
- Noun: Use "${nounForDesc}" to refer to the piece in the description.
- Word ceiling: Maximum ${wordCeiling} words (hard limit).
- Structure:
${spec.description.structure.map((step, idx) => `  ${idx + 1}. ${step}`).join('\n')}
- Facts to state when recorded: ${spec.description.facts.join(', ')}
${useCase ? `- Selected use case / setting to mention: "${useCase}"` : ''}
${litRule}
- Writing rules:
  * Do not repeat or restate the title.
  * Do not close with a summary or concluding sales pitch.
  * Each paragraph must contain at most 3 sentences.`);
    }

    // 4. Colours Instruction
    if (fields.includes('colors')) {
        const plain = plainStoneColor(item.vendorColor);
        sections.push(`COLOURS INSTRUCTION:
- Maximum colours: ${spec.colours.max}
- Placement rule: ${spec.colours.note}
- Allowed palette: Select only from [${ALLOWED_SHOPIFY_COLORS.join(', ')}]
- Dominant colour first.
- Completely ignore the black studio backdrop cloth.
${item.vendorColor ? `- Recorded vendor colour is "${item.vendorColor}". Use the plain stone colour ("${plain}") rather than trade variety names.` : ''}`);
    }

    // 5. Category / Type Instruction
    if (fields.includes('type')) {
        sections.push(`TYPE INSTRUCTION:
- Return exactly "${spec.shopifyType}" for generatedType.`);
    }

    // 6. Forbidden List
    const allForbidden = Array.from(new Set([...spec.forbidden, ...COPY_BANNED_CLAIMS]));
    sections.push(`FORBIDDEN CLAIMS & WORDS:
Never use the following words or claims unless explicitly stated in the record:
${allForbidden.join(', ')}`);

    return sections.join('\n\n');
}

// ── Catalog Book 826 Functions ───────────────────────────────────────────────

/**
 * Returns true if the workbook is Book 826 (e.g. '826', 'v826', 'book826').
 */
export function isBook826(workbook?: string | null): boolean {
    if (!workbook) return false;
    return String(workbook).replace(/\D/g, '') === '826';
}

// buildInvoiceTitle826 re-exported from ../taxonomy/onyx826

/**
 * Builds 826 per-family guidance for the AI prompt.
 */
export function typeGuidance826For(item: any): string {
    const rawType = String(item.type || item.short_description || item.shortDescription || '');
    const rawShape = String(item.shape || '');
    const entry = getOnyx826Entry(rawType, rawShape);
    const familyKey = entry?.family ?? 'lamps';
    const famSpec = FAMILY_826_SPECS.find(f => f.family === familyKey) || FAMILY_826_SPECS[0];

    const invoiceTitle = buildInvoiceTitle826(item);
    const approvedColors = getApprovedShopifyColors826(item.vendorColor || item.color || '');
    const processVal = String(item.process || item.data?.process || '').trim();

    const sections: string[] = [];

    // 1. Record Facts
    sections.push(`RECORD FACTS (Use ONLY facts from this record):
- Family: ${famSpec.name} (${famSpec.family})
- Canonical ID: ${entry?.id ?? 'custom'}
- Raw Vendor Type: ${rawType || 'unspecified'}
- Raw Shape: ${rawShape || 'unspecified'}
- Dimensions: ${item.widthCm ?? item.width_cm ?? '?'} x ${item.heightCm ?? item.height_cm ?? '?'} x ${item.lengthCm ?? item.length_cm ?? '?'} cm
- Weight: ${item.weightKg ? `${item.weightKg} kg` : 'not recorded (do NOT state, estimate or imply weight)'}
- Top: ${item.top || item.data?.top || 'not recorded'}
- Vendor Colour: ${item.vendorColor || item.color || 'unspecified'}
- Approved Colours: [${approvedColors.join(', ')}]
- Stated Process: ${processVal || 'none'}
- Deterministic Invoice Title: "${invoiceTitle}"`);

    // 2. Titles instruction
    sections.push(`TITLE INSTRUCTIONS:
- shopifyTitle: 60 to 70 characters strictly.
  * Format: Grant format, Title Case, no articles (a, an, the, and, of), no trailing period.
  * Use "Amber" and "Luminary" spelling (for lit pieces: "Table Luminary", "Floor Luminary", "Pendant Luminary").
  * Example length: exactly 60-70 characters.`);

    // 3. Body instruction
    sections.push(`BODY INSTRUCTIONS:
- body: Strictly 600 to 750 characters.
- MUST BE PLAIN TEXT ONLY. Never include HTML tags (<p>, <ul>, <li>, etc.).
- Angle: ${famSpec.angle}
- Structure:
${famSpec.structure.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}
- Vocabulary to use: ${famSpec.vocabulary.join(', ')}
${famSpec.lit ? '- Lighting: This piece is lit. Refer to it as Luminary and describe how light passes through translucent stone.' : '- Lighting: This piece is NOT lit. Do not claim light transmission, glowing, or translucency.'}`);

    // 4. Banned words and process gating
    const processRule = processVal
        ? `Record explicitly states process "${processVal}". You may mention "${processVal}". All other process words remain forbidden.`
        : `Record states NO process. All carving/making words are strictly forbidden (${COPY_BANNED_PROCESS_WORDS_826.join(', ')}).`;

    sections.push(`FORBIDDEN WORDS & RULES:
- Forbidden flowery/sales hype words (NEVER allowed): ${COPY_BANNED_HYPE_WORDS_826.join(', ')}
- Process words: ${processRule}
- Family-specific forbidden words: ${famSpec.forbidden.join(', ')}`);

    return sections.join('\n\n');
}

/**
 * Validates Book 826 generated output against owner rules.
 */
export function validate826Output(
    item: any,
    output: Partial<Prompt826Output>
): Validation826Result {
    const issues: Validation826Issue[] = [];
    const entry = getOnyx826Entry(item.type, item.shape);
    const processStated = String(item.process || item.data?.process || '').toLowerCase();

    // 1. Shopify title validation
    const shopifyTitle = (output.shopifyTitle || '').trim();
    if (shopifyTitle.length < COPY_LIMITS_826.shopifyTitleMinChars || shopifyTitle.length > COPY_LIMITS_826.shopifyTitleMaxChars) {
        issues.push({
            field: 'shopifyTitle',
            rule: 'length',
            message: `Shopify title must be 60-70 characters (currently ${shopifyTitle.length}).`,
            severity: 'error',
        });
    }
    if (shopifyTitle.endsWith('.')) {
        issues.push({
            field: 'shopifyTitle',
            rule: 'no-trailing-period',
            message: 'Shopify title must not end with a period.',
            severity: 'error',
        });
    }
    const articleMatch = shopifyTitle.match(/\b(a|an|the|and|of)\b/i);
    if (articleMatch) {
        issues.push({
            field: 'shopifyTitle',
            rule: 'no-articles',
            message: `Shopify title must not contain articles ("${articleMatch[0]}").`,
            severity: 'error',
        });
    }

    // 2. Body validation
    const body = (output.body || '').trim();
    if (body.length < COPY_LIMITS_826.bodyMinChars || body.length > COPY_LIMITS_826.bodyMaxChars) {
        issues.push({
            field: 'body',
            rule: 'length',
            message: `Body must be 600-750 characters plain text (currently ${body.length}).`,
            severity: 'error',
        });
    }
    if (/<[^>]+>/.test(body)) {
        issues.push({
            field: 'body',
            rule: 'no-html',
            message: 'Body must be plain text without HTML tags.',
            severity: 'error',
        });
    }

    // Lit rule check
    const isLit = entry ? (entry.family === 'lamps' || entry.id === 'wall-panel') : false;
    if (isLit) {
        if (/\blamp\b/i.test(body)) {
            issues.push({
                field: 'body',
                rule: 'lit-luminary',
                message: 'Body for lit pieces must use "Luminary", never "lamp".',
                severity: 'error',
            });
        }
    } else {
        if (/\b(translucent|backlit|glowing|light passes through)\b/i.test(body) && !item.lit) {
            issues.push({
                field: 'body',
                rule: 'non-lit-light-claims',
                message: 'Non-lit pieces must not claim light transmission or translucency.',
                severity: 'error',
            });
        }
    }

    // 3. Banned hype words scan
    const allText = `${shopifyTitle} ${body} ${output.invoiceTitle || ''}`;
    for (const word of COPY_BANNED_HYPE_WORDS_826) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(allText)) {
            issues.push({
                field: 'body',
                rule: 'banned-hype-word',
                message: `Forbidden hype word detected: "${word}".`,
                severity: 'error',
            });
        }
    }

    // 4. Banned process words scan
    for (const word of COPY_BANNED_PROCESS_WORDS_826) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(allText)) {
            if (!processStated || !processStated.includes(word.toLowerCase())) {
                issues.push({
                    field: 'body',
                    rule: 'banned-process-word',
                    message: `Process word "${word}" forbidden unless stated in record process field.`,
                    severity: 'error',
                });
            }
        }
    }

    // 5. Taxonomy match checks
    if (entry) {
        if (output.shopifyCategory && output.shopifyCategory !== entry.shopifyCategory) {
            issues.push({
                field: 'category',
                rule: 'taxonomy-category',
                message: `Shopify category "${output.shopifyCategory}" does not match taxonomy "${entry.shopifyCategory}".`,
                severity: 'warning',
            });
        }
        if (output.shopifyProductType && output.shopifyProductType !== entry.shopifyProductType) {
            issues.push({
                field: 'productType',
                rule: 'taxonomy-product-type',
                message: `Product type "${output.shopifyProductType}" does not match taxonomy "${entry.shopifyProductType}".`,
                severity: 'warning',
            });
        }
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/** Schema for Book 826 content generation */
export const CONTENT_SCHEMA_826 = {
    type: 'object',
    properties: {
        shopifyTitle: {
            type: 'string',
            description: 'Shopify product title, 60 to 70 characters, Title Case, no articles (a, an, the, and, of), no trailing period, Grant format.',
        },
        body: {
            type: 'string',
            description: 'Plain text description of the piece, strictly 600 to 750 characters, NO HTML tags, plain record facts.',
        },
        dominantColors: {
            type: 'array',
            items: { type: 'string', enum: [...ALLOWED_SHOPIFY_COLORS] },
            minItems: 1,
            maxItems: 3,
            description: '1 to 3 dominant approved stone colors.',
        },
    },
    required: ['shopifyTitle', 'body', 'dominantColors'],
    propertyOrdering: ['shopifyTitle', 'body', 'dominantColors'],
} as const;

/**
 * Builds the content prompt for Book 826 items.
 */
export function buildContentPrompt826(
    item: any,
    opts?: { fields?: readonly ContentField[] }
): BuiltPrompt {
    const guidance = typeGuidance826For(item);
    const invoiceTitle = buildInvoiceTitle826(item);

    const prompt = `You are writing catalogue copy for Rare Earth Gallery's Book 826 collection of Mexican stone artifacts.

Your goal is to produce accurate, strictly factual product copy adhering to owner-approved rules:
1. shopifyTitle: 60 to 70 characters, Title Case, no articles (a, an, the, and, of), no trailing period.
2. body: Strictly 600 to 750 characters of PLAIN TEXT (no HTML tags, no markup). Describe only record facts.
3. dominantColors: 1 to 3 approved colors.

PER-FAMILY GUIDANCE AND RECORD FACTS:
${guidance}

Return JSON with "shopifyTitle", "body", and "dominantColors".`;

    return {
        prompt,
        schema: CONTENT_SCHEMA_826,
    };
}


// ── Book 826 character_ai (AI_PROCESS_826_PLAN section B) ────────────────────

/** Schema for the character_ai call. */
export const CHARACTER_SCHEMA_826 = {
    type: 'object',
    properties: {
        character: {
            type: 'string',
            description: 'A 2 to 5 word visual descriptor of this exact piece: lowercase, no period, no stone or object name.',
        },
        confidence: {
            type: 'number',
            description: 'Confidence from 0 to 1.',
        },
    },
    required: ['character', 'confidence'],
} as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CHARACTER_HYPE_RE = new RegExp(
    `\\b(${[...COPY_BANNED_WORDS_826, 'natural', 'polished', 'honed', 'carved', 'unique', 'beautiful', 'gorgeous', 'piece', 'item']
        .map(escapeRe).join('|')})\\b`,
    'i',
);
const CHARACTER_NOUN_RE = new RegExp(`\\b(${CHARACTER_FORBIDDEN_NOUNS.map(escapeRe).join('|')})\\b`, 'i');

/** Lowercase words with a plural 's' dropped, so "veins" and "vein" compare equal. */
const characterTokens = (s: string): string[] => s
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/** True when the words hold the phrase as a run of consecutive words. */
const hasCharacterPhrase = (words: readonly string[], phrase: string): boolean => {
    const p = characterTokens(phrase);
    for (let i = 0; i + p.length <= words.length; i++) {
        if (p.every((t, j) => words[i + j] === t)) return true;
    }
    return false;
};

/**
 * Prompt for one character_ai descriptor. The photo, when there is one, goes with the call
 * as an image (see generateCharacterAi826 in prompts.ts).
 */
export function buildCharacterAiPrompt826(
    item: any,
    opts: { siblingDescriptors?: readonly string[] } = {},
): BuiltPrompt {
    const entry = getOnyx826Entry(item.type, item.shape);
    const label = entry?.labelEN ?? (String(item.type || '').trim() || 'piece');
    const material = String(item.material || 'Onyx').trim();
    const colour = String(item.vendorColor || item.color || 'colour not recorded').trim();
    const shape = String(item.shape || 'shape not recorded').trim();
    const siblings = opts.siblingDescriptors?.length
        ? opts.siblingDescriptors.map(s => `"${s}"`).join(', ')
        : 'none';

    const prompt = `You are cataloguing natural Mexican stone pieces for Onyx.mx.
Look at the attached photo of this ${label} (${shape}, stone/colour: ${material} / ${colour}).
Write a 2 to 5 word visual descriptor ("character") that identifies THIS exact piece's stone pattern, veining, or colour zone so a warehouse picker can tell it apart from identical ${label} siblings.

STRICT RULES:
1. Maximum 5 words (2 to 5 words total). Lowercase only, no period, no quotes.
2. Use ONLY concrete pattern, tone, and position words:
   - Pattern words: ${CHARACTER_PATTERN_TOKENS.join(', ')}
   - Tone words: ${CHARACTER_TONE_TOKENS.join(', ')}
   - Position words: ${CHARACTER_POSITION_TOKENS.join(', ')}
3. NEVER include the stone name (onyx, fluorite, calcite, travertine, marble, stone, rock, quartz) or the object type (lamp, bowl, sink, table, pedestal). The only allowed use of "crystal" is the pattern phrase "crystal pockets".
4. NEVER use hype or process words (stunning, unique, handcrafted, artisan, luxury, beautiful, natural, polished, carved).
5. SIBLING COLLISION RULE: Your phrase MUST clearly differ from existing sibling descriptors in the same group:
   EXISTING_SIBLINGS: ${siblings}

Return strict JSON: {"character": "<2-5 words>", "confidence": <0.0-1.0>}`;

    return { prompt, schema: CHARACTER_SCHEMA_826 };
}

/**
 * Checks one character_ai descriptor: 2 to 5 words, controlled vocabulary, no stone or object
 * name, no hype or process words, and not a near copy of a sibling (rule
 * "character_sibling_collision", which triggers the one retry).
 */
export function validateCharacterAi826(
    character: string,
    opts: { siblingDescriptors?: readonly string[] } = {},
): Validation826Result {
    const issues: Validation826Issue[] = [];
    const add = (rule: string, message: string) => {
        issues.push({ field: 'character', rule, message, severity: 'error' });
    };
    const text = String(character ?? '').trim();
    const words = text.split(/\s+/).filter(Boolean);

    if (words.length < 2 || words.length > 5) {
        add('length', `Character must be 2 to 5 words (currently ${words.length}).`);
    }
    if (text.length > 42) {
        add('length', `Character must be 42 characters or fewer (currently ${text.length}).`);
    }
    if (/[A-Z.!?"“”]/.test(text)) {
        add('format', 'Character must be lowercase, with no period or quotes.');
    }

    const noun = text.toLowerCase().replace(/crystal pockets/g, ' ').match(CHARACTER_NOUN_RE);
    if (noun) add('forbidden-noun', `Character must not name the stone or the object ("${noun[0]}").`);

    const hype = text.match(CHARACTER_HYPE_RE);
    if (hype) add('banned-hype-word', `Character must not use hype or process words ("${hype[0]}").`);

    const tokens = characterTokens(text);
    const hasPattern = CHARACTER_PATTERN_TOKENS.some(t => hasCharacterPhrase(tokens, t));
    const hasToneOrPosition = [...CHARACTER_TONE_TOKENS, ...CHARACTER_POSITION_TOKENS].some(t => hasCharacterPhrase(tokens, t));
    if (!hasPattern || !hasToneOrPosition) {
        add('vocabulary', 'Character needs one pattern word (bands, veins, ...) and one tone or position word (honey, top, ...).');
    }

    const mine = new Set(tokens);
    for (const sibling of opts.siblingDescriptors ?? []) {
        const theirs = new Set(characterTokens(sibling));
        if (!mine.size || !theirs.size) continue;
        const shared = [...mine].filter(t => theirs.has(t)).length;
        const union = new Set([...mine, ...theirs]).size;
        const same = tokens.join(' ') === characterTokens(sibling).join(' ');
        if (same || shared / union >= 0.75) {
            add('character_sibling_collision', `Too close to sibling descriptor "${sibling}".`);
            break;
        }
    }

    return { valid: issues.length === 0, issues };
}

/**
 * Deterministic fit of a Shopify title to the 60 to 70 character window: drops articles and a
 * trailing period, trims whole words over the limit, and appends the given qualifiers while the
 * title is short. No model call.
 */
export function fitShopifyTitle826(raw: string, qualifiers: readonly string[] = []): { title: string; valid: boolean } {
    const { shopifyTitleMinChars: min, shopifyTitleMaxChars: max } = COPY_LIMITS_826;
    const cap = (s: string): string[] => s
        .split(/\s+/)
        .filter(w => w && !/^(a|an|the|and|of)$/i.test(w))
        .map(w => (/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
    const joined = (ws: string[]) => ws.join(' ');

    let words = cap(String(raw ?? '').replace(/\.+\s*$/, ''));
    while (words.length && joined(words).length > max) words = words.slice(0, -1);
    for (const q of qualifiers) {
        if (joined(words).length >= min) break;
        const next = [...words, ...cap(q)];
        if (joined(next).length <= max) words = next;
    }

    const title = joined(words);
    return { title, valid: title.length >= min && title.length <= max };
}
