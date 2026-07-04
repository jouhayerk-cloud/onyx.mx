import re

with open(r'C:\Jouhayerk\git\app\src\lib\pdfExport.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Make QR Size, Tag ID, and Axo Size larger, remove vendor circle
def replace_header_logic(text):
    # Change sizes
    text = text.replace('const qrSize = 16;', 'const qrSize = 32;')
    text = text.replace('const axoSize = 22;', 'const axoSize = 44;')
    
    # Increase Barcode spacing and adjust placement
    # 1. BARCODE IMAGE
    text = re.sub(r"doc\.addImage\(barDataUrl, 'PNG', textX, currentY, 55, 8\);.*?currentY \+= 13;", 
                  "doc.addImage(barDataUrl, 'PNG', textX, currentY, 70, 10);\n        currentY += 15;", text, flags=re.DOTALL)
    
    # Increase Tag ID font size
    text = text.replace("doc.setFontSize(13);\n    doc.setFont('helvetica', 'bold');\n    doc.setTextColor(20, 20, 20); // Black\n    doc.text(barcode, textX, currentY);", 
                        "doc.setFontSize(22);\n    doc.setFont('helvetica', 'bold');\n    doc.setTextColor(20, 20, 20);\n    doc.text(barcode, textX, currentY);")
    
    # Remove vendor circle
    vendor_circle_logic = """        const vColor = getVendorColor(vendorName);
        const hexColor = vColor.startsWith('FF') ? '#' + vColor.substring(2) : '#' + vColor;
        doc.setFillColor(hexColor);
        doc.circle(currentDX + 2, currentY - 1, 2, 'F');
        currentDX += 6;"""
    text = text.replace(vendor_circle_logic, "")
    
    return text

new_content = replace_header_logic(content)

with open(r'C:\Jouhayerk\git\app\src\lib\pdfExport.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Modified pdfExport.ts")
