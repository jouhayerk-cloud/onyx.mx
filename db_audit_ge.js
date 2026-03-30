
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = "https://yircifkayqpuydfdqzlm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function audit() {
    console.log("--- Starting Comprehensive GE Audit ---");
    const results = { inventory: [], production: [], finance: [] };

    // 1. Audit Inventory
    process.stdout.write("Auditing Inventory... ");
    const { data: invData, error: invErr } = await supabase
        .from('inventory')
        .select('*')
        .or('item_id.ilike.GE*,vendor_id.eq.GE,description.ilike.%Gerado%,short_description.ilike.%Gerado%');
    
    if (invErr) console.error("Error:", invErr.message);
    else {
        results.inventory = invData;
        console.log(`Found ${invData.length}`);
    }

    // 2. Audit Production
    process.stdout.write("Auditing Production... ");
    const { data: prodData, error: prodErr } = await supabase
        .from('production')
        .select('*')
        .or('item_id.ilike.GE*,vendor_id.eq.GE,description.ilike.%Gerado%,short_description.ilike.%Gerado%');
    
    if (prodErr) console.error("Error:", prodErr.message);
    else {
        results.production = prodData;
        console.log(`Found ${prodData.length}`);
    }

    // 3. Audit Finance
    process.stdout.write("Auditing Finance... ");
    const { data: finData, error: finErr } = await supabase
        .from('finance_v2')
        .select('*')
        .or('vendor_id.eq.GE,description.ilike.%Gerado%,subcategory.ilike.%Gerado%');
    
    if (finErr) console.error("Error:", finErr.message);
    else {
        results.finance = finData;
        console.log(`Found ${finData.length}`);
    }

    fs.writeFileSync('db_audit_ge_results.json', JSON.stringify(results, null, 2));
    console.log("\nFull results saved to 'db_audit_ge_results.json'");
}

audit().catch(console.error);
