const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching shipment:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No shipments found.');
        return;
    }

    const s = data[0];
    console.log('--- SHIPMENT ---');
    console.log('ID:', s.manifest_id);
    
    let payload = s.payload;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    
    console.log('Payload Summary:');
    console.log('Crates Count:', payload.crates?.length);
    if (payload.crates && payload.crates.length > 0) {
        const c = payload.crates[0];
        console.log('First Crate Sample:');
        console.log('  Label:', c.label);
        console.log('  Subtitle:', c.subtitle);
        console.log('  Color:', c.color);
        console.log('  VendorList:', c.vendorList);
        console.log('  Items Count:', c.items?.length);
        if (c.items && c.items.length > 0) {
            console.log('  First Item Sample:', JSON.stringify(c.items[0], null, 2));
        }
    }
}

inspect();
