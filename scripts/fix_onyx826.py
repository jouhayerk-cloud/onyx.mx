path = r'c:\Jouhayerk\git\app\src\lib\taxonomy\onyx826.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'sizeStr = ' in line and (' x ' in line):
        if 'Number(w) === Number(l)' in lines[i-1]:
            lines[i] = '      sizeStr = `${w} x ${h}`;\n'
        elif 'else' in lines[i-1]:
            lines[i] = '      sizeStr = `${w} x ${l} x ${h}`;\n'
        elif '} else if (w && l && h) {' in lines[i-1]:
            lines[i] = '    sizeStr = `${w} x ${l} x ${h}`;\n'

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('fix_onyx826 completed!')
