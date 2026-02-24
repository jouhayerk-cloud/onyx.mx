import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugData() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

    console.log('--- Inventory Count ---');
    const { count, error } = await supabase.from('inventory').select('*', { count: 'exact', head: true });
    if (error) console.error(error);
    else console.log('Total items in Supabase:', count);

    const { data: samples } = await supabase.from('inventory').select('id, item_id, workbook').limit(5);
    console.log('Sample data:', samples);
}

debugData();
