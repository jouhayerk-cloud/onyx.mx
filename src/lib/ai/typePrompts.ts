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
import type { ContentField } from './prompts';
import { COPY_BANNED_CLAIMS, COPY_LIMITS, type TypePromptSpec } from './typePromptSpec';
import { TYPE_PROMPT_SPECS } from './typePromptData';

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
