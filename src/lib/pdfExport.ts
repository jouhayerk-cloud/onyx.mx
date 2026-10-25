import { jsPDF } from 'jspdf';
import { getCleanImageUrl, collectExportImages, collectAllImages, isGoogleHostedUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData, extractFileId, fetchImageBatch, extractItemHexString, trimTransparentCanvas, getProductCategoryAndType, normalizeBrandTerms, isVideoFile, isVideoMime } from './utils';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { getVendorColor } from './excelStyles';
import { generateAxonometricDataUrl, resolveItemColor, normalizeHexMapTexture, parseHexMapString } from './axonometric';
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

function formatQuantityText(qty: any): string {
    const n = parseInt(qty) || 1;
    const words: Record<number, string> = {
        1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE',
        6: 'SIX', 7: 'SEVEN', 8: 'EIGHT', 9: 'NINE', 10: 'TEN',
        11: 'ELEVEN', 12: 'TWELVE', 13: 'THIRTEEN', 14: 'FOURTEEN', 15: 'FIFTEEN',
        16: 'SIXTEEN', 17: 'SEVENTEEN', 18: 'EIGHTEEN', 19: 'NINETEEN', 20: 'TWENTY',
        24: 'TWENTY-FOUR', 25: 'TWENTY-FIVE', 30: 'THIRTY', 50: 'FIFTY', 100: 'ONE HUNDRED'
    };
    return words[n] || String(n);
}

function drawFormattedTagCode(
    doc: jsPDF, 
    codes: any, 
    x: number, 
    y: number, 
    fontSize: number = 9, 
    hideRetail: boolean = false, 
    fallbackData?: any,
    targetWidth?: number
) {
    let barcode = (codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || fallbackData?.bookBarcode || '').trim();
    const acqCode = (codes.bookAqCode && codes.bookAqCode !== '-') ? codes.bookAqCode.trim() : (fallbackData?.bookAqCode && fallbackData.bookAqCode !== '-' ? fallbackData.bookAqCode.trim() : '');
    
    let rawRetail = (!hideRetail && codes.bookRetail && codes.bookRetail !== '-') ? codes.bookRetail : '';
    if (!rawRetail && !hideRetail && fallbackData) {
        rawRetail = fallbackData.bookRetail || fallbackData.retailPrice || fallbackData.Retail || fallbackData['Retail USD'] || '';
    }
    const secRetail = rawRetail ? String(rawRetail).replace(/[^0-9.]/g, '') : '';
    const num = parseFloat(secRetail);
    const cleanRetail = !isNaN(num) && num > 0 ? (num % 1 === 0 ? Math.round(num).toString() : num.toFixed(2)) : '';

    // If barcode contains acqCode at the end (e.g. "GE82611HNN-XEF"), strip it to format TAGID-retailAcqCode
    if (acqCode && barcode.endsWith('-' + acqCode)) {
        barcode = barcode.slice(0, -(acqCode.length + 1)).trim();
    } else if (acqCode && barcode.endsWith(' ' + acqCode)) {
        barcode = barcode.slice(0, -(acqCode.length + 1)).trim();
    }

    // Format: TAGID + retail + Acq Code -> e.g. GE82611HNN-5989XEF
    let retailAndAcq = '';
    if (cleanRetail && acqCode) {
        retailAndAcq = `${cleanRetail}${acqCode}`;
    } else if (cleanRetail) {
        retailAndAcq = cleanRetail;
    } else if (acqCode) {
        retailAndAcq = acqCode;
    }

    const suffix = retailAndAcq ? (barcode ? '-' : '') + retailAndAcq : '';
    const fullStr = barcode + suffix;
    if (!fullStr) return;

    let activeFontSize = fontSize;
    if (targetWidth && targetWidth > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const testW = doc.getTextWidth(fullStr);
        if (testW > 0) {
            const scaled = 10 * (targetWidth / testW);
            activeFontSize = Math.max(7.0, Math.min(11.5, scaled));
        }
    }

    doc.setFontSize(activeFontSize);
    doc.setTextColor(20, 20, 20);

    doc.setFont('helvetica', 'normal');
    const wBarcode = doc.getTextWidth(barcode);
    doc.setFont('helvetica', 'bold');
    const wSuffix = suffix ? doc.getTextWidth(suffix) : 0;
    const totalMeasured = wBarcode + wSuffix;

    let startX = x;
    if (targetWidth && targetWidth > totalMeasured) {
        startX = x + (targetWidth - totalMeasured) / 2;
    }

    let currX = startX;
    if (barcode) {
        doc.setFont('helvetica', 'normal');
        doc.text(barcode, currX, y);
        currX += wBarcode;
    }
    if (suffix) {
        doc.setFont('helvetica', 'bold');
        doc.text(suffix, currX, y);
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

        if (img.decode) {
            try { await img.decode(); } catch (e) {}
        }
        let imgW = img.naturalWidth || img.width || 0;
        let imgH = img.naturalHeight || img.height || 0;
        if (!imgW || !imgH) {
            if (imgW > 0 && !imgH) imgH = imgW;
            else if (imgH > 0 && !imgW) imgW = imgH;
            else { imgW = 800; imgH = 800; }
        }

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

/**
 * Draws an axonometric wireframe data URL strictly aspect-contained (1:1 square)
 * inside a container box of (cx, cy, cw, ch), with symmetric centering and zero deformation.
 */
function drawAxoContain(
    doc: any,
    axoDataUrl: string,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    scale = 0.94
) {
    if (!axoDataUrl) return;
    const pad = 1.0;
    const availW = Math.max(1, cw - 2 * pad);
    const availH = Math.max(1, ch - 2 * pad);
    const size = Math.min(availW, availH) * scale;
    const axoX = cx + pad + (availW - size) / 2;
    const axoY = cy + pad + (availH - size) / 2;
    const format = axoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(axoDataUrl, format, axoX, axoY, size, size, undefined, 'FAST');
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
import { buildTypeFigure } from '../features/entry/hairline/typeFigures';
import { buildMotifFigure } from '../features/entry/hairline/figures/motifFigures';
import { buildFamilyFigure } from '../features/entry/hairline/figures/familyFigures';
import type { FigurePart } from '../features/entry/hairline/types';
import { classifyGeometry } from './geometry';
import { motifFor } from './shapeTypeLibrary';
import { canonicalType } from './canonicalType';

const hairlineIconCache = new Map<string, string>();

/**
 * Renders canonical Add Entry hairline figures (archetypal, un-scaled by dimensions)
 * into a crisp PNG Data URL for the Executive Summary manifest headers and rows.
 */
export function getHairlineIconDataUrl(
    typeId?: string | null,
    shape?: string | null,
    strokeColor: string = '#1E293B',
    bgColor: string = 'transparent'
): string | null {
    if (typeof document === 'undefined') return null;

    const s = (shape ?? '').trim();
    const t = (typeId ?? '').trim();
    const cacheKey = `${t}|${s}|${strokeColor}|${bgColor}`;
    const cached = hairlineIconCache.get(cacheKey);
    if (cached) return cached;

    // 1. Resolve canonical type
    const canon = canonicalType(t, s);
    const resolvedTypeId = canon.id ?? (t ? t.toLowerCase().replace(/\s+/g, '-') : null);

    // 2. Resolve geometry & motif
    const { motif, holes } = motifFor(s, t);
    const { geom, isMirror } = classifyGeometry(s, t);

    // 3. Obtain figure parts in standard Add Entry priority order
    let parts: FigurePart[] | null = null;
    if (resolvedTypeId) {
        parts = buildTypeFigure(resolvedTypeId, null, holes, s || null, null);
    }
    if (!parts && motif) {
        parts = buildMotifFigure(motif, null, holes);
    }
    if (!parts) {
        parts = buildFamilyFigure(geom, isMirror, null);
    }

    if (!parts || parts.length === 0) return null;

    const size = 260;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);
    }

    // Scale and center FIGURE_VB = { w: 400, h: 320 } inside the canvas
    const scale = (size * 0.94) / 400;
    const offsetX = (size - 400 * scale) / 2;
    const offsetY = (size - 320 * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const COLOR_PLATE = strokeColor === '#1E293B' ? '#F8FAFC' : '#F1F5F9';
    const COLOR_FACE = strokeColor === '#1E293B' ? '#EDF2F7' : '#E2E8F0';
    const COLOR_SLOT = '#0F172A';
    const COLOR_CREASE = '#64748B';

    for (const part of parts) {
        try {
            const p = new Path2D(part.d);
            switch (part.kind) {
                case 'plate':
                    ctx.fillStyle = COLOR_PLATE;
                    ctx.fill(p);
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 2.8;
                    ctx.stroke(p);
                    break;
                case 'face':
                    ctx.fillStyle = COLOR_FACE;
                    ctx.fill(p);
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 2.8;
                    ctx.stroke(p);
                    break;
                case 'crease':
                    ctx.strokeStyle = COLOR_CREASE;
                    ctx.lineWidth = 1.8;
                    ctx.stroke(p);
                    break;
                case 'slot':
                    ctx.fillStyle = COLOR_SLOT;
                    ctx.fill(p);
                    break;
                case 'mark':
                case 'bright':
                    ctx.fillStyle = strokeColor;
                    ctx.fill(p);
                    break;
            }
        } catch {
            // Path2D error fallback
        }
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    hairlineIconCache.set(cacheKey, dataUrl);
    return dataUrl;
}

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

        let finalDataUrl = logoBase64Url;
        if (logoBase64Url.startsWith('data:image/svg+xml') || logoBase64Url.includes('<svg')) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(1024, Math.max(w * 2, 512));
                canvas.height = Math.round(canvas.width / ((w && h) ? (w / h) : 1));
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    finalDataUrl = canvas.toDataURL('image/png');
                }
            } catch (canvasErr) {
                console.warn('Canvas rasterization failed for SVG logo:', canvasErr);
            }
        }

        return {
            dataUrl: finalDataUrl,
            w,
            h,
            aspectRatio: (w && h) ? (w / h) : 3.5
        };
    } catch (e) {
        console.error('Failed to load logo data:', e);
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


export async function getAdvancedAxoDataUrl(norm: any, itemData: any, customOptions?: any): Promise<string | null> {
    const wVal = parseFloat(norm.widthCm) || null;
    const hVal = parseFloat(norm.heightCm) || null;
    const dVal = parseFloat(norm.lengthCm) || null;
    const shape = norm.shape || '';
    const shortDesc = norm.shortDescription || norm.description || '';
    const itemDataObj = itemData || norm;
    const hexMap = extractItemHexString(itemDataObj) || extractItemHexString(norm);
    const wireColor = resolveItemColor(itemDataObj);

    // 3D axonometric with authentic stone hex map colors, mineral strata, bounding box, ticks, and dimensions
    try {
        return await generateAxonometricDataUrl(
            wVal || 20, hVal || 30, dVal || 20,
            shape, shortDesc,
            wireColor,
            false,
            hexMap,
            {
                showBoundingBox: true,
                showDimensionLabels: true,
                showMeasurementTicks: true,
                hairlineColor: '#334155',
                unit: 'in',
                ...customOptions
            }
        );
    } catch (e) {
        console.error('[pdfExport] Failed to generate 3D axonometric with hex map:', e);
        return null;
    }
}

/**
 * Checks if a URL represents a raw hex map bitmap rather than a product photo.
 */
function isHexMapUrl(url?: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('hex_map') || 
           lower.includes('hexmap') || 
           lower.includes('pixel_map') || 
           lower.includes('_bitmap_') ||
           lower.includes('spatial_points');
}

export interface ExtractedColorInfo {
    name: string;
    rgb: [number, number, number];
}

const STONE_COLOR_PALETTE_MAP: Record<string, [number, number, number]> = {
    black: [25, 25, 25],
    white: [245, 245, 245],
    gray: [130, 130, 130],
    grey: [130, 130, 130],
    cream: [255, 253, 208],
    tan: [210, 180, 140],
    brown: [139, 69, 19],
    bronze: [205, 127, 50],
    copper: [184, 115, 51],
    gold: [218, 165, 32],
    'rose gold': [183, 110, 121],
    silver: [192, 192, 192],
    red: [220, 30, 30],
    orange: [255, 140, 0],
    yellow: [255, 215, 0],
    green: [40, 160, 40],
    blue: [30, 100, 220],
    teal: [0, 128, 128],
    'turquoise/aqua': [64, 224, 208],
    turquoise: [64, 224, 208],
    aqua: [0, 255, 255],
    purple: [128, 0, 128],
    pink: [255, 192, 203],
    amber: [255, 191, 0],
    rust: [183, 65, 14],
    slate: [112, 128, 144],
    beige: [245, 245, 220],
    honey: [235, 180, 50],
    caramel: [198, 137, 88],
    chocolate: [123, 63, 0],
    multicolor: [180, 120, 80],
};

export function getItemExtractedColors(norm: any, itemData: any): ExtractedColorInfo[] {
    const rawList: string[] = [];
    
    if (Array.isArray(norm.dominantColors)) {
        norm.dominantColors.forEach((c: any) => { if (typeof c === 'string' && c.trim()) rawList.push(c.trim()); });
    } else if (typeof norm.dominantColors === 'string' && norm.dominantColors.trim()) {
        norm.dominantColors.split(/[,·|/]/).forEach((c: string) => { if (c.trim()) rawList.push(c.trim()); });
    }

    if (rawList.length === 0 && norm.generatedColor) {
        if (Array.isArray(norm.generatedColor)) {
            norm.generatedColor.forEach((c: any) => { if (typeof c === 'string' && c.trim()) rawList.push(c.trim()); });
        } else if (typeof norm.generatedColor === 'string') {
            norm.generatedColor.split(/[,·|/]/).forEach((c: string) => { if (c.trim()) rawList.push(c.trim()); });
        }
    }

    if (rawList.length === 0) {
        const dColors = itemData?.dominant_colors || itemData?.dominantColors || itemData?.colors;
        if (Array.isArray(dColors)) {
            dColors.forEach((c: any) => { if (typeof c === 'string' && c.trim()) rawList.push(c.trim()); });
        } else if (typeof dColors === 'string') {
            dColors.split(/[,·|/]/).forEach((c: string) => { if (c.trim()) rawList.push(c.trim()); });
        }
    }

    if (rawList.length === 0) {
        const rawCol = norm.color || itemData?.Color || itemData?.color;
        if (rawCol && typeof rawCol === 'string') {
            rawCol.split(/[,·|/]/).forEach((c: string) => { if (c.trim()) rawList.push(c.trim()); });
        }
    }

    const out: ExtractedColorInfo[] = [];
    const seen = new Set<string>();

    for (const raw of rawList) {
        const clean = raw.trim().replace(/^#/, '');
        if (!clean) continue;
        const lower = clean.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);

        if (/^[0-9a-f]{6}$/i.test(clean)) {
            const r = parseInt(clean.substring(0, 2), 16);
            const g = parseInt(clean.substring(2, 4), 16);
            const b = parseInt(clean.substring(4, 6), 16);
            out.push({ name: '#' + clean.toUpperCase(), rgb: [r, g, b] });
        } else if (STONE_COLOR_PALETTE_MAP[lower]) {
            out.push({ name: clean.toUpperCase(), rgb: STONE_COLOR_PALETTE_MAP[lower] });
        } else {
            const match = Object.keys(STONE_COLOR_PALETTE_MAP).find(k => lower.includes(k) || k.includes(lower));
            if (match) {
                out.push({ name: clean.toUpperCase(), rgb: STONE_COLOR_PALETTE_MAP[match] });
            } else {
                out.push({ name: clean.toUpperCase(), rgb: [160, 160, 160] });
            }
        }
        if (out.length >= 5) break;
    }
    return out;
}

function drawColorBubbles(
    doc: any,
    colors: ExtractedColorInfo[],
    startX: number,
    startY: number,
    maxW?: number
): number {
    if (!colors || colors.length === 0) return 0;
    
    let curX = startX;
    const bubbleR = 2.0;
    const bubbleDiameter = bubbleR * 2;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    
    for (const c of colors) {
        const textW = doc.getTextWidth(c.name);
        const itemW = bubbleDiameter + 2.0 + textW + 4;
        
        if (maxW && (curX + itemW - startX > maxW)) break;
        
        const circleCenterX = curX + bubbleR;
        const circleCenterY = startY;
        
        doc.setFillColor(c.rgb[0], c.rgb[1], c.rgb[2]);
        doc.circle(circleCenterX, circleCenterY, bubbleR, 'F');
        
        doc.setDrawColor(200, 205, 215);
        doc.setLineWidth(0.18);
        doc.circle(circleCenterX, circleCenterY, bubbleR, 'S');
        
        doc.setTextColor(51, 65, 85);
        doc.text(c.name, curX + bubbleDiameter + 2.0, startY + 1.0);
        
        curX += itemW;
    }
    return curX - startX;
}

/**
 * Draws liquid glass color bubble indicators stacked vertically under the classification subtitle.
 * Follows Apple HIG Simplicity & Craft: specular highlight reflection, subtle rim, crisp uppercase typography.
 */
function drawVerticalColorBubbles(
    doc: any,
    colors: ExtractedColorInfo[],
    startX: number,
    startY: number,
    maxCount: number = 4
): number {
    if (!colors || colors.length === 0) return startY;
    
    let curY = startY;
    const bubbleR = 1.6;
    const rowH = 3.6;
    const toRender = colors.slice(0, maxCount);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');

    for (const c of toRender) {
        const [r, g, b] = c.rgb;
        const cy = curY + 1.2;
        const cx = startX + bubbleR + 0.2;

        // Glass sphere / bubble: base fill
        doc.setFillColor(r, g, b);
        doc.circle(cx, cy, bubbleR, 'F');

        // Specular highlight (glass reflection on upper-left)
        doc.setFillColor(255, 255, 255);
        doc.circle(cx - 0.45, cy - 0.45, 0.5, 'F');

        // Subtle hairline rim
        const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 210;
        doc.setDrawColor(isLight ? 200 : r, isLight ? 200 : g, isLight ? 200 : b);
        doc.setLineWidth(0.18);
        doc.circle(cx, cy, bubbleR, 'S');

        // Color name label next to bubble
        doc.setTextColor(71, 85, 105);
        doc.text(c.name.toUpperCase(), cx + bubbleR + 2.2, curY + 2.4);

        curY += rowH;
    }

    return curY;
}

/**
 * Renders a normalized hex map stretched to a square with no empty/white spaces.
 */
/**
 * Renders a normalized vein mask stretched to fill a square with no empty/white margins.
 * Extracts vein mask / cutout URL (vein_svg_urls, spatial_masks, maskUrl, generatedPngUrl)
 * and draws it stretched across a square canvas over the stone's base strata texture,
 * falling back cleanly to continuous veined strata hex texture if no mask is available.
 */
export async function generateNormalizedVeinMaskSquareDataUrl(
    itemData: any,
    norm: any,
    sizePx: number = 140
): Promise<string | null> {
    try {
        const it = itemData || norm || {};
        let maskUrl: string | null = null;

        // 1. Check vein_svg_urls
        const vUrls = it.vein_svg_urls || it.veinSvgUrls || (it.processed_media_urls && typeof it.processed_media_urls === 'object' ? it.processed_media_urls.vein_svg_urls : undefined);
        if (vUrls) {
            if (typeof vUrls === 'string') maskUrl = vUrls.split(',')[0].trim();
            else if (Array.isArray(vUrls) && vUrls.length > 0) maskUrl = String(vUrls[0]);
            else if (typeof vUrls === 'object') {
                const vals = Object.values(vUrls);
                if (vals.length > 0) maskUrl = String(vals[0]);
            }
        }

        // 2. Check spatial_masks
        if (!maskUrl) {
            const spMasks = it.spatial_masks || it.spatialMasks || norm.spatialMasks || norm.spatial_masks;
            if (spMasks) {
                let mObj = spMasks;
                if (typeof spMasks === 'string' && spMasks.trim().startsWith('{')) {
                    try { mObj = JSON.parse(spMasks); } catch {}
                }
                if (typeof mObj === 'object' && mObj) {
                    if (Array.isArray(mObj) && mObj.length > 0) {
                        maskUrl = mObj[0].cutoutUrl || mObj[0].pngUrl || mObj[0].mask || null;
                    } else {
                        const angle0 = (mObj as any).angle_0 || Object.values(mObj)[0];
                        if (angle0) {
                            if (Array.isArray(angle0) && angle0.length > 0) {
                                maskUrl = angle0[0].cutoutUrl || angle0[0].mask || angle0[0].pngUrl || null;
                            } else if (typeof angle0 === 'string') {
                                maskUrl = angle0;
                            }
                        }
                    }
                }
            }
        }

        // 3. Check generated PNG cutout or mask_url
        if (!maskUrl) {
            maskUrl = it.generated_png_url || norm.generatedPngUrl || it.mask_url || norm.maskUrl || it.cutoutUrl || null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext('2d');
        if (!ctx) return generateNormalizedHexSquareDataUrl(itemData, norm, sizePx);

        // First paint the base stone strata (no empty spaces)
        const baseHexSquare = generateNormalizedHexSquareDataUrl(itemData, norm, sizePx);
        if (baseHexSquare) {
            const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject();
                el.src = baseHexSquare;
            }).catch(() => null);
            if (baseImg) {
                ctx.drawImage(baseImg, 0, 0, sizePx, sizePx);
            }
        } else {
            ctx.fillStyle = '#c8b69b';
            ctx.fillRect(0, 0, sizePx, sizePx);
        }

        // If vein mask / cutout URL exists, load and stretch to fill square
        if (maskUrl) {
            const cleanUrl = getCleanImageUrl(maskUrl) || maskUrl;
            const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.crossOrigin = 'anonymous';
                el.onload = () => resolve(el);
                el.onerror = () => reject();
                el.src = cleanUrl;
                setTimeout(() => reject(new Error('timeout')), 4000);
            }).catch(() => null);

            if (maskImg) {
                ctx.drawImage(maskImg, 0, 0, sizePx, sizePx);
            }
        }

        return canvas.toDataURL('image/png');
    } catch {
        return generateNormalizedHexSquareDataUrl(itemData, norm, sizePx);
    }
}

export function generateNormalizedHexSquareDataUrl(
    itemData: any,
    norm: any,
    sizePx: number = 140
): string | null {
    try {
        const hexMapString = extractItemHexString(itemData);
        let sCols = 20, sRows = 20;
        let rawHexList: string[] = [];

        if (hexMapString) {
            let hexStrToParse = hexMapString;
            const dimMatch = hexMapString.match(/^(\d+)x(\d+):([\s\S]+)$/);
            if (dimMatch) {
                sCols = parseInt(dimMatch[1], 10);
                sRows = parseInt(dimMatch[2], 10);
                hexStrToParse = dimMatch[3];
            }
            rawHexList = parseHexMapString(hexStrToParse);
            if (!dimMatch && rawHexList.length > 0) {
                const len = rawHexList.length;
                if (len === 3600) { sCols = 60; sRows = 60; }
                else if (len === 400) { sCols = 20; sRows = 20; }
                else if (len === 100) { sCols = 10; sRows = 10; }
                else if (len === 64) { sCols = 8; sRows = 8; }
                else if (len % 20 === 0) { sCols = 20; sRows = len / 20; }
                else if (len % 16 === 0) { sCols = 16; sRows = len / 16; }
                else {
                    sCols = Math.max(1, Math.round(Math.sqrt(len)));
                    sRows = Math.ceil(len / sCols);
                }
            }
        }

        const targetGridSize = 24;
        let normalizedColors: string[] = [];

        if (rawHexList.length > 0) {
            normalizedColors = normalizeHexMapTexture(rawHexList, sCols, sRows, targetGridSize, targetGridSize);
        }

        if (!normalizedColors || normalizedColors.length === 0) {
            const extColors = getItemExtractedColors(norm, itemData);
            const hexes = extColors.map(c => `rgb(${c.rgb.join(',')})`);
            const baseHexes = hexes.length > 0 ? hexes : ['#e2d7c5', '#c8b69b', '#9b8064', '#5a4634'];
            normalizedColors = normalizeHexMapTexture(baseHexes, 4, 4, targetGridSize, targetGridSize);
        }

        if (!normalizedColors || normalizedColors.length === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const cellW = sizePx / targetGridSize;
        const cellH = sizePx / targetGridSize;

        for (let r = 0; r < targetGridSize; r++) {
            for (let c = 0; c < targetGridSize; c++) {
                const color = normalizedColors[r * targetGridSize + c] || '#d5c4a1';
                ctx.fillStyle = color;
                ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
            }
        }

        return canvas.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

/**
 * Checks if a URL represents an SVG vector rather than a bitmap photo.
 */
function isSvgUrl(url?: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('.svg') || lower.endsWith('.svg') || lower.includes('image/svg');
}

/**
 * Checks if a URL represents a transparent cutout mask PNG rather than a studio room photo.
 */
function isPngCutoutUrl(url?: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('mask') || 
           lower.includes('cutout') || 
           lower.includes('segmentation') || 
           lower.includes('generated_png') || 
           lower.includes('_label_png');
}

/**
 * Resolves the Shopify/product title to display as a subtitle directly under the deterministic title.
 */
function getShopifyTitleSubtitle(norm: any, itemDataObj: any, mainTitleStr: string): string {
    const raw = (
        itemDataObj?.shopifyTitle || 
        itemDataObj?.shopify_title || 
        norm?.shopifyTitle ||
        itemDataObj?.invoiceTitle || 
        itemDataObj?.invoice_title || 
        itemDataObj?.generatedTitle || 
        itemDataObj?.generated_title ||
        itemDataObj?.title ||
        ''
    );
    if (!raw) return '';
    const clean = normalizeBrandTerms(String(raw)).replace(/\s+/g, ' ').trim().toUpperCase();
    if (clean === mainTitleStr.toUpperCase() || clean === 'SCULPTURAL FORM' || clean === 'STONE PIECE') {
        return '';
    }
    return clean;
}

/**
 * Normalizes and cleans single product types from category paths or plurals (e.g. "HOME DECOR > DECORATIVE BOWLS" -> "BOWL").
 */
function cleanSingleTypeName(t: string): string {
    if (!t) return '';
    let res = t.trim();
    // Remove leading "Decorative "
    res = res.replace(/^decorative\s+/i, '');
    
    // Map common plurals or specific categories to standard clean product types
    const upper = res.toUpperCase();
    const map: Record<string, string> = {
        'BOWLS': 'BOWL',
        'DECORATIVE BOWLS': 'BOWL',
        'FLOOR LAMPS': 'FLOOR LAMP',
        'TOWER LAMPS': 'TOWER LAMP',
        'TABLE LAMPS': 'TABLE LAMP',
        'DESK LAMPS': 'DESK LAMP',
        'LAMPS': 'LAMP',
        'PENDANT LIGHTS': 'PENDANT LIGHT',
        'WALL PANELS': 'WALL PANEL',
        'PLATES': 'PLATE',
        'DECORATIVE PLATES': 'PLATE',
        'TRAYS': 'TRAY',
        'DECORATIVE TRAYS': 'TRAY',
        'SINKS': 'SINK',
        'WASHBASINS': 'SINK',
        'SCULPTURES': 'SCULPTURE',
        'SCULPTURES & STATUES': 'SCULPTURE',
        'STATUES': 'SCULPTURE',
        'VASES': 'VASE',
        'TABLES': 'TABLE',
        'PEDESTALS': 'PEDESTAL',
        'STANDS': 'STAND',
        'BATHTUBS': 'BATHTUB',
        'FOUNTAINS': 'FOUNTAIN',
        'MIRRORS': 'MIRROR',
        'COASTERS': 'COASTER',
        'CANDLEHOLDERS': 'CANDLEHOLDER',
        'CANDLES': 'CANDLEHOLDER',
        'WINE RACKS': 'WINE RACK',
        'WINE STOPPERS': 'WINE STOPPER',
        'CHESS SETS': 'CHESS SET',
    };

    if (map[upper]) {
        return map[upper];
    }

    if (upper.endsWith('S') && !upper.endsWith('SS')) {
        return upper.slice(0, -1);
    }

    return upper;
}

/**
 * Resolves clean product type (e.g. "BOWL", "FLOOR LAMP", "TOWER LAMP") eliminating taxonomy paths like "HOME DECOR > ...".
 */
function resolveCleanProductType(norm: any, itemDataObj: any, shapeStr?: string): string {
    // 1. Staff ground truth shortDescription if distinct from shape and not containing hierarchy
    const sd = (norm?.shortDescription || itemDataObj?.short_description || itemDataObj?.shortDescription || '').trim();
    if (sd && !sd.includes('>') && !sd.includes('›')) {
        const cleanSd = cleanSingleTypeName(sd);
        if (!shapeStr || cleanSd.toLowerCase() !== shapeStr.toLowerCase()) {
            return cleanSd;
        }
    }

    // 2. Raw type or generated type
    let raw = (
        norm?.generatedType || 
        itemDataObj?.generated_type || 
        itemDataObj?.generatedType || 
        norm?.canonicalType || 
        norm?.type || 
        itemDataObj?.type || 
        itemDataObj?.Type || 
        ''
    ).trim();

    if (raw.includes('>') || raw.includes('›')) {
        raw = raw.split(/[>›]/).pop()?.trim() || '';
    }

    if (raw) {
        const cleanRaw = cleanSingleTypeName(raw);
        if (!shapeStr || cleanRaw.toLowerCase() !== shapeStr.toLowerCase()) {
            return cleanRaw;
        }
    }

    // 3. Fallback to shortDescription if it had hierarchy
    if (sd) {
        let t = sd;
        if (t.includes('>') || t.includes('›')) {
            t = t.split(/[>›]/).pop()?.trim() || '';
        }
        const cleanSd = cleanSingleTypeName(t);
        if (cleanSd) return cleanSd;
    }

    return '';
}

/**
 * Resolves the transparent cutout PNG for an item to float in the title bar.
 */
export function getItemCutoutPng(item: any): string | null {
    if (!item) return null;
    const it = item.data || item;
    const norm = normalizeInventoryData(it);

    const candidates = [
        norm.generatedPngUrl,
        it.generated_png_url,
        it.generatedPngUrl,
        norm.maskUrl,
        it.maskUrl,
        it.mask_url,
        it.cutoutUrl
    ];

    for (const c of candidates) {
        if (c && typeof c === 'string' && !isHexMapUrl(c) && !isVideoFile(c)) {
            return getCleanImageUrl(c) || c;
        }
    }

    // Check spatial_masks
    const spMasks = it.spatial_masks || it.spatialMasks || norm.spatialMasks || norm.spatial_masks;
    if (spMasks) {
        let mObj = spMasks;
        if (typeof mObj === 'string') {
            try { mObj = JSON.parse(mObj); } catch (e) {}
        }
        if (typeof mObj === 'object' && mObj) {
            if (Array.isArray(mObj) && mObj.length > 0) {
                const u = mObj[0].cutoutUrl || mObj[0].pngUrl || mObj[0].mask;
                if (u && typeof u === 'string') return getCleanImageUrl(u) || u;
            } else {
                const angle0 = (mObj as any).angle_0 || Object.values(mObj)[0];
                if (angle0) {
                    if (Array.isArray(angle0) && angle0.length > 0) {
                        const u = angle0[0].cutoutUrl || angle0[0].mask || angle0[0].pngUrl;
                        if (u && typeof u === 'string') return getCleanImageUrl(u) || u;
                    } else if (typeof angle0 === 'string') {
                        return getCleanImageUrl(angle0) || angle0;
                    }
                }
            }
        }
    }

    // Check images array for any transparent PNG cutout
    const imgs = item.images || it.images;
    if (Array.isArray(imgs)) {
        for (const u of imgs) {
            if (typeof u === 'string' && isPngCutoutUrl(u) && !isHexMapUrl(u) && !isVideoFile(u)) {
                return getCleanImageUrl(u) || u;
            }
        }
    }

    return null;
}

/**
 * Resolves images for catalogue export:
 * - Clean room studio photos are prioritized as the large HERO image.
 * - Raw uploaded warehouse photos and SVG vectors are STRICTLY EXCLUDED.
 * - For lamps: if 2+ photos exist, photo 2 (lights on) is normalized as Hero.
 * - For bowls: photo 1 is side view (Hero), photo 2 is top view.
 * - For mirrors/panels: photo 1 is front view lights on (Hero).
 * - Transparent PNG cutouts are placed AFTER studio photos to render as smaller secondary grid images.
 * - Deduplicates by file ID so the same cutout is never rendered twice.
 */
export function getItemImages(item: any): string[] {
    if (!item) return [];

    const norm = normalizeInventoryData(item.data || item);
    const itemDataObj = item.data || item;

    const isClean = (u?: string): u is string => {
        if (!u || typeof u !== 'string') return false;
        if (isHexMapUrl(u)) return false;
        if (isVideoFile(u)) return false;
        if (isSvgUrl(u)) return false;
        return /^https?:\/\//i.test(u);
    };

    // 1. Parse processed_media_urls to get true clean room studio replacements
    let processedMap: Record<string, any> = {};
    const rawProcessed = norm.processedMediaUrls || norm.processed_media_urls || itemDataObj.processed_media_urls || itemDataObj.processedMediaUrls;
    if (rawProcessed) {
        if (typeof rawProcessed === 'object') {
            processedMap = rawProcessed as Record<string, any>;
        } else {
            const str = String(rawProcessed).trim();
            if (str.startsWith('{')) {
                try { processedMap = JSON.parse(str) || {}; } catch (e) {}
            }
        }
    }

    // Set of known raw source warehouse photos that must NOT be exported unless substituted
    const rawSourceStills = new Set<string>();
    const allRaw = collectAllImages(norm, { dropVideos: true });
    for (const r of allRaw) {
        const c = cleanStillUrl(r);
        if (c) rawSourceStills.add(c);
        const fid = extractFileId(r);
        if (fid) rawSourceStills.add(fid);
    }

    // Clean room studio photos collected
    const studioPhotos: string[] = [];
    const seenFileIds = new Set<string>();

    const addStudioPhoto = (u: string) => {
        const c = cleanStillUrl(u);
        if (!c || !isClean(c) || isPngCutoutUrl(c)) return;
        const fid = extractFileId(c) || c;
        if (seenFileIds.has(fid)) return;
        seenFileIds.add(fid);
        studioPhotos.push(c);
    };

    // A) ProcessedMap substitutions: for each source still, if there is a clean room replacement, use the replacement!
    for (const rawUrl of allRaw) {
        const hit = processedMap[rawUrl];
        if (typeof hit === 'string' && isClean(hit)) {
            addStudioPhoto(hit);
        }
    }

    // B) Any other non-metadata value in processedMap that is a clean room photo
    for (const [key, val] of Object.entries(processedMap)) {
        if (key.startsWith('_') || isHexMapUrl(key)) continue;
        if (typeof val === 'string' && isClean(val)) {
            addStudioPhoto(val);
        }
    }

    // 2. Collect transparent PNG cutouts (rendered in smaller secondary grid, never raw warehouse photos)
    const pngCutouts: string[] = [];
    const addPngCutout = (u?: string) => {
        if (!u) return;
        const c = cleanStillUrl(u);
        if (!c || !isClean(c)) return;
        const fid = extractFileId(c) || c;
        if (seenFileIds.has(fid)) return;
        // Strict guard: if this URL is an un-cleaned raw warehouse photo, do NOT treat it as a clean PNG!
        if (rawSourceStills.has(fid) || rawSourceStills.has(c)) {
            return;
        }
        seenFileIds.add(fid);
        pngCutouts.push(c);
    };

    // Add explicit generated cutout PNGs
    addPngCutout(norm.generatedPngUrl);
    addPngCutout(item.generated_png_url);
    addPngCutout(item.generatedPngUrl);
    addPngCutout(itemDataObj.generated_png_url);
    addPngCutout(itemDataObj.generatedPngUrl);
    addPngCutout(norm.maskUrl);
    addPngCutout(item.maskUrl);
    addPngCutout(itemDataObj.mask_url);

    // 3. Normalize ordering of Clean Room Studio Photos based on product shape / type rules:
    const shapeStr = (norm.shape || norm.shortDescription || itemDataObj.Shape || '').toLowerCase();
    const typeStr = (norm.generatedType || norm.canonicalType || norm.type || itemDataObj.Type || '').toLowerCase();
    const descStr = (norm.description || norm.title || itemDataObj.Title || '').toLowerCase();

    const isLamp = shapeStr.includes('lamp') || shapeStr.includes('lantern') || shapeStr.includes('pendant') || 
                   shapeStr.includes('light') || shapeStr.includes('sconce') || typeStr.includes('lamp') || descStr.includes('lamp');
    const isBowl = shapeStr.includes('bowl') || shapeStr.includes('sink') || shapeStr.includes('basin') || 
                   shapeStr.includes('vessel') || shapeStr.includes('tray') || shapeStr.includes('plate') || shapeStr.includes('dish') || typeStr.includes('bowl');
    const isMirrorOrPanel = shapeStr.includes('mirror') || shapeStr.includes('panel') || shapeStr.includes('slab') || 
                            shapeStr.includes('wall') || typeStr.includes('mirror') || descStr.includes('mirror');

    let orderedStudioPhotos = [...studioPhotos];

    if (isLamp && orderedStudioPhotos.length >= 2) {
        if (orderedStudioPhotos.length === 2) {
            orderedStudioPhotos = [orderedStudioPhotos[1], orderedStudioPhotos[0]];
        } else if (orderedStudioPhotos.length >= 4) {
            orderedStudioPhotos = [
                orderedStudioPhotos[1],
                orderedStudioPhotos[0],
                orderedStudioPhotos[3],
                orderedStudioPhotos[2],
                ...orderedStudioPhotos.slice(4)
            ];
        } else if (orderedStudioPhotos.length === 3) {
            orderedStudioPhotos = [orderedStudioPhotos[1], orderedStudioPhotos[0], orderedStudioPhotos[2]];
        }
    } else if (isBowl && orderedStudioPhotos.length >= 2) {
        // Natural order: photo0 side view (Hero), photo1 top view
    } else if (isMirrorOrPanel && orderedStudioPhotos.length >= 2) {
        // Natural order: photo0 front view lights on (Hero)
    }

    // User requirement: Gallery images must show authentic clean room photos only, NO PNG or SVG cutouts in gallery
    if (orderedStudioPhotos.length > 0) {
        return orderedStudioPhotos;
    }

    // Fallback if no clean room photos exist at all
    if (pngCutouts.length > 0) {
        return pngCutouts;
    }

    return [];
}

/**
 * Renders an item in Vertical Portrait mode: Full width title on top, larger hero image,
 * smaller secondary grid, color bubbles, larger axo, and NO retail price.
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
    const itemDataObj = item.data || item;
    const fullW = PW - 2 * M;

    // 1. Uploaded quantity, shape, type, color, material, sizes attributes for main title
    const qtyWord = formatQuantityText(norm.quantity || 1);
    const rawShape = (norm.shape || (item.data ? item.data.Shape : '') || '').trim();
    const cleanType = resolveCleanProductType(norm, itemDataObj, rawShape);

    let shape = rawShape;
    if (!shape && norm.shortDescription && cleanType !== cleanSingleTypeName(norm.shortDescription)) {
        shape = norm.shortDescription.trim();
    }

    const color = (norm.color || (item.data ? item.data.Color : '') || '').trim();
    const material = (norm.material || (item.data ? item.data.Material : '') || 'Mexican Onyx').trim();

    const attrParts = [shape, cleanType, color, material].filter(Boolean);
    if (attrParts.length === 0) {
        attrParts.push('SCULPTURAL FORM');
    }
    const attrStr = Array.from(new Set(attrParts)).join(' · ').replace(/\s+/g, ' ').trim().toUpperCase();

    // Metric dimensions: e.g. 30×30×220cm
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm || norm.widthCm || norm.heightCm ? 'cm' : '');

    // Full title: TWO • SQUARED · FLOOR LAMP · GALAXY · ONYX • 30×30×220cm
    let mainTitleStr = `${qtyWord} • ${attrStr}`;
    if (dimsMetric) {
        mainTitleStr += ` • ${dimsMetric}`;
    }

    // Classification below main title
    const catAndTypeGrid = getProductCategoryAndType(norm);
    const classificationStr = [catAndTypeGrid.category, catAndTypeGrid.type].filter(Boolean).join('  ›  ').toUpperCase();

    // Resolve cutout PNG to place to the left of the title
    const topY = M;
    const cutoutUrl = getItemCutoutPng(item);
    let cutoutImgData: any = null;
    let cutoutW = 0;
    let cutoutH = 0;

    if (cutoutUrl) {
        try {
            cutoutImgData = await loadImgData(cutoutUrl, 400, true);
            if (cutoutImgData && cutoutImgData.dataUrl) {
                const maxCutoutH = 30;
                const maxCutoutW = 36;
                if (cutoutImgData.w && cutoutImgData.h) {
                    const aspect = cutoutImgData.w / cutoutImgData.h;
                    const boxAspect = maxCutoutW / maxCutoutH;
                    if (aspect > boxAspect) {
                        cutoutW = maxCutoutW;
                        cutoutH = maxCutoutW / aspect;
                    } else {
                        cutoutH = maxCutoutH;
                        cutoutW = maxCutoutH * aspect;
                    }
                } else {
                    cutoutH = maxCutoutH;
                    cutoutW = maxCutoutH;
                }
            }
        } catch (e) {
            console.warn('[pdfExport] Failed to load cutout PNG for title:', e);
        }
    }

    // Top Right Corner Block: Barcode + Small QR Code (same height as barcode) + TagID/Retail/Acq matching width
    const barW = 38;
    const barH = 8.0;
    const qrSize = barH; // small QR code same height as barcode
    const codeGap = 2.0;
    const totalCodesW = barW + codeGap + qrSize; // 48.0mm
    const rightEdge = PW - M;
    const blockX = rightEdge - totalCodesW;
    const barX = blockX;
    const qrX = blockX + barW + codeGap;

    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) {}

    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 30, lineColor: '#141414' });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) {}

    if (barDataUrl) {
        doc.addImage(barDataUrl, 'PNG', barX, topY, barW, barH);
    }

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, topY, qrSize, qrSize);
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        const qrCenterX = qrX + qrSize / 2;
        const qrCenterY = topY + qrSize / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 1.4, 'F');
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 0.95, 'F');
    }

    // TAGID + Retail + Acquisition Code line: EXACT same width as [ Barcode ] [ QR ]
    const tagTextY = topY + barH + 3.2;
    drawFormattedTagCode(doc, codes, blockX, tagTextY, 9, false, itemDataObj, totalCodesW);

    const titleGap = cutoutW > 0 ? 3.5 : 0;
    const titleX = M + cutoutW + titleGap;
    const titleW = blockX - titleX - 4.0;

    // 2. Main Title, Shopify Subtitle, and Classification
    const shopifySubTitle = getShopifyTitleSubtitle(norm, itemDataObj, mainTitleStr);

    doc.setFontSize(12.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(mainTitleStr, titleW);
    doc.text(splitTitle, titleX, topY + 4.5);

    let currTitleY = topY + 4.5 + (splitTitle.length > 1 ? (splitTitle.length - 1) * 4.3 : 0);

    // Shopify Title as Subtitle directly under deterministic title
    if (shopifySubTitle) {
        currTitleY += 4.3;
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        const splitShopify = doc.splitTextToSize(shopifySubTitle, titleW);
        doc.text(splitShopify, titleX, currTitleY);
        currTitleY += (splitShopify.length > 1 ? (splitShopify.length - 1) * 3.8 : 0);
    }

    // Classification line
    if (classificationStr) {
        currTitleY += 4.2;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(classificationStr, titleX, currTitleY);
    }

    // Color glass bubble indicators stacked vertically under the classification subtitle
    const extractedColors = getItemExtractedColors(norm, itemDataObj);
    let afterBubblesY = currTitleY + 2.0;
    if (extractedColors.length > 0) {
        afterBubblesY = drawVerticalColorBubbles(doc, extractedColors, titleX, currTitleY + 2.0, 4);
    }

    let subY = afterBubblesY + 1.5;

    // Draw cutout PNG to the left of the title block
    if (cutoutImgData && cutoutImgData.dataUrl) {
        const titleBlockTotalH = Math.max(cutoutH, subY - topY);
        const pngY = topY + Math.max(0, (titleBlockTotalH - cutoutH) / 2);
        doc.addImage(cutoutImgData.dataUrl, 'PNG', M, pngY, cutoutW, cutoutH);
    }

    const headerBottomY = Math.max(topY + cutoutH, subY, tagTextY + 2.0);

    // 4. Content Zone
    const contentY = headerBottomY + 3.5;
    const contentH = PH - 58 - contentY;
    const imgs = getItemImages(item).filter(u => !isHexMapUrl(u));

    const shopifyOrInvoiceTitle = normalizeBrandTerms(
        itemDataObj.shopifyTitle || 
        itemDataObj.shopify_title || 
        itemDataObj.invoiceTitle || 
        itemDataObj.invoice_title || 
        itemDataObj.title || 
        itemDataObj.generatedTitle || 
        itemDataObj.generated_title || 
        itemDataObj.detailed_description || 
        itemDataObj.description || 
        norm.description || 
        ''
    ).replace(/\s+/g, ' ').trim().toUpperCase();

    if (imgs.length === 0) {
        try {
            const heroAxo = await getAdvancedAxoDataUrl(norm, itemDataObj);
            if (heroAxo) {
                const axoSize = Math.min(fullW * 0.75, contentH * 0.5, 95);
                doc.addImage(heroAxo, heroAxo.startsWith('data:image/png') ? 'PNG' : 'JPEG', M + (fullW - axoSize) / 2, contentY + 2, axoSize, axoSize);
            }
        } catch (e) {}

        const descY = contentY + contentH * 0.55;
        const descH = contentH * 0.45;
        const marketingHtml = normalizeBrandTerms(item.data?.marketing_description || item.data?.generatedDescription || item.data?.generated_description || '');
        renderStyledMarketingHtml(doc, marketingHtml, M, descY, fullW, descH);
    } else if (imgs.length === 1) {
        const imgBoxH = contentH * 0.58;
        const currentImgUrl = imgs[0];
        const imgData = await loadImgData(currentImgUrl, 800, false, '#FFFFFF', 6);
        if (imgData) {
            drawContain(doc, imgData, M, contentY, fullW, imgBoxH, 1.0);
        }
        const descY = contentY + imgBoxH + 4;
        const descH = contentH - imgBoxH - 4;
        const marketingHtml = normalizeBrandTerms(item.data?.marketing_description || item.data?.generatedDescription || item.data?.generated_description || '');
        renderStyledMarketingHtml(doc, marketingHtml, M, descY, fullW, descH);
    } else {
        // Multiple clean room images: FIRST IMAGE LARGER, SECONDARY IMAGES & PNGS SMALLER GRID
        const heroH = contentH * 0.44;
        const heroImgData = await loadImgData(imgs[0], 800, false, '#FFFFFF', 6);
        if (heroImgData) {
            drawContain(doc, heroImgData, M, contentY, fullW, heroH, 1.0);
        }

        const secY = contentY + heroH + 2.5;
        const secH = contentH * 0.22;
        const secImgs = imgs.slice(1, 5);
        const gap = 3;
        const colW = (fullW - (secImgs.length - 1) * gap) / secImgs.length;

        for (let idx = 0; idx < secImgs.length; idx++) {
            const secData = await loadImgData(secImgs[idx], 800, false, '#FFFFFF', 4);
            const gx = M + idx * (colW + gap);
            if (secData) {
                drawContain(doc, secData, gx, secY, colW, secH, 0.96);
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.2);
                doc.roundedRect(gx, secY, colW, secH, 1, 1, 'S');
            }
        }

        const descY = secY + secH + 4;
        const descH = contentH - (descY - contentY);
        const marketingHtml = normalizeBrandTerms(item.data?.marketing_description || item.data?.generatedDescription || item.data?.generated_description || '');
        renderStyledMarketingHtml(doc, marketingHtml, M, descY, fullW, descH);
    }

    // 5. Advanced Axonometric icon & Horizontal Dimensions Panel at bottom
    const iconSize = 44;
    const bottomY = PH - 48;
    const axoX = M + (fullW - iconSize) / 2;
    
    try {
        const smallAxoUrl = await getAdvancedAxoDataUrl(norm, item.data || item);
        if (smallAxoUrl) {
            doc.addImage(smallAxoUrl, smallAxoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', axoX, bottomY - 6, iconSize, iconSize);
        }
    } catch (e) {}

    const wImp = cmToImperial(norm.widthCm) || toImp(norm.widthCm, 'in') || '—';
    const hImp = cmToImperial(norm.heightCm) || toImp(norm.heightCm, 'in') || '—';
    const dImp = cmToImperial(norm.lengthCm) || toImp(norm.lengthCm, 'in') || '—';
    const wtImp = toImp(norm.weightKg, 'lbs') || '—';
    const ovImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ') || '—';

    // Horizontal imperial sizes panel underneath the Axo
    const specCols = [
        { label: 'WIDTH', val: wImp },
        { label: 'HEIGHT', val: hImp },
        { label: 'DEPTH', val: dImp },
        { label: 'WEIGHT', val: wtImp },
    ];
    const colGap = 3.5;
    const cellW = (fullW - (specCols.length - 1) * colGap) / specCols.length;
    const cellH = 8.5;
    const sizesY = bottomY - 6 + iconSize + 2.5;

    specCols.forEach((col, idx) => {
        const cx = M + idx * (cellW + colGap);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, sizesY, cellW, cellH, 0.8, 0.8, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.18);
        doc.roundedRect(cx, sizesY, cellW, cellH, 0.8, 0.8, 'S');

        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(col.label, cx + cellW / 2, sizesY + 3.0, { align: 'center' });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(col.val, cx + cellW / 2, sizesY + 6.8, { align: 'center' });
    });

    // Overall line eliminated per design guidelines
}

/**
 * Draws vertically stacked imperial sizes card (WIDTH, HEIGHT, DEPTH, WEIGHT)
 * designed with Apple HIG precision to sit next to the Axo in the bottom carousel.
 * Redundant 'OVERALL' text eliminated.
 */
function drawVerticalImperialSizesCard(
    doc: any,
    norm: any,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const wImp = cmToImperial(norm.widthCm) || toImp(norm.widthCm, 'in') || '—';
    const hImp = cmToImperial(norm.heightCm) || toImp(norm.heightCm, 'in') || '—';
    const dImp = cmToImperial(norm.lengthCm) || toImp(norm.lengthCm, 'in') || '—';
    const wtImp = toImp(norm.weightKg, 'lbs') || '—';

    // Outer card container
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 1.0, 1.0, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 1.0, 1.0, 'S');

    const specs = [
        { label: 'WIDTH', val: wImp },
        { label: 'HEIGHT', val: hImp },
        { label: 'DEPTH', val: dImp },
        { label: 'WEIGHT', val: wtImp },
    ];

    const rowH = h / specs.length;

    specs.forEach((spec, idx) => {
        const rowY = y + idx * rowH;

        // Subtle row hairline divider between rows
        if (idx > 0) {
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.18);
            doc.line(x + 2, rowY, x + w - 2, rowY);
        }

        // Label on left
        doc.setFontSize(5.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(spec.label, x + 3.0, rowY + rowH / 2 + 1.2);

        // Value on right
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(spec.val, x + w - 3.0, rowY + rowH / 2 + 1.2, { align: 'right' });
    });
}

/**
 * Detects whether an item is a tower lamp / floor lamp with tall monolithic form factor.
 */
function isTowerLamp(norm: any, itemDataObj: any, cleanType?: string): boolean {
    const text = [
        cleanType || '',
        norm?.shortDescription || '',
        itemDataObj?.short_description || '',
        itemDataObj?.shortDescription || '',
        norm?.type || '',
        itemDataObj?.type || '',
        itemDataObj?.Type || '',
        norm?.canonicalType || '',
        norm?.generatedType || '',
        itemDataObj?.generated_type || '',
        itemDataObj?.generatedType || '',
        norm?.shape || '',
        itemDataObj?.Shape || ''
    ].join(' ').toLowerCase();

    return text.includes('tower lamp') || 
           text.includes('floor lamp') || 
           text.includes('lampara torre') || 
           text.includes('lampara de torre') || 
           text.includes('lamp tower') || 
           text.includes('pillar') ||
           cleanType === 'TOWER LAMP' || 
           cleanType === 'FLOOR LAMP';
}

/**
 * Renders an item in Horizontal Landscape mode: Full width title on top, multiple clean room images
 * with hero larger on top and secondary grid below, color bubbles, larger axo, and NO retail price.
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
    const itemDataObj = item.data || item;
    const fullW = PW - 2 * M;

    // 1. Uploaded quantity, shape, type, color, material, sizes attributes for main title
    const qtyWord = formatQuantityText(norm.quantity || 1);
    const rawShape = (norm.shape || (item.data ? item.data.Shape : '') || '').trim();
    const cleanType = resolveCleanProductType(norm, itemDataObj, rawShape);

    let shape = rawShape;
    if (!shape && norm.shortDescription && cleanType !== cleanSingleTypeName(norm.shortDescription)) {
        shape = norm.shortDescription.trim();
    }

    const color = (norm.color || (item.data ? item.data.Color : '') || '').trim();
    const material = (norm.material || (item.data ? item.data.Material : '') || 'Mexican Onyx').trim();

    const attrParts = [shape, cleanType, color, material].filter(Boolean);
    if (attrParts.length === 0) {
        attrParts.push('SCULPTURAL FORM');
    }
    const attrStr = Array.from(new Set(attrParts)).join(' · ').replace(/\s+/g, ' ').trim().toUpperCase();

    // Metric dimensions: e.g. 30×30×220cm
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm || norm.widthCm || norm.heightCm ? 'cm' : '');

    // Full title: TWO • SQUARED · FLOOR LAMP · GALAXY · ONYX • 30×30×220cm
    let mainTitleStr = `${qtyWord} • ${attrStr}`;
    if (dimsMetric) {
        mainTitleStr += ` • ${dimsMetric}`;
    }

    // Classification below main title
    const catAndTypeGrid = getProductCategoryAndType(norm);
    const classificationStr = [catAndTypeGrid.category, catAndTypeGrid.type].filter(Boolean).join('  ›  ').toUpperCase();

    // Resolve cutout PNG to place to the left of the title
    const topY = M;
    const cutoutUrl = getItemCutoutPng(item);
    let cutoutImgData: any = null;
    let cutoutW = 0;
    let cutoutH = 0;

    if (cutoutUrl) {
        try {
            cutoutImgData = await loadImgData(cutoutUrl, 400, true);
            if (cutoutImgData && cutoutImgData.dataUrl) {
                const maxCutoutH = 30;
                const maxCutoutW = 36;
                if (cutoutImgData.w && cutoutImgData.h) {
                    const aspect = cutoutImgData.w / cutoutImgData.h;
                    const boxAspect = maxCutoutW / maxCutoutH;
                    if (aspect > boxAspect) {
                        cutoutW = maxCutoutW;
                        cutoutH = maxCutoutW / aspect;
                    } else {
                        cutoutH = maxCutoutH;
                        cutoutW = maxCutoutH * aspect;
                    }
                } else {
                    cutoutH = maxCutoutH;
                    cutoutW = maxCutoutH;
                }
            }
        } catch (e) {
            console.warn('[pdfExport] Failed to load cutout PNG for title:', e);
        }
    }

    // Top Right Corner Block: Barcode + Small QR Code (same height as barcode) + TagID/Retail/Acq matching width
    const barW = 38;
    const barH = 8.0;
    const qrSize = barH; // small QR code same height as barcode
    const codeGap = 2.0;
    const totalCodesW = barW + codeGap + qrSize; // 48.0mm
    const rightEdge = PW - M;
    const blockX = rightEdge - totalCodesW;
    const barX = blockX;
    const qrX = blockX + barW + codeGap;

    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) {}

    let barDataUrl = '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 30, lineColor: '#141414' });
        barDataUrl = canvas.toDataURL('image/png');
    } catch (e) {}

    if (barDataUrl) {
        doc.addImage(barDataUrl, 'PNG', barX, topY, barW, barH);
    }

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, topY, qrSize, qrSize);
        const tagVColor = getVendorColor(barcode);
        const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
        const qrCenterX = qrX + qrSize / 2;
        const qrCenterY = topY + qrSize / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(qrCenterX, qrCenterY, 1.4, 'F');
        doc.setFillColor(tagHexColor);
        doc.circle(qrCenterX, qrCenterY, 0.95, 'F');
    }

    // TAGID + Retail + Acquisition Code line: EXACT same width as [ Barcode ] [ QR ]
    const tagTextY = topY + barH + 3.2;
    drawFormattedTagCode(doc, codes, blockX, tagTextY, 9, false, itemDataObj, totalCodesW);

    const titleGap = cutoutW > 0 ? 3.5 : 0;
    const titleX = M + cutoutW + titleGap;
    const titleW = blockX - titleX - 4.0;

    // 2. Main Title, Shopify Subtitle, and Classification
    const shopifySubTitle = getShopifyTitleSubtitle(norm, itemDataObj, mainTitleStr);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(mainTitleStr, titleW);
    doc.text(splitTitle, titleX, topY + 4.5);

    let currTitleY = topY + 4.5 + (splitTitle.length > 1 ? (splitTitle.length - 1) * 4.3 : 0);

    // Shopify Title as Subtitle directly under deterministic title
    if (shopifySubTitle) {
        currTitleY += 4.3;
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        const splitShopify = doc.splitTextToSize(shopifySubTitle, titleW);
        doc.text(splitShopify, titleX, currTitleY);
        currTitleY += (splitShopify.length > 1 ? (splitShopify.length - 1) * 3.8 : 0);
    }

    // Classification line
    if (classificationStr) {
        currTitleY += 4.2;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(classificationStr, titleX, currTitleY);
    }

    // Color glass bubble indicators stacked vertically under the classification subtitle
    const extractedColors = getItemExtractedColors(norm, itemDataObj);
    let afterBubblesY = currTitleY + 2.0;
    if (extractedColors.length > 0) {
        afterBubblesY = drawVerticalColorBubbles(doc, extractedColors, titleX, currTitleY + 2.0, 4);
    }

    let subY = afterBubblesY + 1.5;

    // Draw cutout PNG to the left of the title block
    if (cutoutImgData && cutoutImgData.dataUrl) {
        const titleBlockTotalH = Math.max(cutoutH, subY - topY);
        const pngY = topY + Math.max(0, (titleBlockTotalH - cutoutH) / 2);
        doc.addImage(cutoutImgData.dataUrl, 'PNG', M, pngY, cutoutW, cutoutH);
    }

    const headerBottomY = Math.max(topY + cutoutH, subY, tagTextY + 2.0);

    // 4. Content Area: Dynamic Image Grid
    // Rules:
    // - Single-image items: third size gallery completely hidden, single image shown larger (full contentH), Axo falls to medium size space under description (no double axo).
    // - Tower lamps with two portrait images as main image: third size gallery hidden, two portrait images shown larger side-by-side (full contentH), Axo falls to medium size panel under description.
    // - Multi-image items: 3-tier dynamic grid with bottom carousel.
    const contentY = headerBottomY + 3.5;
    const contentH = PH - 14 - contentY;
    const imgs = getItemImages(item).filter(u => !isHexMapUrl(u));
    const isTower = isTowerLamp(norm, itemDataObj, cleanType);

    const isSingleImg = imgs.length <= 1;
    const isTowerTwoImg = isTower && (imgs.length === 2 || imgs.length === 3);
    const hideBottomCarousel = isSingleImg || isTowerTwoImg;

    if (hideBottomCarousel) {
        // =========================================================================
        // CASE A: Single Image or Tower Lamp 2-Portrait Main Images (No Bottom Carousel)
        // =========================================================================
        const leftW = isTowerTwoImg ? 162 : 158;
        const rightX = M + leftW + 8;
        const rightW = fullW - leftW - 8;

        // LEFT SECTION: Large Hero Image(s) occupying FULL content height
        if (isTowerTwoImg && imgs.length >= 2) {
            // Two large portrait images side by side
            const largeGap = 4.0;
            const eachLargeW = (leftW - largeGap) / 2;
            for (let i = 0; i < 2; i++) {
                const lx = M + i * (eachLargeW + largeGap);
                const lData = await loadImgData(imgs[i], 800, false, '#FFFFFF', 6);
                if (lData) {
                    drawContain(doc, lData, lx, contentY, eachLargeW, contentH, 0.98);
                    doc.setDrawColor(241, 245, 249);
                    doc.setLineWidth(0.2);
                    doc.roundedRect(lx, contentY, eachLargeW, contentH, 1, 1, 'S');
                }
            }
        } else if (imgs.length === 1) {
            // Single image shown significantly larger (full content height)
            const heroData = await loadImgData(imgs[0], 800, false, '#FFFFFF', 6);
            if (heroData) {
                drawContain(doc, heroData, M, contentY, leftW, contentH, 0.98);
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.2);
                doc.roundedRect(M, contentY, leftW, contentH, 1, 1, 'S');
            }
        } else {
            // Fallback for 0 images: hero wireframe strictly aspect-contained
            try {
                const heroAxo = await getAdvancedAxoDataUrl(norm, item.data || item);
                if (heroAxo) {
                    drawAxoContain(doc, heroAxo, M, contentY, leftW, contentH, 0.88);
                }
            } catch (e) {}
        }

        // RIGHT SECTION: Compact Description + Axo & Vertical Imperial Sizes in Medium Space
        const descMaxH = Math.min(32, contentH * 0.26);
        const marketingHtml = normalizeBrandTerms(item.data?.marketing_description || item.data?.generatedDescription || item.data?.generated_description || '');
        if (marketingHtml) {
            renderStyledMarketingHtml(doc, marketingHtml, rightX, contentY + 1, rightW, descMaxH);
        }

        const midY = contentY + 1 + descMaxH + 4;
        const midH = contentH - descMaxH - 6;

        let axoDataUrl: string | null = null;
        try {
            axoDataUrl = await getAdvancedAxoDataUrl(norm, itemDataObj);
        } catch (e) {}

        if (isTowerTwoImg && imgs.length === 3) {
            // Tower lamp with 3 images: 3rd image is 1st medium panel, Axo is 2nd medium panel
            const medGap = 3.5;
            const eachMedW = (rightW - medGap) / 2;
            const mData = await loadImgData(imgs[2], 800, false, '#FFFFFF', 5);
            if (mData) {
                drawContain(doc, mData, rightX, midY, eachMedW, midH, 0.98);
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.2);
                doc.roundedRect(rightX, midY, eachMedW, midH, 1, 1, 'S');
            }

            const axoX = rightX + eachMedW + medGap;
            const axoCardH = Math.min(midH * 0.58, 48);
            if (axoDataUrl) {
                drawAxoContain(doc, axoDataUrl, axoX, midY, eachMedW, axoCardH, 0.94);
            }
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.2);
            doc.roundedRect(axoX, midY, eachMedW, axoCardH, 1, 1, 'S');

            const sizesY = midY + axoCardH + 3.0;
            const sizesH = midH - axoCardH - 3.0;
            drawVerticalImperialSizesCard(doc, norm, axoX, sizesY, eachMedW, sizesH);
        } else {
            // Single image or Tower lamp with 2 images: Axo element falls to medium panel side-by-side with Imperial Sizes
            const gap = 4.0;
            const cardH = Math.min(midH, 68);
            const axoW = (rightW - gap) * 0.52;
            const sizesW = rightW - gap - axoW;

            if (axoDataUrl) {
                drawAxoContain(doc, axoDataUrl, rightX, midY, axoW, cardH, 0.94);
            }
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.2);
            doc.roundedRect(rightX, midY, axoW, cardH, 1, 1, 'S');

            const sizesX = rightX + axoW + gap;
            drawVerticalImperialSizesCard(doc, norm, sizesX, midY, sizesW, cardH);
        }
    } else {
        // =========================================================================
        // CASE B: Multi-Image Items with 3-Tier Dynamic Grid (Bottom Carousel Active)
        // =========================================================================
        let largeImgs: string[] = [];
        let mediumImgs: string[] = [];
        let smallImgs: string[] = [];

        if (isTower && imgs.length >= 4) {
            largeImgs = [imgs[0], imgs[1]];
            if (imgs.length >= 5) {
                mediumImgs = [imgs[2], imgs[4]];
                smallImgs = imgs.filter((_, idx) => idx !== 0 && idx !== 1 && idx !== 2 && idx !== 4);
            } else {
                mediumImgs = [imgs[2], imgs[3]];
                smallImgs = [];
            }
        } else {
            largeImgs = imgs.length > 0 ? [imgs[0]] : [];
            if (imgs.length >= 3) {
                mediumImgs = [imgs[2]];
                smallImgs = imgs.filter((_, idx) => idx !== 0 && idx !== 2);
            } else if (imgs.length === 2) {
                mediumImgs = [imgs[1]];
                smallImgs = [];
            }
        }

        const secPanelH = 38;
        const secPanelY = contentY + contentH - secPanelH;
        const upperH = secPanelY - contentY - 3.5;

        const leftW = 158;
        const rightX = M + leftW + 8;
        const rightW = fullW - leftW - 8;

        // UPPER LEFT: Large Hero Images
        if (largeImgs.length === 2) {
            const largeGap = 4.0;
            const eachLargeW = (leftW - largeGap) / 2;
            for (let i = 0; i < 2; i++) {
                const lx = M + i * (eachLargeW + largeGap);
                const lData = await loadImgData(largeImgs[i], 800, false, '#FFFFFF', 6);
                if (lData) {
                    drawContain(doc, lData, lx, contentY, eachLargeW, upperH, 0.98);
                    doc.setDrawColor(241, 245, 249);
                    doc.setLineWidth(0.2);
                    doc.roundedRect(lx, contentY, eachLargeW, upperH, 1, 1, 'S');
                }
            }
        } else if (largeImgs.length === 1) {
            const heroData = await loadImgData(largeImgs[0], 800, false, '#FFFFFF', 6);
            if (heroData) {
                drawContain(doc, heroData, M, contentY, leftW, upperH, 0.98);
            }
        }

        // UPPER RIGHT: Compact Description + Larger Medium Images
        let rY = contentY + 1;
        const descMaxH = Math.min(24, upperH * 0.22);
        const marketingHtml = normalizeBrandTerms(item.data?.marketing_description || item.data?.generatedDescription || item.data?.generated_description || '');
        if (marketingHtml) {
            renderStyledMarketingHtml(doc, marketingHtml, rightX, rY, rightW, descMaxH);
        }

        const midY = rY + descMaxH + 2.5;
        const midH = upperH - descMaxH - 3.5;

        if (mediumImgs.length === 2) {
            const medGap = 3.5;
            const eachMedW = (rightW - medGap) / 2;
            for (let i = 0; i < 2; i++) {
                const mx = rightX + i * (eachMedW + medGap);
                const mData = await loadImgData(mediumImgs[i], 800, false, '#FFFFFF', 5);
                if (mData) {
                    drawContain(doc, mData, mx, midY, eachMedW, midH, 0.98);
                    doc.setDrawColor(241, 245, 249);
                    doc.setLineWidth(0.2);
                    doc.roundedRect(mx, midY, eachMedW, midH, 1, 1, 'S');
                }
            }
        } else if (mediumImgs.length === 1) {
            const mData = await loadImgData(mediumImgs[0], 800, false, '#FFFFFF', 5);
            if (mData) {
                drawContain(doc, mData, rightX, midY, rightW, midH, 0.98);
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.2);
                doc.roundedRect(rightX, midY, rightW, midH, 1, 1, 'S');
            }
        }

        // LOWER FULL-WIDTH CAROUSEL: Remaining Small Images + Axo + Vertical Stacked Imperial Sizes
        const displayThumbs = smallImgs.slice(0, 5);
        const numThumbs = displayThumbs.length;
        const gap = 3.5;
        const axoW = 38;
        const sizesW = 38;
        const fixedEndW = axoW + gap + sizesW;

        let axoDataUrl: string | null = null;
        try {
            axoDataUrl = await getAdvancedAxoDataUrl(norm, itemDataObj);
        } catch (e) {}

        if (numThumbs > 0) {
            const availThumbsW = fullW - fixedEndW - gap;
            const colW = (availThumbsW - (numThumbs - 1) * gap) / numThumbs;

            for (let idx = 0; idx < numThumbs; idx++) {
                const gx = M + idx * (colW + gap);
                const d = await loadImgData(displayThumbs[idx], 800, false, '#FFFFFF', 4);
                if (d) {
                    drawContain(doc, d, gx, secPanelY, colW, secPanelH, 0.96);
                }
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.2);
                doc.roundedRect(gx, secPanelY, colW, secPanelH, 1, 1, 'S');
            }

            const axoX = M + numThumbs * (colW + gap);
            if (axoDataUrl) {
                drawAxoContain(doc, axoDataUrl, axoX, secPanelY, axoW, secPanelH, 0.94);
            }
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.2);
            doc.roundedRect(axoX, secPanelY, axoW, secPanelH, 1, 1, 'S');

            const sizesX = axoX + axoW + gap;
            drawVerticalImperialSizesCard(doc, norm, sizesX, secPanelY, sizesW, secPanelH);
        } else {
            const axoX = PW - M - fixedEndW;
            if (axoDataUrl) {
                drawAxoContain(doc, axoDataUrl, axoX, secPanelY, axoW, secPanelH, 0.94);
            }
            doc.setDrawColor(241, 245, 249);
            doc.setLineWidth(0.2);
            doc.roundedRect(axoX, secPanelY, axoW, secPanelH, 1, 1, 'S');

            const sizesX = axoX + axoW + gap;
            drawVerticalImperialSizesCard(doc, norm, sizesX, secPanelY, sizesW, secPanelH);
        }
    }
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


function normalizeSummaryShape(rawShape: string): string {
    const s = (rawShape || '').trim().toUpperCase();
    if (!s) return 'SCULPTURAL';
    if (s.includes('CYLINDER') || s.includes('CILIND')) return 'CYLINDER';
    if (s.includes('SQUARE') || s.includes('CUADRAD')) return 'SQUARED';
    if (s.includes('RECTANG')) return 'RECTANGULAR';
    if (s.includes('ROUND') || s.includes('REDOND') || s.includes('CIRC')) return 'ROUND';
    if (s.includes('OVAL')) return 'OVAL';
    if (s.includes('FREE') || s.includes('ORGANIC')) return 'FREE FORM';
    if (s.includes('BOULDER')) return 'BOULDER';
    if (s.includes('CUBE') || s.includes('CUBO')) return 'CUBE';
    if (s.includes('DIAMOND') || s.includes('DIAMANTE')) return 'DIAMOND';
    if (s.includes('LARGE') || s.includes('GRANDE')) return 'LARGE';
    if (s.includes('MEDIUM') || s.includes('MEDIAN')) return 'MEDIUM';
    if (s.includes('SMALL') || s.includes('CHIC') || s.includes('PEQUEN')) return 'SMALL';
    if (s.includes('MINI')) return 'MINI';
    return cleanSingleTypeName(s);
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
    await yieldToUi(true);

    const totalItems = results.length;
    let grandTotalUnits = 0;
    let grandTotalWeightKg = 0;
    const fullW = PW - 2 * M;

    interface TypeGroupAccumulator {
        type: string;
        typeCanonId: string;
        shapeCounts: Map<string, number>;
        colorsSet: Set<string>;
        sizesSet: Set<string>;
        itemCount: number;
        totalUnits: number;
        totalWeightKg: number;
    }

    const typeGroupsMap = new Map<string, TypeGroupAccumulator>();
    const shapeFrequencyMap = new Map<string, number>();
    const distinctTypesSet = new Set<string>();

    for (const it of results) {
        const d = it.data || it;
        const norm = normalizeInventoryData(d);
        const qty = parseInt(norm.quantity || '1', 10) || 1;
        const wt = parseFloat(norm.weightKg || '0') || 0;

        const rawShape = (norm.shape || d.shape || d.Shape || '').trim();
        const cleanType = resolveCleanProductType(norm, d, rawShape) || 'STONE PIECE';
        const cleanShape = normalizeSummaryShape(rawShape || (norm.shortDescription && norm.shortDescription !== cleanType ? norm.shortDescription : ''));

        distinctTypesSet.add(cleanType);
        shapeFrequencyMap.set(cleanShape, (shapeFrequencyMap.get(cleanShape) || 0) + qty);

        const colorName = (norm.color || d.color || d.Color || norm.generatedColor || '').trim();
        const matName = (norm.material || d.material || d.Material || 'Onyx').trim();
        let colorMatStr = 'NATURAL STONE';
        if (colorName && matName) {
            if (colorName.toUpperCase().includes(matName.toUpperCase())) {
                colorMatStr = colorName.toUpperCase();
            } else {
                colorMatStr = `${colorName.toUpperCase()} • ${matName.toUpperCase()}`;
            }
        } else if (colorName) {
            colorMatStr = colorName.toUpperCase();
        } else if (matName) {
            colorMatStr = matName.toUpperCase();
        }

        const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm || norm.widthCm || norm.heightCm ? 'cm' : '');

        grandTotalUnits += qty;
        grandTotalWeightKg += (wt * qty);

        let grp = typeGroupsMap.get(cleanType);
        if (!grp) {
            const canon = canonicalType(cleanType, rawShape);
            grp = {
                type: cleanType,
                typeCanonId: canon.id || cleanType.toLowerCase().replace(/\s+/g, '-'),
                shapeCounts: new Map<string, number>(),
                colorsSet: new Set<string>(),
                sizesSet: new Set<string>(),
                itemCount: 0,
                totalUnits: 0,
                totalWeightKg: 0,
            };
            typeGroupsMap.set(cleanType, grp);
        }

        grp.itemCount += 1;
        grp.totalUnits += qty;
        grp.totalWeightKg += (wt * qty);
        grp.shapeCounts.set(cleanShape, (grp.shapeCounts.get(cleanShape) || 0) + qty);
        if (colorMatStr) grp.colorsSet.add(colorMatStr);
        if (dimsMetric) grp.sizesSet.add(dimsMetric);
    }

    // Determine top distinct shapes to display as columns (e.g. up to 6 in landscape, 4 in portrait)
    const sortedShapesByFreq = Array.from(shapeFrequencyMap.keys()).sort(
        (a, b) => (shapeFrequencyMap.get(b) || 0) - (shapeFrequencyMap.get(a) || 0)
    );
    const maxShapeCols = isLandscape ? 6 : 4;
    const activeShapes = sortedShapesByFreq.slice(0, maxShapeCols);
    const hasOtherShapes = sortedShapesByFreq.length > maxShapeCols;
    const shapeColumns = hasOtherShapes ? [...activeShapes, 'OTHER'] : activeShapes;

    // Sort Product Types by totalUnits descending
    const sortedTypeGroups = Array.from(typeGroupsMap.values()).sort((a, b) => b.totalUnits - a.totalUnits);

    const grandTotalWeightLbs = grandTotalWeightKg * 2.20462;
    const grandTotalTypes = sortedTypeGroups.length;

    // Page 1 of Summary
    addPage();

    // Title & Header block
    doc.setFontSize(isLandscape ? 15 : 17);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(catalogTitle || 'ONYX COLLECTION CATALOGUE', M, isLandscape ? 18 : 22);

    doc.setFontSize(isLandscape ? 7.5 : 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('EXECUTIVE SPECIFICATION MANIFEST • AGGREGATED BY PRODUCT TYPE & SHAPE', M, isLandscape ? 23 : 28);

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`DATE: ${dateStr}`, PW - M, isLandscape ? 18 : 22, { align: 'right' });
    doc.text(`${totalItems} ITEMS  •  ${grandTotalUnits} UNITS  •  ${grandTotalTypes} PRODUCT TYPES`, PW - M, isLandscape ? 23 : 28, { align: 'right' });

    // Hairline Header Divider
    const divY = isLandscape ? 27 : 32;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, divY, PW - M, divY);

    // 4 KPI Summary Cards (NO RETAIL!)
    const cardY = divY + 3.5;
    const cardH = isLandscape ? 16 : 20;
    const gap = 3.5;
    const cardW = (fullW - 3 * gap) / 4;

    const kpis = [
        { label: 'TOTAL ITEMS', val: `${totalItems}`, sub: 'CATALOG LINE ITEMS' },
        { label: 'TOTAL QUANTITY', val: `${grandTotalUnits}`, sub: 'AGGREGATE PIECES' },
        { label: 'TOTAL ESTIMATED WEIGHT', val: `${Math.round(grandTotalWeightKg).toLocaleString()} kg`, sub: `${Math.round(grandTotalWeightLbs).toLocaleString()} lbs` },
        { label: 'PRODUCT TYPES', val: `${grandTotalTypes}`, sub: `${sortedShapesByFreq.length} SHAPE FAMILIES` },
    ];

    kpis.forEach((kpi, idx) => {
        const cx = M + idx * (cardW + gap);
        doc.setFillColor(252, 253, 255);
        doc.roundedRect(cx, cardY, cardW, cardH, 1.5, 1.5, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(cx, cardY, cardW, cardH, 1.5, 1.5, 'S');

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, cx + 3.5, cardY + 5);

        doc.setFontSize(isLandscape ? 11 : 12.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(kpi.val, cx + 3.5, cardY + (isLandscape ? 10.5 : 12.5));

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(kpi.sub, cx + 3.5, cardY + (isLandscape ? 14 : 17));
    });

    // Compute column widths with generous space for Colors & Sizes
    const colTypeW = isLandscape ? 46 : 38;
    const shapeColW = isLandscape ? 12.0 : 10.0;
    const totalShapesW = shapeColumns.length * shapeColW;
    const colItemsW = isLandscape ? 10.0 : 8.5;
    const colUnitsW = isLandscape ? 10.0 : 8.5;
    const colWeightW = isLandscape ? 28.0 : 21.0;
    const remW = Math.max(30, fullW - (colTypeW + totalShapesW + colItemsW + colUnitsW + colWeightW));
    const colColorsW = Math.round(remW * 0.52);
    const colSizesW = remW - colColorsW;

    // Coordinate helpers
    const xType = M;
    const xShapes = xType + colTypeW;
    const xColors = xShapes + totalShapesW;
    const xSizes = xColors + colColorsW;
    const xItems = xSizes + colSizesW;
    const xUnits = xItems + colItemsW;
    const xWeight = xUnits + colUnitsW;

    const headerH = 8.5;

    const drawTableHeader = (startY: number) => {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, startY, fullW, headerH, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.25);
        doc.line(M, startY, PW - M, startY);
        doc.line(M, startY + headerH, PW - M, startY + headerH);

        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('PRODUCT TYPE', xType + 3.5, startY + 5.8);

        // Shape Column Headers: text only, NO hairline icons per user requirement
        shapeColumns.forEach((sName, sIdx) => {
            const sx = xShapes + sIdx * shapeColW;
            doc.setFontSize(6.0);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            const maxChars = isLandscape ? 9 : 7;
            const sLabel = sName.length > maxChars ? sName.slice(0, maxChars - 1) + '…' : sName;
            doc.text(sLabel, sx + shapeColW / 2, startY + 5.8, { align: 'center' });
        });

        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('COLORS & MATERIAL', xColors + 2.5, startY + 5.8);
        doc.text('SIZES', xSizes + 2.5, startY + 5.8);
        doc.text('ITEMS', xItems + colItemsW - 2, startY + 5.8, { align: 'right' });
        doc.text('UNITS', xUnits + colUnitsW - 2, startY + 5.8, { align: 'right' });
        doc.text(isLandscape ? 'WEIGHT (KG / LBS)' : 'WEIGHT', xWeight + colWeightW - 3, startY + 5.8, { align: 'right' });
    };

    let tableY = cardY + cardH + 5;
    drawTableHeader(tableY);
    let rowY = tableY + headerH;
    const baseMinRowH = 13.5; // Minimum row height ensuring prominent 11mm hairline figures
    const lineH = 2.56;
    const lineHType = 2.92;
    const iconSize = 11.0;

    for (let i = 0; i < sortedTypeGroups.length; i++) {
        if (i % 3 === 0) {
            await yieldToUi();
        }

        const group = sortedTypeGroups[i];
        const wtKgFmt = `${Math.round(group.totalWeightKg).toLocaleString()} kg`;
        const wtLbsFmt = `${Math.round(group.totalWeightKg * 2.20462).toLocaleString()} lbs`;

        // 1. Pre-calculate wrapped lines for Product Type
        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'bold');
        const typeTextAvailW = colTypeW - (iconSize + 5.5);
        const splitType = doc.splitTextToSize(group.type, typeTextAvailW);

        // 2. Pre-calculate wrapped lines for Colors & Material
        doc.setFontSize(6.3);
        doc.setFont('helvetica', 'normal');
        const colorsArr = Array.from(group.colorsSet).filter(Boolean);
        const colorsStr = colorsArr.length > 0 ? colorsArr.join(', ') : '—';
        const splitColors = doc.splitTextToSize(colorsStr, colColorsW - 4.5);

        // 3. Pre-calculate wrapped lines for Sizes
        const sizesArr = Array.from(group.sizesSet).filter(Boolean);
        const sizesStr = sizesArr.length > 0 ? sizesArr.join(', ') : '—';
        const splitSizes = doc.splitTextToSize(sizesStr, colSizesW - 4.5);

        // 4. Calculate dynamic row height to fit all wrapped lines without overlapping
        const colorsReqH = (splitColors.length - 1) * lineH + 5.5;
        const sizesReqH = (splitSizes.length - 1) * lineH + 5.5;
        const typeReqH = (splitType.length - 1) * lineHType + 5.5;
        const currRowH = Math.max(baseMinRowH, colorsReqH, sizesReqH, typeReqH);

        // Page break check with dynamic row height
        if (rowY + currRowH > PH - 20) {
            addPage();
            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('EXECUTIVE SPECIFICATION MANIFEST • GROUPED BY TYPE (CONTINUED)', M, isLandscape ? 16 : 20);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(M, isLandscape ? 19 : 24, PW - M, isLandscape ? 19 : 24);

            tableY = isLandscape ? 22 : 27;
            drawTableHeader(tableY);
            rowY = tableY + headerH;
        }

        // Alternating row background
        if (i % 2 === 1) {
            doc.setFillColor(253, 254, 255);
            doc.rect(M, rowY, fullW, currRowH, 'F');
        }

        // 1. PRODUCT TYPE & HAIRLINE ICON (11.0mm, vertically centered)
        let hasRenderedIcon = false;
        try {
            const tIcon = getHairlineIconDataUrl(group.typeCanonId || group.type, null, '#1E293B');
            if (tIcon) {
                const iconY = rowY + (currRowH - iconSize) / 2;
                doc.addImage(tIcon, 'PNG', xType + 2.0, iconY, iconSize, iconSize);
                hasRenderedIcon = true;
            }
        } catch (e) {}

        const typeTextX = hasRenderedIcon ? xType + iconSize + 3.5 : xType + 3.0;
        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const typeSpan = (splitType.length - 1) * lineHType + 2.4;
        const typeBaselineY = rowY + (currRowH - typeSpan) / 2 + 1.8;
        doc.text(splitType, typeTextX, typeBaselineY);

        const midBaselineY = rowY + currRowH / 2 + 1.2;

        // 2. SHAPE COLUMNS (Quantities per shape)
        shapeColumns.forEach((sName, sIdx) => {
            const sx = xShapes + sIdx * shapeColW;
            let count = 0;
            if (sName === 'OTHER') {
                for (const [k, v] of group.shapeCounts.entries()) {
                    if (!activeShapes.includes(k)) count += v;
                }
            } else {
                count = group.shapeCounts.get(sName) || 0;
            }

            if (count > 0) {
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(String(count), sx + shapeColW / 2, midBaselineY, { align: 'center' });
            } else {
                doc.setFontSize(7.0);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(203, 213, 225);
                doc.text('-', sx + shapeColW / 2, midBaselineY, { align: 'center' });
            }
        });

        // 3. COLORS & MATERIAL (Vertically centered, wrapping into new lines)
        doc.setFontSize(6.3);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const colorsSpan = (splitColors.length - 1) * lineH + 2.0;
        const colorsBaselineY = rowY + (currRowH - colorsSpan) / 2 + 1.5;
        doc.text(splitColors, xColors + 2.5, colorsBaselineY);

        // 4. SIZES (Vertically centered, wrapping into new lines)
        const sizesSpan = (splitSizes.length - 1) * lineH + 2.0;
        const sizesBaselineY = rowY + (currRowH - sizesSpan) / 2 + 1.5;
        doc.text(splitSizes, xSizes + 2.5, sizesBaselineY);

        // 5. ITEMS
        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(String(group.itemCount), xItems + colItemsW - 2, midBaselineY, { align: 'right' });

        // 6. UNITS
        doc.text(String(group.totalUnits), xUnits + colUnitsW - 2, midBaselineY, { align: 'right' });

        // 7. WEIGHT
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const wtStr = isLandscape ? `${wtKgFmt} (${wtLbsFmt})` : wtKgFmt;
        doc.text(wtStr, xWeight + colWeightW - 3, midBaselineY, { align: 'right' });

        // Hairline divider at bottom of this expanded row
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.18);
        doc.line(M, rowY + currRowH, PW - M, rowY + currRowH);

        rowY += currRowH;
    }

    // Grand Totals Row (NO RETAIL)
    if (rowY + 9.0 > PH - 22) {
        addPage();
        rowY = isLandscape ? 20 : 24;
    }

    const totalRowH = 8.5;
    doc.setFillColor(248, 250, 252);
    doc.rect(M, rowY, fullW, totalRowH, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(M, rowY, PW - M, rowY);
    doc.line(M, rowY + totalRowH, PW - M, rowY + totalRowH);

    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`GRAND TOTALS  (${grandTotalTypes} TYPES • ${totalItems} ITEMS)`, xType + 3.5, rowY + 5.5);

    // Sum per shape column
    shapeColumns.forEach((sName, sIdx) => {
        const sx = xShapes + sIdx * shapeColW;
        let totalShapeQty = 0;
        if (sName === 'OTHER') {
            for (const grp of sortedTypeGroups) {
                for (const [k, v] of grp.shapeCounts.entries()) {
                    if (!activeShapes.includes(k)) totalShapeQty += v;
                }
            }
        } else {
            totalShapeQty = shapeFrequencyMap.get(sName) || 0;
        }

        if (totalShapeQty > 0) {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(String(totalShapeQty), sx + shapeColW / 2, rowY + 5.5, { align: 'center' });
        }
    });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(totalItems), xItems + colItemsW - 2, rowY + 5.5, { align: 'right' });
    doc.text(String(grandTotalUnits), xUnits + colUnitsW - 2, rowY + 5.5, { align: 'right' });

    const totalWtStr = isLandscape 
        ? `${Math.round(grandTotalWeightKg).toLocaleString()} kg (${Math.round(grandTotalWeightLbs).toLocaleString()} lbs)`
        : `${Math.round(grandTotalWeightKg).toLocaleString()} kg`;
    doc.text(totalWtStr, xWeight + colWeightW - 3, rowY + 5.5, { align: 'right' });

    await yieldToUi(true);
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

            // Left side: Big Clean Onyx Logo on left edge + MADE IN MEXICO & Page Number
            const onyxTargetH = 9.5;
            const onyxW = onyxLogo ? Math.min(26, onyxTargetH * onyxLogo.aspectRatio) : 12;
            const onyxH = onyxLogo ? onyxW / onyxLogo.aspectRatio : onyxTargetH;
            const yOnyx = PH - 8.5 - onyxH / 2;

            if (onyxLogo) {
                doc.addImage(onyxLogo.dataUrl, 'PNG', M, yOnyx, onyxW, onyxH);
            }

            const mimTextX = M + (onyxLogo ? onyxW + 4 : 0);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            const mimText = 'MADE IN MEXICO';
            doc.text(mimText, mimTextX, PH - 8.5);

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(`·   Page ${globalPageNum}`, mimTextX + doc.getTextWidth(mimText) + 3, PH - 8.5);

            // Right side: Rare Earth Gallery (bigger) and Art of Decor aligned to right edge
            const aodTargetH = 7.5;
            const aodW = artOfDecorLogo ? Math.min(28, aodTargetH * artOfDecorLogo.aspectRatio) : 24;
            const aodH = artOfDecorLogo ? aodW / artOfDecorLogo.aspectRatio : aodTargetH;

            const regTargetH = 9.0;
            const regW = rareEarthLogo ? Math.min(38, regTargetH * rareEarthLogo.aspectRatio) : 34;
            const regH = rareEarthLogo ? regW / rareEarthLogo.aspectRatio : regTargetH;

            let currX = PW - M;

            if (artOfDecorLogo) {
                currX -= aodW;
                const aodY = PH - 8.5 - aodH / 2;
                doc.addImage(artOfDecorLogo.dataUrl, 'PNG', currX, aodY, aodW, aodH);
                currX -= 6;
            }

            if (rareEarthLogo) {
                currX -= regW;
                const regY = PH - 8.5 - regH / 2;
                doc.addImage(rareEarthLogo.dataUrl, 'PNG', currX, regY, regW, regH);
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
        await yieldToUi(true);
        await drawCatalogSummaryPages(doc, results, M, PW, PH, addPage, isLandscape, config.title);
        await yieldToUi(true);

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
