/**
 * test_sync.ts — Simulate the exact pullReplication fetch and RxDB upsert flow
 * to diagnose why items aren't loading in the app.
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

async function fetchPaginated(table: string, filterField?: string, filterVal?: any) {
    let page = 0;
    const pageSize = 500;
    const allData: any[] = [];
    while (true) {
        let query = supabase.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        if (filterField && filterVal !== undefined) query = query.eq(filterField, filterVal);
        const { data, error } = await query;
        if (error) { console.error(`❌ fetch error [${table}]:`, error.message); break; }
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    return allData;
}

async function main() {
    console.log('\n🔍 Simulating pullReplication fetch...\n');

    // Phase 1 — workbook 326 (active)
    const active = await fetchPaginated('inventory', 'workbook', '326');
    console.log(`Phase 1 (workbook=326): ${active.length} records`);

    // Phase 2 — workbook 825 (archive)
    const archive = await fetchPaginated('inventory', 'workbook', '825');
    console.log(`Phase 2 (workbook=825): ${archive.length} records`);

    if (archive.length > 0) {
        const sample = archive[0];
        console.log('\n📦 Sample record fields:', Object.keys(sample));
        console.log('Sample values:', {
            id: sample.id,
            id_type: typeof sample.id,
            workbook: sample.workbook,
            item_id: sample.item_id,
            description: sample.description?.slice(0, 30),
            spatial_boxes_2d: sample.spatial_boxes_2d,
        });
    }

    // Check for any null id rows (would fail RxDB primary key)
    const nullIds = [...active, ...archive].filter(d => !d.id);
    if (nullIds.length > 0) console.log(`\n⚠️  ${nullIds.length} rows have null IDs — will fail RxDB!`);
    else console.log(`\n✅ All ${active.length + archive.length} records have valid IDs`);

    // Check for id length (RxDB maxLength: 100)
    const longIds = [...active, ...archive].filter(d => d.id && String(d.id).length > 100);
    if (longIds.length > 0) console.log(`⚠️  ${longIds.length} rows have IDs > 100 chars`);
    else console.log('✅ All IDs are within 100 char limit');
}

main().catch(e => console.error('🔥', e.message));
