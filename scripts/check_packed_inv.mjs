import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPackedInventory() {
    const { data: crates } = await supabase.from('logistics').select('id, description, status, inventory_ids').in('status', ['Packed', 'Partial']);
    const { data: inv } = await supabase.from('inventory').select('id, item_id, timestamp');
    
    crates.forEach(c => {
        if (!c.inventory_ids) return;
        
        const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
        const items = inv.filter(i => ids.includes(i.id));
        
        if (items.length > 0) {
            // Find earliest item date
            const d = new Date(Math.min(...items.map(i => new Date(i.timestamp).getTime())));
            const monthName = d.toLocaleString('default', { month: 'short' });
            
            console.log(`ID: ${c.id.slice(0,8)} | Inventory Month: ${monthName} | Items count: ${items.length}`);
        }
    });
}
checkPackedInventory();
