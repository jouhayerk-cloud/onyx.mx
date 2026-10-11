#!/usr/bin/env node
/**
 * Checks a vendor XLSX against the rules the app's Batch XLSX tab applies.
 *
 *   node scripts/vendor-xlsx/check-vendor-xlsx.mjs file.xlsx [--vendor EM]
 *
 * Prints OK, or the problems per sheet row. Exit 0 when there is no error
 * (warnings may print), 1 when there is an error or the file cannot be read,
 * 2 on bad usage.
 *
 * The rules are copied from src/features/upload/batchSheet.ts; the line
 * numbers sit beside each copy. They are copied, not imported, because that
 * file is TypeScript inside the app. make-vendor-xlsx.mjs imports
 * analyzeWorkbook from here, so the writer and the checker share one copy.
 * The format is specified in docs/import/VENDOR_XLSX_IMPORT_FORMAT.md.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

// ── constants ───────────────────────────────────────────────────────────────

/** batchSheet.ts:51 */
export const MAX_ITEMS = 100;

/** batchImport.ts:35 (BATCH_WORKBOOK = 'v826'): the only book this tab writes. */
export const BOOK = '826';

/**
 * consts.tsx:27-48 minus NON_VENDOR_CODES (entryModel.ts:78-81): the codes the
 * vendor picker offers, sorted as entryModel.ts:81 sorts them.
 */
export const VENDOR_CODES = ['AM', 'AN', 'BT', 'CA', 'CP', 'DH', 'EM', 'ET', 'FR', 'GE', 'GM', 'GS', 'IH', 'JM', 'ML', 'MM', 'ON', 'RF', 'SU', 'TE'];

/** batchSheet.ts:32-49, copied. Keys are folded headers (see foldHeader). */
export const COLUMN_MAP = {
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

/** batchSheet.ts:54 */
export const NUMERIC_FIELDS = ['quantity', 'widthCm', 'heightCm', 'lengthCm', 'weightKg', 'price'];

/** The header each field is read from, for messages. */
export const HEADER_OF_FIELD = {
  itemNumber: '#', quantity: 'cantidad', shape: 'forma', itemType: 'tipo', color: 'color',
  material: 'material', widthCm: 'ancho', heightCm: 'alto', lengthCm: 'fondo', weightKg: 'kg',
  price: 'precio', description: 'descripcion',
};

/** The header row this writer produces: Crear.xlsx's ten headers, then the optional ones. */
export const WRITER_HEADERS = ['cantidad', 'forma', 'tipo', 'color', 'material', 'ancho', 'alto', 'fondo', 'precio', 'total', '#', 'descripcion', 'kg'];

/**
 * Required by this format on every row. The app itself keeps a row when ANY
 * of precio, forma, tipo or descripcion is filled (batchSheet.ts:203), so
 * these three are stricter than the app; see the format doc.
 */
export const REQUIRED_FIELDS = ['shape', 'itemType', 'price'];

/** How each required field is named in messages. */
export const REQUIRED_TEXT = {
  shape: 'forma (shape)',
  itemType: 'tipo (type)',
  price: 'precio (price in MXN per piece)',
};

/** SHEET_ERROR texts, BatchCreateWizard.tsx:110-115 (the app words them through tr(), English shown here). */
const FATAL_TEXT = {
  unreadable: 'Could not read the file. It may be open in another program, or not be an xlsx.',
  no_rows: 'No data rows found in the spreadsheet.',
  no_headers: 'Could not recognise any column headers. Expected: cantidad, forma, tipo, color, material, ancho, alto, fondo, precio.',
  no_valid_rows: 'No row has a price, shape, type or description.',
};

/** Export headers (MainHeader.tsx:881-909) that the app does not read, and what to do instead. Keys are folded. */
const EXPORT_HINTS = {
  'shape type': "the app reads forma (shape) and tipo (type) as two columns",
  'colo material': 'the app reads color and material as two columns',
  'tag - id with lc': 'the item number goes in # (for example 4 or EM-004)',
  'quantity': 'the app reads cantidad (or qty)',
  'weight': 'the app reads kg (kilograms)',
  'pounds': 'the app reads kilograms only: write kg',
  'l inch': 'inches are not read: give ancho, alto and fondo in cm',
  'w inch': 'inches are not read: give ancho, alto and fondo in cm',
  'd inch': 'inches are not read: give ancho, alto and fondo in cm',
  'per piece pesos': 'the app reads precio (or price), MXN per piece',
  'total in pesos': 'totals are not needed: the app works from precio and cantidad',
  'per piece us$': 'USD prices are not read: the app works in MXN',
  'total in us$ dollars': 'USD totals are not read',
  'acq code': 'book codes are computed by the app',
  'lnd code': 'book codes are computed by the app',
  'retail': 'the retail price is computed by the app',
  'trk': 'not read',
};

// ── rules, copied from batchSheet.ts ───────────────────────────────────────

/** batchSheet.ts:66-73 */
export function foldHeader(header) {
  return String(header ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** batchSheet.ts:76-86. Like the app, a prototype name such as 'constructor' comes back as a function. */
export function mapHeader(header) {
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

/** batchSheet.ts:95-105 */
export function cleanNumberCell(raw) {
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
 * A text number the app reads in a way the writer probably did not mean: dots
 * as thousands marks ('1.250' reads as 1.25) or both marks ('1.250,50' reads
 * as 1.2505). Not part of the app; the same cleaning, warned about. Null when fine.
 */
export function ambiguousNumberText(raw, clean) {
  if (typeof raw !== 'string' || !clean || !clean.ok || !clean.value) return null;
  const s = raw.trim();
  // The app drops every comma unless it is a lone decimal comma, so a comma
  // AFTER a dot ('1.250,50') is read as thousands and comes out as 1.2505.
  if (/\.[\d.]*,\d/.test(s)) return `"${s}" has a comma after a dot (European format); the app reads it as ${clean.value}`;
  if (/^\$?\s*\d{1,3}(\.\d{3})+\s*(mxn|usd)?$/i.test(s)) return `"${s}" has dots as thousands marks; the app reads it as ${clean.value}`;
  return null;
}

/** batchSheet.ts:111-122 */
export function parseItemNumberCell(raw, vendor) {
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

// ── the analysis ─────────────────────────────────────────────────────────────

function hintFor(text) {
  const f = foldHeader(text);
  if (EXPORT_HINTS[f]) return ` (${EXPORT_HINTS[f]})`;
  if (/^image \d+$/.test(f)) return ' (photos are not in the file: name the photo files by item number, EM-004.jpg, and drop the folder on the review step)';
  return '';
}

/**
 * Reads a workbook the way batchSheet.ts parseSheet does and applies its
 * rules, plus this format's required fields. `data` is a Buffer or ArrayBuffer.
 *
 * Returns { fatal, sheetName, sheetNames, vendorSheet, columns, items,
 * problems, skippedBlank, skippedLimit, errors, warnings }. A problem is
 * { sheetRow (null for the file), level: 'error'|'warn', source: 'app'|'spec', text }.
 * source 'app' means the app itself refuses or drops it; 'spec' means this
 * format requires it.
 */
export function analyzeWorkbook(data, { vendor = '' } = {}) {
  const want = String(vendor || '').trim().toUpperCase();
  const rep = {
    vendor: want, fatal: null, sheetNames: [], sheetName: '', vendorSheet: false,
    columns: [], items: [], problems: [], skippedBlank: 0, skippedLimit: 0, errors: 0, warnings: 0,
  };
  const add = (sheetRow, level, source, text) => rep.problems.push({ sheetRow, level, source, text });
  const finish = () => {
    rep.errors = rep.problems.filter(p => p.level === 'error').length;
    rep.warnings = rep.problems.filter(p => p.level === 'warn').length;
    return rep;
  };
  const fail = (code) => {
    rep.fatal = code;
    add(null, 'error', 'app', FATAL_TEXT[code]);
    return finish();
  };

  // batchSheet.ts:163-174: read, then the sheet named after the vendor, else the first one.
  let book;
  try {
    book = XLSX.read(new Uint8Array(data), { type: 'array' });
  } catch {
    return fail('unreadable');
  }
  rep.sheetNames = book.SheetNames.slice();
  const named = want ? book.SheetNames.find(n => n.trim().toUpperCase() === want) : undefined;
  rep.sheetName = named ?? book.SheetNames[0] ?? '';
  rep.vendorSheet = !!named;
  const sheet = rep.sheetName ? book.Sheets[rep.sheetName] : undefined;
  if (!sheet) return fail('no_rows');
  if (want && !named) add(null, 'warn', 'file', `no sheet is named ${want}: the app reads "${rep.sheetName}", the first sheet`);
  else if (!want && book.SheetNames.length > 1) {
    add(null, 'warn', 'file', `${book.SheetNames.length} sheets (${book.SheetNames.join(', ')}); with no --vendor this check reads "${rep.sheetName}". The app reads the sheet named after the chosen vendor, else the first sheet`);
  }

  // batchSheet.ts:175-176: the first row of the used range is the header.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return fail('no_rows');
  const header = rows[0] || [];
  const top = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;
  if (top > 0) {
    add(null, 'warn', 'file', `the used range starts at Excel row ${top + 1}, not row 1: the app counts rows from there, so its "row N" is Excel row N+${top}`);
  }

  // batchSheet.ts:178-185
  const fieldMap = {};
  const seenField = {};
  header.forEach((h, i) => {
    const text = String(h ?? '').trim();
    const mapped = mapHeader(h);
    if (mapped && typeof mapped !== 'string') {
      add(1, 'error', 'app', `header "${text}" makes the app's column map fail (it is a JavaScript property name): rename it`);
      rep.columns.push({ col: i, header: text, field: null });
      return;
    }
    if (!text) return;
    if (mapped) {
      fieldMap[i] = mapped;
      if (!mapped.startsWith('_')) {
        if (seenField[mapped]) add(1, 'warn', 'file', `"${seenField[mapped]}" and "${text}" are both read as ${mapped}: the app keeps the last one ("${text}")`);
        seenField[mapped] = text;
      }
      rep.columns.push({ col: i, header: text, field: mapped });
    } else {
      rep.columns.push({ col: i, header: text, field: null });
      add(1, 'warn', 'file', `column "${text}" is not read by the app${hintFor(text)}`);
    }
  });
  const width = rows.reduce((w, r) => Math.max(w, r ? r.length : 0), 0);
  for (let c = 0; c < width; c++) {
    if (String(header[c] ?? '').trim()) continue;
    if (rows.some((r, k) => k > 0 && r && String(r[c] ?? '').trim() !== '')) {
      add(1, 'warn', 'file', `column ${XLSX.utils.encode_col(c)} has values but no header: the app ignores it`);
    }
  }
  if (!Object.values(fieldMap).some(f => !f.startsWith('_'))) return fail('no_headers');

  // Last column wins for a field read twice (the app's forEach overwrites).
  const colOf = {};
  Object.keys(fieldMap).map(Number).sort((a, b) => a - b).forEach(c => { colOf[fieldMap[c]] = c; });

  const typed = [];
  for (let r = 1; r < rows.length; r++) {                       // batchSheet.ts:192-238
    const row = rows[r];
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
    const sheetRow = r + 1;
    const raw = {};
    for (const f of Object.keys(colOf)) raw[f] = row[colOf[f]];
    const textOf = f => String(raw[f] ?? '').trim();

    if (!textOf('price') && !textOf('shape') && !textOf('itemType') && !textOf('description')) {
      rep.skippedBlank++;
      add(sheetRow, 'warn', 'app', 'no precio, forma, tipo or descripcion in this row: the app skips it (not imported)');
      continue;
    }
    if (rep.items.length >= MAX_ITEMS) {
      rep.skippedLimit++;
      add(sheetRow, 'warn', 'app', `past the ${MAX_ITEMS}-row limit: not imported`);
      continue;
    }

    const clean = {};
    for (const f of NUMERIC_FIELDS) {                             // batchSheet.ts:208-213
      clean[f] = cleanNumberCell(raw[f]);
      if (!clean[f].ok) add(sheetRow, 'error', 'app', `${HEADER_OF_FIELD[f]}: "${clean[f].value}" is not a number`);
      const amb = ambiguousNumberText(raw[f], clean[f]);
      if (amb) add(sheetRow, 'warn', 'app', `${HEADER_OF_FIELD[f]}: ${amb}. Write the number without thousands marks`);
    }
    const no = parseItemNumberCell(raw.itemNumber, want);         // batchSheet.ts:214-215
    if (!no.ok) {
      add(sheetRow, 'error', 'app', `"${no.value}" is not an item number: a number from 1 to 9999, the only prefix allowed being ${want || '(none: no vendor chosen)'}`);
    }

    // This format's required fields and value rules (see the doc).
    for (const f of REQUIRED_FIELDS) {
      const missing = f === 'price' ? !clean.price.value : !textOf(f);
      if (missing) add(sheetRow, 'error', 'spec', `${REQUIRED_TEXT[f]} is required`);
    }
    const price = clean.price;
    if (price.value && price.ok && !(Number(price.value) > 0)) add(sheetRow, 'error', 'spec', 'precio must be above 0');
    const qty = clean.quantity;
    if (qty.value && qty.ok && !(Number.isInteger(Number(qty.value)) && Number(qty.value) >= 1)) {
      add(sheetRow, 'error', 'spec', `cantidad must be a whole number, 1 or more (the app stores 0 as 1 and cuts 2.5 down to 2)`);
    }
    for (const f of ['widthCm', 'heightCm', 'lengthCm', 'weightKg']) {
      const c = clean[f];
      if (c.value && c.ok && !(Number(c.value) > 0)) add(sheetRow, 'error', 'spec', `${HEADER_OF_FIELD[f]} must be above 0 when it is filled in`);
    }
    if (!no.value) {
      add(sheetRow, 'warn', 'app', 'no # on this row: the app numbers it from the book when the file loads (photos match by number, so write one)');
    } else if (no.ok) {
      typed.push({ sheetRow, n: Number(no.value) });
    }

    rep.items.push({
      sheetRow,
      itemNumber: no.ok ? no.value : '',
      shape: textOf('shape'),
      itemType: textOf('itemType'),
      price: price.ok ? price.value : '',
      quantity: qty.ok && qty.value ? qty.value : '1',
    });
  }

  // batchSheet.ts:263-276: a number typed on two rows; the first row keeps it.
  const first = new Map();
  for (const t of typed) {
    if (!first.has(t.n)) first.set(t.n, t.sheetRow);
    else add(t.sheetRow, 'error', 'app', `#${t.n} is also on row ${first.get(t.n)} (repeated in this file): the app blocks Create until one is renumbered`);
  }

  if (!rep.items.length) return fail('no_valid_rows');             // batchSheet.ts:240
  return finish();
}

/** The report as printed: one line per problem, then the OK or FAILED line. */
export function formatReport(file, rep) {
  const lines = [file];
  const named = rep.vendorSheet ? `named after vendor ${rep.vendor}`
    : rep.vendor ? `no sheet named ${rep.vendor}, first sheet used` : 'no vendor given: first sheet used';
  lines.push(`  sheet "${rep.sheetName}" (${named}) · sheets in file: ${rep.sheetNames.length}`);
  const read = rep.columns.filter(c => c.field && !c.field.startsWith('_')).map(c => c.header);
  if (read.length) lines.push(`  columns read: ${read.join(', ')}`);
  const sorted = [...rep.problems].sort((a, b) => (a.sheetRow ?? 0) - (b.sheetRow ?? 0));
  for (const p of sorted) {
    const where = p.sheetRow === null ? 'file' : p.sheetRow === 1 ? 'row 1 (header)' : `row ${p.sheetRow}`;
    const tag = p.level === 'error' ? 'ERROR' : 'WARN ';
    lines.push(`  ${where}  ${tag}  ${p.source === 'spec' ? '[spec] ' : ''}${p.text}`);
  }
  if (rep.errors) {
    lines.push(`FAILED: ${rep.errors} error(s), ${rep.warnings} warning(s). Fix the rows above.`);
  } else {
    const warn = rep.warnings ? `${rep.warnings} warning(s) above` : '0 warnings';
    lines.push(`OK: ${rep.items.length} item row(s), 0 errors, ${warn}. Numbers already taken in book ${BOOK} are not checked here.`);
  }
  return lines.join('\n');
}

const USAGE = 'usage: node scripts/vendor-xlsx/check-vendor-xlsx.mjs file.xlsx [--vendor EM]';

export function main(argv) {
  const args = argv.slice(2);
  let vendor = '';
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--vendor') {
      vendor = String(args[++i] ?? '').trim().toUpperCase();
      if (!VENDOR_CODES.includes(vendor)) {
        console.error(`error: vendor "${vendor}" is not a code the vendor picker offers (${VENDOR_CODES.join(', ')})`);
        return 2;
      }
    } else if (a.startsWith('--')) {
      console.error(`error: unknown option ${a}\n${USAGE}`);
      return 2;
    } else {
      files.push(a);
    }
  }
  if (files.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  const file = resolve(files[0]);
  let data;
  try {
    data = readFileSync(file);
  } catch (e) {
    console.error(`error: cannot read ${file}: ${e.code || e.message}`);
    return 1;
  }
  const rep = analyzeWorkbook(data, { vendor });
  console.log(formatReport(file, rep));
  return rep.errors ? 1 : 0;
}

function isEntry() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
  } catch {
    return false;
  }
}

if (isEntry()) process.exitCode = main(process.argv);
