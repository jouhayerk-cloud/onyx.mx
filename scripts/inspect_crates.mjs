import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectCrates() {
    const { data, error } = await supabase
        .from('logistics')
        .select('id, type, status, parent_id, truck_id, truck_position, inventory_ids, description');

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    const crates = data.filter(d => ['crate', 'pallet', 'cardboard'].includes((d.type || '').toLowerCase()));
    
    console.log(`Total crates/pallets/cardboards: ${crates.length}`);
    
    // Group by status
    const byStatus = {};
    crates.forEach(c => {
        const s = c.status || 'unknown';
        byStatus[s] = (byStatus[s] || 0) + 1;
    });
    console.log('Counts by status:', byStatus);

    // List Packed/Partial
    const packed = crates.filter(c => ['packed', 'partial'].includes((c.status || '').toLowerCase()));
    console.log(`\nPacked/Partial crates (${packed.length}):`);
    packed.forEach(c => {
        console.log(`- ID: ${c.id}`);
        console.log(`  Type: ${c.type}, Status: ${c.status}`);
        console.log(`  Parent ID: ${c.parent_id}`);
        console.log(`  Truck ID: ${c.truck_id}, Pos: ${c.truck_position}`);
        console.log(`  Description: ${c.description}`);
    });
}

inspectCrates();
