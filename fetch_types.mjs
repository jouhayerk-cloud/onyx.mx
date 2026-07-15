import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    console.log('Fetching inventory...');
    while (true) {
        const { data, error } = await supabase.from('inventory').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error(error);
            break;
        }
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        page++;
    }

    const combinations = new Map();

    allData.forEach(row => {
        const item = row || {};
        const shape = (item.shape || '').trim().replace(/\s+/g, ' ');
        const shortDesc = (item.short_description || '').trim().replace(/\s+/g, ' ');
        
        if (shape || shortDesc) {
            const combo = `${shape} ${shortDesc}`.trim();
            if (combo) {
                combinations.set(combo, (combinations.get(combo) || 0) + 1);
            }
        }
    });

    console.log('\n--- UNIQUE SHAPE + SHORT_DESCRIPTION COMBOS ---');
    const sortedCombos = Array.from(combinations.entries()).sort((a, b) => b[1] - a[1]);
    sortedCombos.forEach(([combo, count]) => {
        console.log(`${combo} (${count})`);
    });
}

run();
