/**
 * Workbook V3 pure filters and constants.
 *
 * Season 826 is the active season for Workbook V3.
 * V3 exports only items of workbook 826 and only payment rows dated
 * 1 September 2026 or later.
 */

/** The season / workbook number for Workbook V3. */
export const WORKBOOK_V3_SEASON = 826;

/**
 * Cutoff date for V3 payment rows (Finance Ledger and vendor sheet payment rows).
 * Only entries dated 1 September 2026 or later are exported.
 */
export const WORKBOOK_V3_LEDGER_FROM = "2026-09-01";

/**
 * Checks whether an inventory item belongs to Workbook 826.
 *
 * In V2, the workbook number is read as `parseInt(item.workbook, 10)` (or fallback
 * to extracting 3 digits after the vendor prefix in the tag, e.g. `^[A-Z]+(\d{3})`).
 * Values like "v826" yield NaN from `parseInt("v826", 10)` in JavaScript, so they
 * are not treated as 826 unless resolved via tag.
 */
export function isWorkbookV3Item(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    const raw = item.workbook !== undefined ? item.workbook : item.data?.workbook;
    let wb = 0;
    if (raw !== undefined && raw !== null && raw !== '') {
        const parsed = parseInt(String(raw), 10);
        wb = isNaN(parsed) ? 0 : parsed;
    }
    if (!wb) {
        const d = item.data || item;
        const tag = String(d.book_barcode || d.itemId || d.item_id || item.label || d.tag_id || '').toUpperCase();
        const match = tag.match(/^[A-Z]+(\d{3})/);
        if (match) {
            const parsedTag = parseInt(match[1], 10);
            wb = isNaN(parsedTag) ? 0 : parsedTag;
        }
    }
    return wb === WORKBOOK_V3_SEASON;
}

const MONTH_MAP: Record<string, string> = {
    jan: '01', ene: '01', january: '01', enero: '01',
    feb: '02', february: '02', febrero: '02',
    mar: '03', march: '03', marzo: '03',
    apr: '04', abr: '04', april: '04', abril: '04',
    may: '05', mayo: '05',
    jun: '06', june: '06', junio: '06',
    jul: '07', july: '07', julio: '07',
    aug: '08', ago: '08', august: '08', agosto: '08',
    sep: '09', sept: '09', september: '09', septiembre: '09',
    oct: '10', october: '10', octubre: '10',
    nov: '11', november: '11', noviembre: '11',
    dec: '12', dic: '12', december: '12', diciembre: '12',
};

/**
 * Normalizes an entry's ledger date into a comparable `YYYY-MM-DD` string in local
 * calendar days, or `null` if the date is missing, empty, or unparseable.
 */
export function parseLedgerDateToComparable(raw: any): string | null {
    if (raw === null || raw === undefined || raw === '') return null;

    if (raw instanceof Date) {
        if (isNaN(raw.getTime())) return null;
        const y = raw.getFullYear();
        const m = String(raw.getMonth() + 1).padStart(2, '0');
        const d = String(raw.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    if (typeof raw === 'number') {
        if (isNaN(raw) || raw <= 0) return null;
        // Excel serial date number (typically between ~20000 and ~60000 for modern dates)
        if (raw < 100000) {
            const d = new Date(Math.round((raw - 25569) * 864e5));
            if (isNaN(d.getTime())) return null;
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        // Timestamp in ms
        const d = new Date(raw);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return null;

        // ISO pattern: YYYY-MM-DD or YYYY/MM/DD (preserves calendar date regardless of trailing time/zone)
        const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (isoMatch) {
            const y = isoMatch[1];
            const m = isoMatch[2].padStart(2, '0');
            const d = isoMatch[3].padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        // DD Mon YYYY text format (e.g. "01 Sep 2026", "1 Sep 2026", "31 Aug 2026", "01-Sep-2026")
        const dmyMatch = s.match(/^(\d{1,2})[\s\-\./]+([A-Za-z]+)[\s\-\./]+(\d{4})/);
        if (dmyMatch) {
            const day = dmyMatch[1].padStart(2, '0');
            const monKey = dmyMatch[2].toLowerCase();
            const year = dmyMatch[3];
            const month = MONTH_MAP[monKey];
            if (month) {
                return `${year}-${month}-${day}`;
            }
        }

        // Mon DD, YYYY format (e.g. "Sep 1, 2026", "September 1, 2026")
        const mdyMatch = s.match(/^([A-Za-z]+)[\s\-\./]+(\d{1,2})[,\s\-\./]+(\d{4})/);
        if (mdyMatch) {
            const monKey = mdyMatch[1].toLowerCase();
            const day = mdyMatch[2].padStart(2, '0');
            const year = mdyMatch[3];
            const month = MONTH_MAP[monKey];
            if (month) {
                return `${year}-${month}-${day}`;
            }
        }

        // Fallback: standard Date parsing
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        return null;
    }

    return null;
}

/**
 * Checks whether a finance / payment entry qualifies for Workbook V3.
 * V3 contains ONLY entries dated 1 September 2026 or later.
 * Entries with no date or an unreadable date return `false`.
 */
export function isWorkbookV3LedgerEntry(entry: any): boolean {
    if (entry === null || entry === undefined) return false;
    let rawDate: any = null;
    if (typeof entry === 'string' || typeof entry === 'number' || entry instanceof Date) {
        rawDate = entry;
    } else if (typeof entry === 'object') {
        rawDate = entry.date || entry.pay_date || entry.created_at || entry.reqDate || entry.payDate;
    }
    const comparable = parseLedgerDateToComparable(rawDate);
    if (!comparable) return false;
    return comparable >= WORKBOOK_V3_LEDGER_FROM;
}
