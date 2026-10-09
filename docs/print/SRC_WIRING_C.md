# Wiring extracts C: label wizard print and xlsx, batch wizard xlsx

Script-extracted, verbatim, with source line numbers. Only the parts needed to wrap each export with job tracking.

## handleGenerateXLSX (label wizard) (src/features/logistics/LabelWizard.tsx, lines 936-968, 33 lines)

### head
```tsx
936:     const handleGenerateXLSX = async () => {
937:         setProgress(p => ({ ...p, xlsx: 10 }));
938:         try {
939:             const rows = selectedItems.map(item => {
940:                 const d = item.normData;
941:                 const c = item.codes;
942:                 const desc = toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece');
943:                 const matColor = toTitleCase(`${d.material || 'Onyx'} ${d.color || ''}`.trim());
944:                 const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
945:                 const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
946:                 const retailStr = String(c.bookRetail || '0').padStart(4, '0');
947:                 const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
948:                 const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBarcode}`;
949:                 return [c.bookBarcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
950:             });
951: 
952:             const blob = await exportToXLSX(`Labels_${name}`, [{
953:                 name: 'Packing List',
954:                 data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
955:             }], {}, 'blob');
956:             
957:             if (blob instanceof Blob) {
958:                 setUrlSlot('xlsx', URL.createObjectURL(blob));
959:                 setProgress(p => ({ ...p, xlsx: 100 }));
960:                 toast.success(tr("XLSX generated"));
961:             } else {
962:                 throw new Error('XLSX generation failed');
963:             }
964:         } catch (error: any) {
965:             toast.error(`XLSX failed: ${error.message}`);
966:             setProgress(p => ({ ...p, xlsx: -1 }));
967:         }
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
968:     };
```

## print job logging (print_jobs) (src/features/logistics/LabelWizard.tsx, around line 503)
```tsx
473:     // rebuilding the batch.
474:     const [lastPrintJob, setLastPrintJob] = React.useState<{
475:         jobId: string; labelCount: number; itemCount: number; at: string; isReprint: boolean;
476:     } | null>(null);
477: 
478:     /**
479:      * Records a completed job. Called only from the designer's PRINT_COMPLETE,
480:      * which fires inside its !isPrintCancelled() guard — so a row here means
481:      * labels physically came out of the printer, not that a wizard was opened.
482:      *
483:      * Counts come from the designer rather than from inventory.quantity: the
484:      * batch expands one label per unit, and an operator can add doubles at the
485:      * end of a run, so the printer's own tally is the only accurate one.
486:      */
487:     const commitPrintJob = React.useCallback(async (detail: any, reason: string) => {
488:         const job = pendingPrintJobRef.current;
489:         if (!job || job.ids.length === 0) return;
490:         pendingPrintJobRef.current = null;
491: 
492:         const printedTags: string[] = Array.isArray(detail?.printedTags) ? detail.printedTags : [];
493:         const labelCount: number = Number(detail?.totalRecords) || printedTags.length || job.ids.length;
494:         const stamp = detail?.finishedAt || new Date().toISOString();
495:         const isReprint = !!job.isReprint;
496: 
497:         // How many labels each tag actually received. A tag appearing twice in
498:         // the run is two labels, which is exactly the double-label case.
499:         const perTag = new Map<string, number>();
500:         printedTags.forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1));
501: 
502:         try {
503:             const { error: jobErr } = await supabase.from('print_jobs').insert({
504:                 id: job.jobId,
505:                 checksum: job.checksum,
506:                 printed_at: stamp,
507:                 printed_by: user?.email || user?.name || null,
508:                 label_count: labelCount,
509:                 item_count: job.ids.length,
510:                 is_reprint: isReprint,
511:                 label_size: labelSizeRef.current,
512:                 source: detail?.source || 'batch',
513:             });
514:             if (jobErr) throw jobErr;
515: 
516:             // One row per item in the job, carrying its own label count. The
517:             // inventory running totals are maintained by trigger from these.
518:             const rows = job.ids.map((id: string) => {
519:                 const tag = job.tagById?.[id] || '';
520:                 return {
521:                     job_id: job.jobId,
522:                     inventory_id: id,
523:                     tag_id: tag,
524:                     labels_printed: perTag.get(tag) ?? 1,
525:                 };
526:             });
527:             for (let i = 0; i < rows.length; i += 100) {
528:                 const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
529:                 if (itemErr) throw itemErr;
530:             }
531: 
532:             // A reprint must not rewrite the original print date — that is the
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 453)
```tsx
443:         return () => window.clearInterval(id);
444:     }, [catalogRunning]);
445: 
446:     const [isPrintWorkflowOpen, setIsPrintWorkflowOpen] = useState(false);
447:     const [showJobLog, setShowJobLog] = useState(false);
448:     // Tracks activeLabelSize, which is declared further down; commitPrintJob
449:     // reads it through this so the callback does not depend on declaration order.
450:     const labelSizeRef = React.useRef<string>('50x30');
451: 
452:     // A print job that has been handed to the engine but not yet confirmed.
453:     const pendingPrintJobRef = React.useRef<{ ids: string[]; tagById: Record<string, string>; checksum: string; jobId: string; isReprint: boolean } | null>(null);
454: 
455:     /**
456:      * SHA-256 of the exact label payload sent to the printer. Stored per item
457:      * so a tag can be traced back to the job that produced it, and so a
458:      * reprint is distinguishable from the original rather than just bumping a
459:      * date. Deterministic: the same batch yields the same checksum.
460:      */
461:     const computeJobChecksum = async (batch: any): Promise<string> => {
462:         try {
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 459)
```tsx
449:     // reads it through this so the callback does not depend on declaration order.
450:     const labelSizeRef = React.useRef<string>('50x30');
451: 
452:     // A print job that has been handed to the engine but not yet confirmed.
453:     const pendingPrintJobRef = React.useRef<{ ids: string[]; tagById: Record<string, string>; checksum: string; jobId: string; isReprint: boolean } | null>(null);
454: 
455:     /**
456:      * SHA-256 of the exact label payload sent to the printer. Stored per item
457:      * so a tag can be traced back to the job that produced it, and so a
458:      * reprint is distinguishable from the original rather than just bumping a
459:      * date. Deterministic: the same batch yields the same checksum.
460:      */
461:     const computeJobChecksum = async (batch: any): Promise<string> => {
462:         try {
463:             const bytes = new TextEncoder().encode(JSON.stringify(batch));
464:             const digest = await crypto.subtle.digest('SHA-256', bytes);
465:             return Array.from(new Uint8Array(digest))
466:                 .map(b => b.toString(16).padStart(2, '0')).join('');
467:         } catch {
468:             return '';
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 505)
```tsx
495:         const isReprint = !!job.isReprint;
496: 
497:         // How many labels each tag actually received. A tag appearing twice in
498:         // the run is two labels, which is exactly the double-label case.
499:         const perTag = new Map<string, number>();
500:         printedTags.forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1));
501: 
502:         try {
503:             const { error: jobErr } = await supabase.from('print_jobs').insert({
504:                 id: job.jobId,
505:                 checksum: job.checksum,
506:                 printed_at: stamp,
507:                 printed_by: user?.email || user?.name || null,
508:                 label_count: labelCount,
509:                 item_count: job.ids.length,
510:                 is_reprint: isReprint,
511:                 label_size: labelSizeRef.current,
512:                 source: detail?.source || 'batch',
513:             });
514:             if (jobErr) throw jobErr;
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 538)
```tsx
528:                 const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
529:                 if (itemErr) throw itemErr;
530:             }
531: 
532:             // A reprint must not rewrite the original print date — that is the
533:             // moment the tag first existed. Only the job log grows.
534:             if (!isReprint) {
535:                 for (let i = 0; i < job.ids.length; i += 50) {
536:                     const { error } = await supabase.from('inventory').update({
537:                         print_date: stamp,
538:                         print_job_checksum: job.checksum,
539:                         print_job_id: job.jobId,
540:                         updated_at: stamp,
541:                     }).in('id', job.ids.slice(i, i + 50));
542:                     if (error) throw error;
543:                 }
544:             }
545: 
546:             setLastPrintJob({ jobId: job.jobId, labelCount, itemCount: job.ids.length, at: stamp, isReprint });
547:             toast.success(`Logged ${labelCount} label${labelCount !== 1 ? 's' : ''} across ${job.ids.length} item${job.ids.length !== 1 ? 's' : ''}`);
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 812)
```tsx
802:                 localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
803:             } catch (storageError) {
804:                 console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
805:             }
806:             pendingBatchRef.current = batchProject;
807:             setProgress(p => ({ ...p, printer: 100 }));
808:             toast.success(tr("Batch Prepared! Launching Print Engine"), { id: tid });
809: 
810:             // Hold the job until the engine confirms it printed. Stamping here
811:             // would record every opened wizard as a printed tag, which is the
812:             // opposite of what the checksum is for.
813:             const tagById: Record<string, string> = {};
814:             selectedItems.forEach((it: any) => {
815:                 const id = it.row ?? it.data?.id ?? it.id;
816:                 if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
817:             });
818:             pendingPrintJobRef.current = {
819:                 ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
820:                 tagById,
821:                 checksum: await computeJobChecksum(batchProject),
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 821)
```tsx
811:             // would record every opened wizard as a printed tag, which is the
812:             // opposite of what the checksum is for.
813:             const tagById: Record<string, string> = {};
814:             selectedItems.forEach((it: any) => {
815:                 const id = it.row ?? it.data?.id ?? it.id;
816:                 if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
817:             });
818:             pendingPrintJobRef.current = {
819:                 ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
820:                 tagById,
821:                 checksum: await computeJobChecksum(batchProject),
822:                 jobId: `PJ-${Date.now().toString(36).toUpperCase()}`,
823:                 isReprint,
824:             };
825: 
826:             setIsPrintWorkflowOpen(true);
827:             setActiveSlide(1);
828:         } catch (e: any) {
829:             console.error(e);
830:             setProgress(p => ({ ...p, printer: -1 }));
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 860)
```tsx
850:     // Counted from the same predicate the export uses, so the preview and the
851:     // two produced files always agree.
852:     const shopifySplit = useMemo(() => {
853:         const ready = selectedItems.reduce((n, i) => n + (isShopifyReady(i.normData) ? 1 : 0), 0);
854:         return { ready, notReady: selectedItems.length - ready };
855:     }, [selectedItems]);
856: 
857:     useEffect(() => {
858:         const handleMessage = (event: MessageEvent) => {
859:             // The engine reports a finished job. This is the confident path:
860:             // a checksum written from here means tags physically printed.
861:             if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
862:                   commitPrintJob(event.data.payload || {}, 'designer reported PRINT_COMPLETE');
863:               }
864:             if (event.data?.type === 'CLOSE_WIZARD') {
865:                   // Fallback: the current print engine emits no completion
866:                   // message, so closing after a job is the only other evidence
867:                   // available. Ask rather than assume — silently stamping an
868:                   // abandoned job is exactly the false positive the checksum
869:                   // exists to prevent.
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 868)
```tsx
858:         const handleMessage = (event: MessageEvent) => {
859:             // The engine reports a finished job. This is the confident path:
860:             // a checksum written from here means tags physically printed.
861:             if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
862:                   commitPrintJob(event.data.payload || {}, 'designer reported PRINT_COMPLETE');
863:               }
864:             if (event.data?.type === 'CLOSE_WIZARD') {
865:                   // Fallback: the current print engine emits no completion
866:                   // message, so closing after a job is the only other evidence
867:                   // available. Ask rather than assume — silently stamping an
868:                   // abandoned job is exactly the false positive the checksum
869:                   // exists to prevent.
870:                   // The designer now reports PRINT_COMPLETE itself, so a job
871:                   // still pending at close was abandoned. Dropping it is
872:                   // correct: recording it would be the false positive the
873:                   // checksum exists to prevent.
874:                   pendingPrintJobRef.current = null;
875:                   setIsPrintWorkflowOpen(false);
876:               }
877:               if (event.data?.type === 'DESIGNER_READY') {
```

## checksum of the print job (src/features/logistics/LabelWizard.tsx, around line 873)
```tsx
863:               }
864:             if (event.data?.type === 'CLOSE_WIZARD') {
865:                   // Fallback: the current print engine emits no completion
866:                   // message, so closing after a job is the only other evidence
867:                   // available. Ask rather than assume — silently stamping an
868:                   // abandoned job is exactly the false positive the checksum
869:                   // exists to prevent.
870:                   // The designer now reports PRINT_COMPLETE itself, so a job
871:                   // still pending at close was abandoned. Dropping it is
872:                   // correct: recording it would be the false positive the
873:                   // checksum exists to prevent.
874:                   pendingPrintJobRef.current = null;
875:                   setIsPrintWorkflowOpen(false);
876:               }
877:               if (event.data?.type === 'DESIGNER_READY') {
878:                   if (pendingBatchRef.current && iframeRef.current?.contentWindow) {
879:                       iframeRef.current.contentWindow.postMessage(
880:                           { type: 'LOAD_DESIGN', payload: pendingBatchRef.current },
881:                           '*'
882:                       );
```

## buildXlsx (src/features/inventory/BatchProcessingWizard.tsx, lines 440-528, 89 lines)

### head
```tsx
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
451: 
452:         const shape = norm.shape || '';
453:         const shortDesc = norm.shortDescription || norm.type || '';
454:         const color = norm.color || '';
455:         const material = norm.material || '';
456:         const fallbackTitle = `${shape} ${shortDesc} ${color} ${material}`.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
457:         const title = formatProductTitle(text.title || fallbackTitle) + (norm.partSuffix ? ` ${norm.partSuffix}` : '');
458:         const bodyHtml = text.html || norm.generatedDescription || generateFallbackMarketingHtml(norm);
459: 
460:         let colorsStr = '';
461:         if (text.colors.length > 0) colorsStr = text.colors.join(', ');
462:         else if (norm.color && norm.color.includes(',')) colorsStr = norm.color;
463:         else colorsStr = getStoneStyleColors(material, `${shape} ${shortDesc}`, color).join(', ');
464: 
465:         const testStr = `${shape} ${shortDesc} ${category} ${title} ${material}`;
466:         const fountainsVal = /fountain|fuente|cascada/i.test(testStr) ? 'TRUE' : 'FALSE';
467:         const pendantsVal = /pendant|colgante|lámpara colgante|hanging/i.test(testStr) ? 'TRUE' : 'FALSE';
468: 
469:         const vendorSku = calc.bookAqCode || tagId.replace(/^[A-Za-z]{2}[-]?\d{3}[-]?/, '') || tagId;
470:         const rawVendorId = String(norm.vendorId || norm.vendor_id || '').toUpperCase().trim();
471:         const vendorPrefix = rawVendorId.split('-')[0] || rawVendorId.substring(0, 2);
```

### lines inside that write, download, print or record (verbatim, line numbers)
```tsx
```

### tail
```tsx
493:         if (itemImages.length === 0) {
494:             const primary = getCleanImageUrl(norm.generatedPngUrl) || getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]);
495:             itemImages = primary ? [primary] : [''];
496:         }
497:         // Drive links need an extension for Matrixify to fetch them as images.
498:         itemImages = itemImages.map(img => {
499:             let clean = getCleanImageUrl(img) || img;
500:             if (clean && clean.includes('google') && !clean.toLowerCase().endsWith('.png') && !clean.toLowerCase().endsWith('.jpg')) {
501:                 clean = clean.includes('?') ? `${clean}&ext=.png` : `${clean}?.png`;
502:             }
503:             return clean;
504:         });
505: 
506:         const combinedVendorSku = `${tagId}-${vendorSku}${costMxn}`;
507:         const tagsArray = [
508:             tagId, color, formattedMaterial, shape, shortDesc,
509:             norm.heightCm ? `${norm.heightCm} cm` : '',
510:             norm.widthCm ? `${norm.widthCm} cm` : '',
511:         ].filter(Boolean).join(', ');
512:         const catAndType = getProductCategoryAndType(norm);
513:         const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || tagId.toLowerCase();
514: 
515:         itemImages.forEach((imgUrl, imgIdx) => {
516:             sheet.addRow(sanitizeExcelRow([
517:                 handle, title, bodyHtml, vendorName, catAndType.type, 'Title', 'Default Title', 1, tagId, tagId, cost, price, weightGrams,
518:                 imgUrl, 'MERGE', imgIdx + 1, imgIdx === 0 ? imgUrl : '', weightLbs, combinedVendorSku, '', depthIn, widthIn, heightIn,
519:                 measurementsStr, '', formattedMaterial, 'Mexican Onyx', catAndType.category, tagsArray, colorsStr, polishType, '',
520:                 'Adults', 'Unisex', 'Rare Earth Gallery', 'Rare Earth Gallery', 'active', 'FALSE', 'global', 'true', 'shopify', 'deny',
521:                 'manual', 'true', 'TRUE', fountainsVal, pendantsVal,
522:             ]));
523:         });
524:     }
525: 
526:     const buffer = await workbook.xlsx.writeBuffer();
527:     return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
528: }
```
