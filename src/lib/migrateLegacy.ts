import { createClient } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { readFileSync, existsSync } from 'fs';
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
    if (typeof val === 'string' && val.includes('/')) {
        const parts = val.split('/');
        const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(date.getTime())) return date.toISOString();
    }
    return null;
};

const cleanNum = (val: any) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const n = parseFloat(val.replace(/[$,]/g, ''));
        return isNaN(n) ? 0 : n;
    }
    return 0;
};

const isValid = (val: any) => {
    if (!val) return false;
    const s = String(val).trim();
    if (s === '' || s === '0' || s === '0.0' || s === '0.00') return false;
    return true;
};

async function migrateAll(filename: string, defaultWorkbook: '825' | '326') {
    const filePath = path.resolve(filename);
    if (!existsSync(filePath)) return;
    console.log(`\n📦 Migrating ${filename} [${defaultWorkbook}]...`);
    const fileBuffer = readFileSync(filePath);
    const workbook = read(fileBuffer);
    const inventorySheets = workbook.SheetNames.filter(name => !name.startsWith('-') && name !== 'bookV');
    for (const sheetName of inventorySheets) {
        const sheet = workbook.Sheets[sheetName];
        const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (data.length < 2) continue;
        const headers = (data[1] || []).map(h => String(h || '').toUpperCase());
        const tagIdx = headers.findIndex(h => h && (h.includes('TAG') || h.includes('ID')));
        const rows = data.slice(2).filter(r => r && isValid(r[tagIdx !== -1 ? tagIdx : 0]));

        const batch = rows.map(row => {
            const getVal = (header: string) => {
                const idx = headers.findIndex(h => h && h.includes(header));
                return idx !== -1 ? row[idx] : null;
            };
            const price = cleanNum(getVal('COST') || getVal('PRECIO') || getVal('MXN') || 0);
            const payDate = excelDateToISO(getVal('PAY') || getVal('PAID'));
            const sentDate = excelDateToISO(getVal('SENT') || getVal('SHIP'));

            return {
                item_id: sheetName,
                item_number: String(getVal('TAG') || getVal('ID') || row[0] || ''),
                timestamp: excelDateToISO(getVal('DATE') || row[1]) || new Date().toISOString(),
                description: String(getVal('DESC') || getVal('OBJECT') || row[2] || ''),
                shape: String(getVal('SHAPE') || row[3] || ''),
                weight_kg: cleanNum(getVal('KG') || row[5]),
                height_cm: cleanNum(getVal('H CM') || row[6]),
                width_cm: cleanNum(getVal('W CM') || row[7]),
                length_cm: cleanNum(getVal('D CM') || row[8]),
                status: defaultWorkbook === '825' ? 'Shipped' : (sentDate ? 'Shipped' : (payDate ? 'Paid' : 'Approved')),
                price_mxn: price,
                pay_date: payDate,
                pay_req: !!payDate || !!getVal('PAY_REQ'),
                workbook: defaultWorkbook,
                in_production: defaultWorkbook === '326' && ['CA', 'AN'].includes(sheetName),
                paid: !!payDate || defaultWorkbook === '825',
                shipped: !!sentDate || defaultWorkbook === '825',
            };
        });
        if (batch.length > 0) {
            await supabase.from('inventory').insert(batch);
            console.log(`  ✅ Inventory [${sheetName}]: ${batch.length} items`);
        }
    }
    const logSheet = workbook.Sheets['-Log'] || workbook.Sheets['-vPayment'];
    if (logSheet) {
        const data = utils.sheet_to_json(logSheet, { header: 1 }) as any[][];
        const rows = data.slice(2).filter(r => r && isValid(r[2]) && isValid(r[4])); // Must have type and amount
        const batch = rows.map(row => ({
            amount: cleanNum(row[4]) / (cleanNum(row[1]) || 18),
            currency: 'USD',
            type: String(row[2] || 'Expense'),
            category: 'Log',
            description: `${row[0] || ''} - ${row[3] || ''} (TRK: ${row[5] || 'N/A'})`,
            vendor_id: String(row[0] || '').split(' ')[0],
            status: 'Paid',
            pay_date: excelDateToISO(row[1]) || new Date().toISOString()
        }));
        if (batch.length > 0) {
            await supabase.from('finance').insert(batch);
            console.log(`  ✅ Log: ${batch.length} entries`);
        }
    }
    const suppliesSheet = workbook.Sheets['-Supplies'] || workbook.Sheets['-vSupplies'];
    if (suppliesSheet) {
        const data = utils.sheet_to_json(suppliesSheet, { header: 1 }) as any[][];
        const rows = data.slice(5).filter(r => r && (isValid(r[2]) || isValid(r[3]))); // Must have item or description
        const batch = rows.map(row => ({
            amount: cleanNum(row[9]) || cleanNum(row[8]), // In or Out
            currency: 'MXN',
            type: 'Supply',
            category: 'Supplies',
            description: `${row[2] || ''} - ${row[3] || ''}`,
            status: 'Paid'
        }));
        if (batch.length > 0) {
            await supabase.from('finance').insert(batch);
            console.log(`  ✅ Supplies: ${batch.length} entries`);
        }
    }
    const prodSheet = workbook.Sheets['-Production'];
    if (prodSheet) {
        const data = utils.sheet_to_json(prodSheet, { header: 1 }) as any[][];
        const rows = data.slice(5).filter(r => r && isValid(r[2]) && isValid(r[8])); // Must have description and TAG ID
        const batch = rows.map(row => ({
            vendor_id: String(row[1] || '').split(' ')[0],
            tag_id: String(row[8] || ''),
            description: String(row[2] || ''),
            price_unit: cleanNum(row[3]),
            quantity: cleanNum(row[4]),
            total: cleanNum(row[5]),
            advance: cleanNum(row[6]),
            ready_date: excelDateToISO(row[7]),
            progress: cleanNum(row[5]) > 0 ? (cleanNum(row[6]) / cleanNum(row[5])) * 100 : 0
        }));
        if (batch.length > 0) {
            await supabase.from('production').insert(batch);
            console.log(`  ✅ Production: ${batch.length} orders`);
        }
    }
    const cratesSheet = workbook.Sheets['-Crates'] || workbook.Sheets['-vCrates'];
    if (cratesSheet) {
        const data = utils.sheet_to_json(cratesSheet, { header: 1 }) as any[][];
        const rows = data.slice(10).filter(r => r && isValid(r[1]) && (isValid(r[2]) || isValid(r[3]))); // Must have vendor and type/desc
        const batch = rows.map(row => ({
            date: excelDateToISO(row[0]),
            vendor_id: String(row[1] || '').split(' ')[0],
            item_type: String(row[2] || 'Crate'),
            description: String(row[3] || ''),
            quantity: cleanNum(row[4]),
            weight_kg: cleanNum(row[5]),
            weight_lbs: cleanNum(row[11]),
            l_cm: cleanNum(row[6]),
            w_cm: cleanNum(row[7]),
            d_cm: cleanNum(row[8]),
            dims_info: String(row[15] || ''),
            cost_mxn: cleanNum(row[10]),
            status: 'Warehouse'
        }));
        if (batch.length > 0) {
            await supabase.from('logistics').insert(batch);
            console.log(`  ✅ Logistics/Crates: ${batch.length} units`);
        }
    }
}

async function run() {
    try {
        console.log('🚀 UNIFIED MIGRATION v3 STARTED...');
        console.log('🧹 Clearing existing data...');
        await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('finance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('production').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('logistics').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        await migrateAll('public/bookDASH.xlsx', '825');
        await migrateAll('public/book0326.xlsx', '326');

        console.log('\n🏁 UNIFIED MIGRATION COMPLETE.');
    } catch (error) {
        console.error('💥 Critical Error:', error);
    }
}

run();
