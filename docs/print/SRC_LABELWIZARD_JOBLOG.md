# LabelWizard.tsx: print job checksum and logging (verbatim extracts)

## lines 445-560
```tsx
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
463:             const bytes = new TextEncoder().encode(JSON.stringify(batch));
464:             const digest = await crypto.subtle.digest('SHA-256', bytes);
465:             return Array.from(new Uint8Array(digest))
466:                 .map(b => b.toString(16).padStart(2, '0')).join('');
467:         } catch {
468:             return '';
469:         }
470:     };
471: 
472:     // The last completed job, so the operator can reprint or review it without
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
548:             console.log(`[LabelWizard] print job ${job.jobId} recorded (${reason})`);
549:         } catch (e: any) {
550:             console.error('[LabelWizard] print job log failed:', e);
551:             toast.error('Labels printed, but the job was not logged: ' + (e?.message || 'unknown error'));
552:         }
553:     }, [user]);
554: 
555:     const [activeLabelSize, setActiveLabelSize] = useState<'50x30' | '50x50'>('50x30');
556:     React.useEffect(() => { labelSizeRef.current = activeLabelSize; }, [activeLabelSize]);
557:     const [isPrintHelperOpen, setIsPrintHelperOpen] = useState(false);
558:     const [logoVariant, setLogoVariant] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');
559:     const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
560:     const [quantities, setQuantities] = useState<Record<string, number>>({});
```

## lines 800-880
```tsx
800:             const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
801:             try {
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
822:                 jobId: `PJ-${Date.now().toString(36).toUpperCase()}`,
823:                 isReprint,
824:             };
825: 
826:             setIsPrintWorkflowOpen(true);
827:             setActiveSlide(1);
828:         } catch (e: any) {
829:             console.error(e);
830:             setProgress(p => ({ ...p, printer: -1 }));
831:             toast.error(`Print setup failed: ${e.message}`, { id: tid });
832:         }
833:     };
834: 
835:     const selectedItems = useMemo(() => {
836:         const items = inventory.filter(item => selectedIds.includes(item.row)).map(item => {
837:             const normData = normalizeInventoryData(item.data);
838:             const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
839:             return { ...item, normData, codes };
840:         });
841: 
842:         // Sort by bookBarcode (TAGID) descending
843:         return items.sort((a, b) => {
844:             const tagA = String(a.codes.bookBarcode || '');
845:             const tagB = String(b.codes.bookBarcode || '');
846:             return tagB.localeCompare(tagA, undefined, { numeric: true, sensitivity: 'base' });
847:         });
848:     }, [inventory, selectedIds, exchangeRate, workbookPrefix]);
849: 
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
```
