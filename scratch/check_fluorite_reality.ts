
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkFluoriteReality() {
    console.log("Auditing 'Fluorite' items...");
    const { data, error } = await supabase
        .from('inventory')
        .select('status, quantity, description, material')
        .or('material.ilike.%fluorite%,description.ilike.%fluorite%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const totalQty = data.reduce((a, b) => a + (b.quantity || 0), 0);
    console.log(`Total Quantity found: ${totalQty}`);
    
    const stats: Record<string, number> = {};
    data.forEach(item => {
        const s = item.status || 'Unknown';
        stats[s] = (stats[s] || 0) + (item.quantity || 0);
    });

    console.log("Fluorite Quantities by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
}

checkFluoriteReality();
