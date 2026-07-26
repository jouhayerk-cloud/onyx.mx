import { jsPDF } from 'jspdf';
import { getCleanImageUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData, extractFileId, fetchImageBatch } from './utils';
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

async function loadImgData(url: string, maxSize = 900, keepPng?: boolean): Promise<ImgData | null> {
    try {
        let img = new Image();
        try {
            img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image(); el.crossOrigin = 'anonymous'; 
                el.onload = () => resolve(el); el.onerror = reject; el.src = url; 
                setTimeout(() => reject(new Error('timeout')), 8000);
            });
        } catch (err) {
            // Fallback for CORS issues (e.g. generated AI masks on Google Drive)
            const fileId = extractFileId(url);
            if (fileId) {
                const res = await fetchImageBatch(fileId);
                img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const el = new Image(); 
                    el.onload = () => resolve(el); el.onerror = reject; 
                    el.src = `data:${res.mimeType};base64,${res.base64}`; 
                });
            } else {
                throw err;
            }
        }
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        
        if (!keepPng) {
            // Fill off-black background for all item images (JPEGs ignore this, PNG masks get the background)
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, w, h);
        }
        
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.88), w, h };
    } catch (err) { 
        console.error("Failed to load image for PDF:", url, err);
        return null; 
    }
}

function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number, scale = 1.0) {
    // doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cw, ch, 'F');
    const ir = img.w / img.h; const cr = cw / ch;
    let dw: number, dh: number;
    if (ir > cr) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
    dw *= scale; dh *= scale;
    const format = img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(img.dataUrl, format, cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
}

const toImp = (val: any, type: 'in' | 'lbs' | 'ft' = 'in') => {
    const v = parseFloat(val); if (!v || isNaN(v)) return '';
    if (type === 'lbs') return formatWeightImperialOnly(v);
    return cmToImperial(v);
};

async function drawHeader(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, exportType: 'regular' | 'catalog' = 'regular', pageInfo?: { current: number, total: number }): Promise<number> {
    const norm = normalizeInventoryData(item.data); 
    const codes = item.codes; 
    
    // Draw 3D Axonometric representation in the top right corner
    const shapeStr = norm.shape || '';
    const descStr = norm.shortDescription || norm.description || '';
    let wCm = parseFloat(norm.widthCm) || 0;
    let hCm = parseFloat(norm.heightCm) || 0;
    let dCm = parseFloat(norm.lengthCm) || 0;
    
    if (wCm || hCm || dCm) {
        
        
        
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

    const qrSize = 18; 
    const barWidth = 50;
    const barHeight = 11;
    
    let row1Y = startY + 4;
    
    // 1. QR Code
    let currentX = M + 4;
    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', currentX, row1Y, qrSize, qrSize);
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        const qrCenterX = currentX + qrSize / 2;
        const qrCenterY = row1Y + qrSize / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 2.2, 'F');
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 1.8, 'F');
        currentX += qrSize + 4;
    }
    
    // 2. Barcode & Codes
    let codesX = currentX;
    if (barDataUrl) {
        doc.addImage(barDataUrl, 'PNG', codesX, row1Y, barWidth, barHeight);
    }
    
    const tagIdY = row1Y + barHeight + 5;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(barcode, codesX, tagIdY);
    
    const barcodeWidth = doc.getTextWidth(barcode);
    
    const retailNum = codes.bookRetail && codes.bookRetail !== '-' ? codes.bookRetail.toString().replace(/[^0-9.]/g, '') : '';
    const topCodes = `${codes.bookAqCode || ''}${retailNum}`.trim();
    if (topCodes) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(topCodes, codesX + barcodeWidth + 4, tagIdY);
    }
    
    // 3. Dimensions Block
    const dimX = M + 85;
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
    const dimsImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('DIMENSIONS', dimX, row1Y + 3);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    const mVal = dimsMetric || '—';
    doc.text(mVal, dimX, row1Y + 8);
    
    if (dimsMetric) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`(${dimsImp})`, dimX, row1Y + 12);
    }
    
    // 4. Weight Block
    const weightX = dimX + 55;
    const weightImp = toImp(norm.weightKg, 'lbs');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('WEIGHT', weightX, row1Y + 3);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    const wVal = norm.weightKg ? `${norm.weightKg}kg` : '—';
    doc.text(wVal, weightX, row1Y + 8);
    
    if (norm.weightKg) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`(${weightImp})`, weightX, row1Y + 12);
    }
    
    // 5. Axonometric icon
    const axoSize = 22;
    const axoX = PW - M - axoSize;
    if (wCm || hCm || dCm) {
        try {
            const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data), true);
            if (axoDataUrl) {
                doc.addImage(axoDataUrl, 'JPEG', axoX, row1Y - 2, axoSize, axoSize);
            }
        } catch (e) {
            console.error("Failed to draw axonometric box", e);
        }
    }

    // Row 2
    let row2Y = row1Y + 28;
    
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    let nameStr = item.data.detailed_description || '';
    if (!nameStr) {
        nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    // Split text to prevent overflowing the page width if the AI generated a long title
    const maxTitleWidth = PW - M * 2 - 40; 
    const splitTitle = doc.splitTextToSize(nameStr.toUpperCase(), maxTitleWidth);
    doc.text(splitTitle, M + 4, row2Y);
    
    // Adjust row2Y based on how many lines the title took
    const titleLines = splitTitle.length;
    let currentY = row2Y + (titleLines * 5) + 1;
    
    const color = item.data.color || item.data.Color || '';
    const material = item.data.material || item.data.Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');
    
    if (detailStr) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(detailStr.toUpperCase(), M + 4, currentY);
        currentY += 6;
    }

    if (item.data.category) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(item.data.category.toUpperCase(), M + 4, currentY);
        currentY += 6;
    }
    
    // QTY and Page
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    const qtyStr = `QTY ${norm.quantity || 1}`;
    doc.text(qtyStr, PW - M - doc.getTextWidth(qtyStr), row2Y - 2);
    
    if (pageInfo && pageInfo.total > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const pageStr = `${pageInfo.current} OF ${pageInfo.total}`;
        doc.text(pageStr, PW - M - doc.getTextWidth(pageStr), row2Y + 3);
    }
    
    return currentY + 4;
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
import { RARE_EARTH_LOGO } from './rareEarthLogo';

function renderStyledMarketingHtml(doc: any, html: string, x: number, y: number, width: number, maxH: number) {
    if (!html) return;
    let currentY = y;
    const endYLimit = y + maxH;

    let clean = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n');

    clean = clean.replace(/<li[^>]*>/gi, '• ');
    const blocks = clean.split(/\n+/).map(b => b.trim()).filter(Boolean);

    for (let block of blocks) {
        if (currentY > endYLimit - 6) break;

        const isBullet = block.startsWith('• ');
        if (isBullet) {
            block = block.substring(2).trim();
        }

        let boldPrefix = '';
        let remainderText = block;
        const boldMatch = block.match(/^<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>\s*(.*)$/i);
        if (boldMatch) {
            boldPrefix = boldMatch[1].replace(/<[^>]+>/g, '').trim();
            remainderText = boldMatch[2].replace(/<[^>]+>/g, '').trim();
        } else {
            remainderText = block.replace(/<[^>]+>/g, '').trim();
        }

        if (!boldPrefix && !remainderText) continue;

        let textX = x;
        let textW = width;
        if (isBullet) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(160, 60, 30);
            doc.text('•', x, currentY);
            textX = x + 4;
            textW = width - 4;
        }

        if (boldPrefix) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(20, 20, 20);
            const prefixStr = boldPrefix + (remainderText && !remainderText.startsWith(':') ? ' ' : '');
            const prefixW = doc.getTextWidth(prefixStr);

            if (prefixW < textW * 0.45 && remainderText) {
                doc.text(prefixStr, textX, currentY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(50, 50, 50);
                
                const remW = textW - prefixW;
                const remLines = doc.splitTextToSize(remainderText, remW);
                doc.text(remLines[0] || '', textX + prefixW, currentY);
                
                if (remLines.length > 1) {
                    const nextLines = doc.splitTextToSize(remLines.slice(1).join(' '), textW);
                    for (let l = 0; l < nextLines.length; l++) {
                        currentY += 4.2;
                        if (currentY > endYLimit - 4) break;
                        doc.text(nextLines[l], textX, currentY);
                    }
                }
                currentY += 5.5;
                continue;
            } else {
                const pLines = doc.splitTextToSize(prefixStr, textW);
                for (let l = 0; l < pLines.length; l++) {
                    doc.text(pLines[l], textX, currentY);
                    currentY += 4.2;
                }
                if (!remainderText) {
                    currentY += 2;
                    continue;
                }
            }
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(50, 50, 50);
        const lines = doc.splitTextToSize(remainderText, textW);
        for (let l = 0; l < lines.length; l++) {
            if (currentY > endYLimit - 4) break;
            doc.text(lines[l], textX, currentY);
            currentY += 4.2;
        }
        currentY += 3.5;
    }
}

async function drawCatalogHubPage(
    doc: any, 
    item: CatalogArtifact, 
    M: number, 
    PW: number, 
    PH: number, 
    logoData: ImgData | null,
    pageInfo?: { current: number; total: number }
) {
    const norm = normalizeInventoryData(item.data); 
    const codes = item.codes;
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';

    // 1. Smaller top information panel (QR barcode and Title/Brand Logo)
    const topY = M;
    if (logoData) {
        let logoH = 12;
        let logoW = logoData.w * (logoH / logoData.h);
        if (logoW > 45) {
            logoW = 45;
            logoH = logoData.h * (logoW / logoData.w);
        }
        doc.addImage(logoData.dataUrl, 'PNG', M, topY, logoW, logoH);
    }

    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) {}

    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 35, lineColor: '#141414' });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) {}

    const qrSize = 16;
    const rightEdge = PW - M;
    let currX = rightEdge - qrSize;

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', currX, topY, qrSize, qrSize);
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        const qrCenterX = currX + qrSize / 2;
        const qrCenterY = topY + qrSize / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 2.0, 'F');
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 1.5, 'F');
    }

    const barW = 44;
    const barH = 10;
    if (barDataUrl) {
        const barX = currX - barW - 4;
        doc.addImage(barDataUrl, 'PNG', barX, topY, barW, barH);
        
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 20, 20);
        doc.text(`TAG ID: ${barcode}`, barX, topY + barH + 4.5);

        const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
        const wVal = norm.weightKg ? `${norm.weightKg}kg` : '—';
        const infoStr = `${dimsMetric || 'Custom Dims'} · ${wVal}`;
        
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(infoStr, barX, topY + barH + 8.5);
    }

    const sep1Y = topY + 20;
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.3);
    doc.line(M, sep1Y, PW - M, sep1Y);

    // 2. Title & Subtitle block
    const shape = norm.shape || 'Sculptural Form';
    const shortDesc = norm.shortDescription || norm.description || 'Artisanal Piece';
    const color = norm.color || item.data.Color || '';
    const material = norm.material || item.data.Material || 'Onyx';
    const titleStr = `${shape} · ${shortDesc} · ${color} · ${material}`.replace(/\s+/g, ' ').trim().toUpperCase();

    let titleY = sep1Y + 7;
    doc.setFontSize(14.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 15, 15);
    const splitTitle = doc.splitTextToSize(titleStr, PW - 2 * M - 20);
    doc.text(splitTitle, M, titleY);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    const qtyStr = `QTY: ${norm.quantity || 1}`;
    doc.text(qtyStr, PW - M - doc.getTextWidth(qtyStr), titleY);

    titleY += (splitTitle.length * 5.5) + 1;

    const subtitleStr = item.data.description || item.data.detailed_description || `${shape} handcrafted from natural Mexican ${material}.`;
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    const splitSub = doc.splitTextToSize(subtitleStr, PW - 2 * M);
    doc.text(splitSub, M, titleY);

    titleY += (splitSub.length * 4.5) + 3;

    // 3. Colors information
    const colorsStr = item.data.dominant_colors || norm.color || 'Natural Mexican Banding';
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(110, 110, 110);
    doc.text('COLOR PROFILE:', M, titleY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(colorsStr.toUpperCase(), M + 30, titleY);

    const sep2Y = titleY + 4;
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.2);
    doc.line(M, sep2Y, PW - M, sep2Y);

    // 4. Side-by-Side Content Zone
    const contentY = sep2Y + 6;
    const contentH = PH - 24 - contentY;

    const col1W = (PW - 2 * M - 8) * 0.46;
    doc.setFillColor(252, 252, 250); // Off white / gallery white background
    doc.setDrawColor(236, 236, 232);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, contentY, col1W, contentH, 3, 3, 'FD');

    const imgs = item.images || [];
    if (imgs.length === 0) {
        let wCm = parseFloat(norm.widthCm) || 0;
        let hCm = parseFloat(norm.heightCm) || 0;
        let dCm = parseFloat(norm.lengthCm) || 0;
        if (wCm || hCm || dCm) {
            try {
                const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shape, shortDesc, resolveItemColor(item.data), true);
                if (axoDataUrl) {
                    const axoSize = Math.min(col1W * 0.75, contentH * 0.75, 120);
                    doc.addImage(axoDataUrl, 'JPEG', M + (col1W - axoSize) / 2, contentY + (contentH - axoSize) / 2, axoSize, axoSize);
                }
            } catch (e) {}
        }
    } else if (imgs.length === 1) {
        const imgData = await loadImgData(getCleanImageUrl(imgs[0]), 1200, true);
        if (imgData) {
            drawContain(doc, imgData, M + 4, contentY + 4, col1W - 8, contentH - 8, 0.94);
        }
    } else {
        const numToShow = Math.min(imgs.length, 2);
        const cellH = (contentH - 8 - (numToShow - 1) * 4) / numToShow;
        for (let j = 0; j < numToShow; j++) {
            const imgData = await loadImgData(getCleanImageUrl(imgs[j]), 1000, true);
            const cy = contentY + 4 + j * (cellH + 4);
            if (imgData) {
                drawContain(doc, imgData, M + 4, cy, col1W - 8, cellH, 0.92);
            }
        }
    }

    const col2X = M + col1W + 8;
    const col2W = (PW - 2 * M) - col1W - 8;
    
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text('MARKETING OVERVIEW & SPECIFICATIONS', col2X, contentY + 4);
    
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(col2X, contentY + 6.5, col2X + col2W, contentY + 6.5);

    const marketingHtml = item.data.marketing_description || item.data.generatedDescription || item.data.generated_description || '';
    renderStyledMarketingHtml(doc, marketingHtml, col2X, contentY + 11.5, col2W, contentH - 12);
}

export async function exportCatalogPdf(
    results: CatalogArtifact[], 
    config: { title: string; method: 'grid' | 'single'; logo?: string; exportType?: 'regular' | 'catalog' },
    onProgress?: (p: number, s: string) => void,
    output: 'download' | 'blob' = 'download'
) {
    onProgress?.(5, 'Preparing Catalog...');
    const exportType = config.exportType || 'regular';
    const PW = 210, PH = 297, M = 12;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    let logoData: ImgData | null = null;
    if (config.method === 'single' || exportType === 'catalog') {
        const logoStr = config.logo === 'RareEarth' ? RARE_EARTH_LOGO : ART_OF_DECOR_LOGO;
        logoData = await loadImgData(logoStr, 400, true);
    }
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        
        if (config.method === 'single' || exportType === 'catalog') {
            doc.setFontSize(11);
            const madeText = 'Made in Mexico for';
            doc.setTextColor(20, 20, 20);
            const tw = doc.getTextWidth(madeText);
            
            let logoW = 0;
            let logoH = 0;
            let logoY = PH - 21.5;
            
            const rightEdge = PW - M;
            
            if (logoData) {
                if (config.logo === 'RareEarth') {
                    logoH = 12; 
                    logoW = logoData.w * (logoH / logoData.h);
                    logoY = PH - 26.5; // Moved down slightly
                    const logoX = rightEdge - logoW;
                    doc.addImage(logoData.dataUrl, 'PNG', logoX, logoY, logoW, logoH);
                } else {
                    logoH = 4.8; 
                    logoW = logoData.w * (logoH / logoData.h);
                    logoY = PH - 21.5;
                    const logoX = rightEdge - logoW;
                    doc.addImage(logoData.dataUrl, 'PNG', logoX, logoY, logoW, logoH);
                }
            }
            
            const textY = logoData ? logoY - 1.5 : PH - 23;
            const textX = rightEdge - tw;
            doc.text(madeText, textX, textY);
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

    if (exportType === 'catalog') {
        // --- METHOD: CATALOG HUB EXPORT (SIDE-BY-SIDE WITH STYLED MARKETING DESC) ---
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            addPage();
            await drawCatalogHubPage(doc, item, M, PW, PH, logoData, { current: i + 1, total: totalItems });
        }
    } else if (config.method === 'single') {
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
                    const specY = await drawHeader(doc, item, M, PW, M - 6, exportType, { current: j + 1, total: imgs.length });
                    
                    const imgUrl = getCleanImageUrl(imgs[j]);
                    const d = await loadImgData(imgUrl, 1200);
                    const imgW = PW - M * 2 - 4;
                    const imgH = PH - specY - 24;
                    if (d) {
                        drawContain(doc, d, M + 4, specY + 4, imgW, imgH, 0.90);
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
