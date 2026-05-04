import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

// Run each ALTER TABLE statement via Supabase RPC
const columns = [
    { name: 'marked_by', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS marked_by TEXT;` },
    { name: 'generated_description', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS generated_description TEXT;` },
    { name: 'generated_image_urls', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS generated_image_urls TEXT;` },
    { name: 'spatial_boxes_3d', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS spatial_boxes_3d JSONB;` },
    { name: 'invoice_id', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS invoice_id TEXT;` },
    { name: 'print_date', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS print_date TEXT;` },
    { name: 'sent_notes', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sent_notes TEXT;` },
    { name: 'sent_pack', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sent_pack TEXT;` },
    { name: 'sent_date', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sent_date TEXT;` },
    { name: 'book_landed', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS book_landed NUMERIC;` },
    { name: 'book_retail', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS book_retail NUMERIC;` },
    { name: 'book_barcode', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS book_barcode TEXT;` },
    { name: 'book_aq_code', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS book_aq_code TEXT;` },
    { name: 'book_land_code', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS book_land_code TEXT;` },
    { name: 'vendor_id', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS vendor_id TEXT;` },
    { name: 'is_hidden', sql: `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;` },
];

async function migrate() {
    console.log('🚀 Running Supabase schema migration...\n');
    for (const col of columns) {
        const { error } = await supabase.rpc('exec_sql', { query: col.sql });
        if (error) {
            // exec_sql RPC might not exist — try via REST (we'll catch and report)
            console.log(`⚠️  RPC unavailable for ${col.name}: ${error.message}`);
        } else {
            console.log(`✅ Added: ${col.name}`);
        }
    }
    console.log('\n📋 If columns were not added automatically, run migrate_schema.sql in your Supabase SQL Editor.');
    console.log('   Dashboard > SQL Editor > New Query > paste migrate_schema.sql > Run');
}

migrate();
