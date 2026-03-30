import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Querying Supabase Schema & Samples ---');

  // 1. Check Inventory Schema/Samples
  const { data: items, error: iErr } = await supabase
    .from('inventory')
    .select('id, item_id, book_barcode, payment_ids, pay_req')
    .limit(5);

  if (iErr) {
    console.error('Inventory query error:', iErr.message);
  } else {
    console.log('\nInventory Sample Data:');
    console.table(items);
  }

  // 2. Check Finance Samples
  const { data: finance, error: fErr } = await supabase
    .from('finance')
    .select('id, category, subcategory, related_ids, related_inventory_ids')
    .limit(5);

  if (fErr) {
    console.error('Finance query error:', fErr.message);
  } else {
    console.log('\nFinance Sample Data:');
    console.table(finance);
  }

  // 3. Try to find the "Production" subcategory in finance
  const { data: prodFinance, error: pErr } = await supabase
    .from('finance')
    .select('id, subcategory, category')
    .ilike('subcategory', '%prod%')
    .limit(5);

  if (!pErr) {
    console.log('\nProduction Finance Records:');
    console.table(prodFinance);
  }
}

main();
