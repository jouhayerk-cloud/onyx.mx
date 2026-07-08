import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearLoaded() {
    const { data: crates } = await supabase.from('logistics').select('id, truck_id, truck_position, status').in('status', ['Packed', 'Partial']);
    
    let toClear = [];
    crates.forEach(c => {
        if (c.truck_id || c.truck_position) {
            console.log(`Clearing loaded data for crate ${c.id}`);
            toClear.push(c.id);
        }
    });
    
    if (toClear.length > 0) {
        await supabase.from('logistics').update({ truck_id: null, truck_position: null }).in('id', toClear);
        console.log(`Cleared loaded data for ${toClear.length} crates.`);
    } else {
        console.log("No crates were marked as loaded in the DB.");
    }
}
clearLoaded();
