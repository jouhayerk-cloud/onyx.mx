
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkSold() {
    console.log("Checking 'Sold' items count...");
    const { data, error } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('status', 'Sold');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const total = data.reduce((a, b) => a + (b.quantity || 0), 0);
    console.log(`Total Sold Quantity: ${total}`);
    console.log(`Number of Sold Records: ${data.length}`);
}

checkSold();
