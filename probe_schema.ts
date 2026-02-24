import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

// Test each column one by one with a minimal upsert
const COLS = [
    'workbook', 'acquired_by', 'status', 'acquired_at',
    'item_number', 'timestamp', 'description', 'color', 'shape',
    'item_id', 'quantity', 'weight_kg', 'height_cm', 'width_cm',
    'length_cm', 'price_mxn', 'material'
];

async function probe() {
    const id = crypto.randomUUID();
    // Try inserting a minimal row with all target columns
    const row: any = {
        id,
        workbook: '825', acquired_by: 'EM', status: 'available', acquired_at: '2026-02-24',
        item_number: 9999, description: 'PROBE', color: 'White', shape: 'Sphere',
        item_id: 'PROBE-001', quantity: 1, weight_kg: 10,
        height_cm: 50, width_cm: 30, length_cm: 20, price_mxn: 100,
    };

    const { error } = await sb.from('inventory').upsert([row], { onConflict: 'id' });
    if (error) {
        console.log('INSERT FAILED:', error.message, '|', error.details, '|', error.hint);
        // Try bare minimum
        const { error: e2 } = await sb.from('inventory').upsert([{ id, workbook: '825' }], { onConflict: 'id' });
        if (e2) console.log('BARE MINIMUM ALSO FAILED:', e2.message);
        else console.log('Bare minimum (id+workbook only) succeeded');
    } else {
        console.log('SUCCESS — all core columns exist');
        // Cleanup
        await sb.from('inventory').delete().eq('id', id);
        console.log('Probe row deleted.');
    }
}

probe().catch(e => console.error('Fatal:', e.message));
