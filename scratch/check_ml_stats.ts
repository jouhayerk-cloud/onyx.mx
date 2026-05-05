
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function analyzeML() {
    console.log("Analyzing Vendor 'ML' by status...");
    const { data, error } = await supabase
        .from('inventory')
        .select('status, quantity, item_id, book_barcode')
        .or('item_id.ilike.ML%,book_barcode.ilike.ML%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const stats: Record<string, number> = {};
    data.forEach(item => {
        const s = item.status || 'Unknown';
        const q = item.quantity || 0;
        stats[s] = (stats[s] || 0) + q;
    });

    console.log("ML Quantities by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
    console.log(`Total: ${data.reduce((a, b) => a + (b.quantity || 0), 0)}`);
}

analyzeML();
