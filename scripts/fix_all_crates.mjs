import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixCrates() {
    const { data: crates } = await supabase.from('logistics').select('*');
    const { data: inv } = await supabase.from('inventory').select('id, timestamp');
    
    let toDeploy = [];
    let toPack = [];
    
    crates.forEach(c => {
        if (!c.inventory_ids || c.status === 'Empty') return;
        
        const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
        const items = inv.filter(i => ids.includes(i.id));
        
        if (items.length > 0) {
            // Check the month of the first item
            const date = new Date(items[0].timestamp);
            const month = date.getMonth(); // 0-indexed, May is 4, July is 6
            const monthName = date.toLocaleString('default', { month: 'short' });
            
            console.log(`Crate ${c.id.slice(0,8)} is from ${monthName}. Status: ${c.status}`);
            
            if (month === 6) { // Jul
                if (c.status !== 'Packed') {
                    toPack.push(c.id);
                }
            } else { // Not Jul (e.g. May, Jun, Apr, Mar, Feb)
                if (c.status === 'Packed' || c.status === 'Partial' || c.status === 'In Transit') {
                    toDeploy.push(c.id);
                }
            }
        }
    });
    
    console.log(`Found ${toDeploy.length} non-Jul crates to mark as Deployed.`);
    console.log(`Found ${toPack.length} Jul crates to mark as Packed.`);
    
    if (toDeploy.length > 0) {
        const { error } = await supabase.from('logistics').update({ status: 'Deployed' }).in('id', toDeploy);
        if (error) console.error("Update deploy error:", error);
        else console.log("Successfully marked non-Jul crates as Deployed!");
    }

    if (toPack.length > 0) {
        const { error } = await supabase.from('logistics').update({ status: 'Packed', truck_id: null, truck_position: null, parent_id: null }).in('id', toPack);
        if (error) console.error("Update pack error:", error);
        else console.log("Successfully marked Jul crates as Packed!");
    }
}
fixCrates();
