
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkUnknowns() {
    console.log("Checking 'Unknown' vendor items...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity, description, status');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const unknowns = data.filter(item => {
        const v = item.item_id?.substring(0, 2) || item.book_barcode?.substring(0, 2);
        return !v;
    });

    console.log(`Found ${unknowns.length} unknown records.`);
    unknowns.forEach(u => console.log(u));
}

checkUnknowns();
