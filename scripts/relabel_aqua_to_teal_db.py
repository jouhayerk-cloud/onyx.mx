import subprocess

def run_supabase_sql(sql_query):
    res = subprocess.run(['supabase', 'db', 'query', '--linked', sql_query], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        raise RuntimeError(f"SQL failed: {res.stderr}\n{res.stdout}")
    return res.stdout

print("1. Updating inventory.color: replacing Aqua with Teal...")
sql_color = """
UPDATE inventory
SET color = REPLACE(color, 'Aqua', 'Teal')
WHERE color ILIKE '%aqua%';
"""
run_supabase_sql(sql_color)

print("2. Updating inventory.invoice_title: replacing Aqua with Teal...")
sql_title = """
UPDATE inventory
SET invoice_title = REPLACE(invoice_title, 'Aqua', 'Teal')
WHERE invoice_title ILIKE '%aqua%';
"""
run_supabase_sql(sql_title)

print("3. Updating inventory.generated_color for all aqua / teal items...")
# Replace Blue, Turquoise/Aqua, and Aqua with Teal
sql_gen_color = """
UPDATE inventory
SET generated_color = REPLACE(REPLACE(REPLACE(generated_color, 'Turquoise/Aqua', 'Teal'), 'Blue', 'Teal'), 'Aqua', 'Teal')
WHERE (color ILIKE '%teal%' OR short_description ILIKE '%teal%' OR short_description ILIKE '%aqua%')
  AND color NOT ILIKE '%argentin%';
"""
run_supabase_sql(sql_gen_color)

# For v826 specifically, ensure all Teal Serpentine items are strictly "Tan, Brown, Teal"
sql_v826 = """
UPDATE inventory
SET generated_color = 'Tan, Brown, Teal'
WHERE workbook = 'v826' AND (color ILIKE '%teal%' OR short_description ILIKE '%teal%');
"""
run_supabase_sql(sql_v826)

print("4. Verifying updated rows...")
sql_check = """
SELECT item_id, workbook, color, invoice_title, generated_color
FROM inventory
WHERE color ILIKE '%teal%' OR invoice_title ILIKE '%teal%'
LIMIT 12;
"""
print(run_supabase_sql(sql_check))

print("5. Checking if any Aqua remains in color or invoice_title...")
sql_check_aqua = """
SELECT COUNT(*) as remaining_aqua_color
FROM inventory
WHERE color ILIKE '%aqua%' OR invoice_title ILIKE '%aqua%';
"""
print(run_supabase_sql(sql_check_aqua))
