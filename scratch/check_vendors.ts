
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkVendors() {
    console.log("Checking Vendor Counts...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id, book_barcode, quantity, status');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const vendors: Record<string, number> = {};
    const mismatches: any[] = [];

    data.forEach(item => {
        const vendorFromId = item.item_id?.substring(0, 2);
        const vendorFromBarcode = item.book_barcode?.substring(0, 2);
        const qty = item.quantity || 0;

        const v = vendorFromId || vendorFromBarcode || 'Unknown';
        vendors[v] = (vendors[v] || 0) + qty;

        if (vendorFromId && vendorFromBarcode && vendorFromId !== vendorFromBarcode) {
            mismatches.push({
                item_id: item.item_id,
                book_barcode: item.book_barcode,
                vendorFromId,
                vendorFromBarcode
            });
        }
    });

    console.log("Vendor Summary (Combined):");
    Object.entries(vendors).forEach(([v, q]) => {
        console.log(`- ${v}: ${q}`);
    });

    if (mismatches.length > 0) {
        console.log(`\nFound ${mismatches.length} prefix mismatches!`);
        console.log("Samples:", mismatches.slice(0, 5));
    }
}

checkVendors();
