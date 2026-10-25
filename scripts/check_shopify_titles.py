import subprocess
import json

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

print("Checking shopify_title in v826...")
sql = """
SELECT 
    COUNT(*) as total,
    COUNT(shopify_title) as with_shopify_title,
    COUNT(*) - COUNT(shopify_title) as empty_shopify_title
FROM inventory
WHERE workbook = 'v826';
"""
print(run_supabase_sql(sql))

sql_sample = """
SELECT item_id, invoice_title, shopify_title
FROM inventory
WHERE workbook = 'v826'
LIMIT 5;
"""
print(run_supabase_sql(sql_sample))
