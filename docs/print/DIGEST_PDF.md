# PDF and HTML print generators: digest

Script-generated, line-numbered.

### pdfExport.ts signatures (`src/lib/pdfExport.ts`, 1345 lines)
```
9: export interface CatalogArtifact {
10:     data: any;
11:     codes: {
12:         bookBarcode: string;
...
31: function drawFormattedTagCode(doc: jsPDF, codes: any, x: number, y: number, fontSize: number = 9) {
32:     const barcode = codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '';
33:     const parts = barcode.trim().split(/\s+/);
34:     const sec1 = parts[0] || '';
...
87: export interface CatalogExportStats { imagesTotal: number; imagesFailed: number; payloadChars: number; }
88: 
89: async function loadImgDataUncached(url: string, maxSize = 800, keepPng = true, bgColor = '#FFFFFF', padding = 4): Promise<ImgData | null> {
90:     try {
91:         if (!url) return null;
92:         const cleanUrl = getCleanImageUrl(url) || url;
...
203: async function loadExternalImageAsDataUrl(cleanUrl: string): Promise<HTMLImageElement> {
204:     // Google never sends Access-Control-Allow-Origin for Drive or lh3 content,
205:     // so strategy 1 cannot succeed for those hosts -- it just spends a failed
206:     // round trip per image before we fall through to the proxy that does work.
...
280: function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number, scale = 1.0, overrideBgColor?: string) {
281:     if (!img || !img.dataUrl || !img.w || !img.h) return;
282: 
283:     // 1. Optional background plate. Catalogue pages pass nothing and get none:
...
317: const toImp = (val: any, type: 'in' | 'lbs' | 'ft' = 'in') => {
318:     const v = parseFloat(val); if (!v || isNaN(v)) return '';
319:     if (type === 'lbs') return formatWeightImperialOnly(v);
320:     return cmToImperial(v);
...
323: async function drawHeader(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, exportType: 'regular' | 'catalog' = 'regular', pageInfo?: { current: number, total: number }): Promise
324:     const norm = normalizeInventoryData(item.data);
325:     const codes = item.codes;
326: 
...
506: function drawHeaderCompact(doc: any, item: CatalogArtifact, M: number, PW: number, startY: number, pageNum: number, totalPages: number): number {
507:     const norm = normalizeInventoryData(item.data);
508:     const hY = startY + 4;
509:     doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
...
520: function renderStyledMarketingHtml(doc: any, html: string, x: number, y: number, width: number, maxH: number) {
521:     if (!html) return;
522:     let currentY = y;
523:     const endYLimit = y + maxH;
...
624: async function loadLogoData(logoBase64Url: string): Promise<LogoData | null> {
625:     if (!logoBase64Url) return null;
626:     try {
627:         const img = await new Promise<HTMLImageElement>((resolve, reject) => {
...
657: function cleanStillUrl(raw: any): string | null {
658:     if (!raw) return null;
659:     const str = String(raw).trim();
660:     if (!str || isVideoFile(str)) return null;
...
664: function getItemImages(item: any): string[] {
665:     if (!item) return [];
666: 
667:     // 1. Direct images array on CatalogArtifact
...
704: async function drawCatalogHubPage(
705:     doc: any,
706:     item: CatalogArtifact,
707:     M: number,
...
999: export function beginImageSession() {
1000:     if (sessionDepth === 0) imgDataCache.clear();
1001:     sessionDepth++;
... (capped at 70 lines)
```

### pdfExport.ts page set-up and primitives (`src/lib/pdfExport.ts`, 1345 lines)
```
2: import { getCleanImageUrl, isGoogleHostedUrl, cmToImperial, formatWeightImperialOnly, normalizeInventoryData, extractFileId, fetchImageBatch, extractItemHexString, trimTransparentCanvas, getProductCat
3: import QRCode from 'qrcode';
4: import JsBarcode from 'jsbarcode';
5: import { getVendorColor } from './excelStyles';
6: import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
7: 
...
38: 
39:     doc.setFontSize(fontSize);
40:     doc.setTextColor(20, 20, 20);
41: 
42:     let currX = x;
...
45:     if (sec1) {
46:         doc.setFont('helvetica', 'normal');
47:         doc.text(sec1, currX, y);
48:         currX += doc.getTextWidth(sec1);
49:     }
...
56:         const middleStr = (sec1 ? '-' : '') + middleParts.join('-');
57:         doc.setFont('helvetica', 'bold');
58:         doc.text(middleStr, currX, y);
59:         currX += doc.getTextWidth(middleStr);
60:     }
...
64:         const lastStr = (sec1 || middleParts.length > 0 ? '-' : '') + sec4;
65:         doc.setFont('helvetica', 'normal');
66:         doc.text(lastStr, currX, y);
67:         currX += doc.getTextWidth(lastStr);
68:     }
...
107:             // For ALL external URLs: convert to data URL via fetch first to avoid
108:             // canvas tainting. Canvas operations (getImageData, toDataURL) throw
109:             // SecurityError on cross-origin images even with crossOrigin='anonymous'
110:             // if the server doesn't send proper CORS headers.
111:             img = await loadExternalImageAsDataUrl(cleanUrl);
...
165:             fctx.drawImage(canvas, 0, 0);
166:             dataUrl = flat.toDataURL('image/jpeg', 0.85);
167:         } else {
168:             let hasAlpha = true;
169:             try {
...
180:             }
181:             dataUrl = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
182:         }
183: 
184:         return {
...
267:     // Strategy 3: CORS anonymous Image() as last resort
268:     // WARNING: This may taint the canvas — getImageData/toDataURL will throw.
269:     // But at least the image will be visible if addImage accepts HTMLImageElement.
270:     return await new Promise<HTMLImageElement>((resolve, reject) => {
271:         const el = new Image();
272:         el.crossOrigin = 'anonymous';
...
313:     const format = img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
314:     doc.addImage(img.dataUrl, format, imgX, imgY, dw, dh);
315: }
316: 
317: const toImp = (val: any, type: 'in' | 'lbs' | 'ft' = 'in') => {
...
342:     try {
343:         qrDataUrl = await QRCode.toDataURL(barcode.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: 200, color: { dark: '#141414', light: '#ffffff' } });
344:     } catch (e) { console.error('QR code err', e); }
345: 
346:     let barDataUrl = '';
...
348:         const canvas = document.createElement('canvas');
349:         JsBarcode(canvas, barcode.replace(/\s+/g, ''), { format: 'CODE128', displayValue: false, margin: 0, height: 40, lineColor: '#141414' });
350:         barDataUrl = canvas.toDataURL('image/png');
351:     } catch (e) { console.error('Barcode err', e); }
352: 
353:     const qrSize = 18;
...
361:     if (qrDataUrl) {
362:         doc.addImage(qrDataUrl, 'PNG', currentX, row1Y, qrSize, qrSize);
363:         const tagVColor = getVendorColor(barcode);
364:         const tagHexColor = tagVColor.startsWith('FF') ? '#' + tagVColor.substring(2) : '#' + tagVColor;
365:         const qrCenterX = currentX + qrSize / 2;
...
376:     if (barDataUrl) {
377:         doc.addImage(barDataUrl, 'PNG', codesX, row1Y, barWidth, barHeight);
378:     }
379: 
380:     const tagIdY = row1Y + barHeight + 5;
...
387: 
388:     doc.setFontSize(8);
389:     doc.setFont('helvetica', 'normal');
390:     doc.setTextColor(60, 60, 60);
391:     doc.text('DIMENSIONS', dimX, row1Y + 3);
392: 
393:     doc.setFontSize(10);
394:     doc.setFont('helvetica', 'bold');
395:     doc.setTextColor(20, 20, 20);
396:     const mVal = dimsMetric || '—';
397:     doc.text(mVal, dimX, row1Y + 8);
...
399:     if (dimsMetric) {
400:         doc.setFontSize(9);
401:         doc.setFont('helvetica', 'normal');
402:         doc.setTextColor(100, 100, 100);
403:         doc.text(`(${dimsImp})`, dimX, row1Y + 12);
404:     }
...
409: 
410:     doc.setFontSize(8);
411:     doc.setFont('helvetica', 'normal');
412:     doc.setTextColor(60, 60, 60);
413:     doc.text('WEIGHT', weightX, row1Y + 3);
414: 
415:     doc.setFontSize(10);
416:     doc.setFont('helvetica', 'bold');
417:     doc.setTextColor(20, 20, 20);
418:     const wVal = norm.weightKg ? `${norm.weightKg}kg` : '—';
419:     doc.text(wVal, weightX, row1Y + 8);
...
421:     if (norm.weightKg) {
422:         doc.setFontSize(9);
423:         doc.setFont('helvetica', 'normal');
424:         doc.setTextColor(100, 100, 100);
425:         doc.text(`(${weightImp})`, weightX, row1Y + 12);
426:     }
...
434:             if (axoDataUrl) {
435:                 doc.addImage(axoDataUrl, 'JPEG', axoX, row1Y - 2, axoSize, axoSize);
436:             }
437:         } catch (e) {
438:             console.error("Failed to draw axonometric box", e);
... (capped at 130 lines)
```

### crateManifesto.ts signatures (`src/lib/crateManifesto.ts`, 1059 lines)
```
12: export interface ManifestoItem {
13:     index: number;            // DB item number (numeric portion from itemId)
14:     vendorPrefix: string;
15:     qty: number;
...
32: export interface ManifestoMeta {
33:     dynamicId: string;
34:     crateId: string;
35:     crateDims: string;        // "W×L×H cm"
...
82: async function loadQrDataUrl(text: string, sizePx = 80): Promise<string | null> {
83:     try {
84:         return await QRCode.toDataURL(text.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: sizePx, color: { dark: '#141414', light: '#ffffff' } });
85:     } catch (e) {
...
92: async function loadBarcodeDataUrl(text: string): Promise<string | null> {
93:     const encoded = encodeURIComponent(text);
94:     const url = `https://barcodeapi.org/api/code128/${encoded}`;
95:     try {
...
111: async function loadCode39DataUrl(text: string): Promise<string | null> {
112:     const encoded = encodeURIComponent(text);
113:     const url = `https://barcodeapi.org/api/code39/${encoded}`;
114:     try {
...
131: async function loadLocalImageDataUrl(url: string, maxPx = 120): Promise<{ dataUrl: string, w: number, h: number } | null> {
132:     if (!url) return null;
133:     try {
134:         const img = await new Promise<HTMLImageElement>((res, rej) => {
...
153: async function loadImageDataUrl(url: string, maxPx = 120): Promise<{ dataUrl: string, w: number, h: number } | null> {
154:     if (!url) return null;
155:     // Use a reliable proxy to bypass CORS and ensure consistent resizing
156:     const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${maxPx * 2}&h=${maxPx * 2}&fit=inside&output=jpg&q=80`;
...
183: function hexToRgb(hex: string): [number, number, number] {
184:     const h = (hex || '#6b7280').replace('#', '');
185:     if (h.length === 3) {
186:         return [
...
196: function getContrastColor(hex: string): [number, number, number] {
197:     const [r, g, b] = hexToRgb(hex);
198:     // Relative luminance formula (approximate)
199:     const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
...
203: function drawWireframeIcon(doc: jsPDF, x: number, y: number, sizePx: number, cw: number, cl: number, ch: number, colorHex: string, type: string) {
204:     try {
205:         const visH = type.toLowerCase().includes('pallet') ? 15 : ch;
206:         const maxDim = Math.max(cw, cl, visH, 1);
...
235: export async function exportCrateManifesto(
... (capped at 50 lines)
```

### crateManifesto.ts page set-up and primitives (`src/lib/crateManifesto.ts`, 1059 lines)
```
6: import { jsPDF } from 'jspdf';
7: import QRCode from 'qrcode';
8: import { cmToImperial, extractItemHexString, getTextColorForBg } from './utils';
9: import { getVendorColor } from './excelStyles';
10: import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
...
83:     try {
84:         return await QRCode.toDataURL(text.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: sizePx, color: { dark: '#141414', light: '#ffffff' } });
85:     } catch (e) {
86:         console.error('QR code err', e);
87:         return null;
...
106:         c.getContext('2d')!.drawImage(img, 0, 0);
107:         return c.toDataURL('image/png');
108:     } catch { return null; }
109: }
110: 
...
126:         c.getContext('2d')!.drawImage(img, 0, 0);
127:         return c.toDataURL('image/png');
128:     } catch { return null; }
129: }
130: 
...
148:         ctx.drawImage(img, 0, 0, w, h);
149:         return { dataUrl: c.toDataURL('image/png'), w, h };
150:     } catch { return null; }
151: }
152: 
...
175:         ctx.drawImage(img, 0, 0, w, h);
176:         return { dataUrl: c.toDataURL('image/jpeg', 0.85), w, h };
177:     } catch (err) {
178:         console.warn(`[PDF] Failed to load image from URL: ${url} | Error: ${err instanceof Error ? err.message : String(err)}`);
179:         return null;
...
301:     const PH = 210;
302:     console.log(`[PDF] Init document. format: [${PW}, ${PH}] landscape. Return: ${returnType}`);
303:     const doc = existingDoc || new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
304:     if (existingDoc) {
305:         console.log(`[PDF] Appending to existing doc. Pages: ${doc.getNumberOfPages()}`);
306:         doc.addPage('a4', 'landscape');
307:     }
308:     const ML = 15; // margin left
309:     const MR = 15; // margin right
310:     const MT = 15; // margin top for continuation pages
311:     const MB = 15; // margin bottom (including footer)
312:     const HDR_H = 36; // Height of the primary header area
313:     const FOOTER_H = 15;
314: 
...
364:                     doc.rect(textX, 8, qrSize, qrSize, 'F');
365:                     doc.addImage(headerQrUrl, 'PNG', textX, 8, qrSize, qrSize);
366:                     textX += qrSize + 6;
367:                 }
368:             }
...
371:             doc.setTextColor(...TEXT_HI);
372:             doc.setFontSize(16); doc.setFont('helvetica', 'bold');
373:             doc.text(`${meta.dynamicId.toUpperCase()}`, textX, subY);
374: 
375:             subY += 6;
376:             doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
377:             let titleText = (meta.customTitle || "LOGISTICS MANIFESTO").toUpperCase();
378:             if (meta.subtitle) {
379:                 titleText += `  ·  ${meta.subtitle.toUpperCase()}`;
...
394:                     const logoW = logoData.w * (logoH / logoData.h);
395:                     doc.addImage(logoData.dataUrl, 'PNG', (PW - logoW) / 2, 8, logoW, logoH);
396:                 }
397:             }
398: 
...
413: 
414:             doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
415:             doc.text(`ONYX.MX · ${meta.exportedAt}`, rightAlignX, ry, { align: 'right' });
416:             ry += 6;
417: 
418:             if (!isMultiCrate && meta.crateDims) {
419:                 doc.setTextColor(...TEXT_HI); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
420:                 doc.text(`${meta.crateDims}  ·  ${meta.crateType.toUpperCase()}`, rightAlignX, ry, { align: 'right' });
421:                 ry += 6;
422:             }
423: 
424:             doc.setTextColor(...TEXT_HI); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
425:             doc.text(`${summaryWeight.toUpperCase()}`, rightAlignX, ry, { align: 'right' });
426: 
427:             ry += 6;
...
437:             parts.push(`${totalSkus} SKU(S)`);
438:             doc.setFontSize(12); doc.setFont('helvetica', 'bold');
439:             doc.text(parts.join('  ·  '), rightAlignX, ry, { align: 'right' });
440: 
441:         } else {
...
451:         doc.line(0, PH - FOOTER_H, PW, PH - FOOTER_H);
452:         doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
453:         const footerText = meta.branding === 'ArtOfDecor' ? 'Onyx.mx - Made In Mexico for Art Of Decor'
454:                         : meta.branding === 'RareEarth' ? 'Onyx.mx - Made In Mexico for Rare Earth Gallery'
455:                         : 'ONYX MX - LOGISTICS MANIFESTO';
...
462:         // Draw Footer manually for the summary page
463:         doc.setTextColor(...TEXT_LO); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
464:         const footerText = meta.branding === 'ArtOfDecor' ? 'Onyx.mx - Made In Mexico for Art Of Decor'
465:                         : meta.branding === 'RareEarth' ? 'Onyx.mx - Made In Mexico for Rare Earth Gallery'
466:                         : 'ONYX MX - LOGISTICS MANIFESTO';
...
484:         doc.setTextColor(255, 255, 255);
485:         doc.setFontSize(14); doc.setFont('helvetica', 'bold');
486:         const shortDate = meta.exportedAt.split(',')[0];
487:         doc.text(`ONYX MX - RARE EARTH GALLERY - ${shortDate}`, ML + 4, sy + 9.5);
488: 
...
496: 
497:         doc.setFontSize(9); doc.setFont('helvetica', 'bold');
498:         const statsStr = `${nCrates} Crates  ·  ${nPallets} Pallets  ·  ${totalUnits} Units  ·  ${summaryWeight}`;
499:         doc.text(statsStr, PW - MR - 4, sy + 9.5, { align: 'right' });
500: 
...
508:             // Column 1: Total Payload
... (capped at 120 lines)
```

### ViewerView jsPDF (`src/features/viewer/ViewerView.tsx`, 699 lines)
```
15: import { ExportWizard } from '../../components/ExportWizard';
16: import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
17: import gsap from 'gsap';
18: import { jsPDF } from 'jspdf';
19: import toast from '../onyxIsland/notify/toast';
20: import { tr } from '../../lib/i18n';
21: 
22: declare global { interface Window { jspdf?: any; } }
23: 
24: // ── Fullscreen Image Viewer (Pinch-to-zoom & Swipe) ───────────────────────────
25: const FullscreenViewer: React.FC<{
26:     images: string[]; initialIdx: number; onClose: () => void;
```

### Packing list HTML (print) (`src/features/logistics/generatePackingListHtml.ts`, 298 lines)
```
12:                 <td style="padding: 15px 0; font-size: 10px; font-weight: 900; color: #e2e8f0; vertical-align: top;">
13:                     ${String(idx + 1).padStart(2, '0')}
14:                 </td>
...
16:                     <div style="display: inline-flex; border: 1px solid #000; border-left: 8px solid ${it.tagColor || (vendors as any)[it.vendorPrefix]?.color || '#000'}; border-radius: 6px; padding: 
17:                         ${it.itemId}
18:                     </div>
...
21:                     <div style="font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 6px;">
22:                         ${it.name}
23:                     </div>
...
25:                         <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${i
26:                         <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${i
27:                     </div>
28:                 </td>
29:                 <td style="padding: 15px 0; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; vertical-align: top;">
30:                     ${it.combinedAttr || '—'}
31:                 </td>
32:                 <td style="padding: 15px 0; font-size: 24px; font-weight: 900; text-align: right; vertical-align: top;">
33:                     ${it.qty}
34:                 </td>
...
39:             <div style="margin-bottom: 60px; page-break-inside: avoid;">
40:                 <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 15px; border-bottom: 1px solid #000; margin-bottom: 20px;">
41:                     <div style="display: flex; align-items: center; gap: 12px;">
42:                         <div style="width: 12px; height: 12px; border-radius: 50%; background: ${crateColor};"></div>
43:                         <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">${c.label}</span>
44:                         <span style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 10px;">${c.subtitle}</span>
45:                     </div>
46:                     <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
47:                         ${c.l}×${c.w}×${c.h} CM &nbsp;·&nbsp; ${(c.items?.reduce((s:number,i:any)=>s+((i.weightKg||0)*(i.qty||1)),0) || 0).toFixed(1)} KG
48:                     </div>
...
50:                 <table style="width: 100%; border-collapse: collapse;">
51:                     <thead>
52:                         <tr style="border-bottom: 2px solid #000;">
53:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 40px;">Seq</th>
54:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 140px;">Barcode ID</th>
55:                             <th style="text-align: left; padding: 10px 15px; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Description / Attributes</th>
56:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 160px;">Color & Material</th>
57:                             <th style="text-align: right; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 60px;">Qty</th>
58:                         </tr>
59:                     </thead>
...
73:     <style>
74:         * { box-sizing: border-box; }
75:         body { font-family: 'Inter', sans-serif; margin: 0; padding: 60px; background: #fff; color: #111827; line-height: 1.4; }
76:         @media print {
77:             body { padding: 0; }
78:             .no-print { display: none; }
...
85:     <div style="max-width: 1000px; margin: 0 auto;">
86: 
87:         <!-- Header -->
88:         <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 40px; margin-bottom: 40px;">
89:             <div>
90:                 <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: -0.01em;">Onyx Logistics Trailer Manifest</h1>
91:                 <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3em; margin: 0;">Digital Mirror Protocol v2.8 · Issued ${timestamp}</p>
92:             </div>
93:             <div style="text-align: right;">
94:                 <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -0.03em;">${manifestId}</div>
95:             </div>
96:         </div>
...
99:         <div style="display: grid; grid-template-cols: 1fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 60px;">
100:             <div>
101:                 <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Payload Weight</label>
102:                 <div style="font-size: 42px; font-weight: 900; letter-spacing: -0.04em;">
103:                     ${Math.round(truckStats?.totalWeight || 0).toLocaleString()} <span style="font-size: 14px; color: #cbd5e1;">KG</span>
104:                 </div>
105:                 <div style="font-size: 9px; font-weight: 900; color: #059669; text-transform: uppercase; margin-top: 5px;">${truckStats?.payloadPct || 0}% Utilization</div>
106:             </div>
107:             <div>
108:                 <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Distribution</label>
109:                 <div style="height: 6px; background: #f1f5f9; border-radius: 3px; display: flex; overflow: hidden; margin-bottom: 10px;">
110:                     <div style="flex: ${truckStats?.rPct || 1}; background: #94a3b8;"></div>
111:                     <div style="flex: ${truckStats?.mPct || 1}; background: #cbd5e1;"></div>
...
114:                 <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">
115:                     <span>Rear: ${truckStats?.rPct || 0}%</span>
116:                     <span>Front: ${truckStats?.fPct || 0}%</span>
...
121:                     <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Volume Status</label>
122:                     <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${truckStats?.statusColor || '#111827'};">${truckStats?.status || 'OPTIMAL'}</span>
123:                     <span style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-left: 4px;">${truckStats?.volPct || 0}% FILLED</span>
124:                 </div>
125:                 <div>
126:                     <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Seal Number</label>
127:                     <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.sealNumber || '—'}</span>
... (capped at 90 lines)
```

### Crates list HTML (print) (`src/features/logistics/generateCratesListHtml.ts`, 144 lines)
```
14:                 <td style="padding: 15px 0; font-size: 10px; font-weight: 900; color: #e2e8f0; vertical-align: top;">
15:                     ${String(idx + 1).padStart(2, '0')}
16:                 </td>
...
18:                     <div style="display: inline-flex; border: 1px solid #000; border-left: 8px solid ${it.tagColor || (vendors as any)[it.vendorPrefix]?.color || '#000'}; border-radius: 6px; padding: 
19:                         ${it.itemId}
20:                     </div>
...
23:                     <div style="font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 6px;">
24:                         ${it.name}
25:                     </div>
...
27:                         <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${i
28:                         <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${i
29:                     </div>
30:                 </td>
31:                 <td style="padding: 15px 0; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; vertical-align: top;">
32:                     ${it.combinedAttr || '—'}
33:                 </td>
34:                 <td style="padding: 15px 0; font-size: 24px; font-weight: 900; text-align: right; vertical-align: top;">
35:                     ${it.qty}
36:                 </td>
...
41:             <div style="margin-bottom: 60px; page-break-inside: avoid;">
42:                 <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 15px; border-bottom: 1px solid #000; margin-bottom: 20px;">
43:                     <div style="display: flex; align-items: center; gap: 12px;">
44:                         <div style="width: 12px; height: 12px; border-radius: 50%; background: ${crateColor};"></div>
45:                         <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">${c.label}</span>
46:                         <span style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 10px;">${c.subtitle}</span>
47:                     </div>
48:                     <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
49:                         ${c.l}×${c.w}×${c.h} CM &nbsp;·&nbsp; ${(c.items?.reduce((s:number,i:any)=>s+((i.weightKg||0)*(i.qty||1)),0) || 0).toFixed(1)} KG
50:                     </div>
...
52:                 <table style="width: 100%; border-collapse: collapse;">
53:                     <thead>
54:                         <tr style="border-bottom: 2px solid #000;">
55:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 40px;">Seq</th>
56:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 140px;">Barcode ID</th>
57:                             <th style="text-align: left; padding: 10px 15px; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Description / Attributes</th>
58:                             <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 160px;">Color & Material</th>
59:                             <th style="text-align: right; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 60px;">Qty</th>
60:                         </tr>
61:                     </thead>
...
75:     <style>
76:         * { box-sizing: border-box; }
77:         body { font-family: 'Inter', sans-serif; margin: 0; padding: 60px; background: #fff; color: #111827; line-height: 1.4; }
78:         @media print {
79:             body { padding: 0; }
80:             .no-print { display: none; }
...
85:     <div style="max-width: 1000px; margin: 0 auto;">
86: 
87:         <!-- Header -->
88:         <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 40px; margin-bottom: 40px;">
89:             <div>
90:                 <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: -0.01em;">Onyx Logistics Crates Manifest</h1>
91:                 <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3em; margin: 0;">Digital Mirror Protocol v2.8 · Exported ${timestamp}</p>
92:             </div>
93:             <div style="text-align: right;">
94:                 <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -0.03em;">${manifestId}</div>
95:             </div>
96:         </div>
...
99:         <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 60px;">
100:             <div>
101:                 <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Total Weight</label>
102:                 <div style="font-size: 42px; font-weight: 900; letter-spacing: -0.04em;">
103:                     ${Math.round(totalWeight).toLocaleString()} <span style="font-size: 14px; color: #cbd5e1;">KG</span>
... (capped at 70 lines)
```

### utils.tsx print and canvas helpers (`src/lib/utils.tsx`, 2420 lines)
```
512:       if (ctx) {
513:         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
514:         const data = canvas.toDataURL('image/jpeg', 0.7);
515:         video.src = '';
516:         resolve(data);
517:       } else {
518:         reject(new Error('Canvas context failed'));
519:       }
520:     };
...
795:       ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
796: 
797:       resolve(canvas.toDataURL('image/jpeg', 0.85));
798:     };
799:     img.onerror = () => {
800:       reject(new Error('Failed to load image for resizing.'));
801:     };
802:     img.src = dataUrl;
803:   });
...
849: 
850:       const mimeType = preserveAlpha ? 'image/png' : 'image/jpeg';
851:       resolve(canvas.toDataURL(mimeType, 0.92));
852:     } catch (err) {
853:       resolve(src);
854:     }
855:   });
856: }
857: 
...
975:       }
976: 
977:       resolve(canvas.toDataURL('image/jpeg', 0.92));
978:     } catch (e) {
979:       resolve(src);
980:     }
981:   });
982: }
983: 
...
1170: 
1171:             ctx.putImageData(imageData, 0, 0);
1172:             resolve(canvas.toDataURL('image/jpeg', 0.9));
1173:         };
1174:         img.src = dataUrl;
1175:     });
1176: }
1177: 
1178: export function trimTransparentCanvas(canvas: HTMLCanvasElement, padding = 4): HTMLCanvasElement {
...
1352: 
1353:         const trimmed = trimTransparentCanvas(canvas, 4);
1354:         resolve(trimmed.toDataURL('image/png'));
1355:     });
1356: }
1357: 
1358: export const readFileAsDataURL = (file: File, type: 'image' | 'video', forAI = false) =>
1359:   new Promise<string>(async (resolve, reject) => {
1360:     if (type === 'video') {
...
1383:           const ctx = canvas.getContext('2d')!;
1384:           ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
1385:           resolve(canvas.toDataURL('image/jpeg', 0.8));
1386:         };
1387:         img.onerror = () => reject(new Error('AI Image processing failed'));
1388:       };
1389:       reader.onerror = () => reject(new Error('File reading failed'));
1390:     } else {
1391:       resolve(URL.createObjectURL(file));
...
1703:     packDate: d.pack_date || d.packDate,
... (capped at 70 lines)
```
