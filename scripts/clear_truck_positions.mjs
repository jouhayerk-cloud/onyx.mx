// One-time cleanup: clear truck_id and truck_position from all Packed/Partial crates
// Run: node scripts/clear_truck_positions.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearTruckPositions() {
    console.log('🔍 Fetching logistics records with truck_id or truck_position set...');

    // Fetch all crates that have truck data set
    const { data: dirty, error: fetchErr } = await supabase
        .from('logistics')
        .select('id, status, truck_id, truck_position')
        .or('truck_id.not.is.null,truck_position.not.is.null');

    if (fetchErr) {
        console.error('❌ Fetch error:', fetchErr.message);
        process.exit(1);
    }

    if (!dirty || dirty.length === 0) {
        console.log('✅ No crates have truck_id or truck_position set. Nothing to clean.');
        return;
    }

    console.log(`📦 Found ${dirty.length} crate(s) with truck data:`);
    dirty.forEach(c => {
        console.log(`  • ${c.id}  status="${c.status}"  truck_id="${c.truck_id}"  truck_position=${c.truck_position ? 'set' : 'null'}`);
    });

    // Only clear Packed and Partial crates — never touch In Transit / Deployed
    const toClear = dirty.filter(c => {
        const s = (c.status || '').toLowerCase().trim();
        return ['packed', 'partial'].includes(s);
    });

    const toSkip = dirty.filter(c => {
        const s = (c.status || '').toLowerCase().trim();
        return !['packed', 'partial'].includes(s);
    });

    if (toSkip.length > 0) {
        console.log(`\n⚠️  Skipping ${toSkip.length} crate(s) with status In Transit / Deployed (those are correct):`);
        toSkip.forEach(c => console.log(`  ↳ ${c.id}  status="${c.status}"`));
    }

    if (toClear.length === 0) {
        console.log('\n✅ No Packed/Partial crates need clearing.');
        return;
    }

    console.log(`\n🧹 Clearing truck_id and truck_position from ${toClear.length} Packed/Partial crate(s)...`);

    const ids = toClear.map(c => c.id);
    const { error: updateErr, count } = await supabase
        .from('logistics')
        .update({ truck_id: null, truck_position: null })
        .in('id', ids);

    if (updateErr) {
        console.error('❌ Update error:', updateErr.message);
        process.exit(1);
    }

    console.log(`\n✅ Done! Cleared ${toClear.length} crate(s):`);
    toClear.forEach(c => console.log(`  ✓ ${c.id}  (${c.status})`));
    console.log('\n🚛 All Packed crates will now appear in the Dock correctly.');
}

clearTruckPositions().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
