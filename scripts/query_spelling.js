import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yircifkayqpuydfdqzlm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    try {
        console.log("Searching for 'ambar' in ANY text field to find misspellings...");
        const { data: colorData, error: colorError } = await supabase
            .from('inventory')
            .select('id, color, shape, material, description, short_description, detailed_description')
            .or('color.ilike.%ambar%,shape.ilike.%ambar%,material.ilike.%ambar%,description.ilike.%ambar%,short_description.ilike.%ambar%,detailed_description.ilike.%ambar%');
            
        if (colorError) throw colorError;
        console.log(`Found ${colorData?.length || 0} items with 'ambar' anywhere.`);
        if (colorData?.length) {
            console.log("Sample:", colorData.slice(0, 5));
        }

        console.log("\nSearching for 'Luminarie' anywhere (case-insensitive)...");
        const { data: typeData, error: typeError } = await supabase
            .from('inventory')
            .select('id, color, shape, material, description, short_description, detailed_description')
            .or('shape.ilike.%Luminarie%,material.ilike.%Luminarie%,description.ilike.%Luminarie%,short_description.ilike.%Luminarie%,detailed_description.ilike.%Luminarie%');
            
        if (typeError) throw typeError;
        console.log(`Found ${typeData?.length || 0} items with 'Luminarie' anywhere.`);
        if (typeData?.length) {
            console.log("Sample:", typeData.slice(0, 5));
        }
        
    } catch (e) {
        console.error(e);
    }
}

main();
