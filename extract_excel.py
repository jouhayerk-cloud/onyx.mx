import pandas as pd
import json
import os

excel_path = r'c:\Jouhayerk\Onyx.mx\app\public\bookDASH.xlsx'

def clean_df(df):
    # Drop rows/cols that are entirely NaN
    df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
    # If the first row looks like headers (lots of strings), use it
    if not df.empty:
        # Reset index
        df = df.reset_index(drop=True)
    return df

try:
    xl = pd.ExcelFile(excel_path)
    summary = {}
    for sheet in xl.sheet_names:
        df = pd.read_excel(excel_path, sheet_name=sheet)
        df = clean_df(df)
        
        # Try to find the header row if it's not the first one
        # Usually headers don't have many NaNs
        header_row_idx = 0
        for i in range(min(10, len(df))):
            row = df.iloc[i]
            if row.notnull().sum() > len(row) * 0.5: # If more than 50% is not null
                header_row_idx = i
                break
        
        fixed_df = df.iloc[header_row_idx:].reset_index(drop=True)
        new_header = fixed_df.iloc[0]
        fixed_df = fixed_df[1:]
        fixed_df.columns = new_header
        
        summary[sheet] = {
            "columns": [str(c) for c in fixed_df.columns.tolist() if pd.notnull(c)],
            "row_count": len(fixed_df),
            "sample": fixed_df.head(5).to_dict(orient='records')
        }

    print("SUMMARY_START")
    print(json.dumps(summary, indent=2, default=str))
    print("SUMMARY_END")

except Exception as e:
    import traceback
    print(f"Error: {e}")
    traceback.print_exc()
