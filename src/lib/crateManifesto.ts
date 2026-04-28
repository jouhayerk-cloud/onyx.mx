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
    boxLabel?: string;        // NEW: Specific cardboard box containing this item
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
    subtitle?: string;        // NEW: Small text under the primary ID (e.g. original crate name)
    // ── Trailer Export Props ──
    topViewImg?: string;      // Base64 top view of trailer
    sideViewImg?: string;     // Base64 side view of trailer
    isoViewImg?: string;      // NEW: Base64 isometric 3D view of trailer
    allTruckCrates?: Array<{
        id: string; label: string; type: string; dims: string; weight: number; color: string;
        l: number; w: number; h: number; parentLabel?: string;
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
    // ── Final Shipping Info ──
    sealNumber?: string;
    tractorNumber?: string;
    truckPlates?: string;
    trailerNumber?: string;
    trailerPlates?: string;
    senders?: string[];
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

async function loadImageDataUrl(url: string, maxPx = 120): Promise<{ dataUrl: string, w: number, h: number } | null> {
    if (!url) return null;
    // Use a reliable proxy to bypass CORS and ensure consistent resizing
    const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${maxPx * 2}&h=${maxPx * 2}&fit=inside&output=jpg&q=80`;
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => res(el);
            el.onerror = () => rej(new Error('img load error'));
            el.src = proxiedUrl;
            setTimeout(() => rej(new Error('img timeout')), 10000);
        });
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: c.toDataURL('image/jpeg', 0.85), w, h };
    } catch (err) { 
        console.warn(`[PDF] Failed to load image: ${url}`, err);
        return null; 
    }
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

function getContrastColor(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb(hex);
    // Relative luminance formula (approximate)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.65 ? [30, 30, 30] : [255, 255, 255];
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
    returnType: 'blob' | 'doc' | 'download' = 'download',
    existingDoc?: jsPDF
): Promise<Blob | jsPDF | void> {
    const sortedItems: Array<ManifestoItem | { isHeader: boolean; label: string }> = [];
    
    // Unified Sorting: All items together, sorted by vendor then quantity
    const itemsByVendor = items.reduce((acc, item) => {
        const v = item.vendorPrefix || 'OTHER';
        if (!acc[v]) acc[v] = [];
        acc[v].push(item);
        return acc;
    }, {} as Record<string, ManifestoItem[]>);

    Object.keys(itemsByVendor).sort().forEach(v => {
        sortedItems.push(...itemsByVendor[v].sort((a, b) => b.qty - a.qty));
    });

    const isMultiCrate = meta.crateType === 'Trailer Load';

    // Universal Safe Landscape: Fits inside both US Letter (279.4 width) and A4 (210 height)
    // This prevents ANY tiling on mobile AirPrint regardless of regional paper defaults.
    const PW = 297;
    const PH = 210;
    console.log(`[PDF] Init document. format: [${PW}, ${PH}] landscape. Return: ${returnType}`);
    const doc = existingDoc || new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] });
    if (existingDoc) {
        console.log(`[PDF] Appending to existing doc. Pages: ${doc.getNumberOfPages()}`);
        doc.addPage([PW, PH], 'landscape');
    }
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

    // ─── Column definitions (Optimized for Readability & Distribution) ───────
    const TABLE_END = PW - MR;
    const COL_QR   = { x: ML,       w: 18  }; 
    const COL_IMG  = { x: COL_QR.x + COL_QR.w, w: meta.excludeImages ? 0 : 25 };
    const COL_TAG  = { x: COL_IMG.x + COL_IMG.w,  w: 40  }; 
    const COL_NAME = { x: COL_TAG.x + COL_TAG.w, w: meta.excludeImages ? 130 : 105 }; 
    const COL_DIMS = { x: COL_NAME.x + COL_NAME.w, w: 70  }; 
    const COL_QTY  = { x: COL_DIMS.x + COL_DIMS.w, w: TABLE_END - (COL_DIMS.x + COL_DIMS.w) };

    const HDR_H = meta.excludeHeader ? 0 : 45;
    const COL_HDR_H = 8;
    const ROW_H = 22;
    const FOOTER_H = 10;
    let y = 0;

    // ─── Helper: Draw Page Chrome ──────────────────────────────────────────
    // ─── Helper: Draw Page Chrome ──────────────────────────────────────────
    async function drawPageChrome(isPrimaryHeader: boolean) {
        const pageNum = doc.getNumberOfPages();
        doc.setFillColor(...BG);
        doc.rect(0, 0, PW, PH, 'F');

        if (isPrimaryHeader && !meta.excludeHeader) {
            // Premium Header Background
            doc.setFillColor(...SURFACE);
            doc.rect(0, 0, PW, HDR_H, 'F');
            
            // Decorative Accent Bar
            doc.setFillColor(...ACCENT);
            doc.rect(0, 0, 1.5, HDR_H, 'F');

            let textX = ML;

            // 1. QR Code (Leftmost)
            if (!meta.excludeHeaderQr) {
                const headerQrUrl = await loadQrDataUrl(meta.dynamicId, 300);
                if (headerQrUrl) {
                    const qrSize = 34;
                    const bx = ML;
                    const by = 5;
                    doc.setFillColor(255, 255, 255);
                    doc.rect(bx - 1, by - 1, qrSize + 2, qrSize + 2, 'F');
                    doc.addImage(headerQrUrl, 'PNG', bx, by, qrSize, qrSize);
                    textX = bx + qrSize + 8;
                }
            }

            // 2. Wireframe Icon (Between QR and Text)
            if (!meta.excludeHeaderWireframe) {
                const dims = meta.crateDims.split(/[x×]/).map(n => parseFloat(n));
                const cw = dims[0] || 60, cl = dims[1] || 60, ch = dims[2] || 60;
                const iconSize = 25;
                drawWireframeIcon(doc, textX, 10, iconSize, cw, cl, ch, meta.crateColor || '#d95a0a', meta.crateType);
                textX += iconSize + 10;
            }

            // 3. Header Text
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...TEXT_LO);
            doc.text((meta.customTitle || "LOGISTICS MANIFESTO").toUpperCase(), textX, 10);

            doc.setFontSize(32);
            doc.setTextColor(...TEXT_HI);
            doc.setFont('helvetica', 'bold');
            doc.text(`${meta.dynamicId.toUpperCase()}`, textX, 22, { charSpace: -0.2 });

            let subY = 28;
            if (meta.subtitle) {
                doc.setFontSize(10);
                doc.setTextColor(...TEXT_MID);
                doc.text(meta.subtitle.toUpperCase(), textX, subY);
                subY += 5;
            }

            if (!isMultiCrate && meta.crateDims) {
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...TEXT_MID);
                doc.text(`${meta.crateDims} · ${meta.crateType.toUpperCase()}`, textX, subY);
                subY += 6;
            }

            if (meta.exportNotes) {
                doc.setFontSize(8);
                doc.setTextColor(...TEXT_LO);
                doc.setFont('helvetica', 'italic');
                doc.text(meta.exportNotes, textX, subY);
            }

            // 4. Stats block (Right Aligned)
            const totalUnits = items.reduce((s, i) => s + (i.qty || 1), 0);
            const totalWeight = items.reduce((s, i) => s + (i.weightKg || 0) * (i.qty || 1), 0);
            let summaryWeight = `${totalWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg NET`;
            if (meta.exportBruteWeight) summaryWeight += `  ·  ${meta.exportBruteWeight.trim()} BRUTE`;

            doc.setTextColor(...TEXT_LO);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`ONYX LOGISTICS · ${meta.exportedAt}`, PW - MR, 10, { align: 'right' });

            const nCrates = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'crate').length;
            const nPallets = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'pallet').length;

            doc.setTextColor(...TEXT_HI);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            
            if (isMultiCrate) {
                doc.text(`${nCrates} Crates  ·  ${nPallets} Pallets  ·  ${items.length} SKU(s)`, PW - MR, 13, { align: 'right' });
            } else {
                doc.text(`${meta.crateType.toUpperCase()}  ·  ${items.length} SKU(s)`, PW - MR, 13, { align: 'right' });
            }

            doc.setFontSize(9);
            doc.text(`${totalUnits} units  ·  ${summaryWeight}`, PW - MR, 18, { align: 'right' });
        } else {
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
        console.log(`[PDF] Rendering summary maps and stats...`);
        await drawPageChrome(true);
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

            // Final Shipping Details (Seal, Plates, etc.)
            if (meta.sealNumber || meta.tractorNumber || meta.truckPlates || meta.trailerNumber || meta.trailerPlates) {
                doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_LO);
                doc.text('SHIPMENT IDENTIFICATION & FINAL DATA', ML, sy);
                sy += 4;
                doc.setFillColor(255, 255, 255);
                doc.rect(ML, sy, PW - ML - MR, 15, 'FD');
                
                let fx = ML + 4;
                const fy = sy + 6;
                const drawField = (label: string, val: string, w: number) => {
                    doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.text(label, fx, fy);
                    doc.setFontSize(9); doc.setTextColor(...TEXT_HI); doc.text(val || '—', fx, fy + 5);
                    fx += w;
                };
                drawField('SEAL NUMBER', meta.sealNumber || '', 40);
                drawField('TRACTOR #', meta.tractorNumber || '', 40);
                drawField('TRUCK PLATES', meta.truckPlates || '', 40);
                drawField('TRAILER #', meta.trailerNumber || '', 40);
                drawField('TRAILER PLATES', meta.trailerPlates || '', 40);
                
                if (meta.senders && meta.senders.length > 0) {
                    const senderText = meta.senders.filter(Boolean).join(', ');
                    doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.text('SENDERS', fx, fy);
                    doc.setFontSize(7); doc.setTextColor(...TEXT_HI); 
                    const senderLines = doc.splitTextToSize(senderText.toUpperCase(), TABLE_END - fx - 2);
                    doc.text(senderLines[0], fx, fy + 5);
                }
                
                sy += 20;
            }
        }

        // Trailer Maps
        if (meta.topViewImg) {
            if (sy + 45 > PH - MB) {
                doc.addPage([PW, PH], 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
            doc.text('TRAILER TOP VIEW MAP (PLAN)', ML, sy);
            sy += 4;
            const imgW = (PW - ML - MR) * 0.72; // Reduced size
            const imgH = imgW / (1615/244);
            const ox = ML + (PW - ML - MR - imgW) / 2; // Centered
            doc.addImage(meta.topViewImg, 'JPEG', ox, sy, imgW, imgH);
            sy += imgH + 10;
        }

        if (meta.sideViewImg) {
            if (sy + 50 > PH - MB) {
                doc.addPage([PW, PH], 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
            doc.text('TRAILER SIDE VIEW MAP (LATERAL STACKING)', ML, sy);
            sy += 4;
            const imgW = (PW - ML - MR) * 0.72; // Reduced size
            const imgH = imgW / (1615/279);
            const ox = ML + (PW - ML - MR - imgW) / 2; // Centered
            doc.addImage(meta.sideViewImg, 'JPEG', ox, sy, imgW, imgH);
            sy += imgH + 12;
        }

        if (meta.isoViewImg) {
            // Always force Isometric View to its own page
            doc.addPage([PW, PH], 'landscape');
            await drawPageChrome(false);
            sy = MT + 8; // Start at top margin of new page

            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('TRAILER ISOMETRIC 3D LOAD VIEW', ML, sy);
            sy += 6;
            const imgW = PW - ML - MR;
            const imgH = imgW * 0.45; // Larger aspect for dedicated page
            doc.addImage(meta.isoViewImg, 'JPEG', ML, sy, imgW, imgH);
            sy += imgH + 12;
            doc.addPage([PW, PH], 'landscape');
            await drawPageChrome(false);
            sy = MT + 8; 
        }

        // Crate Grid
        if (meta.allTruckCrates) {
            if (sy + 25 > PH - MB) {
                doc.addPage([PW, PH], 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }

            doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('PACKED CRATES & PALLETS SUMMARY', ML, sy);
            sy += 6; // Reduced from 8
            
            const gridCols = 5;
            const boxW = (PW - ML - MR) / gridCols - 4;
            const boxH = 22;
            let drawnOnThisPage = 0;
            for (let i = 0; i < meta.allTruckCrates.length; i++) {
                const c = meta.allTruckCrates[i];
                if (c.type === 'cardboard') continue; // Do not show boxes in the summary grid

                const col = drawnOnThisPage % gridCols;
                const row = Math.floor(drawnOnThisPage / gridCols);
                const bx = ML + col * (boxW + 4);
                let by = sy + row * (boxH + 4);
                
                if (by + boxH > PH - MB) {
                    doc.addPage([PW, PH], 'landscape');
                    await drawPageChrome(false);
                    sy = MT + 8;
                    drawnOnThisPage = 0;
                    by = sy;
                }

                doc.setFillColor(252, 252, 252);
                doc.rect(bx, by, boxW, boxH, 'F');
                doc.setDrawColor(230, 230, 230);
                doc.rect(bx, by, boxW, boxH, 'S');
                
                // Scaled wireframe icon
                drawWireframeIcon(doc, bx + 2, by + 4, 15, c.w, c.l, c.h, c.color, c.type);
                
                const [cr, cg, cb] = hexToRgb(c.color);
                doc.setFillColor(cr, cg, cb);
                doc.roundedRect(bx + 18, by + 3.5, 2.5, 2.5, 0.5, 0.5, 'F');

                doc.setTextColor(cr, cg, cb); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                doc.text(c.label, bx + 22, by + 6);
                doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
                doc.text(`${c.type.toUpperCase()} · ${c.weight} KG`, bx + 18, by + 11);
                doc.text(c.dims, bx + 18, by + 16);
                
                drawnOnThisPage++;
            }

            // ─── Cardboard Boxes Summary (Separate Page) ───────────────────────
            const boxes = (meta.allTruckCrates || []).filter(c => c.type === 'cardboard');
            if (boxes.length > 0) {
                doc.addPage([PW, PH], 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;

                doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
                doc.text('PACKED CARDBOARD BOXES SUMMARY', ML, sy);
                sy += 6;
                
                let boxDrawn = 0;
                for (let i = 0; i < boxes.length; i++) {
                    const c = boxes[i];
                    const col = boxDrawn % gridCols;
                    const row = Math.floor(boxDrawn / gridCols);
                    const bx = ML + col * (boxW + 4);
                    let by = sy + row * (boxH + 4);
                    
                    if (by + boxH > PH - MB) {
                        doc.addPage([PW, PH], 'landscape');
                        await drawPageChrome(false);
                        sy = MT + 8;
                        boxDrawn = 0;
                        by = sy;
                    }

                    doc.setFillColor(252, 252, 252);
                    doc.rect(bx, by, boxW, boxH, 'F');
                    doc.setDrawColor(230, 230, 230);
                    doc.rect(bx, by, boxW, boxH, 'S');
                    
                    drawWireframeIcon(doc, bx + 2, by + 4, 15, c.w, c.l, c.h, c.color, c.type);
                    
                    const [cr, cg, cb] = hexToRgb(c.color);
                    doc.setFillColor(cr, cg, cb);
                    doc.roundedRect(bx + 18, by + 3.5, 2.5, 2.5, 0.5, 0.5, 'F');

                    doc.setTextColor(cr, cg, cb); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                    doc.text(c.label, bx + 22, by + 6);
                    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
                    doc.text(`${c.type.toUpperCase()} · ${c.weight} KG`, bx + 18, by + 11);
                    doc.text(c.dims, bx + 18, by + 16);
                    
                    if (c.parentLabel) {
                        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold italic'); doc.setTextColor(...ACCENT);
                        doc.text(`NESTED IN: ${c.parentLabel}`, bx + 18, by + 20);
                    }

                    boxDrawn++;
                }
            }
        }
    }

    async function drawBoxContentsPage() {
        const boxes = (meta.allTruckCrates || []).filter(c => c.type === 'cardboard');
        if (boxes.length === 0) return;
        
        doc.addPage([PW, PH], 'landscape');
        await drawPageChrome(false);
        let sy = MT + 8;
        
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
        doc.text('CARDBOARD BOX CONTENTS DETAIL', ML, sy);
        sy += 8;
        
        for (const box of boxes) {
            const boxItems = items.filter(i => i.boxLabel === box.label);
            if (boxItems.length === 0) continue;
            
            // Check for space
            const needed = 8 + (boxItems.length * 6);
            if (sy + needed > PH - MB) {
                doc.addPage([PW, PH], 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }
            
            // Box Title
            const [br, bg, bb] = hexToRgb(box.color);
            doc.setFillColor(br, bg, bb);
            doc.rect(ML, sy, PW - ML - MR, 6, 'F');
            doc.setTextColor(getTextColorForBg(box.color) === '#FFFFFF' ? 255 : 30);
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text(`BOX: ${box.label} (${box.dims}) · ${box.weight} KG`, ML + 2, sy + 4.5);
            sy += 8;
            
            // List Items
            doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
            for (const it of boxItems) {
                doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
                doc.text(`${it.qty}×`, ML + 4, sy);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
                doc.text(`${it.itemId}  ·  ${it.name}`, ML + 15, sy);
                sy += 6;
            }
            sy += 4; // Gap
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
        doc.text('ITEM DESCRIPTION', COL_NAME.x + 2, ty);
        doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, ty);
        doc.text('QTY', COL_QTY.x + COL_QTY.w - 2, ty, { align: 'right' });
    }

    if (isMultiCrate) {
        await drawSummaryPage();
        await drawBoxContentsPage();
        doc.addPage([PW, PH], 'landscape');
        await drawPageChrome(false);
        y = MT;
    } else {
        await drawPageChrome(true);
        y = (meta.excludeHeader ? 0 : HDR_H);
    }
    
    drawColHeaders(y);
    y += COL_HDR_H;

    console.log(`[PDF] Starting items table render...`);
    for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i] as ManifestoItem;
        onProgress?.(Math.round((i / sortedItems.length) * 95));
        
        // Indent removed to ensure unified "containing crate" attribution
        const xOffset = 0; 

        // Gallery Row Visibility & Count Calculation
        const numImagesTotal = !meta.excludeImages ? item.qty : 0;
        const numImagesInGallery = numImagesTotal - 1;
        const hasGallery = numImagesInGallery > 0;
        const galleryImgSize = 20;
        const imagesPerRow = Math.max(1, Math.floor((TABLE_END - (COL_QR.x + 2 + xOffset)) / (galleryImgSize + 2)));
        const galleryRows = hasGallery ? Math.ceil(numImagesInGallery / imagesPerRow) : 0;
        const totalRowH = ROW_H + (galleryRows * (galleryImgSize + 2)) + (galleryRows > 0 ? 2 : 0);

        // Check for page break
        if (y + totalRowH > PH - FOOTER_H) {
            doc.addPage([PW, PH], 'landscape');
            y = MT;
            await drawPageChrome(false);
            drawColHeaders(y);
            y += COL_HDR_H;
        }

        // Alternating Background
        if (i % 2 === 0) {
            doc.setFillColor(252, 252, 252);
            doc.rect(ML, y, TABLE_END - ML, totalRowH, 'F');
        }
        
        // Row Separator
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.1);
        doc.line(ML, y + totalRowH, TABLE_END, y + totalRowH);

        // 1. SCAN (QR Code with Padding)
        const qrDataUrl = await loadQrDataUrl(item.itemId, 150);
        if (qrDataUrl) {
            doc.addImage(qrDataUrl, 'PNG', COL_QR.x + 3 + xOffset, y + 5, 12, 12);
        }

        // 2. PHOTO (Main Item Photo)
        if (!meta.excludeImages && item.imageUrls && item.imageUrls.length > 0) {
            const imgRes = await loadImageDataUrl(item.imageUrls[0], 150);
            if (imgRes) {
                const { dataUrl, w, h } = imgRes;
                const aspect = w / h;
                let dw = 18, dh = 18;
                if (aspect > 1) dh = 18 / aspect; else dw = 18 * aspect;
                
                doc.setDrawColor(230, 230, 230);
                doc.rect(COL_IMG.x + (COL_IMG.w - dw) / 2 - 0.2 + xOffset, y + (ROW_H - dh) / 2 - 0.2, dw + 0.4, dh + 0.4, 'S');
                doc.addImage(dataUrl, 'JPEG', COL_IMG.x + (COL_IMG.w - dw) / 2 + xOffset, y + (ROW_H - dh) / 2, dw, dh);
            }
        }

        // 4. BOOK TAG ID (with Contrast Check)
        const [tr, tg, tb] = hexToRgb(item.tagColor);
        doc.setFillColor(tr, tg, tb);
        doc.setFontSize(10); 
        doc.setFont('helvetica', 'bold');
        const textW = doc.getTextWidth(item.itemId);
        const badgeW = Math.min(COL_TAG.w - 4 - xOffset, textW + 6);
        doc.roundedRect(COL_TAG.x + 2 + xOffset, y + (ROW_H - 7) / 2, badgeW, 7, 0.5, 0.5, 'F');
        doc.setTextColor(...getContrastColor(item.tagColor));
        doc.text(item.itemId, COL_TAG.x + 2 + xOffset + badgeW/2, y + (ROW_H + 3) / 2, { align: 'center' });

        // 5. ITEM DESCRIPTION
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const nameLines = doc.splitTextToSize(item.name.toUpperCase(), COL_NAME.w - 4 - xOffset);
        doc.text(nameLines[0], COL_NAME.x + 2 + xOffset, y + 8);
        
        let pillX = COL_NAME.x + 2 + xOffset;
        const pillY = y + 12;
        const drawPill = (txt: string, br: number, bg: number, bb: number) => {
            if (!txt) return;
            doc.setFontSize(7);
            const tw = doc.getTextWidth(txt.toUpperCase());
            doc.setFillColor(br, bg, bb);
            doc.roundedRect(pillX, pillY, tw + 5, 5, 0.5, 0.5, 'F');
            doc.setTextColor(60, 60, 60);
            doc.text(txt.toUpperCase(), pillX + 2.5, pillY + 3.8);
            pillX += tw + 8;
        };
        if (item.color) drawPill(item.color, 240, 240, 240);
        if (item.material) drawPill(item.material, 230, 230, 230);

        // 6. DIMENSIONS · WEIGHT (Larger & Bolder)
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(11.5);
        doc.setFont('helvetica', 'bold');
        doc.text(item.dims || '—', COL_DIMS.x + 2, y + 8);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${item.weightKg} kg  ·  ${(item.weightKg * 2.20462).toFixed(1)} lbs`, COL_DIMS.x + 2, y + 14);

        // 7. QTY (Slightly Smaller)
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text(`×${item.qty}`, COL_QTY.x + COL_QTY.w - 2, y + 13.5, { align: 'right' });

        // ─── Extended Gallery (Non-duplicated) ───────────────────────────────
        if (hasGallery) {
            let gx = COL_QR.x + 2 + xOffset;
            let gy = y + ROW_H + 2;
            
            doc.setDrawColor(245, 245, 245);
            doc.line(gx, gy - 0.5, TABLE_END - 2, gy - 0.5);

            for (let j = 0; j < numImagesInGallery; j++) {
                // Skip the first image (already in PHOTO column)
                // Cycle through available images or repeat the first one if needed
                const url = (item.imageUrls && item.imageUrls.length > 1) 
                    ? (item.imageUrls[j + 1] || item.imageUrls[0])
                    : (item.imageUrls?.[0] || '');
                
                if (!url) continue;

                const gRes = await loadImageDataUrl(url, 120);
                if (gRes) {
                    const { dataUrl, w, h } = gRes;
                    const aspect = w / h;
                    let dw = galleryImgSize, dh = galleryImgSize;
                    if (aspect > 1) dh = galleryImgSize / aspect; else dw = galleryImgSize * aspect;
                    
                    const ox = gx + (galleryImgSize - dw) / 2;
                    const oy = gy + (galleryImgSize - dh) / 2;
                    
                    doc.setDrawColor(240, 240, 240);
                    doc.rect(ox - 0.1, oy - 0.1, dw + 0.2, dh + 0.2, 'S');
                    doc.addImage(dataUrl, 'JPEG', ox, oy, dw, dh);
                    
                    gx += galleryImgSize + 2;
                    if (gx + galleryImgSize > TABLE_END) {
                        gx = COL_QR.x + 2 + xOffset;
                        gy += galleryImgSize + 2;
                    }
                }
            }
        }

        y += totalRowH;
    }

    onProgress?.(100);
    const safeId = meta.dynamicId.replace(/[^A-Z0-9_\-]/gi, '_');
    if (returnType === 'blob') {
        return doc.output('blob');
    } else if (returnType === 'doc') {
        return doc;
    } else {
        doc.save(`MANIFESTO_${safeId}.pdf`);
    }
}

export async function exportCombinedTruckManifesto(
    trailerData: { items: ManifestoItem[], meta: ManifestoMeta } | null,
    cratesData: Array<{ items: ManifestoItem[], meta: ManifestoMeta }>,
    onProgress?: (pct: number) => void,
    returnType: 'blob' | 'download' = 'download'
): Promise<Blob | void> {
    let doc: jsPDF;
    let startIdx = 0;

    if (trailerData) {
        // 1. Trailer Summary
        doc = await exportCrateManifesto(trailerData.items, trailerData.meta, p => onProgress?.(p * 0.2), 'doc') as jsPDF;
        startIdx = 0;
    } else {
        // Start directly with the first crate
        const first = cratesData[0];
        doc = await exportCrateManifesto(first.items, first.meta, p => onProgress?.(p * (1 / cratesData.length) * 100), 'doc') as jsPDF;
        startIdx = 1;
    }
    
    // 2. Individual Crates
    for (let i = startIdx; i < cratesData.length; i++) {
        const crate = cratesData[i];
        const progressStart = 20 + (i / cratesData.length) * 80;
        const progressStep = 80 / cratesData.length;
        await exportCrateManifesto(crate.items, crate.meta, p => onProgress?.(progressStart + (p * progressStep / 100)), 'doc', doc);
    }
    
    const safeId = (trailerData?.meta.dynamicId || cratesData[0].meta.dynamicId).replace(/[^A-Z0-9_\-]/gi, '_');
    if (returnType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`COMBINED_MANIFESTO_${safeId}.pdf`);
    }
}
