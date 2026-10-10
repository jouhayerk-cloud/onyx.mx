/**
 * CSV document renderer.
 *
 * Provides deterministic RFC 4180-compliant CSV generation with:
 * - CRLF (\r\n) line endings
 * - Optional UTF-8 BOM (\uFEFF, default on, for Microsoft Excel compatibility)
 * - Spreadsheet formula injection protection (CWE-1236)
 * - Typed formatters (text, integer, decimal with fixed precision, ISO date)
 * - Stable column ordering and empty representation for null/undefined
 */

export type CsvFormatterType = 'text' | 'integer' | 'decimal' | 'date';

export interface CsvColumn<T = any> {
    header: string;
    accessor: keyof T | ((row: T) => unknown);
    type?: CsvFormatterType;
    digits?: number;
    formatter?: (value: unknown, row: T) => unknown;
}

export interface CsvOptions {
    bom?: boolean;
    header?: boolean;
    delimiter?: string;
    lineEnding?: '\r\n' | '\n';
    fileName?: string;
    mime?: string;
}

export interface DocumentRenderResult {
    text: string;
    blob: Blob;
    fileName: string;
    mime: string;
    rowCount: number;
}

export type CsvRenderResult = DocumentRenderResult;

function isFormulaDangerous(char: string): boolean {
    return char === '=' || char === '+' || char === '-' || char === '@' || char === '\t' || char === '\r';
}

function isFiniteNumber(val: unknown): boolean {
    if (typeof val === 'number') {
        return Number.isFinite(val);
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '') return false;
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return Number.isFinite(Number(trimmed));
        }
    }
    return false;
}

function formatDecimal(val: number, digits: number): string {
    if (!Number.isFinite(val)) return '';
    let num = (Object.is(val, -0) || val === 0) ? 0 : val;
    let res = num.toFixed(digits);
    if (res.startsWith('-') && /^0(\.0*)?$/.test(res.slice(1))) {
        res = res.slice(1);
    }
    return res;
}

function formatInteger(val: number): string {
    if (!Number.isFinite(val)) return '';
    let rounded = Math.round(val);
    if (Object.is(rounded, -0) || rounded === 0) {
        rounded = 0;
    }
    return String(rounded);
}

function formatDate(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? '' : val.toISOString();
    }
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return '';
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? trimmed : d.toISOString();
    }
    return '';
}

function quoteField(val: string, delimiter: string): string {
    if (val === '') return '';
    const needsQuotes =
        val.includes('"') ||
        val.includes(delimiter) ||
        val.includes('\r') ||
        val.includes('\n');
    if (needsQuotes) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

export function toCsv<T = any>(
    rows: T[],
    columns: CsvColumn<T>[],
    options?: CsvOptions
): string {
    const delimiter = options?.delimiter ?? ',';
    const lineEnding = options?.lineEnding ?? '\r\n';
    const includeHeader = options?.header ?? true;
    const useBom = options?.bom ?? true;

    const lines: string[] = [];

    if (includeHeader) {
        const headerRow = columns
            .map(col => quoteField(col.header, delimiter))
            .join(delimiter);
        lines.push(headerRow);
    }

    for (const row of rows) {
        const cellValues: string[] = [];
        for (const col of columns) {
            let rawValue: unknown;
            if (typeof col.accessor === 'function') {
                rawValue = col.accessor(row);
            } else if (typeof col.accessor === 'string' || typeof col.accessor === 'number') {
                rawValue = (row as any)?.[col.accessor];
            }

            if (col.formatter) {
                rawValue = col.formatter(rawValue, row);
            }

            if (rawValue === null || rawValue === undefined) {
                cellValues.push('');
                continue;
            }

            let cellStr = '';
            const isNumericCol = col.type === 'integer' || col.type === 'decimal';
            const isFiniteVal = isFiniteNumber(rawValue);

            switch (col.type) {
                case 'integer': {
                    if (typeof rawValue === 'number') {
                        cellStr = formatInteger(rawValue);
                    } else if (typeof rawValue === 'string') {
                        const trimmed = rawValue.trim();
                        const num = Number(trimmed);
                        cellStr = Number.isFinite(num) ? formatInteger(num) : trimmed;
                    } else if (typeof rawValue === 'boolean') {
                        cellStr = rawValue ? '1' : '0';
                    } else {
                        cellStr = '';
                    }
                    break;
                }
                case 'decimal': {
                    const digits = col.digits !== undefined && col.digits >= 0 ? col.digits : 2;
                    if (typeof rawValue === 'number') {
                        cellStr = formatDecimal(rawValue, digits);
                    } else if (typeof rawValue === 'string') {
                        const trimmed = rawValue.trim();
                        const num = Number(trimmed);
                        cellStr = Number.isFinite(num) ? formatDecimal(num, digits) : trimmed;
                    } else {
                        cellStr = '';
                    }
                    break;
                }
                case 'date': {
                    cellStr = formatDate(rawValue);
                    break;
                }
                case 'text':
                default: {
                    if (typeof rawValue === 'string') {
                        cellStr = rawValue.normalize('NFC').trim();
                    } else if (typeof rawValue === 'number') {
                        cellStr = Number.isFinite(rawValue) ? String(Object.is(rawValue, -0) ? 0 : rawValue) : '';
                    } else if (typeof rawValue === 'boolean') {
                        cellStr = rawValue ? 'true' : 'false';
                    } else if (rawValue instanceof Date) {
                        cellStr = formatDate(rawValue);
                    } else {
                        cellStr = String(rawValue).normalize('NFC').trim();
                    }
                    break;
                }
            }

            if (cellStr.length > 0) {
                const firstChar = cellStr.charAt(0);
                if (isFormulaDangerous(firstChar) && !(isNumericCol && isFiniteVal)) {
                    cellStr = "'" + cellStr;
                }
            }

            cellValues.push(quoteField(cellStr, delimiter));
        }
        lines.push(cellValues.join(delimiter));
    }

    const body = lines.join(lineEnding) + (lines.length > 0 ? lineEnding : '');
    return useBom ? '\uFEFF' + body : body;
}

export function csvToBlob(text: string, options?: CsvOptions): Blob {
    const useBom = options?.bom ?? true;
    const mime = options?.mime ?? 'text/csv;charset=utf-8;';
    const hasBom = text.startsWith('\uFEFF');
    let content: BlobPart[];
    if (useBom && !hasBom) {
        content = ['\uFEFF', text];
    } else if (!useBom && hasBom) {
        content = [text.slice(1)];
    } else {
        content = [text];
    }
    return new Blob(content, { type: mime });
}

/** Renders rows as CSV text and a Blob, with file name, MIME type and row count. */
export function renderCsv<T = any>(
    rows: T[],
    columns: CsvColumn<T>[],
    options?: CsvOptions
): DocumentRenderResult {
    const text = toCsv(rows, columns, options);
    const blob = csvToBlob(text, options);
    const fileName = options?.fileName ?? 'export.csv';
    const mime = options?.mime ?? 'text/csv;charset=utf-8;';
    return {
        text,
        blob,
        fileName,
        mime,
        rowCount: rows.length
    };
}
