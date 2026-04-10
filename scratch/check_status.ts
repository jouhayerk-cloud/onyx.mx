
import { supabase } from './src/lib/supabase';

async function check() {
    const { data: items, error } = await supabase.from('inventory').select('book_barcode, item_id, tag_id, status').limit(50);
    console.log('Sample Inventory Statuses:', items ? items.map(i => i.status) : error);
    
    // Check specific known IDs if any
    const searchIDs = ['SU32625HL']; 
    for (const id of searchIDs) {
        const { data } = await supabase.from('inventory')
            .select('*')
            .or(`book_barcode.eq.${id},item_id.eq.${id},tag_id.eq.${id}`);
        console.log(`Results for ${id}:`, data);
    }
}

check();
