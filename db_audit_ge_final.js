import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = "https://yircifkayqpuydfdqzlm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function final_audit() {
    console.log("--- DEFINITIVE GE/GERADO AUDIT ---");
    const results = { 
        inventory: [], 
        possible_tables: ['inventory'], // Focused on inventory per user request
    };

    // Filter out item_number from ilike as it is a number
    const searchQueries = [
        "item_id.ilike.GE*",
        "description.ilike.%Gerado%",
        "material.ilike.%Gerado%",
        "short_description.ilike.%Gerado%",
        "color.ilike.%Gerado%"
    ];

    process.stdout.write(`Scanning inventory... `);
    const { data: invData, error: invErr } = await supabase
        .from('inventory')
        .select('*')
        .or(searchQueries.join(','));
    
    if (invErr) {
        console.log(`[ERR] ${invErr.message}`);
    } else {
        results.inventory = invData;
        console.log(`FOUND ${invData.length} records.`);
    }

    fs.writeFileSync('db_audit_ge_final.json', JSON.stringify(results, null, 2));
    console.log("\nFull Audit results saved to 'db_audit_ge_final.json'");
    
    // Summary of found vendors
    const vendors = {};
    invData.forEach(item => {
        const id = String(item.item_id || '');
        const v = id.includes('-') ? id.split('-')[0] : (id.startsWith('GE') ? 'GE' : 'Other');
        vendors[v] = (vendors[v] || 0) + 1;
    });
    console.log("Summary by Vendor prefix:", vendors);
}

final_audit().catch(console.error);
