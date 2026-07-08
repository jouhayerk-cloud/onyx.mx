import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function search() {
    const { data: logs, error: lErr } = await supabase
        .from('logistics')
        .select('*');

    if (lErr) return console.error(lErr);
    
    console.log('Searching all logistics for EM2 or EM3...');
    logs.forEach(c => {
        const str = JSON.stringify(c).toLowerCase();
        if (str.includes('em2') || str.includes('em3') || str.includes('em 2') || str.includes('em 3') || str.includes('em-2') || str.includes('em-3')) {
            console.log(`\nMatch in logistics ID ${c.id}:`);
            console.log(`Status: ${c.status}`);
            console.log(`Label: ${c.label}`);
            console.log(`Desc: ${c.description}`);
            console.log(`Truck ID: ${c.truck_id}`);
        }
    });

    const { data: inv, error: iErr } = await supabase
        .from('inventory')
        .select('*');

    if (iErr) return console.error(iErr);

    console.log('\nSearching all inventory for EM2 or EM3...');
    inv.forEach(i => {
        const str = JSON.stringify(i).toLowerCase();
        if (str.includes('em2') || str.includes('em3') || str.includes('em 2') || str.includes('em 3') || str.includes('em-2') || str.includes('em-3')) {
            console.log(`Match in inventory row ${i.row}`);
        }
    });
}

search();
