/**
 * The one item-creation service: numbering, the duplicate check, the row
 * builder and the two writes. Add Entry, Edit Entry and Batch Create all go
 * through it.
 *
 * There used to be three writers and they agreed on nothing. Create Item's
 * next-number lookup called db.from() on an RxDatabase, threw every time, and
 * started every vendor at 001; the wizard asked RxDB but forgot the book after
 * its first save and wrote v326; Batch Create read a stale max. Their payloads
 * disagreed on the default status (Available / Acquisition / Production), on
 * empty text ('' / undefined / null), on an empty price (0 / null), on whether
 * created_by and updated_at were written at all, and on the exchange rate. All
 * three wrote the '-' sentinel into book_barcode and book_aq_code when there
 * was no price, which the book-fields trigger then took for a printed barcode
 * and never filled in. And the wizard's edit was an upsert by a fresh uuid, so
 * a row from the production table came back as a duplicate inventory row.
 *
 * Rules applied here once:
 *
 *   · Numbering is per vendor PER WORKBOOK: item_id VENDOR-NNN is unique only
 *     inside a book, so every lookup carries both.
 *   · Book codes use DEFAULT_EXCHANGE_RATE (17), never the editable or live
 *     rate, so the client shows what the database trigger stores.
 *   · An existing book_barcode is never recomputed or rewritten: it is
 *     printed on a label. An edit leaves the column out of the patch, and
 *     also when a label was printed without one being stored (labelPrinted).
 *   · No '-' or '—' sentinel is ever stored; an unknown code is NULL, which
 *     the trigger can still fill.
 *   · Rows are written by uuid. Edits are an UPDATE by id, never an upsert.
 */
import { supabase } from './supabase';
import { getDatabase } from './database';
import { DEFAULT_EXCHANGE_RATE } from './consts';
import { calculateCodesAndPrices } from './utils';
import type { Database } from './database.types';

export type InventoryRow = Database['public']['Tables']['inventory']['Row'];
export type InventoryInsert = Database['public']['Tables']['inventory']['Insert'];
export type InventoryUpdate = Database['public']['Tables']['inventory']['Update'];

/** The statuses a new entry can start in, in the order the form offers them. */
export const ENTRY_STATUSES = ['Acquisition', 'Production', 'Available'] as const;
export type EntryStatus = typeof ENTRY_STATUSES[number];
/**
 * One default for every creator. Acquisition, because that is what two of
 * the three old paths wrote and what a piece just bought from a vendor is;
 * the form shows the field, so Available is one click away.
 */
export const DEFAULT_ENTRY_STATUS: EntryStatus = 'Acquisition';

/** The books an entry can be written to, newest first. */
export const ENTRY_BOOKS = ['v826', 'v326', 'v825'] as const;
export type EntryBook = typeof ENTRY_BOOKS[number];

/**
 * What every creator hands the row builder. Values are what a form holds
 * (strings, possibly empty); numbers are accepted too.
 *
 * `mediaUrls`: the item's media in order. On an edit, leave it undefined when
 * the photos did not change, so media_urls is not rewritten (rewriting it
 * used to strip the stored &tag= suffixes and mix the AI clips into it).
 */
export interface InventoryForm {
    vendorId: string;
    workbook: string;
    itemNumber: string | number;
    quantity?: string | number | null;
    status?: string | null;
    shape?: string | null;
    /** The manual Type, stored in short_description. */
    type?: string | null;
    /** The vendor's colour (`color`). */
    color?: string | null;
    material?: string | null;
    widthCm?: string | number | null;
    heightCm?: string | number | null;
    /** D in the form: depth, stored as length_cm. */
    lengthCm?: string | number | null;
    weightKg?: string | number | null;
    /** Acquisition price in MXN. */
    price?: string | number | null;
    /** The vendor's note, stored in `description`. */
    description?: string | null;
    mediaUrls?: readonly string[];
}

export interface BuildRowOptions {
    mode: 'create' | 'edit';
    /** The stored row, for an edit (raw snake_case or normalized). */
    existing?: Record<string, any> | null;
    /** Create only: the uuid to insert with. One is generated when absent. */
    id?: string;
    /** Create only: who is creating it (created_by). */
    user?: { name?: string | null; email?: string | null } | null;
    /** Clock, for tests. */
    now?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const text = (v: unknown): string | null => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s ? s : null;
};

const decimal = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    // Sheets and phones type "2,850" and "12,5"; a lone comma followed by one
    // or two digits is a decimal comma, any other comma a thousands mark.
    let s = typeof v === 'number' ? String(v) : String(v).trim();
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
};

const integer = (v: unknown): number | null => {
    const n = decimal(v);
    return n === null ? null : Math.trunc(n);
};

/** 'v826', '826', 826 -> 'v826'; '' -> ''. */
export function normalizeWorkbook(workbook: unknown): string {
    const digits = String(workbook ?? '').replace(/\D/g, '');
    return digits ? `v${digits}` : '';
}

/** EM + 52 -> 'EM-052'. */
export function formatItemId(vendorId: string, itemNumber: string | number): string {
    const n = integer(itemNumber) ?? 0;
    return `${String(vendorId).trim().toUpperCase()}-${String(n).padStart(3, '0')}`;
}

/** A code from calculateCodesAndPrices, or null for its '-' / '—' placeholders. */
const code = (v: string | undefined | null): string | null => {
    const s = String(v ?? '').trim();
    return s && s !== '-' && !s.includes('—') ? s : null;
};

/**
 * The row's own printed barcode, or null. Read from the raw column, never
 * from normalizeInventoryData, whose book_barcode falls back to tag_id /
 * item_id ("AN-001"); a workbook id has a dash, a barcode never does.
 */
export function storedBarcodeOf(row: Record<string, any> | null | undefined): string | null {
    const raw = String(row?.book_barcode ?? row?.bookBarcode ?? '').trim();
    if (!raw || raw.includes('-') || raw.includes('—')) return null;
    return raw;
}

/**
 * Has a label been printed for this row? A stored barcode says so, and so do
 * the print records: LabelWizard prints the barcode it computes and writes
 * only print_date / print_job_checksum / print_job_id back (the trigger keeps
 * labels_printed_total), so a row printed while book_barcode was NULL or the
 * old '-' placeholder has a label in the field and no stored barcode. Such a
 * row's vendor and number are on that label, and no client recompute may
 * write a barcode for it that could differ from the one printed.
 */
export function labelPrinted(row: Record<string, any> | null | undefined): boolean {
    if (!row) return false;
    if (storedBarcodeOf(row)) return true;
    if ((Number(row.labels_printed_total ?? row.labelsPrintedTotal) || 0) > 0) return true;
    return !!text(row.print_date ?? row.printDate) || !!text(row.print_job_checksum ?? row.printJobChecksum);
}

const workbookVariants = (workbook: string): string[] => {
    const wb = normalizeWorkbook(workbook);
    return wb ? [wb, wb.slice(1)] : [];
};

const numberOf = (row: Record<string, any>, vendorId: string): number => {
    const n = integer(row.item_number);
    if (n !== null) return n;
    // Rows saved before item_number was written carry it in item_id only.
    const m = new RegExp(`^${vendorId}-0*(\\d+)`, 'i').exec(String(row.item_id ?? ''));
    return m ? parseInt(m[1], 10) : NaN;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The local database, or null when it is not up within `ms`. RxDB can take
 * seconds to open on a cold start (useDatabase warns at 3s); numbering must
 * not wait on it when Supabase can answer.
 */
async function localDb(ms = 2500): Promise<any | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            getDatabase().catch(() => null),
            new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Rows of one vendor in one book: item_id, item_number and id. RxDB first
 * (offline, instant), Supabase when the local database is not there or the
 * query fails. `source` says which answered.
 */
async function vendorBookRows(vendorId: string, workbook: string): Promise<{ rows: Record<string, any>[]; source: 'local' | 'remote' }> {
    const vendor = String(vendorId).trim().toUpperCase();
    const books = workbookVariants(workbook);
    if (!vendor || !books.length) return { rows: [], source: 'local' };

    try {
        const db = await localDb();
        if (db?.inventory) {
            const docs = await db.inventory.find({
                selector: {
                    item_id: { $regex: `^${escapeRegex(vendor)}-` },
                    workbook: { $in: books },
                },
            }).exec();
            return { rows: docs.map((d: any) => (d.toJSON ? d.toJSON() : d)), source: 'local' };
        }
    } catch (err) {
        console.warn('[inventoryCreate] Local lookup failed; asking Supabase.', err);
    }

    const { data, error } = await supabase
        .from('inventory')
        .select('id, item_id, item_number, workbook')
        .in('workbook', books)
        .ilike('item_id', `${vendor}-%`);
    if (error) throw new Error(`Could not read the existing numbers: ${error.message}`);
    return { rows: (data || []) as Record<string, any>[], source: 'remote' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The next free item number for a vendor in a book: the highest number in use
 * plus one, 1 when the vendor has nothing in that book yet.
 *
 * Read from the local copy AND Supabase merged (getTakenItemNumbers): the
 * local copy never holds hidden rows (the pull filters is_hidden) and can lag
 * behind a row made on another device, so a local-only max offered a number
 * isDuplicate then rejected, again and again.
 */
export async function getNextItemNumber(vendorId: string, workbook: string): Promise<number> {
    const taken = await getTakenItemNumbers(vendorId, workbook);
    let max = 0;
    taken.forEach(n => { if (n > max) max = n; });
    return max + 1;
}

/**
 * Is VENDOR-NNN already taken in this book? `excludeId` leaves the item being
 * edited out. When the local copy says no, Supabase is asked too: the local
 * mirror can lag behind a row created on another device a minute ago, and a
 * duplicate item_id in a book is what this check exists to prevent. A failed
 * remote check does not block (the local answer stands).
 */
export async function isDuplicate(
    vendorId: string,
    workbook: string,
    itemNumber: string | number,
    opts: { excludeId?: string | null } = {},
): Promise<boolean> {
    const vendor = String(vendorId).trim().toUpperCase();
    const n = integer(itemNumber);
    if (!vendor || n === null) return false;
    const exclude = opts.excludeId ? String(opts.excludeId) : null;
    const taken = (rows: Record<string, any>[]) =>
        rows.some(r => String(r.id) !== exclude && numberOf(r, vendor) === n);

    const { rows, source } = await vendorBookRows(vendor, workbook);
    if (taken(rows)) return true;
    if (source === 'remote') return false;

    try {
        let q = supabase
            .from('inventory')
            .select('id, item_id, item_number')
            .in('workbook', workbookVariants(workbook))
            .ilike('item_id', `${vendor}-%`)
            // By number or by the padded id: older rows carry only one of them.
            .or(`item_number.eq.${n},item_id.eq.${formatItemId(vendor, n)}`);
        if (exclude) q = q.neq('id', exclude);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).length > 0;
    } catch (err) {
        console.warn('[inventoryCreate] Remote duplicate check failed; using the local answer.', err);
        return false;
    }
}

/**
 * Every item number a vendor already uses in a book, for checking a whole
 * batch at once (Batch Create) instead of one isDuplicate round trip per
 * row. The local copy and Supabase are merged, for the reason isDuplicate
 * asks both: the local mirror can lag behind a row created on another device
 * a minute ago. When Supabase cannot be reached the local answer stands;
 * when neither can, this throws, because numbering blind is how a book ends
 * up with two EM-052s.
 */
export async function getTakenItemNumbers(vendorId: string, workbook: string): Promise<Set<number>> {
    const vendor = String(vendorId).trim().toUpperCase();
    const taken = new Set<number>();
    const add = (rows: Record<string, any>[]) => rows.forEach(r => {
        const n = numberOf(r, vendor);
        if (Number.isFinite(n) && n > 0) taken.add(n);
    });
    const { rows, source } = await vendorBookRows(vendor, workbook);
    add(rows);
    if (source === 'local' && vendor && workbookVariants(workbook).length) {
        try {
            const { data, error } = await supabase
                .from('inventory')
                .select('id, item_id, item_number')
                .in('workbook', workbookVariants(workbook))
                .ilike('item_id', `${vendor}-%`);
            if (error) throw error;
            add((data || []) as Record<string, any>[]);
        } catch (err) {
            console.warn('[inventoryCreate] Remote number list failed; using the local copy.', err);
        }
    }
    return taken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The columns for one entry.
 *
 * create: a full insert row with an explicit workbook, the padded item_id,
 * vendor_id, the default status, created_by and timestamp (the table's
 * creation date), a uuid, and the book codes at the 17 rate.
 *
 * edit: a patch of the entry columns that differ from `existing`. Never
 * created_by / timestamp, never book_barcode when the row has a printed one
 * (it is filled in only when the row has none yet), the book codes only when
 * the price changed, media_urls only when `form.mediaUrls` is given, and
 * nothing the form does not show (pay_req, AI columns, lifecycle...).
 *
 * Both: '' becomes NULL, numbers are parsed, updated_at is always set (the
 * delta pull reads it), and no code is ever the '-' placeholder.
 */
export function buildInventoryRow(form: InventoryForm, opts: { mode: 'create' } & BuildRowOptions): InventoryInsert & { id: string };
export function buildInventoryRow(form: InventoryForm, opts: { mode: 'edit' } & BuildRowOptions): InventoryUpdate;
export function buildInventoryRow(form: InventoryForm, opts: BuildRowOptions): InventoryInsert | InventoryUpdate;
export function buildInventoryRow(form: InventoryForm, opts: BuildRowOptions): InventoryInsert | InventoryUpdate {
    const now = opts.now ?? new Date().toISOString();
    const existing = opts.existing ?? null;
    const vendor = String(form.vendorId ?? '').trim().toUpperCase();
    const workbook = normalizeWorkbook(form.workbook);
    const itemNumber = integer(form.itemNumber);
    if (!vendor) throw new Error('A vendor is required');
    if (!workbook) throw new Error('A book is required');
    if (itemNumber === null || itemNumber < 1) throw new Error('An item number is required');

    const itemId = formatItemId(vendor, itemNumber);
    const price = decimal(form.price);
    const quantity = integer(form.quantity);

    const columns: InventoryUpdate = {
        item_id: itemId,
        item_number: itemNumber,
        vendor_id: vendor,
        workbook,
        status: text(form.status) ?? (opts.mode === 'create' ? DEFAULT_ENTRY_STATUS : (text(existing?.status) ?? DEFAULT_ENTRY_STATUS)),
        shape: text(form.shape),
        short_description: text(form.type),
        color: text(form.color),
        material: text(form.material),
        description: text(form.description),
        width_cm: decimal(form.widthCm),
        height_cm: decimal(form.heightCm),
        length_cm: decimal(form.lengthCm),
        weight_kg: decimal(form.weightKg),
        price_mxn: price,
        quantity: quantity !== null && quantity > 0 ? quantity : 1,
        updated_at: now,
    };

    if (form.mediaUrls !== undefined) {
        const media = form.mediaUrls.map(u => String(u).trim()).filter(Boolean);
        columns.media_urls = media.length ? media.join(',') : null;
    } else if (opts.mode === 'create') {
        columns.media_urls = null;
    }

    // ── book codes, at the book rate ──
    const printed = opts.mode === 'edit' ? storedBarcodeOf(existing) : null;
    const codes = calculateCodesAndPrices(
        {
            price_mxn: price ?? 0,
            item_id: itemId,
            item_number: itemNumber,
            vendor_id: vendor,
            workbook,
            // Passed so the computed display agrees with the label; the column
            // itself is left out of an edit below whenever this is set.
            book_barcode: printed ?? '',
        },
        DEFAULT_EXCHANGE_RATE,
        workbook,
    );
    const hasPrice = price !== null && price > 0;
    // On an edit the codes are rewritten only when the price moved (or none
    // are stored yet): re-deriving them on a shape fix would overwrite what
    // the trigger stored with the client's arithmetic for no reason.
    const priceMoved = opts.mode === 'create' || decimal(existing?.price_mxn) !== price || !code(existing?.book_aq_code);
    if (priceMoved) {
        columns.book_aq_code = hasPrice ? code(codes.bookAqCode) : null;
        columns.book_land_code = hasPrice ? code(codes.bookLandCode) : null;
        columns.book_acquisition = hasPrice ? decimal(codes.bookAcquisition) : null;
        columns.book_landed = hasPrice ? decimal(codes.bookLanded) : null;
        columns.book_retail = hasPrice ? decimal(codes.bookRetail) : null;
    }
    // A label printed without a stored barcode (see labelPrinted) keeps the
    // column as it is: the trigger, not a client recompute, fills it.
    if (!printed && !(opts.mode === 'edit' && labelPrinted(existing))) {
        // No printed barcode yet: fill one in when the price allows it. On an
        // edit without a price the column is left alone rather than nulled.
        const barcode = hasPrice ? code(codes.bookBarcode) : null;
        if (opts.mode === 'create' || barcode) columns.book_barcode = barcode;
    }

    if (opts.mode === 'edit') {
        // A patch: only what differs from the stored row, plus updated_at. An
        // unchanged vendor / book / number is not resent, so the book-fields
        // trigger (which fires on UPDATE OF those columns) is not woken for a
        // note fix.
        if (!existing) return columns;
        const same = (a: unknown, b: unknown) => {
            if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
            if (typeof a === 'number' || typeof b === 'number') return decimal(a) === decimal(b);
            return String(a) === String(b);
        };
        const patch: InventoryUpdate = { updated_at: now };
        for (const [k, v] of Object.entries(columns) as [keyof InventoryUpdate, unknown][]) {
            if (k === 'updated_at') continue;
            if (k === 'workbook' ? normalizeWorkbook(existing.workbook) !== v : !same(v, existing[k as string])) {
                (patch as Record<string, unknown>)[k] = v;
            }
        }
        return patch;
    }

    return {
        ...columns,
        id: opts.id ?? crypto.randomUUID(),
        created_by: text(opts.user?.name) ?? text(opts.user?.email),
        // The table's creation date; it has no created_at of its own to rely on.
        timestamp: now,
    } as InventoryInsert & { id: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** Mirror a stored row into RxDB. Best-effort: realtime sync repairs a miss. */
async function mirror(row: InventoryRow | null | undefined): Promise<void> {
    if (!row) return;
    try {
        const db = await localDb(10000);
        if (!db?.inventory) return;
        // The returned row, not the payload: an upsert REPLACES the local
        // document, and the payload lacks every column the form does not show
        // (AI copy, lifecycle, crate...), which the list then lost until the
        // next pull.
        await db.inventory.upsert({
            ...row,
            id: String(row.id),
            workbook: row.workbook != null ? String(row.workbook) : null,
        });
    } catch (err) {
        console.warn('[inventoryCreate] RxDB mirror failed; realtime sync will repair it.', err);
    }
}

export interface CreateItemResult {
    ok: boolean;
    /** The row as stored (with the trigger's codes), when ok. */
    row?: InventoryRow;
    /** Why it failed, when not ok. */
    error?: string;
    /** The row that was sent. */
    input: InventoryInsert;
}

/**
 * Insert rows one at a time, each mirrored into RxDB from what Supabase
 * returned. One result per row, in order: a failed row does not stop the
 * others, and the caller reports exactly which ones did not save.
 */
export async function createInventoryItems(rows: readonly InventoryInsert[]): Promise<CreateItemResult[]> {
    const results: CreateItemResult[] = [];
    for (const input of rows) {
        try {
            const { data, error } = await supabase.from('inventory').insert(input).select('*').single();
            if (error) throw new Error(error.message);
            const row = data as InventoryRow;
            await mirror(row);
            results.push({ ok: true, row, input });
        } catch (err: any) {
            results.push({ ok: false, error: err?.message || String(err), input });
        }
    }
    return results;
}

/**
 * Update one row by uuid and mirror the stored result. Throws when the row is
 * not in `inventory` (a production-table row, or one deleted meanwhile)
 * instead of creating it, which is what the old upsert did.
 */
export async function updateInventoryItem(id: string, patch: InventoryUpdate): Promise<InventoryRow> {
    if (!id) throw new Error('updateInventoryItem: no row id');
    const { data, error } = await supabase
        .from('inventory')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    if (error) throw new Error(`Save failed: ${error.message}`);
    if (!data) throw new Error('This item is not in the inventory table, so it cannot be edited here.');
    const row = data as InventoryRow;
    await mirror(row);
    return row;
}

/**
 * The stored row by uuid: Supabase first (an edit starts from the latest
 * values, including the raw book_barcode), the local copy when offline or
 * when Supabase has not answered within `timeoutMs`.
 * null when neither has it.
 */
export async function loadInventoryRow(id: string, timeoutMs = 6000): Promise<InventoryRow | null> {
    if (!id) return null;
    try {
        // A hanging connection must not keep the Edit Entry modal on
        // "Loading" forever: after `timeoutMs` the local copy answers.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const { data, error } = await Promise.race([
            supabase.from('inventory').select('*').eq('id', id).maybeSingle(),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The item took too long to load')), timeoutMs); }),
        ]).finally(() => { if (timer) clearTimeout(timer); });
        if (error) throw error;
        if (data) return data as InventoryRow;
        return null;
    } catch (err) {
        console.warn('[inventoryCreate] Remote read failed; using the local copy.', err);
    }
    try {
        const db = await localDb();
        const doc = await db?.inventory?.findOne(String(id)).exec();
        return doc ? (doc.toJSON ? doc.toJSON() : doc) as InventoryRow : null;
    } catch {
        return null;
    }
}
