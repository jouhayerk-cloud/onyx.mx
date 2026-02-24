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
                // Map common fields to Supabase schema
                return {
                    item_id: item.item_id,
                    item_number: item.item_number ? parseInt(item.item_number) : null,
                    shape: item.shape || item.metadata?.shape,
                    material: item.material || item.metadata?.material,
                    description: item.description,
                    color: item.color,
                    quantity: item.quantity ? parseInt(item.quantity) : 1,
                    price_mxn: item.price_mxn ? parseFloat(item.price_mxn) : 0,
                    weight_kg: item.weight_kg ? parseFloat(item.weight_kg) : 0,
                    height_cm: item.height_cm ? parseFloat(item.height_cm) : 0,
                    width_cm: item.width_cm ? parseFloat(item.width_cm) : 0,
                    length_cm: item.length_cm ? parseFloat(item.length_cm) : 0,
                    media_urls: item.media_urls || [],
                    workbook: item.workbook,
                    status: item.status || 'YES',
                    timestamp: item.timestamp,
                    // Handle structured metadata for dimensions if needed
                    length_cm: item.length_cm || (item.metadata?.dimensions?.split('x')[0] ? parseFloat(item.metadata.dimensions.split('x')[0]) : 0),
                    width_cm: item.width_cm || (item.metadata?.dimensions?.split('x')[1] ? parseFloat(item.metadata.dimensions.split('x')[1]) : 0),
                    height_cm: item.height_cm || (item.metadata?.dimensions?.split('x')[2] ? parseFloat(item.metadata.dimensions.split('x')[2]) : 0),
                };
            });

            console.log(`📤 Uploading chunk ${Math.floor(i / CHUNK_SIZE) + 1}...`);
            const { error } = await supabase.from('inventory').upsert(uploadPayload, { onConflict: 'item_id,item_number' });

            if (error) {
                console.error(`❌ Error in chunk ${i}:`, error.message);
            }
        }

        console.log('✅ Migration complete!');
    } catch (err: any) {
        console.error('💥 Critical error:', err.message);
    }
}

uploadData();
