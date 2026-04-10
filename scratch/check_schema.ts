
import { supabase } from '../src/lib/supabase';

async function check() {
    try {
        const { data, error } = await supabase.from('inventory').select('*').limit(1);
        if (error) throw error;
        if (data && data[0]) {
            console.log('--- INVENTORY COLUMNS ---');
            console.log(Object.keys(data[0]).join(', '));
            console.log('--- SAMPLE STATUSES ---');
            const { data: statuses } = await supabase.from('inventory').select('status').limit(10);
            console.log(statuses?.map(s => s.status));
        }
    } catch (e) {
        console.error('Check failed:', e);
    }
}
check();
