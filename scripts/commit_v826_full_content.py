import subprocess
import json

with open('scripts/v826_full_content.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

print(f"Loaded {len(records)} records to commit to Supabase.")

chunk_size = 10
for i in range(0, len(records), chunk_size):
    chunk = records[i:i + chunk_size]
    statements = []
    for r in chunk:
        item_id = r['item_id']
        inv_title = r['invoice_title'].replace("'", "''")
        shop_title = r['shopify_title'].replace("'", "''")
        desc = r['generated_description'].replace("'", "''")
        stmt = (
            f"UPDATE inventory SET "
            f"invoice_title = '{inv_title}', "
            f"shopify_title = '{shop_title}', "
            f"generated_description = '{desc}' "
            f"WHERE workbook = 'v826' AND item_id = '{item_id}';"
        )
        statements.append(stmt)
    
    batch_sql = "\n".join(statements)
    res = subprocess.run(['supabase', 'db', 'query', '--linked', batch_sql], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        print(f"Error on chunk {i}: {res.stderr}\n{res.stdout}")
        exit(1)
    print(f"Committed batch {i + 1}..{min(i + chunk_size, len(records))} of {len(records)}")

print("All 71 records successfully updated in Supabase!")
