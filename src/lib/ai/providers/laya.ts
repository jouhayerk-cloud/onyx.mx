/**
 * Laya (127.0.0.1:8001, POST /v1/systemone) as an optional checker for Book 826.
 *
 * Laya answers a few choice and yes/no questions about a record. It checks the material and the colour family
 * against the record, and flags a description that states dimensions the record does not have. It never sets the
 * canonical type: its type answers were right only 13% to 37% of the time (LongNight 2). Every call fails open:
 * a timeout, a missing server or a bad answer returns null, and the pipeline goes on without it.
 *
 * The question wording and criteria are the ones the LongNight 2 benchmark used (phrasing_a).
 */
import { normalizeAlias } from '../../taxonomy/onyx826';

export const LAYA_BASE_URL = 'http://127.0.0.1:8001';
export const LAYA_MODEL = 'jev-latest';
export const LAYA_CLASSIFY_TIMEOUT_MS = 6000;
/** A material answer below this confidence is not enough to raise a flag. */
export const LAYA_MATERIAL_MIN_CONFIDENCE = 0.8;

const MATERIAL_CRITERIA: Record<string, string> = {
    onyx: 'Translucent banded chalcedony or calcite stone',
    marble: 'Metamorphic rock of recrystallized carbonate minerals',
    travertine: 'Terrestrial limestone formed by mineral springs',
    quartz: 'Hard crystalline mineral stone',
    other: 'Other stone, composite, or unlisted material',
};

const COLOUR_CRITERIA: Record<string, string> = {
    white: 'White, off-white, cream, ivory, or clear',
    black: 'Black, dark charcoal, or obsidian',
    green: 'Green, jade, serpentine, or olive',
    'honey/amber': 'Honey, amber, gold, caramel, or yellow',
    blue: 'Blue, cyan, aqua, turquoise, or navy',
    pink: 'Pink, rose, salmon, or blush',
    multicolor: 'Multiple distinct contrasting colors or rainbow',
    other: 'Brown, gray, red, or other colors',
};

/** Colour words that agree with each Laya colour family. "other" agrees with anything. */
const COLOUR_FAMILY_WORDS: Record<string, readonly string[]> = {
    white: ['white', 'ivory', 'cream', 'clear'],
    black: ['black', 'charcoal', 'grey', 'gray'],
    green: ['green', 'emerald', 'mint', 'olive', 'teal'],
    'honey/amber': ['amber', 'yellow', 'gold', 'orange', 'brown', 'caramel'],
    blue: ['blue', 'teal', 'aqua', 'turquoise', 'purple', 'violet'],
    pink: ['pink', 'red', 'coral', 'rose', 'burgundy'],
    multicolor: ['multicolor', 'multicolour', 'rainbow', 'tri-color'],
};

/** The record fields Laya reads. Material and colour are left out on purpose: the check compares Laya's answer with them. */
export interface LayaRecord826 {
    title?: string;
    shape?: string;
    description?: string;
    width_cm?: number | null;
    height_cm?: number | null;
    length_cm?: number | null;
}

export interface LayaCheck826 {
    material?: { choice: string; confidence?: number };
    colourFamily?: { choice: string; confidence?: number };
    /** True when the description states dimensions the record does not have. */
    descMentionsUnknownDims?: boolean;
}

export interface LayaFlag826 {
    rule: 'laya-material' | 'laya-colour' | 'laya-dims';
    message: string;
}

/** GET /health with a short timeout. False on any failure. */
export async function layaHealthy(baseUrl: string = LAYA_BASE_URL, timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, { method: 'GET', signal: controller.signal });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

const asText = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const asRecord = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? v as Record<string, any> : {});

/** Reads the `answers` object of a /v1/systemone reply. Exported for the harness and for tests. */
export function parseLayaAnswers(answers: unknown): LayaCheck826 {
    const a = asRecord(answers);
    const material = asRecord(a.material);
    const colour = asRecord(a.color_family);
    const dims = asRecord(a.desc_mentions_unknown_dims);
    const materialChoice = asText(material.choice);
    const colourChoice = asText(colour.choice);
    return {
        material: materialChoice ? { choice: materialChoice, confidence: asNumber(material.confidence) } : undefined,
        colourFamily: colourChoice ? { choice: colourChoice, confidence: asNumber(colour.confidence) } : undefined,
        descMentionsUnknownDims: typeof dims.noul === 'boolean' ? dims.noul : undefined,
    };
}

/** One /v1/systemone call. Null when Laya is down, slow or answers badly. */
export async function layaCheck826(
    record: LayaRecord826,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LayaCheck826 | null> {
    const body = {
        model: LAYA_MODEL,
        state: record,
        questions: {
            material: {
                type: 'choice',
                instructions: 'Which stone type or geological mineral constitutes this product?',
                criteria: MATERIAL_CRITERIA,
            },
            color_family: {
                type: 'choice',
                instructions: 'Which visual color category best represents this piece?',
                criteria: COLOUR_CRITERIA,
            },
            desc_mentions_unknown_dims: {
                type: 'noul',
                instructions: 'Does the description state dimensions not in the record?',
            },
        },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? LAYA_CLASSIFY_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const res = await fetch(`${LAYA_BASE_URL}/v1/systemone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return parseLayaAnswers(data?.answers);
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
    }
}

/** A row material Laya disagrees with, confidently. "other" never flags. */
export function layaMaterialFlag(rowMaterial: string | null | undefined, laya: LayaCheck826 | null): LayaFlag826 | null {
    const m = laya?.material;
    const row = normalizeAlias(rowMaterial);
    if (!m || !row) return null;
    if (m.confidence !== undefined && m.confidence < LAYA_MATERIAL_MIN_CONFIDENCE) return null;
    const choice = normalizeAlias(m.choice);
    if (choice === 'other' || row.includes(choice) || choice.includes(row)) return null;
    return { rule: 'laya-material', message: `Laya read the material as ${m.choice}; the record says ${rowMaterial}.` };
}

/** Gemini's colour pattern shares no word with Laya's colour family. Non-blocking. */
export function layaColourFlag(colourPattern: readonly string[], laya: LayaCheck826 | null): LayaFlag826 | null {
    const c = laya?.colourFamily;
    if (!c || !colourPattern.length) return null;
    const words = COLOUR_FAMILY_WORDS[normalizeAlias(c.choice)];
    if (!words) return null;
    const agrees = colourPattern.some(col => words.some(w => normalizeAlias(col).includes(w)));
    if (agrees) return null;
    return { rule: 'laya-colour', message: `Laya read the colour family as ${c.choice}; the copy colours are ${colourPattern.join(', ')}.` };
}

/** The description states dimensions the record does not have. */
export function layaDimsFlag(laya: LayaCheck826 | null): LayaFlag826 | null {
    if (!laya?.descMentionsUnknownDims) return null;
    return { rule: 'laya-dims', message: 'Laya: the description states dimensions that are not in the record.' };
}
