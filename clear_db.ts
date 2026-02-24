import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearInventory() {
    console.log('Connecting to Supabase...');
    console.log('Clearing inventory table...');

    // Supabase delete() requires a filter. We can match where id is not null.
    const { data, error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything (assuming UUIDs)

    if (error) {
        console.error('Error clearing inventory:', error.message);
    } else {
        console.log('Inventory table cleared successfully.');
        console.log('Deleted records:', data);
    }
}

clearInventory();
