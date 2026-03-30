import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Searching by vendor_id ---');
  
  // 1. Check inventory for EM/GE vendors
  const { data: items } = await supabase
    .from('inventory')
    .select('id, item_id, book_barcode, vendor_name, pay_req, payment_ids, pay_date')
    .or('vendor_name.eq.EM,vendor_name.eq.GE')
    .limit(50);

  if (items && items.length > 0) {
    console.log('Items found for EM/GE:');
    console.table(items);
  } else {
    console.log('No inventory items found for vendor_name EM or GE.');
  }

  // 2. Search finance for descriptions containing EM or GE (without the "Payment for" prefix if missing)
  const { data: finance } = await supabase
    .from('finance')
    .select('id, description, status, related_ids')
    .or('description.ilike.%EM%,description.ilike.%GE%');
  
  if (finance && finance.length > 0) {
    console.log('Finance Records:');
    console.table(finance);
  } else {
    console.log('No finance records found matching EM/GE descriptions.');
  }
}
main();
