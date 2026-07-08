import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPacked() {
    const { data: crates } = await supabase.from('logistics').select('id, description, status, date, updated_at').eq('status', 'Packed');
    
    crates.forEach(c => {
        const d = c.updated_at ? new Date(c.updated_at) : (c.date ? new Date(c.date) : new Date());
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const datePrefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
        console.log(`ID: ${c.id.slice(0,8)} | DynamicPrefix: ${datePrefix} | UpdatedAt: ${c.updated_at} | Date: ${c.date}`);
    });
}
checkPacked();
