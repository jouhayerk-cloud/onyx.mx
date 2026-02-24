import pandas as pd
import numpy as np
import json
import os
import re

# Paths
CSV_PATH = r'c:\Jouhayerk\git\app\google_inventory.csv'
EXCEL_PATH = r'c:\Jouhayerk\Onyx.mx\app\public\bookDASH.xlsx'
OUTPUT_PATH = r'c:\Jouhayerk\git\app\migration_payload.json'

def clean_value(val):
    if pd.isna(val) or val == 'NaN':
        return None
    return val

def extract_google_data():
    df = pd.read_csv(CSV_PATH)
    df['description'] = df['description'].fillna('').astype(str)
    return df

def find_tag_col(df):
    for i, col in enumerate(df.columns):
        if 'Book #' in str(col):
            return i
    for row_idx in range(5):
        for col_idx, val in enumerate(df.iloc[row_idx]):
            if 'Book #' in str(val):
                return col_idx
    return None

def extract_excel_data(google_df):
    xl = pd.ExcelFile(EXCEL_PATH)
    vendor_sheets = [s for s in xl.sheet_names if not s.startswith('-')]
    
    all_excel_items = []
    duplicates = []
    
    # Pre-process Google data
    google_descriptions = google_df['description'].tolist()
    google_barcodes = []
    if 'bookBardcode' in google_df.columns:
        google_barcodes = [str(x).upper() for x in google_df['bookBardcode'].tolist() if pd.notna(x)]
    
    google_item_numbers = []
    if 'itemNumber' in google_df.columns:
        google_item_numbers = [str(x).split('.')[0] for x in google_df['itemNumber'].tolist() if pd.notna(x)]

    for sheet in vendor_sheets:
        print(f"Analyzing sheet: {sheet}")
        df = pd.read_excel(xl, sheet_name=sheet)
        
        tag_col_idx = find_tag_col(df)
        if tag_col_idx is None:
            continue

        data_start = 0
        for i in range(len(df)):
            val = str(df.iloc[i, tag_col_idx])
            if val.replace('.','',1).isdigit():
                data_start = i
                break
        
        data_df = df.iloc[data_start:]
        
        for idx, row in data_df.iterrows():
            tag_id_raw = str(row.iloc[tag_col_idx]) if pd.notna(row.iloc[tag_col_idx]) else None
            if not tag_id_raw or tag_id_raw.lower() in ['nan', 'none', 'total']:
                continue
            
            tag_id = tag_id_raw.split('.')[0]
            if not tag_id.isdigit(): continue
            
            is_duplicate = False
            if tag_id in google_item_numbers: is_duplicate = True
            if not is_duplicate:
                for barcode in google_barcodes:
                    if tag_id in barcode:
                        is_duplicate = True
                        break
            if not is_duplicate:
                pattern = re.compile(rf'\b{tag_id}\b')
                for desc in google_descriptions:
                    if pattern.search(desc):
                        is_duplicate = True
                        break
            
            if is_duplicate:
                duplicates.append({"tag_id": tag_id, "sheet": sheet, "row": int(idx) + 2})
                continue
            
            item = {
                "internal_id": f"EXCEL-{sheet}-{idx}",
                "item_id": sheet,
                "item_number": tag_id,
                "description": f"Archived item from 825 Book ({sheet} Tag {tag_id})",
                "metadata": {
                    "shape": clean_value(row.iloc[tag_col_idx + 1]) if len(row) > tag_col_idx+1 else None,
                    "material": clean_value(row.iloc[tag_col_idx + 2]) if len(row) > tag_col_idx+2 else None,
                    "dimensions": f"{clean_value(row.iloc[tag_col_idx + 5])}x{clean_value(row.iloc[tag_col_idx + 6])}x{clean_value(row.iloc[tag_col_idx + 7])}" if len(row) > tag_col_idx+7 else None
                },
                "price_mxn": clean_value(row.iloc[tag_col_idx + 8]) if len(row) > tag_col_idx+8 else 0,
                "workbook": "825",
                "status": "ARCHIVE",
                "media_urls": [],
                "timestamp": "2024-01-01T00:00:00.000Z"
            }
            all_excel_items.append(item)
            
    return all_excel_items, duplicates

def main():
    print("Loading Google Data...")
    google_df = extract_google_data()
    print("Loading and Processing Excel Data...")
    excel_items, duplicates = extract_excel_data(google_df)
    
    google_items = []
    for idx, row in google_df.iterrows():
        item = {
            "internal_id": f"GOOGLE-{row.get('rowId', idx)}",
            "item_id": clean_value(row.get('itemId')),
            "item_number": clean_value(row.get('itemNumber')),
            "shape": clean_value(row.get('shape')),
            "description": clean_value(row.get('description')),
            "price_mxn": clean_value(row.get('price')),
            "workbook": "326" if clean_value(row.get('status')) == 'YES' else "ARCHIVE",
            "media_urls": [x.strip() for x in str(row.get('mediaUrls')).split(',')] if pd.notna(row.get('mediaUrls')) else [],
            "timestamp": clean_value(row.get('timestamp')),
            "source": "google_sheet"
        }
        google_items.append(item)

    payload = {"google_items": google_items, "excel_items": excel_items, "duplicates": duplicates}
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, default=str)
    print(f"Migration payload saved with unique internal IDs.")

if __name__ == "__main__":
    main()
