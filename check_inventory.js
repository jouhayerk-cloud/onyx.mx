
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE_URL or ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkInventory() {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, item_id, book_barcode, item_number, workbook')
    .limit(10);

  if (error) {
    console.error("Error fetching inventory:", error);
  } else {
    console.log("Sample Inventory Items:");
    data.forEach(item => {
      console.log(`ID: ${item.id} | ItemID: ${item.item_id} | Barcode: ${item.book_barcode} | Num: ${item.item_number} | WB: ${item.workbook}`);
    });
  }
}

checkInventory();
