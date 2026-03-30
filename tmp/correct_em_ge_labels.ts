import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- CORRECTING EM/GE LABELS ---');

  // 1. Find the specific finance records
  const emDesc = 'Payment for 17 items from EM';
  const geDesc = 'Payment for 10 items from GE';

  const { data: finRecs, error: fErr } = await supabase
    .from('finance')
    .select('id, description, related_ids, related_inventory_ids')
    .or(`description.ilike.%${emDesc}%,description.ilike.%${geDesc}%`);

  if (fErr) {
    console.error('Error finding finance records:', fErr.message);
    return;
  }

  console.log(`Found ${finRecs?.length || 0} matching finance records.`);

  const allItemIdsToFix = new Set<number>();

  for (const f of finRecs || []) {
    console.log(`\nProcessing: "${f.description}" (ID: ${f.id})`);
    const rel = f.related_ids || (f.related_inventory_ids ? f.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
    if (rel && rel.length > 0) {
      console.log(`- Linked Item IDs: ${rel.length}`);
      rel.forEach((id: any) => {
        const numId = Number(id);
        if (!isNaN(numId)) allItemIdsToFix.add(numId);
      });
    }
  }

  // 2. Also find any other items from EM/GE that are 'Paid' (true) or 'paid'
  const { data: vendorItems, error: vErr } = await supabase
    .from('inventory')
    .select('id, vendor_name, pay_req')
    .or('vendor_name.eq.EM,vendor_name.eq.GE')
    .or('pay_req.eq.true,pay_req.eq.paid');

  if (!vErr && vendorItems) {
    console.log(`Found ${vendorItems.length} additional items from EM/GE currently marked as Paid.`);
    vendorItems.forEach(i => allItemIdsToFix.add(i.id));
  }

  const fixingList = Array.from(allItemIdsToFix);
  if (fixingList.length === 0) {
    console.log('No item IDs found to fix.');
    return;
  }

  console.log(`\nUPDATING ${fixingList.length} items to 'requested'...`);

  const { error: updErr } = await supabase
    .from('inventory')
    .update({ 
      pay_req: 'requested',
      pay_date: null,
      updated_at: new Date().toISOString()
    })
    .in('id', fixingList);

  if (updErr) {
    console.error('Update failed:', updErr.message);
  } else {
    console.log('Update Successful.');
    
    // Final check
    const { data: finalInfo } = await supabase
      .from('inventory')
      .select('id, pay_req, pay_date')
      .in('id', fixingList);
    
    console.log('\nVerification of Updated Items:');
    if (finalInfo) console.table(finalInfo.slice(0, 10)); // Show sample
  }
}

main();
