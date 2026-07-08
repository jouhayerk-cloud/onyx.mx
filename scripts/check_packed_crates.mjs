import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCrates() {
    console.log('Fetching all crates...');
    const { data, error } = await supabase
        .from('logistics')
        .select('*');

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    console.log(`Found ${data.length} total crates.`);
    
    const packed = data.filter(c => c.status === 'Packed' || c.status === 'Partial');
    console.log(`Found ${packed.length} Packed/Partial crates.`);
    
    packed.forEach(c => {
        console.log(`- ID: ${c.id}`);
        console.log(`  Label/Desc: ${c.label || c.description}`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Parent ID: ${c.parent_id}`);
        console.log(`  Truck ID: ${c.truck_id}`);
    });
}

checkCrates();
