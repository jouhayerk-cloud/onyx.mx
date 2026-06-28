import os
import re

files = [
    r'c:\Jouhayerk\git\app\src\features\dashboard\ShippingView.tsx',
    r'c:\Jouhayerk\git\app\src\features\logistics\CratePackingWorkspace.tsx',
    r'c:\Jouhayerk\git\app\src\features\logistics\SentTruckViewer.tsx',
    r'c:\Jouhayerk\git\app\src\features\onyx\BotOrbVisuals.tsx',
    r'c:\Jouhayerk\git\app\src\features\threed\ThreeDView.tsx',
    r'c:\Jouhayerk\git\app\src\features\workbook\WorkbookShippingView.tsx'
]

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'const handleResize = () => {' in content:
        pattern = re.compile(r'(const handleResize = \(\) => \{)(.*?)(^\s*\};)', re.DOTALL | re.MULTILINE)
        
        def replacer(match):
            body = match.group(2)
            indent = match.group(3).replace('};', '')
            new_body = body + indent + '}, 100) as unknown as number;\n'
            return 'let timeoutId: number;\n' + indent + match.group(1) + '\n' + indent + '    clearTimeout(timeoutId);\n' + indent + '    timeoutId = window.setTimeout(() => {' + new_body + match.group(3)
            
        new_content = pattern.sub(replacer, content)
        
        new_content = new_content.replace(
            "window.removeEventListener('resize', handleResize);",
            "window.removeEventListener('resize', handleResize);\n            clearTimeout(timeoutId);"
        )
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            print(f'Updated {file_path}')

with open(r'c:\Jouhayerk\git\app\src\features\logistics\DeployedView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
if 'const updateScale = () => {' in content:
    pattern = re.compile(r'(const updateScale = \(\) => \{)(.*?)(^\s*\};)', re.DOTALL | re.MULTILINE)
    def replacer(match):
        body = match.group(2)
        indent = match.group(3).replace('};', '')
        new_body = body + indent + '}, 100) as unknown as number;\n'
        return 'let timeoutId: number;\n' + indent + match.group(1) + '\n' + indent + '    clearTimeout(timeoutId);\n' + indent + '    timeoutId = window.setTimeout(() => {' + new_body + match.group(3)
        
    new_content = pattern.sub(replacer, content)
    new_content = new_content.replace(
        "window.removeEventListener('resize', updateScale);",
        "window.removeEventListener('resize', updateScale);\n            clearTimeout(timeoutId);"
    )
    with open(r'c:\Jouhayerk\git\app\src\features\logistics\DeployedView.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
        print('Updated DeployedView updateScale')
