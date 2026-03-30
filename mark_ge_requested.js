import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://yircifkayqpuydfdqzlm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function mark_requested() {
    const targetNumbers = [1, 2, 3, 4, 5, 6, 14, 15, 16, 17];
    console.log(`--- Updating GE Items ${targetNumbers.join(', ')} to Payment Requested Status ---`);

    // 1. Fetch the items
    const { data: items, error: fetchErr } = await supabase
        .from('inventory')
        .select('id, item_id, item_number')
        .or('item_id.ilike.GE*')
        .in('item_number', targetNumbers);

    if (fetchErr) {
        console.error("Fetch Error:", fetchErr.message);
        return;
    }

    if (!items || items.length === 0) {
        console.log("No matching items found.");
        return;
    }

    for (const item of items) {
        process.stdout.write(`Updating ${item.item_id} (Num ${item.item_number})... `);
        const { error: updateErr } = await supabase
            .from('inventory')
            .update({ 
                status: 'Requested', // Per user's "payment requested"
                pay_req: 'true',      // Standard for requested status
                updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

        if (updateErr) console.log(`[ERR] ${updateErr.message}`);
        else console.log(`[OK]`);
    }

    console.log("\nUpdate complete.");
}

mark_requested().catch(console.error);
