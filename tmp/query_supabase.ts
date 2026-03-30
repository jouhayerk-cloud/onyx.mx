import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const searchStatus = process.argv[2] || 'requested';
  console.log(`--- Querying Inventory with status: ${searchStatus} ---`);

  const { data, error } = await supabase
    .from('inventory')
    .select('id, item_id, book_barcode, pay_req, pay_date, payment_ids')
    .eq('pay_req', searchStatus)
    .limit(10);

  if (error) {
    console.error('Error:', error.message);
  } else {
    if (data && data.length > 0) {
      console.table(data);
    } else {
      console.log('No records found with this status.');
      
      console.log('\nChecking all non-null pay_req values:');
      const { data: all } = await supabase.from('inventory').select('pay_req').not('pay_req', 'is', null).limit(10);
      console.log(all);
    }
  }
}

main();
