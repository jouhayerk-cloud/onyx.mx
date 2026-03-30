import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- FINAL SCHEMA INSPECTION ---');
  
  // 1. Get first row and trace ALL properties
  const { data: inv } = await supabase.from('inventory').select('*').limit(1);
  if (inv && inv[0]) {
    console.log('Sample Row Keys:', Object.keys(inv[0]));
    console.log('Sample Row Data:', inv[0]);
  }

  // 2. Count by pay_req
  const { data: counts } = await supabase.from('inventory').select('pay_req').limit(10);
  console.log('\nSample pay_req values:', counts?.map(c => c.pay_req));
}
main();
