
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkProductionSchema() {
    const { data, error } = await supabase.from('production').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    if (data && data[0]) {
        console.log("Columns found in 'production':");
        console.log(Object.keys(data[0]));
        console.log("\nSample production record values:");
        console.log(data[0]);
    } else {
        console.log("No production records found.");
    }
}

checkProductionSchema();
