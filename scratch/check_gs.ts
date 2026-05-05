
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkGS() {
    console.log("Checking for vendor 'GS' items...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity')
        .or('item_id.ilike.GS%,book_barcode.ilike.GS%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} records for GS.`);
}

checkGS();
