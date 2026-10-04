# Label (Phomemo and tag) generators: digest

Script-generated, line-numbered. PhomemoM110.ts, LabelVisuals.tsx, PreviewLabels.tsx are short: read them whole (listed in the task).

### LabelWizard signatures (`src/features/logistics/LabelWizard.tsx`, 1862 lines)
```
47: export const NFCWizard: React.FC = () => {
48:     const [isOpen, setIsOpen] = useAtom(isPackingNFCWizardOpenAtom);
49:     const invIds = useAtomValue(selectedInventoryIdsAtom);
...
373: const fmtDuration = (ms: number) => {
374:     const total = Math.max(0, Math.floor(ms / 1000));
375:     return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
...
379: export const LabelWizard: React.FC = () => {
380:     const user = useAtomValue(userAtom);
381:     const [isOpen, setIsOpen] = useAtom(isPackingPrintWizardOpenAtom);
```

### LabelWizard label geometry, fonts, printing (`src/features/logistics/LabelWizard.tsx`, 1862 lines)
```
209:                         <span className="text-lg md:text-xl font-black text-white tracking-tighter tabular-nums">{currentIndex + 1} / {selectedItems.length}</span>
210:                     </div>
211:                 </div>
...
224:                                     <h2 className="text-2xl font-black text-white tracking-[0.3em] uppercase leading-none">NFC</h2>
225:                                     <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.8em] mt-2">{tr("SYSTEM_NFC_PROTOCOL")}</span>
226:                                 </div>
227:                             </div>
...
230:                                 <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-none break-all" style={{ color: vendorColor }}>
231:                                     {currentItem?.codes.bookBarcode}
232:                                 </h1>
...
240:                                             <span className="text-[7px] md:text-[9px] font-black text-white/40 uppercase tracking-widest">{t.label}</span>
241:                                             <span className="text-[12px] md:text-[18px] font-black text-white uppercase tracking-tighter">{t.value}</span>
242:                                         </div>
243:                                     ))}
...
268:                                             ? 'bg-emerald-500 border-emerald-400 text-black font-black'
269:                                             : 'bg-black/60 border-white/20 text-white/60 hover:text-white hover:border-white/40'
270:                                     }`}
...
290:                                         <span className="text-[6px] md:text-[8px] font-black text-white/40 uppercase tracking-[0.2em] leading-none">{tr("NO_HW")}</span>
291:                                     </>
292:                                 ) : status === 'success' ? (
293:                                     <><CheckCircle size={28} className="md:w-[32px] md:h-[32px] text-black" /><span className="text-[9px] font-black text-black uppercase tracking-[0.2em]">{tr("LOCKED"
294:                                 ) : (
295:                                     <>
...
297:                                         <span className={`text-[6px] md:text-[8px] font-black uppercase tracking-[0.3em] mt-2 ${isWriting ? 'text-white' : 'text-(--main-color) opacity-60'}`}>
298:                                             {isWriting ? tr("ENCODING") : tr("WRITE")}
299:                                         </span>
...
309:                             <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("CORE_SPEC")}</span>
310:                             <div className="flex flex-col">
311:                                 <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.color || tr("CLR_NULL")}</span>
312:                                 <span className="text-[10px] md:text-base font-bold text-white/40 uppercase tracking-widest leading-none mt-0.5">{currentItem?.normData.material || tr("MAT_NULL")}</spa
313:                             </div>
314:                         </div>
...
317:                             <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("DESCRIPTOR")}</span>
318:                             <div className="flex flex-col">
319:                                 <span className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">{currentItem?.normData.shape || tr("SHAPE_NULL")}</span>
320:                                 <span className="text-[10px] md:text-base font-medium text-white/30 uppercase tracking-tight truncate">{currentItem?.normData.shortDescription || '---'}</span>
321:                             </div>
322:                         </div>
...
325:                             <span className="text-[7px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.6em] mb-2">{tr("GEOMETRY_PROTO")}</span>
326:                             <div className="flex items-center justify-between">
327:                                 <div className="flex items-baseline gap-2 md:gap-5">
328:                                     <span className="text-2xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none group-hover:text-(--main-color) transition-colors">{
329:                                     <span className="text-sm md:text-2xl font-black text-(--main-color) uppercase tracking-tighter opacity-30">CM</span>
330:                                 </div>
331:                                 <div className="flex flex-col items-end border-l border-white/10 pl-4 md:pl-6">
332:                                     <span className="text-[7px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">{tr("WEIGHT")}</span>
333:                                     <span className="text-xl md:text-4xl font-black text-white tabular-nums tracking-tighter">{currentItem?.normData.weightKg || 0}KG</span>
334:                                 </div>
335:                             </div>
...
450:     const labelSizeRef = React.useRef<string>('50x30');
451: 
452:     // A print job that has been handed to the engine but not yet confirmed.
453:     const pendingPrintJobRef = React.useRef<{ ids: string[]; tagById: Record<string, string>; checksum: string; jobId: string; isReprint: boolean } | null>(null);
454: 
455:     /**
...
459:      * date. Deterministic: the same batch yields the same checksum.
460:      */
461:     const computeJobChecksum = async (batch: any): Promise<string> => {
...
503:             const { error: jobErr } = await supabase.from('print_jobs').insert({
504:                 id: job.jobId,
505:                 checksum: job.checksum,
506:                 printed_at: stamp,
507:                 printed_by: user?.email || user?.name || null,
...
511:                 label_size: labelSizeRef.current,
512:                 source: detail?.source || 'batch',
513:             });
...
528:                 const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
529:                 if (itemErr) throw itemErr;
530:             }
...
538:                         print_job_checksum: job.checksum,
539:                         print_job_id: job.jobId,
540:                         updated_at: stamp,
541:                     }).in('id', job.ids.slice(i, i + 50));
...
556:     React.useEffect(() => { labelSizeRef.current = activeLabelSize; }, [activeLabelSize]);
557:     const [isPrintHelperOpen, setIsPrintHelperOpen] = useState(false);
558:     const [logoVariant, setLogoVariant] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');
...
594:                 const wCm = parseFloat(d.widthCm) || 10;
595:                 const hCm = parseFloat(d.heightCm) || 10;
596:                 const dCm = parseFloat(d.lengthCm) || wCm;
597: 
...
608:                     "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM${d.weightKg ? '  WT ' + d.weightKg + ' KG' : ''}`,
609:                     "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
610:                     "QUANTITY": 1,
...
624:     const ONYX_MASTER_TEMPLATE_V4 = (width: number, height: number) => ({
625:         name: "OnyxLabels_V4",
626:         version: 4,
...
628:         labelSize: { width, height },
629:         templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "COLOR MATERIAL", "QR DATA", "AXO_IMAGE"],
630:         elements: [
...
635:                 x: -95, y: 107.2, width: 220, height: 23.6,
636:                 rotation: 90,
637:                 text: "MADE IN MEXICO",
638:                 fontSize: 15,
639:                 fontFamily: "Inter, sans-serif",
640:                 align: "justify",
641:                 fontWeight: "bold"
642:             },
643:             {
...
647:                 x: 78.7, y: 0, width: 215, height: 28.6,
648:                 rotation: 0,
649:                 align: "center",
...
651:                 fontSize: 15,
652:                 fontFamily: "Inter, sans-serif",
653:                 fontWeight: "bold",
654:                 autoScale: true,
655:                 noWrap: true
...
661:                 x: 78.7, y: 22, width: 220, height: 36,
662:                 rotation: 0,
663:                 align: "center",
...
665:                 fontSize: 23,
666:                 fontFamily: "Inter, sans-serif",
667:                 fontWeight: "bold",
668:                 autoScale: true,
669:                 noWrap: true
...
675:                 x: 75.6, y: 49.8, width: 220, height: 35.1,
676:                 rotation: 0,
677:                 align: "center",
...
679:                 fontSize: 23,
680:                 fontFamily: "Inter, sans-serif",
681:                 autoScale: true,
682:                 noWrap: true
...
688:                 x: 77, y: 79.6, width: 218.6, height: 25.3,
689:                 rotation: 0,
690:                 align: "center",
...
692:                 fontSize: 15,
693:                 fontFamily: "Inter, sans-serif",
694:                 fontWeight: "bold",
695:                 autoScale: true,
696:                 noWrap: true
...
702:                 x: 24, y: 12, width: 73, height: 73,
703:                 rotation: 0,
704:                 imageData: "{{AXO_IMAGE}}"
...
710:                 x: 291.2, y: 5, width: 95, height: 95,
711:                 rotation: 0,
712:                 qrData: "{{QR DATA}}"
...
718:                 x: 24.4, y: 101.6, width: 361.9, height: 138.4,
719:                 rotation: 0,
720:                 barcodeData: "{{TAG ID}}",
... (capped at 170 lines)
```

### PackingModule label bits (`src/features/logistics/PackingModule.tsx`, 1427 lines)
```
21: import Barcode from 'react-barcode';
22: import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
23: import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, collectAllImages } from '../../lib/utils';
24: import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
25: import { vendors } from '../../lib/consts';
...
36:     isTemplate: true,
37:     labelSize: { width, height },
38:     templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "MATERIAL COLOR"],
39:     elements: [
40:         {
...
153: 
154:     // Expand by QUANTITY * multiplier — designer prints one label per templateData record
155:     const templateData = baseRecords.flatMap(r =>
156:         Array.from({ length: (Number(r["QUANTITY"]) || 1) * multiplier }, () => ({ ...r }))
157:     );
...
296:                     <div className="flex flex-col gap-3">
297:                         <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{tr("Batch Identity")}</label>
298:                         <input
299:                             type="text"
300:                             value={name}
...
408:     const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
409:     const [labelSize, setLabelSize] = useAtom(packingLabelSizeAtom);
410:     const [isConfigExpanded, setIsConfigExpanded] = useAtom(isPackingFiltersOpenAtom);
411:     const [vendorFilter, setVendorFilter] = useAtom(packingVendorFilterAtom);
412:     const [isPrintWizardOpen, setIsPrintWizardOpen] = useAtom(isPackingPrintWizardOpenAtom);
...
540:         const timer = setTimeout(() => {
541:             const batch = buildBatchJSON([activeItem], workbookPrefix, labelSize);
542:             iframe.contentWindow?.postMessage({
543:                 type: 'LOAD_DESIGN',
544:                 payload: {
545:                     elements: batch.elements,
546:                     labelSize: batch.labelSize,
547:                     templateData: batch.templateData
548:                 }
549:             }, '*');
...
551:         return () => clearTimeout(timer);
552:     }, [activeItem, activeItemIndex, workbookPrefix, labelSize]);
553: 
554:     const toggleSelect = (id: string) => {
555:         const newSet = new Set(selectedIds);
...
670:         try {
671:             const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 1);
672:             const blob = new Blob([JSON.stringify(batchProject, null, 2)], { type: 'application/json' });
673:             const url = URL.createObjectURL(blob);
674:             try {
...
702:             // STEP 2: Build JSON Project (Multiplier = 2)
703:             const batchProject = buildBatchJSON(selectedItems, workbookPrefix, labelSize, 2);
704:             try {
705:                 localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
706:             } catch (storageError) {
...
737:                                 filePrintDate: new Date().toISOString(),
... (capped at 60 lines)
```

### crateManifesto label bits (`src/lib/crateManifesto.ts`, 1059 lines)
```
6: import { jsPDF } from 'jspdf';
7: import QRCode from 'qrcode';
8: import { cmToImperial, extractItemHexString, getTextColorForBg } from './utils';
9: import { getVendorColor } from './excelStyles';
10: import { generateAxonometricDataUrl, resolveItemColor } from './axonometric';
...
27:     dbItemCount: number;      // Total quantity in DB for this item
28:     packetIn?: string;        // NEW: Labels of crates/pallets containing this item
29:     boxLabel?: string;        // NEW: Specific cardboard box containing this item
30: }
31: 
32: export interface ManifestoMeta {
...
54:     allTruckCrates?: Array<{
55:         id: string; label: string; type: string; dims: string; weight: number; color: string;
56:         l: number; w: number; h: number; parentLabel?: string;
57:     }>;
58:     truckStats?: {
59:         totalWeight: number;
...
83:     try {
84:         return await QRCode.toDataURL(text.replace(/\s+/g, ''), { errorCorrectionLevel: 'H', margin: 0, width: sizePx, color: { dark: '#141414', light: '#ffffff' } });
85:     } catch (e) {
86:         console.error('QR code err', e);
87:         return null;
...
251: 
252:     const sortedItems: Array<ManifestoItem | { isHeader: boolean; label: string }> = [];
253: 
254:     if (meta.sortByTagDesc) {
255:         // Sort by itemId (Tag ID) descending
...
551:         const fy = sy + 6;
552:         const drawField = (label: string, val: string, w: number) => {
553:             doc.setFontSize(6); doc.setTextColor(...TEXT_LO); doc.setFont('helvetica', 'bold'); doc.text(label, fx, fy);
554:             doc.setFontSize(11); doc.setTextColor(...TEXT_HI); doc.setFont('helvetica', 'bold'); doc.text((val || '—').toUpperCase(), fx, fy + 8);
555:             fx += w;
556:         };
...
653:                 doc.setTextColor(cr, cg, cb); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
... (capped at 40 lines)
```
