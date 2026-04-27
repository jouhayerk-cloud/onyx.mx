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
    packetIn?: string;        // NEW: Labels of crates/pallets containing this item
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
    excludeHeaderQr?: boolean; // NEW: Hide the big QR code in the header
    excludeHeaderWireframe?: boolean; // NEW: Hide the wireframe icon in the header
    // ── Trailer Export Props ──
    topViewImg?: string;      // Base64 top view of trailer
    sideViewImg?: string;     // Base64 side view of trailer
    isoViewImg?: string;      // NEW: Base64 isometric 3D view of trailer
    allTruckCrates?: Array<{
        id: string; label: string; type: string; dims: string; weight: number; color: string;
        l: number; w: number; h: number;
    }>;
    truckStats?: {
        totalWeight: number;
        payloadPct: number;
        floorPct: number;
        volPct: number;
        status: string;
        rPct: number;
        mPct: number;
        fPct: number;
        itemCount: number;
    };
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
    const h = (hex || '#6b7280').replace('#', '');
    if (h.length === 3) {
        return [
            parseInt(h[0] + h[0], 16),
            parseInt(h[1] + h[1], 16),
            parseInt(h[2] + h[2], 16)
        ];
    }
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawWireframeIcon(doc: jsPDF, x: number, y: number, sizePx: number, cw: number, cl: number, ch: number, colorHex: string, type: string) {
    try {
        const visH = type.toLowerCase().includes('pallet') ? 15 : ch;
        const maxDim = Math.max(cw, cl, visH, 1);
        const scale = (sizePx * 0.75) / maxDim;
        const dw = cw * scale, dl = cl * scale, dh = visH * scale;
        const depth = dl * 0.38;
        const dx = depth, dy = -depth;
        
        const x0 = x, y0 = y + depth; 
        let [R, G, B] = hexToRgb(colorHex);
        doc.setDrawColor(R, G, B);
        doc.setLineWidth(0.15);
        
        // Back face (dotted)
        doc.setLineDashPattern([0.5, 0.5], 0);
        doc.line(x0 + dx, y0 + dy, x0 + dx, y0 + dh + dy);
        doc.line(x0 + dx, y0 + dy, x0 + dw + dx, y0 + dy);
        doc.setLineDashPattern([], 0);
        
        // Perspective lines
        doc.setLineWidth(0.3);
        doc.line(x0, y0, x0 + dx, y0 + dy);
        doc.line(x0 + dw, y0, x0 + dw + dx, y0 + dy);
        doc.line(x0 + dw + dx, y0 + dy, x0 + dw + dx, y0 + dh + dy);
        doc.line(x0 + dw, y0 + dh, x0 + dw + dx, y0 + dh + dy);
        
        // Front face
        doc.rect(x0, y0, dw, dh, 'S');
    } catch (e) { console.error('Wireframe draw error:', e); }
}

// ─── Main Export Function ────────────────────────────────────────────────────
export async function exportCrateManifesto(
    items: ManifestoItem[],
    meta: ManifestoMeta,
    onProgress?: (pct: number) => void,
    returnBlob?: boolean
): Promise<Blob | void> {
    // Group by vendor and sort by descending item count within groups
    const vendorGroups = items.reduce((acc, item) => {
        const v = item.vendorPrefix || 'OTHER';
        if (!acc[v]) acc[v] = [];
        acc[v].push(item);
        return acc;
    }, {} as Record<string, ManifestoItem[]>);

    const sortedVendors = Object.keys(vendorGroups).sort();
    const sortedItems: ManifestoItem[] = [];
    
    sortedVendors.forEach(v => {
        const itemsInGroup = [...vendorGroups[v]].sort((a, b) => b.qty - a.qty);
        sortedItems.push(...itemsInGroup);
    });

    const isMultiCrate = meta.crateType === 'Trailer Load';

    // Universal Safe Landscape: Fits inside both US Letter (279.4 width) and A4 (210 height)
    // This prevents ANY tiling on mobile AirPrint regardless of regional paper defaults.
    const PW = 210;
    const PH = 279.4;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PW, PH] });
    const ML = 10; // margin left
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

    // ─── Column definitions (Adjusted for Portrait Width) ───────────────────
    const TABLE_END = PW - MR;
    const COL_QR   = { x: ML,       w: 12  }; 
    const COL_IMG  = { x: COL_QR.x + COL_QR.w, w: meta.excludeImages ? 0 : 18 };
    const COL_TAG  = { x: COL_IMG.x + COL_IMG.w,  w: 28  }; 
    const COL_PACKET = { x: COL_TAG.x + COL_TAG.w, w: 22 }; 
    const COL_NAME = { x: COL_PACKET.x + COL_PACKET.w, w: meta.excludeImages ? 83 : 65 }; 
    const COL_DIMS = { x: COL_NAME.x + COL_NAME.w, w: 30  }; 
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

            /* Header QR REMOVED AS REQUESTED */
            /*
            if (!meta.excludeHeaderQr) {
                const headerQrUrl = await loadQrDataUrl(meta.dynamicId, 200);
                if (headerQrUrl) {
                    const qrSize = 16;
                    const bx = ML;
                    const by = 4;
                    doc.setFillColor(255, 255, 255);
                    doc.rect(bx - 0.5, by - 0.5, qrSize + 1, qrSize + 1, 'F');
                    doc.addImage(headerQrUrl, 'PNG', bx, by, qrSize, qrSize);
                }
            }
            */

            const ts = ML; // Title start at margin
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...TEXT_LO);
            doc.text((meta.customTitle || "LOGISTICS MANIFESTO").toUpperCase(), ts, 7);

            doc.setFontSize(18);
            doc.setTextColor(...TEXT_HI);
            doc.text(`${meta.dynamicId.toUpperCase()}`, ts, 14);

            if (meta.exportNotes) {
                doc.setFontSize(7);
                doc.setTextColor(...TEXT_MID);
                doc.text(meta.exportNotes.toUpperCase(), ts, 18);
            }

            // Stats block
            const totalUnits = items.reduce((s, i) => s + i.qty, 0);
            const totalWeight = items.reduce((s, i) => s + i.weightKg * i.qty, 0);
            
            // Header Right Side (Split into cleaner rows)
            doc.setTextColor(...TEXT_LO);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(`Exported: ${meta.exportedAt}`, PW - MR, 7, { align: 'right' });

            const nCrates = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase().includes('crate')).length;
            const nPallets = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase().includes('pallet')).length;

            doc.setTextColor(...TEXT_HI);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`${nCrates} Crates  ·  ${nPallets} Pallets  ·  ${items.length} SKU(s)`, PW - MR, 12, { align: 'right' });

            let weightStr = `${totalWeight.toFixed(1)} kg NET`;
            if (meta.exportBruteWeight) weightStr += `  ·  ${meta.exportBruteWeight.trim()} BRUTE`;
            doc.text(`${totalUnits} units  ·  ${weightStr}`, PW - MR, 17, { align: 'right' });

            // Wireframe Icon REMOVED AS REQUESTED
            /*
            if (!meta.excludeHeaderWireframe) {
                const dims = meta.crateDims.split(/[x×]/).map(n => parseFloat(n));
                const cw = dims[0] || 60, cl = dims[1] || 60, ch = dims[2] || 60;
                drawWireframeIcon(doc, ML + 24, 4, 16, cw, cl, ch, meta.crateColor || '#d95a0a', meta.crateType);
            }
            */
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

    async function drawSummaryPage() {
        await drawPageChrome(1);
        let sy = HDR_H + 8;
        
        // Stats Panel (White background details)
        if (meta.truckStats) {
            const ts = meta.truckStats;
            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('TRAILER LOAD METRICS & DISTRIBUTION', ML, sy);
            sy += 5;
            
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(...BORDER);
            doc.rect(ML, sy, PW - ML - MR, 24, 'FD'); // Shorter box
            
            const bx = ML + 4;
            const by = sy + 6;
            
            // Col 1: Payload
            doc.setFontSize(7); doc.setTextColor(...TEXT_LO); doc.text('TOTAL PAYLOAD', bx, by);
            doc.setFontSize(14); doc.setTextColor(...TEXT_HI); doc.text(`${Math.round(ts.totalWeight).toLocaleString()} KG`, bx, by + 6);
            doc.setFontSize(7); doc.setTextColor(...TEXT_MID); doc.text(`${ts.payloadPct}% OF MAX`, bx, by + 10);
            
            // Col 2: Distribution + Utilization (Data Dense)
            const cx2 = bx + 60;
            doc.setFontSize(7); doc.setTextColor(...TEXT_LO); doc.text('WEIGHT DISTRIBUTION', cx2, by);
            doc.setFontSize(10); doc.setTextColor(...TEXT_HI); doc.text(`REAR ${ts.rPct}%  ·  MID ${ts.mPct}%  ·  FRONT ${ts.fPct}%`, cx2, by + 6);
            // Subtitle Utilization
            doc.setFontSize(7); doc.setTextColor(...TEXT_MID); 
            doc.text(`UTILIZATION  ·  FLOOR: ${ts.floorPct}%  ·  VOLUME: ${ts.volPct}%`, cx2, by + 10);
            
            // Status Badge
            const cx4 = PW - MR - 4;
            doc.setFontSize(7); doc.setTextColor(...TEXT_LO); doc.text('LOAD STATUS', cx4, by, { align: 'right' });
            doc.setFontSize(11); doc.setTextColor(...TEXT_HI); doc.text(ts.status.toUpperCase(), cx4, by + 6, { align: 'right' });
            
            sy += 30; // Compacted
        }

        // Trailer Maps
        if (meta.topViewImg) {
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
            doc.text('TRAILER TOP VIEW MAP (PLAN)', ML, sy);
            sy += 3;
            const imgW = PW - ML - MR;
            const imgH = imgW / (1615/244);
            doc.addImage(meta.topViewImg, 'JPEG', ML, sy, imgW, imgH);
            sy += imgH + 8;
        }

        if (meta.sideViewImg) {
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
            doc.text('TRAILER SIDE VIEW MAP (LATERAL STACKING)', ML, sy);
            sy += 3;
            const imgW = PW - ML - MR;
            const imgH = imgW / (1615/279);
            doc.addImage(meta.sideViewImg, 'JPEG', ML, sy, imgW, imgH);
            sy += imgH + 8;
        }

        if (meta.isoViewImg) {
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
            doc.text('TRAILER ISOMETRIC 3D LOAD VIEW', ML, sy);
            sy += 3;
            const imgW = PW - ML - MR;
            const imgH = imgW * 0.45; // Estimated aspect
            doc.addImage(meta.isoViewImg, 'JPEG', ML, sy, imgW, imgH);
            sy += imgH + 12;
        }



        // Crate Grid
        if (meta.allTruckCrates) {
            if (sy + 20 > PH - MB) {
                doc.addPage();
                await drawPageChrome(doc.getNumberOfPages());
                sy = HDR_H + 8;
            }

            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('PACKED CRATES & PALLETS SUMMARY', ML, sy);
            sy += 6;
            
            const gridCols = 3;
            const boxW = (PW - ML - MR) / gridCols - 4;
            const boxH = 18;
            let drawnOnThisPage = 0;
            for (let i = 0; i < meta.allTruckCrates.length; i++) {
                const c = meta.allTruckCrates[i];
                const col = drawnOnThisPage % gridCols;
                const row = Math.floor(drawnOnThisPage / gridCols);
                const bx = ML + col * (boxW + 4);
                let by = sy + row * (boxH + 4);
                
                if (by + boxH > PH - MB) {
                    doc.addPage();
                    await drawPageChrome(doc.getNumberOfPages());
                    sy = HDR_H + 8;
                    drawnOnThisPage = 0;
                    by = sy; // Start at top of new page
                }

                doc.setFillColor(252, 252, 252);
                doc.rect(bx, by, boxW, boxH, 'F');
                doc.setDrawColor(230, 230, 230);
                doc.rect(bx, by, boxW, boxH, 'S');
                
                // Scaled wireframe icon
                drawWireframeIcon(doc, bx + 2, by + 4, 10, c.w, c.l, c.h, c.color, c.type);
                
                const [cr, cg, cb] = hexToRgb(c.color);
                doc.setFillColor(cr, cg, cb);
                doc.roundedRect(bx + 14, by + 2.5, 2, 2, 0.4, 0.4, 'F');

                doc.setTextColor(cr, cg, cb); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                doc.text(c.label, bx + 17, by + 5);
                doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
                doc.text(`${c.type.toUpperCase()} · ${c.weight} KG`, bx + 14, by + 9);
                doc.text(c.dims, bx + 14, by + 13);
                
                drawnOnThisPage++;
            }
        }
    }

    function drawColHeaders(y: number) {
        doc.setFillColor(240, 240, 240);
        doc.rect(ML, y, TABLE_END - ML, COL_HDR_H, 'F');
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const ty = y + 4.5;
        doc.text('SCAN', COL_QR.x + COL_QR.w / 2, ty, { align: 'center' });
        if (!meta.excludeImages) doc.text('PHOTO', COL_IMG.x + COL_IMG.w / 2, ty, { align: 'center' });
        doc.text('BOOK TAG ID', COL_TAG.x + 2, ty);
        doc.text('PACKET IN', COL_PACKET.x + 2, ty);
        doc.text('ITEM DESCRIPTION', COL_NAME.x + 2, ty);
        doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, ty);
        doc.text('QTY', COL_QTY.x + 2, ty);
    }

    let page = 1;
    let y = (meta.excludeHeader ? 0 : HDR_H);
    
    if (isMultiCrate) {
        await drawSummaryPage();
        doc.addPage();
        page++;
        await drawPageChrome(page);
    } else {
        await drawPageChrome(page);
    }
    
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
            doc.addPage([PW, PH], 'portrait');
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
            doc.addImage(qrDataUrl, 'PNG', COL_QR.x + 2, y + 4.5, 8, 8);
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
        doc.setFontSize(8); // Smaller font for tag
        doc.setFont('helvetica', 'bold');
        const textW = doc.getTextWidth(item.itemId);
        const badgeW = Math.min(COL_TAG.w - 2, textW + 2);
        doc.roundedRect(COL_TAG.x + 2, y + 6.5, badgeW, 5, 0.5, 0.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(item.itemId, COL_TAG.x + 2 + badgeW/2, y + 10, { align: 'center' });

        // Packet In
        doc.setTextColor(...TEXT_MID);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        if (item.packetIn) {
            const lines = doc.splitTextToSize(item.packetIn.toUpperCase(), COL_PACKET.w - 4);
            doc.text(lines, COL_PACKET.x + 2, y + 8);
        }

        // Name & Badges
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(8); // Smaller name font
        doc.text(item.name.toUpperCase().slice(0, 50), COL_NAME.x + 2, y + 8);
        
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
    if (returnBlob) {
        return doc.output('blob');
    } else {
        doc.save(`MANIFESTO_${safeId}.pdf`);
    }
}
