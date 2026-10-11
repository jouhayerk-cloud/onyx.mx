/**
 * Last line of defence before an ExcelJS workbook is written to bytes.
 *
 * Excel (desktop and the iPhone app) shows "We found a problem with some content ... recover as much as we can?" when the package holds
 * values it cannot parse. The ones that happen in practice are: NaN or Infinity numbers (written as <v>NaN</v>), invalid dates,
 * HYPERLINK formulas whose URL holds a double quote or control character, text over 32,767 characters, characters that are illegal in XML,
 * and sheet names with : \ / ? * [ ] or leading and trailing apostrophes.
 *
 * sanitizeWorkbookForExcel walks every cell once and repairs those cases in place. It returns how many cells it changed and a few notes,
 * so the caller can log them (a repair means some data upstream is not clean and is worth fixing at its source).
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ILLEGAL_XML = /[\v\f\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\u200B-\u200F\u2028-\u202F\uFEFF]/g;
const URL_BAD = /[\s"\x00-\x1F\x7F-\x9F\u200B-\u200F\u2028-\u202F\uFEFF]/g;
const SHEET_BAD = /[:\\/?*[\]]/g;
const MAX_CELL = 32767;
const MAX_URL = 2000;

/** Removes whitespace, quotes and control characters from a URL; returns '' when what is left is not an http(s) link. */
export function cleanExcelUrl(raw: unknown): string {
    const url = String(raw ?? '').replace(URL_BAD, '');
    if (!/^https?:\/\//i.test(url)) return '';
    return url.length > MAX_URL ? url.slice(0, MAX_URL) : url;
}

const HYPERLINK_FORMULA = /^\s*=?\s*HYPERLINK\(\s*"([\s\S]*)"\s*,\s*"([^"]*)"\s*\)\s*$/i;

export function sanitizeWorkbookForExcel(workbook: any): { fixed: number; notes: string[] } {
    let fixed = 0;
    const notes: string[] = [];
    const bump = (note: string) => {
        fixed += 1;
        if (notes.length < 20) notes.push(note);
    };

    workbook.eachSheet((ws: any) => {
        const original = String(ws.name ?? '');
        const cleaned = original.replace(SHEET_BAD, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet';
        if (cleaned !== original) {
            try {
                ws.name = cleaned;
                bump(`sheet name "${original}" renamed to "${cleaned}"`);
            } catch {
                /* a duplicate name: leave it, ExcelJS reports it itself */
            }
        }

        ws.eachRow({ includeEmpty: false }, (row: any) => {
            row.eachCell({ includeEmpty: false }, (cell: any) => {
                const v = cell.value;
                const at = `${ws.name}!${cell.address}`;

                if (typeof v === 'number') {
                    if (!Number.isFinite(v)) {
                        cell.value = null;
                        bump(`${at}: non-finite number removed`);
                    }
                    return;
                }
                if (typeof v === 'string') {
                    let s = v.replace(ILLEGAL_XML, '');
                    if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL - 3) + '...';
                    if (s !== v) {
                        cell.value = s;
                        bump(`${at}: text cleaned`);
                    }
                    return;
                }
                if (v instanceof Date) {
                    if (Number.isNaN(v.getTime())) {
                        cell.value = null;
                        bump(`${at}: invalid date removed`);
                    }
                    return;
                }
                if (v && typeof v === 'object') {
                    // ExcelJS hides a formula's cached result from cell.value; it is only readable as cell.result.
                    const obj = v as Record<string, unknown>;
                    if (typeof obj.formula === 'string') {
                        const m = HYPERLINK_FORMULA.exec(obj.formula);
                        if (m) {
                            const label = m[2].replace(ILLEGAL_XML, '');
                            const url = cleanExcelUrl(m[1]);
                            // A link cell is safer as a hyperlink value than as a formula string, and it cannot be broken by a quote in the URL.
                            cell.value = url ? { text: label || url, hyperlink: url } : label;
                            if (!url || m[1] !== url) bump(`${at}: HYPERLINK formula rewritten`);
                        } else if (/hyperlink/i.test(obj.formula)) {
                            cell.value = null;
                            bump(`${at}: unparseable HYPERLINK formula removed`);
                        } else if (typeof cell.result === 'number' && !Number.isFinite(cell.result)) {
                            cell.value = { formula: obj.formula, result: 0 };
                            bump(`${at}: non-finite formula result replaced by 0`);
                        }
                    } else if (typeof obj.hyperlink === 'string') {
                        const url = cleanExcelUrl(obj.hyperlink);
                        if (url !== obj.hyperlink) {
                            cell.value = url ? { text: obj.text ?? url, hyperlink: url } : String(obj.text ?? '');
                            bump(`${at}: hyperlink cleaned`);
                        }
                    }
                }
            });
        });
    });

    return { fixed, notes };
}
