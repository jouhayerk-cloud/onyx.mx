# Headless extracts B: crate manifesto items

Script-extracted, verbatim, with source line numbers.

## manifesto items from packed items and the export call (src/features/logistics/CratesInventoryView.tsx, lines 350-440)
```tsx
350:                         const norm = normalizeInventoryData(inv.data);
351:                         w += (parseFloat(norm.weightKg || norm.weight_kg) || 0) * qty;
352:                     }
353:                 });
354:             }
355:             const nested = allCrates.filter(nu => nu.parent_id === c.id);
356:             nested.forEach(n => {
357:                 w += getWeight(n, visited);
358:             });
359:             return w;
360:         };
361: 
362:         return { getItemsRecursive: getItems, getUsedVolRecursive: getVol, getNetWeightRecursive: getWeight };
363:     }, [allCrates, allInventory, liveRate]);
364: 
365:     const netWeight = useMemo(() => getNetWeightRecursive(crate), [crate, getNetWeightRecursive]);
366: 
367:     const fillPct = useMemo(() => {
368:         const internalVol = (crate.width_cm || 1) * (crate.length_cm || 1) * (crate.height_cm || 1);
369:         if (internalVol <= 0) return 0;
370:         return Math.min(100, (getUsedVolRecursive(crate) / internalVol) * 100);
371:     }, [crate, getUsedVolRecursive]);
372: 
373:     const packedItems = useMemo(() => getItemsRecursive(crate), [crate, getItemsRecursive]);
374: 
375:     const handleStartExport = async (cfg: any) => {
376:         if (packedItems.length === 0) return toast.error(tr("Crate is empty"));
377:         const tid = toast.loading(tr("Generating Manifesto PDF..."));
378:         setIsExporting(true);
379:         try {
380:             const manifestoItems: ManifestoItem[] = packedItems.map((item, idx) => {
381:                 const d = normalizeInventoryData(item.norm);
382:                 const c = calculateCodesAndPrices(d, liveRate, '326');
383:                 const vendorPrefix = String(d.vendor_id || d.itemId || '').split('-')[0] || 'UNK';
384:                 const rawUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [d.generatedPngUrl];
385:                 const imageUrls = rawUrls.map(u => getCleanImageUrl(u));
386:                 
387:                 return {
388:                     index: idx + 1,
389:                     vendorPrefix,
390:                     qty: item.qty,
391:                     itemId: c.bookBarcode || d.itemId || 'N/A',
392:                     rowId: item.id,
393:                     name: `${d.shape || ''} ${d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE',
394:                     material: d.material || 'ONYX',
395:                     color: d.color || '',
396:                     dims: `${d.widthCm || 0}×${d.heightCm || 0}×${d.lengthCm || 0} cm`,
397:                     weightKg: Number(d.weightKg || 0),
398:                     costMxn: Number(d.price || 0),
399:                     costUsd: Number(c.bookAcquisition || 0),
400:                     imageUrls,
401:                     tagColor: (vendors as any)[vendorPrefix]?.color || '#555',
402:                     dbItemCount: Number(d.quantity || 0),
403:                     packetIn: item.packetIn
404:                 };
405:             });
406: 
407:             await exportCrateManifesto(manifestoItems, {
408:                 dynamicId,
409:                 crateId: crate.id,
410:                 crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm} cm`,
411:                 crateType: (crate.type === 'cardboard' || (crate.width_cm == 38 && crate.length_cm == 41 && crate.height_cm == 38)) ? 'box' : crate.type,
412:                 fillPct,
413:                 exportedAt: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }),
414:                 exportNotes: cfg.notes?.trim() || '',
415:                 exportBruteWeight: cfg.bruteWeight?.trim() || undefined,
416:                 branding: cfg.branding,
417:                 excludeImages: !cfg.includeImages,
418:                 crateColor: (vendors as any)[dynamicId.split('-')[0]]?.color,
419:                 customTitle: cfg.title
420:             }, (pct) => {
421:                 setExportProgress(pct);
422:                 setExportStatus(`Assembling page vectors: ${pct}%`);
423:             });
424:             
425:             toast.success(tr("Manifesto PDF Downloaded"), { id: tid });
426:         } catch (e) {
427:             console.error('Manifesto Export Error:', e);
428:             toast.error(tr("Failed to generate PDF"), { id: tid });
429:         } finally {
430:             setIsExporting(false);
431:             setIsExportProgressOpen(false);
432:             setExportProgress(0);
433:         }
434:     };
435: 
436:     return (
437:         <div 
438:             onClick={() => {
439:                 if (selectionMode && onSelect) {
440:                     onSelect();
```
