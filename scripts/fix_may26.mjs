import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findMay() {
    const { data: crates } = await supabase.from('logistics').select('id, description, status, date, updated_at');
    
    let mayCrates = [];
    crates.forEach(c => {
        if (c.status !== 'Packed' && c.status !== 'Partial' && c.status !== 'In Transit') return;
        
        const d = c.updated_at ? new Date(c.updated_at) : (c.date ? new Date(c.date) : new Date());
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const prefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
        
        if (prefix === 'May26') {
            console.log(`May Crate: ID: ${c.id.slice(0,8)} | Status: ${c.status} | UpdatedAt: ${c.updated_at} | Date: ${c.date}`);
            mayCrates.push(c.id);
        }
    });
    
    if (mayCrates.length > 0) {
        await supabase.from('logistics').update({ status: 'Deployed' }).in('id', mayCrates);
        console.log(`Updated ${mayCrates.length} May crates to Deployed.`);
    }
}
findMay();
