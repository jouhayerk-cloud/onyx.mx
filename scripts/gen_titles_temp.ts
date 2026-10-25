
import { buildInvoiceTitle826 } from '../src/lib/taxonomy/onyx826';
import fs from 'fs';

const rows = JSON.parse(fs.readFileSync('scripts/temp_v826_items.json', 'utf-8'));
const titles = rows.map((r: any) => ({
  id: r.id,
  item_id: r.item_id,
  barcode: r.book_barcode,
  invoice_title: buildInvoiceTitle826({
    short_description: r.short_description,
    shape: r.shape,
    material: r.material,
    color: r.color,
    width_cm: r.width_cm,
    height_cm: r.height_cm,
    length_cm: r.length_cm,
  })
}));
fs.writeFileSync('scripts/temp_v826_titles.json', JSON.stringify(titles, null, 2), 'utf-8');
console.log('Generated titles successfully.');
