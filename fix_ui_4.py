import re

with open('src/features/inventory/BatchProcessingWizard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Change the outer grid back to a flex column!
content = content.replace('grid grid-cols-1 xl:grid-cols-2 gap-6 items-start', 'flex flex-col gap-6 items-stretch')

with open('src/features/inventory/BatchProcessingWizard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(" Done\)