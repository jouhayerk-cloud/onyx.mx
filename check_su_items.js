const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yircifkayqpuydfdqzlm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSU() {
  console.log('--- Querying items for vendor SU ---');
  
  // Try both vendor_id and item_id prefix
  const { data, error } = await supabase
    .from('inventory')
    .select('id, item_id, vendor_id, status, pay_req, price_mxn, created_at')
    .or('vendor_id.eq.SU,item_id.ilike.SU-%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data.length === 0) {
    console.log('No recent items found for SU.');
  } else {
    console.table(data);
  }
  
  console.log('--- Checking for any items with status "Acquisition" or "Production" ---');
  const { data: recent, error: err2 } = await supabase
    .from('inventory')
    .select('id, item_id, vendor_id, status, pay_req, price_mxn')
    .in('status', ['Acquisition', 'Production'])
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (recent) console.table(recent);
}

checkSU();
