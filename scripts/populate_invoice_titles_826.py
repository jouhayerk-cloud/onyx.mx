import subprocess
import json
import time

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

print("1. Fetching all v826 items from inventory...")
fetch_sql = "SELECT id, item_id, book_barcode, short_description, shape, material, color, width_cm, height_cm, length_cm FROM inventory WHERE workbook = 'v826' ORDER BY item_id;"
raw_data = run_supabase_sql(fetch_sql)
data = json.loads(raw_data)
rows = data.get('rows', [])
print(f"Found {len(rows)} items.")

# We will generate deterministic titles via preview_invoice_titles.ts or pure logic
print("2. Generating deterministic invoice titles via Node.js tsx...")
ts_script = """
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
"""

items_path = r'c:\Jouhayerk\git\app\scripts\temp_v826_items.json'
titles_path = r'c:\Jouhayerk\git\app\scripts\temp_v826_titles.json'
script_path = r'c:\Jouhayerk\git\app\scripts\gen_titles_temp.ts'

with open(items_path, 'w', encoding='utf-8') as f:
    json.dump(rows, f, indent=2)

with open(script_path, 'w', encoding='utf-8') as f:
    f.write(ts_script)

res = subprocess.run(['npx', 'tsx', script_path], capture_output=True, text=True, encoding='utf-8', shell=True, cwd=r'c:\Jouhayerk\git\app')
if res.returncode != 0:
    print("TSX error:", res.stderr, res.stdout)
    exit(1)

with open(titles_path, 'r', encoding='utf-8') as f:
    titles = json.load(f)

print(f"Loaded {len(titles)} generated titles.")
for t in titles[:5]:
    print(f"  {t['item_id']} => {t['invoice_title']}")

print("3. Updating Supabase inventory.invoice_title in chunks...")
chunk_size = 10
for i in range(0, len(titles), chunk_size):
    chunk = titles[i:i+chunk_size]
    statements = []
    for item in chunk:
        clean_title = item['invoice_title'].replace("'", "''")
        statements.append(f"UPDATE inventory SET invoice_title = '{clean_title}' WHERE id = '{item['id']}';")
    batch_sql = "\n".join(statements)
    run_supabase_sql(batch_sql)
    print(f"  Committed items {i+1}..{min(i+chunk_size, len(titles))}")

print("4. Verification query...")
verify_sql = "SELECT count(*) as total, count(invoice_title) as with_title FROM inventory WHERE workbook = 'v826';"
res = run_supabase_sql(verify_sql)
print(res)
