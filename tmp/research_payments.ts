import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Searching for Specific Finance Records ---');

  const { data: finance, error } = await supabase
    .from('finance')
    .select('id, description, status, related_ids, related_inventory_ids, vendor_id')
    .or('description.ilike.%17 items from EM%,description.ilike.%10 items from GE%');

  if (error) {
    console.error('Error finding finance records:', error.message);
  } else {
    console.log('Finance Records Found:');
    console.table(finance);
    
    if (finance && finance.length > 0) {
        for (const f of finance) {
            const rel = f.related_ids || (f.related_inventory_ids ? f.related_inventory_ids.split(',') : []);
            console.log(`\nProcessing Payment ID: ${f.id} ("${f.description}")`);
            console.log(`Linked Inventory IDs: ${JSON.stringify(rel)}`);
            
            if (rel && rel.length > 0) {
                // Check current status of these items
                const { data: items } = await supabase
                    .from('inventory')
                    .select('id, item_id, pay_req, pay_date, payment_ids')
                    .in('id', rel.map((id: any) => Number(id)).filter((n: any) => !isNaN(n)));
                
                if (items) {
                    console.log(`Current Status of Linked Items:`);
                    console.table(items);
                }
            }
        }
    }
  }
}

main();
