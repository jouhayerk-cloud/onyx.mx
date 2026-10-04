# Supabase tracking of printing, labelling, packing, shipping: digest

Script-generated, line-numbered.

### database.types.ts: print_jobs, print_job_items (`src/lib/database.types.ts`, 1353 lines)
```
968:       print_job_items: {
969:         Row: {
970:           id: string
971:           inventory_id: string | null
972:           job_id: string
973:           labels_printed: number
974:           tag_id: string | null
975:         }
976:         Insert: {
977:           id?: string
978:           inventory_id?: string | null
979:           job_id: string
980:           labels_printed?: number
981:           tag_id?: string | null
982:         }
983:         Update: {
984:           id?: string
985:           inventory_id?: string | null
986:           job_id?: string
987:           labels_printed?: number
988:           tag_id?: string | null
989:         }
990:         Relationships: [
991:           {
992:             foreignKeyName: "print_job_items_job_id_fkey"
993:             columns: ["job_id"]
994:             isOneToOne: false
995:             referencedRelation: "print_jobs"
996:             referencedColumns: ["id"]
997:           },
998:         ]
999:       }
1000:       print_jobs: {
1001:         Row: {
1002:           checksum: string | null
1003:           id: string
1004:           is_reprint: boolean
1005:           item_count: number
1006:           label_count: number
1007:           label_size: string | null
1008:           notes: string | null
1009:           printed_at: string
1010:           printed_by: string | null
1011:           source: string
1012:         }
1013:         Insert: {
1014:           checksum?: string | null
1015:           id: string
1016:           is_reprint?: boolean
1017:           item_count?: number
1018:           label_count?: number
1019:           label_size?: string | null
1020:           notes?: string | null
1021:           printed_at?: string
1022:           printed_by?: string | null
1023:           source?: string
1024:         }
1025:         Update: {
1026:           checksum?: string | null
1027:           id?: string
1028:           is_reprint?: boolean
1029:           item_count?: number
1030:           label_count?: number
1031:           label_size?: string | null
1032:           notes?: string | null
1033:           printed_at?: string
1034:           printed_by?: string | null
1035:           source?: string
1036:         }
1037:         Relationships: []
1038:       }
1039:       production: {
1040:         Row: {
1041:           advance: number | null
1042:           description: string | null
1043:           hidden_reason: string | null
1044:           id: string
1045:           is_hidden: boolean | null
1046:           price_unit: number | null
1047:           progress: number | null
1048:           quantity: number | null
1049:           rating: number | null
1050:           ready_date: string | null
1051:           status: string | null
1052:           tag_id: string | null
1053:           total: number | null
1054:           updated_at: string | null
1055:           vendor_id: string | null
1056:         }
1057:         Insert: {
1058:           advance?: number | null
1059:           description?: string | null
1060:           hidden_reason?: string | null
1061:           id?: string
1062:           is_hidden?: boolean | null
```

### database.types.ts: shipments, logistics (`src/lib/database.types.ts`, 1353 lines)
```
706:       logistics: {
707:         Row: {
708:           carrier: string | null
709:           contents_summary: string | null
710:           cost_mxn: number | null
711:           crate_count: number | null
712:           customs_status: string | null
713:           date: string | null
714:           description: string | null
715:           destination_address: string | null
716:           freight_cost: number | null
717:           height_cm: number | null
718:           id: string
719:           insurance_value: number | null
720:           inventory_ids: string | null
721:           length_cm: number | null
722:           origin: string | null
723:           pallet_count: number | null
724:           parent_id: string | null
725:           pay_req: string | null
726:           quantity: number | null
727:           ship_date: string | null
728:           status: string | null
729:           tracking_number: string | null
730:           truck_id: string | null
731:           truck_position: string | null
732:           type: string | null
733:           updated_at: string | null
734:           vendor_id: string | null
735:           vendors: string | null
736:           weight_kg: number | null
737:           width_cm: number | null
738:         }
739:         Insert: {
740:           carrier?: string | null
741:           contents_summary?: string | null
742:           cost_mxn?: number | null
743:           crate_count?: number | null
744:           customs_status?: string | null
745:           date?: string | null
746:           description?: string | null
747:           destination_address?: string | null
748:           freight_cost?: number | null
749:           height_cm?: number | null
750:           id?: string
...
1111:       shipments: {
1112:         Row: {
1113:           id: string
1114:           manifest_id: string
1115:           metadata: Json | null
1116:           payload: Json | null
1117:           timestamp: string | null
1118:           updated_at: string
1119:         }
1120:         Insert: {
1121:           id?: string
1122:           manifest_id: string
1123:           metadata?: Json | null
1124:           payload?: Json | null
1125:           timestamp?: string | null
1126:           updated_at?: string
1127:         }
1128:         Update: {
1129:           id?: string
1130:           manifest_id?: string
1131:           metadata?: Json | null
1132:           payload?: Json | null
1133:           timestamp?: string | null
1134:           updated_at?: string
1135:         }
1136:         Relationships: []
1137:       }
1138:     }
1139:     Views: {
1140:       [_ in never]: never
1141:     }
1142:     Functions: {
1143:       get_my_app_role: { Args: never; Returns: string }
1144:       get_my_vendor_prefix: { Args: never; Returns: string }
1145:       inventory_normalise_type: { Args: { raw: string }; Returns: string }
1146:       issue_device_token: { Args: { p_device_id: string }; Returns: string }
1147:       link_onyxchan_device: {
1148:         Args: { p_device_id: string; p_user_id: string }
1149:         Returns: undefined
1150:       }
1151:       onyx_cypher: { Args: { n: number }; Returns: string }
1152:       onyx_round: { Args: { n: number }; Returns: number }
1153:       record_device_heartbeat: {
1154:         Args: { p_battery?: number; p_device_id: string; p_rssi?: number }
1155:         Returns: undefined
```

### LabelWizard checksum and job logging (`src/features/logistics/LabelWizard.tsx`, 1862 lines)
```
39: import { PdfPreview, PdfDocumentSource } from '../../components/PdfPreview';
40: import { supabase } from '../../lib/supabase';
41: 
42: /* ─── NFC Tags HUD Component ─── */
43: import { ScannerCenter } from '../../components/ScannerCenter';
44: import { PreviewLabels } from '../../components/PreviewLabels';
45: import { tr } from '../../lib/i18n';
...
74:         const idsArray = usePacking
75:             ? Array.from(packingIds)
76:             : (invIds.length > 0 ? invIds : Array.from(packingIds));
77: 
78:         const idStrings = new Set(idsArray.map(String));
79: 
80:         return inventory
81:             .filter(item => {
...
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
...
474:     const [lastPrintJob, setLastPrintJob] = React.useState<{
475:         jobId: string; labelCount: number; itemCount: number; at: string; isReprint: boolean;
476:     } | null>(null);
477: 
478:     /**
479:      * Records a completed job. Called only from the designer's PRINT_COMPLETE,
480:      * which fires inside its !isPrintCancelled() guard — so a row here means
...
502:         try {
503:             const { error: jobErr } = await supabase.from('print_jobs').insert({
504:                 id: job.jobId,
505:                 checksum: job.checksum,
506:                 printed_at: stamp,
507:                 printed_by: user?.email || user?.name || null,
508:                 label_count: labelCount,
509:                 item_count: job.ids.length,
510:                 is_reprint: isReprint,
...
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
...
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
...
783:         const templateData = baseRecords.flatMap(r =>
784:             Array.from({ length: (Number(r["QUANTITY"]) || 1) }, () => ({ ...r }))
785:         );
786: 
787:         return {
788:             ...(activeLabelSize === '50x50' ? ONYX_MASTER_TEMPLATE_50x50(width, height, logoVariant) : ONYX_MASTER_TEMPLATE_V4(width, height)),
789:             name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
...
811:             // would record every opened wizard as a printed tag, which is the
812:             // opposite of what the checksum is for.
813:             const tagById: Record<string, string> = {};
814:             selectedItems.forEach((it: any) => {
815:                 const id = it.row ?? it.data?.id ?? it.id;
816:                 if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
817:             });
...
820:                 tagById,
821:                 checksum: await computeJobChecksum(batchProject),
822:                 jobId: `PJ-${Date.now().toString(36).toUpperCase()}`,
823:                 isReprint,
824:             };
825: 
826:             setIsPrintWorkflowOpen(true);
827:             setActiveSlide(1);
...
859:             // The engine reports a finished job. This is the confident path:
860:             // a checksum written from here means tags physically printed.
861:             if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
862:                   commitPrintJob(event.data.payload || {}, 'designer reported PRINT_COMPLETE');
863:               }
864:             if (event.data?.type === 'CLOSE_WIZARD') {
865:                   // Fallback: the current print engine emits no completion
...
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
...
1252:                                             <div className="w-4 flex flex-col justify-between items-center py-1">
1253:                                                 {Array.from(tr("MADE IN MEXICO")).map((char, i) => (
1254:                                                     <span key={i} className="text-[6px] font-black leading-none">{char}</span>
1255:                                                 ))}
1256:                                             </div>
1257:                                             {/* Axometric Icon */}
1258:                                             <div className="w-10 h-16 flex items-center justify-center">
...
1510:                                             <div className="w-4 flex flex-col justify-between items-center py-1">
1511:                                                 {Array.from(tr("MADE IN MEXICO")).map((char, i) => (
1512:                                                     <span key={i} className="text-[6px] font-black leading-none">{char}</span>
1513:                                                 ))}
1514:                                             </div>
1515:                                             {/* Axometric Icon */}
... (capped at 150 lines)
```

### database.ts print provenance (`src/lib/database.ts`, 568 lines)
```
204:         spatial_masks: { type: ['array', 'null'], items: { type: 'object' } },
205:         spatial_boxes_3d: { type: ['array', 'null'], items: { type: 'object' } },
206:         invoice_id: { type: ['string', 'null'] },
207:         print_date: { type: ['string', 'null'] },
208:         pay_req: { type: ['string', 'boolean', 'null'] },
209:         pay_date: { type: ['string', 'null'] },
210:         sent_notes: { type: ['string', 'null'] },
211:         sent_pack: { type: ['string', 'null'] },
212:         sent_date: { type: ['string', 'null'] },
213:         // Processing stamps. pack_date is new; sent_manifest_id existed in the
...
215:         // silently failed to record a ship date.
216:         pack_date: { type: ['string', 'null'] },
217:         sent_manifest_id: { type: ['string', 'null'] },
218:         // Print provenance: a checksum means the tag physically printed, as
219:         // opposed to a date which only means the wizard ran.
220:         print_job_checksum: { type: ['string', 'null'] },
221:         print_job_id: { type: ['string', 'null'] },
222:         payment_requested_at: { type: ['string', 'null'] },
223:         // Derived server-side and read-only. Synced so the client can filter
224:         // on them without recomputing the ladder in a dozen components.
225:         lifecycle_status: { type: ['string', 'null'] },
226:         payment_status: { type: ['string', 'null'] },
227:         shipped: { type: ['boolean', 'null'] },
```

### inventoryCreate print provenance (`src/lib/inventoryCreate.ts`, 574 lines)
```
11:  * empty text ('' / undefined / null), on an empty price (0 / null), on whether
12:  * created_by and updated_at were written at all, and on the exchange rate. All
13:  * three wrote the '-' sentinel into book_barcode and book_aq_code when there
14:  * was no price, which the book-fields trigger then took for a printed barcode
15:  * and never filled in. And the wizard's edit was an upsert by a fresh uuid, so
16:  * a row from the production table came back as a duplicate inventory row.
17:  *
18:  * Rules applied here once:
19:  *
20:  *   · Numbering is per vendor PER WORKBOOK: item_id VENDOR-NNN is unique only
21:  *     inside a book, so every lookup carries both.
22:  *   · Book codes use DEFAULT_EXCHANGE_RATE (17), never the editable or live
23:  *     rate, so the client shows what the database trigger stores.
24:  *   · An existing book_barcode is never recomputed or rewritten: it is
25:  *     printed on a label. An edit leaves the column out of the patch, and
26:  *     also when a label was printed without one being stored (labelPrinted).
27:  *   · No '-' or '—' sentinel is ever stored; an unknown code is NULL, which
28:  *     the trigger can still fill.
29:  *   · Rows are written by uuid. Edits are an UPDATE by id, never an upsert.
30:  */
31: import { supabase } from './supabase';
32: import { getDatabase } from './database';
33: import { DEFAULT_EXCHANGE_RATE } from './consts';
34: import { calculateCodesAndPrices } from './utils';
...
140: };
141: 
142: /**
143:  * The row's own printed barcode, or null. Read from the raw column, never
144:  * from normalizeInventoryData, whose book_barcode falls back to tag_id /
145:  * item_id ("AN-001"); a workbook id has a dash, a barcode never does.
146:  */
147: export function storedBarcodeOf(row: Record<string, any> | null | undefined): string | null {
148:     const raw = String(row?.book_barcode ?? row?.bookBarcode ?? '').trim();
149:     if (!raw || raw.includes('-') || raw.includes('—')) return null;
150:     return raw;
151: }
152: 
153: /**
154:  * Has a label been printed for this row? A stored barcode says so, and so do
155:  * the print records: LabelWizard prints the barcode it computes and writes
156:  * only print_date / print_job_checksum / print_job_id back (the trigger keeps
157:  * labels_printed_total), so a row printed while book_barcode was NULL or the
158:  * old '-' placeholder has a label in the field and no stored barcode. Such a
159:  * row's vendor and number are on that label, and no client recompute may
160:  * write a barcode for it that could differ from the one printed.
161:  */
162: export function labelPrinted(row: Record<string, any> | null | undefined): boolean {
163:     if (!row) return false;
164:     if (storedBarcodeOf(row)) return true;
... (capped at 50 lines)
```

### seasons.ts (826) (`src/lib/seasons.ts`, 70 lines)
```
1: /**
2:  * Season resolution shared by the Inventory and Finance modules.
3:  *
4:  * The app syncs two generations of tables at once:
5:  *   - the 826 season  → inventory_826 / finance_826 / logistics_826
6:  *   - legacy seasons  → inventory / finance / logistics  (workbook v326, v825)
7:  *
8:  * The *_826 tables have no workbook column and the finance tables have no season
9:  * column at all, so every row is stamped with its season at sync time based on the
10:  * table it came from (see getSeasonSources in database.ts).
11:  */
12: 
13: export type Season = '826' | 'legacy';
14: 
15: /** Workbook values belonging to the archived seasons. */
16: const LEGACY_WORKBOOKS = new Set(['v325', 'v326', 'v825', '325', '326', '825']);
17: 
18: /** Normalises a raw workbook value ("v326", "326", "V326") to a Season. */
19: export const seasonFromWorkbook = (workbook: unknown): Season | null => {
20:     if (workbook == null) return null;
21:     const wb = String(workbook).trim().toLowerCase();
22:     if (!wb) return null;
23:     if (wb === 'v826' || wb === '826') return '826';
24:     return LEGACY_WORKBOOKS.has(wb) ? 'legacy' : null;
25: };
26: 
27: /**
28:  * Season of a synced row. The row's own workbook wins when it is conclusive — a
29:  * v826 row sitting in the legacy table is still 826 — otherwise we fall back to
30:  * the season of the table it was pulled from.
31:  */
32: export const resolveSeason = (row: any, sourceSeason: Season): Season =>
33:     seasonFromWorkbook(row?.workbook) ?? sourceSeason;
34: 
35: /**
36:  * Season of a row already in the local database. Rows written before the season
37:  * stamp existed are inferred from their workbook, defaulting to legacy.
38:  */
39: export const rowSeason = (row: any): Season => {
40:     const stamped = row?.season;
41:     if (stamped === '826' || stamped === 'legacy') return stamped;
42:     return seasonFromWorkbook(row?.workbook) ?? 'legacy';
43: };
44: 
45: /** True when a row belongs to an archived season (825/326). */
46: export const isLegacyRow = (row: any): boolean => rowSeason(row) === 'legacy';
47: 
48: /* ── Per-workbook visibility ──────────────────────────────────────────────
49:    The single "hide archive" boolean collapsed three seasons into two states:
50:    826-only, or everything. These let each workbook be toggled on its own, so
51:    825 can be reviewed without dragging 326 along with it. */
52: 
53: export type WorkbookId = 'v825' | 'v326' | 'v826';
54: 
55: export const WORKBOOK_IDS: WorkbookId[] = ['v825', 'v326', 'v826'];
56: 
57: /**
58:  * Which workbook a synced row belongs to. The row's own workbook value wins
59:  * when it is conclusive; otherwise the season stamp decides, exactly as
60:  * rowSeason does. 325 folds into 326 — it is the same archived season under an
... (capped at 60 lines)
```

### Packing and trucking persistence (`src/features/logistics/PackingModule.tsx`, 1427 lines)
```
150:             "QR URL": `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`
151:         };
152:     });
...
156:         Array.from({ length: (Number(r["QUANTITY"]) || 1) * multiplier }, () => ({ ...r }))
157:     );
158: 
...
187:                 const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
188: 
189:                 return [
...
519:         return Array.from(vendorSet).sort();
520:     }, [inventory, exchangeRate, workbookPrefix]);
521: 
...
583:                 const qrUrl = `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${c.bookBarcode}`;
584:                 return [c.bookBarcode, desc, matColor, sizes, d.quantity || 1, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
585:             });
...
694:         const ids = Array.from(selectedIds);
695:         setLastPrintedIds(ids);
696: 
```

### Trucking persistence (`src/features/logistics/TruckingModule.tsx`, 5065 lines)
```
1881:     const [progress, setProgress] = useState({ manifesto: -1, pdf: -1, packed: -1, allCrates: -1, allCratesImages: -1 });
1882:     const [urls, setUrls] = useState({ manifesto: '', pdf: '', packed: '', allCrates: '', allCratesImages: '' });
1883:     const [includePhotos, setIncludePhotos] = useState(true);
1884: 
...
1935:         setProgress(p => ({ ...p, manifesto: 5 }));
1936:         const items = buildConsolidatedItems();
1937:         const wb = new ExcelJS.Workbook();
...
1948:             setProgress(p => ({ ...p, manifesto: 5 + Math.round((idx / items.length) * 80) }));
1949:             const inv = item.inv;
1950:             const data = inv.data || {};
...
1960:         setProgress(p => ({ ...p, manifesto: 95 }));
1961:         const buffer = await wb.xlsx.writeBuffer();
1962:         const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
...
1964:             setUrls(u => ({ ...u, manifesto: URL.createObjectURL(blob) }));
1965:             setProgress(p => ({ ...p, manifesto: 100 }));
1966:         } else {
1967:             setProgress(p => ({ ...p, manifesto: -1 }));
1968:             toast.error(tr("Failed to generate Excel file"));
1969:         }
...
1973:         const tid = toast.loading(tr("Generating consolidated trailer manifest..."));
1974:         setProgress(p => ({ ...p, pdf: 5 }));
1975:         try {
...
1989:             const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
1990:                 const inv = item.inv;
1991:                 const data = inv.data || {};
...
2055:             const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
2056:             if (blob) {
2057:                 setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) }));
...
2245:                             id="manifesto" title={tr("Consolidated Manifesto")} type="XLSX" color="#3b82f6" icon={FileSpreadsheet}
2246:                             desc="Global inventory list with all items combined. Best for accounting."
2247:                             prog={progress.manifesto} url={urls.manifesto} onGenerate={generateManifesto} onDownload={triggerDownload} filename={`${name}_Consolidated_Manifesto.xlsx`}
2248:                         />
2249:                         <ExportCard
...
2262:                             desc="Combined PDF of all individual crate manifestos. (No photos)."
2263:                             prog={progress.allCrates} url={urls.allCrates} onGenerate={() => generateAllManifestos(false)} onDownload={triggerDownload} filename={`${name}_All_Crates_Manifesto.pdf`}
2264:                         />
...
2608:             const manifestoItems: ManifestoItem[] = items.map((item, idx) => {
2609:                 const inv = item.inv; const data = inv.data || {};
2610:                 const norm = normalizeInventoryData(inv);
...
2662:             const blob = await exportCrateManifesto(manifestoItems, meta, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob') as Blob;
2663:             if (blob) { setUrls(u => ({ ...u, pdf: URL.createObjectURL(blob) })); setProgress(p => ({ ...p, pdf: 100 })); toast.success(tr("Manifest ready"), { id: tid }); }
2664:         } catch (err: any) { setProgress(p => ({ ...p, pdf: -1 })); toast.error(err.message || 'Failed', { id: tid }); }
...
2847:             const manifestId = `ONYX MX - ${dateStr}`;
2848:             const extraWeight = (fields.packingItems || []).reduce((s:number, i:any) => s + (i.weight || 0) * (i.count || 1), 0);
2849:             const finalTotalWeight = totalWeight + extraWeight;
...
2902:             const htmlContent = generatePackingListHtml(manifestId, fields, shipmentPayload);
2903:             const blob = new Blob([htmlContent], { type: 'text/html' });
2904:             if (blob) {
...
3158:                                             /* if (recalledShipment?.manifest_id) {
3159:                                                 setSentTruckId(recalledShipment.manifest_id);
3160:                                                 setView('truck');
3161:                                             } else {
...
3507:                     const { data, error } = await supabase.from('shipments')
3508:                         .select('*')
3509:                         .order('timestamp', { ascending: false })
...
3513:                 } catch (err) { console.error('Recent shipments fetch error:', err); }
3514:                 finally { setLoadingShipments(false); }
3515:             };
...
3547:             notify.success(`Recalled manifest ${shipment.manifest_id}`);
3548:             setTopBarState('crates');
3549:         } catch (e) { notify.error(tr("Failed to recall shipment")); }
...
3938:                 const { error: err } = await supabase.from('logistics').update({
... (capped at 80 lines)
```
