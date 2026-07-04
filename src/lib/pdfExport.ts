import { jsPDF } from 'jspdf';
import { getCleanImageUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData } from './utils';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { getVendorColor } from './excelStyles';
import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';

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

async function loadImgData(url: string, maxSize = 900, keepPng = false): Promise<ImgData | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image(); el.crossOrigin = 'anonymous'; el.onload = () => resolve(el); el.onerror = reject; el.src = url; setTimeout(() => reject(new Error('timeout')), 8000);
        });
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.88), w, h };
    } catch { return null; }
}

function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number, scale = 1.0) {
    // doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cw, ch, 'F');
    const ir = img.w / img.h; const cr = cw / ch;
    let dw: number, dh: number;
    if (ir > cr) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
    dw *= scale; dh *= scale;
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
    const shapeStr = norm.shape || '';
    const descStr = norm.shortDescription || norm.description || '';
    let wCm = parseFloat(norm.widthCm) || 0;
    let hCm = parseFloat(norm.heightCm) || 0;
    let dCm = parseFloat(norm.lengthCm) || 0;
    
    if (wCm || hCm || dCm) {
        if (!wCm) wCm = dCm || hCm || 10;
        if (!hCm) hCm = shapeStr.toLowerCase().includes('plate') ? 5 : wCm;
        if (!dCm) dCm = wCm;
    }
    // Generate QR Code
    let qrDataUrl = '';
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) { console.error('QR code err', e); }

    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 40, lineColor: '#141414' });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) { console.error('Barcode err', e); }

    const qrSize = 16; // smaller QR code
    const axoSize = 22; // smaller Axonometric box in the corner
    
    let currentRightX = PW - M;

    // Axonometric icon stays on the right
    if (wCm || hCm || dCm) {
        try {
            const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data), true);
            if (axoDataUrl) {
                currentRightX -= axoSize;
                doc.addImage(axoDataUrl, 'JPEG', currentRightX, startY + 3, axoSize, axoSize);
            }
        } catch (e) {
            console.error("Failed to draw axonometric box", e);
        }
    }    // QR Code moves to the left
    let textX = M + 4;
    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', M + 4, startY + 5, qrSize, qrSize);
        
        // VENDOR BUBBLE INSIDE QR CODE
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        
        const qrCenterX = M + 4 + qrSize / 2;
        const qrCenterY = startY + 5 + qrSize / 2;
        
        // Draw white background circle to punch out the QR code pixels
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 2.2, 'F');
        
        // Draw the vendor color bubble
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 1.8, 'F');
        
        textX += qrSize + 6;
    }

    let currentY = startY + 5;

    // 1. BARCODE IMAGE
    if (barDataUrl) {
        doc.addImage(barDataUrl, 'PNG', textX, currentY, 55, 8); // Slightly wider barcode
        currentY += 13;
    } else {
        currentY += 2;
    }
    
    // 2. TAG ID + TOP CODES
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20); // Black
    doc.text(barcode, textX, currentY);
    
    // Combine ACQ code and retail (e.g. FMO11958)
    const retailNum = codes.bookRetail && codes.bookRetail !== '-' ? codes.bookRetail.toString().replace(/[^0-9.]/g, '') : '';
    const topCodes = `${codes.bookAqCode || ''}${retailNum}`.trim();
    
    if (topCodes) { 
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120); // Gray for secondary visual hierarchy
        doc.text(topCodes, textX + doc.getTextWidth(barcode) + 12, currentY); 
    }
    
    currentY += 6;

    // Draw subtle separation line below the top codes
    // doc.setDrawColor(240, 240, 240);
    // doc.setLineWidth(0.4);
    // doc.line(textX, currentY, PW - M - axoSize - 4, currentY);
    
    currentY += 9;

    // 4. ITEM TITLE AND QTY
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    
    // Draw QTY indicator below QR Code
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('QTY', M + 4, currentY - 6);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(String(norm.quantity || 1), M + 4, currentY);
    
    doc.setFontSize(22); 
    doc.setFont('helvetica', 'bold'); 
    doc.setTextColor(20, 20, 20); // Black
    const titleLines = doc.splitTextToSize(nameStr.toUpperCase(), PW - textX - M - axoSize - 8);
    doc.text(titleLines, textX, currentY);
    
    currentY += titleLines.length * 7; // Adjust for next line based on number of wrapped lines
    
    // 4. VENDOR NAME + DETAILS (Color + Material)
    // Font Size 2: 12
    doc.setFontSize(12); 
    doc.setFont('helvetica', 'bold'); 
    doc.setTextColor(20, 20, 20); // Black

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
        doc.setTextColor(20, 20, 20); // Black
        if (vendorName) {
            doc.text('·', currentDX, currentY);
            currentDX += doc.getTextWidth('·') + 8;
        }
        doc.text(detailStr.toUpperCase(), currentDX, currentY);
    }

    const lineY = currentY + 6;
    
    const specY = lineY + 8;
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
    const dimsImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
    const weightImp = toImp(norm.weightKg, 'lbs');

    const cols = [
        { label: 'DIMENSIONS', m: dimsMetric, i: (dimsMetric ? `(${dimsImp})` : ''), x: M + 4 },
        { label: 'WEIGHT',     m: (norm.weightKg ? `${norm.weightKg}kg` : ''), i: (norm.weightKg ? `(${weightImp})` : ''), x: M + 90 }
    ];
    
    cols.forEach((col: any) => {
        const cx = col.x;
        doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20); doc.text(col.label, cx, specY); // Black Labels
        
        if (col.label === 'DIMENSIONS' || col.label === 'WEIGHT') {
            doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20); // Black Metric
            const mVal = col.m || '—';
            doc.text(mVal, cx, specY + 8);
            if (col.i && exportType !== 'regular') {
                doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20); // Black Imperial
                doc.text(col.i, cx, specY + 14);
            }
        } else {
            doc.setFontSize(col.accent ? 22 : 14); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20); doc.text(col.value, cx, specY + 10);
        }
    });

    // doc.setDrawColor(235, 235, 235); doc.line(M + 4, specY + 18, PW - M, specY + 18);
    return specY + 18;
}

function drawHeaderCompact(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, pageNum: number, totalPages: number): number {
    const norm = normalizeInventoryData(item.data);
    const hY = startY + 4;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(`${item.codes.bookBarcodeDisplay || item.codes.bookBarcode || item.codes.bookTagId || '—'}  \xb7  PAGE ${pageNum} OF ${totalPages}`, M + 4, hY);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text((norm.shortDescription || norm.shape || 'Stone Piece').toUpperCase(), M + 4, hY + 8);
    doc.setDrawColor(245, 245, 245); doc.setLineWidth(0.2); doc.line(M + 4, hY + 9, PW - M, hY + 9);
    return hY + 12;
}

import { ART_OF_DECOR_LOGO } from './artOfDecorLogo';

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
    
    let logoData: ImgData | null = null;
    if (config.method === 'single') {
        logoData = await loadImgData(ART_OF_DECOR_LOGO, 400, true);
    }
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        
        if (config.method === 'single') {
            doc.setFontSize(11);
            const madeText = 'Made in Mexico for';
            doc.setTextColor(20, 20, 20);
            const tw = doc.getTextWidth(madeText);
            
            let logoW = 0;
            let logoH = 0;
            if (logoData) {
                logoH = 4.8; 
                logoW = logoData.w * (logoH / logoData.h);
            }
            
            const rightEdge = PW - M;
            
            const textX = rightEdge - tw;
            doc.text(madeText, textX, PH - 23);
            
            if (logoData) {
                const logoX = rightEdge - logoW;
                doc.addImage(logoData.dataUrl, 'PNG', logoX, PH - 21.5, logoW, logoH);
            }
        }
        
        // Page numbers removed as requested
    };

    let isFirstPage = true;
    const addPage = () => {
        if (isFirstPage) { isFirstPage = false; } else { doc.addPage(); }
        doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); 
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
                const specY = await drawHeader(doc, item, M, PW, M - 6, exportType);
                // Gray background removed to prevent overlapping footer
                
                // Draw large axonometric icon in place of image
                const norm = normalizeInventoryData(item.data);
                const shapeStr = norm.shape || '';
                const descStr = norm.shortDescription || norm.description || '';
                let wCm = parseFloat(norm.widthCm) || 0;
                let hCm = parseFloat(norm.heightCm) || 0;
                let dCm = parseFloat(norm.lengthCm) || 0;
                
                if (wCm || hCm || dCm) {
                    if (!wCm) wCm = dCm || hCm || 10;
                    if (!hCm) hCm = shapeStr.toLowerCase().includes('plate') ? 5 : wCm;
                    if (!dCm) dCm = wCm;

                    try {
                        const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data), true);
                        if (axoDataUrl) {
                            const cw = PW - M * 2 - 4;
                            const ch = PH - specY - 28;
                            const axoSize = Math.min(cw * 0.8, ch * 0.8, 160);
                            const axoX = M + 4 + (cw - axoSize) / 2;
                            const axoY = specY + 4 + (ch - axoSize) / 2;
                            doc.addImage(axoDataUrl, 'JPEG', axoX, axoY, axoSize, axoSize);
                        }
                    } catch (e) {
                        console.error("Failed to draw large axonometric box", e);
                    }
                }
            } else {
                for (let j = 0; j < imgs.length; j++) {
                    addPage();
                    const specY = await drawHeader(doc, item, M, PW, M - 6, exportType);
                    
                    const imgUrl = getCleanImageUrl(imgs[j]);
                    const d = await loadImgData(imgUrl, 1200);
                    const imgW = PW - M * 2 - 4;
                    const imgH = PH - specY - 24;
                    if (d) {
                        drawContain(doc, d, M + 4, specY + 4, imgW, imgH, 0.90);
                    } else {
                        // doc.setFillColor(248, 248, 248); doc.rect(M + 4, specY + 4, imgW, imgH, 'F');
                    }
                    if (imgs.length > 1) {
                        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
                        doc.text(`${j + 1} OF ${imgs.length}`, PW - M, M + 2, { align: 'right' });
                    }
                }
            }
        }
    } else {
        // --- METHOD: GRID CATALOG ---
        // Unified grid layout: ALL items use the full detailed header, with a smart grid of images below.
        for (let i = 0; i < results.length; i++) {
            const item = results[i]; 
            const imgs = item.images; 
            const n = imgs.length;
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            
            if (n === 0) {
                // Item with NO images - draw header and large axometric icon
                addPage();
                const specY = await drawHeader(doc, item, M, PW, M - 6, exportType);
                // Gray background removed to prevent overlapping footer
                
                const norm = normalizeInventoryData(item.data);
                const shapeStr = norm.shape || '';
                const descStr = norm.shortDescription || norm.description || '';
                let wCm = parseFloat(norm.widthCm) || 0;
                let hCm = parseFloat(norm.heightCm) || 0;
                let dCm = parseFloat(norm.lengthCm) || 0;
                
                if (wCm || hCm || dCm) {
                    if (!wCm) wCm = dCm || hCm || 10;
                    if (!hCm) hCm = shapeStr.toLowerCase().includes('plate') ? 5 : wCm;
                    if (!dCm) dCm = wCm;

                    try {
                        const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data), true);
                        if (axoDataUrl) {
                            const cw = PW - M * 2 - 4;
                            const ch = PH - specY - 28;
                            const axoSize = Math.min(cw * 0.8, ch * 0.8, 160);
                            const axoX = M + 4 + (cw - axoSize) / 2;
                            const axoY = specY + 4 + (ch - axoSize) / 2;
                            doc.addImage(axoDataUrl, 'JPEG', axoX, axoY, axoSize, axoSize);
                        }
                    } catch (e) {}
                }
                continue;
            }

            const CHUNK = 12; // 4 columns x 3 rows max per page
            const totalPagesForItem = Math.ceil(n / CHUNK);
            
            for (let p = 0; p < totalPagesForItem; p++) {
                addPage();
                
                let imgTop = 0;
                if (p === 0) {
                    imgTop = await drawHeader(doc, item, M, PW, M - 6, exportType);
                } else {
                    imgTop = drawHeaderCompact(doc, item, M, PW, M - 6, p + 1, totalPagesForItem);
                }
                
                const imgH = PH - imgTop - 14; 
                const imgW = PW - M * 2 - 4;
                const currentChunk = imgs.slice(p * CHUNK, (p + 1) * CHUNK);
                const numInChunk = currentChunk.length;
                
                let cols = 1, rows = 1;
                if (numInChunk === 1) { cols = 1; rows = 1; }
                else if (numInChunk === 2) { cols = 2; rows = 1; }
                else if (numInChunk <= 4) { cols = 2; rows = 2; }
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
