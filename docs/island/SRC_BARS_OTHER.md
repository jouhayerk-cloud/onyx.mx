# Source of the other modules top bar controls (extracted from src/features/core/MainHeader.tsx)

Script-extracted, verbatim, with MainHeader.tsx line numbers. First the import block (every atom, icon and helper name), then each bar component.

## Import block (lines 1-112)
```ts
1: import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
2: import type { InventoryItemData } from '../../lib/Types';
3: // Navigation Modernization - Atomic Sync Force
4: import React, { useState, useMemo, useEffect } from 'react';
5: import { createPortal } from 'react-dom';
6: import {
7:     activeViewAtom,
8:     inventoryAtom,
9:     inventoryActiveFilterAtom,
10:     inventorySearchTermAtom,
11:     TOP_BAR_SEARCH_ATOM,
12:     inventoryStatusFilterAtom,
13:     showFinancialsAtom,
14:     dashboardStatusFilterAtom,
15:     dashboardSearchTermAtom,
16:     userAtom,
17:     isDetailsPanelOpenAtom,
18:     SelectedItemDataAtom,
19:     TrafficLightStatus,
20:     logisticsSubTabAtom,
21:     financeSubTabAtom,
22:     uploadItemDataAtom,
23:     shippingCameraViewAtom,
24:     shippingCratesAtom,
25:     shippingTruckDimsAtom,
26:     truckMaxWeightAtom,
27:     shippingViewModeAtom,
28:     sidebarStateAtom,
29:     triggerWarehouseOrganizationAtom,
30:     exchangeRateAtom,
31:     InventoryVersionAtom,
32:     inventoryViewModeAtom,
33:     filteredInventoryCountAtom,
34:     filteredInventoryTotalQtyAtom,
35:     filteredInventoryTotalValueAtom,
36:     filteredInventoryIdsAtom,
37:     inventoryArtifactConfigAtom,
38:     financeDataAtom,
39:     isUploadWizardOpenAtom,
40:     languageAtom,
41:     themeAtom,
42:     performanceModeAtom,
43:     paymentsOverviewModeAtom,
44:     paymentDestinationFilterAtom,
45:     liveExchangeRateAtom,
46:     currencyModeAtom,
47:     logisticsDataAtom,
48:     storeSearchTermAtom,
49:     storeActiveVendorFilterAtom,
50:     storeViewModeAtom,
51:     storeVendorOptionsAtom,
52:     storeShoppingBagAtom,
53:     isStoreBagOpenAtom,
54:     activeVendorsAtom,
55:     inventoryVendorFilterAtom,
56:     isInventoryVendorFilterOpenAtom,
57:     isInventoryFiltersPanelOpenAtom,
58:     isInventoryViewSliderOpenAtom,
59:     isInventorySelectionModeAtom,
60:     selectedInventoryIdsAtom,
61:     inventoryViewSliderAtom,
62:     isInventorySearchOpenAtom,
63:     isInventorySortMenuOpenAtom,
64:     inventoryExportSelectedXLSXTriggerAtom,
65:     financeSearchTermAtom,
66:     paymentVendorFilterAtom,
67:     isPaymentVendorFilterOpenAtom,
68:     isPaymentDestinationFilterOpenAtom,
69:     paymentCategoryFilterAtom,
70:     isPaymentCategoryFilterOpenAtom,
71:     PaymentCategory,
72:     paymentFilterBarModeAtom,
73:     processActiveTabAtom,
74:     packingViewModeAtom,
75:     packingVendorFilterAtom,
76:     packingLabelSizeAtom,
77:     isPackingPrintWizardOpenAtom,
78:     packingExportPDFTriggerAtom,
79:     packingExportXLSXTriggerAtom,
80:     packingExportJSONTriggerAtom,
81:     isPackingFiltersOpenAtom,
82:     isPackingNFCWizardOpenAtom,
83:     truckReadyTriggerAtom,
84:     truckIsBusyAtom,
85:     truckViewModeAtom,
86:     truckShowSaveDraftAtom,
87:     truckShowOpenDraftAtom,
88:     truckShowExportModalAtom,
89:     truckShowReadyWizardAtom,
90:     truckShowPanelsAtom,
91:     packingSelectedIdsAtom,
92:     isStudioSettingsOpenAtom,
93:     isPaymentsSearchOpenAtom,
94:     isPaymentFiltersOpenAtom,
95:     isPaymentActionPanelOpenAtom,
96:     isPaymentUpcomingOpenAtom,
97:     isPaymentWizardOpenAtom,
98:     isCrateCreationModalOpenAtom,
99:     isBotOrbOpenAtom,
100:     sentTruckIdAtom,
101:     onyxApiKeyAtom,
102:     isWarehouseSelectionModeAtom,
103:     warehouseSelectedIdsAtom,
104:     showWarehouseExportWizardAtom,
105:     visibleWorkbooksAtom,
106:     inventoryToolsOpenAtom,
107:     isInventorySmartFiltersOpenAtom
108: } from '../../lib/atoms';
109: import { isAiProcessingEnabledAtom } from '../../lib/atoms';
110: import { WORKBOOK_IDS, type WorkbookId } from '../../lib/seasons';
111: // Consolidated imports to prevent duplicates
112: 
```

## OnyxBar (lines 113-446)
```tsx
113: const OnyxBar: React.FC = () => null;
114: 
115: import { vendors , DEFAULT_EXCHANGE_RATE} from '../../lib/consts';
116: import { missingShopifyFields, SHOPIFY_REQUIRED_FIELDS, type ShopifyField } from '../../lib/aiContent';
117: import { calculateCodesAndPrices, normalizeInventoryData, collectAllImages, collectExportImages, getProductCategoryAndType, isAllowedProductType, formatProductTitle, normalizeBrandTerms, formatDimensionsImperial, formatWeightImperial, formatDimensionsMetricOnly, formatDimensionsImperialOnly, formatWeightMetricOnly, formatWeightImperialOnly, getStatusClass, getCleanImageUrl, toDriveDownloadUrl, syncAllCalculatedFieldsToDB } from '../../lib/utils';
118: import { getStoneStyleColors, generateFallbackMarketingHtml, ALLOWED_SHOPIFY_COLORS } from '../../lib/colorExtractor';
119: import { lookupCanonicalColors } from '../../lib/colorVocabulary';
120: import { inventoryStatusSetsAtom } from '../../lib/inventoryStatusAtom';
121: import { destinationsConfig } from '../../lib/paymentConfig';
122: import { useTranslation, useLogout, useDatabase } from '../../lib/hooks';
123: 
124: import { CameraView } from '../../lib/Types';
125: import ExcelJS from 'exceljs';
126: import { getStatusColor, getCategoryColor, getVendorColor, getContrastColor, EXCEL_STYLES } from '../../lib/excelStyles';
127: import { sanitizeExcelRow } from '../../lib/xlsxUtils';
128: import { saveAs } from 'file-saver';
129: import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
130: import toast from '../onyxIsland/notify/toast';
131: import userIcons from '../../components/userIcons';
132: import { supabase } from '../../lib/supabase';
133: 
134: import {
135:     ArrowUpDown, ArrowUp, ArrowDown, Share2, Copy, ExternalLink, Layout, ShoppingBag,
136:     CreditCard, Truck, Upload, Shield, Search, RefreshCw, LogOut, LayoutGrid, 
137:     LayoutDashboard, List, Bookmark, Sun, Moon, Layers, Camera, Zap, Settings, 
138:     Download, DownloadCloud, Filter, ArrowUpRight, Check, X, ChevronRight, 
139:     ChevronLeft, Plus, Trash2, Grid, FileText, Database, Calendar, DollarSign, 
140:     Globe, Languages, Cpu, Clock, ArrowRight, Lock, Unlock, Printer,
141:     Landmark, Wallet, Play, Store, Package, MapPin, LayoutList,
142:     Target, Library, FolderKanban, FileJson, FileSpreadsheet, Nfc, ListFilter,
143:     Grid3x3, PanelTop, PanelTopClose, FolderOpen, Save, SlidersHorizontal, Archive,
144:     PackagePlus, Boxes, PackageOpen, History, Bot, Brain, Hourglass, SquareLibrary, Activity, FolderUp, DatabaseBackup, CloudUpload,
145:     Wrench, ClipboardClock, LayoutTemplate, Tag, Pointer, QrCode, Table
146: } from 'lucide-react';
147: 
148: // ⚡ Dynamic import — themes-assets.ts is 878KB of base64 images.
149: // Loading it asynchronously prevents it from blocking the initial JS parse.
150: // The swatch images are non-critical (shown in the settings sidebar only).
151: 
152: import { ShoppingBagDrawer } from '../store/ShoppingBagDrawer';
153: import { tr } from '../../lib/i18n';
154: import { IslandBand } from '../onyxIsland/IslandBand';
155: import { ArchivedBar, ArchivedReadout } from '../archived/ArchivedChrome';
156: import { ArchivedToolsRegistrar } from '../archived/archivedTools';
157: import { InventoryToolsRegistrar } from './inventoryTools';
158: import { islandCommandsEnabledAtom, useRegisterTools } from '../../lib/toolRegistry';
159: 
160: declare const __APP_VERSION__: string;
161: 
162: // ---------------------------------------------------------------------------
163: // Shopify colour normalisation (Matrixify import safety)
164: //
165: // 'Metafield: shopify.color-pattern' is a list.metaobject_reference, so
166: // Matrixify rejects any row whose value is not one of the store's approved
167: // colour metaobjects. In the 142-product file sent to Rare Earth Gallery, 26
168: // products carried values that cannot exist as metaobjects -- "Green Talan"
169: // (15), "Pink Zebra" (3), "green talan/black" (2), "Tehuacan Amber",
170: // "Pink Serpentine", "ICE", "BLUE", "eMPEROR", "Multicolor" -- because the
171: // export passed the manually entered workbook value or the AI's generated
172: // value straight through without validating it.
173: //
174: // generatedType is already run through isAllowedProductType() before it
175: // reaches the sheet, precisely because an unvalidated value broke an earlier
176: // import on a different column. Colour now gets the same treatment.
177: // ---------------------------------------------------------------------------
178: 
179: // Derived locally from ALLOWED_SHOPIFY_COLORS rather than importing the
180: // ShopifyColor alias, so this file depends on one exported symbol only.
181: type AllowedShopifyColor = typeof ALLOWED_SHOPIFY_COLORS[number];
182: 
183: // PROVISIONAL -- stone variety -> approved colours.
184: //
185: // These keys are stone varieties, not colours, so they can never be written to
186: // the colour-pattern metafield as they stand. The colour sets below are our own
187: // reading of each stone and have NOT been confirmed by the client. Stefi
188: // Helfand at Rare Earth Gallery has been asked to confirm the mappings; revise
189: // this table when she answers, and treat any value here as a placeholder until
190: // then.
191: /**
192:  * What a stone variety looks like, for values colorVocabulary does not cover.
193:  *
194:  * Only BASE varieties belong here. A qualified name resolves by composition --
195:  * "Pink Zebra" is the colour Pink plus what Zebra looks like -- so a composite
196:  * entry would only be another place for the two to disagree. That is not
197:  * theoretical: the old 'pink zebra' entry said Pink/Cream/Brown while 'zebra'
198:  * said black and white, and the composite silently won.
199:  *
200:  * Palettes are ordered by how apparent the colour is, because the export keeps
201:  * only the first MAX_SHOPIFY_COLORS of them.
202:  */
203: const STONE_VARIETY_COLORS: Record<string, AllowedShopifyColor[]> = {
204:     'talan': ['Green', 'Brown', 'Tan'],
205:     // Black and white striped onyx. It does not carry brown, whatever a
206:     // qualifier in front of it may add.
207:     'zebra': ['Black', 'White'],
208:     'amber': ['Orange', 'Yellow', 'Brown'],
209:     // "Ambar" is the Spanish spelling and it is what staff actually type.
210:     // normalizeBrandTerms corrects it for the description and the title but is
211:     // deliberately not applied to the colour column, so it is matched as stored.
212:     'ambar': ['Orange', 'Yellow', 'Brown'],
213:     'emperor': ['Brown', 'Gray', 'Cream'],
214:     'ice': ['Clear', 'White', 'Gray'],
215:     'pearlescent': ['Iridescent', 'White', 'Cream'],
216:     'nacar': ['Iridescent', 'White', 'Cream'],
217:     'cristaline': ['Clear', 'White'],
218:     'galaxy': ['Black', 'Gray', 'Multicolor'],
219:     // Season 826 vocabulary, entered ahead of the stock so the first item to
220:     // arrive exports correctly instead of falling through to a guess. Revise
221:     // these against the real stone when it lands.
222:     'cloud': ['White', 'Gray', 'Cream'],
223:     'cosmic': ['Black', 'Gray', 'Multicolor'],
224:     // Querétaro is a place, but unlike Tehuacán its stone reads one way, so it
225:     // carries a palette rather than deferring to a qualifier.
226:     'queretaro': ['Green', 'Brown'],
227: };
228: 
229: /**
230:  * Variety words that do not determine a colour, so the qualifier beside them
231:  * has to. Two kinds end up here.
232:  *
233:  * PATTERNS. "Serpentine" names the serpent-like striping and is an umbrella
234:  * over several colour families: Aqua Serpentine is a tan-brown-yellow onyx with
235:  * one large aqua vein that gives it its name, while Pink Serpentine is mainly
236:  * pink with fine black, white and yellow veins. Nothing about the word predicts
237:  * either. "Zebra" is the exception that stays in the table above -- also a
238:  * pattern, but always black and white.
239:  *
240:  * PLACES. Varieties named after WHERE the stone is quarried. They are real variety
241:  * names and must be recognised as such, but the place alone does not say what
242:  * the stone looks like: Tehuacán ships white, amber, grey, green and mint. So
243:  * these resolve to nothing on their own and let the qualifier decide --
244:  * "Guatemala Zebra" is black and white -- while a bare one has to be settled by
245:  * a person, the way bare "Tehuacan" was settled as White.
246:  *
247:  * A place only belongs here when its stone genuinely varies. Querétaro is also
248:  * a place but reads green and brown consistently, so it sits in the table above
249:  * with a palette of its own.
250:  */
251: const COLOURLESS_VARIETIES = ['tehuacan', 'guatemala', 'serpentine'];
252: 
253: // Longest key first, so a longer variety name is never shadowed by a shorter
254: // one it happens to contain.
255: const STONE_VARIETY_KEYS = Object.keys(STONE_VARIETY_COLORS).sort((a, b) => b.length - a.length);
256: 
257: // The client asked for "the 2-3 most apparent colours".
258: const MAX_SHOPIFY_COLORS = 3;
259: 
260: // Case-insensitive match that emits the approved list's own casing, so "BLUE"
261: // becomes "Blue" and "white" becomes "White" instead of being dropped.
262: //
263: // SETTLED: the client's colour-options file spells one value "Mulicolor",
264: // missing the t. That is a typo in the file, not the name of their metaobject,
265: // which is spelled correctly -- confirmed by Ramses. We emit "Multicolor"
266: // exactly as ALLOWED_SHOPIFY_COLORS spells it, and there is no substitution
267: // anywhere between this list and the sheet.
268: const canonicalShopifyColor = (token: string): AllowedShopifyColor | null => {
269:     const needle = String(token || '').trim().toLowerCase();
270:     if (!needle) return null;
271:     return ALLOWED_SHOPIFY_COLORS.find(c => c.toLowerCase() === needle) || null;
272: };
273: 
274: const matchStoneVariety = (token: string): string | null => {
275:     const needle = String(token || '').trim().toLowerCase();
276:     if (!needle) return null;
277:     return STONE_VARIETY_KEYS.find(key => needle === key || needle.includes(key))
278:         || COLOURLESS_VARIETIES.find(key => needle === key || needle.includes(key))
279:         || null;
280: };
281: 
282: // Splits on commas and semicolons, then on slashes -- but only where the slash
283: // is actually a separator. "Turquoise/Aqua" is itself one of the approved
284: // colours, so a segment that already canonicalises is never split further;
285: // splitting it blindly would turn a perfectly valid value into nothing.
286: const splitColorTokens = (raw: string): string[] => {
287:     const tokens: string[] = [];
288:     // Always try the widest thing that resolves before breaking it up, at each
289:     // level. "Turquoise/Aqua" and "Rose Gold" are single approved colours that
290:     // contain a separator, so splitting them blindly turns a valid value into
291:     // nothing.
292:     const push = (segment: string, depth: number) => {
293:         const t = segment.trim();
294:         if (!t) return;
295:         if (canonicalShopifyColor(t) || matchStoneVariety(t) === t.toLowerCase()) {
296:             tokens.push(t);
297:             return;
298:         }
299:         if (depth === 0) { t.split('/').forEach(x => push(x, 1)); return; }
300:         // Last resort: words. This is what lets a qualified name compose --
301:         // "Pink Zebra" becomes Pink plus Zebra's own palette, and a variety that
302:         // arrives next season resolves the moment its base name is in the table
303:         // above, without an entry per qualifier.
304:         const words = t.split(/\s+/);
305:         if (words.length > 1) { words.forEach(w => push(w, 2)); return; }
306:         tokens.push(t);
307:     };
308:     String(raw || '').split(/[,;]+/).forEach(part => push(part, 0));
309:     return tokens;
310: };
311: 
312: /**
313:  * Turns a raw colour string into values the colour-pattern metafield accepts.
314:  *
315:  * Splits on commas, semicolons and slashes; resolves each token against
316:  * ALLOWED_SHOPIFY_COLORS first, then against the stone-variety table; drops
317:  * anything still unresolved (an unknown value fails the whole row, so a shorter
318:  * list is always better than a rejected import). De-duplicates preserving
319:  * order and caps the result at MAX_SHOPIFY_COLORS.
320:  *
321:  * Also reports the first stone variety it recognised, so the caller can put
322:  * that name in the custom.variety column instead of discarding it.
323:  */
324: // Colours the STORE cannot accept, mapped to the nearest one it can.
325: //
326: // "Turquoise/Aqua" is part of Shopify's standard colour taxonomy, so it is a
327: // legitimate value and the classifier is right to produce it. Rare Earth
328: // Gallery's store simply has no metaobject for it, and a
329: // list.metaobject_reference silently drops a value it cannot resolve -- the
330: // import reports success and the field comes through empty. Grant confirmed on
331: // 9 Sep that Blue resolves and Turquoise/Aqua does not.
332: //
333: // This is a fact about their store, not about the stone, so it is applied here
334: // at the export boundary. Everywhere else in the app aqua serpentine is still
335: // aqua: the swatches, the catalogue filters and the AI classifier are unchanged.
336: // If they add the metaobject later, deleting this entry is the whole rollback.
337: const STORE_COLOR_SUBSTITUTIONS: Partial<Record<AllowedShopifyColor, AllowedShopifyColor>> = {
338:     'Turquoise/Aqua': 'Blue',
339: };
340: 
341: /** Substitutes unsupported colours and drops the duplicate that creates -- an
342:  *  item already carrying Blue must not come out as "Blue, Blue". */
343: const applyStoreColorSubstitutions = (
344:     colors: readonly AllowedShopifyColor[],
345: ): AllowedShopifyColor[] => {
346:     const out: AllowedShopifyColor[] = [];
347:     colors.forEach(c => {
348:         const mapped = STORE_COLOR_SUBSTITUTIONS[c] || c;
349:         if (out.indexOf(mapped) === -1) out.push(mapped);
350:     });
351:     return out;
352: };
353: 
354: const normalizeShopifyColors = (raw: string): { colors: AllowedShopifyColor[]; variety: string | null } => {
355:     const colors: AllowedShopifyColor[] = [];
356:     const varieties: string[] = [];
357: 
358:     // The whole value first. colorVocabulary covers every value the inventory
359:     // actually holds and is reviewed as a unit, so it beats reassembling an
360:     // answer token by token -- "Tehuacan" alone resolves to White there by a
361:     // decision nothing in the string itself could have told us, and a value
362:     // like "Cristaline Gray Amber" keeps the three colours that were reviewed
363:     // rather than whatever order its tokens happen to produce.
364:     const exact = lookupCanonicalColors(raw);
365:     if (exact) {
366:         return {
367:             colors: exact.slice(0, MAX_SHOPIFY_COLORS) as AllowedShopifyColor[],
368:             variety: matchStoneVariety(raw.trim().toLowerCase()),
369:         };
370:     }
371: 
372:     // Otherwise fall through: a value entered after the table was generated is
373:     // still worth resolving as far as its individual words allow.
374:     splitColorTokens(raw)
375:         .forEach(token => {
376:             const direct = canonicalShopifyColor(token);
377:             if (direct) {
378:                 if (!colors.includes(direct)) colors.push(direct);
379:                 return;
380:             }
381:             const key = matchStoneVariety(token);
382:             if (key) {
383:                 varieties.push(key);
384:                 // A place-name variety is recognised but has no palette of its
385:                 // own, so there is nothing to add -- the qualifier beside it is
386:                 // what carries the colour. Indexing blind here threw on the
387:                 // first such value and took the whole export down with it.
388:                 (STONE_VARIETY_COLORS[key] || []).forEach(c => {
389:                     if (!colors.includes(c)) colors.push(c);
390:                 });
391:             }
392:             // Anything still unresolved is dropped on purpose.
393:         });
394: 
395:     return { colors: colors.slice(0, MAX_SHOPIFY_COLORS), variety: varieties[0] || null };
396: };
397: 
398: // Fluorite and Nacar were retired; lib/atoms.tsx folds a persisted value for
399: // either one back to the surviving theme of the same brightness, so nothing
400: // here needs to keep a placeholder for them.
401: const DEFAULT_THEMES = [
402:     { name: 'talan', swatch: null as string | null },
403:     { name: 'aqua', swatch: null as string | null },
404: ];
405: 
406: const filterCycle: TrafficLightStatus[] = ['ALL', 'RED', 'YELLOW', 'GREEN'];
407: const filterConfig: Record<TrafficLightStatus, { icon: string; title: string }> = {
408:     ALL: { icon: '○', title: 'All items' },
409:     RED: { icon: '●', title: 'Approved, pending payment' },
410:     YELLOW: { icon: '●', title: 'Payment requested, unpaid' },
411:     GREEN: { icon: '●', title: 'Paid / Prepaid' },
412: };
413: 
414: const iconToLucide: Record<string, React.FC<any>> = {
415:     'store': ShoppingBag,
416:     'finance': CreditCard,
417:     'trucking': Truck,
418:     'upload': Upload,
419:     'shield': Shield,
420:     'search': Search,
421:     'refresh': RefreshCw,
422:     'logout': LogOut,
423:     'layout-grid': LayoutGrid,
424:     'layout-dashboard': LayoutDashboard,
425:     'list-bullet': List,
426:     'bookmark': Bookmark,
427:     'sun': Sun,
428:     'moon': Moon,
429:     'layers': Layers,
430:     'camera': Camera,
431:     'play': Play,
432:     'credit-card': CreditCard,
433:     'bank': Landmark,
434:     'wallet': Wallet,
435:     'package': Package,
436:     'boxes': Boxes,
437:     'package-open': PackageOpen,
438:     'package-plus': PackagePlus,
439:     'archive': Archive,
440:     'truck': Truck,
441:     'map-pin': MapPin,
442:     'download': Download,
443:     'history': History
444: };
445: 
446: 
```

## SubTabPills (lines 447-473)
```tsx
447: const SubTabPills: React.FC<{
448:     tabs: { id: string; label: string; icon?: string }[];
449:     active: string;
450:     onSelect: (id: string) => void;
451:     accentColor?: string;
452: }> = ({ tabs, active, onSelect, accentColor = 'var(--main-color)' }) => (
453:     <div className="flex items-end gap-1">
454:         {tabs.map(t => {
455:             const TabIcon = t.icon ? iconToLucide[t.icon] : null;
456:             return (
457:                 <div key={t.id} className="tool-cell flex flex-col items-center gap-1 shrink-0">
458:                     <button onClick={() => onSelect(t.id)}
459:                         aria-pressed={active === t.id}
460:                         title={t.label}
461:                         className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none"
462:                         style={active === t.id ? { color: accentColor } : {}}>
463:                         {TabIcon ? <TabIcon size={18} strokeWidth={2.2} /> : <span className="text-[10px] font-black">{t.label}</span>}
464:                     </button>
465:                     {TabIcon && (
466:                         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">{t.label}</span>
467:                     )}
468:                 </div>
469:             );
470:         })}
471:     </div>
472: );
473: 
```

## StudioAction (lines 474-497)
```tsx
474: const StudioAction: React.FC<{
475:     icon: any;
476:     label: string;
477:     onClick: () => void;
478:     active?: boolean;
479:     title?: string;
480:     color?: string;
481:     disabled?: boolean;
482:     className?: string;
483: }> = ({ icon: Icon, label, onClick, active, title, color = 'var(--main-color)', disabled, className = "" }) => (
484:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
485:         <button
486:             onClick={onClick}
487:             disabled={disabled}
488:             title={title || label}
489:             aria-pressed={active}
490:             className={`tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none disabled:opacity-30 disabled:pointer-events-none ${className}`}
491:         >
492:             <Icon size={18} strokeWidth={2.2} style={{ color: active ? color : undefined }} />
493:         </button>
494:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">{label}</span>
495:     </div>
496: );
497: 
```

## ModuleBadge (lines 539-547)
```tsx
539: const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
540:     const BadgeIcon = iconToLucide[icon] || Store;
541:     return (
542:         <div className="hidden sm:flex items-center gap-4 pr-6 border-r border-white/5 shrink-0 truncate">
543:             <BadgeIcon size={32} strokeWidth={2} style={{ color }} />
544:         </div>
545:     );
546: };
547: 
```

## ShippingStats (lines 548-588)
```tsx
548: const ShippingStats: React.FC = () => {
549:     const crates = useAtomValue(shippingCratesAtom);
550:     const truckDims = useAtomValue(shippingTruckDimsAtom);
551:     const maxWeight = useAtomValue(truckMaxWeightAtom);
552:     const loaded = crates.filter(c => c.location === 'truck');
553:     const weight = loaded.reduce((s, c) => s + c.weight, 0);
554:     const pct = Math.min(100, Math.round((weight / maxWeight) * 100));
555:     const vol = loaded.reduce((s, c) => s + c.w * c.h * c.d, 0);
556:     const truckVol = truckDims.length * truckDims.width * truckDims.height;
557:     const volPct = truckVol > 0 ? Math.round((vol / truckVol) * 100) : 0;
558: 
559:     return (
560:         <div className="hidden lg:flex items-center gap-6 text-[12px] font-mono text-(--text-color)/40">
561:             <span className="flex items-center gap-2"><span className="text-(--text-color)/70 font-black text-sm">{loaded.length}</span> crates</span>
562:             <div className="flex items-center gap-2.5">
563:                 <div className="w-24 h-2 bg-(--text-color)/10 rounded-full overflow-hidden">
564:                     <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
565:                 </div>
566:                 <span>{pct}{tr("% wt")}</span>
567:             </div>
568:             <div className="flex items-center gap-1.5">
569:                 <div className="w-20 h-1.5 bg-(--text-color)/10 rounded-full overflow-hidden">
570:                     <div className="h-full bg-[#6BCEBB] rounded-full transition-all" style={{ width: `${volPct}%` }} />
571:                 </div>
572:                 <span>{volPct}{tr("% vol")}</span>
573:             </div>
574:         </div>
575:     );
576: };
577: 
578: 
579: /**
580:  * The info notch: a readout indented into the top-centre edge of the header,
581:  * the way an instrument is let into a panel rather than sitting on it.
582:  *
583:  * It absorbed two controls that used to be separate buttons. Pressing the
584:  * figures runs the database sync — the readout is what that sync updates, so
585:  * the number you want refreshed is the thing you press. The user block moved
586:  * in beside it and still opens Settings; it stops the notch from being a bare
587:  * strip of digits and gives the right half of it a purpose.
588:  */
```

## ToolButton (lines 694-719)
```tsx
694: const ToolButton: React.FC<{
695:     icon: any;
696:     label: string;
697:     onClick: () => void;
698:     active?: boolean;
699:     title?: string;
700:     disabled?: boolean;
701:     tone?: string;
702: }> = ({ icon: Icon, label, onClick, active, title, disabled, tone }) => (
703:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
704:         <button
705:             onClick={onClick}
706:             disabled={disabled}
707:             aria-pressed={active}
708:             title={title || label}
709:             className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
710:             style={active && tone ? { color: tone } : undefined}
711:         >
712:             <Icon size={18} strokeWidth={2.2} />
713:         </button>
714:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">
715:             {label}
716:         </span>
717:     </div>
718: );
719: 
```

## StoreBar (lines 912-974)
```tsx
912: const StoreBar: React.FC = () => {
913:     const [search, setSearch] = useAtom(storeSearchTermAtom);
914:     const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
915:     const vendorOptions = useAtomValue(storeVendorOptionsAtom);
916:     const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
917:     const [isSearchOpen, setIsSearchOpen] = useState(false);
918: 
919:     return (
920:         <div className={`flex flex-1 items-center gap-1 shrink-0 min-w-max ${isSearchOpen ? '' : 'sm:gap-2'}`}>
921:             <DeployableSearch 
922:                 value={search} 
923:                 onChange={setSearch} 
924:                 isOpen={isSearchOpen} 
925:                 setIsOpen={setIsSearchOpen} 
926:                 accentColor="var(--color-store)"
927:                 placeholder={tr("FIND ON STORE...")}
928:             />
929: 
930:             {!isSearchOpen && (
931:                 <>
932:                     <div className="flex items-center gap-1.5 py-1 pr-2 border-r border-white/5 mr-1 shrink-0">
933:                         {vendorOptions.map(v => {
934:                             const vColor = vendors[v as keyof typeof vendors]?.color || 'var(--text-color)';
935:                             const isActive = vendorFilter === v;
936:                             return (
937:                                 <button
938:                                     key={v}
939:                                     onClick={() => setVendorFilter(v)}
940:                                     className={`shrink-0 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.2em] transition-all border
941:                                         ${isActive 
942:                                             ? 'text-black shadow-lg' 
943:                                             : 'bg-white/3 border-white/3 text-(--text-color)/30 hover:text-(--text-color) hover:bg-white/10'}`}
944:                                     style={{ 
945:                                         borderColor: isActive ? vColor : (v !== 'All' ? `${vColor}40` : ''),
946:                                         backgroundColor: isActive ? vColor : '',
947:                                         color: isActive ? 'black' : (v !== 'All' ? vColor : '')
948:                                     }}
949:                                 >
950:                                     {v}
951:                                 </button>
952:                             );
953:                         })}
954:                     </div>
955: 
956:                     <div className="flex items-center gap-0.5 px-2">
957:                         <StudioAction 
958:                             icon={viewMode === 'grid' ? LayoutGrid : viewMode === 'gallery' ? Layout : LayoutList}
959:                             label={viewMode.toUpperCase()}
960:                             active={true}
961:                             onClick={() => {
962:                                 const modes: ('grid' | 'gallery' | 'list')[] = ['grid', 'gallery', 'list'];
963:                                 const nextIdx = (modes.indexOf(viewMode) + 1) % modes.length;
964:                                 setViewMode(modes[nextIdx]);
965:                             }}
966:                             color="var(--color-store)"
967:                         />
968:                     </div>
969:                 </>
970:             )}
971:         </div>
972:     );
973: };
974: 
```

## FinanceBar (lines 975-1032)
```tsx
975: const FinanceBar: React.FC = () => {
976:     const [search, setSearch] = useAtom(financeSearchTermAtom);
977:     const [isSearchOpen, setIsSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
978:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
979:     const [isActionOpen, setIsActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
980:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
981:     const toggleCurrency = () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN');
982:     const [isUpcomingOpen, setIsUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
983: 
984:     return (
985:         <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
986:             <button 
987:                 onClick={() => setIsSearchOpen(!isSearchOpen)}
988:                 className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isSearchOpen || search ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
989:                 title={tr("Search Payments")}
990:             >
991:                 <Search size={32} strokeWidth={2} />
992:             </button>
993: 
994:             <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
995:                 <button 
996:                     onClick={() => setIsFiltersOpen(!isFiltersOpen)}
997:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isFiltersOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
998:                     title={tr("Filter Payments")}
999:                 >
1000:                     <Filter size={32} strokeWidth={2} />
1001:                 </button>
1002:                 <button 
1003:                     onClick={() => setIsActionOpen(!isActionOpen)}
1004:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isActionOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
1005:                     title={tr("Settings & Logic")}
1006:                 >
1007:                     <SlidersHorizontal size={32} strokeWidth={2} />
1008:                 </button>
1009: 
1010:                 <button 
1011:                     onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
1012:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isUpcomingOpen ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-white/50 hover:text-white'}`}
1013:                     title={tr("Upcoming Payments")}
1014:                 >
1015:                     <Hourglass size={32} strokeWidth={2} className={isUpcomingOpen ? 'animate-pulse' : ''} />
1016:                 </button>
1017: 
1018:                 <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
1019: 
1020:                 <button 
1021:                     onClick={toggleCurrency}
1022:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 text-white/50 hover:text-white`}
1023:                     title={`Switch to ${currencyMode === 'MXN' ? 'USD' : 'MXN'}`}
1024:                 >
1025:                     <DollarSign size={32} strokeWidth={2} className={currencyMode === 'USD' ? 'text-emerald-400' : 'text-sky-400'} />
1026:                 </button>
1027:             </div>
1028:         </div>
1029:     );
1030: };
1031: 
1032: 
```

## LogisticsBar (lines 1033-1233)
```tsx
1033: const LogisticsBar: React.FC = () => {
1034:     const [activeView] = useAtom(activeViewAtom);
1035:     const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
1036:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1037:     const [isSearchOpen, setIsSearchOpen] = useState(false);
1038:     const [isPackingFiltersOpen, setIsPackingFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1039:     const setTruckReady = useSetAtom(truckReadyTriggerAtom);
1040:     const truckBusy = useAtomValue(truckIsBusyAtom);
1041:     const [truckView, setTruckView] = useAtom(truckViewModeAtom);
1042:     const [showPanels, setShowPanels] = useAtom(truckShowPanelsAtom);
1043:     const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
1044:     const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
1045:     const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
1046:     const setShowReadyWizard = useSetAtom(truckShowReadyWizardAtom);
1047: 
1048:     const setIsCrateModalOpen = useSetAtom(isCrateCreationModalOpenAtom);
1049:     const [isWarehouseSearchOpen, setIsWarehouseSearchOpen] = useState(false);
1050:     
1051:     const [isWarehouseSelectionMode, setIsWarehouseSelectionMode] = useAtom(isWarehouseSelectionModeAtom);
1052:     const warehouseSelectedIds = useAtomValue(warehouseSelectedIdsAtom);
1053:     const setShowWarehouseExportWizard = useSetAtom(showWarehouseExportWizardAtom);
1054: 
1055:     useEffect(() => {
1056:         if (activeView === 'warehouse' && (subTab === 'crates' || !['empty', 'packed', 'boxes', 'packing'].includes(subTab))) {
1057:             setSubTab('empty');
1058:         }
1059:     }, [activeView, subTab, setSubTab]);
1060: 
1061:     const tabs = activeView === 'warehouse' ? [
1062:         { id: 'empty', label: 'Empty', icon: 'package' },
1063:         { id: 'packed', label: 'Packed', icon: 'boxes' },
1064:         { id: 'packing', label: 'Packing', icon: 'package-open' },
1065:     ] : activeView === 'trucking' ? [
1066:         { id: 'shipping', label: 'PLAN', icon: 'truck' },
1067:         { id: 'deployed', label: 'DPLYD', icon: 'history' },
1068:     ] : [
1069:         { id: 'empty', label: 'Empty', icon: 'package' },
1070:         { id: 'packed', label: 'Packed', icon: 'boxes' },
1071:         { id: 'packing', label: 'Packing', icon: 'package-open' },
1072:         { id: 'shipping', label: 'TRK', icon: 'truck' },
1073:     ];
1074: 
1075:     return (
1076:         <div className="relative flex flex-1 items-center gap-1 sm:gap-4 ml-1">
1077:             {(activeView !== 'warehouse' && activeView !== 'trucking') && (
1078:                 <DeployableSearch 
1079:                     value={search} 
1080:                     onChange={setSearch} 
1081:                     isOpen={isSearchOpen} 
1082:                     setIsOpen={setIsSearchOpen} 
1083:                     accentColor="var(--color-logistics)"
1084:                     placeholder={tr("FIND CRATES...")}
1085:                 />
1086:             )}
1087: 
1088:             {(!isSearchOpen || activeView === 'warehouse' || activeView === 'trucking') && (
1089:                 <div className="flex items-center gap-4 animate-in fade-in duration-300">
1090:                     <SubTabPills
1091:                         tabs={tabs}
1092:                         active={subTab}
1093:                         onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
1094:                         accentColor="var(--color-logistics)"
1095:                     />
1096: 
1097:                     {activeView === 'warehouse' && (
1098:                         <>
1099:                             <div className="w-px h-6 bg-white/5 mx-1" />
1100:                             <button 
1101:                                 onClick={() => setIsCrateModalOpen(true)}
1102:                                 className="flex flex-col items-center justify-center w-16 h-16 text-(--main-color) hover:text-white transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/action"
1103:                                 title={tr("Initialize Storage Protocol")}
1104:                             >
1105:                                 <PackagePlus size={32} strokeWidth={2} className="group-hover/action:scale-110 transition-transform mb-1" />
1106:                                 <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("New Unit")}</span>
1107:                             </button>
1108:                             <button 
1109:                                 onClick={() => setIsWarehouseSearchOpen(!isWarehouseSearchOpen)}
1110:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/search ${isWarehouseSearchOpen || search ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1111:                                 title={tr("Search Units")}
1112:                             >
1113:                                 <Search size={32} strokeWidth={2} className="group-hover/search:scale-110 transition-transform mb-1" />
1114:                                 <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("Search")}</span>
1115:                             </button>
1116: 
1117:                             {subTab === 'packed' && (
1118:                                 <>
1119:                                     <div className="w-px h-6 bg-white/5 mx-1" />
1120:                                     <button 
1121:                                         onClick={() => {
1122:                                             if (isWarehouseSelectionMode) {
1123:                                                 // Clear selection when disabling
1124:                                                 setIsWarehouseSelectionMode(false);
1125:                                                 // In a real app we'd also clear the selected ids, but we only have a read-only view of it here.
1126:                                                 // Actually, let's just let the CratesInventoryView clear it if needed, or we can just hide it.
1127:                                             } else {
1128:                                                 setIsWarehouseSelectionMode(true);
1129:                                             }
1130:                                         }}
1131:                                         className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/select ${isWarehouseSelectionMode ? 'text-amber-500' : 'text-white/20 hover:text-white'}`}
1132:                                         title={isWarehouseSelectionMode ? 'Cancel Selection' : 'Select Crates'}
1133:                                     >
1134:                                         <FolderUp size={32} strokeWidth={2} className="group-hover/select:scale-110 transition-transform mb-1" />
1135:                                         <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("Select")}</span>
1136:                                     </button>
1137: 
1138:                                     {isWarehouseSelectionMode && warehouseSelectedIds.size > 0 && (
1139:                                         <button 
1140:                                             onClick={() => setShowWarehouseExportWizard(true)}
1141:                                             className="ml-2 flex items-center gap-2 px-6 py-2 rounded-xl transition-all font-black text-[10px] tracking-widest uppercase shadow-xl bg-amber-500 text-black hover:scale-105 active:scale-95 animate-in slide-in-from-left-4"
1142:                                         >
1143:                                             <Download size={24} strokeWidth={3} />
1144:                                             <span>Start Exportation ({warehouseSelectedIds.size})</span>
1145:                                         </button>
1146:                                     )}
1147:                                 </>
1148:                             )}
1149: 
1150:                             {isWarehouseSearchOpen && (
1151:                                 <div className="animate-in slide-in-from-left duration-300">
1152:                                     <DeployableSearch 
1153:                                         value={search} 
1154:                                         onChange={setSearch} 
1155:                                         isOpen={true} 
1156:                                         setIsOpen={setIsWarehouseSearchOpen} 
1157:                                         accentColor="var(--color-logistics)"
1158:                                         placeholder={tr("FIND UNITS...")}
1159:                                     />
1160:                                 </div>
1161:                             )}
1162:                         </>
1163:                     )}
1164: 
1165:                     {subTab === 'packing' && (
1166:                         <>
1167:                             <div className="w-px h-6 bg-white/5 mx-1" />
1168:                             <button 
1169:                                 onClick={() => setIsPackingFiltersOpen(!isPackingFiltersOpen)}
1170:                                 className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isPackingFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1171:                                 title={tr("Configuration")}
1172:                             >
1173:                                 <ListFilter size={32} />
1174:                             </button>
1175:                         </>
1176:                     )}
1177: 
1178:                     {(subTab === 'shipping' || subTab === 'deployed') && (
1179:                         <>
1180:                             <div className="w-px h-6 bg-white/5 mx-1" />
1181:                             <button
1182:                                 onClick={() => setShowPanels(s => !s)}
1183:                                 title={showPanels ? 'Hide all panels' : 'Show all panels'}
1184:                                 className={`flex items-center justify-center w-12 h-12 transition-all cursor-pointer rounded-2xl hover:bg-white/5 ${showPanels ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1185:                             >
1186:                                 {showPanels ? <PanelTopClose size={32} /> : <PanelTop size={32} />}
1187:                             </button>
1188:                         </>
1189:                     )}
1190: 
1191:                     {activeView === 'trucking' && (
1192:                         <>
1193:                             <div className="flex items-center gap-2 px-4 border-l border-white/5">
1194:                                 <button onClick={() => setShowOpenDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group" title={tr("Load Draft")}>
1195:                                     <Archive size={22} className="group-hover:scale-110 transition-transform" />
1196:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Drafts")}</span>
1197:                                 </button>
1198:                                 <button onClick={() => setShowSaveDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group px-2" title={tr("Save Draft")}>
1199:                                     <Save size={22} className="group-hover:scale-110 transition-transform" />
1200:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Save")}</span>
1201:                                 </button>
1202:                                 <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 text-white/30 hover:text-(--main-color) transition-all group pr-2" title={tr("Export Manifest")}>
1203:                                     <SlidersHorizontal size={22} className="group-hover:scale-110 transition-transform" />
1204:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Export")}</span>
1205:                                 </button>
1206:                                 <button 
1207:                                     disabled={truckBusy} 
1208:                                     onClick={() => setShowReadyWizard(true)} 
1209:                                     className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all font-black text-[9px] tracking-widest uppercase shadow-xl
1210:                                         ${truckBusy ? 'bg-white/5 text-white/20' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95'}`}
1211:                                 >
1212:                                     {truckBusy ? <Activity size={22} className="animate-spin" /> : <Truck size={22} strokeWidth={3} />}
1213:                                     <span className="hidden sm:block">{truckBusy ? tr("Processing...") : tr("Ready Truck")}</span>
1214:                                 </button>
1215:                             </div>
1216: 
1217:                             <div className="w-px h-6 bg-white/5 mx-1" />
1218:                             <button
1219:                                 onClick={() => setSubTab('crates')}
1220:                                 title={tr("Deployed Crates Library")}
1221:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer rounded-2xl hover:bg-white/5 group/library ${subTab === 'crates' ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1222:                             >
1223:                                 <SquareLibrary size={32} strokeWidth={1.5} className="group-hover/library:scale-110 transition-transform" />
1224:                                 <span className="text-[7px] font-black tracking-widest mt-1 opacity-40 group-hover/library:opacity-100 uppercase">{tr("Library")}</span>
1225:                             </button>
1226:                         </>
1227:                     )}
1228:                 </div>
1229:             )}
1230:         </div>
1231:     );
1232: };
1233: 
```

## PackingBar (lines 1234-1309)
```tsx
1234: const PackingBar: React.FC = () => {
1235:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1236:     const [isSearchOpen, setIsSearchOpen] = useState(false);
1237:     
1238:     const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
1239:     const [isPrintOpen, setIsPrintOpen] = useAtom(isPackingPrintWizardOpenAtom);
1240:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1241:     const setExportPDF = useSetAtom(packingExportPDFTriggerAtom);
1242:     const setExportXLSX = useSetAtom(packingExportXLSXTriggerAtom);
1243:     const setExportJSON = useSetAtom(packingExportJSONTriggerAtom);
1244:     const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
1245:     const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);
1246: 
1247:     const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : 'list');
1248:     const ViewIcon = viewMode === 'list' ? LayoutList : LayoutGrid;
1249: 
1250:     return (
1251:         <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
1252:             {selectedIds.size > 0 ? (
1253:                 <div className="flex items-center gap-6 animate-in slide-in-from-left duration-500 pr-4 border-r border-white/5 mr-2">
1254:                     <div className="flex flex-col">
1255:                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-(--main-color) whitespace-nowrap">
1256:                             {selectedIds.size} {tr("ARTIFACTS SELECTED")}
1257:                         </span>
1258:                         <button 
1259:                             onClick={() => setSelectedIds(new Set())} 
1260:                             className="text-[9px] font-bold underline uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity text-left"
1261:                         >
1262:                             {tr("Clear Selection")}
1263:                         </button>
1264:                     </div>
1265:                 </div>
1266:             ) : (
1267:                 <DeployableSearch 
1268:                     value={search} 
1269:                     onChange={setSearch} 
1270:                     isOpen={isSearchOpen} 
1271:                     setIsOpen={setIsSearchOpen} 
1272:                     accentColor="var(--main-color)"
1273:                     placeholder={tr("FIND INVENTORY...")}
1274:                 />
1275:             )}
1276: 
1277:             {!isSearchOpen && (
1278:                 <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
1279:                     <StudioAction 
1280:                         icon={ViewIcon}
1281:                         label={viewMode.toUpperCase()}
1282:                         active={true}
1283:                         onClick={cycleView}
1284:                         title={tr("Toggle View Mode")}
1285:                     />
1286:                     <button 
1287:                         onClick={() => setIsFiltersOpen(!isFiltersOpen)}
1288:                         className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1289:                         title={tr("Configuration")}
1290:                     >
1291:                         <ListFilter size={32} />
1292:                     </button>
1293: 
1294:                     <div className="w-px h-5 bg-white/10 mx-2" />
1295: 
1296:                     <StudioAction icon={Printer} label={tr("PRINT")} onClick={() => setIsPrintOpen(true)} title={tr("Generate High-Fidelity Labels")} />
1297:                     <StudioAction icon={QrCode} label="NFC" onClick={() => setIsNFCWizardOpen(true)} title={tr("Hardware Sync Handshake")} />
1298:                     
1299:                     <div className="w-px h-5 bg-white/10 mx-2" />
1300:                     
1301:                     <StudioAction icon={FileText} label="PDF" onClick={() => setExportPDF(1)} title={tr("Export PDF Catalog")} />
1302:                     <StudioAction icon={Table} label="XLSX" onClick={() => setExportXLSX(1)} title={tr("Export Spreadsheet")} />
1303:                     <StudioAction icon={Database} label="JSON" onClick={() => setExportJSON(1)} title={tr("Developer Data Dump")} />
1304:                 </div>
1305:             )}
1306:         </div>
1307:     );
1308: };
1309: 
```

## ProcessBar (lines 1310-1347)
```tsx
1310: const ProcessBar: React.FC = () => {
1311:     const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);
1312:     
1313:     return (
1314:         <div className="flex items-center gap-6 px-4 animate-in fade-in duration-500">
1315:             <button 
1316:                 onClick={() => setActiveTab('workspace')}
1317:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1318:                     ${activeTab === 'workspace' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1319:                 title={tr("Engine Workspace")}
1320:             >
1321:                 <Target size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1322:                 {activeTab === 'workspace' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1323:             </button>
1324:             <button 
1325:                 onClick={() => setActiveTab('vault')}
1326:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1327:                     ${activeTab === 'vault' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1328:                 title={tr("Inventory Vault")}
1329:             >
1330:                 <Library size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1331:                 {activeTab === 'vault' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1332:             </button>
1333:             <button 
1334:                 onClick={() => setActiveTab('batch')}
1335:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1336:                     ${activeTab === 'batch' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1337:                 title={tr("Batch Telemetry")}
1338:             >
1339:                 <FolderKanban size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1340:                 {activeTab === 'batch' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1341:             </button>
1342:         </div>
1343:     );
1344: };
1345: 
1346: // The Single / Batch switch is the page's own (CreateItem's Segmented); a
1347: // second copy here drove the same atom.
```

## UploadBar (lines 1348-1383)
```tsx
1348: const UploadBar: React.FC = () => {
1349:     const setItemData = useSetAtom(uploadItemDataAtom);
1350:     const [, setUploadWizardOpen] = useAtom(isUploadWizardOpenAtom);
1351:     const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);
1352: 
1353:     // The Add Entry screen as a modal (UploadWizard), on a clean slate. It
1354:     // takes every book; v326 is only the starting choice.
1355:     const openEntryModal = () => {
1356:         setItemData({ vendorId: '', workbook: 'v326' });
1357:         setUploadWizardOpen(true);
1358:     };
1359: 
1360:     return (
1361:         <div className="flex items-center gap-4 w-full">
1362:             <ModuleBadge icon="upload" label={tr("Add Entry")} color="var(--color-upload)" />
1363:             
1364:             <div className="flex items-center gap-1.5 ml-2">
1365:                 <StudioAction 
1366:                     icon={FolderUp}
1367:                     label={tr("Add Entry")}
1368:                     active={false}
1369:                     onClick={openEntryModal}
1370:                 />
1371:                 <div className="w-px h-6 bg-white/10 mx-2" />
1372:                 <StudioAction 
1373:                     icon={Brain}
1374:                     label={tr("AI PROCESSES")}
1375:                     active={aiEnabled}
1376:                     onClick={() => setAiEnabled(!aiEnabled)}
1377:                     color={aiEnabled ? '#38bdf8' : '#777'}
1378:                 />
1379:             </div>
1380:         </div>
1381:     );
1382: };
1383: 
```

## ControlBar (lines 1384-1395)
```tsx
1384: const ControlBar: React.FC = () => (
1385:     <>
1386:         <ModuleBadge icon="shield" label={tr("Control")} color="var(--color-control)" />
1387:         <div className="ml-auto">
1388:             <span className="text-[11px] font-black text-(--text-color)/15 uppercase tracking-widest">{tr("Developer Only")}</span>
1389:         </div>
1390:     </>
1391: );
1392: 
1393: 
1394: export function MainHeader() {
1395:     const [activeView, setView] = useAtom(activeViewAtom);
```

## MainHeader() left cluster: inline blocks per view (lines 4386-4433)
```tsx
4386:                     <div className="flex items-end gap-2 sm:gap-6 flex-nowrap min-w-max pr-4">
4387:                         {activeView === 'inventory' && !islandOn && <InventoryBar />}
4388:                         {activeView === 'store' && <StoreBar />}
4389:                         {activeView === 'finance' && <FinanceBar />}
4390:                         {(activeView === 'logistics' || activeView === 'warehouse' || activeView === 'trucking') && <LogisticsBar />}
4391:                         {activeView === 'packing' && <PackingBar />}
4392:                         {activeView === 'upload' && <UploadBar />}
4393:                         {activeView === 'process' && <ProcessBar />}
4394:                         {activeView === 'control' && <ControlBar />}
4395:                         {activeView === 'onyx' && <OnyxBar />}
4396:                         {isArchived && !islandOn && <ArchivedBar />}
4397:                         {activeView === 'overview' && (
4398:                             <div className="flex items-center gap-1 sm:gap-4">
4399:                                 <ModuleBadge icon="layout-dashboard" label="" color="var(--main-color)" />
4400:                                 <StudioAction 
4401:                                     icon={DollarSign}
4402:                                     label={currencyMode}
4403:                                     active={true}
4404:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4405:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
4406:                                 />
4407:                                 <StudioAction 
4408:                                     icon={Download}
4409:                                     label={tr("EXPORT")}
4410:                                     onClick={handleMasterExportXLSX}
4411:                                     disabled={isExporting}
4412:                                     className={isExporting ? 'animate-bounce' : ''}
4413:                                 />
4414:                             </div>
4415:                         )}
4416:                         {activeView === 'dashboard' && (
4417:                             <div className="flex items-center gap-1 sm:gap-4">
4418:                                 <ModuleBadge icon="layout-grid" label={tr("Analytics")} color="var(--color-analytics)" />
4419:                                 <StudioAction 
4420:                                     icon={DollarSign}
4421:                                     label={currencyMode}
4422:                                     active={true}
4423:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4424:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
4425:                                 />
4426:                             </div>
4427:                         )}
4428:                         {(activeView === 'create' || !activeView) && (
4429:                             <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
4430:                         )}
4431:                     </div>
4432:                 </div>
4433: 
```
