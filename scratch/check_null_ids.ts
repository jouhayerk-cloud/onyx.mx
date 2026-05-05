
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkNullIds() {
    console.log("Checking for items with NULL item_id but valid book_barcode...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity')
        .is('item_id', null)
        .not('book_barcode', 'is', null);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} such records.`);
    if (data.length > 0) {
        const vendorStats: Record<string, number> = {};
        data.forEach(item => {
            const v = item.book_barcode?.substring(0, 2) || 'Unknown';
            vendorStats[v] = (vendorStats[v] || 0) + (item.quantity || 0);
        });
        console.log("Vendor counts from book_barcode (where item_id is NULL):");
        Object.entries(vendorStats).forEach(([v, q]) => {
            console.log(`- ${v}: ${q}`);
        });
    }
}

checkNullIds();
