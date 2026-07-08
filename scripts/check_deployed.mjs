import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkDeployed() {
    const { data: crates } = await supabase.from('logistics').select('*').eq('status', 'Deployed');
    
    console.log(`Found ${crates.length} Deployed crates`);
    
    // Collect all inventory IDs from these crates
    const allIds = new Set();
    crates.forEach(c => {
        if (c.inventory_ids) {
            c.inventory_ids.split(',').forEach(x => allIds.add(x.split(':')[0]));
        }
    });
    
    // Fetch them
    const { data: inv } = await supabase.from('inventory').select('id, data, row').in('id', Array.from(allIds));
    
    crates.forEach(c => {
        let emFound = [];
        if (c.inventory_ids && inv) {
            const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
            const items = inv.filter(i => ids.includes(i.id));
            items.forEach(i => {
                const itemId = i.data?.itemId || i.data?.item_id || String(i.row || '');
                if (itemId.toUpperCase().includes('EM')) {
                    emFound.push(itemId);
                }
            });
        }
        
        let label = c.label;
        if (!label && c.description) {
            label = c.description.split(' POS')[0];
        }
        
        if (emFound.length > 0) {
            console.log(`ID: ${c.id.slice(0,8)} | Label: ${label} | EM Items: ${emFound.join(', ')} | Date: ${c.date}`);
        }
    });
}
checkDeployed();
