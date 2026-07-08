import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCrates() {
    console.log('Fetching all crates to find EM2 and EM3...');
    const { data, error } = await supabase
        .from('logistics')
        .select('*');

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    const emCrates = data.filter(c => c.label?.includes('EM') || c.description?.includes('EM') || c.inventory_ids?.includes('EM'));
    console.log(`Found ${emCrates.length} crates matching 'EM'.`);
    
    emCrates.forEach(c => {
        console.log(`- ID: ${c.id}`);
        console.log(`  Label: ${c.label}`);
        console.log(`  Description: ${c.description}`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Parent ID: ${c.parent_id}`);
        console.log(`  Truck ID: ${c.truck_id}`);
    });
}

checkCrates();
