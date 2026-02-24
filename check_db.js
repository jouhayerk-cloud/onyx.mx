import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- DB Check ---');
    const { data: stats, error } = await supabase.from('inventory').select('workbook');
    if (error) console.error(error);
    else {
        const counts = stats.reduce((acc, d) => {
            acc[d.workbook] = (acc[d.workbook] || 0) + 1;
            return acc;
        }, {});
        console.log('Workbook totals:', counts);
    }
}
check();
