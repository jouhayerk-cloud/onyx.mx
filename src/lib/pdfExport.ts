import { jsPDF } from 'jspdf';
import { getCleanImageUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData } from './utils';
import { generateAxonometricDataUrl } from './axonometric';

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

async function loadImgData(url: string, maxSize = 900): Promise<ImgData | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image(); el.crossOrigin = 'anonymous'; el.onload = () => resolve(el); el.onerror = reject; el.src = url; setTimeout(() => reject(new Error('timeout')), 8000);
        });
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w, h };
    } catch { return null; }
}

function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number) {
    doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cw, ch, 'F');
    const ir = img.w / img.h; const cr = cw / ch;
    let dw: number, dh: number;
    if (ir > cr) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
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
    const wCm = parseFloat(norm.widthCm);
    const hCm = parseFloat(norm.heightCm);
    let dCm = parseFloat(norm.lengthCm);
    
    // Round objects often lack a depth dimension because depth = width
    if (!dCm && wCm) {
        dCm = wCm;
    }

    const shapeStr = norm.shape || '';
    const descStr = norm.shortDescription || norm.description || '';
    if (wCm && hCm && dCm) {
        try {
            const axoDataUrl = await generateAxonometricDataUrl(wCm, hCm, dCm, shapeStr, descStr);
            if (axoDataUrl) {
                const axoSize = 45; // Size in mm
                doc.addImage(axoDataUrl, 'PNG', PW - M - axoSize, startY + 5, axoSize, axoSize);
            }
        } catch (e) {
            console.error("Failed to draw axonometric box", e);
        }
    }

    const tY = startY + 8; // Tag ID row
    const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—';
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(barcode, M + 4, tY);
    
    const aqld = [codes.bookAqCode, codes.bookLandCode].filter(c => c && c !== '-').join('  ·  ');
    if (aqld) { 
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80); 
        doc.text(aqld, M + 4 + doc.getTextWidth(barcode) + 12, tY); 
    }
    
    // Shape + Type (Description)
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    const nY = tY + 14;
    doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(nameStr.toUpperCase(), M + 4, nY, { maxWidth: PW - M * 2 - 10 });
    
    // Color + Material
    const color = item.data.color || item.data.Color || '';
    const material = item.data.material || item.data.Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');
    const dY = nY + 12;
    if (detailStr) {
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
        doc.text(detailStr.toUpperCase(), M + 4, dY);
    }

    const lineY = dY + 8;
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M + 4, lineY, PW - M, lineY);
    
    const specY = lineY + 12;
    const priceLabel = codes.primaryPriceLabel || (exportType === 'regular' ? 'ACQUISITION COST' : 'USD RETAIL');
    const priceValue = codes.primaryPriceValue || (codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—');
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
    const dimsImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
    const weightImp = toImp(norm.weightKg, 'lbs');

    const cols = [
        { label: priceLabel, value: priceValue, x: M + 4, accent: true },
        { label: 'QTY',        value: String(norm.quantity || 1), x: M + 75 },
        { label: 'DIMENSIONS', m: dimsMetric, i: (dimsMetric ? `(${dimsImp})` : ''), x: M + 105 },
        { label: 'WEIGHT',     m: (norm.weightKg ? `${norm.weightKg}kg` : ''), i: (norm.weightKg ? `(${weightImp})` : ''), x: M + 172 }
    ];
    
    cols.forEach((col: any) => {
        const cx = col.x;
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120); doc.text(col.label, cx, specY);
        
        if (col.label === 'DIMENSIONS' || col.label === 'WEIGHT') {
            doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
            const mVal = col.m || '—';
            doc.text(mVal, cx, specY + 10);
            if (col.i && exportType !== 'regular') {
                doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
                doc.text(col.i, cx, specY + 16);
            }
        } else {
            doc.setFontSize(col.accent ? 18 : 14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(col.value, cx, specY + 10);
        }
    });

    
    doc.setDrawColor(235, 235, 235); doc.line(M + 4, specY + 22, PW - M, specY + 22);
    return specY + 28;
}

function drawHeaderCompact(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, pageNum: number, totalPages: number): number {
    const norm = normalizeInventoryData(item.data);
    const hY = startY + 4;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(`${item.codes.bookBarcodeDisplay || item.codes.bookBarcode || item.codes.bookTagId || '—'}  \xb7  PAGE ${pageNum} OF ${totalPages}`, M + 4, hY);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text((norm.shortDescription || norm.shape || 'Stone Piece').toUpperCase(), M + 4, hY + 8);
    doc.setDrawColor(245, 245, 245); doc.setLineWidth(0.2); doc.line(M + 4, hY + 9, PW - M, hY + 9);
    return hY + 12;
}

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
    
    // --- COVER PAGE ---
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F');
    doc.setFontSize(48); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15); doc.text('Art of Decor', M + 4, 88);
    doc.setFontSize(22); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 100, 15); doc.text(config.title || 'Artifact Catalog', M + 4, 102);
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M + 4, 110, PW - M, 110);
    doc.setFontSize(9); doc.setTextColor(160, 160, 160); doc.text(`${results.length} Items  \xb7  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M + 4, 118);
    
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 200); 
        doc.text('Art of Decor', M + 4, PH - 8); 
        doc.text(String(globalPageNum), PW - M, PH - 8, { align: 'right' }); 
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
                doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
                const specY = await drawHeader(doc, item, M, PW, M, exportType);
                doc.setFillColor(248, 248, 248); doc.rect(M + 4, specY + 4, PW - M * 2 - 4, PH - specY - 24, 'F');
            } else {
                for (let j = 0; j < imgs.length; j++) {
                    doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
                    const specY = await drawHeader(doc, item, M, PW, M, exportType);
                    
                    const imgUrl = getCleanImageUrl(imgs[j]);
                    const d = await loadImgData(imgUrl, 1200);
                    const imgW = PW - M * 2 - 4;
                    const imgH = PH - specY - 24;
                    if (d) {
                        drawContain(doc, d, M + 4, specY + 4, imgW, imgH);
                    } else {
                        doc.setFillColor(248, 248, 248); doc.rect(M + 4, specY + 4, imgW, imgH, 'F');
                    }
                    
                    if (imgs.length > 1) {
                        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
                        doc.text(`IMAGE ${j + 1} OF ${imgs.length}`, PW - M, specY - 2, { align: 'right' });
                    }
                }
            }
        }
    } else {
        // --- METHOD: GRID CATALOG ---
        const simple = results.filter(r => r.images.length <= 2);
        const rich = results.filter(r => r.images.length > 2);
        const HW = (PW - M * 2 - 4) / 2; const HG = 4;

        for (let i = 0; i < simple.length; i += 2) {
            doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
            doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.2); doc.line(M + HW + HG / 2, M, M + HW + HG / 2, PH - M);
            for (let slot = 0; slot < 2; slot++) {
                const item = simple[i + slot]; if (!item) break;
                processedCount++;
                onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
                const norm = normalizeInventoryData(item.data); 
                const codes = item.codes; const sx = M + slot * (HW + HG);
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—', sx + 2, M + 6);
                const shape = norm.shape || '';
                const desc = norm.shortDescription || '';
                const nameStr = (shape && desc && shape !== desc) ? `${shape} - ${desc}` : (shape || desc || 'Stone Piece');
                doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(nameStr.toUpperCase(), sx + 2, M + 13, { maxWidth: HW - 4 });
                
                const color = item.data.color || item.data.Color || '';
                const material = item.data.material || item.data.Material || '';
                const detailStr = [color, material].filter(Boolean).join(' · ');
                if (detailStr) {
                    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
                    doc.text(detailStr.toUpperCase(), sx + 2, M + 18);
                }

                doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(sx + 2, M + 21, sx + HW - 2, M + 21);
                
                const gridPriceLabel = codes.primaryPriceLabel || (exportType === 'regular' ? 'ACQUISITION COST' : 'USD RETAIL');
                const gridPriceValue = codes.primaryPriceValue || (codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail} USD` : '—');
                
                doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100); doc.text(gridPriceLabel, sx + 2, M + 26);
                doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(gridPriceValue, sx + 2, M + 33);
                
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
                const dimsM = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
                const dimsMStr = dimsM ? `${dimsM}cm` : '—';
                const dimsI = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
                const weightMStr = norm.weightKg ? `${norm.weightKg}kg` : '—';
                const weightIStr = norm.weightKg ? `(${toImp(norm.weightKg, 'lbs')})` : '';

                // Dimensions (Two lines)
                doc.text(dimsMStr, sx + 2, M + 39);
                if (dimsMStr !== '—' && exportType !== 'regular') {
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
                    doc.text(`(${dimsI})`, sx + 2, M + 44);
                }

                // Weight (Two lines)
                doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
                doc.text(weightMStr, sx + 2, M + 51);
                if (weightMStr !== '—' && exportType !== 'regular') {
                    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
                    doc.text(weightIStr, sx + 2, M + 56);
                }

                const imgTop = M + 58; const imgH = PH - imgTop - 14; const imgW = HW - 4; const imgs = item.images;
                if (imgs.length === 0) { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); }
                else if (imgs.length === 1) { const d = await loadImgData(getCleanImageUrl(imgs[0])); if (d) drawContain(doc, d, sx + 2, imgTop, imgW, imgH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); } }
                else { const cellH = (imgH - 2) / 2; for (let j = 0; j < 2; j++) { const cy = imgTop + j * (cellH + 2); const d = await loadImgData(getCleanImageUrl(imgs[j])); if (d) drawContain(doc, d, sx + 2, cy, imgW, cellH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, cy, imgW, cellH, 'F'); } } }
            }
        }
        
        for (let i = 0; i < rich.length; i++) {
            const item = rich[i]; const imgs = item.images; const n = imgs.length;
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            const CHUNK = 12; // 4 columns x 3 rows
            const totalPagesForItem = Math.ceil(n / CHUNK);
            
            for (let p = 0; p < totalPagesForItem; p++) {
                doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
                
                let imgTop = 0;
                if (p === 0) {
                    imgTop = drawHeader(doc, item, M, PW, M, exportType);
                } else {
                    imgTop = drawHeaderCompact(doc, item, M, PW, M, p + 1, totalPagesForItem);
                }
                
                const imgH = PH - imgTop - 14; const imgW = PW - M * 2 - 4;
                const currentChunk = imgs.slice(p * CHUNK, (p + 1) * CHUNK);
                const numInChunk = currentChunk.length;
                
                let cols = 2, rows = 1;
                if (numInChunk <= 4) { cols = 2; rows = Math.ceil(numInChunk / 2); }
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
