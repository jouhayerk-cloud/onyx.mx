import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- CORRECTING EM/GE LABELS (UUID BATCH UPDATE) ---');

  const emDesc = 'Payment for 17 items from EM';
  const geDesc = 'Payment for 10 items from GE';

  const { data: finRecs, error: fErr } = await supabase
    .from('finance')
    .select('id, description, related_ids')
    .or(`description.ilike.%${emDesc}%,description.ilike.%${geDesc}%`);

  if (fErr) { console.error('Error:', fErr.message); return; }

  const uuidList: string[] = [];

  for (const f of finRecs || []) {
    const rel = f.related_ids;
    if (rel && Array.isArray(rel)) {
      console.log(`- Found ${rel.length} items in "${f.description}"`);
      rel.forEach(id => uuidList.push(String(id)));
    }
  }

  if (uuidList.length === 0) {
    console.log('No item UUIDs found to fix.');
    return;
  }

  console.log(`\nUPDATING ${uuidList.length} items to 'requested'...`);

  // Update logic: set pay_req to 'requested' and clear pay_date
  const { error: updErr, count } = await supabase
    .from('inventory')
    .update({ 
      pay_req: 'requested',
      pay_date: null,
      updated_at: new Date().toISOString()
    }, { count: 'exact' })
    .in('id', uuidList);

  if (updErr) {
    console.error('Update failed:', updErr.message);
  } else {
    console.log(`Successfully updated ${count} records.`);
    
    // Final check for first few items
    const { data: check } = await supabase
        .from('inventory')
        .select('id, pay_req, pay_date')
        .in('id', uuidList.slice(0, 5));
    
    console.log('\nSample Updated Items:');
    console.table(check);
  }
}

main();
