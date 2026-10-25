"""
batch_hex_map_826.py
Standalone batch processor to extract and save missing multi-photo color hex maps in Supabase
for items in workbook 'v826' or matching '826'.
"""

import sys
import os
import json
import io
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import requests

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def run_supabase_sql(sql_query=None, sql_file=None):
    """Executes SQL via the Supabase CLI linked project."""
    cmd = ['supabase', 'db', 'query', '--linked']
    if sql_file:
        cmd.extend(['-f', sql_file])
    elif sql_query:
        cmd.append(sql_query)
    else:
        raise ValueError("Either sql_query or sql_file must be provided")

    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        print(f"SQL execution error:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}", file=sys.stderr)
        raise RuntimeError(f"Supabase CLI failed with code {res.returncode}")
    return res.stdout

def download_image(url, retries=2, timeout=20):
    """Downloads an image from Google Drive / web URL and returns PIL RGBA Image."""
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            if r.status_code == 200 and len(r.content) > 0:
                img = Image.open(io.BytesIO(r.content)).convert('RGBA')
                return img
            time.sleep(1)
        except Exception as e:
            if attempt == retries:
                print(f"  [WARN] Failed to download {url}: {e}")
                return None
            time.sleep(1)
    return None

def sample_image_to_20x20_hex(img):
    """
    Samples an RGBA PIL image into a 20x20 grid of hex strings.
    Filters out transparent backdrop (a < 50) and black studio backdrop
    (r,g,b <= 45 with low saturation) mapping them to #FFFFFF.
    """
    small = img.resize((20, 20), Image.Resampling.BOX)
    w, h = small.size
    hex_list = []
    
    # Process each of the 400 pixels
    for y in range(h):
        for x in range(w):
            r, g, b, a = small.getpixel((x, y))
            is_transparent = (a < 50)
            is_black_bg = (r <= 45 and g <= 45 and b <= 45 and (max(r, g, b) - min(r, g, b)) <= 15)
            is_pure_white = (r >= 252 and g >= 252 and b >= 252)
            
            if is_transparent or is_black_bg or is_pure_white:
                hex_list.append('#FFFFFF')
            else:
                hex_list.append(f"#{r:02X}{g:02X}{b:02X}")
                
    return hex_list

def blend_hex_lists(hex_lists):
    """
    Blends multiple 20x20 hex lists into a single master averaged hex map.
    Matches axonometric.ts: averages corresponding non-white stone cells.
    """
    total_cells = 400
    blended = []
    
    for i in range(total_cells):
        sum_r, sum_g, sum_b, count = 0, 0, 0, 0
        for hl in hex_lists:
            hex_code = hl[i].lstrip('#')
            r = int(hex_code[0:2], 16)
            g = int(hex_code[2:4], 16)
            b = int(hex_code[4:6], 16)
            
            # Check if stone (not white backdrop)
            if not (r >= 248 and g >= 248 and b >= 248):
                sum_r += r
                sum_g += g
                sum_b += b
                count += 1
                
        if count > 0:
            avg_r = round(sum_r / count)
            avg_g = round(sum_g / count)
            avg_b = round(sum_b / count)
            blended.append(f"#{avg_r:02X}{avg_g:02X}{avg_b:02X}")
        else:
            blended.append('#FFFFFF')
            
    return blended

def process_item(item):
    """
    Processes a single multi-photo item:
    Downloads each photo/mask, extracts 20x20 hex maps, blends them,
    and returns updated spatial_points and processed_media_urls.
    """
    item_id = item['id']
    barcode = item.get('book_barcode', '')
    media_urls_raw = item.get('media_urls') or ''
    photo_urls = [u.strip() for u in media_urls_raw.split(',') if u.strip()]
    num_photos = len(photo_urls)
    
    spatial_masks = item.get('spatial_masks') or {}
    if isinstance(spatial_masks, str):
        try:
            spatial_masks = json.loads(spatial_masks)
        except Exception:
            spatial_masks = {}

    existing_sp = item.get('spatial_points') or []
    if isinstance(existing_sp, str):
        try:
            existing_sp = json.loads(existing_sp)
        except Exception:
            existing_sp = []

    existing_bitmap_url = None
    if isinstance(existing_sp, list) and len(existing_sp) > 0 and isinstance(existing_sp[0], dict):
        existing_bitmap_url = existing_sp[0].get('bitmap_url')

    pmu = item.get('processed_media_urls') or {}
    if isinstance(pmu, str):
        try:
            pmu = json.loads(pmu)
        except Exception:
            pmu = {}

    photo_hex_lists = []
    spatial_points = []

    print(f"Processing {barcode} ({item.get('item_id')}) - {num_photos} photos...")

    for idx, photo_url in enumerate(photo_urls):
        # Prefer mask cutout from spatial_masks if available
        mask_url = None
        angle_key = f"angle_{idx}"
        if angle_key in spatial_masks and isinstance(spatial_masks[angle_key], list) and len(spatial_masks[angle_key]) > 0:
            mask_url = spatial_masks[angle_key][0].get('mask')

        img = None
        if mask_url:
            img = download_image(mask_url)
        if img is None:
            img = download_image(photo_url)

        if img is None:
            print(f"  [WARN] Failed to load photo {idx} for {barcode}. Using fallback #FFFFFF.")
            hex_list = ['#FFFFFF'] * 400
        else:
            hex_list = sample_image_to_20x20_hex(img)

        photo_hex_lists.append(hex_list)
        hex_string = ",".join(hex_list)

        sp_entry = {
            "type": "pixel_map",
            "index": idx,
            "dimensions": "20x20",
            "cols": 20,
            "rows": 20,
            "hex_string": hex_string
        }
        if idx == 0 and existing_bitmap_url:
            sp_entry["bitmap_url"] = existing_bitmap_url
            
        spatial_points.append(sp_entry)
        pmu[f"_pixel_map_hex_{idx}"] = hex_string

    # Blend master hex map across all photos
    blended_hex_list = blend_hex_lists(photo_hex_lists)
    master_hex_string = ",".join(blended_hex_list)
    pmu["_pixel_map_hex"] = master_hex_string

    return {
        "id": item_id,
        "barcode": barcode,
        "spatial_points": spatial_points,
        "processed_media_urls": pmu,
        "photo_count": num_photos
    }

def main():
    print("=== Supabase 826 Hex Map Batch Processor ===")
    
    # 1. Fetch all items matching 826
    print("Fetching inventory items for workbook v826 / barcode 826...")
    query = """
    SELECT json_agg(t) FROM (
        SELECT id, item_id, workbook, book_barcode, media_urls, spatial_points, processed_media_urls, spatial_masks
        FROM inventory
        WHERE workbook ILIKE '%826%' OR book_barcode ILIKE '%826%' OR item_id ILIKE '%826%'
        ORDER BY item_id
    ) t;
    """
    output = run_supabase_sql(sql_query=query)
    
    # Supabase db query outputs JSON containing rows
    clean_json = None
    try:
        data = json.loads(output)
        clean_json = data['rows'][0]['json_agg']
    except Exception as e:
        print(f"Error parsing query output: {e}")
        # Try finding json in stdout
        start = output.find('[{')
        end = output.rfind('}]') + 2
        if start != -1 and end != -1:
            clean_json = json.loads(output[start:end])
        else:
            raise

    items = clean_json or []
    total_found = len(items)
    print(f"Total 826 items retrieved: {total_found}")

    no_photos_items = []
    already_complete_items = []
    to_process_items = []

    for item in items:
        media_urls = item.get('media_urls')
        if not media_urls or not media_urls.strip():
            no_photos_items.append(item)
            continue

        urls = [u.strip() for u in media_urls.split(',') if u.strip()]
        if len(urls) == 1:
            already_complete_items.append(item)
        else:
            to_process_items.append(item)

    print(f"\nItem Breakdown:")
    print(f"  - No photos: {len(no_photos_items)} items ({', '.join([i.get('item_id', '') for i in no_photos_items])})")
    print(f"  - Single photo (already complete): {len(already_complete_items)} items")
    print(f"  - Multi-photo (missing complete per-photo/blended hex maps): {len(to_process_items)} items")

    if not to_process_items:
        print("\nNo items require processing. Exiting.")
        return

    # 2. Process all multi-photo items with thread pool
    print(f"\nProcessing {len(to_process_items)} multi-photo items...")
    start_time = time.time()
    
    processed_results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(process_item, item) for item in to_process_items]
        for f in futures:
            try:
                res = f.result()
                processed_results.append(res)
            except Exception as e:
                print(f"  [ERROR] Item processing failed: {e}")

    elapsed = time.time() - start_time
    print(f"\nAll {len(processed_results)} items processed in {elapsed:.1f}s.")

    # 3. Generate SQL update script
    sql_file = os.path.join(os.path.dirname(__file__), 'update_826_hex_maps.sql')
    print(f"\nWriting updates to {sql_file}...")
    with open(sql_file, 'w', encoding='utf-8') as f:
        f.write("BEGIN;\n\n")
        for res in processed_results:
            sp_json = json.dumps(res['spatial_points']).replace("'", "''")
            pmu_json = json.dumps(res['processed_media_urls']).replace("'", "''")
            f.write(
                f"-- {res['barcode']} ({res['photo_count']} photos)\n"
                f"UPDATE inventory\n"
                f"SET spatial_points = '{sp_json}'::jsonb,\n"
                f"    processed_media_urls = '{pmu_json}'::jsonb,\n"
                f"    updated_at = NOW()\n"
                f"WHERE id = '{res['id']}';\n\n"
            )
        f.write("COMMIT;\n")

    # 4. Execute update in Supabase
    print("Executing update in Supabase database...")
    run_supabase_sql(sql_file=sql_file)
    print("Database update successfully committed!")

    # 5. Verification query
    print("\nVerifying database state...")
    verify_query = """
    SELECT json_build_object(
        'total_826', count(*),
        'with_multi_sp', count(*) FILTER (WHERE jsonb_array_length(spatial_points::jsonb) > 1),
        'with_master_hex', count(*) FILTER (WHERE (processed_media_urls::jsonb ? '_pixel_map_hex')),
        'with_pmu_hex_1', count(*) FILTER (WHERE (processed_media_urls::jsonb ? '_pixel_map_hex_1'))
    ) FROM inventory
    WHERE workbook ILIKE '%826%' OR book_barcode ILIKE '%826%' OR item_id ILIKE '%826%';
    """
    v_output = run_supabase_sql(sql_query=verify_query)
    print("Verification result:\n", v_output)

    print("\n=== SUMMARY ===")
    print(f"Total 826 items found: {total_found}")
    print(f"Items already having complete single-photo hex maps: {len(already_complete_items)}")
    print(f"Items successfully extracted and updated (multi-photo): {len(processed_results)}")
    print(f"Items with no photos: {len(no_photos_items)}")

if __name__ == '__main__':
    main()
