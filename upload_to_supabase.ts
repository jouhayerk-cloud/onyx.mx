import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const PAYLOAD_PATH = path.join(process.cwd(), 'migration_payload.json');

async function uploadData() {
    try {
        const rawData = fs.readFileSync(PAYLOAD_PATH, 'utf8');
        const { google_items, excel_items } = JSON.parse(rawData);

        console.log(`🚀 Starting migration: ${google_items.length} Google items, ${excel_items.length} Excel items...`);

        // Combine all items for a unified upload process
        const allItems = [
            ...google_items.map((it: any) => ({ ...it, source: 'google' })),
            ...excel_items.map((it: any) => ({ ...it, source: 'excel' }))
        ];

        // Chunking to avoid large request errors
        const CHUNK_SIZE = 50;
        for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
            const chunk = allItems.slice(i, i + CHUNK_SIZE);

            const uploadPayload = chunk.map(item => {
                const itemId = item.item_id || 'UNK';
                const itemNum = item.item_number || '0';

                // Use internal_id as the base for deterministic UUID generation
                const hashBase = (item.internal_id || `${itemId}-${itemNum}`).padEnd(32, '0');
                const hex = Buffer.from(hashBase).toString('hex').slice(0, 32);
                const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

                return {
                    id: uuid,
                    item_id: itemId,
                    item_number: parseInt(itemNum) || 0,
                    shape: item.shape || item.metadata?.shape || null,
                    material: item.material || item.metadata?.material || null,
                    description: item.description || null,
                    color: item.color || null,
                    quantity: item.quantity ? parseInt(item.quantity) : 1,
                    price_mxn: item.price_mxn ? parseFloat(item.price_mxn) : 0,
                    weight_kg: item.weight_kg ? parseFloat(item.weight_kg) : 0,
                    media_urls: Array.isArray(item.media_urls) ? item.media_urls.join(',') : (item.media_urls || ''),
                    workbook: item.workbook || '326',
                    status: item.status || 'YES',
                    timestamp: item.timestamp || new Date().toISOString(),
                    length_cm: item.length_cm || (item.metadata?.dimensions?.split('x')[0] ? parseFloat(item.metadata.dimensions.split('x')[0]) : 0),
                    width_cm: item.width_cm || (item.metadata?.dimensions?.split('x')[1] ? parseFloat(item.metadata.dimensions.split('x')[1]) : 0),
                    height_cm: item.height_cm || (item.metadata?.dimensions?.split('x')[2] ? parseFloat(item.metadata.dimensions.split('x')[2]) : 0),
                    created_by: 'system_migration'
                };
            });

            console.log(`📤 Uploading chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} items)...`);
            const { data, error, status, statusText } = await supabase.from('inventory').upsert(uploadPayload, { onConflict: 'id' });

            if (error) {
                console.error(`❌ Error in chunk starting at ${i}:`);
                console.error(`   Status: ${status} (${statusText})`);
                console.error(`   Message: ${error.message}`);
                console.error(`   Details: ${error.details}`);
                console.error(`   Hint: ${error.hint}`);
                if (uploadPayload[0]) {
                    console.error(`   Sample ID: ${uploadPayload[0].id}`);
                }
            } else {
                console.log(`   ✅ Chunk processed (Status ${status})`);
            }
        }

        console.log('✅ Migration complete!');
    } catch (err: any) {
        console.error('💥 Critical error:', err.message);
    }
}

uploadData();
