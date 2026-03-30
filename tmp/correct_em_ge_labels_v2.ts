import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- CORRECTING EM/GE LABELS (V2 - Barcode Aware) ---');

  const emDesc = 'Payment for 17 items from EM';
  const geDesc = 'Payment for 10 items from GE';

  const { data: finRecs, error: fErr } = await supabase
    .from('finance')
    .select('id, description, related_ids')
    .or(`description.ilike.%${emDesc}%,description.ilike.%${geDesc}%`);

  if (fErr) { console.error('Error:', fErr.message); return; }

  const numericIds = new Set<number>();
  const barcodeIds = new Set<string>();

  for (const f of finRecs || []) {
    const rel = f.related_ids;
    if (rel && Array.isArray(rel)) {
      rel.forEach(id => {
        const n = Number(id);
        if (!isNaN(n)) numericIds.add(n);
        else barcodeIds.add(String(id).trim());
      });
    }
  }

  // Find numeric IDs for all barcodes
  if (barcodeIds.size > 0) {
    console.log(`Searching for numeric IDs for ${barcodeIds.size} barcodes...`);
    const { data: barcodeItems } = await supabase
      .from('inventory')
      .select('id, book_barcode')
      .in('book_barcode', Array.from(barcodeIds));
    
    if (barcodeItems) {
      barcodeItems.forEach(i => numericIds.add(i.id));
    }
  }

  // Broad Sweep: Also fix anything from EM/GE that is mistakenly Paid
  const { data: vendorItems } = await supabase
    .from('inventory')
    .select('id, vendor_name, pay_req')
    .or('vendor_name.eq.EM,vendor_name.eq.GE');
  
  if (vendorItems) {
    vendorItems.forEach(i => {
        // If it's currently paid ('true' or 'paid'), add it to fix list
        if (i.pay_req === 'true' || i.pay_req === 'paid' || i.pay_req === true) {
            numericIds.add(i.id);
        }
    });
  }

  const finalFixList = Array.from(numericIds);
  if (finalFixList.length === 0) {
    console.log('No items found to fix.');
    return;
  }

  console.log(`UPDATING ${finalFixList.length} items to 'requested'...`);

  const { error: updErr } = await supabase
    .from('inventory')
    .update({ 
      pay_req: 'requested',
      pay_date: null,
      updated_at: new Date().toISOString()
    })
    .in('id', finalFixList);

  if (updErr) {
    console.error('Update failed:', updErr.message);
  } else {
    console.log('Successfully corrected EM/GE labels.');
  }
}

main();
