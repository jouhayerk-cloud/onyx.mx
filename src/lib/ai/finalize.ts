/**
 * The one post-processor for generated copy.
 *
 * Every path used to finish the model's answer differently. The per-card save
 * ran normalizeBrandTerms and formatProductTitle; the bulk SAVE TO DB ran
 * neither, so "Luminarie" and "Ambar" reached the table; only the MainHeader
 * export trimmed titles to 70 characters; only the donor path ran
 * validateCopy; and nothing checked colours or the product type before they
 * were saved, so values Shopify rejects were found at import time. Photo,
 * donor, Catalog Hub, Batch Create and Add Entry results all come through
 * finalizeContent now, and what is stored is what the export would ship.
 */
import { formatProductTitle, normalizeBrandTerms, isAllowedProductType, getProductCategoryAndType } from '../utils';
import { validateCopy, type CopyIssue } from '../copyValidation';
import { ALLOWED_SHOPIFY_COLORS, SHOPIFY_PRODUCT_TYPES, TITLE_MAX_CHARS } from './vocabulary';
import type { PipelineItem } from './item';
import { shopifyTypeFor, itemTypeId, promptSpecFor } from './typePrompts';
import { COPY_LIMITS } from './typePromptSpec';

/** What a content prompt asks the model for (see CONTENT_SCHEMA). */
export interface RawContent {
    title?: string;
    body?: string;
    dominantColors?: string[];
    generatedType?: string;
}

export interface FinalContent {
    title: string;
    html: string;
    colors: string[];
    genType: string;
    /** validateCopy findings: claims the item's record contradicts. */
    issues: CopyIssue[];
}

/**
 * Lifted from CatalogHubProcessesPanel, which was the only place that cleaned
 * generated HTML before rendering it. Only p, ul, ol, li, strong, em and br
 * survive, and every attribute is dropped, so nothing the model writes can
 * carry a handler, a style or a link.
 */
const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);

export function sanitizeHtml(html: string): string {
    if (!html) return '';
    return String(html).replace(/<([^>]+)>/g, (_match, inner: string) => {
        const body = inner.trim();
        const closing = body.startsWith('/');
        const name = body.replace(/^\//, '').split(/[\s/]+/)[0].toLowerCase();
        if (!ALLOWED_TAGS.has(name)) return '';
        if (closing) return `</${name}>`;
        return name === 'br' ? '<br />' : `<${name}>`;
    });
}

function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(s: string): number {
    const t = stripTags(s);
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function endsWithSentencePunctuation(s: string): boolean {
    const clean = s.replace(/<[^>]+>/g, '').trim();
    return /[.!?]['"”’\)]*$/.test(clean);
}

function balanceInlineTags(s: string): string {
    const tagRe = /<\/?([a-z0-9]+)[^>]*>/gi;
    const stack: string[] = [];
    const VOID = new Set(['br', 'hr', 'img']);
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(s)) !== null) {
        const tag = m[1].toLowerCase();
        if (VOID.has(tag)) continue;
        if (m[0].startsWith('</')) {
            const idx = stack.lastIndexOf(tag);
            if (idx !== -1) stack.splice(idx, 1);
        } else {
            stack.push(tag);
        }
    }
    let res = s;
    while (stack.length > 0) {
        res += `</${stack.pop()}>`;
    }
    return res;
}

interface RawBlock {
    kind: 'p' | 'ul' | 'ol';
    content: string;
}

function parseBlocks(html: string): RawBlock[] {
    const blocks: RawBlock[] = [];
    const blockRegex = /<(p|ul|ol)\b[^>]*>([\s\S]*?)(?:<\/\1>|(?=<(?:p|ul|ol)\b)|$)/gi;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    const firstTagIndex = html.search(/<(?:p|ul|ol)\b/i);
    if (firstTagIndex > 0) {
        const prefix = html.slice(0, firstTagIndex).trim();
        if (prefix) {
            blocks.push({ kind: 'p', content: prefix });
        }
    } else if (firstTagIndex === -1 && html.trim()) {
        blocks.push({ kind: 'p', content: html.trim() });
        return blocks;
    }

    while ((match = blockRegex.exec(html)) !== null) {
        const kind = match[1].toLowerCase() as 'p' | 'ul' | 'ol';
        const content = match[2].trim();
        if (content) {
            blocks.push({ kind, content });
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < html.length) {
        const suffix = html.slice(lastIndex).trim();
        if (suffix && !suffix.startsWith('</')) {
            blocks.push({ kind: 'p', content: suffix });
        }
    }

    return blocks;
}

/**
 * Post-processes generated marketing HTML:
 * (a) collapses sentences that repeat inside the text,
 * (b) cuts to the word ceiling at a sentence boundary (never mid sentence),
 * (c) removes trailing fragments not ending in terminal punctuation and repairs HTML tags,
 * (d) ensures the output has at least one paragraph.
 */
export function finishDescription(html: string, maxWords: number = COPY_LIMITS.descriptionMaxWords): string {
    const sanitized = sanitizeHtml(normalizeBrandTerms(String(html ?? ''))).trim();
    if (!sanitized) return '';

    const rawBlocks = parseBlocks(sanitized);
    const seenSentences = new Set<string>();
    let totalWords = 0;
    let hitCeiling = false;

    type FinalBlock =
        | { kind: 'p'; sentences: string[] }
        | { kind: 'ul' | 'ol'; items: string[] };

    const finalBlocks: FinalBlock[] = [];

    for (const block of rawBlocks) {
        if (hitCeiling) break;

        if (block.kind === 'p') {
            const pieces = block.content.split(/(?<=[.!?]['"”’\)]*)\s+/).map(s => s.trim()).filter(Boolean);
            const validSentences: string[] = [];

            for (const piece of pieces) {
                if (!endsWithSentencePunctuation(piece)) continue;
                const norm = stripTags(piece).toLowerCase().replace(/\s+/g, ' ');
                if (!norm || seenSentences.has(norm)) continue;

                const w = countWords(piece);
                if (totalWords + w > maxWords) {
                    if (totalWords === 0) {
                        validSentences.push(balanceInlineTags(piece));
                        seenSentences.add(norm);
                        totalWords += w;
                    }
                    hitCeiling = true;
                    break;
                }

                validSentences.push(balanceInlineTags(piece));
                seenSentences.add(norm);
                totalWords += w;
            }

            if (validSentences.length > 0) {
                for (let i = 0; i < validSentences.length; i += 3) {
                    finalBlocks.push({ kind: 'p', sentences: validSentences.slice(i, i + 3) });
                }
            }
        } else {
            const liRegex = /<li\b[^>]*>([\s\S]*?)(?:<\/li>|(?=<li\b)|$)/gi;
            let liMatch: RegExpExecArray | null;
            const validItems: string[] = [];

            while ((liMatch = liRegex.exec(block.content)) !== null) {
                const itemContent = liMatch[1].trim();
                if (!itemContent || !endsWithSentencePunctuation(itemContent)) continue;

                const norm = stripTags(itemContent).toLowerCase().replace(/\s+/g, ' ');
                if (!norm || seenSentences.has(norm)) continue;

                const w = countWords(itemContent);
                if (totalWords + w > maxWords) {
                    if (totalWords === 0) {
                        validItems.push(balanceInlineTags(itemContent));
                        seenSentences.add(norm);
                        totalWords += w;
                    }
                    hitCeiling = true;
                    break;
                }

                validItems.push(balanceInlineTags(itemContent));
                seenSentences.add(norm);
                totalWords += w;
            }

            if (validItems.length > 0) {
                finalBlocks.push({ kind: block.kind, items: validItems });
            }
        }
    }

    // Rule (d): make sure the text still has at least one paragraph
    const hasParagraph = finalBlocks.some(b => b.kind === 'p');
    if (!hasParagraph && finalBlocks.length > 0) {
        const firstList = finalBlocks[0];
        if (firstList.kind === 'ul' || firstList.kind === 'ol') {
            const firstItem = firstList.items.shift()!;
            finalBlocks.unshift({ kind: 'p', sentences: [firstItem] });
            if (firstList.items.length === 0) {
                finalBlocks.splice(1, 1);
            }
        }
    }

    // Serialize blocks
    const out: string[] = [];
    for (const b of finalBlocks) {
        if (b.kind === 'p') {
            if (b.sentences.length > 0) {
                out.push(`<p>${b.sentences.join(' ')}</p>`);
            }
        } else {
            if (b.items.length > 0) {
                out.push(`<${b.kind}>${b.items.map(it => `<li>${it}</li>`).join('')}</${b.kind}>`);
            }
        }
    }

    return out.join('');
}

/**
 * The export's rule, applied before storage instead of after: cut on a word
 * boundary, unless that would leave less than 40 characters, and never end on
 * a dash or comma.
 */
export function trimTitle(title: string, max = TITLE_MAX_CHARS): string {
    if (title.length <= max) return title;
    const cut = title.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s\-,]+$/, '');
}

export function finalizeTitle(raw: string | undefined | null): string {
    if (!raw) return '';
    return trimTitle(formatProductTitle(normalizeBrandTerms(String(raw)).trim()));
}

export function finalizeHtml(raw: string | undefined | null, maxWords: number = COPY_LIMITS.descriptionMaxWords): string {
    if (!raw) return '';
    return finishDescription(raw, maxWords);
}

const COLOR_BY_LOWER = new Map<string, string>(ALLOWED_SHOPIFY_COLORS.map(c => [c.toLowerCase(), c]));

/**
 * Allowed names only, in Shopify's spelling, deduplicated, at most three.
 * The schema already constrains the model; this also covers older rows and
 * any path that did not use the schema.
 *
 * A box set is translucent stone photographed on black cloth: Black is the
 * cloth, never the stone. That rule predates this file (it was applied in the
 * pipeline to every "pendant"); it now applies only to real box sets.
 */
export function finalizeColors(raw: unknown, opts: { boxSet?: boolean } = {}): string[] {
    const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map(c => COLOR_BY_LOWER.get(String(c).trim().toLowerCase()))
        .filter((c): c is string => !!c);
    let out = Array.from(new Set(list));
    if (opts.boxSet) {
        out = out.filter(c => c !== 'Black');
        if (out.length === 0) out = ['Cream', 'Tan'];
    }
    return out.slice(0, 3);
}

const TYPE_BY_LOWER = new Map<string, string>((SHOPIFY_PRODUCT_TYPES as readonly string[]).map(t => [t.toLowerCase(), t]));

/**
 * A type the store accepts. Whenever the Type has a spec, the spec's shopifyType
 * is returned (the model no longer decides it). Otherwise today's fallback behaviour.
 */
export function finalizeType(raw: string | undefined | null, item: PipelineItem, opts: { boxSet?: boolean } = {}): string {
    const specType = shopifyTypeFor(itemTypeId(item));
    if (specType) return specType;
    const t = String(raw ?? '').trim();
    if (isAllowedProductType(t)) return t;
    const ci = TYPE_BY_LOWER.get(t.toLowerCase());
    if (ci) return ci;
    if (opts.boxSet) return 'Home Decor > Pendant Lights';
    return getProductCategoryAndType({
        shape: item.shape,
        shortDescription: item.type,
        description: item.vendorText,
    }).type;
}

/**
 * Finish one model answer for one item. Fields the answer does not contain
 * come back empty, so a caller can tell "not generated" from "generated".
 */
export function finalizeContent(raw: RawContent, item: PipelineItem, opts: { boxSet?: boolean } = {}): FinalContent {
    const spec = promptSpecFor(itemTypeId(item));
    const maxWords = spec ? Math.min(spec.description.maxWords, COPY_LIMITS.descriptionMaxWords) : 100;
    const title = finalizeTitle(raw.title);
    const html = raw.body ? finishDescription(raw.body, maxWords) : '';
    const colors = raw.dominantColors === undefined ? [] : finalizeColors(raw.dominantColors, opts);
    const genType = finalizeType(raw.generatedType, item, opts);

    let issues: CopyIssue[] = [];
    if (title || html) {
        issues = validateCopy(title, html, {
            color: item.vendorColor,
            material: item.material,
            widthCm: item.widthCm,
            heightCm: item.heightCm,
            lengthCm: item.lengthCm,
            quantity: item.quantity || 1,
            vendorText: item.vendorText,
        });
        // A title-only run has no body to be thin.
        if (!html) issues = issues.filter(i => i.code !== 'thin');
    }

    return { title, html, colors, genType, issues };
}
