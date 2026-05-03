import re

with open(r'c:\Jouhayerk\git\app\src\features\logistics\CratePackingManager.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Only analyze the content from the start of return createPortal
portal_match = re.search(r'return createPortal\(', content)
if portal_match:
    portal_content = content[portal_match.start():]
    
    tags = ['div', 'button', 'span', 'p', 'h1', 'h2', 'h3', 'section', 'header', 'footer']
    
    for tag in tags:
        # Count <tag ... > (not <tag ... />)
        open_pattern = rf'<{tag}(?:\s+[^>]*?)?(?<!/)>'
        close_pattern = rf'</{tag}>'
        
        opens = len(re.findall(open_pattern, portal_content))
        closes = len(re.findall(close_pattern, portal_content))
        
        print(f"{tag.capitalize()}: Opens={opens}, Closes={closes}, Diff={opens-closes}")
else:
    print("createPortal not found")

# Check for braces in the whole file
open_braces = len(re.findall(r'{', content))
close_braces = len(re.findall(r'}', content))
print(f"Braces: Opens={open_braces}, Closes={close_braces}, Diff={open_braces-close_braces}")
