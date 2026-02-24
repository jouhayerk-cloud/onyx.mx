import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function listTitles() {
    const { data, error } = await supabase
        .from('inventory')
        .select('id, shape, item_number, description, short_description, material, workbook')
        .order('item_number', { ascending: true });

    if (error) { console.error('Error:', error.message); return; }
    if (!data || data.length === 0) { console.log('⚠️  No records found in inventory.'); return; }

    console.log(`\n📦 ${data.length} records in inventory:\n`);
    console.log('No. | Item # | Shape      | Material   | Workbook | Description');
    console.log('----+--------+------------+------------+----------+----------------------------------');
    data.forEach((item, i) => {
        const num = String(i + 1).padEnd(3);
        const itemNo = String(item.item_number || '—').padEnd(6);
        const shape = String(item.shape || '—').padEnd(10);
        const mat = String(item.material || '—').padEnd(10);
        const wb = String(item.workbook || '—').padEnd(8);
        const desc = String(item.short_description || item.description || '—').slice(0, 50);
        console.log(`${num} | ${itemNo} | ${shape} | ${mat} | ${wb} | ${desc}`);
    });
}

listTitles();
