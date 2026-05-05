
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkAllStatuses() {
    console.log("Checking all statuses in database...");
    const { data, error } = await supabase
        .from('inventory')
        .select('status, quantity');

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

    console.log("Global Quantities by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
}

checkAllStatuses();
