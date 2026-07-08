import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

const supabaseUrl = 'https://yircifkayqpuydfdqzlm.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: docs, error } = await supabase
    .from('logistics')
    .select('*');

  if (error) {
    console.error('Error fetching logistics:', error);
    return;
  }

  const live = docs.filter(d => {
      const s = (d.status || '').toLowerCase().trim();
      return ['packed', 'partial', 'in transit', 'deployed'].includes(s);
  });

  const map: Record<string, any> = {};
  docs.forEach(d => {
      if (d.description?.includes('POS:')) {
          const m = d.description.match(/POS:(\d+),(\d+),(\d+)(?:,Z(\d+))?/);
          if (m) map[d.id] = { x: +m[1], y: +m[2], r: +m[3], z: m[4] ? +m[4] : 0 };
      }
  });

  const positions = map;
  const allCrates = live;

  const dockCrates = allCrates.filter(c => 
      !positions[c.id] && !c.parent_id && ['packed', 'partial'].includes((c.status || '').toLowerCase().trim())
  );

  console.log(`docs: ${docs.length}`);
  console.log(`live: ${live.length}`);
  console.log(`dockCrates: ${dockCrates.length}`);

  const packedDocs = docs.filter(c => ['packed', 'partial'].includes((c.status || '').toLowerCase().trim()));
  console.log(`Total Packed/Partial in DB: ${packedDocs.length}`);

  const missing = packedDocs.filter(c => !dockCrates.some(dc => dc.id === c.id));
  console.log(`Missing from dockCrates: ${missing.length}`);
  missing.forEach(m => {
    console.log(`Missing ID: ${m.id}, status: ${m.status}, parent_id: ${m.parent_id}, hasPos: ${!!positions[m.id]}, desc: ${m.description}, type: ${m.type}`);
  });
}

main();
