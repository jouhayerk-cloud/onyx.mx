/**
 * One builder per AI job, each returning { system, prompt, schema }.
 *
 * These replace the prompts that were inlined in catalogHubPipeline.ts (the
 * cylinder and generic content prompts, the donor prompt, the cloud and
 * hybrid segmentation prompts) and the Batch Create translation prompt. The
 * copy rules are the ones the catalogue was generated with -- see
 * vocabulary.ts -- with three known defects removed:
 *
 * - The box-set variant fired for every pendant. It now needs a real
 *   multi-piece cylinder set (isCylinderBoxSet), and the "N items in this
 *   limited edition collection" line is left out when the count is unknown,
 *   instead of claiming 41.
 * - The donor prompt had no title, colour, type or terminology rules.
 * - The "Return ONLY valid JSON in this exact structure" blocks are gone. JSON
 *   mode and the schemas below enforce the shape, and the colour and type
 *   lists are enums the API itself checks.
 */
import {
    ALLOWED_SHOPIFY_COLORS,
    SHOPIFY_PRODUCT_TYPES,
    TITLE_RULE,
    BODY_RULE,
    SAY_IT_ONCE_RULE,
    COLOR_RULE,
    STUDIO_BLACK_RULE,
    LAMP_RULE,
    TYPE_RULE,
    STONE_VARIETY_NAMES,
} from './vocabulary';
import { sizeLabel, type PipelineItem } from './item';
import type { DonorCandidate } from '../variationMatch';

export interface BuiltPrompt {
    system?: string;
    prompt: string;
    schema: object;
}

/** The four things one content call can produce. */
export type ContentField = 'title' | 'body' | 'colors' | 'type';
export const ALL_CONTENT_FIELDS: readonly ContentField[] = ['title', 'body', 'colors', 'type'];

const FIELD_KEY: Record<ContentField, string> = {
    title: 'title',
    body: 'body',
    colors: 'dominantColors',
    type: 'generatedType',
};

/**
 * The full content schema. Field descriptions repeat the rule headlines so
 * the shape and the rules travel together.
 */
const CONTENT_PROPERTIES = {
    title: { type: 'string', description: 'Product title, 60 to 70 characters, Title Case, no articles, no final period.' },
    body: { type: 'string', description: 'Marketing description, 1000 to 1200 characters of clean HTML using only <p>, <ul> and <li>.' },
    dominantColors: {
        type: 'array',
        items: { type: 'string', enum: [...ALLOWED_SHOPIFY_COLORS] },
        minItems: 2,
        maxItems: 3,
    },
    generatedType: { type: 'string', enum: [...SHOPIFY_PRODUCT_TYPES] },
} as const;

/**
 * The donor variant has no photo and a template to follow: its body takes the
 * template's length, and its colours come from the one recorded colour, so a
 * single-colour record must be allowed to stay single.
 */
const DONOR_PROPERTIES = {
    ...CONTENT_PROPERTIES,
    body: { type: 'string', description: 'Marketing description in clean HTML using only <p>, <ul> and <li>, matching the template in length and structure.' },
    dominantColors: { ...CONTENT_PROPERTIES.dominantColors, minItems: 1 },
} as const;

/** The schema for just the fields asked for, so an unticked process is not generated. */
export function contentSchema(fields: readonly ContentField[] = ALL_CONTENT_FIELDS, variant: 'photo' | 'donor' = 'photo'): object {
    const keys = fields.map(f => FIELD_KEY[f]);
    const props: Record<string, unknown> = variant === 'donor' ? DONOR_PROPERTIES : CONTENT_PROPERTIES;
    return {
        type: 'object',
        properties: Object.fromEntries(keys.map(k => [k, props[k]])),
        required: keys,
        propertyOrdering: keys,
    };
}

export const CONTENT_SCHEMA = contentSchema();

export interface ContentPromptOptions {
    variant: 'photo' | 'donor';
    /** The finished item the donor variant writes a variation of. */
    donor?: DonorCandidate;
    /**
     * A real multi-piece cylinder set (see isCylinderBoxSet). The pieces are
     * counted from the photo; collectionTotal, when known, is quoted as the
     * size of the limited edition.
     */
    boxSet?: { collectionTotal?: number };
    /** Which fields to generate. Default: all four. */
    fields?: readonly ContentField[];
}

/**
 * The donor's own body and colour rules. BODY_RULE's veining and translucency
 * emphasis and fixed length, and COLOR_RULE's minimum of two, contradicted the
 * donor prompt's "do not invent what you cannot know" and "match the
 * template" -- and validateCopy cannot catch invented veining, so the
 * retry-then-refuse gate let that copy through.
 */
const DONOR_BODY_RULE =
    `Marketing description in clean HTML (<p>, <ul>, <li>), matching the template's length and structure. ` +
    `Keep it premium and engaging about artisanal Mexican stone craftsmanship, but describe only what the new item's recorded attributes support.`;
const DONOR_COLOR_RULE =
    `An array of 1 to 3 color names selected strictly from this allowed list: [${ALLOWED_SHOPIFY_COLORS.join(', ')}], ` +
    `taken from the new item's recorded colour and material. Add a second colour only when the record names one.`;

/** Numbered rules for the requested fields, in the order the old prompts used. */
function fieldRules(fields: readonly ContentField[], boxSet: ContentPromptOptions['boxSet'], studioPhoto: boolean, donor = false): string[] {
    const rules: string[] = [];
    if (fields.includes('title')) {
        rules.push(`"title": ${TITLE_RULE}${boxSet ? ' (e.g., "Mexican Onyx Cylinder Pendant Light Fixtures - Box Set").' : ''}`);
    }
    if (fields.includes('body')) {
        const sub = [`   - ${SAY_IT_ONCE_RULE}`];
        if (boxSet) {
            sub.push(`   - You MUST COUNT the exact number of individual cylinder pieces visible in this photo (e.g. 9 pieces, 12 pieces, etc.) and state clearly early in the description: "This box set contains [X] pieces" (replacing [X] with the exact number of cylinders you counted in the image).`);
            if (boxSet.collectionTotal && boxSet.collectionTotal > 1) {
                sub.push(`   - You MUST also mention later in the description that this set is part of a larger limited edition master collection (stating clearly: "${boxSet.collectionTotal} items in this limited edition collection").`);
            }
            sub.push(`   - Emphasize how each cylinder in the set showcases unique natural veining and warm translucent glow when illuminated.`);
        }
        rules.push(`"body": ${donor ? DONOR_BODY_RULE : BODY_RULE}\n${sub.join('\n')}`);
    }
    if (fields.includes('colors')) {
        const sub: string[] = [];
        if (boxSet) {
            sub.push(`   - CRITICAL COLOR RULE: Completely IGNORE the black studio background cloth! NEVER include "Black" as a dominant color for translucent cylinder pendants! Choose only the true natural stone colors (e.g. Cream, Tan, Brown, Orange, White, Green, etc.).`);
        } else if (studioPhoto) {
            sub.push(`   - ${STUDIO_BLACK_RULE}`);
        }
        rules.push(`"dominantColors": ${donor ? DONOR_COLOR_RULE : COLOR_RULE}${sub.length ? '\n' + sub.join('\n') : ''}`);
    }
    // The terminology rule applies to whatever text is written.
    if (fields.includes('title') || fields.includes('body')) {
        rules.push(boxSet
            ? `Do NOT use the word 'lamp'. ALL fixtures MUST be described as 'Luminary' or 'Luminaries' or 'Light Fixtures'.`
            : LAMP_RULE);
    }
    if (fields.includes('type')) {
        rules.push(`"generatedType": ${TYPE_RULE}${boxSet ? ' For Cylinder Pendants, always choose "Home Decor > Pendant Lights".' : ''}`);
    }
    return rules.map((r, i) => `${i + 1}. ${r}`);
}

/**
 * Title, marketing HTML, colours and type for one item.
 *
 * 'photo' reads the hero photo (sent alongside as an image part). 'donor' has
 * no photo: it varies the finished copy of the most similar catalogued item
 * (variationMatch.findDonor), and must not invent what a photo would show.
 */
export function buildContentPrompt(item: PipelineItem, opts: ContentPromptOptions): BuiltPrompt {
    const fields = opts.fields && opts.fields.length ? opts.fields : ALL_CONTENT_FIELDS;
    const schema = contentSchema(fields, opts.variant);

    if (opts.variant === 'donor') {
        const d = opts.donor;
        if (!d) throw new Error('buildContentPrompt: the donor variant needs a donor');
        const selfSize = sizeLabel(item) || 'not recorded';
        const donorSize = sizeLabel(d) || 'not recorded';

        const prompt = `You are writing catalogue copy for Rare Earth Gallery, a dealer in Mexican onyx.

Below is the finished copy for an item ALREADY in the catalogue. Write the equivalent copy for a DIFFERENT piece of the same kind, described underneath it.

EXISTING ITEM (the template -- match its voice, length and structure):
  Title: ${d.description}
  Body: ${d.marketingDescription}
  Colours: ${(d.dominantColors || []).join(', ')}
  Type: ${d.generatedType}
  Shape / type / material / colour: ${d.shape} / ${d.type} / ${d.material} / ${d.color}
  Size (w x h x l cm): ${donorSize}

THE NEW ITEM you are writing for:
  Shape: ${item.shape || 'unspecified'}
  Type: ${item.type || 'unspecified'}
  Material: ${item.material || 'onyx'}
  Recorded colour: ${item.vendorColor || 'unspecified'}
  Size (w x h x l cm): ${selfSize}

RULES
- This is a VARIATION, not a copy. Do not reuse the template's sentences verbatim.
- There is NO photograph of the new item. Describe only what its recorded
  attributes support. Do not invent veining, patterns, inclusions or markings
  you cannot know.
- Where the new item's recorded colour differs from the template's, follow the
  NEW item's colour.
- Use the new item's own dimensions wherever the template cites size.
- dominantColors must come from the new item's recorded colour and material,
  not be copied from the template.
- generatedType should match the template's unless the new item's shape or type
  clearly indicates otherwise.

FIELD RULES
${fieldRules(fields, undefined, false, true).join('\n')}`;
        return { prompt, schema };
    }

    const material = item.material || 'Onyx';
    const shape = item.shape || 'Artifact';
    const type = item.type || 'Object';
    const color = item.vendorColor || 'Natural Veining';

    const intro = opts.boxSet
        ? `FIND and ANALYZE the collection of Mexican Onyx Cylinder Pendant Lamps/Fixtures in this image.
Notice: These cylinder pendants are packed in SETS / BOXES against a black studio background, and this photo shows the exact items included in this specific Box Set.

CRITICAL RULES FOR CYLINDER PENDANTS:`
        : `FIND the ${material} ${shape} ${type}.
Generate comprehensive catalog content for this item based on its features, shape, material (${material}), and color (${color}).

CRITICAL RULES:`;

    return {
        prompt: `${intro}\n${fieldRules(fields, opts.boxSet, true).join('\n')}`,
        schema,
    };
}

// ── Segmentation ────────────────────────────────────────────────────────────

export const SEGMENTATION_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax], normalized 0-1000' },
            label: { type: 'string' },
            polygon: {
                type: 'array',
                items: { type: 'array', items: { type: 'integer' } },
                description: '[y, x] points, normalized 0-1000',
            },
        },
        required: ['box_2d', 'label'],
        propertyOrdering: ['box_2d', 'label', 'polygon'],
    },
} as const;

export interface SegmentationLayer {
    box_2d: number[];
    label: string;
    polygon?: number[][];
}

/**
 * Boxes and the mirror_glass polygon for the cloud and hybrid modes.
 *
 * Only boxes and one polygon, never base64 masks: several masks in one answer
 * blow through the output token limit. The cutout itself comes from the
 * local contour; these labels decide what each layer is.
 */
export function buildSegmentationPrompt(
    item: PipelineItem,
    mode: 'cloud' | 'hybrid',
    opts: { boxSet?: boolean; pointCount?: number } = {},
): BuiltPrompt {
    const shape = item.shape || 'object';

    const cylinderSet = `Notice these items are packed in SETS (multiple vertical stone cylinders arranged in a row or grid against a black studio background).
Instructions:
1. You MUST include the entire set of cylinders in the bounding box. Do NOT ignore any cylinder in the group.
2. Output a SINGLE bounding box labeled 'cylinder_set' that encompasses all cylinders shown in the photo from the top-leftmost cylinder edge to the bottom-rightmost cylinder edge.
3. Completely ignore black studio background edges, cardboard on the floor, or extraneous studio objects.`;

    if (mode === 'cloud') {
        const prompt = opts.boxSet
            ? `Find ALL the Cylinder Pendant Onyx lamps/fixtures in the image. ${cylinderSet}`
            : `Find the primary, central ${shape} Onyx artifact in the image. Ignore any other artifacts in the background or corners.
Instructions:
1. Focus ONLY on the artifact closest to the center of the image.
2. If it is a bowl, basin, or canoe, strictly extract and separate the 'rim', 'interior', and 'exterior' of that central artifact ONLY.
3. CRITICAL: You MUST include the natural, rough, or unpolished outer rock edges as part of the artifact. Do NOT crop out or ignore the rough edges (e.g. the bark-like exterior or rustic edges of bowls and canoes).
4. For MIRRORS, the SOLID ONYX MIRROR FRAME is your absolute priority. You MUST output exactly TWO objects:
   - 1. A bounding box labeled 'mirror_frame' that encompasses the entire stone frame (outer edge). Do NOT provide a polygon for this.
   - 2. A polygon labeled 'mirror_glass' that tightly traces the exact inner boundary where the onyx frame meets the center glass reflection.
   - CRITICAL for mirror_glass: Provide a 'polygon' array of 24 to 36 [y, x] coordinates (normalized 0-1000) tracing the inner edge of the stone frame. You MUST output enough points to accurately capture the natural wavy irregular inner contour of the stone. This polygon will be used to cut out the center reflection.
   - Completely EXCLUDE cardboard on the floor, people holding the mirror, and any reflections of the floor/people visible INSIDE the mirror glass from your consideration.`;
        return { prompt, schema: SEGMENTATION_SCHEMA };
    }

    const points = opts.pointCount ? ` (with ${opts.pointCount} vector points)` : '';
    const prompt = opts.boxSet
        ? `We performed initial GPU segmentation on these Cylinder Pendant Onyx lamps/fixtures. Now perform Cloud AI Refinement.\n${cylinderSet}`
        : `We performed initial local GPU segmentation on this ${shape} Onyx artifact${points}. Now perform Cloud AI Vector Refinement to generate clean semantic layers and boundaries.
Instructions:
1. Focus ONLY on the primary artifact in the center of the image. Ignore cardboard, studio backgrounds, or people.
2. For MIRRORS, the SOLID ONYX MIRROR FRAME is your absolute priority. You MUST output exactly TWO objects:
   - A bounding box labeled 'mirror_frame' encompassing the outer edge of the stone frame.
   - A polygon labeled 'mirror_glass' tracing the exact inner boundary where the onyx frame meets the reflection glass (provide 24 to 36 [y, x] coordinates normalized 0-1000).
3. For bowls, basins, or canoes, separate 'rim', 'interior', and 'exterior' if distinct, or output a single comprehensive bounding box including all rough rock exterior edges.`;
    return { prompt, schema: SEGMENTATION_SCHEMA };
}

// ── Translation ─────────────────────────────────────────────────────────────

/**
 * Keyed pairs rather than a bare array: a positional answer one entry short
 * shifted every later translation onto the wrong row, which is why Batch
 * Create had to throw the whole answer away on a length mismatch.
 */
export const TRANSLATE_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            source: { type: 'string' },
            english: { type: 'string' },
        },
        required: ['source', 'english'],
        propertyOrdering: ['source', 'english'],
    },
} as const;

export interface TranslationPair {
    source: string;
    english: string;
}

/**
 * Spanish -> English for the attribute columns of an imported sheet (shape,
 * Type, colour, material, vendor description).
 *
 * The old prompt described a "stone/fountain/garden decor" business selling
 * planters and benches, applied "1-3 words" and Title Case to free text, and
 * had no glossary, so variety names the colour tables key on could be
 * translated away.
 */
export function buildTranslatePrompt(texts: string[]): BuiltPrompt {
    const prompt = `You are a translator for the inventory of a dealer in handmade Mexican onyx and natural stone pieces: bowls, canoes, vases, sinks, bathtubs, tables, mirrors, wall panels, fountains, sculptures, and luminaries (pendant, table and floor).
Translate the following Spanish words/phrases to English. They are product attributes: shapes, types, colors, materials, and short descriptions.

RULES:
- Return one entry per input, with "source" set to the input text exactly as given and "english" set to its translation.
- Single attributes (a shape, a type, a colour, a material) stay SHORT: 1-3 words. Longer descriptions are translated in full, not shortened.
- Use standard inventory/product terminology in English.
- If a word is already English or is a proper noun, keep it as-is.
- Stone variety names are names, not words to translate. Keep them exactly as written: ${STONE_VARIETY_NAMES.join(', ')}. The one exception is "Ambar", which is written "Amber".
- Keep the input's capitalisation; write translated single attributes in Title Case.

Input array:
${JSON.stringify(texts)}`;
    return { prompt, schema: TRANSLATE_SCHEMA };
}

// ── Detection ───────────────────────────────────────────────────────────────

export const DETECTION_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax], normalized 0-1000' },
            label: { type: 'string' },
        },
        required: ['box_2d', 'label'],
        propertyOrdering: ['box_2d', 'label'],
    },
} as const;

export interface DetectionBox {
    box_2d: number[];
    label: string;
}

/**
 * Labelled boxes for spatial_boxes_2d (BatchActionsModal's "2D Boxes").
 *
 * Boxes only. The old inline prompt also asked for points and the modal
 * wrote them into spatial_points, which is where the 20x20 hex map lives.
 */
export function buildDetectionPrompt(item: PipelineItem): BuiltPrompt {
    const what = [item.shape, item.material || 'onyx'].filter(Boolean).join(' ');
    const prompt = `Detect the ${what} piece in this photo and tag its distinct parts (for example rim, interior, exterior, base, frame, shade).
Ignore the black studio background, its dark padding, cardboard, people and anything else that is not the piece.
Return one entry per part, with "box_2d" as [ymin, xmin, ymax, xmax] normalized to 0-1000 and a short lowercase "label".`;
    return { prompt, schema: DETECTION_SCHEMA };
}

// ── Masks (ProcessView) ─────────────────────────────────────────────────────

/** Gemini 2.5's native segmentation answer: a box and a PNG mask of that box. */
export const MASK_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax], normalized 0-1000' },
            mask: { type: 'string', description: 'base64 PNG probability mask of the box region' },
            label: { type: 'string' },
        },
        required: ['box_2d', 'mask', 'label'],
        propertyOrdering: ['box_2d', 'mask', 'label'],
    },
} as const;

export const EDGE_MASK_SCHEMA = {
    type: 'object',
    properties: { mask: { type: 'string', description: 'base64 grayscale PNG mask' } },
    required: ['mask'],
} as const;

export interface MaskLayer {
    box_2d: number[];
    mask: string;
    label: string;
}

/**
 * ProcessView's segmentation: the parts of the piece as masks, or, with
 * guidance points from the workspace, the one object they pick out.
 * Points are { x, y } in 0-100 of the photo and 'pos' | 'neg'.
 */
export function buildMaskPrompt(item: Pick<PipelineItem, 'shape'>, points: { x: number; y: number; type: 'pos' | 'neg' }[] = []): BuiltPrompt {
    if (points.length > 0) {
        const p = points.map(pt => `[${Math.round(pt.y * 10)}, ${Math.round(pt.x * 10)}, ${pt.type === 'pos' ? 'POSITIVE' : 'NEGATIVE'}]`).join(', ');
        return {
            prompt: `REFINEMENT MODE: Use these guidance points ([y, x] normalized 0-1000): ${p}. Give the segmentation mask for the object associated with the POSITIVE points and EXCLUDE areas with NEGATIVE points. Label it "refined".`,
            schema: MASK_SCHEMA,
        };
    }
    return {
        prompt: `Give the segmentation masks for this ${item.shape || 'onyx'} Onyx artifact. Ignore the black studio background and its dark padding. If it is a bowl or basin, strictly extract and separate the 'rim', 'interior' (inside depth) and 'exterior' (outer wall) as separate masks.`,
        schema: MASK_SCHEMA,
    };
}

/** Second pass on a crop of one part: a tighter mask of its edge. */
export function buildEdgeMaskPrompt(): BuiltPrompt {
    return {
        prompt: `Edge Segmenter: extract a highly precise binary mask (grayscale PNG) of the artifact in this crop.`,
        schema: EDGE_MASK_SCHEMA,
    };
}
