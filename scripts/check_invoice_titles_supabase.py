import subprocess
import json

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

print("Checking inventory invoice_title counts...")
sql = """
SELECT 
    COUNT(*) as total_items,
    COUNT(invoice_title) as with_invoice_title,
    COUNT(*) - COUNT(invoice_title) as empty_invoice_title
FROM inventory;
"""
print(run_supabase_sql(sql))

print("Breakdown by workbook / batch:")
sql_breakdown = """
SELECT 
    COALESCE(workbook, 'no_workbook') as wb,
    COUNT(*) as total,
    COUNT(invoice_title) as with_title,
    COUNT(*) - COUNT(invoice_title) as empty_title
FROM inventory
GROUP BY workbook
ORDER BY total DESC;
"""
print(run_supabase_sql(sql_breakdown))
