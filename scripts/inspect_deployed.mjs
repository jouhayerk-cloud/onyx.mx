import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectDeployed() {
    const { data: crates } = await supabase.from('logistics').select('*').in('status', ['Deployed', 'In Transit']);
    
    console.log(`Found ${crates.length} deployed/in transit crates.`);
    crates.slice(0, 10).forEach(c => {
        console.log(`Crate ${c.id}: status ${c.status}, label ${c.label}, desc ${c.description}, truck_id ${c.truck_id}`);
    });
}
inspectDeployed();
