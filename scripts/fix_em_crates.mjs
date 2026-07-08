import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findEMCrates() {
    const { data: crates } = await supabase.from('logistics').select('id, description, status, date').eq('status', 'Deployed');
    
    let toPack = [];
    
    crates.forEach(c => {
        if (c.description && c.description.toUpperCase().includes('EM')) {
            console.log(`ID: ${c.id.slice(0,8)} | Desc: ${c.description} | Status: ${c.status} | Date: ${c.date}`);
            toPack.push(c.id);
        }
    });
    
    console.log(`Found ${toPack.length} EM crates that should be Packed.`);
    
    if (toPack.length > 0) {
        await supabase.from('logistics').update({ status: 'Packed', truck_id: null, truck_position: null }).in('id', toPack);
        console.log("Updated them to Packed.");
    }
}
findEMCrates();
