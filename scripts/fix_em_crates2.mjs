import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findEM() {
    const { data: crates } = await supabase.from('logistics').select('id, inventory_ids, status').eq('status', 'Deployed');
    
    const allIds = new Set();
    crates.forEach(c => {
        if (c.inventory_ids) {
            c.inventory_ids.split(',').forEach(x => allIds.add(x.split(':')[0]));
        }
    });
    
    const { data: inv, error } = await supabase.from('inventory').select('id, item_id').in('id', Array.from(allIds));
    if (error) {
        console.error("Inventory error:", error);
        return;
    }
    
    let toPack = [];
    crates.forEach(c => {
        let isEM = false;
        if (c.inventory_ids && inv) {
            const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
            const items = inv.filter(i => ids.includes(i.id));
            items.forEach(i => {
                const itemId = i.item_id || '';
                if (itemId.toUpperCase().includes('EM')) isEM = true;
            });
        }
        if (isEM) {
            console.log(`Crate ${c.id.slice(0,8)} is an EM crate.`);
            toPack.push(c.id);
        }
    });
    
    if (toPack.length > 0) {
        await supabase.from('logistics').update({ status: 'Packed', truck_id: null, truck_position: null }).in('id', toPack);
        console.log(`Updated ${toPack.length} crates back to Packed.`);
    } else {
        console.log("No deployed EM crates found.");
    }
}
findEM();
