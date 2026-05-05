
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkFluorite() {
    console.log("Searching for 'Fluorite'...");
    const { data, error } = await supabase
        .from('inventory')
        .select('description, short_description, material, shape, color, status, quantity')
        .or('description.ilike.%fluorite%,short_description.ilike.%fluorite%,material.ilike.%fluorite%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} matches:`);
    data.forEach(item => {
        console.log(`- [${item.status}] ${item.short_description || item.description} (Material: ${item.material}, Qty: ${item.quantity})`);
    });
}

checkFluorite();
