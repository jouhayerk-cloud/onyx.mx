#!/usr/bin/env node
/**
 * Writes a Batch XLSX file that the app's Batch XLSX tab reads.
 *
 *   node scripts/vendor-xlsx/make-vendor-xlsx.mjs input.json output.xlsx
 *
 * input.json: { "vendor": "EM", "book": "826", "items": [ { "shape": "Large", "itemType": "Bowl", "price": 2850, ... } ] }
 * The item keys are listed in docs/import/VENDOR_XLSX_IMPORT_FORMAT.md.
 *
 * A row that lacks a required field, or holds a value the app cannot use,
 * is refused: exit 1, the messages on stderr, and no file is written. The
 * finished workbook is checked with the checker's rules before it is written.
 */
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    ambiguousNumberText, analyzeWorkbook, BOOK, cleanNumberCell, HEADER_OF_FIELD, MAX_ITEMS, parseItemNumberCell, REQUIRED_FIELDS,
    REQUIRED_TEXT, VENDOR_CODES, WRITER_HEADERS,
} from './check-vendor-xlsx.mjs';

const USAGE = 'usage: node scripts/vendor-xlsx/make-vendor-xlsx.mjs input.json output.xlsx';
const TOP_KEYS = ['vendor', 'book', 'items'];
const ITEM_KEYS = ['itemNumber', 'quantity', 'shape', 'itemType', 'color', 'material', 'widthCm', 'heightCm', 'lengthCm', 'weightKg', 'price', 'description'];
const POSITIVE_NUMBER_KEYS = ['widthCm', 'heightCm', 'lengthCm', 'weightKg'];
const WIDTH = { cantidad: 10, forma: 14, tipo: 16, color: 16, material: 14, ancho: 9, alto: 9, fondo: 9, precio: 12, total: 12, '#': 8, descripcion: 40, kg: 8 };
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Words ExcelJS cannot write as cell text (its shared-string table is a plain object). */
const PROTOTYPE_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Text from a JSON value: trimmed; undefined/null is empty; numbers are written as text. */
function textOf(value) {
    if (value === undefined || value === null) return { ok: true, value: '' };
    if (typeof value !== 'string' && typeof value !== 'number') return { ok: false, value: '' };
    return { ok: true, value: String(value).trim() };
}

/**
 * The rows for the workbook, or the errors and warnings. Nothing here touches
 * the disk. Numbers are cleaned exactly as the app cleans them (cleanNumberCell).
 */
export function buildRows(input) {
    const errors = [];
    const warnings = [];
    const rows = [];
    if (!isPlainObject(input)) {
        return { errors: ['the input must be a JSON object: { "vendor", "book", "items" }'], warnings, rows, vendor: '' };
    }
    for (const k of Object.keys(input)) {
        if (!TOP_KEYS.includes(k)) errors.push(`unknown top-level key "${k}" (allowed: vendor, book, items)`);
    }
    const vendor = String(input.vendor ?? '').trim().toUpperCase();
    if (!VENDOR_CODES.includes(vendor)) {
        errors.push(`vendor "${input.vendor ?? ''}" is not a code the vendor picker offers (${VENDOR_CODES.join(', ')})`);
    }
    if (String(input.book ?? '').trim() !== BOOK) {
        errors.push(`book must be "${BOOK}": the Batch XLSX tab writes only book ${BOOK} (batchImport.ts BATCH_WORKBOOK); books 326 and 825 are entered one by one in Single Item`);
    }
    const items = input.items;
    if (!Array.isArray(items) || items.length === 0) {
        errors.push('items must be a non-empty array');
        return { errors, warnings, rows, vendor };
    }
    if (items.length > MAX_ITEMS) {
        errors.push(`${items.length} items: the app reads at most ${MAX_ITEMS} rows per file (batchSheet.ts MAX_ITEMS): split the list`);
    }

    const numbers = new Map();
    items.forEach((it, i) => {
        const at = `items[${i}] (sheet row ${i + 2})`;
        const bad = msg => errors.push(`${at}: ${msg}`);
        if (!isPlainObject(it)) { bad('must be an object'); return; }
        for (const k of Object.keys(it)) {
            if (!ITEM_KEYS.includes(k)) bad(`unknown field "${k}" (allowed: ${ITEM_KEYS.join(', ')})`);
        }

        const shape = textOf(it.shape);
        const itemType = textOf(it.itemType);
        const color = textOf(it.color);
        const material = textOf(it.material);
        const description = textOf(it.description);
        for (const [key, t] of Object.entries({ shape, itemType, color, material, description })) {
            if (!t.ok) bad(`${key} must be text`);
            else if (PROTOTYPE_NAMES.has(t.value)) {
                bad(`${key} "${t.value}" cannot be written: the writer library (ExcelJS) drops the whole sheet on that word; use another word`);
            }
        }
        // A text number the app would misread ('1.250') is refused, not passed on.
        const ambiguous = (key, c) => {
            const amb = ambiguousNumberText(it[key], c);
            if (amb) bad(`${amb}; write ${HEADER_OF_FIELD[key]} as a JSON number`);
        };

        const pc = cleanNumberCell(it.price);
        const have = { shape: shape.value, itemType: itemType.value, price: pc.value };
        for (const f of REQUIRED_FIELDS) {
            if (!have[f]) bad(`lacks the required field ${REQUIRED_TEXT[f]}`);
        }
        if (pc.value !== '' && !pc.ok) bad(`${HEADER_OF_FIELD.price}: "${pc.value}" is not a number`);
        else if (pc.value !== '' && !(Number(pc.value) > 0)) bad(`${HEADER_OF_FIELD.price} must be above 0`);
        else if (pc.value !== '') ambiguous('price', pc);
        const price = pc.ok && pc.value !== '' ? Number(pc.value) : 0;

        let quantity = 1;
        const qc = cleanNumberCell(it.quantity);
        if (!qc.ok) bad(`${HEADER_OF_FIELD.quantity}: "${qc.value}" is not a number`);
        else if (qc.value !== '') {
            const q = Number(qc.value);
            if (!Number.isInteger(q) || q < 1) bad(`${HEADER_OF_FIELD.quantity} must be a whole number, 1 or more (got ${qc.value})`);
            else { quantity = q; ambiguous('quantity', qc); }
        }

        const dims = {};
        for (const k of POSITIVE_NUMBER_KEYS) {
            const c = cleanNumberCell(it[k]);
            if (!c.ok) { bad(`${HEADER_OF_FIELD[k]}: "${c.value}" is not a number`); continue; }
            if (c.value === '') { dims[k] = undefined; continue; }
            if (!(Number(c.value) > 0)) bad(`${HEADER_OF_FIELD[k]} must be above 0 when it is filled in`);
            else ambiguous(k, c);
            dims[k] = Number(c.value);
        }

        let itemNumber;
        const no = it.itemNumber === undefined || it.itemNumber === null ? { value: '', ok: true } : parseItemNumberCell(it.itemNumber, vendor);
        if (no.value === '') {
            warnings.push(`${at}: no itemNumber: the app numbers this row from the book when the file loads`);
        } else if (!no.ok) {
            bad(`itemNumber "${no.value}" is not an item number: a number from 1 to 9999, the only prefix allowed being ${vendor}`);
        } else {
            itemNumber = Number(no.value);
            if (numbers.has(itemNumber)) bad(`itemNumber ${itemNumber} is also on ${numbers.get(itemNumber)} in this file`);
            else numbers.set(itemNumber, at);
        }

        if (!color.value) warnings.push(`${at}: no color`);
        if (!material.value) warnings.push(`${at}: no material`);
        if (dims.widthCm === undefined || dims.heightCm === undefined || dims.lengthCm === undefined) {
            warnings.push(`${at}: no full size (ancho, alto, fondo) in cm`);
        }

        rows.push({
            cantidad: quantity,
            forma: shape.value,
            tipo: itemType.value,
            color: color.value || undefined,
            material: material.value || undefined,
            ancho: dims.widthCm,
            alto: dims.heightCm,
            fondo: dims.lengthCm,
            precio: price,
            total: Math.round(price * quantity * 100) / 100,
            '#': itemNumber,
            descripcion: description.value || undefined,
            kg: dims.weightKg,
        });
    });
    return { errors, warnings, rows, vendor };
}

/** The workbook as a Buffer, checked with the checker's rules. */
export async function makeWorkbook(input) {
    const built = buildRows(input);
    if (built.errors.length) return { ...built, buffer: null, check: null };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(built.vendor);
    ws.columns = WRITER_HEADERS.map(h => ({ header: h, key: h, width: WIDTH[h] }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const col = h => WRITER_HEADERS.indexOf(h) + 1;
    for (const r of built.rows) {
        const row = ws.addRow(r);
        row.getCell(col('precio')).numFmt = '#,##0.00';
        row.getCell(col('total')).numFmt = '#,##0.00';
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const check = analyzeWorkbook(buffer, { vendor: built.vendor });
    return { ...built, buffer, check };
}

async function main(argv) {
    const [inPath, outPath, ...extra] = argv.slice(2);
    if (!inPath || !outPath || extra.length) {
        console.error(USAGE);
        return 2;
    }
    let input;
    try {
        input = JSON.parse(readFileSync(resolve(inPath), 'utf8'));
    } catch (e) {
        console.error(`error: ${inPath}: ${e.code === 'ENOENT' ? 'file not found' : `not valid JSON (${e.message})`}`);
        return 1;
    }
    const made = await makeWorkbook(input);
    if (made.errors.length) {
        for (const e of made.errors) console.error(`error: ${e}`);
        console.error(`nothing written: ${made.errors.length} error(s)`);
        return 1;
    }
    if (made.check.errors) {
        for (const p of made.check.problems.filter(p => p.level === 'error')) {
            console.error(`error: ${p.sheetRow ? `row ${p.sheetRow}` : 'file'}: ${p.text}`);
        }
        console.error(`nothing written: the workbook read back with ${made.check.errors} error(s)`);
        return 1;
    }
    const out = resolve(outPath);
    writeFileSync(out, made.buffer);
    for (const w of [...made.warnings, ...made.check.problems.filter(p => p.level === 'warn').map(p => p.text)]) {
        console.error(`warning: ${w}`);
    }
    const warnings = made.warnings.length + made.check.warnings;
    console.log(`wrote ${made.rows.length} rows to ${out} · sheet "${made.vendor}" · book ${BOOK} · check OK · ${warnings} warning(s)`);
    return 0;
}

function isEntry() {
    try {
        return import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
    } catch {
        return false;
    }
}

if (isEntry()) process.exitCode = await main(process.argv);
