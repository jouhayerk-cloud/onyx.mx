
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function analyzeFluorite() {
    console.log("Analyzing 'Fluorite' by status...");
    const { data, error } = await supabase
        .from('inventory')
        .select('status, quantity')
        .or('description.ilike.%fluorite%,short_description.ilike.%fluorite%,material.ilike.%fluorite%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const stats: Record<string, number> = {};
    let total = 0;
    data.forEach(item => {
        const s = item.status || 'Unknown';
        const q = item.quantity || 0;
        stats[s] = (stats[s] || 0) + q;
        total += q;
    });

    console.log("Fluorite Quantities by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
    console.log(`Total: ${total}`);
}

analyzeFluorite();
