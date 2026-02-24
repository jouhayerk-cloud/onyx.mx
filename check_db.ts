import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing environment variables");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInventory() {
    console.log('Checking inventory table count...');

    const { count, error } = await supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Inventory table count: ${count}`);
        if (count === 0) {
            console.log('✅ The database is empty.');
        } else {
            console.log('❌ The database is NOT empty.');
        }
    }
}

checkInventory();
