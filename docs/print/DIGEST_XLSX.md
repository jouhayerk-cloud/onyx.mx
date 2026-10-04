# XLSX / spreadsheet generators: digest

Script-generated, line-numbered. Worksheets, columns, headers, file names, save calls.

### Master export and other exports in the main header (`src/features/core/MainHeader.tsx`, 4551 lines)
```
1439:         try {
1440:             const workbook = new ExcelJS.Workbook();
1441:             workbook.creator = 'Onyx.mx Studio';
1442:             workbook.lastModifiedBy = 'Onyx.mx Studio';
1443:             workbook.created = new Date();
1444: 
1445:             const partialPayIds = new Set(statusSets.partialPayIds);
...
1483:             const sheetName = 'Selected Items';
1484:             const vSheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: 'FF4F46E5' } } });
1485: 
1486:             vSheet.columns = [
1487:                 { header: 'VENDOR', key: 'vendor', width: 15 },
1488:                 { header: '#', key: 'item_number', width: 8 },
1489:                 { header: 'PAY DATE', key: 'pay_date', width: 12 },
1490:                 { header: 'BOOK BARCODE', key: 'tag_id', width: 22 },
1491:                 { header: 'AQ CODE', key: 'aq_code', width: 12 },
1492:                 { header: 'LD CODE', key: 'ld_code', width: 12 },
1493:                 { header: 'DESCRIPTION', key: 'description', width: 45 },
1494:                 { header: 'COLOR + MATERIAL', key: 'color_material', width: 35 },
1495:                 { header: 'SIZES (CM)', key: 'sizes_metric', width: 20 },
1496:                 { header: 'SIZES (IN)', key: 'sizes_imperial', width: 20 },
1497:                 { header: 'WEIGHT (KG)', key: 'weight_metric', width: 15 },
1498:                 { header: 'WEIGHT (LB)', key: 'weight_imperial', width: 15 },
1499:                 { header: 'QTY', key: 'quantity', width: 8 },
1500:                 { header: 'ACQ COST $ (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
1501:                 { header: 'ACQ $ (USD)', key: 'acq_usd', width: 18, style: { numFmt: '#,##0' } },
1502:                 { header: 'TOTAL MXN', key: 'total_mxn', width: 18, style: { numFmt: '#,##0' } },
1503:                 { header: 'LANDED $ (MXN)', key: 'landed_mxn', width: 18, style: { numFmt: '#,##0' } },
1504:                 { header: 'LD $ (USD)', key: 'ld_usd', width: 18, style: { numFmt: '#,##0' } },
1505:                 { header: 'RETAIL $ (USD)', key: 'retail_usd', width: 18, style: { numFmt: '#,##0' } },
1506:                 { header: 'PAY STATUS', key: 'pay_status', width: 18 }
1507:             ];
1508: 
1509:             vSheet.getRow(1).eachCell(cell => {
1510:                 cell.font = EXCEL_STYLES.fonts.header;
1511:                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
1512:                 cell.font = { ...EXCEL_STYLES.fonts.header, color: { argb: 'FFFFFFFF' } };
1513:                 cell.alignment = { horizontal: 'center' };
1514:             });
...
1607: 
1608:             const buffer = await workbook.xlsx.writeBuffer();
1609:             const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
1610:             saveAs(new Blob([buffer]), `Onyx-mx_Selected_Items_${dateStr}.xlsx`);
1611:             toast.success(tr("Selected Items WorkBook Ready"), { icon: '📦' });
1612:         } catch (error) {
1613:             console.error('Selected export failed:', error);
1614:             toast.error(tr("Selected Items Export Failed"));
1615:         } finally {
...
1623:         try {
1624:             const workbook = new ExcelJS.Workbook();
1625:             workbook.creator = 'Onyx.mx Studio';
1626:             workbook.lastModifiedBy = 'Onyx.mx Studio';
1627:             workbook.created = new Date();
1628: 
1629:             const partialPayIds = new Set(statusSets.partialPayIds);
...
1806:             // 1. SUMMARY SHEET DASHBOARD
1807:             const summarySheet = workbook.addWorksheet('Summary');
1808:             summarySheet.columns = [
1809:                 { header: 'VENDOR / SECTION', key: 'vendor', width: 30 },
1810:                 { header: 'INV ITEMS (ACQ/PROD)', key: 'items', width: 22 },
1811:                 { header: 'TOTAL SPEND (MXN)', key: 'total_mxn', width: 22, style: { numFmt: '#,##0' } },
1812:                 { header: 'SPEND (USD - Inet Rate)', key: 'total_usd', width: 25, style: { numFmt: '#,##0' } },
1813:                 { header: 'PAID (MXN)', key: 'paid_mxn', width: 18, style: { numFmt: '#,##0' } },
1814:                 { header: 'PENDING (MXN)', key: 'pending_mxn', width: 18, style: { numFmt: '#,##0' } }
1815:             ];
1816: 
1817:             // Apply Header Styling
1818:             summarySheet.getRow(1).eachCell(cell => {
1819:                 cell.font = EXCEL_STYLES.fonts.header;
1820:                 cell.fill = EXCEL_STYLES.fills.header;
1821:                 cell.alignment = { horizontal: 'center' };
1822:             });
1823: 
...
1952:             // 2. FINANCE LEDGER SHEET
1953:             const ledgerSheet = workbook.addWorksheet('Finance Ledger');
1954:             const ledgerCols = [
1955:                 { header: 'DATE', key: 'date', width: 12 },
1956:                 { header: 'DESCRIPTION', key: 'description', width: 35 },
1957:                 { header: 'CATEGORY', key: 'category', width: 15 },
1958:                 { header: 'VENDOR', key: 'vendor', width: 10 },
1959:                 { header: 'DESTINATION', key: 'destination', width: 18 },
1960:                 { header: 'AMOUNT (MXN)', key: 'amount', width: 15, style: { numFmt: '#,##0' } },
1961:                 { header: 'FEES (MXN)', key: 'commission', width: 15, style: { numFmt: '#,##0' } },
1962:                 { header: 'TOTAL (MXN)', key: 'total', width: 15, style: { numFmt: '#,##0' } },
1963:                 { header: 'STATUS', key: 'status', width: 12 },
1964:                 { header: 'PAY DATE', key: 'pay_date', width: 12 },
1965:                 { header: 'REFERENCE', key: 'reference', width: 20 }
1966:             ];
1967:             ledgerSheet.columns = ledgerCols;
1968: 
1969:             ledgerSheet.getRow(1).eachCell(cell => {
1970:                 cell.font = EXCEL_STYLES.fonts.header;
1971:                 cell.fill = EXCEL_STYLES.fills.header;
1972:             });
1973: 
1974:             financeDocs.forEach((r, idx) => {
...
2041: 
2042:             const cratesSheet = workbook.addWorksheet('Crates & Pallets');
2043:             cratesSheet.columns = [
2044:                 { header: 'ID', key: 'id', width: 22 },
2045:                 { header: 'TYPE', key: 'type', width: 14 },
2046:                 { header: 'DIMENSIONS (WxLxH)', key: 'dims', width: 28 },
2047:                 { header: 'WEIGHT (KG)', key: 'weight', width: 15, style: { numFmt: '#,##0.00' } },
2048:                 { header: 'SUPPLIER', key: 'supplier', width: 18 },
2049:                 { header: 'PRICE (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
2050:                 { header: 'CONTENTS SUMMARY', key: 'contents', width: 60 },
2051:                 { header: 'TRK', key: 'trk', width: 18 },
2052:                 { header: 'STATUS', key: 'status', width: 15 }
2053:             ];
2054: 
2055:             cratesSheet.getRow(1).eachCell(cell => {
2056:                 cell.font = EXCEL_STYLES.fonts.header;
2057:                 cell.fill = EXCEL_STYLES.fills.header;
2058:                 cell.alignment = { horizontal: 'center', vertical: 'middle' };
2059:             });
2060: 
...
2113:                 if (prov.crates.length === 0) return;
2114:                 const pSheet = workbook.addWorksheet(prov.name, { properties: { tabColor: { argb: prov.color } } });
2115:                 pSheet.columns = [
2116:                     { header: 'ID / KEY', key: 'id', width: 25 },
2117:                     { header: 'TYPE', key: 'type', width: 14 },
2118:                     { header: 'DIMENSIONS', key: 'dims', width: 28 },
2119:                     { header: 'QTY', key: 'qty', width: 8 },
2120:                     { header: 'PRICE (MXN)', key: 'price', width: 18, style: { numFmt: '#,##0' } },
2121:                     { header: 'TOTAL (MXN)', key: 'total', width: 18, style: { numFmt: '#,##0' } },
2122:                     { header: 'STATUS', key: 'status', width: 15 },
2123:                     { header: 'TRK', key: 'trk', width: 18 },
2124:                     { header: 'CONTENTS', key: 'contents', width: 40 }
2125:                 ];
2126: 
2127:                 pSheet.getRow(1).eachCell(cell => {
2128:                     cell.font = EXCEL_STYLES.fonts.header;
2129:                     cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: prov.color } };
2130:                     cell.font = { ...EXCEL_STYLES.fonts.header, color: { argb: 'FFFFFFFF' } };
2131:                     cell.alignment = { horizontal: 'center' };
2132:                 });
...
2386: 
2387:                     const tSheet = workbook.addWorksheet(finalSheetName, { properties: { tabColor: { argb: 'FF10B981' } } });
2388:                     tSheet.columns = [
2389:                         { header: 'PAY DATE', key: 'pay_date', width: 12 },
2390:                         { header: 'BOOK BARCODE', key: 'tag_id', width: 22 },
2391:                         { header: 'AQ CODE', key: 'aq_code', width: 12 },
2392:                         { header: 'LD CODE', key: 'ld_code', width: 12 },
2393:                         { header: 'DESCRIPTION', key: 'description', width: 45 },
2394:                         { header: 'COLOR + MATERIAL', key: 'color_material', width: 35 },
2395:                         { header: 'SIZES (CM)', key: 'sizes_metric', width: 20 },
2396:                         { header: 'SIZES (IN)', key: 'sizes_imperial', width: 20 },
2397:                         { header: 'WEIGHT (KG)', key: 'weight_metric', width: 15 },
2398:                         { header: 'WEIGHT (LB)', key: 'weight_imperial', width: 15 },
2399:                         { header: 'QTY', key: 'quantity', width: 8 },
2400:                         { header: 'QTY TRK', key: 'qty_trk', width: 10 },
2401:                         { header: 'ACQ COST $ (MXN)', key: 'cost_mxn', width: 18, style: { numFmt: '#,##0' } },
2402:                         { header: 'ACQ $ (USD)', key: 'acq_usd', width: 18, style: { numFmt: '#,##0' } },
2403:                         { header: 'T SHIPPED MXN', key: 'total_shipped_mxn', width: 18, style: { numFmt: '#,##0' } },
2404:                         { header: 'LANDED $ (MXN)', key: 'landed_mxn', width: 18, style: { numFmt: '#,##0' } },
2405:                         { header: 'LD $ (USD)', key: 'ld_usd', width: 18, style: { numFmt: '#,##0' } },
2406:                         { header: 'RETAIL $ (USD)', key: 'retail_usd', width: 18, style: { numFmt: '#,##0' } },
2407:                         { header: 'PAY STATUS', key: 'pay_status', width: 18 }
2408:                     ];
2409: 
2410:                     tSheet.getRow(1).eachCell(cell => {
2411:                         cell.font = { ...EXCEL_STYLES.fonts.header, color: { argb: 'FFFFFFFF' } };
2412:                         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
2413:                         cell.alignment = { horizontal: 'center' };
2414:                     });
2415: 
...
2588: 
2589:                 const vSheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: vendorColor } } });
2590: 
2591:                 vSheet.columns = [
2592:                     { header: '#', key: 'item_number', width: 8 },
2593:                     { header: 'PAY DATE', key: 'pay_date', width: 12 },
2594:                     { header: 'BOOK BARCODE', key: 'tag_id', width: 22 },
2595:                     { header: 'AQ CODE', key: 'aq_code', width: 12 },
2596:                     { header: 'LD CODE', key: 'ld_code', width: 12 },
2597:                     { header: 'DESCRIPTION', key: 'description', width: 45 },
2598:                     { header: 'COLOR + MATERIAL', key: 'color_material', width: 35 },
2599:                     { header: 'SIZES (CM)', key: 'sizes_metric', width: 20 },
2600:                     { header: 'SIZES (IN)', key: 'sizes_imperial', width: 20 },
2601:                     { header: 'WEIGHT (KG)', key: 'weight_metric', width: 15 },
2602:                     { header: 'WEIGHT (LB)', key: 'weight_imperial', width: 15 },
... (capped at 190 lines)
```

### Trucking (`src/features/logistics/TruckingModule.tsx`, 5065 lines)
```
1822:     onGenerate: () => void;
1823:     onDownload?: (url: string, filename: string) => void;
1824:     filename?: string;
1825: }> = ({ id, title, type, desc, icon: Icon, color, prog, url, onGenerate, onDownload, filename }) => {
1826:     const isDone = prog === 100;
1827:     return (
1828:         <div className="flex items-center gap-5 p-5 rounded-3xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.06] transition-all duration-500">
1829:             <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: `${color}15`, color: color }}>
1830:                 <Icon size={28} strokeWidth={1.5} />
...
1846:                     <button
1847:                         onClick={() => onDownload ? onDownload(url, filename || `${title.replace(/\s+/g, '_')}.${type.toLowerCase()}`) : window.open(url, '_blank')}
1848:                         className="px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl"
1849:                         style={{ backgroundColor: color, color: '#fff' }}
1850:                     >
1851:                         {tr("Download")}
1852:                     </button>
...
1936:         const items = buildConsolidatedItems();
1937:         const wb = new ExcelJS.Workbook();
1938:         const ws = wb.addWorksheet('Manifesto');
1939:         ws.columns = [
1940:             { header: 'Book TAG ID', key: 'tag', width: 20 },
1941:             { header: 'Quantity', key: 'qty', width: 10 },
1942:             { header: 'Description', key: 'desc', width: 50 },
1943:             { header: 'Weight (KG)', key: 'weight', width: 15 },
1944:             { header: 'Dimensions (CM)', key: 'dims', width: 20 },
1945:             { header: 'Acq. Cost MXN', key: 'cost', width: 20 },
1946:         ];
1947:         items.forEach((item, idx) => {
1948:             setProgress(p => ({ ...p, manifesto: 5 + Math.round((idx / items.length) * 80) }));
1949:             const inv = item.inv;
1950:             const data = inv.data || {};
...
1958:         });
1959:         ws.getRow(1).font = { bold: true };
1960:         setProgress(p => ({ ...p, manifesto: 95 }));
1961:         const buffer = await wb.xlsx.writeBuffer();
1962:         const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
1963:         if (blob) {
1964:             setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
1965:             setProgress(p => ({ ...p, manifesto: 100 }));
1966:         } else {
...
2154:         setProgress(p => ({ ...p, packed: 5 }));
2155:         const wb = new ExcelJS.Workbook();
2156: 
2157:         // Filter to only ROOT containers
2158:         const rootCrates = truckCrates.filter(c => !c.parent_id);
2159: 
2160:         for (let i = 0; i < rootCrates.length; i++) {
...
2166:             while (wb.worksheets.find(s => s.name === sheetName)) sheetName = `${safeLabel.substring(0, 28)}_${counter++}`;
2167:             const ws = wb.addWorksheet(sheetName);
2168:             ws.columns = [
2169:                 { header: 'Book TAG ID', key: 'tag', width: 20 }, { header: 'Quantity', key: 'qty', width: 10 },
2170:                 { header: 'Description', key: 'desc', width: 40 }, { header: 'Weight (KG)', key: 'weight', width: 15 },
2171:                 { header: 'Dimensions (CM)', key: 'dims', width: 20 },
2172:                 { header: 'Container', key: 'container', width: 25 }
2173:             ];
2174:             getItemsFromCrate(crate).forEach((item: any) => {
2175:                 const inv = item.inv; const data = inv.data || {};
2176:                 const norm = normalizeInventoryData(inv);
2177:                 const calculated = calculateCodesAndPrices(norm, bookRate, '326');
...
2189:             });
2190:             ws.getRow(1).font = { bold: true };
2191:         }
2192:         setProgress(p => ({ ...p, packed: 95 }));
2193:         const buffer = await wb.xlsx.writeBuffer();
2194:         const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
2195:         if (blob) {
2196:             setUrls(u => ({ ...u, packed: URL.createObjectURL(blob) }));
2197:             setProgress(p => ({ ...p, packed: 100 }));
2198:         } else {
...
2203: 
2204:     const triggerDownload = (url: string, filename: string) => {
2205:         const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
2206:     };
2207: 
2208:     return (
2209:         <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
2210:             <div className="absolute inset-0 bg-white/[0.05] backdrop-blur-2xl" />
...
2246:                             desc="Global inventory list with all items combined. Best for accounting."
2247:                             prog={progress.manifesto} url={urls.manifesto} onGenerate={generateManifesto} onDownload={triggerDownload} filename={`${name}_Consolidated_Manifesto.xlsx`}
2248:                         />
2249:                         <ExportCard
2250:                             id="pdf" title={tr("Trailer Packing List")} type="PDF" color="#ef4444" icon={FileText}
2251:                             desc="Summary of trailer load with isometric and top views."
2252:                             prog={progress.pdf} url={urls.pdf} onGenerate={generatePdf} onDownload={triggerDownload} filename={`${name}_Packing_List.pdf`}
2253:                         />
2254:                         <ExportCard
2255:                             id="packed" title={tr("Crate Spreadsheets")} type="XLSX" color="#10b981" icon={FileSpreadsheet}
2256:                             desc="One Excel sheet per crate. Detailed per-box breakdown."
2257:                             prog={progress.packed} url={urls.packed} onGenerate={generatePacked} onDownload={triggerDownload} filename={`${name}_Crate_Spreadsheets.xlsx`}
2258:                         />
2259:                         <div className="h-px bg-white/5 my-2" />
2260:                         <ExportCard
2261:                             id="allCrates" title={tr("All Crates Manifesto")} type="PDF" color="#f97316" icon={FileText}
2262:                             desc="Combined PDF of all individual crate manifestos. (No photos)."
2263:                             prog={progress.allCrates} url={urls.allCrates} onGenerate={() => generateAllManifestos(false)} onDownload={triggerDownload} filename={`${name}_All_Crates_Manifesto.pdf`}
2264:                         />
2265:                         <ExportCard
2266:                             id="allCratesImages" title={tr("Visual Manifesto")} type="PDF" color="#f43f5e" icon={ImageIcon}
2267:                             desc="High-fidelity visual verification with multi-row item photos."
2268:                             prog={progress.allCratesImages} url={urls.allCratesImages} onGenerate={() => generateAllManifestos(true)} onDownload={triggerDownload} filename={`${name}_Visual_Manifesto.p
2269:                         />
2270:                     </div>
2271:                 </div>
2272: 
2273:                 {/* Status Footer */}
...
2670:         try {
2671:             const wb = new ExcelJS.Workbook();
2672:             const ws = wb.addWorksheet('Trailer Packing List');
2673: 
2674:             // Header Styling
2675:             const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } }; // Orange
... (capped at 120 lines)
```

### Packing (`src/features/logistics/PackingModule.tsx`, 1427 lines)
```
202:             setProgress((p: any) => ({ ...p, xlsx: 50 }));
203:             const wb = new ExcelJS.Workbook();
204:             const ws = wb.addWorksheet('Packing List');
205: 
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
...
272: 
273:     const triggerDownload = (url: string, filename: string) => {
274:         const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
275:     };
276: 
277:     if (!isOpen) return null;
278: 
279:     return (
...
326:                         <div className="flex-1 min-w-0">
327:                             <span className="block text-sm font-black text-white uppercase tracking-tight">{tr("inventory.xlsx")}</span>
328:                             <span className="block text-[9px] text-white/30 uppercase font-bold tracking-widest mt-0.5">{tr("Master spreadsheet (Legacy)")}</span>
329:                             {progress.xlsx >= 0 && (
330:                                 <div className="mt-3 h-1 w-full bg-white/5 rounded-full overflow-hidden">
331:                                     <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress.xlsx}%` }} />
332:                                 </div>
333:                             )}
334:                         </div>
335:                         {progress.xlsx === 100 ? (
336:                             <button onClick={() => triggerDownload(urls.xlsx, `${name}.xlsx`)} className="px-4 py-2 bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-wides
337:                         ) : (
338:                             <button onClick={handleGenerateXLSX} disabled={progress.xlsx >= 0} className="px-4 py-2 bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 rounded-xl text-[10px] 
339:                                 {progress.xlsx >= 0 ? tr("Building...") : tr("Generate")}
340:                             </button>
341:                         )}
342:                     </div>
343: 
344:                     {/* PDF Option */}
...
571:         setIsExportingXLSX(true);
572:         const tid = toast.loading(tr("Building XLSX..."));
573:         try {
574:             const rows = selectedItems.map(item => {
575:                 const d = item.normData;
576:                 const c = item.codes;
577:                 const desc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
```

### Export crates wizard (`src/features/logistics/ExportCratesWizard.tsx`, 397 lines)
```
26:     onGenerate: () => void;
27:     onDownload?: (url: string, filename: string) => void;
28:     filename?: string;
29: }> = ({ id, title, type, desc, icon: Icon, color, prog, url, onGenerate, onDownload, filename }) => {
30:     const isDone = prog === 100;
31:     return (
32:         <div className="flex items-center gap-5 p-5 rounded-3xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.06] transition-all duration-500">
33:             <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: `${color}15`, color: color }}>
34:                 <Icon size={28} strokeWidth={1.5} />
...
55:                 ) : (
56:                     <button onClick={() => onDownload ? onDownload(url, filename || 'export') : window.open(url)} className="px-4 py-2 rounded-xl text-black font-black uppercase tracking-widest text-[
57:                         {tr("Download")}
58:                     </button>
59:                 )}
60:             </div>
61:         </div>
...
111:         try {
112:             const wb = new ExcelJS.Workbook();
113:             const ws = wb.addWorksheet('Master Packing List');
114: 
115:             const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
116:             const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
117:             const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };
118: 
...
137: 
138:             ws.columns = [
139:                 { key: 'crate', width: 25 },
140:                 { key: 'tag', width: 22 },
141:                 { key: 'qty', width: 8 },
142:                 { key: 'desc', width: 50 },
143:                 { key: 'dims', width: 22 },
144:                 { key: 'weight', width: 12 },
145:                 { key: 'box', width: 25 }
146:             ];
147: 
148:             selectedCrates.forEach((crate, cIdx) => {
149:                 const { label } = getCrateDisplayName(crate, allCrates, allInventory);
150: 
...
179:             setProgress(p => ({ ...p, xlsx: 90 }));
180:             const buffer = await wb.xlsx.writeBuffer();
181:             const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
182:             setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
183:             setProgress(p => ({ ...p, xlsx: 100 }));
184:             toast.success(tr("Packing List Ready"), { id: tid });
185:         } catch (err: any) {
...
325: 
326:     const triggerDownload = (url: string, filename: string) => { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); };
327: 
328:     return (
329:         <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
330:             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
331:             <div className="relative z-10 w-full max-w-2xl rounded-[2.5rem] border border-white/10 p-8 flex flex-col gap-6 shadow-2xl bg-[#0c0c12] max-h-[90vh] overflow-y-auto custom-scrollbar animate
...
386:                         <label className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-1">{tr("Documentation Engine")}</label>
387:                         <ExportCard id="html" title={tr("Interactive HTML Manifest")} type="HTML" color="#3b82f6" icon={Globe} prog={progress.html} url={urls.html} onGenerate={generateHtml} onDownload
388:                         <ExportCard id="xlsx" title={tr("Master Packing List")} type="XLSX" color="#10b981" icon={FileSpreadsheet} prog={progress.xlsx} url={urls.xlsx} onGenerate={generatePackingListX
389:                         <ExportCard id="allCrates" title={tr("All Crates Manifesto")} type="PDF" color="#f97316" icon={FileText} prog={progress.allCrates} url={urls.allCrates} onGenerate={generateAllM
390:                     </div>
391:                 </div>
392: 
393:             </div>
394:         </div>
```

### Batch processing wizard (`src/features/inventory/BatchProcessingWizard.tsx`, 1481 lines)
```
440: async function buildXlsx(entries: readonly ExportEntry[]): Promise<Blob> {
441:     const workbook = new ExcelJS.Workbook();
442:     workbook.creator = 'Onyx Dashboard';
443:     const sheet = workbook.addWorksheet('Shopify Export');
444:     sheet.addRow(sanitizeExcelRow(XLSX_HEADERS));
445:     sheet.getRow(1).font = { bold: true };
446: 
447:     for (const { itemData, category, vendorName, tagId, text, allMasks, overrideNormData } of entries) {
448:         const norm = overrideNormData || normalizeInventoryData(itemData);
449:         const bookPrefix = norm.workbook || itemData.workbook || '326';
450:         const calc = calculateCodesAndPrices(norm, DEFAULT_EXCHANGE_RATE, bookPrefix);
...
525: 
526:     const buffer = await workbook.xlsx.writeBuffer();
527:     return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
528: }
529: 
530: // ─────────────────────────────────────────────────────────────────────────────
531: // Screen
...
942:         setMakingXlsx(true);
943:         const toastId = toast.loading(tr('Generating Shopify XLSX...'));
944:         try {
945:             const { exportDataList } = buildExportContext(all);
946:             const url = URL.createObjectURL(await buildXlsx(exportDataList));
947:             urlsRef.current.push(url);
948:             setXlsxUrl(url);
...
1351:                             fold
1352:                             header={['', tr('Item'), tr('Photos · output'), tr('Generated title'), tr('Steps'), tr('State')]}
1353:                             empty={all.length ? tr('No item matches this filter.') : tr('No items selected.')}
1354:                             className="hub-list"
1355:                         >
1356:                             {visible.map(it => {
1357:                                 const s = states.get(it.id)!;
...
1422:                         {xlsxUrl
1423:                             ? <a className="ui-key ui-key--sm" href={xlsxUrl} download={`Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx`}>
1424:                                 <FileSpreadsheet size={12} aria-hidden="true" />{tr('Download XLSX')}
1425:                             </a>
1426:                             : <Key size="sm" icon={<FileSpreadsheet size={12} />} busy={makingXlsx} disabled={!!exportBlock}
1427:                                 title={exportBlock || tr('Matrixify sheet of the saved items')} onClick={handleXlsx}>
1428:                                 {tr('Generate XLSX')}
```

### Batch sheet import/export (`src/features/upload/batchSheet.ts`, 285 lines)
```
65: /** Lower case, accents folded, inner spaces collapsed: 'Descripción ' -> 'descripcion'. */
66: export function foldHeader(header: unknown): string {
67:     return String(header ?? '')
68:         .normalize('NFD')
69:         .replace(/[̀-ͯ]/g, '')
70:         .toLowerCase()
71:         .replace(/\s+/g, ' ')
...
75: /** The row field a header maps to, or undefined. Tries the header as is, without a bracketed unit, then without punctuation. */
76: export function mapHeader(header: unknown): string | undefined {
77:     const f = foldHeader(header);
78:     if (!f) return undefined;
79:     const tries = [
80:         f,
81:         f.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(),
...
163: export function parseSheet(data: ArrayBuffer, vendor: string): SheetParse {
164:     let book: XLSX.WorkBook;
165:     try {
166:         book = XLSX.read(new Uint8Array(data), { type: 'array' });
167:     } catch {
168:         throw new SheetError('unreadable');
169:     }
170:     const want = String(vendor || '').trim().toUpperCase();
171:     const named = want ? book.SheetNames.find(n => n.trim().toUpperCase() === want) : undefined;
...
174:     if (!sheet) throw new SheetError('no_rows');
175:     const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
176:     if (rawRows.length < 2) throw new SheetError('no_rows');
177: 
178:     const fieldMap: Record<number, string> = {};
179:     const unmapped: string[] = [];
180:     (rawRows[0] || []).forEach((h: unknown, i: number) => {
```

### Catalog hub pipeline (`src/lib/catalogHubPipeline.ts`, 974 lines)
```
128: 
129: export const buildDonorPool = (fullInventory: any[]): DonorCandidate[] =>
130:     (fullInventory || []).map((it: any) => {
131:         const n = normalizeInventoryData(it.data || it);
132:         return {
133:             id: String(it.id || it.row || ''),
...
265:  */
266: export function letterboxToUnit(origW: number, origH: number) {
267:     const targetSize = 1024;
268:     const available = targetSize * 0.8;
269:     let drawW = available, drawH = available;
270:     if (origW > origH) drawH = Math.round(available * (origH / origW));
...
299: 
300: export const processSingleItem = async (op: BatchOp, ctx: PipelineContext) => {
301:     const { updateOp, logOp, checkAbort, user, bgQuality, cancelTokens, setHasUnsavedChanges, setQueue } = ctx;
302:     if (cancelTokens.current[op.id]) return;
303: 
304:     const item = toPipelineItem(op.item);
...
847: 
848: export const processVariationItem = async (op: BatchOp, donors: DonorCandidate[], ctx: PipelineContext) => {
849:     const { updateOp, logOp, user, cancelTokens, setHasUnsavedChanges } = ctx;
850:     if (cancelTokens.current[op.id]) return;
851:     updateOp(op.id, { status: 'processing', progress: 15, stepLabel: 'Finding a similar item' });
852: 
```

### Archive panel csv (`src/features/archive/ArchivePanel.tsx`, 396 lines)
```
14: 
15: // CSV cell: double the quotes, and defuse spreadsheet formulas (a leading = + - @ tab or CR makes Excel run the cell)
16: const csvCell = (v: unknown): string => {
17:   const t = String(v ?? '').replace(/"/g, '""');
18:   return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t) + '"';
19: };
20: 
21: export const ArchivePanel: React.FC<{ fallback: React.ReactNode }> = ({ fallback }) => {
22:   const {
...
61: 
62:   const handleExportCSV = () => {
63:     let csv = '';
64:     const headers = ['VND', 'TAG ID', 'Item Number', 'Date', 'Description', 'Qty', 'Wt.', 'Dimensions'];
65:     if (isFinanceRole) {
66:       headers.push('Price MXN', 'Total Pesos', 'AQ', 'LND', 'Retail', 'Total USD', 'AQC', 'LC', 'SQM Price', 'AQ Round', 'LND Round', 'Desc Price');
67:     }
68:     csv += headers.map(h => `"${h}"`).join(',') + '\n';
69: 
70:     items.forEach(item => {
71:       const row = [
72:         item.vendor,
73:         item.tag_id || '',
74:         item.item_number || '',
...
102:       }
103: 
104:       csv += row.map(csvCell).join(',') + '\n';
105:     });
106: 
107:     const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
108:     const url = URL.createObjectURL(blob);
109:     const link = document.createElement('a');
110:     link.href = url;
111:     link.setAttribute('download', `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page}.csv`);
112:     document.body.appendChild(link);
113:     link.click();
114:     document.body.removeChild(link);
115:   };
116: 
117:   const pyClass = density === 'compact' ? 'py-1' : 'py-3';
```

### xlsx helpers (`src/lib/xlsxUtils.tsx`, 209 lines)
```
6:  * Sanitizes an individual cell value for Excel / OpenXML / ExcelJS export.
7:  * Strips out illegal XML 1.0 control characters (ASCII 0x00-0x08, 0x0B-0x0C, 0x0E-0x1F, 0x7F-0x9F, \uFFFD)
8:  * and zero-width/formatting characters that trigger Excel's "sharedStrings.xml" corruption/repair errors,
9:  * and enforces the 32,767 cell char limit.
...
11: export const sanitizeExcelValue = (val: any): any => {
12:     if (val === null || val === undefined) return '';
13:     if (typeof val === 'number' || typeof val === 'boolean') return val;
14:     let str = String(val);
...
23:  * Sanitizes an entire row array or row object for Excel / OpenXML export.
24:  */
25: export const sanitizeExcelRow = (row: any): any => {
26:     if (!row) return row;
27:     if (Array.isArray(row)) {
28:         return row.map(sanitizeExcelValue);
...
40: const escapeXml = (str: string) => {
41:     const clean = sanitizeExcelValue(str);
42:     return String(clean).replace(/[<>&'"]/g, (c) => {
43:         switch (c) {
...
54: const createSheetXml = (data: any[][], styleMap: Map<string, number>): string => {
55:     const rowsXml = data.map((row, rowIndex) => {
56:         if (!row || row.length === 0) {
57:             return `<row r="${rowIndex + 1}"/>`;
...
90: const createWorkbookXml = (sheetName: string): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
91: <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
92:   <sheets>
93:     <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
...
97: const createWorkbookRelsXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
98: <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
99:   <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
100:   <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
...
103: const createContentTypesXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
104: <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
105:   <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
106:   <Default Extension="xml" ContentType="application/xml"/>
...
112: const createRootRelsXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
113: <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
114:   <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
115: </Relationships>`;
...
117: const createStylesXml = (styles: { [key: string]: {bgColor?: string, bold?: boolean, textColor?: string} } = {}): { styleSheet: string, styleMap: Map<string, number> } => {
118:     const fonts = [
119:         '<font><sz val="11"/><name val="Calibri"/></font>', // Font 0: Normal
120:         '<font><b/><sz val="11"/><name val="Calibri"/></font>', // Font 1: Bold
...
170: export const exportToXLSX = async (
171:     fileName: string,
172:     sheets: { name: string, data: any[][] }[],
173:     styles: { [key: string]: {bgColor?: string, bold?: boolean, textColor?: string} } = {},
```

### excel styles (`src/lib/excelStyles.ts`, 60 lines)
```
4: export const EXCEL_STYLES = {
5:     fonts: {
6:         header: { name: 'Arial', family: 2, size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
...
16: export const getStatusColor = (status: string): string => {
17:     const s = (status || '').toLowerCase().trim();
18:     if (s === 'paid') return 'FF22C55E';
...
24: export const getCategoryColor = (cat: string): string => {
25:     const c = (cat || '').toLowerCase().trim();
26:     if (c.includes('acq')) return 'FF10B981';
...
36: export const getVendorColor = (tagId: string): string => {
37:     const id = (tagId || '').toUpperCase();
38: 
...
51: export const getContrastColor = (argb: string): string => {
52:     // Expects FFRRGGBB
53:     if (!argb || argb.length < 8) return 'FF000000';
```
