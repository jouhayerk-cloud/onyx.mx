/**
 * crateManifesto.ts
 * Generates a dense, tabular shipping manifesto PDF for a packed crate.
 * Each row includes a live QR code linking to the item's inventory record.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { cmToImperial } from './utils';
import { getVendorColor } from './excelStyles';
import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';

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
    branding?: string;        // 'RareEarth' | 'ArtOfDecor'
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
    packingItems?: Array<{ name: string; count: number; weight: number }>;
    sortByTagDesc?: boolean;  // NEW: Sort items by itemId descending
}

// ─── QR Code via free API ────────────────────────────────────────────────────
// Uses api.qrserver.com to render a tiny QR PNG from a URL string.
async function loadQrDataUrl(text: string, sizePx = 80): Promise<string | null> {
    try {
        return await QRCode.toDataURL(text.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: sizePx, color: { dark: '#141414', light: '#ffffff' } });
    } catch (e) {
        console.error('QR code err', e);
        return null;
    }
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

async function loadCode39DataUrl(text: string): Promise<string | null> {
    const encoded = encodeURIComponent(text);
    const url = `https://barcodeapi.org/api/code39/${encoded}`;
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
        c.width = img.width; 
        c.height = img.height - 35; // aggressively crop out text
        c.getContext('2d')!.drawImage(img, 0, 0);
        return c.toDataURL('image/png');
    } catch { return null; }
}

async function loadLocalImageDataUrl(url: string, maxPx = 120): Promise<{ dataUrl: string, w: number, h: number } | null> {
    if (!url) return null;
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.onload = () => res(el);
            el.onerror = () => rej(new Error('local img load error'));
            el.src = url;
            setTimeout(() => rej(new Error('img timeout')), 5000);
        });
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: c.toDataURL('image/png'), w, h };
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
        console.warn(`[PDF] Failed to load image from URL: ${url} | Error: ${err instanceof Error ? err.message : String(err)}`);
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
        doc.setLineWidth(0.6);
        
        doc.line(x0 + dx, y0 + dy, x0 + dx, y0 + dh + dy);
        doc.line(x0 + dx, y0 + dy, x0 + dw + dx, y0 + dy);
        
        // Perspective lines
        doc.line(x0, y0, x0 + dx, y0 + dy);
        doc.line(x0 + dw, y0, x0 + dw + dx, y0 + dy);
        doc.line(x0 + dw + dx, y0 + dy, x0 + dw + dx, y0 + dh + dy);
        doc.line(x0 + dw, y0 + dh, x0 + dw + dx, y0 + dh + dy);
        
        // Front face
        doc.rect(x0, y0, dw, dh, 'S');

        // Restore thin lines for remainder of document
        doc.setLineWidth(0.05);
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
    const allManifestoItems = [...items];
    if (meta.packingItems && meta.packingItems.length > 0) {
        meta.packingItems.forEach(pi => {
            allManifestoItems.push({
                itemId: 'MISC-PACK', name: pi.name.toUpperCase(), qty: pi.count, weightKg: pi.weight,
                vendorPrefix: 'MISC', tagColor: '#94a3b8', index: 999, rowId: 'MISC', material: 'MISC', color: 'BROWN', dims: '—', imageUrls: [], dbItemCount: pi.count, packetIn: 'MISC'
            } as ManifestoItem);
        });
    }

    const sortedItems: Array<ManifestoItem | { isHeader: boolean; label: string }> = [];
    
    if (meta.sortByTagDesc) {
        // Sort by itemId (Tag ID) descending
        sortedItems.push(...items.sort((a, b) => {
            const idA = String(a.itemId || '');
            const idB = String(b.itemId || '');
            return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
        }));
    } else {
        const itemsByVendor = items.reduce((acc, item) => {
            const v = item.vendorPrefix || 'OTHER';
            if (!acc[v]) acc[v] = [];
            acc[v].push(item);
            return acc;
        }, {} as Record<string, ManifestoItem[]>);

        Object.keys(itemsByVendor).sort().forEach(v => {
            sortedItems.push(...itemsByVendor[v].sort((a, b) => b.qty - a.qty));
        });
    }

    // 2. Append Manual Packing Items at the VERY BOTTOM
    if (meta.packingItems && meta.packingItems.length > 0) {
        meta.packingItems.forEach(pi => {
            sortedItems.push({
                itemId: 'MISC-PACK',
                name: pi.name.toUpperCase(),
                qty: pi.count,
                weightKg: pi.weight,
                vendorPrefix: 'MISC',
                tagColor: '#94a3b8',
                index: 999,
                rowId: 'MISC',
                material: 'MISC',
                color: 'BROWN',
                dims: '—',
                imageUrls: [],
                dbItemCount: pi.count,
                packetIn: 'MISC'
            } as ManifestoItem);
        });
    }

    const isMultiCrate = meta.crateType === 'Trailer Load';

    // Universal Safe Landscape: Fits inside both US Letter (279.4 width) and A4 (210 height)
    // This prevents ANY tiling on mobile AirPrint regardless of regional paper defaults.
    const PW = 297;
    const PH = 210;
    console.log(`[PDF] Init document. format: [${PW}, ${PH}] landscape. Return: ${returnType}`);
    const doc = existingDoc || new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    if (existingDoc) {
        console.log(`[PDF] Appending to existing doc. Pages: ${doc.getNumberOfPages()}`);
        doc.addPage('a4', 'landscape');
    }
    const ML = 15; // margin left
    const MR = 15; // margin right
    const MT = 15; // margin top for continuation pages
    const MB = 15; // margin bottom (including footer)
    const HDR_H = 36; // Height of the primary header area
    const FOOTER_H = 15;

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
    const COL_QTY     = { x: ML, w: 12 };
    const COL_IMG     = { x: COL_QTY.x + COL_QTY.w, w: meta.excludeImages ? 0 : 25 };
    const COL_QR      = { x: COL_IMG.x + COL_IMG.w, w: 22  }; 
    const COL_BARCODE = { x: COL_QR.x + COL_QR.w, w: 50 };
    const COL_TAG     = { x: COL_BARCODE.x + COL_BARCODE.w,  w: 40  }; 
    const COL_NAME    = { x: COL_TAG.x + COL_TAG.w, w: meta.excludeImages ? 81 : 71 }; 
    const COL_DIMS    = { x: COL_NAME.x + COL_NAME.w, w: TABLE_END - (COL_NAME.x + COL_NAME.w) };

    const COL_HDR_H = 8;
    const ROW_H = 24;
    let y = 0;

    // ─── Helper: Draw Page Chrome ──────────────────────────────────────────
    async function drawPageChrome(isPrimaryHeader: boolean) {
        const pageNum = doc.getNumberOfPages();
        doc.setFillColor(...BG);
        doc.rect(0, 0, PW, PH, 'F');

        if (isPrimaryHeader && !meta.excludeHeader) {
            let textX = ML;

            // 1. Draw Wireframe Icon
            let cw = 60, cl = 60, ch = 60;
            if (meta.crateDims) {
                const dimsStr = meta.crateDims.split(' ')[0]; // "120×150×195"
                const parts = dimsStr.split(/×|x/i).map(Number);
                if (parts.length === 3) {
                    cw = parts[0]; cl = parts[1]; ch = parts[2];
                }
            }


            // 2. Draw QR Code and Text
            if (!meta.excludeHeaderQr) {
                const headerQrUrl = await loadQrDataUrl(meta.dynamicId, 300);
                if (headerQrUrl) {
                    const qrSize = 18;
                    doc.setFillColor(255, 255, 255);
                    doc.rect(textX, 8, qrSize, qrSize, 'F');
                    doc.addImage(headerQrUrl, 'PNG', textX, 8, qrSize, qrSize);
                    textX += qrSize + 6;
                }
            }

            let subY = 14;
            doc.setTextColor(...TEXT_HI);
            doc.setFontSize(16); doc.setFont('helvetica', 'bold');
            doc.text(`${meta.dynamicId.toUpperCase()}`, textX, subY);
            
            subY += 6;
            doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text((meta.customTitle || "LOGISTICS MANIFESTO").toUpperCase(), textX, subY);

            if (meta.subtitle) {
                doc.setFontSize(12); doc.setTextColor(...TEXT_MID); doc.setFont('helvetica', 'normal');
                doc.text(meta.subtitle.toUpperCase(), textX + 65, subY);
            }
            
            // Left side crate dims moved to right side

            // 3. Draw Centered Logo
            if (meta.branding && meta.branding !== 'None') {
                const logoName = meta.branding === 'ArtOfDecor' ? 'ArtOfDecorLogo.png' : 'REG_Logo.png';
                const logoUrl = `${import.meta.env.BASE_URL}${logoName}`;
                const logoData = await loadLocalImageDataUrl(logoUrl, 1200);
                if (logoData) {
                    const logoH = meta.branding === 'ArtOfDecor' ? 10 : 16; // Adjusted for new HDR_H
                    const logoW = logoData.w * (logoH / logoData.h);
                    doc.addImage(logoData.dataUrl, 'PNG', (PW - logoW) / 2, 8, logoW, logoH);
                }
            }

            // 4. Right-side metrics
            const totalUnits = allManifestoItems.reduce((s, i) => s + (i.qty || 1), 0);
            const totalWeight = allManifestoItems.reduce((s, i) => s + (i.weightKg || 0) * (i.qty || 1), 0);
            let summaryWeight = `${totalWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
            if (meta.exportBruteWeight) summaryWeight += ` · ${meta.exportBruteWeight.trim()} BRUTE`;

            const rightAlignX = meta.excludeHeaderWireframe ? (PW - MR) : (PW - MR - 32);

            if (!meta.excludeHeaderWireframe) {
                const typeForIcon = (meta.crateType || 'crate').toLowerCase();
                drawWireframeIcon(doc, PW - MR - 28, 8, 22, cw, cl, ch, meta.crateColor || '#D95A0A', typeForIcon);
            }

            let ry = 10;
            
            doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
            doc.text(`ONYX.MX · ${meta.exportedAt}`, rightAlignX, ry, { align: 'right' });
            ry += 6;
            
            if (!isMultiCrate && meta.crateDims) {
                doc.setTextColor(...TEXT_HI); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
                doc.text(`${meta.crateDims}  ·  ${meta.crateType.toUpperCase()}`, rightAlignX, ry, { align: 'right' });
                ry += 6;
            }

            doc.setTextColor(...TEXT_HI); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text(`${summaryWeight.toUpperCase()}`, rightAlignX, ry, { align: 'right' });
            
            ry += 6;
            const nCrates = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'crate').length;
            const nPallets = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'pallet').length;
            const totalSkus = allManifestoItems.length;
            let parts = [];
            if (isMultiCrate) {
                if (nCrates > 0) parts.push(`${nCrates} Crates`);
                if (nPallets > 0) parts.push(`${nPallets} Pallets`);
            }
            parts.push(`${totalUnits} UNITS`);
            parts.push(`${totalSkus} SKU(S)`);
            doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text(parts.join('  ·  '), rightAlignX, ry, { align: 'right' });

        } else {
            // ─── Continuation Header ───
            doc.setFillColor(...SURFACE);
            doc.rect(0, 0, PW, MT, 'F');
            const pageTitle = meta.customTitle || (meta.dynamicId.toUpperCase() + '  ·  PACKING LIST');
            doc.text(`${pageTitle}  ·  PAGE ${pageNum}`, ML, MT - 4);
        }

        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.05);
        doc.line(0, PH - FOOTER_H, PW, PH - FOOTER_H);
        doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
        const footerText = meta.branding === 'ArtOfDecor' ? 'Onyx.mx - Made In Mexico for Art Of Decor' 
                        : meta.branding === 'RareEarth' ? 'Onyx.mx - Made In Mexico for Rare Earth Gallery'
                        : 'ONYX MX - LOGISTICS MANIFESTO';
        doc.text(footerText, ML, PH - 10);
    }

    async function drawSummaryPage() {
        console.log(`[PDF] Rendering Unified Load Dashboard...`);
        
        // Draw Footer manually for the summary page
        doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
        const footerText = meta.branding === 'ArtOfDecor' ? 'Onyx.mx - Made In Mexico for Art Of Decor' 
                        : meta.branding === 'RareEarth' ? 'Onyx.mx - Made In Mexico for Rare Earth Gallery'
                        : 'ONYX MX - LOGISTICS MANIFESTO';
        doc.text(footerText, ML, PH - 10);

        let sy = 8;
        const DASH_W = PW - ML - MR;
        const DASH_H = 68; // Compact unified height
        
        // 1. Dashboard Container
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.05);
        doc.rect(ML, sy, DASH_W, DASH_H, 'FD');

        // 2. Premium Header Bar (Orange)
        doc.setFillColor(...ACCENT);
        doc.rect(ML, sy, DASH_W, 14, 'F');
        
        // Title & Branding
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        const shortDate = meta.exportedAt.split(',')[0];
        doc.text(`ONYX MX - RARE EARTH GALLERY - ${shortDate}`, ML + 4, sy + 9.5);
        
        // Counts (Right Aligned in Bar)
        const nCrates = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'crate').length;
        const nPallets = (meta.allTruckCrates || []).filter(c => c.type.toLowerCase() === 'pallet').length;
        // const nBoxes removed
        const totalUnits = allManifestoItems.reduce((s, i) => s + (i.qty || 1), 0);
        const totalWeight = allManifestoItems.reduce((s, i) => s + (i.weightKg || 0) * (i.qty || 1), 0);
        const summaryWeight = `${totalWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        const statsStr = `${nCrates} Crates  ·  ${nPallets} Pallets  ·  ${totalUnits} Units  ·  ${summaryWeight}`;
        doc.text(statsStr, PW - MR - 4, sy + 9.5, { align: 'right' });

        sy += 14;

        // 3. Central Metrics Grid (Large Text)
        if (meta.truckStats) {
            const ts = meta.truckStats;
            const midY = sy + 4;
            
            // Column 1: Total Payload
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold');
            doc.text('TOTAL LOAD PAYLOAD', ML + 6, midY + 4);
            doc.setFontSize(32); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
            doc.text(`${Math.round(ts.totalWeight).toLocaleString()} KG`, ML + 6, midY + 18);
            doc.setFontSize(9); doc.setTextColor(...TEXT_MID); doc.setFont('helvetica', 'normal');
            doc.text(`${ts.payloadPct}% OF MAX CAPACITY`, ML + 6, midY + 25);

            // Separator
            doc.setDrawColor(240, 240, 240);
            doc.line(ML + 95, midY + 4, ML + 95, midY + 28);

            // Column 2: Distribution & Utilization
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold');
            doc.text('WEIGHT DISTRIBUTION', ML + 102, midY + 4);
            doc.setFontSize(11); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
            doc.text(`REAR: ${ts.rPct}%  ·  MID: ${ts.mPct}%  ·  FRONT: ${ts.fPct}%`, ML + 102, midY + 13);
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold');
            doc.text('UTILIZATION METRICS', ML + 102, midY + 20);
            doc.setFontSize(9); doc.setTextColor(...TEXT_MID); doc.setFont('helvetica', 'normal');
            doc.text(`FLOOR: ${ts.floorPct}%  ·  VOLUME: ${ts.volPct}%`, ML + 102, midY + 26);

            // Separator
            doc.line(PW - MR - 65, midY + 4, PW - MR - 65, midY + 28);

            // Column 3: Load Status
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold');
            doc.text('LOAD STABILITY STATUS', PW - MR - 6, midY + 4, { align: 'right' });
            doc.setFontSize(22); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
            doc.text(ts.status.toUpperCase(), PW - MR - 6, midY + 18, { align: 'right' });
            doc.setFontSize(8); doc.setTextColor(...TEXT_MID); doc.setFont('helvetica', 'normal');
            doc.text(`EXPORTED AT: ${meta.exportedAt}`, PW - MR - 6, midY + 25, { align: 'right' });
            
            sy += 36;
        }

        // 4. Shipment Metadata (Unified Footer of Dashboard)
        doc.setFillColor(252, 252, 252);
        doc.rect(ML + 0.2, sy, DASH_W - 0.4, DASH_H - (sy - 8) - 0.2, 'F');
        doc.setDrawColor(240, 240, 240);
        doc.line(ML, sy, PW - MR, sy);

        let fx = ML + 6;
        const fy = sy + 6;
        const drawField = (label: string, val: string, w: number) => {
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold'); doc.text(label, fx, fy);
            doc.setFontSize(11); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold'); doc.text((val || '—').toUpperCase(), fx, fy + 8);
            fx += w;
        };

        drawField('SEAL NUMBER', meta.sealNumber || '', 38);
        drawField('TRACTOR #', meta.tractorNumber || '', 38);
        drawField('TRUCK PLATES', meta.truckPlates || '', 42);
        drawField('TRAILER #', meta.trailerNumber || '', 38);
        drawField('TRAILER PLATES', meta.trailerPlates || '', 42);
        
        if (meta.senders && meta.senders.length > 0) {
            const senderText = meta.senders.filter(Boolean).join(', ').toUpperCase();
            doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.text('SENDERS / SHIPPER', fx, fy);
            doc.setFontSize(7); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
            const senderLines = doc.splitTextToSize(senderText, PW - MR - fx - 6);
            doc.text(senderLines[0], fx, fy + 6);
        }

        sy = 8 + DASH_H + 12;

        if (meta.topViewImg || meta.sideViewImg) {
            const mapScale = 0.62;
            const mapW = (PW - ML - MR) * mapScale;
            const ox = ML + (PW - ML - MR - mapW) / 2;

            if (meta.topViewImg) {
                doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
                doc.text('TRAILER TOP VIEW MAP (PLAN)', ML, sy);
                sy += 2;
                const mapH = mapW / (1615/244);
                doc.addImage(meta.topViewImg, 'JPEG', ox, sy, mapW, mapH);
                sy += mapH + 4;
            }

            if (meta.sideViewImg) {
                doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_MID);
                doc.text('TRAILER SIDE VIEW MAP (LATERAL STACKING)', ML, sy);
                sy += 2;
                const mapH = mapW / (1615/279);
                doc.addImage(meta.sideViewImg, 'JPEG', ox, sy, mapW, mapH);
                sy += mapH + 6;
            }
        }
        
        if (meta.isoViewImg) {
            doc.addPage('a4', 'landscape');
            await drawPageChrome(false);
            sy = MT + 8;
            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('TRAILER ISOMETRIC 3D LOAD VIEW', ML, sy);
            sy += 6;
            const imgW = PW - ML - MR;
            const imgH = imgW * 0.45; 
            doc.addImage(meta.isoViewImg, 'JPEG', ML, sy, imgW, imgH);
            sy += imgH + 12;
            doc.addPage('a4', 'landscape');
            await drawPageChrome(false);
            sy = MT + 8; 
        }

        if (meta.allTruckCrates) {
            if (sy + 25 > PH - MB) {
                doc.addPage('a4', 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }
            doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
            doc.text('PACKED CRATES & PALLETS SUMMARY', ML, sy);
            sy += 6;
            
            const gridCols = 5;
            const boxW = (PW - ML - MR) / gridCols - 4;
            const boxH = 22;
            let drawnOnThisPage = 0;
            for (let i = 0; i < meta.allTruckCrates.length; i++) {
                const c = meta.allTruckCrates[i];
                if (c.type === 'cardboard') continue;

                const col = drawnOnThisPage % gridCols;
                const row = Math.floor(drawnOnThisPage / gridCols);
                const bx = ML + col * (boxW + 4);
                let by = sy + row * (boxH + 4);
                
                if (by + boxH > PH - MB) {
                    doc.addPage('a4', 'landscape');
                    await drawPageChrome(false);
                    sy = MT + 8;
                    drawnOnThisPage = 0;
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
                drawnOnThisPage++;
            }

            const boxes = (meta.allTruckCrates || []).filter(c => c.type === 'cardboard');
            if (boxes.length > 0) {
                doc.addPage('a4', 'landscape');
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
                        doc.addPage('a4', 'landscape');
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
        const hasBoxes = boxes.length > 0;
        const hasPacking = meta.packingItems && meta.packingItems.length > 0;
        
        if (!hasBoxes && !hasPacking) return;
        
        doc.addPage('a4', 'landscape');
        await drawPageChrome(false);
        let sy = MT + 8;
        
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT_HI);
        doc.text('CARDBOARD BOX CONTENTS DETAIL', ML, sy);
        sy += 8;
        
        if (hasBoxes) {
            for (const box of boxes) {
                const boxItems = allManifestoItems.filter(i => i.boxLabel === box.label);
                if (boxItems.length === 0) continue;
                
                // Check for space
                const needed = 8 + (boxItems.length * 6);
                if (sy + needed > PH - MB) {
                    doc.addPage('a4', 'landscape');
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

        // 2. Manual Packing Items (Loose)
        if (hasPacking) {
            // Check for space
            const needed = 12 + (meta.packingItems!.length * 6);
            if (sy + needed > PH - MB) {
                doc.addPage('a4', 'landscape');
                await drawPageChrome(false);
                sy = MT + 8;
            }

            doc.setFillColor(240, 240, 240);
            doc.rect(ML, sy, PW - ML - MR, 6, 'F');
            doc.setTextColor(...TEXT_HI);
            doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text('MISCELLANEOUS PACKING ITEMS (EXTRA BOXES)', ML + 2, sy + 4.5);
            sy += 8;

            for (const pi of meta.packingItems!) {
                doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold');
                doc.text(`${pi.count}×`, ML + 4, sy);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...TEXT_MID);
                doc.text(`${pi.name.toUpperCase()}  ·  ${pi.weight} KG`, ML + 15, sy);
                sy += 6;
            }
        }
    }

    function drawColHeaders(y: number) {
        doc.setTextColor(...TEXT_LO);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const ty = y + 5;
        doc.text('QTY', COL_QTY.x + COL_QTY.w / 2, ty, { align: 'center' });
        if (!meta.excludeImages) doc.text('PHOTO', COL_IMG.x + COL_IMG.w / 2, ty, { align: 'center' });
        doc.text('SCAN', COL_QR.x + COL_QR.w / 2, ty, { align: 'center' });
        doc.text('BARCODE', COL_BARCODE.x + 2, ty);
        doc.text('BOOK TAG ID', COL_TAG.x + 2, ty);
        doc.text('ITEM DESCRIPTION', COL_NAME.x + 2, ty);
        doc.text('DIMENSIONS · WEIGHT', COL_DIMS.x + 2, ty);
    }

    if (isMultiCrate) {
        await drawSummaryPage();
        doc.addPage('a4', 'landscape');
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

        // DIAGNOSTIC LOG
        console.log(`[PDF] Processing Tag ID: ${item.itemId} | Images Found: ${item.imageUrls?.length || 0}`, item.imageUrls);
        // Gallery Row Visibility & Count Calculation
        const numImagesTotal = (!meta.excludeImages && item.imageUrls && item.imageUrls.length > 0) 
            ? item.imageUrls.length 
            : 0;
        const numImagesInGallery = numImagesTotal - 1;
        const hasGallery = numImagesInGallery > 0;
        const galleryImgSize = 20;
        const imagesPerRow = Math.max(1, Math.floor((TABLE_END - (COL_QR.x + 2 + xOffset)) / (galleryImgSize + 2)));
        const galleryRows = hasGallery ? Math.ceil(numImagesInGallery / imagesPerRow) : 0;
        const totalRowH = ROW_H + (galleryRows * (galleryImgSize + 2)) + (galleryRows > 0 ? 2 : 0);

        // Check for page break
        if (y + totalRowH > PH - FOOTER_H) {
            doc.addPage('a4', 'landscape');
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
        doc.setLineWidth(0.05);
        doc.line(ML, y + totalRowH, TABLE_END, y + totalRowH);

        // 1. SCAN (QR Code with Padding)
        const qrDataUrl = await loadQrDataUrl(item.itemId, 150);
        if (qrDataUrl) {
            const qrDrawSize = 18;
            const qrDrawX = COL_QR.x + (COL_QR.w - qrDrawSize) / 2 + xOffset;
            const qrDrawY = y + (ROW_H - qrDrawSize) / 2;
            doc.addImage(qrDataUrl, 'PNG', qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);
            
            // VENDOR BUBBLE INSIDE QR CODE
            const tagVColor = getVendorColor(item.itemId);
            const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
            
            const qrCenterX = qrDrawX + qrDrawSize / 2;
            const qrCenterY = qrDrawY + qrDrawSize / 2;
            
            // Draw white background circle to punch out the QR code pixels
            doc.setFillColor(255, 255, 255);
            doc.circle(qrCenterX, qrCenterY, 2.7, 'F');
            
            // Draw the vendor color bubble
            doc.setFillColor(tagHexColor);
            doc.circle(qrCenterX, qrCenterY, 2.1, 'F');
        }

        // 2. PHOTO (Main Item Photo) & AXONOMETRIC
        let hasMainImage = false;
        if (!meta.excludeImages && item.imageUrls && item.imageUrls.length > 0) {
            const imgRes = await loadImageDataUrl(item.imageUrls[0], 150);
            if (imgRes) {
                hasMainImage = true;
                const { dataUrl, w, h } = imgRes;
                const aspect = w / h;
                let dw = 24, dh = 24;
                if (aspect > 1) dh = 24 / aspect; else dw = 24 * aspect;
                
                doc.setDrawColor(230, 230, 230);
                doc.rect(COL_IMG.x + (COL_IMG.w - dw) / 2 - 0.2 + xOffset, y + (ROW_H - dh) / 2 - 0.2, dw + 0.4, dh + 0.4, 'S');
                doc.addImage(dataUrl, 'JPEG', COL_IMG.x + (COL_IMG.w - dw) / 2 + xOffset, y + (ROW_H - dh) / 2, dw, dh);
            }
        }
        

        // 4. BOOK TAG ID (Black Text)
        doc.setFontSize(12.5); 
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0); // Black text
        
        const formattedTagId = item.itemId.length > 5 ? item.itemId.slice(0, 5) + ' ' + item.itemId.slice(5) : item.itemId;
        doc.text(formattedTagId, COL_TAG.x + 2 + xOffset, y + (ROW_H + 4) / 2, { align: 'left' });

        // 4b. BARCODE (Code 39)
        if (item.itemId && item.itemId !== 'MISC-PACK') {
            try {
                const bcodeDataUrl = await loadCode39DataUrl(item.itemId);
                if (bcodeDataUrl) {
                    const bw = COL_BARCODE.w - 4;
                    const bh = 14;
                    doc.addImage(bcodeDataUrl, 'PNG', COL_BARCODE.x + 2, y + (ROW_H - bh) / 2, bw, bh);
                }
            } catch (e) { console.error('Error drawing barcode', e); }
        }

        // 5. ITEM DESCRIPTION
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const nameLines = doc.splitTextToSize(item.name.toUpperCase(), COL_NAME.w - 4 - xOffset);
        doc.text(nameLines[0], COL_NAME.x + 2 + xOffset, y + 10);
        
        // Color / Material plain text
        doc.setFontSize(11);
        doc.setTextColor(110, 110, 110);
        doc.setFont('helvetica', 'normal');
        const mats = [item.color, item.material].filter(Boolean).map(s => s.toUpperCase()).join(' · ');
        if (mats) {
            doc.text(mats, COL_NAME.x + 2 + xOffset, y + 16.5);
        }

        // 6. DIMENSIONS · WEIGHT (Larger & Bolder)
        doc.setTextColor(...TEXT_HI);
        doc.setFontSize(11.5);
        doc.setFont('helvetica', 'bold');
        doc.text(item.dims || '—', COL_DIMS.x + 2, y + 10);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${item.weightKg} kg  ·  ${(item.weightKg * 2.20462).toFixed(1)} lbs`, COL_DIMS.x + 2, y + 16);

        try {
            // Draw LARGER axometric icon next to dimensions panel
            let wCm = 0, hCm = 0, dCm = 0;
            if (item.dims && item.dims !== '—') {
                const parts = item.dims.replace(/[^0-9.×x]/gi, '').split(/×|x/i).map(Number);
                if (parts.length >= 1) {
                    wCm = parts[0] || 0;
                    hCm = parts.length > 1 ? parts[1] : wCm;
                    dCm = parts[2] || 0;
                }
            }
            
            const shapeStr = item.name.split(' - ')[0] || '';
            const descStr = item.name.split(' - ')[1] || item.name;
            
            if (wCm || hCm || dCm) {
                if (!wCm) wCm = dCm || hCm || 10;
                if (!hCm) hCm = shapeStr.toLowerCase().includes('plate') ? 5 : wCm;
                if (!dCm) dCm = wCm;
                
                const itemColor = resolveItemColor(item as any);
                const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr, itemColor, true);
                if (axoDataUrl) {
                    const axoSize = 20; // LARGER
                    doc.addImage(axoDataUrl, 'JPEG', COL_DIMS.x + COL_DIMS.w - axoSize - 2, y + (ROW_H - axoSize) / 2, axoSize, axoSize);
                }
            }
        } catch (e) { console.error('Error drawing axometric in manifesto', e); }

        // 7. QTY (Slightly Smaller)
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text(`×${item.qty}`, COL_QTY.x + COL_QTY.w / 2, y + 13.5, { align: 'center' });

        // ─── Extended Gallery (Non-duplicated) ───────────────────────────────
        if (hasGallery) {
            let gx = COL_QR.x + 2 + xOffset;
            let gy = y + ROW_H + 2;
            
            doc.setDrawColor(245, 245, 245);
            doc.line(gx, gy - 0.5, TABLE_END - 2, gy - 0.5);

            for (let j = 0; j < numImagesInGallery; j++) {
                // Skip the first image (already in PHOTO column)
                const url = item.imageUrls?.[j + 1] || '';
                
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
