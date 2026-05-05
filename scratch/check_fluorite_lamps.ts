
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function countLamps() {
    console.log("Counting 'Fluorite Lamps'...");
    const { data, error } = await supabase
        .from('inventory')
        .select('status, quantity, material, description, short_description');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const matches = data.filter(item => {
        const m = (item.material || '').toLowerCase();
        const d = (item.description || '').toLowerCase();
        const sd = (item.short_description || '').toLowerCase();
        const isFluorite = m.includes('fluorite') || d.includes('fluorite') || sd.includes('fluorite');
        const isLamp = d.includes('lamp') || sd.includes('lamp');
        return isFluorite && isLamp;
    });

    const stats: Record<string, number> = {};
    matches.forEach(item => {
        const s = item.status || 'Unknown';
        const q = item.quantity || 0;
        stats[s] = (stats[s] || 0) + q;
    });

    console.log("Fluorite LAMP Matches by Status:");
    Object.entries(stats).forEach(([status, qty]) => {
        console.log(`- ${status}: ${qty}`);
    });
    console.log(`Total LAMP Matches: ${matches.length}`);
    console.log(`Total LAMP Quantity: ${Object.values(stats).reduce((a,b)=>a+b,0)}`);
}

countLamps();
