import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findEMCrates() {
    const { data: crates } = await supabase.from('logistics').select('id, label, description, status, date').eq('status', 'Deployed');
    
    crates.forEach(c => {
        let isEM = false;
        if (c.label && c.label.toUpperCase().includes('EM')) isEM = true;
        if (c.description && c.description.toUpperCase().includes('EM')) isEM = true;
        
        // Also check if they are the Jul crates
        const d = new Date(c.date);
        const isJul = d.getMonth() === 6; // July
        
        if (isEM || isJul) {
            console.log(`ID: ${c.id.slice(0,8)} | Label: ${c.label} | Desc: ${c.description} | Status: ${c.status} | Date: ${c.date}`);
        }
    });
}
findEMCrates();
