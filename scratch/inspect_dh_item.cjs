
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase config");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectItem() {
    console.log("Inspecting item DH-51XC2WKX...");
    const { data, error } = await supabase
        .from('inventory')
        .select('id, item_id, book_barcode')
        .or('item_id.eq.DH-51XC2WKX,book_barcode.eq.DH-51XC2WKX,item_id.eq.DH51XC2WKX,book_barcode.eq.DH51XC2WKX')
        .maybeSingle();

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Result:", data);
}

inspectItem();
