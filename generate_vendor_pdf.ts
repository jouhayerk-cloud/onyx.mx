import { jsPDF } from "jspdf";
import * as fs from "fs";

function hexToRgb(hex: string) {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

const vendorsObj = {
  AM: { name: 'ALEJANDRO MEZA', color: '#A89285' },
  AN: { name: 'ANGEL CABRERA', color: '#FFED00' },
  BT: { name: 'BERNARDO', color: '#603913' },
  CA: { name: 'CARLOS ARENAS', color: '#85C1E9' },
  CP: { name: 'CANTERA PUEBLA', color: '#A01E5D' },
  DH: { name: 'DELFINO HERNANDEZ', color: '#8DC63F' },
  EM: { name: 'EMMANUEL DE LOS SANTOS', color: '#00AEEF' },
  ET: { name: 'EDUARDO TELLEZ', color: '#636466' },
  FR: { name: 'FOUNTAIN ROCK', color: '#F36F21' },
  GE: { name: 'GERARDO DE GANTE', color: '#F7941D' },
  GM: { name: 'GEMA MARTIN', color: '#E6194B' },
  GS: { name: 'GIFT STORE', color: '#D11C7E' },
  IH: { name: 'ISMAEL HUERTA', color: '#F3FF94' },
  JM: { name: 'JOSE MEZA', color: '#6BCEBB' },
  ML: { name: 'MARIA LUISA', color: '#F9A17A' },
  MM: { name: 'MARGARITA MEZA', color: '#911EB4' },
  RF: { name: 'ROBERTO FLORITA', color: '#00A591' },
  SU: { name: 'SUSANA', color: '#B19CD9' },
  TE: { name: 'TELLEZ TALLER', color: '#FFCB05' },
};

const vendorKeys = Object.keys(vendorsObj).sort();
const vendors = vendorKeys.map(k => ({ code: k, hex: vendorsObj[k as keyof typeof vendorsObj].color, name: vendorsObj[k as keyof typeof vendorsObj].name }));

const doc = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: "letter"
});

// Header
doc.setFont("helvetica", "bold");
doc.setFontSize(28);
doc.setTextColor(0, 0, 0);
doc.text("ONYX CHROMATIC IDENTITY", 0.5, 0.8);

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(120, 120, 120);
doc.text("LOGISTICS VENDOR MASTER GUIDE | PANTONE STYLE", 0.5, 1.0);

// Grid settings (20 items - we need 4x5 grid)
const cols = 4;
const rows = 5;
const marginX = 0.5;
const marginY = 1.3;
const spacing = 0.2;
const cardWidth = (8.5 - 2 * marginX - (cols - 1) * spacing) / cols;
const cardHeight = (11 - marginY - 0.7 - (rows - 1) * spacing) / rows;

vendors.forEach((vendor, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = marginX + col * (cardWidth + spacing);
    const y = marginY + row * (cardHeight + spacing);

    // Card Background/Border
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.01);
    doc.rect(x, y, cardWidth, cardHeight, "S");

    // Pantone Swatch (Top Part)
    const [r, g, b] = hexToRgb(vendor.hex);
    doc.setFillColor(r, g, b);
    doc.rect(x, y, cardWidth, cardHeight * 0.65, "F");

    // Text Area (Bottom Part)
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14); // Slightly smaller code for better balance
    doc.text(vendor.code, x + 0.12, y + cardHeight * 0.76);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);
    doc.text(vendor.name.toUpperCase(), x + 0.12, y + cardHeight * 0.84);

    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(vendor.hex, x + 0.12, y + cardHeight - 0.15);
});

// Footer
doc.setDrawColor(200, 200, 200);
doc.line(0.5, 10.5, 8.0, 10.5);

doc.setFont("helvetica", "normal");
doc.setFontSize(8);
doc.setTextColor(150, 150, 150);
doc.text("ONYX.MX LOGISTICS & SUPPLY CHAIN CHROMATIC SYSTEM Ac 2026", 0.5, 10.7);

const buffer = doc.output("arraybuffer");
fs.writeFileSync("c:\\Jouhayerk\\VendorColorsPRINT.pdf", Buffer.from(buffer));
console.log("Pantone Style PDF generated successfully!");
