import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectPacked() {
    const { data: crates } = await supabase.from('logistics').select('*').in('status', ['Packed', 'Partial']);
    
    crates.forEach(c => {
        console.log(`Crate ${c.id}: dims ${c.length_cm}x${c.width_cm}x${c.height_cm}, inv: ${c.inventory_ids}`);
    });
}
inspectPacked();
