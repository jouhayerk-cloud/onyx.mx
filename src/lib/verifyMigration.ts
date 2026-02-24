import { createClient } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('🔍 Starting Data Verification...');

    const files = ['public/bookDASH.xlsx', 'public/book0326.xlsx'];
    let totalExcelRows = 0;

    for (const file of files) {
        if (!existsSync(file)) {
            console.warn(`⚠️ File not found: ${file}`);
            continue;
        }
        const workbook = read(readFileSync(file));
        const inventorySheets = workbook.SheetNames.filter(n => !n.startsWith('-') && n !== 'bookV');

        for (const sheetName of inventorySheets) {
            const sheet = workbook.Sheets[sheetName];
            const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            const rows = data.slice(2).filter(r => r && r[0]); // Skip headers
            totalExcelRows += rows.length;
            console.log(`- ${file} [${sheetName}]: ${rows.length} rows`);
        }
    }

    const { count, error } = await supabase.from('inventory').select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Error fetching Supabase count:', error);
    } else {
        console.log(`\n📋 Comparison Results:`);
        console.log(`Excel Total (Estimated): ${totalExcelRows}`);
        console.log(`Supabase Inventory: ${count}`);

        if (count === totalExcelRows) {
            console.log('✅ Inventory counts match perfectly!');
        } else {
            console.warn('⚠️ Inventory counts differ. This might be due to duplicates or empty rows in Excel.');
        }
    }

    const { count: finCount } = await supabase.from('finance').select('*', { count: 'exact', head: true });

    const results = [];
    results.push(`Excel Total (Estimated): ${totalExcelRows}`);
    results.push(`Supabase Inventory: ${count}`);
    results.push(`Supabase Finance Entries: ${finCount}`);

    const finalLog = results.join('\n');
    console.log(finalLog);
    writeFileSync('verify_results.txt', finalLog);

    console.log('\n🏁 Verification complete.');
}

verify();
