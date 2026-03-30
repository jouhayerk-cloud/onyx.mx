import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Database Audit ---');
  
  // 1. List some items to see what vendor names look like
  const { data: inv } = await supabase.from('inventory').select('vendor_name').limit(20);
  console.log('Sample Vendor Names in Inventory:');
  console.log(inv?.map(i => i.vendor_name));

  // 2. List recent Finance records to see descriptions
  const { data: fin } = await supabase.from('finance').select('id, description, status').order('created_at', { ascending: false }).limit(20);
  console.log('\nRecent Finance Records:');
  console.table(fin);
}
main();
