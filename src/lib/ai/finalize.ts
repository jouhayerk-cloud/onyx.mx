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

export function finalizeHtml(raw: string | undefined | null): string {
    if (!raw) return '';
    return sanitizeHtml(normalizeBrandTerms(String(raw))).trim();
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
 * A type the store accepts. An unknown answer falls back to the same
 * shape/Type mapping the Shopify export uses, rather than being stored and
 * rejected at import.
 */
export function finalizeType(raw: string | undefined | null, item: PipelineItem, opts: { boxSet?: boolean } = {}): string {
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
    const title = finalizeTitle(raw.title);
    const html = finalizeHtml(raw.body);
    const colors = raw.dominantColors === undefined ? [] : finalizeColors(raw.dominantColors, opts);
    const genType = raw.generatedType === undefined ? '' : finalizeType(raw.generatedType, item, opts);

    let issues: CopyIssue[] = [];
    if (title || html) {
        issues = validateCopy(title, html, {
            color: item.vendorColor,
            material: item.material,
            widthCm: item.widthCm,
            heightCm: item.heightCm,
            lengthCm: item.lengthCm,
            quantity: item.quantity || 1,
        });
        // A title-only run has no body to be thin.
        if (!html) issues = issues.filter(i => i.code !== 'thin');
    }

    return { title, html, colors, genType, issues };
}
