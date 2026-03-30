import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: finRecs } = await supabase
    .from('finance')
    .select('id, description, related_ids')
    .or(`description.ilike.%17 items from EM%,description.ilike.%10 items from GE%`);

  if (finRecs) {
    for (const f of finRecs) {
        console.log(`\nRecord: ${f.description}`);
        console.log(`Related IDs: ${JSON.stringify(f.related_ids)}`);
    }
    
    // Check if vendor name is exactly 'EM' or 'GE'
    const { data: vNames } = await supabase.from('inventory').select('vendor_name').limit(100);
    const unique = new Set(vNames?.map(v => v.vendor_name));
    console.log('\nUnique Vendor Names found in Inventory:');
    console.log(Array.from(unique));
  }
}
main();
