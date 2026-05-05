
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkSpaces() {
    console.log("Checking for items with leading spaces in item_id...");
    const { data, error } = await supabase
        .from('inventory')
        .select('item_id')
        .ilike('item_id', ' %');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} records with leading spaces.`);
}

checkSpaces();
