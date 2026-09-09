/**
 * Validating generated product copy against the inventory row it describes.
 *
 * The variation pass writes copy for items that have no photograph by varying
 * the closest item that does. On 8 September 2026 that produced, among 223
 * items: an orange onyx fountain rock sold as "Tehuacan White Onyx ... 47 cm
 * wide, 96 cm high", three nacar canoes sold as "fluorite bowls", a single
 * table lamp sold as "a collection of pendant lights", and four bodies
 * containing the model's own input template verbatim.
 *
 * None of that is a prompt problem. The prompt already forbade all of it. The
 * gap is that nothing checked the output before it was written, so the model
 * only had to be right on average.
 *
 * These checks are deliberately narrow. They test claims that CAN be
 * contradicted by the record -- colour, stone, size, count -- plus two shapes
 * that are always wrong regardless of the record. They do not judge writing
 * quality, and they do not fire on anything the record cannot settle: an item
 * recorded only as "Pearlescent" names no primary colour, so calling it cream
 * is not a contradiction and is not reported.
 */

export type CopyIssueCode =
    | 'colour'      // names a primary colour the record contradicts
    | 'stone'       // names a material that is not the recorded one
    | 'size'        // cites a dimension the record does not have
    | 'plural'      // plural framing on a single object
    | 'scaffold'    // the prompt's own template leaked into the output
    | 'thin';       // too short to be a description

export interface CopyIssue {
    code: CopyIssueCode;
    /** Human-readable, and safe to feed back to the model on a retry. */
    message: string;
}

export interface CopyRecord {
    color?: string | null;
    material?: string | null;
    widthCm?: number | null;
    heightCm?: number | null;
    lengthCm?: number | null;
    /** Above 1, plural framing is correct rather than wrong. */
    quantity?: number | null;
}

/** Colours specific enough that naming the wrong one is a factual error.
 *  Descriptive shades (cream, tan, honey) are excluded on purpose: copy
 *  legitimately calls a Pearlescent bowl cream. */
const PRIMARY_COLOURS = [
    'white', 'black', 'green', 'pink', 'orange', 'blue', 'red',
    'purple', 'amber', 'gold', 'golden', 'brown', 'yellow', 'aqua',
    'gray', 'grey',
];

const STONES = ['onyx', 'fluorite', 'calcite', 'travertine', 'jasper', 'marble', 'granite', 'geode'];

const PLURAL_PHRASES = ['these', 'box set', 'collection of', 'each of these', 'set of'];

/** Fragments of the generator's own prompt. Their presence means the model
 *  echoed its input instead of writing. */
const SCAFFOLD_PATTERNS: RegExp[] = [
    /shape\s*\/\s*type\s*\/\s*material/i,
    /size\s*\(\s*w\s*x\s*h\s*x\s*l/i,
    /^\s*colours?\s*:/i,
    /^\s*type\s*:\s*home decor/i,
];

const MIN_BODY_CHARS = 120;

const strip = (s: string): string =>
    (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const has = (haystack: string, word: string): boolean =>
    new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(haystack);

/** gray and grey are the same colour; never report one as contradicting the other. */
const sameColourWord = (a: string, b: string): boolean => {
    const n = (x: string) => (x === 'grey' ? 'gray' : x);
    return n(a) === n(b);
};

/**
 * Colour words a recorded colour already contains, by definition rather than
 * by observation. Aqua IS a blue-green, so calling an aqua lamp blue-green is
 * accurate, not a contradiction -- an earlier version of this check flagged
 * exactly that and the copy got needlessly reworded to satisfy it.
 *
 * Only definitional relationships belong here. "Red Pyramid onyx often shows
 * brown and yellow banding" is an observation about the stone, not part of
 * what "red" means, so it is left out and will cost a retry. That is the right
 * way round: a retry is cheap, a wrong colour on a live product is not.
 */
const COLOUR_CONTAINS: Record<string, string[]> = {
    aqua: ['blue', 'green'],
    amber: ['orange', 'yellow', 'gold', 'golden', 'brown'],
    gold: ['yellow', 'amber'],
    golden: ['yellow', 'amber'],
    zebra: ['black', 'white', 'gray', 'grey'],
    multicolor: PRIMARY_COLOURS,
    multicolour: PRIMARY_COLOURS,
};

/**
 * Every centimetre figure the text asserts.
 *
 * The negative lookbehind matters: "83.75 cm" must not read as a claim of
 * 75 cm. That false positive cost a real item a needless rewrite.
 */
export function citedCentimetres(text: string): number[] {
    const out: number[] = [];
    const re = /(?<![.\d])(\d{1,4})\s*(?:cm|centimet)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(parseInt(m[1], 10));
    // Metres, written out, are the same claim in different units.
    const rm = /(\d+(?:\.\d+)?)\s*met(?:re|er)s?\b/gi;
    while ((m = rm.exec(text)) !== null) out.push(Math.round(parseFloat(m[1]) * 100));
    return out;
}

/**
 * Check one item's generated copy against its inventory row.
 *
 * `title` and `body` are checked together for claims and separately for
 * length, because only the body has a length requirement.
 */
export function validateCopy(
    title: string,
    body: string,
    record: CopyRecord,
): CopyIssue[] {
    const issues: CopyIssue[] = [];
    const t = strip(title);
    const b = strip(body);
    const all = (t + ' ' + b).toLowerCase();

    const recColour = String(record.color || '').toLowerCase();
    const recStone = String(record.material || '').toLowerCase();
    const dims = [record.widthCm, record.heightCm, record.lengthCm]
        .map(v => (v == null ? NaN : Math.round(Number(v))))
        .filter(v => !isNaN(v) && v > 0);

    // --- colour -----------------------------------------------------------
    // Only meaningful when the record itself names a primary colour. An item
    // recorded as "Nacar" cannot contradict anything, and pretending otherwise
    // is how a check ends up exempting a third of the catalogue by accident.
    const recordNamesPrimary = PRIMARY_COLOURS.some(c => has(recColour, c))
        || Object.keys(COLOUR_CONTAINS).some(c => has(recColour, c));
    if (recordNamesPrimary) {
        const admitted = new Set<string>();
        Object.keys(COLOUR_CONTAINS).forEach(key => {
            if (has(recColour, key)) COLOUR_CONTAINS[key].forEach(v => admitted.add(v));
        });
        const wrong = PRIMARY_COLOURS.filter(c =>
            has(all, c)
            && !admitted.has(c)
            && !PRIMARY_COLOURS.some(r => has(recColour, r) && sameColourWord(r, c)));
        if (wrong.length) {
            issues.push({
                code: 'colour',
                message: `the copy calls it ${wrong.join(' and ')}, but the record says ${record.color}`,
            });
        }
    }

    // --- stone ------------------------------------------------------------
    if (recStone) {
        const wrong = STONES.filter(s => has(all, s) && !has(recStone, s));
        if (wrong.length) {
            issues.push({
                code: 'stone',
                message: `the copy calls it ${wrong.join(' and ')}, but the record says ${record.material}`,
            });
        }
    }

    // --- size -------------------------------------------------------------
    if (dims.length) {
        const wrong = citedCentimetres(t + ' ' + b).filter(n => n > 2 && dims.indexOf(n) === -1);
        if (wrong.length) {
            issues.push({
                code: 'size',
                message: `the copy cites ${wrong.join(', ')} cm; the record has only ${dims.join(', ')} cm`,
            });
        }
    }

    // --- count ------------------------------------------------------------
    if ((record.quantity == null || Number(record.quantity) <= 1)) {
        const hit = PLURAL_PHRASES.find(p => has(all, p));
        if (hit) {
            issues.push({
                code: 'plural',
                message: `the copy says "${hit}", but this is a single item`,
            });
        }
    }

    // --- the model echoed its own input ------------------------------------
    if (SCAFFOLD_PATTERNS.some(re => re.test(b) || re.test(t))) {
        issues.push({
            code: 'scaffold',
            message: 'the output contains the prompt template rather than written copy',
        });
    }

    // --- length -----------------------------------------------------------
    if (b.length < MIN_BODY_CHARS) {
        issues.push({
            code: 'thin',
            message: `the description is ${b.length} characters; at least ${MIN_BODY_CHARS} are needed`,
        });
    }

    return issues;
}

/** One line per issue, phrased as corrections — suitable for a retry prompt. */
export function describeIssues(issues: CopyIssue[]): string {
    return issues.map(i => `- ${i.message}`).join('\n');
}
