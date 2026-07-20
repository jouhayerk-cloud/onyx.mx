import re

with open('src/features/inventory/BatchProcessingWizard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I will use multi_replace_file_content instead of Python to avoid any powershell escaping issues.