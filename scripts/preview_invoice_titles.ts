import { execSync } from 'child_process';
import { buildInvoiceTitle826 } from '../src/lib/taxonomy/onyx826';

const res = execSync("supabase db query --linked \"SELECT id, item_id, book_barcode, short_description, shape, material, color, width_cm, height_cm, length_cm FROM inventory WHERE workbook = 'v826' ORDER BY item_id;\"", { encoding: 'utf-8' });

const data = JSON.parse(res);
console.log(`Fetched ${data.rows.length} rows.`);

for (const row of data.rows) {
  const item = {
    short_description: row.short_description,
    shape: row.shape,
    material: row.material,
    color: row.color,
    width_cm: row.width_cm,
    height_cm: row.height_cm,
    length_cm: row.length_cm,
  };
  const title = buildInvoiceTitle826(item);
  console.log(`${row.item_id.padEnd(8)} [${(row.book_barcode || '').padEnd(12)}] => ${title}`);
}
