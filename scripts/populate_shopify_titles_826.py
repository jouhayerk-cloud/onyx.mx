import subprocess
import json

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

with open('scripts/v826_shopify_titles.json', 'r', encoding='utf-8') as f:
    titles = json.load(f)

print(f"Loaded {len(titles)} shopify titles to commit.")

chunk_size = 10
items = list(titles.items())
for i in range(0, len(items), chunk_size):
    chunk = items[i:i+chunk_size]
    statements = []
    for item_id, title in chunk:
        clean_title = title.replace("'", "''")
        statements.append(f"UPDATE inventory SET shopify_title = '{clean_title}' WHERE workbook = 'v826' AND item_id = '{item_id}';")
    batch_sql = "\n".join(statements)
    run_supabase_sql(batch_sql)
    print(f"  Committed {i+1}..{min(i+chunk_size, len(items))}")

print("\nVerifying database update...")
verify_sql = """
SELECT 
    COUNT(*) as total_v826,
    COUNT(shopify_title) as with_shopify_title,
    COUNT(*) - COUNT(shopify_title) as empty_shopify_title
FROM inventory 
WHERE workbook = 'v826';
"""
print(run_supabase_sql(verify_sql))

sample_sql = """
SELECT item_id, invoice_title, shopify_title
FROM inventory
WHERE workbook = 'v826'
LIMIT 5;
"""
print(run_supabase_sql(sample_sql))
