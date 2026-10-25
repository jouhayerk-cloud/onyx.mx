import subprocess
import json
import os
import re
from PIL import Image
import numpy as np

# Query directly from Supabase
query = "SELECT item_id, book_barcode, color, material, shape, short_description, width_cm, height_cm, length_cm, weight_kg, top_type, invoice_title, shopify_title, media_urls FROM inventory WHERE workbook = 'v826' ORDER BY item_id ASC;"
res = subprocess.run(['supabase', 'db', 'query', '--linked', query], capture_output=True, text=True, encoding='utf-8')
if res.returncode != 0:
    print('Error:', res.stderr)
    exit(1)

data = json.loads(res.stdout)
rows = data.get('rows', [])

em_dir = r'C:\Jouhayerk\Files\EM Sept 2026 photos'
em_v826 = r'C:\Jouhayerk\Files\EM Sept 2026 photos\already in v826'
ge_dir = r'C:\Jouhayerk\Files\ge'

photos_map = {}
for r in rows:
    item_id = r['item_id']
    p1 = os.path.join(em_dir, f'{item_id}.jpg')
    p2 = os.path.join(em_v826, f'{item_id}.jpg')
    if os.path.exists(p1):
        photos_map[item_id] = p1
    elif os.path.exists(p2):
        photos_map[item_id] = p2
    elif item_id.startswith('GE-'):
        ge_files = [f for f in os.listdir(ge_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
        h = str(int(float(r['height_cm']))) if r.get('height_cm') else ''
        h_m = f"{float(h)/100:.2f}" if h else ''
        for f in ge_files:
            if h_m and h_m in f:
                photos_map[item_id] = os.path.join(ge_dir, f)
                break
        if item_id not in photos_map and ge_files:
            photos_map[item_id] = os.path.join(ge_dir, ge_files[0])
    elif r.get('media_urls'):
        photos_map[item_id] = r['media_urls'].split(',')[0].strip()

# Banned checks
BANNED_PHRASES = [
    re.compile(r'light\s*column', re.I),
    re.compile(r'ambient\s*pillar', re.I),
    re.compile(r'ambient\s*stone\s*towe', re.I),
    re.compile(r'stone\s*tower', re.I),
    re.compile(r'handcrafted\s*accent', re.I),
    re.compile(r'multi-strata', re.I),
    re.compile(r'cerulean', re.I),
]
SIZE_WORDS = [
    re.compile(r'\b(small|medium|large|mini)\b', re.I),
    re.compile(r'\b\d+\s*x\s*\d+\b', re.I),
    re.compile(r'\b\d+\s*cm\b', re.I),
    re.compile(r'\b\d+\s*in\b', re.I),
]
ARTICLES = re.compile(r'\b(a|an|the|and|of)\b', re.I)

def analyze_photo(photo_path):
    if not photo_path or not os.path.exists(photo_path) or not photo_path.endswith(('.jpg', '.jpeg', '.png')):
        return None
    try:
        im = Image.open(photo_path).convert('RGB')
        w, h = im.size
        crop = im.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)))
        arr = np.array(crop)
        mean_rgb = arr.mean(axis=(0, 1))
        gray = np.dot(arr[..., :3], [0.2989, 0.5870, 0.1140])
        dx = np.abs(np.diff(gray, axis=1)).mean()
        dy = np.abs(np.diff(gray, axis=0)).mean()
        banding_ratio = dy / (dx + 1e-5)
        std_val = gray.std()
        return {
            'mean_rgb': mean_rgb,
            'dx': dx,
            'dy': dy,
            'banding_ratio': banding_ratio,
            'contrast': std_val
        }
    except Exception:
        return None

def String_clean(val):
    if not val:
        return ''
    return str(val).strip()

def get_pattern_descriptors(item, photo_stats):
    color = String_clean(item.get('color') or 'Onyx')
    ratio = photo_stats['banding_ratio'] if photo_stats else 1.0
    contrast = photo_stats['contrast'] if photo_stats else 30.0
    
    c_lower = color.lower()
    if 'amber' in c_lower and 'white' in c_lower:
        if ratio > 1.2:
            return ('Banded', 'Honey Amber Cream')
        elif contrast > 40:
            return ('Striated', 'Warm Amber Ivory')
        else:
            return ('Clouded', 'Amber Quartz White')
    elif 'amber' in c_lower:
        if ratio > 1.2:
            return ('Banded', 'Honey Amber')
        elif contrast > 35:
            return ('Striated', 'Golden Amber')
        else:
            return ('Veined', 'Translucent Amber')
    elif 'aqua' in c_lower or 'serpentine' in c_lower:
        if 'pink' in c_lower:
            return ('Veined', 'Rose Pink Serpentine')
        if contrast > 35:
            return ('Striated', 'Seafoam Aqua Serpentine')
        return ('Veined', 'Teal Aqua Serpentine')
    elif 'blue' in c_lower:
        if 'cherry' in c_lower:
            return ('Banded', 'Cherry Blue')
        if 'argentina' in c_lower:
            return ('Striated', 'Sky Blue Argentina')
        return ('Striated', 'Deep Blue')
    elif 'cherry pink' in c_lower:
        return ('Banded', 'Rose Cherry Pink')
    elif 'green-gray' in c_lower:
        if ratio > 1.1:
            return ('Banded', 'Sage Green-Gray')
        return ('Striated', 'Earthy Green-Gray')
    elif 'galaxy' in c_lower:
        return ('Nebula Swirled', 'Cosmic Galaxy')
    elif 'rainbow' in c_lower or 'arcoiris' in c_lower:
        return ('Banded', 'Rainbow Multi-Color')
    elif 'white-gray' in c_lower:
        return ('Striated', 'Silver White-Gray')
    elif 'white' in c_lower:
        if contrast > 30:
            return ('Veined', 'Crystal White')
        return ('Clouded', 'Translucent White')
    elif 'orange' in c_lower:
        return ('Vibrant Sunset', 'Sunset Terracotta Orange')
    elif 'red piramid' in c_lower or 'red' in c_lower:
        return ('Banded', 'Crimson Red Pyramid')
    elif 'tehuacan' in c_lower:
        if 'grey' in c_lower or 'gray' in c_lower:
            return ('Striated', 'Tehuacan Ash Gray')
        return ('Clouded', 'Classic Tehuacan Ivory')
    elif 'talan' in c_lower:
        return ('Striated', 'Talan Forest Green')
    else:
        if ratio > 1.2:
            return ('Banded', f'{color}')
        elif contrast > 35:
            return ('Striated', f'{color}')
        return ('Veined', f'{color}')

def is_valid_shopify_title(title):
    if not (60 <= len(title) <= 70):
        return False
    if title.endswith('.'):
        return False
    if ARTICLES.search(title):
        return False
    for bp in BANNED_PHRASES:
        if bp.search(title):
            return False
    for sw in SIZE_WORDS:
        if sw.search(title):
            return False
    if '[Top: confirm]' in title:
        return False
    return True

def fit_shopify_title(pattern, color_desc, base_color, material, shape, noun_options):
    qualifiers = [
        "Sculptural Decor",
        "Natural Stone Decor",
        "Polished Stone Decor",
        "Display Piece",
        "Natural Translucent Decor",
        "Sculptural Display",
        "Interior Decor",
        "Polished Stone",
        "Stone Decor",
        "Art Slab",
        "Decorative Vessel",
        "Centerpiece",
        "Stone Vessel",
        "Home Decor",
        "Luxury Decor",
        "Decor",
    ]
    
    for noun in noun_options:
        bases = [
            f"{pattern} {color_desc} {material} {shape} {noun}",
            f"{pattern} {color_desc} {material} {noun}",
            f"{pattern} {base_color} {material} {shape} {noun}",
            f"{pattern} {base_color} {material} {noun}",
            f"{color_desc} {material} {shape} {noun}",
        ]
        for base in bases:
            clean_base = re.sub(r'\s+', ' ', base).strip()
            if 60 <= len(clean_base) <= 70 and is_valid_shopify_title(clean_base):
                return clean_base
            for q in qualifiers:
                cand = re.sub(r'\s+', ' ', f"{clean_base} {q}").strip()
                if 60 <= len(cand) <= 70 and is_valid_shopify_title(cand):
                    return cand

    base = re.sub(r'\s+', ' ', f"{pattern} {base_color} {material} {shape} {noun_options[0]}").strip()
    for q in qualifiers:
        cand = f"{base} {q}"
        if 60 <= len(cand) <= 70 and is_valid_shopify_title(cand):
            return cand
        if len(cand) > 70:
            trimmed = cand[:70].rsplit(' ', 1)[0]
            if 60 <= len(trimmed) <= 70 and is_valid_shopify_title(trimmed):
                return trimmed

    return base[:70]

def build_titles(item, photo_stats):
    pattern_word, color_descriptor = get_pattern_descriptors(item, photo_stats)
    raw_type = String_clean(item.get('short_description') or '')
    raw_shape = String_clean(item.get('shape') or '')
    color = String_clean(item.get('color') or 'Onyx').replace('Aqua', 'Teal')
    material = String_clean(item.get('material') or 'Onyx')
    mat_str = 'Onyx' if material.lower() == color.lower() else material

    shape_norm = raw_shape
    if re.search(r'squared', shape_norm, re.I): shape_norm = 'Square'
    elif re.search(r'rectangular', shape_norm, re.I): shape_norm = 'Rectangular'
    elif re.search(r'round', shape_norm, re.I): shape_norm = 'Round'
    elif re.search(r'diamond', shape_norm, re.I): shape_norm = 'Diamond'
    elif re.search(r'free\s*form', shape_norm, re.I): shape_norm = 'Free Form'
    elif re.search(r'bobcats', shape_norm, re.I): shape_norm = 'Bobcats'
    elif re.search(r'open\s*top', shape_norm, re.I): shape_norm = 'Open Top'
    elif shape_norm in ['Large', 'Medium', 'Small']: shape_norm = ''

    w = item.get('width_cm')
    h = item.get('height_cm')
    l = item.get('length_cm')
    dim_str = ''
    if w and h:
        if not l or str(w) == str(l):
            dim_str = f"{w} x {h} cm"
        else:
            dim_str = f"{w} x {l} x {h} cm"
    elif w and l and h:
        dim_str = f"{w} x {l} x {h} cm"

    top_val = String_clean(item.get('top_type') or item.get('top') or '').lower()
    top_str = 'Open Top' if top_val == 'open' else 'Closed Top' if top_val == 'closed' else ''

    if re.search(r'floor\s*lamp', raw_type, re.I):
        noun_invoice = 'Floor Lamp'
        noun_shopify_options = ['Floor Lamp', 'Tower Lamp', 'Tower']
    elif re.search(r'table\s*lamp', raw_type, re.I):
        noun_invoice = 'Table Lamp'
        noun_shopify_options = ['Table Lamp']
    elif re.search(r'pendant', raw_type, re.I):
        noun_invoice = 'Pendant Lamp'
        noun_shopify_options = ['Pendant Lamp', 'Pendant']
    elif re.search(r'bowl', raw_type, re.I):
        noun_invoice = 'Decorative Bowl'
        noun_shopify_options = ['Decorative Bowl', 'Display Bowl', 'Stone Bowl', 'Vessel Bowl']
    elif re.search(r'canoe', raw_type, re.I):
        noun_invoice = 'Canoe Tray'
        noun_shopify_options = ['Canoe Tray', 'Sculptural Canoe Tray', 'Canoe Display Tray']
    elif re.search(r'mirror', raw_type, re.I):
        noun_invoice = 'Mirror'
        noun_shopify_options = ['Wall Mirror', 'Accent Mirror', 'Vanity Mirror']
    elif re.search(r'wall\s*panel\s*pair', raw_type, re.I):
        noun_invoice = 'Wall Panel Pair'
        noun_shopify_options = ['Wall Panel Pair', 'Bookmatched Panel Pair']
    elif re.search(r'painted\s*wall\s*panel', raw_type, re.I):
        noun_invoice = 'Painted Wall Panel'
        noun_shopify_options = ['Painted Wall Panel', 'Art Slab Panel']
    elif re.search(r'table', raw_type, re.I):
        noun_invoice = 'Table'
        noun_shopify_options = ['Accent Table', 'Side Table', 'Stone Table']
    else:
        noun_invoice = raw_type or 'Artifact'
        noun_shopify_options = [noun_invoice]

    inv_parts = [pattern_word, color, mat_str, shape_norm, noun_invoice]
    inv_title_base = " ".join([p for p in inv_parts if p]).strip()
    inv_meta = [top_str, dim_str]
    inv_meta_str = ", ".join([m for m in inv_meta if m]).strip()
    invoice_title = f"{inv_title_base}, {inv_meta_str}" if inv_meta_str else inv_title_base
    invoice_title = re.sub(r'\s+', ' ', invoice_title).replace(' ,', ',').strip()

    shopify_title = fit_shopify_title(pattern_word, color_descriptor, color, mat_str, shape_norm, noun_shopify_options)
    return invoice_title, shopify_title

results = {}
for r in rows:
    item_id = r['item_id']
    photo = photos_map.get(item_id)
    stats = analyze_photo(photo)
    inv_title, shop_title = build_titles(r, stats)
    valid = is_valid_shopify_title(shop_title)
    results[item_id] = {
        'invoice_title': inv_title,
        'shopify_title': shop_title,
        'valid': valid,
        'length': len(shop_title)
    }

with open('scripts/v826_new_titles.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print(f"Generated {len(results)} titles. Invalid: {sum(1 for r in results.values() if not r['valid'])}")
print(f"Contains 'Handcrafted Accent': {sum(1 for r in results.values() if 'Handcrafted Accent' in r['shopify_title'])}")
