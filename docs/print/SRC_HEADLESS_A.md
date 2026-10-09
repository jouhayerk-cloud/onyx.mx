# Headless extracts A: trucking manifest items

Script-extracted, verbatim, with source line numbers.

## first copy of buildConsolidatedItems and the manifesto items built from it (src/features/logistics/TruckingModule.tsx, lines 1912-2048)
```tsx
1912:             results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)];
1913:         });
1914:         
1915:         return results;
1916:     };
1917: 
1918:     const buildConsolidatedItems = () => {
1919:         const itemMap = new Map<string, { qty: number, inv: any, crates: Set<string> }>();
1920:         truckCrates.forEach(c => {
1921:             const { label } = getCrateDisplayName(c, allCrates, allInventory);
1922:             getItemsFromCrate(c).forEach((item: any) => {
1923:                 const itemContainer = item.packetIn || label;
1924:                 const existing = itemMap.get(item.id);
1925:                 if (existing) {
1926:                     existing.qty += item.qty;
1927:                     existing.crates.add(itemContainer);
1928:                 } else {
1929:                     itemMap.set(item.id, { qty: item.qty, inv: item.inv, crates: new Set([itemContainer]) });
1930:                 }
1931:             });
1932:         });
1933:         return Array.from(itemMap.values());
1934:     };
1935: 
1936:     const generateManifesto = async () => trackDocumentJob({ templateId: 'fmt-trucking-manifesto-xlsx', kind: 'xlsx', season: '826' }, async () => {
1937:         setProgress(p => ({ ...p, manifesto: 5 }));
1938:         const items = buildConsolidatedItems();
1939:         const blob = await generateConsolidatedManifestoXlsx(items, bookRate);
1940:         setProgress(p => ({ ...p, manifesto: 95 }));
1941:         if (blob) {
1942:             setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
1943:             setProgress(p => ({ ...p, manifesto: 100 }));
1944:         } else {
1945:             setProgress(p => ({ ...p, manifesto: -1 }));
1946:             toast.error(tr("Failed to generate Excel file"));
1947:         }
1948:     });
1949: 
1950:     const generatePdf = async () => {
1951:         const tid = toast.loading(tr("Generating consolidated trailer manifest..."));
1952:         setProgress(p => ({ ...p, pdf: 5 }));
1953:         try {
1954:             const items = buildConsolidatedItems();
1955:             // TruckExportModal has no `fields` -- that prop belongs to
1956:             // ReadyTruckWizard (:2549), which owns the packing-items editor. This
1957:             // function was copied there, gained `fields`, and the original was left
1958:             // referencing a binding it never had, so every call threw
1959:             // ReferenceError on this line and this modal has never produced a PDF.
1960:             // Declared empty rather than reached for across components: this export
1961:             // genuinely has no packing-item data to draw on.
1962:             const packingItems: Array<{ name: string; count: number; weight: number }> = [];
1963:             const packingWeight = packingItems.reduce((s, i) => s + (i.weight || 0) * (i.count || 1), 0);
1964:             const packingUnits = packingItems.reduce((s, i) => s + (i.count || 0), 0);
1965:             const crateItemsCount = items.reduce((s, i) => s + (i.qty || 1), 0);
1966: 
1967:             const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
1968:                 const inv = item.inv;
1969:                 const data = inv.data || {};
1970:                 const norm = normalizeInventoryData(inv);
1971:                 const calculated = calculateCodesAndPrices(norm, bookRate, '326');
1972:                 const tag = calculated.bookBarcode || data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
1973:                 const vendorPrefix = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
1974:                 const vendorCol = vendors[vendorPrefix as keyof typeof vendors]?.color || '#6b7280';
1975:                 return {
1976:                     index: idx, vendorPrefix, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
1977:                     name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
1978:                     material: data.material || data.Material || '', color: data.color || data.Color || '',
1979:                     dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
1980:                     weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
1981:                     costMxn: 0, costUsd: 0,
1982:                     imageUrls: [], 
1983:                     tagColor: vendorCol, dbItemCount: data.quantity || 1,
1984:                     packetIn: Array.from(item.crates).join(', ')
1985:                 };
1986:             });
1987: 
1988:             const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
1989:             const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
1990:             const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
1991:             
1992:             const floorCrates = truckCrates;
1993:             const nestedBoxes = allCrates.filter(c => c.type === 'cardboard' && c.parent_id && floorCrates.some(fc => fc.id === c.parent_id));
1994:             
1995:             const allTruckCratesMeta = [...floorCrates, ...nestedBoxes].map(c => {
1996:                 const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
1997:                 const col = vendorList.length > 0 ? (vendors as any)[vendorList[0] as keyof typeof vendors]?.color || '#6b7280' : '#6b7280';
1998:                 
1999:                 let parentLabel = '';
2000:                 if (c.parent_id) {
2001:                     const parent = allCrates.find(p => p.id === c.parent_id);
2002:                     if (parent) {
2003:                         const { label: pl } = getCrateDisplayName(parent, allCrates, allInventory, truckNumbering[parent.id]);
2004:                         parentLabel = pl;
2005:                     }
2006:                 }
2007: 
2008:                 return {
2009:                     id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
2010:                     weight: computeCrateWeight(c, allInventory, allCrates), color: col,
2011:                     l: c.length_cm, w: c.width_cm, h: c.height_cm || 100,
2012:                     parentLabel
2013:                 };
2014:             });
2015: 
2016:             const meta = {
2017:                 dynamicId: name || 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
2018:                 crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
2019:                 topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
2020:                 allTruckCrates: allTruckCratesMeta,
2021:                 truckStats: {
2022:                     totalWeight: totalWeight + packingWeight, 
2023:                     payloadPct: Math.round(((totalWeight + packingWeight) / 22000) * 100), 
2024:                     floorPct: floorPct, volPct: panelStats.volPct,
2025:                     status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, 
2026:                     itemCount: crateItemsCount + packingUnits
2027:                 },
2028:                 packingItems,
2029:                 excludeImages: true,
2030:                 excludeHeaderQr: true,
2031:                 excludeHeaderWireframe: true
2032:             };
2033:             const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
2034:             if (blob) {
2035:                 setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
2036:                 setProgress(p => ({ ...p, pdf: 100 }));
2037:                 toast.success(tr("Manifest ready"), { id: tid });
2038:             } else {
2039:                 throw new Error('PDF Generation failed (empty blob)');
2040:             }
2041:         } catch (err: any) {
2042:             console.error('[TruckExport] PDF Error:', err);
2043:             setProgress(p => ({ ...p, pdf: -1 }));
2044:             toast.error(err.message || 'PDF Generation failed', { id: tid });
2045:         }
2046:     };
2047: 
2048:     const generateAllManifestos = async (withImages: boolean) => {
```

## trailer manifesto items (combined truck manifesto) (src/features/logistics/TruckingModule.tsx, lines 2087-2138)
```tsx
2087:                 excludeHeaderQr: false, excludeHeaderWireframe: false,
2088:                 exportBruteWeight: crate.brute_weight_kg
2089:             };
2090:             return { items, meta };
2091:         });
2092: 
2093:         const trailerManifestoItems: ManifestoItem[] = [];
2094:         const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
2095:         const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
2096:         const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
2097:         
2098:         const allTruckCratesMeta = truckCrates.map(c => {
2099:             const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
2100:             const col = vendorList.length > 0 ? (vendors[vendorList[0] as keyof typeof vendors]?.color || '#6b7280') : '#6b7280';
2101:             return {
2102:                 id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
2103:                 weight: computeCrateWeight(c, allInventory, allCrates), color: col,
2104:                 l: c.length_cm, w: c.width_cm, h: c.height_cm || 100
2105:             };
2106:         });
2107: 
2108:         const trailerMeta = {
2109:             dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
2110:             crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
2111:             topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
2112:             allTruckCrates: allTruckCratesMeta,
2113:             truckStats: {
2114:                 totalWeight,
2115:                 payloadPct: panelStats.payloadPct, floorPct: floorPct, volPct: panelStats.volPct,
2116:                 status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, itemCount: truckCrates.length
2117:             },
2118:             excludeImages: true, excludeHeaderQr: true, excludeHeaderWireframe: true
2119:         };
2120: 
2121:         const blob = await exportCombinedTruckManifesto({ items: trailerManifestoItems, meta: trailerMeta }, cratesData, pct => setProgress(p => ({ ...p, [key]: 10 + Math.round(pct * 0.9) })), 'blob') as any as Blob;
2122:         if (blob) {
2123:             setUrls(u => ({ ...u, [key]: URL.createObjectURL(blob) }));
2124:             setProgress(p => ({ ...p, [key]: 100 }));
2125:         } else {
2126:             setProgress(p => ({ ...p, [key]: -1 }));
2127:             toast.error(tr("Failed to generate combined PDF"));
2128:         }
2129:     };
2130: 
2131:     const generatePacked = async () => trackDocumentJob({ templateId: 'fmt-trucking-crates-spreadsheets-xlsx', kind: 'xlsx', season: '826' }, async () => {
2132:         setProgress(p => ({ ...p, packed: 5 }));
2133:         const rootCrates = truckCrates.filter(c => !c.parent_id);
2134:         const blob = await generateCrateSpreadsheetsXlsx(rootCrates, allCrates, allInventory, bookRate, getItemsFromCrate);
2135:         setProgress(p => ({ ...p, packed: 95 }));
2136:         if (blob) {
2137:             setUrls(u => ({ ...u, packed: URL.createObjectURL(blob) }));
2138:             setProgress(p => ({ ...p, packed: 100 }));
```

## second copy of buildConsolidatedItems (duplicate to dedupe) and its manifesto items (src/features/logistics/TruckingModule.tsx, lines 2526-2625)
```tsx
2526:         nested.forEach(n => { results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)]; });
2527:         return results;
2528:     };
2529: 
2530:     const buildConsolidatedItems = () => {
2531:         const itemMap = new Map<string, { qty: number, inv: any, crates: Set<string> }>();
2532:         truckCrates.forEach(c => {
2533:             const { label } = getCrateDisplayName(c, allCrates, allInventory);
2534:             getItemsFromCrate(c).forEach((item: any) => {
2535:                 const itemContainer = item.packetIn || label;
2536:                 const existing = itemMap.get(item.id);
2537:                 if (existing) { existing.qty += item.qty; existing.crates.add(itemContainer); }
2538:                 else { itemMap.set(item.id, { qty: item.qty, inv: item.inv, crates: new Set([itemContainer]) }); }
2539:             });
2540:         });
2541:         return Array.from(itemMap.values());
2542:     };
2543: 
2544:     const generatePdf = async () => {
2545:         const tid = toast.loading(tr("Building trailer packing list..."));
2546:         setProgress(p => ({ ...p, pdf: 5 }));
2547:         try {
2548:             const items = buildConsolidatedItems();
2549:             const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
2550:                 const inv = item.inv; const data = inv.data || {};
2551:                 const norm = normalizeInventoryData(inv);
2552:                 const calculated = calculateCodesAndPrices(norm, bookRate, '326');
2553:                 const tag = calculated.bookBarcode || data.book_barcode || data.bookBarcode || data.itemId || String(item.inv.row);
2554:                 const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
2555:                 return {
2556:                     index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(item.inv.row),
2557:                     name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
2558:                     material: data.material || '', color: data.color || '',
2559:                     dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
2560:                     weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
2561:                     costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
2562:                     packetIn: Array.from(item.crates).join(', ')
2563:                 };
2564:             });
2565: 
2566:             const topView = generateTrailerThumbnail(truckCrates, positions, allCrates, allInventory);
2567:             const sideView = generateSideViewThumbnail(truckCrates, positions, allCrates, allInventory);
2568:             const isoView = generateIsoViewThumbnail(truckCrates, positions, allCrates, allInventory);
2569:             
2570:             const floorCrates = truckCrates;
2571:             const nestedBoxes = allCrates.filter(c => c.type === 'cardboard' && c.parent_id && floorCrates.some(fc => fc.id === c.parent_id));
2572:             const allTruckCratesMeta = [...floorCrates, ...nestedBoxes].map(c => {
2573:                 const { label, vendorList } = getCrateDisplayName(c, allCrates, allInventory, truckNumbering[c.id]);
2574:                 const col = vendorList.length > 0 ? (vendors as any)[vendorList[0]]?.color || '#6b7280' : '#6b7280';
2575:                 let parentLabel = '';
2576:                 if (c.parent_id) {
2577:                     const parent = allCrates.find(p => p.id === c.parent_id);
2578:                     if (parent) parentLabel = getCrateDisplayName(parent, allCrates, allInventory, truckNumbering[parent.id]).label;
2579:                 }
2580:                 return {
2581:                     id: c.id, label, type: c.type, dims: `${c.width_cm}×${c.length_cm}×${c.height_cm||'?'} cm`,
2582:                     weight: computeCrateWeight(c, allInventory, allCrates), color: col,
2583:                     l: c.length_cm, w: c.width_cm, h: c.height_cm || 100, parentLabel
2584:                 };
2585:             });
2586: 
2587:             const meta: ManifestoMeta = {
2588:                 dynamicId: 'Trailer Load', crateId: `TRK-${Date.now()}`, crateDims: `${TRUCK_L_CM}×${TRUCK_W_CM} cm`,
2589:                 crateType: 'Trailer Load', fillPct: 100, exportedAt: new Date().toLocaleString(), customTitle: 'TRAILER PACKING LIST',
2590:                 topViewImg: topView, sideViewImg: sideView, isoViewImg: isoView,
2591:                 allTruckCrates: allTruckCratesMeta,
2592:                 truckStats: {
2593:                     totalWeight: totalWeight + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0), 
2594:                     payloadPct: panelStats.payloadPct, floorPct: floorPct, volPct: panelStats.volPct,
2595:                     status: panelStats.status, rPct: panelStats.rPct, mPct: panelStats.mPct, fPct: panelStats.fPct, 
2596:                     itemCount: (buildConsolidatedItems().reduce((s:number, i:any) => s + (i.qty || 1), 0)) + (fields.packingItems || []).reduce((s:number, i:any) => s + (i.count || 0), 0)
2597:                 },
2598:                 excludeImages: true, excludeHeaderQr: true, excludeHeaderWireframe: true,
2599:                 sealNumber: fields.sealNumber, tractorNumber: fields.tractorNumber, truckPlates: fields.truckPlates,
2600:                 trailerNumber: fields.trailerNumber, trailerPlates: fields.trailerPlates, senders: fields.senders,
2601:                 packingItems: fields.packingItems
2602:             };
2603:             const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
2604:             if (blob) { setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) })); setProgress(p => ({ ...p, pdf: 100 })); toast.success(tr("Manifest ready"), { id: tid }); }
2605:         } catch (err: any) { setProgress(p => ({ ...p, pdf: -1 })); toast.error(err.message || 'Failed', { id: tid }); }
2606:     };
2607: 
2608:     const generatePackingListXlsx = async () => trackDocumentJob({ templateId: 'fmt-trucking-trailer-packing-list-xlsx', kind: 'xlsx', season: '826' }, async () => {
2609:         const tid = toast.loading(tr("Generating XLSX Packing List..."));
2610:         setProgress(p => ({ ...p, xlsx: 5 }));
2611:         try {
2612:             const wb = new ExcelJS.Workbook();
2613:             const ws = wb.addWorksheet('Trailer Packing List');
2614: 
2615:             // Header Styling
2616:             const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } }; // Orange
2617:             const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light Gray
2618:             const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };
2619: 
2620:             // 1. Shipment Info
2621:             ws.addRow(['ONYX LOGISTICS · TRAILER PACKING LIST']);
2622:             ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
2623:             ws.addRow([`Exported At: ${new Date().toLocaleString()}`]);
2624:             ws.addRow([]);
2625: 
```
