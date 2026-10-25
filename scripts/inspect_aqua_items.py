import subprocess
import json

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

sql = """
SELECT item_id, color, material, short_description, invoice_title, shopify_title, generated_color, system_metadata
FROM inventory
WHERE (color ILIKE '%aqua%' OR short_description ILIKE '%aqua%' OR material ILIKE '%aqua%')
LIMIT 15;
"""
print(run_supabase_sql(sql))
