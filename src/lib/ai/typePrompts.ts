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
import { ALLOWED_SHOPIFY_COLORS } from './vocabulary';
import type { PipelineItem } from './item';
import type { ContentField, BuiltPrompt } from './prompts';
import {
    COPY_BANNED_CLAIMS,
    COPY_LIMITS,
    COPY_BANNED_PROCESS_WORDS_826,
    COPY_BANNED_HYPE_WORDS_826,
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
} from '../taxonomy/onyx826';

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

/**
 * Builds deterministic identification / invoice title according to Book 826 per-family templates.
 */
export function buildInvoiceTitle826(item: any): string {
    const rawType = String(item.type || item.short_description || item.shortDescription || '');
    const rawShape = String(item.shape || '');
    const entry = getOnyx826Entry(rawType, rawShape);
    const family = entry?.family ?? 'lamps';

    const color = String(item.vendorColor || item.color || 'Onyx').trim();
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
            const holes = (item.type || '').match(/(\d+)\s*Holes?/i)?.[1] || (item.shape || '').match(/(\d+)\s*Holes?/i)?.[1];
            const holesStr = holes ? `${holes} Holes, ` : '';
            const parts = [color, material !== color ? material : '', 'Wine Rack'].filter(Boolean).join(' ');
            return `${parts}, ${holesStr}${sizeStr ? `${sizeStr} cm` : ''}`.replace(/,\s*$/, '');
        }
        case 'small-items': {
            if (/chess/i.test(rawType)) {
                const parts = [color, material !== color ? material : '', 'Chess Set'].filter(Boolean).join(' ');
                return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
            }
            const parts = [color, material !== color ? material : '', typeNoun].filter(Boolean).join(' ');
            return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
        }
        default: {
            const parts = [color, material !== color ? material : '', normShape, typeNoun].filter(Boolean).join(' ');
            return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
        }
    }
}

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

