import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCrates() {
    const { data: crates } = await supabase.from('logistics').select('id, status, created_at, updated_at, parent_id').in('status', ['Packed', 'Deployed', 'In Transit']);
    
    crates.forEach(c => {
        const d = new Date(c.created_at);
        console.log(`ID: ${c.id.slice(0,8)} Status: ${c.status} Created: ${d.getMonth()+1}/${d.getDate()} Parent: ${c.parent_id !== null}`);
    });
}
checkCrates();
