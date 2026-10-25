import os
import json
import urllib.request

env_file = r'c:\Jouhayerk\git\app\.env.local'
url = None
anon = None

with open(env_file, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith('VITE_SUPABASE_URL='):
            url = line.split('=', 1)[1].strip()
        elif line.startswith('VITE_SUPABASE_ANON_KEY='):
            anon = line.split('=', 1)[1].strip()

headers = {
    'apikey': anon,
    'Authorization': f'Bearer {anon}',
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
}

# 1. Total rows in inventory
req = urllib.request.Request(f"{url}/rest/v1/inventory?select=count", headers=headers)
with urllib.request.urlopen(req) as resp:
    count_hdr = resp.headers.get('content-range')
    print("Total rows:", count_hdr)

# 2. Rows where invoice_title is null or empty
req = urllib.request.Request(f"{url}/rest/v1/inventory?invoice_title=is.null&select=count", headers=headers)
with urllib.request.urlopen(req) as resp:
    null_hdr = resp.headers.get('content-range')
    print("Null invoice_title rows:", null_hdr)

# 3. Check v826 specifically
req = urllib.request.Request(f"{url}/rest/v1/inventory?system_metadata->>batch_id=eq.v826&select=item_id,invoice_title,shopify_title", headers=headers)
with urllib.request.urlopen(req) as resp:
    v826_rows = json.loads(resp.read().decode('utf-8'))
    print(f"v826 items count: {len(v826_rows)}")
    filled = [r for r in v826_rows if r.get('invoice_title')]
    empty = [r for r in v826_rows if not r.get('invoice_title')]
    print(f"v826 filled: {len(filled)}, v826 empty: {len(empty)}")
    if empty:
        print("Empty items in v826:", [r['item_id'] for r in empty])
    else:
        print("Sample filled v826 invoice_titles:")
        for r in filled[:5]:
            print(f"  {r['item_id']}: {r['invoice_title']}")
