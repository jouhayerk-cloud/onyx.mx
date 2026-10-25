# Add Teal Serpentine to taxonomy and color maps

# 1. colorVocabulary.ts
path_cv = r'c:\Jouhayerk\git\app\src\lib\colorVocabulary.ts'
with open(path_cv, 'r', encoding='utf-8') as f:
    cv = f.read()

target_cv = "    'Tehuacan':                    ['White'],"
rep_cv = """    'Teal':                        ['Teal', 'Tan', 'Brown'],
    'Teal Serpentine':             ['Tan', 'Brown', 'Teal'],
    'Tehuacan':                    ['White'],"""
if "'Teal Serpentine':" not in cv and target_cv in cv:
    cv = cv.replace(target_cv, rep_cv, 1)
    with open(path_cv, 'w', encoding='utf-8') as f:
        f.write(cv)
    print("Updated colorVocabulary.ts")

# 2. inventoryTaxonomy.ts
path_it = r'c:\Jouhayerk\git\app\src\lib\inventoryTaxonomy.ts'
with open(path_it, 'r', encoding='utf-8') as f:
    it = f.read()

target_it_variety = "    'Tehuacan',\n    'Zebra',"
rep_it_variety = "    'Teal Serpentine',\n    'Tehuacan',\n    'Zebra',"
if "'Teal Serpentine'" not in it and target_it_variety in it:
    it = it.replace(target_it_variety, rep_it_variety, 1)

target_it_norm = "    'tehuacan': 'Tehuacan',"
rep_it_norm = "    'teal serpentine': 'Teal Serpentine',\n    'teal': 'Teal',\n    'tehuacan': 'Tehuacan',"
if "'teal serpentine': 'Teal Serpentine'" not in it and target_it_norm in it:
    it = it.replace(target_it_norm, rep_it_norm, 1)

with open(path_it, 'w', encoding='utf-8') as f:
    f.write(it)
print("Updated inventoryTaxonomy.ts")

# 3. onyx826.ts
path_826 = r'c:\Jouhayerk\git\app\src\lib\taxonomy\onyx826.ts'
with open(path_826, 'r', encoding='utf-8') as f:
    t826 = f.read()

target_color_calc = "  const color = String(item.vendorColor || item.color || 'Onyx').trim();"
rep_color_calc = """  let color = String(item.vendorColor || item.color || 'Onyx').trim();
  color = color.replace(/\\bAqua\\b/gi, 'Teal');"""
if target_color_calc in t826:
    t826 = t826.replace(target_color_calc, rep_color_calc, 1)
    with open(path_826, 'w', encoding='utf-8') as f:
        f.write(t826)
    print("Updated onyx826.ts buildInvoiceTitle826")
