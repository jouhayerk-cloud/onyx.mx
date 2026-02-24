import { createClient } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    try {
        console.log('🚀 Starting Legacy Migration (825 -> Supabase)...');

        const filePath = path.resolve('public/bookDASH.xlsx');
        console.log(`Reading file: ${filePath}`);
        const fileBuffer = readFileSync(filePath);
        const workbook = read(fileBuffer);
        const sheetNames = workbook.SheetNames.filter(name => !name.startsWith('-') && name !== 'bookV');

        console.log(`Found ${sheetNames.length} vendors: ${sheetNames.join(', ')}`);

        for (const sheetName of sheetNames) {
            console.log(`Processing Vendor: ${sheetName}...`);
            const sheet = workbook.Sheets[sheetName];
            const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            if (data.length < 2) {
                console.warn(`⚠️ Sheet ${sheetName} is empty or missing headers.`);
                continue;
            }

            // Headers are usually at row 2 (index 1)
            const headers = (data[1] || []).map(h => String(h || '').toUpperCase());
            console.log(`Headers for ${sheetName}:`, headers);
            const rows = data.slice(2);

            const mapCols = (row: any[]) => {
                const getVal = (header: string) => {
                    const idx = headers.findIndex(h => h && typeof h === 'string' && h.includes(header));
                    return idx !== -1 ? row[idx] : null;
                };

                const excelDateToISO = (val: any) => {
                    if (typeof val === 'number') {
                        const date = new Date(Math.round((val - 25569) * 864e5));
                        if (!isNaN(date.getTime())) return date.toISOString();
                    }
                    return new Date().toISOString();
                };

                // Mapping 825 logic
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
            };

            const batch = rows.filter(r => r && r[0]).map(mapCols);

            if (batch.length > 0) {
                console.log(`Inserting ${batch.length} items for ${sheetName}...`);
                const { error } = await supabase.from('inventory').insert(batch);
                if (error) {
                    console.error(`❌ Error inserting ${sheetName}:`, error);
                } else {
                    console.log(`✅ Success for ${sheetName}`);
                }
            }
        }

        console.log('🏁 Migration process finished.');
    } catch (error) {
        console.error('💥 Migration failed with critical error:', error);
    }
}

migrate();
