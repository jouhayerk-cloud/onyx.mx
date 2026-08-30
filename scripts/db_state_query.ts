/**
 * Onyx.mx Database State Query — READ-ONLY
 * ⚠️ LIVE PRODUCTION DATABASE — Only SELECT queries
 * 
 * Queries live Supabase to generate aggregate statistics
 * across all core tables: inventory, finance, logistics, production, settings, app_users
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Known vendors from consts.tsx
const KNOWN_VENDORS: Record<string, string> = {
  JM: 'JOSE MEZA', EM: 'EMMANUEL DE LOS SANTOS', CA: 'CARLOS ARENAS',
  AN: 'ANGEL CABRERA', SU: 'SUSANA', TE: 'TELLEZ TALLER',
  DH: 'DELFINO HERNANDEZ', ML: 'MARIA LUISA', GE: 'GERARDO DE GANTE',
  FR: 'FOUNTAIN ROCK', ET: 'EDUARDO TELLEZ', AM: 'ALEJANDRO MEZA',
  BT: 'BERNARDO', RF: 'ROBERTO FLORITA', GS: 'GIFT STORE',
  CP: 'CANTERA PUEBLA', GM: 'GEMA MARTIN', MM: 'MARGARITA MEZA',
  IH: 'ISMAEL HUERTA', ON: 'ONYX', SIMONA: 'SIMONA', JUAN: 'JUAN',
  R: 'RAMSES', M: 'MARTHA', W: 'WAYNE', C: 'CHAD',
};

interface Report {
  timestamp: string;
  tables: Record<string, any>;
  inventory: any;
  finance: any;
  logistics: any;
  production: any;
  settings: any;
  users: any;
  integrity: any;
}

async function fetchAll(table: string) {
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function countBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item) || '(empty)';
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function stats(values: number[]) {
  if (!values.length) return { count: 0, min: 0, max: 0, avg: 0, median: 0, sum: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 100) / 100,
    median: sorted[Math.floor(sorted.length / 2)],
    sum: Math.round(sum * 100) / 100,
  };
}

async function main() {
  console.log('=== Onyx.mx Database State Query (READ-ONLY) ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // ─── Fetch all tables ───
  console.log('📥 Fetching inventory...');
  const inventory = await fetchAll('inventory');
  console.log('📥 Fetching finance...');
  const finance = await fetchAll('finance');
  console.log('📥 Fetching logistics...');
  const logistics = await fetchAll('logistics');
  console.log('📥 Fetching production...');
  const production = await fetchAll('production');
  console.log('📥 Fetching settings...');
  const settings = await fetchAll('settings');
  console.log('📥 Fetching app_users...');
  const users = await fetchAll('app_users');

  // ─── TABLE OVERVIEW ───
  console.log('\n' + '═'.repeat(60));
  console.log('TABLE OVERVIEW');
  console.log('═'.repeat(60));
  console.log(`  inventory:  ${inventory.length} records`);
  console.log(`  finance:    ${finance.length} records`);
  console.log(`  logistics:  ${logistics.length} records`);
  console.log(`  production: ${production.length} records`);
  console.log(`  settings:   ${settings.length} records`);
  console.log(`  app_users:  ${users.length} records`);
  console.log(`  TOTAL:      ${inventory.length + finance.length + logistics.length + production.length + settings.length + users.length} records`);

  // ─── INVENTORY ANALYSIS ───
  console.log('\n' + '═'.repeat(60));
  console.log('INVENTORY ANALYSIS');
  console.log('═'.repeat(60));

  // By Workbook
  console.log('\n📚 By Workbook:');
  const byWorkbook = countBy(inventory, (i: any) => i.workbook);
  for (const [k, v] of Object.entries(byWorkbook)) console.log(`  ${k}: ${v}`);

  // By Vendor
  console.log('\n🏭 By Vendor:');
  const byVendor = countBy(inventory, (i: any) => i.vendor_id || i.vendorId);
  for (const [k, v] of Object.entries(byVendor)) {
    const name = KNOWN_VENDORS[k] || '(unknown)';
    const known = KNOWN_VENDORS[k] ? '✓' : '⚠';
    console.log(`  ${known} ${k.padEnd(8)} ${String(v).padStart(4)} items  ${name}`);
  }

  // By Shape
  console.log('\n🔷 By Shape:');
  const byShape = countBy(inventory, (i: any) => i.shape);
  for (const [k, v] of Object.entries(byShape)) console.log(`  ${k}: ${v}`);

  // By Material
  console.log('\n🪨 By Material:');
  const byMaterial = countBy(inventory, (i: any) => i.material);
  for (const [k, v] of Object.entries(byMaterial)) console.log(`  ${k}: ${v}`);

  // By Color (raw)
  console.log('\n🎨 By Color (raw, top 20):');
  const byColor = countBy(inventory, (i: any) => i.color);
  Object.entries(byColor).slice(0, 20).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // By Generated Color (AI)
  console.log('\n🤖 By AI Color (generatedColor):');
  const byGenColor = countBy(inventory, (i: any) => i.generated_color || i.generatedColor);
  for (const [k, v] of Object.entries(byGenColor)) console.log(`  ${k}: ${v}`);

  // By Generated Type (Shopify taxonomy)
  console.log('\n🏷️ By AI Type (generatedType):');
  const byGenType = countBy(inventory, (i: any) => i.generated_type || i.generatedType);
  for (const [k, v] of Object.entries(byGenType)) console.log(`  ${k}: ${v}`);

  // AI Field Coverage
  console.log('\n📊 AI Field Coverage:');
  const aiFields = [
    { name: 'short_description', key: (i: any) => i.short_description || i.shortDescription },
    { name: 'generated_description', key: (i: any) => i.generated_description || i.generatedDescription },
    { name: 'detailed_description', key: (i: any) => i.detailed_description || i.detailedDescription },
    { name: 'generated_color', key: (i: any) => i.generated_color || i.generatedColor },
    { name: 'generated_type', key: (i: any) => i.generated_type || i.generatedType },
  ];
  for (const f of aiFields) {
    const filled = inventory.filter((i: any) => f.key(i) && String(f.key(i)).trim().length > 0).length;
    const pct = inventory.length ? Math.round((filled / inventory.length) * 100) : 0;
    console.log(`  ${f.name.padEnd(25)} ${String(filled).padStart(4)} / ${inventory.length}  (${pct}%)`);
  }

  // Pricing Statistics
  console.log('\n💰 Pricing Statistics (MXN):');
  const prices = inventory.map((i: any) => i.price_mxn || i.price).filter((p: any) => typeof p === 'number' && p > 0);
  const priceStats = stats(prices);
  console.log(`  Count: ${priceStats.count}  Min: $${priceStats.min}  Max: $${priceStats.max}  Avg: $${priceStats.avg}  Sum: $${priceStats.sum}`);

  console.log('\n💵 Landed Cost (USD):');
  const landed = inventory.map((i: any) => i.book_landed || i.bookLanded).filter((p: any) => typeof p === 'number' && p > 0);
  const landedStats = stats(landed);
  console.log(`  Count: ${landedStats.count}  Min: $${landedStats.min}  Max: $${landedStats.max}  Avg: $${landedStats.avg}  Sum: $${landedStats.sum}`);

  console.log('\n🏪 Retail Price (USD):');
  const retail = inventory.map((i: any) => i.book_retail || i.bookRetail).filter((p: any) => typeof p === 'number' && p > 0);
  const retailStats = stats(retail);
  console.log(`  Count: ${retailStats.count}  Min: $${retailStats.min}  Max: $${retailStats.max}  Avg: $${retailStats.avg}  Sum: $${retailStats.sum}`);

  // Dimension Statistics
  console.log('\n📏 Dimension Statistics:');
  const heights = inventory.map((i: any) => i.height_cm || i.heightCm).filter((v: any) => typeof v === 'number' && v > 0);
  const widths = inventory.map((i: any) => i.width_cm || i.widthCm).filter((v: any) => typeof v === 'number' && v > 0);
  const lengths = inventory.map((i: any) => i.length_cm || i.lengthCm).filter((v: any) => typeof v === 'number' && v > 0);
  const weights = inventory.map((i: any) => i.weight_kg || i.weightKg).filter((v: any) => typeof v === 'number' && v > 0);
  console.log(`  Heights: ${stats(heights).count} items, range ${stats(heights).min}-${stats(heights).max} cm, avg ${stats(heights).avg} cm`);
  console.log(`  Widths:  ${stats(widths).count} items, range ${stats(widths).min}-${stats(widths).max} cm, avg ${stats(widths).avg} cm`);
  console.log(`  Lengths: ${stats(lengths).count} items, range ${stats(lengths).min}-${stats(lengths).max} cm, avg ${stats(lengths).avg} cm`);
  console.log(`  Weights: ${stats(weights).count} items, range ${stats(weights).min}-${stats(weights).max} kg, avg ${stats(weights).avg} kg`);

  // Media Coverage
  console.log('\n🖼️ Media Coverage:');
  const withMedia = inventory.filter((i: any) => {
    const urls = i.media_urls || i.mediaUrls;
    return urls && (Array.isArray(urls) ? urls.length > 0 : true);
  }).length;
  const withImages = inventory.filter((i: any) => {
    const urls = i.image_urls || i.imageUrls;
    return urls && (Array.isArray(urls) ? urls.length > 0 : true);
  }).length;
  console.log(`  media_urls:  ${withMedia} / ${inventory.length} (${inventory.length ? Math.round(withMedia/inventory.length*100) : 0}%)`);
  console.log(`  image_urls:  ${withImages} / ${inventory.length} (${inventory.length ? Math.round(withImages/inventory.length*100) : 0}%)`);

  // Crate Assignment
  console.log('\n📦 Crate Assignment:');
  const withCrate = inventory.filter((i: any) => i.crate_id || i.crateId).length;
  console.log(`  Assigned to crate: ${withCrate} / ${inventory.length} (${inventory.length ? Math.round(withCrate/inventory.length*100) : 0}%)`);

  // ─── FINANCE ANALYSIS ───
  console.log('\n' + '═'.repeat(60));
  console.log('FINANCE ANALYSIS');
  console.log('═'.repeat(60));
  if (finance.length > 0) {
    console.log('\n💳 By Type:');
    const byType = countBy(finance, (f: any) => f.type);
    for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);

    console.log('\n📂 By Category:');
    const byCat = countBy(finance, (f: any) => f.category);
    for (const [k, v] of Object.entries(byCat)) console.log(`  ${k}: ${v}`);

    console.log('\n🏦 By Bank Account:');
    const byBank = countBy(finance, (f: any) => f.bank_account);
    for (const [k, v] of Object.entries(byBank)) console.log(`  ${k}: ${v}`);

    console.log('\n💰 Payment Amounts:');
    const amounts = finance.map((f: any) => f.amount).filter((a: any) => typeof a === 'number');
    const amountStats = stats(amounts);
    console.log(`  Count: ${amountStats.count}  Sum: $${amountStats.sum}  Avg: $${amountStats.avg}  Range: $${amountStats.min}-$${amountStats.max}`);
  } else {
    console.log('  (no finance records)');
  }

  // ─── LOGISTICS ANALYSIS ───
  console.log('\n' + '═'.repeat(60));
  console.log('LOGISTICS ANALYSIS');
  console.log('═'.repeat(60));
  if (logistics.length > 0) {
    console.log('\n📦 By Type:');
    const byLogType = countBy(logistics, (l: any) => l.type);
    for (const [k, v] of Object.entries(byLogType)) console.log(`  ${k}: ${v}`);

    console.log('\n🛃 By Customs Status:');
    const byCust = countBy(logistics, (l: any) => l.customs_status);
    for (const [k, v] of Object.entries(byCust)) console.log(`  ${k}: ${v}`);

    const totalItems = logistics.reduce((sum: number, l: any) => {
      const ids = l.inventory_ids;
      return sum + (Array.isArray(ids) ? ids.length : 0);
    }, 0);
    console.log(`\n  Total items in containers: ${totalItems}`);
  } else {
    console.log('  (no logistics records)');
  }

  // ─── PRODUCTION ANALYSIS ───
  console.log('\n' + '═'.repeat(60));
  console.log('PRODUCTION ANALYSIS');
  console.log('═'.repeat(60));
  if (production.length > 0) {
    console.log('\n🏭 By Vendor:');
    const byProdVendor = countBy(production, (p: any) => p.vendor_id);
    for (const [k, v] of Object.entries(byProdVendor)) console.log(`  ${k}: ${v}`);

    console.log('\n📊 By Stage:');
    const byStage = countBy(production, (p: any) => p.stage);
    for (const [k, v] of Object.entries(byStage)) console.log(`  ${k}: ${v}`);
  } else {
    console.log('  (no production records)');
  }

  // ─── SETTINGS ───
  console.log('\n' + '═'.repeat(60));
  console.log('SETTINGS');
  console.log('═'.repeat(60));
  for (const s of settings) {
    const val = typeof s.value === 'object' ? JSON.stringify(s.value) : s.value;
    console.log(`  ${s.key}: ${val}`);
  }

  // ─── USERS ───
  console.log('\n' + '═'.repeat(60));
  console.log('APP USERS');
  console.log('═'.repeat(60));
  for (const u of users) {
    console.log(`  ${(u.email || '(no email)').padEnd(30)} role: ${(u.role || '(none)').padEnd(18)} active: ${u.active ?? 'N/A'}`);
  }

  // ─── INTEGRITY CHECKS ───
  console.log('\n' + '═'.repeat(60));
  console.log('INTEGRITY CHECKS');
  console.log('═'.repeat(60));

  // Check unknown vendors
  const unknownVendors = new Set<string>();
  for (const item of inventory) {
    const vid = item.vendor_id || item.vendorId;
    if (vid && !KNOWN_VENDORS[vid]) unknownVendors.add(vid);
  }
  console.log(`\n  Unknown vendor IDs: ${unknownVendors.size > 0 ? [...unknownVendors].join(', ') : '✅ None'}`);

  // Check items missing prices
  const missingPrice = inventory.filter((i: any) => !i.price_mxn && !i.price).length;
  console.log(`  Items missing price: ${missingPrice} ${missingPrice === 0 ? '✅' : '⚠️'}`);

  // Check items missing dimensions
  const missingDims = inventory.filter((i: any) => !i.height_cm && !i.heightCm && !i.width_cm && !i.widthCm).length;
  console.log(`  Items missing dimensions: ${missingDims} ${missingDims === 0 ? '✅' : '⚠️'}`);

  // Check pricing consistency (spot-check)
  let pricingMismatch = 0;
  const exchRate = settings.find((s: any) => s.key === 'exchange_rate');
  if (exchRate) {
    const rate = typeof exchRate.value === 'number' ? exchRate.value : parseFloat(exchRate.value);
    console.log(`  Exchange rate from settings: ${rate}`);
    for (const item of inventory) {
      const priceMxn = item.price_mxn || item.price;
      const bookLanded = item.book_landed || item.bookLanded;
      if (typeof priceMxn === 'number' && priceMxn > 0 && typeof bookLanded === 'number' && bookLanded > 0) {
        const expected = Math.round((priceMxn / rate) * 1.4 * 100) / 100;
        const diff = Math.abs(expected - bookLanded);
        if (diff > 1) pricingMismatch++;
      }
    }
    console.log(`  Pricing formula mismatches (>$1 diff): ${pricingMismatch} ${pricingMismatch === 0 ? '✅' : '⚠️ (may use different exchange rate at time of calculation)'}`);
  }

  // Shape + Type consistency
  console.log('\n📋 Shape × Type Cross-Reference:');
  const shapeType: Record<string, Record<string, number>> = {};
  for (const item of inventory) {
    const shape = item.shape || '(none)';
    const type = item.generated_type || item.generatedType || '(none)';
    if (!shapeType[shape]) shapeType[shape] = {};
    shapeType[shape][type] = (shapeType[shape][type] || 0) + 1;
  }
  for (const [shape, types] of Object.entries(shapeType)) {
    const typeStr = Object.entries(types).map(([t, c]) => `${t}(${c})`).join(', ');
    console.log(`  ${shape}: ${typeStr}`);
  }

  // Color + Material combinations
  console.log('\n🎨 Color × Material (top 15):');
  const colorMat = countBy(inventory, (i: any) => `${i.color || '(none)'} | ${i.material || '(none)'}`);
  Object.entries(colorMat).slice(0, 15).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n' + '═'.repeat(60));
  console.log('✅ DATABASE STATE QUERY COMPLETE');
  console.log('═'.repeat(60));
}

main().catch(console.error);
