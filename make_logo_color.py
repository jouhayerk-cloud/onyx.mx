import base64
with open(r'C:\Jouhayerk\git\app\public\REG_Logo.png', 'rb') as f:
    encoded = base64.b64encode(f.read()).decode('utf-8')
content = 'export const RARE_EARTH_LOGO = "data:image/png;base64,' + encoded + '";\n'
with open(r'C:\Jouhayerk\git\app\src\lib\rareEarthLogo.ts', 'w', encoding='utf-8') as out_f:
    out_f.write(content)
print("done")
