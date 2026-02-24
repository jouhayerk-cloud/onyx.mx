import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
    const tables = ['inventory', 'finance', 'logistics', 'production'];
    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) console.error(`❌ ${table}:`, error.message);
        else console.log(`${count === 0 ? '✅' : '⚠️'} ${table}: ${count} records`);
    }
}

checkAll();
