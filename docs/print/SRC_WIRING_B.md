# Wiring extracts B: trucking, crates wizard and packing module exports and label print

Script-extracted, verbatim, with source line numbers. Only the parts needed to wrap each export with job tracking.

## generateManifesto (src/features/logistics/TruckingModule.tsx, lines 1935-1947, 13 lines)

### head
```tsx
1935:     const generateManifesto = async () => {
1936:         setProgress(p => ({ ...p, manifesto: 5 }));
1937:         const items = buildConsolidatedItems();
1938:         const blob = await generateConsolidatedManifestoXlsx(items, bookRate);
1939:         setProgress(p => ({ ...p, manifesto: 95 }));
1940:         if (blob) {
1941:             setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
1942:             setProgress(p => ({ ...p, manifesto: 100 }));
1943:         } else {
1944:             setProgress(p => ({ ...p, manifesto: -1 }));
1945:             toast.error(tr("Failed to generate Excel file"));
1946:         }
1947:     };
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```

## generatePacked (src/features/logistics/TruckingModule.tsx, lines 2130-2142, 13 lines)

### head
```tsx
2130:     const generatePacked = async () => {
2131:         setProgress(p => ({ ...p, packed: 5 }));
2132:         const rootCrates = truckCrates.filter(c => !c.parent_id);
2133:         const blob = await generateCrateSpreadsheetsXlsx(rootCrates, allCrates, allInventory, bookRate, getItemsFromCrate);
2134:         setProgress(p => ({ ...p, packed: 95 }));
2135:         if (blob) {
2136:             setUrls(u => ({ ...u, packed: URL.createObjectURL(blob) }));
2137:             setProgress(p => ({ ...p, packed: 100 }));
2138:         } else {
2139:             setProgress(p => ({ ...p, packed: -1 }));
2140:             toast.error(tr("Failed to generate Excel files"));
2141:         }
2142:     };
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```

## generatePackingListXlsx (src/features/logistics/TruckingModule.tsx, lines 2607-2719, 113 lines)

### head
```tsx
2607:     const generatePackingListXlsx = async () => {
2608:         const tid = toast.loading(tr("Generating XLSX Packing List..."));
2609:         setProgress(p => ({ ...p, xlsx: 5 }));
2610:         try {
2611:             const wb = new ExcelJS.Workbook();
2612:             const ws = wb.addWorksheet('Trailer Packing List');
2613: 
2614:             // Header Styling
2615:             const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } }; // Orange
2616:             const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light Gray
2617:             const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };
2618: 
2619:             // 1. Shipment Info
2620:             ws.addRow(['ONYX LOGISTICS · TRAILER PACKING LIST']);
2621:             ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
2622:             ws.addRow([`Exported At: ${new Date().toLocaleString()}`]);
2623:             ws.addRow([]);
2624: 
2625:             ws.addRow(['SHIPMENT METADATA']);
2626:             ws.getRow(4).font = { bold: true };
2627:             ws.addRow(['Seal #', fields.sealNumber || 'N/A']);
2628:             ws.addRow(['Tractor #', fields.tractorNumber || 'N/A']);
2629:             ws.addRow(['Truck Plates', fields.truckPlates || 'N/A']);
2630:             ws.addRow(['Trailer #', fields.trailerNumber || 'N/A']);
2631:             ws.addRow(['Trailer Plates', fields.trailerPlates || 'N/A']);
2632:             ws.addRow(['Senders', (fields.senders || []).join(', ') || 'N/A']);
2633:             ws.addRow([]);
2634: 
2635:             // 2. Item List Header
2636:             const startRow = ws.rowCount + 1;
2637:             ws.addRow(['Crate / Unit', 'Book TAG ID', 'Qty', 'Description', 'Dimensions (CM)', 'Weight (KG)', 'Sub-Container']);
2638:             const headerRow = ws.getRow(startRow);
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
2684:                 });
2685:             });
2686: 
2687:             // 4. Packing Items (Cardboard boxes)
2688:             if (fields.packingItems && fields.packingItems.length > 0) {
2689:                 ws.addRow([]);
2690:                 const pRow = ws.addRow(['EXTERNAL PACKING & CARDBOARD UNITS']);
2691:                 ws.mergeCells(pRow.number, 1, pRow.number, 7);
2692:                 pRow.font = { bold: true };
2693:                 pRow.getCell(1).fill = sectionFill;
2694: 
2695:                 fields.packingItems.forEach((p: any) => {
2696:                     ws.addRow({
2697:                         crate: 'PACKING',
2698:                         tag: 'BOX',
2699:                         qty: p.count,
2700:                         desc: p.name || 'Packing Unit',
2701:                         dims: 'N/A',
2702:                         weight: p.weight || 0,
2703:                         box: ''
2704:                     });
2705:                 });
2706:             }
2707: 
2708:             setProgress(p => ({ ...p, xlsx: 90 }));
2709:             const buffer = await wb.xlsx.writeBuffer();
2710:             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
2711:             setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
2712:             setProgress(p => ({ ...p, xlsx: 100 }));
2713:             toast.success(tr("Packing List Ready"), { id: tid });
2714:         } catch (err: any) {
2715:             console.error('[TruckExport] XLSX Error:', err);
2716:             setProgress(p => ({ ...p, xlsx: -1 }));
2717:             toast.error(tr("Failed to generate XLSX"), { id: tid });
2718:         }
2719:     };
```

## trailer manifest HTML call (src/features/logistics/TruckingModule.tsx, around line 2842)
```tsx
2824:                         y: pos.z || 0, // Height
2825:                         z: pos.y,      // Width/Depth
2826:                         w: c.width_cm,
2827:                         l: c.length_cm,
2828:                         h: c.height_cm || 100,
2829:                         r: pos.r || 0,
2830:                         color: crateColor,
2831:                         vendorList,
2832:                         items
2833:                     };
2834:                 }),
2835:                 truckStats: {
2836:                     ...panelStats,
2837:                     totalWeight: finalTotalWeight,
2838:                     payloadPct: Math.round((finalTotalWeight / 22000) * 100)
2839:                 },
2840:                 timestamp: new Date().toLocaleString()
2841:             };
2842:             const htmlContent = generatePackingListHtml(manifestId, fields, shipmentPayload);
2843:             const blob = new Blob([htmlContent], { type: 'text/html' });
2844:             if (blob) { 
2845:                 setUrls(u => ({ ...u, html: URL.createObjectURL(blob) })); 
2846:                 setProgress(p => ({ ...p, html: 100 })); 
2847:             }
2848:         } catch (err: any) { 
2849:             setProgress(p => ({ ...p, html: -1 })); 
2850:             toast.error(tr("HTML Generation failed")); 
2851:         }
2852:     };
2853: 
2854:     const triggerDownload = (url: string, filename: string) => { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); };
2855: 
2856:     return (
2857:         <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
2858:             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
2859:             <div className="relative z-10 w-full max-w-4xl rounded-[2.5rem] border border-white/10 p-8 flex flex-col gap-6 shadow-2xl bg-[#0c0c12] max-h-[95vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
```

## trailer manifest HTML call (src/features/logistics/TruckingModule.tsx, around line 4124)
```tsx
4106:             if (!isDummyMode) {
4107:                 const { error: shipError } = await supabase.from('shipments').insert({
4108:                     manifest_id: manifestId,
4109:                     metadata: f,
4110:                     payload: shipmentPayload,
4111:                     timestamp: dispatchTs,
4112:                     updated_at: new Date().toISOString()
4113:                 });
4114:                 if (shipError) {
4115:                     console.error('[Shipment] Save Error:', shipError);
4116:                     throw shipError;
4117:                 }
4118:                 console.log('[Shipment] Successfully saved to cloud.');
4119:             } else {
4120:                 console.warn('[Shipment] Dummy mode active, skipping cloud save.');
4121:             }
4122: 
4123:             // 4. Generate HTML Manifesto
4124:             const htmlContent = generatePackingListHtml(manifestId, f, shipmentPayload);
4125:             const blob = new Blob([htmlContent], { type: 'text/html' });
4126:             const htmlUrl = URL.createObjectURL(blob);
4127:             const a = document.createElement('a');
4128:             a.href = htmlUrl;
4129:             a.download = `Manifesto_${manifestId}.html`;
4130:             a.click();
4131: 
4132:             const shareUrl = `${window.location.origin}${window.location.pathname}?truckid=${manifestId}`;
4133:             setPublicUrl(shareUrl);
4134: 
4135:             notify.success(`Shipment ${manifestId} synchronized`, { id: tid, icon: '🚚', duration: 10000 });
4136:             // Wizard stays open to show the public link
4137:         } catch (err: any) { 
4138:             notify.error(err.message || 'Synchronization failed', { id: tid }); 
4139:         } finally { 
4140:             setIsSaving(false); 
4141:         }
```

## generatePackingListXlsx (crates wizard) (src/features/logistics/ExportCratesWizard.tsx, lines 108-121, 14 lines)

### head
```tsx
108:     const generatePackingListXlsx = async () => {
109:         const tid = toast.loading(tr("Generating XLSX Packing List..."));
110:         setProgress(p => ({ ...p, xlsx: 5 }));
111:         try {
112:             const blob = await generateMasterPackingListXlsx(selectedCrates, allCrates, allInventory, bookRate, fields, getItemsFromCrate);
113:             setProgress(p => ({ ...p, xlsx: 90 }));
114:             setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
115:             setProgress(p => ({ ...p, xlsx: 100 }));
116:             toast.success(tr("Packing List Ready"), { id: tid });
117:         } catch (err: any) {
118:             setProgress(p => ({ ...p, xlsx: -1 }));
119:             toast.error(tr("Failed to generate XLSX"), { id: tid });
120:         }
121:     };
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```

## crates manifest HTML call (src/features/logistics/ExportCratesWizard.tsx, around line 246)
```tsx
228:                             combinedAttr: `${data.color || ''} ${data.material ? '/ ' + data.material : ''}`.trim()
229:                         };
230:                     });
231:                     
232:                     return {
233:                         id: c.id, label, subtitle,
234:                         x: 0, y: 0, z: 0, r: 0,
235:                         w: c.width_cm, l: c.length_cm, h: c.height_cm || 100,
236:                         color: crateColor, vendorList, items
237:                     };
238:                 }),
239:                 truckStats: {
240:                     totalWeight: totalWeight,
241:                     payloadPct: Math.round((totalWeight / 22000) * 100),
242:                     status: 'EXPORT', rPct: 33, mPct: 34, fPct: 33
243:                 },
244:                 timestamp: new Date().toLocaleString()
245:             };
246:             const htmlContent = generateCratesListHtml(manifestId, fields, shipmentPayload);
247:             const blob = new Blob([htmlContent], { type: 'text/html' });
248:             if (blob) { 
249:                 setUrls(u => ({ ...u, html: URL.createObjectURL(blob) })); 
250:                 setProgress(p => ({ ...p, html: 100 })); 
251:             }
252:         } catch (err: any) { 
253:             setProgress(p => ({ ...p, html: -1 })); 
254:             toast.error(tr("HTML Generation failed")); 
255:         }
256:     };
257: 
258:     const triggerDownload = (url: string, filename: string) => { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); };
259: 
260:     return (
261:         <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
262:             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
263:             <div className="relative z-10 w-full max-w-2xl rounded-[2.5rem] border border-white/10 p-8 flex flex-col gap-6 shadow-2xl bg-[#0c0c12] max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
```

## handleGenerateXLSX (src/features/logistics/PackingModule.tsx, lines 174-222, 49 lines)

### head
```tsx
174:     const handleGenerateXLSX = async () => {
175:         setProgress((p: any) => ({ ...p, xlsx: 10 }));
176:         try {
177:             const data = items.map((item: any) => {
178:                 const d = item.normData;
179:                 const c = item.codes;
180:                 
181:                 const desc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
182:                 const matColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
183:                 const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
184:                 const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
185:                 const retailStr = String(c.bookRetail || '0').padStart(4, '0');
186:                 const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
187:                 const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
188:                 
189:                 return [
190:                     c.bookBarcode, 
191:                     desc, 
192:                     matColor, 
193:                     sizes, 
194:                     d.quantity || 1, 
195:                     c.bookLandCode || '', 
196:                     c.bookAqCode || '', 
197:                     bookRetailTag, 
198:                     qrUrl
199:                 ];
200:             });
201:             
202:             setProgress((p: any) => ({ ...p, xlsx: 50 }));
203:             const wb = new ExcelJS.Workbook();
204:             const ws = wb.addWorksheet('Packing List');
205:             
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
206:             const headers = ['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'];
207:             ws.addRow(headers);
208:             data.forEach((r: any) => ws.addRow(r));
209:             
210:             ws.getRow(1).font = { bold: true };
211:             ws.columns = headers.map(() => ({ width: 22 }));
212: 
213:             const buffer = await wb.xlsx.writeBuffer();
214:             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
215:             setUrls((u: any) => ({ ...u, xlsx: URL.createObjectURL(blob) }));
216:             setProgress((p: any) => ({ ...p, xlsx: 100 }));
217:         } catch (e) {
218:             console.error(e);
219:             setProgress((p: any) => ({ ...p, xlsx: -1 }));
220:             toast.error(tr("XLSX Generation Failed"));
221:         }
222:     };
```

## handleExportXLSX (src/features/logistics/PackingModule.tsx, lines 569-597, 29 lines)

### head
```tsx
569:     const handleExportXLSX = async () => {
570:         if (isExportingXLSX || selectedIds.size === 0) return;
571:         setIsExportingXLSX(true);
572:         const tid = toast.loading(tr("Building XLSX..."));
573:         try {
574:             const rows = selectedItems.map(item => {
575:                 const d = item.normData;
576:                 const c = item.codes;
577:                 const desc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
578:                 const matColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
579:                 const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
580:                 const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
581:                 const retailStr = String(c.bookRetail || '0').padStart(4, '0');
582:                 const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
583:                 const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
584:                 return [c.bookBarcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
585:             });
586: 
587:             await exportToXLSX(`Packing_List_${new Date().toISOString().split('T')[0]}`, [{
588:                 name: 'Packing List',
589:                 data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
590:             }]);
591:             toast.success(tr("XLSX exported"), { id: tid });
592:         } catch (error: any) {
593:             toast.error(`XLSX failed: ${error.message}`, { id: tid });
594:         } finally {
595:             setIsExportingXLSX(false);
596:         }
597:     };
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```

## handlePrintLabels (src/features/logistics/PackingModule.tsx, lines 690-718, 29 lines)

### head
```tsx
690:     const handlePrintLabels = async () => {
691:         if (selectedIds.size === 0) return toast.error(tr("Select items first"));
692:         
693:         const timestamp = new Date().toISOString();
694:         const ids = Array.from(selectedIds);
695:         setLastPrintedIds(ids);
696: 
697:         const tid = toast.loading(tr("Initializing Multi-Step Print Wizard..."));
698:         try {
699:             // STEP 1: Generate XLSX (tracks filePrintDate)
700:             await handleExportXLSX();
701:             
702:             // STEP 2: Build JSON Project (Multiplier = 2)
703:             const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 2);
704:             try {
705:                 localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
706:             } catch (storageError) {
707:                 console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
708:             }
709:             pendingBatchRef.current = batchProject; // stash for postMessage after DESIGNER_READY
710:             
711:             // STEP 3: Open Overlay PREVIEW
712:             setShowPreviewOverlay(true);
713:             
714:             toast.success(tr("Wizard Step 1 Complete: XLSX generated. Step 2: Verification Ready."), { id: tid });
715:         } catch (e: any) {
716:             toast.error(`Wizard Failed: ${e.message}`, { id: tid });
717:         }
718:     };
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```
