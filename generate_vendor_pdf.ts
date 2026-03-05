import { jsPDF } from "jspdf";
import * as fs from "fs";

function hexToRgb(hex) {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

const vendors = [
    { code: "JM", hex: "#6BCEBB", name: "Jose Meza" },
    { code: "EM", hex: "#00AEEF", name: "Emmanuel de los Santos" },
    { code: "CA", hex: "#85C1E9", name: "Carlos Arenas" },
    { code: "AN", hex: "#FFED00", name: "Angel Cabrera" },
    { code: "SU", hex: "#B19CD9", name: "Susana" },
    { code: "TE", hex: "#FFCB05", name: "Tellez Taller" },
    { code: "DH", hex: "#8DC63F", name: "Delfini Hernandez" },
    { code: "ML", hex: "#F9A17A", name: "Maria Luisa" },
    { code: "GE", hex: "#F7941D", name: "Gerardo De Gante" },
    { code: "FR", hex: "#F36F21", name: "Fountain Rock" },
    { code: "ET", hex: "#636466", name: "Eduardo Tellez" },
    { code: "AM", hex: "#800020", name: "Alejandro Meza" },
    { code: "BT", hex: "#603913", name: "Bernardo" },
    { code: "RF", hex: "#00A591", name: "Roberto Florita" },
    { code: "GS", hex: "#D11C7E", name: "Gift Store" },
    { code: "CP", hex: "#A01E5D", name: "Cantera Puebla" }
];

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

// Grid settings (2x4 per page? or 3x4? Let's try to fit all on one page if possible, but Pantone cards are tall)
// To keep "Full Page" and fit 16 swatches, 4x4 is best.
const cols = 4;
const rows = 4;
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
doc.text("ONYX.MX LOGISTICS & SUPPLY CHAIN CHROMATIC SYSTEM © 2026", 0.5, 10.7);

const buffer = doc.output("arraybuffer");
fs.writeFileSync("VendorCodesPRINT.pdf", Buffer.from(buffer));
console.log("Pantone Style PDF generated successfully!");
