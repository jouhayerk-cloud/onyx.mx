import { jsPDF } from 'jspdf';
import { getCleanImageUrl, isGoogleHostedUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData, extractFileId, fetchImageBatch, extractItemHexString, trimTransparentCanvas, getProductCategoryAndType, normalizeBrandTerms, isVideoFile, isVideoMime } from './utils';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { getVendorColor } from './excelStyles';
import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
import { trackDocumentJob } from '../features/print/jobTracking';

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

interface ImgData { dataUrl: string; w: number; h: number; }

/**
 * URLs the loader positively identified as NOT stills (a video, so far).
 *
 * isVideoFile can only judge by extension, and a Drive link of the form
 * `file/d/<id>/view` -- or the `uc?export=download&id=<id>` that getCleanImageUrl
 * rewrites it to -- carries no extension at all, so it reaches the loader looking
 * exactly like an image. The proxy hands back the real MIME type, which is the
 * first honest answer available, so record it there. Counting one of these as a
 * "missing image" would tell the user a page is blank because something broke,
 * when really a clip was never catalogue material.
 */
const nonImageUrls = new Set<string>();

/** What the caller needs to tell the user the catalogue came out degraded. */
export interface CatalogExportStats { imagesTotal: number; imagesFailed: number; payloadChars: number; }

async function loadImgDataUncached(url: string, maxSize = 800, keepPng = true, bgColor = '#FFFFFF', padding = 4): Promise<ImgData | null> {
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
        // Transparent pixels are composited onto bgColor, which is the page's
        // own white. Catalogue images are drawn straight onto the page with no
        // frame behind them, so white is the only value that disappears; any
        // other colour would show as a rectangle around the cut-out product.
        // Every call in this file passes keepPng: false; callers that do want
        // real transparency (masks, label art) keep the alpha probe.
        const flattenTo = bgColor;
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
            h: Math.max(1, canvas.height)
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
            if (isVideoMime(res.mimeType)) {
                nonImageUrls.add(cleanUrl);
                throw new Error(`Not a still image (${res.mimeType})`);
            }
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

    // 1. Optional background plate. Catalogue pages pass nothing and get none:
    //    the photograph sits directly on the white page, which is what the
    //    printed catalogue is meant to look like. This used to paint a dark
    //    rounded rectangle across the whole box on every image -- nominally the
    //    image's own sampled edge colour, but extractEdgeColor was never
    //    imported into this module, so it always threw and every frame came out
    //    the same hardcoded near-black.
    if (overrideBgColor && overrideBgColor !== 'transparent') {
        const hex = overrideBgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 255;
        const g = parseInt(hex.substring(2, 4), 16) || 255;
        const b = parseInt(hex.substring(4, 6), 16) || 255;
        doc.setFillColor(r, g, b);
        doc.roundedRect(cx, cy, cw, ch, 2, 2, 'F');
    }

    // 2. Draw the image centered in the box.
    //    No inset: the 6% that used to sit here kept the photo clear of the
    //    frame's rounded corners, and there is no frame any more. The image is
    //    aspect-contained, so filling the box cannot overflow it.
    const availW = Math.max(1, cw);
    const availH = Math.max(1, ch);
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
import { ONYX_MX_LOGO } from './onyxLogo';
import { renderAxoIconDataUrl } from './axo/axoIcon';

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

/**
 * Clean one stored URL for the PDF, dropping anything that is not a still.
 *
 * Videos have to be rejected BEFORE getCleanImageUrl, never after: that helper
 * turns a Drive video into `uc?export=download&id=<id>`, which has no file
 * extension left for isVideoFile to recognise, so a filter applied downstream
 * silently keeps every Drive-hosted clip. collectAllImages already learned this
 * the hard way -- see its dropVideos comment.
 */
function cleanStillUrl(raw: any): string | null {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str || isVideoFile(str)) return null;
    return getCleanImageUrl(str) || null;
}


async function getAdvancedAxoDataUrl(norm: any, itemData: any): Promise<string | null> {
    const wVal = parseFloat(norm.widthCm) || null;
    const hVal = parseFloat(norm.heightCm) || null;
    const dVal = parseFloat(norm.lengthCm) || null;
    const shape = norm.shape || '';
    const shortDesc = norm.shortDescription || norm.description || '';
    const typeId = norm.generatedType || norm.canonicalType || norm.type || shortDesc || shape;

    // 1. Dedicated isometric hairline type figure
    try {
        const hairlineDataUrl = renderAxoIconDataUrl({
            typeId,
            shape,
            w: wVal,
            h: hVal,
            l: dVal,
            top: norm.topType || null,
            holes: norm.holesCount || null,
            color: '#18181b',
            background: 'white'
        });
        if (hairlineDataUrl) return hairlineDataUrl;
    } catch (e) {}

    // 2. Fall back to 3D axonometric with hairline bounding box, ticks, and dimensions
    try {
        return await generateAxonometricDataUrl(
            wVal || 20, hVal || 30, dVal || 20,
            shape, shortDesc,
            resolveItemColor(itemData),
            true,
            extractItemHexString(itemData),
            {
                showBoundingBox: true,
                showDimensionLabels: true,
                showMeasurementTicks: true,
                hairlineColor: '#334155',
                unit: 'in'
            }
        );
    } catch (e) {
        return null;
    }
}

/**
 * Resolves ONLY clean room images for the catalogue (background-removed cutouts & clean studio room photos).
 * Raw warehouse/uploaded photos are strictly excluded whenever clean room images exist.
 */
function getItemImages(item: any): string[] {
    if (!item) return [];

    const norm = normalizeInventoryData(item.data || item);
    const cleanRoomUrls: string[] = [];

    // 1. Cutout clean room PNG (generated_png_url / mask_url)
    const genPng = cleanStillUrl(norm.generatedPngUrl || item.generated_png_url || item.generatedPngUrl || item.maskUrl || item.mask_url);
    if (genPng) cleanRoomUrls.push(genPng);

    // 2. Background-replaced clean room studio photos from processed_media_urls
    const rawProcessed = norm.processedMediaUrls || norm.processed_media_urls;
    if (rawProcessed) {
        let processedMap: Record<string, any> = {};
        if (typeof rawProcessed === 'object') {
            processedMap = rawProcessed;
        } else {
            const str = String(rawProcessed).trim();
            if (str.startsWith('{')) {
                try { processedMap = JSON.parse(str) || {}; } catch (e) {}
            }
        }
        for (const val of Object.values(processedMap)) {
            if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
                const c = cleanStillUrl(val);
                if (c && !cleanRoomUrls.includes(c)) cleanRoomUrls.push(c);
            }
        }
    }

    // 3. If item.images was pre-filtered for clean room images, include any distinct clean entries
    if (Array.isArray(item.images) && item.images.length > 0) {
        const preCleaned = item.images.map(cleanStillUrl).filter(Boolean) as string[];
        for (const u of preCleaned) {
            // Only add if it's already a clean room image or we have no clean room images yet
            if (u && !cleanRoomUrls.includes(u)) {
                if (cleanRoomUrls.length === 0 || u.includes('mask') || u.includes('png') || u.includes('processed')) {
                    cleanRoomUrls.push(u);
                }
            }
        }
    }

    // If clean room images exist, return ONLY clean room images (NO raw warehouse photos)
    if (cleanRoomUrls.length > 0) {
        return cleanRoomUrls;
    }

    // Fallback ONLY when item has no clean room images whatsoever
    const fallback = cleanStillUrl(norm.imageUrl || item.image_url || item.imageUrl);
    return fallback ? [fallback] : [];
}


/**
 * Renders an item in Vertical Portrait mode: ONE single clean room image per sheet.
 */
async function drawCatalogHubPagePortrait(
    doc: any, 
    item: CatalogArtifact, 
    M: number, 
    PW: number, 
    PH: number, 
    pageInfo?: { current: number; total: number },
    imageIndex: number = 0
) {
    const norm = normalizeInventoryData(item.data || item); 
    const codes: Partial<CatalogArtifact['codes']> = item.codes || {};
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';

    // 1. Top information panel: Item collection badge (NO brand logo at top)
    const topY = M;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ONYX COLLECTION EXHIBIT', M, topY + 5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('AUTHENTIC NATURAL STONE · HANDCRAFTED', M, topY + 9.5);

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

    const shapeTypeColorMat = [shape, shortDesc, color, material].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (shapeTypeColorMat) {
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        const splitSub1 = doc.splitTextToSize(shapeTypeColorMat, PW - 2 * M);
        doc.text(splitSub1, M, titleY);
        titleY += (splitSub1.length * 4.5) + 1.5;
    }

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

    // 4. Content Zone: Single Clean Room Image on top, Marketing description below
    const contentY = sep2Y + 2;
    const contentH = PH - 47 - contentY;
    const fullW = PW - 2 * M;
    const imgBoxH = contentH * 0.58;

    const imgs = getItemImages(item);
    const currentImgUrl = imgs[imageIndex] || imgs[0];

    if (!currentImgUrl) {
        try {
            const heroAxo = await getAdvancedAxoDataUrl(norm, itemDataObj);
            if (heroAxo) {
                const axoSize = Math.min(fullW * 0.75, imgBoxH * 0.85, 90);
                doc.addImage(heroAxo, heroAxo.startsWith('data:image/png') ? 'PNG' : 'JPEG', M + (fullW - axoSize) / 2, contentY + (imgBoxH - axoSize) / 2, axoSize, axoSize);
            }
        } catch (e) {}
    } else {
        const imgData = await loadImgData(currentImgUrl, 800, false, '#FFFFFF', 6);
        if (imgData) {
            drawContain(doc, imgData, M, contentY, fullW, imgBoxH, 1.0);
        }
    }

    const descY = contentY + imgBoxH + 6;
    const descH = contentH - imgBoxH - 6;
    
    const marketingHtml = normalizeBrandTerms(item.data.marketing_description || item.data.generatedDescription || item.data.generated_description || '');
    renderStyledMarketingHtml(doc, marketingHtml, M, descY, fullW, descH);

    // 5. Advanced axonometric icon & Dimensions Panel generated at bottom left
    const iconSize = 38;
    const bottomY = PH - 44;
    
    try {
        const smallAxoUrl = await getAdvancedAxoDataUrl(norm, item.data || item);
        if (smallAxoUrl) {
            doc.addImage(smallAxoUrl, smallAxoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', M, bottomY, iconSize, iconSize);
        }
    } catch (e) {}

    const panelX = M + iconSize + 6;
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

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WIDTH:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wImp, col1X + 13, yPos);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('HEIGHT:', col2X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(hImp, col2X + 14, yPos);

    yPos += rowGap;

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('DEPTH:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(dImp, col1X + 13, yPos);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WEIGHT:', col2X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wtImp, col2X + 15, yPos);

    yPos += rowGap;

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('OVERALL:', col1X, yPos);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(ovImp, col1X + 17, yPos);
}

/**
 * Renders an item in Horizontal Landscape mode: MULTIPLE clean room images per sheet.
 */
async function drawCatalogHubPageLandscapeGrid(
    doc: any, 
    item: CatalogArtifact, 
    M: number, 
    PW: number, 
    PH: number, 
    pageInfo?: { current: number; total: number }
) {
    const norm = normalizeInventoryData(item.data || item); 
    const codes: Partial<CatalogArtifact['codes']> = item.codes || {};
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';

    // 1. Top Header Bar (NO brand logo at top)
    const topY = M;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ONYX COLLECTION EXHIBIT · MULTI-IMAGE GRID', M, topY + 4.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('AUTHENTIC NATURAL STONE · HANDCRAFTED', M, topY + 8.5);

    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) {}

    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 32, lineColor: '#141414' });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) {}

    const qrSize = 14;
    const rightEdge = PW - M;
    let currX = rightEdge - qrSize;

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', currX, topY, qrSize, qrSize);
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        const qrCenterX = currX + qrSize / 2;
        const qrCenterY = topY + qrSize / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 1.8, 'F');
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 1.3, 'F');
    }

    const barW = 40;
    const barH = 9;
    if (barDataUrl) {
        const barX = currX - barW - 4;
        doc.addImage(barDataUrl, 'PNG', barX, topY, barW, barH);
        drawFormattedTagCode(doc, codes, barX, topY + barH + 4, 8.5);

        const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
        const wVal = norm.weightKg ? `${norm.weightKg}kg` : '—';
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`${dimsMetric || 'Custom Dims'} · ${wVal}`, barX, topY + barH + 7.5);
    }

    const sep1Y = topY + 18;
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.3);
    doc.line(M, sep1Y, PW - M, sep1Y);

    // 2. Horizontal Two-Column Layout (Left: Images Grid, Right: Details & Axo)
    const contentY = sep1Y + 3;
    const contentH = PH - 22 - contentY; // Above footer line
    const leftW = 158; // Images zone
    const rightX = M + leftW + 8;
    const rightW = PW - M - rightX;

    // LEFT ZONE: MULTIPLE CLEAN ROOM IMAGES GRID
    const imgs = getItemImages(item);
    const gap = 3.5;

    if (imgs.length === 0) {
        try {
            const heroAxo = await getAdvancedAxoDataUrl(norm, item.data || item);
            if (heroAxo) {
                const axoSize = Math.min(leftW * 0.8, contentH * 0.8, 110);
                doc.addImage(heroAxo, heroAxo.startsWith('data:image/png') ? 'PNG' : 'JPEG', M + (leftW - axoSize) / 2, contentY + (contentH - axoSize) / 2, axoSize, axoSize);
            }
        } catch (e) {}
    } else if (imgs.length === 1) {
        const d0 = await loadImgData(imgs[0], 800, false, '#FFFFFF', 6);
        if (d0) drawContain(doc, d0, M, contentY, leftW, contentH, 0.95);
    } else if (imgs.length === 2) {
        const colW = (leftW - gap) / 2;
        const d0 = await loadImgData(imgs[0], 800, false, '#FFFFFF', 6);
        const d1 = await loadImgData(imgs[1], 800, false, '#FFFFFF', 6);
        if (d0) drawContain(doc, d0, M, contentY, colW, contentH, 0.95);
        if (d1) drawContain(doc, d1, M + colW + gap, contentY, colW, contentH, 0.95);
    } else if (imgs.length === 3) {
        const mainW = leftW * 0.58;
        const sideW = leftW - mainW - gap;
        const sideH = (contentH - gap) / 2;
        const d0 = await loadImgData(imgs[0], 800, false, '#FFFFFF', 6);
        const d1 = await loadImgData(imgs[1], 800, false, '#FFFFFF', 6);
        const d2 = await loadImgData(imgs[2], 800, false, '#FFFFFF', 6);
        if (d0) drawContain(doc, d0, M, contentY, mainW, contentH, 0.95);
        if (d1) drawContain(doc, d1, M + mainW + gap, contentY, sideW, sideH, 0.95);
        if (d2) drawContain(doc, d2, M + mainW + gap, contentY + sideH + gap, sideW, sideH, 0.95);
    } else {
        // 4+ images: 2x2 grid
        const colW = (leftW - gap) / 2;
        const rowH = (contentH - gap) / 2;
        for (let idx = 0; idx < Math.min(4, imgs.length); idx++) {
            const gx = M + (idx % 2) * (colW + gap);
            const gy = contentY + Math.floor(idx / 2) * (rowH + gap);
            const d = await loadImgData(imgs[idx], 800, false, '#FFFFFF', 6);
            if (d) drawContain(doc, d, gx, gy, colW, rowH, 0.95);
        }
    }

    // Hairline Vertical Divider between Images and Specifications
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.2);
    doc.line(M + leftW + 4, contentY, M + leftW + 4, contentY + contentH);

    // RIGHT ZONE: METADATA, MARKETING HTML, ADVANCED AXO & DIMENSIONS
    const shape = norm.shape || 'Sculptural Form';
    const shortDesc = norm.shortDescription || norm.description || 'Artisanal Piece';
    const color = norm.color || (item.data ? item.data.Color : '') || '';
    const material = norm.material || (item.data ? item.data.Material : '') || 'Onyx';

    const itemDataObj = item.data || item;
    const mainDescStr = normalizeBrandTerms(itemDataObj.title || itemDataObj.generatedTitle || itemDataObj.generated_title || itemDataObj.description || itemDataObj.detailed_description || norm.description || norm.detailedDescription || `${shape} handcrafted from natural Mexican ${material}`);
    const titleStr = mainDescStr.replace(/\s+/g, ' ').trim().toUpperCase() + (itemDataObj.partSuffix ? ` ${itemDataObj.partSuffix.toUpperCase()}` : '');

    let rY = contentY + 2;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(titleStr, rightW);
    doc.text(splitTitle, rightX, rY);
    rY += (splitTitle.length * 4.3) + 2;

    const shapeTypeColorMat = [shape, shortDesc, color, material].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (shapeTypeColorMat) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const splitSub = doc.splitTextToSize(shapeTypeColorMat, rightW);
        doc.text(splitSub, rightX, rY);
        rY += (splitSub.length * 3.8) + 2;
    }

    const catAndTypeGrid = getProductCategoryAndType(norm);
    const genColorStr = norm.generatedColor || (Array.isArray(norm.dominantColors) ? norm.dominantColors.join(', ') : (norm.dominantColors || ''));
    let sub2Parts = [catAndTypeGrid.category.toUpperCase(), catAndTypeGrid.type.toUpperCase()];
    if (genColorStr) sub2Parts.push(genColorStr.toUpperCase());
    
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(sub2Parts.join('  |  '), rightX, rY);
    rY += 5;

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(rightX, rY, PW - M, rY);
    rY += 3;

    // Marketing description
    const textZoneH = contentH - (rY - contentY) - 40; // reserve 40mm at bottom for axo + dims
    const marketingHtml = normalizeBrandTerms(item.data.marketing_description || item.data.generatedDescription || item.data.generated_description || '');
    renderStyledMarketingHtml(doc, marketingHtml, rightX, rY, rightW, textZoneH);

    // Advanced Axo & Dimensions at bottom right
    const axoY = contentY + contentH - 36;
    const axoSize = 34;

    try {
        const smallAxoUrl = await getAdvancedAxoDataUrl(norm, item.data || item);
        if (smallAxoUrl) {
            doc.addImage(smallAxoUrl, smallAxoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', rightX, axoY, axoSize, axoSize);
        }
    } catch (e) {}

    // Condensed Dimensions table next to axo
    const panelX = rightX + axoSize + 4;
    const wImp = cmToImperial(norm.widthCm) || toImp(norm.widthCm, 'in') || '—';
    const hImp = cmToImperial(norm.heightCm) || toImp(norm.heightCm, 'in') || '—';
    const dImp = cmToImperial(norm.lengthCm) || toImp(norm.lengthCm, 'in') || '—';
    const wtImp = toImp(norm.weightKg, 'lbs') || '—';

    doc.setFontSize(7.5);
    let dimY = axoY + 6;
    const col2Offset = 36;

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WIDTH:', panelX, dimY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wImp, panelX + 13, dimY);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('HEIGHT:', panelX + col2Offset, dimY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(hImp, panelX + col2Offset + 14, dimY);

    dimY += 6;

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('DEPTH:', panelX, dimY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(dImp, panelX + 13, dimY);

    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('WEIGHT:', panelX + col2Offset, dimY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
    doc.text(wtImp, panelX + col2Offset + 15, dimY);

    dimY += 6;

    const retailVal = codes.bookRetail ? `$${codes.bookRetail} USD` : '—';
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text('RETAIL:', panelX, dimY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(retailVal, panelX + 13, dimY);
}
/**
 * Decoded images, keyed by every argument that changes the result.
 */
const imgDataCache = new Map<string, Promise<ImgData | null>>();

let sessionDepth = 0;

export function beginImageSession() {
    if (sessionDepth === 0) imgDataCache.clear();
    sessionDepth++;
}

export function endImageSession() {
    sessionDepth = Math.max(0, sessionDepth - 1);
    if (sessionDepth === 0) imgDataCache.clear();
}

function catalogWantedImages(
    results: CatalogArtifact[],
    exportType: string,
    method: 'grid' | 'single',
): string[] {
    return results.flatMap(r => {
        const list = getItemImages(r);
        if (exportType === 'catalog') {
            return (r.exportType === 'catalog-grid' && list.length > 1) ? list.slice(0, 3) : list;
        }
        return method === 'grid' ? list.slice(0, 3) : list;
    });
}

/**
 * Warm a document's images without drawing it. Only useful inside a session --
 * outside one the next export clears what this just fetched.
 */
export async function prewarmCatalogImages(
    results: CatalogArtifact[],
    config: { method: 'grid' | 'single'; exportType?: 'regular' | 'catalog' },
): Promise<void> {
    const wanted = catalogWantedImages(results, config.exportType || 'regular', config.method);
    try { await prefetchImgData(wanted); } catch { /* the export will retry and report */ }
}

async function loadImgData(url: string, maxSize = 800, keepPng = true, bgColor = '#FFFFFF', padding = 4): Promise<ImgData | null> {
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
 * would decode hundreds of canvases simultaneously. The cap is set to exactly
 * fill fetchImageBatch's pipe -- MAX_IN_FLIGHT * MAX_BATCH, six executions of
 * four ids -- because that queue can only dispatch what has been enqueued, and
 * a worker sitting on an await is not enqueueing. Below 24 the proxy runs with
 * idle request slots; above it the surplus workers just queue behind the same
 * slots while holding a decode buffer each, so it buys throughput at the cost
 * of memory only.
 */
async function prefetchImgData(
    urls: string[],
    onProgress?: (done: number, total: number, failed: number) => void,
): Promise<CatalogExportStats> {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    if (unique.length === 0) return { imagesTotal: 0, imagesFailed: 0, payloadChars: 0 };

    let next = 0;
    let done = 0;
    const CONCURRENCY = 24; // = MAX_IN_FLIGHT * MAX_BATCH in utils.tsx

    // A failure here is not fatal -- loadImgDataUncached already swallows it and
    // returns null, and drawContain skips a null image -- but it used to be
    // completely silent, so a Drive proxy batch that timed out produced a
    // finished PDF with blank image areas and nothing anywhere saying how many.
    // On a 484-image catalogue that is easy to miss entirely. Count them so the
    // caller can say so.
    let failed = 0;
    let skipped = 0;
    let payloadChars = 0;
    const worker = async () => {
        while (next < unique.length) {
            const idx = next++;
            const url = unique[idx];
            let ok = false;
            try {
                const d = await loadImgData(url, 800, false, '#FFFFFF', 6);
                ok = !!d;
                if (d) payloadChars += d.dataUrl.length;
            } catch { ok = false; }
            if (!ok) {
                // Separate "this was never a still" from "this should have loaded
                // and did not", so a stray clip is not reported as a blank page.
                if (nonImageUrls.has(getCleanImageUrl(url) || url)) skipped++;
                else failed++;
            }
            done++;
            onProgress?.(done, unique.length, failed);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker)
    );

    return { imagesTotal: unique.length - skipped, imagesFailed: failed, payloadChars };
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


async function drawCatalogSummaryPages(
    doc: any,
    results: CatalogArtifact[],
    M: number,
    PW: number,
    PH: number,
    addPage: () => void,
    isLandscape: boolean,
    catalogTitle?: string
) {
    const totalItems = results.length;
    let totalQty = 0;
    let totalWeightKg = 0;
    let totalRetailUsd = 0;
    const shapeCounts: Record<string, number> = {};

    for (const it of results) {
        const norm = normalizeInventoryData(it.data || it);
        const qty = parseInt(norm.quantity || '1', 10) || 1;
        totalQty += qty;
        const wt = parseFloat(norm.weightKg || '0') || 0;
        totalWeightKg += (wt * qty);
        const retailStr = String(it.codes?.bookRetail || norm.bookRetail || '0').replace(/[^0-9.]/g, '');
        const retail = parseFloat(retailStr) || 0;
        totalRetailUsd += (retail * qty);
        
        const shape = (norm.shape || norm.shortDescription || 'Other').trim();
        shapeCounts[shape] = (shapeCounts[shape] || 0) + qty;
    }

    const sortedShapes = Object.entries(shapeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([s, c]) => `${s.toUpperCase()} (${c})`)
        .join('  ·  ');

    // Page 1 of Summary
    addPage();

    // Title & Header block
    doc.setFontSize(isLandscape ? 16 : 18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(catalogTitle || 'ONYX COLLECTION CATALOGUE', M, isLandscape ? 20 : 24);

    doc.setFontSize(isLandscape ? 8 : 8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('EXECUTIVE INVENTORY SUMMARY & SPECIFICATION SHEET', M, isLandscape ? 25 : 30);

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`DATE: ${dateStr}`, PW - M, isLandscape ? 20 : 24, { align: 'right' });
    doc.text(`${totalItems} ITEMS  ·  ${totalQty} UNITS`, PW - M, isLandscape ? 25 : 30, { align: 'right' });

    // Hairline Header Divider
    const divY = isLandscape ? 29 : 34;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, divY, PW - M, divY);

    // 4 KPI Summary Cards
    const cardY = divY + 3.5;
    const cardH = isLandscape ? 18 : 22;
    const gap = 4;
    const cardW = (PW - 2 * M - 3 * gap) / 4;

    const kpis = [
        { label: 'TOTAL ITEMS', val: `${totalItems}`, sub: 'CATALOG LINE ITEMS' },
        { label: 'TOTAL QUANTITY', val: `${totalQty}`, sub: 'AGGREGATE PIECES' },
        { label: 'ESTIMATED WEIGHT', val: `${Math.round(totalWeightKg)} kg`, sub: `${Math.round(totalWeightKg * 2.20462)} lbs` },
        { label: 'TOTAL USD RETAIL', val: `$${Math.round(totalRetailUsd).toLocaleString('en-US')}`, sub: 'USD RETAIL' },
    ];

    kpis.forEach((kpi, idx) => {
        const cx = M + idx * (cardW + gap);
        doc.setFillColor(252, 253, 255);
        doc.roundedRect(cx, cardY, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(cx, cardY, cardW, cardH, 2, 2, 'S');

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, cx + 4, cardY + 5.5);

        doc.setFontSize(isLandscape ? 11.5 : 13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(kpi.val, cx + 4, cardY + (isLandscape ? 11.5 : 13.5));

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(kpi.sub, cx + 4, cardY + (isLandscape ? 15.5 : 18.5));
    });

    // Breakdown line
    const breakY = cardY + cardH + 4;
    if (sortedShapes) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(`CATEGORY BREAKDOWN:  ${sortedShapes}`, M, breakY);
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.2);
        doc.line(M, breakY + 3, PW - M, breakY + 3);
    }

    // Table rendering
    const drawTableHeader = (startY: number) => {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, startY, PW - 2 * M, 6.5, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.25);
        doc.line(M, startY, PW - M, startY);
        doc.line(M, startY + 6.5, PW - M, startY + 6.5);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);

        if (isLandscape) {
            doc.text('TAG / BARCODE', M + 2, startY + 4.5);
            doc.text('TYPE / SHAPE', M + 34, startY + 4.5);
            doc.text('COLOR & MATERIAL', M + 100, startY + 4.5);
            doc.text('DIMENSIONS (W×H×D)', M + 160, startY + 4.5);
            doc.text('QTY', M + 220, startY + 4.5, { align: 'right' });
            doc.text('USD RETAIL', PW - M - 2, startY + 4.5, { align: 'right' });
        } else {
            doc.text('TAG / BARCODE', M + 2, startY + 4.5);
            doc.text('TYPE / SHAPE', M + 28, startY + 4.5);
            doc.text('COLOR & MATERIAL', M + 76, startY + 4.5);
            doc.text('DIMENSIONS (W×H×D)', M + 114, startY + 4.5);
            doc.text('QTY', M + 154, startY + 4.5, { align: 'right' });
            doc.text('USD RETAIL', PW - M - 2, startY + 4.5, { align: 'right' });
        }
    };

    let currentTableY = breakY + 5;
    drawTableHeader(currentTableY);
    let rowY = currentTableY + 6.5;
    const rowH = 8;

    for (let i = 0; i < results.length; i++) {
        const it = results[i];
        const norm = normalizeInventoryData(it.data || it);
        const tag = it.codes?.bookBarcode || norm.itemId || `ITEM-${i + 1}`;
        const shape = (norm.shape || norm.shortDescription || 'Onyx Piece').toUpperCase();
        const color = [norm.color, norm.material].filter(Boolean).join(' · ') || 'Mexican Onyx';
        const dims = [norm.widthCm, norm.heightCm, norm.lengthCm]
            .filter(Boolean)
            .map(v => cmToImperial(v))
            .join(' × ') || '—';
        const qty = parseInt(norm.quantity || '1', 10) || 1;
        const retailStr = String(it.codes?.bookRetail || norm.bookRetail || '0').replace(/[^0-9.]/g, '');
        const retail = parseFloat(retailStr) || 0;

        if (rowY + rowH > PH - 24) {
            addPage();
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('COLLECTION MANIFEST (CONTINUED)', M, isLandscape ? 16 : 20);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(M, isLandscape ? 19 : 24, PW - M, isLandscape ? 19 : 24);

            currentTableY = isLandscape ? 22 : 27;
            drawTableHeader(currentTableY);
            rowY = currentTableY + 6.5;
        }

        if (i % 2 === 1) {
            doc.setFillColor(253, 254, 255);
            doc.rect(M, rowY, PW - 2 * M, rowH, 'F');
        }

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);

        if (isLandscape) {
            doc.text(tag, M + 2, rowY + 5.2);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            const splitShape = doc.splitTextToSize(shape, 62);
            doc.text(splitShape[0] || shape, M + 34, rowY + 5.2);

            const splitColor = doc.splitTextToSize(color, 56);
            doc.text(splitColor[0] || color, M + 100, rowY + 5.2);

            doc.text(dims, M + 160, rowY + 5.2);

            doc.setFont('helvetica', 'bold');
            doc.text(`${qty}`, M + 220, rowY + 5.2, { align: 'right' });

            const retailFmt = retail > 0 ? `$${Math.round(retail).toLocaleString('en-US')}` : '—';
            doc.text(retailFmt, PW - M - 2, rowY + 5.2, { align: 'right' });
        } else {
            doc.text(tag, M + 2, rowY + 5.2);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            const splitShape = doc.splitTextToSize(shape, 46);
            doc.text(splitShape[0] || shape, M + 28, rowY + 5.2);

            const splitColor = doc.splitTextToSize(color, 36);
            doc.text(splitColor[0] || color, M + 76, rowY + 5.2);

            doc.text(dims, M + 114, rowY + 5.2);

            doc.setFont('helvetica', 'bold');
            doc.text(`${qty}`, M + 154, rowY + 5.2, { align: 'right' });

            const retailFmt = retail > 0 ? `$${Math.round(retail).toLocaleString('en-US')}` : '—';
            doc.text(retailFmt, PW - M - 2, rowY + 5.2, { align: 'right' });
        }

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.15);
        doc.line(M, rowY + rowH, PW - M, rowY + rowH);

        rowY += rowH;
    }

    // Totals row at bottom of table
    if (rowY + 8.5 > PH - 24) {
        addPage();
        rowY = isLandscape ? 20 : 24;
    }

    doc.setFillColor(248, 250, 252);
    doc.rect(M, rowY, PW - 2 * M, 8.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(M, rowY, PW - M, rowY);
    doc.line(M, rowY + 8.5, PW - M, rowY + 8.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`GRAND TOTALS  (${totalItems} ITEMS)`, M + 2, rowY + 5.8);
    if (isLandscape) {
        doc.text(`${totalQty}`, M + 220, rowY + 5.8, { align: 'right' });
    } else {
        doc.text(`${totalQty}`, M + 154, rowY + 5.8, { align: 'right' });
    }
    doc.text(`$${Math.round(totalRetailUsd).toLocaleString('en-US')} USD`, PW - M - 2, rowY + 5.8, { align: 'right' });
}

export async function exportCatalogPdf(
    results: CatalogArtifact[], 
    config: { title: string; method: 'grid' | 'single'; logo?: string; exportType?: 'regular' | 'catalog' },
    onProgress?: (p: number, s: string) => void,
    output: 'download' | 'blob' = 'download',
    onStats?: (stats: CatalogExportStats) => void,
) {
    return trackDocumentJob({
        templateId: 'pdf-inventory-sheet',
        kind: 'pdf',
        season: '826',
        getSnapshot: () => results
    }, async () => {
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
    if (sessionDepth === 0) imgDataCache.clear();
    const wanted = catalogWantedImages(results, exportType, config.method);
    const warmed = await prefetchImgData(wanted, (n, total, failed) => {
        const missing = failed > 0 ? ` (${failed} unavailable)` : '';
        onProgress?.(5 + Math.round((n / total) * 20), `Loading images ${n}/${total}${missing}...`);
    });
    onStats?.(warmed);

    // jsPDF assembles the finished PDF as ONE JavaScript string (Array.join in
    // buildDocument), so the whole document is bounded by V8's maximum string
    // length, around 512MB. Overshooting throws "Invalid string length" only at
    // the very end -- which is how a 483-item catalogue managed to fail after
    // thirteen minutes of work with nothing to show for it. Every image is
    // already decoded by this point, so the size is knowable now: check it here
    // and fail in seconds, with the number and a batch size that would fit,
    // rather than at the finish line with a stack trace.
    // From this run's own stats rather than the whole cache: inside a session the
    // cache also holds the next document's images, and counting those here would
    // trip the guard on a document that fits perfectly well.
    const payloadChars = warmed.payloadChars;
    const MAX_PAYLOAD_CHARS = 320_000_000;
    if (payloadChars > MAX_PAYLOAD_CHARS) {
        const mb = Math.round(payloadChars / 1_048_576);
        const fits = Math.max(1, Math.floor(results.length * (MAX_PAYLOAD_CHARS / payloadChars)));
        throw new Error(
            `Too large for one PDF: ${results.length} items carry about ${mb}MB of image data, ` +
            `and a single PDF tops out near 300MB. Try batches of about ${fits} items.`
        );
    }
    // Grid method triggers horizontal landscape layout with multiple images per page
    // Single method triggers vertical portrait layout with one single image per sheet
    const isLandscape = config.method === 'grid';
    const PW = isLandscape ? 297 : 210;
    const PH = isLandscape ? 210 : 297;
    const M = 12;
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    
    let [artOfDecorLogo, rareEarthLogo, onyxLogo] = await Promise.all([
        loadLogoData(ART_OF_DECOR_LOGO),
        loadLogoData(RARE_EARTH_LOGO),
        loadLogoData(ONYX_MX_LOGO)
    ]);
    let logoData = artOfDecorLogo;
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        
        if (config.method === 'single' || exportType === 'catalog') {
            // Hairline divider across footer
            doc.setDrawColor(228, 228, 231);
            doc.setLineWidth(0.2);
            doc.line(M, PH - 16, PW - M, PH - 16);

            // Left side: MADE IN MEXICO & Page Number
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            const mimText = 'MADE IN MEXICO';
            doc.text(mimText, M, PH - 8.5);

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(`·   Page ${globalPageNum}`, M + doc.getTextWidth(mimText) + 3, PH - 8.5);

            // Right side: All three logos side-by-side (Onyx-mx, Art of Decor, Rare Earth)
            const rightEdge = PW - M;
            const targetH = 5.5;
            const gap = 5;

            const aodW = artOfDecorLogo ? Math.min(28, targetH * artOfDecorLogo.aspectRatio) : 24;
            const aodH = artOfDecorLogo ? aodW / artOfDecorLogo.aspectRatio : targetH;

            const regW = rareEarthLogo ? Math.min(24, targetH * rareEarthLogo.aspectRatio) : 20;
            const regH = rareEarthLogo ? regW / rareEarthLogo.aspectRatio : targetH;

            const onyxW = onyxLogo ? Math.min(18, targetH * onyxLogo.aspectRatio) : 15;
            const onyxH = onyxLogo ? onyxW / onyxLogo.aspectRatio : targetH;

            let currX = rightEdge;

            if (onyxLogo) {
                currX -= onyxW;
                const yPos = PH - 8.5 - onyxH / 2;
                doc.addImage(onyxLogo.dataUrl, 'PNG', currX, yPos, onyxW, onyxH);
                currX -= gap;
            }

            if (artOfDecorLogo) {
                currX -= aodW;
                const yPos = PH - 8.5 - aodH / 2;
                doc.addImage(artOfDecorLogo.dataUrl, 'PNG', currX, yPos, aodW, aodH);
                currX -= gap;
            }

            if (rareEarthLogo) {
                currX -= regW;
                const yPos = PH - 8.5 - regH / 2;
                doc.addImage(rareEarthLogo.dataUrl, 'PNG', currX, yPos, regW, regH);
            }
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
        // 1. Executive Summary & Specification Sheets (Hairline metrics & manifest)
        onProgress?.(5, 'Generating Executive Summary...');
        await drawCatalogSummaryPages(doc, results, M, PW, PH, addPage, isLandscape, config.title);

        // 2. Item Catalog Pages
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            const imgs = getItemImages(item);
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            await yieldToUi();

            if (isLandscape) {
                // HORIZONTAL PAGE: MULTIPLE CLEAN ROOM IMAGES PER PAGE
                addPage();
                await drawCatalogHubPageLandscapeGrid(doc, item, M, PW, PH, { current: i + 1, total: totalItems });
            } else {
                // VERTICAL PAGE: ONE SINGLE CLEAN ROOM IMAGE PER SHEET
                if (imgs.length <= 1) {
                    addPage();
                    await drawCatalogHubPagePortrait(doc, item, M, PW, PH, { current: i + 1, total: totalItems }, 0);
                } else {
                    for (let j = 0; j < imgs.length; j++) {
                        addPage();
                        await drawCatalogHubPagePortrait(doc, item, M, PW, PH, { current: i + 1, total: totalItems }, j);
                    }
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
                    const d = await loadImgData(imgUrl, 800, false, '#FFFFFF', 6);
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
    });
}
