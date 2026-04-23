/**
 * crateManifesto.ts
 * Generates a dense, tabular shipping manifesto PDF for a packed crate.
 * Each row includes a live QR code linking to the item's inventory record.
 */
import { jsPDF } from 'jspdf';
import { cmToImperial } from './utils';

export interface ManifestoItem {
    index: number;            // DB item number (numeric portion from itemId)
    vendorPrefix: string;
    qty: number;
    itemId: string;           // Workbook barcode tag (e.g. EM-001-T)
    rowId: string;            // DB row id used for the artifact URL
    name: string;             // Shape + short description
    material: string;
    color: string;            // Item color property
    dims: string;             // e.g. "60×40×30 cm"
    weightKg: number;
    costMxn: number;
    costUsd: number;
    imageUrls?: string[];
    tagColor: string;
    dbItemCount: number;      // Total quantity in DB for this item
}

export interface ManifestoMeta {
    dynamicId: string;
    crateId: string;
    crateDims: string;        // "W×L×H cm"
    crateType: string;
    fillPct: number;
    exportedAt: string;
    baseArtifactUrl?: string; // e.g. "https://app.myco.com/inventory" — appended with ?item=<rowId>
    excludeImages?: boolean;  // If true, skips downloading and rendering item photos
    crateColor?: string;      // Main vendor color for styling the wireframe icon
    exportNotes?: string;     // Custom notes or alternate title injected from UI
    exportBruteWeight?: string; // Appended brute weight input from UI
    excludeHeader?: boolean;  // If true, skips the top panel entirely
}

// ─── QR Code via free API ────────────────────────────────────────────────────
// Uses api.qrserver.com to render a tiny QR PNG from a URL string.
async function loadQrDataUrl(text: string, sizePx = 80): Promise<string | null> {
    const encoded = encodeURIComponent(text);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&format=png&data=${encoded}`;
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => res(el);
            el.onerror = rej;
            el.src = qrUrl;
            setTimeout(() => rej(new Error('qr timeout')), 8000);
        });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        return c.toDataURL('image/png');
    } catch { return null; }
}

// Uses barcodeapi.org to render a Code 128 barcode PNG from a string.
async function loadBarcodeDataUrl(text: string): Promise<string | null> {
    const encoded = encodeURIComponent(text);
    const url = `https://barcodeapi.org/api/code128/${encoded}`;
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => res(el);
            el.onerror = rej;
            el.src = url;
            setTimeout(() => rej(new Error('barcode timeout')), 8000);
        });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        return c.toDataURL('image/png');
    } catch { return null; }
}

async function loadImageDataUrl(url: string, maxPx = 80): Promise<{ dataUrl: string, w: number, h: number } | null> {
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => res(el);
            el.onerror = rej;
            el.src = url;
            setTimeout(() => rej(new Error('img timeout')), 8000);
        });
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        return { dataUrl: c.toDataURL('image/jpeg', 0.82), w, h };
    } catch { return null; }
}

function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return [120, 120, 120];
    const n = parseInt(clean, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Main Export Function ────────────────────────────────────────────────────
export async function exportCrateManifesto(
    items: ManifestoItem[],
    meta: ManifestoMeta,
    onProgress?: (pct: number) => void
): Promise<void> {
    // Sort items by descending quantity (#)
    const sortedItems = [...items].sort((a, b) => b.qty - a.qty);

    // US Letter landscape: 11" × 8.5" = 279.4mm × 215.9mm
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const PW = 279.4;
    const PH = 215.9;
    const ML = 6; // margin left
    const MR = 6; // margin right

    // ─── Palette (light theme) ────────────────────────────────────────────────
    const BG      : [number, number, number] = [255, 255, 255];
    const SURFACE : [number, number, number] = [245, 245, 245];
    const BORDER  : [number, number, number] = [210, 210, 210];
    const ACCENT  : [number, number, number] = [217, 90, 10];   // darker orange for contrast on white
    const TEXT_HI : [number, number, number] = [15, 15, 15];
    const TEXT_MID: [number, number, number] = [70, 70, 70];
    const TEXT_LO : [number, number, number] = [150, 150, 150];

    // ─── Background ──────────────────────────────────────────────────────────
    doc.setFillColor(...BG);
    doc.rect(0, 0, PW, PH, 'F');

    // ─── Header ──────────────────────────────────────────────────────────────
    const HDR_H = meta.excludeHeader ? 0 : 22;
    if (!meta.excludeHeader) {
        doc.setFillColor(...SURFACE);
        doc.rect(0, 0, PW, HDR_H, 'F');
        // Removed orange bottom border line

        // Header QR — Left side
        const headerQrUrl = await loadQrDataUrl(meta.dynamicId, 200);
        if (headerQrUrl) {
            const qrSize = 14;
            const bx = ML;
            const by = 2;
            doc.setFillColor(255, 255, 255);
            doc.rect(bx - 0.5, by - 0.5, qrSize + 1, qrSize + 1, 'F');
            doc.addImage(headerQrUrl, 'PNG', bx, by, qrSize, qrSize);
        }

        // Header layout structural assignments
        const ts = ML + 42; // Title start (shifted right to fit QR and new Icon position)

        // Crate Name (Dynamic ID)
        const didMatch = meta.dynamicId.match(/^(\d+)(.*)$/);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const idY = 14;

        if (didMatch) {
            doc.setTextColor(0, 0, 0);
            doc.text(didMatch[1], ts - 1, idY);
            const offset = doc.getTextWidth(didMatch[1]);
            if (meta.crateColor) {
                const [cr, cg, cb] = hexToRgb(meta.crateColor);
                doc.setTextColor(cr, cg, cb);
            } else {
                doc.setTextColor(0, 0, 0);
            }
            doc.text(didMatch[2], ts - 1 + offset, idY);
        } else {
            doc.setTextColor(0, 0, 0);
            doc.text(meta.dynamicId, ts - 1, idY);
        }

        // Optional Internal Text / Custom Title
        if (meta.exportNotes) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text(meta.exportNotes.toUpperCase(), ts - 1, 18);
        }

        // Crate meta — Right aligned panel
        const totalUnits = items.reduce((s, i) => s + i.qty, 0);
        const totalWeight = items.reduce((s, i) => s + i.weightKg * i.qty, 0);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        let weightStr = `${totalWeight.toFixed(1)} kg NET`;
        if (meta.exportBruteWeight) {
            weightStr += `  ·  ${meta.exportBruteWeight.trim()} BRUTE`;
        }
        const metaLine = `${meta.crateType.toUpperCase()}  ·  ${meta.crateDims}  ·  ${items.length} SKU(s)  ·  ${totalUnits} units  ·  ${weightStr}  ·  ${meta.exportedAt}`;
        doc.text(metaLine, PW - MR, 12, { align: 'right' });

        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Crate: ${meta.crateId.slice(0, 16).toUpperCase()}  ·  Fill: ${meta.fillPct.toFixed(1)}%`, PW - MR, 18, { align: 'right' });

        // ─── Wireframe Icon — top right of header ─────────────────────────────────
        try {
            const dims = meta.crateDims.split(/[x×]/).map(n => parseFloat(n));
            const cw = dims[0] || 60, cl = dims[1] || 60, ch = dims[2] || 60;
            const visH = meta.crateType.toLowerCase() === 'pallet' ? 15 : ch;
            const maxDim = Math.max(cw, cl, visH, 1);
            
            const sizePx = 14; // 14mm box target
            const scale = (sizePx * 0.75) / maxDim;
            const dw = cw * scale, dl = cl * scale, dh = visH * scale;
            const depth = dl * 0.38;
            const dx = depth, dy = -depth;
            
            const iconX = ML + 22; // Position perfectly between the QR and the Title
            const iconY = 4 + depth; // Push down equal to depth so it doesn't clip top
            const x0 = iconX, y0 = iconY;
            const x1 = x0 + dw, y1 = y0;
            const x2 = x1, y2 = y0 + dh;
            const x3 = x0, y3 = y0 + dh;

            // Draw color (Dynamic vendor color or default red #f87171)
            let R = 248, G = 113, B = 113;
            if (meta.crateColor) {
                const [cr, cg, cb] = hexToRgb(meta.crateColor);
                R = cr; G = cg; B = cb;
            }
            
            // Back dashed edges
            doc.setDrawColor(R, G, B);
            doc.setLineWidth(0.3);
            doc.setLineDashPattern([1, 1], 0);
            doc.line(x0 + dx, y0 + dy, x0 + dx, y3 + dy);
            doc.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy);
            doc.line(x0 + dx, y3 + dy, x1 + dx, y2 + dy);
            doc.setLineDashPattern([], 0); // reset
            
            doc.setLineWidth(0.6);
            // Top face
            doc.line(x0, y0, x0 + dx, y0 + dy);
            doc.line(x1, y1, x1 + dx, y1 + dy);
            doc.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy);
            // Right face
            doc.line(x1 + dx, y1 + dy, x1 + dx, y2 + dy);
            doc.line(x1, y2, x1 + dx, y2 + dy);
            // Front face
            doc.rect(x0, y0, dw, dh, 'S');
            
            // Braces
            if (meta.crateType.toLowerCase() !== 'pallet') {
                doc.setLineWidth(0.3);
                doc.line(x0, y0, x1, y2);
                doc.line(x1, y0, x0, y2);
            }
            
            // Fill % solid bar on front
            if (meta.fillPct > 0) {
                doc.setFillColor(R, G, B);
                const fh = Math.max(0.1, dh * (meta.fillPct / 100)) - 1;
                if (fh > 0) {
                    // semi transparency using hex is not natively supported directly on all pdf readers but solid is fine
                    doc.rect(x0 + 0.5, y0 + dh - fh - 0.5, dw - 1, fh, 'F');
                }
            }
        } catch (e) {
            // Silently skip wireframe if math fails
        }
    }

    // ─── Column definitions (no price columns) ────────────────────────────────
    // QR | Photo | Tag ID | Item Name & Details | Dimensions & Weight | Qty
    const TABLE_END = PW - MR;
    const COL_QR   = { x: ML,       w: 18  }; 
    const COL_IMG  = { x: COL_QR.x + COL_QR.w,  w: meta.excludeImages ? 0 : 18  }; 
    const COL_TAG  = { x: COL_IMG.x + COL_IMG.w,  w: 38  }; 
    const COL_NAME = { x: COL_TAG.x + COL_TAG.w,  w: 100 + (meta.excludeImages ? 18 : 0)  }; 
    const COL_DIMS = { x: COL_NAME.x + COL_NAME.w, w: 55  }; 
    const COL_QTY  = { x: COL_DIMS.x + COL_DIMS.w, w: TABLE_END - (COL_DIMS.x + COL_DIMS.w) };


    // ─── Column header row ────────────────────────────────────────────────────
    const COL_HDR_Y = HDR_H;
    const COL_HDR_H = 6;
    doc.setFillColor(230, 230, 230);
    doc.rect(ML, COL_HDR_Y, TABLE_END - ML, COL_HDR_H, 'F');
    doc.setTextColor(...TEXT_LO);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    const hy = COL_HDR_Y + 5.5;
    doc.text('QR',              COL_QR.x   + COL_QR.w   / 2, hy, { align: 'center' });
    if (!meta.excludeImages) {
        doc.text('IMG',             COL_IMG.x  + COL_IMG.w  / 2, hy, { align: 'center' });
    }
    doc.text('TAG ID',          COL_TAG.x  + 2, hy);
    doc.text('ITEM DESCRIPTION',COL_NAME.x + 2, hy);
    doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, hy);
    doc.text('QTY',             COL_QTY.x  + 2, hy);

    // ─── Row rendering ────────────────────────────────────────────────────────
    const ROW_H = 18;
    const TABLE_START_Y = COL_HDR_Y + COL_HDR_H;
    const FOOTER_H = 7;
    const ROWS_PER_PAGE = Math.floor((PH - TABLE_START_Y - FOOTER_H) / ROW_H);

    function drawPageChrome(isFirst: boolean) {
        doc.setFillColor(...BG);
        doc.rect(0, 0, PW, PH, 'F');
        if (!isFirst && !meta.excludeHeader) {
            // Compact continuation header
            doc.setFillColor(...SURFACE);
            doc.rect(0, 0, PW, 10, 'F');
            doc.setDrawColor(...ACCENT);
            doc.setLineWidth(0.5);
            doc.line(0, 10, PW, 10);
            doc.setTextColor(...ACCENT);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text(`PACKING LIST  ${meta.dynamicId}  (cont.)`, ML, 7);
        }
    }

    function drawColHeaders(startY: number) {
        doc.setFillColor(230, 230, 230);
        doc.rect(ML, startY, TABLE_END - ML, COL_HDR_H, 'F');
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        const cy = startY + 5.5;
        doc.text('QR',               COL_QR.x   + COL_QR.w   / 2, cy, { align: 'center' });
        doc.text('IMG',              COL_IMG.x  + COL_IMG.w  / 2, cy, { align: 'center' });
        doc.text('TAG ID',           COL_TAG.x  + 2, cy);
        doc.text('ITEM DESCRIPTION', COL_NAME.x + 2, cy);
        doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, cy);
        doc.text('QTY',              COL_QTY.x  + 2, cy);
    }

    let currentPage = 0;
    let contTableStartY = meta.excludeHeader ? 0 : 12; // continuation pages: table starts below compact header
    let currentRow = 0;
    const itemsCount = sortedItems.length;

    for (let i = 0; i < itemsCount; i++) {
        onProgress?.(Math.round((i / itemsCount) * 90));
        const item = sortedItems[i];
        
        const imgList = item.imageUrls || [];
        const hasGallery = !meta.excludeImages && imgList.length > 1;
        const rowsNeeded = hasGallery ? 2 : 1;

        if (currentRow > 0 && currentRow + rowsNeeded > ROWS_PER_PAGE) {
            doc.addPage('letter', 'landscape');
            currentPage++;
            currentRow = 0;
            drawPageChrome(false);
            drawColHeaders(contTableStartY);
        }

        const tableY = currentPage === 0 ? TABLE_START_Y : contTableStartY + COL_HDR_H;
        const ry = tableY + currentRow * ROW_H;

        // Alternating row bg
        if (currentRow % 2 === 0) {
            doc.setFillColor(250, 250, 250);
            doc.rect(ML, ry, TABLE_END - ML, ROW_H, 'F');
        }
        // Row bottom border
        if (!hasGallery) {
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.2);
            doc.line(ML, ry + ROW_H, TABLE_END, ry + ROW_H);
        } else {
            doc.setDrawColor(240, 240, 240); // subtle separator before gallery
            doc.setLineWidth(0.2);
            doc.line(ML, ry + ROW_H, TABLE_END, ry + ROW_H);
        }

        // ── QR code ──────────────────────────────────────────────────────────
        const qrDataUrl = await loadQrDataUrl(item.itemId, 100);
        const qrSize = 14;
        const qrX = COL_QR.x + (COL_QR.w - qrSize) / 2;
        const qrY = ry + (ROW_H - qrSize) / 2;
        if (qrDataUrl) {
            doc.setFillColor(255, 255, 255);
            doc.rect(qrX - 0.5, qrY - 0.5, qrSize + 1, qrSize + 1, 'F');
            doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        } else {
            doc.setFillColor(...BORDER);
            doc.rect(qrX, qrY, qrSize, qrSize, 'F');
            doc.setTextColor(...TEXT_LO);
            doc.setFontSize(5.5);
            doc.text('NO QR', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
        }

        // ── Thumbnails ─────────────────────────────────────────────────────────
        const thumbZoneW = 14; 
        const thumbZoneX = COL_IMG.x + 2; 
        const thumbZoneY = ry + (ROW_H - thumbZoneW) / 2; // Center a 14x14 block in the row

        if (!meta.excludeImages) {
            if (imgList.length === 0) {
                // Placeholder empty
                doc.setFillColor(...BORDER);
                doc.rect(thumbZoneX, thumbZoneY, thumbZoneW, thumbZoneW, 'F');
            } else {
                // Main image takes the primary 20x20 slot
                const imgResult = await loadImageDataUrl(imgList[0], 120);
                if (imgResult) {
                    const { dataUrl, w, h } = imgResult;
                    const aspect = w / h;
                    let dw = thumbZoneW;
                    let dh = thumbZoneW;
                    if (aspect > 1) {
                        dh = thumbZoneW / aspect;
                    } else {
                        dw = thumbZoneW * aspect;
                    }
                    const dx = thumbZoneX + (thumbZoneW - dw) / 2;
                    const dy = thumbZoneY + (thumbZoneW - dh) / 2;

                    doc.setFillColor(240, 240, 240);
                    doc.rect(thumbZoneX, thumbZoneY, thumbZoneW, thumbZoneW, 'F');
                    doc.addImage(dataUrl, 'JPEG', dx, dy, dw, dh);
                } else {
                    doc.setFillColor(...BORDER);
                    doc.rect(thumbZoneX, thumbZoneY, thumbZoneW, thumbZoneW, 'F');
                }
            }
        } else {
            // Draw a subtle placeholder if images are excluded
            doc.setFillColor(250, 250, 250);
            doc.rect(thumbZoneX, thumbZoneY, thumbZoneW, thumbZoneW, 'F');
            doc.setDrawColor(...BORDER);
            doc.rect(thumbZoneX, thumbZoneY, thumbZoneW, thumbZoneW, 'D');
        }

        // ── Tag ID badge ──────────────────────────────────────────────────────
        const [tr, tg, tb] = hexToRgb(item.tagColor);
        const badgeText = item.itemId.length > 16 ? item.itemId.slice(0, 14) + '…' : item.itemId;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const badgeW = Math.min(COL_TAG.w - 4, doc.getTextWidth(badgeText) + 6);
        const badgeH = 7.5;
        const badgeX = COL_TAG.x + 2;
        const badgeY = ry + (ROW_H - badgeH) / 2 - 1.5; // Centered in row
        doc.setFillColor(tr, tg, tb);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(badgeText, badgeX + badgeW / 2, badgeY + 5.2, { align: 'center' });

        // Stock display removed per user request

        // ── Name & description ────────────────────────────────────────────────
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const nameStr = item.name.trim().slice(0, 50);
        doc.text(nameStr, COL_NAME.x + 2, ry + 10.5);
        const nameW = doc.getTextWidth(nameStr);

        // Color + Material pill badges — Moved next to name on the same row
        let pillX = COL_NAME.x + 2 + nameW + 3;
        const pillY = ry + 6.5; 
        const pillH = 5.2;
        const drawPill = (text: string, bgR: number, bgG: number, bgB: number, fgR = 30, fgG = 30, fgB = 30) => {
            if (!text) return;
            doc.setFontSize(7.5); // Larger tag text
            doc.setFont('helvetica', 'bold');
            const tw = doc.getTextWidth(text);
            const pw = tw + 5;
            doc.setFillColor(bgR, bgG, bgB);
            doc.roundedRect(pillX, pillY, pw, pillH, 1.2, 1.2, 'F');
            doc.setTextColor(fgR, fgG, fgB);
            doc.text(text, pillX + 2.5, pillY + 4);
            pillX += pw + 2;
        };
        if (item.color) {
            const [cr, cg, cb] = hexToRgb(item.tagColor);
            drawPill(item.color.toUpperCase(),
                Math.min(255, Math.round(cr * 0.12 + 224)),
                Math.min(255, Math.round(cg * 0.12 + 224)),
                Math.min(255, Math.round(cb * 0.12 + 224)),
                Math.round(cr * 0.65), Math.round(cg * 0.65), Math.round(cb * 0.65));
        }
        if (item.material) {
            drawPill(item.material.toUpperCase(), 228, 228, 228, 60, 60, 60);
        }


        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        // Removed internal ID display as per user request


        // ── Dimensions & weight ───────────────────────────────────────────────
        doc.setTextColor(...TEXT_MID);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        
        const dimStr = item.dims || '';
        doc.text(dimStr || '—', COL_DIMS.x + 2, ry + 7);
        
        // Imperial Dimensions (stacked below metric)
        const cmMatch = dimStr.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/);
        if (cmMatch) {
            const w = parseFloat(cmMatch[1]);
            const l = parseFloat(cmMatch[2]);
            const h = parseFloat(cmMatch[3]);
            const imp = [w, l, h].map(v => cmToImperial(v)).join(' × ');
            doc.setFontSize(7.5); // Slightly larger
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...TEXT_MID); // Darker than TEXT_LO
            doc.text(imp, COL_DIMS.x + 2, ry + 10.5);
        }

        doc.setFontSize(8); // Slightly larger weight font
        doc.setFont('helvetica', 'normal');
        if (item.weightKg > 0) {
            const kgText = `${item.weightKg} kg`;
            doc.setTextColor(...TEXT_HI); // Stronger contrast for weight
            doc.text(kgText, COL_DIMS.x + 2, ry + 14.5);
            const kgW = doc.getTextWidth(kgText);
            doc.setTextColor(...TEXT_MID);
            doc.text(` · ${(item.weightKg * 2.20462).toFixed(1)} lbs`, COL_DIMS.x + 2 + kgW, ry + 14.5);
        } else {
            doc.setTextColor(...TEXT_LO);
            doc.text('—', COL_DIMS.x + 2, ry + 14.5);
        }



        // ── Qty ───────────────────────────────────────────────────────────────
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`×${item.qty}`, COL_QTY.x + 2, ry + 13);

        // ── Secondary Gallery Row ──────────────────────────────────────────────
        if (hasGallery) {
            const gy = ry + ROW_H;
            if (currentRow % 2 === 0) {
                // Inherit background
                doc.setFillColor(250, 250, 250);
                doc.rect(ML, gy, TABLE_END - ML, ROW_H, 'F');
            }

            const gThumbW = 14;
            let gx = COL_IMG.x + 2; 
            const gThumbY = gy + (ROW_H - gThumbW) / 2;

            for (let j = 1; j < Math.min(10, imgList.length); j++) {
                const imgResult = await loadImageDataUrl(imgList[j], 120);
                if (imgResult) {
                    const { dataUrl, w, h } = imgResult;
                    const aspect = w / h;
                    let dw = gThumbW;
                    let dh = gThumbW;
                    if (aspect > 1) {
                        dh = gThumbW / aspect;
                    } else {
                        dw = gThumbW * aspect;
                    }
                    const dx = gx + (gThumbW - dw) / 2;
                    const dy = gThumbY + (gThumbW - dh) / 2;

                    doc.setFillColor(240, 240, 240);
                    doc.rect(gx, gThumbY, gThumbW, gThumbW, 'F');
                    doc.addImage(dataUrl, 'JPEG', dx, dy, dw, dh);
                } else {
                    doc.setFillColor(...BORDER);
                    doc.rect(gx, gThumbY, gThumbW, gThumbW, 'F');
                }
                gx += gThumbW + 2.5;
            }

            // Bottom border for the gallery (closes the item)
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.2);
            doc.line(ML, gy + ROW_H, TABLE_END, gy + ROW_H);
        }

        currentRow += rowsNeeded;
    }

    // ─── Footer on every page ─────────────────────────────────────────────────
    const totalPages = doc.internal.pages.length - 1;
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFillColor(...SURFACE);
        doc.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        doc.line(0, PH - FOOTER_H, PW, PH - FOOTER_H);
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.text('CONFIDENTIAL · INTERNAL USE ONLY', ML, PH - 3.5);
        doc.text(`${meta.dynamicId}  ·  Page ${p} / ${totalPages}`, PW - MR, PH - 3.5, { align: 'right' });
    }

    onProgress?.(100);

    // ─── Save ─────────────────────────────────────────────────────────────────
    const safeId = meta.dynamicId.replace(/[^A-Z0-9_\- ]/gi, '_').trim().replace(/ /g, '_');
    doc.save(`MANIFESTO_${safeId}.pdf`);
}


