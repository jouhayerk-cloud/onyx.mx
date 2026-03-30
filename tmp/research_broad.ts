import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- Broad Finance Search ---');
  const { data: finance, error } = await supabase
    .from('finance')
    .select('id, description, status, related_ids')
    .ilike('description', '%EM%')
    .limit(20);

  if (!error) {
    console.log('EM Records:');
    console.table(finance);
  }

  const { data: ge, error: gError } = await supabase
    .from('finance')
    .select('id, description, status, related_ids')
    .ilike('description', '%GE%')
    .limit(20);

  if (!gError) {
    console.log('\nGE Records:');
    console.table(ge);
  }
}
main();
