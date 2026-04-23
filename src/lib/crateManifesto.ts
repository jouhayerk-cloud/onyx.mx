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
    customTitle?: string;     // Explicit title override
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
    // Sort items by descending vendor item count (index)
    const sortedItems = [...items].sort((a, b) => b.index - a.index);

    // US Letter landscape: 11" × 8.5" = 279.4mm × 215.9mm
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const PW = 279.4;
    const PH = 215.9;
    const ML = 10; // margin left (increased for printer compatibility)
    const MR = 10; // margin right
    const MT = 10; // margin top for continuation pages
    const MB = 10; // margin bottom (including footer)

    // ─── Palette (light theme) ────────────────────────────────────────────────
    const BG      : [number, number, number] = [255, 255, 255];
    const SURFACE : [number, number, number] = [245, 245, 245];
    const BORDER  : [number, number, number] = [210, 210, 210];
    const ACCENT  : [number, number, number] = [217, 90, 10];   // darker orange for contrast on white
    const TEXT_HI : [number, number, number] = [15, 15, 15];
    const TEXT_MID: [number, number, number] = [70, 70, 70];
    const TEXT_LO : [number, number, number] = [150, 150, 150];

    // ─── Column definitions ──────────────────────────────────────────────────
    const TABLE_END = PW - MR;
    const COL_QR   = { x: ML,       w: 18  }; 
    const COL_IMG  = { x: COL_QR.x + COL_QR.w,  w: meta.excludeImages ? 0 : 18  }; 
    const COL_TAG  = { x: COL_IMG.x + COL_IMG.w,  w: 38  }; 
    const COL_NAME = { x: COL_TAG.x + COL_TAG.w,  w: 100 + (meta.excludeImages ? 18 : 0)  }; 
    const COL_DIMS = { x: COL_NAME.x + COL_NAME.w, w: 50  }; 
    const COL_QTY  = { x: COL_DIMS.x + COL_DIMS.w, w: TABLE_END - (COL_DIMS.x + COL_DIMS.w) };

    const HDR_H = meta.excludeHeader ? 0 : 25;
    const COL_HDR_H = 7;
    const ROW_H = 18;
    const FOOTER_H = 10; // Increased to 10mm for strict margin compliance

    // ─── Helper: Draw Page Chrome ──────────────────────────────────────────
    async function drawPageChrome(pageNum: number) {
        doc.setFillColor(...BG);
        doc.rect(0, 0, PW, PH, 'F');

        if (pageNum === 1 && !meta.excludeHeader) {
            // Full Header
            doc.setFillColor(...SURFACE);
            doc.rect(0, 0, PW, HDR_H, 'F');

            // Header QR — Left side
            const headerQrUrl = await loadQrDataUrl(meta.dynamicId, 200);
            if (headerQrUrl) {
                const qrSize = 16;
                const bx = ML;
                const by = 4;
                doc.setFillColor(255, 255, 255);
                doc.rect(bx - 0.5, by - 0.5, qrSize + 1, qrSize + 1, 'F');
                doc.addImage(headerQrUrl, 'PNG', bx, by, qrSize, qrSize);
            }

            const ts = ML + 42;
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...TEXT_HI);
            doc.text(meta.customTitle || "LOGISTICS MANIFESTO", ts, 12);

            doc.setFontSize(9);
            doc.setTextColor(...TEXT_LO);
            doc.text(`${meta.dynamicId.toUpperCase()}  ·  ${meta.exportedAt}`, ts, 18);

            if (meta.exportNotes) {
                doc.setFontSize(8);
                doc.setTextColor(...TEXT_MID);
                doc.text(meta.exportNotes.toUpperCase(), ts, 23);
            }

            // Stats block
            const totalUnits = items.reduce((s, i) => s + i.qty, 0);
            const totalWeight = items.reduce((s, i) => s + i.weightKg * i.qty, 0);
            doc.setTextColor(...TEXT_HI);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            let weightStr = `${totalWeight.toFixed(1)} kg NET`;
            if (meta.exportBruteWeight) weightStr += `  ·  ${meta.exportBruteWeight.trim()} BRUTE`;
            const metaLine = `${meta.crateType.toUpperCase()}  ·  ${meta.crateDims}  ·  ${items.length} SKU(s)  ·  ${totalUnits} units  ·  ${weightStr}`;
            doc.text(metaLine, PW - MR, 12, { align: 'right' });

            doc.setTextColor(...TEXT_LO);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Crate: ${meta.crateId.toUpperCase()}  ·  Exported: ${meta.exportedAt}`, PW - MR, 18, { align: 'right' });

            // Wireframe Icon
            try {
                const dims = meta.crateDims.split(/[x×]/).map(n => parseFloat(n));
                const cw = dims[0] || 60, cl = dims[1] || 60, ch = dims[2] || 60;
                const visH = meta.crateType.toLowerCase() === 'pallet' ? 15 : ch;
                const maxDim = Math.max(cw, cl, visH, 1);
                const sizePx = 16;
                const scale = (sizePx * 0.75) / maxDim;
                const dw = cw * scale, dl = cl * scale, dh = visH * scale;
                const depth = dl * 0.38;
                const dx = depth, dy = -depth;
                const x0 = ML + 22, y0 = 6 + depth;
                let [R, G, B] = meta.crateColor ? hexToRgb(meta.crateColor) : [217, 90, 10];
                doc.setDrawColor(R, G, B);
                doc.setLineWidth(0.3);
                doc.setLineDashPattern([1, 1], 0);
                doc.line(x0 + dx, y0 + dy, x0 + dx, y0 + dh + dy);
                doc.line(x0 + dx, y0 + dy, x0 + dw + dx, y0 + dy);
                doc.setLineDashPattern([], 0);
                doc.setLineWidth(0.5);
                doc.line(x0, y0, x0 + dx, y0 + dy);
                doc.line(x0 + dw, y0, x0 + dw + dx, y0 + dy);
                doc.line(x0 + dx, y0 + dy, x0 + dw + dx, y0 + dy);
                doc.line(x0 + dw + dx, y0 + dy, x0 + dw + dx, y0 + dh + dy);
                doc.line(x0 + dw, y0 + dh, x0 + dw + dx, y0 + dh + dy);
                doc.rect(x0, y0, dw, dh, 'S');
            } catch {}
        } else if (pageNum > 1) {
            // Continuation Header
            doc.setFillColor(...SURFACE);
            doc.rect(0, 0, PW, MT, 'F');
            doc.setTextColor(...TEXT_LO);
            doc.setFontSize(7);
            const pageTitle = meta.customTitle || (meta.dynamicId.toUpperCase() + '  ·  PACKING LIST');
            doc.text(`${pageTitle}  ·  PAGE ${pageNum}`, ML, MT - 4);
        }

        // Footer (Strict 10mm margin compliance)
        doc.setFillColor(...SURFACE);
        doc.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.1);
        doc.line(0, PH - FOOTER_H, PW, PH - FOOTER_H);
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(7);
        // Move text up to be within the 10mm safe zone (PH - 10 = 205.9)
        // Actually, if FOOTER_H is 10, the top of footer is at PH-10.
        // Let's place text at PH - 5 for vertical center of the footer bar, 
        // but wait, if strict margin is 10mm, we can't have text at PH-5.
        // It must be at PH - 10 or higher.
        doc.text('CONFIDENTIAL · LOGISTICS MANIFESTO', ML, PH - 12);
        doc.text(`Artifact ID: ${meta.crateId.slice(0, 12)}`, PW - MR, PH - 12, { align: 'right' });
    }

    function drawColHeaders(y: number) {
        doc.setFillColor(230, 230, 230);
        doc.rect(ML, y, TABLE_END - ML, COL_HDR_H, 'F');
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const ty = y + 4.5;
        doc.text('SCAN', COL_QR.x + COL_QR.w / 2, ty, { align: 'center' });
        if (!meta.excludeImages) doc.text('PHOTO', COL_IMG.x + COL_IMG.w / 2, ty, { align: 'center' });
        doc.text('TAG ID', COL_TAG.x + 2, ty);
        doc.text('ITEM DESCRIPTION', COL_NAME.x + 2, ty);
        doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, ty);
        doc.text('QTY', COL_QTY.x + 2, ty);
    }

    let page = 1;
    let y = (meta.excludeHeader ? 0 : HDR_H);
    
    await drawPageChrome(page);
    drawColHeaders(y);
    y += COL_HDR_H;

    for (let i = 0; i < sortedItems.length; i++) {
        onProgress?.(Math.round((i / sortedItems.length) * 95));
        const item = sortedItems[i];
        
        // Gallery logic: if item has multiple images, it might take 2 row-slots
        const hasGallery = !meta.excludeImages && item.imageUrls && item.imageUrls.length > 1;
        const totalRowH = hasGallery ? ROW_H * 2 : ROW_H;

        // Check for page break
        if (y + totalRowH > PH - FOOTER_H) {
            doc.addPage('letter', 'landscape');
            page++;
            y = MT;
            await drawPageChrome(page);
            drawColHeaders(y);
            y += COL_HDR_H;
        }

        // Alternating background
        if (i % 2 === 0) {
            doc.setFillColor(252, 252, 252);
            doc.rect(ML, y, TABLE_END - ML, totalRowH, 'F');
        }
        
        // Separator
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.1);
        doc.line(ML, y + totalRowH, TABLE_END, y + totalRowH);

        // QR
        const qrDataUrl = await loadQrDataUrl(item.itemId, 120);
        if (qrDataUrl) {
            doc.addImage(qrDataUrl, 'PNG', COL_QR.x + 2, y + 2, 14, 14);
        }

        // Image
        if (!meta.excludeImages && item.imageUrls && item.imageUrls.length > 0) {
            const imgRes = await loadImageDataUrl(item.imageUrls[0], 120);
            if (imgRes) {
                const { dataUrl, w, h } = imgRes;
                const aspect = w / h;
                let dw = 14, dh = 14;
                if (aspect > 1) dh = 14 / aspect; else dw = 14 * aspect;
                doc.addImage(dataUrl, 'JPEG', COL_IMG.x + (18 - dw) / 2, y + (18 - dh) / 2, dw, dh);
            }
        }

        // Tag Badge
        const [tr, tg, tb] = hexToRgb(item.tagColor);
        doc.setFillColor(tr, tg, tb);
        const badgeW = Math.min(COL_TAG.w - 4, doc.getTextWidth(item.itemId) + 6);
        doc.roundedRect(COL_TAG.x + 2, y + 5, badgeW, 7, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(item.itemId, COL_TAG.x + 2 + badgeW/2, y + 9.8, { align: 'center' });

        // Name & Badges
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(10);
        doc.text(item.name.toUpperCase().slice(0, 45), COL_NAME.x + 2, y + 8);
        
        let pillX = COL_NAME.x + 2;
        const pillY = y + 10;
        const drawPill = (txt: string, br: number, bg: number, bb: number) => {
            if (!txt) return;
            doc.setFontSize(7);
            const tw = doc.getTextWidth(txt.toUpperCase());
            doc.setFillColor(br, bg, bb);
            doc.roundedRect(pillX, pillY, tw + 4, 5, 0.8, 0.8, 'F');
            doc.setTextColor(30, 30, 30);
            doc.text(txt.toUpperCase(), pillX + 2, pillY + 3.8);
            pillX += tw + 6;
        };
        if (item.color) drawPill(item.color, 240, 240, 240);
        if (item.material) drawPill(item.material, 230, 230, 230);

        // Dims & Weight
        doc.setTextColor(...TEXT_MID);
        doc.setFontSize(9);
        doc.text(item.dims || '—', COL_DIMS.x + 2, y + 7);
        doc.setFontSize(8);
        doc.text(`${item.weightKg} kg  ·  ${(item.weightKg * 2.2).toFixed(1)} lbs`, COL_DIMS.x + 2, y + 12);

        // Qty
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.text(`×${item.qty}`, COL_QTY.x + 2, y + 11);

        // Gallery
        if (hasGallery) {
            let gx = COL_IMG.x + 2;
            const gy = y + ROW_H + 2;
            for (let j = 1; j < Math.min(8, item.imageUrls!.length); j++) {
                const gRes = await loadImageDataUrl(item.imageUrls![j], 80);
                if (gRes) {
                    doc.addImage(gRes.dataUrl, 'JPEG', gx, gy, 14, 14);
                    gx += 16;
                }
            }
        }

        y += totalRowH;
    }

    onProgress?.(100);
    const safeId = meta.dynamicId.replace(/[^A-Z0-9_\-]/gi, '_');
    doc.save(`MANIFESTO_${safeId}.pdf`);
}
