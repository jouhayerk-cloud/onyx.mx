/**
 * import_825.ts
 * 
 * Imports all items from all 14 vendor sheets in public/825.xlsx into Supabase.
 * 
 * Run: npx tsx import_825.ts
 * 
 * NOTE: Run migrate_schema.sql in Supabase SQL Editor to unlock all columns.
 * Until then the script imports only core columns that already exist.
 * 
 * Column Mapping (825.xlsx → Supabase):
 *   col[0]  #              → item_number
 *   col[1]  Date           → timestamp
 *   col[2]  Description    → description + color + shape (auto-split)
 *   col[3]  TAG-ID         → item_id
 *   col[4]  Q              → quantity
 *   col[5]  KG             → weight_kg
 *   col[6]  H CM           → height_cm
 *   col[7]  W CM           → width_cm
 *   col[8]  D CM           → length_cm
 *   col[9]  Per piece MXN$ → price_mxn
 *   col[10] TOTAL PESOS    → (skipped)
 *   col[11] AQC            → book_aq_code  ← requires migrate_schema.sql
 *   col[12] LC             → book_land_code ← requires migrate_schema.sql
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

const XLS_PATH = path.join(process.cwd(), 'public', '825.xlsx');
const CHUNK_SIZE = 50;
const TODAY = new Date().toISOString().split('T')[0];

// Check if new columns exist by probing with a single row
async function detectSchema(): Promise<boolean> {
    const { error } = await supabase.from('inventory').select('book_aq_code').limit(1);
    return !error; // if no error, migration was applied
}

function parseDesc(raw: string) {
    const t = (raw || '').trim();
    const m = t.match(/^([^-]+)\s*-\s*(.+)$/);
    if (m && m[2].split(' ').length <= 3 && m[2].length < 30)
        return { description: t, color: m[1].trim() as string | null, shape: m[2].trim() as string | null };
    return { description: t, color: null as string | null, shape: null as string | null };
}

const n = (v: any): number | null => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return isNaN(x) ? null : x; };
const s = (v: any): string | null => { if (v == null) return null; const x = String(v).trim(); return x === '' || x.toLowerCase() === 'nan' ? null : x; };

function buildRow(r: any[], vendor: string): any {
    const { description, color, shape } = parseDesc(s(r[2]) || '');
    return {
        id: crypto.randomUUID(),
        workbook: '825', acquired_by: vendor, status: 'available', acquired_at: TODAY,
        item_number: n(r[0]), timestamp: s(r[1]),
        description, color, shape,
        item_id: s(r[3]), quantity: n(r[4]), weight_kg: n(r[5]),
        height_cm: n(r[6]), width_cm: n(r[7]), length_cm: n(r[8]),
        price_mxn: n(r[9]),
        // col[10] TOTAL PESOS skipped
        book_aq_code: s(r[11]),
        book_land_code: s(r[12]),
    };
}

function parseSheet(raw: any[][], vendor: string): any[] {
    let start = 0;
    for (let i = 0; i < Math.min(raw.length, 5); i++) {
        if (raw[i] && String(raw[i][0]).trim() === '#') { start = i + 1; break; }
    }
    return raw.slice(start)
        .filter(r => r && r.length >= 4 && (s(r[3]) || s(r[2])))
        .map(r => buildRow(r, vendor));
}

async function upsert(rows: any[], vendor: string) {
    let ok = 0, err = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('inventory').upsert(chunk, { onConflict: 'id' });
        if (error) { console.error(`  ❌ [${vendor}] ${error.message}`); err += chunk.length; }
        else { ok += chunk.length; process.stdout.write(`  ⏳ [${vendor}] ${ok}/${rows.length}\r`); }
    }
    return { ok, err };
}

async function main() {
    console.log(`\n📂 ${XLS_PATH}\n`);

    const hasNewColumns = await detectSchema();
    console.log(hasNewColumns
        ? `✅ Schema v6 detected — all columns available\n`
        : `⚠️  Schema v5 detected — importing core columns only (run migrate_schema.sql to unlock book_aq_code, book_land_code)\n`
    );

    const wb = XLSX.readFile(XLS_PATH);
    console.log(`📋 ${wb.SheetNames.length} vendor sheets: ${wb.SheetNames.join(', ')}\n`);

    let totalOk = 0, totalErr = 0;
    const log: string[] = [];

    for (const vendor of wb.SheetNames) {
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[vendor], { header: 1, defval: null, blankrows: false }) as any[][];
        const records = parseSheet(raw as any[][], vendor);

        if (!records.length) {
            console.log(`⚠️  [${vendor}] no valid rows`);
            log.push(`${vendor.padEnd(4)} |   0   |   0  | 0`);
            continue;
        }

        console.log(`\n🏷️  [${vendor}] ${records.length} rows...`);
        const { ok, err } = await upsert(records, vendor);
        console.log(`\n    ✅ ${ok} inserted  ❌ ${err} errors`);
        totalOk += ok; totalErr += err;
        log.push(`${vendor.padEnd(4)} | ${String(records.length).padEnd(5)} | ${String(ok).padEnd(4)} | ${err}`);
    }

    console.log('\n══════════════════════════════════');
    console.log('Vendor | Rows  | OK   | Err');
    console.log('-------+-------+------+----');
    log.forEach(l => console.log(l));
    console.log('══════════════════════════════════');
    const totalRows = log.reduce((a, l) => a + (parseInt(l.split('|')[1]) || 0), 0);
    console.log(`TOTAL  | ${String(totalRows).padEnd(5)} | ${String(totalOk).padEnd(4)} | ${totalErr}\n`);

    if (totalErr === 0) {
        console.log(`🎉 All ${totalOk} records imported successfully!\n`);
        if (!hasNewColumns) console.log(`ℹ️  To also import AQC/LC columns, run migrate_schema.sql in Supabase SQL Editor, then re-run this script.\n`);
    } else {
        console.log(`⚠️  ${totalErr} rows failed.\n`);
        process.exit(1);
    }
}

main().catch(e => { console.error('🔥 Fatal:', e.message || e); process.exit(1); });
