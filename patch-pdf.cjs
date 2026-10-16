const fs = require('fs');
let code = fs.readFileSync('src/components/PdfPreview.tsx', 'utf8');

code = code.replace(
    '<div className="fixed inset-0 z-[6500] bg-[#0a0a0a] animate-in fade-in duration-150 pointer-events-auto">',
    '<div className="fixed inset-0 z-[100100] bg-[#0a0a0a] animate-in fade-in duration-150 pointer-events-auto">'
);

fs.writeFileSync('src/components/PdfPreview.tsx', code, 'utf8');
console.log("Patched PdfPreview.");
