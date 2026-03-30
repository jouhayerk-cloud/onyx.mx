import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Table Column Inspection ---');
  
  // 1. Inspect Inventory keys
  const { data: inv, error: iErr } = await supabase.from('inventory').select('*').limit(1);
  if (inv && inv[0]) {
    console.log('Inventory Keys:', Object.keys(inv[0]));
  } else if (iErr) {
    console.error('Inventory Error:', iErr.message);
  }

  // 2. Inspect Finance keys
  const { data: fin, error: fErr } = await supabase.from('finance').select('*').limit(1);
  if (fin && fin[0]) {
    console.log('\nFinance Keys:', Object.keys(fin[0]));
    console.log('Sample Finance Data:', fin[0]);
  } else if (fErr) {
    console.error('Finance Error:', fErr.message);
  }
}
main();
