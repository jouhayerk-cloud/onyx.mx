import re

# 1. src/lib/colorExtractor.ts
path_ce = r'c:\Jouhayerk\git\app\src\lib\colorExtractor.ts'
with open(path_ce, 'r', encoding='utf-8') as f:
    ce = f.read()

target_allowed = '"Tan",\n    "Turquoise/Aqua",'
rep_allowed = '"Tan",\n    "Teal",\n    "Turquoise/Aqua",'
assert target_allowed in ce, "target_allowed not found in colorExtractor.ts"
ce = ce.replace(target_allowed, rep_allowed, 1)

target_palette = '{ name: "Blue", rgb: [30, 100, 220] },\n    { name: "Turquoise/Aqua", rgb: [64, 224, 208] },'
rep_palette = '{ name: "Blue", rgb: [30, 100, 220] },\n    { name: "Teal", rgb: [0, 128, 128] },\n    { name: "Turquoise/Aqua", rgb: [64, 224, 208] },'
assert target_palette in ce, "target_palette not found in colorExtractor.ts"
ce = ce.replace(target_palette, rep_palette, 1)

target_stone = """    if (combined.includes('aqua') || combined.includes('blue') || combined.includes('azul') || combined.includes('turquoise')) {
        return ["Turquoise/Aqua", "Brown", "Tan"];
    }"""
rep_stone = """    if (combined.includes('aqua')) {
        return ["Tan", "Brown", "Teal"];
    }
    if (combined.includes('blue') || combined.includes('azul') || combined.includes('argentin')) {
        return ["Blue", "Brown", "Tan"];
    }
    if (combined.includes('turquoise') || combined.includes('teal')) {
        return ["Tan", "Brown", "Teal"];
    }"""
assert target_stone in ce, "target_stone not found in colorExtractor.ts"
ce = ce.replace(target_stone, rep_stone, 1)

with open(path_ce, 'w', encoding='utf-8') as f:
    f.write(ce)
print("Updated colorExtractor.ts")

# 2. src/lib/colorVocabulary.ts
path_cv = r'c:\Jouhayerk\git\app\src\lib\colorVocabulary.ts'
with open(path_cv, 'r', encoding='utf-8') as f:
    cv = f.read()

target_aqua = """    'Aqua':                        ['Turquoise/Aqua', 'Tan', 'Yellow'],
    'Aqua Serpentine':             ['Tan', 'Brown', 'Turquoise/Aqua'],"""
rep_aqua = """    'Aqua':                        ['Tan', 'Brown', 'Teal'],
    'Aqua Serpentine':             ['Tan', 'Brown', 'Teal'],"""
assert target_aqua in cv, "target_aqua not found in colorVocabulary.ts"
cv = cv.replace(target_aqua, rep_aqua, 1)

target_blue = "    'Blue':                        ['Blue'],"
rep_blue = """    'Blue':                        ['Blue'],
    'Blue Argentina':              ['Blue', 'Brown', 'Tan'],"""
assert target_blue in cv, "target_blue not found in colorVocabulary.ts"
cv = cv.replace(target_blue, rep_blue, 1)

with open(path_cv, 'w', encoding='utf-8') as f:
    f.write(cv)
print("Updated colorVocabulary.ts")

# 3. src/lib/inventoryTaxonomy.ts
path_it = r'c:\Jouhayerk\git\app\src\lib\inventoryTaxonomy.ts'
with open(path_it, 'r', encoding='utf-8') as f:
    it = f.read()

target_can = "    'Tan',\n    'Turquoise/Aqua',"
rep_can = "    'Tan',\n    'Teal',\n    'Turquoise/Aqua',"
if target_can in it:
    it = it.replace(target_can, rep_can, 1)
    with open(path_it, 'w', encoding='utf-8') as f:
        f.write(it)
    print("Updated inventoryTaxonomy.ts")
else:
    print("inventoryTaxonomy.ts target not found, skipping")

# 4. src/lib/taxonomy/onyx826.ts
path_826 = r'c:\Jouhayerk\git\app\src\lib\taxonomy\onyx826.ts'
with open(path_826, 'r', encoding='utf-8') as f:
    t826 = f.read()

target_sub = "substitutions: { 'Turquoise/Aqua': 'Blue' } as const,"
rep_sub = "substitutions: { 'Turquoise/Aqua': 'Teal' } as const,"
assert target_sub in t826, "target_sub not found in onyx826.ts"
t826 = t826.replace(target_sub, rep_sub, 1)

target_sub_func = "if (sub === 'Turquoise/Aqua') sub = 'Blue';"
rep_sub_func = "if (sub === 'Turquoise/Aqua') sub = 'Teal';"
assert target_sub_func in t826, "target_sub_func not found in onyx826.ts"
t826 = t826.replace(target_sub_func, rep_sub_func, 1)

with open(path_826, 'w', encoding='utf-8') as f:
    f.write(t826)
print("Updated onyx826.ts")

# 5. src/features/core/MainHeader.tsx
path_mh = r'c:\Jouhayerk\git\app\src\features/core/MainHeader.tsx'
with open(path_mh, 'r', encoding='utf-8') as f:
    mh = f.read()

target_mh = "    'Turquoise/Aqua': 'Blue',"
rep_mh = "    'Turquoise/Aqua': 'Teal',"
assert target_mh in mh, "target_mh not found in MainHeader.tsx"
mh = mh.replace(target_mh, rep_mh, 1)

with open(path_mh, 'w', encoding='utf-8') as f:
    f.write(mh)
print("Updated MainHeader.tsx")
