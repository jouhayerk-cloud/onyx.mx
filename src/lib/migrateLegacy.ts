import { createClient } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const excelDateToISO = (val: any) => {
    if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 864e5));
        if (!isNaN(date.getTime())) return date.toISOString();
    }
    return new Date().toISOString();
};

async function migrateInventory(filename: string) {
    const filePath = path.resolve(filename);
    console.log(`Reading Inventory from: ${filePath}`);
    const fileBuffer = readFileSync(filePath);
    const workbook = read(fileBuffer);
    const sheetNames = workbook.SheetNames.filter(name => !name.startsWith('-') && name !== 'bookV');

    for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (data.length < 2) continue;

        const headers = (data[1] || []).map(h => String(h || '').toUpperCase());
        const rows = data.slice(2);

        const batch = rows.filter(r => r && r[0]).map(row => {
            const getVal = (header: string) => {
                const idx = headers.findIndex(h => h && typeof h === 'string' && h.includes(header));
                return idx !== -1 ? row[idx] : null;
            };

            return {
                item_id: sheetName,
                item_number: String(row[0] || ''),
                timestamp: excelDateToISO(row[1]),
                description: String(row[2] || ''),
                shape: String(row[3] || ''),
                weight_kg: parseFloat(row[5]) || 0,
                height_cm: parseFloat(row[6]) || 0,
                width_cm: parseFloat(row[7]) || 0,
                length_cm: parseFloat(row[8]) || 0,
                status: String(row[9] || 'Approved'),
                price_mxn: parseFloat(getVal('COST') || getVal('PRECIO') || getVal('MXN') || 0)
            };
        });

        if (batch.length > 0) {
            const { error } = await supabase.from('inventory').insert(batch);
            if (error) console.error(`❌ Error inserting ${sheetName} from ${filename}:`, error);
            else console.log(`✅ ${batch.length} items from ${sheetName} (${filename})`);
        }
    }
}

async function migrateLog(filename: string) {
    const filePath = path.resolve(filename);
    console.log(`Reading Log from: ${filePath}`);
    const fileBuffer = readFileSync(filePath);
    const workbook = read(fileBuffer);
    const sheet = workbook.Sheets['-Log'];
    if (!sheet) {
        console.warn('⚠️ No -Log sheet found in ' + filename);
        return;
    }

    const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    // Headers are at row 1 (index 1)
    const rows = data.slice(2);

    const batch = rows.filter(r => r && r[2]).map(row => {
        // [Vendor/Info, Rate, TYPE, DESCRIPTION, AMOUNT_MXN, TRK#]
        const amountMxn = parseFloat(row[4]) || 0;
        const rate = parseFloat(row[1]) || 18;

        return {
            amount: (amountMxn / rate).toFixed(2), // Convert to USD for standard finance table
            currency: 'USD',
            type: String(row[2] || 'Expense'),
            category: 'Migration',
            description: `${row[0] || ''} - ${row[3] || ''} (TRK: ${row[5] || 'N/A'})`,
            related_ids: []
        };
    });

    if (batch.length > 0) {
        const { error } = await supabase.from('finance').insert(batch);
        if (error) console.error('❌ Error inserting Finance Log:', error);
        else console.log(`✅ ${batch.length} log entries from ${filename}`);
    }
}

async function run() {
    try {
        console.log('🚀 Starting Full Migration Path...');

        // 1. Clear existing items to avoid duplicates for this final sync
        console.log('🧹 Clearing existing data...');
        await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('finance').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // 2. Migrate Inventory from bookDASH (Priority Legacy)
        await migrateInventory('public/bookDASH.xlsx');

        // 3. Migrate Inventory from book0326 (Active/Newer)
        await migrateInventory('public/book0326.xlsx');

        // 4. Migrate Log from book0326
        await migrateLog('public/book0326.xlsx');

        console.log('🏁 Full Migration complete.');
    } catch (error) {
        console.error('💥 Critical Error:', error);
    }
}

run();
