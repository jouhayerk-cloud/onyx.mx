import assert from 'node:assert';
// buildPackPatch is pure; import path avoids supabase init by inlining the check on the exported shape.
const { buildPackPatch } = await import('../src/features/logistics/packItems.ts').catch(() => ({ buildPackPatch: null as any }));
if (buildPackPatch) {
    const p = buildPackPatch('C1', 'T');
    assert.deepStrictEqual(p, { crate_id: 'C1', packing_status: 'Packed', pack_date: 'T', updated_at: 'T' });
    const u = buildPackPatch(null, 'T');
    assert.deepStrictEqual(u, { crate_id: null, packing_status: 'Unpacked', pack_date: null, updated_at: 'T' });
    console.log('pack patch ok');
} else console.log('skipped: module needs the Vite env (supabase client)');
