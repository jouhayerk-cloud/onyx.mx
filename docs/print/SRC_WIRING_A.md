# Wiring extracts A: MainHeader workbook exports, archive CSV, catalogue PDF, crate manifesto PDFs

Script-extracted, verbatim, with source line numbers. Only the parts needed to wrap each export with job tracking.

## handleExportSelectedXLSX (src/features/core/MainHeader.tsx, lines 1449-1634, 186 lines)

### head
```tsx
1449:     const handleExportSelectedXLSX = async () => {
1450:         if (selectedIds.length === 0) {
1451:             toast.error(tr("No items selected"));
1452:             return;
1453:         }
1454:         setIsExporting(true);
1455:         try {
1456:             const workbook = new ExcelJS.Workbook();
1457:             workbook.creator = 'Onyx.mx Studio';
1458:             workbook.lastModifiedBy = 'Onyx.mx Studio';
1459:             workbook.created = new Date();
1460: 
1461:             const partialPayIds = new Set(statusSets.partialPayIds);
1462:             const fullPayIds = new Set(statusSets.fullPayIds);
1463:             const requestedAcqIds = new Set(statusSets.requestedAcqIds);
1464:             const paymentDateMap = new Map<string, string>();
1465:             const paidMap = new Map<string, number>();
1466:             const requestedMap = new Map<string, number>();
1467: 
1468:             financeDocs.forEach(d => {
1469:                 const rel = d.related_ids || d.related_inventory_ids || '';
1470:                 let ids: string[] = [];
1471:                 if (Array.isArray(rel)) ids = rel.map((id: any) => String(id));
1472:                 else if (typeof rel === 'string') ids = rel.split(',').map(s => s.trim()).filter(Boolean);
1473:                 const amount = Number(d.amount || 0);
1474:                 if (amount <= 0) return;
1475:                 if (d.status === 'Paid') {
1476:                     ids.forEach(id => paidMap.set(id, (paidMap.get(id) || 0) + amount));
1477:                     const pDate = d.date || d.pay_date || d.created_at;
1478:                     if (pDate) ids.forEach(id => paymentDateMap.set(id, pDate));
1479:                 } else if (d.status === 'Requested') {
1480:                     ids.forEach(id => requestedMap.set(id, (requestedMap.get(id) || 0) + amount));
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
1599:                     landed_mxn: landedMxn,
1600:                     ld_usd: landedUsd,
1601:                     retail_usd: retailUsd,
1602:                     pay_status: payStatusText
1603:                 });
1604: 
1605:                 const tagIdVal = calculated.bookBarcode || itemData.book_barcode || itemData.itemId || itemData.item_id || itemData.tag_id || item.label || '';
1606:                 const vColorRow = getVendorColor(tagIdVal);
1607:                 const contrastColorRow = getContrastColor(vColorRow);
1608: 
1609:                 const vendorCell = row.getCell('vendor');
1610:                 vendorCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColorRow } };
1611:                 vendorCell.font = { bold: true, color: { argb: contrastColorRow } };
1612: 
1613:                 const tagCell = row.getCell('tag_id');
1614:                 tagCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColorRow } };
1615:                 tagCell.font = { bold: true, color: { argb: contrastColorRow } };
1616: 
1617:                 const payCell = row.getCell('pay_status');
1618:                 payCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: payStatusColor } };
1619:                 payCell.font = { bold: true, color: { argb: getContrastColor(payStatusColor) } };
1620: 
1621:                 if (iIdx % 2 === 0) row.eachCell(c => { if (!c.fill?.type) c.fill = EXCEL_STYLES.fills.zebra; });
1622:             });
1623: 
1624:             const buffer = await workbook.xlsx.writeBuffer();
1625:             const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
1626:             saveAs(new Blob([buffer]), `Onyx-mx_Selected_Items_${dateStr}.xlsx`);
1627:             toast.success(tr("Selected Items WorkBook Ready"), { icon: '📦' });
1628:         } catch (error) {
1629:             console.error('Selected export failed:', error);
1630:             toast.error(tr("Selected Items Export Failed"));
1631:         } finally {
1632:             setIsExporting(false);
1633:         }
1634:     };
```

## handleMasterExportXLSX (src/features/core/MainHeader.tsx, lines 1637-2737, 1101 lines)

### head
```tsx
1637:     const handleMasterExportXLSX = async () => {
1638:         setIsExporting(true);
1639:         try {
1640:             const workbook = new ExcelJS.Workbook();
1641:             workbook.creator = 'Onyx.mx Studio';
1642:             workbook.lastModifiedBy = 'Onyx.mx Studio';
1643:             workbook.created = new Date();
1644: 
1645:             const partialPayIds = new Set(statusSets.partialPayIds);
1646:             const fullPayIds = new Set(statusSets.fullPayIds);
1647:             const requestedAcqIds = new Set(statusSets.requestedAcqIds);
1648:             const paymentDateMap = new Map<string, string>();
1649: 
1650:             const paidMap = new Map<string, number>();
1651:             const requestedMap = new Map<string, number>();
1652: 
1653:             financeDocs.forEach(d => {
1654:                 const rel = d.related_ids || d.related_inventory_ids || '';
1655:                 let ids: string[] = [];
1656:                 if (Array.isArray(rel)) ids = rel.map((id: any) => String(id));
1657:                 else if (typeof rel === 'string') ids = rel.split(',').map(s => s.trim()).filter(Boolean);
1658:                 
1659:                 const amount = Number(d.amount || 0);
1660:                 if (amount <= 0) return;
1661: 
1662:                 if (d.status === 'Paid') {
1663:                     ids.forEach(id => paidMap.set(id, (paidMap.get(id) || 0) + amount));
1664:                     const pDate = d.date || d.pay_date || d.created_at;
1665:                     if (pDate) ids.forEach(id => paymentDateMap.set(id, pDate));
1666:                 } else if (d.status === 'Requested') {
1667:                     ids.forEach(id => requestedMap.set(id, (requestedMap.get(id) || 0) + amount));
1668:                 }
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
1710:                         const { data, error } = await supabase.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
1722:                     supabase.from('shipments').select('*').order('timestamp', { ascending: true })
2354:                             supabase.from('inventory').select('*').or(`item_id.in.(${quotedList}),book_barcode.in.(${quotedList}),tag_id.in.(${quotedList})`),
2355:                             supabase.from('production').select('*').in('tag_id', chunk)
```

### tail
```tsx
2702:                         landed_mxn: landedMxn,
2703:                         ld_usd: landedUsd,
2704:                         retail_usd: retailUsd,
2705:                         pay_status: payStatusText
2706:                     });
2707: 
2708:                     // Tag ID highlighting (Vendor Color)
2709:                     const tagIdVal = calculated.bookBarcode || itemData.book_barcode || itemData.itemId || itemData.item_id || itemData.tag_id || item.label || '';
2710:                     const vColorRow = getVendorColor(tagIdVal);
2711:                     const contrastColorRow = getContrastColor(vColorRow);
2712:                     
2713:                     const tagCell = row.getCell('tag_id');
2714:                     tagCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColorRow } };
2715:                     tagCell.font = { bold: true, color: { argb: contrastColorRow } };
2716: 
2717:                     // Pay Status highlighting
2718:                     const payCell = row.getCell('pay_status');
2719:                     payCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: payStatusColor } };
2720:                     payCell.font = { bold: true, color: { argb: getContrastColor(payStatusColor) } };
2721: 
2722:                     // Zebra
2723:                     if (iIdx % 2 === 0) row.eachCell(c => { if (!c.fill?.type) c.fill = EXCEL_STYLES.fills.zebra; });
2724:                 });
2725:             });
2726: 
2727:             const buffer = await workbook.xlsx.writeBuffer();
2728:             const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
2729:             saveAs(new Blob([buffer]), `Onyx-mx_Book-326_${dateStr}.xlsx`);
2730:             toast.success(tr("WorkBook Ready"), { icon: '📊' });
2731:         } catch (error) {
2732:             console.error('Export failed:', error);
2733:             toast.error(tr("Manifest Export Failed"));
2734:         } finally {
2735:             setIsExporting(false);
2736:         }
2737:     };
```

## handleMasterExportXLSX_V2 (src/features/core/MainHeader.tsx, lines 2746-3553, 808 lines)

### head
```tsx
2746:     const handleMasterExportXLSX_V2 = async () => {
2747:         setIsExporting(true);
2748:         try {
2749:             const workbook = new ExcelJS.Workbook();
2750:             workbook.creator = 'Onyx.mx Studio';
2751:             workbook.lastModifiedBy = 'Onyx.mx Studio';
2752:             workbook.created = new Date();
2753:             
2754:             let shipments: any[] = [];
2755:             const shipRes = await supabase.from('shipments').select('*').order('timestamp', { ascending: true });
2756:             if (shipRes.data) shipments = shipRes.data;
2757: 
2758:             const itemTrkMap = new Map<string, string>();
2759:             const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
2760:             
2761:             for (const ship of shipments) {
2762:                 const p = typeof ship.payload === 'string' ? JSON.parse(ship.payload) : ship.payload;
2763:                 if (!p || !p.crates || p.crates.length === 0) continue;
2764: 
2765:                 const date = new Date(ship.timestamp || ship.updated_at || Date.now());
2766:                 const trkDateName = `TRK-${monthsShort[date.getMonth()]}${date.getDate()}`;
2767:                 
2768:                 p.crates.forEach((crate: any) => {
2769:                     (crate.items || []).forEach((cItem: any) => {
2770:                         if (cItem.row) itemTrkMap.set(String(cItem.row), trkDateName);
2771:                         if (cItem.itemId) itemTrkMap.set(String(cItem.itemId).toUpperCase(), trkDateName);
2772:                     });
2773:                 });
2774:             }
2775: 
2776:             const bookRate = exchangeRate || DEFAULT_EXCHANGE_RATE;
2777: 
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
3518:                         },
3519:                         columns: ledgerCols.map(c => ({ name: c.header })),
3520:                         rows: financeDocs.map(r => [
3521:                             r.date ? new Date(r.date).toLocaleDateString() : '',
3522:                             r.description || '',
3523:                             r.subcategory || r.category || '',
3524:                             r.vendor_id || '',
3525:                             destinationsConfig[r.destination as keyof typeof destinationsConfig]?.name || r.destination || '',
3526:                             r.amount ?? 0,
3527:                             r.commission ?? 0,
3528:                             (r.amount ?? 0) + (r.commission ?? 0),
3529:                             r.status || 'Requested',
3530:                             r.pay_date ? new Date(r.pay_date).toLocaleDateString() : '',
3531:                             r.reference || ''
3532:                         ])
3533:                     });
3534:                     
3535:                     ledgerSheet.getColumn('amount').numFmt = '#,##0';
3536:                     ledgerSheet.getColumn('commission').numFmt = '#,##0';
3537:                     ledgerSheet.getColumn('total').numFmt = '#,##0';
3538:                 }
3539:             } catch (e) {
3540:                 console.error('Error adding Finance Ledger to V2:', e);
3541:             }
3542: 
3543:             const buffer = await workbook.xlsx.writeBuffer();
3544:             const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
3545:             saveAs(new Blob([buffer]), `Onyx-mx_Workbook_V2_${dateStr}.xlsx`);
3546:             toast.success(tr("Workbook V2 Ready"), { icon: '📊' });
3547:         } catch (error) {
3548:             console.error('Export failed:', error);
3549:             toast.error(tr("V2 Export Failed"));
3550:         } finally {
3551:             setIsExporting(false);
3552:         }
3553:     };
```

## handleShopifyExportXLSX (src/features/core/MainHeader.tsx, lines 3556-4305, 750 lines)

### head
```tsx
3556:     const handleShopifyExportXLSX = async () => {
3557:         setIsShopifyExporting(true);
3558:         try {
3559:             const workbook = new ExcelJS.Workbook();
3560:             workbook.creator = 'Onyx Dashboard';
3561:             workbook.lastModifiedBy = 'Onyx System';
3562:             workbook.created = new Date();
3563:             workbook.modified = new Date();
3564: 
3565:             // Two importable sheets, split by what the product actually ships
3566:             // as its image. Both carry the identical Matrixify header row, so
3567:             // either can be imported on its own -- the split is for review, not
3568:             // a change of format. Items whose only image is the generated
3569:             // axonometric icon are the ones still owed a photograph, and Grant
3570:             // asked to see them apart from the finished ones.
3571:             const sheet = workbook.addWorksheet('Shopify Export (Photos)');
3572:             const iconSheet = workbook.addWorksheet('Shopify Export (Icon Only)', {
3573:                 properties: { tabColor: { argb: 'FFB45309' } }
3574:             });
3575: 
3576:             // Shopify Headers (Matrixify Multi-Image Format)
3577:             //
3578:             // Matrixify matches columns by header TEXT, so a header that does
3579:             // not match the client's template is silently ignored and the whole
3580:             // column is dropped. Two names were taken from Shopify's generic
3581:             // CSV docs rather than from Rare Earth Gallery's own template
3582:             // ("revised import headers - added.xlsx") and are corrected here:
3583:             //   'Body (HTML)' -> 'Body HTML'
3584:             // The wholesale-catalog column is 'Included / Art Of Decor', plain
3585:             // ASCII. An earlier change here spelled it with an accented e on the
3586:             // belief that the client's template did; Ramses confirmed on
3587:             // 8 Sep 2026 that it does not, after hand-correcting the header in a
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
3667:                 toast.error(tr("No items selected"));
```

### tail
```tsx
4270:             };
4271:             readyItems.forEach((item: any) => {
4272:                 const info = describeItem(item);
4273:                 const media = classifyMedia(item);
4274:                 repSheet.addRow(sanitizeExcelRow({
4275:                     a: info.tag,
4276:                     b: info.shape,
4277:                     // Name the sheet the item actually landed on, so the Report
4278:                     // can be used to find a row rather than just to count them.
4279:                     c: (media === 'icon' || media === 'none') ? 'Shopify Export (Icon Only)' : 'Shopify Export (Photos)',
4280:                     d: '-',
4281:                     e: media,
4282:                 }));
4283:             });
4284:             notReadyItems.forEach((entry) => {
4285:                 const info = describeItem(entry.item);
4286:                 repSheet.addRow(sanitizeExcelRow({
4287:                     a: info.tag,
4288:                     b: info.shape,
4289:                     c: 'Not Shopify Ready (V2)',
4290:                     d: labelFor(entry.missing),
4291:                     e: classifyMedia(entry.item),
4292:                 }));
4293:             });
4294: 
4295:             const buffer = await workbook.xlsx.writeBuffer();
4296:             const dateStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-');
4297:             saveAs(new Blob([buffer]), `Shopify_Export_${dateStr}.xlsx`);
4298:             toast.success(`Shopify Export Ready — ${readyItems.length} ready, ${notReadyItems.length} to V2`, { icon: '🛍️' });
4299:         } catch (error) {
4300:             console.error('Shopify Export failed:', error);
4301:             toast.error(tr("Shopify Export Failed"));
4302:         } finally {
4303:             setIsShopifyExporting(false);
4304:         }
4305:     };
```

## handleExportCSV (src/features/archive/ArchivePanel.tsx, lines 62-115, 54 lines)

### head
```tsx
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
75:         fmtDate(item.item_date),
76:         (item.description || '').replace(/"/g, '""'),
77:         item.quantity?.toString() || '',
78:         item.weight_kg?.toString() || '',
79:         `${item.height_cm||0}x${item.width_cm||0}x${item.length_cm||0}`
80:       ];
81:       
82:       if (isFinanceRole) {
83:         const fin = finance[item.id];
84:         if (fin) {
85:           row.push(
86:             fin.price_mxn?.toString() || '',
87:             fin.total_pesos?.toString() || '',
88:             fin.aq?.toString() || '',
89:             fin.lnd?.toString() || '',
90:             fin.retail?.toString() || '',
91:             fin.total_usd?.toString() || '',
92:             fin.aqc?.toString() || '',
93:             fin.lc?.toString() || '',
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
94:             fin.sqm_price?.toString() || '',
95:             fin.aq_round?.toString() || '',
96:             fin.lnd_round?.toString() || '',
97:             fin.desc_price?.toString() || ''
98:           );
99:         } else {
100:           row.push('', '', '', '', '', '', '', '', '', '', '', '');
101:         }
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
```

## exportCatalogPdf (src/lib/pdfExport.ts, lines 1148-1150, 3 lines)

### head
```tsx
1148: export async function exportCatalogPdf(
1149:     results: CatalogArtifact[], 
1150:     config: { title: string; method: 'grid' | 'single'; logo?: string; exportType?: 'regular' | 'catalog' },
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```

## exportCrateManifesto (src/lib/crateManifesto.ts, lines 235-1022, 788 lines)

### head
```tsx
235: export async function exportCrateManifesto(
236:     items: ManifestoItem[],
237:     meta: ManifestoMeta,
238:     onProgress?: (pct: number) => void,
239:     returnType: 'blob' | 'doc' | 'download' = 'download',
240:     existingDoc?: jsPDF
241: ): Promise<Blob | jsPDF | void> {
242:     const allManifestoItems = [...items];
243:     if (meta.packingItems && meta.packingItems.length > 0) {
244:         meta.packingItems.forEach(pi => {
245:             allManifestoItems.push({
246:                 itemId: 'MISC-PACK', name: pi.name.toUpperCase(), qty: pi.count, weightKg: pi.weight,
247:                 vendorPrefix: 'MISC', tagColor: '#94a3b8', index: 999, rowId: 'MISC', material: 'MISC', color: 'BROWN', dims: '—', imageUrls: [], dbItemCount: pi.count, packetIn: 'MISC'
248:             } as ManifestoItem);
249:         });
250:     }
251: 
252:     const sortedItems: Array<ManifestoItem | { isHeader: boolean; label: string }> = [];
253:     
254:     if (meta.sortByTagDesc) {
255:         // Sort by itemId (Tag ID) descending
256:         sortedItems.push(...items.sort((a, b) => {
257:             const idA = String(a.itemId || '');
258:             const idB = String(b.itemId || '');
259:             return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
260:         }));
261:     } else {
262:         const itemsByVendor = items.reduce((acc, item) => {
263:             const v = item.vendorPrefix || 'OTHER';
264:             if (!acc[v]) acc[v] = [];
265:             acc[v].push(item);
266:             return acc;
267:         }, {} as Record<string, ManifestoItem[]>);
268: 
269:         Object.keys(itemsByVendor).sort().forEach(v => {
270:             sortedItems.push(...itemsByVendor[v].sort((a, b) => b.qty - a.qty));
271:         });
272:     }
273: 
274:     // 2. Append Manual Packing Items at the VERY BOTTOM
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
983:                 const url = item.imageUrls?.[j + 1] || '';
984:                 
985:                 if (!url) continue;
986: 
987:                 const gRes = await loadImageDataUrl(url, 120);
988:                 if (gRes) {
989:                     const { dataUrl, w, h } = gRes;
990:                     const aspect = w / h;
991:                     let dw = galleryImgSize, dh = galleryImgSize;
992:                     if (aspect > 1) dh = galleryImgSize / aspect; else dw = galleryImgSize * aspect;
993:                     
994:                     const ox = gx + (galleryImgSize - dw) / 2;
995:                     const oy = gy + (galleryImgSize - dh) / 2;
996:                     
997:                     doc.setDrawColor(240, 240, 240);
998:                     doc.rect(ox - 0.1, oy - 0.1, dw + 0.2, dh + 0.2, 'S');
999:                     doc.addImage(dataUrl, 'JPEG', ox, oy, dw, dh);
1000:                     
1001:                     gx += galleryImgSize + 2;
1002:                     if (gx + galleryImgSize > TABLE_END) {
1003:                         gx = COL_QR.x + 2 + xOffset;
1004:                         gy += galleryImgSize + 2;
1005:                     }
1006:                 }
1007:             }
1008:         }
1009: 
1010:         y += totalRowH;
1011:     }
1012: 
1013:     onProgress?.(100);
1014:     const safeId = meta.dynamicId.replace(/[^A-Z0-9_\-]/gi, '_');
1015:     if (returnType === 'blob') {
1016:         return doc.output('blob');
1017:     } else if (returnType === 'doc') {
1018:         return doc;
1019:     } else {
1020:         doc.save(`MANIFESTO_${safeId}.pdf`);
1021:     }
1022: }
```

## exportCombinedTruckManifesto (src/lib/crateManifesto.ts, lines 1024-1025, 2 lines)

### head
```tsx
1024: export async function exportCombinedTruckManifesto(
1025:     trailerData: { items: ManifestoItem[], meta: ManifestoMeta } | null,
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
```
