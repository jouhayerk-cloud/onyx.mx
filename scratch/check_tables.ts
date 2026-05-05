
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkTables() {
    // We can't list tables directly easily, but we can try to select from known ones
    const tables = ['inventory', 'production', 'financials', 'logistics', 'payment_vouchers'];
    for (const t of tables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`Table '${t}': Error or missing (${error.message})`);
        } else {
            console.log(`Table '${t}': Found (${count} records)`);
        }
    }
}

checkTables();
