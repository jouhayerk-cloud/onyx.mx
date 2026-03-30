import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = "https://yircifkayqpuydfdqzlm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
    console.log("--- Inspecting Production Schema ---");
    // Get one record to see keys
    const { data, error } = await supabase.from('production').select('*').limit(1);
    if (error) console.error(error);
    else console.log("Production Columns:", Object.keys(data[0] || {}));

    console.log("\n--- Inspecting Inventory Schema ---");
    const { data: inv, error: invErr } = await supabase.from('inventory').select('*').limit(1);
    if (invErr) console.error(invErr);
    else console.log("Inventory Columns:", Object.keys(inv[0] || {}));
}

inspect().catch(console.error);
