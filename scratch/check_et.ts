
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkET() {
    console.log("Checking for vendor 'ET' items...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity')
        .or('item_id.ilike.ET%,book_barcode.ilike.ET%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} records for ET.`);
}

checkET();
