import subprocess

sql = """
SELECT id, name, sku, shape, dimensions, length(spatial_points::text) as sp_len, length(processed_media_urls::text) as pmu_len
FROM inventory
WHERE sku IN ('EM82622HFD', 'EM82619ELD') OR id IN ('EM-022', 'EM-019');
"""

res = subprocess.run(['supabase', 'db', 'query', '--linked', sql], capture_output=True, text=True, encoding='utf-8')
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
