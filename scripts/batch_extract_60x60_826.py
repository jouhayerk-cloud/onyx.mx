"""
batch_extract_60x60_826.py
Re-extracts hex maps at 60x60 (3x resolution, 3,600 cells) for all items in 826.
Includes:
- Mirror reflection de-contamination for EM-007..EM-022 (inner glass keyed to #FFFFFF).
- High-fidelity 60x60 sampling for all photo angles.
- Vividness-based hero selection for _pixel_map_hex (preserving backlit states).
- Multi-angle spatial_points entries with dimensions "60x60", cols: 60, rows: 60.
- Commits updates to Supabase database.
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
MIRROR_ITEM_IDS = {
    'EM-007', 'EM-008', 'EM-009', 'EM-010', 'EM-011', 'EM-012',
    'EM-013', 'EM-014', 'EM-015', 'EM-016', 'EM-017', 'EM-018',
    'EM-019', 'EM-020', 'EM-021', 'EM-022'
}
ROUND_MIRROR_IDS = {'EM-017', 'EM-018', 'EM-019', 'EM-020', 'EM-021', 'EM-022'}

def run_supabase_sql(sql_query=None, sql_file=None):
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
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            if r.status_code == 200 and len(r.content) > 0:
                img = Image.open(io.BytesIO(r.content)).convert('RGBA')
                return img
            time.sleep(1)
        except Exception as e:
            if attempt == retries:
                print(f"  [WARN] Failed to download {url[:60]}: {e}")
                return None
            time.sleep(1)
    return None

def calc_vividness(hex_list):
    """Calculates mean saturation of stone pixels (excluding white backdrop)."""
    total = 0.0
    stone_count = 0
    for h in hex_list:
        clean = h.lstrip('#')
        r, g, b = int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)
        if r >= 240 and g >= 240 and b >= 240:
            continue
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        sat = (max_val - min_val) / max_val if max_val > 0 else 0.0
        total += sat
        stone_count += 1
    return (total / stone_count) if stone_count > 0 else 0.0

def sample_mirror_to_60x60(img, item_id):
    """
    Samples a mirror image to 60x60 while keying out the reflective glass center to #FFFFFF.
    Only the authentic onyx stone frame is captured.
    """
    bbox = img.getbbox()
    if bbox:
        cropped = img.crop(bbox)
    else:
        cropped = img
        
    small = cropped.resize((60, 60), Image.Resampling.BOX)
    w, h = small.size
    is_round = item_id in ROUND_MIRROR_IDS
    hex_list = []

    center_x = (w - 1) / 2.0
    center_y = (h - 1) / 2.0
    r_outer = min(center_x, center_y)
    r_inner = r_outer * 0.52

    rect_inner_x1 = int(w * 0.24)
    rect_inner_x2 = int(w * 0.76)
    rect_inner_y1 = int(h * 0.22)
    rect_inner_y2 = int(h * 0.78)

    for y in range(h):
        for x in range(w):
            r, g, b, a = small.getpixel((x, y))

            # Check if this pixel is inside the reflective glass opening
            if is_round:
                dx = x - center_x
                dy = y - center_y
                dist = (dx * dx + dy * dy) ** 0.5
                is_glass = (dist < r_inner)
            else:
                is_glass = (rect_inner_x1 <= x <= rect_inner_x2) and (rect_inner_y1 <= y <= rect_inner_y2)

            is_transparent = (a < 50)
            is_black_bg = (r <= 45 and g <= 45 and b <= 45 and (max(r, g, b) - min(r, g, b)) <= 15)
            is_white_bg = (r >= 252 and g >= 252 and b >= 252)

            if is_glass or is_transparent or is_black_bg or is_white_bg:
                hex_list.append('#FFFFFF')
            else:
                hex_list.append(f"#{r:02X}{g:02X}{b:02X}")

    return hex_list

def sample_standard_to_60x60(img):
    """Samples a standard non-mirror item to a 60x60 grid with backdrop filtering."""
    small = img.resize((60, 60), Image.Resampling.BOX)
    w, h = small.size
    hex_list = []

    for y in range(h):
        for x in range(w):
            r, g, b, a = small.getpixel((x, y))
            is_transparent = (a < 50)
            is_black_bg = (r <= 45 and g <= 45 and b <= 45 and (max(r, g, b) - min(r, g, b)) <= 15)
            is_white_bg = (r >= 252 and g >= 252 and b >= 252)

            if is_transparent or is_black_bg or is_pure_white(r, g, b) or is_white_bg:
                hex_list.append('#FFFFFF')
            else:
                hex_list.append(f"#{r:02X}{g:02X}{b:02X}")

    return hex_list

def is_pure_white(r, g, b):
    return r >= 250 and g >= 250 and b >= 250

def process_item(item):
    item_db_id = item['id']
    item_id = item.get('item_id', '')
    barcode = item.get('book_barcode', '')
    media_urls_raw = item.get('media_urls') or ''
    photo_urls = [u.strip() for u in media_urls_raw.split(',') if u.strip()]
    num_photos = len(photo_urls)

    if num_photos == 0:
        return None

    is_mirror = (item_id in MIRROR_ITEM_IDS) or ('mirror' in (item.get('generated_description') or '').lower())
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

    spatial_points = []
    angle_hex_strings = []
    vividness_scores = []

    print(f"Sampling {item_id:<7} ({barcode}) - {num_photos} photos ({'MIRROR' if is_mirror else 'standard'})...")

    for idx, photo_url in enumerate(photo_urls):
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
            print(f"  [WARN] Failed photo {idx} for {barcode}. Using #FFFFFF grid.")
            hex_list = ['#FFFFFF'] * 3600
        else:
            if is_mirror:
                hex_list = sample_mirror_to_60x60(img, item_id)
            else:
                hex_list = sample_standard_to_60x60(img)

        hex_string = ",".join(hex_list)
        angle_hex_strings.append(hex_string)
        vividness_scores.append(calc_vividness(hex_list))

        sp_entry = {
            "type": "pixel_map",
            "index": idx,
            "dimensions": "60x60",
            "cols": 60,
            "rows": 60,
            "hex_string": hex_string
        }
        if idx == 0 and existing_bitmap_url:
            sp_entry["bitmap_url"] = existing_bitmap_url

        spatial_points.append(sp_entry)
        pmu[f"_pixel_map_hex_{idx}"] = hex_string

    # Select the most vivid angle (e.g. backlit "lights on") for _pixel_map_hex
    best_idx = 0
    best_vivid = -1.0
    for i, score in enumerate(vividness_scores):
        if score > best_vivid:
            best_vivid = score
            best_idx = i

    pmu["_pixel_map_hex"] = angle_hex_strings[best_idx]
    pmu["dimensions"] = "60x60"

    return {
        "id": item_db_id,
        "item_id": item_id,
        "barcode": barcode,
        "spatial_points": spatial_points,
        "processed_media_urls": pmu,
        "photo_count": num_photos,
        "is_mirror": is_mirror,
        "best_angle": best_idx,
        "stone_cells": sum(1 for h in angle_hex_strings[best_idx].split(',') if h != '#FFFFFF')
    }

def main():
    print("=== Supabase 826 60x60 Hex Map Batch Processor ===")
    print("Querying 826 items...")
    query = """
    SELECT json_agg(t) FROM (
        SELECT id, item_id, workbook, book_barcode, media_urls, spatial_points, processed_media_urls, spatial_masks, generated_description
        FROM inventory
        WHERE workbook ILIKE '%826%' OR book_barcode ILIKE '%826%' OR item_id ILIKE '%826%'
        ORDER BY item_id
    ) t;
    """
    output = run_supabase_sql(sql_query=query)
    clean_json = None
    try:
        data = json.loads(output)
        clean_json = data['rows'][0]['json_agg']
    except Exception as e:
        start = output.find('[{')
        end = output.rfind('}]') + 2
        clean_json = json.loads(output[start:end])

    items = clean_json or []
    total_found = len(items)
    print(f"Total 826 items found: {total_found}")

    no_photos = [i for i in items if not (i.get('media_urls') or '').strip()]
    with_photos = [i for i in items if (i.get('media_urls') or '').strip()]

    print(f"Items without photos: {len(no_photos)} ({', '.join([i['item_id'] for i in no_photos])})")
    print(f"Items to process at 60x60: {len(with_photos)}")

    start_time = time.time()
    results = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(process_item, item) for item in with_photos]
        for f in futures:
            try:
                res = f.result()
                if res:
                    results.append(res)
            except Exception as e:
                print(f"  [ERROR] Failed processing item: {e}")

    elapsed = time.time() - start_time
    print(f"\nAll {len(results)} items extracted at 60x60 in {elapsed:.1f}s.")

    # Write SQL update
    sql_file = os.path.join(os.path.dirname(__file__), 'update_826_60x60.sql')
    print(f"Writing SQL updates to {sql_file}...")
    with open(sql_file, 'w', encoding='utf-8') as f:
        f.write("BEGIN;\n\n")
        for res in results:
            sp_json = json.dumps(res['spatial_points']).replace("'", "''")
            pmu_json = json.dumps(res['processed_media_urls']).replace("'", "''")
            f.write(
                f"-- {res['item_id']} ({res['barcode']}) - {res['photo_count']} photos | Mirror: {res['is_mirror']} | Stone cells: {res['stone_cells']}/3600\n"
                f"UPDATE inventory\n"
                f"SET spatial_points = '{sp_json}'::jsonb,\n"
                f"    processed_media_urls = '{pmu_json}'::jsonb,\n"
                f"    updated_at = NOW()\n"
                f"WHERE id = '{res['id']}';\n\n"
            )
        f.write("COMMIT;\n")

    print(f"Executing SQL updates in Supabase linked database...")
    run_supabase_sql(sql_file=sql_file)
    print("Database updates committed successfully!")

    # Verify
    verify_query = """
    SELECT json_build_object(
        'total_826', count(*),
        'with_60x60_sp', count(*) FILTER (WHERE spatial_points::text LIKE '%60x60%'),
        'with_60x60_pmu', count(*) FILTER (WHERE processed_media_urls::text LIKE '%60x60%')
    )
    FROM inventory
    WHERE workbook = 'v826' OR book_barcode ILIKE '%826%';
    """
    v_out = run_supabase_sql(sql_query=verify_query)
    print("\nVerification output:")
    print(v_out)

if __name__ == '__main__':
    main()
