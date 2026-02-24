import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log('--- DETAILED DB DEBUG ---');

    // Check Workbook counts
    const { data: counts, error: cErr } = await supabase.from('inventory').select('workbook');
    if (cErr) console.error('Count Error:', cErr);
    else {
        const stats = counts.reduce((acc, d) => {
            acc[d.workbook] = (acc[d.workbook] || 0) + 1;
            return acc;
        }, {});
        console.log('Raw counts:', stats);
    }

    // Check Sample from 326
    const { data: sample326, error: s326Err } = await supabase.from('inventory').select('*').eq('workbook', '326').limit(1);
    if (s326Err) console.error('Sample 326 Error:', s326Err);
    else console.log('Sample 326 Row Keys:', sample326[0] ? Object.keys(sample326[0]) : 'NONE');

    // Check Sample from null/empty workbook
    const { data: sampleOther, error: soErr } = await supabase.from('inventory').select('*').is('workbook', null).limit(1);
    if (soErr) console.error('Sample Null Error:', soErr);
    else if (sampleOther && sampleOther.length > 0) console.log('Found rows with workbook=null');

    // Check logistics/finance counts
    const { count: fCount } = await supabase.from('finance').select('*', { count: 'exact', head: true });
    console.log('Finance Count:', fCount);
}
debug();
