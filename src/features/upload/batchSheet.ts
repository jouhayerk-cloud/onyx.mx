/**
 * Batch Create's spreadsheet side: reading the vendor's xlsx into rows, and
 * numbering those rows inside the vendor's book. No React, no strings shown
 * to anyone (the wizard words the codes below), so the rules can be read and
 * checked on their own.
 *
 * The rules kept from the old wizard: COLUMN_MAP (Spanish and English
 * headers), the sheet named after the vendor wins over the first sheet, '#'
 * carries the item number, at most MAX_ITEMS rows per batch (the rest are
 * counted, not dropped in silence), and text cells are kept exactly as typed.
 *
 * What changed, from the review:
 *
 *   · Headers are matched accent-insensitively and without a trailing unit
 *     in brackets, so 'Descripción' and 'Precio (MXN)' are no longer dropped
 *     in silence; whatever still does not map is reported by name.
 *   · Number cells are cleaned ('$1,200', '12,5', '30 cm') instead of turning
 *     into NULL columns while parseFloat('1,200') = 1 drove the codes. A cell
 *     that still is not a number keeps its text and is flagged.
 *   · '#' is validated: 4, 004 and EM-004 are row 4 of vendor EM; '4a' or
 *     another vendor's prefix is flagged rather than becoming three different
 *     identities for one row.
 *   · Rows the sheet leaves unnumbered are numbered from the book's real
 *     highest number (assignNumbers, with the numbers lib/inventoryCreate
 *     reads), not from a max captured by a stale closure, which started a
 *     vendor at 001 again or carried the previous vendor's max over.
 */
import * as XLSX from 'xlsx';
import type { BatchCreateItem } from '../../lib/atoms';

/** Spanish → English column header mapping. Keys are folded (see foldHeader). */
export const COLUMN_MAP: Record<string, string> = {
    'cantidad': 'quantity', 'qty': 'quantity', 'q': 'quantity',
    'forma': 'shape', 'shape': 'shape',
    'tipo': 'itemType', 'type': 'itemType',
    'color': 'color',
    'material': 'material',
    'ancho': 'widthCm', 'width': 'widthCm', 'w cm': 'widthCm',
    'alto': 'heightCm', 'height': 'heightCm', 'h cm': 'heightCm',
    'fondo': 'lengthCm', 'depth': 'lengthCm', 'd cm': 'lengthCm',
    'precio': 'price', 'price': 'price', 'per piece mxn$': 'price', 'per piece mxn': 'price',
    'total': '_total', 'total pesos': '_total',
    'description': 'description', 'description color - object type': 'description', 'descripcion': 'description',
    '#': 'itemNumber',
    'date': '_date', 'fecha': '_date',
    'tag-id': '_tagId', 'tag id': '_tagId',
    'kg': 'weightKg', 'peso': 'weightKg',
    'aqc': '_aqc', 'lc': '_lc',
};

export const MAX_ITEMS = 100;

/** The row fields that hold numbers; each is cleaned and checked. */
export const NUMERIC_FIELDS = ['quantity', 'widthCm', 'heightCm', 'lengthCm', 'weightKg', 'price'] as const;
export type NumericField = typeof NUMERIC_FIELDS[number];

/**
 * The text fields the import translates. Only shape and material: the
 * vendor's Type (short_description), colour (color) and note (description)
 * are columns no AI may write (the owner's column map), so they are stored
 * exactly as the sheet has them.
 */
export const TEXT_FIELDS = ['shape', 'material'] as const;

/** Lower case, accents folded, inner spaces collapsed: 'Descripción ' -> 'descripcion'. */
export function foldHeader(header: unknown): string {
    return String(header ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** The row field a header maps to, or undefined. Tries the header as is, without a bracketed unit, then without punctuation. */
export function mapHeader(header: unknown): string | undefined {
    const f = foldHeader(header);
    if (!f) return undefined;
    const tries = [
        f,
        f.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(),
        f.replace(/[^a-z0-9#]+/g, ' ').trim(),
    ];
    for (const t of tries) if (t && COLUMN_MAP[t]) return COLUMN_MAP[t];
    return undefined;
}

/**
 * A number cell made storable: currency, units and spaces dropped, a lone
 * comma before one or two digits read as a decimal comma, any other comma as
 * a thousands mark (the same reading lib/inventoryCreate applies). `ok` is
 * false when what is left is still not a number; `value` then keeps the text
 * as typed so the review shows it.
 */
export function cleanNumberCell(raw: unknown): { value: string; ok: boolean } {
    if (raw === null || raw === undefined) return { value: '', ok: true };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { value: String(raw), ok: true } : { value: '', ok: false };
    const text = String(raw).trim();
    if (!text) return { value: '', ok: true };
    let s = text.replace(/mxn|usd|pesos?|kgs?|cms?|\$|\s/gi, '');
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    if (/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { value: String(parseFloat(s)), ok: true };
    return { value: text, ok: false };
}

/**
 * The '#' cell: 4, '004' and 'EM-004' (vendor EM) are 4. Anything else ('4a',
 * 'TE-004' for vendor EM, 0) keeps its text and is not ok.
 */
export function parseItemNumberCell(raw: unknown, vendor: string): { value: string; ok: boolean } {
    if (typeof raw === 'number') {
        return Number.isInteger(raw) && raw > 0 && raw < 10000 ? { value: String(raw), ok: true } : { value: String(raw), ok: false };
    }
    const text = String(raw ?? '').trim();
    if (!text) return { value: '', ok: true };
    const m = /^(?:([A-Za-z]{1,6})[\s._-]*)?0*(\d{1,4})$/.exec(text);
    if (m && Number(m[2]) > 0 && (!m[1] || m[1].toUpperCase() === String(vendor).toUpperCase())) {
        return { value: String(Number(m[2])), ok: true };
    }
    return { value: text, ok: false };
}

/** A row's item number as an integer, or null when it is empty or not one. */
export function itemNumberOf(item: Pick<BatchCreateItem, 'itemNumber'>): number | null {
    const s = String(item.itemNumber ?? '').trim();
    if (!/^\d{1,4}$/.test(s)) return null;
    const n = Number(s);
    return n > 0 ? n : null;
}

export type SheetErrorCode = 'unreadable' | 'no_rows' | 'no_headers' | 'no_valid_rows';

export class SheetError extends Error {
    constructor(readonly code: SheetErrorCode) {
        super(code);
        this.name = 'SheetError';
    }
}

export interface InvalidCell {
    sheetRow: number;
    field: NumericField | 'itemNumber';
    value: string;
}

export interface SheetParse {
    sheetName: string;
    /** True when the sheet is the one named after the vendor. */
    vendorSheet: boolean;
    items: BatchCreateItem[];
    /** Rows past MAX_ITEMS, not imported. */
    skippedForLimit: number;
    /** Rows with cells but no price, shape, type or description: not items, not imported. */
    skippedBlank: number;
    /** Headers that map to nothing, as written in the sheet. */
    unmapped: string[];
    /** Number cells that are not numbers, and bad '#' cells. */
    invalidCells: InvalidCell[];
}

/** Read the workbook bytes into rows. Throws SheetError. */
export function parseSheet(data: ArrayBuffer, vendor: string): SheetParse {
    let book: XLSX.WorkBook;
    try {
        book = XLSX.read(new Uint8Array(data), { type: 'array' });
    } catch {
        throw new SheetError('unreadable');
    }
    const want = String(vendor || '').trim().toUpperCase();
    const named = want ? book.SheetNames.find(n => n.trim().toUpperCase() === want) : undefined;
    const sheetName = named ?? book.SheetNames[0];
    const sheet = sheetName ? book.Sheets[sheetName] : undefined;
    if (!sheet) throw new SheetError('no_rows');
    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length < 2) throw new SheetError('no_rows');

    const fieldMap: Record<number, string> = {};
    const unmapped: string[] = [];
    (rawRows[0] || []).forEach((h: unknown, i: number) => {
        const mapped = mapHeader(h);
        if (mapped) fieldMap[i] = mapped;
        else if (String(h ?? '').trim()) unmapped.push(String(h).trim());
    });
    if (!Object.values(fieldMap).some(f => !f.startsWith('_'))) throw new SheetError('no_headers');

    const items: BatchCreateItem[] = [];
    const invalidCells: InvalidCell[] = [];
    let skippedForLimit = 0;
    let skippedBlank = 0;

    for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.every((c: unknown) => c === '' || c === null || c === undefined)) continue;
        const sheetRow = r + 1;

        const raw: Record<string, unknown> = {};
        Object.entries(fieldMap).forEach(([col, field]) => {
            if (!field.startsWith('_')) raw[field] = row[Number(col)];
        });
        const textOf = (f: string) => String(raw[f] ?? '').trim();

        if (!textOf('price') && !textOf('shape') && !textOf('itemType') && !textOf('description')) { skippedBlank++; continue; }
        // Counted, not dropped in silence: the old loop stopped at the cap and
        // still reported success.
        if (items.length >= MAX_ITEMS) { skippedForLimit++; continue; }

        const num = {} as Record<NumericField, string>;
        for (const f of NUMERIC_FIELDS) {
            const c = cleanNumberCell(raw[f]);
            num[f] = c.value;
            if (!c.ok) invalidCells.push({ sheetRow, field: f, value: c.value });
        }
        const no = parseItemNumberCell(raw.itemNumber, want);
        if (!no.ok) invalidCells.push({ sheetRow, field: 'itemNumber', value: no.value });

        items.push({
            id: crypto.randomUUID(),
            itemNumber: no.value,
            // Text is kept exactly as typed in the sheet. It used to be upper-cased,
            // which stored LARGE / BLUE ARGENTINA beside the Title Case the other
            // screens and the existing rows use.
            shape: textOf('shape'),
            itemType: textOf('itemType'),
            color: textOf('color'),
            material: textOf('material'),
            description: textOf('description'),
            widthCm: num.widthCm,
            heightCm: num.heightCm,
            lengthCm: num.lengthCm,
            weightKg: num.weightKg,
            price: num.price,
            quantity: num.quantity || '1',
            mediaFiles: [],
            sheetRow,
            autoNumber: false,
        });
    }

    if (!items.length) throw new SheetError('no_valid_rows');
    return { sheetName, vendorSheet: !!named, items, skippedForLimit, skippedBlank, unmapped, invalidCells };
}

/**
 * Number the rows the sheet left unnumbered: each takes the next number that
 * is neither used in the book (`taken`) nor typed on another row of the
 * batch, starting after the book's highest. Typed numbers are left alone.
 */
export function assignNumbers(items: readonly BatchCreateItem[], taken: ReadonlySet<number>): BatchCreateItem[] {
    const inBatch = new Set(items.map(itemNumberOf).filter((n): n is number => n !== null));
    let next = Math.max(0, ...Array.from(taken)) + 1;
    const free = () => {
        while (taken.has(next) || inBatch.has(next)) next++;
        inBatch.add(next);
        return next;
    };
    return items.map(item => (String(item.itemNumber ?? '').trim()
        ? item
        : { ...item, itemNumber: String(free()), autoNumber: true }));
}

/** Rows whose number cannot be used: not a number, taken in the book, or repeated in the batch (all but the first). */
export function numberConflicts(items: readonly BatchCreateItem[], taken: ReadonlySet<number> | null): Map<string, 'invalid' | 'taken' | 'repeated'> {
    const out = new Map<string, 'invalid' | 'taken' | 'repeated'>();
    const seen = new Set<number>();
    // Typed numbers claim theirs before numbers the import made up.
    const order = [...items].sort((a, b) => Number(!!a.autoNumber) - Number(!!b.autoNumber));
    for (const item of order) {
        const n = itemNumberOf(item);
        if (n === null) { out.set(item.id, 'invalid'); continue; }
        if (taken?.has(n)) { out.set(item.id, 'taken'); continue; }
        if (seen.has(n)) { out.set(item.id, 'repeated'); continue; }
        seen.add(n);
    }
    return out;
}

/** Give every conflicting row (numberConflicts) the next free number. The others keep theirs. */
export function renumberConflicts(items: readonly BatchCreateItem[], taken: ReadonlySet<number>): BatchCreateItem[] {
    const bad = numberConflicts(items, taken);
    if (!bad.size) return items.slice();
    const cleared = items.map(item => (bad.has(item.id) ? { ...item, itemNumber: '' } : item));
    return assignNumbers(cleared, taken);
}
