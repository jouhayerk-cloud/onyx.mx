import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yircifkayqpuydfdqzlm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const fixAmbar = (str) => str ? str.replace(/\bambar\b/gi, 'Amber') : str;
const fixLuminarie = (str) => str ? str.replace(/\bLuminarie\b/gi, 'Luminary') : str;

async function main() {
    try {
        console.log("Fetching all items that might contain misspellings...");
        const { data: items, error } = await supabase
            .from('inventory')
            .select('id, color, shape, material, description, short_description, detailed_description')
            .or('color.ilike.%ambar%,shape.ilike.%ambar%,material.ilike.%ambar%,description.ilike.%ambar%,short_description.ilike.%ambar%,detailed_description.ilike.%ambar%,shape.ilike.%Luminarie%,material.ilike.%Luminarie%,description.ilike.%Luminarie%,short_description.ilike.%Luminarie%,detailed_description.ilike.%Luminarie%');
            
        if (error) throw error;
        console.log(`Found ${items?.length || 0} total items with potential misspellings.`);
        
        let updateCount = 0;

        for (const item of items || []) {
            const updates = {};
            
            // Check each text field
            const fields = ['color', 'shape', 'material', 'description', 'short_description', 'detailed_description'];
            let hasChanges = false;
            
            for (const field of fields) {
                if (item[field]) {
                    let newText = item[field];
                    newText = fixAmbar(newText);
                    newText = fixLuminarie(newText);
                    
                    if (newText !== item[field]) {
                        updates[field] = newText;
                        hasChanges = true;
                        console.log(`[Item: ${item.id}] Changed ${field}:`);
                        console.log(`   - FROM: "${item[field]}"`);
                        console.log(`   - TO:   "${newText}"`);
                    }
                }
            }
            
            if (hasChanges) {
                const { error: updateError } = await supabase
                    .from('inventory')
                    .update(updates)
                    .eq('id', item.id);
                    
                if (updateError) {
                    console.error(`Failed to update item ${item.id}:`, updateError);
                } else {
                    updateCount++;
                }
            }
        }
        
        console.log(`\nSuccessfully updated ${updateCount} items in the database.`);
        
    } catch (e) {
        console.error("Script failed:", e);
    }
}

main();
