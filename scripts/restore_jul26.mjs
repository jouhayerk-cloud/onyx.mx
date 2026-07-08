import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function restoreJulCrates() {
    const ids = [
        '2d39ed2d-d60f-4fcb-860e-db478a876798',
        'ab4d8cde-e847-41eb-8c1d-15ec345cf6b8',
        'ed087bfe-e4a0-4131-ab10-ff99c43a3d53',
        '02f663f0-466f-42e7-910a-d843815c4d0a',
        '74f33682-14eb-4c8d-8a4a-1ab0ca8915dd',
        'd3e20dd4-7389-4977-8d07-2aeb6b876fc1'
    ];
    
    // I don't have the full UUIDs for all of them off hand. Let's just query by prefix!
    const { data: crates } = await supabase.from('logistics').select('id, updated_at, date, status, inventory_ids').eq('status', 'Deployed');
    
    let toPack = [];
    crates.forEach(c => {
        const d = c.updated_at ? new Date(c.updated_at) : (c.date ? new Date(c.date) : new Date());
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const prefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
        
        if (prefix === 'Jul26') {
            toPack.push(c.id);
        }
    });
    
    console.log(`Found ${toPack.length} crates with Jul26 prefix that are Deployed. Packing them...`);
    
    if (toPack.length > 0) {
        await supabase.from('logistics').update({ status: 'Packed', truck_id: null, truck_position: null }).in('id', toPack);
        console.log("Done packing.");
    }
}
restoreJulCrates();
