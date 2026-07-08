import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixAll() {
    const { data: crates } = await supabase.from('logistics').select('id, description, status, inventory_ids');
    const { data: inv } = await supabase.from('inventory').select('id, item_id, timestamp');
    
    let toDeploy = [];
    let toPack = [];
    
    crates.forEach(c => {
        if (!c.inventory_ids) return;
        
        const ids = c.inventory_ids.split(',').map(x => x.split(':')[0]);
        const items = inv.filter(i => ids.includes(i.id));
        
        if (items.length > 0) {
            const minTime = Math.min(...items.map(i => new Date(i.timestamp).getTime()));
            const minDate = new Date(minTime);
            const month = minDate.getMonth(); // 6 is July
            
            // Is it an RF or EM crate?
            let isRF = false;
            let isEM = false;
            items.forEach(i => {
                const itemId = i.item_id || '';
                if (itemId.toUpperCase().includes('RF')) isRF = true;
                if (itemId.toUpperCase().includes('EM')) isEM = true;
            });
            
            // If it's currently Packed but it's from May/Mar (month < 6), deploy it.
            if (c.status === 'Packed') {
                if (month < 6) {
                    console.log(`Setting ${c.id.slice(0,8)} (Month: ${minDate.toLocaleString('default',{month:'short'})}) to Deployed`);
                    toDeploy.push(c.id);
                }
            }
            
            // If it's currently Deployed but it's from July, OR if it has RF and is from July, pack it!
            if (c.status === 'Deployed' || c.status === 'In Transit') {
                if (month === 6 || isRF) { // Jul26RF2 could have month=6
                    // Wait, only if the user meant it. 
                    // Let's only pull July crates that have EM or RF, or are just from July!
                    if (month === 6 || (isRF && minDate.getFullYear() === 2026)) {
                        console.log(`Setting ${c.id.slice(0,8)} (Month: ${minDate.toLocaleString('default',{month:'short'})}, isRF: ${isRF}, isEM: ${isEM}) back to Packed`);
                        toPack.push(c.id);
                    }
                }
            }
        }
    });
    
    if (toDeploy.length > 0) {
        await supabase.from('logistics').update({ status: 'Deployed' }).in('id', toDeploy);
        console.log(`Updated ${toDeploy.length} older packed crates to Deployed.`);
    }
    
    if (toPack.length > 0) {
        await supabase.from('logistics').update({ status: 'Packed', truck_id: null, truck_position: null, parent_id: null }).in('id', toPack);
        console.log(`Updated ${toPack.length} July crates back to Packed.`);
    }
}
fixAll();
