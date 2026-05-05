
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkSchema() {
    const { data, error } = await supabase.from('inventory').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    if (data && data[0]) {
        console.log("Columns found in 'inventory':");
        console.log(Object.keys(data[0]));
        console.log("\nSample record values:");
        console.log(data[0]);
    }
}

checkSchema();
