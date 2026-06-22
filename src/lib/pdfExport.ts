import { jsPDF } from 'jspdf';
import { getCleanImageUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData } from './utils';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { getVendorColor } from './excelStyles';
import { generateAxonometricDataUrl } from './axonometric';

// We accept a generalized artifact structure so different modules can use it
export interface CatalogArtifact {
    data: any;
    codes: {
        bookBarcode: string;
        bookBardcode?: string;
        bookAqCode?: string;
        bookLandCode?: string;
        bookRetail?: string;
        primaryPriceLabel?: string;
        primaryPriceValue?: string;
        [key: string]: any;
    };
    images: string[];
    exportType?: 'regular' | 'catalog';
}

interface ImgData { dataUrl: string; w: number; h: number; }

async function loadImgData(url: string, maxSize = 900): Promise<ImgData | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image(); el.crossOrigin = 'anonymous'; el.onload = () => resolve(el); el.onerror = reject; el.src = url; setTimeout(() => reject(new Error('timeout')), 8000);
        });
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w, h };
    } catch { return null; }
}

function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number) {
    doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cw, ch, 'F');
    const ir = img.w / img.h; const cr = cw / ch;
    let dw: number, dh: number;
    if (ir > cr) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
    doc.addImage(img.dataUrl, 'JPEG', cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
}

const toImp = (val: any, type: 'in' | 'lbs' | 'ft' = 'in') => {
    const v = parseFloat(val); if (!v || isNaN(v)) return '';
    if (type === 'lbs') return formatWeightImperialOnly(v);
    return cmToImperial(v);
};

async function drawHeader(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, exportType: 'regular' | 'catalog' = 'regular'): Promise<number> {
    const norm = normalizeInventoryData(item.data); 
    const codes = item.codes; 
    
    // Draw 3D Axonometric representation in the top right corner
    const wCm = parseFloat(norm.widthCm);
    const hCm = parseFloat(norm.heightCm);
    let dCm = parseFloat(norm.lengthCm);
    
    // Round objects often lack a depth dimension because depth = width
    if (!dCm && wCm) {
        dCm = wCm;
    }

    const shapeStr = norm.shape || '';
    const descStr = norm.shortDescription || norm.description || '';
    // Generate QR Code
    let qrDataUrl = '';
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode, { margin: 0, width: 200, color: { dark: '#000000', light: '#ffffff' } });
    } catch (e) { console.error('QR code err', e); }

    // Generate Barcode
    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode, { format: 'CODE128', displayValue: false, margin: 0, height: 40 });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) { console.error('Barcode err', e); }

    const qrSize = 16; // smaller QR code
    const axoSize = 45; // larger Axonometric box
    
    let currentRightX = PW - M;

    // Axonometric icon stays on the right
    if (wCm && hCm && dCm) {
        try {
            const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr);
            if (axoDataUrl) {
                currentRightX -= axoSize;
                doc.addImage(axoDataUrl, 'PNG', currentRightX, startY + 5, axoSize, axoSize);
            }
        } catch (e) {
            console.error("Failed to draw axonometric box", e);
        }
    }

    // QR Code moves to the left
    let textX = M + 4;
    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', M + 4, startY + 5, qrSize, qrSize);
        textX += qrSize + 6;
    }

    let currentY = startY + 5;

    // 1. BARCODE IMAGE - Moved ABOVE Tag ID and ACQ/LND codes
    if (barDataUrl) {
        doc.addImage(barDataUrl, 'PNG', textX, currentY, 50, 8); // smaller barcode
        currentY += 12;
    } else {
        currentY += 2;
    }
    
    // 2. TAG ID + VENDOR BUBBLE + TOP CODES
    // Font Size 2: 12 (Larger)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0); // Black

    const tagVColor = getVendorColor(barcode);
    const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
    doc.setFillColor(tagHexColor);
    doc.circle(textX + 2, currentY - 1, 2, 'F');
    
    const tagTextX = textX + 6;
    doc.text(barcode, tagTextX, currentY);
    
    // Add USD retail price next to ACQ and LND codes (numbers only)
    const retailNum = codes.bookRetail && codes.bookRetail !== '-' ? codes.bookRetail.toString().replace(/[^0-9.]/g, '') : '';
    const topCodesArr = [codes.bookAqCode, codes.bookLandCode, retailNum].filter(c => c && c !== '-');
    const topCodes = topCodesArr.join('  ·  ');
    
    if (topCodes) { 
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0); // Black
        doc.text(topCodes, tagTextX + doc.getTextWidth(barcode) + 16, currentY); 
    }
    
    currentY += 10;

    // 3. ITEM TITLE
    // Font Size 1: 22 (Larger)
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    
    doc.setFontSize(22); 
    doc.setFont('helvetica', 'bold'); 
    doc.setTextColor(0, 0, 0); // Black
    const titleLines = doc.splitTextToSize(nameStr.toUpperCase(), PW - textX - M - axoSize - 8);
    doc.text(titleLines, textX, currentY);
    
    currentY += titleLines.length * 9; // Adjust for next line based on number of wrapped lines
    
    // 4. VENDOR NAME + DETAILS (Color + Material)
    // Font Size 2: 12
    doc.setFontSize(12); 
    doc.setFont('helvetica', 'bold'); 
    doc.setTextColor(0, 0, 0); // Black

    let currentDX = textX;
    const vendorName = norm.vendor || '';
    if (vendorName) {
        const vColor = getVendorColor(vendorName);
        const hexColor = vColor.startsWith('FF') ? '#' + vColor.substring(2) : '#' + vColor;
        doc.setFillColor(hexColor);
        doc.circle(currentDX + 2, currentY - 1, 2, 'F');
        currentDX += 6;
        
        const vnUpper = vendorName.toUpperCase();
        doc.text(vnUpper, currentDX, currentY);
        currentDX += doc.getTextWidth(vnUpper) + 8;
    }

    const color = item.data.color || item.data.Color || '';
    const material = item.data.material || item.data.Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');

    if (detailStr) {
        doc.setFont('helvetica', 'normal'); 
        doc.setTextColor(0, 0, 0); // Black
        if (vendorName) {
            doc.text('·', currentDX, currentY);
            currentDX += doc.getTextWidth('·') + 8;
        }
        doc.text(detailStr.toUpperCase(), currentDX, currentY);
    }

    const lineY = currentY + 10;
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M + 4, lineY, PW - M, lineY);
    
    const specY = lineY + 14;
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
    const dimsImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
    const weightImp = toImp(norm.weightKg, 'lbs');

    const cols = [
        { label: 'QTY',        value: String(norm.quantity || 1), x: M + 4, accent: true },
        { label: 'DIMENSIONS', m: dimsMetric, i: (dimsMetric ? `(${dimsImp})` : ''), x: M + 50 },
        { label: 'WEIGHT',     m: (norm.weightKg ? `${norm.weightKg}kg` : ''), i: (norm.weightKg ? `(${weightImp})` : ''), x: M + 140 }
    ];
    
    cols.forEach((col: any) => {
        const cx = col.x;
        doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.text(col.label, cx, specY); // Black Labels
        
        if (col.label === 'DIMENSIONS' || col.label === 'WEIGHT') {
            doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); // Black Metric
            const mVal = col.m || '—';
            doc.text(mVal, cx, specY + 8);
            if (col.i && exportType !== 'regular') {
                doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); // Black Imperial
                doc.text(col.i, cx, specY + 14);
            }
        } else {
            doc.setFontSize(col.accent ? 22 : 14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(col.value, cx, specY + 10);
        }
    });

    doc.setDrawColor(235, 235, 235); doc.line(M + 4, specY + 22, PW - M, specY + 22);
    return specY + 30;
}

function drawHeaderCompact(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, pageNum: number, totalPages: number): number {
    const norm = normalizeInventoryData(item.data);
    const hY = startY + 4;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(`${item.codes.bookBarcodeDisplay || item.codes.bookBarcode || item.codes.bookTagId || '—'}  \xb7  PAGE ${pageNum} OF ${totalPages}`, M + 4, hY);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text((norm.shortDescription || norm.shape || 'Stone Piece').toUpperCase(), M + 4, hY + 8);
    doc.setDrawColor(245, 245, 245); doc.setLineWidth(0.2); doc.line(M + 4, hY + 9, PW - M, hY + 9);
    return hY + 12;
}

export async function exportCatalogPdf(
    results: CatalogArtifact[], 
    config: { title: string; method: 'grid' | 'single'; exportType?: 'regular' | 'catalog' },
    onProgress?: (p: number, s: string) => void,
    output: 'download' | 'blob' = 'download'
) {
    onProgress?.(5, 'Preparing Catalog...');
    const exportType = config.exportType || 'regular';
    const PW = 210, PH = 297, M = 12;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 200); 
        doc.text(config.title || 'Artifact Catalog', M + 4, PH - 8); 
        doc.text(`Page ${globalPageNum}`, PW - M, PH - 8, { align: 'right' }); 
    };

    let isFirstPage = true;
    const addPage = () => {
        if (isFirstPage) { isFirstPage = false; } else { doc.addPage(); }
        doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); 
        doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); 
        footer(doc);
    };

    const totalItems = results.length;
    let processedCount = 0;

    if (config.method === 'single') {
        // --- METHOD: ONE IMAGE PER PAGE ---
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            const imgs = item.images;
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);

            if (imgs.length === 0) {
                addPage();
                const specY = await drawHeader(doc, item, M, PW, M, exportType);
                doc.setFillColor(248, 248, 248); doc.rect(M + 4, specY + 4, PW - M * 2 - 4, PH - specY - 24, 'F');
                
                // Draw large axonometric icon in place of image
                const norm = normalizeInventoryData(item.data);
                const wCm = parseFloat(norm.widthCm);
                const hCm = parseFloat(norm.heightCm);
                let dCm = parseFloat(norm.lengthCm);
                if (!dCm && wCm) { dCm = wCm; }
                const shapeStr = norm.shape || '';
                const descStr = norm.shortDescription || norm.description || '';
                
                if (wCm && hCm && dCm) {
                    try {
                        const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr);
                        if (axoDataUrl) {
                            const cw = PW - M * 2 - 4;
                            const ch = PH - specY - 24;
                            const axoSize = Math.min(cw * 0.8, ch * 0.8, 160);
                            const axoX = M + 4 + (cw - axoSize) / 2;
                            const axoY = specY + 4 + (ch - axoSize) / 2;
                            doc.addImage(axoDataUrl, 'PNG', axoX, axoY, axoSize, axoSize);
                        }
                    } catch (e) {
                        console.error("Failed to draw large axonometric box", e);
                    }
                }
            } else {
                for (let j = 0; j < imgs.length; j++) {
                    addPage();
                    const specY = await drawHeader(doc, item, M, PW, M, exportType);
                    
                    const imgUrl = getCleanImageUrl(imgs[j]);
                    const d = await loadImgData(imgUrl, 1200);
                    const imgW = PW - M * 2 - 4;
                    const imgH = PH - specY - 24;
                    if (d) {
                        drawContain(doc, d, M + 4, specY + 4, imgW, imgH);
                    } else {
                        doc.setFillColor(248, 248, 248); doc.rect(M + 4, specY + 4, imgW, imgH, 'F');
                    }
                    
                    if (imgs.length > 1) {
                        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
                        doc.text(`IMAGE ${j + 1} OF ${imgs.length}`, PW - M, specY - 2, { align: 'right' });
                    }
                }
            }
        }
    } else {
        // --- METHOD: GRID CATALOG ---
        const simple = results.filter(r => r.images.length <= 2);
        const rich = results.filter(r => r.images.length > 2);
        const HW = (PW - M * 2 - 4) / 2; const HG = 4;

        for (let i = 0; i < simple.length; i += 2) {
            addPage();
            doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.2); doc.line(M + HW + HG / 2, M, M + HW + HG / 2, PH - M);
            for (let slot = 0; slot < 2; slot++) {
                const item = simple[i + slot]; if (!item) break;
                processedCount++;
                onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
                const norm = normalizeInventoryData(item.data); 
                const codes = item.codes; const sx = M + slot * (HW + HG);
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—', sx + 2, M + 6);
                const shape = norm.shape || '';
                const desc = norm.shortDescription || '';
                const nameStr = (shape && desc && shape !== desc) ? `${shape} - ${desc}` : (shape || desc || 'Stone Piece');
                doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(nameStr.toUpperCase(), sx + 2, M + 13, { maxWidth: HW - 4 });
                
                const color = item.data.color || item.data.Color || '';
                const material = item.data.material || item.data.Material || '';
                const detailStr = [color, material].filter(Boolean).join(' · ');
                if (detailStr) {
                    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
                    doc.text(detailStr.toUpperCase(), sx + 2, M + 18);
                }

                doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(sx + 2, M + 21, sx + HW - 2, M + 21);
                
                const gridPriceLabel = codes.primaryPriceLabel || (exportType === 'regular' ? 'ACQUISITION COST' : '');
                const gridPriceValue = codes.primaryPriceValue || (codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—');
                
                doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100); doc.text(gridPriceLabel, sx + 2, M + 26);
                doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(gridPriceValue, sx + 2, M + 33);
                
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
                const dimsM = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
                const dimsMStr = dimsM ? `${dimsM}cm` : '—';
                const dimsI = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
                const weightMStr = norm.weightKg ? `${norm.weightKg}kg` : '—';
                const weightIStr = norm.weightKg ? `(${toImp(norm.weightKg, 'lbs')})` : '';

                // Dimensions (Two lines)
                doc.text(dimsMStr, sx + 2, M + 39);
                if (dimsMStr !== '—' && exportType !== 'regular') {
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
                    doc.text(`(${dimsI})`, sx + 2, M + 44);
                }

                // Weight (Two lines)
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
                doc.text(weightMStr, sx + 2, M + 51);
                if (weightMStr !== '—' && exportType !== 'regular') {
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
                    doc.text(weightIStr, sx + 2, M + 56);
                }

                const wCm = parseFloat(norm.widthCm);
                const hCm = parseFloat(norm.heightCm);
                let dCm = parseFloat(norm.lengthCm);
                if (!dCm && wCm) { dCm = wCm; }
                const shapeStr = norm.shape || '';
                const descStr = norm.shortDescription || norm.description || '';
                let axoDataUrl = null;
                if (wCm && hCm && dCm) {
                    try { axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr); } catch (e) {}
                }

                const imgTop = M + 58; const imgH = PH - imgTop - 14; const imgW = HW - 4; const imgs = item.images;
                if (imgs.length === 0) { 
                    doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); 
                    if (axoDataUrl) {
                        const axoSize = Math.min(imgW, imgH) * 0.8;
                        doc.addImage(axoDataUrl, 'PNG', sx + 2 + (imgW - axoSize) / 2, imgTop + (imgH - axoSize) / 2, axoSize, axoSize);
                    }
                }
                else if (imgs.length === 1) { 
                    const d = await loadImgData(getCleanImageUrl(imgs[0])); 
                    if (d) drawContain(doc, d, sx + 2, imgTop, imgW, imgH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); } 
                    if (axoDataUrl) {
                        const axoSize = 35;
                        doc.addImage(axoDataUrl, 'PNG', sx + 2 + imgW - axoSize - 4, imgTop + imgH - axoSize - 4, axoSize, axoSize);
                    }
                }
                else { 
                    const cellH = (imgH - 2) / 2; 
                    for (let j = 0; j < 2; j++) { 
                        const cy = imgTop + j * (cellH + 2); 
                        const d = await loadImgData(getCleanImageUrl(imgs[j])); 
                        if (d) drawContain(doc, d, sx + 2, cy, imgW, cellH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, cy, imgW, cellH, 'F'); } 
                    } 
                    if (axoDataUrl) {
                        const axoSize = 35;
                        doc.addImage(axoDataUrl, 'PNG', sx + 2 + imgW - axoSize - 4, imgTop + imgH - axoSize - 4, axoSize, axoSize);
                    }
                }
            }
        }
        
        for (let i = 0; i < rich.length; i++) {
            const item = rich[i]; const imgs = item.images; const n = imgs.length;
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            const CHUNK = 12; // 4 columns x 3 rows
            const totalPagesForItem = Math.ceil(n / CHUNK);
            
            for (let p = 0; p < totalPagesForItem; p++) {
                addPage();
                
                let imgTop = 0;
                if (p === 0) {
                    imgTop = drawHeader(doc, item, M, PW, M, exportType);
                } else {
                    imgTop = drawHeaderCompact(doc, item, M, PW, M, p + 1, totalPagesForItem);
                }
                
                const imgH = PH - imgTop - 14; const imgW = PW - M * 2 - 4;
                const currentChunk = imgs.slice(p * CHUNK, (p + 1) * CHUNK);
                const numInChunk = currentChunk.length;
                
                let cols = 2, rows = 1;
                if (numInChunk <= 4) { cols = 2; rows = Math.ceil(numInChunk / 2); }
                else if (numInChunk <= 6) { cols = 3; rows = 2; }
                else if (numInChunk <= 9) { cols = 3; rows = 3; }
                else { cols = 4; rows = 3; }
                
                const GAP = 2; 
                const cellW = (imgW - GAP * (cols - 1)) / cols; 
                const cellH = (imgH - GAP * (rows - 1)) / rows;
                
                for (let j = 0; j < numInChunk; j++) {
                    const cx = M + 4 + (j % cols) * (cellW + GAP);
                    const cy = imgTop + Math.floor(j / cols) * (cellH + GAP);
                    const d = await loadImgData(getCleanImageUrl(currentChunk[j]));
                    if (d) drawContain(doc, d, cx, cy, cellW, cellH);
                    else { doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cellW, cellH, 'F'); }
                }
            }
        }
    }
    onProgress?.(95, 'Finalizing Catalogue...');
    
    if (output === 'blob') {
        const blob = doc.output('blob');
        onProgress?.(100, 'Catalogue Ready');
        return blob;
    }

    const safeTitle = (config.title || 'ArtOfDecor').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
    doc.save(`${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`);
    onProgress?.(100, 'Catalogue Downloaded');
}
