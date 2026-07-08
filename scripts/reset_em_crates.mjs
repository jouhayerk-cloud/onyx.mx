import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function resetAll() {
    // Get everything that is packed, partial, deployed, or in transit
    const { data: crates } = await supabase.from('logistics').select('*').in('status', ['Packed', 'Partial', 'In Transit', 'Deployed']);
    
    let toUpdate = [];
    console.log(`Found ${crates.length} total active crates.`);
    
    // Find EM crates by looking at inventory table
    const { data: inv, error: invErr } = await supabase.from('inventory').select('id, item_id');
    if (invErr) {
        console.error("Inventory fetch error:", invErr);
        return;
    }
    
    const emIds = new Set(inv.filter(i => {
        const itemId = i.item_id || '';
        return itemId.toUpperCase().startsWith('EM');
    }).map(i => i.id));
    
    crates.forEach(c => {
        let isEm = false;
        if (c.inventory_ids) {
            const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
            if (ids.some(id => emIds.has(id))) isEm = true;
        }
        if (isEm) {
            console.log(`EM Crate found! ID: ${c.id}, Status: ${c.status}, Parent: ${c.parent_id}, Truck: ${c.truck_id}`);
            // Check if it's already perfectly available
            if (c.status !== 'Packed' || c.parent_id !== null || c.truck_id !== null || c.truck_position !== null) {
                toUpdate.push(c.id);
            }
        }
    });
    
    console.log(`Total EM crates needing reset: ${toUpdate.length}`);
    
    if (toUpdate.length > 0) {
        const { error } = await supabase.from('logistics').update({
            status: 'Packed',
            parent_id: null,
            truck_id: null,
            truck_position: null
        }).in('id', toUpdate);
        if (error) console.error("Update error:", error);
        else console.log("Successfully reset EM crates!");
    }
}
resetAll();
