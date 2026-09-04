import { jsPDF } from 'jspdf';
import { getCleanImageUrl, isGoogleHostedUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData, extractFileId, fetchImageBatch, extractItemHexString, trimTransparentCanvas, getProductCategoryAndType, normalizeBrandTerms } from './utils';
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
    /**
     * 'catalog-grid' is set by the batch wizard for a single item with several
     * images, and three places here branch on it. It was missing from this
     * union and assigned through an `as any` cast, so every one of those
     * comparisons type-checked as impossible while working fine at runtime.
     */
    exportType?: 'regular' | 'catalog' | 'catalog-grid';
}

function drawFormattedTagCode(doc: jsPDF, codes: any, x: number, y: number, fontSize: number = 9) {
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '';
    const parts = barcode.trim().split(/\s+/);
    const sec1 = parts[0] || '';
    const sec2 = parts.slice(1).join(' ') || '';
    const sec3 = codes.bookAqCode && codes.bookAqCode !== '-' ? codes.bookAqCode : '';
    const sec4 = codes.bookRetail && codes.bookRetail !== '-' ? codes.bookRetail.toString().replace(/[^0-9.]/g, '') : '';

    doc.setFontSize(fontSize);
    doc.setTextColor(20, 20, 20);

    let currX = x;
    
    // 1. First section: Vendor Code and Bookv (regular text)
    if (sec1) {
        doc.setFont('helvetica', 'normal');
        doc.text(sec1, currX, y);
        currX += doc.getTextWidth(sec1);
    }
    
    // 2. Middle section: item vendor index, landed code, and acquisition code (bold text)
    let middleParts = [];
    if (sec2) middleParts.push(sec2);
    if (sec3) middleParts.push(sec3);
    if (middleParts.length > 0) {
        const middleStr = (sec1 ? '-' : '') + middleParts.join('-');
        doc.setFont('helvetica', 'bold');
        doc.text(middleStr, currX, y);
        currX += doc.getTextWidth(middleStr);
    }
    
    // 3. Last section: Retail USD (regular text)
    if (sec4) {
        const lastStr = (sec1 || middleParts.length > 0 ? '-' : '') + sec4;
        doc.setFont('helvetica', 'normal');
        doc.text(lastStr, currX, y);
        currX += doc.getTextWidth(lastStr);
    }
}

interface ImgData { dataUrl: string; w: number; h: number; edgeColor?: string; }

async function loadImgDataUncached(url: string, maxSize = 800, keepPng = true, bgColor = '#1C1C1E', padding = 4): Promise<ImgData | null> {
    try {
        if (!url) return null;
        const cleanUrl = getCleanImageUrl(url) || url;
        let img: HTMLImageElement;

        const isDataOrBlob = cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:');

        if (isDataOrBlob) {
            // Data or Blob URLs: load directly, no CORS issues
            img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error('Data/Blob URL load failed'));
                el.src = cleanUrl;
                setTimeout(() => reject(new Error('Data URL timeout')), 5000);
            });
        } else {
            // For ALL external URLs: convert to data URL via fetch first to avoid
            // canvas tainting. Canvas operations (getImageData, toDataURL) throw
            // SecurityError on cross-origin images even with crossOrigin='anonymous'
            // if the server doesn't send proper CORS headers.
            img = await loadExternalImageAsDataUrl(cleanUrl);
        }

        // Sample edge color from image (safe since image is same-origin data URL)
        let edgeColor = bgColor;
        try {
            edgeColor = extractEdgeColor(img) || bgColor;
        } catch (e) {
            // Non-critical: edge color extraction failed, use default
        }

        const imgW = img.naturalWidth || img.width || 500;
        const imgH = img.naturalHeight || img.height || 500;

        const scale = Math.min(maxSize / imgW, maxSize / imgH, 1);
        const w = Math.max(1, Math.round(imgW * scale));
        const h = Math.max(1, Math.round(imgH * scale));

        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        
        ctx.drawImage(img, 0, 0, w, h);

        if (cleanUrl.includes('mask') || cleanUrl.includes('png') || cleanUrl.startsWith('data:image/png') || keepPng) {
            try {
                canvas = trimTransparentCanvas(canvas, padding);
            } catch (e) {
                // trimTransparentCanvas may fail on tainted canvas, use original
            }
        }

        // Encode PNG only when the caller actually needs transparency.
        //
        // Asking the pixels whether there is alpha -- which is what this used to
        // do -- is the right question for correctness and the wrong one for
        // size. These are background-REMOVED product shots, so most catalogue
        // images do carry alpha, and a lossless PNG of an 800px photo measures
        // ~1.2MB against ~80KB for the same picture as JPEG. Measured on real
        // catalogue images: five opaque ones came out 33-117KB, the one with
        // alpha came out 1210KB. Across 484 pages that is the difference
        // between a ~40MB document and one over half a gigabyte, and jsPDF
        // builds the whole PDF as a single string via Array.join, so the big
        // one died with "Invalid string length" after thirteen minutes.
        //
        // drawContain already paints edgeColor as a solid frame behind every
        // image, so compositing the transparent pixels onto that same colour
        // is visually identical in the finished PDF and lets the photo ship as
        // JPEG. Every call in this file passes keepPng: false; callers that do
        // want real transparency (masks, label art) keep the alpha probe.
        const flattenTo = edgeColor || bgColor;
        let dataUrl: string;

        if (!keepPng) {
            const flat = document.createElement('canvas');
            flat.width = canvas.width;
            flat.height = canvas.height;
            const fctx = flat.getContext('2d')!;
            fctx.fillStyle = flattenTo;
            fctx.fillRect(0, 0, flat.width, flat.height);
            fctx.drawImage(canvas, 0, 0);
            dataUrl = flat.toDataURL('image/jpeg', 0.85);
        } else {
            let hasAlpha = true;
            try {
                const probe = canvas.getContext('2d', { willReadFrequently: true });
                const px = probe?.getImageData(0, 0, canvas.width, canvas.height).data;
                if (px) {
                    hasAlpha = false;
                    for (let i = 3; i < px.length; i += 4) {
                        if (px[i] < 250) { hasAlpha = true; break; }
                    }
                }
            } catch (e) {
                // Tainted canvas: keep the old lossless behaviour for this one image.
            }
            dataUrl = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
        }

        return { 
            dataUrl, 
            w: Math.max(1, canvas.width), 
            h: Math.max(1, canvas.height),
            edgeColor: edgeColor
        };
    } catch (err) { 
        console.error("Failed to load image for PDF:", url, err);
        return null; 
    }
}

/**
 * Loads an external image by fetching it as a blob and converting to a data URL,
 * which makes it same-origin and prevents canvas tainting.
 * Falls back through multiple strategies:
 *   1. fetch() → blob → data URL (bypasses CORS canvas taint)
 *   2. Google Drive batch API (for drive.google.com file IDs)
 *   3. CORS anonymous Image() as last resort
 */
async function loadExternalImageAsDataUrl(cleanUrl: string): Promise<HTMLImageElement> {
    // Google never sends Access-Control-Allow-Origin for Drive or lh3 content,
    // so strategy 1 cannot succeed for those hosts -- it just spends a failed
    // round trip per image before we fall through to the proxy that does work.
    // Every image in the catalogue used to pay for that. Skipping it changes no
    // outcome: a Drive URL that the proxy cannot fetch still ends up at
    // strategy 3 exactly as before.
    // Shared with the Shopify export so both agree on what "a Google host" is.
    // The inline regex this replaced anchored only the start of the label, so
    // `drive.google.com.evil.tld` counted as Google-hosted.
    const isGoogleHosted = isGoogleHostedUrl(cleanUrl);

    // Strategy 1: fetch → blob → dataURL (preferred, avoids canvas tainting)
    // Timed for the same reason the Drive proxy is: an un-aborted fetch waits
    // forever, and this strategy now carries the background-replaced images,
    // so one unreachable host would hang the export rather than fall through.
    if (!isGoogleHosted) try {
        const ac = new AbortController();
        const stall = setTimeout(() => ac.abort(), 15_000);
        const resp = await fetch(cleanUrl, { mode: 'cors', signal: ac.signal })
            .finally(() => clearTimeout(stall));
        if (resp.ok) {
            const blob = await resp.blob();
            if (blob.size > 0) {
                const dataUrl = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(blob);
                });
                return await new Promise<HTMLImageElement>((res, rej) => {
                    const el = new Image();
                    el.onload = () => res(el);
                    el.onerror = rej;
                    el.src = dataUrl;
                    setTimeout(() => rej(new Error('Fetch data URL image timeout')), 5000);
                });
            }
        }
    } catch (e) {
        // fetch failed (CORS blocked, network error, etc.) — try next strategy
    }

    // Strategy 2: Google Drive batch API
    const fileId = extractFileId(cleanUrl);
    if (fileId) {
        try {
            const res = await fetchImageBatch(fileId);
            return await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = `data:${res.mimeType};base64,${res.base64}`;
                setTimeout(() => reject(new Error('Drive batch image timeout')), 8000);
            });
        } catch (e) {
            // Drive batch failed, try next
        }
    }

    // Strategy 3: CORS anonymous Image() as last resort
    // WARNING: This may taint the canvas — getImageData/toDataURL will throw.
    // But at least the image will be visible if addImage accepts HTMLImageElement.
    return await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`All image loading strategies failed for: ${cleanUrl}`));
        el.src = cleanUrl;
        setTimeout(() => reject(new Error('CORS image timeout')), 8000);
    });
}

function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number, scale = 1.0, overrideBgColor?: string) {
    if (!img || !img.dataUrl || !img.w || !img.h) return;

    // 1. Draw Background Frame as a SEPARATE vector object in the PDF
    const frameColor = overrideBgColor || img.edgeColor || '#1C1C1E';
    if (frameColor && frameColor !== 'transparent') {
        const hex = frameColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 28;
        const g = parseInt(hex.substring(2, 4), 16) || 28;
        const b = parseInt(hex.substring(4, 6), 16) || 30;
        doc.setFillColor(r, g, b);
        doc.roundedRect(cx, cy, cw, ch, 2, 2, 'F');
    }

    // 2. Draw Image as a SEPARATE transparent image object centered on top
    const pad = Math.min(cw, ch) * 0.06;
    const availW = Math.max(1, cw - pad * 2);
    const availH = Math.max(1, ch - pad * 2);
    const ir = (img.w && img.h) ? (img.w / img.h) : 1; 
    const cr = availW / availH;
    let dw: number, dh: number;
    if (ir > cr) { dw = availW; dh = availW / ir; } else { dh = availH; dw = availH * ir; }
    dw *= scale; dh *= scale;

    const imgX = cx + (cw - dw) / 2;
    const imgY = cy + (ch - dh) / 2;
    const format = img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(img.dataUrl, format, imgX, imgY, dw, dh);
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
    drawFormattedTagCode(doc, codes, codesX, tagIdY, 10);
    
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
    
    // 5. Axonometric icon (made larger)
    const axoSize = 27;
    const axoX = PW - M - axoSize;
    if (wCm || hCm || dCm) {
        try {
            const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data), true, extractItemHexString(item.data));
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
    let nameStr = normalizeBrandTerms(item.data.title || item.data.generatedTitle || item.data.generated_title || item.data.description || item.data.detailed_description || norm.description || norm.detailedDescription || '');
    if (!nameStr) {
        nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    }
    
    doc.setFontSize(11.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    const maxTitleWidth = PW - M * 2 - 40; 
    const finalNameStr = nameStr.toUpperCase() + (item.data.partSuffix ? ` ${item.data.partSuffix.toUpperCase()}` : '');
    const splitTitle = doc.splitTextToSize(finalNameStr, maxTitleWidth);
    doc.text(splitTitle, M + 4, row2Y);
    
    const titleLines = splitTitle.length;
    let currentY = row2Y + (titleLines * 4.5) + 1;
    
    const color = norm.color || item.data.color || item.data.Color || '';
    const material = norm.material || item.data.material || item.data.Material || '';
    const genColor = norm.generatedColor || (Array.isArray(norm.dominantColors) ? norm.dominantColors.join(', ') : (norm.dominantColors || ''));
    
    let colorLine = [shape, type, color, material].filter(Boolean).join(' · ');
    if (colorLine) {
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(colorLine.toUpperCase(), M + 4, currentY);
        currentY += 5;
    }

    const catAndType = getProductCategoryAndType(norm);
    let subParts = [];
    subParts.push(catAndType.category);
    subParts.push(catAndType.type);
    if (genColor) subParts.push(genColor);
    if (subParts.length > 0) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(90, 90, 90);
        doc.text(subParts.join('  |  ').toUpperCase(), M + 4, currentY);
        currentY += 5;
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
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
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

interface LogoData {
    dataUrl: string;
    w: number;
    h: number;
    aspectRatio: number;
}

async function loadLogoData(logoBase64Url: string): Promise<LogoData | null> {
    if (!logoBase64Url) return null;
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = (e) => reject(e);
            el.src = logoBase64Url;
            setTimeout(() => reject(new Error('Logo load timeout')), 4000);
        });
        const w = img.naturalWidth || img.width || 400;
        const h = img.naturalHeight || img.height || 100;
        return {
            dataUrl: logoBase64Url,
            w,
            h,
            aspectRatio: (w && h) ? (w / h) : 3.5
        };
    } catch (e) {
        console.error("Failed to load logo data:", e);
        return null;
    }
}

function getItemImages(item: any): string[] {
    if (!item) return [];
    
    // 1. Direct images array on CatalogArtifact
    if (Array.isArray(item.images) && item.images.length > 0) {
        const cleaned = item.images.map((u: string) => getCleanImageUrl(u)).filter(Boolean) as string[];
        if (cleaned.length > 0) return cleaned;
    }

    // 2. Check item.data or direct item properties
    const norm = normalizeInventoryData(item.data || item);
    const urls: string[] = [];

    // 3. Check generated PNG / mask URL
    const genPng = getCleanImageUrl(norm.generatedPngUrl || item.generated_png_url || item.generatedPngUrl || item.maskUrl || item.mask_url);
    if (genPng) urls.push(genPng);

    // 4. Check primary image URL
    const mainImg = getCleanImageUrl(norm.imageUrl || item.image_url || item.imageUrl);
    if (mainImg && !urls.includes(mainImg)) urls.push(mainImg);

    // 5. Check media_urls
    const rawMedia = norm.mediaUrls || item.media_urls || item.mediaUrls || (item.data ? (item.data.media_urls || item.data.mediaUrls) : null);
    if (rawMedia && typeof rawMedia === 'string') {
        const parts = rawMedia.split(',').map((s: string) => getCleanImageUrl(s.trim())).filter(Boolean) as string[];
        for (const p of parts) {
            if (!urls.includes(p)) urls.push(p);
        }
    }

    return urls;
}

async function drawCatalogHubPage(
    doc: any, 
    item: CatalogArtifact, 
    M: number, 
    PW: number, 
    PH: number, 
    logoData: LogoData | null,
    pageInfo?: { current: number; total: number },
    imageIndex: number = 0
) {
    const norm = normalizeInventoryData(item.data || item); 
    const codes = item.codes || {};
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';

    // 1. Top information panel: Brand Logo (direct vector/PNG without frame container)
    const topY = M;
    if (logoData) {
        const maxLogoW = 55;
        const maxLogoH = 16;
        let logoW = maxLogoW;
        let logoH = logoW / logoData.aspectRatio;
        if (logoH > maxLogoH) {
            logoH = maxLogoH;
            logoW = logoH * logoData.aspectRatio;
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
        
        drawFormattedTagCode(doc, codes, barX, topY + barH + 4.5, 9);

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
    const color = norm.color || (item.data ? item.data.Color : '') || '';
    const material = norm.material || (item.data ? item.data.Material : '') || 'Onyx';
    
    // Main Title: Generated Title
    const itemDataObj = item.data || item;
    const mainDescStr = normalizeBrandTerms(itemDataObj.title || itemDataObj.generatedTitle || itemDataObj.generated_title || itemDataObj.description || itemDataObj.detailed_description || norm.description || norm.detailedDescription || `${shape} handcrafted from natural Mexican ${material}`);
    const titleStr = mainDescStr.replace(/\s+/g, ' ').trim().toUpperCase() + (itemDataObj.partSuffix ? ` ${itemDataObj.partSuffix.toUpperCase()}` : '');

    let titleY = sep1Y + 7;
    doc.setFontSize(11.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 15, 15);
    const splitTitle = doc.splitTextToSize(titleStr, PW - 2 * M - 20);
    doc.text(splitTitle, M, titleY);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    const qtyStr = `QTY: ${norm.quantity || 1}`;
    doc.text(qtyStr, PW - M - doc.getTextWidth(qtyStr), titleY);

    titleY += (splitTitle.length * 4.5) + 1.5;

    // Subtitle 1: Shape Type Color Material
    const shapeTypeColorMat = [shape, shortDesc, color, material].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (shapeTypeColorMat) {
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        const splitSub1 = doc.splitTextToSize(shapeTypeColorMat, PW - 2 * M);
        doc.text(splitSub1, M, titleY);
        titleY += (splitSub1.length * 4.5) + 1.5;
    }

    // Subtitle 2: Category and GENERATED color
    const catAndTypeGrid = getProductCategoryAndType(norm);
    const genColorStr = norm.generatedColor || (Array.isArray(norm.dominantColors) ? norm.dominantColors.join(', ') : (norm.dominantColors || ''));
    
    let sub2Parts = [];
    sub2Parts.push(catAndTypeGrid.category.toUpperCase());
    sub2Parts.push(catAndTypeGrid.type.toUpperCase());
    if (genColorStr) sub2Parts.push(genColorStr.toUpperCase());
    
    if (sub2Parts.length > 0) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(90, 90, 90);
        const sub2Text = sub2Parts.join('  |  ');
        const splitSub2 = doc.splitTextToSize(sub2Text, PW - 2 * M);
        doc.text(splitSub2, M, titleY);
        titleY += (splitSub2.length * 4.5) + 1.5;
    }

    const sep2Y = titleY + 4;
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.2);
    doc.line(M, sep2Y, PW - M, sep2Y);

    // 4. Stacked Content Zone (Horizontally stacked: Image on top, Body description below)
    const contentY = sep2Y + 2;
    const contentH = PH - 47 - contentY;
    const fullW = PW - 2 * M;
    const imgBoxH = contentH * 0.58;

    const imgs = getItemImages(item);
    const currentImgUrl = imgs[imageIndex] || imgs[0];

    if (!currentImgUrl) {
        let wCm = parseFloat(norm.widthCm) || 0;
        let hCm = parseFloat(norm.heightCm) || 0;
        let dCm = parseFloat(norm.lengthCm) || 0;
        if (wCm || hCm || dCm) {
            try {
                const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shape, shortDesc, resolveItemColor(itemDataObj), true, extractItemHexString(itemDataObj));
                if (axoDataUrl) {
                    const axoSize = Math.min(fullW * 0.75, imgBoxH * 0.75, 80);
                    doc.addImage(axoDataUrl, 'JPEG', M + (fullW - axoSize) / 2, contentY + (imgBoxH - axoSize) / 2, axoSize, axoSize);
                }
            } catch (e) {}
        }
    } else if (item.exportType === 'catalog-grid' && imgs.length > 1) {
        const gridImages = imgs.slice(0, 3);
        const gap = 4;
        
        if (gridImages.length === 3) {
            const topH = (imgBoxH - gap) * 0.6;
            const botH = (imgBoxH - gap) * 0.4;
            const botW = (fullW - gap) / 2;
            
            const imgData0 = await loadImgData(gridImages[0], 800, false, '#1C1C1E', 32);
            if (imgData0) drawContain(doc, imgData0, M, contentY, fullW, topH, 1.0);
            
            const imgData1 = await loadImgData(gridImages[1], 800, false, '#1C1C1E', 32);
            if (imgData1) drawContain(doc, imgData1, M, contentY + topH + gap, botW, botH, 1.0);
            
            const imgData2 = await loadImgData(gridImages[2], 800, false, '#1C1C1E', 32);
            if (imgData2) drawContain(doc, imgData2, M + botW + gap, contentY + topH + gap, botW, botH, 1.0);
        } else {
            const cellH = (imgBoxH - gap) / 2;
            for (let idx = 0; idx < 2; idx++) {
                const imgData = await loadImgData(gridImages[idx], 800, false, '#1C1C1E', 32);
                if (imgData) drawContain(doc, imgData, M, contentY + idx * (cellH + gap), fullW, cellH, 1.0);
            }
        }
    } else {
        const imgData = await loadImgData(currentImgUrl, 800, false, '#1C1C1E', 32);
        if (imgData) {
            drawContain(doc, imgData, M, contentY, fullW, imgBoxH, 1.0);
        }
    }

    const descY = contentY + imgBoxH + 6;
    const descH = contentH - imgBoxH - 6;
    
    const marketingHtml = normalizeBrandTerms(item.data.marketing_description || item.data.generatedDescription || item.data.generated_description || '');
    renderStyledMarketingHtml(doc, marketingHtml, M, descY, fullW, descH);

    // 5. Large axonometric icon & ADD Dimensions Panel generated at the bottom left of the page
    const wVal = parseFloat(norm.widthCm) || 20;
    const hVal = parseFloat(norm.heightCm) || 30;
    const dVal = parseFloat(norm.lengthCm) || 20;
    const iconSize = 38;
    const bottomY = PH - 44;
    
    try {
        const smallAxoUrl = await generateAxonometricDataUrl(wVal, hVal, dVal, shape, shortDesc, resolveItemColor(item.data), true, extractItemHexString(item.data));
        if (smallAxoUrl) {
            doc.addImage(smallAxoUrl, 'JPEG', M, bottomY, iconSize, iconSize);
        }
    } catch (e) {}

    // Free floating, condensed, data-dense imperial dimensions (no borders, containers, titles, or shape)
    const panelX = M + iconSize + 6; // 12 + 38 + 6 = 56
    const wImp = cmToImperial(norm.widthCm) || toImp(norm.widthCm, 'in') || '—';
    const hImp = cmToImperial(norm.heightCm) || toImp(norm.heightCm, 'in') || '—';
    const dImp = cmToImperial(norm.lengthCm) || toImp(norm.lengthCm, 'in') || '—';
    const wtImp = toImp(norm.weightKg, 'lbs') || '—';
    const ovImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ') || '—';

    doc.setFontSize(8);
    const col1X = panelX;
    const col2X = panelX + 44;
    let yPos = bottomY + 12;
    const rowGap = 6.5;

    // Row 1: Width & Height
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WIDTH:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wImp, col1X + 13, yPos);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('HEIGHT:', col2X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(hImp, col2X + 14, yPos);

    yPos += rowGap;

    // Row 2: Depth & Weight
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('DEPTH:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(dImp, col1X + 13, yPos);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WEIGHT:', col2X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wtImp, col2X + 15, yPos);

    yPos += rowGap;

    // Row 3: Overall Dims
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('OVERALL:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(ovImp, col1X + 17, yPos);
}

/**
 * Decoded images, keyed by every argument that changes the result.
 *
 * Two jobs. It de-duplicates an image used more than once in a run, and --
 * the reason it exists -- it lets the whole set be warmed in parallel before
 * rendering starts. Every draw call in this file is a sequential await, so
 * without a warm-up fetchImageBatch's 50ms batching window never accumulates
 * more than one file id and a catalogue becomes one Apps Script round trip
 * per image, in series. Apps Script is slow per call, so that is where the
 * wait was coming from.
 *
 * Cleared at the start of each catalogue so repeated exports in one session
 * do not grow without bound.
 */
const imgDataCache = new Map<string, Promise<ImgData | null>>();

async function loadImgData(url: string, maxSize = 800, keepPng = true, bgColor = '#1C1C1E', padding = 4): Promise<ImgData | null> {
    if (!url) return null;
    const key = [url, maxSize, keepPng, bgColor, padding].join('|');
    const hit = imgDataCache.get(key);
    if (hit) return hit;
    // Cache the PROMISE, not the result, so concurrent callers for the same
    // image share one decode instead of racing.
    const p = loadImgDataUncached(url, maxSize, keepPng, bgColor, padding);
    imgDataCache.set(key, p);
    return p;
}

/**
 * Warm the cache for a whole catalogue before drawing it.
 *
 * Concurrency is capped rather than unbounded: firing every image at once
 * would give fetchImageBatch one perfect batch, but also decode hundreds of
 * canvases simultaneously. Eight in flight still collapses the round trips by
 * roughly an order of magnitude while keeping memory flat.
 */
async function prefetchImgData(urls: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    if (unique.length === 0) return;

    let next = 0;
    let done = 0;
    const CONCURRENCY = 8;

    const worker = async () => {
        while (next < unique.length) {
            const idx = next++;
            // Failures are already swallowed by loadImgDataUncached, which
            // returns null. Warming must never reject the whole catalogue.
            try { await loadImgData(unique[idx], 800, false, '#1C1C1E', 32); } catch { /* drawn as a gap later */ }
            done++;
            onProgress?.(done, unique.length);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker)
    );
}

/**
 * Hand the main thread back to the browser long enough for it to paint.
 *
 * Every await in the draw loops below resolves out of the image cache that
 * prefetchImgData just warmed, and awaiting an already-settled promise only
 * queues a microtask -- the browser never gets a frame between pages. So the
 * export fired onProgress for every page, React batched the state updates,
 * and nothing reached the screen until the whole catalogue was assembled:
 * a long export was indistinguishable from a frozen one, which is exactly
 * what "generate catalog hangs" was.
 *
 * A macrotask is what actually allows a paint. MessageChannel rather than
 * setTimeout(0) because background tabs clamp timers to ~1s, which would
 * turn a 200-page export into a 200-second one the moment the user looked
 * at another tab.
 */
function paintYield(): Promise<void> {
    return new Promise<void>(resolve => {
        if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return; }
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
        ch.port2.postMessage(null);
    });
}

/** Yields at most ~16x/sec: smooth enough for a bar, cheap enough per page. */
let lastYieldAt = 0;
async function yieldToUi(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastYieldAt < 60) return;
    lastYieldAt = now;
    await paintYield();
}

export async function exportCatalogPdf(
    results: CatalogArtifact[], 
    config: { title: string; method: 'grid' | 'single'; logo?: string; exportType?: 'regular' | 'catalog' },
    onProgress?: (p: number, s: string) => void,
    output: 'download' | 'blob' = 'download'
) {
    onProgress?.(5, 'Preparing Catalog...');
    const exportType = config.exportType || 'regular';

    // Warm every image before drawing. A grid page only ever draws the first
    // three of an item, so do not pay to decode the rest.
    //
    // Which items those are is decided per item by its own exportType, not by
    // config.method: in catalogue mode the loop below gives a grid item one
    // page and every other item one page PER IMAGE. Keying this on
    // config.method warmed three images for items whose pages then asked for
    // all of them, so images four onward still loaded one at a time at draw
    // time -- the exact serialisation this warm-up exists to remove.
    imgDataCache.clear();
    const wanted = results.flatMap(r => {
        const list = getItemImages(r);
        if (exportType === 'catalog') {
            return (r.exportType === 'catalog-grid' && list.length > 1) ? list.slice(0, 3) : list;
        }
        return config.method === 'grid' ? list.slice(0, 3) : list;
    });
    await prefetchImgData(wanted, (n, total) => {
        onProgress?.(5 + Math.round((n / total) * 20), `Loading images ${n}/${total}...`);
    });

    // jsPDF assembles the finished PDF as ONE JavaScript string (Array.join in
    // buildDocument), so the whole document is bounded by V8's maximum string
    // length, around 512MB. Overshooting throws "Invalid string length" only at
    // the very end -- which is how a 483-item catalogue managed to fail after
    // thirteen minutes of work with nothing to show for it. Every image is
    // already decoded by this point, so the size is knowable now: check it here
    // and fail in seconds, with the number and a batch size that would fit,
    // rather than at the finish line with a stack trace.
    const payloadChars = (await Promise.all([...imgDataCache.values()]))
        .reduce((n, d) => n + (d?.dataUrl.length ?? 0), 0);
    const MAX_PAYLOAD_CHARS = 320_000_000;
    if (payloadChars > MAX_PAYLOAD_CHARS) {
        const mb = Math.round(payloadChars / 1_048_576);
        const fits = Math.max(1, Math.floor(results.length * (MAX_PAYLOAD_CHARS / payloadChars)));
        throw new Error(
            `Too large for one PDF: ${results.length} items carry about ${mb}MB of image data, ` +
            `and a single PDF tops out near 300MB. Try batches of about ${fits} items.`
        );
    }
    const PW = 210, PH = 297, M = 12;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    let logoData: LogoData | null = null;
    if (config.method === 'single' || exportType === 'catalog') {
        const logoStr = config.logo === 'RareEarth' ? RARE_EARTH_LOGO : ART_OF_DECOR_LOGO;
        logoData = await loadLogoData(logoStr);
    }
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        
        if (config.method === 'single' || exportType === 'catalog') {
            doc.setFontSize(10);
            const madeText = 'Made in Mexico for';
            doc.setTextColor(20, 20, 20);
            const tw = doc.getTextWidth(madeText);
            
            const rightEdge = PW - M;
            let logoX = rightEdge - 50;
            let logoY = PH - 20;

            if (logoData) {
                const isRareEarth = config.logo === 'RareEarth';
                let logoW = isRareEarth ? 42 : 52;
                let logoH = logoW / logoData.aspectRatio;
                if (isRareEarth && logoH > 14) {
                    logoH = 14;
                    logoW = logoH * logoData.aspectRatio;
                } else if (!isRareEarth && logoH > 8) {
                    logoH = 8;
                    logoW = logoH * logoData.aspectRatio;
                }

                logoY = isRareEarth ? (PH - 24) : (PH - 20);
                logoX = rightEdge - logoW;

                doc.addImage(logoData.dataUrl, 'PNG', logoX, logoY, logoW, logoH);
            }
            
            const textY = logoData ? logoY - 1.5 : PH - 23;
            const textX = rightEdge - tw;
            doc.text(madeText, textX, textY);
        }
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
        // --- METHOD: CATALOG HUB EXPORT (ONE IMAGE PER PAGE WITH STYLED MARKETING DESC) ---
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            const imgs = getItemImages(item);
            if (item.exportType === 'catalog-grid' && imgs.length > 1) {
                processedCount++;
                onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
                await yieldToUi();
                addPage();
                await drawCatalogHubPage(doc, item, M, PW, PH, logoData, { current: i + 1, total: totalItems }, 0);
            } else if (imgs.length <= 1) {
                processedCount++;
                onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
                await yieldToUi();
                addPage();
                await drawCatalogHubPage(doc, item, M, PW, PH, logoData, { current: i + 1, total: totalItems }, 0);
            } else {
                for (let j = 0; j < imgs.length; j++) {
                    processedCount++;
                    onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${i + 1} (Image ${j + 1}/${imgs.length})...`);
                    await yieldToUi();
                    addPage();
                    await drawCatalogHubPage(doc, item, M, PW, PH, logoData, { current: i + 1, total: totalItems }, j);
                }
            }
        }
    } else {
        // --- METHOD: ONE IMAGE PER PAGE ---
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            const imgs = getItemImages(item);
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            await yieldToUi();

            if (imgs.length === 0) {
                addPage();
                const specY = await drawHeader(doc, item, M, PW, M - 6, exportType);
                
                // Draw large axonometric icon in place of image
                const norm = normalizeInventoryData(item.data || item);
                const shapeStr = norm.shape || '';
                const descStr = norm.shortDescription || norm.description || '';
                let wCm = parseFloat(norm.widthCm) || 0;
                let hCm = parseFloat(norm.heightCm) || 0;
                let dCm = parseFloat(norm.lengthCm) || 0;
                
                if (wCm || hCm || dCm) {
                    try {
                        const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, resolveItemColor(item.data || item), true, extractItemHexString(item.data || item));
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
                    
                    const imgUrl = imgs[j];
                    const d = await loadImgData(imgUrl, 800, false, '#1C1C1E', 32);
                    const imgW = PW - M * 2 - 4;
                    const imgH = PH - specY - 24;
                    if (d) {
                        drawContain(doc, d, M + 4, specY + 4, imgW, imgH, 0.90);
                    }
                }
            }
        }
    }
    onProgress?.(95, 'Finalizing Catalogue...');
    await yieldToUi(true);
    
    if (output === 'blob') {
        const blob = doc.output('blob');
        onProgress?.(100, 'Catalogue Ready');
        return blob;
    }

    const safeTitle = (config.title || 'ArtOfDecor').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
    doc.save(`${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`);
    onProgress?.(100, 'Catalogue Downloaded');
}
