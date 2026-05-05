
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkJM() {
    console.log("Searching for 'Jose Meza' or 'JM' items...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity, status, description')
        .or('description.ilike.%Jose Meza%,item_id.ilike.JM%,book_barcode.ilike.JM%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} records.`);
    const stats: Record<string, number> = {};
    data.forEach(item => {
        const s = item.status || 'Unknown';
        const q = item.quantity || 0;
        stats[s] = (stats[s] || 0) + q;
    });

    console.log("JM/Jose Meza Quantities by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
}

checkJM();
