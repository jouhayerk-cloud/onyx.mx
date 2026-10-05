import sys, re

file_path = "C:/Jouhayerk/git/app/src/features/logistics/LabelWizard.tsx"
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Make NFCWizardContent
code = code.replace("export const NFCWizard: React.FC = () => {", "export const NFCWizardContent: React.FC = () => {")
# Remove createPortal from NFCWizardContent
code = re.sub(r'return createPortal\(\s*(<div className="lw-layer".*?</div>)\s*,\s*document\.body\s*\);', r'return \1;', code, flags=re.DOTALL)

# Make LabelWizardContent
code = code.replace("export const LabelWizard: React.FC = () => {", "export const LabelWizardContent: React.FC = () => {")
# LabelWizard uses Fragments because of PdfPreview
# We can just remove the createPortal wrapper
code = re.sub(r'return createPortal\(\s*(<>\s*\{\/\*.*?\*\/\}\s*<PdfPreview.*?</>)\s*,\s*document\.body\s*\);', r'return \1;', code, flags=re.DOTALL)

# Let's write the modified wrappers back so we don't break existing UI
wrappers = '''
export const NFCWizard: React.FC = () => {
    return createPortal(<NFCWizardContent />, document.body);
};
export const LabelWizard: React.FC = () => {
    return createPortal(<LabelWizardContent />, document.body);
};
'''
code += wrappers

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("success")
